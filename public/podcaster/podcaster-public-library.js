import { authFetchJson, hasAvailableApiBase } from "../js/api-client-podcaster.js?v=2026-1.0.10.537";
import { requirePodcasterPublicLibraryRuntime } from "./podcaster-runtime-registry.js";
import { dataUrlToFile, uploadPodcasterAsset } from "./podcaster-resumable-upload.js?v=2026-08-06.1";

const runtime = requirePodcasterPublicLibraryRuntime();

// --- State ---
const podcastSceneLibraryState = {
  items: [],
  loading: false,
  loadedAt: "",
  error: "",
  filters: {
    query: "",
    tagColor: "all"
  }
};

const podcastSceneInsertModalState = {
  open: false,
  libraryItem: null,
  selectedInsertIndex: 0
};

const podcastSceneLibraryEditModalState = {
  open: false,
  item: null
};
const sceneLibraryMarkupCache = new WeakMap();

function updateSceneLibraryMarkup(markup = "") {
  const target = runtime.els.podcastSceneLibraryList;
  if (!target || sceneLibraryMarkupCache.get(target) === markup) return false;
  target.innerHTML = markup;
  sceneLibraryMarkupCache.set(target, markup);
  return true;
}

// --- Constants ---
const PODCAST_LIBRARY_TAG_COLORS = [
  { value: "slate", label: "Slate" },
  { value: "red", label: "Rojo" },
  { value: "amber", label: "Ámbar" },
  { value: "emerald", label: "Emerald" },
  { value: "sky", label: "Sky" },
  { value: "violet", label: "Violeta" },
  { value: "pink", label: "Rosa" }
];

const VIDEO_SCENE_MIN_SEC = 1;
const VIDEO_SCENE_MAX_SEC = 600;
const STUDIO_TIMELINE_MIN_CLIP_MS = 100;
const STUDIO_TIMELINE_TRACK_VERSION = 1;
const STUDIO_TIMELINE_VERSION = 1;

// --- Helpers ---
function getPodcastLibraryTagColorMeta(color = "") {
  const key = String(color || "slate").trim().toLowerCase();
  return PODCAST_LIBRARY_TAG_COLORS.find((item) => item.value === key) || PODCAST_LIBRARY_TAG_COLORS[0];
}

function getPodcastLibraryTagColorStyle(color = "") {
  const key = String(color || "slate").trim().toLowerCase();
  const palette = {
    slate: { bg: "#94a3b8", text: "#e2e8f0", border: "#64748b" },
    red: { bg: "#ef4444", text: "#fee2e2", border: "#b91c1c" },
    amber: { bg: "#f59e0b", text: "#fffbeb", border: "#d97706" },
    emerald: { bg: "#10b981", text: "#ecfdf5", border: "#059669" },
    sky: { bg: "#38bdf8", text: "#eff6ff", border: "#0284c7" },
    violet: { bg: "#8b5cf6", text: "#f5f3ff", border: "#7c3aed" },
    pink: { bg: "#ec4899", text: "#fdf2f8", border: "#db2777" }
  };
  return palette[key] || palette.slate;
}

function filterPodcastSceneLibraryItems(items = []) {
  const query = String(podcastSceneLibraryState.filters?.query || "").trim().toLowerCase();
  const tagColor = String(podcastSceneLibraryState.filters?.tagColor || "all").trim().toLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item) return false;
    if (tagColor !== "all" && String(item.tagColor || "slate").trim().toLowerCase() !== tagColor) return false;
    if (!query) return true;
    const haystack = [
      item.title,
      item.tagLabel,
      item.sceneDescription,
      item.voiceOverText,
      item.videoDirective,
      item.scenePrompt,
      item.ownerEmail
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    return haystack.includes(query);
  });
}

function getSessionRows(session = null) {
  if (typeof runtime.getSessionRows === "function") {
    const rows = runtime.getSessionRows(session);
    return Array.isArray(rows) ? rows : [];
  }
  const directRows = session?.script?.rows;
  return Array.isArray(directRows) ? directRows : [];
}

async function fetchPodcastSceneLibrary(options = {}) {
  podcastSceneLibraryState.loading = true;
  if (options.render !== false) renderPodcastSceneLibrary(runtime.getActiveSession());
  try {
    const response = await authFetchJson("/api/podcaster/scene-library/list", { method: "GET" });
    podcastSceneLibraryState.items = Array.isArray(response?.items)
      ? response.items.map((item) => runtime.normalizePodcastSceneLibraryItem(item)).filter(Boolean)
      : [];
    podcastSceneLibraryState.loadedAt = runtime.nowIso();
    podcastSceneLibraryState.error = "";
  } catch (error) {
    podcastSceneLibraryState.error = String(error?.message || "No se pudo cargar la librería pública de escenas.");
  } finally {
    podcastSceneLibraryState.loading = false;
    if (options.render !== false) renderPodcastSceneLibrary(runtime.getActiveSession());
  }
  return podcastSceneLibraryState.items;
}

function renderPodcastSceneLibrary(session = null) {
  if (!runtime.els.podcastSceneLibraryList) return;
  closePodcastSceneLibraryMenu();
  const activeSession = session || runtime.getActiveSession();
  const activeRowId = String(runtime.podcastVideoState?.activeRowId || "").trim();
  const rows = getSessionRows(activeSession);
  const insertIndex = rows.findIndex((row) => String(row?.id || "").trim() === activeRowId);
  const defaultInsertIndex = insertIndex >= 0 ? insertIndex + 1 : rows.length;
  const filteredItems = filterPodcastSceneLibraryItems(podcastSceneLibraryState.items);
  if (runtime.els.refreshPodcastSceneLibraryBtn) {
    runtime.els.refreshPodcastSceneLibraryBtn.disabled = podcastSceneLibraryState.loading === true;
  }
  if (runtime.els.uploadLocalPodcastSceneBtn) {
    runtime.els.uploadLocalPodcastSceneBtn.disabled = podcastSceneLibraryState.loading === true;
  }
  if (runtime.els.podcastSceneLibrarySearchInput) {
    const value = String(podcastSceneLibraryState.filters?.query || "");
    if (String(runtime.els.podcastSceneLibrarySearchInput.value || "") !== value) {
      runtime.els.podcastSceneLibrarySearchInput.value = value;
    }
  }
  if (runtime.els.podcastSceneLibraryColorFilterSelect) {
    const value = String(podcastSceneLibraryState.filters?.tagColor || "all");
    if (String(runtime.els.podcastSceneLibraryColorFilterSelect.value || "") !== value) {
      runtime.els.podcastSceneLibraryColorFilterSelect.value = value;
    }
  }
  if (podcastSceneLibraryState.loading) {
    updateSceneLibraryMarkup(`<div class="podcast-scene-library-empty">Cargando librería pública...</div>`);
    return;
  }
  if (podcastSceneLibraryState.error) {
    updateSceneLibraryMarkup(`<div class="podcast-scene-library-empty">${runtime.escapeHtml(podcastSceneLibraryState.error)}</div>`);
    return;
  }
  if (!podcastSceneLibraryState.items.length) {
    updateSceneLibraryMarkup(`<div class="podcast-scene-library-empty">No hay escenas públicas todavía. Publica una escena para verla aquí.</div>`);
    return;
  }
  if (!filteredItems.length) {
    updateSceneLibraryMarkup(`<div class="podcast-scene-library-empty">No se encontraron escenas con esos filtros.</div>`);
    return;
  }
  const nextMarkup = filteredItems.map((item) => {
    const title = String(item.title || "Escena pública").trim() || "Escena pública";
    const duration = runtime.secondsToClock(Math.max(VIDEO_SCENE_MIN_SEC, Number(item.durationSec) || VIDEO_SCENE_MIN_SEC));
    const thumbUrl = String(item.thumbUrl || item.downloadUrl || "").trim();
    const tagLabel = String(item.tagLabel || "").trim();
    const tagMeta = getPodcastLibraryTagColorMeta(item.tagColor);
    const tagStyle = getPodcastLibraryTagColorStyle(item.tagColor);
    return `
      <article class="podcast-scene-library-card" data-library-id="${runtime.escapeHtml(item.libraryId)}">
        <div class="podcast-scene-library-thumb">
          ${thumbUrl
        ? `<img src="SnoopyPodcastCreator.png" data-library-thumb="${runtime.escapeHtml(thumbUrl)}" alt="${runtime.escapeHtml(title)}" loading="lazy">`
        : `<div class="podcast-scene-library-thumb-empty">Sin miniatura</div>`}
        </div>
        <div class="podcast-scene-library-copy">
          <div class="podcast-scene-library-title-row">
            <strong title="${runtime.escapeHtml(title)}">${runtime.escapeHtml(runtime.trimWords(title, 8) || title)}</strong>
            <div class="podcast-scene-library-title-actions">
              ${tagLabel || tagMeta ? `
                <span class="podcast-scene-library-tag" title="${runtime.escapeHtml(tagLabel || tagMeta.label)}" aria-label="${runtime.escapeHtml(tagLabel || tagMeta.label)}" style="background:${runtime.escapeHtml(tagStyle.bg)};border-color:${runtime.escapeHtml(tagStyle.border)};box-shadow:0 0 0 1px rgba(255,255,255,0.26) inset, 0 0 0 1px ${runtime.escapeHtml(tagStyle.border)};"></span>` : ""}
              <button class="row-icon-btn podcast-scene-library-menu-btn" type="button" data-action="toggle-podcast-scene-library-menu" data-library-id="${runtime.escapeHtml(item.libraryId)}" aria-haspopup="menu" aria-expanded="false" title="Más opciones" aria-label="Más opciones">
                <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <span class="podcast-scene-library-meta">${runtime.escapeHtml(duration)}${item.ownerEmail ? ` · ${runtime.escapeHtml(item.ownerEmail)}` : ""}</span>
          <p>${runtime.escapeHtml(runtime.trimWords(item.sceneDescription || item.voiceOverText || item.videoDirective || title, 12) || "Escena pública reutilizable.")}</p>
        </div>
      </article>
    `;
  }).join("");
  if (updateSceneLibraryMarkup(nextMarkup)) {
    runtime.attachPodcastLibraryThumbnailLoading();
  }
}

