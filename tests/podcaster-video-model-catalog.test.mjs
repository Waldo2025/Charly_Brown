import test from "node:test";
import assert from "node:assert/strict";
import {
  VERTEX_VEO_MODEL_FALLBACKS,
  collectAvailablePodcasterVideoModels,
  formatPodcasterVideoModelLabel,
  normalizeVertexVeoModelId
} from "../public/podcaster/podcaster-video-model-catalog.js";

test("fallback catalog contains every Veo model returned by Vertex Model Garden", () => {
  assert.deepEqual(VERTEX_VEO_MODEL_FALLBACKS, [
    "veo-3.1-generate-001",
    "veo-3.1-fast-generate-001",
    "veo-3.1-lite-generate-001",
    "veo-3.0-generate-001",
    "veo-3.0-fast-generate-001",
    "veo-2.0-generate-001"
  ]);
});

test("dynamic catalog accepts a future official Veo model without dropping fallbacks", () => {
  const models = collectAvailablePodcasterVideoModels([
    { name: "publishers/google/models/veo-4.0-fast-generate-001" }
  ]);
  assert.ok(models.includes("veo-4.0-fast-generate-001"));
  for (const fallback of VERTEX_VEO_MODEL_FALLBACKS) assert.ok(models.includes(fallback));
});

test("preview aliases migrate to their Vertex IDs and labels expose stage", () => {
  assert.equal(normalizeVertexVeoModelId("veo-3.1-lite-generate-preview"), "veo-3.1-lite-generate-001");
  assert.equal(formatPodcasterVideoModelLabel("veo-3.1-lite-generate-001"), "Veo 3.1 Lite · Preview");
  assert.equal(formatPodcasterVideoModelLabel("veo-3.1-generate-001"), "Veo 3.1 Standard · GA");
});
