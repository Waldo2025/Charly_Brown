const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateMontageExportPreflight,
  createMontageExportPreflightError
} = require("./preflight-validation.js");

function baseInput(overrides = {}) {
  return {
    sessionId: "session_123",
    exportMode: "normal",
    format: "mp4_h264",
    resolution: "source",
    renderMode: "browser",
    entriesRaw: [{}],
    entries: [
      {
        rowId: "row_1",
        sceneIndex: 1,
        durationMs: 2400,
        timelineStartMs: 0,
        timelineEndMs: 2400,
        video: {
          storagePath: "podcaster/session_123/scene-1.mp4",
          mimeType: "video/mp4"
        }
      }
    ],
    ...overrides
  };
}

test("validateMontageExportPreflight blocks a scene without a backend-renderable visual source", () => {
  const result = validateMontageExportPreflight(baseInput({
    entries: [
      {
        rowId: "row_2",
        sceneIndex: 2,
        durationMs: 1800,
        video: {
          localMediaCacheKey: "podcaster:session_123:local:row_2",
          mimeType: "video/mp4"
        }
      }
    ]
  }));

  assert.equal(result.ok, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, "missing_visual_source");
  assert.equal(result.issues[0].sceneIndex, 2);
  assert.equal(result.issues[0].rowId, "row_2");
});

test("validateMontageExportPreflight accepts synthetic background scenes without media", () => {
  const result = validateMontageExportPreflight(baseInput({
    entries: [
      {
        rowId: "row_bg",
        sceneIndex: 1,
        durationMs: 1800,
        backgroundColor: "linear-gradient(135deg, #7028e4, #e5b2ca)",
        video: {
          localMediaCacheKey: "podcaster:session_123:local:row_bg",
          mimeType: "video/mp4"
        }
      }
    ]
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("validateMontageExportPreflight accepts downloadUrl as a renderable visual source", () => {
  const result = validateMontageExportPreflight(baseInput({
    entries: [
      {
        rowId: "row_download",
        sceneIndex: 1,
        durationMs: 1800,
        video: {
          downloadUrl: "https://example.test/video.mp4",
          mimeType: "video/mp4"
        }
      }
    ]
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("createMontageExportPreflightError returns a 422 error with issue details", () => {
  const result = validateMontageExportPreflight(baseInput({ entries: [] }));
  const error = createMontageExportPreflightError(result);

  assert.equal(error.status, 422);
  assert.equal(error.code, "montage_export_preflight_failed");
  assert.equal(error.detail.issueCount, 1);
  assert.equal(error.detail.issues[0].code, "empty_entries");
});
