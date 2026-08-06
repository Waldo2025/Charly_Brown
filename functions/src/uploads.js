const path = require("node:path");
const crypto = require("node:crypto");
const {
  getAdminServices,
  resolveAuthContext,
  asyncRoute,
  isPrivilegedRole
} = require("./common.js");

const MAX_UPLOAD_BYTES = Object.freeze({
  "scene-image": 10 * 1024 * 1024,
  "scene-video": 80 * 1024 * 1024,
  "dialogue-video": 80 * 1024 * 1024,
  music: 24 * 1024 * 1024,
  "library-video": 80 * 1024 * 1024,
  "library-music": 24 * 1024 * 1024
});

function sanitizeSegment(value = "", fallback = "asset") {
  const clean = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return clean || fallback;
}

function validateIdentifier(value = "", { name = "identifier", fallback = "" } = {}) {
  const clean = String(value || fallback).trim();
  if (!clean && fallback === "") return "";
  if (!clean || clean.length > 180 || !/^[A-Za-z0-9._-]+$/.test(clean)) {
    throw Object.assign(new Error(`invalid_${name}`), { status: 400 });
  }
  return clean;
}

function extensionForMime(contentType = "") {
  const value = String(contentType || "").toLowerCase();
  const known = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/ogg": "ogg"
  };
  return known[value] || "bin";
}

function validateUploadRequest(body = {}) {
  const kind = String(body.kind || "").trim().toLowerCase();
  const sessionId = validateIdentifier(body.sessionId || "", { name: "session_id" });
  const rowId = validateIdentifier(body.rowId || "row", { name: "row_id", fallback: "row" });
  const fileName = String(body.fileName || "asset").trim().slice(0, 220) || "asset";
  const contentType = String(body.contentType || "application/octet-stream").trim().toLowerCase();
  const size = Number(body.size || 0);
  const maximum = MAX_UPLOAD_BYTES[kind];
  if (!maximum) throw Object.assign(new Error("unsupported_upload_kind"), { status: 400 });
  if (!Number.isSafeInteger(size) || size <= 0 || size > maximum) {
    throw Object.assign(new Error("invalid_upload_size"), { status: size > maximum ? 413 : 400 });
  }
  const family = kind.includes("music") || kind === "music"
    ? "audio/"
    : (kind.includes("image") ? "image/" : "video/");
  if (!contentType.startsWith(family)) {
    throw Object.assign(new Error("invalid_upload_content_type"), { status: 400 });
  }
  if (!kind.startsWith("library-") && !sessionId) {
    throw Object.assign(new Error("session_id_required"), { status: 400 });
  }
  return { kind, sessionId, rowId, fileName, contentType, size, maximum };
}

