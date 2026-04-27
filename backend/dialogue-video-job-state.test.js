const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeDialogueVideoJobPublicPayload
} = require("./dialogue-video-job-state.js");

test("includes public execution fields for dialogue video jobs", () => {
  const payload = sanitizeDialogueVideoJobPublicPayload({
    jobId: "job_123",
    status: "running",
    stage: "poll_operation",
    progress: 0.45,
    hint: "Esperando a Veo.",
    segmentIndex: 1,
    segmentCount: 3,
    attempt: 2,
    model: "veo-3.1-generate-preview",
    variant: "reference-continuity+aspect",
    rowId: "row_1"
  });

  assert.equal(payload.jobId, "job_123");
  assert.equal(payload.stage, "poll_operation");
  assert.equal(payload.segmentIndex, 1);
  assert.equal(payload.segmentCount, 3);
  assert.equal(payload.attempt, 2);
  assert.equal(payload.model, "veo-3.1-generate-preview");
  assert.equal(payload.variant, "reference-continuity+aspect");
  assert.equal(payload.rowId, "row_1");
});
