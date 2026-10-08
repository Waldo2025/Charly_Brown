import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const appSource = readFileSync(new URL("public/podcaster/podcaster.js", root), "utf8");
const modelSource = readFileSync(new URL("public/podcaster/podcaster-timeline-model.js", root), "utf8");

function measurementFunctionSource() {
  const start = appSource.indexOf("function updateTimelineClipSourceDurationIfGreater(");
  assert.ok(start > -1, "Debe existir updateTimelineClipSourceDurationIfGreater.");
  return appSource.slice(start, appSource.indexOf("\n}", start));
}

test("measured preview duration never fights the scene media record", () => {
  const source = measurementFunctionSource();
  assert.match(
    source,
    /if \(window\.resolveDialogueVideoPhysicalDurationMs\?\.\(resolveDialogueVideoForRow\(session, key\)\) > 0\) return;/,
    "Si el registro de medios ya aporta la duración, la medida del <video> no debe escribirse: se re-deriva y re-renderiza en bucle."
  );
  const guardIndex = source.indexOf("resolveDialogueVideoPhysicalDurationMs");
  const clipsIndex = source.indexOf("ensureTimelineClipsByRowId(session");
  assert.ok(guardIndex > -1 && clipsIndex > guardIndex, "El guard debe ir antes de leer los clips normalizados.");
});

test("the timeline model keeps deriving clip mediaDurationMs from the scene media record", () => {
  assert.match(
    modelSource,
    /const mediaDurationMs = resolveDialogueVideoPhysicalDurationMs\(\s*\n?\s*resolveDialogueVideoForRow\(activeSession, rowId\)\s*\n?\s*\) \|\| Math\.max\(0, Number\(base\?\.mediaDurationMs \|\| 0\)\);/,
    "El modelo es el dueño de mediaDurationMs; si cambia, hay que revisar el guard de la medición."
  );
});

test("a stickable duration measurement still records the physical file duration", () => {
  assert.match(
    appSource,
    /if \(Math\.abs\(Number\(current\.mediaDurationMs \|\| 0\) - durationMs\) > 25\) \{[\s\S]*?mediaDurationMs: Math\.max\(STUDIO_TIMELINE_MIN_CLIP_MS, Math\.round\(durationMs\)\)/,
    "Sin registro de medios, la medida del archivo debe seguir guardándose en el clip."
  );
});
