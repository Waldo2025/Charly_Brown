const crypto = require("node:crypto");
const {
  asyncRoute,
  getAdminServices,
  isPrivilegedRole,
  resolveAuthContext
} = require("./common.js");

const ESCAPE_ROOM_COLLECTION = "escapeRoom";
const TOPICS_SUBCOLLECTION = "topics";

function cleanIdentifier(value = "", code = "pigpen_session_id_invalid") {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 180 || clean.includes("/")) {
    throw Object.assign(new Error(code), { status: 400, code });
  }
  return clean;
}

function cleanToken(value = "") {
  const clean = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{24,160}$/.test(clean)) {
    throw Object.assign(new Error("pigpen_share_token_invalid"), {
      status: 404,
      code: "pigpen_share_not_found"
    });
  }
  return clean;
}

function tokenMatches(expected = "", received = "") {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(received || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isPlayableProject(value) {
  return Boolean(value && typeof value === "object" && Array.isArray(value.misiones));
}

function timestampToIso(value) {
  try {
    if (typeof value?.toDate === "function") return value.toDate().toISOString();
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  } catch (_) {
    return "";
  }
}

function publicTopic(docSnapshot) {
  const data = docSnapshot?.data?.() || {};
  if (!isPlayableProject(data.project)) return null;
  return {
    id: String(docSnapshot.id || ""),
    academicNumber: Math.max(1, Number(data.academicNumber || 1) || 1),
    title: String(data.title || data.project?.titulo || "Escape Room").trim() || "Escape Room",
    project: data.project,
    updatedAt: timestampToIso(data.updatedAt)
  };
}

async function loadPublicSession({ db, sessionId, token }) {
  const ref = db.collection(ESCAPE_ROOM_COLLECTION).doc(sessionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw Object.assign(new Error("pigpen_share_not_found"), { status: 404, code: "pigpen_share_not_found" });
  }
  const data = snapshot.data() || {};
  if (data.shareEnabled !== true || !tokenMatches(data.shareToken, token)) {
    throw Object.assign(new Error("pigpen_share_not_found"), { status: 404, code: "pigpen_share_not_found" });
  }

  const topicsSnapshot = await ref.collection(TOPICS_SUBCOLLECTION).get();
  const topics = topicsSnapshot.docs
    .map(publicTopic)
    .filter(Boolean)
    .sort((a, b) => a.academicNumber - b.academicNumber || a.title.localeCompare(b.title, "es"));

  if (!topics.length && isPlayableProject(data.project)) {
    topics.push({
      id: String(data.activeTopicId || "legacy"),
      academicNumber: 1,
      title: String(data.project?.titulo || data.title || "Escape Room").trim() || "Escape Room",
      project: data.project,
      updatedAt: timestampToIso(data.updatedAt)
    });
  }
  if (!topics.length) {
    throw Object.assign(new Error("pigpen_share_has_no_game"), { status: 404, code: "pigpen_share_has_no_game" });
  }

  return {
    id: sessionId,
    title: String(data.title || topics[0].title || "Escape Room").trim() || "Escape Room",
    activeTopicId: String(data.activeTopicId || topics[0].id || ""),
    topics,
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function registerPigPenShareRoutes(app) {
  app.post("/api/pigpen/share", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const sessionId = cleanIdentifier(req.body?.sessionId);
    const { db, admin } = getAdminServices();
    const ref = db.collection(ESCAPE_ROOM_COLLECTION).doc(sessionId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw Object.assign(new Error("pigpen_session_not_found"), { status: 404, code: "pigpen_session_not_found" });
    }
    const data = snapshot.data() || {};
    const isOwner = String(data.ownerId || "") === String(authContext.uid || "");
    if (!isOwner && !isPrivilegedRole(authContext.role)) {
      throw Object.assign(new Error("pigpen_share_forbidden"), { status: 403, code: "pigpen_share_forbidden" });
    }
    if (!isPlayableProject(data.project)) {
      throw Object.assign(new Error("pigpen_share_has_no_game"), { status: 409, code: "pigpen_share_has_no_game" });
    }

    const shareToken = /^[A-Za-z0-9_-]{24,160}$/.test(String(data.shareToken || ""))
      ? String(data.shareToken)
      : crypto.randomBytes(24).toString("base64url");
    await ref.set({
      shareEnabled: true,
      shareToken,
      sharedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.status(200).json({
      ok: true,
      sessionId,
      shareToken,
      activeTopicId: String(data.activeTopicId || ""),
      title: String(data.title || data.project?.titulo || "Escape Room")
    });
  }));

  app.get("/api/pigpen/share/:sessionId", asyncRoute(async (req, res) => {
    const sessionId = cleanIdentifier(req.params?.sessionId);
    const token = cleanToken(req.query?.token);
    const { db } = getAdminServices();
    const session = await loadPublicSession({ db, sessionId, token });
    res.status(200).json({ ok: true, session });
  }));
}

module.exports = {
  cleanIdentifier,
  cleanToken,
  isPlayableProject,
  loadPublicSession,
  publicTopic,
  registerPigPenShareRoutes,
  tokenMatches
};
