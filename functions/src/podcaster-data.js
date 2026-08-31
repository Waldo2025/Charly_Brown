const crypto = require("node:crypto");
const path = require("node:path");
const {
  getAdminServices,
  resolveAuthContext,
  asyncRoute,
  isPrivilegedRole
} = require("./common.js");
const { validateIdentifier, sanitizeSegment } = require("./uploads.js");

const MAX_SESSION_BYTES = 900 * 1024;

function text(value, max = 500, fallback = "") {
  const clean = String(value ?? fallback).trim();
  return clean.slice(0, max) || fallback;
}

function number(value, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toIso(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value?.toDate) return value.toDate().toISOString();
  return "";
}

function proxyUrl(storagePath, image = false) {
  const route = image ? "proxy-image" : "proxy-media";
  return `/api/assets/${route}?storagePath=${encodeURIComponent(String(storagePath || ""))}`;
}

function normalizePodcasterStoragePath(value = "") {
  let clean = text(value, 900);
  if (clean.startsWith("gs://")) clean = clean.replace(/^gs:\/\/[^/]+\//i, "");
  return clean.startsWith("podcaster/") ? clean : "";
}

function withoutLegacyRenderUrl(value = "") {
  const clean = text(value, 3000);
  return /(?:^|\.)onrender\.com(?:\/|$)/i.test((() => {
    try { return new URL(clean).hostname; } catch (_) { return ""; }
  })()) ? "" : clean;
}

function safeSession(source = {}) {
  const clean = JSON.parse(JSON.stringify(source && typeof source === "object" ? source : {}));
  clean.id = text(clean.id || `session_${crypto.randomUUID().slice(0, 12)}`, 180);
  clean.title = text(clean.title || "Sin título", 240, "Sin título");
  clean.updatedAt = text(clean.updatedAt || new Date().toISOString(), 64);
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > MAX_SESSION_BYTES) {
    throw Object.assign(new Error("podcaster_session_too_large"), { status: 413 });
  }
  return clean;
}

function resolveSessionAcademicMetadata(data = {}) {
  const nested = data?.session && typeof data.session === "object" ? data.session : {};
  const rootAcademic = data?.academicMetadata && typeof data.academicMetadata === "object" ? data.academicMetadata : {};
  const nestedAcademic = nested?.academicMetadata && typeof nested.academicMetadata === "object" ? nested.academicMetadata : {};
  const resolveField = (field) => text(
    data?.[field] || rootAcademic?.[field] || nested?.[field] || nestedAcademic?.[field] || "",
    field === "materia" ? 120 : 60
  );
  const nivel = resolveField("nivel");
  return {
    nivel,
    grado: resolveField("grado"),
    trimestre: resolveField("trimestre"),
    unidad: resolveField("unidad"),
    materia: resolveField("materia"),
    unitLabel: text(rootAcademic.unitLabel || nestedAcademic.unitLabel || data.academicMetadataUnitLabel || nested.academicMetadataUnitLabel || (nivel.toLowerCase() === "secundaria" ? "Tema" : "Unidad"), 80)
  };
}

function resolveUpdatedAtMs(value = null) {
  if (value?.toDate && typeof value.toDate === "function") return value.toDate().getTime();
  if (Number.isFinite(Number(value?.seconds))) return (Number(value.seconds) * 1000) + (Number(value.nanoseconds || 0) / 1e6);
  return Date.parse(String(value || ""));
}

function isManualSceneReplacement(entry = null) {
  const sourceType = String(entry?.sourceType || entry?.replacementSource || "").trim().toLowerCase();
  return entry?.manuallyReplaced === true || sourceType === "manual-replacement" || sourceType === "manual";
}

