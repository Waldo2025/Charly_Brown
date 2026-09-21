import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const { readPsd, writePsd } = require("ag-psd");
const source = readFileSync(new URL("../public/js/mindmapPsdExport.js", import.meta.url), "utf8");
const mindmapSource = readFileSync(new URL("../public/js/MindmapCreator.js", import.meta.url), "utf8");

test("ag-psd conserva el fondo debajo de los grupos de frases", () => {
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8Array([
      255, 0, 0, 255, 255, 0, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255
    ])
  };
  const buffer = writePsd({
    width: 4,
    height: 4,
    children: [
      { name: "Bloques y fondo", top: 0, left: 0, imageData },
      {
        name: "Frase P1-01 - prueba",
        opened: true,
        children: [{ name: "Sticker 001 - prueba", top: 1, left: 1, imageData }]
      }
    ]
  });
  const parsed = readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true
  });

  assert.deepEqual(parsed.children.map((layer) => layer.name), [
    "Bloques y fondo",
    "Frase P1-01 - prueba"
  ]);
  assert.equal(parsed.children[1].children[0].name, "Sticker 001 - prueba");
});

test("el exportador coloca los bloques primero y agrupa elementos por frase", () => {
  assert.match(source, /name: "Bloques y fondo"/);
  assert.match(source, /`\$\{esSticker \? "Sticker" : "Palabra"\} \$\{String\(index\)\.padStart\(3, "0"\)\} - \$\{palabra\}`/);
  assert.match(source, /function crearGruposPorFrase\(elementLayers\)/);
  assert.match(source, /const children = \[blocksLayer, \.\.\.phraseGroups\];/);
  assert.match(source, /children: orderedItems\.map\(\(item\) => item\.layer\)/);
  assert.match(source, /globalThis\.agPsd\.writePsd\(\{ width, height, canvas: composite, children \}\)/);
});

test("la identidad de frase se conserva al generar, guardar y restaurar stickers", () => {
  assert.match(mindmapSource, /sentenceId: b\.sentenceId/);
  assert.match(mindmapSource, /el\.dataset\.sentenceId = b\.sentenceId/);
  assert.match(mindmapSource, /sentenceId: el\.dataset\.sentenceId/);
  assert.match(mindmapSource, /if \(item\.sentenceId !== undefined\) img\.dataset\.sentenceId = item\.sentenceId/);
});
