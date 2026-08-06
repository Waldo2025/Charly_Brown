const { getAdminServices, resolveAuthContext, asyncRoute } = require("./common.js");

const SIGNED_URL_TTL_MS = 10 * 60 * 1000;

function normalizeStoragePath(value = "") {
  const clean = String(value || "").trim().replace(/^\/+/, "");
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

function registerAssetRoutes(app) {
  const handler = asyncRoute(async (req, res) => {
    const { url } = await createSignedAssetUrl(req);
    res.setHeader("Cache-Control", "private, no-store");
    return res.redirect(302, url);
  });
  app.get("/api/assets/signed-url", asyncRoute(async (req, res) => {
    const asset = await createSignedAssetUrl(req);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, ...asset });
  }));
  app.get("/api/assets/proxy-media", handler);
  app.get("/api/assets/proxy-image", handler);
  app.get("/api/assets/montage-download", handler);
}

module.exports = {
  SIGNED_URL_TTL_MS,
  normalizeStoragePath,
  isPublicLibraryPath,
  sessionIdFromStoragePath,
  createSignedAssetUrl,
  registerAssetRoutes
};
