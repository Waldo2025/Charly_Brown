import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

function extractConst(name) {
  const match = source.match(new RegExp(`const ${name} = [^;]+;`));
  if (!match) {
    throw new Error(`No se encontró la constante ${name}`);
  }
  return match[0];
}

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró ${name}`);
  }
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

test("audio-only timeline reorder compacts Gemini chips to each scene start without inherited gaps", () => {
  const beforeSession = {
    script: {
      rows: [{ id: "row-1" }, { id: "row-2" }]
    },
    podcastVideoConfig: {
      geminiDialogueTrack: {
        enabled: true,
        segments: [
          { rowId: "row-1", audioSrc: "a.wav", startMs: 400, anchorStartMs: 0, durationMs: 1200, trimInMs: 0, trimOutMs: 1200 },
          { rowId: "row-2", audioSrc: "b.wav", startMs: 2400, anchorStartMs: 2000, durationMs: 900, trimInMs: 0, trimOutMs: 900 }
        ]
      }
    }
  };
  const afterSession = {
    script: {
      rows: [{ id: "row-1" }, { id: "row-2" }]
    },
    podcastVideoConfig: {
      geminiDialogueTrack: {
        enabled: true,
        segments: [
          { rowId: "row-1", audioSrc: "a.wav", startMs: 400, anchorStartMs: 0, durationMs: 1200, trimInMs: 0, trimOutMs: 1200 },
          { rowId: "row-2", audioSrc: "b.wav", startMs: 2400, anchorStartMs: 2000, durationMs: 900, trimInMs: 0, trimOutMs: 900 }
        ]
      }
    }
  };

  const runtimeMap = new Map([
    [beforeSession, [
      { rowId: "row-1", startMs: 0, effectiveDurationMs: 2000 },
      { rowId: "row-2", startMs: 2000, effectiveDurationMs: 2000 }
    ]],
    [afterSession, [
      { rowId: "row-1", startMs: 0, effectiveDurationMs: 1200 },
      { rowId: "row-2", startMs: 1200, effectiveDurationMs: 900 }
    ]]
  ]);

  const context = {
    console,
    beforeSession,
    afterSession,
    getActiveSession: () => afterSession,
    getPodcastVideoConfig: (session) => session?.podcastVideoConfig || {},
    normalizeGeminiDialogueTrack: (track = {}) => ({
      enabled: track.enabled === true,
      updatedAt: String(track.updatedAt || ""),
      segments: Array.isArray(track.segments)
        ? track.segments.map((segment) => ({ ...segment })).sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0))
        : []
    }),
    buildTimelineRuntimeEntries: (session) => runtimeMap.get(session) || [],
    snapTimelineMs: (value) => Math.round(Number(value || 0) || 0),
    resolveGeminiSegmentDurationWithinScene: (_sceneDurationMs, desiredDurationMs) => Math.round(Number(desiredDurationMs || 0) || 0),
    resolveGeminiSegmentAnchorStartMs: (segment, fallbackAnchorMs = 0) => (
      segment?.anchorStartMs !== undefined && segment?.anchorStartMs !== null
        ? Math.round(Number(segment.anchorStartMs || 0) || 0)
        : Math.round(Number(fallbackAnchorMs || 0) || 0)
    ),
    normalizeGeminiDialogueTrackSegment: (segment = {}, index = 0) => ({
      ...segment,
      sceneIndex: Number(segment.sceneIndex || index + 1),
      endMs: Number(segment.endMs || 0)
    }),
    isAudioOnlyPodcastStudioMode: () => true,
    nowIso: () => "2026-05-21T16:00:00.000Z"
  };

  vm.createContext(context);
  vm.runInContext(extractConst("STUDIO_TIMELINE_MIN_CLIP_MS"), context);
  vm.runInContext(`${extractFunction("buildReorderedGeminiDialogueTrack")};`, context);

  const result = vm.runInContext(`buildReorderedGeminiDialogueTrack(beforeSession, afterSession, { forceCompactSceneAnchors: true, interSegmentGapMs: 0 });`, context);

  assert.equal(result.changed, true);
  assert.equal(result.track.segments[0].startMs, 0);
  assert.equal(result.track.segments[0].anchorStartMs, 0);
  assert.equal(result.track.segments[1].startMs, 1200);
  assert.equal(result.track.segments[1].anchorStartMs, 1200);
});