function mergeMediaMapByEntryUpdatedAt(currentMap = {}, incomingMap = {}) {
  const current = currentMap && typeof currentMap === "object" ? currentMap : {};
  const incoming = incomingMap && typeof incomingMap === "object" ? incomingMap : {};
  const next = {};
  const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
  keys.forEach((key) => {
    const currentEntry = current[key];
    const incomingEntry = incoming[key];
    if (!currentEntry || typeof currentEntry !== "object") {
      if (incomingEntry !== undefined) next[key] = incomingEntry;
      return;
    }
    if (!incomingEntry || typeof incomingEntry !== "object") {
      next[key] = currentEntry;
      return;
    }
    const currentIsManual = isManualSceneReplacement(currentEntry);
    const incomingIsManual = isManualSceneReplacement(incomingEntry);
    if (currentIsManual !== incomingIsManual) {
      next[key] = currentIsManual ? currentEntry : incomingEntry;
      return;
    }
    const currentUpdatedAt = resolveUpdatedAtMs(currentEntry.updatedAt);
    const incomingUpdatedAt = resolveUpdatedAtMs(incomingEntry.updatedAt);
    next[key] = Number.isFinite(currentUpdatedAt)
      && (!Number.isFinite(incomingUpdatedAt) || currentUpdatedAt >= incomingUpdatedAt)
      ? currentEntry
      : incomingEntry;
  });
  return next;
}

function reconcileDialogueVideoState(currentSession = {}, incomingSession = {}) {
  const currentDeleted = currentSession?.dialogueVideoDeletedAtMap && typeof currentSession.dialogueVideoDeletedAtMap === "object" ? currentSession.dialogueVideoDeletedAtMap : {};
  const incomingDeleted = incomingSession?.dialogueVideoDeletedAtMap && typeof incomingSession.dialogueVideoDeletedAtMap === "object" ? incomingSession.dialogueVideoDeletedAtMap : {};
  const deletedAtMap = { ...currentDeleted };
  Object.entries(incomingDeleted).forEach(([rowId, value]) => {
    const currentMs = resolveUpdatedAtMs(deletedAtMap[rowId]);
    const incomingMs = resolveUpdatedAtMs(value);
    if (!Number.isFinite(currentMs) || (Number.isFinite(incomingMs) && incomingMs > currentMs)) deletedAtMap[rowId] = value;
  });
  const dialogueVideoMap = mergeMediaMapByEntryUpdatedAt(currentSession?.dialogueVideoMap || {}, incomingSession?.dialogueVideoMap || {});
  Object.entries(deletedAtMap).forEach(([rowId, deletedAt]) => {
    const deletedMs = resolveUpdatedAtMs(deletedAt);
    const mediaMs = resolveUpdatedAtMs(dialogueVideoMap[rowId]?.updatedAt);
    if (Number.isFinite(deletedMs) && (!Number.isFinite(mediaMs) || deletedMs >= mediaMs)) delete dialogueVideoMap[rowId];
  });
  return { dialogueVideoMap, dialogueVideoDeletedAtMap: deletedAtMap };
}

function sessionAccess(data, authContext) {
  const ownerId = text(data?.ownerId, 180);
  const shared = Array.isArray(data?.sharedWithIds) ? data.sharedWithIds.map(String) : [];
  return ownerId === authContext.uid || shared.includes(authContext.uid) || isPrivilegedRole(authContext.role);
}

