import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const timeline = fs.readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
const podcaster = fs.readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const replacement = fs.readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
const assets = fs.readFileSync(new URL("../functions/src/assets.js", import.meta.url), "utf8");

assert.match(timeline, /function loadTimelinePreviewImage[\s\S]*?resolveStageImageSource\(logicalSrc\)/);
assert.doesNotMatch(timeline, /<img src="\$\{escapeHtml\((?:clipSrc|videoSrc)\)\}" alt="Preview"/);
assert.match(podcaster, /nextMedia\.dataset\.previewSrc = videoSrc;[\s\S]*?loadTimelinePreviewImage\(nextMedia\)/);
assert.doesNotMatch(podcaster, /if \(wantsImage\) \{\s*nextMedia\.src = videoSrc;/);
assert.match(replacement, /function loadReplacementPreviewElement[\s\S]*?resolveAuthorizedReplacementPreviewUrl/);
assert.doesNotMatch(replacement, /<(?:img|video) src="\$\{escapeHtml\(previewUrl\)\}/);
assert.match(assets, /if \(clean\.startsWith\("gs:\/\/"\)\)[\s\S]*?withoutScheme\.slice\(slashIndex \+ 1\)/);

const require = createRequire(import.meta.url);
const { normalizeStoragePath } = require("../functions/src/assets.js");
assert.equal(
  normalizeStoragePath("gs://charly-brown.firebasestorage.app/podcaster/sessions/session_1/owners/user/videos/scene.mov"),
  "podcaster/sessions/session_1/owners/user/videos/scene.mov"
);

console.log("Podcaster private preview routes OK.");
