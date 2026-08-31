import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewCss = await readFile(new URL("../public/scienceActivities.css", import.meta.url), "utf8");
const exportCss = await readFile(new URL("../public/science-assessment-export.css", import.meta.url), "utf8");
const page = await readFile(new URL("../public/scienceActivities.html", import.meta.url), "utf8");
const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");

for (const [name, css] of [["preview", previewCss], ["export", exportCss]]) {
  test(`${name}: el viewport conserva 16:9 en todos los anchos`, () => {
    assert.match(css, /science-sim-grid\{height:auto!important;min-height:0!important;max-height:none!important/);
    assert.match(css, /science-sim-viewport\{width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:16\/9!important/);
  });

  test(`${name}: el estado no se estira con el encabezado`, () => {
    assert.match(css, /science-sim-header\{align-items:flex-start!important/);
    assert.match(css, /science-sim-status\{align-self:flex-start!important;[^}]*height:auto!important/);
  });

  test(`${name}: cuando el panel es estrecho el escenario ocupa toda la fila y la medición baja`, () => {
    assert.match(css, /science-phaser-simulator\{container-type:inline-size\}/);
    assert.match(css, /@container\(max-width:900px\)\{[^]*science-sim-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)!important;[^}]*grid-template-areas:"viewport" "telemetry"!important/);
    assert.match(css, /@container\(max-width:900px\)\{[^]*science-sim-viewport\{[^}]*grid-area:viewport;[^}]*width:100%!important/);
    assert.match(css, /@container\(max-width:900px\)\{[^]*science-sim-telemetry\{[^}]*grid-area:telemetry;[^}]*width:100%!important/);
  });

  test(`${name}: la recta distingue tablet de teléfono`, () => {
    assert.match(css, /@container\(max-width:900px\)\{[^]*number-line[^}]*science-sim-controls\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
    assert.match(css, /@container\(max-width:560px\)\{[^]*science-sim-header\{[^}]*display:grid!important;[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
    assert.match(css, /@container\(max-width:560px\)\{[^]*number-line[^}]*science-sim-controls\{[^}]*grid-template-columns:minmax\(0,1fr\)!important/);
  });

  test(`${name}: el selector segmentado usa un switch compacto y accesible`, () => {
    assert.match(css, /science-sim-segmented::before\{[^}]*border-radius:999px;[^}]*transition:transform/);
    assert.match(css, /science-sim-segmented:has\(label:last-child input:checked\)::before\{transform:translateX\(100%\)\}/);
    assert.match(css, /science-sim-segmented:has\(input:focus-visible\)\{outline:3px solid/);
  });
}

test("preview y ZIP invalidan la caché de los estilos compactos", () => {
  assert.match(page, /scienceActivities\.css\?v=20260815-segmented-switch-v44/);
  assert.match(source, /science-assessment-export\.css\?v=20260815-segmented-switch-v34/g);
});

test("Android conserva scroll vertical en el preview a pantalla completa", () => {
  assert.match(previewCss, /sa-game-frame:is\(:fullscreen, :-webkit-full-screen\)[^{]*\{[^}]*overflow-y:auto!important;[^}]*touch-action:pan-y/);
  assert.match(previewCss, /sa-game-mount\.science-simulator-host[^}]*overflow:visible!important/);
});

test("Android conserva scroll vertical en el simulador exportado", () => {
  assert.match(exportCss, /html:is\(:fullscreen, :-webkit-full-screen\)[^}]*overflow-y:auto!important;[^}]*touch-action:pan-y/);
  assert.match(source, /html:is\(:fullscreen, :-webkit-full-screen\) body\[data-science-export\][^}]*overflow-y:auto!important/);
  assert.match(source, /science-sim-controls input\[type="range"\]\{touch-action:pan-y\}/);
});

test("el ensamblado final del ZIP conserva la proporción después de todos los temas", () => {
  const finalBoundary = source.slice(source.indexOf("Final standalone simulator boundary"));
  assert.match(finalBoundary, /#scienceGameMount \.science-sim-grid\{[^}]*height:auto!important;[^}]*max-height:none!important/);
  assert.match(finalBoundary, /#scienceGameMount \.science-sim-viewport\{[^}]*aspect-ratio:16\/9!important/);
  assert.match(finalBoundary, /#scienceGameMount \.science-sim-status\{[^}]*height:34px!important/);
});

test("el ensamblado final del ZIP conserva la composición estrecha", () => {
  const finalBoundary = source.slice(source.indexOf("Final standalone simulator boundary"));
  assert.match(finalBoundary, /@container\(max-width:900px\)\{[^]*grid-template-areas:"viewport" "telemetry"!important/);
  assert.match(finalBoundary, /science-sim-telemetry\{grid-area:telemetry;[^}]*width:100%!important/);
});

test("el simulador exportado centra todo el laboratorio verticalmente", () => {
  const finalBoundary = source.slice(source.indexOf("Final standalone simulator boundary"));
  assert.match(finalBoundary, /#scienceGameMount>\.science-phaser-simulator\{[^}]*min-height:100dvh!important;[^}]*justify-content:safe center!important/);
  assert.match(finalBoundary, /--science-sim-safe-x:clamp\(28px,3\.5vw,58px\)/);
  assert.match(finalBoundary, /padding:max\(var\(--science-sim-safe-y\),env\(safe-area-inset-top\)\)/);
  assert.match(finalBoundary, /@media\(max-width:900px\)[^]*justify-content:flex-start!important/);
});

test("sólo el control de pantalla completa permanece fijo arriba a la izquierda", () => {
  const finalBoundary = source.slice(source.indexOf("Final standalone simulator boundary"));
  assert.match(finalBoundary, /science-export-fullscreen\{position:fixed!important;z-index:2147483647!important;top:max\(14px,env\(safe-area-inset-top\)\)!important;left:max\(14px,env\(safe-area-inset-left\)\)!important/);
});