function resolveSessionMediaIdentity(storagePath = "", metadata = {}, rowIdByStoragePath = new Map(), rowIdByGeneratedJobId = new Map()) {
  const cleanPath = String(storagePath || "").trim();
  const parts = cleanPath.split("/");
  const familyIndex = Math.max(parts.indexOf("videos"), parts.indexOf("audio"), parts.indexOf("music"));
  const generatedIndex = parts.indexOf("dialogue-video");
  const generatedJobId = generatedIndex >= 0 ? String(parts[generatedIndex + 1] || "") : "";
  const rawName = parts.at(-1) || cleanPath;
  const metadataRowId = String(metadata?.metadata?.rowId || "").trim();
  const resolvedRowId = metadataRowId
    || String(rowIdByStoragePath.get(cleanPath) || "").trim()
    || String(rowIdByGeneratedJobId.get(generatedJobId) || "").trim()
    || (familyIndex >= 0 ? String(parts[familyIndex + 1] || "") : "");
  const displayName = /^sample_\d+\.[a-z0-9]+$/i.test(rawName) && generatedJobId
    ? `${generatedJobId}.${rawName.split(".").pop() || "mp4"}`
    : rawName;
  return {
    id: String(metadata?.metadata?.jobId || generatedJobId || cleanPath),
    name: displayName,
    originalName: rawName,
    rowFolder: resolvedRowId,
    rowId: resolvedRowId
  };
}

function normalizeLibraryItem(doc) {
  const data = typeof doc?.data === "function" ? doc.data() || {} : doc || {};
  const libraryId = text(doc?.id || data.libraryId || data.id, 180);
  if (!libraryId) return null;
  const storagePath = normalizePodcasterStoragePath(data.storagePath);
  const thumbStoragePath = normalizePodcasterStoragePath(data.thumbStoragePath || data.thumbnailStoragePath);
  const mimeType = text(data.mimeType || "video/mp4", 120, "video/mp4");
  const downloadUrl = withoutLegacyRenderUrl(data.downloadUrl) || (storagePath ? proxyUrl(storagePath) : "");
  const thumbUrl = withoutLegacyRenderUrl(data.thumbUrl || data.thumbnailUrl)
    || (thumbStoragePath ? proxyUrl(thumbStoragePath, true) : "")
    || (mimeType.startsWith("image/") ? downloadUrl : "");
  return {
    libraryId,
    publicSceneLibraryId: libraryId,
    title: text(data.title || data.name || "Escena pública", 180, "Escena pública"),
    sourceSessionId: text(data.sourceSessionId, 180),
    sourceRowId: text(data.sourceRowId, 180),
    sourceRowNumber: Math.max(0, Math.round(number(data.sourceRowNumber))),
    ownerId: text(data.ownerId, 180),
    ownerEmail: text(data.ownerEmail, 240),
    durationSec: number(data.durationSec, 0, 600),
    downloadUrl,
    storagePath,
    mimeType,
    thumbUrl,
    thumbStoragePath,
    thumbMimeType: text(data.thumbMimeType || "image/jpeg", 120, "image/jpeg"),
    sceneDescription: text(data.sceneDescription, 1200),
    onScreenText: text(data.onScreenText, 500),
    transition: text(data.transition, 500),
    visualNotes: text(data.visualNotes, 1200),
    videoDirective: text(data.videoDirective, 1400),
    scenePrompt: text(data.scenePrompt, 1200),
    voiceOverText: text(data.voiceOverText, 4000),
    tagLabel: text(data.tagLabel, 120),
    tagColor: text(data.tagColor || "slate", 40, "slate"),
    imagePrompts: Array.isArray(data.imagePrompts) ? data.imagePrompts.slice(0, 3).map((item) => text(item, 1200)).filter(Boolean) : [],
    videoPreset: text(data.videoPreset || "creative", 40, "creative"),
    sourceType: text(data.sourceType, 80),
    originalName: text(data.originalName, 220),
    size: Math.max(0, Math.round(number(data.size))),
    createdAt: text(data.createdAt, 64),
    updatedAt: text(data.updatedAt, 64),
    publicScenePublishedAt: text(data.publicScenePublishedAt || data.updatedAt || data.createdAt, 64)
  };
}

