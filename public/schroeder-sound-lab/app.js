import { authFetchJson } from "../js/api-client.js";
import { auth } from "../js/firebase-instance.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { populateVoiceSelectors } from "./voices.js";
import {
  makeSession, listSessions, loadSession, saveSession, deleteSession, listUsers,
  configureLocalSessions, approveAudio, discardPreview, listPendingPreviews, deleteApprovedAudio, renameApprovedAudio, addApprovedAudioToPodcaster,
  listApprovedAudio, WORKSPACE_TYPE
} from "./sessions.js";
import { renderLibrary, createAudioPlayer, downloadAudio } from "./audio-library.js";
import { isMusicCreationRequest, resolveMusicDraftPrompt } from "./creation-intent.mjs";

const $ = (id) => document.getElementById(id);
const elements = {
  grid: document.querySelector(".ssl-grid"), leftResizer: $("sslLeftResizer"), rightResizer: $("sslRightResizer"),
  adminBtn: $("sslAdminBtn"), ownerFilter: $("sslOwnerFilter"), ownerSelect: $("sslOwnerSelect"),
  themeBtn: $("sslThemeBtn"), generalSettingsBtn: $("sslGeneralSettingsBtn"), agentSettingsBtn: $("sslAgentSettingsBtn"),
  agentModal: $("sslAgentModal"), generalModal: $("sslGeneralModal"), defaultMusicModel: $("sslDefaultMusicModel"), fontSize: $("sslFontSize"),
  voiceCloneModal: $("sslVoiceCloneModal"), voiceCloneForm: $("sslVoiceCloneForm"), cloneVoiceBtn: $("sslCloneVoiceBtn"), createVoiceBtn: $("sslCreateVoiceBtn"),
  voiceCloneName: $("sslVoiceCloneName"), voiceCloneLanguage: $("sslVoiceCloneLanguage"), recordVoiceSampleBtn: $("sslRecordVoiceSampleBtn"), recordConsentBtn: $("sslRecordConsentBtn"), voiceSampleStatus: $("sslVoiceSampleStatus"), voiceConsentStatus: $("sslVoiceConsentStatus"), voiceSamplePreview: $("sslVoiceSamplePreview"), voiceConsentPreview: $("sslVoiceConsentPreview"), voiceOwnership: $("sslVoiceOwnership"), voiceSampleScript: $("sslVoiceSampleScript"), voiceConsentPhrase: $("sslVoiceConsentPhrase"), customVoiceStatus: $("sslCustomVoiceStatus"),
  newSessionBtn: $("sslNewSessionBtn"), newCreationBtn: $("sslNewCreationBtn"), creationSummary: $("sslCreationSummary"),
  sessionSearch: $("sslSessionSearch"), sessionList: $("sslSessionList"), sessionTitle: $("sslSessionTitle"),
  chatModeLabel: $("sslChatModeLabel"), musicControls: $("sslMusicControls"), voiceControls: $("sslVoiceControls"),
  musicType: $("sslMusicType"), musicModel: $("sslMusicModel"), musicDuration: $("sslMusicDuration"), genre: $("sslGenre"),
  musicLanguage: $("sslMusicLanguage"), bpm: $("sslBpm"), key: $("sslKey"), lyrics: $("sslLyrics"),
  voiceFormat: $("sslVoiceFormat"), voiceLanguage: $("sslVoiceLanguage"), voiceName: $("sslVoiceName"),
  voiceStyle: $("sslVoiceStyle"), voiceText: $("sslVoiceText"), chatFeed: $("sslChatFeed"),
  composer: $("sslComposer"), prompt: $("sslPrompt"), recordIdeaBtn: $("sslRecordIdeaBtn"),
  recordedReference: $("sslRecordedReference"), recordedAudio: $("sslRecordedAudio"), recordedPlayBtn: $("sslRecordedPlayBtn"), recordedLabel: $("sslRecordedLabel"),
  recordedProgress: $("sslRecordedProgress"), recordedDuration: $("sslRecordedDuration"), recordedRemoveBtn: $("sslRecordedRemoveBtn"),
  geminiModelPicker: $("sslGeminiModelPicker"), geminiModel: $("sslGeminiModel"),
  quickMusicSettings: $("sslQuickMusicSettings"), quickDuration: $("sslQuickDuration"), quickMusicType: $("sslQuickMusicType"),
  quickVoiceSettings: $("sslQuickVoiceSettings"), toolbarVoiceFormat: $("sslToolbarVoiceFormat"), toolbarVoiceName: $("sslToolbarVoiceName"), toolbarVoiceLanguage: $("sslToolbarVoiceLanguage"), toolbarVoiceStyle: $("sslToolbarVoiceStyle"),
  quickGenrePicker: $("sslQuickGenrePicker"), quickGenre: $("sslQuickGenre"),
  quickLanguage: $("sslQuickLanguage"), quickBpm: $("sslQuickBpm"), singerProfile: $("sslSingerProfile"),
  voiceMenuBtn: $("sslVoiceMenuBtn"), voiceMenu: $("sslVoiceMenu"), singerMenu: $("sslSingerMenu"),
  voiceConfigTrigger: document.querySelector(".ssl-voice-config-trigger"), singerLanguageLabel: $("sslSingerLanguageLabel"),
  libraryList: $("sslLibraryList"), libraryCount: $("sslLibraryCount"), librarySearch: $("sslLibrarySearch"),
  nowPlaying: $("sslNowPlaying")
};

const SETTINGS_KEY = "schroeder-sound-lab:preferences:v1";
const RECORDED_REFERENCE_KEY = "schroeder-sound-lab:pending-recording:v1";
const COMPOSER_DRAFTS_KEY = "schroeder-sound-lab:composer-drafts:v1";
const AUDIO_ANALYSIS_MODEL = "gemini-3.8-flash";
const LYRIA_MODELS = new Set(["lyria-3.5", "lyria-3-pro-preview", "lyria-3-clip-preview"]);
const SINGER_PROFILES = Object.freeze({
  "female-soprano": { label: "Soprano femenina", prompt: "Female soprano with a clear crystalline timbre, agile soaring delivery, and bright airy texture" },
  "female-alto": { label: "Alto femenina", prompt: "Female alto with a warm rich lower register, rounded tone, and grounded expressive delivery" },
  "male-tenor": { label: "Tenor masculino", prompt: "Male tenor with a bright resonant upper register, agile phrasing, and expressive delivery" },
  "male-baritone": { label: "Barítono masculino", prompt: "Male baritone with a deep warm resonance, full-bodied tone, and controlled delivery" },
  "weathered-rocker": { label: "Rockero áspero", prompt: "Weathered male rock vocalist with a gritty raspy timbre, forceful projection, and intense delivery" }
});
const VOICE_CONSENT_PHRASES = Object.freeze({
  "es-US": "Soy el propietario de esta voz y doy mi consentimiento para que Google la utilice para crear un modelo de voz sintética.",
  "en-US": "I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model.",
  "fr-FR": "Je suis le propriétaire de cette voix et j'autorise Google à utiliser cette voix pour créer un modèle de voix synthétique.",
  "pt-BR": "Eu sou o proprietário desta voz e autorizo o Google a usá-la para criar um modelo de voz sintética.",
  "de-DE": "Ich bin der Eigentümer dieser Stimme und bin damit einverstanden, dass Google diese Stimme zur Erstellung eines synthetischen Stimmmodells verwendet.",
  "it-IT": "Sono il proprietario di questa voce e acconsento che Google la utilizzi per creare un modello di voce sintetica.",
  "ja-JP": "私はこの音声の所有者であり、Googleがこの音声を使用して音声合成モデルを作成することを承認します。"
});
const VOICE_SAMPLE_SCRIPTS = Object.freeze({
  "es-US": "Hola, esta es una muestra de mi voz. Hoy estoy preparando una grabación clara y natural, con pausas breves y distintos tonos para que el resultado conserve mi forma de hablar.",
  "en-US": "Hello, this is a sample of my voice. Today I am preparing a clear and natural recording, with brief pauses and different tones so the result preserves the way I speak.",
  "fr-FR": "Bonjour, voici un échantillon de ma voix. Je prépare un enregistrement clair et naturel, avec de courtes pauses et plusieurs intonations pour préserver ma façon de parler.",
  "pt-BR": "Olá, esta é uma amostra da minha voz. Estou preparando uma gravação clara e natural, com pausas breves e diferentes tons para preservar a forma como falo.",
  "de-DE": "Hallo, dies ist eine Sprachprobe von mir. Ich erstelle eine klare und natürliche Aufnahme mit kurzen Pausen und verschiedenen Tonlagen, damit meine Sprechweise erhalten bleibt.",
  "it-IT": "Ciao, questo è un campione della mia voce. Sto preparando una registrazione chiara e naturale, con brevi pause e diverse intonazioni per conservare il mio modo di parlare.",
  "ja-JP": "こんにちは、これは私の声のサンプルです。自然で明瞭な録音になるように、短い間といくつかの抑揚を入れて話します。"
});
const terminalJobStatuses = new Set(["ready", "error", "failed", "cancelled"]);
const runningPolls = new Map();
const state = { currentUser: null, isAdmin: false, sessions: [], active: null, mode: "music", ownerId: "" };
const player = createAudioPlayer(elements.nowPlaying);
const recorderState = { recorder: null, stream: null, chunks: [], stopTimer: 0, startedAt: 0, pendingBlob: null, pendingEditItem: null, pendingDurationSec: 0, previewUrl: "", chatPreviewUrl: "", preparedDraftId: "" };
let settingsPersistTimer = 0;
let composerPersistTimer = 0;
populateVoiceSelectors(elements.voiceLanguage, elements.voiceName);
populateVoiceSelectors(elements.toolbarVoiceLanguage, elements.toolbarVoiceName);

function syncToolbarVoiceControls() {
  elements.toolbarVoiceFormat.value = elements.voiceFormat.value;
  elements.toolbarVoiceLanguage.value = elements.voiceLanguage.value;
  elements.toolbarVoiceName.value = elements.voiceName.value;
  elements.toolbarVoiceStyle.value = elements.voiceStyle.value;
}

syncToolbarVoiceControls();

function refreshCustomVoiceOptions(selectedId = "") {
  elements.voiceName.querySelector("optgroup[data-custom-voices]")?.remove();
  const customVoices = Array.isArray(readPreferences().customVoices) ? readPreferences().customVoices : [];
  if (customVoices.length) {
    const group = document.createElement("optgroup");
    group.label = "Mis voces";
    group.dataset.customVoices = "true";
    customVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = String(voice.id || "");
      option.textContent = String(voice.displayName || "Mi voz");
      group.append(option);
    });
    elements.voiceName.prepend(group);
  }
  if (selectedId && [...elements.voiceName.options].some((option) => option.value === selectedId)) elements.voiceName.value = selectedId;
  elements.customVoiceStatus.textContent = customVoices.length ? `${customVoices.length} ${customVoices.length === 1 ? "voz propia" : "voces propias"}` : "Voz propia";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function setupFloatingTooltips() {
  const tooltip = document.createElement("div");
  tooltip.id = "sslFloatingTooltip";
  tooltip.className = "ssl-floating-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  let owner = null;
  let positionFrame = 0;

  const hide = (expectedOwner = null) => {
    if (expectedOwner && owner !== expectedOwner) return;
    if (owner?.getAttribute("aria-describedby") === tooltip.id) owner.removeAttribute("aria-describedby");
    owner = null;
    tooltip.hidden = true;
  };

  const position = () => {
    positionFrame = 0;
    if (!owner?.isConnected || tooltip.hidden) return hide();
    const anchor = owner.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const margin = 8;
    const gap = 8;
    const idealLeft = anchor.left + (anchor.width - tip.width) / 2;
    const left = Math.max(viewportLeft + margin, Math.min(idealLeft, viewportRight - tip.width - margin));
    const above = anchor.top - tip.height - gap;
    const below = anchor.bottom + gap;
    const useBelow = above < viewportTop + margin && below + tip.height <= viewportBottom - margin;
    const top = useBelow
      ? below
      : Math.max(viewportTop + margin, Math.min(above, viewportBottom - tip.height - margin));
    tooltip.dataset.placement = useBelow ? "bottom" : "top";
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  };

  const schedulePosition = () => {
    if (!positionFrame) positionFrame = window.requestAnimationFrame(position);
  };

  const show = (target) => {
    const text = String(target?.dataset?.tooltip || "").trim();
    if (!text) return hide();
    if (owner && owner !== target && owner.getAttribute("aria-describedby") === tooltip.id) owner.removeAttribute("aria-describedby");
    owner = target;
    owner.removeAttribute("title");
    owner.setAttribute("aria-describedby", tooltip.id);
    tooltip.textContent = text;
    tooltip.hidden = false;
    schedulePosition();
  };

  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target) show(target);
  });
  document.addEventListener("pointerout", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target && !target.contains(event.relatedTarget)) hide(target);
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target) show(target);
  });
  document.addEventListener("focusout", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (target && !target.contains(event.relatedTarget)) hide(target);
  });
  document.addEventListener("pointerdown", () => hide());
  document.addEventListener("click", () => hide());
  document.addEventListener("scroll", schedulePosition, true);
  window.addEventListener("resize", schedulePosition);
  window.visualViewport?.addEventListener("resize", schedulePosition);
  window.visualViewport?.addEventListener("scroll", schedulePosition);
}

