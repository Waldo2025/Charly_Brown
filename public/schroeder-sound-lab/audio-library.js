import { authFetch } from "../js/api-client.js";

const ART_URL = "schroeder-sound-lab/assets/schroeder-adult-piano.png";
const PLAYER_STATE_KEY = "schroeder-sound-lab:player:v1";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function kindLabel(item = {}) {
  if (item.kind === "music") return "Canción";
  if (item.format === "dialogue") return "Diálogo";
  if (item.format === "word") return "Palabra";
  return "Frase";
}

function menuMarkup(item, prefix = "") {
  const id = escapeHtml(item.id || "");
  return `<button type="button" data-${prefix}action="edit" data-audio-id="${id}"><i class="fas fa-pen"></i><span>${item.kind === "music" ? "Crear variación" : "Editar"}</span></button>
    <button type="button" data-${prefix}action="download" data-audio-id="${id}"><i class="fas fa-download"></i><span>Descargar</span></button>
    ${item.kind === "music" ? `<button type="button" data-${prefix}action="podcaster" data-audio-id="${id}"><i class="fas ${item.podcasterLibraryId ? "fa-check" : "fa-podcast"}"></i><span>${item.podcasterLibraryId ? "En Podcaster" : "Añadir a Podcaster"}</span></button>` : ""}
    <button class="is-danger" type="button" data-${prefix}action="remove" data-audio-id="${id}"><i class="fas fa-trash"></i><span>Eliminar</span></button>`;
}

export function renderLibrary(container, items = []) {
  if (!items.length) {
    container.innerHTML = '<div class="ssl-empty"><i class="fas fa-wave-square"></i><span>Sin audios</span></div>';
    return;
  }
  container.innerHTML = items.map((item) => `<article class="ssl-track-row" data-audio-id="${escapeHtml(item.id)}">
    <button class="ssl-track-cover" type="button" data-action="play" data-tooltip="Reproducir" aria-label="Reproducir ${escapeHtml(item.title || kindLabel(item))}">
      <img src="${ART_URL}" alt=""><span><i class="fas fa-play"></i></span>
    </button>
    <div class="ssl-track-copy"><h3 class="ssl-track-title" title="Doble clic para renombrar">${escapeHtml(item.title || kindLabel(item))}</h3><span>${kindLabel(item)}</span></div>
    <div class="ssl-menu-wrap">
      <button class="ssl-icon-action ssl-track-menu-trigger" type="button" data-action="menu" data-tooltip="Opciones" aria-label="Opciones"><i class="fas fa-ellipsis-vertical"></i></button>
      <div class="ssl-track-menu" hidden>${menuMarkup(item)}</div>
    </div>
  </article>`).join("");
}

function formatTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function createAudioPlayer(root) {
  const audio = root.querySelector("audio");
  const cover = root.querySelector(".ssl-player-cover");
  const icon = cover.querySelector("i");
  const title = root.querySelector("#sslPlayerTitle");
  const kind = root.querySelector("#sslPlayerKind");
  const current = root.querySelector("#sslPlayerCurrent");
  const duration = root.querySelector("#sslPlayerDuration");
  const progress = root.querySelector("#sslPlayerProgress");
  const menu = root.querySelector(".ssl-player-menu");
  let activeItem = null;
  let lastSavedAt = 0;
  let pageClosing = false;
  let closingShouldResume = false;
  let resumeWhenAllowed = false;

  function readPlayerState() {
    try { return JSON.parse(localStorage.getItem(PLAYER_STATE_KEY) || "null"); } catch (_) { return null; }
  }

  function savePlayerState(shouldResume = !audio.paused) {
    if (!activeItem?.downloadUrl) return;
    const snapshot = {
      item: {
        id: activeItem.id,
        title: activeItem.title,
        kind: activeItem.kind,
        format: activeItem.format,
        downloadUrl: activeItem.downloadUrl,
        storagePath: activeItem.storagePath || "",
        durationSec: Number(activeItem.durationSec || 0) || (Number.isFinite(audio.duration) ? Math.round(audio.duration * 100) / 100 : 0),
        podcasterLibraryId: activeItem.podcasterLibraryId || ""
      },
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      volume: audio.volume,
      shouldResume,
      savedAt: Date.now()
    };
    try { localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(snapshot)); } catch (_) { /* El reproductor sigue funcionando sin estado local. */ }
  }

  function clearPlayerState() {
    try { localStorage.removeItem(PLAYER_STATE_KEY); } catch (_) { /* noop */ }
  }

  function mount(item) {
    activeItem = item;
    audio.src = item.downloadUrl;
    title.textContent = item.title || kindLabel(item);
    kind.textContent = kindLabel(item);
    menu.innerHTML = menuMarkup(item, "player-");
    root.hidden = false;
    document.body.classList.add("ssl-player-active");
    if ("mediaSession" in navigator && typeof MediaMetadata === "function") {
      navigator.mediaSession.metadata = new MediaMetadata({ title: item.title || kindLabel(item), artist: "Schroeder Sound Lab", artwork: [{ src: ART_URL, sizes: "512x512", type: "image/png" }] });
    }
  }

  function closePlayer() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    activeItem = null;
    menu.hidden = true;
    root.hidden = true;
    clearPlayerState();
    document.body.classList.remove("ssl-player-active");
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  }

  function sync() {
    const total = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (activeItem && total > 0.05 && (!activeItem.durationSec || activeItem.durationSec <= 0)) {
      activeItem.durationSec = Math.round(total * 100) / 100;
    }
    current.textContent = formatTime(audio.currentTime);
    duration.textContent = formatTime(total);
    progress.value = total ? String(Math.round((audio.currentTime / total) * 1000)) : "0";
    icon.className = `fas fa-${audio.paused ? "play" : "pause"}`;
    cover.dataset.tooltip = audio.paused ? "Reproducir" : "Pausar";
    cover.setAttribute("aria-label", cover.dataset.tooltip);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
    if (Date.now() - lastSavedAt > 1500) { lastSavedAt = Date.now(); savePlayerState(pageClosing ? closingShouldResume : !audio.paused); }
  }

  audio.addEventListener("timeupdate", sync);
  audio.addEventListener("loadedmetadata", sync);
  audio.addEventListener("play", () => { resumeWhenAllowed = false; sync(); savePlayerState(true); });
  audio.addEventListener("pause", () => { sync(); if (!pageClosing) savePlayerState(false); });
  audio.addEventListener("ended", () => { resumeWhenAllowed = false; sync(); savePlayerState(false); });
  progress.addEventListener("input", () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
    savePlayerState(!audio.paused);
  });

  const resumeOnInteraction = () => {
    if (!resumeWhenAllowed || !activeItem || !audio.paused) return;
    audio.play().then(() => { resumeWhenAllowed = false; }).catch(() => {});
  };
  document.addEventListener("pointerdown", resumeOnInteraction, true);
  document.addEventListener("keydown", resumeOnInteraction, true);
  const preservePlayback = () => {
    closingShouldResume = !audio.paused || resumeWhenAllowed;
    pageClosing = true;
    savePlayerState(closingShouldResume);
  };
  window.addEventListener("beforeunload", preservePlayback);
  window.addEventListener("pagehide", preservePlayback);

  if ("mediaSession" in navigator) {
    const setMediaAction = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) { /* Acción no disponible en este navegador. */ } };
    setMediaAction("play", () => audio.play().catch(() => {}));
    setMediaAction("pause", () => audio.pause());
    setMediaAction("seekbackward", (details) => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)); });
    setMediaAction("seekforward", (details) => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10)); });
  }

  return {
    get item() { return activeItem; },
    async play(item) {
      if (!item?.downloadUrl) throw new Error("El audio no está disponible.");
      if (activeItem?.id !== item.id) {
        mount(item);
      }
      if (audio.paused) await audio.play(); else audio.pause();
      sync();
    },
    async restore() {
      const saved = readPlayerState();
      if (!saved?.item?.downloadUrl) return;
      mount(saved.item);
      audio.volume = Math.max(0, Math.min(1, Number(saved.volume ?? 1)));
      const seek = () => {
        const target = Math.max(0, Number(saved.currentTime || 0));
        if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Math.min(target, Math.max(0, audio.duration - .05));
        else audio.currentTime = target;
        sync();
      };
      if (audio.readyState >= 1) seek(); else audio.addEventListener("loadedmetadata", seek, { once: true });
      if (saved.shouldResume) {
        resumeWhenAllowed = true;
        try { await audio.play(); resumeWhenAllowed = false; } catch (_) { sync(); }
      } else sync();
    },
    toggle() {
      if (!activeItem) return;
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    },
    close: closePlayer,
    closeMenus() { menu.hidden = true; },
    toggleMenu() { menu.hidden = !menu.hidden; },
    rename(item) {
      if (activeItem?.id !== item?.id) return;
      activeItem.title = item.title;
      title.textContent = item.title || kindLabel(item);
      savePlayerState(!audio.paused || resumeWhenAllowed);
    },
    stopIf(itemId) {
      if (activeItem?.id !== itemId) return;
      closePlayer();
    }
  };
}

export async function downloadAudio(item) {
  const extension = item.kind === "music" ? "mp3" : (String(item.mimeType || "").includes("wav") ? "wav" : "mp3");
  const baseName = String(item.title || "audio").replace(/[^a-z0-9áéíóúñ_-]+/gi, "-").replace(/^-|-$/g, "") || "audio";
  const filename = `${baseName}.${extension}`;

  const triggerBlobDownload = (blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const triggerAnchorDownload = (href) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  let blob = null;

  // 1. Try local/same-origin proxy first if storagePath exists (avoids CORS restrictions on Firebase Storage)
  if (item.storagePath) {
    try {
      const proxyUrl = `/api/assets/proxy-media?storagePath=${encodeURIComponent(item.storagePath)}`;
      const res = await authFetch(proxyUrl).catch(() => null);
      if (res && res.ok) {
        blob = await res.blob();
      }
    } catch (_) {}
  }

  // 2. Try direct fetch if proxy wasn't used or failed
  if (!blob && item.downloadUrl) {
    try {
      const res = await fetch(item.downloadUrl).catch(() => null);
      if (res && res.ok) {
        blob = await res.blob();
      }
    } catch (_) {}
  }

  // 3. Try proxying the downloadUrl
  if (!blob && item.downloadUrl) {
    try {
      const proxyUrl = `/api/assets/proxy-media?url=${encodeURIComponent(item.downloadUrl)}`;
      const res = await authFetch(proxyUrl).catch(() => null);
      if (res && res.ok) {
        blob = await res.blob();
      }
    } catch (_) {}
  }

  if (blob) {
    triggerBlobDownload(blob);
    return;
  }

  // 4. Fallback: browser anchor download (navigation is not subject to JS CORS limits)
  if (item.downloadUrl) {
    triggerAnchorDownload(item.downloadUrl);
    return;
  }

  throw new Error("No se pudo descargar el audio.");
}
