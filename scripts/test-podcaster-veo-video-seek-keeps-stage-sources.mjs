import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

assert.match(
  source,
  /hideStageVideoElementPreservingSource\(video = null, options = \{\}\)/,
  "Playback controller should have a hide helper that pauses/hides stage video without clearing the loaded source."
);

const hideHelperBody = source.slice(
  source.indexOf("hideStageVideoElementPreservingSource(video = null, options = {})"),
  source.indexOf("// --- Lifecycle ---")
);

assert.doesNotMatch(
  hideHelperBody,
  /removeAttribute\("src"\)|delete video\.dataset\.src|releaseTransientStageVideoObjectUrl/,
  "The preserve-source hide helper must not clear src, dataset.src, or transient object URLs."
);

const stageMediaBody = source.slice(
  source.indexOf("async syncStageMedia(rowId = \"\", options = {})"),
  source.indexOf("\n}\n\nfunction escapeHtml")
);

assert.match(
  stageMediaBody,
  /this\.hideStageVideoElementPreservingSource\(video, \{ clearRowId: true \}\);/,
  "syncStageMedia should hide empty-selection stage videos without unloading their media."
);

assert.match(
  stageMediaBody,
  /this\.hideStageVideoElementPreservingSource\(inactiveVideo\);/,
  "syncStageMedia should preserve inactive VEO video slots instead of clearing src during scene switches."
);

assert.match(
  stageMediaBody,
  /this\.hideStageVideoElementPreservingSource\(video\);/,
  "Image/color scene transitions should hide video slots without forcing VEO reloads when returning to video scenes."
);

console.log("VEO stage video seek preservation regression checks passed.");