function normalizeSoundLab(session) {
  const source = session?.soundLab && typeof session.soundLab === "object" ? session.soundLab : {};
  session.workspaceType = WORKSPACE_TYPE;
  session.soundLab = {
    mode: source.mode === "voice" ? "voice" : "music",
    settings: source.settings && typeof source.settings === "object" ? source.settings : {},
    messages: Array.isArray(source.messages) ? source.messages : [],
    draft: source.draft && typeof source.draft === "object" ? source.draft : null,
    jobs: Array.isArray(source.jobs) ? source.jobs.filter((job) => job?.jobId) : [],
    pending: Array.isArray(source.pending) ? source.pending : [],
    library: Array.isArray(source.library) ? source.library : []
  };
  return session;
}

function activeLab() {
  if (!state.active) return null;
  return normalizeSoundLab(state.active).soundLab;
}

function readPreferences() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (_) { return {}; }
}

function applyFontSize(size) {
  const clean = ["compact", "normal", "large"].includes(size) ? size : "normal";
  document.documentElement.dataset.schroederFontSize = clean;
  elements.fontSize.value = clean;
}

function panelWidth(name, fallback) {
  const value = Number.parseFloat(getComputedStyle(elements.grid).getPropertyValue(name));
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

function applyPanelWidths(left, right) {
  if (Number.isFinite(Number(left))) elements.grid.style.setProperty("--ssl-left-panel-width", `${Math.max(190, Math.min(400, Number(left)))}px`);
  if (Number.isFinite(Number(right))) elements.grid.style.setProperty("--ssl-right-panel-width", `${Math.max(280, Math.min(520, Number(right)))}px`);
  elements.leftResizer.setAttribute("aria-valuenow", String(panelWidth("--ssl-left-panel-width", 248)));
  elements.rightResizer.setAttribute("aria-valuenow", String(panelWidth("--ssl-right-panel-width", 410)));
}

function updateComposerModelLabel() {
  const label = elements.geminiModel.selectedOptions[0]?.textContent || "Lyria 3.5";
  elements.geminiModelPicker.dataset.tooltip = label;
  elements.geminiModel.setAttribute("aria-label", `Modelo de música: ${label}`);
}

function syncQuickControlsFromSettings() {
  const genre = elements.genre.value.trim();
  elements.quickGenre.value = "";
  elements.quickGenrePicker.dataset.tooltip = genre ? `Añadir género · ${genre}` : "Añadir género";
  elements.quickGenre.setAttribute("aria-label", genre ? `Géneros elegidos: ${genre}. Añadir otro` : "Añadir género");
  elements.quickDuration.value = elements.musicDuration.value;
  elements.quickMusicType.value = elements.musicType.value;
  elements.quickLanguage.value = elements.musicLanguage.value;
  elements.quickBpm.value = elements.bpm.value;
  syncVoiceMenuState();
}

function syncMusicSettingsFromQuickControls() {
  if (elements.quickDuration?.value) elements.musicDuration.value = elements.quickDuration.value;
  if (elements.quickMusicType?.value) elements.musicType.value = elements.quickMusicType.value;
  if (elements.quickLanguage?.value) elements.musicLanguage.value = elements.quickLanguage.value;
  if (elements.quickBpm?.value) elements.bpm.value = elements.quickBpm.value;
  if (elements.geminiModel?.value) elements.musicModel.value = elements.geminiModel.value;
  persistCreationSettings();
}

function syncVoiceMenuState() {
  const mode = elements.musicType.value === "instrumental" ? "instrumental" : "vocal";
  const profile = String(elements.singerProfile.value || "");
  elements.quickMusicType.value = mode;
  elements.voiceMenuBtn.classList.toggle("is-active", mode === "vocal");
  elements.voiceMenuBtn.dataset.tooltip = mode === "instrumental"
    ? "Sin voz"
    : profile && SINGER_PROFILES[profile] ? `Voz · ${SINGER_PROFILES[profile].label}` : "Con voz";
  elements.voiceMenu.querySelectorAll("[data-voice-mode]").forEach((button) => button.setAttribute("aria-checked", String(button.dataset.voiceMode === mode)));
  elements.singerMenu.querySelectorAll("[data-singer-profile]").forEach((button) => button.setAttribute("aria-checked", String(button.dataset.singerProfile === profile)));
  elements.singerLanguageLabel.textContent = elements.musicLanguage.value || "Español";
}

function updateCreationSummary() {
  syncQuickControlsFromSettings();
  if (state.mode === "voice") {
    const type = elements.voiceFormat.value === "dialogue" ? "Diálogo" : elements.voiceFormat.value === "word" ? "Palabra" : "Frase";
    elements.creationSummary.textContent = `${type} · ${elements.voiceName.value || "Voz"}`;
    return;
  }
  const duration = elements.musicModel.value === "lyria-3-clip-preview" ? "30 segundos" : elements.musicDuration.selectedOptions[0]?.textContent || "Canción completa";
  elements.creationSummary.textContent = `${duration} · ${elements.musicType.value === "instrumental" ? "Instrumental" : "Con voz"}`;
}

function readCreationSettings() {
  return {
    composerMusicModel: elements.geminiModel.value || "lyria-3.5",
    musicType: elements.musicType.value,
    musicModel: elements.musicModel.value,
    musicDuration: elements.musicDuration.value,
    genre: elements.genre.value.trim(),
    musicLanguage: elements.musicLanguage.value,
    singerProfile: elements.singerProfile.value,
    bpm: elements.bpm.value,
    key: elements.key.value.trim(),
    lyrics: elements.lyrics.value,
    voiceFormat: elements.voiceFormat.value,
    voiceLanguage: elements.voiceLanguage.value,
    voiceName: elements.voiceName.value,
    voiceStyle: elements.voiceStyle.value,
    voiceText: elements.voiceText.value
  };
}

function readComposerDrafts() {
  try {
    const value = JSON.parse(localStorage.getItem(COMPOSER_DRAFTS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}

function persistComposerDraft({ immediate = false } = {}) {
  window.clearTimeout(composerPersistTimer);
  const write = () => {
    const sessionId = String(state.active?.id || "").trim();
    if (!sessionId) return;
    const drafts = readComposerDrafts();
    const prompt = String(elements.prompt.value || "");
    const hasReference = Boolean(recorderState.pendingBlob || recorderState.pendingEditItem);
    if (!prompt && !hasReference) delete drafts[sessionId];
    else drafts[sessionId] = { prompt, savedAt: Date.now() };
    try { localStorage.setItem(COMPOSER_DRAFTS_KEY, JSON.stringify(drafts)); } catch (_) { /* El borrador no bloquea el estudio. */ }
  };
  if (immediate) write();
  else composerPersistTimer = window.setTimeout(write, 80);
}

function restoreComposerDraft({ focus = true } = {}) {
  const sessionId = String(state.active?.id || "").trim();
  if (!sessionId) return;
  const saved = readComposerDrafts()[sessionId];
  elements.prompt.value = String(saved?.prompt || "");
  if (focus && (saved || recorderState.pendingBlob || recorderState.pendingEditItem)) {
    window.requestAnimationFrame(() => elements.prompt.focus({ preventScroll: true }));
  }
}

function clearComposerDraft() {
  window.clearTimeout(composerPersistTimer);
  const sessionId = String(state.active?.id || "").trim();
  if (!sessionId) return;
  const drafts = readComposerDrafts(); delete drafts[sessionId];
  try { localStorage.setItem(COMPOSER_DRAFTS_KEY, JSON.stringify(drafts)); } catch (_) { /* noop */ }
}

function applyCreationSettings(settings = {}) {
  Object.entries(settings).forEach(([field, value]) => {
    if (["geminiModel", "composerMusicModel"].includes(field)) return;
    if (value != null && elements[field]) elements[field].value = String(value);
  });
  const selectedModel = [settings.composerMusicModel, settings.musicModel, elements.musicModel.value, "lyria-3.5"]
    .map((value) => String(value || ""))
    .find((value) => LYRIA_MODELS.has(value)) || "lyria-3.5";
  elements.musicModel.value = selectedModel;
  elements.geminiModel.value = selectedModel;
  updateComposerModelLabel();
  updateCreationSummary();
}

function applyDraftToControls(draft = {}) {
  if (draft.kind === "music") {
    applyCreationSettings({
      musicType: draft.musicType,
      musicModel: draft.model,
      musicDuration: draft.durationSec,
      genre: draft.genre,
      musicLanguage: draft.language,
      singerProfile: draft.singerProfile,
      bpm: draft.bpm,
      key: draft.key,
      lyrics: draft.lyrics,
      composerMusicModel: draft.model
    });
  } else {
    applyCreationSettings({
      voiceFormat: draft.format,
      voiceLanguage: draft.language,
      voiceName: draft.voiceName,
      voiceStyle: draft.style,
      voiceText: draft.text
    });
  }
}

function savePreferences() {
  const creationSettings = readCreationSettings();
  const preferences = {
    customVoices: Array.isArray(readPreferences().customVoices) ? readPreferences().customVoices : [],
    theme: document.documentElement.dataset.schroederTheme || "dark",
    fontSize: document.documentElement.dataset.schroederFontSize || "normal",
    creationMode: state.mode,
    panelLeftWidth: panelWidth("--ssl-left-panel-width", 248),
    panelRightWidth: panelWidth("--ssl-right-panel-width", 410),
    defaultMusicModel: elements.defaultMusicModel.value || "lyria-3.5",
    ...creationSettings
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences)); } catch (_) { /* La preferencia no bloquea el estudio. */ }
  if (activeLab() && !state.ownerId) activeLab().settings = { ...creationSettings };
  updateCreationSummary();
  if (activeLab()?.draft?.kind === "music") {
    applyCurrentMusicMode(activeLab().draft);
    renderChat();
  }
}

function applyCurrentMusicMode(draft) {
  draft.musicType = elements.musicType.value === "instrumental" ? "instrumental" : "vocal";
  draft.singerProfile = draft.musicType === "instrumental" ? "" : elements.singerProfile.value;
}

function persistCreationSettings() {
  savePreferences();
  window.clearTimeout(settingsPersistTimer);
  settingsPersistTimer = window.setTimeout(() => persist().catch(showError), 250);
}

function restorePreferences() {
  const saved = readPreferences();
  refreshCustomVoiceOptions(saved.voiceName);
  applyCreationSettings(saved);
  elements.defaultMusicModel.value = saved.defaultMusicModel || saved.musicModel || "lyria-3.5";
  applyFontSize(saved.fontSize || "normal");
  applyPanelWidths(saved.panelLeftWidth, saved.panelRightWidth);
  updateComposerModelLabel();
  updateCreationSummary();
}

function renderSessions() {
  const query = elements.sessionSearch.value.trim().toLowerCase();
  const rows = state.sessions.filter((item) => !query || String(item.title || "").toLowerCase().includes(query));
  elements.sessionList.innerHTML = rows.length ? rows.map((item) => `<article class="ssl-session-item ${item.id === state.active?.id ? "is-active" : ""}" data-session-id="${escapeHtml(item.id)}">
    <button class="ssl-session-open" type="button" data-action="open">${escapeHtml(item.title || "Nueva sesión")}</button>
    ${state.ownerId ? "" : `<div class="ssl-menu-wrap ssl-session-menu-wrap"><button class="ssl-icon-action ssl-session-menu-trigger" type="button" data-action="session-menu" data-tooltip="Opciones" aria-label="Opciones de sesión"><i class="fas fa-ellipsis-vertical"></i></button><div class="ssl-track-menu ssl-session-menu" hidden><button type="button" data-action="rename-session"><i class="fas fa-pen"></i><span>Renombrar</span></button><button class="is-danger" type="button" data-action="delete"><i class="fas fa-trash"></i><span>Eliminar sesión</span></button></div></div>`}
  </article>`).join("") : '<div class="ssl-empty"><span>Sin sesiones</span></div>';
}

function modelLabel(model = "") {
  if (model === "lyria-3.5") return "Lyria 3.5";
  if (model === "lyria-3-pro-preview") return "Lyria 3 Pro";
  return "Lyria 3 Clip";
}

function draftMeta(draft) {
  if (draft.kind === "music") return [draft.musicType === "instrumental" ? "Instrumental" : (SINGER_PROFILES[draft.singerProfile]?.label || "Con voz"), draft.genre, draft.language, `${draft.bpm} BPM`, draft.key, draft.model === "lyria-3-clip-preview" ? "30 s" : `${draft.durationSec || 120} s`, modelLabel(draft.model)].filter(Boolean);
  return [draft.format === "dialogue" ? "Diálogo" : draft.format === "word" ? "Palabra" : "Frase", draft.language, draft.voiceName, draft.style].filter(Boolean);
}

function genreFamily(value = "") {
  const genre = String(value).toLowerCase();
  if (/pop|lo-fi/.test(genre)) return "pop";
  if (/cinem|orquest/.test(genre)) return "cinematic";
  if (/regga|afro|regional|latin/.test(genre)) return "latin";
  if (/electr/.test(genre)) return "electronic";
  if (/soul|r&b|jazz/.test(genre)) return "soul";
  return "rock";
}

function renderChat() {
  const lab = activeLab();
  const timeline = [];
  let sequence = 0;
  const add = (createdAt, html) => timeline.push({ time: Date.parse(String(createdAt || "")) || 0, sequence: sequence++, html });
  (lab?.messages || []).forEach((message) => {
    if (message.type === "genre" && message.genre) {
      add(message.createdAt, `<div class="ssl-chat-genre-event"><button type="button" class="ssl-chat-genre-badge" data-remove-genre="${escapeHtml(message.genre)}" data-genre-family="${genreFamily(message.genre)}" aria-label="Quitar género ${escapeHtml(message.genre)}"><span>${escapeHtml(message.genre)}</span><i class="fas fa-xmark" aria-hidden="true"></i></button></div>`);
      return;
    }
    if (message.type === "audio-reference") {
      const source = message.url || message.downloadUrl || message.previewUrl || recorderState.chatPreviewUrl;
      const label = message.mode === "voice" || state.mode === "voice" ? "Muestra de voz enviada" : "Audio enviado para analizar";
      if (source) add(message.createdAt, `<article class="ssl-message ssl-audio-reference-message"><span>${escapeHtml(label)}</span><audio controls preload="metadata" src="${escapeHtml(source)}"></audio><p>${escapeHtml(message.text || "Referencia vocal")}</p></article>`);
      return;
    }
    add(message.createdAt, `<article class="ssl-message ${message.role === "user" ? "is-user" : ""}"><span>${message.role === "user" ? "Tú" : "Schroeder"}</span><p>${escapeHtml(message.text || "")}</p></article>`);
  });
  if (lab?.draft) add(lab.draft.createdAt, `<article class="ssl-draft-card" data-draft-id="${escapeHtml(lab.draft.id)}"><div class="ssl-draft-content"><span class="ssl-draft-icon" aria-hidden="true"><i class="fas fa-${lab.draft.kind === "music" ? "music" : "wave-square"}"></i></span><div class="ssl-draft-copy"><h3>${lab.draft.kind === "music" ? "Propuesta de canción" : "Propuesta de voz"}</h3><p class="ssl-draft-prompt">${escapeHtml(lab.draft.sourcePrompt || lab.draft.prompt || lab.draft.text || "")}</p><div class="ssl-draft-meta">${draftMeta(lab.draft).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></div></div><div class="ssl-draft-actions"><button class="ssl-draft-discard" type="button" data-chat-action="discard" data-tooltip="Descartar brief" aria-label="Descartar brief"><i class="fas fa-xmark"></i></button><button class="is-primary ssl-draft-generate" type="button" data-chat-action="generate" data-tooltip="Aprobar y generar" aria-label="Aprobar y generar"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Generar</span></button></div></article>`);
  (lab?.jobs || []).forEach((job) => add(job.createdAt, `<article class="ssl-job-card" data-job-id="${escapeHtml(job.jobId)}"><div class="ssl-job-heading"><span class="ssl-job-logo-spinner" aria-hidden="true"><img src="schroeder-sound-lab/assets/schroeder-adult-piano.png" alt=""></span><div><h3>${job.kind === "music" ? "Creando canción" : "Creando audio"}</h3><span>${escapeHtml(job.hint || "Generación en segundo plano")}</span></div></div><div class="ssl-progress"><i style="width:${Math.max(6, Math.min(100, Number(job.progress || 0) * 100))}%"></i></div><div class="ssl-draft-actions"><button type="button" data-chat-action="cancel-job">Cancelar</button></div></article>`));
  (lab?.pending || []).forEach((item) => add(item.createdAt, `<article class="ssl-review-card" data-pending-id="${escapeHtml(item.id)}"><div class="ssl-review-player"><button class="ssl-review-play" type="button" data-review-action="toggle" data-tooltip="Reproducir" aria-label="Reproducir"><i class="fas fa-play"></i></button><span class="ssl-review-time" data-review-time="current">0:00</span><input class="ssl-review-progress" type="range" min="0" max="1000" value="0" aria-label="Progreso del audio"><span class="ssl-review-time" data-review-time="duration">0:00</span><audio preload="none" src="${escapeHtml(item.downloadUrl || "")}"></audio></div><div class="ssl-draft-actions"><button type="button" data-chat-action="continue">Seguir editando</button><button class="is-primary" type="button" data-chat-action="approve-audio">Aprobar audio</button></div></article>`));
  const chunks = timeline.sort((a, b) => a.time - b.time || a.sequence - b.sequence).map((entry) => entry.html);
  elements.chatFeed.innerHTML = chunks.length ? chunks.join("") : '<div class="ssl-empty"><i class="fas fa-music"></i><span>Nueva creación</span></div>';
  bindReviewPlayers();
  elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
}

function updateJobCard(job) {
  const card = [...elements.chatFeed.querySelectorAll(".ssl-job-card")]
    .find((item) => item.dataset.jobId === String(job?.jobId || ""));
  if (!card) return false;
  const hint = card.querySelector(".ssl-job-heading > div > span");
  const progress = card.querySelector(".ssl-progress i");
  if (hint) hint.textContent = job.hint || "Generación en segundo plano";
  if (progress) progress.style.width = `${Math.max(6, Math.min(100, Number(job.progress || 0) * 100))}%`;
  return true;
}

function formatReviewTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function bindReviewPlayers() {
  elements.chatFeed.querySelectorAll(".ssl-review-player").forEach((root) => {
    const audio = root.querySelector("audio");
    const button = root.querySelector("[data-review-action='toggle']");
    const icon = button.querySelector("i");
    const current = root.querySelector("[data-review-time='current']");
    const duration = root.querySelector("[data-review-time='duration']");
    const progress = root.querySelector(".ssl-review-progress");
    const sync = () => {
      const total = Number.isFinite(audio.duration) ? audio.duration : 0;
      current.textContent = formatReviewTime(audio.currentTime);
      duration.textContent = formatReviewTime(total);
      progress.value = total ? String(Math.round((audio.currentTime / total) * 1000)) : "0";
      icon.className = `fas fa-${audio.paused ? "play" : "pause"}`;
      button.dataset.tooltip = audio.paused ? "Reproducir" : "Pausar";
      button.setAttribute("aria-label", button.dataset.tooltip);
    };
    button.addEventListener("click", () => {
      if (audio.paused) {
        elements.chatFeed.querySelectorAll(".ssl-review-player audio").forEach((other) => { if (other !== audio) other.pause(); });
        elements.nowPlaying.querySelector("audio")?.pause();
        audio.play().catch(showError);
      } else audio.pause();
    });
    progress.addEventListener("input", () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
      sync();
    });
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("play", sync);
    audio.addEventListener("pause", sync);
    audio.addEventListener("ended", sync);
  });
}

function resumeSessionJobs() {
  const sessionId = state.active?.id;
  (activeLab()?.jobs || []).forEach((job) => startJobPolling(sessionId, job.jobId));
}

function renderActive() {
  if (!state.active) return;
  const lab = activeLab();
  applyCreationSettings(Object.keys(lab.settings || {}).length ? lab.settings : readPreferences());
  state.mode = lab.mode;
  elements.sessionTitle.textContent = state.active.title || "Nueva sesión";
  setMode(state.mode, false);
  renderSessions(); renderChat();
  const query = elements.librarySearch.value.trim().toLowerCase();
  const visible = lab.library.filter((item) => !query || [item.title, item.kind, item.format].some((value) => String(value || "").toLowerCase().includes(query)));
  renderLibrary(elements.libraryList, visible);
  elements.libraryCount.textContent = `${lab.library.length} ${lab.library.length === 1 ? "audio" : "audios"}`;
  ensureLibraryItemDurations();
  resumeSessionJobs();
}

async function persist(session = state.active) {
  if (!session || state.ownerId) return;
  await saveSession(session);
  const stub = { id: session.id, title: session.title, workspaceType: WORKSPACE_TYPE, updatedAt: session.updatedAt };
  state.sessions = [stub, ...state.sessions.filter((item) => item.id !== stub.id)];
  renderSessions();
}

function setMode(mode, persistChange = true) {
  state.mode = mode === "voice" ? "voice" : "music";
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", active); button.setAttribute("aria-selected", String(active));
  });
  elements.musicControls.hidden = state.mode !== "music";
  elements.voiceControls.hidden = state.mode !== "voice";
  elements.quickMusicSettings.hidden = state.mode !== "music";
  elements.quickVoiceSettings.hidden = state.mode !== "voice";
  elements.chatModeLabel.textContent = state.mode === "music" ? "Canción" : "Voz";
  const creationLabel = state.mode === "music" ? "Nueva canción" : "Nuevo audio";
  elements.newCreationBtn.dataset.tooltip = creationLabel;
  elements.newCreationBtn.setAttribute("aria-label", creationLabel);
  const settingsLabel = state.mode === "music" ? "Configurar canción" : "Configurar voz";
  elements.agentSettingsBtn.dataset.tooltip = settingsLabel;
  elements.agentSettingsBtn.setAttribute("aria-label", settingsLabel);
  const isVoice = state.mode === "voice";
  const recordTooltip = recorderState.pendingBlob ? (isVoice ? "Volver a grabar voz" : "Volver a grabar") : (isVoice ? "Grabar muestra de voz" : "Grabar melodía o sonido");
  elements.recordIdeaBtn.dataset.tooltip = recordTooltip;
  elements.recordIdeaBtn.setAttribute("aria-label", recordTooltip);
  if (recorderState.pendingBlob) {
    elements.recordedLabel.textContent = isVoice ? "Muestra de voz" : "Grabación";
  }
  elements.prompt.placeholder = (recorderState.pendingBlob || recorderState.pendingEditItem) ? (isVoice ? "Escribe el texto que dirá tu voz" : "Escribe qué quieres hacer con este audio") : state.mode === "music" ? "Pregunta o describe lo que quieres crear" : "Pregunta o escribe una palabra, frase o diálogo";
  updateCreationSummary();
  if (persistChange) {
    savePreferences();
    if (activeLab()) { activeLab().mode = state.mode; persist().catch(showError); }
  }
}

