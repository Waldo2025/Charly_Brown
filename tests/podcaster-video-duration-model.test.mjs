import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = {};
await import("../public/podcaster/podcaster-timeline-model.js");

const {
  buildDefaultTimelineClipsByRowId,
  ensureTimelineClipsByRowId,
  getRowSourceDurationMs,
  normalizeTimelineClipItem,
  resolveDialogueVideoPhysicalDurationMs
} = window;

test("legacy clips become manual while newly built clips are automatic", () => {
  const legacy = normalizeTimelineClipItem({
    rowId: "legacy",
    startMs: 0,
    sourceDurationMs: 12000,
    trimInMs: 1000,
    trimOutMs: 11000
  });
  assert.equal(legacy.durationMode, "manual");

  const session = {
    id: "session-new",
    script: {
      videoContentType: "videopodcast",
      rows: [{ id: "new", speaker: "Narrador", durationSec: 8 }]
    },
    dialogueVideoMap: {
      new: { durationSeconds: 8 }
    },
    podcastVideoConfig: { enabled: true }
  };
  const built = buildDefaultTimelineClipsByRowId(session).new;
  assert.equal(built.durationMode, "auto");
  assert.equal(built.sourceDurationMs, 8000);
  assert.equal(built.mediaDurationMs, 8000);
});

test("physical video duration is independent from a longer dialogue audio", () => {
  const session = {
    id: "session-duration",
    script: {
      videoContentType: "videopodcast",
      rows: [{ id: "scene", speaker: "Narrador", durationSec: 30 }]
    },
    dialogueVideoMap: {
      scene: {
        primarySegment: { requestedDurationSeconds: 8 }
      }
    },
    dialogueAudioMap: {
      scene: { durationSec: 30 }
    },
    podcastVideoConfig: { enabled: true }
  };

  assert.equal(resolveDialogueVideoPhysicalDurationMs(session.dialogueVideoMap.scene), 8000);
  assert.equal(getRowSourceDurationMs(session.script.rows[0], session), 8000);
});

test("rehydration preserves legacy manual timing but lets untouched automatic clips expand", () => {
  const makeSession = (id, durationMode) => ({
    id,
    updatedAt: id,
    script: {
      videoContentType: "videopodcast",
      rows: [{ id: "scene", speaker: "Narrador", durationSec: 8 }]
    },
    dialogueVideoMap: {
      scene: { durationSec: 8 }
    },
    podcastVideoConfig: {
      enabled: true,
      timelineTracks: [{ id: "speaker:narrador", label: "Narrador", order: 0 }],
      timelineClipsByRowId: {
        scene: {
          rowId: "scene",
          speakerKey: "Narrador",
          trackId: "speaker:narrador",
          startMs: 0,
          sourceDurationMs: 4000,
          trimInMs: 0,
          trimOutMs: 4000,
          ...(durationMode ? { durationMode } : {})
        }
      }
    }
  });

  const legacy = ensureTimelineClipsByRowId(makeSession("legacy-session"), { persist: false }).scene;
  assert.equal(legacy.durationMode, "manual");
  assert.equal(legacy.sourceDurationMs, 4000);
  assert.equal(legacy.trimOutMs, 4000);
  assert.equal(legacy.mediaDurationMs, 8000);

  const automatic = ensureTimelineClipsByRowId(makeSession("auto-session", "auto"), { persist: false }).scene;
  assert.equal(automatic.durationMode, "auto");
  assert.equal(automatic.sourceDurationMs, 8000);
  assert.equal(automatic.trimOutMs, 8000);
  assert.equal(automatic.mediaDurationMs, 8000);
});

test("timeline trim and duration controls explicitly take ownership as manual", () => {
  const interactionSource = readFileSync(
    new URL("../public/podcaster/podcaster-timeline-interaction.js", import.meta.url),
    "utf8"
  );
  const modalSource = readFileSync(
    new URL("../public/podcaster/podcaster-timeline-clip-duration.js", import.meta.url),
    "utf8"
  );

  const sceneTrimSection = interactionSource.slice(
    interactionSource.indexOf('if (drag.mode === "trim-start")', interactionSource.indexOf("function processTimelinePointerMove")),
    interactionSource.indexOf("function syncTrimmedSceneGeminiAnchor")
  );
  assert.match(sceneTrimSection, /durationMode:\s*"manual"/);
  assert.match(modalSource, /durationMode:\s*durationChanged \? "manual" : current\?\.durationMode/);
  assert.match(modalSource, /durationMode:\s*"manual"/);
});

test("audio-first automatic duration converges to video while manual duration remains owned", () => {
  const makeAudioFirstSession = (id, durationMode) => ({
    id,
    updatedAt: `${id}-audio-first`,
    script: {
      videoContentType: "videopodcast",
      rows: [{ id: "scene", speaker: "Narrador", durationSec: 20 }]
    },
    dialogueAudioMap: {
      scene: { durationSec: 20 }
    },
    dialogueVideoMap: {},
    podcastVideoConfig: {
      enabled: true,
      timelineTracks: [{ id: "speaker:narrador", label: "Narrador", order: 0 }],
      timelineClipsByRowId: {
        scene: {
          rowId: "scene",
          speakerKey: "Narrador",
          trackId: "speaker:narrador",
          startMs: 0,
          sourceDurationMs: 20_000,
          trimInMs: 0,
          trimOutMs: 20_000,
          durationMode
        }
      }
    }
  });
  const withEightSecondVideo = (session) => ({
    ...session,
    updatedAt: `${session.id}-video-ready`,
    dialogueVideoMap: {
      scene: { durationSec: 8 }
    }
  });

  const automaticAudioFirst = makeAudioFirstSession("auto-audio-first", "auto");
  assert.equal(
    automaticAudioFirst.podcastVideoConfig.timelineClipsByRowId.scene.trimOutMs,
    20_000,
    "the persisted audio-first state starts at twenty seconds",
  );
  const automatic = ensureTimelineClipsByRowId(
    withEightSecondVideo(automaticAudioFirst),
    { persist: false },
  ).scene;
  assert.equal(automatic.durationMode, "auto");
  assert.equal(automatic.mediaDurationMs, 8_000);
  assert.equal(automatic.sourceDurationMs, 8_000);
  assert.equal(automatic.trimInMs, 0);
  assert.equal(automatic.trimOutMs, 8_000);

  const manualAudioFirst = makeAudioFirstSession("manual-audio-first", "manual");
  const manual = ensureTimelineClipsByRowId(
    withEightSecondVideo(manualAudioFirst),
    { persist: false },
  ).scene;
  assert.equal(manual.durationMode, "manual");
  assert.equal(manual.mediaDurationMs, 8_000);
  assert.equal(manual.sourceDurationMs, 20_000);
  assert.equal(manual.trimInMs, 0);
  assert.equal(manual.trimOutMs, 20_000);
});
