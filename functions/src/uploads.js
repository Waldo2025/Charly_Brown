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
  "library-image": 10 * 1024 * 1024,
  "library-music": 24 * 1024 * 1024
});
const MAX_SUPPORT_GRAPHIC_BYTES = 10 * 1024 * 1024;

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
  if (kind === "library-video" || kind === "library-image" || kind === "library-music") {
    const family = kind === "library-music" ? "music" : "scenes";
    return `podcaster/library/${family}/pending/${sanitizeSegment(uid, "user")}/${uploadId}-${safeName}.${ext}`;
  }
  const folder = kind === "music" ? "music" : "videos";
  const rowPrefix = kind === "music" ? "" : `${rowId}-`;
  return `podcaster/sessions/${sessionId}/owners/${sanitizeSegment(uid, "user")}/${folder}/${rowPrefix}${uploadId}-${safeName}.${ext}`;
}

function validateSupportGraphicUploadRequest(body = {}, uid = "") {
  const userPathPrefix = `unidadesGeneradasAssets/${sanitizeSegment(uid || "", "user")}/`;
  const path = String(body.path || "").trim().replace(/^\/+/, "");
  const mimeType = String(body.mimeType || "image/png").trim().toLowerCase();
  const dataBase64 = String(body.dataBase64 || "").trim();
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  if (!path || !path.startsWith(userPathPrefix) || path.includes("..")) {
    throw Object.assign(new Error("invalid_storage_path"), { status: 400 });
  }
  if (!/^image\//i.test(mimeType)) {
    throw Object.assign(new Error("invalid_upload_content_type"), { status: 400 });
  }
  const expectedLength = Math.max(0, Math.floor(dataBase64.length * 3 / 4));
  if (!dataBase64 || !/^[A-Za-z0-9+\/=\s]+$/.test(dataBase64) || expectedLength === 0 || expectedLength > MAX_SUPPORT_GRAPHIC_BYTES) {
    throw Object.assign(new Error("invalid_upload_size"), { status: expectedLength > MAX_SUPPORT_GRAPHIC_BYTES ? 413 : 400 });
  }
  return {
    path,
    mimeType,
    dataBase64,
    metadata,
    expectedLength
  };
}

function registerUploadRoutes(app) {
  app.post("/api/podcaster/uploads/create", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const input = validateUploadRequest(req.body || {});
    const { db, bucket, admin } = getAdminServices();
    if (input.sessionId) {
      await assertSessionAccess({ db, sessionId: input.sessionId, authContext });
    }
    const uploadId = crypto.randomUUID();
    const downloadToken = crypto.randomUUID();
    const storagePath = buildStoragePath({ ...input, uploadId, uid: authContext.uid });
    const previousStoragePath = String(req.body?.previousStoragePath || "").trim().replace(/^\/+/, "");
    if (previousStoragePath && (!previousStoragePath.startsWith("podcaster/") || previousStoragePath.includes(".."))) {
      throw Object.assign(new Error("invalid_previous_storage_path"), { status: 400 });
    }
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
          originalFileName: input.fileName,
          firebaseStorageDownloadTokens: downloadToken
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
      downloadToken,
      previousStoragePath,
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
      downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(String(pending.storagePath || ""))}?alt=media&token=${encodeURIComponent(String(pending.downloadToken || metadata?.metadata?.firebaseStorageDownloadTokens || ""))}`,
      updatedAt: new Date().toISOString()
    };
    await ref.set({
      status: "finalized",
      media,
      finalizedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const previousStoragePath = String(pending.previousStoragePath || "").trim();
    if (previousStoragePath && previousStoragePath !== pending.storagePath) {
      const sameSessionPrefix = pending.sessionId && previousStoragePath.startsWith(`podcaster/sessions/${pending.sessionId}/`);
      const sameLibraryPrefix = String(pending.kind || "").startsWith("library-") && previousStoragePath.startsWith("podcaster/library/");
      if (sameSessionPrefix || sameLibraryPrefix) {
        await bucket.file(previousStoragePath).delete({ ignoreNotFound: true }).catch(() => {});
      }
    }
    return res.status(200).json({ ok: true, uploadId, media });
  }));
}

function registerSupportGraphicUploadRoute(app) {
  app.post("/api/unidades/support-graphics/upload", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const input = validateSupportGraphicUploadRequest(req.body || {}, authContext.uid);
    const { bucket } = getAdminServices();
    const downloadToken = crypto.randomUUID();
    let buffer;
    try {
      buffer = Buffer.from(input.dataBase64, "base64");
    } catch (error) {
      throw Object.assign(new Error("invalid_upload_data"), { status: 400 });
    }
    if (!buffer || buffer.length !== input.expectedLength) {
      if (buffer && buffer.length !== 0 && buffer.length > 0) {
        input.expectedLength = buffer.length;
      } else {
        throw Object.assign(new Error("invalid_upload_data"), { status: 400 });
      }
    }
    if (buffer.length > MAX_SUPPORT_GRAPHIC_BYTES) {
      throw Object.assign(new Error("invalid_upload_size"), { status: 413 });
    }

    const file = bucket.file(input.path);
    const customMetadata = {
      ownerUid: authContext.uid,
      role: String((input.metadata && input.metadata.role) || "").trim() || "imagen",
      subtema: String((input.metadata && input.metadata.subtema) || "").trim() || "escaperoom",
      source: "support_graphic_upload",
      firebaseStorageDownloadTokens: downloadToken
    };
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: input.mimeType,
        metadata: customMetadata
      }
    });
    await file.setMetadata({ metadata: customMetadata });

    const storagePath = input.path;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;

    return res.status(200).json({
      ok: true,
      path: storagePath,
      downloadUrl,
      mimeType: input.mimeType,
      size: buffer.length
    });
  }));
}

module.exports = {
  MAX_UPLOAD_BYTES,
  sanitizeSegment,
  validateIdentifier,
  extensionForMime,
  validateUploadRequest,
  buildStoragePath,
  validateSupportGraphicUploadRequest,
  registerUploadRoutes,
  registerSupportGraphicUploadRoute
};
