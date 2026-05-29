import { isReelModeEnabled, REEL_ASPECT_RATIO_CSS, NORMAL_ASPECT_RATIO_CSS } from "./podcaster-reels.js";

const CARD_PRESETS = {
  "lower-third": {
    label: "Nombre",
    textLines: ["Nombre de la persona", "Cargo o contexto"],
    position: { xPct: 0.06, yPct: 0.66, widthPct: 0.56, heightPct: 0.2 },
    enterAnimation: "slide-left",
    styleModel: "lower-third-slab",
    fields: [
      { key: "line1", label: "Nombre", value: "Nombre de la persona", placeholder: "Nombre o título" },
      { key: "line2", label: "Cargo", value: "Cargo o contexto", placeholder: "Cargo, rol o contexto" }
    ]
  },
  "info-panel": {
    label: "Info",
    textLines: ["Dato importante", "Detalle breve para pantalla"],
    position: { xPct: 0.46, yPct: 0.14, widthPct: 0.46, heightPct: 0.3 },
    enterAnimation: "slide-right",
    styleModel: "stacked-blocks",
    fields: [
      { key: "line1", label: "Título", value: "Dato importante", placeholder: "Título de la tarjeta" },
      { key: "line2", label: "Detalle", value: "Detalle breve para pantalla", placeholder: "Detalle principal" },
      { key: "line3", label: "Nota", value: "", placeholder: "Nota opcional" }
    ]
  },
  "phone-cta": {
    label: "Teléfono",
    textLines: ["Llámanos", "+52 000 000 0000"],
    position: { xPct: 0.44, yPct: 0.7, widthPct: 0.48, heightPct: 0.18 },
    enterAnimation: "slide-up",
    styleModel: "signal-cta",
    fields: [
      { key: "line1", label: "Llamado", value: "Llámanos", placeholder: "Texto de llamado" },
      { key: "line2", label: "Teléfono", value: "+52 000 000 0000", placeholder: "Teléfono o URL" }
    ]
  }
};

