import {
  IMAGE_CREATOR_ASPECT_RATIOS,
  IMAGE_CREATOR_COUNT_OPTIONS,
  IMAGE_CREATOR_DOWNLOAD_FORMATS,
  IMAGE_CREATOR_IMAGE_SIZES,
  IMAGE_CREATOR_MODELS,
  IMAGE_CREATOR_MODES,
  modelSupportsImageSize,
  normalizeImageCreatorOptions
} from "./constants.js";

function fillSelect(select, items, mapOption) {
  if (!select) return;
  select.innerHTML = items.map((item) => {
    const option = mapOption(item);
    return `<option value="${option.value}">${option.label}</option>`;
  }).join("");
}

export function initializeOptionsPanel(elements, options = {}) {
  fillSelect(elements.modeSelect, IMAGE_CREATOR_MODES, (item) => ({ value: item.value, label: item.label }));
  fillSelect(elements.modelSelect, IMAGE_CREATOR_MODELS, (item) => ({ value: item, label: item }));
  fillSelect(elements.aspectRatioSelect, IMAGE_CREATOR_ASPECT_RATIOS, (item) => ({ value: item, label: item }));
  fillSelect(elements.imageSizeSelect, IMAGE_CREATOR_IMAGE_SIZES, (item) => ({ value: item, label: item }));
  fillSelect(elements.downloadFormatSelect, IMAGE_CREATOR_DOWNLOAD_FORMATS, (item) => ({ value: item, label: item.toUpperCase() }));
  fillSelect(elements.countSelect, IMAGE_CREATOR_COUNT_OPTIONS, (item) => ({ value: String(item), label: `${item}` }));
  applyOptionsToPanel(elements, options);
}

export function readOptionsFromPanel(elements) {
  return normalizeImageCreatorOptions({
    mode: elements.modeSelect?.value,
    model: elements.modelSelect?.value,
    aspectRatio: elements.aspectRatioSelect?.value,
    imageSize: elements.imageSizeSelect?.value,
    downloadFormat: elements.downloadFormatSelect?.value,
    count: Number(elements.countSelect?.value || 1)
  });
}

export function applyOptionsToPanel(elements, options = {}) {
  const normalized = normalizeImageCreatorOptions(options);
  if (elements.modeSelect) elements.modeSelect.value = normalized.mode;
  if (elements.modelSelect) elements.modelSelect.value = normalized.model;
  if (elements.aspectRatioSelect) elements.aspectRatioSelect.value = normalized.aspectRatio;
  if (elements.imageSizeSelect) elements.imageSizeSelect.value = normalized.imageSize;
  if (elements.downloadFormatSelect) elements.downloadFormatSelect.value = normalized.downloadFormat;
  if (elements.countSelect) elements.countSelect.value = String(normalized.count);
  syncOptionsPresentation(elements, normalized);
}

export function syncOptionsPresentation(elements, options = {}) {
  const normalized = normalizeImageCreatorOptions(options);
  const imageSizeEnabled = modelSupportsImageSize(normalized.model);
  if (elements.imageSizeSelect) elements.imageSizeSelect.disabled = !imageSizeEnabled;
  if (elements.optionsHint) {
    elements.optionsHint.textContent = imageSizeEnabled
      ? "Gemini 3.1 Flash Image y Gemini 3 Pro Image aceptan 1K, 2K y 4K. Para impresión usa 4K."
      : "Gemini 2.5 Flash Image usa tamaños fijos por aspect ratio; imageSize se ignora.";
  }
  return normalized;
}
