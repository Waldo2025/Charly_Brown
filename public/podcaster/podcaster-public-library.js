import { authFetchJson, hasAvailableApiBase } from "../js/api-client.js";

const runtime = globalThis.PodcasterPublicLibraryRuntime;
if (!runtime || typeof runtime !== "object") {
  throw new Error("PodcasterPublicLibraryRuntime no está disponible. Revisa la carga de podcaster.js.");
}

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
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">Cargando librería pública...</div>`;
    return;
  }
  if (podcastSceneLibraryState.error) {
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">${runtime.escapeHtml(podcastSceneLibraryState.error)}</div>`;
    return;
  }
  if (!podcastSceneLibraryState.items.length) {
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">No hay escenas públicas todavía. Publica una escena para verla aquí.</div>`;
    return;
  }
  if (!filteredItems.length) {
    runtime.els.podcastSceneLibraryList.innerHTML = `<div class="podcast-scene-library-empty">No se encontraron escenas con esos filtros.</div>`;
    return;
  }
  runtime.els.podcastSceneLibraryList.innerHTML = filteredItems.map((item) => {
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
  runtime.attachPodcastLibraryThumbnailLoading();
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
    runtime.els.podcastSceneInsertList.innerHTML = positions.map((position) => {
      const selected = Number(position.insertIndex) === Number(podcastSceneInsertModalState.selectedInsertIndex);
      return `
        <button type="button" class="podcast-scene-insert-option${selected ? " is-selected" : ""}" data-action="select-scene-insert-position" data-insert-index="${runtime.escapeHtml(position.insertIndex)}">
          <strong>${runtime.escapeHtml(position.label)}</strong>
          <span>${runtime.escapeHtml(position.detail)}</span>
        </button>
      `;
    }).join("");
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

function confirmPodcastSceneInsertSelection(options = {}) {
  const item = podcastSceneInsertModalState.libraryItem;
  if (!item) return false;
  const insertIndex = Math.max(0, Math.round(runtime.toFiniteNumber(podcastSceneInsertModalState.selectedInsertIndex, 0)));
  const inserted = insertLibrarySceneIntoSession(item, {
    insertIndex,
    insertIntoNewTrack: options.insertIntoNewTrack === true
  });
  if (inserted) {
    closePodcastSceneInsertModal();
  }
  return inserted;
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

async function playPodcastSceneLibraryPreview(item = null) {
  const normalized = runtime.normalizePodcastSceneLibraryItem(item);
  if (!normalized) return false;
  const source = runtime.resolveStorageVideoUrl(normalized.downloadUrl || "", normalized.storagePath || "");
  if (!source) return false;
  const video = runtime.els.podcastActiveSpeakerVideoAlt || runtime.els.podcastActiveSpeakerVideo || null;
  if (!video) return false;
  
  if (typeof runtime.stopRowAudio === "function") {
    runtime.stopRowAudio();
  }
  await runtime.stopGeminiLiveSession().catch(() => { });

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
    onScreenText: String(row.onScreenText || "").trim(),
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
    const [dataUrl, measured] = await Promise.all([
      runtime.readDataUrlFromFile(file, {
        maxChars: 40 * 1024 * 1024 * 10,
        errorMessage: "No se pudo leer el video local."
      }),
      runtime.measureVideoFile(file)
    ]);
    const response = await authFetchJson("/api/podcaster/scene-library/upload-local", {
      method: "POST",
      body: JSON.stringify({
        title: String(file.name || "Video local").replace(/\.[^.]+$/, "").slice(0, 180) || "Video local",
        videoDataUrl: dataUrl,
        mimeType: String(file.type || "video/mp4").trim() || "video/mp4",
        durationSec: Math.max(0, Number(measured?.durationSec || 0) || 0),
        thumbDataUrl: String(measured?.thumbDataUrl || "").trim(),
        size: Math.max(0, Number(file.size || 0) || 0),
        originalName: String(file.name || "video-local").slice(0, 180)
      })
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
  return true;
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
