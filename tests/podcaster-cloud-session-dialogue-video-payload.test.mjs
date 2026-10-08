import test from "node:test";
import assert from "node:assert/strict";
import { buildCloudSessionPayload } from "../public/podcaster/podcaster-session-payload.js";

function buildDeps(overrides = {}) {
  return {
    makeId: (prefix) => `${prefix}-1`,
    nowIso: () => "2026-06-18T15:00:00.000Z",
    isCreativeVideoMode: () => false,
    getSpeakerOptions: () => [],
    normalizePodcastStudioUiState: () => ({}),
    getSpeakerVoiceMap: () => ({}),
    getSpeakerExpressionMap: () => ({}),
    getSpeakerNameMap: () => ({}),
    getSpeakerScenarioMap: () => ({}),
    getSpeakerScenarioVariantsMap: () => ({}),
    getGlobalScenarioDeck: () => null,
    normalizeDisfluencyConfig: (value) => value || {},
    normalizeTtsDirectionConfig: (value) => value || {},
    DEFAULT_DISFLUENCY_CONFIG: {},
    resolvePanelMusicTrackKind: () => "preset",
    getPanelMusicUploadedTracks: () => [],
    normalizePanelMusicLoopSettings: (value) => value || [],
    normalizePanelMusicMutedLoopIndexes: (value) => value || [],
    getSpeakerPortraitMap: () => ({}),
    getSpeakerReferenceImageMap: () => ({}),
    getScenarioReferenceImageMap: () => ({}),
    getRowReferenceImageListMap: () => ({}),
    getRowReferenceImageMap: () => ({}),
    getRowReferenceVideoMap: () => ({}),
    getRowReferenceModeByRowId: () => ({}),
    getDialogueVideoMap: () => ({
      "row-1": {
        rowId: "row-1",
        downloadUrl: "https://example.test/video.mp4",
        mimeType: "video/mp4"
      }
    }),
    getDialogueAudioMap: () => ({}),
    normalizePodcastVideoConfig: () => ({}),
    normalizeCreativeVideoConfig: () => ({}),
    ...overrides
  };
}

test("Gemini voice directions and language survive cloud serialization", () => {
  const direction = { stylePrompt: "Cálida", pacingPrompt: "Pausas naturales", accentPrompt: "Español mexicano" };
  const payload = buildCloudSessionPayload({ id: "tts", speechLocale: "es-MX", ttsDirectionDefaults: direction, script: { rows: [] } }, {}, [], buildDeps());
  assert.deepEqual(payload.ttsDirectionDefaults, direction);
  assert.equal(payload.speechLocale, "es-MX");
});

test("buildCloudSessionPayload serializes dialogueVideoMap without undefined type", () => {
  const payload = buildCloudSessionPayload({
    id: "session-1",
    title: "Sesion",
    script: {
      rows: [
        { id: "row-1", text: "Hola" }
      ]
    }
  }, {}, [], buildDeps());

  assert.equal(payload.dialogueVideoMap["row-1"].type, "video");
  assert.notEqual(payload.dialogueVideoMap["row-1"].type, undefined);
});

test("cloud serialization stores free voice phrase boundaries in Firestore-safe records", () => {
  const payload = buildCloudSessionPayload({
    id: "session-free-voice",
    script: { rows: [] },
    podcastVideoConfig: { freeVoiceTrack: { clips: [{
      id: "clip-1", storagePath: "session/audio/source.mp3",
      phraseRanges: [[0, 800], [1000, 1800]]
    }] } }
  }, {}, [], buildDeps({
    normalizePodcastVideoConfig: (config) => config
  }));
  const ranges = payload.podcastVideoConfig.freeVoiceTrack.clips[0].phraseRanges;
  assert.deepEqual(ranges, [{ startMs: 0, endMs: 800 }, { startMs: 1000, endMs: 1800 }]);
  assert.equal(ranges.some(Array.isArray), false);
});

