import test from "node:test";
import assert from "node:assert/strict";
import { applyReferenceImageAsScene, chooseReferenceSceneImage } from "../public/podcaster/podcaster-reference-scene.js";

test("reference image becomes a still scene without changing the source reference", () => {
  const reference = { storagePath: "users/u/references/scene.webp", dataUrl: "data:image/webp;base64,abc", mimeType: "image/webp", name: "Escena" };
  const session = {
    id: "session_1",
    script: { rows: [{ id: "row_1", durationSec: 7 }] },
    rowReferenceImageListMap: { row_1: [reference] },
    dialogueVideoMap: { row_1: { type: "video", downloadUrl: "https://example.com/old.mp4" } }
  };
  const applied = applyReferenceImageAsScene(session, "row_1", reference);
  assert.equal(applied.status, "applied");
  assert.equal(applied.clip.type, "image");
  assert.equal(applied.clip.storagePath, reference.storagePath);
  assert.equal(applied.clip.dataUrl, "");
  assert.equal(applied.context.rowId, "row_1");
  assert.equal(applied.context.effects, null);
  assert.equal(applied.session.podcastVideoConfig.timelineClipsByRowId.row_1.type, "image");
  assert.equal(applied.session.visualEffectsMap.row_1, null);
  assert.equal(applied.session.podcastVideoConfig.timelineClipsByRowId.row_1.mediaMotionPreset, "none");
  assert.equal(session.dialogueVideoMap.row_1.type, "video");
  assert.equal(session.rowReferenceImageListMap.row_1[0], reference);
});

test("a single reference needs no picker and an unavailable image cannot replace a scene", async () => {
  const reference = { downloadUrl: "https://example.com/reference.webp" };
  assert.equal(await chooseReferenceSceneImage([reference]), reference);
  assert.throws(() => applyReferenceImageAsScene({ id: "s", script: { rows: [{ id: "r" }] } }, "r", {}), /aún no está disponible/);
});
