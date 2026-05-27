const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createHeavyWorkCoordinator,
  estimateDataUrlBytes,
  validateDialogueVideoInlineReferenceBudget,
  DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT,
  DIALOGUE_VIDEO_MAX_REFERENCE_VIDEO_COUNT,
  DIALOGUE_VIDEO_MAX_CONTINUITY_FRAME_COUNT,
  DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES
} = require("./podcaster-stability.js");

test("heavy work coordinator blocks incompatible concurrent jobs", () => {
  const coordinator = createHeavyWorkCoordinator();

  const first = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-1");
  assert.equal(first.ok, true);

  const second = coordinator.tryAcquireHeavyWorkSlot("dialogue_video", "job-video-1");
  assert.equal(second.ok, false);
  assert.equal(second.error.code, "backend_busy");
  assert.equal(second.error.status, 503);
  assert.equal(second.error.detail.kind, "dialogue_video");
  assert.equal(second.error.detail.activeJobId, "job-export-1");

  coordinator.releaseHeavyWorkSlot("montage_export", "job-export-1");

  const third = coordinator.tryAcquireHeavyWorkSlot("dialogue_video", "job-video-1");
  assert.equal(third.ok, true);
});

test("estimateDataUrlBytes returns decoded payload size", () => {
  const bytes = estimateDataUrlBytes("data:image/png;base64,QUJDRA==");
  assert.equal(bytes, 4);
});

test("validateDialogueVideoInlineReferenceBudget trims useful image references to max count", () => {
  const result = validateDialogueVideoInlineReferenceBudget({
    referenceImageDataUrls: [
      "data:image/png;base64,QUJDRA==",
      "",
      "data:image/png;base64,QUJDREU=",
      "data:image/png;base64,QUJDREVG"
    ],
    referenceVideoDataUrl: "",
    continuityReferenceImageDataUrl: ""
  });

  assert.equal(result.referenceImageDataUrls.length, 3);
  assert.equal(result.referenceVideoDataUrl, "");
  assert.equal(result.continuityReferenceImageDataUrl, "");
  assert.equal(result.counts.imageReferences, 3);
  assert.equal(result.counts.videoReferences, 0);
  assert.equal(result.counts.continuityFrames, 0);
});

test("validateDialogueVideoInlineReferenceBudget rejects excessive inline bytes", () => {
  const oversizedPayload = Buffer.alloc(DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES + 64, 1).toString("base64");

  assert.throws(
    () => validateDialogueVideoInlineReferenceBudget({
      referenceImageDataUrls: [`data:image/png;base64,${oversizedPayload}`],
      referenceVideoDataUrl: "",
      continuityReferenceImageDataUrl: ""
    }),
    (error) => {
      assert.equal(error.code, "payload_too_large");
      assert.equal(error.status, 413);
      assert.equal(error.detail.maxInlineBytes, DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES);
      assert.ok(error.detail.totalInlineBytes > DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES);
      return true;
    }
  );
});

test("validateDialogueVideoInlineReferenceBudget enforces max one video and one continuity frame", () => {
  const result = validateDialogueVideoInlineReferenceBudget({
    referenceImageDataUrls: [],
    referenceVideoDataUrl: "data:video/mp4;base64,QUJDRA==",
    continuityReferenceImageDataUrl: "data:image/png;base64,QUJDRA=="
  });

  assert.equal(result.counts.imageReferences, 0);
  assert.equal(result.counts.videoReferences, DIALOGUE_VIDEO_MAX_REFERENCE_VIDEO_COUNT);
  assert.equal(result.counts.continuityFrames, DIALOGUE_VIDEO_MAX_CONTINUITY_FRAME_COUNT);
});

test("validateDialogueVideoInlineReferenceBudget includes single referenceImageDataUrl fallback", () => {
  const result = validateDialogueVideoInlineReferenceBudget({
    referenceImageDataUrls: [],
    referenceImageDataUrl: "data:image/png;base64,QUJDRA==",
    referenceVideoDataUrl: "",
    continuityReferenceImageDataUrl: ""
  });

  assert.equal(result.referenceImageDataUrls.length, 1);
  assert.equal(result.counts.imageReferences, 1);
});

test("validateDialogueVideoInlineReferenceBudget deduplicates repeated single-image fallback already present in the list", () => {
  const result = validateDialogueVideoInlineReferenceBudget({
    referenceImageDataUrls: ["data:image/png;base64,QUJDRA=="],
    referenceImageDataUrl: "data:image/png;base64,QUJDRA==",
    referenceVideoDataUrl: "",
    continuityReferenceImageDataUrl: ""
  });

  assert.deepEqual(result.referenceImageDataUrls, ["data:image/png;base64,QUJDRA=="]);
  assert.equal(result.counts.imageReferences, 1);
});
