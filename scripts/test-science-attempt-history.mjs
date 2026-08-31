import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [runtime, exporter, exporterBundle, styles] = await Promise.all([
  readFile(new URL("../public/js/science-assessment-export.js", import.meta.url), "utf8"),
  readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8"),
  readFile(new URL("../public/js/scienceActivities.bundle.js", import.meta.url), "utf8"),
  readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8")
]);

test("la bitácora usa un contrato versionado y conserva sólo dos revisiones", () => {
  assert.match(runtime, /ATTEMPT_HISTORY_VERSION = 1/);
  assert.match(runtime, /ATTEMPT_HISTORY_LIMIT = 2/);
  assert.match(runtime, /scienceActivities:attempt-history:v1:/);
  assert.match(runtime, /attempts\.concat\(completedAttempt\)\.slice\(-ATTEMPT_HISTORY_LIMIT\)/);
  assert.match(runtime, /totalCompleted = number/);
});

test("el intento activo se conserva por ZIP y sólo se limpia mediante acciones explícitas", () => {
  assert.match(runtime, /ACTIVE_ATTEMPT_VERSION = 1/);
  assert.match(runtime, /scienceActivities:active-attempt:v1:/);
  assert.match(runtime, /function persistActiveAttempt/);
  assert.match(runtime, /function restoreActiveAttempt/);
  assert.match(runtime, /questionElapsedMs/);
  assert.match(runtime, /else if \(restoreActiveAttempt\(\)\) renderRestoredAttempt\(\)/);
  assert.match(runtime, /function resetForNewAttempt\(\) \{\s*clearActiveAttempt\(\)/s);
  assert.match(runtime, /data-confirm-reset[\s\S]*clearActiveAttempt\(\)/);
});

test("el tercer intento y los posteriores reciben una penalización única de 25%", () => {
  assert.match(runtime, /ATTEMPT_PENALTY_FROM = 3/);
  assert.match(runtime, /ATTEMPT_PENALTY_RATE = \.25/);
  assert.match(runtime, /Math\.round\(rawScore \* \(1 - penaltyRate\)\)/);
  assert.match(runtime, /score bruto .*− 25%/s);
});

test("cada revisión contiene respuesta, solución, retroalimentación y puntos", () => {
  const reviewContract = runtime.slice(runtime.indexOf("function prepareQuestionReview"), runtime.indexOf("function completedAttemptId"));
  for (const field of ["responseText", "correctAnswer", "feedback", "points", "attempts", "durationMs"]) {
    assert.match(reviewContract, new RegExp(`${field}:`));
  }
  for (const type of ["multiple", "image-multiple", "keyword", "matching", "equation-build", "fill-blank", "exponent-placement", "chemical-balance", "numeric-answer", "number-line-placement", "graph-plot", "sequence-order", "timeline-order"]) {
    assert.match(runtime, new RegExp(`question\\.type === \\\"${type}\\\"`));
  }
});

test("la revisión es de sólo lectura y usa acordeones accesibles", () => {
  const markup = runtime.slice(runtime.indexOf("function questionReviewMarkup"), runtime.indexOf("function renderAttemptHistory"));
  assert.match(markup, /aria-expanded/);
  assert.match(markup, /aria-controls/);
  assert.match(markup, /role=\\\"region\\\"/);
  assert.doesNotMatch(markup, /<input|<select|<textarea/);
  assert.match(styles, /science-history-question h3>button\[aria-expanded=true\]/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test("la bitácora Mission Control integra Rive y variables por estilo visual", () => {
  assert.match(runtime, /data-rive-role=.*history-core/);
  assert.match(runtime, /data-rive-role=.*history-attempt/);
  assert.match(runtime, /ScienceRiveHud\.mountAll\(layer\)/);
  assert.match(runtime, /ScienceRiveHud\.destroyAll\(layer\)/);
  for (const style of ["rive-kawaii-signal", "rive-tokyo-tech", "rive-arcade-matsuri", "rive-solar-circuit", "rive-bio-pulse", "rive-lunar-blueprint", "rive-volcanic-core", "rive-prism-glass"]) {
    assert.match(styles, new RegExp(`data-visual-style=\\"${style}\\"`));
  }
  for (const variable of ["--history-bg", "--history-panel", "--history-text", "--history-accent", "--history-highlight", "--history-radius"]) {
    assert.match(styles, new RegExp(variable));
  }
});

test("reiniciar elimina todo el historial y deja el score general sin intentos", () => {
  assert.match(runtime, /localStorage\.removeItem\(historyStorageKey\(\)\)/);
  assert.match(runtime, /el mejor score bajará de .* a 0/s);
  assert.match(runtime, /completedAttempt = null/);
  assert.match(runtime, /function bestActivityScore/);
});

test("cada ZIP recibe identidad propia y la portada puede abrir la bitácora", () => {
  assert.match(exporter, /SCIENCE_EXPORT_PACKAGE_VERSION = 18/);
  assert.match(exporter, /createScienceExportHistoryId/);
  assert.match(exporter, /id=\"scienceExportHistoryButton\"/);
  assert.match(exporter, /SCIENCE_ASSESSMENT_INITIAL_VIEW=view\|\|\"game\"/);
  assert.match(exporter, /Próximo intento −25%/);
  assert.match(exporter, /sólo están disponibles en el mismo navegador y origen/);
});

test("resultado y bitácora se comparten como capturas PNG, no como texto", () => {
  assert.match(runtime, /function captureElementToPng/);
  assert.match(runtime, /new globalThis\.ClipboardItem\(\{ "image\/png": blobPromise \}\)/);
  assert.match(runtime, /data-share-result>▣ Copiar captura/);
  assert.match(runtime, /data-share-history>▣ Copiar bitácora/);
  assert.match(runtime, /revealSelector: "\.science-history-question-panel\[hidden\]"/);
  assert.match(runtime, /\.science-level-complete-card/);
  assert.match(runtime, /normalizeResult: true/);
  assert.match(runtime, /setProperty\("animation", "none", "important"\)/);
  assert.doesNotMatch(runtime, /clipboard\.writeText\(message\)/);
});

test("el bundle principal que carga scienceActivities exporta la versión con avance activo", () => {
  assert.match(exporterBundle, /avance del intento activo y la bit\\xE1cora/);
});

test("los bundles normal y Rive incluyen la bitácora compilada", async () => {
  const [normalBundle, riveBundle] = await Promise.all([
    readFile(new URL("../public/js/export-bundles/science-game-export.bundle.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/export-bundles/science-game-rive-export.bundle.js", import.meta.url), "utf8")
  ]);
  for (const bundle of [normalBundle, riveBundle]) {
    assert.match(bundle, /scienceActivities:attempt-history:v1:/);
    assert.match(bundle, /science-history-book/);
    assert.match(bundle, /history-core/);
    assert.match(bundle, /data-confirm-reset/);
    assert.match(bundle, /scienceActivities:active-attempt:v1:/);
  }
});
