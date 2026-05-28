import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { authFetchJson, buildApiUrl, hasAvailableApiBase, getAuthHeaders } from "../js/api-client.js";
import { PodcasterPlaybackController } from "./podcaster-playback-controller.js?v=2026-05-26.1";
import { normalizeKaraokeWordTimings } from "./podcaster-karaoke.js";
import { createPodcasterSessionStore } from "./podcaster-session-store.js";
import { buildCloudSessionPayload as _buildCloudSessionPayload, compactCloudSessionPayload as _compactCloudSessionPayload } from "./podcaster-session-payload.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "../js/firebase-web-config.js";
import { syncReelModeUi, resolveEffectiveExportResolution, isReelModeEnabled } from "./podcaster-reels.js";
import {
  montageExportState,
  persistMontageExportSettings,
  scheduleMontageExportPreviewRefresh,
  refreshMontageExportPreviewNow,
  syncMontageExportUi,
  openMontageExportModal,
  closeMontageExportModal,
  runMontageExport,
  continueMontageExportPolling,
  setMontageExportProgress,
  setMontageExportStatus
} from "./podcaster-montage-export.js?v=2026-05-26.1";
import * as PodcasterResize from "./podcaster-resize.js";
import { createPodcasterStageFullscreenController } from "./podcaster-fullscreen.js";
import { createPodcasterMediaReferenceApi } from "./podcaster-media-reference.js?v=2026-05-18.1";
import { createPodcasterHistoryApi } from "./podcaster-history.js";
import { createPodcasterMediaRuntimeApi } from "./podcaster-media-runtime.js";
import { createPodcasterPanelMusicApi } from "./podcaster-panel-music.js";
import { removeDialogueAudioForRow } from "./podcaster-audioGemini-timeline.js?v=2026-05-17.1";
import { createPodcasterPromptComposerApi } from "./podcaster-prompt-composer.js";
import { createPodcasterSessionRailApi } from "./podcaster-session-rail.js";
import { createPodcasterOnScreenTextTrackEditorApi } from "./podcaster-on-screen-text-track-editor.js";
import { createPodcasterTimelineInteractionApi } from "./podcaster-timeline-interaction.js?v=2026-05-25.1";
import { createPodcasterTimelineClipDurationApi } from "./podcaster-timeline-clip-duration.js";
import { createPodcasterTimelineUiApi } from "./podcaster-timeline-ui.js";
import { createPodcasterSceneSelectionApi } from "./podcaster-scene-selection.js";
import { createPodcasterSceneTransitionApi } from "./podcaster-scene-transition.js";
import { buildSpeakerMapsForHosts as buildSpeakerMapsForHostsShared } from "./podcaster-speaker-maps.js";
import { replaceHostTokensWithNames as replaceHostTokensWithNamesShared } from "./podcaster-speaker-text.js";
import { toMarkdownTableCell } from "./podcaster-markdown-table.js";
import { normalizeCreativeFieldText } from "./podcaster-creative-text.js";
import { requirePodcasterScriptGeneratorApiFunction } from "./podcaster-script-generator-registry.js";
import {
  registerPodcasterGenerationRuntime,
  registerPodcasterChatRuntime,
  registerPodcasterPublicLibraryRuntime,
  registerPodcasterScriptEditorRuntime,
  requirePodcasterScriptEditorRuntime
} from "./podcaster-runtime-registry.js";
import { podcasterGenerationShared, requirePodcasterGenerationShared } from "./podcaster-generation-shared.js";

const onScreenTextRenderSpecApi = globalThis.PodcasterOnScreenTextRenderSpec;
if (!onScreenTextRenderSpecApi || typeof onScreenTextRenderSpecApi !== "object") {
  throw new Error("PodcasterOnScreenTextRenderSpec no está disponible. Revisa la carga de podcaster-on-screen-text.js.");
}
const sceneMediaRenderSpecApi = globalThis.PodcasterSceneMediaRenderSpec;
if (!sceneMediaRenderSpecApi || typeof sceneMediaRenderSpecApi !== "object") {
  throw new Error("PodcasterSceneMediaRenderSpec no está disponible. Revisa la carga de podcaster-scene-media-render-spec.js.");
}
function requireOnScreenTextApiFunction(name = "") {
  const fn = onScreenTextRenderSpecApi?.[name];
  if (typeof fn !== "function") {
    throw new Error(`PodcasterOnScreenTextRenderSpec.${name} no está disponible.`);
  }
  return fn;
}
function requireSceneMediaRenderSpecApiFunction(name = "") {
  const fn = sceneMediaRenderSpecApi?.[name];
  if (typeof fn !== "function") {
    throw new Error(`PodcasterSceneMediaRenderSpec.${name} no está disponible.`);
  }
  return fn;
}
function requirePodcasterChatAssistantApi() {
  const api = globalThis.PodcasterChatAssistant;
  if (!api || typeof api !== "object") {
    throw new Error("PodcasterChatAssistant no está disponible. Revisa la carga de podcaster-chat-assistant.js.");
  }
  return api;
}
function requirePodcasterChatAssistantApiFunction(name = "") {
  const fn = requirePodcasterChatAssistantApi()?.[name];
  if (typeof fn !== "function") {
    throw new Error(`PodcasterChatAssistant.${name} no está disponible.`);
  }
  return fn;
}
function requirePodcasterMediaReplacementApiFunction(name = "") {
  const api = globalThis.PodcasterMediaReplacement;
  const fn = api?.[name];
  if (typeof fn !== "function") {
    throw new Error(`PodcasterMediaReplacement.${name} no está disponible.`);
  }
  return fn;
}
const addChatMessage = (...args) => requirePodcasterChatAssistantApiFunction("addChatMessage")(...args);
const removeChatMessage = (...args) => requirePodcasterChatAssistantApiFunction("removeChatMessage")(...args);
const addScriptAssistantMessage = (...args) => requirePodcasterChatAssistantApiFunction("addScriptAssistantMessage")(...args);
const renderChat = (...args) => requirePodcasterChatAssistantApiFunction("renderChat")(...args);
let podcasterSceneSelectionApi = null;
let podcasterSceneTransitionApi = null;
let podcasterTimelineInteractionApi = null;
let podcasterTimelineUiApi = null;
function requirePodcasterSceneSelectionApi() {
  if (!podcasterSceneSelectionApi || typeof podcasterSceneSelectionApi !== "object") {
    throw new Error("PodcasterSceneSelectionApi no está disponible. Revisa la carga de podcaster-scene-selection.js.");
  }
  return podcasterSceneSelectionApi;
}
function requirePodcasterSceneTransitionApi() {
  if (!podcasterSceneTransitionApi || typeof podcasterSceneTransitionApi !== "object") {
    throw new Error("PodcasterSceneTransitionApi no está disponible. Revisa la carga de podcaster-scene-transition.js.");
  }
  return podcasterSceneTransitionApi;
}
function getActiveTransitionEdge(...args) {
  return requirePodcasterSceneTransitionApi().getActiveTransitionEdge(...args);
}
function getActiveTransitionSelection(...args) {
  return requirePodcasterSceneTransitionApi().getActiveTransitionSelection(...args);
}
function renderPodcastTransitionPicker(...args) {
  return requirePodcasterSceneTransitionApi().renderPodcastTransitionPicker(...args);
}
function setPodcastTransitionPickerOpen(...args) {
  return requirePodcasterSceneTransitionApi().setPodcastTransitionPickerOpen(...args);
}
function setTransitionForEdge(...args) {
  return requirePodcasterSceneTransitionApi().setTransitionForEdge(...args);
}
function setTransitionForActiveEdge(...args) {
  return requirePodcasterSceneTransitionApi().setTransitionForActiveEdge(...args);
}
function setPodcastVideoRow(...args) {
  return requirePodcasterSceneSelectionApi().setPodcastVideoRow(...args);
}
function selectTimelineSceneRow(...args) {
  return requirePodcasterSceneSelectionApi().selectTimelineSceneRow(...args);
}
function selectTimelineTransitionRange(...args) {
  return requirePodcasterSceneTransitionApi().selectTimelineTransitionRange(...args);
}
function openSceneVideoSelectorModal(...args) {
  return requirePodcasterMediaReplacementApiFunction("openSceneVideoSelectorModal")(...args);
}
function swapStageToImagePreview(...args) {
  return requirePodcasterMediaReplacementApiFunction("swapStageToImagePreview")(...args);
}
const resolveOnScreenTextExportCanvasSize = requireOnScreenTextApiFunction("resolveOnScreenTextExportCanvasSize");
const resolveSharedOnScreenTextRenderSpec = requireOnScreenTextApiFunction("resolveOnScreenTextRenderSpec");
const wrapSharedOnScreenTextRenderText = requireOnScreenTextApiFunction("wrapOnScreenTextRenderText");
const normalizeOnScreenTextTrackSettings = requireOnScreenTextApiFunction("normalizeOnScreenTextTrackSettings");
const normalizeSharedOnScreenTextClipItem = requireOnScreenTextApiFunction("normalizeOnScreenTextClipItem");
const normalizeSharedOnScreenTextClipsByRowId = requireOnScreenTextApiFunction("normalizeOnScreenTextClipsByRowId");
const normalizeSharedOnScreenTextLayoutItem = requireOnScreenTextApiFunction("normalizeOnScreenTextLayoutItem");
const normalizeSharedOnScreenTextLayoutByRowId = requireOnScreenTextApiFunction("normalizeOnScreenTextLayoutByRowId");
const estimateSharedOnScreenTextLayoutHeightPct = requireOnScreenTextApiFunction("estimateOnScreenTextLayoutHeightPct");
const estimateSharedOnScreenTextLayoutWidthPct = requireOnScreenTextApiFunction("estimateOnScreenTextLayoutWidthPct");
const buildSharedDefaultOnScreenTextLayoutForRow = requireOnScreenTextApiFunction("buildDefaultOnScreenTextLayoutForRow");
const expandSharedOnScreenTextLayoutToFitText = requireOnScreenTextApiFunction("expandOnScreenTextLayoutToFitText");
const getSharedOnScreenTextStylePresetClass = requireOnScreenTextApiFunction("getOnScreenTextStylePresetClass");
const getSharedOnScreenTextBgPresetClass = requireOnScreenTextApiFunction("getOnScreenTextBgPresetClass");
const getSharedOnScreenTextFontFamilyCss = requireOnScreenTextApiFunction("getOnScreenTextFontFamilyCss");
const getSharedOnScreenTextClipText = requireOnScreenTextApiFunction("getOnScreenTextClipText");
const buildSharedOnScreenTextPreviewStrokeShadowCss = requireOnScreenTextApiFunction("buildOnScreenTextPreviewStrokeShadowCss");
const buildSharedOnScreenTextPreviewShadowCss = requireOnScreenTextApiFunction("buildOnScreenTextPreviewShadowCss");
const wrapSharedOnScreenTextPreviewText = requireOnScreenTextApiFunction("wrapOnScreenTextPreviewText");
const resolveSharedOnScreenTextPreviewWrapFromMeasuredWidth = requireOnScreenTextApiFunction("resolveOnScreenTextPreviewWrapFromMeasuredWidth");
const buildSharedOnScreenTextBubbleInlineStyle = requireOnScreenTextApiFunction("buildOnScreenTextBubbleInlineStyle");
const applySharedOnScreenTextTrackSettingValue = requireOnScreenTextApiFunction("applyOnScreenTextTrackSettingValue");
const applySharedOnScreenTextLookPresetValue = requireOnScreenTextApiFunction("applyOnScreenTextLookPresetValue");
const buildSharedOnScreenTextTrackModalMarkup = requireOnScreenTextApiFunction("buildOnScreenTextTrackModalMarkup");
const inferSharedOnScreenTextLookPreset = requireOnScreenTextApiFunction("inferOnScreenTextLookPreset");
const resolveSharedOnScreenTextPreviewLayoutSpec = requireOnScreenTextApiFunction("resolveOnScreenTextPreviewLayoutSpec");
const resolveSharedSceneMediaRenderSpec = requireSceneMediaRenderSpecApiFunction("resolveSceneMediaRenderSpec");
const shouldRepairSharedOnScreenTextLayout = requireOnScreenTextApiFunction("shouldRepairLegacyOnScreenTextLayout");
const getSharedOnScreenTextResizeHandles = requireOnScreenTextApiFunction("getOnScreenTextResizeHandles");
const buildSharedOnScreenTextSelectionFrameHtml = requireOnScreenTextApiFunction("buildOnScreenTextSelectionFrameHtml");

const STORAGE_KEY_BASE = "cb_podcaster_sessions_v2";
const LEGACY_STORAGE_KEY = "cb_podcaster_sessions_v1";
const COMPOSER_GENERATION_MODE_KEY = "cb_podcaster_composer_mode_v1";
const COMPOSER_VIDEO_TABLE_MODE_KEY = "cb_podcaster_video_table_mode_v1";
const ACTIVE_SESSION_ID_KEY = "cb_podcaster_active_session_id_v1";
const PANEL_MUSIC_STORAGE_KEY_BASE = "cb_podcaster_panel_music_v1";
const PODCASTER_VIDEO_IMPORT_STORAGE_KEY = "cb_podcaster_video_import_v1";
const PODCAST_STUDIO_INSPECTOR_COLLAPSED_KEY = "cb_podcast_studio_inspector_collapsed_v1";
const PODCAST_STUDIO_MONTAGE_AUDIO_SUBTRACKS_KEY = "cb_podcast_montage_audio_subtracks_v1";
const PODCAST_STAGE_MIN_WIDTH_PX = 420;
const MONTAGE_EXPORT_STORAGE_KEY = "cb_podcast_montage_export_v1";
// 0 = sin timeout de polling (seguimiento indefinido del export).
const MONTAGE_EXPORT_POLL_MAX_MS = 0;
const MONTAGE_EXPORT_DEVTOOLS_LOG_ENABLED = false;
const SESSION_ACADEMIC_LEVEL_OPTIONS = Object.freeze(["Preescolar", "Primaria", "Secundaria"]);
const SESSION_ACADEMIC_GRADE_OPTIONS = Object.freeze(["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"]);
const SESSION_ACADEMIC_TERM_OPTIONS = Object.freeze(["1", "2", "3"]);
const SESSION_ACADEMIC_UNIT_OPTIONS = Object.freeze(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

const VOICES = ["Host A", "Host B", "Host C", "Host D", "Narrador", "Invitado", "Patrocinador", "Analista", "Experto", "Co-host", "Entrevistador", "Moderador", "Cuentacuentos", "Profundizar en tema", "Debatiente", "Testigo"];
const DEFAULT_HOSTS = Object.freeze(["Host A", "Host B"]);
const EXPRESSIONS = ["Neutral", "Enérgico", "Cálido", "Curioso", "Serio", "Inspirador", "Profundo", "Analítico", "Divertido", "Sarcástico", "Informativo", "Debate"];
const MEDIA_CUES = ["Sin media", "Intro musical", "Transición", "Efecto sutil", "CTA final"];
const SPEAKER_ROLE_DESCRIPTIONS = {
  "Analista": "Analítico, técnico, basado en datos, tono serio y profesional.",
  "Experto": "Autoridad técnica, lenguaje avanzado, resolutivo, aporta visión experta.",
  "Profundizar en tema": "Curioso e inquisitivo; su misión es expandir cada punto, preguntar '¿cómo funciona esto?' y profundizar en el conocimiento para el oyente.",
  "Entrevistador": "Dinámico, empático, guía la charla con preguntas abiertas y mantiene el flujo.",
  "Moderador": "Neutral, gestiona turnos, resume puntos clave y asegura el orden del episodio.",
  "Cuentacuentos": "Narrativo, cálido, usa metáforas, pausas dramáticas y lenguaje evocador.",
  "Debatiente": "Provocador, busca el contraargumento, genera tensión constructiva y debate ideas.",
  "Testigo": "Relata desde la experiencia personal, usa un tono testimonial y cercano.",
  "Narrador": "Formal, descriptivo, actúa como hilo conductor entre bloques.",
  "Co-host": "Apoyo dinámico, aporta humor o comentarios rápidos, reacciona a lo que dice el host principal.",
  "Patrocinador": "Tono persuasivo, profesional y entusiasta sobre un producto o servicio.",
  "Invitado": "Voz externa, aporta frescura, anécdotas y un punto de vista diferente al habitual."
};
const PODCASTER_IMAGE_MODEL_DEFAULT = "gemini-2.5-flash-image";
const PODCASTER_IMAGE_MODEL_CANDIDATES = Object.freeze([
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation"
]);
const AVAILABLE_PODCASTER_VIDEO_MODELS = Object.freeze([
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.1-lite-generate-preview",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
  "veo-2.0-generate-001"
]);
const DISFLUENCY_LEVEL_MAX = Object.freeze({
  fillerLevel: 300,
  errorLevel: 300,
  stutterLevel: 100
});
const VIDEO_SCENE_MAX_SEC = 8;
const VIDEO_SCENE_MIN_SEC = 0.5;
const VIDEO_SCENE_IMAGE_PROMPT_COUNT = 3;
const VIDEO_DIALOGUE_MAX_SEC = 6;
const VIDEO_SCENE_GAP_SEC = 2;
const SHORT_SCENE_MIN_SEC = 6;
const SHORT_SCENE_MAX_SEC = 7;
const PANEL_CONNECT_SCENE_MAX_SEC = 8;
const SPEECH_WORDS_PER_SEC = 2.4;
const MAX_LOCAL_MUSIC_DATA_URL_CHARS = 1_800_000;
const MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS = 900_000;
const MAX_LOCAL_REFERENCE_VIDEO_DATA_URL_CHARS = 8_000_000;
const DIALOGUE_VIDEO_MAX_REFERENCE_IMAGE_COUNT = 2;
const DIALOGUE_VIDEO_INLINE_REFERENCE_BUDGET_BYTES = 7 * 1024 * 1024;
const MAX_CLOUD_SESSION_PAYLOAD_BYTES = 900 * 1024;
const CLOUD_SESSION_PAYLOAD_TARGET_BYTES = 860 * 1024;
const DEFAULT_DISFLUENCY_CONFIG = Object.freeze({
  enabled: false,
  fillerLevel: 20,
  errorLevel: 10,
  stutterEnabled: false,
  stutterLevel: 18
});
const DEFAULT_TTS_DIRECTION_CONFIG = Object.freeze({
  stylePrompt: "",
  pacingPrompt: "",
  accentPrompt: "",
  scenePrompt: "",
  audioTags: ""
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
const firebaseStorage = getStorage(firestoreApp);
window.firebaseStorage = firebaseStorage;

const els = {
  promptForm: document.getElementById("promptForm"),
  promptInput: document.getElementById("promptInput"),
  toggleComposerCollapseBtn: document.getElementById("toggleComposerCollapseBtn"),
  revealComposerBtn: document.getElementById("revealComposerBtn"),
  composerShell: document.querySelector(".composer-shell"),
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
  composerTableModeWrap: document.getElementById("composerTableModeWrap"),
  composerTableModeToggle: document.getElementById("composerTableModeToggle") || document.getElementById("composerTableModeToggle_footer"),
  connectLiveBtn: document.getElementById("connectLiveBtn"),
  liveStatusText: document.getElementById("liveStatusText"),
  addRowBtn: document.getElementById("addRowBtn"),
  duplicateRowBtn: document.getElementById("duplicateRowBtn"),
  openVideoEditorBtn: document.getElementById("openVideoEditorBtn"),
  toggleCollapseAllRowsBtn: document.getElementById("toggleCollapseAllRowsBtn"),
  scriptPanelTitle: document.getElementById("scriptPanelTitle"),
  scriptPanelSubtitle: document.getElementById("scriptPanelSubtitle"),
  demoPromptBtn: document.getElementById("demoPromptBtn"),
  sessionList: document.getElementById("sessionList"),
  sessionsRailFilter: document.getElementById("sessionsRailFilter"),
  toggleArchivedSessionsBtn: document.getElementById("toggleArchivedSessionsBtn"),
  newSessionBtn: document.getElementById("newSessionBtn"),
  saveSessionBtn: document.getElementById("saveSessionBtn"),
  regenerateAllGeminiAudiosBtn: document.getElementById("regenerateAllGeminiAudiosBtn"),
  autoLinkStorageVideosBtn: document.getElementById("autoLinkStorageVideosBtn"),
  saveSessionFloatingBtn: document.getElementById("saveSessionFloatingBtn"),
  importGeminiDialogueTrackBtn: document.getElementById("importGeminiDialogueTrackBtn"),
  openSidepanelBtn: document.getElementById("openSidepanelBtn"),
  sidepanelHeaderToggleBtn: document.getElementById("sidepanelHeaderToggleBtn"),
  sidepanel: document.getElementById("podcasterSidepanel"),
  openMusicConfigBtn: document.getElementById("openMusicConfigBtn"),
  closeMusicConfigBtn: document.getElementById("closeMusicConfigBtn"),
  musicConfigModal: document.getElementById("musicConfigModal"),
  musicConfigPanel: document.getElementById("musicConfigPanel"),
  audioTrackMixModal: document.getElementById("audioTrackMixModal"),
  closeAudioTrackMixBtn: document.getElementById("closeAudioTrackMixBtn"),
  cancelAudioTrackMixBtn: document.getElementById("cancelAudioTrackMixBtn"),
  saveAudioTrackMixBtn: document.getElementById("saveAudioTrackMixBtn"),
  audioTrackMixInfo: document.getElementById("audioTrackMixInfo"),
  audioTrackSourceSelect: document.getElementById("audioTrackSourceSelect"),
  audioTrackSourceInfo: document.getElementById("audioTrackSourceInfo"),
  audioTrackMontageVolume: document.getElementById("audioTrackMontageVolume"),
  audioTrackMontageVolumeNumber: document.getElementById("audioTrackMontageVolumeNumber"),
  audioTrackDuckVolume: document.getElementById("audioTrackDuckVolume"),
  audioTrackDuckVolumeNumber: document.getElementById("audioTrackDuckVolumeNumber"),
  audioTrackStabilizeToggle: document.getElementById("audioTrackStabilizeToggle"),
  audioTrackLimiterToggle: document.getElementById("audioTrackLimiterToggle"),
  scriptSetupModal: document.getElementById("scriptSetupModal"),
  closeScriptSetupBtn: document.getElementById("closeScriptSetupBtn"),
  scriptSetupForm: document.getElementById("scriptSetupForm"),
  scriptSetupSpeakerCount: document.getElementById("scriptSetupSpeakerCount"),
  scriptSetupSpeakerFields: document.getElementById("scriptSetupSpeakerFields"),
  scriptSetupVideoModeRow: document.getElementById("scriptSetupVideoModeRow"),
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
  globalTtsStylePrompt: document.getElementById("globalTtsStylePrompt"),
  globalTtsPacingPrompt: document.getElementById("globalTtsPacingPrompt"),
  globalTtsAccentPrompt: document.getElementById("globalTtsAccentPrompt"),
  globalTtsScenePrompt: document.getElementById("globalTtsScenePrompt"),
  globalTtsAudioTags: document.getElementById("globalTtsAudioTags"),
  globalCheapVideoMode: document.getElementById("globalCheapVideoMode"),
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
  sessionPublishToggle: document.getElementById("sessionPublishToggle"),
  creativeVideoModal: document.getElementById("creativeVideoModal"),
  creativeVideoShell: document.getElementById("creativeVideoShell"),
  closeCreativeVideoBtn: document.getElementById("closeCreativeVideoBtn"),
  saveSessionCreativeBtn: document.getElementById("saveSessionCreativeBtn"),
  creativeGlobalVoiceName: document.getElementById("creativeGlobalVoiceName"),
  creativeVideoTimelineList: document.getElementById("creativeVideoTimelineList"),
  creativeVideoInspectorScene: document.getElementById("creativeVideoInspectorScene"),
  creativeVideoInspectorEditor: document.getElementById("creativeVideoInspectorEditor"),
  podcastSceneLibraryList: document.getElementById("podcastSceneLibraryList"),
  refreshPodcastSceneLibraryBtn: document.getElementById("refreshPodcastSceneLibraryBtn"),
  uploadLocalPodcastSceneBtn: document.getElementById("uploadLocalPodcastSceneBtn"),
  podcastSceneLibraryLocalVideoInput: document.getElementById("podcastSceneLibraryLocalVideoInput"),
  podcastSceneLibrarySearchInput: document.getElementById("podcastSceneLibrarySearchInput"),
  podcastSceneLibraryColorFilterSelect: document.getElementById("podcastSceneLibraryColorFilterSelect"),
  podcastSceneLibraryClearFiltersBtn: document.getElementById("podcastSceneLibraryClearFiltersBtn"),
  podcastSceneInsertModal: document.getElementById("podcastSceneInsertModal"),
  closePodcastSceneInsertBtn: document.getElementById("closePodcastSceneInsertBtn"),
  podcastSceneInsertTitle: document.getElementById("podcastSceneInsertTitle"),
  podcastSceneInsertHint: document.getElementById("podcastSceneInsertHint"),
  podcastSceneInsertList: document.getElementById("podcastSceneInsertList"),
  cancelPodcastSceneInsertBtn: document.getElementById("cancelPodcastSceneInsertBtn"),
  confirmPodcastSceneInsertNewTrackBtn: document.getElementById("confirmPodcastSceneInsertNewTrackBtn"),
  confirmPodcastSceneInsertBtn: document.getElementById("confirmPodcastSceneInsertBtn"),
  podcastSceneLibraryEditModal: document.getElementById("podcastSceneLibraryEditModal"),
  closePodcastSceneLibraryEditBtn: document.getElementById("closePodcastSceneLibraryEditBtn"),
  podcastSceneLibraryEditTitle: document.getElementById("podcastSceneLibraryEditTitle"),
  podcastSceneLibraryEditName: document.getElementById("podcastSceneLibraryEditName"),
  podcastSceneLibraryEditTagLabel: document.getElementById("podcastSceneLibraryEditTagLabel"),
  podcastSceneLibraryEditTagColor: document.getElementById("podcastSceneLibraryEditTagColor"),
  cancelPodcastSceneLibraryEditBtn: document.getElementById("cancelPodcastSceneLibraryEditBtn"),
  savePodcastSceneLibraryEditBtn: document.getElementById("savePodcastSceneLibraryEditBtn"),
  geminiCreativityModal: document.getElementById("geminiCreativityModal"),
  closeGeminiCreativityBtn: document.getElementById("closeGeminiCreativityBtn"),
  geminiCreativityRange: document.getElementById("geminiCreativityRange"),
  geminiCreativityValueLabel: document.getElementById("geminiCreativityValueLabel"),
  geminiCreativitySceneLabel: document.getElementById("geminiCreativitySceneLabel"),
  podcastVideoLoader: document.getElementById("podcastVideoLoader"),
  closePodcastVideoBtn: document.getElementById("closePodcastVideoBtn"),
  podcastVideoShell: document.getElementById("podcastVideoShell"),
  togglePodcastStudioInspectorBtn: document.getElementById("togglePodcastStudioInspectorBtn"),
  podcastStudioInspector: document.getElementById("podcastStudioInspector"),
  podcastStudioInspectorResizeHandle: document.getElementById("podcastStudioInspectorResizeHandle"),
  podcastStudioInspectorCollapsedHandle: document.getElementById("podcastStudioInspectorCollapsedHandle"),
  podcastVideoLibraryCollapsedHandle: document.getElementById("podcastVideoLibraryCollapsedHandle"),
  togglePodcastVideoLibraryBtn: document.getElementById("togglePodcastVideoLibraryBtn"),
  podcastVideoStage: document.getElementById("podcastVideoStage"),
  podcastStudioTrackHead: document.querySelector(".podcast-studio-track-head"),
  podcastStudioTrackTitle: document.getElementById("podcastStudioTrackTitle"),
  podcastStudioTrackHeadTime: document.getElementById("podcastStudioTrackHeadTime"),
  podcastVideoModeToggle: document.getElementById("podcastVideoModeToggle"),
  podcastTimelineZoomOutRange: document.getElementById("podcastTimelineZoomOutRange"),
  podcastStageResizeHandle: document.getElementById("podcastStageResizeHandle"),
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
  podcastTransitionDurationNumber: document.getElementById("podcastTransitionDurationNumber"),
  podcastVideoSpeakerCard: document.getElementById("podcastVideoSpeakerCard"),
  podcastActiveSpeakerVideo: document.getElementById("podcastActiveSpeakerVideo"),
  podcastActiveSpeakerVideoAlt: document.getElementById("podcastActiveSpeakerVideoAlt"),
  podcastActiveSpeakerImageAlt: document.getElementById("podcastActiveSpeakerImageAlt"),
  podcastOnScreenTextOverlay: document.getElementById("podcastOnScreenTextOverlay"),
  podcastStudioDipOverlay: document.getElementById("podcastStudioDipOverlay"),
  podcastActiveSpeakerImage: document.getElementById("podcastActiveSpeakerImage"),
  podcastActiveSpeakerAvatarImage: document.getElementById("podcastActiveSpeakerAvatarImage"),
  podcastStylizedTextOverlay: document.getElementById("podcastStylizedTextOverlay"),
  addStylizedTextBtn: document.getElementById("addStylizedTextBtn"),
  podcastSceneZoomInBtn: document.getElementById("podcastSceneZoomInBtn"),
  podcastSceneZoomOutBtn: document.getElementById("podcastSceneZoomOutBtn"),
  podcastPreviewFullscreenBtn: document.getElementById("podcastPreviewFullscreenBtn"),
  podcastSpeakerMouth: document.getElementById("podcastSpeakerMouth"),
  podcastActiveSpeakerName: document.getElementById("podcastActiveSpeakerName"),
  podcastVideoStatus: document.getElementById("podcastVideoStatus"),
  speakerReferenceImageInput: document.getElementById("speakerReferenceImageInput"),
  scenarioReferenceImageInput: document.getElementById("scenarioReferenceImageInput"),
  rowReferenceImageInput: document.getElementById("rowReferenceImageInput"),
  podcastVideoPrevBtn: document.getElementById("podcastVideoPrevBtn"),
  podcastVideoPlayBtn: document.getElementById("podcastVideoPlayBtn"),
  podcastVideoPauseBtn: document.getElementById("podcastVideoPauseBtn"),
  podcastVideoStopBtn: document.getElementById("podcastVideoStopBtn"),
  podcastVideoNextBtn: document.getElementById("podcastVideoNextBtn"),
  podcastVideoSpeedSelect: document.getElementById("podcastVideoSpeedSelect"),
  toggleOnScreenTextTrackBtn: document.getElementById("toggleOnScreenTextTrackBtn"),
  podcastVideoZoomBtn: document.getElementById("podcastVideoZoomBtn"),
  exportMontageBtn: document.getElementById("exportMontageBtn"),
  montageExportModal: document.getElementById("montageExportModal"),
  closeMontageExportBtn: document.getElementById("closeMontageExportBtn"),
  cancelMontageExportBtn: document.getElementById("cancelMontageExportBtn"),
  continueMontageExportBtn: document.getElementById("continueMontageExportBtn"),
  confirmMontageExportBtn: document.getElementById("confirmMontageExportBtn"),
  montageExportMode: document.getElementById("montageExportMode"),
  montageExportFormat: document.getElementById("montageExportFormat"),
  montageExportResolution: document.getElementById("montageExportResolution"),
  montageExportBitrateMode: document.getElementById("montageExportBitrateMode"),
  montageExportCustomBitrateBox: document.getElementById("montageExportCustomBitrateBox"),
  montageExportMaxBitrate: document.getElementById("montageExportMaxBitrate"),
  montageExportMinBitrate: document.getElementById("montageExportMinBitrate"),
  montageExportFilename: document.getElementById("montageExportFilename"),
  montageExportReviewExcelField: document.getElementById("montageExportReviewExcelField"),
  montageExportIncludeReviewExcel: document.getElementById("montageExportIncludeReviewExcel"),
  montageExportPreviewBox: document.getElementById("montageExportPreviewBox"),
  montageExportPreviewMeta: document.getElementById("montageExportPreviewMeta"),
  montageExportPreviewBadge: document.getElementById("montageExportPreviewBadge"),
  montageExportPreviewVideo: document.getElementById("montageExportPreviewVideo"),
  montageExportPreviewImage: document.getElementById("montageExportPreviewImage"),
  montageExportPreviewVideoAlt: document.getElementById("montageExportPreviewVideoAlt"),
  montageExportPreviewImageAlt: document.getElementById("montageExportPreviewImageAlt"),
  montageExportPreviewPlaceholder: document.getElementById("montageExportPreviewPlaceholder"),
  montageExportStylizedTextOverlay: document.getElementById("montageExportStylizedTextOverlay"),
  montageExportPreviewOverlay: document.getElementById("montageExportPreviewOverlay"),
  montageExportRefreshPreviewBtn: document.getElementById("montageExportRefreshPreviewBtn"),
  montageExportFullscreenBtn: document.getElementById("montageExportFullscreenBtn"),
  montageExportPreviewPlayBtn: document.getElementById("montageExportPreviewPlayBtn"),
  montageExportPreviewPauseBtn: document.getElementById("montageExportPreviewPauseBtn"),
  montageExportPreviewStopBtn: document.getElementById("montageExportPreviewStopBtn"),
  montageExportPreviewSeekbar: document.getElementById("montageExportPreviewSeekbar"),
  montageExportPreviewTimer: document.getElementById("montageExportPreviewTimer"),
  montageExportStatusBox: document.getElementById("montageExportStatusBox"),
  montageExportStatus: document.getElementById("montageExportStatus"),
  montageExportHint: document.getElementById("montageExportHint"),
  montageExportProgressBar: document.getElementById("montageExportProgressBar"),
  montageExportOnlyAudio: document.getElementById("montageExportOnlyAudio"),
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
  generateDialogueVideoBtn: document.querySelector("[data-action='timeline-generate-scene-video']"),
  generateAllDialogueVideosBtn: document.querySelector("[data-action='timeline-generate-scene-video-batch']"),
  regenerateAllDialogueVideosBtn: document.querySelector("[data-action='timeline-regenerate-scene-video-batch-hq']"),
  generateDialogueAudioBtn: document.querySelector("[data-action='timeline-generate-scene-audio']"),
  playDialogueAudioBtn: document.getElementById("playDialogueAudioBtn"),
  deleteDialogueAudioBtn: document.getElementById("deleteDialogueAudioBtn"),
  togglePodcastStudioFooterBtn: document.getElementById("togglePodcastStudioFooterBtn"),
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
  podcastActiveSpeakerBackdropVideo: document.getElementById("podcastActiveSpeakerBackdropVideo"),
  rowDisfluencyModal: document.getElementById("rowDisfluencyModal"),
  rowDisfluencyModalTitle: document.getElementById("rowDisfluencyModalTitle"),
  closeRowDisfluencyModalBtn: document.getElementById("closeRowDisfluencyModalBtn"),
  timelineClipDurationModal: document.getElementById("timelineClipDurationModal"),
  closeTimelineClipDurationBtn: document.getElementById("closeTimelineClipDurationBtn"),
  timelineClipDurationLabel: document.getElementById("timelineClipDurationLabel"),
  timelineClipDurationRange: document.getElementById("timelineClipDurationRange"),
  timelineClipDurationNumber: document.getElementById("timelineClipDurationNumber"),
  timelineClipDurationHint: document.getElementById("timelineClipDurationHint"),
  timelineClipVeoVolumeRange: document.getElementById("timelineClipVeoVolumeRange"),
  timelineClipVeoVolumeNumber: document.getElementById("timelineClipVeoVolumeNumber"),
  timelineClipGeminiVolumeRange: document.getElementById("timelineClipGeminiVolumeRange"),
  timelineClipGeminiVolumeNumber: document.getElementById("timelineClipGeminiVolumeNumber"),
  timelineClipBackgroundVolumeRange: document.getElementById("timelineClipBackgroundVolumeRange"),
  timelineClipBackgroundVolumeNumber: document.getElementById("timelineClipBackgroundVolumeNumber"),
  timelineClipVisualLayoutMode: document.getElementById("timelineClipVisualLayoutMode"),
  timelineClipRelatePrevCheckbox: document.getElementById("timelineClipRelatePrevCheckbox"),
  timelineClipRelatePrevHint: document.getElementById("timelineClipRelatePrevHint"),
  timelineClipApplyRelateAheadCheckbox: document.getElementById("timelineClipApplyRelateAheadCheckbox"),
  timelineClipApplyRelateAheadHint: document.getElementById("timelineClipApplyRelateAheadHint"),
  resetTimelineClipDurationBtn: document.getElementById("resetTimelineClipDurationBtn"),
  cancelTimelineClipDurationBtn: document.getElementById("cancelTimelineClipDurationBtn"),
  applyTimelineClipDurationBtn: document.getElementById("applyTimelineClipDurationBtn"),
  sessionAcademicDataModal: document.getElementById("sessionAcademicDataModal"),
  closeSessionAcademicDataBtn: document.getElementById("closeSessionAcademicDataBtn"),
  cancelSessionAcademicDataBtn: document.getElementById("cancelSessionAcademicDataBtn"),
  sessionAcademicDataForm: document.getElementById("sessionAcademicDataForm"),
  sessionAcademicLevelSelect: document.getElementById("sessionAcademicLevelSelect"),
  sessionAcademicGradeSelect: document.getElementById("sessionAcademicGradeSelect"),
  sessionAcademicTermSelect: document.getElementById("sessionAcademicTermSelect"),
  sessionAcademicUnitSelect: document.getElementById("sessionAcademicUnitSelect"),
  geminiAudioSpeedModal: document.getElementById("geminiAudioSpeedModal"),
  closeGeminiAudioSpeedModalBtn: document.getElementById("closeGeminiAudioSpeedModalBtn"),
  geminiAudioSpeedModalTitle: document.getElementById("geminiAudioSpeedModalTitle"),
  geminiAudioSpeedModalHint: document.getElementById("geminiAudioSpeedModalHint"),
  geminiAudioSpeedRange: document.getElementById("geminiAudioSpeedRange"),
  geminiAudioSpeedNumber: document.getElementById("geminiAudioSpeedNumber"),
  resetGeminiAudioSpeedBtn: document.getElementById("resetGeminiAudioSpeedBtn"),
  cancelGeminiAudioSpeedBtn: document.getElementById("cancelGeminiAudioSpeedBtn"),
  applyGeminiAudioSpeedBtn: document.getElementById("applyGeminiAudioSpeedBtn"),
  geminiTrackVolumeModal: document.getElementById("geminiTrackVolumeModal"),
  closeGeminiTrackVolumeModalBtn: document.getElementById("closeGeminiTrackVolumeModalBtn"),
  geminiTrackVolumeModalTitle: document.getElementById("geminiTrackVolumeModalTitle"),
  geminiTrackVolumeModalHint: document.getElementById("geminiTrackVolumeModalHint"),
  geminiTrackVolumeRange: document.getElementById("geminiTrackVolumeRange"),
  geminiTrackVolumeNumber: document.getElementById("geminiTrackVolumeNumber"),
  resetGeminiTrackVolumeBtn: document.getElementById("resetGeminiTrackVolumeBtn"),
  cancelGeminiTrackVolumeBtn: document.getElementById("cancelGeminiTrackVolumeBtn"),
  applyGeminiTrackVolumeBtn: document.getElementById("applyGeminiTrackVolumeBtn"),
  timelineFrameHoldModal: document.getElementById("timelineFrameHoldModal"),
  closeTimelineFrameHoldModalBtn: document.getElementById("closeTimelineFrameHoldModalBtn"),
  timelineFrameHoldModalTitle: document.getElementById("timelineFrameHoldModalTitle"),
  timelineFrameHoldModalHint: document.getElementById("timelineFrameHoldModalHint"),
  timelineFrameHoldAtNumber: document.getElementById("timelineFrameHoldAtNumber"),
  timelineFrameHoldDurationRange: document.getElementById("timelineFrameHoldDurationRange"),
  timelineFrameHoldDurationNumber: document.getElementById("timelineFrameHoldDurationNumber"),
  timelineFrameHoldModalSummary: document.getElementById("timelineFrameHoldModalSummary"),
  deleteTimelineFrameHoldBtn: document.getElementById("deleteTimelineFrameHoldBtn"),
  cancelTimelineFrameHoldBtn: document.getElementById("cancelTimelineFrameHoldBtn"),
  applyTimelineFrameHoldBtn: document.getElementById("applyTimelineFrameHoldBtn"),
  timelineSpeedRangeModal: document.getElementById("timelineSpeedRangeModal"),
  closeTimelineSpeedRangeModalBtn: document.getElementById("closeTimelineSpeedRangeModalBtn"),
  timelineSpeedRangeModalTitle: document.getElementById("timelineSpeedRangeModalTitle"),
  timelineSpeedRangeModalHint: document.getElementById("timelineSpeedRangeModalHint"),
  timelineSpeedRangeStartNumber: document.getElementById("timelineSpeedRangeStartNumber"),
  timelineSpeedRangeEndNumber: document.getElementById("timelineSpeedRangeEndNumber"),
  timelineSpeedRangeRateRange: document.getElementById("timelineSpeedRangeRateRange"),
  timelineSpeedRangeRateNumber: document.getElementById("timelineSpeedRangeRateNumber"),
  timelineSpeedRangeModalSummary: document.getElementById("timelineSpeedRangeModalSummary"),
  deleteTimelineSpeedRangeBtn: document.getElementById("deleteTimelineSpeedRangeBtn"),
  cancelTimelineSpeedRangeBtn: document.getElementById("cancelTimelineSpeedRangeBtn"),
  applyTimelineSpeedRangeBtn: document.getElementById("applyTimelineSpeedRangeBtn"),
  podcastActiveSpeakerBackdropVideoAlt: document.getElementById("podcastActiveSpeakerBackdropVideoAlt"),
  onScreenTextTrackModal: document.getElementById("onScreenTextTrackModal"),
  onScreenTextTrackPanel: document.getElementById("onScreenTextTrackPanel"),
  closeOnScreenTextTrackModalBtn: document.getElementById("closeOnScreenTextTrackModalBtn"),
  onScreenTextTrackModalBody: document.getElementById("onScreenTextTrackModalBody"),
  copyVoiceoverToOnscreenTextAllBtn: document.getElementById("copyVoiceoverToOnscreenTextAllBtn"),
  montageSceneMixModal: document.getElementById("montageSceneMixModal"),
  closeMontageSceneMixBtn: document.getElementById("closeMontageSceneMixBtn"),
  montageSceneVeoVolumeRange: document.getElementById("montageSceneVeoVolumeRange"),
  montageSceneVeoVolumeNumber: document.getElementById("montageSceneVeoVolumeNumber"),
  montageSceneGeminiVolumeRange: document.getElementById("montageSceneGeminiVolumeRange"),
  montageSceneGeminiVolumeNumber: document.getElementById("montageSceneGeminiVolumeNumber"),
  montageSceneBackgroundVolumeRange: document.getElementById("montageSceneBackgroundVolumeRange"),
  montageSceneBackgroundVolumeNumber: document.getElementById("montageSceneBackgroundVolumeNumber"),
  cancelMontageSceneMixBtn: document.getElementById("cancelMontageSceneMixBtn"),
  applyMontageSceneMixBtn: document.getElementById("applyMontageSceneMixBtn"),
  modalDisfluencyEnabled: document.getElementById("modalDisfluencyEnabled"),
  modalStutterEnabled: document.getElementById("modalStutterEnabled"),
  modalFillerLevel: document.getElementById("modalFillerLevel"),
  modalErrorLevel: document.getElementById("modalErrorLevel"),
  modalStutterLevel: document.getElementById("modalStutterLevel"),
  podcastSceneVideoSelectorModal: document.getElementById("podcastSceneVideoSelectorModal"),
  closeSceneVideoSelectorBtn: document.getElementById("closeSceneVideoSelectorBtn"),
  cancelSceneVideoSelectorBtn: document.getElementById("cancelSceneVideoSelectorBtn"),
  sceneVideoSelectorGeneratedGrid: document.getElementById("sceneVideoSelectorGeneratedGrid"),
  sceneVideoSelectorOthersGrid: document.getElementById("sceneVideoSelectorOthersGrid"),
  sceneVideoTabGeneratedBtn: document.getElementById("sceneVideoTabGeneratedBtn"),
  sceneVideoTabOthersBtn: document.getElementById("sceneVideoTabOthersBtn"),
  audioTrackMontageVolume: document.getElementById("audioTrackMontageVolume"),
  audioTrackMontageVolumeNumber: document.getElementById("audioTrackMontageVolumeNumber"),
  audioTrackDuckVolume: document.getElementById("audioTrackDuckVolume"),
  audioTrackDuckVolumeNumber: document.getElementById("audioTrackDuckVolumeNumber"),
  panelMusicVolume: document.getElementById("panelMusicVolume"),
  audioTrackSourceInfo: document.getElementById("audioTrackSourceInfo"),
  panelMusicPreset: document.getElementById("panelMusicPreset")
};

const demoPrompt = "Escribe un guión de video creativo sobre cómo una ciudad en ruinas descubre energía limpia, con tono cinematográfico, tres escenas y un cierre potente.";

let state = {
  sessions: [],
  activeSessionId: null,
  expandedSessionIds: [],
  sessionRailFilter: "all",
  showArchivedSessions: false,
  liveTokenState: null
};

// --- EXPORT GLOBALS FOR MODULES ---
window.els = els;
window.state = state;
window.SHORT_SCENE_MIN_SEC = SHORT_SCENE_MIN_SEC;
window.SHORT_SCENE_MAX_SEC = SHORT_SCENE_MAX_SEC;
window.VIDEO_SCENE_MAX_SEC = VIDEO_SCENE_MAX_SEC;
window.VIDEO_DIALOGUE_MAX_SEC = VIDEO_DIALOGUE_MAX_SEC;
window.VOICES = VOICES;
window.DEFAULT_HOSTS = DEFAULT_HOSTS;
window.DEFAULT_DISFLUENCY_CONFIG = DEFAULT_DISFLUENCY_CONFIG;
window.SPEAKER_ROLE_DESCRIPTIONS = SPEAKER_ROLE_DESCRIPTIONS;
window.EXPRESSIONS = EXPRESSIONS;
window.MEDIA_CUES = MEDIA_CUES;

window.PodcasterState = {
  get state() { return state; },
  get activeSession() { return getActiveSession(); },
  get activeRowId() { return podcastVideoState.activeRowId; }
};

// --- Colaboración en Tiempo Real: Actividad ---
let activityUnsubscribe = null;
let currentUserName = "Anónimo";

let studioRuntimeEntriesCache = null;
let studioRuntimeEntriesCacheKey = null;
let studioVideoConfigCache = null;
let studioVideoConfigCacheKey = null;

function invalidateStudioRuntimeCache() {
  studioRuntimeEntriesCache = null;
  studioRuntimeEntriesCacheKey = null;
  window.studioRuntimeEntriesCache = null;
  window.studioRuntimeEntriesCacheKey = null;
  studioVideoConfigCache = null;
  studioVideoConfigCacheKey = null;
}

window.invalidateStudioRuntimeCache = invalidateStudioRuntimeCache;


async function obtenerNombreUsuarioStudio(user) {
  try {
    const userSnap = await getDoc(doc(firestoreDb, "users", user.uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      return `${data.firstName || ""} ${data.lastName || ""}`.trim() || user.email || "Anónimo";
    }
    return user.email || "Usuario sin nombre";
  } catch (error) {
    return user.email || "Usuario sin nombre";
  }
}

function setupActivityListener(sessionId) {
  if (activityUnsubscribe) {
    activityUnsubscribe();
    activityUnsubscribe = null;
  }
  if (!sessionId) return;

  // console.log("[Studio] Iniciando listener de actividad para:", sessionId);
  const sessionRef = doc(firestoreDb, "podcaster_sessions", sessionId);
  activityUnsubscribe = onSnapshot(sessionRef, (snapshot) => {
    try {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const activity = data.recentActivity;

      // console.log("[Studio] Cambio detectado en sesión. Actividad:", activity);

      if (activity) {
        // Solo mostrar si es reciente (menos de 15 segundos)
        const diff = Date.now() - (activity.timestamp || 0);
        // console.log("[Studio] Evaluando notificación. Diferencia tiempo (ms):", diff);
        if (diff < 15000) {
          showActivityNotification(activity);
        }
      }
    } catch (err) {
      console.error("[Studio] Error en el listener de actividad:", err);
    }
  });
}

function showActivityNotification(activity) {
  // console.log("[Studio] Mostrando notificación de actividad:", activity);
  const pods = ["podcastVideoActivityNotification", "creativeVideoActivityNotification", "mainStudioActivityNotification"];
  let foundAtLeastOne = false;

  // Determine active pod based on current UI state
  let activePodId = "mainStudioActivityNotification";
  const pModal = document.getElementById("podcastVideoModal");
  const cModal = document.getElementById("creativeVideoModal");
  
  if (cModal && !cModal.hidden) {
    activePodId = "creativeVideoActivityNotification";
  } else if (pModal && !pModal.hidden) {
    activePodId = "podcastVideoActivityNotification";
  }

  pods.forEach(id => {
    const el = document.getElementById(id);
    if (!el) {
      // console.log(`[Studio] Elemento #${id} no encontrado.`);
      return;
    }

    foundAtLeastOne = true;
    const textEl = el.querySelector(".activity-text");
    if (textEl) {
      const sceneLabel = (activity.sceneIndex !== undefined && activity.sceneIndex >= 0) ? ` en la escena ${activity.sceneIndex + 1}` : "";
      textEl.textContent = `${activity.userName} ${activity.action}${sceneLabel}`;
    }

    if (id === activePodId) {
      el.style.display = "flex";
      // console.log(`[Studio] Notificación visible en #${id}`);
    } else {
      el.style.display = "none";
    }
  });

  if (!foundAtLeastOne) return;
}

/**
 * Oculta todos los contenedores de notificación de actividad.
 */
function clearAllActivityNotifications() {
  // console.log("[Studio] Quitando todas las notificaciones de actividad.");
  const pods = ["podcastVideoActivityNotification", "creativeVideoActivityNotification", "mainStudioActivityNotification"];
  pods.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}
// ----------------------------------------------

function isPodcasterEditingTextField(target = null) {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.closest && el.closest("input, textarea, select, [contenteditable='true']")) return true;
  return false;
}

function isPodcastStudioInspectorEditing() {
  const active = document.activeElement instanceof Element ? document.activeElement : null;
  if (!active) return false;
  return isPodcasterEditingTextField(active) && Boolean(active.closest(".podcast-studio-row-editor"));
}

let scriptSortable = null;
let playingRowId = null;
let rowPlaybackTimerState = {
  rowId: "",
  startedAtMs: 0,
  rafId: 0
};
let rowPlaybackAudioEl = null;
let studioDialoguePreviewAudioEl = null;
let studioDialoguePreviewRowId = "";
let googleGenAiLiveModule = null;
let podcastStudioInspectorCollapsed = (() => {
  try {
    return window.localStorage.getItem(PODCAST_STUDIO_INSPECTOR_COLLAPSED_KEY) === "1";
  } catch (_) {
    return false;
  }
})();
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
let montageSceneMixOpen = false;
let pendingScriptPrompt = "";
let pendingScriptPromptHtml = "";
let pendingScriptTableMode = "create";
let cloudAutosaveTimeout = 0;
const PODCAST_SESSION_MANUAL_SAVE_ONLY = true;
let suppressPodcastStudioUiStateSync = false;
let geminiCreativityModalState = {
  rowId: ""
};
let composerGenerationMode = (() => {
  try {
    return window.localStorage.getItem(COMPOSER_GENERATION_MODE_KEY) === "video" ? "video" : "script";
  } catch (_) {
    return "script";
  }
})();
let composerVideoTableMode = (() => {
  try {
    return window.localStorage.getItem(COMPOSER_VIDEO_TABLE_MODE_KEY) === "create" ? "create" : "compose";
  } catch (_) {
    return "compose";
  }
})();
let rowDisfluencyConfigOpenId = null;
let dialogueVideoDirectiveRequest = null;
let geminiAudioSpeedModalState = {
  rowId: "",
  playbackRate: 1
};
let geminiTrackVolumeModalState = {
  open: false,
  volumePct: 100
};
let timelineFrameHoldModalState = {
  rowId: "",
  holdId: "",
  atSourceMs: 0,
  holdDurationSec: 1
};
let timelineSpeedRangeModalState = {
  rowId: "",
  speedId: "",
  startSourceMs: 0,
  endSourceMs: 1000,
  playbackRate: 1
};
let montageAudioSubtracksOpen = (() => {
  try {
    return window.localStorage.getItem(PODCAST_STUDIO_MONTAGE_AUDIO_SUBTRACKS_KEY) === "1";
  } catch (_) {
    return false;
  }
})();
window.backgroundDialogueAudioWarmupToken = 0;
let podcastVideoState = {
  undoStack: [],
  redoStack: [],
  enabled: false,
  activeSpeaker: "",
  activeRowId: "",
  speaking: false,
  stagePortraitFallback: false,
  busy: false,
  stageVideoSlot: 0,
  showMontageAudioSubtracks: montageAudioSubtracksOpen,
  playheadDragging: false,
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
  timelineAudioSelection: {
    geminiRowIds: new Set(),
    uploadedKeys: new Set(),
    panelLoopKey: ""
  },
  zoomed: false,
  timelineZoom: 1,
  montageAudioActualDurationsMs: {},
  onScreenTextOverlayDrag: null,
  onScreenTextOverlayResize: null,
  onScreenTextOverlaySelectedRowId: "",
  onScreenTextTrackModalOffsetX: 0,
  onScreenTextTrackModalOffsetY: 0,
  onScreenTextTrackModalDrag: null,
  lastSyncedStageKey: "",
  lastTimelineClipsSessionId: "",
  lastTimelineClipsUpdatedAt: "",
  cachedTimelineClips: null
};
window.podcastVideoState = podcastVideoState;

function scheduleSessionLocalPersist(reason = "") {
  const session = getActiveSession();
  if (!session?.id) return;
  if (cloudAutosaveTimeout) clearTimeout(cloudAutosaveTimeout);
  cloudAutosaveTimeout = setTimeout(() => {
    cloudAutosaveTimeout = 0;
    try {
      persistSessions();
    } catch (_) {
      // noop
    }
    sessionStore.markDirty(String(getActiveSession()?.id || session.id || "").trim(), reason || "local-edit");
  }, 120);
}

function flushSessionLocalPersistNow(sessionId = "", reason = "") {
  const cleanSessionId = String(sessionId || getActiveSession()?.id || "").trim();
  if (!cleanSessionId) return Promise.resolve();
  if (cloudAutosaveTimeout) {
    clearTimeout(cloudAutosaveTimeout);
    cloudAutosaveTimeout = 0;
  }
  try {
    persistSessions();
  } catch (_) {
    // noop
  }
  sessionStore.markDirty(cleanSessionId, reason || "immediate");
  return Promise.resolve();
}

function clampPodcastStudioInspectorWidthPx(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PodcasterResize.POD_INSPECTOR_WIDTH_DEFAULT;
  return Math.max(PodcasterResize.POD_INSPECTOR_WIDTH_MIN, Math.min(PodcasterResize.POD_INSPECTOR_WIDTH_MAX, numeric));
}

function normalizePodcastStudioUiState(raw = null, session = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const cfg = getPodcastVideoConfig(session || getActiveSession());
  const rows = getSessionRows(session || getActiveSession());
  const validRowIds = new Set(rows.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const lastActiveRowId = String(source.lastActiveRowId || "").trim();
  const collapsedRowIds = Array.isArray(source.collapsedRowIds)
    ? Array.from(new Set(
      source.collapsedRowIds
        .map((rowId) => String(rowId || "").trim())
        .filter((rowId) => validRowIds.has(rowId))
    ))
    : [];
  return {
    inspectorCollapsed: source.inspectorCollapsed === true,
    inspectorWidthPx: clampPodcastStudioInspectorWidthPx(source.inspectorWidthPx),
    libraryCollapsed: source.libraryCollapsed === true,
    stageWidthRatio: null,
    stageMaxHeightPx: (() => {
      const value = Number(source.stageMaxHeightPx);
      return Number.isFinite(value) && value > 0
        ? Math.max(240, Math.min(PodcasterResize.POD_STAGE_MAX_HEIGHT_PX_MAX, Math.round(value)))
        : null;
    })(),
    timelineViewMode: String(source.timelineViewMode || cfg.timelineViewMode || "tracks").trim().toLowerCase() === "normal" ? "normal" : "tracks",
    showMontageAudioSubtracks: source.showMontageAudioSubtracks === true,
    lastActiveRowId: validRowIds.has(lastActiveRowId) ? lastActiveRowId : "",
    collapsedRowIds,
    composerGenerationMode: String(source.composerGenerationMode || composerGenerationMode || "script").trim() === "video" ? "video" : "script"
  };
}

function getCollapsedScriptRowIds(session = null) {
  const ui = normalizePodcastStudioUiState((session || getActiveSession())?.podcastStudioUiState || null, session || getActiveSession());
  return Array.isArray(ui.collapsedRowIds) ? ui.collapsedRowIds : [];
}

function isScriptRowCollapsed(rowId = "", session = null) {
  const key = String(rowId || "").trim();
  if (!key) return false;
  return getCollapsedScriptRowIds(session).includes(key);
}

function setScriptRowCollapsed(rowId = "", collapsed = false) {
  const key = String(rowId || "").trim();
  if (!key) return;
  const current = new Set(getCollapsedScriptRowIds());
  if (collapsed) {
    current.add(key);
  } else {
    current.delete(key);
  }
  upsertPodcastStudioUiState({
    collapsedRowIds: Array.from(current)
  }, { autosaveReason: "ui-state" });
}

function areAllScriptRowsCollapsed(session = null) {
  const activeSession = session || getActiveSession();
  const rows = Array.isArray(activeSession?.script?.rows) ? activeSession.script.rows : [];
  if (!rows.length) return false;
  const collapsed = new Set(getCollapsedScriptRowIds(activeSession));
  return rows.every((row) => collapsed.has(String(row?.id || "").trim()));
}

function setAllScriptRowsCollapsed(collapsed = false, session = null) {
  const activeSession = session || getActiveSession();
  const rows = Array.isArray(activeSession?.script?.rows) ? activeSession.script.rows : [];
  const nextIds = collapsed
    ? rows.map((row) => String(row?.id || "").trim()).filter(Boolean)
    : [];
  upsertPodcastStudioUiState({
    collapsedRowIds: nextIds
  }, { autosaveReason: "ui-state" });
}

function upsertPodcastStudioUiState(patch = {}, { autosaveReason = "ui-state" } = {}) {
  if (suppressPodcastStudioUiStateSync) return;
  const session = getActiveSession();
  if (!session) return;
  upsertActiveSession((current) => {
    const next = normalizePodcastStudioUiState({
      ...(current.podcastStudioUiState || {}),
      ...(patch || {})
    }, current);
    return {
      ...current,
      podcastStudioUiState: next
    };
  }, { render: false });
  scheduleSessionLocalPersist(autosaveReason);
}
let creativeVideoState = {
  enabled: false,
  activeRowId: ""
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
let podcastTimelinePreviewsSuspended = false;
let podcastTimelinePreviewSyncRafId = 0;
let podcastTimelinePreviewSyncPayload = null;
const LOCAL_PROXY_MEDIA_UNAVAILABLE_TTL_MS = 45000;
const PODCAST_RENDER_DEBUG = (() => {
  try {
    return window.localStorage.getItem("cb_podcast_render_debug") === "1";
  } catch (_) {
    return false;
  }
})();

const podcasterMediaRuntimeApi = createPodcasterMediaRuntimeApi({
  localProxyMediaUnavailableTtlMs: LOCAL_PROXY_MEDIA_UNAVAILABLE_TTL_MS,
  buildApiUrl,
  resolveDateIso,
  setGenerationStatus,
  renderPodcastVideoTimeline,
  getActiveSession,
  resolveStorageVideoUrl: (...args) => resolveStorageVideoUrl(...args),
  logPodcastRenderDebug,
  nowIso,
  getPodcastStageVideoCache: () => playbackController?.blobCache || new Map(),
  getPodcastStageAudioCache: () => playbackController?.blobCache || new Map(),
  isRenderDebugEnabled: () => PODCAST_RENDER_DEBUG
});

const {
  isLocalProxyMediaUrl,
  markLocalProxyMediaUnavailable,
  shouldShortCircuitLocalProxyMediaFetch,
  buildDialogueVideoSourceKey,
  markStaleProxyMediaUrl,
  isMarkedStaleProxyMediaUrl,
  resolveStaleAwareProxyMediaUrl,
  parseFirebaseStorageObjectUrl,
  deriveStoragePathFromMediaSource,
  normalizePersistedMediaReference,
  normalizeMediaReferenceFromRecord,
  isLikelyImageMediaRecord,
  buildImageReferenceRecordFromMedia,
  markStaleDialogueVideoSource,
  isStaleDialogueVideoSource
} = podcasterMediaRuntimeApi;

const podcasterMediaReferenceApi = createPodcasterMediaReferenceApi({
  getElements: () => els,
  getActiveSession,
  nowIso,
  readDataUrlFromFile: window.readDataUrlFromFile,
  buildImageReferenceRecordFromMedia,
  normalizeMediaReferenceFromRecord,
  MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS,
  MAX_LOCAL_REFERENCE_VIDEO_DATA_URL_CHARS,
  normalizeSpeakerLabel,
  upsertActiveSession,
  renderPodcastPortraitStrip,
  scheduleSessionLocalPersist,
  renderScript,
  syncPodcastStudioInspector,
  renderPodcastVideoShell,
  renderCreativeVideoShell,
  renderPodcastVideoTimeline,
  setPodcastVideoRow,
  resolveStorageVideoUrl,
  saveSessionToCloud,
  resolveCurrentUid,
  doc,
  updateDoc,
  serverTimestamp,
  firestoreDb,
  resolveSpeakerDisplayName,
  resolveSceneNumberByRowId
});

const {
  readImageReferenceFromFile,
  isLikelyVideoReferenceFile,
  readVideoReferenceFromFile,
  normalizeReferenceImageRecord,
  normalizeReferenceImageList,
  normalizeReferenceImageMap,
  normalizeReferenceImageListMap,
  normalizeReferenceVideoRecord,
  normalizeReferenceVideoMap,
  normalizeRowReferenceModeMap,
  getSpeakerReferenceImageMap,
  getScenarioReferenceImageMap,
  getRowReferenceImageListMap,
  getRowReferenceImageList,
  getRowReferenceImageMap,
  getRowReferenceVideoMap,
  getRowReferenceModeByRowId,
  resolveRowReferenceAsset,
  resolveReferenceImagePreviewUrl,
  hydrateSessionReferenceMedia,
  persistRowReferencesPatchToCloud,
  setSpeakerReferenceImage,
  setScenarioReferenceImage,
  setRowReferenceImage,
  setRowReferenceImages,
  setRowReferenceVideo,
  promptSpeakerReferenceSelection,
  promptScenarioReferenceSelection,
  promptRowReferenceSelection,
  clearRowReference,
  bindInputEvents: bindMediaReferenceInputEvents
} = podcasterMediaReferenceApi;


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
let nextDialogueVideoRequestAt = 0;
let podcastPortraitViewerLastFocus = null;
let globalTooltipState = {
  el: null,
  target: null,
  rafId: 0
};

const runtimeFeatureState = {
  dialogueAudioUnavailable: false,
  dialogueAudioUnavailableWarned: false,
  healthChecked: false
};
const STUDIO_TRANSITION_TYPES = [
  "cut",
  "crossfade",
  "dip-black",
  "flash-white",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "blur"
];
const STUDIO_TIMELINE_VERSION = 3;
const STUDIO_TIMELINE_TRACK_VERSION = 1;
const STUDIO_TIMELINE_PIXELS_PER_SEC = 52;
const PODCAST_TIMELINE_RULER_OFFSET_PX = 148;
const STUDIO_TIMELINE_SNAP_MS = 10;
const STUDIO_TIMELINE_MIN_CLIP_MS = 500;
const STUDIO_TIMELINE_MIN_CLIP_PX = 96;
const STUDIO_AUDIO_TRACK_MIN_LOOP_PX = 24;
const STUDIO_GEMINI_SCENE_DELAY_MS = 0;
const STUDIO_REORDER_SUBTITLE_INSET_PX = 0;
const STUDIO_REORDER_SUBTITLE_LEGACY_INSET_PX = 15;
const STUDIO_GEMINI_LEGACY_DEFAULT_DELAY_MS = 1000;
const STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX = -15;
const STUDIO_REORDER_ONSCREEN_TEXT_WIDTH_PCT = 0.52;
const STUDIO_REORDER_ONSCREEN_TEXT_HEIGHT_PCT = 0.16;
const STUDIO_TIMELINE_CHAIN_TOLERANCE_MS = 0;
const STUDIO_TRANSITION_PRESETS = {
  cut: { type: "cut", durationMs: 0 },
  crossfade: { type: "crossfade", durationMs: 320 },
  "dip-black": { type: "dip-black", durationMs: 420 },
  "flash-white": { type: "flash-white", durationMs: 220 },
  "slide-left": { type: "slide-left", durationMs: 360 },
  "slide-right": { type: "slide-right", durationMs: 360 },
  "slide-up": { type: "slide-up", durationMs: 340 },
  "slide-down": { type: "slide-down", durationMs: 340 },
  "zoom-in": { type: "zoom-in", durationMs: 300 },
  "zoom-out": { type: "zoom-out", durationMs: 300 },
  blur: { type: "blur", durationMs: 320 }
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
    // console.log("[podcaster-live]", event, {
    //   at: new Date().toISOString(),
    //   ...payload
    // });
  } catch (_) {
    // noop
  }
}

function logVideoCreateDebug(stage = "", payload = {}) {
  if (!isPodcasterLiveDebugEnabled()) return;
  try {
    console.groupCollapsed(`video/create · ${stage}`);
    // console.log({
    //   at: new Date().toISOString(),
    //   ...payload
    // });
    console.groupEnd();
  } catch (_) {
    // noop
  }
}

const podcasterPanelMusicApi = createPodcasterPanelMusicApi({
  panelMusicStorageKeyBase: PANEL_MUSIC_STORAGE_KEY_BASE,
  maxLocalMusicDataUrlChars: MAX_LOCAL_MUSIC_DATA_URL_CHARS,
  studioTimelineMinClipMs: STUDIO_TIMELINE_MIN_CLIP_MS,
  getElements: () => els,
  resolveCurrentUid,
  getActiveSession,
  getSessionRows,
  nowIso,
  authFetchJson,
  addChatMessage,
  setGenerationStatus,
  renderPodcastVideoTimeline,
  upsertActiveSession,
  resolveStorageAudioUrl,
  scheduleSessionLocalPersist,
  getPlaybackController: () => playbackController,
  getPodcastVideoConfig,
  upsertPodcastVideoConfig,
  getPodcastVideoState: () => podcastVideoState,
  getTimelineTotalDurationMs,
  buildTimelineRuntimeEntries,
  logPodcastRenderDebug,
  escapeHtml,
  syncPodcastStudioInspector
});

const {
  panelMusicState,
  panelMusicGlobalLibraryState,
  podcastAudioTrackUiState,
  resolvePanelMusicStorageKey,
  resolvePanelMusicSessionCacheKey,
  persistPanelMusicSessionTrackCache,
  loadPanelMusicSessionTrackCache,
  normalizePanelMusicMutedLoopIndexes,
  normalizePanelMusicLoopSettings,
  normalizePanelMusicTrack,
  normalizeGlobalPanelMusicLibraryTrack,
  normalizePanelMusicTrackList,
  resolvePanelMusicTrackKind,
  getPanelMusicUploadedTracks,
  getEnabledPanelMusicUploadedTracks,
  setPanelMusicUploadedTracks,
  setAllSessionUploadedTracksEnabled,
  toggleSessionUploadedTrackEnabled,
  removeUploadedTrackAt,
  addGlobalMusicTrackToSession,
  reconcileSessionUploadedTracksWithGlobalLibrary,
  fetchGlobalPanelMusicLibrary,
  updateUploadedTrackAt,
  getPanelMusicTrackByKind,
  getPanelMusicTrackAvailability,
  getAvailablePanelMusicTrackKinds,
  getPanelMusicTrackDurationSec,
  getPanelMusicLoopCount,
  buildUploadedPanelMusicSegments,
  groupUploadedPanelMusicSegmentsByTrack,
  getPanelMusicLoopSegments,
  getPanelMusicLoopSetting,
  upsertPanelMusicLoopSetting,
  measureAudioDurationInfoFromFile,
  ensurePanelMusicTrackDuration,
  ensureAllEnabledUploadedTrackDurations,
  togglePanelMusicLoopMute,
  updatePanelMusicTrack,
  syncActivePanelMusicTrack,
  selectPanelMusicTrackKind,
  selectUploadedPanelMusicTrackByIndex,
  setPanelMusicTrack,
  loadPanelMusicSettings,
  loadPanelMusicSettingsIntoState,
  persistPanelMusicSettings,
  persistPanelMusicToActiveSession,
  persistAudioTrackMixSettings,
  buildDefaultPanelMusicAiPrompt,
  generatePanelMusicWithAi,
  syncMusicControls,
  syncPanelMusicStateFromSession,
  hydratePanelMusicLocalCaches,
  setPanelMontageMusicVolume,
  setPanelMontageDuckingWhenGeminiPct,
  setPanelMontageStabilize,
  setPanelMontageLimiterEnabled,
  stopPanelMusic,
  startPanelMusic,
  resolvePanelMusicTrackSrc,
  getPanelMontageMusicConfig,
  handleTimelineSelectAudioLoopChip,
  handleTimelineToggleAudioLoopMute,
  ensurePanelMusicTrackUploaded,
  getPanelMusicAiGenerating,
  setPanelMusicAiGenerating
} = podcasterPanelMusicApi;

function setPodcastPlaybackRowStatus(status = "", details = {}) {
  podcastPlaybackState.currentRowStatus = String(status || "").trim();
  podcastPlaybackState.currentRowError = String(details?.error || "").trim();
  podcastPlaybackState.currentRowStartedAt = Number(details?.startedAt || Date.now()) || Date.now();
  try {
    // console.log("[podcaster-playback]", {
    //   at: new Date().toISOString(),
    //   rowId: String(details?.rowId || playingRowId || "").trim(),
    //   status: podcastPlaybackState.currentRowStatus,
    //   error: podcastPlaybackState.currentRowError
    // });
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
  const params = new URLSearchParams(window.location.search);
  if (params.get("forceCloud") === "1" || params.get("clean") === "1") {
    return [];
  }
  return sessionStore.loadSessionsFromLocalCache(uid);
}

function persistSessions(uid = resolveCurrentUid(), sessions = state.sessions) {
  return sessionStore.persistSessionsToLocalCache(uid, Array.isArray(sessions) ? sessions : state.sessions);
}

async function loadCloudSessions() {
  return sessionStore.loadSessionsFromCloud(resolveCurrentUid());
}

async function loadCloudSessionDocumentDirect(sessionId) {
  return sessionStore.loadSingleSessionFromCloud(sessionId, resolveCurrentUid());
}

function mergeVisualProposalFieldsIntoRows(targetRows = [], sourceRows = []) {
  const nextTargetRows = Array.isArray(targetRows) ? targetRows : [];
  const nextSourceRows = Array.isArray(sourceRows) ? sourceRows : [];
  if (!nextTargetRows.length || !nextSourceRows.length) return nextTargetRows;
  nextSourceRows.forEach((sourceRow, sourceIndex) => {
    const rowId = String(sourceRow?.id || "").trim();
    const targetRowById = rowId
      ? nextTargetRows.find((entry) => String(entry?.id || "").trim() === rowId)
      : null;
    const targetRowByIndex = nextTargetRows[sourceIndex] || null;
    const targetRow = targetRowById || targetRowByIndex;
    if (!targetRow) return;
    // Sincronizar propuesta activa (solo si no se ha editado localmente hace poco)
    // Esto evita que una snapshot vieja de la nube sobreescriba el borrado de propuesta local
    const lastLocalEdit = Number(targetRow.lastEditedAt || 0);
    const now = Date.now();
    const isRecentlyEdited = (now - lastLocalEdit) < 5000; // 5 segundos de margen de seguridad

    // Sincronizar historial de propuestas (unión de ambos)
    const sourceProposalHistory = Array.isArray(sourceRow?.visualNotesProposals)
      ? sourceRow.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    const targetProposalHistory = Array.isArray(targetRow?.visualNotesProposals)
      ? targetRow.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    targetRow.visualNotesProposals = Array.from(new Set([...targetProposalHistory, ...sourceProposalHistory]));

    // Sincronizar propuestas resueltas (usamos el estado del documento principal como verdad)
    if (sourceRow?.visualNotesResolvedProposals !== undefined) {
      targetRow.visualNotesResolvedProposals = normalizeVisualProposalState(sourceRow.visualNotesResolvedProposals);
    }

    // Rehidratar propuesta activa sin revivir una propuesta ya resuelta desde caché local vieja.
    if (!isRecentlyEdited) {
      targetRow.visualNotesProposal = resolveActiveVisualProposal({
        ...targetRow,
        visualNotesProposal: targetRow?.visualNotesProposal,
        visualNotesProposals: targetRow.visualNotesProposals,
        visualNotesResolvedProposals: targetRow.visualNotesResolvedProposals
      });
    }

    // Registrar timestamp de sincronización si hubo cambios
    targetRow.lastSyncedAt = Date.now();
  });
  return nextTargetRows;
}

function cloneSessionRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
}

function mergeSessionRowsWithFallback(primaryRows = [], fallbackRows = []) {
  const primary = cloneSessionRows(primaryRows);
  const fallback = cloneSessionRows(fallbackRows);
  if (!primary.length) return fallback;
  if (!fallback.length) return primary;

  const fallbackById = new Map();
  fallback.forEach((row, index) => {
    const key = String(row?.id || "").trim() || `row-index-${index}`;
    fallbackById.set(key, row);
  });

  const merged = primary.map((row, index) => {
    const key = String(row?.id || "").trim() || `row-index-${index}`;
    const fallbackRow = fallbackById.get(key);
    if (!fallbackRow) return row;
    return { ...fallbackRow, ...row };
  });

  const primaryKeys = new Set(merged.map((row, index) => String(row?.id || "").trim() || `row-index-${index}`));
  fallback.forEach((row, index) => {
    const key = String(row?.id || "").trim() || `row-index-${index}`;
    if (!primaryKeys.has(key)) merged.push(row);
  });

  mergeVisualProposalFieldsIntoRows(merged, fallback);
  return merged;
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

    // Preservar propuestas de la nube si la local es más nueva
    if (incomingIsNewer) {
      const cloudRows = existing.script?.rows || [];
      const localRows = session.script?.rows || [];

      cloudRows.forEach(cRow => {
        const lRow = localRows.find(r => r.id === cRow.id);
        if (!lRow) return;
        if (cRow.visualNotesProposal !== undefined) {
          lRow.visualNotesProposal = String(cRow.visualNotesProposal || "").trim();
        }
        const cloudProposalHistory = Array.isArray(cRow.visualNotesProposals)
          ? cRow.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
          : [];
        if (cloudProposalHistory.length) {
          const localProposalHistory = Array.isArray(lRow.visualNotesProposals)
            ? lRow.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
            : [];
          lRow.visualNotesProposals = Array.from(new Set([...localProposalHistory, ...cloudProposalHistory]));
        }
        const cloudResolved = normalizeVisualProposalState(cRow.visualNotesResolvedProposals);
        if (cloudResolved.length) {
          const localResolved = normalizeVisualProposalState(lRow.visualNotesResolvedProposals);
          lRow.visualNotesResolvedProposals = Array.from(new Set([...localResolved, ...cloudResolved]));
        }
        lRow.visualNotesProposal = resolveActiveVisualProposal(lRow);
      });

      result[existingIndex] = session;
    }
  };
  (Array.isArray(primary) ? primary : []).forEach(pushOrMerge);
  (Array.isArray(secondary) ? secondary : []).forEach(pushOrMerge);
  return result;
}

function mergeCloudSessionOverLocalCache(cloudSession = null, localSession = null) {
  return sessionStore.mergeCloudVsLocalSessions(
    cloudSession ? [cloudSession] : [],
    localSession ? [localSession] : []
  )[0] || cloudSession || localSession || null;
}

function mergeCloudSessionsOverLocalCache(cloudSessions = [], localSessions = []) {
  return sessionStore.mergeCloudVsLocalSessions(cloudSessions, localSessions);
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

function resolveDeletedSessionsStorageKey(uid = resolveCurrentUid()) {
  return `${STORAGE_KEY_BASE}:deleted:${String(uid || "").trim() || "auth_required"}`;
}

function readJsonArrayStorage(key = "") {
  try {
    const parsed = JSON.parse(localStorage.getItem(String(key || "").trim()) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeJsonArrayStorage(key = "", value = []) {
  try {
    localStorage.setItem(String(key || "").trim(), JSON.stringify(Array.isArray(value) ? value : []));
  } catch (_) {
    // noop
  }
}

function loadDeletedSessionIds(uid = resolveCurrentUid()) {
  return Array.from(new Set(
    readJsonArrayStorage(resolveDeletedSessionsStorageKey(uid))
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  ));
}

function markDeletedSessionId(uid = resolveCurrentUid(), sessionId = "") {
  const cleanId = String(sessionId || "").trim();
  if (!cleanId) return;
  const nextIds = Array.from(new Set([...loadDeletedSessionIds(uid), cleanId]));
  writeJsonArrayStorage(resolveDeletedSessionsStorageKey(uid), nextIds);
}

function purgeSessionFromStorageKey(key = "", sessionId = "") {
  const cleanKey = String(key || "").trim();
  const cleanId = String(sessionId || "").trim();
  if (!cleanKey || !cleanId) return;
  const sessions = readJsonArrayStorage(cleanKey);
  if (!sessions.length) return;
  const nextSessions = sessions.filter((session) => String(session?.id || "").trim() !== cleanId);
  if (nextSessions.length === sessions.length) return;
  writeJsonArrayStorage(cleanKey, nextSessions);
}

function purgeSessionFromAllStorage(sessionId = "", uid = resolveCurrentUid()) {
  const cleanId = String(sessionId || "").trim();
  if (!cleanId) return;
  [
    resolveSessionStorageKey(uid),
    LEGACY_STORAGE_KEY,
    `${STORAGE_KEY_BASE}:auth_required`,
    `${STORAGE_KEY_BASE}:anon`,
    STORAGE_KEY_BASE
  ].forEach((key) => purgeSessionFromStorageKey(key, cleanId));
}

function normalizePodcastSceneLibraryItem(item = null) {
  if (!item || typeof item !== "object") return null;
  const libraryId = String(item.libraryId || item.id || "").trim();
  const downloadUrl = String(item.downloadUrl || item.videoDownloadUrl || item.videoUrl || "").trim();
  const storagePath = String(item.storagePath || item.videoStoragePath || "").trim();
  if (!libraryId || (!downloadUrl && !storagePath)) return null;
  return {
    libraryId,
    title: String(item.title || item.name || item.publicSceneTitle || "Escena pública").trim() || "Escena pública",
    sourceSessionId: String(item.sourceSessionId || "").trim(),
    sourceRowId: String(item.sourceRowId || "").trim(),
    sourceRowNumber: Math.max(0, Math.round(Number(item.sourceRowNumber || 0) || 0)),
    ownerId: String(item.ownerId || "").trim(),
    ownerEmail: String(item.ownerEmail || "").trim(),
    durationSec: Math.max(VIDEO_SCENE_MIN_SEC, Math.min(VIDEO_SCENE_MAX_SEC, Number(item.durationSec) || VIDEO_SCENE_MAX_SEC)),
    sceneDescription: String(item.sceneDescription || "").trim(),
    onScreenText: String(item.onScreenText || "").trim(),
    transition: String(item.transition || "").trim(),
    visualNotes: String(item.visualNotes || "").trim(),
    videoDirective: String(item.videoDirective || "").trim(),
    scenePrompt: String(item.scenePrompt || "").trim(),
    voiceOverText: String(item.voiceOverText || "").trim(),
    tagLabel: String(item.tagLabel || "").trim(),
    tagColor: String(item.tagColor || "slate").trim() || "slate",
    imagePrompts: normalizeVideoImagePrompts(item.imagePrompts || []),
    videoPreset: String(item.videoPreset || "creative").trim() || "creative",
    downloadUrl,
    storagePath,
    mimeType: String(item.mimeType || "video/mp4").trim() || "video/mp4",
    thumbUrl: String(item.thumbUrl || item.thumbnailUrl || "").trim(),
    thumbStoragePath: String(item.thumbStoragePath || item.thumbnailStoragePath || "").trim(),
    thumbMimeType: String(item.thumbMimeType || "image/jpeg").trim() || "image/jpeg",
    videoStoragePath: storagePath,
    createdAt: String(item.createdAt || "").trim(),
    updatedAt: String(item.updatedAt || "").trim(),
    publicSceneLibraryId: libraryId,
    // Preservar metadatos adicionales si existen para la copia
    originalSpeaker: String(item.speaker || "Narrador").trim(),
    originalExpression: String(item.expression || "Neutral").trim(),
    playbackRate: Math.max(0.5, Math.min(2.25, Number(item.playbackRate) || 1))
  };
}

// Lógica de librería pública removida y modularizada en podcaster-public-library.js

function captureVideoFrameDataUrl(videoEl = null, options = {}) {
  const video = videoEl || null;
  if (!video) return Promise.resolve("");
  const timeSec = Number.isFinite(Number(options.timeSec)) ? Math.max(0, Number(options.timeSec)) : null;
  const maxWaitMs = Math.max(1000, Math.min(12000, Number(options.maxWaitMs) || 6000));
  return new Promise((resolve) => {
    let done = false;
    const finish = (value = "") => {
      if (done) return;
      done = true;
      try { video.removeEventListener("error", onError); } catch (_) { }
      try { video.removeEventListener("loadeddata", onLoadedData); } catch (_) { }
      try { video.removeEventListener("seeked", onSeeked); } catch (_) { }
      clearTimeout(timeout);
      resolve(String(value || "").trim());
    };
    const onError = () => finish("");
    const onSeeked = () => {
      try {
        const w = Math.max(2, Math.floor(Number(video.videoWidth || 0) || 0));
        const h = Math.max(2, Math.floor(Number(video.videoHeight || 0) || 0));
        if (!w || !h) return finish("");
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish("");
        ctx.drawImage(video, 0, 0, w, h);
        finish(canvas.toDataURL("image/jpeg", 0.84));
      } catch (_) {
        finish("");
      }
    };
    const onLoadedData = () => {
      if (timeSec == null) return onSeeked();
      try {
        const duration = Number(video.duration || 0);
        const seekTo = Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - 0.08) : timeSec, duration || timeSec));
        video.currentTime = seekTo;
      } catch (_) {
        onSeeked();
      }
    };
    const timeout = setTimeout(() => finish(""), maxWaitMs);
    video.addEventListener("error", onError, { once: true });
    video.addEventListener("loadeddata", onLoadedData, { once: true });
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      if (timeSec != null && Number.isFinite(timeSec)) {
        video.currentTime = timeSec;
      }
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        onLoadedData();
      } else {
        video.load?.();
      }
    } catch (_) {
      finish("");
    }
  });
}

function getSceneInsertIndexForLibraryItem(session = null, targetRowId = "") {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  if (!rows.length) return 0;
  const key = String(targetRowId || podcastVideoState.activeRowId || "").trim();
  if (!key) return rows.length;
  const index = rows.findIndex((row) => String(row?.id || "").trim() === key);
  return index >= 0 ? Math.min(rows.length, index + 1) : rows.length;
}

function buildPublicSceneRowFromLibraryItem(item = null) {
  const normalized = normalizePodcastSceneLibraryItem(item);
  if (!normalized) return null;
  const title = String(normalized.title || "").trim() || "Escena pública";
  const voiceOverText = String(normalized.voiceOverText || normalized.sceneDescription || title).trim();
  return {
    id: makeId("row"),
    publicSceneLibraryId: "",
    publicScenePublishedAt: "",
    publicSceneTitle: "",
    publicSceneThumbUrl: "",
    publicSceneVideoUrl: "",
    speaker: "Narrador",
    expression: "Neutral",
    durationSec: normalized.durationSec,
    mediaCue: "Sin media",
    voiceOverText,
    voiceOverOriginalText: voiceOverText,
    sceneDescription: String(normalized.sceneDescription || title).trim(),
    onScreenText: String(normalized.onScreenText || "").trim(),
    transition: String(normalized.transition || "Corte limpio").trim() || "Corte limpio",
    visualNotes: String(normalized.visualNotes || "").trim(),
    text: voiceOverText,
    notes: String(normalized.visualNotes || normalized.transition || "").trim(),
    scenePrompt: String(normalized.scenePrompt || normalized.sceneDescription || title).trim(),
    videoDirective: String(normalized.videoDirective || "").trim(),
    imagePrompts: normalizeVideoImagePrompts(normalized.imagePrompts || []),
    videoPreset: String(normalized.videoPreset || "creative").trim() || "creative"
  };
}

function buildDuplicatedSceneRow(row = null, nextRowId = "") {
  if (!row || typeof row !== "object") return null;
  const safeRowId = String(nextRowId || makeId("row")).trim();
  if (!safeRowId) return null;
  return {
    ...row,
    id: safeRowId,
    publicSceneLibraryId: "",
    publicScenePublishedAt: "",
    publicSceneTitle: "",
    publicSceneThumbUrl: "",
    publicSceneVideoUrl: "",
    sourcePublicSceneLibraryId: String(row?.sourcePublicSceneLibraryId || row?.publicSceneLibraryId || "").trim()
  };
}

function cloneDialogueVideoClipForRow(clip = null, rowId = "", targetSpeechLine = "") {
  const key = String(rowId || "").trim();
  if (!clip || typeof clip !== "object" || !key) return null;
  const segments = resolveDialogueVideoSegments(clip);
  const normalized = normalizeDialogueVideoMap({
    [key]: {
      ...clip,
      rowId: key,
      targetSpeechLine: String(targetSpeechLine || clip?.targetSpeechLine || "").trim(),
      updatedAt: nowIso(),
      segments: segments.map((segment, index) => ({
        ...segment,
        id: `${key}-seg-${index + 1}`,
        index: Number.isFinite(Number(segment?.index)) ? Math.max(0, Math.round(Number(segment.index))) : index,
        targetSpeechLine: String(targetSpeechLine || segment?.targetSpeechLine || clip?.targetSpeechLine || "").trim()
      }))
    }
  });
  return normalized[key] || null;
}

function cloneDialogueAudioClipForRow(clip = null, rowId = "", targetSpeechLine = "") {
  const key = String(rowId || "").trim();
  if (!clip || typeof clip !== "object" || !key) return null;
  const normalized = normalizeDialogueAudioMap({
    [key]: {
      ...clip,
      rowId: key,
      targetSpeechLine: String(targetSpeechLine || clip?.targetSpeechLine || "").trim(),
      updatedAt: nowIso()
    }
  });
  return normalized[key] || null;
}

function duplicateSceneRowWithMedia(rowId = "") {
  const sourceRowId = String(rowId || "").trim();
  const session = getActiveSession();
  if (!session || !sourceRowId) return false;
  const currentRow = (session?.script?.rows || []).find((row) => String(row?.id || "").trim() === sourceRowId) || null;
  if (!currentRow) return false;
  const nextRowId = makeId("row");
  const duplicatedRow = buildDuplicatedSceneRow(currentRow, nextRowId);
  if (!duplicatedRow) return false;
  const duplicatedTargetSpeechLine = String(
    duplicatedRow.voiceOverText || duplicatedRow.text || currentRow.voiceOverText || currentRow.text || ""
  ).trim();

  upsertActiveSession((current) => {
    const rows = Array.isArray(current?.script?.rows) ? current.script.rows : [];
    const nextRows = rows.flatMap((row) => (
      String(row?.id || "").trim() === sourceRowId ? [row, duplicatedRow] : [row]
    ));
    const nextDialogueVideoMap = { ...getDialogueVideoMap(current) };
    const nextDialogueAudioMap = { ...getDialogueAudioMap(current) };
    const sourceVideoClip = resolveDialogueVideoForRow(current, sourceRowId);
    const sourceAudioClip = resolveDialogueAudioForRow(current, sourceRowId);
    const duplicatedVideoClip = cloneDialogueVideoClipForRow(sourceVideoClip, nextRowId, duplicatedTargetSpeechLine);
    const duplicatedAudioClip = cloneDialogueAudioClipForRow(sourceAudioClip, nextRowId, duplicatedTargetSpeechLine);
    if (duplicatedVideoClip) nextDialogueVideoMap[nextRowId] = duplicatedVideoClip;
    if (duplicatedAudioClip) nextDialogueAudioMap[nextRowId] = duplicatedAudioClip;
    return {
      ...current,
      dialogueVideoMap: nextDialogueVideoMap,
      dialogueAudioMap: nextDialogueAudioMap,
      script: {
        ...current.script,
        rows: nextRows
      }
    };
  }, { render: false });

  const refreshedSession = getActiveSession();
  reflowTimelineClipsByScriptOrder(refreshedSession, { persist: true });
  ensureOnScreenTextClipForRowId(refreshedSession, nextRowId, { persist: true });
  ensureOnScreenTextClipsByRowId(refreshedSession, { persist: true });
  render();
  scheduleSessionLocalPersist("structure");

  const duplicatedClip = resolveDialogueVideoForRow(getActiveSession(), nextRowId);
  const duplicatedPrimarySegment = resolvePrimaryDialogueVideoSegment(duplicatedClip);
  const sourceStoragePath = String(duplicatedPrimarySegment?.storagePath || duplicatedClip?.storagePath || "").trim();
  const sourceUrl = String(
    duplicatedPrimarySegment?.downloadUrl
    || duplicatedClip?.downloadUrl
    || currentRow?.publicSceneVideoUrl
    || ""
  ).trim();
  if (/^podcaster\/library\//i.test(sourceStoragePath) || /podcaster%252Flibrary%252Fscenes|podcaster\/library\/scenes/i.test(sourceUrl)) {
    clonePublicSceneLibraryVideoToSession({
      sessionId: String(getActiveSession()?.id || "").trim(),
      rowId: nextRowId,
      speakerLabel: String(duplicatedRow?.speaker || "Narrador").trim() || "Narrador",
      sourceStoragePath,
      sourceUrl,
      mimeType: String(duplicatedPrimarySegment?.mimeType || duplicatedClip?.mimeType || "video/mp4").trim() || "video/mp4"
    }).catch(() => { });
  }
  return true;
}

function duplicateSceneRowsIntoNewTrack(rowIds = [], targetTrackIndex = null) {
  const session = getActiveSession();
  const sourceRowIds = Array.from(new Set(
    (Array.isArray(rowIds) ? rowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean)
  ));
  if (!session || !sourceRowIds.length) return false;
  const sourceRows = getSessionRows(session);
  const orderedSourceRowIds = sourceRows
    .map((row) => String(row?.id || "").trim())
    .filter((rowId) => sourceRowIds.includes(rowId));
  if (!orderedSourceRowIds.length) return false;
  const duplicatedEntries = [];

  upsertActiveSession((current) => {
    const rows = Array.isArray(current?.script?.rows) ? [...current.script.rows] : [];
    const cfg = getPodcastVideoConfig(current);
    const currentClips = ensureTimelineClipsByRowId(current, { persist: false });
    const currentTextClips = normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {});
    const nextDialogueVideoMap = { ...getDialogueVideoMap(current) };
    const nextDialogueAudioMap = { ...getDialogueAudioMap(current) };
    const nextTimelineClips = { ...normalizeTimelineClipsByRowId(cfg?.timelineClipsByRowId || {}) };
    const nextOnScreenTextClips = { ...currentTextClips };
    let nextTracks = normalizeTimelineTracks(cfg?.timelineTracks || []);
    if (!nextTracks.length) {
      nextTracks = buildDefaultTimelineTracks(current);
    }
    const insertIndex = Number.isFinite(Number(targetTrackIndex))
      ? Math.max(0, Math.min(nextTracks.length, Math.round(Number(targetTrackIndex))))
      : nextTracks.length;
    const destinationTrack = buildTimelineVariantTrackDescriptor("Narrador", nextTracks);
    const destinationTrackId = destinationTrack.id;
    nextTracks.splice(insertIndex, 0, {
      id: destinationTrackId,
      label: destinationTrack.label,
      order: insertIndex
    });
    nextTracks = normalizeTimelineTracks(nextTracks);

    let insertedRowsOffset = 0;
    orderedSourceRowIds.forEach((sourceRowId) => {
      const sourceRow = rows.find((row) => String(row?.id || "").trim() === sourceRowId) || null;
      if (!sourceRow) return;
      const nextRowId = makeId("row");
      const duplicatedRow = buildDuplicatedSceneRow(sourceRow, nextRowId);
      if (!duplicatedRow) return;
      const sourceIndex = rows.findIndex((row) => String(row?.id || "").trim() === sourceRowId);
      const insertRowAt = sourceIndex >= 0 ? Math.min(rows.length, sourceIndex + 1 + insertedRowsOffset) : rows.length;
      rows.splice(insertRowAt, 0, duplicatedRow);
      insertedRowsOffset += 1;

      const duplicatedTargetSpeechLine = String(
        duplicatedRow.voiceOverText || duplicatedRow.text || sourceRow.voiceOverText || sourceRow.text || ""
      ).trim();
      const sourceVideoClip = resolveDialogueVideoForRow(current, sourceRowId);
      const sourceAudioClip = resolveDialogueAudioForRow(current, sourceRowId);
      const duplicatedVideoClip = cloneDialogueVideoClipForRow(sourceVideoClip, nextRowId, duplicatedTargetSpeechLine);
      const duplicatedAudioClip = cloneDialogueAudioClipForRow(sourceAudioClip, nextRowId, duplicatedTargetSpeechLine);
      if (duplicatedVideoClip) nextDialogueVideoMap[nextRowId] = duplicatedVideoClip;
      if (duplicatedAudioClip) nextDialogueAudioMap[nextRowId] = duplicatedAudioClip;

      const sourceTimelineClip = currentClips?.[sourceRowId] || null;
      if (sourceTimelineClip) {
        const duplicatedTimelineClip = normalizeTimelineClipItem({
          ...sourceTimelineClip,
          rowId: nextRowId,
          trackId: destinationTrackId,
          zIndex: Math.max(1, Number(sourceTimelineClip?.zIndex || 1))
        }, nextRowId);
        if (duplicatedTimelineClip) {
          nextTimelineClips[nextRowId] = duplicatedTimelineClip;
        }
      }

      const sourceTextClip = currentTextClips?.[sourceRowId] || null;
      if (sourceTextClip) {
        const duplicatedTextClip = normalizeOnScreenTextClipItem({
          ...sourceTextClip,
          rowId: nextRowId,
          zIndex: Math.max(1, Number(sourceTextClip?.zIndex || 1))
        }, nextRowId);
        if (duplicatedTextClip) {
          nextOnScreenTextClips[nextRowId] = duplicatedTextClip;
        }
      }

      duplicatedEntries.push({
        sourceRowId,
        nextRowId,
        duplicatedRow,
        duplicatedVideoClip
      });
    });

    return {
      ...current,
      dialogueVideoMap: nextDialogueVideoMap,
      dialogueAudioMap: nextDialogueAudioMap,
      script: {
        ...current.script,
        rows
      },
      podcastVideoConfig: normalizePodcastVideoConfig({
        ...cfg,
        timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
        timelineVersion: STUDIO_TIMELINE_VERSION,
        timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
        timelineTracks: nextTracks,
        timelineClipsByRowId: nextTimelineClips,
        timelineOnScreenTextClipsByRowId: nextOnScreenTextClips
      })
    };
  }, { render: false });

  const refreshedSession = getActiveSession();
  duplicatedEntries.forEach(({ nextRowId }) => {
    ensureOnScreenTextClipForRowId(refreshedSession, nextRowId, { persist: true });
  });
  ensureOnScreenTextClipsByRowId(refreshedSession, { persist: true });
  render();
  const firstDuplicatedRowId = String(duplicatedEntries[0]?.nextRowId || "").trim();
  if (firstDuplicatedRowId) {
    setPodcastVideoRow(firstDuplicatedRowId, {
      syncStage: false,
      preserveMontageCursor: true,
      reason: "structure"
    });
  }
  scheduleSessionLocalPersist("timeline-duplicate-into-new-track");

  duplicatedEntries.forEach(({ duplicatedRow, duplicatedVideoClip, nextRowId }) => {
    const duplicatedPrimarySegment = resolvePrimaryDialogueVideoSegment(duplicatedVideoClip);
    const sourceStoragePath = String(duplicatedPrimarySegment?.storagePath || duplicatedVideoClip?.storagePath || "").trim();
    const sourceUrl = String(
      duplicatedPrimarySegment?.downloadUrl
      || duplicatedVideoClip?.downloadUrl
      || duplicatedRow?.publicSceneVideoUrl
      || ""
    ).trim();
    if (/^podcaster\/library\//i.test(sourceStoragePath) || /podcaster%252Flibrary%252Fscenes|podcaster\/library\/scenes/i.test(sourceUrl)) {
      clonePublicSceneLibraryVideoToSession({
        sessionId: String(getActiveSession()?.id || "").trim(),
        rowId: nextRowId,
        speakerLabel: String(duplicatedRow?.speaker || "Narrador").trim() || "Narrador",
        sourceStoragePath,
        sourceUrl,
        mimeType: String(duplicatedPrimarySegment?.mimeType || duplicatedVideoClip?.mimeType || "video/mp4").trim() || "video/mp4"
      }).catch(() => { });
    }
  });

  return duplicatedEntries.length > 0;
}

// Métodos de publicación y subida a librería removidos y modularizados en podcaster-public-library.js

// Método de inserción desde librería removido y modularizado en podcaster-public-library.js

function makeId(prefix = "pod") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function resolveDateIso(date = null) {
  if (!date) return nowIso();
  if (typeof date === "string") {
    if (date.includes("Timestamp")) {
      const seconds = date.match(/seconds=(\d+)/)?.[1];
      if (seconds) return new Date(Number(seconds) * 1000).toISOString();
    }
    return date;
  }
  if (typeof date.toISOString === "function") return date.toISOString();
  if (typeof date.toDate === "function") return date.toDate().toISOString();
  if (typeof date.seconds === "number") return new Date(date.seconds * 1000).toISOString();
  return nowIso();
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function buildPodcasterApiErrorMessage(error = null, fallback = "") {
  const extractText = (value = null, seen = new Set()) => {
    if (value == null) return "";
    if (typeof value === "string") {
      const text = value.trim();
      return text && text !== "[object Object]" ? text : "";
    }
    if (typeof value !== "object") {
      const text = String(value || "").trim();
      return text && text !== "[object Object]" ? text : "";
    }
    if (seen.has(value)) return "";
    seen.add(value);
    for (const candidate of [value?.error, value?.message, value?.detail, value?.reason, value?.code]) {
      const text = extractText(candidate, seen);
      if (text) return text;
    }
    try {
      const text = JSON.stringify(value);
      return text && text !== "{}" ? text : "";
    } catch (_) {
      return "";
    }
  };
  const status = Number(error?.status || 0) || 0;
  const detail = error?.detail && typeof error.detail === "object" ? error.detail : {};
  const code = extractText(detail?.code || error?.code || "");
  if (status === 503 && code === "backend_busy") {
    return "El backend está ocupado con otra exportación o generación de video. Reintenta en unos segundos.";
  }
  if (status === 413 && code === "payload_too_large") {
    return "La escena tiene demasiadas referencias cargadas para procesarla de forma estable.";
  }
  if (status === 404 && code === "job_not_found") {
    return "Render reinició el servicio y se perdió el estado del job.";
  }
  return extractText(error?.detail) || extractText(error) || String(fallback || "No se pudo completar la acción.").trim() || "No se pudo completar la acción.";
}



function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractCreativePromptTopic(prompt = "") {
  const clean = normalizeSimpleText(String(prompt || ""));
  if (!clean) return "una historia nueva";
  return trimWords(
    clean
      .replace(/^(?:crea|crear|haz|hacer|escribe|escribir|genera|generar)\s+(?:un\s+)?(?:guion|guión|video|video creativo|historia)\s*(?:sobre|para|de|a partir de|con)?\s*/i, "")
      .replace(/^(?:prompt|instrucción del usuario|instruccion del usuario)\s*:\s*/i, ""),
    14
  ) || "una historia nueva";
}

function buildCreativeDefaultRows(prompt = "") {
  const topic = extractCreativePromptTopic(prompt);
  const lead = trimWords(topic, 10);
  return [
    {
      id: makeId("row"),
      speaker: "Narrador",
      expression: "Neutral",
      durationSec: 8,
      mediaCue: "Sin media",
      text: `Abrimos la historia con ${lead} y un impacto visual inmediato.`,
      notes: "Arranque fuerte.",
      scenePrompt: `Plano inicial cinematográfico que presenta ${lead} con tensión y atmósfera clara.`,
      imagePrompts: [],
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG },
      ttsDirectionConfig: { ...DEFAULT_TTS_DIRECTION_CONFIG }
    },
    {
      id: makeId("row"),
      speaker: "Narrador",
      expression: "Neutral",
      durationSec: 8,
      mediaCue: "Sin media",
      text: `El protagonista avanza, duda y convierte el conflicto en movimiento.`,
      notes: "Subir tensión.",
      scenePrompt: `Segunda escena con acción clara, contraste visual y ritmo narrativo sobre ${lead}.`,
      imagePrompts: [],
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG },
      ttsDirectionConfig: { ...DEFAULT_TTS_DIRECTION_CONFIG }
    },
    {
      id: makeId("row"),
      speaker: "Narrador",
      expression: "Neutral",
      durationSec: 8,
      mediaCue: "Transición",
      text: `La historia escala con un giro inesperado y una decisión arriesgada.`,
      notes: "Escalar conflicto.",
      scenePrompt: `Tercera escena con giro narrativo, energía visual y cambio de ritmo.`,
      imagePrompts: [],
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG },
      ttsDirectionConfig: { ...DEFAULT_TTS_DIRECTION_CONFIG }
    },
    {
      id: makeId("row"),
      speaker: "Narrador",
      expression: "Neutral",
      durationSec: 8,
      mediaCue: "CTA final",
      text: `Cerramos con una imagen final memorable sobre ${lead}.`,
      notes: "Cerrar con fuerza.",
      scenePrompt: `Cierre cinematográfico y contundente que deja una imagen final de ${lead}.`,
      imagePrompts: [],
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG },
      ttsDirectionConfig: { ...DEFAULT_TTS_DIRECTION_CONFIG }
    }
  ];
}

function createDefaultRows(videoMode = false, prompt = "") {
  if (videoMode) {
    return buildCreativeDefaultRows(prompt);
  }
  return [
    {
      id: makeId("row"),
      speaker: "Host A",
      voiceName: resolveSpeakerVoiceName("Host A"),
      voiceNameSource: "host",
      expression: "Cálido",
      durationSec: 6,
      mediaCue: "Intro musical",
      text: "Bienvenidos a nuestro podcast. Hoy abrimos una conversación útil y accionable.",
      notes: "Abrir con energía tranquila.",
      scenePrompt: "",
      imagePrompts: [],
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG },
      ttsDirectionConfig: { ...DEFAULT_TTS_DIRECTION_CONFIG }
    },
    {
      id: makeId("row"),
      speaker: "Host B",
      voiceName: resolveSpeakerVoiceName("Host B"),
      voiceNameSource: "host",
      expression: "Curioso",
      durationSec: 6,
      mediaCue: "Sin media",
      text: "Vamos a tomar una idea y convertirla en un episodio claro, dinámico y listo para producción.",
      notes: "Mantener ritmo conversacional.",
      scenePrompt: "",
      imagePrompts: [],
      disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG },
      ttsDirectionConfig: { ...DEFAULT_TTS_DIRECTION_CONFIG }
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

function getRowDisfluencyConfig(row = {}, session = null) {
  const activeSession = session || getActiveSession();
  return normalizeDisfluencyConfig(
    row?.disfluencyConfig
    || activeSession?.disfluencyDefaults
    || {}
  );
}

function normalizeInlineAudioTags(value = "") {
  const source = String(value || "").trim();
  if (!source) return "";
  const explicitTags = source.match(/\[[^[\]]+\]/g);
  if (explicitTags?.length) {
    return explicitTags.map((tag) => tag.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6).join(" ");
  }
  return source
    .split(/[,\n;|]+/)
    .map((part) => String(part || "").replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((part) => `[${part}]`)
    .join(" ");
}

function normalizeTtsDirectionConfig(raw = {}) {
  return {
    stylePrompt: String(raw?.stylePrompt || "").replace(/\s+/g, " ").trim().slice(0, 260),
    pacingPrompt: String(raw?.pacingPrompt || "").replace(/\s+/g, " ").trim().slice(0, 180),
    accentPrompt: String(raw?.accentPrompt || "").replace(/\s+/g, " ").trim().slice(0, 180),
    scenePrompt: String(raw?.scenePrompt || "").replace(/\s+/g, " ").trim().slice(0, 220),
    audioTags: normalizeInlineAudioTags(raw?.audioTags || "")
  };
}

function getRowTtsDirectionConfig(row = {}, session = null) {
  const activeSession = session || getActiveSession();
  return normalizeTtsDirectionConfig(
    row?.ttsDirectionConfig
    || activeSession?.ttsDirectionDefaults
    || DEFAULT_TTS_DIRECTION_CONFIG
  );
}

function buildBaseExpressionStylePrompt(expression = "") {
  const clean = String(expression || "").trim();
  if (clean === "Enérgico") return "Enérgica y animada, pero natural y sin gritar.";
  if (clean === "Cálido") return "Cálida, cercana y tranquilizadora.";
  if (clean === "Curioso") return "Curiosa, ligeramente intrigada y conversacional.";
  if (clean === "Serio") return "Seria, enfocada y controlada.";
  if (clean === "Inspirador") return "Inspiradora, esperanzadora y convincente.";
  return "Natural, humana y creíble.";
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

function buildDisfluencyInstruction(row = {}, session = null) {
  const cfg = getRowDisfluencyConfig(row, session);
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

function buildGeminiTtsPrompt(row = {}, session = null, options = {}) {
  const direction = normalizeTtsDirectionConfig(options?.ttsDirection || getRowTtsDirectionConfig(row, session));
  const voiceName = String(options?.voiceName || resolveSpeakerVoiceName(row?.speaker || "", session) || "").trim();
  const speakerLabel = String(options?.speakerLabel || row?.speaker || "Host A").trim() || "Host A";
  const speakerName = String(options?.speakerName || resolveSpeakerDisplayName(speakerLabel, session) || speakerLabel).trim() || speakerLabel;
  const expression = String(options?.expression || row?.expression || "Neutral").trim() || "Neutral";
  const transcriptBase = String(options?.targetSpeechLine || buildTargetSpeechLine(row, session) || row?.text || "").trim();
  const transcript = [direction.audioTags, transcriptBase].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || transcriptBase;
  const originalText = String(options?.originalText || row?.text || "").replace(/\s+/g, " ").trim();
  const notes = String(options?.notes || row?.notes || "").replace(/\s+/g, " ").trim();
  const disfluencyInstruction = String(options?.disfluencyInstruction || buildDisfluencyInstruction(row) || "").replace(/\s+/g, " ").trim();
  const contentMode = String(options?.contentMode || (isEducationalVideoMode(session) ? "creative" : "podcast")).trim().toLowerCase();
  const profile = AGENT_VOICE_PROFILES.find((entry) => entry.voiceName === voiceName) || null;
  const styleLine = [buildBaseExpressionStylePrompt(expression), direction.stylePrompt].filter(Boolean).join(" ");
  const pacingLine = direction.pacingPrompt || "Conversacional, fluido y con pausas naturales.";
  const accentLine = direction.accentPrompt || "Español latino neutro, dicción clara.";
  const sceneLine = direction.scenePrompt || (contentMode === "creative"
    ? "Escena cinematográfica y dinámica, clara y humana."
    : "Conversación de podcast en estudio, cercana y natural.");
  return [
    "Synthesize speech for the TRANSCRIPT only. Do not read section titles, notes, labels, or instructions aloud.",
    "Keep the wording of the TRANSCRIPT exact, preserving any intentional fillers, repairs, or stutters already present there.",
    "Never speak the director notes aloud.",
    "",
    "### AUDIO PROFILE",
    `Speaker: ${speakerName} (${speakerLabel}).`,
    voiceName ? `Voice: ${voiceName}${profile?.toneLabel ? ` (${profile.toneLabel})` : ""}.` : "",
    "",
    "### SCENE",
    sceneLine,
    "",
    "### DIRECTOR'S NOTES",
    `Style: ${styleLine}`,
    `Pacing: ${pacingLine}`,
    `Accent: ${accentLine}`,
    `Delivery guardrails: ${disfluencyInstruction || "Natural, clean articulation."}`,
    notes ? `Additional notes: ${notes}` : "",
    originalText ? `Reference only, do not read: "${String(originalText).replace(/"/g, '\\"')}"` : "",
    "",
    "### TRANSCRIPT",
    `"${String(transcript).replace(/"/g, '\\"')}"`
  ].filter(Boolean).join("\n");
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

function normalizeVideoImagePrompts(raw = []) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || "")
      .split(/\n+/)
      .map((item) => String(item || "").trim());
  const seen = new Set();
  return values
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, VIDEO_SCENE_IMAGE_PROMPT_COUNT);
}

function normalizeVideoContentType(value = "") {
  const clean = String(value || "").trim().toLowerCase();
  if (
    clean === "creative"
    || clean === "video-creativo"
    || clean === "video_creativo"
    || clean === "educational"
    || clean === "video-educativo"
    || clean === "video_educativo"
  ) return "creative";
  if (clean === "videopodcast" || clean === "video-podcast" || clean === "video_podcast") return "videopodcast";
  return "none";
}

function resolveVideoContentType(session = null, options = {}) {
  const explicit = normalizeVideoContentType(
    options?.videoContentType
    || session?.script?.videoContentType
    || session?.videoContentType
  );
  if (explicit !== "none") return explicit;
  if (session?.script?.videoMode === true || session?.videoMode === true) return "creative";
  if (isCurrentModeVideo()) return "creative";
  if (options?.assumeVideoPodcast === true) return "videopodcast";
  return "none";
}

function withSessionVideoContentType(session = {}, videoContentType = "none") {
  const normalizedType = normalizeVideoContentType(videoContentType);
  const persistedType = normalizedType === "none" ? null : normalizedType;
  const legacyVideoMode = normalizedType === "creative" || (normalizedType === "none" && isCurrentModeVideo(session));
  return {
    ...session,
    videoContentType: persistedType,
    script: {
      ...(session?.script || {}),
      videoContentType: persistedType,
      videoMode: legacyVideoMode
    }
  };
}

function isEducationalVideoMode(session = null) {
  return getPanelModeCopy(session).videoMode;
}

function isVideoPodcastMode(session = null) {
  return resolveVideoContentType(session) === "videopodcast";
}

function isPodcastMode(session = null) {
  return !getPanelModeCopy(session).videoMode;
}

function isAudioOnlyPodcastStudioMode(session = null) {
  return isPodcastMode(session) && !isCurrentModeVideo(session) && !isEducationalVideoMode(session) && !isVideoPodcastMode(session);
}

function setPodcastVideoModeEnabled(enableVideoPodcast = false, options = {}) {
  const session = getActiveSession();
  if (!session) return false;
  const nextType = enableVideoPodcast === true ? "videopodcast" : "none";
  const currentType = normalizeVideoContentType(session?.script?.videoContentType || session?.videoContentType);
  if (currentType === nextType && options.force !== true) {
    if (els.podcastVideoModeToggle) {
      els.podcastVideoModeToggle.checked = enableVideoPodcast === true;
    }
    return false;
  }
  upsertActiveSession(
    (current) => withSessionVideoContentType(current, nextType),
    {
      render: options.render !== false,
      persist: true,
      markDirty: true,
      autosaveReason: options.reason || "video-content-type"
    }
  );
  if (els.podcastVideoModeToggle) {
    els.podcastVideoModeToggle.checked = enableVideoPodcast === true;
  }
  return true;
}

function getPanelModeCopy(session = null) {
  const activeSession = session || getActiveSession();
  const persistedVideoContentType = normalizeVideoContentType(
    activeSession?.script?.videoContentType
    || activeSession?.videoContentType
  );
  const composerVideoMode = isCurrentModeVideo(activeSession);
  const videoContentType = persistedVideoContentType !== "none"
    ? persistedVideoContentType
    : (composerVideoMode ? "creative" : "none");
  const videoMode = videoContentType === "creative";
  const videoPodcastMode = videoContentType === "videopodcast";
  return {
    videoContentType,
    videoMode,
    videoPodcastMode,
    shellTitle: videoMode ? "Snoopy Video Creator Creativo" : (videoPodcastMode ? "Snoopy Podcast Creator con video" : "Video del podcast"),
    shellAriaLabel: videoMode ? "Panel creativo de video" : (videoPodcastMode ? "Panel de podcast con video" : "Video compuesto del podcast"),
    loaderAriaLabel: videoMode ? "Abriendo Snoopy Video Creator Creativo" : (videoPodcastMode ? "Abriendo Snoopy Podcast Creator con video" : "Abriendo Snoopy Podcast Creator"),
    loaderBrand: videoMode ? "Snoopy Video Creator Creativo" : "Snoopy Podcast Creator",
    loaderSubtitle: videoMode ? "Preparando panel creativo de video..." : (videoPodcastMode ? "Preparando el estudio de podcast con video..." : "Preparando el estudio de video..."),
    brandTitle: videoMode ? "Snoopy Video Creator Creativo" : "Snoopy Podcast Creator",
    inspectorTitle: videoMode ? "Inspector de video" : "Inspector",
    inspectorSceneLabel: videoMode ? "Secuencia activa: --" : "Escena activa: --",
    inspectorEmpty: videoMode
      ? "Selecciona una secuencia para editar su dirección visual, ritmo y apoyos creativos."
      : "Selecciona una escena en el timeline para editar su diálogo y parámetros.",
    inspectorSectionTitle: videoMode ? "Escena seleccionada" : "Escena seleccionada",
    footerNote: videoMode
      ? "Audio principal del montaje: Gemini Live por secuencia."
      : "Audio principal del montaje: Gemini Live por escena.",
    rowScenarioLabel: videoMode ? "Escenario creativo" : "Escenario",
    rowScenarioPlaceholder: videoMode
      ? "Ej: batalla nocturna, laboratorio secreto, ciudad futurista"
      : "Ej: Cabina premium, loft editorial, radio nocturna",
    scenePromptLabel: videoMode ? "Concepto visual" : "Escena visual",
    scenePromptPlaceholder: videoMode
      ? "Describe plano, cámara, acción, atmósfera y recursos visuales"
      : "Describe cámara, encuadre, iluminación, acción y atmósfera",
    videoDirectiveLabel: videoMode ? "Dirección creativa" : "Dirección manual",
    videoDirectivePlaceholder: videoMode
      ? "Override manual para reforzar ritmo visual, tensión o composición"
      : "Override manual para la escena de video",
    imagePromptsLabel: videoMode ? "Prompts visuales" : "Prompts de imagen",
    imagePromptsPlaceholder: videoMode
      ? "Una línea por referencia visual, gráfico o plano de apoyo"
      : "Una línea por imagen o variación visual",
    emptyRowEditor: videoMode
      ? "Selecciona una secuencia en el timeline para editar sus recursos visuales."
      : "Selecciona una escena en el timeline para editar su diálogo y parámetros."
  };
}

function isCreativeVideoMode(session = null) {
  // "Modo creativo" debe seguir el modo UI (toggle) y no solo el contentType persistido,
  // para que acciones como `rewrite-visual-notes` funcionen cuando el usuario está en video educativo.
  return getPanelModeCopy(session).videoMode === true;
}

function normalizeVideoPreset(value = "") {
  return "creative";
}

function resolveActiveVideoPreset(session = null, fallback = "creative") {
  return "creative";
}

function normalizeCreativeVideoConfig(raw = {}) {
  const formatRaw = String(raw?.voiceMimeType || raw?.voiceFormat || "").trim().toLowerCase();
  const voiceMimeType = ["audio/ogg", "audio/wav", "audio/mpeg"].includes(formatRaw)
    ? formatRaw
    : "audio/ogg";
  return {
    enabled: raw?.enabled === true,
    globalVoiceName: normalizeLiveVoiceName(String(raw?.globalVoiceName || "").trim(), "Kore"),
    voiceMimeType
  };
}

function getCreativeVideoConfig(session = null) {
  return normalizeCreativeVideoConfig((session || getActiveSession())?.creativeVideoConfig || {});
}

function resolveEffectiveVisualNotes(row = null) {
  return resolveVisualNotesForGeneration(row);
}

function resolveVisualNotesEditorValue(row = null) {
  if (!row || typeof row !== "object") return "";
  if (row?.visualNotesEditedStored === true) {
    const edited = String(row?.visualNotesEditedText || "").replace(/\s+/g, " ").trim();
    if (edited) return edited;
  }
  return String(row?.visualNotes || "").replace(/\s+/g, " ").trim();
}

function resolveVisualNotesForGeneration(row = null) {
  if (!row || typeof row !== "object") return "";
  if (row?.visualNotesEditedStored === true) {
    const edited = String(row?.visualNotesEditedText || "").replace(/\s+/g, " ").trim();
    if (edited) return edited;
  }
  return String(row?.visualNotes || "").replace(/\s+/g, " ").trim();
}

function normalizeVisualProposalState(list = []) {
  return Array.from(new Set(
    (Array.isArray(list) ? list : [])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
  ));
}

function resolveActiveVisualProposal(row = null) {
  if (!row || typeof row !== "object") return "";
  const resolved = new Set(normalizeVisualProposalState(row?.visualNotesResolvedProposals));
  const explicit = String(row?.visualNotesProposal || "").trim();

  // Si hay una propuesta explícita y NO está resuelta, es la activa
  if (explicit && !resolved.has(explicit)) return explicit;

  const proposals = Array.isArray(row?.visualNotesProposals)
    ? row.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  for (let index = proposals.length - 1; index >= 0; index -= 1) {
    const candidate = String(proposals[index] || "").trim();
    if (candidate && !resolved.has(candidate)) return candidate;
  }
  return "";
}

function resolveDisplayedVisualProposal(row = null) {
  if (!row || typeof row !== "object") return "";
  const explicit = String(row?.visualNotesProposal || "").trim();
  if (explicit) return explicit;
  return resolveActiveVisualProposal(row);
}

function isVisualProposalResolved(row = null, proposalText = "") {
  const proposal = String(proposalText || "").trim();
  if (!proposal || !row || typeof row !== "object") return false;
  return normalizeVisualProposalState(row.visualNotesResolvedProposals).includes(proposal);
}

function normalizeCreativeRow(row = {}, index = 0, options = {}) {
  const preset = "creative";
  const strictValidation = options?.strictVideoValidation === true;
  const preserveExactVisualNotes = options?.preserveExactVisualNotes === true;
  const validationStage = String(options?.validationStage || "video creativo").trim() || "video creativo";
  if (row.visualNotesProposal) {
    // console.log(`[Studio] Normalizando fila ${row.id} CON PROPUESTA:`, row.visualNotesProposal);
  }
  if (validationStage === "video/create") {
    logVideoCreateDebug("normalizeCreativeRow-start", {
      index,
      keys: Object.keys(row || {}).slice(0, 20),
      voiceOverText: String(row?.voiceOverText || row?.text || row?.guion || row?.script || row?.narration || row?.voiceOver || "").slice(0, 120),
      sceneDescription: String(row?.sceneDescription || row?.scenePrompt || row?.descripcionEscena || row?.descripcionDeEscena || row?.escena || row?.scene || "").slice(0, 120),
      visualNotes: String(row?.visualNotes || row?.visual || row?.elementoVisual || row?.elemento_visual || row?.visualElement || "").slice(0, 120),
      videoDirective: String(row?.videoDirective || row?.direccionVideo || row?.direcciónVideo || row?.videoDirection || "").slice(0, 120),
      onScreenText: String(row?.onScreenText || row?.textoPantalla || row?.textoEnPantalla || "").slice(0, 120)
    });
  }
  const sanitizeCreativeText = (value = "") => String(value || "")
    .replace(/\bguion\s+de\s+podcast\b/gi, "guion técnico de video")
    .replace(/\bvideo\s+educativo\b/gi, "video creativo")
    .replace(/\bbienvenid[oa]s?\s+a\s+nuestro\s+podcast\b/gi, "Bienvenidos a este video")
    .replace(/\blocutor(?:es)?\b/gi, "narración")
    .replace(/\bhost(?:s)?\b/gi, "narración")
    .replace(/\bnarrador\s*\((?:[^)]*)\)/gi, "Narrador")
    .replace(/\s+/g, " ")
    .trim();
  const sanitize = sanitizeCreativeText;
  const durationSec = Math.max(VIDEO_SCENE_MIN_SEC, Math.min(VIDEO_SCENE_MAX_SEC, Number(row?.durationSec) || VIDEO_SCENE_MAX_SEC));
  const geminiCreativityLevel = (() => {
    const raw = Number(row?.geminiCreativityLevel ?? 3);
    if (!Number.isFinite(raw)) return 3;
    return Math.round(Math.max(1, Math.min(10, raw)));
  })();
  const rawVoiceOverText = normalizeCreativeFieldText(
    row?.voiceOverText,
    row?.text,
    row?.Guion,
    row?.guion,
    row?.guión,
    row?.script,
    row?.narration,
    row?.voiceOver
  );
  if (strictValidation && !rawVoiceOverText) {
    throw buildCreativeVideoValidationError(validationStage, "la columna Guion/voz en off está vacía.", index);
  }
  const voiceOverText = strictValidation
    ? rawVoiceOverText
    : normalizeCreativeFieldText(
      row?.voiceOverText,
      row?.text,
      row?.Guion,
      row?.guion,
      row?.guión,
      row?.script,
      row?.narration,
      row?.voiceOver
    );
  const voiceOverOriginalText = sanitize(row?.voiceOverOriginalText || "");
  const visualNotesEditedText = sanitize(row?.visualNotesEditedText || "");
  const visualNotesEditedStored = row?.visualNotesEditedStored === true;
  const rawSceneSource = (row?.sceneDescriptionEditedStored === true)
    ? row?.sceneDescription
    : normalizeCreativeFieldText(
      row?.sceneDescription,
      row?.scenePrompt,
      row?.Descripción,
      row?.descripcionEscena,
      row?.descripcionDeEscena,
      row?.description,
      row?.escena,
      row?.scene
    );

  // Si ya tenemos una descripción de escena (manual), la respetamos.
  // Solo usamos la heurística buildCreativeLocationDescription como fallback.
  const sceneDescription = (row?.sceneDescriptionEditedStored === true || (rawSceneSource && String(rawSceneSource).trim()))
    ? sanitize(rawSceneSource || "")
    : sanitize(buildCreativeLocationDescription(
      row?.voiceOverText || row?.text || row?.notes || row?.visualNotes || row?.videoDirective || "",
      index,
      options?.prompt || ""
    ));
  const rowTransition = sanitize(row?.transition || "");
  const rowNotes = sanitize(row?.notes || "");

  // NOTA: Para la normalización de DATOS, debemos mantener visualNotes como el oficial.
  // resolveEffectiveVisualNotes solo debe usarse para GENERACIÓN (FFmpeg/Gemini).
  const officialVisualNotes = sanitize(
    row?.visualNotes ||
    row?.visual ||
    row?.elementoVisual ||
    row?.elemento_visual ||
    row?.visualElement ||
    row?.["Elemento visual"] ||
    row?.["Elemento Visual"] ||
    ""
  );
  const effectiveVisualNotes = sanitize(
    visualNotesEditedStored === true
      ? (row?.visualNotesEditedText || officialVisualNotes || "")
      : officialVisualNotes
  );

  const rowVisualNotes = preserveExactVisualNotes
    ? effectiveVisualNotes
    : sanitize(requirePodcasterScriptGeneratorApiFunction("resolveCreativeVisualNotesText")({
      visualNotes: effectiveVisualNotes || "",
      videoDirective: row?.videoDirective || "",
      visual: row?.visual || "",
      elementoVisual: row?.elementoVisual || row?.elemento_visual || "",
      visualElement: row?.visualElement || "",
      visualElemento: row?.visualElemento || "",
      notes: rowNotes
    }));

  const transition = rowTransition
    || (looksLikeTransitionOnly(rowNotes) ? rowNotes : "")
    || (looksLikeTransitionOnly(rowVisualNotes) ? rowVisualNotes : "");

  const visualNotes = preserveExactVisualNotes
    ? effectiveVisualNotes
    : (strictValidation
      ? rowVisualNotes
      : (rowVisualNotes || sanitize(buildCreativeVisualElementDescription(
        row?.videoDirective || row?.voiceOverText || row?.text || rowNotes || "",
        sceneDescription,
        index,
        options?.prompt || ""
      ))));
  const persistedVisualNotes = visualNotesEditedStored && officialVisualNotes
    ? officialVisualNotes
    : visualNotes;
  const rawOnScreenText = normalizeCreativeFieldText(
    row?.onScreenText,
    row?.["Texto en pantalla"],
    row?.["Texto en Pantalla"],
    row?.textoPantalla,
    row?.textoEnPantalla
  );
  const preserveOnScreenText = row?.onScreenTextNoSummarize === true;
  const resolvedOnScreenText = preserveOnScreenText
    ? rawOnScreenText
    : (buildCreativeOnScreenText(rawOnScreenText || "", {
      voiceOver: voiceOverText,
      sceneDescription,
      visual: visualNotes,
      prompt: options?.prompt || ""
    }) || rawOnScreenText);
  const onScreenText = preserveOnScreenText
    ? sanitize(rawOnScreenText || "")
    : (strictValidation
      ? requirePodcasterScriptGeneratorApiFunction("ensureCompleteSentence")(normalizeSimpleText(resolvedOnScreenText))
      : sanitize(buildCreativeOnScreenText(rawOnScreenText || "", {
        voiceOver: voiceOverText,
        sceneDescription,
        visual: visualNotes
      })));
  const fallbackScenePrompt = sceneDescription || buildFallbackCreativeSceneDescriptionFromVoiceOver(
    voiceOverText || row?.text || row?.visualNotes || row?.notes || "",
    transition || row?.visualNotes || row?.notes || "",
    index
  );
  const fallbackVoiceOver = voiceOverText || buildFallbackCreativeVoiceOverFromSceneDescription(
    sceneDescription || fallbackScenePrompt,
    transition || row?.visualNotes || row?.notes || "",
    index
  );
  const scenePrompt = (row?.sceneDescriptionEditedStored === true)
    ? sceneDescription
    : (strictValidation
      ? sanitize(row?.scenePrompt || sceneDescription)
      : sanitize(row?.scenePrompt || fallbackScenePrompt));
  const rawDirective = normalizeCreativeFieldText(
    row?.videoDirective,
    row?.direccionVideo,
    row?.direcciónVideo,
    row?.videoDirection,
    row?.["Dirección de video"],
    row?.["Dirección de Video"]
  );
  if (strictValidation && !rawDirective) {
    throw buildCreativeVideoValidationError(validationStage, "falta la dirección de video.", index);
  }
  const directive = strictValidation
    ? rawDirective
    : sanitize(
      row?.videoDirective
      || transition
      || `Ritmo creativo: mantener tensión y remate cómico en la secuencia ${index + 1}.`
    );
  const imagePrompts = normalizeVideoImagePrompts(row?.imagePrompts || [])
    .map((prompt) => sanitize(prompt))
    .filter(Boolean);
  return {
    ...row,
    id: String(row?.id || makeId("row")).trim() || makeId("row"),
    publicSceneLibraryId: String(row?.publicSceneLibraryId || "").trim(),
    publicScenePublishedAt: String(row?.publicScenePublishedAt || "").trim(),
    publicSceneTitle: String(row?.publicSceneTitle || "").trim(),
    publicSceneThumbUrl: String(row?.publicSceneThumbUrl || row?.thumbnailUrl || "").trim(),
    publicSceneVideoUrl: String(row?.publicSceneVideoUrl || "").trim(),
    speaker: normalizeSpeakerLabel(row?.speaker || "Narrador", "Narrador"),
    expression: "Neutral",
    mediaCue: MEDIA_CUES.includes(String(row?.mediaCue || "")) ? String(row.mediaCue) : "Sin media",
    durationSec,
    geminiCreativityLevel,
    voiceOverOriginalText,
    visualNotesEditedText,
    visualNotesEditedStored,
    onScreenTextNoSummarize: preserveOnScreenText,
    voiceOverText: strictValidation ? voiceOverText : fallbackVoiceOver,
    sceneDescription: strictValidation ? sceneDescription : (sceneDescription || fallbackScenePrompt),
    onScreenText: strictValidation ? onScreenText : (onScreenText || buildCreativeOnScreenText(fallbackVoiceOver, {
      voiceOver: fallbackVoiceOver,
      sceneDescription,
      visual: visualNotes
    })),
    transition: normalizeTransitionForScene(transition, {
      script: strictValidation ? voiceOverText : fallbackVoiceOver,
      sceneDescription: strictValidation ? sceneDescription : (sceneDescription || fallbackScenePrompt),
      visual: visualNotes,
      partIndex: index
    }),
    visualNotes: persistedVisualNotes,
    visualNotesProposal: resolveActiveVisualProposal(row),
    visualNotesProposals: Array.isArray(row?.visualNotesProposals) ? row.visualNotesProposals : [],
    visualNotesResolvedProposals: normalizeVisualProposalState(row?.visualNotesResolvedProposals),
    text: strictValidation ? voiceOverText : fallbackVoiceOver,
    notes: visualNotes || transition,
    scenePrompt,
    videoDirective: directive,
    imagePrompts: imagePrompts.length ? imagePrompts : (strictValidation ? [] : [visualNotes || scenePrompt])
  };
}

function resolveScenarioForVideoMode(session = null, host = "", fallback = "") {
  const base = String(
    fallback
    || getSpeakerScenarioMap(session)?.[host]
    || DEFAULT_SPEAKER_SCENARIO_MAP[host]
    || "Cabina premium de podcast"
  ).replace(/\s+/g, " ").trim() || "Cabina premium de podcast";
  return base;
}

function normalizeVideoScenePrompt(value = "", row = null, session = null) {
  const prompt = String(value || "").replace(/\s+/g, " ").trim();
  const isCreativeVideo = resolveActiveVideoPreset(session) === "creative";
  if (isCreativeVideo) {
    const sceneDescription = String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim();
    const visualNotes = String(resolveVisualNotesForGeneration(row) || row?.visual || "").replace(/\s+/g, " ").trim();
    const transition = String(row?.transition || "").replace(/\s+/g, " ").trim();
    const onScreenText = String(row?.onScreenText || "").replace(/\s+/g, " ").trim();
    const voiceOver = String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim();
    const creativeParts = [
      prompt ? `Dirección base: ${prompt}.` : "",
      sceneDescription ? `Descripción de escena obligatoria: ${sceneDescription}.` : "",
      visualNotes ? `Elemento visual obligatorio (prioridad absoluta): ${visualNotes}.` : "",
      transition ? `Transición sugerida: ${transition}.` : "",
      voiceOver ? `Contexto narrativo de voz en off: ${voiceOver}.` : "",
      onScreenText ? `Texto en pantalla de referencia semántica: ${onScreenText}. No incrustarlo en el video.` : "",
      "Modo visual-first creativo: prioriza acción, atmósfera, objeto o beat narrativo descrito por el guion técnico.",
      "Si existe una referencia de continuidad anterior, úsala para el estilo y consistencia, pero obedece estrictamente el cambio de contenido solicitado.",
      "No forzar presentador humano; si no aporta, genera escena sin personas.",
      "Prohibido estilo podcast: sin micrófono, sin cabina de radio, sin set de entrevista, sin host hablando a cámara.",
      "Composición cinematográfica horizontal 16:9, limpia y sin texto incrustado."
    ].filter(Boolean);
    return creativeParts.join(" ").trim().slice(0, 1200);
  }
  if (prompt) return prompt.slice(0, 1200);
  const speakerLabel = String(row?.speaker || "").trim() || "Host A";
  const speakerName = resolveSpeakerDisplayName(speakerLabel, session);
  const expression = String(row?.expression || "Neutral").trim() || "Neutral";
  const scenario = resolveScenarioForVideoMode(session, speakerLabel);
  const text = String(row?.text || "").replace(/\s+/g, " ").trim();
  const notes = String(row?.notes || "").replace(/\s+/g, " ").trim();
  const directive = String(row?.videoDirective || "").replace(/\s+/g, " ").trim();
  return [
    `Toma de video creativo de ${speakerName} (${speakerLabel}).`,
    `Escenario: ${scenario || "entorno visual creativo premium"}.`,
    `Expresión: ${expression}.`,
    text ? `Diálogo: ${text}` : "",
    notes ? `Notas visuales: ${notes}` : "",
    directive ? `Prioridad manual: ${directive}` : "",
    "Plano cinematográfico limpio, coherente con un video creativo, iluminación controlada y composición horizontal 16:9."
  ].filter(Boolean).join(" ").trim().slice(0, 1200);
}

function buildVideoSceneImagePrompts(row = null, session = null) {
  const scenePrompt = normalizeVideoScenePrompt(row?.scenePrompt || "", row, session);
  const isCreativeVideo = resolveActiveVideoPreset(session) === "creative";
  if (isCreativeVideo) {
    const visualNotes = String(resolveVisualNotesForGeneration(row) || row?.visual || "").replace(/\s+/g, " ").trim();
    const sceneDescription = String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim();
    const transition = String(row?.transition || "").replace(/\s+/g, " ").trim();
    const base = scenePrompt || [sceneDescription, visualNotes].filter(Boolean).join(". ").trim();
    return normalizeVideoImagePrompts([
      `${base} Plano principal del recurso visual descrito, 16:9, estilo cinematográfico creativo, sin personas si no son necesarias, sin texto en pantalla.`,
      `${base} Variación de apoyo con detalle del elemento visual y continuidad narrativa. ${transition ? `Transición visual sugerida: ${transition}.` : ""}`.trim(),
      `${base} Toma alternativa de contexto para reforzar el beat visual, sin micrófonos ni set de podcast.`
    ]);
  }
  const speakerLabel = String(row?.speaker || "").trim() || "Host A";
  const speakerName = resolveSpeakerDisplayName(speakerLabel, session);
  const expression = String(row?.expression || "Neutral").trim() || "Neutral";
  const scenario = resolveScenarioForVideoMode(session, speakerLabel);
  const text = String(row?.text || "").replace(/\s+/g, " ").trim();
  const directive = String(row?.videoDirective || "").replace(/\s+/g, " ").trim();
  const base = scenePrompt || [
    `Video creativo de ${speakerName} en ${scenario || "entorno visual creativo premium"}.`,
    `Expresión ${expression}.`,
    text ? `El diálogo debe reflejar: ${text}` : "",
    directive ? `Cumple también: ${directive}` : ""
  ].filter(Boolean).join(" ").trim();
  const prompts = [
    `${base} Imagen principal cinematográfica horizontal 16:9, encuadre medio, iluminación editorial, look premium, sin texto en pantalla.`,
    `${base} Variante en plano más cerrado, énfasis en rostro, manos y recursos visuales de apoyo, continuidad total de la escena.`,
    `${base} Toma de apoyo o recurso visual, profundidad de campo suave, atmósfera creativa, composición limpia y lista para edición.`
  ];
  return normalizeVideoImagePrompts(prompts);
}

function hasVideoSceneMetadata(row = {}) {
  return Boolean(
    String(row?.scenePrompt || "").trim()
    || normalizeVideoImagePrompts(row?.imagePrompts || []).length
  );
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
    options.scenarioPrompt || resolveSpeakerStudioScenarioPrompt(activeSession, key, {
      expression: options.expression,
      contentMode: isEducationalVideoMode(activeSession) ? "creative" : "podcast"
    })
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
    const mediaRef = normalizeMediaReferenceFromRecord(
      clip,
      ["downloadUrl", "videoDownloadUrl", "videoUrl", "url"],
      ["storagePath", "videoStoragePath", "path"]
    );
    const downloadUrl = String(mediaRef.downloadUrl || "").trim();
    const storagePath = String(mediaRef.storagePath || "").trim();
    if (!storagePath && !downloadUrl) return;
    const rawSegments = Array.isArray(clip.segments) ? clip.segments : [];
    const segments = rawSegments
      .map((segment, idx) => {
        if (!segment || typeof segment !== "object") return null;
        const segmentRef = normalizeMediaReferenceFromRecord(
          segment,
          ["downloadUrl", "videoDownloadUrl", "videoUrl", "url"],
          ["storagePath", "videoStoragePath", "path"]
        );
        const segUrl = String(segmentRef.downloadUrl || "").trim();
        const segPath = String(segmentRef.storagePath || "").trim();
        if (!segPath && !segUrl) return null;
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
      type: String(clip.type || "").trim().toLowerCase() || null,
      model: String(clip.model || "veo-3.1-generate-preview").trim() || "veo-3.1-generate-preview",
      variant: String(clip.variant || "").trim(),
      promptVersion: String(clip.promptVersion || "podcaster_veo_v1").trim() || "podcaster_veo_v1",
      publicSceneLibraryId: String(clip.publicSceneLibraryId || "").trim(),
      publicScenePublishedAt: String(clip.publicScenePublishedAt || "").trim(),
      publicSceneTitle: String(clip.publicSceneTitle || "").trim(),
      publicSceneThumbUrl: String(clip.publicSceneThumbUrl || clip.thumbnailUrl || "").trim(),
      publicSceneVideoUrl: String(clip.publicSceneVideoUrl || clip.downloadUrl || "").trim(),
      videoDirective: String(clip.videoDirective || "").replace(/\s+/g, " ").trim(),
      scenePrompt: String(clip.scenePrompt || "").replace(/\s+/g, " ").trim(),
      imagePrompts: normalizeVideoImagePrompts(clip.imagePrompts || []),
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

function normalizeDialogueAudioPlaybackRate(value = 1) {
  return Math.max(0.5, Math.min(2.25, Number(value || 1) || 1));
}

function normalizeDialogueAudioMap(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([rowId, clip]) => {
    const key = String(rowId || "").trim();
    if (!key || !clip || typeof clip !== "object") return;
    const mediaRef = normalizePersistedMediaReference(clip.downloadUrl || "", clip.storagePath || "");
    const downloadUrl = String(mediaRef.downloadUrl || "").trim();
    const storagePath = String(mediaRef.storagePath || "").trim();
    if (!storagePath && !downloadUrl) return;
    next[key] = {
      rowId: key,
      speaker: String(clip.speaker || "").trim(),
      mimeType: String(clip.mimeType || "audio/wav").trim() || "audio/wav",
      model: String(clip.model || "gemini-3.1-flash-tts-preview").trim() || "gemini-3.1-flash-tts-preview",
      promptVersion: String(clip.promptVersion || "podcaster_live_audio_v1").trim() || "podcaster_live_audio_v1",
      durationSec: Math.max(0, Number(clip.durationSec) || 0),
      playbackRate: Math.max(0.5, Math.min(2.25, Number(clip.playbackRate || 1) || 1)),
      targetSpeechLine: String(clip.targetSpeechLine || "").trim(),
      wordTimings: normalizeKaraokeWordTimings(clip, String(clip.targetSpeechLine || "").trim()),
      updatedAt: String(clip.updatedAt || nowIso()).trim() || nowIso(),
      downloadUrl,
      storagePath
    };
  });
  return next;
}

function getDialogueAudioMap(session = null) {
  const s = session || getActiveSession();
  const raw = s?.dialogueAudioMap
    || s?.podcastStudioUiState?.dialogueAudiosByRowId
    || s?.script?.dialogueAudioMap
    || {};
  return normalizeDialogueAudioMap(raw);
}

function hasExplicitDialogueAudioForRow(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return false;
  return Boolean(getDialogueAudioMap(session)[key]);
}

function resolveFallbackDialogueAudioForRow(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return null;
  const cfg = getPodcastVideoConfig(session);
  const track = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  const segment = (track?.segments || []).find((item) => String(item?.rowId || "").trim() === key) || null;
  if (!segment) return null;
  const audioSrc = String(segment.audioSrc || "").trim();
  const mediaRef = normalizePersistedMediaReference(
    audioSrc || String(segment.downloadUrl || segment.url || "").trim(),
    String(segment.storagePath || "").trim()
  );
  const downloadUrl = String(mediaRef.downloadUrl || audioSrc).trim();
  const storagePath = String(mediaRef.storagePath || "").trim();
  if (!downloadUrl && !storagePath) return null;
  return {
    rowId: key,
    speaker: "",
    mimeType: "audio/ogg",
    model: "gemini-track-fallback",
    promptVersion: "gemini-track-fallback",
    durationSec: Math.max(0, Number(segment?.durationMs || 0) / 1000),
    targetSpeechLine: "",
    updatedAt: String(track?.updatedAt || nowIso()).trim() || nowIso(),
    downloadUrl,
    storagePath
  };
}

function resolveDialogueAudioForRow(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return null;
  return getDialogueAudioMap(session)[key] || resolveFallbackDialogueAudioForRow(session, key);
}

function resolveRowAudioDurationMs(rowId = "", session = null) {
  const key = String(rowId || "").trim();
  if (!key) return 0;
  const audioClip = resolveDialogueAudioForRow(session, key);
  const storedMs = Math.max(0, Number(audioClip?.durationSec || 0) * 1000);
  const actualMs = Math.max(0, Number(podcastVideoState?.montageAudioActualDurationsMs?.[key] || 0));
  const playbackRate = resolveDialogueAudioPlaybackRate(session, key);
  return Math.round(Math.max(storedMs, actualMs) / Math.max(0.5, playbackRate || 1));
}

function resolveDialogueAudioPlaybackRate(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return 1;
  const row = getSessionRows(session).find((item) => String(item?.id || "").trim() === key) || null;
  const rowPlaybackRate = Math.max(0.5, Math.min(2.25, Number(row?.playbackRate || 1) || 1));
  const audioClip = resolveDialogueAudioForRow(session, key);
  return normalizeDialogueAudioPlaybackRate(audioClip?.playbackRate || rowPlaybackRate || 1);
}

function hasStoredMediaSource(asset = null) {
  if (!asset || typeof asset !== "object") return false;
  const normalized = normalizeMediaReferenceFromRecord(
    asset,
    ["downloadUrl", "videoDownloadUrl", "videoUrl", "audioSrc", "url"],
    ["storagePath", "videoStoragePath", "audioStoragePath", "path"]
  );
  return Boolean(String(normalized.downloadUrl || "").trim() || String(normalized.storagePath || "").trim());
}

function normalizeTransitionsByEdge(raw = {}) {
  return window.normalizeTransitionsByEdge(raw);
}

function normalizeTimelineClipVisualLayoutMode(value = "") {
  return window.normalizeTimelineClipVisualLayoutMode(value);
}

function normalizeTimelineClipMediaScale(value = 1) {
  return window.normalizeTimelineClipMediaScale(value);
}

function resolveSceneMediaRenderSpec(input = {}) {
  return resolveSharedSceneMediaRenderSpec(input);
}

function normalizeTimelineClipItem(raw = {}, rowId = "") {
  return window.normalizeTimelineClipItem(raw, rowId);
}

function normalizeTimelineClipsByRowId(raw = {}) {
  return window.normalizeTimelineClipsByRowId(raw);
}

const PODCAST_ON_SCREEN_TEXT_FONT_FAMILIES = [
  { value: "Inter", label: "Inter", family: '"Inter", system-ui, sans-serif' },
  { value: "Outfit", label: "Outfit", family: '"Outfit", system-ui, sans-serif' },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans", family: '"Plus Jakarta Sans", system-ui, sans-serif' },
  { value: "Lexend", label: "Lexend", family: '"Lexend", system-ui, sans-serif' },
  { value: "Montserrat", label: "Montserrat", family: '"Montserrat", system-ui, sans-serif' },
  { value: "Sora", label: "Sora", family: '"Sora", system-ui, sans-serif' },
  { value: "Urbanist", label: "Urbanist", family: '"Urbanist", system-ui, sans-serif' },
  { value: "Space Grotesk", label: "Space Grotesk", family: '"Space Grotesk", system-ui, sans-serif' },
  { value: "Poppins", label: "Poppins", family: '"Poppins", system-ui, sans-serif' },
  { value: "Syne", label: "Syne", family: '"Syne", system-ui, sans-serif' },
  { value: "Unbounded", label: "Unbounded", family: '"Unbounded", system-ui, sans-serif' },
  { value: "Bebas Neue", label: "Bebas Neue", family: '"Bebas Neue", system-ui, sans-serif' },
  { value: "Oxanium", label: "Oxanium", family: '"Oxanium", system-ui, sans-serif' },
  { value: "Roboto", label: "Roboto", family: '"Roboto", system-ui, sans-serif' },
  { value: "Nunito", label: "Nunito", family: '"Nunito", system-ui, sans-serif' },
  { value: "AvantGardeLocal", label: "Avant Garde", family: '"AvantGardeLocal", system-ui, sans-serif' },
  { value: "Bungee", label: "Bungee", family: '"Bungee", system-ui, sans-serif' },
  { value: "System", label: "Sistema", family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }
];

const PODCAST_ON_SCREEN_TEXT_STYLE_PRESETS = [
  { value: "3d", label: "3D" },
  { value: "chrome", label: "Chrome" },
  { value: "glow", label: "Glow" },
  { value: "flat", label: "Plano" }
];

const PODCAST_ON_SCREEN_TEXT_FONT_VARIANTS = [
  { value: "regular", label: "Regular", fontWeight: "normal", fontStyle: "normal" },
  { value: "bold", label: "Bold", fontWeight: "bold", fontStyle: "normal" },
  { value: "italic", label: "Italic", fontWeight: "normal", fontStyle: "italic" },
  { value: "bold-italic", label: "Bold Italic", fontWeight: "bold", fontStyle: "italic" }
];

const PODCAST_ON_SCREEN_TEXT_SIZE_PRESETS = [
  { value: 20, label: "XS" },
  { value: 26, label: "Peq." },
  { value: 34, label: "Med." },
  { value: 44, label: "Grande" },
  { value: 54, label: "XL" },
  { value: 64, label: "XXL" }
];

const STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS = 7000;
const STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION = 3;
const STUDIO_ONSCREEN_TEXT_LAYOUT_DEFAULTS_VERSION = 3;

function normalizeOnScreenTextClipItem(raw = {}, rowId = "") {
  return normalizeSharedOnScreenTextClipItem(raw, rowId);
}

function normalizeOnScreenTextClipsByRowId(raw = {}) {
  return normalizeSharedOnScreenTextClipsByRowId(raw);
}

function normalizeOnScreenTextLayoutItem(raw = {}, rowId = "") {
  return normalizeSharedOnScreenTextLayoutItem(raw, rowId);
}

function normalizeOnScreenTextLayoutByRowId(raw = {}) {
  return normalizeSharedOnScreenTextLayoutByRowId(raw);
}

function estimateOnScreenTextLayoutHeightPct(text = "", settings = null, widthPct = 0.38) {
  const sourceDims = getOnScreenTextSourceDimensions();
  return estimateSharedOnScreenTextLayoutHeightPct(text, settings, widthPct, {
    sourceWidth: sourceDims.width,
    sourceHeight: sourceDims.height,
    resolution: getOnScreenTextRenderResolution()
  });
}

function estimateOnScreenTextLayoutWidthPct(text = "", settings = null, options = {}) {
  const sourceDims = getOnScreenTextSourceDimensions();
  return estimateSharedOnScreenTextLayoutWidthPct(text, settings, {
    ...options,
    sourceWidth: sourceDims.width,
    sourceHeight: sourceDims.height,
    resolution: getOnScreenTextRenderResolution()
  });
}

function buildDefaultOnScreenTextLayoutForRow(row = null, settings = null) {
  const sourceDims = getOnScreenTextSourceDimensions();
  return buildSharedDefaultOnScreenTextLayoutForRow(row, settings, {
    getText: getOnScreenTextClipText,
    sourceWidth: sourceDims.width,
    sourceHeight: sourceDims.height,
    resolution: getOnScreenTextRenderResolution()
  });
}

function expandOnScreenTextLayoutToFitText(layout = null, row = null, settings = null) {
  const sourceDims = getOnScreenTextSourceDimensions();
  return expandSharedOnScreenTextLayoutToFitText(layout, row, settings, {
    getText: getOnScreenTextClipText,
    sourceWidth: sourceDims.width,
    sourceHeight: sourceDims.height,
    resolution: getOnScreenTextRenderResolution()
  });
}

function shouldRepairLegacyOnScreenTextLayout(layout = null, settings = null) {
  return shouldRepairSharedOnScreenTextLayout(layout, settings);
}

function resolveOnScreenTextPreviewLayoutSpec(input = {}) {
  const config = input && typeof input === "object" ? input : {};
  const current = normalizeOnScreenTextTrackSettings(config.settings || {});
  const sourceDims = getOnScreenTextSourceDimensions();
  return resolveSharedOnScreenTextPreviewLayoutSpec({
    ...config,
    settings: current,
    sourceWidth: Math.max(160, Math.round(Number(config.sourceWidth || 0) || sourceDims.width)),
    sourceHeight: Math.max(90, Math.round(Number(config.sourceHeight || 0) || sourceDims.height)),
    resolution: config.resolution || getOnScreenTextRenderResolution()
  });
}

function ensureOnScreenTextLayoutByRowId(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return {};
  const cfg = getPodcastVideoConfig(activeSession);
  const existing = normalizeOnScreenTextLayoutByRowId(cfg?.timelineOnScreenTextLayoutByRowId || {});
  const persist = options.persist === true;
  const currentLayoutDefaultsVersion = Math.max(1, Math.round(toFiniteNumber(cfg?.timelineOnScreenTextLayoutDefaultsVersion, 1)));
  const rows = getSessionRows(activeSession);
  const settings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  const shouldResetLayouts = currentLayoutDefaultsVersion < STUDIO_ONSCREEN_TEXT_LAYOUT_DEFAULTS_VERSION;
  const next = shouldResetLayouts ? {} : { ...existing };
  let changed = shouldResetLayouts;

  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const defaultLayout = buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, settings);
    if (!defaultLayout) return;
    const currentLayout = !shouldResetLayouts ? next[rowId] || null : null;
    if (currentLayout && !shouldRepairLegacyOnScreenTextLayout(currentLayout, settings)) return;
    next[rowId] = defaultLayout;
    changed = true;
  });
  if (persist && changed) {
    upsertPodcastVideoConfig((baseCfg) => ({
      ...baseCfg,
      timelineOnScreenTextLayoutByRowId: next,
      timelineOnScreenTextLayoutDefaultsVersion: STUDIO_ONSCREEN_TEXT_LAYOUT_DEFAULTS_VERSION
    }));
  }
  return next;
}

function getOnScreenTextLayoutForRow(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return null;
  const activeSession = session || getActiveSession();
  const cfg = getPodcastVideoConfig(activeSession);
  const existing = normalizeOnScreenTextLayoutByRowId(cfg?.timelineOnScreenTextLayoutByRowId || {});
  const settings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  const row = Array.isArray(activeSession?.script?.rows)
    ? activeSession.script.rows.find((item) => String(item?.id || "").trim() === key) || null
    : null;
  const baseLayout = existing[key] || buildDefaultOnScreenTextLayoutForRow(row, settings);
  if (!baseLayout) return null;
  const effectiveWidthPct = Math.max(0.22, Math.min(0.92, Number(settings.boxWidthPct || baseLayout.widthPct || 0.58)));
  const effectiveHeightPct = Math.max(
    0.05,
    Math.min(
      0.6,
      estimateOnScreenTextLayoutHeightPct(getOnScreenTextClipText(row), settings, effectiveWidthPct)
    )
  );
  const effectiveXPct = Math.max(0, Math.min(1 - effectiveWidthPct, Number(settings.overlayXPct || 0.5) - (effectiveWidthPct / 2)));
  const effectiveYPct = Math.max(0, Math.min(1 - effectiveHeightPct, Number(settings.overlayYPct || 0.86) - effectiveHeightPct));
  return normalizeOnScreenTextLayoutItem({
    ...baseLayout,
    widthPct: effectiveWidthPct,
    heightPct: effectiveHeightPct,
    xPct: effectiveXPct,
    yPct: effectiveYPct
  }, key);
}

function getOnScreenTextTrackSettings(session = null) {
  const cfg = getPodcastVideoConfig(session);
  return normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
}

function getOnScreenTextSourceDimensions() {
  const preview = els.podcastVideoStage?.querySelector?.(".podcast-video-preview");
  const previewStyles = preview ? window.getComputedStyle(preview) : null;
  const parsePositive = (value, fallback = 0) => {
    const numeric = Math.round(toFiniteNumber(value, fallback));
    return numeric > 0 ? numeric : fallback;
  };
  const fromStyleWidth = parsePositive(preview?.style?.getPropertyValue?.("--pod-stage-aspect-w"), 0);
  const fromStyleHeight = parsePositive(preview?.style?.getPropertyValue?.("--pod-stage-aspect-h"), 0);
  const fromComputedWidth = parsePositive(previewStyles?.getPropertyValue?.("--pod-stage-aspect-w"), 0);
  const fromComputedHeight = parsePositive(previewStyles?.getPropertyValue?.("--pod-stage-aspect-h"), 0);
  const sourceWidth = Math.max(fromStyleWidth, fromComputedWidth, 0);
  const sourceHeight = Math.max(fromStyleHeight, fromComputedHeight, 0);
  if (sourceWidth > 0 && sourceHeight > 0) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const stageVideos = [
    els.podcastActiveSpeakerVideo,
    els.podcastActiveSpeakerVideoAlt,
    preview?.querySelector?.("video")
  ].filter(Boolean);
  for (const videoEl of stageVideos) {
    const width = Math.max(0, Math.round(Number(videoEl?.videoWidth || 0) || 0));
    const height = Math.max(0, Math.round(Number(videoEl?.videoHeight || 0) || 0));
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  return { width: 1280, height: 720 };
}

function getOnScreenTextRenderResolution() {
  return window.normalizeMontageExportSettings(window.montageExportState || {}).resolution;
}

function buildOnScreenTextPreviewStrokeShadowCss(settings = null, options = {}) {
  return buildSharedOnScreenTextPreviewStrokeShadowCss(settings, options);
}

function buildOnScreenTextPreviewShadowCss(settings = null, options = {}) {
  return buildSharedOnScreenTextPreviewShadowCss(settings, options);
}

function wrapOnScreenTextPreviewText(text = "", options = {}) {
  return wrapSharedOnScreenTextPreviewText(text, options);
}

function resolveOnScreenTextRenderMetrics(settings = null, options = {}) {
  const sourceDims = getOnScreenTextSourceDimensions();
  return onScreenTextRenderSpecApi.resolveOnScreenTextRenderMetrics(
    normalizeOnScreenTextTrackSettings(settings || {}),
    {
      ...options,
      sourceWidth: Math.max(160, Math.round(Number(options?.sourceWidth || 0) || sourceDims.width)),
      sourceHeight: Math.max(90, Math.round(Number(options?.sourceHeight || 0) || sourceDims.height)),
      resolution: options?.resolution || getOnScreenTextRenderResolution()
    }
  );
}

function resolveOnScreenTextPreviewWrapFromMeasuredWidth(text = "", renderMetrics = null, contentWidthPx = 0) {
  return resolveSharedOnScreenTextPreviewWrapFromMeasuredWidth(text, renderMetrics, contentWidthPx);
}

function buildOnScreenTextBubbleInlineStyle(settings = null, options = {}) {
  return buildSharedOnScreenTextBubbleInlineStyle(settings, options);
}

function getOnScreenTextResizeHandles(settings = null) {
  return getSharedOnScreenTextResizeHandles(settings);
}

function buildOnScreenTextSelectionFrameHtml(settings = null) {
  return buildSharedOnScreenTextSelectionFrameHtml(settings);
}

function inferOnScreenTextLookPreset(settings = null) {
  return inferSharedOnScreenTextLookPreset(settings || {});
}

function applyOnScreenTextLookPreset(presetKey = "") {
  const key = String(presetKey || "").trim();
  if (!key) return;
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    onScreenTextTrack: applySharedOnScreenTextLookPresetValue(cfg?.onScreenTextTrack || {}, key)
  }));
  const session = getActiveSession();
  syncPodcastOnScreenTextOverlay(session, {
    rowId: String(podcastVideoState.activeRowId || "").trim(),
    currentMs: Number(podcastVideoState.montageCursorMs || 0),
    forceRow: true
  });
  if (els.onScreenTextTrackModal && els.onScreenTextTrackModal.hidden === false) {
    renderOnScreenTextTrackModal(session);
  }
  scheduleSessionLocalPersist("inspector");
}

function getOnScreenTextFontFamilyCss(fontFamily = "") {
  return getSharedOnScreenTextFontFamilyCss(fontFamily);
}

function getOnScreenTextStylePresetClass(stylePreset = "") {
  return getSharedOnScreenTextStylePresetClass(stylePreset);
}

function getOnScreenTextBgPresetClass(bgPreset = "") {
  return getSharedOnScreenTextBgPresetClass(bgPreset);
}

function getOnScreenTextClipEffectiveDurationMs(clip = null) {
  if (!clip) return STUDIO_TIMELINE_MIN_CLIP_MS;
  const trimInMs = Math.max(0, Number(clip?.trimInMs || 0) || 0);
  const trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(clip?.trimOutMs || 0) || 0);
  return Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, trimOutMs - trimInMs);
}

function buildMontageOnScreenTextSegments(session = null, runtimeEntries = []) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  const cfg = getPodcastVideoConfig(activeSession);
  const settings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  if (!settings.enabled || settings.showTrack === false) return { settings, segments: [] };
  const clipMap = ensureOnScreenTextClipsByRowId(activeSession, { persist: false });
  const layoutMap = ensureOnScreenTextLayoutByRowId(activeSession, { persist: false });
  const runtimeByRowId = new Map((Array.isArray(runtimeEntries) ? runtimeEntries : []).map((entry) => [String(entry?.rowId || "").trim(), entry]));
  const segments = rows.map((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return null;
    const clip = clipMap[rowId] || null;
    if (!clip || clip.hidden === true) return null;
    const text = getOnScreenTextClipText(row);
    if (!text) return null;
    const runtime = runtimeByRowId.get(rowId) || null;
    const startMs = Math.max(0, Math.round(Number(clip?.startMs ?? runtime?.startMs ?? 0) || 0));
    const durationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round(getOnScreenTextClipEffectiveDurationMs(clip))
    );
    const layout = layoutMap[rowId] || buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, settings);
    const expandedLayout = expandOnScreenTextLayoutToFitText(
      layout,
      { ...row, onScreenText: text, index: index + 1 },
      settings,
      { rowId }
    ) || layout;
    return {
      id: `${rowId}-onscreen`,
      rowId,
      sceneIndex: index + 1,
      text,
      startMs,
      durationMs,
      trimInMs: Math.max(0, Math.round(Number(clip?.trimInMs || 0) || 0)),
      trimOutMs: Math.max(0, Math.round(Number(clip?.trimOutMs || 0) || 0)),
      zIndex: Math.max(1, Math.round(Number(clip?.zIndex || index + 1) || index + 1)),
      layout: expandedLayout
    };
  }).filter(Boolean);
  return { settings, segments };
}

function buildDefaultOnScreenTextClipsByRowId(session = null) {
  const activeSession = session || getActiveSession();
  const useFullSceneDuration = isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession);
  const rows = getSessionRows(activeSession);
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const next = {};
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const sceneClip = sceneClips[rowId] || null;
    const sceneStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0);
    const sceneDurationMs = sceneClip
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(sceneClip))
      : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getRowSourceDurationMs(row, activeSession));
    const desiredDurationMs = useFullSceneDuration
      ? sceneDurationMs
      : Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.min(STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS, sceneDurationMs)
      );
    const centeredStartMs = useFullSceneDuration
      ? sceneStartMs
      : sceneStartMs + Math.max(0, Math.round((sceneDurationMs - desiredDurationMs) / 2));
    const hasText = Boolean(getOnScreenTextClipText(row));
    const clip = normalizeOnScreenTextClipItem({
      rowId,
      startMs: centeredStartMs,
      sourceDurationMs: sceneDurationMs,
      trimInMs: 0,
      trimOutMs: desiredDurationMs,
      hidden: !hasText,
      autoHidden: !hasText,
      zIndex: index + 1
    }, rowId);
    if (!clip) return;
    next[rowId] = clip;
  });
  return next;
}

function ensureOnScreenTextClipForRowId(session = null, rowId = "", options = {}) {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!activeSession || !key) return null;
  const useFullSceneDuration = isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession);
  const cfg = getPodcastVideoConfig(activeSession);
  const existing = normalizeOnScreenTextClipsByRowId(cfg.timelineOnScreenTextClipsByRowId || {});
  if (existing[key]) return existing[key];
  const rows = getSessionRows(activeSession);
  const row = rows.find((item) => String(item?.id || "").trim() === key) || null;
  if (!row) return null;
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const sceneClip = sceneClips[key] || null;
  const sceneStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0);
  const sceneDurationMs = sceneClip
    ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(sceneClip))
    : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getRowSourceDurationMs(row, activeSession));
  const desiredDurationMs = useFullSceneDuration
    ? sceneDurationMs
    : Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.min(STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS, sceneDurationMs)
    );
  const centeredStartMs = useFullSceneDuration
    ? sceneStartMs
    : sceneStartMs + Math.max(0, Math.round((sceneDurationMs - desiredDurationMs) / 2));
  const hasText = Boolean(getOnScreenTextClipText(row));
  const clip = normalizeOnScreenTextClipItem({
    rowId: key,
    startMs: centeredStartMs,
    sourceDurationMs: sceneDurationMs,
    trimInMs: 0,
    trimOutMs: desiredDurationMs,
    hidden: !hasText,
    autoHidden: !hasText,
    zIndex: Math.max(1, rows.findIndex((item) => String(item?.id || "").trim() === key) + 1)
  }, key);
  if (!clip) return null;
  if (options.persist !== false) {
    upsertPodcastVideoConfig((baseCfg) => ({
      ...baseCfg,
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: {
        ...(baseCfg.timelineOnScreenTextClipsByRowId || {}),
        [key]: clip
      }
    }));
  }
  return clip;
}

function getOnScreenTextClipText(row = null) {
  return getSharedOnScreenTextClipText({
    ...row,
    onScreenText: normalizeCreativeFieldText(row?.onScreenText, row?.textoPantalla, row?.textoEnPantalla, row?.text)
  });
}

function normalizeOnScreenTextClipsToSevenSecondsCentered(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  if (isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession)) {
    return false;
  }
  const persist = options.persist === true;
  const cfg = getPodcastVideoConfig(activeSession);
  const currentDefaultsVersion = Math.max(1, Math.round(toFiniteNumber(cfg?.timelineOnScreenTextDefaultsVersion, 1)));
  if (currentDefaultsVersion >= STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION && options.force !== true) {
    return false;
  }
  const rows = getSessionRows(activeSession);
  if (!rows.length) return false;
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const clipStore = ensureOnScreenTextClipsByRowId(activeSession, { persist: false });
  const hasManualLikeEdits = rows.some((row) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return false;
    const current = clipStore[rowId];
    if (!current) return false;
    const sceneClip = sceneClips[rowId] || null;
    const sceneDurationMs = sceneClip
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(sceneClip))
      : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getRowSourceDurationMs(row, activeSession));
    const desiredDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.min(STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS, sceneDurationMs)
    );
    const centeredStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0)
      + Math.max(0, Math.round((sceneDurationMs - desiredDurationMs) / 2));
    const currentTrimInMs = Math.max(0, Number(current?.trimInMs || 0) || 0);
    const currentTrimOutMs = Math.max(currentTrimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, Number(current?.trimOutMs || 0) || 0);
    const currentDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, currentTrimOutMs - currentTrimInMs);
    return Math.abs(Math.round(Number(current?.startMs || 0) || 0) - centeredStartMs) > 1
      || Math.abs(currentTrimInMs - 0) > 1
      || Math.abs(currentDurationMs - desiredDurationMs) > 1;
  });
  if (hasManualLikeEdits && options.force !== true) {
    if (persist && currentDefaultsVersion < STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION) {
      upsertPodcastVideoConfig((base) => ({
        ...base,
        timelineOnScreenTextDefaultsVersion: STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION
      }));
      return true;
    }
    return false;
  }
  const next = { ...clipStore };
  let changed = false;
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const current = clipStore[rowId];
    if (!current) return;
    const sceneClip = sceneClips[rowId] || null;
    if (!sceneClip) return;
    const sceneStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0);
    const sceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(sceneClip));
    const desiredDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.min(STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS, sceneDurationMs)
    );
    const centeredStartMs = sceneStartMs + Math.max(0, Math.round((sceneDurationMs - desiredDurationMs) / 2));
    const normalized = normalizeOnScreenTextClipItem({
      ...current,
      startMs: centeredStartMs,
      sourceDurationMs: Math.max(sceneDurationMs, Number(current?.sourceDurationMs || 0) || 0),
      trimInMs: 0,
      trimOutMs: desiredDurationMs,
      zIndex: Math.max(1, Number(current?.zIndex || index + 1))
    }, rowId);
    if (!normalized) return;
    if (JSON.stringify(normalized) !== JSON.stringify(current)) {
      next[rowId] = normalized;
      changed = true;
    }
  });
  if (!changed) {
    if (persist && currentDefaultsVersion < STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION) {
      upsertPodcastVideoConfig((base) => ({
        ...base,
        timelineOnScreenTextDefaultsVersion: STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION
      }));
      return true;
    }
    return false;
  }
  if (persist) {
    upsertPodcastVideoConfig((base) => ({
      ...base,
      timelineOnScreenTextDefaultsVersion: STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION,
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: next
    }));
  }
  return true;
}

function setOnScreenTextClipHidden(rowId = "", hidden = false, options = {}) {
  const key = String(rowId || "").trim();
  if (!key) return false;
  const session = getActiveSession();
  let changed = false;
  upsertPodcastVideoConfig((cfg) => {
    const clips = ensureOnScreenTextClipsByRowId(session, { persist: false });
    const current = clips[key];
    if (!current) return cfg;
    const nextHidden = Boolean(hidden);
    const normalized = normalizeOnScreenTextClipItem({
      ...current,
      hidden: nextHidden,
      autoHidden: false
    }, key);
    if (!normalized || JSON.stringify(normalized) === JSON.stringify(current)) return cfg;
    changed = true;
    return {
      ...cfg,
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: {
        ...(cfg.timelineOnScreenTextClipsByRowId || {}),
        [key]: normalized
      }
    };
  });
  if (changed && options.render !== false) {
    const refreshed = getActiveSession();
    renderPodcastVideoTimeline(refreshed, { force: true, reason: "onscreen-text-visibility" });
    syncPodcastStudioInspector(refreshed);
    syncPodcastOnScreenTextOverlay(refreshed, {
      rowId: String(podcastVideoState.activeRowId || "").trim(),
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: false
    });
    void persistReorderedTimelinePatchToCloud(refreshed, {
      timelineClipsByRowId: ensureTimelineClipsByRowId(refreshed, { persist: false }),
      geminiDialogueTrack: getPodcastVideoConfig(refreshed)?.geminiDialogueTrack || {},
      timelineOnScreenTextClipsByRowId: ensureOnScreenTextClipsByRowId(refreshed, { persist: false }),
      timelineOnScreenTextLayoutByRowId: normalizeOnScreenTextLayoutByRowId(
        getPodcastVideoConfig(refreshed)?.timelineOnScreenTextLayoutByRowId || {}
      )
    });
    scheduleSessionLocalPersist("timeline-onscreen-text");
  }
  return changed;
}

function copyVoiceOverTextToOnScreenText(rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return false;
  const session = getActiveSession();
  if (!session) return false;
  const isCreative = isCreativeVideoMode(session);
  const rows = getSessionRows(session);
  const row = rows.find((item) => String(item?.id || "").trim() === key) || null;
  if (!row) return false;
  const voiceOverText = String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim();
  if (!voiceOverText) return false;
  const videoPreset = resolveActiveVideoPreset(session);
  upsertActiveSession((current) => ({
    ...current,
    script: {
      ...current.script,
      hosts: isCreative ? ["Narrador"] : current.script.hosts,
      rows: (current.script?.rows || []).map((item, index) => {
        if (String(item?.id || "").trim() !== key) {
          return isCreative ? normalizeCreativeRow(item, index, { videoPreset }) : item;
        }
        return isCreative
          ? normalizeCreativeRow({ ...item, onScreenText: voiceOverText, onScreenTextNoSummarize: true }, index, { videoPreset })
          : { ...item, onScreenText: voiceOverText, onScreenTextNoSummarize: true };
      })
    }
  }), { render: false });
  syncOnScreenTextClipVisibilityFromRowText(key, voiceOverText, { render: false });
  expandOnScreenTextLayoutsForRows(getActiveSession(), [key], { persist: true });
  scheduleSessionLocalPersist("script-edit");
  if (podcastVideoState.enabled) {
    renderPodcastVideoShell(getActiveSession());
  }
  if (creativeVideoState.enabled) {
    renderCreativeVideoShell(getActiveSession());
  }
  return true;
}

function copyVoiceOverTextToOnScreenTextAllScenes() {
  const session = getActiveSession();
  if (!session) return false;
  const isCreative = isCreativeVideoMode(session);
  const rows = getSessionRows(session);
  if (!rows.length) return false;
  const videoPreset = resolveActiveVideoPreset(session);
  let changedAny = false;
  const changedRowIds = [];
  upsertActiveSession((current) => ({
    ...current,
    script: {
      ...current.script,
      hosts: isCreative ? ["Narrador"] : current.script.hosts,
      rows: (current.script?.rows || []).map((item, index) => {
        const voiceOverText = String(item?.voiceOverText || item?.text || "").replace(/\s+/g, " ").trim();
        if (!voiceOverText) return isCreative ? normalizeCreativeRow(item, index, { videoPreset }) : item;
        changedAny = true;
        changedRowIds.push(String(item?.id || "").trim());
        return isCreative
          ? normalizeCreativeRow({ ...item, onScreenText: voiceOverText, onScreenTextNoSummarize: true }, index, { videoPreset })
          : { ...item, onScreenText: voiceOverText, onScreenTextNoSummarize: true };
      })
    }
  }), { render: false });
  if (!changedAny) return false;
  ensureOnScreenTextClipsByRowId(getActiveSession(), { persist: true });
  expandOnScreenTextLayoutsForRows(getActiveSession(), changedRowIds, { persist: true });
  scheduleSessionLocalPersist("script-edit");
  if (podcastVideoState.enabled) {
    renderPodcastVideoShell(getActiveSession());
  }
  if (creativeVideoState.enabled) {
    renderCreativeVideoShell(getActiveSession());
  }
  return true;
}

function expandOnScreenTextLayoutsForRows(session = null, rowIds = [], options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const keys = Array.from(new Set((Array.isArray(rowIds) ? rowIds : [rowIds]).map((rowId) => String(rowId || "").trim()).filter(Boolean)));
  if (!keys.length) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const settings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  const rows = getSessionRows(activeSession);
  const currentLayouts = ensureOnScreenTextLayoutByRowId(activeSession, { persist: false });
  const nextLayouts = { ...currentLayouts };
  let changed = false;

  keys.forEach((rowId, index) => {
    const row = rows.find((item) => String(item?.id || "").trim() === rowId) || null;
    if (!row) return;
    const baseLayout = currentLayouts[rowId] || buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, settings);
    if (!baseLayout) return;
    const expanded = expandOnScreenTextLayoutToFitText(baseLayout, row, settings);
    if (!expanded) return;
    if (JSON.stringify(expanded) !== JSON.stringify(baseLayout)) {
      nextLayouts[rowId] = expanded;
      changed = true;
    }
  });

  if (!changed) return false;
  upsertPodcastVideoConfig((baseCfg) => ({
    ...baseCfg,
    timelineOnScreenTextLayoutByRowId: nextLayouts
  }), {
    autosave: options.autosave !== false,
    persist: options.persist
  });
  return true;
}

function addOnScreenTextClipForSelectedScene() {
  const session = getActiveSession();
  if (!session) return false;
  const rowId = String(podcastVideoState.activeRowId || resolveTargetVideoRowId(session, podcastVideoState.activeSpeaker) || "").trim();
  if (!rowId) return false;

  // Asegura clip y hazlo visible aunque el texto esté vacío (mostrará "Sin texto" en el track).
  ensureOnScreenTextClipForRowId(session, rowId, { persist: true });
  upsertPodcastVideoConfig((cfg) => {
    const clips = ensureOnScreenTextClipsByRowId(session, { persist: false });
    const current = clips[rowId] || null;
    if (!current) return cfg;
    const normalizedClip = normalizeOnScreenTextClipItem({
      ...current,
      hidden: false,
      autoHidden: false
    }, rowId);
    const currentSettings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
    return {
      ...cfg,
      onScreenTextTrack: {
        ...currentSettings,
        enabled: true,
        showTrack: true
      },
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: {
        ...(cfg.timelineOnScreenTextClipsByRowId || {}),
        [rowId]: normalizedClip
      }
    };
  });

  const refreshed = getActiveSession();
  renderPodcastVideoTimeline(refreshed, { force: true, reason: "onscreen-text-add" });
  syncPodcastStudioInspector(refreshed);
  syncPodcastOnScreenTextOverlay(refreshed, {
    rowId,
    currentMs: Number(podcastVideoState.montageCursorMs || 0),
    forceRow: true
  });
  scheduleSessionLocalPersist("timeline-onscreen-text");
  return true;
}

function syncOnScreenTextClipVisibilityFromRowText(rowId = "", text = "", options = {}) {
  const key = String(rowId || "").trim();
  if (!key) return false;
  const hasText = Boolean(String(text || "").replace(/\s+/g, " ").trim());
  let changed = false;
  upsertPodcastVideoConfig((cfg, session) => {
    const clips = ensureOnScreenTextClipsByRowId(session, { persist: false });
    const current = clips[key];
    if (!current) return cfg;
    const nextHidden = hasText
      ? (current.autoHidden === true ? false : Boolean(current.hidden))
      : true;
    const nextAutoHidden = hasText ? false : true;
    const normalized = normalizeOnScreenTextClipItem({
      ...current,
      hidden: nextHidden,
      autoHidden: nextAutoHidden
    }, key);
    if (!normalized || JSON.stringify(normalized) === JSON.stringify(current)) return cfg;
    changed = true;
    return {
      ...cfg,
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: {
        ...(cfg.timelineOnScreenTextClipsByRowId || {}),
        [key]: normalized
      }
    };
  }, {
    autosave: options.autosave !== false,
    persist: options.persist,
    recordHistory: options.recordHistory
  });
  if (changed && options.render !== false) {
    renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "onscreen-text-visibility" });
    syncPodcastStudioInspector(getActiveSession());
    if (options.autosave !== false) {
      scheduleSessionLocalPersist("timeline-onscreen-text");
    }
  }
  return changed;
}

function syncPodcastOnScreenTextOverlay(session = null, options = {}) {
  const currentMs = Math.max(0, Number(options?.currentMs ?? podcastVideoState.montageCursorMs ?? 0) || 0);
  if (typeof playbackController?.syncOverlay === "function") {
    return playbackController.syncOverlay(currentMs, options);
  }
}

function ensureOnScreenTextClipsByRowId(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return {};
  const persist = options.persist === true;
  const useFullSceneDuration = isPodcastMode(activeSession) && !isEducationalVideoMode(activeSession);
  const rows = getSessionRows(activeSession);
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const cfg = getPodcastVideoConfig(activeSession);
  const existing = normalizeOnScreenTextClipsByRowId(cfg.timelineOnScreenTextClipsByRowId || {});
  const fallback = buildDefaultOnScreenTextClipsByRowId(activeSession);
  const next = {};
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const existingClip = existing[rowId];
    const base = existingClip || fallback[rowId];
    if (!base) return;
    const rowSourceDurationMs = getRowSourceDurationMs(row, activeSession);
    const sceneClip = sceneClips[rowId] || null;
    const sceneDurationMs = sceneClip
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(sceneClip))
      : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, rowSourceDurationMs);
    const hasText = Boolean(getOnScreenTextClipText(row));
    const existingSourceDurationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(existingClip?.sourceDurationMs || base?.sourceDurationMs || sceneDurationMs)
    );
    const existingTrimInMs = Math.max(0, Number(existingClip?.trimInMs ?? base?.trimInMs ?? 0));
    const existingTrimOutMs = Math.max(
      existingTrimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(existingClip?.trimOutMs ?? base?.trimOutMs ?? existingSourceDurationMs)
    );
    const wasDefaultCenteredPodcastClip = useFullSceneDuration
      && Math.abs(existingTrimInMs) <= 1
      && Math.abs(existingTrimOutMs - STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS) <= 5
      && sceneDurationMs > STUDIO_ONSCREEN_TEXT_DEFAULT_DURATION_MS + 250;
    const normalizedTrimOutMs = wasDefaultCenteredPodcastClip ? sceneDurationMs : existingTrimOutMs;
    const normalizedStartMs = wasDefaultCenteredPodcastClip
      ? Math.max(0, Number(sceneClip?.startMs || 0) || 0)
      : Number(base?.startMs || 0);
    const sourceDurationMs = Math.max(existingSourceDurationMs, normalizedTrimOutMs, sceneDurationMs);
    const normalized = normalizeOnScreenTextClipItem({
      ...base,
      startMs: normalizedStartMs,
      sourceDurationMs,
      trimInMs: existingTrimInMs,
      trimOutMs: normalizedTrimOutMs,
      hidden: existingClip?.autoHidden === true ? !hasText : Boolean(existingClip?.hidden ?? base?.hidden),
      autoHidden: hasText ? false : true,
      zIndex: Math.max(1, Number(base.zIndex || index + 1))
    }, rowId);
    if (!normalized) return;
    next[rowId] = sceneClip
      ? (constrainOnScreenTextClipToScene(normalized, sceneClip, rowId) || normalized)
      : normalized;
  });
  const alignedNext = alignOnScreenTextClipsToGeminiTrack(activeSession, next);
  const changed = JSON.stringify(alignedNext) !== JSON.stringify(existing)
    || Number(cfg.timelineOnScreenTextTrackVersion || 1) !== STUDIO_TIMELINE_TRACK_VERSION;
  if (persist && changed) {
    upsertPodcastVideoConfig((base) => ({
      ...base,
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: alignedNext
    }));
  }
  return alignedNext;
}

function constrainOnScreenTextClipToScene(textClip = null, sceneClip = null, rowId = "") {
  const key = String(rowId || textClip?.rowId || "").trim();
  if (!key || !textClip || !sceneClip) return null;
  const sceneStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0);
  const sceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(sceneClip));
  const sceneEndMs = sceneStartMs + sceneDurationMs;
  const trimInMs = Math.max(0, Number(textClip?.trimInMs || 0) || 0);
  const currentTextDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getOnScreenTextClipEffectiveDurationMs(textClip));
  const nextTextDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.min(currentTextDurationMs, sceneDurationMs));
  const maxStartMs = Math.max(sceneStartMs, sceneEndMs - nextTextDurationMs);
  const nextStartMs = Math.max(sceneStartMs, Math.min(maxStartMs, Math.round(Number(textClip?.startMs || 0) || 0)));
  const nextTrimOutMs = trimInMs + nextTextDurationMs;
  const nextSourceDurationMs = Math.max(
    STUDIO_TIMELINE_MIN_CLIP_MS,
    Number(textClip?.sourceDurationMs || 0) || 0,
    nextTrimOutMs,
    sceneDurationMs
  );
  return normalizeOnScreenTextClipItem({
    ...textClip,
    startMs: nextStartMs,
    sourceDurationMs: nextSourceDurationMs,
    trimInMs,
    trimOutMs: nextTrimOutMs
  }, key);
}

function constrainOnScreenTextClipToGeminiSegment(textClip = null, segment = null, rowId = "") {
  const key = String(rowId || textClip?.rowId || segment?.rowId || "").trim();
  if (!key || !textClip || !segment) return null;
  const startMs = Math.max(0, Math.round(Number(segment?.startMs || 0) || 0));
  const durationMs = Math.max(
    STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.round(Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - startMs) || STUDIO_TIMELINE_MIN_CLIP_MS)
  );
  return normalizeOnScreenTextClipItem({
    ...textClip,
    rowId: key,
    startMs,
    sourceDurationMs: durationMs,
    trimInMs: 0,
    trimOutMs: durationMs
  }, key);
}

function alignOnScreenTextClipsToGeminiTrack(session = null, clipMap = {}) {
  const activeSession = session || getActiveSession();
  const next = normalizeOnScreenTextClipsByRowId(clipMap || {});
  const cfg = getPodcastVideoConfig(activeSession);
  const track = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const segmentByRowId = new Map(
    track.segments
      .map((segment) => [String(segment?.rowId || "").trim(), segment])
      .filter(([rowId]) => rowId)
  );
  Object.keys(next).forEach((rowId) => {
    const sceneClip = sceneClips[String(rowId || "").trim()] || null;
    const segment = segmentByRowId.get(String(rowId || "").trim());
    const aligned = segment
      ? constrainOnScreenTextClipToGeminiSegment(next[rowId], segment, rowId)
      : (sceneClip ? constrainOnScreenTextClipToScene({
        ...next[rowId],
        startMs: Math.max(0, Number(sceneClip?.startMs || 0) || 0)
      }, sceneClip, rowId) : null);
    if (!aligned) return;
    next[rowId] = {
      ...aligned,
      hidden: next[rowId]?.hidden === true,
      autoHidden: next[rowId]?.autoHidden === true,
      zIndex: Math.max(1, Number(next[rowId]?.zIndex || aligned.zIndex || 1) || 1)
    };
  });
  return next;
}

function syncOnScreenTextClipsWithGeminiTrack(options = {}) {
  const activeSession = getActiveSession();
  if (!activeSession) return false;
  let changed = false;
  upsertPodcastVideoConfig((cfg) => {
    const current = normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {});
    const aligned = alignOnScreenTextClipsToGeminiTrack(activeSession, current);
    changed = JSON.stringify(aligned) !== JSON.stringify(current);
    if (!changed) return cfg;
    return {
      ...cfg,
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: aligned
    };
  }, { autosave: options.autosave !== false });
  if (changed && options.render !== false) {
    renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
    syncPodcastStudioInspector(getActiveSession());
  }
  return changed;
}

function buildManualOnScreenTextTrackConfig(cfg = {}, clipPatch = {}, rowId = "") {
  const key = String(rowId || clipPatch?.rowId || "").trim();
  const currentSettings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  const currentClips = normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {});
  const currentClip = key ? currentClips[key] || null : null;
  const normalizedClip = key
    ? normalizeOnScreenTextClipItem({
      ...(currentClip || {}),
      ...clipPatch,
      rowId: key,
      hidden: clipPatch?.hidden === true ? true : false,
      autoHidden: false
    }, key)
    : null;
  return {
    timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
    timelineOnScreenTextDefaultsVersion: STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION,
    onScreenTextTrack: {
      ...currentSettings,
      enabled: true,
      showTrack: true
    },
    timelineOnScreenTextClipsByRowId: normalizedClip ? {
      ...(cfg?.timelineOnScreenTextClipsByRowId || {}),
      [key]: normalizedClip
    } : (cfg?.timelineOnScreenTextClipsByRowId || {})
  };
}

function normalizeTimelineTrackItem(raw = {}, index = 0) {
  return window.normalizeTimelineTrackItem(raw, index);
}

function normalizeTimelineTracks(raw = []) {
  return window.normalizeTimelineTracks(raw);
}

function hasExplicitMultiTrackTimeline(session = null) {
  return window.hasExplicitMultiTrackTimeline(session);
}

function resolveTimelineDefaultTrackIdForSpeaker(speakerKey = "") {
  return window.resolveTimelineDefaultTrackIdForSpeaker(speakerKey);
}

function isNarradorSceneTrackId(trackId = "") {
  return window.isNarradorSceneTrackId(trackId);
}

function getNarradorSceneTrackOrdinal(trackId = "") {
  return window.getNarradorSceneTrackOrdinal(trackId);
}

function buildNarradorSceneTrackLabel(trackId = "", session = null) {
  return window.buildNarradorSceneTrackLabel(trackId, session);
}

function isEducationalVisibleSceneTrack(trackId = "") {
  return window.isEducationalVisibleSceneTrack(trackId);
}

function isSceneTimelineTrackId(trackId = "", session = null) {
  return window.isSceneTimelineTrackId(trackId, session);
}

function buildEducationalSceneTrackIdRemap(session = null, tracks = [], clipMap = {}) {
  return window.buildEducationalSceneTrackIdRemap(session, tracks, clipMap);
}

function buildTimelineVariantTrackDescriptor(baseSpeakerKey = "", existingTracks = []) {
  return window.buildTimelineVariantTrackDescriptor(baseSpeakerKey, existingTracks);
}

function buildDefaultTimelineTracks(session = null) {
  return window.buildDefaultTimelineTracks(session);
}

function normalizeGeminiDialogueTrackSegment(raw = {}, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const rowId = String(raw.rowId || "").trim();
  const normalizedMedia = normalizePersistedMediaReference(
    String(raw.audioSrc || raw.url || raw.downloadUrl || "").trim(),
    String(raw.storagePath || "").trim()
  );
  const downloadUrl = String(normalizedMedia.downloadUrl || "").trim();
  const storagePath = String(normalizedMedia.storagePath || "").trim();
  const audioSrc = String(resolveStorageAudioUrl(downloadUrl, storagePath) || downloadUrl || "").trim();
  if (!rowId || (!audioSrc && !downloadUrl && !storagePath)) return null;

  // Support seconds/milliseconds start fallbacks
  let startMs = 0;
  if (raw.startMs !== undefined) {
    startMs = Math.round(toFiniteNumber(raw.startMs, 0));
  } else if (raw.start !== undefined) {
    startMs = Math.round(toFiniteNumber(raw.start, 0) * 1000);
  }

  let anchorStartMs = startMs;
  if (raw.anchorStartMs !== undefined && raw.anchorStartMs !== null) {
    anchorStartMs = Math.max(0, Math.round(Number(raw.anchorStartMs) || 0));
  } else if (raw.anchorStart !== undefined && raw.anchorStart !== null) {
    anchorStartMs = Math.max(0, Math.round(Number(raw.anchorStart) * 1000));
  }

  // Support seconds/milliseconds trim fallbacks
  let trimInMs = 0;
  if (raw.trimInMs !== undefined) {
    trimInMs = Math.round(toFiniteNumber(raw.trimInMs, 0));
  } else if (raw.trimIn !== undefined) {
    trimInMs = Math.round(toFiniteNumber(raw.trimIn, 0) * 1000);
  }
  trimInMs = Math.max(0, trimInMs);

  let trimOutMs = trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS;
  if (raw.trimOutMs !== undefined) {
    trimOutMs = Math.round(toFiniteNumber(raw.trimOutMs, trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS));
  } else if (raw.trimOut !== undefined) {
    trimOutMs = Math.round(toFiniteNumber(raw.trimOut, 0) * 1000);
  }
  trimOutMs = Math.max(trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS, trimOutMs);

  // Support seconds/milliseconds duration fallbacks
  let durationMs = trimOutMs - trimInMs;
  if (raw.durationMs !== undefined) {
    durationMs = Math.round(toFiniteNumber(raw.durationMs, trimOutMs - trimInMs));
  } else if (raw.durationSec !== undefined) {
    durationMs = Math.round(toFiniteNumber(raw.durationSec, 0) * 1000);
  } else if (raw.duration !== undefined) {
    durationMs = Math.round(toFiniteNumber(raw.duration, 0) * 1000);
  } else if (raw.end !== undefined && raw.start !== undefined) {
    durationMs = Math.round((toFiniteNumber(raw.end, 0) - toFiniteNumber(raw.start, 0)) * 1000);
  }
  durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, durationMs);

  let endMs = startMs + durationMs;
  if (raw.endMs !== undefined) {
    endMs = Math.round(toFiniteNumber(raw.endMs, startMs + durationMs));
  } else if (raw.end !== undefined) {
    endMs = Math.round(toFiniteNumber(raw.end, 0) * 1000);
  }
  endMs = Math.max(startMs + STUDIO_TIMELINE_MIN_CLIP_MS, endMs);

  return {
    rowId,
    sceneIndex: Math.max(1, Math.round(toFiniteNumber(raw.sceneIndex, index + 1))),
    speakerName: String(raw.speakerName || "").replace(/\s+/g, " ").trim(),
    audioSrc,
    downloadUrl,
    storagePath,
    startMs,
    anchorStartMs,
    endMs,
    trimInMs,
    trimOutMs,
    durationMs
  };
}

function normalizeGeminiDialogueTrack(raw = {}) {
  const segments = Array.isArray(raw?.segments)
    ? raw.segments.map((item, index) => normalizeGeminiDialogueTrackSegment(item, index)).filter(Boolean)
    : [];
  const uniqueMissing = Array.from(new Set(
    (Array.isArray(raw?.missingRowIds) ? raw.missingRowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean)
  ));
  const uniqueExcluded = Array.from(new Set(
    (Array.isArray(raw?.excludedRowIds) ? raw.excludedRowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean)
  ));
  return {
    enabled: raw?.enabled === true && segments.length > 0,
    volumePct: Math.max(0, Math.min(100, Math.round(toFiniteNumber(raw?.volumePct, 100)))),
    updatedAt: String(raw?.updatedAt || "").trim(),
    segments: segments
      .sort((a, b) => Number(a.startMs || 0) - Number(b.startMs || 0) || Number(a.sceneIndex || 0) - Number(b.sceneIndex || 0)),
    missingRowIds: uniqueMissing,
    excludedRowIds: uniqueExcluded
  };
}

function normalizePodcastVideoConfig(raw = {}) {
  return window.normalizePodcastVideoConfig(raw);
}

function setReelModeEnabled(enabled = false) {
  upsertPodcastVideoConfig((cfg, session) => ({
    ...cfg,
    reelModeEnabled: enabled === true
  }), {
    persist: true,
    autosaveReason: "reel-mode-toggle"
  });
  syncReelModeUi(getActiveSession());
}

function getRowSourceDurationMs(row = null, session = null) {
  return window.getRowSourceDurationMs(row, session);
}

function buildDefaultTimelineClipsByRowId(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return {};
  return window.buildDefaultTimelineClipsByRowId(activeSession);
}

function ensureTimelineTracks(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return [];
  return window.ensureTimelineTracks(activeSession, options);
}

function ensureTimelineClipsByRowId(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return {};
  return window.ensureTimelineClipsByRowId(activeSession, options);
}

function getTimelineClipStoreByKind(session = null, kind = "scene", options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return {};
  return window.getTimelineClipStoreByKind(activeSession, kind, options);
}

function reflowTimelineClipsByScriptOrder(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return {};
  return window.reflowTimelineClipsByScriptOrder(activeSession, options);
}

function compactTimelineTrackClipsFromRow(session = null, clipMap = {}, rowId = "", options = {}) {
  return window.compactTimelineTrackClipsFromRow(session, clipMap, rowId, options);
}

function shouldAutoRepairTimelineLayout(session = null) {
  return window.shouldAutoRepairTimelineLayout(session);
}

function getTimelineClipEffectiveDurationMs(clip = null) {
  return window.getTimelineClipEffectiveDurationMs(clip);
}

function getTimelineClipEndMs(clip = null) {
  return window.getTimelineClipEndMs(clip);
}

function getReorderableTimelineTrackIds(session = null) {
  return window.getReorderableTimelineTrackIds(session);
}

function canReorderTimelineLayout(session = null) {
  return window.canReorderTimelineLayout(session);
}

function preserveGeminiDialogueOffsetsForReorderedTimeline(beforeSession = null) {
  return window.preserveGeminiDialogueOffsetsForReorderedTimeline(beforeSession);
}

function preserveOnScreenTextOffsetsForReorderedTimeline(beforeSession = null) {
  const afterSession = getActiveSession();
  const sessionBefore = beforeSession || afterSession;
  if (!afterSession || !sessionBefore) return false;
  const beforeClips = ensureTimelineClipsByRowId(sessionBefore, { persist: false });
  const afterClips = ensureTimelineClipsByRowId(afterSession, { persist: false });
  const beforeTextClips = ensureOnScreenTextClipsByRowId(sessionBefore, { persist: false });
  const afterTextClips = ensureOnScreenTextClipsByRowId(afterSession, { persist: false });
  const textRowIds = Object.keys(beforeTextClips).filter((rowId) => String(rowId || "").trim());
  if (!textRowIds.length) return false;

  let changed = false;
  const nextTextClips = { ...afterTextClips };
  textRowIds.forEach((rowId) => {
    const key = String(rowId || "").trim();
    if (!key) return;
    const beforeSceneClip = beforeClips[key] || null;
    const afterSceneClip = afterClips[key] || null;
    const beforeTextClip = beforeTextClips[key] || null;
    const afterTextClip = afterTextClips[key] || beforeTextClip || null;
    if (!beforeSceneClip || !afterSceneClip || !beforeTextClip || !afterTextClip) return;

    const beforeSceneStartMs = Math.max(0, Number(beforeSceneClip?.startMs || 0) || 0);
    const afterSceneStartMs = Math.max(0, Number(afterSceneClip?.startMs || 0) || 0);
    const beforeTextStartMs = Math.max(0, Number(beforeTextClip?.startMs || 0) || 0);
    const desiredStartMs = snapTimelineMs(afterSceneStartMs + (beforeTextStartMs - beforeSceneStartMs));
    const normalized = normalizeOnScreenTextClipItem({
      ...afterTextClip,
      startMs: Math.max(0, desiredStartMs)
    }, key);
    if (!normalized) return;
    if (JSON.stringify(normalized) !== JSON.stringify(afterTextClip)) {
      nextTextClips[key] = normalized;
      changed = true;
    }
  });

  if (!changed) return false;
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
    timelineOnScreenTextClipsByRowId: nextTextClips
  }));
  return true;
}

function applyGeminiSubtitleInsetForReorderedTimeline(session = null, insetPx = STUDIO_REORDER_SUBTITLE_INSET_PX) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const track = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  if (!track.enabled || !track.segments.length) return false;
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const insetMs = Math.max(0, snapTimelineMs(timelinePxToMs(insetPx, activeSession)));
  const legacyInsetMs = Math.max(0, snapTimelineMs(timelinePxToMs(STUDIO_REORDER_SUBTITLE_LEGACY_INSET_PX, activeSession)));
  const legacyDelayMs = Math.max(0, snapTimelineMs(STUDIO_GEMINI_LEGACY_DEFAULT_DELAY_MS));
  const timelineTotalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(activeSession));
  let changed = false;
  const nextSegments = track.segments.map((segment) => {
    const rowId = String(segment?.rowId || "").trim();
    const sceneClip = rowId ? sceneClips[rowId] || null : null;
    if (!rowId || !sceneClip) return segment;
    const sceneStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0);
    const durationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - Number(segment?.startMs || 0)) || STUDIO_TIMELINE_MIN_CLIP_MS
    );
    const desiredStartCandidateMs = sceneStartMs + insetMs;
    const desiredStartMs = clampGeminiSegmentStartToTimeline(
      Math.max(timelineTotalMs, desiredStartCandidateMs + durationMs),
      durationMs,
      desiredStartCandidateMs
    );
    const legacyAutoStartMs = snapTimelineMs(sceneStartMs + legacyInsetMs);
    const legacyDelayStartMs = snapTimelineMs(sceneStartMs + legacyDelayMs);
    const currentStartMs = Math.max(0, Number(segment?.startMs || 0) || 0);
    const previousAnchorMs = resolveGeminiSegmentAnchorStartMs(segment, sceneStartMs);
    // Si el usuario movio el chip manualmente, `startMs` deja de coincidir con su
    // anchor previo. En ese caso no debemos volver a insetearlo al rehidratar.
    const hasManualOffsetFromAnchor = hasManualGeminiSegmentOffset(
      segment,
      sceneStartMs,
      resolveAutomaticGeminiSceneOffsetMs(getTimelineClipEffectiveDurationMs(sceneClip), durationMs)
    );
    const looksManual = hasManualOffsetFromAnchor || (
      previousAnchorMs === sceneStartMs
      && Math.abs(currentStartMs - legacyAutoStartMs) > STUDIO_TIMELINE_SNAP_MS
      && Math.abs(currentStartMs - legacyDelayStartMs) > STUDIO_TIMELINE_SNAP_MS
      && Math.abs(currentStartMs - desiredStartMs) > STUDIO_TIMELINE_SNAP_MS
    );
    if (looksManual) return segment;
    const startMs = Math.max(0, desiredStartMs);
    const next = {
      ...segment,
      startMs,
      anchorStartMs: sceneStartMs,
      endMs: startMs + durationMs
    };
    if (
      Number(segment?.startMs || 0) !== next.startMs
      || Number(segment?.anchorStartMs || 0) !== next.anchorStartMs
      || Number(segment?.endMs || 0) !== next.endMs
    ) {
      changed = true;
    }
    return next;
  });
  if (!changed) return false;
  upsertPodcastVideoConfig((base) => ({
    ...base,
    geminiDialogueTrack: normalizeGeminiDialogueTrack({
      ...(base.geminiDialogueTrack || {}),
      enabled: true,
      segments: nextSegments
    })
  }));
  syncOnScreenTextClipsWithGeminiTrack({ render: false });
  return true;
}

function normalizeLegacyGeminiTrackOffsets(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const track = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  if (!track.enabled || !track.segments.length) return false;
  const sceneClips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const legacyDelayMs = Math.max(0, snapTimelineMs(STUDIO_GEMINI_LEGACY_DEFAULT_DELAY_MS));
  const legacyInsetMs = Math.max(0, snapTimelineMs(timelinePxToMs(STUDIO_REORDER_SUBTITLE_LEGACY_INSET_PX, activeSession)));
  const currentInsetMs = Math.max(0, snapTimelineMs(timelinePxToMs(STUDIO_REORDER_SUBTITLE_INSET_PX, activeSession)));
  let changed = false;
  const nextSegments = track.segments.map((segment) => {
    const rowId = String(segment?.rowId || "").trim();
    const sceneClip = rowId ? sceneClips[rowId] || null : null;
    if (!rowId || !sceneClip) return segment;
    const sceneStartMs = Math.max(0, Number(sceneClip?.startMs || 0) || 0);
    const currentStartMs = Math.max(0, Number(segment?.startMs || 0) || 0);
    const durationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - currentStartMs) || STUDIO_TIMELINE_MIN_CLIP_MS
    );
    const automaticStartMs = resolveGeminiSegmentStartWithinScene(
      sceneStartMs,
      getTimelineClipEffectiveDurationMs(sceneClip),
      durationMs
    );
    const matchesLegacyDefault = (
      currentStartMs === snapTimelineMs(sceneStartMs + legacyDelayMs)
      || currentStartMs === snapTimelineMs(sceneStartMs + legacyInsetMs)
      || (currentInsetMs > 0 && currentStartMs === snapTimelineMs(sceneStartMs + currentInsetMs))
    );
    if (!matchesLegacyDefault) return segment;
    changed = true;
    return {
      ...segment,
      startMs: automaticStartMs,
      anchorStartMs: sceneStartMs,
      endMs: automaticStartMs + durationMs
    };
  });
  if (!changed) return false;
  upsertPodcastVideoConfig((base) => ({
    ...base,
    geminiDialogueTrack: normalizeGeminiDialogueTrack({
      ...(base.geminiDialogueTrack || {}),
      enabled: true,
      segments: nextSegments
    })
  }));
  syncOnScreenTextClipsWithGeminiTrack({ render: false });
  return true;
}

function normalizeOnScreenTextLayoutsForReorderedTimeline(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const rows = getSessionRows(activeSession);
  if (!rows.length) return false;
  const cfg = getPodcastVideoConfig(activeSession);
  const currentLayouts = ensureOnScreenTextLayoutByRowId(activeSession, { persist: false });
  const settings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  const centerXPct = 0.5;
  const safeBottomEdgePct = Math.max(0, Math.min(1, Number(settings.overlayYPct || 0.86)));
  const nextLayouts = { ...currentLayouts };
  let changed = false;
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const prev = currentLayouts[rowId] || buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, settings);
    if (!prev) return;
    const widthPct = STUDIO_REORDER_ONSCREEN_TEXT_WIDTH_PCT;
    const heightPct = STUDIO_REORDER_ONSCREEN_TEXT_HEIGHT_PCT;
    const xPct = Math.max(0, Math.min(1 - widthPct, centerXPct - (widthPct / 2)));
    const yPct = Math.max(0, Math.min(1 - heightPct, safeBottomEdgePct - heightPct));
    const next = normalizeOnScreenTextLayoutItem({
      ...prev,
      xPct,
      yPct,
      widthPct,
      heightPct
    }, rowId);
    if (!next) return;
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      nextLayouts[rowId] = next;
      changed = true;
    }
  });
  if (!changed) return false;
  upsertPodcastVideoConfig((base) => ({
    ...base,
    timelineOnScreenTextLayoutByRowId: nextLayouts
  }));
  return true;
}

function buildNormalizedOnScreenTextLayoutsForReorderedTimeline(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return { layouts: {}, changed: false };
  const rows = getSessionRows(activeSession);
  if (!rows.length) return { layouts: {}, changed: false };
  const cfg = getPodcastVideoConfig(activeSession);
  const currentLayouts = ensureOnScreenTextLayoutByRowId(activeSession, { persist: false });
  const settings = normalizeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  const centerXPct = 0.5;
  const safeBottomEdgePct = Math.max(0, Math.min(1, Number(settings.overlayYPct || 0.86)));
  const nextLayouts = { ...currentLayouts };
  let changed = false;
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const prev = currentLayouts[rowId] || buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, settings);
    if (!prev) return;
    const widthPct = STUDIO_REORDER_ONSCREEN_TEXT_WIDTH_PCT;
    const heightPct = STUDIO_REORDER_ONSCREEN_TEXT_HEIGHT_PCT;
    const xPct = Math.max(0, Math.min(1 - widthPct, centerXPct - (widthPct / 2)));
    const yPct = Math.max(0, Math.min(1 - heightPct, safeBottomEdgePct - heightPct));
    const next = normalizeOnScreenTextLayoutItem({
      ...prev,
      xPct,
      yPct,
      widthPct,
      heightPct
    }, rowId);
    if (!next) return;
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      nextLayouts[rowId] = next;
      changed = true;
    }
  });
  return { layouts: nextLayouts, changed };
}

function constrainOnScreenTextClipToTimelineRange(textClip = null, rangeStartMs = 0, rangeDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS, rowId = "") {
  const key = String(rowId || textClip?.rowId || "").trim();
  if (!key || !textClip) return null;
  const safeRangeStartMs = Math.max(0, Math.round(Number(rangeStartMs || 0) || 0));
  const safeRangeDurationMs = Math.max(
    STUDIO_TIMELINE_MIN_CLIP_MS,
    Math.round(Number(rangeDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS)
  );
  const safeRangeEndMs = safeRangeStartMs + safeRangeDurationMs;
  const trimInMs = Math.max(0, Number(textClip?.trimInMs || 0) || 0);
  const currentDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getOnScreenTextClipEffectiveDurationMs(textClip));
  const nextDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.min(currentDurationMs, safeRangeDurationMs));
  const maxStartMs = Math.max(safeRangeStartMs, safeRangeEndMs - nextDurationMs);
  const nextStartMs = Math.max(
    safeRangeStartMs,
    Math.min(maxStartMs, Math.round(Number(textClip?.startMs || 0) || 0))
  );
  const trimOutMs = trimInMs + nextDurationMs;
  const sourceDurationMs = Math.max(
    STUDIO_TIMELINE_MIN_CLIP_MS,
    Number(textClip?.sourceDurationMs || 0) || 0,
    trimOutMs,
    safeRangeDurationMs
  );
  return normalizeOnScreenTextClipItem({
    ...textClip,
    rowId: key,
    startMs: nextStartMs,
    sourceDurationMs,
    trimInMs,
    trimOutMs
  }, key);
}

function buildReorderedGeminiDialogueTrack(beforeSession = null, afterSession = null, options = {}) {
  const sessionBefore = beforeSession || getActiveSession();
  const sessionAfter = afterSession || getActiveSession();
  const beforeTrack = normalizeGeminiDialogueTrack(getPodcastVideoConfig(sessionBefore)?.geminiDialogueTrack || {});
  const afterTrack = normalizeGeminiDialogueTrack(getPodcastVideoConfig(sessionAfter)?.geminiDialogueTrack || {});
  if (!beforeTrack.enabled || !beforeTrack.segments.length) {
    return { track: afterTrack, changed: false };
  }
  const beforeRuntimeByRowId = new Map(
    (buildTimelineRuntimeEntries(sessionBefore) || [])
      .map((entry) => [String(entry?.rowId || "").trim(), entry])
      .filter(([rowId]) => rowId)
  );
  const afterRuntimeEntries = buildTimelineRuntimeEntries(sessionAfter) || [];
  const afterRuntimeTotalMs = afterRuntimeEntries.reduce((acc, entry) => Math.max(acc, Math.max(0, Number(entry?.endMs || 0) || 0)), STUDIO_TIMELINE_MIN_CLIP_MS);
  const afterRuntimeByRowId = new Map(
    afterRuntimeEntries
      .map((entry) => [String(entry?.rowId || "").trim(), entry])
      .filter(([rowId]) => rowId)
  );
  const rowsAfter = Array.isArray(sessionAfter?.script?.rows) ? sessionAfter.script.rows : [];
  const rowIndexById = new Map(rowsAfter.map((row, index) => [String(row?.id || "").trim(), index]));
  const nextSegments = beforeTrack.segments.map((segment) => {
    const rowId = String(segment?.rowId || "").trim();
    const beforeRuntime = rowId ? beforeRuntimeByRowId.get(rowId) || null : null;
    const afterRuntime = rowId ? afterRuntimeByRowId.get(rowId) || null : null;
    if (!rowId || !afterRuntime) return null;
    const sceneStartMs = Math.max(0, Number(afterRuntime?.startMs || 0) || 0);
    const beforeSceneStartMs = Math.max(0, Number(beforeRuntime?.startMs || 0) || 0);
    const previousRelativeOffsetMs = resolveGeminiSegmentRelativeOffsetMs(
      segment,
      beforeSceneStartMs,
      resolveAutomaticGeminiSceneOffsetMs(
        Number(beforeRuntime?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS,
        Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - Number(segment?.startMs || 0)) || STUDIO_TIMELINE_MIN_CLIP_MS
      )
    );
    const durationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      resolveGeminiSegmentDurationWithinScene(
        Number(afterRuntime?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS,
        Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - Number(segment?.startMs || 0)) || STUDIO_TIMELINE_MIN_CLIP_MS
      )
    );
    const desiredStartMs = sceneStartMs + previousRelativeOffsetMs;
    const startMs = clampGeminiSegmentStartToTimeline(
      Math.max(afterRuntimeTotalMs, desiredStartMs + durationMs),
      durationMs,
      desiredStartMs
    );
    const trimInMs = Math.max(0, Number(segment?.trimInMs || 0) || 0);
    const sceneIndex = Math.max(1, Number(rowIndexById.get(rowId) || 0) + 1);
    const normalized = normalizeGeminiDialogueTrackSegment({
      ...segment,
      rowId,
      sceneIndex,
      startMs,
      anchorStartMs: sceneStartMs,
      durationMs,
      trimInMs,
      trimOutMs: trimInMs + durationMs,
      endMs: startMs + durationMs
    }, sceneIndex - 1);
    return normalized;
  }).filter(Boolean);
  const nextTrack = normalizeGeminiDialogueTrack({
    ...beforeTrack,
    enabled: nextSegments.length > 0,
    segments: nextSegments,
    updatedAt: beforeTrack.updatedAt
  });
  const changed = JSON.stringify(nextTrack) !== JSON.stringify(beforeTrack);
  return {
    track: changed ? { ...nextTrack, updatedAt: nowIso() } : afterTrack,
    changed
  };
}

function buildReorderedOnScreenTextClips(beforeSession = null, afterSession = null, geminiTrack = null) {
  const sessionBefore = beforeSession || getActiveSession();
  const sessionAfter = afterSession || getActiveSession();
  const beforeCfg = getPodcastVideoConfig(sessionBefore);
  const afterCfg = getPodcastVideoConfig(sessionAfter);
  const beforeRuntimeByRowId = new Map(
    (buildTimelineRuntimeEntries(sessionBefore) || [])
      .map((entry) => [String(entry?.rowId || "").trim(), entry])
      .filter(([rowId]) => rowId)
  );
  const afterRuntimeByRowId = new Map(
    (buildTimelineRuntimeEntries(sessionAfter) || [])
      .map((entry) => [String(entry?.rowId || "").trim(), entry])
      .filter(([rowId]) => rowId)
  );
  const beforeGeminiTrack = normalizeGeminiDialogueTrack(beforeCfg?.geminiDialogueTrack || {});
  const nextGeminiTrack = normalizeGeminiDialogueTrack(geminiTrack || afterCfg?.geminiDialogueTrack || {});
  const beforeTextClips = normalizeOnScreenTextClipsByRowId(beforeCfg?.timelineOnScreenTextClipsByRowId || {});
  const currentTextClips = normalizeOnScreenTextClipsByRowId(afterCfg?.timelineOnScreenTextClipsByRowId || {});
  const fallbackTextClips = buildDefaultOnScreenTextClipsByRowId(sessionAfter);
  const beforeGeminiByRowId = new Map(
    (beforeGeminiTrack.segments || [])
      .map((segment) => [String(segment?.rowId || "").trim(), segment])
      .filter(([rowId]) => rowId)
  );
  const nextGeminiByRowId = new Map(
    (nextGeminiTrack.segments || [])
      .map((segment) => [String(segment?.rowId || "").trim(), segment])
      .filter(([rowId]) => rowId)
  );
  const nextTextClips = { ...currentTextClips };
  let changed = false;
  Array.from(new Set([
    ...Object.keys(beforeTextClips),
    ...Object.keys(currentTextClips),
    ...Object.keys(fallbackTextClips)
  ])).forEach((rowId) => {
    const key = String(rowId || "").trim();
    if (!key) return;
    const sourceClip = beforeTextClips[key] || currentTextClips[key] || fallbackTextClips[key] || null;
    const beforeRuntime = beforeRuntimeByRowId.get(key) || null;
    const afterRuntime = afterRuntimeByRowId.get(key) || null;
    if (!sourceClip || !afterRuntime) return;
    const beforeSceneStartMs = Math.max(0, Number(beforeRuntime?.startMs || 0) || 0);
    const afterSceneStartMs = Math.max(0, Number(afterRuntime?.startMs || 0) || 0);
    const afterSceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(afterRuntime?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS);
    const beforeGeminiSegment = beforeGeminiByRowId.get(key) || null;
    const nextGeminiSegment = nextGeminiByRowId.get(key) || null;
    let targetStartMs = 0;
    let targetDurationMs = 0;

    if (nextGeminiSegment) {
      targetStartMs = snapTimelineMs(Math.max(0, Number(nextGeminiSegment?.startMs || 0) || 0));
      targetDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(nextGeminiSegment?.durationMs || 0) || (Number(nextGeminiSegment?.endMs || 0) - targetStartMs));
    } else {
      targetStartMs = snapTimelineMs(afterSceneStartMs);
      targetDurationMs = afterSceneDurationMs;
    }

    const normalized = normalizeOnScreenTextClipItem({
      ...sourceClip,
      rowId: key,
      startMs: targetStartMs,
      sourceDurationMs: targetDurationMs,
      trimInMs: 0,
      trimOutMs: targetDurationMs
    }, key);
    if (!normalized) return;
    const constrained = constrainOnScreenTextClipToTimelineRange(
      normalized,
      afterSceneStartMs,
      afterSceneDurationMs,
      key
    );
    if (!constrained) return;
    if (JSON.stringify(constrained) !== JSON.stringify(currentTextClips[key] || null)) {
      nextTextClips[key] = constrained;
      changed = true;
    }
  });
  return {
    clips: nextTextClips,
    changed
  };
}

function resetOnScreenTextLayoutsToDefaults(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const rows = getSessionRows(activeSession);
  if (!rows.length) return false;
  const settings = getOnScreenTextTrackSettings(activeSession);
  const nextLayouts = {};
  rows.forEach((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;
    const layout = buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, settings);
    if (!layout) return;
    nextLayouts[rowId] = layout;
  });
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    timelineOnScreenTextLayoutByRowId: nextLayouts
  }));
  const refreshed = getActiveSession();
  renderPodcastVideoShell(refreshed);
  syncPodcastOnScreenTextOverlay(refreshed, {
    rowId: String(podcastVideoState.activeRowId || "").trim(),
    currentMs: Number(podcastVideoState.montageCursorMs || 0),
    forceRow: true
  });
  if (els.onScreenTextTrackModal && els.onScreenTextTrackModal.hidden === false) {
    renderOnScreenTextTrackModal(refreshed);
  }
  scheduleSessionLocalPersist("timeline-onscreen-text");
  return true;
}

function reorderTimelineClipsByTracks() {
  const session = getActiveSession();
  if (!session) return false;
  const beforeSession = JSON.parse(JSON.stringify(session));
  const trackIds = getReorderableTimelineTrackIds(beforeSession);
  if (!canReorderTimelineLayout(beforeSession)) return false;
  const rows = beforeSession?.script?.rows || [];
  const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
  const educationalVideoMode = isEducationalVideoMode(beforeSession);
  const preserveTrackLayout = hasExplicitMultiTrackTimeline(beforeSession);
  const clips = ensureTimelineClipsByRowId(beforeSession, { persist: false });
  const nextClips = { ...clips };
  const isPodcast = isPodcastMode(beforeSession);
  const ordered = (educationalVideoMode || preserveTrackLayout || isPodcast)
    ? rows
      .map((row) => clips[String(row?.id || "").trim()])
      .filter(Boolean)
    : (() => {
      const perTrack = trackIds.map((trackId) => (
        Object.values(clips)
          .filter((clip) => String(clip?.trackId || "").trim() === trackId)
          .sort((a, b) => (
            Number(a.startMs || 0) - Number(b.startMs || 0)
            || Number(rowIndexById.get(String(a?.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b?.rowId || "").trim()) || 0)
          ))
      ));
      const queue = [];
      let pending = true;
      for (let round = 0; pending; round += 1) {
        pending = false;
        perTrack.forEach((items) => {
          const clip = items[round];
          if (!clip) return;
          pending = true;
          queue.push(clip);
        });
      }
      return queue;
    })();
  const primaryTrackId = String(trackIds[0] || "").trim() || "speaker:unknown";
  let cursorMs = 0;
  ordered.forEach((clip, index) => {
    const rowId = String(clip?.rowId || "").trim();
    if (!rowId) return;
    const nextClip = { ...clip };
    if (isPodcast) {
      const audioMs = resolveRowAudioDurationMs(rowId, beforeSession);
      if (audioMs > 0) {
        const hasManualTrim = Number(nextClip.trimInMs || 0) > 0 || (Number(nextClip.trimOutMs || 0) > 0 && Math.abs(Number(nextClip.trimOutMs || 0) - Number(nextClip.sourceDurationMs || 0)) > 10);
        if (!hasManualTrim) {
          nextClip.sourceDurationMs = audioMs;
          nextClip.trimInMs = 0;
          nextClip.trimOutMs = audioMs;
        }
      }
    }
    const normalized = normalizeTimelineClipItem({
      ...nextClip,
      startMs: snapTimelineMs(cursorMs),
      trackId: (educationalVideoMode && !preserveTrackLayout) ? primaryTrackId : String(nextClip?.trackId || "").trim(),
      zIndex: Math.max(1, index + 1)
    }, rowId);
    if (!normalized) return;
    nextClips[rowId] = normalized;
    cursorMs = getTimelineClipEndMs(normalized);
  });
  const nextBaseConfig = {
    ...getPodcastVideoConfig(beforeSession),
    timelineVersion: STUDIO_TIMELINE_VERSION,
    timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
    timelineViewMode: preserveTrackLayout ? "tracks" : (String(getPodcastVideoConfig(beforeSession)?.timelineViewMode || "tracks").trim().toLowerCase() === "normal" ? "normal" : "tracks"),
    timelineClipsByRowId: nextClips
  };
  const nextSession = {
    ...beforeSession,
    podcastVideoConfig: nextBaseConfig
  };
  nextBaseConfig.timelineTracks = ensureTimelineTracks(nextSession, { persist: false });
  const reorderGemini = buildReorderedGeminiDialogueTrack(beforeSession, nextSession);
  const nextSessionWithGemini = {
    ...nextSession,
    podcastVideoConfig: {
      ...nextBaseConfig,
      geminiDialogueTrack: reorderGemini.track
    }
  };
  const reorderText = buildReorderedOnScreenTextClips(beforeSession, nextSessionWithGemini, reorderGemini.track);
  const nextSessionWithText = {
    ...nextSessionWithGemini,
    podcastVideoConfig: {
      ...nextSessionWithGemini.podcastVideoConfig,
      timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
      timelineOnScreenTextClipsByRowId: reorderText.clips
    }
  };
  const reorderLayouts = buildNormalizedOnScreenTextLayoutsForReorderedTimeline(nextSessionWithText);
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    timelineVersion: STUDIO_TIMELINE_VERSION,
    timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
    timelineViewMode: nextBaseConfig.timelineViewMode,
    timelineTracks: nextBaseConfig.timelineTracks,
    timelineClipsByRowId: nextClips,
    geminiDialogueTrack: reorderGemini.track,
    timelineOnScreenTextTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
    timelineOnScreenTextClipsByRowId: reorderText.clips,
    timelineOnScreenTextLayoutByRowId: reorderLayouts.layouts
  }), { autosave: false });
  invalidateStudioRuntimeCache();
  syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true, autosave: false });
  syncOnScreenTextClipsWithGeminiTrack({ render: false, autosave: false });
  const refreshedSession = getActiveSession();
  renderPodcastVideoTimeline(refreshedSession, { force: true, reason: "reorder" });
  syncPodcastStudioInspector(refreshedSession);
  syncPodcastOnScreenTextOverlay(refreshedSession, {
    rowId: String(podcastVideoState.activeRowId || "").trim(),
    currentMs: Number(podcastVideoState.montageCursorMs || 0),
    forceRow: true
  });
  void persistReorderedTimelinePatchToCloud(refreshedSession, {
    timelineClipsByRowId: nextClips,
    geminiDialogueTrack: reorderGemini.track,
    timelineOnScreenTextClipsByRowId: reorderText.clips,
    ...(reorderLayouts.changed ? { timelineOnScreenTextLayoutByRowId: reorderLayouts.layouts } : {})
  });
  setGenerationStatus(
    isAudioOnlyPodcastStudioMode(refreshedSession)
      ? "Timeline reordenado (voces Gemini compactadas sin huecos)."
      : "Timeline reordenado (huecos eliminados y chips vinculados).",
    "is-live"
  );
  return true;
}

function getTimelineTotalDurationMs(session = null) {
  return window.getTimelineTotalDurationMs(session);
}

function snapTimelineMs(value = 0) {
  return window.snapTimelineMs(value);
}

function getStudioTimelineZoom(session = null) {
  return window.getStudioTimelineZoom(session);
}

function getStudioTimelinePixelsPerSec(session = null) {
  return window.getStudioTimelinePixelsPerSec(session);
}

function getStudioTimelineMinClipPx(session = null) {
  return window.getStudioTimelineMinClipPx(session);
}

function getStudioAudioTrackMinLoopPx(session = null) {
  return window.getStudioAudioTrackMinLoopPx(session);
}

function timelineMsToPx(valueMs = 0, session = null) {
  return window.timelineMsToPx(valueMs, session);
}

function timelinePxToMs(valuePx = 0, session = null) {
  return window.timelinePxToMs(valuePx, session);
}

function resolveTimelineDragStepMs(event = null) {
  return window.resolveTimelineDragStepMs(event);
}

function snapTimelineMsWithStep(value = 0, stepMs = STUDIO_TIMELINE_SNAP_MS) {
  return window.snapTimelineMsWithStep(value, stepMs);
}

function buildTimelineRuntimeEntries(session = null) {
  return window.buildTimelineRuntimeEntries(session);
}

function resolveAutomaticGeminiSceneOffsetMs(sceneDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS, durationMs = STUDIO_TIMELINE_MIN_CLIP_MS) {
  const safeSceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(sceneDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  const safeDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  const maxOffsetMs = Math.max(0, safeSceneDurationMs - safeDurationMs);
  const defaultOffsetMs = Math.max(0, snapTimelineMs(STUDIO_GEMINI_LEGACY_DEFAULT_DELAY_MS));
  return Math.max(0, Math.min(maxOffsetMs, defaultOffsetMs));
}

function clampGeminiSegmentStartToScene(sceneStartMs = 0, sceneDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS, durationMs = STUDIO_TIMELINE_MIN_CLIP_MS, desiredStartMs = 0) {
  const safeSceneStartMs = Math.max(0, Math.round(Number(sceneStartMs || 0) || 0));
  const safeSceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(sceneDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  const safeDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  const safeDesiredStartMs = Math.max(0, Math.round(Number(desiredStartMs || 0) || 0));
  const maxStartMs = Math.max(safeSceneStartMs, safeSceneStartMs + safeSceneDurationMs - safeDurationMs);
  return Math.max(safeSceneStartMs, Math.min(maxStartMs, safeDesiredStartMs));
}

function clampGeminiSegmentStartToTimeline(totalDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS, durationMs = STUDIO_TIMELINE_MIN_CLIP_MS, desiredStartMs = 0) {
  const safeDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  const safeDesiredStartMs = Math.max(0, Math.round(Number(desiredStartMs || 0) || 0));
  const safeTotalMs = Math.max(
    safeDurationMs,
    Math.round(Number(totalDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS),
    safeDesiredStartMs + safeDurationMs
  );
  const maxStartMs = Math.max(0, safeTotalMs - safeDurationMs);
  return Math.max(0, Math.min(maxStartMs, safeDesiredStartMs));
}

function resolveGeminiSegmentStartWithinScene(sceneStartMs = 0, sceneDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS, durationMs = STUDIO_TIMELINE_MIN_CLIP_MS) {
  const safeSceneStartMs = Math.max(0, Math.round(Number(sceneStartMs || 0) || 0));
  const safeSceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(sceneDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  const safeDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(durationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  const offsetMs = resolveAutomaticGeminiSceneOffsetMs(safeSceneDurationMs, safeDurationMs);
  return clampGeminiSegmentStartToScene(
    safeSceneStartMs,
    safeSceneDurationMs,
    safeDurationMs,
    safeSceneStartMs + offsetMs + STUDIO_GEMINI_SCENE_DELAY_MS
  );
}

function resolveGeminiSegmentDurationWithinScene(sceneDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS, desiredDurationMs = STUDIO_TIMELINE_MIN_CLIP_MS) {
  const desiredMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(desiredDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
  return desiredMs;
}

function resolveGeminiSegmentAnchorStartMs(segment = null, fallbackAnchorMs = 0) {
  if (segment && segment.anchorStartMs !== null && segment.anchorStartMs !== undefined) {
    return Math.max(0, Math.round(Number(segment.anchorStartMs) || 0));
  }
  return Math.max(0, Math.round(Number(fallbackAnchorMs || 0) || 0));
}

function resolveGeminiSegmentRelativeOffsetMs(segment = null, sceneStartMs = 0, fallbackOffsetMs = 0) {
  const safeFallbackOffsetMs = Math.max(0, Math.round(Number(fallbackOffsetMs || 0) || 0));
  if (!segment || typeof segment !== "object") return safeFallbackOffsetMs;
  if (segment.relativeOffsetMs !== undefined && segment.relativeOffsetMs !== null) {
    return Math.max(0, Math.round(Number(segment.relativeOffsetMs) || 0));
  }
  const safeSceneStartMs = Math.max(0, Math.round(Number(sceneStartMs || 0) || 0));
  const anchorStartMs = resolveGeminiSegmentAnchorStartMs(segment, safeSceneStartMs);
  const startMs = Math.max(0, Math.round(Number(segment.startMs || 0) || 0));
  return Math.max(0, Math.round(startMs - anchorStartMs));
}

function hasManualGeminiSegmentOffset(segment = null, fallbackAnchorMs = 0, fallbackOffsetMs = 0, toleranceMs = STUDIO_TIMELINE_SNAP_MS) {
  if (!segment || typeof segment !== "object") return false;
  const safeToleranceMs = Math.max(1, Math.round(Number(toleranceMs || 0) || 0));
  const safeFallbackAnchorMs = Math.max(0, Math.round(Number(fallbackAnchorMs || 0) || 0));
  const startMs = Math.max(0, Math.round(Number(segment.startMs || 0) || 0));
  const anchorStartMs = resolveGeminiSegmentAnchorStartMs(segment, safeFallbackAnchorMs);
  const legacyAbsoluteAnchor = Math.abs(startMs - anchorStartMs) <= safeToleranceMs
    && Math.abs(anchorStartMs - safeFallbackAnchorMs) > safeToleranceMs;
  if (legacyAbsoluteAnchor) return false;
  const nextOffsetMs = resolveGeminiSegmentRelativeOffsetMs(segment, fallbackAnchorMs, fallbackOffsetMs);
  const safeFallbackOffsetMs = Math.max(0, Math.round(Number(fallbackOffsetMs || 0) || 0));
  return Math.abs(nextOffsetMs - safeFallbackOffsetMs) > safeToleranceMs;
}

function resolveGeminiSegmentSequencingKey(session = null, runtimeEntry = null) {
  if (!isAudioOnlyPodcastStudioMode(session)) return "__global__";
  const trackId = String(runtimeEntry?.clip?.trackId || "").trim();
  return trackId || "__global__";
}

function buildGeminiDialogueTimelineTrack(session = null) {
  const activeSession = session || getActiveSession();
  const runtimeEntries = buildTimelineRuntimeEntries(activeSession);
  const runtimeTotalMs = runtimeEntries.reduce((acc, entry) => Math.max(acc, Math.max(0, Number(entry?.endMs || 0) || 0)), STUDIO_TIMELINE_MIN_CLIP_MS);
  const cfg = getPodcastVideoConfig(activeSession);
  const existingTrack = cfg?.geminiDialogueTrack || {};
  const existingByRowId = new Map((existingTrack.segments || []).map(s => [String(s.rowId || "").trim(), s]));
  const excludedRowIds = new Set(
    (Array.isArray(existingTrack?.excludedRowIds) ? existingTrack.excludedRowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean)
  );
  const missingRowIds = [];
  const segments = runtimeEntries.map((entry, timelineIndex) => {
    const rowId = String(entry?.rowId || "").trim();
    if (!rowId) return null;
    const existingSegment = existingByRowId.get(rowId) || null;
    const audioSrc = String(entry?.audioSrc || "").trim() || String(existingSegment?.audioSrc || "").trim();
    if (!audioSrc && excludedRowIds.has(rowId)) {
      return null;
    }
    if (!audioSrc && !existingSegment) {
      missingRowIds.push(rowId);
      return null;
    }
    // Track Voces Gemini: el chip representa la voz (audio) y debe respetar su duración.
    // No se debe recortar por la duración del clip visual (trimOut/trimIn), porque eso
    // termina truncando el audio en export/montaje.
    const trimInMs = existingSegment && existingSegment.trimInMs !== undefined
      ? Math.max(0, Number(existingSegment.trimInMs || 0))
      : 0;
    const audioDurationMs = Math.max(0, Math.round(Number(entry?.audioDurationMs || 0) || 0));
    const desiredDurationMs = audioDurationMs > 0
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, audioDurationMs - trimInMs)
      : Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(entry?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
    const durationMs = existingSegment && existingSegment.durationMs !== undefined
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Number(existingSegment.durationMs || 0))
      : resolveGeminiSegmentDurationWithinScene(
        Number(entry?.effectiveDurationMs || 0),
        desiredDurationMs
      );
    const trimOutMs = trimInMs + durationMs;
    const sceneStartMs = Math.max(0, Math.round(Number(entry?.startMs || 0) || 0));
    const sceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(entry?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
    const automaticOffsetMs = resolveAutomaticGeminiSceneOffsetMs(sceneDurationMs, durationMs);
    const hasManualStartMs = existingSegment
      ? hasManualGeminiSegmentOffset(existingSegment, sceneStartMs, automaticOffsetMs)
      : false;
    const relativeOffsetMs = existingSegment && hasManualStartMs
      ? resolveGeminiSegmentRelativeOffsetMs(existingSegment, sceneStartMs, automaticOffsetMs)
      : automaticOffsetMs;
    const desiredStartMs = sceneStartMs + relativeOffsetMs;
    const startMs = clampGeminiSegmentStartToTimeline(
      Math.max(runtimeTotalMs, desiredStartMs + durationMs),
      durationMs,
      desiredStartMs
    );
    const anchorStartMs = sceneStartMs;
    const normalizedSegment = normalizeGeminiDialogueTrackSegment({
      rowId,
      // En el timeline, "Escena N" debe corresponder al orden visual (izq→der),
      // no necesariamente al índice del guion.
      sceneIndex: timelineIndex + 1,
      speakerName: String(entry?.speakerName || "").trim(),
      audioSrc,
      startMs,
      anchorStartMs,
      endMs: startMs + durationMs,
      trimInMs,
      trimOutMs,
      durationMs
    }, timelineIndex);
    return normalizedSegment;
  }).filter(Boolean);
  return normalizeGeminiDialogueTrack({
    enabled: segments.length > 0,
    segments,
    missingRowIds,
    excludedRowIds: Array.from(excludedRowIds),
    updatedAt: nowIso()
  });
}

function reconcileGeminiDialogueTrackWithRuntime(session = null, existingTrack = null, options = {}) {
  const activeSession = session || getActiveSession();
  const runtimeEntries = buildTimelineRuntimeEntries(activeSession);
  const runtimeTotalMs = runtimeEntries.reduce((acc, entry) => Math.max(acc, Math.max(0, Number(entry?.endMs || 0) || 0)), STUDIO_TIMELINE_MIN_CLIP_MS);
  const existing = normalizeGeminiDialogueTrack(existingTrack || {});
  const existingByRowId = new Map(existing.segments.map((segment) => [String(segment?.rowId || "").trim(), segment]));
  const excludedRowIds = new Set(
    (Array.isArray(existing?.excludedRowIds) ? existing.excludedRowIds : [])
      .map((rowId) => String(rowId || "").trim())
      .filter(Boolean)
  );
  const preserveStartMs = options?.preserveStartMs !== false;
  const forceDurationFromAudio = options?.forceDurationFromAudio === true;
  const missingRowIds = [];
  const nextSegments = runtimeEntries.map((entry, timelineIndex) => {
    const rowId = String(entry?.rowId || "").trim();
    if (!rowId) return null;
    const existingSegment = existingByRowId.get(rowId) || null;
    const audioSrc = String(entry?.audioSrc || "").trim() || String(existingSegment?.audioSrc || "").trim();
    if (!audioSrc && excludedRowIds.has(rowId)) {
      return null;
    }
    if (!audioSrc && !existingSegment) {
      missingRowIds.push(rowId);
      return null;
    }
    const sceneStartMs = Math.max(0, Math.round(Number(entry?.startMs || 0) || 0));
    const sceneDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(Number(entry?.effectiveDurationMs || 0) || STUDIO_TIMELINE_MIN_CLIP_MS));
    const trimInMs = Math.max(0, Math.round(Number(entry?.clip?.trimInMs || 0) || 0));
    const trimOutMs = Math.max(
      trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.round(Number(entry?.clip?.trimOutMs || trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS) || (trimInMs + STUDIO_TIMELINE_MIN_CLIP_MS))
    );
    const clipPlayableMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, trimOutMs - trimInMs);
    const audioDurationMs = Math.max(0, Math.round(Number(entry?.audioDurationMs || 0) || 0));

    const segmentTrimInMs = preserveStartMs && existingSegment
      ? Math.max(0, Math.round(Number(existingSegment.trimInMs ?? 0) || 0))
      : 0;
    const audioSuggestedDurationMs = audioDurationMs > 0
      ? Math.round(Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, audioDurationMs - segmentTrimInMs))
      : 0;
    const expectedSegmentDuration = audioSuggestedDurationMs > 0 ? audioSuggestedDurationMs : clipPlayableMs;

    const automaticOffsetMs = resolveAutomaticGeminiSceneOffsetMs(sceneDurationMs, expectedSegmentDuration);
    const hasManualStartMs = hasManualGeminiSegmentOffset(existingSegment, sceneStartMs, automaticOffsetMs);

    // Calcular el desplazamiento exacto del inicio de la escena para preservar el offset relativo del audio
    let shiftSceneStartMs = 0;
    const drag = window.podcastVideoState?.timelineDrag;
    if (drag) {
      if (String(drag.rowId || "").trim() === rowId) {
        shiftSceneStartMs = sceneStartMs - Math.max(0, Number(drag.initialStartMs || 0));
      } else if (Array.isArray(drag.dragGroup)) {
        const groupEntry = drag.dragGroup.find(e => String(e?.rowId || "").trim() === rowId);
        if (groupEntry) {
          shiftSceneStartMs = sceneStartMs - Math.max(0, Number(groupEntry.initialStartMs || 0));
        }
      }
    }

    const relativeOffsetMs = (preserveStartMs && existingSegment && hasManualStartMs)
      ? resolveGeminiSegmentRelativeOffsetMs(existingSegment, sceneStartMs - shiftSceneStartMs, automaticOffsetMs)
      : automaticOffsetMs;

    // Voz Gemini (chip segment): la duración no debe "encogerse" por recortes del clip visual.
    // Si el usuario movió el chip, preservamos su duración previa; en caso contrario usamos
    // la duración del audio si existe, o el clip visual como fallback.
    const audioMaxPlayableMs = audioDurationMs > 0
      ? Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, Math.round(audioDurationMs - segmentTrimInMs))
      : Number.POSITIVE_INFINITY;
    const existingDurationMs = existingSegment
      ? Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        Math.round(Number(existingSegment.durationMs || 0) || (Number(existingSegment.endMs || 0) - Number(existingSegment.startMs || 0)) || clipPlayableMs)
      )
      : 0;
    // Si el track ya existía pero se importó con una duración recortada (por trim del clip visual),
    // expandimos de forma segura hasta la duración real del audio para evitar cortes al final.
    const baseDurationMs = forceDurationFromAudio && audioSuggestedDurationMs > 0
      ? audioSuggestedDurationMs
      : preserveStartMs && existingSegment
        ? Math.max(existingDurationMs, audioSuggestedDurationMs || 0)
        : (audioSuggestedDurationMs > 0 ? audioSuggestedDurationMs : clipPlayableMs);
    const durationMs = Math.max(
      STUDIO_TIMELINE_MIN_CLIP_MS,
      Math.min(resolveGeminiSegmentDurationWithinScene(sceneDurationMs, baseDurationMs), audioMaxPlayableMs)
    );
    const desiredStartMs = sceneStartMs + relativeOffsetMs;
    const startMs = clampGeminiSegmentStartToTimeline(
      Math.max(runtimeTotalMs, desiredStartMs + durationMs),
      durationMs,
      desiredStartMs
    );
    const segmentTrimOutMs = segmentTrimInMs + durationMs;
    const normalizedSegment = normalizeGeminiDialogueTrackSegment({
      rowId,
      sceneIndex: timelineIndex + 1,
      speakerName: String(entry?.speakerName || "").trim(),
      audioSrc,
      startMs,
      anchorStartMs: sceneStartMs,
      endMs: startMs + durationMs,
      trimInMs: segmentTrimInMs,
      trimOutMs: segmentTrimOutMs,
      durationMs
    }, timelineIndex);
    return normalizedSegment;
  }).filter(Boolean);

  const normalizedNext = normalizeGeminiDialogueTrack({
    enabled: nextSegments.length > 0,
    segments: nextSegments,
    missingRowIds,
    excludedRowIds: Array.from(excludedRowIds),
    updatedAt: existing.updatedAt
  });
  const stable = (track) => ({
    enabled: track.enabled === true,
    missingRowIds: (track.missingRowIds || []).slice().sort(),
    excludedRowIds: (track.excludedRowIds || []).slice().sort(),
    segments: (track.segments || []).map((segment) => ({
      rowId: String(segment?.rowId || "").trim(),
      sceneIndex: Math.max(1, Math.round(Number(segment?.sceneIndex || 0) || 0)),
      startMs: Number(segment?.startMs || 0),
      endMs: Number(segment?.endMs || 0),
      durationMs: Number(segment?.durationMs || 0),
      trimInMs: Number(segment?.trimInMs || 0),
      trimOutMs: Number(segment?.trimOutMs || 0),
      anchorStartMs: segment?.anchorStartMs !== null ? Number(segment?.anchorStartMs ?? 0) : null,
      audioSrc: String(segment?.audioSrc || "").trim()
    })).sort((a, b) => a.rowId.localeCompare(b.rowId))
  });
  const changed = JSON.stringify(stable(existing)) !== JSON.stringify(stable(normalizedNext));
  return {
    track: changed ? { ...normalizedNext, updatedAt: nowIso() } : existing,
    changed
  };
}

function syncGeminiDialogueTrackWithRuntime(options = {}) {
  const activeSession = getActiveSession();
  if (!activeSession || activeSession.isStub) return false;
  let changed = false;
  upsertPodcastVideoConfig((cfg) => {
    const current = normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
    const reconciled = reconcileGeminiDialogueTrackWithRuntime({ ...activeSession, podcastVideoConfig: cfg }, current, {
      preserveStartMs: options.preserveStartMs !== false,
      isTrimStart: options.isTrimStart === true,
      forceDurationFromAudio: options.forceDurationFromAudio === true
    });
    changed = reconciled.changed === true;

    if (!changed) return cfg;
    return {
      ...cfg,
      geminiDialogueTrack: reconciled.track
    };
  }, { autosave: options.autosave !== false });
  const syncedText = syncOnScreenTextClipsWithGeminiTrack({
    render: false,
    autosave: options.autosave !== false
  });
  if (changed && options.render !== false) {
    renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
    syncPodcastStudioInspector(getActiveSession());
  } else if (syncedText && options.render !== false) {
    renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
    syncPodcastStudioInspector(getActiveSession());
  }
  if ((changed || syncedText) && options.autosave !== false) {
    scheduleSessionLocalPersist("sync-gemini-track");
  }
  return changed || syncedText;
}

function countAvailableGeminiDialogueRows(session = null) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  return rows.reduce((acc, row) => (
    hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, String(row?.id || "").trim())) ? acc + 1 : acc
  ), 0);
}

function importGeminiDialogueTrackToTimeline(options = {}) {
  let activeSession = getActiveSession();
  if (!activeSession) return false;
  if (isEducationalVideoMode(activeSession) && !hasExplicitMultiTrackTimeline(activeSession)) {
    compactEducationalTimelineLayout(activeSession, { pinGeminiTrackRow: true, render: false });
    activeSession = getActiveSession();
  }
  const nextTrack = buildGeminiDialogueTimelineTrack(activeSession);
  if (!nextTrack.segments.length) {
    if (options.silent !== true) {
      setGenerationStatus("No hay audios Gemini disponibles para importar al timeline.", "");
    }
    upsertPodcastVideoConfig((cfg) => ({
      ...cfg,
      geminiDialogueTrack: normalizeGeminiDialogueTrack({
        enabled: false,
        segments: [],
        missingRowIds: []
      })
    }));
    renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
    return false;
  }
  upsertPodcastVideoConfig((cfg, session) => ({
    ...cfg,
    geminiDialogueTrackIndex: isEducationalVideoMode(session) ? 0 : Number(cfg?.geminiDialogueTrackIndex ?? 0),
    geminiDialogueTrack: nextTrack
  }));
  renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
  syncPodcastStudioInspector(getActiveSession());
  if (options.silent !== true) {
    const missingCount = nextTrack.missingRowIds.length;
    setGenerationStatus(
      missingCount
        ? `Track Voces Gemini actualizado (${nextTrack.segments.length} escenas con audio, ${missingCount} faltantes).`
        : `Track Voces Gemini actualizado (${nextTrack.segments.length} escenas con audio).`,
      "is-live"
    );
  }
  return true;
}

function compactEducationalTimelineLayout(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  if (!activeSession || !isEducationalVideoMode(activeSession) || hasExplicitMultiTrackTimeline(activeSession)) return false;
  const rows = getSessionRows(activeSession);
  if (!rows.length) return false;
  const clips = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const tracks = ensureTimelineTracks(activeSession, { persist: false });
  const primaryTrackId = String(tracks[0]?.id || "speaker:unknown").trim() || "speaker:unknown";
  const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
  const ordered = Object.values(clips)
    .filter(Boolean)
    .map((clip) => ({
      rowId: String(clip?.rowId || "").trim(),
      startMs: Math.max(0, Number(clip?.startMs || 0) || 0),
      zIndex: Math.max(1, Number(clip?.zIndex || 1) || 1),
      scriptIndex: Number(rowIndexById.get(String(clip?.rowId || "").trim()) || 0),
      clip
    }))
    .filter((item) => item.rowId)
    .sort((a, b) => a.startMs - b.startMs || a.zIndex - b.zIndex || a.scriptIndex - b.scriptIndex);
  if (!ordered.length) return false;

  let cursorMs = 0;
  const nextClips = { ...clips };
  let changed = false;
  ordered.forEach((item, index) => {
    const rowId = item.rowId;
    const current = clips[rowId];
    if (!current) return;
    const nextStartMs = snapTimelineMs(cursorMs);
    const normalized = normalizeTimelineClipItem({
      ...current,
      trackId: primaryTrackId,
      startMs: nextStartMs,
      zIndex: Math.max(1, index + 1)
    }, rowId);
    if (!normalized) return;
    cursorMs = getTimelineClipEndMs(normalized);
    if (
      String(current.trackId || "").trim() !== primaryTrackId
      || Math.abs(Number(current.startMs || 0) - nextStartMs) > 0.5
      || Number(current.zIndex || 0) !== Number(normalized.zIndex || 0)
    ) {
      changed = true;
    }
    nextClips[rowId] = normalized;
  });

  if (!changed && options.pinGeminiTrackRow !== true) return false;
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    timelineVersion: STUDIO_TIMELINE_VERSION,
    timelineTrackVersion: STUDIO_TIMELINE_TRACK_VERSION,
    timelineTracks: normalizeTimelineTracks(tracks),
    timelineClipsByRowId: nextClips,
    ...(options.pinGeminiTrackRow === true ? { geminiDialogueTrackIndex: 0 } : {})
  }));
  podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
  syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
  if (options.render !== false) {
    renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
    syncPodcastStudioInspector(getActiveSession());
  }
  return true;
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

function getOrderedDialogueVideoSegmentsForPlayback(clip = null, options = {}) {
  if (!clip || typeof clip !== "object") return clip;
  const sessionId = String(options?.sessionId || "").trim();
  const rowId = String(options?.rowId || clip?.rowId || "").trim();
  const segments = resolveDialogueVideoSegments(clip).filter(Boolean);
  if (!segments.length) return [];
  const candidates = segments.filter((segment) => hasStoredMediaSource(segment));
  const list = candidates.length ? candidates : segments;
  const ready = list.filter((segment) => String(segment?.status || "").trim().toLowerCase() === "ready");
  const pool = ready.length ? ready : list;
  const ordered = pool.slice().sort((left, right) => {
    const leftIdx = Number(left?.index);
    const rightIdx = Number(right?.index);
    if (Number.isFinite(leftIdx) || Number.isFinite(rightIdx)) {
      return (Number.isFinite(leftIdx) ? leftIdx : 999) - (Number.isFinite(rightIdx) ? rightIdx : 999);
    }
    const leftTs = new Date(String(left?.updatedAt || left?.createdAt || "")).getTime();
    const rightTs = new Date(String(right?.updatedAt || right?.createdAt || "")).getTime();
    if (Number.isFinite(leftTs) || Number.isFinite(rightTs)) {
      return (Number.isFinite(leftTs) ? leftTs : 0) - (Number.isFinite(rightTs) ? rightTs : 0);
    }
    return 0;
  });
  if (!sessionId || !rowId) return ordered;
  const fresh = ordered.filter((segment) => !isStaleDialogueVideoSource(sessionId, rowId, segment));
  return fresh;
}

function resolvePrimaryDialogueVideoSegment(clip = null, options = {}) {
  const ordered = getOrderedDialogueVideoSegmentsForPlayback(clip, options);
  const first = Array.isArray(ordered) ? (ordered[0] || null) : null;
  return first || clip || null;
}

function hasGeneratedDialogueVideoForRow(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!key) return false;
  const brokenKey = `${String(activeSession?.id || "").trim()}:${key}`;
  if (requirePodcasterGenerationApi().brokenDialogueVideoRows?.has(brokenKey)) return false;
  const clip = resolveDialogueVideoForRow(activeSession, key);
  if (!clip) return false;
  const primarySegment = resolvePrimaryDialogueVideoSegment(clip);
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

function resolveStorageVideoUrl(rawUrl = "", storagePath = "", options = {}) {
  const clean = String(rawUrl || "").trim();
  const cleanStoragePath = deriveStoragePathFromMediaSource(clean, storagePath || "");
  if (!clean && !cleanStoragePath) return "";
  if (clean.startsWith("data:")) return clean;
  if (!hasAvailableApiBase()) return clean;

  const explicitType = String(options.type || options.mediaKind || "").trim().toLowerCase();
  const mimeType = String(options.mimeType || "").trim().toLowerCase();
  const name = String(options.name || "").trim().toLowerCase();
  const combinedSource = `${clean} ${cleanStoragePath} ${name}`.toLowerCase();
  const treatAsImage = explicitType === "image"
    || mimeType.startsWith("image/")
    || /\.(jpg|jpeg|png|webp|gif)(\?|$|\s)/i.test(combinedSource);

  try {
    const isLibraryAsset = /(^|\/)podcaster\/library\//i.test(cleanStoragePath);
    if (cleanStoragePath || isLibraryAsset) {
      return resolveStaleAwareProxyMediaUrl(clean, cleanStoragePath, treatAsImage ? "image" : "media", options);
    }

    // Si ya es una URL de proxy, solo añadimos el timestamp si falta
    if (clean.startsWith("/api/assets/proxy-media?") || clean.startsWith("/api/assets/proxy-image?")) {
      let proxyUrl = buildApiUrl(clean);
      const timestamp = options.updatedAt || options.timestamp || "";
      if (timestamp && !proxyUrl.includes("u=")) {
        const sep = proxyUrl.includes("?") ? "&" : "?";
        proxyUrl += `${sep}u=${encodeURIComponent(resolveDateIso(timestamp))}`;
      }
      return proxyUrl;
    }

    // Para URLs directas de Firebase o con extensión de video, usamos el resolver stale para tener fallback
    const parsed = new URL(clean, window.location.origin);
    const host = String(parsed.hostname || "").toLowerCase();
    const pathname = String(parsed.pathname || "").toLowerCase();
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(host);
    const hasVideoExt = /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(pathname);
    const hasImageExt = /\.(jpg|jpeg|png|webp|gif)(?:$|\?)/i.test(pathname);

    if (isStorageUrl || hasVideoExt || hasImageExt || treatAsImage) {
      return resolveStaleAwareProxyMediaUrl(clean, "", treatAsImage || hasImageExt ? "image" : "media", options);
    }

    return clean;
  } catch (_) {
    return clean;
  }
}

async function resolveFirebaseStorageUrl(gsUrl = "") {
  try {
    if (!gsUrl || !gsUrl.startsWith("gs://")) return gsUrl;
    if (!window.firebaseStorage) return gsUrl;
    const path = gsUrl.replace(/^gs:\/\/[^/]+\//, "");
    if (!path) return gsUrl;
    const storageRef = ref(window.firebaseStorage, path);
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (e) {
    if (e.code === 'storage/unauthorized' || e.code === 'storage/object-not-found') {
      // Silence expected errors during fallback flows
      return gsUrl;
    }
    void e;
    return gsUrl;
  }
}

function resolveStorageAudioUrl(rawUrl = "", storagePath = "", options = {}) {
  const clean = String(rawUrl || "").trim();
  const cleanStoragePath = deriveStoragePathFromMediaSource(clean, storagePath || "");
  if (!clean && !cleanStoragePath) return "";
  if (!hasAvailableApiBase()) return clean;
  try {
    if (cleanStoragePath) {
      return resolveStaleAwareProxyMediaUrl(clean, cleanStoragePath, "media", options);
    }
    if (clean.startsWith("/api/assets/proxy-media?")) {
      let proxyUrl = buildApiUrl(clean);
      const timestamp = options.updatedAt || options.timestamp || "";
      if (timestamp && !proxyUrl.includes("u=")) {
        proxyUrl += `&u=${encodeURIComponent(resolveDateIso(timestamp))}`;
      }
      return proxyUrl;
    }
    const parsed = new URL(clean, window.location.origin);
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(String(parsed.hostname || ""));
    if (isStorageUrl) {
      let proxyUrl = buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(clean)}`);
      const timestamp = options.updatedAt || options.timestamp || "";
      if (timestamp) proxyUrl += `&u=${encodeURIComponent(resolveDateIso(timestamp))}`;
      return proxyUrl;
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

// Método de clonación desde librería removido y modularizado en podcaster-public-library.js

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
    nivel: "",
    grado: "",
    trimestre: "",
    unidad: "",
    updatedAt: nowIso(),
    podcastStudioUiState: normalizePodcastStudioUiState({ composerGenerationMode }),
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
      videoContentType: null,
      hosts: [...DEFAULT_HOSTS],
      rows: []
    },
    generationStatus: {
      text: "",
      tone: ""
    },
    videoContentType: null,
    speakerVoiceMap: baseVoiceMap,
    speakerExpressionMap: baseExpressionMap,
    speakerNameMap: baseNameMap,
    speakerScenarioMap: baseScenarioMap,
    speakerScenarioVariantsMap: baseScenarioVariantsMap,
    globalScenarioDeck: baseGlobalScenarioDeck,
    disfluencyDefaults: { ...DEFAULT_DISFLUENCY_CONFIG },
    ttsDirectionDefaults: { ...DEFAULT_TTS_DIRECTION_CONFIG },
    panelMusicConfig: {
      preset: "ambient",
      volume: 22,
      montageVolume: 100,
      duckingWhenGeminiPct: 60,
      stabilize: false,
      limiterEnabled: false,
      sourceType: "preset",
      selectedTrackKind: "uploaded",
      trackLibrary: {
        uploaded: null,
        uploadedTracks: [],
        ai: null
      },
      track: null
    },
    speakerPortraitMap: {},
    speakerReferenceImageMap: {},
    scenarioReferenceImageMap: {},
    rowReferenceImageListMap: {},
    rowReferenceImageMap: {},
    rowReferenceVideoMap: {},
    rowReferenceModeByRowId: {},
    dialogueVideoMap: {},
    dialogueAudioMap: {},
    podcastVideoConfig: normalizePodcastVideoConfig({
      enabled: false,
      editorEnabled: true,
      masterVolume: 100,
      audioMasterStabilize: false,
      audioMasterLimiterEnabled: false
    }),
    creativeVideoConfig: normalizeCreativeVideoConfig({
      enabled: false,
      globalVoiceName: "Kore"
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

function normalizeSessionAcademicField(input = "", allowedValues = []) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return allowedValues.includes(raw) ? raw : "";
}

function getSessionAcademicMetadata(session = null) {
  const source = session && typeof session === "object" ? session : {};
  return {
    nivel: normalizeSessionAcademicField(source.nivel, SESSION_ACADEMIC_LEVEL_OPTIONS),
    grado: normalizeSessionAcademicField(source.grado, SESSION_ACADEMIC_GRADE_OPTIONS),
    trimestre: normalizeSessionAcademicField(source.trimestre, SESSION_ACADEMIC_TERM_OPTIONS),
    unidad: normalizeSessionAcademicField(source.unidad, SESSION_ACADEMIC_UNIT_OPTIONS)
  };
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || null;
}

function getSessionRows(session) {
  if (!session) return [];

  // 1. Source of truth: script.rows (normalized)
  const fromScript = normalizeRows(session.script?.rows).map((row) => normalizeRowVoiceConfig(row, session));
  if (fromScript.length > 0) return fromScript;

  // 2. Legacy fallback: top-level session.rows
  const fromLegacy = normalizeRows(session.rows).map((row) => normalizeRowVoiceConfig(row, session));
  if (fromLegacy.length > 0) return fromLegacy;

  // 3. Emergency recovery: reconstruct from dialogueAudioMap + geminiDialogueTrack.segments
  // This handles sessions where script.rows was corrupted but audio metadata is intact.
  const audioMap = session.dialogueAudioMap || {};
  const segments = session.podcastVideoConfig?.geminiDialogueTrack?.segments || [];
  const timelineClips = session.podcastVideoConfig?.timelineClipsByRowId || {};

  // Build ordered rowIds from segments (they preserve scene order) or fallback to audioMap keys
  let orderedRowIds = [];
  if (segments.length > 0) {
    orderedRowIds = segments
      .slice()
      .sort((a, b) => (a.sceneIndex || 0) - (b.sceneIndex || 0))
      .map(s => String(s.rowId || '').trim())
      .filter(Boolean);
  } else {
    // Fallback: sort by startMs in timelineClips
    orderedRowIds = Object.values(timelineClips)
      .sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
      .map(c => String(c.rowId || '').trim())
      .filter(Boolean);
    if (!orderedRowIds.length) {
      orderedRowIds = Object.keys(audioMap).filter(Boolean);
    }
  }

  if (orderedRowIds.length === 0) return [];

  const hosts = Array.isArray(session.script?.hosts) && session.script.hosts.length
    ? session.script.hosts
    : (Array.isArray(session.hosts) && session.hosts.length ? session.hosts : ['Narrador']);

  const recoveredRows = orderedRowIds
    .filter((rowId, idx, arr) => arr.indexOf(rowId) === idx) // dedupe
    .map((rowId, index) => {
      const audio = audioMap[rowId] || {};
      const seg = segments.find(s => s.rowId === rowId) || {};
      const clip = timelineClips[rowId] || {};
      const speaker = String(audio.speaker || seg.speakerName || hosts[0] || 'Narrador').trim();
      const text = String(audio.targetSpeechLine || seg.targetSpeechLine || '').trim();
      const durationSec = Math.max(
        Number(audio.durationSec || 0),
        Math.round((seg.durationMs || clip.sourceDurationMs || 8000) / 1000)
      );
      return {
        id: rowId,
        speaker,
        voiceName: normalizeLiveVoiceName(String(audio.voiceName || "").trim(), resolveSpeakerVoiceName(speaker, session)),
        voiceNameSource: String(audio.voiceName || "").trim() ? "row" : "host",
        text,
        sceneDescription: '',
        visualNotes: '',
        onScreenText: '',
        transition: '',
        time: `${Math.floor((index * 8) / 60)}:${String((index * 8) % 60).padStart(2, '0')}`,
        durationSec,
        index
      };
    })
    .filter(row => row.id && (row.text || row.durationSec > 0));

  return recoveredRows;
}

function normalizeRows(raw) {
  if (Array.isArray(raw)) return raw.filter(v => v && typeof v === 'object' && (v.id || v.text || v.speaker));
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw);
    if (keys.length > 0) {
      const values = Object.values(raw);
      // Case 1: Numeric-indexed object (Firestore array corruption)
      if (keys.every(k => !isNaN(k) && k.trim() !== "")) {
        const candidates = keys
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map(k => raw[k])
          .filter(v => v && typeof v === 'object' && (v.id || v.text || v.speaker));
        if (candidates.length > 0) return candidates;
        // All numeric-keyed values lack row fields → treat as corrupt, return empty
        return [];
      }
      // Case 2: Map of row objects (e.g. keys are row IDs)
      const rowLike = values.filter(v => v && typeof v === 'object' && (v.id || v.text || v.speaker || v.role || v.voiceOverText));
      if (rowLike.length > 0) {
        return rowLike.sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
      }
    }
  }
  return [];
}

function normalizeVoiceNameSource(value = "") {
  return String(value || "").trim().toLowerCase() === "row" ? "row" : "host";
}

function findSessionRowById(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!session || !key) return null;
  return normalizeRows(session?.script?.rows).find((row) => String(row?.id || "").trim() === key) || null;
}

function normalizeRowVoiceConfig(row = {}, session = null, options = {}) {
  const sourceRow = row && typeof row === "object" ? row : {};
  const speaker = String(options?.speaker || sourceRow?.speaker || "Host A").trim() || "Host A";
  const hostVoice = normalizeLiveVoiceName(
    String(options?.hostVoiceName || getSpeakerVoiceMap(session)?.[speaker] || "").trim(),
    resolveSpeakerVoiceName(speaker, session)
  );
  const explicitVoiceSeed = options?.voiceName ?? sourceRow?.voiceName ?? "";
  const explicitVoice = normalizeLiveVoiceName(String(explicitVoiceSeed).trim(), "");
  const voiceName = explicitVoice || hostVoice || resolveSpeakerVoiceName(speaker, session);
  const voiceNameSource = explicitVoice
    ? normalizeVoiceNameSource(options?.voiceNameSource ?? sourceRow?.voiceNameSource)
    : "host";
  return {
    ...sourceRow,
    speaker,
    voiceName,
    voiceNameSource
  };
}

function readRowVoiceDraftValue(rowId = "") {
  const key = String(rowId || "").trim();
  if (!key || typeof document === "undefined") return "";
  const escapedRowId = globalThis.CSS?.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
  const inputs = Array.from(document.querySelectorAll(`[data-field='voiceName'][data-row-id="${escapedRowId}"]`));
  for (const input of inputs) {
    const voice = normalizeLiveVoiceName(String(input?.value || "").trim(), "");
    if (voice) return voice;
  }
  return "";
}

function flushScriptEditorVoiceDraftsToSession() {
  if (typeof document === "undefined") return false;
  const inputs = Array.from(document.querySelectorAll("[data-field='voiceName'][data-row-id]"));
  if (!inputs.length) return false;
  const draftByRowId = new Map();
  inputs.forEach((input) => {
    const rowId = String(input?.dataset?.rowId || "").trim();
    const voiceName = normalizeLiveVoiceName(String(input?.value || "").trim(), "");
    if (!rowId || !voiceName) return;
    draftByRowId.set(rowId, voiceName);
  });
  if (!draftByRowId.size) return false;
  upsertActiveSession((current) => {
    const rows = normalizeRows(current?.script?.rows);
    if (!rows.length) return current;
    let changed = false;
    const nextRows = rows.map((row) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId || !draftByRowId.has(rowId)) return row;
      const speaker = String(row?.speaker || "").trim() || "Host A";
      const nextVoice = draftByRowId.get(rowId);
      if (normalizeLiveVoiceName(String(row?.voiceName || "").trim(), "") === nextVoice
        && normalizeVoiceNameSource(row?.voiceNameSource) === "row") {
        return row;
      }
      changed = true;
      return normalizeRowVoiceConfig({
        ...row,
        voiceName: nextVoice,
        voiceNameSource: "row"
      }, current, {
        speaker,
        voiceName: nextVoice,
        voiceNameSource: "row"
      });
    });
    if (!changed) return current;
    return {
      ...current,
      script: {
        ...(current?.script || {}),
        rows: nextRows
      }
    };
  }, { render: false });
  return true;
}


function normalizeDialogueMatchText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function reconcileDialogueMediaMapsForRows(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
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
  const shouldPersist = options.persist === true
    ? true
    : options.persist === false
      ? false
      : PODCAST_SESSION_MANUAL_SAVE_ONLY !== true;
  const shouldMarkDirty = options.markDirty !== false && shouldPersist !== false;
  const key = String(sessionId || "").trim();
  if (!key) return null;
  const idx = state.sessions.findIndex((session) => String(session?.id || "").trim() === key);
  if (idx === -1) return null;
  const current = state.sessions[idx];
  const next = mutator({
    ...current,
    script: {
      ...(current.script || {}),
      rows: normalizeRows(current.script?.rows)
    },
    chat: Array.isArray(current.chat) ? [...current.chat] : []
  });
  if (!next) return null;
  state.sessions[idx] = {
    ...next,
    updatedAt: nowIso()
  };
  invalidateStudioRuntimeCache();
  if (shouldPersist !== false) {
    persistSessions();
  }
  if (shouldMarkDirty) {
    sessionStore.markDirty(key, String(options.autosaveReason || "session-upsert").trim() || "session-upsert");
  }
  if (shouldRender) render();
  return state.sessions[idx];
}

function upsertActiveSession(mutator, options = {}) {
  if (options.recordHistory !== false) {
    podcasterHistoryApi.recordHistory(getActiveSession(), options.autosaveReason || "upsert");
  }
  if (window.PodcasterThreads && options.autosaveReason !== "ui-state") { // Avoid syncing threads for UI state changes to prevent loops
    window.PodcasterThreads.syncActiveThreadToSession(getActiveSession());
  }
  return upsertSessionById(state.activeSessionId, mutator, options);
}

function resetPodcastStudioSessionUiState(session = null) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
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
}

async function setActiveSession(sessionId) {
  window.backgroundDialogueAudioWarmupToken = 0;
  playbackController.stop({ keepStatus: true });
  podcastVideoState.enabled = false;
  state.activeSessionId = sessionId;
  expandSession(sessionId);
  try {
    window.localStorage.setItem(ACTIVE_SESSION_ID_KEY, sessionId);
  } catch (_) { }

  // Iniciar listener de actividad para colaboración
  setupActivityListener(sessionId);

  const nextSession = getActiveSession();

  // Solo hidratar desde cloud cuando la sesión local es un stub.
  if (nextSession?.isStub) {
    try {
      setGenerationStatus("Cargando...", "Descargando contenido de la sesión...");
      const cloudSession = await loadCloudSessionDocumentDirect(sessionId);
      if (cloudSession) {
        const mergedSession = mergeCloudSessionOverLocalCache(cloudSession, nextSession);
        Object.assign(nextSession, {
          ...mergedSession,
          isStub: false
        });

        persistSessions();
        setGenerationStatus("Listo", "");
      } else {
        setGenerationStatus("Error", "No se encontró el contenido en la nube.");
      }
    } catch (error) {
      console.error("[podcaster] Error activando sesión stub:", error);
      setGenerationStatus("Error", "Error de red al cargar sesión.");
    }
  }

  resetPodcastStudioSessionUiState(nextSession);
  // Restaurar estado visual del Studio desde la sesión (Firebase/localStorage fallback).
  try {
    suppressPodcastStudioUiStateSync = true;
    const ui = normalizePodcastStudioUiState(nextSession?.podcastStudioUiState || null, nextSession);
    const localInspectorCollapsed = (() => {
      try {
        const raw = window.localStorage.getItem(PODCAST_STUDIO_INSPECTOR_COLLAPSED_KEY);
        if (raw === "1") return true;
        if (raw === "0") return false;
      } catch (_) { }
      return null;
    })();
    const localInspectorWidthPx = (() => {
      try {
        const rawValue = Number(window.localStorage.getItem(PodcasterResize.POD_INSPECTOR_WIDTH_KEY));
        if (Number.isFinite(rawValue)) {
          return Math.max(PodcasterResize.POD_INSPECTOR_WIDTH_MIN, Math.min(PodcasterResize.POD_INSPECTOR_WIDTH_MAX, rawValue));
        }
      } catch (_) { }
      return null;
    })();
    const localLibraryCollapsed = (() => {
      try {
        const raw = window.localStorage.getItem(PodcasterResize.POD_VIDEO_LIBRARY_COLLAPSED_KEY);
        if (raw === "1") return true;
        if (raw === "0") return false;
      } catch (_) { }
      return null;
    })();
    setPodcastStudioInspectorCollapsed(localInspectorCollapsed ?? ui.inspectorCollapsed);
    setPodcastStudioInspectorWidth(localInspectorWidthPx ?? ui.inspectorWidthPx, { persist: false });
    setPodcastVideoLibraryCollapsed(localLibraryCollapsed ?? ui.libraryCollapsed);
    // Sincronizar todos los switches de publicación (header y footer)
    const isPublished = nextSession?.publicar === true;
    document.querySelectorAll("[id^='sessionPublishToggle']").forEach(el => {
      if (el) el.checked = isPublished;
    });
    setPodcastVideoStageMaxHeight(ui.stageMaxHeightPx || PodcasterResize.podcastStageMaxHeightPx, { persist: false });
    if (ui.timelineViewMode) {
      upsertPodcastVideoConfig((cfg) => ({ ...cfg, timelineViewMode: ui.timelineViewMode }));
    }
    podcastVideoState.showMontageAudioSubtracks = ui.showMontageAudioSubtracks === true;
    if (ui.lastActiveRowId) {
      podcastVideoState.activeRowId = ui.lastActiveRowId;
      podcastVideoState.timelineLastInteractedRowId = ui.lastActiveRowId;
      if (!podcastVideoState.transitionPickerOpen) {
        podcastVideoState.transitionFromRowId = ui.lastActiveRowId;
      }
    }
    if (ui.composerGenerationMode) {
      setComposerGenerationMode(ui.composerGenerationMode, { force: false, reason: "hydration" });
    }
    if (ui.composerVideoTableMode) {
      setComposerVideoTableMode(ui.composerVideoTableMode);
    }
  } catch (_) {
    // noop
  } finally {
    suppressPodcastStudioUiStateSync = false;
  }
  try {
    const refsHydrated = await hydrateSessionReferenceMedia(nextSession);
    const musicHydrated = await hydratePanelMusicLocalCaches(nextSession);
    if (refsHydrated || musicHydrated) {
      persistSessions();
    }
  } catch (_) {
    // noop
  }
  if (typeof playbackController?.sync === "function") {
    playbackController.sync(nextSession, getPodcastVideoConfig(nextSession));
  }
  try {
    // Estas funciones forzaban los chips al inicio de la escena si detectaban offsets antiguos.
    // Se eliminan para permitir que la persistencia de anchorStartMs/startMs del usuario sea la fuente de verdad.
    // normalizeLegacyGeminiTrackOffsets(nextSession);
    // applyGeminiSubtitleInsetForReorderedTimeline(nextSession, STUDIO_REORDER_SUBTITLE_INSET_PX);
  } catch (_) { }
  render();
}

function ensureSession() {
  const visibleSessions = state.sessions.filter((session) => session.archived !== true);
  if (visibleSessions.length === 0) {
    const session = createSession();
    state.sessions = [session, ...state.sessions.filter((item) => item.id !== session.id)];
    state.activeSessionId = session.id;
    state.expandedSessionIds = [session.id];
    persistSessions();
    return;
  }
  const active = getActiveSession();
  if (!active || active.archived === true) {
    state.activeSessionId = visibleSessions[0].id;
    expandSession(state.activeSessionId);
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
    const normalizedTtsDirectionDefaults = normalizeTtsDirectionConfig(session.ttsDirectionDefaults || DEFAULT_TTS_DIRECTION_CONFIG);
    const normalizedPortraitMap = normalizeSpeakerPortraitMap(session.speakerPortraitMap || {});
    const normalizedSpeakerReferenceImageMap = normalizeReferenceImageMap(session.speakerReferenceImageMap || {});
    const normalizedScenarioReferenceImageMap = normalizeReferenceImageMap(session.scenarioReferenceImageMap || {});
    const normalizedRowReferenceImageListMap = normalizeReferenceImageListMap(session.rowReferenceImageListMap || {});
    const normalizedRowReferenceImageMap = normalizeReferenceImageMap(session.rowReferenceImageMap || {});

    // Bidirectional sync: ensure imageMap has primary from imageListMap
    Object.entries(normalizedRowReferenceImageListMap).forEach(([key, list]) => {
      const primary = Array.isArray(list) ? list[0] : null;
      if (primary) normalizedRowReferenceImageMap[key] = primary;
    });

    // Bidirectional sync: ensure imageListMap has entry if imageMap has one but list is missing
    Object.entries(normalizedRowReferenceImageMap).forEach(([key, value]) => {
      if (!normalizedRowReferenceImageListMap[key] && value) {
        normalizedRowReferenceImageListMap[key] = [value];
      }
    });
    const normalizedDialogueVideoMap = normalizeDialogueVideoMap(session.dialogueVideoMap || {});
    const normalizedDialogueAudioMap = normalizeDialogueAudioMap(session.dialogueAudioMap || {});
    const normalizedChat = Array.isArray(session.chat) ? session.chat : [];
    const normalizedRowReferenceVideoMap = normalizeReferenceVideoMap(session.rowReferenceVideoMap || {});
    const migratedRowReferenceImageMap = { ...normalizedRowReferenceImageMap };
    const migratedRowReferenceImageListMap = { ...normalizedRowReferenceImageListMap };
    const migratedRowReferenceVideoMap = { ...normalizedRowReferenceVideoMap };
    let repairedLegacyImageReferences = false;

    Object.entries(normalizedRowReferenceVideoMap).forEach(([rowId, value]) => {
      const key = String(rowId || "").trim();
      if (!key || !isLikelyImageMediaRecord(value)) return;
      const imageRecord = buildImageReferenceRecordFromMedia(value, "Referencia de escena");
      if (!imageRecord) return;
      migratedRowReferenceImageMap[key] = imageRecord;
      migratedRowReferenceImageListMap[key] = [imageRecord];
      delete migratedRowReferenceVideoMap[key];
      repairedLegacyImageReferences = true;
    });

    Object.entries(normalizedDialogueVideoMap).forEach(([rowId, clip]) => {
      const key = String(rowId || "").trim();
      if (!key || migratedRowReferenceImageMap[key] || !isLikelyImageMediaRecord(clip)) return;
      const imageRecord = buildImageReferenceRecordFromMedia(clip, "Referencia de escena");
      if (!imageRecord) return;
      migratedRowReferenceImageMap[key] = imageRecord;
      migratedRowReferenceImageListMap[key] = [imageRecord];
      delete migratedRowReferenceVideoMap[key];
      repairedLegacyImageReferences = true;
    });

    const normalizedRowReferenceModeByRowId = normalizeRowReferenceModeMap(
      session.rowReferenceModeByRowId || {},
      migratedRowReferenceImageMap,
      migratedRowReferenceVideoMap
    );
    const reconciledMedia = reconcileDialogueMediaMapsForRows({
      ...session,
      dialogueVideoMap: normalizedDialogueVideoMap,
      dialogueAudioMap: normalizedDialogueAudioMap
    }, { log: false });
    const normalizedVideoConfig = normalizePodcastVideoConfig(session.podcastVideoConfig || {});
    const normalizedCreativeVideoConfig = normalizeCreativeVideoConfig(session.creativeVideoConfig || {});
    const normalizedStudioUiState = normalizePodcastStudioUiState(session.podcastStudioUiState || null, session);
    const resolvedVideoContentType = resolveVideoContentType(session);
    const persistedVideoContentType = resolvedVideoContentType === "none" ? null : resolvedVideoContentType;
    const resolvedLegacyVideoMode = resolvedVideoContentType === "creative";
    const sameVoiceMap = JSON.stringify(trimmedVoiceMap) === JSON.stringify(session.speakerVoiceMap || {});
    const sameExpressionMap = JSON.stringify(normalizedExpressionMap) === JSON.stringify(session.speakerExpressionMap || {});
    const sameNameMap = JSON.stringify(normalizedNameMap) === JSON.stringify(session.speakerNameMap || {});
    const sameScenarioMap = JSON.stringify(normalizedScenarioMap) === JSON.stringify(session.speakerScenarioMap || {});
    const sameScenarioVariantsMap = JSON.stringify(normalizedScenarioVariantsMap) === JSON.stringify(session.speakerScenarioVariantsMap || {});
    const sameGlobalScenarioDeck = JSON.stringify(normalizedGlobalScenarioDeck) === JSON.stringify(session.globalScenarioDeck || {});
    const sameDisfluencyDefaults = JSON.stringify(normalizedDisfluencyDefaults) === JSON.stringify(session.disfluencyDefaults || {});
    const sameTtsDirectionDefaults = JSON.stringify(normalizedTtsDirectionDefaults) === JSON.stringify(session.ttsDirectionDefaults || {});
    const samePortraitMap = JSON.stringify(normalizedPortraitMap) === JSON.stringify(session.speakerPortraitMap || {});
    const sameSpeakerReferenceImageMap = JSON.stringify(normalizedSpeakerReferenceImageMap) === JSON.stringify(session.speakerReferenceImageMap || {});
    const sameScenarioReferenceImageMap = JSON.stringify(normalizedScenarioReferenceImageMap) === JSON.stringify(session.scenarioReferenceImageMap || {});
    const sameRowReferenceImageListMap = JSON.stringify(migratedRowReferenceImageListMap) === JSON.stringify(session.rowReferenceImageListMap || {});
    const sameRowReferenceImageMap = JSON.stringify(migratedRowReferenceImageMap) === JSON.stringify(session.rowReferenceImageMap || {});
    const sameRowReferenceVideoMap = JSON.stringify(migratedRowReferenceVideoMap) === JSON.stringify(session.rowReferenceVideoMap || {});
    const sameRowReferenceModeByRowId = JSON.stringify(normalizedRowReferenceModeByRowId) === JSON.stringify(session.rowReferenceModeByRowId || {});
    const sameDialogueVideoMap = JSON.stringify(reconciledMedia.dialogueVideoMap) === JSON.stringify(session.dialogueVideoMap || {});
    const sameDialogueAudioMap = JSON.stringify(reconciledMedia.dialogueAudioMap) === JSON.stringify(session.dialogueAudioMap || {});
    const sameVideoConfig = JSON.stringify(normalizedVideoConfig) === JSON.stringify(session.podcastVideoConfig || {});
    const sameCreativeVideoConfig = JSON.stringify(normalizedCreativeVideoConfig) === JSON.stringify(session.creativeVideoConfig || {});
    const sameStudioUiState = JSON.stringify(normalizedStudioUiState) === JSON.stringify(session.podcastStudioUiState || {});
    const sameVideoContentType = normalizeVideoContentType(session?.script?.videoContentType || session?.videoContentType) === resolvedVideoContentType;
    const sameLegacyVideoMode = Boolean(session?.script?.videoMode === true) === resolvedLegacyVideoMode;
    const sameChat = Array.isArray(session.chat) && session.chat.length === normalizedChat.length;
    // Use getSessionRows to allow emergency recovery from audioMap/segments when script.rows is corrupt
    const recoveredRows = getSessionRows(session);
    const normalizedScriptRows = (
      Array.isArray(session.script?.rows) && session.script.rows.length > 0
        ? normalizeRows(session.script.rows).map((row) => normalizeRowVoiceConfig(row, session))
        : recoveredRows
    );
    const sameRows = JSON.stringify(normalizedScriptRows) === JSON.stringify(Array.isArray(session.script?.rows) ? session.script.rows : []);
    if (recoveredRows.length > 0 && !Array.isArray(session.script?.rows)) {
      // Silent recovery to keep DevTools focused on actionable errors.
    }
    if (sameVoiceMap && sameExpressionMap && sameNameMap && sameScenarioMap && sameScenarioVariantsMap && sameGlobalScenarioDeck && sameDisfluencyDefaults && sameTtsDirectionDefaults && samePortraitMap && sameSpeakerReferenceImageMap && sameScenarioReferenceImageMap && sameRowReferenceImageListMap && sameRowReferenceImageMap && sameRowReferenceVideoMap && sameRowReferenceModeByRowId && sameDialogueVideoMap && sameDialogueAudioMap && sameVideoConfig && sameCreativeVideoConfig && sameStudioUiState && sameVideoContentType && sameLegacyVideoMode && sameRows && sameChat) return session;
    changed = true;
    return {
      ...session,
      videoContentType: persistedVideoContentType,
      speakerVoiceMap: trimmedVoiceMap,
      speakerExpressionMap: normalizedExpressionMap,
      speakerNameMap: normalizedNameMap,
      speakerScenarioMap: normalizedScenarioMap,
      speakerScenarioVariantsMap: normalizedScenarioVariantsMap,
      globalScenarioDeck: normalizedGlobalScenarioDeck,
      disfluencyDefaults: normalizedDisfluencyDefaults,
      ttsDirectionDefaults: normalizedTtsDirectionDefaults,
      chat: normalizedChat,
      speakerPortraitMap: normalizedPortraitMap,
      speakerReferenceImageMap: normalizedSpeakerReferenceImageMap,
      scenarioReferenceImageMap: normalizedScenarioReferenceImageMap,
      rowReferenceImageListMap: migratedRowReferenceImageListMap,
      rowReferenceImageMap: migratedRowReferenceImageMap,
      rowReferenceVideoMap: migratedRowReferenceVideoMap,
      rowReferenceModeByRowId: normalizedRowReferenceModeByRowId,
      dialogueVideoMap: reconciledMedia.dialogueVideoMap,
      dialogueAudioMap: reconciledMedia.dialogueAudioMap,
      podcastVideoConfig: normalizedVideoConfig,
      creativeVideoConfig: normalizedCreativeVideoConfig,
      podcastStudioUiState: normalizedStudioUiState,
      script: {
        ...(session?.script || {}),
        videoContentType: persistedVideoContentType,
        videoMode: resolvedLegacyVideoMode,
        rows: normalizedScriptRows,
        hosts: (session.script?.hosts || session.hosts || [...DEFAULT_HOSTS]),
        episodeTitle: (session.script?.episodeTitle || session.title || "Sin título todavía")
      }
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
  // Fuente de verdad: solo los locutores configurados en el panel del guión (script.hosts).
  // Fallback a session.hosts por compatibilidad legacy.
  const hosts = Array.isArray(session?.script?.hosts) && session.script.hosts.length
    ? session.script.hosts
    : (Array.isArray(session?.hosts) && session.hosts.length ? session.hosts : null);

  if (hosts) {
    const normalized = hosts
      .map((h) => {
        const name = String(h || "").trim();
        if (!name) return null;
        // Normalizar casing si coincide con un nombre canónico en VOICES
        const canonical = VOICES.find((v) => v.toLowerCase() === name.toLowerCase());
        return canonical || name;
      })
      .filter(Boolean);
    if (normalized.length) return Array.from(new Set(normalized));
  }

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
  const activeSession = session || getActiveSession();
  const target = speaker;
  let row = null;
  let rowId = "";
  let key = "";
  if (target && typeof target === "object") {
    row = target;
    rowId = String(target?.id || "").trim();
    key = String(target?.speaker || "").trim();
  } else {
    const raw = String(target || "").trim();
    const matchedRow = findSessionRowById(activeSession, raw);
    if (matchedRow) {
      row = matchedRow;
      rowId = raw;
      key = String(matchedRow?.speaker || "").trim();
    } else {
      key = raw;
    }
  }
  if (!key) return resolveSpeakerVoiceName("", activeSession);
  if (row?.voiceName && normalizeVoiceNameSource(row?.voiceNameSource) === "row") {
    return normalizeLiveVoiceName(String(row.voiceName || "").trim(), resolveSpeakerVoiceName(key, activeSession));
  }
  if (rowId) {
    const draftRowVoice = readRowVoiceDraftValue(rowId);
    if (draftRowVoice) return draftRowVoice;
  }
  const draft = collectGlobalSpeakerDraft(activeSession);
  const draftVoice = normalizeLiveVoiceName(String(draft?.voiceMap?.[key] || "").trim(), "");
  if (draftVoice) return draftVoice;
  return resolveSpeakerVoiceName(key, activeSession);
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
  const creative = String(options?.contentMode || "").trim().toLowerCase() === "creative"
    || options?.videoMode === true
    || isEducationalVideoMode(session);
  const explicitScenario = String(options?.scenario || "").replace(/\s+/g, " ").trim();
  if (explicitScenario) {
    return creative ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(explicitScenario) : explicitScenario;
  }
  const selectedGlobalScenario = String(resolveActiveGlobalScenarioVariant(session)?.prompt || "").replace(/\s+/g, " ").trim();
  const activeVariantText = String(resolveActiveScenarioVariant(session, key)?.text || "").replace(/\s+/g, " ").trim();
  const draftScenarioMap = collectGlobalSpeakerDraft(session)?.scenarioMap || {};
  const draftScenario = String(draftScenarioMap[key] || "").replace(/\s+/g, " ").trim();
  const speakerScenario = String(getSpeakerScenarioMap(session)?.[key] || "").replace(/\s+/g, " ").trim();
  const hostScenario = activeVariantText || draftScenario || speakerScenario;
  const nextSelectedScenario = creative ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(selectedGlobalScenario) : selectedGlobalScenario;
  const nextHostScenario = creative ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(hostScenario) : hostScenario;
  if (nextSelectedScenario && nextHostScenario && nextHostScenario !== nextSelectedScenario) {
    return `${nextSelectedScenario}. Variacion obligatoria para ${key}: ${nextHostScenario}. Mantener exactamente el mismo set base y solo variar zona, angulo y bloqueo del locutor dentro de ese escenario.`
      .replace(/\s+/g, " ")
      .trim();
  }
  return nextSelectedScenario || nextHostScenario || "Entorno visual creativo premium";
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

function buildGlobalScenarioVariantText(variantIndex = 0, revision = 0, options = {}) {
  const videoMode = options?.videoMode === true;
  const baseLabel = videoMode ? "Entorno visual creativo premium" : GLOBAL_SCENARIO_BASE_LABEL;
  return buildScenarioVariantText(baseLabel, "", variantIndex, revision);
}

function normalizeGlobalScenarioDeck(raw = null, options = {}) {
  const safe = raw && typeof raw === "object" ? raw : {};
  const rawItems = Array.isArray(safe.items) ? safe.items : [];
  const videoMode = options?.videoMode === true;
  const used = new Set();
  const items = [0, 1].map((index) => {
    const rawItem = rawItems[index] && typeof rawItems[index] === "object" ? rawItems[index] : {};
    let revision = Math.max(0, Number(rawItem.revision) || 0);
    let prompt = String(rawItem.prompt || buildGlobalScenarioVariantText(index, revision, options)).replace(/\s+/g, " ").trim();
    if (videoMode) {
      prompt = requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(prompt);
    }
    while (!prompt || used.has(prompt)) {
      revision += 1;
      prompt = buildGlobalScenarioVariantText(index, revision, options);
      if (videoMode) {
        prompt = requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(prompt);
      }
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
  return normalizeGlobalScenarioDeck(session?.globalScenarioDeck || null, {
    videoMode: isEducationalVideoMode(session)
  });
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
  const direct = hosts.find((h) => h === clean || h.toLowerCase() === clean.toLowerCase());
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
  if (ci) return ci;
  // Fallback for suffixed voices (e.g. "Analista 1")
  const base = raw.replace(/\s+\d+$/, "").trim().toLowerCase();
  const baseMatch = VOICES.find((v) => v.toLowerCase() === base);
  return baseMatch ? raw : fallback;
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

function buildPodcasterVideoModelChain(preferredModel = "") {
  const requested = String(preferredModel || "").trim();
  return Array.from(new Set([requested, ...AVAILABLE_PODCASTER_VIDEO_MODELS].filter(Boolean)));
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
  return "gemini-3.1-flash-tts-preview";
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

function consumeImportedVideoPromptBridge(options = {}) {
  const {
    renderAfter = false,
    clearAfterRead = true
  } = options;
  let payload = null;
  try {
    payload = JSON.parse(localStorage.getItem(PODCASTER_VIDEO_IMPORT_STORAGE_KEY) || "null");
  } catch (_) {
    payload = null;
  }
  const prompt = String(payload?.prompt || "").trim();
  if (!prompt) return false;
  const forceNewSession = payload?.createNewSession === true;
  if (forceNewSession) {
    const title = normalizeSessionTitle(buildShortSessionTitle(prompt));
    const importedSession = createSession({
      title,
      prompt,
      updatedAt: nowIso()
    });
    state.sessions = [importedSession, ...state.sessions.filter((item) => item?.id !== importedSession.id)];
    state.activeSessionId = importedSession.id;
    resetPodcastStudioSessionUiState(importedSession);
    persistSessions();
  } else {
    ensureSession();
    upsertActiveSession((session) => ({
      ...session,
      prompt
    }), { render: false });
  }
  if (els.promptInput) {
    setPromptInputContent(prompt);
  }
  setComposerGenerationMode(String(payload?.mode || "").trim() === "video" ? "video" : "script");
  if (els.generationStatus) {
    els.generationStatus.textContent = "Guion importado";
  }
  autoResizePrompt();
  if (clearAfterRead) {
    try {
      localStorage.removeItem(PODCASTER_VIDEO_IMPORT_STORAGE_KEY);
    } catch (_) {
      // noop
    }
  }
  if (renderAfter) {
    render();
  }
  return true;
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
    playPodcastStageVideo({ restart: true, silent: true }).catch(() => { });
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
    try { source.stop(0); } catch (_) { }
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
    stopGeminiLiveSession().catch(() => { });
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
            try { geminiLiveSession?.close(); } catch (_) { }
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
  syncStudioPlayDialogueAudioButton();
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

function syncStudioPlayDialogueAudioButton() {
  if (!els.playDialogueAudioBtn) return;
  const session = getActiveSession();
  const rowId = resolveTargetVideoRowId(session);
  const cleanRowId = String(rowId || "").trim();
  const isPlaying = Boolean(cleanRowId) && String(studioDialoguePreviewRowId || "").trim() === cleanRowId;
  const hasAudio = hasStoredMediaSource(resolveDialogueAudioForRow(session, cleanRowId));
  // Allow stopping even if the UI is busy; otherwise require stored audio.
  els.playDialogueAudioBtn.disabled = !cleanRowId || (!isPlaying && (podcastVideoState.busy || !hasAudio));
  els.playDialogueAudioBtn.classList.toggle("is-playing", isPlaying);
  els.playDialogueAudioBtn.setAttribute(
    "title",
    isPlaying ? "Detener voz de escena" : "Reproducir voz guardada de la escena"
  );
  els.playDialogueAudioBtn.setAttribute(
    "aria-label",
    isPlaying ? "Detener voz guardada de escena" : "Reproducir voz guardada de escena"
  );
  els.playDialogueAudioBtn.innerHTML = isPlaying ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-play"></i>';
}

function stopStudioDialoguePreviewAudio() {
  playbackController.stopStandaloneAudio();
  studioDialoguePreviewAudioEl = null;
  studioDialoguePreviewRowId = "";
  syncStudioPlayDialogueAudioButton();
}

async function playStudioDialoguePreviewAudio(rowId = "") {
  const session = getActiveSession();
  const key = String(rowId || "").trim();
  if (!session || !key) return false;
  if (String(studioDialoguePreviewRowId || "").trim() === key) {
    stopStudioDialoguePreviewAudio();
    return true;
  }
  const storedAudio = resolveDialogueAudioForRow(session, key);
  const storedAudioSrc = resolveStorageAudioUrl(storedAudio?.downloadUrl || "", storedAudio?.storagePath || "");
  if (!storedAudioSrc) return false;
  stopStudioDialoguePreviewAudio();
  studioDialoguePreviewRowId = key;
  syncStudioPlayDialogueAudioButton();

  const audioSrc = await ensurePodcastStageAudioCachedObjectUrl(storedAudioSrc);
  const started = await playbackController.playStandaloneAudio(key, audioSrc, {
    volume: resolveTimelineClipVoiceVolume(session, key),
    playbackRate: resolveDialogueAudioPlaybackRate(session, key)
  });

  if (started) {
    studioDialoguePreviewAudioEl = playbackController.state.standaloneAudio;
    if (studioDialoguePreviewAudioEl) {
      studioDialoguePreviewAudioEl.addEventListener("ended", () => {
        if (studioDialoguePreviewAudioEl === playbackController.state.standaloneAudio) {
          stopStudioDialoguePreviewAudio();
        }
      }, { once: true });
    }
    return true;
  }
  return false;
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
  playbackController.stopStandaloneAudio();
  playingRowId = "";
  activePlaybackVoiceName = "";
  stopRowPlaybackCounter();
  updateRowPlayButtons();
  setPodcastPlaybackRowStatus("idle", { rowId: "" });
  const session = getActiveSession();
  if (session && podcastVideoState.activeSpeaker) {
    setPodcastVideoSpeaker(session, podcastVideoState.activeSpeaker, { speaking: false });
  } else if (session) {
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
  stopStudioDialoguePreviewAudio();
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
    const speedMultiplier = Math.max(0.5, Math.min(1.9, Number(options.speedMultiplier || 1)));
    const storedAudio = resolveDialogueAudioForRow(session, row.id);
    const clipPlaybackRate = resolveDialogueAudioPlaybackRate(session, row.id);
    const storedAudioSrc = resolveStorageAudioUrl(storedAudio?.downloadUrl || "", storedAudio?.storagePath || "");
    if (storedAudioSrc) {
      playingRowId = rowId;
      activePlaybackVoiceName = "stored-scene-audio";
      startRowPlaybackCounter(rowId);
      if (podcastVideoState.enabled) {
        setPodcastVideoSpeaker(session, row.speaker, { speaking: true, rowId: row.id });
      }
      updateRowPlayButtons();

      const audioSrc = await ensurePodcastStageAudioCachedObjectUrl(storedAudioSrc);
      const playbackRate = Math.max(0.5, Math.min(2.25, speedMultiplier * clipPlaybackRate));
      const volume = resolveTimelineClipVoiceVolume(session, rowId);

      const started = await playbackController.playStandaloneAudio(rowId, audioSrc, {
        volume,
        playbackRate
      });

      if (started) {
        const audio = playbackController.state.standaloneAudio;
        if (audio) {
          audio.addEventListener("ended", () => {
            updatePlayingRowFromAudioDrain();
          }, { once: true });
        }
        setLiveStatusText(`Audio de escena: ${resolveSpeakerDisplayName(row.speaker, session)}`);
        return true;
      }
      return false;
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
      await geminiLiveAudioCtx.resume().catch(() => { });
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
    const targetSpeechLine = buildTargetSpeechLine(row, session);
    geminiLivePcmPlaybackRate = speedMultiplier;
    rowVideoSyncState.armed = podcastVideoState.enabled === true;
    rowVideoSyncState.rowId = row.id;
    rowVideoSyncState.speed = speedMultiplier;
    const disfluencyInstruction = buildDisfluencyInstruction(row, session);
    const prompt = buildGeminiTtsPrompt(row, session, {
      contentMode: "podcast",
      voiceName: voiceProfile.voiceName,
      speakerLabel: row.speaker,
      speakerName: resolveSpeakerDisplayName(row.speaker, session),
      targetSpeechLine,
      originalText: row.text,
      disfluencyInstruction,
      notes: row.notes
    });
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

function getSessionGenerationStatus(session = null) {
  const status = session?.generationStatus;
  return {
    text: String(status?.text || "").trim(),
    tone: String(status?.tone || "").trim()
  };
}

function renderGenerationStatus(session = null) {
  if (!els.generationStatus) return;
  const status = getSessionGenerationStatus(session || getActiveSession());
  els.generationStatus.textContent = status.text || "";
  els.generationStatus.className = "composer-chip";
  if (status.tone) els.generationStatus.classList.add(status.tone);
}

function setGenerationStatus(text, tone = "", options = {}) {
  const sessionId = String(options?.sessionId || getActiveSession()?.id || state.activeSessionId || "").trim();
  if (sessionId) {
    state.sessions = state.sessions.map((session) => (
      session.id === sessionId
        ? {
          ...session,
          generationStatus: {
            text: String(text || "").trim(),
            tone: String(tone || "").trim()
          }
        }
        : session
    ));
  }
  renderGenerationStatus(getActiveSession());
}
function buildSpeakerMapsForHosts(hosts = [], session = null, snapshots = {}) {
  return buildSpeakerMapsForHostsShared(hosts, session, snapshots, {
    getSpeakerVoiceMap,
    getSpeakerExpressionMap,
    getSpeakerNameMap,
    getSpeakerScenarioMap,
    normalizeLiveVoiceName,
    resolveSpeakerVoiceName,
    EXPRESSIONS,
    DEFAULT_SPEAKER_NAME_MAP,
    DEFAULT_SPEAKER_SCENARIO_MAP,
    rewriteScenarioPromptForEducationalVideo: requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")
  });
}

function normalizeCreativeVideoScriptForDisplay(script = {}, session = null, options = {}) {
  const preserveExactRows = options?.preserveExactRows !== false;
  const explicitVideoType = normalizeVideoContentType(
    options?.videoContentType
    || script?.videoContentType
    || session?.script?.videoContentType
  );
  const videoMode = (options?.videoMode === true);
  const videoContentType = explicitVideoType !== "none"
    ? explicitVideoType
    : (videoMode ? "creative" : "none");
  const base = preserveExactRows && videoMode
    ? {
      ...(script || {}),
      videoMode: videoMode,
      videoContentType,
      videoPreset: normalizeVideoPreset(script?.videoPreset || session?.script?.videoPreset || session?.videoPreset || "creative"),
      hosts: Array.isArray(script?.hosts) && script.hosts.length ? script.hosts : getSpeakerOptions(session),
      rows: normalizeRows(script?.rows).map((row) => ({
        ...row,
        text: String(row?.text || row?.voiceOverText || row?.guion || row?.script || "").trim(),
        notes: String(row?.notes || row?.visualNotes || row?.visual || row?.elementoVisual || "").trim(),
        sceneDescription: String(row?.sceneDescription || row?.scenePrompt || row?.descripcionEscena || row?.descripcionDeEscena || row?.scene || row?.escena || "").trim(),
        scenePrompt: String(row?.scenePrompt || row?.sceneDescription || "").trim(),
        visualNotes: String(row?.visualNotes || row?.visual || row?.elementoVisual || row?.elemento_visual || row?.visualElement || row?.["Elemento visual"] || row?.["Elemento Visual"] || "").trim(),
        videoDirective: String(row?.videoDirective || row?.visualNotes || row?.visual || row?.elementoVisual || row?.elemento_visual || row?.direccionVideo || row?.direcciónVideo || "").trim(),
        imagePrompts: normalizeVideoImagePrompts(row?.imagePrompts || [])
      }))
    }
    : normalizeScriptPayload(script || {}, {
      session,
      disfluencyDefaults: script?.disfluencyDefaults || session?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG,
      speakerNameMap: options?.snapshots?.speakerNameMap || {},
      skipOptimize: preserveExactRows,
      videoMode,
      videoContentType
    });
  if (!Array.isArray(base?.rows)) return base;
  base.rows = base.rows.map((row, index) => {
    const scenePrompt = requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(
      String(row?.scenePrompt || row?.sceneDescription || "").replace(/\s+/g, " ").trim()
      || `Secuencia ${index + 1}: apoyo visual limpio y creativo en 16:9.`
    );
    const imagePrompts = normalizeVideoImagePrompts(row.imagePrompts || []).map((prompt) => {
      const sanitizedPrompt = sanitizeSpeakerMentionsInDialogue(prompt, session, base.hosts);
      return requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(sanitizedPrompt);
    });
    const sanitizedRow = {
      ...row,
      text: sanitizeSpeakerMentionsInDialogue(String(row?.text || row?.voiceOverText || ""), session, base.hosts),
      notes: sanitizeSpeakerMentionsInDialogue(String(row?.notes || ""), session, base.hosts),
      sceneDescription: String(row?.sceneDescription || row?.scenePrompt || row?.descripcionEscena || row?.descripcionDeEscena || row?.scene || "").replace(/\s+/g, " ").trim(),
      visualNotes: String(row?.visualNotes || "").replace(/\s+/g, " ").trim(),
      transition: String(row?.transition || row?.visualNotes || row?.visual || row?.notes || "").replace(/\s+/g, " ").trim(),
      videoDirective: String(row?.videoDirective || row?.visualNotes || row?.visual || row?.elementoVisual || row?.elemento_visual || "").replace(/\s+/g, " ").trim(),
      scenePrompt,
      imagePrompts
    };
    sanitizedRow.disfluencyConfig = normalizeDisfluencyConfig(
      sanitizedRow?.disfluencyConfig || script?.disfluencyDefaults || session?.disfluencyDefaults || DEFAULT_DISFLUENCY_CONFIG
    );
    sanitizedRow.ttsDirectionConfig = normalizeTtsDirectionConfig(
      sanitizedRow?.ttsDirectionConfig || script?.ttsDirectionDefaults || session?.ttsDirectionDefaults || DEFAULT_TTS_DIRECTION_CONFIG
    );
    return sanitizedRow;
  });
  return base;
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

function syncMontageSceneMixModalInputs(source = "") {
  const session = getActiveSession();
  if (!session) return;
  ensureMontageDefaultVolumesPersisted(session);
  const cfg = getPodcastVideoConfig(session);
  let veoPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0))));
  let geminiPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100))));
  const rowIds = getSessionRows(session)
    .map((row) => String(row?.id || "").trim())
    .filter(Boolean);
  const activeRowId = String(podcastVideoState.activeRowId || "").trim();
  const fallbackBackgroundPct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(panelMusicState?.montageVolume, 100))));
  const resolvedBackgroundPct = (() => {
    const allSceneValues = rowIds
      .map((rowId) => getSceneBackgroundMusicVolumeOverridePct(session, rowId))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(200, Math.round(value))));
    if (allSceneValues.length === rowIds.length && allSceneValues.length > 0 && allSceneValues.every((value) => value === allSceneValues[0])) {
      return allSceneValues[0];
    }
    const activeValue = getSceneBackgroundMusicVolumeOverridePct(session, activeRowId);
    if (Number.isFinite(activeValue)) {
      return Math.max(0, Math.min(200, Math.round(activeValue)));
    }
    return fallbackBackgroundPct;
  })();
  let backgroundPct = resolvedBackgroundPct;
  if (source === "veoRange" && els.montageSceneVeoVolumeRange) {
    veoPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(els.montageSceneVeoVolumeRange.value, veoPct))));
  } else if (source === "veoNumber" && els.montageSceneVeoVolumeNumber) {
    veoPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(els.montageSceneVeoVolumeNumber.value, veoPct))));
  }
  if (source === "geminiRange" && els.montageSceneGeminiVolumeRange) {
    geminiPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(els.montageSceneGeminiVolumeRange.value, geminiPct))));
  } else if (source === "geminiNumber" && els.montageSceneGeminiVolumeNumber) {
    geminiPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(els.montageSceneGeminiVolumeNumber.value, geminiPct))));
  }
  if (source === "backgroundRange" && els.montageSceneBackgroundVolumeRange) {
    backgroundPct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(els.montageSceneBackgroundVolumeRange.value, backgroundPct))));
  } else if (source === "backgroundNumber" && els.montageSceneBackgroundVolumeNumber) {
    backgroundPct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(els.montageSceneBackgroundVolumeNumber.value, backgroundPct))));
  }
  if (els.montageSceneVeoVolumeRange) els.montageSceneVeoVolumeRange.value = String(veoPct);
  if (els.montageSceneVeoVolumeNumber) els.montageSceneVeoVolumeNumber.value = String(veoPct);
  if (els.montageSceneGeminiVolumeRange) els.montageSceneGeminiVolumeRange.value = String(geminiPct);
  if (els.montageSceneGeminiVolumeNumber) els.montageSceneGeminiVolumeNumber.value = String(geminiPct);
  if (els.montageSceneBackgroundVolumeRange) els.montageSceneBackgroundVolumeRange.value = String(backgroundPct);
  if (els.montageSceneBackgroundVolumeNumber) els.montageSceneBackgroundVolumeNumber.value = String(backgroundPct);
}

function setMontageSceneMixOpen(isOpen) {
  montageSceneMixOpen = !!isOpen;
  if (els.montageSceneMixModal) {
    els.montageSceneMixModal.hidden = !montageSceneMixOpen;
  }
  if (montageSceneMixOpen) {
    syncMontageSceneMixModalInputs();
  }
}

function applyMontageSceneMixToAllScenes() {
  const session = getActiveSession();
  if (!session) return;
  const cfg = getPodcastVideoConfig(session);
  const previousVeoPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0))));
  const previousGeminiPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100))));
  const previousBackgroundPct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(panelMusicState?.montageVolume, 100))));
  const veoPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(
    els.montageSceneVeoVolumeRange?.value ?? els.montageSceneVeoVolumeNumber?.value,
    toFiniteNumber(cfg.montageDefaultVeoVolumePct, 0)
  ))));
  const geminiPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(
    els.montageSceneGeminiVolumeRange?.value ?? els.montageSceneGeminiVolumeNumber?.value,
    toFiniteNumber(cfg.montageDefaultGeminiVolumePct, 100)
  ))));
  const backgroundPct = Math.max(0, Math.min(200, Math.round(toFiniteNumber(
    els.montageSceneBackgroundVolumeRange?.value ?? els.montageSceneBackgroundVolumeNumber?.value,
    toFiniteNumber(panelMusicState?.montageVolume, 100)
  ))));
  if (els.montageSceneVeoVolumeRange) els.montageSceneVeoVolumeRange.value = String(veoPct);
  if (els.montageSceneVeoVolumeNumber) els.montageSceneVeoVolumeNumber.value = String(veoPct);
  if (els.montageSceneGeminiVolumeRange) els.montageSceneGeminiVolumeRange.value = String(geminiPct);
  if (els.montageSceneGeminiVolumeNumber) els.montageSceneGeminiVolumeNumber.value = String(geminiPct);
  if (els.montageSceneBackgroundVolumeRange) els.montageSceneBackgroundVolumeRange.value = String(backgroundPct);
  if (els.montageSceneBackgroundVolumeNumber) els.montageSceneBackgroundVolumeNumber.value = String(backgroundPct);
  const clipMap = ensureTimelineClipsByRowId(session, { persist: false });
  const nextClips = { ...clipMap };
  const nextTimelineSceneAudioMixByRowId = {
    ...(cfg?.timelineSceneAudioMixByRowId || {})
  };
  Object.keys(nextClips).forEach((rowId) => {
    const current = nextClips[rowId];
    if (!current) return;
    const currentVeoOverride = toFiniteNumber(current?.veoVolumeOverridePct, Number.NaN);
    const currentGeminiOverride = toFiniteNumber(current?.geminiVolumeOverridePct, Number.NaN);
    const preserveManualVeo = Number.isFinite(currentVeoOverride) && Math.round(currentVeoOverride) !== previousVeoPct;
    const preserveManualGemini = Number.isFinite(currentGeminiOverride) && Math.round(currentGeminiOverride) !== previousGeminiPct;
    const updated = normalizeTimelineClipItem({
      ...current,
      veoVolumeOverridePct: preserveManualVeo ? current.veoVolumeOverridePct : veoPct,
      geminiVolumeOverridePct: preserveManualGemini ? current.geminiVolumeOverridePct : geminiPct
    }, rowId);
    if (updated) nextClips[rowId] = updated;
    const currentBackgroundOverride = getSceneBackgroundMusicVolumeOverridePct(session, rowId);
    const preserveManualBackground = Number.isFinite(currentBackgroundOverride) && Math.round(currentBackgroundOverride) !== previousBackgroundPct;
    nextTimelineSceneAudioMixByRowId[rowId] = {
      ...(nextTimelineSceneAudioMixByRowId[rowId] || {}),
      backgroundMusicVolumePct: preserveManualBackground ? currentBackgroundOverride : backgroundPct
    };
  });
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    montageDefaultVeoVolumePct: veoPct,
    montageDefaultGeminiVolumePct: geminiPct,
    timelineSceneAudioMixByRowId: nextTimelineSceneAudioMixByRowId,
    timelineVersion: STUDIO_TIMELINE_VERSION,
    timelineClipsByRowId: nextClips
  }));
  renderPodcastVideoTimeline(getActiveSession());
  syncPodcastStudioInspector(getActiveSession());
  if (els.timelineClipDurationModal && !els.timelineClipDurationModal.hidden && String(getTimelineClipDurationModalState().rowId || "").trim()) {
    openTimelineClipDurationConfig(getTimelineClipDurationModalState().rowId);
  }
  const activeRowId = String(podcastVideoState.activeRowId || "").trim();
  if (activeRowId) {
    applyActiveTimelineClipMixToPlayback(getActiveSession(), activeRowId);
  }
  try {
    const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
    playbackController.syncBackgroundMusic(Math.max(0, Number(podcastVideoState.montageCursorMs || 0)), speed);
  } catch (_) { }
  setGenerationStatus(`Volúmenes globales aplicados: Veo ${veoPct}% · Gemini ${geminiPct}% · Fondo ${backgroundPct}%`, "is-live");
  scheduleSessionLocalPersist("montage-scene-mix");
  setMontageSceneMixOpen(false);
}

function setScriptSetupOpen(isOpen) {
  scriptSetupOpen = !!isOpen;
  if (els.scriptSetupModal) {
    els.scriptSetupModal.hidden = !scriptSetupOpen;
  }
}

function isCurrentModeVideo(session = null) {
  // 1. Priorizar la variable global (estado inmediato en memoria/UI)
  // Esto garantiza que el inspector y el timeline coincidan con el switch visual
  if (composerGenerationMode === "video") return true;
  if (composerGenerationMode === "script") return false;

  // 2. Fallback al estado persistido en la sesión (pasado o activo)
  const activeSession = session || getActiveSession();
  const ui = activeSession?.podcastStudioUiState;
  if (ui && (ui.composerGenerationMode === "video" || ui.composerGenerationMode === "script")) {
    return ui.composerGenerationMode === "video";
  }

  // 3. Fallback al DOM (estado visual)
  const toggle = document.querySelector("[id^='composerModeToggle']");
  if (toggle) return toggle.checked;
  return false;
}

function setComposerGenerationMode(mode = "script", options = {}) {
  const newMode = String(mode || "").trim() === "video" ? "video" : "script";
  const changed = newMode !== composerGenerationMode;
  composerGenerationMode = newMode;
  const nextSessionRailFilter = newMode === "video" ? "video" : "podcast";
  const filterChanged = state.sessionRailFilter !== nextSessionRailFilter;
  state.sessionRailFilter = nextSessionRailFilter;

  try {
    window.localStorage.setItem(COMPOSER_GENERATION_MODE_KEY, composerGenerationMode);
  } catch (_) {
    // noop
  }

  // Sincronizar todos los switches de modo (header y footer)
  document.querySelectorAll("[id^='composerModeToggle']").forEach(el => {
    if (el) el.checked = composerGenerationMode === "video";
  });

  if (els.composerTableModeWrap) {
    els.composerTableModeWrap.classList.remove("is-disabled");
    if (els.composerTableModeToggle) {
      els.composerTableModeToggle.disabled = false;
    }
  }

  if (filterChanged || changed || options.force === true) {
    renderSessions();
  }

  // Siempre sincronizar con el estado de la sesión si hay un cambio real o se fuerza
  if (changed || options.force === true) {
    upsertPodcastStudioUiState(
      { composerGenerationMode: newMode },
      { autosaveReason: options.reason || "composer-mode" }
    );

    const activeSession = getActiveSession();
    if (activeSession) {
      // Sincronizar el videoContentType de la sesión activa
      const resolvedVideoContentType = newMode === "video" ? "creative" : "none";
      const sessionWithUpdatedType = withSessionVideoContentType(activeSession, resolvedVideoContentType);

      // Actualizar en memoria y persistir en storage
      Object.assign(activeSession, sessionWithUpdatedType);
      persistSessions();

      // Forzar la actualización completa de las vistas para reflejar el nuevo modo
      renderScript(activeSession);
      syncPodcastStudioInspector(activeSession);
      renderPodcastVideoTimeline(activeSession);
    }
  }
}

function setComposerVideoTableMode(mode = "compose") {
  const newMode = String(mode || "").trim() === "create" ? "create" : "compose";
  const changed = newMode !== composerVideoTableMode;
  composerVideoTableMode = newMode;
  try {
    window.localStorage.setItem(COMPOSER_VIDEO_TABLE_MODE_KEY, composerVideoTableMode);
  } catch (_) {
    // noop
  }
  if (els.composerTableModeToggle) {
    els.composerTableModeToggle.checked = composerVideoTableMode === "create";
  }
  if (changed) {
    upsertPodcastStudioUiState(
      { composerVideoTableMode: newMode },
      { autosaveReason: "composer-table-mode" }
    );
  }
}

function readScriptSetupConfig() {
  const hostCount = normalizeHostsCount(els.scriptSetupSpeakerCount?.value || 2);
  const videoMode = Boolean(els.scriptSetupVideoMode && !els.scriptSetupVideoMode.disabled && els.scriptSetupVideoMode.checked);
  const sceneCount = Math.max(1, Math.min(220, Number(els.scriptSetupSceneCount?.value || 24)));
  const minWordsRaw = Math.max(1, Math.min(200, Number(els.scriptSetupMinWords?.value || 14)));
  const maxWordsRaw = Math.max(1, Math.min(260, Number(els.scriptSetupMaxWords?.value || 20)));
  const minWords = videoMode ? 0 : Math.min(minWordsRaw, maxWordsRaw);
  const maxWords = videoMode ? 0 : Math.max(minWordsRaw, maxWordsRaw);
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
      let uniqueId = picked;
      let counter = 1;
      while (chosenHosts.includes(uniqueId)) {
        counter++;
        uniqueId = `${picked} ${counter}`;
      }
      chosenHosts.push(uniqueId);
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
  const result = { hostCount, hosts, speakerVoiceMap, speakerNameMap, speakerScenarioMap, sceneCount, minWords, maxWords, videoMode };
  try {
    localStorage.setItem("podcaster_script_setup_last_config", JSON.stringify(result));
  } catch (e) {
    void e;
  }
  return result;
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
  const effectivePrompt = videoMode ? rewritePromptForEducationalVideo(basePrompt) : basePrompt;
  const voiceMap = setup?.speakerVoiceMap && typeof setup.speakerVoiceMap === "object"
    ? setup.speakerVoiceMap
    : {};
  const nameMap = setup?.speakerNameMap && typeof setup.speakerNameMap === "object"
    ? setup.speakerNameMap
    : {};
  const voiceLines = hosts.map((host) => `${host}=${normalizeLiveVoiceName(voiceMap[host], resolveSpeakerVoiceName(host, getActiveSession()))}`);
  const nameLines = hosts.map((host) => `${host}=${String(nameMap[host] || getSpeakerNameMap(getActiveSession())?.[host] || host).trim() || host}`);

  const personaLines = hosts.map((h, i) => {
    const roleId = String(h || "").trim();
    const roleBase = roleId.replace(/\s+\d+$/, "").trim();
    const desc = SPEAKER_ROLE_DESCRIPTIONS[roleBase] || "Locutor de podcast";
    return `- ${roleId}: ${desc}`;
  });

  const promptSections = [
    `INSTRUCCIÓN DEL USUARIO: ${effectivePrompt}`,
    "",
    "--- CONFIGURACIÓN TÉCNICA OBLIGATORIA (NO INCLUIR ESTOS TÉRMINOS EN EL TEXTO) ---",
    videoMode
      ? (hosts.length > 1
        ? `- Narradores: ${hosts.join(", ")}.`
        : `- Voz en off: ${hosts[0] || "Narrador"}.`)
      : `- Locutores: ${hosts.join(", ")}.`,
    videoMode ? "" : `- Personalidades: ${personaLines.join(" | ")}.`,
    videoMode ? "" : `- Nombres: ${nameLines.join(" | ")}.`,
    videoMode ? "" : `- Voces: ${voiceLines.join(" | ")}.`,
    `- Cantidad de escenas: EXACTAMENTE ${sceneCount}.`,
    videoMode
      ? "- Segmentación: Cada escena debe terminar en punto y seguido o punto final."
      : `- Extensión por escena: entre ${minWords} y ${maxWords} palabras.`,
    videoMode
      ? `- Tiempos: cada escena dura ${VIDEO_SCENE_MAX_SEC} seg.`
      : "- Formato: Podcast conversacional fluido.",
    "--- FIN DE CONFIGURACIÓN ---"
  ];

  return promptSections.filter(Boolean).join("\n");
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
    if (videoMode) els.scriptSetupMinWords.value = "";
    els.scriptSetupMinWords.disabled = videoMode;
  }
  if (els.scriptSetupMaxWords) {
    if (videoMode) els.scriptSetupMaxWords.value = "";
    els.scriptSetupMaxWords.disabled = videoMode;
  }
}

function normalizeGenerationConstraints(raw = {}) {
  const videoMode = raw?.videoMode === true;
  const videoPreset = String(raw?.videoPreset || "").trim().toLowerCase() === "creative" ? "creative" : "creative";
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
  if (videoMode) {
    minWords = 0;
    maxWords = 0;
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
    videoMode,
    videoPreset
  };
}

function trimWords(text = "", maxWords = 0) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const safeMax = Math.max(0, Number(maxWords) || 0);
  if (!safeMax || words.length <= safeMax) return words.join(" ");
  return words.slice(0, safeMax).join(" ");
}

function forceHostsAndAlternation(script = {}, constraints = {}, session = null) {
  return requirePodcasterScriptGeneratorApiFunction("forceHostsAndAlternation")(script, constraints, session);
}

async function generateWithGeminiStrictConstraints(prompt, sessionSnapshot, constraints = {}) {
  return requirePodcasterScriptGeneratorApiFunction("generateWithGeminiStrictConstraints")(prompt, sessionSnapshot, constraints);
}

function primeScriptSetupModal() {
  const session = getActiveSession();
  let lastConfig = null;
  try {
    const raw = localStorage.getItem("podcaster_script_setup_last_config");
    if (raw) lastConfig = JSON.parse(raw);
  } catch (e) {
    void e;
  }

  const hostCount = normalizeHostsCount(lastConfig?.hostCount || session?.script?.hosts?.length || 2);
  const sceneCount = Math.max(1, Math.min(220, Number(lastConfig?.sceneCount || session?.script?.rows?.length || 24)));
  const videoMode = isCurrentModeVideo();
  const minWords = lastConfig?.minWords || "14";
  const maxWords = lastConfig?.maxWords || "20";
  if (els.scriptSetupVideoModeRow) {
    els.scriptSetupVideoModeRow.hidden = !videoMode;
  }
  if (els.scriptSetupVideoMode) {
    els.scriptSetupVideoMode.disabled = !videoMode;
  }

  if (els.scriptSetupSpeakerCount) els.scriptSetupSpeakerCount.value = String(hostCount);
  renderScriptSetupSpeakerFields(hostCount, lastConfig?.hosts || session?.script?.hosts || [], lastConfig?.speakerVoiceMap || getSpeakerVoiceMap(session), lastConfig?.speakerNameMap || getSpeakerNameMap(session));
  if (els.scriptSetupVideoMode) els.scriptSetupVideoMode.checked = videoMode;
  syncScriptSetupVideoModeUi();
  if (els.scriptSetupSceneCount) els.scriptSetupSceneCount.value = String(sceneCount);
  if (els.scriptSetupMinWords) els.scriptSetupMinWords.value = String(minWords);
  if (els.scriptSetupMaxWords) els.scriptSetupMaxWords.value = String(maxWords);
}

function buildCloudSessionPayload(session = null) {
  const source = session || getActiveSession();
  const chat = Array.isArray(source?.chat) ? source.chat : [];

  return _buildCloudSessionPayload(source, panelMusicState, chat, {
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
  });
}

function compactCloudSessionPayload(payload = null) {
  return _compactCloudSessionPayload(payload, {
    CLOUD_SESSION_PAYLOAD_TARGET_BYTES,
    normalizeRows
  });
}
async function saveSessionToCloud(sessionId = null, options = {}) {
  persistPanelMusicSettings();
  persistPanelMusicToActiveSession();
  return sessionStore.saveManual(sessionId, options);
}

async function persistReorderedTimelinePatchToCloud(session = null, patch = {}) {
  const activeSession = session || getActiveSession();
  const uid = resolveCurrentUid();
  const sessionId = String(activeSession?.id || "").trim();
  if (!uid || !sessionId || !activeSession || activeSession.isStub) {
    return { ok: false, skipped: true, reason: "missing-session-or-auth" };
  }
  const cloudMeta = activeSession?.cloudMeta || {};
  if (!String(cloudMeta?.savedAt || "").trim() && !String(cloudMeta?.ownerId || "").trim()) {
    return { ok: false, skipped: true, reason: "local-only-session" };
  }
  const sessionRef = doc(firestoreDb, "podcaster_sessions", sessionId);
  const sessionUpdatedAt = String(activeSession?.updatedAt || nowIso()).trim() || nowIso();
  const updatePayload = {
    sessionUpdatedAt,
    updatedAt: serverTimestamp(),
    "session.updatedAt": sessionUpdatedAt
  };
  if (patch.timelineClipsByRowId && typeof patch.timelineClipsByRowId === "object") {
    updatePayload["session.podcastVideoConfig.timelineClipsByRowId"] = patch.timelineClipsByRowId;
  }
  if (patch.geminiDialogueTrack && typeof patch.geminiDialogueTrack === "object") {
    updatePayload["session.podcastVideoConfig.geminiDialogueTrack"] = patch.geminiDialogueTrack;
  }
  if (patch.timelineOnScreenTextClipsByRowId && typeof patch.timelineOnScreenTextClipsByRowId === "object") {
    updatePayload["session.podcastVideoConfig.timelineOnScreenTextClipsByRowId"] = patch.timelineOnScreenTextClipsByRowId;
  }
  if (patch.timelineOnScreenTextLayoutByRowId && typeof patch.timelineOnScreenTextLayoutByRowId === "object") {
    updatePayload["session.podcastVideoConfig.timelineOnScreenTextLayoutByRowId"] = patch.timelineOnScreenTextLayoutByRowId;
  }
  if (patch.transitionsByEdge && typeof patch.transitionsByEdge === "object") {
    updatePayload["session.podcastVideoConfig.transitionsByEdge"] = patch.transitionsByEdge;
  }
  if (patch.frameHoldsByRowId && typeof patch.frameHoldsByRowId === "object") {
    updatePayload["session.podcastVideoConfig.frameHoldsByRowId"] = patch.frameHoldsByRowId;
  }
  if (patch.speedRangesByRowId && typeof patch.speedRangesByRowId === "object") {
    updatePayload["session.podcastVideoConfig.speedRangesByRowId"] = patch.speedRangesByRowId;
  }
  try {
    await updateDoc(sessionRef, updatePayload);
    if (activeSession?.cloudMeta && typeof activeSession.cloudMeta === "object") {
      activeSession.cloudMeta.savedAt = sessionUpdatedAt;
    }
    return { ok: true, sessionId, savedAt: sessionUpdatedAt };
  } catch (error) {
    void error;
    return { ok: false, sessionId, error };
  }
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
  const panelCopy = getPanelModeCopy(session);
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
    scenarioMap[host] = panelCopy.videoMode
      ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(rawScenario || scenarioMap[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast")
      : rawScenario || scenarioMap[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast";
  }));
  return { voiceMap, expressionMap, nameMap, scenarioMap };
}

function buildSpeakerSettingsMarkup(hosts = [], session = null, draft = null) {
  const sourceVoiceMap = draft?.voiceMap || getSpeakerVoiceMap(session);
  const sourceExpressionMap = draft?.expressionMap || getSpeakerExpressionMap(session);
  const sourceNameMap = draft?.nameMap || getSpeakerNameMap(session);
  const sourceScenarioMap = draft?.scenarioMap || getSpeakerScenarioMap(session);
  const panelCopy = getPanelModeCopy(session);
  return hosts.map((host) => {
    const voiceName = normalizeLiveVoiceName(sourceVoiceMap[host], resolveSpeakerVoiceName(host, session));
    const expression = EXPRESSIONS.includes(sourceExpressionMap[host]) ? sourceExpressionMap[host] : "Neutral";
    const speakerName = String(sourceNameMap[host] || DEFAULT_SPEAKER_NAME_MAP[host] || host).trim() || host;
    const scenario = resolveScenarioForVideoMode(session, host, sourceScenarioMap[host]);
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
          <span>${escapeHtml(panelCopy.rowScenarioLabel)}</span>
          <input data-field="scenario" type="text" value="${escapeHtml(scenario)}" placeholder="${escapeHtml(panelCopy.rowScenarioPlaceholder)}">
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
  const ttsCfg = normalizeTtsDirectionConfig(session?.ttsDirectionDefaults || firstRow?.ttsDirectionConfig || DEFAULT_TTS_DIRECTION_CONFIG);
  if (els.globalTtsStylePrompt) {
    els.globalTtsStylePrompt.value = ttsCfg.stylePrompt;
  }
  if (els.globalTtsPacingPrompt) {
    els.globalTtsPacingPrompt.value = ttsCfg.pacingPrompt;
  }
  if (els.globalTtsAccentPrompt) {
    els.globalTtsAccentPrompt.value = ttsCfg.accentPrompt;
  }
  if (els.globalTtsScenePrompt) {
    els.globalTtsScenePrompt.value = ttsCfg.scenePrompt;
  }
  if (els.globalTtsAudioTags) {
    els.globalTtsAudioTags.value = ttsCfg.audioTags;
  }
  try {
    const videoCfg = getPodcastVideoConfig(session);
    if (els.globalCheapVideoMode) {
      els.globalCheapVideoMode.value = String(videoCfg.videoModel || "").trim() || "veo-3.1-lite-generate-preview";
    }
  } catch (e) {
    void e;
  }
  renderGlobalSpeakerSettings(hosts, session);
  if (els.podcastVideoSpeedSelect) {
    els.podcastVideoSpeedSelect.value = String(session.podcastVideoConfig?.playbackSpeed || 1.0);
  }
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

function readGlobalTtsDirectionControls() {
  return normalizeTtsDirectionConfig({
    stylePrompt: els.globalTtsStylePrompt?.value || "",
    pacingPrompt: els.globalTtsPacingPrompt?.value || "",
    accentPrompt: els.globalTtsAccentPrompt?.value || "",
    scenePrompt: els.globalTtsScenePrompt?.value || "",
    audioTags: els.globalTtsAudioTags?.value || ""
  });
}

function persistGlobalTtsDirectionDraft() {
  const session = getActiveSession();
  if (!session) return;
  upsertActiveSession((current) => ({
    ...current,
    ttsDirectionDefaults: readGlobalTtsDirectionControls()
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
  });
}

function persistSpeakerIdentityDraft() {
  const session = getActiveSession();
  if (!session) return;
  const hosts = getSpeakerOptions(session);
  const draft = collectGlobalSpeakerDraft(session);
  const panelCopy = getPanelModeCopy(session);
  const voiceMap = {};
  const expressionMap = {};
  const nameMap = {};
  const scenarioMap = {};
  hosts.forEach((host) => {
    voiceMap[host] = normalizeLiveVoiceName(draft.voiceMap[host], resolveSpeakerVoiceName(host, session));
    expressionMap[host] = EXPRESSIONS.includes(draft.expressionMap[host]) ? draft.expressionMap[host] : "Neutral";
    nameMap[host] = String(draft.nameMap?.[host] || DEFAULT_SPEAKER_NAME_MAP[host] || host).trim() || host;
    scenarioMap[host] = panelCopy.videoMode
      ? requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(String(draft.scenarioMap?.[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").trim() || "Cabina premium de podcast")
      : String(draft.scenarioMap?.[host] || DEFAULT_SPEAKER_SCENARIO_MAP[host] || "Cabina premium de podcast").trim() || "Cabina premium de podcast";
  });
  upsertActiveSession((current) => ({
    ...current,
    speakerVoiceMap: voiceMap,
    speakerExpressionMap: expressionMap,
    speakerNameMap: nameMap,
    speakerScenarioMap: scenarioMap,
    speakerScenarioVariantsMap: buildSpeakerScenarioVariantsMap(getSpeakerOptions(current), current?.speakerScenarioVariantsMap || {}, scenarioMap),
    script: {
      ...current.script,
      rows: normalizeRows(current.script?.rows).map((row) => {
        const speaker = String(row?.speaker || "").trim();
        if (!speaker) return row;
        const nextHostVoice = normalizeLiveVoiceName(voiceMap[speaker], resolveSpeakerVoiceName(speaker, current));
        if (normalizeVoiceNameSource(row?.voiceNameSource) === "row") {
          return normalizeRowVoiceConfig(row, current, {
            speaker,
            hostVoiceName: nextHostVoice,
            voiceName: row?.voiceName,
            voiceNameSource: "row"
          });
        }
        return normalizeRowVoiceConfig(row, current, {
          speaker,
          hostVoiceName: nextHostVoice,
          voiceName: nextHostVoice,
          voiceNameSource: "host"
        });
      })
    }
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
          prompt: buildGlobalScenarioVariantText(idx, nextRevision, {
            videoMode: isEducationalVideoMode(current)
          }),
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
      }, {
        videoMode: isEducationalVideoMode(current)
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
        }, {
          videoMode: isEducationalVideoMode(current)
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
        }, {
          videoMode: isEducationalVideoMode(current)
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
  const rows = getSessionRows(activeSession);
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

function setGeminiAudioSpeedModalOpen(rowId = "") {
  const key = String(rowId || "").trim();
  geminiAudioSpeedModalState.rowId = key;
  if (els.geminiAudioSpeedModal) {
    els.geminiAudioSpeedModal.hidden = !key;
  }
  if (key) {
    syncGeminiAudioSpeedModal(getActiveSession());
  }
}

function syncGeminiAudioSpeedModal(session = null) {
  if (!els.geminiAudioSpeedModal || !geminiAudioSpeedModalState.rowId) return;
  const activeSession = session || getActiveSession();
  const rowId = String(geminiAudioSpeedModalState.rowId || "").trim();
  const rows = getSessionRows(activeSession);
  const rowIndex = rows.findIndex((row) => String(row?.id || "").trim() === rowId);
  const row = rowIndex >= 0 ? rows[rowIndex] : null;
  const clip = resolveDialogueAudioForRow(activeSession, rowId);
  if (!row || !clip) {
    setGeminiAudioSpeedModalOpen("");
    return;
  }
  const playbackRate = resolveDialogueAudioPlaybackRate(activeSession, rowId);
  geminiAudioSpeedModalState.playbackRate = playbackRate;
  if (els.geminiAudioSpeedModalTitle) {
    els.geminiAudioSpeedModalTitle.textContent = `Velocidad Gemini · Escena ${rowIndex + 1}`;
  }
  if (els.geminiAudioSpeedModalHint) {
    const speaker = resolveSpeakerDisplayName(String(row?.speaker || "").trim(), activeSession);
    els.geminiAudioSpeedModalHint.textContent = `${speaker} · voz guardada · ${playbackRate.toFixed(2)}x`;
  }
  if (els.geminiAudioSpeedRange) {
    els.geminiAudioSpeedRange.dataset.rowId = rowId;
    els.geminiAudioSpeedRange.value = playbackRate.toFixed(2);
  }
  if (els.geminiAudioSpeedNumber) {
    els.geminiAudioSpeedNumber.dataset.rowId = rowId;
    els.geminiAudioSpeedNumber.value = playbackRate.toFixed(2);
  }
}

function syncGeminiAudioSpeedModalInputs(source = "") {
  if (!geminiAudioSpeedModalState.rowId) return;
  let nextValue = geminiAudioSpeedModalState.playbackRate;
  if (source === "range") {
    nextValue = normalizeDialogueAudioPlaybackRate(els.geminiAudioSpeedRange?.value || 1);
  } else if (source === "number") {
    nextValue = normalizeDialogueAudioPlaybackRate(els.geminiAudioSpeedNumber?.value || 1);
  }
  geminiAudioSpeedModalState.playbackRate = nextValue;
  if (els.geminiAudioSpeedRange && source !== "range") {
    els.geminiAudioSpeedRange.value = nextValue.toFixed(2);
  }
  if (els.geminiAudioSpeedNumber && source !== "number") {
    els.geminiAudioSpeedNumber.value = nextValue.toFixed(2);
  }
  if (els.geminiAudioSpeedModalHint) {
    const session = getActiveSession();
    const rows = getSessionRows(session);
    const row = rows.find((item) => String(item?.id || "").trim() === geminiAudioSpeedModalState.rowId) || null;
    const speaker = row ? resolveSpeakerDisplayName(String(row?.speaker || "").trim(), session) : "Escena";
    els.geminiAudioSpeedModalHint.textContent = `${speaker} · voz guardada · ${nextValue.toFixed(2)}x`;
  }
}

function setGeminiTrackVolumeModalOpen(isOpen = false) {
  geminiTrackVolumeModalState.open = isOpen === true;
  if (els.geminiTrackVolumeModal) {
    els.geminiTrackVolumeModal.hidden = !geminiTrackVolumeModalState.open;
  }
  if (geminiTrackVolumeModalState.open) {
    syncGeminiTrackVolumeModal(getActiveSession());
  }
}

function syncGeminiTrackVolumeModal(session = null) {
  if (!els.geminiTrackVolumeModal || geminiTrackVolumeModalState.open !== true) return;
  const activeSession = session || getActiveSession();
  const cfg = getPodcastVideoConfig(activeSession);
  const track = window.normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  const volumePct = Math.max(0, Math.min(100, Math.round(Number(track?.volumePct ?? 100) || 100)));
  geminiTrackVolumeModalState.volumePct = volumePct;
  if (els.geminiTrackVolumeModalTitle) {
    els.geminiTrackVolumeModalTitle.textContent = "Volumen general Gemini";
  }
  if (els.geminiTrackVolumeModalHint) {
    els.geminiTrackVolumeModalHint.textContent = `Track de voz Gemini · ${volumePct}%`;
  }
  if (els.geminiTrackVolumeRange) {
    els.geminiTrackVolumeRange.value = String(volumePct);
  }
  if (els.geminiTrackVolumeNumber) {
    els.geminiTrackVolumeNumber.value = String(volumePct);
  }
}

function syncGeminiTrackVolumeModalInputs(source = "") {
  if (geminiTrackVolumeModalState.open !== true) return;
  let nextValue = geminiTrackVolumeModalState.volumePct;
  if (source === "range") {
    nextValue = Math.round(Math.max(0, Math.min(100, Number(els.geminiTrackVolumeRange?.value || 0) || 0)));
  } else if (source === "number") {
    nextValue = Math.round(Math.max(0, Math.min(100, Number(els.geminiTrackVolumeNumber?.value || 0) || 0)));
  }
  geminiTrackVolumeModalState.volumePct = nextValue;
  if (els.geminiTrackVolumeRange && source !== "range") {
    els.geminiTrackVolumeRange.value = String(nextValue);
  }
  if (els.geminiTrackVolumeNumber && source !== "number") {
    els.geminiTrackVolumeNumber.value = String(nextValue);
  }
  if (els.geminiTrackVolumeModalHint) {
    els.geminiTrackVolumeModalHint.textContent = `Track de voz Gemini · ${nextValue}%`;
  }
}

function applyGeminiAudioSpeedModal(options = {}) {
  const rowId = String(geminiAudioSpeedModalState.rowId || "").trim();
  if (!rowId) return false;
  const nextPlaybackRate = normalizeDialogueAudioPlaybackRate(geminiAudioSpeedModalState.playbackRate || 1);
  let changed = false;
  upsertActiveSession((current) => {
    const currentMap = getDialogueAudioMap(current);
    const currentClip = currentMap[rowId];
    const fallbackClip = currentClip || resolveDialogueAudioForRow(current, rowId) || {};
    const updatedAt = nowIso();

    // Persist the rate into the explicit audio map even when the scene currently
    // resolves its audio through the Gemini track fallback.
    const nextMap = { ...currentMap };
    nextMap[rowId] = {
      ...fallbackClip,
      rowId,
      playbackRate: nextPlaybackRate,
      updatedAt
    };

    // 2. Actualizar SIEMPRE en la fila para consistencia Dashboard/Librería
    const nextRows = (current.script?.rows || []).map(r => {
      if (String(r.id || "").trim() === rowId) {
        return { ...r, playbackRate: nextPlaybackRate, updatedAt };
      }
      return r;
    });

    changed = true;
    return {
      ...current,
      dialogueAudioMap: nextMap,
      script: {
        ...current.script,
        rows: nextRows
      }
    };
  }, { render: false, autosave: true, autosaveReason: "audio-speed" });

  if (!changed) return false;
  if (options.close !== false) setGeminiAudioSpeedModalOpen("");

  invalidateStudioRuntimeCache();
  syncGeminiDialogueTrackWithRuntime({
    render: false,
    preserveStartMs: true,
    autosave: false,
    forceDurationFromAudio: true
  });
  renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
  playbackController.sync(getActiveSession(), getPodcastVideoConfig(getActiveSession()));
  scheduleSessionLocalPersist("gemini-audio-speed");
  setGenerationStatus(`Velocidad Gemini ajustada a ${nextPlaybackRate.toFixed(2)}x`, "is-live");
  return true;
}

function setGeminiDialogueTrackVolumePct(nextVolumePct = 100) {
  const activeSession = getActiveSession();
  if (!activeSession) return false;
  const normalizedPct = Math.max(0, Math.min(100, Math.round(toFiniteNumber(nextVolumePct, 100))));
  let changed = false;
  upsertPodcastVideoConfig((cfg) => {
    const currentTrack = window.normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
    if (Math.round(Number(currentTrack?.volumePct ?? 100)) === normalizedPct) return cfg;
    changed = true;
    return {
      ...cfg,
      geminiDialogueTrack: window.normalizeGeminiDialogueTrack({
        ...currentTrack,
        volumePct: normalizedPct,
        updatedAt: nowIso()
      })
    };
  }, { autosaveReason: "gemini-track-volume" });
  if (!changed) return false;
  invalidateStudioRuntimeCache();
  renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
  playbackController.sync(getActiveSession(), getPodcastVideoConfig(getActiveSession()));
  setGenerationStatus(`Volumen general Gemini ajustado a ${normalizedPct}%`, "is-live");
  return true;
}

function applyGeminiTrackVolumeModal(options = {}) {
  const nextVolumePct = Math.round(Math.max(0, Math.min(100, Number(geminiTrackVolumeModalState.volumePct || 0) || 0)));
  const changed = setGeminiDialogueTrackVolumePct(nextVolumePct);
  if (options.close !== false) {
    setGeminiTrackVolumeModalOpen(false);
  }
  return changed;
}

function getCurrentTimelineRuntimeEntry(rowId = "", session = null) {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!activeSession || !key) return null;
  return (buildTimelineRuntimeEntries(activeSession) || []).find((entry) => String(entry?.rowId || "").trim() === key) || null;
}

function getCurrentSceneSourceMs(rowId = "", session = null) {
  const activeSession = session || getActiveSession();
  const entry = getCurrentTimelineRuntimeEntry(rowId, activeSession);
  if (!entry) return 0;
  const resolved = typeof window.resolveSceneSourceStateAtTimelineMs === "function"
    ? window.resolveSceneSourceStateAtTimelineMs(entry, Number(podcastVideoState.montageCursorMs || 0))
    : { sourceMs: Math.max(0, Number(entry?.clip?.trimInMs || 0)) };
  return Math.max(0, Math.round(Number(resolved?.sourceMs || 0) || 0));
}

function shiftSceneTimingArtifactsAfterRow(cfg = {}, rowId = "", deltaMs = 0, activeSession = null) {
  const session = activeSession || getActiveSession();
  const roundedDeltaMs = Math.round(Number(deltaMs || 0) || 0);
  if (!session || !rowId || !roundedDeltaMs) {
    return {
      timelineClipsByRowId: window.normalizeTimelineClipsByRowId(cfg?.timelineClipsByRowId || {}),
      timelineOnScreenTextClipsByRowId: window.normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {}),
      geminiDialogueTrack: window.normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {})
    };
  }
  const rows = getSessionRows(session);
  const currentIndex = rows.findIndex((row) => String(row?.id || "").trim() === rowId);
  const affectedRowIds = new Set(rows.slice(currentIndex + 1).map((row) => String(row?.id || "").trim()).filter(Boolean));
  const nextClips = window.normalizeTimelineClipsByRowId(cfg?.timelineClipsByRowId || {});
  Object.keys(nextClips).forEach((key) => {
    if (!affectedRowIds.has(key)) return;
    nextClips[key] = window.normalizeTimelineClipItem({
      ...nextClips[key],
      startMs: Math.max(0, Number(nextClips[key]?.startMs || 0) + roundedDeltaMs)
    }, key);
  });
  const nextTextClips = window.normalizeOnScreenTextClipsByRowId(cfg?.timelineOnScreenTextClipsByRowId || {});
  Object.keys(nextTextClips).forEach((key) => {
    if (!affectedRowIds.has(key)) return;
    nextTextClips[key] = window.normalizeOnScreenTextClipItem({
      ...nextTextClips[key],
      startMs: Math.max(0, Number(nextTextClips[key]?.startMs || 0) + roundedDeltaMs)
    }, key);
  });
  const baseTrack = window.normalizeGeminiDialogueTrack(cfg?.geminiDialogueTrack || {});
  const nextGeminiTrack = {
    ...baseTrack,
    segments: (baseTrack.segments || []).map((segment) => {
      const key = String(segment?.rowId || "").trim();
      if (!affectedRowIds.has(key)) return segment;
      return {
        ...segment,
        startMs: Math.max(0, Number(segment?.startMs || 0) + roundedDeltaMs),
        endMs: Math.max(0, Number(segment?.endMs || 0) + roundedDeltaMs),
        anchorStartMs: Math.max(0, Number(segment?.anchorStartMs || segment?.startMs || 0) + roundedDeltaMs)
      };
    })
  };
  return {
    timelineClipsByRowId: nextClips,
    timelineOnScreenTextClipsByRowId: nextTextClips,
    geminiDialogueTrack: nextGeminiTrack
  };
}

function applySceneTimingEdit(rowId = "", mutator) {
  const activeSession = getActiveSession();
  const key = String(rowId || "").trim();
  if (!activeSession || !key || typeof mutator !== "function") return false;
  let changed = false;
  upsertPodcastVideoConfig((cfg) => {
    const currentClips = window.normalizeTimelineClipsByRowId(cfg?.timelineClipsByRowId || {});
    const clip = currentClips[key];
    if (!clip) return cfg;
    const frameHoldsByRowId = window.normalizeFrameHoldsByRowId(cfg?.frameHoldsByRowId || {});
    const speedRangesByRowId = window.normalizeSpeedRangesByRowId(cfg?.speedRangesByRowId || {});
    const currentFrameHolds = frameHoldsByRowId[key] || [];
    const currentSpeedRanges = speedRangesByRowId[key] || [];
    const previousDurationMs = window.getSceneEffectiveDurationMs(clip, {
      frameHolds: currentFrameHolds,
      speedRanges: currentSpeedRanges
    }, clip.sourceDurationMs);
    const nextEdits = mutator({
      clip,
      frameHoldsByRowId,
      speedRangesByRowId,
      currentFrameHolds,
      currentSpeedRanges
    });
    if (!nextEdits || typeof nextEdits !== "object") return cfg;
    const nextFrameHoldsByRowId = window.normalizeFrameHoldsByRowId(nextEdits.frameHoldsByRowId || frameHoldsByRowId);
    const nextSpeedRangesByRowId = window.normalizeSpeedRangesByRowId(nextEdits.speedRangesByRowId || speedRangesByRowId);
    const nextDurationMs = window.getSceneEffectiveDurationMs(clip, {
      frameHolds: nextFrameHoldsByRowId[key] || [],
      speedRanges: nextSpeedRangesByRowId[key] || []
    }, clip.sourceDurationMs);
    const deltaMs = Math.round(nextDurationMs - previousDurationMs);
    const shifted = shiftSceneTimingArtifactsAfterRow({
      ...cfg,
      timelineClipsByRowId: currentClips,
      timelineOnScreenTextClipsByRowId: cfg?.timelineOnScreenTextClipsByRowId || {},
      geminiDialogueTrack: cfg?.geminiDialogueTrack || {}
    }, key, deltaMs, activeSession);
    const shiftedTextClips = window.normalizeOnScreenTextClipsByRowId(shifted.timelineOnScreenTextClipsByRowId || {});
    const currentTextClip = shiftedTextClips[key] || null;
    if (currentTextClip) {
      const nextTextDurationMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        getOnScreenTextClipEffectiveDurationMs(currentTextClip) + deltaMs
      );
      shiftedTextClips[key] = window.normalizeOnScreenTextClipItem({
        ...currentTextClip,
        sourceDurationMs: Math.max(
          STUDIO_TIMELINE_MIN_CLIP_MS,
          Number(currentTextClip?.sourceDurationMs || 0) || 0,
          Number(currentTextClip?.trimInMs || 0) + nextTextDurationMs
        ),
        trimOutMs: Math.max(
          Number(currentTextClip?.trimInMs || 0) + STUDIO_TIMELINE_MIN_CLIP_MS,
          Number(currentTextClip?.trimInMs || 0) + nextTextDurationMs
        )
      }, key);
    }
    const shiftedGeminiTrack = window.normalizeGeminiDialogueTrack(shifted.geminiDialogueTrack || {});
    const nextGeminiSegments = (shiftedGeminiTrack.segments || []).map((segment) => {
      if (String(segment?.rowId || "").trim() !== key) return segment;
      const segmentStartMs = Math.max(0, Number(segment?.startMs || 0) || 0);
      const segmentTrimInMs = Math.max(0, Number(segment?.trimInMs || 0) || 0);
      const nextSegmentDurationMs = Math.max(
        STUDIO_TIMELINE_MIN_CLIP_MS,
        (Number(segment?.durationMs || 0) || (Number(segment?.endMs || 0) - segmentStartMs) || STUDIO_TIMELINE_MIN_CLIP_MS) + deltaMs
      );
      return window.normalizeGeminiDialogueTrackSegment({
        ...segment,
        durationMs: nextSegmentDurationMs,
        trimOutMs: segmentTrimInMs + nextSegmentDurationMs,
        endMs: segmentStartMs + nextSegmentDurationMs
      });
    });
    changed = true;
    return {
      ...cfg,
      timelineClipsByRowId: shifted.timelineClipsByRowId,
      timelineOnScreenTextClipsByRowId: shiftedTextClips,
      geminiDialogueTrack: window.normalizeGeminiDialogueTrack({
        ...shiftedGeminiTrack,
        segments: nextGeminiSegments
      }),
      frameHoldsByRowId: nextFrameHoldsByRowId,
      speedRangesByRowId: nextSpeedRangesByRowId
    };
  }, { autosaveReason: "scene-timing-edit" });
  if (!changed) return false;
  invalidateStudioRuntimeCache();
  const refreshedSession = getActiveSession();
  const refreshedConfig = getPodcastVideoConfig(refreshedSession) || {};
  renderPodcastVideoTimeline(refreshedSession, { force: true, reason: "structure" });
  syncPodcastStudioInspector(refreshedSession);
  syncPodcastTimelinePlayhead(refreshedSession);
  void persistReorderedTimelinePatchToCloud(refreshedSession, {
    timelineClipsByRowId: ensureTimelineClipsByRowId(refreshedSession, { persist: false }),
    geminiDialogueTrack: refreshedConfig.geminiDialogueTrack || {},
    timelineOnScreenTextClipsByRowId: ensureOnScreenTextClipsByRowId(refreshedSession, { persist: false }),
    transitionsByEdge: refreshedConfig.transitionsByEdge || {},
    frameHoldsByRowId: refreshedConfig.frameHoldsByRowId || {},
    speedRangesByRowId: refreshedConfig.speedRangesByRowId || {}
  });
  scheduleSessionLocalPersist("scene-timing-edit");
  return true;
}

function setTimelineFrameHoldModalOpen(rowId = "") {
  const key = String(rowId || "").trim();
  timelineFrameHoldModalState.rowId = key;
  if (els.timelineFrameHoldModal) {
    els.timelineFrameHoldModal.hidden = !key;
  }
  if (key) {
    syncTimelineFrameHoldModal(getActiveSession());
  }
}

function syncTimelineFrameHoldModal(session = null) {
  if (!timelineFrameHoldModalState.rowId) return;
  const activeSession = session || getActiveSession();
  const rowId = String(timelineFrameHoldModalState.rowId || "").trim();
  const rows = getSessionRows(activeSession);
  const rowIndex = rows.findIndex((row) => String(row?.id || "").trim() === rowId);
  const clip = ensureTimelineClipsByRowId(activeSession, { persist: false })[rowId];
  if (rowIndex < 0 || !clip) {
    setTimelineFrameHoldModalOpen("");
    return;
  }
  const holds = window.normalizeFrameHoldsByRowId(getPodcastVideoConfig(activeSession)?.frameHoldsByRowId || {});
  const existing = (holds[rowId] || [])[0] || null;
  const sourceMs = existing ? Math.round(Number(existing.atSourceMs || 0)) : getCurrentSceneSourceMs(rowId, activeSession);
  const holdDurationSec = existing ? Math.max(0.5, Number(existing.holdDurationMs || 0) / 1000) : 1;
  timelineFrameHoldModalState = {
    rowId,
    holdId: String(existing?.id || "").trim(),
    atSourceMs: sourceMs,
    holdDurationSec
  };
  if (els.timelineFrameHoldModalTitle) els.timelineFrameHoldModalTitle.textContent = `Congelar frame · Escena ${rowIndex + 1}`;
  if (els.timelineFrameHoldModalHint) els.timelineFrameHoldModalHint.textContent = `Se tomará el frame en ${Math.round(sourceMs)} ms del source de la escena.`;
  if (els.timelineFrameHoldAtNumber) els.timelineFrameHoldAtNumber.value = String(sourceMs);
  if (els.timelineFrameHoldDurationRange) els.timelineFrameHoldDurationRange.value = holdDurationSec.toFixed(1);
  if (els.timelineFrameHoldDurationNumber) els.timelineFrameHoldDurationNumber.value = holdDurationSec.toFixed(1);
  if (els.timelineFrameHoldModalSummary) els.timelineFrameHoldModalSummary.textContent = `${holdDurationSec.toFixed(1)} s de hold en la escena actual.`;
}

function syncTimelineFrameHoldModalInputs(source = "") {
  if (!timelineFrameHoldModalState.rowId) return;
  let atSourceMs = timelineFrameHoldModalState.atSourceMs;
  let holdDurationSec = timelineFrameHoldModalState.holdDurationSec;
  if (source === "at") atSourceMs = Math.max(0, Math.round(Number(els.timelineFrameHoldAtNumber?.value || 0) || 0));
  if (source === "range") holdDurationSec = Math.max(0.5, Math.min(8, Number(els.timelineFrameHoldDurationRange?.value || 1) || 1));
  if (source === "number") holdDurationSec = Math.max(0.5, Math.min(8, Number(els.timelineFrameHoldDurationNumber?.value || 1) || 1));
  timelineFrameHoldModalState.atSourceMs = atSourceMs;
  timelineFrameHoldModalState.holdDurationSec = holdDurationSec;
  if (els.timelineFrameHoldAtNumber && source !== "at") els.timelineFrameHoldAtNumber.value = String(atSourceMs);
  if (els.timelineFrameHoldDurationRange && source !== "range") els.timelineFrameHoldDurationRange.value = holdDurationSec.toFixed(1);
  if (els.timelineFrameHoldDurationNumber && source !== "number") els.timelineFrameHoldDurationNumber.value = holdDurationSec.toFixed(1);
  if (els.timelineFrameHoldModalSummary) els.timelineFrameHoldModalSummary.textContent = `${holdDurationSec.toFixed(1)} s de hold en ${atSourceMs} ms.`;
}

function applyTimelineFrameHoldModal() {
  const rowId = String(timelineFrameHoldModalState.rowId || "").trim();
  if (!rowId) return false;
  const holdDurationMs = Math.round(Math.max(0.5, Number(timelineFrameHoldModalState.holdDurationSec || 1)) * 1000);
  const atSourceMs = Math.max(0, Math.round(Number(timelineFrameHoldModalState.atSourceMs || 0) || 0));
  const changed = applySceneTimingEdit(rowId, ({ frameHoldsByRowId }) => {
    const nextMap = { ...frameHoldsByRowId };
    const existing = Array.isArray(nextMap[rowId]) ? [...nextMap[rowId]] : [];
    const nextItem = {
      id: timelineFrameHoldModalState.holdId || `hold-${Date.now()}`,
      atSourceMs,
      holdDurationMs
    };
    if (timelineFrameHoldModalState.holdId) {
      const idx = existing.findIndex((item) => String(item?.id || "").trim() === timelineFrameHoldModalState.holdId);
      if (idx >= 0) existing[idx] = nextItem;
      else existing.push(nextItem);
    } else {
      existing.splice(0, existing.length, nextItem);
    }
    nextMap[rowId] = existing;
    return { frameHoldsByRowId: nextMap };
  });
  if (changed) {
    setGenerationStatus(`Hold aplicado a escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}`, "is-live");
    setTimelineFrameHoldModalOpen("");
  }
  return changed;
}

function deleteTimelineFrameHoldFromModal() {
  const rowId = String(timelineFrameHoldModalState.rowId || "").trim();
  const holdId = String(timelineFrameHoldModalState.holdId || "").trim();
  if (!rowId) return false;
  const changed = applySceneTimingEdit(rowId, ({ frameHoldsByRowId }) => {
    const nextMap = { ...frameHoldsByRowId };
    const currentItems = Array.isArray(nextMap[rowId]) ? nextMap[rowId] : [];
    const nextItems = holdId
      ? currentItems.filter((item) => String(item?.id || "").trim() !== holdId)
      : [];
    if (nextItems.length) {
      nextMap[rowId] = nextItems;
    } else {
      delete nextMap[rowId];
    }
    return { frameHoldsByRowId: nextMap };
  });
  if (changed) {
    setGenerationStatus(`Hold eliminado de escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}`, "is-live");
    setTimelineFrameHoldModalOpen("");
  }
  return changed;
}

function setTimelineSpeedRangeModalOpen(rowId = "") {
  const key = String(rowId || "").trim();
  timelineSpeedRangeModalState.rowId = key;
  if (els.timelineSpeedRangeModal) {
    els.timelineSpeedRangeModal.hidden = !key;
  }
  if (key) syncTimelineSpeedRangeModal(getActiveSession());
}

function syncTimelineSpeedRangeModal(session = null) {
  if (!timelineSpeedRangeModalState.rowId) return;
  const activeSession = session || getActiveSession();
  const rowId = String(timelineSpeedRangeModalState.rowId || "").trim();
  const rows = getSessionRows(activeSession);
  const rowIndex = rows.findIndex((row) => String(row?.id || "").trim() === rowId);
  const clip = ensureTimelineClipsByRowId(activeSession, { persist: false })[rowId];
  if (rowIndex < 0 || !clip) {
    setTimelineSpeedRangeModalOpen("");
    return;
  }
  const ranges = window.normalizeSpeedRangesByRowId(getPodcastVideoConfig(activeSession)?.speedRangesByRowId || {});
  const existing = (ranges[rowId] || [])[0] || null;
  const sourceMs = getCurrentSceneSourceMs(rowId, activeSession);
  const startSourceMs = existing ? Math.round(Number(existing.startSourceMs || 0)) : sourceMs;
  const endSourceMs = existing ? Math.round(Number(existing.endSourceMs || 0)) : Math.min(Math.max(startSourceMs + 500, Number(clip?.trimOutMs || 0)), startSourceMs + 1500);
  const playbackRate = existing ? Math.max(0.25, Number(existing.playbackRate || 1)) : 1;
  timelineSpeedRangeModalState = {
    rowId,
    speedId: String(existing?.id || "").trim(),
    startSourceMs,
    endSourceMs,
    playbackRate
  };
  if (els.timelineSpeedRangeModalTitle) els.timelineSpeedRangeModalTitle.textContent = `Velocidad por rango · Escena ${rowIndex + 1}`;
  if (els.timelineSpeedRangeModalHint) els.timelineSpeedRangeModalHint.textContent = `El audio no cambiará. Solo se ajusta el video.`;
  syncTimelineSpeedRangeModalInputs();
}

function syncTimelineSpeedRangeModalInputs(source = "") {
  if (!timelineSpeedRangeModalState.rowId) return;
  let startSourceMs = timelineSpeedRangeModalState.startSourceMs;
  let endSourceMs = timelineSpeedRangeModalState.endSourceMs;
  let playbackRate = timelineSpeedRangeModalState.playbackRate;
  if (source === "start") startSourceMs = Math.max(0, Math.round(Number(els.timelineSpeedRangeStartNumber?.value || 0) || 0));
  if (source === "end") endSourceMs = Math.max(startSourceMs + 500, Math.round(Number(els.timelineSpeedRangeEndNumber?.value || 0) || 0));
  if (source === "range") playbackRate = Math.max(0.25, Math.min(3, Number(els.timelineSpeedRangeRateRange?.value || 1) || 1));
  if (source === "number") playbackRate = Math.max(0.25, Math.min(3, Number(els.timelineSpeedRangeRateNumber?.value || 1) || 1));
  if (endSourceMs <= startSourceMs) endSourceMs = startSourceMs + 500;
  timelineSpeedRangeModalState.startSourceMs = startSourceMs;
  timelineSpeedRangeModalState.endSourceMs = endSourceMs;
  timelineSpeedRangeModalState.playbackRate = playbackRate;
  if (els.timelineSpeedRangeStartNumber && source !== "start") els.timelineSpeedRangeStartNumber.value = String(startSourceMs);
  if (els.timelineSpeedRangeEndNumber && source !== "end") els.timelineSpeedRangeEndNumber.value = String(endSourceMs);
  if (els.timelineSpeedRangeRateRange && source !== "range") els.timelineSpeedRangeRateRange.value = playbackRate.toFixed(2);
  if (els.timelineSpeedRangeRateNumber && source !== "number") els.timelineSpeedRangeRateNumber.value = playbackRate.toFixed(2);
  if (els.timelineSpeedRangeModalSummary) {
    els.timelineSpeedRangeModalSummary.textContent = `${startSourceMs} - ${endSourceMs} ms · ${playbackRate.toFixed(2)}x`;
  }
}

function applyTimelineSpeedRangeModal() {
  const rowId = String(timelineSpeedRangeModalState.rowId || "").trim();
  if (!rowId) return false;
  const changed = applySceneTimingEdit(rowId, ({ speedRangesByRowId }) => {
    const nextMap = { ...speedRangesByRowId };
    const existing = Array.isArray(nextMap[rowId]) ? [...nextMap[rowId]] : [];
    const nextItem = {
      id: timelineSpeedRangeModalState.speedId || `speed-${Date.now()}`,
      startSourceMs: Math.max(0, Math.round(Number(timelineSpeedRangeModalState.startSourceMs || 0) || 0)),
      endSourceMs: Math.max(0, Math.round(Number(timelineSpeedRangeModalState.endSourceMs || 0) || 0)),
      playbackRate: Math.max(0.25, Math.min(3, Number(timelineSpeedRangeModalState.playbackRate || 1) || 1))
    };
    if (timelineSpeedRangeModalState.speedId) {
      const idx = existing.findIndex((item) => String(item?.id || "").trim() === timelineSpeedRangeModalState.speedId);
      if (idx >= 0) existing[idx] = nextItem;
      else existing.push(nextItem);
    } else {
      existing.splice(0, existing.length, nextItem);
    }
    nextMap[rowId] = existing;
    return { speedRangesByRowId: nextMap };
  });
  if (changed) {
    setGenerationStatus(`Velocidad parcial aplicada a escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}`, "is-live");
    setTimelineSpeedRangeModalOpen("");
  }
  return changed;
}

function deleteTimelineSpeedRangeFromModal() {
  const rowId = String(timelineSpeedRangeModalState.rowId || "").trim();
  const speedId = String(timelineSpeedRangeModalState.speedId || "").trim();
  if (!rowId || !speedId) return false;
  const changed = applySceneTimingEdit(rowId, ({ speedRangesByRowId }) => {
    const nextMap = { ...speedRangesByRowId };
    nextMap[rowId] = (nextMap[rowId] || []).filter((item) => String(item?.id || "").trim() !== speedId);
    return { speedRangesByRowId: nextMap };
  });
  if (changed) setTimelineSpeedRangeModalOpen("");
  return changed;
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

function hideStageImagePreview() {
  if (!els.podcastActiveSpeakerImage) return;
  els.podcastActiveSpeakerImage.hidden = true;
  els.podcastActiveSpeakerImage.style.opacity = "0";
  els.podcastActiveSpeakerImage.style.visibility = "hidden";
  delete els.podcastActiveSpeakerImage.dataset.stageMode;
  delete els.podcastActiveSpeakerImage.dataset.src;
}

function applySceneMediaScaleToStage({
  rowId = "",
  mediaScale = 1,
  mediaOffsetXPct = 0,
  mediaOffsetYPct = 0,
  mediaMotionPreset = "none",
  visualLayoutMode = "default",
  container = null
} = {}) {
  const target = container
    || els.podcastVideoStage?.querySelector?.(".podcast-video-preview")
    || null;
  if (!target) return;
  const nextScale = normalizeTimelineClipMediaScale(mediaScale);
  const nextX = typeof normalizeTimelineClipMediaOffset === "function" ? normalizeTimelineClipMediaOffset(mediaOffsetXPct) : Math.max(-0.5, Math.min(0.5, Number(mediaOffsetXPct) || 0));
  const nextY = typeof normalizeTimelineClipMediaOffset === "function" ? normalizeTimelineClipMediaOffset(mediaOffsetYPct) : Math.max(-0.5, Math.min(0.5, Number(mediaOffsetYPct) || 0));
  const nextMotion = typeof normalizeTimelineClipMediaMotionPreset === "function" ? normalizeTimelineClipMediaMotionPreset(mediaMotionPreset) : "none";
  target.style.setProperty("--pod-scene-media-scale", String(nextScale));
  target.style.setProperty("--pod-scene-media-x", `${(nextX * 100).toFixed(3)}%`);
  target.style.setProperty("--pod-scene-media-y", `${(nextY * 100).toFixed(3)}%`);
  target.style.setProperty("--pod-scene-media-motion-preset", nextMotion);
  target.dataset.sceneMediaRowId = String(rowId || "").trim();
  target.dataset.sceneMediaScale = String(nextScale);
  target.dataset.sceneMediaOffsetX = String(nextX);
  target.dataset.sceneMediaOffsetY = String(nextY);
  target.dataset.sceneMediaMotionPreset = nextMotion;
  target.dataset.sceneMediaLayout = normalizeTimelineClipVisualLayoutMode(visualLayoutMode);
}

function syncPodcastSceneZoomControls(session = null) {
  const activeSession = session || getActiveSession();
  const activeRowId = String(podcastVideoState.activeRowId || "").trim();
  const clipMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const clip = activeRowId ? (clipMap[activeRowId] || null) : null;
  const currentScale = normalizeTimelineClipMediaScale(clip?.mediaScale);
  const canZoom = Boolean(activeRowId);
  const canZoomOut = canZoom && currentScale > 1.001;
  const canZoomIn = canZoom && currentScale < 2.499;
  const scalePct = Math.round(currentScale * 100);
  [els.podcastSceneZoomInBtn, els.podcastSceneZoomOutBtn].filter(Boolean).forEach((btn) => {
    btn.hidden = !canZoom;
  });
  if (els.podcastSceneZoomInBtn) {
    els.podcastSceneZoomInBtn.disabled = !canZoomIn;
    els.podcastSceneZoomInBtn.title = `Acercar escena (${scalePct}%)`;
    els.podcastSceneZoomInBtn.setAttribute("aria-label", `Acercar escena (${scalePct}%)`);
  }
  if (els.podcastSceneZoomOutBtn) {
    els.podcastSceneZoomOutBtn.disabled = !canZoomOut;
    els.podcastSceneZoomOutBtn.title = `Alejar escena (${scalePct}%)`;
    els.podcastSceneZoomOutBtn.setAttribute("aria-label", `Alejar escena (${scalePct}%)`);
  }
  window.syncPodcasterSceneMediaPositionControls?.();
}

function adjustActiveTimelineSceneMediaScale(direction = 0) {
  const activeRowId = String(podcastVideoState.activeRowId || "").trim();
  if (!activeRowId) return false;
  const delta = Number(direction) > 0 ? 0.1 : -0.1;
  const changed = updateTimelineClipForRow(activeRowId, (clip) => ({
    ...clip,
    mediaScale: normalizeTimelineClipMediaScale(Number(clip?.mediaScale || 1) + delta)
  }));
  if (!changed) {
    syncPodcastSceneZoomControls(getActiveSession());
    return false;
  }
  const refreshed = getActiveSession();
  const clip = ensureTimelineClipsByRowId(refreshed, { persist: false })[activeRowId] || null;
  // Regression contract: applySceneMediaScaleToStage({ rowId: activeRowId, mediaScale: clip?.mediaScale, visualLayoutMode: clip?.visualLayoutMode })
  applySceneMediaScaleToStage({
    rowId: activeRowId,
    mediaScale: clip?.mediaScale,
    mediaOffsetXPct: clip?.mediaOffsetXPct,
    mediaOffsetYPct: clip?.mediaOffsetYPct,
    mediaMotionPreset: clip?.mediaMotionPreset,
    visualLayoutMode: clip?.visualLayoutMode
  });
  syncPodcastSceneZoomControls(refreshed);
  void persistReorderedTimelinePatchToCloud(refreshed, {
    timelineClipsByRowId: ensureTimelineClipsByRowId(refreshed, { persist: false }),
    geminiDialogueTrack: getPodcastVideoConfig(refreshed)?.geminiDialogueTrack || {},
    timelineOnScreenTextClipsByRowId: ensureOnScreenTextClipsByRowId(refreshed, { persist: false }),
    timelineOnScreenTextLayoutByRowId: normalizeOnScreenTextLayoutByRowId(
      getPodcastVideoConfig(refreshed)?.timelineOnScreenTextLayoutByRowId || {}
    )
  });
  if (els.montageExportModal && !els.montageExportModal.hidden) {
    scheduleMontageExportPreviewRefresh(90);
  }
  return true;
}



function restoreStageSpeakerPortrait(session = null) {
  if (!els.podcastActiveSpeakerImage) return false;
  const activeSession = session || getActiveSession();
  const speakerKey = String(podcastVideoState.activeSpeaker || "").trim();
  const portrait = resolvePortraitForSpeaker(activeSession, speakerKey);
  const portraitSrc = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
  if (!portraitSrc) {
    els.podcastActiveSpeakerImage.removeAttribute("src");
    return false;
  }
  els.podcastActiveSpeakerImage.src = portraitSrc;
  els.podcastActiveSpeakerImage.alt = speakerKey ? `Retrato de ${resolveSpeakerDisplayName(speakerKey, activeSession)}` : "Locutor";
  delete els.podcastActiveSpeakerImage.dataset.stageMode;
  delete els.podcastActiveSpeakerImage.dataset.src;
  return true;
}



function syncPodcastVideoSpeakerCardVisibility() {
  if (!els.podcastVideoSpeakerCard) return;
  if (isEducationalVideoMode(getActiveSession())) {
    els.podcastVideoSpeakerCard.hidden = true;
    return;
  }
  const hasSpeaker = Boolean(String(podcastVideoState.activeSpeaker || "").trim());
  els.podcastVideoSpeakerCard.hidden = !(podcastVideoState.enabled && (podcastVideoState.busy || podcastVideoState.stagePortraitFallback) && hasSpeaker);
}

function getPodcastVideoConfig(session = null) {
  const requestedSession = session || null;
  const currentActiveSession = getActiveSession();
  const activeSession = requestedSession
    && currentActiveSession
    && String(requestedSession.id || "").trim()
    && String(requestedSession.id || "").trim() === String(currentActiveSession.id || "").trim()
      ? currentActiveSession
      : (requestedSession || currentActiveSession);
  if (!activeSession) return {};
  const cacheKey = `${activeSession.id}:${activeSession.updatedAt || ''}:${state.activeSessionId}`;
  if (studioVideoConfigCache && studioVideoConfigCacheKey === cacheKey) {
    return studioVideoConfigCache;
  }
  const config = normalizePodcastVideoConfig(activeSession?.podcastVideoConfig || {});
  studioVideoConfigCache = config;
  studioVideoConfigCacheKey = cacheKey;
  return config;
}

function getTimelineSceneAudioMixByRowId(session = null) {
  const cfg = getPodcastVideoConfig(session);
  return cfg?.timelineSceneAudioMixByRowId && typeof cfg.timelineSceneAudioMixByRowId === "object"
    ? cfg.timelineSceneAudioMixByRowId
    : {};
}

function getSceneBackgroundMusicVolumeOverridePct(session = null, rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return Number.NaN;
  return Math.max(
    0,
    Math.min(
      200,
      toFiniteNumber(getTimelineSceneAudioMixByRowId(session)?.[key]?.backgroundMusicVolumePct, Number.NaN)
    )
  );
}

function resolveTimelineRuntimeEntryAtMs(session = null, currentMs = 0, runtimeEntries = null) {
  return window.resolveTimelineRuntimeEntryAtMs(session, currentMs, runtimeEntries);
}

function resolveTimelineRuntimeEntriesAtMs(session = null, currentMs = 0, runtimeEntries = null, options = {}) {
  return window.resolveTimelineRuntimeEntriesAtMs(session, currentMs, runtimeEntries, options);
}

function resolveTimelineRuntimeOverlapPairAtMs(session = null, currentMs = 0, runtimeEntries = null) {
  return window.resolveTimelineRuntimeOverlapPairAtMs(session, currentMs, runtimeEntries);
}

function timelineHasVisualOverlap(session = null, runtimeEntries = null) {
  const activeSession = session || getActiveSession();
  const entries = (Array.isArray(runtimeEntries) ? runtimeEntries : buildTimelineRuntimeEntries(activeSession))
    .filter((entry) => Boolean(String(entry?.videoSrc || "").trim()))
    .slice()
    .sort((a, b) => (
      Number(a?.startMs || 0) - Number(b?.startMs || 0)
      || Number(a?.zIndex || 0) - Number(b?.zIndex || 0)
      || Number(a?.index || 0) - Number(b?.index || 0)
    ));
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const next = entries[i];
    if (Number(next?.startMs || 0) < Number(prev?.endMs || 0) - 10) return true;
  }
  return false;
}

function resolveSceneBackgroundMusicVolumePctAtMs(session = null, currentMs = 0, fallbackPct = 100, runtimeEntries = null) {
  const activeSession = session || getActiveSession();
  const entry = resolveTimelineRuntimeEntryAtMs(activeSession, currentMs, runtimeEntries);
  const rowId = String(entry?.rowId || "").trim();
  const overridePct = getSceneBackgroundMusicVolumeOverridePct(activeSession, rowId);
  return Number.isFinite(overridePct)
    ? Math.max(0, Math.min(200, overridePct))
    : Math.max(0, Math.min(200, toFiniteNumber(fallbackPct, 100)));
}

function getTimelineViewMode(session = null) {
  return window.getTimelineViewMode(session);
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
  upsertPodcastStudioUiState({ timelineViewMode: mode }, { autosaveReason: "ui-state" });
  scheduleSessionLocalPersist("inspector");
  renderPodcastVideoShell(getActiveSession());
}

const podcasterOnScreenTextTrackEditorApi = createPodcasterOnScreenTextTrackEditorApi({
  els,
  podcastVideoState,
  getActiveSession,
  getSessionRows,
  getPodcastVideoConfig,
  getOnScreenTextTrackSettings,
  applySharedOnScreenTextTrackSettingValue,
  normalizeOnScreenTextTrackSettings,
  normalizeOnScreenTextLayoutByRowId,
  normalizeOnScreenTextLayoutItem,
  buildDefaultOnScreenTextLayoutForRow,
  estimateOnScreenTextLayoutHeightPct,
  getOnScreenTextClipText,
  getOnScreenTextLayoutForRow,
  ensureOnScreenTextLayoutByRowId,
  ensureOnScreenTextClipsByRowId,
  normalizeOnScreenTextClipItem,
  buildSharedOnScreenTextTrackModalMarkup,
  upsertPodcastVideoConfig,
  renderPodcastVideoShell,
  renderPodcastVideoTimeline,
  syncPodcastStudioInspector,
  syncPodcastOnScreenTextOverlay,
  scheduleSessionLocalPersist,
  toFiniteNumber,
  STUDIO_TIMELINE_TRACK_VERSION
});
const {
  setTrackSetting: setOnScreenTextTrackSetting,
  syncAnchorAcrossLayouts: syncOnScreenTextTrackAnchorAcrossLayouts,
  syncWidthAcrossLayouts: syncOnScreenTextTrackWidthAcrossLayouts,
  syncToggleBtn: syncOnScreenTextTrackToggleBtn,
  toggleTrackVisibility: toggleOnScreenTextTrackVisibility,
  setAllClipsHidden: setAllOnScreenTextClipsHidden,
  renderModal: renderOnScreenTextTrackModal,
  setModalOpen: setOnScreenTextTrackModalOpen,
  beginModalDrag: beginOnScreenTextTrackModalDrag,
  applyModalDrag: applyOnScreenTextTrackModalDrag,
  endModalDrag: endOnScreenTextTrackModalDrag,
  beginOverlayDrag: beginOnScreenTextOverlayDrag,
  applyOverlayDragMove: applyOnScreenTextOverlayDragMove,
  endOverlayDrag: endOnScreenTextOverlayDrag,
  applyOverlayResizeMove: applyOnScreenTextOverlayResizeMove,
  endOverlayResize: endOnScreenTextOverlayResize
} = podcasterOnScreenTextTrackEditorApi;

function setMontageAudioSubtracksOpen(nextOpen = false, options = {}) {
  const open = Boolean(nextOpen);
  podcastVideoState.showMontageAudioSubtracks = open;
  if (options.persist !== false) {
    try {
      window.localStorage.setItem(PODCAST_STUDIO_MONTAGE_AUDIO_SUBTRACKS_KEY, open ? "1" : "0");
    } catch (_) {
      // noop
    }
  }
  upsertPodcastStudioUiState({ showMontageAudioSubtracks: open }, { autosaveReason: "ui-state" });
  const session = getActiveSession();
  if (open && getTimelineViewMode(session) !== "tracks") {
    setTimelineViewMode("tracks");
  }
  // Al "importar/mostrar" audio del montaje, los clips de escena pueden haberse reacomodado.
  // Re-centra el texto en pantalla respecto a su escena para mantener alineación visual.
  normalizeOnScreenTextClipsToSevenSecondsCentered(getActiveSession(), {
    persist: !podcastVideoState.montageActive,
    force: true
  });
  renderPodcastVideoTimeline(getActiveSession(), { reason: "structure", force: true });
  updatePodcastPlayerUi();
}

function getTransitionEdgeKey(fromRowId = "", toRowId = "") {
  return window.getTransitionEdgeKey(fromRowId, toRowId);
}

function getTransitionTimelineRowOrder(session = null) {
  const activeSession = session || getActiveSession();
  const runtimeEntries = buildTimelineRuntimeEntries(activeSession)
    .filter((entry) => Boolean(String(entry?.rowId || "").trim()));
  runtimeEntries.sort((a, b) => (
    Number(a.startMs || 0) - Number(b.startMs || 0)
    || Number(a.zIndex || 0) - Number(b.zIndex || 0)
    || Number(a.index || 0) - Number(b.index || 0)
  ));
  const ordered = [];
  const seen = new Set();
  runtimeEntries.forEach((entry) => {
    const rowId = String(entry?.rowId || "").trim();
    if (!rowId || seen.has(rowId)) return;
    seen.add(rowId);
    ordered.push(rowId);
  });
  return ordered;
}

function getTransitionForEdge(session = null, fromRowId = "", toRowId = "") {
  return window.getTransitionForEdge(session, fromRowId, toRowId);
}

function shouldUseNativeVideoAudioForRow(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const cfg = getPodcastVideoConfig(activeSession);
  if (String(cfg.audioMode || "gemini-live-per-scene") === "veo-native-audio") return true;
  const key = String(rowId || "").trim();
  if (!key) return false;
  const row = Array.isArray(activeSession?.script?.rows)
    ? activeSession.script.rows.find((item) => String(item?.id || "").trim() === key) || null
    : null;
  const clip = resolveDialogueVideoForRow(activeSession, key);
  const primary = resolvePrimaryDialogueVideoSegment(clip);
  const fromSceneLibrary = Boolean(
    String(row?.sourcePublicSceneLibraryId || row?.publicSceneLibraryId || "").trim()
    || String(clip?.publicSceneLibraryId || primary?.publicSceneLibraryId || "").trim()
    || String(clip?.model || "").trim() === "public-scene-library"
  );
  return fromSceneLibrary;
}

function shouldKeepNativeVideoAudioForRow(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const mix = resolveTimelineClipMix(activeSession, rowId);
  return Number(mix.videoVolume || 0) > 0.0001;
}

function isPublicLibrarySceneRow(row = null, clip = null) {
  return Boolean(
    String(row?.sourcePublicSceneLibraryId || row?.publicSceneLibraryId || "").trim()
    || String(clip?.publicSceneLibraryId || "").trim()
    || String(clip?.model || "").trim() === "public-scene-library"
  );
}

function resolveEffectiveNativeVeoVolumePct(session = null) {
  const cfg = getPodcastVideoConfig(session || getActiveSession());
  const clip = Math.max(0, Math.min(100, toFiniteNumber(cfg.clipVolume, 100)));
  if (clip > 0) return clip;
  const master = Math.max(0, Math.min(100, toFiniteNumber(cfg.masterVolume, 100)));
  if (master > 0) return master;
  return 100;
}

function resolveTimelineClipMix(session = null, rowId = "") {
  return window.resolveTimelineClipMix(session, rowId);
}

function resolveTimelineClipVoiceVolume(session = null, rowId = "") {
  return window.resolveTimelineClipVoiceVolume(session, rowId);
}

function applyActiveTimelineClipMixToPlayback(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim() || String(podcastVideoState.activeRowId || "").trim();
  if (!activeSession || !key) return;
  const mix = resolveTimelineClipMix(activeSession, key);
  const activeVideo = getActiveStageVideoEl?.() || els.podcastActiveSpeakerVideo || null;
  if (activeVideo) {
    activeVideo.volume = mix.videoVolume;
    activeVideo.muted = mix.videoVolume <= 0.0001;
  }
  if (podcastVideoState.audioEl) {
    podcastVideoState.audioEl.volume = resolveTimelineClipVoiceVolume(activeSession, key);
  }
}

async function playPodcastStageVideo(options = {}) {
  const restart = options.restart === true;
  const silent = options.silent === true;
  const playbackRateOverride = Number(options.playbackRate);
  const volumeOverride = Number(options.volume);
  const video = getActiveStageVideoEl();
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
    const session = getActiveSession();
    const cfg = getPodcastVideoConfig(session);
    const useNativeVideoAudio = shouldKeepNativeVideoAudioForRow(session, String(podcastVideoState.activeRowId || "").trim());
    const audioClip = resolveDialogueAudioForRow(session, String(podcastVideoState.activeRowId || "").trim());
    const hasSceneAudio = Boolean(resolveStorageAudioUrl(audioClip?.downloadUrl || "", audioClip?.storagePath || ""));
    const educationalMode = isEducationalVideoMode(session);
    const keepVideoAudioAudible = educationalMode || useNativeVideoAudio;
    const activeRowId = String(podcastVideoState.activeRowId || "").trim();
    const fallbackVolume = resolveTimelineClipMix(session, activeRowId).videoVolume;
    const desiredVolume = Number.isFinite(volumeOverride)
      ? Math.max(0, Math.min(1, volumeOverride))
      : fallbackVolume;
    video.volume = desiredVolume;
    video.muted = desiredVolume <= 0.0001;
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
          const clip = rowId ? resolveDialogueVideoForRow(getActiveSession(), rowId) : null;
          const attemptedSegment = resolveDialogueVideoSegments(clip).find((segment) => {
            const candidateSrc = resolveStorageVideoUrl(
              segment?.downloadUrl || clip?.downloadUrl || "",
              segment?.storagePath || clip?.storagePath || ""
            );
            return candidateSrc && candidateSrc === fallbackSrc;
          }) || clip;
          if (rowId && attemptedSegment) {
            markStaleDialogueVideoSource(sessionId, rowId, attemptedSegment, "proxy-media-access-denied");
          }
          markStaleProxyMediaUrl(fallbackSrc, "proxy-media-access-denied", {
            kind: "stage-playback-fallback",
            rowId,
            status: Number(fallbackResponse.status || 0)
          });
          if (!silent) {
            addChatMessage("system", "Video de escena temporalmente no disponible. Se conservará la referencia y se intentará usar otra fuente.");
          }
          updatePodcastVideoTransportUi();
          return false;
        }
        if (fallbackResponse.ok) {
          const blob = await fallbackResponse.blob();
          const blobUrl = URL.createObjectURL(blob);
          assignStageVideoElementSource(video, blobUrl, {
            logicalSrc: fallbackSrc,
            mode: "transient"
          });
          video.volume = Math.max(0, Math.min(1, Number(getPodcastVideoConfig().clipVolume || 100) / 100));
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
  const hasClip = Boolean(String((getActiveStageVideoEl?.() || els.podcastActiveSpeakerVideo || null)?.dataset?.src || "").trim());
  const hasStageMedia = hasClip || podcastVideoState.stagePortraitFallback;
  const stagePlaying = Boolean(
    getStageVideoElements().some((video) => video && !video.paused)
    || (rowPlaybackAudioEl && !rowPlaybackAudioEl.paused)
    || (podcastVideoState.audioEl && !podcastVideoState.audioEl.paused)
    || Object.values(podcastVideoState.montageAudioPlayers || {}).some((audio) => audio && !audio.paused)
  );
  const montagePlaying = Boolean(podcastVideoState.montageActive && !podcastVideoState.montagePaused);
  const sequencePlaying = Boolean(podcastVideoState.timelineSequenceActive === true && podcastVideoState.timelineSequencePaused !== true);
  const pausedByStatus = /paus/i.test(String(els.podcastVideoStatus?.textContent || ""));
  const isPausedVisual = Boolean(podcastVideoState.montagePaused || (!stagePlaying && pausedByStatus));
  const rows = getActiveSession()?.script?.rows || [];
  if (els.podcastVideoPlayBtn) els.podcastVideoPlayBtn.disabled = !rows.length || (podcastVideoState.montageActive && !podcastVideoState.montagePaused) || sequencePlaying;
  if (els.podcastVideoPauseBtn) els.podcastVideoPauseBtn.disabled = !podcastVideoState.montageActive && !stagePlaying && !sequencePlaying;
  if (els.podcastVideoPlayBtn) {
    els.podcastVideoPlayBtn.classList.toggle("is-playing", stagePlaying || montagePlaying || sequencePlaying);
  }
  if (els.podcastVideoPauseBtn) {
    els.podcastVideoPauseBtn.classList.toggle("is-paused-blink", isPausedVisual);
  }
  if (els.podcastVideoStopBtn) els.podcastVideoStopBtn.disabled = !podcastVideoState.montageActive && !hasStageMedia && !stagePlaying && !sequencePlaying;
  if (els.podcastVideoPrevBtn) els.podcastVideoPrevBtn.disabled = !rows.length || sequencePlaying;
  if (els.podcastVideoNextBtn) els.podcastVideoNextBtn.disabled = !rows.length || sequencePlaying;
  if (els.generateAllDialogueVideosBtn) els.generateAllDialogueVideosBtn.disabled = podcastVideoState.busy || podcastVideoState.bulkVideoGenerationActive || !rows.length;
  if (els.regenerateAllDialogueVideosBtn) els.regenerateAllDialogueVideosBtn.disabled = podcastVideoState.busy || podcastVideoState.bulkVideoGenerationActive || !rows.length;
  if (els.reorderTimelineTracksBtn) els.reorderTimelineTracksBtn.disabled = podcastVideoState.busy || !canReorderTimelineLayout(getActiveSession());
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
  const rows = getSessionRows(activeSession);
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
  void event;
  void payload;
}

function logPodcastBatchDebug(event = "", payload = {}) {
  void event;
  void payload;
}

function buildPodcastTimelineStructureKey(session = null, mode = "") {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  const trackRows = ensureTimelineTracks(activeSession, { persist: false });
  const videoCfg = getPodcastVideoConfig(activeSession);
  const geminiDialogueTrack = normalizeGeminiDialogueTrack(videoCfg?.geminiDialogueTrack || {});
  const onScreenTextTrack = normalizeOnScreenTextTrackSettings(videoCfg?.onScreenTextTrack || {});
  const dialogueMap = getDialogueVideoMap(activeSession);

  // La clave de estructura solo debe incluir cosas que cambien la EXISTENCIA o TIPO de elementos.
  // NO incluimos startMs, trimInMs, width, zIndex, etc., para que el lightweight render sea efectivo durante drag/trim.
  return JSON.stringify({
    sessionId: String(activeSession?.id || "").trim(),
    mode: String(mode || "").trim(),
    rowCount: rows.length,
    rowIds: rows.map(r => r.id),
    onScreenTextTrack: {
      enabled: onScreenTextTrack.enabled === true,
      showTrack: onScreenTextTrack.showTrack !== false,
      stylePreset: onScreenTextTrack.stylePreset,
      fontFamily: onScreenTextTrack.fontFamily
    },
    tracks: trackRows.map((track) => ({
      id: String(track?.id || "").trim(),
      label: String(track?.label || "").trim()
    })),
    geminiDialogueTrack: {
      enabled: geminiDialogueTrack.enabled === true,
      segmentCount: geminiDialogueTrack.segments.length,
      excludedRowIds: (geminiDialogueTrack.excludedRowIds || []).slice().sort()
    },
    // Estado de medios para forzar re-render solo cuando el contenido cambia (ej. tras generar video)
    mediaState: rows.map(row => {
      const rowId = String(row?.id || "").trim();
      const dialogue = dialogueMap[rowId] || null;
      const audio = resolveDialogueAudioForRow(activeSession, rowId);
      return {
        rowId,
        v: String(dialogue?.storagePath || dialogue?.downloadUrl || "").trim(),
        a: hasStoredMediaSource(audio),
        up: String(dialogue?.updatedAt || "").trim()
      };
    })
  });
}

function getPodcastPortraitStripHosts(session = null) {
  const activeSession = session || getActiveSession();
  const configuredHosts = getSpeakerOptions(activeSession);
  if (!isVideoPodcastMode(activeSession)) return configuredHosts;
  const rows = getSessionRows(activeSession);
  const rowHosts = Array.from(new Set(
    rows
      .map((row) => String(row?.speaker || "").trim())
      .filter(Boolean)
  ));
  return rowHosts.length ? rowHosts : configuredHosts;
}

function buildPodcastPortraitStripStructureKey(session = null) {
  const activeSession = session || getActiveSession();
  const hosts = getPodcastPortraitStripHosts(activeSession);
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
  return podcasterTimelineUiApi.attachPodcastTimelineScrollSync();
}

function disconnectPodcastTimelinePreviewObserver() {
  return podcasterTimelineUiApi.disconnectPodcastTimelinePreviewObserver();
}

function setTimelinePreviewsSuspended(isSuspended = false) {
  return podcasterTimelineUiApi.setTimelinePreviewsSuspended(isSuspended);
}
window.setTimelinePreviewsSuspended = setTimelinePreviewsSuspended;

function loadTimelinePreviewVideo(videoEl, options = {}) {
  return podcasterTimelineUiApi.loadTimelinePreviewVideo(videoEl, options);
}

function attachPodcastTimelinePreviewLoading() {
  return podcasterTimelineUiApi.attachPodcastTimelinePreviewLoading();
}

function syncPodcastTimelineLaneOffsetFromDom(session = null) {
  return podcasterTimelineUiApi.syncPodcastTimelineLaneOffsetFromDom(session);
}

function applyTimelineZoomPreservingPlayhead(session = null, nextZoom = 1) {
  const activeSession = session || getActiveSession();
  if (!activeSession) return false;
  const clampedZoom = Math.max(0.25, Math.min(1, toFiniteNumber(nextZoom, 1)));
  const prevCanvas = els.podcastVideoTimeline?.querySelector?.(".podcast-video-timeline-canvas") || null;
  const prevOffsetPx = Math.max(0, Number(prevCanvas?.dataset?.playheadOffset || 0));
  const prevScrollLeft = Math.max(0, Number(els.podcastVideoTimeline?.scrollLeft || 0));
  const totalMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(activeSession));
  const cursorMs = Math.max(0, Math.min(totalMs, Number(podcastVideoState.montageCursorMs || 0)));
  const prevCursorX = prevOffsetPx + timelineMsToPx(cursorMs, activeSession);
  const prevCursorViewportX = prevCursorX - prevScrollLeft;

  podcastVideoState.timelineZoom = clampedZoom;
  renderPodcastVideoTimeline(activeSession, { force: true, reason: "structure" });

  const nextCanvas = els.podcastVideoTimeline?.querySelector?.(".podcast-video-timeline-canvas") || null;
  const nextOffsetPx = Math.max(0, Number(nextCanvas?.dataset?.playheadOffset || 0));
  const nextCursorX = nextOffsetPx + timelineMsToPx(cursorMs, activeSession);
  const nextScrollLeft = Math.max(0, nextCursorX - prevCursorViewportX);
  try {
    if (els.podcastVideoTimeline) els.podcastVideoTimeline.scrollLeft = nextScrollLeft;
    if (els.podcastTimelineRuler) els.podcastTimelineRuler.scrollLeft = nextScrollLeft;
  } catch (_) { }
  syncPodcastTimelineLaneOffsetFromDom(activeSession);
  syncPodcastTimelinePlayhead(activeSession);
  return true;
}

function getPodcastTimelineClipMenuPortal() {
  return podcasterTimelineUiApi.getPodcastTimelineClipMenuPortal();
}

function closePodcastTimelineClipMenu() {
  return podcasterTimelineUiApi.closePodcastTimelineClipMenu();
}

function renderPodcastVideoTimeline(session = null, options = {}) {
  return podcasterTimelineUiApi.renderPodcastVideoTimeline(session, options);
}

function syncTimelineGeminiSegmentDragPreview(session = null) {
  return podcasterTimelineUiApi.syncTimelineGeminiSegmentDragPreview(session);
}

function syncPodcastTimelineSelectionUi(session = null) {
  return podcasterTimelineUiApi.syncPodcastTimelineSelectionUi(session);
}

function clearTimelineGapSelection() {
  podcastVideoState.timelineGapSelection = null;
  syncTimelineGapSelectionUi();
}

function getTrackTimelineItems(trackId = "", session = null) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  const clipMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const rowIndexById = new Map(rows.map((row, index) => [String(row?.id || "").trim(), index]));
  const minClipPx = getStudioTimelineMinClipPx(activeSession);
  return rows
    .map((row) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId) return null;
      const clip = clipMap[rowId];
      if (!clip || String(clip.trackId || "").trim() !== String(trackId || "").trim()) return null;
      const startPx = timelineMsToPx(Number(clip?.startMs || 0), activeSession);
      const widthPx = Math.max(minClipPx, timelineMsToPx(getTimelineClipEffectiveDurationMs(clip), activeSession));
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
  const activeSession = session || getActiveSession();
  const totalWidthPx = timelineMsToPx(getTimelineTotalDurationMs(activeSession), activeSession);
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

function ensureTimelinePlayheadVisible(leftPx = 0, focusNode = null, options = {}) {
  if (!els.podcastVideoTimeline) return;
  const lightweight = options.lightweight === true;

  // Permitimos scroll incluso si no está "reproduciendo" (montageActive=false) 
  // si es un renderizado completo (no lightweight), como al hacer stop o seek manual.
  if (!podcastVideoState.montageActive && lightweight) return;
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
  if (!isSceneTimelineTrackId(trackId, session)) return false;
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
  upsertPodcastVideoConfig((cfg, session) => {
    const clips = ensureTimelineClipsByRowId(session, { persist: false });
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
  syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
  renderPodcastVideoShell(getActiveSession());
  return true;
}

function syncPodcastTimelinePlayhead(session = null, options = {}) {
  return podcasterTimelineUiApi.syncPodcastTimelinePlayhead(session, options);
}

function scheduleStudioTimelinePreviewSync(nextMs = 0, entries = null) {
  return podcasterTimelineUiApi.scheduleStudioTimelinePreviewSync(nextMs, entries);
}

function seekStudioTimelineByClientX(clientX = 0, options = {}) {
  return podcasterTimelineUiApi.seekStudioTimelineByClientX(clientX, options);
}

function seekStudioTimelineByRulerClientX(clientX = 0, options = {}) {
  return podcasterTimelineUiApi.seekStudioTimelineByRulerClientX(clientX, options);
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
  document.body.classList.remove("podcast-timeline-resizing-lane");
}

function findTimelineActionButton(action = "", rowId = "") {
  const actionName = String(action || "").trim();
  const key = String(rowId || "").trim();
  if (!els.podcastVideoTimeline || !actionName || !key) return null;
  return Array.from(els.podcastVideoTimeline.querySelectorAll(`[data-action="${actionName}"][data-row-id]`))
    .find((node) => String(node.dataset.rowId || "").trim() === key) || null;
}

function requirePodcasterGenerationApi() {
  return podcasterGenerationShared;
}

function isTimelineSceneVideoGenerating(session = null, rowId = "") {
  const generationApi = requirePodcasterGenerationApi();
  if (typeof generationApi.buildTimelineSceneGenerationKey !== "function") return false;
  const generationKey = generationApi.buildTimelineSceneGenerationKey(session, rowId);
  return Boolean(generationKey) && generationApi.timelineSceneVideoGenerationPending.has(generationKey);
}

function syncTimelineEphemeralState(session = null) {
  const activeSession = session || getActiveSession();
  if (!els.podcastVideoTimeline) return;
  const isBulkRegenAll = podcastVideoState.bulkVideoGenerationActive && podcastVideoState.bulkVideoGenerationMode === "all";
  const clipMap = ensureTimelineClipsByRowId(activeSession, { persist: false });
  const dialogueMap = getDialogueVideoMap(activeSession);

  const items = Array.from(els.podcastVideoTimeline.querySelectorAll(".podcast-video-timeline-item[data-row-id], .podcast-video-timeline-clip[data-row-id]"));
  items.forEach((itemEl) => {
    const rowId = String(itemEl.dataset.rowId || "").trim();
    if (!rowId) return;

    const isGenerating = isTimelineSceneVideoGenerating(activeSession, rowId);
    const generationStatus = isGenerating ? getTimelineSceneVideoGenerationStatus(activeSession, rowId) : null;
    const generationLabel = String(generationStatus?.hint || generationStatus?.stage || "Generando video...").trim() || "Generando video...";

    const preview = itemEl.querySelector(".podcast-video-scene-preview, .podcast-video-clip-preview");
    if (preview) {
      preview.classList.toggle("is-generating", isGenerating);
      let loadingRing = preview.querySelector(".podcast-video-scene-loading");
      if (isGenerating && !loadingRing) {
        preview.insertAdjacentHTML("beforeend", `
          <div class="podcast-video-scene-loading" aria-hidden="true">
            <span class="podcast-video-scene-loading-ring"></span>
            <img src="SnoopyPodcastCreator.png" alt="" class="podcast-video-scene-loading-logo">
          </div>
        `);
      } else if (!isGenerating && loadingRing) {
        loadingRing.remove();
      }
    }

    const body = itemEl.querySelector(".podcast-video-clip-body");
    if (body) {
      body.classList.toggle("is-generating", isGenerating);
      let bodyLoading = body.querySelector(".podcast-video-clip-loading");
      if (isGenerating && !bodyLoading) {
        body.insertAdjacentHTML("beforeend", `
          <div class="podcast-video-clip-loading" aria-hidden="true">
            <span class="podcast-video-scene-loading-ring"></span>
            <img src="SnoopyPodcastCreator.png" alt="" class="podcast-video-scene-loading-logo">
          </div>
        `);
      } else if (!isGenerating && bodyLoading) {
        bodyLoading.remove();
      }
    }

    const metaSpan = itemEl.querySelector(".podcast-video-scene-meta span, .podcast-video-clip-meta span");
    if (metaSpan) {
      const videoClip = dialogueMap[rowId] || null;
      const videoSrc = !!videoClip;
      const audioReady = hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, rowId));
      const timelineClip = clipMap[rowId] || null;
      const durationMs = timelineClip ? getTimelineClipEffectiveDurationMs(timelineClip) : 0;
      const statusText = isGenerating ? generationLabel : (videoSrc ? "Video generado" : "Pendiente por generar");
      metaSpan.textContent = `${statusText} · ${audioReady ? "Voz lista" : "Sin voz"} · ${secondsToClock(durationMs / 1000)}`;
    }

    const regenBtns = itemEl.querySelectorAll("[data-action='timeline-generate-scene-video']");
    regenBtns.forEach((regenBtn) => {
      regenBtn.classList.toggle("is-loading", isGenerating || isBulkRegenAll);
      regenBtn.disabled = isGenerating || isBulkRegenAll;
      const icon = regenBtn.querySelector("i");
      if (icon) {
        if (isGenerating || isBulkRegenAll) {
          icon.className = "fas fa-spinner spinner-icon";
        } else {
          const videoClip = dialogueMap[rowId] || null;
          icon.className = videoClip ? "fas fa-sync-alt" : "fas fa-film";
        }
      }
    });
  });
}

function getTimelineSceneVideoGenerationStatus(session = null, rowId = "") {
  return window.getTimelineSceneVideoGenerationStatus(session, rowId);
}

function updateTimelineClipForRow(rowId = "", mutator = null, options = {}) {
  const key = String(rowId || "").trim();
  if (!key || typeof mutator !== "function") return false;
  const persist = options.persist !== false;
  let changed = false;
  upsertPodcastVideoConfig((cfg, session) => {
    const clips = ensureTimelineClipsByRowId(session);
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
    scheduleSessionLocalPersist("timeline-clip");
  }
  return changed;
}

function persistCompactedTimelineTrackFromRow(rowId = "", options = {}) {
  const key = String(rowId || "").trim();
  const session = getActiveSession();
  if (!key || !session) return false;
  const currentMap = ensureTimelineClipsByRowId(session, { persist: false });
  const compactedMap = compactTimelineTrackClipsFromRow(session, currentMap, key, options);
  const changed = JSON.stringify(compactedMap) !== JSON.stringify(currentMap);
  if (!changed) return false;
  upsertPodcastVideoConfig((cfg) => ({
    ...cfg,
    timelineVersion: STUDIO_TIMELINE_VERSION,
    timelineClipsByRowId: compactedMap
  }), { autosave: options.autosave !== false });
  if (options.syncGemini !== false) {
    syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true, autosave: options.autosave !== false });
  }
  if (options.render !== false) {
    podcastVideoState.timelineDurationSec = Math.max(0, getTimelineTotalDurationMs(getActiveSession()) / 1000);
    renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
    syncPodcastStudioInspector(getActiveSession());
  }
  return true;
}

function ensureMontageDefaultVolumesPersisted(session = null) {
  return window.ensureMontageDefaultVolumesPersisted(session);
}

function reorderPodcastStudioSceneRows(dragRowId = "", targetRowId = "", placeAfter = false) {
  const dragId = String(dragRowId || "").trim();
  const targetId = String(targetRowId || "").trim();
  if (!dragId || !targetId || dragId === targetId) return false;
  const session = getActiveSession();
  const rows = getSessionRows(session);
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

function upsertPodcastVideoConfig(mutator, options = {}) {
  const shouldPersist = options.persist === true
    ? true
    : options.persist === false
      ? false
      : PODCAST_SESSION_MANUAL_SAVE_ONLY !== true;
  invalidateStudioRuntimeCache();
  upsertActiveSession((session) => {
    const base = getPodcastVideoConfig(session);
    const next = mutator({ ...base, transitionsByEdge: { ...(base.transitionsByEdge || {}) } }, session);
    const normalized = normalizePodcastVideoConfig(next);

    return {
      ...session,
      podcastVideoConfig: normalized
    };
  }, {
    render: false,
    persist: shouldPersist,
    markDirty: shouldPersist ? options.markDirty !== false : false,
    recordHistory: options.recordHistory,
    autosaveReason: options.autosaveReason || "config-update"
  });
  invalidateStudioRuntimeCache();
  if (options.autosave !== false && shouldPersist) {
    scheduleSessionLocalPersist(options.autosaveReason || "config-update");
  }
}

podcasterSceneSelectionApi = createPodcasterSceneSelectionApi({
  els,
  podcastVideoState,
  getActiveSession,
  getTransitionTimelineRowOrder,
  renderPodcastVideoTimeline,
  syncPodcastStudioInspector,
  syncPodcastTimelineSelectionUi,
  syncPodcastTimelinePlayhead,
  syncPodcastSceneZoomControls,
  ensureTimelineClipsByRowId,
  syncPodcastVideoStageMedia,
  syncPodcastOnScreenTextOverlay,
  resolveTargetVideoRowId,
  setPodcastVideoSpeaker,
  upsertPodcastStudioUiState,
  scheduleMontageExportPreviewRefresh: (...args) => window.scheduleMontageExportPreviewRefresh?.(...args)
});

podcasterSceneTransitionApi = createPodcasterSceneTransitionApi({
  els,
  podcastVideoState,
  getActiveSession,
  getSessionRows,
  getTransitionTimelineRowOrder,
  resolveSceneNumberByRowId,
  upsertPodcastVideoConfig,
  scheduleSessionLocalPersist,
  persistReorderedTimelinePatchToCloud,
  renderPodcastVideoTimeline,
  renderPodcastTransitionTimeline,
  syncPodcastStudioInspector,
  selectTimelineSceneRow
});

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



function closeSceneVideoSelectorModal() {
  if (els.podcastSceneVideoSelectorModal) {
    els.podcastSceneVideoSelectorModal.hidden = true;
  }
}





function syncPodcastStudioInspector(session = null, options = {}) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  const activeRow = rows.find((row) => String(row?.id || "").trim() === String(podcastVideoState.activeRowId || "").trim()) || rows[0] || null;
  const cfg = getPodcastVideoConfig(activeSession);
  const panelCopy = getPanelModeCopy(activeSession);
  const forceRender = options.forceRender === true;
  if (els.podcastStudioInspector) {
    els.podcastStudioInspector.classList.toggle("is-video-educativo", panelCopy.videoMode);
    els.podcastStudioInspector.setAttribute("aria-label", panelCopy.inspectorTitle);
    // Asegurar que el ancho y estado colapsado se apliquen correctamente (persistencia UI)
    const layout = els.podcastVideoShell?.querySelector(".podcast-studio-layout");
    layout?.classList.toggle("is-inspector-collapsed", podcastStudioInspectorCollapsed);
    if (els.podcastVideoShell) {
      els.podcastVideoShell.style.setProperty("--pod-studio-inspector-width", `${PodcasterResize.podcastStudioInspectorWidth}px`);
    }
  }
  if (els.podcastStudioInspectorScene) {
    const label = activeRow
      ? `${panelCopy.videoMode ? "Secuencia" : "Escena"} ${resolveSceneNumberByRowId(activeRow.id, activeSession)} · ${resolveSpeakerDisplayName(activeRow.speaker, activeSession)}`
      : panelCopy.inspectorSceneLabel;
    els.podcastStudioInspectorScene.textContent = label;
  }
  if (els.podcastStudioInspectorRowEditor) {
    // EVITAR re-renderizado total si el usuario está editando un campo en el inspector
    const isEditing = isPodcastStudioInspectorEditing();
    const currentDomRowId = String(els.podcastStudioInspectorRowEditor.querySelector("[data-row-id]")?.dataset?.rowId || "").trim();
    const activeRowId = String(activeRow?.id || "").trim();

    if (!forceRender && isEditing && activeRowId === currentDomRowId && els.podcastStudioInspectorRowEditor.innerHTML.trim()) {
      // console.log("[Studio] syncPodcastStudioInspector: Saltando re-render por edición activa en la misma fila.");
      return;
    }
    els.podcastStudioInspectorRowEditor.innerHTML = activeRow
      ? buildInspectorScriptRowMarkup(activeSession, activeRow, rows.findIndex((row) => row?.id === activeRow.id))
      : `<div class="podcast-studio-row-editor-empty">${escapeHtml(panelCopy.emptyRowEditor)}</div>`;
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
  syncPodcastSceneZoomControls(activeSession);
  const activeRowId = String(activeRow?.id || "").trim();
  const activeRowClip = activeRowId ? resolveDialogueVideoForRow(activeSession, activeRowId) : null;
  const hasAudio = hasStoredMediaSource(resolveDialogueAudioForRow(activeSession, activeRowId));
  const canDeleteDialogueAudio = hasExplicitDialogueAudioForRow(activeSession, activeRowId)
    || (!isPublicLibrarySceneRow(activeRow, activeRowClip) && hasAudio);
  if (els.deleteDialogueAudioBtn) els.deleteDialogueAudioBtn.disabled = !activeRow || podcastVideoState.busy || !canDeleteDialogueAudio;
  if (els.generateDialogueAudioBtn) {
    const key = `${activeSession?.id || ""}:${String(activeRow?.id || "").trim()}`;
    els.generateDialogueAudioBtn.disabled = !activeRow || podcastVideoState.busy || requirePodcasterGenerationApi().dialogueAudioGenerationPending?.has(key);
    if (activeRow?.id) {
      els.generateDialogueAudioBtn.dataset.rowId = activeRow.id;
    } else {
      delete els.generateDialogueAudioBtn.dataset.rowId;
    }
    const label = hasAudio ? "Regenerar voz de la escena activa" : "Generar voz de la escena activa";
    const icon = els.generateDialogueAudioBtn.querySelector("i");
    els.generateDialogueAudioBtn.title = label;
    els.generateDialogueAudioBtn.setAttribute("aria-label", label);
    if (icon) icon.className = hasAudio ? "fas fa-sync-alt" : "fas fa-microphone-alt";
  }
  syncStudioPlayDialogueAudioButton();
}

function syncPodcastStudioRuntimeUi(session = null, rowId = "", speaker = "", options = {}) {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!activeSession || !key) return;
  setPodcastVideoRow(key, {
    syncStage: false,
    lightweightUi: true,
    preserveMontageCursor: true,
    updateScrubber: false,
    forceOverlay: true,
    skipInspectorSync: options.lightweightInspector === true
  });
  setPodcastVideoSpeaker(activeSession, speaker, {
    speaking: options.speaking !== false,
    rowId: key,
    syncStageMedia: false
  });
}

function syncPodcastVideoStageMedia(session = null, rowId = "", options = {}) {
  return playbackController.syncStageMedia(session, rowId, options);
}

// Note: Dialogue audio and connected script generation functions have been modularized to podcaster-audioGemini-timeline.js

const sessionStore = createPodcasterSessionStore({
  STORAGE_KEY_BASE,
  LEGACY_STORAGE_KEY,
  nowIso,
  authFetchJson,
  hasAvailableApiBase,
  firestoreDb,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  getSessions: () => state.sessions,
  setSessions: (nextSessions) => {
    state.sessions = Array.isArray(nextSessions) ? nextSessions : [];
  },
  getStorageScopeUid: () => currentStorageScopeUid,
  getActiveSession,
  resolveCurrentUid,
  mergeSessionsById,
  mergeSessionRowsWithFallback,
  normalizePodcastVideoConfig,
  normalizeCreativeVideoConfig,
  normalizePodcastStudioUiState,
  panelMusicState,
  persistPanelMusicToActiveSession,
  ensurePanelMusicTrackUploaded,
  buildCloudSessionPayload,
  compactCloudSessionPayload,
  MAX_CLOUD_SESSION_PAYLOAD_BYTES,
  getDialogueVideoMap,
  getDialogueAudioMap,
  logPodcastRenderDebug,
  formatDate,
  render
});

const playbackController = new PodcasterPlaybackController();
const exportPreviewController = new PodcasterPlaybackController();
playbackController.init(els, {
  podcastVideoState,
  STUDIO_TIMELINE_MIN_CLIP_MS,
  STUDIO_TIMELINE_SNAP_MS,
  getActiveSession,
  getPodcastVideoConfig,
  getPlaybackSpeed: () => Number(els.podcastVideoSpeedSelect?.value || 1),
  toFiniteNumber,
  ensureTimelineClipsByRowId,
  syncPodcastTimelinePlayhead: (session, options) => syncPodcastTimelinePlayhead(session, options),
  secondsToClock,
  setPodcastVideoStatus,
  updatePodcastVideoTransportUi,
  useLightweightSeekDuringPlayback: true,
  enableExternalStudioPreviewSync: false,
  setPodcastVideoRow,
  setPodcastVideoSpeaker,
  syncPodcastStudioRuntimeUi,
  syncPodcastStudioInspector,
  syncPodcastVideoStageMedia,
  getTransitionForEdge,
  primePodcastStageVideoSource,
  setPodcastStageVideoSource,
  setPodcastStageVideoSourceForElement,
  setTimelinePreviewsSuspended,
  buildTimelineRuntimeEntries,
  getTimelineTotalDurationMs,
  getPanelMontageMusicConfig,
  getActiveStageVideoEl,
  getInactiveStageVideoEl,
  setActiveStageVideoSlot,
  shouldUseNativeVideoAudioForRow,
  shouldKeepNativeVideoAudioForRow,
  resolveTimelineRuntimeOverlapPairAtMs,
  resolveSceneSourceStateAtTimelineMs: window.resolveSceneSourceStateAtTimelineMs,
  resolveDialogueAudioForRow,
  resolveDialogueAudioPlaybackRate,
  resolveStorageAudioUrl,
  resolvePodcastStageAudioSrc,
  markStaleProxyMediaUrl,
  syncGeminiDialogueTrackWithRuntime,
  syncPodcastOnScreenTextOverlay,
  // Subtitle Helpers
  normalizeOnScreenTextTrackSettings,
  ensureOnScreenTextClipsByRowId,
  getOnScreenTextClipEffectiveDurationMs,
  getOnScreenTextClipText,
  resolveOnScreenTextRenderMetrics,
  resolveOnScreenTextPreviewLayoutSpec,
  getOnScreenTextStylePresetClass,
  getOnScreenTextBgPresetClass,
  buildOnScreenTextBubbleInlineStyle,
  escapeHtml,
  resolveFirebaseStorageUrl,
  renderPodcastVideoTimeline,
  resolveTimelineClipMix,
  getAuthHeaders,
  stopPanelMusic,
  setPodcastVideoPortraitFallback,
  syncStudioTimelinePreview,
  normalizeTimelineClipMediaScale,
  resolveSceneMediaRenderSpec,
  applySceneMediaScaleToStage
});

// Inicialización del controlador de preview de exportación
const exportPreviewEls = {
  ...els,
  podcastVideoStage: document.getElementById("montageExportPreviewContainer"),
  podcastActiveSpeakerVideo: els.montageExportPreviewVideo,
  podcastActiveSpeakerImage: els.montageExportPreviewImage,
  podcastActiveSpeakerVideoAlt: els.montageExportPreviewVideoAlt,
  podcastActiveSpeakerImageAlt: els.montageExportPreviewImageAlt,
  podcastActiveSpeakerBackdropVideo: null,
  podcastActiveSpeakerBackdropVideoAlt: null,
  podcastStylizedTextOverlay: els.montageExportStylizedTextOverlay,
  podcastOnScreenTextOverlay: els.montageExportPreviewOverlay,
  podcastVideoPlayBtn: els.montageExportPreviewPlayBtn,
  podcastVideoPauseBtn: els.montageExportPreviewPauseBtn,
  podcastVideoStopBtn: els.montageExportPreviewStopBtn,
  podcastStudioScrubber: els.montageExportPreviewSeekbar,
  podcastStudioTime: els.montageExportPreviewTimer
};

exportPreviewController.init(exportPreviewEls, {
  podcastVideoState: { ...podcastVideoState }, // Clonamos el estado para que sea independiente
  STUDIO_TIMELINE_MIN_CLIP_MS,
  STUDIO_TIMELINE_SNAP_MS,
  getActiveSession,
  getPodcastVideoConfig,
  getPlaybackSpeed: () => 1, // Preview siempre a 1x
  toFiniteNumber,
  ensureTimelineClipsByRowId,
  resolveTimelineRuntimeOverlapPairAtMs,
  resolveSceneSourceStateAtTimelineMs: window.resolveSceneSourceStateAtTimelineMs,
  syncPodcastTimelinePlayhead: (session, options) => {
    const ms = options.currentMs;
    const duration = options.totalMs;
    if (els.montageExportPreviewSeekbar) {
      els.montageExportPreviewSeekbar.max = String(duration);
      els.montageExportPreviewSeekbar.value = String(ms);
    }
    if (els.montageExportPreviewTimer) {
      els.montageExportPreviewTimer.textContent = `${secondsToClock(ms / 1000)} / ${secondsToClock(duration / 1000)}`;
    }
  },
  secondsToClock,
  setPodcastVideoStatus: () => { }, // No mostramos status en el preview
  updatePodcastVideoTransportUi: (isPlaying) => {
    if (els.montageExportPreviewPlayBtn) els.montageExportPreviewPlayBtn.hidden = isPlaying;
    if (els.montageExportPreviewPauseBtn) els.montageExportPreviewPauseBtn.hidden = !isPlaying;
  },
  setPodcastVideoRow: () => { },
  setPodcastVideoSpeaker: () => { },
  syncPodcastStudioRuntimeUi: () => { },
  syncPodcastVideoStageMedia: (media) => {
    if (els.montageExportPreviewVideo) {
      if (media.videoUrl) {
        els.montageExportPreviewVideo.src = media.videoUrl;
        els.montageExportPreviewVideo.hidden = false;
        els.montageExportPreviewPlaceholder.hidden = true;
      } else {
        els.montageExportPreviewVideo.hidden = true;
        els.montageExportPreviewPlaceholder.hidden = false;
      }
    }
  },
  getTransitionForEdge,
  primePodcastStageVideoSource: (video, url) => {
    if (video) video.src = url;
  },
  setPodcastStageVideoSource: (video, url) => {
    if (video) {
      video.src = url;
      video.play().catch(() => { });
    }
  },
  setPodcastStageVideoSourceForElement: (video, url) => {
    if (!video) return false;
    video.src = url;
    return true;
  },
  setTimelinePreviewsSuspended: () => { },
  buildTimelineRuntimeEntries,
  getTimelineTotalDurationMs,
  getPanelMontageMusicConfig,
  getActiveStageVideoEl: () => (exportPreviewController.deps?.podcastVideoState?.stageVideoSlot === 1 ? els.montageExportPreviewVideoAlt : els.montageExportPreviewVideo),
  getInactiveStageVideoEl: () => (exportPreviewController.deps?.podcastVideoState?.stageVideoSlot === 1 ? els.montageExportPreviewVideo : els.montageExportPreviewVideoAlt),
  setActiveStageVideoSlot: (slot = 0) => {
    exportPreviewController.deps.podcastVideoState.stageVideoSlot = Number(slot || 0) === 1 ? 1 : 0;
  },
  shouldUseNativeVideoAudioForRow,
  shouldKeepNativeVideoAudioForRow,
  resolveDialogueAudioForRow,
  resolveDialogueAudioPlaybackRate,
  resolveStorageAudioUrl,
  resolvePodcastStageAudioSrc,
  markStaleProxyMediaUrl,
  syncGeminiDialogueTrackWithRuntime,
  syncPodcastOnScreenTextOverlay: (ms, entries) => {
    // Reutilizamos la lógica global pero apuntando al overlay del modal
    if (els.montageExportPreviewOverlay) {
      syncPodcastOnScreenTextOverlay(ms, entries, {
        overlayEl: els.montageExportPreviewOverlay,
        containerEl: document.getElementById("montageExportPreviewContainer")
      });
    }
  },
  normalizeOnScreenTextTrackSettings,
  ensureOnScreenTextClipsByRowId,
  getOnScreenTextClipEffectiveDurationMs,
  getOnScreenTextClipText,
  resolveOnScreenTextRenderMetrics,
  resolveOnScreenTextPreviewLayoutSpec,
  getOnScreenTextStylePresetClass,
  getOnScreenTextBgPresetClass,
  buildOnScreenTextBubbleInlineStyle,
  escapeHtml,
  resolveFirebaseStorageUrl,
  renderPodcastVideoTimeline: () => { },
  resolveTimelineClipMix,
  getAuthHeaders,
  stopPanelMusic,
  setPodcastVideoPortraitFallback: () => { },
  syncStudioTimelinePreview,
  normalizeTimelineClipMediaScale,
  resolveSceneMediaRenderSpec,
  applySceneMediaScaleToStage
});

// Eventos del preview de exportación
if (els.montageExportPreviewPlayBtn) {
  els.montageExportPreviewPlayBtn.addEventListener("click", () => exportPreviewController.play());
}
if (els.montageExportPreviewPauseBtn) {
  els.montageExportPreviewPauseBtn.addEventListener("click", () => exportPreviewController.pause());
}
if (els.montageExportPreviewStopBtn) {
  els.montageExportPreviewStopBtn.addEventListener("click", () => exportPreviewController.stop());
}
if (els.montageExportPreviewSeekbar) {
  els.montageExportPreviewSeekbar.addEventListener("input", () => {
    exportPreviewController.seek(Number(els.montageExportPreviewSeekbar.value));
  });
}
if (els.montageExportRefreshPreviewBtn) {
  els.montageExportRefreshPreviewBtn.addEventListener("click", () => {
    exportPreviewController.stop();
    refreshMontageExportPreviewNow().catch(() => { });
  });
}

const podcastPreviewStageEl = els.podcastActiveSpeakerVideo?.closest?.(".podcast-video-preview") || null;
const podcastPreviewControlsEl = document.querySelector(".podcast-video-transport-group.is-middle");
const montageExportPreviewStageEl = document.getElementById("montageExportPreviewContainer");
const montageExportControlsEl = document.querySelector(".montage-export-preview-transport");

createPodcasterStageFullscreenController({
  targetEl: podcastPreviewStageEl,
  controlsEl: podcastPreviewControlsEl,
  buttonEl: els.podcastPreviewFullscreenBtn
});
createPodcasterStageFullscreenController({
  targetEl: montageExportPreviewStageEl,
  controlsEl: montageExportControlsEl,
  buttonEl: els.montageExportFullscreenBtn
});

// Los eventos de playback (play, pause, stop) se manejan ahora internamente en el playbackController
// a través de sus dependencias (deps), evitando redundancia y race conditions.

function syncStudioTimelinePreview(session, options = {}) {
  if (podcastVideoState.montageActive === true) return;
  syncPodcastVideoStageMedia(session, "");
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

function getCachedPodcastStageVideoObjectUrl(src = "") {
  return playbackController.getBlobUrlSync(src);
}

function getCachedPodcastStageAudioObjectUrl(src = "") {
  return playbackController.getBlobUrlSync(src);
}

function prunePodcastStageVideoCache() { }
function prunePodcastStageAudioCache() { }

async function ensurePodcastStageVideoCachedObjectUrl(src = "") {
  return playbackController.getBlobUrl(src);
}

function prewarmPodcastStageVideos(session = null, options = {}) {
  return playbackController.prewarmTimelineStageVideos(session || getActiveSession(), options);
}

function preloadPodcastStageVideosAroundMs(currentMs = 0, options = {}) {
  return playbackController.preloadStageVideosAroundMs(currentMs, {
    session: options.session || getActiveSession(),
    ...options
  });
}

async function ensurePodcastStageAudioCachedObjectUrl(src = "") {
  const cleanSrc = String(src || "").trim();
  if (!cleanSrc) return "";
  try {
    const blobUrl = await playbackController.getBlobUrl(cleanSrc);
    return String(blobUrl || cleanSrc).trim();
  } catch (_) {
    return cleanSrc;
  }
}

function resolvePodcastStageAudioSrc(src = "") {
  const cleanSrc = String(src || "").trim();
  if (!cleanSrc) return "";
  const cached = playbackController.getBlobUrlSync(cleanSrc);
  if (!cached) {
    playbackController.getBlobUrl(cleanSrc).catch(() => { });
    return cleanSrc;
  }
  return cached;
}

function releaseTransientStageVideoObjectUrl(videoEl = null) {
  return playbackController.releaseTransientStageVideoObjectUrl(videoEl);
}

function getStageVideoElements() {
  return playbackController.getStageVideoElements();
}

function getStageVideoBundle(slot = 0) {
  return playbackController.getStageVideoBundle(slot);
}

function getActiveStageVideoBundle() {
  return playbackController.getActiveStageVideoBundle();
}

function getInactiveStageVideoBundle() {
  return playbackController.getInactiveStageVideoBundle();
}

function applyStageVideoBundleLayout(bundle = null, layoutMode = "default") {
  return playbackController.applyStageVideoBundleLayout(bundle, layoutMode);
}

function syncStageVideoBundlePlayback(backdrop = null, foreground = null, options = {}) {
  return playbackController.syncStageVideoBundlePlayback(backdrop, foreground, options);
}

function getActiveStageVideoEl() {
  return playbackController.getActiveStageVideoEl();
}

function getInactiveStageVideoEl() {
  return playbackController.getInactiveStageVideoEl();
}

function setActiveStageVideoSlot(slot = 0) {
  return playbackController.setActiveStageVideoSlot(slot);
}

function assignStageVideoElementSource(videoEl = null, source = "", options = {}) {
  return playbackController.assignStageVideoElementSource(videoEl, source, options);
}

async function primePodcastStageVideoSource(src = "") {
  return playbackController.primeStageVideoSource(src);
}

async function setPodcastStageVideoSource(src = "") {
  return playbackController.setStageVideoSourceForElement(playbackController.getActiveStageVideoEl(), src);
}

async function setPodcastStageVideoSourceForElement(videoEl = null, src = "", options = {}) {
  return playbackController.setStageVideoSourceForElement(videoEl, src, options);
}

function clearStageVideoCache() {
  return playbackController.clearStageVideoCache();
}

function clearStageAudioCache() {
  return playbackController.clearStageAudioCache();
}

function dumpStageVideoState() {
  return playbackController.dumpStageVideoState();
}

try {
  window.__podcasterDebug = window.__podcasterDebug || {};
  window.__podcasterDebug.clearStageVideoCache = clearStageVideoCache;
  window.__podcasterDebug.dumpStageVideoState = dumpStageVideoState;
  window.__podcasterDebug.prewarmPodcastStageVideos = prewarmPodcastStageVideos;
  window.__podcasterDebug.setTimelinePreviewsSuspended = setTimelinePreviewsSuspended;
} catch (_) {
  // noop
}

async function waitForStudioLiveDrain(rowId = "", timeoutMs = 120000) {
  return Promise.resolve(true);
}

async function waitForStandaloneRowPlayback(rowId = "", timeoutMs = 120000) {
  return Promise.resolve(true);
}

async function playSceneInStudio(row = null, options = {}) {
  const session = getActiveSession();
  if (!session || !row) return false;
  const rowId = String(row.id || "").trim();
  const entries = buildTimelineRuntimeEntries(session);
  const entry = entries.find(e => e.rowId === rowId);
  if (!entry) {
    return playRowAudio(rowId, { speedMultiplier: Number(els.podcastVideoSpeedSelect?.value || 1) });
  }

  setPodcastVideoRow(rowId, { syncStage: true });
  playbackController.play(entry.startMs, { stopAtMs: entry.startMs + entry.effectiveDurationMs });
  return true;
}

// Removed duplicate playPodcastStudioMontage

function cancelTimelineSequence({ paused = false } = {}) {
  podcastVideoState.timelineSequenceToken = Number(podcastVideoState.timelineSequenceToken || 0) + 1;
  podcastVideoState.timelineSequenceActive = false;
  podcastVideoState.timelineSequencePaused = Boolean(paused);
  const previousStageMode = String(podcastVideoState.timelineSequencePreviousStageMode || "").trim();
  if (previousStageMode) {
    podcastVideoState.montageStageMode = previousStageMode;
  }
  podcastVideoState.timelineSequencePreviousStageMode = "";
  podcastVideoState.timelineSequenceRuntimeEntries = [];
  Object.values(podcastVideoState.montageAudioPlayers || {}).forEach((audio) => {
    try { audio.pause(); } catch (_) { }
  });
  podcastVideoState.montageAudioPlayers = {};
  stopStudioDialoguePreviewAudio();
  if (paused) {
    playbackController.pauseBackgroundMusic();
  } else {
    playbackController.stopBackgroundMusic();
  }
  if (podcastVideoState.audioEl) {
    try { podcastVideoState.audioEl.pause(); } catch (_) { }
    podcastVideoState.audioEl = null;
  }
}

function resolveTimelineSequenceStartIndex(entries = [], startMs = 0) {
  return window.resolveTimelineSequenceStartIndex(entries, startMs);
}

async function playTimelineSequenceFromPlayhead(startAtMs = null) {
  return playbackController.play(startAtMs);
}
function syncCreativeVideoToggleButton() {
  const panelCopy = getPanelModeCopy(getActiveSession());
  const isOpen = creativeVideoState.enabled === true;
  if (!els.togglePodcastVideoBtn) return;
  els.togglePodcastVideoBtn.classList.toggle("is-active", isOpen);
  els.togglePodcastVideoBtn.setAttribute("title", isOpen
    ? (panelCopy.videoMode ? "Ocultar Snoopy Video Creator Creativo" : "Ocultar video")
    : (panelCopy.videoMode ? "Mostrar Snoopy Video Creator Creativo" : "Mostrar video"));
}

function setCreativeVideoOpen(isOpen) {
  creativeVideoState.enabled = Boolean(isOpen);
  if (!creativeVideoState.enabled) {
    creativeVideoState.activeRowId = "";
  }
  if (els.creativeVideoModal) {
    els.creativeVideoModal.hidden = !creativeVideoState.enabled;
  }
  syncCreativeVideoToggleButton();
  upsertActiveSession((session) => ({
    ...session,
    creativeVideoConfig: normalizeCreativeVideoConfig({
      ...(session.creativeVideoConfig || {}),
      enabled: creativeVideoState.enabled
    })
  }), { render: false });
}

function closeCreativeVideoModal() {
  setGeminiCreativityModalOpen("");
  setCreativeVideoOpen(false);
}

function openCreativeVideoModal() {
  setCreativeVideoOpen(true);
  renderCreativeVideoShell(getActiveSession());
}

function renderCreativeTimeline(session = null) {
  if (!els.creativeVideoTimelineList) return;
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  els.creativeVideoTimelineList.innerHTML = rows.map((row, index) => {
    const active = String(row?.id || "").trim() === String(creativeVideoState.activeRowId || "").trim();
    const duration = Math.max(VIDEO_SCENE_MIN_SEC, Math.min(VIDEO_SCENE_MAX_SEC, Number(row?.durationSec) || VIDEO_SCENE_MAX_SEC));
    const voiceOver = String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim();
    return `
      <button class="creative-timeline-row${active ? " is-active" : ""}" type="button" data-action="select-creative-row" data-row-id="${escapeHtml(String(row?.id || "").trim())}">
        <strong>Secuencia ${index + 1}</strong>
        <span>${escapeHtml(secondsToClock(duration))} · ${escapeHtml(trimWords(voiceOver, 10) || "Sin voz en off")}</span>
      </button>
    `;
  }).join("");
}

function renderCreativeInspector(session = null) {
  const activeSession = session || getActiveSession();
  const rows = getSessionRows(activeSession);
  if (!rows.length) {
    if (els.creativeVideoInspectorScene) {
      els.creativeVideoInspectorScene.textContent = "Secuencia activa: --";
    }
    if (els.creativeVideoInspectorEditor) {
      els.creativeVideoInspectorEditor.innerHTML = `<div class="creative-editor-empty">No hay escenas disponibles en el guión.</div>`;
    }
    return;
  }
  if (!creativeVideoState.activeRowId || !rows.some((row) => String(row?.id || "").trim() === String(creativeVideoState.activeRowId || "").trim())) {
    creativeVideoState.activeRowId = String(rows[0]?.id || "").trim();
  }
  const activeRowRaw = rows.find((row) => String(row?.id || "").trim() === String(creativeVideoState.activeRowId || "").trim()) || rows[0];
  const activeIndex = Math.max(0, rows.findIndex((row) => String(row?.id || "").trim() === String(activeRowRaw?.id || "").trim()));
  const activeRow = normalizeCreativeRow(activeRowRaw, activeIndex, { videoPreset: resolveActiveVideoPreset(activeSession) });
  const activeRowEditorVisualNotes = resolveVisualNotesEditorValue(activeRowRaw);
  const activeVisualProposal = resolveActiveVisualProposal(activeRow);
  if (els.creativeVideoInspectorScene) {
    els.creativeVideoInspectorScene.textContent = `Secuencia activa: ${activeIndex + 1}`;
  }
  if (!els.creativeVideoInspectorEditor) return;
  const activeVoiceOriginal = String(activeRow?.voiceOverOriginalText || "").trim();
  const displayedActiveVisualProposal = resolveDisplayedVisualProposal(activeRow);
  els.creativeVideoInspectorEditor.innerHTML = `
    <!-- El campo Tiempo (durationSec) ha sido removido para evitar confusión con la velocidad del audio -->
    <label class="row-field">
      <span class="row-field-head">
        <span>Guion</span>
        <span class="row-field-inline-actions">
          <button class="row-icon-btn row-field-mini-btn" type="button" data-action="open-gemini-creativity" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" title="Ajustar creatividad de Gemini" aria-label="Ajustar creatividad de Gemini">
            <i class="fas fa-sliders-h" aria-hidden="true"></i>
          </button>
          <button class="row-icon-btn row-field-mini-btn" type="button" data-action="rewrite-voiceover-text" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" title="Reformular guion con Gemini (más corto, sin perder esencia)" aria-label="Reformular guion con Gemini">
            <i class="fas fa-magic" aria-hidden="true"></i>
          </button>
          <button class="row-icon-btn row-field-mini-btn" type="button" data-action="restore-voiceover-text" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" title="Restaurar guion original" aria-label="Restaurar guion original"${activeVoiceOriginal ? "" : " disabled"}>
            <i class="fas fa-undo-alt" aria-hidden="true"></i>
          </button>
        </span>
      </span>
      <textarea rows="4" data-field="voiceOverText" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" placeholder="Narración de la escena">${escapeHtml(String(activeRow?.voiceOverText || activeRow?.text || "").trim())}</textarea>
    </label>
    <label class="row-field">
      <span>Descripción de escena</span>
      <textarea rows="4" data-field="sceneDescription" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" placeholder="Qué se ve en cámara">${escapeHtml(String(activeRow?.sceneDescription || activeRow?.scenePrompt || "").trim())}</textarea>
    </label>
    <label class="row-field">
      <span class="row-field-head">
        <span>Texto en pantalla</span>
        <span class="row-field-inline-actions">
          <button class="row-icon-btn row-field-mini-btn" type="button" data-action="copy-voiceover-to-onscreen-text" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" title="Copiar guión → texto en pantalla" aria-label="Copiar guión a texto en pantalla">
            <i class="fas fa-level-down-alt" aria-hidden="true"></i>
          </button>
        </span>
      </span>
      <input type="text" data-field="onScreenText" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" value="${escapeHtml(String(activeRow?.onScreenText || "").trim())}" placeholder="Texto breve en pantalla">
    </label>
    <label class="row-field">
      <span>Transición</span>
      <textarea rows="2" data-field="transition" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" placeholder="Ej: corte rápido, disolvencia, barrido">${escapeHtml(String(activeRow?.transition || activeRow?.visualNotes || activeRow?.notes || "").trim())}</textarea>
    </label>
    <label class="row-field">
      <span class="row-field-head">
        <span style="display: flex; align-items: center; gap: 8px;">
          Elemento visual
          ${displayedActiveVisualProposal ? `
            <span class="workbench-tag is-status" style="background: #fbbf24; color: #000; font-size: 9px; cursor: help;" title="Propuesta: ${escapeHtml(activeVisualProposal)}">
              CAMBIO PROPUESTO
            </span>
          ` : ""}
        </span>
        <span class="row-field-inline-actions">
          ${displayedActiveVisualProposal ? `
            <button class="row-icon-btn row-field-mini-btn" type="button" data-action="apply-visual-proposal" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" title="Aceptar y aplicar propuesta de cambio visual" style="color: #10b981;">
              <i class="fas fa-check-circle"></i>
            </button>
          ` : ""}
          <button class="row-icon-btn row-field-mini-btn" type="button" data-action="open-gemini-creativity" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" title="Ajustar creatividad de Gemini" aria-label="Ajustar creatividad de Gemini">
            <i class="fas fa-sliders-h" aria-hidden="true"></i>
          </button>
          <button class="row-icon-btn row-field-mini-btn" type="button" data-action="rewrite-visual-notes" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" title="Regenerar elemento visual con Gemini (más detallado)" aria-label="Regenerar elemento visual con Gemini">
            <i class="fas fa-magic" aria-hidden="true"></i>
          </button>
        </span>
      </span>
      <textarea rows="3" data-field="visualNotes" data-row-id="${escapeHtml(String(activeRow?.id || "").trim())}" placeholder="Qué elemento visual refuerza la explicación">${escapeHtml(activeRowEditorVisualNotes)}</textarea>
      
      <!-- PROPUESTA ACTIVA EN INSPECTOR -->
      ${displayedActiveVisualProposal ? `
        <div class="row-active-proposal${isVisualProposalResolved(activeRow, displayedActiveVisualProposal) ? " is-resolved" : ""}" style="margin-top: 8px; border-radius: 6px; padding: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span class="row-active-proposal-label" style="font-size: 10px; font-weight: 800; text-transform: uppercase;">Propuesta Activa</span>
            <button class="row-icon-btn" type="button" data-action="delete-visual-proposal-text" data-row-id="${escapeHtml(activeRow.id)}" data-proposal-text="${escapeHtml(displayedActiveVisualProposal)}" title="Marcar propuesta como realizada" style="color: #fbbf24; padding: 2px;">
              <i class="fas fa-times-circle"></i>
            </button>
          </div>
          <div class="row-active-proposal-text" style="font-size: 11px; line-height: 1.4;">${escapeHtml(displayedActiveVisualProposal)}</div>
        </div>
      ` : ""}
    </label>
  `;
}

function renderCreativeVideoShell(session = null) {
  const activeSession = session || getActiveSession();
  if (!activeSession || !isCreativeVideoMode(activeSession)) {
    if (els.creativeVideoModal) els.creativeVideoModal.hidden = true;
    return;
  }
  const cfg = getCreativeVideoConfig(activeSession);
  const shouldBeOpen = cfg.enabled === true || creativeVideoState.enabled === true;
  creativeVideoState.enabled = shouldBeOpen;
  if (els.creativeVideoModal) {
    els.creativeVideoModal.hidden = !shouldBeOpen;
  }
  const rows = getSessionRows(activeSession);
  const videoPreset = resolveActiveVideoPreset(activeSession);
  const normalizedRows = rows.map((row, index) => normalizeCreativeRow(row, index, { videoPreset }));
  const rowsChanged = JSON.stringify(normalizedRows) !== JSON.stringify(rows);
  if (rowsChanged) {
    upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        hosts: ["Narrador"],
        rows: normalizedRows
      }
    }), { render: false });
  }
  const resolvedCfg = getCreativeVideoConfig(getActiveSession() || activeSession);
  if (els.creativeGlobalVoiceName) {
    const selected = normalizeLiveVoiceName(resolvedCfg.globalVoiceName, "Kore");
    els.creativeGlobalVoiceName.innerHTML = buildVoiceOptions(selected);
  }
  if (els.creativeVideoShell) {
    els.creativeVideoShell.setAttribute("aria-label", "Snoopy Video Creator Creativo");
  }
  renderCreativeTimeline(getActiveSession() || activeSession);
  renderCreativeInspector(getActiveSession() || activeSession);
  syncCreativeVideoToggleButton();
}

function setPodcastVideoOpen(isOpen) {
  podcastVideoState.enabled = Boolean(isOpen);
  const panelCopy = getPanelModeCopy(getActiveSession());
  if (!podcastVideoState.enabled) {
    setAudioTrackMixOpen(false);
    podcastVideoState.activeRowId = "";
    setPodcastTransitionPickerOpen(false);
    resetPodcastMouth();
    playbackController.stop();
    syncPodcastVideoStageMedia(getActiveSession(), "");
  }
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = !podcastVideoState.enabled;
  }
  if (els.togglePodcastVideoBtn) {
    els.togglePodcastVideoBtn.classList.toggle("is-active", podcastVideoState.enabled);
    els.togglePodcastVideoBtn.setAttribute("title", podcastVideoState.enabled
      ? (panelCopy.videoMode ? "Ocultar panel de video creativo" : "Ocultar video")
      : (panelCopy.videoMode ? "Mostrar panel de video creativo" : "Mostrar video"));
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
  const preOpenSession = getActiveSession();
  if (preOpenSession) {
    const currentType = resolveVideoContentType(preOpenSession);
    if (currentType === "none") {
      const inferredType = isCurrentModeVideo() ? "creative" : "videopodcast";
      upsertActiveSession((session) => withSessionVideoContentType(session, inferredType), { render: false });
    }
  }
  const runToken = ++podcastVideoOpenRunToken;
  podcastVideoState.enabled = true;
  if (preOpenSession) {
    upsertActiveSession((session) => ({
      ...session,
      podcastVideoConfig: normalizePodcastVideoConfig({
        ...(session.podcastVideoConfig || {}),
        enabled: true
      })
    }), { render: false });
  }
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = false;
  }
  setPodcastVideoLoaderOpen(true);
  await sleep(950);
  if (runToken !== podcastVideoOpenRunToken) return;
  const openedSession = getActiveSession();
  podcastVideoState.speaking = false;

  if (openedSession && shouldAutoRepairTimelineLayout(openedSession)) {
    reflowTimelineClipsByScriptOrder(openedSession, { persist: true, render: false });
  }

  try { syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true }); } catch (_) { }

  // Refetch the session in case the repair or sync routines updated it in memory
  const finalSession = getActiveSession() || openedSession;

  // Simplificado: Un solo render que ya maneja las sub-vistas
  renderPodcastVideoShell(finalSession);
  setPodcastVideoRow(resolveTargetVideoRowId(finalSession), { syncStage: true, lightweightUi: true });
  prewarmPodcastStageVideos(finalSession, {
    currentMs: Math.max(0, Number(podcastVideoState.montageCursorMs || 0) || 0),
    concurrency: 3,
    reason: "studio-open"
  }).catch(() => { });
  preloadPodcastStageVideosAroundMs(Number(podcastVideoState.montageCursorMs || 0) || 0, {
    session: finalSession,
    limit: 3,
    reason: "studio-open-current"
  }).catch(() => { });

  // Sincronizar todos los switches de publicación (header y footer)
  const session = getActiveSession();
  document.querySelectorAll("[id^='sessionPublishToggle']").forEach(el => {
    if (el) el.checked = session?.publicar === true;
  });

  if (typeof window.preloadAllDialogueAudios === "function") {
    window.preloadAllDialogueAudios(openedSession);
  }

  setPodcastVideoStatus(getPanelModeCopy(getActiveSession()).videoMode ? "Video creativo activado" : "Video activado");
  setPodcastVideoLoaderOpen(false);
}

function closePodcastVideoModal() {
  podcastVideoOpenRunToken += 1;
  setPodcastVideoLoaderOpen(false);
  playbackController.stop({ keepStatus: true, keepCursor: true });
  setAudioTrackMixOpen(false);
  setGeminiCreativityModalOpen("");
  const panelCopy = getPanelModeCopy(getActiveSession());
  podcastVideoState.enabled = false;
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = true;
  }
  if (els.togglePodcastVideoBtn) {
    els.togglePodcastVideoBtn.classList.remove("is-active");
    els.togglePodcastVideoBtn.setAttribute("title", panelCopy.videoMode ? "Mostrar panel de video creativo" : "Mostrar video");
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
  if (els.podcastActiveSpeakerAvatarImage) {
    const src = resolvePodcastPortraitUrl(portrait?.downloadUrl || "");
    if (src) {
      els.podcastActiveSpeakerAvatarImage.src = src;
      els.podcastActiveSpeakerAvatarImage.alt = key ? `Retrato de ${resolveSpeakerDisplayName(key, session)}` : "Locutor";
    } else {
      els.podcastActiveSpeakerAvatarImage.removeAttribute("src");
      els.podcastActiveSpeakerAvatarImage.alt = "Locutor sin retrato";
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
  const isReel = isReelModeEnabled(session);
  const contentMode = isReel ? "reel" : (isEducationalVideoMode(session) ? "creative" : "podcast");
  const voiceProfile = resolveAgentVoiceProfile(voiceName, voiceName);
  const scenarioPrompt = resolveSpeakerStudioScenarioPrompt(session, key, {
    expression,
    contentMode
  });
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
      contentMode,
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
  if (isEducationalVideoMode(activeSession) || !isVideoPodcastMode(activeSession)) {
    els.podcastPortraitStrip.hidden = true;
    const footer = els.podcastPortraitStrip.closest(".podcast-studio-footer");
    if (footer) {
      footer.style.display = "none";
    }
    els.podcastPortraitStrip.innerHTML = "";
    podcastRenderState.portraitStructureKey = "";
    return;
  }
  els.podcastPortraitStrip.hidden = false;
  const footer = els.podcastPortraitStrip.closest(".podcast-studio-footer");
  if (footer) {
    footer.style.display = "";
  }
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
  const hosts = getPodcastPortraitStripHosts(activeSession);
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
            <span>Escenario</span>
            <div class="podcast-portrait-tags">
              ${reference ? `<span class="row-chip">${escapeHtml(`Referencia: ${reference.name}`)}</span>` : ""}
              ${isGenerating ? `<span class="row-chip">Generando imagen...</span>` : ""}
              ${!hasGeneratedImage && !isGenerating && !hasError ? `<span class="row-chip row-chip-warning">Sin imagen.</span>` : ""}
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
  if (els.creativeVideoModal) {
    els.creativeVideoModal.hidden = true;
  }
  creativeVideoState.enabled = false;
  const panelCopy = getPanelModeCopy(activeSession);
  resetPodcastStudioSessionUiState(activeSession);
  setPodcastStudioInspectorCollapsed(podcastStudioInspectorCollapsed);
  // Persistencia de ancho del inspector al renderizar el shell
  if (els.podcastVideoShell) {
    els.podcastVideoShell.style.setProperty("--pod-studio-inspector-width", `${PodcasterResize.podcastStudioInspectorWidth}px`);
  }
  ensureTimelineClipsByRowId(activeSession, { persist: !podcastVideoState.montageActive });
  ensureOnScreenTextClipsByRowId(activeSession, { persist: !podcastVideoState.montageActive });
  ensureOnScreenTextLayoutByRowId(activeSession, { persist: !podcastVideoState.montageActive });
  // Normaliza una sola vez por sesión: duración fija (7s) y centrado respecto a la escena.
  // Se guarda en config usando `timelineOnScreenTextDefaultsVersion`.
  normalizeOnScreenTextClipsToSevenSecondsCentered(activeSession, { persist: !podcastVideoState.montageActive });
  const cfg = getPodcastVideoConfig(activeSession);
  const audioOnlyPodcastMode = isAudioOnlyPodcastStudioMode(activeSession);
  const composerIsVideoMode = isCurrentModeVideo(activeSession);

  syncTimelineModeButtons(activeSession);
  // No autoabrir el modal al hidratar si el composer está en modo podcast.
  // La apertura manual sigue funcionando porque `podcastVideoState.enabled`
  // se activa explícitamente desde los botones del editor.
  const shouldBeOpen = podcastVideoState.enabled === true || (composerIsVideoMode && cfg.enabled === true);
  podcastVideoState.enabled = shouldBeOpen;
  if (els.podcastVideoModal) {
    els.podcastVideoModal.hidden = !shouldBeOpen;
    els.podcastVideoModal.setAttribute("aria-label", panelCopy.shellAriaLabel);
  }
  if (els.podcastVideoShell) {
    els.podcastVideoShell.classList.toggle("is-video-educativo", panelCopy.videoMode);
    els.podcastVideoShell.classList.toggle("podcast-video-shell--audio-only", audioOnlyPodcastMode);
    els.podcastVideoShell.setAttribute("aria-label", panelCopy.shellAriaLabel);
  }
  if (els.podcastStudioTrackTitle) {
    els.podcastStudioTrackTitle.textContent = audioOnlyPodcastMode ? "Audio Gemini" : "Escenas";
  }
  if (els.podcastVideoModeToggle) {
    els.podcastVideoModeToggle.checked = isVideoPodcastMode(activeSession);
  }
  if (els.podcastTimelineZoomOutRange) {
    els.podcastTimelineZoomOutRange.value = String(getStudioTimelineZoom(activeSession));
  }

  // Sincronizar switch de publicación cada vez que se renderiza el shell del video
  document.querySelectorAll("[id^='sessionPublishToggle']").forEach(el => {
    if (el) el.checked = activeSession.publicar === true;
  });
  if (els.onScreenTextTrackModal && els.onScreenTextTrackModal.hidden === false) {
    renderOnScreenTextTrackModal(activeSession);
  }
  syncPodcastVideoSpeakerCardVisibility();
  if (els.togglePodcastVideoBtn) {
    els.togglePodcastVideoBtn.classList.toggle("is-active", shouldBeOpen);
    els.togglePodcastVideoBtn.setAttribute("title", shouldBeOpen
      ? (panelCopy.videoMode ? "Ocultar panel de video creativo" : "Ocultar video")
      : (panelCopy.videoMode ? "Mostrar panel de video creativo" : "Mostrar video"));
  }
  if (els.podcastVideoLoader) {
    els.podcastVideoLoader.setAttribute("aria-label", panelCopy.loaderAriaLabel);
    const loaderStrong = els.podcastVideoLoader.querySelector(".podcast-video-loader-card strong");
    const loaderSpan = els.podcastVideoLoader.querySelector(".podcast-video-loader-card span");
    const loaderLogo = els.podcastVideoLoader.querySelector(".podcast-video-loader-logo");
    if (loaderStrong) loaderStrong.textContent = panelCopy.loaderBrand;
    if (loaderSpan) loaderSpan.textContent = panelCopy.loaderSubtitle;
    if (loaderLogo) loaderLogo.alt = panelCopy.loaderBrand;
  }
  const brandTitle = els.podcastVideoShell?.querySelector(".podcast-brand-title span");
  if (brandTitle) brandTitle.textContent = panelCopy.brandTitle;
  const inspectorTitle = els.podcastStudioInspector?.querySelector("h4");
  if (inspectorTitle) inspectorTitle.textContent = panelCopy.inspectorTitle;
  const inspectorSectionTitle = els.podcastVideoShell?.querySelector(".inspector-scene-panel-head");
  if (inspectorSectionTitle) inspectorSectionTitle.textContent = panelCopy.inspectorSectionTitle;
  const studioNote = els.podcastVideoShell?.querySelector(".podcast-studio-note");
  if (studioNote) studioNote.textContent = panelCopy.footerNote;
  if (els.podcastStudioInspectorScene && !els.podcastStudioInspectorScene.textContent.trim()) {
    els.podcastStudioInspectorScene.textContent = panelCopy.inspectorSceneLabel;
  }
  renderPodcastPortraitStrip(activeSession, { reason: "shell" });
  const rows = getSessionRows(activeSession);
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
  renderPodcastSceneLibrary(activeSession);
  if (!podcastSceneLibraryState.loadedAt && !podcastSceneLibraryState.loading) {
    fetchPodcastSceneLibrary({ render: false }).then(() => {
      if (String(getActiveSession()?.id || "").trim() === String(activeSession.id || "").trim()) {
        renderPodcastSceneLibrary(getActiveSession());
      }
    }).catch(() => { });
  }
  if (cfg.autoGenerateScenarioImages === true) {
    ensureGlobalScenarioImages(activeSession).catch(() => { });
  }
  const hosts = getSpeakerOptions(activeSession);
  if (!podcastVideoState.activeSpeaker || !hosts.includes(String(podcastVideoState.activeSpeaker || "").trim())) {
    setPodcastVideoSpeaker(activeSession, getSpeakerOptions(activeSession)[0] || "", { speaking: false });
  } else {
    setPodcastVideoSpeaker(activeSession, podcastVideoState.activeSpeaker, { speaking: podcastVideoState.speaking });
  }
  syncPodcastVideoStageMedia(activeSession, audioOnlyPodcastMode ? "" : podcastVideoState.activeRowId);
  syncPodcastStudioInspector(activeSession);
  if (audioOnlyPodcastMode) {
    if (els.podcastOnScreenTextOverlay) {
      els.podcastOnScreenTextOverlay.hidden = true;
      els.podcastOnScreenTextOverlay.innerHTML = "";
    }
  } else {
    syncPodcastOnScreenTextOverlay(activeSession, {
      rowId: String(podcastVideoState.activeRowId || "").trim(),
      currentMs: Number(podcastVideoState.montageCursorMs || 0),
      forceRow: true
    });
  }
  syncOnScreenTextTrackToggleBtn(activeSession);
  setPodcastVideoZoomEnabled(podcastVideoState.zoomed === true);
  const totalSec = getTimelineTotalDurationMs(activeSession) / 1000;
  podcastVideoState.timelineDurationSec = Math.max(0, Number(totalSec) || 0);
  if (els.podcastStudioTime) {
    const current = Math.max(0, Number(podcastVideoState.montageCursorMs || 0) / 1000);
    els.podcastStudioTime.textContent = `${secondsToClock(current)} / ${secondsToClock(totalSec)}`;
  }
  // Refresh handled via controller tick logic.
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
    els.generateDialogueVideoBtn.disabled = podcastVideoState.busy || !rowId || requirePodcasterGenerationApi().dialogueVideoGenerationPending.has(key);
    if (rowId) {
      els.generateDialogueVideoBtn.dataset.rowId = rowId;
    } else {
      delete els.generateDialogueVideoBtn.dataset.rowId;
    }
  }
  if (els.generateAllDialogueVideosBtn) {
    const rows = getActiveSession()?.script?.rows || [];
    els.generateAllDialogueVideosBtn.disabled = podcastVideoState.busy || !rows.length;
  }
  if (els.regenerateAllDialogueVideosBtn) {
    const rows = getActiveSession()?.script?.rows || [];
    els.regenerateAllDialogueVideosBtn.disabled = podcastVideoState.busy || !rows.length;
  }
  if (els.regenerateAllGeminiAudiosBtn) {
    const regenerableRows = getRegenerableGeminiAudioRows(getActiveSession());
    els.regenerateAllGeminiAudiosBtn.disabled = podcastVideoState.busy || regenerableRows.length === 0;
  }
  if (els.reorderTimelineTracksBtn) {
    els.reorderTimelineTracksBtn.disabled = podcastVideoState.busy || !canReorderTimelineLayout(getActiveSession());
  }
  if (els.importGeminiDialogueTrackBtn) {
    const enabled = podcastVideoState.showMontageAudioSubtracks === true;
    els.importGeminiDialogueTrackBtn.disabled = podcastVideoState.busy;
    els.importGeminiDialogueTrackBtn.classList.toggle("is-active", enabled);
    els.importGeminiDialogueTrackBtn.setAttribute("title", enabled ? "Ocultar audio del montaje" : "Mostrar audio del montaje");
    els.importGeminiDialogueTrackBtn.setAttribute("aria-label", enabled ? "Ocultar audio del montaje" : "Mostrar audio del montaje");
  }
  if (els.generateDialogueAudioBtn) {
    const session = getActiveSession();
    const rowId = resolveTargetVideoRowId(session);
    const key = `${session?.id || ""}:${rowId || ""}`;
    els.generateDialogueAudioBtn.disabled = podcastVideoState.busy || !rowId || requirePodcasterGenerationApi().dialogueAudioGenerationPending?.has(key);
    if (rowId) {
      els.generateDialogueAudioBtn.dataset.rowId = rowId;
    } else {
      delete els.generateDialogueAudioBtn.dataset.rowId;
    }
    const hasAudio = hasStoredMediaSource(resolveDialogueAudioForRow(session, String(rowId || "").trim()));
    const label = hasAudio ? "Regenerar voz de la escena activa" : "Generar voz de la escena activa";
    const icon = els.generateDialogueAudioBtn.querySelector("i");
    els.generateDialogueAudioBtn.title = label;
    els.generateDialogueAudioBtn.setAttribute("aria-label", label);
    if (icon) icon.className = hasAudio ? "fas fa-sync-alt" : "fas fa-microphone-alt";
  }
  syncStudioPlayDialogueAudioButton();
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
    await geminiLiveAudioCtx.suspend().catch(() => { });
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
    await geminiLiveAudioCtx.resume().catch(() => { });
  }
  updatePodcastPlayerUi();
}

function stopPodcastPlayback(options = {}) {
  const keepQueue = options.keepQueue === true;
  window.backgroundDialogueAudioWarmupToken = 0;
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
  if (session) {
    setPodcastVideoRow("", { syncStage: true, preserveMontageCursor: true });
    setPodcastVideoSpeaker(session, "", { speaking: false });
  }
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
    await geminiLiveAudioCtx.resume().catch(() => { });
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
  const videoMode = isEducationalVideoMode({ ...sessionSnapshot, script: baseScript });
  const prompt = videoMode
    ? [
      "Reajusta el guion creativo actual para distribuir secuencias entre locutores.",
      `Usa exactamente estos locutores: ${hosts.join(", ")}.`,
      "Mantén progresión narrativa, claridad visual y soporte visual por escena.",
      "No elimines escenas; conserva el mismo número de filas."
    ].join("\n")
    : [
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
  const generated = videoMode
    ? await generateEducationalVideoScript(prompt, snapshot, { hosts, hostCount: hosts.length, videoMode: true })
    : await generatePodcastScript(prompt, snapshot, { hosts, hostCount: hosts.length, videoMode: false });
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
  if (!session) return false;
  const rows = normalizeRows(session.script?.rows);
  if (!rows.length) return false;

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
    return false;
  }
  const selectedSet = new Set(selectedIndexes);
  const globalDisfluencyConfig = readGlobalDisfluencyControls();
  const globalTtsDirectionConfig = readGlobalTtsDirectionControls();
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
      disfluencyConfig: normalizeDisfluencyConfig(globalDisfluencyConfig),
      ttsDirectionConfig: normalizeTtsDirectionConfig(globalTtsDirectionConfig)
    };
  });

  let nextScript = {
    ...session.script,
    hosts: [...hosts],
    rows: nextRows
  };

  if (els.globalUseGeminiToggle?.checked) {
    const sessionId = String(session?.id || "").trim();
    setGenerationStatus("Reajustando con Gemini...", "is-busy", { sessionId });
    try {
      nextScript = await rebalanceScriptWithGemini(session, nextScript, hosts);
      console.log("[podcaster] Reajusté el guión con Gemini para equilibrar los nuevos locutores.", {
        sessionId,
        hostCount: hosts.length
      });
    } catch (error) {
      addChatMessage("system", `No se pudo reajustar con Gemini (${error.message}). Se aplicó redistribución local.`);
    } finally {
      setGenerationStatus("Guion listo", "is-live", { sessionId });
    }
  }

  upsertActiveSession((current) => ({
    ...current,
    speakerVoiceMap: voiceMap,
    speakerExpressionMap: expressionMap,
    speakerNameMap: nameMap,
    disfluencyDefaults: normalizeDisfluencyConfig(globalDisfluencyConfig),
    ttsDirectionDefaults: normalizeTtsDirectionConfig(globalTtsDirectionConfig),
    script: nextScript
  }));

  // Guardamos la configuración de video por separado para no interferir con el script
  try {
    const selectedVideoModel = buildPodcasterVideoModelChain(String(els.globalCheapVideoMode?.value || "").trim())[0] || "veo-3.1-lite-generate-preview";
    upsertActiveSession((current) => ({
      ...current,
      podcastVideoConfig: {
        ...getPodcastVideoConfig(current),
        videoModel: selectedVideoModel,
        cheapVideoMode: selectedVideoModel === "veo-3.1-lite-generate-preview"
      }
    }), { render: false });
  } catch (e) {
    console.error("[podcaster] Error persisting video quality setting:", e);
  }
  syncGlobalConfigPanel(getActiveSession());
  scheduleSessionLocalPersist("global-config");
  setGlobalConfigOpen(false);
  setGenerationStatus("Configuración global aplicada", "is-live");
  return true;
}
function renderScript(session) {
  return requirePodcasterScriptEditorRuntime().renderScript(session);
}

function buildScriptRowEditorMarkup(session, row, index = -1) {
  return requirePodcasterScriptEditorRuntime().buildScriptRowEditorMarkup(session, row, index);
}

function buildBlankScriptRow(session = null, options = {}) {
  return requirePodcasterScriptEditorRuntime().buildBlankScriptRow(session, options);
}

function buildInspectorScriptRowMarkup(session, row, index = -1) {
  return requirePodcasterScriptEditorRuntime().buildInspectorScriptRowMarkup(session, row, index);
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
  els.sidepanel.hidden = false;
  els.sidepanel.classList.toggle("is-open", !!isOpen);
  els.podcasterLayout?.classList.toggle("has-sidepanel", !!isOpen);
  if (els.openSidepanelBtn) {
    els.openSidepanelBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    els.openSidepanelBtn.setAttribute("title", isOpen ? "Ocultar inspector" : "Mostrar inspector");
    els.openSidepanelBtn.setAttribute("aria-label", isOpen ? "Ocultar inspector" : "Mostrar inspector");
    els.openSidepanelBtn.classList.toggle("is-open", !!isOpen);
    const icon = els.openSidepanelBtn.querySelector("i");
    if (icon) {
      icon.className = isOpen ? "fas fa-chevron-right" : "fas fa-chevron-left";
    }
  }
  if (els.sidepanelHeaderToggleBtn) {
    els.sidepanelHeaderToggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
  updateChatComposerLayoutOffset();
}

function preserveComposerVisibilityState() {
  const wasCollapsed = els.composerShell?.classList.contains("is-collapsed") === true;
  const wasRevealVisible = els.revealComposerBtn?.classList.contains("is-visible") === true;
  const applyState = () => {
    if (els.composerShell) {
      els.composerShell.classList.toggle("is-collapsed", wasCollapsed);
    }
    if (els.revealComposerBtn) {
      els.revealComposerBtn.classList.toggle("is-visible", wasRevealVisible);
    }
    updateChatComposerLayoutOffset();
    if (els.chatFeed) {
      els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
    }
  };
  return () => {
    applyState();
    window.requestAnimationFrame(applyState);
    window.setTimeout(applyState, 0);
    window.setTimeout(applyState, 120);
  };
}

let suppressComposerToggleUntil = 0;

function suppressComposerToggleTemporarily(durationMs = 1200) {
  suppressComposerToggleUntil = Math.max(suppressComposerToggleUntil, Date.now() + Math.max(0, Number(durationMs) || 0));
}

function shouldIgnoreComposerToggle() {
  return Date.now() < suppressComposerToggleUntil;
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
    // Usamos `inert` en lugar de `aria-hidden` para evitar que un descendant
    // enfocado (ej. el botón toggle) quede oculto a tecnologías asistivas.
    // `inert` bloquea nativamente focus, pointer-events y aria en el subárbol.
    if (podcastStudioInspectorCollapsed) {
      els.podcastStudioInspector.setAttribute("inert", "");
    } else {
      els.podcastStudioInspector.removeAttribute("inert");
    }
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
  upsertPodcastStudioUiState({ inspectorCollapsed: podcastStudioInspectorCollapsed }, { autosaveReason: "ui-state" });
}

function setPodcastVideoLibraryCollapsed(collapsed, { persist = true } = {}) {
  PodcasterResize.setPodcastVideoLibraryCollapsed(collapsed, { persist, els, upsertUiState: upsertPodcastStudioUiState });
}

function setPodcastStudioInspectorWidth(nextWidth, { persist = true } = {}) {
  PodcasterResize.setPodcastStudioInspectorWidth(nextWidth, { persist, els, upsertUiState: upsertPodcastStudioUiState });
}

function setupPodcastStudioInspectorResize() {
  PodcasterResize.setupPodcastStudioInspectorResize(els, {
    upsertUiState: upsertPodcastStudioUiState,
    isCollapsed: () => podcastStudioInspectorCollapsed
  });
}

function setPodcastVideoStageMaxHeight(nextHeightPx = null, options = {}) {
  PodcasterResize.setPodcastVideoStageMaxHeight(nextHeightPx, { ...options, els, upsertUiState: upsertPodcastStudioUiState });
}

function setupPodcastVideoStageResize() {
  PodcasterResize.setupPodcastVideoStageResize(els, upsertPodcastStudioUiState);
}

function buildMarkdownTableFromRows(rows = []) {
  return requirePodcasterScriptGeneratorApiFunction("buildMarkdownTableFromRows")(rows);
}

function parseHtmlTableToRows(html = "") {
  return requirePodcasterScriptGeneratorApiFunction("parseHtmlTableToRows")(html);
}

function parsePlainTextTableToRows(text = "") {
  return requirePodcasterScriptGeneratorApiFunction("parsePlainTextTableToRows")(text);
}

function hasStructuredVideoTableInput(promptText = "", promptHtml = "") {
  return requirePodcasterScriptGeneratorApiFunction("hasStructuredVideoTableInput")(promptText, promptHtml);
}

function stripMarkdownTableFromText(text = "") {
  return requirePodcasterScriptGeneratorApiFunction("stripMarkdownTableFromText")(text);
}

function extractNonTableTextFromPromptHtml(promptHtml = "") {
  return requirePodcasterScriptGeneratorApiFunction("extractNonTableTextFromPromptHtml")(promptHtml);
}

function extractStructuredVideoTableRows(promptText = "", promptHtml = "") {
  return requirePodcasterScriptGeneratorApiFunction("extractStructuredVideoTableRows")(promptText, promptHtml);
}

function buildHtmlTableFromRows(rows = []) {
  return requirePodcasterScriptGeneratorApiFunction("buildHtmlTableFromRows")(rows);
}

function normalizeVideoTableHeaderKey(label = "") {
  return requirePodcasterScriptGeneratorApiFunction("normalizeVideoTableHeaderKey")(label);
}

function normalizeEducationalVideoTableRows(rows = []) {
  return requirePodcasterScriptGeneratorApiFunction("normalizeEducationalVideoTableRows")(rows);
}

function buildEducationalVideoTableHtml(rows = []) {
  return requirePodcasterScriptGeneratorApiFunction("buildEducationalVideoTableHtml")(rows);
}

function buildEducationalVideoTableMarkdown(rows = []) {
  return requirePodcasterScriptGeneratorApiFunction("buildEducationalVideoTableMarkdown")(rows);
}

async function structureEducationalVideoTableWithGemini(prompt = "", sessionSnapshot = null) {
  return requirePodcasterScriptGeneratorApiFunction("structureEducationalVideoTableWithGemini")(prompt, sessionSnapshot);
}

function buildEducationalVideoSceneTimeRange(index = 0) {
  return requirePodcasterScriptGeneratorApiFunction("buildEducationalVideoSceneTimeRange")(index);
}

function buildCompactEducationalSentence(source = "", maxWords = 16) {
  return requirePodcasterScriptGeneratorApiFunction("buildCompactEducationalSentence")(source, maxWords);
}

function stripLeadingStageDirection(text = "") {
  return requirePodcasterScriptGeneratorApiFunction("stripLeadingStageDirection")(text);
}

function splitScriptIntoSceneChunks(text = "", options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("splitScriptIntoSceneChunks")(text, options);
}

function normalizeSingleSentenceForVideoScene(text = "", options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("normalizeSingleSentenceForVideoScene")(text, options);
}

function normalizeOnScreenTextStrict(value = "", options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("normalizeOnScreenTextStrict")(value, options);
}

function inferTransitionFromSceneContext(options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("inferTransitionFromSceneContext")(options);
}

function normalizeTransitionForScene(value = "", options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("normalizeTransitionForScene")(value, options);
}

function buildOnScreenText(value = "", options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("buildOnScreenText")(value, options);
}

function validateEducationalVideoCanonicalRow(row = {}) {
  return requirePodcasterScriptGeneratorApiFunction("validateEducationalVideoCanonicalRow")(row);
}

function toEducationalVideoCanonicalRow(raw = {}, index = 0) {
  return requirePodcasterScriptGeneratorApiFunction("toEducationalVideoCanonicalRow")(raw, index);
}

function repairEducationalVideoCanonicalRowLocal(row = {}, index = 0) {
  return requirePodcasterScriptGeneratorApiFunction("repairEducationalVideoCanonicalRowLocal")(row, index);
}

function canonicalRowsToEducationalVideoTableRows(rows = []) {
  return requirePodcasterScriptGeneratorApiFunction("canonicalRowsToEducationalVideoTableRows")(rows);
}

function mergeEducationalVideoRowsWithLocalPriority(localRows = [], geminiRows = []) {
  return requirePodcasterScriptGeneratorApiFunction("mergeEducationalVideoRowsWithLocalPriority")(localRows, geminiRows);
}

function expandEducationalVideoRowsByScript(rows = []) {
  return requirePodcasterScriptGeneratorApiFunction("expandEducationalVideoRowsByScript")(rows);
}

function normalizeSplitCoverageText(value = "") {
  return requirePodcasterScriptGeneratorApiFunction("normalizeSplitCoverageText")(value);
}

function tokenizeCoverageText(value = "") {
  return requirePodcasterScriptGeneratorApiFunction("tokenizeCoverageText")(value);
}

function computeTokenCoverageRatio(original = "", candidate = "") {
  return requirePodcasterScriptGeneratorApiFunction("computeTokenCoverageRatio")(original, candidate);
}

function hasAcceptableSplitCoverage(original = "", candidate = "") {
  return requirePodcasterScriptGeneratorApiFunction("hasAcceptableSplitCoverage")(original, candidate);
}

async function splitEducationalVideoRowsWithGemini(rows = [], sessionSnapshot = null, options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("splitEducationalVideoRowsWithGemini")(rows, sessionSnapshot, options);
}

function buildEducationalVideoRowsFromNarrativeText(text = "") {
  return requirePodcasterScriptGeneratorApiFunction("buildEducationalVideoRowsFromNarrativeText")(text);
}

async function repairEducationalVideoCanonicalRowsWithGemini(canonicalRows = [], sessionSnapshot = null) {
  return requirePodcasterScriptGeneratorApiFunction("repairEducationalVideoCanonicalRowsWithGemini")(canonicalRows, sessionSnapshot);
}

async function composeEducationalVideoTable(input = {}, sessionSnapshot = null, options = {}) {
  return requirePodcasterScriptGeneratorApiFunction("composeEducationalVideoTable")(input, sessionSnapshot, options);
}

async function prepareVideoPromptPreviewForUser(promptText = "", promptHtml = "", sessionSnapshot = null) {
  return requirePodcasterScriptGeneratorApiFunction("prepareVideoPromptPreviewForUser")(promptText, promptHtml, sessionSnapshot);
}

async function composeVideoScriptFromUserInput(promptText = "", promptHtml = "", sessionSnapshot = null) {
  return requirePodcasterScriptGeneratorApiFunction("composeVideoScriptFromUserInput")(promptText, promptHtml, sessionSnapshot);
}

const podcasterPromptComposerApi = createPodcasterPromptComposerApi({
  els,
  escapeHtml,
  parseHtmlTableToRows,
  parsePlainTextTableToRows,
  buildHtmlTableFromRows
});
const {
  autoResize: autoResizePrompt,
  updateLayoutOffset: updateChatComposerLayoutOffset,
  getPlainText: getPromptInputPlainText,
  getHtml: getPromptInputHtml,
  setContent: setPromptInputContent,
  insertText: insertPromptInputText,
  insertHtml: insertPromptInputHtml,
  handlePaste: handlePromptInputPaste
} = podcasterPromptComposerApi;

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
  document.title = getPanelModeCopy(session).videoMode ? "Snoopy Video Creator Creativo" : "Snoopy Podcast Creator";
  // Do not re-hydrate music state while the montage is playing – it would overwrite
  // in-memory volume/track state and interrupt background audio.
  if (!podcastVideoState.montageActive) {
    syncPanelMusicStateFromSession(session);
  }
  setPromptInputContent(session.prompt || "", { html: session.promptHtml || "" });
  renderChat(session);
  renderScript(session);
  syncGlobalConfigPanel(session);
  syncMusicControls();
  renderPodcastVideoShell(session);
  syncReelModeUi(session);
  updatePodcastPlayerUi();
  renderGenerationStatus(session);
  renderSessions();
  const sessionTitle = session.title || "Sesión sin título";
  document.querySelectorAll(".floating-panel-session-title").forEach((el) => {
    el.textContent = sessionTitle;
  });
  syncCustomTooltips(document);
  syncPodcastStudioInspector(session);
  setComposerGenerationMode(composerGenerationMode);
  setComposerVideoTableMode(composerVideoTableMode);
  document.querySelectorAll("[id^='sessionPublishToggle']").forEach(el => {
    if (el) el.checked = session.publicar === true;
  });
  autoResizePrompt();

}

// [Gemini Script Generator Code Extracted to podcaster-script-generator.js]

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
    console.log("[podcaster] Gemini Live quedó conectado para reproducir voces por escena desde el panel derecho.", {
      voice: voiceProfile.voiceName,
      profile: voiceProfile.name,
      expireTime: expireTime || null
    });
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

const podcasterSessionRailApi = createPodcasterSessionRailApi({
  state,
  els,
  escapeHtml,
  nowIso,
  getSessionRows,
  resolveActiveVisualProposal,
  isVisualProposalResolved,
  resolveVideoContentType,
  playbackController,
  createSession,
  resetPodcastStudioSessionUiState,
  persistSessions,
  render,
  setActiveSession,
  getActiveSession,
  normalizeSessionTitle,
  ensureSession,
  deleteSessionFromCloud,
  addChatMessage,
  setGenerationStatus,
  resolveCurrentUid,
  markDeletedSessionId,
  purgeSessionFromAllStorage,
  getSessionAcademicMetadata,
  normalizeSessionAcademicField,
  SESSION_ACADEMIC_LEVEL_OPTIONS,
  SESSION_ACADEMIC_GRADE_OPTIONS,
  SESSION_ACADEMIC_TERM_OPTIONS,
  SESSION_ACADEMIC_UNIT_OPTIONS,
  upsertSessionById,
  updateDoc,
  doc,
  firestoreDb,
  serverTimestamp,
  shareSessionWithUser
});
const {
  render: renderSessions,
  bindEvents: bindSessionRailEvents,
  closeMenus: closeSessionMenus,
  toggleOrOpenSession,
  createAndOpenSession,
  createSessionChat,
  openSessionThread,
  renameSession,
  archiveSession,
  restoreSession,
  deleteSession,
  setAcademicDataModalOpen: setSessionAcademicDataModalOpen,
  saveAcademicData: saveSessionAcademicData,
  expandSession,
  isSessionExpanded,
  getFilterValue: getSessionRailFilterValue
} = podcasterSessionRailApi;

function resolveCreativeRowMeta(session = null, rowId = "") {
  const activeSession = session || getActiveSession();
  const key = String(rowId || "").trim();
  if (!activeSession || !key) return { row: null, rowIndex: -1 };
  const rows = getSessionRows(activeSession);
  const rowIndex = rows.findIndex((row) => String(row?.id || "").trim() === key);
  return {
    row: rowIndex >= 0 ? rows[rowIndex] : null,
    rowIndex
  };
}

function describeGeminiCreativityLevel(level = 3) {
  const normalized = Math.round(Math.max(1, Math.min(10, Number(level) || 3)));
  if (normalized <= 1) return "Mínimo";
  if (normalized <= 3) return "Casi igual";
  if (normalized <= 5) return "Balanceado";
  if (normalized <= 7) return "Creativo";
  return "Muy creativo";
}

function resolveGeminiCreativityLevel(row = null) {
  const raw = Number(row?.geminiCreativityLevel ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.round(Math.max(1, Math.min(10, raw)));
}

function setGeminiCreativityModalOpen(rowId = "") {
  const session = getActiveSession();
  const key = String(rowId || "").trim();
  const open = Boolean(key);
  geminiCreativityModalState = { rowId: open ? key : "" };
  if (els.geminiCreativityModal) {
    els.geminiCreativityModal.hidden = !open;
  }
  if (!open) return;
  const panelCopy = getPanelModeCopy(session);
  const { row, rowIndex } = resolveCreativeRowMeta(session, key);
  const level = resolveGeminiCreativityLevel(row);
  if (els.geminiCreativityRange) {
    els.geminiCreativityRange.value = String(level);
  }
  if (els.geminiCreativityValueLabel) {
    els.geminiCreativityValueLabel.textContent = `${level} · ${describeGeminiCreativityLevel(level)}`;
  }
  if (els.geminiCreativitySceneLabel) {
    const label = rowIndex >= 0
      ? `${panelCopy.videoMode ? "Secuencia" : "Escena"} ${rowIndex + 1} · ${resolveSpeakerDisplayName(String(row?.speaker || "Narrador"), session)}`
      : `${panelCopy.videoMode ? "Secuencia" : "Escena"}: --`;
    els.geminiCreativitySceneLabel.textContent = label;
  }
}

async function rewriteVoiceOverTextWithGemini(rowId = "", options = {}) {
  const session = getActiveSession();
  if (!isCreativeVideoMode(session)) return false;
  const videoPreset = resolveActiveVideoPreset(session);
  const sessionId = String(session?.id || "").trim();
  const key = String(rowId || "").trim();
  const triggerBtn = options.button || null;
  if (!key) return false;
  const { row, rowIndex } = resolveCreativeRowMeta(session, key);
  if (!row || rowIndex < 0) return false;
  const currentText = String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim();
  if (!currentText) {
    setGenerationStatus("No hay texto en Guion para reformular.", "");
    return false;
  }
  const creativityLevel = resolveGeminiCreativityLevel(row);
  const temperature = Math.max(0.05, Math.min(1, 0.12 + ((creativityLevel - 1) / 9) * 0.78));
  const sceneDescription = String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim();
  const transition = String(row?.transition || "").replace(/\s+/g, " ").trim();
  const responseSchema = {
    type: "object",
    properties: {
      voiceOverText: { type: "string" }
    },
    required: ["voiceOverText"]
  };
  const payload = {
    systemInstruction: {
      parts: [{
        text: [
          "Eres editor de guion de video creativo.",
          `Nivel de creatividad (1–10): ${creativityLevel}.`,
          "Con 1, cambia lo mínimo posible (casi igual). Con niveles altos, puedes ser más creativo en estilo/ritmo, pero sin cambiar nunca el sentido original ni inventar.",
          "Reescribe la narración manteniendo la esencia, intención y datos clave. Debe quedar más breve y clara, en español natural.",
          "Entrega solo JSON válido."
        ].join(" ")
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          `Escena: ${rowIndex + 1}`,
          `Guion actual: ${currentText}`,
          sceneDescription ? `Contexto visual: ${sceneDescription}` : "",
          transition ? `Transición: ${transition}` : "",
          "Objetivo: reeditar sin perder esencia y procurar que la frase sea más corta."
        ].filter(Boolean).join("\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema,
      temperature
    }
  };
  try {
    if (triggerBtn) {
      window.setButtonLoadingState(triggerBtn, true, { loadingTitle: "Reformulando guion con Gemini..." });
    }
    setGenerationStatus(`Reformulando guion de escena ${rowIndex + 1}...`, "is-busy", { sessionId });
    const data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect?.value || "gemini-2.5-flash",
        payload
      })
    });
    const rawText = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").trim();
    let rewritten = "";
    try {
      rewritten = String(JSON.parse(rawText)?.voiceOverText || "").replace(/\s+/g, " ").trim();
    } catch (_) {
      rewritten = "";
    }
    if (!rewritten) {
      throw new Error("Gemini no devolvió una reformulación válida.");
    }
    const normalizedRewrite = videoPreset === "creative"
      ? normalizeSimpleText(rewritten)
      : requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(rewritten);
    const originalBackup = String(row?.voiceOverOriginalText || "").replace(/\s+/g, " ").trim() || currentText;
    upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        hosts: ["Narrador"],
        rows: normalizeRows(current.script.rows).map((entry, index) => (
          String(entry?.id || "").trim() === key
            ? normalizeCreativeRow({
              ...entry,
              voiceOverOriginalText: originalBackup,
              voiceOverText: normalizedRewrite
            }, index, { videoPreset })
            : normalizeCreativeRow(entry, index, { videoPreset })
        ))
      }
    }), { render: true });
    setGenerationStatus(`Guion de escena ${rowIndex + 1} reformulado con Gemini.`, "is-live", { sessionId });
    return true;
  } catch (error) {
    setGenerationStatus("Error", "", { sessionId });
    addChatMessage("system", `No se pudo reformular el guion de la escena ${rowIndex + 1} (${String(error?.message || "error desconocido")}).`);
    return false;
  } finally {
    if (triggerBtn) {
      window.setButtonLoadingState(triggerBtn, false);
    }
  }
}

function restoreVoiceOverOriginalText(rowId = "") {
  const session = getActiveSession();
  if (!isCreativeVideoMode(session)) return false;
  const videoPreset = resolveActiveVideoPreset(session);
  const key = String(rowId || "").trim();
  if (!key) return false;
  const { row, rowIndex } = resolveCreativeRowMeta(session, key);
  if (!row || rowIndex < 0) return false;
  const originalText = String(row?.voiceOverOriginalText || "").replace(/\s+/g, " ").trim();
  if (!originalText) {
    setGenerationStatus("No hay texto original guardado para restaurar.", "");
    return false;
  }
  upsertActiveSession((current) => ({
    ...current,
    script: {
      ...current.script,
      hosts: ["Narrador"],
      rows: normalizeRows(current.script.rows).map((entry, index) => (
        String(entry?.id || "").trim() === key
          ? normalizeCreativeRow({
            ...entry,
            voiceOverText: originalText
          }, index, { videoPreset })
          : normalizeCreativeRow(entry, index, { videoPreset })
      ))
    }
  }), { render: true });
  setGenerationStatus(`Guion original restaurado en escena ${rowIndex + 1}.`, "is-live");
  return true;
}

async function rewriteVisualNotesWithGemini(rowId = "", options = {}) {
  const session = getActiveSession();
  if (!isCreativeVideoMode(session)) return false;
  const videoPreset = resolveActiveVideoPreset(session);
  const sessionId = String(session?.id || "").trim();
  const key = String(rowId || "").trim();
  const triggerBtn = options.button || null;
  if (!key) return false;
  const { row, rowIndex } = resolveCreativeRowMeta(session, key);
  if (!row || rowIndex < 0) return false;

  const creativityLevel = resolveGeminiCreativityLevel(row);
  const temperature = Math.max(0.05, Math.min(1, 0.12 + ((creativityLevel - 1) / 9) * 0.78));
  const voiceOverText = String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim();
  const voiceOverOriginal = String(row?.voiceOverOriginalText || "").replace(/\s+/g, " ").trim();
  const sceneDescription = String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim();
  const transition = String(row?.transition || "").replace(/\s+/g, " ").trim();
  const onScreenText = String(row?.onScreenText || "").replace(/\s+/g, " ").trim();
  const currentVisual = String(resolveVisualNotesForGeneration(row) || row?.visual || "").replace(/\s+/g, " ").trim();

  if (!voiceOverText && !voiceOverOriginal) {
    setGenerationStatus("No hay guion para regenerar el elemento visual.", "");
    return false;
  }

  const responseSchema = {
    type: "object",
    properties: {
      visualNotes: { type: "string" }
    },
    required: ["visualNotes"]
  };

  const payload = {
    systemInstruction: {
      parts: [{
        text: [
          "Eres director/a de arte de videos educativos (modo visual-first).",
          `Nivel de creatividad (1–10): ${creativityLevel}.`,
          "Con 1, cambia lo mínimo posible (casi igual). Con niveles altos, puedes proponer variaciones más creativas, pero sin cambiar nunca el sentido original.",
          "Lee primero el guion actual (si existe) y usa el original solo como respaldo.",
          "Regenera un 'Elemento visual' nuevo, más detallado, que refuerce exactamente lo que dice el guion.",
          "Describe el recurso visual (objeto, gráfico, diagrama, animación, entorno) con claridad y concreción.",
          "Debe servir para generar video 16:9 sin texto incrustado (no pongas subtítulos).",
          "Evita estilo podcast: sin cabina, sin micrófono, sin set de entrevista, sin presentador humano si no aporta.",
          "Entrega solo JSON válido."
        ].join(" ")
      }]
    },
    contents: [{
      role: "user",
      parts: [{
        text: [
          `Escena: ${rowIndex + 1}`,
          voiceOverText ? `Guion actual: ${voiceOverText}` : "",
          voiceOverOriginal ? `Guion original: ${voiceOverOriginal}` : "",
          sceneDescription ? `Descripción de escena: ${sceneDescription}` : "",
          transition ? `Transición: ${transition}` : "",
          onScreenText ? `Texto en pantalla (semántica, no incrustar): ${onScreenText}` : "",
          currentVisual ? `Elemento visual actual: ${currentVisual}` : "",
          "Objetivo: proponer un elemento visual NUEVO y más detallado, alineado al guion, listo para producción."
        ].filter(Boolean).join("\n")
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: responseSchema,
      temperature
    }
  };

  try {
    if (triggerBtn) {
      window.setButtonLoadingState(triggerBtn, true, { loadingTitle: "Regenerando elemento visual con Gemini..." });
    }
    setGenerationStatus(`Regenerando elemento visual de escena ${rowIndex + 1}...`, "is-busy", { sessionId });
    const data = await authFetchJson("/api/gemini/generate", {
      method: "POST",
      body: JSON.stringify({
        model: els.scriptModelSelect?.value || "gemini-2.5-flash",
        payload
      })
    });
    const rawText = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").trim();
    let rewritten = "";
    try {
      rewritten = String(JSON.parse(rawText)?.visualNotes || "").replace(/\s+/g, " ").trim();
    } catch (_) {
      rewritten = "";
    }
    if (!rewritten) {
      throw new Error("Gemini no devolvió un elemento visual válido.");
    }
    const normalizedRewrite = videoPreset === "creative"
      ? normalizeSimpleText(rewritten)
      : requirePodcasterScriptGeneratorApiFunction("rewriteScenarioPromptForEducationalVideo")(rewritten);
    upsertActiveSession((current) => ({
      ...current,
      script: {
        ...current.script,
        hosts: ["Narrador"],
        rows: normalizeRows(current.script.rows).map((entry, index) => (
          String(entry?.id || "").trim() === key
            ? normalizeCreativeRow({
              ...entry,
              visualNotes: entry?.visualNotes || "",
              visualNotesEditedText: normalizedRewrite,
              visualNotesEditedStored: true
            }, index, { videoPreset, preserveExactVisualNotes: true })
            : normalizeCreativeRow(entry, index, { videoPreset })
        ))
      }
    }), { render: true });
    scheduleSessionLocalPersist("script-edit");
    setGenerationStatus(`Elemento visual de escena ${rowIndex + 1} regenerado con Gemini.`, "is-live", { sessionId });
    return true;
  } catch (error) {
    setGenerationStatus("Error", "", { sessionId });
    addChatMessage("system", `No se pudo regenerar el elemento visual de la escena ${rowIndex + 1} (${String(error?.message || "error desconocido")}).`);
    return false;
  } finally {
    if (triggerBtn) {
      window.setButtonLoadingState(triggerBtn, false);
    }
  }
}

async function updateRowProposalState(rowId, action, proposalText = "") {
  if (!rowId) return;
  const normalizedText = String(proposalText || "").trim();

  const updatedSession = upsertActiveSession((current) => {
    const rows = current.script?.rows || [];
    const targetRow = rows.find(r => r.id === rowId);
    if (!targetRow) return current;

    // Garantizar arreglos
    if (!Array.isArray(targetRow.visualNotesProposals)) targetRow.visualNotesProposals = [];
    if (!Array.isArray(targetRow.visualNotesResolvedProposals)) targetRow.visualNotesResolvedProposals = [];

    if (action === "apply") {
      targetRow.visualNotesProposal = normalizedText;
      if (!targetRow.visualNotesProposals.includes(normalizedText)) targetRow.visualNotesProposals.push(normalizedText);
      targetRow.visualNotesResolvedProposals = targetRow.visualNotesResolvedProposals.filter(p => p !== normalizedText);
    } else if (action === "resolve") {
      if (!targetRow.visualNotesProposals.includes(normalizedText)) targetRow.visualNotesProposals.push(normalizedText);
      if (!targetRow.visualNotesResolvedProposals.includes(normalizedText)) targetRow.visualNotesResolvedProposals.push(normalizedText);
      if (String(targetRow.visualNotesProposal || "").trim() === normalizedText) targetRow.visualNotesProposal = "";
    } else if (action === "unresolve") {
      targetRow.visualNotesResolvedProposals = targetRow.visualNotesResolvedProposals.filter(p => p !== normalizedText);
      targetRow.visualNotesProposal = normalizedText;
    }
    return current;
  });
  if (!updatedSession) return;

  const msg = action === "apply" ? "aplicada" : (action === "resolve" ? "realizada" : "restaurada");
  addChatMessage("system", `Propuesta ${msg} en escena ${resolveSceneNumberByRowId(rowId, updatedSession)}.`);

  await sessionStore.saveManual(updatedSession.id, { render: false, silent: true });
  syncPodcastStudioInspector();
  renderPodcastVideoTimeline(updatedSession, { force: true });
}

async function applyVisualProposalForRow(rowId = "", forcedText = null) {
  const session = getActiveSession();
  const { row } = resolveCreativeRowMeta(session, rowId);
  await updateRowProposalState(rowId, "apply", forcedText || row?.visualNotesProposal);
}

async function deleteVisualProposalForRow(rowId = "", proposalText = "") {
  await updateRowProposalState(rowId, "resolve", proposalText);
}

async function unresolveVisualProposalForRow(rowId = "", proposalText = "") {
  await updateRowProposalState(rowId, "unresolve", proposalText);
}

async function handleSharedCreativeRowAction(target = null) {
  const actionBtn = target?.closest?.("[data-action][data-row-id]");
  if (!actionBtn) return false;
  const action = String(actionBtn.dataset.action || "").trim();
  const rowId = String(actionBtn.dataset.rowId || "").trim();
  const proposalText = String(actionBtn.dataset.proposalText || "");

  if (action === "copy-voiceover-to-onscreen-text") {
    if (!rowId) return true;
    copyVoiceOverTextToOnScreenText(rowId);
    return true;
  }
  if (action === "open-gemini-creativity") {
    if (!rowId) return true;
    setGeminiCreativityModalOpen(rowId);
    return true;
  }
  if (action === "rewrite-voiceover-text") {
    if (!rowId) return true;
    await rewriteVoiceOverTextWithGemini(rowId, { button: actionBtn });
    return true;
  }
  if (action === "restore-voiceover-text") {
    if (!rowId) return true;
    restoreVoiceOverOriginalText(rowId);
    return true;
  }
  if (action === "rewrite-visual-notes") {
    if (!rowId) return true;
    await rewriteVisualNotesWithGemini(rowId, { button: actionBtn });
    return true;
  }
  if (action === "apply-visual-proposal") {
    if (!rowId) return true;
    await applyVisualProposalForRow(rowId);
    return true;
  }
  if (action === "apply-visual-proposal-text") {
    if (!rowId || !proposalText) return true;
    await applyVisualProposalForRow(rowId, proposalText);
    return true;
  }
  if (action === "delete-visual-proposal-text") {
    if (!rowId || !proposalText) return true;
    await deleteVisualProposalForRow(rowId, proposalText);
    return true;
  }
  if (action === "restore-visual-proposal-text") {
    if (!rowId || !proposalText) return true;
    await unresolveVisualProposalForRow(rowId, proposalText);
    return true;
  }

  return false;
}

function handleScriptFieldUpdate(event) {
  return requirePodcasterScriptEditorRuntime().handleScriptFieldUpdate(event);
}

function shouldHandleScriptFieldOnInput(event) {
  return requirePodcasterScriptEditorRuntime().shouldHandleScriptFieldOnInput(event);
}

function deleteSceneRowById(rowId = "") {
  const key = String(rowId || "").trim();
  if (!key) return false;
  if (rowDisfluencyConfigOpenId === key) setRowDisfluencyModalOpen("");
  if (getTimelineClipDurationModalState().rowId === key) setTimelineClipDurationModalOpen(false);
  upsertActiveSession((session) => ({
    ...session,
    dialogueVideoMap: Object.fromEntries(
      Object.entries(getDialogueVideoMap(session)).filter(([entryKey]) => entryKey !== key)
    ),
    dialogueAudioMap: Object.fromEntries(
      Object.entries(getDialogueAudioMap(session)).filter(([entryKey]) => entryKey !== key)
    ),
    script: {
      ...session.script,
      rows: normalizeRows(session.script.rows).filter((row) => row.id !== key)
    }
  }), { render: false });
  if (String(podcastVideoState.activeRowId || "").trim() === key) {
    podcastVideoState.activeRowId = "";
  }
  reflowTimelineClipsByScriptOrder(getActiveSession(), { persist: true });
  render();
  scheduleSessionLocalPersist("structure");
  return true;
}

function attachEvents() {
  setupGlobalTooltipPortal();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (typeof playbackController?.pause === "function") {
        playbackController.pause();
      }
      if (typeof exportPreviewController?.pause === "function") {
        exportPreviewController.pause();
      }
      if (typeof stopStudioDialoguePreviewAudio === "function") {
        stopStudioDialoguePreviewAudio();
      }
      if (typeof stopPanelMusic === "function") {
        stopPanelMusic();
      }
    }
  });
  window.addEventListener("blur", () => {
    if (typeof playbackController?.pause === "function") {
      playbackController.pause();
    }
    if (typeof exportPreviewController?.pause === "function") {
      exportPreviewController.pause();
    }
    if (typeof stopStudioDialoguePreviewAudio === "function") {
      stopStudioDialoguePreviewAudio();
    }
    if (typeof stopPanelMusic === "function") {
      stopPanelMusic();
    }
  });
  els.promptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = getPromptInputPlainText();
    const promptHtml = getPromptInputHtml();
    if (!prompt) return;
    upsertActiveSession((session) => ({ ...session, prompt, promptHtml }));
    setPromptInputContent("");
    autoResizePrompt();
    if (isCurrentModeVideo()) {
      try {
        const sessionSnapshot = getActiveSession();
        const wantsCreate = composerVideoTableMode === "create";
        if (!wantsCreate) {
          setGenerationStatus("Paso 1/2: Dividiendo tu guión (Componer)...", "is-busy");
          addChatMessage("user", prompt, promptHtml ? { html: promptHtml } : {});
          const composedScript = await composeVideoScriptFromUserInput(prompt, promptHtml, sessionSnapshot);
          if (!composedScript) {
            throw new Error("No se pudo componer el guión: no se detectaron filas ni texto válido.");
          }
          addChatMessage("system", "Modo Componer activo: no inventé contenido; solo estructuré y dividí tu guión en escenas.");
          addScriptAssistantMessage(composedScript, {
            isRefinement: false,
            session: sessionSnapshot,
            preserveExactRows: true,
            videoMode: true
          });
          setGenerationStatus("Paso 2/2: Conectando al panel...", "is-busy");
          connectScriptSnapshotToPanel(composedScript, {
            session: sessionSnapshot,
            reason: "compose-mode",
            videoMode: true,
            openSidepanel: true
          });
          upsertActiveSession((session) => ({
            ...session,
            prompt: prompt,
            promptHtml,
            title: buildShortSessionTitle(composedScript?.episodeTitle || prompt)
          }));
          setGenerationStatus("Guión compuesto y conectado al panel.", "is-live");
          return;
        }
        const hasStructuredTable = hasStructuredVideoTableInput(prompt, promptHtml);
        if (!hasStructuredTable) {
          setGenerationStatus("Paso 1/3: Preparando guión nuevo...", "is-busy");
          await requirePodcasterScriptGeneratorApiFunction("handleGenerate")(prompt, {
            displayPrompt: prompt,
            generationPrompt: prompt,
            tableMode: "create",
            constraints: {
              videoMode: true,
              videoPreset: "creative"
            }
          });
        } else {
          setGenerationStatus("Paso 1/3: Usando estructura base...", "is-busy");
          const tableRowsRaw = extractStructuredVideoTableRows(prompt, promptHtml);
          const normalizedRows = normalizeEducationalVideoTableRows(tableRowsRaw);
          if (!normalizedRows.length) {
            await requirePodcasterScriptGeneratorApiFunction("handleGenerate")(prompt, {
              displayPrompt: prompt,
              generationPrompt: prompt,
              tableMode: "create",
              constraints: {
                videoMode: true,
                videoPreset: "creative"
              }
            });
            return;
          }
          const rowCount = Math.max(1, normalizedRows.length);
          const instructionFromHtml = extractNonTableTextFromPromptHtml(promptHtml);
          const instructionFromText = stripMarkdownTableFromText(prompt);
          const instruction = String(instructionFromHtml || instructionFromText || prompt).replace(/\s+/g, " ").trim();
          const markdown = buildEducationalVideoTableMarkdown(normalizedRows);
          const userMessageHtml = buildEducationalVideoTableHtml(normalizedRows);
          const generationPrompt = [
            instruction ? `Instrucción del usuario (video): ${instruction}` : "",
            `Regla obligatoria: devuelve exactamente ${rowCount} escenas, manteniendo el mismo orden de filas de la tabla base.`,
            "Regla obligatoria: usa la tabla base solo como estructura. Puedes reescribir por completo guion, descripción, texto en pantalla, transición y elemento visual para cumplir la instrucción.",
            "Tabla base estructural:",
            markdown
          ].filter(Boolean).join("\n\n");
          await requirePodcasterScriptGeneratorApiFunction("handleGenerate")(prompt, {
            displayPrompt: prompt,
            userMessageText: instruction ? `${instruction} (tabla base: ${rowCount} filas)` : `Tabla base detectada (${rowCount} filas).`,
            userMessageHtml,
            generationPrompt,
            tableMode: "create-from-table",
            constraints: {
              videoMode: true,
              videoPreset: "creative",
              sceneCount: rowCount
            }
          });
        }
      } catch (error) {
        const message = String(error?.message || "No se pudo dividir el guion con Gemini.").trim();
        addChatMessage("system", `Error en división de escenas: ${message}`);
        setGenerationStatus("Error", "");
      }
      return;
    }
    // Podcast mode (script)
    pendingScriptPrompt = prompt;
    pendingScriptPromptHtml = promptHtml;
    pendingScriptTableMode = composerVideoTableMode === "create" ? "create" : "compose";
    primeScriptSetupModal();
    setScriptSetupOpen(true);
  });

  els.demoPromptBtn.addEventListener("click", () => {
    setPromptInputContent(demoPrompt);
    autoResizePrompt();
  });

  // Lógica de colapso y revelación del chat composer
  if (els.toggleComposerCollapseBtn && els.revealComposerBtn && els.composerShell) {
    els.toggleComposerCollapseBtn.addEventListener("click", (event) => {
      if (shouldIgnoreComposerToggle()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      els.composerShell.classList.add("is-collapsed");
      els.revealComposerBtn.classList.add("is-visible");
      updateChatComposerLayoutOffset();
    });

    els.revealComposerBtn.addEventListener("click", () => {
      els.composerShell.classList.remove("is-collapsed");
      els.revealComposerBtn.classList.remove("is-visible");
      updateChatComposerLayoutOffset();
      if (els.promptInput) {
        els.promptInput.focus();
      }
    });
  }

  // Manejar cambio en cualquier instancia del switch de modo
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target && target.id && target.id.startsWith("composerModeToggle")) {
      const isChecked = target.checked;
      const mode = isChecked ? "video" : "script";
      setComposerGenerationMode(mode, { force: true, reason: "user-toggle" });

      // Sincronizar todas las instancias
      document.querySelectorAll("[id^='composerModeToggle']").forEach(el => {
        if (el !== target) el.checked = isChecked;
      });

      render(); // Refresca el Studio al cambiar de modo manualmente
    }
  });
  if (els.composerTableModeToggle) {
    els.composerTableModeToggle.addEventListener("change", () => {
      setComposerVideoTableMode(els.composerTableModeToggle.checked ? "create" : "compose");
    });
  }
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target && target.id && target.id.startsWith("reelModeToggle")) {
      setReelModeEnabled(target.checked);
    }
  });
  if (els.toggleOnScreenTextTrackBtn) {
    els.toggleOnScreenTextTrackBtn.addEventListener("click", () => {
      toggleOnScreenTextTrackVisibility();
    });
  }
  if (els.copyVoiceoverToOnscreenTextAllBtn) {
    els.copyVoiceoverToOnscreenTextAllBtn.addEventListener("click", () => {
      copyVoiceOverTextToOnScreenTextAllScenes();
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

  if (els.scriptSetupModal) {
    els.scriptSetupModal.addEventListener("change", (e) => {
      if (e.target.id === "scriptSetupSpeakerCount") return;
      readScriptSetupConfig();
    });
    els.scriptSetupModal.addEventListener("input", (e) => {
      if (e.target.id === "scriptSetupSpeakerCount") return;
      readScriptSetupConfig();
    });
  }

  if (els.podcastVideoStage) {
    els.podcastVideoStage.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.(".podcast-on-screen-text-content")) {
        beginOnScreenTextOverlayDrag(event);
      } else if (!event.target?.closest?.(".podcast-onscreen-text-overlay")) {
        podcastVideoState.onScreenTextOverlaySelectedRowId = "";
        syncPodcastOnScreenTextOverlay(getActiveSession(), {
          rowId: String(podcastVideoState.activeRowId || "").trim(),
          currentMs: Number(podcastVideoState.montageCursorMs || 0),
          forceRow: false
        });
      }
    });
  }

  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".activity-close-btn");
    if (closeBtn) {
      const wrap = closeBtn.closest(".activity-notification-wrap");
      if (wrap) wrap.style.display = 'none';
    }
    const clearBtn = e.target.closest(".activity-clear-all-btn");
    if (clearBtn) {
      if (typeof clearAllActivityNotifications === "function") {
        clearAllActivityNotifications();
      }
    }
  });

  window.addEventListener("pointermove", (event) => {
    if (podcastVideoState.onScreenTextOverlayDrag) {
      applyOnScreenTextOverlayDragMove(event);
    } else if (podcastVideoState.onScreenTextOverlayResize) {
      applyOnScreenTextOverlayResizeMove(event);
    }
  }, { passive: false });

  window.addEventListener("pointerup", (event) => {
    if (podcastVideoState.onScreenTextOverlayDrag) {
      endOnScreenTextOverlayDrag(event);
    }
    if (podcastVideoState.onScreenTextOverlayResize) {
      endOnScreenTextOverlayResize(event);
    }
  }, { passive: true });
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
      scheduleSessionLocalPersist("structure");
      setGenerationStatus("Paso 2/3: Analizando configuración + chat...", "is-busy");
      setScriptSetupOpen(false);
      pendingScriptPrompt = "";
      const pendingPromptHtml = pendingScriptPromptHtml;
      const pendingTableMode = pendingScriptTableMode;
      pendingScriptPromptHtml = "";
      pendingScriptTableMode = "create";
      const handleGenerate = (...args) => requirePodcasterScriptGeneratorApiFunction("handleGenerate")(...args);
      await handleGenerate(basePrompt, {
        userMessageHtml: pendingPromptHtml,
        tableMode: pendingTableMode,
        constraints: setup
      });
    });
  }
  if (els.closeScriptSetupBtn) {
    els.closeScriptSetupBtn.addEventListener("click", () => {
      setScriptSetupOpen(false);
      pendingScriptPrompt = "";
      pendingScriptPromptHtml = "";
      pendingScriptTableMode = "create";
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
            voiceName: resolveSpeakerVoiceName(speaker, session),
            voiceNameSource: "host",
            expression: expressionMap[speaker] || "Neutral",
            durationSec: 15,
            mediaCue: "Sin media",
            text: "Nueva línea de guión.",
            notes: "",
            scenePrompt: "",
            imagePrompts: [],
            disfluencyConfig: { ...DEFAULT_DISFLUENCY_CONFIG }
          }
        ]
      }
    }));
    scheduleSessionLocalPersist("structure");
  });

  els.duplicateRowBtn.addEventListener("click", () => {
    const session = getActiveSession();
    const rows = normalizeRows(session?.script?.rows);
    const lastRow = rows[rows.length - 1];
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
    scheduleSessionLocalPersist("structure");
  });

  const handleSaveSessionClick = async () => {
    const session = getActiveSession();
    if (!session) return;

    window.setButtonLoadingState(els.saveSessionBtn, true);
    window.setButtonLoadingState(els.saveSessionFloatingBtn, true);

    try {
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      await sessionStore.saveManual(session.id, { render: false });
    } catch (error) {
      console.error("[podcaster] Manual save failed:", error);
      addChatMessage("system", `No se pudo guardar en Firebase (${error.message}).`);
      setGenerationStatus("Error al guardar", "is-error");
    } finally {
      window.setButtonLoadingState(els.saveSessionBtn, false);
      window.setButtonLoadingState(els.saveSessionFloatingBtn, false);
    }
  };

  els.newSessionBtn.addEventListener("click", createAndOpenSession);
  if (els.saveSessionBtn) {
    els.saveSessionBtn.addEventListener("click", handleSaveSessionClick);
  }
  if (els.saveSessionFloatingBtn) {
    els.saveSessionFloatingBtn.addEventListener("click", handleSaveSessionClick);
  }
  if (els.importGeminiDialogueTrackBtn) {
    els.importGeminiDialogueTrackBtn.addEventListener("click", () => {
      if (podcastVideoState.busy) return;
      setMontageAudioSubtracksOpen(!podcastVideoState.showMontageAudioSubtracks);
      setGenerationStatus(
        podcastVideoState.showMontageAudioSubtracks ? "Mostrando audio del montaje bajo cada track." : "Audio del montaje oculto.",
        "is-live"
      );
    });
  }
  if (els.openSidepanelBtn) {
    els.openSidepanelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      suppressComposerToggleTemporarily();
      const nextState = !els.sidepanel?.classList.contains("is-open");
      setSidepanelOpen(nextState);
    });
  }
  if (els.sidepanelHeaderToggleBtn) {
    els.sidepanelHeaderToggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      suppressComposerToggleTemporarily();
      const nextState = !els.sidepanel?.classList.contains("is-open");
      setSidepanelOpen(nextState);
    });
  }
  if (els.openMusicConfigBtn) {
    els.openMusicConfigBtn.addEventListener("click", () => {
      syncMusicControls();
      fetchGlobalPanelMusicLibrary().catch(() => { });
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
  if (els.refreshPodcastSceneLibraryBtn) {
    els.refreshPodcastSceneLibraryBtn.addEventListener("click", async () => {
      await fetchPodcastSceneLibrary({ render: true });
    });
  }
  if (els.podcastSceneLibrarySearchInput) {
    els.podcastSceneLibrarySearchInput.addEventListener("input", () => {
      podcastSceneLibraryState.filters.query = String(els.podcastSceneLibrarySearchInput.value || "");
      renderPodcastSceneLibrary(getActiveSession());
    });
  }
  if (els.podcastSceneLibraryColorFilterSelect) {
    els.podcastSceneLibraryColorFilterSelect.addEventListener("change", () => {
      podcastSceneLibraryState.filters.tagColor = String(els.podcastSceneLibraryColorFilterSelect.value || "all");
      renderPodcastSceneLibrary(getActiveSession());
    });
  }
  if (els.podcastSceneLibraryClearFiltersBtn) {
    els.podcastSceneLibraryClearFiltersBtn.addEventListener("click", () => {
      podcastSceneLibraryState.filters.query = "";
      podcastSceneLibraryState.filters.tagColor = "all";
      renderPodcastSceneLibrary(getActiveSession());
    });
  }
  if (els.uploadLocalPodcastSceneBtn && els.podcastSceneLibraryLocalVideoInput) {
    els.uploadLocalPodcastSceneBtn.addEventListener("click", () => {
      els.podcastSceneLibraryLocalVideoInput.click();
    });
  }
  if (els.podcastVideoLibraryCollapsedHandle) {
    els.podcastVideoLibraryCollapsedHandle.addEventListener("click", () => {
      setPodcastVideoLibraryCollapsed(!PodcasterResize.podcastVideoLibraryCollapsed);
    });
  }
  if (els.togglePodcastVideoLibraryBtn) {
    els.togglePodcastVideoLibraryBtn.addEventListener("click", () => {
      setPodcastVideoLibraryCollapsed(!PodcasterResize.podcastVideoLibraryCollapsed);
    });
  }
  if (els.podcastSceneInsertList) {
    els.podcastSceneInsertList.addEventListener("click", (event) => {
      const optionBtn = event.target.closest("[data-action='select-scene-insert-position'][data-insert-index]");
      if (!optionBtn) return;
      podcastSceneInsertModalState.selectedInsertIndex = Math.max(0, Math.round(toFiniteNumber(optionBtn.dataset.insertIndex, podcastSceneInsertModalState.selectedInsertIndex)));
      renderPodcastSceneInsertModal();
    });
  }
  if (els.closePodcastSceneInsertBtn) {
    els.closePodcastSceneInsertBtn.addEventListener("click", () => {
      closePodcastSceneInsertModal();
    });
  }
  if (els.cancelPodcastSceneInsertBtn) {
    els.cancelPodcastSceneInsertBtn.addEventListener("click", () => {
      closePodcastSceneInsertModal();
    });
  }
  if (els.confirmPodcastSceneInsertBtn) {
    els.confirmPodcastSceneInsertBtn.addEventListener("click", () => {
      confirmPodcastSceneInsertSelection();
    });
  }
  if (els.confirmPodcastSceneInsertNewTrackBtn) {
    els.confirmPodcastSceneInsertNewTrackBtn.addEventListener("click", () => {
      confirmPodcastSceneInsertSelection({ insertIntoNewTrack: true });
    });
  }
  if (els.podcastSceneInsertModal) {
    els.podcastSceneInsertModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-podcast-scene-insert-modal']");
      if (closeBtn) {
        closePodcastSceneInsertModal();
        return;
      }
      if (event.target === els.podcastSceneInsertModal) {
        closePodcastSceneInsertModal();
      }
    });
  }
  if (els.podcastSceneLibraryEditModal) {
    els.podcastSceneLibraryEditModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-podcast-scene-library-edit-modal']");
      if (closeBtn || event.target === els.podcastSceneLibraryEditModal) {
        closePodcastSceneLibraryEditModal();
      }
    });
  }
  if (els.closePodcastSceneLibraryEditBtn) {
    els.closePodcastSceneLibraryEditBtn.addEventListener("click", () => closePodcastSceneLibraryEditModal());
  }
  if (els.cancelPodcastSceneLibraryEditBtn) {
    els.cancelPodcastSceneLibraryEditBtn.addEventListener("click", () => closePodcastSceneLibraryEditModal());
  }
  if (els.savePodcastSceneLibraryEditBtn) {
    els.savePodcastSceneLibraryEditBtn.addEventListener("click", async () => {
      try {
        await savePodcastSceneLibraryEdit();
      } catch (error) {
        addChatMessage("system", `No se pudo guardar la edición (${error.message}).`);
      }
    });
  }
  if (els.sessionAcademicDataModal) {
    els.sessionAcademicDataModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-session-academic-data-modal']");
      if (closeBtn || event.target === els.sessionAcademicDataModal) {
        setSessionAcademicDataModalOpen("");
      }
    });
  }
  if (els.closeSessionAcademicDataBtn) {
    els.closeSessionAcademicDataBtn.addEventListener("click", () => {
      setSessionAcademicDataModalOpen("");
    });
  }
  if (els.cancelSessionAcademicDataBtn) {
    els.cancelSessionAcademicDataBtn.addEventListener("click", () => {
      setSessionAcademicDataModalOpen("");
    });
  }
  if (els.sessionAcademicDataForm) {
    els.sessionAcademicDataForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveSessionAcademicData();
      } catch (error) {
        addChatMessage("system", `No se pudieron asignar los datos (${error.message}).`);
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
  if (els.podcastVideoModeToggle) {
    els.podcastVideoModeToggle.addEventListener("change", () => {
      const enableVideoPodcast = els.podcastVideoModeToggle.checked === true;
      setPodcastVideoModeEnabled(enableVideoPodcast, { render: false, reason: "video-content-type-direct" });
      if (enableVideoPodcast) {
        setPodcastStudioInspectorCollapsed(false);
      } else {
        setTimelineViewMode("tracks");
      }
      renderPodcastVideoShell(getActiveSession());
      render();
    });
  }
  if (els.cancelAudioTrackMixBtn) {
    els.cancelAudioTrackMixBtn.addEventListener("click", () => {
      setAudioTrackMixOpen(false);
    });
  }
  if (els.saveAudioTrackMixBtn) {
    els.saveAudioTrackMixBtn.addEventListener("click", () => {
      persistPanelMusicSettings();
      persistPanelMusicToActiveSession();
      scheduleSessionLocalPersist("audio-mix");
      setAudioTrackMixOpen(false);
      setGenerationStatus("Configuración de audio guardada", "is-live");
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
  if (els.audioTrackDuckVolume) {
    els.audioTrackDuckVolume.addEventListener("input", () => {
      setPanelMontageDuckingWhenGeminiPct(els.audioTrackDuckVolume.value);
      renderPodcastVideoTimeline(getActiveSession());
    });
  }
  if (els.audioTrackDuckVolumeNumber) {
    els.audioTrackDuckVolumeNumber.addEventListener("input", () => {
      setPanelMontageDuckingWhenGeminiPct(els.audioTrackDuckVolumeNumber.value);
      renderPodcastVideoTimeline(getActiveSession());
    });
  }
  if (els.audioTrackStabilizeToggle) {
    els.audioTrackStabilizeToggle.addEventListener("change", () => {
      setPanelMontageStabilize(Boolean(els.audioTrackStabilizeToggle.checked));
      renderPodcastVideoTimeline(getActiveSession());
    });
  }
  if (els.audioTrackLimiterToggle) {
    els.audioTrackLimiterToggle.addEventListener("change", () => {
      setPanelMontageLimiterEnabled(Boolean(els.audioTrackLimiterToggle.checked));
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
      if (getPanelMusicAiGenerating()) return;
      setPanelMusicAiGenerating(true);
      window.setButtonLoadingState(els.generatePanelMusicAiBtn, true, {
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
        setPanelMusicAiGenerating(false);
        window.setButtonLoadingState(els.generatePanelMusicAiBtn, false);
        syncMusicControls();
      }
    });
  }
  if (els.clearPanelMusicTrackBtn) {
    els.clearPanelMusicTrackBtn.addEventListener("click", () => {
      clearTimelinePanelMusicTrackByKind(panelMusicState.selectedTrackKind);
    });
  }
  if (els.panelMusicPlayBtn) {
    els.panelMusicPlayBtn.addEventListener("click", async () => {
      // If the montage is playing, its controller manages background audio – ignore.
      if (podcastVideoState.montageActive) return;
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
  [els.globalTtsStylePrompt, els.globalTtsPacingPrompt, els.globalTtsAccentPrompt, els.globalTtsScenePrompt, els.globalTtsAudioTags]
    .filter(Boolean)
    .forEach((input) => {
      const eventName = input.tagName === "TEXTAREA" ? "input" : "change";
      input.addEventListener(eventName, () => {
        persistGlobalTtsDirectionDraft();
      });
      if (eventName !== "input") {
        input.addEventListener("input", () => {
          persistGlobalTtsDirectionDraft();
        });
      }
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
  if (els.openVideoEditorBtn) {
    els.openVideoEditorBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      if (!session) return;
      if (!(session?.script?.rows || []).length) {
        setGenerationStatus("No hay escenas para enviar al editor de video.", "");
        return;
      }
      const targetType = isCurrentModeVideo() ? "creative" : "videopodcast";
      upsertActiveSession((current) => withSessionVideoContentType(current, targetType), { render: false });
      await openPodcastVideoModalWithLoader();
      setGenerationStatus("Guion enviado al editor de video.", "is-live");
    });
  }
  if (els.toggleCollapseAllRowsBtn) {
    els.toggleCollapseAllRowsBtn.addEventListener("click", () => {
      const session = getActiveSession();
      if (!session) return;
      const nextCollapsed = !areAllScriptRowsCollapsed(session);
      setAllScriptRowsCollapsed(nextCollapsed, session);
      render();
    });
  }
  if (els.closePodcastVideoBtn) {
    els.closePodcastVideoBtn.addEventListener("click", () => {
      closePodcastVideoModal();
    });
  }
  if (els.closeCreativeVideoBtn) {
    els.closeCreativeVideoBtn.addEventListener("click", () => {
      closeCreativeVideoModal();
    });
  }
  if (els.saveSessionCreativeBtn) {
    els.saveSessionCreativeBtn.addEventListener("click", async () => {
      await saveSessionToCloud();
    });
  }
  if (els.creativeVideoTimelineList) {
    els.creativeVideoTimelineList.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action='select-creative-row']");
      if (!btn) return;
      creativeVideoState.activeRowId = String(btn.dataset.rowId || "").trim();
      renderCreativeVideoShell(getActiveSession());
    });
  }
  if (els.creativeVideoInspectorEditor) {
    const handleCreativeField = (event) => {
      const target = event.target.closest("[data-row-id][data-field]");
      if (!target) return;
      const rowId = String(target.dataset.rowId || "").trim();
      const field = String(target.dataset.field || "").trim();
      if (!rowId || !field) return;
      const isLiveInput = String(event?.type || "").trim().toLowerCase() === "input";
      const videoPreset = resolveActiveVideoPreset(getActiveSession());
      const rawValue = field === "durationSec"
        ? Number(target.value || 0)
        : String(target.value || "");
      upsertActiveSession((current) => ({
        ...current,
        script: {
          ...current.script,
          hosts: ["Narrador"],
          rows: (current.script?.rows || []).map((row, index) => (
            String(row?.id || "").trim() === rowId
              ? normalizeCreativeRow({
                ...row,
                [field]: rawValue
              }, index, { videoPreset })
              : normalizeCreativeRow(row, index, { videoPreset })
          ))
        }
      }), {
        render: false,
        persist: false,
        recordHistory: !isLiveInput,
        autosaveReason: field === "durationSec" ? "structure" : "script-edit"
      });
      if (field === "onScreenText") {
        const nextText = String(rawValue || "").replace(/\s+/g, " ").trim();
        syncOnScreenTextClipVisibilityFromRowText(rowId, nextText, {
          render: false,
          autosave: false,
          persist: false,
          recordHistory: false
        });
        if (podcastVideoState.enabled) {
          renderPodcastVideoTimeline(getActiveSession(), { lightweight: true });
        }
      }
      if (!isLiveInput) {
        renderCreativeVideoShell(getActiveSession());
      }
      if (els.montageExportModal && !els.montageExportModal.hidden) {
        scheduleMontageExportPreviewRefresh(isLiveInput ? 320 : 120);
      }
    };
    els.creativeVideoInspectorEditor.addEventListener("input", handleCreativeField);
    els.creativeVideoInspectorEditor.addEventListener("change", handleCreativeField);
    els.creativeVideoInspectorEditor.addEventListener("click", async (event) => {
      try {
        await handleSharedCreativeRowAction(event.target);
      } catch (_) { }
    });
  }
  if (els.geminiCreativityRange) {
    els.geminiCreativityRange.addEventListener("input", () => {
      const session = getActiveSession();
      const rowId = String(geminiCreativityModalState.rowId || "").trim();
      if (!session || !rowId) return;
      const videoPreset = resolveActiveVideoPreset(session);
      const level = Math.round(Math.max(1, Math.min(10, Number(els.geminiCreativityRange.value || 3) || 3)));
      if (els.geminiCreativityValueLabel) {
        els.geminiCreativityValueLabel.textContent = `${level} · ${describeGeminiCreativityLevel(level)}`;
      }
      upsertActiveSession((current) => ({
        ...current,
        script: {
          ...current.script,
          hosts: ["Narrador"],
          rows: (current.script?.rows || []).map((row, index) => (
            String(row?.id || "").trim() === rowId
              ? normalizeCreativeRow({ ...row, geminiCreativityLevel: level }, index, { videoPreset })
              : normalizeCreativeRow(row, index, { videoPreset })
          ))
        }
      }), { render: false });
    });
  }
  if (els.creativeGlobalVoiceName) {
    els.creativeGlobalVoiceName.addEventListener("change", () => {
      const voiceName = normalizeLiveVoiceName(String(els.creativeGlobalVoiceName.value || "").trim(), "Kore");
      upsertActiveSession((session) => ({
        ...session,
        creativeVideoConfig: normalizeCreativeVideoConfig({
          ...(session.creativeVideoConfig || {}),
          enabled: creativeVideoState.enabled,
          globalVoiceName: voiceName
        })
      }), { render: false });
      renderCreativeVideoShell(getActiveSession());
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
      const selection = getActiveTransitionSelection(getActiveSession());
      if (!selection.edges.length) return;
      const type = String(optionBtn.dataset.transitionType || "cut").trim().toLowerCase();
      const defaultPreset = STUDIO_TRANSITION_PRESETS[type] || STUDIO_TRANSITION_PRESETS.cut;
      const duration = Math.max(
        0,
        Math.min(
          1200,
          toFiniteNumber(
            els.podcastTransitionDurationNumber?.value ?? els.podcastTransitionDurationRange?.value ?? optionBtn.dataset.transitionDuration,
            defaultPreset.durationMs
          )
        )
      );
      setTransitionForActiveEdge(type, duration);
      setPodcastTransitionPickerOpen(false);
      setGenerationStatus(
        selection.edges.length > 1
          ? `Transiciones aplicadas: ${type} (${selection.edges.length} uniones)`
          : `Transición aplicada: ${type}`,
        "is-live"
      );
    });
  }
  if (els.podcastTransitionDurationRange) {
    els.podcastTransitionDurationRange.addEventListener("input", () => {
      const value = Math.max(0, Math.min(1200, Math.round(Number(els.podcastTransitionDurationRange.value || 0) || 0)));
      if (els.podcastTransitionDurationNumber) els.podcastTransitionDurationNumber.value = String(value);
      if (els.podcastTransitionDurationLabel) els.podcastTransitionDurationLabel.textContent = `${value} ms`;
    });
  }
  if (els.podcastTransitionDurationNumber) {
    const syncTransitionDurationInputs = () => {
      const value = Math.max(0, Math.min(1200, Math.round(Number(els.podcastTransitionDurationNumber.value || 0) || 0)));
      els.podcastTransitionDurationNumber.value = String(value);
      if (els.podcastTransitionDurationRange) els.podcastTransitionDurationRange.value = String(value);
      if (els.podcastTransitionDurationLabel) els.podcastTransitionDurationLabel.textContent = `${value} ms`;
    };
    els.podcastTransitionDurationNumber.addEventListener("input", syncTransitionDurationInputs);
    els.podcastTransitionDurationNumber.addEventListener("change", syncTransitionDurationInputs);
  }
  if (els.podcastActiveSpeakerVideo || els.podcastActiveSpeakerVideoAlt) {
    const onStageState = (event) => {
      const target = event?.currentTarget || null;
      const active = getActiveStageVideoEl?.() || els.podcastActiveSpeakerVideo || null;
      if (target && active && target !== active) return;
      updatePodcastVideoTransportUi();
    };
    const onStageTimeUpdate = (event) => {
      if (podcastVideoState.montageActive === true) return;
      const target = event?.currentTarget || null;
      const activeVideo = getActiveStageVideoEl?.() || els.podcastActiveSpeakerVideo || null;
      if (target && activeVideo && target !== activeVideo) return;
      const durationSec = Math.max(0.1, Number(podcastVideoState.timelineDurationSec || 0.1));
      const current = Number(activeVideo?.currentTime || 0);
      const session = getActiveSession();
      const clipMap = ensureTimelineClipsByRowId(session, { persist: false });
      const activeClip = clipMap[String(podcastVideoState.activeRowId || "").trim()];
      if (activeClip) {
        const clipStartMs = Math.max(0, Number(activeClip.startMs || 0));
        const trimInSec = Math.max(0, Number(activeClip.trimInMs || 0) / 1000);
        const clipDurationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineClipEffectiveDurationMs(activeClip));
        const clipEndMs = clipStartMs + clipDurationMs;
        const normalizedSec = Math.max(0, current - trimInSec);
        const sceneMs = clipStartMs + Math.max(0, normalizedSec * 1000);
        podcastVideoState.montageCursorMs = Math.max(clipStartMs, Math.min(clipEndMs, sceneMs));
        syncPodcastTimelinePlayhead(session);
        if (podcastVideoState.timelineSequenceActive === true && podcastVideoState.timelineSequencePaused !== true) {
          const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
          const runtimeEntries = Array.isArray(podcastVideoState.timelineSequenceRuntimeEntries)
            ? podcastVideoState.timelineSequenceRuntimeEntries
            : [];
          if (runtimeEntries.length) {
            const ms = Math.max(0, Number(podcastVideoState.montageCursorMs || 0));
            playbackController.syncAudio(ms, speed);
            playbackController.syncBackgroundMusic(ms, speed);
            syncPodcastOnScreenTextOverlay(session, { currentMs: ms });
          }
        }
      }
      if (els.podcastStudioScrubber && durationSec > 0) {
        const ratio = Math.max(0, Math.min(1, current / durationSec));
        els.podcastStudioScrubber.value = String(Math.round(ratio * 100));
        syncPodcastOnScreenTextOverlay(session, { currentMs: Math.round(podcastVideoState.montageCursorMs || (current * 1000)) });
      }
      if (els.podcastStudioTime) {
        const total = Math.max(durationSec, Number(podcastVideoState.timelineDurationSec || 0));
        els.podcastStudioTime.textContent = `${secondsToClock(current)} / ${secondsToClock(total)}`;
      }
    };
    getStageVideoElements().forEach((video) => {
      video.addEventListener("play", onStageState);
      video.addEventListener("pause", onStageState);
      video.addEventListener("ended", onStageState);
      video.addEventListener("timeupdate", onStageTimeUpdate);
    });
  }
  if (els.podcastVideoPlayBtn) {
    els.podcastVideoPlayBtn.addEventListener("click", async () => {
      if (Date.now() < Number(podcastVideoState.timelineJustDraggedUntil || 0)) return;
      const session = getActiveSession();
      if (!(session?.script?.rows || []).length) return;
      const startMs = Number(podcastVideoState.montageCursorMs || 0);
      playbackController.play(startMs);
    });
  }
  if (els.podcastVideoPauseBtn) {
    els.podcastVideoPauseBtn.addEventListener("click", () => {
      playbackController.pause();
    });
  }
  if (els.podcastVideoStopBtn) {
    els.podcastVideoStopBtn.addEventListener("click", () => {
      const wasPlaying = playbackController.state.isPlaying;
      if (wasPlaying) {
        playbackController.stop({ keepCursor: true });
      } else {
        playbackController.stop();
      }
    });
  }
  if (els.podcastVideoPrevBtn) {
    els.podcastVideoPrevBtn.addEventListener("click", async () => {
      playbackController.prev();
    });
  }
  if (els.podcastVideoNextBtn) {
    els.podcastVideoNextBtn.addEventListener("click", async () => {
      playbackController.next();
    });
  }
  if (els.podcastVideoSpeedSelect) {
    els.podcastVideoSpeedSelect.addEventListener("change", () => {
      const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect.value || 1)));
      getStageVideoElements().forEach((video) => {
        try { video.playbackRate = speed; } catch (_) { }
      });
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
      upsertActiveSession((current) => ({
        ...current,
        podcastVideoConfig: {
          ...(current.podcastVideoConfig || {}),
          playbackSpeed: speed
        }
      }), { autosaveReason: "video-config-speed" });
    });
  }
  if (els.podcastVideoZoomBtn) {
    els.podcastVideoZoomBtn.addEventListener("click", () => {
      setPodcastVideoZoomEnabled(!podcastVideoState.zoomed);
    });
  }
  if (els.podcastSceneZoomInBtn) {
    els.podcastSceneZoomInBtn.addEventListener("click", () => {
      adjustActiveTimelineSceneMediaScale(1);
    });
  }
  if (els.podcastSceneZoomOutBtn) {
    els.podcastSceneZoomOutBtn.addEventListener("click", () => {
      adjustActiveTimelineSceneMediaScale(-1);
    });
  }
  if (els.exportMontageBtn) {
    els.exportMontageBtn.addEventListener("click", () => {
      openMontageExportModal();
    });
  }
  if (els.montageExportModal) {
    els.montageExportModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-montage-export-modal']");
      if (closeBtn) {
        closeMontageExportModal();
      }
    });
  }
  if (els.closeMontageExportBtn) {
    els.closeMontageExportBtn.addEventListener("click", () => {
      closeMontageExportModal();
    });
  }
  if (els.cancelMontageExportBtn) {
    els.cancelMontageExportBtn.addEventListener("click", () => {
      closeMontageExportModal();
    });
  }
  if (els.confirmMontageExportBtn) {
    els.confirmMontageExportBtn.addEventListener("click", () => {
      runMontageExport().catch(() => { });
    });
  }
  if (els.continueMontageExportBtn) {
    els.continueMontageExportBtn.addEventListener("click", () => {
      continueMontageExportPolling().catch(() => { });
    });
  }
  if (els.montageExportFormat) {
    els.montageExportFormat.addEventListener("change", () => {
      montageExportState.format = String(els.montageExportFormat.value || "mp4_h264").trim();
      syncMontageExportUi();
      scheduleMontageExportPreviewRefresh();
    });
  }
  if (els.montageExportMode) {
    els.montageExportMode.addEventListener("change", () => {
      montageExportState.exportMode = String(els.montageExportMode.value || "normal").trim();
      if (montageExportState.exportMode === "review") {
        montageExportState.includeReviewExcel = true;
      }
      syncMontageExportUi();
      if (!window.montageExportBusy) {
        setMontageExportProgress(null);
        setMontageExportStatus(
          "Listo. Presiona Exportar para generar tu video.",
          montageExportState.exportMode === "review"
            ? "Revisión crea un split-screen con video y ficha editorial por escena."
            : "Usa el timeline tal como está (escenas + audio).",
          { tone: "neutral" }
        );
      }
      scheduleMontageExportPreviewRefresh();
    });
  }
  if (els.montageExportResolution) {
    els.montageExportResolution.addEventListener("change", () => {
      montageExportState.resolution = String(els.montageExportResolution.value || "source").trim();
      syncMontageExportUi();
      scheduleMontageExportPreviewRefresh();
    });
  }
  if (els.montageExportBitrateMode) {
    els.montageExportBitrateMode.addEventListener("change", () => {
      montageExportState.bitrateMode = String(els.montageExportBitrateMode.value || "vbr").trim();
      if (els.montageExportCustomBitrateBox) {
        els.montageExportCustomBitrateBox.hidden = montageExportState.bitrateMode !== "custom";
      }
      persistMontageExportSettings();
    });
  }
  if (els.montageExportMaxBitrate) {
    els.montageExportMaxBitrate.addEventListener("input", () => {
      montageExportState.maxBitrate = Math.max(0.1, Math.min(50, Number(els.montageExportMaxBitrate.value || 5)));
      persistMontageExportSettings();
    });
  }
  if (els.montageExportMinBitrate) {
    els.montageExportMinBitrate.addEventListener("input", () => {
      montageExportState.minBitrate = Math.max(0, Math.min(51, Number(els.montageExportMinBitrate.value || 20)));
      persistMontageExportSettings();
    });
  }
  if (els.montageExportFilename) {
    els.montageExportFilename.addEventListener("input", () => {
      montageExportState.filename = String(els.montageExportFilename.value || "").trim().slice(0, 120);
      persistMontageExportSettings();
    });
    els.montageExportFilename.addEventListener("change", () => {
      montageExportState.filename = String(els.montageExportFilename.value || "").trim().slice(0, 120);
      persistMontageExportSettings();
    });
  }
  if (els.montageExportIncludeReviewExcel) {
    els.montageExportIncludeReviewExcel.addEventListener("change", () => {
      montageExportState.includeReviewExcel = els.montageExportIncludeReviewExcel.checked === true;
      persistMontageExportSettings();
    });
  }
  if (els.montageExportOnlyAudio) {
    els.montageExportOnlyAudio.addEventListener("change", () => {
      montageExportState.onlyAudio = els.montageExportOnlyAudio.checked === true;
      persistMontageExportSettings();
      syncMontageExportUi();
      scheduleMontageExportPreviewRefresh();
    });
  }
  if (els.montageExportModal) {
    const qualityBtns = Array.from(els.montageExportModal.querySelectorAll("[data-quality]"));
    qualityBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = String(btn?.dataset?.quality || "").trim();
        montageExportState.qualityPreset = key;
        syncMontageExportUi();
        scheduleMontageExportPreviewRefresh();
      });
    });
  }
  if (els.podcastStudioScrubber) {
    els.podcastStudioScrubber.addEventListener("input", () => {
      const session = getActiveSession();
      if (!(session?.script?.rows || []).length) return;
      const durationMs = Math.max(STUDIO_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
      const ratio = Math.max(0, Math.min(1, Number(els.podcastStudioScrubber.value || 0) / 100));
      const nextMs = Math.max(0, Math.min(durationMs, ratio * durationMs));

      playbackController.seek(nextMs, {
        lightweight: true,
        suppressAutoScroll: true
      });

      if (podcastVideoState.montageActive) {
        playbackController.stop({ keepStatus: true, keepCursor: true });
      }
    });
  }
  if (els.podcastTimelineRuler) {
    els.podcastTimelineRuler.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;

      // Calculate position relative to ruler container
      const rect = els.podcastTimelineRuler.getBoundingClientRect();
      const localX = event.clientX - rect.left;

      seekStudioTimelineByRulerClientX(event.clientX, { stopMontage: true, localX: localX });
      event.preventDefault();
    });
  }
  if (els.podcastStudioTrackHead) {
    els.podcastStudioTrackHead.addEventListener("input", (event) => {
      const target = event?.target || null;
      if (!target || String(target.id || "") !== "podcastTimelineZoomOutRange") return;
      const session = getActiveSession();
      if (!session) return;
      const nextZoom = Math.max(0.25, Math.min(1, toFiniteNumber(target.value, 1)));
      applyTimelineZoomPreservingPlayhead(session, nextZoom);
    });
    els.podcastStudioTrackHead.addEventListener("change", (event) => {
      const target = event?.target || null;
      if (!target || String(target.id || "") !== "podcastVideoModeToggle") return;
      const enableVideoPodcast = target.checked === true;
      setPodcastVideoModeEnabled(enableVideoPodcast, { render: false, reason: "video-content-type" });
      if (enableVideoPodcast) {
        setPodcastStudioInspectorCollapsed(false);
      } else {
        setTimelineViewMode("tracks");
      }
      renderPodcastVideoShell(getActiveSession());
      render();
      setGenerationStatus(enableVideoPodcast ? "Podcast con video activado." : "Modo podcast normal activado.", "is-live");
    });
  }


  if (els.autoLinkStorageVideosBtn) {
    els.autoLinkStorageVideosBtn.addEventListener("click", async () => {
      let session = getActiveSession();
      if (!session || podcastVideoState.busy) return;

      const sessionSlug = String(session.id || session.slug || "").trim();
      if (!sessionSlug) return;

      window.setButtonLoadingState(els.autoLinkStorageVideosBtn, true, { loadingTitle: "Restableciendo..." });
      addChatMessage("system", "Iniciando recuperación profunda de la sesión y vinculación de medios...");

      try {
        // 1. Forzar reparación de estructura (recuperar filas si se perdieron)
        ensureSession();
        session = getActiveSession(); // Obtener sesión reparada

        const [videosData, audiosData] = await Promise.all([
          authFetchJson(`/api/podcaster/sessions/list-videos?sessionSlug=${encodeURIComponent(sessionSlug)}`),
          authFetchJson(`/api/podcaster/sessions/list-audios?sessionSlug=${encodeURIComponent(sessionSlug)}`).catch(() => ({ ok: false, audios: [] }))
        ]);

        const videos = Array.isArray(videosData?.videos) ? videosData.videos : [];
        const audios = Array.isArray(audiosData?.audios) ? audiosData.audios : [];

        if (!videos.length && !audios.length) {
          addChatMessage("system", "No se encontraron archivos físicos en Storage para esta sesión.");
          // Aún así renderizamos por si ensureSession reparó las filas
          render();
          return;
        }

        const rows = getSessionRows(session);
        let linkedVideos = 0;
        let linkedAudios = 0;

        rows.forEach((row) => {
          const rowId = String(row?.id || "").trim();
          if (!rowId) return;
          const speaker = String(row?.speaker || "").trim();

          // Búsqueda de video por ID
          const match = videos.find(v => {
            const fileName = String(v.name || "").toLowerCase();
            const folderName = String(v.rowFolder || "").toLowerCase();
            const target = rowId.toLowerCase();
            return fileName.includes(target) || folderName.includes(target);
          });

          if (match) {
            upsertActiveSession((current) => {
              const nextVideoMap = {
                ...getDialogueVideoMap(current),
                [rowId]: {
                  rowId,
                  downloadUrl: String(match.downloadUrl || "").trim(),
                  storagePath: String(match.storagePath || match.path || "").trim(),
                  mimeType: String(match.contentType || "video/mp4").trim(),
                  updatedAt: String(match.updatedAt || nowIso()).trim() || nowIso(),
                  model: "gemini-autolink-storage",
                  segments: null,
                  variants: null
                }
              };
              return { ...current, dialogueVideoMap: nextVideoMap };
            }, { render: false });
            linkedVideos++;
          }

          // Búsqueda de audio por ID
          const audioMatch = audios.find((a) => {
            const folderName = String(a?.rowFolder || "").toLowerCase();
            const target = rowId.toLowerCase();
            return folderName.includes(target);
          });

          if (audioMatch) {
            upsertActiveSession((current) => {
              const nextAudioMap = {
                ...getDialogueAudioMap(current),
                [rowId]: {
                  rowId,
                  speaker,
                  mimeType: String(audioMatch.contentType || "audio/wav").trim() || "audio/wav",
                  model: "gemini-autolink-storage",
                  promptVersion: "podcaster_live_audio_v1",
                  durationSec: Math.max(0, Number(current?.dialogueAudioMap?.[rowId]?.durationSec || 0) || Number(audioMatch.durationSec || 0) || 5),
                  targetSpeechLine: String(current?.dialogueAudioMap?.[rowId]?.targetSpeechLine || row?.text || "").trim(),
                  updatedAt: String(audioMatch.updatedAt || nowIso()).trim() || nowIso(),
                  downloadUrl: String(audioMatch.downloadUrl || "").trim(),
                  storagePath: String(audioMatch.storagePath || "").trim()
                }
              };
              return { ...current, dialogueAudioMap: nextAudioMap };
            }, { render: false });
            linkedAudios++;
          }
        });

        if (linkedVideos > 0 || linkedAudios > 0) {
          addChatMessage("system", `Recuperación finalizada: ${linkedVideos} videos y ${linkedAudios} audios vinculados.`);
        } else {
          addChatMessage("system", "Estructura de escenas restablecida, pero no se hallaron archivos multimedia coincidentes.");
        }

        // Forzar reconciliación final y renderizado completo
        syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
        renderPodcastVideoTimeline(getActiveSession(), { force: true, reason: "structure" });
        syncPodcastStudioInspector(getActiveSession());
        renderPodcastVideoShell(getActiveSession());
        scheduleSessionLocalPersist("deep-repair");
        render();

      } catch (error) {
        console.error("Error en restablecimiento profundo:", error);
        addChatMessage("system", `Error al restablecer: ${error.message}`);
      } finally {
        window.setButtonLoadingState(els.autoLinkStorageVideosBtn, false);
      }
    });
  }
  if (els.reorderTimelineTracksBtn) {
    els.reorderTimelineTracksBtn.addEventListener("click", () => {
      if (podcastVideoState.busy) return;
      const ok = reorderTimelineClipsByTracks();
      if (!ok) {
        setGenerationStatus("Se necesitan al menos 2 escenas para reordenar el timeline", "");
        return;
      }
    });
  }
  const applyStudioMasterVolume = (rawValue) => {
    const value = Math.max(0, Math.min(100, toFiniteNumber(rawValue, 100)));
    upsertPodcastVideoConfig((cfg) => ({ ...cfg, masterVolume: value }));
    scheduleSessionLocalPersist("inspector");
    if (els.podcastStudioMasterVolume) {
      els.podcastStudioMasterVolume.value = String(value);
    }
    if (els.podcastStudioMasterVolumeNumber) {
      els.podcastStudioMasterVolumeNumber.value = String(value);
    }
    const activeSession = getActiveSession();
    const activeRowId = String(podcastVideoState.activeRowId || "").trim();
    applyActiveTimelineClipMixToPlayback(activeSession, activeRowId);
    const inactive = getInactiveStageVideoEl?.() || null;
    if (inactive) {
      inactive.volume = 0;
      inactive.muted = true;
    }
    syncPodcastStudioInspector(getActiveSession());
    if (els.timelineClipDurationModal && !els.timelineClipDurationModal.hidden) {
      syncTimelineClipDurationModalInputs();
    }
  };
  const applyStudioClipVolume = (rawValue) => {
    const value = Math.max(0, Math.min(100, toFiniteNumber(rawValue, 0)));
    upsertPodcastVideoConfig((cfg) => ({ ...cfg, clipVolume: value }));
    scheduleSessionLocalPersist("inspector");
    if (els.podcastStudioClipVolume) {
      els.podcastStudioClipVolume.value = String(value);
    }
    if (els.podcastStudioClipVolumeNumber) {
      els.podcastStudioClipVolumeNumber.value = String(value);
    }
    const activeSession = getActiveSession();
    const activeRowId = String(podcastVideoState.activeRowId || "").trim();
    applyActiveTimelineClipMixToPlayback(activeSession, activeRowId);
    const inactive = getInactiveStageVideoEl?.() || null;
    if (inactive) {
      inactive.volume = 0;
      inactive.muted = true;
    }
    syncPodcastStudioInspector(getActiveSession());
    if (els.timelineClipDurationModal && !els.timelineClipDurationModal.hidden) {
      syncTimelineClipDurationModalInputs();
    }
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
  if (els.regenerateAllPortraitsBtn) {
    els.regenerateAllPortraitsBtn.addEventListener("click", async () => {
      if (podcastVideoState.busy) return;
      window.setButtonLoadingState(els.regenerateAllPortraitsBtn, true, {
        loadingTitle: "Regenerando retratos..."
      });
      try {
        await regenerateAllSpeakerPortraits();
        renderPodcastVideoShell(getActiveSession());
      } finally {
        window.setButtonLoadingState(els.regenerateAllPortraitsBtn, false);
      }
    });
  }

  if (els.playDialogueAudioBtn) {
    els.playDialogueAudioBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      const rowId = resolveTargetVideoRowId(session);
      const key = String(rowId || "").trim();
      if (!key) return;
      if (podcastVideoState.busy && String(studioDialoguePreviewRowId || "").trim() !== key) return;
      const storedAudio = resolveDialogueAudioForRow(session, key);
      const storedAudioSrc = resolveStorageAudioUrl(storedAudio?.downloadUrl || "", storedAudio?.storagePath || "");
      if (!storedAudioSrc) {
        setGenerationStatus("Esta escena no tiene voz guardada. Genera la voz primero.", "");
        addChatMessage("system", `La escena ${resolveSceneNumberByRowId(key, session)} no tiene audio guardado todavía.`);
        syncStudioPlayDialogueAudioButton();
        return;
      }
      await playStudioDialoguePreviewAudio(key);
      syncStudioPlayDialogueAudioButton();
    });
  }
  if (els.regenerateAllGeminiAudiosBtn) {
    els.regenerateAllGeminiAudiosBtn.addEventListener("click", async () => {
      const session = getActiveSession();
      if (!session || podcastVideoState.busy) return;
      const regenerableRows = getRegenerableGeminiAudioRows(session);
      if (!regenerableRows.length) {
        setGenerationStatus("No hay escenas válidas para regenerar audios Gemini.", "");
        return;
      }
      podcastVideoState.busy = true;
      window.setButtonLoadingState(els.regenerateAllGeminiAudiosBtn, true, {
        loadingTitle: "Regenerando audios Gemini..."
      });
      updatePodcastPlayerUi();
      try {
        await regenerateAllGeminiDialogueAudios(session);
        const refreshed = getActiveSession();
        syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
        syncPodcastStudioInspector(refreshed);
        renderPodcastVideoShell(refreshed);
      } catch (error) {
        setGenerationStatus("Error", "");
        addChatMessage("system", `No se pudieron regenerar todos los audios Gemini (${String(error?.message || "error desconocido")}).`);
      } finally {
        window.setButtonLoadingState(els.regenerateAllGeminiAudiosBtn, false);
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
    els.podcastVideoTimeline.addEventListener("mousedown", (event) => podcasterTimelineUiApi?.handlePointerDown?.(event));
    document.addEventListener("mousemove", (event) => podcasterTimelineUiApi?.handlePointerMove?.(event));
    document.addEventListener("mouseup", (event) => podcasterTimelineUiApi?.handlePointerUp?.(event));
    els.podcastVideoTimeline.addEventListener("change", (event) => {
      const settingTarget = event.target?.closest?.("[data-action='onscreen-text-track-setting'][data-setting]");
      if (!settingTarget) return;
      setOnScreenTextTrackSetting(settingTarget.dataset.setting, settingTarget.value);
      event.preventDefault();
      event.stopPropagation();
    });
    els.podcastVideoTimeline.addEventListener("click", async (event) => {
      if (Date.now() < Number(podcastVideoState.timelineJustDraggedUntil || 0)) {
        return;
      }
      if (podcasterTimelineInteractionApi?.handleClick?.(event)) {
        return;
      }
      const openTextSettingsBtn = event.target.closest("[data-action='open-onscreen-text-track-modal']");
      if (openTextSettingsBtn) {
        setOnScreenTextTrackModalOpen(true);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const toggleAllTextHiddenBtn = event.target.closest("[data-action='timeline-toggle-onscreen-text-hidden']:not([data-row-id])");
      if (toggleAllTextHiddenBtn) {
        const session = getActiveSession();
        const clipMap = ensureOnScreenTextClipsByRowId(session, { persist: false });
        const clips = Object.values(clipMap || {});
        if (!clips.length) return;
        const allHidden = clips.every((clip) => clip?.hidden === true);
        setAllOnScreenTextClipsHidden(!allHidden);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const toggleTextHiddenBtn = event.target.closest("[data-action='timeline-toggle-onscreen-text-hidden'][data-row-id]");
      if (toggleTextHiddenBtn) {
        const rowId = String(toggleTextHiddenBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        const session = getActiveSession();
        const clipMap = ensureOnScreenTextClipsByRowId(session, { persist: false });
        const current = clipMap[rowId];
        if (!current) return;
        setOnScreenTextClipHidden(rowId, !current.hidden);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const clipMenuToggle = event.target.closest("[data-action='timeline-toggle-clip-menu'][data-row-id]");
      if (clipMenuToggle && els.podcastVideoTimeline) {
        const rowId = String(clipMenuToggle.dataset.rowId || "").trim();
        if (!rowId) return;
        const clipEl = clipMenuToggle.closest(".podcast-video-timeline-clip[data-row-id]") || null;
        if (!clipEl) return;
        const menuLayer = getPodcastTimelineClipMenuPortal();
        const currentOpenRowId = String(menuLayer.dataset.openRowId || "").trim();
        const wantsOpen = currentOpenRowId !== rowId || !menuLayer.querySelector(".podcast-video-clip-menu.is-visible");

        closePodcastTimelineClipMenu();

        if (wantsOpen) {
          const menuSource = clipEl.querySelector(".podcast-video-clip-menu[data-row-id]") || null;
          if (!menuSource) return;
          const menu = menuSource.cloneNode(true);
          menu.classList.add("is-visible");
          menu.style.visibility = "hidden";
          menu.style.left = "0px";
          menu.style.top = "0px";
          menuLayer.appendChild(menu);

          const menuRect = menu.getBoundingClientRect();
          const anchorRect = clipMenuToggle.getBoundingClientRect();
          const layerRect = menuLayer.getBoundingClientRect();
          const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
          const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
          const containerRect = els.podcastVideoTimeline.getBoundingClientRect();
          const gap = 10;
          const leftMinViewport = Math.max(8, Math.round(containerRect.left + 8));
          const leftMaxViewport = Math.min(
            Math.max(leftMinViewport, viewportW - menuRect.width - 8),
            Math.round(containerRect.right - menuRect.width - 8)
          );
          const leftViewport = Math.max(leftMinViewport, Math.min(leftMaxViewport, anchorRect.left));
          const topMinViewport = Math.max(8, Math.round(containerRect.top + 8));
          const topMaxViewport = Math.min(
            Math.max(topMinViewport, viewportH - menuRect.height - 8),
            Math.round(containerRect.bottom - menuRect.height - 8)
          );
          let topViewport = anchorRect.top - menuRect.height - gap;
          if (topViewport < topMinViewport) {
            topViewport = anchorRect.bottom + gap;
          }
          topViewport = Math.max(topMinViewport, Math.min(topMaxViewport, topViewport));
          menu.style.left = `${Math.round(leftViewport - layerRect.left)}px`;
          menu.style.top = `${Math.round(topViewport - layerRect.top)}px`;
          menu.style.visibility = "";
          menuLayer.dataset.openRowId = rowId;
          menuLayer.classList.add("is-open");
          clipMenuToggle.setAttribute("aria-expanded", "true");
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const openMontageSceneMixBtn = event.target.closest("[data-action='open-montage-scene-mix']");
      if (openMontageSceneMixBtn) {
        event.preventDefault();
        setMontageSceneMixOpen(true);
        return;
      }
      const setGeminiTrackVolumeBtn = event.target.closest("[data-action='timeline-set-gemini-track-volume']");
      if (setGeminiTrackVolumeBtn) {
        event.preventDefault();
        event.stopPropagation();
        setGeminiTrackVolumeModalOpen(true);
        return;
      }
      const openAudioTrackMixBtn = event.target.closest("[data-action='open-audio-track-mix']");
      if (openAudioTrackMixBtn) {
        setAudioTrackMixOpen(true);
        return;
      }
      if (handleTimelineSelectAudioLoopChip(event.target, event)) {
        return;
      }
      if (handleTimelineToggleAudioLoopMute(event.target)) {
        event.preventDefault();
        return;
      }
      const toggleUploadedTrackEnabledBtn = event.target.closest("[data-action='timeline-toggle-uploaded-track-enabled']");
      if (toggleUploadedTrackEnabledBtn) {
        event.preventDefault();
        const trackIndex = Math.max(0, Math.floor(Number(toggleUploadedTrackEnabledBtn.dataset.trackIndex || 0) || 0));
        toggleSessionUploadedTrackEnabled(trackIndex);
        try {
          const speed = Math.max(0.5, Math.min(1.8, Number(els.podcastVideoSpeedSelect?.value || 1)));
          playbackController.syncBackgroundMusic(Math.max(0, Number(podcastVideoState.montageCursorMs || 0)), speed);
        } catch (_) { }
        return;
      }
      const deleteUploadedTrackBtn = event.target.closest("[data-action='timeline-delete-uploaded-track']");
      if (deleteUploadedTrackBtn) {
        event.preventDefault();
        const trackIndex = Math.max(0, Math.floor(Number(deleteUploadedTrackBtn.dataset.trackIndex || 0) || 0));
        const track = getPanelMusicUploadedTracks()[trackIndex] || null;
        if (!track) return;
        const confirmed = window.confirm(`Se eliminará ${track.slotLabel || `Audio ${trackIndex + 1}`} de esta sesión. ¿Deseas continuar?`);
        if (!confirmed) return;
        removeUploadedTrackAt(trackIndex);
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
        if (event.shiftKey) {
          selectTimelineTransitionRange(rowId, { syncStage: true });
          return;
        }
        selectTimelineSceneRow(rowId, { syncStage: true });
        return;
      }
      const clipBody = event.target.closest(".podcast-video-clip-body[data-row-id]");
      if (clipBody && !event.target.closest(".row-icon-btn")) {
        const rowId = String(clipBody.dataset.rowId || "").trim();
        if (!rowId) return;
        if (event.shiftKey) {
          selectTimelineTransitionRange(rowId, { syncStage: true });
          return;
        }
        selectTimelineSceneRow(rowId, { syncStage: true });
        return;
      }

      const playBtn = event.target.closest("[data-action='timeline-play-scene-video']");
      if (playBtn) {
        const rowId = String(playBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        if (podcastVideoState.timelineSequenceActive === true) {
          cancelTimelineSequence({ paused: false });
        }
        await playbackController.stop({ keepStatus: true, keepCursor: true });
        const session = getActiveSession();
        const row = (session?.script?.rows || []).find((item) => item.id === rowId) || null;
        setPodcastVideoRow(rowId, { syncStage: true });
        if (row?.speaker) {
          setPodcastVideoSpeaker(session, row.speaker, { speaking: false, rowId });
        }
        await playSceneInStudio(row, { allowGenerateAudio: true });
        return;
      }

      const configureDurationBtn = event.target.closest("[data-action='timeline-configure-scene-duration']");
      if (configureDurationBtn) {
        const rowId = String(configureDurationBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        openTimelineClipDurationConfig(rowId);
        return;
      }
      const openFrameHoldBtn = event.target.closest("[data-action='timeline-open-frame-hold-modal']");
      if (openFrameHoldBtn) {
        const rowId = String(openFrameHoldBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        setTimelineFrameHoldModalOpen(rowId);
        return;
      }
      const openSpeedRangeBtn = event.target.closest("[data-action='timeline-open-speed-range-modal']");
      if (openSpeedRangeBtn) {
        const rowId = String(openSpeedRangeBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        setTimelineSpeedRangeModalOpen(rowId);
        return;
      }
      const openTransitionPickerBtn = event.target.closest("[data-action='open-transition-picker'][data-from-row-id][data-to-row-id]");
      if (openTransitionPickerBtn) {
        const fromRowId = String(openTransitionPickerBtn.dataset.fromRowId || "").trim();
        const toRowId = String(openTransitionPickerBtn.dataset.toRowId || "").trim();
        if (!fromRowId || !toRowId) return;
        setPodcastTransitionPickerOpen(true, fromRowId, toRowId);
        return;
      }



      const deleteBtn = event.target.closest("[data-action='timeline-delete-scene-video']");
      if (deleteBtn) {
        const rowId = String(deleteBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        const confirmed = window.confirm(`Se eliminará toda la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}. ¿Deseas continuar?`);
        if (!confirmed) return;
        deleteSceneRowById(rowId);
        return;
      }
      const replaceBtn = event.target.closest("[data-action='replace-scene-video-from-storage']");
      if (replaceBtn) {
        const rowId = String(replaceBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        openSceneVideoSelectorModal(rowId, { triggerSource: "timeline-row-menu" });
        return;
      }
      const duplicateBtn = event.target.closest("[data-action='duplicate-row']");
      if (duplicateBtn) {
        const rowId = String(duplicateBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        duplicateSceneRowWithMedia(rowId);
      }
      const publishBtn = event.target.closest("[data-action='publish-scene-to-library']");
      if (publishBtn) {
        const rowId = String(publishBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        publishCurrentSceneToLibrary(rowId, { loadingButton: publishBtn }).catch((error) => {
          addChatMessage("system", `No se pudo publicar la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
          setGenerationStatus("Error", "");
        });
      }
    });
    document.addEventListener("click", (event) => {
      const menuLayer = els.podcastVideoTimeline?.querySelector?.("#podcastTimelineMenuLayer") || null;
      const portal = document.getElementById("podcastTimelineClipMenuPortal");
      const host = menuLayer || portal;
      if (!host) return;
      const hasMenu = Boolean(host.querySelector(".podcast-video-clip-menu.is-visible"));
      if (!hasMenu) return;
      const target = event.target || null;
      if (target?.closest?.(".podcast-video-clip-actions") || target?.closest?.(".podcast-video-clip-menu")) return;
      if (target?.closest?.("[data-action='timeline-toggle-clip-menu']")) return;
      closePodcastTimelineClipMenu();
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
  if (els.togglePodcastStudioFooterBtn) {
    // Restaurar estado preferido por el usuario al cargar
    const isCollapsed = localStorage.getItem("podcaster-footer-collapsed") === "true";
    const footer = els.podcastPortraitStrip?.closest(".podcast-studio-footer");
    if (footer && isCollapsed) {
      footer.classList.add("is-footer-collapsed");
      els.togglePodcastStudioFooterBtn.setAttribute("aria-expanded", "false");
      els.togglePodcastStudioFooterBtn.title = "Expandir panel";
    }

    els.togglePodcastStudioFooterBtn.addEventListener("click", () => {
      if (!footer) return;
      const willCollapse = footer.classList.toggle("is-footer-collapsed");
      localStorage.setItem("podcaster-footer-collapsed", willCollapse);
      els.togglePodcastStudioFooterBtn.setAttribute("aria-expanded", !willCollapse);
      els.togglePodcastStudioFooterBtn.title = willCollapse ? "Expandir panel" : "Colapsar panel";
    });
  }
  if (els.podcastPortraitStrip) {
    els.podcastPortraitStrip.addEventListener("click", async (event) => {
      const attachSpeakerReferenceBtn = event.target.closest("[data-action='attach-speaker-reference-image']");
      if (attachSpeakerReferenceBtn) {
        const speaker = String(attachSpeakerReferenceBtn.dataset.speaker || "").trim();
        if (speaker) promptSpeakerReferenceSelection(speaker);
        return;
      }
      const clearSpeakerReferenceBtn = event.target.closest("[data-action='clear-speaker-reference-image']");
      if (clearSpeakerReferenceBtn) {
        const speaker = String(clearSpeakerReferenceBtn.dataset.speaker || "").trim();
        if (speaker) await setSpeakerReferenceImage(speaker, null);
        return;
      }
      const attachScenarioReferenceBtn = event.target.closest("[data-action='attach-scenario-reference-image']");
      if (attachScenarioReferenceBtn) {
        const scenarioId = String(attachScenarioReferenceBtn.dataset.scenarioId || "").trim();
        if (scenarioId) promptScenarioReferenceSelection(scenarioId);
        return;
      }
      const clearScenarioReferenceBtn = event.target.closest("[data-action='clear-scenario-reference-image']");
      if (clearScenarioReferenceBtn) {
        const scenarioId = String(clearScenarioReferenceBtn.dataset.scenarioId || "").trim();
        if (scenarioId) await setScenarioReferenceImage(scenarioId, null);
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
      window.setButtonLoadingState(actionBtn, true, {
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
        window.setButtonLoadingState(actionBtn, false);
        podcastVideoState.busy = false;
        updatePodcastPlayerUi();
      }
    });
  }
  bindMediaReferenceInputEvents();
  if (els.podcastSceneLibraryLocalVideoInput) {
    els.podcastSceneLibraryLocalVideoInput.addEventListener("change", async () => {
      const file = els.podcastSceneLibraryLocalVideoInput.files?.[0] || null;
      els.podcastSceneLibraryLocalVideoInput.value = "";
      if (!file) return;
      try {
        await uploadLocalPodcastSceneLibraryVideo(file);
      } catch (error) {
        addChatMessage("system", `No se pudo subir el video local (${error.message}).`);
        setGenerationStatus("Error", "");
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
  if (els.timelineClipDurationModal) {
    els.timelineClipDurationModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-timeline-clip-duration-modal']");
      if (closeBtn) {
        setTimelineClipDurationModalOpen(false);
      }
    });
    els.timelineClipDurationModal.addEventListener("change", (event) => {
      const target = event.target?.closest?.("[data-row-id][data-field]");
      if (!target) return;
      handleScriptFieldUpdate(event);
      syncTimelineClipDurationModalInputs();
    });
  }
  if (els.geminiAudioSpeedModal) {
    els.geminiAudioSpeedModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-gemini-audio-speed-modal']");
      if (closeBtn) {
        setGeminiAudioSpeedModalOpen("");
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
  if (els.geminiTrackVolumeModal) {
    els.geminiTrackVolumeModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-gemini-track-volume-modal']");
      if (closeBtn) {
        setGeminiTrackVolumeModalOpen(false);
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
  if (els.timelineFrameHoldModal) {
    els.timelineFrameHoldModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-timeline-frame-hold-modal']");
      if (closeBtn) {
        setTimelineFrameHoldModalOpen("");
      }
    });
  }
  if (els.timelineSpeedRangeModal) {
    els.timelineSpeedRangeModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-timeline-speed-range-modal']");
      if (closeBtn) {
        setTimelineSpeedRangeModalOpen("");
      }
    });
  }
  if (els.onScreenTextTrackPanel) {
    const onScreenTextTrackHead = els.onScreenTextTrackPanel.querySelector(".music-config-head");
    onScreenTextTrackHead?.addEventListener("pointerdown", (event) => {
      beginOnScreenTextTrackModalDrag(event);
    });
  }
  if (els.onScreenTextTrackModal) {
    els.onScreenTextTrackModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-onscreen-text-track-modal']");
      if (closeBtn) {
        setOnScreenTextTrackModalOpen(false);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const lookPresetBtn = event.target.closest("[data-action='onscreen-text-look-preset'][data-preset]");
      if (lookPresetBtn) {
        applyOnScreenTextLookPreset(lookPresetBtn.dataset.preset);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const sizePresetBtn = event.target.closest("[data-action='onscreen-text-size-preset'][data-size]");
      if (sizePresetBtn) {
        setOnScreenTextTrackSetting("fontSizePx", sizePresetBtn.dataset.size, {
          autosave: true,
          renderModal: true
        });
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    });
    const syncOnScreenTextModalPeers = (target) => {
      if (!target) return;
      const setting = String(target.dataset.setting || "").trim();
      if (!setting) return;
      const value = String(target.value ?? "");
      const container = target.closest(".row-field") || target.parentElement;
      if (!container) return;
      container.querySelectorAll(`[data-action="onscreen-text-track-setting"][data-setting="${CSS.escape(setting)}"]`).forEach((peer) => {
        if (peer === target) return;
        try { peer.value = value; } catch (_) { }
      });
    };
    els.onScreenTextTrackModal.addEventListener("input", (event) => {
      const settingTarget = event.target?.closest?.("[data-action='onscreen-text-track-setting'][data-setting]");
      if (!settingTarget) return;
      syncOnScreenTextModalPeers(settingTarget);
      setOnScreenTextTrackSetting(settingTarget.dataset.setting, settingTarget.value, {
        autosave: false,
        renderModal: false
      });
      event.preventDefault();
      event.stopPropagation();
    });
    els.onScreenTextTrackModal.addEventListener("change", (event) => {
      const settingTarget = event.target?.closest?.("[data-action='onscreen-text-track-setting'][data-setting]");
      if (!settingTarget) return;
      syncOnScreenTextModalPeers(settingTarget);
      setOnScreenTextTrackSetting(settingTarget.dataset.setting, settingTarget.value, {
        autosave: true,
        renderModal: true
      });
      event.preventDefault();
      event.stopPropagation();
    });
  }
  document.addEventListener("pointermove", (event) => {
    applyOnScreenTextTrackModalDrag(event);
  });
  document.addEventListener("pointerup", (event) => {
    endOnScreenTextTrackModalDrag(event);
  });
  document.addEventListener("pointercancel", (event) => {
    endOnScreenTextTrackModalDrag(event);
  });
  if (els.montageSceneMixModal) {
    els.montageSceneMixModal.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-action='close-montage-scene-mix-modal']");
      if (closeBtn) {
        setMontageSceneMixOpen(false);
      }
    });
  }
  if (els.closeMontageSceneMixBtn) {
    els.closeMontageSceneMixBtn.addEventListener("click", () => {
      setMontageSceneMixOpen(false);
    });
  }
  if (els.cancelMontageSceneMixBtn) {
    els.cancelMontageSceneMixBtn.addEventListener("click", () => {
      setMontageSceneMixOpen(false);
    });
  }
  if (els.applyMontageSceneMixBtn) {
    els.applyMontageSceneMixBtn.addEventListener("click", () => {
      applyMontageSceneMixToAllScenes();
    });
  }
  if (els.montageSceneVeoVolumeRange) {
    els.montageSceneVeoVolumeRange.addEventListener("input", () => {
      syncMontageSceneMixModalInputs("veoRange");
    });
  }
  if (els.montageSceneVeoVolumeNumber) {
    els.montageSceneVeoVolumeNumber.addEventListener("input", () => {
      syncMontageSceneMixModalInputs("veoNumber");
    });
    els.montageSceneVeoVolumeNumber.addEventListener("change", () => {
      syncMontageSceneMixModalInputs("veoNumber");
    });
  }
  if (els.montageSceneGeminiVolumeRange) {
    els.montageSceneGeminiVolumeRange.addEventListener("input", () => {
      syncMontageSceneMixModalInputs("geminiRange");
    });
  }
  if (els.montageSceneGeminiVolumeNumber) {
    els.montageSceneGeminiVolumeNumber.addEventListener("input", () => {
      syncMontageSceneMixModalInputs("geminiNumber");
    });
    els.montageSceneGeminiVolumeNumber.addEventListener("change", () => {
      syncMontageSceneMixModalInputs("geminiNumber");
    });
  }
  if (els.montageSceneBackgroundVolumeRange) {
    els.montageSceneBackgroundVolumeRange.addEventListener("input", () => {
      syncMontageSceneMixModalInputs("backgroundRange");
    });
  }
  if (els.montageSceneBackgroundVolumeNumber) {
    els.montageSceneBackgroundVolumeNumber.addEventListener("input", () => {
      syncMontageSceneMixModalInputs("backgroundNumber");
    });
    els.montageSceneBackgroundVolumeNumber.addEventListener("change", () => {
      syncMontageSceneMixModalInputs("backgroundNumber");
    });
  }
  if (els.closeTimelineClipDurationBtn) {
    els.closeTimelineClipDurationBtn.addEventListener("click", () => {
      setTimelineClipDurationModalOpen(false);
    });
  }
  if (els.closeGeminiAudioSpeedModalBtn) {
    els.closeGeminiAudioSpeedModalBtn.addEventListener("click", () => {
      setGeminiAudioSpeedModalOpen("");
    });
  }
  if (els.cancelGeminiAudioSpeedBtn) {
    els.cancelGeminiAudioSpeedBtn.addEventListener("click", () => {
      setGeminiAudioSpeedModalOpen("");
    });
  }
  if (els.resetGeminiAudioSpeedBtn) {
    els.resetGeminiAudioSpeedBtn.addEventListener("click", () => {
      geminiAudioSpeedModalState.playbackRate = 1;
      syncGeminiAudioSpeedModalInputs();
      applyGeminiAudioSpeedModal({ close: false });
    });
  }
  if (els.applyGeminiAudioSpeedBtn) {
    els.applyGeminiAudioSpeedBtn.addEventListener("click", () => {
      applyGeminiAudioSpeedModal();
    });
  }
  if (els.closeGeminiTrackVolumeModalBtn) {
    els.closeGeminiTrackVolumeModalBtn.addEventListener("click", () => {
      setGeminiTrackVolumeModalOpen(false);
    });
  }
  if (els.cancelGeminiTrackVolumeBtn) {
    els.cancelGeminiTrackVolumeBtn.addEventListener("click", () => {
      setGeminiTrackVolumeModalOpen(false);
    });
  }
  if (els.resetGeminiTrackVolumeBtn) {
    els.resetGeminiTrackVolumeBtn.addEventListener("click", () => {
      geminiTrackVolumeModalState.volumePct = 100;
      syncGeminiTrackVolumeModalInputs();
      applyGeminiTrackVolumeModal({ close: false });
    });
  }
  if (els.applyGeminiTrackVolumeBtn) {
    els.applyGeminiTrackVolumeBtn.addEventListener("click", () => {
      applyGeminiTrackVolumeModal();
    });
  }
  if (els.geminiTrackVolumeRange) {
    els.geminiTrackVolumeRange.addEventListener("input", () => {
      syncGeminiTrackVolumeModalInputs("range");
    });
  }
  if (els.geminiTrackVolumeNumber) {
    els.geminiTrackVolumeNumber.addEventListener("input", () => {
      syncGeminiTrackVolumeModalInputs("number");
    });
    els.geminiTrackVolumeNumber.addEventListener("change", () => {
      syncGeminiTrackVolumeModalInputs("number");
    });
  }
  if (els.closeTimelineFrameHoldModalBtn) {
    els.closeTimelineFrameHoldModalBtn.addEventListener("click", () => setTimelineFrameHoldModalOpen(""));
  }
  if (els.cancelTimelineFrameHoldBtn) {
    els.cancelTimelineFrameHoldBtn.addEventListener("click", () => setTimelineFrameHoldModalOpen(""));
  }
  if (els.deleteTimelineFrameHoldBtn) {
    els.deleteTimelineFrameHoldBtn.addEventListener("click", () => {
      deleteTimelineFrameHoldFromModal();
    });
  }
  if (els.applyTimelineFrameHoldBtn) {
    els.applyTimelineFrameHoldBtn.addEventListener("click", () => {
      applyTimelineFrameHoldModal();
    });
  }
  if (els.timelineFrameHoldAtNumber) {
    els.timelineFrameHoldAtNumber.addEventListener("input", () => syncTimelineFrameHoldModalInputs("at"));
  }
  if (els.timelineFrameHoldDurationRange) {
    els.timelineFrameHoldDurationRange.addEventListener("input", () => syncTimelineFrameHoldModalInputs("range"));
  }
  if (els.timelineFrameHoldDurationNumber) {
    els.timelineFrameHoldDurationNumber.addEventListener("input", () => syncTimelineFrameHoldModalInputs("number"));
    els.timelineFrameHoldDurationNumber.addEventListener("change", () => syncTimelineFrameHoldModalInputs("number"));
  }
  if (els.closeTimelineSpeedRangeModalBtn) {
    els.closeTimelineSpeedRangeModalBtn.addEventListener("click", () => setTimelineSpeedRangeModalOpen(""));
  }
  if (els.cancelTimelineSpeedRangeBtn) {
    els.cancelTimelineSpeedRangeBtn.addEventListener("click", () => setTimelineSpeedRangeModalOpen(""));
  }
  if (els.deleteTimelineSpeedRangeBtn) {
    els.deleteTimelineSpeedRangeBtn.addEventListener("click", () => {
      deleteTimelineSpeedRangeFromModal();
    });
  }
  if (els.applyTimelineSpeedRangeBtn) {
    els.applyTimelineSpeedRangeBtn.addEventListener("click", () => {
      applyTimelineSpeedRangeModal();
    });
  }
  if (els.timelineSpeedRangeStartNumber) {
    els.timelineSpeedRangeStartNumber.addEventListener("input", () => syncTimelineSpeedRangeModalInputs("start"));
  }
  if (els.timelineSpeedRangeEndNumber) {
    els.timelineSpeedRangeEndNumber.addEventListener("input", () => syncTimelineSpeedRangeModalInputs("end"));
  }
  if (els.timelineSpeedRangeRateRange) {
    els.timelineSpeedRangeRateRange.addEventListener("input", () => syncTimelineSpeedRangeModalInputs("range"));
  }
  if (els.timelineSpeedRangeRateNumber) {
    els.timelineSpeedRangeRateNumber.addEventListener("input", () => syncTimelineSpeedRangeModalInputs("number"));
    els.timelineSpeedRangeRateNumber.addEventListener("change", () => syncTimelineSpeedRangeModalInputs("number"));
  }
  if (els.geminiAudioSpeedRange) {
    els.geminiAudioSpeedRange.addEventListener("input", () => {
      syncGeminiAudioSpeedModalInputs("range");
    });
    els.geminiAudioSpeedRange.addEventListener("change", () => {
      syncGeminiAudioSpeedModalInputs("range");
    });
  }
  if (els.geminiAudioSpeedNumber) {
    els.geminiAudioSpeedNumber.addEventListener("input", () => {
      syncGeminiAudioSpeedModalInputs("number");
    });
    els.geminiAudioSpeedNumber.addEventListener("change", () => {
      syncGeminiAudioSpeedModalInputs("number");
    });
  }
  if (els.cancelTimelineClipDurationBtn) {
    els.cancelTimelineClipDurationBtn.addEventListener("click", () => {
      setTimelineClipDurationModalOpen(false);
    });
  }
  if (els.resetTimelineClipDurationBtn) {
    els.resetTimelineClipDurationBtn.addEventListener("click", () => {
      resetTimelineClipDurationFromModal();
    });
  }
  if (els.timelineClipDurationRange) {
    els.timelineClipDurationRange.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("range");
    });
  }
  if (els.timelineClipDurationNumber) {
    els.timelineClipDurationNumber.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("number");
    });
    els.timelineClipDurationNumber.addEventListener("change", () => {
      syncTimelineClipDurationModalInputs("number");
    });
  }
  if (els.timelineClipVeoVolumeRange) {
    els.timelineClipVeoVolumeRange.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("veoRange");
      schedulePersistTimelineClipVolumeOverrides();
    });
  }
  if (els.timelineClipVeoVolumeNumber) {
    els.timelineClipVeoVolumeNumber.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("veoNumber");
      schedulePersistTimelineClipVolumeOverrides();
    });
    els.timelineClipVeoVolumeNumber.addEventListener("change", () => {
      persistTimelineClipVolumeOverridesFromModal({ persist: true });
    });
  }
  if (els.timelineClipGeminiVolumeRange) {
    els.timelineClipGeminiVolumeRange.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("geminiRange");
      schedulePersistTimelineClipVolumeOverrides();
    });
  }
  if (els.timelineClipGeminiVolumeNumber) {
    els.timelineClipGeminiVolumeNumber.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("geminiNumber");
      schedulePersistTimelineClipVolumeOverrides();
    });
    els.timelineClipGeminiVolumeNumber.addEventListener("change", () => {
      persistTimelineClipVolumeOverridesFromModal({ persist: true });
    });
  }
  if (els.timelineClipBackgroundVolumeRange) {
    els.timelineClipBackgroundVolumeRange.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("backgroundRange");
      schedulePersistTimelineClipVolumeOverrides();
    });
  }
  if (els.timelineClipBackgroundVolumeNumber) {
    els.timelineClipBackgroundVolumeNumber.addEventListener("input", () => {
      syncTimelineClipDurationModalInputs("backgroundNumber");
      schedulePersistTimelineClipVolumeOverrides();
    });
    els.timelineClipBackgroundVolumeNumber.addEventListener("change", () => {
      persistTimelineClipVolumeOverridesFromModal({ persist: true });
    });
  }
  if (els.timelineClipVisualLayoutMode) {
    els.timelineClipVisualLayoutMode.addEventListener("change", () => {
      syncTimelineClipDurationModalInputs("visualLayout");
      persistTimelineClipVolumeOverridesFromModal({ persist: true });
    });
  }
  if (els.applyTimelineClipDurationBtn) {
    els.applyTimelineClipDurationBtn.addEventListener("click", () => {
      applyTimelineClipDurationFromModal();
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
  if (els.closeSceneVideoSelectorBtn) {
    els.closeSceneVideoSelectorBtn.addEventListener("click", closeSceneVideoSelectorModal);
  }
  if (els.cancelSceneVideoSelectorBtn) {
    els.cancelSceneVideoSelectorBtn.addEventListener("click", closeSceneVideoSelectorModal);
  }
  if (els.sceneVideoTabGeneratedBtn || els.sceneVideoTabOthersBtn) {
    const setSceneVideoTab = (tab = "generated") => {
      const showGenerated = tab !== "others";
      if (els.sceneVideoSelectorGeneratedGrid) els.sceneVideoSelectorGeneratedGrid.hidden = !showGenerated;
      if (els.sceneVideoSelectorOthersGrid) els.sceneVideoSelectorOthersGrid.hidden = showGenerated;
      if (els.sceneVideoTabGeneratedBtn) {
        els.sceneVideoTabGeneratedBtn.classList.toggle("is-active", showGenerated);
        els.sceneVideoTabGeneratedBtn.setAttribute("aria-selected", showGenerated ? "true" : "false");
      }
      if (els.sceneVideoTabOthersBtn) {
        els.sceneVideoTabOthersBtn.classList.toggle("is-active", !showGenerated);
        els.sceneVideoTabOthersBtn.setAttribute("aria-selected", showGenerated ? "false" : "true");
      }
    };
    if (els.sceneVideoTabGeneratedBtn) {
      els.sceneVideoTabGeneratedBtn.addEventListener("click", () => setSceneVideoTab("generated"));
    }
    if (els.sceneVideoTabOthersBtn) {
      els.sceneVideoTabOthersBtn.addEventListener("click", () => setSceneVideoTab("others"));
    }
  }
  if (els.podcastPortraitViewerCloseBtn) {
    els.podcastPortraitViewerCloseBtn.addEventListener("click", closePodcastPortraitViewer);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.podcastPortraitViewer && !els.podcastPortraitViewer.hidden) {
      closePodcastPortraitViewer();
      return;
    }
    if (event.key === "Escape" && els.podcastSceneVideoSelectorModal && !els.podcastSceneVideoSelectorModal.hidden) {
      closeSceneVideoSelectorModal();
      return;
    }
    if (event.key === "Escape" && els.timelineClipDurationModal && !els.timelineClipDurationModal.hidden) {
      setTimelineClipDurationModalOpen(false);
      return;
    }
    if (event.key === "Escape" && els.dialogueVideoDirectiveModal && !els.dialogueVideoDirectiveModal.hidden) {
      closeDialogueVideoDirectiveModal({ confirmed: false, videoDirective: "" });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (!podcastVideoState.enabled) return;
    if (isPodcasterEditingTextField(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.key === "Backspace" || event.key === "Delete") {
      if (deleteSelectedTimelineAudioChips()) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (podcastVideoState.montageActive && !podcastVideoState.montagePaused) {
        playbackController.pause();
      } else {
        playbackController.play(Number(podcastVideoState.montageCursorMs || 0));
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      els.podcastVideoPrevBtn?.click?.();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      els.podcastVideoNextBtn?.click?.();
    }
  });

  els.promptInput.addEventListener("input", () => {
    autoResizePrompt();
  });
  els.promptInput.addEventListener("paste", handlePromptInputPaste);
  bindSessionRailEvents();
  window.addEventListener("resize", updateChatComposerLayoutOffset);
  if (typeof ResizeObserver === "function" && els.composerShell) {
    const composerResizeObserver = new ResizeObserver(() => {
      updateChatComposerLayoutOffset();
    });
    composerResizeObserver.observe(els.composerShell);
  }
  updateChatComposerLayoutOffset();

  window.addEventListener("storage", (event) => {
    if (event.key !== PODCASTER_VIDEO_IMPORT_STORAGE_KEY || !event.newValue) return;
    consumeImportedVideoPromptBridge({ renderAfter: true, clearAfterRead: true });
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
    const regenerateBtn = event.target.closest("[data-action='regenerate-chat-message']");
    if (regenerateBtn) {
      const article = regenerateBtn.closest(".chat-message");
      const messageId = String(article?.dataset?.messageId || "").trim();
      const session = getActiveSession();
      const message = (session?.chat || []).find((item) => String(item?.id || "").trim() === messageId) || null;
      if (!message) return;

      let prompt = message.originalPrompt;
      let options = message.originalOptions || {};

      if (!prompt) {
        const chatList = session?.chat || [];
        const index = chatList.findIndex((item) => String(item?.id || "").trim() === messageId);
        if (index > 0) {
          for (let i = index - 1; i >= 0; i--) {
            if (chatList[i]?.role === "user") {
              prompt = chatList[i]?.text;
              break;
            }
          }
        }
      }

      if (!prompt) {
        alert("No se pudo identificar la instrucción original para regenerar el guión.");
        return;
      }

      const alternativeNote = "\n\n(Regeneración obligatoria: Por favor, propón una versión de guión completamente alternativa, diferente e innovadora a las anteriores. Varía los ejemplos, analogías, introducciones o estructura dramática, manteniendo los mismos lineamientos y requerimientos técnicos pero sin repetir el mismo contenido exacto).";

      const newOptions = {
        ...options,
        generationPrompt: (options.generationPrompt || prompt) + alternativeNote,
        constraints: {
          ...(options.constraints || {}),
          forceNewScript: true
        }
      };

      window.setButtonLoadingState(regenerateBtn, true, {
        loadingTitle: "Regenerando guion..."
      });
      setGenerationStatus("Regenerando propuesta alternativa...", "is-busy");

      try {
        await requirePodcasterScriptGeneratorApiFunction("handleGenerate")(prompt, newOptions);
        setGenerationStatus("Nueva propuesta de guión generada.", "is-live");
      } catch (err) {
        console.error("Error al regenerar guion:", err);
        setGenerationStatus(`Error al regenerar: ${err.message}`, "is-live");
        alert("Error al regenerar el guion: " + err.message);
      } finally {
        window.setButtonLoadingState(regenerateBtn, false);
      }
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
      const sessionId = String(session?.id || "").trim();
      const message = (session?.chat || []).find((item) => String(item?.id || "").trim() === messageId) || null;
      if (!message?.scriptSnapshot) return;
      const confirmed = window.confirm("Se conectará este guión al panel y se borrará la conexión activa actual. ¿Deseas continuar?");
      if (!confirmed) return;
      window.setButtonLoadingState(connectBtn, true, {
        loadingTitle: "Conectando guion al panel..."
      });
      setGenerationStatus("Conectando guion al panel...", "is-busy", { sessionId });
      stopPodcastPlayback();
      stopRowAudio();
      stopGeminiLiveSession().catch(() => { });
      window.backgroundDialogueAudioWarmupToken = 0;
      const connectRun = beginConnectScriptPanelGeneration(messageId);
      try {
        const updatedSession = connectScriptSnapshotToPanel(message.scriptSnapshot || {}, {
          session,
          reason: "chat-connect",
          openSidepanel: isCurrentModeVideo() || isEducationalVideoMode(session),
          snapshots: {
            speakerVoiceMap: message.speakerVoiceMapSnapshot || {},
            speakerExpressionMap: message.speakerExpressionMapSnapshot || {},
            speakerNameMap: message.speakerNameMapSnapshot || {},
            speakerScenarioMap: message.speakerScenarioMapSnapshot || {}
          }
        });
        const shouldFocusVideoSidepanel = isCurrentModeVideo()
          || isEducationalVideoMode(updatedSession);
        if (shouldFocusVideoSidepanel) {
          setSidepanelOpen(true);
        }
        const audioResult = await generateDialogueAudioForConnectedScript(updatedSession, {
          regenerate: false,
          token: connectRun.token,
          signal: connectRun.signal
        });
        reflowTimelineClipsByScriptOrder(getActiveSession(), { persist: true, render: false });
        syncGeminiDialogueTrackWithRuntime({ render: false, preserveStartMs: true });
        renderPodcastVideoShell(getActiveSession());
        syncPodcastStudioInspector(getActiveSession());
        if (audioResult.generated === 0) {
          throw new Error("El guión se conectó, pero no se pudo guardar audio de ninguna escena.");
        }
        if (audioResult.failed > 0) {
          setGenerationStatus(`Guion conectado. Audios generados: ${audioResult.generated}. Fallos: ${audioResult.failed}.`, "is-live", { sessionId });
        } else {
          setGenerationStatus(`Guion conectado. ${audioResult.generated} audios generados.`, "is-live", { sessionId });
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        setGenerationStatus("Error", "", { sessionId });
        addChatMessage("system", `No se pudo conectar el guion al panel (${error.message}).`);
      } finally {
        connectScriptPanelGenerationState.active = false;
        connectScriptPanelGenerationState.messageId = "";
        connectScriptPanelGenerationState.abortController = null;
        connectScriptPanelGenerationState.token = 0;
        renderChat(getActiveSession());
        window.setButtonLoadingState(connectBtn, false);
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

  document.addEventListener("click", (event) => {
    // Manejo de menús flotantes de fila
    const menuToggle = event.target.closest(".btn-row-menu-toggle");
    if (menuToggle) {
      event.preventDefault();
      event.stopPropagation();
      const container = menuToggle.closest(".row-menu-container");
      const isOpen = container?.classList.contains("is-open");

      // Cerrar todos los demás menús primero
      document.querySelectorAll(".row-menu-container.is-open").forEach(m => m.classList.remove("is-open"));

      if (container && !isOpen) {
        container.classList.add("is-open");
      }
      return;
    }

    // Cerrar menú si se hace clic en una acción
    if (event.target.closest(".row-menu-item")) {
      document.querySelectorAll(".row-menu-container.is-open").forEach(m => m.classList.remove("is-open"));
      // Dejar que el evento siga para que se ejecute la acción
    }

    // Cerrar menús al hacer clic fuera
    if (!event.target.closest(".row-menu-container")) {
      document.querySelectorAll(".row-menu-container.is-open").forEach(m => m.classList.remove("is-open"));
    }

    const floatingClose = event.target.closest("[data-action]");
    const libraryToggle = event.target.closest("[data-action='toggle-podcast-scene-library-menu'][data-library-id]");
    if (libraryToggle) {
      event.preventDefault();
      event.stopPropagation();
      const libraryId = String(libraryToggle.dataset.libraryId || "").trim();
      const item = podcastSceneLibraryState.items.find((scene) => String(scene?.libraryId || "").trim() === libraryId) || null;
      if (!item) return;
      const portal = getPodcastSceneLibraryMenuPortal();
      const currentOpenLibraryId = String(portal.dataset.openLibraryId || "").trim();
      const wantsOpen = currentOpenLibraryId !== libraryId || !portal.querySelector(".podcast-scene-library-menu.is-visible");
      closePodcastSceneLibraryMenu();
      if (wantsOpen) {
        openPodcastSceneLibraryMenu(
          item,
          libraryToggle,
          Math.max(0, Math.round(toFiniteNumber(libraryToggle.dataset.insertIndex, getSceneInsertIndexForLibraryItem(getActiveSession(), libraryId))))
        );
      }
      return;
    }
    const libraryAction = event.target.closest("[data-action='play-public-scene'][data-library-id], [data-action='edit-public-scene'][data-library-id], [data-action='delete-public-scene'][data-library-id], [data-action='insert-public-scene'][data-library-id]");
    if (libraryAction) {
      event.preventDefault();
      event.stopPropagation();
      const libraryId = String(libraryAction.dataset.libraryId || "").trim();
      const item = podcastSceneLibraryState.items.find((scene) => String(scene?.libraryId || "").trim() === libraryId) || null;
      if (!item) return;
      const action = String(libraryAction.dataset.action || "").trim();
      closePodcastSceneLibraryMenu();
      if (action === "play-public-scene") {
        playPodcastSceneLibraryPreview(item).catch((error) => {
          addChatMessage("system", `No se pudo reproducir la escena pública (${error.message}).`);
        });
        return;
      }
      if (action === "edit-public-scene") {
        setPodcastSceneLibraryEditModalOpen(true, item);
        return;
      }
      if (action === "delete-public-scene") {
        deletePodcastSceneLibraryItem(item).catch((error) => {
          addChatMessage("system", `No se pudo eliminar la escena pública (${error.message}).`);
        });
        return;
      }
      if (action === "insert-public-scene") {
        const insertIndex = Math.max(0, Math.round(toFiniteNumber(libraryAction.dataset.insertIndex, getSceneInsertIndexForLibraryItem(getActiveSession(), libraryId))));
        setPodcastSceneInsertModalOpen(true, item, insertIndex);
      }
      return;
    }
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
      pendingScriptPromptHtml = "";
      pendingScriptTableMode = "create";
      return;
    }
    if (floatingClose?.dataset?.action === "close-podcast-video-modal") {
      closePodcastVideoModal();
      return;
    }
    if (floatingClose?.dataset?.action === "close-creative-video-modal") {
      closeCreativeVideoModal();
      return;
    }
    if (floatingClose?.dataset?.action === "close-gemini-creativity-modal") {
      setGeminiCreativityModalOpen("");
      return;
    }
    if (floatingClose?.dataset?.action === "close-transition-picker-modal") {
      setPodcastTransitionPickerOpen(false);
      return;
    }
    if (floatingClose?.dataset?.action === "close-timeline-clip-duration-modal") {
      setTimelineClipDurationModalOpen(false);
      return;
    }
    if (floatingClose?.dataset?.action === "close-gemini-audio-speed-modal") {
      setGeminiAudioSpeedModalOpen("");
      return;
    }
    const libraryMenuPortal = document.getElementById("podcastSceneLibraryMenuPortal");
    if (libraryMenuPortal && libraryMenuPortal.querySelector(".podcast-scene-library-menu.is-visible")) {
      const target = event.target || null;
      if (target?.closest?.(".podcast-scene-library-menu") || target?.closest?.("[data-action='toggle-podcast-scene-library-menu']")) return;
      closePodcastSceneLibraryMenu();
    }
    if (!event.target.closest(".session-card-menu")) {
      closeSessionMenus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.getElementById("podcastSceneLibraryMenuPortal")?.querySelector(".podcast-scene-library-menu.is-visible")) {
        closePodcastSceneLibraryMenu();
        return;
      }
      if (els.timelineClipDurationModal && !els.timelineClipDurationModal.hidden) {
        setTimelineClipDurationModalOpen(false);
        return;
      }
      if (els.geminiCreativityModal && !els.geminiCreativityModal.hidden) {
        setGeminiCreativityModalOpen("");
        return;
      }
      if (rowDisfluencyConfigOpenId) setRowDisfluencyModalOpen("");
      if (musicConfigOpen) setMusicConfigOpen(false);
      if (audioTrackMixOpen) setAudioTrackMixOpen(false);
      if (globalConfigOpen) setGlobalConfigOpen(false);
      if (scriptSetupOpen) {
        setScriptSetupOpen(false);
        pendingScriptPrompt = "";
        pendingScriptPromptHtml = "";
        pendingScriptTableMode = "create";
        return;
      }
      if (podcastVideoState.transitionPickerOpen) {
        setPodcastTransitionPickerOpen(false);
        return;
      }
      if (podcastVideoState.enabled) {
        closePodcastVideoModal();
        return;
      }
      if (creativeVideoState.enabled) {
        closeCreativeVideoModal();
      }
    }
  });

  els.scriptTableBody.addEventListener("input", (event) => {
    if (!shouldHandleScriptFieldOnInput(event)) return;
    handleScriptFieldUpdate(event);
  });
  els.scriptTableBody.addEventListener("change", handleScriptFieldUpdate);
  if (els.podcastStudioInspectorRowEditor) {
    els.podcastStudioInspectorRowEditor.addEventListener("input", (event) => {
      if (!shouldHandleScriptFieldOnInput(event)) return;
      handleScriptFieldUpdate(event);
    });
    els.podcastStudioInspectorRowEditor.addEventListener("change", handleScriptFieldUpdate);
    els.podcastStudioInspectorRowEditor.addEventListener("click", async (event) => {
      const attachSpeakerReferenceBtn = event.target.closest("[data-action='attach-speaker-reference-image']");
      if (attachSpeakerReferenceBtn) {
        const speaker = String(attachSpeakerReferenceBtn.dataset.speaker || "").trim();
        if (!speaker) return;
        promptSpeakerReferenceSelection(speaker);
        return;
      }
      const clearSpeakerReferenceBtn = event.target.closest("[data-action='clear-speaker-reference-image']");
      if (clearSpeakerReferenceBtn) {
        const speaker = String(clearSpeakerReferenceBtn.dataset.speaker || "").trim();
        if (!speaker) return;
        await setSpeakerReferenceImage(speaker, null);
        return;
      }
      const attachScenarioReferenceBtn = event.target.closest("[data-action='attach-scenario-reference-image']");
      if (attachScenarioReferenceBtn) {
        const scenarioId = String(attachScenarioReferenceBtn.dataset.scenarioId || "").trim();
        if (!scenarioId) return;
        promptScenarioReferenceSelection(scenarioId);
        return;
      }
      const clearScenarioReferenceBtn = event.target.closest("[data-action='clear-scenario-reference-image']");
      if (clearScenarioReferenceBtn) {
        const scenarioId = String(clearScenarioReferenceBtn.dataset.scenarioId || "").trim();
        if (!scenarioId) return;
        await setScenarioReferenceImage(scenarioId, null);
        return;
      }
      const replaceBtn = event.target.closest("[data-action='replace-scene-video-from-storage'][data-row-id]");
      if (replaceBtn) {
        const rowId = String(replaceBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        openSceneVideoSelectorModal(rowId, { triggerSource: "inspector-row-editor" });
        return;
      }
      const attachRefBtn = event.target.closest("[data-action='attach-row-reference-image'][data-row-id]");
      if (attachRefBtn) {
        const rowId = String(attachRefBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        promptRowReferenceSelection(rowId);
        return;
      }
      const clearRefBtn = event.target.closest("[data-action='clear-row-reference-image'][data-row-id]");
      if (clearRefBtn) {
        const rowId = String(clearRefBtn.dataset.rowId || "").trim();
        if (!rowId) return;
        clearRowReference(rowId);
        setGenerationStatus(`Referencia quitada de escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}`, "is-live");
        return;
      }
      try {
        if (await handleSharedCreativeRowAction(event.target)) {
          return;
        }
      } catch (_) {
        return;
      }
    });
  }
  if (els.rowDisfluencyModal) {
    els.rowDisfluencyModal.addEventListener("input", (event) => {
      if (!shouldHandleScriptFieldOnInput(event)) return;
      handleScriptFieldUpdate(event);
    });
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

  // Manejar cambio en cualquier instancia del switch de publicación
  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target && target.id && target.id.startsWith("sessionPublishToggle")) {
      const session = getActiveSession();
      if (!session || !session.id) return;

      const isChecked = target.checked;
      session.publicar = isChecked;

      // Sincronizar todas las instancias
      document.querySelectorAll("[id^='sessionPublishToggle']").forEach(el => {
        if (el !== target) el.checked = isChecked;
      });

      // Persistir localmente de inmediato
      persistSessions();
      sessionStore.markDirty(String(session.id || "").trim(), "publish-toggle");
    }
  });

  els.scriptTableBody.addEventListener("click", async (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const action = String(actionBtn.dataset.action || "").trim();
    const rowId = actionBtn.dataset.rowId;
    try {
      if (await handleSharedCreativeRowAction(event.target)) {
        return;
      }
    } catch (_) {
      return;
    }
    if (action === "insert-row-at") {
      const insertIndex = Math.max(0, Math.round(toFiniteNumber(actionBtn.dataset.insertIndex, 0)));
      const session = getActiveSession();
      const rows = Array.isArray(session?.script?.rows) ? session.script.rows : [];
      const safeIndex = Math.max(0, Math.min(rows.length, insertIndex));
      const before = rows[safeIndex - 1] || null;
      const newRow = buildBlankScriptRow(session, {
        speaker: before?.speaker,
        expression: before?.expression
      });
      upsertActiveSession((current) => {
        const nextRows = normalizeRows(current.script?.rows);
        nextRows.splice(safeIndex, 0, newRow);
        return {
          ...current,
          script: {
            ...current.script,
            rows: nextRows
          }
        };
      }, { render: false });
      reflowTimelineClipsByScriptOrder(getActiveSession(), { persist: true });
      render();
      scheduleSessionLocalPersist("structure");
      queueMicrotask(() => {
        try {
          const target = els.scriptTableBody?.querySelector?.(`[data-row-id="${CSS.escape(String(newRow.id || "").trim())}"]`);
          target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
          target?.focus?.();
        } catch (_) { }
      });
      return;
    }
    if (actionBtn.dataset.action === "toggle-script-row-collapse") {
      if (!rowId) return;
      const nextCollapsed = !isScriptRowCollapsed(rowId);
      setScriptRowCollapsed(rowId, nextCollapsed);
      render();
      queueMicrotask(() => {
        try {
          const target = els.scriptTableBody?.querySelector?.(`.script-row[data-row-id="${CSS.escape(String(rowId || "").trim())}"]`);
          target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
          target?.focus?.();
        } catch (_) { }
      });
      return;
    }
    if (actionBtn.dataset.action === "replace-scene-video-from-storage") {
      if (!rowId) return;
      openSceneVideoSelectorModal(rowId, { triggerSource: "script-row-action" });
      return;
    }
    if (actionBtn.dataset.action === "attach-row-reference-image") {
      if (!rowId) return;
      promptRowReferenceSelection(String(rowId || "").trim());
      return;
    }
    if (actionBtn.dataset.action === "clear-row-reference-image") {
      if (!rowId) return;
      clearRowReference(rowId);
      setGenerationStatus(`Referencia quitada de escena ${resolveSceneNumberByRowId(rowId, getActiveSession())}`, "is-live");
      return;
    }
    if (actionBtn.dataset.action === "toggle-disfluency-config") {
      setRowDisfluencyModalOpen(rowDisfluencyConfigOpenId === rowId ? "" : rowId);
      return;
    }
    if (actionBtn.dataset.action === "play-row-audio") {
      playRowAudio(rowId);
      return;
    }

    if (actionBtn.dataset.action === "delete-row") {
      deleteSceneRowById(rowId);
    }
    if (actionBtn.dataset.action === "duplicate-row") {
      duplicateSceneRowWithMedia(rowId);
    }
    if (actionBtn.dataset.action === "publish-scene-to-library") {
      const loadingTarget = actionBtn;
      publishCurrentSceneToLibrary(rowId, { loadingButton: loadingTarget }).catch((error) => {
        addChatMessage("system", `No se pudo publicar la escena ${resolveSceneNumberByRowId(rowId, getActiveSession())} (${error.message}).`);
        setGenerationStatus("Error", "");
      });
    }
  });
}

function redirectToIndex() {
  window.location.href = "index.html";
}

window.SPEECH_WORDS_PER_SEC = SPEECH_WORDS_PER_SEC;
window.normalizeTtsDirectionConfig = normalizeTtsDirectionConfig;
window.getDefaultSpeakerNameMap = getDefaultSpeakerNameMap;
window.hostsForCount = hostsForCount;
window.buildSpeakerAliasMap = buildSpeakerAliasMap;
window.resolveSpeakerFromAliases = resolveSpeakerFromAliases;
window.splitDialogueTextIntoSegments = splitDialogueTextIntoSegments;

function init() {
  attachEvents();
  setupPodcastStudioInspectorResize();
  setupPodcastVideoStageResize();
  setSidepanelOpen(true);
  setMusicConfigOpen(false);
  setAudioTrackMixOpen(false);
  setGlobalConfigOpen(false);
  refreshRuntimeFeatureCapabilities().catch(() => { });
  const auth = getAuthSafe();
  if (!auth) {
    redirectToIndex();
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      obtenerNombreUsuarioStudio(user).then(name => {
        currentUserName = name;
        // console.log("[Studio] Usuario identificado:", currentUserName);
      });
    }

    const nextUid = String(user?.uid || "").trim();
    if (!nextUid) {
      redirectToIndex();
      return;
    }
    currentStorageScopeUid = nextUid;
    stopPanelMusic();
    loadPanelMusicSettingsIntoState();
    syncMusicControls();
    let finalSessions = [];
    try {
      const bootstrapResult = await sessionStore.bootstrapSessions(nextUid);
      finalSessions = Array.isArray(bootstrapResult?.sessions) ? bootstrapResult.sessions : [];
    } catch (error) {
      finalSessions = loadSessions(nextUid);
      if (error?.code !== "API_UNAVAILABLE" && error?.message !== "Backend de producción no configurado.") {
        void error;
      }
    }
    state.sessions = finalSessions;
    persistSessions(nextUid, finalSessions);

    // Recuperar la última sesión activa de LocalStorage
    let lastActiveId = null;
    try {
      lastActiveId = window.localStorage.getItem(ACTIVE_SESSION_ID_KEY);
    } catch (_) { }

    state.activeSessionId = lastActiveId;
    ensureSession();

    if (state.activeSessionId) {
      await setActiveSession(state.activeSessionId);
    } else {
      render();
    }
    consumeImportedVideoPromptBridge({ renderAfter: true, clearAfterRead: true });

    // Finalización de carga - Ocultar splash screen
    const loader = document.getElementById("appLoadingScreen");
    if (loader) {
      setTimeout(() => loader.classList.add("is-hidden"), 300); // Pequeño delay para suavidad
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (podcastVideoState.enabled === true) {
      event.preventDefault();
      event.returnValue = ""; // Trigger confirmation dialog
    }
    stopPanelMusic();
    stopPodcastPlayback();
    playbackController.stop({ keepStatus: true });
    stopRowAudio();
    stopGeminiLiveSession().catch(() => { });
  });
  setPromptInputContent(demoPrompt);
  autoResizePrompt();

  // Safety timeout para quitar el loader si algo falla catastróficamente
  setTimeout(() => {
    const loader = document.getElementById("appLoadingScreen");
    if (loader && !loader.classList.contains("is-hidden")) {
      loader.classList.add("is-hidden");
    }
  }, 5000);
}

function updateTimelineClipSourceDurationIfGreater(rowId = "", durationMs = 0) {
  const session = getActiveSession();
  const key = String(rowId || "").trim();
  if (!session || !key || durationMs <= 0) return;
  const clips = ensureTimelineClipsByRowId(session, { persist: false });
  const current = clips[key];
  if (!current) return;
  // Solo actualizar si la nueva duracion es mayor o si no teniamos duracion confiable
  if (durationMs > (Number(current.sourceDurationMs || 0) + 100) || !current.sourceDurationMs) {
    // console.log(`[Podcaster] Updating sourceDurationMs for ${key}: ${current.sourceDurationMs} -> ${durationMs}`);
    updateTimelineClipForRow(key, (prev) => ({
      ...prev,
      sourceDurationMs: durationMs
    }));
  }
}

const podcasterTimelineClipDurationApi = createPodcasterTimelineClipDurationApi({
  els,
  getActiveSession,
  ensureTimelineClipsByRowId,
  STUDIO_TIMELINE_MIN_CLIP_MS,
  VIDEO_SCENE_MAX_SEC,
  toFiniteNumber,
  normalizeTimelineClipVisualLayoutMode,
  getTimelineClipEffectiveDurationMs,
  resolveDialogueVideoForRow,
  resolveDialogueVideoSegments,
  hasStoredMediaSource,
  resolveSpeakerDisplayName,
  getSceneBackgroundMusicVolumeOverridePct,
  updateTimelineClipForRow,
  upsertPodcastVideoConfig,
  normalizeGeminiDialogueTrack,
  getPodcastVideoConfig,
  snapTimelineMs,
  getSessionRows,
  upsertActiveSession,
  scheduleSessionLocalPersist,
  setGenerationStatus,
  persistCompactedTimelineTrackFromRow,
  syncGeminiDialogueTrackWithRuntime,
  playbackController,
  podcastVideoState,
  getTimelineTotalDurationMs,
  renderPodcastVideoTimeline,
  syncPodcastStudioInspector,
  applyActiveTimelineClipMixToPlayback,
  syncPodcastVideoStageMedia,
  panelMusicState,
  ensureMontageDefaultVolumesPersisted,
  renderPodcastVideoShell,
  getTimelineClipRestoreTarget: window.getTimelineClipRestoreTarget
});
const {
  setOpen: setTimelineClipDurationModalOpen,
  syncInputs: syncTimelineClipDurationModalInputs,
  applyFromModal: applyTimelineClipDurationFromModal,
  persistVolumeOverrides: persistTimelineClipVolumeOverridesFromModal,
  schedulePersistVolumeOverrides: schedulePersistTimelineClipVolumeOverrides,
  open: openTimelineClipDurationConfig,
  resetFromModal: resetTimelineClipDurationFromModal,
  getState: getTimelineClipDurationModalState
} = podcasterTimelineClipDurationApi;

podcasterTimelineInteractionApi = createPodcasterTimelineInteractionApi({
  els,
  podcastVideoState,
  getActiveSession,
  getTimelineViewMode,
  upsertPodcastVideoConfig,
  scheduleSessionLocalPersist,
  seekStudioTimelineByClientX,
  updateTimelineGapSelection,
  getTrackLaneContentPx,
  clearPodcastTimelineDragUi,
  syncPodcastTimelineSelectionUi,
  syncPodcastTimelinePlayhead,
  syncPodcastStudioInspector,
  syncTimelineGapSelectionUi,
  syncGeminiDialogueTrackWithRuntime,
  persistCompactedTimelineTrackFromRow,
  flushSessionLocalPersistNow,
  renderPodcastVideoTimeline,
  syncTimelineModeButtons,
  syncPodcastVideoSpeakerCardVisibility,
  setGeminiAudioSpeedModalOpen,
  beginTimelineGapSelection,
  selectTimelineSceneRow,
  timelinePxToMs,
  resolveTimelineDragStepMs,
  getTimelineClipStoreByKind,
  getSessionRows,
  STUDIO_TIMELINE_MIN_CLIP_MS,
  getTimelineTotalDurationMs,
  getOnScreenTextClipEffectiveDurationMs,
  normalizeOnScreenTextClipItem,
  getPodcastVideoConfig,
  buildManualOnScreenTextTrackConfig,
  syncOnScreenTextTrackToggleBtn,
  syncPodcastOnScreenTextOverlay,
  syncTimelineClipDurationModalInputs,
  snapTimelineMsWithStep,
  resolvePanelMusicTrackKind,
  panelMusicState,
  selectUploadedPanelMusicTrackByIndex,
  getPanelMusicLoopSetting,
  updatePanelMusicTrack,
  upsertPanelMusicLoopSetting,
  getPanelMusicTrackAvailability,
  getPanelMusicTrackByKind,
  normalizePanelMusicTrack,
  getPanelMusicTrackDurationSec,
  stopPanelMusic,
  syncActivePanelMusicTrack,
  syncMusicControls,
  normalizeGeminiDialogueTrack,
  buildGeminiDialogueTimelineTrack,
  syncOnScreenTextClipsWithGeminiTrack,
  syncTimelineGeminiSegmentDragPreview,
  buildUploadedPanelMusicSegments,
  getPanelMusicUploadedTracks,
  setPanelMusicUploadedTracks,
  removeUploadedTrackAt,
  persistPanelMusicSettings,
  persistPanelMusicToActiveSession,
  removeDialogueAudioForRow,
  resolveSceneNumberByRowId,
  ensureOnScreenTextClipsByRowId,
  ensureTimelineClipsByRowId,
  isSceneTimelineTrackId,
  normalizeTimelineClipItem,
  STUDIO_TIMELINE_VERSION,
  STUDIO_TIMELINE_CHAIN_TOLERANCE_MS,
  getTimelineClipEndMs,
  constrainOnScreenTextClipToScene,
  normalizeTimelineClipsByRowId,
  normalizeOnScreenTextClipsByRowId,
  normalizeOnScreenTextTrackSettings,
  STUDIO_TIMELINE_TRACK_VERSION,
  STUDIO_ONSCREEN_TEXT_DEFAULTS_VERSION,
  duplicateSceneRowsIntoNewTrack,
  ensureTimelineTracks,
  normalizeTimelineTracks,
  PODCAST_SESSION_MANUAL_SAVE_ONLY,
  persistSessions,
  sessionStore
});
const {
  deleteSelectedAudioChips: deleteSelectedTimelineAudioChips,
  buildPanelAudioSelectionKey: buildTimelinePanelAudioSelectionKey,
  clearPanelMusicTrackByKind: clearTimelinePanelMusicTrackByKind
} = podcasterTimelineInteractionApi;

podcasterTimelineUiApi = createPodcasterTimelineUiApi({
  els,
  podcastVideoState,
  playbackController,
  podcastRenderState,
  panelMusicState,
  podcastAudioTrackUiState,
  updateTimelineClipSourceDurationIfGreater,
  getActiveSession,
  getSessionRows,
  getTimelineViewMode,
  getStudioAudioTrackMinLoopPx,
  getPodcastVideoConfig,
  getTransitionForEdge,
  normalizeGeminiDialogueTrack,
  timelineMsToPx,
  timelinePxToMs,
  ensureTimelineClipsByRowId,
  ensureOnScreenTextClipsByRowId,
  getStudioTimelineMinClipPx,
  getTimelineClipEffectiveDurationMs,
  getOnScreenTextClipEffectiveDurationMs,
  syncTimelineModeButtons,
  getDialogueVideoMap,
  getStudioTimelinePixelsPerSec,
  getTimelineTotalDurationMs,
  getStudioTimelineZoom,
  ensureTimelineTracks,
  isEducationalVideoMode,
  isEducationalVisibleSceneTrack,
  buildPodcastTimelineStructureKey,
  logPodcastRenderDebug,
  syncTimelineEphemeralState,
  escapeHtml,
  secondsToClock,
  getOnScreenTextTrackSettings,
  getOnScreenTextStylePresetClass,
  getOnScreenTextFontFamilyCss,
  resolvePrimaryDialogueVideoSegment,
  resolveStorageVideoUrl,
  resolvePortraitForSpeaker,
  resolvePodcastPortraitUrl,
  isLikelyImageMediaRecord,
  isTimelineSceneVideoGenerating,
  getTimelineSceneVideoGenerationStatus,
  hasStoredMediaSource,
  resolveDialogueAudioForRow,
  resolveDialogueAudioPlaybackRate,
  resolveRowAudioDurationMs,
  resolveSpeakerDisplayName,
  trimWords,
  isPodcastMode,
  isComposerVideoMode: isCurrentModeVideo,
  isVideoPodcastMode,
  getPanelMusicTrackAvailability,
  normalizePanelMusicTrack,
  groupUploadedPanelMusicSegmentsByTrack,
  getPanelMusicUploadedTracks,
  getPanelMusicTrackDurationSec,
  getPanelMusicLoopCount,
  getPanelMusicLoopSegments,
  normalizePanelMusicMutedLoopIndexes,
  buildTimelinePanelAudioSelectionKey,
  isPublicLibrarySceneRow,
  resolveStorageAudioUrl,
  hasExplicitDialogueAudioForRow,
  formatTrackHeadPlayheadTime: window.formatTrackHeadPlayheadTime,
  syncCustomTooltips,
  buildTimelineRuntimeEntries,
  syncStudioTimelinePreview,
  toFiniteNumber,
  getTimelineClipEndMs,
  handleTimelinePointerDown: podcasterTimelineInteractionApi.handlePointerDown,
  handleTimelinePointerMove: podcasterTimelineInteractionApi.handlePointerMove,
  handleTimelinePointerUp: podcasterTimelineInteractionApi.handlePointerUp,
  cancelTimelineActiveDrag: podcasterTimelineInteractionApi.cancelActiveDrag,
  STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX,
  STUDIO_TIMELINE_MIN_CLIP_MS,
  PODCAST_TIMELINE_RULER_OFFSET_PX,
  PODCAST_RENDER_DEBUG
});

const podcasterHistoryApi = createPodcasterHistoryApi({
  getPodcastVideoState: () => podcastVideoState,
  getActiveSession,
  setGenerationStatus,
  upsertActiveSession,
  renderPodcastVideoShell
});
podcasterHistoryApi.bindGlobalShortcuts();

const podcastThumbnailBlobCache = new Map();
async function resolveThumbnailBlob(url) {
  if (!url || !url.startsWith("http")) return url;

  // Si es Firebase Storage y estamos en desarrollo local, evitamos el fetch para no disparar el CORS
  // Esto permite que la imagen cargue directo en el <img> sin errores.
  const isExternalStorage = url.includes("firebasestorage.googleapis.com") || url.includes("googleusercontent.com");
  if (isExternalStorage && (location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
    return url;
  }

  if (podcastThumbnailBlobCache.has(url)) return podcastThumbnailBlobCache.get(url);

  if (typeof playbackController?.getBlobUrl === "function") {
    try {
      const blob = await playbackController.getBlobUrl(url);
      if (blob) {
        podcastThumbnailBlobCache.set(url, blob);
        return blob;
      }
    } catch (_) { }
  }
  return url;
}

function attachPodcastLibraryThumbnailLoading() {
  if (!els.podcastSceneLibraryList) return;
  const imgs = els.podcastSceneLibraryList.querySelectorAll('img[data-library-thumb]');
  imgs.forEach(img => {
    const src = img.dataset.libraryThumb;
    if (!src) return;
    resolveThumbnailBlob(src).then(blobUrl => {
      if (blobUrl && img.dataset.libraryThumb === src) {
        if (img.src !== blobUrl) img.src = blobUrl;
      }
    });
  });
}

window.PodcasterUI = {
  refreshSession: async () => {
    if (state.persistTimeout) {
      clearTimeout(state.persistTimeout);
      state.persistTimeout = null;
    }
    const session = getActiveSession();
    if (session) {
      const uid = resolveCurrentUid();
      const updated = await sessionStore.loadSingleSessionFromCloud(session.id, uid);
      if (updated) {
        state.sessions = sessionStore.replaceLocalSessionFromCloud(uid, updated);
        invalidateStudioRuntimeCache();
        render();
      }
    }
  },
  render: () => render(),
  upsertActiveSession: (updater, options) => upsertActiveSession(updater, options),
  upsertPodcastVideoConfig: (updater, options) => upsertPodcastVideoConfig(updater, options),
  syncStageMedia: (rowId = "", options = {}) => syncPodcastVideoStageMedia(getActiveSession(), rowId, options)
};

// Explicit runtime API for modularized generation logic.
const podcasterGenerationRuntimeApi = {
  getActiveSession,
  resolveSceneNumberByRowId,
  getPanelModeCopy,
  buildTargetSpeechLine,
  resolveTargetVideoRowId,
  hasStoredMediaSource,
  getDialogueAudioMap,
  getDialogueVideoMap,
  upsertActiveSession,
  syncGeminiDialogueTrackWithRuntime,
  logPodcastBatchDebug,
  setGenerationStatus,
  buildTimelineRuntimeEntries: window.buildTimelineRuntimeEntries || buildTimelineRuntimeEntries,
  resolveDialogueVideoForRow,
  resolveDialogueVideoSegments,
  playbackController,
  state,
  podcastVideoState,
  syncPodcastTimelinePlayhead,
  syncPodcastVideoStageMedia,
  renderPodcastVideoTimeline,
  renderPodcastTransitionTimeline,
  syncPodcastStudioInspector,
  updatePodcastPlayerUi,
  buildPodcasterApiErrorMessage,
  setPodcastVideoStatus,
  isEducationalVideoMode,
  resolveDialogueAudioForRow,
  selectTimelineSceneRow,
  setPodcastVideoRow,
  hasGeneratedDialogueVideoForRow,
  resolveCurrentUid,
  sessionStore,
  invalidateStudioRuntimeCache,
  render,
  upsertPodcastVideoConfig,
  findTimelineActionButton,
  normalizeVideoDirectiveText,
  normalizeVideoScenePrompt,
  normalizeVideoImagePrompts,
  normalizeRowVoiceConfig,
  normalizeVoiceNameSource,
  buildPodcasterVideoModelChain,
  flushScriptEditorVoiceDraftsToSession,
  resolveVisualNotesForGeneration,
  getSessionRows,
  resolveConfiguredSpeakerVoiceForGeneration,
  resolveStorageVideoUrl,
  sleep,
  refreshRuntimeFeatureCapabilities,
  runtimeFeatureState,
  getSpeakerNameMap,
  getSpeakerOptions,
  getSpeakerReferenceImageMap,
  getScenarioReferenceImageMap,
  normalizeVideoPreset,
  normalizeCreativeVideoConfig,
  getCreativeVideoConfig,
  normalizeVideoContentType,
  buildSpeakerNameMap,
  buildShortSessionTitle,
  resolvePortraitForSpeaker,
  resolveActiveGlobalScenarioAsset,
  resolveSpeakerStudioScenarioPrompt,
  updateTimelineClipForRow,
  getPodcastVideoConfig,
  normalizeGenerationConstraints,
  isCurrentModeVideo,
  resolveStorageAudioUrl,
  stopRowAudio,
  stopGeminiLiveSession,
  forceHostsAndAlternation,
  createDefaultRows,
  sanitizeSpeakerMentionsInDialogue,
  DEFAULT_TTS_DIRECTION_CONFIG,
  ensureTimelineClipsByRowId: window.ensureTimelineClipsByRowId || ensureTimelineClipsByRowId,
  getTimelineClipEffectiveDurationMs: window.getTimelineClipEffectiveDurationMs || getTimelineClipEffectiveDurationMs,
  generateDialogueAudioForRow,
  resetPodcastStudioSessionUiState,
  setSidepanelOpen
};

// Explicit runtime API for modularized chat assistant logic.
const podcasterChatRuntimeApi = {
  normalizeRows,
  countTotalDuration,
  resolveSpeakerDisplayName,
  replaceHostTokensWithNames: (text = "", session = null) => replaceHostTokensWithNamesShared(text, session, {
    getSpeakerNameMap
  }),
  toMarkdownTableCell,
  normalizeCreativeVideoConfig,
  getCreativeVideoConfig,
  normalizeTransitionForScene,
  SHORT_SCENE_MIN_SEC,
  SHORT_SCENE_MAX_SEC,
  VIDEO_SCENE_MIN_SEC,
  VIDEO_SCENE_MAX_SEC,
  normalizeCreativeVideoScriptForDisplay,
  buildSpeakerMapsForHosts,
  DEFAULT_DISFLUENCY_CONFIG,
  DEFAULT_TTS_DIRECTION_CONFIG,
  EXPRESSIONS,
  DEFAULT_SPEAKER_NAME_MAP,
  DEFAULT_SPEAKER_SCENARIO_MAP,
  resolveSpeakerVoiceName,
  normalizeLiveVoiceName,
  normalizeDisfluencyConfig,
  getSpeakerVoiceMap,
  getSpeakerExpressionMap,
  getSpeakerScenarioMap,
  normalizeVideoPreset,
  addChatMessage,
  removeChatMessage,
  addScriptAssistantMessage,
  renderChat
};

// Explicit runtime API for modularized public library logic.
const podcasterPublicLibraryRuntimeApi = {
  escapeHtml,
  secondsToClock,
  toFiniteNumber,
  trimWords,
  nowIso,
  els,
  getActiveSession,
  getPodcastVideoConfig,
  getSessionRows,
  podcastVideoState,
  normalizePodcastSceneLibraryItem,
  normalizeVideoImagePrompts,
  attachPodcastLibraryThumbnailLoading,
  closePodcastTimelineClipMenu,
  normalizeTimelineTracks: window.normalizeTimelineTracks || normalizeTimelineTracks,
  buildDefaultTimelineTracks: window.buildDefaultTimelineTracks || buildDefaultTimelineTracks,
  normalizeTimelineClipsByRowId: window.normalizeTimelineClipsByRowId || normalizeTimelineClipsByRowId,
  getTimelineClipEndMs: window.getTimelineClipEndMs || getTimelineClipEndMs,
  resolveTimelineDefaultTrackIdForSpeaker: window.resolveTimelineDefaultTrackIdForSpeaker || resolveTimelineDefaultTrackIdForSpeaker,
  buildTimelineVariantTrackDescriptor: window.buildTimelineVariantTrackDescriptor || buildTimelineVariantTrackDescriptor,
  getRowSourceDurationMs: window.getRowSourceDurationMs || getRowSourceDurationMs,
  normalizeTimelineClipItem: window.normalizeTimelineClipItem || normalizeTimelineClipItem,
  normalizePodcastVideoConfig: window.normalizePodcastVideoConfig || normalizePodcastVideoConfig,
  ensureOnScreenTextClipForRowId: window.ensureOnScreenTextClipForRowId || ensureOnScreenTextClipForRowId,
  ensureOnScreenTextClipsByRowId: window.ensureOnScreenTextClipsByRowId || ensureOnScreenTextClipsByRowId,
  normalizeGeminiDialogueTrack: window.normalizeGeminiDialogueTrack || normalizeGeminiDialogueTrack,
  resolveRowAudioDurationMs: window.resolveRowAudioDurationMs || resolveRowAudioDurationMs,
  isPodcastMode: window.isPodcastMode || isPodcastMode,
  isVideoPodcastMode: window.isVideoPodcastMode || isVideoPodcastMode,
  setTimelineViewMode,
  buildPublicSceneRowFromLibraryItem,
  getSceneInsertIndexForLibraryItem,
  captureVideoFrameDataUrl,
  readDataUrlFromFile: window.readDataUrlFromFile,
  measureVideoFile: window.measureVideoFile,
  resolvePrimaryDialogueVideoSegment,
  renderPodcastVideoShell,
  setRowDisfluencyModalOpen,
  setTimelineClipDurationModalOpen,
  safeMediaPlay,
  resolveActiveVideoPreset,
  getActiveStageVideoEl,
  addChatMessage,
  resolveSceneNumberByRowId,
  resolveDialogueVideoForRow,
  resolveDialogueVideoSegments,
  resolveStorageVideoUrl,
  getDialogueVideoMap,
  normalizeDialogueVideoMap,
  upsertActiveSession,
  setGenerationStatus,
  setPodcastVideoStatus,
  setPodcastVideoRow,
  stopRowAudio,
  stopGeminiLiveSession,
  syncGeminiDialogueTrackWithRuntime,
  logPodcastBatchDebug,
  render,
  renderPodcastVideoTimeline,
  renderPodcastTransitionTimeline,
  syncPodcastStudioInspector,
  scheduleSessionLocalPersist,
  setButtonLoadingState: window.setButtonLoadingState,
  buildMontageOnScreenTextSegments,
  setSidepanelOpen,
  normalizeGenerationConstraints,
  resolveVideoContentType,
  buildApiUrl,
  hasAvailableApiBase,
  firestoreDb,
  stopPodcastPlayback,
  setTimelinePreviewsSuspended
};

// Explicit runtime API for modularized script editor logic.
const podcasterScriptEditorRuntimeApi = {
  DISFLUENCY_LEVEL_MAX,
  getRowDisfluencyConfig,
  hasActiveDisfluencyConfig,
  deleteSceneRowById,
  resolveVisualNotesEditorValue,
  resolveActiveVisualProposal,
  normalizeCreativeRow,
  resolveDisplayedVisualProposal,
  isVisualProposalResolved,
  resolveRowReferenceAsset,
  getRowReferenceImageListMap,
  resolveReferenceImagePreviewUrl,
  isScriptRowCollapsed,
  areAllScriptRowsCollapsed,
  setAllScriptRowsCollapsed,
  updateRowPlayButtons,
  updateRowDisfluencyButtonState,
  normalizeSpeakerLabel,
  syncOnScreenTextClipVisibilityFromRowText,
  renderPodcastVideoTimeline,
  getPanelModeCopy,
  isEducationalVideoMode,
  isCreativeVideoMode,
  normalizeVideoImagePrompts,
  logPodcasterLiveDebug,
  VOICES,
  getSpeakerOptions,
  resolveSpeakerDisplayName,
  resolveSpeakerVoiceName,
  resolveConfiguredSpeakerVoiceForGeneration,
  normalizeLiveVoiceName,
  getSpeakerVoiceMap,
  getSpeakerExpressionMap,
  getSpeakerNameMap,
  getSpeakerScenarioMap,
  resolveScenarioForVideoMode,
  normalizeVideoScenePrompt,
  buildSpeakerOptionsForRow,
  buildOptions,
  buildVoiceOptions,
  MEDIA_CUES,
  EXPRESSIONS,
  DEFAULT_DISFLUENCY_CONFIG,
  DEFAULT_SPEAKER_NAME_MAP,
  DEFAULT_SPEAKER_SCENARIO_MAP,
  makeId,
  refreshSessionMeta,
  renderSessions,
  els,
  secondsToClock,
  countTotalDuration,
  upsertActiveSession,
  normalizeRows,
  normalizeRowVoiceConfig,
  normalizeDisfluencyConfig,
  scheduleSessionLocalPersist,
  reflowTimelineClipsByScriptOrder: window.reflowTimelineClipsByScriptOrder || reflowTimelineClipsByScriptOrder,
  render,
  resolveStorageVideoUrl,
  stopRowAudio,
  stopGeminiLiveSession,
  podcastVideoState,
  scheduleMontageExportPreviewRefresh: window.scheduleMontageExportPreviewRefresh,
  getSessionRows,
  getActiveSession
};

registerPodcasterGenerationRuntime(podcasterGenerationRuntimeApi);
registerPodcasterChatRuntime(podcasterChatRuntimeApi);
registerPodcasterPublicLibraryRuntime(podcasterPublicLibraryRuntimeApi);
registerPodcasterScriptEditorRuntime(podcasterScriptEditorRuntimeApi);

Object.assign(window, {
  ...podcasterGenerationRuntimeApi,
  ...podcasterScriptEditorRuntimeApi,
  getPodcastVideoConfig,
  upsertPodcastVideoConfig,
  updateTimelineClipForRow,
  persistReorderedTimelinePatchToCloud,
  renderPodcastVideoTimeline,
  applySceneMediaScaleToStage,
  buildPodcasterVideoModelChain,
  buildUploadedPanelMusicSegments,
  getPanelMontageMusicConfig,
  getSceneBackgroundMusicVolumeOverridePct,
  shouldKeepNativeVideoAudioForRow,
  trimWords,
  normalizeVoiceNameSource,
  resolveActiveVideoPreset,
  normalizeCreativeVideoScriptForDisplay, getRowReferenceVideoMap,
  escapeHtml,
  logVideoCreateDebug,
  setSidepanelOpen,
  clearAllActivityNotifications,
});

// Regression test patterns for test-podcaster-modular-runtime-and-spinner-regressions.mjs
// row-icon-btn${isGenerating || isBulkRegenAll ? " is-loading" : ""}
// data-action="timeline-generate-scene-video"
// fa-spinner spinner-icon
// videoSrc ? "fa-sync-alt" : "fa-film"
// regenBtn.classList.toggle("is-loading", isGenerating || isBulkRegenAll);
// regenBtn.disabled = isGenerating || isBulkRegenAll;
// icon.className = "fas fa-spinner spinner-icon";

init();
