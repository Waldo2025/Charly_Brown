import {
  modelSupportsImageSize,
  normalizeImageCreatorOptions
} from "./constants.js";

export function initializeOptionsPanel(elements, options = {}, onChange = null) {
  elements.floatingModeButtons = Array.from(document.querySelectorAll("#icMjModeGroup [data-mode]"));
  elements.floatingRatioButtons = Array.from(document.querySelectorAll("#icMjRatioGrid [data-ratio]"));
  elements.floatingSizeButtons = Array.from(document.querySelectorAll("#icMjImageSizeGroup [data-size]"));
  elements.floatingFormatButtons = Array.from(document.querySelectorAll("#icMjFormatGroup [data-format]"));
  elements.floatingCountButtons = Array.from(document.querySelectorAll("#icMjCountGroup [data-count]"));
  elements.floatingPersonButtons = Array.from(document.querySelectorAll("#icMjPersonGroup [data-person]"));
  elements.floatingModelButtons = Array.from(document.querySelectorAll("#icMjModelGroup [data-model]"));

  const bindGroup = (buttons) => {
    (buttons || []).forEach((button) => {
      button.addEventListener("click", () => {
        (buttons || []).forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-checked", "false");
        });
        button.classList.add("active");
        button.setAttribute("aria-checked", "true");

        if (typeof onChange === "function") {
          const current = readOptionsFromPanel(elements);
          onChange(current);
        }
      });
    });
  };

  bindGroup(elements.floatingModeButtons);
  bindGroup(elements.floatingRatioButtons);
  bindGroup(elements.floatingSizeButtons);
  bindGroup(elements.floatingFormatButtons);
  bindGroup(elements.floatingCountButtons);
  bindGroup(elements.floatingPersonButtons);
  bindGroup(elements.floatingModelButtons);

  applyOptionsToPanel(elements, options);
}

export function readOptionsFromPanel(elements) {
  const getActiveAttr = (buttons, attr) => {
    const active = (buttons || []).find((b) => b.classList.contains("active"));
    return active ? active.getAttribute(attr) : undefined;
  };

  return normalizeImageCreatorOptions({
    mode: getActiveAttr(elements.floatingModeButtons, "data-mode"),
    aspectRatio: getActiveAttr(elements.floatingRatioButtons, "data-ratio"),
    imageSize: getActiveAttr(elements.floatingSizeButtons, "data-size"),
    downloadFormat: getActiveAttr(elements.floatingFormatButtons, "data-format"),
    count: Number(getActiveAttr(elements.floatingCountButtons, "data-count") || 1),
    personGeneration: getActiveAttr(elements.floatingPersonButtons, "data-person"),
    model: getActiveAttr(elements.floatingModelButtons, "data-model")
  });
}

export function applyOptionsToPanel(elements, options = {}) {
  const normalized = normalizeImageCreatorOptions(options);

  const syncButtons = (buttons, attr, targetVal) => {
    (buttons || []).forEach((button) => {
      const match = button.getAttribute(attr) === String(targetVal);
      button.classList.toggle("active", match);
      button.setAttribute("aria-checked", match ? "true" : "false");
    });
  };

  syncButtons(elements.floatingModeButtons, "data-mode", normalized.mode);
  syncButtons(elements.floatingRatioButtons, "data-ratio", normalized.aspectRatio);
  syncButtons(elements.floatingSizeButtons, "data-size", normalized.imageSize);
  syncButtons(elements.floatingFormatButtons, "data-format", normalized.downloadFormat);
  syncButtons(elements.floatingCountButtons, "data-count", normalized.count);
  syncButtons(elements.floatingPersonButtons, "data-person", normalized.personGeneration);
  syncButtons(elements.floatingModelButtons, "data-model", normalized.model);

  const imageSizeEnabled = modelSupportsImageSize(normalized.model);
  (elements.floatingSizeButtons || []).forEach((b) => {
    b.disabled = !imageSizeEnabled;
    b.style.opacity = imageSizeEnabled ? "1" : "0.35";
  });

  return normalized;
}

export function syncOptionsPresentation(elements, options = {}) {
  return applyOptionsToPanel(elements, options);
}

export const initializeFloatingFormatPanel = initializeOptionsPanel;
export const readFloatingFormatOptions = readOptionsFromPanel;
export const syncFloatingFormatPanel = applyOptionsToPanel;
