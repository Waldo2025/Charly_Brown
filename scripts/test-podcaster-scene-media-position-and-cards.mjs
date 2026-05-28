import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const home = readFileSync(new URL("../public/home.html", import.meta.url), "utf8");
const podcaster = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");
const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");

const mediaPositionPath = new URL("../public/podcaster/podcaster-scene-media-position.js", import.meta.url);
const overlayCardsPath = new URL("../public/podcaster/podcaster-overlay-cards.js", import.meta.url);

assert.equal(existsSync(mediaPositionPath), true, "Debe existir el módulo independiente podcaster-scene-media-position.js.");
assert.equal(existsSync(overlayCardsPath), true, "Debe existir el módulo independiente podcaster-overlay-cards.js.");

const mediaPosition = existsSync(mediaPositionPath) ? readFileSync(mediaPositionPath, "utf8") : "";
const overlayCards = existsSync(overlayCardsPath) ? readFileSync(overlayCardsPath, "utf8") : "";

assert.match(html, /podcaster\/podcaster-scene-media-position\.js\?v=/, "podcaster.html debe cargar el módulo de posicionamiento de medio.");
assert.match(html, /podcaster\/podcaster-overlay-cards\.js\?v=/, "podcaster.html debe cargar el módulo de overlay cards.");
assert.match(home, /podcaster\/podcaster-overlay-cards\.js\?v=/, "home.html debe cargar el módulo de overlay cards para el reproductor.");

assert.match(
  timeline,
  /mediaOffsetXPct:\s*normalizeTimelineClipMediaOffset\(raw\?\.mediaOffsetXPct\)/,
  "Los clips del timeline deben normalizar mediaOffsetXPct."
);
assert.match(
  timeline,
  /mediaOffsetYPct:\s*normalizeTimelineClipMediaOffset\(raw\?\.mediaOffsetYPct\)/,
  "Los clips del timeline deben normalizar mediaOffsetYPct."
);
assert.match(
  timeline,
  /mediaMotionPreset:\s*normalizeTimelineClipMediaMotionPreset\(raw\?\.mediaMotionPreset\)/,
  "Los clips del timeline deben normalizar mediaMotionPreset."
);
assert.match(
  timeline,
  /normalizeOverlayCardsById/,
  "El modelo debe exponer normalización de overlay cards separada de on-screen text."
);

assert.match(
  podcaster,
  /--pod-scene-media-x/,
  "applySceneMediaScaleToStage debe aplicar la variable CSS horizontal."
);
assert.match(
  podcaster,
  /--pod-scene-media-y/,
  "applySceneMediaScaleToStage debe aplicar la variable CSS vertical."
);
assert.match(
  podcaster,
  /--pod-scene-media-motion-preset/,
  "applySceneMediaScaleToStage debe aplicar el preset de movimiento."
);

assert.match(css, /podcast-scene-position-controls/, "Debe existir CSS para controles hover de posición.");
assert.match(css, /podcast-overlay-card-layer/, "Debe existir CSS para la capa de cards.");
assert.match(css, /pod-scene-media-pan-left-right/, "Debe existir animación CSS pan-left-right.");

assert.match(mediaPosition, /initPodcasterSceneMediaPositionControls/, "El módulo de posición debe exportar/inicializar controles.");
assert.match(
  mediaPosition,
  /if \(!session \|\| !rowId\) return \{ session, rowId, clip: null \};/,
  "El módulo de posición no debe llamar ensureTimelineClipsByRowId cuando aún no hay sesión activa."
);
assert.match(mediaPosition, /data-action="scene-media-position-x"/, "Debe renderizar un slider horizontal.");
assert.match(mediaPosition, /data-action="scene-media-position-y"/, "Debe renderizar un slider vertical.");
assert.match(mediaPosition, /updateTimelineClipForRow/, "El cambio de sliders debe persistir en el clip activo.");
assert.match(mediaPosition, /persistReorderedTimelinePatchToCloud/, "El cambio de sliders debe persistir a cloud.");

