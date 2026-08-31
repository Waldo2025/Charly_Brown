import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

test("Cmd/Ctrl+Shift+L opens Replace scene for the active row", () => {
  assert.match(source, /\(event\.metaKey \|\| event\.ctrlKey\)[\s\S]*event\.shiftKey[\s\S]*event\.code === "KeyL"/);
  assert.match(source, /podcastVideoState\.activeRowId[\s\S]*resolveTargetVideoRowId\(session\)/);
  assert.match(source, /openSceneVideoSelectorModal\(rowId, \{ triggerSource: "keyboard-shortcut-mod-shift-l" \}\)/);
});

test("scene media shortcut ignores text editing targets and lazy-loads its module", () => {
  assert.match(source, /isPodcasterEditingTextField\(event\.target\)/);
  assert.match(source, /import\(`\.\/podcaster-media-replacement\.js/);
});

test("scene generation shortcuts click the existing active-row action", () => {
  assert.match(source, /isRequestedSceneGenerateShortcut[\s\S]*event\.shiftKey[\s\S]*event\.code === "KeyG"/);
  assert.match(source, /isReliableSceneGenerateShortcut[\s\S]*event\.altKey[\s\S]*event\.code === "KeyG"/);
  assert.match(source, /findTimelineActionButton\("timeline-generate-scene-video", rowId\)/);
  assert.match(source, /generateButton\.click\(\)/);
});

test("scene generation shortcut ignores editors and pending generations", () => {
  assert.match(source, /isRequestedSceneGenerateShortcut \|\| isReliableSceneGenerateShortcut[\s\S]*isPodcasterEditingTextField\(event\.target\)/);
  assert.match(source, /generateButton\.disabled \|\| generateButton\.classList\.contains\("is-loading"\)/);
});

test("Cmd/Ctrl+Shift+E opens and immediately starts a 1080p MP4 export", () => {
  assert.match(source, /isHighResolutionExportShortcut[\s\S]*event\.code === "KeyE"/);
  assert.match(source, /isHighResolutionExportShortcut[\s\S]*isPodcasterEditingTextField\(event\.target\)/);
  assert.match(source, /openMontageExportModal\(\);[\s\S]*montageExportState\.onlyAudio = false;[\s\S]*montageExportState\.format = "mp4_h264";[\s\S]*montageExportState\.resolution = "1080p";/);
  assert.match(source, /els\.montageExportResolution\.value = "1080p";[\s\S]*queueMicrotask\([\s\S]*confirmButton\.click\(\)/);
});
