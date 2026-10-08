const test = require("node:test");
const assert = require("node:assert/strict");
const { dayKey } = require("../src/savings-policy.js");
const { retryPolicy } = require("../src/pigpen-generation-policy.js");
const { claimTextCall, settleTextCall, readBudget, describeFreeTierState, GLOBAL_UID } = require("../src/gemini-free-tier.js");

function memoryDb() {
  const documents = new Map();
  const ref = (path) => ({ path, async get() { return { data: () => documents.get(path) }; } });
  return {
    documents,
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

const CAP_ENV = "GEMINI_FREE_TIER_DAILY_CALL_CAP";
const COOLDOWN_ENV = "GEMINI_FREE_TIER_COOLDOWN_MS";

async function withEnv(values, run) {
  const previous = Object.fromEntries([CAP_ENV, COOLDOWN_ENV].map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = String(value);
  try {
    return await run();
  } finally {
    for (const key of [CAP_ENV, COOLDOWN_ENV]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

// 2026-10-05 is a day whose Cancun date equals its UTC date mid-afternoon.
const NOW = Date.parse("2026-10-05T18:00:00Z");
const DAY = dayKey(new Date(NOW));

test("the Cancun day boundary keys the shared bucket, same as per-user quotas", () => {
  assert.equal(dayKey(new Date("2026-10-01T04:59:59Z")), "2026-09-30");
  assert.equal(dayKey(new Date("2026-10-01T05:00:00Z")), "2026-10-01");
});

test("claims count against savings_daily_quotas/<day>_global", async () => {
  const db = memoryDb();
  await withEnv({ [CAP_ENV]: 3 }, async () => {
    assert.deepEqual(await claimTextCall(db, { now: NOW }), { allowed: true, calls: 1, cap: 3 });
    assert.equal((await claimTextCall(db, { now: NOW })).calls, 2);
  });
  const data = db.documents.get(`savings_daily_quotas/${DAY}_global`);
  assert.equal(data.ownerId, GLOBAL_UID);
  assert.equal(data.day, DAY);
  assert.equal(data.freeTextCalls, 2);
  assert.equal(data.freeTextLastAt, NOW);
});

test("the daily cap stops claims for the rest of the day", async () => {
  const db = memoryDb();
  await withEnv({ [CAP_ENV]: 2 }, async () => {
    await claimTextCall(db, { now: NOW });
    await claimTextCall(db, { now: NOW });
    const error = await claimTextCall(db, { now: NOW }).then(() => null, (caught) => caught);
    assert.equal(error.code, "pigpen_free_tier_exhausted");
    assert.equal(error.status, 429);
    assert.equal(error.permanentToday, true);
    // Cancun midnight is 05:00 UTC the next day.
    assert.equal(error.detail.nextRetryAt, Date.parse("2026-10-06T05:00:00Z"));
    assert.equal((await readBudget(db, NOW)).exhausted, true);
    assert.equal((await readBudget(db, Date.parse("2026-10-06T05:00:00Z"))).exhausted, false);
  });
});

test("a provider 429 cools the bucket down without spending the whole day", async () => {
  const db = memoryDb();
  await withEnv({ [CAP_ENV]: 100, [COOLDOWN_ENV]: 60_000 }, async () => {
    await claimTextCall(db, { now: NOW });
    await settleTextCall(db, { ok: false, cooldownMs: 30_000, now: NOW });
    assert.equal((await readBudget(db, NOW)).cooldownUntil, NOW + 60_000);
    const error = await claimTextCall(db, { now: NOW + 1_000 }).then(() => null, (caught) => caught);
    assert.equal(error.code, "pigpen_free_tier_exhausted");
    assert.equal(error.permanentToday, false);
    assert.equal(error.detail.retryAfterSeconds, 59);
    // The queue waits out the cooldown instead of spending its three attempts on it.
    assert.equal(error.retryAfterMs, 59_000);
    const scheduled = retryPolicy(error, 1, NOW + 1_000);
    assert.equal(scheduled.status, "pending");
    assert.equal(scheduled.dueAt, NOW + 60_000);
    // A long provider hint is clamped so one bad retry-after cannot own the day.
    await settleTextCall(db, { ok: false, cooldownMs: 4 * 60 * 60_000, now: NOW });
    assert.equal((await readBudget(db, NOW)).cooldownUntil, NOW + 15 * 60_000);
    assert.equal((await claimTextCall(db, { now: NOW + 16 * 60_000 })).allowed, true);
  });
});

test("successful calls accumulate tokens and clear an expired cooldown", async () => {
  const db = memoryDb();
  await withEnv({ [CAP_ENV]: 100, [COOLDOWN_ENV]: 60_000 }, async () => {
    await settleTextCall(db, { ok: false, cooldownMs: 5_000, now: NOW });
    await claimTextCall(db, { now: NOW + 60_000 });
    await settleTextCall(db, {
      ok: true, now: NOW + 61_000, savedMxn: 1.25,
      usage: { promptTokenCount: 900, candidatesTokenCount: 200, thoughtsTokenCount: 50 }
    });
    const budget = await readBudget(db, NOW + 61_000);
    assert.equal(budget.calls, 1);
    assert.equal(budget.promptTokens, 900);
    assert.equal(budget.outputTokens, 250);
    assert.equal(budget.savedMxn, 1.25);
    assert.equal(budget.cooldownUntil, 0);
    assert.equal(budget.exhausted, false);
  });
});

test("describeFreeTierState reports the bucket for the savings endpoint", async () => {
  const db = memoryDb();
  const previous = { ...process.env };
  try {
    process.env.GEMINI_FREE_TIER_ENABLED = "true";
    process.env.GEMINI_FREE_TIER_PLAN = "free";
    process.env.GEMINI_FREE_TIER_API_KEY = "test-key";
    process.env.GEMINI_FREE_TIER_TEXT_MODEL = "gemini-2.5-flash-lite";
    process.env.GEMINI_FREE_TIER_DAILY_CALL_CAP = "850";
    await claimTextCall(db, { now: NOW });
    const state = await describeFreeTierState(db, NOW);
    assert.deepEqual(state, {
      enabled: true,
      keyConfigured: true,
      planVerified: true,
      model: "gemini-2.5-flash-lite",
      dailyCallCap: 850,
      reviewOnFreeTier: true,
      usedToday: 1,
      promptTokensToday: 0,
      outputTokensToday: 0,
      estimatedSavedMxnToday: 0,
      cooldownUntil: 0,
      exhausted: false
    });
  } finally {
    process.env = previous;
  }
});