async function assertSessionAccess({ db, sessionId, authContext }) {
  const snapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
  if (!snapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
  const session = snapshot.data() || {};
  const sharedWithIds = Array.isArray(session.sharedWithIds) ? session.sharedWithIds.map(String) : [];
  if (
    String(session.ownerId || "") !== authContext.uid
    && !sharedWithIds.includes(authContext.uid)
    && !isPrivilegedRole(authContext.role)
  ) {
    throw Object.assign(new Error("podcaster_session_forbidden"), { status: 403 });
  }
}

function buildStoragePath({ uploadId, uid, kind, sessionId, rowId, fileName, contentType }) {
  const ext = extensionForMime(contentType) || path.extname(fileName).replace(/^\./, "") || "bin";
  const safeName = sanitizeSegment(path.basename(fileName, path.extname(fileName)), "asset");
  if (kind === "library-video" || kind === "library-music") {
    const family = kind === "library-video" ? "scenes" : "music";
    return `podcaster/library/${family}/pending/${sanitizeSegment(uid, "user")}/${uploadId}-${safeName}.${ext}`;
  }
  const folder = kind === "music" ? "music" : "videos";
  const rowPrefix = kind === "music" ? "" : `${rowId}-`;
  return `podcaster/sessions/${sessionId}/owners/${sanitizeSegment(uid, "user")}/${folder}/${rowPrefix}${uploadId}-${safeName}.${ext}`;
}

function registerUploadRoutes(app) {
  app.post("/api/podcaster/uploads/create", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const input = validateUploadRequest(req.body || {});
    const { db, bucket, admin } = getAdminServices();
    if (input.kind.startsWith("library-") && !isPrivilegedRole(authContext.role)) {
      throw Object.assign(new Error("library_upload_forbidden"), { status: 403 });
    }
    if (input.sessionId) {
      await assertSessionAccess({ db, sessionId: input.sessionId, authContext });
    }
    const uploadId = crypto.randomUUID();
    const storagePath = buildStoragePath({ ...input, uploadId, uid: authContext.uid });
    const file = bucket.file(storagePath);
    const [uploadUrl] = await file.createResumableUpload({
      origin: String(req.headers.origin || "").trim() || undefined,
      metadata: {
        contentType: input.contentType,
        metadata: {
          uploadId,
          uid: authContext.uid,
          sessionId: input.sessionId,
          rowId: input.rowId,
          kind: input.kind,
          expectedSize: String(input.size),
          originalFileName: input.fileName
        }
      }
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.collection("podcaster_upload_sessions").doc(uploadId).set({
      uploadId,
      ownerId: authContext.uid,
      sessionId: input.sessionId,
      rowId: input.rowId,
      kind: input.kind,
      fileName: input.fileName,
      contentType: input.contentType,
      expectedSize: input.size,
      storagePath,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
    });
    res.status(201).json({
      uploadId,
      uploadUrl,
      storagePath,
      expiresAt: expiresAt.toISOString(),
      headers: { "Content-Type": input.contentType }
    });
  }));

  app.post("/api/podcaster/uploads/finalize", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const uploadId = String(req.body?.uploadId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
      throw Object.assign(new Error("invalid_upload_id"), { status: 400 });
    }
    const { db, bucket, admin } = getAdminServices();
    const ref = db.collection("podcaster_upload_sessions").doc(uploadId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Object.assign(new Error("upload_session_not_found"), { status: 404 });
    const pending = snapshot.data() || {};
    if (String(pending.ownerId || "") !== authContext.uid) {
      throw Object.assign(new Error("upload_session_forbidden"), { status: 403 });
    }
    if (pending.status === "finalized") {
      return res.status(200).json({ ok: true, uploadId, media: pending.media, idempotent: true });
    }
    const expiresAtMs = pending.expiresAt?.toMillis?.() || 0;
    if (expiresAtMs && expiresAtMs < Date.now()) {
      throw Object.assign(new Error("upload_session_expired"), { status: 410 });
    }
    const file = bucket.file(String(pending.storagePath || ""));
    const [exists] = await file.exists();
    if (!exists) throw Object.assign(new Error("uploaded_object_not_found"), { status: 409 });
    const [metadata] = await file.getMetadata();
    const actualSize = Number(metadata.size || 0);
    if (actualSize !== Number(pending.expectedSize || 0)) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw Object.assign(new Error("uploaded_object_size_mismatch"), { status: 409 });
    }
    if (String(metadata.contentType || "").toLowerCase() !== String(pending.contentType || "").toLowerCase()) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw Object.assign(new Error("uploaded_object_content_type_mismatch"), { status: 409 });
    }
    const media = {
      name: String(pending.fileName || "asset"),
      mimeType: String(metadata.contentType || pending.contentType || "application/octet-stream"),
      size: actualSize,
      type: String(pending.kind || "").includes("image") ? "image" : (String(pending.kind || "").includes("music") ? "audio" : "video"),
      storagePath: String(pending.storagePath || ""),
      updatedAt: new Date().toISOString()
    };
    await ref.set({
      status: "finalized",
      media,
      finalizedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return res.status(200).json({ ok: true, uploadId, media });
  }));
}

module.exports = {
  MAX_UPLOAD_BYTES,
  sanitizeSegment,
  validateIdentifier,
  extensionForMime,
  validateUploadRequest,
  buildStoragePath,
  registerUploadRoutes
};
