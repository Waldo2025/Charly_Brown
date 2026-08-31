const assert = require("node:assert/strict");
const test = require("node:test");
const {
  activityMetadata,
  decodeFirestoreValue,
  encodeFirestoreValue,
  resolveOwnedSessionSnapshot,
  sessionMetadata
} = require("../src/science-activities.js");

test("science session list metadata omits the activity body", () => {
  const document = {
    id: "remote-sim",
    data: () => ({
      localId: "local-sim",
      savedAt: "2026-08-11T10:00:00.000Z",
      activity: { title: "Óptica", subject: "physics", topic: "Refracción", gameMode: "simulator", controls: [{ id: "angle" }] }
    })
  };
  const metadata = sessionMetadata(document);
  assert.deepEqual(metadata, {
    firebaseDocId: "remote-sim",
    localId: "local-sim",
    savedAt: "2026-08-11T10:00:00.000Z",
    title: "Óptica",
    subject: "physics",
    topic: "Refracción",
    gameMode: "simulator"
  });
  assert.equal(Object.hasOwn(metadata, "activity"), false);
});

test("science activity metadata normalizes legacy lab sessions as simulators", () => {
  assert.equal(activityMetadata({ title: "Laboratorio", gameMode: "lab" }).gameMode, "simulator");
});

test("science activity detail preserves nested arrays", () => {
  const activity = { title: "Modelo", table: [[1, 2], [3, 4]] };
  assert.deepEqual(decodeFirestoreValue(encodeFirestoreValue(activity)), activity);
});

test("science activity detail recovers a legacy document through localId", async () => {
  const legacyDocument = {
    id: "actual-document-id",
    exists: true,
    data: () => ({ ownerId: "user-1", localId: "local-session-id" })
  };
  const query = {
    where() { return this; },
    limit() { return this; },
    async get() { return { empty: false, docs: [legacyDocument] }; }
  };
  const db = {
    collection() {
      return {
        doc() { return { async get() { return { exists: false }; } }; },
        where: query.where.bind(query)
      };
    }
  };

  const snapshot = await resolveOwnedSessionSnapshot(db, "user-1", "stale-document-id", "local-session-id");
  assert.equal(snapshot.id, "actual-document-id");
});