function getPodcastSceneLibraryMenuPortal() {
  let portal = document.getElementById("podcastSceneLibraryMenuPortal");
  if (portal) return portal;
  portal = document.createElement("div");
  portal.id = "podcastSceneLibraryMenuPortal";
  portal.className = "podcast-scene-library-actions-portal";
  portal.setAttribute("aria-hidden", "false");
  document.body.appendChild(portal);
  return portal;
}

function closePodcastSceneLibraryMenu() {
  const portal = document.getElementById("podcastSceneLibraryMenuPortal");
  [portal].filter(Boolean).forEach((target) => {
    target.innerHTML = "";
    delete target.dataset.openLibraryId;
    target.classList.remove("is-open");
  });
  if (runtime.els.podcastSceneLibraryList) {
    runtime.els.podcastSceneLibraryList
      .querySelectorAll("[data-action='toggle-podcast-scene-library-menu'][aria-expanded='true']")
      .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
  }
}

function buildPodcastSceneLibraryMenuHtml(item, defaultInsertIndex) {
  const libraryId = String(item?.libraryId || "").trim();
  const insertIndex = Math.max(0, Math.round(runtime.toFiniteNumber(defaultInsertIndex, 0)));
  return `
    <div class="podcast-scene-library-menu is-visible" role="menu" aria-label="Acciones de escena" data-library-id="${runtime.escapeHtml(libraryId)}">
      <button class="row-icon-btn" type="button" role="menuitem" data-action="play-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" title="Reproducir en el preview" aria-label="Reproducir en el preview">
        <i class="fas fa-play"></i>
      </button>
      <button class="row-icon-btn" type="button" role="menuitem" data-action="edit-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" title="Editar datos" aria-label="Editar datos">
        <i class="fas fa-pen"></i>
      </button>
      <button class="row-icon-btn" type="button" role="menuitem" data-action="delete-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" title="Eliminar de la biblioteca" aria-label="Eliminar de la biblioteca">
        <i class="fas fa-trash"></i>
      </button>
      <button class="row-icon-btn" type="button" role="menuitem" data-action="insert-public-scene" data-library-id="${runtime.escapeHtml(libraryId)}" data-insert-index="${insertIndex}" title="Insertar en el timeline" aria-label="Insertar en el timeline">
        <i class="fas fa-plus"></i>
      </button>
    </div>
  `;
}

function openPodcastSceneLibraryMenu(item, anchorEl, defaultInsertIndex) {
  if (!item || !anchorEl) return;
  runtime.closePodcastTimelineClipMenu();
  closePodcastSceneLibraryMenu();
  const libraryId = String(item.libraryId || "").trim();
  if (!libraryId) return;
  const portal = getPodcastSceneLibraryMenuPortal();
  const menuHtml = buildPodcastSceneLibraryMenuHtml(item, defaultInsertIndex);
  portal.innerHTML = menuHtml;
  const menu = portal.querySelector(".podcast-scene-library-menu");
  if (!menu) return;
  const anchorRect = anchorEl.getBoundingClientRect();
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
  const gap = 10;
  const margin = 8;
  menu.style.visibility = "hidden";
  menu.style.left = "0px";
  menu.style.top = "0px";
  portal.classList.add("is-open");
  const menuRect = menu.getBoundingClientRect();
  let left = Math.round(anchorRect.right - menuRect.width);
  left = Math.max(margin, Math.min(viewportW - menuRect.width - margin, left));
  let top = Math.round(anchorRect.bottom + gap);
  if (top + menuRect.height > viewportH - margin) {
    top = Math.round(anchorRect.top - menuRect.height - gap);
  }
  top = Math.max(margin, Math.min(viewportH - menuRect.height - margin, top));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "";
  portal.dataset.openLibraryId = libraryId;
  const toggleBtn = anchorEl.closest(".podcast-scene-library-card")?.querySelector("[data-action='toggle-podcast-scene-library-menu'][data-library-id]") || anchorEl;
  toggleBtn?.setAttribute("aria-expanded", "true");
}

function buildPodcastSceneInsertPositions(session = null) {
  const activeSession = session || runtime.getActiveSession();
  const rows = getSessionRows(activeSession);
  if (!rows.length) {
    return [{
      insertIndex: 0,
      label: "Al inicio del timeline",
      detail: "Se insertará como la primera escena."
    }];
  }
  const positions = [{
    insertIndex: 0,
    label: "Antes de la escena 1",
    detail: "Se insertará antes de la primera escena."
  }];
  for (let index = 0; index < rows.length - 1; index += 1) {
    positions.push({
      insertIndex: index + 1,
      label: `Entre escena ${index + 1} y ${index + 2}`,
      detail: "Se insertará entre ambas escenas."
    });
  }
  positions.push({
    insertIndex: rows.length,
    label: "Al final del timeline",
    detail: "Se insertará después de la última escena."
  });
  return positions;
}

