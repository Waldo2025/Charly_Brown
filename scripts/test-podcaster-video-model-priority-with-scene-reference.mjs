import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createVeoVideo, normalizeVideoModel } = require("../backend/podcaster-video-provider.js");

assert.equal(
  normalizeVideoModel("veo-3.1-fast-generate-preview", "veo", "final"),
  "veo-3.1-fast-generate-preview",
  "Fast explícito debe conservarse; sólo el flujo HQ decide forzar Standard."
);
assert.equal(
  normalizeVideoModel("veo-3.1-generate-preview", "veo", "final"),
  "veo-3.1-generate-preview"
);

let generated = false;
const client = {
  models: {
    async generateVideos() {
      generated = true;
      return { name: "operations/unexpected", done: true };
    }
  },
  operations: { async getVideosOperation() { return {}; } }
};

await assert.rejects(
  createVeoVideo({
    client,
    model: "veo-3.1-lite-generate-preview",
    quality: "draft",
    prompt: "A continuous scene.",
    images: [{ data: "aW1hZ2U=", mimeType: "image/png" }]
  }),
  (error) => error?.code === "veo_lite_reference_images_unsupported"
);
assert.equal(generated, false, "Lite no debe ignorar referencias ni degradar silenciosamente a text-to-video.");

console.log("Podcaster explicit Veo model and reference policy OK.");
