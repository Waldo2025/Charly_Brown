const crypto = require("node:crypto");
const { getAdminServices, resolveAuthContext, asyncRoute } = require("./common.js");

const COLLECTION = "science_activity_sessions";
const LAYOUT_COLLECTION = "science_activity_session_layouts";
const MAX_REQUEST_BYTES = 28 * 1024 * 1024;
const MAX_ACTIVITY_BYTES = 850 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 20;
const SCIENCE_TRIMESTERS = Object.freeze(["Trimestre 1", "Trimestre 2", "Trimestre 3"]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const NESTED_ARRAY_MARKER = "__scienceNestedArrayV1";

function encodeFirestoreValue(value, parentIsArray = false) {
  if (Array.isArray(value)) {
    const items = value.map((item) => encodeFirestoreValue(item, true));
    return parentIsArray ? { [NESTED_ARRAY_MARKER]: items } : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeFirestoreValue(item, false)])
    );
  }
  return value;
}

function decodeFirestoreValue(value) {
  if (Array.isArray(value)) return value.map((item) => decodeFirestoreValue(item));
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1 && Array.isArray(value[NESTED_ARRAY_MARKER])) {
      return value[NESTED_ARRAY_MARKER].map((item) => decodeFirestoreValue(item));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decodeFirestoreValue(item)])
    );
  }
  return value;
}

function normalizeScienceTrimester(value, fallback = "") {
  const compact = String(value ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._-]+/g, "");
  const match = compact.match(/^(?:trim|trimestre)?([123])$/);
  return match ? `Trimestre ${match[1]}` : fallback;
}

function normalizeSessionLayout(input = {}) {
  const groups = Array.isArray(input?.groups) ? input.groups : [];
  if (groups.length > 50) throw Object.assign(new Error("science_session_groups_limit"), { status: 400 });
  const claimed = new Set();
  const normalizedGroups = groups.map((group, index) => {
    const sourceIds = Array.isArray(group?.sessionIds) ? group.sessionIds : [];
    if (sourceIds.length > 100) throw Object.assign(new Error("science_session_group_members_limit"), { status: 400 });
    const sessionIds = [...new Set(sourceIds.map((value) => identifier(value, "science_session_group_member")))]
      .filter((sessionId) => {
        if (claimed.has(sessionId)) return false;
        claimed.add(sessionId);
        return true;
      });
    if (!sessionIds.length) return null;
    const name = String(group?.name || `Grupo ${index + 1}`).trim().slice(0, 80);
    return {
      id: identifier(group?.id || `session-group-${index + 1}`, "science_session_group_id"),
      name: name || `Grupo ${index + 1}`,
      sessionIds,
      collapsed: group?.collapsed === true,
      createdAt: String(group?.createdAt || "").slice(0, 80)
    };
  }).filter(Boolean);
  return {
    version: 2,
    updatedAt: String(input?.updatedAt || "").slice(0, 80),
    groups: normalizedGroups
  };
}

function resolveSessionLayoutWrite(existingInput, incomingInput) {
  const incoming = normalizeSessionLayout(incomingInput || {});
  const existing = existingInput ? normalizeSessionLayout(existingInput) : null;
  if (existing && String(existing.updatedAt || "") > String(incoming.updatedAt || "")) {
    return { applied: false, layout: existing };
  }
  return { applied: true, layout: incoming };
}

function activityMetadata(activity = {}) {
  const gameMode = activity.gameMode === "lab" ? "simulator" : activity.gameMode === "simulator" ? "simulator" : "game";
  const trimester = normalizeScienceTrimester(activity.trimester);
  return {
    title: String(activity.title || "Sesión sin título").trim().slice(0, 180) || "Sesión sin título",
    subject: String(activity.subject || "").trim().slice(0, 80),
    topic: String(activity.topic || "").trim().slice(0, 180),
    trimester,
    gameMode
  };
}

function sessionMetadata(document) {
  const data = cloneJson(document.data() || {});
  const legacyActivity = decodeFirestoreValue(data.activity || {});
  const metadata = activityMetadata({
    title: data.title || legacyActivity.title,
    subject: data.subject || legacyActivity.subject,
    topic: data.topic || legacyActivity.topic,
    trimester: normalizeScienceTrimester(data.trimester || legacyActivity.trimester, "Trimestre 1"),
    gameMode: data.gameMode || legacyActivity.gameMode
  });
  return {
    firebaseDocId: document.id,
    localId: String(data.localId || ""),
    savedAt: String(data.savedAt || ""),
    ...metadata
  };
}

