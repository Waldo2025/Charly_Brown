const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterVeoVariantsForModel,
  veoModelSupportsReferenceImages,
  veoVariantUsesReferenceImages,
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

test("recognizes Veo 3.1 preview models that support referenceImages", () => {
  assert.equal(veoModelSupportsReferenceImages("veo-3.1-generate-preview"), true);
  assert.equal(veoModelSupportsReferenceImages("veo-3.1-fast-generate-preview"), true);
  assert.equal(veoModelSupportsReferenceImages("veo-3.1-generate-001"), false);
  assert.equal(veoModelSupportsReferenceImages("veo-3.1-fast-generate-001"), false);
  assert.equal(veoModelSupportsReferenceImages("veo-3.1-lite-generate-preview"), false);
  assert.equal(veoModelSupportsReferenceImages("veo-2.0-generate-001"), false);
});

test("detects and filters referenceImages variants for unsupported models", () => {
  const referenceVariant = {
    label: "reference-scene+aspect+duration",
    body: {
      instances: [{
        prompt: "Generate a short scene.",
        referenceImages: [{ referenceType: "asset", image: { bytesBase64Encoded: "abc", mimeType: "image/png" } }]
      }]
    }
  };
  const textVariant = {
    label: "text-only+aspect+duration",
    body: {
      instances: [{ prompt: "Generate a short scene." }]
    }
  };

  assert.equal(veoVariantUsesReferenceImages(referenceVariant), true);
  assert.equal(veoVariantUsesReferenceImages(textVariant), false);
  assert.deepEqual(
    filterVeoVariantsForModel([referenceVariant, textVariant], "veo-2.0-generate-001"),
    [textVariant]
  );
  assert.deepEqual(
    filterVeoVariantsForModel([referenceVariant, textVariant], "veo-3.1-generate-preview"),
    [referenceVariant, textVariant]
  );
  assert.deepEqual(
    filterVeoVariantsForModel([referenceVariant, textVariant], "veo-3.1-fast-generate-preview"),
    [referenceVariant, textVariant]
  );
  assert.deepEqual(
    filterVeoVariantsForModel([referenceVariant, textVariant], "veo-3.1-generate-001"),
    [textVariant]
  );
});
