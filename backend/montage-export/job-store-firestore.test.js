const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMontageExportJobStore
} = require("./job-store-firestore.js");

function createFakeDocStore() {
  const docs = new Map();

  const collection = () => ({
    doc(id) {
      return {
        id,
        async set(value, options = {}) {
          const previous = docs.get(id) || null;
          if (options && options.merge && previous && typeof previous === "object") {
            docs.set(id, { ...previous, ...value });
            return;
          }
          docs.set(id, value);
        },
        async get() {
          const value = docs.get(id);
          return {
            exists: docs.has(id),
            data() {
              return value;
            }
          };
        },
        async delete() {
          docs.delete(id);
        }
      };
    }
  });

  return {
    docs,
    collection
  };
}

test("createJob writes a durable queued montage export job", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T15:00:00.000Z"
  });

  const created = await store.createJob({
    jobId: "job-1",
    sessionId: "session-1",
    ownerId: "user-1",
    request: { filename: "montage.mp4" },
    totalScenes: 14
  });

  assert.equal(created.jobId, "job-1");
  assert.equal(created.type, "montage_export");
  assert.equal(created.status, "queued");
  assert.equal(created.stage, "queued");
  assert.equal(created.totalScenes, 14);
  assert.equal(created.ownerId, "user-1");
  assert.equal(created.request.filename, "montage.mp4");
  assert.equal(created.createdAt, "2026-04-27T15:00:00.000Z");
  assert.equal(fakeDb.docs.get("job-1").jobId, "job-1");
});

test("updateJob merges progress and heartbeat without deleting request metadata", async () => {
  const fakeDb = createFakeDocStore();
  const timestamps = [
    "2026-04-27T15:00:00.000Z",
    "2026-04-27T15:05:00.000Z"
  ];
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => timestamps.shift() || "2026-04-27T15:05:00.000Z"
  });

  await store.createJob({
    jobId: "job-2",
    sessionId: "session-2",
    ownerId: "user-2",
    request: { filename: "foo.mp4" },
    totalScenes: 8
  });

  const updated = await store.updateJob("job-2", {
    status: "running",
    stage: "render_scene_segments",
    progress: 0.5,
    currentSceneIndex: 4,
    sceneSubstage: "scene_ffmpeg_render",
    hint: "Renderizando escena 4."
  });

  assert.equal(updated.status, "running");
  assert.equal(updated.progress, 0.5);
  assert.equal(updated.currentSceneIndex, 4);
  assert.equal(updated.sceneSubstage, "scene_ffmpeg_render");
  assert.equal(updated.request.filename, "foo.mp4");
  assert.equal(updated.updatedAt, "2026-04-27T15:05:00.000Z");
  assert.equal(updated.heartbeatAt, "2026-04-27T15:05:00.000Z");
});

test("getJob returns null for expired montage export jobs", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T16:00:00.000Z"
  });

  fakeDb.docs.set("job-expired", {
    jobId: "job-expired",
    type: "montage_export",
    status: "error",
    stage: "error",
    expiresAt: "2026-04-27T15:59:59.000Z"
  });

  const found = await store.getJob("job-expired");
  assert.equal(found, null);
});