async function requireFinalizedUpload({ db, uploadId, authContext, expectedKind }) {
  const id = text(uploadId, 80);
  const snapshot = await db.collection("podcaster_upload_sessions").doc(id).get();
  if (!snapshot.exists) throw Object.assign(new Error("upload_session_not_found"), { status: 404 });
  const upload = snapshot.data() || {};
  if (text(upload.ownerId, 180) !== authContext.uid) throw Object.assign(new Error("upload_session_forbidden"), { status: 403 });
  if (text(upload.status, 40) !== "finalized") throw Object.assign(new Error("upload_not_finalized"), { status: 409 });
  if (expectedKind && text(upload.kind, 80) !== expectedKind) throw Object.assign(new Error("upload_kind_mismatch"), { status: 400 });
  return upload;
}

async function copyPublicAsset({ bucket, sourcePath, destinationPath }) {
  const source = bucket.file(sourcePath);
  const [exists] = await source.exists();
  if (!exists) throw Object.assign(new Error("source_asset_not_found"), { status: 404 });
  await source.copy(bucket.file(destinationPath));
  const [metadata] = await bucket.file(destinationPath).getMetadata();
  return { storagePath: destinationPath, mimeType: text(metadata.contentType, 120, "application/octet-stream"), size: Number(metadata.size || 0) };
}

