import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { setStylizedTextForScene } from "../public/podcaster/podcaster-stylized-session.js";
import { resolveStylizedScenePreviewMedia } from "../public/podcaster/podcaster-stylized-scene-media.js";

const require = createRequire(import.meta.url);
const { sanitizeMontageExportPersistedInput } = require("../backend/montage-export/job-store-firestore.js");

test("adding and removing stylized text preserves reference image, effects, and card", () => {
  const image = { type: "image", mediaKind: "image", model: "reference-image", storagePath: "podcaster/sessions/s1/image.png" };
  const effect = { type: "wave", region: { mode: "focus", spots: [{ id: "one", centerX: 0.2 }, { id: "two", centerX: 0.7 }] } };
  const card = { id: "card-1", rowId: "row-1", textLines: ["Título", "Subtítulo"] };
  const session = {
    id: "s1",
    dialogueVideoMap: { "row-1": { type: "video", storagePath: "podcaster/sessions/s1/old.mp4" } },
    podcastVideoConfig: { timelineClipsByRowId: { "row-1": image }, timelineOverlayCardsById: { "card-1": card } },
    visualEffectsMap: { "row-1": { imageWarp: effect } },
    stylizedTextMap: {}
  };
  const text = JSON.stringify({ objects: [{ type: "i-text", text: "Hola" }] });
  const withText = setStylizedTextForScene(session, "row-1", text);
  const preview = resolveStylizedScenePreviewMedia(withText, "row-1");
  assert.equal(preview.kind, "image");
  assert.match(preview.src, /proxy-image\?storagePath=/);
  assert.ok(preview.src.includes(encodeURIComponent(image.storagePath)));
  assert.equal(withText.stylizedTextMap["row-1"], text);
  assert.deepEqual(withText.dialogueVideoMap, session.dialogueVideoMap);
  assert.deepEqual(withText.podcastVideoConfig, session.podcastVideoConfig);
  assert.deepEqual(withText.visualEffectsMap, session.visualEffectsMap);
  const removedText = setStylizedTextForScene(withText, "row-1");
  assert.equal(removedText.stylizedTextMap["row-1"], undefined);
  assert.deepEqual(removedText.dialogueVideoMap, session.dialogueVideoMap);
  assert.deepEqual(removedText.visualEffectsMap, session.visualEffectsMap);
  assert.deepEqual(removedText.podcastVideoConfig, session.podcastVideoConfig);
});

test("queued export retains the still image, effect, card, and uploaded text overlay", () => {
  const input = {
    entries: [{ rowId: "row-1", sceneIndex: 1, durationMs: 8000,
      video: { type: "image", mediaKind: "image", storagePath: "podcaster/sessions/s1/image.png", mimeType: "image/png" },
      visualEffects: { imageWarp: { type: "wave", region: { mode: "focus", spots: [{ id: "one", centerX: 0.25 }, { id: "two", centerX: 0.75 }] } } }
    }],
    overlayCards: { enabled: true, segments: [{ id: "card-1", rowId: "row-1", textLines: ["Título"] }] },
    stylizedTextTimeline: { enabled: true, segments: [{ rowId: "row-1", startMs: 0, durationMs: 6000,
      storagePath: "podcaster/sessions/s1/stylized.png", dataUrl: "data:image/png;base64,inline"
    }] }
  };
  const persisted = sanitizeMontageExportPersistedInput(input);
  assert.equal(persisted.entries[0].video.storagePath, input.entries[0].video.storagePath);
  assert.equal(persisted.entries[0].video.mediaKind, "image");
  assert.equal(persisted.entries[0].visualEffects.imageWarp.region.spots.length, 2);
  assert.equal(persisted.overlayCards.segments[0].id, "card-1");
  assert.equal(persisted.stylizedTextTimeline.segments[0].storagePath, "podcaster/sessions/s1/stylized.png");
  assert.equal(persisted.stylizedTextTimeline.segments[0].dataUrl, "");
});

test("stylized export segment keeps its scene timing when other layers exist", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
  const start = source.indexOf("function buildMontageStylizedTextTimeline(");
  const end = source.indexOf("\nasync function hydrateMontageStylizedTextTimeline", start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ STUDIO_TIMELINE_MIN_CLIP_MS: 500 });
  vm.runInContext(source.slice(start, end), context);
  const session = {
    stylizedTextMap: { "row-1": JSON.stringify({ objects: [{ type: "i-text", text: "Hola" }], timing: { startSec: 1, durationSec: 3 } }) },
    visualEffectsMap: { "row-1": { imageWarp: { type: "wave" } } },
    podcastVideoConfig: { timelineOverlayCardsById: { "card-1": { rowId: "row-1" } } }
  };
  const timeline = context.buildMontageStylizedTextTimeline(session, [{ rowId: "row-1", sceneIndex: 1, startMs: 5000, durationMs: 8000, effectiveDurationMs: 8000 }]);
  assert.equal(timeline.enabled, true);
  assert.equal(timeline.segments.length, 1);
  assert.equal(timeline.segments[0].rowId, "row-1");
  assert.equal(timeline.segments[0].startMs, 6000);
  assert.equal(timeline.segments[0].durationMs, 3000);
});
