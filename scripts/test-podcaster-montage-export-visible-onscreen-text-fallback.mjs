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
  STUDIO_TIMELINE_MIN_CLIP_MS: 500
};
vm.createContext(context);
vm.runInContext(`${extractFunction("buildMontageFallbackOnScreenTextTimeline")};`, context);

const fallbackFn = context.buildMontageFallbackOnScreenTextTimeline;
assert.equal(typeof fallbackFn, "function", "Debe existir un helper para reconstruir texto visible en export.");

const visibleFallback = fallbackFn(
  { settings: { enabled: true, showTrack: true }, segments: [], suppressFallbackFromEntries: false },
  [
    {
      rowId: "row-1",
      sceneIndex: 1,
      onScreenText: "Hola mundo",
      timelineStartMs: 1200,
      durationMs: 3400
    }
  ],
  []
);

assert.equal(visibleFallback.segments.length, 1, "Si el track está visible y el timeline llega vacío, el export debe reconstruir el texto desde entries.");
assert.equal(visibleFallback.segments[0].text, "Hola mundo");
assert.equal(visibleFallback.segments[0].startMs, 1200);
assert.equal(visibleFallback.segments[0].durationMs, 3400);

const hiddenFallback = fallbackFn(
  { settings: { enabled: true, showTrack: true }, segments: [], suppressFallbackFromEntries: true },
  [
    {
      rowId: "row-1",
      sceneIndex: 1,
      onScreenText: "No debe revivir",
      timelineStartMs: 1200,
      durationMs: 3400
    }
  ],
  []
);

assert.equal(hiddenFallback.segments.length, 0, "Si el timeline marca suppressFallbackFromEntries, el texto oculto no debe revivir.");

assert.match(
  source,
  /resolveEffectiveMontageOnScreenTextTimeline\(\{\s*activeSession,\s*onScreenTextTimeline,\s*validEntries,\s*geminiTimelineSegments\s*\}\)/m,
  "buildMontageExportPayload debe resolver el timeline efectivo antes de decidir si reconstruye el texto visible."
);

console.log("Podcaster montage export visible onscreen text fallback OK.");
