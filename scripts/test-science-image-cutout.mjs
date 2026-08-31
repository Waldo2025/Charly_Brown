import test from "node:test";
import assert from "node:assert/strict";
import { despillImageMatte, keepPrimaryImageComponent, removeConnectedImageBackground } from "../public/js/science-image-cutout.mjs";

function image(width, height, background) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let position = 0; position < width * height; position++) {
    data.set([...background, 255], position * 4);
  }
  return data;
}

test("el recorte infiere un fondo claro cuando Gemini ignora el chroma", () => {
  const width = 24;
  const height = 16;
  const data = image(width, height, [249, 241, 244]);
  for (let y = 6; y <= 10; y++) {
    for (let x = 6; x <= 18; x++) data.set([35, 58, 68, 255], (y * width + x) * 4);
  }
  for (let y = 7; y <= 9; y++) {
    for (let x = 8; x <= 16; x++) data.set([250, 250, 248, 255], (y * width + x) * 4);
  }
  const result = removeConnectedImageBackground(data, width, height, [0, 255, 0]);
  assert.equal(result.usedInferredMatte, true);
  assert.equal(result.data[3], 0);
  assert.equal(result.data[(8 * width + 12) * 4 + 3], 255, "el blanco interior del objeto debe conservarse");
  assert.ok(result.removedPixels > width * height / 2);
});

test("el chroma correcto conserva la ruta rápida", () => {
  const width = 12;
  const height = 12;
  const data = image(width, height, [0, 255, 0]);
  for (let y = 4; y <= 7; y++) {
    for (let x = 4; x <= 7; x++) data.set([30, 40, 60, 255], (y * width + x) * 4);
  }
  const result = removeConnectedImageBackground(data, width, height, [0, 255, 0]);
  assert.equal(result.usedInferredMatte, false);
  assert.equal(result.data[3], 0);
  assert.equal(result.data[(5 * width + 5) * 4 + 3], 255);
});

test("el sprite conserva el objeto principal y elimina flechas y HUD desconectados", () => {
  const width = 40;
  const height = 24;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 7; y <= 17; y++) for (let x = 12; x <= 27; x++) data.set([220, 230, 235, 255], (y * width + x) * 4);
  for (let y = 18; y <= 20; y++) for (let x = 31; x <= 37; x++) data.set([0, 240, 255, 255], (y * width + x) * 4);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 5; x++) data.set([80, 255, 120, 255], (y * width + x) * 4);
  const result = keepPrimaryImageComponent(data, width, height);
  assert.equal(result.data[(12 * width + 20) * 4 + 3], 255);
  assert.equal(result.data[(19 * width + 34) * 4 + 3], 0);
  assert.equal(result.data[(3 * width + 3) * 4 + 3], 0);
  assert.equal(result.removedComponents, 2);
});

test("el modo estricto conserva ruedas pero elimina una flecha lateral grande", () => {
  const width = 80;
  const height = 44;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 12; y <= 29; y++) for (let x = 25; x <= 68; x++) data.set([210, 225, 232, 255], (y * width + x) * 4);
  for (let y = 31; y <= 36; y++) for (let x = 31; x <= 38; x++) data.set([30, 42, 51, 255], (y * width + x) * 4);
  for (let y = 31; y <= 36; y++) for (let x = 55; x <= 62; x++) data.set([30, 42, 51, 255], (y * width + x) * 4);
  for (let y = 16; y <= 25; y++) for (let x = 3; x <= 19; x++) data.set([120, 240, 80, 255], (y * width + x) * 4);
  const result = keepPrimaryImageComponent(data, width, height, { strict: true });
  assert.equal(result.data[(20 * width + 10) * 4 + 3], 0, "la flecha lateral debe desaparecer");
  assert.equal(result.data[(33 * width + 34) * 4 + 3], 255, "la rueda izquierda debe conservarse");
  assert.equal(result.data[(33 * width + 58) * 4 + 3], 255, "la rueda derecha debe conservarse");
});

test("descontamina el halo verde del borde y limpia el RGB transparente", () => {
  const width = 12, height = 8, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 8; x++) data.set([58, 178, 66, 210], (y * width + x) * 4);
  for (let y = 3; y <= 4; y++) for (let x = 4; x <= 7; x++) data.set([80, 96, 110, 255], (y * width + x) * 4);
  for (let position = 0; position < width * height; position++) if (data[position * 4 + 3] === 0) data.set([0, 255, 0, 0], position * 4);
  const result = despillImageMatte(data, width, height, [0, 255, 0], { radius: 2 });
  const edge = (2 * width + 4) * 4;
  assert.ok(result.data[edge + 1] <= Math.max(result.data[edge], result.data[edge + 2]) + 8);
  assert.deepEqual([...result.data.slice(0, 4)], [0, 0, 0, 0]);
  assert.ok(result.correctedPixels > 0);
  assert.equal(result.residualPixels, 0);
});
