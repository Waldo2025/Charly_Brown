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

test("applyTimelineZoomPreservingPlayhead preserves viewport position using the previous zoom", () => {
  const timeline = {
    scrollLeft: 50,
    querySelector(selector) {
      if (selector === ".podcast-video-timeline-canvas") {
        return { dataset: { playheadOffset: "100" } };
      }
      return null;
    }
  };
  const ruler = { scrollLeft: 0 };
  const session = { id: "session-zoom" };
  const context = {
    console,
    els: {
      podcastVideoTimeline: timeline,
      podcastTimelineRuler: ruler
    },
    podcastVideoState: {
      timelineZoom: 1,
      montageCursorMs: 1000
    },
    getActiveSession: () => session,
    toFiniteNumber: (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    },
    getTimelineTotalDurationMs: () => 5000,
    timelineMsToPx: (valueMs) => Number(valueMs || 0) * context.podcastVideoState.timelineZoom,
    renderPodcastVideoTimeline: () => {},
    syncPodcastTimelineLaneOffsetFromDom: () => 100,
    syncPodcastTimelinePlayhead: () => {}
  };

  vm.createContext(context);
  vm.runInContext(extractConst("STUDIO_TIMELINE_MIN_CLIP_MS"), context);
  vm.runInContext(`${extractFunction("applyTimelineZoomPreservingPlayhead")};`, context);

  const ok = vm.runInContext(`applyTimelineZoomPreservingPlayhead(getActiveSession(), 0.5);`, context);

  assert.equal(ok, true);
  assert.equal(context.podcastVideoState.timelineZoom, 0.5);
  assert.equal(context.els.podcastVideoTimeline.scrollLeft, 0);
  assert.equal(context.els.podcastTimelineRuler.scrollLeft, 0);
});