function renderPodcastSceneInsertModal() {
  if (!runtime.els.podcastSceneInsertModal) return;
  const open = podcastSceneInsertModalState.open === true && Boolean(podcastSceneInsertModalState.libraryItem);
  if (!open) {
    runtime.els.podcastSceneInsertModal.hidden = true;
    return;
  }
  const item = podcastSceneInsertModalState.libraryItem;
  const session = runtime.getActiveSession();
  const positions = buildPodcastSceneInsertPositions(session);
  const currentIndex = Math.max(0, Math.min(positions.length - 1, Math.round(runtime.toFiniteNumber(podcastSceneInsertModalState.selectedInsertIndex, positions[positions.length - 1]?.insertIndex ?? 0))));
  podcastSceneInsertModalState.selectedInsertIndex = positions[currentIndex]?.insertIndex ?? 0;
  if (runtime.els.podcastSceneInsertTitle) {
    runtime.els.podcastSceneInsertTitle.textContent = `Insertar “${String(item?.title || "Escena pública").trim()}”`;
  }
  if (runtime.els.podcastSceneInsertHint) {
    runtime.els.podcastSceneInsertHint.textContent = "Elige dónde colocar la escena en el timeline. También puedes crear un track nuevo para dejarla en otra fila.";
  }
  if (runtime.els.podcastSceneInsertList) {
    const rows = getSessionRows(session);
    const timelineItems = [];
    for (let insertIndex = 0; insertIndex <= rows.length; insertIndex += 1) {
      const selected = Number(insertIndex) === Number(podcastSceneInsertModalState.selectedInsertIndex);
      const destinationLabel = rows.length === 0
        ? "Insertar como primera escena"
        : insertIndex === 0
          ? "Antes de Escena 1"
          : insertIndex === rows.length
            ? `Después de Escena ${rows.length}`
            : `Entre Escena ${insertIndex} y ${insertIndex + 1}`;
      timelineItems.push(`
        <button type="button"
          class="podcast-scene-insert-slot${selected ? " is-selected" : ""}"
          data-action="select-scene-insert-position"
          data-insert-index="${runtime.escapeHtml(insertIndex)}"
          data-tooltip="${runtime.escapeHtml(destinationLabel)}"
          aria-label="${runtime.escapeHtml(destinationLabel)}"
          title="${runtime.escapeHtml(destinationLabel)}">
          <i class="fas fa-random" aria-hidden="true"></i>
        </button>
      `);
      if (insertIndex < rows.length) {
        const row = rows[insertIndex] || {};
        const sceneSummary = String(
          row.title
          || row.dialogue
          || row.script
          || row.sceneDescription
          || row.description
          || `Escena ${insertIndex + 1}`
        ).trim();
        timelineItems.push(`
          <article class="podcast-scene-insert-card" aria-label="Escena ${insertIndex + 1}">
            <div class="podcast-scene-insert-card-preview">
              <img src="SnoopyPodcastCreator.png" alt="" loading="lazy">
            </div>
            <div class="podcast-scene-insert-card-copy">
              <strong>Escena ${insertIndex + 1} · Narrador</strong>
              <span>${runtime.escapeHtml(sceneSummary)}</span>
            </div>
          </article>
        `);
      }
    }
    runtime.els.podcastSceneInsertList.innerHTML = timelineItems.join("");
  }
  if (runtime.els.confirmPodcastSceneInsertBtn) {
    runtime.els.confirmPodcastSceneInsertBtn.disabled = !item;
  }
  if (runtime.els.confirmPodcastSceneInsertNewTrackBtn) {
    runtime.els.confirmPodcastSceneInsertNewTrackBtn.disabled = !item;
  }
  runtime.els.podcastSceneInsertModal.hidden = false;
}

function setPodcastSceneInsertModalOpen(isOpen = false, item = null, selectedInsertIndex = null) {
  podcastSceneInsertModalState.open = Boolean(isOpen) && Boolean(item);
  podcastSceneInsertModalState.libraryItem = podcastSceneInsertModalState.open ? runtime.normalizePodcastSceneLibraryItem(item) : null;
  const session = runtime.getActiveSession();
  const rows = getSessionRows(session);
  const fallbackIndex = rows.length;
  const nextIndex = Number.isFinite(Number(selectedInsertIndex))
    ? Math.max(0, Math.min(rows.length, Math.round(Number(selectedInsertIndex))))
    : fallbackIndex;
  podcastSceneInsertModalState.selectedInsertIndex = nextIndex;
  if (!podcastSceneInsertModalState.open && runtime.els.podcastSceneInsertModal) {
    runtime.els.podcastSceneInsertModal.hidden = true;
  }
  renderPodcastSceneInsertModal();
}

function closePodcastSceneInsertModal() {
  podcastSceneInsertModalState.open = false;
  podcastSceneInsertModalState.libraryItem = null;
  podcastSceneInsertModalState.selectedInsertIndex = 0;
  if (runtime.els.podcastSceneInsertModal) {
    runtime.els.podcastSceneInsertModal.hidden = true;
  }
}