function registerSessionRoutes(app) {
  app.post("/api/podcaster/sessions/save", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const session = safeSession(req.body?.session);
    const { db, admin } = getAdminServices();
    const ref = db.collection("podcaster_sessions").doc(session.id);
    let committedSession = session;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const existing = snapshot.exists ? snapshot.data() || {} : {};
      if (snapshot.exists && text(existing.ownerId, 180) !== authContext.uid) {
        throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
      }
      const currentSession = existing.session && typeof existing.session === "object" ? existing.session : {};
      const reconciledVideoState = reconcileDialogueVideoState(currentSession, session);
      committedSession = {
        ...session,
        ...reconciledVideoState
      };
      transaction.set(ref, {
        ownerId: authContext.uid,
        title: session.title,
        archived: session.archived === true,
        publicar: session.publicar === true,
        sessionUpdatedAt: session.updatedAt,
        session: committedSession,
        sharedWithIds: Array.isArray(existing.sharedWithIds) ? existing.sharedWithIds : [],
        sharedWith: Array.isArray(existing.sharedWith) ? existing.sharedWith : [],
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    res.status(200).json({ ok: true, sessionId: session.id, ownerId: authContext.uid, savedAt: new Date().toISOString(), session: committedSession });
  }));

  app.get("/api/podcaster/sessions/list", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const [owned, shared] = await Promise.all([
      db.collection("podcaster_sessions").where("ownerId", "==", authContext.uid).limit(80).get(),
      db.collection("podcaster_sessions").where("sharedWithIds", "array-contains", authContext.uid).limit(80).get()
    ]);
    const merged = new Map();
    [...owned.docs, ...shared.docs].forEach((doc) => {
      const data = doc.data() || {};
      const nested = data.session && typeof data.session === "object" ? data.session : {};
      const videoContentType = text(nested?.script?.videoContentType || nested.videoContentType, 80).toLowerCase();
      const academicMetadata = resolveSessionAcademicMetadata(data);
      merged.set(doc.id, {
        id: doc.id,
        title: text(data.title || nested.title || "Sin título", 240, "Sin título"),
        updatedAt: text(data.sessionUpdatedAt || nested.updatedAt || toIso(data.updatedAt), 64),
        archived: data.archived === true,
        publicar: data.publicar === true,
        ...academicMetadata,
        academicMetadata,
        podcastStudioUiState: nested.podcastStudioUiState && typeof nested.podcastStudioUiState === "object" ? nested.podcastStudioUiState : null,
        videoContentType: videoContentType || null,
        isStub: true,
        script: { rows: [], videoContentType: videoContentType || null },
        cloudMeta: { ownerId: text(data.ownerId, 180) || null, savedAt: toIso(data.updatedAt) || null }
      });
    });
    const sessions = [...merged.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.status(200).json({ ok: true, sessions });
  }));

  app.get("/api/podcaster/sessions/get", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const sessionId = validateIdentifier(req.query?.sessionId || req.query?.id || "", { name: "session_id" });
    const { db } = getAdminServices();
    const snapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
    if (!snapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
    const data = snapshot.data() || {};
    if (!sessionAccess(data, authContext)) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
    const nested = data.session && typeof data.session === "object" ? data.session : {};
    const academicMetadata = resolveSessionAcademicMetadata(data);
    res.status(200).json({
      ok: true,
      session: {
        ...nested,
        id: snapshot.id,
        title: text(data.title || nested.title || "Sin título", 240, "Sin título"),
        updatedAt: text(data.sessionUpdatedAt || nested.updatedAt || toIso(data.updatedAt) || new Date().toISOString(), 64),
        archived: data.archived === true,
        publicar: data.publicar === true,
        ...academicMetadata,
        academicMetadata,
        isStub: false,
        cloudMeta: { ownerId: text(data.ownerId, 180) || null, savedAt: toIso(data.updatedAt) || null }
      }
    });
  }));

  app.post("/api/podcaster/sessions/share", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const sessionId = validateIdentifier(req.body?.sessionId || "", { name: "session_id" });
    const { db, auth, admin } = getAdminServices();
    const target = req.body?.targetUid
      ? await auth.getUser(text(req.body.targetUid, 180))
      : await auth.getUserByEmail(text(req.body?.targetEmail, 240).toLowerCase());
    if (target.uid === authContext.uid) throw Object.assign(new Error("cannot_share_with_self"), { status: 400 });
    const ref = db.collection("podcaster_sessions").doc(sessionId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
      const data = snapshot.data() || {};
      if (text(data.ownerId, 180) !== authContext.uid) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
      const ids = new Set(Array.isArray(data.sharedWithIds) ? data.sharedWithIds.map(String) : []);
      ids.add(target.uid);
      const entries = (Array.isArray(data.sharedWith) ? data.sharedWith : []).filter((item) => text(item?.uid, 180) !== target.uid);
      entries.push({ uid: target.uid, email: target.email || null, sharedAt: new Date().toISOString(), sharedBy: authContext.uid });
      transaction.update(ref, { sharedWithIds: [...ids], sharedWith: entries, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    res.status(200).json({ ok: true, sessionId, target: { uid: target.uid, email: target.email || null } });
  }));

  app.post("/api/podcaster/sessions/delete", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const sessionId = validateIdentifier(req.body?.sessionId || "", { name: "session_id" });
    const { db } = getAdminServices();
    const ref = db.collection("podcaster_sessions").doc(sessionId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(200).json({ ok: true, sessionId, deleted: false, reason: "not_found" });
    if (text(snapshot.data()?.ownerId, 180) !== authContext.uid) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
    await ref.delete();
    return res.status(200).json({ ok: true, sessionId, deleted: true });
  }));

  const listSessionMedia = (kind) => asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const sessionId = validateIdentifier(req.query?.sessionId || req.query?.sessionSlug || "", { name: "session_id" });
    const { db, bucket } = getAdminServices();
    const sessionSnapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
    if (!sessionSnapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
    if (!sessionAccess(sessionSnapshot.data(), authContext)) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
    const prefix = `podcaster/sessions/${sessionId}/`;
    const [files] = await bucket.getFiles({ prefix, maxResults: 600 });
    const sessionData = sessionSnapshot.data()?.session && typeof sessionSnapshot.data().session === "object"
      ? sessionSnapshot.data().session
      : sessionSnapshot.data() || {};
    const rowIdByStoragePath = new Map();
    Object.entries(sessionData.dialogueVideoMap || {}).forEach(([rowId, clip]) => {
      const paths = [clip?.storagePath, clip?.videoStoragePath, ...(Array.isArray(clip?.segments) ? clip.segments.map((segment) => segment?.storagePath) : [])];
      paths.map((value) => String(value || "").trim()).filter(Boolean).forEach((value) => rowIdByStoragePath.set(value, rowId));
    });
    const legacyGeneratedJobIds = [...new Set(files.map((file) => {
      const parts = String(file?.name || "").split("/");
      const generatedIndex = parts.indexOf("dialogue-video");
      return generatedIndex >= 0 ? String(parts[generatedIndex + 1] || "").trim() : "";
    }).filter((jobId) => /^[A-Za-z0-9._-]{1,180}$/.test(jobId)))];
    const rowIdByGeneratedJobId = new Map();
    if (legacyGeneratedJobIds.length) {
      const refs = legacyGeneratedJobIds.slice(0, 500).map((jobId) => db.collection("podcaster_ai_jobs").doc(jobId));
      const snapshots = await db.getAll(...refs).catch(() => []);
      snapshots.forEach((snapshot) => {
        if (!snapshot.exists) return;
        const job = snapshot.data() || {};
        if (String(job.sessionId || "") !== sessionId || String(job.type || "") !== "dialogue_video") return;
        const rowId = String(job?.input?.rowId || "").trim();
        if (rowId) rowIdByGeneratedJobId.set(snapshot.id, rowId);
      });
    }
    const media = [];
    for (const file of files) {
      const storagePath = String(file.name || "");
      if (kind === "videos" && (storagePath.toLowerCase().includes("/references/") || storagePath.toLowerCase().includes("/reference/"))) continue;
      const [metadata] = await file.getMetadata().catch(() => [{}]);
      const mimeType = String(metadata?.contentType || "").toLowerCase();
      const matches = kind === "videos" ? mimeType.startsWith("video/") : mimeType.startsWith("audio/");
      if (!matches) continue;
      const token = String(metadata?.metadata?.firebaseStorageDownloadTokens || "");
      const downloadUrl = token
        ? `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`
        : proxyUrl(storagePath, mimeType.startsWith("image/"));
      const mediaIdentity = resolveSessionMediaIdentity(storagePath, metadata, rowIdByStoragePath, rowIdByGeneratedJobId);
      media.push({
        ...mediaIdentity,
        storagePath,
        downloadUrl,
        mimeType,
        contentType: mimeType,
        type: mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "video",
        size: Number(metadata?.size || 0),
        updatedAt: String(metadata?.updated || metadata?.timeCreated || "") || null
      });
    }
    media.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    res.status(200).json({ ok: true, prefix, [kind]: media });
  });
  app.get("/api/podcaster/sessions/list-videos", listSessionMedia("videos"));
  app.get("/api/podcaster/sessions/list-audios", listSessionMedia("audios"));
}

