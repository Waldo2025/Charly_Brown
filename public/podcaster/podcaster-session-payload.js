export function measureJsonUtf8Bytes(value = null) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch (_) {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function cloneSerializable(value = null) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch (_) {
    return value;
  }
}

function resolvePanelMusicPayloadSourceDurationMs(track = null) {
  const source = track && typeof track === "object" ? track : {};
  const durationFromSec = Math.max(0, Math.round((Number(source.durationSec || 0) || 0) * 1000));
  const durationFromTrim = Math.max(0, Math.round(Number(source.trimOutMs || 0) || 0));
  const durationFromLoops = Array.isArray(source.loopSettings)
    ? source.loopSettings.reduce((max, item) => {
      const trimOutMs = Math.max(0, Math.round(Number(item?.trimOutMs || 0) || 0));
      return Math.max(max, trimOutMs);
    }, 0)
    : 0;
  return Math.max(durationFromSec, durationFromTrim, durationFromLoops);
}

export function buildCloudSessionPayload(source = null, panelMusicState = {}, chatState = [], deps = {}) {
  if (!source || typeof source !== "object") return null;

  const {
    makeId,
    nowIso,
    isCreativeVideoMode,
    getSpeakerOptions,
    normalizePodcastStudioUiState,
    getSpeakerVoiceMap,
    getSpeakerExpressionMap,
    getSpeakerNameMap,
    getSpeakerScenarioMap,
    getSpeakerScenarioVariantsMap,
    getGlobalScenarioDeck,
    normalizeDisfluencyConfig,
    DEFAULT_DISFLUENCY_CONFIG,
    resolvePanelMusicTrackKind,
    getPanelMusicUploadedTracks,
    normalizePanelMusicLoopSettings,
    normalizePanelMusicMutedLoopIndexes,
    getSpeakerPortraitMap,
    getSpeakerReferenceImageMap,
    getScenarioReferenceImageMap,
    getRowReferenceImageListMap,
    getRowReferenceImageMap,
    getRowReferenceVideoMap,
    getRowReferenceModeByRowId,
    getDialogueVideoMap,
    getDialogueAudioMap,
    normalizePodcastVideoConfig,
    normalizeCreativeVideoConfig
  } = deps;

  const chat = Array.isArray(chatState) ? chatState : (Array.isArray(source.chat) ? source.chat : []);
  const rows = Array.isArray(source?.script?.rows) ? source.script.rows : [];
  const sourcePanelMusicConfig = source?.panelMusicConfig && typeof source.panelMusicConfig === "object"
    ? source.panelMusicConfig
    : null;
  const panelMusicConfig = sourcePanelMusicConfig || {
    preset: panelMusicState.preset,
    volume: panelMusicState.volume,
    montageVolume: panelMusicState.montageVolume,
    duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(panelMusicState.duckingWhenGeminiPct ?? 60))),
    stabilize: panelMusicState.stabilize === true,
    sourceType: panelMusicState.sourceType,
    selectedTrackKind: resolvePanelMusicTrackKind?.(panelMusicState.selectedTrackKind) || "preset",
    trackLibrary: {
      uploaded: panelMusicState.trackLibrary?.uploaded || null,
      uploadedTracks: getPanelMusicUploadedTracks?.() || [],
      ai: panelMusicState.trackLibrary?.ai || null
    },
    track: panelMusicState.track || null
  };
  const resolvedVideoContentType = (() => {
    const rawType = String(
      source?.script?.videoContentType
      || source?.videoContentType
      || ""
    ).trim().toLowerCase();
    if (rawType === "creative") return "creative";
    if (rawType === "videopodcast" || rawType === "video-podcast" || rawType === "video_podcast") return "videopodcast";
    return null;
  })();

  return {
    id: String(source.id || "").trim() || makeId?.("session"),
    title: String(source.title || "Sesión sin título").trim().slice(0, 160),
    prompt: String(source.prompt || "").slice(0, 4000),
    archived: source.archived === true,
    publicar: source.publicar === true,
    nivel: String(source.nivel || "").trim().slice(0, 60),
    grado: String(source.grado || "").trim().slice(0, 60),
    trimestre: String(source.trimestre || "").trim().slice(0, 20),
    unidad: String(source.unidad || "").trim().slice(0, 20),
    videoContentType: resolvedVideoContentType,
    updatedAt: nowIso?.() || new Date().toISOString(),
    podcastStudioUiState: normalizePodcastStudioUiState?.(source.podcastStudioUiState || null, source) || {},
    chat: chat.slice(-220).map((msg) => ({
      id: String(msg?.id || makeId?.("msg")).trim(),
      role: ["assistant", "user", "system"].includes(String(msg?.role || "")) ? String(msg.role) : "assistant",
      text: String(msg?.text || "").slice(0, 8000)
    })),
    script: {
      episodeTitle: String(source?.script?.episodeTitle || "Podcast").slice(0, 220),
      summary: String(source?.script?.summary || "").slice(0, 5000),
      videoContentType: resolvedVideoContentType,
      videoMode: resolvedVideoContentType === "creative",
      hosts: isCreativeVideoMode?.(source) ? ["Narrador"] : (getSpeakerOptions?.(source) || []).slice(0, 10),
      rows: rows.slice(0, 400).map((row) => {
        const nextRow = { ...row };
        if (!nextRow.id) nextRow.id = makeId?.("row");
        if (typeof nextRow.text === "string") nextRow.text = nextRow.text.slice(0, 10000);
        if (typeof nextRow.voiceOverText === "string") nextRow.voiceOverText = nextRow.voiceOverText.slice(0, 10000);
        if (typeof nextRow.voiceOverOriginalText === "string") nextRow.voiceOverOriginalText = nextRow.voiceOverOriginalText.slice(0, 10000);
        if (typeof nextRow.sceneDescription === "string") nextRow.sceneDescription = nextRow.sceneDescription.slice(0, 4000);
        if (typeof nextRow.onScreenText === "string") nextRow.onScreenText = nextRow.onScreenText.slice(0, 1200);
        if (typeof nextRow.transition === "string") nextRow.transition = nextRow.transition.slice(0, 800);
        if (typeof nextRow.visualNotes === "string") nextRow.visualNotes = nextRow.visualNotes.slice(0, 4000);
        if (typeof nextRow.visualNotesProposal === "string") nextRow.visualNotesProposal = nextRow.visualNotesProposal.slice(0, 4000);
        if (Array.isArray(nextRow.visualNotesProposals)) nextRow.visualNotesProposals = nextRow.visualNotesProposals.slice(0, 100);
        if (Array.isArray(nextRow.visualNotesResolvedProposals)) nextRow.visualNotesResolvedProposals = nextRow.visualNotesResolvedProposals.slice(0, 100);
        if (typeof nextRow.scenePrompt === "string") nextRow.scenePrompt = nextRow.scenePrompt.slice(0, 4000);
        if (typeof nextRow.videoDirective === "string") nextRow.videoDirective = nextRow.videoDirective.slice(0, 4000);
        if (typeof nextRow.voiceName === "string") nextRow.voiceName = nextRow.voiceName.slice(0, 120);
        nextRow.voiceNameSource = String(nextRow.voiceNameSource || "").trim().toLowerCase() === "row" ? "row" : "host";

        return nextRow;
      })
    },
    speakerVoiceMap: getSpeakerVoiceMap?.(source) || {},
    speakerExpressionMap: getSpeakerExpressionMap?.(source) || {},
    speakerNameMap: getSpeakerNameMap?.(source) || {},
    speakerScenarioMap: getSpeakerScenarioMap?.(source) || {},
    speakerScenarioVariantsMap: getSpeakerScenarioVariantsMap?.(source) || {},
    globalScenarioDeck: getGlobalScenarioDeck?.(source) || null,
    disfluencyDefaults: normalizeDisfluencyConfig?.(source?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG) || {},
    panelMusicConfig: {
      preset: String(panelMusicConfig.preset || "ambient"),
      volume: Math.max(0, Math.min(100, Number(panelMusicConfig.volume) || 0)),
      montageVolume: Math.max(0, Math.min(100, Number(panelMusicConfig.montageVolume ?? 0))),
      duckingWhenGeminiPct: Math.max(40, Math.min(100, Number(panelMusicConfig.duckingWhenGeminiPct ?? 60))),
      stabilize: panelMusicConfig.stabilize === true,
      sourceType: panelMusicConfig.sourceType === "track" ? "track" : "preset",
      selectedTrackKind: resolvePanelMusicTrackKind?.(panelMusicConfig.selectedTrackKind) || "preset",
      trackLibrary: {
        uploaded: panelMusicConfig.trackLibrary?.uploaded
          ? {
            libraryId: String(panelMusicConfig.trackLibrary.uploaded.libraryId || "").trim(),
            slotLabel: String(panelMusicConfig.trackLibrary.uploaded.slotLabel || "Audio 1").trim() || "Audio 1",
            name: String(panelMusicConfig.trackLibrary.uploaded.name || "Audio").trim() || "Audio",
            mimeType: String(panelMusicConfig.trackLibrary.uploaded.mimeType || "audio/mpeg").trim() || "audio/mpeg",
            size: Math.max(0, Number(panelMusicConfig.trackLibrary.uploaded.size || 0) || 0),
            durationSec: Math.max(0, Number(panelMusicConfig.trackLibrary.uploaded.durationSec || 0) || 0),
            startOffsetMs: Math.max(0, Number(panelMusicConfig.trackLibrary.uploaded.startOffsetMs || 0) || 0),
            trimInMs: Math.max(0, Number(panelMusicConfig.trackLibrary.uploaded.trimInMs || 0) || 0),
            trimOutMs: Math.max(0, Number(panelMusicConfig.trackLibrary.uploaded.trimOutMs || 0) || 0),
            enabledInSession: panelMusicConfig.trackLibrary.uploaded.enabledInSession !== false,
            durationMeasuredWith: String(panelMusicConfig.trackLibrary.uploaded.durationMeasuredWith || "").trim().toLowerCase(),
            loopSettings: normalizePanelMusicLoopSettings?.(
              panelMusicConfig.trackLibrary.uploaded.loopSettings || [],
              resolvePanelMusicPayloadSourceDurationMs(panelMusicConfig.trackLibrary.uploaded)
            ) || [],
            segmentStartOverrides: Array.isArray(panelMusicConfig.trackLibrary.uploaded.segmentStartOverrides)
              ? panelMusicConfig.trackLibrary.uploaded.segmentStartOverrides.map((item) => ({
                loopIndex: Math.max(0, Number(item?.loopIndex || 0) || 0),
                startMs: Math.max(0, Number(item?.startMs || 0) || 0)
              }))
              : [],
            downloadUrl: String(panelMusicConfig.trackLibrary.uploaded.downloadUrl || "").trim(),
            storagePath: String(panelMusicConfig.trackLibrary.uploaded.storagePath || "").trim(),
            updatedAt: String(panelMusicConfig.trackLibrary.uploaded.updatedAt || nowIso?.() || new Date().toISOString()).trim(),
            mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes?.(panelMusicConfig.trackLibrary.uploaded.mutedLoopIndexes || []) || []
          }
          : null,
        uploadedTracks: Array.isArray(panelMusicConfig.trackLibrary?.uploadedTracks)
          ? panelMusicConfig.trackLibrary.uploadedTracks.map((track, index) => ({
            libraryId: String(track?.libraryId || "").trim(),
            slotLabel: String(track?.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
            name: String(track?.name || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
            mimeType: String(track?.mimeType || "audio/mpeg").trim() || "audio/mpeg",
            size: Math.max(0, Number(track?.size || 0) || 0),
            durationSec: Math.max(0, Number(track?.durationSec || 0) || 0),
            startOffsetMs: Math.max(0, Number(track?.startOffsetMs || 0) || 0),
            trimInMs: Math.max(0, Number(track?.trimInMs || 0) || 0),
            trimOutMs: Math.max(0, Number(track?.trimOutMs || 0) || 0),
            enabledInSession: track?.enabledInSession !== false,
            durationMeasuredWith: String(track?.durationMeasuredWith || "").trim().toLowerCase(),
            loopSettings: normalizePanelMusicLoopSettings?.(
              track?.loopSettings || [],
              resolvePanelMusicPayloadSourceDurationMs(track)
            ) || [],
            segmentStartOverrides: Array.isArray(track?.segmentStartOverrides)
              ? track.segmentStartOverrides.map((item) => ({
                loopIndex: Math.max(0, Number(item?.loopIndex || 0) || 0),
                startMs: Math.max(0, Number(item?.startMs || 0) || 0)
              }))
              : [],
            downloadUrl: String(track?.downloadUrl || "").trim(),
            storagePath: String(track?.storagePath || "").trim(),
            updatedAt: String(track?.updatedAt || nowIso?.() || new Date().toISOString()).trim(),
            mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes?.(track?.mutedLoopIndexes || []) || []
          })).filter((track) => track.downloadUrl || track.storagePath || track.name)
          : [],
        ai: panelMusicConfig.trackLibrary?.ai
          ? {
            name: String(panelMusicConfig.trackLibrary.ai.name || "Audio IA").trim() || "Audio IA",
            mimeType: String(panelMusicConfig.trackLibrary.ai.mimeType || "audio/mpeg").trim() || "audio/mpeg",
            size: Math.max(0, Number(panelMusicConfig.trackLibrary.ai.size || 0) || 0),
            durationSec: Math.max(0, Number(panelMusicConfig.trackLibrary.ai.durationSec || 0) || 0),
            startOffsetMs: Math.max(0, Number(panelMusicConfig.trackLibrary.ai.startOffsetMs || 0) || 0),
            trimInMs: Math.max(0, Number(panelMusicConfig.trackLibrary.ai.trimInMs || 0) || 0),
            trimOutMs: Math.max(0, Number(panelMusicConfig.trackLibrary.ai.trimOutMs || 0) || 0),
            durationMeasuredWith: String(panelMusicConfig.trackLibrary.ai.durationMeasuredWith || "").trim().toLowerCase(),
            loopSettings: normalizePanelMusicLoopSettings?.(
              panelMusicConfig.trackLibrary.ai.loopSettings || [],
              resolvePanelMusicPayloadSourceDurationMs(panelMusicConfig.trackLibrary.ai)
            ) || [],
            segmentStartOverrides: Array.isArray(panelMusicConfig.trackLibrary.ai.segmentStartOverrides)
              ? panelMusicConfig.trackLibrary.ai.segmentStartOverrides.map((item) => ({
                loopIndex: Math.max(0, Number(item?.loopIndex || 0) || 0),
                startMs: Math.max(0, Number(item?.startMs || 0) || 0)
              }))
              : [],
            downloadUrl: String(panelMusicConfig.trackLibrary.ai.downloadUrl || "").trim(),
            storagePath: String(panelMusicConfig.trackLibrary.ai.storagePath || "").trim(),
            updatedAt: String(panelMusicConfig.trackLibrary.ai.updatedAt || nowIso?.() || new Date().toISOString()).trim(),
            model: String(panelMusicConfig.trackLibrary.ai.model || "").trim(),
            prompt: String(panelMusicConfig.trackLibrary.ai.prompt || "").trim(),
            mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes?.(panelMusicConfig.trackLibrary.ai.mutedLoopIndexes || []) || []
          }
          : null
      },
      track: panelMusicConfig.track
        ? {
          libraryId: String(panelMusicConfig.track.libraryId || "").trim(),
          slotLabel: String(panelMusicConfig.track.slotLabel || "").trim(),
          name: String(panelMusicConfig.track.name || "Audio").trim() || "Audio",
          mimeType: String(panelMusicConfig.track.mimeType || "audio/mpeg").trim() || "audio/mpeg",
          size: Math.max(0, Number(panelMusicConfig.track.size || 0) || 0),
          durationSec: Math.max(0, Number(panelMusicConfig.track.durationSec || 0) || 0),
          startOffsetMs: Math.max(0, Number(panelMusicConfig.track.startOffsetMs || 0) || 0),
          trimInMs: Math.max(0, Number(panelMusicConfig.track.trimInMs || 0) || 0),
          trimOutMs: Math.max(0, Number(panelMusicConfig.track.trimOutMs || 0) || 0),
          durationMeasuredWith: String(panelMusicConfig.track.durationMeasuredWith || "").trim().toLowerCase(),
          loopSettings: normalizePanelMusicLoopSettings?.(
            panelMusicConfig.track.loopSettings || [],
            resolvePanelMusicPayloadSourceDurationMs(panelMusicConfig.track)
          ) || [],
          segmentStartOverrides: Array.isArray(panelMusicConfig.track.segmentStartOverrides)
            ? panelMusicConfig.track.segmentStartOverrides.map((item) => ({
              loopIndex: Math.max(0, Number(item?.loopIndex || 0) || 0),
              startMs: Math.max(0, Number(item?.startMs || 0) || 0)
            }))
            : [],
          downloadUrl: String(panelMusicConfig.track.downloadUrl || "").trim(),
          storagePath: String(panelMusicConfig.track.storagePath || "").trim(),
          updatedAt: String(panelMusicConfig.track.updatedAt || nowIso?.() || new Date().toISOString()).trim(),
          model: String(panelMusicConfig.track.model || "").trim(),
          prompt: String(panelMusicConfig.track.prompt || "").trim(),
          mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes?.(panelMusicConfig.track.mutedLoopIndexes || []) || []
        }
        : null
    },
    speakerPortraitMap: getSpeakerPortraitMap?.(source) || {},
    speakerReferenceImageMap: getSpeakerReferenceImageMap?.(source) || {},
    scenarioReferenceImageMap: getScenarioReferenceImageMap?.(source) || {},
    rowReferenceImageListMap: getRowReferenceImageListMap?.(source) || {},
    rowReferenceImageMap: getRowReferenceImageMap?.(source) || {},
    rowReferenceVideoMap: getRowReferenceVideoMap?.(source) || {},
    rowReferenceModeByRowId: getRowReferenceModeByRowId?.(source) || {},
    dialogueVideoMap: getDialogueVideoMap?.(source) || {},
    dialogueAudioMap: getDialogueAudioMap?.(source) || {},
    podcastVideoConfig: normalizePodcastVideoConfig?.(source?.podcastVideoConfig || {}) || {},
    creativeVideoConfig: normalizeCreativeVideoConfig?.(source?.creativeVideoConfig || {}) || {},
    visualEffectsMap: source?.visualEffectsMap || {},
    stylizedTextMap: source?.stylizedTextMap || {}
  };
}

export function compactCloudSessionPayload(payload = null, deps = {}) {
  const source = payload && typeof payload === "object" ? payload : null;
  if (!source) {
    return {
      payload,
      bytes: 0,
      strippedReferenceMedia: false,
      trimmedChat: false
    };
  }
  
  const targetBytes = deps.CLOUD_SESSION_PAYLOAD_TARGET_BYTES || 850000;
  const initialBytes = measureJsonUtf8Bytes(source);
  if (initialBytes <= targetBytes) {
    return {
      payload: source,
      bytes: initialBytes,
      strippedReferenceMedia: false,
      trimmedChat: false
    };
  }

  let next = cloneSerializable(source);
  let strippedReferenceMedia = false;
  let trimmedChat = false;

  const hasGlobalReferenceMedia = Boolean(
    Object.keys(next?.speakerReferenceImageMap || {}).length
    || Object.keys(next?.scenarioReferenceImageMap || {}).length
  );
  if (hasGlobalReferenceMedia) {
    next.speakerReferenceImageMap = {};
    next.scenarioReferenceImageMap = {};
    strippedReferenceMedia = true;
  }

  let bytes = measureJsonUtf8Bytes(next);
  if (bytes <= targetBytes) {
    return { payload: next, bytes, strippedReferenceMedia, trimmedChat };
  }

  const chat = Array.isArray(next?.chat) ? next.chat : [];
  if (chat.length > 80) {
    next.chat = chat.slice(-80);
    trimmedChat = true;
    bytes = measureJsonUtf8Bytes(next);
  }

  if (bytes <= targetBytes) {
    return { payload: next, bytes, strippedReferenceMedia, trimmedChat };
  }

  const rowsToClean = deps.normalizeRows?.(next?.script?.rows) || [];
  if (rowsToClean.length > 0) {
    next.script.rows = rowsToClean.map((row) => ({
      ...row,
      imagePrompts: []
    }));
    bytes = measureJsonUtf8Bytes(next);
  }

  if (bytes <= targetBytes) {
    return { payload: next, bytes, strippedReferenceMedia, trimmedChat };
  }

  const hasRowReferenceMedia = Boolean(
    Object.keys(next?.rowReferenceImageListMap || {}).length
    || Object.keys(next?.rowReferenceImageMap || {}).length
    || Object.keys(next?.rowReferenceVideoMap || {}).length
  );
  if (hasRowReferenceMedia) {
    next.rowReferenceImageListMap = {};
    next.rowReferenceImageMap = {};
    next.rowReferenceVideoMap = {};
    next.rowReferenceModeByRowId = {};
    strippedReferenceMedia = true;
  }
  bytes = measureJsonUtf8Bytes(next);

  return { payload: next, bytes, strippedReferenceMedia, trimmedChat };
}
