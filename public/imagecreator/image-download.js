export const WEB_IMAGE_MAX_DIMENSION = 1920;

const MIME_BY_EXTENSION = Object.freeze({
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp"
});

export function normalizeDownloadExtension(extension = "png") {
  const normalized = String(extension || "png").trim().toLowerCase().replace(/^\./, "");
  return MIME_BY_EXTENSION[normalized] ? (normalized === "jpg" ? "jpeg" : normalized) : "png";
}

export function calculateWebDimensions(width = 0, height = 0, maxDimension = WEB_IMAGE_MAX_DIMENSION) {
  const sourceWidth = Math.max(1, Math.round(Number(width) || 1));
  const sourceHeight = Math.max(1, Math.round(Number(height) || 1));
  const limit = Math.max(1, Math.round(Number(maxDimension) || WEB_IMAGE_MAX_DIMENSION));
  const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

function loadImage(dataUrl = "") {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_decode_failed"));
    image.src = String(dataUrl || "");
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("image_encode_failed"));
    }, mimeType, quality);
  });
}

export async function prepareMetadataFreeImage(dataUrl = "", {
  mode = "original",
  originalExtension = "png",
  maxWebDimension = WEB_IMAGE_MAX_DIMENSION
} = {}) {
  if (!String(dataUrl || "").trim()) throw new Error("missing_image_data");
  const image = await loadImage(dataUrl);
  const originalWidth = Number(image.naturalWidth || image.width || 0) || 1;
  const originalHeight = Number(image.naturalHeight || image.height || 0) || 1;
  const isWeb = mode === "web";
  const dimensions = isWeb
    ? calculateWebDimensions(originalWidth, originalHeight, maxWebDimension)
    : { width: originalWidth, height: originalHeight };
  const extension = isWeb ? "webp" : normalizeDownloadExtension(originalExtension);
  const mimeType = MIME_BY_EXTENSION[extension];
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  let context = null;
  try {
    context = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
  } catch (_) {
    context = canvas.getContext("2d");
  }
  if (!context) context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  // Canvas sólo conserva píxeles. EXIF, GPS, perfiles incrustados, comentarios y
  // demás bloques de metadatos no se copian al archivo recién codificado.
  const quality = isWeb ? 0.82 : (extension === "png" ? undefined : 0.95);
  const blob = await canvasToBlob(canvas, mimeType, quality);
  return {
    blob,
    extension,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    originalWidth,
    originalHeight,
    metadataRemoved: true
  };
}

export function downloadPreparedBlob(blob, fileName = "image.png") {
  if (!(blob instanceof Blob)) throw new Error("download_blob_missing");
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = String(fileName || "image.png");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
