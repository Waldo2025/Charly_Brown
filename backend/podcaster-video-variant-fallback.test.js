const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldContinueVariantFallback
} = require("./podcaster-video-variant-fallback.js");

test("continues trying variants after an operation completes without media", () => {
  const decision = shouldContinueVariantFallback({
    status: 502,
    reason: "done_without_media",
    variantIndex: 0,
    variantCount: 3
  });

  assert.equal(decision.continueCurrentModel, true);
  assert.equal(decision.remainingVariants, 2);
  assert.match(decision.logReason, /without media/i);
});

test("stops current model fallback when no variants remain", () => {
  const decision = shouldContinueVariantFallback({
    status: 502,
    reason: "done_without_media",
    variantIndex: 2,
    variantCount: 3
  });

  assert.equal(decision.continueCurrentModel, false);
  assert.equal(decision.remainingVariants, 0);
});