async function prepareDraft(prompt, visibleMessage = prompt, forcedRevisionBase = null) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt && !(state.mode === "voice" && elements.voiceText.value.trim())) return;
  if (state.mode === "music") syncMusicSettingsFromQuickControls();
  const lab = activeLab();
  const startedAt = Date.now();
  const revisionSource = !forcedRevisionBase && isRevisionRequest(cleanPrompt) ? latestRevisionSource(lab) : null;
  // Un mensaje nuevo debe crear una canción nueva. Solo heredamos la canción
  // anterior cuando el usuario pide explícitamente una variación o cuando el
  // flujo de revisión del audio nos entrega una base forzada.
  const revisionBase = forcedRevisionBase || (isRevisionRequest(cleanPrompt) ? (lab.draft || (revisionSource ? { ...revisionSource.draft, id: revisionSource.id, musicalFingerprint: revisionSource.musicalFingerprint || null } : null)) : null);
  lab.messages.push({ role: "user", text: visibleMessage || cleanPrompt, createdAt: new Date(startedAt).toISOString() });
  lab.messages.push({ role: "assistant", text: revisionBase ? "Variación preparada con la configuración de la canción anterior." : "Brief preparado.", createdAt: new Date(startedAt + 1).toISOString() });
  const draftPrompt = state.mode === "music" ? resolveMusicDraftPrompt(cleanPrompt, lab.messages.slice(0, -1)) : cleanPrompt;
  lab.draft = buildDraft(draftPrompt || elements.voiceText.value.trim(), revisionBase, new Date(startedAt + 2).toISOString());
  savePreferences();
  elements.prompt.value = "";
  clearComposerDraft();
  await persist(); renderActive();
}

function shouldPrepareDraft(prompt = "") {
  const clean = String(prompt || "").trim();
  if (!clean) return state.mode === "voice" && Boolean(elements.voiceText.value.trim());
  const lab = activeLab();
  if (isRevisionRequest(clean) && (lab?.draft || latestRevisionSource(lab))) return true;
  return state.mode === "music" && isMusicCreationRequest(clean);
}

function extractGeminiText(response) {
  const candidates = response?.candidates || response?.response?.candidates || [];
  return String(candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("") || response?.text || "").trim();
}

