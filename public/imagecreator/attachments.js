import {
  MAX_ATTACHMENT_BYTES,
  MAX_GEMINI_PAYLOAD_BYTES,
  MAX_REFERENCE_ATTACHMENTS,
  TARGET_INLINE_IMAGE_BYTES,
  THUMBNAIL_MAX_DIMENSION
} from "./constants.js";

function makeId(prefix = "att") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function splitDataUrl(dataUrl = "") {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("data_url_invalid");
  return {
    mimeType: String(match[1] || "image/jpeg").trim() || "image/jpeg",
    base64: String(match[2] || "").trim()
  };
}

function estimateBase64Bytes(base64 = "") {
  const clean = String(base64 || "").trim();
  return Math.floor((clean.length * 3) / 4);
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("blob_base64_failed"));
    reader.readAsDataURL(blob);
  });
}

async function decodeImageDimensions(dataUrl = "") {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Number(image.naturalWidth || 0) || 0,
      height: Number(image.naturalHeight || 0) || 0
    });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

async function downscaleImageDataUrl(dataUrl = "", {
  mimeType = "image/jpeg",
  maxDimension = THUMBNAIL_MAX_DIMENSION,
  targetBytes = TARGET_INLINE_IMAGE_BYTES
} = {}) {
  const source = String(dataUrl || "").trim();
  if (!source) throw new Error("missing_data_url");

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      const width = Number(image.naturalWidth || image.width || 0) || 0;
      const height = Number(image.naturalHeight || image.height || 0) || 0;
      const ratio = width > 0 && height > 0 ? Math.min(1, maxDimension / Math.max(width, height)) : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas_unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      let quality = 0.86;
      let selected = "";
      let lastMime = mimeType;
      while (quality >= 0.42) {
        const candidateMime = mimeType === "image/png" ? "image/jpeg" : mimeType;
        const candidate = canvas.toDataURL(candidateMime, quality);
        const { base64 } = splitDataUrl(candidate);
        selected = candidate;
        lastMime = candidateMime;
        if (estimateBase64Bytes(base64) <= targetBytes) break;
        quality -= 0.12;
      }

      const dimensions = {
        width: Number(canvas.width || 0) || 0,
        height: Number(canvas.height || 0) || 0
      };
      resolve({
        dataUrl: selected,
        mimeType: lastMime,
        ...dimensions
      });
    };
    image.onerror = () => reject(new Error("image_decode_failed"));
    image.src = source;
  });
}

export function attachmentToInlineInput(attachment = {}) {
  return {
    id: String(attachment?.id || makeId()).trim(),
    name: String(attachment?.name || "referencia").trim() || "referencia",
    mimeType: String(attachment?.mimeType || "image/jpeg").trim() || "image/jpeg",
    base64: String(attachment?.base64 || "").trim(),
    inlineBase64: String(attachment?.inlineBase64 || attachment?.base64 || "").trim(),
    dataUrl: String(attachment?.dataUrl || "").trim(),
    originalDataUrl: String(attachment?.originalDataUrl || attachment?.dataUrl || "").trim(),
    width: Number(attachment?.width || 0) || 0,
    height: Number(attachment?.height || 0) || 0,
    sizeBytes: Number(attachment?.sizeBytes || 0) || 0,
    source: String(attachment?.source || "upload").trim() || "upload"
  };
}

function cloneAttachmentWithInlineBase64(attachment = {}, inlineBase64 = "", mimeType = "") {
  return attachmentToInlineInput({
    ...attachment,
    inlineBase64: String(inlineBase64 || "").trim(),
    mimeType: String(mimeType || attachment?.mimeType || "image/jpeg").trim() || "image/jpeg"
  });
}

export async function fileToAttachment(file, deps = {}) {
  if (!file) throw new Error("attachment_missing");
  if (Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
    throw new Error("attachment_too_large");
  }
  const readAsDataUrl = deps.readAsDataUrl || readBlobAsDataUrl;
  const sourceDataUrl = await readAsDataUrl(file);
  const sourceSplit = splitDataUrl(sourceDataUrl);
  const compact = await downscaleImageDataUrl(sourceDataUrl, {
    mimeType: String(file.type || "image/jpeg").trim() || "image/jpeg"
  });
  const { base64 } = splitDataUrl(compact.dataUrl);
  const sourceDimensions = await decodeImageDimensions(sourceDataUrl);
  return attachmentToInlineInput({
    id: makeId(),
    name: String(file.name || "referencia").trim() || "referencia",
    mimeType: sourceSplit.mimeType,
    base64: sourceSplit.base64,
    inlineBase64: base64,
    dataUrl: sourceDataUrl,
    originalDataUrl: sourceDataUrl,
    width: sourceDimensions.width,
    height: sourceDimensions.height,
    sizeBytes: estimateBase64Bytes(sourceSplit.base64),
    source: "upload"
  });
}

