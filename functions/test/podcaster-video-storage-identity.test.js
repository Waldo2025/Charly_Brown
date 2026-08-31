const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCanonicalDialogueVideoStoragePath } = require("../src/ai-jobs.js");
const { resolveSessionMediaIdentity } = require("../src/podcaster-data.js");

test("generated Veo video uses session, owner, row and job identity instead of sample_0", () => {
  const storagePath = buildCanonicalDialogueVideoStoragePath({
    sessionId: "session_demo",
    ownerId: "owner_demo",
    jobId: "job_123"
  }, {
    rowId: "row_scene_7"
  }, "video/mp4");

  assert.equal(
    storagePath,
    "podcaster/sessions/session_demo/owners/owner_demo/videos/row_scene_7/job_123.mp4"
  );
  assert.doesNotMatch(storagePath, /sample_0/i);
});

test("legacy sample_0 media gets a unique job label and its scene row from the session map", () => {
  const storagePath = "podcaster/sessions/session_demo/owners/owner_demo/generated/dialogue-video/job_legacy/sample_0.mp4";
  const identity = resolveSessionMediaIdentity(storagePath, {}, new Map([[storagePath, "row_scene_7"]]));

  assert.deepEqual(identity, {
    id: "job_legacy",
    name: "job_legacy.mp4",
    originalName: "sample_0.mp4",
    rowFolder: "row_scene_7",
    rowId: "row_scene_7"
  });
});

test("a stale session can recover a legacy sample_0 row from its Veo job", () => {
  const storagePath = "podcaster/sessions/session_demo/owners/owner_demo/generated/dialogue-video/job_recent/sample_0.mp4";
  const identity = resolveSessionMediaIdentity(
    storagePath,
    {},
    new Map(),
    new Map([["job_recent", "row_scene_9"]])
  );

  assert.equal(identity.id, "job_recent");
  assert.equal(identity.name, "job_recent.mp4");
  assert.equal(identity.rowId, "row_scene_9");
});
