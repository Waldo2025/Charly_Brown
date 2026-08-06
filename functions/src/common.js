const crypto = require("node:crypto");
const admin = require("firebase-admin");

const PROJECT_ID = "charly-brown";
const STORAGE_BUCKET = "charly-brown.firebasestorage.app";
const REGION = "us-central1";

function getAdminServices() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || STORAGE_BUCKET
    });
  }
  return {
    admin,
    auth: admin.auth(),
    db: admin.firestore(),
    bucket: admin.storage().bucket()
  };
}

function getBearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

async function resolveAuthContext(req, { optional = false } = {}) {
  const token = getBearerToken(req);
  if (!token) {
    if (optional) return null;
    const error = new Error("auth_required");
    error.status = 401;
    throw error;
  }
  const { auth } = getAdminServices();
  try {
    const decoded = await auth.verifyIdToken(token, true);
    return {
      uid: String(decoded.uid || decoded.sub || "").trim(),
      email: String(decoded.email || "").trim(),
      role: String(decoded.role || "").trim(),
      token: decoded
    };
  } catch (cause) {
    const error = new Error("invalid_auth_token");
    error.status = 401;
    error.cause = cause;
    throw error;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function installCommonMiddleware(app, { service }) {
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId = String(req.headers["x-request-id"] || crypto.randomUUID()).trim();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    console.info(JSON.stringify({ severity: "INFO", event: "http_request", service, requestId, method: req.method, path: req.path }));
    next();
  });
}

function installErrorHandler(app, { service }) {
  app.use((error, req, res, _next) => {
    const status = Math.max(400, Math.min(599, Number(error?.status || error?.statusCode || 500) || 500));
    const code = String(error?.code || error?.message || "internal_error").trim() || "internal_error";
    console.error(JSON.stringify({
      severity: "ERROR",
      event: "http_error",
      service,
      requestId: req.requestId || null,
      status,
      code,
      message: String(error?.message || error)
    }));
    res.status(status).json({ error: code, requestId: req.requestId || undefined });
  });
}

function isPrivilegedRole(role = "") {
  return ["admin", "administrator", "superadmin", "owner", "editor", "author", "developer", "designer"]
    .includes(String(role || "").trim().toLowerCase());
}

module.exports = {
  PROJECT_ID,
  STORAGE_BUCKET,
  REGION,
  getAdminServices,
  getBearerToken,
  resolveAuthContext,
  asyncRoute,
  installCommonMiddleware,
  installErrorHandler,
  isPrivilegedRole
};
