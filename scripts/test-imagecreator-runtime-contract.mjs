import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readWorkspaceFile(relativePath) {
  return readFileSync(resolve(new URL("..", import.meta.url).pathname, relativePath), "utf8");
}

test("imagecreator mantiene spinner de generación y caché local para assets full-res", () => {
  const app = readWorkspaceFile("public/imagecreator/app.js");
  const renderer = readWorkspaceFile("public/imagecreator/chat-renderer.js");
  const css = readWorkspaceFile("public/imagecreator/imageCreator.css");

  assert.match(app, /resultAssetCache:\s*new Map\(/, "El estado debe mantener un caché local de resultados full-res.");
  assert.match(app, /cacheResultAssets\(/, "app.js debe poblar el caché de assets.");
  assert.match(app, /resolveCachedResultAsset\(/, "app.js debe resolver descargas desde caché local.");
  assert.match(renderer, /ic-message--pending/, "El renderer debe soportar un mensaje pendiente con spinner.");
  assert.match(css, /@keyframes ic-spin/, "El CSS debe definir la animación del spinner.");
});
