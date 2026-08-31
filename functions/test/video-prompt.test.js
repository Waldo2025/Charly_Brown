"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDialogueVideoPrompt } = require("../src/video-prompt.js");
const { AVAILABLE_VEO_MODELS, normalizeVeoModel } = require("../src/vertex.js");
const { normalizeOwnedReferencePath, resolveVertexVideoReferences } = require("../src/ai-jobs.js");

test("maps sceneDescription to appearance and visualNotes to the required action", () => {
  const result = buildDialogueVideoPrompt({
    sceneDescription: "A child holds a yellow kite on the beach.",
    visualNotes: "The child runs forward and the kite rises into the air.",
    onScreenText: "THIS IS ONLY A SUBTITLE",
    headlineText: "OVERLAY",
    captionText: "Editorial transcript"
  }, { hasReferenceImage: true, referenceMode: "first_frame" });

  assert.match(result.prompt, /Scene appearance and setting: A child holds a yellow kite on the beach/);
  assert.match(result.prompt, /Required action: The child runs forward and the kite rises into the air/);
  assert.match(result.prompt, /exact visual source and opening frame/);
  assert.doesNotMatch(result.prompt, /THIS IS ONLY A SUBTITLE|OVERLAY|Editorial transcript/);
});

test("uses only inSceneText as generated visible copy", () => {
  const result = buildDialogueVideoPrompt({
    inSceneText: "CHARLY LAB",
    onScreenText: "Subtitle",
    captionText: "Voice transcription"
  });
  assert.equal((result.prompt.match(/CHARLY LAB/g) || []).length, 1);
  assert.doesNotMatch(result.prompt, /Subtitle|Voice transcription/);
});

test("voiceOverText is spoken only when script and native dialogue are enabled", () => {
  const speaking = buildDialogueVideoPrompt({ voiceOverText: "Hola desde el estudio" });
  const silent = buildDialogueVideoPrompt({
    voiceOverText: "No debe llegar a Veo",
    excludeScriptFromVideoPrompt: true
  });
  const external = buildDialogueVideoPrompt({
    voiceOverText: "Ya existe como audio Gemini",
    dialogueAudioStoragePath: "podcaster/sessions/s/owners/u/audio/row.wav"
  });

  assert.equal(speaking.generateAudio, true);
  assert.match(speaking.prompt, /Hola desde el estudio/);
  assert.equal(silent.generateAudio, false);
  assert.doesNotMatch(silent.prompt, /No debe llegar a Veo/);
  assert.equal(external.generateAudio, false);
  assert.doesNotMatch(external.prompt, /Ya existe como audio Gemini/);
});

test("always requests an eight-second Veo source independently of timeline crop", () => {
  const result = buildDialogueVideoPrompt({
    requestedDurationSec: 3,
    durationSec: 3,
    targetDurationSec: 3
  });

  assert.equal(result.durationSeconds, 8);
  assert.match(result.prompt, /polished 8-second video/);
});

test("preserves every available Vertex Veo model instead of collapsing fast and lite", () => {
  assert.deepEqual(AVAILABLE_VEO_MODELS, [
    "veo-3.1-generate-001",
    "veo-3.1-fast-generate-001",
    "veo-3.1-lite-generate-001",
    "veo-3.0-generate-001",
    "veo-3.0-fast-generate-001",
    "veo-2.0-generate-001"
  ]);
  for (const model of AVAILABLE_VEO_MODELS) assert.equal(normalizeVeoModel(model), model);
  assert.equal(normalizeVeoModel("veo-3.1-lite-generate-preview"), "veo-3.1-lite-generate-001");
});

test("accepts only owned session references or public library references", () => {
  const job = { sessionId: "session-1", ownerId: "user-1" };
  assert.equal(
    normalizeOwnedReferencePath("podcaster/sessions/session-1/owners/user-1/references/scene.png", job),
    "podcaster/sessions/session-1/owners/user-1/references/scene.png"
  );
  assert.equal(
    normalizeOwnedReferencePath("podcaster/library/scenes/public.png", job),
    "podcaster/library/scenes/public.png"
  );
  assert.equal(normalizeOwnedReferencePath("podcaster/sessions/session-1/owners/other/private.png", job), "");
  assert.equal(normalizeOwnedReferencePath("../private.png", job), "");
});

test("a single owned scene image becomes Veo firstFrame instead of a loose reference", async () => {
  const bucket = {
    name: "charly-brown.firebasestorage.app",
    file(storagePath) {
      return {
        async getMetadata() {
          return [{ contentType: "image/png", size: "2048", name: storagePath }];
        }
      };
    }
  };
  const job = { sessionId: "session-1", ownerId: "user-1" };
  const result = await resolveVertexVideoReferences(bucket, {
    strictIdentity: false,
    referenceImages: [{
      storagePath: "podcaster/sessions/session-1/owners/user-1/references/scene.png",
      mimeType: "image/png"
    }]
  }, job);

  assert.equal(result.mode, "first_frame");
  assert.equal(result.firstFrame.gcsUri, "gs://charly-brown.firebasestorage.app/podcaster/sessions/session-1/owners/user-1/references/scene.png");
  assert.deepEqual(result.referenceImages, []);
});
