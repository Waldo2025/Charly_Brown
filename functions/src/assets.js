const { getAdminServices, resolveAuthContext, asyncRoute } = require("./common.js");

const SIGNED_URL_TTL_MS = 10 * 60 * 1000;

function normalizeStoragePath(value = "") {
  let clean = String(value || "").trim();
  try { clean = decodeURIComponent(clean); } catch (_) { }
  if (clean.startsWith("gs://")) {
    const withoutScheme = clean.replace(/^gs:\/\//i, "");
    const slashIndex = withoutScheme.indexOf("/");
    clean = slashIndex >= 0 ? withoutScheme.slice(slashIndex + 1) : "";
  }
  clean = clean.replace(/^\/+/, "");
  if (!clean || clean.includes("..") || !clean.startsWith("podcaster/")) {
    throw Object.assign(new Error("invalid_storage_path"), { status: 400 });
  }
  return clean;
}

function isPublicLibraryPath(storagePath = "") {
  return String(storagePath || "").startsWith("podcaster/library/");
}

function sessionIdFromStoragePath(storagePath = "") {
  const match = String(storagePath || "").match(/^podcaster\/sessions\/([^/]+)\//);
  return match ? String(match[1] || "").trim() : "";
}

async function assertAssetAccess({ req, storagePath, db }) {
  if (isPublicLibraryPath(storagePath)) return null;
  const authContext = await resolveAuthContext(req);
  const sessionId = sessionIdFromStoragePath(storagePath);
  if (!sessionId) throw Object.assign(new Error("asset_forbidden"), { status: 403 });
  const snapshot = await db.collection("podcaster_sessions").doc(sessionId).get();
  if (!snapshot.exists) throw Object.assign(new Error("podcaster_session_not_found"), { status: 404 });
  const session = snapshot.data() || {};
  const sharedWithIds = Array.isArray(session.sharedWithIds) ? session.sharedWithIds.map(String) : [];
  if (String(session.ownerId || "") !== authContext.uid && !sharedWithIds.includes(authContext.uid)) {
    throw Object.assign(new Error("asset_forbidden"), { status: 403 });
  }
  return authContext;
}

async function createSignedAssetUrl(req) {
  const storagePath = normalizeStoragePath(req.query?.storagePath || "");
  const { db, bucket } = getAdminServices();
  await assertAssetAccess({ req, storagePath, db });
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw Object.assign(new Error("asset_not_found"), { status: 404 });
  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresAt
  });
  return { storagePath, url, expiresAt };
}

function resolveByteRange(rangeHeader = "", size = 0) {
  const clean = String(rangeHeader || "").trim();
  if (!clean) return null;
  const match = clean.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || size <= 0) return { invalid: true };

  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return { invalid: true };

  let start;
  let end;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

async function streamAsset(req, res) {
  const storagePath = normalizeStoragePath(req.query?.storagePath || "");
  const { db, bucket } = getAdminServices();
  await assertAssetAccess({ req, storagePath, db });
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata().catch((error) => {
    if (Number(error?.code) === 404) {
      throw Object.assign(new Error("asset_not_found"), { status: 404 });
    }
    throw error;
  });
  const size = Number(metadata?.size || 0);
  const range = resolveByteRange(req.headers.range, size);

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", String(metadata?.contentType || "application/octet-stream"));

  if (range?.invalid) {
    res.setHeader("Content-Range", `bytes */${size}`);
    return res.status(416).end();
  }

  const streamOptions = range ? { start: range.start, end: range.end } : {};
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", String(range.end - range.start + 1));
  } else if (size > 0) {
    res.setHeader("Content-Length", String(size));
  }

  if (req.method === "HEAD") return res.end();
  return new Promise((resolve, reject) => {
    const readStream = file.createReadStream(streamOptions);
    let settled = false;
    const cleanup = () => {
      req.removeListener("aborted", abortStream);
      res.removeListener("finish", finishStream);
      res.removeListener("close", closeStream);
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const abortStream = () => {
      if (!readStream.destroyed) readStream.destroy();
      settle();
    };
    const finishStream = () => settle();
    const closeStream = () => {
      if (res.writableFinished) settle();
      else abortStream();
    };
    readStream.on("error", (error) => {
      if (res.headersSent) {
        res.destroy(error);
        settle();
        return;
      }
      cleanup();
      reject(error);
    });
    req.once("aborted", abortStream);
    res.once("finish", finishStream);
    res.once("close", closeStream);
    readStream.pipe(res);
  });
}

function registerAssetRoutes(app) {
  const redirectToSignedAsset = asyncRoute(async (req, res) => {
    const { url } = await createSignedAssetUrl(req);
    res.setHeader("Cache-Control", "private, no-store");
    return res.redirect(302, url);
  });
  app.get("/api/assets/signed-url", asyncRoute(async (req, res) => {
    const asset = await createSignedAssetUrl(req);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, ...asset });
  }));
  app.get("/api/assets/proxy-media", asyncRoute(streamAsset));
  app.get("/api/assets/proxy-image", redirectToSignedAsset);
  app.get("/api/assets/montage-download", redirectToSignedAsset);
}

module.exports = {
  SIGNED_URL_TTL_MS,
  normalizeStoragePath,
  isPublicLibraryPath,
  sessionIdFromStoragePath,
  resolveByteRange,
  createSignedAssetUrl,
  registerAssetRoutes
};