const CARD_STYLE_MODELS = {
  "studio-ribbon": {
    label: "Studio Ribbon",
    description: "Broadcast premium con cinta curva y badge editorial.",
    badge: "Lower Third",
    icon: "fas fa-wave-square",
    family: "ocs-panel",
    sample: ["Título", "Secundario"]
  },
  "soft-panel": {
    label: "Soft Panel",
    description: "Panel curvo, amable y moderno para datos e información.",
    badge: "Info",
    icon: "far fa-square",
    family: "ocs-panel",
    sample: ["Dato", "Detalle"]
  },
  "signal-cta": {
    label: "Signal CTA",
    description: "Llamado compacto con señal visual y acento de acción.",
    badge: "CTA",
    icon: "fas fa-bullhorn",
    family: "ocs-pill",
    sample: ["Llámanos", "+52 000"]
  },
  "line-title": {
    label: "Línea · Texto · Línea",
    description: "Título limpio sin fondo con líneas editorial arriba y abajo.",
    badge: "Texto",
    icon: "fas fa-grip-lines",
    family: "ocs-text-lines",
    sample: ["Líneas", "Dobles"]
  },
  "framed-title": {
    label: "Marco nítido",
    description: "Texto central con marco fino para enfatizar un titular corto.",
    badge: "Focus",
    icon: "far fa-square-full",
    family: "ocs-frame",
    sample: ["Nítido", "Título"]
  },
  "clean-serif": {
    label: "Serif limpio",
    description: "Composición elegante sin fondo, ideal para títulos sobrios.",
    badge: "Serif",
    icon: "fas fa-font",
    family: "ocs-text-only",
    sample: ["Marea", ""]
  },
  "glitch-fail": {
    label: "Fallo",
    description: "Título con desalineación sutil y sombra de error editorial.",
    badge: "Fail",
    icon: "fas fa-bolt",
    family: "ocs-glitch",
    sample: ["Fallo", ""],
    loopAnimation: "jitter-soft"
  },
  "split-highlight": {
    label: "Rebote",
    description: "Dos líneas con énfasis cromático en el remate.",
    badge: "Dúo",
    icon: "fas fa-text-height",
    family: "ocs-split-highlight",
    sample: ["Rebotar", "Título"]
  },
  "stacked-blocks": {
    label: "Bloques apilados",
    description: "Textos en bloques separados, compacto y muy legible.",
    badge: "Stack",
    icon: "fas fa-layer-group",
    family: "ocs-stacked",
    sample: ["Título", "Multilínea"]
  },
  "lower-third-slab": {
    label: "Tercio inferior",
    description: "Lower third rectangular con base y subtítulo pequeño.",
    badge: "Lower Third",
    icon: "fas fa-align-left",
    family: "ocs-lower-third",
    sample: ["Tercio inferior", "Dividir"]
  },
  "glow-title": {
    label: "Haz que brille",
    description: "Texto brillante sin caja para remates más expresivos.",
    badge: "Glow",
    icon: "far fa-lightbulb",
    family: "ocs-glow",
    sample: ["Haz que", "brille"],
    loopAnimation: "glow"
  },
  "plain-text": {
    label: "Texto",
    description: "Texto sin formato.",
    badge: "Texto",
    icon: "fas fa-font",
    family: "ocs-text-only",
    sample: ["Text", ""],
    loopAnimation: "type"
  },
  "text-box": {
    label: "Text box",
    description: "Caja simple de texto.",
    badge: "Box",
    icon: "far fa-square",
    family: "ocs-boxed",
    sample: ["Text box", ""],
    loopAnimation: "breathe"
  },
  "pride-text": {
    label: "Pride",
    description: "Título con capas de color.",
    badge: "Pride",
    icon: "fas fa-rainbow",
    family: "ocs-pride",
    sample: ["Pride", ""],
    loopAnimation: "float"
  },
  "button-pill": {
    label: "Button",
    description: "Botón cápsula suave.",
    badge: "Button",
    icon: "far fa-circle",
    family: "ocs-button-pill",
    sample: ["Button", ""],
    loopAnimation: "breathe"
  },
  "bubble-text": {
    label: "Bubble",
    description: "Texto con volumen pop.",
    badge: "Bubble",
    icon: "fas fa-comment",
    family: "ocs-bubble",
    sample: ["Bubble", ""],
    loopAnimation: "bounce-soft"
  },
  "retro-stripes": {
    label: "Retro",
    description: "Título retro con franjas.",
    badge: "Retro",
    icon: "fas fa-record-vinyl",
    family: "ocs-retro",
    sample: ["RETRO", ""],
    loopAnimation: "float"
  },
  "typewriter-title": {
    label: "Máquina",
    description: "Aparición tipo máquina de escribir.",
    badge: "Type",
    icon: "fas fa-keyboard",
    family: "ocs-text-only",
    sample: ["Máquina", ""],
    loopAnimation: "type"
  },
  "circular-title": {
    label: "Circular",
    description: "Título con disco de color.",
    badge: "Circle",
    icon: "far fa-dot-circle",
    family: "ocs-circle",
    sample: ["Circular", ""],
    loopAnimation: "pulse-ring"
  },
  "molon-title": {
    label: "Molón",
    description: "Sombra offset rojo editorial.",
    badge: "Offset",
    icon: "fas fa-bold",
    family: "ocs-offset-shadow",
    sample: ["MOLÓN", ""],
    loopAnimation: "jitter-soft"
  },
  "fireworks-title": {
    label: "Fuegos artificiales",
    description: "Acentos orbitales alrededor del texto.",
    badge: "Spark",
    icon: "fas fa-bahai",
    family: "ocs-fireworks",
    sample: ["Fuegos artificiales", ""],
    loopAnimation: "orbit"
  },
  "smoke-title": {
    label: "Humo",
    description: "Texto ahumado y difuso.",
    badge: "Smoke",
    icon: "fas fa-smog",
    family: "ocs-smoke",
    sample: ["Humo", ""],
    loopAnimation: "smoke"
  },
  "fade-title": {
    label: "Fundido",
    description: "Título limpio con respiración de opacidad.",
    badge: "Fade",
    icon: "fas fa-adjust",
    family: "ocs-text-only",
    sample: ["Fundido", ""],
    loopAnimation: "fade-loop"
  },
  "push-back": {
    label: "Empujar atrás",
    description: "Placa de color con desplazamiento.",
    badge: "Push",
    icon: "fas fa-arrows-alt-h",
    family: "ocs-solid-stage",
    sample: ["PUJAR A TRAY", ""],
    loopAnimation: "slide-x"
  },
  "big-title": {
    label: "Título grande",
    description: "Titular amplio sin fondo.",
    badge: "Big",
    icon: "fas fa-text-height",
    family: "ocs-text-only",
    sample: ["Título", "grande"],
    loopAnimation: "breathe"
  },
  "outline-shadow": {
    label: "Sombra de contorno",
    description: "Texto con borde y glow suave.",
    badge: "Outline",
    icon: "far fa-clone",
    family: "ocs-outline",
    sample: ["Sombra", "de contorno"],
    loopAnimation: "glow"
  },
  "quick-glance": {
    label: "Vistazo rápido",
    description: "Tarjeta corta de lectura inmediata.",
    badge: "Quick",
    icon: "far fa-eye",
    family: "ocs-solid-stage",
    sample: ["Vistazo rápido", ""],
    loopAnimation: "breathe"
  },
  "template-solid": {
    label: "Plantilla",
    description: "Lámina sólida editorial.",
    badge: "Template",
    icon: "fas fa-square-full",
    family: "ocs-solid-stage",
    sample: ["Plantilla", ""],
    loopAnimation: "breathe"
  },
  "statement-underline": {
    label: "Declaración",
    description: "Título con acento inferior.",
    badge: "Statement",
    icon: "fas fa-minus",
    family: "ocs-underline",
    sample: ["Declaración", ""],
    loopAnimation: "underline-sweep"
  },
  "mirror-title": {
    label: "Espejo",
    description: "Dos líneas con barra espejo.",
    badge: "Mirror",
    icon: "far fa-window-maximize",
    family: "ocs-mirror",
    sample: ["Espejo", "Título"],
    loopAnimation: "mirror"
  },
  "bounce-duo": {
    label: "Rebotar",
    description: "Segunda línea con énfasis dorado.",
    badge: "Bounce",
    icon: "fas fa-arrow-up",
    family: "ocs-split-highlight",
    sample: ["Rebotar", "Título"],
    loopAnimation: "bounce-soft"
  },
  "slide-blocks": {
    label: "Deslizarse",
    description: "Bloques oscuros apilados.",
    badge: "Slide",
    icon: "fas fa-grip-lines-vertical",
    family: "ocs-slide-blocks",
    sample: ["Deslizarse", "Título"],
    loopAnimation: "slide-x"
  },
  "funky-stack": {
    label: "Funky",
    description: "Etiquetas apiladas en blanco y morado.",
    badge: "Funky",
    icon: "fas fa-layer-group",
    family: "ocs-funky",
    sample: ["Funky", "Título"],
    loopAnimation: "float"
  },
  "modern-tag": {
    label: "Moderno",
    description: "Titular con tag inferior violeta.",
    badge: "Modern",
    icon: "fas fa-tag",
    family: "ocs-modern-tag",
    sample: ["Moderno", "Título"],
    loopAnimation: "breathe"
  },
  "zoom-declare": {
    label: "Fundido de entrada y zoom",
    description: "Stack minimal con zoom continuo.",
    badge: "Zoom",
    icon: "fas fa-search-plus",
    family: "ocs-zoom-declare",
    sample: ["Fundido de entrada y", "zoom"],
    loopAnimation: "zoom"
  },
  "subtitle-plain": {
    label: "Subtítulo",
    description: "Subtítulo simple.",
    badge: "Sub",
    icon: "fas fa-closed-captioning",
    family: "ocs-subtitle",
    sample: ["Subtítulo", ""],
    loopAnimation: "fade-loop"
  },
  "karaoke-title": {
    label: "Título de karaoke",
    description: "Primera parte destacada.",
    badge: "Karaoke",
    icon: "fas fa-microphone",
    family: "ocs-karaoke",
    sample: ["Título de", "karaoke"],
    loopAnimation: "karaoke"
  },
  "multiline-block": {
    label: "Título Multilínea",
    description: "Bloques azules apilados.",
    badge: "Multi",
    icon: "fas fa-align-left",
    family: "ocs-stacked",
    sample: ["Título", "Multilínea"],
    loopAnimation: "slide-y"
  },
  "dive-panel": {
    label: "Zambullirse",
    description: "Panel lower third oscuro con barra lateral.",
    badge: "Dive",
    icon: "fas fa-water",
    family: "ocs-dive",
    sample: ["Zambullirse", "Título"],
    loopAnimation: "slide-x"
  },
  "lower-third-green": {
    label: "Tercio inferior",
    description: "Bloque simple verde agua.",
    badge: "Lower",
    icon: "fas fa-align-left",
    family: "ocs-lower-simple",
    sample: ["Tercio", "inferior"],
    loopAnimation: "breathe"
  },
  "lower-third-minimal": {
    label: "Tercio inferior Minimalista",
    description: "Lower third con barra amarilla fina.",
    badge: "Minimal",
    icon: "fas fa-grip-lines",
    family: "ocs-lower-minimal",
    sample: ["Tercio inferior", "Minimalista"],
    loopAnimation: "underline-sweep"
  },
  "subtitle-band": {
    label: "subtítulos",
    description: "Franja inferior completa.",
    badge: "Band",
    icon: "fas fa-minus-square",
    family: "ocs-subtitle-band",
    sample: ["subtítulos", ""],
    loopAnimation: "slide-y"
  },
  "quote-card": {
    label: "Cita",
    description: "Composición con comillas decorativas.",
    badge: "Quote",
    icon: "fas fa-quote-left",
    family: "ocs-quote",
    sample: ["Cita", "—Autor"],
    loopAnimation: "float"
  },
  "rating-card": {
    label: "Clasificación",
    description: "Título con estrellas de calificación.",
    badge: "Rate",
    icon: "fas fa-star",
    family: "ocs-rating",
    sample: ["Clasificación", "Título"],
    loopAnimation: "pulse-stars"
  },
  "credits-card": {
    label: "Lista de créditos",
    description: "Créditos compactos de varias líneas.",
    badge: "Credits",
    icon: "fas fa-list",
    family: "ocs-credits",
    sample: ["Lista de créditos", "Introducir texto"],
    loopAnimation: "credits"
  },
  "timer-card": {
    label: "00:49",
    description: "Timer digital.",
    badge: "Timer",
    icon: "far fa-clock",
    family: "ocs-timer",
    sample: ["00:49", ""],
    loopAnimation: "blink"
  },
  "sale-repeat": {
    label: "Rebajas",
    description: "Patrón repetido para promociones.",
    badge: "Sale",
    icon: "fas fa-percent",
    family: "ocs-sale",
    sample: ["REBAJAS", ""],
    loopAnimation: "marquee"
  },
  "meme-card": {
    label: "Meme",
    description: "Formato meme con top y bottom text.",
    badge: "Meme",
    icon: "far fa-laugh",
    family: "ocs-meme",
    sample: ["Meme", "Texto"],
    loopAnimation: "jitter-soft"
  },
  "intro-funky": {
    label: "Funky Intro",
    description: "Intro con logo y título.",
    badge: "Intro",
    icon: "fas fa-play",
    family: "ocs-intro-card",
    sample: ["Funky", "Intro"],
    loopAnimation: "float"
  },
  "intro-mirror": {
    label: "Espejo Intro",
    description: "Intro espejo dividida.",
    badge: "Intro",
    icon: "fas fa-play-circle",
    family: "ocs-intro-split",
    sample: ["Espejo", "Intro"],
    loopAnimation: "mirror"
  },
  "intro-crisp": {
    label: "Nítido Intro",
    description: "Intro limpia con foco central.",
    badge: "Intro",
    icon: "far fa-dot-circle",
    family: "ocs-intro-center",
    sample: ["Nítido", "Intro"],
    loopAnimation: "breathe"
  },
  "outro-dive-light": {
    label: "Zambullirse Intro/Outro",
    description: "Tarjeta vertical clara.",
    badge: "Outro",
    icon: "fas fa-sign-out-alt",
    family: "ocs-outro-light",
    sample: ["Zambullirse", "Intro/Outro"],
    loopAnimation: "slide-y"
  },
  "outro-dive-dark": {
    label: "Zambullirse Intro/Outro",
    description: "Tarjeta vertical oscura.",
    badge: "Outro",
    icon: "fas fa-sign-out-alt",
    family: "ocs-outro-dark",
    sample: ["Zambullirse", "Intro/Outro"],
    loopAnimation: "slide-y"
  }
};

const CARD_ANIMATION_PRESETS = {
  "broadcast-soft": {
    label: "Broadcast",
    description: "Entrada lateral limpia, salida fade elegante.",
    enterAnimation: "slide-left",
    exitAnimation: "fade"
  },
  "gentle-fade": {
    label: "Suave",
    description: "Entrada y salida discretas para clases o info formal.",
    enterAnimation: "fade",
    exitAnimation: "fade"
  },
  "dynamic-cta": {
    label: "Dinámico",
    description: "Empuja con más energía para avisos o CTA.",
    enterAnimation: "slide-up",
    exitAnimation: "slide-right"
  }
};

