const test = require("node:test");
const assert = require("node:assert/strict");

const {
  reconcileMontageExportAudioIntent
} = require("./montage-export-audio-intent-reconcile.js");

test("reconcileMontageExportAudioIntent restores VEO-only scene audio intent from session config", () => {
  const result = reconcileMontageExportAudioIntent({
    useTimelineAudio: true,
    dialogueAudioMap: {
      row_1: {
        storagePath: "gs://bucket/audio.wav",
        mimeType: "audio/wav"
      }
    },
    entries: [{
      rowId: "row_1",
      useNativeVideoAudio: false,
      veoVolumeOverridePct: 0,
      geminiVolumeOverridePct: 100,
      audio: null
    }]
  }, {
    podcastVideoConfig: {
      montageDefaultVeoVolumePct: 0,
      montageDefaultGeminiVolumePct: 100,
      timelineClipsByRowId: {
        row_1: {
          veoVolumeOverridePct: 100,
          geminiVolumeOverridePct: 0
        }
      }
    }
  });

  assert.equal(result.useTimelineAudio, false);
  assert.equal(result.entries[0].useNativeVideoAudio, true);
  assert.equal(result.entries[0].veoVolumeOverridePct, 100);
  assert.equal(result.entries[0].geminiVolumeOverridePct, 0);
  assert.equal(result.entries[0].audio, null);
});

test("reconcileMontageExportAudioIntent keeps Gemini timeline audio when session config leaves Gemini enabled", () => {
  const result = reconcileMontageExportAudioIntent({
    useTimelineAudio: false,
    dialogueAudioMap: {
      row_1: {
        storagePath: "gs://bucket/audio.wav",
        mimeType: "audio/wav"
      }
    },
    entries: [{
      rowId: "row_1",
      useNativeVideoAudio: false,
      veoVolumeOverridePct: 0,
      geminiVolumeOverridePct: 0,
      audio: {
        storagePath: "gs://bucket/audio.wav"
      }
    }]
  }, {
    podcastVideoConfig: {
      montageDefaultVeoVolumePct: 0,
      montageDefaultGeminiVolumePct: 100,
      timelineClipsByRowId: {
        row_1: {
          veoVolumeOverridePct: 0,
          geminiVolumeOverridePct: 100
        }
      }
    }
  });

  assert.equal(result.useTimelineAudio, true);
  assert.equal(result.entries[0].useNativeVideoAudio, false);
  assert.equal(result.entries[0].audio, null);
});
