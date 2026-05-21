import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCloudSessionPayload } from "../public/podcaster/podcaster-session-payload.js";

const panelMusicSource = readFileSync(new URL("../public/podcaster/podcaster-panel-music.js", import.meta.url), "utf8");

test("panel music normalization derives effective duration from trim and loop settings when durationSec is missing", () => {
  assert.match(
    panelMusicSource,
    /function resolvePanelMusicEffectiveSourceDurationMs\(track = null\)/m
  );
  assert.match(
    panelMusicSource,
    /const sourceDurationMs = resolvePanelMusicEffectiveSourceDurationMs\(track\);/m
  );
});

test("cloud session payload preserves panel music fades even when durationSec is 0", () => {
  let uploadedSourceDurationMs = -1;
  let activeTrackSourceDurationMs = -1;
  const payload = buildCloudSessionPayload({
    id: "session-1",
    title: "Sesion",
    script: { rows: [] },
    panelMusicConfig: {
      preset: "ambient",
      volume: 22,
      montageVolume: 100,
      sourceType: "track",
      selectedTrackKind: "uploaded",
      trackLibrary: {
        uploaded: {
          name: "Audio 1",
          durationSec: 0,
          trimInMs: 0,
          trimOutMs: 3200,
          loopSettings: [
            { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }
          ]
        },
        uploadedTracks: [{
          libraryId: "lib-1",
          slotLabel: "Audio 1",
          name: "Audio 1",
          durationSec: 0,
          trimInMs: 0,
          trimOutMs: 3200,
          loopSettings: [
            { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }
          ]
        }],
        ai: null
      },
      track: {
        libraryId: "lib-1",
        slotLabel: "Audio 1",
        name: "Audio 1",
        durationSec: 0,
        trimInMs: 0,
        trimOutMs: 3200,
        loopSettings: [
          { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }
        ]
      }
    }
  }, {}, [], {
    makeId: (prefix) => `${prefix}-1`,
    nowIso: () => "2026-05-21T12:00:00.000Z",
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
    resolvePanelMusicTrackKind: (value) => value === "ai" ? "ai" : "uploaded",
    getPanelMusicUploadedTracks: () => [],
    normalizePanelMusicLoopSettings: (loopSettings = [], sourceDurationMs = 0) => {
      const normalized = Array.isArray(loopSettings) ? loopSettings.map((item) => ({ ...item })) : [];
      if (uploadedSourceDurationMs === -1) uploadedSourceDurationMs = sourceDurationMs;
      else activeTrackSourceDurationMs = sourceDurationMs;
      return normalized;
    },
    normalizePanelMusicMutedLoopIndexes: (value) => Array.isArray(value) ? value : [],
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

  assert.equal(uploadedSourceDurationMs, 3200);
  assert.equal(activeTrackSourceDurationMs, 3200);
  assert.equal(payload.panelMusicConfig.trackLibrary.uploadedTracks[0].loopSettings[0].fadeInMs, 500);
  assert.equal(payload.panelMusicConfig.trackLibrary.uploadedTracks[0].loopSettings[0].fadeOutMs, 900);
  assert.equal(payload.panelMusicConfig.track.loopSettings[0].fadeInMs, 500);
  assert.equal(payload.panelMusicConfig.track.loopSettings[0].fadeOutMs, 900);
});
