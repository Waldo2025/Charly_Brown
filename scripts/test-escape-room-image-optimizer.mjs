import assert from "node:assert/strict";
import {
  dataUrlToBlob,
  detectAssetMimeType,
  extensionForMimeType,
  optimizeRasterImage,
  stripGifMetadata,
  stripSvgMetadata
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

const sanitizedEvenWhenLarger = await optimizeRasterImage(new Blob([makeBytes(24)], { type: "image/png" }), {
  decodeImage: async () => ({ width: 32, height: 16, close() {} }),
  encodeImage: async () => new Blob([new Uint8Array(48)], { type: "image/webp" })
});
assert.equal(sanitizedEvenWhenLarger.status, "optimized");
assert.equal(sanitizedEvenWhenLarger.bytes.byteLength, 48, "Debe conservar la recodificación limpia aunque pese más.");

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

let fallbackEncodes = 0;
const fallback = await optimizeRasterImage(new Blob([makeBytes(24)], { type: "image/png" }), {
  decodeImage: async () => ({ width: 32, height: 16, close() {} }),
  encodeImage: async ({ type }) => {
    fallbackEncodes += 1;
    return new Blob([new Uint8Array(20)], { type: type === "image/webp" ? "image/png" : type });
  }
});
assert.equal(fallback.mimeType, "image/png");
assert.equal(fallback.reason, "webp-unavailable-fallback");
assert.equal(fallbackEncodes, 2, "Debe recodificar al formato de respaldo si WebP no está disponible.");

let gifDecoded = false;
const gif = await optimizeRasterImage(new Blob([new TextEncoder().encode("GIF89a")], { type: "image/gif" }), {
  decodeImage: async () => { gifDecoded = true; }
});
assert.equal(gif.status, "unchanged");
assert.equal(gif.reason, "unsupported-format");
assert.equal(gifDecoded, false, "GIF no debe perder animación por una recodificación accidental.");

const gifWithComment = new Uint8Array([
  ...new TextEncoder().encode("GIF89a"),
  1, 0, 1, 0, 0, 0, 0,
  0x21, 0xff, 11, ...new TextEncoder().encode("NETSCAPE2.0"), 3, 1, 0, 0, 0,
  0x21, 0xfe, 4, ...new TextEncoder().encode("note"), 0,
  0x3b
]);
const cleanGif = stripGifMetadata(gifWithComment);
assert.ok(cleanGif.byteLength < gifWithComment.byteLength);
assert.doesNotMatch(new TextDecoder().decode(cleanGif), /note/, "Debe retirar comentarios de GIF.");
assert.match(new TextDecoder().decode(cleanGif), /NETSCAPE2\.0/, "Debe conservar el bloque que controla el loop animado.");

const svgWithMetadata = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><metadata>EXIF-XMP</metadata><!-- note --><rect width="1" height="1"/></svg>');
const cleanSvg = stripSvgMetadata(svgWithMetadata);
assert.doesNotMatch(new TextDecoder().decode(cleanSvg), /EXIF-XMP|note/);
assert.match(new TextDecoder().decode(cleanSvg), /<rect/);

const failed = await optimizeRasterImage(new Blob([makeBytes(32)], { type: "image/png" }), {
  decodeImage: async () => { throw new Error("imagen dañada"); }
});
assert.equal(failed.status, "failed");
assert.equal(failed.bytes.byteLength, 32, "Una imagen no decodificable debe conservar sus bytes originales.");

console.log("Escape room image optimizer OK.");
