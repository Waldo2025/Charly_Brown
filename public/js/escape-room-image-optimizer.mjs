export const IMAGE_OPTIMIZATION_DEFAULTS = Object.freeze({
  maxDimension: 1920,
  quality: 0.82,
  outputMimeType: "image/webp"
});

const OPTIMIZABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function concatByteChunks(chunks = []) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return output;
}

function readGifSubBlocksEnd(bytes, start) {
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset];
    offset += 1;
    if (size === 0) return offset;
    if (offset + size > bytes.length) return -1;
    offset += size;
  }
  return -1;
}

/** Remove comment/XMP/ICC blocks while preserving frames, timing and animation loops. */
export function stripGifMetadata(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || 0);
  if (bytes.length < 13 || !/^GIF8[79]a$/.test(new TextDecoder().decode(bytes.slice(0, 6)))) return bytes;
  const globalTableBytes = (bytes[10] & 0x80) ? 3 * (2 ** ((bytes[10] & 0x07) + 1)) : 0;
  let offset = 13 + globalTableBytes;
  if (offset > bytes.length) return bytes;
  const chunks = [bytes.slice(0, offset)];
  let changed = false;

  while (offset < bytes.length) {
    const blockStart = offset;
    const introducer = bytes[offset];
    if (introducer === 0x3b) {
      chunks.push(bytes.slice(offset));
      offset = bytes.length;
      break;
    }
    if (introducer === 0x2c) {
      if (offset + 10 > bytes.length) return bytes;
      const localTableBytes = (bytes[offset + 9] & 0x80)
        ? 3 * (2 ** ((bytes[offset + 9] & 0x07) + 1))
        : 0;
      const dataStart = offset + 10 + localTableBytes;
      if (dataStart >= bytes.length) return bytes;
      const blockEnd = readGifSubBlocksEnd(bytes, dataStart + 1);
      if (blockEnd < 0) return bytes;
      chunks.push(bytes.slice(blockStart, blockEnd));
      offset = blockEnd;
      continue;
    }
    if (introducer === 0x21) {
      if (offset + 2 >= bytes.length) return bytes;
      const label = bytes[offset + 1];
      const blockEnd = readGifSubBlocksEnd(bytes, offset + 2);
      if (blockEnd < 0) return bytes;
      const identifierLength = bytes[offset + 2] || 0;
      const identifier = new TextDecoder().decode(bytes.slice(offset + 3, offset + 3 + identifierLength));
      const isMetadata = label === 0xfe
        || (label === 0xff && /^(?:XMP DataXMP|ICCRGBG1012)/i.test(identifier));
      if (isMetadata) changed = true;
      else chunks.push(bytes.slice(blockStart, blockEnd));
      offset = blockEnd;
      continue;
    }
    return bytes;
  }
  return changed ? concatByteChunks(chunks) : bytes;
}

/** Remove non-rendering SVG metadata without changing its vector content. */
export function stripSvgMetadata(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || 0);
  const source = new TextDecoder().decode(bytes);
  const sanitized = source
    .replace(/<\?xpacket\b[\s\S]*?\?>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata\s*>/gi, "")
    .replace(/<metadata\b[^>]*\/\s*>/gi, "");
  return sanitized === source ? bytes : new TextEncoder().encode(sanitized);
}

function normalizeMimeType(value = "") {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function startsWithBytes(bytes, signature) {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

export function detectAssetMimeType(bytesLike, declaredType = "") {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || 0);
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE") return "audio/wav";
  if (startsWithBytes(bytes, [0x4f, 0x67, 0x67, 0x53])) return "audio/ogg";
  if (startsWithBytes(bytes, [0x49, 0x44, 0x33]) || startsWithBytes(bytes, [0xff, 0xfb])) return "audio/mpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "video/mp4";

  const textPrefix = new TextDecoder().decode(bytes.slice(0, 512)).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(textPrefix)) return "image/svg+xml";
  return normalizeMimeType(declaredType) || "application/octet-stream";
}

export function extensionForMimeType(mimeType = "", fallback = "bin") {
  const extensions = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "video/mp4": "mp4",
    "video/webm": "webm"
  };
  return extensions[normalizeMimeType(mimeType)] || fallback;
}

