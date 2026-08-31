function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

self.addEventListener("message", async (event) => {
  const payload = event.data && typeof event.data === "object" ? event.data : {};
  const id = String(payload.id || "");
  let bitmap = null;
  try {
    const file = payload.file;
    if (!(file instanceof Blob)) throw new Error("invalid_image_file");
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
      throw new Error("image_worker_unsupported");
    }
    const targetWidth = Math.max(2, Math.round(Number(payload.targetWidth || 1280) || 1280));
    const targetHeight = Math.max(2, Math.round(Number(payload.targetHeight || 720) || 720));
    const quality = Math.max(0.55, Math.min(0.94, Number(payload.quality || 0.82) || 0.82));
    bitmap = await createImageBitmap(file);
    const sourceWidth = Math.max(1, Number(bitmap.width || 1));
    const sourceHeight = Math.max(1, Number(bitmap.height || 1));
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const renderWidth = Math.max(1, Math.round(sourceWidth * scale));
    const renderHeight = Math.max(1, Math.round(sourceHeight * scale));
    const offsetX = Math.round((targetWidth - renderWidth) / 2);
    const offsetY = Math.round((targetHeight - renderHeight) / 2);
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("image_worker_canvas_unavailable");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(bitmap, offsetX, offsetY, renderWidth, renderHeight);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const dataUrl = `data:image/jpeg;base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
    self.postMessage({ id, ok: true, dataUrl, width: targetWidth, height: targetHeight });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error || "image_worker_failed") });
  } finally {
    try { bitmap?.close?.(); } catch (_) { }
  }
});
