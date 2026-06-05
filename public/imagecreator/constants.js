export const IMAGE_CREATOR_SESSION_COLLECTION = "image_creator_sessions";
export const IMAGE_CREATOR_SESSION_TITLE = "Nueva sesión";
export const MAX_REFERENCE_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const TARGET_INLINE_IMAGE_BYTES = 24 * 1024;
export const MAX_GEMINI_PAYLOAD_BYTES = 96 * 1024;
export const MAX_HISTORY_MESSAGES = 30;
export const MAX_RESULTS_PER_TURN = 4;
export const THUMBNAIL_MAX_DIMENSION = 896;

export const IMAGE_CREATOR_MODELS = Object.freeze([
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image-preview"
]);

export const IMAGE_CREATOR_MODES = Object.freeze([
  { value: "generate", label: "Texto a imagen" },
  { value: "edit", label: "Editar referencia" },
  { value: "compose", label: "Componer referencias" },
  { value: "variation", label: "Variación" }
]);

export const IMAGE_CREATOR_ASPECT_RATIOS = Object.freeze([
  "1:1",
  "4:5",
  "3:4",
  "16:9",
  "9:16"
]);

export const IMAGE_CREATOR_IMAGE_SIZES = Object.freeze([
  "1K",
  "2K",
  "4K"
]);

export const IMAGE_CREATOR_DOWNLOAD_FORMATS = Object.freeze([
  "png",
  "jpeg",
  "webp"
]);

export const IMAGE_CREATOR_COUNT_OPTIONS = Object.freeze([1, 2, 3, 4]);

export function modelSupportsImageSize(model = "") {
  const normalized = String(model || "").trim().toLowerCase();
  return normalized === "gemini-3.1-flash-image" || normalized === "gemini-3-pro-image-preview";
}

export function createDefaultImageCreatorOptions() {
  return {
    mode: "generate",
    model: IMAGE_CREATOR_MODELS[1],
    aspectRatio: "1:1",
    imageSize: "2K",
    downloadFormat: "png",
    count: 1
  };
}

export function normalizeImageCreatorOptions(options = {}) {
  const defaults = createDefaultImageCreatorOptions();
  const count = Number(options.count);
  const nextModel = IMAGE_CREATOR_MODELS.includes(options.model) ? options.model : defaults.model;
  return {
    mode: IMAGE_CREATOR_MODES.some((item) => item.value === options.mode) ? options.mode : defaults.mode,
    model: nextModel,
    aspectRatio: IMAGE_CREATOR_ASPECT_RATIOS.includes(options.aspectRatio) ? options.aspectRatio : defaults.aspectRatio,
    imageSize: IMAGE_CREATOR_IMAGE_SIZES.includes(options.imageSize) ? options.imageSize : defaults.imageSize,
    downloadFormat: IMAGE_CREATOR_DOWNLOAD_FORMATS.includes(options.downloadFormat) ? options.downloadFormat : defaults.downloadFormat,
    count: IMAGE_CREATOR_COUNT_OPTIONS.includes(count) ? count : defaults.count
  };
}