function identifier(value, label = "identifier") {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 160 || !/^[A-Za-z0-9._-]+$/.test(clean)) {
    throw Object.assign(new Error(`invalid_${label}`), { status: 400 });
  }
  return clean;
}

async function resolveOwnedSessionSnapshot(db, ownerId, firebaseDocId, localId = "") {
  const direct = await db.collection(COLLECTION).doc(firebaseDocId).get();
  if (direct.exists) {
    if (String(direct.data()?.ownerId || "") !== ownerId) {
      throw Object.assign(new Error("science_activity_forbidden"), { status: 403 });
    }
    return direct;
  }
  const fallbackLocalId = String(localId || firebaseDocId || "").trim().slice(0, 160);
  if (!fallbackLocalId) return null;
  const matches = await db.collection(COLLECTION)
    .where("localId", "==", fallbackLocalId)
    .limit(10)
    .get();
  if (matches.empty) return null;
  return matches.docs.find((document) => String(document.data()?.ownerId || "") === ownerId) || null;
}

function imageExtension(contentType) {
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  throw Object.assign(new Error("invalid_science_image_type"), { status: 400 });
}

function decodeImage(image) {
  const contentType = String(image?.contentType || "").trim().toLowerCase();
  const extension = imageExtension(contentType);
  const encoded = String(image?.dataBase64 || "").trim();
  if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
    throw Object.assign(new Error("invalid_science_image_data"), { status: 400 });
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error("invalid_science_image_size"), { status: buffer.length > MAX_IMAGE_BYTES ? 413 : 400 });
  }
  return { buffer, contentType, extension };
}

function downloadUrl(bucket, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function uploadActivityImage({ bucket, uid, sessionId, image, activity }) {
  const { buffer, contentType, extension } = decodeImage(image);
  const assetType = String(image?.assetType || "").trim();
  const levelIndex = Math.floor(Number(image?.levelIndex));
  const questionIndex = Math.floor(Number(image?.questionIndex));
  const layerIndex = Math.floor(Number(image?.layerIndex));
  const isPlayer = assetType === "playerSprite";
  const isQuestion = assetType === "questionImage";
  const isSimulatorBackground = assetType === "simulatorBackground";
  const isSimulatorLayer = assetType === "simulatorLayer";
  if (!isPlayer && !isQuestion && !isSimulatorBackground && !isSimulatorLayer && (assetType !== "levelImage" || levelIndex < 0 || levelIndex >= 20)) {
    throw Object.assign(new Error("invalid_science_image_target"), { status: 400 });
  }
  if (isQuestion && (questionIndex < 0 || questionIndex >= 100)) {
    throw Object.assign(new Error("invalid_science_image_target"), { status: 400 });
  }
  if (isSimulatorLayer && (layerIndex < 0 || layerIndex >= 5)) throw Object.assign(new Error("invalid_science_image_target"), { status: 400 });
  const fileName = isPlayer ? `player-sprite.${extension}` : isQuestion ? `question-${questionIndex + 1}.${extension}` : isSimulatorBackground ? `simulator-background.${extension}` : isSimulatorLayer ? `simulator-layer-${layerIndex + 1}.${extension}` : `level-${levelIndex + 1}.${extension}`;
  const storagePath = `scienceActivities/${uid}/${sessionId}/${fileName}`;
  const token = crypto.randomUUID();
  const customMetadata = {
    ownerUid: uid,
    sessionId,
    assetType,
    firebaseStorageDownloadTokens: token
  };
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    resumable: false,
    metadata: { contentType, metadata: customMetadata }
  });
  await file.setMetadata({ metadata: customMetadata });
  const url = downloadUrl(bucket, storagePath, token);
  const width = Math.max(0, Math.floor(Number(image?.width) || 0));
  const height = Math.max(0, Math.floor(Number(image?.height) || 0));

  if (isPlayer) {
    activity.playerSprite = { ...(activity.playerSprite || {}), dataUrl: url, storagePath, width, height };
    return;
  }
  if (isQuestion) {
    const assessment = activity.assessments?.[questionIndex];
    if (!assessment || assessment.type !== "image-multiple") throw Object.assign(new Error("science_question_not_found"), { status: 400 });
    assessment.visual = { ...(assessment.visual || {}), imageUrl: url, imageDataUrl: url, storagePath, width, height };
    return;
  }
  if (isSimulatorBackground) {
    activity.visualScene ||= { version: 1, status: "partial", background: {}, layers: [], generationWarnings: [] };
    activity.visualScene.background = { ...(activity.visualScene.background || {}), imageUrl: url, dataUrl: url, storagePath, width, height };
    return;
  }
  if (isSimulatorLayer) {
    const layer = activity.visualScene?.layers?.[layerIndex];
    if (!layer) throw Object.assign(new Error("science_simulator_layer_not_found"), { status: 400 });
    activity.visualScene.layers[layerIndex] = { ...layer, imageUrl: url, dataUrl: url, storagePath, width, height };
    return;
  }
  const level = activity.learningGuide?.levels?.[levelIndex];
  if (!level) throw Object.assign(new Error("science_level_not_found"), { status: 400 });
  level.imageUrl = url;
  level.imageDataUrl = url;
  level.storagePath = storagePath;
  level.imageWidth = width;
  level.imageHeight = height;
}

