const assert = require("node:assert/strict");
const test = require("node:test");
const {
  activityMetadata,
  decodeFirestoreValue,
  encodeFirestoreValue,
  normalizeScienceTrimester,
  normalizeSessionLayout,
  resolveOwnedSessionSnapshot,
  resolveSessionLayoutWrite,
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
    trimester: "Trimestre 1",
    gameMode: "simulator"
  });
  assert.equal(Object.hasOwn(metadata, "activity"), false);
});

test("science activity metadata normalizes legacy lab sessions as simulators", () => {
  assert.equal(activityMetadata({ title: "Laboratorio", gameMode: "lab" }).gameMode, "simulator");
});

test("science activity metadata exposes canonical trimester values", () => {
  assert.equal(activityMetadata({ title: "Laboratorio", trimester: "Trim2" }).trimester, "Trimestre 2");
  assert.equal(normalizeScienceTrimester("trimestre_3"), "Trimestre 3");
});

test("science session layouts deduplicate membership without trusting owner input", () => {
  const layout = normalizeSessionLayout({
    updatedAt: "2026-08-31T18:00:00.000Z",
    groups: [
      { id: "group-1", name: "Primero", sessionIds: ["session-1", "session-2"] },
      { id: "group-2", name: "Segundo", sessionIds: ["session-2", "session-3"], collapsed: true }
    ]
  });
  assert.deepEqual(layout.groups.map((group) => group.sessionIds), [["session-1", "session-2"], ["session-3"]]);
  assert.equal(layout.groups[1].collapsed, true);
});

test("an older device cannot overwrite a newer session layout", () => {
  const newer = { updatedAt: "2026-08-31T19:00:00.000Z", groups: [{ id: "new", sessionIds: ["session-1"] }] };
  const older = { updatedAt: "2026-08-31T18:00:00.000Z", groups: [{ id: "old", sessionIds: ["session-2"] }] };
  const resolution = resolveSessionLayoutWrite(newer, older);
  assert.equal(resolution.applied, false);
  assert.equal(resolution.layout.groups[0].id, "new");
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