export function dataUrlToBlob(value = "") {
  const match = String(value || "").trim().match(/^data:([^;,]*)(;base64)?,(.*)$/is);
  if (!match) return null;
  const mimeType = normalizeMimeType(match[1]) || "application/octet-stream";
  try {
    const binary = match[2]
      ? atob(match[3].replace(/\s/g, ""))
      : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType });
  } catch (_) {
    return null;
  }
}

async function decodeImageInBrowser(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch (_) {
    return await createImageBitmap(blob);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("El navegador no pudo codificar la imagen."));
    }, type, quality);
  });
}

async function encodeImageInBrowser({ bitmap, width, height, type, quality }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D no está disponible.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvasToBlob(canvas, type, quality);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export async function optimizeRasterImage(blob, options = {}) {
  if (!(blob instanceof Blob)) throw new TypeError("La optimización requiere un Blob.");
  const settings = { ...IMAGE_OPTIMIZATION_DEFAULTS, ...options };
  const targetWidth = Number(settings.targetWidth);
  const hasTargetWidth = Number.isFinite(targetWidth) && targetWidth > 0;
  settings.outputMimeType = normalizeMimeType(settings.outputMimeType) || IMAGE_OPTIMIZATION_DEFAULTS.outputMimeType;
  const originalBytes = new Uint8Array(await blob.arrayBuffer());
  const originalMimeType = detectAssetMimeType(originalBytes, blob.type);
  const originalResult = {
    bytes: originalBytes,
    mimeType: originalMimeType,
    extension: extensionForMimeType(originalMimeType),
    originalBytes: originalBytes.byteLength,
    optimizedBytes: originalBytes.byteLength,
    originalWidth: 0,
    originalHeight: 0,
    width: 0,
    height: 0
  };

  if (!OPTIMIZABLE_IMAGE_TYPES.has(originalMimeType)) {
    const sanitizedBytes = originalMimeType === "image/svg+xml"
      ? stripSvgMetadata(originalBytes)
      : originalMimeType === "image/gif"
        ? stripGifMetadata(originalBytes)
        : originalBytes;
    const changed = sanitizedBytes !== originalBytes;
    return {
      ...originalResult,
      bytes: sanitizedBytes,
      optimizedBytes: sanitizedBytes.byteLength,
      status: changed ? "sanitized" : "unchanged",
      reason: changed ? "metadata-stripped" : "unsupported-format"
    };
  }

  const decodeImage = options.decodeImage || decodeImageInBrowser;
  const encodeImage = options.encodeImage || encodeImageInBrowser;
  let bitmap = null;
  try {
    bitmap = await decodeImage(new Blob([originalBytes], { type: originalMimeType }));
    const originalWidth = Math.max(1, Number(bitmap.width) || 1);
    const originalHeight = Math.max(1, Number(bitmap.height) || 1);
    const scale = hasTargetWidth
      ? targetWidth / originalWidth
      : Math.min(1, settings.maxDimension / Math.max(originalWidth, originalHeight));
    const width = hasTargetWidth
      ? Math.max(1, Math.round(targetWidth))
      : Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));
    let encodedBlob = null;
    try {
      encodedBlob = await encodeImage({
        bitmap,
        width,
        height,
        type: settings.outputMimeType,
        quality: settings.quality
      });
    } catch (_) {
      encodedBlob = null;
    }
    let outputMimeType = normalizeMimeType(encodedBlob?.type);
    let usedFallback = outputMimeType !== settings.outputMimeType;
    if (usedFallback) {
      const fallbackMimeType = originalMimeType === "image/jpeg" ? "image/jpeg" : "image/png";
      encodedBlob = await encodeImage({
        bitmap,
        width,
        height,
        type: fallbackMimeType,
        quality: settings.quality
      });
      outputMimeType = normalizeMimeType(encodedBlob?.type);
      if (outputMimeType !== fallbackMimeType) throw new Error("El navegador no pudo recodificar la imagen sin metadatos.");
    }
    const optimizedBytes = new Uint8Array(await encodedBlob.arrayBuffer());
    return {
      bytes: optimizedBytes,
      mimeType: outputMimeType,
      extension: extensionForMimeType(outputMimeType, "webp"),
      originalBytes: originalBytes.byteLength,
      optimizedBytes: optimizedBytes.byteLength,
      originalWidth,
      originalHeight,
      width,
      height,
      status: "optimized",
      reason: usedFallback ? "webp-unavailable-fallback" : ""
    };
  } catch (error) {
    return { ...originalResult, status: "failed", reason: error?.message || "decode-failed" };
  } finally {
    bitmap?.close?.();
  }
}
