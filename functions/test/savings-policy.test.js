const test = require("node:test");
const assert = require("node:assert/strict");
const { LEVELS, dayKey, levelForAmount, changePolicy, getPolicy, claimDaily, claimManyDaily, claimVeo } = require("../src/savings-policy.js");
const { parseBudgetMessage, recordBillingBudget } = require("../src/savings-billing.js");

function memoryDb() {
  const documents = new Map();
  const ref = (path) => ({ path, async get() { return { data: () => documents.get(path) }; } });
  return {
    collection(name) { return { doc(id) { return ref(`${name}/${id}`); } }; },
    async runTransaction(callback) {
      return callback({
        async get(item) { return { data: () => documents.get(item.path) }; },
        set(item, value, options) { documents.set(item.path, options?.merge ? { ...(documents.get(item.path) || {}), ...value } : value); },
        update(item, value) { documents.set(item.path, { ...(documents.get(item.path) || {}), ...value }); }
      });
    }
  };
}

test("Cancun day and all savings levels have the agreed limits", () => {
  assert.equal(dayKey(new Date("2026-10-01T04:59:59Z")), "2026-09-30");
  assert.equal(dayKey(new Date("2026-10-01T05:00:00Z")), "2026-10-01");
  assert.deepEqual([LEVELS.medium.veoMinutes, LEVELS.high.veoMinutes, LEVELS.ultra.veoMinutes], [10, 20, 30]);
  assert.deepEqual([LEVELS.medium.videoSessions, LEVELS.high.videoSessions, LEVELS.ultra.videoSessions], [1, 1, 0]);
  assert.deepEqual([LEVELS.medium.pigpenTopics, LEVELS.high.pigpenTopics, LEVELS.ultra.pigpenTopics], [4, 2, 1]);
});

test("daily quota accepts retries of the same object and rejects a second object", async () => {
  const db = memoryDb();
  assert.equal((await claimDaily(db, "user_1", "marcieSessions", "session_1", 1)).existing, false);
  assert.equal((await claimDaily(db, "user_1", "marcieSessions", "session_1", 1)).existing, true);
  await assert.rejects(claimDaily(db, "user_1", "marcieSessions", "session_2", 1), /savings_daily_limit/);
});

test("video creation stays in one session per user each day", async () => {
  const db = memoryDb();
  await claimDaily(db, "user_1", "videoSessions", "session_1", LEVELS.medium.videoSessions);
  assert.equal((await claimDaily(db, "user_1", "videoSessions", "session_1", LEVELS.high.videoSessions)).existing, true);
  await assert.rejects(claimDaily(db, "user_1", "videoSessions", "session_2", LEVELS.high.videoSessions), /savings_daily_limit/);
  await assert.rejects(claimDaily(db, "user_2", "videoSessions", "session_3", LEVELS.ultra.videoSessions), /savings_daily_limit/);
});

test("multiple Marcie audiences are claimed together without partial quota use", async () => {
  const db = memoryDb();
  await claimManyDaily(db, "user_1", "marcieAudiences", ["session_1_educators"], 2);
  await assert.rejects(claimManyDaily(db, "user_1", "marcieAudiences", ["session_1_students", "session_1_parents"], 2), /savings_daily_limit/);
  assert.equal((await claimManyDaily(db, "user_1", "marcieAudiences", ["session_1_students"], 2)).claimed, 1);
  assert.equal((await claimManyDaily(db, "user_1", "marcieAudiences", ["session_1_students"], 2)).claimed, 0);
});

test("Veo rejects even scenes and enforces a cross-session cooldown", async () => {
  const db = memoryDb();
  await assert.rejects(claimVeo(db, "user_1", "job_2", 10, 2), /savings_image_scene_required/);
  await claimVeo(db, "user_1", "job_1", 10, 1);
  assert.equal((await claimVeo(db, "user_1", "job_1", 10, 1)).existing, true);
  await assert.rejects(claimVeo(db, "user_1", "job_3", 10, 3), /savings_veo_cooldown/);
});

test("ultra blocks new Veo jobs but lets an already admitted job finish", async () => {
  const db = memoryDb();
  await claimVeo(db, "user_1", "accepted_job", 10, 1);
  assert.equal((await claimVeo(db, "user_1", "accepted_job", 30, 1, { blocked: true })).existing, true);
  await assert.rejects(claimVeo(db, "user_1", "new_job", 30, 3, { blocked: true }), /savings_veo_disabled/);
});

test("billing parser accepts MXN actual cost and rejects other currencies", () => {
  const wrap = (currencyCode) => ({ data: { message: { attributes: { budgetId: "budget_1" }, data: Buffer.from(JSON.stringify({ costAmount: 2345.6, currencyCode, costIntervalStart: "2026-09-01T05:00:00Z" })).toString("base64") } } });
  assert.equal(parseBudgetMessage(wrap("MXN")).amount, 2345.6);
  assert.throws(() => parseBudgetMessage(wrap("USD")), /savings_billing_invalid_payload/);
});

test("automatic savings follows exact MXN boundaries and manual selection stays fixed", async () => {
  const db = memoryDb();
  const now = new Date("2026-09-30T12:00:00Z");
  const message = (amount, interval = "2026-09-01T05:00:00Z") => ({ data: { message: {
    attributes: { budgetId: "budget_1" },
    data: Buffer.from(JSON.stringify({ costAmount: amount, currencyCode: "MXN", costIntervalStart: interval })).toString("base64")
  } } });
  assert.deepEqual([1999.99, 2000, 3500, 5000].map(levelForAmount), ["off", "medium", "high", "ultra"]);
  assert.equal((await changePolicy(db, "auto", "admin_1", now)).level, "ultra");
  await recordBillingBudget(message(1999.99), { db, expectedBudgetId: "budget_1", now });
  assert.equal((await db.collection("savings_control").doc("global").get()).data().level, "off");
  await recordBillingBudget(message(2000), { db, expectedBudgetId: "budget_1", now });
  assert.equal((await db.collection("savings_control").doc("global").get()).data().level, "medium");
  await recordBillingBudget(message(3500), { db, expectedBudgetId: "budget_1", now });
  assert.equal((await db.collection("savings_control").doc("global").get()).data().level, "high");
  await recordBillingBudget(message(5000), { db, expectedBudgetId: "budget_1", now });
  assert.equal((await db.collection("savings_control").doc("global").get()).data().level, "ultra");
  await recordBillingBudget(message(2000), { db, expectedBudgetId: "budget_1", now });
  assert.equal((await db.collection("savings_billing").doc("current").get()).data().amount, 5000);
  assert.equal((await changePolicy(db, "high", "admin_1", now)).level, "high");
  await recordBillingBudget(message(6000), { db, expectedBudgetId: "budget_1", now });
  assert.equal((await db.collection("savings_control").doc("global").get()).data().level, "high");
  assert.equal((await changePolicy(db, "auto", "admin_1", now)).level, "ultra");
  const nextMonth = new Date("2026-10-01T12:00:00Z");
  assert.equal((await changePolicy(db, "auto", "admin_1", nextMonth)).level, "ultra");
  assert.equal((await getPolicy(db, nextMonth)).level, "ultra");
  assert.equal((await recordBillingBudget(message(7000), { db, expectedBudgetId: "budget_1", now: nextMonth })).ignored, true);
  await recordBillingBudget(message(0, "2026-10-01T05:00:00Z"), { db, expectedBudgetId: "budget_1", now: nextMonth });
  assert.equal((await db.collection("savings_control").doc("global").get()).data().level, "off");
  assert.equal((await getPolicy(db, nextMonth)).level, "off");
});
