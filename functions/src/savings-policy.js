"use strict";

const { asyncRoute, getAdminServices, resolveAuthContext, hasAdminRoleWithProfile } = require("./common.js");

const LEVELS = Object.freeze({
  off: { podcasterSessions: null, videoSessions: null, pigpenTopics: null, marcieSessions: null, marcieAudiences: null, charlySessions: null, veoMinutes: 0 },
  medium: { podcasterSessions: null, videoSessions: 1, pigpenTopics: 4, marcieSessions: 1, marcieAudiences: 4, charlySessions: 2, veoMinutes: 10 },
  high: { podcasterSessions: 1, videoSessions: 1, pigpenTopics: 2, marcieSessions: 1, marcieAudiences: 2, charlySessions: 1, veoMinutes: 20 },
  ultra: { podcasterSessions: 0, videoSessions: 0, pigpenTopics: 1, marcieSessions: 1, marcieAudiences: 1, charlySessions: 0, veoMinutes: 30 }
});
const CONTROL_REF = ["savings_control", "global"];
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cancun", year: "numeric", month: "2-digit", day: "2-digit" });

function dayKey(date = new Date()) {
  const parts = Object.fromEntries(DAY_FORMAT.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function cleanId(value) {
  const result = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(result)) throw Object.assign(new Error("savings_invalid_id"), { status: 400 });
  return result;
}

function controlRef(db) { return db.collection(CONTROL_REF[0]).doc(CONTROL_REF[1]); }

function levelForAmount(amount) {
  if (!Number.isFinite(amount) || amount < 0) throw Object.assign(new Error("savings_invalid_billing_amount"), { status: 400 });
  if (amount >= 5000) return "ultra";
  if (amount >= 3500) return "high";
  if (amount >= 2000) return "medium";
  return "off";
}

async function changePolicy(db, selection, uid, now = new Date()) {
  if (selection !== "auto" && !Object.hasOwn(LEVELS, selection)) throw Object.assign(new Error("savings_invalid_level"), { status: 400 });
  const ref = controlRef(db);
  const billingRef = db.collection("savings_billing").doc("current");
  return db.runTransaction(async (tx) => {
    const billingSnapshot = await tx.get(billingRef);
    const billing = billingSnapshot.data() || {};
    const validCurrentBilling = billing.month === dayKey(now).slice(0, 7)
      && billing.currency === "MXN" && Number.isFinite(billing.amount) && billing.amount >= 0;
    const level = selection === "auto"
      ? (validCurrentBilling ? levelForAmount(billing.amount) : "ultra")
      : selection;
    tx.set(ref, {
      mode: selection === "auto" ? "auto" : "manual",
      level,
      ...(selection === "auto" ? { lastAutoLevel: level } : {}),
      changedAt: now.toISOString(),
      changedBy: uid
    }, { merge: true });
    return { mode: selection === "auto" ? "auto" : "manual", level, limits: LEVELS[level] };
  });
}

async function getPolicy(db, now = new Date()) {
  const data = (await controlRef(db).get()).data() || {};
  let level = Object.hasOwn(LEVELS, data.level) ? data.level : "off";
  if (data.mode === "auto") {
    const billing = (await db.collection("savings_billing").doc("current").get()).data() || {};
    const validCurrentBilling = billing.month === dayKey(now).slice(0, 7)
      && billing.currency === "MXN" && Number.isFinite(billing.amount) && billing.amount >= 0;
    level = validCurrentBilling ? levelForAmount(billing.amount) : "ultra";
  }
  return { mode: data.mode === "auto" ? "auto" : "manual", level, limits: LEVELS[level], changedAt: data.changedAt || null };
}

function quotaRef(db, uid, date = new Date()) {
  return db.collection("savings_daily_quotas").doc(`${dayKey(date)}_${cleanId(uid)}`);
}

function permitId(uid, category, objectId) { return `${cleanId(uid)}_${cleanId(category)}_${cleanId(objectId)}`; }

async function issuePermit(db, uid, category, objectId) {
  const id = permitId(uid, category, objectId);
  const date = dayKey();
  const expiresAtMs = Date.parse(`${date}T00:00:00-05:00`) + 24 * 60 * 60 * 1000;
  const { admin } = getAdminServices();
  await db.collection("savings_permits").doc(id).set({ ownerId: uid, category, objectId, day: date, expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs) });
  return id;
}

function reject(code, detail = {}) {
  throw Object.assign(new Error(code), { status: 429, code, detail });
}

