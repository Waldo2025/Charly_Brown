import { loadMP4Box } from "./vendor/mp4box/mp4box-loader.js";

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number(min);
  return Math.max(Number(min), Math.min(Number(max), num));
}

function safeUrlPathname(url) {
  try {
    const parsed = new URL(String(url || ""), window.location.origin);
    return String(parsed.pathname || "");
  } catch (_) {
    return "";
  }
}

function guessIsMp4(url) {
  const pathname = safeUrlPathname(url).toLowerCase();
  return pathname.endsWith(".mp4") || pathname.endsWith(".m4v") || pathname.endsWith(".mov");
}

function toSeconds(ms) {
  return Math.max(0, Number(ms || 0) / 1000);
}

function waitEvent(target, type, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try { target.removeEventListener(type, onEvent); } catch (_) {}
      clearTimeout(timer);
      resolve(value);
    };
    const onEvent = () => finish(true);
    const timer = setTimeout(() => finish(false), Math.max(10, Number(timeoutMs || 0) || 4000));
    try { target.addEventListener(type, onEvent, { once: true }); } catch (_) {}
  });
}

export function createTimelinePlaybackEngineMSE({
  videoEl = null,
  onStatus = null,
  onPlayhead = null
} = {}) {
  const video = videoEl || null;
  if (!video) throw new Error("createTimelinePlaybackEngineMSE requiere videoEl");

  let entries = [];
  let mediaSource = null;
  let sourceBuffer = null;
  let objectUrl = "";
  let mp4box = null;
  let engineToken = 0;

  let activeMime = "";
  let appendQueue = [];
  let appending = false;
  let bufferedUntilMs = 0;
  let nextEntryIndex = 0;
  let bufferAheadMs = 12000;
  let timelineDurationMs = 0;
  let tickTimer = 0;

  let voiceAudio = null;
  let voiceSrc = "";
  let voiceRowId = "";
  let volumes = { master: 1, voice: 1, veo: 0 };
  let rate = 1;

  function status(text = "", kind = "info", extra = {}) {
    try {
      if (typeof onStatus === "function") onStatus({ text: String(text || ""), kind: String(kind || "info"), ...extra });
    } catch (_) {}
  }

  function isSupported() {
    return typeof window !== "undefined"
      && typeof window.MediaSource !== "undefined"
      && typeof window.SourceBuffer !== "undefined"
      && typeof MediaSource.isTypeSupported === "function";
  }

  function resetMedia() {
    engineToken += 1;
    appendQueue = [];
    appending = false;
    bufferedUntilMs = 0;
    nextEntryIndex = 0;
    activeMime = "";
    if (sourceBuffer) {
      try { sourceBuffer.removeEventListener("updateend", onUpdateEnd); } catch (_) {}
    }
    sourceBuffer = null;
    if (mediaSource) {
      try { mediaSource.removeEventListener("sourceopen", onSourceOpen); } catch (_) {}
    }
    mediaSource = null;
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
    }
    objectUrl = "";
    try { video.removeAttribute("src"); } catch (_) {}
    try { video.load(); } catch (_) {}
  }

  function stopVoice() {
    if (voiceAudio) {
      try { voiceAudio.pause(); } catch (_) {}
    }
    voiceAudio = null;
    voiceSrc = "";
    voiceRowId = "";
  }

  function setRate(nextRate = 1) {
    rate = clampNumber(nextRate, 0.5, 1.8);
    try { video.playbackRate = rate; } catch (_) {}
    if (voiceAudio) {
      try { voiceAudio.playbackRate = rate; } catch (_) {}
    }
  }

  function setVolumes(next = {}) {
    volumes = {
      master: clampNumber(next.master ?? volumes.master, 0, 1),
      voice: clampNumber(next.voice ?? volumes.voice, 0, 1),
      veo: clampNumber(next.veo ?? volumes.veo, 0, 1)
    };
    if (voiceAudio) {
      try { voiceAudio.volume = clampNumber(volumes.master * volumes.voice, 0, 1); } catch (_) {}
    }
    // Video siempre silencioso en MSE engine (la voz va por pista separada).
    try { video.muted = true; } catch (_) {}
    try { video.volume = 0; } catch (_) {}
  }

  function pickEntryIndexByMs(ms = 0) {
    const t = Math.max(0, Number(ms || 0));
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (t >= e.startMs && t < e.endMs) return i;
    }
    // Si está en gap, elige el siguiente.
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (e.startMs >= t) return i;
    }
    return Math.max(0, entries.length - 1);
  }

  async function ensureMp4BoxLoaded() {
    if (mp4box) return mp4box;
    mp4box = await loadMP4Box();
    return mp4box;
  }

  function buildMimeFromInfo(info) {
    const tracks = Array.isArray(info?.tracks) ? info.tracks : [];
    const videoTrack = tracks.find((t) => String(t?.type || "").toLowerCase() === "video") || tracks[0] || null;
    const codec = String(videoTrack?.codec || "").trim();
    if (!codec) return "";
    return `video/mp4; codecs="${codec}"`;
  }

  function queueAppend(buffer) {
    if (!buffer) return;
    appendQueue.push(buffer);
    pumpAppend().catch(() => {});
  }

  function bufferedEndMs() {
    try {
      const ranges = video.buffered;
      if (!ranges || ranges.length === 0) return 0;
      // Usa el último rango (el más a la derecha).
      const endSec = Number(ranges.end(ranges.length - 1) || 0);
      return Math.max(0, endSec * 1000);
    } catch (_) {
      return 0;
    }
  }

  async function pumpAppend() {
    if (appending) return;
    if (!sourceBuffer || !mediaSource) return;
    if (appendQueue.length === 0) return;
    if (sourceBuffer.updating) return;
    appending = true;
    try {
      const next = appendQueue.shift();
      if (!next) return;
      sourceBuffer.appendBuffer(next);
    } catch (error) {
      status("MSE appendBuffer falló; usando fallback.", "error", { error });
      throw error;
    } finally {
      appending = false;
    }
  }

  function onUpdateEnd() {
    bufferedUntilMs = Math.max(bufferedUntilMs, bufferedEndMs());
    pumpAppend().catch(() => {});
  }

  function onSourceOpen() {
    // noop: SourceBuffer se crea una vez tengamos `info` del primer clip.
  }

  async function ensureMediaSourceOpen() {
    if (!isSupported()) return false;
    if (mediaSource && mediaSource.readyState === "open") return true;
    resetMedia();
    mediaSource = new MediaSource();
    objectUrl = URL.createObjectURL(mediaSource);
    video.src = objectUrl;
    try { video.load(); } catch (_) {}
    mediaSource.addEventListener("sourceopen", onSourceOpen, { once: true });
    const ok = await waitEvent(mediaSource, "sourceopen", 3000);
    return ok && mediaSource.readyState === "open";
  }

  async function fetchArrayBuffer(url, token) {
    const src = String(url || "").trim();
    if (!src) return null;
    const response = await fetch(src, { method: "GET", cache: "force-cache" });
    if (!response.ok) throw new Error(`No se pudo descargar video (${response.status})`);
    const buf = await response.arrayBuffer();
    if (token !== engineToken) return null;
    return buf;
  }

  async function appendClipAtOffset({ entry, entryIndex, token }) {
    const src = String(entry?.videoSrc || "").trim();
    if (!src) return false;
    // Heurística: si no parece MP4, aún intentamos; si mp4box falla, caemos a fallback.
    const data = await fetchArrayBuffer(src, token);
    if (!data) return false;
    await ensureMp4BoxLoaded();
    const mp4boxfile = mp4box.createFile();
    const startSec = toSeconds(entry.startMs);
    const trimInSec = toSeconds(entry.trimInMs || entry?.clip?.trimInMs || 0);
    const trimOutSec = toSeconds(entry.trimOutMs || entry?.clip?.trimOutMs || 0);
    const hasTrimWindow = Number.isFinite(trimOutSec) && trimOutSec > trimInSec + 0.05;

    return await new Promise((resolve) => {
      let readyInfo = null;
      let videoTrackId = 0;
      let initAppended = false;

      mp4boxfile.onError = () => resolve(false);
      mp4boxfile.onReady = (info) => {
        if (token !== engineToken) return resolve(false);
        readyInfo = info;
        const mime = buildMimeFromInfo(info);
        if (!mime) return resolve(false);
        if (!activeMime) {
          activeMime = mime;
          if (!MediaSource.isTypeSupported(activeMime)) {
            status(`MSE no soporta ${activeMime}`, "unsupported");
            return resolve(false);
          }
          try {
            sourceBuffer = mediaSource.addSourceBuffer(activeMime);
            sourceBuffer.addEventListener("updateend", onUpdateEnd);
            // Para concatenación por offsets (timeline absoluto) dejamos modo default ("segments").
          } catch (_) {
            return resolve(false);
          }
        } else if (activeMime !== mime) {
          status("Codecs distintos entre clips; fallback.", "unsupported", { activeMime, nextMime: mime });
          return resolve(false);
        }

        const tracks = Array.isArray(info?.tracks) ? info.tracks : [];
        const vt = tracks.find((t) => String(t?.type || "").toLowerCase() === "video") || tracks[0] || null;
        videoTrackId = Number(vt?.id || 0) || 0;
        if (!videoTrackId) return resolve(false);

        try {
          mp4boxfile.setSegmentOptions(videoTrackId, { entryIndex }, { nbSamples: 60 });
          const initSegs = mp4boxfile.initializeSegmentation();
          const init = Array.isArray(initSegs)
            ? initSegs.find((seg) => Number(seg?.id || 0) === videoTrackId) || initSegs[0] || null
            : null;
          if (!init?.buffer) return resolve(false);
          try {
            // Window de append para trims.
            if (hasTrimWindow) {
              sourceBuffer.appendWindowStart = Math.max(0, startSec + trimInSec);
              sourceBuffer.appendWindowEnd = Math.max(sourceBuffer.appendWindowStart + 0.05, startSec + trimOutSec);
            } else {
              sourceBuffer.appendWindowStart = 0;
              sourceBuffer.appendWindowEnd = Number.POSITIVE_INFINITY;
            }
          } catch (_) {
            // ignore
          }
          try {
            sourceBuffer.timestampOffset = startSec;
          } catch (_) {
            // ignore
          }
          queueAppend(init.buffer);
          initAppended = true;
          mp4boxfile.start();
        } catch (_) {
          return resolve(false);
        }
      };

      mp4boxfile.onSegment = (id, user, buffer) => {
        if (token !== engineToken) return;
        if (!initAppended) return;
        if (Number(id || 0) !== Number(videoTrackId || 0)) return;
        if (!buffer) return;
        queueAppend(buffer);
      };

      // Feed data in one chunk.
      data.fileStart = 0;
      mp4boxfile.appendBuffer(data);
      mp4boxfile.flush();

      // Consider clip "appended" once metadata is ready.
      const settleTimer = setTimeout(() => {
        clearTimeout(settleTimer);
        if (!readyInfo) return resolve(false);
        // Actualiza el buffered end real; si todavía no alcanzó, igual seguimos y el tick
        // seguirá empujando más clips/segmentos.
        bufferedUntilMs = Math.max(bufferedUntilMs, bufferedEndMs(), Number(entry.endMs || 0));
        resolve(true);
      }, 2200);
    });
  }

  async function ensureBufferedAhead(token) {
    if (token !== engineToken) return;
    bufferedUntilMs = Math.max(bufferedUntilMs, bufferedEndMs());
    const currentMs = Math.max(0, Number(video.currentTime || 0) * 1000);
    const targetMs = currentMs + bufferAheadMs;
    while (nextEntryIndex < entries.length && bufferedUntilMs < targetMs) {
      const entry = entries[nextEntryIndex];
      const ok = await appendClipAtOffset({ entry, entryIndex: nextEntryIndex, token });
      if (!ok) throw new Error("mse-append-failed");
      nextEntryIndex += 1;
      if (token !== engineToken) return;
      bufferedUntilMs = Math.max(bufferedUntilMs, bufferedEndMs(), Number(entry.endMs || 0));
    }
  }

  async function ensureMinEntriesBuffered(minCount = 2, token) {
    if (token !== engineToken) return;
    const targetIndex = Math.min(entries.length, Math.max(0, nextEntryIndex) + Math.max(1, Number(minCount || 0)));
    while (nextEntryIndex < targetIndex) {
      const entry = entries[nextEntryIndex];
      const ok = await appendClipAtOffset({ entry, entryIndex: nextEntryIndex, token });
      if (!ok) throw new Error("mse-append-failed");
      nextEntryIndex += 1;
      if (token !== engineToken) return;
      bufferedUntilMs = Math.max(bufferedUntilMs, bufferedEndMs(), Number(entry?.endMs || 0));
    }
  }

  function syncVoiceForPlayhead(ms = 0, token) {
    if (token !== engineToken) return;
    const idx = pickEntryIndexByMs(ms);
    const entry = entries[idx] || null;
    const rowId = String(entry?.rowId || "").trim();
    const src = String(entry?.audioSrc || "").trim();
    const startMs = Number(entry?.startMs || 0) || 0;
    const trimInMs = Number(entry?.clip?.trimInMs || entry?.trimInMs || 0) || 0;
    const offsetWithin = Math.max(0, (Number(ms || 0) - startMs) + trimInMs);

    if (!rowId || !src) {
      stopVoice();
      return;
    }
    const shouldSwap = rowId !== voiceRowId || src !== voiceSrc || !voiceAudio;
    if (shouldSwap) {
      stopVoice();
      voiceAudio = new Audio(src);
      voiceAudio.preload = "auto";
      voiceRowId = rowId;
      voiceSrc = src;
      try { voiceAudio.playbackRate = rate; } catch (_) {}
      try { voiceAudio.volume = clampNumber(volumes.master * volumes.voice, 0, 1); } catch (_) {}
      try { voiceAudio.currentTime = offsetWithin / 1000; } catch (_) {}
      voiceAudio.play().catch((error) => {
        const name = String(error?.name || "").trim();
        if (name === "NotAllowedError") {
          status("Audio bloqueado por autoplay; el video continúa.", "warn", { rowId });
          stopVoice();
          return;
        }
        stopVoice();
      });
      return;
    }
    // Keep in sync lightly.
    try { voiceAudio.playbackRate = rate; } catch (_) {}
    try { voiceAudio.volume = clampNumber(volumes.master * volumes.voice, 0, 1); } catch (_) {}
    const drift = Math.abs(Number(voiceAudio.currentTime || 0) - (offsetWithin / 1000));
    if (drift > 0.45) {
      try { voiceAudio.currentTime = offsetWithin / 1000; } catch (_) {}
    }
    if (voiceAudio.paused) {
      voiceAudio.play().catch(() => {
        stopVoice();
      });
    }
  }

  function onTimeUpdate() {
    const ms = Math.max(0, Number(video.currentTime || 0) * 1000);
    const token = engineToken;
    try {
      if (typeof onPlayhead === "function") onPlayhead(ms);
    } catch (_) {}
    syncVoiceForPlayhead(ms, token);
    ensureBufferedAhead(token).catch(() => {});
  }

  function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      const token = engineToken;
      ensureBufferedAhead(token).catch(() => {});
      // Si el reproductor se queda esperando buffer, intenta reanudar.
      try {
        if (video.paused && bufferedEndMs() > Number(video.currentTime || 0) * 1000 + 120) {
          video.play().catch(() => {});
        }
      } catch (_) {}
    }, 220);
  }

  function stopTick() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = 0;
  }

  function onWaiting() {
    const token = engineToken;
    ensureBufferedAhead(token).catch(() => {});
    // Intenta continuar si ya hay buffer.
    try { video.play().catch(() => {}); } catch (_) {}
  }

  function onEnded() {
    const token = engineToken;
    // Si hay más timeline por reproducir, el ended probablemente se disparó por duration
    // corto (solo primer clip). Empuja buffer y reintenta play.
    if (timelineDurationMs > 0 && Number(video.currentTime || 0) * 1000 < timelineDurationMs - 50) {
      ensureBufferedAhead(token).catch(() => {});
      // Fuerza un pequeño avance para caer dentro del siguiente clip si estamos EXACTO en borde.
      try { video.currentTime = (Number(video.currentTime || 0) + 0.001); } catch (_) {}
      try { video.play().catch(() => {}); } catch (_) {}
      return;
    }
    status("Playback ended", "info");
  }

  function attachListeners() {
    try { video.addEventListener("timeupdate", onTimeUpdate); } catch (_) {}
    try { video.addEventListener("waiting", onWaiting); } catch (_) {}
    try { video.addEventListener("stalled", onWaiting); } catch (_) {}
    try { video.addEventListener("ended", onEnded); } catch (_) {}
  }

  function detachListeners() {
    try { video.removeEventListener("timeupdate", onTimeUpdate); } catch (_) {}
    try { video.removeEventListener("waiting", onWaiting); } catch (_) {}
    try { video.removeEventListener("stalled", onWaiting); } catch (_) {}
    try { video.removeEventListener("ended", onEnded); } catch (_) {}
  }

  function loadTimeline(nextEntries = []) {
    const list = Array.isArray(nextEntries) ? nextEntries.filter(Boolean) : [];
    entries = list
      .map((e) => ({
        ...e,
        rowId: String(e?.rowId || "").trim(),
        startMs: Math.max(0, Number(e?.startMs || 0)),
        endMs: Math.max(0, Number(e?.endMs || 0)),
        videoSrc: String(e?.videoSrc || "").trim(),
        audioSrc: String(e?.audioSrc || "").trim(),
        trimInMs: Math.max(0, Number(e?.clip?.trimInMs || e?.trimInMs || 0)),
        trimOutMs: Math.max(0, Number(e?.clip?.trimOutMs || e?.trimOutMs || 0))
      }))
      .sort((a, b) => a.startMs - b.startMs);
    timelineDurationMs = entries.reduce((acc, e) => Math.max(acc, Number(e?.endMs || 0)), 0);
    resetMedia();
    stopVoice();
    attachListeners();
  }

  async function play(fromMs = 0) {
    const token = ++engineToken;
    if (!isSupported()) {
      status("MSE no disponible en este navegador.", "unsupported");
      return { ok: false, reason: "unsupported" };
    }
    if (!entries.length) return { ok: false, reason: "no-entries" };
    const openOk = await ensureMediaSourceOpen();
    if (!openOk) return { ok: false, reason: "mse-open-failed" };
    try {
      if (timelineDurationMs > 0 && mediaSource && mediaSource.readyState === "open") {
        mediaSource.duration = Math.max(0.1, timelineDurationMs / 1000);
      }
    } catch (_) {}

    // Start buffering from entry at playhead.
    const startMs = Math.max(0, Number(fromMs || 0));
    const startIndex = pickEntryIndexByMs(startMs);
    nextEntryIndex = startIndex;
    bufferedUntilMs = startMs;
    status("Cargando preview (MSE)…", "info");

    // Kick first append; if it fails, return unsupported.
    try {
      await ensureMinEntriesBuffered(2, token);
      await ensureBufferedAhead(token);
    } catch (_) {
      status("No se pudo preparar MSE para este timeline; usando fallback.", "unsupported");
      resetMedia();
      return { ok: false, reason: "append-failed" };
    }

    setRate(rate);
    setVolumes(volumes);
    // Seek to timeline time.
    try { video.currentTime = startMs / 1000; } catch (_) {}
    const played = await (async () => {
      try {
        // Reproducimos video en muted para no chocar autoplay.
        try { video.muted = true; } catch (_) {}
        try { video.volume = 0; } catch (_) {}
        await video.play();
        startTick();
        return true;
      } catch (error) {
        const name = String(error?.name || "").trim();
        if (name === "NotAllowedError") return false;
        throw error;
      }
    })();

    if (!played) {
      status("Playback bloqueado por autoplay; espera gesto del usuario.", "warn");
      return { ok: true, autoplayBlocked: true };
    }

    // Intento de audio de voz (puede bloquearse; eso es aceptable).
    syncVoiceForPlayhead(startMs, token);
    status("Reproduciendo (MSE)…", "info");
    return { ok: true };
  }

  function pause() {
    engineToken += 1;
    stopTick();
    try { video.pause(); } catch (_) {}
    if (voiceAudio) {
      try { voiceAudio.pause(); } catch (_) {}
    }
  }

  function stop({ keepCursor = false } = {}) {
    engineToken += 1;
    stopTick();
    try { video.pause(); } catch (_) {}
    if (!keepCursor) {
      try { video.currentTime = 0; } catch (_) {}
    }
    stopVoice();
  }

  function seek(ms = 0) {
    const t = Math.max(0, Number(ms || 0));
    try { video.currentTime = t / 1000; } catch (_) {}
    // Buffer a partir del seek point.
    const startIndex = pickEntryIndexByMs(t);
    if (startIndex < nextEntryIndex) {
      // No removemos buffers ya apendados; solo aseguramos ahead.
    } else {
      nextEntryIndex = startIndex;
    }
    ensureBufferedAhead(engineToken).catch(() => {});
  }

  function destroy() {
    stopTick();
    detachListeners();
    resetMedia();
    stopVoice();
  }

  return {
    isSupported,
    loadTimeline,
    play,
    pause,
    stop,
    seek,
    setRate,
    setVolumes,
    destroy,
    _debug: () => ({
      activeMime,
      bufferedUntilMs,
      nextEntryIndex,
      queue: appendQueue.length
    })
  };
}
