import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { auth, db } from "../js/firebase-instance.js";
import {
  IMAGE_CREATOR_SESSION_COLLECTION,
  MAX_HISTORY_MESSAGES
} from "./constants.js";
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

function compactMessages(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  return list.slice(-MAX_HISTORY_MESSAGES);
}

async function compactImageCreatorMessagesForFirestore(messages = []) {
  const list = compactMessages(messages);
  const compacted = [];
  for (const message of list) {
    const nextMessage = message && typeof message === "object" ? { ...message } : {};
    if (Array.isArray(nextMessage.attachments)) {
      nextMessage.attachments = nextMessage.attachments.map((attachment) => ({
        id: String(attachment?.id || "").trim(),
        name: String(attachment?.name || "referencia").trim() || "referencia",
        mimeType: String(attachment?.mimeType || "image/jpeg").trim() || "image/jpeg",
        dataUrl: String(
          attachment?.inlineBase64
            ? `data:${String(attachment?.mimeType || "image/jpeg").trim() || "image/jpeg"};base64,${String(attachment.inlineBase64).trim()}`
            : attachment?.dataUrl || attachment?.originalDataUrl || ""
        ).trim(),
        width: Number(attachment?.width || 0) || 0,
        height: Number(attachment?.height || 0) || 0,
        base64: "",
        inlineBase64: "",
        sizeBytes: Math.min(Number(attachment?.sizeBytes || 0) || 0, 120000),
        source: String(attachment?.source || "upload").trim() || "upload"
      }));
    }
    if (Array.isArray(nextMessage.results)) {
      nextMessage.results = nextMessage.results.map((result) => ({
        id: String(result?.id || "").trim(),
        mimeType: String(result?.mimeType || "image/png").trim() || "image/png",
        model: String(result?.model || "").trim(),
        aspectRatio: String(result?.aspectRatio || "1:1").trim() || "1:1",
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
      }));
    }
    compacted.push(nextMessage);
  }

  while (
    compacted.length > 1 &&
    estimateSerializedBytes({ session: { messages: compacted } }) > MAX_FIRESTORE_SESSION_BYTES
  ) {
    compacted.shift();
  }

  while (estimateSerializedBytes({ session: { messages: compacted } }) > MAX_FIRESTORE_SESSION_BYTES) {
    let reduced = false;
    for (const message of compacted) {
      if (Array.isArray(message.results) && message.results.length > 1) {
        message.results = message.results.slice(0, 1);
        reduced = true;
      }
      if (Array.isArray(message.attachments) && message.attachments.length > 1) {
        message.attachments = message.attachments.slice(0, 1);
        reduced = true;
      }
      if (reduced) break;
    }
    if (!reduced) {
      for (const message of compacted) {
        if (Array.isArray(message.results)) {
          message.results = message.results.map((result) => ({
            ...result,
            dataUrl: "",
            sizeBytes: 0
          }));
        }
        if (Array.isArray(message.attachments)) {
          message.attachments = message.attachments.map((attachment) => ({
            ...attachment,
            dataUrl: "",
            sizeBytes: 0
          }));
        }
      }
      break;
    }
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
      await updateDoc(doc(db, IMAGE_CREATOR_SESSION_COLLECTION, session.id), {
        title: session?.title || deriveSessionTitleFromPrompt(lastUserMessage?.prompt || "", "Nueva sesión"),
        archived: session?.archived === true,
        lastPrompt: String(lastUserMessage?.prompt || "").trim(),
        session: {
          messages
        },
        updatedAt: serverTimestamp()
      });
    },
    findById(sessions, sessionId) {
      return findSessionById(sessions, sessionId);
    }
  };
}
