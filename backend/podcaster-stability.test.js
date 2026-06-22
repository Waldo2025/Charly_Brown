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

test("heavy work coordinator allows one montage export and one dialogue video at the same time", () => {
  const coordinator = createHeavyWorkCoordinator({
    montageExportMaxConcurrent: 2,
    dialogueVideoMaxConcurrent: 1
  });

  const first = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-1");
  assert.equal(first.ok, true);

  const second = coordinator.tryAcquireHeavyWorkSlot("dialogue_video", "job-video-1");
  assert.equal(second.ok, true);

  coordinator.releaseHeavyWorkSlot("montage_export", "job-export-1");
  coordinator.releaseHeavyWorkSlot("dialogue_video", "job-video-1");
});

test("heavy work coordinator allows multiple montage exports until the configured limit", () => {
  const coordinator = createHeavyWorkCoordinator({
    montageExportMaxConcurrent: 2,
    dialogueVideoMaxConcurrent: 1
  });

  const first = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-1");
  assert.equal(first.ok, true);

  const second = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-2");
  assert.equal(second.ok, true);
  assert.deepEqual(coordinator.getActiveJobIds("montage_export"), ["job-export-1", "job-export-2"]);

  coordinator.releaseHeavyWorkSlot("montage_export", "job-export-1");
  coordinator.releaseHeavyWorkSlot("montage_export", "job-export-2");
});

test("heavy work coordinator blocks a montage export once the configured limit is full", () => {
  const coordinator = createHeavyWorkCoordinator({
    montageExportMaxConcurrent: 2,
    dialogueVideoMaxConcurrent: 1
  });

  const first = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-1");
  assert.equal(first.ok, true);

  const second = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-2");
  assert.equal(second.ok, true);

  const third = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-3");
  assert.equal(third.ok, false);
  assert.equal(third.error.detail.kind, "montage_export");
  assert.equal(third.error.detail.requestedKind, "montage_export");
  assert.equal(third.error.detail.activeJobId, "job-export-1");
  assert.deepEqual(third.error.detail.activeJobIds, ["job-export-1", "job-export-2"]);
  assert.equal(third.error.detail.activeCount, 2);
  assert.equal(third.error.detail.maxConcurrent, 2);
});

test("heavy work coordinator can release one montage export without affecting the others", () => {
  const coordinator = createHeavyWorkCoordinator({
    montageExportMaxConcurrent: 2,
    dialogueVideoMaxConcurrent: 1
  });

  const first = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-1");
  assert.equal(first.ok, true);

  const second = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-2");
  assert.equal(second.ok, true);

  assert.equal(coordinator.releaseHeavyWorkSlot("montage_export", "job-export-1"), true);
  assert.deepEqual(coordinator.getActiveJobIds("montage_export"), ["job-export-2"]);

  const third = coordinator.tryAcquireHeavyWorkSlot("montage_export", "job-export-3");
  assert.equal(third.ok, true);
  assert.deepEqual(coordinator.getActiveJobIds("montage_export"), ["job-export-2", "job-export-3"]);

  coordinator.releaseHeavyWorkSlot("montage_export", "job-export-2");
  coordinator.releaseHeavyWorkSlot("montage_export", "job-export-3");
});

test("heavy work coordinator blocks a second dialogue video while one is active", () => {
  const coordinator = createHeavyWorkCoordinator({
    montageExportMaxConcurrent: 2,
    dialogueVideoMaxConcurrent: 1
  });

  const first = coordinator.tryAcquireHeavyWorkSlot("dialogue_video", "job-video-1");
  assert.equal(first.ok, true);

  const second = coordinator.tryAcquireHeavyWorkSlot("dialogue_video", "job-video-2");
  assert.equal(second.ok, false);
  assert.equal(second.error.detail.kind, "dialogue_video");
  assert.equal(second.error.detail.requestedKind, "dialogue_video");
  assert.equal(second.error.detail.activeJobId, "job-video-1");
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
