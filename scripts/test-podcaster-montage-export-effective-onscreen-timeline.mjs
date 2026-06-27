import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  STUDIO_TIMELINE_MIN_CLIP_MS: 500,
  window: {
    ensureOnScreenTextClipsByRowId: () => ({}),
    getSessionRows: () => []
  }
};
vm.createContext(context);
vm.runInContext(`${extractFunction("buildMontageFallbackOnScreenTextTimeline")};`, context);
vm.runInContext(`${extractFunction("clampMontageOnScreenTextSegmentsToGeminiTimeline")};`, context);
vm.runInContext(`${extractFunction("resolveEffectiveMontageOnScreenTextTimeline")};`, context);

const resolveFn = context.resolveEffectiveMontageOnScreenTextTimeline;
assert.equal(typeof resolveFn, "function", "El export debe resolver un timeline efectivo para texto en pantalla.");

context.window.ensureOnScreenTextClipsByRowId = () => ({
  "row-1": { rowId: "row-1", hidden: false }
});
context.window.getSessionRows = () => ([
  { id: "row-1", onScreenText: "Texto visible" }
]);

const visibleResult = resolveFn({
  activeSession: { id: "session-1" },
  onScreenTextTimeline: {
    settings: { enabled: true, showTrack: true },
    segments: [],
    suppressFallbackFromEntries: false
  },
  validEntries: [
    {
      rowId: "row-1",
      sceneIndex: 1,
      onScreenText: "Texto visible",
      timelineStartMs: 1000,
      durationMs: 2400
    }
  ],
  geminiTimelineSegments: []
});

assert.equal(visibleResult.segments.length, 1, "Si el track está visible, el export debe reconstruir el texto cuando falten segmentos.");
assert.equal(visibleResult.suppressFallbackFromEntries, false);

context.window.ensureOnScreenTextClipsByRowId = () => ({
  "row-1": { rowId: "row-1", hidden: true }
});
context.window.getSessionRows = () => ([
  { id: "row-1", onScreenText: "Texto oculto" }
]);

const hiddenResult = resolveFn({
  activeSession: { id: "session-1" },
  onScreenTextTimeline: {
    settings: { enabled: true, showTrack: true },
    segments: [
      {
        id: "stale-segment",
        rowId: "row-1",
        text: "Texto oculto",
        startMs: 1000,
        durationMs: 2400
      }
    ],
    suppressFallbackFromEntries: false
  },
  validEntries: [
    {
      rowId: "row-1",
      sceneIndex: 1,
      onScreenText: "Texto oculto",
      timelineStartMs: 1000,
      durationMs: 2400
    }
  ],
  geminiTimelineSegments: []
});

assert.equal(hiddenResult.segments.length, 0, "Si todos los clips están ocultos, el export debe vaciar incluso segmentos stale.");
assert.equal(hiddenResult.suppressFallbackFromEntries, true, "Si todo está oculto, el export debe bloquear cualquier fallback.");

assert.match(
  source,
  /resolveEffectiveMontageOnScreenTextTimeline\(\{\s*activeSession,\s*onScreenTextTimeline,\s*validEntries,\s*geminiTimelineSegments\s*\}\)/m,
  "El payload del export debe usar el resolvedor efectivo del timeline de texto."
);

console.log("Podcaster montage export effective onscreen timeline OK.");