function registerLibraryRoutes(app) {
  app.get("/api/podcaster/scene-library/list", asyncRoute(async (_req, res) => {
    const { db } = getAdminServices();
    const snapshot = await db.collection("podcaster_scene_library").orderBy("updatedAt", "desc").limit(250).get();
    res.status(200).json({ ok: true, items: snapshot.docs.map(normalizeLibraryItem).filter(Boolean) });
  }));

  app.post("/api/podcaster/scene-library/register-upload", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const upload = await requireFinalizedUpload({ db, uploadId: req.body?.uploadId, authContext, expectedKind: "library-video" });
    const thumbUpload = req.body?.thumbUploadId
      ? await requireFinalizedUpload({ db, uploadId: req.body.thumbUploadId, authContext, expectedKind: "library-image" })
      : null;
    const libraryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const item = {
      libraryId,
      ownerId: authContext.uid,
      ownerEmail: authContext.email || null,
      title: text(req.body?.title || upload.fileName || "Video local", 180, "Video local"),
      durationSec: number(req.body?.durationSec, 0, 600),
      storagePath: text(upload.storagePath, 900),
      downloadUrl: text(upload.media?.downloadUrl, 3000),
      mimeType: text(upload.contentType || "video/mp4", 120, "video/mp4"),
      thumbStoragePath: text(thumbUpload?.storagePath, 900),
      thumbUrl: text(thumbUpload?.media?.downloadUrl, 3000),
      thumbMimeType: text(thumbUpload?.contentType || "image/jpeg", 120, "image/jpeg"),
      sourceType: "local_upload",
      originalName: text(upload.fileName, 220),
      size: Number(upload.expectedSize || 0),
      tagLabel: "Local",
      tagColor: "sky",
      videoPreset: "local",
      createdAt: now,
      updatedAt: now
    };
    await db.collection("podcaster_scene_library").doc(libraryId).set(item);
    res.status(201).json({ ok: true, item: normalizeLibraryItem(item) });
  }));

  app.post("/api/podcaster/scene-library/publish", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const sessionId = validateIdentifier(req.body?.sessionId || "", { name: "session_id" });
    const sourcePath = text(req.body?.storagePath, 900);
    if (!sourcePath.startsWith(`podcaster/sessions/${sessionId}/`)) throw Object.assign(new Error("invalid_source_asset"), { status: 400 });
    const { db, bucket } = getAdminServices();
    const sessionSnapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
    if (!sessionSnapshot.exists || !sessionAccess(sessionSnapshot.data(), authContext)) throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
    const libraryId = text(req.body?.libraryId, 180) || crypto.randomUUID();
    const ext = path.extname(sourcePath).replace(/^\./, "") || "mp4";
    const copied = await copyPublicAsset({ bucket, sourcePath, destinationPath: `podcaster/library/scenes/${sanitizeSegment(libraryId)}/video.${ext}` });
    const now = new Date().toISOString();
    const item = {
      libraryId,
      sourceSessionId: sessionId,
      sourceRowId: text(req.body?.rowId, 180),
      ownerId: authContext.uid,
      ownerEmail: authContext.email || null,
      title: text(req.body?.title || "Escena pública", 180, "Escena pública"),
      durationSec: number(req.body?.durationSec, 0, 600),
      storagePath: copied.storagePath,
      mimeType: copied.mimeType,
      sceneDescription: text(req.body?.sceneDescription, 1200),
      onScreenText: text(req.body?.onScreenText, 500),
      transition: text(req.body?.transition, 500),
      visualNotes: text(req.body?.visualNotes, 1200),
      videoDirective: text(req.body?.videoDirective, 1400),
      scenePrompt: text(req.body?.scenePrompt, 1200),
      voiceOverText: text(req.body?.voiceOverText, 4000),
      tagLabel: text(req.body?.tagLabel, 120),
      tagColor: text(req.body?.tagColor || "slate", 40, "slate"),
      imagePrompts: Array.isArray(req.body?.imagePrompts) ? req.body.imagePrompts.slice(0, 3).map((entry) => text(entry, 1200)).filter(Boolean) : [],
      videoPreset: text(req.body?.videoPreset || "creative", 40, "creative"),
      createdAt: now,
      updatedAt: now
    };
    await db.collection("podcaster_scene_library").doc(libraryId).set(item, { merge: true });
    res.status(200).json({ ok: true, item: normalizeLibraryItem(item) });
  }));

  app.post("/api/podcaster/scene-library/update", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const libraryId = validateIdentifier(req.body?.libraryId || "", { name: "library_id" });
    const { db } = getAdminServices();
    const ref = db.collection("podcaster_scene_library").doc(libraryId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("scene_library_not_found"), { status: 404 });
    if (text(snapshot.data()?.ownerId, 180) !== authContext.uid && !isPrivilegedRole(authContext.role)) throw Object.assign(new Error("scene_library_forbidden"), { status: 403 });
    await ref.set({ title: text(req.body?.title, 180, "Escena pública"), tagLabel: text(req.body?.tagLabel, 120), tagColor: text(req.body?.tagColor || "slate", 40, "slate"), updatedAt: new Date().toISOString() }, { merge: true });
    const updated = await ref.get();
    res.status(200).json({ ok: true, item: normalizeLibraryItem(updated) });
  }));

  app.post("/api/podcaster/scene-library/delete", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const libraryId = validateIdentifier(req.body?.libraryId || "", { name: "library_id" });
    const { db, bucket } = getAdminServices();
    const ref = db.collection("podcaster_scene_library").doc(libraryId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("scene_library_not_found"), { status: 404 });
    const data = snapshot.data() || {};
    if (text(data.ownerId, 180) !== authContext.uid && !isPrivilegedRole(authContext.role)) throw Object.assign(new Error("scene_library_forbidden"), { status: 403 });
    await ref.delete();
    await Promise.all([data.storagePath, data.thumbStoragePath].filter(Boolean).map((item) => bucket.file(String(item)).delete({ ignoreNotFound: true }).catch(() => {})));
    res.status(200).json({ ok: true, libraryId });
  }));

  app.get("/api/podcaster/music/library/list", asyncRoute(async (_req, res) => {
    const { db } = getAdminServices();
    const snapshot = await db.collection("podcaster_music_library").orderBy("updatedAt", "desc").limit(250).get();
    const tracks = snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      const storagePath = normalizePodcasterStoragePath(data.storagePath);
      return { libraryId: doc.id, name: text(data.name || "Audio", 180, "Audio"), mimeType: text(data.mimeType || "audio/mpeg", 120, "audio/mpeg"), size: Number(data.size || 0), durationSec: number(data.durationSec, 0, 1800), downloadUrl: withoutLegacyRenderUrl(data.downloadUrl) || (storagePath ? proxyUrl(storagePath) : ""), storagePath, updatedAt: text(data.updatedAt, 64), ownerId: text(data.ownerId, 180), ownerEmail: text(data.ownerEmail, 240) };
    });
    res.status(200).json({ ok: true, tracks });
  }));

  app.post("/api/podcaster/music/library/register-upload", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const upload = await requireFinalizedUpload({ db, uploadId: req.body?.uploadId, authContext, expectedKind: "library-music" });
    const libraryId = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    const track = { libraryId, name: text(req.body?.fileName || upload.fileName || "Audio", 180, "Audio"), mimeType: text(upload.contentType || "audio/mpeg", 120, "audio/mpeg"), size: Number(upload.expectedSize || 0), durationSec: number(req.body?.durationSec, 0, 1800), downloadUrl: text(upload.media?.downloadUrl, 3000), storagePath: text(upload.storagePath, 900), updatedAt, ownerId: authContext.uid, ownerEmail: authContext.email || null };
    await db.collection("podcaster_music_library").doc(libraryId).set(track);
    res.status(201).json({ ok: true, track: { ...track, downloadUrl: proxyUrl(track.storagePath) } });
  }));

  app.post("/api/podcaster/music/library/delete", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const libraryId = validateIdentifier(req.body?.libraryId || "", { name: "library_id" });
    const { db, bucket } = getAdminServices();
    const ref = db.collection("podcaster_music_library").doc(libraryId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("music_library_not_found"), { status: 404 });
    const data = snapshot.data() || {};
    if (text(data.ownerId, 180) !== authContext.uid && !isPrivilegedRole(authContext.role)) throw Object.assign(new Error("music_library_forbidden"), { status: 403 });
    await ref.delete();
    if (data.storagePath) await bucket.file(String(data.storagePath)).delete({ ignoreNotFound: true }).catch(() => {});
    res.status(200).json({ ok: true, libraryId });
  }));
}

function registerPodcasterDataRoutes(app) {
  registerSessionRoutes(app);
  registerLibraryRoutes(app);
}

module.exports = {
  MAX_SESSION_BYTES,
  safeSession,
  resolveSessionAcademicMetadata,
  sessionAccess,
  resolveSessionMediaIdentity,
  normalizeLibraryItem,
  registerPodcasterDataRoutes
};