async function sendConversationalMessage(prompt) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) return;
  const lab = activeLab();
  const history = (lab?.messages || [])
    .filter((message) => message.type !== "genre" && message.text)
    .slice(-20)
    .map((message) => ({ role: message.role === "user" ? "user" : "model", parts: [{ text: String(message.text).slice(0, 4000) }] }));
  lab.messages.push({ role: "user", text: cleanPrompt, createdAt: new Date().toISOString() });
  elements.prompt.value = "";
  clearComposerDraft();
  await persist();
  renderChat();
  const response = await authFetchJson("/api/gemini/generate", {
    method: "POST",
    body: {
      model: AUDIO_ANALYSIS_MODEL,
      payload: {
        systemInstruction: { parts: [{ text: "Eres Schroeder, un agente musical conversacional claro, útil y conciso. Responde la pregunta del usuario y conversa con naturalidad. Puedes explicar música, composición y el uso del estudio. No conviertas automáticamente cada mensaje en un brief y no afirmes que preparaste audio. Si el usuario quiere crear o modificar audio, explícale brevemente que puede pedírtelo de forma directa. Responde en el idioma del usuario." }] },
        contents: [...history, { role: "user", parts: [{ text: cleanPrompt }] }],
        generationConfig: { temperature: 0.55, maxOutputTokens: 900 }
      }
    }
  });
  const answer = extractGeminiText(response);
  lab.messages.push({ role: "assistant", text: answer || "No pude completar la respuesta. Intenta de nuevo.", createdAt: new Date().toISOString() });
  await persist();
  renderActive();
}

function isRevisionRequest(prompt = "") {
  return /\b(misma|mismo|versi[oó]n|variaci[oó]n|adapta|adaptar|modifica|modificar|cambia|cambiar|hazla|hazlo|anterior)\b/i.test(String(prompt));
}

function latestRevisionSource(lab) {
  return [...(lab?.pending || []), ...(lab?.library || [])]
    .filter((item) => item?.draft?.kind === state.mode)
    .sort((a, b) => (Date.parse(String(b.createdAt || b.approvedAt || "")) || 0) - (Date.parse(String(a.createdAt || a.approvedAt || "")) || 0))[0] || null;
}

function encodePcm16Wav(samples, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

async function blobTo24kHzMonoWav(blob) {
  if (!blob) return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const OfflineAudioContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioContextClass || !OfflineAudioContextClass) return blob;

    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContextClass();
    let decoded;
    try {
      decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      await audioCtx.close().catch(() => {});
    }
    if (!decoded || !decoded.duration) return blob;

    const targetSampleRate = 24000;
    const targetLength = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));
    const offlineCtx = new OfflineAudioContextClass(1, targetLength, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);
    const rendered = await offlineCtx.startRendering();
    const channelData = rendered.getChannelData(0);
    const wavBuffer = encodePcm16Wav(channelData, targetSampleRate);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } catch (err) {
    console.warn("[VoiceClone] No se pudo resamplear a WAV 24kHz, usando audio original:", err);
    return blob;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la grabación."));
    reader.readAsDataURL(blob);
  });
}

function setRecorderUi(recording, busy = false) {
  const isVoice = state.mode === "voice";
  const button = elements.recordIdeaBtn;
  button.disabled = busy;
  button.classList.toggle("is-recording", recording);
  button.classList.toggle("is-busy", busy);
  button.querySelector("i").className = `fas fa-${busy ? "spinner fa-spin" : recording ? "stop" : "microphone"}`;
  const label = busy ? (isVoice ? "Procesando voz" : "Analizando sonido") : recording ? "Detener grabación" : recorderState.pendingBlob ? (isVoice ? "Volver a grabar voz" : "Volver a grabar") : (isVoice ? "Grabar muestra de voz" : "Grabar melodía o sonido");
  button.dataset.tooltip = label; button.setAttribute("aria-label", label);
}

function cleanupRecorder() {
  window.clearTimeout(recorderState.stopTimer);
  recorderState.stream?.getTracks().forEach((track) => track.stop());
  recorderState.recorder = null; recorderState.stream = null; recorderState.chunks = []; recorderState.stopTimer = 0;
}

function syncRecordedReference() {
  const audio = elements.recordedAudio;
  const total = Number.isFinite(audio.duration) ? audio.duration : recorderState.pendingDurationSec;
  elements.recordedDuration.textContent = `${formatReviewTime(audio.currentTime)} / ${formatReviewTime(total)}`;
  elements.recordedProgress.value = total ? String(Math.round((audio.currentTime / total) * 1000)) : "0";
  const playing = !audio.paused;
  elements.recordedPlayBtn.querySelector("i").className = `fas fa-${playing ? "pause" : "play"}`;
  elements.recordedPlayBtn.dataset.tooltip = playing ? "Pausar grabación" : "Reproducir grabación";
  elements.recordedPlayBtn.setAttribute("aria-label", elements.recordedPlayBtn.dataset.tooltip);
}

function discardRecordedReference({ clearStored = true } = {}) {
  elements.recordedAudio.pause();
  elements.recordedAudio.removeAttribute("src");
  elements.recordedAudio.load();
  if (recorderState.previewUrl && recorderState.previewUrl !== recorderState.chatPreviewUrl) URL.revokeObjectURL(recorderState.previewUrl);
  recorderState.pendingBlob = null; recorderState.pendingEditItem = null; recorderState.pendingDurationSec = 0; recorderState.previewUrl = ""; recorderState.preparedDraftId = "";
  elements.recordedReference.hidden = true;
  elements.recordedLabel.textContent = "Grabación";
  elements.recordedProgress.value = "0";
  elements.prompt.placeholder = state.mode === "music" ? "Pregunta o describe lo que quieres crear" : "Pregunta o escribe una palabra, frase o diálogo";
  if (clearStored) {
    try { localStorage.removeItem(RECORDED_REFERENCE_KEY); } catch (_) { /* La grabación continúa disponible en memoria. */ }
  }
  persistComposerDraft({ immediate: true });
  setRecorderUi(false, false);
}

function attachRecordedReference(blob, durationSec, { persistLocal = true, focusInput = true } = {}) {
  discardRecordedReference({ clearStored: persistLocal });
  recorderState.pendingBlob = blob;
  recorderState.pendingEditItem = null;
  recorderState.pendingDurationSec = durationSec;
  recorderState.preparedDraftId = "";
  recorderState.previewUrl = URL.createObjectURL(blob);
  recorderState.chatPreviewUrl = recorderState.previewUrl;
  elements.recordedAudio.src = recorderState.previewUrl;
  elements.recordedLabel.textContent = state.mode === "voice" ? "Muestra de voz" : "Grabación";
  elements.recordedReference.hidden = false;
  elements.prompt.placeholder = state.mode === "voice" ? "Escribe el texto que dirá tu voz" : "Escribe qué quieres hacer con este audio";
  syncRecordedReference();
  setRecorderUi(false, false);
  if (focusInput) elements.prompt.focus();
  if (persistLocal) {
    blobToBase64(blob).then((audioBase64) => {
      localStorage.setItem(RECORDED_REFERENCE_KEY, JSON.stringify({
        sessionId: state.active?.id || "",
        mimeType: blob.type || "audio/webm",
        durationSec,
        audioBase64,
        savedAt: Date.now()
      }));
    }).catch(() => { /* La grabación sigue disponible durante esta visita. */ });
  }
  persistComposerDraft({ immediate: true });
}

function attachExistingAudioReference(item, { persistLocal = true, focusInput = true } = {}) {
  if (!item?.downloadUrl || !item?.storagePath) throw new Error("El audio seleccionado ya no está disponible.");
  discardRecordedReference({ clearStored: persistLocal });
  recorderState.pendingEditItem = { ...item, draft: item.draft ? { ...item.draft } : null };
  recorderState.pendingDurationSec = Number(item.durationSec || 0);
  elements.recordedAudio.src = item.downloadUrl;
  elements.recordedLabel.textContent = String(item.title || "Canción adjunta");
  elements.recordedReference.hidden = false;
  elements.prompt.placeholder = "Escribe qué quieres cambiar de esta canción";
  syncRecordedReference();
  setRecorderUi(false, false);
  if (focusInput) elements.prompt.focus();
  if (persistLocal) {
    try {
      localStorage.setItem(RECORDED_REFERENCE_KEY, JSON.stringify({
        kind: "existing-audio",
        sessionId: state.active?.id || "",
        item: recorderState.pendingEditItem,
        savedAt: Date.now()
      }));
    } catch (_) { /* El adjunto continúa disponible durante esta visita. */ }
  }
  persistComposerDraft({ immediate: true });
}

function restoreRecordedReference() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECORDED_REFERENCE_KEY) || "null");
    if (saved?.sessionId !== state.active?.id) return;
    if (saved.kind === "existing-audio" && saved.item?.downloadUrl && saved.item?.storagePath) {
      attachExistingAudioReference(saved.item, { persistLocal: false, focusInput: false });
      return;
    }
    if (!saved?.audioBase64) return;
    const binary = atob(saved.audioBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    attachRecordedReference(new Blob([bytes], { type: saved.mimeType || "audio/webm" }), Number(saved.durationSec || 1), { persistLocal: false, focusInput: false });
  } catch (_) { /* Un adjunto local dañado no bloquea el estudio. */ }
}

