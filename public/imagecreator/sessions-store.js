import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { auth, db } from "../js/firebase-instance.js";
import { IMAGE_CREATOR_SESSION_COLLECTION } from "./constants.js";
import { createEmptySession, deriveSessionTitleFromPrompt, findSessionById } from "./state.js";

const MAX_FIRESTORE_SESSION_BYTES = 900 * 1024;

function estimateSerializedBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch (_) {
    return Number.MAX_SAFE_INTEGER;
  }
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortSessions(items = []) {
  return [...items].sort((a, b) => {
    const aMs = toMillis(a.updatedAt || a.createdAt);
    const bMs = toMillis(b.updatedAt || b.createdAt);
    return bMs - aMs;
  });
}

function normalizeSessionDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ownerId: String(data.ownerId || "").trim(),
    ownerEmail: String(data.ownerEmail || "").trim(),
    title: String(data.title || "").trim() || "Nueva sesión",
    archived: data.archived === true,
    lastPrompt: String(data.lastPrompt || "").trim(),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    session: {
      messages: Array.isArray(data?.session?.messages) ? data.session.messages : []
    }
  };
}

function compactMessageResult(result = {}) {
  return {
    id: String(result?.id || "").trim(),
    mimeType: String(result?.mimeType || "image/png").trim() || "image/png",
    model: String(result?.model || "").trim(),
    aspectRatio: String(result?.aspectRatio || "").trim(),
    imageSize: String(result?.imageSize || "1K").trim() || "1K",
    sourceMessageId: String(result?.sourceMessageId || "").trim(),
    createdAt: result?.createdAt || null,
    fileName: String(result?.fileName || "").trim(),
    width: Number(result?.width || 0) || 0,
    height: Number(result?.height || 0) || 0,
    sizeBytes: Number(result?.sizeBytes || 0) || 0,
    dataUrl: "",
    downloadUrl: String(result?.downloadUrl || "").trim(),
    storagePath: String(result?.storagePath || "").trim()
  };
}

function compactMessageAttachment(attachment = {}) {
  return {
    id: String(attachment?.id || "").trim(),
    name: String(attachment?.name || "referencia").trim() || "referencia",
    mimeType: String(attachment?.mimeType || "image/jpeg").trim() || "image/jpeg",
    dataUrl: "",
    width: Number(attachment?.width || 0) || 0,
    height: Number(attachment?.height || 0) || 0,
    sizeBytes: Math.min(Number(attachment?.sizeBytes || 0) || 0, 120000),
    source: String(attachment?.source || "upload").trim() || "upload",
    hiddenInChat: attachment?.hiddenInChat === true
  };
}

function compactImageCreatorMessagesForFirestore(messages = []) {
  const compacted = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const sanitized = message && typeof message === "object" ? { ...message } : {};
    if (Array.isArray(sanitized.attachments)) {
      sanitized.attachments = sanitized.attachments.map(compactMessageAttachment);
    }
    if (Array.isArray(sanitized.results)) {
      sanitized.results = sanitized.results.map(compactMessageResult);
    }
    compacted.push(sanitized);
  }

  const payloadBytes = () => estimateSerializedBytes({ session: { messages: compacted } });

  const compactResultData = (result) => ({
    ...compactMessageResult(result),
    fileName: "",
    width: Number(result?.width || 0) || 0,
    height: Number(result?.height || 0) || 0,
    sizeBytes: 0,
    downloadUrl: "",
    storagePath: ""
  });

  const compactAttachmentData = (attachment) => ({
    ...compactMessageAttachment(attachment),
    sizeBytes: 0,
    base64: "",
    inlineBase64: ""
  });

  const compactMessageData = (message) => {
    if (message && typeof message === "object") {
      message.options = {
        mode: String(message?.options?.mode || "generate").trim() || "generate",
        model: String(message?.options?.model || "").trim(),
        count: Number(message?.options?.count || 1) || 1
      };
      message.requestPrompt = "";
      message.error = "";
      message.note = "";
    }
  };

  while (payloadBytes() > MAX_FIRESTORE_SESSION_BYTES) {
    let reduced = false;

    for (const message of compacted) {
      if (Array.isArray(message.results) && message.results.length > 1) {
        message.results = message.results.slice(0, 1);
        reduced = true;
      }
    }
    if (reduced) continue;

    for (const message of compacted) {
      if (Array.isArray(message.attachments) && message.attachments.length > 1) {
        message.attachments = message.attachments.slice(0, 1);
        reduced = true;
      }
    }
    if (reduced) continue;

    for (const message of compacted) {
      if (Array.isArray(message.results)) {
        message.results = message.results.map(compactResultData);
        reduced = true;
      }
      if (Array.isArray(message.attachments)) {
        message.attachments = message.attachments.map(compactAttachmentData);
        reduced = true;
      }
    }
    if (reduced) continue;

    for (const message of compacted) {
      compactMessageData(message);
      reduced = true;
    }
    if (reduced) continue;

    for (const message of compacted) {
      if (typeof message.prompt === "string" && message.prompt.length > 1200) {
        message.prompt = `${message.prompt.slice(0, 1200)}…`;
        reduced = true;
      }
    }
    if (reduced) continue;

    for (const message of compacted) {
      if (typeof message.prompt === "string") {
        message.prompt = message.prompt.slice(0, 300);
        reduced = true;
      }
    }
    if (reduced) continue;

    break;
  }

  return compacted;
}