function createPodcastSceneInsertFlightGhost(item = null) {
  const panel = runtime.els.podcastSceneInsertModal?.querySelector?.(".podcast-scene-insert-panel");
  if (!panel) return null;
  const rect = panel.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const sourceX = rect.left + (rect.width / 2);
  const sourceY = rect.top + (rect.height / 2);
  const root = document.createElement("div");
  root.className = "podcast-scene-insert-vector-flight";
  root.setAttribute("aria-hidden", "true");
  root.dataset.sourceX = String(sourceX);
  root.dataset.sourceY = String(sourceY);
  root.innerHTML = `
    <svg class="podcast-scene-insert-flight-path" width="100%" height="100%" aria-hidden="true">
      <path fill="none" stroke="var(--studio-accent, #60a5fa)" stroke-width="3"
        stroke-linecap="round" stroke-dasharray="8 12" opacity=".72"></path>
    </svg>
    <div class="podcast-scene-insert-flight-symbol">
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
        <defs>
          <linearGradient id="sceneInsertVectorGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#38bdf8"></stop>
            <stop offset=".52" stop-color="#3b82f6"></stop>
            <stop offset="1" stop-color="#8b5cf6"></stop>
          </linearGradient>
          <filter id="sceneInsertVectorGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur"></feGaussianBlur>
            <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
          </filter>
        </defs>
        <circle class="scene-insert-vector-orbit is-outer" cx="60" cy="60" r="50"
          fill="none" stroke="url(#sceneInsertVectorGradient)" stroke-width="3" stroke-dasharray="18 10"></circle>
        <circle class="scene-insert-vector-orbit is-inner" cx="60" cy="60" r="39"
          fill="rgba(37,99,235,.16)" stroke="#7dd3fc" stroke-width="2" stroke-dasharray="6 8"></circle>
        <rect x="35" y="39" width="50" height="42" rx="8" fill="url(#sceneInsertVectorGradient)"
          filter="url(#sceneInsertVectorGlow)"></rect>
        <path d="M45 51h30M45 60h22M45 69h27" fill="none" stroke="#fff" stroke-width="4"
          stroke-linecap="round"></path>
        <path class="scene-insert-vector-arrow" d="M81 60h20m-8-8 8 8-8 8" fill="none"
          stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
      <span>${runtime.escapeHtml(String(item?.title || "Nueva escena").trim() || "Nueva escena")}</span>
    </div>
    <div class="podcast-scene-insert-flight-burst" aria-hidden="true">
      <svg viewBox="-90 -90 180 180" width="180" height="180">
        <circle class="scene-insert-burst-ring is-outer" cx="0" cy="0" r="34"
          fill="none" stroke="#38bdf8" stroke-width="4"></circle>
        <circle class="scene-insert-burst-ring is-inner" cx="0" cy="0" r="22"
          fill="none" stroke="#a78bfa" stroke-width="5"></circle>
        ${Array.from({ length: 12 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 12;
          const x = Math.cos(angle) * 24;
          const y = Math.sin(angle) * 24;
          return `<circle class="scene-insert-burst-particle" data-angle="${angle}" cx="${x}" cy="${y}" r="${index % 3 === 0 ? 5 : 3.5}" fill="${index % 2 === 0 ? "#38bdf8" : "#a78bfa"}"></circle>`;
        }).join("")}
      </svg>
    </div>
  `;
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483646",
    overflow: "hidden"
  });
  const pathSvg = root.querySelector(".podcast-scene-insert-flight-path");
  Object.assign(pathSvg.style, { position: "absolute", inset: "0", overflow: "visible" });
  const symbol = root.querySelector(".podcast-scene-insert-flight-symbol");
  Object.assign(symbol.style, {
    position: "absolute",
    left: "-60px",
    top: "-60px",
    width: "120px",
    display: "grid",
    justifyItems: "center",
    color: "var(--studio-accent-contrast, #f8fafc)",
    fontSize: "12px",
    fontWeight: "600",
    textShadow: "0 2px 12px rgba(15,23,42,.8)",
    willChange: "transform, opacity"
  });
  const label = symbol.querySelector("span");
  Object.assign(label.style, {
    maxWidth: "150px",
    marginTop: "-4px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  });
  const burst = root.querySelector(".podcast-scene-insert-flight-burst");
  Object.assign(burst.style, {
    position: "absolute",
    left: "-90px",
    top: "-90px",
    width: "180px",
    height: "180px",
    opacity: "0",
    visibility: "hidden",
    willChange: "transform, opacity"
  });
  document.body.appendChild(root);
  return { element: root, sourceRect: rect };
}

function findInsertedTimelineSceneElement(rowId = "") {
  const safeRowId = String(rowId || "").trim();
  if (!safeRowId) return null;
  const escapedRowId = CSS.escape(safeRowId);
  const selector = (
    `.podcast-video-timeline-clip[data-row-id="${escapedRowId}"], `
    + `.podcast-video-timeline-item[data-row-id="${escapedRowId}"], `
    + `.podcast-video-clip-body[data-row-id="${escapedRowId}"]`
  );
  return runtime.els.podcastVideoTimeline?.querySelector?.(selector)
    || document.querySelector(selector);
}

async function animatePodcastSceneInsertToTimeline(flight = null, rowId = "") {
  const root = flight?.element;
  if (!root) return;
  const removeFlight = () => root.remove();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const target = findInsertedTimelineSceneElement(rowId);
  if (!target) {
    removeFlight();
    return;
  }
  target.style.visibility = "hidden";
  target.style.opacity = "0";
  const revealTarget = () => {
    target.style.visibility = "";
    target.style.opacity = "";
  };
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    revealTarget();
    removeFlight();
    return;
  }

  const anime = typeof runtime.loadAnimeJs === "function"
    ? await runtime.loadAnimeJs()
    : window.anime;
  if (typeof anime !== "function") {
    revealTarget();
    removeFlight();
    return;
  }

  target.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  const refreshedTarget = findInsertedTimelineSceneElement(rowId) || target;
  refreshedTarget.style.visibility = "hidden";
  refreshedTarget.style.opacity = "0";
  const targetRect = refreshedTarget.getBoundingClientRect();
  if (!targetRect.width || !targetRect.height) {
    revealTarget();
    removeFlight();
    return;
  }

  const sourceX = Number(root.dataset.sourceX || window.innerWidth / 2);
  const sourceY = Number(root.dataset.sourceY || window.innerHeight / 2);
  const targetX = targetRect.left + (targetRect.width / 2);
  const targetY = targetRect.top + (targetRect.height / 2);
  const curveLift = Math.max(110, Math.min(260, Math.abs(targetY - sourceY) * 0.45));
  const path = root.querySelector(".podcast-scene-insert-flight-path path");
  path.setAttribute(
    "d",
    `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY - curveLift}, ${targetX} ${targetY - curveLift}, ${targetX} ${targetY}`
  );
  const symbol = root.querySelector(".podcast-scene-insert-flight-symbol");
  const outerOrbit = root.querySelector(".scene-insert-vector-orbit.is-outer");
  const innerOrbit = root.querySelector(".scene-insert-vector-orbit.is-inner");
  const arrow = root.querySelector(".scene-insert-vector-arrow");
  const burst = root.querySelector(".podcast-scene-insert-flight-burst");
  const burstRings = root.querySelectorAll(".scene-insert-burst-ring");
  const burstParticles = Array.from(root.querySelectorAll(".scene-insert-burst-particle"));
  const motionPath = anime.path(path);
  const lane = refreshedTarget.closest(".podcast-video-track-lane, .podcast-video-track-row");
  const neighbors = Array.from(lane?.querySelectorAll?.(
    ".podcast-video-timeline-clip[data-row-id], .podcast-video-timeline-item[data-row-id]"
  ) || []).filter((node) => node !== refreshedTarget && !node.contains(refreshedTarget));
  const leftNeighbors = neighbors.filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left + (rect.width / 2) < targetX;
  });
  const rightNeighbors = neighbors.filter((node) => !leftNeighbors.includes(node));

  anime.remove([
    symbol,
    path,
    outerOrbit,
    innerOrbit,
    arrow,
    burst,
    ...burstRings,
    ...burstParticles,
    refreshedTarget,
    ...neighbors
  ]);
  anime.set(symbol, { translateX: sourceX, translateY: sourceY, scale: 0 });
  anime.set(burst, {
    translateX: targetX,
    translateY: targetY,
    scale: 0.2,
    opacity: 0,
    visibility: "hidden"
  });
  anime.set(burstRings, { scale: 0.2, opacity: 0 });
  anime.set(burstParticles, { translateX: 0, translateY: 0, scale: 0, opacity: 0 });
  anime({
    targets: outerOrbit,
    rotate: [0, 720],
    duration: 1350,
    easing: "linear"
  });
  anime({
    targets: innerOrbit,
    rotate: [0, -540],
    duration: 1350,
    easing: "linear"
  });
  anime({
    targets: arrow,
    translateX: [0, 8, 0],
    duration: 420,
    direction: "alternate",
    loop: 3,
    easing: "easeInOutSine"
  });
  anime({
    targets: path,
    strokeDashoffset: [anime.setDashoffset, 0],
    opacity: [0, 0.9, 0],
    duration: 1320,
    easing: "easeInOutSine"
  });
  anime({
    targets: leftNeighbors,
    translateX: [0, -54, -72, 0],
    duration: 920,
    delay: 610,
    easing: "easeOutElastic(1, .48)"
  });
  anime({
    targets: rightNeighbors,
    translateX: [0, 54, 72, 0],
    duration: 920,
    delay: 610,
    easing: "easeOutElastic(1, .48)"
  });
  anime.timeline({
    complete: () => {
      refreshedTarget.style.visibility = "";
      refreshedTarget.style.opacity = "0";
      anime({
        targets: refreshedTarget,
        opacity: [0, 1],
        scale: [0.35, 1.16, 0.92, 1.04, 1],
        filter: ["brightness(1.65)", "brightness(1.18)", "brightness(1)"],
        duration: 760,
        easing: "easeOutElastic(1, .48)",
        complete: removeFlight
      });
    }
  })
    .add({
      targets: symbol,
      translateX: motionPath("x"),
      translateY: motionPath("y"),
      rotate: motionPath("angle"),
      scale: [
        { value: 1.08, duration: 220, easing: "easeOutBack" },
        { value: 0.88, duration: 700, easing: "easeInOutSine" },
        { value: 0.08, duration: 260, easing: "easeInBack" }
      ],
      opacity: [1, 1, 0],
      duration: 1280,
      easing: "easeInOutCubic"
    })
    .add({
      targets: burst,
      visibility: "visible",
      opacity: [0, 1, 1, 0],
      scale: [0.15, 1, 1.18],
      duration: 520,
      easing: "easeOutQuad",
      begin: () => {
        anime({
          targets: burstRings,
          scale: [0.2, 1.8],
          opacity: [0, 1, 0],
          delay: anime.stagger(55),
          duration: 460,
          easing: "easeOutExpo"
        });
        burstParticles.forEach((particle, index) => {
          const angle = Number(particle.dataset.angle || 0);
          const distance = 48 + ((index % 3) * 12);
          anime({
            targets: particle,
            translateX: [0, Math.cos(angle) * distance],
            translateY: [0, Math.sin(angle) * distance],
            scale: [0, 1.35, 0],
            opacity: [0, 1, 0],
            duration: 480,
            delay: index * 12,
            easing: "easeOutCubic"
          });
        });
      }
    }, "-=70");
}

function confirmPodcastSceneInsertSelection(options = {}) {
  const item = podcastSceneInsertModalState.libraryItem;
  if (!item) return false;
  const flight = createPodcastSceneInsertFlightGhost(item);
  const insertIndex = Math.max(0, Math.round(runtime.toFiniteNumber(podcastSceneInsertModalState.selectedInsertIndex, 0)));
  const insertedRowId = insertLibrarySceneIntoSession(item, {
    insertIndex,
    insertIntoNewTrack: options.insertIntoNewTrack === true
  });
  if (insertedRowId) {
    closePodcastSceneInsertModal();
    if (typeof runtime.reorderTimelineClipsByTracks === "function") {
      runtime.reorderTimelineClipsByTracks();
    }
    void animatePodcastSceneInsertToTimeline(flight, insertedRowId);
  } else {
    flight?.element?.remove();
  }
  return Boolean(insertedRowId);
}

function setPodcastSceneLibraryEditModalOpen(isOpen = false, item = null) {
  podcastSceneLibraryEditModalState.open = Boolean(isOpen) && Boolean(item);
  podcastSceneLibraryEditModalState.item = podcastSceneLibraryEditModalState.open ? runtime.normalizePodcastSceneLibraryItem(item) : null;
  if (!runtime.els.podcastSceneLibraryEditModal) return;
  if (!podcastSceneLibraryEditModalState.open) {
    runtime.els.podcastSceneLibraryEditModal.hidden = true;
    return;
  }
  const normalized = podcastSceneLibraryEditModalState.item;
  if (runtime.els.podcastSceneLibraryEditTitle) {
    runtime.els.podcastSceneLibraryEditTitle.textContent = `Editar “${String(normalized?.title || "Escena pública").trim()}”`;
  }
  if (runtime.els.podcastSceneLibraryEditName) {
    runtime.els.podcastSceneLibraryEditName.value = String(normalized?.title || "");
  }
  if (runtime.els.podcastSceneLibraryEditTagLabel) {
    runtime.els.podcastSceneLibraryEditTagLabel.value = String(normalized?.tagLabel || "");
  }
  if (runtime.els.podcastSceneLibraryEditTagColor) {
    runtime.els.podcastSceneLibraryEditTagColor.value = String(normalized?.tagColor || "slate");
  }
  runtime.els.podcastSceneLibraryEditModal.hidden = false;
}

function closePodcastSceneLibraryEditModal() {
  podcastSceneLibraryEditModalState.open = false;
  podcastSceneLibraryEditModalState.item = null;
  if (runtime.els.podcastSceneLibraryEditModal) {
    runtime.els.podcastSceneLibraryEditModal.hidden = true;
  }
}

async function savePodcastSceneLibraryEdit() {
  const item = podcastSceneLibraryEditModalState.item;
  if (!item) return false;
  const libraryId = String(item.libraryId || "").trim();
  const title = String(runtime.els.podcastSceneLibraryEditName?.value || "").trim();
  const tagLabel = String(runtime.els.podcastSceneLibraryEditTagLabel?.value || "").trim();
  const tagColor = String(runtime.els.podcastSceneLibraryEditTagColor?.value || "slate").trim() || "slate";
  if (!title) {
    runtime.addChatMessage("system", "El nombre de la escena no puede estar vacío.");
    return false;
  }
  const response = await authFetchJson("/api/podcaster/scene-library/update", {
    method: "POST",
    body: JSON.stringify({
      libraryId,
      title,
      tagLabel,
      tagColor
    })
  });
  const updated = runtime.normalizePodcastSceneLibraryItem(response?.item || response?.scene || response?.libraryItem || null);
  if (!updated) throw new Error("No se pudo actualizar la escena pública.");
  podcastSceneLibraryState.items = podcastSceneLibraryState.items.map((scene) => (
    String(scene?.libraryId || "").trim() === libraryId ? updated : scene
  ));
  podcastSceneLibraryState.loadedAt = runtime.nowIso();
  podcastSceneLibraryState.error = "";
  closePodcastSceneLibraryEditModal();
  renderPodcastSceneLibrary(runtime.getActiveSession());
  return true;
}

async function deletePodcastSceneLibraryItem(item = null) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return false;
  const libraryId = String(normalized.libraryId || "").trim();
  const confirmed = window.confirm(`Se eliminará "${normalized.title}" de la biblioteca pública. ¿Deseas continuar?`);
  if (!confirmed) return false;
  await authFetchJson("/api/podcaster/scene-library/delete", {
    method: "POST",
    body: JSON.stringify({ libraryId })
  });
  podcastSceneLibraryState.items = podcastSceneLibraryState.items.filter((scene) => String(scene?.libraryId || "").trim() !== libraryId);
  renderPodcastSceneLibrary(runtime.getActiveSession());
  return true;
}

function isPodcastSceneLibraryImage(item = null, source = "") {
  const mimeType = String(item?.mimeType || "").trim().toLowerCase();
  const mediaType = String(item?.type || item?.mediaType || item?.mediaKind || "").trim().toLowerCase();
  const path = [source, item?.downloadUrl, item?.storagePath, item?.fileName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  return mimeType.startsWith("image/")
    || mediaType === "image"
    || /\.(?:avif|gif|jpe?g|png|webp)(?:[?#\s]|$)/i.test(path);
}

function hidePodcastSceneLibraryStageVideos() {
  [runtime.els.podcastActiveSpeakerVideo, runtime.els.podcastActiveSpeakerVideoAlt].forEach((video) => {
    if (!video) return;
    try { video.pause(); } catch (_) { }
    video.hidden = true;
    video.style.opacity = "0";
    video.style.visibility = "hidden";
  });
}

function hidePodcastSceneLibraryStageImages() {
  [runtime.els.podcastActiveSpeakerImage, runtime.els.podcastActiveSpeakerImageAlt].forEach((image) => {
    if (!image) return;
    image.hidden = true;
    image.style.opacity = "0";
    image.style.visibility = "hidden";
    delete image.dataset.stageMode;
  });
}

async function showPodcastSceneLibraryImagePreview(item = null, source = "") {
  const image = runtime.els.podcastActiveSpeakerImage || runtime.els.podcastActiveSpeakerImageAlt || null;
  if (!image) return false;

  hidePodcastSceneLibraryStageVideos();
  image.hidden = false;
  image.style.opacity = "0";
  image.style.visibility = "visible";
  image.dataset.src = source;
  image.dataset.stageMode = "scene-image";
  image.alt = String(item?.title || "Vista previa de escena pública").trim();

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("No se pudo cargar la imagen de la escena pública."));
    };
    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
    image.src = source;
    if (image.complete && Number(image.naturalWidth || 0) > 0) handleLoad();
  });

  image.classList.add("is-visible");
  image.style.opacity = "1";
  image.style.visibility = "visible";
  return true;
}

async function playPodcastSceneLibraryPreview(item = null) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return false;
  const source = runtime.resolveStorageVideoUrl(normalized.downloadUrl || "", normalized.storagePath || "");
  if (!source) return false;
  if (typeof runtime.stopRowAudio === "function") {
    runtime.stopRowAudio();
  }
  await runtime.stopGeminiLiveSession().catch(() => { });

  if (isPodcastSceneLibraryImage(normalized, source)) {
    const ok = await showPodcastSceneLibraryImagePreview(normalized, source);
    if (ok) {
      runtime.setPodcastVideoStatus(`Mostrando vista previa: ${normalized.title}`);
    }
    return ok;
  }

  const video = runtime.getActiveStageVideoEl?.() || runtime.els.podcastActiveSpeakerVideoAlt || runtime.els.podcastActiveSpeakerVideo || null;
  if (!video) return false;
  hidePodcastSceneLibraryStageImages();

  video.dataset.src = source;
  video.src = source;
  video.load();

  const ok = await runtime.safeMediaPlay(video);
  if (ok) {
    runtime.setPodcastVideoStatus(`Reproduciendo vista previa: ${normalized.title}`);
  }
  return ok;
}

async function publishCurrentSceneToLibrary(rowId = "", options = {}) {
  const key = String(rowId || "").trim() || String(runtime.podcastVideoState?.activeRowId || "").trim();
  const session = runtime.getActiveSession();
  if (!session || !key) return null;
  const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
  if (!row) return null;
  const clip = runtime.resolveDialogueVideoForRow(session, key);
  const primarySegment = runtime.resolvePrimaryDialogueVideoSegment(clip);
  const videoUrl = runtime.resolveStorageVideoUrl(primarySegment?.downloadUrl || clip?.downloadUrl || "", primarySegment?.storagePath || clip?.storagePath || "");
  if (!videoUrl) {
    throw new Error("La escena no tiene video para publicar.");
  }
  const sceneTitle = String(row.publicSceneTitle || row.sceneDescription || row.scenePrompt || row.voiceOverText || `Escena ${runtime.resolveSceneNumberByRowId(key, session)}`).trim();
  const captureCandidate = runtime.getActiveStageVideoEl?.() || runtime.els.podcastActiveSpeakerVideoAlt || runtime.els.podcastActiveSpeakerVideo || null;
  let thumbDataUrl = "";
  if (captureCandidate && String(captureCandidate.dataset?.src || "").trim() === String(videoUrl || "").trim()) {
    thumbDataUrl = await runtime.captureVideoFrameDataUrl(captureCandidate, { timeSec: captureCandidate.currentTime || 0 });
  }
  if (!thumbDataUrl) {
    thumbDataUrl = String(runtime.els.podcastActiveSpeakerImage?.src || "").trim();
  }
  if (!thumbDataUrl) {
    thumbDataUrl = "SnoopyPodcastCreator.png";
  }
  const payload = {
    libraryId: String(row.publicSceneLibraryId || "").trim(),
    sessionId: String(session.id || "").trim(),
    rowId: key,
    title: sceneTitle,
    durationSec: Math.max(VIDEO_SCENE_MIN_SEC, Math.min(VIDEO_SCENE_MAX_SEC, Number(row.durationSec) || VIDEO_SCENE_MAX_SEC)),
    downloadUrl: String(primarySegment?.downloadUrl || clip?.downloadUrl || "").trim(),
    storagePath: String(primarySegment?.storagePath || clip?.storagePath || "").trim(),
    mimeType: String(primarySegment?.mimeType || clip?.mimeType || "video/mp4").trim() || "video/mp4",
    thumbDataUrl,
    thumbMimeType: "image/jpeg",
    sceneDescription: String(row.sceneDescription || row.scenePrompt || "").trim(),
    headlineText: String(row.headlineText || "").trim(),
    captionText: String(row.captionText || "").trim(),
    inSceneText: String(row.inSceneText || "").trim(),
    overlayMode: String(row.overlayMode || "none").trim() || "none",
    textSource: String(row.textSource || "migrated").trim() || "migrated",
    onScreenText: String(typeof runtime.getOnScreenTextClipText === "function"
      ? runtime.getOnScreenTextClipText(row)
      : (row.headlineText || row.captionText || row.onScreenText || "")
    ).trim(),
    transition: String(row.transition || "").trim(),
    visualNotes: String(row.visualNotes || row.notes || "").trim(),
    videoDirective: String(row.videoDirective || "").trim(),
    scenePrompt: String(row.scenePrompt || "").trim(),
    voiceOverText: String(row.voiceOverText || row.text || "").trim(),
    imagePrompts: runtime.normalizeVideoImagePrompts(row.imagePrompts || []),
    videoPreset: String(row.videoPreset || runtime.resolveActiveVideoPreset(session) || "creative").trim() || "creative"
  };
  if (options.loadingButton) {
    runtime.setButtonLoadingState(options.loadingButton, true, {
      loadingTitle: "Publicando escena..."
    });
  }
  try {
    const response = await authFetchJson("/api/podcaster/scene-library/publish", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const published = runtime.normalizePodcastSceneLibraryItem(response?.item || response?.scene || response?.libraryItem || null);
    if (!published) throw new Error("No se pudo publicar la escena.");
    podcastSceneLibraryState.items = [
      published,
      ...podcastSceneLibraryState.items.filter((item) => String(item?.libraryId || "").trim() !== published.libraryId)
    ];
    podcastSceneLibraryState.loadedAt = runtime.nowIso();
    podcastSceneLibraryState.error = "";
    runtime.upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((item) => (
          String(item?.id || "").trim() === key
            ? {
              ...item,
              publicSceneLibraryId: published.libraryId,
              publicScenePublishedAt: published.updatedAt || published.createdAt || runtime.nowIso(),
              publicSceneTitle: published.title,
              publicSceneThumbUrl: published.thumbUrl || "",
              publicSceneVideoUrl: published.downloadUrl || ""
            }
            : item
        )),
        dialogueVideoMap: {
          ...runtime.getDialogueVideoMap(current),
          [key]: {
            ...runtime.getDialogueVideoMap(current)[key],
            publicSceneLibraryId: published.libraryId,
            publicScenePublishedAt: published.updatedAt || published.createdAt || runtime.nowIso(),
            publicSceneTitle: published.title,
            publicSceneThumbUrl: published.thumbUrl || "",
            publicSceneVideoUrl: published.downloadUrl || ""
          }
        }
      }
    }), { render: false });
    renderPodcastSceneLibrary(runtime.getActiveSession());
    runtime.render();
    runtime.scheduleSessionLocalPersist("public-scene");
    return published;
  } finally {
    if (options.loadingButton) {
      runtime.setButtonLoadingState(options.loadingButton, false);
    }
  }
}

async function uploadLocalPodcastSceneLibraryVideo(file = null) {
  if (!(file instanceof File)) throw new Error("No se recibió un video válido.");
  if (!String(file.type || "").startsWith("video/")) throw new Error("El archivo debe ser un video.");
  const button = runtime.els.uploadLocalPodcastSceneBtn || null;
  runtime.setButtonLoadingState(button, true, { loadingTitle: "Subiendo video..." });
  podcastSceneLibraryState.loading = true;
  renderPodcastSceneLibrary(runtime.getActiveSession());
  try {
    const measured = await runtime.measureVideoFile(file);
    const uploaded = await uploadPodcasterAsset(file, {
      kind: "library-video",
      fileName: String(file.name || "video-local"),
      onProgress: (loaded, total) => {
        const percent = Math.round((Math.max(0, Number(loaded || 0)) / Math.max(1, Number(total || file.size || 1))) * 100);
        runtime.setGenerationStatus(`Subiendo video a Cloud Storage… ${Math.min(100, percent)}%`, "is-busy");
      }
    });
    let thumbUploadId = "";
    const thumbDataUrl = String(measured?.thumbDataUrl || "").trim();
    if (thumbDataUrl) {
      const thumbFile = dataUrlToFile(thumbDataUrl, `${String(file.name || "video").replace(/\.[^.]+$/, "")}-thumb.jpg`);
      const thumbUploaded = await uploadPodcasterAsset(thumbFile, { kind: "library-image" });
      thumbUploadId = String(thumbUploaded?.uploadId || "");
    }
    const response = await authFetchJson("/api/podcaster/scene-library/register-upload", {
      method: "POST",
      body: {
        uploadId: String(uploaded?.uploadId || ""),
        thumbUploadId,
        title: String(file.name || "Video local").replace(/\.[^.]+$/, "").slice(0, 180) || "Video local",
        durationSec: Math.max(0, Number(measured?.durationSec || 0) || 0),
        originalName: String(file.name || "video-local").slice(0, 180)
      }
    });
    const item = runtime.normalizePodcastSceneLibraryItem(response?.item || null);
    if (!item) throw new Error("No se recibió el item de librería.");
    podcastSceneLibraryState.items = [
      item,
      ...podcastSceneLibraryState.items.filter((entry) => String(entry?.libraryId || "").trim() !== item.libraryId)
    ];
    podcastSceneLibraryState.error = "";
    podcastSceneLibraryState.loadedAt = runtime.nowIso();
    runtime.setGenerationStatus("Video local agregado a la librería", "is-live");
  } finally {
    podcastSceneLibraryState.loading = false;
    runtime.setButtonLoadingState(button, false);
    renderPodcastSceneLibrary(runtime.getActiveSession());
  }
}

function insertLibrarySceneIntoSession(item = null, options = {}) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return false;
  const session = runtime.getActiveSession();
  if (!session) return false;
  const insertIndex = Number.isFinite(Number(options.insertIndex))
    ? Math.max(0, Math.min((session?.script?.rows || []).length, Math.round(Number(options.insertIndex))))
    : runtime.getSceneInsertIndexForLibraryItem(session, options.targetRowId || "");
  const insertIntoNewTrack = options.insertIntoNewTrack === true;
  const row = runtime.buildPublicSceneRowFromLibraryItem(normalized);
  if (!row) return false;
  const rowId = String(row.id || "").trim();
  const videoSource = normalized.downloadUrl || normalized.storagePath || "";
  const clip = runtime.normalizeDialogueVideoMap({
    [rowId]: {
      rowId,
      speaker: "Narrador",
      mimeType: normalized.mimeType || "video/mp4",
      model: "veo-pro",
      variant: "creative",
      promptVersion: "copied_from_library_v1",
      publicSceneLibraryId: normalized.libraryId,
      publicScenePublishedAt: normalized.updatedAt || normalized.createdAt || runtime.nowIso(),
      publicSceneTitle: normalized.title,
      publicSceneThumbUrl: normalized.thumbUrl || "",
      publicSceneVideoUrl: normalized.downloadUrl || "",
      videoDirective: row.videoDirective,
      scenePrompt: row.scenePrompt,
      imagePrompts: row.imagePrompts,
      durationSec: normalized.durationSec,
      targetSpeechLine: row.voiceOverText,
      updatedAt: runtime.nowIso(),
      downloadUrl: normalized.downloadUrl || "",
      storagePath: normalized.storagePath || "",
      segments: [{
        id: `${rowId}-seg-1`,
        index: 0,
        durationSec: normalized.durationSec,
        downloadUrl: normalized.downloadUrl || "",
        storagePath: normalized.storagePath || "",
        mimeType: normalized.mimeType || "video/mp4",
        variant: "creative",
        targetSpeechLine: row.voiceOverText
      }]
    }
  })[rowId] || null;
  runtime.upsertActiveSession((current) => {
    const rows = Array.isArray(current?.script?.rows) ? [...current.script.rows] : [];
    const safeIndex = Math.max(0, Math.min(rows.length, insertIndex));
    const insertedRow = {
      ...row,
      publicScenePublishedAt: normalized.updatedAt || normalized.createdAt || runtime.nowIso(),
      publicSceneTitle: normalized.title,
      publicSceneThumbUrl: normalized.thumbUrl || "",
      publicSceneVideoUrl: normalized.downloadUrl || "",
      publicSceneLibraryId: "",
      sourcePublicSceneLibraryId: normalized.libraryId,
      playbackRate: normalized.playbackRate || 1
    };
    rows.splice(safeIndex, 0, insertedRow);
    const nextDialogueVideoMap = {
      ...runtime.getDialogueVideoMap(current),
      [rowId]: clip || {
        rowId,
        speaker: "Narrador",
        mimeType: normalized.mimeType || "video/mp4",
        model: "veo-pro",
        variant: "creative",
        promptVersion: "copied_from_library_v1",
        videoDirective: row.videoDirective,
        scenePrompt: row.scenePrompt,
        imagePrompts: row.imagePrompts,
        durationSec: normalized.durationSec,
        targetSpeechLine: row.voiceOverText,
        updatedAt: runtime.nowIso(),
        downloadUrl: normalized.downloadUrl || "",
        storagePath: normalized.storagePath || "",
        segments: [{
          id: `${rowId}-seg-1`,
          index: 0,
          durationSec: normalized.durationSec,
          downloadUrl: normalized.downloadUrl || "",
          storagePath: normalized.storagePath || "",
          mimeType: normalized.mimeType || "video/mp4",
          variant: "public",
          targetSpeechLine: row.voiceOverText
        }]
      }
    };
    const nextSessionSnapshot = {
      ...current,
      script: {
        ...current.script,
        rows
      },
      dialogueVideoMap: nextDialogueVideoMap
    };
    const cfg = runtime.getPodcastVideoConfig(nextSessionSnapshot);
    let nextTracks = runtime.normalizeTimelineTracks(cfg.timelineTracks || []);
    if (!nextTracks.length) {
      nextTracks = runtime.buildDefaultTimelineTracks(nextSessionSnapshot);
    }
    const nextClips = runtime.normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {});
    const previousRow = safeIndex > 0 ? rows[safeIndex - 1] || null : null;
    const nextRow = safeIndex < rows.length - 1 ? rows[safeIndex + 1] || null : null;
    const previousRowId = String(previousRow?.id || "").trim();
    const nextRowId = String(nextRow?.id || "").trim();
    const previousClip = previousRowId ? nextClips[previousRowId] || null : null;
    const nextClip = nextRowId ? nextClips[nextRowId] || null : null;
    let assignedTrackId = String(nextClip?.trackId || previousClip?.trackId || "").trim()
      || runtime.resolveTimelineDefaultTrackIdForSpeaker(String(insertedRow?.speaker || "Narrador").trim());
    if (insertIntoNewTrack) {
      const anchorTrackId = String(nextClip?.trackId || previousClip?.trackId || "").trim();
      const anchorTrackIndex = nextTracks.findIndex((track) => String(track?.id || "").trim() === anchorTrackId);
      const variantTrack = runtime.buildTimelineVariantTrackDescriptor(String(insertedRow?.speaker || "Narrador").trim(), nextTracks);
      assignedTrackId = variantTrack.id;
      const newTrackIndex = anchorTrackIndex >= 0 ? anchorTrackIndex + (nextClip ? 0 : 1) : nextTracks.length;
      nextTracks.splice(newTrackIndex, 0, {
        id: assignedTrackId,
        label: variantTrack.label,
        order: newTrackIndex
      });
      nextTracks = runtime.normalizeTimelineTracks(nextTracks);
    }
    const sourceDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round(Math.max(0, Number(normalized.durationSec || 0) || 0) * 1000) || runtime.getRowSourceDurationMs(insertedRow, nextSessionSnapshot)
    );
    const inferredStartMs = (() => {
      if (!insertIntoNewTrack && previousClip && String(previousClip.trackId || "").trim() === assignedTrackId) {
        return runtime.getTimelineClipEndMs(previousClip);
      }
      if (nextClip) return Math.max(0, Number(nextClip.startMs || 0));
      if (previousClip) return runtime.getTimelineClipEndMs(previousClip);
      return 0;
    })();
    const insertedTimelineClip = runtime.normalizeTimelineClipItem({
      rowId,
      speakerKey: String(insertedRow?.speaker || "Narrador").trim(),
      trackId: assignedTrackId,
      startMs: inferredStartMs,
      sourceDurationMs,
      mediaDurationMs: Math.round(Math.max(0, Number(normalized.durationSec || 0) || 0) * 1000),
      durationMode: "auto",
      trimInMs: 0,
      trimOutMs: sourceDurationMs,
      zIndex: Math.max(1, Number(nextClip?.zIndex || previousClip?.zIndex || safeIndex + 1))
    }, rowId);
    runtime.logPodcastBatchDebug("public-scene-insert-track", {
      rowId,
      insertIntoNewTrack,
      assignedTrackId,
      insertedClipTrackId: String(insertedTimelineClip?.trackId || "").trim(),
      timelineTracks: nextTracks.map((track) => ({
        id: String(track?.id || "").trim(),
        label: String(track?.label || "").trim()
      }))
    });
    return {
      ...nextSessionSnapshot,
      podcastVideoConfig: runtime.normalizePodcastVideoConfig({
        ...cfg,
        timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
        timelineVersion: STUDIO_TIMELINE_VERSION,
        timelineTracks: nextTracks,
        timelineViewMode: insertIntoNewTrack ? "tracks" : (String(cfg.timelineViewMode || "tracks").trim().toLowerCase() === "normal" ? "normal" : "tracks"),
        timelineClipsByRowId: insertedTimelineClip
          ? {
            ...nextClips,
            [rowId]: insertedTimelineClip
          }
          : nextClips
      })
    };
  }, { render: false });

  runtime.ensureOnScreenTextClipForRowId(runtime.getActiveSession(), rowId, { persist: true });
  runtime.ensureOnScreenTextClipsByRowId(runtime.getActiveSession(), { persist: true });
  if (insertIntoNewTrack) {
    runtime.setTimelineViewMode("tracks");
  }
  runtime.syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
  runtime.renderPodcastVideoTimeline(runtime.getActiveSession(), { force: true, reason: "structure" });
  runtime.renderPodcastTransitionTimeline(runtime.getActiveSession());
  runtime.syncPodcastStudioInspector(runtime.getActiveSession());
  runtime.render();
  if (rowId) {
    runtime.setPodcastVideoRow(rowId, {
      syncStage: false,
      preserveMontageCursor: true,
      reason: "structure"
    });
    queueMicrotask(() => {
      const safeRowId = String(rowId || "").trim();
      if (!safeRowId) return;
      try {
        const scriptRow = runtime.els.scriptTableBody?.querySelector?.(`.script-row[data-row-id="${CSS.escape(safeRowId)}"]`);
        scriptRow?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        const timelineClip = runtime.els.podcastVideoTimeline?.querySelector?.(`.podcast-video-timeline-clip[data-row-id="${CSS.escape(safeRowId)}"], .podcast-video-timeline-item[data-row-id="${CSS.escape(safeRowId)}"]`);
        timelineClip?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
      } catch (_) { }
    });
  }
  runtime.scheduleSessionLocalPersist("public-scene-insert");
  clonePublicSceneLibraryVideoToSession({
    sessionId: String(runtime.getActiveSession()?.id || "").trim(),
    rowId,
    speakerLabel: String(row?.speaker || "Narrador").trim() || "Narrador",
    sourceStoragePath: String(normalized.storagePath || "").trim(),
    sourceUrl: String(normalized.downloadUrl || "").trim(),
    mimeType: String(normalized.mimeType || "video/mp4").trim() || "video/mp4"
  }).catch(() => { });
  return rowId || true;
}

async function clonePublicSceneLibraryVideoToSession({
  sessionId = "",
  rowId = "",
  speakerLabel = "Narrador",
  sourceStoragePath = "",
  sourceUrl = "",
  mimeType = "video/mp4"
} = {}) {
  const activeSession = runtime.getActiveSession();
  const safeSessionId = String(sessionId || activeSession?.id || "").trim();
  const safeRowId = String(rowId || "").trim();
  if (!safeSessionId || !safeRowId) return false;
  if (!hasAvailableApiBase()) return false;
  const current = runtime.resolveDialogueVideoForRow(activeSession, safeRowId);
  const currentStoragePath = String(current?.storagePath || runtime.resolvePrimaryDialogueVideoSegment(current)?.storagePath || "").trim();
  if (/^podcaster\/sessions\//i.test(currentStoragePath)) return false;

  let response = null;
  try {
    response = await authFetchJson("/api/podcaster/scene-library/clone-video", {
      method: "POST",
      body: {
        sessionId: safeSessionId,
        rowId: safeRowId,
        speakerLabel: String(speakerLabel || "Narrador").trim() || "Narrador",
        sourceStoragePath: String(sourceStoragePath || "").trim(),
        sourceUrl: String(sourceUrl || "").trim(),
        mimeType: String(mimeType || "video/mp4").trim() || "video/mp4"
      }
    });
  } catch (_) {
    return false;
  }
  const nextStoragePath = String(response?.video?.storagePath || "").trim();
  const nextDownloadUrl = String(response?.video?.downloadUrl || "").trim();
  const nextMimeType = String(response?.video?.mimeType || mimeType || "video/mp4").trim() || "video/mp4";
  if (!nextStoragePath || !nextDownloadUrl) return false;

  runtime.upsertActiveSession((base) => {
    const map = { ...runtime.getDialogueVideoMap(base) };
    const prev = map[safeRowId] || runtime.resolveDialogueVideoForRow(base, safeRowId) || null;
    if (!prev) return base;
    const segments = runtime.resolveDialogueVideoSegments(prev);
    const primary = runtime.resolvePrimaryDialogueVideoSegment(prev);
    const mergedPrimary = {
      ...(primary && primary !== prev ? primary : {}),
      downloadUrl: nextDownloadUrl,
      storagePath: nextStoragePath,
      mimeType: nextMimeType,
      variant: String(prev?.variant || "public").trim() || "public",
      updatedAt: runtime.nowIso()
    };
    const nextSegments = segments.length
      ? segments.map((seg) => ({
        ...seg,
        downloadUrl: nextDownloadUrl,
        storagePath: nextStoragePath,
        mimeType: nextMimeType
      }))
      : [{
        id: `${safeRowId}-seg-1`,
        index: 0,
        durationSec: Number(prev?.durationSec || 0) || VIDEO_SCENE_MIN_SEC,
        downloadUrl: nextDownloadUrl,
        storagePath: nextStoragePath,
        mimeType: nextMimeType,
        variant: "session-clone",
        targetSpeechLine: String(prev?.targetSpeechLine || "").trim()
      }];
    map[safeRowId] = runtime.normalizeDialogueVideoMap({
      [safeRowId]: {
        ...prev,
        mimeType: nextMimeType,
        model: "public-scene-library-clone",
        storagePath: nextStoragePath,
        downloadUrl: nextDownloadUrl,
        updatedAt: runtime.nowIso(),
        segments: nextSegments
      }
    })[safeRowId] || prev;
    return {
      ...base,
      dialogueVideoMap: map
    };
  }, { render: false });
  runtime.renderPodcastVideoShell(runtime.getActiveSession());
  runtime.scheduleSessionLocalPersist("public-scene-clone");
  return true;
}

// --- Exposure to Window ---
Object.assign(window, {
  podcastSceneLibraryState,
  podcastSceneInsertModalState,
  podcastSceneLibraryEditModalState,
  PODCAST_LIBRARY_TAG_COLORS,
  getPodcastLibraryTagColorMeta,
  getPodcastLibraryTagColorStyle,
  filterPodcastSceneLibraryItems,
  fetchPodcastSceneLibrary,
  renderPodcastSceneLibrary,
  getPodcastSceneLibraryMenuPortal,
  closePodcastSceneLibraryMenu,
  buildPodcastSceneLibraryMenuHtml,
  openPodcastSceneLibraryMenu,
  buildPodcastSceneInsertPositions,
  renderPodcastSceneInsertModal,
  setPodcastSceneInsertModalOpen,
  closePodcastSceneInsertModal,
  confirmPodcastSceneInsertSelection,
  setPodcastSceneLibraryEditModalOpen,
  closePodcastSceneLibraryEditModal,
  savePodcastSceneLibraryEdit,
  deletePodcastSceneLibraryItem,
  playPodcastSceneLibraryPreview,
  publishCurrentSceneToLibrary,
  uploadLocalPodcastSceneLibraryVideo,
  insertLibrarySceneIntoSession,
  clonePublicSceneLibraryVideoToSession
});
