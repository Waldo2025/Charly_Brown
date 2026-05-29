import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../public/podcaster/podcaster-overlay-cards.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../public/podcaster/podcaster-overlay-card-studio.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const studioCss = readFileSync(new URL("../public/podcaster/podcaster-overlay-card-studio.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const timelineModel = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!entry.includes('./podcaster-overlay-card-studio.js')) {
  throw new Error("El entrypoint de overlay cards debe delegar al archivo dedicado del estudio.");
}

if (!html.includes('podcaster/podcaster-overlay-card-studio.css')) {
  throw new Error("Falta cargar el CSS dedicado del estudio de cards en podcaster.html.");
}

for (const token of [
  'data-card-tab="content"',
  'data-card-tab="models"',
  'data-card-tab="animation"',
  "podcast-overlay-card-preview",
  "podcast-overlay-card-style-grid",
  "podcast-overlay-card-animation-presets",
  'data-field="exitDelayMs"'
]) {
  if (!source.includes(token)) {
    throw new Error(`Falta ${token} en el nuevo editor de cards.`);
  }
}

for (const token of [
  "isReelModeEnabled",
  "REEL_ASPECT_RATIO_CSS",
  "NORMAL_ASPECT_RATIO_CSS",
  "setOverlayCardEditorPreviewAspect",
  "applyOverlayCardPreviewDraftPosition",
  "loadCardIntoEditor",
  "resolveOverlayCardEditorStyleModel",
  "syncOverlayCardEditorPreviewScale",
  "attachOverlayCardStageDrag"
]) {
  if (!source.includes(token)) {
    throw new Error(`Falta la integración ${token} para el preview del modal o el drag estable.`);
  }
}

for (const token of [
  "studio-ribbon",
  "soft-panel",
  "signal-cta"
]) {
  if (!source.includes(token)) {
    throw new Error(`Falta el modelo visual ${token}.`);
  }
}

for (const token of [
  "broadcast-soft",
  "gentle-fade",
  "dynamic-cta"
]) {
  if (!source.includes(token)) {
    throw new Error(`Falta el preset de animación ${token}.`);
  }
}

if (!/data-style-model=/.test(source) || !/podcast-overlay-card-copy/.test(source)) {
  throw new Error("Las cards deben renderizar layout visual enriquecido con style model.");
}

for (const token of [
  'data-line1="${escapeHtml(textLines[0] || "")}"',
  'data-line2="${escapeHtml(textLines[1] || "")}"',
  'data-line3="${escapeHtml(textLines[2] || "")}"'
]) {
  if (!source.includes(token)) {
    throw new Error(`Falta exponer ${token} para estilos avanzados dependientes del contenido.`);
  }
}

for (const token of [
  'data-action="overlay-card-edit"',
  "editingCardId",
  "loadCardIntoEditor(card",
  "overlayCardEditorState.styleModel",
  "overlayCardEditorState.animationPreset",
  'class="podcast-overlay-card-list-item"',
  'data-action="overlay-card-edit" data-card-id="${escapeHtml(card.id)}"'
]) {
  if (!source.includes(token)) {
    throw new Error(`Falta el flujo de edición ${token} para las cards existentes.`);
  }
}

const pointerMoveSection = source.split('panel.addEventListener("pointermove"')[1]?.split('panel.addEventListener("pointerup"')[0] || "";
if (!pointerMoveSection.includes("applyOverlayCardPreviewDraftPosition(panel);")) {
  throw new Error("El drag del preview debe aplicar la nueva posición sin rerender completo en pointermove.");
}

if (pointerMoveSection.includes("renderOverlayCardEditorPreview(panel);")) {
  throw new Error("El drag del preview no debe rerenderizar la card completa en cada pointermove.");
}

for (const token of [
  ".podcast-overlay-card-modal-shell",
  ".podcast-overlay-card-sidebar",
  ".podcast-overlay-card-style-option",
  ".podcast-overlay-card-preview-stage",
  ".podcast-overlay-card-layer.is-interactive",
  ".podcast-overlay-card[data-style-model=\"studio-ribbon\"]",
  ".podcast-overlay-card[data-style-model=\"soft-panel\"]",
  ".podcast-overlay-card[data-style-model=\"signal-cta\"]"
]) {
  if (!css.includes(token)) {
    throw new Error(`Falta el estilo ${token} en podcaster.css.`);
  }
}

for (const token of [
  "--pod-editor-preview-aspect",
  "aspect-ratio: var(--pod-editor-preview-aspect, 16 / 9)"
]) {
  if (!css.includes(token)) {
    throw new Error(`Falta el control de aspect ratio ${token} en podcaster.css.`);
  }
}

for (const token of [
  ".podcast-overlay-card-style-thumb.is-mirror-title",
  ".podcast-overlay-card-style-thumb.is-funky-stack",
  ".podcast-overlay-card-style-thumb.is-modern-tag",
  ".podcast-overlay-card[data-style-model=\"modern-tag\"]",
  ".podcast-overlay-card[data-style-model=\"circular-title\"]",
  ".podcast-overlay-card[data-style-model=\"molon-title\"]",
  ".podcast-overlay-card[data-style-model=\"fireworks-title\"]",
  ".podcast-overlay-card[data-style-model=\"smoke-title\"]",
  ".podcast-overlay-card[data-style-model=\"quote-card\"]",
  ".podcast-overlay-card[data-style-model=\"rating-card\"]",
  ".podcast-overlay-card[data-style-model=\"credits-card\"]",
  ".podcast-overlay-card[data-style-model=\"intro-funky\"]",
  ".podcast-overlay-card[data-style-model=\"outro-dive-dark\"]"
]) {
if (!studioCss.includes(token)) {
    throw new Error(`Falta el override dedicado ${token} en podcaster-overlay-card-studio.css.`);
  }
}

const definedModels = [...source.matchAll(/"([a-z0-9-]+)":\s*\{\n\s*label:/g)].map((match) => match[1]);
const groupedModels = [...source.matchAll(/models: \[([^\]]+)\]/g)].flatMap((match) => {
  return [...match[1].matchAll(/"([a-z0-9-]+)"/g)].map((item) => item[1]);
});
const ignoredModels = new Set(["lower-third", "info-panel", "phone-cta", "broadcast-soft", "gentle-fade", "dynamic-cta"]);
const styleModelSet = new Set(definedModels.filter((model) => !ignoredModels.has(model)));
const undefinedGalleryModels = [...new Set(groupedModels.filter((model) => !styleModelSet.has(model)))];
if (undefinedGalleryModels.length) {
  throw new Error(`Hay modelos en la galería sin definición en CARD_STYLE_MODELS: ${undefinedGalleryModels.join(", ")}`);
}

if (!/\.podcast-overlay-card-layer\.is-interactive\s*\{[^}]*pointer-events:\s*auto;/.test(css)) {
  throw new Error("La capa interactiva de cards debe permitir pointer events para editar o eliminar.");
}

for (const token of [
  "styleModel:",
  "animationPreset:",
  "fontScale:",
  "loopAnimation:",
  "exitDelayMs"
]) {
  if (!timelineModel.includes(token)) {
    throw new Error(`El normalizador de timeline debe preservar ${token} en las cards.`);
  }
}

for (const token of [
  "exitDelayMs",
  "exitStartSec",
  "exitDurSec"
]) {
  if (!server.includes(token)) {
    throw new Error(`Falta la integración de export ${token} para animación de salida configurable.`);
  }
}

if (!source.includes("styleModel || \"\"") || !source.includes("JSON.stringify(item.card.position || {})")) {
  throw new Error("La firma de render del montage debe incluir estilo y posición para refrescar cards editadas.");
}

console.log("Podcaster overlay card studio editor OK.");
