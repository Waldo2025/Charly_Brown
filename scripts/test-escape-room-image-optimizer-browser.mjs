import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const moduleUrl = new URL("../public/js/escape-room-image-optimizer.mjs", import.meta.url);
const moduleSource = await readFile(moduleUrl, "utf8");
const server = http.createServer((request, response) => {
  if (request.url === "/js/escape-room-image-optimizer.mjs") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(moduleSource);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Image optimizer test</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const { optimizeRasterImage } = await import("/js/escape-room-image-optimizer.mjs");
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#e95297";
    context.fillRect(600, 300, 1200, 600);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const marker = new TextEncoder().encode(`EXIF-XMP-IPTC-TEST-${"metadata".repeat(30000)}`);
    const source = new Blob([png, marker], { type: "image/png" });
    const optimized = await optimizeRasterImage(source, {
      targetWidth: 1280,
      forceReencode: true,
      outputMimeType: "image/webp",
      quality: 0.86
    });
    const outputBlob = new Blob([optimized.bytes], { type: optimized.mimeType });
    const bitmap = await createImageBitmap(outputBlob);
    const probe = document.createElement("canvas");
    probe.width = bitmap.width;
    probe.height = bitmap.height;
    const probeContext = probe.getContext("2d");
    probeContext.drawImage(bitmap, 0, 0);
    const alpha = probeContext.getImageData(10, 10, 1, 1).data[3];
    bitmap.close();
    const outputText = new TextDecoder().decode(optimized.bytes);
    return {
      status: optimized.status,
      mimeType: optimized.mimeType,
      width: optimized.width,
      height: optimized.height,
      originalBytes: optimized.originalBytes,
      optimizedBytes: optimized.optimizedBytes,
      alpha,
      containsMetadataMarker: outputText.includes("EXIF-XMP-IPTC-TEST")
    };
  });
  assert.equal(result.status, "optimized");
  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.width, 1280);
  assert.equal(result.height, 640);
  assert.ok(result.optimizedBytes < result.originalBytes);
  assert.equal(result.alpha, 0, "WebP debe conservar la transparencia.");
  assert.equal(result.containsMetadataMarker, false, "La recodificación debe eliminar metadata ajena a los píxeles.");
  console.log("Escape room image optimizer browser OK.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
