import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { authFetchJson, buildApiUrl, hasAvailableApiBase } from "./api-client.js";
import { createPodcasterStudioPlayback } from "./podcaster.playback.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";

const STORAGE_KEY_BASE = "cb_podcaster_sessions_v2";
const LEGACY_STORAGE_KEY = "cb_podcaster_sessions_v1";
const PANEL_MUSIC_STORAGE_KEY_BASE = "cb_podcaster_panel_music_v1";
const PODCAST_STUDIO_INSPECTOR_COLLAPSED_KEY = "cb_podcast_studio_inspector_collapsed_v1";
const PODCAST_STUDIO_INSPECTOR_WIDTH_KEY = "cb_podcast_studio_inspector_width_v1";
const PODCAST_STUDIO_INSPECTOR_WIDTH_MIN = 320;
const PODCAST_STUDIO_INSPECTOR_WIDTH_MAX = 620;
const PODCAST_STUDIO_INSPECTOR_WIDTH_DEFAULT = 420;

const VOICES = ["Host A", "Host B", "Host C", "Host D", "Narrador", "Invitado", "Patrocinador", "Analista", "Experto", "Co-host"];
const DEFAULT_HOSTS = Object.freeze(["Host A", "Host B"]);
const EXPRESSIONS = ["Neutral", "Enérgico", "Cálido", "Curioso", "Serio", "Inspirador"];
const MEDIA_CUES = ["Sin media", "Intro musical", "Transición", "Efecto sutil", "CTA final"];
const PODCASTER_IMAGE_MODEL_DEFAULT = "gemini-2.5-flash-image";
const PODCASTER_IMAGE_MODEL_CANDIDATES = Object.freeze([
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation"
]);
const DISFLUENCY_LEVEL_MAX = Object.freeze({
  fillerLevel: 300,
  errorLevel: 300,
  stutterLevel: 100
});
const SHORT_SCENE_MIN_SEC = 6;
const SHORT_SCENE_MAX_SEC = 7;
const PANEL_CONNECT_SCENE_MAX_SEC = 8;
const SPEECH_WORDS_PER_SEC = 2.4;
const MAX_LOCAL_MUSIC_DATA_URL_CHARS = 1_800_000;
const MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS = 900_000;
const DEFAULT_DISFLUENCY_CONFIG = Object.freeze({
  enabled: false,
  fillerLevel: 20,
  errorLevel: 10,
  stutterEnabled: false,
  stutterLevel: 18
});
// Fuente oficial de nombres/estilo: Vertex AI Live API "Voices supported" (30 voces).
// Nota: la documentación oficial no etiqueta género; esta división es una agrupación de UX.
const GEMINI_LIVE_VOICE_CATALOG = Object.freeze([
  { voiceName: "Zephyr", style: "Brillante", genderGroup: "femenina" },
  { voiceName: "Kore", style: "Firme", genderGroup: "femenina" },
  { voiceName: "Orus", style: "Firme", genderGroup: "masculina" },
  { voiceName: "Autonoe", style: "Brillante", genderGroup: "femenina" },
  { voiceName: "Umbriel", style: "Tranquila", genderGroup: "femenina" },
  { voiceName: "Erinome", style: "Clara", genderGroup: "femenina" },
  { voiceName: "Laomedeia", style: "Optimista", genderGroup: "femenina" },
  { voiceName: "Schedar", style: "Uniforme", genderGroup: "masculina" },
  { voiceName: "Achird", style: "Amigable", genderGroup: "masculina" },
  { voiceName: "Sadachbia", style: "Animada", genderGroup: "femenina" },
  { voiceName: "Puck", style: "Alegre", genderGroup: "masculina" },
  { voiceName: "Fenrir", style: "Excitado", genderGroup: "masculina" },
  { voiceName: "Aoede", style: "Aireado", genderGroup: "femenina" },
  { voiceName: "Enceladus", style: "Susurrante", genderGroup: "masculina" },
  { voiceName: "Algieba", style: "Suave", genderGroup: "masculina" },
  { voiceName: "Algenib", style: "Grave", genderGroup: "masculina" },
  { voiceName: "Achernar", style: "Suave", genderGroup: "masculina" },
  { voiceName: "Gacrux", style: "Maduro", genderGroup: "masculina" },
  { voiceName: "Zubenelgenubi", style: "Informal", genderGroup: "masculina" },
  { voiceName: "Sadaltager", style: "Informativo", genderGroup: "masculina" },
  { voiceName: "Charon", style: "Informativo", genderGroup: "masculina" },
  { voiceName: "Leda", style: "Juvenil", genderGroup: "femenina" },
  { voiceName: "Callirrhoe", style: "Tranquilo", genderGroup: "femenina" },
  { voiceName: "Iapetus", style: "Claro", genderGroup: "masculina" },
  { voiceName: "Despina", style: "Suave", genderGroup: "femenina" },
  { voiceName: "Rasalgethi", style: "Informativo", genderGroup: "masculina" },
  { voiceName: "Alnilam", style: "Firme", genderGroup: "masculina" },
  { voiceName: "Pulcherrima", style: "Directo", genderGroup: "femenina" },
  { voiceName: "Vindemiatrix", style: "Suave", genderGroup: "femenina" },
  { voiceName: "Sulafat", style: "Cálido", genderGroup: "femenina" }
]);
const AGENT_VOICE_PROFILES = Object.freeze(
  GEMINI_LIVE_VOICE_CATALOG.map((entry, index) => ({
    id: `agente_${index + 1}`,
    name: entry.voiceName,
    voiceName: entry.voiceName,
    mood: String(entry.style || "Neutral").toLowerCase(),
    toneLabel: entry.style,
    genderGroup: entry.genderGroup,
    locale: "es-MX",
    speed: 1,
    pitch: 1
  }))
);
const GEMINI_LIVE_VOICE_OPTIONS = AGENT_VOICE_PROFILES.map((profile) => profile.voiceName);
const DEFAULT_SPEAKER_SCENARIO_MAP = Object.freeze({
  "Host A": "Cabina premium de podcast",
  "Host B": "Estudio editorial contemporaneo",
  "Host C": "Set de entrevista cinematografico",
  "Host D": "Radio nocturna elegante"
});
const SPEAKER_SCENARIO_VARIANT_MOODS = Object.freeze([
  "con luz cinematografica suave y monitores discretos",
  "con acustica visible, detalles editoriales y profundidad de campo elegante",
  "con look premium broadcast, texturas sobrias y atmosfera envolvente",
  "con composicion mas intima, contraluz sutil y consola moderna",
  "con identidad visual sofisticada, tonos controlados y set bien balanceado"
]);
const GLOBAL_SCENARIO_BASE_LABEL = "Cabina de radio premium";
const DEFAULT_SPEAKER_VOICE_MAP = Object.freeze({
  "Host A": "Aoede",
  "Host B": "Orus",
  "Host C": "Leda",
  "Host D": "Algieba",
  "Narrador": "Algenib",
  "Invitado": "Leda",
  "Patrocinador": "Puck"
});
const DEFAULT_SPEAKER_NAME_MAP = Object.freeze({
  "Host A": "Valeria",
  "Host B": "Mateo",
  "Host C": "Lucía",
  "Host D": "Diego",
  "Narrador": "Narrador",
  "Invitado": "Invitado",
  "Patrocinador": "Patrocinador",
  "Analista": "Analista",
  "Experto": "Experto",
  "Co-host": "Co-host"
});

const firestoreApp = getApps().length ? getApp() : initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
const firestoreDb = getFirestore(firestoreApp);

const els = {
  promptForm: document.getElementById("promptForm"),
  promptInput: document.getElementById("promptInput"),
  chatFeed: document.getElementById("chatFeed"),
  chatFeedMessages: document.getElementById("chatFeedMessages"),
  chatStage: document.querySelector(".chat-stage"),
  podcasterLayout: document.querySelector(".podcaster-layout"),
  scriptTableBody: document.getElementById("scriptTableBody"),
  hostSummary: document.getElementById("hostSummary"),
  durationSummary: document.getElementById("durationSummary"),
  generationStatus: document.getElementById("generationStatus"),
  scriptModelSelect: document.getElementById("scriptModelSelect"),
  composerModeToggle: document.getElementById("composerModeToggle"),
  connectLiveBtn: document.getElementById("connectLiveBtn"),
  liveStatusText: document.getElementById("liveStatusText"),
  addRowBtn: document.getElementById("addRowBtn"),
  duplicateRowBtn: document.getElementById("duplicateRowBtn"),
  demoPromptBtn: document.getElementById("demoPromptBtn"),
  sessionList: document.getElementById("sessionList"),
  newSessionBtn: document.getElementById("newSessionBtn"),
  saveSessionBtn: document.getElementById("saveSessionBtn"),
  saveSessionFloatingBtn: document.getElementById("saveSessionFloatingBtn"),
  openSidepanelBtn: document.getElementById("openSidepanelBtn"),
  sidepanelHeaderToggleBtn: document.getElementById("sidepanelHeaderToggleBtn"),
  sidepanel: document.getElementById("podcasterSidepanel"),
  openMusicConfigBtn: document.getElementById("openMusicConfigBtn"),
  closeMusicConfigBtn: document.getElementById("closeMusicConfigBtn"),
  musicConfigModal: document.getElementById("musicConfigModal"),
  musicConfigPanel: document.getElementById("musicConfigPanel"),
  audioTrackMixModal: document.getElementById("audioTrackMixModal"),
  closeAudioTrackMixBtn: document.getElementById("closeAudioTrackMixBtn"),
  audioTrackSourceSelect: document.getElementById("audioTrackSourceSelect"),
  audioTrackSourceInfo: document.getElementById("audioTrackSourceInfo"),
  audioTrackMontageVolume: document.getElementById("audioTrackMontageVolume"),
  audioTrackMontageVolumeNumber: document.getElementById("audioTrackMontageVolumeNumber"),
  audioTrackStabilizeToggle: document.getElementById("audioTrackStabilizeToggle"),
  scriptSetupModal: document.getElementById("scriptSetupModal"),
  closeScriptSetupBtn: document.getElementById("closeScriptSetupBtn"),
  scriptSetupForm: document.getElementById("scriptSetupForm"),
  scriptSetupSpeakerCount: document.getElementById("scriptSetupSpeakerCount"),
  scriptSetupSpeakerFields: document.getElementById("scriptSetupSpeakerFields"),
  scriptSetupVideoMode: document.getElementById("scriptSetupVideoMode"),
  scriptSetupSceneCount: document.getElementById("scriptSetupSceneCount"),
  scriptSetupMinWords: document.getElementById("scriptSetupMinWords"),
  scriptSetupMaxWords: document.getElementById("scriptSetupMaxWords"),
  panelMusicPreset: document.getElementById("panelMusicPreset"),
  panelMusicVolume: document.getElementById("panelMusicVolume"),
  panelMusicFileInput: document.getElementById("panelMusicFileInput"),
  addPanelMusicTrackBtn: document.getElementById("addPanelMusicTrackBtn"),
  panelMusicGlobalLibraryList: document.getElementById("panelMusicGlobalLibraryList"),
  panelMusicTrackList: document.getElementById("panelMusicTrackList"),
  selectAllSessionAudiosBtn: document.getElementById("selectAllSessionAudiosBtn"),
  clearAllSessionAudiosBtn: document.getElementById("clearAllSessionAudiosBtn"),
  panelMusicAiPrompt: document.getElementById("panelMusicAiPrompt"),
  generatePanelMusicAiBtn: document.getElementById("generatePanelMusicAiBtn"),
  panelMusicTrackInfo: document.getElementById("panelMusicTrackInfo"),
  clearPanelMusicTrackBtn: document.getElementById("clearPanelMusicTrackBtn"),
  panelMusicPlayBtn: document.getElementById("panelMusicPlayBtn"),
  panelMusicStopBtn: document.getElementById("panelMusicStopBtn"),
  openGlobalConfigBtn: document.getElementById("openGlobalConfigBtn"),
  closeGlobalConfigBtn: document.getElementById("closeGlobalConfigBtn"),
  globalConfigModal: document.getElementById("globalConfigModal"),
  globalConfigPanel: document.getElementById("globalConfigPanel"),
  globalSpeakerSettings: document.getElementById("globalSpeakerSettings"),
  speakerCountInput: document.getElementById("speakerCountInput"),
  globalApplyModeSelect: document.getElementById("globalApplyModeSelect"),
  globalSceneSelectionInput: document.getElementById("globalSceneSelectionInput"),
  globalRedistributeToggle: document.getElementById("globalRedistributeToggle"),
  globalUseGeminiToggle: document.getElementById("globalUseGeminiToggle"),
  globalDisfluencyEnabled: document.getElementById("globalDisfluencyEnabled"),
  globalStutterEnabled: document.getElementById("globalStutterEnabled"),
  globalFillerLevel: document.getElementById("globalFillerLevel"),
  globalErrorLevel: document.getElementById("globalErrorLevel"),
  globalStutterLevel: document.getElementById("globalStutterLevel"),
  applyGlobalConfigBtn: document.getElementById("applyGlobalConfigBtn"),
  podcastPlayBtn: document.getElementById("podcastPlayBtn"),
  podcastPauseBtn: document.getElementById("podcastPauseBtn"),
  podcastStopBtn: document.getElementById("podcastStopBtn"),
  podcastPrevBtn: document.getElementById("podcastPrevBtn"),
  podcastNextBtn: document.getElementById("podcastNextBtn"),
  podcastSpeedSelect: document.getElementById("podcastSpeedSelect"),
  downloadPodcastBtn: document.getElementById("downloadPodcastBtn"),
  podcastNowPlaying: document.getElementById("podcastNowPlaying"),
  podcastPlaybackStatus: document.getElementById("podcastPlaybackStatus"),
  togglePodcastVideoBtn: document.getElementById("togglePodcastVideoBtn"),
  podcastVideoModal: document.getElementById("podcastVideoModal"),
  podcastVideoLoader: document.getElementById("podcastVideoLoader"),
  closePodcastVideoBtn: document.getElementById("closePodcastVideoBtn"),
  podcastVideoShell: document.getElementById("podcastVideoShell"),
  togglePodcastStudioInspectorBtn: document.getElementById("togglePodcastStudioInspectorBtn"),
  podcastStudioInspector: document.getElementById("podcastStudioInspector"),
  podcastStudioInspectorResizeHandle: document.getElementById("podcastStudioInspectorResizeHandle"),
  podcastStudioInspectorCornerHandle: document.getElementById("podcastStudioInspectorCornerHandle"),
  podcastStudioInspectorCollapsedHandle: document.getElementById("podcastStudioInspectorCollapsedHandle"),
  podcastVideoStage: document.getElementById("podcastVideoStage"),
  podcastVideoWave: document.getElementById("podcastVideoWave"),
  podcastTimelineRuler: document.getElementById("podcastTimelineRuler"),
  podcastVideoTimeline: document.getElementById("podcastVideoTimeline"),
  podcastTimelineNormalModeBtn: document.getElementById("podcastTimelineNormalModeBtn"),
  podcastTimelineTracksModeBtn: document.getElementById("podcastTimelineTracksModeBtn"),
  podcastTransitionTimeline: document.getElementById("podcastTransitionTimeline"),
  podcastTransitionPickerModal: document.getElementById("podcastTransitionPickerModal"),
  closeTransitionPickerBtn: document.getElementById("closeTransitionPickerBtn"),
  podcastTransitionPickerGrid: document.getElementById("podcastTransitionPickerGrid"),
  podcastTransitionPickerEdgeLabel: document.getElementById("podcastTransitionPickerEdgeLabel"),
  podcastVideoSpeakerCard: document.getElementById("podcastVideoSpeakerCard"),
  podcastActiveSpeakerVideo: document.getElementById("podcastActiveSpeakerVideo"),
  podcastStudioDipOverlay: document.getElementById("podcastStudioDipOverlay"),
  podcastActiveSpeakerImage: document.getElementById("podcastActiveSpeakerImage"),
  podcastSpeakerMouth: document.getElementById("podcastSpeakerMouth"),
  podcastActiveSpeakerName: document.getElementById("podcastActiveSpeakerName"),
  podcastVideoStatus: document.getElementById("podcastVideoStatus"),
  speakerReferenceImageInput: document.getElementById("speakerReferenceImageInput"),
  scenarioReferenceImageInput: document.getElementById("scenarioReferenceImageInput"),
  podcastVideoPrevBtn: document.getElementById("podcastVideoPrevBtn"),
  podcastVideoPlayBtn: document.getElementById("podcastVideoPlayBtn"),
  podcastVideoPauseBtn: document.getElementById("podcastVideoPauseBtn"),
  podcastVideoStopBtn: document.getElementById("podcastVideoStopBtn"),
  podcastVideoNextBtn: document.getElementById("podcastVideoNextBtn"),
  podcastVideoSpeedSelect: document.getElementById("podcastVideoSpeedSelect"),
  podcastVideoZoomBtn: document.getElementById("podcastVideoZoomBtn"),
  podcastStudioScrubber: document.getElementById("podcastStudioScrubber"),
  podcastStudioTime: document.getElementById("podcastStudioTime"),
  podcastStudioInspectorScene: document.getElementById("podcastStudioInspectorScene"),
  podcastStudioInspectorRowEditor: document.getElementById("podcastStudioInspectorRowEditor"),
  podcastTransitionTypeSelect: document.getElementById("podcastTransitionTypeSelect"),
  podcastTransitionDurationRange: document.getElementById("podcastTransitionDurationRange"),
  podcastTransitionDurationLabel: document.getElementById("podcastTransitionDurationLabel"),
  podcastStudioMasterVolume: document.getElementById("podcastStudioMasterVolume"),
  podcastStudioMasterVolumeNumber: document.getElementById("podcastStudioMasterVolumeNumber"),
  podcastStudioClipVolume: document.getElementById("podcastStudioClipVolume"),
  podcastStudioClipVolumeNumber: document.getElementById("podcastStudioClipVolumeNumber"),
  reorderTimelineTracksBtn: document.getElementById("reorderTimelineTracksBtn"),
  generateDialogueVideoBtn: document.getElementById("generateDialogueVideoBtn"),
  generateAllDialogueVideosBtn: document.getElementById("generateAllDialogueVideosBtn"),
  regenerateAllDialogueVideosBtn: document.getElementById("regenerateAllDialogueVideosBtn"),
  generateDialogueAudioBtn: document.getElementById("generateDialogueAudioBtn"),
  regenerateDialogueAudioBtn: document.getElementById("regenerateDialogueAudioBtn"),
  deleteDialogueAudioBtn: document.getElementById("deleteDialogueAudioBtn"),
  podcastPortraitStrip: document.getElementById("podcastPortraitStrip"),
  podcastPortraitViewer: document.getElementById("podcastPortraitViewer"),
  podcastPortraitViewerBackdrop: document.getElementById("podcastPortraitViewerBackdrop"),
  podcastPortraitViewerCloseBtn: document.getElementById("podcastPortraitViewerCloseBtn"),
  podcastPortraitViewerImage: document.getElementById("podcastPortraitViewerImage"),
  podcastPortraitViewerTitle: document.getElementById("podcastPortraitViewerTitle"),
  podcastPortraitViewerMeta: document.getElementById("podcastPortraitViewerMeta"),
  regenerateAllPortraitsBtn: document.getElementById("regenerateAllPortraitsBtn"),
  dialogueVideoDirectiveModal: document.getElementById("dialogueVideoDirectiveModal"),
  closeDialogueVideoDirectiveBtn: document.getElementById("closeDialogueVideoDirectiveBtn"),
  dialogueVideoDirectiveLabel: document.getElementById("dialogueVideoDirectiveLabel"),
  dialogueVideoDirectiveInput: document.getElementById("dialogueVideoDirectiveInput"),
  skipDialogueVideoDirectiveBtn: document.getElementById("skipDialogueVideoDirectiveBtn"),
  confirmDialogueVideoDirectiveBtn: document.getElementById("confirmDialogueVideoDirectiveBtn"),
  rowDisfluencyModal: document.getElementById("rowDisfluencyModal"),
  rowDisfluencyModalTitle: document.getElementById("rowDisfluencyModalTitle"),
  closeRowDisfluencyModalBtn: document.getElementById("closeRowDisfluencyModalBtn"),
  modalDisfluencyEnabled: document.getElementById("modalDisfluencyEnabled"),
  modalStutterEnabled: document.getElementById("modalStutterEnabled"),
  modalFillerLevel: document.getElementById("modalFillerLevel"),
  modalErrorLevel: document.getElementById("modalErrorLevel"),
  modalStutterLevel: document.getElementById("modalStutterLevel")
};

const demoPrompt = "Escribe un guión para el podcast sobre cómo la IA puede ayudar a docentes de primaria, con dos locutores, tono cercano, intro breve, tres bloques y cierre con llamada a la acción.";

let state = {
  sessions: [],
  activeSessionId: null,
  liveTokenState: null
};

let scriptSortable = null;
let playingRowId = null;
let rowPlaybackTimerState = {
  rowId: "",
  startedAtMs: 0,
  rafId: 0
};
let rowPlaybackAudioEl = null;
let googleGenAiLiveModule = null;
let podcastStudioInspectorCollapsed = (() => {
  try {
    return window.localStorage.getItem(PODCAST_STUDIO_INSPECTOR_COLLAPSED_KEY) === "1";
  } catch (_) {
    return false;
  }
})();
let podcastStudioInspectorWidth = (() => {
  try {
    const rawValue = Number(window.localStorage.getItem(PODCAST_STUDIO_INSPECTOR_WIDTH_KEY));
    if (Number.isFinite(rawValue)) {
      return Math.max(PODCAST_STUDIO_INSPECTOR_WIDTH_MIN, Math.min(PODCAST_STUDIO_INSPECTOR_WIDTH_MAX, rawValue));
    }
  } catch (_) {
    // noop
  }
  return PODCAST_STUDIO_INSPECTOR_WIDTH_DEFAULT;
})();
let podcastStudioInspectorResizeObserver = null;
let podcastStudioInspectorResizeCleanup = null;
let podcastVideoOpenRunToken = 0;
const globalScenarioImagePending = new Set();
let geminiLiveAudioCtx = null;
let geminiLivePlayAt = 0;
let geminiLivePcmPlaybackRate = 1;
let geminiLiveActivePcmSources = new Set();
let activePlaybackVoiceName = "";
let geminiLiveSession = null;
let geminiLiveConnectPromise = null;
let geminiLiveIsOpen = false;
let geminiLiveSessionClosing = false;
let geminiLiveSessionConfigKey = "";
let geminiLiveSessionEpoch = 0;
let geminiLiveReadyVoiceName = "";
let geminiLiveConnectingConfigKey = "";
let geminiLiveConnectingVoiceName = "";
let currentStorageScopeUid = "anon";
let globalConfigOpen = false;
let musicConfigOpen = false;
let audioTrackMixOpen = false;
let scriptSetupOpen = false;
let pendingScriptPrompt = "";
let composerGenerationMode = "script";
let rowDisfluencyConfigOpenId = null;
let dialogueVideoDirectiveRequest = null;
let podcastVideoState = {
  enabled: false,
  activeSpeaker: "",
  activeRowId: "",
  speaking: false,
  stagePortraitFallback: false,
  busy: false,
  bulkVideoGenerationActive: false,
  bulkVideoGenerationMode: "",
  transitionPickerOpen: false,
  transitionFromRowId: "",
  transitionToRowId: "",
  dragRowId: "",
  montageToken: 0,
  montageActive: false,
  montagePaused: false,
  audioEl: null,
  timelineDurationSec: 0,
  montageCursorMs: 0,
  montageRafId: 0,
  montageAudioPlayers: {},
  montageLastVisualRowId: "",
  timelineDrag: null,
  timelineGapSelection: null,
  timelineLastInteractedRowId: "",
  timelineJustDraggedUntil: 0,
  zoomed: false
};
let podcastLipSyncState = {
  rafId: 0,
  value: 0,
  target: 0,
  speaking: false,
  lastTickMs: 0
};
let podcastStageVideoPreloader = null;
let podcastStageVideoPreloadSrc = "";
let podcastTimelineScrollSyncCleanup = null;
let podcastTimelineScrollRafId = 0;
let podcastTimelineManualScrollUntil = 0;
let podcastTimelinePreviewObserver = null;
const PODCAST_RENDER_DEBUG = (() => {
  try {
    return window.localStorage.getItem("cb_podcast_render_debug") === "1";
  } catch (_) {
    return false;
  }
})();
let podcastRenderState = {
  timelineStructureKey: "",
  timelineMode: "",
  timelineStructureRenderCount: 0,
  timelinePreviewCreateCount: 0,
  portraitStructureKey: "",
  portraitStructureRenderCount: 0
};
let rowVideoSyncState = {
  armed: false,
  rowId: "",
  speed: 1
};
let podcastPlaybackState = {
  active: false,
  paused: false,
  queue: [],
  currentQueueIndex: -1,
  jumpToQueueIndex: null,
  speed: 1,
  loopToken: 0,
  currentRowStatus: "",
  currentRowError: "",
  currentRowStartedAt: 0,
  recordedChunks: [],
  recordedAt: ""
};
let podcastAudioTrackUiState = {
  activeLoopIndex: -1
};
let panelMusicState = {
  preset: "ambient",
  volume: 22,
  montageVolume: 22,
  stabilize: false,
  playing: false,
  sourceType: "preset",
  selectedTrackKind: "uploaded",
  trackLibrary: {
    uploaded: null,
    uploadedTracks: [],
    ai: null
  },
  track: null
};
let panelMusicAudioCtx = null;
let panelMusicNodes = [];
let panelMusicAudioEl = null;
let panelMusicAiGenerating = false;
let panelMusicDurationProbeCtx = null;
const panelMusicDurationProbePendingKinds = new Set();
let panelMusicGlobalLibraryState = {
  items: [],
  loading: false,
  loadedAt: "",
  error: ""
};
let nextDialogueVideoRequestAt = 0;
let podcastPortraitViewerLastFocus = null;
let globalTooltipState = {
  el: null,
  target: null,
  rafId: 0
};
const dialogueVideoGenerationPending = new Set();
const dialogueVideoGenerationTasks = new Map();
const dialogueAudioGenerationPending = new Set();
let backgroundDialogueAudioWarmupToken = 0;
const brokenDialogueVideoRows = new Set();
const runtimeFeatureState = {
  dialogueAudioUnavailable: false,
  dialogueAudioUnavailableWarned: false,
  healthChecked: false
};
const connectScriptPanelGenerationState = {
  active: false,
  messageId: "",
  abortController: null,
  token: 0
};
const STUDIO_TRANSITION_TYPES = ["cut", "crossfade", "dip-black", "flash-white", "slide-left", "zoom-in"];
const STUDIO_TIMELINE_VERSION = 3;
const STUDIO_TIMELINE_TRACK_VERSION = 1;
const STUDIO_TIMELINE_PIXELS_PER_SEC = 52;
const STUDIO_TIMELINE_SNAP_MS = 10;
const STUDIO_TIMELINE_MIN_CLIP_MS = 500;
const STUDIO_TIMELINE_MIN_CLIP_PX = 96;
const STUDIO_AUDIO_TRACK_MIN_LOOP_PX = 24;
const STUDIO_TIMELINE_CHAIN_TOLERANCE_MS = 0;
const STUDIO_TRANSITION_PRESETS = {
  cut: { type: "cut", durationMs: 0 },
  crossfade: { type: "crossfade", durationMs: 320 },
  "dip-black": { type: "dip-black", durationMs: 420 },
  "flash-white": { type: "flash-white", durationMs: 220 },
  "slide-left": { type: "slide-left", durationMs: 360 },
  "zoom-in": { type: "zoom-in", durationMs: 300 }
};
const PODCASTER_VOICE_TRACE = true;

function isPodcasterLiveDebugEnabled() {
  if (PODCASTER_VOICE_TRACE) return true;
  try {
    if (window.__CHARLY_CONFIG__?.podcasterLiveDebug === true) return true;
    return localStorage.getItem("cb_podcaster_live_debug") === "1";
  } catch (_) {
    return false;
  }
}

function logPodcasterLiveDebug(event, payload = {}) {
  if (!isPodcasterLiveDebugEnabled()) return;
  try {
    console.log("[podcaster-live]", event, {
      at: new Date().toISOString(),
      ...payload
    });
  } catch (_) {
    // noop
  }
}

function setPodcastPlaybackRowStatus(status = "", details = {}) {
  podcastPlaybackState.currentRowStatus = String(status || "").trim();
  podcastPlaybackState.currentRowError = String(details?.error || "").trim();
  podcastPlaybackState.currentRowStartedAt = Number(details?.startedAt || Date.now()) || Date.now();
  try {
    console.log("[podcaster-playback]", {
      at: new Date().toISOString(),
      rowId: String(details?.rowId || playingRowId || "").trim(),
      status: podcastPlaybackState.currentRowStatus,
      error: podcastPlaybackState.currentRowError
    });
  } catch (_) {
    // noop
  }
}

function setLiveStatusText(text = "") {
  if (!els.liveStatusText) return;
  els.liveStatusText.textContent = String(text || "");
}

function ensureGlobalTooltipEl() {
  if (globalTooltipState.el && document.body.contains(globalTooltipState.el)) return globalTooltipState.el;
  const el = document.createElement("div");
  el.className = "pod-global-tooltip";
  el.setAttribute("role", "tooltip");
  document.body.appendChild(el);
  globalTooltipState.el = el;
  return el;
}

function positionGlobalTooltip(target = null) {
  const el = globalTooltipState.el;
  if (!el || !target) return;
  const rect = target.getBoundingClientRect();
  const margin = 8;
  const topZonePx = 140;
  const tooltipRect = el.getBoundingClientRect();
  const centerX = rect.left + (rect.width / 2);
  const preferredTop = rect.top - tooltipRect.height - margin;
  const forceBelow = rect.top <= topZonePx;
  const top = forceBelow
    ? Math.min(window.innerHeight - tooltipRect.height - margin, rect.bottom + margin)
    : (preferredTop >= margin
      ? preferredTop
      : Math.min(window.innerHeight - tooltipRect.height - margin, rect.bottom + margin));
  const left = Math.max(
    margin,
    Math.min(window.innerWidth - tooltipRect.width - margin, centerX - (tooltipRect.width / 2))
  );
  el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function hideGlobalTooltip() {
  if (globalTooltipState.rafId) {
    cancelAnimationFrame(globalTooltipState.rafId);
    globalTooltipState.rafId = 0;
  }
  globalTooltipState.target = null;
  if (!globalTooltipState.el) return;
  globalTooltipState.el.classList.remove("is-visible");
  globalTooltipState.el.style.transform = "translate3d(-9999px, -9999px, 0)";
}

function showGlobalTooltip(target = null) {
  const node = target?.closest?.("button[data-tooltip], [data-action][data-tooltip]");
  if (!node || node.matches(":disabled")) {
    hideGlobalTooltip();
    return;
  }
  const text = String(node.getAttribute("data-tooltip") || "").trim();
  if (!text) {
    hideGlobalTooltip();
    return;
  }
  const el = ensureGlobalTooltipEl();
  el.textContent = text;
  globalTooltipState.target = node;
  el.classList.add("is-visible");
  positionGlobalTooltip(node);
}

function setupGlobalTooltipPortal() {
  document.body.classList.add("pod-tooltip-portal-ready");
  document.addEventListener("pointerover", (event) => {
    showGlobalTooltip(event.target);
  });
  document.addEventListener("pointerout", (event) => {
    const current = globalTooltipState.target;
    if (!current) return;
    const next = event.relatedTarget;
    if (next && current.contains(next)) return;
    hideGlobalTooltip();
  });
  document.addEventListener("focusin", (event) => {
    showGlobalTooltip(event.target);
  });
  document.addEventListener("focusout", (event) => {
    const current = globalTooltipState.target;
    if (!current) return;
    const next = event.relatedTarget;
    if (next && current.contains(next)) return;
    hideGlobalTooltip();
  });
  window.addEventListener("scroll", () => {
    if (!globalTooltipState.target || !globalTooltipState.el) return;
    if (globalTooltipState.rafId) cancelAnimationFrame(globalTooltipState.rafId);
    globalTooltipState.rafId = requestAnimationFrame(() => {
      globalTooltipState.rafId = 0;
      positionGlobalTooltip(globalTooltipState.target);
    });
  }, true);
  window.addEventListener("resize", () => {
    if (!globalTooltipState.target) return;
    positionGlobalTooltip(globalTooltipState.target);
    syncTimelineGapSelectionUi();
  });
}

function loadSessions(uid = resolveCurrentUid()) {
  const storageKey = resolveSessionStorageKey(uid);
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    const isAnonScope = storageKey.endsWith(":anon");
    if (!isAnonScope) return [];
    try {
      const legacyParsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
      return Array.isArray(legacyParsed) ? legacyParsed : [];
    } catch (_) {
      return [];
    }
  }
}

function persistSessions(uid = resolveCurrentUid(), sessions = state.sessions) {
  const sanitizedSessions = (Array.isArray(sessions) ? sessions : []).map((session) => {
    const panelMusicConfig = session?.panelMusicConfig && typeof session.panelMusicConfig === "object"
      ? session.panelMusicConfig
      : null;
    if (!panelMusicConfig) return session;
    const stripLocalDataUrl = (track) => {
      if (!track || typeof track !== "object") return track;
      const nextTrack = { ...track };
      delete nextTrack.localDataUrl;
      return nextTrack;
    };
    return {
      ...session,
      panelMusicConfig: {
        ...panelMusicConfig,
        track: stripLocalDataUrl(panelMusicConfig.track),
        trackLibrary: panelMusicConfig.trackLibrary && typeof panelMusicConfig.trackLibrary === "object"
          ? {
            uploaded: stripLocalDataUrl(panelMusicConfig.trackLibrary.uploaded),
            uploadedTracks: Array.isArray(panelMusicConfig.trackLibrary.uploadedTracks)
              ? panelMusicConfig.trackLibrary.uploadedTracks.map((track) => stripLocalDataUrl(track))
              : [],
            ai: stripLocalDataUrl(panelMusicConfig.trackLibrary.ai)
          }
          : panelMusicConfig.trackLibrary
      }
    };
  });
  localStorage.setItem(resolveSessionStorageKey(uid), JSON.stringify(sanitizedSessions));
}

async function loadCloudSessions() {
  if (!hasAvailableApiBase()) {
    return loadCloudSessionsDirect();
  }
  const response = await authFetchJson("/api/podcaster/sessions/list", {
    method: "GET"
  });
  return Array.isArray(response?.sessions) ? response.sessions : [];
}

async function loadCloudSessionsDirect() {
  const uid = resolveCurrentUid();
  if (!uid) return [];
  const ownedSnap = await getDocs(
    query(collection(firestoreDb, "podcaster_sessions"), where("ownerId", "==", uid))
  );
  const sharedSnap = { docs: [] };
  const merged = new Map();
  [...ownedSnap.docs, ...sharedSnap.docs].forEach((docSnap) => {
    const data = docSnap.data() || {};
    const sessionData = data.session && typeof data.session === "object" ? data.session : null;
    if (!sessionData) return;
    merged.set(docSnap.id, {
      ...sessionData,
      cloudMeta: {
        ownerId: String(data.ownerId || "").trim() || null,
        savedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
      }
    });
  });
  return Array.from(merged.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function mergeSessionsById(primary = [], secondary = []) {
  const result = [];
  const indexById = new Map();
  const pushOrMerge = (session) => {
    const id = String(session?.id || "").trim();
    if (!id || !session || typeof session !== "object") return;
    const existingIndex = indexById.get(id);
    if (existingIndex === undefined) {
      indexById.set(id, result.length);
      result.push(session);
      return;
    }
    const existing = result[existingIndex];
    const existingAt = Date.parse(String(existing?.updatedAt || ""));
    const incomingAt = Date.parse(String(session?.updatedAt || ""));
    const incomingIsNewer = Number.isFinite(incomingAt) && (!Number.isFinite(existingAt) || incomingAt >= existingAt);
    if (incomingIsNewer) {
      result[existingIndex] = session;
    }
  };
  (Array.isArray(primary) ? primary : []).forEach(pushOrMerge);
  (Array.isArray(secondary) ? secondary : []).forEach(pushOrMerge);
  return result;
}

function getAuthSafe() {
  try {
    return getAuth();
  } catch (_) {
    return null;
  }
}

function resolveCurrentUid() {
  return String(getAuthSafe()?.currentUser?.uid || "").trim();
}

function resolveSessionStorageKey(uid = resolveCurrentUid()) {
  return `${STORAGE_KEY_BASE}:${String(uid || "").trim() || "auth_required"}`;
}

function resolvePanelMusicStorageKey(uid = resolveCurrentUid()) {
  return `${PANEL_MUSIC_STORAGE_KEY_BASE}:${String(uid || "").trim() || "auth_required"}`;
}

function resolvePanelMusicSessionCacheKey(sessionId = "", kind = "uploaded", uid = resolveCurrentUid()) {
  const safeSessionId = String(sessionId || "").trim() || "session";
  const safeKind = resolvePanelMusicTrackKind(kind);
  const safeUid = String(uid || "").trim() || "auth_required";
  return `${PANEL_MUSIC_STORAGE_KEY_BASE}:cache:${safeUid}:${safeSessionId}:${safeKind}`;
}

function persistPanelMusicSessionTrackCache(sessionId = "", kind = "", localDataUrl = "") {
  const key = resolvePanelMusicSessionCacheKey(sessionId, kind);
  const value = String(localDataUrl || "").trim();
  if (!value) {
    localStorage.removeItem(key);
    return;
  }
  try {
    localStorage.setItem(key, value.slice(0, MAX_LOCAL_MUSIC_DATA_URL_CHARS));
  } catch (_) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      // noop
    }
  }
}

function loadPanelMusicSessionTrackCache(sessionId = "", kind = "") {
  const key = resolvePanelMusicSessionCacheKey(sessionId, kind);
  return String(localStorage.getItem(key) || "").trim();
}

function normalizePanelMusicMutedLoopIndexes(value = []) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => Math.max(0, Math.floor(Number(item) || 0)))
      .filter((item) => Number.isFinite(item) && item >= 0 && item <= 999)
  )).sort((a, b) => a - b);
}

function normalizePanelMusicLoopSettings(value = [], sourceDurationMs = 0) {
  if (!Array.isArray(value)) return [];
  const maxDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(sourceDurationMs || 0) || 0));
  const maxTrimInMs = Math.max(0, maxDurationMs - STUDIO_TIMELINE_MIN_CLIP_MS);
  const map = new Map();
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const loopIndex = Math.max(0, Math.floor(Number(item.loopIndex) || 0));
    if (!Number.isFinite(loopIndex) || loopIndex > 999) return;
    const trimInMs = Math.max(0, Math.min(maxTrimInMs, Math.round(Number(item.trimInMs || 0) || 0)));
    const rawTrimOutMs = Math.round(Number(item.trimOutMs || maxDurationMs) || maxDurationMs);
    const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.min(maxDurationMs, rawTrimOutMs));
    map.set(loopIndex, { loopIndex, trimInMs, trimOutMs });
  });
  return Array.from(map.values()).sort((a, b) => a.loopIndex - b.loopIndex);
}

function getPanelMusicLoopSetting(track = null, loopIndex = 0) {
  const normalized = normalizePanelMusicTrack(track);
  if (!normalized) return null;
  const sourceDurationMs = Math.max(
    STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.round(getPanelMusicTrackDurationSec(normalized) * 1000) || STUDIO_TIMELINE_MIN_CLIP_MS
  );
  const settings = normalizePanelMusicLoopSettings(normalized.loopSettings || [], sourceDurationMs);
  const key = Math.max(0, Math.floor(Number(loopIndex) || 0));
  const existing = settings.find((item) => item.loopIndex === key);
  if (existing) return existing;
  const defaultTrimInMs = Math.max(0, Math.min(sourceDurationMs - STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(normalized.trimInMs || 0) || 0)));
  const defaultTrimOutMs = Math.max(
    defaultTrimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.min(sourceDurationMs, Math.round(Number(normalized.trimOutMs || sourceDurationMs) || sourceDurationMs))
  );
  return {
    loopIndex: key,
    trimInMs: defaultTrimInMs,
    trimOutMs: defaultTrimOutMs
  };
}

function upsertPanelMusicLoopSetting(loopSettings = [], loopIndex = 0, nextValue = {}) {
  const key = Math.max(0, Math.floor(Number(loopIndex) || 0));
  const filtered = Array.isArray(loopSettings)
    ? loopSettings.filter((item) => Math.max(0, Math.floor(Number(item?.loopIndex) || 0)) !== key)
    : [];
  filtered.push({
    loopIndex: key,
    trimInMs: Math.max(0, Math.round(Number(nextValue?.trimInMs || 0) || 0)),
    trimOutMs: Math.max(0, Math.round(Number(nextValue?.trimOutMs || 0) || 0))
  });
  return filtered.sort((a, b) => Number(a.loopIndex || 0) - Number(b.loopIndex || 0));
}

function normalizePanelMusicTrack(track = null) {
  if (!track || typeof track !== "object") return null;
  const sourceDurationMs = Math.max(0, Math.round((Number(track.durationSec || 0) || 0) * 1000));
  const startOffsetMs = Math.max(0, Math.round(Number(track.startOffsetMs || 0) || 0));
  const maxTrimInMs = Math.max(0, sourceDurationMs - STUDIO_TIMELINE_MIN_CLIP_MS);
  const trimInMs = Math.max(0, Math.min(maxTrimInMs, Math.round(Number(track.trimInMs || 0) || 0)));
  const rawTrimOutMs = Math.round(Number(track.trimOutMs || sourceDurationMs) || sourceDurationMs);
  const trimOutMs = sourceDurationMs > 0
    ? Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Math.min(sourceDurationMs, rawTrimOutMs))
    : 0;
  return {
    libraryId: String(track.libraryId || "").trim(),
    slotLabel: String(track.slotLabel || "").trim(),
    enabledInSession: track.enabledInSession !== false,
    name: String(track.name || "Audio").trim() || "Audio",
    mimeType: String(track.mimeType || "audio/mpeg").trim() || "audio/mpeg",
    size: Math.max(0, Number(track.size || 0) || 0),
    durationSec: Math.max(0, Number(track.durationSec || 0) || 0),
    startOffsetMs,
    trimInMs,
    trimOutMs,
    localDataUrl: String(track.localDataUrl || "").trim().slice(0, MAX_LOCAL_MUSIC_DATA_URL_CHARS),
    downloadUrl: String(track.downloadUrl || "").trim(),
    storagePath: String(track.storagePath || "").trim(),
    updatedAt: String(track.updatedAt || nowIso()).trim() || nowIso(),
    model: String(track.model || "").trim(),
    prompt: String(track.prompt || "").trim(),
    durationMeasuredWith: String(track.durationMeasuredWith || "").trim().toLowerCase(),
    loopSettings: normalizePanelMusicLoopSettings(track.loopSettings || [], sourceDurationMs),
    mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(track.mutedLoopIndexes || [])
  };
}

function normalizeGlobalPanelMusicLibraryTrack(track = null) {
  const normalized = normalizePanelMusicTrack(track);
  if (!normalized) return null;
  return {
    ...normalized,
    libraryId: String(track?.libraryId || normalized.libraryId || "").trim(),
    ownerEmail: String(track?.ownerEmail || "").trim()
  };
}

function normalizePanelMusicTrackList(value = []) {
  const list = Array.isArray(value) ? value.map((item) => normalizePanelMusicTrack(item)).filter(Boolean) : [];
  return list.map((track, index) => ({
    ...track,
    slotLabel: String(track.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
    enabledInSession: track.enabledInSession !== false
  }));
}

function getPanelMusicUploadedTracks() {
  const list = normalizePanelMusicTrackList(panelMusicState.trackLibrary?.uploadedTracks || []);
  if (list.length) return list;
  const legacy = normalizePanelMusicTrack(panelMusicState.trackLibrary?.uploaded || null);
  return legacy ? [{ ...legacy, slotLabel: String(legacy.slotLabel || "Audio 1").trim() || "Audio 1" }] : [];
}

function getEnabledPanelMusicUploadedTracks() {
  return getPanelMusicUploadedTracks().filter((track) => track?.enabledInSession !== false);
}

function setPanelMusicUploadedTracks(tracks = [], options = {}) {
  const normalizedList = normalizePanelMusicTrackList(tracks);
  panelMusicState.trackLibrary.uploadedTracks = normalizedList;
  panelMusicState.trackLibrary.uploaded = normalizedList[0] || null;
  if (options.selectIndex !== undefined) {
    const nextTrack = normalizedList[Math.max(0, Math.min(normalizedList.length - 1, Number(options.selectIndex) || 0))] || null;
    panelMusicState.track = nextTrack;
    panelMusicState.selectedTrackKind = "uploaded";
    panelMusicState.sourceType = nextTrack ? "track" : "preset";
  } else {
    syncActivePanelMusicTrack({ kind: panelMusicState.selectedTrackKind, forceTrack: false });
  }
}

function setAllSessionUploadedTracksEnabled(enabled = true) {
  const nextTracks = getPanelMusicUploadedTracks().map((track) => ({
    ...track,
    enabledInSession: enabled === true
  }));
  setPanelMusicUploadedTracks(nextTracks, { selectIndex: 0 });
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
}

function toggleSessionUploadedTrackEnabled(index = 0) {
  const trackIndex = Math.max(0, Math.floor(Number(index) || 0));
  const tracks = getPanelMusicUploadedTracks();
  const track = tracks[trackIndex] || null;
  if (!track) return false;
  const nextTracks = [...tracks];
  nextTracks[trackIndex] = {
    ...track,
    enabledInSession: track.enabledInSession === false
  };
  if (nextTracks.every((item) => item?.enabledInSession === false)) {
    nextTracks[trackIndex].enabledInSession = true;
  }
  setPanelMusicUploadedTracks(nextTracks, { selectIndex: trackIndex });
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
  return true;
}

function removeUploadedTrackAt(index = 0, options = {}) {
  const nextIndex = Math.max(0, Math.floor(Number(index) || 0));
  const tracks = getPanelMusicUploadedTracks();
  if (nextIndex < 0 || nextIndex >= tracks.length) return false;
  const nextTracks = tracks.filter((_, itemIndex) => itemIndex !== nextIndex).map((track, itemIndex) => ({
    ...track,
    slotLabel: `Audio ${itemIndex + 1}`
  }));
  setPanelMusicUploadedTracks(nextTracks, { selectIndex: Math.max(0, Math.min(nextTracks.length - 1, nextIndex - 1)) });
  if (!nextTracks.length) {
    panelMusicState.track = null;
    panelMusicState.sourceType = "preset";
  }
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
  return true;
}

function addGlobalMusicTrackToSession(track = null, options = {}) {
  const normalized = normalizeGlobalPanelMusicLibraryTrack(track);
  if (!normalized) return false;
  const existingTracks = getPanelMusicUploadedTracks();
  const normalizedLibraryId = String(normalized.libraryId || "").trim();
  const normalizedName = String(normalized.name || "").trim().toLowerCase();
  const normalizedSize = Math.max(0, Number(normalized.size || 0) || 0);
  const normalizedDurationSec = Math.max(0, Number(normalized.durationSec || 0) || 0);
  const existingIndex = existingTracks.findIndex((item) => {
    const itemLibraryId = String(item?.libraryId || "").trim();
    if (normalizedLibraryId && itemLibraryId === normalizedLibraryId) return true;
    if (itemLibraryId) return false;
    const itemName = String(item?.name || "").trim().toLowerCase();
    const itemSize = Math.max(0, Number(item?.size || 0) || 0);
    const itemDurationSec = Math.max(0, Number(item?.durationSec || 0) || 0);
    const sameName = normalizedName && itemName === normalizedName;
    const sameSize = normalizedSize > 0 && itemSize > 0 && normalizedSize === itemSize;
    const similarDuration = normalizedDurationSec > 0 && itemDurationSec > 0 && Math.abs(normalizedDurationSec - itemDurationSec) <= 1.5;
    return sameName && (sameSize || similarDuration);
  });
  if (existingIndex >= 0) {
    const nextTracks = [...existingTracks];
    nextTracks[existingIndex] = {
      ...nextTracks[existingIndex],
      ...normalized,
      slotLabel: String(nextTracks[existingIndex]?.slotLabel || normalized.slotLabel || `Audio ${existingIndex + 1}`).trim() || `Audio ${existingIndex + 1}`,
      localDataUrl: ""
    };
    setPanelMusicUploadedTracks(nextTracks, { selectIndex: existingIndex });
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
    return true;
  }
  const nextTrack = {
    ...normalized,
    slotLabel: `Audio ${existingTracks.length + 1}`,
    localDataUrl: ""
  };
  setPanelMusicUploadedTracks([
    ...existingTracks,
    nextTrack
  ], { selectIndex: existingTracks.length });
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
  return true;
}

function reconcileSessionUploadedTracksWithGlobalLibrary() {
  const libraryById = new Map(
    (Array.isArray(panelMusicGlobalLibraryState.items) ? panelMusicGlobalLibraryState.items : [])
      .map((item) => [String(item?.libraryId || "").trim(), normalizeGlobalPanelMusicLibraryTrack(item)])
      .filter(([libraryId, item]) => libraryId && item)
  );
  const existingTracks = getPanelMusicUploadedTracks();
  if (!existingTracks.length || !libraryById.size) return false;
  let changed = false;
  const nextTracks = existingTracks.map((track, index) => {
    const libraryId = String(track?.libraryId || "").trim();
    const libraryTrack = libraryId ? libraryById.get(libraryId) : null;
    if (!libraryTrack) return track;
    const needsRepair = !String(track?.downloadUrl || "").trim() || !String(track?.storagePath || "").trim();
    if (!needsRepair) return track;
    changed = true;
    return normalizePanelMusicTrack({
      ...track,
      ...libraryTrack,
      slotLabel: String(track?.slotLabel || libraryTrack?.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
      localDataUrl: ""
    });
  });
  if (!changed) return false;
  const selectedTrack = normalizePanelMusicTrack(panelMusicState.track);
  const selectedIndex = selectedTrack && !selectedTrack.model
    ? Math.max(0, nextTracks.findIndex((track) => String(track?.slotLabel || "").trim() === String(selectedTrack.slotLabel || "").trim()))
    : 0;
  setPanelMusicUploadedTracks(nextTracks, { selectIndex: selectedIndex });
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
  return true;
}

async function fetchGlobalPanelMusicLibrary(options = {}) {
  panelMusicGlobalLibraryState.loading = true;
  if (options.render !== false) syncMusicControls();
  try {
    const response = await authFetchJson("/api/podcaster/music/library/list", { method: "GET" });
    panelMusicGlobalLibraryState.items = Array.isArray(response?.tracks)
      ? response.tracks.map((track) => normalizeGlobalPanelMusicLibraryTrack(track)).filter(Boolean)
      : [];
    panelMusicGlobalLibraryState.loadedAt = nowIso();
    panelMusicGlobalLibraryState.error = "";
    reconcileSessionUploadedTracksWithGlobalLibrary();
  } catch (error) {
    panelMusicGlobalLibraryState.error = String(error?.message || "No se pudo cargar la biblioteca global.");
  } finally {
    panelMusicGlobalLibraryState.loading = false;
    if (options.render !== false) syncMusicControls();
  }
  return panelMusicGlobalLibraryState.items;
}

function updateUploadedTrackAt(index = 0, nextTrack = null, options = {}) {
  const tracks = getPanelMusicUploadedTracks();
  const next = [...tracks];
  if (nextTrack) {
    next[Math.max(0, index)] = normalizePanelMusicTrack({
      ...(tracks[index] || {}),
      ...nextTrack,
      slotLabel: String(nextTrack?.slotLabel || tracks[index]?.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`
    });
  } else {
    next.splice(Math.max(0, index), 1);
  }
  setPanelMusicUploadedTracks(next, { selectIndex: options.selectIndex });
}

function resolvePanelMusicTrackKind(value = "") {
  return String(value || "").trim() === "ai" ? "ai" : "uploaded";
}

function getPanelMusicTrackByKind(kind = "") {
  const trackKind = resolvePanelMusicTrackKind(kind);
  if (trackKind === "uploaded") {
    const uploadedTracks = getEnabledPanelMusicUploadedTracks();
    const selectedTrack = normalizePanelMusicTrack(panelMusicState.track);
    if (selectedTrack && !selectedTrack.model) {
      const selectedSlotLabel = String(selectedTrack.slotLabel || "").trim();
      const match = uploadedTracks.find((item) => String(item?.slotLabel || "").trim() === selectedSlotLabel);
      if (match) return normalizePanelMusicTrack(match);
      return selectedTrack;
    }
    return normalizePanelMusicTrack(uploadedTracks[0] || null);
  }
  return normalizePanelMusicTrack(panelMusicState.trackLibrary?.[trackKind] || null);
}

function getPanelMusicTrackAvailability(kind = "") {
  const trackKind = resolvePanelMusicTrackKind(kind);
  if (trackKind === "uploaded") {
    const uploadedTracks = getPanelMusicUploadedTracks();
    if (uploadedTracks.length) {
      const selectedTrack = normalizePanelMusicTrack(panelMusicState.track);
      if (selectedTrack && !selectedTrack.model) {
        return selectedTrack;
      }
      return uploadedTracks[0];
    }
  }
  const libraryTrack = getPanelMusicTrackByKind(trackKind);
  if (libraryTrack) return libraryTrack;
  const activeTrack = normalizePanelMusicTrack(panelMusicState.track);
  if (!activeTrack) return null;
  if (trackKind === "ai" && activeTrack.model) return activeTrack;
  if (trackKind === "uploaded" && !activeTrack.model) return activeTrack;
  return null;
}

function getAvailablePanelMusicTrackKinds() {
  const kinds = [];
  if (getPanelMusicTrackAvailability("uploaded")) kinds.push("uploaded");
  if (getPanelMusicTrackAvailability("ai")) kinds.push("ai");
  return kinds;
}

function getPanelMusicTrackDurationSec(track = null) {
  const normalized = normalizePanelMusicTrack(track);
  const directDurationSec = Math.max(0, Number(normalized?.durationSec || 0) || 0);
  if (directDurationSec > 0.05) return directDurationSec;
  const sizeBytes = Math.max(0, Number(normalized?.size || 0) || 0);
  if (sizeBytes <= 0) return 0;
  const mimeType = String(normalized?.mimeType || "").trim().toLowerCase();
  // Para MP3/AAC/OGG comprimidos, estimar por tamaño produce duraciones falsas.
  // Solo conservamos el fallback para audio PCM/WAV, donde el cálculo es razonablemente fiable.
  if (!mimeType.includes("wav") && !mimeType.includes("wave")) {
    logPodcastRenderDebug("audio-track-duration-awaiting-measurement", {
      name: String(normalized?.name || ""),
      mimeType,
      sizeBytes
    });
    return 0;
  }
  const bitsPerSecond = 1411200;
  const estimatedDurationSec = Math.max(0, Number(((sizeBytes * 8) / bitsPerSecond).toFixed(2)) || 0);
  logPodcastRenderDebug("audio-track-duration-fallback", {
    name: String(normalized?.name || ""),
    mimeType,
    sizeBytes,
    bitsPerSecond,
    estimatedDurationSec
  });
  return estimatedDurationSec;
}

function getPanelMusicLoopCount(session = null, track = null) {
  return getPanelMusicLoopSegments(session, track).length || 1;
}

function buildUploadedPanelMusicSegments(session = null) {
  const activeSession = session || getActiveSession();
  const uploadedTracks = getEnabledPanelMusicUploadedTracks().filter((track) => getPanelMusicTrackDurationSec(track) > 0.05);
  const entries = buildTimelineRuntimeEntries(activeSession);
  const totalDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(activeSession));
  const sceneEntries = entries.length
    ? entries
    : [{ startMs: 0, endMs: totalDurationMs }];
  if (!uploadedTracks.length) return [];
  if (uploadedTracks.length === 1) {
    const single = uploadedTracks[0];
    const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(getPanelMusicTrackDurationSec(single) * 1000));
    const segments = [];
    let sceneCursor = 0;
    let loopIndex = 0;
    while (sceneCursor < sceneEntries.length && loopIndex < 120) {
      const startMs = Math.max(0, Number(sceneEntries[sceneCursor]?.startMs || 0) || 0);
      let endSceneCursor = sceneCursor;
      let segmentEndMs = Math.max(startMs, Number(sceneEntries[sceneCursor]?.endMs || startMs) || startMs);
      while (endSceneCursor + 1 < sceneEntries.length) {
        const candidateEndMs = Math.max(segmentEndMs, Number(sceneEntries[endSceneCursor + 1]?.endMs || segmentEndMs) || segmentEndMs);
        if ((candidateEndMs - startMs) > durationMs + 1) break;
        endSceneCursor += 1;
        segmentEndMs = candidateEndMs;
      }
      const sceneBatchDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, segmentEndMs - startMs);
      const loopSetting = getPanelMusicLoopSetting({
        ...single,
        durationSec: sceneBatchDurationMs / 1000,
        trimInMs: 0,
        trimOutMs: sceneBatchDurationMs
      }, loopIndex);
      const trimInMs = Math.max(0, Math.min(sceneBatchDurationMs - STUDIO_TIMELINE_MIN_CLIP_MS, Number(loopSetting?.trimInMs || 0) || 0));
      const trimOutMs = Math.max(
        trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.min(sceneBatchDurationMs, Number(loopSetting?.trimOutMs || sceneBatchDurationMs) || sceneBatchDurationMs)
      );
      segments.push({
        ...single,
        slotLabel: String(single.slotLabel || "Audio 1").trim() || "Audio 1",
        trackIndex: 0,
        startMs,
        endMs: startMs + trimOutMs,
        durationSec: getPanelMusicTrackDurationSec(single),
        trimInMs,
        trimOutMs,
        loop: false,
        loopIndex
      });
      sceneCursor = endSceneCursor + 1;
      loopIndex += 1;
    }
    return segments;
  }
  const segments = [];
  let sceneCursor = 0;
  uploadedTracks.forEach((track, index) => {
    if (sceneCursor >= sceneEntries.length) return;
    const trackDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(getPanelMusicTrackDurationSec(track) * 1000));
    const remainingTracksAfterCurrent = Math.max(0, uploadedTracks.length - index - 1);
    const startMs = Math.max(0, Number(sceneEntries[sceneCursor]?.startMs || 0) || 0);
    let endSceneCursor = sceneCursor;
    let segmentEndMs = Math.max(startMs, Number(sceneEntries[sceneCursor]?.endMs || startMs) || startMs);
    while (endSceneCursor + 1 < sceneEntries.length) {
      const remainingScenesAfterCandidate = Math.max(0, sceneEntries.length - (endSceneCursor + 2));
      if (remainingScenesAfterCandidate < remainingTracksAfterCurrent) break;
      const candidateEndMs = Math.max(segmentEndMs, Number(sceneEntries[endSceneCursor + 1]?.endMs || segmentEndMs) || segmentEndMs);
      if ((candidateEndMs - startMs) > trackDurationMs + 1) break;
      endSceneCursor += 1;
      segmentEndMs = candidateEndMs;
    }
    const availableDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, totalDurationMs - startMs);
    const visibleDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.min(trackDurationMs, availableDurationMs)
    );
    segments.push({
      ...track,
      slotLabel: String(track.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
      trackIndex: index,
      startMs,
      endMs: startMs + visibleDurationMs,
      durationSec: getPanelMusicTrackDurationSec(track),
      trimInMs: 0,
      trimOutMs: visibleDurationMs,
      loop: false,
      loopIndex: 0
    });
    sceneCursor = endSceneCursor + 1;
  });
  return segments;
}

function groupUploadedPanelMusicSegmentsByTrack(session = null) {
  const segments = buildUploadedPanelMusicSegments(session);
  const groups = [];
  const indexByKey = new Map();
  segments.forEach((segment, fallbackIndex) => {
    const trackIndex = Math.max(0, Math.floor(Number(segment?.trackIndex ?? fallbackIndex) || 0));
    const slotLabel = String(segment?.slotLabel || `Audio ${trackIndex + 1}`).trim() || `Audio ${trackIndex + 1}`;
    const key = `${trackIndex}:${slotLabel}`;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({
        trackIndex,
        slotLabel,
        name: String(segment?.name || slotLabel).trim() || slotLabel,
        segments: []
      });
    }
    groups[indexByKey.get(key)].segments.push(segment);
  });
  return groups;
}

function getPanelMusicLoopSegments(session = null, track = null) {
  const normalized = normalizePanelMusicTrack(track);
  const durationSec = getPanelMusicTrackDurationSec(normalized);
  const totalDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session || getActiveSession()));
  if (!normalized || durationSec <= 0.05) return [];
  const sourceDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(durationSec * 1000));
  const startOffsetMs = Math.max(0, Math.min(totalDurationMs, Number(normalized.startOffsetMs || 0) || 0));
  const loopSettings = normalizePanelMusicLoopSettings(normalized.loopSettings || [], sourceDurationMs);
  const segments = [];
  let cursorMs = startOffsetMs;
  let loopIndex = 0;
  while (cursorMs < totalDurationMs && loopIndex < 120) {
    const loopSetting = loopSettings.find((item) => item.loopIndex === loopIndex) || getPanelMusicLoopSetting(normalized, loopIndex);
    const effectiveLoopMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round(Number(loopSetting?.trimOutMs || sourceDurationMs) || sourceDurationMs) - Math.round(Number(loopSetting?.trimInMs || 0) || 0)
    );
    segments.push({
      loopIndex,
      startMs: cursorMs,
      trimInMs: Math.max(0, Number(loopSetting?.trimInMs || 0) || 0),
      trimOutMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(loopSetting?.trimOutMs || sourceDurationMs) || sourceDurationMs),
      effectiveLoopMs
    });
    cursorMs += effectiveLoopMs;
    loopIndex += 1;
  }
  return segments;
}

async function decodeAudioDurationInfoFromSrc(src = "") {
  const source = String(src || "").trim();
  if (!source) return { durationSec: 0, method: "" };
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return { durationSec: 0, method: "" };
  }
  if (!panelMusicDurationProbeCtx) {
    panelMusicDurationProbeCtx = new AudioContextCtor();
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`No se pudo leer audio (${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (!(arrayBuffer instanceof ArrayBuffer) || !arrayBuffer.byteLength) {
    return { durationSec: 0, method: "" };
  }
  const decodedBuffer = await new Promise((resolve, reject) => {
    try {
      panelMusicDurationProbeCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
  return {
    durationSec: Math.max(0, Number(decodedBuffer?.duration || 0) || 0),
    method: "decode"
  };
}

async function decodeAudioDurationInfoFromArrayBuffer(arrayBuffer = null) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor || !(arrayBuffer instanceof ArrayBuffer) || !arrayBuffer.byteLength) {
    return { durationSec: 0, method: "" };
  }
  if (!panelMusicDurationProbeCtx) {
    panelMusicDurationProbeCtx = new AudioContextCtor();
  }
  const decodedBuffer = await new Promise((resolve, reject) => {
    try {
      panelMusicDurationProbeCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
  return {
    durationSec: Math.max(0, Number(decodedBuffer?.duration || 0) || 0),
    method: "decode"
  };
}

async function measureAudioDurationInfoFromFile(file = null) {
  if (!(file instanceof File)) return { durationSec: 0, method: "" };
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await decodeAudioDurationInfoFromArrayBuffer(buffer);
    if (Number(decoded?.durationSec || 0) > 0.05) {
      logPodcastRenderDebug("audio-track-duration-measured", {
        method: decoded.method,
        durationSec: decoded.durationSec,
        srcKind: "file"
      });
      return decoded;
    }
  } catch (_) {
    // fallback below
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const metadata = await readAudioDurationSecFromSrc(objectUrl);
    logPodcastRenderDebug("audio-track-duration-measured", {
      method: metadata.method || "metadata_failed",
      durationSec: Number(metadata?.durationSec || 0) || 0,
      srcKind: "file-object-url"
    });
    return metadata;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readAudioDurationSecFromSrc(src = "") {
  const source = String(src || "").trim();
  if (!source) return Promise.resolve({ durationSec: 0, method: "" });
  return new Promise((resolve) => {
    const audio = new Audio();
    let finished = false;
    let timeoutId = 0;
    const clear = () => {
      audio.onloadedmetadata = null;
      audio.ondurationchange = null;
      audio.oncanplay = null;
      audio.ontimeupdate = null;
      audio.onerror = null;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = 0;
      }
    };
    const done = (value = 0, method = "metadata") => {
      if (finished) return;
      finished = true;
      clear();
      resolve({
        durationSec: Math.max(0, Number(value || 0) || 0),
        method
      });
    };
    const tryResolveFiniteDuration = (method = "metadata") => {
      const duration = Number(audio.duration || 0);
      if (Number.isFinite(duration) && duration > 0.05) {
        done(duration, method);
        return true;
      }
      return false;
    };
    const tryProbeInfiniteDuration = () => {
      const duration = Number(audio.duration || 0);
      if (!Number.isFinite(duration) || duration === Infinity) {
        try {
          audio.currentTime = 1e101;
          return true;
        } catch (_) {
          return false;
        }
      }
      return false;
    };
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.onloadedmetadata = () => {
      if (tryResolveFiniteDuration("metadata")) return;
      if (!tryProbeInfiniteDuration()) done(0, "");
    };
    audio.ondurationchange = () => {
      tryResolveFiniteDuration("metadata");
    };
    audio.oncanplay = () => {
      tryResolveFiniteDuration("metadata");
    };
    audio.ontimeupdate = () => {
      if (tryResolveFiniteDuration("metadata-probe")) {
        try { audio.currentTime = 0; } catch (_) {}
      }
    };
    audio.onerror = () => done(0, "");
    timeoutId = window.setTimeout(() => done(0, ""), 7000);
    audio.src = source;
    try { audio.load(); } catch (_) {
      done(0, "");
    }
  });
}

async function measureAudioDurationInfoFromSrc(src = "") {
  const source = String(src || "").trim();
  if (!source) return { durationSec: 0, method: "" };
  try {
    const decoded = await decodeAudioDurationInfoFromSrc(source);
    if (Number(decoded?.durationSec || 0) > 0.05) {
      logPodcastRenderDebug("audio-track-duration-measured", {
        method: decoded.method,
        durationSec: decoded.durationSec,
        srcKind: source.startsWith("data:") ? "data-url" : "remote"
      });
      return decoded;
    }
  } catch (_) {
    // fallback to metadata below
  }
  const metadata = await readAudioDurationSecFromSrc(source);
  logPodcastRenderDebug("audio-track-duration-measured", {
    method: metadata.method || "metadata_failed",
    durationSec: Number(metadata?.durationSec || 0) || 0,
    srcKind: source.startsWith("data:") ? "data-url" : "remote"
  });
  return metadata;
}

async function readImageReferenceFromFile(file = null) {
  if (!(file instanceof File)) throw new Error("No se recibió una imagen válida.");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").trim());
    reader.onerror = () => reject(new Error("No se pudo leer la imagen de referencia."));
    reader.readAsDataURL(file);
  });
  const normalized = normalizeReferenceImageRecord({
    name: String(file.name || "Referencia").trim() || "Referencia",
    dataUrl,
    mimeType: String(file.type || "image/png").trim().toLowerCase() || "image/png",
    updatedAt: nowIso()
  });
  if (!normalized) {
    throw new Error("La imagen de referencia es demasiado grande o no es válida.");
  }
  return normalized;
}

async function ensurePanelMusicTrackDuration(kind = "", options = {}) {
  const trackKind = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
  if (panelMusicDurationProbePendingKinds.has(trackKind)) {
    return getPanelMusicTrackByKind(trackKind);
  }
  const track = getPanelMusicTrackByKind(trackKind);
  if (!track) return null;
  const measuredWith = String(track.durationMeasuredWith || "").trim().toLowerCase();
  if (!options.force && getPanelMusicTrackDurationSec(track) > 0.05 && measuredWith === "decode") return track;
  const src = String(
    track.localDataUrl
    || resolveStorageAudioUrl(track.downloadUrl || "", track.storagePath || "")
    || track.downloadUrl
    || ""
  ).trim();
  if (!src) return track;
  panelMusicDurationProbePendingKinds.add(trackKind);
  try {
    const durationInfo = await measureAudioDurationInfoFromSrc(src);
    const durationSec = Math.max(0, Number(durationInfo?.durationSec || 0) || 0);
    if (durationSec <= 0.05) return track;
    const nextTrack = {
      ...track,
      durationSec,
      durationMeasuredWith: String(durationInfo?.method || measuredWith || "").trim().toLowerCase(),
      updatedAt: nowIso()
    };
    setPanelMusicTrack(trackKind, nextTrack, { select: panelMusicState.selectedTrackKind === trackKind });
    persistPanelMusicSettings();
    persistPanelMusicToActiveSession();
    if (options.render !== false) {
      syncMusicControls();
      renderPodcastVideoTimeline(getActiveSession());
    }
    return nextTrack;
  } finally {
    panelMusicDurationProbePendingKinds.delete(trackKind);
  }
}

async function ensureAllEnabledUploadedTrackDurations(options = {}) {
  const tracks = getEnabledPanelMusicUploadedTracks();
  if (!tracks.length) return tracks;
  for (let index = 0; index < tracks.length; index += 1) {
    const track = normalizePanelMusicTrack(tracks[index]);
    if (!track) continue;
    const measuredWith = String(track.durationMeasuredWith || "").trim().toLowerCase();
    if (!options.force && getPanelMusicTrackDurationSec(track) > 0.05 && measuredWith === "decode") continue;
    const src = String(
      track.localDataUrl
      || resolveStorageAudioUrl(track.downloadUrl || "", track.storagePath || "")
      || track.downloadUrl
      || ""
    ).trim();
    if (!src) continue;
    try {
      const durationInfo = await measureAudioDurationInfoFromSrc(src);
      const durationSec = Math.max(0, Number(durationInfo?.durationSec || 0) || 0);
      if (durationSec <= 0.05) continue;
      updateUploadedTrackAt(index, {
        ...track,
        durationSec,
        durationMeasuredWith: String(durationInfo?.method || measuredWith || "").trim().toLowerCase(),
        updatedAt: nowIso()
      }, { selectIndex: index });
    } catch (_) {
      // noop
    }
  }
  if (options.render !== false) {
    syncMusicControls();
    renderPodcastVideoTimeline(getActiveSession());
  }
  return getEnabledPanelMusicUploadedTracks();
}

function togglePanelMusicLoopMute(loopIndex = 0, kind = "") {
  const trackKind = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
  const track = getPanelMusicTrackByKind(trackKind);
  if (!track) return false;
  const normalizedLoopIndex = Math.max(0, Math.floor(Number(loopIndex) || 0));
  const currentMuted = new Set(normalizePanelMusicMutedLoopIndexes(track.mutedLoopIndexes || []));
  if (currentMuted.has(normalizedLoopIndex)) {
    currentMuted.delete(normalizedLoopIndex);
  } else {
    currentMuted.add(normalizedLoopIndex);
  }
  setPanelMusicTrack(trackKind, {
    ...track,
    mutedLoopIndexes: Array.from(currentMuted).sort((a, b) => a - b),
    updatedAt: nowIso()
  }, { select: panelMusicState.selectedTrackKind === trackKind });
  persistAudioTrackMixSettings();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
  return true;
}

function updatePanelMusicTrack(kind = "", mutator = null, options = {}) {
  const trackKind = resolvePanelMusicTrackKind(kind || panelMusicState.selectedTrackKind);
  const track = getPanelMusicTrackByKind(trackKind);
  if (!track || typeof mutator !== "function") return false;
  const nextTrack = normalizePanelMusicTrack(mutator({ ...track }));
  if (!nextTrack) return false;
  setPanelMusicTrack(trackKind, nextTrack, { select: panelMusicState.selectedTrackKind === trackKind || options.select === true });
  persistAudioTrackMixSettings();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
  return true;
}

function syncActivePanelMusicTrack(options = {}) {
  const preferredKind = resolvePanelMusicTrackKind(options.kind || panelMusicState.selectedTrackKind);
  const availableKinds = getAvailablePanelMusicTrackKinds();
  const nextKind = availableKinds.includes(preferredKind)
    ? preferredKind
    : (availableKinds[0] || "uploaded");
  panelMusicState.selectedTrackKind = nextKind;
  panelMusicState.track = getPanelMusicTrackAvailability(nextKind);
  if (!panelMusicState.track) {
    panelMusicState.sourceType = "preset";
  } else if (options.forceTrack === true || panelMusicState.sourceType === "track") {
    panelMusicState.sourceType = "track";
  }
}

function selectPanelMusicTrackKind(kind = "", options = {}) {
  const trackKind = resolvePanelMusicTrackKind(kind);
  const exactTrack = getPanelMusicTrackByKind(trackKind);
  if (!exactTrack) {
    if (options.notify !== false) {
      addChatMessage("system", trackKind === "ai"
        ? "Todavía no hay audio IA disponible para seleccionar."
        : "Todavía no hay audio cargado disponible para seleccionar.");
    }
    return false;
  }
  panelMusicState.selectedTrackKind = trackKind;
  panelMusicState.track = exactTrack;
  panelMusicState.sourceType = "track";
  return true;
}

function selectUploadedPanelMusicTrackByIndex(index = 0) {
  const trackIndex = Math.max(0, Math.floor(Number(index) || 0));
  const tracks = getPanelMusicUploadedTracks();
  const track = normalizePanelMusicTrack(tracks[trackIndex] || null);
  if (!track) return null;
  panelMusicState.selectedTrackKind = "uploaded";
  panelMusicState.track = track;
  panelMusicState.sourceType = "track";
  return track;
}

function setPanelMusicTrack(kind = "", track = null, options = {}) {
  const trackKind = resolvePanelMusicTrackKind(kind);
  const normalizedTrack = normalizePanelMusicTrack(track);
  panelMusicState.trackLibrary[trackKind] = normalizedTrack;
  if (trackKind === "uploaded" && normalizedTrack) {
    const uploadedTracks = getPanelMusicUploadedTracks();
    const selectedSlotLabel = String(normalizedTrack.slotLabel || "").trim();
    const nextUploadedTracks = uploadedTracks.map((item, index) => {
      const itemSlotLabel = String(item?.slotLabel || `Audio ${index + 1}`).trim();
      if (selectedSlotLabel && itemSlotLabel === selectedSlotLabel) {
        return {
          ...item,
          ...normalizedTrack,
          slotLabel: itemSlotLabel || `Audio ${index + 1}`
        };
      }
      return item;
    });
    if (nextUploadedTracks.length) {
      panelMusicState.trackLibrary.uploadedTracks = normalizePanelMusicTrackList(nextUploadedTracks);
      panelMusicState.trackLibrary.uploaded = panelMusicState.trackLibrary.uploadedTracks[0] || normalizedTrack;
    }
  }
  if (options.select === true) {
    selectPanelMusicTrackKind(trackKind, { notify: false });
    return;
  }
  syncActivePanelMusicTrack({
    kind: panelMusicState.selectedTrackKind,
    forceTrack: false
  });
}

function redirectToIndex() {
  try {
    window.location.replace("index.html");
  } catch (_) {
    window.location.href = "index.html";
  }
}

function loadPanelMusicSettings() {
  const storageKey = resolvePanelMusicStorageKey();
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const preset = ["ambient", "focus", "pulse"].includes(parsed?.preset) ? parsed.preset : "ambient";
    const volume = Math.max(0, Math.min(100, Number(parsed?.volume ?? 22)));
    const montageVolume = Math.max(0, Math.min(100, Number(parsed?.montageVolume ?? volume)));
    const stabilize = parsed?.stabilize === true || String(parsed?.stabilize || "").trim().toLowerCase() === "true";
    const sourceType = parsed?.sourceType === "track" ? "track" : "preset";
    const legacyTrack = normalizePanelMusicTrack(parsed?.track || null);
    const trackLibrary = {
      uploaded: normalizePanelMusicTrack(parsed?.trackLibrary?.uploaded || null),
      uploadedTracks: normalizePanelMusicTrackList(parsed?.trackLibrary?.uploadedTracks || []),
      ai: normalizePanelMusicTrack(parsed?.trackLibrary?.ai || null)
    };
    if (!trackLibrary.uploadedTracks.length && trackLibrary.uploaded) {
      trackLibrary.uploadedTracks = [{ ...trackLibrary.uploaded, slotLabel: String(trackLibrary.uploaded.slotLabel || "Audio 1").trim() || "Audio 1", enabledInSession: trackLibrary.uploaded.enabledInSession !== false }];
    }
    if (!trackLibrary.uploaded && trackLibrary.uploadedTracks.length) {
      trackLibrary.uploaded = trackLibrary.uploadedTracks[0];
    }
    if (!trackLibrary.uploaded && legacyTrack && !legacyTrack.model) {
      trackLibrary.uploaded = legacyTrack;
    }
    if (!trackLibrary.ai && legacyTrack && legacyTrack.model) {
      trackLibrary.ai = legacyTrack;
    }
    const selectedTrackKind = resolvePanelMusicTrackKind(parsed?.selectedTrackKind || (trackLibrary.ai && !trackLibrary.uploaded ? "ai" : "uploaded"));
    const availableKinds = [
      trackLibrary[selectedTrackKind] ? selectedTrackKind : "",
      trackLibrary.uploaded ? "uploaded" : "",
      trackLibrary.ai ? "ai" : ""
    ].filter(Boolean);
    const track = normalizePanelMusicTrack(trackLibrary[availableKinds[0]] || null);
    return {
      preset,
      volume,
      montageVolume,
      stabilize,
      sourceType,
      selectedTrackKind,
      trackLibrary,
      track,
      playing: false
    };
  } catch (_) {
    return {
      preset: "ambient",
      volume: 22,
      montageVolume: 22,
      stabilize: false,
      sourceType: "preset",
      selectedTrackKind: "uploaded",
      trackLibrary: {
        uploaded: null,
        uploadedTracks: [],
        ai: null
      },
      track: null,
      playing: false
    };
  }
}

function persistPanelMusicSettings() {
  const sanitizeTrackForStorage = (track) => {
    const normalized = normalizePanelMusicTrack(track);
    if (!normalized) return null;
    const localDataUrl = String(normalized.localDataUrl || "");
    return {
      ...normalized,
      enabledInSession: normalized.enabledInSession !== false,
      localDataUrl: localDataUrl.length <= MAX_LOCAL_MUSIC_DATA_URL_CHARS ? localDataUrl : ""
    };
  };
  const payload = {
    preset: panelMusicState.preset,
    volume: panelMusicState.volume,
    montageVolume: panelMusicState.montageVolume,
    stabilize: panelMusicState.stabilize === true,
    sourceType: panelMusicState.sourceType === "track" ? "track" : "preset",
    selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
    trackLibrary: {
      uploaded: sanitizeTrackForStorage(panelMusicState.trackLibrary?.uploaded || null),
      uploadedTracks: getPanelMusicUploadedTracks().map((track) => sanitizeTrackForStorage(track)).filter(Boolean),
      ai: sanitizeTrackForStorage(panelMusicState.trackLibrary?.ai || null)
    },
    track: sanitizeTrackForStorage(panelMusicState.track)
  };
  try {
    localStorage.setItem(resolvePanelMusicStorageKey(), JSON.stringify(payload));
  } catch (_) {
    const trimmedPayload = {
      ...payload,
      trackLibrary: {
        uploaded: payload.trackLibrary?.uploaded ? { ...payload.trackLibrary.uploaded, localDataUrl: "" } : null,
        uploadedTracks: Array.isArray(payload.trackLibrary?.uploadedTracks)
          ? payload.trackLibrary.uploadedTracks.map((track) => ({ ...track, localDataUrl: "" }))
          : [],
        ai: payload.trackLibrary?.ai ? { ...payload.trackLibrary.ai, localDataUrl: "" } : null
      },
      track: payload.track ? { ...payload.track, localDataUrl: "" } : null
    };
    localStorage.setItem(resolvePanelMusicStorageKey(), JSON.stringify(trimmedPayload));
  }
}

function persistPanelMusicToActiveSession() {
  const session = getActiveSession();
  if (!session) return;
  const sanitizeTrackForSession = (track) => {
    const normalized = normalizePanelMusicTrack(track);
    if (!normalized) return null;
    const isPersistedInFirebase = Boolean(String(normalized.storagePath || "").trim() && String(normalized.downloadUrl || "").trim());
    persistPanelMusicSessionTrackCache(session.id, normalized.model ? "ai" : "uploaded", isPersistedInFirebase ? "" : (normalized.localDataUrl || ""));
    return {
      ...normalized,
      localDataUrl: ""
    };
  };
  upsertActiveSession((current) => ({
    ...current,
    panelMusicConfig: {
      preset: panelMusicState.preset,
      volume: panelMusicState.volume,
      montageVolume: panelMusicState.montageVolume,
      stabilize: panelMusicState.stabilize === true,
      sourceType: panelMusicState.sourceType,
      selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
      trackLibrary: {
        uploaded: sanitizeTrackForSession(panelMusicState.trackLibrary?.uploaded || null),
        uploadedTracks: getPanelMusicUploadedTracks().map((track) => sanitizeTrackForSession(track)).filter(Boolean),
        ai: sanitizeTrackForSession(panelMusicState.trackLibrary?.ai || null)
      },
      track: sanitizeTrackForSession(panelMusicState.track)
    }
  }), { render: false });
}

function buildDefaultPanelMusicAiPrompt(session = null) {
  const activeSession = session || getActiveSession();
  const hosts = (activeSession?.script?.hosts || []).filter(Boolean);
  const speakers = hosts.length ? hosts.join(", ") : "dos hosts";
  const title = String(activeSession?.title || "").trim();
  const rows = activeSession?.script?.rows || [];
  const scenarioHint = String(activeSession?.speakerScenarioMap?.[String(rows[0]?.speaker || "").trim()] || "").replace(/\s+/g, " ").trim();
  const preset = String(panelMusicState.preset || "ambient").trim().toLowerCase();
  const styleMap = {
    ambient: "ambient cinematica suave, pads calidos, piano sutil, texturas etereas",
    focus: "lofi instrumental enfocada, piano limpio, percusion ligera, sintes suaves",
    pulse: "electronic ligera, ritmo moderno, bajo limpio, sintetizadores energicos"
  };
  return [
    "Instrumental only. No vocals, no spoken words, no choir, no narration.",
    "Background music for a conversational podcast studio.",
    `Mood/style: ${styleMap[preset] || styleMap.ambient}.`,
    `Hosts: ${speakers}.`,
    title ? `Podcast title: ${title}.` : "",
    scenarioHint ? `Scenario inspiration: ${scenarioHint}.` : "",
    "Keep it polished, loop-friendly, non-intrusive, warm, and supportive under dialogue."
  ].filter(Boolean).join(" ");
}

async function generatePanelMusicWithAi(options = {}) {
  const session = getActiveSession();
  const sessionId = String(session?.id || "").trim();
  if (!sessionId) throw new Error("No hay sesión activa.");
  const promptInput = String(els.panelMusicAiPrompt?.value || "").replace(/\s+/g, " ").trim();
  const prompt = promptInput || buildDefaultPanelMusicAiPrompt(session);
  const previousAiTrack = getPanelMusicTrackByKind("ai");
  let response = null;
  try {
    response = await authFetchJson("/api/podcaster/music/generate", {
      method: "POST",
      body: {
        sessionId,
        prompt,
        preset: String(panelMusicState.preset || "ambient").trim(),
        previousStoragePath: String(previousAiTrack?.storagePath || "").trim()
      }
    });
  } catch (error) {
    const detail = String(error?.message || "").trim().toLowerCase();
    if (detail.includes("http 404") || detail.includes("not found")) {
      throw new Error("El backend activo no expone /api/podcaster/music/generate. Reinicia con npm run dev:local o despliega la versión nueva en Render.");
    }
    throw error;
  }
  const track = response?.track && typeof response.track === "object" ? response.track : null;
  if (!track) throw new Error("No se recibió track generado.");
  setPanelMusicTrack("ai", {
    name: String(track.name || "AI Music").trim() || "AI Music",
    mimeType: String(track.mimeType || "audio/mpeg").trim() || "audio/mpeg",
    size: Math.max(0, Number(track.size || 0) || 0),
    durationSec: Math.max(0, Number(track.durationSec || 0) || 0),
    localDataUrl: "",
    downloadUrl: String(track.downloadUrl || "").trim(),
    storagePath: String(track.storagePath || "").trim(),
    updatedAt: String(track.updatedAt || nowIso()).trim() || nowIso(),
    model: String(track.model || "").trim(),
    prompt: prompt
  }, { select: true });
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  syncMusicControls();
  renderPodcastVideoTimeline(getActiveSession());
  if (getPanelMusicTrackDurationSec(panelMusicState.track) <= 0.05) {
    ensurePanelMusicTrackDuration("ai").catch(() => {});
  }
  if (panelMusicState.playing) {
    stopPanelMusic();
    await startPanelMusic();
  }
  return panelMusicState.track;
}

function makeId(prefix = "pod") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createDefaultRows() {
  return [
    {
      id: makeId("row"),
      speaker: "Host A",
      expression: "Cálido",
      durationSec: 6,
      mediaCue: "Intro musical",
      text: "Bienvenidos a nuestro podcast. Hoy abrimos una conversación útil y accionable.",
      notes: "Abrir con energía tranquila.",
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG }
    },
    {
      id: makeId("row"),
      speaker: "Host B",
      expression: "Curioso",
      durationSec: 6,
      mediaCue: "Sin media",
      text: "Vamos a tomar una idea y convertirla en un episodio claro, dinámico y listo para producción.",
      notes: "Mantener ritmo conversacional.",
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG }
    }
  ];
}

function normalizeDisfluencyConfig(raw = {}) {
  const enabled = raw?.enabled === true || String(raw?.enabled || "").trim().toLowerCase() === "true";
  const fillerLevel = Math.max(0, Math.min(DISFLUENCY_LEVEL_MAX.fillerLevel, Number(raw?.fillerLevel ?? DEFAULT_DISFLUENCY_CONFIG.fillerLevel) || 0));
  const errorLevel = Math.max(0, Math.min(DISFLUENCY_LEVEL_MAX.errorLevel, Number(raw?.errorLevel ?? DEFAULT_DISFLUENCY_CONFIG.errorLevel) || 0));
  const stutterEnabled = raw?.stutterEnabled === true || String(raw?.stutterEnabled || "").trim().toLowerCase() === "true";
  const stutterLevel = Math.max(0, Math.min(DISFLUENCY_LEVEL_MAX.stutterLevel, Number(raw?.stutterLevel ?? DEFAULT_DISFLUENCY_CONFIG.stutterLevel) || 0));
  return { enabled, fillerLevel, errorLevel, stutterEnabled, stutterLevel };
}

function getRowDisfluencyConfig(row = {}) {
  return normalizeDisfluencyConfig(row?.disfluencyConfig || {});
}

function hasActiveDisfluencyConfig(cfg = {}) {
  return cfg.enabled === true || cfg.stutterEnabled === true;
}

function hashString32(input = "") {
  let hash = 2166136261;
  const text = String(input || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickUniqueIndexes(total = 0, count = 0, rand = Math.random) {
  if (total <= 0 || count <= 0) return [];
  const target = Math.max(0, Math.min(total, count));
  const set = new Set();
  let guard = 0;
  while (set.size < target && guard < total * 12) {
    set.add(Math.floor(rand() * total));
    guard += 1;
  }
  return Array.from(set).sort((a, b) => a - b);
}

function extractFirstSyllable(word = "") {
  const clean = String(word || "");
  const match = clean.match(/^([^aeiouáéíóúüAEIOUÁÉÍÓÚÜ]*[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]+[^aeiouáéíóúüAEIOUÁÉÍÓÚÜ]?)/u);
  if (match?.[1]) return match[1];
  return clean.slice(0, Math.min(2, clean.length));
}

function buildStutterWord(word = "", level = 0) {
  const base = String(word || "");
  if (!base || base.length < 3) return base;
  const syllable = extractFirstSyllable(base);
  if (!syllable) return base;
  const repeats = level >= 72 ? 3 : level >= 38 ? 2 : 1;
  const prefix = Array.from({ length: repeats }, () => syllable.toLowerCase()).join("-");
  return `${prefix}-${base}`;
}

function buildTypoWord(word = "", rand = Math.random) {
  const source = String(word || "");
  if (source.length < 4) return source;
  const chars = source.split("");
  const mode = Math.floor(rand() * 3);
  if (mode === 0 && chars.length > 4) {
    const idx = 1 + Math.floor(rand() * (chars.length - 2));
    chars.splice(idx, 1);
    return chars.join("");
  }
  if (mode === 1 && chars.length > 4) {
    const idx = 1 + Math.floor(rand() * (chars.length - 2));
    const swapIdx = Math.min(chars.length - 2, idx + 1);
    [chars[idx], chars[swapIdx]] = [chars[swapIdx], chars[idx]];
    return chars.join("");
  }
  const idx = Math.floor(rand() * chars.length);
  chars[idx] = chars[idx] === chars[idx].toUpperCase() ? chars[idx].toLowerCase() : chars[idx].toUpperCase();
  return chars.join("");
}

function injectStutterBySyllable(text = "", stutterLevel = 0, rand = Math.random) {
  const source = String(text || "").trim();
  if (!source || stutterLevel <= 0) return source;
  const tokens = source.split(/(\s+)/);
  const candidates = [];
  tokens.forEach((token, index) => {
    if (/^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ][A-Za-zÁÉÍÓÚÜáéíóúüÑñ'-]{2,}$/u.test(token)) {
      candidates.push(index);
    }
  });
  if (!candidates.length) return source;
  const target = Math.max(1, Math.round((stutterLevel / DISFLUENCY_LEVEL_MAX.stutterLevel) * Math.min(12, candidates.length)));
  const picks = pickUniqueIndexes(candidates.length, target, rand);
  picks.forEach((pick) => {
    const idx = candidates[pick];
    tokens[idx] = buildStutterWord(tokens[idx], stutterLevel);
  });
  return tokens.join("");
}

function injectAutocorrectedErrors(text = "", errorLevel = 0, rand = Math.random) {
  const source = String(text || "").trim();
  if (!source || errorLevel <= 0) return source;
  const tokens = source.split(/(\s+)/);
  const candidates = [];
  tokens.forEach((token, index) => {
    if (/^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ][A-Za-zÁÉÍÓÚÜáéíóúüÑñ'-]{3,}$/u.test(token)) {
      candidates.push(index);
    }
  });
  if (!candidates.length) return source;
  const target = Math.max(1, Math.round((errorLevel / DISFLUENCY_LEVEL_MAX.errorLevel) * Math.min(10, candidates.length)));
  const picks = pickUniqueIndexes(candidates.length, target, rand);
  picks.forEach((pick) => {
    const idx = candidates[pick];
    const original = tokens[idx];
    const typo = buildTypoWord(original, rand);
    if (typo.toLowerCase() === original.toLowerCase()) return;
    tokens[idx] = `${typo}, perdón, ${original}`;
  });
  return tokens.join("");
}

function injectFillers(text = "", fillerLevel = 0, rand = Math.random) {
  const source = String(text || "").trim();
  if (!source || fillerLevel <= 0) return source;
  const clauses = source.split(/([,.;:!?])/);
  const clauseIndexes = [];
  for (let i = 0; i < clauses.length; i += 2) {
    if (String(clauses[i] || "").trim()) clauseIndexes.push(i);
  }
  if (!clauseIndexes.length) return source;
  const fillers = ["eh", "mmm", "este", "o sea", "a ver", "digamos", "pues"];
  const target = Math.max(1, Math.round((fillerLevel / DISFLUENCY_LEVEL_MAX.fillerLevel) * Math.min(14, clauseIndexes.length + 8)));
  const picks = pickUniqueIndexes(clauseIndexes.length, Math.min(clauseIndexes.length, target), rand);
  picks.forEach((pick) => {
    const idx = clauseIndexes[pick];
    const raw = String(clauses[idx] || "");
    const filler = fillers[Math.floor(rand() * fillers.length)];
    clauses[idx] = `${filler}, ${raw.trimStart()}`;
  });
  return clauses.join("").replace(/\s{2,}/g, " ").trim();
}

function extractStageDirections(text = "") {
  const source = String(text || "");
  if (!source) return [];
  const matches = [...source.matchAll(/\(([^)]+)\)|\[([^\]]+)\]/g)];
  return matches
    .map((match) => String(match?.[1] || match?.[2] || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stripStageDirectionsFromSpeech(text = "") {
  const source = String(text || "");
  if (!source) return "";
  return source
    .replace(/\(([^)]+)\)|\[([^\]]+)\]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildScenePerformanceDirective(row = {}, extraDirective = "") {
  const inlineDirections = extractStageDirections(row?.text || "");
  const explicitDirective = String(extraDirective || row?.videoDirective || "").replace(/\s+/g, " ").trim();
  const parts = [];
  if (inlineDirections.length) {
    parts.push(`Realiza estas acotaciones del guion como acciones físicas/expresivas sin verbalizarlas: ${inlineDirections.join("; ")}.`);
  }
  if (explicitDirective) {
    parts.push(`Especificación adicional del usuario para el video: ${explicitDirective}.`);
  }
  return parts.join(" ").trim();
}

function buildTargetSpeechLine(row = {}, session = null) {
  const base = stripStageDirectionsFromSpeech(row?.text || "");
  if (!base) return "";
  const cfg = getRowDisfluencyConfig(row);
  if (!hasActiveDisfluencyConfig(cfg)) return base;
  const seed = hashString32([
    base,
    row?.id || "",
    row?.speaker || "",
    resolveSpeakerDisplayName(row?.speaker || "", session),
    cfg.enabled ? "1" : "0",
    cfg.stutterEnabled ? "1" : "0",
    cfg.fillerLevel,
    cfg.errorLevel,
    cfg.stutterLevel
  ].join("|"));
  const rand = createSeededRandom(seed);
  let output = base;
  if (cfg.enabled) {
    output = injectAutocorrectedErrors(output, cfg.errorLevel, rand);
  }
  if (cfg.stutterEnabled) {
    output = injectStutterBySyllable(output, cfg.stutterLevel, rand);
  }
  if (cfg.enabled) {
    output = injectFillers(output, cfg.fillerLevel, rand);
  }
  return output || base;
}

function buildDisfluencyInstruction(row = {}) {
  const cfg = getRowDisfluencyConfig(row);
  if (!hasActiveDisfluencyConfig(cfg)) {
    return "No agregues muletillas, errores ni tartamudeo deliberado; mantén una dicción natural y limpia.";
  }
  const filler = cfg.fillerLevel;
  const error = cfg.errorLevel;
  const stutter = cfg.stutterLevel;
  const fillerRatio = filler / DISFLUENCY_LEVEL_MAX.fillerLevel;
  const errorRatio = error / DISFLUENCY_LEVEL_MAX.errorLevel;
  const stutterRatio = stutter / DISFLUENCY_LEVEL_MAX.stutterLevel;
  const fillerCount = Math.max(0, Math.round(fillerRatio * 12));
  const errorCount = Math.max(0, Math.round(errorRatio * 10));
  const fillerGuide = fillerRatio <= 0.14
    ? "Muletillas mínimas."
    : fillerRatio <= 0.32
      ? "Muletillas leves."
      : fillerRatio <= 0.58
        ? "Muletillas moderadas."
        : fillerRatio <= 0.82
          ? "Muletillas altas y frecuentes."
          : "Muletillas muy altas (estilo coloquial cargado).";
  const errorGuide = errorRatio <= 0.14
    ? "Errores casi nulos; una vacilación corta autocorregida."
    : errorRatio <= 0.32
      ? "Errores leves: autocorrecciones pequeñas."
      : errorRatio <= 0.58
        ? "Errores moderados: varias autocorrecciones notorias."
        : errorRatio <= 0.82
          ? "Errores altos: interrupciones y reformulaciones frecuentes."
          : "Errores muy altos: múltiples correcciones breves en la misma intervención.";
  const stutterGuide = stutter <= 20
    ? "Tartamudeo mínimo: una repetición silábica ocasional al inicio de frase."
    : stutter <= 45
      ? "Tartamudeo leve: repite sílaba o palabra corta 1 a 2 veces por intervención."
      : stutter <= 70
        ? "Tartamudeo moderado: repeticiones perceptibles en 2 a 4 puntos de la intervención."
        : "Tartamudeo notable pero controlado: repeticiones frecuentes sin volver ininteligible el mensaje.";
  const mainEnabledLine = cfg.enabled
    ? `${fillerGuide} ${errorGuide}`
    : "No agregues muletillas ni errores; conserva articulación limpia.";
  const stutterEnabledLine = cfg.stutterEnabled
    ? stutterGuide
    : "Sin tartamudeo deliberado.";
  return [
    mainEnabledLine,
    stutterEnabledLine,
    `Objetivo aproximado por intervención: ${fillerCount} muletillas y ${errorCount} errores breves autocorregidos.`,
    "Los errores deben sonar espontáneos, breves y autocorregidos al instante, sin romper el sentido.",
    "No limpies ni normalices muletillas/errores/tartamudeo cuando aparezcan en la línea objetivo.",
    `Nivel muletillas ${Math.round(filler)}/${DISFLUENCY_LEVEL_MAX.fillerLevel}, nivel errores ${Math.round(error)}/${DISFLUENCY_LEVEL_MAX.errorLevel}, nivel tartamudeo ${Math.round(stutter)}/${DISFLUENCY_LEVEL_MAX.stutterLevel}.`,
    stutterRatio >= 0.75 ? "Si el tartamudeo es alto, conserva inteligibilidad y evita exageración caricaturesca." : ""
  ].join(" ");
}

function normalizeSpeakerPortraitMap(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([speaker, portrait]) => {
    const key = String(speaker || "").trim();
    if (!key || !portrait || typeof portrait !== "object") return;
    const downloadUrl = String(portrait.downloadUrl || "").trim();
    const storagePath = String(portrait.storagePath || "").trim();
    if (!downloadUrl && !storagePath) return;
    next[key] = {
      speaker: key,
      downloadUrl,
      storagePath,
      voiceName: normalizeLiveVoiceName(String(portrait.voiceName || "").trim(), ""),
      genderGroup: normalizeVoiceGenderGroup(portrait.genderGroup),
      expression: String(portrait.expression || "Neutral").trim() || "Neutral",
      scenarioPrompt: String(portrait.scenarioPrompt || "").replace(/\s+/g, " ").trim(),
      scenarioId: String(portrait.scenarioId || "").trim(),
      scenarioImageUrl: String(portrait.scenarioImageUrl || "").trim(),
      scenarioImageStoragePath: String(portrait.scenarioImageStoragePath || "").trim(),
      mimeType: String(portrait.mimeType || "image/png").trim() || "image/png",
      updatedAt: String(portrait.updatedAt || nowIso()).trim() || nowIso(),
      model: String(portrait.model || PODCASTER_IMAGE_MODEL_DEFAULT).trim() || PODCASTER_IMAGE_MODEL_DEFAULT,
      promptVersion: String(portrait.promptVersion || "podcaster_v1").trim() || "podcaster_v1"
    };
  });
  return next;
}

function getSpeakerPortraitMap(session = null) {
  return normalizeSpeakerPortraitMap(session?.speakerPortraitMap || {});
}

function normalizeReferenceImageRecord(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const dataUrl = String(raw.dataUrl || "").trim().slice(0, MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS);
  if (!dataUrl.startsWith("data:image/")) return null;
  return {
    name: String(raw.name || "Referencia").trim().slice(0, 180) || "Referencia",
    dataUrl,
    mimeType: String(raw.mimeType || "image/png").trim().toLowerCase() || "image/png",
    updatedAt: String(raw.updatedAt || nowIso()).trim() || nowIso()
  };
}

function normalizeReferenceImageMap(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([key, value]) => {
    const cleanKey = String(key || "").trim();
    const normalized = normalizeReferenceImageRecord(value);
    if (!cleanKey || !normalized) return;
    next[cleanKey] = normalized;
  });
  return next;
}

function getSpeakerReferenceImageMap(session = null) {
  return normalizeReferenceImageMap(session?.speakerReferenceImageMap || {});
}

function getScenarioReferenceImageMap(session = null) {
  return normalizeReferenceImageMap(session?.scenarioReferenceImageMap || {});
}

function setSpeakerReferenceImage(speaker = "", reference = null) {
  const key = normalizeSpeakerLabel(speaker, "");
  if (!key) return false;
  const normalized = normalizeReferenceImageRecord(reference);
  upsertActiveSession((current) => {
    const nextMap = { ...getSpeakerReferenceImageMap(current) };
    if (normalized) nextMap[key] = normalized;
    else delete nextMap[key];
    return {
      ...current,
      speakerReferenceImageMap: nextMap
    };
  }, { render: false });
  renderPodcastPortraitStrip(getActiveSession(), { force: true, reason: "structure" });
  return true;
}

function setScenarioReferenceImage(scenarioId = "", reference = null) {
  const key = String(scenarioId || "").trim();
  if (!key) return false;
  const normalized = normalizeReferenceImageRecord(reference);
  upsertActiveSession((current) => {
    const nextMap = { ...getScenarioReferenceImageMap(current) };
    if (normalized) nextMap[key] = normalized;
    else delete nextMap[key];
    return {
      ...current,
      scenarioReferenceImageMap: nextMap
    };
  }, { render: false });
  renderPodcastPortraitStrip(getActiveSession(), { force: true, reason: "structure" });
  return true;
}

function buildReusableSpeakerPortraitRecord(speaker = "", portrait = null, overrides = {}) {
  const key = normalizeSpeakerLabel(speaker, "");
  if (!key || !portrait || typeof portrait !== "object") return null;
  const normalized = normalizeSpeakerPortraitMap({
    [key]: {
      ...portrait,
      speaker: key,
      ...overrides
    }
  });
  return normalized[key] || null;
}

function findReusablePortraitForSpeaker(session = null, speaker = "", options = {}) {
  const activeSession = session || getActiveSession();
  const key = normalizeSpeakerLabel(speaker, "");
  if (!activeSession || !key) return null;
  const desiredScenario = String(
    options.scenarioPrompt || resolveSpeakerStudioScenarioPrompt(activeSession, key, { expression: options.expression })
  ).replace(/\s+/g, " ").trim();
  const desiredScenarioAsset = options.scenarioAsset && typeof options.scenarioAsset === "object" ?
    options.scenarioAsset :
    resolveActiveGlobalScenarioAsset(activeSession);
  const desiredScenarioId = String(options.scenarioId || desiredScenarioAsset?.id || "").trim();
  const desiredScenarioPath = String(options.scenarioImageStoragePath || desiredScenarioAsset?.storagePath || "").trim();
  const desiredScenarioUrl = String(options.scenarioImageUrl || desiredScenarioAsset?.downloadUrl || "").trim();
  const desiredVoice = normalizeLiveVoiceName(
    String(options.voiceName || resolveConfiguredSpeakerVoiceForGeneration(key, activeSession)).trim(),
    resolveSpeakerVoiceName(key, activeSession)
  );
  const desiredExpression = String(options.expression || getSpeakerExpressionMap(activeSession)[key] || "Neutral").trim() || "Neutral";
  const desiredGender = normalizeVoiceGenderGroup(
    options.genderGroup
    || resolveAgentVoiceProfile(desiredVoice, desiredVoice)?.genderGroup
    || ""
  );
  let bestMatch = null;
  let bestScore = -1;

  state.sessions.forEach((candidateSession) => {
    if (!candidateSession || candidateSession.id === activeSession.id) return;
    const portrait = getSpeakerPortraitMap(candidateSession)[key];
    if (!portrait) return;
    const mediaUrl = String(portrait.downloadUrl || portrait.storagePath || "").trim();
    if (!mediaUrl) return;
    const portraitScenario = String(portrait.scenarioPrompt || "").replace(/\s+/g, " ").trim();
    if (desiredScenario && portraitScenario !== desiredScenario) return;
    const portraitScenarioId = String(portrait.scenarioId || "").trim();
    const portraitScenarioPath = String(portrait.scenarioImageStoragePath || "").trim();
    const portraitScenarioUrl = String(portrait.scenarioImageUrl || "").trim();
    if (desiredScenarioId && portraitScenarioId && portraitScenarioId !== desiredScenarioId) return;
    if (desiredScenarioPath && portraitScenarioPath && portraitScenarioPath !== desiredScenarioPath) return;
    if (desiredScenarioUrl && portraitScenarioUrl && portraitScenarioUrl !== desiredScenarioUrl) return;
    if (desiredScenarioId && !portraitScenarioId && (portraitScenarioPath || portraitScenarioUrl)) return;
    if (desiredScenarioPath && !portraitScenarioPath && portraitScenarioId) return;
    const portraitVoice = normalizeLiveVoiceName(String(portrait.voiceName || "").trim(), "");
    const portraitGender = normalizeVoiceGenderGroup(portrait.genderGroup || "");
    const portraitExpression = String(portrait.expression || "").trim();
    let score = 100;
    if (portraitVoice && desiredVoice && portraitVoice === desiredVoice) score += 40;
    if (portraitGender && desiredGender && portraitGender === desiredGender) score += 20;
    if (portraitExpression && desiredExpression && portraitExpression === desiredExpression) score += 10;
    if (!portraitVoice && !desiredVoice) score += 5;
    if (!portraitGender && !desiredGender) score += 5;
    const updatedAtMs = Date.parse(String(portrait.updatedAt || "").trim());
    score += Number.isFinite(updatedAtMs) ? Math.max(0, Math.min(4, updatedAtMs / 1e13)) : 0;
    if (score <= bestScore) return;
    bestScore = score;
    bestMatch = {
      portrait,
      sourceSessionId: candidateSession.id
    };
  });

  if (!bestMatch?.portrait) return null;
  const reusedPortrait = buildReusableSpeakerPortraitRecord(key, bestMatch.portrait, {
    voiceName: desiredVoice || bestMatch.portrait.voiceName,
    genderGroup: desiredGender || bestMatch.portrait.genderGroup,
    expression: desiredExpression || bestMatch.portrait.expression,
    scenarioPrompt: desiredScenario || bestMatch.portrait.scenarioPrompt,
    scenarioId: desiredScenarioId || bestMatch.portrait.scenarioId,
    scenarioImageStoragePath: desiredScenarioPath || bestMatch.portrait.scenarioImageStoragePath,
    scenarioImageUrl: desiredScenarioUrl || bestMatch.portrait.scenarioImageUrl,
    updatedAt: nowIso()
  });
  return reusedPortrait ? { ...reusedPortrait, sourceSessionId: bestMatch.sourceSessionId } : null;
}

function reuseSpeakerPortraitFromOtherSession(session = null, speaker = "", options = {}) {
  const activeSession = session || getActiveSession();
  const key = normalizeSpeakerLabel(speaker, "");
  if (!activeSession || !key) return null;
  const reusedPortrait = findReusablePortraitForSpeaker(activeSession, key, options);
  if (!reusedPortrait) return null;

  upsertActiveSession((current) => ({
    ...current,
    speakerPortraitMap: {
      ...getSpeakerPortraitMap(current),
      [key]: buildReusableSpeakerPortraitRecord(key, reusedPortrait) || reusedPortrait
    }
  }), { render: false });

  return reusedPortrait;
}

function normalizeDialogueVideoMap(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, clip]) => {
    const key = String(rowId || "").trim();
    if (!key || !clip || typeof clip !== "object") return;
    const downloadUrl = String(clip.downloadUrl || "").trim();
    const storagePath = String(clip.storagePath || "").trim();
    if (!downloadUrl && !storagePath) return;
    const rawSegments = Array.isArray(clip.segments) ? clip.segments : [];
    const segments = rawSegments
      .map((segment, idx) => {
        if (!segment || typeof segment !== "object") return null;
        const segUrl = String(segment.downloadUrl || "").trim();
        const segPath = String(segment.storagePath || "").trim();
        if (!segUrl && !segPath) return null;
        return {
          id: String(segment.id || `${key}-seg-${idx + 1}`).trim() || `${key}-seg-${idx + 1}`,
          index: Math.max(0, Number(segment.index) || idx),
          durationSec: Math.max(0, Number(segment.durationSec) || 0),
          downloadUrl: segUrl,
          storagePath: segPath,
          mimeType: String(segment.mimeType || "video/mp4").trim() || "video/mp4",
          variant: String(segment.variant || "").trim(),
          targetSpeechLine: String(segment.targetSpeechLine || "").trim()
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);
    next[key] = {
      rowId: key,
      speaker: String(clip.speaker || "").trim(),
      mimeType: String(clip.mimeType || "video/mp4").trim() || "video/mp4",
      model: String(clip.model || "veo-3.1-generate-preview").trim() || "veo-3.1-generate-preview",
      variant: String(clip.variant || "").trim(),
      promptVersion: String(clip.promptVersion || "podcaster_veo_v1").trim() || "podcaster_veo_v1",
      videoDirective: String(clip.videoDirective || "").replace(/\s+/g, " ").trim(),
      durationSec: Math.max(0, Number(clip.durationSec) || 0),
      targetSpeechLine: String(clip.targetSpeechLine || "").trim(),
      segments,
      updatedAt: String(clip.updatedAt || nowIso()).trim() || nowIso(),
      downloadUrl,
      storagePath
    };
  });
  return next;
}

function getDialogueVideoMap(session = null) {
  return normalizeDialogueVideoMap(session?.dialogueVideoMap || {});
}

function normalizeDialogueAudioMap(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, clip]) => {
    const key = String(rowId || "").trim();
    if (!key || !clip || typeof clip !== "object") return;
    const downloadUrl = String(clip.downloadUrl || "").trim();
    const storagePath = String(clip.storagePath || "").trim();
    if (!downloadUrl && !storagePath) return;
    next[key] = {
      rowId: key,
      speaker: String(clip.speaker || "").trim(),
      mimeType: String(clip.mimeType || "audio/wav").trim() || "audio/wav",
      model: String(clip.model || "gemini-2.5-flash-preview-tts").trim() || "gemini-2.5-flash-preview-tts",
      promptVersion: String(clip.promptVersion || "podcaster_live_audio_v1").trim() || "podcaster_live_audio_v1",
      durationSec: Math.max(0, Number(clip.durationSec) || 0),
      targetSpeechLine: String(clip.targetSpeechLine || "").trim(),
      updatedAt: String(clip.updatedAt || nowIso()).trim() || nowIso(),
      downloadUrl,
      storagePath
    };
  });
  return next;
}

function getDialogueAudioMap(session = null) {
  return normalizeDialogueAudioMap(session?.dialogueAudioMap || {});
}

function resolveDialogueAudioForRow(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return null;
  return getDialogueAudioMap(session)[key] || null;
}

function hasStoredMediaSource(asset = null) {
  if (!asset || typeof asset !== "object") return false;
  return Boolean(String(asset.downloadUrl || "").trim() || String(asset.storagePath || "").trim());
}

function normalizeTransitionsByEdge(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([edgeKey, item]) => {
    const key = String(edgeKey || "").trim();
    if (!key || !item || typeof item !== "object") return;
    const type = String(item.type || "cut").trim().toLowerCase();
    next[key] = {
      type: STUDIO_TRANSITION_TYPES.includes(type) ? type : "cut",
      durationMs: Math.max(0, Math.min(1200, Number(item.durationMs) || 0))
    };
  });
  return next;
}

function normalizeTimelineClipItem(raw = {}, rowId = "") {
  const key = String(rowId || raw?.rowId || "").trim();
  if (!key) return null;
  const sourceDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(toFiniteNumber(raw?.sourceDurationMs, 8000)));
  const trimInMs = Math.max(0, Math.min(sourceDurationMs - STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(toFiniteNumber(raw?.trimInMs, 0))));
  const fallbackTrimOut = sourceDurationMs;
  const trimOutMs = Math.max(
    trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.min(sourceDurationMs, Math.round(toFiniteNumber(raw?.trimOutMs, fallbackTrimOut)))
  );
  return {
    rowId: key,
    speakerKey: String(raw?.speakerKey || "").trim(),
    trackId: String(raw?.trackId || "").trim() || `speaker:${String(raw?.speakerKey || "unknown").trim().toLowerCase() || "unknown"}`,
    startMs: Math.max(0, Math.round(toFiniteNumber(raw?.startMs, 0))),
    sourceDurationMs,
    trimInMs,
    trimOutMs,
    zIndex: Math.max(1, Math.round(toFiniteNumber(raw?.zIndex, 1)))
  };
}

function normalizeTimelineClipsByRowId(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, clip]) => {
    const normalized = normalizeTimelineClipItem(clip, rowId);
    if (!normalized) return;
    next[normalized.rowId] = normalized;
  });
  return next;
}

function normalizeTimelineTrackItem(raw = {}, index = 0) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const fallbackLabel = `Track ${index + 1}`;
  const label = String(raw?.label || fallbackLabel).trim() || fallbackLabel;
  return {
    id,
    label,
    order: Math.max(0, Math.round(toFiniteNumber(raw?.order, index)))
  };
}

function normalizeTimelineTracks(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const next = [];
  raw.forEach((item, index) => {
    const normalized = normalizeTimelineTrackItem(item, index);
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    next.push(normalized);
  });
  next.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.id || "").localeCompare(String(b.id || "")));
  return next.map((track, index) => ({
    ...track,
    order: index
  }));
}

function resolveTimelineDefaultTrackIdForSpeaker(speakerKey = "") {
  const key = String(speakerKey || "").trim().toLowerCase() || "unknown";
  return `speaker:${key}`;
}

function buildDefaultTimelineTracks(session = null) {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const speakerOrder = [];
  rows.forEach((row) => {
    const speakerKey = String(row?.speaker || "").trim();
    if (!speakerKey || speakerOrder.includes(speakerKey)) return;
    speakerOrder.push(speakerKey);
  });
  if (!speakerOrder.length) {
    return [{
      id: "speaker:unknown",
      label: "Track 1",
      order: 0
    }];
  }
  return speakerOrder.map((speakerKey, index) => ({
    id: resolveTimelineDefaultTrackIdForSpeaker(speakerKey),
    label: resolveSpeakerDisplayName(speakerKey, activeSession),
    order: index
  }));
}

function normalizePodcastVideoConfig(raw = {}) {
  const audioMode = String(raw?.audioMode || "").trim().toLowerCase();
  const timelineViewMode = String(raw?.timelineViewMode || "").trim().toLowerCase();
  const masterVolume = Math.max(0, Math.min(100, toFiniteNumber(raw?.masterVolume, 100)));
  const clipVolume = Math.max(0, Math.min(100, toFiniteNumber(raw?.clipVolume, 0)));
  return {
    enabled: raw?.enabled === true,
    editorEnabled: raw?.editorEnabled === true,
    autoGenerateScenarioImages: raw?.autoGenerateScenarioImages === true,
    autoGeneratePortraits: raw?.autoGeneratePortraits === true,
    allowLivePreviewWithoutStoredAudio: raw?.allowLivePreviewWithoutStoredAudio === true,
    cheapVideoMode: raw?.cheapVideoMode !== false,
    timelineVersion: Math.max(1, Math.round(toFiniteNumber(raw?.timelineVersion, STUDIO_TIMELINE_VERSION))),
    timelineTrackVersion: Math.max(1, Math.round(toFiniteNumber(raw?.timelineTrackVersion, STUDIO_TIMELINE_TRACK_VERSION))),
    timelineTracks: normalizeTimelineTracks(raw?.timelineTracks || []),
    timelineClipsByRowId: normalizeTimelineClipsByRowId(raw?.timelineClipsByRowId || {}),
    timelineViewMode: timelineViewMode === "normal" ? "normal" : "tracks",
    transitionsByEdge: normalizeTransitionsByEdge(raw?.transitionsByEdge || {}),
    audioMode: audioMode === "veo-native-audio" ? "veo-native-audio" : "gemini-live-per-scene",
    masterVolume,
    clipVolume
  };
}

function getRowSourceDurationMs(row = null, session = null) {
  if (!row) return 8000;
  const rowId = String(row?.id || "").trim();
  const videoClip = rowId ? resolveDialogueVideoForRow(session, rowId) : null;
  const audioClip = rowId ? resolveDialogueAudioForRow(session, rowId) : null;
  const videoMs = Math.max(0, Number(videoClip?.durationSec) || 0) * 1000;
  const audioMs = Math.max(0, Number(audioClip?.durationSec) || 0) * 1000;
  const rowMs = Math.max(0, Number(row?.durationSec) || 0) * 1000;
  const candidate = audioMs > 0
    ? audioMs
    : rowMs > 0
      ? rowMs
      : videoMs > 0
        ? videoMs
        : 800;
  return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(candidate || 8000));
}

function buildDefaultTimelineClipsByRowId(session = null) {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const next = {};
  let cursorMs = 0;
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const speakerKey = String(row?.speaker || "").trim();
    const sourceDurationMs = getRowSourceDurationMs(row, activeSession);
    const clip = normalizeTimelineClipItem({
      rowId,
      speakerKey,
      trackId: resolveTimelineDefaultTrackIdForSpeaker(speakerKey),
      startMs: cursorMs,
      sourceDurationMs,
      trimInMs: 0,
      trimOutMs: sourceDurationMs,
      zIndex: index + 1
    }, rowId);
    if (!clip) return;
    next[rowId] = clip;
    cursorMs += Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, clip.trimOutMs - clip.trimInMs);
  });
  return next;
}

function ensureTimelineTracks(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const persist = options.persist === true;
  const cfg = getPodcastVideoConfig(activeSession);
  const rows = activeSession?.script?.rows || [];
  const existingTracks = normalizeTimelineTracks(cfg.timelineTracks || []);
  const fallbackTracks = buildDefaultTimelineTracks(activeSession);
  const sourceTracks = existingTracks.length ? existingTracks : fallbackTracks;
  const nextTracks = sourceTracks.map((track, index) => ({
    id: String(track.id || "").trim(),
    label: String(track.label || `Track ${index + 1}`).trim() || `Track ${index + 1}`,
    order: index
  })).filter((track) => track.id);
  const knownTrackIds = new Set(nextTracks.map((track) => track.id));
  const ensureTrack = (trackId = "", label = "") => {
    const id = String(trackId || "").trim();
    if (!id || knownTrackIds.has(id)) return;
    knownTrackIds.add(id);
    nextTracks.push({
      id,
      label: String(label || `Track ${nextTracks.length + 1}`).trim() || `Track ${nextTracks.length + 1}`,
      order: nextTracks.length
    });
  };
  rows.forEach((row) => {
    const speakerKey = String(row?.speaker || "").trim();
    if (!speakerKey) return;
    const trackId = resolveTimelineDefaultTrackIdForSpeaker(speakerKey);
    ensureTrack(trackId, resolveSpeakerDisplayName(speakerKey, activeSession));
  });
  const existingClipMap = normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {});
  Object.values(existingClipMap).forEach((clip) => {
    const trackId = String(clip?.trackId || "").trim();
    if (!trackId) return;
    ensureTrack(trackId, `Track ${nextTracks.length + 1}`);
  });
  if (!nextTracks.length) {
    nextTracks.push({
      id: "speaker:unknown",
      label: "Track 1",
      order: 0
    });
  }
  const normalizedNext = normalizeTimelineTracks(nextTracks);
  const changed = JSON.stringify(normalizedNext) !== JSON.stringify(existingTracks)
    || Number(cfg.timelineTrackVersion || 1) !== STUDIO_TIMELINE_TRACK_VERSION;
  if (persist && changed) {
    upsertPodcastVideoConfig((base) => ({
      ...base,
      timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineTracks: normalizedNext
    }));
  }
  return normalizedNext;
}

function ensureTimelineClipsByRowId(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const persist = options.persist === true;
  const rows = activeSession?.script?.rows || [];
  const cfg = getPodcastVideoConfig(activeSession);
  const timelineTracks = ensureTimelineTracks(activeSession, { persist: false });
  const validTrackIds = new Set(timelineTracks.map((track) => String(track.id || "").trim()).filter(Boolean));
  const fallbackTrackId = String(timelineTracks[0]?.id || "speaker:unknown").trim() || "speaker:unknown";
  const existing = normalizeTimelineClipsByRowId(cfg.timelineClipsByRowId || {});
  const fallback = buildDefaultTimelineClipsByRowId(activeSession);
  const next = {};
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const existingClip = existing[rowId];
    const base = existingClip || fallback[rowId];
    if (!base) return;
    const sourceDurationMs = getRowSourceDurationMs(row, activeSession);
    const speakerKey = String(row?.speaker || "").trim();
    const speakerTrackId = resolveTimelineDefaultTrackIdForSpeaker(speakerKey);
    const selectedTrackId = validTrackIds.has(String(base.trackId || "").trim())
      ? String(base.trackId || "").trim()
      : (validTrackIds.has(speakerTrackId) ? speakerTrackId : fallbackTrackId);
    const existingSourceDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(existingClip?.sourceDurationMs || base?.sourceDurationMs || sourceDurationMs)
    );
    const existingTrimInMs = Math.max(0, Number(existingClip?.trimInMs ?? base?.trimInMs ?? 0));
    const existingTrimOutMs = Math.max(
      existingTrimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(existingClip?.trimOutMs ?? base?.trimOutMs ?? sourceDurationMs)
    );
    const followsWholeSourceDuration = Boolean(existingClip)
      && existingTrimInMs <= 1
      && Math.abs(existingTrimOutMs - existingSourceDurationMs) <= 1;
    const normalized = normalizeTimelineClipItem({
      ...base,
      speakerKey,
      trackId: selectedTrackId,
      sourceDurationMs,
      trimInMs: followsWholeSourceDuration ? 0 : existingTrimInMs,
      trimOutMs: followsWholeSourceDuration ? sourceDurationMs : existingTrimOutMs,
      zIndex: Math.max(1, Number(base.zIndex || index + 1))
    }, rowId);
    if (!normalized) return;
    next[rowId] = normalized;
  });
  const changed = JSON.stringify(next) !== JSON.stringify(existing) || Number(cfg.timelineVersion || 1) !== STUDIO_TIMELINE_VERSION;
  if (persist && changed) {
    upsertPodcastVideoConfig((base) => ({
      ...base,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineTracks: ensureTimelineTracks(getActiveSession(), { persist: false }),
      timelineClipsByRowId: next
    }));
  }
  return next;
}

function getTimelineClipEffectiveDurationMs(clip = null) {
  if (!clip || typeof clip !== "object") return STUDIO_TIMELINE_MIN_CLIP_MS;
  return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(clip.trimOutMs || 0) - Number(clip.trimInMs || 0)));
}

function getTimelineClipEndMs(clip = null) {
  if (!clip || typeof clip !== "object") return 0;
  return Math.max(0, Number(clip.startMs || 0)) + getTimelineClipEffectiveDurationMs(clip);
}

function getReorderableTimelineTrackIds(session = null) {
  const activeSession = session || getActiveSession();
  const tracks = ensureTimelineTracks(activeSession, { persist: false });
  const clips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  return tracks
    .map((track) => String(track?.id || "").trim())
    .filter(Boolean)
    .filter((trackId) => Object.values(clips).some((clip) => String(clip?.trackId || "").trim() === trackId));
}

function reorderTimelineClipsByTracks() {
  const session = getActiveSession();
  if (!session) return false;
  const trackIds = getReorderableTimelineTrackIds(session);
  if (trackIds.length < 2) return false;
  const rows = session?.script?.rows || [];
  const rowById = new Map(rows.map((row) => [String(row?.id || "").trim(), row]));
  const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
  upsertPodcastVideoConfig((cfg) => {
    const clips = ensureTimelineClipsByRowId(session, { persist: false });
    const nextClips = { ...clips };
    const perTrack = trackIds.map((trackId) => (
      Object.values(clips)
        .filter((clip) => String(clip?.trackId || "").trim() === trackId)
        .sort((a, b) => (
          Number(a.startMs || 0) - Number(b.startMs || 0)
          || Number(rowIndexById.get(String(a?.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b?.rowId || "").trim()) || 0)
        ))
    ));
    const ordered = [];
    let pending = true;
    for (let round = 0; pending; round += 1) {
      pending = false;
      perTrack.forEach((items) => {
        const clip = items[round];
        if (!clip) return;
        pending = true;
        ordered.push(clip);
      });
    }
    let cursorMs = 0;
    ordered.forEach((clip, index) => {
      const rowId = String(clip?.rowId || "").trim();
      if (!rowId) return;
      const row = rowById.get(rowId) || null;
      const sourceDurationMs = getRowSourceDurationMs(row, session);
      const normalized = normalizeTimelineClipItem({
        ...clip,
        sourceDurationMs,
        trimInMs: 0,
        trimOutMs: sourceDurationMs,
        startMs: snapTimelineMs(cursorMs),
        zIndex: Math.max(1, index + 1)
      }, rowId);
      if (!normalized) return;
      nextClips[rowId] = normalized;
      cursorMs = getTimelineClipEndMs(normalized);
    });
    return {
      ...cfg,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineTracks: ensureTimelineTracks(session, { persist: false }),
      timelineClipsByRowId: nextClips
    };
  });
  renderPodcastVideoShell(getActiveSession());
  const refreshedSession = getActiveSession();
  const firstOrderedRowId = Object.values(ensureTimelineClipsByRowId(refreshedSession, { persist: false }))
    .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0) || Number(a?.zIndex || 0) - Number(b?.zIndex || 0))
    .map((clip) => String(clip?.rowId || "").trim())
    .find(Boolean);
  if (firstOrderedRowId) {
    selectTimelineSceneRow(firstOrderedRowId, { syncStage: true });
  }
  setGenerationStatus(`Tracks reordenados: ${trackIds.length} pistas intercaladas`, "is-live");
  return true;
}

function getTimelineTotalDurationMs(session = null) {
  const runtimeEntries = buildTimelineRuntimeEntries(session);
  const runtimeMaxEnd = runtimeEntries.reduce((acc, entry) => Math.max(acc, Math.max(0, Number(entry?.endMs || 0))), 0);
  const map = ensureTimelineClipsByRowId(session);
  const clipMaxEnd = Object.values(map).reduce((acc, clip) => Math.max(acc, getTimelineClipEndMs(clip)), 0);
  const maxEnd = runtimeMaxEnd > 0 ? runtimeMaxEnd : clipMaxEnd;
  return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, maxEnd);
}

function snapTimelineMs(value = 0) {
  const ms = Math.max(0, Number(value) || 0);
  return Math.round(ms / STUDIO_TIMELINE_SNAP_MS) * STUDIO_TIMELINE_SNAP_MS;
}

function timelineMsToPx(valueMs = 0) {
  return (Math.max(0, Number(valueMs) || 0) / 1000) * STUDIO_TIMELINE_PIXELS_PER_SEC;
}

function timelinePxToMs(valuePx = 0) {
  return (Math.max(0, Number(valuePx) || 0) / STUDIO_TIMELINE_PIXELS_PER_SEC) * 1000;
}

function resolveTimelineDragStepMs(event = null) {
  if (event?.altKey) return 1;
  if (event?.shiftKey) return 50;
  return STUDIO_TIMELINE_SNAP_MS;
}

function snapTimelineMsWithStep(value = 0, stepMs = STUDIO_TIMELINE_SNAP_MS) {
  const step = Math.max(1, Number(stepMs) || STUDIO_TIMELINE_SNAP_MS);
  const ms = Math.max(0, Number(value) || 0);
  return Math.round(ms / step) * step;
}

function buildTimelineRuntimeEntries(session = null) {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const clipMap = ensureTimelineClipsByRowId(activeSession);
  const entries = rows.map((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return null;
    const clip = clipMap[rowId];
    if (!clip) return null;
    const sceneClip = resolveDialogueVideoForRow(activeSession, rowId);
    const segments = resolveDialogueVideoSegments(sceneClip);
    const primarySegment = segments[0] || null;
    const videoSrc = resolveStorageVideoUrl(
      primarySegment?.downloadUrl || sceneClip?.downloadUrl || "",
      primarySegment?.storagePath || sceneClip?.storagePath || ""
    );
    const audioClip = resolveDialogueAudioForRow(activeSession, rowId);
    const audioSrc = resolveStorageAudioUrl(audioClip?.downloadUrl || "", audioClip?.storagePath || "");
    const audioDurationMs = Math.max(0, Number(audioClip?.durationSec || 0) * 1000);
    const speakerKey = String(row?.speaker || "").trim();
    return {
      row,
      rowId,
      index,
      speakerKey,
      speakerName: resolveSpeakerDisplayName(speakerKey, activeSession),
      clip,
      startMs: Math.max(0, Number(clip.startMs) || 0),
      endMs: 0,
      effectiveDurationMs: 0,
      videoSrc,
      audioSrc,
      audioDurationMs,
      zIndex: Math.max(1, Number(clip.zIndex || index + 1))
    };
  }).filter(Boolean);
  entries.forEach((entry) => {
    const clip = entry?.clip || null;
    const clipDurationMs = getTimelineClipEffectiveDurationMs(clip);
    const trimInMs = Math.max(0, Number(clip?.trimInMs || 0));
    const sceneClip = resolveDialogueVideoForRow(activeSession, entry.rowId);
    const sceneVideoDurationMs = Math.max(0, Number(sceneClip?.durationSec || 0) * 1000);
    const sceneAudioDurationMs = Math.max(0, Number(entry?.audioDurationMs || 0));
    const maxPlayableByVideoMs = sceneVideoDurationMs > 0
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, sceneVideoDurationMs - trimInMs)
      : clipDurationMs;
    const maxPlayableByAudioMs = sceneAudioDurationMs > 0
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, sceneAudioDurationMs - trimInMs)
      : 0;
    const effectiveDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.min(
        clipDurationMs,
        maxPlayableByAudioMs > 0
          ? maxPlayableByAudioMs
          : maxPlayableByVideoMs
      )
    );
    entry.effectiveDurationMs = effectiveDurationMs;
    entry.endMs = Math.max(0, Number(entry.startMs || 0)) + effectiveDurationMs;
  });
  entries.sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  return entries;
}

function getOrderedTimelineStartMarkers(entries = []) {
  const markers = Array.from(new Set(entries.map((entry) => Math.max(0, Math.round(entry.startMs || 0)))));
  markers.sort((a, b) => a - b);
  return markers;
}

function resolveDialogueVideoForRow(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return null;
  return getDialogueVideoMap(session)[key] || null;
}

function resolveDialogueVideoSegments(clip = null) {
  if (!clip || typeof clip !== "object") return [];
  const fromMap = Array.isArray(clip.segments) ? clip.segments.filter(Boolean) : [];
  if (fromMap.length) return fromMap;
  const downloadUrl = String(clip.downloadUrl || "").trim();
  const storagePath = String(clip.storagePath || "").trim();
  if (!downloadUrl && !storagePath) return [];
  return [{
    id: `${String(clip.rowId || "row").trim()}-seg-1`,
    index: 0,
    durationSec: Math.max(0, Number(clip.durationSec) || 0),
    downloadUrl,
    storagePath,
    mimeType: String(clip.mimeType || "video/mp4").trim() || "video/mp4",
    variant: String(clip.variant || "").trim(),
    targetSpeechLine: String(clip.targetSpeechLine || "").trim()
  }];
}

function hasGeneratedDialogueVideoForRow(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!key) return false;
  const brokenKey = `${String(activeSession?.id || "").trim()}:${key}`;
  if (brokenDialogueVideoRows.has(brokenKey)) return false;
  const clip = resolveDialogueVideoForRow(activeSession, key);
  if (!clip) return false;
  const primarySegment = resolveDialogueVideoSegments(clip)[0] || clip;
  return hasStoredMediaSource(primarySegment);
}

function splitDialogueTextIntoSegments(text = "", count = 1) {
  const source = String(text || "").trim();
  const targetCount = Math.max(1, Math.min(400, Number(count) || 1));
  if (!source || targetCount <= 1) return [source];
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [source];
  const wordsPerSegment = Math.max(1, Math.ceil(words.length / targetCount));
  const minTailWords = Math.max(5, Math.floor(wordsPerSegment * 0.72));
  const segments = [];
  for (let i = 0; i < words.length; i += wordsPerSegment) {
    segments.push(words.slice(i, i + wordsPerSegment).join(" ").trim());
  }
  if (segments.length >= 2) {
    const lastWords = segments[segments.length - 1].split(/\s+/).filter(Boolean).length;
    if (lastWords < minTailWords) {
      const tail = segments.pop();
      segments[segments.length - 1] = `${segments[segments.length - 1]} ${tail}`.replace(/\s+/g, " ").trim();
    }
  }
  return segments.filter(Boolean);
}

function resolveStorageMediaUrl(rawUrl = "") {
  const clean = String(rawUrl || "").trim();
  if (!clean) return "";
  if (!hasAvailableApiBase()) return clean;
  if (clean.startsWith("/api/assets/proxy-image?")) return buildApiUrl(clean);
  try {
    const parsed = new URL(clean);
    const host = String(parsed.hostname || "").toLowerCase();
    const isStorageHost = host.endsWith("googleapis.com") || host.endsWith("firebasestorage.app");
    if (!isStorageHost) return clean;
    return buildApiUrl(`/api/assets/proxy-image?url=${encodeURIComponent(clean)}`);
  } catch (_) {
    return clean;
  }
}

function resolveStorageVideoUrl(rawUrl = "", storagePath = "") {
  const clean = String(rawUrl || "").trim();
  const cleanStoragePath = String(storagePath || "").trim();
  if (!clean && !cleanStoragePath) return "";
  if (!hasAvailableApiBase()) return clean;
  try {
    if (cleanStoragePath) {
      return buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(cleanStoragePath)}`);
    }
    if (clean.startsWith("/api/assets/proxy-media?")) return buildApiUrl(clean);
    if (clean.startsWith("/api/assets/proxy-image?")) {
      const parsedProxy = new URL(buildApiUrl(clean), window.location.origin);
      const nested = String(parsedProxy.searchParams.get("url") || "").trim();
      return nested ? buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(nested)}`) : buildApiUrl(clean);
    }
    const parsed = new URL(clean, window.location.origin);
    const pathname = String(parsed.pathname || "").toLowerCase();
    const hasVideoExt = /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(pathname);
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(String(parsed.hostname || ""));
    if (isStorageUrl || hasVideoExt) {
      return buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
    }
    return clean;
  } catch (_) {
    return clean;
  }
}

function resolveStorageAudioUrl(rawUrl = "", storagePath = "") {
  const clean = String(rawUrl || "").trim();
  const cleanStoragePath = String(storagePath || "").trim();
  if (!clean && !cleanStoragePath) return "";
  if (!hasAvailableApiBase()) return clean;
  try {
    if (cleanStoragePath) {
      return buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(cleanStoragePath)}`);
    }
    if (clean.startsWith("/api/assets/proxy-media?")) return buildApiUrl(clean);
    if (clean.startsWith("/api/assets/proxy-image?")) {
      const parsedProxy = new URL(buildApiUrl(clean), window.location.origin);
      const nested = String(parsedProxy.searchParams.get("url") || "").trim();
      return nested ? buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(nested)}`) : buildApiUrl(clean);
    }
    const parsed = new URL(clean, window.location.origin);
    const pathname = String(parsed.pathname || "").toLowerCase();
    const hasAudioExt = /\.(wav|mp3|ogg|m4a|flac)(?:$|\?)/i.test(pathname);
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(String(parsed.hostname || ""));
    if (isStorageUrl || hasAudioExt) {
      return buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
    }
    return clean;
  } catch (_) {
    return clean;
  }
}

function isSameOriginMediaUrl(rawUrl = "") {
  const clean = String(rawUrl || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch (_) {
    return false;
  }
}

async function safeMediaPlay(mediaEl) {
  if (!mediaEl || typeof mediaEl.play !== "function") return false;
  try {
    await mediaEl.play();
    return true;
  } catch (error) {
    const name = String(error?.name || "").trim();
    if (name === "AbortError" || name === "NotAllowedError") {
      return false;
    }
    throw error;
  }
}

async function refreshRuntimeFeatureCapabilities() {
  if (runtimeFeatureState.healthChecked) return;
  runtimeFeatureState.healthChecked = true;
  if (!hasAvailableApiBase()) {
    runtimeFeatureState.dialogueAudioUnavailable = true;
    return;
  }
  try {
    const healthUrl = buildApiUrl("/api/health");
    const response = await fetch(healthUrl, { method: "GET" });
    const data = await response.json().catch(() => ({}));
    const supportsDialogueAudio = data?.podcasterDialogueAudioRoute === true;
    if (!supportsDialogueAudio) {
      runtimeFeatureState.dialogueAudioUnavailable = true;
    }
  } catch (_) {
    // Keep optimistic behavior; runtime 404 guard remains active in generateDialogueAudioForRow.
  }
}

function resolvePodcastPortraitUrl(rawUrl = "") {
  return resolveStorageMediaUrl(rawUrl);
}

function createSession(overrides = {}) {
  const baseVoiceMap = { ...DEFAULT_SPEAKER_VOICE_MAP };
  const baseExpressionMap = buildSpeakerExpressionMap(DEFAULT_HOSTS, {
    "Host A": "Cálido",
    "Host B": "Curioso"
  });
  const baseNameMap = buildSpeakerNameMap(DEFAULT_HOSTS, DEFAULT_SPEAKER_NAME_MAP);
  const baseScenarioMap = buildSpeakerScenarioMap(DEFAULT_HOSTS, DEFAULT_SPEAKER_SCENARIO_MAP);
  const baseScenarioVariantsMap = buildSpeakerScenarioVariantsMap(DEFAULT_HOSTS, {}, baseScenarioMap);
  const baseGlobalScenarioDeck = normalizeGlobalScenarioDeck();
  return {
    id: makeId("session"),
    title: "Nueva sesión de podcast",
    prompt: "",
    archived: false,
    updatedAt: nowIso(),
    chat: [
      {
        id: makeId("msg"),
        role: "assistant",
        text: "Describe la idea del podcast y te devolveré una tabla editable con escenas, locutores y tonos."
      }
    ],
    script: {
      episodeTitle: "Sin título todavía",
      summary: "",
      hosts: [...DEFAULT_HOSTS],
      rows: createDefaultRows()
    },
    speakerVoiceMap: baseVoiceMap,
    speakerExpressionMap: baseExpressionMap,
    speakerNameMap: baseNameMap,
    speakerScenarioMap: baseScenarioMap,
    speakerScenarioVariantsMap: baseScenarioVariantsMap,
    globalScenarioDeck: baseGlobalScenarioDeck,
    disfluencyDefaults: { ...DEFAULT_DISFLUENCY_CONFIG },
    panelMusicConfig: {
      preset: "ambient",
      volume: 22,
      montageVolume: 22,
      stabilize: false,
      sourceType: "preset",
      track: null
    },
    speakerPortraitMap: {},
    speakerReferenceImageMap: {},
    scenarioReferenceImageMap: {},
    dialogueVideoMap: {},
    dialogueAudioMap: {},
    podcastVideoConfig: normalizePodcastVideoConfig({
      enabled: false,
      editorEnabled: true
    }),
    ...overrides
  };
}

function buildShortSessionTitle(input = "") {
  const cleaned = String(input || "")
    .replace(/^escribe un guion para el podcast sobre/i, "")
    .replace(/^podcast sobre/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Nueva sesión";
  const firstChunk = cleaned.split(/[.:;,\n]/)[0].trim();
  const words = firstChunk.split(" ").filter(Boolean).slice(0, 5).join(" ");
  const title = words || firstChunk || cleaned;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function normalizeSessionTitle(input = "") {
  const cleaned = String(input || "").replace(/\s+/g, " ").trim();
  return cleaned || "Nueva sesión";
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || null;
}

function normalizeDialogueMatchText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function reconcileDialogueMediaMapsForRows(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const rows = Array.isArray(activeSession?.script?.rows) ? activeSession.script.rows : [];
  if (!rows.length) {
    return {
      dialogueVideoMap: getDialogueVideoMap(activeSession),
      dialogueAudioMap: getDialogueAudioMap(activeSession),
      changed: false
    };
  }
  const normalizedVideoMap = normalizeDialogueVideoMap(activeSession?.dialogueVideoMap || {});
  const normalizedAudioMap = normalizeDialogueAudioMap(activeSession?.dialogueAudioMap || {});
  const rowIds = new Set(rows.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const buildLookupKey = (row = {}, fallbackText = "") => {
    const speaker = String(row?.speaker || "").trim();
    const spoken = normalizeDialogueMatchText(stripStageDirectionsFromSpeech(row?.text || fallbackText || ""));
    const original = normalizeDialogueMatchText(row?.text || fallbackText || "");
    return {
      speaker,
      spoken,
      original
    };
  };
  const rowsByKey = rows.map((row) => ({
    row,
    key: buildLookupKey(row)
  }));
  const nextVideoMap = { ...normalizedVideoMap };
  const nextAudioMap = { ...normalizedAudioMap };
  let changed = false;

  const orphanVideoEntries = Object.entries(normalizedVideoMap)
    .filter(([rowId]) => !rowIds.has(String(rowId || "").trim()))
    .map(([rowId, clip]) => ({
      rowId: String(rowId || "").trim(),
      clip,
      used: false,
      key: buildLookupKey({ speaker: clip?.speaker, text: clip?.targetSpeechLine || "" }, clip?.targetSpeechLine || "")
    }));
  const orphanAudioEntries = Object.entries(normalizedAudioMap)
    .filter(([rowId]) => !rowIds.has(String(rowId || "").trim()))
    .map(([rowId, clip]) => ({
      rowId: String(rowId || "").trim(),
      clip,
      used: false,
      key: buildLookupKey({ speaker: clip?.speaker, text: clip?.targetSpeechLine || "" }, clip?.targetSpeechLine || "")
    }));

  rowsByKey.forEach(({ row, key }) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    if (!nextVideoMap[rowId]) {
      const match = orphanVideoEntries.find((entry) => (
        !entry.used
        && String(entry.key.speaker || "") === String(key.speaker || "")
        && (
          (entry.key.spoken && entry.key.spoken === key.spoken)
          || (entry.key.original && entry.key.original === key.original)
        )
      ));
      if (match?.clip) {
        nextVideoMap[rowId] = {
          ...match.clip,
          rowId
        };
        delete nextVideoMap[match.rowId];
        match.used = true;
        changed = true;
      }
    }
    if (!nextAudioMap[rowId]) {
      const match = orphanAudioEntries.find((entry) => (
        !entry.used
        && String(entry.key.speaker || "") === String(key.speaker || "")
        && (
          (entry.key.spoken && entry.key.spoken === key.spoken)
          || (entry.key.original && entry.key.original === key.original)
        )
      ));
      if (match?.clip) {
        nextAudioMap[rowId] = {
          ...match.clip,
          rowId
        };
        delete nextAudioMap[match.rowId];
        match.used = true;
        changed = true;
      }
    }
  });

  if (changed && options.log !== false) {
    logPodcastRenderDebug("dialogue-media-reconciled", {
      sessionId: String(activeSession?.id || "").trim(),
      videoKeys: Object.keys(nextVideoMap).length,
      audioKeys: Object.keys(nextAudioMap).length
    });
  }

  return {
    dialogueVideoMap: nextVideoMap,
    dialogueAudioMap: nextAudioMap,
    changed
  };
}

function upsertSessionById(sessionId, mutator, options = {}) {
  const { render: shouldRender = true } = options;
  const key = String(sessionId || "").trim();
  if (!key) return null;
  const idx = state.sessions.findIndex((session) => String(session?.id || "").trim() === key);
  if (idx === -1) return null;
  const current = state.sessions[idx];
  const next = mutator({ ...current, script: { ...current.script, rows: [...(current.script?.rows || [])] }, chat: [...(current.chat || [])] });
  if (!next) return null;
  state.sessions[idx] = {
    ...next,
    updatedAt: nowIso()
  };
  persistSessions();
  if (shouldRender) render();
  return state.sessions[idx];
}

function upsertActiveSession(mutator, options = {}) {
  return upsertSessionById(state.activeSessionId, mutator, options);
}

function resetPodcastStudioSessionUiState(session = null) {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const hosts = getSpeakerOptions(activeSession);
  const validRowIds = new Set(rows.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const validHosts = new Set(hosts.map((host) => String(host || "").trim()).filter(Boolean));
  const firstRowId = String(rows[0]?.id || "").trim();
  const firstHost = String(hosts[0] || "").trim();

  if (!validRowIds.has(String(podcastVideoState.activeRowId || "").trim())) {
    podcastVideoState.activeRowId = firstRowId;
  }
  if (!validRowIds.has(String(podcastVideoState.timelineLastInteractedRowId || "").trim())) {
    podcastVideoState.timelineLastInteractedRowId = "";
  }
  if (!validRowIds.has(String(podcastVideoState.transitionFromRowId || "").trim())) {
    podcastVideoState.transitionFromRowId = firstRowId;
  }
  const transitionToValid = validRowIds.has(String(podcastVideoState.transitionToRowId || "").trim());
  if (!transitionToValid) {
    const activeIndex = rows.findIndex((row) => String(row?.id || "").trim() === String(podcastVideoState.transitionFromRowId || "").trim());
    podcastVideoState.transitionToRowId = String(rows[activeIndex + 1]?.id || "").trim();
  }
  if (!validHosts.has(String(podcastVideoState.activeSpeaker || "").trim())) {
    podcastVideoState.activeSpeaker = firstHost;
  }
  podcastVideoState.timelineDrag = null;
  podcastVideoState.timelineGapSelection = null;
  podcastVideoState.montageCursorMs = 0;
  podcastVideoState.montageLastVisualRowId = "";
}

function setActiveSession(sessionId) {
  backgroundDialogueAudioWarmupToken = 0;
  stopPodcastStudioMontage({ keepStatus: true });
  state.activeSessionId = sessionId;
  resetPodcastStudioSessionUiState(getActiveSession());
  render();
}

function ensureSession() {
  const visibleSessions = state.sessions.filter((session) => session.archived !== true);
  if (visibleSessions.length === 0) {
    const session = createSession();
    state.sessions = [session, ...state.sessions.filter((item) => item.id !== session.id)];
    state.activeSessionId = session.id;
    persistSessions();
    return;
  }
  const active = getActiveSession();
  if (!active || active.archived === true) {
    state.activeSessionId = visibleSessions[0].id;
    return;
  }
  let changed = false;
  state.sessions = state.sessions.map((session) => {
    if (!session || session.archived === true) return session;
    const hosts = getSpeakerOptions(session);
    const normalizedVoiceMap = buildSpeakerVoiceMap(session.speakerVoiceMap || {});
    const trimmedVoiceMap = {};
    hosts.forEach((host) => {
      trimmedVoiceMap[host] = normalizeLiveVoiceName(normalizedVoiceMap[host], resolveSpeakerVoiceName(host, session));
    });
    const normalizedExpressionMap = buildSpeakerExpressionMap(hosts, session.speakerExpressionMap || {});
    const normalizedNameMap = buildSpeakerNameMap(hosts, session.speakerNameMap || {});
    const normalizedScenarioMap = buildSpeakerScenarioMap(hosts, session.speakerScenarioMap || {});
    const normalizedScenarioVariantsMap = buildSpeakerScenarioVariantsMap(hosts, session.speakerScenarioVariantsMap || {}, normalizedScenarioMap);
    const normalizedGlobalScenarioDeck = normalizeGlobalScenarioDeck(session.globalScenarioDeck || null);
    const normalizedDisfluencyDefaults = normalizeDisfluencyConfig(session.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG);
    const normalizedPortraitMap = normalizeSpeakerPortraitMap(session.speakerPortraitMap || {});
    const normalizedSpeakerReferenceImageMap = normalizeReferenceImageMap(session.speakerReferenceImageMap || {});
    const normalizedScenarioReferenceImageMap = normalizeReferenceImageMap(session.scenarioReferenceImageMap || {});
    const normalizedDialogueVideoMap = normalizeDialogueVideoMap(session.dialogueVideoMap || {});
    const normalizedDialogueAudioMap = normalizeDialogueAudioMap(session.dialogueAudioMap || {});
    const reconciledMedia = reconcileDialogueMediaMapsForRows({
      ...session,
      dialogueVideoMap: normalizedDialogueVideoMap,
      dialogueAudioMap: normalizedDialogueAudioMap
    }, { log: false });
    const normalizedVideoConfig = normalizePodcastVideoConfig(session.podcastVideoConfig || {});
    const sameVoiceMap = JSON.stringify(trimmedVoiceMap) === JSON.stringify(session.speakerVoiceMap || {});
    const sameExpressionMap = JSON.stringify(normalizedExpressionMap) === JSON.stringify(session.speakerExpressionMap || {});
    const sameNameMap = JSON.stringify(normalizedNameMap) === JSON.stringify(session.speakerNameMap || {});
    const sameScenarioMap = JSON.stringify(normalizedScenarioMap) === JSON.stringify(session.speakerScenarioMap || {});
    const sameScenarioVariantsMap = JSON.stringify(normalizedScenarioVariantsMap) === JSON.stringify(session.speakerScenarioVariantsMap || {});
    const sameGlobalScenarioDeck = JSON.stringify(normalizedGlobalScenarioDeck) === JSON.stringify(session.globalScenarioDeck || {});
    const sameDisfluencyDefaults = JSON.stringify(normalizedDisfluencyDefaults) === JSON.stringify(session.disfluencyDefaults || {});
    const samePortraitMap = JSON.stringify(normalizedPortraitMap) === JSON.stringify(session.speakerPortraitMap || {});
    const sameSpeakerReferenceImageMap = JSON.stringify(normalizedSpeakerReferenceImageMap) === JSON.stringify(session.speakerReferenceImageMap || {});
    const sameScenarioReferenceImageMap = JSON.stringify(normalizedScenarioReferenceImageMap) === JSON.stringify(session.scenarioReferenceImageMap || {});
    const sameDialogueVideoMap = JSON.stringify(reconciledMedia.dialogueVideoMap) === JSON.stringify(session.dialogueVideoMap || {});
    const sameDialogueAudioMap = JSON.stringify(reconciledMedia.dialogueAudioMap) === JSON.stringify(session.dialogueAudioMap || {});
    const sameVideoConfig = JSON.stringify(normalizedVideoConfig) === JSON.stringify(session.podcastVideoConfig || {});
    if (sameVoiceMap && sameExpressionMap && sameNameMap && sameScenarioMap && sameScenarioVariantsMap && sameGlobalScenarioDeck && sameDisfluencyDefaults && samePortraitMap && sameSpeakerReferenceImageMap && sameScenarioReferenceImageMap && sameDialogueVideoMap && sameDialogueAudioMap && sameVideoConfig) return session;
    changed = true;
    return {
      ...session,
      speakerVoiceMap: trimmedVoiceMap,
      speakerExpressionMap: normalizedExpressionMap,
      speakerNameMap: normalizedNameMap,
      speakerScenarioMap: normalizedScenarioMap,
      speakerScenarioVariantsMap: normalizedScenarioVariantsMap,
      globalScenarioDeck: normalizedGlobalScenarioDeck,
      disfluencyDefaults: normalizedDisfluencyDefaults,
      speakerPortraitMap: normalizedPortraitMap,
      speakerReferenceImageMap: normalizedSpeakerReferenceImageMap,
      scenarioReferenceImageMap: normalizedScenarioReferenceImageMap,
      dialogueVideoMap: reconciledMedia.dialogueVideoMap,
      dialogueAudioMap: reconciledMedia.dialogueAudioMap,
      podcastVideoConfig: normalizedVideoConfig
    };
  });
  if (changed) persistSessions();
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function secondsToClock(totalSec = 0) {
  const safe = Math.max(0, Number(totalSec) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.round(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function countTotalDuration(rows = []) {
  return rows.reduce((acc, row) => acc + (Number(row.durationSec) || 0), 0);
}

function buildScriptAssistantReply(script = {}, options = {}) {
  const isRefinement = options?.isRefinement === true;
  const session = options?.session || null;
  const episodeTitle = String(script.episodeTitle || "Podcast desde una idea").trim();
  const summary = String(script.summary || "Ya preparé una primera versión del episodio.").trim();
  const hosts = Array.isArray(script.hosts) && script.hosts.length
    ? script.hosts.join(", ")
    : "Host A, Host B";
  const rows = Array.isArray(script.rows) ? script.rows : [];
  const duration = secondsToClock(countTotalDuration(rows));
  const previewLimit = 24;
  const isTruncatedPreview = rows.length > previewLimit;
  const previewLines = rows
    .slice(0, previewLimit)
    .map((row, index) => `${index + 1}. ${resolveSpeakerDisplayName(String(row.speaker || "Host A").trim(), session)}: ${replaceHostTokensWithNames(String(row.text || "").trim(), session)}`)
    .join("\n");

  return [
    isRefinement
      ? `Listo. Actualicé tu guión: "${episodeTitle}".`
      : `Listo. Preparé un primer guión para "${episodeTitle}".`,
    "",
    `${summary}`,
    "",
    `Hosts propuestos: ${hosts}.`,
    `Duración estimada: ${duration}.`,
    `Escenas generadas: ${rows.length}.`,
    "",
    previewLines ? `Avance del guión${isTruncatedPreview ? " (parcial)" : ""}:\n${previewLines}` : "",
    isTruncatedPreview ? `Mostrando ${previewLimit} de ${rows.length} escenas. El resto está en la tabla del panel derecho.` : "",
    "",
    "En el panel derecho puedes ajustar diálogo, locutor, expresión, duración y media de cada escena."
  ].filter(Boolean).join("\n");
}

function getExpressionVoiceStyle(expression = "") {
  const normalized = String(expression || "").toLowerCase();
  if (normalized.includes("en")) return { rate: 1.08, pitch: 1.08 };
  if (normalized.includes("cal")) return { rate: 0.96, pitch: 0.96 };
  if (normalized.includes("cur")) return { rate: 1.02, pitch: 1.12 };
  if (normalized.includes("ser")) return { rate: 0.92, pitch: 0.88 };
  if (normalized.includes("insp")) return { rate: 1, pitch: 1.04 };
  return { rate: 1, pitch: 1 };
}

function getDefaultSpeakerVoiceMap() {
  return { ...DEFAULT_SPEAKER_VOICE_MAP };
}

function getDefaultSpeakerNameMap() {
  return { ...DEFAULT_SPEAKER_NAME_MAP };
}

function getAgentVoiceProfileByVoiceName(voiceName = "") {
  const clean = String(voiceName || "").trim();
  return AGENT_VOICE_PROFILES.find((profile) => profile.voiceName === clean) || null;
}

function resolveAgentVoiceProfile(voiceName = "", fallback = "") {
  const normalizedVoice = normalizeLiveVoiceName(voiceName, fallback);
  return getAgentVoiceProfileByVoiceName(normalizedVoice) || AGENT_VOICE_PROFILES[0];
}

function normalizeVoiceGenderGroup(value = "") {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return "";
  if (clean.startsWith("fem")) return "femenina";
  if (clean.startsWith("masc")) return "masculina";
  return clean;
}

function buildPodcastVoiceCharacterPrompt(speaker = "", session = null, options = {}) {
  const speakerLabel = String(speaker || "").trim();
  const speakerName = resolveSpeakerDisplayName(speakerLabel, session);
  const voiceProfile = resolveAgentVoiceProfile(
    options?.voiceName || resolveSpeakerVoiceName(speakerLabel, session),
    resolveSpeakerVoiceName(speakerLabel, session)
  );
  const expression = String(options?.expression || getSpeakerExpressionMap(session)?.[speakerLabel] || "Neutral").trim() || "Neutral";
  const genderGroup = String(voiceProfile?.genderGroup || "").trim().toLowerCase();
  const hosts = getSpeakerOptions(session);
  const counterpart = hosts.find((host) => host !== speakerLabel) || "";
  const counterpartName = counterpart ? resolveSpeakerDisplayName(counterpart, session) : "";
  const genderPrompt = genderGroup === "masculina" || genderGroup === "masculino"
    ? [
        "El personaje debe ser inequívocamente un hombre adulto.",
        "Rostro claramente masculino y natural, sin rasgos femeninos, sin androginia.",
        "Puede tener mandíbula marcada o barba discreta solo si se ve natural para locución premium."
      ].join(" ")
    : [
        "El personaje debe ser inequívocamente una mujer adulta.",
        "Rostro claramente femenino y natural, sin rasgos masculinos, sin androginia.",
        "Prohibido barba, bigote, sombra de barba, mandíbula excesivamente masculina o facciones masculinas dominantes."
      ].join(" ");
  return [
    `Personaje visual fijo para ${speakerName} (${speakerLabel}).`,
    genderPrompt,
    genderGroup === "masculina" || genderGroup === "masculino"
      ? "English constraint: adult male podcast host, clearly male face, do not generate female-looking features."
      : "English constraint: adult female podcast host, clearly female face, do not generate male-looking features, beard, mustache or masculine facial structure.",
    `La voz base del personaje es ${voiceProfile.voiceName} con estilo ${voiceProfile.toneLabel}.`,
    `Su presencia transmite un tono ${String(voiceProfile.mood || "neutral").trim()}.`,
    `Expresión dominante actual: ${expression}.`,
    "Definir identidad consistente: facciones memorables, proporciones faciales estables, peinado reconocible, mirada segura, vestuario sobrio de locución premium.",
    "Evitar ambigüedad de género y evitar cambios de edad, etnia o complexión entre generaciones.",
    counterpartName ? `${speakerName} es un personaje distinto de ${counterpartName}; no mezclar sus rostros, peinados, siluetas ni rasgos.` : "",
    "La imagen debe corresponder exactamente al locutor activo y no a otro host del podcast.",
    "No caricatura, no ilustración, no anime: retrato fotorealista de estudio."
  ].join(" ");
}

function buildPodcastStudioScenePrompt(speaker = "", session = null, options = {}) {
  const speakerLabel = String(speaker || "").trim();
  const speakerName = resolveSpeakerDisplayName(speakerLabel, session);
  const voiceProfile = resolveAgentVoiceProfile(
    options?.voiceName || resolveSpeakerVoiceName(speakerLabel, session),
    resolveSpeakerVoiceName(speakerLabel, session)
  );
  const expression = String(options?.expression || getSpeakerExpressionMap(session)?.[speakerLabel] || "Neutral").trim() || "Neutral";
  const scenario = resolveSpeakerStudioScenarioPrompt(session, speakerLabel, options);
  const hosts = getSpeakerOptions(session);
  const speakerIndex = Math.max(0, hosts.findIndex((host) => host === speakerLabel));
  const stageZones = [
    "zona izquierda del escenario, cerca del micrófono principal izquierdo",
    "zona derecha del escenario, cerca del micrófono principal derecho",
    "zona central ligeramente al fondo, junto a la consola o mesa principal",
    "zona lateral secundaria con un ángulo alterno del mismo set"
  ];
  const eyelineDirections = [
    {
      bodyAngle: "cuerpo en tres cuartos orientado hacia la derecha del set",
      gaze: "mirada dirigida hacia la derecha del set, como si estuviera viendo al otro locutor",
      cameraAngle: "cámara desde su lado izquierdo para evitar frontalidad total"
    },
    {
      bodyAngle: "cuerpo en tres cuartos orientado hacia la izquierda del set",
      gaze: "mirada dirigida hacia la izquierda del set, como si estuviera viendo al otro locutor",
      cameraAngle: "cámara desde su lado derecho para evitar frontalidad total"
    },
    {
      bodyAngle: "cuerpo en tres cuartos orientado hacia el interlocutor principal",
      gaze: "mirada desviada hacia un interlocutor fuera de cámara, nunca al lente",
      cameraAngle: "ángulo lateral suave para mantener una conversación creíble"
    },
    {
      bodyAngle: "cuerpo en tres cuartos con leve giro hacia el centro del set",
      gaze: "mirada hacia el centro conversacional del estudio, sin mirar al lente",
      cameraAngle: "ángulo alterno lateral para reforzar continuidad entre locutores"
    }
  ];
  const zoneLabel = stageZones[speakerIndex % stageZones.length];
  const eyelineDirection = eyelineDirections[speakerIndex % eyelineDirections.length];
  const counterpart = hosts.find((host) => host !== speakerLabel) || "";
  const counterpartName = counterpart ? resolveSpeakerDisplayName(counterpart, session) : "";
  const counterpartIndex = counterpart ? Math.max(0, hosts.findIndex((candidate) => candidate === counterpart)) : -1;
  const counterpartZoneLabel = counterpartIndex >= 0
    ? stageZones[counterpartIndex % stageZones.length]
    : "la zona opuesta del set";
  const counterpartZones = hosts
    .filter((host) => host !== speakerLabel)
    .map((host, index) => {
      const idx = hosts.findIndex((candidate) => candidate === host);
      return `${resolveSpeakerDisplayName(host, session)} ocupa ${stageZones[Math.max(0, idx) % stageZones.length]}`;
    });
  return [
    `Escenario de locución consistente para ${speakerName}.`,
    `Escenario obligatorio: ${scenario}.`,
    "Convertir ese escenario en un set fotorealista de locución con tratamiento acústico visible, micrófono broadcast en brazo articulado, consola discreta y luz cinematográfica suave.",
    `Posición fija obligatoria dentro del set para ${speakerName}: ${zoneLabel}.`,
    "Importante: posicionar a cada Host en una parte diferente del escenario, y ser consistente con ese ángulo.",
    "Importante: en la escena solo debe aparecer el locutor o host correspondiente al track.",
    `Bloqueo corporal obligatorio: ${eyelineDirection.bodyAngle}.`,
    `Eyeline obligatorio: ${eyelineDirection.gaze}.`,
    `Ángulo de cámara sugerido: ${eyelineDirection.cameraAngle}.`,
    "Evitar pose frontal de presentador y evitar contacto visual directo con la cámara.",
    "La escena debe sentirse como conversación entre locutores; el personaje atiende al interlocutor, no al espectador.",
    "Mostrar un solo locutor claramente identificable en cuadro.",
    "Composición obligatoria de sujeto único: foreground y background limpios de personas.",
    "Priorizar miradas laterales, reacción conversacional y microgestos que indiquen escucha activa entre locutores.",
    "La cámara nunca debe convertirse en el interlocutor principal; mantener la atención del locutor en la conversación.",
    "Encuadre medio corto, cámara a la altura de los ojos, fondo elegante, profundidad de campo ligera.",
    `La puesta en escena debe acompañar una voz ${voiceProfile.toneLabel} y una actitud ${expression}.`,
    "Mantener continuidad visual entre escenas: misma cabina, mismo set, misma dirección de luz, mismo estilo de vestuario."
  ].join(" ");
}

function normalizeLiveVoiceName(voiceName = "", fallback = "") {
  const clean = String(voiceName || "").trim();
  if (GEMINI_LIVE_VOICE_OPTIONS.includes(clean)) return clean;
  const nextFallback = String(fallback || "").trim();
  if (GEMINI_LIVE_VOICE_OPTIONS.includes(nextFallback)) return nextFallback;
  return resolveGeminiLiveVoice();
}

function buildSpeakerVoiceMap(raw = {}) {
  const next = getDefaultSpeakerVoiceMap();
  if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([speaker, voiceName]) => {
      if (!speaker || !voiceName) return;
      const speakerKey = String(speaker).trim();
      next[speakerKey] = normalizeLiveVoiceName(voiceName, next[speakerKey]);
    });
  }
  return next;
}

function getSpeakerVoiceMap(session = null) {
  return buildSpeakerVoiceMap(session?.speakerVoiceMap || {});
}

function getSpeakerOptions(session = null) {
  const hosts = Array.isArray(session?.script?.hosts) ? session.script.hosts : [];
  const normalized = hosts
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((speaker) => VOICES.find((candidate) => candidate.toLowerCase() === speaker.toLowerCase()) || "")
    .filter(Boolean);
  if (normalized.length) return Array.from(new Set(normalized));
  return [...DEFAULT_HOSTS];
}

function buildSpeakerExpressionMap(hosts = [], raw = {}) {
  const next = {};
  hosts.forEach((host) => {
    const key = String(host || "").trim();
    if (!key) return;
    const maybe = String(raw?.[key] || "").trim();
    next[key] = EXPRESSIONS.includes(maybe) ? maybe : "Neutral";
  });
  return next;
}

function getSpeakerExpressionMap(session = null) {
  const hosts = getSpeakerOptions(session);
  return buildSpeakerExpressionMap(hosts, session?.speakerExpressionMap || {});
}

function resolveConfiguredSpeakerVoiceForGeneration(speaker = "", session = null) {
  const key = String(speaker || "").trim();
  if (!key) return resolveSpeakerVoiceName("", session);
  const draft = collectGlobalSpeakerDraft(session);
  const draftVoice = normalizeLiveVoiceName(String(draft?.voiceMap?.[key] || "").trim(), "");
  if (draftVoice) return draftVoice;
  return resolveSpeakerVoiceName(key, session);
}

function buildSpeakerNameMap(hosts = [], raw = {}) {
  const defaults = getDefaultSpeakerNameMap();
  const next = {};
  hosts.forEach((host) => {
    const key = String(host || "").trim();
    if (!key) return;
    const maybe = String(raw?.[key] || "").trim();
    next[key] = maybe || defaults[key] || key;
  });
  return next;
}

function getSpeakerNameMap(session = null) {
  const hosts = getSpeakerOptions(session);
  return buildSpeakerNameMap(hosts, session?.speakerNameMap || {});
}

function buildSpeakerScenarioMap(hosts = [], raw = {}) {
  const next = {};
  hosts.forEach((host) => {
    const key = String(host || "").trim();
    if (!key) return;
    const maybe = String(raw?.[key] || "").replace(/\s+/g, " ").trim();
    next[key] = maybe || DEFAULT_SPEAKER_SCENARIO_MAP[key] || "Cabina premium de podcast";
  });
  return next;
}

function getSpeakerScenarioMap(session = null) {
  const hosts = getSpeakerOptions(session);
  return buildSpeakerScenarioMap(hosts, session?.speakerScenarioMap || {});
}

function buildScenarioVariantId(index = 0) {
  return index <= 0 ? "scene_a" : "scene_b";
}

function buildScenarioVariantText(baseScenario = "", host = "", variantIndex = 0, revision = 0) {
  const base = String(baseScenario || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").replace(/\s+/g, " ").trim() || "Cabina premium de podcast";
  const offset = Math.max(0, Number(variantIndex) || 0) + Math.max(0, Number(revision) || 0);
  const mood = SPEAKER_SCENARIO_VARIANT_MOODS[offset % SPEAKER_SCENARIO_VARIANT_MOODS.length];
  const framing = (offset % 2 === 0)
    ? "encuadre medio corto, camara a la altura de los ojos"
    : "encuadre tres cuartos, camara ligeramente lateral";
  return `${base}, ${mood}, ${framing}`.replace(/\s+/g, " ").trim();
}

function normalizeSpeakerScenarioVariantsEntry(rawEntry = null, host = "", baseScenario = "") {
  const fallbackBase = String(baseScenario || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").replace(/\s+/g, " ").trim() || "Cabina premium de podcast";
  const safeEntry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const rawItems = Array.isArray(safeEntry.items) ? safeEntry.items : [];
  const items = [0, 1].map((index) => {
    const rawItem = rawItems[index] && typeof rawItems[index] === "object" ? rawItems[index] : {};
    const revision = Math.max(0, Number(rawItem.revision) || 0);
    return {
      id: buildScenarioVariantId(index),
      revision,
      text: String(rawItem.text || buildScenarioVariantText(fallbackBase, host, index, revision)).replace(/\s+/g, " ").trim() || buildScenarioVariantText(fallbackBase, host, index, revision)
    };
  });
  const usedTexts = new Set();
  const uniqueItems = items.map((item, index) => {
    let revision = Math.max(0, Number(item.revision) || 0);
    let text = String(item.text || "").replace(/\s+/g, " ").trim();
    while (!text || usedTexts.has(text)) {
      revision += 1;
      text = buildScenarioVariantText(fallbackBase, host, index, revision);
    }
    usedTexts.add(text);
    return {
      ...item,
      revision,
      text
    };
  });
  const requestedActiveId = String(safeEntry.activeId || items[0].id).trim();
  const activeId = uniqueItems.some((item) => item.id === requestedActiveId) ? requestedActiveId : uniqueItems[0].id;
  return {
    baseScenario: fallbackBase,
    activeId,
    items: uniqueItems
  };
}

function buildSpeakerScenarioVariantsMap(hosts = [], raw = {}, baseScenarioMap = {}) {
  const next = {};
  hosts.forEach((host) => {
    const key = String(host || "").trim();
    if (!key) return;
    next[key] = normalizeSpeakerScenarioVariantsEntry(raw?.[key], key, baseScenarioMap?.[key] || "");
  });
  return next;
}

function getSpeakerScenarioVariantsMap(session = null) {
  const hosts = getSpeakerOptions(session);
  return buildSpeakerScenarioVariantsMap(hosts, session?.speakerScenarioVariantsMap || {}, getSpeakerScenarioMap(session));
}

function resolveActiveScenarioVariant(session = null, speaker = "") {
  const key = String(speaker || "").trim();
  if (!key) return null;
  const map = getSpeakerScenarioVariantsMap(session);
  const entry = map[key];
  if (!entry) return null;
  return entry.items.find((item) => item.id === entry.activeId) || entry.items[0] || null;
}

function resolveSpeakerStudioScenarioPrompt(session = null, speaker = "", options = {}) {
  const key = String(speaker || "").trim();
  if (!key) return GLOBAL_SCENARIO_BASE_LABEL;
  const explicitScenario = String(options?.scenario || "").replace(/\s+/g, " ").trim();
  if (explicitScenario) return explicitScenario;
  const selectedGlobalScenario = String(resolveActiveGlobalScenarioVariant(session)?.prompt || "").replace(/\s+/g, " ").trim();
  const activeVariantText = String(resolveActiveScenarioVariant(session, key)?.text || "").replace(/\s+/g, " ").trim();
  const draftScenarioMap = collectGlobalSpeakerDraft(session)?.scenarioMap || {};
  const draftScenario = String(draftScenarioMap[key] || "").replace(/\s+/g, " ").trim();
  const speakerScenario = String(getSpeakerScenarioMap(session)?.[key] || "").replace(/\s+/g, " ").trim();
  const hostScenario = activeVariantText || draftScenario || speakerScenario;
  if (selectedGlobalScenario && hostScenario && hostScenario !== selectedGlobalScenario) {
    return `${selectedGlobalScenario}. Variacion obligatoria para ${key}: ${hostScenario}. Mantener exactamente el mismo set base y solo variar zona, angulo y bloqueo del locutor dentro de ese escenario.`
      .replace(/\s+/g, " ")
      .trim();
  }
  return selectedGlobalScenario || hostScenario || GLOBAL_SCENARIO_BASE_LABEL;
}

function resolveActiveGlobalScenarioAsset(session = null) {
  const activeVariant = resolveActiveGlobalScenarioVariant(session);
  if (!activeVariant) return null;
  return {
    id: String(activeVariant.id || "").trim(),
    title: String(activeVariant.title || "").trim(),
    prompt: String(activeVariant.prompt || "").replace(/\s+/g, " ").trim(),
    downloadUrl: String(activeVariant.downloadUrl || "").trim(),
    storagePath: String(activeVariant.storagePath || "").trim(),
    mimeType: String(activeVariant.mimeType || "image/png").trim() || "image/png"
  };
}

async function ensureActiveGlobalScenarioAssetReady(session = null) {
  const activeSession = session || getActiveSession();
  const activeScenarioAsset = resolveActiveGlobalScenarioAsset(activeSession);
  if (!activeSession || !activeScenarioAsset?.id) {
    throw new Error("No hay un escenario global seleccionado.");
  }
  if (String(activeScenarioAsset.downloadUrl || "").trim() || String(activeScenarioAsset.storagePath || "").trim()) {
    return activeScenarioAsset;
  }
  throw new Error("El escenario global seleccionado no tiene imagen generada todavía. Usa el botón de generar escenario primero.");
}

function buildGlobalScenarioVariantText(variantIndex = 0, revision = 0) {
  return buildScenarioVariantText(GLOBAL_SCENARIO_BASE_LABEL, "", variantIndex, revision);
}

function normalizeGlobalScenarioDeck(raw = null) {
  const safe = raw && typeof raw === "object" ? raw : {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const used = new Set();
  const items = [0, 1].map((index) => {
    const rawItem = rawItems[index] && typeof rawItems[index] === "object" ? rawItems[index] : {};
    let revision = Math.max(0, Number(rawItem.revision) || 0);
    let prompt = String(rawItem.prompt || buildGlobalScenarioVariantText(index, revision)).replace(/\s+/g, " ").trim();
    while (!prompt || used.has(prompt)) {
      revision += 1;
      prompt = buildGlobalScenarioVariantText(index, revision);
    }
    used.add(prompt);
    return {
      id: buildScenarioVariantId(index),
      revision,
      title: index === 0 ? "Escenario A" : "Escenario B",
      prompt,
      downloadUrl: String(rawItem.downloadUrl || "").trim(),
      storagePath: String(rawItem.storagePath || "").trim(),
      mimeType: String(rawItem.mimeType || "image/png").trim() || "image/png",
      updatedAt: String(rawItem.updatedAt || "").trim(),
      model: String(rawItem.model || PODCASTER_IMAGE_MODEL_DEFAULT).trim() || PODCASTER_IMAGE_MODEL_DEFAULT,
      status: ["idle", "generating", "ready", "error"].includes(String(rawItem.status || "").trim()) ? String(rawItem.status).trim() : "idle",
      errorMessage: String(rawItem.errorMessage || "").trim()
    };
  });
  const requestedActiveId = String(safe.activeId || items[0].id).trim();
  return {
    activeId: items.some((item) => item.id === requestedActiveId) ? requestedActiveId : items[0].id,
    items
  };
}

function getGlobalScenarioDeck(session = null) {
  return normalizeGlobalScenarioDeck(session?.globalScenarioDeck || null);
}

function resolveActiveGlobalScenarioVariant(session = null) {
  const deck = getGlobalScenarioDeck(session);
  return deck.items.find((item) => item.id === deck.activeId) || deck.items[0] || null;
}

function hashScenarioSeed(input = "") {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildScenarioPreviewDataUrl(title = "", prompt = "") {
  const seed = hashScenarioSeed(`${title}::${prompt}`);
  const palettes = [
    ["#0f766e", "#164e63", "#111827"],
    ["#7c3aed", "#1d4ed8", "#0f172a"],
    ["#b45309", "#92400e", "#111827"],
    ["#1f2937", "#334155", "#0f766e"],
    ["#9f1239", "#7c2d12", "#111827"]
  ];
  const palette = palettes[seed % palettes.length];
  const micX = 44 + (seed % 36);
  const deskY = 124 + (seed % 18);
  const lightX = 180 + (seed % 70);
  const glow = 26 + (seed % 18);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" role="img" aria-label="${escapeHtml(title)}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette[0]}"/>
        <stop offset="58%" stop-color="${palette[1]}"/>
        <stop offset="100%" stop-color="${palette[2]}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.52)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <rect width="320" height="200" fill="url(#bg)"/>
    <circle cx="${lightX}" cy="34" r="${glow}" fill="url(#glow)" opacity="0.85"/>
    <rect x="18" y="18" width="78" height="54" rx="10" fill="rgba(15,23,42,0.34)" stroke="rgba(255,255,255,0.18)"/>
    <rect x="28" y="30" width="58" height="8" rx="4" fill="rgba(148,163,184,0.75)"/>
    <rect x="28" y="44" width="46" height="8" rx="4" fill="rgba(148,163,184,0.42)"/>
    <rect x="212" y="22" width="88" height="60" rx="12" fill="rgba(15,23,42,0.36)" stroke="rgba(255,255,255,0.16)"/>
    <rect x="224" y="34" width="62" height="34" rx="8" fill="rgba(56,189,248,0.28)"/>
    <path d="M${micX} 134 C ${micX + 30} 110, ${micX + 52} 88, ${micX + 72} 74" stroke="rgba(15,23,42,0.78)" stroke-width="8" fill="none" stroke-linecap="round"/>
    <ellipse cx="${micX + 84}" cy="66" rx="24" ry="18" fill="rgba(15,23,42,0.9)"/>
    <rect x="${micX + 66}" y="58" width="22" height="16" rx="8" fill="rgba(15,23,42,0.9)"/>
    <rect x="0" y="${deskY}" width="320" height="${220 - deskY}" fill="rgba(15,23,42,0.34)"/>
    <rect x="132" y="${deskY - 14}" width="68" height="18" rx="8" fill="rgba(226,232,240,0.18)"/>
    <rect x="208" y="${deskY - 10}" width="34" height="12" rx="6" fill="rgba(226,232,240,0.14)"/>
    <text x="20" y="178" fill="rgba(248,250,252,0.92)" font-size="20" font-family="Arial, sans-serif" font-weight="700">${escapeHtml(title)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveSpeakerDisplayName(speaker = "", session = null) {
  const key = String(speaker || "").trim();
  if (!key) return "Locutor";
  const map = getSpeakerNameMap(session);
  return String(map[key] || DEFAULT_SPEAKER_NAME_MAP[key] || key).trim() || key;
}

function replaceHostTokensWithNames(text = "", session = null) {
  let output = String(text || "");
  const nameMap = getSpeakerNameMap(session);
  Object.keys(nameMap).forEach((hostKey) => {
    const name = String(nameMap[hostKey] || "").trim();
    if (!name) return;
    const escaped = hostKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), name);
  });
  return output;
}

function sanitizeSpeakerMentionsInDialogue(text = "", session = null, hostsOverride = null) {
  let output = String(text || "").trim();
  if (!output) return "";
  const hosts = Array.isArray(hostsOverride) && hostsOverride.length
    ? hostsOverride
    : getSpeakerOptions(session);
  const nameMap = getSpeakerNameMap(session);
  const terms = new Set();
  hosts.forEach((host) => {
    const key = String(host || "").trim();
    if (!key) return;
    terms.add(key);
    const displayName = String(nameMap[key] || "").trim();
    if (displayName) terms.add(displayName);
  });
  Array.from(terms)
    .sort((a, b) => b.length - a.length)
    .forEach((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`(^|[\\s,;:!?.(])${escaped}(?=[:;,!?.)\\s]|$)`, "gi"), "$1");
    });
  output = output
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;:.!?])/g, "$1")
    .replace(/^[-,;:.!? ]+/, "")
    .trim();
  return output;
}

function normalizeHostsCount(input = 2) {
  const count = Math.max(1, Math.min(VOICES.length, Number(input) || 2));
  return count;
}

function hostsForCount(count = 2) {
  return VOICES.slice(0, normalizeHostsCount(count));
}

function normalizeSpeakerAliasKey(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[:：]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildSpeakerAliasMap(hosts = [], options = {}) {
  const aliasMap = new Map();
  const nameMap = options?.nameMap && typeof options.nameMap === "object" ? options.nameMap : {};
  hosts.forEach((host) => {
    const hostKey = String(host || "").trim();
    if (!hostKey) return;
    const aliases = [
      hostKey,
      String(nameMap[hostKey] || "").trim(),
      String(DEFAULT_SPEAKER_NAME_MAP[hostKey] || "").trim()
    ].filter(Boolean);
    aliases.forEach((alias) => {
      const normalized = normalizeSpeakerAliasKey(alias);
      if (!normalized) return;
      if (!aliasMap.has(normalized)) aliasMap.set(normalized, hostKey);
    });
  });
  return aliasMap;
}

function resolveSpeakerFromAliases(input = "", options = {}) {
  const hosts = Array.isArray(options?.hosts) && options.hosts.length ? options.hosts : [...DEFAULT_HOSTS];
  const fallback = String(options?.fallback || hosts[0] || "Host A").trim() || "Host A";
  const clean = String(input || "").trim();
  if (!clean) return fallback;
  const direct = normalizeSpeakerLabel(clean, "");
  if (direct) return direct;
  const aliasMap = options?.aliasMap instanceof Map
    ? options.aliasMap
    : buildSpeakerAliasMap(hosts, { nameMap: options?.nameMap || {} });
  const normalized = normalizeSpeakerAliasKey(clean);
  if (aliasMap.has(normalized)) return aliasMap.get(normalized) || fallback;
  return fallback;
}

function normalizeSpeakerLabel(input = "", fallback = "Host A") {
  const raw = String(input || "").trim();
  if (!raw) return fallback;
  const direct = VOICES.find((candidate) => candidate === raw);
  if (direct) return direct;
  const ci = VOICES.find((candidate) => candidate.toLowerCase() === raw.toLowerCase());
  return ci || fallback;
}

function normalizeGeminiModelName(model = "") {
  return String(model || "")
    .replace(/^models\//i, "")
    .replace(/:generateContent$/i, "")
    .replace(/:streamGenerateContent$/i, "")
    .trim();
}

function buildPortraitImageModelChain() {
  const selectedTextModel = normalizeGeminiModelName(els.scriptModelSelect?.value || "");
  const dynamic = [];
  if (selectedTextModel.startsWith("gemini-3")) {
    dynamic.push("gemini-3.1-flash-image-preview");
    dynamic.push("gemini-3-pro-image-preview");
  } else if (selectedTextModel.startsWith("gemini-2.5")) {
    dynamic.push("gemini-2.5-flash-image");
  } else if (selectedTextModel.startsWith("gemini-2.0")) {
    dynamic.push("gemini-2.0-flash-preview-image-generation");
  }
  dynamic.push(...PODCASTER_IMAGE_MODEL_CANDIDATES);
  return Array.from(new Set(dynamic.map(normalizeGeminiModelName).filter(Boolean)));
}

function parseSceneSelection(input = "", totalRows = 0) {
  const raw = String(input || "").trim();
  if (!raw) return [];
  const values = new Set();
  raw.split(",").map((token) => token.trim()).filter(Boolean).forEach((token) => {
    if (token.includes("-")) {
      const [startRaw, endRaw] = token.split("-").map((value) => Number(value.trim()));
      if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) return;
      const from = Math.max(1, Math.min(startRaw, endRaw));
      const to = Math.min(totalRows, Math.max(startRaw, endRaw));
      for (let index = from; index <= to; index += 1) {
        values.add(index - 1);
      }
      return;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) return;
    if (value >= 1 && value <= totalRows) values.add(value - 1);
  });
  return Array.from(values).sort((a, b) => a - b);
}

function resolveGeminiLiveModel() {
  const fromCfg = String(
    window.__CHARLY_CONFIG__?.geminiLiveModel
    || window.__CHARLY_CONFIG__?.geminiModelLive
    || "gemini-2.5-flash-native-audio-preview-12-2025"
  ).trim();
  return fromCfg
    .replace(/^models\//i, "")
    .replace(/:generateContent$/i, "")
    .replace(/:streamGenerateContent$/i, "")
    .trim()
    .toLowerCase() || "gemini-2.5-flash-native-audio-preview-12-2025";
}

function resolveDialogueAudioModel() {
  const model = resolveGeminiLiveModel();
  if (model.includes("tts")) return model;
  return "gemini-2.5-flash-preview-tts";
}

function resolveGeminiLiveVoice() {
  const voice = normalizeLiveVoiceName(String(
    window.__CHARLY_CONFIG__?.charlyVoiceName
    || localStorage.getItem("cb_charly_voice_name")
    || DEFAULT_SPEAKER_VOICE_MAP["Host A"]
  ).trim(), DEFAULT_SPEAKER_VOICE_MAP["Host A"]);
  return voice || DEFAULT_SPEAKER_VOICE_MAP["Host A"];
}

function resolveSpeakerVoiceName(speaker = "", session = null) {
  const normalized = String(speaker || "").trim().toLowerCase();
  const sessionMap = getSpeakerVoiceMap(session);
  const fromSession = sessionMap[String(speaker || "").trim()];
  if (fromSession) return String(fromSession).trim();
  const configuredMap = window.__CHARLY_CONFIG__?.podcasterSpeakerVoices;
  if (configuredMap && typeof configuredMap === "object") {
    const direct = configuredMap[speaker] || configuredMap[normalized];
    if (direct) return normalizeLiveVoiceName(direct, resolveGeminiLiveVoice());
  }
  const defaults = Object.fromEntries(Object.entries(DEFAULT_SPEAKER_VOICE_MAP).map(([key, value]) => [key.toLowerCase(), value]));
  return normalizeLiveVoiceName(defaults[normalized], resolveGeminiLiveVoice());
}

function buildGeminiLiveSessionConfigKey(modelLive = "", voiceProfile = null) {
  const profile = voiceProfile || resolveAgentVoiceProfile(resolveGeminiLiveVoice());
  return JSON.stringify({
    model: String(modelLive || ""),
    voice: String(profile?.voiceName || ""),
    mood: String(profile?.mood || ""),
    locale: String(profile?.locale || "es-MX"),
    speed: Number(profile?.speed || 1),
    pitch: Number(profile?.pitch || 1)
  });
}

function pcm16Base64ToFloat32(base64 = "") {
  try {
    const binary = atob(String(base64 || "").trim());
    const len = Math.floor(binary.length / 2);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i += 1) {
      const lo = binary.charCodeAt(i * 2);
      const hi = binary.charCodeAt(i * 2 + 1);
      let sample = (hi << 8) | lo;
      if (sample >= 0x8000) sample -= 0x10000;
      out[i] = Math.max(-1, Math.min(1, sample / 32768));
    }
    return out;
  } catch (_) {
    return new Float32Array(0);
  }
}

function geminiLivePendingPlaybackMs() {
  if (!geminiLiveAudioCtx) return 0;
  const playAt = Number(geminiLivePlayAt || 0);
  const now = Number(geminiLiveAudioCtx.currentTime || 0);
  return Math.max(0, (playAt - now) * 1000);
}

function isGeminiLiveAudioDrained() {
  return (geminiLiveActivePcmSources?.size || 0) === 0 && geminiLivePendingPlaybackMs() <= 28;
}

function computeSpeechEnergyFromPcm(samples = null) {
  if (!(samples instanceof Float32Array) || samples.length === 0) return 0;
  const stride = Math.max(1, Math.floor(samples.length / 360));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i += stride) {
    const v = samples[i];
    sum += v * v;
    count += 1;
  }
  if (!count) return 0;
  const rms = Math.sqrt(sum / count);
  const normalized = Math.max(0, Math.min(1, (rms - 0.01) / 0.17));
  return Math.pow(normalized, 0.78);
}

function applyPodcastMouthVisual(value = 0) {
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  if (els.podcastVideoSpeakerCard) {
    els.podcastVideoSpeakerCard.style.setProperty("--pod-mouth-open", clamped.toFixed(3));
  }
  if (els.podcastSpeakerMouth) {
    els.podcastSpeakerMouth.style.opacity = (0.12 + (clamped * 0.9)).toFixed(3);
  }
}

function animatePodcastMouth(now = 0) {
  if (!podcastLipSyncState.lastTickMs) {
    podcastLipSyncState.lastTickMs = now || performance.now();
  }
  const currentNow = now || performance.now();
  const dt = Math.max(0.001, (currentNow - podcastLipSyncState.lastTickMs) / 1000);
  podcastLipSyncState.lastTickMs = currentNow;
  const openSpeed = podcastLipSyncState.speaking ? 10 : 5;
  const closeSpeed = podcastLipSyncState.speaking ? 7 : 12;
  const speed = podcastLipSyncState.target >= podcastLipSyncState.value ? openSpeed : closeSpeed;
  const alpha = Math.max(0.04, Math.min(0.96, speed * dt));
  podcastLipSyncState.value += (podcastLipSyncState.target - podcastLipSyncState.value) * alpha;
  if (!podcastLipSyncState.speaking && podcastLipSyncState.target <= 0.001 && podcastLipSyncState.value < 0.005) {
    podcastLipSyncState.value = 0;
    applyPodcastMouthVisual(0);
    podcastLipSyncState.rafId = 0;
    podcastLipSyncState.lastTickMs = 0;
    return;
  }
  applyPodcastMouthVisual(podcastLipSyncState.value);
  podcastLipSyncState.rafId = requestAnimationFrame(animatePodcastMouth);
}

function ensurePodcastMouthAnimator() {
  if (podcastLipSyncState.rafId) return;
  podcastLipSyncState.lastTickMs = 0;
  podcastLipSyncState.rafId = requestAnimationFrame(animatePodcastMouth);
}

function setPodcastMouthTarget(value = 0, options = {}) {
  const clampTarget = Math.max(0, Math.min(1, Number(value) || 0));
  if (options.speaking === true) {
    podcastLipSyncState.speaking = true;
  } else if (options.speaking === false) {
    podcastLipSyncState.speaking = false;
  }
  podcastLipSyncState.target = clampTarget;
  ensurePodcastMouthAnimator();
}

function resetPodcastMouth() {
  podcastLipSyncState.target = 0;
  podcastLipSyncState.speaking = false;
  if (podcastLipSyncState.rafId) {
    cancelAnimationFrame(podcastLipSyncState.rafId);
  }
  podcastLipSyncState.rafId = 0;
  podcastLipSyncState.value = 0;
  podcastLipSyncState.lastTickMs = 0;
  applyPodcastMouthVisual(0);
}

function updatePlayingRowFromAudioDrain() {
  if (!playingRowId || !isGeminiLiveAudioDrained()) return;
  setPodcastPlaybackRowStatus("success", { rowId: playingRowId });
  playingRowId = null;
  activePlaybackVoiceName = "";
  rowVideoSyncState.armed = false;
  rowVideoSyncState.rowId = "";
  rowVideoSyncState.speed = 1;
  const session = getActiveSession();
  if (session && podcastVideoState.activeSpeaker) {
    setPodcastVideoSpeaker(session, podcastVideoState.activeSpeaker, { speaking: false });
  } else {
    setPodcastMouthTarget(0, { speaking: false });
  }
  updateRowPlayButtons();
  const expireTime = state.liveTokenState?.expireTime;
  setLiveStatusText(
    expireTime
      ? `Voces Live listas hasta ${formatDate(expireTime)}`
      : "Voces Live conectadas."
  );
}

function playGeminiPcm(base64Chunk = "") {
  if (!base64Chunk) return;
  if (!geminiLiveAudioCtx) geminiLiveAudioCtx = new AudioContext({ sampleRate: 24000 });
  const samples = pcm16Base64ToFloat32(base64Chunk);
  if (!samples.length) return;
  if (
    rowVideoSyncState.armed
    && podcastVideoState.enabled
    && playingRowId
    && rowVideoSyncState.rowId === playingRowId
    && resolveDialogueVideoForRow(getActiveSession(), playingRowId)
  ) {
    if (els.podcastActiveSpeakerVideo) {
      els.podcastActiveSpeakerVideo.playbackRate = Math.max(0.5, Math.min(1.8, Number(rowVideoSyncState.speed || 1)));
    }
    playPodcastStageVideo({ restart: true, silent: true }).catch(() => {});
    rowVideoSyncState.armed = false;
  }
  const speechEnergy = computeSpeechEnergyFromPcm(samples);
  setPodcastMouthTarget(speechEnergy, { speaking: true });
  if (podcastPlaybackState.active) {
    podcastPlaybackState.recordedChunks.push(samples.slice(0));
  }

  const buffer = geminiLiveAudioCtx.createBuffer(1, samples.length, 24000);
  buffer.copyToChannel(samples, 0);
  const source = geminiLiveAudioCtx.createBufferSource();
  source.buffer = buffer;
  const pcmRate = Math.max(0.65, Math.min(2.1, Number(geminiLivePcmPlaybackRate || 1)));
  source.playbackRate.value = pcmRate;
  source.connect(geminiLiveAudioCtx.destination);
  geminiLiveActivePcmSources.add(source);
  source.onended = () => {
    geminiLiveActivePcmSources.delete(source);
    updatePlayingRowFromAudioDrain();
  };
  geminiLivePlayAt = Math.max(geminiLivePlayAt || geminiLiveAudioCtx.currentTime, geminiLiveAudioCtx.currentTime + 0.01);
  source.start(geminiLivePlayAt);
  geminiLivePlayAt += (buffer.duration / pcmRate);
}

function clearScheduledGeminiAudio() {
  if (!geminiLiveAudioCtx) return;
  geminiLiveActivePcmSources.forEach((source) => {
    try { source.stop(0); } catch (_) {}
  });
  geminiLiveActivePcmSources.clear();
  geminiLivePlayAt = geminiLiveAudioCtx.currentTime + 0.01;
  geminiLivePcmPlaybackRate = 1;
  setPodcastMouthTarget(0, { speaking: false });
}

async function loadGoogleGenAiLiveModule() {
  if (googleGenAiLiveModule?.GoogleGenAI && googleGenAiLiveModule?.Modality) return googleGenAiLiveModule;
  const candidateUrls = [
    String(window.__RUNTIME_CONFIG__?.googleGenAiBrowserModuleUrl || "").trim(),
    String(window.cbGoogleGenAiBrowserModuleUrl || "").trim(),
    "./vendor/google-genai/index.mjs"
  ].filter(Boolean);
  let lastError = null;
  for (const url of candidateUrls) {
    try {
      const mod = await import(url);
      if (mod?.GoogleGenAI && mod?.Modality) {
        googleGenAiLiveModule = mod;
        return mod;
      }
      lastError = new Error(`Modulo invalido de Gemini Live: ${url}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err || "gemini_live_module_load_failed"));
    }
  }
  throw lastError || new Error("No se pudo cargar el modulo web de Gemini Live.");
}

function handlePodcasterLiveSendError(error, origin = "send_client_content") {
  const message = String(error?.message || error || "").trim();
  if (!message) return false;
  if (/CLOSING|CLOSED|closing|closed|socket/i.test(message)) {
    logPodcasterLiveDebug("send-error-closed", { origin, message });
    stopGeminiLiveSession().catch(() => {});
    return true;
  }
  return false;
}

function safeSendLiveContent(payload = null, origin = "send_client_content") {
  if (!payload) return false;
  if (!geminiLiveSession || !geminiLiveIsOpen || geminiLiveSessionClosing) {
    logPodcasterLiveDebug("send-skip-not-ready", {
      origin,
      hasSession: Boolean(geminiLiveSession),
      isOpen: geminiLiveIsOpen,
      isClosing: geminiLiveSessionClosing,
      readyVoice: geminiLiveReadyVoiceName
    });
    return false;
  }
  try {
    const maybe = geminiLiveSession.sendClientContent(payload);
    logPodcasterLiveDebug("send-attempt", {
      origin,
      readyVoice: geminiLiveReadyVoiceName,
      configKey: geminiLiveSessionConfigKey
    });
    if (maybe && typeof maybe.then === "function") {
      maybe.catch((error) => {
        handlePodcasterLiveSendError(error, origin);
      });
    }
    return true;
  } catch (error) {
    if (handlePodcasterLiveSendError(error, origin)) return false;
    return false;
  }
}

function handleGeminiLiveServerMessage(message = null) {
  if (!message?.serverContent) return;
  if (message.serverContent.interrupted) {
    clearScheduledGeminiAudio();
    logPodcasterLiveDebug("server-interrupted", {
      readyVoice: geminiLiveReadyVoiceName
    });
  }
  const parts = message?.serverContent?.modelTurn?.parts || [];
  let audioParts = 0;
  parts.forEach((part) => {
    const data = String(part?.inlineData?.data || "").trim();
    if (!data) return;
    audioParts += 1;
    playGeminiPcm(data);
  });
  if (audioParts > 0) {
    logPodcasterLiveDebug("server-audio-parts", {
      parts: audioParts,
      readyVoice: geminiLiveReadyVoiceName
    });
  }
  if (message?.serverContent?.turnComplete === true) {
    logPodcasterLiveDebug("server-turn-complete", {
      readyVoice: geminiLiveReadyVoiceName
    });
    const wait = Math.max(120, Math.min(1800, geminiLivePendingPlaybackMs() + 140));
    setTimeout(updatePlayingRowFromAudioDrain, wait);
  }
}

async function waitForGeminiLiveOpen(sessionEpoch = 0, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (geminiLiveSessionEpoch !== sessionEpoch) {
      throw new Error("gemini_live_session_replaced");
    }
    if (geminiLiveIsOpen && geminiLiveSession && !geminiLiveSessionClosing) return true;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw new Error("gemini_live_open_timeout");
}

async function stopGeminiLiveSession() {
  try {
    logPodcasterLiveDebug("session-stop", {
      readyVoice: geminiLiveReadyVoiceName,
      configKey: geminiLiveSessionConfigKey,
      sessionEpoch: geminiLiveSessionEpoch
    });
    clearScheduledGeminiAudio();
    activePlaybackVoiceName = "";
    geminiLiveReadyVoiceName = "";
    geminiLiveConnectingConfigKey = "";
    geminiLiveConnectingVoiceName = "";
    geminiLiveSessionEpoch = Date.now();
    geminiLiveSessionClosing = true;
    geminiLiveIsOpen = false;
    geminiLiveSessionConfigKey = "";
    if (geminiLiveSession) {
      geminiLiveSession.close();
      geminiLiveSession = null;
    }
    geminiLiveConnectPromise = null;
  } catch (_) {
    // noop
  }
}

async function ensureGeminiLiveConnected(voiceProfile = null, options = {}) {
  const forceRestart = options?.forceRestart === true;
  const profile = voiceProfile || resolveAgentVoiceProfile(resolveGeminiLiveVoice());
  const modelLive = resolveGeminiLiveModel();
  const requestedVoiceName = String(profile?.voiceName || "").trim();
  const desiredConfigKey = buildGeminiLiveSessionConfigKey(modelLive, profile);
  logPodcasterLiveDebug("ensure-requested", {
    requestedVoice: requestedVoiceName,
    sessionEpoch: geminiLiveSessionEpoch,
    configKey: desiredConfigKey,
    forceRestart
  });

  if (geminiLiveConnectPromise) {
    if (geminiLiveConnectingConfigKey === desiredConfigKey && geminiLiveConnectingVoiceName === requestedVoiceName) {
      logPodcasterLiveDebug("ensure-reuse-inflight", {
        requestedVoice: requestedVoiceName,
        configKey: desiredConfigKey
      });
      return geminiLiveConnectPromise;
    }
    // Invalidate any in-flight connect for another voice/config and prioritize this one.
    geminiLiveSessionEpoch = Date.now();
    geminiLiveIsOpen = false;
    geminiLiveSessionClosing = true;
    geminiLiveSessionConfigKey = "";
    geminiLiveReadyVoiceName = "";
    geminiLiveConnectingConfigKey = "";
    geminiLiveConnectingVoiceName = "";
    geminiLiveConnectPromise = null;
    logPodcasterLiveDebug("ensure-invalidate-inflight", {
      requestedVoice: requestedVoiceName,
      configKey: desiredConfigKey,
      sessionEpoch: geminiLiveSessionEpoch
    });
  }

  if (
    !forceRestart
    &&
    geminiLiveSession
    && geminiLiveIsOpen
    && geminiLiveSessionConfigKey === desiredConfigKey
    && geminiLiveReadyVoiceName === requestedVoiceName
  ) {
    return geminiLiveSession;
  }

  geminiLiveConnectPromise = (async () => {
    const sessionEpoch = Date.now();
    await stopGeminiLiveSession();
    geminiLiveSessionEpoch = sessionEpoch;
    geminiLiveSessionClosing = true;
    geminiLiveReadyVoiceName = "";
    geminiLiveConnectingConfigKey = desiredConfigKey;
    geminiLiveConnectingVoiceName = requestedVoiceName;

    const tokenJson = await authFetchJson("/api/gemini/live-token", {
      method: "POST",
      body: JSON.stringify({
        model: modelLive,
        voiceName: requestedVoiceName,
        systemInstruction: [
          "Eres una voz de produccion para podcast conversacional.",
          `Habla en ${String(profile?.locale || "es-MX")}.`,
          `Personalidad base: ${String(profile?.mood || "profesional")}.`,
          "Mantén una identidad consistente, natural y humana."
        ].join(" ")
      })
    });
    const liveApiKey = String(tokenJson?.token || "").trim();
    if (!liveApiKey) throw new Error("Token efimero vacio para Gemini Live.");
    const backendRequestedVoiceName = String(tokenJson?.requestedVoiceName || "").trim();
    const backendVoiceName = normalizeLiveVoiceName(tokenJson?.voiceName || "");
    if (
      requestedVoiceName
      && backendRequestedVoiceName
      && backendRequestedVoiceName.toLowerCase() !== requestedVoiceName.toLowerCase()
    ) {
      throw new Error(
        `Backend Live recibió requestedVoiceName=${backendRequestedVoiceName} distinto a ${requestedVoiceName}.`
      );
    }
    if (requestedVoiceName && backendVoiceName && backendVoiceName !== requestedVoiceName) {
      throw new Error(`Backend Live devolvió voz ${backendVoiceName} en lugar de ${requestedVoiceName}.`);
    }
    if (requestedVoiceName && !backendVoiceName) {
      throw new Error(
        `Backend /api/gemini/live-token no confirmó voiceName (${requestedVoiceName}). ` +
        `Actualiza/reinicia el backend activo en ${String(window.__CHARLY_CONFIG__?.apiBaseUrl || "apiBaseUrl")}.`
      );
    }
    logPodcasterLiveDebug("token-ready", {
      requestedVoice: requestedVoiceName,
      backendVoice: backendVoiceName || null,
      model: modelLive
    });

    const { GoogleGenAI, Modality } = await loadGoogleGenAiLiveModule();
    const ai = new GoogleGenAI({
      apiKey: liveApiKey,
      apiVersion: "v1alpha",
      httpOptions: { apiVersion: "v1alpha" }
    });

    geminiLiveSession = await ai.live.connect({
      model: modelLive,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: [
          "Eres una voz de produccion para podcast conversacional.",
          `Habla en ${String(profile?.locale || "es-MX")}.`,
          `Personalidad base: ${String(profile?.mood || "profesional")}.`,
          `Usa exactamente la voz preconfigurada ${String(profile?.voiceName || "").trim()} sin cambiar de timbre.`,
          "Mantén una identidad consistente, natural y humana."
        ].join(" "),
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: String(profile?.voiceName || resolveGeminiLiveVoice())
            }
          }
        },
        outputAudioTranscription: {},
        thinkingConfig: {
          thinkingBudget: 0
        }
      },
      callbacks: {
        onopen: () => {
          if (geminiLiveSessionEpoch !== sessionEpoch) {
            try { geminiLiveSession?.close(); } catch (_) {}
            return;
          }
          geminiLiveIsOpen = true;
          geminiLiveSessionClosing = false;
          geminiLiveSessionConfigKey = desiredConfigKey;
          geminiLiveReadyVoiceName = String(profile?.voiceName || "").trim();
          geminiLiveConnectingConfigKey = "";
          geminiLiveConnectingVoiceName = "";
          logPodcasterLiveDebug("connected", {
            requestedVoice: requestedVoiceName,
            connectedVoice: geminiLiveReadyVoiceName,
            sessionEpoch,
            configKey: desiredConfigKey
          });
        },
        onmessage: (message) => {
          if (geminiLiveSessionEpoch !== sessionEpoch) return;
          handleGeminiLiveServerMessage(message);
        },
        onerror: (error) => {
          if (geminiLiveSessionEpoch !== sessionEpoch) return;
          setPodcastPlaybackRowStatus("error", {
            rowId: playingRowId,
            error: String(error?.message || "gemini_live_error")
          });
          geminiLiveIsOpen = false;
          geminiLiveSessionClosing = true;
          geminiLiveSessionConfigKey = "";
          geminiLiveReadyVoiceName = "";
          geminiLiveConnectingConfigKey = "";
          geminiLiveConnectingVoiceName = "";
          geminiLiveSession = null;
          stopRowAudio();
          logPodcasterLiveDebug("error", {
            requestedVoice: requestedVoiceName,
            connectedVoice: geminiLiveReadyVoiceName,
            sessionEpoch,
            configKey: desiredConfigKey,
            message: String(error?.message || "unknown")
          });
        },
        onclose: (error) => {
          if (geminiLiveSessionEpoch !== sessionEpoch) return;
          setPodcastPlaybackRowStatus("error", {
            rowId: playingRowId,
            error: String(error?.reason || error?.message || "gemini_live_closed")
          });
          geminiLiveIsOpen = false;
          geminiLiveSessionClosing = true;
          geminiLiveSessionConfigKey = "";
          geminiLiveReadyVoiceName = "";
          geminiLiveConnectingConfigKey = "";
          geminiLiveConnectingVoiceName = "";
          geminiLiveSession = null;
          stopRowAudio();
          logPodcasterLiveDebug("closed", {
            requestedVoice: requestedVoiceName,
            connectedVoice: geminiLiveReadyVoiceName,
            sessionEpoch,
            configKey: desiredConfigKey,
            reason: String(error?.reason || "unknown")
          });
        }
      }
    });
    await waitForGeminiLiveOpen(sessionEpoch, 10000);
    logPodcasterLiveDebug("open-confirmed", {
      requestedVoice: requestedVoiceName,
      connectedVoice: geminiLiveReadyVoiceName,
      sessionEpoch
    });

    state.liveTokenState = tokenJson;
    return geminiLiveSession;
  })();

  try {
    return await geminiLiveConnectPromise;
  } finally {
    geminiLiveConnectingConfigKey = "";
    geminiLiveConnectingVoiceName = "";
    geminiLiveConnectPromise = null;
  }
}

function updateRowPlayButtons() {
  els.scriptTableBody.querySelectorAll(".row-play-btn").forEach((btn) => {
    const isPlaying = btn.dataset.rowId === playingRowId;
    btn.classList.toggle("is-playing", isPlaying);
    btn.setAttribute("title", isPlaying ? "Detener reproducción" : "Reproducir escena");
    btn.innerHTML = isPlaying ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-play"></i>';
  });
  const activeRowId = String(playingRowId || "").trim();
  let activeRowEl = null;
  els.scriptTableBody.querySelectorAll(".script-row").forEach((rowEl) => {
    const isPlaying = Boolean(activeRowId) && rowEl.dataset.rowId === activeRowId;
    rowEl.classList.toggle("is-playing-row", isPlaying);
    if (isPlaying) {
      rowEl.setAttribute("aria-current", "true");
      activeRowEl = rowEl;
    } else {
      rowEl.removeAttribute("aria-current");
    }
  });
  if (activeRowEl) {
    activeRowEl.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: podcastPlaybackState.active ? "smooth" : "auto"
    });
    if (document.activeElement !== activeRowEl && !activeRowEl.contains(document.activeElement)) {
      activeRowEl.focus({ preventScroll: true });
    }
  }
  renderRowPlaybackElapsed();
}

function formatElapsedClock(ms = 0) {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function computeDurationSpeedMultiplier(text = "", targetDurationSec = 0, limits = {}) {
  const desired = Math.max(0, Number(targetDurationSec) || 0);
  if (!desired) return 1;
  const estimated = Math.max(0.2, Number(estimateSpeechDurationSec(text)) || 0.2);
  const raw = estimated / desired;
  const min = Math.max(0.5, Number(limits?.min) || 0.72);
  const max = Math.max(min, Number(limits?.max) || 1.85);
  return Math.max(min, Math.min(max, raw));
}

function renderRowPlaybackElapsed() {
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  els.scriptTableBody.querySelectorAll("[data-row-play-elapsed]").forEach((chip) => {
    const rowId = String(chip.dataset.rowPlayElapsed || "").trim();
    const isActive = Boolean(rowId && playingRowId && rowId === playingRowId && rowPlaybackTimerState.rowId === rowId);
    chip.classList.toggle("is-live", isActive);
    if (!isActive) {
      chip.textContent = "0:00";
      return;
    }
    const elapsed = Math.max(0, now - Number(rowPlaybackTimerState.startedAtMs || now));
    chip.textContent = formatElapsedClock(elapsed);
  });
}

function stopRowPlaybackCounter() {
  if (rowPlaybackTimerState.rafId) {
    cancelAnimationFrame(rowPlaybackTimerState.rafId);
  }
  rowPlaybackTimerState = {
    rowId: "",
    startedAtMs: 0,
    rafId: 0
  };
  renderRowPlaybackElapsed();
}

function startRowPlaybackCounter(rowId = "") {
  const key = String(rowId || "").trim();
  stopRowPlaybackCounter();
  if (!key) return;
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  rowPlaybackTimerState.rowId = key;
  rowPlaybackTimerState.startedAtMs = now;
  const tick = () => {
    renderRowPlaybackElapsed();
    if (!playingRowId || rowPlaybackTimerState.rowId !== playingRowId) return;
    rowPlaybackTimerState.rafId = requestAnimationFrame(tick);
  };
  rowPlaybackTimerState.rafId = requestAnimationFrame(tick);
}

function stopRowAudio() {
  logPodcasterLiveDebug("row-stop-audio", {
    playingRowId,
    activePlaybackVoiceName,
    readyVoice: geminiLiveReadyVoiceName
  });
  if (rowPlaybackAudioEl) {
    try { rowPlaybackAudioEl.pause(); } catch (_) {}
    try { rowPlaybackAudioEl.currentTime = 0; } catch (_) {}
  }
  rowPlaybackAudioEl = null;
  clearScheduledGeminiAudio();
  resetPodcastMouth();
  stopRowPlaybackCounter();
  playingRowId = null;
  activePlaybackVoiceName = "";
  rowVideoSyncState.armed = false;
  rowVideoSyncState.rowId = "";
  rowVideoSyncState.speed = 1;
  const session = getActiveSession();
  if (session && podcastVideoState.activeSpeaker) {
    setPodcastVideoSpeaker(session, podcastVideoState.activeSpeaker, { speaking: false });
  } else {
    setPodcastVideoSpeaker(session, "", { speaking: false });
  }
  updateRowPlayButtons();
  const expireTime = state.liveTokenState?.expireTime;
  setLiveStatusText(
    expireTime
      ? `Voces Live listas hasta ${formatDate(expireTime)}`
      : "Voces Live conectadas."
  );
}

async function sendScenePromptWithReconnect(prompt = "", voiceProfile = null) {
  const payload = {
    turns: [{
      role: "user",
      parts: [{ text: prompt }]
    }],
    turnComplete: true
  };
  const sentNow = safeSendLiveContent(payload, "podcaster_scene_send");
  if (sentNow) {
    logPodcasterLiveDebug("scene-send-ok-first", {
      requestedVoice: String(voiceProfile?.voiceName || "").trim(),
      readyVoice: geminiLiveReadyVoiceName
    });
    return true;
  }
  if (!voiceProfile) return false;
  await ensureGeminiLiveConnected(voiceProfile, { forceRestart: true });
  const sentRetry = safeSendLiveContent(payload, "podcaster_scene_retry_send");
  logPodcasterLiveDebug("scene-send-retry", {
    requestedVoice: String(voiceProfile?.voiceName || "").trim(),
    readyVoice: geminiLiveReadyVoiceName,
    success: sentRetry
  });
  return sentRetry;
}

async function playRowAudio(rowId, options = {}) {
  const session = getActiveSession();
  const row = session?.script?.rows?.find((item) => item.id === rowId);
  if (!row) return;
  setPodcastVideoRow(row.id, { syncStage: podcastVideoState.enabled });
  if (playingRowId === rowId) {
    stopRowAudio();
    return;
  }

  stopRowAudio();
  try {
    setPodcastPlaybackRowStatus("pending", { rowId });
    const speedMultiplier = Math.max(
      0.5,
      Math.min(1.9, Number(options.speedMultiplier || 1) * computeDurationSpeedMultiplier(
        String(buildTargetSpeechLine(row, session) || row.text || ""),
        Number(row?.durationSec || 0),
        { min: 0.7, max: 1.9 }
      ))
    );
    const storedAudio = resolveDialogueAudioForRow(session, row.id);
    const storedAudioSrc = resolveStorageAudioUrl(storedAudio?.downloadUrl || "", storedAudio?.storagePath || "");
    if (storedAudioSrc) {
      playingRowId = rowId;
      activePlaybackVoiceName = "stored-scene-audio";
      startRowPlaybackCounter(rowId);
      if (podcastVideoState.enabled) {
        setPodcastVideoSpeaker(session, row.speaker, { speaking: true, rowId: row.id });
      }
      updateRowPlayButtons();
      const audio = new Audio(storedAudioSrc);
      audio.preload = "auto";
      audio.playbackRate = speedMultiplier;
      rowPlaybackAudioEl = audio;
      audio.addEventListener("ended", () => {
        rowPlaybackAudioEl = null;
        updatePlayingRowFromAudioDrain();
      }, { once: true });
      audio.addEventListener("error", () => {
        setPodcastPlaybackRowStatus("error", {
          rowId,
          error: "stored_audio_playback_failed"
        });
        stopRowAudio();
      }, { once: true });
      await audio.play();
      setLiveStatusText(`Audio de escena: ${resolveSpeakerDisplayName(row.speaker, session)}`);
      logPodcasterLiveDebug("row-play-stored-audio", {
        rowId,
        speaker: row.speaker,
        speedMultiplier
      });
      return true;
    }
    const videoCfg = getPodcastVideoConfig(session);
    const allowLiveFallback = options.allowLiveFallback === true || videoCfg.allowLivePreviewWithoutStoredAudio === true;
    if (!allowLiveFallback) {
      setPodcastPlaybackRowStatus("idle", { rowId });
      setLiveStatusText("Vista previa barata: genera o guarda el audio de la escena para reproducirla.");
      setPodcastVideoStatus("Sin audio persistido");
      addChatMessage("system", `La escena ${resolveSceneNumberByRowId(rowId, session)} no tiene audio guardado. En modo de pruebas barato no se usa Gemini Live automáticamente.`);
      return false;
    }
    if (geminiLiveAudioCtx?.state === "suspended") {
      await geminiLiveAudioCtx.resume().catch(() => {});
    }
    const speakerVoiceName = resolveSpeakerVoiceName(row.speaker, session);
    const voiceProfile = resolveAgentVoiceProfile(speakerVoiceName, resolveGeminiLiveVoice());
    logPodcasterLiveDebug("row-play-start", {
      rowId,
      speaker: row.speaker,
      selectedVoice: speakerVoiceName,
      resolvedVoice: voiceProfile.voiceName,
      profile: voiceProfile.name
    });
    setLiveStatusText(`Conectando voz Live: ${row.speaker} (${voiceProfile.voiceName} · ${voiceProfile.toneLabel})...`);
    await ensureGeminiLiveConnected(voiceProfile);
    playingRowId = rowId;
    activePlaybackVoiceName = voiceProfile.voiceName;
    startRowPlaybackCounter(rowId);
    if (podcastVideoState.enabled) {
      setPodcastVideoSpeaker(session, row.speaker, { speaking: true, rowId: row.id });
    }
    updateRowPlayButtons();
    const style = getExpressionVoiceStyle(row.expression);
    const targetSpeechLine = buildTargetSpeechLine(row, session);
    geminiLivePcmPlaybackRate = speedMultiplier;
    rowVideoSyncState.armed = podcastVideoState.enabled === true;
    rowVideoSyncState.rowId = row.id;
    rowVideoSyncState.speed = speedMultiplier;
    const disfluencyInstruction = buildDisfluencyInstruction(row);
    const prompt = [
      "Interpreta esta linea como parte de un podcast conversacional en espanol latino.",
      "No suenes como lectura robótica ni como locución institucional.",
      disfluencyInstruction,
      "Respeta el rol del locutor y la emoción indicada.",
      "Nunca leas en voz alta acotaciones escénicas, texto entre paréntesis o instrucciones de actuación; solo interprétalas si existen.",
      "Interpreta exactamente la 'Línea objetivo' incluyendo muletillas, errores y tartamudeo si aparecen.",
      `Duración objetivo aproximada: ${Math.max(1, Number(row?.durationSec || 0))} segundos. Ajusta el ritmo para acercarte a ese tiempo.`,
      `Identidad vocal base: ${voiceProfile.name}, estilo ${voiceProfile.mood}.`,
      `Locale: ${voiceProfile.locale}.`,
      `Locutor: ${resolveSpeakerDisplayName(row.speaker, session)} (${row.speaker}).`,
      `Expresión: ${row.expression}.`,
      `Ritmo objetivo: ${(style.rate * Number(voiceProfile.speed || 1) * speedMultiplier).toFixed(2)}. Tono objetivo: ${(style.pitch * Number(voiceProfile.pitch || 1)).toFixed(2)}.`,
      row.notes ? `Notas de interpretación: ${row.notes}.` : "",
      `Línea original (referencia): "${String(row.text || "").replace(/"/g, '\\"')}"`,
      `Línea objetivo (obligatoria): "${String(targetSpeechLine || row.text || "").replace(/"/g, '\\"')}"`
    ].join("\n");
    const sent = await sendScenePromptWithReconnect(prompt, voiceProfile);
    if (!sent) throw new Error("gemini_live_send_failed");
    setLiveStatusText(`Voz Live: ${row.speaker} (${voiceProfile.voiceName} · ${voiceProfile.toneLabel})`);
    logPodcasterLiveDebug("row-play-dispatched", {
      rowId,
      speaker: row.speaker,
      voice: voiceProfile.voiceName
    });
    return true;
  } catch (error) {
    setPodcastPlaybackRowStatus("error", {
      rowId,
      error: String(error?.message || "gemini_live_play_failed")
    });
    stopRowAudio();
    setLiveStatusText(`Voces Live no disponibles: ${error.message}`);
    addChatMessage("system", `No se pudo reproducir la escena con Gemini Live (${error.message}).`);
    return false;
  }
}

function setGenerationStatus(text, tone = "") {
  els.generationStatus.textContent = text;
  els.generationStatus.className = "composer-chip";
  if (tone) els.generationStatus.classList.add(tone);
}

function addChatMessage(role, text, extra = {}) {
  const payload = {
    id: makeId("msg"),
    role,
    text,
    ...(extra && typeof extra === "object" ? extra : {})
  };
  upsertActiveSession((session) => ({
    ...session,
    chat: [
      ...(session.chat || []),
      payload
    ]
  }));
}

function removeChatMessage(messageId = "") {
  const key = String(messageId || "").trim();
  if (!key) return;
  upsertActiveSession((session) => ({
    ...session,
    chat: (session.chat || []).filter((message) => String(message?.id || "").trim() !== key)
  }));
}

function buildSpeakerMapsForHosts(hosts = [], session = null, snapshots = {}) {
  const voiceSource = { ...getSpeakerVoiceMap(session), ...(snapshots?.speakerVoiceMap || {}) };
  const expressionSource = { ...getSpeakerExpressionMap(session), ...(snapshots?.speakerExpressionMap || {}) };
  const nameSource = { ...getSpeakerNameMap(session), ...(snapshots?.speakerNameMap || {}) };
  const scenarioSource = { ...getSpeakerScenarioMap(session), ...(snapshots?.speakerScenarioMap || {}) };
  const voiceMap = {};
  const expressionMap = {};
  const nameMap = {};
  const scenarioMap = {};
  hosts.forEach((host) => {
    const key = String(host || "").trim();
    if (!key) return;
    voiceMap[key] = normalizeLiveVoiceName(voiceSource[key], resolveSpeakerVoiceName(key, session));
    expressionMap[key] = EXPRESSIONS.includes(expressionSource[key]) ? expressionSource[key] : "Neutral";
    nameMap[key] = String(nameSource[key] || DEFAULT_SPEAKER_NAME_MAP[key] || key).trim() || key;
    scenarioMap[key] = String(scenarioSource[key] || DEFAULT_SPEAKER_SCENARIO_MAP[key] || "Cabina premium de podcast").replace(/\s+/g, " ").trim() || "Cabina premium de podcast";
  });
  return { voiceMap, expressionMap, nameMap, scenarioMap };
}

function addScriptAssistantMessage(script = {}, options = {}) {
  const session = options?.session || getActiveSession();
  const preserveExactRows = options?.preserveExactRows === true;
  const normalized = normalizeScriptPayload(script || {}, {
    session,
    disfluencyDefaults: session?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG,
    speakerNameMap: options?.snapshots?.speakerNameMap || {},
    skipOptimize: preserveExactRows
  });
  const hosts = Array.isArray(normalized?.hosts) && normalized.hosts.length ? normalized.hosts : getSpeakerOptions(session);
  const maps = buildSpeakerMapsForHosts(hosts, session, options?.snapshots || {});
  const text = buildScriptAssistantReply(normalized, {
    isRefinement: options?.isRefinement === true,
    session
  });
  addChatMessage("assistant", text, {
    scriptSnapshot: normalized,
    speakerVoiceMapSnapshot: maps.voiceMap,
    speakerExpressionMapSnapshot: maps.expressionMap,
    speakerNameMapSnapshot: maps.nameMap,
    speakerScenarioMapSnapshot: maps.scenarioMap,
    disfluencyDefaultsSnapshot: normalizeDisfluencyConfig(session?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG)
  });
}

async function copyTextToClipboard(text = "") {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {
    // fallback below
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return Boolean(ok);
  } catch (_) {
    return false;
  }
}

function buildOptions(options, selected) {
  return options.map((option) => (
    `<option value="${escapeHtml(option)}"${option === selected ? " selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
}

function buildVoiceOptions(selected) {
  const groups = [
    { key: "femenina", label: "Voces femeninas" },
    { key: "masculina", label: "Voces masculinas" }
  ];
  const selectedVoice = String(selected || "").trim();
  const grouped = groups.map((group) => {
    const options = AGENT_VOICE_PROFILES
      .filter((profile) => profile.genderGroup === group.key)
      .map((profile) => (
        `<option value="${escapeHtml(profile.voiceName)}"${profile.voiceName === selectedVoice ? " selected" : ""}>${escapeHtml(`${profile.voiceName} · ${profile.toneLabel}`)}</option>`
      ))
      .join("");
    return options ? `<optgroup label="${escapeHtml(group.label)}">${options}</optgroup>` : "";
  }).join("");

  if (grouped) return grouped;
  return AGENT_VOICE_PROFILES.map((profile) => (
    `<option value="${escapeHtml(profile.voiceName)}"${profile.voiceName === selectedVoice ? " selected" : ""}>${escapeHtml(`${profile.voiceName} · ${profile.toneLabel}`)}</option>`
  )).join("");
}

function buildSpeakerOptionsForRow(session = null, selected = "") {
  const cleanSelected = String(selected || "").trim();
  const options = getSpeakerOptions(session);
  if (cleanSelected && !options.includes(cleanSelected)) options.push(cleanSelected);
  return buildOptions(options, cleanSelected || options[0] || "Host A");
}

function setGlobalConfigOpen(isOpen) {
  globalConfigOpen = !!isOpen;
  if (els.globalConfigModal) {
    els.globalConfigModal.hidden = !globalConfigOpen;
  }
}

function setMusicConfigOpen(isOpen) {
  musicConfigOpen = !!isOpen;
  if (els.musicConfigModal) {
    els.musicConfigModal.hidden = !musicConfigOpen;
  }
}

function setAudioTrackMixOpen(isOpen) {
  audioTrackMixOpen = !!isOpen;
  if (els.audioTrackMixModal) {
    els.audioTrackMixModal.hidden = !audioTrackMixOpen;
  }
  if (audioTrackMixOpen) {
    syncMusicControls();
  }
}

function persistAudioTrackMixSettings() {
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  if (typeof podcastStudioPlayback?.refreshMontageBackgroundAudio === "function") {
    podcastStudioPlayback.refreshMontageBackgroundAudio();
  }
}

function setPanelMontageMusicVolume(nextVolume = 22) {
  const clamped = Math.max(0, Math.min(100, Number(nextVolume) || 0));
  panelMusicState.montageVolume = clamped;
  if (els.audioTrackMontageVolume) els.audioTrackMontageVolume.value = String(clamped);
  if (els.audioTrackMontageVolumeNumber) els.audioTrackMontageVolumeNumber.value = String(clamped);
  persistAudioTrackMixSettings();
}

function setPanelMontageStabilize(enabled = false) {
  panelMusicState.stabilize = enabled === true;
  if (els.audioTrackStabilizeToggle) {
    els.audioTrackStabilizeToggle.checked = panelMusicState.stabilize;
  }
  persistAudioTrackMixSettings();
}

function setScriptSetupOpen(isOpen) {
  scriptSetupOpen = !!isOpen;
  if (els.scriptSetupModal) {
    els.scriptSetupModal.hidden = !scriptSetupOpen;
  }
}

function setComposerGenerationMode(mode = "script") {
  composerGenerationMode = String(mode || "").trim() === "video" ? "video" : "script";
  if (els.composerModeToggle) {
    els.composerModeToggle.checked = composerGenerationMode === "video";
  }
}

function readScriptSetupConfig() {
  const hostCount = normalizeHostsCount(els.scriptSetupSpeakerCount?.value || 2);
  const videoMode = Boolean(els.scriptSetupVideoMode?.checked);
  const sceneCount = Math.max(1, Math.min(220, Number(els.scriptSetupSceneCount?.value || 24)));
  const minWordsRaw = Math.max(1, Math.min(200, Number(els.scriptSetupMinWords?.value || 14)));
  const maxWordsRaw = Math.max(1, Math.min(260, Number(els.scriptSetupMaxWords?.value || 20)));
  const minWords = videoMode ? 10 : Math.min(minWordsRaw, maxWordsRaw);
  const maxWords = videoMode ? 15 : Math.max(minWordsRaw, maxWordsRaw);
  if (els.scriptSetupSpeakerCount) els.scriptSetupSpeakerCount.value = String(hostCount);
  if (els.scriptSetupSceneCount) els.scriptSetupSceneCount.value = String(sceneCount);
  if (els.scriptSetupMinWords) els.scriptSetupMinWords.value = String(minWords);
  if (els.scriptSetupMaxWords) els.scriptSetupMaxWords.value = String(maxWords);
  const chosenHosts = [];
  const speakerVoiceMap = {};
  const speakerNameMap = {};
  const speakerScenarioMap = {};
  if (els.scriptSetupSpeakerFields) {
    els.scriptSetupSpeakerFields.querySelectorAll("select[data-setup-speaker-index]").forEach((select) => {
      const picked = normalizeSpeakerLabel(String(select.value || "").trim(), "");
      if (!picked) return;
      if (!chosenHosts.includes(picked)) chosenHosts.push(picked);
    });
    els.scriptSetupSpeakerFields.querySelectorAll("select[data-setup-voice-index]").forEach((select) => {
      const index = Number(select.dataset.setupVoiceIndex || -1);
      if (!Number.isFinite(index) || index < 0) return;
      const host = chosenHosts[index];
      if (!host) return;
      const voice = normalizeLiveVoiceName(String(select.value || "").trim(), resolveSpeakerVoiceName(host, getActiveSession()));
      speakerVoiceMap[host] = voice;
    });
    els.scriptSetupSpeakerFields.querySelectorAll("input[data-setup-name-index]").forEach((input) => {
      const index = Number(input.dataset.setupNameIndex || -1);
      if (!Number.isFinite(index) || index < 0) return;
      const host = chosenHosts[index];
      if (!host) return;
      speakerNameMap[host] = String(input.value || "").trim() || host;
    });
  }
  const hosts = chosenHosts.length
    ? chosenHosts.slice(0, hostCount)
    : hostsForCount(hostCount);
  while (hosts.length < hostCount) {
    const fallback = VOICES.find((voice) => !hosts.includes(voice));
    if (!fallback) break;
    hosts.push(fallback);
  }
  hosts.forEach((host) => {
    if (!speakerNameMap[host]) {
      speakerNameMap[host] = String(getSpeakerNameMap(getActiveSession())?.[host] || DEFAULT_SPEAKER_NAME_MAP[host] || host).trim() || host;
    }
    speakerScenarioMap[host] = String(getSpeakerScenarioMap(getActiveSession())?.[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").trim() || "Cabina premium de podcast";
  });
  return { hostCount, hosts, speakerVoiceMap, speakerNameMap, speakerScenarioMap, sceneCount, minWords, maxWords, videoMode };
}

function composeScriptPromptWithSetup(prompt = "", setup = {}) {
  const basePrompt = String(prompt || "").trim();
  const hostCount = Math.max(1, Math.min(VOICES.length, Number(setup?.hostCount) || 2));
  const hosts = Array.isArray(setup?.hosts) && setup.hosts.length
    ? setup.hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean).slice(0, hostCount)
    : hostsForCount(hostCount);
  const sceneCount = Math.max(1, Math.min(220, Number(setup?.sceneCount) || 24));
  const minWords = Math.max(1, Math.min(260, Number(setup?.minWords) || 14));
  const maxWords = Math.max(minWords, Math.min(260, Number(setup?.maxWords) || 20));
  const videoMode = setup?.videoMode === true;
  const voiceMap = setup?.speakerVoiceMap && typeof setup.speakerVoiceMap === "object"
    ? setup.speakerVoiceMap
    : {};
  const nameMap = setup?.speakerNameMap && typeof setup.speakerNameMap === "object"
    ? setup.speakerNameMap
    : {};
  const voiceLines = hosts.map((host) => `${host}=${normalizeLiveVoiceName(voiceMap[host], resolveSpeakerVoiceName(host, getActiveSession()))}`);
  const nameLines = hosts.map((host) => `${host}=${String(nameMap[host] || getSpeakerNameMap(getActiveSession())?.[host] || host).trim() || host}`);
  return [
    basePrompt,
    "",
    "Parámetros obligatorios de guión:",
    `- Usa exactamente ${hosts.length} locutores.`,
    `- Locutores obligatorios: ${hosts.join(", ")}.`,
    `- Nombre visible por locutor: ${nameLines.join(" | ")}.`,
    `- Voces obligatorias por locutor: ${voiceLines.join(" | ")}.`,
    videoMode
      ? `- Genera exactamente ${sceneCount} escenas para video (Veo), respetando la cantidad configurada.`
      : `- Genera exactamente ${sceneCount} escenas.`,
    `- Cada escena debe tener entre ${minWords} y ${maxWords} palabras.`,
    videoMode
      ? "- Cada escena debe poder funcionar como toma corta de video, durar menos de 8 segundos y terminar con frase completa."
      : "",
    "- Mantén coherencia conversacional y evita dividir ideas cortas en escenas innecesarias."
  ].join("\n");
}

function renderScriptSetupSpeakerFields(hostCount = 2, seedHosts = [], seedVoiceMap = {}, seedNameMap = {}) {
  if (!els.scriptSetupSpeakerFields) return;
  const count = normalizeHostsCount(hostCount);
  const seeded = Array.isArray(seedHosts) ? seedHosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean) : [];
  const selected = [];
  for (let i = 0; i < count; i += 1) {
    const seededHost = seeded[i];
    const fallback = VOICES.find((voice) => !selected.includes(voice)) || VOICES[0] || "Host A";
    const chosen = seededHost && !selected.includes(seededHost) ? seededHost : fallback;
    selected.push(chosen);
  }
  els.scriptSetupSpeakerFields.innerHTML = selected.map((speaker, index) => {
    const voiceValue = normalizeLiveVoiceName(seedVoiceMap?.[speaker], resolveSpeakerVoiceName(speaker, getActiveSession()));
    const speakerName = String(seedNameMap?.[speaker] || getSpeakerNameMap(getActiveSession())?.[speaker] || DEFAULT_SPEAKER_NAME_MAP[speaker] || speaker).trim() || speaker;
    return `
    <article class="script-setup-speaker-card">
      <label class="row-field">
        <span>Locutor ${index + 1}</span>
        <select data-setup-speaker-index="${index}">
          ${buildOptions(VOICES, speaker)}
        </select>
      </label>
      <label class="row-field">
        <span>Nombre visible</span>
        <input data-setup-name-index="${index}" type="text" value="${escapeHtml(speakerName)}" placeholder="Nombre del locutor">
      </label>
      <label class="row-field">
        <span>Voz</span>
        <select data-setup-voice-index="${index}">
          ${buildVoiceOptions(voiceValue)}
        </select>
      </label>
    </article>
  `;
  }).join("");
}

function syncScriptSetupVideoModeUi() {
  const videoMode = Boolean(els.scriptSetupVideoMode?.checked);
  if (els.scriptSetupMinWords) {
    if (videoMode) els.scriptSetupMinWords.value = "10";
    els.scriptSetupMinWords.disabled = videoMode;
  }
  if (els.scriptSetupMaxWords) {
    if (videoMode) els.scriptSetupMaxWords.value = "15";
    els.scriptSetupMaxWords.disabled = videoMode;
  }
}

function normalizeGenerationConstraints(raw = {}) {
  const videoMode = raw?.videoMode === true;
  const hostCountRaw = Number(raw?.hostCount);
  const sceneCountRaw = Number(raw?.sceneCount);
  const minWordsRaw = Number(raw?.minWords);
  const maxWordsRaw = Number(raw?.maxWords);
  const hostCount = Number.isFinite(hostCountRaw) && hostCountRaw > 0
    ? normalizeHostsCount(hostCountRaw)
    : 0;
  const sceneCount = Number.isFinite(sceneCountRaw) && sceneCountRaw > 0
    ? Math.max(1, Math.min(220, Math.round(sceneCountRaw)))
    : 0;
  let minWords = Number.isFinite(minWordsRaw) && minWordsRaw > 0
    ? Math.max(1, Math.min(200, Math.round(minWordsRaw)))
    : 0;
  let maxWords = Number.isFinite(maxWordsRaw) && maxWordsRaw > 0
    ? Math.max(1, Math.min(260, Math.round(maxWordsRaw)))
    : 0;
  if (minWords && maxWords) {
    const min = Math.min(minWords, maxWords);
    const max = Math.max(minWords, maxWords);
    minWords = min;
    maxWords = max;
  } else if (minWords && !maxWords) {
    maxWords = Math.max(minWords, 260);
  } else if (!minWords && maxWords) {
    minWords = 1;
  }
  const hostsRaw = Array.isArray(raw?.hosts) ? raw.hosts : [];
  const hosts = [];
  hostsRaw.forEach((host) => {
    const normalized = normalizeSpeakerLabel(host, "");
    if (!normalized) return;
    if (hosts.includes(normalized)) return;
    hosts.push(normalized);
  });
  const boundedHosts = hosts.slice(0, hostCount || hosts.length || 0);
  return {
    hostCount,
    hosts: boundedHosts,
    sceneCount,
    minWords,
    maxWords,
    videoMode
  };
}

function trimWords(text = "", maxWords = 0) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const safeMax = Math.max(0, Number(maxWords) || 0);
  if (!safeMax || words.length <= safeMax) return words.join(" ");
  return words.slice(0, safeMax).join(" ");
}

function validateScriptConstraints(script = {}, constraints = {}) {
  const issues = [];
  const rows = Array.isArray(script?.rows) ? script.rows : [];
  const hosts = Array.isArray(script?.hosts) ? script.hosts : [];
  const hostCount = Number(constraints?.hostCount) || 0;
  const sceneCount = Number(constraints?.sceneCount) || 0;
  const minWords = Number(constraints?.minWords) || 0;
  const maxWords = Number(constraints?.maxWords) || 0;
  const forcedHosts = Array.isArray(constraints?.hosts) ? constraints.hosts : [];

  if (hostCount > 0 && hosts.length !== hostCount) {
    issues.push(`hosts=${hosts.length} (esperado ${hostCount})`);
  }
  if (forcedHosts.length) {
    const normalizedCurrentHosts = hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean);
    const same = forcedHosts.length === normalizedCurrentHosts.length
      && forcedHosts.every((host, index) => host === normalizedCurrentHosts[index]);
    if (!same) {
      issues.push(`hosts=[${normalizedCurrentHosts.join(", ")}] (esperado [${forcedHosts.join(", ")}])`);
    }
  }
  if (sceneCount > 0 && rows.length !== sceneCount) {
    issues.push(`escenas=${rows.length} (esperado ${sceneCount})`);
  }
  if (minWords > 0 || maxWords > 0) {
    rows.forEach((row, index) => {
      const count = countWords(row?.text || "");
      if (minWords > 0 && count < minWords) {
        issues.push(`escena ${index + 1}: ${count} palabras (<${minWords})`);
      }
      if (maxWords > 0 && count > maxWords) {
        issues.push(`escena ${index + 1}: ${count} palabras (>${maxWords})`);
      }
    });
  }
  return issues;
}

function forceHostsAndAlternation(script = {}, constraints = {}, session = null) {
  let rows = Array.isArray(script?.rows) ? script.rows.map((row) => ({ ...row })) : [];
  const explicitHosts = Array.isArray(constraints?.hosts) && constraints.hosts.length
    ? constraints.hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean)
    : [];
  const hosts = explicitHosts.length
    ? explicitHosts
    : Number(constraints?.hostCount) > 0
      ? hostsForCount(constraints.hostCount)
    : (Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(session));
  const sceneCount = Number(constraints?.sceneCount) || 0;
  if (sceneCount > 0 && rows.length > sceneCount) {
    rows = rows.slice(0, sceneCount);
  }
  const aliasMap = buildSpeakerAliasMap(hosts, {
    nameMap: buildSpeakerNameMap(hosts, session?.speakerNameMap || {})
  });
  const videoMode = constraints?.videoMode === true;
  const baseRows = videoMode
    ? enforceVideoSceneRows(rows, { minWords: 10, maxWords: 15 })
    : rows;
  const forcedRows = baseRows.map((row, index) => {
    const expected = hosts[index % Math.max(1, hosts.length)] || hosts[0] || "Host A";
    const resolved = resolveSpeakerFromAliases(row?.speaker, {
      hosts,
      fallback: expected,
      aliasMap
    });
    const text = String(row?.text || "").trim();
    const maxWords = Number(constraints?.maxWords) || 0;
    return {
      ...row,
      speaker: videoMode
        ? resolved
        : (hosts.length > 1 ? expected : resolved),
      text: maxWords > 0 ? trimWords(text, maxWords) : text
    };
  });
  return normalizeScriptPayload({
    ...(script || {}),
    hosts,
    rows: forcedRows
  }, { session, skipOptimize: true });
}

async function generateWithGeminiStrictConstraints(prompt, sessionSnapshot, constraints = {}) {
  const strict = normalizeGenerationConstraints(constraints);
  let lastScript = null;
  let lastIssues = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const fixInstruction = attempt > 1
      ? [
        "Corrección obligatoria del intento anterior.",
        `Incumplimientos detectados: ${lastIssues.join(" | ")}`,
        "Reescribe el guión completo desde cero cumpliendo exactamente todas las reglas."
      ].join("\n")
      : "";
    const composedPrompt = [prompt, fixInstruction].filter(Boolean).join("\n\n");
    const generated = await generateWithGemini(composedPrompt, sessionSnapshot, strict);
    const normalized = forceHostsAndAlternation(generated, strict, sessionSnapshot);
    const issues = validateScriptConstraints(normalized, strict);
    lastScript = normalized;
    lastIssues = issues;
    if (!issues.length) return { script: normalized, issues: [] };
  }
  return { script: lastScript, issues: lastIssues };
}

function primeScriptSetupModal() {
  const session = getActiveSession();
  const hostCount = normalizeHostsCount(session?.script?.hosts?.length || 2);
  const sceneCount = Math.max(1, Math.min(220, Number(session?.script?.rows?.length || 24)));
  if (els.scriptSetupSpeakerCount) els.scriptSetupSpeakerCount.value = String(hostCount);
  renderScriptSetupSpeakerFields(hostCount, session?.script?.hosts || [], getSpeakerVoiceMap(session), getSpeakerNameMap(session));
  if (els.scriptSetupVideoMode) els.scriptSetupVideoMode.checked = false;
  syncScriptSetupVideoModeUi();
  if (els.scriptSetupSceneCount) els.scriptSetupSceneCount.value = String(sceneCount);
  if (els.scriptSetupMinWords && !Number.isFinite(Number(els.scriptSetupMinWords.value))) els.scriptSetupMinWords.value = "14";
  if (els.scriptSetupMaxWords && !Number.isFinite(Number(els.scriptSetupMaxWords.value))) els.scriptSetupMaxWords.value = "20";
}

function syncMusicControls() {
  if (els.panelMusicPreset) {
    els.panelMusicPreset.value = panelMusicState.preset;
  }
  if (els.panelMusicVolume) {
    els.panelMusicVolume.value = String(panelMusicState.volume);
  }
  if (els.panelMusicTrackInfo) {
    const uploadedTracks = getPanelMusicUploadedTracks();
    const track = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
    if (panelMusicState.sourceType === "track" && track) {
      const origin = panelMusicState.selectedTrackKind === "ai"
        ? "IA"
        : (track.storagePath ? "Firebase" : track.localDataUrl ? "Local" : "Sin origen");
      els.panelMusicTrackInfo.textContent = panelMusicState.selectedTrackKind === "uploaded" && uploadedTracks.length > 1
        ? `${uploadedTracks.length} audios cargados · ${origin}`
        : `${track.slotLabel || track.name || "Audio"} · ${origin}`;
    } else {
      els.panelMusicTrackInfo.textContent = "Sin canción seleccionada. Se usará preset.";
    }
  }
  if (els.panelMusicTrackList) {
    const uploadedTracks = getPanelMusicUploadedTracks();
    const selectedCount = uploadedTracks.filter((track) => track?.enabledInSession !== false).length;
    els.panelMusicTrackList.innerHTML = uploadedTracks.length
      ? uploadedTracks.map((track, index) => {
        const isSelected = panelMusicState.selectedTrackKind === "uploaded"
          && !panelMusicState.track?.model
          && String(panelMusicState.track?.slotLabel || "").trim() === String(track.slotLabel || "").trim();
        const isEnabledInSession = track.enabledInSession !== false;
        const origin = track.storagePath ? "Firebase" : (track.localDataUrl ? "Local" : "Sin origen");
        return `
          <div class="panel-music-track-item${isSelected ? " is-selected" : ""}${isEnabledInSession ? "" : " is-disabled"}">
            <span class="panel-music-track-item-copy">
              <strong>${escapeHtml(track.slotLabel || `Audio ${index + 1}`)}</strong>
              <span>${escapeHtml(track.name || "Audio")} · ${escapeHtml(origin)} · ${escapeHtml(`${Math.round(getPanelMusicTrackDurationSec(track))}s`)} · ${isEnabledInSession ? "Seleccionado" : "No seleccionado"}</span>
            </span>
            <span class="panel-music-track-item-actions">
              <button class="row-icon-btn" type="button" data-action="toggle-session-audio-enabled" data-track-index="${index}" title="${isEnabledInSession ? "Quitar de esta sesión" : "Seleccionar para esta sesión"}">
                <i class="fas ${isEnabledInSession ? "fa-check-square" : "fa-square"}"></i>
              </button>
              <button class="row-icon-btn" type="button" data-action="select-uploaded-audio-item" data-track-index="${index}" title="Editar este audio">
                <i class="fas fa-sliders-h"></i>
              </button>
              <button class="row-icon-btn" type="button" data-action="remove-session-audio-item" data-track-index="${index}" title="Quitar de esta sesión">
                <i class="fas fa-times"></i>
              </button>
            </span>
          </div>
        `;
      }).join("")
      : `<div class="music-track-info">Sin audios cargados.</div>`;
    if (els.selectAllSessionAudiosBtn) {
      els.selectAllSessionAudiosBtn.disabled = !uploadedTracks.length || selectedCount === uploadedTracks.length;
    }
    if (els.clearAllSessionAudiosBtn) {
      els.clearAllSessionAudiosBtn.disabled = !uploadedTracks.length || selectedCount <= 1;
    }
  }
  if (els.panelMusicGlobalLibraryList) {
    if (panelMusicGlobalLibraryState.loading) {
      els.panelMusicGlobalLibraryList.innerHTML = `<div class="music-track-info">Cargando biblioteca global...</div>`;
    } else if (panelMusicGlobalLibraryState.error) {
      els.panelMusicGlobalLibraryList.innerHTML = `<div class="music-track-info">${escapeHtml(panelMusicGlobalLibraryState.error)}</div>`;
    } else if (panelMusicGlobalLibraryState.items.length) {
      els.panelMusicGlobalLibraryList.innerHTML = panelMusicGlobalLibraryState.items.map((track) => `
        <div class="panel-music-track-item">
          <span class="panel-music-track-item-copy">
            <strong>${escapeHtml(track.name || "Audio")}</strong>
            <span>${escapeHtml(`${Math.round(getPanelMusicTrackDurationSec(track))}s`)}${track.ownerEmail ? ` · ${escapeHtml(track.ownerEmail)}` : ""}</span>
          </span>
          <span class="panel-music-track-item-actions">
            <button class="row-icon-btn" type="button" data-action="use-global-audio-item" data-library-id="${escapeHtml(track.libraryId)}" title="Añadir a esta sesión">
              <i class="fas fa-plus"></i>
            </button>
            <button class="row-icon-btn" type="button" data-action="delete-global-audio-item" data-library-id="${escapeHtml(track.libraryId)}" title="Eliminar de la biblioteca global">
              <i class="fas fa-trash"></i>
            </button>
          </span>
        </div>
      `).join("");
    } else {
      els.panelMusicGlobalLibraryList.innerHTML = `<div class="music-track-info">No hay audios globales todavía.</div>`;
    }
  }
  if (els.audioTrackSourceSelect) {
    const uploadedTrack = getPanelMusicTrackAvailability("uploaded");
    const aiTrack = getPanelMusicTrackAvailability("ai");
    els.audioTrackSourceSelect.value = panelMusicState.sourceType === "track"
      ? resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind)
      : "preset";
    const uploadedOption = els.audioTrackSourceSelect.querySelector('option[value="uploaded"]');
    const aiOption = els.audioTrackSourceSelect.querySelector('option[value="ai"]');
    if (uploadedOption) uploadedOption.disabled = !uploadedTrack;
    if (aiOption) aiOption.disabled = !aiTrack;
  }
  if (els.audioTrackSourceInfo) {
    const uploadedTrack = getPanelMusicTrackAvailability("uploaded");
    const aiTrack = getPanelMusicTrackAvailability("ai");
    const currentLabel = panelMusicState.sourceType === "track" && panelMusicState.track
      ? `${panelMusicState.selectedTrackKind === "ai" ? "Usando IA" : "Usando audio cargado"}: ${panelMusicState.track.name || "Audio"}`
      : "Usando preset del estudio.";
    const inventory = [
      uploadedTrack ? `Cargado: ${uploadedTrack.name || "Audio"}` : "Cargado: ninguno",
      aiTrack ? `IA: ${aiTrack.name || "Audio IA"}` : "IA: ninguno"
    ].join(" · ");
    els.audioTrackSourceInfo.textContent = `${currentLabel} ${inventory}`;
  }
  if (els.panelMusicAiPrompt && !String(els.panelMusicAiPrompt.value || "").trim()) {
    els.panelMusicAiPrompt.value = buildDefaultPanelMusicAiPrompt(getActiveSession());
  }
  if (els.panelMusicPlayBtn) {
    els.panelMusicPlayBtn.disabled = panelMusicState.playing;
  }
  if (els.panelMusicStopBtn) {
    els.panelMusicStopBtn.disabled = !panelMusicState.playing;
  }
  if (els.clearPanelMusicTrackBtn) {
    els.clearPanelMusicTrackBtn.disabled = !panelMusicState.track;
  }
  if (els.generatePanelMusicAiBtn) {
    els.generatePanelMusicAiBtn.disabled = panelMusicAiGenerating;
  }
  if (els.audioTrackMontageVolume) {
    els.audioTrackMontageVolume.value = String(Math.max(0, Math.min(100, Number(panelMusicState.montageVolume) || 0)));
  }
  if (els.audioTrackMontageVolumeNumber) {
    els.audioTrackMontageVolumeNumber.value = String(Math.max(0, Math.min(100, Number(panelMusicState.montageVolume) || 0)));
  }
  if (els.audioTrackStabilizeToggle) {
    els.audioTrackStabilizeToggle.checked = panelMusicState.stabilize === true;
  }
}

function syncPanelMusicStateFromSession(session = null) {
  const cfg = session?.panelMusicConfig && typeof session.panelMusicConfig === "object"
    ? session.panelMusicConfig
    : null;
  if (!cfg) return;
  const sessionId = String(session?.id || "").trim();
  const hydrateTrackFromCache = (track, kind) => {
    const normalized = normalizePanelMusicTrack(track);
    if (!normalized || String(normalized.localDataUrl || "").trim()) return normalized;
    const cachedLocalDataUrl = loadPanelMusicSessionTrackCache(sessionId, kind);
    return cachedLocalDataUrl
      ? {
        ...normalized,
        localDataUrl: cachedLocalDataUrl
      }
      : normalized;
  };
  const next = {
    preset: ["ambient", "focus", "pulse"].includes(String(cfg?.preset || "").trim()) ? String(cfg.preset).trim() : "ambient",
    volume: Math.max(0, Math.min(100, Number(cfg?.volume) || 22)),
    montageVolume: Math.max(0, Math.min(100, Number(cfg?.montageVolume ?? cfg?.volume ?? 22))),
    stabilize: cfg?.stabilize === true || String(cfg?.stabilize || "").trim().toLowerCase() === "true",
    sourceType: String(cfg?.sourceType || "").trim() === "track" ? "track" : "preset",
    selectedTrackKind: resolvePanelMusicTrackKind(cfg?.selectedTrackKind || "uploaded"),
    trackLibrary: {
      uploaded: hydrateTrackFromCache(cfg?.trackLibrary?.uploaded || null, "uploaded"),
      uploadedTracks: normalizePanelMusicTrackList((cfg?.trackLibrary?.uploadedTracks || []).map((track) => hydrateTrackFromCache(track, "uploaded"))),
      ai: hydrateTrackFromCache(cfg?.trackLibrary?.ai || null, "ai")
    },
    track: hydrateTrackFromCache(cfg?.track || null, cfg?.track?.model ? "ai" : "uploaded")
  };
  if (!next.trackLibrary.uploaded && next.track && !next.track.model) next.trackLibrary.uploaded = next.track;
  if (!next.trackLibrary.uploadedTracks.length && next.trackLibrary.uploaded) {
    next.trackLibrary.uploadedTracks = [{ ...next.trackLibrary.uploaded, slotLabel: String(next.trackLibrary.uploaded.slotLabel || "Audio 1").trim() || "Audio 1" }];
  }
  if (!next.trackLibrary.ai && next.track && next.track.model) next.trackLibrary.ai = next.track;
  panelMusicState = {
    ...panelMusicState,
    preset: next.preset,
    volume: next.volume,
    montageVolume: next.montageVolume,
    stabilize: next.stabilize,
    sourceType: next.sourceType,
    selectedTrackKind: next.selectedTrackKind,
    trackLibrary: next.trackLibrary,
    track: next.track
  };
  syncActivePanelMusicTrack({ kind: next.selectedTrackKind });
  const activeTrack = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
  const shouldProbeTrackDuration = panelMusicState.sourceType === "track" && (
    getPanelMusicTrackDurationSec(activeTrack) <= 0.05
    || String(activeTrack?.durationMeasuredWith || "").trim().toLowerCase() !== "decode"
  );
  if (shouldProbeTrackDuration) {
    ensurePanelMusicTrackDuration(panelMusicState.selectedTrackKind, {
      render: false,
      force: getPanelMusicTrackDurationSec(activeTrack) > 0.05
    }).then(() => {
      syncMusicControls();
      renderPodcastVideoTimeline(getActiveSession());
    }).catch(() => {});
  }
  if (getEnabledPanelMusicUploadedTracks().length) {
    ensureAllEnabledUploadedTrackDurations({
      render: false,
      force: true
    }).then(() => {
      syncMusicControls();
      renderPodcastVideoTimeline(getActiveSession());
    }).catch(() => {});
  }
}

function stopPanelMusic() {
  if (panelMusicAudioEl) {
    try {
      panelMusicAudioEl.pause();
    } catch (_) {
      // noop
    }
    panelMusicAudioEl = null;
  }
  panelMusicNodes.forEach((node) => {
    try {
      if (node?.stop) node.stop();
    } catch (_) {
      // noop
    }
    try {
      if (node?.disconnect) node.disconnect();
    } catch (_) {
      // noop
    }
  });
  panelMusicNodes = [];
  panelMusicState.playing = false;
  syncMusicControls();
}

function resolvePanelMusicTrackSrc() {
  const track = normalizePanelMusicTrack(panelMusicState.track);
  if (!track) return "";
  const localDataUrl = String(track.localDataUrl || "").trim();
  if (localDataUrl) return localDataUrl;
  const remote = String(track.downloadUrl || "").trim();
  return resolveStorageAudioUrl(remote);
}

function getPanelMontageMusicConfig() {
  const sourceUrl = panelMusicState.sourceType === "track"
    ? resolvePanelMusicTrackSrc()
    : "";
  const activeTrack = normalizePanelMusicTrack(panelMusicState.track);
  const uploadedSegments = panelMusicState.selectedTrackKind === "uploaded"
    ? buildUploadedPanelMusicSegments(getActiveSession())
    : [];
  return {
    sourceType: panelMusicState.sourceType === "track" ? "track" : "preset",
    preset: ["ambient", "focus", "pulse"].includes(String(panelMusicState.preset || "").trim())
      ? String(panelMusicState.preset).trim()
      : "ambient",
    sourceUrl: String(sourceUrl || "").trim(),
    sourceItems: uploadedSegments.map((segment) => ({
      slotLabel: String(segment?.slotLabel || "").trim(),
      sourceUrl: String(resolveStorageAudioUrl(segment?.downloadUrl || "", segment?.storagePath || "") || "").trim(),
      startOffsetMs: Math.max(0, Number(segment?.startMs || 0) || 0),
      endOffsetMs: Math.max(0, Number(segment?.endMs || 0) || 0),
      loop: segment?.loop === true,
      durationSec: Math.max(0, Number(segment?.durationSec || 0) || 0),
      trimInMs: Math.max(0, Number(segment?.trimInMs || 0) || 0),
      trimOutMs: Math.max(0, Number(segment?.trimOutMs || 0) || 0)
    })).filter((segment) => segment.sourceUrl),
    volume: Math.max(0, Math.min(100, Number(panelMusicState.montageVolume ?? panelMusicState.volume ?? 22))),
    stabilize: panelMusicState.stabilize === true,
    durationSec: Math.max(0, Number(activeTrack?.durationSec || 0) || 0),
    startOffsetMs: Math.max(0, Number(activeTrack?.startOffsetMs || 0) || 0),
    trimInMs: Math.max(0, Number(activeTrack?.trimInMs || 0) || 0),
    trimOutMs: Math.max(0, Number(activeTrack?.trimOutMs || 0) || 0),
    loopSettings: Array.isArray(activeTrack?.loopSettings)
      ? activeTrack.loopSettings.map((item) => ({
        loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
        trimInMs: Math.max(0, Number(item?.trimInMs || 0) || 0),
        trimOutMs: Math.max(0, Number(item?.trimOutMs || 0) || 0)
      }))
      : [],
    mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(activeTrack?.mutedLoopIndexes || [])
  };
}

async function startPanelMusic() {
  if (panelMusicState.playing) return;
  const musicSrc = panelMusicState.sourceType === "track" ? resolvePanelMusicTrackSrc() : "";
  if (musicSrc) {
    const audio = new Audio(musicSrc);
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, (Number(panelMusicState.volume) || 0) / 100));
    panelMusicAudioEl = audio;
    await audio.play();
    panelMusicState.playing = true;
    syncMusicControls();
    return;
  }
  if (!panelMusicAudioCtx) {
    panelMusicAudioCtx = new AudioContext();
  }
  if (panelMusicAudioCtx.state === "suspended") {
    await panelMusicAudioCtx.resume().catch(() => {});
  }
  const ctx = panelMusicAudioCtx;
  const master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.9;
  master.gain.value = Math.max(0, Math.min(1, (Number(panelMusicState.volume) || 0) / 100 * 0.22));
  filter.connect(master);
  master.connect(ctx.destination);

  const pushOsc = (type, freq, gainValue, detune = 0) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    panelMusicNodes.push(osc, gain);
  };

  if (panelMusicState.preset === "focus") {
    pushOsc("triangle", 180, 0.21);
    pushOsc("sine", 270, 0.13, 4);
  } else if (panelMusicState.preset === "pulse") {
    pushOsc("sawtooth", 92, 0.14);
    pushOsc("square", 184, 0.08, -3);
  } else {
    pushOsc("sine", 146.83, 0.18);
    pushOsc("sine", 220, 0.11, 6);
  }

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = panelMusicState.preset === "pulse" ? 0.22 : 0.08;
  lfoGain.gain.value = panelMusicState.preset === "pulse" ? 0.04 : 0.02;
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);
  lfo.start();
  panelMusicNodes.push(master, filter, lfo, lfoGain);

  panelMusicState.playing = true;
  syncMusicControls();
}

function buildCloudSessionPayload(session = null) {
  const source = session || getActiveSession();
  if (!source) return null;
  const chat = Array.isArray(source.chat) ? source.chat : [];
  const rows = Array.isArray(source?.script?.rows) ? source.script.rows : [];
  const sourcePanelMusicConfig = source?.panelMusicConfig && typeof source.panelMusicConfig === "object"
    ? source.panelMusicConfig
    : null;
  const panelMusicConfig = sourcePanelMusicConfig || {
    preset: panelMusicState.preset,
    volume: panelMusicState.volume,
    montageVolume: panelMusicState.montageVolume,
    stabilize: panelMusicState.stabilize === true,
    sourceType: panelMusicState.sourceType,
    selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
    trackLibrary: {
      uploaded: panelMusicState.trackLibrary?.uploaded || null,
      uploadedTracks: getPanelMusicUploadedTracks(),
      ai: panelMusicState.trackLibrary?.ai || null
    },
    track: panelMusicState.track || null
  };
  return {
    id: String(source.id || "").trim() || makeId("session"),
    title: String(source.title || "Sesión sin título").trim().slice(0, 160),
    prompt: String(source.prompt || "").slice(0, 4000),
    archived: source.archived === true,
    updatedAt: nowIso(),
    chat: chat.slice(-220).map((msg) => ({
      id: String(msg?.id || makeId("msg")).trim(),
      role: ["assistant", "user", "system"].includes(String(msg?.role || "")) ? String(msg.role) : "assistant",
      text: String(msg?.text || "").slice(0, 8000)
    })),
    script: {
      episodeTitle: String(source?.script?.episodeTitle || "Podcast").slice(0, 220),
      summary: String(source?.script?.summary || "").slice(0, 5000),
      hosts: getSpeakerOptions(source).slice(0, 10),
      rows: rows.slice(0, 400).map((row) => ({
        id: String(row?.id || makeId("row")).trim(),
        speaker: normalizeSpeakerLabel(row?.speaker || "Host A", "Host A"),
        expression: EXPRESSIONS.includes(String(row?.expression || "")) ? String(row.expression) : "Neutral",
        durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(row?.durationSec) || SHORT_SCENE_MAX_SEC)),
        mediaCue: MEDIA_CUES.includes(String(row?.mediaCue || "")) ? String(row.mediaCue) : "Sin media",
        text: String(row?.text || "").slice(0, 10000),
        notes: String(row?.notes || "").slice(0, 4000),
        disfluencyConfig: normalizeDisfluencyConfig(row?.disfluencyConfig || {})
      }))
    },
    speakerVoiceMap: getSpeakerVoiceMap(source),
    speakerExpressionMap: getSpeakerExpressionMap(source),
    speakerNameMap: getSpeakerNameMap(source),
    speakerScenarioMap: getSpeakerScenarioMap(source),
    speakerScenarioVariantsMap: getSpeakerScenarioVariantsMap(source),
    globalScenarioDeck: getGlobalScenarioDeck(source),
    disfluencyDefaults: normalizeDisfluencyConfig(source?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG),
    panelMusicConfig: {
      preset: String(panelMusicConfig.preset || "ambient"),
      volume: Math.max(0, Math.min(100, Number(panelMusicConfig.volume) || 0)),
      montageVolume: Math.max(0, Math.min(100, Number(panelMusicConfig.montageVolume ?? panelMusicConfig.volume ?? 22))),
      stabilize: panelMusicConfig.stabilize === true,
      sourceType: panelMusicConfig.sourceType === "track" ? "track" : "preset",
      selectedTrackKind: resolvePanelMusicTrackKind(panelMusicConfig.selectedTrackKind),
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
            enabledInSession: panelMusicConfig.trackLibrary.uploaded.enabledInSession !== false,
            loopSettings: normalizePanelMusicLoopSettings(
              panelMusicConfig.trackLibrary.uploaded.loopSettings || [],
              Math.round(Math.max(0, Number(panelMusicConfig.trackLibrary.uploaded.durationSec || 0) || 0) * 1000)
            ),
            downloadUrl: String(panelMusicConfig.trackLibrary.uploaded.downloadUrl || "").trim(),
            storagePath: String(panelMusicConfig.trackLibrary.uploaded.storagePath || "").trim(),
            updatedAt: String(panelMusicConfig.trackLibrary.uploaded.updatedAt || nowIso()).trim() || nowIso(),
            mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(panelMusicConfig.trackLibrary.uploaded.mutedLoopIndexes || [])
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
            enabledInSession: track?.enabledInSession !== false,
            loopSettings: normalizePanelMusicLoopSettings(
              track?.loopSettings || [],
              Math.round(Math.max(0, Number(track?.durationSec || 0) || 0) * 1000)
            ),
            downloadUrl: String(track?.downloadUrl || "").trim(),
            storagePath: String(track?.storagePath || "").trim(),
            updatedAt: String(track?.updatedAt || nowIso()).trim() || nowIso(),
            mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(track?.mutedLoopIndexes || [])
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
            loopSettings: normalizePanelMusicLoopSettings(
              panelMusicConfig.trackLibrary.ai.loopSettings || [],
              Math.round(Math.max(0, Number(panelMusicConfig.trackLibrary.ai.durationSec || 0) || 0) * 1000)
            ),
            downloadUrl: String(panelMusicConfig.trackLibrary.ai.downloadUrl || "").trim(),
            storagePath: String(panelMusicConfig.trackLibrary.ai.storagePath || "").trim(),
            updatedAt: String(panelMusicConfig.trackLibrary.ai.updatedAt || nowIso()).trim() || nowIso(),
            model: String(panelMusicConfig.trackLibrary.ai.model || "").trim(),
            prompt: String(panelMusicConfig.trackLibrary.ai.prompt || "").trim(),
            mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(panelMusicConfig.trackLibrary.ai.mutedLoopIndexes || [])
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
          loopSettings: normalizePanelMusicLoopSettings(
            panelMusicConfig.track.loopSettings || [],
            Math.round(Math.max(0, Number(panelMusicConfig.track.durationSec || 0) || 0) * 1000)
          ),
          downloadUrl: String(panelMusicConfig.track.downloadUrl || "").trim(),
          storagePath: String(panelMusicConfig.track.storagePath || "").trim(),
          updatedAt: String(panelMusicConfig.track.updatedAt || nowIso()).trim() || nowIso(),
          model: String(panelMusicConfig.track.model || "").trim(),
          prompt: String(panelMusicConfig.track.prompt || "").trim(),
          mutedLoopIndexes: normalizePanelMusicMutedLoopIndexes(panelMusicConfig.track.mutedLoopIndexes || [])
        }
        : null
    },
    speakerPortraitMap: getSpeakerPortraitMap(source),
    dialogueVideoMap: getDialogueVideoMap(source),
    dialogueAudioMap: getDialogueAudioMap(source),
    podcastVideoConfig: normalizePodcastVideoConfig(source?.podcastVideoConfig || {})
  };
}

async function ensurePanelMusicTrackUploaded(sessionId = "", options = {}) {
  const silent = options.silent === true;
  if (panelMusicState.sourceType !== "track" || !panelMusicState.track) return null;
  if (resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind) !== "uploaded") return panelMusicState.track;
  const currentTrack = panelMusicState.track;
  const existingStoragePath = String(currentTrack.storagePath || "").trim();
  const existingDownloadUrl = String(currentTrack.downloadUrl || "").trim();
  // Avoid re-uploading tracks that are already persisted in Firebase Storage.
  if (existingStoragePath && existingDownloadUrl) return currentTrack;
  const localDataUrl = String(currentTrack.localDataUrl || "").trim();
  if (!localDataUrl) {
    throw new Error("No se encontró el archivo local para subir música a Storage.");
  }
  if (!silent) setGenerationStatus("Subiendo música a Firebase Storage...", "is-busy");
  const upload = await authFetchJson("/api/podcaster/music/upload", {
    method: "POST",
    body: JSON.stringify({
      sessionId: String(sessionId || getActiveSession()?.id || "").trim(),
      fileName: String(currentTrack.name || "podcast-music").trim() || "podcast-music",
      mimeType: String(currentTrack.mimeType || "audio/mpeg").trim() || "audio/mpeg",
      durationSec: Math.max(0, Number(currentTrack.durationSec || 0) || 0),
      audioDataUrl: localDataUrl,
      previousStoragePath: existingStoragePath
    })
  });
  setPanelMusicTrack("uploaded", {
    ...currentTrack,
    durationSec: Math.max(0, Number(upload?.track?.durationSec || currentTrack.durationSec || 0) || 0),
    startOffsetMs: Math.max(0, Number(currentTrack.startOffsetMs || 0) || 0),
    durationMeasuredWith: String(currentTrack.durationMeasuredWith || "").trim().toLowerCase(),
    downloadUrl: String(upload?.track?.downloadUrl || "").trim(),
    storagePath: String(upload?.track?.storagePath || "").trim(),
    updatedAt: String(upload?.track?.updatedAt || nowIso()).trim() || nowIso(),
    localDataUrl: ""
  }, { select: true });
  const uploadedTracks = getPanelMusicUploadedTracks();
  const selectedIndex = Math.max(0, uploadedTracks.findIndex((item) => String(item.slotLabel || "").trim() === String(currentTrack.slotLabel || "").trim()));
  updateUploadedTrackAt(selectedIndex, {
    ...currentTrack,
    durationSec: Math.max(0, Number(upload?.track?.durationSec || currentTrack.durationSec || 0) || 0),
    startOffsetMs: Math.max(0, Number(currentTrack.startOffsetMs || 0) || 0),
    durationMeasuredWith: String(currentTrack.durationMeasuredWith || "").trim().toLowerCase(),
    downloadUrl: String(upload?.track?.downloadUrl || "").trim(),
    storagePath: String(upload?.track?.storagePath || "").trim(),
    updatedAt: String(upload?.track?.updatedAt || nowIso()).trim() || nowIso(),
    localDataUrl: ""
  }, { selectIndex: selectedIndex });
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  syncMusicControls();
  return panelMusicState.track;
}

async function saveSessionToCloud(sessionId = null, options = {}) {
  const silent = options.silent === true;
  const initialTarget = sessionId
    ? state.sessions.find((session) => session.id === sessionId) || null
    : getActiveSession();
  if (!initialTarget) throw new Error("No hay sesión activa para guardar.");
  if (
    hasAvailableApiBase() &&
    panelMusicState.sourceType === "track"
    && panelMusicState.track
    && String(panelMusicState.track.localDataUrl || "").trim()
    && !(String(panelMusicState.track.storagePath || "").trim() && String(panelMusicState.track.downloadUrl || "").trim())
  ) {
    await ensurePanelMusicTrackUploaded(initialTarget.id, { silent: true });
  }
  const target = sessionId
    ? state.sessions.find((session) => session.id === sessionId) || null
    : getActiveSession();
  if (!target) throw new Error("No hay sesión activa para guardar.");
  if (!silent) setGenerationStatus("Guardando sesión en Firebase...", "is-busy");
  const payload = buildCloudSessionPayload(target);
  const response = hasAvailableApiBase()
    ? await authFetchJson("/api/podcaster/sessions/save", {
        method: "POST",
        body: JSON.stringify({ session: payload })
      })
    : await saveSessionToCloudDirect(payload);
  const savedAt = String(response?.savedAt || nowIso()).trim() || nowIso();
  state.sessions = state.sessions.map((session) => (
    session.id === target.id
      ? {
          ...session,
          cloudMeta: {
            ...(session.cloudMeta || {}),
            savedAt,
            ownerId: String(response?.ownerId || "").trim() || session.cloudMeta?.ownerId || null
          }
        }
      : session
  ));
  persistSessions();
  if (!silent) {
    addChatMessage("assistant", `Sesión guardada en Firebase (${formatDate(savedAt)}).`);
    setGenerationStatus("Sesión guardada", "is-live");
    render();
  }
  return response;
}

async function saveSessionToCloudDirect(payload) {
  const uid = resolveCurrentUid();
  if (!uid) throw new Error("AUTH_REQUIRED");
  const sanitized = payload && typeof payload === "object" ? payload : null;
  if (!sanitized?.id) {
    throw new Error("La sesión no tiene un ID válido.");
  }
  const sessionRef = doc(firestoreDb, "podcaster_sessions", sanitized.id);
  const existingSnap = await getDoc(sessionRef);
  const existing = existingSnap.exists() ? (existingSnap.data() || {}) : null;
  if (existing && String(existing.ownerId || "").trim() !== uid) {
    throw new Error("No puedes sobrescribir una sesión de otro usuario.");
  }
  await setDoc(sessionRef, {
    ownerId: uid,
    title: sanitized.title,
    archived: sanitized.archived === true,
    sessionUpdatedAt: sanitized.updatedAt || nowIso(),
    session: sanitized,
    sharedWithIds: Array.isArray(existing?.sharedWithIds) ? existing.sharedWithIds : [],
    sharedWith: Array.isArray(existing?.sharedWith) ? existing.sharedWith : [],
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return {
    ok: true,
    sessionId: sanitized.id,
    ownerId: uid,
    savedAt: nowIso()
  };
}

async function shareSessionWithUser(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const savedAt = Date.parse(String(session?.cloudMeta?.savedAt || ""));
  const updatedAt = Date.parse(String(session?.updatedAt || ""));
  if (!Number.isFinite(savedAt) || (Number.isFinite(updatedAt) && updatedAt > savedAt)) {
    addChatMessage("system", "Guarda la sesión con el botón Guardar sesión antes de compartirla.");
    setGenerationStatus("Guardar sesión primero", "");
    return;
  }
  const rawTarget = window.prompt("Comparte con UID o email del usuario destino", "");
  if (rawTarget === null) return;
  const target = String(rawTarget || "").trim();
  if (!target) {
    addChatMessage("system", "Debes indicar un UID o email para compartir la sesión.");
    return;
  }
  setGenerationStatus("Compartiendo sesión...", "is-busy");
  try {
    const isEmail = target.includes("@");
    const response = hasAvailableApiBase()
      ? await authFetchJson("/api/podcaster/sessions/share", {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            ...(isEmail ? { targetEmail: target } : { targetUid: target })
          })
        })
      : await shareSessionWithUserDirect(sessionId, target, { isEmail });
    addChatMessage(
      "assistant",
      `Sesión compartida con ${response?.target?.email || response?.target?.uid || target}.`
    );
    setGenerationStatus("Sesión compartida", "is-live");
  } catch (error) {
    addChatMessage("system", `No se pudo compartir la sesión (${error.message}).`);
    setGenerationStatus("Error", "");
  }
}

async function shareSessionWithUserDirect(sessionId, target, options = {}) {
  if (options.isEmail) {
    throw new Error("Compartir por email requiere backend configurado. Usa UID por ahora.");
  }
  const uid = resolveCurrentUid();
  if (!uid) throw new Error("AUTH_REQUIRED");
  const targetUid = String(target || "").trim();
  if (!targetUid || targetUid === uid) {
    throw new Error("UID de destino no válido.");
  }
  const sessionRef = doc(firestoreDb, "podcaster_sessions", sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) {
    throw new Error("Sesión no encontrada. Guarda la sesión antes de compartir.");
  }
  const data = snap.data() || {};
  if (String(data.ownerId || "").trim() !== uid) {
    throw new Error("Solo el propietario puede compartir la sesión.");
  }
  const sharedWithIds = Array.isArray(data.sharedWithIds) ? data.sharedWithIds.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const sharedWith = Array.isArray(data.sharedWith) ? data.sharedWith : [];
  const nextIds = Array.from(new Set([...sharedWithIds, targetUid]));
  const nextShared = sharedWith.filter((entry) => String(entry?.uid || "").trim() !== targetUid);
  nextShared.push({
    uid: targetUid,
    email: null,
    sharedAt: nowIso(),
    sharedBy: uid
  });
  await setDoc(sessionRef, {
    sharedWithIds: nextIds,
    sharedWith: nextShared,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return {
    ok: true,
    sessionId,
    target: {
      uid: targetUid,
      email: null
    }
  };
}

async function deleteSessionFromCloud(sessionId = "") {
  const cleanId = String(sessionId || "").trim();
  if (!cleanId) throw new Error("Falta sessionId.");
  if (hasAvailableApiBase()) {
    return authFetchJson("/api/podcaster/sessions/delete", {
      method: "POST",
      body: JSON.stringify({ sessionId: cleanId })
    });
  }
  return deleteSessionFromCloudDirect(cleanId);
}

async function deleteSessionFromCloudDirect(sessionId = "") {
  const uid = resolveCurrentUid();
  if (!uid) throw new Error("AUTH_REQUIRED");
  const cleanId = String(sessionId || "").trim();
  if (!cleanId) throw new Error("Falta sessionId.");
  const sessionRef = doc(firestoreDb, "podcaster_sessions", cleanId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) {
    return { ok: true, sessionId: cleanId, deleted: false, reason: "not_found" };
  }
  const data = snap.data() || {};
  if (String(data.ownerId || "").trim() !== uid) {
    throw new Error("Solo el propietario puede eliminar la sesión.");
  }
  await deleteDoc(sessionRef);
  return { ok: true, sessionId: cleanId, deleted: true };
}

function collectGlobalSpeakerDraft(session = null) {
  const baseVoiceMap = getSpeakerVoiceMap(session);
  const baseExpressionMap = getSpeakerExpressionMap(session);
  const baseNameMap = getSpeakerNameMap(session);
  const baseScenarioMap = getSpeakerScenarioMap(session);
  const voiceMap = { ...baseVoiceMap };
  const expressionMap = { ...baseExpressionMap };
  const nameMap = { ...baseNameMap };
  const scenarioMap = { ...baseScenarioMap };
  const containers = [els.globalSpeakerSettings, els.podcastStudioInspectorRowEditor].filter(Boolean);
  if (!containers.length) return { voiceMap, expressionMap, nameMap, scenarioMap };
  containers.forEach((container) => container.querySelectorAll(".global-speaker-row").forEach((row) => {
    const host = String(row.dataset.hostName || "").trim();
    if (!host) return;
    const voiceInput = row.querySelector("[data-field='voiceName']");
    const expressionInput = row.querySelector("[data-field='expression']");
    const nameInput = row.querySelector("[data-field='speakerName']");
    const scenarioInput = row.querySelector("[data-field='scenario']");
    const rawVoice = String(voiceInput?.value || "").trim();
    const rawExpression = String(expressionInput?.value || "").trim();
    const rawName = String(nameInput?.value || "").trim();
    const rawScenario = String(scenarioInput?.value || "").replace(/\s+/g, " ").trim();
    voiceMap[host] = normalizeLiveVoiceName(rawVoice, resolveSpeakerVoiceName(host, session));
    expressionMap[host] = EXPRESSIONS.includes(rawExpression) ? rawExpression : (expressionMap[host] || "Neutral");
    nameMap[host] = rawName || nameMap[host] || DEFAULT_SPEAKER_NAME_MAP[host] || host;
    scenarioMap[host] = rawScenario || scenarioMap[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast";
  }));
  return { voiceMap, expressionMap, nameMap, scenarioMap };
}

function buildSpeakerSettingsMarkup(hosts = [], session = null, draft = null) {
  const sourceVoiceMap = draft?.voiceMap || getSpeakerVoiceMap(session);
  const sourceExpressionMap = draft?.expressionMap || getSpeakerExpressionMap(session);
  const sourceNameMap = draft?.nameMap || getSpeakerNameMap(session);
  const sourceScenarioMap = draft?.scenarioMap || getSpeakerScenarioMap(session);
  return hosts.map((host) => {
    const voiceName = normalizeLiveVoiceName(sourceVoiceMap[host], resolveSpeakerVoiceName(host, session));
    const expression = EXPRESSIONS.includes(sourceExpressionMap[host]) ? sourceExpressionMap[host] : "Neutral";
    const speakerName = String(sourceNameMap[host] || DEFAULT_SPEAKER_NAME_MAP[host] || host).trim() || host;
    const scenario = String(sourceScenarioMap[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").trim() || "Cabina premium de podcast";
    const isActive = String(podcastVideoState.activeSpeaker || "").trim() === host;
    return `
      <article class="global-speaker-row${isActive ? " is-active" : ""}" data-host-name="${escapeHtml(host)}">
        <strong>${escapeHtml(host)}</strong>
        <label class="global-speaker-field">
          <span>Nombre</span>
          <input data-field="speakerName" type="text" value="${escapeHtml(speakerName)}" placeholder="Nombre del locutor">
        </label>
        <label class="global-speaker-field">
          <span>Voz</span>
          <select data-field="voiceName">
            ${buildVoiceOptions(voiceName)}
          </select>
        </label>
        <label class="global-speaker-field">
          <span>Expresión</span>
          <select data-field="expression">
            ${buildOptions(EXPRESSIONS, expression)}
          </select>
        </label>
        <label class="global-speaker-field">
          <span>Escenario</span>
          <input data-field="scenario" type="text" value="${escapeHtml(scenario)}" placeholder="Ej: Cabina premium, loft editorial, radio nocturna">
        </label>
      </article>
    `;
  }).join("");
}

function renderGlobalSpeakerSettings(hosts = [], session = null, draft = null) {
  if (!els.globalSpeakerSettings) return;
  els.globalSpeakerSettings.innerHTML = buildSpeakerSettingsMarkup(hosts, session, draft);
  syncSpeakerIdentityActiveStates();
}

function syncGlobalConfigPanel(session = null) {
  if (!session) return;
  const hosts = getSpeakerOptions(session);
  if (els.speakerCountInput) {
    els.speakerCountInput.value = String(hosts.length);
  }
  if (els.globalApplyModeSelect && !els.globalApplyModeSelect.value) {
    els.globalApplyModeSelect.value = "all";
  }
  if (els.globalSceneSelectionInput) {
    const isSelectedMode = String(els.globalApplyModeSelect?.value || "all") === "selected";
    els.globalSceneSelectionInput.disabled = !isSelectedMode;
  }
  const firstRow = session?.script?.rows?.[0] || {};
  const cfg = normalizeDisfluencyConfig(session?.disfluencyDefaults || getRowDisfluencyConfig(firstRow));
  if (els.globalDisfluencyEnabled) {
    els.globalDisfluencyEnabled.checked = cfg.enabled;
  }
  if (els.globalStutterEnabled) {
    els.globalStutterEnabled.checked = cfg.stutterEnabled;
  }
  if (els.globalFillerLevel) {
    els.globalFillerLevel.value = String(cfg.fillerLevel);
  }
  if (els.globalErrorLevel) {
    els.globalErrorLevel.value = String(cfg.errorLevel);
  }
  if (els.globalStutterLevel) {
    els.globalStutterLevel.value = String(cfg.stutterLevel);
  }
  renderGlobalSpeakerSettings(hosts, session);
}

function readGlobalDisfluencyControls() {
  return normalizeDisfluencyConfig({
    enabled: Boolean(els.globalDisfluencyEnabled?.checked),
    stutterEnabled: Boolean(els.globalStutterEnabled?.checked),
    fillerLevel: Number(els.globalFillerLevel?.value ?? DEFAULT_DISFLUENCY_CONFIG.fillerLevel),
    errorLevel: Number(els.globalErrorLevel?.value ?? DEFAULT_DISFLUENCY_CONFIG.errorLevel),
    stutterLevel: Number(els.globalStutterLevel?.value ?? DEFAULT_DISFLUENCY_CONFIG.stutterLevel)
  });
}

function persistGlobalDisfluencyDraft() {
  const session = getActiveSession();
  if (!session) return;
  upsertActiveSession((current) => ({
    ...current,
    disfluencyDefaults: readGlobalDisfluencyControls()
  }), { render: false });
}

function syncSpeakerFieldAcrossPanels(host = "", field = "", value = "", sourceContainer = null) {
  [els.globalSpeakerSettings, els.podcastStudioInspectorRowEditor].filter(Boolean).forEach((container) => {
    if (!container || container === sourceContainer) return;
    const row = container.querySelector(`.global-speaker-row[data-host-name="${CSS.escape(String(host || "").trim())}"]`);
    const input = row?.querySelector(`[data-field='${String(field || "").trim()}']`);
    if (!input) return;
    input.value = String(value ?? "");
  });
}

function syncSpeakerIdentityActiveStates() {
  const activeSpeaker = String(podcastVideoState.activeSpeaker || "").trim();
  [els.globalSpeakerSettings, els.podcastStudioInspectorRowEditor].filter(Boolean).forEach((container) => {
    container.querySelectorAll(".global-speaker-row").forEach((row) => {
      row.classList.toggle("is-active", Boolean(activeSpeaker) && String(row.dataset.hostName || "").trim() === activeSpeaker);
    });
  });
}

function syncPodcastPortraitStripActiveStates(session = null) {
  if (!els.podcastPortraitStrip) return;
  const activeSession = session || getActiveSession();
  const activeSpeaker = String(podcastVideoState.activeSpeaker || "").trim();
  const activeScenarioId = String(getGlobalScenarioDeck(activeSession)?.activeId || "").trim();
  els.podcastPortraitStrip.querySelectorAll(".podcast-portrait-card[data-speaker]").forEach((card) => {
    card.classList.toggle("is-active", String(card.dataset.speaker || "").trim() === activeSpeaker);
  });
  els.podcastPortraitStrip.querySelectorAll(".podcast-scenario-card[data-scenario-id]").forEach((card) => {
    const isSelected = String(card.dataset.scenarioId || "").trim() === activeScenarioId;
    card.classList.toggle("is-selected", isSelected);
    const selectedChip = card.querySelector(".row-chip-selected");
    if (selectedChip) selectedChip.hidden = !isSelected;
  });
}

function persistSpeakerIdentityDraft() {
  const session = getActiveSession();
  if (!session) return;
  const hosts = getSpeakerOptions(session);
  const draft = collectGlobalSpeakerDraft(session);
  const voiceMap = {};
  const expressionMap = {};
  const nameMap = {};
  const scenarioMap = {};
  hosts.forEach((host) => {
    voiceMap[host] = normalizeLiveVoiceName(draft.voiceMap[host], resolveSpeakerVoiceName(host, session));
    expressionMap[host] = EXPRESSIONS.includes(draft.expressionMap[host]) ? draft.expressionMap[host] : "Neutral";
    nameMap[host] = String(draft.nameMap?.[host] || DEFAULT_SPEAKER_NAME_MAP[host] || host).trim() || host;
    scenarioMap[host] = String(draft.scenarioMap?.[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").trim() || "Cabina premium de podcast";
  });
  upsertActiveSession((current) => ({
    ...current,
    speakerVoiceMap: voiceMap,
    speakerExpressionMap: expressionMap,
    speakerNameMap: nameMap,
    speakerScenarioMap: scenarioMap,
    speakerScenarioVariantsMap: buildSpeakerScenarioVariantsMap(getSpeakerOptions(current), current?.speakerScenarioVariantsMap || {}, scenarioMap)
  }), { render: false });
}

function selectSpeakerScenarioVariant(speaker = "", scenarioId = "") {
  const session = getActiveSession();
  const host = String(speaker || "").trim();
  const variantId = String(scenarioId || "").trim();
  if (!session || !host || !variantId) return;
  upsertActiveSession((current) => {
    const hosts = getSpeakerOptions(current);
    const baseMap = getSpeakerScenarioMap(current);
    const currentMap = getSpeakerScenarioVariantsMap(current);
    const nextEntry = normalizeSpeakerScenarioVariantsEntry(currentMap[host], host, baseMap[host] || "");
    nextEntry.activeId = nextEntry.items.some((item) => item.id === variantId) ? variantId : nextEntry.activeId;
    return {
      ...current,
      speakerScenarioVariantsMap: {
        ...currentMap,
        [host]: nextEntry
      }
    };
  }, { render: false });
  renderPodcastPortraitStrip(getActiveSession());
}

function regenerateSpeakerScenarioVariant(speaker = "", scenarioId = "") {
  const session = getActiveSession();
  const host = String(speaker || "").trim();
  const variantId = String(scenarioId || "").trim();
  if (!session || !host || !variantId) return;
  upsertActiveSession((current) => {
    const baseMap = getSpeakerScenarioMap(current);
    const currentMap = getSpeakerScenarioVariantsMap(current);
    const entry = normalizeSpeakerScenarioVariantsEntry(currentMap[host], host, baseMap[host] || "");
    const index = entry.items.findIndex((item) => item.id === variantId);
    if (index < 0) return current;
    const item = entry.items[index];
    const nextRevision = Math.max(0, Number(item.revision) || 0) + 1;
    const nextItems = entry.items.map((candidate, idx) => (
      idx === index
        ? {
          ...candidate,
          revision: nextRevision,
          text: buildScenarioVariantText(baseMap[host] || entry.baseScenario || "", host, idx, nextRevision)
        }
        : candidate
    ));
    return {
      ...current,
      speakerScenarioVariantsMap: {
        ...currentMap,
        [host]: {
          ...entry,
          items: nextItems
        }
      }
    };
  }, { render: false });
  renderPodcastPortraitStrip(getActiveSession());
}

function selectGlobalScenarioVariant(scenarioId = "") {
  const variantId = String(scenarioId || "").trim();
  if (!variantId) return;
  upsertActiveSession((current) => {
    const deck = getGlobalScenarioDeck(current);
    return {
      ...current,
      globalScenarioDeck: {
        ...deck,
        activeId: deck.items.some((item) => item.id === variantId) ? variantId : deck.activeId
      }
    };
  }, { render: false });
  renderPodcastPortraitStrip(getActiveSession());
}

function regenerateGlobalScenarioVariant(scenarioId = "") {
  const variantId = String(scenarioId || "").trim();
  if (!variantId) return;
  upsertActiveSession((current) => {
    const deck = getGlobalScenarioDeck(current);
    const index = deck.items.findIndex((item) => item.id === variantId);
    if (index < 0) return current;
    const nextRevision = Math.max(0, Number(deck.items[index].revision) || 0) + 1;
    const nextItems = deck.items.map((item, idx) => (
      idx === index
        ? {
          ...item,
          revision: nextRevision,
          prompt: buildGlobalScenarioVariantText(idx, nextRevision),
          status: "idle",
          errorMessage: ""
        }
        : item
    ));
    return {
      ...current,
      globalScenarioDeck: normalizeGlobalScenarioDeck({
        activeId: deck.activeId,
        items: nextItems
      })
    };
  }, { render: false });
  renderPodcastPortraitStrip(getActiveSession());
}

async function generateGlobalScenarioImage(scenarioId = "", options = {}) {
  const session = getActiveSession();
  const variantId = String(scenarioId || "").trim();
  if (!session || !variantId) return null;
  const pendingKey = `${session.id}:${variantId}`;
  if (globalScenarioImagePending.has(pendingKey)) {
    throw new Error("La imagen del escenario ya se está generando.");
  }
  const deck = getGlobalScenarioDeck(session);
  const scenarioReferenceImage = getScenarioReferenceImageMap(session)[variantId] || null;
  const item = deck.items.find((entry) => entry.id === variantId) || null;
  if (!item) return null;
  const regenerate = options.regenerate === true;
  globalScenarioImagePending.add(pendingKey);
  try {
    upsertActiveSession((current) => {
      const currentDeck = getGlobalScenarioDeck(current);
      return {
        ...current,
        globalScenarioDeck: normalizeGlobalScenarioDeck({
          activeId: currentDeck.activeId,
          items: currentDeck.items.map((entry) => (
            entry.id === variantId
              ? {
                ...entry,
                status: "generating",
                errorMessage: ""
              }
              : entry
          ))
        })
      };
    }, { render: false });
    renderPodcastPortraitStrip(getActiveSession());
    const response = await authFetchJson("/api/podcaster/scenario-images/generate", {
      method: "POST",
      body: JSON.stringify({
        sessionId: session.id,
        scenarioId: item.id,
        title: item.title,
        prompt: item.prompt,
        referenceImageDataUrl: String(scenarioReferenceImage?.dataUrl || "").trim(),
        referenceImageName: String(scenarioReferenceImage?.name || "").trim(),
        regenerate,
        previousStoragePath: String(item.storagePath || "").trim(),
        model: PODCASTER_IMAGE_MODEL_DEFAULT,
        modelCandidates: buildPortraitImageModelChain()
      })
    });
  const image = response?.image && typeof response.image === "object" ? response.image : null;
  if (!image?.downloadUrl) {
    throw new Error("No se recibió imagen válida del escenario.");
  }
  upsertActiveSession((current) => {
    const currentDeck = getGlobalScenarioDeck(current);
    return {
      ...current,
      globalScenarioDeck: normalizeGlobalScenarioDeck({
        activeId: currentDeck.activeId,
        items: currentDeck.items.map((entry) => (
          entry.id === variantId
            ? {
              ...entry,
              downloadUrl: String(image.downloadUrl || "").trim(),
              storagePath: String(image.storagePath || "").trim(),
              mimeType: String(image.mimeType || "image/png").trim() || "image/png",
              updatedAt: String(image.updatedAt || nowIso()).trim() || nowIso(),
              model: String(image.model || PODCASTER_IMAGE_MODEL_DEFAULT).trim() || PODCASTER_IMAGE_MODEL_DEFAULT,
              status: "ready",
              errorMessage: ""
            }
            : entry
        ))
      })
    };
  }, { render: false });
  renderPodcastPortraitStrip(getActiveSession());
  return image;
  } catch (error) {
    upsertActiveSession((current) => {
      const currentDeck = getGlobalScenarioDeck(current);
      return {
        ...current,
        globalScenarioDeck: normalizeGlobalScenarioDeck({
          activeId: currentDeck.activeId,
          items: currentDeck.items.map((entry) => (
            entry.id === variantId
              ? {
                ...entry,
                status: "error",
                errorMessage: String(error?.message || "No se pudo generar la imagen del escenario.").trim()
              }
              : entry
          ))
        })
      };
    }, { render: false });
    renderPodcastPortraitStrip(getActiveSession());
    throw error;
  } finally {
    globalScenarioImagePending.delete(pendingKey);
  }
}

async function ensureGlobalScenarioImages(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return;
  const deck = getGlobalScenarioDeck(activeSession);
  for (const item of deck.items) {
    if (String(item.downloadUrl || "").trim()) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await generateGlobalScenarioImage(item.id, { regenerate: false });
    } catch (_) {
      break;
    }
  }
}

function setRowDisfluencyModalOpen(rowId = "") {
  rowDisfluencyConfigOpenId = String(rowId || "").trim() || null;
  if (els.rowDisfluencyModal) {
    els.rowDisfluencyModal.hidden = !rowDisfluencyConfigOpenId;
  }
  if (rowDisfluencyConfigOpenId) {
    syncRowDisfluencyModal(getActiveSession());
  }
}

function syncRowDisfluencyModal(session = null) {
  if (!els.rowDisfluencyModal || !rowDisfluencyConfigOpenId) return;
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const rowIndex = rows.findIndex((row) => row.id === rowDisfluencyConfigOpenId);
  const row = rowIndex >= 0 ? rows[rowIndex] : null;
  if (!row) {
    setRowDisfluencyModalOpen("");
    return;
  }
  const cfg = getRowDisfluencyConfig(row);
  if (els.rowDisfluencyModalTitle) {
    els.rowDisfluencyModalTitle.textContent = `Escena ${rowIndex + 1} · ${resolveSpeakerDisplayName(row.speaker, activeSession)}`;
  }
  const rowId = String(row.id || "");
  [els.modalDisfluencyEnabled, els.modalStutterEnabled, els.modalFillerLevel, els.modalErrorLevel, els.modalStutterLevel]
    .filter(Boolean)
    .forEach((input) => {
      input.dataset.rowId = rowId;
    });
  if (els.modalDisfluencyEnabled) {
    els.modalDisfluencyEnabled.checked = cfg.enabled;
  }
  if (els.modalStutterEnabled) {
    els.modalStutterEnabled.checked = cfg.stutterEnabled;
  }
  if (els.modalFillerLevel) {
    els.modalFillerLevel.value = String(cfg.fillerLevel);
  }
  if (els.modalErrorLevel) {
    els.modalErrorLevel.value = String(cfg.errorLevel);
  }
  if (els.modalStutterLevel) {
    els.modalStutterLevel.value = String(cfg.stutterLevel);
  }
}

function updateRowDisfluencyButtonState(rowId = "") {
  const key = String(rowId || "").trim();
  if (!key || !els.scriptTableBody) return;
  const row = getActiveSession()?.script?.rows?.find((item) => item.id === key) || null;
  const btn = els.scriptTableBody.querySelector(`[data-action="toggle-disfluency-config"][data-row-id="${key}"]`);
  if (!btn || !row) return;
  btn.classList.toggle("is-active", hasActiveDisfluencyConfig(getRowDisfluencyConfig(row)));
}

function setPodcastPlaybackStatus(text = "") {
  if (els.podcastPlaybackStatus) {
    els.podcastPlaybackStatus.textContent = text;
  }
}

function setPodcastNowPlaying(text = "") {
  if (els.podcastNowPlaying) {
    els.podcastNowPlaying.textContent = text;
  }
}

function setPodcastVideoStatus(text = "") {
  if (els.podcastVideoStatus) {
    els.podcastVideoStatus.textContent = text;
  }
}

function setPodcastVideoPortraitFallback(enabled = false) {
  const active = Boolean(enabled);
  podcastVideoState.stagePortraitFallback = active;
  const preview = els.podcastVideoStage?.querySelector(".podcast-video-preview");
  if (els.podcastVideoStage) {
    els.podcastVideoStage.classList.toggle("is-portrait-fallback", active);
  }
  if (preview) {
    preview.classList.toggle("is-portrait-fallback", active);
  }
  syncPodcastVideoSpeakerCardVisibility();
}

function syncPodcastVideoSpeakerCardVisibility() {
  if (!els.podcastVideoSpeakerCard) return;
  const hasSpeaker = Boolean(String(podcastVideoState.activeSpeaker || "").trim());
  els.podcastVideoSpeakerCard.hidden = !(podcastVideoState.enabled && (podcastVideoState.busy || podcastVideoState.stagePortraitFallback) && hasSpeaker);
}

function getPodcastVideoConfig(session = null) {
  return normalizePodcastVideoConfig((session || getActiveSession())?.podcastVideoConfig || {});
}

function getTimelineViewMode(session = null) {
  const cfg = getPodcastVideoConfig(session);
  return String(cfg.timelineViewMode || "tracks").trim().toLowerCase() === "normal" ? "normal" : "tracks";
}

function syncTimelineModeButtons(session = null) {
  const mode = getTimelineViewMode(session);
  if (els.podcastTimelineNormalModeBtn) {
    const isActive = mode === "normal";
    els.podcastTimelineNormalModeBtn.classList.toggle("is-active", isActive);
    els.podcastTimelineNormalModeBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
  if (els.podcastTimelineTracksModeBtn) {
    const isActive = mode === "tracks";
    els.podcastTimelineTracksModeBtn.classList.toggle("is-active", isActive);
    els.podcastTimelineTracksModeBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

function setTimelineViewMode(nextMode = "tracks") {
  const mode = String(nextMode || "").trim().toLowerCase() === "normal" ? "normal" : "tracks";
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    timelineViewMode: mode
  }));
  renderPodcastVideoShell(getActiveSession());
}

function getTransitionEdgeKey(fromRowId = "", toRowId = "") {
  const from = String(fromRowId || "").trim();
  const to = String(toRowId || "").trim();
  if (!from || !to) return "";
  return `${from}__${to}`;
}

function getTransitionForEdge(session = null, fromRowId = "", toRowId = "") {
  const edgeKey = getTransitionEdgeKey(fromRowId, toRowId);
  if (!edgeKey) return { type: "cut", durationMs: 0 };
  const cfg = getPodcastVideoConfig(session);
  const item = cfg.transitionsByEdge?.[edgeKey];
  if (!item || typeof item !== "object") return { type: "cut", durationMs: 0 };
  const type = STUDIO_TRANSITION_TYPES.includes(String(item.type || "").toLowerCase())
    ? String(item.type).toLowerCase()
    : "cut";
  return {
    type,
    durationMs: Math.max(0, Math.min(1200, Number(item.durationMs) || 0))
  };
}

async function playPodcastStageVideo(options = {}) {
  const restart = options.restart === true;
  const silent = options.silent === true;
  const playbackRateOverride = Number(options.playbackRate);
  const volumeOverride = Number(options.volume);
  const video = els.podcastActiveSpeakerVideo;
  const src = String(video?.dataset?.src || "").trim();
  if (!video || !src) {
    if (podcastVideoState.stagePortraitFallback) {
      updatePodcastVideoTransportUi();
      return true;
    }
    if (!silent) addChatMessage("system", "La escena no tiene video generado para reproducir.");
    return false;
  }
  try {
    if (restart) {
      try {
        video.currentTime = 0;
      } catch (_) {
        // noop
      }
    }
    const cfg = getPodcastVideoConfig();
    video.muted = false;
    const fallbackVolume = Math.max(0, Math.min(1, toFiniteNumber(cfg.clipVolume, 0) / 100));
    video.volume = Number.isFinite(volumeOverride) ? Math.max(0, Math.min(1, volumeOverride)) : fallbackVolume;
    const fallbackRate = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
    video.playbackRate = Number.isFinite(playbackRateOverride) ? Math.max(0.5, Math.min(2.25, playbackRateOverride)) : fallbackRate;
    video.preload = "auto";
    if (video.readyState < 2) {
      video.load();
      await new Promise((resolve) => {
        const onReady = () => {
          video.removeEventListener("canplay", onReady);
          resolve();
        };
        video.addEventListener("canplay", onReady, { once: true });
        setTimeout(() => {
          video.removeEventListener("canplay", onReady);
          resolve();
        }, 900);
      });
    }
    await safeMediaPlay(video);
    updatePodcastVideoTransportUi();
    return true;
  } catch (error) {
    try {
      const fallbackSrc = String(video?.dataset?.src || "").trim();
      if (fallbackSrc && /^https?:\/\//i.test(fallbackSrc)) {
        const fallbackResponse = await fetch(fallbackSrc, { method: "GET", mode: "same-origin" });
        if (fallbackResponse.status === 404 || fallbackResponse.status === 403) {
          const rowId = String(podcastVideoState.activeRowId || "").trim();
          const sessionId = String(getActiveSession()?.id || "").trim();
          const brokenKey = `${sessionId}:${rowId}`;
          if (rowId && !brokenDialogueVideoRows.has(brokenKey)) {
            brokenDialogueVideoRows.add(brokenKey);
            removeDialogueVideoForRow(rowId, { silent: true });
            if (!silent) {
              addChatMessage("system", "Video de escena no disponible o sin acceso, se limpió referencia rota.");
            }
          }
          updatePodcastVideoTransportUi();
          return false;
        }
        if (fallbackResponse.ok) {
          const blob = await fallbackResponse.blob();
          const blobUrl = URL.createObjectURL(blob);
          if (video.dataset.objectUrl) {
            URL.revokeObjectURL(video.dataset.objectUrl);
          }
          video.src = blobUrl;
          video.dataset.objectUrl = blobUrl;
          video.volume = Math.max(0, Math.min(1, Number(getPodcastVideoConfig().clipVolume || 0) / 100));
          video.load();
          await safeMediaPlay(video);
          updatePodcastVideoTransportUi();
          return true;
        }
      }
    } catch (_) {
      // keep original error handling
    }
    updatePodcastVideoTransportUi();
    if (!silent) {
      addChatMessage("system", `No se pudo reproducir el video de la escena (${String(error?.message || "error desconocido")}).`);
    }
    return false;
  }
}

function updatePodcastVideoTransportUi() {
  const hasClip = Boolean(String(els.podcastActiveSpeakerVideo?.dataset?.src || "").trim());
  const hasStageMedia = hasClip || podcastVideoState.stagePortraitFallback;
  const stagePlaying = Boolean(
    (els.podcastActiveSpeakerVideo && !els.podcastActiveSpeakerVideo.paused)
    || (rowPlaybackAudioEl && !rowPlaybackAudioEl.paused)
    || (podcastVideoState.audioEl && !podcastVideoState.audioEl.paused)
    || Object.values(podcastVideoState.montageAudioPlayers || {}).some((audio) => audio && !audio.paused)
  );
  const montagePlaying = Boolean(podcastVideoState.montageActive && !podcastVideoState.montagePaused);
  const pausedByStatus = /paus/i.test(String(els.podcastVideoStatus?.textContent || ""));
  const isPausedVisual = Boolean(podcastVideoState.montagePaused || (!stagePlaying && pausedByStatus));
  const rows = getActiveSession()?.script?.rows || [];
  if (els.podcastVideoPlayBtn) els.podcastVideoPlayBtn.disabled = !rows.length || (podcastVideoState.montageActive && !podcastVideoState.montagePaused);
  if (els.podcastVideoPauseBtn) els.podcastVideoPauseBtn.disabled = !podcastVideoState.montageActive && !stagePlaying;
  if (els.podcastVideoPlayBtn) {
    els.podcastVideoPlayBtn.classList.toggle("is-playing", stagePlaying || montagePlaying);
  }
  if (els.podcastVideoPauseBtn) {
    els.podcastVideoPauseBtn.classList.toggle("is-paused-blink", isPausedVisual);
  }
  if (els.podcastVideoStopBtn) els.podcastVideoStopBtn.disabled = !podcastVideoState.montageActive && !hasStageMedia && !stagePlaying;
  if (els.podcastVideoPrevBtn) els.podcastVideoPrevBtn.disabled = !rows.length;
  if (els.podcastVideoNextBtn) els.podcastVideoNextBtn.disabled = !rows.length;
  if (els.generateAllDialogueVideosBtn) els.generateAllDialogueVideosBtn.disabled = podcastVideoState.busy || !rows.length;
  if (els.regenerateAllDialogueVideosBtn) els.regenerateAllDialogueVideosBtn.disabled = podcastVideoState.busy || !rows.length;
  if (els.reorderTimelineTracksBtn) els.reorderTimelineTracksBtn.disabled = podcastVideoState.busy || getReorderableTimelineTrackIds(getActiveSession()).length < 2;
}

function resolveSceneNumberByRowId(rowId = "", session = null) {
  const key = String(rowId || "").trim();
  if (!key) return "?";
  const rows = session?.script?.rows || getActiveSession()?.script?.rows || [];
  const idx = rows.findIndex((row) => String(row?.id || "").trim() === key);
  return idx >= 0 ? String(idx + 1) : "?";
}

function resolveTargetVideoRowId(session = null, speakerHint = "") {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  if (!rows.length) return "";
  const activeKey = String(podcastVideoState.activeRowId || "").trim();
  if (activeKey && rows.some((row) => String(row?.id || "").trim() === activeKey)) {
    return activeKey;
  }
  const queueIndex = Number(podcastPlaybackState.currentQueueIndex);
  if (Number.isInteger(queueIndex) && queueIndex >= 0 && queueIndex < rows.length) {
    return String(rows[queueIndex]?.id || "").trim();
  }
  const speakerKey = String(speakerHint || podcastVideoState.activeSpeaker || "").trim();
  if (speakerKey) {
    const match = rows.find((row) => String(row?.speaker || "").trim() === speakerKey);
    if (match?.id) return String(match.id).trim();
  }
  return String(rows[0]?.id || "").trim();
}

function resolvePortraitForSpeaker(session = null, speaker = "") {
  const key = String(speaker || "").trim();
  if (!key) return null;
  const portraitMap = getSpeakerPortraitMap(session);
  return portraitMap[key] || findReusablePortraitForSpeaker(session, key) || null;
}

function closePodcastPortraitViewer() {
  if (els.podcastPortraitViewer) {
    els.podcastPortraitViewer.hidden = true;
  }
  if (els.podcastPortraitViewerImage) {
    els.podcastPortraitViewerImage.removeAttribute("src");
  }
  if (podcastPortraitViewerLastFocus && typeof podcastPortraitViewerLastFocus.focus === "function") {
    podcastPortraitViewerLastFocus.focus();
  }
  podcastPortraitViewerLastFocus = null;
}

function openPodcastPortraitViewer({ src = "", title = "", meta = "" } = {}) {
  const cleanSrc = String(src || "").trim();
  if (!cleanSrc || !els.podcastPortraitViewer || !els.podcastPortraitViewerImage) return;
  podcastPortraitViewerLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  els.podcastPortraitViewerImage.src = cleanSrc;
  els.podcastPortraitViewerImage.alt = String(title || "Retrato ampliado").trim() || "Retrato ampliado";
  if (els.podcastPortraitViewerTitle) {
    els.podcastPortraitViewerTitle.textContent = String(title || "Retrato").trim() || "Retrato";
  }
  if (els.podcastPortraitViewerMeta) {
    els.podcastPortraitViewerMeta.textContent = String(meta || "").trim() || "Locutor";
  }
  els.podcastPortraitViewer.hidden = false;
  els.podcastPortraitViewerCloseBtn?.focus?.();
}

function logPodcastRenderDebug(event = "", payload = {}) {
  if (!PODCAST_RENDER_DEBUG || !event) return;
  try {
    window.__podcasterDebug = window.__podcasterDebug || {};
    window.__podcasterDebug.lastRenderEvent = {
      event,
      at: new Date().toISOString(),
      ...payload
    };
    if (event === "audio-track-lane-render" || event === "audio-track-duration-fallback") {
      window.__podcasterDebug.audioTrack = {
        ...(window.__podcasterDebug.audioTrack || {}),
        [event]: {
          event,
          at: new Date().toISOString(),
          ...payload
        }
      };
    }
    console.debug(`[podcaster-render] ${event}`, payload);
  } catch (_) {
    // noop
  }
}

function logPodcastBatchDebug(event = "", payload = {}) {
  try {
    console.debug(`[podcaster-batch] ${event}`, payload);
  } catch (_) {
    // noop
  }
}

function buildPodcastTimelineStructureKey(session = null, mode = "") {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const clipMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const dialogueMap = getDialogueVideoMap(activeSession);
  const trackRows = ensureTimelineTracks(activeSession, { persist: false });
  return JSON.stringify({
    sessionId: String(activeSession?.id || "").trim(),
    mode: String(mode || "").trim(),
    rows: rows.map((row) => {
      const rowId = String(row?.id || "").trim();
      const clip = clipMap[rowId] || null;
      const dialogue = dialogueMap[rowId] || null;
      const segments = resolveDialogueVideoSegments(dialogue);
      const primarySegment = segments[0] || dialogue || null;
      return {
        id: rowId,
        speaker: String(row?.speaker || "").trim(),
        expression: String(row?.expression || "").trim(),
        durationSec: Number(row?.durationSec || 0),
        notes: String(row?.notes || "").trim(),
        mediaCue: String(row?.mediaCue || "").trim(),
        clip: clip ? {
          startMs: Number(clip.startMs || 0),
          trimInMs: Number(clip.trimInMs || 0),
          trimOutMs: Number(clip.trimOutMs || 0),
          sourceDurationMs: Number(clip.sourceDurationMs || 0),
          trackId: String(clip.trackId || "").trim(),
          zIndex: Number(clip.zIndex || 0)
        } : null,
        video: primarySegment ? {
          downloadUrl: String(primarySegment.downloadUrl || dialogue?.downloadUrl || "").trim(),
          storagePath: String(primarySegment.storagePath || dialogue?.storagePath || "").trim(),
          durationSec: Number(dialogue?.durationSec || 0),
          updatedAt: String(dialogue?.updatedAt || "").trim()
        } : null,
        audioReady: hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, rowId))
      };
    }),
    tracks: trackRows.map((track) => ({
      id: String(track?.id || "").trim(),
      label: String(track?.label || "").trim(),
      order: Number(track?.order || 0)
    }))
  });
}

function buildPodcastPortraitStripStructureKey(session = null) {
  const activeSession = session || getActiveSession();
  const hosts = getSpeakerOptions(activeSession);
  const deck = getGlobalScenarioDeck(activeSession);
  const voiceMap = getSpeakerVoiceMap(activeSession);
  const expressionMap = getSpeakerExpressionMap(activeSession);
  const nameMap = getSpeakerNameMap(activeSession);
  const speakerReferenceMap = getSpeakerReferenceImageMap(activeSession);
  const scenarioReferenceMap = getScenarioReferenceImageMap(activeSession);
  return JSON.stringify({
    sessionId: String(activeSession?.id || "").trim(),
    hosts: hosts.map((host) => {
      const portrait = resolvePortraitForSpeaker(activeSession, host);
      const reference = speakerReferenceMap[host] || null;
      return {
        host,
        voiceName: String(voiceMap[host] || "").trim(),
        expression: String(expressionMap[host] || "").trim(),
        displayName: String(nameMap[host] || "").trim(),
        portraitUrl: String(portrait?.downloadUrl || "").trim(),
        portraitStoragePath: String(portrait?.storagePath || "").trim(),
        portraitGenderGroup: String(portrait?.genderGroup || "").trim(),
        portraitVoiceName: String(portrait?.voiceName || "").trim(),
        referenceName: String(reference?.name || "").trim(),
        referenceUpdatedAt: String(reference?.updatedAt || "").trim()
      };
    }),
    scenarios: (deck?.items || []).map((item) => ({
      id: String(item?.id || "").trim(),
      title: String(item?.title || "").trim(),
      prompt: String(item?.prompt || "").trim(),
      downloadUrl: String(item?.downloadUrl || "").trim(),
      status: String(item?.status || "").trim(),
      errorMessage: String(item?.errorMessage || "").trim(),
      revision: Number(item?.revision || 0),
      referenceName: String(scenarioReferenceMap[String(item?.id || "").trim()]?.name || "").trim(),
      referenceUpdatedAt: String(scenarioReferenceMap[String(item?.id || "").trim()]?.updatedAt || "").trim()
    }))
  });
}

function removeDialogueVideoForRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  if (!key) return;
  const silent = options.silent === true;
  upsertActiveSession((current) => {
    const nextMap = { ...getDialogueVideoMap(current) };
    delete nextMap[key];
    return {
      ...current,
      dialogueVideoMap: nextMap
    };
  }, { render: false });
  const session = getActiveSession();
  if (String(podcastVideoState.activeRowId || "").trim() === key) {
    syncPodcastVideoStageMedia(session, key);
  }
  renderPodcastVideoShell(session);
  if (!silent) {
    setGenerationStatus(`Video eliminado de escena ${resolveSceneNumberByRowId(key, session)}`, "is-live");
  }
}

function attachPodcastTimelineScrollSync() {
  podcastTimelineScrollSyncCleanup?.();
  podcastTimelineScrollSyncCleanup = null;
  if (podcastTimelineScrollRafId) {
    cancelAnimationFrame(podcastTimelineScrollRafId);
    podcastTimelineScrollRafId = 0;
  }
  if (!els.podcastVideoTimeline || !els.podcastTimelineRuler) return;
  const markManualScrollIntent = () => {
    podcastTimelineManualScrollUntil = Date.now() + 1400;
  };
  const syncScroll = () => {
    if (podcastTimelineScrollRafId) return;
    podcastTimelineScrollRafId = requestAnimationFrame(() => {
      podcastTimelineScrollRafId = 0;
      if (!els.podcastVideoTimeline || !els.podcastTimelineRuler) return;
      els.podcastTimelineRuler.scrollLeft = els.podcastVideoTimeline.scrollLeft;
    });
  };
  els.podcastVideoTimeline.addEventListener("scroll", syncScroll, { passive: true });
  els.podcastVideoTimeline.addEventListener("wheel", markManualScrollIntent, { passive: true });
  els.podcastVideoTimeline.addEventListener("pointerdown", markManualScrollIntent, { passive: true });
  els.podcastVideoTimeline.addEventListener("touchstart", markManualScrollIntent, { passive: true });
  syncScroll();
  podcastTimelineScrollSyncCleanup = () => {
    els.podcastVideoTimeline?.removeEventListener("scroll", syncScroll);
    els.podcastVideoTimeline?.removeEventListener("wheel", markManualScrollIntent);
    els.podcastVideoTimeline?.removeEventListener("pointerdown", markManualScrollIntent);
    els.podcastVideoTimeline?.removeEventListener("touchstart", markManualScrollIntent);
    if (podcastTimelineScrollRafId) {
      cancelAnimationFrame(podcastTimelineScrollRafId);
      podcastTimelineScrollRafId = 0;
    }
  };
}

function disconnectPodcastTimelinePreviewObserver() {
  podcastTimelinePreviewObserver?.disconnect?.();
  podcastTimelinePreviewObserver = null;
}

function loadTimelinePreviewVideo(videoEl) {
  if (!videoEl) return;
  const nextSrc = String(videoEl.dataset.previewSrc || "").trim();
  if (!nextSrc) return;
  if (String(videoEl.getAttribute("src") || "").trim() === nextSrc && String(videoEl.preload || "").trim().toLowerCase() === "metadata") {
    return;
  }
  videoEl.preload = "metadata";
  videoEl.src = nextSrc;
  try {
    videoEl.load();
  } catch (_) {
    // noop
  }
}

function attachPodcastTimelinePreviewLoading() {
  disconnectPodcastTimelinePreviewObserver();
  if (!els.podcastVideoTimeline) return;
  const previewVideos = Array.from(
    els.podcastVideoTimeline.querySelectorAll(".podcast-video-scene-preview video[data-preview-src], .podcast-video-clip-preview video[data-preview-src]")
  );
  if (!previewVideos.length) return;
  const promotePreview = (event) => {
    const videoEl = event?.currentTarget?.tagName === "VIDEO"
      ? event.currentTarget
      : event?.target?.closest?.("video[data-preview-src]");
    loadTimelinePreviewVideo(videoEl);
  };
  previewVideos.forEach((videoEl) => {
    videoEl.addEventListener("mouseenter", promotePreview, { passive: true });
    videoEl.addEventListener("focus", promotePreview, { passive: true });
  });
  if (typeof IntersectionObserver !== "function") {
    previewVideos.forEach((videoEl, index) => {
      if (index < 6) loadTimelinePreviewVideo(videoEl);
    });
    return;
  }
  podcastTimelinePreviewObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const videoEl = entry.target;
      loadTimelinePreviewVideo(videoEl);
      observer.unobserve(videoEl);
    });
  }, {
    root: els.podcastVideoTimeline,
    rootMargin: "240px",
    threshold: 0.01
  });
  previewVideos.forEach((videoEl) => {
    podcastTimelinePreviewObserver.observe(videoEl);
  });
}

function renderPodcastVideoTimeline(session = null, options = {}) {
  if (!els.podcastVideoTimeline) return;
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const mode = getTimelineViewMode(activeSession);
  const renderReason = String(options.reason || "structure").trim() || "structure";
  syncTimelineModeButtons(activeSession);
  if (!rows.length) {
    els.podcastVideoTimeline.innerHTML = "";
    if (els.podcastTimelineRuler) els.podcastTimelineRuler.innerHTML = "";
    podcastTimelineScrollSyncCleanup?.();
    podcastTimelineScrollSyncCleanup = null;
    disconnectPodcastTimelinePreviewObserver();
    return;
  }
  const clipMap = ensureTimelineClipsByRowId(activeSession);
  const dialogueMap = getDialogueVideoMap(activeSession);
  const isBulkRegenAll = podcastVideoState.bulkVideoGenerationActive && podcastVideoState.bulkVideoGenerationMode === "all";
  const timelineDurationMs = getTimelineTotalDurationMs(activeSession);
  const canvasWidthPx = Math.max(860, Math.round((timelineDurationMs / 1000) * STUDIO_TIMELINE_PIXELS_PER_SEC) + 120);
  const trackRows = ensureTimelineTracks(activeSession, { persist: false });
  const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
  const structureKey = buildPodcastTimelineStructureKey(activeSession, mode);
  const canReuseStructure = (
    podcastRenderState.timelineStructureKey === structureKey
    && podcastRenderState.timelineMode === mode
    && els.podcastVideoTimeline.childElementCount > 0
  );

  if (
    canReuseStructure
    && options.force !== true
    && (renderReason === "selection" || renderReason === "playback" || renderReason === "ephemeral")
  ) {
    logPodcastRenderDebug("timeline-structure-skip", { reason: renderReason });
    syncTimelineModeButtons(activeSession);
    syncPodcastTimelineSelectionUi(activeSession);
    syncTimelineGapSelectionUi();
    syncPodcastTimelinePlayhead(activeSession);
    if (els.podcastTimelineRuler) {
      const totalSec = Math.ceil(timelineDurationMs / 1000);
      const expectedMarks = totalSec + 1;
      const currentMarks = els.podcastTimelineRuler.querySelectorAll(".podcast-timeline-ruler-mark").length;
      if (currentMarks !== expectedMarks) {
        logPodcastRenderDebug("timeline-ruler-guard", { reason: renderReason, currentMarks, expectedMarks });
      }
    }
    return;
  } else if (renderReason === "selection" || renderReason === "playback" || renderReason === "ephemeral") {
    logPodcastRenderDebug("timeline-guard-structural-from-ephemeral", { reason: renderReason });
  }

  if (els.podcastTimelineRuler) {
    const marks = [];
    const totalSec = Math.ceil(timelineDurationMs / 1000);
    for (let sec = 0; sec <= totalSec; sec += 1) {
      const leftPx = timelineMsToPx(sec * 1000);
      marks.push(`<div class="podcast-timeline-ruler-mark" style="left:${leftPx}px"><span>${escapeHtml(secondsToClock(sec))}</span></div>`);
    }
    els.podcastTimelineRuler.innerHTML = `<div class="podcast-timeline-ruler-inner" style="width:${canvasWidthPx}px">${marks.join("")}</div>`;
  }

  if (mode === "normal") {
    const timelineItemsHtml = rows.map((row, index) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId) return "";
      const generatedClip = dialogueMap[rowId] || null;
      const segments = resolveDialogueVideoSegments(generatedClip);
      const primarySegment = segments[0] || null;
      const videoSrc = resolveStorageVideoUrl(
        primarySegment?.downloadUrl || generatedClip?.downloadUrl || "",
        primarySegment?.storagePath || generatedClip?.storagePath || ""
      );
      const portrait = resolvePortraitForSpeaker(activeSession, row?.speaker);
      const portraitSrc = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
      const timelineClip = clipMap[rowId] || null;
      const isActive = rowId === String(podcastVideoState.activeRowId || "").trim();
      const audioReady = hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, rowId));
      const speakerName = resolveSpeakerDisplayName(String(row?.speaker || "").trim(), activeSession);
      const nextRowId = String(rows[index + 1]?.id || "").trim();
      const transition = nextRowId ? getTransitionForEdge(activeSession, rowId, nextRowId) : { type: "cut", durationMs: 0 };
      const hasTransition = nextRowId && String(transition.type || "cut") !== "cut";
      return `
        <div class="podcast-video-timeline-item" data-row-id="${escapeHtml(rowId)}">
          <article class="podcast-video-scene-card${videoSrc ? " has-video" : ""}${isActive ? " is-active" : ""}" tabindex="-1">
            <button class="podcast-video-scene-preview" type="button" data-action="timeline-select-scene" data-row-id="${escapeHtml(rowId)}" title="Seleccionar escena ${index + 1}">
              ${videoSrc
                ? `<video data-preview-src="${escapeHtml(videoSrc)}" preload="none" muted playsinline crossorigin="anonymous"${portraitSrc ? ` poster="${escapeHtml(portraitSrc)}"` : ""}></video>`
                : portraitSrc
                  ? `<img src="${escapeHtml(portraitSrc)}" alt="${escapeHtml(`Retrato de ${speakerName}`)}" loading="lazy">`
                  : `<div class="podcast-video-scene-empty">Sin video</div>`}
            </button>
            <div class="podcast-video-scene-meta">
              <strong>Escena ${index + 1} · ${escapeHtml(speakerName)}</strong>
              <span>${videoSrc ? "Video generado" : "Pendiente por generar"} · ${audioReady ? "Voz lista" : "Sin voz"} · ${secondsToClock(getTimelineClipEffectiveDurationMs(timelineClip) / 1000)}</span>
            </div>
            <div class="podcast-video-scene-actions">
              <button class="row-icon-btn" type="button" data-action="timeline-play-scene-video" data-row-id="${escapeHtml(rowId)}" title="Reproducir escena"><i class="fas fa-play"></i></button>
              <button class="row-icon-btn${isBulkRegenAll ? " is-loading" : ""}" type="button" data-action="timeline-generate-scene-video" data-row-id="${escapeHtml(rowId)}" title="${videoSrc ? "Regenerar" : "Generar"} video"${isBulkRegenAll ? " disabled" : ""}><i class="fas ${isBulkRegenAll ? "fa-spinner spinner-icon" : (videoSrc ? "fa-sync-alt" : "fa-film")}"></i></button>
              <button class="row-icon-btn" type="button" data-action="timeline-delete-scene-video" data-row-id="${escapeHtml(rowId)}" title="Eliminar video"${videoSrc ? "" : " disabled"}><i class="fas fa-trash"></i></button>
            </div>
          </article>
          ${nextRowId
            ? `<button class="podcast-transition-card${hasTransition ? " is-active" : ""}" type="button" data-action="timeline-open-transition" data-from-row-id="${escapeHtml(rowId)}" data-to-row-id="${escapeHtml(nextRowId)}" title="Configurar transición">${hasTransition ? `<i class="fas fa-magic"></i>` : "+"}</button>`
            : ""}
        </div>
      `;
    }).join("");
    podcastRenderState.timelinePreviewCreateCount += (timelineItemsHtml.match(/data-preview-src=/g) || []).length;
    els.podcastVideoTimeline.innerHTML = `<div class="podcast-video-timeline-canvas is-normal" data-playhead-offset="0" style="width:${canvasWidthPx}px"><div id="podcastTimelinePlayhead" class="podcast-timeline-playhead" aria-hidden="true"><button class="podcast-timeline-playhead-grip" type="button" data-action="timeline-drag-playhead" aria-label="Mover marcador de tiempo"></button></div><div class="podcast-video-timeline-list">${timelineItemsHtml}</div></div>`;
    podcastRenderState.timelineStructureKey = structureKey;
    podcastRenderState.timelineMode = mode;
    podcastRenderState.timelineStructureRenderCount += 1;
    logPodcastRenderDebug("timeline-structure-render", {
      reason: renderReason,
      mode,
      renderCount: podcastRenderState.timelineStructureRenderCount,
      previewNodes: podcastRenderState.timelinePreviewCreateCount
    });
    attachPodcastTimelineScrollSync();
    attachPodcastTimelinePreviewLoading();
    syncPodcastTimelinePlayhead(activeSession);
    syncCustomTooltips(els.podcastVideoTimeline);
    return;
  }

  const timelineTrackBlocks = [];
  trackRows.forEach((track, trackIndex) => {
    timelineTrackBlocks.push(`<div class="podcast-video-track-drop-zone" data-drop-track-index="${trackIndex}" aria-hidden="true"></div>`);
    const trackId = String(track?.id || "").trim();
    const trackLabel = String(track?.label || `Track ${trackIndex + 1}`).trim() || `Track ${trackIndex + 1}`;
    const trackItems = rows
      .map((row) => {
        const rowId = String(row?.id || "").trim();
        if (!rowId) return null;
        const timelineClip = clipMap[rowId];
        if (!timelineClip || String(timelineClip.trackId || "").trim() !== trackId) return null;
        const clipLeftPx = timelineMsToPx(Number(timelineClip?.startMs || 0));
        const clipWidthPx = Math.max(STUDIO_TIMELINE_MIN_CLIP_PX, timelineMsToPx(getTimelineClipEffectiveDurationMs(timelineClip)));
        return {
          row,
          rowId,
          index: Number(rowIndexById.get(rowId) || 0),
          timelineClip,
          clipLeftPx,
          clipWidthPx,
          clipEndPx: clipLeftPx + clipWidthPx
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(a.timelineClip.startMs || 0) - Number(b.timelineClip.startMs || 0) || a.index - b.index);
    timelineTrackBlocks.push(`
    <section class="podcast-video-track-row" data-track-id="${escapeHtml(trackId)}" data-track-index="${trackIndex}">
      <div class="podcast-video-track-label">${escapeHtml(trackLabel)}</div>
      <div class="podcast-video-track-lane" data-track-id="${escapeHtml(trackId)}" data-track-index="${trackIndex}">
        ${trackItems.map(({ row, rowId, index, timelineClip, clipLeftPx, clipWidthPx }) => {
          const generatedClip = dialogueMap[rowId] || null;
          const segments = resolveDialogueVideoSegments(generatedClip);
          const primarySegment = segments[0] || null;
          const videoSrc = resolveStorageVideoUrl(
            primarySegment?.downloadUrl || generatedClip?.downloadUrl || "",
            primarySegment?.storagePath || generatedClip?.storagePath || ""
          );
          const portrait = resolvePortraitForSpeaker(activeSession, row?.speaker);
          const portraitSrc = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
          const leftPx = Number(clipLeftPx || 0);
          const widthPx = Math.max(STUDIO_TIMELINE_MIN_CLIP_PX, Number(clipWidthPx || 0));
          const sourceDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(timelineClip?.sourceDurationMs || getTimelineClipEffectiveDurationMs(timelineClip)));
          const trimMaskLeftPct = Math.max(0, Math.min(100, (Math.max(0, Number(timelineClip?.trimInMs || 0)) / sourceDurationMs) * 100));
          const trimMaskRightPct = Math.max(0, Math.min(100, (Math.max(0, sourceDurationMs - Number(timelineClip?.trimOutMs || sourceDurationMs)) / sourceDurationMs) * 100));
          const hasTrimMask = trimMaskLeftPct > 0.05 || trimMaskRightPct > 0.05;
          const isActive = rowId === String(podcastVideoState.activeRowId || "").trim();
          const audioReady = hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, rowId));
          const speakerName = resolveSpeakerDisplayName(String(row?.speaker || "").trim(), activeSession);
          return `
            <article class="podcast-video-timeline-clip${videoSrc ? " has-video" : ""}${isActive ? " is-active" : ""}${hasTrimMask ? " is-trimmed" : ""}" data-row-id="${escapeHtml(rowId)}" tabindex="-1" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px;z-index:${Math.max(1, Number(timelineClip?.zIndex || index + 1))};--trim-mask-left:${trimMaskLeftPct.toFixed(3)}%;--trim-mask-right:${trimMaskRightPct.toFixed(3)}%">
              <button class="podcast-video-clip-handle start" type="button" data-action="timeline-trim-start" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar inicio"></button>
              <button class="podcast-video-clip-handle end" type="button" data-action="timeline-trim-end" data-row-id="${escapeHtml(rowId)}" aria-label="Recortar final"></button>
              <div class="podcast-video-clip-body" data-action="timeline-drag-clip" data-row-id="${escapeHtml(rowId)}">
                <button class="podcast-video-clip-preview" type="button" data-action="timeline-select-scene" data-row-id="${escapeHtml(rowId)}" title="Seleccionar escena ${index + 1}">
                  ${videoSrc
                    ? `<video data-preview-src="${escapeHtml(videoSrc)}" preload="none" muted playsinline crossorigin="anonymous"${portraitSrc ? ` poster="${escapeHtml(portraitSrc)}"` : ""}></video>`
                    : portraitSrc
                      ? `<img src="${escapeHtml(portraitSrc)}" alt="${escapeHtml(`Retrato de ${speakerName}`)}" loading="lazy">`
                      : `<div class="podcast-video-scene-empty">Sin video</div>`}
                </button>
                <div class="podcast-video-clip-meta">
                  <strong>Escena ${index + 1} · ${escapeHtml(speakerName)}</strong>
                  <span>${videoSrc ? "Video generado" : "Sin video"} · ${audioReady ? "Voz lista" : "Sin voz"} · ${secondsToClock(getTimelineClipEffectiveDurationMs(timelineClip) / 1000)}</span>
                </div>
                <div class="podcast-video-clip-actions">
                  <button class="row-icon-btn" type="button" data-action="timeline-play-scene-video" data-row-id="${escapeHtml(rowId)}" title="Reproducir escena"><i class="fas fa-play"></i></button>
                  <button class="row-icon-btn${isBulkRegenAll ? " is-loading" : ""}" type="button" data-action="timeline-generate-scene-video" data-row-id="${escapeHtml(rowId)}" title="${videoSrc ? "Regenerar" : "Generar"} video"${isBulkRegenAll ? " disabled" : ""}><i class="fas ${isBulkRegenAll ? "fa-spinner spinner-icon" : (videoSrc ? "fa-sync-alt" : "fa-film")}"></i></button>
                  <button class="row-icon-btn" type="button" data-action="timeline-delete-scene-video" data-row-id="${escapeHtml(rowId)}" title="Eliminar video"${videoSrc ? "" : " disabled"}><i class="fas fa-trash"></i></button>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `);
  });
  timelineTrackBlocks.push(`<div class="podcast-video-track-drop-zone" data-drop-track-index="${trackRows.length}" aria-hidden="true"></div>`);
  const panelTrack = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
  const uploadedTrackGroups = panelMusicState.selectedTrackKind === "uploaded" ? groupUploadedPanelMusicSegmentsByTrack(activeSession) : [];
  const uploadedTracks = panelMusicState.selectedTrackKind === "uploaded" ? getPanelMusicUploadedTracks() : [];
  const uploadedSegments = uploadedTrackGroups.flatMap((group) => group.segments || []);
  const panelTrackReady = panelMusicState.sourceType === "track" && Boolean(
    String(panelTrack?.downloadUrl || "").trim()
    || String(panelTrack?.localDataUrl || "").trim()
    || String(panelTrack?.storagePath || "").trim()
  );
  const panelTrackDurationSec = getPanelMusicTrackDurationSec(panelTrack);
  const panelTrackStartOffsetMs = Math.max(0, Number(panelTrack?.startOffsetMs || 0) || 0);
  const panelTrackTrimInMs = Math.max(0, Number(panelTrack?.trimInMs || 0) || 0);
  const panelTrackTrimOutMs = Math.max(panelTrackTrimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(panelTrack?.trimOutMs || Math.round(panelTrackDurationSec * 1000) || 0) || 0);
  const panelTrackEffectiveLoopMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, panelTrackTrimOutMs - panelTrackTrimInMs);
  if (panelTrackReady && panelTrackDurationSec <= 0.05) {
    ensurePanelMusicTrackDuration(panelMusicState.selectedTrackKind).catch(() => {});
  }
  const panelTrackLoopCount = panelTrackReady ? getPanelMusicLoopCount(activeSession, panelTrack) : 1;
  const panelTrackLoopSegments = panelTrackReady ? getPanelMusicLoopSegments(activeSession, panelTrack) : [];
  const panelTrackLoopWidthPx = panelTrackReady && panelTrackDurationSec > 0.05
    ? Math.max(STUDIO_AUDIO_TRACK_MIN_LOOP_PX, timelineMsToPx(panelTrackEffectiveLoopMs))
    : Math.max(STUDIO_AUDIO_TRACK_MIN_LOOP_PX, Math.min(160, canvasWidthPx - 4));
  const panelMutedLoopIndexes = new Set(normalizePanelMusicMutedLoopIndexes(panelTrack?.mutedLoopIndexes || []));
  const panelLoopGapPx = 6;
  const panelTrackLabel = panelTrackReady
    ? (String(panelTrack?.name || "Música de fondo").trim() || "Música de fondo")
    : "Sin audio";
  const panelTrackTitle = panelTrackReady
    ? `Música de fondo lista: ${panelTrackLabel}`
    : "Sin audio de fondo cargado";
  const montageMusicVolume = Math.max(0, Math.min(100, Number(panelMusicState.montageVolume ?? panelMusicState.volume ?? 22)));
  const montageStabilize = panelMusicState.stabilize === true;
  logPodcastRenderDebug("audio-track-lane-render", {
    sourceType: panelMusicState.sourceType,
    selectedTrackKind: panelMusicState.selectedTrackKind,
    panelTrackReady,
    panelTrackName: String(panelTrack?.name || ""),
    panelTrackDurationSec,
    panelTrackStartOffsetMs,
    panelTrackTrimInMs,
    panelTrackTrimOutMs,
    panelTrackEffectiveLoopMs,
    panelTrackLoopCount,
    panelTrackLoopSegments,
    panelTrackLoopWidthPx,
    canvasWidthPx,
    mutedLoopIndexes: Array.from(panelMutedLoopIndexes)
  });
  const uploadedGroupMap = new Map(uploadedTrackGroups.map((group) => [Math.max(0, Math.floor(Number(group?.trackIndex || 0) || 0)), group]));
  const renderUploadedGroupRow = (groupTrack = null, rowIndex = 0) => {
    const safeTrack = normalizePanelMusicTrack(groupTrack);
    const trackIndex = Math.max(0, Math.floor(Number(rowIndex) || 0));
    const group = uploadedGroupMap.get(trackIndex) || null;
    const groupSegments = Array.isArray(group?.segments) ? group.segments : [];
    const groupMutedLoopIndexes = new Set(normalizePanelMusicMutedLoopIndexes(safeTrack?.mutedLoopIndexes || []));
    const rowTitle = `${String(safeTrack?.slotLabel || `Audio ${trackIndex + 1}`).trim() || `Audio ${trackIndex + 1}`} · Bloqueado`;
    const chipsHtml = groupSegments.map((segment) => {
      const loopIndex = Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0));
      const leftPx = Math.max(0, timelineMsToPx(Number(segment?.startMs || 0) || 0));
      const remainingWidthPx = Math.max(0, canvasWidthPx - 4 - leftPx);
      const widthPx = Math.max(
        STUDIO_AUDIO_TRACK_MIN_LOOP_PX,
        Math.min(
          Math.max(
            STUDIO_AUDIO_TRACK_MIN_LOOP_PX,
            timelineMsToPx(Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(segment?.endMs || 0) - Number(segment?.startMs || 0))) - panelLoopGapPx
          ),
          remainingWidthPx
        )
      );
      const isMutedLoop = groupMutedLoopIndexes.has(loopIndex);
      const isActiveLoop = panelMusicState.selectedTrackKind === "uploaded"
        && String(panelMusicState.track?.slotLabel || "").trim() === String(safeTrack?.slotLabel || group?.slotLabel || "").trim()
        && Number(podcastAudioTrackUiState.activeLoopIndex) === loopIndex;
      const title = String(group?.segments?.length || 0) > 1
        ? `${safeTrack?.slotLabel || `Audio ${trackIndex + 1}`} · Loop ${loopIndex + 1}`
        : `${safeTrack?.slotLabel || `Audio ${trackIndex + 1}`} · ${safeTrack?.name || "Audio"}`;
      return `
        <div class="podcast-audio-timeline-chip has-audio${isMutedLoop ? " is-muted-loop" : ""}${isActiveLoop ? " is-active" : ""}" data-action="timeline-select-audio-loop" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" tabindex="0" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px" title="${escapeHtml(title)}">
          <button class="podcast-video-clip-handle start" type="button" data-action="timeline-audio-trim-start" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" aria-label="Recortar inicio de audio"></button>
          <button class="podcast-video-clip-handle end" type="button" data-action="timeline-audio-trim-end" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" aria-label="Recortar final de audio"></button>
          <button class="podcast-audio-loop-mute-btn" type="button" data-action="timeline-toggle-audio-loop-mute" data-loop-index="${loopIndex}" data-track-index="${trackIndex}" title="${isMutedLoop ? "Activar loop" : "Mutear loop"}">
            <i class="fas ${isMutedLoop ? "fa-volume-mute" : "fa-volume-up"}" aria-hidden="true"></i>
          </button>
          <span>${escapeHtml(`${safeTrack?.slotLabel || `Audio ${trackIndex + 1}`} · ${groupSegments.length > 1 ? `Loop ${loopIndex + 1}` : (safeTrack?.name || "Audio")} · ${montageMusicVolume}% · ${montageStabilize ? "Estabilizado" : "Sin estabilizar"}`)}</span>
        </div>
      `;
    }).join("");
    return `
      <section class="podcast-video-track-row podcast-audio-track-row is-locked" data-track-id="audio-track-uploaded-${trackIndex}" data-track-index="-1">
        <div class="podcast-video-track-label is-locked">
          <span>${escapeHtml(rowTitle)}</span>
          ${rowIndex === 0 ? `<button class="row-icon-btn podcast-audio-track-config-btn" type="button" data-action="open-audio-track-mix" title="Configurar mezcla de audio">
            <i class="fas fa-sliders-h"></i>
          </button>` : ""}
        </div>
        <div class="podcast-video-track-lane podcast-audio-track-lane is-locked" data-track-id="audio-track-uploaded-${trackIndex}" data-track-index="-1">
          ${chipsHtml}
        </div>
      </section>
    `;
  };
  if (panelMusicState.selectedTrackKind === "uploaded" && uploadedTracks.length) {
    timelineTrackBlocks.push(uploadedTracks.map((track, rowIndex) => renderUploadedGroupRow(track, rowIndex)).join(""));
  } else {
    timelineTrackBlocks.push(`
      <section class="podcast-video-track-row podcast-audio-track-row is-locked" data-track-id="audio-track" data-track-index="-1">
        <div class="podcast-video-track-label is-locked">
          <span>Audio de fondo · Bloqueado</span>
          <button class="row-icon-btn podcast-audio-track-config-btn" type="button" data-action="open-audio-track-mix" title="Configurar mezcla de audio">
            <i class="fas fa-sliders-h"></i>
          </button>
        </div>
        <div class="podcast-video-track-lane podcast-audio-track-lane is-locked" data-track-id="audio-track" data-track-index="-1">
          ${panelTrackReady
            ? panelTrackLoopSegments.map((segment) => {
              const loopIndex = Math.max(0, Number(segment?.loopIndex || 0) || 0);
              const segmentLoopMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(segment?.effectiveLoopMs || panelTrackEffectiveLoopMs) || panelTrackEffectiveLoopMs);
              const leftPx = panelTrackDurationSec > 0.05
                ? Math.max(0, timelineMsToPx(Number(segment?.startMs || 0) || 0) + (loopIndex * panelLoopGapPx))
                : 0;
              const remainingWidthPx = Math.max(0, canvasWidthPx - 4 - leftPx);
              const widthPx = panelTrackDurationSec > 0.05
                ? Math.max(STUDIO_AUDIO_TRACK_MIN_LOOP_PX, Math.min(Math.max(STUDIO_AUDIO_TRACK_MIN_LOOP_PX, timelineMsToPx(segmentLoopMs) - panelLoopGapPx), remainingWidthPx))
                : Math.max(STUDIO_AUDIO_TRACK_MIN_LOOP_PX, Math.min(160, canvasWidthPx - 4));
              if (widthPx <= 0) return "";
              const isMutedLoop = panelMutedLoopIndexes.has(loopIndex);
              const isActiveLoop = Number(podcastAudioTrackUiState.activeLoopIndex) === loopIndex;
              return `
                <div class="podcast-audio-timeline-chip has-audio${isMutedLoop ? " is-muted-loop" : ""}${isActiveLoop ? " is-active" : ""}" data-action="timeline-select-audio-loop" data-loop-index="${loopIndex}" tabindex="0" style="left:${leftPx.toFixed(3)}px;width:${widthPx.toFixed(3)}px" title="${escapeHtml(`${panelTrackTitle} · Loop ${loopIndex + 1}`)}">
                  <button class="podcast-video-clip-handle start" type="button" data-action="timeline-audio-trim-start" data-loop-index="${loopIndex}" aria-label="Recortar inicio de audio"></button>
                  <button class="podcast-video-clip-handle end" type="button" data-action="timeline-audio-trim-end" data-loop-index="${loopIndex}" aria-label="Recortar final de audio"></button>
                  <button class="podcast-audio-loop-mute-btn" type="button" data-action="timeline-toggle-audio-loop-mute" data-loop-index="${loopIndex}" title="${isMutedLoop ? "Activar loop" : "Mutear loop"}">
                    <i class="fas ${isMutedLoop ? "fa-volume-mute" : "fa-volume-up"}" aria-hidden="true"></i>
                  </button>
                  <span data-action="timeline-drag-audio-track" data-loop-index="${loopIndex}">${escapeHtml(`${panelTrackLabel} · Loop ${loopIndex + 1} · ${montageMusicVolume}% · ${montageStabilize ? "Estabilizado" : "Sin estabilizar"}`)}</span>
                </div>
              `;
            }).join("")
            : `<div class="podcast-audio-timeline-chip is-missing" style="left:0;width:${Math.max(STUDIO_AUDIO_TRACK_MIN_LOOP_PX, Math.min(160, canvasWidthPx - 4))}px" title="${escapeHtml(panelTrackTitle)}">
                <i class="fas fa-lock" aria-hidden="true"></i>
                <span>${escapeHtml(panelTrackLabel)} · ${escapeHtml(`${montageMusicVolume}%`)} · ${montageStabilize ? "Estabilizado" : "Sin estabilizar"}</span>
              </div>`}
        </div>
      </section>
    `);
  }
  const timelineHtml = timelineTrackBlocks.join("");

  podcastRenderState.timelinePreviewCreateCount += (timelineHtml.match(/data-preview-src=/g) || []).length;
  els.podcastVideoTimeline.innerHTML = `<div class="podcast-video-timeline-canvas" data-playhead-offset="112" style="width:${canvasWidthPx}px"><div id="podcastTimelinePlayhead" class="podcast-timeline-playhead" aria-hidden="true"><button class="podcast-timeline-playhead-grip" type="button" data-action="timeline-drag-playhead" aria-label="Mover marcador de tiempo"></button></div>${timelineHtml}</div>`;
  podcastRenderState.timelineStructureKey = structureKey;
  podcastRenderState.timelineMode = mode;
  podcastRenderState.timelineStructureRenderCount += 1;
  logPodcastRenderDebug("timeline-structure-render", {
    reason: renderReason,
    mode,
    renderCount: podcastRenderState.timelineStructureRenderCount,
    previewNodes: podcastRenderState.timelinePreviewCreateCount
  });
  attachPodcastTimelineScrollSync();
  attachPodcastTimelinePreviewLoading();
  syncTimelineGapSelectionUi();
  syncPodcastTimelinePlayhead(activeSession);
  syncCustomTooltips(els.podcastVideoTimeline);
}

function syncPodcastTimelineSelectionUi(session = null) {
  if (!els.podcastVideoTimeline) return;
  const activeSession = session || getActiveSession();
  const activeRowId = String(podcastVideoState.activeRowId || "").trim();
  const activeEdge = getActiveTransitionEdge(activeSession);
  els.podcastVideoTimeline.querySelectorAll(".podcast-video-scene-card.is-active, .podcast-video-timeline-clip.is-active").forEach((node) => {
    node.classList.remove("is-active");
  });
  if (activeRowId) {
    els.podcastVideoTimeline.querySelectorAll(`[data-row-id="${CSS.escape(activeRowId)}"]`).forEach((node) => {
      if (node.classList.contains("podcast-video-scene-card") || node.classList.contains("podcast-video-timeline-clip")) {
        node.classList.add("is-active");
      }
    });
  }
  els.podcastVideoTimeline.querySelectorAll(".podcast-transition-card.is-active").forEach((node) => {
    node.classList.remove("is-active");
  });
  if (activeEdge.fromRowId && activeEdge.toRowId) {
    const transitionBtn = els.podcastVideoTimeline.querySelector(
      `.podcast-transition-card[data-from-row-id="${CSS.escape(activeEdge.fromRowId)}"][data-to-row-id="${CSS.escape(activeEdge.toRowId)}"]`
    );
    transitionBtn?.classList.add("is-active");
  }
}

function clearTimelineGapSelection() {
  podcastVideoState.timelineGapSelection = null;
  syncTimelineGapSelectionUi();
}

function getTrackTimelineItems(trackId = "", session = null) {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const clipMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
  return rows
    .map((row) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId) return null;
      const clip = clipMap[rowId];
      if (!clip || String(clip.trackId || "").trim() !== String(trackId || "").trim()) return null;
      const startPx = timelineMsToPx(Number(clip?.startMs || 0));
      const widthPx = Math.max(STUDIO_TIMELINE_MIN_CLIP_PX, timelineMsToPx(getTimelineClipEffectiveDurationMs(clip)));
      return {
        rowId,
        startMs: Number(clip.startMs || 0),
        endMs: getTimelineClipEndMs(clip),
        startPx,
        endPx: startPx + widthPx,
        order: Number(rowIndexById.get(rowId) || 0)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs || a.order - b.order);
}

function getTimelineGapBoundsForPoint(trackId = "", pointPx = 0, session = null) {
  const items = getTrackTimelineItems(trackId, session);
  const totalWidthPx = timelineMsToPx(getTimelineTotalDurationMs(session || getActiveSession()));
  let prevEndPx = 0;
  let nextStartPx = totalWidthPx;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (pointPx >= item.startPx && pointPx <= item.endPx) {
      return null;
    }
    if (item.endPx <= pointPx) {
      prevEndPx = Math.max(prevEndPx, item.endPx);
      continue;
    }
    nextStartPx = item.startPx;
    break;
  }
  if (nextStartPx - prevEndPx < 1) return null;
  return {
    startPx: prevEndPx,
    endPx: nextStartPx
  };
}

function getTrackLaneContentPx(lane, clientX = 0) {
  const rect = lane?.getBoundingClientRect?.();
  if (!rect) return 0;
  return Math.max(0, Math.min(rect.width, Number(clientX || 0) - rect.left));
}

function syncTimelineGapSelectionUi() {
  if (!els.podcastVideoTimeline) return;
  Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-timeline-gap-selection")).forEach((el) => el.remove());
  const selection = podcastVideoState.timelineGapSelection;
  if (!selection) return;
  if (getTimelineViewMode(getActiveSession()) !== "tracks") return;
  const lane = els.podcastVideoTimeline.querySelector(`.podcast-video-track-lane[data-track-id="${CSS.escape(String(selection.trackId || ""))}"]`);
  if (!lane) return;
  const leftPx = Math.max(0, Math.min(Number(selection.startPx || 0), Number(selection.endPx || 0)));
  const rightPx = Math.max(Number(selection.startPx || 0), Number(selection.endPx || 0));
  const widthPx = Math.max(0, rightPx - leftPx);
  if (widthPx < 1) return;
  const overlay = document.createElement("div");
  overlay.className = "podcast-timeline-gap-selection";
  overlay.style.left = `${leftPx.toFixed(3)}px`;
  overlay.style.width = `${widthPx.toFixed(3)}px`;
  overlay.innerHTML = `
    <div class="podcast-timeline-gap-selection-fill" aria-hidden="true"></div>
    <button class="podcast-timeline-gap-selection-btn" type="button" data-action="timeline-delete-selected-gap">
      Eliminar hueco
    </button>
  `;
  lane.appendChild(overlay);
}

function ensureTimelinePlayheadVisible(leftPx = 0, focusNode = null) {
  if (!els.podcastVideoTimeline || !podcastVideoState.montageActive) return;
  if (Date.now() < Number(podcastTimelineManualScrollUntil || 0)) return;
  const viewport = els.podcastVideoTimeline;
  const currentScrollLeft = Number(viewport.scrollLeft || 0);
  const viewportWidth = Math.max(0, Number(viewport.clientWidth || 0));
  if (viewportWidth <= 0) return;
  const leadingPad = Math.max(160, Math.round(viewportWidth * 0.3));
  const trailingPad = Math.max(220, Math.round(viewportWidth * 0.38));
  const visibleLeft = currentScrollLeft + leadingPad;
  const visibleRight = currentScrollLeft + viewportWidth - trailingPad;
  let targetScrollLeft = currentScrollLeft;
  if (leftPx < visibleLeft) {
    targetScrollLeft = Math.max(0, leftPx - leadingPad);
  } else if (leftPx > visibleRight) {
    targetScrollLeft = Math.max(0, leftPx - viewportWidth + trailingPad);
  } else if (focusNode) {
    const nodeLeft = Number(focusNode.offsetLeft || 0);
    const nodeWidth = Number(focusNode.offsetWidth || 0);
    const nodeRight = nodeLeft + nodeWidth;
    if (nodeLeft < currentScrollLeft + 24) {
      targetScrollLeft = Math.max(0, nodeLeft - 24);
    } else if (nodeRight > currentScrollLeft + viewportWidth - 24) {
      targetScrollLeft = Math.max(0, nodeRight - viewportWidth + 24);
    }
  }
  if (Math.abs(targetScrollLeft - currentScrollLeft) < 2) return;
  viewport.scrollLeft = targetScrollLeft;
}

function updateTimelineGapSelection(currentPx = 0) {
  const drag = podcastVideoState.timelineDrag;
  if (!drag || drag.mode !== "gap-selection") return;
  const clampedPx = Math.max(Number(drag.gapStartPx || 0), Math.min(Number(drag.gapEndPx || 0), Number(currentPx || 0)));
  const startPx = Math.min(Number(drag.anchorPx || 0), clampedPx);
  const endPx = Math.max(Number(drag.anchorPx || 0), clampedPx);
  podcastVideoState.timelineGapSelection = {
    trackId: String(drag.trackId || "").trim(),
    startPx,
    endPx,
    startMs: snapTimelineMs(timelinePxToMs(startPx)),
    endMs: snapTimelineMs(timelinePxToMs(endPx))
  };
  syncTimelineGapSelectionUi();
}

function beginTimelineGapSelection(lane, event) {
  const session = getActiveSession();
  const trackId = String(lane?.dataset?.trackId || "").trim();
  if (!trackId || trackId === "audio-track") return false;
  const pointPx = getTrackLaneContentPx(lane, event.clientX);
  const gapBounds = getTimelineGapBoundsForPoint(trackId, pointPx, session);
  if (!gapBounds) {
    clearTimelineGapSelection();
    return false;
  }
  podcastVideoState.timelineDrag = {
    mode: "gap-selection",
    trackId,
    gapStartPx: gapBounds.startPx,
    gapEndPx: gapBounds.endPx,
    anchorPx: Math.max(gapBounds.startPx, Math.min(gapBounds.endPx, pointPx)),
    moved: false
  };
  updateTimelineGapSelection(pointPx);
  return true;
}

function deleteSelectedTimelineGap() {
  const selection = podcastVideoState.timelineGapSelection;
  if (!selection) return false;
  const startMs = Math.min(Number(selection.startMs || 0), Number(selection.endMs || 0));
  const endMs = Math.max(Number(selection.startMs || 0), Number(selection.endMs || 0));
  const gapMs = Math.max(0, endMs - startMs);
  if (gapMs < STUDIO_TIMELINE_SNAP_MS) return false;
  upsertPodcastVideoConfig((cfg) => {
    const clips = ensureTimelineClipsByRowId(getActiveSession(), { persist: false });
    const nextClips = { ...clips };
    Object.values(clips).forEach((clip) => {
      const rowId = String(clip?.rowId || "").trim();
      if (!rowId) return;
      if (Number(clip.startMs || 0) < endMs) return;
      const shifted = normalizeTimelineClipItem({
        ...clip,
        startMs: Math.max(0, snapTimelineMs(Number(clip.startMs || 0) - gapMs))
      }, rowId);
      if (shifted) nextClips[rowId] = shifted;
    });
    return {
      ...cfg,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineClipsByRowId: nextClips
    };
  });
  clearTimelineGapSelection();
  renderPodcastVideoShell(getActiveSession());
  return true;
}

function syncPodcastTimelinePlayhead(session = null) {
  if (!els.podcastVideoTimeline) return;
  const canvas = els.podcastVideoTimeline.querySelector(".podcast-video-timeline-canvas");
  const playhead = els.podcastVideoTimeline.querySelector("#podcastTimelinePlayhead");
  if (!playhead) return;
  const activeSession = session || getActiveSession();
  const mode = getTimelineViewMode(activeSession);
  const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(activeSession));
  const cursorMs = Math.max(0, Math.min(totalMs, Number(podcastVideoState.montageCursorMs || 0)));
  let leftPx = 0;
  let playheadRowId = "";
  if (mode === "normal") {
    const clipMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
    const entries = buildTimelineRuntimeEntries(activeSession);
    const directEntry = entries.find((entry) => cursorMs >= entry.startMs && cursorMs < entry.endMs) || null;
    const nextEntry = entries.find((entry) => entry.startMs >= cursorMs) || null;
    const lastEntry = entries.length ? entries[entries.length - 1] : null;
    const timelineEntry = directEntry || nextEntry || lastEntry || null;
    const targetRowId = String(timelineEntry?.rowId || podcastVideoState.activeRowId || "").trim();
    playheadRowId = targetRowId;
    const activeItem = targetRowId
      ? els.podcastVideoTimeline.querySelector(`.podcast-video-timeline-item[data-row-id="${targetRowId}"] .podcast-video-scene-card`)
      : null;
    const activeClip = targetRowId ? clipMap[targetRowId] : null;
    const clipStartMs = Math.max(0, Number(activeClip?.startMs || 0));
    const clipDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(activeClip));
    const clipEndMs = clipStartMs + clipDurationMs;
    const localCursorMs = directEntry
      ? cursorMs
      : (nextEntry ? clipStartMs : Math.min(clipEndMs, cursorMs));
    const localProgress = Math.max(0, Math.min(1, (localCursorMs - clipStartMs) / Math.max(1, clipEndMs - clipStartMs)));
    if (activeItem) {
      leftPx = Math.round(Number(activeItem.offsetLeft || 0) + (Number(activeItem.offsetWidth || 0) * localProgress));
    } else {
      leftPx = Math.round(timelineMsToPx(cursorMs));
    }
  } else {
    const entries = buildTimelineRuntimeEntries(activeSession);
    const directEntry = entries.find((entry) => cursorMs >= entry.startMs && cursorMs < entry.endMs) || null;
    const nextEntry = entries.find((entry) => entry.startMs >= cursorMs) || null;
    const lastEntry = entries.length ? entries[entries.length - 1] : null;
    playheadRowId = String((directEntry || nextEntry || lastEntry || {}).rowId || podcastVideoState.activeRowId || "").trim();
    const offsetPx = Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
    leftPx = offsetPx + Math.round(timelineMsToPx(cursorMs));
  }
  playhead.style.left = `${leftPx}px`;
  let focusNode = null;
  els.podcastVideoTimeline
    .querySelectorAll(".podcast-video-scene-card.is-playhead-focus, .podcast-video-timeline-clip.is-playhead-focus")
    .forEach((node) => {
      node.classList.remove("is-playhead-focus");
      node.removeAttribute("aria-current");
    });
  if (playheadRowId) {
    const escapedRowId = CSS.escape(playheadRowId);
    els.podcastVideoTimeline
      .querySelectorAll(`.podcast-video-timeline-item[data-row-id="${escapedRowId}"] .podcast-video-scene-card, .podcast-video-timeline-clip[data-row-id="${escapedRowId}"]`)
      .forEach((node) => {
        node.classList.add("is-playhead-focus");
        node.setAttribute("aria-current", "true");
        if (!focusNode) focusNode = node;
      });
  }
  if (
    focusNode
    && podcastVideoState.montageActive
    && document.activeElement !== focusNode
    && !focusNode.contains(document.activeElement)
  ) {
    focusNode.focus({ preventScroll: true });
  }
  ensureTimelinePlayheadVisible(leftPx, focusNode);
}

function seekStudioTimelineByClientX(clientX = 0, options = {}) {
  const session = getActiveSession();
  if (!session || !els.podcastVideoTimeline) return;
  const canvas = els.podcastVideoTimeline.querySelector(".podcast-video-timeline-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const offsetPx = Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
  const contentX = Math.max(0, Number(clientX || 0) - rect.left - offsetPx);
  const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
  const nextMs = Math.max(0, Math.min(totalMs, timelinePxToMs(contentX)));
  podcastVideoState.montageCursorMs = nextMs;
  syncPodcastTimelinePlayhead(session);
  if (els.podcastStudioScrubber) {
    const ratio = Math.max(0, Math.min(1, nextMs / totalMs));
    els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
  }
  if (options.stopMontage === true && podcastVideoState.montageActive) {
    stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
  }
  const entries = buildTimelineRuntimeEntries(session);
  syncStudioTimelinePreview(nextMs, entries).catch(() => {});
  if (els.podcastStudioTime) {
    els.podcastStudioTime.textContent = `${secondsToClock(nextMs / 1000)} / ${secondsToClock(totalMs / 1000)}`;
  }
}

function seekStudioTimelineByRulerClientX(clientX = 0, options = {}) {
  const session = getActiveSession();
  if (!session || !els.podcastTimelineRuler) return;
  const rulerInner = els.podcastTimelineRuler.querySelector(".podcast-timeline-ruler-inner");
  const canvas = els.podcastVideoTimeline?.querySelector?.(".podcast-video-timeline-canvas");
  const rect = els.podcastTimelineRuler.getBoundingClientRect();
  const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
  const totalWidthPx = Math.max(1, Number(rulerInner?.offsetWidth || timelineMsToPx(totalMs)));
  const offsetPx = Math.max(0, Number(canvas?.dataset?.playheadOffset || 0));
  const localX = Math.max(0, Math.min(rect.width, Number(clientX || 0) - rect.left));
  const contentX = Math.max(0, Math.min(totalWidthPx, localX + Number(els.podcastTimelineRuler.scrollLeft || 0) - offsetPx));
  const nextMs = Math.max(0, Math.min(totalMs, timelinePxToMs(contentX)));
  podcastVideoState.montageCursorMs = nextMs;
  syncPodcastTimelinePlayhead(session);
  if (els.podcastStudioScrubber) {
    const ratio = Math.max(0, Math.min(1, nextMs / totalMs));
    els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
  }
  if (options.stopMontage === true && podcastVideoState.montageActive) {
    stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
  }
  const entries = buildTimelineRuntimeEntries(session);
  syncStudioTimelinePreview(nextMs, entries).catch(() => {});
  if (els.podcastStudioTime) {
    els.podcastStudioTime.textContent = `${secondsToClock(nextMs / 1000)} / ${secondsToClock(totalMs / 1000)}`;
  }
}

function setPodcastVideoZoomEnabled(next = false) {
  const enabled = Boolean(next);
  podcastVideoState.zoomed = enabled;
  if (els.podcastVideoStage) {
    els.podcastVideoStage.classList.toggle("is-zoomed", enabled);
  }
  if (els.podcastVideoZoomBtn) {
    const icon = els.podcastVideoZoomBtn.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-search-plus", !enabled);
      icon.classList.toggle("fa-search-minus", enabled);
    }
    els.podcastVideoZoomBtn.classList.toggle("is-active", enabled);
    els.podcastVideoZoomBtn.setAttribute("title", enabled ? "Desactivar zoom de video" : "Activar zoom de video");
    els.podcastVideoZoomBtn.setAttribute("aria-label", enabled ? "Desactivar zoom de video" : "Activar zoom de video");
  }
}

function clearPodcastTimelineDragUi() {
  if (els.podcastVideoTimeline) {
    els.podcastVideoTimeline.querySelectorAll(".is-track-target").forEach((node) => node.classList.remove("is-track-target"));
    els.podcastVideoTimeline.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  }
  podcastVideoState.timelineDrag = null;
  document.body.classList.remove("podcast-timeline-dragging");
}

function findTimelineActionButton(action = "", rowId = "") {
  const actionName = String(action || "").trim();
  const key = String(rowId || "").trim();
  if (!els.podcastVideoTimeline || !actionName || !key) return null;
  return Array.from(els.podcastVideoTimeline.querySelectorAll(`[data-action="${actionName}"][data-row-id]`))
    .find((node) => String(node.dataset.rowId || "").trim() === key) || null;
}

function updateTimelineClipForRow(rowId = "", mutator = null, options = {}) {
  const key = String(rowId || "").trim();
  if (!key || typeof mutator !== "function") return false;
  const persist = options.persist !== false;
  let changed = false;
  upsertPodcastVideoConfig((cfg) => {
    const clips = ensureTimelineClipsByRowId(getActiveSession());
    const current = clips[key];
    if (!current) return cfg;
    const updated = normalizeTimelineClipItem(mutator({ ...current }), key);
    if (!updated) return cfg;
    if (JSON.stringify(updated) === JSON.stringify(current)) return cfg;
    changed = true;
    return {
      ...cfg,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineClipsByRowId: {
        ...clips,
        [key]: updated
      }
    };
  });
  if (changed && persist) {
    podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
    renderPodcastVideoTimeline(getActiveSession());
    syncPodcastStudioInspector(getActiveSession());
  }
  return changed;
}

function beginTimelineClipDrag(mode = "move", rowId = "", event = null) {
  const key = String(rowId || "").trim();
  if (!key || !event) return;
  const session = getActiveSession();
  const clips = ensureTimelineClipsByRowId(session);
  const clip = clips[key];
  if (!clip) return;
  const linkedIds = [];
  if (mode === "move") {
    const toleranceMs = STUDIO_TIMELINE_CHAIN_TOLERANCE_MS;
    const sameTrack = Object.values(clips)
      .filter((item) => String(item?.trackId || "") === String(clip.trackId || ""))
      .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0));
    const currentIdx = sameTrack.findIndex((item) => String(item?.rowId || "").trim() === key);
    if (currentIdx >= 0) {
      linkedIds.push(key);
      let rightCursor = currentIdx;
      while (rightCursor < sameTrack.length - 1) {
        const current = sameTrack[rightCursor];
        const next = sameTrack[rightCursor + 1];
        const gap = Math.abs(getTimelineClipEndMs(current) - Number(next.startMs || 0));
        if (gap > toleranceMs) break;
        linkedIds.push(String(next.rowId || "").trim());
        rightCursor += 1;
      }
    }
  }
  const dragGroup = (linkedIds.length ? linkedIds : [key])
    .map((id) => {
      const item = clips[id];
      if (!item) return null;
      return {
        rowId: id,
        initialStartMs: Number(item.startMs || 0)
      };
    })
    .filter(Boolean);
  podcastVideoState.timelineDrag = {
    mode,
    rowId: key,
    startClientX: Number(event.clientX || 0),
    startClientY: Number(event.clientY || 0),
    initialStartMs: Number(clip.startMs || 0),
    initialTrimInMs: Number(clip.trimInMs || 0),
    initialTrimOutMs: Number(clip.trimOutMs || 0),
    sourceDurationMs: Number(clip.sourceDurationMs || 0),
    sourceTrackId: String(clip.trackId || "").trim(),
    sourceTrackIndex: Number((event.target?.closest?.(".podcast-video-track-row")?.dataset?.trackIndex) || 0),
    dragGroup
  };
  document.body.classList.add("podcast-timeline-dragging");
}

function beginTimelineAudioTrimDrag(mode = "audio-trim-start", event = null) {
  if (!event) return;
  const requestedTrackIndex = Math.max(0, Math.floor(Number(event?.target?.closest?.("[data-track-index]")?.dataset?.trackIndex || 0) || 0));
  if (event?.target?.closest?.("[data-track-index]")) {
    selectUploadedPanelMusicTrackByIndex(requestedTrackIndex);
  }
  const track = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
  if (!track) return;
  const loopIndex = Math.max(0, Math.floor(Number(event?.target?.closest?.("[data-loop-index]")?.dataset?.loopIndex || 0) || 0));
  const loopSetting = getPanelMusicLoopSetting(track, loopIndex);
  podcastVideoState.timelineDrag = {
    mode,
    startClientX: Number(event.clientX || 0),
    loopIndex,
    initialTrimInMs: Math.max(0, Number(loopSetting?.trimInMs || 0) || 0),
    initialTrimOutMs: Math.max(0, Number(loopSetting?.trimOutMs || Math.round(getPanelMusicTrackDurationSec(track) * 1000) || STUDIO_TIMELINE_MIN_CLIP_MS) || STUDIO_TIMELINE_MIN_CLIP_MS),
    sourceDurationMs: Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(getPanelMusicTrackDurationSec(track) * 1000) || STUDIO_TIMELINE_MIN_CLIP_MS),
    selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
    selectedTrackIndex: requestedTrackIndex
  };
  document.body.classList.add("podcast-timeline-dragging");
}

function beginTimelineAudioMoveDrag(event = null) {
  if (!event) return;
  const requestedTrackIndex = Math.max(0, Math.floor(Number(event?.target?.closest?.("[data-track-index]")?.dataset?.trackIndex || 0) || 0));
  if (event?.target?.closest?.("[data-track-index]")) {
    selectUploadedPanelMusicTrackByIndex(requestedTrackIndex);
  }
  const track = getPanelMusicTrackAvailability(panelMusicState.selectedTrackKind) || normalizePanelMusicTrack(panelMusicState.track);
  if (!track) return;
  podcastVideoState.timelineDrag = {
    mode: "audio-move",
    startClientX: Number(event.clientX || 0),
    initialStartOffsetMs: Math.max(0, Number(track.startOffsetMs || 0) || 0),
    selectedTrackKind: resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind),
    selectedTrackIndex: requestedTrackIndex
  };
  document.body.classList.add("podcast-timeline-dragging");
}

function resolveTimelineDragDropTarget(clientX = 0, clientY = 0) {
  if (!els.podcastVideoTimeline) return { trackId: "", dropIndex: null };
  const hit = document.elementFromPoint(clientX, clientY);
  const dropZone = hit?.closest?.(".podcast-video-track-drop-zone[data-drop-track-index]");
  if (dropZone) {
    const idx = Number(dropZone.dataset.dropTrackIndex);
    return {
      trackId: "",
      dropIndex: Number.isFinite(idx) ? Math.max(0, Math.round(idx)) : null
    };
  }
  const lane = hit?.closest?.(".podcast-video-track-lane[data-track-id]");
  if (lane) {
    return {
      trackId: String(lane.dataset.trackId || "").trim(),
      dropIndex: null
    };
  }
  return { trackId: "", dropIndex: null };
}

function applyTimelineDragTargetUi(trackId = "", dropIndex = null) {
  if (!els.podcastVideoTimeline) return;
  const trackKey = String(trackId || "").trim();
  els.podcastVideoTimeline.querySelectorAll(".is-track-target").forEach((node) => node.classList.remove("is-track-target"));
  els.podcastVideoTimeline.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
  if (trackKey) {
    const lane = Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-video-track-lane[data-track-id]"))
      .find((node) => String(node.dataset.trackId || "").trim() === trackKey);
    if (lane) lane.classList.add("is-track-target");
  }
  if (Number.isFinite(dropIndex)) {
    const zone = els.podcastVideoTimeline.querySelector(`.podcast-video-track-drop-zone[data-drop-track-index="${Math.max(0, Math.round(dropIndex))}"]`);
    if (zone) zone.classList.add("is-drop-target");
  }
}

function applyTimelineClipDrag(event = null) {
  const drag = podcastVideoState.timelineDrag;
  if (!drag || !event) return;
  if (drag.mode === "move") {
    const target = resolveTimelineDragDropTarget(Number(event.clientX || 0), Number(event.clientY || 0));
    drag.targetTrackId = String(target.trackId || "").trim();
    drag.targetDropIndex = Number.isFinite(target.dropIndex) ? target.dropIndex : null;
    applyTimelineDragTargetUi(drag.targetTrackId, drag.targetDropIndex);
  }
  const deltaPx = Number(event.clientX || 0) - Number(drag.startClientX || 0);
  if (Math.abs(deltaPx) > 2) {
    drag.moved = true;
  }
  const deltaMsRaw = timelinePxToMs(deltaPx);
  const dragStepMs = resolveTimelineDragStepMs(event);
  const deltaMs = snapTimelineMsWithStep(deltaMsRaw, dragStepMs);
  const minTrimLen = STUDIO_TIMELINE_MIN_CLIP_MS;
  if (drag.mode === "audio-trim-start" || drag.mode === "audio-trim-end") {
    const trackKind = resolvePanelMusicTrackKind(drag.selectedTrackKind || panelMusicState.selectedTrackKind);
    const sourceDurationMs = Math.max(minTrimLen, Number(drag.sourceDurationMs || minTrimLen));
    const maxTrimIn = Math.max(0, sourceDurationMs - minTrimLen);
    const loopIndex = Math.max(0, Math.floor(Number(drag.loopIndex || 0) || 0));
    if (drag.mode === "audio-trim-start") {
      const nextTrimIn = Math.max(0, Math.min(maxTrimIn, snapTimelineMsWithStep(Number(drag.initialTrimInMs || 0) + deltaMsRaw, dragStepMs)));
      updatePanelMusicTrack(trackKind, (track) => ({
        ...track,
        loopSettings: upsertPanelMusicLoopSetting(track.loopSettings || [], loopIndex, {
          trimInMs: nextTrimIn,
          trimOutMs: Math.max(nextTrimIn + minTrimLen, Number(drag.initialTrimOutMs || sourceDurationMs) || sourceDurationMs)
        })
      }));
      return;
    }
    const minTrimOut = Math.max(minTrimLen, Number(drag.initialTrimInMs || 0) + minTrimLen);
    const nextTrimOut = Math.max(minTrimOut, Math.min(sourceDurationMs, snapTimelineMsWithStep(Number(drag.initialTrimOutMs || sourceDurationMs) + deltaMsRaw, dragStepMs)));
    updatePanelMusicTrack(trackKind, (track) => ({
      ...track,
      loopSettings: upsertPanelMusicLoopSetting(track.loopSettings || [], loopIndex, {
        trimInMs: Math.max(0, Number(drag.initialTrimInMs || 0) || 0),
        trimOutMs: nextTrimOut
      })
    }));
    return;
  }
  if (drag.mode === "audio-move") {
    const trackKind = resolvePanelMusicTrackKind(drag.selectedTrackKind || panelMusicState.selectedTrackKind);
    const session = getActiveSession();
    const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
    const track = getPanelMusicTrackAvailability(trackKind) || normalizePanelMusicTrack(panelMusicState.track);
    const durationSec = getPanelMusicTrackDurationSec(track);
    const trimInMs = Math.max(0, Number(track?.trimInMs || 0) || 0);
    const trimOutMs = Math.max(trimInMs + minTrimLen, Number(track?.trimOutMs || Math.round(durationSec * 1000) || minTrimLen) || minTrimLen);
    const effectiveLoopMs = Math.max(minTrimLen, trimOutMs - trimInMs);
    const maxStartOffsetMs = Math.max(0, totalMs - effectiveLoopMs);
    const nextStartOffsetMs = Math.max(
      0,
      Math.min(maxStartOffsetMs, snapTimelineMsWithStep(Number(drag.initialStartOffsetMs || 0) + deltaMsRaw, dragStepMs))
    );
    updatePanelMusicTrack(trackKind, (currentTrack) => ({
      ...currentTrack,
      startOffsetMs: nextStartOffsetMs
    }));
    return;
  }
  if (drag.mode === "move") {
    const session = getActiveSession();
    const clips = ensureTimelineClipsByRowId(session);
    const rows = session?.script?.rows || [];
    const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
    const group = Array.isArray(drag.dragGroup) && drag.dragGroup.length
      ? drag.dragGroup
      : [{ rowId: drag.rowId, initialStartMs: Number(drag.initialStartMs || 0) }];
    let targetDelta = deltaMs;
    const minProjected = group.reduce((acc, item) => {
      const projected = Number(item.initialStartMs || 0) + targetDelta;
      return Math.min(acc, projected);
    }, Number.POSITIVE_INFINITY);
    if (minProjected < 0) {
      targetDelta = targetDelta - minProjected;
    }
    const nextClips = { ...clips };
    const destinationTrackId = String(drag.targetTrackId || "").trim();
    const shouldMoveTrack = Boolean(destinationTrackId && destinationTrackId !== String(drag.sourceTrackId || "").trim() && !Number.isFinite(drag.targetDropIndex));
    group.forEach((item, idx) => {
      const key = String(item.rowId || "").trim();
      const current = clips[key];
      if (!current) return;
      const nextStart = Math.max(0, snapTimelineMsWithStep(Number(item.initialStartMs || 0) + targetDelta, dragStepMs));
      const normalized = normalizeTimelineClipItem({
        ...current,
        startMs: nextStart,
        trackId: shouldMoveTrack ? destinationTrackId : String(current.trackId || "").trim(),
        zIndex: idx === 0 ? Math.max(Number(current.zIndex || 1), Date.now() % 100000) : Number(current.zIndex || 1)
      }, key);
      if (!normalized) return;
      nextClips[key] = normalized;
    });
    if (targetDelta > 0 && !shouldMoveTrack && !Number.isFinite(drag.targetDropIndex)) {
      const sourceTrackId = String(drag.sourceTrackId || "").trim();
      const orderedTrackClips = Object.values(nextClips)
        .filter((item) => String(item?.trackId || "").trim() === sourceTrackId)
        .sort((a, b) => (
          Number(a.startMs || 0) - Number(b.startMs || 0)
          || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
        ));
      for (let i = 1; i < orderedTrackClips.length; i += 1) {
        const prev = orderedTrackClips[i - 1];
        const current = orderedTrackClips[i];
        const prevEnd = getTimelineClipEndMs(prev);
        const currentStart = Math.max(0, Number(current.startMs || 0));
        if (currentStart >= prevEnd) continue;
        const currentRowId = String(current.rowId || "").trim();
        if (!currentRowId) continue;
        const shifted = normalizeTimelineClipItem({
          ...current,
          startMs: snapTimelineMsWithStep(prevEnd, dragStepMs)
        }, currentRowId);
        if (!shifted) continue;
        nextClips[currentRowId] = shifted;
        orderedTrackClips[i] = shifted;
      }
    }
    upsertPodcastVideoConfig((cfg) => ({
      ...cfg,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineClipsByRowId: nextClips
    }));
    podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
    renderPodcastVideoTimeline(getActiveSession());
    syncPodcastStudioInspector(getActiveSession());
    return;
  }
  if (drag.mode === "trim-start") {
    const session = getActiveSession();
    const rows = session?.script?.rows || [];
    const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
    upsertPodcastVideoConfig((cfg) => {
      const clips = ensureTimelineClipsByRowId(getActiveSession(), { persist: false });
      const current = clips[drag.rowId];
      if (!current) return cfg;
      const trackId = String(current.trackId || "").trim();
      const sameTrack = Object.values(clips)
        .filter((item) => String(item?.trackId || "").trim() === trackId)
        .sort((a, b) => (
          Number(a.startMs || 0) - Number(b.startMs || 0)
          || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
        ));
      const idx = sameTrack.findIndex((item) => String(item?.rowId || "").trim() === String(drag.rowId || "").trim());
      const prev = idx > 0 ? sameTrack[idx - 1] : null;
      const minStartMs = prev ? getTimelineClipEndMs(prev) : 0;
      const oldStartMs = Math.max(0, Number(current.startMs || 0));
      const oldTrimInMs = Math.max(0, Number(current.trimInMs || 0));
      const maxTrimIn = Math.max(0, Number(current.trimOutMs || 0) - minTrimLen);
      const desiredTrimIn = Math.max(0, Math.min(maxTrimIn, snapTimelineMsWithStep(Number(drag.initialTrimInMs || 0) + deltaMsRaw, dragStepMs)));
      const desiredStartMs = oldStartMs + (desiredTrimIn - oldTrimInMs);
      const constrainedStartMs = Math.max(minStartMs, snapTimelineMsWithStep(desiredStartMs, dragStepMs));
      const actualTrimIn = Math.max(
        0,
        Math.min(maxTrimIn, oldTrimInMs + (constrainedStartMs - oldStartMs))
      );
      const updated = normalizeTimelineClipItem({
        ...current,
        startMs: constrainedStartMs,
        trimInMs: actualTrimIn
      }, drag.rowId);
      if (!updated) return cfg;
      return {
        ...cfg,
        timelineVersion: STUDIO_TIMELINE_VERSION,
        timelineClipsByRowId: {
          ...clips,
          [drag.rowId]: updated
        }
      };
    });
    podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
    renderPodcastVideoTimeline(getActiveSession());
    syncPodcastStudioInspector(getActiveSession());
    return;
  }
  if (drag.mode === "trim-end") {
    const session = getActiveSession();
    const rows = session?.script?.rows || [];
    const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
    upsertPodcastVideoConfig((cfg) => {
      const clips = ensureTimelineClipsByRowId(getActiveSession(), { persist: false });
      const current = clips[drag.rowId];
      if (!current) return cfg;
      const sourceDurationMs = Math.max(minTrimLen, Number(drag.sourceDurationMs || current.sourceDurationMs || 0));
      const minTrimOut = Math.max(minTrimLen, Number(current.trimInMs || 0) + minTrimLen);
      const nextTrimOut = Math.max(minTrimOut, Math.min(sourceDurationMs, snapTimelineMsWithStep(Number(drag.initialTrimOutMs || 0) + deltaMsRaw, dragStepMs)));
      const trimOutDeltaMs = nextTrimOut - Math.max(0, Number(current.trimOutMs || 0));
      const currentEndMs = getTimelineClipEndMs(current);
      const trackId = String(current.trackId || "").trim();
      const nextClips = { ...clips };
      const updatedCurrent = normalizeTimelineClipItem({
        ...current,
        trimOutMs: nextTrimOut
      }, drag.rowId);
      if (!updatedCurrent) return cfg;
      nextClips[drag.rowId] = updatedCurrent;
      if (trimOutDeltaMs !== 0) {
        Object.values(clips)
          .filter((item) => (
            String(item?.trackId || "").trim() === trackId
            && String(item?.rowId || "").trim() !== String(drag.rowId || "").trim()
            && Number(item.startMs || 0) >= currentEndMs - 1
          ))
          .sort((a, b) => (
            Number(a.startMs || 0) - Number(b.startMs || 0)
            || Number(rowIndexById.get(String(a.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b.rowId || "").trim()) || 0)
          ))
          .forEach((item) => {
            const rowId = String(item?.rowId || "").trim();
            if (!rowId) return;
            const shifted = normalizeTimelineClipItem({
              ...item,
              startMs: Math.max(0, snapTimelineMsWithStep(Number(item.startMs || 0) + trimOutDeltaMs, dragStepMs))
            }, rowId);
            if (!shifted) return;
            nextClips[rowId] = shifted;
          });
      }
      return {
        ...cfg,
        timelineVersion: STUDIO_TIMELINE_VERSION,
        timelineClipsByRowId: nextClips
      };
    });
    podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
    renderPodcastVideoTimeline(getActiveSession());
    syncPodcastStudioInspector(getActiveSession());
  }
}

function finalizeTimelineClipDrag() {
  const drag = podcastVideoState.timelineDrag;
  if (!drag || drag.mode !== "move") return;
  const groupIds = (Array.isArray(drag.dragGroup) ? drag.dragGroup : [])
    .map((item) => String(item?.rowId || "").trim())
    .filter(Boolean);
  if (!groupIds.length) return;
  const targetDropIndex = Number.isFinite(drag.targetDropIndex) ? Math.max(0, Math.round(drag.targetDropIndex)) : null;
  const targetTrackId = String(drag.targetTrackId || "").trim();
  if (!targetTrackId && targetDropIndex === null) return;
  upsertPodcastVideoConfig((cfg) => {
    const tracks = ensureTimelineTracks(getActiveSession(), { persist: false });
    const clips = ensureTimelineClipsByRowId(getActiveSession(), { persist: false });
    const nextClips = { ...clips };
    let nextTracks = [...tracks];
    let destinationTrackId = targetTrackId;
    if (targetDropIndex !== null) {
      const insertIndex = Math.max(0, Math.min(nextTracks.length, targetDropIndex));
      destinationTrackId = makeId("track");
      const trackLabel = `Track ${nextTracks.length + 1}`;
      nextTracks.splice(insertIndex, 0, {
        id: destinationTrackId,
        label: trackLabel,
        order: insertIndex
      });
      nextTracks = nextTracks.map((track, index) => ({
        ...track,
        order: index
      }));
    }
    if (!destinationTrackId) return cfg;
    groupIds.forEach((rowId) => {
      const current = clips[rowId];
      if (!current) return;
      const updated = normalizeTimelineClipItem({
        ...current,
        trackId: destinationTrackId,
        zIndex: Math.max(1, Number(current.zIndex || 1))
      }, rowId);
      if (updated) {
        nextClips[rowId] = updated;
      }
    });
    return {
      ...cfg,
      timelineVersion: STUDIO_TIMELINE_VERSION,
      timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineTracks: normalizeTimelineTracks(nextTracks),
      timelineClipsByRowId: nextClips
    };
  });
}

function reorderPodcastStudioSceneRows(dragRowId = "", targetRowId = "", placeAfter = false) {
  const dragId = String(dragRowId || "").trim();
  const targetId = String(targetRowId || "").trim();
  if (!dragId || !targetId || dragId === targetId) return false;
  const session = getActiveSession();
  const rows = Array.isArray(session?.script?.rows) ? session.script.rows : [];
  if (rows.length < 2) return false;
  const dragRow = rows.find((row) => String(row?.id || "").trim() === dragId);
  if (!dragRow) return false;
  const remaining = rows.filter((row) => String(row?.id || "").trim() !== dragId);
  const targetIndex = remaining.findIndex((row) => String(row?.id || "").trim() === targetId);
  if (targetIndex < 0) return false;
  const insertAt = placeAfter ? targetIndex + 1 : targetIndex;
  remaining.splice(insertAt, 0, dragRow);
  upsertActiveSession((current) => ({
    ...current,
    script: {
      ...current.script,
      rows: remaining
    }
  }));
  return true;
}

function renderPodcastTransitionTimeline(session = null) {
  if (!els.podcastTransitionTimeline) return;
  els.podcastTransitionTimeline.innerHTML = "";
}

function upsertPodcastVideoConfig(mutator) {
  upsertActiveSession((session) => {
    const base = getPodcastVideoConfig(session);
    const next = mutator({ ...base, transitionsByEdge: { ...(base.transitionsByEdge || {}) } });
    return {
      ...session,
      podcastVideoConfig: normalizePodcastVideoConfig(next)
    };
  }, { render: false });
}

function getActiveTransitionEdge(session = null) {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  if (rows.length < 2) return { fromRowId: "", toRowId: "" };
  const rowIds = rows.map((row) => String(row?.id || "").trim()).filter(Boolean);
  const indexOf = (value = "") => rowIds.findIndex((id) => id === String(value || "").trim());
  const explicitFrom = String(podcastVideoState.transitionFromRowId || "").trim();
  const explicitTo = String(podcastVideoState.transitionToRowId || "").trim();
  const explicitFromIdx = indexOf(explicitFrom);
  const explicitToIdx = indexOf(explicitTo);
  if (explicitFromIdx >= 0 && explicitToIdx === explicitFromIdx + 1) {
    return { fromRowId: explicitFrom, toRowId: explicitTo };
  }
  if (explicitFromIdx >= 0) {
    const toIdx = Math.min(rowIds.length - 1, explicitFromIdx + 1);
    if (toIdx > explicitFromIdx) {
      return { fromRowId: rowIds[explicitFromIdx], toRowId: rowIds[toIdx] };
    }
  }
  const activeRowId = String(podcastVideoState.activeRowId || "").trim();
  let idx = indexOf(activeRowId);
  if (idx < 0) idx = 0;
  if (idx >= rows.length - 1) idx = rows.length - 2;
  return {
    fromRowId: String(rowIds[idx] || "").trim(),
    toRowId: String(rowIds[idx + 1] || "").trim()
  };
}

function setPodcastTransitionPickerOpen(isOpen, fromRowId = "", toRowId = "") {
  const open = Boolean(isOpen);
  podcastVideoState.transitionPickerOpen = open;
  if (open) {
    podcastVideoState.transitionFromRowId = String(fromRowId || "").trim();
    podcastVideoState.transitionToRowId = String(toRowId || "").trim();
  } else {
    podcastVideoState.transitionFromRowId = "";
    podcastVideoState.transitionToRowId = "";
  }
  if (els.podcastTransitionPickerModal) {
    els.podcastTransitionPickerModal.hidden = !open;
  }
  renderPodcastTransitionPicker(getActiveSession());
}

function renderPodcastTransitionPicker(session = null) {
  if (!els.podcastTransitionPickerGrid || !els.podcastTransitionPickerEdgeLabel) return;
  const activeSession = session || getActiveSession();
  const edge = getActiveTransitionEdge(activeSession);
  if (!edge.fromRowId || !edge.toRowId) {
    els.podcastTransitionPickerEdgeLabel.textContent = "Selecciona dos escenas consecutivas para aplicar transición.";
    els.podcastTransitionPickerGrid.querySelectorAll("[data-transition-type]").forEach((btn) => btn.classList.remove("is-selected"));
    return;
  }
  const sceneA = resolveSceneNumberByRowId(edge.fromRowId, activeSession);
  const sceneB = resolveSceneNumberByRowId(edge.toRowId, activeSession);
  els.podcastTransitionPickerEdgeLabel.textContent = `Transición entre Escena ${sceneA} y Escena ${sceneB}`;
  const transition = getTransitionForEdge(activeSession, edge.fromRowId, edge.toRowId);
  const activeType = String(transition?.type || "cut").trim().toLowerCase();
  els.podcastTransitionPickerGrid.querySelectorAll("[data-transition-type]").forEach((btn) => {
    const type = String(btn.dataset.transitionType || "").trim().toLowerCase();
    btn.classList.toggle("is-selected", type === activeType);
  });
}

function closeDialogueVideoDirectiveModal(result = null) {
  if (els.dialogueVideoDirectiveModal) {
    els.dialogueVideoDirectiveModal.hidden = true;
  }
  const pending = dialogueVideoDirectiveRequest;
  dialogueVideoDirectiveRequest = null;
  if (pending?.resolve) {
    pending.resolve(result);
  }
}

function normalizeVideoDirectiveText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mergeVideoDirectives(primary = "", secondary = "") {
  const first = normalizeVideoDirectiveText(primary);
  const second = normalizeVideoDirectiveText(secondary);
  if (!first) return second;
  if (!second) return first;
  if (first.toLowerCase() === second.toLowerCase()) return first;
  return `${first} ${second}`.trim();
}

function promptDialogueVideoDirective(rowId = "", session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  const row = (activeSession?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
  const initialValue = normalizeVideoDirectiveText(options.initialValue != null ? options.initialValue : row?.videoDirective || "");
  const label = normalizeVideoDirectiveText(options.label || "");
  if (!els.dialogueVideoDirectiveModal || !els.dialogueVideoDirectiveInput) {
    return Promise.resolve({ confirmed: true, videoDirective: "" });
  }
  if (dialogueVideoDirectiveRequest?.resolve) {
    dialogueVideoDirectiveRequest.resolve({ confirmed: false, videoDirective: "" });
  }
  els.dialogueVideoDirectiveInput.value = initialValue;
  if (els.dialogueVideoDirectiveLabel) {
    const sceneLabel = label || (row ? `Escena ${resolveSceneNumberByRowId(key, activeSession)}` : "esta escena");
    els.dialogueVideoDirectiveLabel.textContent = `¿Deseas añadir una especificación más al video de ${sceneLabel}?`;
  }
  els.dialogueVideoDirectiveModal.hidden = false;
  queueMicrotask(() => {
    els.dialogueVideoDirectiveInput?.focus();
  });
  return new Promise((resolve) => {
    dialogueVideoDirectiveRequest = { resolve };
  });
}

async function runSceneVideoGenerationFlow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  const session = getActiveSession();
  if (!session || !key) return null;
  const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
  if (!row) return null;

  const shouldPromptDirective = options.promptDirective === true;
  let nextVideoDirective = normalizeVideoDirectiveText(options.videoDirective != null ? options.videoDirective : row?.videoDirective || "");
  logPodcastBatchDebug("scene-flow-start", {
    rowId: key,
    sceneNumber: resolveSceneNumberByRowId(key, session),
    promptDirective: shouldPromptDirective,
    regenerate: options.regenerate === true,
    silent: options.silent === true,
    deferTimelineRender: options.deferTimelineRender === true,
    syncStageAfterGenerate: options.syncStageAfterGenerate !== false,
    selectRow: options.selectRow !== false,
    setBusyState: options.setBusyState !== false,
    hasAudio: hasStoredMediaSource(resolveDialogueAudioForRow(session, key)),
    hasVideo: hasStoredMediaSource(resolveDialogueVideoForRow(session, key)),
    hasPortrait: Boolean(resolvePortraitForSpeaker(session, row.speaker)?.downloadUrl || resolvePortraitForSpeaker(session, row.speaker)?.storagePath),
    videoDirective: nextVideoDirective
  });
  if (shouldPromptDirective) {
    const directiveResult = await promptDialogueVideoDirective(key, session, {
      initialValue: nextVideoDirective
    });
    if (!directiveResult?.confirmed) return null;
    nextVideoDirective = normalizeVideoDirectiveText(directiveResult.videoDirective || "");
  }

  const selectRow = options.selectRow !== false;
  if (selectRow) {
    selectTimelineSceneRow(key, { syncStage: options.syncStage === true });
  }

  const loadingButton = options.loadingButton || null;
  const setBusyState = options.setBusyState !== false;
  if (setBusyState) {
    podcastVideoState.busy = true;
  }
  if (loadingButton) {
    setButtonLoadingState(loadingButton, true, {
      loadingTitle: String(options.loadingTitle || "Generando video de escena...").trim() || "Generando video de escena..."
    });
  }
  updatePodcastPlayerUi();

  try {
    const existingClip = resolveDialogueVideoForRow(getActiveSession(), key);
    upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((item) => (
          String(item?.id || "").trim() === key
            ? { ...item, videoDirective: nextVideoDirective }
            : item
        ))
      }
    }), { render: false });
    const generated = await generateDialogueVideoForRow(key, {
      regenerate: options.regenerate != null ? options.regenerate === true : hasStoredMediaSource(existingClip),
      silent: options.silent === true,
      videoDirective: nextVideoDirective,
      deferTimelineRender: options.deferTimelineRender === true,
      syncStageAfterGenerate: options.syncStageAfterGenerate !== false
    });
    const refreshedSession = getActiveSession();
    const resultingClip = resolveDialogueVideoForRow(refreshedSession, key);
    logPodcastBatchDebug("scene-flow-result", {
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, refreshedSession || session),
      returnedClipUrl: String(generated?.downloadUrl || "").trim(),
      storedClipUrl: String(resultingClip?.downloadUrl || "").trim(),
      storedClipStoragePath: String(resultingClip?.storagePath || "").trim()
    });
    return generated;
  } finally {
    if (loadingButton) {
      setButtonLoadingState(loadingButton, false);
    }
    if (setBusyState) {
      podcastVideoState.busy = false;
    }
    updatePodcastPlayerUi();
  }
}

function syncPodcastStudioInspector(session = null) {
  const activeSession = session || getActiveSession();
  const rows = activeSession?.script?.rows || [];
  const activeRow = rows.find((row) => String(row?.id || "").trim() === String(podcastVideoState.activeRowId || "").trim()) || rows[0] || null;
  const cfg = getPodcastVideoConfig(activeSession);
  if (els.podcastStudioInspectorScene) {
    const label = activeRow
      ? `Escena ${resolveSceneNumberByRowId(activeRow.id, activeSession)} · ${resolveSpeakerDisplayName(activeRow.speaker, activeSession)}`
      : "Escena activa: --";
    els.podcastStudioInspectorScene.textContent = label;
  }
  if (els.podcastStudioInspectorRowEditor) {
    els.podcastStudioInspectorRowEditor.innerHTML = activeRow
      ? buildInspectorScriptRowMarkup(activeSession, activeRow, rows.findIndex((row) => row?.id === activeRow.id))
      : `<div class="podcast-studio-row-editor-empty">Selecciona una escena en el timeline para editar su diálogo y parámetros.</div>`;
  }
  if (els.podcastStudioMasterVolume) {
    els.podcastStudioMasterVolume.value = String(Math.round(cfg.masterVolume));
  }
  if (els.podcastStudioMasterVolumeNumber) {
    els.podcastStudioMasterVolumeNumber.value = String(Math.round(cfg.masterVolume));
  }
  if (els.podcastStudioClipVolume) {
    els.podcastStudioClipVolume.value = String(Math.round(cfg.clipVolume));
  }
  if (els.podcastStudioClipVolumeNumber) {
    els.podcastStudioClipVolumeNumber.value = String(Math.round(cfg.clipVolume));
  }
  if (els.podcastTransitionTypeSelect || els.podcastTransitionDurationRange || els.podcastTransitionDurationLabel) {
    const edge = getActiveTransitionEdge(activeSession);
    const transition = edge.fromRowId && edge.toRowId ? getTransitionForEdge(activeSession, edge.fromRowId, edge.toRowId) : { type: "cut", durationMs: 0 };
    if (els.podcastTransitionTypeSelect) {
      els.podcastTransitionTypeSelect.value = transition.type;
      els.podcastTransitionTypeSelect.disabled = !Boolean(edge.fromRowId && edge.toRowId);
    }
    if (els.podcastTransitionDurationRange) {
      els.podcastTransitionDurationRange.value = String(Math.round(Number(transition.durationMs) || 0));
      els.podcastTransitionDurationRange.disabled = !Boolean(edge.fromRowId && edge.toRowId);
    }
    if (els.podcastTransitionDurationLabel) {
      els.podcastTransitionDurationLabel.textContent = `${Math.round(Number(transition.durationMs) || 0)} ms`;
    }
  }
  renderPodcastTransitionPicker(activeSession);
  const hasAudio = hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, String(activeRow?.id || "").trim()));
  if (els.regenerateDialogueAudioBtn) {
    const key = `${activeSession?.id || ""}:${String(activeRow?.id || "").trim()}`;
    els.regenerateDialogueAudioBtn.disabled = !activeRow || podcastVideoState.busy || dialogueAudioGenerationPending.has(key);
  }
  if (els.deleteDialogueAudioBtn) els.deleteDialogueAudioBtn.disabled = !activeRow || podcastVideoState.busy || !hasAudio;
  if (els.generateDialogueAudioBtn) {
    const key = `${activeSession?.id || ""}:${String(activeRow?.id || "").trim()}`;
    els.generateDialogueAudioBtn.disabled = !activeRow || podcastVideoState.busy || dialogueAudioGenerationPending.has(key);
  }
}

function setTransitionForEdge(fromRowId = "", toRowId = "", type = "cut", durationMs = 0) {
  const from = String(fromRowId || "").trim();
  const to = String(toRowId || "").trim();
  const edgeKey = getTransitionEdgeKey(from, to);
  if (!edgeKey) return;
  const nextType = STUDIO_TRANSITION_TYPES.includes(String(type || "").toLowerCase()) ? String(type).toLowerCase() : "cut";
  const nextDuration = nextType === "cut" ? 0 : Math.max(0, Math.min(1200, Number(durationMs) || 0));
  upsertPodcastVideoConfig((cfg) => {
    const nextTransitions = { ...(cfg.transitionsByEdge || {}) };
    nextTransitions[edgeKey] = {
      type: nextType,
      durationMs: nextDuration
    };
    return {
      ...cfg,
      transitionsByEdge: nextTransitions
    };
  });
  renderPodcastVideoTimeline(getActiveSession());
  renderPodcastTransitionTimeline(getActiveSession());
  syncPodcastStudioInspector(getActiveSession());
}

function setTransitionForActiveEdge(type = "cut", durationMs = 0) {
  const edge = getActiveTransitionEdge(getActiveSession());
  if (!edge.fromRowId || !edge.toRowId) return;
  setTransitionForEdge(edge.fromRowId, edge.toRowId, type, durationMs);
}

function setPodcastVideoRow(rowId = "", options = {}) {
  const session = getActiveSession();
  const key = String(rowId || "").trim() || resolveTargetVideoRowId(getActiveSession());
  const preserveMontageCursor = options.preserveMontageCursor === true;
  const updateScrubber = options.updateScrubber !== false;
  podcastVideoState.activeRowId = key;
  podcastVideoState.timelineLastInteractedRowId = key;
  if (!podcastVideoState.transitionPickerOpen) {
    const rows = session?.script?.rows || [];
    const idx = rows.findIndex((row) => String(row?.id || "").trim() === key);
    const nextRow = idx >= 0 ? rows[idx + 1] : null;
    podcastVideoState.transitionFromRowId = key;
    podcastVideoState.transitionToRowId = String(nextRow?.id || "").trim();
  }
  if (podcastVideoState.montageActive || options.lightweightUi === true) {
    syncPodcastTimelineSelectionUi(session);
    syncPodcastTimelinePlayhead(session);
  } else {
    renderPodcastVideoTimeline(session, { reason: String(options.reason || "structure").trim() || "structure" });
    renderPodcastTransitionTimeline(session);
  }
  syncPodcastStudioInspector(session);
  const clipMap = ensureTimelineClipsByRowId(session);
  const clip = clipMap[key];
  if (clip && updateScrubber && els.podcastStudioScrubber && podcastVideoState.timelineDurationSec > 0) {
    const ratio = Math.max(0, Math.min(1, Number(clip.startMs || 0) / Math.max(100, podcastVideoState.timelineDurationSec * 1000)));
    els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
    if (!preserveMontageCursor) {
      podcastVideoState.montageCursorMs = Math.max(0, Number(clip.startMs || 0));
    }
    syncPodcastTimelinePlayhead(session);
  }
  if (options.syncStage !== false) {
    syncPodcastVideoStageMedia(session, key);
  }
}

function selectTimelineSceneRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  if (!key) return;
  const session = getActiveSession();
  const row = (session?.script?.rows || []).find((item) => String(item?.id || "").trim() === key) || null;
  setPodcastVideoRow(key, {
    syncStage: options.syncStage === true,
    preserveMontageCursor: true,
    lightweightUi: options.syncStage !== true,
    reason: options.syncStage === true ? "playback" : "selection"
  });
  if (row?.speaker) {
    setPodcastVideoSpeaker(session, row.speaker, {
      speaking: false,
      rowId: key,
      syncStageMedia: options.syncStage === true
    });
  }
}

function syncPodcastStudioRuntimeUi(session = null, rowId = "", speaker = "", options = {}) {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!activeSession || !key) return;
  setPodcastVideoRow(key, {
    syncStage: false,
    lightweightUi: true,
    preserveMontageCursor: true,
    updateScrubber: false
  });
  setPodcastVideoSpeaker(activeSession, speaker, {
    speaking: options.speaking !== false,
    rowId: key,
    syncStageMedia: false
  });
}

function syncPodcastVideoStageMedia(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const explicitKey = String(rowId || "").trim();
  const key = explicitKey || String(podcastVideoState.activeRowId || "").trim();
  if (!key && els.podcastActiveSpeakerVideo) {
    try {
      els.podcastActiveSpeakerVideo.pause();
    } catch (_) {
      // noop
    }
    els.podcastActiveSpeakerVideo.removeAttribute("src");
    delete els.podcastActiveSpeakerVideo.dataset.src;
    els.podcastActiveSpeakerVideo.hidden = true;
    setPodcastVideoPortraitFallback(false);
    updatePodcastVideoTransportUi();
    return;
  }
  const clip = resolveDialogueVideoForRow(activeSession, key);
  const segments = resolveDialogueVideoSegments(clip);
  const firstSegment = segments[0] || null;
  const src = resolveStorageVideoUrl(
    firstSegment?.downloadUrl || clip?.downloadUrl || "",
    firstSegment?.storagePath || clip?.storagePath || ""
  );
  if (!els.podcastActiveSpeakerVideo) return;
  if (src) {
    setPodcastVideoPortraitFallback(false);
    const currentSrc = String(els.podcastActiveSpeakerVideo.dataset.src || "").trim();
    if (currentSrc !== src) {
      if (els.podcastActiveSpeakerVideo.dataset.objectUrl) {
        URL.revokeObjectURL(els.podcastActiveSpeakerVideo.dataset.objectUrl);
        delete els.podcastActiveSpeakerVideo.dataset.objectUrl;
      }
      els.podcastActiveSpeakerVideo.src = src;
      els.podcastActiveSpeakerVideo.dataset.src = src;
      if (isSameOriginMediaUrl(src)) {
        els.podcastActiveSpeakerVideo.removeAttribute("crossorigin");
      } else {
        els.podcastActiveSpeakerVideo.crossOrigin = "anonymous";
      }
    }
    els.podcastActiveSpeakerVideo.hidden = false;
    els.podcastActiveSpeakerVideo.muted = false;
    const cfg = getPodcastVideoConfig(activeSession);
    const useNativeVideoAudio = String(cfg.audioMode || "gemini-live-per-scene") === "veo-native-audio";
    const volumePct = useNativeVideoAudio ? toFiniteNumber(cfg.masterVolume, 100) : toFiniteNumber(cfg.clipVolume, 0);
    els.podcastActiveSpeakerVideo.volume = Math.max(0, Math.min(1, volumePct / 100));
    els.podcastActiveSpeakerVideo.playbackRate = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
    if (podcastPlaybackState.active || podcastVideoState.speaking) {
      const playPromise = els.podcastActiveSpeakerVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }
    updatePodcastVideoTransportUi();
    setPodcastVideoStatus(`Escena ${resolveSceneNumberByRowId(key, activeSession)} lista`);
    return;
  }
  if (els.podcastActiveSpeakerVideo) {
    try {
      els.podcastActiveSpeakerVideo.pause();
    } catch (_) {
      // noop
    }
    if (els.podcastActiveSpeakerVideo.dataset.objectUrl) {
      URL.revokeObjectURL(els.podcastActiveSpeakerVideo.dataset.objectUrl);
      delete els.podcastActiveSpeakerVideo.dataset.objectUrl;
    }
    els.podcastActiveSpeakerVideo.removeAttribute("src");
    delete els.podcastActiveSpeakerVideo.dataset.src;
    els.podcastActiveSpeakerVideo.hidden = true;
  }
  setPodcastVideoPortraitFallback(true);
  updatePodcastVideoTransportUi();
  setPodcastVideoStatus(`Escena ${resolveSceneNumberByRowId(key, activeSession)} sin video generado, usando retrato`);
}

async function generateDialogueVideoForRow(rowId = "", options = {}) {
  const session = getActiveSession();
  const sessionId = String(session?.id || "").trim();
  const key = String(rowId || "").trim();
  if (!session || !key) return null;
  const row = (session?.script?.rows || []).find((item) => item.id === key) || null;
  const rows = session?.script?.rows || [];
  const rowIndex = rows.findIndex((item) => String(item?.id || "").trim() === key);
  const previousRow = rowIndex > 0 ? rows[rowIndex - 1] : null;
  const previousRowId = String(previousRow?.id || "").trim();
  const previousClip = previousRowId ? resolveDialogueVideoForRow(session, previousRowId) : null;
  const previousClipPrimary = resolveDialogueVideoSegments(previousClip)[0] || previousClip || null;
  if (!row) return null;
  if (!String(session?.id || "").trim()) {
    throw new Error("La sesión no tiene un ID válido para generar video.");
  }
  const targetSpeechLine = buildTargetSpeechLine(row, session);
  const dialogueText = String(targetSpeechLine || row?.text || "").trim();
  if (!dialogueText) {
    throw new Error(`La escena ${resolveSceneNumberByRowId(key, session)} no tiene diálogo. Agrega texto antes de generar video.`);
  }
  const speakerLabel = String(row?.speaker || "").trim();
  if (!speakerLabel) {
    throw new Error(`La escena ${resolveSceneNumberByRowId(key, session)} no tiene locutor asignado.`);
  }
  const voiceName = resolveConfiguredSpeakerVoiceForGeneration(speakerLabel, session);
  const voiceProfile = resolveAgentVoiceProfile(voiceName, voiceName);
  const counterpartSpeakerLabel = getSpeakerOptions(session).find((host) => host !== speakerLabel) || "";
  const counterpartSpeakerName = counterpartSpeakerLabel ? resolveSpeakerDisplayName(counterpartSpeakerLabel, session) : "";
  const scenarioPrompt = resolveSpeakerStudioScenarioPrompt(session, speakerLabel, { expression: row.expression });
  const pendingKey = `${sessionId}:${key}`;
  if (dialogueVideoGenerationTasks.has(pendingKey)) {
    logPodcastBatchDebug("generate-row-await-existing-task", {
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, session),
      pendingKey
    });
    return dialogueVideoGenerationTasks.get(pendingKey);
  }
  if (dialogueVideoGenerationPending.has(pendingKey)) return null;
  const currentMap = getDialogueVideoMap(session);
  const previousStoragePath = String(currentMap?.[key]?.storagePath || "").trim();
  const regenerate = options.regenerate === true;
  const silent = options.silent === true;
  const deferTimelineRender = options.deferTimelineRender === true;
  const videoCfg = getPodcastVideoConfig(session);
  const cheapVideoMode = options.cheapVideoMode === true || videoCfg.cheapVideoMode === true;
  const videoDirective = String(options.videoDirective || row?.videoDirective || "").replace(/\s+/g, " ").trim();
  const performanceDirective = buildScenePerformanceDirective(row, videoDirective);
  const syncStageAfterGenerate = options.syncStageAfterGenerate !== false;
  let portrait = resolvePortraitForSpeaker(session, row.speaker);
  let portraitUrl = String(portrait?.downloadUrl || "").trim();
  let portraitStoragePath = String(portrait?.storagePath || "").trim();
  if (!portraitUrl && !portraitStoragePath) {
    logPodcastBatchDebug("generate-row-fail-no-portrait", {
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, session),
      speaker: speakerLabel
    });
    throw new Error(`La escena ${resolveSceneNumberByRowId(key, session)} no tiene retrato base. Genera el retrato del locutor manualmente antes de crear video.`);
  }
  let audioClip = resolveDialogueAudioForRow(session, key);
  if (!hasStoredMediaSource(audioClip)) {
    logPodcastBatchDebug("generate-row-no-audio-continue", {
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, session),
      speaker: speakerLabel
    });
    audioClip = null;
  }
  const audioDurationSec = Math.max(0, Number(audioClip?.durationSec) || 0);

  const task = (async () => {
    dialogueVideoGenerationPending.add(pendingKey);
    logPodcastBatchDebug("generate-row-task-start", {
      rowId: key,
      sceneNumber: resolveSceneNumberByRowId(key, session),
      audioDurationSec,
      regenerate,
      silent,
      deferTimelineRender,
      syncStageAfterGenerate
    });
    if (!silent) {
      setGenerationStatus(`Generando video Veo para escena ${resolveSceneNumberByRowId(key, session)}...`, "is-busy");
    }
    setPodcastVideoStatus(`Generando Video de la Escena ${resolveSceneNumberByRowId(key, session)}`);
    try {
      const segmentCount = cheapVideoMode
        ? 1
        : Math.max(1, Math.min(12, Math.ceil(Math.max(0.1, audioDurationSec || 0.1) / 8)));
      const textSegments = splitDialogueTextIntoSegments(dialogueText, segmentCount);
      const generatedSegments = [];
      for (let i = 0; i < textSegments.length; i += 1) {
        const segmentText = String(textSegments[i] || "").trim();
        if (!segmentText) continue;
        const remainingSec = 8;
        logPodcastBatchDebug("generate-row-request", {
          rowId: key,
          sceneNumber: resolveSceneNumberByRowId(key, session),
          segmentIndex: i,
          segmentCount: textSegments.length,
          textPreview: segmentText.slice(0, 120)
        });
        const requestBody = {
          sessionId: session.id,
          rowId: key,
          speakerLabel,
          speakerName: resolveSpeakerDisplayName(speakerLabel, session),
          counterpartSpeakerLabel,
          counterpartSpeakerName,
          voiceName,
          genderGroup: String(voiceProfile?.genderGroup || "").trim(),
          expression: String(row.expression || "Neutral").trim() || "Neutral",
          scenarioPrompt,
          videoDirective,
          performanceDirective,
          text: segmentText.slice(0, 1600),
          targetSpeechLine: segmentText.slice(0, 1600),
          originalText: String(row?.text || "").trim().slice(0, 1600),
          dialogueAudioUrl: String(audioClip?.downloadUrl || "").trim(),
          dialogueAudioStoragePath: String(audioClip?.storagePath || "").trim(),
          audioDurationSec,
          requestedDurationSec: remainingSec,
          segmentIndex: i,
          segmentCount: textSegments.length,
          portraitUrl,
          portraitStoragePath,
          previousScene: previousRow
            ? {
                rowId: previousRowId,
                sceneNumber: rowIndex,
                speakerLabel: String(previousRow?.speaker || "").trim(),
                speakerName: resolveSpeakerDisplayName(String(previousRow?.speaker || "").trim(), session),
                expression: String(previousRow?.expression || "Neutral").trim() || "Neutral",
                text: String(previousRow?.text || "").trim().slice(0, 1600),
                targetSpeechLine: String(buildTargetSpeechLine(previousRow, session) || previousRow?.text || "").trim().slice(0, 1600),
                previousVideoTargetSpeechLine: String(previousClipPrimary?.targetSpeechLine || "").trim().slice(0, 1600),
                hasVideo: Boolean(String(previousClipPrimary?.downloadUrl || "").trim())
              }
            : null,
          strictIdentity: true,
          model: cheapVideoMode ? "veo-3.1-fast-generate-preview" : "veo-3.1-generate-preview",
          modelCandidates: cheapVideoMode
            ? ["veo-3.1-fast-generate-preview"]
            : ["veo-3.1-generate-preview", "veo-3.1-fast-generate-preview"],
          regenerate: regenerate && i === 0,
          previousStoragePath: regenerate && i === 0 ? previousStoragePath : ""
        };
        let response = null;
        let lastError = null;
        const maxAttempts = cheapVideoMode ? 2 : 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          const waitMs = Math.max(0, nextDialogueVideoRequestAt - Date.now());
          if (waitMs > 0) {
            if (!silent) {
              setGenerationStatus(`Esperando cupo para Veo (${Math.ceil(waitMs / 1000)} s)...`, "is-busy");
            }
            await sleep(waitMs);
          }
          nextDialogueVideoRequestAt = Date.now() + 1200;
          try {
            response = await authFetchJson("/api/podcaster/dialogue-videos/generate", {
              method: "POST",
              body: JSON.stringify(requestBody)
            });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            const status = Number(error?.status || 0);
            if (status !== 429 || attempt >= maxAttempts) {
              throw error;
            }
            const backoffMs = Math.min(30000, 2500 * (2 ** (attempt - 1)));
            nextDialogueVideoRequestAt = Date.now() + backoffMs;
            logPodcastBatchDebug("generate-row-rate-limited", {
              rowId: key,
              sceneNumber: resolveSceneNumberByRowId(key, session),
              segmentIndex: i,
              attempt,
              backoffMs
            });
            if (!silent) {
              setGenerationStatus(`Veo saturado. Reintentando en ${Math.ceil(backoffMs / 1000)} s...`, "is-busy");
            }
            await sleep(backoffMs);
          }
        }
        if (!response && lastError) throw lastError;
        const clip = response?.dialogueVideo && typeof response.dialogueVideo === "object" ? response.dialogueVideo : null;
        if (!hasStoredMediaSource(clip)) {
          throw new Error(`No se recibió video del segmento ${i + 1}.`);
        }
        generatedSegments.push({
          id: `${key}-seg-${i + 1}`,
          index: i,
          durationSec: Math.max(0, Number(clip.durationSec) || remainingSec),
          downloadUrl: String(clip.downloadUrl || "").trim(),
          storagePath: String(clip.storagePath || "").trim(),
          mimeType: String(clip.mimeType || "video/mp4").trim() || "video/mp4",
          variant: String(clip.variant || "").trim(),
          targetSpeechLine: segmentText
        });
      }
      const first = generatedSegments[0] || null;
      if (!hasStoredMediaSource(first)) {
        throw new Error("No se pudo generar ningún segmento de video para la escena.");
      }
      const totalVideoDurationSec = generatedSegments.reduce((acc, seg) => acc + Math.max(0, Number(seg.durationSec) || 0), 0);
      upsertSessionById(sessionId, (current) => ({
        ...current,
        dialogueVideoMap: {
          ...getDialogueVideoMap(current),
          [key]: {
            rowId: key,
            speaker: String(row.speaker || "").trim(),
            downloadUrl: String(first.downloadUrl || "").trim(),
            storagePath: String(first.storagePath || "").trim(),
            mimeType: String(first.mimeType || "video/mp4").trim() || "video/mp4",
            model: "veo-3.1-generate-preview",
            variant: String(first.variant || "").trim(),
            promptVersion: "podcaster_veo_v1",
            videoDirective,
            durationSec: Math.max(0, Number(totalVideoDurationSec) || 0),
            targetSpeechLine: dialogueText.slice(0, 2200),
            segments: generatedSegments,
            updatedAt: nowIso()
          }
        }
      }), { render: false });
      logPodcastBatchDebug("generate-row-task-stored", {
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        segments: generatedSegments.length,
        totalVideoDurationSec,
        firstDownloadUrl: String(first.downloadUrl || "").trim(),
        firstStoragePath: String(first.storagePath || "").trim()
      });
      brokenDialogueVideoRows.delete(`${sessionId}:${key}`);
      const refreshed = state.sessions.find((item) => String(item?.id || "").trim() === sessionId) || null;
      if (String(state.activeSessionId || "").trim() === sessionId && podcastVideoState.activeRowId === key && syncStageAfterGenerate) {
        syncPodcastVideoStageMedia(refreshed, key);
      }
      if (String(state.activeSessionId || "").trim() === sessionId && !deferTimelineRender) {
        renderPodcastVideoTimeline(refreshed);
        renderPodcastTransitionTimeline(refreshed);
        syncPodcastStudioInspector(refreshed);
        updatePodcastPlayerUi();
      }
      if (!silent) {
        setGenerationStatus(`Video Veo listo para escena ${resolveSceneNumberByRowId(key, refreshed)}`, "is-live");
      }
      return first;
    } catch (error) {
      logPodcastBatchDebug("generate-row-task-error", {
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        message: String(error?.message || "error desconocido")
      });
      throw error;
    } finally {
      dialogueVideoGenerationPending.delete(pendingKey);
      dialogueVideoGenerationTasks.delete(pendingKey);
      logPodcastBatchDebug("generate-row-task-end", {
        rowId: key,
        sceneNumber: resolveSceneNumberByRowId(key, session),
        pendingKey
      });
    }
  })();
  dialogueVideoGenerationTasks.set(pendingKey, task);
  return task;
}

function removeDialogueAudioForRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  if (!key) return;
  const silent = options.silent === true;
  upsertActiveSession((current) => {
    const nextMap = { ...getDialogueAudioMap(current) };
    delete nextMap[key];
    return {
      ...current,
      dialogueAudioMap: nextMap
    };
  }, { render: false });
  if (!silent) {
    setGenerationStatus(`Voz eliminada de escena ${resolveSceneNumberByRowId(key, getActiveSession())}`, "is-live");
  }
  syncPodcastStudioInspector(getActiveSession());
}

async function generateDialogueAudioForRow(rowId = "", options = {}) {
  await refreshRuntimeFeatureCapabilities();
  const session = getActiveSession();
  const sessionId = String(session?.id || "").trim();
  const key = String(rowId || "").trim();
  if (!session || !key) return null;
  const row = (session?.script?.rows || []).find((item) => item.id === key) || null;
  if (!row) return null;
  if (!String(session?.id || "").trim()) {
    throw new Error("La sesión no tiene un ID válido para generar voz.");
  }
  const targetSpeechLine = buildTargetSpeechLine(row, session);
  const dialogueText = String(targetSpeechLine || row?.text || "").trim();
  if (!dialogueText) {
    throw new Error(`La escena ${resolveSceneNumberByRowId(key, session)} no tiene diálogo.`);
  }
  const speakerLabel = String(row?.speaker || "").trim();
  if (!speakerLabel) {
    throw new Error(`La escena ${resolveSceneNumberByRowId(key, session)} no tiene locutor asignado.`);
  }
  const pendingKey = `${sessionId}:${key}`;
  if (runtimeFeatureState.dialogueAudioUnavailable) {
    if (!runtimeFeatureState.dialogueAudioUnavailableWarned) {
      runtimeFeatureState.dialogueAudioUnavailableWarned = true;
      addChatMessage("system", "El backend activo no expone /api/podcaster/dialogue-audio/generate. Se usará fallback Live por escena sin cache de voz.");
    }
    return null;
  }
  if (dialogueAudioGenerationPending.has(pendingKey)) return null;
  const currentMap = getDialogueAudioMap(session);
  const previousStoragePath = String(currentMap?.[key]?.storagePath || "").trim();
  const regenerate = options.regenerate === true;
  const silent = options.silent === true;
  const disfluencyInstruction = buildDisfluencyInstruction(row);
  const desiredDurationSec = Math.max(1, Number(row?.durationSec || 0));
  const durationRateHint = computeDurationSpeedMultiplier(dialogueText, desiredDurationSec, { min: 0.7, max: 1.9 });
  dialogueAudioGenerationPending.add(pendingKey);
  if (!silent) {
    setGenerationStatus(`Generando voz Gemini Live para escena ${resolveSceneNumberByRowId(key, session)}...`, "is-busy");
  }
  setPodcastVideoStatus(`Generando voz: ${resolveSpeakerDisplayName(row.speaker, session)}...`);
  try {
    let response = null;
    try {
      response = await authFetchJson("/api/podcaster/dialogue-audio/generate", {
        method: "POST",
        signal: options?.signal,
        body: JSON.stringify({
          sessionId: session.id,
          rowId: key,
          speakerLabel,
          speakerName: resolveSpeakerDisplayName(speakerLabel, session),
          voiceName: resolveSpeakerVoiceName(speakerLabel, session),
          expression: String(row.expression || "Neutral").trim() || "Neutral",
          text: dialogueText.slice(0, 2000),
          originalText: String(row?.text || "").trim().slice(0, 2000),
          targetSpeechLine: dialogueText.slice(0, 2000),
          desiredDurationSec,
          durationRateHint: Number(durationRateHint.toFixed(3)),
          disfluencyInstruction: String(disfluencyInstruction || "").trim().slice(0, 1800),
          notes: String(row?.notes || "").trim().slice(0, 1200),
          regenerate,
          previousStoragePath,
          model: resolveDialogueAudioModel()
        })
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      const detail = String(error?.message || "").trim().toLowerCase();
      if (detail.includes("http 404") || detail.includes("not found")) {
        runtimeFeatureState.dialogueAudioUnavailable = true;
        if (!runtimeFeatureState.dialogueAudioUnavailableWarned) {
          runtimeFeatureState.dialogueAudioUnavailableWarned = true;
          addChatMessage("system", "No se encontró el endpoint de audio por escena (HTTP 404). Activé fallback Live para continuar sin romper Studio.");
        }
        if (!silent) {
          setGenerationStatus("Fallback Live activo", "is-live");
        }
        return null;
      }
      throw error;
    }
    const clip = response?.dialogueAudio && typeof response.dialogueAudio === "object" ? response.dialogueAudio : null;
    if (!hasStoredMediaSource(clip)) {
      throw new Error("No se recibió audio del diálogo desde backend.");
    }
    upsertSessionById(sessionId, (current) => ({
      ...current,
      dialogueAudioMap: {
        ...getDialogueAudioMap(current),
        [key]: {
          rowId: key,
          speaker: String(row.speaker || "").trim(),
          downloadUrl: String(clip.downloadUrl || "").trim(),
          storagePath: String(clip.storagePath || "").trim(),
          mimeType: String(clip.mimeType || "audio/wav").trim() || "audio/wav",
          model: String(clip.model || resolveDialogueAudioModel()).trim() || resolveDialogueAudioModel(),
          promptVersion: String(clip.promptVersion || "podcaster_live_audio_v1").trim() || "podcaster_live_audio_v1",
          durationSec: Math.max(0, Number(clip.durationSec) || 0),
          targetSpeechLine: String(clip.targetSpeechLine || dialogueText).trim().slice(0, 2200),
          updatedAt: String(clip.updatedAt || nowIso()).trim() || nowIso()
        }
      }
    }), { render: false });
    const refreshed = state.sessions.find((item) => String(item?.id || "").trim() === sessionId) || null;
    if (!silent) {
      setGenerationStatus(`Voz lista para escena ${resolveSceneNumberByRowId(key, refreshed)}`, "is-live");
    }
    if (String(state.activeSessionId || "").trim() === sessionId) {
      syncPodcastStudioInspector(refreshed);
      renderPodcastVideoShell(refreshed);
    }
    return clip;
  } finally {
    dialogueAudioGenerationPending.delete(pendingKey);
  }
}

function beginConnectScriptPanelGeneration(messageId = "") {
  const cleanMessageId = String(messageId || "").trim();
  if (connectScriptPanelGenerationState.abortController) {
    connectScriptPanelGenerationState.abortController.abort();
  }
  connectScriptPanelGenerationState.active = true;
  connectScriptPanelGenerationState.messageId = cleanMessageId;
  connectScriptPanelGenerationState.abortController = new AbortController();
  connectScriptPanelGenerationState.token = Date.now();
  renderChat(getActiveSession());
  return {
    token: connectScriptPanelGenerationState.token,
    signal: connectScriptPanelGenerationState.abortController.signal
  };
}

async function cancelConnectScriptPanelGeneration(options = {}) {
  if (!connectScriptPanelGenerationState.active) return false;
  connectScriptPanelGenerationState.abortController?.abort();
  connectScriptPanelGenerationState.active = false;
  connectScriptPanelGenerationState.messageId = "";
  connectScriptPanelGenerationState.abortController = null;
  connectScriptPanelGenerationState.token = 0;
  stopRowAudio();
  await stopGeminiLiveSession().catch(() => {});
  renderChat(getActiveSession());
  if (options.silent !== true) {
    setGenerationStatus("Generación detenida", "is-live");
    addChatMessage("system", "Se detuvo la conexión del guión al panel y la generación de audios.");
  }
  return true;
}

async function generateDialogueAudioForConnectedScript(session = null, options = {}) {
  const currentSession = session || getActiveSession();
  const rows = Array.isArray(currentSession?.script?.rows) ? currentSession.script.rows : [];
  if (!currentSession || !rows.length) return { generated: 0, failed: 0 };
  let generated = 0;
  let failed = 0;
  const activeToken = Number(options?.token || 0);
  for (const row of rows) {
    if (activeToken && activeToken !== connectScriptPanelGenerationState.token) {
      throw new DOMException("Conexión cancelada", "AbortError");
    }
    if (options?.signal?.aborted) {
      throw new DOMException("Conexión cancelada", "AbortError");
    }
    const rowId = String(row?.id || "").trim();
    if (!rowId) continue;
    try {
      const clip = await generateDialogueAudioForRow(rowId, {
        regenerate: options.regenerate === true,
        silent: true,
        signal: options?.signal
      });
      if (clip && hasStoredMediaSource(clip)) {
        generated += 1;
      } else {
        failed += 1;
      }
      setGenerationStatus(`Generando audios de escenas (${generated + failed}/${rows.length})...`, "is-busy");
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      failed += 1;
      addChatMessage("system", `No se pudo generar el audio de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
    }
  }
  return { generated, failed };
}

const podcastStudioPlayback = createPodcasterStudioPlayback({
  els,
  podcastVideoState,
  STUDIO_TIMELINE_MIN_CLIP_MS,
  STUDIO_TIMELINE_SNAP_MS,
  getActiveSession,
  getPodcastVideoConfig,
  toFiniteNumber,
  syncPodcastTimelinePlayhead,
  secondsToClock,
  setPodcastVideoStatus,
  updatePodcastVideoTransportUi,
  setPodcastVideoRow,
  setPodcastVideoSpeaker,
  syncPodcastStudioRuntimeUi,
  syncPodcastVideoStageMedia,
  getTransitionForEdge,
  applyStudioTransition,
  primePodcastStageVideoSource,
  setPodcastStageVideoSource,
  buildTimelineRuntimeEntries,
  getTimelineTotalDurationMs,
  getPanelMontageMusicConfig
});

function stopPodcastStudioMontage(options = {}) {
  return podcastStudioPlayback.stopPodcastStudioMontage(options);
}

function pausePodcastStudioMontage() {
  return podcastStudioPlayback.pausePodcastStudioMontage();
}

function syncMontageAudioPlayers(activeEntries = [], currentMs = 0, speed = 1) {
  return podcastStudioPlayback.syncMontageAudioPlayers(activeEntries, currentMs, speed);
}

async function syncStudioTimelinePreview(currentMs = 0, runtimeEntries = []) {
  return podcastStudioPlayback.syncStudioTimelinePreview(currentMs, runtimeEntries);
}

function waitVideoEnd(videoEl = null, timeoutMs = 120000) {
  if (!videoEl) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      videoEl.removeEventListener("ended", onEnded);
      clearTimeout(timer);
      resolve();
    };
    const onEnded = () => close();
    const timer = setTimeout(close, timeoutMs);
    videoEl.addEventListener("ended", onEnded, { once: true });
  });
}

function waitAudioEnd(audioEl = null, timeoutMs = 120000) {
  if (!audioEl) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      audioEl.removeEventListener("ended", onEnded);
      clearTimeout(timer);
      resolve();
    };
    const onEnded = () => close();
    const timer = setTimeout(close, timeoutMs);
    audioEl.addEventListener("ended", onEnded, { once: true });
  });
}

async function primePodcastStageVideoSource(src = "") {
  const cleanSrc = String(src || "").trim();
  if (!cleanSrc) return false;
  if (!podcastStageVideoPreloader) {
    podcastStageVideoPreloader = document.createElement("video");
    podcastStageVideoPreloader.preload = "auto";
    podcastStageVideoPreloader.muted = true;
    podcastStageVideoPreloader.playsInline = true;
  }
  if (isSameOriginMediaUrl(cleanSrc)) {
    podcastStageVideoPreloader.removeAttribute("crossorigin");
  } else {
    podcastStageVideoPreloader.crossOrigin = "anonymous";
  }
  if (podcastStageVideoPreloadSrc !== cleanSrc || podcastStageVideoPreloader.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    podcastStageVideoPreloadSrc = cleanSrc;
    podcastStageVideoPreloader.src = cleanSrc;
    podcastStageVideoPreloader.load();
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        podcastStageVideoPreloader.removeEventListener("loadeddata", onReady);
        podcastStageVideoPreloader.removeEventListener("canplay", onReady);
        resolve();
      };
      const onReady = () => done();
      podcastStageVideoPreloader.addEventListener("loadeddata", onReady, { once: true });
      podcastStageVideoPreloader.addEventListener("canplay", onReady, { once: true });
      setTimeout(done, 1200);
    });
  }
  return true;
}

async function setPodcastStageVideoSource(src = "") {
  if (!els.podcastActiveSpeakerVideo) return false;
  const cleanSrc = String(src || "").trim();
  if (!cleanSrc) return false;
  setPodcastVideoPortraitFallback(false);
  const video = els.podcastActiveSpeakerVideo;
  if (String(video.dataset.src || "").trim() === cleanSrc && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return true;
  }
  await primePodcastStageVideoSource(cleanSrc);
  if (els.podcastActiveSpeakerVideo.dataset.objectUrl) {
    URL.revokeObjectURL(els.podcastActiveSpeakerVideo.dataset.objectUrl);
    delete els.podcastActiveSpeakerVideo.dataset.objectUrl;
  }
  video.src = cleanSrc;
  video.dataset.src = cleanSrc;
  if (isSameOriginMediaUrl(cleanSrc)) {
    video.removeAttribute("crossorigin");
  } else {
    video.crossOrigin = "anonymous";
  }
  video.hidden = false;
  video.preload = "auto";
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    video.load();
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        resolve();
      };
      const onReady = () => done();
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("canplay", onReady, { once: true });
      setTimeout(done, 500);
    });
  }
  return true;
}

async function waitForStudioLiveDrain(rowId = "", timeoutMs = 120000) {
  const startedAt = Date.now();
  const key = String(rowId || "").trim();
  while (Date.now() - startedAt < timeoutMs) {
    if (!playingRowId && isGeminiLiveAudioDrained()) return true;
    if (key && playingRowId && String(playingRowId || "").trim() !== key && isGeminiLiveAudioDrained()) return true;
    await sleep(80);
  }
  return false;
}

async function waitForStandaloneRowPlayback(rowId = "", timeoutMs = 120000) {
  const startedAt = Date.now();
  const key = String(rowId || "").trim();
  while (Date.now() - startedAt < timeoutMs) {
    if (podcastPlaybackState.currentRowStatus === "error") return false;
    if (!key && !playingRowId && isGeminiLiveAudioDrained()) return true;
    if (podcastPlaybackState.currentRowStatus === "success" && !playingRowId) return true;
    if (key && !playingRowId && rowPlaybackTimerState.rowId === key) return true;
    await sleep(80);
  }
  return false;
}

async function applyStudioTransition(transition = { type: "cut", durationMs: 0 }) {
  const type = String(transition?.type || "cut").toLowerCase();
  const durationMs = Math.max(0, Math.min(1200, Number(transition?.durationMs) || 0));
  if (!durationMs || type === "cut") return;
  if (!els.podcastActiveSpeakerVideo) {
    await sleep(durationMs);
    return;
  }
  const video = els.podcastActiveSpeakerVideo;
  const previousTransition = video.style.transition;
  const previousTransform = video.style.transform;
  const previousFilter = video.style.filter;
  if (type === "crossfade") {
    video.style.transition = `opacity ${durationMs}ms ease`;
    video.style.opacity = "0";
    await sleep(durationMs);
    video.style.opacity = "1";
  } else if (type === "dip-black") {
    if (els.podcastStudioDipOverlay) {
      els.podcastStudioDipOverlay.style.background = "#020617";
      els.podcastStudioDipOverlay.classList.add("is-active");
      await sleep(Math.round(durationMs * 0.5));
      els.podcastStudioDipOverlay.classList.remove("is-active");
      await sleep(Math.round(durationMs * 0.5));
    } else {
      await sleep(durationMs);
    }
  } else if (type === "flash-white") {
    if (els.podcastStudioDipOverlay) {
      els.podcastStudioDipOverlay.style.background = "#f8fafc";
      els.podcastStudioDipOverlay.classList.add("is-active");
      await sleep(Math.max(80, Math.round(durationMs * 0.28)));
      els.podcastStudioDipOverlay.classList.remove("is-active");
      await sleep(Math.max(80, Math.round(durationMs * 0.72)));
      els.podcastStudioDipOverlay.style.background = "#020617";
    } else {
      await sleep(durationMs);
    }
  } else if (type === "slide-left") {
    video.style.transition = `transform ${durationMs}ms ease, opacity ${durationMs}ms ease`;
    video.style.transform = "translateX(-14px)";
    video.style.opacity = "0.68";
    await sleep(durationMs);
    video.style.transform = "translateX(0)";
    video.style.opacity = "1";
  } else if (type === "zoom-in") {
    video.style.transition = `transform ${durationMs}ms ease, filter ${durationMs}ms ease`;
    video.style.transform = "scale(1.04)";
    video.style.filter = "saturate(1.08)";
    await sleep(durationMs);
    video.style.transform = "scale(1)";
    video.style.filter = "none";
  } else {
    await sleep(durationMs);
  }
  video.style.transition = previousTransition || "";
  video.style.transform = previousTransform || "";
  video.style.filter = previousFilter || "";
}

async function playSceneInStudio(row = null, options = {}) {
  const session = getActiveSession();
  if (!session || !row) return false;
  const rowId = String(row.id || "").trim();
  if (!rowId) return false;
  setPodcastVideoRow(rowId, { syncStage: true });
  setPodcastVideoSpeaker(session, row.speaker, { speaking: false, rowId });
  const clip = resolveDialogueVideoForRow(session, rowId);
  const segments = resolveDialogueVideoSegments(clip);
  const timelineClip = ensureTimelineClipsByRowId(session)[rowId] || null;
  const trimInSec = Math.max(0, Number(timelineClip?.trimInMs || 0) / 1000);
  const trimOutSec = Math.max(trimInSec + 0.2, Number(timelineClip?.trimOutMs || 0) / 1000);
  const audioClip = resolveDialogueAudioForRow(session, rowId);
  const audioReady = audioClip?.downloadUrl ? audioClip : null;
  const audioSrc = resolveStorageAudioUrl(audioReady?.downloadUrl || "", audioReady?.storagePath || "");
  const cfg = getPodcastVideoConfig(session);
  const preferredAudioMode = String(cfg.audioMode || "gemini-live-per-scene");
  const hasSceneVoiceTrack = Boolean(audioSrc);
  // Prioritize the configured per-scene voice track to keep voice identity consistent.
  const useNativeVideoAudio = preferredAudioMode === "veo-native-audio" && !hasSceneVoiceTrack;
  const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
  if (!segments.length) {
    setPodcastVideoPortraitFallback(true);
    setPodcastVideoStatus(`Escena ${resolveSceneNumberByRowId(rowId, session)} sin video, reproduciendo retrato`);
    const started = await playRowAudio(rowId, { speedMultiplier: speed });
    if (!started) return false;
    return waitForStandaloneRowPlayback(
      rowId,
      Math.max(4000, Math.round((Number(row.durationSec) || 8) * 1400))
    );
  }
  const totalSegmentDurationSec = Math.max(
    0.1,
    segments.reduce((acc, segment) => acc + Math.max(0.1, Number(segment?.durationSec) || 0), 0)
  );
  let syncedVideoRate = speed;
  let audioDurationSec = Math.max(0, Number(audioReady?.durationSec) || 0);
  const videoVolume = Math.max(0, Math.min(1, Number((useNativeVideoAudio ? cfg.masterVolume : cfg.clipVolume) || 0) / 100));
  if (els.podcastActiveSpeakerVideo) {
    els.podcastActiveSpeakerVideo.volume = videoVolume;
    els.podcastActiveSpeakerVideo.playbackRate = syncedVideoRate;
  }
  if (podcastVideoState.audioEl) {
    try { podcastVideoState.audioEl.pause(); } catch (_) {}
    podcastVideoState.audioEl = null;
  }
  if (!useNativeVideoAudio && audioSrc) {
    const audio = new Audio(audioSrc);
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(1, toFiniteNumber(cfg.masterVolume, 100) / 100));
    audio.playbackRate = speed;
    podcastVideoState.audioEl = audio;
    await new Promise((resolve) => {
      const done = () => resolve();
      audio.addEventListener("loadedmetadata", done, { once: true });
      setTimeout(done, 1200);
    });
    audioDurationSec = Math.max(audioDurationSec, Number(audio.duration || 0));
    if (Number.isFinite(trimInSec) && trimInSec > 0) {
      try {
        audio.currentTime = trimInSec;
      } catch (_) {
        // noop
      }
    }
    if (audioDurationSec > 0 && totalSegmentDurationSec > 0) {
      // Sync video pace to audio length to avoid "video slow vs audio".
      syncedVideoRate = Math.max(0.5, Math.min(2.25, speed * (totalSegmentDurationSec / audioDurationSec)));
      if (els.podcastActiveSpeakerVideo) {
        els.podcastActiveSpeakerVideo.playbackRate = syncedVideoRate;
      }
    }
    await safeMediaPlay(audio);
  } else if (runtimeFeatureState.dialogueAudioUnavailable) {
    await playRowAudio(rowId, { speedMultiplier: speed });
    await waitForStudioLiveDrain(rowId, Math.max(5000, Math.round((Number(row.durationSec) || 10) * 1200)));
  }
  const hasAudioTrack = !useNativeVideoAudio && hasSceneVoiceTrack;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const segmentSrc = resolveStorageVideoUrl(segment?.downloadUrl || "", segment?.storagePath || "");
    if (!segmentSrc) continue;
    await setPodcastStageVideoSource(segmentSrc);
    if (els.podcastActiveSpeakerVideo) {
      const shouldApplyTrimWindow = segments.length === 1 && Number.isFinite(trimInSec) && Number.isFinite(trimOutSec);
      els.podcastActiveSpeakerVideo.currentTime = shouldApplyTrimWindow ? Math.max(0, trimInSec) : 0;
      els.podcastActiveSpeakerVideo.playbackRate = syncedVideoRate;
      await playPodcastStageVideo({ restart: true, silent: false, playbackRate: syncedVideoRate, volume: videoVolume });
    }
    const trimmedSec = segments.length === 1
      ? Math.max(0.5, Math.min(Math.max(0.5, Number(segment?.durationSec) || 8), trimOutSec) - Math.max(0, trimInSec))
      : Math.max(0.5, Number(segment?.durationSec) || 8);
    const segmentDurationMs = Math.max(500, Math.round((trimmedSec) * 1000 / syncedVideoRate));
    if (hasAudioTrack) {
      await Promise.race([
        waitVideoEnd(els.podcastActiveSpeakerVideo, segmentDurationMs + 1800),
        sleep(segmentDurationMs)
      ]);
    } else {
      await Promise.race([
        waitVideoEnd(els.podcastActiveSpeakerVideo, segmentDurationMs + 1800),
        waitAudioEnd(podcastVideoState.audioEl, segmentDurationMs + 1800),
        sleep(segmentDurationMs)
      ]);
    }
  }
  if (segments.length === 1 && podcastVideoState.audioEl && Number.isFinite(trimOutSec) && trimOutSec > 0) {
    try {
      podcastVideoState.audioEl.pause();
    } catch (_) {
      // noop
    }
  }
  if (els.podcastStudioTime) {
    const current = Number(els.podcastActiveSpeakerVideo?.currentTime || 0);
    els.podcastStudioTime.textContent = `${secondsToClock(current)} / ${secondsToClock(podcastVideoState.timelineDurationSec || 0)}`;
  }
  if (hasAudioTrack) {
    await Promise.race([
      waitAudioEnd(podcastVideoState.audioEl, Math.max(1500, Math.round((audioDurationSec || Number(row.durationSec) || 8) * 1200))),
      sleep(Math.max(1200, Math.round((audioDurationSec || Number(row.durationSec) || 8) * 1000)))
    ]);
  }
  return true;
}

async function playPodcastStudioMontage(startAtMs = null) {
  return podcastStudioPlayback.playPodcastStudioMontage(startAtMs);
}

function setPodcastVideoOpen(isOpen) {
  podcastVideoState.enabled = Boolean(isOpen);
  if (!podcastVideoState.enabled) {
    setAudioTrackMixOpen(false);
    podcastVideoState.activeRowId = "";
    setPodcastTransitionPickerOpen(false);
    resetPodcastMouth();
    stopPodcastStudioMontage();
    syncPodcastVideoStageMedia(getActiveSession(), "");
  }
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = !podcastVideoState.enabled;
  }
  if (els.togglePodcastVideoBtn) {
    els.togglePodcastVideoBtn.classList.toggle("is-active", podcastVideoState.enabled);
    els.togglePodcastVideoBtn.setAttribute("title", podcastVideoState.enabled ? "Ocultar video" : "Mostrar video");
  }
  syncPodcastVideoSpeakerCardVisibility();
  upsertActiveSession((session) => ({
    ...session,
    podcastVideoConfig: normalizePodcastVideoConfig({
      ...(session.podcastVideoConfig || {}),
      enabled: podcastVideoState.enabled,
      editorEnabled: true
    })
  }), { render: false });
}

function setPodcastVideoLoaderOpen(isOpen = false) {
  if (els.podcastVideoLoader) {
    els.podcastVideoLoader.hidden = !isOpen;
  }
}

async function openPodcastVideoModalWithLoader() {
  const runToken = ++podcastVideoOpenRunToken;
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = false;
  }
  setPodcastVideoLoaderOpen(true);
  await sleep(950);
  if (runToken !== podcastVideoOpenRunToken) return;
  setPodcastVideoOpen(true);
  renderPodcastVideoShell(getActiveSession());
  setPodcastVideoRow(resolveTargetVideoRowId(getActiveSession()), { syncStage: true });
  setPodcastVideoStatus("Video activado");
  setPodcastVideoLoaderOpen(false);
}

function closePodcastVideoModal() {
  podcastVideoOpenRunToken += 1;
  setPodcastVideoLoaderOpen(false);
  stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
  setAudioTrackMixOpen(false);
  podcastVideoState.enabled = false;
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = true;
  }
  if (els.togglePodcastVideoBtn) {
    els.togglePodcastVideoBtn.classList.remove("is-active");
    els.togglePodcastVideoBtn.setAttribute("title", "Mostrar video");
  }
  syncPodcastVideoSpeakerCardVisibility();
  upsertActiveSession((session) => ({
    ...session,
    podcastVideoConfig: normalizePodcastVideoConfig({
      ...(session.podcastVideoConfig || {}),
      enabled: false,
      editorEnabled: true
    })
  }), { render: false });
}

function setPodcastVideoSpeaker(session = null, speaker = "", options = {}) {
  const key = String(speaker || "").trim();
  const speaking = options.speaking === true;
  const rowId = String(options.rowId || podcastVideoState.activeRowId || "").trim();
  const syncStageMedia = options.syncStageMedia !== false;
  podcastVideoState.activeSpeaker = key;
  if (rowId) {
    podcastVideoState.activeRowId = rowId;
  }
  podcastVideoState.speaking = speaking;
  if (els.podcastVideoSpeakerCard) {
    els.podcastVideoSpeakerCard.classList.toggle("is-speaking", speaking);
  }
  if (!speaking) {
    setPodcastMouthTarget(0, { speaking: false });
  } else {
    setPodcastMouthTarget(Math.max(podcastLipSyncState.target, 0.08), { speaking: true });
  }
  if (els.podcastVideoWave) {
    els.podcastVideoWave.classList.toggle("is-speaking", speaking);
  }
  if (els.podcastActiveSpeakerName) {
    els.podcastActiveSpeakerName.textContent = key ? resolveSpeakerDisplayName(key, session) : "Sin locutor activo";
  }
  syncSpeakerIdentityActiveStates();
  syncPodcastPortraitStripActiveStates(session);
  const portrait = resolvePortraitForSpeaker(session, key);
  if (els.podcastActiveSpeakerImage) {
    const src = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
    if (src) {
      els.podcastActiveSpeakerImage.src = src;
      els.podcastActiveSpeakerImage.alt = key ? `Retrato de ${resolveSpeakerDisplayName(key, session)}` : "Locutor";
    } else {
      els.podcastActiveSpeakerImage.removeAttribute("src");
      els.podcastActiveSpeakerImage.alt = "Locutor sin retrato";
      setPodcastMouthTarget(0, { speaking: false });
    }
  }
  if (syncStageMedia) {
    syncPodcastVideoStageMedia(session || getActiveSession(), podcastVideoState.activeRowId);
  }
  if (podcastVideoState.enabled) {
    setPodcastVideoStatus(
      key
        ? speaking
          ? `${resolveSpeakerDisplayName(key, session)} está hablando`
          : `${resolveSpeakerDisplayName(key, session)} listo`
        : "Video listo"
    );
  }
}

async function generateSpeakerPortrait(speaker = "", options = {}) {
  const requestedSessionId = String(options.sessionId || "").trim();
  const session = requestedSessionId
    ? (state.sessions.find((item) => String(item?.id || "").trim() === requestedSessionId) || null)
    : getActiveSession();
  const sessionId = String(session?.id || "").trim();
  const key = normalizeSpeakerLabel(speaker, "");
  if (!session || !key) return null;
  const speakerName = resolveSpeakerDisplayName(key, session);
  const voiceName = resolveConfiguredSpeakerVoiceForGeneration(key, session);
  const expression = getSpeakerExpressionMap(session)[key] || "Neutral";
  const voiceProfile = resolveAgentVoiceProfile(voiceName, voiceName);
  const scenarioPrompt = resolveSpeakerStudioScenarioPrompt(session, key, { expression });
  const modelCandidates = buildPortraitImageModelChain();
  const portraitMap = getSpeakerPortraitMap(session);
  const speakerReferenceImage = getSpeakerReferenceImageMap(session)[key] || null;
  const previousStoragePath = String(portraitMap?.[key]?.storagePath || "").trim();
  const regenerate = options.regenerate === true;
  const silent = options.silent === true;
  const activeScenarioAsset = await ensureActiveGlobalScenarioAssetReady(session);

  if (!regenerate) {
    const reusedPortrait = reuseSpeakerPortraitFromOtherSession(session, key, {
      voiceName,
      expression,
      genderGroup: String(voiceProfile?.genderGroup || "").trim(),
      scenarioPrompt,
      scenarioAsset: activeScenarioAsset,
      scenarioId: String(activeScenarioAsset?.id || "").trim(),
      scenarioImageUrl: String(activeScenarioAsset?.downloadUrl || "").trim(),
      scenarioImageStoragePath: String(activeScenarioAsset?.storagePath || "").trim()
    });
    if (reusedPortrait) {
      const refreshed = state.sessions.find((item) => String(item?.id || "").trim() === sessionId) || session;
      if (String(state.activeSessionId || "").trim() === sessionId && podcastVideoState.activeSpeaker === key) {
        setPodcastVideoSpeaker(refreshed, key, { speaking: podcastVideoState.speaking });
      }
      if (String(state.activeSessionId || "").trim() === sessionId) {
        renderPodcastPortraitStrip(refreshed);
      }
      if (!silent) {
        setGenerationStatus(`Retrato reutilizado para ${speakerName}`, "is-live");
      }
      setPodcastVideoStatus(`Retrato listo: ${speakerName}`);
      return reusedPortrait;
    }
  }

  if (!silent) {
    setGenerationStatus(`Generando retrato de ${speakerName}...`, "is-busy");
  }
  setPodcastVideoStatus(`Generando retrato: ${speakerName}...`);

  const response = await authFetchJson("/api/podcaster/speaker-portraits/generate", {
    method: "POST",
    body: JSON.stringify({
      sessionId: session.id,
      speakerLabel: key,
      speakerName,
      voiceName,
      genderGroup: String(voiceProfile?.genderGroup || "").trim(),
      expression,
      scenarioPrompt,
      scenarioId: String(activeScenarioAsset?.id || "").trim(),
      scenarioImageUrl: String(activeScenarioAsset?.downloadUrl || "").trim(),
      scenarioImageStoragePath: String(activeScenarioAsset?.storagePath || "").trim(),
      referenceImageDataUrl: String(speakerReferenceImage?.dataUrl || "").trim(),
      referenceImageName: String(speakerReferenceImage?.name || "").trim(),
      model: modelCandidates[0] || PODCASTER_IMAGE_MODEL_DEFAULT,
      modelCandidates,
      regenerate,
      previousStoragePath
    })
  });

  const portrait = response?.portrait && typeof response.portrait === "object" ? response.portrait : null;
  if (!hasStoredMediaSource(portrait)) {
    throw new Error("No se recibió retrato válido desde backend.");
  }

  upsertSessionById(sessionId, (current) => ({
    ...current,
    speakerPortraitMap: {
      ...getSpeakerPortraitMap(current),
      [key]: {
        speaker: key,
        downloadUrl: String(portrait.downloadUrl || "").trim(),
        storagePath: String(portrait.storagePath || "").trim(),
        voiceName: normalizeLiveVoiceName(String(portrait.voiceName || voiceName).trim(), voiceName),
        genderGroup: normalizeVoiceGenderGroup(portrait.genderGroup || voiceProfile?.genderGroup || ""),
        expression: String(portrait.expression || expression).trim() || expression,
        scenarioPrompt,
        scenarioId: String(portrait.scenarioId || activeScenarioAsset?.id || "").trim(),
        scenarioImageUrl: String(portrait.scenarioImageUrl || activeScenarioAsset?.downloadUrl || "").trim(),
        scenarioImageStoragePath: String(portrait.scenarioImageStoragePath || activeScenarioAsset?.storagePath || "").trim(),
        mimeType: String(portrait.mimeType || "image/png").trim() || "image/png",
        updatedAt: String(portrait.updatedAt || nowIso()).trim() || nowIso(),
        model: String(portrait.model || PODCASTER_IMAGE_MODEL_DEFAULT).trim() || PODCASTER_IMAGE_MODEL_DEFAULT,
        promptVersion: String(portrait.promptVersion || "podcaster_v1").trim() || "podcaster_v1"
      }
    }
  }), { render: false });

  const refreshed = state.sessions.find((item) => String(item?.id || "").trim() === sessionId) || session;
  if (String(state.activeSessionId || "").trim() === sessionId && podcastVideoState.activeSpeaker === key) {
    setPodcastVideoSpeaker(refreshed, key, { speaking: podcastVideoState.speaking });
  }
  if (String(state.activeSessionId || "").trim() === sessionId) {
    renderPodcastPortraitStrip(refreshed);
  }

  if (!silent) {
    setGenerationStatus("Retrato generado", "is-live");
  }
  return portrait;
}

async function ensurePodcastPortraitsForPlayback(session = null) {
  if (!podcastVideoState.enabled || !session) return;
  const cfg = getPodcastVideoConfig(session);
  if (cfg.autoGeneratePortraits !== true) return;
  const hosts = getSpeakerOptions(session);
  const map = getSpeakerPortraitMap(session);
  const missing = hosts.filter((host) => !hasStoredMediaSource(map?.[host] || null));
  if (!missing.length) return;
  podcastVideoState.busy = true;
  try {
    for (const host of missing) {
      // eslint-disable-next-line no-await-in-loop
      await generateSpeakerPortrait(host, { regenerate: false, silent: true });
    }
    setPodcastVideoStatus("Retratos listos para reproducción");
  } finally {
    podcastVideoState.busy = false;
  }
}

async function regenerateAllSpeakerPortraits() {
  const session = getActiveSession();
  if (!session) return;
  const hosts = getSpeakerOptions(session);
  if (!hosts.length) return;
  podcastVideoState.busy = true;
  setGenerationStatus("Regenerando retratos de locutores...", "is-busy");
  try {
    for (const host of hosts) {
      // eslint-disable-next-line no-await-in-loop
      await generateSpeakerPortrait(host, { regenerate: Boolean(String(getSpeakerPortraitMap(getActiveSession())?.[host]?.downloadUrl || "").trim()), silent: true });
    }
    setGenerationStatus("Retratos regenerados", "is-live");
    setPodcastVideoStatus("Retratos regenerados");
  } catch (error) {
    setGenerationStatus("Error", "");
    addChatMessage("system", `No se pudieron regenerar todos los retratos (${error.message}).`);
  } finally {
    podcastVideoState.busy = false;
    updatePodcastPlayerUi();
  }
}

function renderPodcastPortraitStrip(session = null, options = {}) {
  if (!els.podcastPortraitStrip) return;
  const activeSession = session || getActiveSession();
  const renderReason = String(options.reason || "structure").trim() || "structure";
  const structureKey = buildPodcastPortraitStripStructureKey(activeSession);
  const canReuseStructure = (
    podcastRenderState.portraitStructureKey === structureKey
    && els.podcastPortraitStrip.childElementCount > 0
  );
  if (
    canReuseStructure
    && options.force !== true
    && (renderReason === "selection" || renderReason === "ephemeral" || renderReason === "speaker")
  ) {
    logPodcastRenderDebug("portrait-structure-skip", { reason: renderReason });
    syncPodcastPortraitStripActiveStates(activeSession);
    return;
  }
  const hosts = getSpeakerOptions(activeSession);
  const globalScenarioDeck = getGlobalScenarioDeck(activeSession);
  const draft = collectGlobalSpeakerDraft(activeSession);
  const voiceMap = draft?.voiceMap || getSpeakerVoiceMap(activeSession);
  const expressionMap = draft?.expressionMap || getSpeakerExpressionMap(activeSession);
  const nameMap = draft?.nameMap || getSpeakerNameMap(activeSession);
  const speakerReferenceMap = getSpeakerReferenceImageMap(activeSession);
  const scenarioReferenceMap = getScenarioReferenceImageMap(activeSession);
  const portraitCards = hosts.map((host) => {
    const portrait = resolvePortraitForSpeaker(activeSession, host);
    const reference = speakerReferenceMap[host] || null;
    const src = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
    const displayName = String(nameMap[host] || resolveSpeakerDisplayName(host, activeSession)).trim() || host;
    const voiceName = normalizeLiveVoiceName(voiceMap[host], resolveSpeakerVoiceName(host, activeSession));
    const expression = EXPRESSIONS.includes(expressionMap[host]) ? expressionMap[host] : "Neutral";
    const isActive = podcastVideoState.activeSpeaker === host;
    const configuredProfile = resolveAgentVoiceProfile(voiceName, voiceName);
    const configuredGender = normalizeVoiceGenderGroup(configuredProfile?.genderGroup || "");
    const portraitGender = normalizeVoiceGenderGroup(portrait?.genderGroup || "");
    const portraitVoiceName = normalizeLiveVoiceName(String(portrait?.voiceName || "").trim(), "");
    const genderMismatch = Boolean(src && configuredGender && portraitGender && configuredGender !== portraitGender);
    const voiceMismatch = Boolean(src && portraitVoiceName && portraitVoiceName !== voiceName);
    const portraitOutdated = genderMismatch || voiceMismatch;
    return `
      <article class="podcast-portrait-card${isActive ? " is-active" : ""}${portraitOutdated ? " is-mismatch" : ""}" data-speaker="${escapeHtml(host)}" data-speaker-select="${escapeHtml(host)}">
        <button class="podcast-portrait-image-wrap" type="button" data-action="open-portrait-viewer" data-speaker="${escapeHtml(host)}" data-portrait-src="${escapeHtml(src)}" data-portrait-title="${escapeHtml(displayName)}" data-portrait-meta="${escapeHtml(`${host} · ${voiceName} · ${expression}`)}" aria-label="${escapeHtml(`Ver retrato completo de ${displayName}`)}"${src ? "" : " disabled"}>
          ${src
            ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(`Retrato de ${displayName}`)}" loading="lazy">`
            : `<div class="podcast-portrait-placeholder">${escapeHtml(displayName.slice(0, 1).toUpperCase())}</div>`}
        </button>
        <div class="podcast-portrait-meta">
          <div class="podcast-portrait-copy">
            <strong>${escapeHtml(displayName)}</strong>
            <span>${escapeHtml(host)}</span>
            <div class="podcast-portrait-tags">
              <span class="row-chip row-chip-voice">${escapeHtml(voiceName)}</span>
              <span class="row-chip">${escapeHtml(expression)}</span>
              ${reference ? `<span class="row-chip">${escapeHtml(`Referencia: ${reference.name}`)}</span>` : ""}
              ${portraitOutdated
                ? `<span class="row-chip row-chip-warning">${escapeHtml(genderMismatch ? "Retrato no coincide con voz femenina/masculina" : "Retrato desactualizado")}</span>`
                : ""}
            </div>
          </div>
          <div class="podcast-portrait-actions">
            <button class="row-icon-btn" type="button" data-action="attach-speaker-reference-image" data-speaker="${escapeHtml(host)}" title="Adjuntar imagen de referencia del locutor">
              <i class="fas fa-paperclip"></i>
            </button>
            ${reference ? `<button class="row-icon-btn" type="button" data-action="clear-speaker-reference-image" data-speaker="${escapeHtml(host)}" title="Quitar referencia del locutor"><i class="fas fa-times"></i></button>` : ""}
            <button class="row-icon-btn" type="button" data-action="regenerate-speaker-portrait" data-speaker="${escapeHtml(host)}" title="Regenerar retrato">
              <i class="fas fa-redo"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
  const scenarioCards = globalScenarioDeck.items.map((item) => {
    const reference = scenarioReferenceMap[String(item.id || "").trim()] || null;
    const isSelected = item.id === globalScenarioDeck.activeId;
    const previewSrc = String(item.downloadUrl || "").trim() || buildScenarioPreviewDataUrl(item.title, item.prompt);
    const hasGeneratedImage = Boolean(String(item.downloadUrl || "").trim());
    const isGenerating = item.status === "generating";
    const hasError = item.status === "error" && String(item.errorMessage || "").trim();
    return `
      <article class="podcast-scenario-card${isSelected ? " is-selected" : ""}${isGenerating ? " is-generating" : ""}${hasError ? " is-error" : ""}" data-scenario-id="${escapeHtml(item.id)}">
        <div class="podcast-scenario-visual" aria-hidden="true">
          <img class="podcast-scenario-visual-image" src="${escapeHtml(previewSrc)}" alt="${escapeHtml(`Vista previa de ${item.title}`)}" loading="lazy">
          <div class="podcast-scenario-visual-copy">
            <span>${escapeHtml(item.title)}</span>
          </div>
        </div>
        <div class="podcast-portrait-meta">
          <div class="podcast-portrait-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>Escenario global para todos los locutores</span>
            <div class="podcast-portrait-tags">
              <span class="row-chip row-chip-selected"${isSelected ? "" : " hidden"}>Usado en video</span>
              ${reference ? `<span class="row-chip">${escapeHtml(`Referencia: ${reference.name}`)}</span>` : ""}
              ${isGenerating ? `<span class="row-chip">Generando imagen...</span>` : ""}
              ${!hasGeneratedImage && !isGenerating && !hasError ? `<span class="row-chip row-chip-warning">Sin imagen real generada</span>` : ""}
              ${hasError ? `<span class="row-chip row-chip-warning">${escapeHtml(String(item.errorMessage || "Fallo al generar imagen").slice(0, 90))}</span>` : ""}
            </div>
          </div>
          <div class="podcast-scenario-actions">
            <button class="row-icon-btn" type="button" data-action="attach-scenario-reference-image" data-scenario-id="${escapeHtml(item.id)}" title="Adjuntar imagen de referencia del escenario">
              <i class="fas fa-paperclip"></i>
            </button>
            ${reference ? `<button class="row-icon-btn" type="button" data-action="clear-scenario-reference-image" data-scenario-id="${escapeHtml(item.id)}" title="Quitar referencia del escenario"><i class="fas fa-times"></i></button>` : ""}
            <button class="row-icon-btn" type="button" data-action="toggle-global-scenario-prompt" data-scenario-id="${escapeHtml(item.id)}" title="Ver prompt de escenario">
              <i class="fas fa-eye"></i>
            </button>
            <button class="row-icon-btn" type="button" data-action="use-global-scenario" data-scenario-id="${escapeHtml(item.id)}" title="Usar este escenario en videos">
              <i class="fas fa-check"></i>
            </button>
            <button class="row-icon-btn" type="button" data-action="regenerate-global-scenario" data-scenario-id="${escapeHtml(item.id)}" title="Regenerar este escenario">
              <i class="fas fa-redo"></i>
            </button>
          </div>
        </div>
        <div class="podcast-scenario-prompt" hidden data-scenario-prompt="${escapeHtml(item.id)}">${escapeHtml(item.prompt)}</div>
      </article>
    `;
  }).join("");
  els.podcastPortraitStrip.innerHTML = `${portraitCards}${scenarioCards}`;
  podcastRenderState.portraitStructureKey = structureKey;
  podcastRenderState.portraitStructureRenderCount += 1;
  logPodcastRenderDebug("portrait-structure-render", {
    reason: renderReason,
    renderCount: podcastRenderState.portraitStructureRenderCount
  });
  syncPodcastPortraitStripActiveStates(activeSession);
}

function renderPodcastVideoShell(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return;
  resetPodcastStudioSessionUiState(activeSession);
  setPodcastStudioInspectorCollapsed(podcastStudioInspectorCollapsed);
  ensureTimelineClipsByRowId(activeSession, { persist: !podcastVideoState.montageActive });
  const cfg = getPodcastVideoConfig(activeSession);
  syncTimelineModeButtons(activeSession);
  const shouldBeOpen = cfg.enabled === true || podcastVideoState.enabled;
  podcastVideoState.enabled = shouldBeOpen;
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = !shouldBeOpen;
  }
  syncPodcastVideoSpeakerCardVisibility();
  if (els.togglePodcastVideoBtn) {
    els.togglePodcastVideoBtn.classList.toggle("is-active", shouldBeOpen);
    els.togglePodcastVideoBtn.setAttribute("title", shouldBeOpen ? "Ocultar video" : "Mostrar video");
  }
  renderPodcastPortraitStrip(activeSession, { reason: "shell" });
  const rows = activeSession?.script?.rows || [];
  const rowIds = new Set(rows.map((row) => String(row?.id || "").trim()).filter(Boolean));
  if (!podcastVideoState.activeRowId || !rowIds.has(String(podcastVideoState.activeRowId || "").trim())) {
    podcastVideoState.activeRowId = resolveTargetVideoRowId(activeSession, podcastVideoState.activeSpeaker);
  }
  if (!podcastVideoState.transitionPickerOpen) {
    const idx = rows.findIndex((row) => String(row?.id || "").trim() === String(podcastVideoState.activeRowId || "").trim());
    const fromRow = idx >= 0 ? rows[idx] : rows[0];
    const toRow = idx >= 0 ? rows[idx + 1] : rows[1];
    podcastVideoState.transitionFromRowId = String(fromRow?.id || "").trim();
    podcastVideoState.transitionToRowId = String(toRow?.id || "").trim();
  }
  renderPodcastVideoTimeline(activeSession, { reason: "shell" });
  renderPodcastTransitionTimeline(activeSession);
  renderPodcastTransitionPicker(activeSession);
  if (cfg.autoGenerateScenarioImages === true) {
    ensureGlobalScenarioImages(activeSession).catch(() => {});
  }
  const hosts = getSpeakerOptions(activeSession);
  if (!podcastVideoState.activeSpeaker || !hosts.includes(String(podcastVideoState.activeSpeaker || "").trim())) {
    setPodcastVideoSpeaker(activeSession, getSpeakerOptions(activeSession)[0] || "", { speaking: false });
  } else {
    setPodcastVideoSpeaker(activeSession, podcastVideoState.activeSpeaker, { speaking: podcastVideoState.speaking });
  }
  syncPodcastVideoStageMedia(activeSession, podcastVideoState.activeRowId);
  syncPodcastStudioInspector(activeSession);
  setPodcastVideoZoomEnabled(podcastVideoState.zoomed === true);
  const totalSec = getTimelineTotalDurationMs(activeSession) / 1000;
  podcastVideoState.timelineDurationSec = Math.max(0, Number(totalSec) || 0);
  if (els.podcastStudioTime) {
    const current = Math.max(0, Number(podcastVideoState.montageCursorMs || 0) / 1000);
    els.podcastStudioTime.textContent = `${secondsToClock(current)} / ${secondsToClock(totalSec)}`;
  }
}

function updatePodcastPlayerUi() {
  syncPodcastVideoSpeakerCardVisibility();
  const isActive = podcastPlaybackState.active;
  const isPaused = podcastPlaybackState.paused;
  if (els.podcastPlayBtn) els.podcastPlayBtn.disabled = isActive && !isPaused;
  if (els.podcastPauseBtn) els.podcastPauseBtn.disabled = !isActive || isPaused;
  if (els.podcastStopBtn) els.podcastStopBtn.disabled = !isActive && !podcastPlaybackState.queue.length;
  if (els.podcastPrevBtn) els.podcastPrevBtn.disabled = !podcastPlaybackState.queue.length;
  if (els.podcastNextBtn) els.podcastNextBtn.disabled = !podcastPlaybackState.queue.length;
  if (els.downloadPodcastBtn) els.downloadPodcastBtn.disabled = podcastPlaybackState.recordedChunks.length === 0;
  if (els.regenerateAllPortraitsBtn) els.regenerateAllPortraitsBtn.disabled = podcastVideoState.busy;
  if (els.generateDialogueVideoBtn) {
    const session = getActiveSession();
    const rowId = resolveTargetVideoRowId(session);
    const key = `${session?.id || ""}:${rowId || ""}`;
    els.generateDialogueVideoBtn.disabled = podcastVideoState.busy || !rowId || dialogueVideoGenerationPending.has(key);
  }
  if (els.generateAllDialogueVideosBtn) {
    const rows = getActiveSession()?.script?.rows || [];
    els.generateAllDialogueVideosBtn.disabled = podcastVideoState.busy || !rows.length;
  }
  if (els.regenerateAllDialogueVideosBtn) {
    const rows = getActiveSession()?.script?.rows || [];
    els.regenerateAllDialogueVideosBtn.disabled = podcastVideoState.busy || !rows.length;
  }
  if (els.reorderTimelineTracksBtn) {
    els.reorderTimelineTracksBtn.disabled = podcastVideoState.busy || getReorderableTimelineTrackIds(getActiveSession()).length < 2;
  }
  if (els.generateDialogueAudioBtn) {
    const session = getActiveSession();
    const rowId = resolveTargetVideoRowId(session);
    const key = `${session?.id || ""}:${rowId || ""}`;
    els.generateDialogueAudioBtn.disabled = podcastVideoState.busy || !rowId || dialogueAudioGenerationPending.has(key);
  }
  if (!isActive && !isPaused && !podcastPlaybackState.queue.length) {
    setPodcastPlaybackStatus("Detenido");
  } else if (isPaused) {
    setPodcastPlaybackStatus("Pausado");
  } else if (isActive) {
    setPodcastPlaybackStatus("Reproduciendo");
  }
}

async function waitForRowPlaybackFinish(rowId, loopToken) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    if (!podcastPlaybackState.active || podcastPlaybackState.loopToken !== loopToken) return false;
    if (podcastPlaybackState.jumpToQueueIndex !== null) return false;
    if (podcastPlaybackState.currentRowStatus === "error") return false;
    if (podcastPlaybackState.currentRowStatus === "success" && !playingRowId && isGeminiLiveAudioDrained()) return true;
    if (playingRowId && playingRowId !== rowId && isGeminiLiveAudioDrained()) return podcastPlaybackState.currentRowStatus === "success";
    await sleep(80);
  }
  return false;
}

async function pausePodcastPlayback() {
  if (!podcastPlaybackState.active || podcastPlaybackState.paused) return;
  podcastPlaybackState.paused = true;
  const session = getActiveSession();
  if (session && podcastVideoState.activeSpeaker) {
    setPodcastVideoSpeaker(session, podcastVideoState.activeSpeaker, { speaking: false });
  }
  if (geminiLiveAudioCtx?.state === "running") {
    await geminiLiveAudioCtx.suspend().catch(() => {});
  }
  updatePodcastPlayerUi();
}

async function resumePodcastPlayback() {
  if (!podcastPlaybackState.active || !podcastPlaybackState.paused) return;
  podcastPlaybackState.paused = false;
  const session = getActiveSession();
  if (session && podcastVideoState.activeSpeaker) {
    setPodcastVideoSpeaker(session, podcastVideoState.activeSpeaker, { speaking: true });
  }
  if (geminiLiveAudioCtx?.state === "suspended") {
    await geminiLiveAudioCtx.resume().catch(() => {});
  }
  updatePodcastPlayerUi();
}

function stopPodcastPlayback(options = {}) {
  const keepQueue = options.keepQueue === true;
  backgroundDialogueAudioWarmupToken = 0;
  podcastPlaybackState.active = false;
  podcastPlaybackState.paused = false;
  podcastPlaybackState.jumpToQueueIndex = null;
  podcastPlaybackState.loopToken = 0;
  stopRowAudio();
  if (!keepQueue) {
    podcastPlaybackState.queue = [];
    podcastPlaybackState.currentQueueIndex = -1;
  }
  if (!keepQueue) {
    setPodcastNowPlaying("Sin reproducción activa");
  }
  const session = getActiveSession();
  setPodcastVideoRow("", { syncStage: true });
  setPodcastVideoSpeaker(session, "", { speaking: false });
  updatePodcastPlayerUi();
}

async function jumpPodcastPlayback(step = 1) {
  const session = getActiveSession();
  const rows = session?.script?.rows || [];
  if (!rows.length) return;
  const current = Math.max(0, podcastPlaybackState.currentQueueIndex >= 0 ? podcastPlaybackState.currentQueueIndex : 0);
  const next = Math.max(0, Math.min(rows.length - 1, current + step));
  if (!podcastPlaybackState.active) {
    await startPodcastPlayback(next);
    return;
  }
  podcastPlaybackState.jumpToQueueIndex = next;
  podcastPlaybackState.paused = false;
  stopRowAudio();
  if (geminiLiveAudioCtx?.state === "suspended") {
    await geminiLiveAudioCtx.resume().catch(() => {});
  }
  updatePodcastPlayerUi();
}

function encodeRecordedPodcastWav() {
  const chunks = podcastPlaybackState.recordedChunks || [];
  const sampleRate = 24000;
  const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!totalSamples) return null;
  const bytesPerSample = 2;
  const dataSize = totalSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;
  const writeString = (text) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
    offset += text.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * bytesPerSample, true); offset += 4;
  view.setUint16(offset, bytesPerSample, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;

  chunks.forEach((chunk) => {
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, Number(chunk[i] || 0)));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  });
  return new Blob([buffer], { type: "audio/wav" });
}

function downloadRecordedPodcast() {
  const blob = encodeRecordedPodcastWav();
  if (!blob) {
    addChatMessage("system", "Todavía no hay audio renderizado para descargar. Reproduce el podcast completo primero.");
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `podcast-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function runPodcastPlaybackLoop(startIndex = 0) {
  const session = getActiveSession();
  const rows = session?.script?.rows || [];
  if (!rows.length) return;
  if (podcastVideoState.enabled) {
    await ensurePodcastPortraitsForPlayback(session);
  }
  podcastPlaybackState.loopToken = Date.now();
  const loopToken = podcastPlaybackState.loopToken;
  podcastPlaybackState.active = true;
  podcastPlaybackState.paused = false;
  podcastPlaybackState.jumpToQueueIndex = null;
  podcastPlaybackState.queue = rows.map((row) => row.id);
  podcastPlaybackState.currentQueueIndex = Math.max(0, Math.min(startIndex, podcastPlaybackState.queue.length - 1));
  podcastPlaybackState.speed = Math.max(0.5, Math.min(1.8, Number(els.podcastSpeedSelect?.value || 1)));
  podcastPlaybackState.recordedChunks = [];
  podcastPlaybackState.recordedAt = nowIso();
  updatePodcastPlayerUi();

  let index = podcastPlaybackState.currentQueueIndex;
  while (podcastPlaybackState.active && podcastPlaybackState.loopToken === loopToken) {
    if (podcastPlaybackState.jumpToQueueIndex !== null) {
      index = Math.max(0, Math.min(podcastPlaybackState.queue.length - 1, podcastPlaybackState.jumpToQueueIndex));
      podcastPlaybackState.jumpToQueueIndex = null;
    }
    if (index >= podcastPlaybackState.queue.length) break;
    podcastPlaybackState.currentQueueIndex = index;
    const row = rows.find((item) => item.id === podcastPlaybackState.queue[index]);
    if (!row) {
      index += 1;
      continue;
    }
    if (podcastVideoState.enabled) {
      setPodcastVideoRow(row.id, { syncStage: true });
      setPodcastVideoSpeaker(session, row.speaker, { speaking: true, rowId: row.id });
    }
    setPodcastNowPlaying(`Escena ${index + 1}: ${resolveSpeakerDisplayName(row.speaker, session)}`);
    while (podcastPlaybackState.paused && podcastPlaybackState.active && podcastPlaybackState.loopToken === loopToken) {
      await sleep(80);
    }
    if (!podcastPlaybackState.active || podcastPlaybackState.loopToken !== loopToken) break;
    const started = await playRowAudio(row.id, { speedMultiplier: podcastPlaybackState.speed });
    if (!started) {
      podcastPlaybackState.active = false;
      setPodcastPlaybackStatus("Error en reproducción");
      updatePodcastPlayerUi();
      break;
    }
    const finished = await waitForRowPlaybackFinish(row.id, loopToken);
    if (podcastVideoState.enabled) {
      setPodcastVideoSpeaker(session, row.speaker, { speaking: false, rowId: row.id });
    }
    if (!podcastPlaybackState.active || podcastPlaybackState.loopToken !== loopToken) break;
    if (podcastPlaybackState.jumpToQueueIndex !== null) continue;
    if (!finished) {
      podcastPlaybackState.active = false;
      setPodcastPlaybackStatus("Error en reproducción");
      updatePodcastPlayerUi();
      break;
    }
    index += 1;
  }

  if (podcastPlaybackState.loopToken === loopToken) {
    podcastPlaybackState.active = false;
    podcastPlaybackState.paused = false;
    podcastPlaybackState.loopToken = 0;
    if (podcastPlaybackState.currentQueueIndex >= podcastPlaybackState.queue.length - 1) {
      setPodcastNowPlaying("Podcast completado");
      setPodcastPlaybackStatus("Completado");
    }
    updatePodcastPlayerUi();
  }
}

async function startPodcastPlayback(startIndex = 0) {
  if (podcastPlaybackState.active && podcastPlaybackState.paused) {
    await resumePodcastPlayback();
    return;
  }
  if (podcastPlaybackState.active) return;
  await runPodcastPlaybackLoop(startIndex);
}

async function rebalanceScriptWithGemini(sessionSnapshot, baseScript, hosts = []) {
  const prompt = [
    "Reajusta el guion actual para distribuir escenas entre locutores.",
    `Usa exactamente estos locutores: ${hosts.join(", ")}.`,
    "Mantén la historia general, mejora la naturalidad conversacional y conserva duración aproximada por escena.",
    "No elimines escenas; conserva el mismo número de filas."
  ].join("\n");
  const snapshot = {
    ...sessionSnapshot,
    script: {
      ...baseScript,
      hosts: [...hosts]
    }
  };
  const generated = await generateWithGemini(prompt, snapshot);
  const rows = (baseScript.rows || []).map((row, index) => {
    const candidate = generated?.rows?.[index] || {};
    const speaker = hosts.includes(candidate.speaker) ? candidate.speaker : (row.speaker || hosts[0]);
    return {
      ...row,
      speaker,
      expression: EXPRESSIONS.includes(candidate.expression) ? candidate.expression : (row.expression || "Neutral"),
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(candidate.durationSec) || Number(row.durationSec) || SHORT_SCENE_MAX_SEC)),
      mediaCue: MEDIA_CUES.includes(candidate.mediaCue) ? candidate.mediaCue : (row.mediaCue || "Sin media"),
      text: String(candidate.text || row.text || "").trim() || row.text,
      notes: String(candidate.notes ?? row.notes ?? "").trim()
    };
  });
  return {
    ...baseScript,
    episodeTitle: String(generated?.episodeTitle || baseScript.episodeTitle || "Podcast").trim(),
    summary: String(generated?.summary || baseScript.summary || "").trim(),
    hosts: [...hosts],
    rows: optimizeRowsForShortScenes(rows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts
    })
  };
}

async function applyGlobalConfig() {
  const session = getActiveSession();
  if (!session) return;
  const rows = [...(session.script?.rows || [])];
  if (!rows.length) return;

  const hostCount = normalizeHostsCount(els.speakerCountInput?.value || 2);
  const hosts = hostsForCount(hostCount);
  const draft = collectGlobalSpeakerDraft(session);
  const voiceMap = {};
  const expressionMap = {};
  const nameMap = {};
  hosts.forEach((host) => {
    voiceMap[host] = normalizeLiveVoiceName(draft.voiceMap[host], resolveSpeakerVoiceName(host, session));
    expressionMap[host] = EXPRESSIONS.includes(draft.expressionMap[host]) ? draft.expressionMap[host] : "Neutral";
    nameMap[host] = String(draft.nameMap?.[host] || DEFAULT_SPEAKER_NAME_MAP[host] || host).trim() || host;
  });

  const applyMode = String(els.globalApplyModeSelect?.value || "all");
  const selectedIndexes = applyMode === "selected"
    ? parseSceneSelection(els.globalSceneSelectionInput?.value || "", rows.length)
    : rows.map((_, index) => index);
  if (applyMode === "selected" && selectedIndexes.length === 0) {
    addChatMessage("system", "No se detectaron escenas válidas para aplicar configuración. Usa formato 1,3-5.");
    return;
  }
  const selectedSet = new Set(selectedIndexes);
  const globalDisfluencyConfig = readGlobalDisfluencyControls();
  const shouldRedistribute = Boolean(els.globalRedistributeToggle?.checked) || hostCount !== getSpeakerOptions(session).length;
  let nextRows = rows.map((row) => ({ ...row }));
  if (shouldRedistribute) {
    let rotation = 0;
    nextRows = nextRows.map((row, index) => {
      const shouldApplyOnRow = applyMode === "all" || selectedSet.has(index);
      if (!shouldApplyOnRow) return row;
      const nextSpeaker = hosts[rotation % hosts.length];
      rotation += 1;
      return {
        ...row,
        speaker: nextSpeaker
      };
    });
  }
  nextRows = nextRows.map((row, index) => {
    if (!selectedSet.has(index)) return row;
    const fallbackExpression = expressionMap[row.speaker] || row.expression || "Neutral";
    return {
      ...row,
      expression: fallbackExpression,
      disfluencyConfig: normalizeDisfluencyConfig(globalDisfluencyConfig)
    };
  });

  let nextScript = {
    ...session.script,
    hosts: [...hosts],
    rows: optimizeRowsForShortScenes(nextRows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts
    })
  };

  if (els.globalUseGeminiToggle?.checked) {
    setGenerationStatus("Reajustando con Gemini...", "is-busy");
    try {
      nextScript = await rebalanceScriptWithGemini(session, nextScript, hosts);
      addChatMessage("assistant", "Reajusté el guión con Gemini para equilibrar los nuevos locutores.");
    } catch (error) {
      addChatMessage("system", `No se pudo reajustar con Gemini (${error.message}). Se aplicó redistribución local.`);
    } finally {
      setGenerationStatus("Guion listo", "is-live");
    }
  }

  upsertActiveSession((current) => ({
    ...current,
    speakerVoiceMap: voiceMap,
    speakerExpressionMap: expressionMap,
    speakerNameMap: nameMap,
    disfluencyDefaults: normalizeDisfluencyConfig(globalDisfluencyConfig),
    script: nextScript
  }));
}

function renderChat(session) {
  const messages = session.chat || [];
  const visibleMessages = messages.filter((message, index) => {
    if (index === 0 && message.role === "assistant" && messages.length === 1) return false;
    return true;
  });
  const target = els.chatFeedMessages || els.chatFeed;
  target.innerHTML = visibleMessages.map((message) => `
    <article class="chat-message ${message.role === "user" || message.role === "system" ? escapeHtml(message.role) : "assistant"}" data-message-id="${escapeHtml(message.id || "")}">
      <div class="chat-message-body">${escapeHtml(message.text)}</div>
      <div class="chat-message-actions">
        ${message.role === "assistant"
          ? (() => {
            const isConnectGenerating = connectScriptPanelGenerationState.active && String(connectScriptPanelGenerationState.messageId || "").trim() === String(message?.id || "").trim();
            const action = isConnectGenerating ? "stop-connect-script-panel" : "connect-script-panel";
            const title = isConnectGenerating ? "Detener conexión y generación de audios" : "Conectar guión al panel";
            const icon = isConnectGenerating ? "fa-stop" : "fa-link";
            return `<button class="chat-connect-btn${isConnectGenerating ? " is-stop" : ""}" type="button" data-action="${action}" title="${title}" aria-label="${title}"${message?.scriptSnapshot || isConnectGenerating ? "" : " disabled"}><i class="fas ${icon}"></i></button>`;
          })()
          : ""}
        ${message.role === "system"
          ? `<button class="chat-delete-btn" type="button" data-action="delete-chat-message" title="Eliminar mensaje" aria-label="Eliminar mensaje"><i class="fas fa-trash"></i></button>`
          : ""}
        <button class="chat-copy-btn" type="button" data-action="copy-chat-message" title="Copiar texto" aria-label="Copiar texto">
          <i class="fas fa-copy"></i>
        </button>
      </div>
    </article>
  `).join("");
  els.chatStage?.classList.toggle("has-messages", visibleMessages.length > 0);
  els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
}

function renderScript(session) {
  const script = session.script || {};
  const rows = script.rows || [];
  logPodcasterLiveDebug("render-script-voice-map", {
    sessionId: session?.id,
    speakerVoiceMap: getSpeakerVoiceMap(session)
  });
  if (els.hostSummary) {
    els.hostSummary.textContent = (script.hosts || []).join(", ") || "Host A, Host B";
  }
  if (els.durationSummary) {
    els.durationSummary.textContent = secondsToClock(countTotalDuration(rows));
  }

  els.scriptTableBody.innerHTML = rows.map((row, index) => `
    <article class="script-row" data-row-id="${escapeHtml(row.id)}" tabindex="-1">
      <div class="script-row-head">
        <div class="row-head-left">
          <div class="drag-handle" aria-label="Reordenar fila">
            <i class="fas fa-grip-vertical"></i>
          </div>
          <span class="row-chip">Escena ${index + 1}</span>
          <span class="row-chip">${escapeHtml(String(row.speaker || "").trim() || "Host A")}</span>
          <span class="row-chip row-chip-voice">${escapeHtml(resolveSpeakerVoiceName(row.speaker, session))}</span>
          <span class="row-chip row-chip-elapsed" data-row-play-elapsed="${escapeHtml(row.id)}">0:00</span>
        </div>
        <div class="row-actions">
          <button class="row-icon-btn ${hasActiveDisfluencyConfig(getRowDisfluencyConfig(row)) ? "is-active" : ""}" type="button" data-action="toggle-disfluency-config" data-row-id="${escapeHtml(row.id)}" title="Configurar muletillas, errores y tartamudeo">
            <i class="fas fa-comment-dots"></i>
          </button>
          <button class="row-icon-btn" type="button" data-action="save-row-audio-storage" data-row-id="${escapeHtml(row.id)}" title="Guardar audio de escena en Storage">
            <i class="fas fa-save"></i>
          </button>
          <button class="row-icon-btn row-play-btn" type="button" data-action="play-row-audio" data-row-id="${escapeHtml(row.id)}" title="Reproducir escena">
            <i class="fas fa-play"></i>
          </button>
          <button class="row-icon-btn" type="button" data-action="duplicate-row" data-row-id="${escapeHtml(row.id)}" title="Duplicar">
            <i class="fas fa-copy"></i>
          </button>
          <button class="row-icon-btn" type="button" data-action="delete-row" data-row-id="${escapeHtml(row.id)}" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      ${buildScriptRowEditorMarkup(session, row)}
    </article>
  `).join("");

  if (scriptSortable) {
    scriptSortable.destroy();
    scriptSortable = null;
  }

  if (window.Sortable) {
    scriptSortable = window.Sortable.create(els.scriptTableBody, {
      animation: 150,
      handle: ".drag-handle",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        upsertActiveSession((sessionData) => {
          const nextRows = [...(sessionData.script?.rows || [])];
          const [moved] = nextRows.splice(evt.oldIndex, 1);
          nextRows.splice(evt.newIndex, 0, moved);
          return {
            ...sessionData,
            script: {
              ...sessionData.script,
              rows: nextRows
            }
          };
        });
      }
    });
  }

  updateRowPlayButtons();
  syncRowDisfluencyModal(session);
}

function buildScriptRowEditorMarkup(session, row) {
  const speakerVoiceMap = getSpeakerVoiceMap(session);
  const host = String(row?.speaker || "").trim() || "Host A";
  const scenario = String(getSpeakerScenarioMap(session)?.[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").trim() || "Cabina premium de podcast";
  return `
    <textarea class="dialog-editor" data-field="text" data-row-id="${escapeHtml(row.id)}">${escapeHtml(row.text)}</textarea>
    <div class="script-row-grid">
      <label class="global-speaker-field global-speaker-field-scenario global-speaker-field-scenario-wide">
        <span>Escenario</span>
        <input data-field="scenario" data-host-name="${escapeHtml(host)}" type="text" value="${escapeHtml(scenario)}" placeholder="Ej: Cabina premium, loft editorial, radio nocturna">
      </label>
      <label class="row-field">
        <span>Locutor</span>
        <select data-field="speaker" data-row-id="${escapeHtml(row.id)}">
          ${buildSpeakerOptionsForRow(session, row.speaker)}
        </select>
      </label>
      <label class="row-field">
        <span>Expresión</span>
        <select data-field="expression" data-row-id="${escapeHtml(row.id)}">
          ${buildOptions(EXPRESSIONS, row.expression)}
        </select>
      </label>
      <label class="row-field">
        <span>Voz</span>
        <select data-field="voiceName" data-speaker="${escapeHtml(row.speaker)}" data-row-id="${escapeHtml(row.id)}">
          ${buildVoiceOptions(speakerVoiceMap[row.speaker] || resolveSpeakerVoiceName(row.speaker, session))}
        </select>
      </label>
      <label class="row-field">
        <span>Duración</span>
        <input type="number" min="1" max="180" data-field="durationSec" data-row-id="${escapeHtml(row.id)}" value="${escapeHtml(row.durationSec)}">
      </label>
      <label class="row-field">
        <span>Media</span>
        <select data-field="mediaCue" data-row-id="${escapeHtml(row.id)}">
          ${buildOptions(MEDIA_CUES, row.mediaCue)}
        </select>
      </label>
      <label class="row-field wide">
        <span>Notas</span>
        <textarea rows="2" data-field="notes" data-row-id="${escapeHtml(row.id)}">${escapeHtml(row.notes || "")}</textarea>
      </label>
    </div>
  `;
}

function buildInspectorScriptRowMarkup(session, row, index = -1) {
  const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
  return `
    <article class="script-row script-row-inspector" data-row-id="${escapeHtml(row.id)}">
      <div class="script-row-head script-row-head-inspector">
        <div class="row-head-left">
          <span class="row-chip">Escena ${safeIndex + 1}</span>
          <span class="row-chip">${escapeHtml(String(row.speaker || "").trim() || "Host A")}</span>
          <span class="row-chip row-chip-voice">${escapeHtml(resolveSpeakerVoiceName(row.speaker, session))}</span>
        </div>
      </div>
      ${buildScriptRowEditorMarkup(session, row)}
    </article>
  `;
}

function refreshSessionMeta() {
  const session = getActiveSession();
  if (!session) return;
  if (els.hostSummary) {
    els.hostSummary.textContent = (session.script?.hosts || []).map((host) => resolveSpeakerDisplayName(host, session)).join(", ") || "Valeria, Mateo";
  }
  if (els.durationSummary) {
    els.durationSummary.textContent = secondsToClock(countTotalDuration(session.script?.rows || []));
  }
}

function setSidepanelOpen(isOpen) {
  if (!els.sidepanel) return;
  els.sidepanel.hidden = !isOpen;
  els.sidepanel.classList.toggle("is-open", !!isOpen);
  els.podcasterLayout?.classList.toggle("has-sidepanel", !!isOpen);
  if (els.openSidepanelBtn) {
    els.openSidepanelBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
  if (els.sidepanelHeaderToggleBtn) {
    els.sidepanelHeaderToggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}

function setPodcastStudioInspectorCollapsed(isCollapsed) {
  podcastStudioInspectorCollapsed = isCollapsed === true;
  const layout = els.podcastVideoShell?.querySelector(".podcast-studio-layout");
  layout?.classList.toggle("is-inspector-collapsed", podcastStudioInspectorCollapsed);
  if (els.togglePodcastStudioInspectorBtn) {
    els.togglePodcastStudioInspectorBtn.setAttribute("aria-expanded", podcastStudioInspectorCollapsed ? "false" : "true");
    els.togglePodcastStudioInspectorBtn.setAttribute("title", podcastStudioInspectorCollapsed ? "Mostrar inspector" : "Ocultar inspector");
    const icon = els.togglePodcastStudioInspectorBtn.querySelector("i");
    if (icon) {
      icon.className = podcastStudioInspectorCollapsed ? "fas fa-chevron-left" : "fas fa-chevron-right";
    }
  }
  if (els.podcastStudioInspector) {
    els.podcastStudioInspector.setAttribute("aria-hidden", podcastStudioInspectorCollapsed ? "true" : "false");
  }
  if (els.podcastStudioInspectorCollapsedHandle) {
    els.podcastStudioInspectorCollapsedHandle.setAttribute("aria-expanded", podcastStudioInspectorCollapsed ? "false" : "true");
    els.podcastStudioInspectorCollapsedHandle.setAttribute("title", podcastStudioInspectorCollapsed ? "Mostrar inspector" : "Inspector abierto");
  }
  try {
    window.localStorage.setItem(PODCAST_STUDIO_INSPECTOR_COLLAPSED_KEY, podcastStudioInspectorCollapsed ? "1" : "0");
  } catch (_) {
    // noop
  }
}

function setPodcastStudioInspectorWidth(nextWidth, { persist = true } = {}) {
  const normalizedWidth = Math.max(
    PODCAST_STUDIO_INSPECTOR_WIDTH_MIN,
    Math.min(PODCAST_STUDIO_INSPECTOR_WIDTH_MAX, Number(nextWidth) || PODCAST_STUDIO_INSPECTOR_WIDTH_DEFAULT)
  );
  podcastStudioInspectorWidth = normalizedWidth;
  if (els.podcastVideoShell) {
    els.podcastVideoShell.style.setProperty("--pod-studio-inspector-width", `${normalizedWidth}px`);
  }
  if (persist) {
    try {
      window.localStorage.setItem(PODCAST_STUDIO_INSPECTOR_WIDTH_KEY, String(Math.round(normalizedWidth)));
    } catch (_) {
      // noop
    }
  }
}

function setupPodcastStudioInspectorResize() {
  setPodcastStudioInspectorWidth(podcastStudioInspectorWidth, { persist: false });
  podcastStudioInspectorResizeCleanup?.();
  if (!els.podcastStudioInspector || !els.podcastStudioInspectorCornerHandle) return;
  const handles = [els.podcastStudioInspectorCornerHandle];
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (window.innerWidth <= 920 || podcastStudioInspectorCollapsed) return;
    event.preventDefault();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-podcast-inspector");
    const shellRect = els.podcastVideoShell?.getBoundingClientRect();
    const layoutRect = els.podcastStudioInspector.parentElement?.getBoundingClientRect();
    const rightEdge = shellRect?.right || layoutRect?.right || window.innerWidth;
    const onPointerMove = (moveEvent) => {
      const nextWidth = rightEdge - moveEvent.clientX;
      setPodcastStudioInspectorWidth(nextWidth);
    };
    const stopResize = () => {
      document.body.classList.remove("is-resizing-podcast-inspector");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  };
  handles.forEach((handle) => handle.addEventListener("pointerdown", onPointerDown));
  podcastStudioInspectorResizeCleanup = () => {
    handles.forEach((handle) => handle.removeEventListener("pointerdown", onPointerDown));
  };
  if (typeof ResizeObserver !== "function") return;
  podcastStudioInspectorResizeObserver?.disconnect();
  podcastStudioInspectorResizeObserver = new ResizeObserver((entries) => {
    if (!entries.length) return;
    if (window.innerWidth <= 920 || podcastStudioInspectorCollapsed) return;
    const entry = entries[0];
    const nextWidth = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect?.width || 0;
    if (!nextWidth) return;
    if (Math.abs(nextWidth - podcastStudioInspectorWidth) < 2) return;
    setPodcastStudioInspectorWidth(nextWidth);
  });
  podcastStudioInspectorResizeObserver.observe(els.podcastStudioInspector);
}

function autoResizePrompt() {
  if (!els.promptInput) return;
  els.promptInput.style.height = "0px";
  const nextHeight = Math.min(els.promptInput.scrollHeight, 180);
  els.promptInput.style.height = `${Math.max(34, nextHeight)}px`;
}

function renderSessions() {
  const activeId = state.activeSessionId;
  const visibleSessions = state.sessions.filter((session) => session.archived !== true);
  els.sessionList.innerHTML = visibleSessions.map((session) => `
    <article class="session-card${session.id === activeId ? " is-active" : ""}" data-action="open-session" data-session-id="${escapeHtml(session.id)}" tabindex="0" role="button" aria-pressed="${session.id === activeId ? "true" : "false"}">
      <div class="session-card-header">
        <strong>${escapeHtml(session.title || "Sesión sin título")}</strong>
        <div class="session-card-menu">
          <button class="session-menu-btn" type="button" data-action="toggle-session-menu" data-session-id="${escapeHtml(session.id)}" aria-label="Más opciones" aria-expanded="false">
            <i class="fas fa-ellipsis-v"></i>
          </button>
          <div class="session-menu" hidden>
            <button type="button" data-action="rename-session" data-session-id="${escapeHtml(session.id)}">Editar nombre</button>
            <button type="button" data-action="share-session" data-session-id="${escapeHtml(session.id)}">Compartir sesión</button>
            <button type="button" data-action="archive-session" data-session-id="${escapeHtml(session.id)}">Archivar</button>
            <button type="button" data-action="delete-session" data-session-id="${escapeHtml(session.id)}">Eliminar</button>
          </div>
        </div>
      </div>
      <div class="session-card-preview">${escapeHtml(session.prompt || session.script?.summary || "Sin contenido todavía")}</div>
      ${session?.cloudMeta?.savedAt ? `<div class="session-cloud-meta">Guardada: ${escapeHtml(formatDate(session.cloudMeta.savedAt))}</div>` : ""}
    </article>
  `).join("");
}

function syncCustomTooltips(root = null) {
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;
  const nodes = scope.querySelectorAll("button[title], [data-action][title]");
  nodes.forEach((node) => {
    const title = String(node.getAttribute("title") || "").trim();
    if (!title) return;
    node.setAttribute("data-tooltip", title);
    if (!node.getAttribute("aria-label")) {
      node.setAttribute("aria-label", title);
    }
    node.removeAttribute("title");
  });
}

function render() {
  ensureSession();
  const session = getActiveSession();
  if (!session) return;
  syncPanelMusicStateFromSession(session);
  els.promptInput.value = session.prompt || "";
  renderChat(session);
  renderScript(session);
  syncGlobalConfigPanel(session);
  syncMusicControls();
  renderPodcastVideoShell(session);
  updatePodcastPlayerUi();
  renderSessions();
  syncCustomTooltips(document);
  setComposerGenerationMode(composerGenerationMode);
  autoResizePrompt();
}

function estimateSpeechDurationSec(text = "") {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return SHORT_SCENE_MIN_SEC;
  return words / SPEECH_WORDS_PER_SEC;
}

function countWords(text = "") {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function splitByMaxWords(text = "", maxWords = 20) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

function splitTextIntoSentences(text = "") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences.map((part) => String(part || "").trim()).filter(Boolean);
}

function enforceVideoSceneRows(rows = [], options = {}) {
  const minWords = Math.max(1, Number(options?.minWords) || 10);
  const maxWords = Math.max(minWords, Number(options?.maxWords) || 15);
  const output = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const speaker = String(row?.speaker || "").trim() || "Host A";
    const expression = EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral";
    const mediaCue = MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media";
    const notes = String(row?.notes || "").trim();
    const sentences = splitTextIntoSentences(row?.text || "");
    if (!sentences.length) return;
    let bucket = [];
    let bucketWords = 0;
    let firstChunkForRow = true;
    const flush = (keepMedia = false) => {
      if (!bucket.length) return;
      const text = bucket.join(" ").replace(/\s+/g, " ").trim();
      output.push({
        id: makeId("row"),
        speaker,
        expression,
        durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(row?.durationSec) || SHORT_SCENE_MAX_SEC)),
        mediaCue: keepMedia ? mediaCue : "Sin media",
        text,
        notes,
        disfluencyConfig: normalizeDisfluencyConfig(row?.disfluencyConfig || {})
      });
      bucket = [];
      bucketWords = 0;
      firstChunkForRow = false;
    };
    sentences.forEach((sentence, index) => {
      const words = countWords(sentence);
      if (!bucket.length) {
        bucket.push(sentence);
        bucketWords = words;
        if (bucketWords >= minWords && bucketWords <= maxWords) {
          flush(firstChunkForRow);
        }
        return;
      }
      const nextWords = bucketWords + words;
      if (nextWords <= maxWords) {
        bucket.push(sentence);
        bucketWords = nextWords;
        if (bucketWords >= minWords) {
          flush(firstChunkForRow);
        }
        return;
      }
      // Si excede, cerramos la escena actual completa y continuamos con la siguiente frase.
      flush(firstChunkForRow);
      bucket.push(sentence);
      bucketWords = words;
      if (bucketWords >= minWords && bucketWords <= maxWords) {
        flush(false);
      }
    });
    flush(firstChunkForRow);
  });
  return output;
}

function enforceSceneWordBounds(rows = [], options = {}) {
  const minWords = Math.max(1, Math.min(200, Number(options?.minWords) || 0));
  const maxWords = Math.max(minWords, Math.min(260, Number(options?.maxWords) || 0));
  if (!minWords || !maxWords) return rows;
  const expanded = [];
  rows.forEach((row) => {
    const text = String(row?.text || "").trim();
    if (!text) return;
    const chunks = splitByMaxWords(text, maxWords);
    if (!chunks.length) return;
    chunks.forEach((chunk, index) => {
      expanded.push({
        ...row,
        id: makeId("row"),
        text: chunk,
        mediaCue: index === 0 ? row.mediaCue : "Sin media"
      });
    });
  });

  const merged = [];
  expanded.forEach((row) => {
    const text = String(row?.text || "").trim();
    if (!text) return;
    const words = countWords(text);
    const prev = merged[merged.length - 1];
    if (words < minWords && prev) {
      const prevWords = countWords(prev.text);
      const combinedWords = prevWords + words;
      if (combinedWords <= maxWords && String(prev.speaker || "") === String(row.speaker || "")) {
        prev.text = `${String(prev.text || "").trim()} ${text}`.trim();
        return;
      }
    }
    merged.push({
      ...row,
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Math.round(estimateSpeechDurationSec(text))))
    });
  });
  return merged;
}

function splitRowTextForSceneCount(row = {}, options = {}) {
  const text = String(row?.text || "").trim();
  if (!text) return [row];
  const minWords = Math.max(1, Math.min(200, Number(options?.minWords) || 1));
  const maxWords = Math.max(minWords, Math.min(260, Number(options?.maxWords) || 260));
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [row];
  const splitAt = Math.max(1, Math.min(words.length - 1, Math.floor(words.length / 2)));
  const leftWords = words.slice(0, splitAt);
  const rightWords = words.slice(splitAt);
  if (!leftWords.length || !rightWords.length) return [row];
  const leftText = leftWords.join(" ").trim();
  const rightText = rightWords.join(" ").trim();
  if (!leftText || !rightText) return [row];
  const makePart = (partText, keepMedia = false) => ({
    ...row,
    id: makeId("row"),
    text: partText,
    mediaCue: keepMedia ? row.mediaCue : "Sin media",
    durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Math.round(estimateSpeechDurationSec(partText))))
  });
  const parts = [makePart(leftText, true), makePart(rightText, false)];
  const bounded = enforceSceneWordBounds(parts, { minWords, maxWords });
  return bounded.length ? bounded : parts;
}

function enforceExactSceneCount(rows = [], targetCount = 0, options = {}) {
  const safeTarget = Math.max(0, Math.min(220, Number(targetCount) || 0));
  if (!safeTarget) return rows;
  let working = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  if (!working.length) return working;

  while (working.length < safeTarget) {
    let splitIndex = -1;
    let splitScore = -1;
    for (let i = 0; i < working.length; i += 1) {
      const score = countWords(working[i]?.text || "");
      if (score > splitScore) {
        splitScore = score;
        splitIndex = i;
      }
    }
    if (splitIndex < 0) break;
    const candidate = working[splitIndex];
    const parts = splitRowTextForSceneCount(candidate, options);
    if (parts.length < 2) {
      working.push({
        ...candidate,
        id: makeId("row"),
        mediaCue: "Sin media",
        notes: `${String(candidate.notes || "").trim()} · Continuación.`.trim()
      });
    } else {
      working.splice(splitIndex, 1, ...parts);
    }
    if (working.length > 420) break;
  }

  while (working.length > safeTarget) {
    let mergeIndex = -1;
    for (let i = 1; i < working.length; i += 1) {
      const prev = working[i - 1];
      const curr = working[i];
      if (String(prev?.speaker || "") === String(curr?.speaker || "")) {
        mergeIndex = i;
        break;
      }
    }
    if (mergeIndex < 0) mergeIndex = working.length - 1;
    const leftIdx = Math.max(0, mergeIndex - 1);
    const left = working[leftIdx] || {};
    const right = working[mergeIndex] || {};
    const mergedText = [String(left.text || "").trim(), String(right.text || "").trim()].filter(Boolean).join(" ").trim();
    working.splice(leftIdx, 2, {
      ...left,
      id: makeId("row"),
      text: mergedText || String(left.text || right.text || "").trim(),
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Math.round(estimateSpeechDurationSec(mergedText)))),
      notes: [String(left.notes || "").trim(), String(right.notes || "").trim()].filter(Boolean).join(" · ")
    });
    if (!working.length) break;
  }
  return working;
}

function coerceRowsToHosts(rows = [], hosts = []) {
  const allowedHosts = Array.isArray(hosts) && hosts.length ? hosts : [...DEFAULT_HOSTS];
  const aliasMap = buildSpeakerAliasMap(allowedHosts, { nameMap: getDefaultSpeakerNameMap() });
  let previous = allowedHosts[0] || "Host A";
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const resolved = resolveSpeakerFromAliases(row?.speaker, {
      hosts: allowedHosts,
      fallback: previous,
      aliasMap
    });
    previous = resolved;
    return {
      ...row,
      speaker: resolved
    };
  });
}

function applyScriptGenerationConstraints(script = {}, constraints = {}, session = null) {
  const hasHostCount = Number.isFinite(Number(constraints?.hostCount)) && Number(constraints.hostCount) > 0;
  const hasSceneCount = Number.isFinite(Number(constraints?.sceneCount)) && Number(constraints.sceneCount) > 0;
  const hasWordBounds = Number.isFinite(Number(constraints?.minWords)) || Number.isFinite(Number(constraints?.maxWords));
  if (!hasHostCount && !hasSceneCount && !hasWordBounds) return script;
  const explicitHosts = Array.isArray(constraints?.hosts) && constraints.hosts.length
    ? constraints.hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean)
    : [];
  const forcedHosts = explicitHosts.length
    ? explicitHosts
    : hasHostCount
      ? hostsForCount(constraints.hostCount)
    : (Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(session));
  let rows = Array.isArray(script?.rows) ? script.rows.map((row) => ({ ...row })) : [];
  rows = coerceRowsToHosts(rows, forcedHosts);
  if (hasWordBounds) {
    rows = enforceSceneWordBounds(rows, {
      minWords: Number(constraints?.minWords) || 1,
      maxWords: Number(constraints?.maxWords) || 260
    });
  }
  if (hasSceneCount) {
    rows = enforceExactSceneCount(rows, Number(constraints.sceneCount), {
      minWords: Number(constraints?.minWords) || 1,
      maxWords: Number(constraints?.maxWords) || 260
    });
  }
  rows = coerceRowsToHosts(rows, forcedHosts);
  return normalizeScriptPayload({
    ...(script || {}),
    hosts: forcedHosts,
    rows
  }, { session });
}

function optimizeRowsForShortScenes(rows = [], options = {}) {
  const maxSec = Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Number(options.maxSec) || SHORT_SCENE_MAX_SEC));
  const minSec = Math.max(1, Math.min(maxSec, Number(options.minSec) || SHORT_SCENE_MIN_SEC));
  const mergeMaxSec = Math.max(minSec, Math.min(maxSec, Number(options.mergeMaxSec) || maxSec));
  const hosts = Array.isArray(options.hosts) && options.hosts.length ? options.hosts : [];
  const output = [];
  rows.forEach((row) => {
    const baseSpeaker = normalizeSpeakerLabel(
      row?.speaker,
      output[output.length - 1]?.speaker || hosts[0] || "Host A"
    );
    const text = String(row?.text || "").trim();
    if (!text) return;
    const readingSec = Math.max(minSec, estimateSpeechDurationSec(text));
    const splitThresholdSec = maxSec * 1.22;
    const segmentCount = Math.max(1, Math.ceil(readingSec / splitThresholdSec));
    const textSegments = splitDialogueTextIntoSegments(text, segmentCount).filter(Boolean);
    const effectiveCount = Math.max(1, textSegments.length);
    const defaultSegmentSec = Math.max(minSec, Math.min(maxSec, Math.round(readingSec / effectiveCount)));
    textSegments.forEach((segmentText, segmentIndex) => {
      const isFirst = segmentIndex === 0;
      const continuationNote = !isFirst ? "Continuación de escena anterior." : "";
      const notesBase = String(row?.notes || "").trim();
      output.push({
        id: makeId("row"),
        speaker: baseSpeaker,
        expression: EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral",
        durationSec: defaultSegmentSec,
        mediaCue: isFirst
          ? (MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media")
          : "Sin media",
        text: String(segmentText || "").trim(),
        notes: [notesBase, continuationNote].filter(Boolean).join(" · "),
        disfluencyConfig: normalizeDisfluencyConfig(row?.disfluencyConfig || {})
      });
    });
    if (!textSegments.length) {
      output.push({
        id: makeId("row"),
        speaker: baseSpeaker,
        expression: EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral",
        durationSec: Math.max(minSec, Math.min(maxSec, Math.round(readingSec))),
        mediaCue: MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media",
        text,
        notes: String(row?.notes || "").trim(),
        disfluencyConfig: normalizeDisfluencyConfig(row?.disfluencyConfig || {})
      });
    }
  });
  const merged = [];
  output.forEach((row) => {
    const current = { ...row };
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(current);
      return;
    }
    const sameSpeaker = String(prev.speaker || "") === String(current.speaker || "");
    const sameExpression = String(prev.expression || "") === String(current.expression || "");
    const prevDur = Math.max(minSec, Number(prev.durationSec) || minSec);
    const currDur = Math.max(minSec, Number(current.durationSec) || minSec);
    const mergedText = `${String(prev.text || "").trim()} ${String(current.text || "").trim()}`.replace(/\s+/g, " ").trim();
    const mergedReadingSec = Math.max(minSec, estimateSpeechDurationSec(mergedText));
    if (!sameSpeaker || !sameExpression || mergedReadingSec > mergeMaxSec || (prevDur + currDur) > mergeMaxSec * 1.15) {
      merged.push(current);
      return;
    }
    const notes = [String(prev.notes || "").trim(), String(current.notes || "").trim()]
      .filter(Boolean)
      .join(" · ");
    merged[merged.length - 1] = {
      ...prev,
      text: mergedText,
      durationSec: Math.max(minSec, Math.min(mergeMaxSec, Math.round(mergedReadingSec))),
      notes
    };
  });
  return merged.slice(0, 400);
}

function rowNeedsCompaction(row = {}) {
  const text = String(row?.text || "").trim();
  if (!text) return true;
  const estimatedSec = estimateSpeechDurationSec(text);
  if (estimatedSec > SHORT_SCENE_MAX_SEC * 1.15) return true;
  if (estimatedSec < SHORT_SCENE_MIN_SEC * 0.9 || text.length < 26) return true;
  return false;
}

function scriptNeedsCompaction(script = {}) {
  const rows = Array.isArray(script?.rows) ? script.rows : [];
  if (!rows.length) return false;
  return rows.some((row) => rowNeedsCompaction(row));
}

function compactScriptForPanelConnection(script = {}, session = null) {
  const normalized = normalizeScriptPayload(script || {}, {
    session,
    disfluencyDefaults: script?.disfluencyDefaults || session?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG,
    skipOptimize: true
  });
  if (Array.isArray(normalized?.rows)) {
    normalized.rows = normalized.rows.map((row) => {
      const sanitizedRow = {
        ...row,
        text: sanitizeSpeakerMentionsInDialogue(row.text, session, normalized.hosts),
        notes: sanitizeSpeakerMentionsInDialogue(row.notes, session, normalized.hosts),
        videoDirective: String(row?.videoDirective || "").replace(/\s+/g, " ").trim()
      };
      sanitizedRow.disfluencyConfig = normalizeDisfluencyConfig(
        sanitizedRow?.disfluencyConfig || script?.disfluencyDefaults || session?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG
      );
      return sanitizedRow;
    });
  }
  return normalized;
}

function applyDisfluencyDefaultsToScriptRows(script = {}, disfluencyDefaults = DEFAULT_DISFLUENCY_CONFIG) {
  const normalizedDefaults = normalizeDisfluencyConfig(disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG);
  const rows = Array.isArray(script?.rows) ? script.rows : [];
  return {
    ...(script || {}),
    rows: rows.map((row) => ({
      ...row,
      disfluencyConfig: normalizeDisfluencyConfig(normalizedDefaults)
    }))
  };
}

function setButtonLoadingState(button = null, busy = false, options = {}) {
  if (!button) return;
  const spinnerHtml = `<i class="fas fa-spinner spinner-icon" aria-hidden="true"></i>`;
  if (busy) {
    if (!button.dataset.prevHtml) button.dataset.prevHtml = button.innerHTML;
    if (!button.dataset.prevTooltip) {
      button.dataset.prevTooltip = String(button.getAttribute("data-tooltip") || button.getAttribute("title") || "");
    }
    button.disabled = true;
    button.classList.add("is-loading");
    const label = String(options.loadingLabel || "").trim();
    if (label) {
      button.innerHTML = `${spinnerHtml}${label}`;
    } else {
      button.innerHTML = spinnerHtml;
    }
    if (options.loadingTitle) {
      const tooltip = String(options.loadingTitle);
      button.setAttribute("data-tooltip", tooltip);
      if (!button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", tooltip);
      }
    }
    if (button.hasAttribute("title")) {
      button.removeAttribute("title");
    }
    return;
  }
  button.disabled = false;
  button.classList.remove("is-loading");
  if (button.dataset.prevHtml) {
    button.innerHTML = button.dataset.prevHtml;
    delete button.dataset.prevHtml;
  }
  if (button.dataset.prevTooltip !== undefined) {
    const tooltip = String(button.dataset.prevTooltip || "").trim();
    if (tooltip) {
      button.setAttribute("data-tooltip", tooltip);
      if (!button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", tooltip);
      }
    } else {
      button.removeAttribute("data-tooltip");
    }
    delete button.dataset.prevTooltip;
  }
  if (button.hasAttribute("title")) {
    button.removeAttribute("title");
  }
}

function normalizeScriptPayload(raw = {}, options = {}) {
  const fallbackRows = createDefaultRows();
  const optionHosts = Array.isArray(options?.hosts) ? options.hosts : [];
  const sourceSession = options?.session || null;
  const defaultDisfluencyConfig = normalizeDisfluencyConfig(
    options?.disfluencyDefaults || raw?.disfluencyDefaults || sourceSession?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG
  );
  const sourceNameMap = {
    ...(sourceSession?.speakerNameMap || {}),
    ...(options?.speakerNameMap || {})
  };
  const hosts = Array.isArray(raw.hosts) && raw.hosts.length
    ? Array.from(new Set(raw.hosts
      .map((host) => normalizeSpeakerLabel(host, ""))
      .filter(Boolean)))
    : optionHosts
      .map((host) => normalizeSpeakerLabel(host, ""))
      .filter(Boolean);
  const normalizedHosts = hosts.length ? hosts : ["Host A", "Host B"];
  const normalizedNameMap = buildSpeakerNameMap(normalizedHosts, sourceNameMap);
  const aliasMap = buildSpeakerAliasMap(normalizedHosts, { nameMap: normalizedNameMap });
  const baseRows = Array.isArray(raw.rows) && raw.rows.length
    ? raw.rows.map((row, index) => {
      const rawText = String(row?.text || "").trim();
      const prefixMatch = rawText.match(/^([^:\n]{1,40})\s*:\s*(.+)$/);
      const prefixedSpeaker = String(prefixMatch?.[1] || "").trim();
      const previousSpeaker = normalizeSpeakerLabel(raw?.rows?.[Math.max(0, index - 1)]?.speaker, normalizedHosts[0] || "Host A");
      const normalizedSpeaker = resolveSpeakerFromAliases(row?.speaker || prefixedSpeaker, {
        hosts: normalizedHosts,
        fallback: previousSpeaker,
        aliasMap,
        nameMap: normalizedNameMap
      });
      const normalizedText = prefixMatch && resolveSpeakerFromAliases(prefixedSpeaker, {
        hosts: normalizedHosts,
        fallback: "",
        aliasMap,
        nameMap: normalizedNameMap
      })
        ? String(prefixMatch[2] || "").trim()
        : rawText;
      return {
        id: makeId("row"),
        speaker: normalizedSpeaker,
        expression: EXPRESSIONS.includes(row?.expression) ? row.expression : "Neutral",
        durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(row?.durationSec) || SHORT_SCENE_MAX_SEC)),
        mediaCue: MEDIA_CUES.includes(row?.mediaCue) ? row.mediaCue : "Sin media",
        text: sanitizeSpeakerMentionsInDialogue(normalizedText || fallbackRows[index % fallbackRows.length].text, sourceSession, normalizedHosts),
        notes: sanitizeSpeakerMentionsInDialogue(String(row?.notes || "").trim(), sourceSession, normalizedHosts),
        videoDirective: String(row?.videoDirective || "").replace(/\s+/g, " ").trim(),
        disfluencyConfig: normalizeDisfluencyConfig(
          row?.disfluencyConfig || defaultDisfluencyConfig || fallbackRows[index % fallbackRows.length]?.disfluencyConfig || {}
        )
      };
    })
    : fallbackRows;
  const rows = options?.skipOptimize
    ? baseRows
    : optimizeRowsForShortScenes(baseRows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts: normalizedHosts
    });

  return {
    episodeTitle: String(raw.episodeTitle || "Podcast desde una idea").trim(),
    summary: String(raw.summary || "").trim(),
    hosts: normalizedHosts,
    rows
  };
}

function buildChatContext(session = {}) {
  return (session.chat || [])
    .filter((message, index, arr) => !(index === 0 && message.role === "assistant" && arr.length === 1))
    .slice(-6)
    .map((message) => `${message.role === "user" ? "Usuario" : message.role === "system" ? "Sistema" : "Asistente"}: ${String(message.text || "").trim()}`)
    .join("\n");
}

function buildScriptContext(script = {}) {
  const rows = Array.isArray(script.rows) ? script.rows : [];
  return [
    `Titulo actual: ${String(script.episodeTitle || "Sin titulo").trim()}`,
    `Resumen actual: ${String(script.summary || "Sin resumen").trim()}`,
    `Hosts actuales: ${Array.isArray(script.hosts) && script.hosts.length ? script.hosts.join(", ") : "Host A, Host B"}`,
    "Guion actual:",
    rows.map((row, index) => (
      `${index + 1}. [${row.speaker} | ${row.expression} | ${row.durationSec}s | ${row.mediaCue}] ${row.text}${row.notes ? ` (${row.notes})` : ""}`
    )).join("\n")
  ].join("\n");
}

function hasMeaningfulScript(session = {}) {
  return Boolean(
    session.prompt
    || session.script?.summary
    || (session.chat || []).filter((msg, index, arr) => !(index === 0 && msg.role === "assistant" && arr.length === 1)).length
  );
}

function isShortenRequest(prompt = "") {
  const clean = String(prompt || "").toLowerCase();
  return /acorta|resum|más corto|mas corto|reduce|recorta|sintetiza/.test(clean);
}

function isRebuildRequest(prompt = "") {
  const clean = String(prompt || "").toLowerCase();
  return /desde cero|nuevo guion|nuevo guión|rehaz|reinicia|reescribe completo|crear uno nuevo/.test(clean);
}

function extractRequestedMinDurationSec(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  let target = 0;

  const minutesMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(minuto|minutos|min)\b/g)];
  minutesMatches.forEach((match) => {
    const value = Number(String(match[1] || "0").replace(",", "."));
    if (Number.isFinite(value) && value > 0) {
      target = Math.max(target, Math.round(value * 60));
    }
  });

  const secondsMatches = [...text.matchAll(/(\d+)\s*(segundo|segundos|sec|s)\b/g)];
  secondsMatches.forEach((match) => {
    const value = Number(match[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      target = Math.max(target, value);
    }
  });

  return target;
}

function extractRequestedSceneRange(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  let minRows = 0;
  let maxRows = 0;

  const rangeMatch = text.match(/(\d{1,3})\s*(?:a|-|hasta)\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (rangeMatch) {
    const left = Number(rangeMatch[1] || 0);
    const right = Number(rangeMatch[2] || 0);
    if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
      minRows = Math.min(left, right);
      maxRows = Math.max(left, right);
    }
  }

  const minMatch = text.match(/(?:mínimo|minimo|al menos|cuando menos)\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (minMatch) {
    const value = Number(minMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minRows = Math.max(minRows, value);
      if (!maxRows) maxRows = Math.max(value, 220);
    }
  }

  const exactMatch = text.match(/(?:de|con|en)\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (exactMatch && !rangeMatch) {
    const value = Number(exactMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minRows = Math.max(minRows, value);
      maxRows = maxRows ? Math.max(maxRows, value) : value;
    }
  }
  const exactForcedMatch = text.match(/exactamente\s*(\d{1,3})\s*(?:escena|escenas|segmento|segmentos|bloque|bloques)\b/);
  if (exactForcedMatch) {
    const value = Number(exactForcedMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minRows = value;
      maxRows = value;
    }
  }

  if (!minRows && !maxRows) return null;
  const boundedMin = Math.max(1, Math.min(220, Number(minRows) || 1));
  const boundedMax = Math.max(boundedMin, Math.min(220, Number(maxRows) || boundedMin));
  return { minRows: boundedMin, maxRows: boundedMax };
}

function extractRequestedSceneWordRange(prompt = "") {
  const text = String(prompt || "").toLowerCase();
  let minWords = 0;
  let maxWords = 0;
  const betweenMatch = text.match(/entre\s*(\d{1,3})\s*y\s*(\d{1,3})\s*palabras/);
  if (betweenMatch) {
    const left = Number(betweenMatch[1] || 0);
    const right = Number(betweenMatch[2] || 0);
    if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
      minWords = Math.min(left, right);
      maxWords = Math.max(left, right);
    }
  }
  const minMatch = text.match(/(?:mínimo|minimo|al menos)\s*(\d{1,3})\s*palabras/);
  if (minMatch) {
    const value = Number(minMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      minWords = Math.max(minWords, value);
      if (!maxWords) maxWords = Math.max(value, 200);
    }
  }
  const maxMatch = text.match(/(?:máximo|maximo|hasta)\s*(\d{1,3})\s*palabras/);
  if (maxMatch) {
    const value = Number(maxMatch[1] || 0);
    if (Number.isFinite(value) && value > 0) {
      maxWords = maxWords ? Math.min(maxWords, value) : value;
      if (!minWords) minWords = 1;
    }
  }
  if (!minWords && !maxWords) return null;
  const boundedMin = Math.max(1, Math.min(200, minWords || 1));
  const boundedMax = Math.max(boundedMin, Math.min(260, maxWords || boundedMin));
  return { minWords: boundedMin, maxWords: boundedMax };
}

function enforceScriptMinimums(baseScript = {}, options = {}) {
  const minRows = Math.max(0, Number(options.minRows || 0));
  const minDurationSec = Math.max(0, Number(options.minDurationSec || 0));
  const hosts = Array.isArray(baseScript?.hosts) && baseScript.hosts.length
    ? baseScript.hosts
    : ["Host A", "Host B"];
  const rows = Array.isArray(baseScript?.rows) ? baseScript.rows.map((row) => ({ ...row })) : [];
  if (!rows.length) return baseScript;
  const seedRows = rows.map((row) => ({ ...row }));

  while (rows.length < minRows) {
    const source = seedRows[rows.length % seedRows.length] || rows[0];
    rows.push({
      ...source,
      id: makeId("row"),
      speaker: source.speaker || hosts[0] || "Host A",
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Number(source.durationSec) || SHORT_SCENE_MAX_SEC)),
      notes: `${String(source.notes || "").trim()} ${String(source.notes || "").trim() ? "· " : ""}Expandir con ejemplo adicional.`.trim()
    });
  }

  let total = countTotalDuration(rows);
  if (minDurationSec > total) {
    let guard = 0;
    while (total < minDurationSec && guard < 3000) {
      let progressed = false;
      for (let i = 0; i < rows.length && total < minDurationSec; i += 1) {
        const current = Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, Number(rows[i].durationSec) || SHORT_SCENE_MAX_SEC));
        if (current >= SHORT_SCENE_MAX_SEC) continue;
        const delta = Math.min(1, SHORT_SCENE_MAX_SEC - current, minDurationSec - total);
        rows[i].durationSec = current + delta;
        total += delta;
        progressed = true;
      }
      if (!progressed && total < minDurationSec) {
        const seed = rows[rows.length - 1] || rows[0];
        rows.push({
          ...seed,
          id: makeId("row"),
          speaker: seed.speaker || hosts[0] || "Host A",
          durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(SHORT_SCENE_MAX_SEC, minDurationSec - total)),
          mediaCue: "Sin media",
          notes: `${String(seed.notes || "").trim()} ${String(seed.notes || "").trim() ? "· " : ""}Bloque extra para alcanzar duración objetivo.`.trim()
        });
        total = countTotalDuration(rows);
      }
      guard += 1;
    }
  }

  return {
    ...baseScript,
    rows: optimizeRowsForShortScenes(rows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts
    })
  };
}

function mergeWithPreviousScript(generated = {}, previous = {}, options = {}) {
  const preserveStructure = options?.preserveStructure === true;
  const generatedRows = Array.isArray(generated?.rows) ? generated.rows : [];
  const previousRows = Array.isArray(previous?.rows) ? previous.rows : [];
  if (!previousRows.length) return generated;
  if (!preserveStructure) return generated;

  const targetCount = previousRows.length;
  const mergedRows = [];
  for (let i = 0; i < targetCount; i += 1) {
    const prev = previousRows[i] || previousRows[previousRows.length - 1] || {};
    const next = generatedRows[i] || null;
    if (!next) {
      mergedRows.push({
        ...prev,
        id: makeId("row"),
        text: String(prev.text || "").trim(),
        notes: String(prev.notes || "").trim()
      });
      continue;
    }
    mergedRows.push({
      ...prev,
      ...next,
      id: makeId("row"),
      speaker: normalizeSpeakerLabel(next.speaker || prev.speaker || "Host A", prev.speaker || "Host A"),
      expression: EXPRESSIONS.includes(next.expression) ? next.expression : (prev.expression || "Neutral"),
      durationSec: Math.max(SHORT_SCENE_MIN_SEC, Math.min(180, Number(next.durationSec) || Number(prev.durationSec) || SHORT_SCENE_MAX_SEC)),
      mediaCue: MEDIA_CUES.includes(next.mediaCue) ? next.mediaCue : (prev.mediaCue || "Sin media"),
      text: String(next.text || prev.text || "").trim() || String(prev.text || "").trim(),
      notes: String(next.notes || prev.notes || "").trim()
    });
  }

  return {
    ...generated,
    episodeTitle: String(generated?.episodeTitle || previous?.episodeTitle || "Podcast").trim(),
    summary: String(generated?.summary || previous?.summary || "").trim(),
    hosts: Array.isArray(generated?.hosts) && generated.hosts.length ? generated.hosts : (previous.hosts || ["Host A", "Host B"]),
    rows: optimizeRowsForShortScenes(mergedRows, {
      maxSec: SHORT_SCENE_MAX_SEC,
      minSec: SHORT_SCENE_MIN_SEC,
      hosts: Array.isArray(generated?.hosts) && generated.hosts.length ? generated.hosts : (previous.hosts || ["Host A", "Host B"])
    })
  };
}

async function generateWithGemini(prompt, sessionSnapshot = null, constraints = null) {
  const constrainedHosts = Array.isArray(constraints?.hosts) && constraints.hosts.length
    ? constraints.hosts.map((host) => normalizeSpeakerLabel(host, "")).filter(Boolean)
    : [];
  const preferredSpeakers = constrainedHosts.length
    ? constrainedHosts
    : Array.from(new Set([
      ...getSpeakerOptions(sessionSnapshot || {}),
      ...DEFAULT_HOSTS
    ])).slice(0, Math.min(VOICES.length, 10));
  const isRefinement = hasMeaningfulScript(sessionSnapshot || {});
  const existingRowsCount = Math.max(0, Number(sessionSnapshot?.script?.rows?.length || 0));
  const requestedMinDurationSec = extractRequestedMinDurationSec(prompt);
  const requestedSceneRange = extractRequestedSceneRange(prompt);
  const forcedSceneCount = Number(constraints?.sceneCount) || 0;
  const forcedHostCount = Number(constraints?.hostCount) || constrainedHosts.length || 0;
  const forcedMinWords = Number(constraints?.minWords) || 0;
  const forcedMaxWords = Number(constraints?.maxWords) || 0;
  const videoMode = constraints?.videoMode === true;
  const strictAlternationRule = forcedHostCount > 1
    ? "Balancea la conversación alternando locutores (Host A, Host B, Host A, Host B...). Solo repite el mismo locutor en escenas consecutivas si es estrictamente necesario para la explicación."
    : "La secuencia de locutores NO tiene que alternar de forma fija; puede repetirse el mismo locutor en escenas consecutivas cuando el contenido lo requiera.";
  const shortenRequested = isShortenRequest(prompt);
  const rebuildRequested = isRebuildRequest(prompt);
  const speakerNameMap = getSpeakerNameMap(sessionSnapshot || {});
  const speakerVoiceMap = getSpeakerVoiceMap(sessionSnapshot || {});
  const speakerVoiceLines = preferredSpeakers.map((host) => `${host} = ${normalizeLiveVoiceName(speakerVoiceMap[host], resolveSpeakerVoiceName(host, sessionSnapshot))}`);
  const dynamicMinRows = isRefinement && !shortenRequested
    ? Math.max(4, Math.min(120, existingRowsCount))
    : 4;
  const dynamicMaxRowsBase = isRefinement && !shortenRequested && !rebuildRequested && existingRowsCount > 0
    ? Math.max(dynamicMinRows, existingRowsCount)
    : Math.min(220, Math.max(dynamicMinRows, existingRowsCount || 40));
  const requestedMinRows = requestedSceneRange?.minRows || 0;
  const requestedMaxRows = requestedSceneRange?.maxRows || 0;
  const dynamicMinRowsFinal = requestedMinRows
    ? Math.max(dynamicMinRows, requestedMinRows)
    : dynamicMinRows;
  const dynamicMaxRowsFinal = requestedMaxRows
    ? Math.max(dynamicMinRowsFinal, requestedMaxRows)
    : Math.max(dynamicMinRowsFinal, dynamicMaxRowsBase);
  const responseSchema = {
    type: "object",
    properties: {
      episodeTitle: { type: "string" },
      summary: { type: "string" },
      hosts: {
        type: "array",
        items: { type: "string" }
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            speaker: { type: "string" },
            expression: { type: "string" },
            durationSec: { type: "number" },
            mediaCue: { type: "string" },
            text: { type: "string" },
            notes: { type: "string" }
          }
        }
      }
    }
  };

  const contextualInstructions = [
    isRefinement
      ? "Refina y mejora el guion actual usando el contexto de la conversacion y el guion existente."
      : "Genera un guion nuevo de podcast a partir de la idea del usuario.",
    "Entrega una estructura lista para UI tabular.",
    "Cada fila debe ser util para produccion y contener texto conversacional natural.",
    `Locutores preferidos para este episodio: ${preferredSpeakers.join(", ")}.`,
    constrainedHosts.length ? `Locutores obligatorios para este episodio: ${constrainedHosts.join(", ")}.` : "",
    `Si necesitas locutores extra, usa solo este catálogo: ${VOICES.join(", ")}.`,
    "Los IDs de locutor (Host A, Host B, etc.) son solo metadatos internos para asignar turnos.",
    "No menciones nombres propios de locutores dentro del diálogo.",
    "No hagas que los locutores se llamen por su nombre entre ellos salvo que el usuario lo pida explícitamente.",
    `Asignación de voz por locutor (no la mezcles): ${speakerVoiceLines.join(" | ")}.`,
    "No escribas literalmente 'Host A', 'Host B', etc., dentro de los textos hablados.",
    "Haz que interactúen entre sí de forma natural sin usar nombres, etiquetas ni vocativos de identidad.",
    `Objetivo operativo: escenas cortas, entre ${SHORT_SCENE_MIN_SEC} y ${SHORT_SCENE_MAX_SEC} segundos aprox. Si un diálogo es largo, divídelo en más escenas consecutivas.`,
    strictAlternationRule,
    `Usa solo estas expresiones cuando sea posible: ${EXPRESSIONS.join(", ")}.`,
    `Usa solo estas media cues cuando sea posible: ${MEDIA_CUES.join(", ")}.`,
    isRefinement && !shortenRequested ? `No reduzcas número de escenas por debajo de ${dynamicMinRowsFinal}, a menos que el usuario pida resumir.` : "",
    isRefinement && !shortenRequested && !rebuildRequested && existingRowsCount > 0 && !requestedSceneRange
      ? `Mantén exactamente ${existingRowsCount} escenas y preserva la estructura/base del guion actual, mejorando claridad y profundidad sin reiniciarlo desde cero.`
      : "",
    requestedSceneRange
      ? `El usuario pidió un rango de escenas entre ${requestedSceneRange.minRows} y ${requestedSceneRange.maxRows}. Devuelve una cantidad dentro de ese rango.`
      : "",
    !videoMode && forcedSceneCount > 0 ? `Regla obligatoria: devuelve exactamente ${forcedSceneCount} escenas.` : "",
    forcedHostCount > 0 ? `Regla obligatoria: usa exactamente ${Math.max(1, Math.min(VOICES.length, forcedHostCount))} locutores del catálogo permitido.` : "",
    forcedMinWords > 0 || forcedMaxWords > 0
      ? `Regla obligatoria: cada escena debe tener entre ${Math.max(1, forcedMinWords || 1)} y ${Math.max(Math.max(1, forcedMinWords || 1), forcedMaxWords || Math.max(1, forcedMinWords || 1))} palabras.`
      : "",
    videoMode ? "Regla obligatoria: si necesitas ampliar, crea más escenas del mismo locutor en lugar de cortar frases a la mitad." : "",
    videoMode ? "Regla obligatoria: cada escena debe terminar con frase completa (sin cortes)." : "",
    requestedMinDurationSec > 0 ? `La duración total debe ser como mínimo ${secondsToClock(requestedMinDurationSec)}.` : "",
    isRefinement ? "Conserva lo valioso del guion actual y modifica lo necesario segun la nueva instruccion." : ""
  ].filter(Boolean).join("\n");

  const conversationContext = sessionSnapshot ? buildChatContext(sessionSnapshot) : "";
  const scriptContext = sessionSnapshot ? buildScriptContext(sessionSnapshot.script || {}) : "";

  const payload = {
    systemInstruction: {
      parts: [{
        text: "Eres un productor senior de podcasts. Convierte la idea del usuario en una estructura profesional para un editor tipo studio creator. Si el usuario envia mensajes posteriores, debes revisar y mejorar el guion existente, no responder de forma aislada. Responde solo JSON valido, sin markdown."
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          contextualInstructions,
          conversationContext ? `Conversacion reciente:\n${conversationContext}` : "",
          scriptContext ? `Guion actual editable:\n${scriptContext}` : "",
          `Nueva instruccion del usuario: ${prompt}`
        ].join("\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema
    }
  };

  let data = null;
  try {
    data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect.value,
        payload
      })
    });
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const schemaStateOverflow = message.includes("too many states")
      || message.includes("schema produces a constraint");
    if (!schemaStateOverflow) throw error;
    const fallbackPayload = {
      ...payload,
      generationConfig: {
        ...(payload.generationConfig || {}),
        responseMimeType: "application/json"
      }
    };
    delete fallbackPayload.generationConfig.responseJsonSchema;
    data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect.value,
        payload: fallbackPayload
      })
    });
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const normalized = normalizeScriptPayload(JSON.parse(rawText), {
    session: sessionSnapshot,
    skipOptimize: Number(constraints?.sceneCount) > 0
  });
  if (Array.isArray(normalized?.rows)) {
    normalized.rows = normalized.rows.map((row) => ({
      ...row,
      text: sanitizeSpeakerMentionsInDialogue(row.text, sessionSnapshot, normalized.hosts),
      notes: sanitizeSpeakerMentionsInDialogue(row.notes, sessionSnapshot, normalized.hosts),
      videoDirective: String(row?.videoDirective || "").replace(/\s+/g, " ").trim()
    }));
  }
  return normalized;
}

function generateFallbackScript(prompt) {
  const topic = prompt.replace(/^escribe un guion para el podcast sobre/i, "").trim() || "una idea nueva";
  return normalizeScriptPayload({
    episodeTitle: `Podcast sobre ${topic.slice(0, 42)}`,
    summary: `Episodio construido en modo demo alrededor de ${topic}.`,
    hosts: ["Host A", "Host B"],
    rows: [
      {
        speaker: "Host A",
        expression: "Cálido",
        durationSec: 16,
        mediaCue: "Intro musical",
        text: `Bienvenidos. Hoy vamos a explorar ${topic} con un enfoque claro y útil.`,
        notes: "Abrir con promesa de valor."
      },
      {
        speaker: "Host B",
        expression: "Curioso",
        durationSec: 22,
        mediaCue: "Sin media",
        text: `Partamos de una pregunta simple: por qué ${topic} importa ahora mismo para nuestra audiencia.`,
        notes: "Tono conversacional."
      },
      {
        speaker: "Host A",
        expression: "Inspirador",
        durationSec: 28,
        mediaCue: "Transición",
        text: `Vamos a desglosarlo en tres ideas accionables para que este episodio no se quede solo en teoría.`,
        notes: "Introducir bloques."
      },
      {
        speaker: "Host B",
        expression: "Serio",
        durationSec: 24,
        mediaCue: "Efecto sutil",
        text: `También vamos a revisar errores comunes, lenguaje recomendado y cómo aterrizarlo en un caso real.`,
        notes: "Preparar desarrollo."
      },
      {
        speaker: "Host A",
        expression: "Enérgico",
        durationSec: 18,
        mediaCue: "CTA final",
        text: "Si este enfoque te sirve, guarda esta sesión, ajusta el guión y conviértelo en producción.",
        notes: "Cerrar con CTA."
      }
    ]
  });
}

function isNetworkFetchFailure(error = null) {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("failed to fetch")
    || text.includes("networkerror")
    || text.includes("load failed")
    || text.includes("network request failed");
}

async function isLocalApiReachable() {
  if (!hasAvailableApiBase()) return false;
  let timeout = 0;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 2600);
    const response = await fetch(buildApiUrl("/api/health"), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    return response.ok;
  } catch (_) {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function handleGenerate(prompt, options = {}) {
  const displayPrompt = String(options?.displayPrompt || prompt || "").trim();
  const generationPrompt = String(options?.generationPrompt || prompt || "").trim();
  if (!generationPrompt) return;
  const sessionBeforeUpdate = getActiveSession();
  addChatMessage("user", displayPrompt || generationPrompt);
  setGenerationStatus("Paso 3/3: Generando contenido...", "is-busy");

  try {
    let script = null;
    const explicitConstraints = normalizeGenerationConstraints(options?.constraints || {});
    const strictConfigMode = explicitConstraints.sceneCount > 0;
    const isRefinement = hasMeaningfulScript(sessionBeforeUpdate || {});
    const requestedMinDurationSec = extractRequestedMinDurationSec(generationPrompt);
    const requestedSceneRange = extractRequestedSceneRange(generationPrompt);
    const requestedSceneWordRange = extractRequestedSceneWordRange(generationPrompt);
    const effectiveSceneRange = explicitConstraints.sceneCount > 0
      ? { minRows: explicitConstraints.sceneCount, maxRows: explicitConstraints.sceneCount }
      : requestedSceneRange;
    const effectiveWordRange = (explicitConstraints.minWords > 0 || explicitConstraints.maxWords > 0)
      ? { minWords: explicitConstraints.minWords || 1, maxWords: explicitConstraints.maxWords || Math.max(1, explicitConstraints.minWords || 1) }
      : requestedSceneWordRange;
    const shortenRequested = isShortenRequest(generationPrompt);
    const rebuildRequested = isRebuildRequest(generationPrompt);
    const preserveStructure = isRefinement && !strictConfigMode && !shortenRequested && !rebuildRequested && !effectiveSceneRange;
    const previousRowsCount = Number(sessionBeforeUpdate?.script?.rows?.length || 0);
    const previousDuration = countTotalDuration(sessionBeforeUpdate?.script?.rows || []);
    const fallbackMinRows = !shortenRequested
      ? Math.max(4, previousRowsCount || 0, Number(effectiveSceneRange?.minRows || 0))
      : Math.max(4, Number(effectiveSceneRange?.minRows || 0));
    const fallbackMaxRows = Math.max(fallbackMinRows, Number(effectiveSceneRange?.maxRows || 220));
    const fallbackMinDuration = shortenRequested ? requestedMinDurationSec : Math.max(requestedMinDurationSec, previousDuration || 0);
    try {
      if (strictConfigMode) {
        setGenerationStatus("Paso 2/3: Analizando configuración + chat...", "is-busy");
        const strictResult = await generateWithGeminiStrictConstraints(generationPrompt, sessionBeforeUpdate, explicitConstraints);
        script = strictResult.script;
        if (strictResult.issues?.length) {
          addChatMessage("system", `No se pudo cumplir al 100% la configuración tras 3 intentos: ${strictResult.issues.join(" | ")}`);
        }
      } else {
        script = await generateWithGemini(generationPrompt, sessionBeforeUpdate, explicitConstraints);
        script = mergeWithPreviousScript(script, sessionBeforeUpdate?.script || {}, {
          preserveStructure
        });
        if (Array.isArray(script?.rows) && script.rows.length > fallbackMaxRows) {
          script = {
            ...script,
            rows: script.rows.slice(0, fallbackMaxRows)
          };
        }
        script = enforceScriptMinimums(script, {
          minRows: fallbackMinRows,
          minDurationSec: fallbackMinDuration
        });
        script = {
          ...script,
          rows: optimizeRowsForShortScenes(script?.rows || [], {
            maxSec: SHORT_SCENE_MAX_SEC,
            minSec: SHORT_SCENE_MIN_SEC,
            hosts: script?.hosts || getSpeakerOptions(sessionBeforeUpdate || {})
          })
        };
        if (effectiveWordRange) {
          script = {
            ...script,
            rows: enforceSceneWordBounds(script?.rows || [], effectiveWordRange)
          };
        }
      }
      addScriptAssistantMessage(script, {
        isRefinement,
        session: sessionBeforeUpdate,
        preserveExactRows: strictConfigMode
      });
    } catch (error) {
      if (sessionBeforeUpdate?.script?.rows?.length) {
        if (strictConfigMode) {
          script = forceHostsAndAlternation(sessionBeforeUpdate.script, explicitConstraints, sessionBeforeUpdate);
        } else {
          script = enforceScriptMinimums(sessionBeforeUpdate.script, {
            minRows: fallbackMinRows,
            minDurationSec: fallbackMinDuration
          });
          script = {
            ...script,
            rows: optimizeRowsForShortScenes(script?.rows || [], {
              maxSec: SHORT_SCENE_MAX_SEC,
              minSec: SHORT_SCENE_MIN_SEC,
              hosts: script?.hosts || getSpeakerOptions(sessionBeforeUpdate || {})
            })
          };
          if (effectiveWordRange) {
            script = {
              ...script,
              rows: enforceSceneWordBounds(script?.rows || [], effectiveWordRange)
            };
          }
        }
        let detail = `Gemini falló (${error.message}). Conservé tu guion actual y apliqué ajuste de duración/escenas en lugar de reemplazarlo por un demo corto.`;
        if (isNetworkFetchFailure(error)) {
          const apiUp = await isLocalApiReachable();
          detail = apiUp
            ? "Gemini falló por un problema de red/CORS temporal. Conservé tu guion actual y apliqué ajuste de duración/escenas."
            : "Gemini falló porque el backend local no responde (API 8787 caída). Conservé tu guion actual. Reinicia con `npm run dev:local`.";
        }
        addChatMessage(
          "system",
          detail
        );
      } else {
        script = generateFallbackScript(prompt);
        if (strictConfigMode) {
          script = forceHostsAndAlternation(script, explicitConstraints, sessionBeforeUpdate);
        } else {
          script = enforceScriptMinimums(script, {
            minRows: Math.max(6, fallbackMinRows),
            minDurationSec: Math.max(240, fallbackMinDuration)
          });
          script = {
            ...script,
            rows: optimizeRowsForShortScenes(script?.rows || [], {
              maxSec: SHORT_SCENE_MAX_SEC,
              minSec: SHORT_SCENE_MIN_SEC,
              hosts: script?.hosts || getSpeakerOptions(sessionBeforeUpdate || {})
            })
          };
          if (effectiveWordRange) {
            script = {
              ...script,
              rows: enforceSceneWordBounds(script?.rows || [], effectiveWordRange)
            };
          }
        }
        addChatMessage("system", `No se pudo usar Gemini (${error.message}). Generé un borrador extendido para que sigas editando.`);
      }
    }

    upsertActiveSession((session) => ({
      ...session,
      prompt: displayPrompt || generationPrompt,
      title: buildShortSessionTitle(script?.episodeTitle || displayPrompt || generationPrompt)
    }));

    setGenerationStatus("Guion listo en el chat", "is-live");
  } catch (error) {
    addChatMessage("system", `Fallo al generar el guion: ${error.message}`);
    setGenerationStatus("Error", "");
  }
}

async function connectLive() {
  if (els.connectLiveBtn) els.connectLiveBtn.disabled = true;
  setLiveStatusText("Preparando voces Live...");
  try {
    const voiceProfile = resolveAgentVoiceProfile(resolveGeminiLiveVoice(), DEFAULT_SPEAKER_VOICE_MAP["Host A"]);
    logPodcasterLiveDebug("connect-live-click", {
      voice: voiceProfile.voiceName,
      profile: voiceProfile.name
    });
    const data = await ensureGeminiLiveConnected(voiceProfile);
    const expireTime = state.liveTokenState?.expireTime;
    setLiveStatusText(
      expireTime
        ? `Voces Live listas (${voiceProfile.voiceName} · ${voiceProfile.toneLabel}) hasta ${formatDate(expireTime)}`
        : `Voces Live conectadas (${voiceProfile.voiceName} · ${voiceProfile.toneLabel}).`
    );
    addChatMessage("assistant", "Gemini Live quedó conectado para reproducir voces por escena desde el panel derecho.");
    setGenerationStatus("Live listo", "is-live");
    return data;
  } catch (error) {
    setLiveStatusText(`Voces Live no disponibles: ${error.message}`);
    addChatMessage("system", `Gemini Live no quedó conectado (${error.message}). La UI sigue disponible para guión y edición manual.`);
    throw error;
  } finally {
    if (els.connectLiveBtn) els.connectLiveBtn.disabled = false;
  }
}

function createAndOpenSession() {
  stopPodcastStudioMontage({ keepStatus: true });
  const session = createSession({ title: "Nueva sesión" });
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  resetPodcastStudioSessionUiState(session);
  persistSessions();
  render();
}

function renameSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const nextTitle = window.prompt("Editar nombre de la sesión", session.title || "Nueva sesión");
  if (nextTitle === null) return;
  const normalizedTitle = normalizeSessionTitle(nextTitle);
  state.sessions = state.sessions.map((item) => (
    item.id === sessionId
      ? { ...item, title: normalizedTitle, updatedAt: nowIso() }
      : item
  ));
  persistSessions();
  render();
}

function archiveSession(sessionId) {
  state.sessions = state.sessions.map((session) => (
    session.id === sessionId
      ? { ...session, archived: true, updatedAt: nowIso() }
      : session
  ));
  if (state.activeSessionId === sessionId) {
    const nextVisible = state.sessions.find((session) => session.archived !== true);
    state.activeSessionId = nextVisible?.id || null;
  }
  ensureSession();
  persistSessions();
  render();
}

async function deleteSession(sessionId) {
  const cleanId = String(sessionId || "").trim();
  if (!cleanId) return;
  const confirmed = window.confirm("Se eliminará la sesión de la lista y de la nube. ¿Deseas continuar?");
  if (!confirmed) return;
  try {
    await deleteSessionFromCloud(cleanId);
  } catch (error) {
    addChatMessage("system", `No se pudo eliminar la sesión (${error.message}).`);
    setGenerationStatus("Error", "");
    return;
  }
  state.sessions = state.sessions.filter((session) => session.id !== cleanId);
  if (state.activeSessionId === cleanId) {
    const nextVisible = state.sessions.find((session) => session.archived !== true);
    state.activeSessionId = nextVisible?.id || null;
  }
  ensureSession();
  persistSessions();
  render();
}

function closeSessionMenus() {
  els.sessionList.querySelectorAll(".session-menu").forEach((menu) => {
    menu.hidden = true;
  });
  els.sessionList.querySelectorAll(".session-menu-btn").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function handleScriptFieldUpdate(event) {
  const target = event.target.closest("[data-row-id][data-field]");
  if (!target) return;
  const rowId = target.dataset.rowId;
  const field = target.dataset.field;
  const session = getActiveSession();
  const rawValue = field === "durationSec"
    ? Number(target.value || 0)
    : field === "disfluencyEnabled" || field === "stutterEnabled"
      ? Boolean(target.checked)
      : target.value;
  if (field === "disfluencyEnabled" || field === "fillerLevel" || field === "errorLevel" || field === "stutterEnabled" || field === "stutterLevel") {
    const levelValue = field === "disfluencyEnabled" || field === "stutterEnabled"
      ? rawValue
      : Math.max(
        0,
        Math.min(
          field === "fillerLevel"
            ? DISFLUENCY_LEVEL_MAX.fillerLevel
            : field === "errorLevel"
              ? DISFLUENCY_LEVEL_MAX.errorLevel
              : DISFLUENCY_LEVEL_MAX.stutterLevel,
          Number(rawValue) || 0
        )
      );
    upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: (current.script?.rows || []).map((row) => (
          row.id === rowId
            ? {
              ...row,
              disfluencyConfig: normalizeDisfluencyConfig({
                ...getRowDisfluencyConfig(row),
                ...(field === "disfluencyEnabled" ? { enabled: Boolean(levelValue) } : {}),
                ...(field === "fillerLevel" ? { fillerLevel: levelValue } : {}),
                ...(field === "errorLevel" ? { errorLevel: levelValue } : {}),
                ...(field === "stutterEnabled" ? { stutterEnabled: Boolean(levelValue) } : {}),
                ...(field === "stutterLevel" ? { stutterLevel: levelValue } : {})
              })
            }
            : row
        ))
      }
    }), { render: false });
    updateRowDisfluencyButtonState(rowId);
    syncRowDisfluencyModal(getActiveSession());
    return;
  }
  const value = field === "speaker" ? normalizeSpeakerLabel(rawValue, "Host A") : rawValue;
  if (field === "voiceName") {
    const speaker = String(target.dataset.speaker || "").trim() || session?.script?.rows?.find((row) => row.id === rowId)?.speaker || "Host A";
    logPodcasterLiveDebug("voice-change", {
      rowId,
      speaker,
      value
    });
    stopRowAudio();
    stopGeminiLiveSession().catch(() => {});
    upsertActiveSession((current) => ({
      ...current,
      speakerVoiceMap: {
        ...getSpeakerVoiceMap(current),
        [speaker]: normalizeLiveVoiceName(value, resolveSpeakerVoiceName(speaker, current))
      }
    }));
    return;
  }

  const nextRender = field === "speaker";
  if (field === "speaker") {
    logPodcasterLiveDebug("speaker-change", {
      rowId,
      from: session?.script?.rows?.find((row) => row.id === rowId)?.speaker,
      to: value
    });
    stopRowAudio();
    stopGeminiLiveSession().catch(() => {});
  }
  upsertActiveSession((current) => ({
    ...current,
    ...(field === "speaker"
        ? {
          speakerVoiceMap: {
            ...getSpeakerVoiceMap(current),
            [value]: getSpeakerVoiceMap(current)[value] || resolveSpeakerVoiceName(value, current)
          },
          speakerExpressionMap: {
            ...getSpeakerExpressionMap(current),
            [value]: getSpeakerExpressionMap(current)[value] || "Neutral"
          },
          speakerNameMap: {
            ...getSpeakerNameMap(current),
            [value]: getSpeakerNameMap(current)[value] || DEFAULT_SPEAKER_NAME_MAP[value] || value
          },
          speakerScenarioMap: {
            ...getSpeakerScenarioMap(current),
            [value]: getSpeakerScenarioMap(current)[value] || DEFAULT_SPEAKER_SCENARIO_MAP[value] || "Cabina premium de podcast"
          }
        }
      : {}),
    script: {
      ...current.script,
      rows: current.script.rows.map((row) => (
        row.id === rowId ? { ...row, [field]: value } : row
      ))
    }
  }), { render: nextRender });

  if (field === "durationSec") {
    refreshSessionMeta();
    renderSessions();
  }
}

function attachEvents() {
  setupGlobalTooltipPortal();
  els.promptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = els.promptInput.value.trim();
    if (!prompt) return;
    upsertActiveSession((session) => ({ ...session, prompt }));
    els.promptInput.value = "";
    autoResizePrompt();
    if (composerGenerationMode === "video") {
      addChatMessage("user", prompt);
      addChatMessage("system", "Modo video seleccionado. La generación de guión para video todavía no está implementada.");
      setGenerationStatus("Modo video pendiente", "");
      return;
    }
    pendingScriptPrompt = prompt;
    primeScriptSetupModal();
    setScriptSetupOpen(true);
  });

  els.demoPromptBtn.addEventListener("click", () => {
    els.promptInput.value = demoPrompt;
    autoResizePrompt();
  });

  if (els.composerModeToggle) {
    els.composerModeToggle.addEventListener("change", () => {
      setComposerGenerationMode(els.composerModeToggle.checked ? "video" : "script");
    });
  }
  if (els.scriptSetupSpeakerCount) {
    els.scriptSetupSpeakerCount.addEventListener("input", () => {
      const count = normalizeHostsCount(els.scriptSetupSpeakerCount.value || 2);
      els.scriptSetupSpeakerCount.value = String(count);
      const currentSetup = readScriptSetupConfig();
      renderScriptSetupSpeakerFields(count, currentSetup.hosts || [], currentSetup.speakerVoiceMap || {}, currentSetup.speakerNameMap || {});
    });
  }
  if (els.scriptSetupVideoMode) {
    els.scriptSetupVideoMode.addEventListener("change", () => {
      syncScriptSetupVideoModeUi();
    });
  }

  if (els.scriptSetupForm) {
    els.scriptSetupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const basePrompt = String(pendingScriptPrompt || "").trim();
      if (!basePrompt) {
        setScriptSetupOpen(false);
        return;
      }
      const setup = readScriptSetupConfig();
      setGenerationStatus("Paso 1/3: Configuración aplicada...", "is-busy");
      const hosts = Array.isArray(setup.hosts) && setup.hosts.length
        ? setup.hosts
        : hostsForCount(setup.hostCount);
      upsertActiveSession((session) => {
        const maps = buildSpeakerMapsForHosts(hosts, session, {
          speakerVoiceMap: setup.speakerVoiceMap || {},
          speakerNameMap: setup.speakerNameMap || {},
          speakerScenarioMap: setup.speakerScenarioMap || {}
        });
        return {
          ...session,
          script: {
            ...session.script,
            hosts: [...hosts]
          },
          speakerVoiceMap: maps.voiceMap,
          speakerExpressionMap: maps.expressionMap,
          speakerNameMap: maps.nameMap,
          speakerScenarioMap: maps.scenarioMap
        };
      }, { render: false });
      const generationPrompt = composeScriptPromptWithSetup(basePrompt, setup);
      setGenerationStatus("Paso 2/3: Analizando configuración + chat...", "is-busy");
      setScriptSetupOpen(false);
      pendingScriptPrompt = "";
      await handleGenerate(basePrompt, {
        displayPrompt: basePrompt,
        generationPrompt,
        constraints: setup
      });
    });
  }
  if (els.closeScriptSetupBtn) {
    els.closeScriptSetupBtn.addEventListener("click", () => {
      setScriptSetupOpen(false);
      pendingScriptPrompt = "";
    });
  }

  if (els.connectLiveBtn) {
    els.connectLiveBtn.addEventListener("click", connectLive);
  }
  els.addRowBtn.addEventListener("click", () => {
    const session = getActiveSession();
    const hosts = getSpeakerOptions(session);
    const speaker = hosts[0] || "Host A";
    const expressionMap = getSpeakerExpressionMap(session);
    upsertActiveSession((session) => ({
      ...session,
      script: {
        ...session.script,
        rows: [
          ...(session.script?.rows || []),
          {
            id: makeId("row"),
            speaker,
            expression: expressionMap[speaker] || "Neutral",
            durationSec: 15,
            mediaCue: "Sin media",
            text: "Nueva línea de guión.",
            notes: "",
            disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG }
          }
        ]
      }
    }));
  });

  els.duplicateRowBtn.addEventListener("click", () => {
    const session = getActiveSession();
    const lastRow = session?.script?.rows?.[session.script.rows.length - 1];
    if (!lastRow) return;
    upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        rows: [
          ...current.script.rows,
          { ...lastRow, id: makeId("row") }
        ]
      }
    }));
  });

  const handleSaveSessionClick = async () => {
    try {
      await saveSessionToCloud();
    } catch (error) {
      addChatMessage("system", `No se pudo guardar en Firebase (${error.message}).`);
      setGenerationStatus("Error", "");
    }
  };

  els.newSessionBtn.addEventListener("click", createAndOpenSession);
  if (els.saveSessionBtn) {
    els.saveSessionBtn.addEventListener("click", handleSaveSessionClick);
  }
  if (els.saveSessionFloatingBtn) {
    els.saveSessionFloatingBtn.addEventListener("click", handleSaveSessionClick);
  }
  if (els.openSidepanelBtn) {
    els.openSidepanelBtn.addEventListener("click", () => {
      const nextState = !els.sidepanel?.classList.contains("is-open");
      setSidepanelOpen(nextState);
    });
  }
  if (els.sidepanelHeaderToggleBtn) {
    els.sidepanelHeaderToggleBtn.addEventListener("click", () => {
      const nextState = !els.sidepanel?.classList.contains("is-open");
      setSidepanelOpen(nextState);
    });
  }
  if (els.openMusicConfigBtn) {
    els.openMusicConfigBtn.addEventListener("click", () => {
      syncMusicControls();
      fetchGlobalPanelMusicLibrary().catch(() => {});
      setMusicConfigOpen(true);
    });
  }
  if (els.addPanelMusicTrackBtn) {
    els.addPanelMusicTrackBtn.addEventListener("click", () => {
      els.panelMusicFileInput?.click();
    });
  }
  if (els.panelMusicTrackList) {
    els.panelMusicTrackList.addEventListener("click", (event) => {
      const toggleBtn = event.target.closest("[data-action='toggle-session-audio-enabled']");
      if (toggleBtn) {
        const trackIndex = Math.max(0, Math.floor(Number(toggleBtn.dataset.trackIndex || 0) || 0));
        toggleSessionUploadedTrackEnabled(trackIndex);
        return;
      }
      const uploadedAudioBtn = event.target.closest("[data-action='select-uploaded-audio-item']");
      if (uploadedAudioBtn) {
        const trackIndex = Math.max(0, Math.floor(Number(uploadedAudioBtn.dataset.trackIndex || 0) || 0));
        const track = selectUploadedPanelMusicTrackByIndex(trackIndex);
        if (!track) return;
        persistPanelMusicSettings();
        persistPanelMusicToActiveSession();
        syncMusicControls();
        return;
      }
      const removeAudioBtn = event.target.closest("[data-action='remove-session-audio-item']");
      if (removeAudioBtn) {
        const trackIndex = Math.max(0, Math.floor(Number(removeAudioBtn.dataset.trackIndex || 0) || 0));
        removeUploadedTrackAt(trackIndex);
      }
    });
  }
  if (els.selectAllSessionAudiosBtn) {
    els.selectAllSessionAudiosBtn.addEventListener("click", () => {
      setAllSessionUploadedTracksEnabled(true);
    });
  }
  if (els.clearAllSessionAudiosBtn) {
    els.clearAllSessionAudiosBtn.addEventListener("click", () => {
      setAllSessionUploadedTracksEnabled(false);
    });
  }
  if (els.panelMusicGlobalLibraryList) {
    els.panelMusicGlobalLibraryList.addEventListener("click", async (event) => {
      const useBtn = event.target.closest("[data-action='use-global-audio-item']");
      if (useBtn) {
        const libraryId = String(useBtn.dataset.libraryId || "").trim();
        const track = panelMusicGlobalLibraryState.items.find((item) => String(item?.libraryId || "").trim() === libraryId) || null;
        if (track) addGlobalMusicTrackToSession(track);
        return;
      }
      const deleteBtn = event.target.closest("[data-action='delete-global-audio-item']");
      if (!deleteBtn) return;
      const libraryId = String(deleteBtn.dataset.libraryId || "").trim();
      if (!libraryId) return;
      const confirmed = window.confirm("Se eliminará este audio de la biblioteca global para todos los usuarios. ¿Deseas continuar?");
      if (!confirmed) return;
      try {
        await authFetchJson("/api/podcaster/music/library/delete", {
          method: "POST",
          body: JSON.stringify({ libraryId })
        });
        panelMusicGlobalLibraryState.items = panelMusicGlobalLibraryState.items.filter((item) => String(item?.libraryId || "").trim() !== libraryId);
        const nextSessionTracks = getPanelMusicUploadedTracks().filter((item) => String(item?.libraryId || "").trim() !== libraryId);
        setPanelMusicUploadedTracks(nextSessionTracks, { selectIndex: 0 });
        if (!nextSessionTracks.length && resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind) === "uploaded") {
          panelMusicState.track = null;
          panelMusicState.sourceType = "preset";
        }
        persistPanelMusicSettings();
        persistPanelMusicToActiveSession();
        syncMusicControls();
        renderPodcastVideoTimeline(getActiveSession());
      } catch (error) {
        addChatMessage("system", `No se pudo eliminar el audio global (${error.message}).`);
      }
    });
  }
  if (els.closeMusicConfigBtn) {
    els.closeMusicConfigBtn.addEventListener("click", () => {
      setMusicConfigOpen(false);
    });
  }
  if (els.closeAudioTrackMixBtn) {
    els.closeAudioTrackMixBtn.addEventListener("click", () => {
      setAudioTrackMixOpen(false);
    });
  }
  if (els.audioTrackMontageVolume) {
    els.audioTrackMontageVolume.addEventListener("input", () => {
      setPanelMontageMusicVolume(els.audioTrackMontageVolume.value);
      renderPodcastVideoTimeline(getActiveSession());
    });
  }
  if (els.audioTrackMontageVolumeNumber) {
    els.audioTrackMontageVolumeNumber.addEventListener("input", () => {
      setPanelMontageMusicVolume(els.audioTrackMontageVolumeNumber.value);
      renderPodcastVideoTimeline(getActiveSession());
    });
  }
  if (els.audioTrackStabilizeToggle) {
    els.audioTrackStabilizeToggle.addEventListener("change", () => {
      setPanelMontageStabilize(Boolean(els.audioTrackStabilizeToggle.checked));
      renderPodcastVideoTimeline(getActiveSession());
    });
  }
  if (els.audioTrackSourceSelect) {
    els.audioTrackSourceSelect.addEventListener("change", async () => {
      const value = String(els.audioTrackSourceSelect.value || "preset").trim();
      if (value === "preset") {
        panelMusicState.sourceType = "preset";
      } else {
        const selected = selectPanelMusicTrackKind(value, { notify: true });
        if (!selected) {
          panelMusicState.sourceType = "preset";
        }
      }
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      syncMusicControls();
      renderPodcastVideoTimeline(getActiveSession());
      if (panelMusicState.playing) {
        stopPanelMusic();
        await startPanelMusic();
      }
    });
  }
  if (els.panelMusicPreset) {
    els.panelMusicPreset.addEventListener("change", async () => {
      panelMusicState.preset = String(els.panelMusicPreset.value || "ambient");
      if (panelMusicState.sourceType !== "track") {
        panelMusicState.sourceType = "preset";
      }
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      if (panelMusicState.playing) {
        stopPanelMusic();
        await startPanelMusic();
      }
    });
  }
  if (els.panelMusicVolume) {
    els.panelMusicVolume.addEventListener("input", async () => {
      panelMusicState.volume = Math.max(0, Math.min(100, Number(els.panelMusicVolume.value || 0)));
      if (panelMusicAudioEl) {
        panelMusicAudioEl.volume = Math.max(0, Math.min(1, panelMusicState.volume / 100));
      }
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      if (panelMusicState.playing) {
        stopPanelMusic();
        await startPanelMusic();
      }
    });
  }
  if (els.panelMusicFileInput) {
    els.panelMusicFileInput.addEventListener("change", async () => {
      const file = els.panelMusicFileInput.files?.[0] || null;
      if (!file) return;
      try {
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("No se pudo leer la canción seleccionada."));
          reader.readAsDataURL(file);
        });
        if (!dataUrl) throw new Error("No se pudo obtener audio en formato Data URL.");
        const durationInfo = await measureAudioDurationInfoFromFile(file);
        const durationSec = Math.max(0, Number(durationInfo?.durationSec || 0) || 0);
        const upload = await authFetchJson("/api/podcaster/music/library/upload", {
          method: "POST",
          body: JSON.stringify({
            fileName: String(file.name || "Audio").trim() || "Audio",
            mimeType: String(file.type || "audio/mpeg").trim() || "audio/mpeg",
            durationSec,
            audioDataUrl: dataUrl
          })
        });
        const globalTrack = normalizeGlobalPanelMusicLibraryTrack(upload?.track || null);
        if (!globalTrack) {
          throw new Error("El backend no devolvió el audio global.");
        }
        panelMusicGlobalLibraryState.items = [
          globalTrack,
          ...panelMusicGlobalLibraryState.items.filter((item) => String(item?.libraryId || "").trim() !== String(globalTrack.libraryId || "").trim())
        ];
        addGlobalMusicTrackToSession({
          libraryId: globalTrack.libraryId,
          name: String(file.name || "Audio").trim() || "Audio",
          mimeType: String(file.type || "audio/mpeg").trim() || "audio/mpeg",
          size: Math.max(0, Number(file.size || 0) || 0),
          durationSec,
          startOffsetMs: 0,
          durationMeasuredWith: String(durationInfo?.method || "").trim().toLowerCase(),
          localDataUrl: "",
          downloadUrl: String(globalTrack.downloadUrl || "").trim(),
          storagePath: String(globalTrack.storagePath || "").trim(),
          updatedAt: String(globalTrack.updatedAt || nowIso()).trim() || nowIso(),
          ownerEmail: String(globalTrack.ownerEmail || "").trim()
        });
        if (els.panelMusicFileInput) {
          els.panelMusicFileInput.value = "";
        }
        persistPanelMusicSettings();
        persistPanelMusicToActiveSession();
        syncMusicControls();
        renderPodcastVideoTimeline(getActiveSession());
        if (panelMusicState.playing) {
          stopPanelMusic();
          await startPanelMusic();
        }
        setGenerationStatus("Audio añadido a la biblioteca global y a esta sesión.", "is-live");
      } catch (error) {
        addChatMessage("system", `No se pudo cargar la música (${error.message}).`);
        setGenerationStatus("Error", "");
      }
    });
  }
  if (els.generatePanelMusicAiBtn) {
    els.generatePanelMusicAiBtn.addEventListener("click", async () => {
      if (panelMusicAiGenerating) return;
      panelMusicAiGenerating = true;
      setButtonLoadingState(els.generatePanelMusicAiBtn, true, {
        loadingTitle: "Generando música con IA..."
      });
      syncMusicControls();
      try {
        const track = await generatePanelMusicWithAi();
        setGenerationStatus(`Música IA lista: ${track?.name || "Audio"}`, "is-live");
      } catch (error) {
        console.error("[podcaster] panel music ai generation failed", error);
        addChatMessage("system", `No se pudo generar música con IA (${error.message}).`);
        setGenerationStatus("Error", "");
      } finally {
        panelMusicAiGenerating = false;
        setButtonLoadingState(els.generatePanelMusicAiBtn, false);
        syncMusicControls();
      }
    });
  }
  if (els.clearPanelMusicTrackBtn) {
    els.clearPanelMusicTrackBtn.addEventListener("click", () => {
      if (panelMusicState.playing && panelMusicState.sourceType === "track") {
        stopPanelMusic();
      }
      const kindToClear = resolvePanelMusicTrackKind(panelMusicState.selectedTrackKind);
      if (kindToClear === "uploaded") {
        setPanelMusicUploadedTracks([], { selectIndex: 0 });
        panelMusicState.track = null;
        panelMusicState.sourceType = "preset";
      } else {
        panelMusicState.trackLibrary[kindToClear] = null;
        syncActivePanelMusicTrack();
      }
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      syncMusicControls();
      renderPodcastVideoTimeline(getActiveSession());
    });
  }
  if (els.panelMusicPlayBtn) {
    els.panelMusicPlayBtn.addEventListener("click", async () => {
      await startPanelMusic();
    });
  }
  if (els.panelMusicStopBtn) {
    els.panelMusicStopBtn.addEventListener("click", () => {
      stopPanelMusic();
    });
  }
  if (els.openGlobalConfigBtn) {
    els.openGlobalConfigBtn.addEventListener("click", () => {
      const session = getActiveSession();
      if (session) syncGlobalConfigPanel(session);
      setGlobalConfigOpen(true);
    });
  }
  if (els.closeGlobalConfigBtn) {
    els.closeGlobalConfigBtn.addEventListener("click", () => {
      setGlobalConfigOpen(false);
    });
  }
  if (els.globalApplyModeSelect) {
    els.globalApplyModeSelect.addEventListener("change", () => {
      if (els.globalSceneSelectionInput) {
        const isSelectedMode = String(els.globalApplyModeSelect.value || "all") === "selected";
        els.globalSceneSelectionInput.disabled = !isSelectedMode;
      }
    });
  }
  if (els.speakerCountInput) {
    els.speakerCountInput.addEventListener("input", () => {
      const session = getActiveSession();
      if (!session) return;
      const draft = collectGlobalSpeakerDraft(session);
      const count = normalizeHostsCount(els.speakerCountInput.value || 2);
      els.speakerCountInput.value = String(count);
      const hosts = hostsForCount(count);
      renderGlobalSpeakerSettings(hosts, session, draft);
    });
  }
  [els.globalSpeakerSettings, els.podcastStudioInspectorRowEditor]
    .filter(Boolean)
    .forEach((container) => {
      container.addEventListener("input", (event) => {
        const field = event.target?.dataset?.field;
        const row = event.target?.closest?.(".global-speaker-row");
        const host = String(row?.dataset?.hostName || event.target?.dataset?.hostName || "").trim();
        if (!field || !host) return;
        syncSpeakerFieldAcrossPanels(host, field, event.target.value, container);
        persistSpeakerIdentityDraft();
        renderPodcastPortraitStrip(getActiveSession());
      });
      container.addEventListener("change", (event) => {
        const field = event.target?.dataset?.field;
        const row = event.target?.closest?.(".global-speaker-row");
        const host = String(row?.dataset?.hostName || event.target?.dataset?.hostName || "").trim();
        if (!field || !host) return;
        syncSpeakerFieldAcrossPanels(host, field, event.target.value, container);
        persistSpeakerIdentityDraft();
        renderPodcastPortraitStrip(getActiveSession());
      });
    });
  [els.globalDisfluencyEnabled, els.globalStutterEnabled, els.globalFillerLevel, els.globalErrorLevel, els.globalStutterLevel]
    .filter(Boolean)
    .forEach((input) => {
      const eventName = input.type === "range" ? "input" : "change";
      input.addEventListener(eventName, () => {
        persistGlobalDisfluencyDraft();
      });
    });
  if (els.applyGlobalConfigBtn) {
    els.applyGlobalConfigBtn.addEventListener("click", async () => {
      await applyGlobalConfig();
    });
  }
  if (els.podcastVideoModal) {
    els.podcastVideoModal.addEventListener("click", (event) => {
      const openBtn = event.target.closest("[data-action='open-global-config-from-inspector']");
      if (!openBtn) return;
      setGlobalConfigOpen(true);
      syncGlobalConfigPanel(getActiveSession());
    });
  }
  if (els.podcastPlayBtn) {
    els.podcastPlayBtn.addEventListener("click", async () => {
      if (podcastPlaybackState.active && podcastPlaybackState.paused) {
        await resumePodcastPlayback();
        return;
      }
      const startIndex = Math.max(0, podcastPlaybackState.currentQueueIndex >= 0 ? podcastPlaybackState.currentQueueIndex : 0);
      await startPodcastPlayback(startIndex);
    });
  }
  if (els.podcastPauseBtn) {
    els.podcastPauseBtn.addEventListener("click", async () => {
      await pausePodcastPlayback();
    });
  }
  if (els.podcastStopBtn) {
    els.podcastStopBtn.addEventListener("click", () => {
      stopPodcastPlayback();
    });
  }
  if (els.podcastPrevBtn) {
    els.podcastPrevBtn.addEventListener("click", async () => {
      await jumpPodcastPlayback(-1);
    });
  }
  if (els.podcastNextBtn) {
    els.podcastNextBtn.addEventListener("click", async () => {
      await jumpPodcastPlayback(1);
    });
  }
  if (els.podcastSpeedSelect) {
    els.podcastSpeedSelect.addEventListener("change", () => {
      podcastPlaybackState.speed = Math.max(0.5, Math.min(1.8, Number(els.podcastSpeedSelect.value || 1)));
      if (podcastPlaybackState.active) {
        setPodcastPlaybackStatus(`Reproduciendo a ${podcastPlaybackState.speed.toFixed(2)}x`);
      } else if (!podcastPlaybackState.paused) {
        setPodcastPlaybackStatus("Detenido");
      }
    });
  }
  if (els.downloadPodcastBtn) {
    els.downloadPodcastBtn.addEventListener("click", () => {
      downloadRecordedPodcast();
    });
  }
  if (els.togglePodcastVideoBtn) {
    els.togglePodcastVideoBtn.addEventListener("click", async () => {
      const next = !podcastVideoState.enabled;
      if (!next) {
        closePodcastVideoModal();
        return;
      }
      await openPodcastVideoModalWithLoader();
    });
  }
  if (els.closePodcastVideoBtn) {
    els.closePodcastVideoBtn.addEventListener("click", () => {
      closePodcastVideoModal();
    });
  }
  if (els.togglePodcastStudioInspectorBtn) {
    els.togglePodcastStudioInspectorBtn.addEventListener("click", () => {
      setPodcastStudioInspectorCollapsed(!podcastStudioInspectorCollapsed);
    });
  }
  if (els.podcastStudioInspectorCollapsedHandle) {
    els.podcastStudioInspectorCollapsedHandle.addEventListener("click", () => {
      setPodcastStudioInspectorCollapsed(false);
    });
  }
  if (els.closeTransitionPickerBtn) {
    els.closeTransitionPickerBtn.addEventListener("click", () => {
      setPodcastTransitionPickerOpen(false);
    });
  }
  if (els.podcastTransitionPickerGrid) {
    els.podcastTransitionPickerGrid.addEventListener("click", (event) => {
      const optionBtn = event.target.closest("[data-action='pick-transition-type']");
      if (!optionBtn) return;
      const edge = getActiveTransitionEdge(getActiveSession());
      if (!edge.fromRowId || !edge.toRowId) return;
      const type = String(optionBtn.dataset.transitionType || "cut").trim().toLowerCase();
      const defaultPreset = STUDIO_TRANSITION_PRESETS[type] || STUDIO_TRANSITION_PRESETS.cut;
      const duration = Math.max(
        0,
        Math.min(
          1200,
          toFiniteNumber(optionBtn.dataset.transitionDuration, defaultPreset.durationMs)
        )
      );
      setTransitionForEdge(edge.fromRowId, edge.toRowId, type, duration);
      setPodcastTransitionPickerOpen(false);
      setGenerationStatus(`Transición aplicada: ${type}`, "is-live");
    });
  }
  if (els.podcastActiveSpeakerVideo) {
    els.podcastActiveSpeakerVideo.addEventListener("play", updatePodcastVideoTransportUi);
    els.podcastActiveSpeakerVideo.addEventListener("pause", updatePodcastVideoTransportUi);
    els.podcastActiveSpeakerVideo.addEventListener("ended", updatePodcastVideoTransportUi);
    els.podcastActiveSpeakerVideo.addEventListener("timeupdate", () => {
      const durationSec = Math.max(0.1, Number(podcastVideoState.timelineDurationSec || 0.1));
      const current = podcastVideoState.montageActive
        ? Math.max(0, Number(podcastVideoState.montageCursorMs || 0) / 1000)
        : Number(els.podcastActiveSpeakerVideo.currentTime || 0);
      if (!podcastVideoState.montageActive) {
        const session = getActiveSession();
        const clipMap = ensureTimelineClipsByRowId(session, { persist: false });
        const activeClip = clipMap[String(podcastVideoState.activeRowId || "").trim()];
        if (activeClip) {
          const clipStartMs = Math.max(0, Number(activeClip.startMs || 0));
          const clipDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(activeClip));
          const clipEndMs = clipStartMs + clipDurationMs;
          const sceneMs = clipStartMs + Math.max(0, current * 1000);
          podcastVideoState.montageCursorMs = Math.max(clipStartMs, Math.min(clipEndMs, sceneMs));
          syncPodcastTimelinePlayhead(session);
        }
      }
      if (els.podcastStudioScrubber && durationSec > 0 && !podcastVideoState.montageActive) {
        const ratio = Math.max(0, Math.min(1, current / durationSec));
        els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
      }
      if (els.podcastStudioTime) {
        const total = Math.max(durationSec, Number(podcastVideoState.timelineDurationSec || 0));
        els.podcastStudioTime.textContent = `${secondsToClock(current)} / ${secondsToClock(total)}`;
      }
    });
  }
  if (els.podcastVideoPlayBtn) {
    els.podcastVideoPlayBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      if (!(session?.script?.rows || []).length) return;
      const startMs = podcastVideoState.montagePaused
        ? Number(podcastVideoState.montageCursorMs || 0)
        : Number(podcastVideoState.montageCursorMs || 0);
      await playPodcastStudioMontage(startMs);
    });
  }
  if (els.podcastVideoPauseBtn) {
    els.podcastVideoPauseBtn.addEventListener("click", () => {
      if (podcastVideoState.montageActive) {
        pausePodcastStudioMontage();
        return;
      }
      if (els.podcastActiveSpeakerVideo && !els.podcastActiveSpeakerVideo.paused) {
        try { els.podcastActiveSpeakerVideo.pause(); } catch (_) {}
      }
      if (podcastVideoState.audioEl && !podcastVideoState.audioEl.paused) {
        try { podcastVideoState.audioEl.pause(); } catch (_) {}
      }
      Object.values(podcastVideoState.montageAudioPlayers || {}).forEach((audio) => {
        try { audio.pause(); } catch (_) {}
      });
      setPodcastVideoStatus("Pausado");
      updatePodcastVideoTransportUi();
    });
  }
  if (els.podcastVideoStopBtn) {
    els.podcastVideoStopBtn.addEventListener("click", () => {
      stopPodcastStudioMontage();
    });
  }
  if (els.podcastVideoPrevBtn) {
    els.podcastVideoPrevBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      const entries = buildTimelineRuntimeEntries(session);
      if (!entries.length) return;
      const markers = getOrderedTimelineStartMarkers(entries);
      const current = Math.max(0, Number(podcastVideoState.montageCursorMs || 0));
      const prev = [...markers].reverse().find((ms) => ms < current - 120) ?? 0;
      stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
      podcastVideoState.montageCursorMs = prev;
      syncPodcastTimelinePlayhead(session);
      await syncStudioTimelinePreview(prev, entries);
      if (els.podcastStudioScrubber && podcastVideoState.timelineDurationSec > 0) {
        const ratio = Math.max(0, Math.min(1, prev / (podcastVideoState.timelineDurationSec * 1000)));
        els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
      }
    });
  }
  if (els.podcastVideoNextBtn) {
    els.podcastVideoNextBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      const entries = buildTimelineRuntimeEntries(session);
      if (!entries.length) return;
      const markers = getOrderedTimelineStartMarkers(entries);
      const current = Math.max(0, Number(podcastVideoState.montageCursorMs || 0));
      const next = markers.find((ms) => ms > current + 120) ?? markers[markers.length - 1];
      stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
      podcastVideoState.montageCursorMs = next;
      syncPodcastTimelinePlayhead(session);
      await syncStudioTimelinePreview(next, entries);
      if (els.podcastStudioScrubber && podcastVideoState.timelineDurationSec > 0) {
        const ratio = Math.max(0, Math.min(1, next / (podcastVideoState.timelineDurationSec * 1000)));
        els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
      }
    });
  }
  if (els.podcastVideoSpeedSelect) {
    els.podcastVideoSpeedSelect.addEventListener("change", () => {
      if (!els.podcastActiveSpeakerVideo) return;
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect.value || 1)));
      els.podcastActiveSpeakerVideo.playbackRate = speed;
      if (podcastVideoState.audioEl) {
        podcastVideoState.audioEl.playbackRate = speed;
      }
      Object.values(podcastVideoState.montageAudioPlayers || {}).forEach((audio) => {
        try {
          audio.playbackRate = speed;
        } catch (_) {
          // noop
        }
      });
    });
  }
  if (els.podcastVideoZoomBtn) {
    els.podcastVideoZoomBtn.addEventListener("click", () => {
      setPodcastVideoZoomEnabled(!podcastVideoState.zoomed);
    });
  }
  if (els.podcastStudioScrubber) {
    els.podcastStudioScrubber.addEventListener("input", () => {
      const session = getActiveSession();
      if (!(session?.script?.rows || []).length) return;
      const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
      const ratio = Math.max(0, Math.min(1, Number(els.podcastStudioScrubber.value || 0) / 100));
      const nextMs = Math.max(0, Math.min(durationMs, ratio * durationMs));
      podcastVideoState.montageCursorMs = nextMs;
      syncPodcastTimelinePlayhead(session);
      if (podcastVideoState.montageActive) {
        stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
      }
      const entries = buildTimelineRuntimeEntries(session);
      syncStudioTimelinePreview(nextMs, entries).catch(() => {});
      if (els.podcastStudioTime) {
        els.podcastStudioTime.textContent = `${secondsToClock(nextMs / 1000)} / ${secondsToClock(durationMs / 1000)}`;
      }
    });
  }
  if (els.podcastTimelineRuler) {
    els.podcastTimelineRuler.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      seekStudioTimelineByRulerClientX(event.clientX, { stopMontage: true });
      event.preventDefault();
    });
  }
  const runGenerateMissingDialogueVideos = async (options = {}) => {
    const session = getActiveSession();
    const rows = session?.script?.rows || [];
    if (!rows.length || podcastVideoState.busy) return;
    const triggerButton = options.triggerButton || null;
    const preservedActiveRowId = String(podcastVideoState.activeRowId || "").trim();
    const eligibleRows = rows.filter((row) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId) return false;
      return !hasGeneratedDialogueVideoForRow(session, rowId);
    });
    logPodcastBatchDebug("batch-eligible-rows", {
      totalRows: rows.length,
      eligibleRowIds: eligibleRows.map((row) => String(row?.id || "").trim()),
      eligibleScenes: eligibleRows.map((row) => resolveSceneNumberByRowId(String(row?.id || "").trim(), session))
    });
    if (!eligibleRows.length) {
      setGenerationStatus("Todas las escenas ya tienen video", "is-live");
      return;
    }
    const readyRows = eligibleRows.slice();
    const skippedRowsMissingAudio = [];
    logPodcastBatchDebug("batch-ready-vs-skipped", {
      readyRowIds: readyRows.map((row) => String(row?.id || "").trim()),
      readyScenes: readyRows.map((row) => resolveSceneNumberByRowId(String(row?.id || "").trim(), session)),
      skippedRowIds: skippedRowsMissingAudio.map((row) => String(row?.id || "").trim()),
      skippedScenes: skippedRowsMissingAudio.map((row) => resolveSceneNumberByRowId(String(row?.id || "").trim(), session))
    });
    podcastVideoState.busy = true;
    podcastVideoState.bulkVideoGenerationActive = true;
    podcastVideoState.bulkVideoGenerationMode = "missing";
    setButtonLoadingState(triggerButton, true, {
      loadingTitle: "Generando escenas faltantes..."
    });
    addChatMessage("system", `Cola iniciada: ${readyRows.length} escena(s) sin video.`);
    updatePodcastPlayerUi();
    const failures = [];
    let successCount = 0;
    try {
      for (let i = 0; i < readyRows.length; i += 1) {
        const currentSession = getActiveSession();
        const row = ((currentSession?.script?.rows || []).find((item) => String(item?.id || "").trim() === String(readyRows[i]?.id || "").trim())) || readyRows[i];
        const rowId = String(row?.id || "").trim();
        if (!rowId) continue;
        setPodcastVideoStatus(`Generando escena ${i + 1}/${readyRows.length}...`);
        logPodcastBatchDebug("batch-iteration-start", {
          index: i,
          total: readyRows.length,
          rowId,
          sceneNumber: resolveSceneNumberByRowId(rowId, currentSession || session)
        });
        try {
          const generatedClip = await generateDialogueVideoForRow(rowId, {
            videoDirective: normalizeVideoDirectiveText(row?.videoDirective || ""),
            regenerate: false,
            silent: true,
            deferTimelineRender: false,
            syncStageAfterGenerate: false
          });
          const refreshedSession = getActiveSession();
          const resultingClip = resolveDialogueVideoForRow(refreshedSession, rowId);
          if (!hasStoredMediaSource(generatedClip) && !hasStoredMediaSource(resultingClip)) {
            throw new Error("La escena no devolvió un clip de video válido.");
          }
          successCount += 1;
          logPodcastBatchDebug("batch-iteration-success", {
            index: i,
            total: readyRows.length,
            rowId,
            sceneNumber: resolveSceneNumberByRowId(rowId, refreshedSession || currentSession || session),
            returnedClipUrl: String(generatedClip?.downloadUrl || "").trim(),
            storedClipUrl: String(resultingClip?.downloadUrl || "").trim()
          });
        } catch (error) {
          logPodcastBatchDebug("batch-iteration-error", {
            index: i,
            total: readyRows.length,
            rowId,
            sceneNumber: resolveSceneNumberByRowId(rowId, currentSession || session),
            message: String(error?.message || "error desconocido")
          });
          failures.push(`Escena ${resolveSceneNumberByRowId(rowId, session)}: ${String(error?.message || "error desconocido")}`);
        }
      }
      if (preservedActiveRowId && successCount > 0) {
        setPodcastVideoRow(preservedActiveRowId, {
          syncStage: false,
          preserveMontageCursor: true,
          lightweightUi: true
        });
      }
      if (failures.length) {
        addChatMessage("system", `Se generaron videos con incidencias: ${failures.slice(0, 5).join(" | ")}`);
        setGenerationStatus("Completado con incidencias", "");
      } else {
        setGenerationStatus("Escenas faltantes generadas", "is-live");
      }
    } catch (error) {
      logPodcastBatchDebug("batch-fatal-error", {
        message: String(error?.message || "error desconocido")
      });
      const message = String(error?.message || "No se pudieron generar los videos restantes.").trim() || "No se pudieron generar los videos restantes.";
      addChatMessage("system", message);
      setGenerationStatus("Error al generar videos", "");
    } finally {
      logPodcastBatchDebug("batch-finished", {
        successCount,
        failureCount: failures.length
      });
      setButtonLoadingState(triggerButton, false);
      podcastVideoState.bulkVideoGenerationActive = false;
      podcastVideoState.bulkVideoGenerationMode = "";
      podcastVideoState.busy = false;
      if (successCount > 0) {
        renderPodcastTransitionTimeline(getActiveSession());
        syncPodcastStudioInspector(getActiveSession());
      }
      updatePodcastPlayerUi();
    }
  };
  const runGenerateAllDialogueVideos = runGenerateMissingDialogueVideos;
  if (els.generateAllDialogueVideosBtn) {
    els.generateAllDialogueVideosBtn.addEventListener("click", async () => {
      await runGenerateMissingDialogueVideos({
        triggerButton: els.generateAllDialogueVideosBtn
      });
    });
  }
  if (els.regenerateAllDialogueVideosBtn) {
    els.regenerateAllDialogueVideosBtn.addEventListener("click", async () => {
      await runGenerateAllDialogueVideos({
        regenerateAll: true,
        triggerButton: els.regenerateAllDialogueVideosBtn
      });
    });
  }
  if (els.reorderTimelineTracksBtn) {
    els.reorderTimelineTracksBtn.addEventListener("click", () => {
      if (podcastVideoState.busy) return;
      const ok = reorderTimelineClipsByTracks();
      if (!ok) {
        setGenerationStatus("Se necesitan al menos 2 tracks con escenas", "");
      }
    });
  }
  const applyStudioMasterVolume = (rawValue) => {
    const value = Math.max(0, Math.min(100, toFiniteNumber(rawValue, 100)));
    upsertPodcastVideoConfig((cfg) => ({ ...cfg, masterVolume: value }));
    if (els.podcastStudioMasterVolume) {
      els.podcastStudioMasterVolume.value = String(value);
    }
    if (els.podcastStudioMasterVolumeNumber) {
      els.podcastStudioMasterVolumeNumber.value = String(value);
    }
    if (podcastVideoState.audioEl) {
      podcastVideoState.audioEl.volume = Math.max(0, Math.min(1, value / 100));
    }
    if (els.podcastActiveSpeakerVideo && String(getPodcastVideoConfig(getActiveSession()).audioMode || "gemini-live-per-scene") === "veo-native-audio") {
      els.podcastActiveSpeakerVideo.volume = Math.max(0, Math.min(1, value / 100));
    }
    syncPodcastStudioInspector(getActiveSession());
  };
  const applyStudioClipVolume = (rawValue) => {
    const value = Math.max(0, Math.min(100, toFiniteNumber(rawValue, 0)));
    upsertPodcastVideoConfig((cfg) => ({ ...cfg, clipVolume: value }));
    if (els.podcastStudioClipVolume) {
      els.podcastStudioClipVolume.value = String(value);
    }
    if (els.podcastStudioClipVolumeNumber) {
      els.podcastStudioClipVolumeNumber.value = String(value);
    }
    if (els.podcastActiveSpeakerVideo) {
      els.podcastActiveSpeakerVideo.volume = Math.max(0, Math.min(1, value / 100));
    }
    syncPodcastStudioInspector(getActiveSession());
  };
  if (els.podcastStudioMasterVolume) {
    els.podcastStudioMasterVolume.addEventListener("input", () => {
      applyStudioMasterVolume(els.podcastStudioMasterVolume.value);
    });
  }
  if (els.podcastStudioMasterVolumeNumber) {
    els.podcastStudioMasterVolumeNumber.addEventListener("input", () => {
      applyStudioMasterVolume(els.podcastStudioMasterVolumeNumber.value);
    });
    els.podcastStudioMasterVolumeNumber.addEventListener("change", () => {
      applyStudioMasterVolume(els.podcastStudioMasterVolumeNumber.value);
    });
  }
  if (els.podcastStudioClipVolume) {
    els.podcastStudioClipVolume.addEventListener("input", () => {
      applyStudioClipVolume(els.podcastStudioClipVolume.value);
    });
  }
  if (els.podcastStudioClipVolumeNumber) {
    els.podcastStudioClipVolumeNumber.addEventListener("input", () => {
      applyStudioClipVolume(els.podcastStudioClipVolumeNumber.value);
    });
    els.podcastStudioClipVolumeNumber.addEventListener("change", () => {
      applyStudioClipVolume(els.podcastStudioClipVolumeNumber.value);
    });
  }
  if (els.podcastTransitionTypeSelect) {
    els.podcastTransitionTypeSelect.addEventListener("change", () => {
      const type = String(els.podcastTransitionTypeSelect.value || "cut").trim().toLowerCase();
      const duration = toFiniteNumber(els.podcastTransitionDurationRange?.value, 0);
      setTransitionForActiveEdge(type, duration);
    });
  }
  if (els.podcastTransitionDurationRange) {
    els.podcastTransitionDurationRange.addEventListener("input", () => {
      const duration = Math.max(0, Math.min(1200, toFiniteNumber(els.podcastTransitionDurationRange.value, 0)));
      if (els.podcastTransitionDurationLabel) {
        els.podcastTransitionDurationLabel.textContent = `${duration} ms`;
      }
      const type = String(els.podcastTransitionTypeSelect?.value || "cut").trim().toLowerCase();
      setTransitionForActiveEdge(type, duration);
    });
  }
  if (els.regenerateAllPortraitsBtn) {
    els.regenerateAllPortraitsBtn.addEventListener("click", async () => {
      if (podcastVideoState.busy) return;
      setButtonLoadingState(els.regenerateAllPortraitsBtn, true, {
        loadingTitle: "Regenerando retratos..."
      });
      try {
        await regenerateAllSpeakerPortraits();
        renderPodcastVideoShell(getActiveSession());
      } finally {
        setButtonLoadingState(els.regenerateAllPortraitsBtn, false);
      }
    });
  }
  if (els.generateDialogueVideoBtn) {
    els.generateDialogueVideoBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      const rowId = resolveTargetVideoRowId(session);
      if (!session || !rowId || podcastVideoState.busy) return;
      try {
        await runSceneVideoGenerationFlow(rowId, {
          promptDirective: true,
          loadingButton: els.generateDialogueVideoBtn,
          loadingTitle: "Generando video de escena...",
          selectRow: true,
          syncStage: true,
          silent: false,
          syncStageAfterGenerate: true
        });
      } catch (error) {
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudo generar video de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
      }
    });
  }
  if (els.generateDialogueAudioBtn) {
    els.generateDialogueAudioBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      const rowId = resolveTargetVideoRowId(session);
      if (!session || !rowId || podcastVideoState.busy) return;
      podcastVideoState.busy = true;
      setButtonLoadingState(els.generateDialogueAudioBtn, true, {
        loadingTitle: "Generando voz de escena..."
      });
      updatePodcastPlayerUi();
      try {
        await generateDialogueAudioForRow(rowId, { regenerate: false, silent: false });
        renderPodcastVideoShell(getActiveSession());
      } catch (error) {
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudo generar voz de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
      } finally {
        setButtonLoadingState(els.generateDialogueAudioBtn, false);
        podcastVideoState.busy = false;
        updatePodcastPlayerUi();
      }
    });
  }
  if (els.regenerateDialogueAudioBtn) {
    els.regenerateDialogueAudioBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      const rowId = resolveTargetVideoRowId(session);
      if (!session || !rowId || podcastVideoState.busy) return;
      podcastVideoState.busy = true;
      setButtonLoadingState(els.regenerateDialogueAudioBtn, true, {
        loadingTitle: "Regenerando voz de escena..."
      });
      updatePodcastPlayerUi();
      try {
        await generateDialogueAudioForRow(rowId, { regenerate: true, silent: false });
        renderPodcastVideoShell(getActiveSession());
      } catch (error) {
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudo regenerar voz de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
      } finally {
        setButtonLoadingState(els.regenerateDialogueAudioBtn, false);
        podcastVideoState.busy = false;
        updatePodcastPlayerUi();
      }
    });
  }
  if (els.deleteDialogueAudioBtn) {
    els.deleteDialogueAudioBtn.addEventListener("click", () => {
      const rowId = resolveTargetVideoRowId(getActiveSession());
      if (!rowId) return;
      const confirmed = window.confirm(`Se eliminará la voz de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}. ¿Deseas continuar?`);
      if (!confirmed) return;
      removeDialogueAudioForRow(rowId, { silent: false });
      renderPodcastVideoShell(getActiveSession());
    });
  }
  if (els.podcastVideoTimeline) {
    const onTimelinePointerMove = (event) => {
      if (!podcastVideoState.timelineDrag) return;
      if (podcastVideoState.timelineDrag.mode === "playhead") {
        seekStudioTimelineByClientX(event.clientX, { stopMontage: false });
        return;
      }
      if (podcastVideoState.timelineDrag.mode === "gap-selection") {
        const lane = els.podcastVideoTimeline.querySelector(`.podcast-video-track-lane[data-track-id="${CSS.escape(String(podcastVideoState.timelineDrag.trackId || ""))}"]`);
        if (!lane) return;
        podcastVideoState.timelineDrag.moved = true;
        updateTimelineGapSelection(getTrackLaneContentPx(lane, event.clientX));
        return;
      }
      applyTimelineClipDrag(event);
    };
    const onTimelinePointerUp = () => {
      if (!podcastVideoState.timelineDrag) return;
      if (podcastVideoState.timelineDrag.mode === "playhead") {
        podcastVideoState.timelineJustDraggedUntil = Date.now() + 240;
        clearPodcastTimelineDragUi();
        syncPodcastTimelineSelectionUi(getActiveSession());
        syncPodcastTimelinePlayhead(getActiveSession());
        syncPodcastStudioInspector(getActiveSession());
        return;
      }
      if (podcastVideoState.timelineDrag.mode === "gap-selection") {
        podcastVideoState.timelineDrag = null;
        syncTimelineGapSelectionUi();
        return;
      }
      const moved = podcastVideoState.timelineDrag.moved === true;
      if (!moved) {
        clearPodcastTimelineDragUi();
        return;
      }
      podcastVideoState.timelineJustDraggedUntil = Date.now() + 240;
      finalizeTimelineClipDrag();
      clearPodcastTimelineDragUi();
      renderPodcastVideoShell(getActiveSession());
    };
    els.podcastVideoTimeline.addEventListener("mousedown", (event) => {
      if (getTimelineViewMode(getActiveSession()) !== "tracks") return;
      if (event.button !== 0) return;
      const playhead = event.target.closest("[data-action='timeline-drag-playhead']");
      if (playhead) {
        podcastVideoState.timelineDrag = {
          mode: "playhead"
        };
        seekStudioTimelineByClientX(event.clientX, { stopMontage: true });
        event.preventDefault();
        return;
      }
      const clipCard = event.target.closest(".podcast-video-timeline-clip[data-row-id]");
      if (clipCard) {
        if (event.target.closest(".row-icon-btn")) {
          return;
        }
      }
      const trimStartBtn = event.target.closest("[data-action='timeline-trim-start']");
      if (trimStartBtn) {
        const rowId = String(trimStartBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        beginTimelineClipDrag("trim-start", rowId, event);
        event.preventDefault();
        return;
      }
      const audioTrimStartBtn = event.target.closest("[data-action='timeline-audio-trim-start']");
      if (audioTrimStartBtn) {
        beginTimelineAudioTrimDrag("audio-trim-start", event);
        event.preventDefault();
        return;
      }
      const trimEndBtn = event.target.closest("[data-action='timeline-trim-end']");
      if (trimEndBtn) {
        const rowId = String(trimEndBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        beginTimelineClipDrag("trim-end", rowId, event);
        event.preventDefault();
        return;
      }
      const audioTrimEndBtn = event.target.closest("[data-action='timeline-audio-trim-end']");
      if (audioTrimEndBtn) {
        beginTimelineAudioTrimDrag("audio-trim-end", event);
        event.preventDefault();
        return;
      }
      const dragAudioTrack = event.target.closest("[data-action='timeline-drag-audio-track']");
      if (dragAudioTrack && !event.target.closest(".podcast-audio-loop-mute-btn")) {
        beginTimelineAudioMoveDrag(event);
        event.preventDefault();
        return;
      }
      const dragClip = event.target.closest("[data-action='timeline-drag-clip'][data-row-id]");
      if (dragClip && !event.target.closest(".row-icon-btn")) {
        const rowId = String(dragClip.dataset.rowId || "").trim();
        if (!rowId) return;
        selectTimelineSceneRow(rowId, { syncStage: false });
        podcastVideoState.timelineLastInteractedRowId = rowId;
        beginTimelineClipDrag("move", rowId, event);
        event.preventDefault();
        return;
      }
      if (event.target.closest("[data-action='timeline-delete-selected-gap']")) {
        return;
      }
      const lane = event.target.closest(".podcast-video-track-lane[data-track-id]");
      if (lane && !event.target.closest(".podcast-audio-timeline-chip")) {
        const started = beginTimelineGapSelection(lane, event);
        if (started) {
          event.preventDefault();
        }
      }
    });
    document.addEventListener("mousemove", onTimelinePointerMove);
    document.addEventListener("mouseup", onTimelinePointerUp);
    els.podcastVideoTimeline.addEventListener("click", async (event) => {
      if (Date.now() < Number(podcastVideoState.timelineJustDraggedUntil || 0)) {
        return;
      }
      const transitionBtn = event.target.closest("[data-action='timeline-open-transition']");
      if (transitionBtn) {
        const fromRowId = String(transitionBtn.dataset.fromRowId || "").trim();
        const toRowId = String(transitionBtn.dataset.toRowId || "").trim();
        if (fromRowId && toRowId) {
          podcastVideoState.activeRowId = fromRowId;
          setPodcastTransitionPickerOpen(true, fromRowId, toRowId);
          syncPodcastStudioInspector(getActiveSession());
        }
        return;
      }
      const openAudioTrackMixBtn = event.target.closest("[data-action='open-audio-track-mix']");
      if (openAudioTrackMixBtn) {
        setAudioTrackMixOpen(true);
        return;
      }
      const selectAudioLoopChip = event.target.closest("[data-action='timeline-select-audio-loop']");
      if (selectAudioLoopChip) {
        const trackIndex = Number(selectAudioLoopChip.dataset.trackIndex);
        if (Number.isFinite(trackIndex)) {
          selectUploadedPanelMusicTrackByIndex(trackIndex);
        }
        podcastAudioTrackUiState.activeLoopIndex = Math.max(0, Math.floor(Number(selectAudioLoopChip.dataset.loopIndex || 0) || 0));
        renderPodcastVideoTimeline(getActiveSession());
        return;
      }
      const toggleAudioLoopMuteBtn = event.target.closest("[data-action='timeline-toggle-audio-loop-mute']");
      if (toggleAudioLoopMuteBtn) {
        event.preventDefault();
        const trackIndex = Number(toggleAudioLoopMuteBtn.dataset.trackIndex);
        if (Number.isFinite(trackIndex)) {
          selectUploadedPanelMusicTrackByIndex(trackIndex);
        }
        const loopIndex = Math.max(0, Math.floor(Number(toggleAudioLoopMuteBtn.dataset.loopIndex || 0) || 0));
        togglePanelMusicLoopMute(loopIndex, panelMusicState.selectedTrackKind);
        return;
      }
      const deleteSelectedGapBtn = event.target.closest("[data-action='timeline-delete-selected-gap']");
      if (deleteSelectedGapBtn) {
        event.preventDefault();
        deleteSelectedTimelineGap();
        return;
      }
      const selectBtn = event.target.closest("[data-action='timeline-select-scene']");
      if (selectBtn) {
        const rowId = String(selectBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        selectTimelineSceneRow(rowId, { syncStage: false });
        return;
      }
      const clipBody = event.target.closest(".podcast-video-clip-body[data-row-id]");
      if (clipBody && !event.target.closest(".row-icon-btn")) {
        const rowId = String(clipBody.dataset.rowId || "").trim();
        if (!rowId) return;
        selectTimelineSceneRow(rowId, { syncStage: false });
        return;
      }

      const playBtn = event.target.closest("[data-action='timeline-play-scene-video']");
      if (playBtn) {
        const rowId = String(playBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        const session = getActiveSession();
        const row = (session?.script?.rows || []).find((item) => item.id === rowId) || null;
        setPodcastVideoRow(rowId, { syncStage: true });
        if (row?.speaker) {
          setPodcastVideoSpeaker(session, row.speaker, { speaking: false, rowId });
        }
        stopPodcastStudioMontage({ keepStatus: true, keepCursor: true });
        await playSceneInStudio(row, { allowGenerateAudio: true });
        return;
      }

      const generateBtn = event.target.closest("[data-action='timeline-generate-scene-video']");
      if (generateBtn) {
        const rowId = String(generateBtn.dataset.rowId || "").trim();
        if (!rowId || podcastVideoState.busy) return;
        const loadingBtn = findTimelineActionButton("timeline-generate-scene-video", rowId) || generateBtn;
        try {
          await runSceneVideoGenerationFlow(rowId, {
            promptDirective: true,
            loadingButton: loadingBtn,
            loadingTitle: "Generando video de escena...",
            selectRow: true,
            syncStage: false,
            silent: false,
            syncStageAfterGenerate: false
          });
        } catch (error) {
          setGenerationStatus("Error", "");
          addChatMessage("system", `No se pudo generar video de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
        }
        return;
      }

      const deleteBtn = event.target.closest("[data-action='timeline-delete-scene-video']");
      if (deleteBtn) {
        const rowId = String(deleteBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        const confirmed = window.confirm(`Se eliminará el video de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}. ¿Deseas continuar?`);
        if (!confirmed) return;
        removeDialogueVideoForRow(rowId, { silent: false });
      }
    });
  }
  if (els.podcastTimelineNormalModeBtn) {
    els.podcastTimelineNormalModeBtn.addEventListener("click", () => {
      setTimelineViewMode("normal");
    });
  }
  if (els.podcastTimelineTracksModeBtn) {
    els.podcastTimelineTracksModeBtn.addEventListener("click", () => {
      setTimelineViewMode("tracks");
    });
  }
  if (els.podcastPortraitStrip) {
    els.podcastPortraitStrip.addEventListener("click", async (event) => {
      const attachSpeakerReferenceBtn = event.target.closest("[data-action='attach-speaker-reference-image']");
      if (attachSpeakerReferenceBtn) {
        const speaker = String(attachSpeakerReferenceBtn.dataset.speaker || "").trim();
        if (speaker && els.speakerReferenceImageInput) {
          els.speakerReferenceImageInput.dataset.speaker = speaker;
          els.speakerReferenceImageInput.click();
        }
        return;
      }
      const clearSpeakerReferenceBtn = event.target.closest("[data-action='clear-speaker-reference-image']");
      if (clearSpeakerReferenceBtn) {
        const speaker = String(clearSpeakerReferenceBtn.dataset.speaker || "").trim();
        if (speaker) setSpeakerReferenceImage(speaker, null);
        return;
      }
      const attachScenarioReferenceBtn = event.target.closest("[data-action='attach-scenario-reference-image']");
      if (attachScenarioReferenceBtn) {
        const scenarioId = String(attachScenarioReferenceBtn.dataset.scenarioId || "").trim();
        if (scenarioId && els.scenarioReferenceImageInput) {
          els.scenarioReferenceImageInput.dataset.scenarioId = scenarioId;
          els.scenarioReferenceImageInput.click();
        }
        return;
      }
      const clearScenarioReferenceBtn = event.target.closest("[data-action='clear-scenario-reference-image']");
      if (clearScenarioReferenceBtn) {
        const scenarioId = String(clearScenarioReferenceBtn.dataset.scenarioId || "").trim();
        if (scenarioId) setScenarioReferenceImage(scenarioId, null);
        return;
      }
      const openPortraitBtn = event.target.closest("[data-action='open-portrait-viewer']");
      if (openPortraitBtn) {
        event.stopPropagation();
        const src = String(openPortraitBtn.dataset.portraitSrc || "").trim();
        if (src) {
          openPodcastPortraitViewer({
            src,
            title: String(openPortraitBtn.dataset.portraitTitle || "").trim(),
            meta: String(openPortraitBtn.dataset.portraitMeta || "").trim()
          });
        }
        return;
      }
      const toggleGlobalPromptBtn = event.target.closest("[data-action='toggle-global-scenario-prompt']");
      if (toggleGlobalPromptBtn) {
        const scenarioId = String(toggleGlobalPromptBtn.dataset.scenarioId || "").trim();
        if (scenarioId) {
          const promptEl = els.podcastPortraitStrip.querySelector(`[data-scenario-prompt="${CSS.escape(scenarioId)}"]`);
          if (promptEl) promptEl.hidden = !promptEl.hidden;
        }
        return;
      }
      const useGlobalScenarioBtn = event.target.closest("[data-action='use-global-scenario']");
      if (useGlobalScenarioBtn) {
        const scenarioId = String(useGlobalScenarioBtn.dataset.scenarioId || "").trim();
        if (scenarioId) {
          selectGlobalScenarioVariant(scenarioId);
        }
        return;
      }
      const regenerateGlobalScenarioBtn = event.target.closest("[data-action='regenerate-global-scenario']");
      if (regenerateGlobalScenarioBtn) {
        const scenarioId = String(regenerateGlobalScenarioBtn.dataset.scenarioId || "").trim();
        if (scenarioId) {
          podcastVideoState.busy = true;
          updatePodcastPlayerUi();
          try {
            regenerateGlobalScenarioVariant(scenarioId);
            await generateGlobalScenarioImage(scenarioId, { regenerate: true });
          } catch (error) {
            addChatMessage("system", `No se pudo regenerar la imagen del escenario (${error.message}).`);
            setGenerationStatus("Error", "");
          } finally {
            podcastVideoState.busy = false;
            updatePodcastPlayerUi();
          }
        }
        return;
      }
      const card = event.target.closest("[data-speaker-select]");
      if (card && !event.target.closest("[data-action='regenerate-speaker-portrait']")) {
        const speaker = String(card.dataset.speakerSelect || card.dataset.speaker || "").trim();
        if (speaker) {
          const rowId = resolveTargetVideoRowId(getActiveSession(), speaker);
          setPodcastVideoRow(rowId, { syncStage: true });
          setPodcastVideoSpeaker(getActiveSession(), speaker, { speaking: podcastVideoState.speaking && podcastVideoState.activeSpeaker === speaker });
          renderPodcastPortraitStrip(getActiveSession());
        }
      }
      const actionBtn = event.target.closest("[data-action='regenerate-speaker-portrait']");
      if (!actionBtn) return;
      if (podcastVideoState.busy) return;
      const speaker = String(actionBtn.dataset.speaker || "").trim();
      if (!speaker) return;
      podcastVideoState.busy = true;
      setButtonLoadingState(actionBtn, true, {
        loadingTitle: "Regenerando retrato..."
      });
      updatePodcastPlayerUi();
      try {
        const existingPortrait = resolvePortraitForSpeaker(getActiveSession(), speaker);
        await generateSpeakerPortrait(speaker, { regenerate: Boolean(String(existingPortrait?.downloadUrl || "").trim()), silent: false });
        renderPodcastVideoShell(getActiveSession());
      } catch (error) {
        addChatMessage("system", `No se pudo regenerar retrato de ${resolveSpeakerDisplayName(speaker, getActiveSession())} (${error.message}).`);
        setGenerationStatus("Error", "");
      } finally {
        setButtonLoadingState(actionBtn, false);
        podcastVideoState.busy = false;
        updatePodcastPlayerUi();
      }
    });
  }
  if (els.speakerReferenceImageInput) {
    els.speakerReferenceImageInput.addEventListener("change", async () => {
      const speaker = String(els.speakerReferenceImageInput.dataset.speaker || "").trim();
      const file = els.speakerReferenceImageInput.files?.[0] || null;
      els.speakerReferenceImageInput.value = "";
      els.speakerReferenceImageInput.dataset.speaker = "";
      if (!speaker || !file) return;
      try {
        const reference = await readImageReferenceFromFile(file);
        setSpeakerReferenceImage(speaker, reference);
        setGenerationStatus(`Referencia actualizada para ${resolveSpeakerDisplayName(speaker, getActiveSession())}`, "is-live");
      } catch (error) {
        addChatMessage("system", `No se pudo adjuntar referencia para ${resolveSpeakerDisplayName(speaker, getActiveSession())} (${error.message}).`);
      }
    });
  }
  if (els.scenarioReferenceImageInput) {
    els.scenarioReferenceImageInput.addEventListener("change", async () => {
      const scenarioId = String(els.scenarioReferenceImageInput.dataset.scenarioId || "").trim();
      const file = els.scenarioReferenceImageInput.files?.[0] || null;
      els.scenarioReferenceImageInput.value = "";
      els.scenarioReferenceImageInput.dataset.scenarioId = "";
      if (!scenarioId || !file) return;
      try {
        const reference = await readImageReferenceFromFile(file);
        setScenarioReferenceImage(scenarioId, reference);
        setGenerationStatus("Referencia de escenario actualizada", "is-live");
      } catch (error) {
        addChatMessage("system", `No se pudo adjuntar referencia de escenario (${error.message}).`);
      }
    });
  }
  if (els.podcastPortraitViewerBackdrop) {
    els.podcastPortraitViewerBackdrop.addEventListener("click", closePodcastPortraitViewer);
  }
  if (els.dialogueVideoDirectiveModal) {
    els.dialogueVideoDirectiveModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-dialogue-video-directive-modal']");
      if (closeBtn) {
        closeDialogueVideoDirectiveModal({ confirmed: false, videoDirective: "" });
      }
    });
  }
  if (els.closeDialogueVideoDirectiveBtn) {
    els.closeDialogueVideoDirectiveBtn.addEventListener("click", () => {
      closeDialogueVideoDirectiveModal({ confirmed: false, videoDirective: "" });
    });
  }
  if (els.skipDialogueVideoDirectiveBtn) {
    els.skipDialogueVideoDirectiveBtn.addEventListener("click", () => {
      closeDialogueVideoDirectiveModal({ confirmed: true, videoDirective: "" });
    });
  }
  if (els.confirmDialogueVideoDirectiveBtn) {
    els.confirmDialogueVideoDirectiveBtn.addEventListener("click", () => {
      closeDialogueVideoDirectiveModal({
        confirmed: true,
        videoDirective: String(els.dialogueVideoDirectiveInput?.value || "").replace(/\s+/g, " ").trim()
      });
    });
  }
  if (els.podcastPortraitViewerCloseBtn) {
    els.podcastPortraitViewerCloseBtn.addEventListener("click", closePodcastPortraitViewer);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.podcastPortraitViewer && !els.podcastPortraitViewer.hidden) {
      closePodcastPortraitViewer();
      return;
    }
    if (event.key === "Escape" && els.dialogueVideoDirectiveModal && !els.dialogueVideoDirectiveModal.hidden) {
      closeDialogueVideoDirectiveModal({ confirmed: false, videoDirective: "" });
    }
  });

  els.promptInput.addEventListener("input", () => {
    autoResizePrompt();
  });

  els.chatFeed.addEventListener("click", async (event) => {
    const deleteBtn = event.target.closest("[data-action='delete-chat-message']");
    if (deleteBtn) {
      const article = deleteBtn.closest(".chat-message");
      const messageId = String(article?.dataset?.messageId || "").trim();
      if (!messageId) return;
      removeChatMessage(messageId);
      return;
    }
    const stopConnectBtn = event.target.closest("[data-action='stop-connect-script-panel']");
    if (stopConnectBtn) {
      await cancelConnectScriptPanelGeneration({ silent: false });
      return;
    }
    const connectBtn = event.target.closest("[data-action='connect-script-panel']");
    if (connectBtn) {
      const article = connectBtn.closest(".chat-message");
      const messageId = String(article?.dataset?.messageId || "").trim();
      const session = getActiveSession();
      const message = (session?.chat || []).find((item) => String(item?.id || "").trim() === messageId) || null;
      if (!message?.scriptSnapshot) return;
      const confirmed = window.confirm("Se conectará este guión al panel y se borrará la conexión activa actual. ¿Deseas continuar?");
      if (!confirmed) return;
      setButtonLoadingState(connectBtn, true, {
        loadingTitle: "Conectando guion al panel..."
      });
      setGenerationStatus("Conectando guion al panel...", "is-busy");
      stopPodcastPlayback();
      stopRowAudio();
      stopGeminiLiveSession().catch(() => {});
      backgroundDialogueAudioWarmupToken = 0;
      const connectRun = beginConnectScriptPanelGeneration(messageId);
      try {
        const activeDisfluencyDefaults = normalizeDisfluencyConfig(
          session?.disfluencyDefaults || message.disfluencyDefaultsSnapshot || DEFAULT_DISFLUENCY_CONFIG
        );
        const connectedScript = await compactScriptForPanelConnection(message.scriptSnapshot || {}, session);
        const nextScript = applyDisfluencyDefaultsToScriptRows(connectedScript, activeDisfluencyDefaults);
        const updatedSession = upsertActiveSession((current) => {
          const hosts = Array.isArray(nextScript.hosts) && nextScript.hosts.length ? nextScript.hosts : getSpeakerOptions(current);
          const maps = buildSpeakerMapsForHosts(hosts, current, {
            speakerVoiceMap: message.speakerVoiceMapSnapshot || {},
            speakerExpressionMap: message.speakerExpressionMapSnapshot || {},
            speakerNameMap: message.speakerNameMapSnapshot || {},
            speakerScenarioMap: message.speakerScenarioMapSnapshot || {}
          });
          return {
            ...current,
            script: nextScript,
            speakerVoiceMap: maps.voiceMap,
            speakerExpressionMap: maps.expressionMap,
            speakerNameMap: maps.nameMap,
            speakerScenarioMap: maps.scenarioMap,
            disfluencyDefaults: normalizeDisfluencyConfig(
              activeDisfluencyDefaults
            ),
            dialogueVideoMap: {},
            dialogueAudioMap: {}
          };
        });
        const audioResult = await generateDialogueAudioForConnectedScript(updatedSession, {
          regenerate: false,
          token: connectRun.token,
          signal: connectRun.signal
        });
        renderPodcastVideoShell(getActiveSession());
        syncPodcastStudioInspector(getActiveSession());
        if (audioResult.generated === 0) {
          throw new Error("El guión se conectó, pero no se pudo guardar audio de ninguna escena.");
        }
        if (audioResult.failed > 0) {
          setGenerationStatus(`Guion conectado. Audios generados: ${audioResult.generated}. Fallos: ${audioResult.failed}.`, "is-live");
        } else {
          setGenerationStatus(`Guion conectado. ${audioResult.generated} audios generados.`, "is-live");
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudo conectar el guion al panel (${error.message}).`);
      } finally {
        connectScriptPanelGenerationState.active = false;
        connectScriptPanelGenerationState.messageId = "";
        connectScriptPanelGenerationState.abortController = null;
        connectScriptPanelGenerationState.token = 0;
        renderChat(getActiveSession());
        setButtonLoadingState(connectBtn, false);
      }
      return;
    }
    const copyBtn = event.target.closest("[data-action='copy-chat-message']");
    if (!copyBtn) return;
    const article = copyBtn.closest(".chat-message");
    const text = String(article?.querySelector(".chat-message-body")?.textContent || "").trim();
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      copyBtn.classList.add("is-copied");
      setTimeout(() => copyBtn.classList.remove("is-copied"), 900);
    }
  });

  els.sessionList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "toggle-session-menu") {
      event.preventDefault();
      event.stopPropagation();
      const card = action.closest(".session-card");
      const menu = card?.querySelector(".session-menu");
      const willOpen = Boolean(menu?.hidden);
      closeSessionMenus();
      if (menu && willOpen) {
        menu.hidden = false;
        action.setAttribute("aria-expanded", "true");
      }
      return;
    }
    const sessionId = action.dataset.sessionId;
    if (action.dataset.action === "open-session") setActiveSession(sessionId);
    if (action.dataset.action === "rename-session") {
      event.preventDefault();
      event.stopPropagation();
      closeSessionMenus();
      renameSession(sessionId);
    }
    if (action.dataset.action === "archive-session") {
      event.preventDefault();
      event.stopPropagation();
      archiveSession(sessionId);
    }
    if (action.dataset.action === "share-session") {
      event.preventDefault();
      event.stopPropagation();
      closeSessionMenus();
      shareSessionWithUser(sessionId);
    }
    if (action.dataset.action === "delete-session") {
      event.preventDefault();
      event.stopPropagation();
      deleteSession(sessionId);
    }
  });

  els.sessionList.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-action='open-session']");
    if (!card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveSession(card.dataset.sessionId);
    }
  });

  document.addEventListener("click", (event) => {
    const floatingClose = event.target.closest("[data-action]");
    if (floatingClose?.dataset?.action === "close-music-config-modal") {
      setMusicConfigOpen(false);
      return;
    }
    if (floatingClose?.dataset?.action === "close-audio-track-mix-modal") {
      setAudioTrackMixOpen(false);
      return;
    }
    if (floatingClose?.dataset?.action === "close-global-config-modal") {
      setGlobalConfigOpen(false);
      return;
    }
    if (floatingClose?.dataset?.action === "close-script-setup-modal") {
      setScriptSetupOpen(false);
      pendingScriptPrompt = "";
      return;
    }
    if (floatingClose?.dataset?.action === "close-podcast-video-modal") {
      closePodcastVideoModal();
      return;
    }
    if (floatingClose?.dataset?.action === "close-transition-picker-modal") {
      setPodcastTransitionPickerOpen(false);
      return;
    }
    if (!event.target.closest(".session-card-menu")) {
      closeSessionMenus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (rowDisfluencyConfigOpenId) setRowDisfluencyModalOpen("");
      if (musicConfigOpen) setMusicConfigOpen(false);
      if (audioTrackMixOpen) setAudioTrackMixOpen(false);
      if (globalConfigOpen) setGlobalConfigOpen(false);
      if (scriptSetupOpen) {
        setScriptSetupOpen(false);
        pendingScriptPrompt = "";
        return;
      }
      if (podcastVideoState.transitionPickerOpen) {
        setPodcastTransitionPickerOpen(false);
        return;
      }
      if (podcastVideoState.enabled) {
        closePodcastVideoModal();
      }
    }
  });

  els.scriptTableBody.addEventListener("input", handleScriptFieldUpdate);
  els.scriptTableBody.addEventListener("change", handleScriptFieldUpdate);
  if (els.podcastStudioInspectorRowEditor) {
    els.podcastStudioInspectorRowEditor.addEventListener("input", handleScriptFieldUpdate);
    els.podcastStudioInspectorRowEditor.addEventListener("change", handleScriptFieldUpdate);
  }
  if (els.rowDisfluencyModal) {
    els.rowDisfluencyModal.addEventListener("input", handleScriptFieldUpdate);
    els.rowDisfluencyModal.addEventListener("change", handleScriptFieldUpdate);
    els.rowDisfluencyModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-row-disfluency-modal']");
      if (closeBtn) {
        setRowDisfluencyModalOpen("");
      }
    });
  }
  if (els.closeRowDisfluencyModalBtn) {
    els.closeRowDisfluencyModalBtn.addEventListener("click", () => {
      setRowDisfluencyModalOpen("");
    });
  }

  els.scriptTableBody.addEventListener("click", (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const rowId = actionBtn.dataset.rowId;
    if (actionBtn.dataset.action === "toggle-disfluency-config") {
      setRowDisfluencyModalOpen(rowDisfluencyConfigOpenId === rowId ? "" : rowId);
      return;
    }
    if (actionBtn.dataset.action === "play-row-audio") {
      playRowAudio(rowId);
      return;
    }
    if (actionBtn.dataset.action === "save-row-audio-storage") {
      setButtonLoadingState(actionBtn, true, {
        loadingTitle: "Guardando audio de escena..."
      });
      generateDialogueAudioForRow(rowId, { regenerate: true, silent: false })
        .catch((error) => {
          addChatMessage("system", `No se pudo guardar audio de la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
        })
        .finally(() => {
          setButtonLoadingState(actionBtn, false);
        });
      return;
    }
    if (actionBtn.dataset.action === "delete-row") {
      if (rowDisfluencyConfigOpenId === rowId) setRowDisfluencyModalOpen("");
      upsertActiveSession((session) => ({
        ...session,
        dialogueVideoMap: Object.fromEntries(
          Object.entries(getDialogueVideoMap(session)).filter(([key]) => key !== rowId)
        ),
        dialogueAudioMap: Object.fromEntries(
          Object.entries(getDialogueAudioMap(session)).filter(([key]) => key !== rowId)
        ),
        script: {
          ...session.script,
          rows: session.script.rows.filter((row) => row.id !== rowId)
        }
      }));
      if (String(podcastVideoState.activeRowId || "").trim() === String(rowId || "").trim()) {
        podcastVideoState.activeRowId = "";
      }
    }
    if (actionBtn.dataset.action === "duplicate-row") {
      const currentRow = getActiveSession()?.script?.rows?.find((row) => row.id === rowId);
      if (!currentRow) return;
      upsertActiveSession((session) => ({
        ...session,
        script: {
          ...session.script,
          rows: session.script.rows.flatMap((row) => (
            row.id === rowId ? [row, { ...currentRow, id: makeId("row") }] : [row]
          ))
        }
      }));
    }
  });
}

function init() {
  attachEvents();
  setupPodcastStudioInspectorResize();
  setSidepanelOpen(true);
  setMusicConfigOpen(false);
  setAudioTrackMixOpen(false);
  setGlobalConfigOpen(false);
  refreshRuntimeFeatureCapabilities().catch(() => {});
  const auth = getAuthSafe();
  if (!auth) {
    redirectToIndex();
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    const nextUid = String(user?.uid || "").trim();
    if (!nextUid) {
      redirectToIndex();
      return;
    }
    if (nextUid === currentStorageScopeUid && state.sessions.length) return;
    const prevUid = currentStorageScopeUid;
    const prevSessions = prevUid ? loadSessions(prevUid) : [];
    const nextSessions = loadSessions(nextUid);
    const localMergedSessions = prevUid && prevUid !== nextUid
      ? mergeSessionsById(nextSessions, prevSessions)
      : nextSessions;
    currentStorageScopeUid = nextUid;
    stopPanelMusic();
    panelMusicState = loadPanelMusicSettings();
    syncActivePanelMusicTrack({ kind: panelMusicState.selectedTrackKind });
    syncMusicControls();
    let finalSessions = localMergedSessions;
    try {
      const cloudSessions = await loadCloudSessions();
      finalSessions = mergeSessionsById(cloudSessions, localMergedSessions);
    } catch (error) {
      if (error?.code !== "API_UNAVAILABLE" && error?.message !== "Backend de producción no configurado.") {
        console.warn("No se pudieron cargar sesiones remotas de podcaster:", error);
      }
    }
    state.sessions = finalSessions;
    persistSessions(nextUid, finalSessions);
    state.activeSessionId = null;
    ensureSession();
    render();
  });
  window.addEventListener("beforeunload", () => {
    stopPanelMusic();
    stopPodcastPlayback();
    stopPodcastStudioMontage({ keepStatus: true });
    stopRowAudio();
    stopGeminiLiveSession().catch(() => {});
  });
  els.promptInput.value = demoPrompt;
  autoResizePrompt();
}

init();