export function createImageCreatorSessionStore() {
  const baseCollection = collection(db, IMAGE_CREATOR_SESSION_COLLECTION);

  return {
    auth,
    async waitForUser() {
      if (auth.currentUser) return auth.currentUser;
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          unsub?.();
          reject(new Error("AUTH_REQUIRED"));
        }, 8000);
        const unsub = onAuthStateChanged(auth, (user) => {
          if (!user) return;
          window.clearTimeout(timeout);
          unsub();
          resolve(user);
        });
      });
    },
    subscribe(uid, onChange, onError) {
      return onSnapshot(
        query(baseCollection, where("ownerId", "==", uid)),
        (snapshot) => {
          const sessions = sortSessions(snapshot.docs.map(normalizeSessionDoc));
          onChange?.(sessions);
        },
        (error) => onError?.(error)
      );
    },
    async createSession(user, seed = {}) {
      const compactSeedMessages = await compactImageCreatorMessagesForFirestore(seed?.session?.messages || []);
      const payload = {
        ...createEmptySession(user.uid, user.email || ""),
        ...seed,
        title: String(seed?.title || "Nueva sesión").trim() || "Nueva sesión",
        session: {
          messages: compactSeedMessages
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(baseCollection, payload);
      return docRef.id;
    },
    async renameSession(sessionId, title = "") {
      await updateDoc(doc(db, IMAGE_CREATOR_SESSION_COLLECTION, sessionId), {
        title: String(title || "").trim() || "Nueva sesión",
        updatedAt: serverTimestamp()
      });
    },
    async archiveSession(sessionId, archived = true) {
      await updateDoc(doc(db, IMAGE_CREATOR_SESSION_COLLECTION, sessionId), {
        archived: archived === true,
        updatedAt: serverTimestamp()
      });
    },
    async deleteSession(sessionId) {
      await deleteDoc(doc(db, IMAGE_CREATOR_SESSION_COLLECTION, sessionId));
    },
    async persistSession(session) {
      if (!session?.id) throw new Error("session_id_required");
      const messages = await compactImageCreatorMessagesForFirestore(session?.session?.messages || []);
      const lastUserMessage = [...messages].reverse().find((message) => message?.role === "user") || null;
      const rawPrompt = String(lastUserMessage?.prompt || "").trim();
      const rawTitle = String(session?.title || deriveSessionTitleFromPrompt(rawPrompt, "Nueva sesión")).trim();

      const sanitizedPayload = {
        title: rawTitle.slice(0, 200) || "Nueva sesión",
        archived: session?.archived === true,
        lastPrompt: rawPrompt.slice(0, 4800),
        session: {
          messages: messages.slice(-25)
        },
        updatedAt: serverTimestamp()
      };

      if (session?.videoScriptData && typeof session.videoScriptData === "object") {
        sanitizedPayload.videoScriptData = {
          scenes: Array.isArray(session.videoScriptData.scenes) ? session.videoScriptData.scenes.slice(0, 50) : [],
          sceneImages: Array.isArray(session.videoScriptData.sceneImages)
            ? session.videoScriptData.sceneImages.map((img) => ({
                id: String(img?.id || "").slice(0, 50),
                sceneIndex: Number(img?.sceneIndex ?? 0),
                downloadUrl: String(img?.downloadUrl || "").slice(0, 2000),
                storagePath: String(img?.storagePath || "").slice(0, 1000),
                prompt: String(img?.prompt || "").slice(0, 1000),
                textoPantalla: String(img?.textoPantalla || "").slice(0, 200),
                approved: img?.approved === true,
                mimeType: String(img?.mimeType || "image/png").slice(0, 50)
              }))
            : [],
          scriptCharacter: session.videoScriptData.scriptCharacter ? {
            name: String(session.videoScriptData.scriptCharacter.name || "").slice(0, 100),
            description: String(session.videoScriptData.scriptCharacter.description || "").slice(0, 500),
            downloadUrl: String(session.videoScriptData.scriptCharacter.downloadUrl || "").slice(0, 2000),
            storagePath: String(session.videoScriptData.scriptCharacter.storagePath || "").slice(0, 1000),
            approved: session.videoScriptData.scriptCharacter.approved === true
          } : null,
          characterConsistent: session.videoScriptData.characterConsistent === true
        };
      }

      try {
        await updateDoc(doc(db, IMAGE_CREATOR_SESSION_COLLECTION, session.id), sanitizedPayload);
      } catch (err) {
        console.warn("[sessions-store] Error actualizando sesión en Firestore:", err);
        if (session.ownerId && /not-found|permission-denied/i.test(err?.code || err?.message || "")) {
          try {
            await setDoc(doc(db, IMAGE_CREATOR_SESSION_COLLECTION, session.id), {
              ownerId: session.ownerId,
              ownerEmail: String(session.ownerEmail || "").trim(),
              createdAt: serverTimestamp(),
              ...sanitizedPayload
            }, { merge: true });
          } catch (fallbackErr) {
            console.warn("[sessions-store] Fallback setDoc error:", fallbackErr);
            throw fallbackErr;
          }
        } else {
          throw err;
        }
      }
    },
    findById(sessions, sessionId) {
      return findSessionById(sessions, sessionId);
    }
  };
}
