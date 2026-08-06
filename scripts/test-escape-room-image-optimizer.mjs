import assert from "node:assert/strict";
import {
  dataUrlToBlob,
  detectAssetMimeType,
  extensionForMimeType,
  optimizeRasterImage
} from "../public/js/escape-room-image-optimizer.mjs";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const makeBytes = (size, signature = pngSignature) => {
  const bytes = new Uint8Array(size);
  bytes.set(signature.slice(0, size));
  return bytes;
};

assert.equal(detectAssetMimeType(makeBytes(16)), "image/png");
assert.equal(detectAssetMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
assert.equal(detectAssetMimeType(new TextEncoder().encode("GIF89a")), "image/gif");
assert.equal(detectAssetMimeType(new TextEncoder().encode("RIFF0000WEBP")), "image/webp");
assert.equal(detectAssetMimeType(new TextEncoder().encode("<?xml version='1.0'?><svg></svg>")), "image/svg+xml");
assert.equal(extensionForMimeType("image/jpeg"), "jpg");
assert.equal(extensionForMimeType("video/webm"), "webm");

const dataBlob = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
assert.ok(dataBlob instanceof Blob);
assert.equal(dataBlob.type, "image/png");

let bitmapClosed = false;
const optimized = await optimizeRasterImage(new Blob([makeBytes(100)], { type: "image/png" }), {
  decodeImage: async () => ({ width: 2400, height: 1200, close: () => { bitmapClosed = true; } }),
  encodeImage: async ({ width, height, type, quality }) => {
    assert.equal(width, 1920);
    assert.equal(height, 960);
    assert.equal(type, "image/webp");
    assert.equal(quality, 0.82);
    return new Blob([new Uint8Array(20)], { type: "image/webp" });
  }
});
assert.equal(optimized.status, "optimized");
assert.equal(optimized.extension, "webp");
assert.equal(optimized.originalBytes, 100);
assert.equal(optimized.optimizedBytes, 20);
assert.equal(optimized.width, 1920);
assert.equal(optimized.height, 960);
assert.equal(bitmapClosed, true, "ImageBitmap debe liberarse después de codificar.");

const notSmaller = await optimizeRasterImage(new Blob([makeBytes(24)], { type: "image/png" }), {
  decodeImage: async () => ({ width: 32, height: 16, close() {} }),
  encodeImage: async () => new Blob([new Uint8Array(48)], { type: "image/webp" })
});
assert.equal(notSmaller.status, "unchanged");
assert.equal(notSmaller.reason, "not-smaller");
assert.equal(notSmaller.bytes.byteLength, 24, "Nunca debe sustituirse por una imagen más pesada.");

const forcedClean = await optimizeRasterImage(new Blob([makeBytes(24)], { type: "image/png" }), {
  targetWidth: 1280,
  forceReencode: true,
  decodeImage: async () => ({ width: 640, height: 320, close() {} }),
  encodeImage: async ({ width, height }) => {
    assert.equal(width, 1280);
    assert.equal(height, 640);
    return new Blob([new Uint8Array(48)], { type: "image/webp" });
  }
});
assert.equal(forcedClean.status, "optimized");
assert.equal(forcedClean.width, 1280);
assert.equal(forcedClean.height, 640);
assert.equal(forcedClean.optimizedBytes, 48, "La limpieza obligatoria conserva el archivo recodificado aunque pese más.");

let gifDecoded = false;
const gif = await optimizeRasterImage(new Blob([new TextEncoder().encode("GIF89a")], { type: "image/gif" }), {
  decodeImage: async () => { gifDecoded = true; }
});
assert.equal(gif.status, "unchanged");
assert.equal(gif.reason, "unsupported-format");
assert.equal(gifDecoded, false, "GIF no debe perder animación por una recodificación accidental.");

const failed = await optimizeRasterImage(new Blob([makeBytes(32)], { type: "image/png" }), {
  decodeImage: async () => { throw new Error("imagen dañada"); }
});
assert.equal(failed.status, "failed");
assert.equal(failed.bytes.byteLength, 32, "Una imagen no decodificable debe conservar sus bytes originales.");

console.log("Escape room image optimizer OK.");