async function analyzeRecordedIdea(blob, durationSec, userInstruction = "", editItem = null) {
  if (blob?.size > 6 * 1024 * 1024) throw new Error("La grabación es demasiado grande. Intenta una idea más breve.");
  setRecorderUi(false, true);
  const body = editItem?.storagePath
    ? { storagePath: editItem.storagePath, mimeType: editItem.mimeType || "audio/mpeg", durationSec, analysisMode: "song-revision", userInstruction: String(userInstruction || "").trim().slice(0, 500), model: AUDIO_ANALYSIS_MODEL }
    : { audioBase64: await blobToBase64(blob), mimeType: blob?.type || "audio/webm", durationSec, analysisMode: "musical-reference", userInstruction: String(userInstruction || "").trim().slice(0, 500), model: AUDIO_ANALYSIS_MODEL };
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await authFetchJson("/api/schroeder/audio-reference/analyze", {
      method: "POST",
      body,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("El análisis de audio tardó demasiado. Intenta enviarlo de nuevo.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  const prompt = String(response?.prompt || "").trim();
  if (!prompt) throw new Error("No se pudo convertir la grabación en una idea musical.");
  setMode("music", false);
  const lab = activeLab();
  if (lab) {
    lab.messages.push({ role: "user", type: "audio-reference", text: "Grabación vocal adjunta para análisis musical.", createdAt: new Date().toISOString() });
    lab.messages.push({
      role: "assistant",
      text: `Audio analizado. Dirección musical detectada: ${prompt}`,
      createdAt: new Date().toISOString()
    });
    await persist();
    renderActive();
  }
  const revisionBase = editItem ? { ...editItem.draft, kind: "music", id: editItem.id, title: editItem.title, musicalFingerprint: editItem.musicalFingerprint || editItem.draft?.musicalFingerprint || null } : null;
  await prepareDraft(prompt, String(userInstruction || "").trim() || (editItem ? "Editar canción adjunta" : "Sonido musical grabado"), revisionBase);
  if (editItem && activeLab()?.draft) {
    activeLab().draft.referenceStoragePath = editItem.storagePath;
    activeLab().messages.push({ role: "assistant", text: "Se preparó una variación basada en el análisis. Lyria generará una composición nueva; no modifica el audio original ni garantiza conservar su melodía.", createdAt: new Date().toISOString() });
    await persist();
    renderChat();
  }
  recorderState.preparedDraftId = activeLab()?.draft?.id || "";
  // El brief ya incorporó el audio; quita el adjunto del compositor y del
  // borrador local para no aparentar que sigue pendiente de envío.
  discardRecordedReference({ clearStored: true });
}

async function toggleRecording() {
  if (recorderState.recorder?.state === "recording") { recorderState.recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("La grabación no está disponible en este navegador.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false });
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorderState.stream = stream; recorderState.recorder = recorder; recorderState.chunks = []; recorderState.startedAt = Date.now();
  recorder.addEventListener("dataavailable", (event) => { if (event.data?.size) recorderState.chunks.push(event.data); });
  recorder.addEventListener("stop", async () => {
    const blob = new Blob(recorderState.chunks, { type: recorder.mimeType || "audio/webm" });
    const durationSec = Math.max(1, Math.round((Date.now() - recorderState.startedAt) / 1000));
    cleanupRecorder();
    attachRecordedReference(blob, durationSec);
  }, { once: true });
  recorder.start(500); setRecorderUi(true, false);
  recorderState.stopTimer = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 60000);
}

function extractVoiceText(prompt = "") {
  const clean = String(prompt || "").trim();
  const match = clean.match(/^(?:por favor\s+)?(?:genera|crea|sintetiza|haz|lee|di|pronuncia)(?:\s+(?:la|una|este|el))?\s*(?:voz|locuci[oó]n|audio)?(?:\s+(?:con|usando)\s+(?:este\s+audio|esta\s+voz|mi\s+voz))?(?:\s*(?:que\s+diga|diciendo|con\s+el\s+texto)?\s*[:,-]?\s*)(.+)$/i);
  if (match && match[1]?.trim()) return match[1].trim();
  return clean;
}

function buildDraft(prompt, revisionBase = null, createdAt = new Date().toISOString()) {
  const id = `draft_${crypto.randomUUID().slice(0, 10)}`;
  if (state.mode === "music") {
    const base = revisionBase?.kind === "music" ? revisionBase : null;
    const wantsInstrumental = /\b(instrumental|sin voz|sin voces|sin letra)\b/i.test(prompt);
    const wantsVocal = /\b(con voz|con voces|cantad[ao]|vocal)\b/i.test(prompt);
    const markedVoiceMode = elements.voiceMenu?.querySelector('[data-voice-mode][aria-checked="true"]')?.dataset.voiceMode || "";
    const configuredMusicType = markedVoiceMode || elements.quickMusicType.value || elements.musicType.value;
    const musicType = configuredMusicType === "instrumental" ? "instrumental" : wantsInstrumental ? "instrumental" : wantsVocal ? "vocal" : configuredMusicType;
    const originalPrompt = String(base?.sourcePrompt || base?.prompt || "").trim();
    const fingerprint = base?.musicalFingerprint && typeof base.musicalFingerprint === "object" ? base.musicalFingerprint : null;
    const fingerprintGuide = String(fingerprint?.reusePrompt || [
      fingerprint?.key && `Key: ${fingerprint.key}`,
      fingerprint?.bpm && `Tempo: ${fingerprint.bpm} BPM`,
      fingerprint?.timeSignature && `Meter: ${fingerprint.timeSignature}`,
      fingerprint?.overallHarmony && `Harmony: ${fingerprint.overallHarmony}`,
      Array.isArray(fingerprint?.recurringMotifs) && fingerprint.recurringMotifs.length ? `Recurring motifs: ${fingerprint.recurringMotifs.join(", ")}` : ""
    ].filter(Boolean).join(". ")).trim();
    const revisionPrompt = base
      ? [`Requested variation: ${prompt}`, `Preserve the original song identity, harmony, recurring motifs, verse and chorus note contours, structure, tempo, key, instrumentation and lyrics unless the requested variation explicitly changes them.`, fingerprintGuide && `Musical identity: ${fingerprintGuide}`, `Original brief: ${originalPrompt}`].filter(Boolean).join("\n")
      : prompt;
    return {
      id, kind: "music", createdAt, title: base?.title || "Nueva canción", prompt: revisionPrompt, sourcePrompt: originalPrompt || prompt,
      revisionRequest: base ? prompt : "", revisionOf: base?.id || "", agentModel: base?.agentModel || AUDIO_ANALYSIS_MODEL,
      musicalFingerprint: fingerprint,
      // La canción original aporta identidad musical, no configuración. Al
      // editar, se respetan los controles actuales del chat.
      musicType, model: elements.musicModel.value, durationSec: Number(elements.musicDuration.value || 120),
      genre: elements.genre.value.trim(), language: elements.musicLanguage.value,
      singerProfile: musicType === "instrumental" ? "" : elements.singerProfile.value,
      bpm: Number(elements.bpm.value || 100), key: elements.key.value.trim(), lyrics: elements.lyrics.value.trim()
    };
  }
  const base = revisionBase?.kind === "voice" ? revisionBase : null;
  const voiceTitle = elements.voiceFormat.value === "word" ? "Nueva palabra" : elements.voiceFormat.value === "dialogue" ? "Nuevo diálogo" : "Nueva frase";
  const voiceSampleAudio = base?.voiceSampleAudio || null;
  return {
    id, kind: "voice", createdAt, title: base?.title || (voiceSampleAudio ? "Voz propia grabada" : voiceTitle), prompt, revisionOf: base?.id || "", agentModel: base?.agentModel || AUDIO_ANALYSIS_MODEL,
    format: base?.format || elements.voiceFormat.value, language: base?.language || elements.voiceLanguage.value,
    voiceName: voiceSampleAudio ? "replicated" : (base?.voiceName || elements.voiceName.value), style: base?.style || elements.voiceStyle.value,
    text: elements.voiceText.value.trim() || prompt || base?.text,
    voiceSampleAudio
  };
}

function makeShortTrackTitle(item = {}) {
  const draft = item.draft || item;
  const source = draft.kind === "voice"
    ? draft.text || draft.prompt
    : draft.title && !/^nueva canción|versión generada$/i.test(String(draft.title))
      ? draft.title
      : draft.sourcePrompt || draft.prompt || draft.genre;
  const clean = String(source || (draft.kind === "voice" ? "Voz" : "Canción"))
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\n\r]+/g, " ")
    .trim()
    .replace(/[.!?;:,]+$/, "");
  if (!clean) return draft.kind === "voice" ? "Voz" : "Canción";
  return clean.length <= 48 ? clean : `${clean.slice(0, 45).replace(/\s+\S*$/, "")}…`;
}

function buildMusicPrompt(draft) {
  const singerProfile = SINGER_PROFILES[draft.singerProfile]?.prompt || "Expressive lead singer suited to the selected genre";
  const vocal = draft.musicType === "instrumental" ? "Instrumental only. No vocals or spoken words." : `Song with vocals in ${draft.language}. Singer profile: ${singerProfile}.`;
  const lyrics = draft.lyrics ? `Lyrics:\n${draft.lyrics}` : "Write original lyrics that fit the concept.";
  const duration = draft.model === "lyria-3-clip-preview" ? "Create a 30-second clip." : `Create a complete song lasting approximately ${draft.durationSec || 120} seconds, with a clear intro, development and ending.`;
  const direction = draft.musicType === "instrumental"
    ? `Create a strictly instrumental arrangement. Treat the following reference only as musical context: ${JSON.stringify(draft.prompt)}. Disregard all singing, singer profiles, lyrics and vocal preservation instructions in that reference. Reinterpret vocal melodies using instruments. No singing, speech, humming, choir or human vocal sounds.`
    : draft.prompt;
  return [direction, duration, draft.genre && `Genre and blend: ${draft.genre}.`, `${draft.bpm} BPM.`, draft.key && `Key: ${draft.key}.`, vocal, draft.musicType === "vocal" && lyrics].filter(Boolean).join("\n");
}

async function finishJob(sessionId, jobId, result) {
  const session = state.active?.id === sessionId ? state.active : await loadSession(sessionId);
  if (!session) return;
  const lab = normalizeSoundLab(session).soundLab;
  const job = lab.jobs.find((item) => item.jobId === jobId);
  if (!job) return;
  const media = job.kind === "music" ? (result?.track || result?.result?.track) : (result?.dialogueAudio || result?.result?.dialogueAudio);
  if (!media?.downloadUrl) throw new Error("No se recibió un audio reproducible.");
  const completedAt = Date.now();
  lab.jobs = lab.jobs.filter((item) => item.jobId !== jobId);
  lab.messages.push({ role: "assistant", text: "Versión lista para revisar.", createdAt: new Date(completedAt).toISOString() });
  const pendingDurationSec = Number(media?.durationSec || job.draft?.durationSec || 0) || 0;
  lab.pending.push({ ...media, id: `audio_${crypto.randomUUID().slice(0, 12)}`, title: job.draft?.title || "Versión generada", kind: job.kind, format: job.draft?.format || "song", durationSec: pendingDurationSec, draft: { ...job.draft }, createdAt: new Date(completedAt + 1).toISOString() });
  if (state.active?.id === sessionId && recorderState.preparedDraftId === job.draft?.id) discardRecordedReference();
  await persist(session);
  if (state.active?.id === sessionId) renderActive();
}

async function failJob(sessionId, jobId, message) {
  const session = state.active?.id === sessionId ? state.active : await loadSession(sessionId);
  if (!session) return;
  const lab = normalizeSoundLab(session).soundLab;
  if (!lab.jobs.some((item) => item.jobId === jobId)) return;
  lab.jobs = lab.jobs.filter((item) => item.jobId !== jobId);
  if (message) lab.messages.push({ role: "assistant", text: message, createdAt: new Date().toISOString() });
  await persist(session);
  if (state.active?.id === sessionId) renderActive();
}

function startJobPolling(sessionId, jobId) {
  const pollKey = `${sessionId}:${jobId}`;
  if (runningPolls.has(pollKey)) return;
  const task = (async () => {
    try {
      for (let attempt = 0; attempt < 900; attempt += 1) {
        const snapshot = await authFetchJson(`/api/schroeder/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
        const session = state.active?.id === sessionId ? state.active : await loadSession(sessionId);
        const lab = session ? normalizeSoundLab(session).soundLab : null;
        const job = lab?.jobs.find((item) => item.jobId === jobId);
        if (!job) return;
        job.status = snapshot?.status || job.status;
        job.progress = Number(snapshot?.progress || 0);
        job.hint = snapshot?.hint || (job.kind === "music" ? "Componiendo en segundo plano" : "Creando audio en segundo plano");
        if (snapshot?.status === "ready") return await finishJob(sessionId, jobId, snapshot);
        if (terminalJobStatuses.has(String(snapshot?.status || ""))) return await failJob(sessionId, jobId, snapshot?.status === "cancelled" ? "Generación cancelada." : String(snapshot?.error?.message || "La generación no pudo completarse."));
        await persist(session);
        if (state.active?.id === sessionId && !updateJobCard(job)) renderChat();
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      await failJob(sessionId, jobId, "La generación continúa fuera de esta vista. Vuelve a intentarlo más tarde.");
    } catch (error) {
      if (navigator.onLine === false) { window.setTimeout(() => startJobPolling(sessionId, jobId), 5000); return; }
      await failJob(sessionId, jobId, String(error?.message || "No se pudo consultar la generación."));
    } finally { runningPolls.delete(pollKey); }
  })();
  runningPolls.set(pollKey, task);
}

async function generateDraft() {
  const lab = activeLab();
  const draft = lab?.draft;
  if (!draft) return;
  if (draft.kind === "music") applyCurrentMusicMode(draft);
  const requestId = crypto.randomUUID();
  const accepted = draft.kind === "music"
    ? await authFetchJson("/api/schroeder/music/generate", { method: "POST", body: { requestId, sessionId: state.active.id, title: state.active.title, model: draft.model, agentModel: draft.agentModel, prompt: buildMusicPrompt(draft), preset: draft.genre, workspaceType: WORKSPACE_TYPE } })
    : await authFetchJson("/api/schroeder/voice/generate", { method: "POST", body: { requestId, sessionId: state.active.id, title: state.active.title, model: "gemini-3.8-flash-tts", agentModel: draft.agentModel, rowId: draft.id, speakerLabel: draft.format === "dialogue" ? "Diálogo" : "Voz", speakerName: "Schroeder", voiceName: draft.voiceName, voiceSampleAudio: draft.voiceSampleAudio || undefined, speechLocale: draft.language, text: draft.text, targetSpeechLine: draft.text, style: draft.style, format: draft.format, workspaceType: WORKSPACE_TYPE } });
  if (accepted?.jobId) {
    const startedAt = Date.now();
    lab.draft = null;
    lab.messages.push({ role: "assistant", text: "Generación iniciada. Puedes seguir trabajando o cerrar el sitio.", createdAt: new Date(startedAt).toISOString() });
    lab.jobs.push({ jobId: accepted.jobId, requestId, kind: draft.kind, draft: { ...draft }, status: accepted.status || "queued", progress: Number(accepted.progress || 0), hint: accepted.hint || "Generación en segundo plano", createdAt: new Date(startedAt + 1).toISOString() });
    await persist(); renderActive(); startJobPolling(state.active.id, accepted.jobId); return;
  }
  const syntheticJobId = `completed_${crypto.randomUUID().slice(0, 10)}`;
  lab.jobs.push({ jobId: syntheticJobId, kind: draft.kind, draft: { ...draft } });
  lab.draft = null;
  await finishJob(state.active.id, syntheticJobId, accepted);
}

async function cancelJob(jobId) {
  const lab = activeLab();
  if (!lab?.jobs.some((job) => job.jobId === jobId)) return;
  await authFetchJson(`/api/schroeder/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", body: {} });
  await failJob(state.active.id, jobId, "Generación cancelada.");
}

function showError(error) {
  console.error(error);
  const lab = activeLab();
  if (lab) lab.messages.push({ role: "assistant", text: String(error?.message || error || "Error inesperado."), createdAt: new Date().toISOString() });
  renderChat();
}

async function createSession() {
  if (state.ownerId) return;
  state.active = normalizeSoundLab(makeSession());
  elements.prompt.value = "";
  state.active.soundLab.mode = readPreferences().creationMode === "voice" ? "voice" : "music";
  state.active.soundLab.settings = { ...readCreationSettings() };
  await persist(); renderActive(); restoreComposerDraft();
}

async function recoverPendingPreviews(session = state.active) {
  if (!session?.id || state.ownerId) return 0;
  const lab = normalizeSoundLab(session).soundLab;
  let remoteItems;
  try {
    remoteItems = await listPendingPreviews(session.id);
  } catch (_) {
    // No borres referencias locales si el servicio está temporalmente indisponible.
    return 0;
  }
  const remotePaths = new Set(remoteItems.map((item) => String(item?.storagePath || "")).filter(Boolean));
  const nextPending = lab.pending.filter((item) => {
    const path = String(item?.storagePath || "");
    return !path.startsWith("schroeder-sound-lab/previews/") || remotePaths.has(path);
  });
  const removed = nextPending.length !== lab.pending.length;
  lab.pending = nextPending;
  const knownPaths = new Set([...(lab.pending || []), ...(lab.library || [])].map((item) => String(item?.storagePath || "")).filter(Boolean));
  const recovered = remoteItems.filter((item) => item?.storagePath && !knownPaths.has(String(item.storagePath)));
  if (recovered.length) lab.pending.push(...recovered);
  if (removed || recovered.length) await saveSession(session);
  return recovered.length;
}

async function refreshSessions(ownerId = "") {
  state.ownerId = ownerId;
  if (ownerId) {
    const library = await listApprovedAudio(ownerId);
    const remoteSession = { id: `approved_${ownerId}`, title: "Archivos aprobados", workspaceType: WORKSPACE_TYPE, updatedAt: library[0]?.approvedAt || "", soundLab: { mode: "music", messages: [], draft: null, jobs: [], pending: [], library } };
    state.sessions = [{ id: remoteSession.id, title: remoteSession.title, updatedAt: remoteSession.updatedAt }];
    state.active = normalizeSoundLab(remoteSession); renderActive(); return;
  }
  state.sessions = await listSessions();
  // Pinta la lista y abre la sesión activa antes de consultar Storage. La
  // biblioteca aprobada es enriquecimiento remoto y no debe bloquear el
  // primer render de `sslSessionList`.
  renderSessions();
  const selected = state.sessions[0];
  state.active = selected ? normalizeSoundLab(await loadSession(selected.id)) : null;
  if (!state.active) return createSession();
  renderActive();

  const approvedItems = await listApprovedAudio().catch(() => []);
  const grouped = new Map();
  approvedItems.forEach((item) => { const key = String(item.sessionId || "").trim(); if (key) { if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item); } });
  const activeLibrary = grouped.get(state.active.id);
  if (activeLibrary?.length) {
    state.active.soundLab.library = activeLibrary;
    await saveSession(state.active);
    state.sessions = await listSessions();
    renderSessions();
  }
  await recoverPendingPreviews(state.active);
  renderActive();
}

async function initializeAdmin() {
  const token = await state.currentUser.getIdTokenResult();
  const role = String(token?.claims?.role || token?.claims?.user_role || "").toLowerCase();
  state.isAdmin = role === "admin" || token?.claims?.admin === true;
  elements.adminBtn.hidden = !state.isAdmin;
}

function openModal(modal) {
  modal.hidden = false; document.body.classList.add("ssl-modal-open");
  window.requestAnimationFrame(() => modal.querySelector("button, select, input, textarea")?.focus());
}

function closeModal(modal) {
  if (modal === elements.voiceCloneModal) resetVoiceCloneRecording();
  modal.hidden = true;
  if ([elements.agentModal, elements.generalModal, elements.voiceCloneModal].every((item) => item.hidden)) document.body.classList.remove("ssl-modal-open");
  savePreferences();
  persist().catch(showError);
}

function applyTheme(theme) {
  const clean = ["light", "mid", "dark"].includes(theme) ? theme : "dark";
  document.documentElement.dataset.schroederTheme = clean;
  try { localStorage.setItem("schroeder-sound-lab-theme", clean); } catch (_) { /* noop */ }
  const themeLabel = ({ light: "Tema claro", mid: "Tema medio", dark: "Tema oscuro" })[clean];
  elements.themeBtn.dataset.tooltip = themeLabel;
  elements.themeBtn.setAttribute("aria-label", `${themeLabel}. Cambiar tema`);
  document.querySelectorAll("[data-theme-option]").forEach((button) => button.classList.toggle("is-active", button.dataset.themeOption === clean));
}

function resizePanel(side, requestedWidth) {
  const bounds = elements.grid.getBoundingClientRect();
  const otherWidth = side === "left" ? panelWidth("--ssl-right-panel-width", 410) : panelWidth("--ssl-left-panel-width", 248);
  const minimum = side === "left" ? 190 : 280;
  const maximum = side === "left" ? 400 : 520;
  const centerMinimum = Math.min(520, Math.max(340, bounds.width * .38));
  const available = Math.max(minimum, bounds.width - otherWidth - centerMinimum);
  const width = Math.round(Math.max(minimum, Math.min(maximum, available, requestedWidth)));
  applyPanelWidths(side === "left" ? width : undefined, side === "right" ? width : undefined);
}

function setupPanelResizer(handle, side) {
  const move = (event) => {
    const bounds = elements.grid.getBoundingClientRect();
    resizePanel(side, side === "left" ? event.clientX - bounds.left : bounds.right - event.clientX);
  };
  const stop = (event) => {
    handle.releasePointerCapture?.(event.pointerId);
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", stop);
    handle.removeEventListener("pointercancel", stop);
    document.body.classList.remove("ssl-resizing");
    savePreferences();
  };
  handle.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 860px)").matches) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("ssl-resizing");
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });
  handle.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const current = panelWidth(side === "left" ? "--ssl-left-panel-width" : "--ssl-right-panel-width", side === "left" ? 248 : 410);
    resizePanel(side, current + direction * (side === "left" ? 10 : -10));
    savePreferences();
  });
}

document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
document.querySelectorAll("[data-genre-preset]").forEach((button) => button.addEventListener("click", () => {
  const genres = elements.genre.value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!genres.includes(button.dataset.genrePreset)) genres.push(button.dataset.genrePreset);
  elements.genre.value = genres.join(", "); savePreferences();
}));
document.querySelectorAll(".ssl-controls :is(input, select, textarea)").forEach((field) => field.addEventListener("change", savePreferences));
document.querySelectorAll(".ssl-controls :is(input, textarea)").forEach((field) => field.addEventListener("input", savePreferences));
elements.prompt.addEventListener("input", () => persistComposerDraft());
setupPanelResizer(elements.leftResizer, "left");
setupPanelResizer(elements.rightResizer, "right");