export async function filesToAttachments(fileList = [], deps = {}) {
  const files = Array.from(fileList || []).slice(0, MAX_REFERENCE_ATTACHMENTS);
  const attachments = [];
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    attachments.push(await fileToAttachment(file, deps));
  }
  return attachments;
}

export function estimateInlinePayloadBytes(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).reduce((total, attachment) => (
    total + estimateBase64Bytes(String(attachment?.inlineBase64 || attachment?.base64 || "").trim())
  ), 0);
}

export async function prepareAttachmentsForGemini(attachments = [], {
  maxPayloadBytes = MAX_GEMINI_PAYLOAD_BYTES,
  reservedPromptBytes = 20 * 1024
} = {}) {
  const input = (Array.isArray(attachments) ? attachments : []).map((attachment) => attachmentToInlineInput(attachment));
  if (!input.length) return input;

  const maxInlineBytes = Math.max(12 * 1024, maxPayloadBytes - reservedPromptBytes);
  let prepared = input.map((attachment) => cloneAttachmentWithInlineBase64(
    attachment,
    attachment.inlineBase64 || attachment.base64,
    attachment.mimeType
  ));

  if (estimateInlinePayloadBytes(prepared) <= maxInlineBytes) {
    return prepared;
  }

  const passes = [
    { maxDimension: 768, targetBytes: Math.max(12 * 1024, Math.floor(maxInlineBytes / input.length)) },
    { maxDimension: 640, targetBytes: Math.max(10 * 1024, Math.floor((maxInlineBytes * 0.82) / input.length)) },
    { maxDimension: 512, targetBytes: Math.max(8 * 1024, Math.floor((maxInlineBytes * 0.68) / input.length)) },
    { maxDimension: 448, targetBytes: Math.max(6 * 1024, Math.floor((maxInlineBytes * 0.54) / input.length)) }
  ];

  for (const pass of passes) {
    const nextPrepared = [];
    for (const attachment of input) {
      const sourceDataUrl = String(attachment?.originalDataUrl || attachment?.dataUrl || "").trim();
      if (!sourceDataUrl) {
        nextPrepared.push(attachment);
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const compact = await downscaleImageDataUrl(sourceDataUrl, {
        mimeType: String(attachment?.mimeType || "image/jpeg").trim() || "image/jpeg",
        maxDimension: pass.maxDimension,
        targetBytes: pass.targetBytes
      });
      const { base64 } = splitDataUrl(compact.dataUrl);
      nextPrepared.push(cloneAttachmentWithInlineBase64(attachment, base64, compact.mimeType));
    }
    prepared = nextPrepared;
    if (estimateInlinePayloadBytes(prepared) <= maxInlineBytes) {
      return prepared;
    }
  }

  return prepared;
}

export async function resultImageToAttachment(result = {}) {
  const dataUrl = String(result?.dataUrl || "").trim();
  if (!dataUrl) throw new Error("result_data_url_missing");
  const sourceSplit = splitDataUrl(dataUrl);
  const compact = await downscaleImageDataUrl(dataUrl, {
    mimeType: String(result?.mimeType || "image/jpeg").trim() || "image/jpeg"
  });
  const { base64 } = splitDataUrl(compact.dataUrl);
  return attachmentToInlineInput({
    id: makeId("var"),
    name: String(result?.fileName || "variacion").trim() || "variacion",
    mimeType: sourceSplit.mimeType,
    base64: sourceSplit.base64,
    inlineBase64: base64,
    dataUrl,
    originalDataUrl: dataUrl,
    width: Number(result?.width || 0) || compact.width,
    height: Number(result?.height || 0) || compact.height,
    sizeBytes: estimateBase64Bytes(sourceSplit.base64),
    source: "generated"
  });
}

export async function shrinkImageResultForSession(result = {}) {
  const sourceDataUrl = String(result?.dataUrl || "").trim();
  if (!sourceDataUrl) return result;
  const compact = await downscaleImageDataUrl(sourceDataUrl, {
    mimeType: String(result?.mimeType || "image/jpeg").trim() || "image/jpeg",
    maxDimension: 896,
    targetBytes: 110 * 1024
  });
  return {
    ...result,
    persistedDataUrl: compact.dataUrl,
    persistedMimeType: compact.mimeType,
    persistedWidth: compact.width,
    persistedHeight: compact.height,
    persistedSizeBytes: estimateBase64Bytes(splitDataUrl(compact.dataUrl).base64)
  };
}

export async function enrichAttachmentDimensions(attachment = {}) {
  const current = attachmentToInlineInput(attachment);
  if (current.width && current.height) return current;
  const dimensions = await decodeImageDimensions(current.dataUrl);
  return {
    ...current,
    ...dimensions
  };
}

export function buildDownloadFileName({ title = "image-creator", index = 1, extension = "png" } = {}) {
  const safeTitle = String(title || "image-creator")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "image-creator";
  return `${safeTitle}-${String(index).padStart(2, "0")}.${String(extension || "png").replace(/^\./, "")}`;
}