function registerScienceActivitiesRoutes(app) {
  app.get("/api/science-activities/list", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const snapshot = await db.collection(COLLECTION)
      .where("ownerId", "==", authContext.uid)
      .select(
        "localId", "savedAt", "title", "subject", "topic", "trimester", "gameMode",
        "activity.title", "activity.subject", "activity.topic", "activity.trimester", "activity.gameMode"
      )
      .limit(50)
      .get();
    const sessions = snapshot.docs.map(sessionMetadata)
      .sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")));
    res.status(200).json({ ok: true, sessions, complete: snapshot.size < 50 });
  }));

  app.get("/api/science-activities/session-layout", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const snapshot = await db.collection(LAYOUT_COLLECTION).doc(authContext.uid).get();
    if (!snapshot.exists) {
      res.status(200).json({ ok: true, layout: null });
      return;
    }
    const data = cloneJson(snapshot.data() || {});
    res.status(200).json({ ok: true, layout: normalizeSessionLayout(data) });
  }));

  app.post("/api/science-activities/session-layout", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    if (Buffer.byteLength(JSON.stringify(req.body || {}), "utf8") > 128 * 1024) {
      throw Object.assign(new Error("science_session_layout_too_large"), { status: 413 });
    }
    const layout = normalizeSessionLayout(req.body?.layout || {});
    if (!layout.updatedAt || !Number.isFinite(Date.parse(layout.updatedAt))) {
      throw Object.assign(new Error("science_session_layout_updated_at_required"), { status: 400 });
    }
    const { db, admin } = getAdminServices();
    const ref = db.collection(LAYOUT_COLLECTION).doc(authContext.uid);
    let resolvedLayout = layout;
    let applied = true;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const resolution = resolveSessionLayoutWrite(snapshot.exists ? snapshot.data() || {} : null, layout);
      if (!resolution.applied) {
        resolvedLayout = resolution.layout;
        applied = false;
        return;
      }
      transaction.set(ref, {
        ownerId: authContext.uid,
        ...layout,
        serverUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    res.status(200).json({ ok: true, applied, layout: resolvedLayout });
  }));

  app.get("/api/science-activities/session/:firebaseDocId", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const firebaseDocId = identifier(req.params?.firebaseDocId, "science_session_id");
    const { db } = getAdminServices();
    const snapshot = await resolveOwnedSessionSnapshot(db, authContext.uid, firebaseDocId, req.query?.localId);
    if (!snapshot?.exists) throw Object.assign(new Error("science_activity_not_found"), { status: 404 });
    const data = cloneJson(snapshot.data() || {});
    const activity = decodeFirestoreValue(data.activity);
    if (!activity || typeof activity !== "object") {
      throw Object.assign(new Error("science_activity_required"), { status: 500 });
    }
    res.status(200).json({
      ok: true,
      session: {
        ...sessionMetadata({ id: snapshot.id, data: () => data }),
        activity
      }
    });
  }));

  app.post("/api/science-activities/save", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    if (Buffer.byteLength(JSON.stringify(req.body || {}), "utf8") > MAX_REQUEST_BYTES) {
      throw Object.assign(new Error("science_activity_payload_too_large"), { status: 413 });
    }
    const activity = req.body?.activity && typeof req.body.activity === "object" ? cloneJson(req.body.activity) : null;
    if (!activity) throw Object.assign(new Error("science_activity_required"), { status: 400 });
    activity.trimester = normalizeScienceTrimester(activity.trimester);
    if (!SCIENCE_TRIMESTERS.includes(activity.trimester)) {
      throw Object.assign(new Error("science_activity_trimester_required"), { status: 400 });
    }
    const firebaseDocId = req.body?.firebaseDocId
      ? identifier(req.body.firebaseDocId, "science_session_id")
      : `science_${crypto.randomUUID()}`;
    const localId = String(req.body?.localId || "").trim().slice(0, 160);
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    if (images.length > MAX_IMAGES) throw Object.assign(new Error("too_many_science_images"), { status: 413 });

    const { db, bucket, admin } = getAdminServices();
    const ref = db.collection(COLLECTION).doc(firebaseDocId);
    const existing = await ref.get();
    if (existing.exists && String(existing.data()?.ownerId || "") !== authContext.uid) {
      throw Object.assign(new Error("science_activity_forbidden"), { status: 403 });
    }
    for (const image of images) {
      await uploadActivityImage({ bucket, uid: authContext.uid, sessionId: firebaseDocId, image, activity });
    }
    const firestoreActivity = encodeFirestoreValue(activity);
    if (Buffer.byteLength(JSON.stringify(firestoreActivity), "utf8") > MAX_ACTIVITY_BYTES) {
      throw Object.assign(new Error("science_activity_document_too_large"), { status: 413 });
    }
    const savedAt = String(req.body?.savedAt || new Date().toISOString()).slice(0, 80);
    const metadata = activityMetadata(activity);
    const record = {
      ownerId: authContext.uid,
      ownerEmail: authContext.email || "",
      localId,
      savedAt,
      schemaVersion: 2,
      ...metadata,
      activity: firestoreActivity,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    };
    try {
      await ref.set(record, { merge: true });
    } catch (error) {
      console.error("[science-activities] Firestore write failed", {
        code: error?.code || null,
        message: error?.message || String(error),
        sessionId: firebaseDocId,
        uid: authContext.uid
      });
      throw Object.assign(new Error("science_activity_firestore_write_failed"), {
        status: 500,
        cause: error
      });
    }
    res.status(200).json({ ok: true, firebaseDocId, activity });
  }));

  app.post("/api/science-activities/rename", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const firebaseDocId = identifier(req.body?.firebaseDocId, "science_session_id");
    const localId = String(req.body?.localId || "").trim().slice(0, 160);
    const title = String(req.body?.title || "").trim().slice(0, 180);
    if (!title) throw Object.assign(new Error("science_activity_title_required"), { status: 400 });
    const { db, admin } = getAdminServices();
    let ref = db.collection(COLLECTION).doc(firebaseDocId);
    let snapshot = await ref.get();
    if (!snapshot.exists && localId) {
      const matches = await db.collection(COLLECTION)
        .where("ownerId", "==", authContext.uid)
        .where("localId", "==", localId)
        .limit(1)
        .get();
      if (!matches.empty) {
        snapshot = matches.docs[0];
        ref = snapshot.ref;
      }
    }
    if (!snapshot.exists) {
      res.status(200).json({ ok: true, firebaseDocId, title, remoteMissing: true });
      return;
    }
    if (String(snapshot.data()?.ownerId || "") !== authContext.uid) {
      throw Object.assign(new Error("science_activity_forbidden"), { status: 403 });
    }
    const savedAt = String(req.body?.savedAt || new Date().toISOString()).slice(0, 80);
    await ref.update({
      title,
      "activity.title": title,
      savedAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ ok: true, firebaseDocId: ref.id, title, savedAt });
  }));

  app.post("/api/science-activities/delete", asyncRoute(async (req, res) => {
    const authContext = await resolveAuthContext(req);
    const firebaseDocId = identifier(req.body?.firebaseDocId, "science_session_id");
    const { db, bucket } = getAdminServices();
    const ref = db.collection(COLLECTION).doc(firebaseDocId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      res.status(200).json({ ok: true, firebaseDocId, alreadyDeleted: true });
      return;
    }
    if (String(snapshot.data()?.ownerId || "") !== authContext.uid) {
      throw Object.assign(new Error("science_activity_forbidden"), { status: 403 });
    }
    await bucket.deleteFiles({ prefix: `scienceActivities/${authContext.uid}/${firebaseDocId}/`, force: true });
    await ref.delete();
    res.status(200).json({ ok: true, firebaseDocId });
  }));
}

module.exports = {
  activityMetadata,
  decodeFirestoreValue,
  encodeFirestoreValue,
  normalizeScienceTrimester,
  normalizeSessionLayout,
  registerScienceActivitiesRoutes,
  resolveOwnedSessionSnapshot,
  resolveSessionLayoutWrite,
  sessionMetadata
};
