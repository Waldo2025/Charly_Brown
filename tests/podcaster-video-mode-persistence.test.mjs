import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCloudSessionPayload } from "../public/podcaster/podcaster-session-payload.js";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

test("cloud session payload preserves videopodcast mode", () => {
  const payload = buildCloudSessionPayload({
    id: "session-1",
    title: "Sesion",
    videoContentType: "videopodcast",
    script: {
      videoContentType: "videopodcast",
      rows: []
    }
  }, {}, [], {
    makeId: (prefix) => `${prefix}-1`,
    nowIso: () => "2026-05-21T17:00:00.000Z",
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
    getDialogueVideoMap: () => ({}),
    getDialogueAudioMap: () => ({}),
    normalizePodcastVideoConfig: () => ({}),
    normalizeCreativeVideoConfig: () => ({})
  });

  assert.equal(payload.videoContentType, "videopodcast");
  assert.equal(payload.script.videoContentType, "videopodcast");
  assert.equal(payload.script.videoMode, false);
});

test("init opens the podcaster sidepanel by default", () => {
  assert.match(podcasterSource, /setSidepanelOpen\(true\);/);
});

test("video mode toggle persists and marks the session dirty immediately", () => {
  assert.match(
    podcasterSource,
    /function setPodcastVideoModeEnabled\([\s\S]*?persist:\s*true,[\s\S]*?markDirty:\s*true,[\s\S]*?autosaveReason:\s*options\.reason \|\| "video-content-type"/
  );
  assert.match(
    podcasterSource,
    /setPodcastVideoModeEnabled\(enableVideoPodcast, \{ render: false, reason: "video-content-type" \}\);/
  );
});
