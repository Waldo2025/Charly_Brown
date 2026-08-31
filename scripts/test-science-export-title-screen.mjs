import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");

test("la portada exportada usa una estructura de pantalla de título", () => {
  assert.match(source, /science-export-start-heading/);
  assert.match(source, /science-export-start-copy/);
  assert.match(source, /science-export-start-actions/);
  assert.match(source, /<span>\$\{escapeHtml\(content\.buttonLabel\)\}<\/span>/);
  assert.match(source, /<small>Experiencia<\/small>/);
  assert.match(source, /<small>Aprendizajes esperados<\/small>/);
  assert.doesNotMatch(source, /Comenzar misión/);
  assert.match(source, /const mode = activity\.gameMode === "simulator" \? "Simulador interactivo" : "Actividad educativa"/);
  assert.match(source, /eyebrow: meaningfulActivityText\(custom\.eyebrow\) \|\| `\$\{mode\} ·/);
  assert.doesNotMatch(source, /experiencia diseñada para ocupar toda tu pantalla/);
});

test("el título tiene peso moderado y tamaño acotado", () => {
  const finalTitleScreen = source.slice(source.indexOf("Export title screen: inherits"));
  assert.match(finalTitleScreen, /science-export-start-card h1\{[^}]*font:700 clamp\(2\.2rem,6vw,5\.2rem\)/);
  assert.doesNotMatch(finalTitleScreen, /science-export-start-card h1\{[^}]*font:950/);
  assert.match(finalTitleScreen, /max-width:15ch/);
});

test("arcade y kawaii heredan una composición coherente", () => {
  assert.match(source, /data-export-style\*="arcade"[^\n]*--start-accent:#ff4e9a/);
  assert.match(source, /data-export-style\*="kawaii"[^\n]*--start-accent:#ff9fbd/);
  assert.match(source, /--start-highlight:#ffe259/);
  assert.match(source, /--start-highlight:#ffd166/);
});

test("el gesto de inicio y fullscreen se conservan", () => {
  assert.match(source, /id="scienceExportStartButton"/);
  assert.match(source, /requestFullscreen/);
  assert.match(source, /start\.addEventListener\("click",begin\)/);
  assert.match(source, /g\.style\.pointerEvents="none";g\.remove\(\)/);
  assert.match(source, /data-export-started="true"[^\n]*science-export-start\{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important/);
});

test("el briefing exportado deja libre el botón que inicia la actividad", async () => {
  const [runtime, responsive] = await Promise.all([
    readFile(new URL("../public/js/science-assessment-export.js", import.meta.url), "utf8"),
    readFile(new URL("../public/science-timeline-responsive.css", import.meta.url), "utf8")
  ]);
  assert.match(runtime, /Iniciar la Actividad/);
  assert.doesNotMatch(runtime, /Jugar pregunta 1/);
  assert.match(responsive, /science-micro-launch\s*\{[\s\S]*?z-index:\s*20\s*!important;[\s\S]*?pointer-events:\s*auto\s*!important/);
  assert.match(responsive, /science-rive-launch-shell\)\s*\{\s*pointer-events:\s*none\s*!important/);
});