elements.composer.addEventListener("submit", async (event) => {
  event.preventDefault(); if (state.ownerId) return;
  const prompt = elements.prompt.value.trim();
  const isVoiceTarget = state.mode === "voice" || (!recorderState.pendingEditItem && /\b(voz|locuci[oó]n|habla|di|pronuncia|lee|sintetiz|clona)\b/i.test(prompt));
  if (recorderState.pendingBlob && !recorderState.pendingEditItem && isVoiceTarget) {
    try {
      if (!prompt) throw new Error("Escribe el texto que quieres generar con la voz grabada.");
      setRecorderUi(false, true);
      if (state.mode !== "voice") setMode("voice", false);
      const lab = activeLab();
      const startedAt = Date.now();
      const wavBlob = await blobTo24kHzMonoWav(recorderState.pendingBlob);
      const base64Audio = await blobToBase64(wavBlob || recorderState.pendingBlob);
      const textToSpeak = extractVoiceText(prompt) || prompt;
      elements.voiceText.value = textToSpeak;
      const previewUrl = recorderState.previewUrl;
      lab.messages.push({
        role: "user",
        type: "audio-reference",
        text: prompt,
        url: previewUrl,
        mode: "voice",
        createdAt: new Date(startedAt).toISOString()
      });
      lab.messages.push({
        role: "assistant",
        text: "Muestra de voz recibida. Generando audio con las características vocales de tu grabación.",
        createdAt: new Date(startedAt + 1).toISOString()
      });
      lab.draft = {
        ...buildDraft(textToSpeak, null, new Date(startedAt + 2).toISOString()),
        voiceSampleAudio: base64Audio,
        voiceName: "replicated",
        title: "Voz propia grabada"
      };
      elements.prompt.value = "";
      clearComposerDraft();
      discardRecordedReference({ clearStored: true });
      await persist();
      await generateDraft();
    } catch (error) {
      showError(error);
    } finally {
      setRecorderUi(false, false);
    }
    return;
  }
  if (recorderState.pendingBlob || recorderState.pendingEditItem) {
    try {
      if (!prompt) throw new Error("Escribe qué quieres cambiar o conservar del audio adjunto.");
      await analyzeRecordedIdea(recorderState.pendingBlob, recorderState.pendingDurationSec, prompt, recorderState.pendingEditItem);
    } catch (error) {
      showError(error);
    } finally {
      // Una excepción de FileReader, API o preparación del borrador no debe
      // dejar el botón de grabación bloqueado en estado "Analizando".
      setRecorderUi(false, false);
    }
    return;
  }
  try {
    if (state.mode === "voice" && prompt) {
      const lab = activeLab();
      const startedAt = Date.now();
      // En modo voz, el mensaje del chat es directamente el texto a sintetizar.
      // No debe pasar por el flujo de brief musical.
      const textToSpeak = extractVoiceText(prompt) || prompt;
      elements.voiceText.value = textToSpeak;
      lab.messages.push({ role: "user", text: prompt, createdAt: new Date(startedAt).toISOString() });
      lab.draft = buildDraft(textToSpeak, null, new Date(startedAt + 1).toISOString());
      elements.prompt.value = "";
      clearComposerDraft();
      await persist();
      await generateDraft();
      return;
    }
    if (shouldPrepareDraft(prompt || elements.voiceText.value.trim())) await prepareDraft(prompt || elements.voiceText.value.trim());
    else await sendConversationalMessage(prompt);
  } catch (error) { showError(error); }
});
elements.recordIdeaBtn.addEventListener("click", () => toggleRecording().catch(showError));
elements.recordedPlayBtn.addEventListener("click", () => {
  if (elements.recordedAudio.paused) {
    elements.chatFeed.querySelectorAll("audio").forEach((audio) => audio.pause());
    elements.nowPlaying.querySelector("audio")?.pause();
    elements.recordedAudio.play().catch(showError);
  }
  else elements.recordedAudio.pause();
});
elements.recordedProgress.addEventListener("input", () => {
  const total = elements.recordedAudio.duration;
  if (Number.isFinite(total) && total > 0) elements.recordedAudio.currentTime = (Number(elements.recordedProgress.value) / 1000) * total;
  syncRecordedReference();
});
elements.recordedRemoveBtn.addEventListener("click", discardRecordedReference);
elements.recordedAudio.addEventListener("loadedmetadata", syncRecordedReference);
elements.recordedAudio.addEventListener("timeupdate", syncRecordedReference);
elements.recordedAudio.addEventListener("play", syncRecordedReference);
elements.recordedAudio.addEventListener("pause", syncRecordedReference);
elements.recordedAudio.addEventListener("ended", syncRecordedReference);

elements.chatFeed.addEventListener("click", async (event) => {
  const removeGenre = event.target.closest("[data-remove-genre]")?.dataset.removeGenre;
  if (removeGenre && !state.ownerId) {
    const lab = activeLab();
    const genres = elements.genre.value.split(",").map((item) => item.trim()).filter((item) => item && item.toLowerCase() !== removeGenre.toLowerCase());
    elements.genre.value = genres.join(", ");
    lab.messages = lab.messages.filter((message) => !(message.type === "genre" && String(message.genre).toLowerCase() === removeGenre.toLowerCase()));
    persistCreationSettings();
    await persist();
    renderActive();
    return;
  }
  const action = event.target.closest("[data-chat-action]")?.dataset.chatAction;
  if (!action || state.ownerId) return;
  const lab = activeLab();
  try {
    if (action === "generate") return void generateDraft().catch(showError);
    if (action === "discard") lab.draft = null;
    if (action === "cancel-job") return await cancelJob(event.target.closest("[data-job-id]")?.dataset.jobId);
    const pendingId = event.target.closest("[data-pending-id]")?.dataset.pendingId;
    const item = lab.pending.find((entry) => entry.id === pendingId);
    if (action === "approve-audio" && item) {
      const automaticTitle = makeShortTrackTitle(item);
      item.title = automaticTitle;
      if (item.draft) item.draft.title = automaticTitle;
      const card = event.target.closest("[data-pending-id]");
      const cardAudio = card?.querySelector("audio");
      if (cardAudio && Number.isFinite(cardAudio.duration) && cardAudio.duration > 0.05) {
        item.durationSec = Math.round(cardAudio.duration * 100) / 100;
      } else if (!item.durationSec && item.draft?.durationSec) {
        item.durationSec = Number(item.draft.durationSec);
      }
      const approved = await approveAudio(item, state.active);
      const approvedDurationSec = Number(approved?.track?.durationSec || item.durationSec || 0) || 0;
      lab.library.unshift({
        ...item,
        ...(approved?.track || {}),
        durationSec: approvedDurationSec || item.durationSec || 0,
        approvedAt: approved?.track?.approvedAt || new Date().toISOString()
      });
      lab.pending = lab.pending.filter((entry) => entry.id !== pendingId);
    }
    if (action === "continue" && item) {
      savePreferences();
      setMode(item.kind === "music" ? "music" : "voice", false);
      if (item.kind === "music") attachExistingAudioReference(item);
      else {
        const openedAt = Date.now();
        lab.draft = { ...item.draft, id: `draft_${crypto.randomUUID().slice(0, 10)}`, createdAt: new Date(openedAt + 1).toISOString() };
        lab.messages.push({ role: "assistant", text: "Brief de voz abierto para editar.", createdAt: new Date(openedAt).toISOString() });
      }
    }
    await persist(); renderActive();
  } catch (error) { showError(error); }
});

function closeTrackMenus(except = null) {
  document.querySelectorAll(".ssl-track-menu:not([hidden])").forEach((menu) => { if (menu !== except) menu.hidden = true; });
}

