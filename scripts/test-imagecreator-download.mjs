import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  WEB_IMAGE_MAX_DIMENSION,
  calculateWebDimensions,
  normalizeDownloadExtension
} from "../public/imagecreator/image-download.js";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const read = (file) => readFileSync(resolve(rootDir, file), "utf8");

test("preparar para web conserva proporción, no amplía y limita el lado mayor a 1920 px", () => {
  assert.equal(WEB_IMAGE_MAX_DIMENSION, 1920);
  assert.deepEqual(calculateWebDimensions(4096, 2048), { width: 1920, height: 960 });
  assert.deepEqual(calculateWebDimensions(1200, 800), { width: 1200, height: 800 });
  assert.deepEqual(calculateWebDimensions(2048, 4096), { width: 960, height: 1920 });
});

test("descarga original normaliza los formatos permitidos", () => {
  assert.equal(normalizeDownloadExtension("jpg"), "jpeg");
  assert.equal(normalizeDownloadExtension("webp"), "webp");
  assert.equal(normalizeDownloadExtension("desconocido"), "png");
});

test("las dos descargas se recodifican desde canvas para no copiar metadatos", () => {
  const html = read("public/imageCreator.html");
  const renderer = read("public/imagecreator/chat-renderer.js");
  const download = read("public/imagecreator/image-download.js");
  const app = read("public/imagecreator/app.js");
  for (const action of ["download-web", "download-original"]) {
    assert.match(html, new RegExp(`data-viewer-result-action="${action}"`));
    assert.match(renderer, new RegExp(`data-result-action="${action}"`));
  }
  assert.match(download, /context\.drawImage\(image/);
  assert.match(download, /canvasToBlob\(canvas, mimeType, quality\)/);
  assert.match(download, /metadataRemoved: true/);
  assert.match(app, /prepareMetadataFreeImage\(assetDataUrl/);
  assert.doesNotMatch(app, /downloadDataUrl\(downloadUrl/);
});
