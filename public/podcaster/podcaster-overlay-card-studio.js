import { isReelModeEnabled, REEL_ASPECT_RATIO_CSS, NORMAL_ASPECT_RATIO_CSS } from "./podcaster-reels.js";
import { createCardMotionTimeline, isPremiumCard } from "./podcaster-card-motion.js";
import { normalizeCardSceneWindow, cardSceneWindowFromTimeline } from "./podcaster-card-scene-window.js";
import { presentUnifiedToolModal } from "./podcaster-tool-modal-tabs.js?rev=2026-10-07.unified-tools-1";

const CARD_PRESETS = {
  "lower-third": {
    label: "Título",
    textLines: ["Título", "Subtítulo"],
    position: { xPct: 0.06, yPct: 0.66, widthPct: 0.56, heightPct: 0.2 },
    enterAnimation: "slide-left",
    styleModel: "editorial-lower-third",
    fields: [
      { key: "line1", label: "Título", value: "Título", placeholder: "Escribe el título" },
      { key: "line2", label: "Subtítulo", value: "Subtítulo", placeholder: "Escribe el subtítulo" }
    ]
  },
  "info-panel": {
    label: "Info",
    textLines: ["Dato importante", "Detalle breve para pantalla"],
    position: { xPct: 0.46, yPct: 0.14, widthPct: 0.46, heightPct: 0.3 },
    enterAnimation: "slide-right",
    styleModel: "frosted-glass",
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
    styleModel: "signal-premium",
    fields: [
      { key: "line1", label: "Llamado", value: "Llámanos", placeholder: "Texto de llamado" },
      { key: "line2", label: "Teléfono", value: "+52 000 000 0000", placeholder: "Teléfono o URL" }
    ]
  }
};

const CARD_STYLE_MODELS = {
  "editorial-lower-third": {
    label: "Editorial", description: "Tercio inferior con acento fino y jerarquía tipográfica.",
    badge: "Editorial", icon: "fas fa-align-left", family: "ocs-premium", sample: ["Título", "Subtítulo"]
  },
  "frosted-glass": {
    label: "Cristal", description: "Superficie translúcida con borde luminoso discreto.",
    badge: "Glass", icon: "far fa-square", family: "ocs-premium", sample: ["Información", "Detalle"]
  },
  "gradient-mesh": {
    label: "Aurora", description: "Color profundo y luz difusa para titulares.",
    badge: "Aurora", icon: "fas fa-palette", family: "ocs-premium", sample: ["Una idea", "Importante"]
  },
  "minimal-outline": {
    label: "Marco fino", description: "Contorno editorial sin peso visual excesivo.",
    badge: "Focus", icon: "far fa-square", family: "ocs-premium", sample: ["Dato", "Clave"]
  },
  "quote-premium": {
    label: "Cita", description: "Card para frases con comillas y acento elegante.",
    badge: "Quote", icon: "fas fa-quote-left", family: "ocs-premium", sample: ["Una frase", "que importa"]
  },
  "signal-premium": {
    label: "Llamada", description: "CTA compacto de alto contraste y acento dinámico.",
    badge: "Acción", icon: "fas fa-bullhorn", family: "ocs-premium", sample: ["Actúa hoy", "Más información"]
  },
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
  },
  "kinetic-rise": {
    label: "Ascenso cinético",
    description: "Entrada vertical con asentamiento suave.",
    enterAnimation: "slide-up",
    exitAnimation: "fade"
  },
  "editorial-reveal": {
    label: "Revelado",
    description: "Revelado lateral con ritmo editorial.",
    enterAnimation: "slide-right",
    exitAnimation: "slide-left"
  }
};

const CARD_EXIT_WINDOW_MS = 520;
const CARD_EDITOR_DEFAULT_TAB = "content";
const overlayCardEditorState = {
  tab: CARD_EDITOR_DEFAULT_TAB,
  styleModel: "editorial-lower-third",
  animationPreset: "broadcast-soft",
  editingCardId: null,
  suppressEditUntil: 0
};

const CARD_STYLE_GROUPS = [
  { label: "Diseños premium", models: ["editorial-lower-third", "frosted-glass", "gradient-mesh", "minimal-outline", "quote-premium", "signal-premium"] }
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
    .podcast-overlay-card-layer{position:absolute;inset:0;z-index:120;pointer-events:none}
    .podcast-overlay-card-layer.is-interactive{z-index:214748250;pointer-events:auto;touch-action:none}
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
  const s = session || window.getActiveSession?.();
  const cfg = getConfig(s, explicitConfig);
  const rawCards = cfg?.timelineOverlayCardsById
    || s?.timelineOverlayCardsById
    || s?.session?.podcastVideoConfig?.timelineOverlayCardsById
    || s?.session?.timelineOverlayCardsById
    || s?.payload?.podcastVideoConfig?.timelineOverlayCardsById
    || {};
  return normalizeCards(rawCards);
}

function getActiveSceneTiming(targetRowId = "") {
  const session = window.getActiveSession?.();
  const rowId = String(targetRowId || window.podcastVideoState?.activeRowId || "").trim();
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
  }), { persist: true, autosaveReason: "overlay-cards" });
  window.PodcasterUI?.syncPlaybackSession?.();
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
  const cards = { ...getCards(window.getActiveSession?.()) };
  if (!cards[cleanId]) return;
  delete cards[cleanId];
  saveCards(cards);
  document.querySelectorAll(`.podcast-overlay-card[data-card-id="${escapeCssIdent(cleanId)}"]`).forEach((node) => node.remove());
  renderCardList();
  renderPodcasterOverlayCardsForPreview({ session: window.getActiveSession?.(), currentMs: window.podcastVideoState?.montageCursorMs ?? 0 });
}

