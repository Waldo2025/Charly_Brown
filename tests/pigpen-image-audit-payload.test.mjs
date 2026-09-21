import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

test("visual audit compresses oversized generated images before sending them", () => {
  const prepareSource = functionSource("prepareImageForVisualAudit", "auditGeneratedImage");
  const auditSource = functionSource("auditGeneratedImage", "generateValidatedImage");
  assert.match(source, /MAX_IMAGE_AUDIT_DATA_URL_CHARS = 900 \* 1024/);
  assert.match(prepareSource, /maxDimension: 768, quality: 0\.62/);
  assert.match(prepareSource, /maxDimension: 512, quality: 0\.48/);
  assert.match(prepareSource, /outputMimeType: "image\/webp"/);
  assert.match(auditSource, /await prepareImageForVisualAudit\(imageDataUrl\)/);
  assert.doesNotMatch(auditSource, /imageDataPart\(imageDataUrl\)/);
});

test("binary-to-data-url conversion works without spreading the whole image", () => {
  const converterSource = functionSource("imageBytesToDataUrl", "prepareImageForVisualAudit").replace(/\s*async\s*$/, "");
  const convert = Function(`return (${converterSource.trim()});`)();
  const result = convert(new Uint8Array([0, 1, 2, 253, 254, 255]), "image/webp");
  assert.equal(result, "data:image/webp;base64,AAEC/f7/");
  assert.match(converterSource, /chunkSize = 0x8000/);
});
