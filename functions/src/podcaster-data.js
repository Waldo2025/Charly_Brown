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

function sessionAccess(data, authContext) {
  const ownerId = text(data?.ownerId, 180);
  const shared = Array.isArray(data?.sharedWithIds) ? data.sharedWithIds.map(String) : [];
  return ownerId === authContext.uid || shared.includes(authContext.uid) || isPrivilegedRole(authContext.role);
}

function normalizeLibraryItem(doc) {
  const data = typeof doc?.data === "function" ? doc.data() || {} : doc || {};
  const libraryId = text(doc?.id || data.libraryId || data.id, 180);
  if (!libraryId) return null;
  const storagePath = text(data.storagePath, 900);
  const thumbStoragePath = text(data.thumbStoragePath || data.thumbnailStoragePath, 900);
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
    downloadUrl: text(data.downloadUrl, 3000) || (storagePath ? proxyUrl(storagePath) : ""),
    storagePath,
    mimeType: text(data.mimeType || "video/mp4", 120, "video/mp4"),
    thumbUrl: text(data.thumbUrl || data.thumbnailUrl, 3000) || (thumbStoragePath ? proxyUrl(thumbStoragePath, true) : ""),
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
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const existing = snapshot.exists ? snapshot.data() || {} : {};
      if (snapshot.exists && text(existing.ownerId, 180) !== authContext.uid) {
        throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
      }
      transaction.set(ref, {
        ownerId: authContext.uid,
        title: session.title,
        archived: session.archived === true,
        publicar: session.publicar === true,
        sessionUpdatedAt: session.updatedAt,
        session,
        sharedWithIds: Array.isArray(existing.sharedWithIds) ? existing.sharedWithIds : [],
        sharedWith: Array.isArray(existing.sharedWith) ? existing.sharedWith : [],
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    res.status(200).json({ ok: true, sessionId: session.id, ownerId: authContext.uid, savedAt: new Date().toISOString() });
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
      merged.set(doc.id, {
        id: doc.id,
        title: text(data.title || nested.title || "Sin título", 240, "Sin título"),
        updatedAt: text(data.sessionUpdatedAt || nested.updatedAt || toIso(data.updatedAt), 64),
        archived: data.archived === true,
        publicar: data.publicar === true,
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
    res.status(200).json({
      ok: true,
      session: {
        ...nested,
        id: snapshot.id,
        title: text(data.title || nested.title || "Sin título", 240, "Sin título"),
        updatedAt: text(data.sessionUpdatedAt || nested.updatedAt || toIso(data.updatedAt) || new Date().toISOString(), 64),
        archived: data.archived === true,
        publicar: data.publicar === true,
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
    const media = [];
    for (const file of files) {
      const [metadata] = await file.getMetadata().catch(() => [{}]);
      const mimeType = String(metadata?.contentType || "").toLowerCase();
      const matches = kind === "videos" ? (mimeType.startsWith("video/") || mimeType.startsWith("image/")) : mimeType.startsWith("audio/");
      if (!matches) continue;
      const storagePath = String(file.name || "");
      const token = String(metadata?.metadata?.firebaseStorageDownloadTokens || "");
      const downloadUrl = token
        ? `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`
        : proxyUrl(storagePath, mimeType.startsWith("image/"));
      const parts = storagePath.split("/");
      const familyIndex = Math.max(parts.indexOf("videos"), parts.indexOf("audio"), parts.indexOf("music"));
      media.push({
        name: parts.at(-1) || storagePath,
        rowFolder: familyIndex >= 0 ? String(parts[familyIndex + 1] || "") : "",
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
      const storagePath = text(data.storagePath, 900);
      return { libraryId: doc.id, name: text(data.name || "Audio", 180, "Audio"), mimeType: text(data.mimeType || "audio/mpeg", 120, "audio/mpeg"), size: Number(data.size || 0), durationSec: number(data.durationSec, 0, 1800), downloadUrl: text(data.downloadUrl, 3000) || (storagePath ? proxyUrl(storagePath) : ""), storagePath, updatedAt: text(data.updatedAt, 64), ownerId: text(data.ownerId, 180), ownerEmail: text(data.ownerEmail, 240) };
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
  sessionAccess,
  normalizeLibraryItem,
  registerPodcasterDataRoutes
};
