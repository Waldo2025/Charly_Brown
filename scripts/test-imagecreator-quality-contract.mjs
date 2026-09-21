import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readWorkspaceFile(relativePath) {
  return readFileSync(resolve(new URL("..", import.meta.url).pathname, relativePath), "utf8");
}

test("adjuntos preservan una versión visual de mayor calidad separada del inline compacto", () => {
  const source = readWorkspaceFile("public/imagecreator/attachments.js");
  assert.match(source, /originalDataUrl/, "attachments.js debe conservar originalDataUrl para preview/reuso.");
  assert.match(source, /inlineBase64/, "attachments.js debe conservar inlineBase64 para el payload compacto.");
});

test("el tray de adjuntos usa originalDataUrl y no fuerza cover en la miniatura", () => {
  const renderer = readWorkspaceFile("public/imagecreator/chat-renderer.js");
  const css = readWorkspaceFile("public/imagecreator/imageCreator.css");
  assert.match(renderer, /originalDataUrl\s*\|\|\s*attachment\.dataUrl/, "El preview del tray debe preferir originalDataUrl.");
  assert.match(css, /\.ic-attachment-card img\s*\{[\s\S]*object-fit:\s*contain;/, "La miniatura del adjunto debe usar contain.");
});

test("icOptionsPanel se comporta como panel flotante y toggleable", () => {
  const html = readWorkspaceFile("public/imageCreator.html");
  const css = readWorkspaceFile("public/imagecreator/imageCreator.css");
  const app = readWorkspaceFile("public/imagecreator/app.js");
  assert.match(html, /id="icOptionsModal"[^>]*aria-hidden="true"/, "La página debe incluir el overlay del modal.");
  assert.match(html, /id="icOptionsPanel"/, "La página debe incluir icOptionsPanel.");
  assert.match(html, /id="icOptionsPanel"[^>]*role="dialog"[^>]*aria-modal="true"/, "Ajustes debe ser un diálogo modal accesible.");
  assert.match(html, /id="icCloseOptionsBtn"/, "El panel flotante debe tener botón de cierre.");
  assert.match(css, /\.ic-options-modal\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*160;/, "El overlay debe cubrir el workspace.");
  assert.match(app, /elements\.closeOptionsBtn/, "app.js debe registrar el botón de cierre del panel.");
  assert.match(app, /event\.target === elements\.optionsModal/, "El modal debe cerrar al pulsar el fondo.");
  assert.match(app, /dom\.js\?v=2026-09-07\.15/, "La dependencia DOM debe invalidar caché al incorporar el modal.");
});

test("api de imagecreator no degrada el resultado inmediatamente después de recibirlo", () => {
  const source = readWorkspaceFile("public/imagecreator/api.js");
  assert.doesNotMatch(
    source,
    /shrinkImageResultForSession/,
    "api.js no debe reducir la calidad del resultado antes de mostrarlo en la UI."
  );
});