const CARD_EXIT_WINDOW_MS = 520;
const CARD_EDITOR_DEFAULT_TAB = "content";
const overlayCardEditorState = {
  tab: CARD_EDITOR_DEFAULT_TAB,
  styleModel: "lower-third-slab",
  animationPreset: "broadcast-soft",
  editingCardId: null,
  suppressEditUntil: 0
};

const CARD_STYLE_GROUPS = [
  { label: "Texto sin formato", models: ["plain-text"] },
  { label: "Estilos de texto", models: ["text-box", "pride-text", "button-pill", "bubble-text", "retro-stripes"] },
  { label: "Título", models: ["typewriter-title", "circular-title", "molon-title", "fireworks-title", "smoke-title", "fade-title", "framed-title", "clean-serif", "glitch-fail", "line-title", "push-back", "big-title", "outline-shadow", "quick-glance", "template-solid", "glow-title", "statement-underline"] },
  { label: "Dos líneas", models: ["mirror-title", "bounce-duo", "slide-blocks", "funky-stack", "modern-tag", "zoom-declare"] },
  { label: "Subtítulo", models: ["subtitle-plain", "karaoke-title", "multiline-block", "dive-panel", "lower-third-slab", "lower-third-green", "lower-third-minimal", "subtitle-band"] },
  { label: "Especial", models: ["quote-card", "rating-card", "credits-card", "timer-card", "sale-repeat", "meme-card"] },
  { label: "Introducción/Conclusión", models: ["intro-funky", "intro-mirror", "intro-crisp", "outro-dive-light", "outro-dive-dark"] }
];

