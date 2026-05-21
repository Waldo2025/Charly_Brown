import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const videoGeneratorSource = readFileSync(new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url), "utf8");
const playbackControllerSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

test("scene video regeneration invalidates both previous and new media sources", () => {
  assert.match(
    videoGeneratorSource,
    /const previousClip = resolveDialogueVideoForRow\(session, key\);[\s\S]*?playbackController\.invalidateRowMediaCache\(key, getActiveSession\(\), \{[\s\S]*?previousClip,[\s\S]*?nextClip: finalClip[\s\S]*?\}\);/m
  );
});

test("row media cache invalidation accepts explicit clip sources", () => {
  assert.match(
    playbackControllerSource,
    /invalidateRowMediaCache\(rowId = "", session = null, options = \{\}\)[\s\S]*?const explicitClips = \[\][\s\S]*?options\?\.previousClip[\s\S]*?options\?\.nextClip[\s\S]*?const urlsToInvalidate = new Set\(explicitClips\.flatMap\(\(clip\) => collectClipUrls\(clip\)\)\);/m
  );
});