// A claim is keyed to a durable object, so retries and two open tabs cannot spend twice.
async function claimDaily(db, uid, category, objectId, limit, { completed = true } = {}) {
  if (limit == null) return { allowed: true, level: "off" };
  const id = cleanId(objectId);
  const ref = quotaRef(db, uid);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data() || {};
    const claims = data[category] && typeof data[category] === "object" ? data[category] : {};
    if (claims[id]) return { allowed: true, existing: true, status: claims[id].status };
    if (Object.keys(claims).length >= limit) reject("savings_daily_limit", { category, limit, day: dayKey() });
    tx.set(ref, { ownerId: uid, day: dayKey(), [category]: { ...claims, [id]: { status: completed ? "complete" : "reserved", at: Date.now() } } }, { merge: true });
    return { allowed: true, existing: false, status: completed ? "complete" : "reserved" };
  });
}

async function claimManyDaily(db, uid, category, objectIds, limit) {
  if (limit == null) return { allowed: true };
  const ids = [...new Set(objectIds.map(cleanId))];
  if (!ids.length) return { allowed: true };
  const ref = quotaRef(db, uid);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    const claims = data[category] && typeof data[category] === "object" ? data[category] : {};
    const missing = ids.filter((id) => !claims[id]);
    if (Object.keys(claims).length + missing.length > limit) reject("savings_daily_limit", { category, limit, day: dayKey() });
    if (missing.length) {
      const at = Date.now();
      tx.set(ref, { ownerId: uid, day: dayKey(), [category]: { ...claims, ...Object.fromEntries(missing.map((id) => [id, { status: "complete", at }])) } }, { merge: true });
    }
    return { allowed: true, claimed: missing.length };
  });
}

async function completeDaily(db, uid, category, objectId) {
  const id = cleanId(objectId);
  const ref = quotaRef(db, uid);
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    const claims = data[category] || {};
    if (claims[id]?.status !== "reserved") return;
    tx.update(ref, { [`${category}.${id}.status`]: "complete" });
  });
}

async function releaseDaily(db, uid, category, objectId) {
  const id = cleanId(objectId);
  const ref = quotaRef(db, uid);
  const { admin } = getAdminServices();
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    if (data[category]?.[id]?.status === "reserved") tx.update(ref, { [`${category}.${id}`]: admin.firestore.FieldValue.delete() });
  });
}

async function claimVeo(db, uid, objectId, minutes, sceneNumber, { blocked = false } = {}) {
  if (!minutes) return { allowed: true };
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber % 2 === 0) reject("savings_image_scene_required", { sceneNumber });
  const id = cleanId(objectId);
  const ref = db.collection("savings_veo_cooldowns").doc(cleanId(uid));
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    if (data.requestId === id) return { allowed: true, existing: true, nextAt: data.nextAt };
    if (blocked) reject("savings_veo_disabled");
    if (Number(data.nextAt || 0) > Date.now()) reject("savings_veo_cooldown", { nextAt: data.nextAt });
    const nextAt = Date.now() + minutes * 60_000;
    tx.set(ref, { ownerId: uid, requestId: id, nextAt, updatedAt: Date.now() });
    return { allowed: true, nextAt };
  });
}

async function claimScript(db, uid, scriptSessionId) {
  const ref = quotaRef(db, uid);
  const id = cleanId(scriptSessionId);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() || {};
    if (data.imageScriptSessionId && data.imageScriptSessionId !== id) reject("savings_script_limit", { day: dayKey() });
    if (!data.imageScriptSessionId) tx.set(ref, { ownerId: uid, day: dayKey(), imageScriptSessionId: id }, { merge: true });
    return { allowed: true, scriptSessionId: id };
  });
}

function podcasterIsVideo(session = {}) {
  const mode = String(session?.podcastStudioUiState?.composerGenerationMode || "").toLowerCase();
  const type = String(session?.script?.videoContentType || session?.videoContentType || "").toLowerCase();
  return mode === "video" || ["creative", "videopodcast", "video"].includes(type);
}

async function guardPodcasterSession(db, uid, session, existing = null) {
  const policy = await getPolicy(db);
  if (policy.level === "off") return;
  if (!existing) await claimDaily(db, uid, "podcasterSessions", session.id, policy.limits.podcasterSessions);
  if (podcasterIsVideo(session) && !podcasterIsVideo(existing || {})) {
    await claimDaily(db, uid, "videoSessions", session.id, policy.limits.videoSessions);
  }
}

