import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../public/imagecreator/imageCreator.css", import.meta.url), "utf8");
const html = await readFile(new URL("../public/imageCreator.html", import.meta.url), "utf8");

test("los tres temas definen tokens para todo el workspace de Image Creator", () => {
  for (const token of [
    "--ic-bg", "--ic-panel", "--ic-canvas", "--ic-feed", "--ic-message",
    "--ic-input", "--ic-text", "--ic-muted", "--ic-border", "--ic-header",
    "--ic-header-text", "--ic-header-control", "--ic-accent-soft", "--ic-danger-soft",
    "--ic-overlay", "--ic-canvas-shadow"
  ]) {
    assert.equal((css.match(new RegExp(`${token}:`, "g")) || []).length, 3, `${token} debe existir en oscuro, claro y gris`);
  }
});

test("paneles, header interno y estados visuales consumen variables semánticas", () => {
  assert.match(css, /\.ic-app-header\s*\{[^}]*background:var\(--ic-header\)[^}]*color:var\(--ic-header-text\)/s);
  assert.match(css, /\.ic-session-rail,\.ic-tools-panel\s*\{[^}]*background:var\(--ic-panel\)/s);
  assert.match(css, /\.ic-canvas-shell\s*\{[^}]*background:var\(--ic-canvas\)/s);
  assert.match(css, /\.ic-chat-feed\s*\{[^}]*background:var\(--ic-feed\)/s);
  assert.match(css, /\.ic-inline-alert\s*\{[^}]*background:var\(--ic-danger-soft\)/s);
  assert.match(css, /\.ic-region-editor\s*\{[^}]*background:var\(--ic-gallery-overlay\)/s);
  assert.match(html, /imageCreator\.css\?v=2026-09-08\.24/);
});

test("el tema guardado se aplica antes de cargar estilos y evita el destello oscuro", () => {
  const bootstrapIndex = html.indexOf('const storageKey = "ic-workspace-theme-v1"');
  const stylesheetIndex = html.indexOf('imagecreator/imageCreator.css');
  assert.ok(bootstrapIndex >= 0 && bootstrapIndex < stylesheetIndex);
  assert.match(html, /document\.documentElement\.dataset\.icTheme = theme/);
  assert.match(css, /html\[data-ic-theme="light"\] body\[data-page="imagecreator\.html" i\]/);
  assert.match(css, /html\[data-ic-theme="mid"\] body\[data-page="imagecreator\.html" i\]/);
});
