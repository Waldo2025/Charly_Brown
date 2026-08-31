import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [themes, source] = await Promise.all([
  readFile(new URL("../public/science-hud-themes.css", import.meta.url), "utf8"),
  readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8")
]);

test("resultado y mazos Rive se centran verticalmente", () => {
  assert.match(themes, /\.science-rive-result-content \{\s*justify-content:safe center!important/);
  assert.match(themes, /\.science-rive-answer-deck\.is-rive-only \{[\s\S]*?align-content:safe center!important/);
  assert.match(themes, /\.science-rive-answer-deck\.is-rive-only\.is-keyword-question \{\s*align-content:safe center!important/);
  assert.match(source, /\.science-rive-result-content\{[^}]*justify-content:safe center!important/);
  assert.match(source, /\.science-rive-answer-deck\.is-rive-only\{[^}]*align-content:safe center!important/);
});

test("fill blank ocupa el visor completo sin margen superior", () => {
  assert.match(themes, /\.science-structured-game\.is-fill-blank \{[\s\S]*?width:100%!important;[\s\S]*?height:100%!important;[\s\S]*?align-content:safe center!important/);
  assert.match(themes, /\.science-structured-game\.is-fill-blank > header \{[\s\S]*?margin-top:0!important/);
  assert.match(source, /\.science-structured-game\.is-fill-blank>header\{[^}]*margin-top:0!important/);
});

test("secuencia y ecuaciones tienen etiquetas contrastantes y ruta a ancho completo", () => {
  assert.match(themes, /\.science-structured-game\.is-sequence-order \.science-sequence-slots \{\s*width:100%!important/);
  assert.match(themes, /\.science-structured-game\.is-equation-build \.science-token-bank-label/);
  assert.match(themes, /color:#f3fffd!important;[\s\S]*?background:#123443!important/);
  assert.match(source, /\.science-structured-game\.is-sequence-order :is\(\.science-rive-sequence-route,\.science-sequence-slots\)\{width:100%!important/);
});