function registerSavingsRoutes(app) {
  app.get("/api/savings/policy", asyncRoute(async (req, res) => {
    const auth = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const [policy, admin, quota] = await Promise.all([getPolicy(db), hasAdminRoleWithProfile(auth, db), quotaRef(db, auth.uid).get()]);
    const result = { mode: policy.mode, level: policy.level, limits: policy.limits, day: dayKey(), used: Object.fromEntries(Object.entries(quota.data() || {}).filter(([key]) => !["ownerId", "day"].includes(key)).map(([key, value]) => [key, value && typeof value === "object" ? Object.keys(value).length : value])), isAdmin: admin };
    if (admin) {
      const billing = (await db.collection("savings_billing").doc("current").get()).data() || {};
      result.billing = { month: billing.month || null, amount: billing.amount ?? null, currency: billing.currency || "MXN", threshold: billing.threshold || 0, updatedAt: billing.updatedAt || null };
      // Required lazily because gemini-free-tier.js reads the helpers exported here.
      // Reported in every savings level, including off: PigPen's text defaults to this
      // model whether the mode is on or not, so the panel has to show it either way.
      const freeTier = require("./gemini-free-tier.js");
      result.freeTier = await freeTier.describeFreeTierState(db);
    }
    res.json(result);
  }));
  app.put("/api/savings/policy", asyncRoute(async (req, res) => {
    const auth = await resolveAuthContext(req);
    const { db } = getAdminServices();
    if (!await hasAdminRoleWithProfile(auth, db)) throw Object.assign(new Error("savings_admin_required"), { status: 403 });
    const selection = String(req.body?.level || "");
    res.json(await changePolicy(db, selection, auth.uid));
  }));
  app.post("/api/savings/claim", asyncRoute(async (req, res) => {
    const auth = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const policy = await getPolicy(db);
    const category = String(req.body?.category || "");
    const objectId = cleanId(req.body?.objectId);
    const map = { podcasterSessions: "podcasterSessions", videoSessions: "videoSessions", pigpenTopics: "pigpenTopics", marcieSessions: "marcieSessions", marcieAudiences: "marcieAudiences", charlySessions: "charlySessions", imagePhotos: "imagePhotos" };
    if (!map[category] && category !== "imageScript") throw Object.assign(new Error("savings_invalid_category"), { status: 400 });
    const result = category === "imageScript"
      ? (policy.level === "off" ? { allowed: true } : await claimScript(db, auth.uid, objectId))
      : await claimDaily(db, auth.uid, category, objectId, category === "imagePhotos" ? (policy.level === "off" ? null : 10) : policy.limits[map[category]], { completed: !["pigpenTopics", "imagePhotos"].includes(category) });
    const permit = policy.level !== "off" && ["podcasterSessions", "videoSessions", "marcieSessions", "charlySessions"].includes(category)
      ? await issuePermit(db, auth.uid, category, objectId) : null;
    res.json({ ...result, permit, level: policy.level, day: dayKey() });
  }));
  app.post("/api/savings/claim-many", asyncRoute(async (req, res) => {
    const auth = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const category = String(req.body?.category || "");
    const ids = req.body?.objectIds;
    if (category !== "marcieAudiences" || !Array.isArray(ids) || ids.length > 4) throw Object.assign(new Error("savings_invalid_claim"), { status: 400 });
    const policy = await getPolicy(db);
    res.json(await claimManyDaily(db, auth.uid, category, ids, policy.limits.marcieAudiences));
  }));
  app.post("/api/savings/complete", asyncRoute(async (req, res) => {
    const auth = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const category = String(req.body?.category || "");
    if (category !== "pigpenTopics") throw Object.assign(new Error("savings_invalid_category"), { status: 400 });
    await completeDaily(db, auth.uid, category, req.body?.objectId);
    res.json({ ok: true });
  }));
  app.post("/api/savings/release", asyncRoute(async (req, res) => {
    const auth = await resolveAuthContext(req);
    const { db } = getAdminServices();
    const category = String(req.body?.category || "");
    if (category !== "pigpenTopics") throw Object.assign(new Error("savings_invalid_category"), { status: 400 });
    await releaseDaily(db, auth.uid, category, req.body?.objectId);
    res.json({ ok: true });
  }));
}

module.exports = { LEVELS, dayKey, levelForAmount, changePolicy, getPolicy, claimDaily, claimManyDaily, completeDaily, releaseDaily, claimVeo, claimScript, guardPodcasterSession, registerSavingsRoutes, quotaRef };
