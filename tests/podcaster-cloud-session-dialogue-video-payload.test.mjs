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
