function normalizePct(value, fallback = 0) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return Math.max(0, Math.min(100, Number(fallback || 0) || 0));
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function hasDialogueAudioSource(audio = null) {
  return Boolean(
    audio
    && typeof audio === "object"
    && (
      String(audio.storagePath || "").trim()
      || String(audio.downloadUrl || audio.url || "").trim()
      || String(audio.dataUrl || audio.localDataUrl || "").trim()
      || String(audio.localMediaCacheKey || "").trim()
    )
  );
}

function buildDialogueAudioEntry(dialogueAudio = null, fallbackCacheKey = "") {
  if (!hasDialogueAudioSource(dialogueAudio)) return null;
  return {
    storagePath: String(dialogueAudio?.storagePath || "").trim(),
    url: String(dialogueAudio?.downloadUrl || dialogueAudio?.url || "").trim(),
    downloadUrl: String(dialogueAudio?.downloadUrl || dialogueAudio?.url || "").trim(),
    dataUrl: String(dialogueAudio?.dataUrl || dialogueAudio?.localDataUrl || "").trim(),
    localDataUrl: String(dialogueAudio?.dataUrl || dialogueAudio?.localDataUrl || "").trim(),
    mimeType: String(dialogueAudio?.mimeType || "audio/wav").trim() || "audio/wav",
    localMediaCacheKey: String(dialogueAudio?.localMediaCacheKey || fallbackCacheKey || "").trim()
  };
}

function reconcileMontageExportAudioIntent(input = {}, session = null) {
  const sourceInput = input && typeof input === "object" ? input : {};
  const sourceSession = session && typeof session === "object" ? session : {};
  const entries = Array.isArray(sourceInput.entries) ? sourceInput.entries : [];
  if (!entries.length) return sourceInput;

  const videoCfg = sourceSession?.podcastVideoConfig && typeof sourceSession.podcastVideoConfig === "object"
    ? sourceSession.podcastVideoConfig
    : {};
  const clipMap = videoCfg?.timelineClipsByRowId && typeof videoCfg.timelineClipsByRowId === "object"
    ? videoCfg.timelineClipsByRowId
    : {};
  const defaultVeoPct = normalizePct(videoCfg?.montageDefaultVeoVolumePct, 0);
  const defaultGeminiPct = normalizePct(videoCfg?.montageDefaultGeminiVolumePct, 100);
  const dialogueAudioMap = sourceInput?.dialogueAudioMap && typeof sourceInput.dialogueAudioMap === "object"
    ? sourceInput.dialogueAudioMap
    : {};
  const timelineAudioSegments = Array.isArray(sourceInput.timelineAudioSegments)
    ? sourceInput.timelineAudioSegments
    : [];

  let hasGeminiTimelineAudio = false;
  const nextEntries = entries.map((entry) => {
    const sourceEntry = entry && typeof entry === "object" ? entry : {};
    const rowId = String(sourceEntry.rowId || "").trim();
    const clip = rowId ? (clipMap?.[rowId] && typeof clipMap[rowId] === "object" ? clipMap[rowId] : {}) : {};
    const dialogueAudio = rowId ? (dialogueAudioMap?.[rowId] && typeof dialogueAudioMap[rowId] === "object" ? dialogueAudioMap[rowId] : null) : null;
    const veoPct = Object.prototype.hasOwnProperty.call(clip, "veoVolumeOverridePct")
      ? normalizePct(clip.veoVolumeOverridePct, defaultVeoPct)
      : normalizePct(sourceEntry.veoVolumeOverridePct, defaultVeoPct);
    const geminiPct = Object.prototype.hasOwnProperty.call(clip, "geminiVolumeOverridePct")
      ? normalizePct(clip.geminiVolumeOverridePct, defaultGeminiPct)
      : normalizePct(sourceEntry.geminiVolumeOverridePct, defaultGeminiPct);
    const useNativeVideoAudio = veoPct > 0;
    if (geminiPct > 0 && hasDialogueAudioSource(dialogueAudio)) {
      hasGeminiTimelineAudio = true;
    }
    return {
      ...sourceEntry,
      useNativeVideoAudio,
      veoVolumeOverridePct: veoPct,
      geminiVolumeOverridePct: geminiPct
    };
  });

  const hasIndependentTimelineAudioSegments = timelineAudioSegments.some((segment) => {
    const rowId = String(segment?.rowId || "").trim();
    const kind = String(segment?.kind || "").trim().toLowerCase();
    if (!rowId) return true;
    if (["uploaded", "background-track", "background", "music"].includes(kind)) return true;
    return false;
  });
  const nextUseTimelineAudio = hasGeminiTimelineAudio || hasIndependentTimelineAudioSegments;
  const hydratedEntries = nextEntries.map((entry) => {
    if (nextUseTimelineAudio) {
      return {
        ...entry,
        audio: null
      };
    }
    if (entry.useNativeVideoAudio === true) return entry;
    const rowId = String(entry?.rowId || "").trim();
    const dialogueAudio = rowId ? dialogueAudioMap?.[rowId] || null : null;
    return {
      ...entry,
      audio: buildDialogueAudioEntry(dialogueAudio, entry?.audio?.localMediaCacheKey || "")
    };
  });

  return {
    ...sourceInput,
    useTimelineAudio: nextUseTimelineAudio,
    entries: hydratedEntries
  };
}

module.exports = {
  reconcileMontageExportAudioIntent
};
