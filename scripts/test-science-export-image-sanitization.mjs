import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");

test("la recodificación limita el ancho sin ampliar imágenes pequeñas", () => {
  assert.match(source, /Math\.min\(bitmap\.width, Math\.round\(Number\(targetWidth\) \|\| 1280\)\)/);
  assert.match(source, /bitmap\.height \* \(outputWidth \/ bitmap\.width\)/);
  assert.match(source, /canvas\.toBlob\(/);
  assert.match(source, /const cleanImage = await sanitizeAndResizeImage\(sourceBlob, 1280/);
  assert.match(source, /new Uint8Array\(await cleanImage\.blob\.arrayBuffer\(\)\)/);
  assert.match(source, /zip\.file\(path, zipBytes\)/);
});

test("todas las familias de imágenes del ZIP pasan por la limpieza", () => {
  assert.match(source, /"assets\/player-sprite", \{ losslessAlpha: true \}/);
  assert.match(source, /`assets\/level-\$\{index \+ 1\}`/);
  assert.match(source, /`assets\/question-\$\{index \+ 1\}`/);
  assert.match(source, /"assets\/simulator\/background"/);
  assert.match(source, /`assets\/simulator\/layer-\$\{index \+ 1\}`, \{ losslessAlpha: true \}/);
  assert.match(source, /metadataStripped: true/);
});

test("la ruta heredada y la exportación del preview localizan imágenes antes de generar el ZIP", () => {
  assert.match(source, /await localizePreviewExportImages\(zip, exportActivity, runtimeActivity\)/);
  assert.match(source, /await localizePreviewExportImages\(zip, exportActivity, exportActivity\)/);
  assert.match(source, /JSZipConstructor\.prototype\.generateAsync = async function patchedGenerateAsync/);
  assert.match(source, /await addExportImageAsset\(this, source,/);
  assert.match(source, /SCIENCE_EXPORT_PACKAGE_VERSION = 18/);
});