function startTrackTitleEdit(item, heading) {
  if (!item || !heading || state.ownerId) return;
  const original = String(item.title || "Canción");
  const input = document.createElement("input");
  input.className = "ssl-track-title-input";
  input.type = "text"; input.maxLength = 180; input.value = original;
  input.setAttribute("aria-label", "Título de la canción");
  heading.replaceWith(input); input.focus(); input.select();
  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const nextTitle = input.value.replace(/\s+/g, " ").trim().slice(0, 180);
    if (!save || !nextTitle || nextTitle === original) { renderActive(); return; }
    try {
      const result = await renameApprovedAudio(item, nextTitle);
      item.title = result?.track?.title || nextTitle;
      if (item.draft) item.draft.title = item.title;
      player.rename(item);
      await persist(); renderActive();
    } catch (error) { showError(error); renderActive(); }
  };
  input.addEventListener("blur", () => finish(true), { once: true });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  });
}

function startSessionTitleEdit(card, sessionId) {
  if (!card || !sessionId || state.ownerId) return;
  const label = card.querySelector(".ssl-session-open");
  const original = String(label?.textContent || "Nueva sesión").trim();
  const input = document.createElement("input");
  input.className = "ssl-session-title-input";
  input.type = "text"; input.maxLength = 120; input.value = original;
  input.setAttribute("aria-label", "Nombre de la sesión");
  label.replaceWith(input); input.focus(); input.select();
  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const nextTitle = input.value.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!save || !nextTitle || nextTitle === original) { renderSessions(); return; }
    try {
      const session = state.active?.id === sessionId ? state.active : await loadSession(sessionId);
      if (!session) return renderSessions();
      session.title = nextTitle;
      if (state.active?.id === sessionId) state.active.title = nextTitle;
      await persist(session); renderActive();
    } catch (error) { showError(error); renderSessions(); }
  };
  input.addEventListener("blur", () => finish(true), { once: true });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  });
}

function resolveAudioDurationFromUrl(url) {
  if (!url || typeof Audio === "undefined") return Promise.resolve(0);
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      audio.src = "";
      resolve(Number(val) || 0);
    };
    const timer = setTimeout(() => finish(0), 6000);
    audio.addEventListener("loadedmetadata", () => {
      clearTimeout(timer);
      finish(audio.duration);
    }, { once: true });
    audio.addEventListener("error", () => {
      clearTimeout(timer);
      finish(0);
    }, { once: true });
    audio.src = url;
  });
}

async function ensureTrackMetadata(item) {
  if (!item) return item;
  let durationSec = Number(item.durationSec || item.draft?.durationSec || 0) || 0;
  if (durationSec <= 0.05) {
    try {
      const src = item.downloadUrl || (item.storagePath ? `/api/assets/proxy-media?storagePath=${encodeURIComponent(item.storagePath)}` : "");
      durationSec = await resolveAudioDurationFromUrl(src);
    } catch (_) {}
  }
  if (durationSec <= 0.05 && item.size > 0) {
    durationSec = Math.max(15, Math.round((item.size * 8) / 192000));
  }
  if (durationSec <= 0.05) {
    durationSec = 120;
  }
  item.durationSec = Math.round(durationSec * 100) / 100;
  if (!item.mimeType) item.mimeType = "audio/mpeg";
  if (!item.model) item.model = item.draft?.model || "lyria-3.5";
  if (!item.prompt && item.draft?.prompt) item.prompt = item.draft.prompt;
  if (!item.genre && item.draft?.genre) item.genre = item.draft.genre;
  if (!item.bpm && item.draft?.bpm) item.bpm = item.draft.bpm;
  if (!item.key && item.draft?.key) item.key = item.draft.key;
  if (!item.musicalFingerprint && item.draft?.musicalFingerprint) item.musicalFingerprint = item.draft.musicalFingerprint;
  return item;
}

function ensureLibraryItemDurations() {
  const lab = activeLab();
  if (!lab?.library?.length) return;
  lab.library.forEach((item) => {
    if (item.kind === "music" && (!item.durationSec || item.durationSec <= 0)) {
      const src = item.downloadUrl || (item.storagePath ? `/api/assets/proxy-media?storagePath=${encodeURIComponent(item.storagePath)}` : "");
      if (src) {
        resolveAudioDurationFromUrl(src).then((dur) => {
          if (dur > 0 && (!item.durationSec || item.durationSec <= 0)) {
            item.durationSec = Math.round(dur * 100) / 100;
            persist().catch(() => {});
          }
        }).catch(() => {});
      }
    }
  });
}

async function handleLibraryAction(item, action) {
  const lab = activeLab();
  if (!item || !action || !lab) return;
  try {
    if (action === "play") return await player.play(item);
    if (action === "download") return await downloadAudio(item);
    if (action === "podcaster" && !state.ownerId && item.kind === "music") {
      await ensureTrackMetadata(item);
      const result = await addApprovedAudioToPodcaster(item);
      item.podcasterLibraryId = result?.track?.libraryId || item.podcasterLibraryId || `schroeder-${item.id}`;
      if (result?.track?.durationSec) {
        item.durationSec = Number(result.track.durationSec);
      }
      lab.messages.push({ role: "assistant", text: "Canción añadida a la biblioteca de Podcaster.", createdAt: new Date().toISOString() });
    }
    if (action === "remove" && !state.ownerId && window.confirm("¿Eliminar este audio aprobado?")) {
      await deleteApprovedAudio(item); player.stopIf(item.id); lab.library = lab.library.filter((entry) => entry.id !== item.id);
    }
    if (action === "edit" && !state.ownerId) {
      savePreferences();
      setMode(item.kind === "music" ? "music" : "voice", false);
      if (item.kind === "music") attachExistingAudioReference(item);
      else {
        const openedAt = Date.now();
        lab.draft = { ...item.draft, id: `draft_${crypto.randomUUID().slice(0, 10)}`, createdAt: new Date(openedAt + 1).toISOString() };
        lab.messages.push({ role: "assistant", text: "Brief de voz abierto para editar.", createdAt: new Date(openedAt).toISOString() });
      }
    }
    await persist(); renderActive();
  } catch (error) { showError(error); }
}

elements.libraryList.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  const card = event.target.closest("[data-audio-id]");
  const action = control?.dataset.action;
  const item = activeLab()?.library.find((entry) => entry.id === card?.dataset.audioId);
  if (!item || !action) return;
  if (action === "menu") {
    const menu = card.querySelector(".ssl-track-menu"); closeTrackMenus(menu); menu.hidden = !menu.hidden; return;
  }
  closeTrackMenus();
  await handleLibraryAction(item, action);
});
elements.libraryList.addEventListener("dblclick", (event) => {
  const heading = event.target.closest(".ssl-track-title");
  const card = event.target.closest("[data-audio-id]");
  const item = activeLab()?.library.find((entry) => entry.id === card?.dataset.audioId);
  if (heading && item) startTrackTitleEdit(item, heading);
});

elements.nowPlaying.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-player-action]")?.dataset.playerAction;
  if (!action) return;
  if (action === "toggle") return player.toggle();
  if (action === "close") return player.close();
  if (action === "menu") { closeTrackMenus(elements.nowPlaying.querySelector(".ssl-track-menu")); player.toggleMenu(); return; }
  player.closeMenus();
  const item = activeLab()?.library.find((entry) => entry.id === event.target.closest("[data-audio-id]")?.dataset.audioId) || player.item;
  await handleLibraryAction(item, action);
});

elements.newCreationBtn.addEventListener("click", async () => {
  if (state.ownerId) return;
  discardRecordedReference();
  const lab = activeLab();
  await Promise.all(lab.pending.map((item) => discardPreview(item).catch(() => null)));
  lab.messages = []; lab.draft = null; lab.pending = [];
  elements.prompt.value = ""; clearComposerDraft();
  await persist(); renderActive(); elements.prompt.focus();
});
elements.newSessionBtn.addEventListener("click", () => { discardRecordedReference(); createSession().catch(showError); });
elements.sessionSearch.addEventListener("input", renderSessions);
elements.librarySearch.addEventListener("input", renderActive);
elements.sessionList.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-session-id]"); const action = event.target.closest("[data-action]")?.dataset.action;
  if (!card || !action) return;
  try {
    if (action === "session-menu") {
      const menu = card.querySelector(".ssl-session-menu"); closeTrackMenus(menu); menu.hidden = !menu.hidden; return;
    }
    if (action === "rename-session") { closeTrackMenus(); startSessionTitleEdit(card, card.dataset.sessionId); return; }
    if (action === "open") { if (state.ownerId) return; discardRecordedReference({ clearStored: false }); state.active = normalizeSoundLab(await loadSession(card.dataset.sessionId)); await recoverPendingPreviews(state.active); restoreRecordedReference(); restoreComposerDraft(); }
    if (action === "delete" && window.confirm("¿Eliminar esta sesión?")) {
      const session = await loadSession(card.dataset.sessionId);
      await Promise.all((session?.soundLab?.pending || []).map((item) => discardPreview(item).catch(() => null)));
      await deleteSession(card.dataset.sessionId); return refreshSessions(state.ownerId);
    }
    renderActive();
  } catch (error) { showError(error); }
});

elements.adminBtn.addEventListener("click", async () => {
  elements.ownerFilter.hidden = !elements.ownerFilter.hidden;
  if (!elements.ownerFilter.hidden && elements.ownerSelect.options.length === 1) {
    const users = await listUsers();
    elements.ownerSelect.insertAdjacentHTML("beforeend", users.map((user) => `<option value="${escapeHtml(user.uid)}">${escapeHtml(user.displayName || user.email)}</option>`).join(""));
  }
});
elements.ownerSelect.addEventListener("change", async () => {
  discardRecordedReference({ clearStored: false });
  try {
    await refreshSessions(elements.ownerSelect.value);
    if (!elements.ownerSelect.value) restoreRecordedReference();
  } catch (error) { showError(error); }
});
elements.agentSettingsBtn.addEventListener("click", () => openModal(elements.agentModal));
elements.generalSettingsBtn.addEventListener("click", () => openModal(elements.generalModal));
elements.cloneVoiceBtn.addEventListener("click", () => {
  elements.voiceCloneLanguage.value = elements.voiceLanguage.value === "es-ES" ? "es-US" : (VOICE_CONSENT_PHRASES[elements.voiceLanguage.value] ? elements.voiceLanguage.value : "es-US");
  elements.voiceSampleScript.textContent = VOICE_SAMPLE_SCRIPTS[elements.voiceCloneLanguage.value] || VOICE_SAMPLE_SCRIPTS["en-US"];
  elements.voiceConsentPhrase.textContent = VOICE_CONSENT_PHRASES[elements.voiceCloneLanguage.value];
  openModal(elements.voiceCloneModal);
});
elements.voiceCloneLanguage.addEventListener("change", () => {
  elements.voiceSampleScript.textContent = VOICE_SAMPLE_SCRIPTS[elements.voiceCloneLanguage.value] || VOICE_SAMPLE_SCRIPTS["en-US"];
  elements.voiceConsentPhrase.textContent = VOICE_CONSENT_PHRASES[elements.voiceCloneLanguage.value] || VOICE_CONSENT_PHRASES["en-US"];
});
async function readAudioDuration(file) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => resolve(Number(audio.duration || 0)), { once: true });
      audio.addEventListener("error", () => reject(new Error("No se pudo leer la grabación.")), { once: true });
      audio.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
const voiceCloneRecording = { stream: null, recorder: null, target: "", startedAt: 0, timer: null, chunks: [], blobs: { source: null, consent: null }, durations: { source: 0, consent: 0 }, urls: { source: "", consent: "" } };
const formatRecordingClock = (seconds) => `00:${String(Math.max(0, Math.min(59, Math.round(seconds)))).padStart(2, "0")}`;

function voiceCloneRecordingUi(target, recording) {
  const button = target === "source" ? elements.recordVoiceSampleBtn : elements.recordConsentBtn;
  const status = target === "source" ? elements.voiceSampleStatus : elements.voiceConsentStatus;
  const timer = $(target === "source" ? "sslVoiceSampleTimer" : "sslVoiceConsentTimer");
  const meter = $(target === "source" ? "sslVoiceSampleMeter" : "sslVoiceConsentMeter");
  const label = target === "source" ? "muestra" : "consentimiento";
  button.querySelector("span").textContent = recording ? "Detener grabación" : voiceCloneRecording.blobs[target] ? "Grabar de nuevo" : `Grabar ${label}`;
  button.classList.toggle("is-recording", recording);
  status.textContent = recording ? "Grabando… 0 s · mínimo 10 s" : voiceCloneRecording.blobs[target] ? `Audio listo · ${voiceCloneRecording.durations[target]} s` : "Sin grabación";
  if (!recording) {
    const seconds = voiceCloneRecording.blobs[target] ? voiceCloneRecording.durations[target] : 0;
    timer.textContent = `${formatRecordingClock(seconds)} / 00:30`;
    meter.style.width = `${Math.min(100, (seconds / 30) * 100)}%`;
  }
}