test("buildCloudSessionPayload preserves canonical editorial tracks including explicit empty text", () => {
  const payload = buildCloudSessionPayload({
    id: "session-text-v2",
    title: "Sesion",
    script: {
      rows: [
        {
          id: "row-1",
          text: "Diálogo que no debe convertirse en overlay.",
          headlineText: "",
          captionText: "",
          inSceneText: "",
          overlayMode: "none",
          textSource: "manual",
          onScreenText: ""
        },
        {
          id: "row-2",
          text: "Diálogo literal con acentos.",
          headlineText: "IDEA CENTRAL",
          captionText: "Diálogo literal con acentos.",
          inSceneText: "CHARLY PODCAST",
          overlayMode: "both",
          textSource: "generated"
        }
      ]
    }
  }, {}, [], buildDeps());

  assert.deepEqual(
    {
      headlineText: payload.script.rows[0].headlineText,
      captionText: payload.script.rows[0].captionText,
      inSceneText: payload.script.rows[0].inSceneText,
      overlayMode: payload.script.rows[0].overlayMode,
      textSource: payload.script.rows[0].textSource
    },
    { headlineText: "", captionText: "", inSceneText: "", overlayMode: "none", textSource: "manual" }
  );
  assert.deepEqual(
    {
      headlineText: payload.script.rows[1].headlineText,
      captionText: payload.script.rows[1].captionText,
      inSceneText: payload.script.rows[1].inSceneText,
      overlayMode: payload.script.rows[1].overlayMode,
      textSource: payload.script.rows[1].textSource
    },
    {
      headlineText: "IDEA CENTRAL",
      captionText: "Diálogo literal con acentos.",
      inSceneText: "CHARLY PODCAST",
      overlayMode: "both",
      textSource: "generated"
    }
  );
});

test("buildCloudSessionPayload preserves provider and effective output metadata", () => {
  const clip = {
    rowId: "row-1",
    downloadUrl: "https://example.test/video.mp4",
    mimeType: "video/mp4",
    generator: "veo",
    provider: "gemini",
    model: "veo-3.1-fast-generate-preview",
    promptVersion: "podcaster_video_v2",
    promptHash: "prompt-hash",
    quality: "draft",
    textPolicy: "overlay_only",
    aspectRatio: "16:9",
    requestedDurationSec: 5,
    durationSec: 6,
    resolution: "720p",
    operationName: "operations/veo-1",
    removedTextDirectives: [{ field: "videoDirective", count: 1 }]
  };
  const payload = buildCloudSessionPayload({
    id: "session-video-v2",
    title: "Sesion",
    script: { rows: [{ id: "row-1", text: "Hola" }] }
  }, {}, [], buildDeps({ getDialogueVideoMap: () => ({ "row-1": clip }) }));

  assert.deepEqual(
    {
      generator: payload.dialogueVideoMap["row-1"].generator,
      provider: payload.dialogueVideoMap["row-1"].provider,
      model: payload.dialogueVideoMap["row-1"].model,
      promptVersion: payload.dialogueVideoMap["row-1"].promptVersion,
      promptHash: payload.dialogueVideoMap["row-1"].promptHash,
      quality: payload.dialogueVideoMap["row-1"].quality,
      textPolicy: payload.dialogueVideoMap["row-1"].textPolicy,
      aspectRatio: payload.dialogueVideoMap["row-1"].aspectRatio,
      requestedDurationSec: payload.dialogueVideoMap["row-1"].requestedDurationSec,
      durationSec: payload.dialogueVideoMap["row-1"].durationSec,
      resolution: payload.dialogueVideoMap["row-1"].resolution,
      operationName: payload.dialogueVideoMap["row-1"].operationName,
      removedTextDirectives: payload.dialogueVideoMap["row-1"].removedTextDirectives
    },
    {
      generator: "veo",
      provider: "gemini",
      model: "veo-3.1-fast-generate-preview",
      promptVersion: "podcaster_video_v2",
      promptHash: "prompt-hash",
      quality: "draft",
      textPolicy: "overlay_only",
      aspectRatio: "16:9",
      requestedDurationSec: 5,
      durationSec: 6,
      resolution: "720p",
      operationName: "operations/veo-1",
      removedTextDirectives: [{ field: "videoDirective", count: 1 }]
    }
  );
});