assert.match(overlayCards, /initPodcasterOverlayCardsEditor/, "El módulo de cards debe exportar/inicializar el editor.");
assert.match(overlayCards, /lower-third/, "Debe incluir plantilla lower third.");
assert.match(overlayCards, /info-panel/, "Debe incluir plantilla info panel.");
assert.match(overlayCards, /phone-cta/, "Debe incluir plantilla teléfono/CTA.");
assert.match(overlayCards, /getElementById\("podcastVideoLibraryCollapsedHandle"\)/, "El botón de cards debe colocarse debajo del handle colapsado de librería.");
assert.match(overlayCards, /insertAdjacentHTML\("afterend", `<button class="podcast-overlay-card-add-btn"/, "El botón de cards debe insertarse como hermano debajo del handle.");
assert.match(overlayCards, /role", "dialog"/, "El editor de cards debe abrirse como modal.");
assert.match(overlayCards, /applyEditorPresetFields/, "El formulario de cards debe cambiar según la plantilla.");
assert.match(overlayCards, /document\.body\.appendChild\(host\)/, "El modal de cards debe montarse en body.");
assert.match(overlayCards, /renderPodcasterOverlayCardsForPreview/, "Debe renderizar cards en el preview.");
assert.match(overlayCards, /timelineOverlayCardsById/, "Debe guardar cards dentro de podcastVideoConfig.");
assert.match(overlayCards, /layer\.dataset\.cardsSignature === signature/, "El render no debe recrear la misma card en loop.");
assert.match(overlayCards, /CARD_EXIT_WINDOW_MS/, "Debe existir ventana de animación de salida antes de terminar.");
assert.match(overlayCards, /overlay-card-delete/, "Debe existir acción para eliminar cards.");
assert.match(playback, /syncOverlayCards/, "El playback compartido debe sincronizar cards en editor y home.");
assert.match(playback, /syncStageMediaMotionPlaybackState/, "El playback debe pausar/reanudar animaciones de movimiento de escena.");
assert.match(css, /data-scene-media-motion-playing="true"/, "El CSS solo debe correr motion preset cuando el playback esté activo.");
assert.match(css, /animation-play-state:\s*paused/, "El motion preset debe quedar pausado por defecto.");

assert.match(exportSource, /mediaOffsetXPct:\s*entry\?\.clip\?\.mediaOffsetXPct/, "El payload de export debe incluir mediaOffsetXPct.");
assert.match(exportSource, /mediaOffsetYPct:\s*entry\?\.clip\?\.mediaOffsetYPct/, "El payload de export debe incluir mediaOffsetYPct.");
assert.match(exportSource, /mediaMotionPreset:\s*entry\?\.clip\?\.mediaMotionPreset/, "El payload de export debe incluir mediaMotionPreset.");
assert.match(exportSource, /overlayCards:\s*window\.buildMontageOverlayCardSegments/, "El payload de export debe incluir overlay cards normalizadas.");

assert.match(backend, /function normalizeMontageMediaOffset/, "Backend debe sanitizar offsets de medio.");
assert.match(backend, /function normalizeMontageMediaMotionPreset/, "Backend debe sanitizar presets de movimiento.");
assert.match(backend, /function normalizeMontageOverlayCards/, "Backend debe sanitizar overlay cards.");
assert.match(backend, /buildMontageMediaPositionFilter/, "Backend debe aplicar offsets y motion presets al video.");
assert.match(backend, /renderMontageOverlayCards/, "Backend debe renderizar cards animadas sobre el montaje final.");
assert.match(backend, /enterAnimation = String\(card\.enterAnimation/, "Backend debe aplicar animación de entrada de cards.");
assert.match(backend, /exitAnimation = String\(card\.exitAnimation/, "Backend debe aplicar animación de salida de cards.");

console.log("Podcaster scene media position and overlay cards OK.");
