import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../public/home.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/home.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");

test("retira las clases hero solicitadas y conserva títulos compactos", () => {
  assert.doesNotMatch(html, /class="flow-hero-title"/);
  assert.doesNotMatch(html, /class="flow-hero-actions"/);
  assert.match(html, /class="workbench-view-title">Videos y Multimedia/);
  assert.match(css, /\.workbench-view-title[\s\S]*font-size: clamp\(1rem, 1\.5vw, 1\.25rem\)/);
});

test("el launcher alterna tarjetas de dos columnas e iconos de cuatro columnas", () => {
  assert.match(html, /id="homeFlowStatus"[^>]*data-layout="cards"/);
  assert.match(html, /id="flowStatusLayoutToggle"/);
  assert.equal((html.match(/class="section-card flow-status-action/g) || []).length, 6);
  assert.match(css, /\.flow-status-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /#homeFlowStatus\[data-layout="icons"\] \.flow-status-grid[\s\S]*grid-template-columns: repeat\(4, 72px\)/);
  assert.match(css, /#homeFlowStatus\[data-layout="icons"\] \.flow-status-action[\s\S]*aspect-ratio: 1/);
  assert.match(css, /#homeFlowStatus\[data-layout="icons"\] \.flow-status-img[\s\S]*width: 42px[\s\S]*height: 42px/);
  assert.match(js, /HOME_FLOW_STATUS_LAYOUT_KEY/);
  assert.match(js, /nextLayout = container\.dataset\.layout === "icons" \? "cards" : "icons"/);
});

test("unifica acciones compactas y elimina estilos inline incompatibles", () => {
  assert.match(css, /--home-ui-primary: #00a3ff/);
  assert.match(css, /background: color-mix\(in srgb, var\(--flow-accent\) 88%, #111827\)/);
  assert.match(css, /\.btn-workbench-action[\s\S]*\.btn-multimedia-play-large[\s\S]*font-size: 0\.72rem !important/);
  assert.doesNotMatch(js, /class="btn-workbench-action"[^>]*style=/);
  assert.doesNotMatch(js, /class="btn-workbench-action ver-lectura"[^>]*style=/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("fuerza la build visual vigente", () => {
  assert.match(html, /cache-version-loader\.js\?v=2026-1\.0\.10\.835/);
  const loader = readFileSync(new URL("../public/js/cache-version-loader.js", import.meta.url), "utf8");
  assert.match(loader, /fallbackVersion = "2026-1\.0\.10\.835"/);
});
