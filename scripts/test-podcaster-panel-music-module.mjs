import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const repoRoot = "/Users/waldolopez/Documents/CharlyBrown";
const podcasterPath = path.join(repoRoot, "public/podcaster/podcaster.js");
const modulePath = path.join(repoRoot, "public/podcaster/podcaster-panel-music.js");

const podcasterSource = fs.readFileSync(podcasterPath, "utf8");
const moduleSource = fs.readFileSync(modulePath, "utf8");

assert.match(
  podcasterSource,
  /import\s+\{\s*createPodcasterPanelMusicApi\s*\}\s+from\s+"\.\/podcaster-panel-music\.js";/,
  "podcaster.js must import createPodcasterPanelMusicApi from podcaster-panel-music.js"
);

assert.doesNotMatch(
  podcasterSource,
  /let\s+panelMusicState\s*=\s*\{/,
  "panelMusicState should no longer be defined inline in podcaster.js"
);

[
  "resolvePanelMusicStorageKey",
  "normalizePanelMusicTrack",
  "buildUploadedPanelMusicSegments",
  "groupUploadedPanelMusicSegmentsByTrack",
  "getPanelMusicLoopSegments",
  "setAllSessionUploadedTracksEnabled",
  "toggleSessionUploadedTrackEnabled",
  "ensurePanelMusicTrackDuration",
  "togglePanelMusicLoopMute",
  "syncMusicControls",
  "syncPanelMusicStateFromSession",
  "stopPanelMusic",
  "startPanelMusic",
  "getPanelMontageMusicConfig"
].forEach((name) => {
  assert.doesNotMatch(
    podcasterSource,
    new RegExp(`function\\s+${name}\\s*\\(`),
    `${name} should be implemented in podcaster-panel-music.js, not inline in podcaster.js`
  );
});

assert.match(
  moduleSource,
  /export\s+function\s+createPodcasterPanelMusicApi\s*\(/,
  "podcaster-panel-music.js must export createPodcasterPanelMusicApi"
);

[
  "normalizePanelMusicTrack",
  "buildUploadedPanelMusicSegments",
  "groupUploadedPanelMusicSegmentsByTrack",
  "getPanelMusicLoopSegments",
  "syncMusicControls",
  "syncPanelMusicStateFromSession",
  "stopPanelMusic",
  "startPanelMusic",
  "getPanelMontageMusicConfig"
].forEach((name) => {
  assert.match(
    moduleSource,
    new RegExp(`function\\s+${name}\\s*\\(`),
    `${name} should exist in podcaster-panel-music.js`
  );
});

console.log("test-podcaster-panel-music-module: ok");