function escapeHtml(value = "") {
  if (typeof window.escapeHtml === "function") return window.escapeHtml(value);
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeCssIdent(value = "") {
  const clean = String(value || "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(clean);
  return clean.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function ensureOverlayCardBaseStyles() {
  if (document.getElementById("podcastOverlayCardBaseStyles")) return;
  const style = document.createElement("style");
  style.id = "podcastOverlayCardBaseStyles";
  style.textContent = `
    .podcast-overlay-card-layer{position:absolute;inset:0;z-index:38;pointer-events:none}
    .podcast-overlay-card.is-exiting{animation:pod-overlay-card-exit var(--pod-card-exit-duration,520ms) cubic-bezier(.55,.05,.55,.95) both}
    .podcast-overlay-card[data-enter-animation=slide-right]{--pod-card-enter-x:42%;--pod-card-enter-y:0%}.podcast-overlay-card[data-enter-animation=slide-left]{--pod-card-enter-x:-42%;--pod-card-enter-y:0%}.podcast-overlay-card[data-enter-animation=slide-up]{--pod-card-enter-x:0%;--pod-card-enter-y:-42%}.podcast-overlay-card[data-enter-animation=slide-down]{--pod-card-enter-x:0%;--pod-card-enter-y:42%}.podcast-overlay-card[data-enter-animation=fade]{--pod-card-enter-x:0%;--pod-card-enter-y:0%}
    .podcast-overlay-card[data-exit-animation=slide-right]{--pod-card-exit-x:42%;--pod-card-exit-y:0%}.podcast-overlay-card[data-exit-animation=slide-left]{--pod-card-exit-x:-42%;--pod-card-exit-y:0%}.podcast-overlay-card[data-exit-animation=slide-up]{--pod-card-exit-x:0%;--pod-card-exit-y:-42%}.podcast-overlay-card[data-exit-animation=slide-down]{--pod-card-exit-x:0%;--pod-card-exit-y:42%}.podcast-overlay-card[data-exit-animation=fade]{--pod-card-exit-x:0%;--pod-card-exit-y:0%}
    @keyframes pod-overlay-card-enter{from{opacity:0;transform:translate(var(--pod-card-enter-x,-42%),var(--pod-card-enter-y,0%))}to{opacity:1;transform:translate(0,0)}}@keyframes pod-overlay-card-exit{from{opacity:1;transform:translate(0,0)}to{opacity:0;transform:translate(var(--pod-card-exit-x,0%),var(--pod-card-exit-y,0%))}}
  `;
  document.head.appendChild(style);
}

function getConfig(session = null, explicitConfig = null) {
  if (explicitConfig && typeof explicitConfig === "object") return explicitConfig;
  return window.getPodcastVideoConfig?.(session || window.getActiveSession?.()) || {};
}

function normalizeCards(raw = {}) {
  if (typeof window.normalizeOverlayCardsById === "function") return window.normalizeOverlayCardsById(raw);
  return raw && typeof raw === "object" ? raw : {};
}

function getCards(session = null, explicitConfig = null) {
  return normalizeCards(getConfig(session, explicitConfig).timelineOverlayCardsById || {});
}

function getActiveSceneTiming() {
  const session = window.getActiveSession?.();
  const rowId = String(window.podcastVideoState?.activeRowId || "").trim();
  const clip = rowId ? window.ensureTimelineClipsByRowId?.(session, { persist: false })?.[rowId] || null : null;
  return {
    session,
    rowId,
    startMs: Math.max(0, Number(clip?.startMs || 0) || 0),
    durationMs: Math.max(500, Number(clip?.trimOutMs || 0) - Number(clip?.trimInMs || 0) || Number(clip?.durationMs || 4000) || 4000)
  };
}

function saveCards(nextCards = {}) {
  window.upsertPodcastVideoConfig?.((cfg) => ({
    ...cfg,
    timelineOverlayCardsById: normalizeCards(nextCards)
  }), { autosaveReason: "overlay-cards" });
  const session = window.getActiveSession?.();
  window.persistReorderedTimelinePatchToCloud?.(session, {
    podcastVideoConfig: getConfig(session),
    timelineOverlayCardsById: normalizeCards(nextCards)
  });
  window.renderPodcastVideoTimeline?.(session, { force: true, reason: "overlay-cards" });
  window.scheduleMontageExportPreviewRefresh?.(90);
}

function deleteCard(cardId = "") {
  const cleanId = String(cardId || "").trim();
  if (!cleanId) return;
  const session = window.getActiveSession?.();
  const cards = { ...getCards(window.getActiveSession?.()) };
  if (!cards[cleanId]) return;
  delete cards[cleanId];
  saveCards(cards);
  document.querySelectorAll(`.podcast-overlay-card[data-card-id="${escapeCssIdent(cleanId)}"]`).forEach((node) => node.remove());
  renderCardList();
  renderPodcasterOverlayCardsForPreview({ session, currentMs: window.podcastVideoState?.montageCursorMs ?? 0 });
}

function buildCardFromEditor() {
  const panel = document.querySelector(".podcast-overlay-card-editor");
  const presetKey = panel?.querySelector('[data-field="preset"]')?.value || "lower-third";
  const preset = CARD_PRESETS[presetKey] || CARD_PRESETS["lower-third"];
  const styleModel = resolveOverlayCardEditorStyleModel(panel, preset.styleModel || overlayCardEditorState.styleModel || "lower-third-slab");
  const animationPreset = String(panel?.querySelector('[data-field="animationPreset"]')?.value || overlayCardEditorState.animationPreset || "broadcast-soft").trim() || "broadcast-soft";
  const { rowId, startMs, durationMs } = getActiveSceneTiming();
  const lines = (preset.fields || []).map((field) => panel?.querySelector(`[data-field="${field.key}"]`)?.value)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const id = overlayCardEditorState.editingCardId || `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const requestedDurationMs = Math.max(500, Number(panel?.querySelector('[data-field="durationMs"]')?.value || durationMs) || durationMs);
  const requestedExitDelayMs = Math.max(0, Number(panel?.querySelector('[data-field="exitDelayMs"]')?.value ?? (requestedDurationMs - CARD_EXIT_WINDOW_MS)) || 0);
  return {
    id,
    rowId,
    startMs,
    durationMs: requestedDurationMs,
    exitDelayMs: Math.min(requestedDurationMs, requestedExitDelayMs),
    preset: presetKey,
    styleModel,
    animationPreset,
    textLines: lines.length ? lines : preset.textLines,
    position: {
      ...(preset.position || {}),
      xPct: Number(panel?.querySelector('[data-field="positionXPct"]')?.value ?? preset.position?.xPct ?? 0.06),
      yPct: Number(panel?.querySelector('[data-field="positionYPct"]')?.value ?? preset.position?.yPct ?? 0.66),
      widthPct: Number(panel?.querySelector('[data-field="positionWidthPct"]')?.value ?? preset.position?.widthPct ?? 0.56),
      heightPct: Number(panel?.querySelector('[data-field="positionHeightPct"]')?.value ?? preset.position?.heightPct ?? 0.2)
    },
    enterAnimation: panel?.querySelector('[data-field="enterAnimation"]')?.value || preset.enterAnimation,
    exitAnimation: panel?.querySelector('[data-field="exitAnimation"]')?.value || "fade",
    style: {
      accentColor: panel?.querySelector('[data-field="accentColor"]')?.value || "#7c5cff",
      backgroundColor: "#0f172a",
      textColor: "#f8fafc",
      fontScale: Number(panel?.querySelector('[data-field="fontScale"]')?.value || 1) || 1,
      loopAnimation: panel?.querySelector('[data-field="loopAnimation"]')?.value || (CARD_STYLE_MODELS[styleModel]?.loopAnimation || "none")
    },
    zIndex: 20
  };
}

function renderStyleModelGallery() {
  return CARD_STYLE_GROUPS.map((group) => `
    <section class="podcast-overlay-card-style-section" aria-label="${escapeHtml(group.label)}">
      <h3 class="podcast-overlay-card-style-section-title">${escapeHtml(group.label)}</h3>
      <div class="podcast-overlay-card-style-grid-cards">
        ${group.models.map((value) => {
          const item = CARD_STYLE_MODELS[value];
          if (!item) return "";
          return `
            <button type="button" class="podcast-overlay-card-style-option${value === "lower-third-slab" ? " is-active" : ""}" data-action="overlay-card-select-style" data-style-model="${value}" aria-label="${escapeHtml(item.label)}">
              <span class="podcast-overlay-card-style-thumb is-${value}">
                ${(item.sample || ["Título", ""]).map((line, index) => line ? `<span class="podcast-overlay-card-style-thumb-word${index === 0 ? " is-primary" : ""}">${escapeHtml(line)}</span>` : "").join("")}
              </span>
              <span class="podcast-overlay-card-style-copy">
                <strong>${escapeHtml(item.label)}</strong>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");
}

function renderEditor() {
  if (document.querySelector(".podcast-overlay-card-editor")) return;
  const host = document.createElement("div");
  host.className = "podcast-overlay-card-editor";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "Editor de card animada");
  host.hidden = true;
  host.innerHTML = `
    <div class="podcast-overlay-card-modal-backdrop" data-action="overlay-card-close"></div>
    <section class="podcast-overlay-card-modal" role="document">
      <div class="podcast-overlay-card-modal-shell">
        <header class="podcast-overlay-card-modal-head">
          <div class="podcast-overlay-card-title-block">
            <strong>Overlay Cards Studio</strong>
            <span>Diseña cards visuales, modernas y listas para video.</span>
          </div>
          <button type="button" data-action="overlay-card-close" aria-label="Cerrar">&times;</button>
        </header>
        <div class="podcast-overlay-card-modal-body">
          <aside class="podcast-overlay-card-sidebar" aria-label="Secciones del editor">
            <button type="button" class="podcast-overlay-card-tab is-active" data-card-tab="content">
              <i class="fas fa-pen-nib" aria-hidden="true"></i><span>Contenido</span>
            </button>
            <button type="button" class="podcast-overlay-card-tab" data-card-tab="models">
              <i class="fas fa-shapes" aria-hidden="true"></i><span>Modelos</span>
            </button>
            <button type="button" class="podcast-overlay-card-tab" data-card-tab="animation">
              <i class="fas fa-play-circle" aria-hidden="true"></i><span>Animación</span>
            </button>
          </aside>
          <div class="podcast-overlay-card-main">
            <div class="podcast-overlay-card-preview">
              <div class="podcast-overlay-card-preview-head">
                <span>Preview</span>
                <strong data-role="overlay-card-preview-style-name">Tercio inferior</strong>
              </div>
              <div class="podcast-overlay-card-preview-stage"></div>
            </div>
            <div class="podcast-overlay-card-panels">
              <section class="podcast-overlay-card-panel is-active" data-card-panel="content">
                <div class="podcast-overlay-card-form">
                  <label>
                    <span>Plantilla base</span>
                    <select data-field="preset" aria-label="Plantilla de card">
                      ${Object.entries(CARD_PRESETS).map(([value, item]) => `<option value="${value}">${escapeHtml(item.label)}</option>`).join("")}
                    </select>
                  </label>
                  <label>
                    <span>Duración</span>
                    <input data-field="durationMs" type="number" min="500" step="100" value="4000" aria-label="Duración en milisegundos">
                  </label>
                  <label data-field-row="line1">
                    <span data-label-for="line1">Texto principal</span>
                    <input data-field="line1" type="text" value="Nombre de la persona" aria-label="Texto principal">
                  </label>
                  <label data-field-row="line2">
                    <span data-label-for="line2">Texto secundario</span>
                    <input data-field="line2" type="text" value="Cargo o contexto" aria-label="Texto secundario">
                  </label>
                  <label data-field-row="line3">
                    <span data-label-for="line3">Texto adicional</span>
                    <input data-field="line3" type="text" placeholder="Detalle opcional" aria-label="Texto adicional">
                  </label>
                  <label>
                    <span>Acento</span>
                    <input data-field="accentColor" type="color" value="#7c5cff" aria-label="Color de acento">
                  </label>
                  <label>
                    <span>Tamaño letra</span>
                    <input data-field="fontScale" type="range" min="0.7" max="1.8" step="0.05" value="1" aria-label="Tamaño de letra">
                  </label>
                  <label>
                    <span>Animación continua</span>
                    <select data-field="loopAnimation" aria-label="Animación continua">
                      <option value="none">Sin animación</option>
                      <option value="breathe">Respirar</option>
                      <option value="float">Flotar</option>
                      <option value="glow">Glow</option>
                      <option value="jitter-soft">Jitter</option>
                      <option value="type">Typing</option>
                      <option value="orbit">Orbit</option>
                      <option value="zoom">Zoom</option>
                    </select>
                  </label>
                  <input data-field="positionXPct" type="hidden" value="0.06">
                  <input data-field="positionYPct" type="hidden" value="0.66">
                  <input data-field="positionWidthPct" type="hidden" value="0.56">
                  <input data-field="positionHeightPct" type="hidden" value="0.2">
                </div>
                <p class="podcast-overlay-card-position-hint">Arrastra la card dentro del preview para moverla manualmente.</p>
                <div class="podcast-overlay-card-list" aria-label="Cards creadas"></div>
              </section>
              <section class="podcast-overlay-card-panel" data-card-panel="models">
                <input type="hidden" data-field="styleModel" value="lower-third-slab">
                <div class="podcast-overlay-card-models-preview">
                  <div class="podcast-overlay-card-preview-head">
                    <span>Preview activo</span>
                    <strong data-role="overlay-card-model-preview-style-name">Tercio inferior</strong>
                  </div>
                  <div class="podcast-overlay-card-models-preview-stage"></div>
                </div>
                <div class="podcast-overlay-card-style-grid">${renderStyleModelGallery()}</div>
              </section>
              <section class="podcast-overlay-card-panel" data-card-panel="animation">
                <input type="hidden" data-field="animationPreset" value="broadcast-soft">
                <div class="podcast-overlay-card-animation-presets">
                  ${Object.entries(CARD_ANIMATION_PRESETS).map(([value, item]) => `
                    <button type="button" class="podcast-overlay-card-animation-option${value === "broadcast-soft" ? " is-active" : ""}" data-action="overlay-card-select-animation-preset" data-animation-preset="${value}">
                      <strong>${escapeHtml(item.label)}</strong>
                      <small>${escapeHtml(item.description)}</small>
                    </button>
                  `).join("")}
                </div>
                <div class="podcast-overlay-card-form is-animation-form">
                  <label>
                    <span>Entrada</span>
                    <select data-field="enterAnimation" aria-label="Animación de entrada">
                      <option value="slide-left">Desde izquierda</option>
                      <option value="slide-right">Desde derecha</option>
                      <option value="slide-up">Desde arriba</option>
                      <option value="slide-down">Desde abajo</option>
                      <option value="fade">Fade</option>
                    </select>
                  </label>
                  <label>
                    <span>Salida</span>
                    <select data-field="exitAnimation" aria-label="Animación de salida">
                      <option value="fade">Salida fade</option>
                      <option value="slide-left">Sale izquierda</option>
                      <option value="slide-right">Sale derecha</option>
                      <option value="slide-up">Sale arriba</option>
                      <option value="slide-down">Sale abajo</option>
                    </select>
                  </label>
                  <label>
                    <span>Tiempo antes de salida</span>
                    <input data-field="exitDelayMs" type="number" min="0" step="100" value="3480" aria-label="Tiempo antes de aplicar la animación de salida">
                  </label>
                </div>
              </section>
            </div>
          </div>
        </div>
        <footer class="podcast-overlay-card-modal-actions">
          <button type="button" data-action="overlay-card-close">Cancelar</button>
          <button type="button" data-action="overlay-card-save">Añadir card</button>
        </footer>
      </div>
    </section>
  `;
  document.body.appendChild(host);
  applyEditorPresetFields(host);
  attachOverlayCardPreviewDrag(host);
  renderOverlayCardEditorPreview(host);
}

function syncOverlayCardEditorSaveAction(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const saveBtn = panel.querySelector('[data-action="overlay-card-save"]');
  if (saveBtn) {
    saveBtn.textContent = overlayCardEditorState.editingCardId ? "Guardar cambios" : "Añadir card";
  }
}

function resetOverlayCardEditor(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  overlayCardEditorState.editingCardId = null;
  overlayCardEditorState.styleModel = CARD_PRESETS["lower-third"]?.styleModel || "lower-third-slab";
  overlayCardEditorState.animationPreset = "broadcast-soft";
  const presetInput = panel.querySelector('[data-field="preset"]');
  if (presetInput) presetInput.value = "lower-third";
  const styleModelInput = panel.querySelector('[data-field="styleModel"]');
  if (styleModelInput) styleModelInput.value = overlayCardEditorState.styleModel;
  const animationPresetInput = panel.querySelector('[data-field="animationPreset"]');
  if (animationPresetInput) animationPresetInput.value = overlayCardEditorState.animationPreset;
  syncOverlayCardEditorSaveAction(panel);
  applyEditorPresetFields(panel);
}

function resolveOverlayCardEditorStyleModel(panel = document.querySelector(".podcast-overlay-card-editor"), fallbackStyleModel = "lower-third-slab") {
  const stateStyle = String(overlayCardEditorState.styleModel || "").trim();
  if (stateStyle && CARD_STYLE_MODELS[stateStyle]) return stateStyle;
  const inputStyle = String(panel?.querySelector('[data-field="styleModel"]')?.value || "").trim();
  if (inputStyle && CARD_STYLE_MODELS[inputStyle]) return inputStyle;
  return String(fallbackStyleModel || "lower-third-slab").trim() || "lower-third-slab";
}

function loadCardIntoEditor(card, panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel || !card) return;
  overlayCardEditorState.editingCardId = String(card.id || "").trim() || null;
  overlayCardEditorState.styleModel = String(card.styleModel || CARD_PRESETS[card.preset || "lower-third"]?.styleModel || "lower-third-slab").trim() || "lower-third-slab";
  overlayCardEditorState.animationPreset = String(card.animationPreset || "broadcast-soft").trim() || "broadcast-soft";
  const presetInput = panel.querySelector('[data-field="preset"]');
  if (presetInput) presetInput.value = card.preset || "lower-third";
  applyEditorPresetFields(panel);
  const styleModelInput = panel.querySelector('[data-field="styleModel"]');
  if (styleModelInput) styleModelInput.value = overlayCardEditorState.styleModel;
  const animationPresetInput = panel.querySelector('[data-field="animationPreset"]');
  if (animationPresetInput) animationPresetInput.value = overlayCardEditorState.animationPreset;
  const durationInput = panel.querySelector('[data-field="durationMs"]');
  if (durationInput) durationInput.value = String(Math.max(500, Number(card.durationMs || 4000) || 4000));
  const exitDelayInput = panel.querySelector('[data-field="exitDelayMs"]');
  if (exitDelayInput) exitDelayInput.value = String(Math.max(0, Math.min(Number(card.durationMs || 4000) || 4000, Number(card.exitDelayMs ?? ((Number(card.durationMs || 4000) || 4000) - CARD_EXIT_WINDOW_MS)) || 0)));
  ["line1", "line2", "line3"].forEach((key, index) => {
    const input = panel.querySelector(`[data-field="${key}"]`);
    if (input) input.value = String(card.textLines?.[index] || "");
  });
  const accentInput = panel.querySelector('[data-field="accentColor"]');
  if (accentInput) accentInput.value = card.style?.accentColor || "#7c5cff";
  const fontScaleInput = panel.querySelector('[data-field="fontScale"]');
  if (fontScaleInput) fontScaleInput.value = String(Math.max(0.7, Number(card.style?.fontScale || 1) || 1));
  const loopInput = panel.querySelector('[data-field="loopAnimation"]');
  if (loopInput) loopInput.value = card.style?.loopAnimation || CARD_STYLE_MODELS[styleModelInput?.value || "lower-third-slab"]?.loopAnimation || "none";
  const enterInput = panel.querySelector('[data-field="enterAnimation"]');
  if (enterInput) enterInput.value = card.enterAnimation || "slide-left";
  const exitInput = panel.querySelector('[data-field="exitAnimation"]');
  if (exitInput) exitInput.value = card.exitAnimation || "fade";
  const pos = card.position || {};
  const positionXInput = panel.querySelector('[data-field="positionXPct"]');
  const positionYInput = panel.querySelector('[data-field="positionYPct"]');
  const positionWInput = panel.querySelector('[data-field="positionWidthPct"]');
  const positionHInput = panel.querySelector('[data-field="positionHeightPct"]');
  if (positionXInput) positionXInput.value = String(Number(pos.xPct ?? 0.06));
  if (positionYInput) positionYInput.value = String(Number(pos.yPct ?? 0.66));
  if (positionWInput) positionWInput.value = String(Number(pos.widthPct ?? 0.56));
  if (positionHInput) positionHInput.value = String(Number(pos.heightPct ?? 0.2));
  syncOverlayCardStyleSelection(panel);
  syncOverlayCardAnimationPresetSelection(panel);
  syncOverlayCardEditorSaveAction(panel);
  renderOverlayCardEditorPreview(panel);
}

function applyEditorPresetFields(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const presetKey = panel.querySelector('[data-field="preset"]')?.value || "lower-third";
  const preset = CARD_PRESETS[presetKey] || CARD_PRESETS["lower-third"];
  const styleModelInput = panel.querySelector('[data-field="styleModel"]');
  const resolvedStyleModel = resolveOverlayCardEditorStyleModel(panel, preset.styleModel || "lower-third-slab");
  overlayCardEditorState.styleModel = resolvedStyleModel;
  if (styleModelInput) {
    styleModelInput.value = resolvedStyleModel;
  }
  const fieldMap = new Map((preset.fields || []).map((field) => [field.key, field]));
  ["line1", "line2", "line3"].forEach((key) => {
    const row = panel.querySelector(`[data-field-row="${key}"]`);
    const input = panel.querySelector(`[data-field="${key}"]`);
    const label = panel.querySelector(`[data-label-for="${key}"]`);
    const field = fieldMap.get(key);
    if (row) row.hidden = !field;
    if (!input || !field) return;
    input.value = field.value || "";
    input.placeholder = field.placeholder || "";
    input.setAttribute("aria-label", field.label || "Texto");
    if (label) label.textContent = field.label || "Texto";
  });
  const enterSelect = panel.querySelector('[data-field="enterAnimation"]');
  if (enterSelect) enterSelect.value = preset.enterAnimation || "slide-left";
  const fontScaleInput = panel.querySelector('[data-field="fontScale"]');
  if (fontScaleInput && !fontScaleInput.value) fontScaleInput.value = "1";
  const animationPresetInput = panel.querySelector('[data-field="animationPreset"]');
  if (animationPresetInput) {
    if (!overlayCardEditorState.animationPreset) overlayCardEditorState.animationPreset = "broadcast-soft";
    animationPresetInput.value = overlayCardEditorState.animationPreset;
  }
  const loopAnimationInput = panel.querySelector('[data-field="loopAnimation"]');
  if (loopAnimationInput) loopAnimationInput.value = CARD_STYLE_MODELS[resolvedStyleModel]?.loopAnimation || "none";
  const positionXInput = panel.querySelector('[data-field="positionXPct"]');
  const positionYInput = panel.querySelector('[data-field="positionYPct"]');
  const positionWInput = panel.querySelector('[data-field="positionWidthPct"]');
  const positionHInput = panel.querySelector('[data-field="positionHeightPct"]');
  if (positionXInput) positionXInput.value = String(preset.position?.xPct ?? 0.06);
  if (positionYInput) positionYInput.value = String(preset.position?.yPct ?? 0.66);
  if (positionWInput) positionWInput.value = String(preset.position?.widthPct ?? 0.56);
  if (positionHInput) positionHInput.value = String(preset.position?.heightPct ?? 0.2);
  const durationInput = panel.querySelector('[data-field="durationMs"]');
  const exitDelayInput = panel.querySelector('[data-field="exitDelayMs"]');
  const resolvedDurationMs = Math.max(500, Number(durationInput?.value || 4000) || 4000);
  if (durationInput) durationInput.value = String(resolvedDurationMs);
  if (exitDelayInput) {
    const currentExitDelay = Number(exitDelayInput.value);
    const fallbackExitDelay = Math.max(0, resolvedDurationMs - CARD_EXIT_WINDOW_MS);
    const safeExitDelay = Number.isFinite(currentExitDelay)
      ? Math.max(0, Math.min(resolvedDurationMs, currentExitDelay))
      : fallbackExitDelay;
    exitDelayInput.value = String(safeExitDelay);
  }
  syncOverlayCardStyleSelection(panel);
  syncOverlayCardAnimationPresetSelection(panel);
  syncOverlayCardEditorSaveAction(panel);
  renderOverlayCardEditorPreview(panel);
}

function getOverlayCardEditorDraft(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return null;
  const presetKey = panel.querySelector('[data-field="preset"]')?.value || "lower-third";
  const preset = CARD_PRESETS[presetKey] || CARD_PRESETS["lower-third"];
  const styleModel = resolveOverlayCardEditorStyleModel(panel, preset.styleModel || "lower-third-slab");
  return {
    id: "preview-card",
    preset: presetKey,
    styleModel,
    animationPreset: panel.querySelector('[data-field="animationPreset"]')?.value || "broadcast-soft",
    enterAnimation: panel.querySelector('[data-field="enterAnimation"]')?.value || preset.enterAnimation || "slide-left",
    exitAnimation: panel.querySelector('[data-field="exitAnimation"]')?.value || "fade",
    durationMs: Math.max(500, Number(panel.querySelector('[data-field="durationMs"]')?.value || 4000) || 4000),
    exitDelayMs: Math.max(0, Math.min(
      Math.max(500, Number(panel.querySelector('[data-field="durationMs"]')?.value || 4000) || 4000),
      Number(panel.querySelector('[data-field="exitDelayMs"]')?.value ?? (Number(panel.querySelector('[data-field="durationMs"]')?.value || 4000) - CARD_EXIT_WINDOW_MS)) || 0
    )),
    textLines: (preset.fields || [])
      .map((field) => String(panel.querySelector(`[data-field="${field.key}"]`)?.value || field.value || "").trim())
      .filter(Boolean),
    position: {
      ...(preset.position || {}),
      xPct: Number(panel.querySelector('[data-field="positionXPct"]')?.value ?? preset.position?.xPct ?? 0.06),
      yPct: Number(panel.querySelector('[data-field="positionYPct"]')?.value ?? preset.position?.yPct ?? 0.66),
      widthPct: Number(panel.querySelector('[data-field="positionWidthPct"]')?.value ?? preset.position?.widthPct ?? 0.56),
      heightPct: Number(panel.querySelector('[data-field="positionHeightPct"]')?.value ?? preset.position?.heightPct ?? 0.2)
    },
    style: {
      accentColor: panel.querySelector('[data-field="accentColor"]')?.value || "#7c5cff",
      backgroundColor: "#0f172a",
      textColor: "#f8fafc",
      fontScale: Number(panel.querySelector('[data-field="fontScale"]')?.value || 1) || 1,
      loopAnimation: panel.querySelector('[data-field="loopAnimation"]')?.value || (CARD_STYLE_MODELS[styleModel]?.loopAnimation || "none")
    },
    zIndex: 20
  };
}

function syncOverlayCardStyleSelection(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const styleModel = resolveOverlayCardEditorStyleModel(panel, "lower-third-slab");
  overlayCardEditorState.styleModel = styleModel;
  const styleModelInput = panel.querySelector('[data-field="styleModel"]');
  if (styleModelInput) styleModelInput.value = styleModel;
  panel.querySelectorAll("[data-style-model]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.styleModel === styleModel);
  });
  const previewName = panel.querySelector('[data-role="overlay-card-preview-style-name"]');
  if (previewName) previewName.textContent = CARD_STYLE_MODELS[styleModel]?.label || "Tercio inferior";
  const modelPreviewName = panel.querySelector('[data-role="overlay-card-model-preview-style-name"]');
  if (modelPreviewName) modelPreviewName.textContent = CARD_STYLE_MODELS[styleModel]?.label || "Tercio inferior";
}

function syncOverlayCardAnimationPresetSelection(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const presetKey = String(panel.querySelector('[data-field="animationPreset"]')?.value || overlayCardEditorState.animationPreset || "broadcast-soft").trim() || "broadcast-soft";
  overlayCardEditorState.animationPreset = presetKey;
  const presetInput = panel.querySelector('[data-field="animationPreset"]');
  if (presetInput) presetInput.value = presetKey;
  panel.querySelectorAll("[data-animation-preset]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.animationPreset === presetKey);
  });
}

function syncOverlayCardExitDelayField(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const durationInput = panel.querySelector('[data-field="durationMs"]');
  const exitDelayInput = panel.querySelector('[data-field="exitDelayMs"]');
  if (!durationInput || !exitDelayInput) return;
  const durationMs = Math.max(500, Number(durationInput.value || 4000) || 4000);
  durationInput.value = String(durationMs);
  const exitDelayMs = Math.max(0, Math.min(durationMs, Number(exitDelayInput.value || Math.max(0, durationMs - CARD_EXIT_WINDOW_MS)) || 0));
  exitDelayInput.value = String(exitDelayMs);
}

function setOverlayCardEditorTab(panel = document.querySelector(".podcast-overlay-card-editor"), tab = CARD_EDITOR_DEFAULT_TAB) {
  if (!panel) return;
  overlayCardEditorState.tab = tab;
  panel.dataset.activeTab = tab;
  panel.querySelectorAll("[data-card-tab]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.cardTab === tab);
  });
  panel.querySelectorAll("[data-card-panel]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.cardPanel === tab);
  });
}

function setOverlayCardEditorPreviewAspect(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const session = window.getActiveSession?.() || null;
  const aspect = isReelModeEnabled(session) ? REEL_ASPECT_RATIO_CSS : NORMAL_ASPECT_RATIO_CSS;
  panel.style.setProperty("--pod-editor-preview-aspect", aspect);
}

function syncOverlayCardEditorPreviewScale(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const sourceStage = document.querySelector("#podcastVideoStage .podcast-video-preview");
  const sourceRect = sourceStage?.getBoundingClientRect?.() || null;
  panel.querySelectorAll(".podcast-overlay-card-preview-stage, .podcast-overlay-card-models-preview-stage").forEach((stage) => {
    stage.style.width = "";
    stage.style.height = "";
    stage.style.maxWidth = "none";
    stage.style.zoom = "";
    const parentWidth = stage.parentElement?.clientWidth || 0;
    const parentHeight = Math.max(220, stage.parentElement?.clientHeight || 0);
    if (!sourceRect || sourceRect.width <= 0 || sourceRect.height <= 0 || parentWidth <= 0) return;
    const scale = Math.min(parentWidth / sourceRect.width, parentHeight / sourceRect.height, 1);
    stage.style.width = `${Math.round(sourceRect.width)}px`;
    stage.style.height = `${Math.round(sourceRect.height)}px`;
    stage.style.zoom = String(scale);
  });
}

function applyOverlayCardPreviewDraftPosition(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const draft = getOverlayCardEditorDraft(panel);
  if (!draft) return;
  const pos = draft.position || {};
  const widthPct = Math.max(0.22, Math.min(0.9, Number(pos.widthPct || 0.56) || 0.56));
  const heightPct = Math.max(0.12, Math.min(0.55, Number(pos.heightPct || 0.2) || 0.2));
  const xPct = Math.max(0, Math.min(1 - widthPct, Number(pos.xPct || 0) || 0));
  const yPct = Math.max(0, Math.min(1 - heightPct, Number(pos.yPct || 0) || 0));
  panel.querySelectorAll(".podcast-overlay-card-preview-stage .podcast-overlay-card, .podcast-overlay-card-models-preview-stage .podcast-overlay-card").forEach((card) => {
    card.style.setProperty("--pod-card-x", String(xPct));
    card.style.setProperty("--pod-card-y", String(yPct));
    card.style.setProperty("--pod-card-w", String(widthPct));
    card.style.setProperty("--pod-card-h", String(heightPct));
  });
}

function renderOverlayCardEditorPreview(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  setOverlayCardEditorPreviewAspect(panel);
  syncOverlayCardEditorPreviewScale(panel);
  const draft = getOverlayCardEditorDraft(panel);
  if (!draft) return;
  panel.querySelectorAll(".podcast-overlay-card-preview-stage, .podcast-overlay-card-models-preview-stage").forEach((stage) => {
    stage.innerHTML = renderCard(draft, { interactive: false, phase: "enter", preview: true });
  });
}

function clampEditorValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function attachOverlayCardStageDrag(container = document.querySelector("#podcastVideoStage .podcast-video-preview")) {
  if (!container || container.dataset.overlayCardStageDragReady === "true") return;
  container.dataset.overlayCardStageDragReady = "true";
  let dragState = null;
  container.addEventListener("pointerdown", (event) => {
    const deleteBtn = event.target?.closest?.(".podcast-overlay-card-delete");
    if (deleteBtn) return;
    const card = event.target?.closest?.(".podcast-overlay-card");
    const layer = event.target?.closest?.(".podcast-overlay-card-layer.is-interactive");
    if (!card || !layer) return;
    const cardId = String(card.dataset.cardId || "").trim();
    if (!cardId) return;
    const stageRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    dragState = {
      cardId,
      card,
      stageRect,
      widthPct: Math.max(0.12, Math.min(0.95, cardRect.width / stageRect.width)),
      heightPct: Math.max(0.12, Math.min(0.95, cardRect.height / stageRect.height)),
      grabOffsetX: event.clientX - cardRect.left,
      grabOffsetY: event.clientY - cardRect.top,
      moved: false
    };
    container.dataset.overlayCardDragging = "true";
    card.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  container.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const xPct = clampEditorValue((event.clientX - dragState.stageRect.left - dragState.grabOffsetX) / dragState.stageRect.width, 0, 1 - dragState.widthPct);
    const yPct = clampEditorValue((event.clientY - dragState.stageRect.top - dragState.grabOffsetY) / dragState.stageRect.height, 0, 1 - dragState.heightPct);
    dragState.card.style.setProperty("--pod-card-x", String(xPct));
    dragState.card.style.setProperty("--pod-card-y", String(yPct));
    dragState.moved = true;
  });
  const finishDrag = () => {
    if (!dragState) return;
    const { cardId, card, widthPct, heightPct, moved } = dragState;
    dragState = null;
    delete container.dataset.overlayCardDragging;
    if (!moved) return;
    const session = window.getActiveSession?.();
    const cards = { ...getCards(session) };
    if (!cards[cardId]) return;
    const xPct = Number(card.style.getPropertyValue("--pod-card-x") || cards[cardId]?.position?.xPct || 0);
    const yPct = Number(card.style.getPropertyValue("--pod-card-y") || cards[cardId]?.position?.yPct || 0);
    cards[cardId] = {
      ...cards[cardId],
      position: {
        ...(cards[cardId].position || {}),
        xPct,
        yPct,
        widthPct: Math.max(0.22, Math.min(0.9, widthPct)),
        heightPct: Math.max(0.12, Math.min(0.55, heightPct))
      }
    };
    saveCards(cards);
    overlayCardEditorState.suppressEditUntil = Date.now() + 250;
    const layer = container.querySelector(".podcast-overlay-card-layer");
    if (layer) layer.dataset.cardsSignature = "";
    renderPodcasterOverlayCardsForPreview({ session, currentMs: window.podcastVideoState?.montageCursorMs ?? 0 });
  };
  container.addEventListener("pointerup", finishDrag);
  container.addEventListener("pointercancel", finishDrag);
}

function attachOverlayCardPreviewDrag(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel || panel.dataset.dragReady === "true") return;
  panel.dataset.dragReady = "true";
  let dragState = null;
  panel.addEventListener("pointerdown", (event) => {
    const card = event.target?.closest?.(".podcast-overlay-card");
    const stage = event.target?.closest?.(".podcast-overlay-card-preview-stage, .podcast-overlay-card-models-preview-stage");
    if (!card || !stage) return;
    const draft = getOverlayCardEditorDraft(panel);
    if (!draft) return;
    const rect = stage.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    dragState = {
      rect,
      widthPct: Math.max(0.12, Math.min(0.95, cardRect.width / rect.width)),
      heightPct: Math.max(0.12, Math.min(0.95, cardRect.height / rect.height)),
      grabOffsetX: event.clientX - cardRect.left,
      grabOffsetY: event.clientY - cardRect.top,
      pointerId: event.pointerId
    };
    panel.dataset.previewDragging = "true";
    card.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  panel.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const xPct = clampEditorValue((event.clientX - dragState.rect.left - dragState.grabOffsetX) / dragState.rect.width, 0, 1 - dragState.widthPct);
    const yPct = clampEditorValue((event.clientY - dragState.rect.top - dragState.grabOffsetY) / dragState.rect.height, 0, 1 - dragState.heightPct);
    const xInput = panel.querySelector('[data-field="positionXPct"]');
    const yInput = panel.querySelector('[data-field="positionYPct"]');
    if (xInput) xInput.value = String(Number.isFinite(xPct) ? xPct : 0);
    if (yInput) yInput.value = String(Number.isFinite(yPct) ? yPct : 0);
    applyOverlayCardPreviewDraftPosition(panel);
  });
  panel.addEventListener("pointerup", () => {
    if (!dragState) return;
    dragState = null;
    delete panel.dataset.previewDragging;
    renderOverlayCardEditorPreview(panel);
  });
  panel.addEventListener("pointercancel", () => {
    if (!dragState) return;
    dragState = null;
    delete panel.dataset.previewDragging;
    renderOverlayCardEditorPreview(panel);
  });
}

function renderCardList() {
  const list = document.querySelector(".podcast-overlay-card-list");
  if (!list) return;
  const cards = Object.values(getCards(window.getActiveSession?.()))
    .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0));
  list.innerHTML = cards.length
    ? cards.map((card) => `
      <div class="podcast-overlay-card-list-item" data-action="overlay-card-edit" data-card-id="${escapeHtml(card.id)}" role="button" tabindex="0" aria-label="Editar ${escapeHtml((card.textLines || [])[0] || "card")}">
        <span>${escapeHtml((card.textLines || [])[0] || "Card")}</span>
        <button type="button" data-action="overlay-card-delete" data-card-id="${escapeHtml(card.id)}" aria-label="Eliminar card">Eliminar</button>
      </div>
    `).join("")
    : `<span class="podcast-overlay-card-empty">Sin cards</span>`;
}

function ensureLayer(container) {
  if (!container) return null;
  ensureOverlayCardBaseStyles();
  let layer = container.querySelector(".podcast-overlay-card-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "podcast-overlay-card-layer";
    layer.setAttribute("aria-hidden", "true");
    container.appendChild(layer);
  }
  return layer;
}

function renderCard(card, options = {}) {
  const pos = card.position || {};
  const style = card.style || {};
  const interactive = options.interactive !== false;
  const phase = options.phase === "exit" ? "exit" : "enter";
  const exitAnimation = String(card.exitAnimation || "fade").trim() || "fade";
  const exitDelayMs = Math.max(0, Math.min(Number(card.durationMs || 0) || 0, Number(card.exitDelayMs ?? ((Number(card.durationMs || 0) || 0) - CARD_EXIT_WINDOW_MS)) || 0));
  const exitDurationMs = Math.max(120, Math.min(2000, Math.round(Math.max(120, (Number(card.durationMs || 0) || 0) - exitDelayMs || CARD_EXIT_WINDOW_MS))));
  const styleModel = String(card.styleModel || CARD_PRESETS[card.preset || "lower-third"]?.styleModel || "lower-third-slab").trim() || "lower-third-slab";
  const styleMeta = CARD_STYLE_MODELS[styleModel] || CARD_STYLE_MODELS["lower-third-slab"];
  const widthPct = Math.max(0.22, Math.min(0.9, Number(pos.widthPct || 0.56) || 0.56));
  const heightPct = Math.max(0.12, Math.min(0.55, Number(pos.heightPct || 0.2) || 0.2));
  const xPct = Math.max(0, Math.min(1 - widthPct, Number(pos.xPct || 0) || 0));
  const yPct = Math.max(0, Math.min(1 - heightPct, Number(pos.yPct || 0) || 0));
  const textLines = Array.isArray(card.textLines) ? card.textLines : [];
  return `
    <div class="podcast-overlay-card is-${escapeHtml(card.preset || "lower-third")}${phase === "exit" ? " is-exiting" : ""}" data-card-id="${escapeHtml(card.id)}" data-style-model="${escapeHtml(styleModel)}" data-style-family="${escapeHtml(styleMeta.family || "panel")}" data-loop-animation="${escapeHtml(style.loopAnimation || styleMeta.loopAnimation || "none")}" data-enter-animation="${escapeHtml(card.enterAnimation || "slide-left")}" data-exit-animation="${escapeHtml(exitAnimation)}" data-phase="${phase}" data-line1="${escapeHtml(textLines[0] || "")}" data-line2="${escapeHtml(textLines[1] || "")}" data-line3="${escapeHtml(textLines[2] || "")}" style="--pod-card-x:${xPct};--pod-card-y:${yPct};--pod-card-w:${widthPct};--pod-card-h:${heightPct};--pod-card-accent:${escapeHtml(style.accentColor || "#7c5cff")};--pod-card-bg:${escapeHtml(style.backgroundColor || "#0f172a")};--pod-card-text:${escapeHtml(style.textColor || "#f8fafc")};--pod-card-font-scale:${Math.max(0.65, Number(style.fontScale || 1) || 1)};--pod-card-exit-duration:${exitDurationMs}ms;z-index:${Math.max(1, Number(card.zIndex || 20) || 20)}">
      ${interactive ? `<button type="button" class="podcast-overlay-card-delete" data-action="overlay-card-delete" data-card-id="${escapeHtml(card.id)}" aria-label="Eliminar card">&times;</button>` : ""}
      ${interactive ? `<button type="button" class="podcast-overlay-card-edit-hit" data-action="overlay-card-edit" data-card-id="${escapeHtml(card.id)}" aria-label="Editar card"></button>` : ""}
      <div class="podcast-overlay-card-chrome" aria-hidden="true">
        <span class="podcast-overlay-card-sweep"></span>
        <span class="podcast-overlay-card-orb"></span>
        <span class="podcast-overlay-card-badge">${escapeHtml(styleMeta.badge)}</span>
      </div>
      <div class="podcast-overlay-card-copy">
        ${textLines.map((line, index) => `<span class="podcast-overlay-card-line${index === 0 ? " is-primary" : ""}">${escapeHtml(line)}</span>`).join("")}
      </div>
    </div>
  `;
}

export function renderPodcasterOverlayCardsForPreview(options = {}) {
  const container = options.containerEl || document.querySelector("#podcastVideoStage .podcast-video-preview");
  const layer = ensureLayer(container);
  if (!layer) return;
  const session = options.session || window.getActiveSession?.();
  const config = options.config || null;
  const currentMs = Math.max(0, Number(options.currentMs ?? window.podcastVideoState?.montageCursorMs ?? 0) || 0);
  const cards = Object.values(getCards(session, config))
    .map((card) => {
      const startMs = Number(card.startMs || 0);
      const endMs = startMs + Number(card.durationMs || 0);
      const active = currentMs >= startMs && currentMs <= endMs;
      const exitDelayMs = Math.max(0, Math.min(Number(card.durationMs || 0) || 0, Number(card.exitDelayMs ?? ((Number(card.durationMs || 0) || 0) - CARD_EXIT_WINDOW_MS)) || 0));
      const phase = active && currentMs >= (startMs + exitDelayMs) ? "exit" : "enter";
      return { card, active, phase };
    })
    .filter((item) => item.active)
    .sort((a, b) => Number(a.card.zIndex || 0) - Number(b.card.zIndex || 0));
  const signature = cards.map((item) => [
    item.card.id,
    item.phase,
    item.card.styleModel || "",
    item.card.animationPreset || "",
    String(item.card.exitDelayMs ?? ""),
    (item.card.textLines || []).join("~"),
    JSON.stringify(item.card.position || {}),
    JSON.stringify(item.card.style || {})
  ].join(":")).join("|");
  if (layer.dataset.cardsSignature === signature) return;
  layer.dataset.cardsSignature = signature;
  layer.classList.toggle("is-interactive", options.interactive !== false);
  layer.innerHTML = cards.map((item) => renderCard(item.card, {
    phase: item.phase,
    interactive: options.interactive !== false
  })).join("");
}

export function buildMontageOverlayCardSegments(session = null) {
  return {
    enabled: true,
    segments: Object.values(getCards(session))
  };
}

export function initPodcasterOverlayCardsEditor() {
  const preview = document.querySelector("#podcastVideoStage .podcast-video-preview");
  if (!preview) return;
  renderEditor();
  ensureLayer(preview);
  attachOverlayCardStageDrag(preview);
  renderCardList();
  document.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-action]")?.dataset?.action || "";
    if (action === "overlay-card-open") {
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel) {
        const timing = getActiveSceneTiming();
        const durationField = panel.querySelector('[data-field="durationMs"]');
        if (durationField) durationField.value = String(Math.max(500, Math.round(timing.durationMs || 4000)));
        resetOverlayCardEditor(panel);
        renderCardList();
        setOverlayCardEditorTab(panel, CARD_EDITOR_DEFAULT_TAB);
        renderOverlayCardEditorPreview(panel);
        panel.hidden = false;
      }
    } else if (action === "overlay-card-close") {
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel) panel.hidden = true;
    } else if (action === "overlay-card-save") {
      const session = window.getActiveSession?.();
      const cards = getCards(session);
      const card = buildCardFromEditor();
      saveCards({ ...cards, [card.id]: card });
      renderPodcasterOverlayCardsForPreview({ session, currentMs: card.startMs });
      renderCardList();
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel) {
        panel.hidden = true;
        overlayCardEditorState.editingCardId = null;
        syncOverlayCardEditorSaveAction(panel);
      }
    } else if (action === "overlay-card-edit") {
      if (Date.now() < Number(overlayCardEditorState.suppressEditUntil || 0)) return;
      event.preventDefault();
      const cardId = event.target?.closest?.("[data-card-id]")?.dataset?.cardId || "";
      const session = window.getActiveSession?.();
      const card = getCards(session)[cardId] || null;
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel && card) {
        loadCardIntoEditor(card, panel);
        renderCardList();
        setOverlayCardEditorTab(panel, CARD_EDITOR_DEFAULT_TAB);
        panel.hidden = false;
      }
    } else if (action === "overlay-card-delete") {
      event.preventDefault();
      deleteCard(event.target?.closest?.("[data-card-id]")?.dataset?.cardId || "");
    }
  });
  document.addEventListener("keydown", (event) => {
    const row = event.target?.closest?.('.podcast-overlay-card-list-item[data-action="overlay-card-edit"]');
    if (!row) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    row.click();
  });
  document.addEventListener("change", (event) => {
    const editor = event.target?.closest?.(".podcast-overlay-card-editor");
    if (!editor) return;
  const presetTarget = event.target?.closest?.('[data-field="preset"]');
  if (presetTarget) {
    applyEditorPresetFields(editor);
    return;
  }
    syncOverlayCardExitDelayField(editor);
    renderOverlayCardEditorPreview(editor);
  });
  document.addEventListener("input", (event) => {
    const editor = event.target?.closest?.(".podcast-overlay-card-editor");
    if (!editor) return;
    syncOverlayCardExitDelayField(editor);
    renderOverlayCardEditorPreview(editor);
  });
  document.addEventListener("click", (event) => {
    const editor = event.target?.closest?.(".podcast-overlay-card-editor");
    if (!editor) return;
    const tabBtn = event.target?.closest?.("[data-card-tab]");
    if (tabBtn) {
      setOverlayCardEditorTab(editor, tabBtn.dataset.cardTab || CARD_EDITOR_DEFAULT_TAB);
      return;
    }
    const styleBtn = event.target?.closest?.('[data-action="overlay-card-select-style"]');
    if (styleBtn) {
      const hiddenInput = editor.querySelector('[data-field="styleModel"]');
      if (hiddenInput) hiddenInput.value = styleBtn.dataset.styleModel || "lower-third-slab";
      overlayCardEditorState.styleModel = styleBtn.dataset.styleModel || "lower-third-slab";
      syncOverlayCardStyleSelection(editor);
      renderOverlayCardEditorPreview(editor);
      return;
    }
    const animBtn = event.target?.closest?.('[data-action="overlay-card-select-animation-preset"]');
    if (animBtn) {
      const presetKey = animBtn.dataset.animationPreset || "broadcast-soft";
      const preset = CARD_ANIMATION_PRESETS[presetKey] || CARD_ANIMATION_PRESETS["broadcast-soft"];
      const presetInput = editor.querySelector('[data-field="animationPreset"]');
      const enterSelect = editor.querySelector('[data-field="enterAnimation"]');
      const exitSelect = editor.querySelector('[data-field="exitAnimation"]');
      overlayCardEditorState.animationPreset = presetKey;
      if (presetInput) presetInput.value = presetKey;
      if (enterSelect) enterSelect.value = preset.enterAnimation;
      if (exitSelect) exitSelect.value = preset.exitAnimation;
      editor.querySelectorAll('[data-animation-preset]').forEach((node) => {
        node.classList.toggle("is-active", node.dataset.animationPreset === presetKey);
      });
      renderOverlayCardEditorPreview(editor);
    }
  });
  window.setInterval(() => renderPodcasterOverlayCardsForPreview(), 500);
  renderPodcasterOverlayCardsForPreview();
}

window.initPodcasterOverlayCardsEditor = initPodcasterOverlayCardsEditor;
window.renderPodcasterOverlayCardsForPreview = renderPodcasterOverlayCardsForPreview;
window.buildMontageOverlayCardSegments = buildMontageOverlayCardSegments;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPodcasterOverlayCardsEditor, { once: true });
} else {
  initPodcasterOverlayCardsEditor();
}