function buildCardFromEditor() {
  const panel = document.querySelector(".podcast-overlay-card-editor");
  const presetKey = panel?.querySelector('[data-field="preset"]')?.value || "lower-third";
  const preset = CARD_PRESETS[presetKey] || CARD_PRESETS["lower-third"];
  const styleModel = resolveOverlayCardEditorStyleModel(panel, preset.styleModel || overlayCardEditorState.styleModel || "lower-third-slab");
  const animationPreset = String(panel?.querySelector('[data-field="animationPreset"]')?.value || overlayCardEditorState.animationPreset || "broadcast-soft").trim() || "broadcast-soft";
  const existingCard = overlayCardEditorState.editingCardId
    ? getCards(window.getActiveSession?.())[overlayCardEditorState.editingCardId]
    : null;
  const { rowId, startMs, durationMs } = getActiveSceneTiming(existingCard?.rowId);
  const sceneWindow = normalizeCardSceneWindow({
    sceneDurationMs: durationMs,
    enterSec: panel?.querySelector('[data-field="sceneEnterSec"]')?.value,
    exitSec: panel?.querySelector('[data-field="sceneExitSec"]')?.value
  });
  const lines = (preset.fields || []).map((field) => panel?.querySelector(`[data-field="${field.key}"]`)?.value)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const id = overlayCardEditorState.editingCardId || `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const requestedDurationMs = sceneWindow.durationMs;
  const requestedExitDelayMs = Math.max(0, Number(panel?.querySelector('[data-field="exitDelayMs"]')?.value ?? (requestedDurationMs - CARD_EXIT_WINDOW_MS)) || 0);
  return {
    id,
    renderVersion: isPremiumCard(styleModel) ? 2 : 1,
    rowId,
    startMs: startMs + sceneWindow.enterMs,
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
      loopAnimation: isPremiumCard(styleModel) ? "none" : (panel?.querySelector('[data-field="loopAnimation"]')?.value || (CARD_STYLE_MODELS[styleModel]?.loopAnimation || "none"))
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
            <button type="button" class="podcast-overlay-card-style-option${value === "lower-third-slab" ? " is-active" : ""}" data-action="overlay-card-select-style" data-style-model="${value}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.description || item.label)}">
              <span class="podcast-overlay-card-style-thumb is-${value}">
                ${(item.sample || ["Título", ""]).map((line, index) => line ? `<span class="podcast-overlay-card-style-thumb-word${index === 0 ? " is-primary" : ""}">${escapeHtml(line)}</span>` : "").join("")}
              </span>
              <span class="podcast-overlay-card-style-copy">
                <i class="${escapeHtml(item.icon || 'fas fa-shapes')}" aria-hidden="true"></i>
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
            <strong>Editor de cards</strong>
            <span>Diseña y anima títulos para el montaje.</span>
          </div>
          <button type="button" data-action="overlay-card-close" aria-label="Cerrar">&times;</button>
        </header>
        <div class="podcast-overlay-card-modal-body">
          <aside class="podcast-overlay-card-sidebar" aria-label="Secciones del editor">
            <button type="button" class="podcast-overlay-card-tab is-active" data-card-tab="content">
              <i class="fas fa-pen-nib" aria-hidden="true"></i><span>Contenido</span>
            </button>
            <button type="button" class="podcast-overlay-card-tab" data-card-tab="models">
              <i class="fas fa-shapes" aria-hidden="true"></i><span>Diseño</span>
            </button>
            <button type="button" class="podcast-overlay-card-tab" data-card-tab="animation">
              <i class="fas fa-play-circle" aria-hidden="true"></i><span>Animación</span>
            </button>
          </aside>
          <div class="podcast-overlay-card-main">
            <div class="podcast-overlay-card-preview-stage"></div>
            <div class="podcast-overlay-card-preview-player snoopy-preview-player" role="group" aria-label="Reproducción de la animación de la card">
              <button type="button" data-action="overlay-card-preview-play" aria-label="Reproducir animación" title="Reproducir animación"><i class="fas fa-play" aria-hidden="true"></i></button>
              <input type="range" min="0" max="1000" step="1" value="163" data-role="card-preview-scrub" aria-label="Recorrer animación de la card">
              <output data-role="card-preview-time">0.7 / 4.0 s</output>
            </div>
            <div class="podcast-overlay-card-panels">
              <section class="podcast-overlay-card-panel is-active" data-card-panel="content">
                <div class="podcast-overlay-card-form">
                  <button type="button" class="podcast-overlay-card-scene-text" data-action="overlay-card-use-scene-text"><i class="fas fa-file-import" aria-hidden="true"></i><span>Usar «Texto dentro de la escena»</span></button>
                  <label>
                    <span><i class="fas fa-layer-group" aria-hidden="true"></i> Plantilla base</span>
                    <select data-field="preset" aria-label="Plantilla de card" hidden>
                      ${Object.entries(CARD_PRESETS).map(([value, item]) => `<option value="${value}">${escapeHtml(item.label)}</option>`).join("")}
                    </select>
                    <span class="podcast-overlay-card-choice-grid is-preset" role="group" aria-label="Plantilla de card">
                      <button type="button" data-card-select-choice="preset" data-card-choice="lower-third"><i class="fas fa-user-tag"></i><span>Título</span></button>
                      <button type="button" data-card-select-choice="preset" data-card-choice="info-panel"><i class="fas fa-info-circle"></i><span>Información</span></button>
                      <button type="button" data-card-select-choice="preset" data-card-choice="phone-cta"><i class="fas fa-phone-alt"></i><span>Llamada</span></button>
                    </span>
                  </label>
                  <div class="podcast-overlay-card-scene-window snoopy-scene-time" role="group" aria-label="Tiempo de la card dentro de la escena">
                    <span class="podcast-overlay-card-scene-window-head"><i class="fas fa-clock" aria-hidden="true"></i> Tiempo en escena <small data-role="card-scene-duration">4.0 s</small></span>
                    <div class="podcast-overlay-card-scene-window-fields">
                      <label><span><i class="fas fa-sign-in-alt" aria-hidden="true"></i> Entra (s)</span><input data-field="sceneEnterSec" type="number" min="0" step="0.1" value="0" aria-label="Segundo de la escena en que entra la card"></label>
                      <label><span><i class="fas fa-sign-out-alt" aria-hidden="true"></i> Sale (s)</span><input data-field="sceneExitSec" type="number" min="0.5" step="0.1" value="4" aria-label="Segundo de la escena en que desaparece la card"></label>
                    </div>
                    <div class="podcast-overlay-card-scene-window-rail" aria-hidden="true"><span></span></div>
                    <small>La entrada y salida se miden desde el inicio de esta escena.</small>
                    <input data-field="durationMs" type="hidden" value="4000">
                  </div>
                  <label data-field-row="line1">
                    <span data-label-for="line1">Texto principal</span>
                    <input data-field="line1" type="text" value="Título" aria-label="Título">
                  </label>
                  <label data-field-row="line2">
                    <span data-label-for="line2">Texto secundario</span>
                    <input data-field="line2" type="text" value="Subtítulo" aria-label="Subtítulo">
                  </label>
                  <label data-field-row="line3">
                    <span data-label-for="line3">Texto adicional</span>
                    <input data-field="line3" type="text" placeholder="Detalle opcional" aria-label="Texto adicional">
                  </label>
                  <label>
                    <span><i class="fas fa-palette" aria-hidden="true"></i> Acento</span>
                    <span class="podcast-overlay-card-choice-grid is-color" role="group" aria-label="Color de acento">
                      <button type="button" data-card-accent="#38bdf8" style="--choice-color:#38bdf8"><i class="fas fa-circle"></i><span>Cian</span></button>
                      <button type="button" data-card-accent="#7c5cff" style="--choice-color:#7c5cff"><i class="fas fa-circle"></i><span>Violeta</span></button>
                      <button type="button" data-card-accent="#34d399" style="--choice-color:#34d399"><i class="fas fa-circle"></i><span>Menta</span></button>
                      <button type="button" data-card-accent="#fb7185" style="--choice-color:#fb7185"><i class="fas fa-circle"></i><span>Coral</span></button>
                    </span>
                    <span class="podcast-overlay-card-custom-color"><i class="fas fa-eye-dropper" aria-hidden="true"></i> Color propio <input data-field="accentColor" type="color" value="#7c5cff" aria-label="Color personalizado de acento" title="Color personalizado"></span>
                  </label>
                  <label>
                    <span><i class="fas fa-text-height" aria-hidden="true"></i> Tamaño letra</span>
                    <span class="podcast-overlay-card-choice-grid is-font-size" role="group" aria-label="Tamaño de letra">
                      <button type="button" data-card-font-scale="0.85"><i class="fas fa-font"></i><span>Pequeña</span></button>
                      <button type="button" data-card-font-scale="1"><i class="fas fa-font"></i><span>Normal</span></button>
                      <button type="button" data-card-font-scale="1.3"><i class="fas fa-font"></i><span>Grande</span></button>
                    </span>
                    <input data-field="fontScale" type="range" min="0.7" max="1.8" step="0.05" value="1" aria-label="Tamaño de letra">
                  </label>
                  <div class="podcast-overlay-card-placement" role="group" aria-label="Posición de la card">
                    <span><i class="fas fa-arrows-alt" aria-hidden="true"></i> Posición</span>
                    <div class="podcast-overlay-card-choice-grid is-placement">
                      <button type="button" data-card-placement="lower-left"><i class="fas fa-arrow-down"></i><span>Abajo izq.</span></button>
                      <button type="button" data-card-placement="lower-right"><i class="fas fa-arrow-down"></i><span>Abajo der.</span></button>
                      <button type="button" data-card-placement="center"><i class="fas fa-crosshairs"></i><span>Centro</span></button>
                      <button type="button" data-card-placement="upper-right"><i class="fas fa-arrow-up"></i><span>Arriba der.</span></button>
                    </div>
                  </div>
                  <label>
                    <span><i class="fas fa-sync" aria-hidden="true"></i> Animación continua</span>
                    <select data-field="loopAnimation" aria-label="Animación continua" hidden>
                      <option value="none">Sin animación</option>
                      <option value="breathe">Respirar</option>
                      <option value="float">Flotar</option>
                      <option value="glow">Glow</option>
                      <option value="jitter-soft">Jitter</option>
                      <option value="type">Typing</option>
                      <option value="orbit">Orbit</option>
                      <option value="zoom">Zoom</option>
                    </select>
                    <span class="podcast-overlay-card-choice-grid is-loop" role="group" aria-label="Animación continua">
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="none"><i class="fas fa-pause"></i><span>Fija</span></button>
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="breathe"><i class="fas fa-wind"></i><span>Respirar</span></button>
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="float"><i class="fas fa-water"></i><span>Flotar</span></button>
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="glow"><i class="fas fa-sun"></i><span>Brillo</span></button>
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="jitter-soft"><i class="fas fa-bolt"></i><span>Vibrar</span></button>
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="type"><i class="fas fa-keyboard"></i><span>Escribir</span></button>
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="orbit"><i class="fas fa-circle-notch"></i><span>Órbita</span></button>
                      <button type="button" data-card-select-choice="loopAnimation" data-card-choice="zoom"><i class="fas fa-search-plus"></i><span>Zoom</span></button>
                    </span>
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
                <input type="hidden" data-field="styleModel" value="editorial-lower-third">
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
                    <button type="button" class="podcast-overlay-card-animation-option${value === "broadcast-soft" ? " is-active" : ""}" data-action="overlay-card-select-animation-preset" data-animation-preset="${value}" title="${escapeHtml(item.description)}" aria-label="${escapeHtml(item.label)}. ${escapeHtml(item.description)}">
                      <i class="fas fa-magic" aria-hidden="true"></i>
                      <strong>${escapeHtml(item.label)}</strong>
                    </button>
                  `).join("")}
                </div>
                <div class="podcast-overlay-card-form is-animation-form">
                  <label>
                    <span><i class="fas fa-sign-in-alt" aria-hidden="true"></i> Entrada</span>
                    <select data-field="enterAnimation" aria-label="Animación de entrada" hidden>
                      <option value="slide-left">Desde izquierda</option>
                      <option value="slide-right">Desde derecha</option>
                      <option value="slide-up">Desde arriba</option>
                      <option value="slide-down">Desde abajo</option>
                      <option value="fade">Fade</option>
                    </select>
                    <span class="podcast-overlay-card-choice-grid" role="group" aria-label="Animación de entrada">
                      <button type="button" data-card-select-choice="enterAnimation" data-card-choice="slide-left"><i class="fas fa-arrow-right"></i><span>Izquierda</span></button>
                      <button type="button" data-card-select-choice="enterAnimation" data-card-choice="slide-right"><i class="fas fa-arrow-left"></i><span>Derecha</span></button>
                      <button type="button" data-card-select-choice="enterAnimation" data-card-choice="slide-up"><i class="fas fa-arrow-up"></i><span>Arriba</span></button>
                      <button type="button" data-card-select-choice="enterAnimation" data-card-choice="slide-down"><i class="fas fa-arrow-down"></i><span>Abajo</span></button>
                      <button type="button" data-card-select-choice="enterAnimation" data-card-choice="fade"><i class="fas fa-adjust"></i><span>Fundido</span></button>
                    </span>
                  </label>
                  <label>
                    <span><i class="fas fa-sign-out-alt" aria-hidden="true"></i> Salida</span>
                    <select data-field="exitAnimation" aria-label="Animación de salida" hidden>
                      <option value="fade">Salida fade</option>
                      <option value="slide-left">Sale izquierda</option>
                      <option value="slide-right">Sale derecha</option>
                      <option value="slide-up">Sale arriba</option>
                      <option value="slide-down">Sale abajo</option>
                    </select>
                    <span class="podcast-overlay-card-choice-grid" role="group" aria-label="Animación de salida">
                      <button type="button" data-card-select-choice="exitAnimation" data-card-choice="fade"><i class="fas fa-adjust"></i><span>Fundido</span></button>
                      <button type="button" data-card-select-choice="exitAnimation" data-card-choice="slide-left"><i class="fas fa-arrow-left"></i><span>Izquierda</span></button>
                      <button type="button" data-card-select-choice="exitAnimation" data-card-choice="slide-right"><i class="fas fa-arrow-right"></i><span>Derecha</span></button>
                      <button type="button" data-card-select-choice="exitAnimation" data-card-choice="slide-up"><i class="fas fa-arrow-up"></i><span>Arriba</span></button>
                      <button type="button" data-card-select-choice="exitAnimation" data-card-choice="slide-down"><i class="fas fa-arrow-down"></i><span>Abajo</span></button>
                    </span>
                  </label>
                  <label>
                    <span><i class="fas fa-stopwatch" aria-hidden="true"></i> Inicio del efecto de salida (ms desde que entra)</span>
                    <input data-field="exitDelayMs" type="number" min="0" step="100" value="3480" aria-label="Milisegundos desde que entra la card hasta que inicia el efecto de salida">
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
  arrangeOverlayCardEditor(host);
  document.body.appendChild(host);
  host.querySelectorAll('[data-card-tab]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      setOverlayCardEditorTab(host, button.dataset.cardTab || CARD_EDITOR_DEFAULT_TAB);
      requestAnimationFrame(() => renderOverlayCardEditorPreview(host));
    });
  });
  applyEditorPresetFields(host);
  attachOverlayCardPreviewDrag(host);
  renderOverlayCardEditorPreview(host);
}