async function toggleVoiceCloneRecording(target) {
  if (voiceCloneRecording.recorder) {
    if (voiceCloneRecording.target === target) {
      const elapsed = Math.floor((Date.now() - voiceCloneRecording.startedAt) / 1000);
      if (elapsed < 10) {
        const status = target === "source" ? elements.voiceSampleStatus : elements.voiceConsentStatus;
        status.textContent = `Sigue grabando… ${elapsed} s · mínimo 10 s`;
        return;
      }
      voiceCloneRecording.recorder.stop();
    }
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("La grabación no está disponible en este navegador.");
  if (!voiceCloneRecording.stream) voiceCloneRecording.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  const recorder = new MediaRecorder(voiceCloneRecording.stream, mimeType ? { mimeType } : undefined);
  voiceCloneRecording.recorder = recorder; voiceCloneRecording.target = target; voiceCloneRecording.startedAt = Date.now(); voiceCloneRecording.chunks = [];
  voiceCloneRecordingUi(target, true);
  voiceCloneRecording.timer = window.setInterval(() => {
    if (!voiceCloneRecording.recorder || voiceCloneRecording.target !== target) return;
    const elapsed = Math.floor((Date.now() - voiceCloneRecording.startedAt) / 1000);
    const status = target === "source" ? elements.voiceSampleStatus : elements.voiceConsentStatus;
    const timer = $(target === "source" ? "sslVoiceSampleTimer" : "sslVoiceConsentTimer");
    const meter = $(target === "source" ? "sslVoiceSampleMeter" : "sslVoiceConsentMeter");
    status.textContent = `Grabando… ${elapsed} s · mínimo 10 s`;
    timer.textContent = `${formatRecordingClock(Math.min(elapsed, 30))} / 00:30`;
    meter.style.width = `${Math.min(100, (elapsed / 30) * 100)}%`;
    if (elapsed >= 30) voiceCloneRecording.recorder.stop();
  }, 250);
  recorder.addEventListener("dataavailable", (event) => { if (event.data?.size) voiceCloneRecording.chunks.push(event.data); });
  recorder.addEventListener("stop", () => {
    if (voiceCloneRecording.timer) window.clearInterval(voiceCloneRecording.timer);
    voiceCloneRecording.timer = null;
    const blob = new Blob(voiceCloneRecording.chunks, { type: recorder.mimeType || "audio/webm" });
    voiceCloneRecording.blobs[target] = blob;
    voiceCloneRecording.durations[target] = Math.max(1, Math.round((Date.now() - voiceCloneRecording.startedAt) / 1000));
    const preview = target === "source" ? elements.voiceSamplePreview : elements.voiceConsentPreview;
    if (voiceCloneRecording.urls[target]) URL.revokeObjectURL(voiceCloneRecording.urls[target]);
    voiceCloneRecording.urls[target] = URL.createObjectURL(blob);
    preview.src = voiceCloneRecording.urls[target]; preview.hidden = false;
    voiceCloneRecording.recorder = null; voiceCloneRecording.target = ""; voiceCloneRecording.chunks = [];
    voiceCloneRecordingUi(target, false);
  }, { once: true });
  recorder.start(250);
}

function resetVoiceCloneRecording() {
  if (voiceCloneRecording.recorder) voiceCloneRecording.recorder.stop();
  voiceCloneRecording.stream?.getTracks().forEach((track) => track.stop());
  if (voiceCloneRecording.timer) window.clearInterval(voiceCloneRecording.timer);
  voiceCloneRecording.timer = null;
  voiceCloneRecording.stream = null; voiceCloneRecording.recorder = null; voiceCloneRecording.target = ""; voiceCloneRecording.startedAt = 0; voiceCloneRecording.chunks = [];
  Object.keys(voiceCloneRecording.urls).forEach((key) => { if (voiceCloneRecording.urls[key]) URL.revokeObjectURL(voiceCloneRecording.urls[key]); voiceCloneRecording.urls[key] = ""; });
  voiceCloneRecording.blobs = { source: null, consent: null }; voiceCloneRecording.durations = { source: 0, consent: 0 };
  elements.voiceSamplePreview.removeAttribute("src"); elements.voiceConsentPreview.removeAttribute("src");
  elements.voiceSamplePreview.hidden = true; elements.voiceConsentPreview.hidden = true;
  voiceCloneRecordingUi("source", false); voiceCloneRecordingUi("consent", false);
}

elements.recordVoiceSampleBtn.addEventListener("click", () => toggleVoiceCloneRecording("source").catch(showError));
elements.recordConsentBtn.addEventListener("click", () => toggleVoiceCloneRecording("consent").catch(showError));
elements.voiceCloneForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const source = voiceCloneRecording.blobs.source;
  const consent = voiceCloneRecording.blobs.consent;
  if (!source || !consent || !elements.voiceOwnership.checked) return showError(new Error("Graba las dos muestras y confirma la propiedad de la voz."));
  if (source.size > 3 * 1024 * 1024 || consent.size > 3 * 1024 * 1024) return showError(new Error("Cada grabación debe pesar menos de 3 MB."));
  elements.createVoiceBtn.disabled = true;
  elements.createVoiceBtn.textContent = "Preparando audio…";
  try {
    const sourceDuration = Number(voiceCloneRecording.durations.source || 0);
    if (!Number.isFinite(sourceDuration) || sourceDuration < 10 || sourceDuration > 30.5) {
      throw new Error(`La primera muestra dura ${sourceDuration || 0} s. Grábala durante 10–30 segundos antes de crear la voz.`);
    }
    const [sourceWav, consentWav] = await Promise.all([
      blobTo24kHzMonoWav(source),
      blobTo24kHzMonoWav(consent)
    ]);
    elements.createVoiceBtn.textContent = "Creando voz…";
    const result = await authFetchJson("/api/schroeder/voices/replicate", {
      method: "POST",
      body: {
        displayName: elements.voiceCloneName.value.trim() || "Mi voz",
        languageCode: elements.voiceCloneLanguage.value,
        adultOwnershipConfirmed: true,
        sourceAudio: { mimeType: "audio/wav", data: await blobToBase64(sourceWav) },
        consentAudio: { mimeType: "audio/wav", data: await blobToBase64(consentWav) }
      }
    });
    if (!result?.voice?.id) throw new Error("No se recibió la nueva voz.");
    const preferences = readPreferences();
    const customVoices = Array.isArray(preferences.customVoices) ? preferences.customVoices : [];
    preferences.customVoices = [{ id: result.voice.id, displayName: result.voice.displayName || elements.voiceCloneName.value.trim() || "Mi voz", languageCode: result.voice.languageCode || elements.voiceCloneLanguage.value }, ...customVoices.filter((voice) => voice.id !== result.voice.id)].slice(0, 20);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
    refreshCustomVoiceOptions(result.voice.id);
    elements.voiceName.value = result.voice.id;
    savePreferences();
    resetVoiceCloneRecording();
    elements.voiceCloneForm.reset();
    closeModal(elements.voiceCloneModal);
  } catch (error) { showError(error); }
  finally { elements.createVoiceBtn.disabled = false; elements.createVoiceBtn.textContent = "Crear voz"; }
});
elements.themeBtn.addEventListener("click", () => {
  const themes = ["light", "mid", "dark"]; const current = document.documentElement.dataset.schroederTheme || "dark";
  applyTheme(themes[(themes.indexOf(current) + 1) % themes.length]); savePreferences();
});
document.querySelectorAll("[data-theme-option]").forEach((button) => button.addEventListener("click", () => { applyTheme(button.dataset.themeOption); savePreferences(); }));
elements.defaultMusicModel.addEventListener("change", () => { elements.musicModel.value = elements.defaultMusicModel.value; elements.geminiModel.value = elements.defaultMusicModel.value; updateComposerModelLabel(); savePreferences(); });
elements.fontSize.addEventListener("change", () => { applyFontSize(elements.fontSize.value); savePreferences(); });
elements.geminiModel.addEventListener("change", () => {
  elements.musicModel.value = elements.geminiModel.value;
  if (elements.geminiModel.value === "lyria-3-clip-preview") elements.musicDuration.value = "30";
  updateComposerModelLabel(); persistCreationSettings();
});
elements.musicModel.addEventListener("change", () => { elements.geminiModel.value = elements.musicModel.value; updateComposerModelLabel(); updateCreationSummary(); });
elements.quickMusicSettings.addEventListener("change", async (event) => {
  if (event.target === elements.quickGenre && elements.quickGenre.value) {
    const selectedGenre = elements.quickGenre.value;
    const genres = elements.genre.value.split(",").map((item) => item.trim()).filter(Boolean);
    if (!genres.some((item) => item.toLowerCase() === selectedGenre.toLowerCase())) {
      genres.push(selectedGenre);
      elements.genre.value = genres.join(", ");
      const currentPrompt = String(elements.prompt.value || "").trim();
      const genreInstruction = `Usa estos géneros: ${genres.join(", ")}.`;
      elements.prompt.value = currentPrompt ? `${currentPrompt}\n${genreInstruction}` : genreInstruction;
      persistComposerDraft({ immediate: true });
      activeLab()?.messages.push({ role: "user", type: "genre", genre: selectedGenre, text: "", createdAt: new Date().toISOString() });
    }
    elements.quickGenre.value = "";
  }
  elements.musicDuration.value = elements.quickDuration.value;
  elements.musicType.value = elements.quickMusicType.value;
  elements.musicLanguage.value = elements.quickLanguage.value;
  elements.bpm.value = elements.quickBpm.value;
  persistCreationSettings();
  if (event.target === elements.quickGenre) { await persist(); renderChat(); }
});
elements.quickBpm.addEventListener("input", () => { elements.bpm.value = elements.quickBpm.value; persistCreationSettings(); });

elements.quickVoiceSettings.addEventListener("change", (event) => {
  const source = event.target;
  if (source === elements.toolbarVoiceFormat) {
    elements.voiceFormat.value = source.value;
    if (source.value === "dialogue") {
      elements.voiceStyle.value = "tono dinámico según el texto";
      elements.toolbarVoiceStyle.value = elements.voiceStyle.value;
    }
  }
  if (source === elements.toolbarVoiceLanguage) elements.voiceLanguage.value = source.value;
  if (source === elements.toolbarVoiceName) elements.voiceName.value = source.value;
  if (source === elements.toolbarVoiceStyle) elements.voiceStyle.value = source.value;
  persistCreationSettings();
  syncToolbarVoiceControls();
});
elements.voiceFormat.addEventListener("change", () => {
  if (elements.voiceFormat.value === "dialogue") elements.voiceStyle.value = "tono dinámico según el texto";
  syncToolbarVoiceControls();
  persistCreationSettings();
});

function closeVoiceMenus() {
  elements.voiceMenu.hidden = true;
  elements.singerMenu.hidden = true;
  elements.voiceMenuBtn.setAttribute("aria-expanded", "false");
  elements.voiceConfigTrigger.setAttribute("aria-expanded", "false");
}

elements.voiceMenuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const willOpen = elements.voiceMenu.hidden;
  closeVoiceMenus();
  if (willOpen) {
    elements.voiceMenu.hidden = false;
    elements.voiceMenuBtn.setAttribute("aria-expanded", "true");
  }
});
elements.voiceConfigTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  elements.singerMenu.hidden = !elements.singerMenu.hidden;
  elements.voiceConfigTrigger.setAttribute("aria-expanded", String(!elements.singerMenu.hidden));
});
elements.voiceMenu.querySelectorAll("[data-voice-mode]").forEach((button) => button.addEventListener("click", () => {
  elements.musicType.value = button.dataset.voiceMode;
  elements.quickMusicType.value = button.dataset.voiceMode;
  syncVoiceMenuState();
  persistCreationSettings();
  closeVoiceMenus();
}));
elements.singerMenu.querySelectorAll("[data-singer-profile]").forEach((button) => button.addEventListener("click", (event) => {
  event.stopPropagation();
  elements.singerProfile.value = button.dataset.singerProfile;
  elements.musicType.value = "vocal";
  elements.quickMusicType.value = "vocal";
  syncVoiceMenuState();
  persistCreationSettings();
  closeVoiceMenus();
}));
elements.agentModal.addEventListener("input", persistCreationSettings);
elements.agentModal.addEventListener("change", persistCreationSettings);
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".ssl-modal"))));
document.addEventListener("click", (event) => {
  if (!event.target.closest(".ssl-menu-wrap")) closeTrackMenus();
  if (!event.target.closest(".ssl-voice-menu-wrap")) closeVoiceMenus();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeTrackMenus();
  closeVoiceMenus();
  const modal = [elements.voiceCloneModal, elements.generalModal, elements.agentModal].find((item) => !item.hidden);
  if (modal) closeModal(modal);
});

restorePreferences();
applyTheme(document.documentElement.dataset.schroederTheme || "dark");
setupFloatingTooltips();
player.restore().catch(() => { /* El navegador permitirá reanudar al siguiente gesto del usuario. */ });
window.addEventListener("pagehide", () => {
  persistComposerDraft({ immediate: true });
  if (recorderState.previewUrl) URL.revokeObjectURL(recorderState.previewUrl);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  state.currentUser = user; configureLocalSessions(user.uid);
  try { await initializeAdmin(); await refreshSessions(); restoreRecordedReference(); restoreComposerDraft(); } catch (error) { showError(error); }
});