function arrangeOverlayCardEditor(host) {
  const body = host.querySelector('.podcast-overlay-card-modal-body');
  const main = host.querySelector('.podcast-overlay-card-main');
  const sidebar = host.querySelector('.podcast-overlay-card-sidebar');
  const content = host.querySelector('[data-card-panel="content"]');
  const models = host.querySelector('[data-card-panel="models"]');
  const animation = host.querySelector('[data-card-panel="animation"]');
  const preview = host.querySelector('.podcast-overlay-card-preview-stage');
  const previewPlayer = host.querySelector('.podcast-overlay-card-preview-player');
  const form = content?.querySelector('.podcast-overlay-card-form');
  if (!body || !main || !content || !models || !animation || !preview || !previewPlayer || !form) return;

  sidebar?.remove();
  host.querySelector('.podcast-overlay-card-panels')?.remove();
  const column = (className, label) => {
    const node = document.createElement('section');
    node.className = `podcast-overlay-card-column ${className}`;
    node.setAttribute('aria-label', label);
    return node;
  };
  const details = (title, className, open = true) => {
    const node = document.createElement('details');
    node.className = `podcast-overlay-card-accordion ${className}`;
    node.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    const inner = document.createElement('div');
    inner.className = 'podcast-overlay-card-accordion-content';
    node.append(summary, inner);
    return { node, inner };
  };
  const left = column('is-content', 'Contenido y texto');
  const center = column('is-preview', 'Vista previa y tiempo en escena');
  const right = column('is-effects', 'Diseño, animación y efectos');
  const textGroup = details('Texto', 'is-text');
  const typographyGroup = details('Formato de texto', 'is-typography', false);
  const designGroup = details('Diseño y posición', 'is-design');
  const animationGroup = details('Animación y efectos', 'is-animation');

  const take = (selector) => {
    const node = form.querySelector(selector);
    if (node) node.remove();
    return node;
  };
  const takeLabel = (selector) => {
    const label = form.querySelector(selector)?.closest('label');
    if (label) label.remove();
    return label;
  };
  const sceneText = take('[data-action="overlay-card-use-scene-text"]');
  const preset = takeLabel('[data-field="preset"]');
  if (preset) textGroup.inner.append(preset);
  if (sceneText) textGroup.inner.append(sceneText);
  ['line1', 'line2', 'line3'].forEach((key) => {
    const row = take(`[data-field-row="${key}"]`);
    if (row) textGroup.inner.append(row);
  });
  const accent = takeLabel('[data-field="accentColor"]');
  const font = takeLabel('[data-field="fontScale"]');
  if (accent) typographyGroup.inner.append(accent);
  if (font) typographyGroup.inner.append(font);
  const placement = take('.podcast-overlay-card-placement');
  if (placement) designGroup.inner.append(placement);
  const loop = takeLabel('[data-field="loopAnimation"]');
  if (loop) animationGroup.inner.append(loop);
  const timing = take('.podcast-overlay-card-scene-window');
  const positionFields = Array.from(form.querySelectorAll('input[type="hidden"][data-field^="position"]'));
  positionFields.forEach((field) => field.remove());
  positionFields.forEach((field) => left.append(field));

  models.classList.add('is-active');
  animation.classList.add('is-active');
  const styleGrid = models.querySelector('.podcast-overlay-card-style-grid');
  if (styleGrid) designGroup.inner.append(styleGrid);
  const styleModelField = models.querySelector('[data-field="styleModel"]');
  if (styleModelField) right.append(styleModelField);
  const animationPresets = animation.querySelector('.podcast-overlay-card-animation-presets');
  const animationForm = animation.querySelector('.podcast-overlay-card-form');
  if (animationPresets) animationGroup.inner.append(animationPresets);
  if (animationForm) animationGroup.inner.append(animationForm);

  left.append(textGroup.node, typographyGroup.node);
  const cardList = content.querySelector('.podcast-overlay-card-list');
  const hint = content.querySelector('.podcast-overlay-card-position-hint');
  if (hint) left.append(hint);
  if (cardList) left.append(cardList);
  center.append(preview, previewPlayer);
  if (timing) {
    const handles = document.createElement('div');
    handles.className = 'podcast-overlay-card-scene-window-double snoopy-double-range';
    handles.setAttribute('role', 'group');
    handles.setAttribute('aria-label', 'Ajustar entrada y salida de la card');
    handles.innerHTML = '<input type="range" min="0" max="4" step="0.1" value="0" data-card-scene-handle="enter" aria-label="Entrada de la card"><input type="range" min="0.5" max="4" step="0.1" value="4" data-card-scene-handle="exit" aria-label="Salida de la card">';
    const rail = timing.querySelector('.podcast-overlay-card-scene-window-rail');
    const values = document.createElement('div');
    values.className = 'snoopy-scene-time-values';
    values.innerHTML = '<span>Entrada <output data-role="card-scene-enter-value">0.0 s</output></span><span>Salida <output data-role="card-scene-exit-value">4.0 s</output></span>';
    rail?.replaceWith(values, handles);
    const fields = timing.querySelector('.podcast-overlay-card-scene-window-fields');
    if (fields) fields.hidden = true;
    center.append(timing);
  }
  right.append(designGroup.node, animationGroup.node);
  main.replaceChildren(left, center, right);
  main.classList.add('is-three-column');
  body.classList.add('has-three-column-card-editor');
  content.classList.add('is-card-library');
  setOverlayCardEditorTab(host, CARD_EDITOR_DEFAULT_TAB);
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
  overlayCardEditorState.styleModel = CARD_PRESETS["lower-third"]?.styleModel || "editorial-lower-third";
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
  const sceneTiming = getActiveSceneTiming(card.rowId);
  const sceneWindow = cardSceneWindowFromTimeline(card, sceneTiming.startMs, sceneTiming.durationMs);
  const sceneEnterInput = panel.querySelector('[data-field="sceneEnterSec"]');
  const sceneExitInput = panel.querySelector('[data-field="sceneExitSec"]');
  if (sceneEnterInput) sceneEnterInput.value = String(sceneWindow.enterMs / 1000);
  if (sceneExitInput) sceneExitInput.value = String(sceneWindow.exitMs / 1000);
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
  syncOverlayCardSceneWindowFields(panel);
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
  syncOverlayCardSceneWindowFields(panel);
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
    renderVersion: isPremiumCard(styleModel) ? 2 : 1,
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
      loopAnimation: isPremiumCard(styleModel) ? "none" : (panel.querySelector('[data-field="loopAnimation"]')?.value || (CARD_STYLE_MODELS[styleModel]?.loopAnimation || "none"))
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
  const loopInput = panel.querySelector('[data-field="loopAnimation"]');
  if (loopInput) {
    loopInput.closest('label').hidden = isPremiumCard(styleModel);
    if (isPremiumCard(styleModel)) loopInput.value = 'none';
  }
  panel.querySelectorAll("[data-style-model]").forEach((node) => {
    const active = node.dataset.styleModel === styleModel;
    node.classList.toggle("is-active", active);
    node.setAttribute('aria-pressed', String(active));
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
    const active = node.dataset.animationPreset === presetKey;
    node.classList.toggle("is-active", active);
    node.setAttribute('aria-pressed', String(active));
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

function syncOverlayCardSceneWindowFields(panel = document.querySelector(".podcast-overlay-card-editor"), { resetExitAnimation = false } = {}) {
  if (!panel) return;
  const existingCard = overlayCardEditorState.editingCardId
    ? getCards(window.getActiveSession?.())[overlayCardEditorState.editingCardId]
    : null;
  const timing = getActiveSceneTiming(existingCard?.rowId);
  const enterInput = panel.querySelector('[data-field="sceneEnterSec"]');
  const exitInput = panel.querySelector('[data-field="sceneExitSec"]');
  const durationInput = panel.querySelector('[data-field="durationMs"]');
  const exitDelayInput = panel.querySelector('[data-field="exitDelayMs"]');
  if (!enterInput || !exitInput || !durationInput) return;
  const previousDurationMs = Math.max(500, Number(durationInput.value) || 4000);
  const previousExitDelayMs = Math.max(0, Number(exitDelayInput?.value) || 0);
  const exitAnimationWindowMs = resetExitAnimation
    ? CARD_EXIT_WINDOW_MS
    : Math.max(120, previousDurationMs - previousExitDelayMs);
  const window = normalizeCardSceneWindow({
    sceneDurationMs: timing.durationMs,
    enterSec: enterInput.value,
    exitSec: exitInput.value
  });
  enterInput.value = String(window.enterMs / 1000);
  enterInput.max = String((window.sceneDurationMs - 500) / 1000);
  exitInput.value = String(window.exitMs / 1000);
  exitInput.min = String((window.enterMs + 500) / 1000);
  exitInput.max = String(window.sceneDurationMs / 1000);
  durationInput.value = String(window.durationMs);
  if (exitDelayInput) exitDelayInput.value = String(Math.max(0, window.durationMs - exitAnimationWindowMs));
  const durationLabel = panel.querySelector('[data-role="card-scene-duration"]');
  if (durationLabel) durationLabel.textContent = `${(window.sceneDurationMs / 1000).toFixed(1)} s`;
  const enterLabel = panel.querySelector('[data-role="card-scene-enter-value"]');
  const exitLabel = panel.querySelector('[data-role="card-scene-exit-value"]');
  if (enterLabel) enterLabel.textContent = `${(window.enterMs / 1000).toFixed(1)} s`;
  if (exitLabel) exitLabel.textContent = `${(window.exitMs / 1000).toFixed(1)} s`;
  const rail = panel.querySelector('.podcast-overlay-card-scene-window-rail span');
  if (rail) {
    rail.style.left = `${window.enterMs / window.sceneDurationMs * 100}%`;
    rail.style.width = `${window.durationMs / window.sceneDurationMs * 100}%`;
  }
  const doubleRange = panel.querySelector('.podcast-overlay-card-scene-window-double');
  const enterHandle = doubleRange?.querySelector('[data-card-scene-handle="enter"]');
  const exitHandle = doubleRange?.querySelector('[data-card-scene-handle="exit"]');
  if (enterHandle && exitHandle && doubleRange) {
    const sceneSeconds = window.sceneDurationMs / 1000;
    enterHandle.max = String(Math.max(0, sceneSeconds - 0.5));
    enterHandle.value = String(window.enterMs / 1000);
    exitHandle.max = String(sceneSeconds);
    exitHandle.min = String((window.enterMs + 500) / 1000);
    exitHandle.value = String(window.exitMs / 1000);
    doubleRange.style.setProperty('--range-start', `${window.enterMs / window.sceneDurationMs * 100}%`);
    doubleRange.style.setProperty('--range-end', `${window.exitMs / window.sceneDurationMs * 100}%`);
  }
  return window;
}

function setOverlayCardEditorTab(panel = document.querySelector(".podcast-overlay-card-editor"), tab = CARD_EDITOR_DEFAULT_TAB) {
  if (!panel) return;
  overlayCardEditorState.tab = tab;
  panel.dataset.activeTab = tab;
  panel.querySelectorAll("[data-card-panel]").forEach((node) => node.classList.add("is-active"));
}

function setOverlayCardEditorPreviewAspect(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const session = window.getActiveSession?.() || null;
  const aspect = isReelModeEnabled(session) ? REEL_ASPECT_RATIO_CSS : NORMAL_ASPECT_RATIO_CSS;
  panel.style.setProperty("--pod-editor-preview-aspect", aspect);
}

function syncOverlayCardEditorPreviewScale(panel = document.querySelector(".podcast-overlay-card-editor")) {
  if (!panel) return;
  const ratio = isReelModeEnabled(window.getActiveSession?.()) ? 9 / 16 : 16 / 9;
  panel.querySelectorAll(".podcast-overlay-card-preview-stage, .podcast-overlay-card-models-preview-stage").forEach((stage) => {
    const parent = stage.parentElement;
    const style = parent ? getComputedStyle(parent) : null;
    const availableWidth = (parent?.clientWidth || 0) - (parseFloat(style?.paddingLeft) || 0) - (parseFloat(style?.paddingRight) || 0);
    const timing = parent?.querySelector(':scope > .podcast-overlay-card-scene-window');
    const player = parent?.querySelector(':scope > .podcast-overlay-card-preview-player');
    const rowGap = parseFloat(style?.rowGap) || 0;
    const rowCount = Number(Boolean(timing)) + Number(Boolean(player));
    const availableHeight = (parent?.clientHeight || 0) - (parseFloat(style?.paddingTop) || 0) - (parseFloat(style?.paddingBottom) || 0) - (timing?.offsetHeight || 0) - (player?.offsetHeight || 0) - rowGap * rowCount;
    if (availableWidth > 0 && availableHeight > 0) {
      const width = Math.min(availableWidth, availableHeight * ratio);
      stage.style.width = `${Math.floor(width)}px`;
      stage.style.height = `${Math.floor(width / ratio)}px`;
    } else {
      stage.style.width = "";
      stage.style.height = "";
    }
    stage.style.maxWidth = "100%";
    stage.style.zoom = "";
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
  if (!panel || panel.hidden) return;
  const accentValue = String(panel.querySelector('[data-field="accentColor"]')?.value || '').toLowerCase();
  const fontScaleValue = Number(panel.querySelector('[data-field="fontScale"]')?.value || 1);
  panel.querySelectorAll('[data-card-accent], [data-card-font-scale], [data-card-placement]').forEach((button) => {
    const active = button.dataset.cardAccent ? button.dataset.cardAccent.toLowerCase() === accentValue
      : button.dataset.cardFontScale ? Math.abs(Number(button.dataset.cardFontScale) - fontScaleValue) < 0.01
      : button.dataset.cardPlacement === panel.dataset.cardPlacement;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  panel.querySelectorAll('[data-card-select-choice]').forEach((button) => {
    const value = panel.querySelector(`[data-field="${button.dataset.cardSelectChoice}"]`)?.value;
    const active = button.dataset.cardChoice === value;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  setOverlayCardEditorPreviewAspect(panel);
  syncOverlayCardEditorPreviewScale(panel);
  const draft = getOverlayCardEditorDraft(panel);
  if (!draft) return;
  overlayCardPreviewDurationSec = Math.max(0.5, Number(draft.durationMs || 4000) / 1000);
  overlayCardPreviewTimeSec = Math.min(overlayCardPreviewTimeSec, overlayCardPreviewDurationSec);
  const sourceStage = document.querySelector('#podcastVideoStage .podcast-video-preview');
  const sourceMedia = Array.from(sourceStage?.querySelectorAll('.podcast-active-speaker-video:not(.podcast-active-speaker-video-backdrop), .podcast-active-speaker-image') || [])
    .find((item) => !item.hidden && item.getBoundingClientRect().width > 1 && (item.currentSrc || item.src));
  panel.querySelectorAll(".podcast-overlay-card-preview-stage, .podcast-overlay-card-models-preview-stage").forEach((stage) => {
    if (stage.closest('.podcast-overlay-card-models-preview')?.getClientRects().length === 0) return;
    const previousCard = stage.querySelector('.podcast-overlay-card');
    previousCard?.__cardMotion?.kill?.();
    if (stage.classList.contains("podcast-overlay-card-preview-stage")) overlayCardPreviewMotion = null;
    previousCard?.remove();
    stage.insertAdjacentHTML('beforeend', renderCard(draft, { interactive: false, phase: "enter", preview: true }));
    if (sourceMedia && sourceStage) {
      const src = sourceMedia.currentSrc || sourceMedia.src;
      let media = stage.querySelector('.podcast-overlay-card-preview-media');
      if (!media || media.tagName !== sourceMedia.tagName || media.getAttribute('src') !== src) {
        media?.remove();
        media = document.createElement(sourceMedia.tagName.toLowerCase());
        media.className = 'podcast-overlay-card-preview-media';
        media.src = src;
        stage.prepend(media);
      }
      if (media.tagName === 'VIDEO' && media.readyState === 0) {
        media.muted = true;
        media.playsInline = true;
        media.preload = 'metadata';
        const sourceTime = Number(sourceMedia.currentTime || 0);
        media.addEventListener('loadedmetadata', () => { try { media.currentTime = sourceTime; } catch (_) { /* media may be a stream */ } }, { once: true });
      } else if (media.tagName === 'IMG') media.alt = '';
      // The source media can be letterboxed or positioned by the stage layout.
      // Copying its viewport rectangle into this editor stage offsets/crops the
      // background (notably leaving a large empty band above it). Fit the media
      // to the card preview frame and center it instead.
      media.style.left = "0";
      media.style.top = "0";
      media.style.width = "100%";
      media.style.height = "100%";
      media.style.objectFit = getComputedStyle(sourceMedia).objectFit || "contain";
      media.style.objectPosition = "center center";
    } else stage.querySelector('.podcast-overlay-card-preview-media')?.remove();
    const cardEl = stage.querySelector('.podcast-overlay-card[data-render-version="2"]');
    if (cardEl && window.gsap) {
      cardEl.__cardMotion = createCardMotionTimeline({ gsap: window.gsap, element: cardEl, card: draft });
      if (stage.classList.contains("podcast-overlay-card-preview-stage")) {
        overlayCardPreviewMotion = cardEl.__cardMotion;
        overlayCardPreviewMotion.seek(overlayCardPreviewTimeSec);
      } else cardEl.__cardMotion.seek(Math.min(0.65, cardEl.__cardMotion.durationSec));
    }
  });
  syncOverlayCardPreviewPlayer(panel);
}

let overlayCardPreviewFrame = 0;
let overlayCardPreviewMotion = null;
let overlayCardPreviewPlaying = false;
let overlayCardPreviewFrameId = 0;
let overlayCardPreviewStartedAt = 0;
let overlayCardPreviewTimeSec = 0.65;
let overlayCardPreviewDurationSec = 4;
let overlayCardPreviewUserScrubbed = false;

function syncOverlayCardPreviewPlayer(panel) {
  const scrub = panel?.querySelector('[data-role="card-preview-scrub"]');
  const time = panel?.querySelector('[data-role="card-preview-time"]');
  const button = panel?.querySelector('[data-action="overlay-card-preview-play"]');
  if (scrub) scrub.value = String(Math.round(overlayCardPreviewTimeSec / Math.max(0.5, overlayCardPreviewDurationSec) * 1000));
  if (time) time.textContent = `${overlayCardPreviewTimeSec.toFixed(1)} / ${overlayCardPreviewDurationSec.toFixed(1)} s`;
  if (button) {
    button.innerHTML = `<i class="fas fa-${overlayCardPreviewPlaying ? "pause" : "play"}" aria-hidden="true"></i>`;
    button.setAttribute("aria-label", overlayCardPreviewPlaying ? "Pausar animación" : "Reproducir animación");
    button.setAttribute("aria-pressed", String(overlayCardPreviewPlaying));
    button.title = button.getAttribute("aria-label");
  }
}

function stopOverlayCardPreview(reset = false) {
  overlayCardPreviewPlaying = false;
  if (overlayCardPreviewFrameId) cancelAnimationFrame(overlayCardPreviewFrameId);
  overlayCardPreviewFrameId = 0;
  if (reset) {
    overlayCardPreviewTimeSec = Math.min(0.65, overlayCardPreviewDurationSec);
    overlayCardPreviewUserScrubbed = false;
  }
  overlayCardPreviewMotion?.seek?.(overlayCardPreviewTimeSec);
  syncOverlayCardPreviewPlayer(document.querySelector(".podcast-overlay-card-editor"));
}

function tickOverlayCardPreview(now) {
  if (!overlayCardPreviewPlaying) return;
  overlayCardPreviewTimeSec = Math.min(overlayCardPreviewDurationSec, Math.max(0, (now - overlayCardPreviewStartedAt) / 1000));
  overlayCardPreviewMotion?.seek?.(overlayCardPreviewTimeSec);
  const panel = document.querySelector(".podcast-overlay-card-editor");
  syncOverlayCardPreviewPlayer(panel);
  if (overlayCardPreviewTimeSec >= overlayCardPreviewDurationSec) {
    stopOverlayCardPreview();
    return;
  }
  overlayCardPreviewFrameId = requestAnimationFrame(tickOverlayCardPreview);
}

function toggleOverlayCardPreview(panel) {
  if (!overlayCardPreviewMotion) renderOverlayCardEditorPreview(panel);
  if (!overlayCardPreviewMotion) return;
  if (overlayCardPreviewPlaying) { stopOverlayCardPreview(); return; }
  if (overlayCardPreviewTimeSec >= overlayCardPreviewDurationSec || !overlayCardPreviewUserScrubbed) overlayCardPreviewTimeSec = 0;
  overlayCardPreviewPlaying = true;
  overlayCardPreviewStartedAt = performance.now() - overlayCardPreviewTimeSec * 1000;
  overlayCardPreviewMotion.seek(overlayCardPreviewTimeSec);
  syncOverlayCardPreviewPlayer(panel);
  overlayCardPreviewFrameId = requestAnimationFrame(tickOverlayCardPreview);
}

function scheduleOverlayCardEditorPreview(panel) {
  if (!panel || panel.hidden || overlayCardPreviewFrame) return;
  stopOverlayCardPreview(true);
  overlayCardPreviewFrame = requestAnimationFrame(() => {
    overlayCardPreviewFrame = 0;
    renderOverlayCardEditorPreview(panel);
  });
}

function clampEditorValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function attachOverlayCardStageDrag(container = document.querySelector("#podcastVideoStage .podcast-video-preview")) {
  if (!container || container.dataset.overlayCardStageDragReady === "true") return;
  container.dataset.overlayCardStageDragReady = "true";
  let dragState = null;
  const getCardFromEvent = (event) => event.target?.closest?.(".podcast-overlay-card");
  container.addEventListener("pointerdown", (event) => {
    const layer = event.target?.closest?.(".podcast-overlay-card-layer.is-interactive");
    if (!layer) return;
    const deleteBtn = event.target?.closest?.(".podcast-overlay-card-delete");
    const card = getCardFromEvent(event);
    if (!card || !layer) return;
    if (deleteBtn) return;
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
    layer.setPointerCapture?.(event.pointerId);
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
    panel.dataset.cardPlacement = '';
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

function openOverlayCardEditorById(cardId = "") {
  const key = String(cardId || "").trim();
  const session = window.getActiveSession?.();
  const card = key ? getCards(session)[key] : null;
  const panel = document.querySelector(".podcast-overlay-card-editor");
  if (!panel || !card) return false;
  loadCardIntoEditor(card, panel);
  renderCardList();
  setOverlayCardEditorTab(panel, CARD_EDITOR_DEFAULT_TAB);
  panel.hidden = false;
  presentUnifiedToolModal("cards", panel, getActiveSceneTiming().rowId);
  requestAnimationFrame(() => renderOverlayCardEditorPreview(panel));
  return true;
}

function openNewOverlayCardEditor() {
  const panel = document.querySelector(".podcast-overlay-card-editor");
  if (!panel) return false;
  const timing = getActiveSceneTiming();
  resetOverlayCardEditor(panel);
  const enterField = panel.querySelector('[data-field="sceneEnterSec"]');
  const exitField = panel.querySelector('[data-field="sceneExitSec"]');
  if (enterField) enterField.value = "0";
  if (exitField) exitField.value = String(timing.durationMs / 1000);
  syncOverlayCardSceneWindowFields(panel, { resetExitAnimation: true });
  renderCardList();
  setOverlayCardEditorTab(panel, CARD_EDITOR_DEFAULT_TAB);
  panel.hidden = false;
  presentUnifiedToolModal("cards", panel, timing.rowId);
  requestAnimationFrame(() => renderOverlayCardEditorPreview(panel));
  return true;
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

export function renderCard(card, options = {}) {
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
    <div class="podcast-overlay-card is-${escapeHtml(card.preset || "lower-third")}${phase === "exit" && !isPremiumCard(styleModel) ? " is-exiting" : ""}" data-card-id="${escapeHtml(card.id)}" data-render-version="${isPremiumCard(styleModel) ? 2 : 1}" data-style-model="${escapeHtml(styleModel)}" data-style-family="${escapeHtml(styleMeta.family || "panel")}" data-loop-animation="${escapeHtml(style.loopAnimation || styleMeta.loopAnimation || "none")}" data-enter-animation="${escapeHtml(card.enterAnimation || "slide-left")}" data-exit-animation="${escapeHtml(exitAnimation)}" data-phase="${phase}" data-line1="${escapeHtml(textLines[0] || "")}" data-line2="${escapeHtml(textLines[1] || "")}" data-line3="${escapeHtml(textLines[2] || "")}" style="--pod-card-x:${xPct};--pod-card-y:${yPct};--pod-card-w:${widthPct};--pod-card-h:${heightPct};--pod-card-accent:${escapeHtml(style.accentColor || "#7c5cff")};--pod-card-bg:${escapeHtml(style.backgroundColor || "#0f172a")};--pod-card-text:${escapeHtml(style.textColor || "#f8fafc")};--pod-card-font-scale:${Math.max(0.65, Number(style.fontScale || 1) || 1)};--pod-card-exit-duration:${exitDurationMs}ms;z-index:${Math.max(1, Number(card.zIndex || 20) || 20)}">
      ${interactive ? `<button type="button" class="podcast-overlay-card-delete" data-action="overlay-card-delete" data-card-id="${escapeHtml(card.id)}" aria-label="Eliminar card">&times;</button>` : ""}
      ${interactive ? `<button type="button" class="podcast-overlay-card-edit-hit" data-action="overlay-card-edit" data-card-id="${escapeHtml(card.id)}" aria-label="Editar card"></button>` : ""}
      <div class="podcast-overlay-card-chrome" aria-hidden="true">
        <span class="podcast-overlay-card-sweep"></span>
        <span class="podcast-overlay-card-orb"></span>
        ${isPremiumCard(styleModel) ? '' : `<span class="podcast-overlay-card-badge">${escapeHtml(styleMeta.badge)}</span>`}
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
  // Export playback must remain a passive composition surface. The editor's
  // interactive layer spans the whole stage and otherwise intercepts preview
  // controls and pointer input while the timeline advances.
  const interactive = options.interactive !== false && !container.matches?.(".montage-export-preview-container");
  layer.classList.toggle("is-interactive", interactive);
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
  const signature = `${interactive ? "interactive" : "passive"}|${cards.map((item) => [
    item.card.id,
    item.phase,
    item.card.styleModel || "",
    item.card.animationPreset || "",
    String(item.card.exitDelayMs ?? ""),
    (item.card.textLines || []).join("~"),
    JSON.stringify(item.card.position || {}),
    JSON.stringify(item.card.style || {})
  ].join(":")).join("|")}`;
  if (layer.dataset.cardsSignature !== signature) {
    layer.dataset.cardsSignature = signature;
    layer.innerHTML = cards.map((item) => renderCard(item.card, {
      phase: item.phase,
      interactive
    })).join("");
  }
  cards.forEach(({ card }) => {
    if (!isPremiumCard(card.styleModel) || !window.gsap) return;
    const node = Array.from(layer.querySelectorAll('.podcast-overlay-card[data-render-version="2"]'))
      .find((item) => item.dataset.cardId === card.id);
    if (!node) return;
    if (!node.__cardMotion) node.__cardMotion = createCardMotionTimeline({ gsap: window.gsap, element: node, card });
    node.__cardMotion.seek((currentMs - Number(card.startMs || 0)) / 1000);
  });
}

export function buildMontageOverlayCardSegments(session = null) {
  const cards = Object.values(getCards(session)).map((card) => {
    if (!card || typeof card !== "object") return card;
    const textLines = Array.isArray(card.textLines) && card.textLines.length
      ? card.textLines
      : (Array.isArray(card.fields) ? card.fields.map((f) => f?.value || "").filter(Boolean) : []);
    return {
      ...card,
      textLines: textLines.length ? textLines : (Array.isArray(card.lines) ? card.lines : [])
    };
  });
  return {
    enabled: cards.length > 0,
    segments: cards
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
    if (action === "overlay-card-preview-play") {
      toggleOverlayCardPreview(document.querySelector(".podcast-overlay-card-editor"));
    } else if (action === "overlay-card-open") {
      openNewOverlayCardEditor();
    } else if (action === "overlay-card-use-scene-text") {
      const panel = document.querySelector(".podcast-overlay-card-editor");
      const session = window.getActiveSession?.();
      const rowId = getActiveSceneTiming().rowId;
      const row = session?.script?.rows?.find((item) => String(item?.id) === String(rowId));
      const liveField = Array.from(document.querySelectorAll('[data-field="inSceneText"][data-row-id]'))
        .find((input) => input.dataset.rowId === rowId);
      const sceneText = String(liveField?.value || row?.inSceneText || "").trim();
      if (panel && sceneText) {
        const fields = Array.from(panel.querySelectorAll('[data-field-row]:not([hidden]) [data-field^="line"]'));
        const lines = sceneText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        fields.forEach((field, index) => { field.value = index === fields.length - 1 ? lines.slice(index).join(' ') : (lines[index] || ''); });
        if (fields.length === 1) fields[0].value = lines.join(' ');
        renderOverlayCardEditorPreview(panel);
      } else if (panel) {
        const button = panel.querySelector('[data-action="overlay-card-use-scene-text"] span');
        if (button) button.textContent = 'Esta escena no tiene texto';
      }
    } else if (action === "overlay-card-close") {
      const panel = document.querySelector(".podcast-overlay-card-editor");
      stopOverlayCardPreview(true);
      if (panel) panel.hidden = true;
    } else if (action === "overlay-card-save") {
      stopOverlayCardPreview(true);
      const session = window.getActiveSession?.();
      const cards = getCards(session);
      const card = buildCardFromEditor();
      saveCards({ ...cards, [card.id]: card });
      const previewAtMs = card.startMs + Math.min(650, Math.max(150, card.durationMs / 4));
      if (window.podcastVideoState?.montageActive !== true) window.podcastVideoState.montageCursorMs = previewAtMs;
      renderPodcasterOverlayCardsForPreview({ session: window.getActiveSession?.(), currentMs: previewAtMs });
      renderCardList();
      const panel = document.querySelector(".podcast-overlay-card-editor");
      if (panel) {
        panel.hidden = true;
        overlayCardEditorState.editingCardId = null;
        syncOverlayCardEditorSaveAction(panel);
      }
    } else if (action === "timeline-edit-overlay-card") {
      event.preventDefault();
      const button = event.target?.closest?.('[data-action="timeline-edit-overlay-card"]');
      const rowId = String(button?.dataset?.rowId || "").trim();
      if (rowId) window.PodcasterUI?.selectTimelineSceneRow?.(rowId, { syncStage: false });
      openOverlayCardEditorById(button?.dataset?.cardId || "");
    } else if (action === "overlay-card-edit") {
      if (Date.now() < Number(overlayCardEditorState.suppressEditUntil || 0)) return;
      event.preventDefault();
      const cardId = event.target?.closest?.("[data-card-id]")?.dataset?.cardId || "";
      openOverlayCardEditorById(cardId);
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
    if (event.target?.matches?.('[data-field="preset"]')) {
      applyEditorPresetFields(editor);
      return;
    }
    if (event.target?.matches?.('[data-field="sceneEnterSec"], [data-field="sceneExitSec"]')) {
      syncOverlayCardSceneWindowFields(editor);
    } else syncOverlayCardExitDelayField(editor);
    scheduleOverlayCardEditorPreview(editor);
  });
  document.addEventListener("input", (event) => {
    const editor = event.target?.closest?.(".podcast-overlay-card-editor");
    if (!editor) return;
    if (event.target?.matches?.('[data-role="card-preview-scrub"]')) {
      stopOverlayCardPreview();
      overlayCardPreviewTimeSec = Number(event.target.value) / 1000 * overlayCardPreviewDurationSec;
      overlayCardPreviewUserScrubbed = true;
      overlayCardPreviewMotion?.seek?.(overlayCardPreviewTimeSec);
      syncOverlayCardPreviewPlayer(editor);
      return;
    }
    const sceneHandle = event.target?.closest?.('[data-card-scene-handle]');
    if (sceneHandle) {
      const fieldName = sceneHandle.dataset.cardSceneHandle === 'enter' ? 'sceneEnterSec' : 'sceneExitSec';
      const field = editor.querySelector(`[data-field="${fieldName}"]`);
      if (field) field.value = sceneHandle.value;
      syncOverlayCardSceneWindowFields(editor);
      scheduleOverlayCardEditorPreview(editor);
      return;
    }
    if (event.target?.matches?.('[data-field="sceneEnterSec"], [data-field="sceneExitSec"]')) {
      if (event.target.value === '' || /[.-]$/.test(event.target.value)) return;
      syncOverlayCardSceneWindowFields(editor);
    } else syncOverlayCardExitDelayField(editor);
    scheduleOverlayCardEditorPreview(editor);
  });
  document.querySelector('.podcast-overlay-card-editor')?.addEventListener("click", (event) => {
    const editor = event.target?.closest?.(".podcast-overlay-card-editor");
    if (!editor) return;
    const choice = event.target?.closest?.('[data-card-select-choice]');
    if (choice) {
      const select = editor.querySelector(`[data-field="${choice.dataset.cardSelectChoice}"]`);
      if (select) {
        select.value = choice.dataset.cardChoice || '';
        if (choice.dataset.cardSelectChoice === 'preset') applyEditorPresetFields(editor);
        renderOverlayCardEditorPreview(editor);
      }
      return;
    }
    const accentChoice = event.target?.closest?.('[data-card-accent]');
    if (accentChoice) { editor.querySelector('[data-field="accentColor"]').value = accentChoice.dataset.cardAccent; renderOverlayCardEditorPreview(editor); return; }
    const fontChoice = event.target?.closest?.('[data-card-font-scale]');
    if (fontChoice) { editor.querySelector('[data-field="fontScale"]').value = fontChoice.dataset.cardFontScale; renderOverlayCardEditorPreview(editor); return; }
    const placementChoice = event.target?.closest?.('[data-card-placement]');
    if (placementChoice) {
      const width = Number(editor.querySelector('[data-field="positionWidthPct"]')?.value || 0.56);
      const height = Number(editor.querySelector('[data-field="positionHeightPct"]')?.value || 0.2);
      const placement = placementChoice.dataset.cardPlacement;
      const x = placement === 'lower-right' || placement === 'upper-right' ? 0.94 - width : placement === 'center' ? (1 - width) / 2 : 0.06;
      const y = placement === 'center' ? (1 - height) / 2 : placement === 'upper-right' ? 0.08 : 0.94 - height;
      editor.querySelector('[data-field="positionXPct"]').value = String(Math.max(0, x));
      editor.querySelector('[data-field="positionYPct"]').value = String(Math.max(0, y));
      editor.dataset.cardPlacement = placement;
      renderOverlayCardEditorPreview(editor);
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
  window.setInterval(() => {
    if (document.hidden) return;
    renderPodcasterOverlayCardsForPreview();
  }, 1000);
  renderPodcasterOverlayCardsForPreview();
}

window.PodcasterOverlayCardsEditor = { openNew: openNewOverlayCardEditor, openById: openOverlayCardEditorById };

window.initPodcasterOverlayCardsEditor = initPodcasterOverlayCardsEditor;
window.renderPodcasterOverlayCardsForPreview = renderPodcasterOverlayCardsForPreview;
window.buildMontageOverlayCardSegments = buildMontageOverlayCardSegments;

if (!window.__podcasterCardExportRender) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPodcasterOverlayCardsEditor, { once: true });
  } else {
    initPodcasterOverlayCardsEditor();
  }
}
