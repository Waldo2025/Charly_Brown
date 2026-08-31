import { authFetchJson, buildApiUrl, buildVeoApiUrl } from "./api-client.js";
import { createCurriculumRegistry, resolveCurriculumProfile, applyCurriculumProfile, buildCuratedProfileAssessment } from "./science-curriculum-profiles.mjs?v=20260814-factorization-v8";
import { installScienceActivitiesMotion } from "./science-activities-motion.mjs?v=20260730-micro-missions-v1";
import { characterPresets, createCharacterSprite } from "./science-character-library.mjs?v=20260728-subject-style-characters";
import { isHydratableSessionActivity, nextOfflineDatabaseVersion, normalizedSessionMode, orderHydrationCandidates, sessionMetadataFromRecord, sessionsShareIdentity, shouldKeepSessionAfterRemoteList } from "./science-session-records.mjs?v=20260812-session-recovery-v5";
import { despillImageMatte, keepPrimaryImageComponent, removeConnectedImageBackground } from "./science-image-cutout.mjs?v=20260812-despill-matte-v4";
import { applyScienceActivityContext, buildScienceExperienceIntroduction, deriveScienceActivityContext, meaningfulActivityText } from "./science-activity-context.mjs?v=20260813-experience-context-v1";
import { ACTIVITY_SCENE_REALISM_CONTRACT, activitySceneStyleFinish, buildActivityLevelSceneSeed, buildRealisticActivityImagePrompt } from "./science-image-prompt-contract.mjs?v=20260813-realistic-scenes-v1";
import { simulatorUsesFullyProgrammaticScene, simulatorUsesProgrammaticPrimary, validateLocalizedSimulatorExportContract } from "./science-export-contract.mjs?v=20260815-ecosystem-raster-v3";
import { BIOLOGY_ALLOWED_QUESTION_TYPES, CURRICULUM_POLICY_VERSION, buildCurriculumGenerationContract, isAssessmentDifficultyCompatible, isCurriculumContentCompatible, isQuestionTypeAllowed, isSimpleBiologyNumericAssessment, questionTypesForActivity } from "./science-curriculum-policy.mjs?v=20260814-curricular-coherence-v1";
import { experienceAdaptationAddsValue, experienceDesignQuality, experienceLearningCoverage, experienceSourcePreservation, extractExperienceAnchors, findUnrequestedBiologyConcepts, parseExpectedLearningStatements, repairExperienceProposalLanguage } from "./science-experience-proposal.mjs?v=20260816-proposal-validation-v5";
import { normalizeProcedureSequence, procedureStepText } from "./science-assessment-normalization.mjs?v=20260814-procedure-objects-v1";
import { buildGeneratedAssessmentGroundingContext, repairGeneratedAssessmentShape } from "./science-assessment-generation-repair.mjs?v=20260815-generation-repair-v1";
import { copyScienceAnswers } from "./science-answer-export.mjs";
import html2canvas from "html2canvas-pro";

const STORAGE_KEY = "scienceActivities.sessions.v2";
const DRAFT_STORAGE_KEY = "scienceActivities.draft.v2";
const ACTIVE_SESSION_STORAGE_KEY = "scienceActivities.activeSession.v1";
const SESSION_GROUPS_STORAGE_KEY = "scienceActivities.sessionGroups.v1";
let projectSaveInFlight = null;
let pendingProjectSave = null;
const sessionSetupState = { active: false, previous: null, newSessionId: null, trigger: null, formHome: null, footerHome: null };
let sessionInteractionRevision = 0;

function noteSessionInteraction() {
  sessionInteractionRevision += 1;
  return sessionInteractionRevision;
}

function isGeneratedScienceActivity(activity) {
  if (!activity) return false;
  if (activity.generation?.complete === true) return true;
  return activity.gameMode === "simulator" && Boolean(activity.profileId || activity.simulator?.profileId || activity.simulator?.modelId);
}

function setProjectSaveStatus(label, status = "saved") {
  const element = $("#saveStatus");
  if (!element) return;
  element.textContent = label;
  element.dataset.state = status;
}

function setRemoteSessionSyncStatus(label, status) {
  const element = $("#saveStatus");
  if (!element) return;
  if (status !== "syncing" && element.dataset.state !== "syncing") return;
  element.textContent = label;
  element.dataset.state = status;
}

function moveBriefToSetupModal() {
  const form = $("#activityForm");
  const footer = $(".sa-brief-footer");
  const mount = $("#newSessionBriefMount");
  if (!form || !footer || !mount) return;
  if (!sessionSetupState.formHome) {
    sessionSetupState.formHome = document.createComment("activity-form-home");
    form.before(sessionSetupState.formHome);
  }
  if (!sessionSetupState.footerHome) {
    sessionSetupState.footerHome = document.createComment("activity-footer-home");
    footer.before(sessionSetupState.footerHome);
  }
  mount.append(form, footer);
}

function restoreBriefToPanel() {
  const form = $("#activityForm");
  const footer = $(".sa-brief-footer");
  sessionSetupState.formHome?.parentNode?.insertBefore(form, sessionSetupState.formHome.nextSibling);
  sessionSetupState.footerHome?.parentNode?.insertBefore(footer, sessionSetupState.footerHome.nextSibling);
}

function setStudioSetupVisibility(hidden) {
  document.body.classList.toggle("sa-session-setup-pending", hidden);
  [$(".sa-summary"), $(".sa-workspace")].forEach((element) => {
    if (!element) return;
    if (hidden) element.setAttribute("inert", "");
    else element.removeAttribute("inert");
  });
}

function showSessionSetupModal() {
  moveBriefToSetupModal();
  const modal = $("#newSessionModal");
  modal?.classList.add("show");
  modal?.setAttribute("aria-hidden", "false");
  $("#cancelNewSessionBtn").hidden = !sessionSetupState.previous;
  window.setTimeout(() => modal?.querySelector(".sa-session-setup-dialog")?.focus(), 0);
}

function hideSessionSetupModal({ revealStudio = false } = {}) {
  const modal = $("#newSessionModal");
  modal?.classList.remove("show");
  modal?.setAttribute("aria-hidden", "true");
  restoreBriefToPanel();
  if (revealStudio) setStudioSetupVisibility(false);
}

function openInitialSessionSetup(eventOrOptions = {}) {
  const trigger = eventOrOptions?.currentTarget || eventOrOptions?.trigger || null;
  const fromInit = eventOrOptions?.fromInit === true;
  if (!fromInit && sessionSetupState.active) return;
  if (!fromInit) noteSessionInteraction();
  window.clearTimeout(draftSaveTimer);
  if (!fromInit && isGeneratedScienceActivity(state.activity)) flushLocalDraftSave();
  sessionSetupState.previous = isGeneratedScienceActivity(state.activity) ? {
    activity: structuredClone(state.activity),
    previewActivity: structuredClone(state.previewActivity || state.activity),
    activeSessionId: state.activeSessionId
  } : null;
  sessionSetupState.newSessionId = crypto.randomUUID();
  sessionSetupState.trigger = trigger;
  sessionSetupState.active = true;
  state.activeSessionId = sessionSetupState.newSessionId;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, state.activeSessionId);
  state.activity = structuredClone(DEFAULT_ACTIVITY);
  state.activity.expectedLearnings = "";
  state.activity.experiencePrompt = "";
  state.previewActivity = null;
  state.gameProgress = null;
  state.contentSelection = "start";
  syncActivityToEditor();
  setStudioSetupVisibility(true);
  showSessionSetupModal();
}

function cancelInitialSessionSetup() {
  if (!sessionSetupState.previous) return;
  noteSessionInteraction();
  const previous = sessionSetupState.previous;
  state.activity = normalizeActivity(structuredClone(previous.activity));
  state.previewActivity = structuredClone(previous.previewActivity);
  state.contentSelection = "start";
  state.activeSessionId = previous.activeSessionId;
  if (state.activeSessionId) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(state.activeSessionId));
  else localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  syncActivityToEditor();
  sessionSetupState.active = false;
  sessionSetupState.previous = null;
  sessionSetupState.newSessionId = null;
  hideSessionSetupModal({ revealStudio: true });
  persistLocalDraft();
  void renderGame();
  sessionSetupState.trigger?.focus?.();
}

function returnToSessionsFromSetup() {
  noteSessionInteraction();
  if (sessionSetupState.previous) return cancelInitialSessionSetup();
  sessionSetupState.active = false;
  sessionSetupState.newSessionId = null;
  state.activeSessionId = null;
  localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  showNoActiveSession();
  $("#quickNewBtn")?.focus();
}

function completeInitialSessionSetup() {
  if (!sessionSetupState.active) return;
  state.activeSessionId = sessionSetupState.newSessionId || state.activeSessionId || crypto.randomUUID();
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(state.activeSessionId));
  sessionSetupState.active = false;
  sessionSetupState.previous = null;
  sessionSetupState.newSessionId = null;
  hideSessionSetupModal({ revealStudio: true });
  const frame = $(".sa-game-frame");
  frame?.setAttribute("tabindex", "-1");
  frame?.focus?.({ preventScroll: true });
}

function showNoActiveSession() {
  window.clearTimeout(draftSaveTimer);
  window.clearTimeout(remoteSaveTimer);
  state.sessionLoadAbortController?.abort?.();
  state.gameInstance?.destroy?.();
  state.gameInstance = null;
  state.activity = normalizeActivity(structuredClone(DEFAULT_ACTIVITY));
  state.previewActivity = null;
  state.gameProgress = null;
  state.contentSelection = "start";
  state.activeSessionId = null;
  localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  hideSessionSetupModal({ revealStudio: true });
  setStudioSetupVisibility(false);
  syncActivityToEditor();
  $("#previewTitle").textContent = "Sin sesión activa";
  const mount = $("#scienceGameMount");
  if (mount) {
    mount.innerHTML = '<div class="sa-empty-state"><strong>No hay una sesión activa.</strong><span>Selecciona una sesión guardada o crea una nueva cuando quieras comenzar.</span></div>';
  }
  $("#scienceGameControls")?.replaceChildren();
  renderSessions();
}
const OFFLINE_DB_NAME = "scienceActivities.offline.v1";
const OFFLINE_DB_VERSION = 2;
const OFFLINE_SESSIONS_STORE = "sessions";
const OFFLINE_DRAFTS_STORE = "drafts";
const OFFLINE_SESSION_INDEX_STORE = "sessionIndex";
const CUSTOM_CHARACTER_STORAGE_KEY = "scienceActivities.characters.v1";
const SCIENCE_CHARACTER_STORAGE_BUCKET = "gs://charly-brown.firebasestorage.app";
const SCIENCE_THEME_STORAGE_KEY = "scienceActivities.theme.v1";
const EXPERIENCE_PROPOSAL_MEMORY_KEY = "scienceActivities.experienceProposals.v1";
const GAME_RUNTIME_SPECIFIER = "./science-game-runtime.mjs?v=20260814-question-scroll-origin-v20";
const SIMULATOR_RUNTIME_SPECIFIER = "./science-simulator-runtime.mjs?v=20260815-number-line-controls-v54";
const SIMULATOR_EXPORT_BUNDLE_VERSION = "20260815-number-line-controls-v9";
const RUNTIME_URL = new URL(GAME_RUNTIME_SPECIFIER, import.meta.url);
const PHASER_URL = new URL("../vendor/phaser/phaser.esm.min.js", import.meta.url);
const ANIME_URL = new URL("../vendor/animejs/anime.esm.min.js", import.meta.url);
const ANIME_LICENSE_URL = new URL("../vendor/animejs/LICENSE.md", import.meta.url);
const MOTION_URL = new URL("./science-activities-motion.mjs?v=20260730-micro-missions-v1", import.meta.url);
let draftSaveTimer = 0;
let remoteSaveTimer = 0;
let offlineDbPromise = null;
let offlineWriteChain = Promise.resolve();
let gameRuntimePromise = null;
let simulatorRuntimePromise = null;
let imageGeneratorPromise = null;
let firebaseWriterPromise = null;
let firebaseAuthPromise = null;
const loadedOptionalStyles = new Map();

async function getScienceAuth({ ready = false } = {}) {
  firebaseAuthPromise ||= Promise.all([
    import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js"),
    import("./firebase-default-app.js")
  ]).then(([{ getAuth }, { getDefaultFirebaseApp }]) => getAuth(getDefaultFirebaseApp()));
  const auth = await firebaseAuthPromise;
  if (ready && typeof auth.authStateReady === "function") await auth.authStateReady();
  return auth;
}

function markStartup(name) {
  try { performance.mark(`science-activities:${name}`); } catch (_) { }
}

function notifyEditorInteractive() {
  document.documentElement.dataset.scienceActivitiesInteractive = "true";
  document.dispatchEvent(new CustomEvent("scienceactivities:interactive"));
  markStartup("editor-interactive");
}

function afterBrowserPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function loadOptionalStyle(href, id) {
  if (loadedOptionalStyles.has(id)) return loadedOptionalStyles.get(id);
  const existing = document.querySelector(`link[data-science-optional-style="${id}"]`);
  if (existing) return Promise.resolve(existing);
  const promise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.scienceOptionalStyle = id;
    link.onload = () => resolve(link);
    link.onerror = () => resolve(link);
    document.head.append(link);
  });
  loadedOptionalStyles.set(id, promise);
  return promise;
}

async function loadGameRuntime() {
  await Promise.all([
    loadOptionalStyle("science-hud-themes.css?v=20260815-centered-gameplay-v44", "hud-themes"),
    loadOptionalStyle("science-timeline-responsive.css?v=20260814-timeline-pointer-v11", "timeline-responsive")
  ]);
  gameRuntimePromise ||= import(GAME_RUNTIME_SPECIFIER);
  return gameRuntimePromise;
}

async function loadSimulatorRuntime() {
  simulatorRuntimePromise ||= import(SIMULATOR_RUNTIME_SPECIFIER);
  return simulatorRuntimePromise;
}

async function loadImageGenerator() {
  imageGeneratorPromise ||= import("../imagecreator/api.js");
  return imageGeneratorPromise;
}

async function generateImagesOnDemand(options) {
  const { generateImagesViaGemini } = await loadImageGenerator();
  return generateImagesViaGemini(options);
}

async function loadFirebaseWriter() {
  firebaseWriterPromise ||= Promise.all([
    import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js")
  ]).then(([firestore, storage]) => ({ firestore, storage }));
  return firebaseWriterPromise;
}

let zipRuntimePromise = null;
async function loadZipRuntime() {
  const available = window.JSZip?.prototype?.generateAsync ? window.JSZip : window.htmlDocx?.JSZip;
  if (available) return available;
  zipRuntimePromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "js/html-docx.js?v=20260812-lazy-export-v1";
    script.onload = () => {
      const JSZip = window.JSZip?.prototype?.generateAsync ? window.JSZip : window.htmlDocx?.JSZip;
      if (JSZip) resolve(JSZip);
      else reject(new Error("No se encontró el componente para crear ZIP."));
    };
    script.onerror = () => reject(new Error("No se pudo cargar el componente para crear ZIP."));
    document.head.append(script);
  });
  return zipRuntimePromise;
}

function readCustomCharacters() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_CHARACTER_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function fillCharacterOptions(selectedId = "", activeCharacter = null) {
  const subject = state.activity.subject || $("#subjectSelect")?.value || "physics";
  const visualStyle = state.activity.visualStyle || $("#visualStyleSelect")?.value || "kawaii-lab";
  const presets = characterPresets(subject, visualStyle, readCustomCharacters());
  if (activeCharacter?.id && !presets.some((item) => item.id === activeCharacter.id)) presets.push(activeCharacter);
  const select = $("#characterSelect");
  if (!select) return presets;
  select.innerHTML = presets.map((preset) => (
    `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)} · ${escapeHtml(preset.role)}</option>`
  )).join("");
  const selected = presets.find((item) => item.id === selectedId) || presets[0];
  if (selected) select.value = selected.id;
  return presets;
}

function renderCharacterPreview() {
  const character = state.activity.playerCharacter;
  const sprite = state.activity.playerSprite;
  const preview = $("#characterPreviewSprite");
  if (!character || !sprite?.dataUrl || !preview) return;
  preview.style.backgroundImage = `url("${sprite.dataUrl}")`;
  $("#characterPreviewName").textContent = character.name;
  $("#characterDescription").textContent = `${character.role}. Adaptado a ${SUBJECT_LABELS[state.activity.subject] || "la materia"} y al estilo seleccionado.`;
  populateCharacterCustomizer();
}

function applySelectedCharacter(shouldRender = true) {
  const presets = fillCharacterOptions($("#characterSelect")?.value, state.activity.playerCharacter);
  const selected = presets.find((item) => item.id === $("#characterSelect")?.value) || presets[0];
  if (!selected) return;
  state.activity.playerCharacter = structuredClone(selected);
  state.activity.playerSprite = createCharacterSprite(selected);
  renderCharacterPreview();
  scheduleLocalDraftSave();
  if (shouldRender) renderGame();
}

function populateCharacterCustomizer() {
  const character = state.activity.playerCharacter;
  if (!character || !$("#characterNameInput")) return;
  $("#characterNameInput").value = character.name || "";
  $("#characterRoleInput").value = character.role || "";
  $("#characterBodySelect").value = character.bodyType || (character.id?.endsWith("-2") ? "tech" : "explorer");
  $("#characterPrimaryColor").value = /^#[0-9a-f]{6}$/i.test(character.palette?.[0]) ? character.palette[0] : "#4e8cff";
  $("#characterAccentColor").value = /^#[0-9a-f]{6}$/i.test(character.palette?.[1]) ? character.palette[1] : "#ff7b8f";
}

function createCharacterVariation() {
  populateCharacterModal();
  $("#characterCreatorModal").classList.add("show");
  $("#characterCreatorModal").setAttribute("aria-hidden", "false");
}

function closeCharacterModal() {
  $("#characterCreatorModal").classList.remove("show");
  $("#characterCreatorModal").setAttribute("aria-hidden", "true");
}

function selectedCharacterMovements() {
  return Object.fromEntries(
    [...document.querySelectorAll("[data-character-movement]")]
      .map((input) => [input.value, input.checked]),
  );
}

function populateCharacterModal() {
  const character = state.activity.playerCharacter || characterPresets(
    state.activity.subject,
    state.activity.visualStyle,
  )[0];
  $("#characterModalName").value = character?.name || "";
  $("#characterModalRole").value = character?.role || "";
  $("#characterGenderSelect").value = character?.gender || "female";
  $("#characterPlayerStyle").value = character?.playerStyle || "arcade-hd";
  $("#characterPromptInput").value = character?.prompt || "";
  const movements = character?.movements || {};
  document.querySelectorAll("[data-character-movement]").forEach((input) => {
    input.checked = movements[input.value] !== false;
  });
  const image = $("#characterModalPreview");
  image.src = state.activity.playerSprite?.dataUrl || state.activity.playerSprite?.src || "";
  image.hidden = !image.src;
  $("#characterModalEmpty").hidden = Boolean(image.src);
  $("#characterModalStatus").textContent = "Configura el personaje y genera su plantilla de movimientos.";
}

function characterConfigFromModal() {
  const base = state.activity.playerCharacter || characterPresets(
    state.activity.subject,
    state.activity.visualStyle,
  )[0];
  return {
    ...base,
    id: base?.custom ? base.id : `custom-${state.activity.subject}-${state.activity.visualStyle}-${crypto.randomUUID()}`,
    name: $("#characterModalName").value.trim() || base?.name || "Personaje",
    role: $("#characterModalRole").value.trim() || base?.role || "Explorador científico",
    gender: $("#characterGenderSelect").value,
    playerStyle: $("#characterPlayerStyle").value,
    prompt: $("#characterPromptInput").value.trim(),
    movements: selectedCharacterMovements(),
    bodyType: $("#characterBodySelect")?.value || base?.bodyType || "explorer",
    palette: base?.palette || ["#4e8cff", "#ff7b8f", "#183b4e", "#ffd166"],
    subject: state.activity.subject,
    visualStyle: state.activity.visualStyle,
    custom: true,
  };
}

async function generateCharacterTemplate() {
  const button = $("#generateCharacterTemplateBtn");
  const character = characterConfigFromModal();
  button.disabled = true;
  $("#characterModalStatus").textContent = "Generando una hoja de movimientos consistente…";
  try {
    const sprite = await generatePlayerSpriteWithGemini(state.activity, character);
    if (!sprite?.dataUrl) throw new Error("No se recibió una plantilla válida.");
    state.activity.playerCharacter = character;
    state.activity.playerSprite = sprite;
    const saved = readCustomCharacters();
    localStorage.setItem(
      CUSTOM_CHARACTER_STORAGE_KEY,
      JSON.stringify([...saved.filter((item) => item.id !== character.id), character].slice(-24)),
    );
    fillCharacterOptions(character.id, character);
    renderCharacterPreview();
    $("#characterModalPreview").src = sprite.dataUrl;
    $("#characterModalPreview").hidden = false;
    $("#characterModalEmpty").hidden = true;
    $("#characterModalStatus").textContent = "Plantilla lista. Revisa las poses antes de guardarla.";
    scheduleLocalDraftSave();
    renderGame();
  } catch (error) {
    console.error("[ScienceActivities] Character generation failed:", error);
    $("#characterModalStatus").textContent = error?.message || "No se pudo generar el personaje.";
  } finally {
    button.disabled = false;
  }
}

async function saveCharacterToFirebase() {
  const character = state.activity.playerCharacter;
  const sprite = state.activity.playerSprite;
  if (!character || !sprite?.dataUrl) {
    $("#characterModalStatus").textContent = "Primero genera una plantilla del personaje.";
    return;
  }
  const button = $("#saveCharacterFirebaseBtn");
  button.disabled = true;
  $("#characterModalStatus").textContent = "Limpiando la imagen y guardando el personaje…";
  try {
    const auth = await getScienceAuth();
    const app = auth.app;
    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión para guardar el personaje.");
    const { firestore, storage: storageApi } = await loadFirebaseWriter();
    const { doc, getFirestore, serverTimestamp, setDoc } = firestore;
    const { getDownloadURL, getStorage, ref: firebaseStorageRef, uploadBytes } = storageApi;
    const clean = await sanitizeAndResizeImage(sprite.dataUrl, 1536);
    const safeId = String(character.id).replace(/[^a-z0-9_-]/gi, "-");
    const storagePath = `science-characters/${user.uid}/${safeId}.webp`;
    // Use the active Firebase Storage bucket explicitly. This avoids inheriting a
    // stale local runtime setting from an app instance initialized by another page module.
    const storage = getStorage(app, SCIENCE_CHARACTER_STORAGE_BUCKET);
    const fileRef = firebaseStorageRef(storage, storagePath);
    await uploadBytes(fileRef, clean.blob, { contentType: clean.contentType });
    const spriteUrl = await getDownloadURL(fileRef);
    const firebaseDocId = `${user.uid}_${safeId}`;
    await setDoc(doc(getFirestore(app), "scienceCharacters", firebaseDocId), {
      ownerId: user.uid,
      characterId: character.id,
      name: character.name,
      role: character.role,
      gender: character.gender,
      playerStyle: character.playerStyle,
      subject: character.subject,
      visualStyle: character.visualStyle,
      movements: character.movements,
      palette: character.palette,
      spriteUrl,
      storagePath,
      sprite: {
        width: clean.width,
        height: clean.height,
        columns: sprite.columns || 4,
        rows: sprite.rows || 2,
        poses: sprite.poses || {},
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });
    state.activity.playerCharacter = { ...character, firebaseDocId, spriteUrl, storagePath };
    state.activity.playerSprite = { ...sprite, src: spriteUrl, storagePath };
    scheduleLocalDraftSave();
    $("#characterModalStatus").textContent = "Personaje guardado correctamente en Firebase.";
    showToast("Personaje guardado en Firebase.");
  } catch (error) {
    console.error("[ScienceActivities] Character Firebase save failed:", error);
    $("#characterModalStatus").textContent = error?.message || "No se pudo guardar el personaje.";
  } finally {
    button.disabled = false;
  }
}

function applyCharacterCustomization() {
  const base = state.activity.playerCharacter;
  if (!base) return;
  const saved = readCustomCharacters();
  const preset = {
    ...base,
    id: base.custom ? base.id : `custom-${base.subject}-${base.visualStyle}-${crypto.randomUUID()}`,
    name: $("#characterNameInput").value.trim() || base.name,
    role: $("#characterRoleInput").value.trim() || base.role,
    bodyType: $("#characterBodySelect").value,
    palette: [
      $("#characterPrimaryColor").value,
      $("#characterAccentColor").value,
      base.palette?.[2] || "#183b4e",
      base.palette?.[3] || "#ffd166",
    ],
    custom: true,
  };
  const next = [...saved.filter((item) => item.id !== preset.id), preset].slice(-24);
  localStorage.setItem(CUSTOM_CHARACTER_STORAGE_KEY, JSON.stringify(next));
  state.activity.playerCharacter = preset;
  state.activity.playerSprite = createCharacterSprite(preset);
  fillCharacterOptions(preset.id, preset);
  renderCharacterPreview();
  scheduleLocalDraftSave();
  renderGame();
  $("#characterCustomizer").open = false;
  showToast("Personaje personalizado y aplicado al videojuego.");
}

function createReviewProgressState() {
  return {
    level: 1,
    question: 1,
    correctAnswers: 0,
    completedQuestions: 0,
    briefedLevels: [],
    score: 0,
    levelScore: 0,
    streak: 0,
    bestStreak: 0,
    scoredQuestions: {}
  };
}

async function openEditorQuestionReview() {
  const reviewButton = document.getElementById("quickQuestionReviewBtn");
  if (reviewButton) reviewButton.disabled = true;
  try {
    let controller = state.assessmentController;
    if (!controller?.openQuestion) {
      await renderGame({ resetProgress: false });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      controller = state.assessmentController;
    }
    if (!controller?.openQuestion?.(Number(state.contentQuestionIndex) || 0)) {
      showToast("No se pudo abrir la pregunta de esta vista previa.");
      return;
    }
    document.querySelector('[data-inspector-tab="questions"]')?.click();
    const answered = await controller.answerCorrectly?.();
    showToast(answered
      ? "Respuesta correcta cargada para revisión."
      : "La pregunta se abrió, pero no fue posible cargar su respuesta.");
  } catch (error) {
    console.error("[ScienceActivities] Quick question review failed:", error);
    showToast("No se pudo preparar la respuesta de revisión.");
  } finally {
    if (reviewButton) reviewButton.disabled = false;
  }
}

function mountEditorQuestionReviewButton() {
  const existingButton = document.getElementById("quickQuestionReviewBtn");
  if (existingButton) {
    existingButton.addEventListener("click", () => { void openEditorQuestionReview(); });
    return;
  }

  const previewHeading = [...document.querySelectorAll("h1, h2, h3, h4, span, strong")].find(
    (element) => element.textContent?.trim().toLowerCase() === "preview interactivo"
  );
  const previewHeader = previewHeading?.closest("header, [class*='header'], [class*='toolbar']") || previewHeading?.parentElement;
  if (!previewHeader) return;
  const button = document.createElement("button");
  button.id = "quickQuestionReviewBtn";
  button.className = "sa-quick-question-review";
  button.type = "button";
  button.title = "Cargar y comprobar la respuesta correcta de la pregunta seleccionada";
  button.setAttribute("aria-label", "Probar respuesta correcta en revisión rápida");
  button.innerHTML = '<span class="sa-action-sheen" aria-hidden="true"></span><i class="fas fa-circle-check" aria-hidden="true"></i>';
  button.addEventListener("click", () => { void openEditorQuestionReview(); });

  const actionBar = previewHeader.querySelector(".sa-stage-actions") || previewHeader;
  actionBar.append(button);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountEditorQuestionReviewButton, { once: true });
} else {
  mountEditorQuestionReviewButton();
}
const VISUAL_STYLE_DIRECTIONS = {
  "rive-kawaii-signal": "videojuego educativo japonés contemporáneo Kawaii Signal para adolescentes, paneles suaves de alta calidad con coral, aqua y verde lima, señalética científica clara, ilustración vectorial limpia y movimiento elástico Rive; moderno, despejado y nunca preescolar",
  "rive-tokyo-tech": "HUD científico Tokyo Tech de videojuego japonés contemporáneo, grafito y blanco cálido con cian eléctrico y lima ácida, geometría modular precisa, señalética de estación y visualización de datos de alta legibilidad; premium, sobrio y táctil",
  "rive-arcade-matsuri": "HUD Arcade Matsuri de videojuego japonés contemporáneo, índigo profundo con magenta, amarillo festival y cian, módulos expresivos inspirados en carteles de matsuri, formas vectoriales nítidas y movimiento Rive enérgico sin pixel art retro",
  "rive-solar-circuit": "HUD Solar Circuit de exploración energética contemporánea, azul tinta y marfil cálido con naranja solar y cian, diagramas de flujo luminosos, módulos aerodinámicos y movimiento Rive preciso; tecnológico, optimista y de alta legibilidad",
  "rive-bio-pulse": "HUD Bio Pulse de biotecnología contemporánea, verde bosque profundo con turquesa, lima y crema, patrones celulares abstractos, paneles orgánicos y pulsos Rive suaves; científico, natural y nunca infantil",
  "rive-lunar-blueprint": "HUD Lunar Blueprint de ingeniería espacial, azul medianoche con blanco hielo y azul eléctrico, retículas orbitales, cotas técnicas y paneles de misión Rive; sobrio, cinematográfico y extremadamente legible",
  "rive-volcanic-core": "HUD Volcanic Core de geociencias y energía, carbón oscuro con naranja incandescente, rojo mineral y arena clara, estratos geométricos y animaciones Rive de pulso térmico; intenso pero académico",
  "rive-prism-glass": "HUD Prism Glass de óptica y laboratorio avanzado, superficies claras translúcidas con cobalto, coral y aqua, refracciones geométricas, módulos de vidrio y movimiento Rive limpio; luminoso, editorial y contemporáneo",
  "kawaii-lab": "club de ciencias anime contemporáneo para estudiantes de 14 a 17 años, personajes adolescentes de proporciones naturales, cel shading limpio, color optimista y tecnología de laboratorio creíble; expresivo pero nunca chibi, infantil ni preescolar",
  "tech-minimal": "interfaz científica japonesa minimalista para adolescentes, geometría precisa, blanco limpio, tinta azul marino, acentos cian y visualización de datos; sin personajes infantiles, chibi ni estética de juguete",
  "arcade-science": "videojuego científico arcade de 16 bits para público adolescente, pixel art nítido, sprites juveniles proporcionados, alto contraste, HUD técnico y acción dinámica; sin mascotas infantiles",
  "pastel-adventure": "novela gráfica científica juvenil en gouache editorial, escenarios amplios, textura artística, estudiantes adolescentes y composición cinematográfica; evitar apariencia de cuento infantil",
  "cosmic-kawaii": "aventura espacial anime juvenil con tripulación adolescente, tecnología orbital detallada, planetas luminosos y gradientes cósmicos intensos; sin criaturas bebé, chibi ni proporciones infantiles",
  "eco-explorer": "expedición naturalista juvenil de enfoque documental, estudiantes adolescentes con equipo de campo, verdes orgánicos, texturas botánicas y fauna científicamente correcta",
  "storybook-science": "novela gráfica científica para adolescentes en acuarela editorial y collage sofisticado, iluminación dramática, composición narrativa y personajes juveniles proporcionados; no cuento infantil",
  "neon-lab": "laboratorio futurista cyberpunk juvenil, personajes adolescentes proporcionados, vectores afilados, vidrio oscuro, neón cian y magenta e iluminación dramática; sin estética infantil",
  "ocean-discovery": "expedición submarina juvenil con estética de documental y videojuego, estudiantes adolescentes, profundidad azul, bioluminiscencia, tecnología de exploración y organismos detallados"
};

function simulatorObjectArtDirection(visualStyle = "tech-minimal") {
  if (/kawaii|pastel|storybook|eco|ocean/i.test(visualStyle)) return "polished educational illustration, clean natural colors, subtle material shading";
  if (/arcade/i.test(visualStyle)) return "crisp game sprite rendering, restrained high-contrast color palette, clean material shading";
  if (/bio|volcanic/i.test(visualStyle)) return "scientifically accurate organic or material rendering, clean silhouette, controlled natural color";
  if (/prism|lunar|solar|tokyo|tech|neon|cosmic/i.test(visualStyle)) return "premium scientific product rendering, precise geometry, restrained cyan accent lighting, realistic materials";
  return "premium educational scientific illustration, precise geometry, realistic materials, clean silhouette";
}

function simulatorBackgroundArtDirection(visualStyle = "tech-minimal") {
  if (/kawaii|pastel|storybook/i.test(visualStyle)) return "polished editorial environment, clean natural colors, soft material shading, calm uncluttered composition";
  if (/arcade/i.test(visualStyle)) return "crisp environmental illustration, restrained high-contrast palette, simple readable shapes, no game interface";
  if (/bio|eco|ocean/i.test(visualStyle)) return "scientifically plausible natural environment, organic color palette, documentary lighting, uncluttered composition";
  if (/volcanic/i.test(visualStyle)) return "scientifically plausible geological environment, mineral textures, controlled warm lighting, uncluttered composition";
  if (/prism|lunar|solar|tokyo|tech|neon|cosmic/i.test(visualStyle)) return "premium physical environment, precise architecture, realistic materials, restrained cinematic lighting, uncluttered composition";
  return "premium educational environment, realistic materials, balanced lighting, uncluttered composition";
}

const SIMULATOR_BACKGROUND_EXCLUSION_CONTRACT = [
  "BACKGROUND PLATE ONLY: render only the environment explicitly requested and the features strictly required by that request.",
  "Never introduce terrain, architecture, roads, tracks, corridors, platforms, runways, walkways, rooms, laboratories or surfaces unless the user explicitly requested them or the physical phenomenon truly requires them.",
  "Do not add monitors, screens, dashboards, control panels, consoles, instruments, gauges, charts, plots, graphs, data displays, telemetry, signs, labels, arrows, motion trails, icons, buttons, switches, cables, diagrams, formulas, rulers, measurement marks, HUD, UI, overlays, frames, reticles, grids, schematics, holograms, floating graphics, decorative scientific props or the animated subject.",
  "If an element can be operated, measured, read, interpreted as an interface, or is not structurally necessary to the requested place, omit it.",
  "No people, no text, no letters, no numbers, no logos and no watermark."
].join(" ");

const SIMULATOR_VISUAL_SCENE_VERSION = 1;
const SIMULATOR_VISUAL_LAYER_LIMIT = 6;
const SIMULATOR_VISUAL_BUDGET_BYTES = 10 * 1024 * 1024;
const NUMBER_LINE_BACKGROUND_PROMPT = "Observatorio científico nocturno estilizado, amplio y despejado, sin textos, interfaces, reglas, ejes, marcas ni flechas: la recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta en el simulador.";
const NUMBER_LINE_CUSTOM_SCENARIO_CONTRACT = "CUSTOM CONTENT LOCK: preserve only the environment explicitly requested by the teacher. Do not translate an abstract or celestial background into a physical place. Do not add floors, ground, roads, tracks, corridors, platforms, runways, walkways, bridges, rails, buildings, rooms, laboratories, furniture, machines, props or foreground objects unless the teacher named them. If the request is outer space, the universe, stars, nebulae or galaxies, render an uninterrupted celestial view from edge to edge with no constructed surface or architecture. Keep the center readable only through lighting and contrast, never by inventing a support or pathway. No incluir rectas, ejes, marcas, números, texto, flechas, vectores, marcadores ni diagramas: la recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta en el simulador.";
const DEFAULT_SIMULATOR_VISUAL_ASSETS = Object.freeze({
  numberLine: {
    background: new URL("../assets/simulator-fallbacks/number-line-observatory-v1.webp", import.meta.url).href
  },
  ecosystemEnergy: {
    background: new URL("../assets/simulator-fallbacks/ecosystem-energy-prairie-v2.webp", import.meta.url).href,
    layers: [
      { id: "ecosystem-sun", label: "Sol · fuente de energía", role: "energy-source", trophicLevel: 0, imageSrc: new URL("../assets/simulator-fallbacks/ecosystem-energy-sun.webp?v=20260815-hq-v2", import.meta.url).href, anchor: { x: .09, y: .13 }, scale: .12, depth: 4, motionPreset: "pulse", driver: "control:solarEnergy" },
      { id: "ecosystem-grass", label: "Pasto · productor", role: "producer", trophicLevel: 1, imageSrc: new URL("../assets/simulator-fallbacks/ecosystem-energy-grass.webp?v=20260815-hq-v2", import.meta.url).href, anchor: { x: .13, y: .68 }, scale: .17, depth: 6, motionPreset: "pulse", driver: "control:producerCapture" },
      { id: "ecosystem-grasshopper", label: "Saltamontes · consumidor primario", role: "primary-consumer", trophicLevel: 2, imageSrc: new URL("../assets/simulator-fallbacks/ecosystem-energy-grasshopper.webp?v=20260815-hq-v2", import.meta.url).href, anchor: { x: .31, y: .68 }, scale: .15, depth: 7, motionPreset: "vibrate", driver: "measurement:energyFlow" },
      { id: "ecosystem-frog", label: "Rana · consumidor secundario", role: "secondary-consumer", trophicLevel: 3, imageSrc: new URL("../assets/simulator-fallbacks/ecosystem-energy-frog.webp?v=20260815-hq-v2", import.meta.url).href, anchor: { x: .49, y: .68 }, scale: .15, depth: 8, motionPreset: "pulse", driver: "measurement:energyFlow" },
      { id: "ecosystem-snake", label: "Serpiente · consumidor terciario", role: "tertiary-consumer", trophicLevel: 4, imageSrc: new URL("../assets/simulator-fallbacks/ecosystem-energy-snake.webp?v=20260815-hq-v2", import.meta.url).href, anchor: { x: .67, y: .68 }, scale: .17, depth: 9, motionPreset: "pulse", driver: "measurement:energyFlow" },
      { id: "ecosystem-hawk", label: "Halcón · depredador superior", role: "apex-predator", trophicLevel: 5, imageSrc: new URL("../assets/simulator-fallbacks/ecosystem-energy-hawk.webp?v=20260815-hq-v2", import.meta.url).href, anchor: { x: .85, y: .23 }, scale: .18, depth: 10, motionPreset: "pulse", driver: "measurement:energyFlow" }
    ]
  }
});
const SIMULATOR_MOTION_PRESETS = new Set([
  "translate-x", "translate-y", "projectile", "orbit", "rotate", "pulse",
  "vibrate", "flow", "scale", "phase-step", "static"
]);
const SIMULATOR_VISUAL_PLAN_SCHEMA = {
  type: "object",
  properties: {
    background: {
      type: "object",
      properties: { prompt: { type: "string" }, alt: { type: "string" } },
      required: ["prompt", "alt"]
    },
    layers: {
      type: "array", minItems: 1, maxItems: SIMULATOR_VISUAL_LAYER_LIMIT,
      items: {
        type: "object",
        properties: {
          id: { type: "string" }, label: { type: "string" }, role: { type: "string" }, prompt: { type: "string" },
          trophicLevel: { type: "number" }, motionPreset: { type: "string", enum: [...SIMULATOR_MOTION_PRESETS] }, driver: { type: "string" },
          anchorX: { type: "number" }, anchorY: { type: "number" }, depth: { type: "number" }, scale: { type: "number" }
        },
        required: ["id", "label", "role", "prompt", "motionPreset", "driver", "anchorX", "anchorY", "depth", "scale"]
      }
    }
  },
  required: ["background", "layers"]
};

function normalizeSimulatorVisualScene(activity, scene = activity?.visualScene) {
  const source = scene && typeof scene === "object" ? scene : {};
  const isCodeDrawnNumberLine = activity?.simulator?.modelId === "number-line"
    || activity?.simulationType === "number-line"
    || activity?.variant === "number-line";
  const customScenarioRequested = activity?.simulatorVisualSelection?.scenarioId === "__custom_simulator_visual__"
    && Boolean(String(activity?.simulatorVisualSelection?.customScenario || activity?.simulatorVisualSelection?.scenarioLabel || "").trim());
  const isEcosystemEnergy = activity?.subject === "biology"
    && (String(activity?.topic || "").trim() === "Transformación de la energía en los ecosistemas"
      || activity?.simulator?.sceneVariant === "ecosystem-energy-flow"
      || (activity?.controls || []).some((control) => control.id === "solarEnergy"));
  const defaultVisuals = isCodeDrawnNumberLine
    ? DEFAULT_SIMULATOR_VISUAL_ASSETS.numberLine
    : isEcosystemEnergy ? DEFAULT_SIMULATOR_VISUAL_ASSETS.ecosystemEnergy : null;
  const controlIds = new Set((activity?.controls || []).map((control) => String(control.id)));
  const seen = new Set();
  let layers = (isCodeDrawnNumberLine ? [] : Array.isArray(source.layers) ? source.layers : []).slice(0, SIMULATOR_VISUAL_LAYER_LIMIT).map((layer, index) => {
    const rawId = String(layer?.id || `element-${index + 1}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || `element-${index + 1}`;
    const id = seen.has(rawId) ? `${rawId}-${index + 1}` : rawId;
    seen.add(id);
    const requestedDriver = String(layer?.driver || "time").trim();
    const driver = requestedDriver === "time"
      || requestedDriver.startsWith("measurement:")
      || (requestedDriver.startsWith("control:") && controlIds.has(requestedDriver.slice(8)))
      ? requestedDriver : "time";
    return {
      id,
      label: String(layer?.label || `Elemento ${index + 1}`).trim().slice(0, 120),
      role: String(layer?.role || (index === 0 ? "primary" : "supporting")).trim().slice(0, 80),
      trophicLevel: Number.isFinite(Number(layer?.trophicLevel)) ? Math.max(0, Math.min(5, Math.round(Number(layer.trophicLevel)))) : null,
      prompt: String(layer?.prompt || "").trim(),
      dataUrl: String(layer?.dataUrl || ""), imageUrl: String(layer?.imageUrl || ""), imageSrc: String(layer?.imageSrc || ""), storagePath: String(layer?.storagePath || ""), width: Math.max(0, Math.round(Number(layer?.width) || 0)), height: Math.max(0, Math.round(Number(layer?.height) || 0)),
      cutoutVersion: Math.max(0, Math.round(Number(layer?.cutoutVersion) || 0)),
      motionPreset: SIMULATOR_MOTION_PRESETS.has(layer?.motionPreset) ? layer.motionPreset : "static",
      driver,
      anchor: {
        x: Math.max(.05, Math.min(.95, Number(layer?.anchor?.x ?? layer?.anchorX ?? .5))),
        y: Math.max(.08, Math.min(.92, Number(layer?.anchor?.y ?? layer?.anchorY ?? .55)))
      },
      depth: Math.max(1, Math.min(20, Math.round(Number(layer?.depth ?? index + 2)))),
      scale: Math.max(.08, Math.min(.75, Number(layer?.scale ?? .26))),
      visible: layer?.visible !== false
    };
  });
  if (isEcosystemEnergy) {
    const inferTrophicLevel = (layer) => {
      if (Number.isFinite(layer.trophicLevel)) return layer.trophicLevel;
      const descriptor = `${layer.id} ${layer.label} ${layer.role}`.toLowerCase();
      if (/sun|sol|energy-source/.test(descriptor)) return 0;
      if (/grass|pasto|plant|planta|producer|productor|primary$/.test(descriptor)) return 1;
      if (/grasshopper|saltamontes|primary-consumer/.test(descriptor)) return 2;
      if (/frog|rana|secondary-consumer/.test(descriptor)) return 3;
      if (/snake|serpiente|tertiary-consumer/.test(descriptor)) return 4;
      if (/hawk|halc[oó]n|apex-predator/.test(descriptor)) return 5;
      return null;
    };
    const personalizedByLevel = new Map();
    layers.forEach((layer) => {
      const trophicLevel = inferTrophicLevel(layer);
      if (trophicLevel != null && !personalizedByLevel.has(trophicLevel)) personalizedByLevel.set(trophicLevel, { ...layer, trophicLevel });
    });
    layers = defaultVisuals.layers.map((fallback) => {
      const candidate = personalizedByLevel.get(fallback.trophicLevel);
      const personalized = /ecosystem-energy-producer\.webp(?:$|[?#])/i.test(String(candidate?.imageSrc || "")) ? null : candidate;
      return {
        prompt: "",
        dataUrl: "", imageUrl: "", storagePath: "", width: 1254, height: 1254, cutoutVersion: 6,
        visible: true,
        ...fallback,
        ...(personalized || {}),
        id: personalized?.id || fallback.id,
        label: fallback.label,
        role: fallback.role,
        trophicLevel: fallback.trophicLevel,
        imageSrc: personalized?.dataUrl || personalized?.imageUrl || personalized?.imageSrc ? personalized.imageSrc : fallback.imageSrc,
        anchor: fallback.anchor,
        scale: personalized?.scale || fallback.scale,
        depth: personalized?.depth || fallback.depth,
        motionPreset: personalized?.motionPreset || fallback.motionPreset,
        driver: personalized?.driver || fallback.driver
      };
    });
  }
  const sourceBackgroundIsClean = !isCodeDrawnNumberLine
    || /la recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta/i.test(String(source.background?.prompt || ""));
  const sourceUsesDefaultBackground = Boolean(defaultVisuals?.background)
    && String(source.background?.imageSrc || "") === String(defaultVisuals.background);
  const sourceHasBackground = sourceBackgroundIsClean
    && !(customScenarioRequested && sourceUsesDefaultBackground)
    && (!isEcosystemEnergy || customScenarioRequested)
    && Boolean(source.background?.dataUrl || source.background?.imageUrl || source.background?.imageSrc);
  // La selección personalizada se conserva en sus prompts para poder regenerarla,
  // pero nunca deja el preview vacío si el proveedor de imágenes no responde.
  const defaultBackgroundApplied = Boolean(defaultVisuals?.background && !sourceHasBackground && !customScenarioRequested);
  const hasBackground = sourceHasBackground || defaultBackgroundApplied;
  const hasPrimary = layers.some((layer, index) => layer.visible && (layer.dataUrl || layer.imageUrl || layer.imageSrc) && (layer.trophicLevel === 1 || layer.role === "primary" || layer.role === "producer" || index === 0));
  return {
    version: SIMULATOR_VISUAL_SCENE_VERSION,
    selectionKey: String(source.selectionKey || ""),
    status: hasBackground && (hasPrimary || isCodeDrawnNumberLine) ? "ready" : hasBackground || layers.some((layer) => layer.dataUrl || layer.imageUrl || layer.imageSrc) ? "partial" : "fallback",
    background: {
      prompt: sourceHasBackground ? String(source.background?.prompt || "").trim() : isCodeDrawnNumberLine ? NUMBER_LINE_BACKGROUND_PROMPT : isEcosystemEnergy ? "Pradera abierta, clara y de bajo contraste para observar la cadena alimentaria." : String(source.background?.prompt || "").trim(), alt: String(sourceHasBackground ? source.background?.alt || "" : isEcosystemEnergy ? "Pradera abierta y despejada" : source.background?.alt || (isCodeDrawnNumberLine ? "Observatorio científico nocturno" : `Escenario de ${activity?.topic || "simulación científica"}`)).trim(),
      dataUrl: sourceHasBackground ? String(source.background?.dataUrl || "") : "", imageUrl: sourceHasBackground ? String(source.background?.imageUrl || "") : "", imageSrc: sourceHasBackground ? String(source.background?.imageSrc || "") : String(defaultBackgroundApplied ? defaultVisuals.background : ""), storagePath: sourceHasBackground ? String(source.background?.storagePath || "") : "", width: Math.max(0, Math.round(sourceHasBackground ? Number(source.background?.width) || 0 : defaultBackgroundApplied ? 1600 : 0)), height: Math.max(0, Math.round(sourceHasBackground ? Number(source.background?.height) || 0 : defaultBackgroundApplied ? 900 : 0))
    },
    layers,
    generationWarnings: (Array.isArray(source.generationWarnings) ? source.generationWarnings : [])
      .map(String)
      .filter((warning) => !/gemini_payload_too_large/i.test(warning))
      .filter((warning) => !isCodeDrawnNumberLine || /^(?:Fondo:|Gemini no está disponible|No fue posible planificar la escena)/i.test(warning))
      .slice(0, 12)
  };
}

const ADOLESCENT_CONTENT_DIRECTION = [
  "Público objetivo: estudiantes adolescentes de secundaria, aproximadamente de 13 a 17 años.",
  "Usa un tono juvenil, inteligente y respetuoso; nunca infantilices al estudiante.",
  "Presenta casos científicos verosímiles y cercanos, con datos, unidades y evidencia observable explicados en lenguaje directo.",
  "Una persona de 13 años debe comprender por sí sola qué sucede, qué significan los datos y qué debe averiguar.",
  "No introduzcas términos técnicos, símbolos o variables sin explicar primero su significado dentro del caso.",
  "Las preguntas deben exigir interpretar, comparar, predecir, calcular o justificar; evita respuestas obvias y distractores absurdos.",
  "Relaciona los conceptos con tecnología, ambiente, salud no clínica, ingeniería, deporte, energía o situaciones contemporáneas.",
  "No uses bebés, mascotas parlantes, juguetes, diminutivos, caritas tiernas, premios preescolares ni expresiones como amiguito, súper fácil o magia.",
  "La dificultad debe corresponder al grado escolar y ofrecer retroalimentación que explique el razonamiento científico."
].join(" ");

const ADOLESCENT_IMAGE_DIRECTION = [
  "Audience is secondary-school teenagers ages 13–17.",
  "If people appear, depict clearly adolescent students with natural body proportions, age-appropriate clothing and confident expressions.",
  "Use sophisticated game key art or young-adult graphic-novel composition with credible scientific equipment.",
  "No small children, toddlers, babies, chibi anatomy, oversized baby faces, toy-like mascots, plush creatures or preschool classroom aesthetics."
].join(" ");

const TOPICS = {
  physics: ["Aceleración", "Arquímedes", "Caída libre", "Calor", "Cambios de estado de la materia", "Cantidad de movimiento", "Carga eléctrica", "Circuitos en paralelo", "Circuitos en serie", "Conducción", "Conservación de energía", "Convección", "Corriente", "Densidad", "Dilatación térmica", "Distancia y desplazamiento", "Elasticidad y ley de Hooke", "Electromagnetismo", "Energía cinética", "Energía potencial", "Equilibrio de fuerzas", "Estados de la materia", "Flotación", "Frecuencia", "Fuerza", "Fuerza centrípeta", "Gráficas de posición, velocidad y tiempo", "Gravedad", "Impulso", "Ley de Ohm", "Leyes de Newton", "Longitud de onda", "Luz", "Magnetismo", "Masa y peso", "Movimiento circular", "Movimiento rectilíneo uniforme (MRU)", "Movimiento rectilíneo uniformemente acelerado (MRUA)", "Ondas", "Pascal", "¿Por qué cambia el estado de la materia?", "Posición y sistema de referencia", "Potencia", "Presión", "Proyectiles", "Radiación", "Rapidez", "Reflexión", "Refracción", "Resistencia eléctrica", "Resistencia y fricción", "Sonido", "Temperatura", "Trabajo", "Velocidad", "Voltaje"],
  chemistry: ["Materia", "Átomo", "Protones", "Neutrones", "Electrones", "Número atómico", "Isótopos", "Iones", "Tabla periódica", "Metales", "No metales", "Gases nobles", "Moléculas", "Compuestos", "Enlace iónico", "Enlace covalente", "Enlace metálico", "Fórmulas químicas", "Agua H₂O", "Dióxido de carbono CO₂", "Cloruro de sodio NaCl", "Ácidos", "Bases", "pH", "Neutralización", "Reacción química", "Ecuaciones químicas", "Balanceo", "Conservación de la masa", "Mol", "Masa molar", "Disoluciones", "Mezclas y sustancias puras", "Concentración", "Solubilidad", "Oxidación", "Reducción", "Catalizadores", "Temperatura de reacción", "Estados de la materia", "Química orgánica"],
  biology: ["Seres vivos", "Célula", "Teoría celular", "Procariotas", "Eucariotas", "Membrana celular", "Núcleo", "Mitocondria", "Cloroplasto", "Ribosomas", "ADN", "ARN", "Genes", "Cromosomas", "Mitosis", "Meiosis", "Herencia", "Mutaciones", "Evolución", "Selección natural", "Taxonomía", "Bacterias", "Virus", "Hongos", "Plantas", "Animales", "Fotosíntesis", "Respiración celular", "Nutrición", "Sistema digestivo", "Sistema respiratorio", "Sistema circulatorio", "Sistema nervioso", "Sistema endocrino", "Sistema inmunitario", "Homeostasis", "Ecosistemas", "Transformación de la energía en los ecosistemas", "Cadenas alimentarias", "Ciclos biogeoquímicos", "Biodiversidad"],
  math: ["Adición y sustracción", "Números enteros", "Operaciones con enteros", "Jerarquía de operaciones", "La recta numérica", "Fracciones", "Operaciones con fracciones", "Decimales", "Porcentajes", "Razones", "Proporciones", "Regla de tres", "Potencias", "Leyes de exponentes", "Raíces cuadradas", "Notación científica", "Lenguaje algebraico", "Términos semejantes", "Polinomios", "Productos notables", "Factorización", "Ecuaciones de primer grado", "Sistemas de ecuaciones", "Inecuaciones", "Plano cartesiano", "Patrones y sucesiones", "Funciones", "Función lineal", "Pendiente", "Proporcionalidad directa e inversa", "Ángulos", "Triángulos", "Teorema de Pitágoras", "Congruencia y semejanza", "Perímetro", "Área", "Circunferencia y círculo", "Volumen", "Transformaciones geométricas", "Estadística descriptiva", "Gráficas y tablas", "Probabilidad"]
};
const CURRICULUM_PROFILES = createCurriculumRegistry(TOPICS);
const curriculumProfileFor = (subject, topic) => resolveCurriculumProfile(CURRICULUM_PROFILES, subject, topic);

const SUBJECT_LABELS = { physics: "Física", chemistry: "Química", biology: "Biología", math: "Matemáticas" };
const SUBJECT_DEFAULT_GRADES = {
  biology: "1º secundaria",
  physics: "2º secundaria",
  chemistry: "3º secundaria",
  math: "1º secundaria"
};
const SIMULATION_LABELS = {
  atomic: "Estructura atómica",
  periodic: "Tabla periódica interactiva",
  "periodic-properties": "Propiedades periódicas",
  "matter-phase": "Materia y cambios de fase",
  "molecule-builder": "Constructor molecular",
  bonding: "Laboratorio de enlaces",
  "acid-base": "Ácidos, bases y pH",
  "reaction-stoichiometry": "Reacciones y estequiometría",
  redox: "Oxidación y reducción",
  "reaction-kinetics": "Cinética química",
  solution: "Disoluciones y solubilidad",
  "cell-structure": "Estructura celular",
  "membrane-transport": "Transporte de membrana",
  "cell-metabolism": "Metabolismo celular",
  "genetics-expression": "Genética y expresión",
  "cell-division": "División celular y herencia",
  "population-evolution": "Evolución poblacional",
  "organism-classification": "Organismos y clasificación",
  "microorganism-growth": "Microorganismos",
  "human-physiology": "Fisiología humana",
  "ecosystem-dynamics": "Dinámica ecológica",
  friction: "Fricción y resistencia",
  projectile: "Movimiento de proyectiles",
  gravity: "Caída libre",
  thermal: "Transferencia de calor",
  circuit: "Circuito interactivo",
  particles: "Laboratorio de partículas",
  ecosystem: "Ecosistema dinámico",
  energy: "Transformación de energía",
  fluid: "Fluidos e hidráulica",
  wave: "Ondas en movimiento",
  optics: "Laboratorio de luz",
  cell: "Explorador celular",
  math: "Laboratorio matemático"
  ,"addition-subtraction": "Adición y sustracción"
  ,"number-line": "Recta numérica interactiva"
  ,"quadratic-factorization-rectangle": "Factorización con rectángulos"
};

const SIMULATION_ICONS = {
  atomic: "fa-atom",
  periodic: "fa-table-cells",
  "periodic-properties": "fa-table-cells",
  "matter-phase": "fa-cubes-stacked",
  "molecule-builder": "fa-draw-polygon",
  bonding: "fa-link",
  "acid-base": "fa-flask-vial",
  "reaction-stoichiometry": "fa-scale-balanced",
  redox: "fa-arrow-right-arrow-left",
  "reaction-kinetics": "fa-gauge-high",
  solution: "fa-glass-water",
  "cell-structure": "fa-microscope",
  "membrane-transport": "fa-arrows-left-right-to-line",
  "cell-metabolism": "fa-battery-full",
  "genetics-expression": "fa-dna",
  "cell-division": "fa-code-branch",
  "population-evolution": "fa-chart-line",
  "organism-classification": "fa-sitemap",
  "microorganism-growth": "fa-bacterium",
  "human-physiology": "fa-heart-pulse",
  "ecosystem-dynamics": "fa-seedling",
  friction: "fa-truck-fast",
  projectile: "fa-meteor",
  gravity: "fa-arrow-down-long",
  thermal: "fa-temperature-half",
  circuit: "fa-bolt",
  particles: "fa-atom",
  ecosystem: "fa-leaf",
  energy: "fa-battery-three-quarters",
  fluid: "fa-droplet",
  wave: "fa-water",
  optics: "fa-sun",
  cell: "fa-microscope",
  math: "fa-square-root-variable"
  ,"number-line": "fa-arrow-right-arrow-left"
  ,"quadratic-factorization-rectangle": "fa-table-cells-large"
};

const SCENARIO_ARCHETYPES = {
  physics: [
    ["laboratory", "#c8f4ee", "#5bb8a9", "#ffc768"],
    ["city", "#d8e7f4", "#617c9b", "#ff8068"],
    ["space", "#182541", "#46568a", "#c4f05c"],
    ["desert", "#ffe6ad", "#d8a857", "#ff8068"],
    ["arctic", "#dff7ff", "#86c8df", "#8e85ff"],
    ["ocean", "#bcecf4", "#3aa5b8", "#ffc768"],
    ["volcanic", "#f2c0a7", "#744449", "#ffcf5c"],
    ["forest", "#d8f1c0", "#5d9c72", "#ffcf5c"]
  ],
  chemistry: [
    ["microscopic", "#e9dcff", "#7766b8", "#48d8c8"],
    ["laboratory", "#d7f6ef", "#4ba997", "#ff8068"],
    ["space", "#211d3d", "#685c9e", "#c4f05c"],
    ["volcanic", "#ffd3bc", "#9c5148", "#ffc768"],
    ["ocean", "#c8f4fa", "#3f99aa", "#8e85ff"],
    ["arctic", "#e8fbff", "#8dcbd8", "#ff8068"],
    ["desert", "#ffedc9", "#c79855", "#8e85ff"],
    ["city", "#dce7ec", "#667c86", "#48d8c8"]
  ],
  biology: [
    ["forest", "#d8f1c0", "#5d9c72", "#ffc768"],
    ["microscopic", "#f4dbef", "#ad6e9d", "#48d8c8"],
    ["ocean", "#c7f1f0", "#4a9e9d", "#c4f05c"],
    ["arctic", "#e4f8ff", "#88bfd2", "#8e85ff"],
    ["desert", "#ffedc5", "#b88b54", "#ff8068"],
    ["city", "#dce9dc", "#65836a", "#ffc768"],
    ["space", "#1d3140", "#496a79", "#c4f05c"],
    ["laboratory", "#def5e9", "#589d79", "#8e85ff"]
  ],
  math: [
    ["laboratory", "#e9f5ff", "#4d78a8", "#ffc857"],
    ["city", "#e7edf8", "#516a91", "#ff7b83"],
    ["space", "#111b3e", "#394d94", "#58e1d4"],
    ["microscopic", "#f0e9ff", "#745fb1", "#ffb65c"],
    ["desert", "#fff0ca", "#bb8950", "#5bd8c7"],
    ["ocean", "#d8f4f7", "#3e93aa", "#ffc857"],
    ["arctic", "#edfaff", "#7ebacf", "#8f82ff"],
    ["forest", "#e1f2db", "#5f9470", "#ffbe63"]
  ]
};

function buildScenarioCatalog(subject) {
  return (TOPICS[subject] || []).map((topic, index) => {
    const [biome, sky, ground, accent] = SCENARIO_ARCHETYPES[subject][index % SCENARIO_ARCHETYPES[subject].length];
    return {
      id: `${subject}-${index + 1}`,
      label: `${topic} · ${["Estación", "Mundo", "Zona", "Laboratorio"][index % 4]} ${String(index + 1).padStart(2, "0")}`,
      topic,
      biome,
      sky,
      ground,
      accent,
      motif: `${topic.toLowerCase()}-${biome}`
    };
  });
}

const SCENARIOS = {
  physics: buildScenarioCatalog("physics"),
  chemistry: buildScenarioCatalog("chemistry"),
  biology: buildScenarioCatalog("biology"),
  math: buildScenarioCatalog("math")
};

const SIMULATOR_OBJECT_CHOICES = Object.freeze({
  friction: ["Automóvil experimental", "Tren de medición", "Robot móvil"],
  projectile: ["Esfera de lanzamiento", "Cápsula de prueba", "Balón deportivo"],
  gravity: ["Esfera metálica", "Cápsula de caída", "Bloque de prueba"],
  thermal: ["Bloque térmico", "Recipiente de laboratorio", "Placa metálica"],
  circuit: ["Circuito modular", "Lámpara experimental", "Motor eléctrico"],
  particles: ["Conjunto de partículas", "Moléculas del material", "Recipiente molecular"],
  ecosystem: ["Planta productora realista", "Árbol productor realista", "Fitoplancton productor realista"],
  energy: ["Vagón de energía", "Masa suspendida", "Carro de laboratorio"],
  fluid: ["Pistón hidráulico", "Objeto flotante", "Columna de fluido"],
  wave: ["Emisor de ondas", "Cuerda experimental", "Altavoz científico"],
  optics: ["Haz de luz", "Prisma óptico", "Lente experimental"],
  atomic: ["Átomo interactivo", "Núcleo atómico", "Modelo de electrones"],
  cell: ["Célula interactiva", "Organelo celular", "Membrana celular"],
  math: ["Punto matemático", "Figura geométrica", "Balanza algebraica"],
  "addition-subtraction": ["Ficha positiva y negativa", "Marcador de operación", "Contador bicolor"],
  "number-line": ["Vector de desplazamiento (dibujado por código)"],
  "quadratic-factorization-rectangle": ["Caja algebraica 2×2 (dibujada por código)"]
});

const SIMULATOR_SCENE_TEMPLATES = Object.freeze({
  physics: ["Laboratorio tecnológico de {topic}", "Pista experimental de {topic}", "Entorno cotidiano controlado de {topic}"],
  chemistry: ["Laboratorio químico de {topic}", "Cámara molecular de {topic}", "Mesa de análisis de {topic}"],
  biology: ["Laboratorio biológico de {topic}", "Microambiente de {topic}", "Ecosistema de observación de {topic}"],
  math: ["Estudio visual de {topic}", "Plano interactivo de {topic}", "Laboratorio geométrico de {topic}"]
});

const SIMULATOR_COMPOSITION_CONTRACTS = Object.freeze({
  friction: {
    scenarios: ["Pista recta de pruebas de {topic}", "Carretera recta controlada de {topic}", "Corredor lineal de laboratorio de {topic}"],
    background: "Vista lateral ortográfica, cámara completamente perpendicular al movimiento. Una carretera o pista única, perfectamente recta, plana y horizontal cruza el encuadre completo de izquierda a derecha; bordes paralelos, sin punto de fuga, curvas, pendientes, cruces, rieles, obstáculos ni plataformas verticales. La superficie de rodamiento ocupa una franja continua alrededor del 80% de la altura y debe quedar libre para el objeto móvil.",
    object: "Vista lateral exacta orientada hacia la derecha, ruedas o base apoyadas en una línea horizontal, sin perspectiva frontal ni tres cuartos.",
    anchor: { x: .16, y: .72 }, motionPreset: "translate-x"
  },
  projectile: { scenarios: ["Campo lateral de lanzamiento de {topic}", "Zona abierta de trayectoria de {topic}", "Plataforma balística segura de {topic}"], background: "Vista lateral ortográfica con plataforma de lanzamiento baja a la izquierda, suelo horizontal y una gran zona de cielo completamente despejada para una trayectoria parabólica de izquierda a derecha; sin techo ni obstáculos.", object: "Vista lateral del proyectil, silueta compacta y dirección hacia la derecha.", anchor: { x: .1, y: .74 }, motionPreset: "projectile" },
  gravity: { scenarios: ["Torre vertical de caída de {topic}", "Cámara de caída libre de {topic}", "Pozo científico de gravedad de {topic}"], background: "Vista frontal ortográfica de una cámara vertical alta, con una trayectoria central despejada y continua desde la parte superior hasta una base horizontal inferior; sin plataformas que bloqueen la caída.", object: "Objeto completo visto de frente o de perfil neutro, centrado para caer verticalmente.", anchor: { x: .5, y: .18 }, motionPreset: "translate-y" },
  thermal: { scenarios: ["Banco térmico de {topic}", "Cámara de transferencia de calor de {topic}", "Mesa calorimétrica de {topic}"], background: "Vista frontal limpia de un banco térmico con una única zona central de contacto para colocar el material; fuente y receptor claramente separados, sin objetos funcionales duplicados.", object: "Muestra térmica aislada, vista frontal, volumen y material físicamente creíbles.", anchor: { x: .5, y: .58 }, motionPreset: "pulse" },
  circuit: { scenarios: ["Banco eléctrico de {topic}", "Panel de circuito de {topic}", "Mesa electrónica de {topic}"], background: "Vista superior o frontal ortográfica de un circuito con una ruta conductora continua y despejada; terminales visibles pero sin componentes principales duplicados.", object: "Componente eléctrico aislado en la misma vista ortográfica del panel.", anchor: { x: .5, y: .55 }, motionPreset: "flow" },
  particles: { scenarios: ["Cámara molecular de {topic}", "Recipiente microscópico de {topic}", "Celda de partículas de {topic}"], background: "Cámara microscópica cerrada, vista frontal plana, con un volumen interior amplio y despejado donde puedan vibrar o desplazarse partículas sin obstáculos.", object: "Partícula o conjunto molecular aislado, científicamente correcto y visto de frente.", anchor: { x: .5, y: .52 }, motionPreset: "vibrate" },
  ecosystem: { scenarios: ["Bosque iluminado para estudiar {topic}", "Pradera para estudiar {topic}", "Ecosistema acuático para estudiar {topic}"], background: "Vista lateral amplia y científicamente verosímil de un solo hábitat natural iluminado por el sol, con vegetación real y una zona central despejada para visualizar el flujo de energía. No incluir animales, criaturas, organismos híbridos o fantásticos, acuarios, terrarios, vitrinas, laboratorios, rayos, partículas de energía, flechas, diagramas ni elementos flotantes; el flujo energético se dibuja por separado en el simulador.", object: "Un único productor primario real, biológicamente reconocible y completo; sin animales, híbridos, anatomía inventada, rayos, flechas, partículas ni adornos.", anchor: { x: .22, y: .68 }, motionPreset: "pulse" },
  energy: { scenarios: ["Pista de energía de {topic}", "Torre de energía potencial de {topic}", "Banco mecánico de {topic}"], background: "Vista lateral ortográfica con una trayectoria mecánica continua y despejada que muestre claramente altura o desplazamiento, sin maquinaria decorativa que bloquee el recorrido.", object: "Objeto mecánico lateral completo, alineado con la trayectoria del fondo.", anchor: { x: .3, y: .65 }, motionPreset: "translate-y" },
  fluid: { scenarios: ["Banco hidráulico de {topic}", "Tanque transparente de {topic}", "Prensa de fluidos de {topic}"], background: "Vista frontal ortográfica de un sistema de fluido continuo, tanque o pistones alineados, con columna vertical despejada para observar presión, nivel o flotación.", object: "Elemento hidráulico u objeto flotante frontal, completo y alineado con el recipiente.", anchor: { x: .5, y: .55 }, motionPreset: "translate-y" },
  wave: { scenarios: ["Canal horizontal de ondas de {topic}", "Cuerda experimental de {topic}", "Túnel acústico de {topic}"], background: "Vista lateral ortográfica con un canal o eje horizontal recto y continuo de izquierda a derecha, completamente despejado para visualizar propagación, amplitud y longitud de onda.", object: "Emisor u onda aislada en vista lateral, alineada con el eje horizontal.", anchor: { x: .2, y: .52 }, motionPreset: "pulse" },
  optics: { scenarios: ["Banco óptico de {topic}", "Cámara oscura de {topic}", "Mesa de refracción de {topic}"], background: "Vista superior o frontal ortográfica de un banco óptico oscuro con eje horizontal despejado para un rayo de luz; sin haces, prismas ni lentes duplicados en el fondo.", object: "Elemento óptico aislado y alineado con el eje del banco.", anchor: { x: .5, y: .52 }, motionPreset: "rotate" },
  atomic: { scenarios: ["Cámara atómica de {topic}", "Espacio microscópico de {topic}", "Laboratorio subatómico de {topic}"], background: "Campo microscópico frontal, radial y despejado, con centro visual libre para un átomo y espacio uniforme alrededor para órbitas.", object: "Modelo atómico frontal, radial y científicamente legible.", anchor: { x: .5, y: .5 }, motionPreset: "orbit" },
  cell: { scenarios: ["Microambiente celular de {topic}", "Cámara de microscopía de {topic}", "Medio biológico de {topic}"], background: "Vista microscópica frontal con un medio continuo y una zona central limpia para una célula; sin células u organelos principales duplicados.", object: "Célula u organelo aislado en vista microscópica frontal.", anchor: { x: .5, y: .52 }, motionPreset: "pulse" },
  math: { scenarios: ["Plano visual de {topic}", "Estudio geométrico de {topic}", "Tablero matemático de {topic}"], background: "Plano ortográfico limpio con retícula geométrica tenue y área central despejada; sin números, letras, ecuaciones ni respuestas incorporadas.", object: "Elemento matemático aislado, frontal, geométricamente preciso y sin texto.", anchor: { x: .5, y: .52 }, motionPreset: "scale" },
  "addition-subtraction": { scenarios: ["Tablero matemático exacto"], background: "Tablero vectorial exacto con recta numérica y fichas enteras; no requiere imágenes.", object: "Fichas positivas y negativas dibujadas por el runtime.", anchor: { x: .5, y: .52 }, motionPreset: "static" },
  "quadratic-factorization-rectangle": { scenarios: ["Tablero algebraico exacto"], background: "Tablero técnico-minimalista dibujado por código; no requiere imágenes.", object: "Caja 2×2 y fichas algebraicas con signo dibujadas por el runtime.", anchor: { x: .5, y: .52 }, motionPreset: "static" },
  "number-line": { scenarios: ["Fondo de estudio de {topic}", "Aula tecnológica de {topic}", "Laboratorio visual de {topic}"], background: "Vista frontal ortográfica de un entorno matemático limpio con una franja central amplia y despejada. No incluir rectas, ejes, marcas, números, texto, flechas, vectores, marcadores ni diagramas: la recta numérica completa y el vector de desplazamiento se dibujan con geometría exacta en el simulador.", object: "Vector matemático exacto dibujado por el runtime; no requiere una imagen generada.", anchor: { x: .5, y: .55 }, motionPreset: "translate-x" }
});

function simulatorCompositionContract(modelKey, subject = "physics") {
  return SIMULATOR_COMPOSITION_CONTRACTS[modelKey]
    || SIMULATOR_COMPOSITION_CONTRACTS[subject === "biology" ? "cell" : subject === "chemistry" ? "particles" : subject === "math" ? "math" : "friction"];
}

function simulatorVisualCatalog(subject, topic) {
  const template = resolveTopicTemplate(subject, topic);
  const key = template.type === "number-line" ? "number-line" : template.type;
  const composition = simulatorCompositionContract(key, subject);
  const sceneLabels = composition.scenarios || SIMULATOR_SCENE_TEMPLATES[subject] || SIMULATOR_SCENE_TEMPLATES.physics;
  const objectLabels = SIMULATOR_OBJECT_CHOICES[key] || SIMULATOR_OBJECT_CHOICES[subject === "biology" ? "cell" : subject === "chemistry" ? "particles" : subject === "math" ? "math" : "friction"];
  const cleanTopic = String(topic || "el fenómeno científico").trim();
  return {
    modelKey: key,
    scenarios: sceneLabels.map((templateLabel, index) => {
      const label = templateLabel.replace("{topic}", cleanTopic);
      return { id: `${subject}-${key}-scene-${index + 1}`, label, prompt: `${label}. ${composition.background} Científicamente correcto, sin personas, texto, controles ni objeto principal duplicado.` };
    }),
    objects: objectLabels.map((label, index) => ({
      id: `${subject}-${key}-object-${index + 1}`,
      label: `${label} · ${cleanTopic}`,
      prompt: `${label} científicamente apropiado para representar ${cleanTopic}. ${composition.object}`
    }))
  };
}

const CUSTOM_SIMULATOR_VISUAL_VALUE = "__custom_simulator_visual__";
const SIMULATOR_BACKGROUND_PROMPT_VERSION = "background-content-lock-v6";

function simulatorScenarioBackgroundContract(modelKey, composition, customScenario = "") {
  return modelKey === "number-line" && String(customScenario || "").trim()
    ? NUMBER_LINE_CUSTOM_SCENARIO_CONTRACT
    : composition.background;
}

function isLinearTranslationScene(activity, layer) {
  return simulatorVisualCatalog(activity?.subject || "physics", activity?.topic || "").modelKey === "friction"
    && (!layer || layer.role === "primary" || layer.motionPreset === "translate-x");
}

function normalizeSimulatorVisualSelection(activity, selection = activity?.simulatorVisualSelection) {
  const catalog = simulatorVisualCatalog(activity?.subject || "physics", activity?.topic || "");
  const composition = simulatorCompositionContract(catalog.modelKey, activity?.subject || "physics");
  const customScenario = String(selection?.customScenario || (selection?.scenarioId === CUSTOM_SIMULATOR_VISUAL_VALUE ? selection?.scenarioLabel : "") || "").trim();
  const customObject = String(selection?.customObject || (selection?.objectId === CUSTOM_SIMULATOR_VISUAL_VALUE ? selection?.objectLabel : "") || "").trim();
  const scenario = selection?.scenarioId === CUSTOM_SIMULATOR_VISUAL_VALUE && customScenario
    ? { id: CUSTOM_SIMULATOR_VISUAL_VALUE, label: customScenario, prompt: `Escenario solicitado por el docente: ${customScenario}. ${simulatorScenarioBackgroundContract(catalog.modelKey, composition, customScenario)} Científicamente correcto, sin personas, texto, controles ni objeto principal duplicado.` }
    : catalog.scenarios.find((item) => item.id === selection?.scenarioId) || catalog.scenarios[0];
  const object = selection?.objectId === CUSTOM_SIMULATOR_VISUAL_VALUE && customObject
    ? { id: CUSTOM_SIMULATOR_VISUAL_VALUE, label: customObject, prompt: `Objeto solicitado por el docente: ${customObject}. Debe ser científicamente apropiado para ${activity?.topic || "el fenómeno"}. ${composition.object}` }
    : catalog.objects.find((item) => item.id === selection?.objectId) || catalog.objects[0];
  return {
    scenarioId: scenario.id, scenarioLabel: scenario.label, scenarioPrompt: scenario.prompt,
    objectId: object.id, objectLabel: object.label, objectPrompt: object.prompt,
    customScenario: scenario.id === CUSTOM_SIMULATOR_VISUAL_VALUE ? customScenario : "",
    customObject: object.id === CUSTOM_SIMULATOR_VISUAL_VALUE ? customObject : "",
    modelKey: catalog.modelKey
  };
}

function simulatorVisualSelectionKey(activity, selection = activity?.simulatorVisualSelection) {
  const normalized = normalizeSimulatorVisualSelection(activity, selection);
  return JSON.stringify([
    SIMULATOR_BACKGROUND_PROMPT_VERSION,
    activity?.subject || "physics",
    activity?.topic || "",
    activity?.visualStyle || "tech-minimal",
    normalized.scenarioId,
    normalized.customScenario,
    normalized.objectId,
    normalized.customObject,
    normalized.modelKey
  ]);
}
const CUSTOM_TOPIC_VALUE = "__custom_topic__";

const CONTROL_PRESETS = {
  "addition-subtraction": [
    { id: "operandA", label: "Primer número", min: -20, max: 20, step: 1, value: 5, unit: "", effect: "Define el punto de partida en la recta numérica." },
    { id: "operator", label: "Operación", min: -1, max: 1, step: 2, value: 1, unit: "", controlType: "segmented", options: [{ value: 1, label: "+" }, { value: -1, label: "−" }], effect: "Elige si el segundo número se suma o se resta." },
    { id: "operandB", label: "Segundo número", min: -20, max: 20, step: 1, value: 3, unit: "", effect: "Define la cantidad que se suma o se resta; puede ser negativa." }
  ],
  "quadratic-factorization-rectangle": [
    { id: "factorMode", label: "Modo", min: 0, max: 1, step: 1, value: 0, unit: "", controlType: "segmented", options: [{ value: 0, label: "Explorar" }, { value: 1, label: "Reto" }], effect: "Alterna entre exploración y reto." },
    { id: "commonFactor", label: "Factor común", min: 1, max: 6, step: 1, value: 1, unit: "", effect: "Multiplica el trinomio completo." },
    { id: "factorP", label: "Coeficiente p", min: 1, max: 4, step: 1, value: 1, unit: "", effect: "Define px en el primer factor." },
    { id: "factorQ", label: "Constante q", min: -8, max: 8, step: 1, value: 2, unit: "", effect: "Define q en el primer factor." },
    { id: "factorR", label: "Coeficiente r", min: 1, max: 4, step: 1, value: 1, unit: "", effect: "Define rx en el segundo factor." },
    { id: "factorS", label: "Constante s", min: -8, max: 8, step: 1, value: 3, unit: "", effect: "Define s en el segundo factor." }
  ],
  atomic: [
    { id: "protons", label: "Protones", min: 1, max: 20, step: 1, value: 6, unit: "", effect: "Determinan el elemento y su número atómico." },
    { id: "neutrons", label: "Neutrones", min: 0, max: 30, step: 1, value: 6, unit: "", effect: "Cambian el isótopo y el número de masa." },
    { id: "electrons", label: "Electrones", min: 0, max: 20, step: 1, value: 6, unit: "", effect: "Determinan la carga neta del átomo." }
  ],
  friction: [
    { id: "force", label: "Fuerza aplicada", min: 10, max: 100, step: 5, value: 55, unit: "N", effect: "Impulsa el objeto." },
    { id: "friction", label: "Resistencia", min: 5, max: 90, step: 5, value: 45, unit: "N", effect: "Se opone al movimiento." },
    { id: "mass", label: "Masa", min: 2, max: 25, step: 1, value: 10, unit: "kg", effect: "Modifica la aceleración." }
  ],
  projectile: [
    { id: "angle", label: "Ángulo", min: 10, max: 80, step: 1, value: 45, unit: "°", effect: "Cambia la trayectoria." },
    { id: "power", label: "Velocidad inicial", min: 20, max: 100, step: 2, value: 62, unit: "m/s", effect: "Cambia el alcance." },
    { id: "gravity", label: "Gravedad", min: 2, max: 20, step: .2, value: 9.8, unit: "m/s²", effect: "Atrae el proyectil." }
  ],
  gravity: [
    { id: "height", label: "Altura inicial", min: 1, max: 100, step: 1, value: 20, unit: "m", effect: "Aumenta la distancia y el tiempo de caída." },
    { id: "gravity", label: "Gravedad", min: 1.6, max: 24.8, step: .1, value: 9.8, unit: "m/s²", effect: "Cambia la aceleración vertical." },
    { id: "mass", label: "Masa del objeto", min: .1, max: 20, step: .1, value: 1, unit: "kg", effect: "Cambia el objeto, pero no su tiempo de caída en el vacío." }
  ],
  circuit: [
    { id: "voltage", label: "Voltaje", min: 1, max: 24, step: 1, value: 9, unit: "V", effect: "Impulsa las cargas." },
    { id: "resistance", label: "Resistencia", min: 1, max: 30, step: 1, value: 10, unit: "Ω", effect: "Limita la corriente." }
  ],
  particles: [
    { id: "temperature", label: "Temperatura", min: 0, max: 100, step: 1, value: 45, unit: "°C", effect: "Cambia la agitación." },
    { id: "particleCount", label: "Cantidad", min: 10, max: 45, step: 1, value: 24, unit: "", effect: "Cambia la concentración." }
  ],
  thermal: [
    { id: "sourceTemperature", label: "Temperatura del agua", min: 20, max: 95, step: 1, value: 65, unit: "°C", effect: "Define la temperatura de la fuente térmica." },
    { id: "objectMass", label: "Masa del material", min: 25, max: 1000, step: 25, value: 150, unit: "g", effect: "Una masa mayor tarda más en calentarse." },
    { id: "initialTemperature", label: "Temperatura inicial", min: 0, max: 40, step: 1, value: 20, unit: "°C", effect: "Define desde qué temperatura comienza el material." },
    { id: "thermalConductance", label: "Contacto térmico", min: 1, max: 30, step: 1, value: 12, unit: "W/K", effect: "Controla la rapidez de transferencia de calor." }
  ],
  ecosystem: [
    { id: "sunlight", label: "Luz", min: 0, max: 100, step: 5, value: 60, unit: "%", effect: "Aporta energía." },
    { id: "water", label: "Agua", min: 0, max: 100, step: 5, value: 55, unit: "%", effect: "Limita la población." }
  ],
  energy: [
    { id: "mass", label: "Masa", min: 1, max: 30, step: 1, value: 8, unit: "kg", effect: "Cambia la energía." },
    { id: "height", label: "Altura", min: 1, max: 12, step: .5, value: 7, unit: "m", effect: "Cambia la energía potencial." },
    { id: "gravity", label: "Gravedad", min: 2, max: 20, step: .2, value: 9.8, unit: "m/s²", effect: "Atrae el objeto." }
  ],
  fluid: [
    { id: "force", label: "Fuerza", min: 5, max: 100, step: 5, value: 35, unit: "N", effect: "Presiona el fluido." },
    { id: "area", label: "Área del pistón", min: 1, max: 20, step: 1, value: 5, unit: "m²", effect: "Modifica la presión." },
    { id: "density", label: "Densidad", min: 200, max: 1600, step: 50, value: 700, unit: "kg/m³", effect: "Determina flotación." }
  ],
  wave: [
    { id: "frequency", label: "Frecuencia", min: .5, max: 8, step: .5, value: 3, unit: "Hz", effect: "Cambia los ciclos." },
    { id: "amplitude", label: "Amplitud", min: 10, max: 100, step: 5, value: 50, unit: "cm", effect: "Cambia la energía." },
    { id: "wavelength", label: "Longitud", min: 60, max: 220, step: 10, value: 120, unit: "cm", effect: "Separa las crestas." }
  ],
  optics: [
    { id: "angle", label: "Ángulo de incidencia", min: 5, max: 75, step: 1, value: 35, unit: "°", effect: "Cambia el rayo." },
    { id: "refractiveIndex", label: "Índice del medio", min: 1, max: 2.5, step: .05, value: 1.5, unit: "n", effect: "Desvía la luz." }
  ],
  cell: [
    { id: "nutrients", label: "Nutrientes", min: 0, max: 100, step: 5, value: 60, unit: "%", effect: "Aporta materia." },
    { id: "oxygen", label: "Oxígeno", min: 0, max: 100, step: 5, value: 65, unit: "%", effect: "Favorece ATP." }
  ],
  math: [
    { id: "x", label: "Valor de x", min: -20, max: 20, step: 1, value: 4, unit: "", effect: "Variable independiente." },
    { id: "coefficient", label: "Coeficiente", min: -10, max: 10, step: 1, value: 2, unit: "", effect: "Modifica la pendiente o escala." },
    { id: "constant", label: "Constante", min: -20, max: 20, step: 1, value: 3, unit: "", effect: "Desplaza el resultado." }
  ],
  "number-line": [
    { id: "startNumerator", label: "Valor inicial", min: -20, max: 20, step: 1, value: -6, unit: "", effect: "Ubica el punto inicial exactamente en ese valor." },
    { id: "movementNumerator", label: "Desplazamiento", min: -20, max: 20, step: 1, value: 10, unit: "", effect: "Desplaza el punto sobre la recta." },
    { id: "comparisonNumerator", label: "Punto de comparación", min: -20, max: 20, step: 1, value: 8, unit: "", effect: "Compara el resultado con otro racional." },
    { id: "denominator", label: "Subdivisiones por unidad", min: 1, max: 10, step: 1, value: 2, unit: "", effect: "Divide visualmente cada unidad sin modificar los valores." }
  ]
};
const HYDRAULIC_CONTROL_PRESET = Object.freeze([
  { id: "inputForce", label: "Fuerza en el pedal", min: 100, max: 1000, step: 25, value: 350, unit: "N", effect: "Genera presión en el pistón pequeño." },
  { id: "inputArea", label: "Área del pistón pequeño", min: .001, max: .01, step: .001, value: .005, unit: "m²", effect: "Determina la presión transmitida al fluido." },
  { id: "outputArea", label: "Área del pistón grande", min: .01, max: .1, step: .005, value: .05, unit: "m²", effect: "Multiplica la fuerza disponible para elevar la carga." },
  { id: "loadMass", label: "Masa de la carga", min: 50, max: 1000, step: 25, value: 300, unit: "kg", effect: "Determina el peso que debe vencer el elevador." }
]);

const STRUCTURED_ASSESSMENT_TYPES = new Set([
  "equation-build", "fill-blank", "exponent-placement", "chemical-balance",
  "numeric-answer", "graph-plot", "sequence-order", "timeline-order", "number-line-placement"
]);

const STRUCTURED_MECHANICS = {
  "equation-build": "equation-lab",
  "fill-blank": "formula-console",
  "exponent-placement": "exponent-dock",
  "chemical-balance": "molecule-balance",
  "numeric-answer": "numeric-console",
  "graph-plot": "graph-probe",
  "sequence-order": "process-stations",
  "timeline-order": "timeline-builder"
  ,"number-line-placement": "number-line-placement"
};

const ACTIVITY_QUESTION_TYPES = [
  "multiple", "image-multiple", "matching", "keyword", "equation-build", "fill-blank",
  "exponent-placement", "chemical-balance", "numeric-answer", "graph-plot", "sequence-order", "timeline-order", "number-line-placement"
];

function shuffledQuestionTypes(activity, cycleIndex = 0) {
  const types = questionTypesForActivity(activity, ACTIVITY_QUESTION_TYPES);
  let seed = assessmentHash([
    activity.subject,
    normalizeAnswer(activity.topic),
    activity.grade,
    activity.difficulty,
    activity.expectedLearnings,
    activity.experiencePrompt,
    cycleIndex
  ].join("::")) || 1;
  for (let index = types.length - 1; index > 0; index -= 1) {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [types[index], types[swapIndex]] = [types[swapIndex], types[index]];
  }
  return types;
}

function buildQuestionTypeSchedule(activity, count) {
  const schedule = [];
  let cycleIndex = 0;
  while (schedule.length < count) {
    schedule.push(...shuffledQuestionTypes(activity, cycleIndex));
    cycleIndex += 1;
  }
  return schedule.slice(0, count);
}

function nextQuestionTypeAfterRejection(activity, currentType, globalIndex, skippedTypes = new Set()) {
  const allowed = shuffledQuestionTypes(activity, globalIndex + 1);
  return allowed.find((type) => type !== currentType && !skippedTypes.has(type))
    || allowed.find((type) => type !== currentType)
    || currentType;
}

function generatedTypeForScheduledType(type) {
  return type === "image-multiple" ? "multiple" : type;
}

const STEM_MODEL_REGISTRY = {
  "arithmetic-balance": { subject: "math", formula: "a + b = c", measurement: "equivalencia" },
  "addition-subtraction": { subject: "math", formula: "a ± b = resultado", measurement: "resultado" },
  "algebra-equation": { subject: "math", formula: "ax + b = c", measurement: "solución" },
  "proportional-reasoning": { subject: "math", formula: "a/b = c/d", measurement: "proporción" },
  "function-graph": { subject: "math", formula: "y = mx + b", measurement: "coordenada" },
  "geometry-measurement": { subject: "math", formula: "A, P, V", measurement: "magnitud" },
  "probability-statistics": { subject: "math", formula: "P = favorables / posibles", measurement: "probabilidad" }
  ,"number-line": { subject: "math", formula: "posición final = inicio + desplazamiento", measurement: "posición y distancia" }
  ,"quadratic-factorization-rectangle": { subject: "math", formula: "g(px + q)(rx + s) = ax² + bx + c", measurement: "construcción algebraica" }
};

function resolveTopicTemplate(subject, topic) {
  const name = String(topic || "").toLowerCase();
  if (subject === "math") {
    if (/adici[oó]n\s+y\s+sustracci[oó]n/.test(name)) return { type: "addition-subtraction", variant: "addition-subtraction" };
    if (/recta num[eé]rica/.test(name)) return { type: "number-line", variant: "number-line" };
    if (/factorizaci[oó]n|factorizar/.test(name)) return { type: "quadratic-factorization-rectangle", variant: "quadratic-factorization-rectangle" };
    if (/probabilidad|estadística|gráfica|tabla/.test(name)) return { type: "math", variant: "probability-statistics" };
    if (/función|pendiente|plano cartesiano/.test(name)) return { type: "math", variant: "function-graph" };
    if (/ángulo|triángulo|pitágoras|perímetro|área|circunferencia|volumen|geometr|transform/.test(name)) return { type: "math", variant: "geometry-measurement" };
    if (/razón|proporción|regla de tres|porcentaje/.test(name)) return { type: "math", variant: "proportional-reasoning" };
    if (/ecuación|inecuación|polinomio|factor|algebra|término|producto notable/.test(name)) return { type: "math", variant: "algebra-equation" };
    return { type: "math", variant: "arithmetic-balance" };
  }
  if (subject === "physics") {
    if (/movimiento rectil[ií]neo|mrua|mru|posici[oó]n|desplazamiento|rapidez|velocidad|aceleraci[oó]n|gr[aá]fica/.test(name)) return { type: "friction", variant: "motion" };
    if (/pascal|arquímedes|presión|densidad|fluido/.test(name)) return { type: "fluid", variant: /pascal|presión/.test(name) ? "hydraulic" : "buoyancy" };
    if (/onda|frecuencia|longitud de onda|sonido/.test(name)) return { type: "wave", variant: "wave" };
    if (/reflexión|refracción|luz/.test(name)) return { type: "optics", variant: "prism" };
    if (/corriente|voltaje|ohm|circuito|resistencia eléctrica|carga eléctrica/.test(name)) return { type: "circuit", variant: "circuit" };
    if (/energía|trabajo|potencia/.test(name)) return { type: "energy", variant: /trabajo/.test(name) ? "work" : /potencia/.test(name) ? "power" : "potential" };
    if (/calor|transferencia térmica|temperatura|dilatación|conducción|convección|radiación/.test(name)) return { type: "thermal", variant: "thermal" };
    if (/estado de la materia|cambio.*estado|difusión|modelo molecular/.test(name)) return { type: "particles", variant: "particles" };
    if (/caída libre|caer|tiempo de caída/.test(name)) return { type: "gravity", variant: "gravity" };
    if (/proyectil|tiro parabólico|lanzamiento|trayectoria/.test(name)) return { type: "projectile", variant: "projectile" };
    if (/gravedad/.test(name)) return { type: "gravity", variant: "gravity" };
    return { type: "friction", variant: "motion" };
  }
  if (subject === "chemistry") {
    if (/ácido|base|ph|neutralización|disolución|concentración|solubilidad/.test(name)) return { type: "fluid", variant: "solution" };
    if (/átomo|atomo|protón|proton|neutrón|neutron|electrón|electron|número atómico|numero atomico|isótopo|isotopo|ion(?:es)?/.test(name)) return { type: "atomic", variant: "atom-builder" };
    if (/oxidación|reducción/.test(name)) return { type: "circuit", variant: "electron" };
    return { type: "particles", variant: "molecular" };
  }
  if (/ecosistema|cadena|ciclo|biodiversidad|evolución|selección|planta|fotosíntesis/.test(name)) return { type: "ecosystem", variant: "ecosystem" };
  return { type: "cell", variant: "cell" };
}

function buildTopicActivity(subject, topic, scenario) {
  const template = resolveTopicTemplate(subject, topic);
  const typeLabel = SIMULATION_LABELS[template.type];
  const title = `${topic}: laboratorio interactivo`;
  const missions = {
    atomic: "Construye átomos modificando protones, neutrones y electrones para observar cómo cambian el elemento, el isótopo y la carga eléctrica.",
    friction: `Experimenta cómo las fuerzas cambian el movimiento en el tema ${topic}.`,
    projectile: `Ajusta trayectoria y gravedad para comprobar el comportamiento de ${topic}.`,
    gravity: "Suelta un objeto desde distintas alturas y compara su tiempo y velocidad de caída.",
    circuit: `Modifica las variables eléctricas y observa su efecto en ${topic}.`,
    particles: `Controla temperatura y cantidad de partículas para explorar ${topic}.`,
    thermal: "Modifica la fuente térmica, la masa y el contacto para observar cómo cambia la temperatura con el tiempo.",
    ecosystem: `Equilibra recursos y observa cómo cambia ${topic}.`,
    energy: template.variant === "work" ? "Eleva la carga y relaciona fuerza, distancia y trabajo." : `Transforma energía y comprueba cómo masa y altura afectan ${topic}.`,
    fluid: template.variant === "hydraulic" ? "Acciona la prensa y descubre cómo se transmite la presión en un fluido." : `Cambia densidad y fuerza para investigar ${topic}.`,
    wave: `Modifica frecuencia, amplitud y longitud de onda para investigar ${topic}.`,
    optics: `Dirige el rayo y cambia el medio para experimentar ${topic}.`,
    cell: `Ajusta los recursos de la célula y observa su respuesta en ${topic}.`
  };
  const principles = {
    atomic: "El número de protones determina el elemento (Z); protones más neutrones forman el número de masa (A), y protones menos electrones determinan la carga neta.",
    friction: "La fuerza neta determina el cambio de movimiento de un cuerpo.",
    projectile: "La trayectoria combina movimiento horizontal y aceleración vertical debida a la gravedad.",
    gravity: "En caída libre sin resistencia del aire, todos los cuerpos aceleran verticalmente con la misma gravedad, independientemente de su masa.",
    circuit: "La corriente depende del voltaje aplicado y de la resistencia del circuito.",
    particles: "Las propiedades macroscópicas dependen del movimiento y las interacciones entre partículas.",
    thermal: "El flujo de calor depende de la diferencia de temperatura y cambia la energía interna del material según su masa y capacidad térmica.",
    ecosystem: "Los organismos dependen de recursos limitados y de sus interacciones.",
    energy: "La energía puede almacenarse, transferirse y transformarse; el trabajo cambia la energía de un sistema.",
    fluid: "La presión, densidad y empuje explican el comportamiento de los fluidos.",
    wave: "Las ondas transportan energía mediante oscilaciones caracterizadas por frecuencia, amplitud y longitud.",
    optics: "La luz cambia de dirección al reflejarse o al pasar entre medios.",
    cell: "La célula mantiene su actividad mediante intercambio de materia y transformación de energía."
  };
  const actions = {
    atomic: "Construir átomo", friction: "Aplicar fuerza", projectile: "Lanzar", gravity: "Soltar objeto", circuit: "Activar circuito", particles: "Observar partículas", thermal: "Iniciar calentamiento",
    ecosystem: "Simular ecosistema", energy: template.variant === "work" ? "Elevar carga" : "Liberar energía",
    fluid: template.variant === "hydraulic" ? "Accionar prensa" : "Probar flotación", wave: "Emitir onda",
    optics: "Proyectar luz", cell: "Activar célula"
  };
  missions.math ||= `Manipula valores y representaciones para descubrir la estructura matemática de ${topic}.`;
  principles.math ||= "Una relación matemática conserva su validez cuando sus operaciones y representaciones son equivalentes.";
  actions.math ||= "Comprobar relación";
  const isAdditionSubtraction = template.variant === "addition-subtraction";
  return normalizeActivity({
    schemaVersion: 2,
    title,
    subtitle: typeLabel,
    subject,
    topic,
    simulationType: template.type,
    variant: template.variant,
    scenario: structuredClone(scenario),
    mission: isAdditionSubtraction ? "Explora sumas y restas de enteros en la recta numérica y comprueba el resultado mediante fichas positivas, negativas y pares cero." : missions[template.type],
    scientificPrinciple: isAdditionSubtraction ? "Sumar desplaza según el signo del segundo número; restar equivale a sumar su opuesto." : principles[template.type],
    actionLabel: isAdditionSubtraction ? "Representar operación" : actions[template.type],
    successMessage: `¡Experimento de ${topic} completado!`,
    coachTips: [
      "Cambia una sola variable cada vez.",
      "Predice qué ocurrirá antes de activar la simulación.",
      "Compara el resultado con el principio científico."
    ],
    controls: structuredClone(template.variant === "hydraulic" ? HYDRAULIC_CONTROL_PRESET : CONTROL_PRESETS[template.type]),
    challenge: isAdditionSubtraction ? null : { targetLabel: `Explorar ${topic}`, targetValue: 1, tolerance: .1 },
    visual: { primary: scenario.ground, accent: scenario.accent, character: `${topic} explorer` }
  });
}

const DEFAULT_ACTIVITY = {
  schemaVersion: 2,
  visualStyle: "rive-kawaii-signal",
  title: "Misión Antideslizante",
  subtitle: "Experimenta con fuerza, masa y superficie",
  subject: "physics",
  grade: "2º secundaria",
  gameMode: "game",
  topic: "Resistencia y fricción",
  expectedLearnings: "",
  experiencePrompt: "",
  maxPoints: 1000,
  startScreen: {
    eyebrow: "",
    title: "",
    experience: "",
    expectedLearnings: "",
    buttonLabel: "Comenzar"
  },
  simulationType: "friction",
  scenario: {
    id: "physics-2",
    label: "Resistencia y fricción · Mundo 02",
    topic: "Resistencia y fricción",
    biome: "city",
    sky: "#d8e7f4",
    ground: "#617c9b",
    accent: "#ff8068",
    motif: "resistencia-y-friccion-city"
  },
  mission: "Lleva a Momo hasta la meta ajustando la fuerza y venciendo la resistencia sin usar más energía de la necesaria.",
  scientificPrinciple: "La fuerza de fricción se opone al movimiento. Un objeto comienza a acelerar cuando la fuerza aplicada supera la resistencia.",
  actionLabel: "¡Empujar a Momo!",
  successMessage: "¡Lo lograste! La fuerza aplicada superó la resistencia de la superficie.",
  coachTips: [
    "Compara la flecha azul con la flecha coral.",
    "Si Momo no avanza, cambia una sola variable.",
    "Una masa mayor necesita más fuerza para acelerar."
  ],
  controls: [
    { id: "force", label: "Fuerza aplicada", min: 10, max: 100, step: 5, value: 55, unit: "N", effect: "Aumenta la fuerza hacia la meta." },
    { id: "friction", label: "Resistencia", min: 5, max: 90, step: 5, value: 45, unit: "N", effect: "Se opone al movimiento." },
    { id: "mass", label: "Masa del objeto", min: 2, max: 25, step: 1, value: 10, unit: "kg", effect: "Modifica la aceleración." }
  ],
  challenge: { targetLabel: "Llegar a la meta", targetValue: 10, tolerance: 1 },
  visual: { primary: "#48d8c8", accent: "#c4f05c", character: "Momo, caja exploradora" }
};

const ACTIVITY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    subject: { type: "string", enum: ["physics", "chemistry", "biology", "math"] },
    topic: { type: "string" },
    simulationType: { type: "string", enum: ["atomic", "periodic", "periodic-properties", "matter-phase", "molecule-builder", "bonding", "acid-base", "reaction-stoichiometry", "redox", "reaction-kinetics", "solution", "cell-structure", "membrane-transport", "cell-metabolism", "genetics-expression", "cell-division", "population-evolution", "organism-classification", "microorganism-growth", "human-physiology", "ecosystem-dynamics", "friction", "projectile", "gravity", "thermal", "circuit", "particles", "ecosystem", "energy", "fluid", "wave", "optics", "cell", "math"] },
    scenario: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        topic: { type: "string" },
        biome: { type: "string", enum: ["laboratory", "city", "space", "desert", "arctic", "ocean", "volcanic", "forest", "microscopic"] },
        sky: { type: "string" },
        ground: { type: "string" },
        accent: { type: "string" },
        motif: { type: "string" }
      },
      required: ["id", "label", "topic", "biome", "sky", "ground", "accent", "motif"]
    },
    mission: { type: "string" },
    scientificPrinciple: { type: "string" },
    actionLabel: { type: "string" },
    successMessage: { type: "string" },
    coachTips: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    controls: {
      type: "array",
      minItems: 2,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: ["force", "friction", "mass", "angle", "power", "gravity", "velocity", "initialVelocity", "brakeForce", "obstacleDistance", "voltage", "resistance", "temperature", "particleCount", "sourceTemperature", "objectMass", "initialTemperature", "thermalConductance", "sunlight", "water", "height", "area", "density", "frequency", "amplitude", "wavelength", "refractiveIndex", "nutrients", "oxygen", "reagentA", "reagentB", "ratioA", "ratioB", "solute", "volume", "outside", "inside", "permeability", "biodiversity", "dominant", "recessive", "x", "coefficient", "constant", "factorMode", "commonFactor", "factorP", "factorQ", "factorR", "factorS"] },
          label: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          step: { type: "number" },
          value: { type: "number" },
          unit: { type: "string" },
          effect: { type: "string" }
        },
        required: ["id", "label", "min", "max", "step", "value", "unit", "effect"]
      }
    },
    challenge: {
      type: "object",
      properties: {
        targetLabel: { type: "string" },
        targetValue: { type: "number" },
        tolerance: { type: "number" }
      },
      required: ["targetLabel", "targetValue", "tolerance"]
    },
    simulator: {
      type: "object",
      properties: {
        modelId: { type: "string", enum: ["atomic", "periodic", "periodic-properties", "matter-phase", "molecule-builder", "bonding", "acid-base", "reaction-stoichiometry", "redox", "reaction-kinetics", "solution", "cell-structure", "membrane-transport", "cell-metabolism", "genetics-expression", "cell-division", "population-evolution", "organism-classification", "microorganism-growth", "human-physiology", "ecosystem-dynamics", "friction", "projectile", "gravity", "thermal", "circuit", "particles", "ecosystem", "energy", "fluid", "wave", "optics", "cell", "math", "addition-subtraction", "number-line", "quadratic-factorization-rectangle"] },
        formula: { type: "string" }, measurementLabel: { type: "string" }, measurementUnit: { type: "string" }, specificHeat: { type: "number" }, objectiveMetric: { type: "string", enum: ["sourceTemperature", "materialTemperature", "heatFlow"] },
        objectiveEnabled: { type: "boolean" }, objective: { type: "string" }, targetValue: { type: "number" }, tolerance: { type: "number" }
      },
      required: ["modelId", "formula", "measurementLabel", "measurementUnit", "objectiveEnabled", "objective", "targetValue", "tolerance"]
    },
    visual: {
      type: "object",
      properties: {
        primary: { type: "string" },
        accent: { type: "string" },
        character: { type: "string" }
      },
      required: ["primary", "accent", "character"]
    }
  },
  required: ["title", "subtitle", "subject", "topic", "simulationType", "scenario", "mission", "scientificPrinciple", "actionLabel", "successMessage", "coachTips", "controls", "challenge", "visual"]
};

const ASSESSMENT_GENERATION_SCHEMA = {
  type: "object",
  properties: {
    assessments: {
      type: "array",
      minItems: 1,
      maxItems: 25,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["multiple", "image-multiple", "matching", "keyword", "equation-build", "fill-blank", "exponent-placement", "chemical-balance", "numeric-answer", "graph-plot", "sequence-order", "timeline-order", "number-line-placement"] },
          timelineMode: { type: "string", enum: ["chronology", "process", "ideas"] },
          events: {
            type: "array",
            minItems: 3,
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                title: { type: "string" },
                description: { type: "string" }
              },
              required: ["id", "title", "description"]
            }
          },
          prompt: { type: "string" },
          context: { type: "string" },
          observationGuide: { type: "string" },
          given: { type: "array", items: { type: "string" } },
          goal: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct: { type: "number" },
          visual: { type: "object", properties: {
            target: { type: "string" }, imagePrompt: { type: "string" }, alt: { type: "string" },
            imageDataUrl: { type: "string" }, imageUrl: { type: "string" }, imageSrc: { type: "string" }
          } },
          accepted: { type: "array", items: { type: "string" } },
          pieces: { type: "array", items: { type: "string" } },
          correctSequence: { type: "array", items: { type: "string" } },
          distractors: { type: "array", items: { type: "string" } },
          segments: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
          bases: { type: "array", items: { type: "string" } },
          exponents: { type: "array", items: { type: "string" } },
          correctExponents: { type: "array", items: { type: "string" } },
          compounds: {
            type: "array",
            items: {
              type: "object",
              properties: {
                formula: { type: "string" },
                side: { type: "string", enum: ["reactant", "product"] }
              },
              required: ["formula", "side"]
            }
          },
          correctCoefficients: { type: "array", items: { type: "number" } },
          correctValue: { type: "number" },
          tolerance: { type: "number" },
          unit: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          denominator: { type: "number" },
          targetValue: { type: "number" },
          startValue: { type: "number" },
          steps: { type: "array", items: { type: "string" } },
          correctOrder: { type: "array", items: { type: "string" } },
          axes: {
            type: "object",
            properties: {
              x: { type: "string" },
              y: { type: "string" }
            },
            required: ["x", "y"]
          },
          targetPoints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" }
              },
              required: ["x", "y"]
            }
          },
          pairs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                left: { type: "string" },
                right: { type: "string" }
              },
              required: ["left", "right"]
            }
          },
          feedback: { type: "string" }
        },
        required: ["type", "prompt", "context", "given", "goal", "feedback"]
      }
    }
  },
  required: ["assessments"]
};

function buildCompactAssessmentGenerationSchema(activity, scheduledTypes = [], questionsNeeded = 1) {
  const sourceProperties = ASSESSMENT_GENERATION_SCHEMA.properties.assessments.items.properties;
  const fieldsByType = {
    multiple: ["options", "correct"],
    matching: ["pairs"],
    keyword: ["accepted"],
    "fill-blank": ["accepted", "segments"],
    "equation-build": ["pieces", "correctSequence", "distractors"],
    "exponent-placement": ["bases", "exponents", "correctExponents"],
    "chemical-balance": ["compounds", "correctCoefficients"],
    "numeric-answer": ["correctValue", "tolerance", "unit"],
    "graph-plot": ["axes", "targetPoints"],
    "sequence-order": ["steps", "correctOrder"],
    "timeline-order": ["timelineMode", "events", "correctOrder"],
    "number-line-placement": ["min", "max", "denominator", "targetValue", "startValue", "correctValue", "tolerance"]
  };
  const generatedTypes = [...new Set(scheduledTypes.map(generatedTypeForScheduledType))];
  const fields = new Set(["type", "prompt", "context", "observationGuide", "given", "goal", "feedback"]);
  generatedTypes.forEach((type) => (fieldsByType[type] || []).forEach((field) => fields.add(field)));
  const properties = Object.fromEntries([...fields].map((field) => [field, structuredClone(sourceProperties[field])]));
  properties.type = { type: "string", enum: generatedTypes };
  if (activity?.subject === "biology" && generatedTypes.length === 1 && generatedTypes[0] === "numeric-answer") {
    properties.correctValue = { type: "integer", minimum: 0, maximum: 30 };
    properties.tolerance = { type: "number", minimum: 0, maximum: 0 };
    properties.unit = { type: "string" };
  }
  const required = ["type", "prompt", "context", "given", "goal", "feedback"];
  if (generatedTypes.length === 1) {
    (fieldsByType[generatedTypes[0]] || []).forEach((field) => {
      if (!required.includes(field)) required.push(field);
    });
  }
  return {
    type: "object",
    properties: {
      assessments: {
        type: "array",
        minItems: questionsNeeded,
        maxItems: questionsNeeded,
        items: {
          type: "object",
          properties,
          required
        }
      }
    },
    required: ["assessments"]
  };
}

const state = {
  activity: structuredClone(DEFAULT_ACTIVITY),
  previewActivity: null,
  gameInstance: null,
  sessions: [],
  sessionGroups: [],
  selectedSessionIds: new Set(),
  activeSessionId: null,
  generating: false,
  regeneratingQuestion: null,
  contentSelection: "start",
  previewMountRevision: 0
};

const scienceGenerationTrace = { id: "", startedAt: 0, step: 0, active: false };

function beginScienceGenerationTrace(details = {}) {
  scienceGenerationTrace.id = `gen-${Date.now().toString(36)}`;
  scienceGenerationTrace.startedAt = performance.now();
  scienceGenerationTrace.step = 0;
  scienceGenerationTrace.active = true;
  logScienceGenerationStep("Inicio de generación", details);
  return scienceGenerationTrace.id;
}

function logScienceGenerationStep(label, details = {}, level = "info") {
  if (!scienceGenerationTrace.active) return;
  scienceGenerationTrace.step += 1;
  const elapsedSeconds = ((performance.now() - scienceGenerationTrace.startedAt) / 1000).toFixed(1);
  const prefix = `[ScienceActivities][${scienceGenerationTrace.id}][Paso ${String(scienceGenerationTrace.step).padStart(2, "0")}][+${elapsedSeconds}s]`;
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  writer.call(console, `${prefix} ${label}`, details);
}

function finishScienceGenerationTrace(status, details = {}) {
  if (!scienceGenerationTrace.active) return;
  logScienceGenerationStep(status === "success" ? "Generación completada" : "Generación finalizada con error", details, status === "success" ? "info" : "error");
  scienceGenerationTrace.active = false;
}

const $ = (selector) => document.querySelector(selector);
const setOptionalText = (selector, value) => {
  const element = $(selector);
  if (element) element.textContent = value;
};
const SCIENCE_THEMES = ["dark", "mid", "light"];
const SCIENCE_THEME_META = {
  dark: { label: "Tema oscuro", icon: "fa-adjust", next: "Cambiar a tema medio" },
  mid: { label: "Tema medio", icon: "fa-sun", next: "Cambiar a tema claro" },
  light: { label: "Tema claro", icon: "fa-moon", next: "Cambiar a tema oscuro" }
};

function setScienceTheme(theme = "dark", { persist = false } = {}) {
  const normalizedTheme = SCIENCE_THEMES.includes(String(theme || "").toLowerCase())
    ? String(theme).toLowerCase()
    : "dark";
  document.body.dataset.saTheme = normalizedTheme;
  const button = $("#scienceThemeToggleBtn");
  const meta = SCIENCE_THEME_META[normalizedTheme];
  if (button) {
    button.dataset.tooltip = meta.label;
    button.title = meta.next;
    button.setAttribute("aria-label", meta.next);
    button.setAttribute("aria-pressed", String(normalizedTheme !== "dark"));
    const icon = button.querySelector("i");
    if (icon) icon.className = `fas ${meta.icon}`;
  }
  if (persist) {
    try { localStorage.setItem(SCIENCE_THEME_STORAGE_KEY, normalizedTheme); } catch (_) { }
  }
}

function initializeScienceTheme() {
  let savedTheme = "dark";
  try { savedTheme = localStorage.getItem(SCIENCE_THEME_STORAGE_KEY) || "dark"; } catch (_) { }
  setScienceTheme(savedTheme);
}

function cycleScienceTheme() {
  const current = document.body.dataset.saTheme || "dark";
  const next = SCIENCE_THEMES[(SCIENCE_THEMES.indexOf(current) + 1) % SCIENCE_THEMES.length];
  setScienceTheme(next, { persist: true });
}
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function parseGeneratedJsonCandidate(candidate) {
  const source = String(candidate || "").trim();
  const attempts = [source];
  const repaired = source
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/}\s*(?={)/g, "},")
    .replace(/]\s*(?={)/g, "],")
    .replace(/}\s*(?=\[)/g, "},")
    .replace(/]\s*(?=\[)/g, "],")
    .replace(/([}\]])\s*(?=\"[^\"]+\"\s*:)/g, "$1,")
    .replace(/\"\s+(?=\")/g, "\",");
  if (repaired !== source) attempts.push(repaired);
  let lastError;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new SyntaxError("La respuesta no contiene JSON válido.");
}

function parseGeneratedJson(rawText) {
  const cleaned = String(rawText || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return parseGeneratedJsonCandidate(cleaned); } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return parseGeneratedJsonCandidate(match[0]);
    throw new Error("La IA no devolvió una actividad JSON válida.");
  }
}

function cleanVisualConfigurationReferences(value) {
  return String(value ?? "")
    .replace(/\b(?:estilo\s+)?(?:kawaii|chibi|cyberpunk|pixel\s*art|gouache|acuarela|pastel|ne[oó]n|arcade|storybook|tech\s+minimal|minimalista\s+japon[eé]s|cosmos\s+kawaii)\b/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([)\]])/g, "$1")
    .trim();
}

function cleanScenarioConfigurationReferences(value, scenario = {}) {
  let result = String(value ?? "");
  const label = String(scenario.label || "").trim();
  if (label) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escapedLabel, "gi"), "");
  }
  return result
    .replace(/\b(?:mundo|zona|estaci[oó]n|laboratorio)\s*(?:n[úu]m(?:ero)?\.?\s*)?\d+\b/gi, "")
    .replace(/\bescenario\s+libre\b/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeVisibleActivityCopy(activity) {
  ["title", "subtitle", "mission", "scientificPrinciple", "actionLabel", "successMessage"].forEach((key) => {
    if (typeof activity[key] === "string") activity[key] = cleanVisualConfigurationReferences(activity[key]);
  });
  if (Array.isArray(activity.coachTips)) {
    activity.coachTips = activity.coachTips.map(cleanVisualConfigurationReferences);
  }
  if (Array.isArray(activity.controls)) {
    activity.controls.forEach((control) => {
      control.label = cleanVisualConfigurationReferences(control.label);
      control.effect = cleanVisualConfigurationReferences(control.effect);
    });
  }
  if (activity.challenge) {
    activity.challenge.targetLabel = cleanVisualConfigurationReferences(activity.challenge.targetLabel);
  }
  if (activity.learningGuide) {
    activity.learningGuide.title = cleanVisualConfigurationReferences(activity.learningGuide.title);
    activity.learningGuide.introduction = cleanVisualConfigurationReferences(activity.learningGuide.introduction);
    (activity.learningGuide.levels || []).forEach((level) => {
      ["title", "narrative", "objective", "hint"].forEach((key) => {
        level[key] = cleanVisualConfigurationReferences(level[key]);
      });
      (level.concepts || []).forEach((concept) => {
        concept.term = cleanVisualConfigurationReferences(concept.term);
        concept.definition = cleanVisualConfigurationReferences(concept.definition);
      });
      if (typeof level.example === "string") level.example = cleanVisualConfigurationReferences(level.example);
      else if (level.example && typeof level.example === "object") {
        ["title", "text", "situation", "data", "procedure", "result", "formula", "explanation"].forEach((key) => {
          level.example[key] = cleanVisualConfigurationReferences(level.example[key]);
        });
      }
    });
  }
  (activity.assessments || []).forEach((assessment) => {
    assessment.prompt = cleanVisualConfigurationReferences(assessment.prompt);
    assessment.feedback = cleanVisualConfigurationReferences(assessment.feedback);
    if (Array.isArray(assessment.options)) assessment.options = assessment.options.map(cleanVisualConfigurationReferences);
    if (Array.isArray(assessment.pairs)) {
      assessment.pairs = assessment.pairs.map((pair) => pair.map(cleanVisualConfigurationReferences));
    }
  });
  return activity;
}

function resolveLearningGuideImageSource(level = {}) {
  return String(level.imageDataUrl || level.imageUrl || level.imageSrc || "").trim();
}

function rehydrateLearningGuideImages(activity) {
  (activity?.learningGuide?.levels || []).forEach((level) => {
    const source = resolveLearningGuideImageSource(level);
    if (source && !level.imageDataUrl) level.imageDataUrl = source;
  });
  return activity;
}

function normalizeActivity(input) {
  const activity = { ...structuredClone(DEFAULT_ACTIVITY), ...input };
  activity.maxPoints = normalizeActivityMaxPoints(input?.maxPoints);
  activity.expectedLearnings = meaningfulActivityText(input?.expectedLearnings);
  activity.startScreen = {
    ...structuredClone(DEFAULT_ACTIVITY.startScreen),
    ...(input?.startScreen && typeof input.startScreen === "object" ? input.startScreen : {})
  };
  if (input && !meaningfulActivityText(input.mission)) activity.mission = "";
  if (input && !meaningfulActivityText(input.scientificPrinciple)) activity.scientificPrinciple = "";
  applyScienceActivityContext(activity);
  rehydrateLearningGuideImages(activity);
  activity.subject = SUBJECT_LABELS[activity.subject] ? activity.subject : $("#subjectSelect").value;
  activity.grade = input?.grade || SUBJECT_DEFAULT_GRADES[activity.subject] || "2º secundaria";
  const legacyMode = input?.gameMode;
  activity.gameMode = legacyMode === "lab" || legacyMode === "simulator" ? "simulator" : "game";
  if (activity.gameMode === "simulator" && ["chemistry", "biology"].includes(activity.subject) && activity.topic) {
    const repairedScienceProfile = curriculumProfileFor(activity.subject, activity.topic);
    if (repairedScienceProfile) applyCurriculumProfile(activity, repairedScienceProfile);
  }
  activity.simulationType = SIMULATION_LABELS[activity.simulationType] ? activity.simulationType : "friction";
  if (activity.subject === "math") activity.simulationType = "math";
  const catalog = SCENARIOS[activity.subject] || SCENARIOS.physics;
  const referencedScenario = catalog.find((scenario) => scenario.id === activity.scenario?.id)
    || catalog.find((scenario) => scenario.topic.toLowerCase() === String(activity.topic || "").toLowerCase())
    || catalog[0];
  activity.scenario = activity.subject === "math"
    ? { ...referencedScenario, id: referencedScenario.id, topic: activity.topic || referencedScenario.topic }
    : { ...referencedScenario, ...(activity.scenario || {}), id: referencedScenario.id, topic: activity.topic || referencedScenario.topic };
  activity.coachTips = Array.isArray(activity.coachTips) && activity.coachTips.length ? activity.coachTips.slice(0, 5) : [...DEFAULT_ACTIVITY.coachTips];
  activity.controls = Array.isArray(activity.controls) && activity.controls.length
    ? activity.controls.slice(0, 8).map((control) => ({
      id: String(control.id || "force"),
      label: String(control.label || control.id || "Variable"),
      min: Number(control.min ?? 0),
      max: Number(control.max ?? 100),
      step: Math.max(.01, Number(control.step ?? 1)),
      value: Number(control.value ?? 50),
      unit: String(control.unit || ""),
      effect: String(control.effect || ""),
      controlType: control.controlType === "segmented" ? "segmented" : "range",
      options: Array.isArray(control.options) ? control.options.map((option) => ({ value: Number(option.value), label: String(option.label) })) : []
    }))
    : structuredClone(DEFAULT_ACTIVITY.controls);
  const hydraulicMode = activity.simulationType === "fluid"
    && (activity.variant === "hydraulic" || /pascal|presi[oó]n|hidr[aá]ul/i.test(`${activity.topic} ${activity.mission}`));
  if (hydraulicMode && !["inputForce", "inputArea", "outputArea", "loadMass"].every((id) => activity.controls.some((control) => control.id === id))) {
    activity.controls = structuredClone(HYDRAULIC_CONTROL_PRESET);
    activity.variant = "hydraulic";
  }
  const freeFallMode = activity.subject === "physics" && /caída libre|tiempo de caída|caer verticalmente/i.test(`${activity.topic} ${activity.mission}`);
  const repairsProjectileAsFreeFall = freeFallMode && (activity.simulationType === "projectile" || activity.simulator?.modelId === "projectile");
  if (freeFallMode) {
    activity.simulationType = "gravity";
    activity.variant = "gravity";
    activity.controls = structuredClone(CONTROL_PRESETS.gravity);
    activity.simulator = { ...(activity.simulator || {}), modelId: "gravity", formula: "t = √(2h/g)", measurementLabel: "Tiempo de caída", measurementUnit: "s" };
    if (repairsProjectileAsFreeFall) {
      activity.title = "Laboratorio de caída libre";
      activity.subtitle = "Altura, gravedad, tiempo y velocidad";
      activity.mission = "Suelta un objeto desde distintas alturas y observa cómo cambian el tiempo de caída y la velocidad de impacto.";
      activity.scientificPrinciple = "Sin resistencia del aire, la aceleración de caída depende de la gravedad y no de la masa del objeto.";
      activity.challenge = { targetLabel: "Altura inicial", targetValue: 20, tolerance: 1 };
      activity.simulator.objectiveEnabled = false;
      activity.simulator.objective = "Compara la caída al modificar altura, gravedad y masa.";
    }
  }
  const thermalMode = activity.subject === "physics" && /calor|térmic|temperatura|baño maría|conducción|convección|radiación|dilatación/i.test(`${activity.topic} ${activity.mission}`);
  if (thermalMode) {
    const previousControls = activity.controls || [];
    const sourceControl = previousControls.find((control) => ["sourceTemperature", "temperature"].includes(control.id));
    const massControl = previousControls.find((control) => ["objectMass", "mass"].includes(control.id));
    const sourceValue = Number(sourceControl?.value ?? 65);
    const massValue = Number(massControl?.value ?? 150) * (String(massControl?.unit || "g").toLowerCase() === "kg" ? 1000 : 1);
    activity.simulationType = "thermal";
    activity.variant = "thermal";
    activity.controls = structuredClone(CONTROL_PRESETS.thermal);
    activity.controls.find((control) => control.id === "sourceTemperature").value = Math.max(20, Math.min(95, sourceValue));
    activity.controls.find((control) => control.id === "objectMass").value = Math.max(25, Math.min(1000, massValue));
    const objectiveText = `${activity.simulator?.objective || ""} ${activity.challenge?.targetLabel || ""}`;
    activity.simulator = {
      ...(activity.simulator || {}), modelId: "thermal", formula: "Q̇ = G(Tfuente − Tmaterial); m·c·dT/dt = Q̇",
      measurementLabel: "Temperatura del material", measurementUnit: "°C",
      specificHeat: Math.max(100, Number(activity.simulator?.specificHeat || 1700)),
      objectiveMetric: /flujo|potencia/i.test(objectiveText) ? "heatFlow" : /fuente|agua/i.test(objectiveText) ? "sourceTemperature" : "materialTemperature"
    };
  }
  const atomicTopic = activity.subject === "chemistry"
    && /átomo|atomo|protón|proton|neutrón|neutron|electrón|electron|número atómico|numero atomico|isótopo|isotopo|ion(?:es)?/i.test(String(activity.topic || ""));
  if (atomicTopic) {
    const wasWrongModel = activity.simulationType !== "atomic" || activity.simulator?.modelId !== "atomic";
    activity.simulationType = "atomic";
    activity.variant = "atom-builder";
    activity.controls = structuredClone(CONTROL_PRESETS.atomic);
    activity.simulator = {
      ...(activity.simulator || {}),
      modelId: "atomic",
      formula: "Z = p; A = p + n; q = p - e",
      measurementLabel: "Número atómico",
      measurementUnit: "",
      objectiveMetric: "atomicNumber"
    };
    if (wasWrongModel && /hidrogel|térmic|temperatura|difusión|partícula|circuito/i.test(`${activity.title} ${activity.mission} ${activity.scientificPrinciple}`)) {
      activity.title = `${activity.topic}: constructor atómico`;
      activity.subtitle = "Estructura atómica interactiva";
      activity.mission = "Construye átomos y compara cómo protones, neutrones y electrones determinan el elemento, el isótopo y su carga.";
      activity.scientificPrinciple = "Z = protones; A = protones + neutrones; carga = protones - electrones.";
      activity.challenge = { targetLabel: "Protones", targetValue: 6, tolerance: 0 };
      activity.simulator.objective = "Construye un átomo con número atómico 6 y explora sus isótopos e iones.";
      activity.simulator.targetValue = 6;
      activity.simulator.tolerance = 0;
    }
  }
  if (activity.subject === "math") {
    const mathTemplate = resolveTopicTemplate("math", activity.topic);
    const expectedControls = CONTROL_PRESETS[mathTemplate.type] || CONTROL_PRESETS.math;
    if (!expectedControls.every((expected) => activity.controls.some((control) => control.id === expected.id))) {
      activity.controls = structuredClone(expectedControls);
    }
  }
  activity.simulator = {
    ...(activity.simulator || {}),
    modelId: activity.simulator?.modelId || (activity.subject === "math" ? resolveTopicTemplate("math", activity.topic).variant : activity.simulationType),
    formula: hydraulicMode ? "P = F₁ / A₁; F₂ = P · A₂" : thermalMode ? "Q̇ = G(Tfuente − Tmaterial); m·c·dT/dt = Q̇" : activity.simulator?.formula || STEM_MODEL_REGISTRY[activity.simulator?.modelId]?.formula || activity.scientificPrinciple,
    objectiveEnabled: activity.simulator?.objectiveEnabled !== false,
    objective: activity.simulator?.objective || activity.challenge?.targetLabel || "Observar la relación entre variables",
    tolerance: Math.max(0, Number(activity.simulator?.tolerance ?? activity.challenge?.tolerance ?? .1)),
    values: { ...(activity.simulator?.values || {}) },
    maxSafePressure: Math.max(1000, Number(activity.simulator?.maxSafePressure || 250000)),
    specificHeat: Math.max(100, Number(activity.simulator?.specificHeat || 1700)),
    objectiveMetric: activity.simulator?.objectiveMetric || "materialTemperature"
  };
  const curriculumProfile = curriculumProfileFor(activity.subject, activity.topic);
  if (curriculumProfile) applyCurriculumProfile(activity, curriculumProfile);
  else if (activity.gameMode === "simulator") activity.profileValidationError = `No existe un perfil de simulador curado para ${activity.topic}.`;
  // El perfil debe estar aplicado antes de resolver recursos visuales. De este modo,
  // sceneVariant y los controles curados también gobiernan los fallbacks locales.
  activity.simulatorVisualSelection = normalizeSimulatorVisualSelection(activity, activity.simulatorVisualSelection);
  activity.visualScene = normalizeSimulatorVisualScene(activity, activity.visualScene);
  enforceActivitySubjectContract(activity);
  activity.assessments = activity.gameMode === "simulator"
    ? []
    : reconcileSubjectAssessments(activity, activity.assessments || []);
  if (activity.gameMode === "game") distributeActivityAssessmentPoints(activity);
  if (activity.gameMode === "simulator") {
    activity.learningGuide = null;
    activity.playerSprite = null;
    activity.playerCharacter = null;
    activity.levelCount = 0;
    activity.questionsPerLevel = 0;
    activity.generation = { ...(activity.generation || {}), levelCount: 0, questionsPerLevel: 0, totalQuestions: 0 };
  }
  if (activity.gameMode === "game" && activity.gameProgress) {
    state.gameProgress = structuredClone(activity.gameProgress);
  }
  applyScienceActivityContext(activity);
  if (activity.gameMode === "game" && activity.learningGuide) {
    activity.learningGuide.introduction = buildScienceExperienceIntroduction(activity);
  }
  return sanitizeVisibleActivityCopy(activity);
}

function buildPrompt() {
  const subject = $("#subjectSelect").value;
  const topic = getSelectedTopic();
  const visualStyle = $("#visualStyleSelect").value;
  const selectedScenario = getSelectedScenario();
  const curriculumProfile = curriculumProfileFor(subject, topic);
  const gameMode = $("#gameModeSelect").value;
  if (!curriculumProfile && gameMode === "simulator") throw new Error(`El tema ${topic} no tiene un perfil científico curado y no puede simularse.`);
  const experience = gameMode === "simulator"
    ? curriculumProfile?.simulatorProfile?.focus || `Explorar ${topic} mediante su simulador curado.`
    : $("#experiencePrompt").value.trim();
  const expectedLearnings = gameMode === "simulator" ? "" : $("#expectedLearnings").value.trim();
  const levelCount = Math.max(1, Math.floor(Number($("#gameLevelCount").value || 3)));
  const questionsPerLevel = configuredQuestionsPerLevel($("#questionsPerLevel").value, 3);
  const totalQuestions = levelCount * questionsPerLevel;
  const generationContract = buildCurriculumGenerationContract({
    subject,
    topic,
    grade: $("#gradeSelect").value,
    difficulty: $("#difficultySelect").value,
    experiencePrompt: experience,
    expectedLearnings
  });
  const subjectIsolation = {
    math: [
      "CONTRATO OBLIGATORIO DE MATERIA: MATEMÁTICAS.",
      "Todo el contenido debe ser matemático y corresponder al tema indicado.",
      "Usa números, operaciones, expresiones, ecuaciones, funciones, figuras, mediciones, tablas, gráficas, estadística o probabilidad según corresponda.",
      "No uses matraces, reactivos, reacciones químicas, moléculas, células, genética, ecosistemas, fuerzas, circuitos, proyectiles ni vocabulario de Física, Química o Biología.",
      "La plantilla obligatoria es math y el modelo debe ser uno de: arithmetic-balance, algebra-equation, proportional-reasoning, function-graph, geometry-measurement o probability-statistics."
    ].join(" "),
    physics: "CONTRATO OBLIGATORIO DE MATERIA: FÍSICA. No introduzcas contenidos de Química, Biología o Matemáticas como tema principal.",
    chemistry: "CONTRATO OBLIGATORIO DE MATERIA: QUÍMICA. No introduzcas contenidos de Física, Biología o Matemáticas como tema principal.",
    biology: "CONTRATO OBLIGATORIO DE MATERIA: BIOLOGÍA. No introduzcas contenidos de Física, Química o Matemáticas como tema principal."
  }[subject];
  return [
    "Diseña una actividad científica experimental y jugable para adolescentes.",
    `CONTRATO CURRICULAR INMUTABLE: ${JSON.stringify($("#gameModeSelect").value === "simulator" ? curriculumProfile?.simulatorProfile : curriculumProfile?.gameProfile)}. No cambies su modelo, fórmulas, unidades, variables, mecánicas ni tipos permitidos.`,
    ADOLESCENT_CONTENT_DIRECTION,
    `Materia: ${SUBJECT_LABELS[subject]}.`,
    subjectIsolation,
    generationContract,
    `Tema de referencia: ${topic || "tema libre"}.`,
    `Escenario asignado al tema: ${selectedScenario.label}; bioma ${selectedScenario.biome}; paleta ${selectedScenario.sky}, ${selectedScenario.ground}, ${selectedScenario.accent}. Conserva su id ${selectedScenario.id}.`,
    "Usa el escenario únicamente como dirección visual interna. Nunca escribas su etiqueta, número de mundo, zona, estación o identificador en títulos, narrativas, misiones, preguntas, retroalimentación ni resultados visibles para el alumno.",
    `Nivel: ${$("#gradeSelect").value}.`,
    `Dificultad: ${$("#difficultySelect").value}.`,
    `Modalidad: ${$("#gameModeSelect").value === "simulator" ? "simulador científico sin personaje, preguntas ni puntuación" : "videojuego educativo con retos, preguntas y puntuación"}.`,
    $("#gameModeSelect").value === "simulator"
      ? "Diseña un simulador con variables editables, rangos, unidades, fórmula, mediciones en tiempo real y un objetivo opcional. No incluyas preguntas ni personaje."
      : "Diseña un videojuego de pregunta, hipótesis, interacción científica, evidencia, puntuación y retroalimentación.",
    $("#gameModeSelect").value === "simulator"
      ? "No generes niveles, guía pedagógica, preguntas, respuestas, puntuación, personajes ni sprites. simulator.modelId debe ser uno de friction, projectile, gravity, thermal, circuit, particles, ecosystem, energy, fluid, wave, optics, cell, math, addition-subtraction, number-line o quadratic-factorization-rectangle. Define una fórmula válida, magnitud medida, unidad, hasta ocho controles con rangos seguros y un reto opcional que no bloquee la exploración."
      : "La estructura pedagógica tendrá " + levelCount + " niveles y " + questionsPerLevel + " actividades por nivel; las preguntas se generarán en una etapa posterior.",
    "challenge.targetLabel debe coincidir exactamente con el label de uno de los controles y targetValue debe estar dentro de su rango min/max.",
    gameMode === "simulator" && /pascal|presi[oó]n|hidr[aá]ul/i.test(topic)
      ? "Para un elevador, prensa o sistema hidráulico usa simulator.modelId fluid y exactamente estos controles: inputForce (N), inputArea (m²), outputArea (m²) y loadMass (kg). Usa P=Fentrada/Aentrada, Fsalida=P·Asalida y Aentrada·Δxentrada=Asalida·Δxsalida. No lo reduzcas a un solo pistón."
      : "",
    `Dirección visual obligatoria: ${VISUAL_STYLE_DIRECTIONS[visualStyle] || VISUAL_STYLE_DIRECTIONS["kawaii-lab"]}.`,
    "No mezcles esta dirección con otros estilos. Solo usa estética kawaii cuando la opción seleccionada la mencione expresamente.",
    "La dirección visual es solo una instrucción de ilustración. Está prohibido mencionar nombres de estilos artísticos o de configuración en cualquier texto visible de la actividad.",
    "No escribas palabras como kawaii, chibi, cyberpunk, pastel, neón, arcade, pixel art, gouache o acuarela en títulos, misión, controles, preguntas, respuestas, conceptos o retroalimentación.",
    gameMode === "simulator"
      ? `Contexto fijo del perfil científico: ${experience}. No inventes otro escenario, aplicación o caso de uso.`
      : `Experiencia solicitada por el docente: ${experience}.`,
    gameMode === "simulator" ? "" : `APRENDIZAJES ESPERADOS OBLIGATORIOS: ${expectedLearnings || "No se proporcionaron aprendizajes adicionales; usa el tema y el grado seleccionados."}`,
    "Construye preguntas con contexto breve pero auténtico. En opción múltiple usa distractores científicamente plausibles que representen errores conceptuales comunes.",
    "En emparejamiento relaciona variables, evidencias, procesos o representaciones; en palabra clave solicita términos disciplinares relevantes, no vocabulario trivial.",
    "Elige exactamente una plantilla compatible:",
    "- friction: fuerzas, fricción, resistencia, masa, aceleración.",
    "- projectile: ángulo, potencia, gravedad y trayectoria.",
    "- gravity: caída vertical, altura, gravedad, tiempo de caída y velocidad final; nunca usa ángulo ni alcance horizontal.",
    "- circuit: voltaje, resistencia, corriente y brillo.",
    "- thermal: transferencia de calor macroscópica con sourceTemperature (°C), objectMass (g), initialTemperature (°C) y thermalConductance (W/K). Usa Q̇=G(Tfuente−Tmaterial) y capacidad térmica; nunca usa E cinética molecular como medición principal.",
    "- particles: estados de la materia, difusión y movimiento molecular; convierte °C a K únicamente dentro de fórmulas moleculares.",
    "- ecosystem: luz, agua, recursos, poblaciones y equilibrio.",
    "- energy: energía cinética/potencial, trabajo, potencia y transformaciones.",
    "- fluid: presión, Pascal, Arquímedes, densidad, flotación y disoluciones.",
    "- wave: ondas, sonido, frecuencia, amplitud y longitud de onda.",
    "- optics: reflexión, refracción, ángulos e índice del medio.",
    "- cell: célula, orgánulos, genética, sistemas y metabolismo.",
    "- math: aritmética, álgebra, proporcionalidad, funciones, geometría, estadística y probabilidad.",
    "Los controles deben usar únicamente IDs válidos para la plantilla elegida.",
    "Prioriza manipular variables, observar causa y efecto, formular hipótesis y volver a intentar.",
    "No generes código, HTML ni markdown. Devuelve únicamente el JSON solicitado."
  ].join("\n");
}

function extractResponseText(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .join("")
    || String(response?.text || response?.output_text || "");
}

const ASSESSMENT_BANK = {
  friction: {
    multiple: ["¿Cuándo comenzará a moverse el objeto?", ["Cuando la fuerza aplicada supera la fricción", "Cuando la masa desaparece", "Cuando la fricción aumenta"], 0],
    keyword: ["Escribe la fuerza que se opone al movimiento entre dos superficies.", ["fricción", "friccion"]],
    matching: [["Fuerza aplicada", "Cambia el movimiento"], ["Fricción", "Se opone al movimiento"], ["Masa", "Determina la inercia"]]
  },
  projectile: {
    multiple: ["¿Qué variables cambian directamente la trayectoria de un proyectil?", ["Velocidad inicial y ángulo", "Color y temperatura", "Masa y voltaje"], 0],
    keyword: ["Escribe la fuerza que curva la trayectoria hacia el suelo.", ["gravedad"]],
    matching: [["Ángulo", "Orienta el lanzamiento"], ["Velocidad inicial", "Aporta alcance"], ["Gravedad", "Acelera hacia abajo"]]
  },
  circuit: {
    multiple: ["Si el voltaje se mantiene, ¿qué ocurre al aumentar la resistencia?", ["Disminuye la corriente", "Aumenta la corriente", "Desaparece el voltaje"], 0],
    keyword: ["Escribe la magnitud que se opone al paso de la corriente.", ["resistencia"]],
    matching: [["Voltaje", "Impulsa las cargas"], ["Corriente", "Flujo de carga"], ["Resistencia", "Limita la corriente"]]
  },
  particles: {
    multiple: ["¿Qué sucede con las partículas al aumentar la temperatura?", ["Se mueven más rápido", "Pierden toda su masa", "Se quedan inmóviles"], 0],
    keyword: ["Escribe la medida relacionada con la energía cinética promedio de las partículas.", ["temperatura"]],
    matching: [["Sólido", "Partículas muy próximas"], ["Líquido", "Partículas que fluyen"], ["Gas", "Partículas muy separadas"]]
  },
  ecosystem: {
    multiple: ["¿Qué puede ocurrir si disminuye mucho una población del ecosistema?", ["Se altera la red alimentaria", "Nada cambia", "Aumenta toda la energía disponible"], 0],
    keyword: ["Escribe el proceso mediante el cual las plantas capturan energía luminosa.", ["fotosíntesis", "fotosintesis"]],
    matching: [["Productor", "Fabrica su alimento"], ["Consumidor", "Obtiene energía al alimentarse"], ["Descomponedor", "Recicla materia"]]
  },
  energy: {
    multiple: ["¿Qué transformación ocurre al descender un objeto por una rampa?", ["Potencial a cinética", "Cinética a masa", "Calor a gravedad"], 0],
    keyword: ["Escribe la capacidad de producir cambios o realizar trabajo.", ["energía", "energia"]],
    matching: [["Altura", "Aumenta energía potencial"], ["Velocidad", "Aumenta energía cinética"], ["Trabajo", "Transfiere energía"]]
  },
  fluid: {
    multiple: ["En una prensa hidráulica, ¿cómo se transmite la presión?", ["Por todo el fluido", "Solo hacia arriba", "Únicamente al recipiente"], 0],
    keyword: ["Escribe la magnitud definida como fuerza entre área.", ["presión", "presion"]],
    matching: [["Fuerza", "Empuja el pistón"], ["Área", "Modifica la presión"], ["Densidad", "Influye en la flotación"]]
  },
  wave: {
    multiple: ["¿Qué cambia al aumentar la frecuencia de una onda sonora?", ["El tono", "La masa del emisor", "La gravedad"], 0],
    keyword: ["Escribe el número de oscilaciones por segundo.", ["frecuencia"]],
    matching: [["Frecuencia", "Oscilaciones por segundo"], ["Amplitud", "Máximo desplazamiento"], ["Longitud de onda", "Distancia entre crestas"]]
  },
  optics: {
    multiple: ["¿Qué ocurre cuando la luz cambia de medio y modifica su dirección?", ["Refracción", "Evaporación", "Conducción"], 0],
    keyword: ["Escribe el cambio de dirección de la luz al rebotar en una superficie.", ["reflexión", "reflexion"]],
    matching: [["Reflexión", "La luz rebota"], ["Refracción", "La luz cambia de dirección"], ["Prisma", "Separa colores"]]
  },
  cell: {
    multiple: ["¿Qué estructura contiene principalmente la información genética de una célula eucariota?", ["Núcleo", "Membrana", "Citoplasma"], 0],
    keyword: ["Escribe el orgánulo que participa principalmente en la producción de ATP.", ["mitocondria"]],
    matching: [["Núcleo", "Contiene ADN"], ["Membrana", "Regula intercambios"], ["Mitocondria", "Produce ATP"]]
  },
  math: {
    multiple: ["¿Qué valor de x satisface 2x + 3 = 11?", ["4", "5", "7"], 0],
    keyword: ["Escribe el resultado de elevar 3 al cuadrado.", ["9", "nueve"]],
    matching: [["Coeficiente", "Número que multiplica una variable"], ["Variable", "Símbolo que representa un valor"], ["Constante", "Término sin variable"]]
  }
};

function assessmentHash(text) {
  return [...String(text)].reduce((total, character) => total + character.codePointAt(0), 0);
}

const SUBJECT_ASSESSMENT_MODELS = {
  math: new Set([
    "math",
    "arithmetic-balance",
    "algebra-equation",
    "proportional-reasoning",
    "function-graph",
    "geometry-measurement",
    "probability-statistics"
    ,"number-line"
    ,"quadratic-factorization-rectangle"
  ])
};

const SUBJECT_FORBIDDEN_CONTENT = {
  math: /\b(matraz|reactiv|reactor|reaccion quim|molecul|atomo|celul|adn|genetic|ecosistem|mitocond|friccion|gravedad|voltaje|corriente electr|circuito|proyectil|trayectoria balistica)\w*/i,
  physics: /\b(matraz|reactiv|estequiometr|celul|adn|genetic|ecosistem|mitocond)\w*/i,
  chemistry: /\b(celul|adn|genetic|ecosistem|mitocond|proyectil|trayectoria balistica)\w*/i,
  biology: /\b(estequiometr|polinom|ecuacion algebra|proyectil|circuito electr|friccion estatica)\w*/i
};

function normalizeSubjectContent(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isSubjectTextCompatible(subject, value) {
  const forbidden = SUBJECT_FORBIDDEN_CONTENT[subject];
  return !forbidden || !forbidden.test(normalizeSubjectContent(value));
}

function assessmentList(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function assessmentText(assessment = {}) {
  return [
    assessment.context,
    assessment.observationGuide,
    assessment.goal,
    assessment.prompt,
    assessment.feedback,
    assessment.unit,
    ...assessmentList(assessment.options),
    ...assessmentList(assessment.accepted),
    ...assessmentList(assessment.pieces),
    ...assessmentList(assessment.correctSequence),
    ...assessmentList(assessment.segments),
    ...assessmentList(assessment.bases),
    ...assessmentList(assessment.exponents),
    ...assessmentList(assessment.steps),
    ...assessmentList(assessment.correctOrder),
    ...assessmentList(assessment.events).flatMap((event) => [event?.label, event?.title, event?.description]),
    ...assessmentList(assessment.pairs).flatMap((pair) => Array.isArray(pair) ? pair : [pair?.left, pair?.right]),
    ...assessmentList(assessment.compounds).map((compound) => compound?.formula)
  ].filter(Boolean).join(" ");
}

function isAssessmentCompatibleWithSubject(activity, assessment = {}) {
  if (assessment.subject && assessment.subject !== activity.subject) return false;
  const content = assessmentText(assessment);
  if (!isSubjectTextCompatible(activity.subject, content)) return false;
  if (!isQuestionTypeAllowed(activity, assessment.type)) return false;
  if (!isSimpleBiologyNumericAssessment(activity, assessment)) return false;
  if (!isAssessmentDifficultyCompatible(activity, assessment)) return false;
  if (!isCurriculumContentCompatible(activity, content)) return false;
  if (activity.subject === "biology" && /funci[oó]n cuadr[aá]tica|ecuaci[oó]n cuadr[aá]tica|polinom|par[aá]bola|factoriz|binomio|trinomio|despeja(?:r)?\s+x|x[²2]\s*[+\-]/i.test(content)) return false;
  if (activity.subject === "math" && assessment.modelId) {
    return SUBJECT_ASSESSMENT_MODELS.math.has(String(assessment.modelId));
  }
  return true;
}

function enforceActivitySubjectContract(activity) {
  if (activity.subject !== "math") return activity;
  const topic = String(activity.topic || "Matemáticas");
  const template = resolveTopicTemplate("math", topic);
  const contaminatedTopLevel = !isSubjectTextCompatible("math", [
    activity.title,
    activity.subtitle,
    activity.mission,
    activity.scientificPrinciple,
    activity.challenge?.targetLabel,
    visibleLearningGuideText(activity.learningGuide || {})
  ].join(" "));
  activity.subject = "math";
  activity.simulationType = template.type;
  activity.variant = template.variant;
  activity.controls = structuredClone(CONTROL_PRESETS[template.type] || CONTROL_PRESETS.math);
  activity.simulator = {
    ...(activity.simulator || {}),
    modelId: template.variant,
    formula: STEM_MODEL_REGISTRY[template.variant]?.formula || "Relación matemática",
    values: {}
  };
  if (contaminatedTopLevel) {
    activity.title = `${topic}: desafío matemático`;
    activity.subtitle = "Razonamiento matemático interactivo";
    activity.mission = `Resuelve, representa y comprueba relaciones matemáticas del tema ${topic}.`;
    activity.scientificPrinciple = `Las representaciones de ${topic} deben conservar equivalencia, orden y precisión en cada transformación.`;
    activity.actionLabel = "Comprobar solución";
    activity.successMessage = "¡Relación matemática comprobada!";
    activity.coachTips = [
      "Identifica los datos y la operación requerida.",
      "Conserva la equivalencia en cada paso.",
      "Comprueba el resultado sustituyendo los valores."
    ];
    activity.challenge = {
      ...(activity.challenge || {}),
      targetLabel: "Solución matemática",
      targetValue: 1,
      tolerance: 0
    };
    activity.learningGuide = null;
  }
  return activity;
}

function reconcileSubjectAssessments(activity, candidates = []) {
  const expectedCount = Math.max(1, Number(activity.levelCount || 3))
    * Math.max(1, Number(activity.questionsPerLevel || 3));
  if (activity.gameMode === "simulator") return [];
  const reconciled = Array.from({ length: expectedCount }, (_, index) => {
    const candidate = candidates[index];
    if (candidate && isAssessmentCompatibleWithSubject(activity, candidate)) {
      const normalized = normalizeAssessmentSchema(structuredClone(candidate));
      const hasUsableProcedure = normalized.type !== "sequence-order"
        || (normalized.steps.length >= 2
          && normalized.correctOrder.length === normalized.steps.length
          && !normalized.steps.some((step) => /^\[object Object\]$/i.test(step)));
      if (hasUsableProcedure) {
        normalized.subject = activity.subject;
        if (activity.subject === "math") {
          normalized.modelId = SUBJECT_ASSESSMENT_MODELS.math.has(String(normalized.modelId))
            ? normalized.modelId
            : resolveTopicTemplate("math", activity.topic).variant;
        }
        return normalized;
      }
    }
    const fallback = normalizeAssessmentSchema(buildStructuredFallbackAssessment(activity, index));
    fallback.subject = activity.subject;
    return fallback;
  });
  return shuffleMultipleChoiceOptions(reconciled);
}

function tokenizeEquationExpression(value) {
  return String(value || "")
    .replace(/[−–—]/g, "-")
    .match(/[^\s=+\-×·÷*/]+|[=+\-×·÷*/]/g)?.map((token) => token.trim()).filter(Boolean) || [];
}

function canonicalEquationToken(value) {
  const token = String(value || "").trim();
  if (/^[-−–—]$/.test(token)) return "−";
  if (/^[\/÷]$/.test(token)) return "÷";
  if (/^[*×∙·]$/.test(token)) return "×";
  return token;
}

function equationSequenceIsValid(sequence) {
  const tokens = assessmentList(sequence).map(String).map((token) => token.trim()).filter(Boolean);
  const binaryOperator = /^[+\-×·÷*/]$/;
  const equalsIndex = tokens.indexOf("=");
  return tokens.length >= 3
    && equalsIndex > 0
    && equalsIndex < tokens.length - 1
    && tokens.lastIndexOf("=") === equalsIndex
    && !binaryOperator.test(tokens[0])
    && !binaryOperator.test(tokens[tokens.length - 1]);
}

function equationSequenceFromFeedback(feedback) {
  const match = String(feedback || "").match(/(?:ecuaci[oó]n|f[oó]rmula|relaci[oó]n)\s+correcta\s+(?:es|:)\s*([^.;\n]+)/i);
  const tokens = tokenizeEquationExpression(match?.[1] || "");
  return equationSequenceIsValid(tokens) ? tokens : [];
}

function normalizeAssessmentSchema(source = {}) {
  const assessment = source;
  assessment.context = String(assessment.context || assessment.antecedent || assessment.situation || "");
  assessment.observationGuide = String(assessment.observationGuide || assessment.analysisGuide || assessment.whatToObserve || defaultAssessmentObservationGuide(assessment));
  assessment.given = assessmentList(assessment.given)
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
  assessment.goal = String(assessment.goal || assessment.objective || "");
  if (STRUCTURED_ASSESSMENT_TYPES.has(assessment.type)) {
    assessment.prompt = String(assessment.prompt || "Completa el reto estructurado.");
    assessment.feedback = String(assessment.feedback || "Compara la estructura construida con la relación correcta.");
    assessment.pieces = assessmentList(assessment.pieces).map(canonicalEquationToken);
    assessment.correctSequence = assessmentList(assessment.correctSequence).length ? assessmentList(assessment.correctSequence).map(canonicalEquationToken) : [...assessment.pieces];
    assessment.distractors = assessmentList(assessment.distractors).map(canonicalEquationToken);
    assessment.segments = assessmentList(assessment.segments).map(String);
    assessment.accepted = assessmentList(assessment.accepted).map(String);
    if (assessment.type === "timeline-order") {
      const allowedModes = new Set(["chronology", "process", "ideas"]);
      assessment.timelineMode = allowedModes.has(assessment.timelineMode) ? assessment.timelineMode : "chronology";
      const usedIds = new Set();
      assessment.events = assessmentList(assessment.events).slice(0, 8).map((event, index) => {
        const source = event && typeof event === "object" ? event : { title: String(event || "") };
        const baseId = String(source.id || `timeline-${index + 1}-${assessmentHash(`${source.label || ""}-${source.title || ""}`).toString(36)}`).trim();
        let id = baseId || `timeline-${index + 1}`;
        while (usedIds.has(id)) id = `${baseId || "timeline"}-${index + 1}`;
        usedIds.add(id);
        return { id, label: String(source.label || "").trim(), title: String(source.title || "").trim(), description: String(source.description || "").trim() };
      });
      const eventById = new Map(assessment.events.map((event) => [event.id, event]));
      const suppliedOrder = assessmentList(assessment.correctOrder).map(String).filter((id, index, all) => eventById.has(id) && all.indexOf(id) === index);
      assessment.correctOrder = suppliedOrder.length === assessment.events.length ? suppliedOrder : assessment.events.map((event) => event.id);
      assessment.events = assessment.correctOrder.map((id) => eventById.get(id));
    }
    if (assessment.type === "equation-build") {
      const solutionSequence = tokenizeEquationExpression(assessment.solution);
      const feedbackSequence = equationSequenceFromFeedback(assessment.feedback);
      if (!equationSequenceIsValid(assessment.correctSequence)) {
        assessment.correctSequence = (equationSequenceIsValid(solutionSequence)
          ? solutionSequence
          : feedbackSequence).map(canonicalEquationToken);
      }
      if (equationSequenceIsValid(assessment.correctSequence)) {
        assessment.solution = assessment.correctSequence.join(" ");
        const available = [...assessment.pieces, ...assessment.distractors].map(canonicalEquationToken);
        assessment.correctSequence.forEach((token) => {
          if (!available.includes(token)) assessment.pieces.push(token);
        });
      }
    }
    if (assessment.type === "fill-blank") {
      assessment.segments = assessment.segments.map(normalizeFillBlankMarkers);
      const sourceExpression = normalizeFillBlankMarkers(assessment.expression || assessment.formula || assessment.equation || "").trim();
      const blankIndex = assessment.segments.indexOf("___");
      const authoredCopy = assessment.segments.filter((segment) => segment !== "___").join("").replace(/\s+/g, " ").trim();
      const contextCopy = assessment.context.replace(/\s+/g, " ").trim();
      const compactSegments = assessment.segments.join("").replace(/\s+/g, " ").trim();
      const compactPrompt = String(assessment.prompt || "").replace(/[?¿]+$/g, "").replace(/\s+/g, " ").trim();
      const inferredPromptFallback = compactSegments === `${compactPrompt}: ___.`
        || compactSegments === `${compactPrompt}: ___`;
      const legacyContextAtEnd = blankIndex === assessment.segments.length - 1
        && (authoredCopy.length > 220 || (contextCopy && authoredCopy === contextCopy));
      if (legacyContextAtEnd || inferredPromptFallback) assessment.segments = inferredFillBlankSegments(assessment.prompt);
      if (!assessment.segments.includes("___") && sourceExpression.includes("___")) {
        assessment.segments = blankSegmentsFromExpression(sourceExpression);
      }
      if (!assessment.segments.includes("___")) {
        const prompt = String(assessment.prompt || "").trim();
        const target = prompt.match(/(?:valor|resultado|magnitud)\s+de\s+(.+?)[.?!]?$/i)?.[1]?.trim();
        assessment.segments = target
          ? [`El valor de ${target} es `, "___", "."]
          : inferredFillBlankSegments(prompt);
      }
      assessment.segments = assessment.segments
        .flatMap((segment) => String(segment).split(/(___)/))
        .filter((segment) => segment !== "");
      let retainedBlank = false;
      assessment.segments = assessment.segments.filter((segment) => {
        if (segment !== "___") return true;
        if (retainedBlank) return false;
        retainedBlank = true;
        return true;
      });
      if (!assessment.accepted.length && assessment.answer != null) {
        assessment.accepted = assessmentList(assessment.answer).map(String);
      }
    }
    assessment.bases = assessmentList(assessment.bases).map(String);
    assessment.exponents = assessmentList(assessment.exponents).map(String);
    assessment.correctExponents = assessmentList(assessment.correctExponents).map(String);
    assessment.compounds = assessmentList(assessment.compounds).map((compound) => ({
      formula: String(compound?.formula || ""),
      side: compound?.side === "product" ? "product" : "reactant"
    }));
    assessment.correctCoefficients = assessmentList(assessment.correctCoefficients)
      .map((value) => Math.max(1, Number(value) || 1));
    assessment.correctValue = Number(assessment.correctValue ?? assessment.answer ?? 0);
    assessment.tolerance = Math.max(0, Number(assessment.tolerance ?? .01));
    assessment.unit = String(assessment.unit || "");
    if (assessment.type === "number-line-placement") {
      assessment.min = Math.max(-20, Number(assessment.min ?? -20));
      assessment.max = Math.min(20, Number(assessment.max ?? 20));
      if (assessment.max <= assessment.min) assessment.max = assessment.min + 1;
      assessment.denominator = Math.max(1, Math.min(10, Math.round(Number(assessment.denominator ?? 1))));
      assessment.step = 1 / assessment.denominator;
      assessment.targetValue = Math.max(assessment.min, Math.min(assessment.max, Number(assessment.targetValue ?? assessment.correctValue ?? 0)));
      assessment.startValue = Math.max(assessment.min, Math.min(assessment.max, Number(assessment.startValue ?? 0)));
      assessment.correctValue = assessment.targetValue;
      assessment.tolerance = Math.max(0, Number(assessment.tolerance ?? assessment.step / 3));
    }
    assessment.axes = {
      x: String(assessment.axes?.x || "x"),
      y: String(assessment.axes?.y || "y"),
      xMin: Number(assessment.axes?.xMin ?? -5),
      xMax: Number(assessment.axes?.xMax ?? 5),
      yMin: Number(assessment.axes?.yMin ?? -5),
      yMax: Number(assessment.axes?.yMax ?? 5)
    };
    assessment.targetPoints = assessmentList(assessment.targetPoints)
      .map((point) => ({ x: Number(point?.x || 0), y: Number(point?.y || 0) }));
    const procedureSequence = normalizeProcedureSequence(assessment.steps, assessment.correctOrder);
    assessment.steps = procedureSequence.steps;
    assessment.correctOrder = procedureSequence.correctOrder;
    assessment.gameplay = { ...(assessment.gameplay || {}), mechanic: STRUCTURED_MECHANICS[assessment.type] };
    return assessment;
  }
  if (assessment.type === "multiple" || assessment.type === "image-multiple") {
    const optionObjects = Array.isArray(assessment.options) ? assessment.options : [];
    const markedIndexes = optionObjects.reduce((indexes, option, index) => {
      if (option && typeof option === "object" && (option.correct === true || option.isCorrect === true)) indexes.push(index);
      return indexes;
    }, []);
    assessment.options = optionObjects.map((option) => typeof option === "object"
      ? String(option.text ?? option.label ?? option.value ?? "")
      : String(option));
    const rawCorrect = assessment.correct ?? assessment.correctIndex ?? assessment.correctAnswer ?? assessment.answer;
    const explicitCorrectAnswers = assessmentList(assessment.correctAnswers ?? assessment.correctIndices)
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0 && index < assessment.options.length);
    let correctIndex = markedIndexes[0] ?? -1;
    if (correctIndex < 0 && Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < assessment.options.length) {
      correctIndex = rawCorrect;
    }
    if (correctIndex < 0 && typeof rawCorrect === "string") {
      const normalized = normalizeAnswer(rawCorrect);
      const letterIndex = /^[a-z]$/i.test(rawCorrect.trim()) ? rawCorrect.trim().toUpperCase().charCodeAt(0) - 65 : -1;
      const numericIndex = /^\d+$/.test(rawCorrect.trim()) ? Number(rawCorrect.trim()) : -1;
      correctIndex = assessment.options.findIndex((option) => normalizeAnswer(option) === normalized);
      if (correctIndex < 0 && letterIndex >= 0 && letterIndex < assessment.options.length) correctIndex = letterIndex;
      if (correctIndex < 0 && numericIndex >= 0 && numericIndex < assessment.options.length) correctIndex = numericIndex;
      if (correctIndex < 0 && numericIndex > 0 && numericIndex <= assessment.options.length) correctIndex = numericIndex - 1;
    }
    assessment.correctAnswers = [...new Set(explicitCorrectAnswers.length ? explicitCorrectAnswers : (markedIndexes.length ? markedIndexes : [correctIndex >= 0 ? correctIndex : 0]))].sort((a, b) => a - b);
    assessment.correct = assessment.correctAnswers[0];
    if (assessment.type === "image-multiple") {
      assessment.visual = {
        ...(assessment.visual || {}),
        target: String(assessment.visual?.target || assessment.options[assessment.correct] || "").trim(),
        imagePrompt: String(assessment.visual?.imagePrompt || "").trim(),
        alt: String(assessment.visual?.alt || "Ilustración científica con una flecha que señala el elemento de la pregunta.").trim(),
        imageDataUrl: String(assessment.visual?.imageDataUrl || "").trim(),
        imageUrl: String(assessment.visual?.imageUrl || "").trim(),
        imageSrc: String(assessment.visual?.imageSrc || "").trim()
      };
    }
  }
  if (assessment.type === "keyword") {
    const rawAccepted = assessment.accepted
      ?? assessment.acceptedAnswers
      ?? assessment.keywords
      ?? assessment.answers
      ?? assessment.correctAnswer
      ?? assessment.answer;
    assessment.accepted = (Array.isArray(rawAccepted) ? rawAccepted : [rawAccepted])
      .flatMap((value) => String(value ?? "").split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    if (!assessment.accepted.length) assessment.accepted = ["ciencia"];
  }
  if (assessment.type === "matching") {
    assessment.pairs = (assessment.pairs || assessment.matches || []).map((pair) => Array.isArray(pair)
      ? [String(pair[0] ?? ""), String(pair[1] ?? "")]
      : [String(pair?.left ?? pair?.term ?? pair?.concept ?? ""), String(pair?.right ?? pair?.definition ?? pair?.match ?? "")])
      .filter(([left, right]) => left && right);
  }
  return assessment;
}

function buildStructuredFallbackAssessment(activity, index = 0) {
  const curriculumProfile = curriculumProfileFor(activity.subject, activity.topic);
  const curatedAssessment = buildCuratedProfileAssessment(curriculumProfile, index);
  if (curatedAssessment
    && isQuestionTypeAllowed(activity, curatedAssessment.type)
    && isSimpleBiologyNumericAssessment(activity, curatedAssessment)) {
    return normalizeAssessmentSchema(curatedAssessment);
  }
  const subject = activity.subject;
  const modelId = subject === "math"
    ? resolveTopicTemplate("math", activity.topic).variant
    : activity.simulationType;
  const common = { feedback: activity.scientificPrinciple, modelId };
  if (subject === "math" && modelId === "number-line") {
    const variants = [
      { prompt: "Ubica −3/2 en la recta numérica.", context: "Los números negativos quedan a la izquierda de cero.", given: ["Denominador: 2"], goal: "Representa el valor exacto.", targetValue: -1.5, startValue: 0, denominator: 2 },
      { prompt: "Parte de −2 y desplázate 7/4 a la derecha. Ubica la posición final.", context: "Un desplazamiento positivo avanza hacia valores mayores.", given: ["−2 + 7/4"], goal: "Calcula y coloca el resultado.", targetValue: -.25, startValue: -2, denominator: 4 },
      { prompt: "Ubica el número que es mayor que 1.2 por tres décimos.", context: "La distancia entre marcas consecutivas es 0.1.", given: ["1.2 + 0.3"], goal: "Compara decimales y coloca el punto.", targetValue: 1.5, startValue: 1.2, denominator: 10 },
      { prompt: "Ubica el punto cuya distancia a cero es 5/3 y está a la izquierda.", context: "El valor absoluto mide distancia; el lado izquierdo determina el signo negativo.", given: ["|x| = 5/3", "x < 0"], goal: "Coloca el valor racional correcto.", targetValue: -5 / 3, startValue: 0, denominator: 3 }
    ];
    return normalizeAssessmentSchema({ ...common, type: "number-line-placement", min: -20, max: 20, ...variants[index % variants.length], feedback: "La posición, el signo y la distancia entre marcas determinan el valor en la recta numérica." });
  }
  if (subject === "biology") {
    const topic = String(activity.topic || "el proceso biológico");
    const experience = String(activity.experiencePrompt || activity.mission || `una observación de ${topic}`);
    const context = `En la experiencia ${experience}, el grupo observa únicamente el tema ${topic}.`;
    const variants = [
      { type: "multiple", prompt: `¿Qué observación corresponde a ${topic}?`, options: [`Una evidencia directa de ${topic}`, "Una conclusión sin observar", "Un cálculo ajeno al tema", "Una explicación de otra materia"], correct: 0 },
      { type: "matching", prompt: `Relaciona las partes básicas de ${topic}.`, pairs: [["Estructura", "Parte observable"], ["Función", "Tarea que realiza"], ["Evidencia", "Dato que apoya la explicación"]] },
      { type: "keyword", prompt: "Escribe el tema biológico central de la experiencia.", accepted: [topic] },
      { type: "fill-blank", prompt: "Completa la idea principal.", segments: ["La observación se relaciona con ", "___", "."], accepted: [topic] },
      { type: "sequence-order", prompt: `Ordena una observación sencilla de ${topic}.`, steps: ["Observar", "Identificar", "Registrar", "Explicar"], correctOrder: ["Observar", "Identificar", "Registrar", "Explicar"] },
      { type: "timeline-order", prompt: `Ordena la progresión observada en ${topic}.`, timelineMode: "process", events: [
        { id: `bio-${index}-observe`, title: "Observar", description: "Mira el organismo o la estructura." },
        { id: `bio-${index}-identify`, title: "Identificar", description: "Reconoce la característica relevante." },
        { id: `bio-${index}-record`, title: "Registrar", description: "Anota la evidencia encontrada." }
      ], correctOrder: [`bio-${index}-observe`, `bio-${index}-identify`, `bio-${index}-record`] },
      { type: "numeric-answer", prompt: "Se observan 4 muestras y se agregan 3 muestras. ¿Cuántas hay en total?", correctValue: 7, tolerance: 0, unit: "muestras" }
    ];
    return normalizeAssessmentSchema({ ...common, ...variants[index % variants.length], context, feedback: `La respuesta se obtiene observando ${topic} dentro de la experiencia indicada.` });
  }
  if (subject === "chemistry") {
    const atomicTopic = /atomo|proton|neutron|electron|numero atomico|isotopo|ion(?:es)?/.test(normalizeAnswer(activity.topic));
    const variants = atomicTopic ? [
      { type: "numeric-answer", prompt: "Un átomo tiene 8 protones. ¿Cuál es su número atómico?", correctValue: 8, tolerance: 0, unit: "" },
      { type: "matching", prompt: "Relaciona cada partícula con su propiedad.", pairs: [["Protón", "Carga positiva; núcleo"], ["Neutrón", "Sin carga; núcleo"], ["Electrón", "Carga negativa; nube electrónica"]] },
      { type: "numeric-answer", prompt: "Un átomo tiene 6 protones y 8 neutrones. ¿Cuál es su número de masa A?", correctValue: 14, tolerance: 0, unit: "" },
      { type: "numeric-answer", prompt: "Una especie tiene 11 protones y 10 electrones. ¿Cuál es su carga neta?", correctValue: 1, tolerance: 0, unit: "e" },
      { type: "fill-blank", prompt: "Completa el concepto.", segments: ["Los átomos del mismo elemento con diferente número de neutrones son ", "___", "."], accepted: ["isótopos", "isotopos"] }
    ] : [
      { type: "chemical-balance", prompt: "Balancea la formación de agua conservando todos los átomos.", compounds: [{ formula: "H₂", side: "reactant" }, { formula: "O₂", side: "reactant" }, { formula: "H₂O", side: "product" }], correctCoefficients: [2, 1, 2] },
      { type: "equation-build", prompt: "Construye la relación para calcular concentración molar.", pieces: ["C", "=", "n", "/", "V"], correctSequence: ["C", "=", "n", "/", "V"] },
      { type: "numeric-answer", prompt: "Calcula la concentración de 2 mol en 0.5 L.", correctValue: 4, tolerance: .01, unit: "mol/L" },
      { type: "exponent-placement", prompt: "Completa la notación del número de Avogadro.", bases: ["6.022 × 10"], exponents: ["21", "22", "23"], correctExponents: ["23"] },
      { type: "sequence-order", prompt: "Ordena el procedimiento seguro para preparar una disolución.", steps: ["Medir el soluto", "Disolver parcialmente", "Aforar al volumen", "Homogeneizar"], correctOrder: ["Medir el soluto", "Disolver parcialmente", "Aforar al volumen", "Homogeneizar"] }
    ];
    return normalizeAssessmentSchema({ ...common, ...variants[index % variants.length] });
  }
  if (subject === "physics") {
    const variants = [
      { type: "equation-build", prompt: "Construye la segunda ley de Newton.", pieces: ["F", "=", "m", "·", "a"], correctSequence: ["F", "=", "m", "·", "a"] },
      { type: "exponent-placement", prompt: "Coloca el exponente correcto en la ecuación cinemática.", bases: ["v"], exponents: ["1", "2", "3"], correctExponents: ["2"] },
      { type: "numeric-answer", prompt: "Calcula la aceleración de 20 N aplicados a 4 kg.", correctValue: 5, tolerance: .01, unit: "m/s²" },
      { type: "graph-plot", prompt: "Marca dos puntos de una velocidad que aumenta 2 m/s cada segundo.", axes: { x: "t (s)", y: "v (m/s)", xMin: 0, xMax: 5, yMin: 0, yMax: 10 }, targetPoints: [{ x: 1, y: 2 }, { x: 4, y: 8 }], tolerance: .65 },
      { type: "fill-blank", prompt: "Completa la expresión de energía potencial.", segments: ["Ep", "=", "m", "·", "g", "·", "___"], accepted: ["h", "altura"] },
      { type: "equation-build", prompt: "Construye la relación de fuerza neta sobre un trineo.", pieces: ["Fₙₑₜ", "=", "Fₘ", "−", "Fᵣ"], correctSequence: ["Fₙₑₜ", "=", "Fₘ", "−", "Fᵣ"] },
      { type: "numeric-answer", prompt: "Una fuerza neta de 30 N produce 3 m/s². ¿Cuál es la masa?", correctValue: 10, tolerance: .01, unit: "kg" },
      { type: "fill-blank", prompt: "Completa la expresión de energía cinética.", segments: ["Ec", "=", "½", "·", "m", "·", "___"], accepted: ["v²", "v2"] },
      { type: "graph-plot", prompt: "Marca dos puntos de un móvil que avanza 4 m cada segundo.", axes: { x: "t (s)", y: "d (m)", xMin: 0, xMax: 5, yMin: 0, yMax: 20 }, targetPoints: [{ x: 1, y: 4 }, { x: 3, y: 12 }], tolerance: .65 },
      { type: "sequence-order", prompt: "Ordena el análisis de un cambio de movimiento.", steps: ["Identificar las fuerzas", "Calcular la fuerza neta", "Aplicar F = m · a", "Interpretar la aceleración"], correctOrder: ["Identificar las fuerzas", "Calcular la fuerza neta", "Aplicar F = m · a", "Interpretar la aceleración"] }
    ];
    return normalizeAssessmentSchema({ ...common, ...variants[index % variants.length] });
  }
  const mathTopic = normalizeAnswer(activity.topic);
  const isPolynomialTopic = /polinom|terminos semejantes|producto notable|factor/.test(mathTopic);
  const variants = isPolynomialTopic
    ? [
      {
        type: "equation-build",
        context: "Una placa rectangular tiene lados (x + 2) y (x + 3). Su área debe escribirse como un polinomio desarrollado.",
        given: ["Largo: x + 3", "Ancho: x + 2", "Área: largo × ancho"],
        goal: "Desarrolla el producto y conserva todos los términos.",
        prompt: "Construye el polinomio que representa el área de la placa.",
        pieces: ["P(x)", "=", "x²", "+", "5x", "+", "6"],
        correctSequence: ["P(x)", "=", "x²", "+", "5x", "+", "6"],
        distractors: ["x³", "6x", "−", "5"],
        feedback: "(x + 2)(x + 3) = x² + 5x + 6 al aplicar la propiedad distributiva."
      },
      {
        type: "numeric-answer",
        context: "El polinomio P(x) = x² + 5x + 6 representa el área de una placa ajustable.",
        given: ["x = 2", "P(x) = x² + 5x + 6"],
        goal: "Sustituye x y calcula el área.",
        prompt: "¿Cuál es el valor de P(2)?",
        correctValue: 20,
        tolerance: 0,
        unit: "u²",
        feedback: "P(2) = 2² + 5(2) + 6 = 4 + 10 + 6 = 20."
      },
      {
        type: "exponent-placement",
        context: "Al multiplicar potencias de la misma base se suman sus exponentes.",
        given: ["x² · x³ = xⁿ"],
        goal: "Determina el valor de n.",
        prompt: "Coloca el exponente resultante.",
        bases: ["x"],
        exponents: ["4", "5", "6", "9"],
        correctExponents: ["5"],
        feedback: "x² · x³ = x²⁺³ = x⁵."
      },
      {
        type: "fill-blank",
        context: "Dos términos semejantes tienen la misma variable y el mismo exponente.",
        given: ["3x² + 4x²"],
        goal: "Suma únicamente los coeficientes.",
        prompt: "Completa la reducción de términos semejantes.",
        segments: ["3x²", "+", "4x²", "=", "___"],
        accepted: ["7x²", "7x2"],
        feedback: "3x² + 4x² = (3 + 4)x² = 7x²."
      },
      {
        type: "sequence-order",
        context: "Para desarrollar (x + 2)(x + 3) se distribuye cada término del primer binomio.",
        given: ["Producto: (x + 2)(x + 3)"],
        goal: "Ordena el procedimiento hasta obtener la forma reducida.",
        prompt: "Ordena los pasos para desarrollar el producto.",
        steps: ["Multiplicar x por x + 3", "Multiplicar 2 por x + 3", "Sumar x² + 3x + 2x + 6", "Reducir a x² + 5x + 6"],
        correctOrder: ["Multiplicar x por x + 3", "Multiplicar 2 por x + 3", "Sumar x² + 3x + 2x + 6", "Reducir a x² + 5x + 6"],
        feedback: "La distributiva produce cuatro términos y después se reducen los semejantes."
      }
    ]
    : [
      {
        type: "equation-build",
        context: "Un servicio cobra una cuota fija de 3 y 2 por cada recorrido. El total registrado fue 11.",
        given: ["Costo por recorrido: 2", "Cuota fija: 3", "Total: 11"],
        goal: "Representa la situación con una ecuación de primer grado.",
        prompt: "Construye la ecuación que permite calcular el número de recorridos.",
        pieces: ["2x", "+", "3", "=", "11"],
        correctSequence: ["2x", "+", "3", "=", "11"],
        distractors: ["−", "8", "3x"],
        feedback: "El costo variable es 2x, se suma la cuota fija 3 y el total debe ser 11."
      },
      {
        type: "numeric-answer",
        context: "El costo total de un servicio se modela con 2x + 3 = 11.",
        given: ["2x + 3 = 11"],
        goal: "Despeja x para encontrar el número de recorridos.",
        prompt: "¿Cuál es el valor de x?",
        correctValue: 4,
        tolerance: 0,
        unit: "recorridos",
        feedback: "Al restar 3 se obtiene 2x = 8; al dividir entre 2, x = 4."
      },
      { type: "exponent-placement", context: "Se multiplican dos potencias con la misma base.", given: ["x² · x³ = xⁿ"], goal: "Suma los exponentes.", prompt: "Coloca el exponente resultante.", bases: ["x"], exponents: ["4", "5", "6"], correctExponents: ["5"] },
      { type: "graph-plot", context: "Una relación lineal comienza en 1 y aumenta 2 unidades por cada avance en x.", given: ["y = 2x + 1"], goal: "Representa dos pares ordenados de la función.", prompt: "Coloca dos puntos de la recta y = 2x + 1.", axes: { x: "x", y: "y", xMin: -2, xMax: 4, yMin: -3, yMax: 9 }, targetPoints: [{ x: 0, y: 1 }, { x: 2, y: 5 }], tolerance: .55 },
      { type: "sequence-order", context: "Debes conservar la igualdad mientras despejas la incógnita.", given: ["2x + 3 = 11"], goal: "Aplica la misma operación en ambos lados.", prompt: "Ordena los pasos para despejar x.", steps: ["Restar 3 en ambos lados", "Simplificar a 2x = 8", "Dividir ambos lados entre 2", "Obtener x = 4"], correctOrder: ["Restar 3 en ambos lados", "Simplificar a 2x = 8", "Dividir ambos lados entre 2", "Obtener x = 4"] },
      { type: "fill-blank", context: "En un triángulo rectángulo, los catetos y la hipotenusa cumplen una relación fija.", given: ["Catetos: a y b", "Hipotenusa: c"], goal: "Completa el teorema de Pitágoras.", prompt: "Completa la igualdad.", segments: ["a²", "+", "b²", "=", "___"], accepted: ["c²", "c2"] }
    ];
  return normalizeAssessmentSchema({ ...common, ...variants[index % variants.length] });
}

const QUESTION_ANIMATION_VARIANTS = {
  atomic: ["atomic-builder", "isotope-lab", "ion-charge"],
  friction: ["force", "balance", "surface"],
  projectile: ["trajectory", "gravity", "launch"],
  circuit: ["circuit-flow", "resistance", "voltage"],
  particles: ["reaction", "diffusion", "phase-change"],
  thermal: ["heat-transfer", "temperature-curve", "thermal-balance"],
  ecosystem: ["ecosystem-flow", "population", "resources"],
  energy: ["energy-transfer", "work", "power"],
  fluid: ["pressure", "buoyancy", "flow"],
  wave: ["wave", "frequency", "amplitude"],
  optics: ["refraction", "reflection", "spectrum"],
  cell: ["replication", "transport", "cell-energy", "division", "organelles"]
};

function buildQuestionAnimationProfile(activity, assessment, offset = 0) {
  const simulationType = activity.simulationType || "friction";
  const text = normalizeAnswer([
    assessment?.prompt,
    ...(assessment?.options || []),
    ...(assessment?.accepted || []),
    ...(assessment?.pairs || []).flat()
  ].join(" "));
  const semanticRules = [
    [/adn|gen|cromosom|nucleo|nucleotid|base nitrogenada/, "replication"],
    [/membrana|intercambio|difusion|osmosis|transport/, simulationType === "cell" ? "transport" : "diffusion"],
    [/atp|mitocond|energia celular|respiracion celular/, "cell-energy"],
    [/mitosis|meiosis|division celular/, "division"],
    [/organelo|organulo|ribosoma|cloroplast/, "organelles"],
    [/trayectoria|proyectil|angulo|lanzamiento/, "trajectory"],
    [/gravedad|caida/, "gravity"],
    [/voltaje|corriente|carga electrica/, "circuit-flow"],
    [/resistencia electrica|ohm/, "resistance"],
    [/reaccion|molecula|enlace|colision/, "reaction"],
    [/temperatura|estado de la materia|fusion|evapor/, "phase-change"],
    [/ecosistema|cadena alimentaria|poblacion/, "ecosystem-flow"],
    [/presion|pascal/, "pressure"],
    [/flot|arquimedes|empuje/, "buoyancy"],
    [/onda|frecuencia|amplitud|sonido/, "wave"],
    [/refraccion|indice|prisma/, "refraction"],
    [/reflexion|rebota/, "reflection"],
    [/friccion|fuerza|movimiento|inercia/, "force"],
    [/energia|trabajo|potencia/, "energy-transfer"]
  ];
  const matchedVariant = semanticRules.find(([pattern]) => pattern.test(text))?.[1];
  const variants = QUESTION_ANIMATION_VARIANTS[simulationType] || QUESTION_ANIMATION_VARIANTS.friction;
  return {
    variant: matchedVariant || variants[offset % variants.length],
    sequence: offset % 4,
    gameplay: offset % 2 ? "handheld" : "platform",
    concept: cleanVisualConfigurationReferences(assessment?.prompt || activity.topic)
  };
}

function resolveExperimentModelId(activity, assessment = {}, offset = 0) {
  const questionsPerLevel = Math.max(1, Number(activity.questionsPerLevel || 3));
  const levelIndex = Math.floor(offset / questionsPerLevel);
  const level = activity.learningGuide?.levels?.[levelIndex] || {};
  const subject = normalizeAnswer(activity.subject);
  const levelText = normalizeAnswer([
    activity.simulationType,
    activity.topic,
    activity.mission,
    activity.scientificPrinciple,
    level.title,
    level.objective,
    level.narrative,
    level.hint
  ].filter(Boolean).join(" "));
  const questionText = normalizeAnswer([
    assessment.prompt,
    ...(assessment.options || []),
    ...(assessment.accepted || []),
    ...(assessment.pairs || []).flat()
  ].filter(Boolean).join(" "));
  const explicit = assessment.experiment?.modelId;
  const combined = `${levelText} ${questionText}`;

  if (subject === "physics" || subject.includes("fisica")) {
    if (/fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(levelText)) return "braking-motion";
    if (/gravedad|caida libre|caer|peso gravitatorio/.test(levelText)) return "gravity-fall";
    if (/movimiento circular|fuerza centripeta|aceleracion centripeta|velocidad angular|plataforma giratoria|rotacion|orbita circular/.test(combined)) return "circular-motion";
    if (/proyectil|movimiento parabolico|trayectoria parabolica|lanzamiento|alcance|angulo de tiro/.test(combined)) return "projectile-motion";
    if (/circuit|electric|ley de ohm|voltaje|corriente/.test(combined)) return "ohm-circuit";
    if (/onda|sonido|frecuencia|longitud de onda/.test(combined)) return "wave-motion";
    if (/optic|luz|refrac|reflexion|prisma/.test(combined)) return "optics-refraction";
    if (/fluido|presion|pascal|arquimedes|flotacion/.test(combined)) return "fluid-pressure";
    if (/energia mecanica|energia potencial|energia cinetica|trabajo|potencia/.test(combined)) return "energy-work";
    return "newton-motion";
  }
  if (subject === "chemistry" || subject.includes("quimica")) {
    if (/atomo|proton|neutron|electron|numero atomico|isotopo|(?:^|\s)ion(?:es)?(?:\s|$)/.test(combined)) return "atomic-structure";
    if (/estequ|(?:^|\s)mol(?:\s|$)|reactivo limitante|proporcion quimica/.test(combined)) return "stoichiometry";
    if (/disol|concentr|molaridad|(?:^|\s)ph(?:\s|$)|acido|base/.test(combined)) return "solution-concentration";
    return "particle-collision";
  }
  if (subject === "biology" || subject.includes("biologia")) {
    if (/(?:^|\s)(?:gen|genes|genetica)(?:\s|$)|herencia|(?:^|\s)adn(?:\s|$)|(?:^|\s)arn(?:\s|$)|alelo|cromosom/.test(combined)) return "genetics-probability";
    if (/ecosistema|ecolog|poblac|cadena alimentaria|biodiversidad/.test(combined)) return "ecosystem-balance";
    if (/respiracion celular|(?:^|\s)atp(?:\s|$)|fotosint/.test(combined)) return "cell-energy";
    return "cell-transport";
  }

  if (/fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(levelText)) return "braking-motion";
  if (/gravedad|caida libre|caer|peso gravitatorio/.test(levelText)) return "gravity-fall";
  if (/movimiento circular|fuerza centripeta|aceleracion centripeta|velocidad angular|plataforma giratoria|rotacion|orbita circular/.test(combined)) return "circular-motion";
  if (/proyectil|movimiento parabolico|trayectoria parabolica|lanzamiento|alcance|angulo de tiro/.test(combined)) return "projectile-motion";
  if (/circuit|electric|ohm|voltaje|corriente/.test(combined)) return "ohm-circuit";
  if (/onda|sonido|frecuencia|longitud de onda/.test(combined)) return "wave-motion";
  if (/optic|luz|refrac|reflexion|prisma/.test(combined)) return "optics-refraction";
  if (/fluido|presion|pascal|arquimedes|flotacion/.test(combined)) return "fluid-pressure";
  if (/energia mecanica|energia potencial|trabajo|potencia/.test(combined)) return "energy-work";
  if (/(?:^|\s)(?:gen|genes|genetica)(?:\s|$)|herencia|(?:^|\s)adn(?:\s|$)|(?:^|\s)arn(?:\s|$)|alelo|cromosom/.test(combined)) return "genetics-probability";
  if (/ecosistema|ecolog|poblac|cadena alimentaria|biodiversidad/.test(combined)) return "ecosystem-balance";
  if (/respiracion celular|atp|fotosint/.test(combined)) return "cell-energy";
  if (/celula|membrana|osmosis|transporte celular|difusion/.test(combined)) return "cell-transport";
  if (/estequ|mol|reactivo limitante|proporcion quimica/.test(combined)) return "stoichiometry";
  if (/disol|concentr|molaridad|ph|acido|base/.test(combined)) return "solution-concentration";
  if (/atomo|proton|neutron|electron|numero atomico|isotopo|(?:^|\s)ion(?:es)?(?:\s|$)/.test(combined)) return "atomic-structure";
  if (/reaccion|molecula|enlace|colision|temperatura/.test(combined) || subject.includes("quim")) return "particle-collision";
  if (/fuerza|friccion|rozamiento|inercia|movimiento|velocidad|aceleracion/.test(combined)) return "newton-motion";
  return SCIENCE_EXPERIMENT_PRESETS[explicit] ? explicit : "newton-motion";
}

function buildQuestionGameplayProfile(activity, assessment, offset = 0) {
  const modelId = resolveExperimentModelId(activity, assessment, offset);
  const mechanic = assessment.type === "matching"
    ? "carry-match"
    : assessment.type === "keyword"
      ? "word-forge"
      : modelId === "braking-motion"
        ? "braking-run"
      : modelId === "gravity-fall"
        ? "gravity-drop"
      : modelId === "circular-motion"
        ? "circular-orbit"
      : modelId === "projectile-motion"
        ? "projectile-target"
        : modelId === "ohm-circuit"
          ? "circuit-route"
          : ["ecosystem-balance", "cell-energy", "cell-transport"].includes(modelId)
            ? "resource-balance"
            : "answer-zones";
  return { mechanic, modelId, sequence: offset % 4 };
}

const SCIENCE_EXPERIMENT_PRESETS = Object.freeze({
  "atomic-structure": {
    interaction: "assemble-atom", objective: { metric: "atomicIdentity", operator: "equals", target: 6, tolerance: 0 },
    correct: { protons: 6, neutrons: 6, electrons: 6 }, incorrect: { protons: 6, neutrons: 8, electrons: 5 }
  },
  "braking-motion": {
    interaction: "drive-and-brake", objective: { metric: "stoppingDistance", operator: "lessThan", target: 25, tolerance: .5 },
    inputs: ["initialVelocity", "brakeForce", "friction", "mass", "obstacleDistance"],
    measurements: ["acceleration", "stoppingDistance", "finalVelocity"],
    formula: ["Fnet = -(Fbrake + Ffriction)", "a = Fnet / mass", "vf² = vi² + 2ad"],
    correct: { initialVelocity: 20, brakeForce: 8200, friction: 800, mass: 1000, obstacleDistance: 25 },
    incorrect: { initialVelocity: 20, brakeForce: 2400, friction: 400, mass: 1000, obstacleDistance: 25 }
  },
  "gravity-fall": {
    interaction: "drop-object", objective: { metric: "fallTime", operator: "lessThan", target: 5, tolerance: .1 },
    inputs: ["height", "gravity", "mass"],
    measurements: ["fallTime", "impactVelocity", "acceleration"],
    formula: ["h = 1/2·g·t²", "t = √(2h/g)", "v = g·t"],
    correct: { height: 35, gravity: 9.81, mass: 10 },
    incorrect: { height: 70, gravity: 3.7, mass: 35 }
  },
  "circular-motion": {
    interaction: "stabilize-orbit", objective: { metric: "stabilityMargin", operator: "greaterThan", target: 0, tolerance: .1 },
    inputs: ["velocity", "radius", "mass", "frictionCoefficient", "gravity"],
    measurements: ["angularVelocity", "centripetalAcceleration", "centripetalForce", "maxStaticFriction", "stabilityMargin"],
    formula: ["ω = v/r", "ac = v²/r", "Fc = m·v²/r", "Ff,max = μs·m·g"],
    correct: { velocity: 6, radius: 8, mass: 12, frictionCoefficient: .7, gravity: 9.81 },
    incorrect: { velocity: 12, radius: 4, mass: 12, frictionCoefficient: .25, gravity: 9.81 }
  },
  "newton-motion": {
    interaction: "push-object", objective: { metric: "acceleration", operator: "greaterThan", target: .2, tolerance: .05 },
    correct: { force: 80, friction: 25, mass: 10 }, incorrect: { force: 24, friction: 52, mass: 18 }
  },
  "projectile-motion": {
    interaction: "launch-projectile", objective: { metric: "range", operator: "greaterThan", target: 18, tolerance: 1 },
    correct: { power: 72, angle: 45, gravity: 9.81 }, incorrect: { power: 22, angle: 82, gravity: 9.81 }
  },
  "ohm-circuit": {
    interaction: "connect-circuit", objective: { metric: "current", operator: "greaterThan", target: 1, tolerance: .05 },
    correct: { voltage: 12, resistance: 6 }, incorrect: { voltage: 3, resistance: 18 }
  },
  "energy-work": {
    interaction: "activate-lift", objective: { metric: "energy", operator: "greaterThan", target: 240, tolerance: 5 },
    correct: { mass: 8, gravity: 9.81, height: 5 }, incorrect: { mass: 2, gravity: 9.81, height: 2 }
  },
  "wave-motion": {
    interaction: "tune-wave", objective: { metric: "speed", operator: "greaterThan", target: 20, tolerance: 1 },
    correct: { frequency: 8, wavelength: 4, amplitude: 3 }, incorrect: { frequency: 2, wavelength: 2, amplitude: 1 }
  },
  "fluid-pressure": {
    interaction: "operate-piston", objective: { metric: "pressure", operator: "greaterThan", target: 8, tolerance: .2 },
    correct: { force: 60, area: 5, density: 1000 }, incorrect: { force: 18, area: 8, density: 500 }
  },
  "optics-refraction": {
    interaction: "redirect-light", objective: { metric: "angle", operator: "between", target: 24, tolerance: 10 },
    correct: { angle: 35, refractiveIndex: 1.45 }, incorrect: { angle: 75, refractiveIndex: 1.05 }
  },
  "particle-collision": {
    interaction: "energize-particles", objective: { metric: "collisionRate", operator: "greaterThan", target: 20, tolerance: 1 },
    correct: { temperature: 420, particleCount: 28 }, incorrect: { temperature: 120, particleCount: 8 }
  },
  stoichiometry: {
    interaction: "combine-reagents", objective: { metric: "product", operator: "greaterThan", target: 1.5, tolerance: .1 },
    correct: { reagentA: 4, reagentB: 3, ratioA: 2, ratioB: 1 }, incorrect: { reagentA: 1, reagentB: 1, ratioA: 4, ratioB: 3 }
  },
  "solution-concentration": {
    interaction: "mix-solution", objective: { metric: "concentration", operator: "between", target: 1, tolerance: .15 },
    correct: { solute: 1, volume: 1 }, incorrect: { solute: .1, volume: 2 }
  },
  "cell-transport": {
    interaction: "transport-particles", objective: { metric: "flux", operator: "absoluteGreaterThan", target: 18, tolerance: 1 },
    correct: { outside: 85, inside: 25, permeability: .6 }, incorrect: { outside: 45, inside: 40, permeability: .1 }
  },
  "cell-energy": {
    interaction: "produce-atp", objective: { metric: "energy", operator: "greaterThan", target: 25, tolerance: 1 },
    correct: { nutrients: 65, oxygen: 65 }, incorrect: { nutrients: 18, oxygen: 70 }
  },
  "ecosystem-balance": {
    interaction: "balance-resources", objective: { metric: "balance", operator: "greaterThan", target: 78, tolerance: 2 },
    correct: { sunlight: 62, water: 60, biodiversity: 56 }, incorrect: { sunlight: 95, water: 20, biodiversity: 12 }
  },
  "genetics-probability": {
    interaction: "select-inheritance", objective: { metric: "probability", operator: "greaterThan", target: .5, tolerance: .02 },
    correct: { dominant: 3, recessive: 1 }, incorrect: { dominant: 1, recessive: 4 }
  }
});

function buildQuestionExperiment(activity, assessment, offset = 0) {
  const gameplay = assessment.gameplay || buildQuestionGameplayProfile(activity, assessment, offset);
  const resolvedModelId = resolveExperimentModelId(activity, assessment, offset);
  const modelId = SCIENCE_EXPERIMENT_PRESETS[resolvedModelId]
    ? resolvedModelId
    : SCIENCE_EXPERIMENT_PRESETS[gameplay.modelId]
      ? gameplay.modelId
      : "newton-motion";
  const template = SCIENCE_EXPERIMENT_PRESETS[modelId];
  const answerCount = ["multiple", "image-multiple"].includes(assessment.type)
    ? Math.max(1, assessment.options?.length || 3)
    : assessment.type === "matching"
      ? Math.max(2, assessment.pairs?.length || 3)
      : 2;
  const correctIndex = ["multiple", "image-multiple"].includes(assessment.type) ? Number(assessment.correct || 0) : 0;
  const existingExperiment = assessment.experiment || {};
  const canReuseExperiment = Number(existingExperiment.schemaVersion) === 2
    && existingExperiment.modelId === modelId;
  const generatedPresets = Array.from({ length: answerCount }, (_, index) =>
    structuredClone(index === correctIndex ? template.correct : template.incorrect)
  );
  return {
    schemaVersion: 2,
    modelId,
    interaction: canReuseExperiment ? existingExperiment.interaction || template.interaction : template.interaction,
    answerPresets: canReuseExperiment
      && Array.isArray(existingExperiment.answerPresets)
      && existingExperiment.answerPresets.length >= answerCount
      ? existingExperiment.answerPresets.slice(0, answerCount)
      : generatedPresets,
    correctPreset: { ...template.correct, ...(canReuseExperiment ? existingExperiment.correctPreset || {} : {}) },
    incorrectPreset: { ...template.incorrect, ...(canReuseExperiment ? existingExperiment.incorrectPreset || {} : {}) },
    objective: { ...template.objective, ...(canReuseExperiment ? existingExperiment.objective || {} : {}) },
    inputs: [...(template.inputs || Object.keys(template.correct))],
    measurements: [...(template.measurements || [template.objective.metric])],
    formula: [...(template.formula || [])]
  };
}

function assessmentMatchesModel(assessment, modelId) {
  const text = normalizeAnswer([
    assessment.prompt,
    ...(assessment.options || []),
    ...(assessment.accepted || []),
    ...(assessment.pairs || []).flat()
  ].filter(Boolean).join(" "));
  if (modelId === "braking-motion") return /fren|deten|desaceler|distancia de parada|distancia de frenado|obstaculo|impacto/.test(text);
  if (modelId === "projectile-motion") return /proyectil|parabolic|trayectoria|lanzamiento|alcance|angulo/.test(text);
  return true;
}

function buildBrakingAssessment(offset, requestedType = "multiple") {
  const variant = offset % 3;
  if (requestedType === "keyword") {
    const keywords = [
      ["Escribe el término para la aceleración opuesta al movimiento que reduce la velocidad.", ["desaceleración"]],
      ["Escribe el nombre de la distancia recorrida desde que se frena hasta detenerse.", ["distancia de frenado", "distancia de detención"]],
      ["Escribe la propiedad que hace que el vehículo se resista a cambiar su movimiento.", ["inercia"]]
    ][variant];
    return normalizeAssessmentSchema({
      type: "keyword",
      prompt: keywords[0],
      accepted: keywords[1],
      feedback: "La prueba relaciona velocidad inicial, fuerza neta, masa y distancia disponible para detener el vehículo."
    });
  }
  if (requestedType === "matching") {
    return normalizeAssessmentSchema({
      type: "matching",
      prompt: "Relaciona cada variable de frenado con su efecto observable.",
      pairs: [
        ["Mayor fuerza de frenado", "Reduce la distancia de detención"],
        ["Mayor masa", "Exige más fuerza para obtener la misma desaceleración"],
        ["Mayor velocidad inicial", "Aumenta la distancia necesaria para detenerse"]
      ],
      feedback: "La distancia de frenado depende de la velocidad inicial y de la desaceleración producida por la fuerza neta."
    });
  }
  const variants = [
    {
      prompt: "¿Qué condición permite detener el vehículo antes del obstáculo?",
      options: ["La distancia de frenado calculada es menor que la distancia al obstáculo", "La masa desaparece durante el frenado", "La velocidad aumenta mientras se aplican los frenos"],
      correct: 0
    },
    {
      prompt: "¿Qué ocurrirá si aumenta la masa y se conserva la misma fuerza de frenado?",
      options: ["La distancia de detención aumentará", "El vehículo se detendrá instantáneamente", "La velocidad inicial dejará de influir"],
      correct: 0
    },
    {
      prompt: "¿Qué ajuste reduce de forma segura la distancia de frenado?",
      options: ["Aumentar la fuerza de frenado sin perder adherencia", "Aumentar la velocidad inicial", "Reducir la distancia disponible"],
      correct: 0
    }
  ];
  return normalizeAssessmentSchema({
    type: "multiple",
    ...variants[variant],
    feedback: "La fuerza neta de frenado produce una aceleración negativa; su magnitud determina cuánto espacio necesita el vehículo para detenerse."
  });
}

function buildAssessment(activity, offset = 0) {
  const savedAssessment = activity.assessments?.[offset];
  if (savedAssessment && isAssessmentCompatibleWithSubject(activity, savedAssessment)) {
    const saved = normalizeAssessmentSchema(structuredClone(savedAssessment));
    saved.subject = activity.subject;
    saved.animation ||= buildQuestionAnimationProfile(activity, saved, offset);
    saved.gameplay ||= buildQuestionGameplayProfile(activity, saved, offset);
    return saved;
  }
  const bank = ASSESSMENT_BANK[activity.simulationType] || ASSESSMENT_BANK.friction;
  const types = ["multiple", "matching", "keyword"];
  const type = types[(assessmentHash(activity.topic) + offset) % types.length];
  if (type === "multiple") {
    const [prompt, options, correct] = bank.multiple;
    const assessment = normalizeAssessmentSchema({ type, prompt, options, correct, feedback: activity.scientificPrinciple });
    assessment.animation = buildQuestionAnimationProfile(activity, assessment, offset);
    assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, offset);
    return assessment;
  }
  if (type === "keyword") {
    const [prompt, accepted] = bank.keyword;
    const assessment = normalizeAssessmentSchema({ type, prompt, accepted, feedback: activity.scientificPrinciple });
    assessment.animation = buildQuestionAnimationProfile(activity, assessment, offset);
    assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, offset);
    return assessment;
  }
  const assessment = normalizeAssessmentSchema({
    type,
    prompt: "Relaciona cada concepto con su efecto o definición.",
    pairs: bank.matching,
    feedback: activity.scientificPrinciple
  });
  assessment.animation = buildQuestionAnimationProfile(activity, assessment, offset);
  assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, offset);
  return assessment;
}

function buildDistinctFallbackAssessment(activity, index, questionsPerLevel) {
  if (activity.subject === "math" || (["physics", "chemistry"].includes(activity.subject) && index % 5 < 3)) {
    return buildStructuredFallbackAssessment(activity, index);
  }
  const levelIndex = Math.floor(index / questionsPerLevel);
  const questionIndex = index % questionsPerLevel;
  const guideLevel = activity.learningGuide?.levels?.[levelIndex] || {};
  const guideConcepts = Array.isArray(guideLevel.concepts) ? guideLevel.concepts : [];
  const controlConcepts = (activity.controls || []).map((control) => ({
    term: control.label,
    definition: control.effect || `Variable que modifica ${activity.topic}`
  }));
  const concepts = [...guideConcepts, ...controlConcepts].filter((concept) => concept?.term && concept?.definition);
  const primary = concepts[(questionIndex + levelIndex) % Math.max(1, concepts.length)]
    || { term: activity.topic, definition: activity.scientificPrinciple };
  const alternatives = concepts
    .filter((concept) => normalizeAnswer(concept.term) !== normalizeAnswer(primary.term))
    .map((concept) => concept.definition)
    .filter(Boolean);
  const type = ["multiple", "matching", "keyword"][(index + assessmentHash(activity.topic)) % 3];
  let assessment;

  if (type === "keyword") {
    assessment = {
      type,
      prompt: `Escribe el término científico que corresponde a esta descripción: ${primary.definition}`,
      accepted: [primary.term],
      feedback: `${primary.term}: ${primary.definition}`
    };
  } else if (type === "matching") {
    const pairs = concepts.slice(0, 4).map((concept) => [concept.term, concept.definition]);
    while (pairs.length < 3) {
      pairs.push([
        `${activity.topic} ${pairs.length + 1}`,
        `Relación científica del nivel ${levelIndex + 1}, fase ${pairs.length + 1}`
      ]);
    }
    assessment = {
      type,
      prompt: `Relaciona los conceptos del nivel ${levelIndex + 1} con su función o evidencia.`,
      pairs: pairs.slice(0, 3),
      feedback: `Las relaciones correctas conectan cada concepto con su efecto observable en ${activity.topic}.`
    };
  } else {
    const correctText = primary.definition;
    const distractors = alternatives.slice(0, 2);
    while (distractors.length < 2) {
      distractors.push(
        distractors.length
          ? `No produce cambios observables en ${primary.term}`
          : `Describe una propiedad ajena a ${primary.term}`
      );
    }
    const correctIndex = (levelIndex + questionIndex) % 3;
    const options = distractors.slice(0, 2);
    options.splice(correctIndex, 0, correctText);
    assessment = {
      type,
      prompt: `¿Qué afirmación explica mejor ${primary.term} en el nivel ${levelIndex + 1}?`,
      options,
      correct: correctIndex,
      feedback: `${primary.term} se reconoce porque ${primary.definition}`
    };
  }
  return normalizeAssessmentSchema(assessment);
}

function buildScheduledFallbackAssessment(activity, scheduledType, index, questionsPerLevel) {
  const policyTypes = questionTypesForActivity(activity, ACTIVITY_QUESTION_TYPES);
  const biologyFallbackType = activity.subject === "biology" && !BIOLOGY_ALLOWED_QUESTION_TYPES.includes(scheduledType)
    ? BIOLOGY_ALLOWED_QUESTION_TYPES[index % BIOLOGY_ALLOWED_QUESTION_TYPES.length]
    : scheduledType;
  const safeScheduledType = isQuestionTypeAllowed(activity, biologyFallbackType)
    ? biologyFallbackType
    : policyTypes[index % policyTypes.length];
  const generatedType = generatedTypeForScheduledType(safeScheduledType);
  const fallbackContext = `Durante ${String(activity.experiencePrompt || activity.mission || `una experiencia sobre ${activity.topic}`)}, el grupo trabaja únicamente con ${activity.topic}.`;
  for (let offset = 0; offset < 24; offset += 1) {
    const candidate = buildStructuredFallbackAssessment(activity, index + offset);
    if (candidate.type === generatedType) {
      candidate.context ||= fallbackContext;
      candidate.feedback ||= String(activity.scientificPrinciple || `La respuesta se obtiene al analizar ${activity.topic}.`);
      return normalizeAssessmentSchema(candidate);
    }
  }
  const topic = String(activity.topic || "el fenómeno estudiado");
  const context = fallbackContext;
  const feedback = String(activity.scientificPrinciple || `La respuesta correcta se obtiene al analizar ${topic}.`);
  const biology = activity.subject === "biology";
  const generic = {
    multiple: { type: "multiple", prompt: `¿Qué afirmación describe correctamente ${topic}?`, options: [feedback, `No existe relación con ${topic}.`, "Todas las variables producen siempre el mismo resultado.", "El fenómeno ocurre sin condiciones observables."], correct: 0 },
    matching: { type: "matching", prompt: `Relaciona cada parte del análisis de ${topic}.`, pairs: [["Observación", "Evidencia registrada"], ["Variable", "Condición que puede cambiar"], ["Conclusión", "Explicación apoyada por los resultados"]] },
    keyword: { type: "keyword", prompt: `Escribe el tema científico central de esta actividad.`, accepted: [topic] },
    "equation-build": { type: "equation-build", prompt: "Construye la relación general entre el resultado y dos variables.", pieces: ["R", "=", "A", "+", "B"], correctSequence: ["R", "=", "A", "+", "B"] },
    "fill-blank": { type: "fill-blank", prompt: `Completa el concepto central.`, segments: ["El fenómeno analizado es ", "___", "."], accepted: [topic] },
    "exponent-placement": { type: "exponent-placement", prompt: "Coloca el exponente que representa una relación cuadrática.", bases: ["x"], exponents: ["1", "2", "3"], correctExponents: ["2"] },
    "chemical-balance": { type: "chemical-balance", prompt: "Equilibra el modelo conservando la cantidad de cada componente.", compounds: [{ formula: "A₂", side: "reactant" }, { formula: "B₂", side: "reactant" }, { formula: "AB", side: "product" }], correctCoefficients: [1, 1, 2] },
    "numeric-answer": biology
      ? { type: "numeric-answer", prompt: "Hay 5 muestras y se agregan 2. ¿Cuántas muestras hay en total?", correctValue: 7, tolerance: 0, unit: "muestras" }
      : { type: "numeric-answer", prompt: "Si se registran 3 observaciones en 2 etapas, ¿cuántos registros hay en total?", correctValue: 6, tolerance: 0, unit: "registros" },
    "graph-plot": { type: "graph-plot", prompt: "Representa dos observaciones consecutivas del fenómeno.", axes: { x: "Etapa", y: "Resultado", xMin: 0, xMax: 5, yMin: 0, yMax: 10 }, targetPoints: [{ x: 1, y: 2 }, { x: 3, y: 6 }], tolerance: .6 },
    "sequence-order": { type: "sequence-order", prompt: `Ordena el análisis de ${topic}.`, steps: ["Observar", "Registrar datos", "Comparar resultados", "Concluir"], correctOrder: ["Observar", "Registrar datos", "Comparar resultados", "Concluir"] },
    "timeline-order": { type: "timeline-order", prompt: `Construye la progresión correcta para analizar ${topic}.`, timelineMode: "process", events: [
      { id: `timeline-${index}-1`, label: "Inicio", title: "Observar", description: "Identifica el fenómeno y sus condiciones." },
      { id: `timeline-${index}-2`, label: "Desarrollo", title: "Registrar", description: "Organiza la evidencia obtenida." },
      { id: `timeline-${index}-3`, label: "Cierre", title: "Concluir", description: "Explica el resultado con la evidencia." }
    ], correctOrder: [`timeline-${index}-1`, `timeline-${index}-2`, `timeline-${index}-3`] }
  }[generatedType] || buildDistinctFallbackAssessment(activity, index, questionsPerLevel);
  return normalizeAssessmentSchema({ ...generic, context, feedback });
}

function normalizeActivityMaxPoints(value) {
  const points = Math.round(Number(value));
  return Number.isFinite(points) && points > 0 ? Math.min(10000000, points) : DEFAULT_ACTIVITY.maxPoints;
}

function distributeActivityAssessmentPoints(activity, { force = false, anchorIndex = null, anchorPoints = null } = {}) {
  const assessments = Array.isArray(activity?.assessments) ? activity.assessments : [];
  activity.maxPoints = normalizeActivityMaxPoints(activity?.maxPoints);
  if (!assessments.length) return assessments;

  const configuredPoints = assessments.map((assessment) => Math.max(0, Math.round(Number(assessment?.points) || 0)));
  const allocationIsValid = assessments.every((assessment) => {
    const value = Number(assessment?.points);
    return Number.isFinite(value) && value >= 0 && Math.round(value) === value;
  })
    && configuredPoints.reduce((total, points) => total + points, 0) === activity.maxPoints;
  if (!force && anchorIndex === null && allocationIsValid) {
    assessments.forEach((assessment, index) => { assessment.points = configuredPoints[index]; });
    return assessments;
  }

  const anchoredIndex = Number.isInteger(anchorIndex) && anchorIndex >= 0 && anchorIndex < assessments.length
    ? anchorIndex
    : null;
  const anchoredValue = anchoredIndex === null
    ? null
    : Math.max(0, Math.min(activity.maxPoints, Math.round(Number(anchorPoints) || 0)));
  const distributableIndexes = assessments.map((_, index) => index).filter((index) => index !== anchoredIndex);
  const remainingPoints = activity.maxPoints - (anchoredValue ?? 0);
  const basePoints = distributableIndexes.length ? Math.floor(remainingPoints / distributableIndexes.length) : activity.maxPoints;
  let remainder = distributableIndexes.length ? remainingPoints % distributableIndexes.length : 0;

  assessments.forEach((assessment, index) => {
    if (index === anchoredIndex) {
      assessment.points = assessments.length === 1 ? activity.maxPoints : anchoredValue;
      return;
    }
    assessment.points = basePoints + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  });
  return assessments;
}

function commitPendingAssessmentPoints({ updatePreview = false } = {}) {
  if (!state.activity || state.activity.gameMode === "simulator") return false;
  const assessments = Array.isArray(state.activity.assessments) ? state.activity.assessments : [];
  if (!assessments.length) return false;
  const maxInput = document.getElementById("activityMaxPoints");
  const pointsInput = document.getElementById("assessmentPoints");
  const previousMaximum = normalizeActivityMaxPoints(state.activity.maxPoints);
  const nextMaximum = maxInput ? normalizeActivityMaxPoints(maxInput.value) : previousMaximum;
  const maximumChanged = nextMaximum !== previousMaximum;
  state.activity.maxPoints = nextMaximum;

  const activeIndex = Math.max(0, Math.min(assessments.length - 1, Number(state.contentQuestionIndex) || 0));
  const previousQuestionPoints = Math.max(0, Math.round(Number(assessments[activeIndex]?.points) || 0));
  const pendingQuestionPoints = pointsInput
    ? Math.max(0, Math.min(nextMaximum, Math.round(Number(pointsInput.value) || 0)))
    : previousQuestionPoints;
  const questionChanged = Boolean(pointsInput) && pendingQuestionPoints !== previousQuestionPoints;

  if (questionChanged) {
    distributeActivityAssessmentPoints(state.activity, { anchorIndex: activeIndex, anchorPoints: pendingQuestionPoints });
  } else if (maximumChanged) {
    distributeActivityAssessmentPoints(state.activity, { force: true });
  } else {
    distributeActivityAssessmentPoints(state.activity);
  }
  if (updatePreview && (maximumChanged || questionChanged)) state.previewActivity = structuredClone(state.activity);
  return maximumChanged || questionChanged;
}

function ensureActivityAssessments(activity) {
  let levelCount = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  let questionsPerLevel = Math.max(1, Math.floor(Number(activity.questionsPerLevel || 3)));
  const existing = Array.isArray(activity.assessments) ? activity.assessments : [];
  let expectedCount = levelCount * questionsPerLevel;
  if (activity.generation?.complete) {
    if (existing.length !== expectedCount) {
      const generatedTotal = Math.max(0, Math.floor(Number(activity.generation?.totalQuestions || 0)));
      const generatedLevels = Math.max(1, Math.floor(Number(activity.generation?.levelCount || levelCount)));
      if (generatedTotal === existing.length && existing.length > 0) {
        levelCount = existing.length % generatedLevels === 0 ? generatedLevels : 1;
        questionsPerLevel = existing.length / levelCount;
        expectedCount = existing.length;
        activity.levelCount = levelCount;
        activity.questionsPerLevel = questionsPerLevel;
        activity.generation.levelCount = levelCount;
        activity.generation.questionsPerLevel = questionsPerLevel;
      } else {
        throw new Error(`La actividad está incompleta: se esperaban ${expectedCount} preguntas y existen ${existing.length}.`);
      }
    }
    const signatures = new Set();
    const geminiOnly = activity.generation?.questionSourcePolicy === "gemini-only-v1";
    activity.assessments = existing.map((source, index) => {
      let assessment = normalizeAssessmentSchema(structuredClone(source));
      if (geminiOnly && assessment.generationSource !== "gemini") {
        throw new Error(`La pregunta ${index + 1} no proviene de Gemini. No se insertará contenido fallback.`);
      }
      const signature = normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs,
        correctSequence: assessment.correctSequence
      }));
      if (signatures.has(signature)) {
        if (geminiOnly) throw new Error(`Gemini repitió la pregunta ${index + 1}. Regenera el lote para conservar ${expectedCount} preguntas únicas.`);
        assessment = buildDistinctFallbackAssessment(activity, index, questionsPerLevel);
      }
      signatures.add(normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs,
        correctSequence: assessment.correctSequence
      })));
      const levelIndex = Math.floor(index / questionsPerLevel);
      const questionIndex = index % questionsPerLevel;
      assessment.levelIndex = levelIndex;
      assessment.questionIndex = questionIndex;
      assessment.globalIndex = index;
      assessment.levelId ||= `level-${levelIndex + 1}`;
      assessment.questionId ||= `${assessment.levelId}-question-${questionIndex + 1}`;
      assessment.animation ||= buildQuestionAnimationProfile(activity, assessment, index);
      assessment.gameplay ||= buildQuestionGameplayProfile(activity, assessment, index);
      assessment.experiment ||= buildQuestionExperiment(activity, assessment, index);
      return assessment;
    });
    activity.assessments = shuffleMultipleChoiceOptions(activity.assessments);
    return distributeActivityAssessmentPoints(activity);
  }
  const sourceActivity = { ...activity, assessments: [] };
  const signatures = new Set();
  activity.assessments = Array.from(
    { length: levelCount * questionsPerLevel },
    (_, index) => {
      let assessment = normalizeAssessmentSchema(existing[index] || buildAssessment(sourceActivity, index));
      if (activity.subject === "math" || (["physics", "chemistry"].includes(activity.subject) && index % 5 < 3)) {
        if (!STRUCTURED_ASSESSMENT_TYPES.has(assessment.type)) assessment = buildStructuredFallbackAssessment(activity, index);
      }
      const signature = normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs
      }));
      if (signatures.has(signature)) {
        assessment = buildDistinctFallbackAssessment(activity, index, questionsPerLevel);
      }
      signatures.add(normalizeAnswer(JSON.stringify({
        prompt: assessment.prompt,
        options: assessment.options,
        accepted: assessment.accepted,
        pairs: assessment.pairs
      })));
      const resolvedModelId = resolveExperimentModelId(activity, assessment, index);
      if (!assessmentMatchesModel(assessment, resolvedModelId) && resolvedModelId === "braking-motion") {
        assessment = buildBrakingAssessment(index, assessment.type);
      }
      assessment.animation ||= buildQuestionAnimationProfile(activity, assessment, index);
      assessment.gameplay = {
        ...buildQuestionGameplayProfile(activity, assessment, index),
        ...(assessment.gameplay || {}),
        modelId: resolvedModelId
      };
      assessment.experiment = buildQuestionExperiment(activity, assessment, index);
      return assessment;
    }
  );
  activity.assessments = shuffleMultipleChoiceOptions(activity.assessments);
  return distributeActivityAssessmentPoints(activity);
}

function structuredEditorList(value, separator = "|") {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(` ${separator} `);
}

function splitStructuredEditorList(value, separator = "|") {
  return String(value || "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFillBlankMarkers(value) {
  return String(value || "")
    .replace(/\[\s*(?:blank|espacio|hueco)\s*\]/gi, "___")
    .replace(/\{\{?\s*(?:blank|espacio|hueco)\s*\}?\}/gi, "___")
    .replace(/_{3,}/g, "___");
}

function blankSegmentsFromExpression(value) {
  const chunks = normalizeFillBlankMarkers(value).split("___");
  return chunks.flatMap((chunk, index) => index < chunks.length - 1 ? [chunk, "___"] : [chunk]);
}

function inferredFillBlankSegments(prompt) {
  const source = normalizeFillBlankMarkers(prompt).replace(/\s+/g, " ").trim();
  if (source.includes("___")) return blankSegmentsFromExpression(source);
  const completionMatch = source.match(/^completa (?:la|el) (?:oraci[oó]n|enunciado|frase) sobre\s+(.+?)[.?!]*$/i);
  if (completionMatch) {
    const subject = completionMatch[1].replace(/[.?!:;\s]+$/g, "").trim();
    const sentence = subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : "La respuesta correcta";
    return [`${sentence} es `, "___", "."];
  }
  const match = source.match(/^(.*?)(?:[,.;]\s*)?¿?\s*cu[aá]l\s+es\s+(?:el|la)?\s*(.+?)\s*\??$/i);
  if (!match) return [`${source.replace(/[?¿]+$/g, "").trim() || "Completa la expresión"}: `, "___", "."];
  const lead = match[1].replace(/[¿?.,;:\s]+$/g, "").trim();
  let answerLabel = match[2].replace(/[?¿]+$/g, "").trim();
  let suffix = ".";
  const unitMatch = answerLabel.match(/^(.*?)\s+en\s+([^,.;?]+)$/i);
  if (unitMatch) {
    answerLabel = unitMatch[1].trim();
    suffix = ` ${unitMatch[2].trim()}.`;
  }
  const label = answerLabel ? answerLabel.charAt(0).toUpperCase() + answerLabel.slice(1) : "El resultado";
  return [lead ? `${lead}. ${label} es ` : `${label} es `, "___", suffix];
}

function hasAuthoredFillBlankExpression(source = {}) {
  const segments = assessmentList(source.segments).map(normalizeFillBlankMarkers);
  const expression = normalizeFillBlankMarkers(source.expression || source.formula || source.equation || "");
  const authored = segments.length ? segments.join("") : expression;
  if (!authored.includes("___") || !authored.replace("___", "").trim()) return false;
  const prompt = normalizeFillBlankMarkers(source.prompt || "").replace(/[?¿]+$/g, "").trim();
  const compactAuthored = authored.replace(/\s+/g, " ").trim();
  return compactAuthored !== `${prompt}: ___.` && compactAuthored !== `${prompt}: ___`;
}

function acceptedAnswerPreviewMarkup(values = []) {
  const accepted = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const [primary, ...alternatives] = accepted;
  if (!primary) return `<strong>Configura la respuesta</strong>`;
  return `<strong>${escapeHtml(primary)}</strong>${alternatives.length
    ? `<span class="sa-answer-alternatives"><small>Alternativa aceptada</small><b>/ ${escapeHtml(alternatives.join(" / "))}</b></span>`
    : ""}`;
}

function acceptedAnswerEditorHint(values = []) {
  const accepted = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (accepted.length < 2) return "";
  return `<p class="sa-editor-help">Respuesta principal: <b>${escapeHtml(accepted[0])}</b>. También se acepta: ${escapeHtml(accepted.slice(1).join(", "))}.</p>`;
}

function buildAssessmentLearningCopyEditor(assessment = {}) {
  return `
    <section class="sa-question-copy-editor" aria-label="Texto mostrado debajo de la pregunta">
      <div class="sa-inspector-subheading"><span>Texto mostrado debajo de la pregunta</span><i class="fas fa-align-left" aria-hidden="true"></i></div>
      <label class="sa-field"><span>Antecedente o situación</span><textarea id="assessmentContext" rows="4" placeholder="Explica de dónde surge el reto, el concepto necesario y por qué debe resolverse.">${escapeHtml(assessment.context || "")}</textarea></label>
      <label class="sa-field"><span>Cómo analizar la evidencia</span><textarea id="assessmentObservationGuide" rows="3" placeholder="Indica qué debe observar o comparar sin revelar la respuesta.">${escapeHtml(assessment.observationGuide || "")}</textarea></label>
      <label class="sa-field"><span>Datos conocidos</span><textarea id="assessmentGiven" rows="3" placeholder="Un dato por línea">${escapeHtml((assessment.given || []).join("\n"))}</textarea></label>
      <label class="sa-field"><span>Objetivo del alumno</span><input id="assessmentGoal" value="${escapeHtml(assessment.goal || "")}" placeholder="Qué debe representar, calcular o demostrar"></label>
    </section>`;
}

function buildStructuredAnswerEditor(assessment) {
  const answerSummary = (() => {
    if (assessment.type === "equation-build") return (assessment.correctSequence || []).join(" ");
    if (assessment.type === "fill-blank") return (assessment.accepted || []).join(" / ");
    if (assessment.type === "exponent-placement") return (assessment.correctExponents || []).join(", ");
    if (assessment.type === "chemical-balance") return (assessment.correctCoefficients || []).join(" : ");
    if (assessment.type === "numeric-answer") return `${assessment.correctValue ?? ""} ${assessment.unit || ""}`.trim();
    if (assessment.type === "graph-plot") return (assessment.targetPoints || []).map((point) => `(${point.x}, ${point.y})`).join(", ");
    if (assessment.type === "sequence-order") return (assessment.correctOrder || []).map(procedureStepText).filter(Boolean).join(" → ");
    if (assessment.type === "timeline-order") return (assessment.events || []).map((event) => event.title).join(" → ");
    return "";
  })();
  const answerPreview = assessment.type === "fill-blank"
    ? acceptedAnswerPreviewMarkup(assessment.accepted)
    : `<strong>${escapeHtml(answerSummary || "Configura la respuesta")}</strong>`;
  const common = `
    <div class="sa-structured-editor">
      <div class="sa-answer-preview"><small>Respuesta principal</small>${answerPreview}</div>
      ${buildAssessmentLearningCopyEditor(assessment)}`;
  let fields = "";
  if (assessment.type === "equation-build") {
    fields = `
      <label class="sa-field"><span>Ecuación correcta</span><input id="assessmentCorrectSequence" value="${escapeHtml(structuredEditorList(assessment.correctSequence))}" placeholder="2x | + | 3 | = | 11"></label>
      <small class="sa-editor-help">Separa cada pieza con <b>|</b>. El juego mezclará el orden automáticamente.</small>
      <label class="sa-field"><span>Piezas distractoras</span><input id="assessmentDistractors" value="${escapeHtml(structuredEditorList(assessment.distractors))}" placeholder="− | 8 | 3x"></label>`;
  } else if (assessment.type === "numeric-answer") {
    fields = `<div class="sa-structured-editor-grid">
      <label class="sa-field"><span>Respuesta numérica</span><input id="assessmentCorrectValue" type="number" step="any" value="${escapeHtml(assessment.correctValue)}"></label>
      <label class="sa-field"><span>Tolerancia</span><input id="assessmentTolerance" type="number" min="0" step="any" value="${escapeHtml(assessment.tolerance)}"></label>
      <label class="sa-field"><span>Unidad</span><input id="assessmentUnit" value="${escapeHtml(assessment.unit || "")}" placeholder="cm, %, m/s²..."></label>
    </div>`;
  } else if (assessment.type === "fill-blank") {
    fields = `
      <label class="sa-field"><span>Expresión con espacio</span><input id="assessmentBlankExpression" value="${escapeHtml((assessment.segments || []).join(""))}" placeholder="3x² + 4x² = ___"></label>
      <label class="sa-field"><span>Respuestas aceptadas</span><input id="assessmentStructuredAccepted" value="${escapeHtml((assessment.accepted || []).join(", "))}" placeholder="7x², 7x2"></label>
      ${acceptedAnswerEditorHint(assessment.accepted)}`;
  } else if (assessment.type === "exponent-placement") {
    fields = `<div class="sa-structured-editor-grid">
      <label class="sa-field"><span>Base</span><input id="assessmentBases" value="${escapeHtml((assessment.bases || []).join(", "))}"></label>
      <label class="sa-field"><span>Exponentes disponibles</span><input id="assessmentExponents" value="${escapeHtml((assessment.exponents || []).join(", "))}"></label>
      <label class="sa-field"><span>Exponente correcto</span><input id="assessmentCorrectExponents" value="${escapeHtml((assessment.correctExponents || []).join(", "))}"></label>
    </div>`;
  } else if (assessment.type === "sequence-order") {
    const procedureSequence = normalizeProcedureSequence(assessment.steps, assessment.correctOrder);
    fields = `
      <label class="sa-field"><span>Pasos disponibles</span><textarea id="assessmentSteps" rows="5">${escapeHtml(procedureSequence.steps.join("\n"))}</textarea></label>
      <label class="sa-field"><span>Orden correcto</span><textarea id="assessmentCorrectOrder" rows="5">${escapeHtml(procedureSequence.correctOrder.join("\n"))}</textarea></label>`;
  } else if (assessment.type === "timeline-order") {
    const modeLabels = { chronology: "Cronología", process: "Proceso o etapas", ideas: "Secuencia de ideas" };
    fields = `
      <label class="sa-field"><span>Modalidad de la línea</span><select id="assessmentTimelineMode">${Object.entries(modeLabels).map(([value, label]) => `<option value="${value}" ${assessment.timelineMode === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <div class="sa-timeline-editor" data-timeline-editor>
        <header><div><strong>Elementos en el orden correcto</strong><small>De 3 a 8 elementos. La etiqueta puede ser una fecha, etapa o categoría.</small></div><button type="button" data-timeline-action="add" ${(assessment.events || []).length >= 8 ? "disabled" : ""}>+ Añadir</button></header>
        <div class="sa-timeline-editor-list">${(assessment.events || []).map((event, index, all) => `
          <article class="sa-timeline-editor-item" data-timeline-event-index="${index}">
            <span class="sa-timeline-editor-position">${index + 1}</span>
            <label><small>Etiqueta opcional</small><input data-timeline-field="label" value="${escapeHtml(event.label)}" placeholder="1910, Etapa 1, Inicio..."></label>
            <label><small>Título</small><input data-timeline-field="title" value="${escapeHtml(event.title)}" required></label>
            <label class="is-description"><small>Descripción</small><textarea data-timeline-field="description" rows="2" required>${escapeHtml(event.description)}</textarea></label>
            <div class="sa-timeline-editor-actions"><button type="button" data-timeline-action="up" ${index === 0 ? "disabled" : ""} aria-label="Mover antes">↑</button><button type="button" data-timeline-action="down" ${index === all.length - 1 ? "disabled" : ""} aria-label="Mover después">↓</button><button type="button" data-timeline-action="remove" ${all.length <= 3 ? "disabled" : ""} aria-label="Eliminar elemento">×</button></div>
          </article>`).join("")}</div>
      </div>`;
  }
  const advancedData = {
    compounds: assessment.compounds,
    correctCoefficients: assessment.correctCoefficients,
    axes: assessment.axes,
    targetPoints: assessment.targetPoints,
    events: assessment.events,
    timelineMode: assessment.timelineMode
  };
  return `${common}${fields}
    <details class="sa-advanced-config">
      <summary>Configuración avanzada</summary>
      <label class="sa-field"><span>Datos estructurados</span><textarea id="assessmentStructuredData" rows="8" spellcheck="false">${escapeHtml(JSON.stringify(advancedData, null, 2))}</textarea></label>
    </details></div>`;
}

function visualQuestionImageSource(assessment) {
  const visual = assessment?.visual && typeof assessment.visual === "object" ? assessment.visual : {};
  return [
    visual.imageDataUrl,
    visual.imageUrl,
    visual.imageSrc,
    assessment?.imageDataUrl,
    assessment?.imageUrl,
    assessment?.imageSrc
  ].find((source) => typeof source === "string" && source.trim()) || "";
}

function reindexActivityAssessments(activity) {
  const assessments = Array.isArray(activity?.assessments) ? activity.assessments : [];
  if (!assessments.length) return assessments;
  const requestedLevels = Math.max(1, Math.min(assessments.length, Math.floor(Number(activity.levelCount || 1))));
  const levelCount = assessments.length % requestedLevels === 0 ? requestedLevels : 1;
  const questionsPerLevel = assessments.length / levelCount;
  activity.levelCount = levelCount;
  activity.questionsPerLevel = questionsPerLevel;
  activity.generation = {
    ...(activity.generation || {}),
    complete: activity.generation?.complete === true,
    levelCount,
    questionsPerLevel,
    totalQuestions: assessments.length,
    editedAt: Date.now()
  };
  if (Array.isArray(activity.learningGuide?.levels)) {
    activity.learningGuide.levels = activity.learningGuide.levels.slice(0, levelCount);
  }
  assessments.forEach((assessment, globalIndex) => {
    const levelIndex = Math.floor(globalIndex / questionsPerLevel);
    const questionIndex = globalIndex % questionsPerLevel;
    assessment.levelIndex = levelIndex;
    assessment.questionIndex = questionIndex;
    assessment.globalIndex = globalIndex;
    assessment.levelId = `level-${levelIndex + 1}`;
    assessment.questionId = `${assessment.levelId}-question-${questionIndex + 1}`;
  });
  const levelInput = document.getElementById("gameLevelCount");
  const questionsInput = document.getElementById("questionsPerLevel");
  if (levelInput) levelInput.value = String(levelCount);
  if (questionsInput) questionsInput.value = String(questionsPerLevel);
  return assessments;
}

function resolveStartScreenContent(activity = {}) {
  const custom = activity.startScreen && typeof activity.startScreen === "object" ? activity.startScreen : {};
  const mode = activity.gameMode === "simulator" ? "Simulador interactivo" : "Actividad educativa";
  const context = deriveScienceActivityContext(activity);
  return {
    eyebrow: meaningfulActivityText(custom.eyebrow) || `${mode} · ${meaningfulActivityText(activity.topic) || "Actividad STEM"}`,
    title: meaningfulActivityText(custom.title) || meaningfulActivityText(activity.title) || "Science Activities",
    experience: meaningfulActivityText(custom.experience) || meaningfulActivityText(activity.experiencePrompt) || meaningfulActivityText(context.objective),
    expectedLearnings: meaningfulActivityText(custom.expectedLearnings) || meaningfulActivityText(activity.expectedLearnings),
    buttonLabel: meaningfulActivityText(custom.buttonLabel) || "Comenzar"
  };
}

function startScreenEditorMarkup(activity = {}) {
  const content = resolveStartScreenContent(activity);
  return `<div data-editor-pane="start">
    <div class="sa-inspector-heading"><span>Pantalla de inicio</span><i class="fas fa-door-open"></i></div>
    <p class="sa-editor-help">Estos textos aparecen antes de cargar el videojuego exportado y en la primera vista del preview.</p>
    <label class="sa-field"><span>Etiqueta superior</span><input id="startScreenEyebrow" value="${escapeHtml(content.eyebrow)}"></label>
    <label class="sa-field"><span>Título de portada</span><textarea id="startScreenTitle" rows="2">${escapeHtml(content.title)}</textarea></label>
    <label class="sa-field"><span>Experiencia</span><textarea id="startScreenExperience" rows="6">${escapeHtml(content.experience)}</textarea></label>
    <label class="sa-field"><span>Aprendizajes esperados</span><textarea id="startScreenExpectedLearnings" rows="8" placeholder="Un aprendizaje por línea">${escapeHtml(content.expectedLearnings)}</textarea></label>
    <label class="sa-field"><span>Texto del botón</span><input id="startScreenButtonLabel" maxlength="32" value="${escapeHtml(content.buttonLabel)}"></label>
  </div>`;
}

function updateStartScreenFromEditor(activity, target) {
  if (!target?.id?.startsWith("startScreen")) return false;
  activity.startScreen ||= structuredClone(DEFAULT_ACTIVITY.startScreen);
  const fieldMap = {
    startScreenEyebrow: "eyebrow",
    startScreenTitle: "title",
    startScreenExperience: "experience",
    startScreenExpectedLearnings: "expectedLearnings",
    startScreenButtonLabel: "buttonLabel"
  };
  const key = fieldMap[target.id];
  if (!key) return false;
  activity.startScreen[key] = target.value;
  return true;
}

function renderContentEditor() {
  const inspector = $(".sa-inspector");
  const contentScroll = inspector?.querySelector(".sa-content-scroll") || inspector;
  let editor = $("#scienceContentEditor");
  if (!editor) {
    editor = document.createElement("section");
    editor.id = "scienceContentEditor";
    editor.className = "sa-inspector-section sa-content-editor";
    contentScroll.append(editor);
  }
  if (state.activity.gameMode === "simulator") {
    renderSimulatorContentEditor(editor);
    return;
  }
  editor.oninput = null;
  editor.onclick = null;

  const assessments = ensureActivityAssessments(state.activity);
  state.contentQuestionIndex = Math.min(Number(state.contentQuestionIndex || 0), assessments.length - 1);
  state.contentSelection = ["start", "introduction", "question"].includes(state.contentSelection) ? state.contentSelection : "start";
  const editingStart = state.contentSelection === "start";
  const editingIntroduction = state.contentSelection === "introduction";
  const editingQuestion = state.contentSelection === "question";
  state.contentLevelIndex = Math.min(Number(state.contentLevelIndex || 0), Number(state.activity.levelCount || 3) - 1);
  state.activity.learningGuide ||= buildFallbackLearningGuide(state.activity);
  const assessment = assessments[state.contentQuestionIndex];
  const configuredPointTotal = assessments.reduce((total, item) => total + Math.max(0, Math.round(Number(item.points) || 0)), 0);
  const guideLevel = state.activity.learningGuide.levels[state.contentLevelIndex] || buildFallbackLearningGuide(state.activity).levels[0];
  const questionOptions = `<option value="start" ${editingStart ? "selected" : ""}>Pantalla de inicio</option><option value="introduction" ${editingIntroduction ? "selected" : ""}>Introducción de la actividad</option>` + assessments.map((_, index) => {
    const perLevel = Number(state.activity.questionsPerLevel || 3);
    return `<option value="${index}" ${editingQuestion && index === state.contentQuestionIndex ? "selected" : ""}>Nivel ${Math.floor(index / perLevel) + 1} · Pregunta ${(index % perLevel) + 1}</option>`;
  }).join("");
  const levelOptions = state.activity.learningGuide.levels.map((_, index) =>
    `<option value="${index}" ${index === state.contentLevelIndex ? "selected" : ""}>Nivel ${index + 1}</option>`
  ).join("");

  let answerEditor = "";
  const questionCopyEditor = STRUCTURED_ASSESSMENT_TYPES.has(assessment.type)
    ? ""
    : buildAssessmentLearningCopyEditor(assessment);
  if (["multiple", "image-multiple"].includes(assessment.type)) {
    const correctAnswers = Array.isArray(assessment.correctAnswers) && assessment.correctAnswers.length
      ? assessment.correctAnswers
      : [Number(assessment.correct) || 0];
    answerEditor = `<div class="sa-answer-editor">${assessment.options.map((option, index) => `
      <label><input type="checkbox" name="correctAssessmentAnswer" value="${index}" ${correctAnswers.includes(index) ? "checked" : ""}><span>Correcta</span><input data-option-index="${index}" value="${escapeHtml(option)}"></label>
    `).join("")}</div>${assessment.type === "image-multiple" ? `<div class="sa-visual-question-editor"><figure class="science-image-question">${visualQuestionImageSource(assessment) ? `<img src="${escapeHtml(visualQuestionImageSource(assessment))}" alt="${escapeHtml(assessment.visual?.alt || "Imagen científica señalada")}">` : "<figcaption>Imagen pendiente</figcaption>"}</figure><label class="sa-field"><span>Elemento señalado</span><input id="assessmentVisualTarget" value="${escapeHtml(assessment.visual?.target || "")}"></label><label class="sa-field"><span>Texto alternativo</span><textarea id="assessmentVisualAlt" rows="3">${escapeHtml(assessment.visual?.alt || "")}</textarea></label><div class="sa-visual-question-actions"><button type="button" data-regenerate-question-image><i class="fas fa-wand-magic-sparkles"></i> Regenerar solo imagen</button><label class="sa-file-action"><i class="fas fa-image"></i> Reemplazar imagen<input id="assessmentVisualFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div></div>` : ""}`;
  } else if (assessment.type === "matching") {
    answerEditor = `<div class="sa-pair-editor">${assessment.pairs.map((pair, index) => `
      <div><input data-pair-term="${index}" value="${escapeHtml(pair[0])}" aria-label="Concepto"><i class="fas fa-arrow-right"></i><input data-pair-definition="${index}" value="${escapeHtml(pair[1])}" aria-label="Relación correcta"></div>
    `).join("")}</div><p class="sa-editor-help">Cada fila define una pareja correcta.</p>`;
  } else if (assessment.type === "keyword") {
    answerEditor = `<label class="sa-field"><span>Palabras aceptadas</span><input id="assessmentAccepted" value="${escapeHtml(assessment.accepted.join(", "))}" placeholder="Separadas por comas"></label>${acceptedAnswerEditorHint(assessment.accepted)}`;
  } else {
    answerEditor = buildStructuredAnswerEditor(assessment);
  }

  editor.innerHTML = `
    ${startScreenEditorMarkup(state.activity)}
    <div data-editor-pane="objectives">
    <div class="sa-inspector-heading"><span>Objetivos y conocimiento</span><i class="fas fa-book-open"></i></div>
    <label class="sa-field"><span>Editar nivel</span><select id="contentLevelSelect">${levelOptions}</select></label>
    <label class="sa-field"><span>Objetivo del nivel</span><textarea id="contentObjective" rows="2">${escapeHtml(guideLevel.objective)}</textarea></label>
    <label class="sa-field"><span>Descripción narrativa</span><textarea id="contentNarrative" rows="3">${escapeHtml(guideLevel.narrative)}</textarea></label>
    <label class="sa-field"><span>Conceptos y definiciones</span><textarea id="contentConcepts" rows="4" placeholder="Concepto: definición">${escapeHtml((guideLevel.concepts || []).map((concept) => `${concept.term}: ${concept.definition}`).join("\n"))}</textarea></label>
    <label class="sa-field"><span>Pista</span><textarea id="contentHint" rows="2">${escapeHtml(guideLevel.hint)}</textarea></label>
    </div>
    <div data-editor-pane="questions">
    <div class="sa-inspector-heading sa-question-editor-heading"><span>Preguntas, respuestas y retroalimentación</span><i class="fas fa-list-check"></i></div>
    <label class="sa-field"><span>Editar pregunta</span><select id="contentQuestionSelect">${questionOptions}</select></label>
    <div data-content-introduction-editor ${editingIntroduction ? "" : "hidden"}>
      <div class="sa-question-delete-row"><span>Introducción o inicio de la actividad</span></div>
      <label class="sa-field"><span>Texto de introducción</span><textarea id="contentIntroduction" rows="8" placeholder="Presenta el tema, la misión y lo que aprenderá el estudiante.">${escapeHtml(state.activity.learningGuide.introduction || "")}</textarea></label>
      <p class="sa-editor-help">Esta pantalla aparece antes de la primera pregunta.</p>
    </div>
    <div data-content-question-editor ${editingQuestion ? "" : "hidden"}>
    <div class="sa-question-delete-row">
      <span class="sa-question-position"><strong>Pregunta ${state.contentQuestionIndex + 1}</strong><small>de ${assessments.length}</small></span>
      <div class="sa-question-action-group">
        <button type="button" class="sa-question-regenerate-button" data-regenerate-assessment ${state.generating || state.regeneratingQuestion !== null ? "disabled" : ""} aria-label="Regenerar esta pregunta, sus respuestas y su imagen si aplica" title="Regenerar pregunta"><i class="fas fa-rotate" aria-hidden="true"></i><span>Regenerar</span></button>
        <button type="button" class="sa-question-delete-button" data-delete-assessment ${assessments.length <= 1 || state.regeneratingQuestion !== null ? "disabled" : ""} aria-label="Eliminar esta pregunta y sus respuestas" title="Eliminar pregunta"><i class="fas fa-trash-can" aria-hidden="true"></i></button>
      </div>
    </div>
    <section class="sa-question-points" aria-label="Puntuación de la actividad">
      <div class="sa-question-points-heading">
        <span><i class="fas fa-star" aria-hidden="true"></i> Puntuación</span>
        <output>${configuredPointTotal.toLocaleString("es-MX")} de ${state.activity.maxPoints.toLocaleString("es-MX")} puntos</output>
      </div>
      <div class="sa-question-points-grid">
        <label class="sa-field"><span>Puntos máximos de la actividad</span><input id="activityMaxPoints" type="number" min="1" max="10000000" step="1" value="${state.activity.maxPoints}"></label>
        <label class="sa-field"><span>Puntos de esta pregunta</span><input id="assessmentPoints" type="number" min="0" max="${state.activity.maxPoints}" step="1" value="${assessment.points}"></label>
      </div>
      <button type="button" class="sa-question-points-distribute" data-redistribute-assessment-points><i class="fas fa-scale-balanced" aria-hidden="true"></i> Repartir equitativamente</button>
    </section>
    <label class="sa-field"><span>Tipo de pregunta</span><select id="assessmentType">
      <option value="multiple" ${assessment.type === "multiple" ? "selected" : ""}>Opción múltiple</option>
      <option value="image-multiple" ${assessment.type === "image-multiple" ? "selected" : ""}>Imagen señalada + opción múltiple</option>
      <option value="matching" ${assessment.type === "matching" ? "selected" : ""}>Emparejamiento</option>
      <option value="keyword" ${assessment.type === "keyword" ? "selected" : ""}>Palabra clave</option>
      <option value="equation-build" ${assessment.type === "equation-build" ? "selected" : ""}>Construir ecuación</option>
      <option value="fill-blank" ${assessment.type === "fill-blank" ? "selected" : ""}>Completar espacio</option>
      <option value="exponent-placement" ${assessment.type === "exponent-placement" ? "selected" : ""}>Colocar exponentes</option>
      <option value="chemical-balance" ${assessment.type === "chemical-balance" ? "selected" : ""}>Balanceo químico</option>
      <option value="numeric-answer" ${assessment.type === "numeric-answer" ? "selected" : ""}>Respuesta numérica</option>
      <option value="graph-plot" ${assessment.type === "graph-plot" ? "selected" : ""}>Graficar puntos</option>
      <option value="sequence-order" ${assessment.type === "sequence-order" ? "selected" : ""}>Ordenar procedimiento</option>
      <option value="timeline-order" ${assessment.type === "timeline-order" ? "selected" : ""}>Línea del tiempo / progresión</option>
    </select></label>
    <label class="sa-field"><span>Mecánica dentro del juego</span><select id="assessmentMechanic">
      <option value="auto" ${assessment.gameplay?.mechanic === "auto" ? "selected" : ""}>Automática según el contenido</option>
      <option value="answer-zones" ${assessment.gameplay?.mechanic === "answer-zones" ? "selected" : ""}>Zonas de respuesta</option>
      <option value="carry-match" ${assessment.gameplay?.mechanic === "carry-match" ? "selected" : ""}>Transportar y emparejar</option>
      <option value="word-forge" ${assessment.gameplay?.mechanic === "word-forge" ? "selected" : ""}>Forjar palabra clave</option>
      <option value="projectile-target" ${assessment.gameplay?.mechanic === "projectile-target" ? "selected" : ""}>Objetivos y proyectiles</option>
      <option value="circuit-route" ${assessment.gameplay?.mechanic === "circuit-route" ? "selected" : ""}>Ruta de circuito</option>
      <option value="resource-balance" ${assessment.gameplay?.mechanic === "resource-balance" ? "selected" : ""}>Equilibrio de recursos</option>
      <option value="equation-lab" ${assessment.gameplay?.mechanic === "equation-lab" ? "selected" : ""}>Laboratorio de ecuaciones</option>
      <option value="formula-console" ${assessment.gameplay?.mechanic === "formula-console" ? "selected" : ""}>Consola de fórmula</option>
      <option value="exponent-dock" ${assessment.gameplay?.mechanic === "exponent-dock" ? "selected" : ""}>Dock de exponentes</option>
      <option value="molecule-balance" ${assessment.gameplay?.mechanic === "molecule-balance" ? "selected" : ""}>Balanza molecular</option>
      <option value="numeric-console" ${assessment.gameplay?.mechanic === "numeric-console" ? "selected" : ""}>Consola numérica</option>
      <option value="graph-probe" ${assessment.gameplay?.mechanic === "graph-probe" ? "selected" : ""}>Sonda gráfica</option>
      <option value="process-stations" ${assessment.gameplay?.mechanic === "process-stations" ? "selected" : ""}>Estaciones de proceso</option>
      <option value="timeline-builder" ${assessment.gameplay?.mechanic === "timeline-builder" ? "selected" : ""}>Constructor de línea</option>
    </select></label>
    <label class="sa-field"><span>Pregunta</span><textarea id="assessmentPrompt" rows="3">${escapeHtml(assessment.prompt)}</textarea></label>
    ${questionCopyEditor}
    ${answerEditor}
    <label class="sa-field"><span>Retroalimentación</span><textarea id="assessmentFeedback" rows="4">${escapeHtml(assessment.feedback || "")}</textarea></label>
    </div>
    </div>`;

  initializeInspectorTabs();
  if (editor.dataset.bound) return;
  editor.dataset.bound = "true";
  editor.addEventListener("click", async (event) => {
    const redistributePointsButton = event.target.closest("[data-redistribute-assessment-points]");
    if (redistributePointsButton) {
      distributeActivityAssessmentPoints(state.activity, { force: true });
      state.previewActivity = structuredClone(state.activity);
      renderContentEditor();
      void renderGame({ resetProgress: true });
      void autosaveProject("question-points-redistributed");
      showToast(`Se repartieron ${state.activity.maxPoints.toLocaleString("es-MX")} puntos entre ${state.activity.assessments.length} preguntas.`);
      return;
    }
    const regenerateAssessmentButton = event.target.closest("[data-regenerate-assessment]");
    if (regenerateAssessmentButton) {
      if (regenerateAssessmentButton.disabled || state.generating || state.regeneratingQuestion !== null) return;
      const regenerationIndex = Math.max(0, Math.min(state.contentQuestionIndex, state.activity.assessments.length - 1));
      const currentAssessment = state.activity.assessments[regenerationIndex];
      if (!currentAssessment) return;
      const includesImage = currentAssessment.type === "image-multiple";
      const confirmed = window.confirm(`Se reemplazarán la pregunta ${regenerationIndex + 1}, sus respuestas y su retroalimentación${includesImage ? ", además de generar una imagen nueva" : ""}. ¿Deseas continuar?`);
      if (!confirmed) return;

      const originalButtonMarkup = regenerateAssessmentButton.innerHTML;
      const traceWasActive = scienceGenerationTrace.active;
      state.regeneratingQuestion = regenerationIndex;
      regenerateAssessmentButton.disabled = true;
      regenerateAssessmentButton.setAttribute("aria-busy", "true");
      regenerateAssessmentButton.classList.add("is-loading");
      regenerateAssessmentButton.innerHTML = `<span class="sa-inline-spinner" aria-hidden="true"></span><span>${includesImage ? "Regenerando pregunta e imagen..." : "Regenerando pregunta..."}</span>`;
      regenerateAssessmentButton.closest(".sa-question-action-group")?.querySelectorAll("button").forEach((button) => { button.disabled = true; });
      if (!traceWasActive) {
        beginScienceGenerationTrace({
          modo: "regenerar-pregunta",
          pregunta: regenerationIndex + 1,
          tipo: currentAssessment.type,
          materia: state.activity.subject,
          tema: state.activity.topic
        });
      }

      try {
        const regeneratedAssessment = await regenerateCompleteAssessment(state.activity, regenerationIndex);
        regeneratedAssessment.points = currentAssessment.points;
        state.activity.assessments[regenerationIndex] = regeneratedAssessment;
        reindexActivityAssessments(state.activity);
        state.regeneratingQuestion = null;
        state.previewActivity = structuredClone(state.activity);
        renderContentEditor();
        await renderGame({ resetProgress: true });
        if (state.contentSelection === "question" && state.contentQuestionIndex === regenerationIndex) {
          state.assessmentController?.openQuestion?.(regenerationIndex);
        }
        await autosaveProject("question-regenerated");
        if (!traceWasActive) finishScienceGenerationTrace("success", { pregunta: regenerationIndex + 1, tipo: regeneratedAssessment.type });
        showToast(includesImage
          ? "Pregunta, respuestas e imagen regeneradas con Gemini."
          : "Pregunta y respuestas regeneradas con Gemini.");
      } catch (error) {
        state.regeneratingQuestion = null;
        if (!traceWasActive) finishScienceGenerationTrace("error", { pregunta: regenerationIndex + 1, error: String(error?.message || "error desconocido") });
        regenerateAssessmentButton.disabled = false;
        regenerateAssessmentButton.removeAttribute("aria-busy");
        regenerateAssessmentButton.classList.remove("is-loading");
        regenerateAssessmentButton.innerHTML = originalButtonMarkup;
        regenerateAssessmentButton.closest(".sa-question-action-group")?.querySelectorAll("button").forEach((button) => { button.disabled = false; });
        showToast(`No se pudo regenerar la pregunta: ${error?.message || "error desconocido"}. La pregunta anterior se conservó.`);
      }
      return;
    }
    const deleteAssessment = event.target.closest("[data-delete-assessment]");
    if (deleteAssessment) {
      if (deleteAssessment.disabled || !Array.isArray(state.activity?.assessments) || state.activity.assessments.length <= 1) {
        showToast("La actividad debe conservar al menos una pregunta.");
        return;
      }
      const deletedIndex = Math.max(0, Math.min(state.contentQuestionIndex, state.activity.assessments.length - 1));
      const deletedAssessment = state.activity.assessments[deletedIndex];
      const confirmed = window.confirm([
        `¿Eliminar la pregunta ${deletedIndex + 1}?`,
        "",
        `Se eliminarán también sus respuestas, retroalimentación${deletedAssessment?.type === "image-multiple" ? " e imagen" : ""}. Esta acción no se puede deshacer.`
      ].join("\n"));
      if (!confirmed) return;
      deleteAssessment.disabled = true;
      state.activity.assessments.splice(deletedIndex, 1);
      reindexActivityAssessments(state.activity);
      distributeActivityAssessmentPoints(state.activity, { force: true });
      state.contentQuestionIndex = Math.min(deletedIndex, state.activity.assessments.length - 1);
      state.contentSelection = "question";
      state.contentLevelIndex = state.activity.assessments[state.contentQuestionIndex]?.levelIndex || 0;
      state.previewActivity = structuredClone(state.activity);
      renderContentEditor();
      await renderGame({ resetProgress: true });
      state.assessmentController?.openQuestion?.(state.contentQuestionIndex);
      void autosaveProject("question-deleted");
      showToast(`Pregunta eliminada. Los ${state.activity.maxPoints.toLocaleString("es-MX")} puntos fueron redistribuidos entre las preguntas restantes.`);
      return;
    }
    const timelineAction = event.target.closest("[data-timeline-action]");
    if (timelineAction) {
      const assessment = state.activity?.assessments?.[state.contentQuestionIndex];
      if (!assessment || assessment.type !== "timeline-order") return;
      assessment.events ||= [];
      const item = timelineAction.closest("[data-timeline-event-index]");
      const index = Number(item?.dataset.timelineEventIndex);
      const action = timelineAction.dataset.timelineAction;
      if (action === "add" && assessment.events.length < 8) {
        const id = globalThis.crypto?.randomUUID?.() || `timeline-${Date.now()}-${assessment.events.length + 1}`;
        assessment.events.push({ id, label: `Etapa ${assessment.events.length + 1}`, title: "Nuevo elemento", description: "Describe este momento, paso o idea." });
      } else if (action === "remove" && assessment.events.length > 3 && Number.isInteger(index)) {
        assessment.events.splice(index, 1);
      } else if ((action === "up" || action === "down") && Number.isInteger(index)) {
        const target = index + (action === "up" ? -1 : 1);
        if (target >= 0 && target < assessment.events.length) [assessment.events[index], assessment.events[target]] = [assessment.events[target], assessment.events[index]];
      }
      assessment.correctOrder = assessment.events.map((timelineEvent) => timelineEvent.id);
      renderContentEditor();
      return;
    }
    const regenerate = event.target.closest("[data-regenerate-question-image]");
    if (!regenerate) return;
    const assessment = state.activity?.assessments?.[state.contentQuestionIndex];
    if (!assessment || assessment.type !== "image-multiple") return;
    const visualEditor = regenerate.closest(".sa-visual-question-editor");
    const originalButtonMarkup = regenerate.innerHTML;
    regenerate.disabled = true;
    regenerate.setAttribute("aria-busy", "true");
    regenerate.classList.add("is-loading");
    regenerate.innerHTML = '<span class="sa-inline-spinner" aria-hidden="true"></span><span>Generando imagen...</span>';
    visualEditor?.classList.add("is-regenerating");
    try {
      await regenerateVisualQuestionImage(state.activity, assessment);
      renderContentEditor();
      state.previewActivity = structuredClone(state.activity);
      await renderGame({ resetProgress: false });
      await autosaveProject("question-image-regenerated");
      state.previewActivity = structuredClone(state.activity);
      requestAnimationFrame(() => {
        const mount = document.getElementById("scienceGameMount");
        const deck = mount?.querySelector(".science-rive-answer-deck");
        if (mount) mount.scrollTop = 0;
        if (deck) deck.scrollTop = 0;
      });
      showToast("Imagen de la pregunta visual actualizada.");
    } catch (error) {
      showToast(`No se pudo regenerar la imagen: ${error?.message || "error desconocido"}`);
      regenerate.disabled = false;
      regenerate.removeAttribute("aria-busy");
      regenerate.classList.remove("is-loading");
      regenerate.innerHTML = originalButtonMarkup;
      visualEditor?.classList.remove("is-regenerating");
    }
  });
  editor.addEventListener("change", (event) => {
    if (event.target.id === "activityMaxPoints") {
      state.activity.maxPoints = normalizeActivityMaxPoints(event.target.value);
      distributeActivityAssessmentPoints(state.activity, { force: true });
      state.previewActivity = structuredClone(state.activity);
      renderContentEditor();
      void renderGame({ resetProgress: true });
      void autosaveProject("activity-max-points-updated");
      return;
    }
    if (event.target.id === "assessmentPoints") {
      distributeActivityAssessmentPoints(state.activity, {
        anchorIndex: state.contentQuestionIndex,
        anchorPoints: event.target.value
      });
      state.previewActivity = structuredClone(state.activity);
      renderContentEditor();
      void renderGame({ resetProgress: true });
      void autosaveProject("question-points-updated");
      return;
    }
    if (event.target.id === "assessmentVisualFile") {
      const file = event.target.files?.[0];
      const assessment = state.activity?.assessments?.[state.contentQuestionIndex];
      if (!file || !assessment || assessment.type !== "image-multiple") return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        assessment.visual.imageDataUrl = String(reader.result || "");
        assessment.visual.imageUrl = "";
        assessment.visual.imageSrc = "";
        renderContentEditor();
        state.previewActivity = structuredClone(state.activity);
        void renderGame({ resetProgress: false });
      }, { once: true });
      reader.readAsDataURL(file);
      return;
    }
    if (event.target.id === "contentLevelSelect") {
      state.contentLevelIndex = Number(event.target.value);
      renderContentEditor();
      return;
    }
    if (event.target.id === "contentQuestionSelect") {
      if (event.target.value === "start") {
        state.contentSelection = "start";
        renderContentEditor();
        document.querySelector('[data-inspector-tab="start"]')?.click();
        window.dispatchEvent(new CustomEvent("scienceactivities:select-question", {
          detail: { phase: "start" }
        }));
        return;
      }
      if (event.target.value === "introduction") {
        state.contentSelection = "introduction";
        renderContentEditor();
        window.dispatchEvent(new CustomEvent("scienceactivities:select-question", {
          detail: { phase: "introduction" }
        }));
        return;
      }
      state.contentSelection = "question";
      state.contentQuestionIndex = Number(event.target.value);
      renderContentEditor();
      window.dispatchEvent(new CustomEvent("scienceactivities:select-question", {
        detail: { index: state.contentQuestionIndex }
      }));
      return;
    }
    if (event.target.id === "assessmentType") {
      const type = event.target.value;
      const previousAssessment = state.activity.assessments[state.contentQuestionIndex] || {};
      const preservedLearningCopy = {
        points: previousAssessment.points,
        context: previousAssessment.context || "",
        observationGuide: previousAssessment.observationGuide || "",
        given: structuredClone(previousAssessment.given || []),
        goal: previousAssessment.goal || ""
      };
      const base = buildAssessment({ ...state.activity, assessments: [] }, state.contentQuestionIndex);
      state.activity.assessments[state.contentQuestionIndex] = type === "timeline-order"
        ? normalizeAssessmentSchema({ ...preservedLearningCopy, type, timelineMode: "chronology", prompt: "Construye la progresión en el orden correcto.", events: [
          { id: "timeline-1", label: "Inicio", title: "Primer elemento", description: "Describe el comienzo de la progresión." },
          { id: "timeline-2", label: "Desarrollo", title: "Segundo elemento", description: "Describe el cambio o etapa intermedia." },
          { id: "timeline-3", label: "Cierre", title: "Tercer elemento", description: "Describe el resultado de la progresión." }
        ], correctOrder: ["timeline-1", "timeline-2", "timeline-3"], feedback: base.feedback })
        : STRUCTURED_ASSESSMENT_TYPES.has(type)
        ? { ...buildStructuredFallbackAssessment(state.activity, state.contentQuestionIndex), ...preservedLearningCopy, type }
        : ["multiple", "image-multiple"].includes(type)
        ? {
          ...preservedLearningCopy,
          type,
          prompt: base.prompt,
          options: base.options || ["Opción A", "Opción B", "Opción C", "Opción D"],
          correct: 0,
          correctAnswers: [0],
          feedback: base.feedback,
          ...(type === "image-multiple" ? { visual: { target: "", alt: "Imagen científica señalada", imageDataUrl: "", imageUrl: "", imageSrc: "" } } : {})
        }
        : type === "matching"
          ? { ...preservedLearningCopy, type, prompt: "Relaciona cada concepto con su definición.", pairs: (ASSESSMENT_BANK[state.activity.simulationType] || ASSESSMENT_BANK.friction).matching, feedback: base.feedback }
          : { ...preservedLearningCopy, type, prompt: base.prompt, accepted: ["respuesta"], feedback: base.feedback };
      state.activity.assessments[state.contentQuestionIndex] = normalizeAssessmentSchema(state.activity.assessments[state.contentQuestionIndex]);
      state.activity.assessments[state.contentQuestionIndex].animation = buildQuestionAnimationProfile(
        state.activity,
        state.activity.assessments[state.contentQuestionIndex],
        state.contentQuestionIndex
      );
      state.activity.assessments[state.contentQuestionIndex].gameplay = buildQuestionGameplayProfile(
        state.activity,
        state.activity.assessments[state.contentQuestionIndex],
        state.contentQuestionIndex
      );
      if (STRUCTURED_ASSESSMENT_TYPES.has(type)) {
        state.activity.assessments[state.contentQuestionIndex].gameplay.mechanic = STRUCTURED_MECHANICS[type];
      }
      renderContentEditor();
      return;
    }
    if (event.target.id === "assessmentMechanic") {
      const current = state.activity.assessments[state.contentQuestionIndex];
      current.gameplay = {
        ...buildQuestionGameplayProfile(state.activity, current, state.contentQuestionIndex),
        ...(current.gameplay || {}),
        mechanic: event.target.value
      };
    }
    if (event.target.id === "assessmentTimelineMode") state.activity.assessments[state.contentQuestionIndex].timelineMode = event.target.value;
    if (event.target.name === "correctAssessmentAnswer") {
      const current = state.activity.assessments[state.contentQuestionIndex];
      const checked = [...editor.querySelectorAll('input[name="correctAssessmentAnswer"]:checked')].map((input) => Number(input.value));
      if (!checked.length) {
        event.target.checked = true;
        return;
      }
      current.correctAnswers = checked.sort((a, b) => a - b);
      current.correct = current.correctAnswers[0];
    }
  });
  editor.addEventListener("input", (event) => {
    const currentAssessment = state.activity.assessments[state.contentQuestionIndex];
    const currentLevel = state.activity.learningGuide.levels[state.contentLevelIndex];
    if (updateStartScreenFromEditor(state.activity, event.target)) return;
    if (event.target.id === "contentIntroduction") state.activity.learningGuide.introduction = event.target.value;
    if (event.target.id === "contentObjective") currentLevel.objective = event.target.value;
    if (event.target.id === "contentNarrative") currentLevel.narrative = event.target.value;
    if (event.target.id === "contentHint") currentLevel.hint = event.target.value;
    if (event.target.id === "contentConcepts") {
      currentLevel.concepts = event.target.value.split("\n").map((line) => {
        const [term, ...definition] = line.split(":");
        return { term: term.trim(), definition: definition.join(":").trim() };
      }).filter((concept) => concept.term && concept.definition);
    }
    if (event.target.id === "assessmentPrompt") {
      currentAssessment.prompt = event.target.value;
      currentAssessment.animation = buildQuestionAnimationProfile(
        state.activity,
        currentAssessment,
        state.contentQuestionIndex
      );
    }
    if (event.target.id === "assessmentFeedback") currentAssessment.feedback = event.target.value;
    if (event.target.id === "assessmentVisualTarget") currentAssessment.visual.target = event.target.value;
    if (event.target.id === "assessmentVisualAlt") currentAssessment.visual.alt = event.target.value;
    if (event.target.id === "assessmentAccepted") currentAssessment.accepted = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentContext") currentAssessment.context = event.target.value;
    if (event.target.id === "assessmentObservationGuide") currentAssessment.observationGuide = event.target.value;
    if (event.target.id === "assessmentGiven") currentAssessment.given = event.target.value.split("\n").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentGoal") currentAssessment.goal = event.target.value;
    if (event.target.id === "assessmentCorrectSequence") {
      currentAssessment.correctSequence = splitStructuredEditorList(event.target.value);
      currentAssessment.pieces = [...currentAssessment.correctSequence, ...(currentAssessment.distractors || [])];
    }
    if (event.target.id === "assessmentDistractors") {
      currentAssessment.distractors = splitStructuredEditorList(event.target.value);
      currentAssessment.pieces = [...(currentAssessment.correctSequence || []), ...currentAssessment.distractors];
    }
    if (event.target.id === "assessmentCorrectValue") currentAssessment.correctValue = Number(event.target.value);
    if (event.target.id === "assessmentTolerance") currentAssessment.tolerance = Math.max(0, Number(event.target.value));
    if (event.target.id === "assessmentUnit") currentAssessment.unit = event.target.value;
    if (event.target.id === "assessmentBlankExpression") currentAssessment.segments = blankSegmentsFromExpression(event.target.value);
    if (event.target.id === "assessmentStructuredAccepted") currentAssessment.accepted = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentBases") currentAssessment.bases = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentExponents") currentAssessment.exponents = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentCorrectExponents") currentAssessment.correctExponents = event.target.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentSteps") currentAssessment.steps = event.target.value.split("\n").map((value) => value.trim()).filter(Boolean);
    if (event.target.id === "assessmentCorrectOrder") currentAssessment.correctOrder = event.target.value.split("\n").map((value) => value.trim()).filter(Boolean);
    if (event.target.matches("[data-timeline-field]")) {
      const item = event.target.closest("[data-timeline-event-index]");
      const timelineEvent = currentAssessment.events?.[Number(item?.dataset.timelineEventIndex)];
      if (timelineEvent) timelineEvent[event.target.dataset.timelineField] = event.target.value;
      currentAssessment.correctOrder = (currentAssessment.events || []).map((entry) => entry.id);
    }
    if (event.target.id === "assessmentStructuredData") {
      try {
        Object.assign(currentAssessment, JSON.parse(event.target.value));
        event.target.setCustomValidity("");
      } catch (_) {
        event.target.setCustomValidity("El JSON de la mecánica no es válido.");
      }
    }
    if (event.target.matches("[data-option-index]")) currentAssessment.options[Number(event.target.dataset.optionIndex)] = event.target.value;
    if (event.target.matches("[data-pair-term]")) currentAssessment.pairs[Number(event.target.dataset.pairTerm)][0] = event.target.value;
    if (event.target.matches("[data-pair-definition]")) currentAssessment.pairs[Number(event.target.dataset.pairDefinition)][1] = event.target.value;
  });
}

function normalizeAnswer(value) {
  return String(value || "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function assessmentLearningContextMarkup(assessment = {}) {
  const given = (assessment.given || []).filter(Boolean);
  const observationGuide = String(assessment.observationGuide || defaultAssessmentObservationGuide(assessment)).trim();
  if (!assessment.context && !given.length && !assessment.goal && !observationGuide) return "";
  return `<section class="sa-question-context">
    <header class="sa-question-context-header">
      <span class="sa-question-context-signal" aria-hidden="true"><i></i></span>
      <small>Contexto de misión</small>
      <strong><i class="fas fa-compass" aria-hidden="true"></i> Antecedente</strong>
    </header>
    ${assessment.context ? `<div class="sa-question-context-copy"><i class="fas fa-wave-square" aria-hidden="true"></i><p>${escapeHtml(assessment.context)}</p></div>` : ""}
    ${observationGuide ? `<div class="sa-question-context-copy sa-question-observation-guide"><i class="fas fa-eye" aria-hidden="true"></i><p><strong>Cómo analizar:</strong> ${escapeHtml(observationGuide)}</p></div>` : ""}
    ${given.length ? `<div class="sa-question-context-data"><small>Datos disponibles</small><div>${given.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></div>` : ""}
    ${assessment.goal ? `<div class="sa-question-context-goal"><i class="fas fa-crosshairs" aria-hidden="true"></i><span><small>Objetivo operativo</small><strong>${escapeHtml(assessment.goal)}</strong></span></div>` : ""}
  </section>`;
}

function defaultAssessmentObservationGuide(assessment = {}) {
  const guides = {
    "image-multiple": "Ubica la punta de la flecha y compara la forma, posición y relación del elemento señalado con las opciones.",
    multiple: "Identifica el dato o concepto central del enunciado y descarta las opciones que contradigan la evidencia disponible.",
    matching: "Compara la función o propiedad de cada concepto antes de relacionarlo; no te guíes por el orden de las columnas.",
    keyword: "Localiza en el contexto el concepto científico preciso que completa la explicación.",
    "graph-plot": "Revisa las unidades y la escala de ambos ejes antes de colocar cada coordenada.",
    "sequence-order": "Reconoce qué condición debe cumplirse antes de que pueda comenzar el paso siguiente.",
    "timeline-order": "Compara cada elemento y determina qué debe ocurrir antes y después para construir la progresión completa.",
    "equation-build": "Relaciona cada magnitud con su función y verifica que ambos lados de la igualdad sean equivalentes.",
    "numeric-answer": "Distingue los datos conocidos, la incógnita y las unidades antes de realizar la operación."
  };
  return guides[assessment.type] || "Distingue la información dada, lo que debes encontrar y la evidencia que permite justificar la respuesta.";
}

function assessmentQuestionMarkup(assessment) {
  if (STRUCTURED_ASSESSMENT_TYPES.has(assessment.type)) {
    return `<div class="sa-structured-preview"><i class="fas fa-gamepad"></i><strong>Reto interactivo dentro del videojuego</strong><span>Las piezas, valores o puntos se manipulan en la siguiente pantalla.</span></div>`;
  }
  if (["multiple", "image-multiple"].includes(assessment.type)) {
    const imageSource = String(assessment.visual?.imageDataUrl || assessment.visual?.imageUrl || assessment.visual?.imageSrc || "").trim();
    const visualMarkup = assessment.type === "image-multiple"
      ? `<figure class="science-image-question ${imageSource ? "" : "is-missing"}">${imageSource ? `<img src="${escapeHtml(imageSource)}" alt="${escapeHtml(assessment.visual?.alt || "Imagen científica señalada")}">` : "<figcaption>No se pudo cargar la imagen necesaria para responder.</figcaption>"}</figure>`
      : "";
    const allowsMultiple = Array.isArray(assessment.correctAnswers) && assessment.correctAnswers.length > 1;
    return `${visualMarkup}<div class="sa-answer-options ${allowsMultiple ? "is-multiple-select" : ""}">${assessment.options.map((option, index) => `
      <button type="button" data-assessment-answer="${index}"><span>${String.fromCharCode(65 + index)}</span>${escapeHtml(option)}</button>
    `).join("")}</div>${allowsMultiple ? '<button type="button" class="sa-check-multiple-answers" data-assessment-check-answers>Comprobar respuestas</button>' : ""}`;
  }
  if (assessment.type === "keyword") {
    return `<form class="sa-keyword-answer">
      <label for="assessmentKeyword">Palabra clave</label>
      <div><input id="assessmentKeyword" autocomplete="off" placeholder="Escribe tu respuesta…" required><button type="button" data-assessment-submit>Registrar hipótesis</button></div>
    </form>`;
  }
  const definitions = assessment.pairs.map((pair) => pair[1]).sort(() => .5 - Math.random());
  return `<form class="sa-matching-answer">${assessment.pairs.map(([concept]) => `
    <label><span>${escapeHtml(concept)}</span><select required><option value="">Selecciona…</option>${definitions.map((definition) => `<option value="${escapeHtml(definition)}">${escapeHtml(definition)}</option>`).join("")}</select></label>
  `).join("")}<button type="button" data-assessment-submit>Registrar relaciones</button></form>`;
}

function getAssessmentTypeLabel(type) {
  return {
    multiple: "Opción múltiple",
    "image-multiple": "Imagen señalada",
    matching: "Emparejamiento",
    keyword: "Palabra clave",
    "equation-build": "Construir ecuación",
    "fill-blank": "Completar espacio",
    "exponent-placement": "Colocar exponentes",
    "chemical-balance": "Balanceo químico",
    "numeric-answer": "Respuesta numérica",
    "graph-plot": "Graficar puntos",
    "sequence-order": "Ordenar procedimiento"
  }[type] || "Reto interactivo";
}

function calculateSimulatorMeasurement(activity, values) {
  const value = (id, fallback = 0) => Number(values[id] ?? fallback);
  const type = activity.simulationType;
  if (type === "friction") {
    return { value: (value("force") - value("friction")) / Math.max(.01, value("mass", 1)), unit: "m/s²", label: "Aceleración", formula: "a = (F - Fr) / m" };
  }
  if (type === "projectile") {
    const radians = value("angle", 45) * Math.PI / 180;
    return { value: (value("power", 1) ** 2 * Math.sin(2 * radians)) / Math.max(.01, value("gravity", 9.8)), unit: "m", label: "Alcance", formula: "R = v²·sen(2θ) / g" };
  }
  if (type === "circuit") return { value: value("voltage") / Math.max(.01, value("resistance", 1)), unit: "A", label: "Corriente", formula: "I = V / R" };
  if (type === "energy") return { value: value("mass") * value("gravity", 9.8) * value("height"), unit: "J", label: "Energía potencial", formula: "Ep = m·g·h" };
  if (type === "fluid") return { value: value("force") / Math.max(.01, value("area", 1)), unit: "Pa", label: "Presión relativa", formula: "P = F / A" };
  if (type === "wave") return { value: value("frequency") * value("wavelength") / 100, unit: "m/s", label: "Velocidad de onda", formula: "v = f·λ" };
  if (type === "optics") {
    const angle = Math.asin(Math.sin(value("angle") * Math.PI / 180) / Math.max(1, value("refractiveIndex", 1))) * 180 / Math.PI;
    return { value: angle, unit: "°", label: "Ángulo refractado", formula: "n₁·senθ₁ = n₂·senθ₂" };
  }
  if (type === "math") return { value: value("coefficient", 1) * value("x") + value("constant"), unit: "", label: "Resultado", formula: "y = m·x + b" };
  if (type === "thermal") return { value: value("initialTemperature", 20), unit: "°C", label: "Temperatura inicial del material", formula: "Q̇ = G(Tfuente−Tmaterial)" };
  if (type === "particles") return { value: value("temperature"), unit: "°C", label: "Temperatura", formula: "TK = T°C + 273.15" };
  if (type === "ecosystem") return { value: Math.sqrt(Math.max(0, value("sunlight") * value("water"))), unit: "%", label: "Equilibrio", formula: "E = √(luz·agua)" };
  if (type === "cell") return { value: (value("nutrients") + value("oxygen")) / 2, unit: "%", label: "ATP relativo", formula: "ATP ∝ (nutrientes + O₂) / 2" };
  return { value: Object.values(values).reduce((sum, item) => sum + Number(item || 0), 0), unit: "u", label: "Medición", formula: activity.simulator?.formula || "Relación experimental" };
}

function renderSimulatorContentEditor(editor) {
  const activity = state.activity;
  activity.simulator ||= {};
  activity.visualScene = normalizeSimulatorVisualScene(activity, activity.visualScene);
  const visualScene = activity.visualScene;
  const backgroundSource = visualScene.background.dataUrl || visualScene.background.imageUrl || visualScene.background.imageSrc;
  const customScenarioPending = activity.simulatorVisualSelection?.scenarioId === CUSTOM_SIMULATOR_VISUAL_VALUE
    && Boolean(activity.simulatorVisualSelection?.customScenario)
    && !backgroundSource;
  editor.innerHTML = `
    ${startScreenEditorMarkup(activity)}
    <div data-editor-pane="objectives">
      <div class="sa-inspector-heading"><span>Modelo científico</span><i class="fas fa-square-root-variable"></i></div>
      <label class="sa-field"><span>Identificador del modelo</span><input id="simulatorModelId" value="${escapeHtml(activity.simulator.modelId || activity.simulationType)}"></label>
      <label class="sa-field"><span>Fórmula o relación</span><textarea id="simulatorFormula" rows="3">${escapeHtml(activity.simulator.formula || activity.scientificPrinciple)}</textarea></label>
      <label class="sa-field"><span>Objetivo opcional</span><textarea id="simulatorObjective" rows="3">${escapeHtml(activity.simulator.objective || "")}</textarea></label>
      <label class="sa-field"><span>Tolerancia</span><input id="simulatorTolerance" type="number" min="0" step="0.01" value="${Number(activity.simulator.tolerance ?? .1)}"></label>
      <div class="sa-simulator-visual-editor">
        <div class="sa-inspector-heading"><span>Escena visual Gemini</span><i class="fas fa-images"></i></div>
        <figure class="sa-simulator-background-preview ${backgroundSource ? "has-image" : "is-empty"}">${backgroundSource ? `<img src="${escapeHtml(backgroundSource)}" alt="${escapeHtml(visualScene.background.alt)}">` : `<span>${customScenarioPending ? "Fondo personalizado pendiente de Gemini" : "Fondo vectorial de respaldo"}</span>`}</figure>
        <button type="button" class="sa-simulator-visual-action" data-regenerate-simulator-background>${backgroundSource ? "Regenerar fondo" : customScenarioPending ? "Generar fondo solicitado" : "Generar escena visual"}</button>
        <div class="sa-simulator-layer-list">${visualScene.layers.map((layer) => {
          const source = layer.dataUrl || layer.imageUrl || layer.imageSrc;
          return `<article><span class="sa-simulator-layer-thumb">${source ? `<img src="${escapeHtml(source)}" alt="">` : "◇"}</span><div><strong>${escapeHtml(layer.label)}</strong><small>${escapeHtml(layer.motionPreset)} · ${escapeHtml(layer.driver)}</small></div><button type="button" data-regenerate-simulator-layer="${escapeHtml(layer.id)}" aria-label="Regenerar ${escapeHtml(layer.label)}">↻</button></article>`;
        }).join("")}</div>
        ${visualScene.generationWarnings.length ? `<p class="sa-simulator-visual-warning" role="status">${escapeHtml(visualScene.generationWarnings.at(-1))}</p>` : ""}
      </div>
    </div>
    <div data-editor-pane="questions">
      <div class="sa-inspector-heading"><span>Variables y rangos</span><i class="fas fa-sliders"></i></div>
      <div class="sa-simulator-variable-editor">${(activity.controls || []).map((control, index) => `
        <article>
          <input data-sim-control="${index}" data-key="label" value="${escapeHtml(control.label)}" aria-label="Nombre de variable">
          <div><input data-sim-control="${index}" data-key="min" type="number" value="${control.min}"><input data-sim-control="${index}" data-key="max" type="number" value="${control.max}"><input data-sim-control="${index}" data-key="step" type="number" value="${control.step}"></div>
          <input data-sim-control="${index}" data-key="unit" value="${escapeHtml(control.unit)}" aria-label="Unidad">
        </article>`).join("")}</div>
    </div>`;
  initializeInspectorTabs();
  editor.oninput = (event) => {
    if (updateStartScreenFromEditor(activity, event.target)) return;
    if (event.target.id === "simulatorModelId") activity.simulator.modelId = event.target.value;
    if (event.target.id === "simulatorFormula") activity.simulator.formula = event.target.value;
    if (event.target.id === "simulatorObjective") activity.simulator.objective = event.target.value;
    if (event.target.id === "simulatorTolerance") activity.simulator.tolerance = Math.max(0, Number(event.target.value) || 0);
    if (event.target.matches("[data-sim-control]")) {
      const control = activity.controls[Number(event.target.dataset.simControl)];
      const key = event.target.dataset.key;
      control[key] = ["min", "max", "step"].includes(key) ? Number(event.target.value) : event.target.value;
    }
  };
  editor.onclick = async (event) => {
    const backgroundButton = event.target.closest("[data-regenerate-simulator-background]");
    const layerButton = event.target.closest("[data-regenerate-simulator-layer]");
    if (!backgroundButton && !layerButton) return;
    event.preventDefault();
    syncEditorToActivity();
    if (!validateSimulatorCustomVisualChoices()) return;
    state.generating = true;
    await setGenerating(true);
    try {
      const selectionChanged = state.activity.visualScene?.selectionKey !== simulatorVisualSelectionKey(state.activity);
      const replan = Boolean(selectionChanged || (backgroundButton && !state.activity.visualScene?.layers?.length));
      state.activity.visualScene = await generateSimulatorVisualSceneWithGemini(state.activity, layerButton
        ? (replan ? { replan: true } : { layerId: layerButton.dataset.regenerateSimulatorLayer })
        : { backgroundOnly: !replan, replan });
      state.previewActivity = structuredClone(state.activity);
      renderSimulatorContentEditor(editor);
      await renderGame();
      window.setTimeout(() => void autosaveProject("simulator-visual-regeneration"), 0);
      showToast(latestSimulatorQuotaWarning(state.activity.visualScene) || (layerButton ? "Elemento visual actualizado." : "Fondo del simulador actualizado."));
    } catch (error) {
      showToast(error?.message || "No fue posible regenerar el recurso visual.");
    } finally {
      state.generating = false;
      await setGenerating(false, { materializePreview: true });
    }
  };
}

async function mountSimulatorFlow(activity, renderRevision) {
  const frame = $(".sa-game-frame");
  frame.querySelectorAll(".sa-assessment-layer,.sa-scene-outcome,.sa-scene-check,.sa-mode-toggle,.sa-game-footer,.sa-simulator-shell").forEach((element) => element.remove());
  frame.classList.remove("is-level-briefing");
  frame.classList.add("is-simulator");
  $("#scienceGameControls").classList.add("sa-game-controls-hidden");
  const { createScienceSimulator } = await loadSimulatorRuntime();
  if (state.gameRenderRevision !== renderRevision) return null;
  return createScienceSimulator("#scienceGameMount", activity, {
    onStateChange: (simulatorState) => {
      if (state.gameRenderRevision !== renderRevision) return;
      activity.simulator ||= {};
      activity.simulator.values = { ...simulatorState.values };
      state.activity.simulator ||= {};
      state.activity.simulator.values = { ...simulatorState.values };
      if (state.previewActivity) { state.previewActivity.simulator ||= {}; state.previewActivity.simulator.values = { ...simulatorState.values }; }
      if (state.isRehydratingSession) return;
      scheduleLocalDraftSave();
    }
  });
}

function mountAssessmentFlow(activity) {
  if (activity.gameMode === "simulator") {
    mountSimulatorFlow(activity);
    return;
  }
  const frame = $(".sa-game-frame");
  frame.classList.remove("is-level-briefing");
  frame.classList.remove("is-simulator");
  frame.querySelector(".sa-assessment-layer")?.remove();
  frame.querySelector(".sa-scene-outcome")?.remove();
  frame.querySelector(".sa-scene-check")?.remove();
  state.assessmentController?.dispose?.();
  frame.querySelector(".sa-mode-toggle")?.remove();
  frame.querySelectorAll(".sa-game-footer").forEach((element) => element.remove());
  frame.querySelector(".sa-simulator-shell")?.remove();
  frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-active");
  frame.dataset.simulationType = activity.simulationType || "friction";
  frame.style.setProperty("--sa-game-sky", activity.scenario?.sky || "#dff4ff");
  frame.style.setProperty("--sa-game-ground", activity.scenario?.ground || "#8fd5c8");
  frame.style.setProperty("--sa-game-accent", activity.scenario?.accent || "#ff7d68");
  const controls = $("#scienceGameControls");
  controls.classList.add("sa-game-controls-hidden");

  const isLabMode = false;
  const totalLevels = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  const questionsPerLevel = isLabMode ? 1 : Math.max(1, Math.floor(Number(activity.questionsPerLevel || 3)));
  const progress = state.editorReviewProgress || createReviewProgressState();
  progress.briefedLevels ||= [];
  progress.score = Math.max(0, Number(progress.score) || 0);
  progress.levelScore = Math.max(0, Number(progress.levelScore) || 0);
  progress.streak = Math.max(0, Number(progress.streak) || 0);
  progress.bestStreak = Math.max(progress.streak, Number(progress.bestStreak) || 0);
  progress.scoredQuestions ||= {};
  state.editorReviewProgress = progress;
  const questionOffset = ((progress.level - 1) * questionsPerLevel) + progress.question - 1;
  const session = {
    phase: "question",
    answeredCorrectly: false,
    assessment: buildAssessment(activity, questionOffset),
    retries: 0,
    questionScore: 0,
    scoreAwarded: false,
    scoreBreakdown: [],
    runId: 0,
    transitionLocked: false
  };
  state.assessmentSession = session;
  const invalidateQuestionRun = () => {
    session.runId += 1;
    state.gameInstance?.cancelQuestionGame?.();
    return session.runId;
  };

  const layer = document.createElement("section");
  layer.className = "sa-assessment-layer";
  layer.setAttribute("aria-live", "polite");
  const sceneOutcome = document.createElement("div");
  sceneOutcome.className = "sa-scene-outcome";
  const sceneCheck = document.createElement("button");
  sceneCheck.className = "sa-scene-check";
  sceneCheck.type = "button";
  sceneCheck.innerHTML = "<i class=\"fas fa-flask-vial\"></i><span>Comprobar</span>";
  const modeToggle = document.createElement("button");
  modeToggle.className = "sa-mode-toggle";
  modeToggle.type = "button";
  modeToggle.innerHTML = "<i class=\"fas fa-sliders\"></i><span>Modo libre</span>";
  modeToggle.hidden = true;
  frame.append(sceneOutcome, layer, sceneCheck, modeToggle);

  const setResultSurface = (active) => {
    frame.classList.toggle("is-assessment-result", Boolean(active));
  };

  const formatScore = (value) => Math.max(0, Number(value) || 0).toLocaleString("es-MX");

  const captureElementToPng = async (source, options = {}) => {
    if (!(source instanceof Element)) throw new Error("No se encontró el contenido que se debe capturar.");
    const captureId = `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previousCaptureId = source.dataset.scienceCaptureId;
    const revealed = options.revealSelector ? [...source.querySelectorAll(options.revealSelector)].map((node) => ({
      node,
      hidden: node.hidden,
      style: node.getAttribute("style")
    })) : [];
    source.dataset.scienceCaptureId = captureId;
    revealed.forEach(({ node }) => {
      node.hidden = false;
      node.removeAttribute("hidden");
      node.style.setProperty("display", "block", "important");
    });
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const bounds = source.getBoundingClientRect();
      const width = Math.max(1, Math.ceil(Math.max(bounds.width, source.scrollWidth)));
      const height = Math.max(1, Math.ceil(Math.max(bounds.height, source.scrollHeight)));
      const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(16_000_000 / (width * height))));
      const canvas = await html2canvas(source, {
        backgroundColor: null,
        logging: false,
        scale,
        useCORS: true,
        width,
        height,
        windowWidth: Math.max(document.documentElement.clientWidth, width),
        windowHeight: Math.max(document.documentElement.clientHeight, height),
        onclone: (clonedDocument) => {
          const clonedSource = clonedDocument.querySelector(`[data-science-capture-id="${captureId}"]`);
          if (!clonedSource) return;
          [clonedSource, ...clonedSource.querySelectorAll("*")].forEach((node) => {
            node.style.setProperty("animation", "none", "important");
            node.style.setProperty("transition", "none", "important");
          });
          if (options.normalizeResult) {
            clonedSource.style.setProperty("background", "linear-gradient(145deg,#f8fcfd,#eef6f8)", "important");
            clonedSource.style.setProperty("color", "#17354a", "important");
            clonedSource.querySelectorAll("h1,h2,h3,strong,b").forEach((node) => {
              node.style.setProperty("color", "#17354a", "important");
              node.style.setProperty("-webkit-text-fill-color", "#17354a", "important");
            });
            clonedSource.querySelectorAll("p,small,em").forEach((node) => {
              node.style.setProperty("color", "#587281", "important");
              node.style.setProperty("-webkit-text-fill-color", "#587281", "important");
            });
            clonedSource.querySelectorAll(".sa-score-summary>div,.science-score-summary>div,.sa-player-rank,.science-player-rank").forEach((node) => {
              node.style.setProperty("background", "#e8f3f5", "important");
              node.style.setProperty("border-color", "#b8d5dc", "important");
            });
            clonedSource.querySelectorAll(".sa-level-stars i,.science-level-stars span").forEach((node) => node.style.setProperty("color", "#cbd8d5", "important"));
            clonedSource.querySelectorAll(".sa-level-stars .is-active,.science-level-stars .is-active").forEach((node) => node.style.setProperty("color", "#a6df32", "important"));
          }
          if (options.excludeSelector) clonedSource.querySelectorAll(options.excludeSelector).forEach((node) => node.remove());
        }
      });
      return await new Promise((resolve, reject) => canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("No fue posible crear la captura PNG.")),
        "image/png"
      ));
    } finally {
      if (previousCaptureId) source.dataset.scienceCaptureId = previousCaptureId;
      else delete source.dataset.scienceCaptureId;
      revealed.forEach(({ node, hidden, style }) => {
        node.hidden = hidden;
        if (style == null) node.removeAttribute("style");
        else node.setAttribute("style", style);
      });
    }
  };

  const copyCaptureToClipboard = async (source, filename, options = {}) => {
    const blobPromise = captureElementToPng(source, options);
    if (typeof globalThis.__SCIENCE_WRITE_CAPTURE__ === "function") {
      await globalThis.__SCIENCE_WRITE_CAPTURE__(blobPromise);
      return "copied";
    }
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([new globalThis.ClipboardItem({ "image/png": blobPromise })]);
        return "copied";
      } catch (_) { /* La descarga conserva la captura cuando el portapapeles está restringido. */ }
    }
    const blob = await blobPromise;
    const download = document.createElement("a");
    download.href = URL.createObjectURL(blob);
    download.download = filename;
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(download.href), 1500);
    return "downloaded";
  };

  const shareLevelResult = async (button) => {
    if (button?.disabled) return;
    const originalMarkup = button.innerHTML;
    try {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copiando captura…';
      const captureTarget = layer.querySelector(".sa-level-complete-card") || layer;
      const outcome = await copyCaptureToClipboard(captureTarget, "resultado-science-activities.png", { excludeSelector: ".sa-result-actions", normalizeResult: true });
      showToast(outcome === "copied" ? "Captura del resultado copiada. Ya puedes pegarla." : "El navegador bloqueó el portapapeles; se descargó la captura PNG.");
    } catch (error) {
      showToast(error?.message || "No fue posible copiar la captura.");
    } finally {
      button.disabled = false;
      button.innerHTML = originalMarkup;
    }
  };

  const calculateQuestionScore = () => {
    if (session.scoreAwarded) return session.questionScore;
    session.scoreAwarded = true;
    session.questionScore = 0;
    session.scoreBreakdown = [];

    if (!session.answeredCorrectly) {
      progress.streak = 0;
      return 0;
    }

    const questionKey = `${progress.level}:${progress.question}`;
    if (progress.scoredQuestions[questionKey]) {
      session.scoreBreakdown.push("Puntuación ya registrada");
      return 0;
    }

    progress.streak += 1;
    progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
    const configuredPoints = Math.max(0, Math.round(Number(session.assessment?.points) || 0));
    session.questionScore = configuredPoints;
    progress.score += session.questionScore;
    progress.levelScore += session.questionScore;
    progress.scoredQuestions[questionKey] = session.questionScore;
    session.scoreBreakdown = [`Valor de la pregunta +${configuredPoints}`];
    return session.questionScore;
  };

  const progressMarkup = () => {
    const percentage = Math.round(((progress.question - 1) / questionsPerLevel) * 100);
    return `<div class="sa-level-progress">
      <div><strong>Nivel ${progress.level} de ${totalLevels}</strong><span>${isLabMode ? "Práctica experimental" : `Pregunta ${progress.question} de ${questionsPerLevel}`}</span></div>
      <i><span style="width:${percentage}%"></span></i>
    </div>`;
  };

  const setControlsEnabled = (enabled) => {
    controls.querySelectorAll("button, input, select").forEach((control) => {
      control.disabled = !enabled;
    });
  };

  const applyAnswerPreset = (answerSeed, correct) => {
    const seed = Math.max(1, Number(answerSeed) || 1);
    controls.querySelectorAll('input[type="range"]').forEach((input, index) => {
      const minimum = Number(input.min || 0);
      const maximum = Number(input.max || 100);
      const steps = 9;
      const position = ((seed * (index + 3)) + (index * 2)) % steps;
      const ratio = correct ? .72 + (position / steps) * .22 : .08 + (position / steps) * .22;
      input.value = String(minimum + ((maximum - minimum) * ratio));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  const renderAccessibleQuestion = () => {
    setResultSurface(false);
    frame.classList.remove("is-level-briefing");
    const assessment = session.assessment;
    session.phase = "question";
    layer.className = "sa-assessment-layer";
    layer.innerHTML = `
      <div class="sa-question-world" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="sa-question-card science-question-stage-shell" data-question-type="${assessment.type}">
        <header class="science-question-stage-header">
          <div><small>${getAssessmentTypeLabel(assessment.type)}</small><strong>Nivel ${progress.level} · Pregunta ${progress.question}</strong></div>
          <span>${progressMarkup()}</span>
          <h2>${escapeHtml(completeLearningTitle(assessment.prompt))}</h2>
          ${assessmentLearningContextMarkup(assessment)}
        </header>
        <div class="science-question-stage-interaction">
          <p>Elige tu hipótesis.</p>
          ${assessmentQuestionMarkup(assessment)}
        </div>
      </div>`;
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
  };

  const prepareQuestion = () => {
    session.transitionLocked = false;
    const currentQuestionOffset = ((progress.level - 1) * questionsPerLevel) + progress.question - 1;
    session.assessment = buildAssessment(activity, currentQuestionOffset);
    state.contentQuestionIndex = currentQuestionOffset;
    state.contentSelection = "question";
    renderContentEditor();
    document.querySelector('[data-inspector-tab="questions"]')?.click();
    return session.assessment;
  };

  const navigateFromEditor = (event) => {
    if (!frame.isConnected) return;
    invalidateQuestionRun();
    if (event.detail?.phase === "start") {
      renderPreviewStartScreen(activity);
      frame.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (event.detail?.phase === "introduction") {
      frame.querySelector(".science-preview-start")?.remove();
      progress.level = 1;
      progress.question = 1;
      progress.briefedLevels = [];
      session.assessment = null;
      session.phase = "briefing";
      renderLevelBriefing();
      frame.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    const questionIndex = Math.max(0, Math.min(
      Number(event.detail?.index || 0),
      Math.max(0, totalLevels * questionsPerLevel - 1)
    ));
    progress.level = Math.floor(questionIndex / questionsPerLevel) + 1;
    progress.question = (questionIndex % questionsPerLevel) + 1;
    session.assessment = null;
    prepareQuestion();
    startQuestionGame();
    frame.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  if (window.__scienceActivitiesQuestionNavigator) {
    window.removeEventListener("scienceactivities:select-question", window.__scienceActivitiesQuestionNavigator);
  }
  window.__scienceActivitiesQuestionNavigator = navigateFromEditor;
  window.addEventListener("scienceactivities:select-question", navigateFromEditor);
  const assessmentController = {
    openQuestion(index = 0) {
      navigateFromEditor({ detail: { index } });
      return frame.isConnected;
    },
    continue() {
      const button = layer.querySelector("[data-assessment-continue]");
      if (!button || session.transitionLocked) return false;
      button.click();
      return true;
    },
    retry() {
      const button = layer.querySelector("[data-assessment-retry]");
      if (!button || session.transitionLocked) return false;
      button.click();
      return true;
    },
    async answerCorrectly() {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const activeExercise = frame.querySelector(".science-structured-game");
        if (activeExercise) {
          const detail = { handled: false };
          activeExercise.dispatchEvent(new CustomEvent("scienceactivities:review-correct-answer", { detail }));
          if (detail.handled) {
            if (session.assessment?.type === "graph-plot") {
              const graph = activeExercise.querySelector("[data-graph]");
              const axes = session.assessment.axes || { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
              const xMin = Number(axes.xMin ?? -5);
              const xMax = Number(axes.xMax ?? 5);
              const yMin = Number(axes.yMin ?? -5);
              const yMax = Number(axes.yMax ?? 5);
              const targets = (session.assessment.targetPoints || []).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
              if (graph && xMax > xMin && yMax > yMin) {
                graph.querySelectorAll(".science-graph-point").forEach((marker) => marker.remove());
                targets.forEach((point, index) => {
                  const marker = document.createElement("i");
                  marker.className = "science-graph-point";
                  marker.style.left = `${(point.x - xMin) / (xMax - xMin) * 100}%`;
                  marker.style.top = `${(yMax - point.y) / (yMax - yMin) * 100}%`;
                  marker.dataset.pointIndex = String(index);
                  marker.dataset.coordinate = `(${point.x}, ${point.y})`;
                  marker.setAttribute("aria-hidden", "true");
                  graph.append(marker);
                });
                const coordinate = graph.querySelector("[data-graph-coordinate]");
                if (coordinate) coordinate.textContent = targets.map((point) => `(${point.x}, ${point.y})`).join(" · ");
              }
            }
            return true;
          }
        }
        if (!activeExercise && state.gameInstance?.reviewCorrectAnswer?.()) return true;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return false;
    },
    dispose() {
      invalidateQuestionRun();
      window.removeEventListener("scienceactivities:select-question", navigateFromEditor);
      if (window.__scienceActivitiesQuestionNavigator === navigateFromEditor) {
        window.__scienceActivitiesQuestionNavigator = null;
      }
      if (state.assessmentController === assessmentController) {
        state.assessmentController = null;
      }
    }
  };
  state.assessmentController = assessmentController;

  const startQuestionGame = () => {
    setResultSurface(false);
    frame.classList.remove("is-level-briefing");
    window.ScienceRiveHud?.destroyAll(layer);
    const assessment = session.assessment || prepareQuestion();
    const runId = invalidateQuestionRun();
    session.phase = "experiment";
    layer.className = "sa-assessment-layer is-hidden";
    frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-success", "sa-experiment-failed");
    frame.classList.add("sa-experiment-active");
    setControlsEnabled(false);
    const run = state.gameInstance?.playQuestionGame?.({
      assessment,
      profile: assessment.gameplay || assessment.animation || {},
      gameplay: assessment.gameplay || {},
      subject: activity.subject,
      topic: activity.topic,
      simulationType: activity.simulationType,
      difficulty: activity.difficulty,
      controls: activity.controls,
      visualStyle: activity.visualStyle,
      progress: { level: progress.level, totalLevels, question: progress.question, questionsPerLevel }
    });
    if (!run) {
      session.phase = "question";
      frame.classList.remove("sa-experiment-active");
      renderAccessibleQuestion();
      return;
    }
    Promise.resolve(run).then((result) => {
      if (result?.cancelled || session.phase !== "experiment" || session.runId !== runId) return;
      session.answeredCorrectly = Boolean(result?.correct);
      session.gameResult = result;
      revealResult();
    }).catch((error) => {
      if (session.runId !== runId) return;
      console.error("[ScienceActivities] Question game failed:", error);
      session.phase = "question";
      frame.classList.remove("sa-experiment-active");
      renderAccessibleQuestion();
    });
  };

  const renderLevelBriefing = () => {
    setResultSurface(false);
    session.transitionLocked = false;
    if (progress.briefedLevels.includes(progress.level)) {
      if (isLabMode) beginLabPractice();
      else {
        prepareQuestion();
        startQuestionGame();
      }
      return;
    }
    const guide = activity.learningGuide || buildFallbackLearningGuide(activity);
    const level = guide.levels?.[progress.level - 1] || buildFallbackLearningGuide(activity).levels[0];
    const levelImageSource = resolveLearningGuideImageSource(level);
    const imageMarkup = levelImageSource
      ? `<img class="sa-level-hero" src="${escapeHtml(levelImageSource)}" alt="Ilustración de ${escapeHtml(level.title)}">`
      : `<div class="sa-level-hero sa-level-hero-fallback"><i class="fas fa-atom"></i><span>${escapeHtml(activity.topic)}</span></div>`;
    const concepts = (level.concepts || []).filter((concept) => concept?.term && concept?.definition).slice(0, 2);
    const generatedExample = level?.example && typeof level.example === "object" ? level.example : null;
    const practicalExample = generatedExample?.text
      || [generatedExample?.situation, generatedExample?.result].filter(Boolean).join(" ")
      || (typeof level?.example === "string" ? level.example : "");
    const exampleFormula = String(generatedExample?.formula || "").trim();
    const exampleGuidance = String(generatedExample?.explanation || "").trim();
    const exampleMarkup = practicalExample ? `
          <div class="science-micro-example">
            <span>
              <small>${escapeHtml(generatedExample?.title || "Ejemplo aplicado")}</small>
              <strong>${escapeHtml(practicalExample)}</strong>
              ${exampleFormula ? `<em class="science-micro-formula"><b>Aplicado a este caso</b><code>${escapeHtml(exampleFormula)}</code></em>` : ""}
              ${exampleGuidance ? `<p class="science-micro-example-guidance">${escapeHtml(exampleGuidance)}</p>` : ""}
            </span>
          </div>` : "";
    const microLevelConcepts = concepts
      .map((concept) => String(concept?.term || "").trim())
      .filter((term, index, all) => term && all.findIndex((item) => normalizeAnswer(item) === normalizeAnswer(term)) === index)
      .slice(0, 2);
    const microLevelTitle = microLevelConcepts.length
      ? `${activity.topic}: ${microLevelConcepts.join(" y ")}`
      : level.objective || level.title || `${activity.topic} · Etapa ${progress.level}`;
    const experienceContext = deriveScienceActivityContext(activity);
    const experienceBriefing = progress.level === 1 ? buildExperienceBriefingCarousel([
      { label: "Objetivo del juego", text: experienceContext.objective },
      { label: activity.subject === "math" ? "Principio matemático" : "Principio científico", text: experienceContext.scientificPrinciple }
    ]) : "";
    session.phase = "briefing";
    frame.classList.add("is-level-briefing");
    layer.className = "sa-assessment-layer sa-briefing-layer";
    layer.innerHTML = `
      <article class="science-rive-briefing-screen science-micro-mission">
        <div class="science-micro-visual">
          ${imageMarkup}
          <div class="science-micro-level"><span>Etapa ${progress.level} de ${Math.max(1, Number(activity.levelCount || activity.learningGuide?.levels?.length || 1))}</span><strong>${escapeHtml(completeLearningTitle(microLevelTitle))}</strong></div>
        </div>
        <div class="science-micro-content">
          ${progressMarkup()}
          <div class="science-micro-kicker"><span>Micro-misión</span><b>${progress.question}/${questionsPerLevel}</b></div>
          ${experienceBriefing}
          <h2>${escapeHtml(completeLearningTitle(level.objective || activity.mission))}</h2>
          <div class="science-micro-concepts">
            ${concepts.map((concept, index) => `
              <div class="science-micro-concept">
                <span>0${index + 1}</span>
                <p><strong>${escapeHtml(completeLearningTitle(concept.term))}</strong><span>${escapeHtml(completeLearningTitle(concept.definition))}</span></p>
              </div>
            `).join("")}
          </div>
          ${exampleMarkup}
          <button class="sa-start-level science-micro-launch" type="button" data-assessment-start-level><span>${isLabMode ? "Abrir práctica" : "Iniciar la Actividad"}</span><i class="fas fa-arrow-right" aria-hidden="true"></i></button>
        </div>
      </article>`;
    installResponsiveIntroductionLayout(frame, layer);
    initializeExperienceBriefingCarousel(layer);
    requestAnimationFrame(() => window.ScienceRiveHud?.mountAll(layer));
    setControlsEnabled(false);
    sceneCheck.classList.remove("show");
  };

  const beginLabPractice = () => {
    setResultSurface(false);
    frame.classList.remove("is-level-briefing");
    window.ScienceRiveHud?.destroyAll(layer);
    session.phase = "lab";
    session.answeredCorrectly = false;
    layer.classList.add("is-hidden");
    controls.classList.remove("sa-game-controls-hidden");
    setControlsEnabled(true);
    sceneOutcome.classList.remove("show");
    sceneCheck.disabled = false;
    sceneCheck.innerHTML = "<i class=\"fas fa-flask-vial\"></i><span>Comprobar práctica</span>";
    sceneCheck.classList.add("show");
    frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-success", "sa-experiment-failed");
  };

  const validateLabPractice = () => {
    if (session.phase !== "lab") return;
    const target = Number(activity.challenge?.targetValue ?? 50);
    const tolerance = Math.max(0, Number(activity.challenge?.tolerance ?? 5));
    const ranges = [...controls.querySelectorAll('input[type="range"]')];
    const normalizedTargetLabel = normalizeAnswer(activity.challenge?.targetLabel);
    const targetControlIndex = (activity.controls || []).findIndex((control) => {
      const label = normalizeAnswer(control.label);
      return label === normalizedTargetLabel || label.includes(normalizedTargetLabel) || normalizedTargetLabel.includes(label);
    });
    const testedRange = ranges[targetControlIndex] || ranges.find((input) => target >= Number(input.min) && target <= Number(input.max)) || ranges[0];
    const testedValue = Number(testedRange?.value ?? Number.NaN);
    session.answeredCorrectly = Number.isFinite(testedValue) && Math.abs(testedValue - target) <= tolerance;
    session.phase = "lab-running";
    sceneCheck.disabled = true;
    sceneCheck.classList.remove("show");
    controls.querySelector(".science-action:not(.secondary)")?.click();
    frame.classList.add("sa-experiment-active");
    window.setTimeout(() => {
      session.phase = "experiment";
      frame.classList.add(session.answeredCorrectly ? "sa-experiment-success" : "sa-experiment-failed");
      revealResult();
    }, 1400);
  };

  const beginExperiment = (correct, answerSeed = 1) => {
    const runId = invalidateQuestionRun();
    session.answeredCorrectly = correct;
    session.phase = "experiment";
    applyAnswerPreset(answerSeed, correct);
    layer.classList.add("is-hidden");
    frame.classList.remove("sa-experiment-success", "sa-experiment-failed");
    frame.classList.add("sa-experiment-active");
    sceneOutcome.classList.remove("show");
    sceneCheck.classList.remove("show");
    setControlsEnabled(false);
    window.setTimeout(() => {
      if (session.runId === runId && session.phase === "experiment") revealResult();
    }, 260);
  };

  const revealResult = () => {
    if (session.phase !== "experiment") return;
    calculateQuestionScore();
    const labFeedback = session.answeredCorrectly
      ? `La práctica alcanzó ${activity.challenge?.targetLabel || "el objetivo experimental"} dentro de la tolerancia permitida.`
      : `La prueba quedó fuera del objetivo. Ajusta las variables para aproximarte a ${activity.challenge?.targetValue ?? "el valor indicado"} ± ${activity.challenge?.tolerance ?? 5}.`;
    session.phase = "result";
    sceneOutcome.classList.remove("show");
    sceneCheck.classList.remove("show");
    frame.classList.remove("sa-experiment-active", "sa-experiment-success", "sa-experiment-failed");
    frame.classList.add(session.answeredCorrectly ? "sa-result-correct" : "sa-result-incorrect");
    setResultSurface(true);
    layer.className = `sa-assessment-layer is-result ${session.answeredCorrectly ? "is-correct" : "is-incorrect"}`;
    layer.innerHTML = `
      <article class="science-rive-result-screen" role="dialog" aria-modal="true" aria-labelledby="scienceResultTitle" tabindex="-1">
        <div class="science-rive-result-content">
          ${progressMarkup()}
          <small>${isLabMode ? (session.answeredCorrectly ? "Práctica correcta" : "Práctica por corregir") : (session.answeredCorrectly ? "Hipótesis confirmada" : "Hipótesis por revisar")}</small>
          <h2 id="scienceResultTitle">${isLabMode ? (session.answeredCorrectly ? "¡Procedimiento validado!" : "La configuración no alcanzó el objetivo") : (session.answeredCorrectly ? "¡La evidencia coincide!" : "El experimento mostró otra relación")}</h2>
          <p>${escapeHtml(isLabMode ? labFeedback : (session.assessment.feedback || "Observa las variables, cambia una a la vez y vuelve a probar."))}</p>
          <div class="science-rive-result-proof ${session.answeredCorrectly ? "is-positive" : "is-zero"}">
            <i class="fas ${session.answeredCorrectly ? "fa-bolt" : "fa-rotate-left"}"></i>
            <span><small>${session.answeredCorrectly ? "Puntos obtenidos" : "Racha reiniciada"}</small><strong>${session.answeredCorrectly ? `+${formatScore(session.questionScore)}` : "0 puntos"}</strong></span>
            <em>${escapeHtml(session.scoreBreakdown.join(" · ") || (session.answeredCorrectly ? "Acierto confirmado" : "Reintenta para sumar puntos"))}</em>
          </div>
          <div class="sa-result-actions science-rive-result-actions">
          <button type="button" data-assessment-retry><i class="fas fa-rotate-left"></i> Reintentar</button>
          <button type="button" data-assessment-continue><i class="fas fa-arrow-right"></i> ${isLabMode ? "Concluir práctica" : (progress.question === questionsPerLevel ? "Concluir nivel" : "Siguiente pregunta")}</button>
          </div>
        </div>
      </article>`;
    requestAnimationFrame(() => {
      layer.querySelector(".science-rive-result-screen")?.focus({ preventScroll: true });
    });
  };

  const renderLevelConclusion = () => {
    session.transitionLocked = false;
    const isLastLevel = progress.level >= totalLevels;
    const totalQuestions = totalLevels * questionsPerLevel;
    const accuracy = Math.round((progress.correctAnswers / Math.max(1, progress.completedQuestions)) * 100);
    const rank = accuracy >= 90 ? "Investigador élite" : accuracy >= 75 ? "Analista científico" : accuracy >= 60 ? "Explorador de laboratorio" : "Aprendiz científico";
    const starCount = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : 1;
    session.phase = isLastLevel ? "game-complete" : "level-complete";
    frame.classList.remove("sa-result-correct", "sa-result-incorrect");
    frame.classList.add("sa-result-correct");
    setResultSurface(true);
    layer.className = "sa-assessment-layer is-result is-correct";
    layer.innerHTML = `
      <div class="sa-question-card sa-result-card sa-level-complete-card">
        <div class="sa-level-stars">${[1, 2, 3].map((star) => `<i class="fas fa-star ${star <= starCount ? "is-active" : ""}"></i>`).join("")}</div>
        <small>${isLastLevel ? "Juego concluido" : `Nivel ${progress.level} superado`}</small>
        <h2>${isLastLevel ? "¡Misión científica completada!" : (isLabMode ? "Práctica de laboratorio completada" : "Todas las preguntas fueron experimentadas")}</h2>
        <p>${isLastLevel
          ? (isLabMode ? `Completaste ${totalLevels} prácticas y validaste ${progress.correctAnswers} procedimientos.` : `Completaste ${totalQuestions} preguntas y confirmaste ${progress.correctAnswers} hipótesis.`)
          : (isLabMode ? "Concluiste la práctica. El siguiente nivel presenta un nuevo procedimiento experimental." : `Concluiste las ${questionsPerLevel} preguntas del nivel. El siguiente nivel tendrá nuevas formas de responder y experimentar.`)}</p>
        <div class="sa-score-summary">
          <div><small>Score total</small><strong>${formatScore(progress.score)}</strong></div>
          <div><small>Puntos del nivel</small><strong>${formatScore(progress.levelScore)}</strong></div>
          <div><small>Precisión</small><strong>${accuracy}%</strong></div>
          <div><small>Mejor racha</small><strong>${progress.bestStreak}</strong></div>
        </div>
        <div class="sa-player-rank"><i class="fas fa-medal"></i><span><small>Rango científico</small><strong>${rank}</strong></span></div>
        <div class="sa-result-actions">
          <button class="sa-share-result science-share-result" type="button" data-assessment-share-result><i class="fas fa-copy"></i> Copiar captura</button>
          <button type="button" ${isLastLevel ? "data-assessment-restart-game" : "data-assessment-next-level"}>
            <i class="fas ${isLastLevel ? "fa-rotate" : "fa-flag-checkered"}"></i>
            ${isLastLevel ? "Jugar de nuevo" : `Comenzar nivel ${progress.level + 1}`}
          </button>
        </div>
      </div>`;
  };

  const submitAssessmentForm = (form) => {
    if (session.phase !== "question" || !form || !form.reportValidity()) return;
    if (session.assessment.type === "keyword") {
      const value = normalizeAnswer(form.querySelector("input").value);
      beginExperiment(
        session.assessment.accepted.some((answer) => normalizeAnswer(answer) === value),
        assessmentHash(value)
      );
      return;
    }
    const selections = [...form.querySelectorAll("select")].map((select) => select.value);
    if (selections.some((selection) => !selection)) return;
    beginExperiment(
      selections.every((selection, index) => selection === session.assessment.pairs[index][1]),
      assessmentHash(selections.join("|"))
    );
  };

  layer.addEventListener("click", (event) => {
    const submitButton = event.target.closest("[data-assessment-submit]");
    if (submitButton) {
      event.preventDefault();
      submitAssessmentForm(submitButton.closest("form"));
      return;
    }
    if (event.target.closest("[data-assessment-start-level]")) {
      progress.briefedLevels.push(progress.level);
      if (isLabMode) beginLabPractice();
      else {
        prepareQuestion();
        startQuestionGame();
      }
      return;
    }
    const answer = event.target.closest("[data-assessment-answer]");
    if (answer && session.phase === "question") {
      const answerIndex = Number(answer.dataset.assessmentAnswer);
      const correctAnswers = Array.isArray(session.assessment.correctAnswers) && session.assessment.correctAnswers.length
        ? session.assessment.correctAnswers
        : [session.assessment.correct];
      if (correctAnswers.length > 1) {
        answer.classList.toggle("is-selected");
        return;
      }
      beginExperiment(correctAnswers.includes(answerIndex), answerIndex + 1);
      return;
    }
    if (event.target.closest("[data-assessment-check-answers]") && session.phase === "question") {
      const selected = [...layer.querySelectorAll("[data-assessment-answer].is-selected")].map((button) => Number(button.dataset.assessmentAnswer)).sort((a, b) => a - b);
      const correctAnswers = [...(session.assessment.correctAnswers || [session.assessment.correct])].map(Number).sort((a, b) => a - b);
      if (!selected.length) return;
      beginExperiment(selected.length === correctAnswers.length && selected.every((value, index) => value === correctAnswers[index]), selected.reduce((sum, value) => sum + value + 1, 0));
      return;
    }
    if (event.target.closest("[data-assessment-retry]")) {
      if (session.transitionLocked) return;
      session.transitionLocked = true;
      invalidateQuestionRun();
      session.retries += 1;
      session.scoreAwarded = false;
      session.questionScore = 0;
      session.scoreBreakdown = [];
      session.gameResult = null;
      state.gameInstance?.reset?.();
      if (isLabMode) beginLabPractice();
      else {
        prepareQuestion();
        startQuestionGame();
      }
      sceneOutcome.classList.remove("show");
      frame.classList.remove("sa-result-correct", "sa-result-incorrect", "sa-experiment-success", "sa-experiment-failed");
      return;
    }
    if (event.target.closest("[data-assessment-continue]")) {
      if (session.transitionLocked) return;
      session.transitionLocked = true;
      invalidateQuestionRun();
      progress.completedQuestions += 1;
      if (session.answeredCorrectly) progress.correctAnswers += 1;
      state.gameInstance?.reset?.();
      if (isLabMode || progress.question >= questionsPerLevel) renderLevelConclusion();
      else {
        progress.question += 1;
        prepareQuestion();
        startQuestionGame();
      }
      return;
    }
    const shareButton = event.target.closest("[data-assessment-share-result]");
    if (shareButton) {
      shareLevelResult(shareButton);
      return;
    }
    if (event.target.closest("[data-assessment-next-level]")) {
      if (session.transitionLocked) return;
      session.transitionLocked = true;
      invalidateQuestionRun();
      progress.level += 1;
      progress.question = 1;
      progress.levelScore = 0;
      session.assessment = null;
      session.phase = "briefing";
      session.answeredCorrectly = false;
      session.retries = 0;
      session.questionScore = 0;
      session.scoreAwarded = false;
      session.scoreBreakdown = [];
      session.gameResult = null;
      state.gameInstance?.reset?.();
      state.contentQuestionIndex = (progress.level - 1) * questionsPerLevel;
      renderContentEditor();
      session.transitionLocked = false;
      renderLevelBriefing();
      return;
    }
    if (event.target.closest("[data-assessment-restart-game]")) {
      invalidateQuestionRun();
      state.editorReviewProgress = {
        level: 1,
        question: 1,
        correctAnswers: 0,
        completedQuestions: 0,
        briefedLevels: [],
        score: 0,
        levelScore: 0,
        streak: 0,
        bestStreak: 0,
        scoredQuestions: {}
      };
      state.gameInstance?.reset?.();
      mountAssessmentFlow(activity);
    }
  });

  layer.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAssessmentForm(event.target.closest("form"));
  });

  if (state.assessmentControlHandler) controls.removeEventListener("click", state.assessmentControlHandler);
  state.assessmentControlHandler = (event) => {
    if (!event.target.closest(".science-action:not(.secondary)") || session.phase !== "free") return;
    showToast("Experimento libre ejecutado.");
  };
  controls.addEventListener("click", state.assessmentControlHandler);

  sceneCheck.addEventListener("click", () => {
    if (session.phase === "experiment") revealResult();
    else if (session.phase === "lab") validateLabPractice();
    else if (session.phase === "free") controls.querySelector(".science-action:not(.secondary)")?.click();
  });

  modeToggle.addEventListener("click", () => {
    if (session.phase !== "free") {
      session.previousPhase = session.phase;
      session.phase = "free";
      state.gameInstance?.reset?.();
      layer.classList.add("is-hidden");
      sceneOutcome.classList.remove("show");
      frame.classList.remove("sa-experiment-active", "sa-experiment-success", "sa-experiment-failed", "sa-result-correct", "sa-result-incorrect");
      controls.classList.remove("sa-game-controls-hidden");
      setControlsEnabled(true);
      sceneCheck.classList.add("show");
      modeToggle.innerHTML = "<i class=\"fas fa-gamepad\"></i><span>Volver al juego</span>";
      requestAnimationFrame(() => controls.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      return;
    }
    state.gameInstance?.reset?.();
    session.phase = "question";
    controls.classList.add("sa-game-controls-hidden");
    sceneCheck.classList.remove("show");
    sceneOutcome.classList.remove("show");
    frame.classList.remove("sa-experiment-active", "sa-experiment-success", "sa-experiment-failed", "sa-result-correct", "sa-result-incorrect");
    modeToggle.innerHTML = "<i class=\"fas fa-sliders\"></i><span>Modo libre</span>";
    layer.classList.remove("is-hidden");
    setControlsEnabled(false);
    if (activity.gameMode === "lab") beginLabPractice();
    else {
      prepareQuestion();
      startQuestionGame();
    }
  });

  session.revealResult = revealResult;
  renderLevelBriefing();
}

let experienceProposalMemoryCache = null;

function readExperienceProposalMemory() {
  if (experienceProposalMemoryCache) return experienceProposalMemoryCache;
  try {
    const stored = JSON.parse(localStorage.getItem(EXPERIENCE_PROPOSAL_MEMORY_KEY) || "null");
    experienceProposalMemoryCache = {
      counter: Math.max(0, Number(stored?.counter || 0)),
      items: Array.isArray(stored?.items) ? stored.items.slice(-30) : []
    };
  } catch {
    experienceProposalMemoryCache = { counter: 0, items: [] };
  }
  return experienceProposalMemoryCache;
}

function writeExperienceProposalMemory(memory) {
  experienceProposalMemoryCache = {
    counter: Math.max(0, Number(memory?.counter || 0)),
    items: Array.isArray(memory?.items) ? memory.items.slice(-30) : []
  };
  try {
    localStorage.setItem(EXPERIENCE_PROPOSAL_MEMORY_KEY, JSON.stringify(experienceProposalMemoryCache));
  } catch (error) {
    console.warn("[ScienceActivities] No se pudo guardar el historial de propuestas:", error);
  }
}

function proposalComparisonTokens(value) {
  const stopWords = new Set([
    "para", "como", "esta", "este", "estos", "estas", "desde", "entre", "sobre", "cuando",
    "deben", "pueden", "cada", "donde", "hasta", "segun", "mediante", "estudiantes", "equipo",
    "datos", "resultado", "resultados", "variable", "variables", "observar", "comprobar"
  ]);
  return new Set(String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !stopWords.has(token)));
}

function proposalSimilarity(left, right) {
  const a = proposalComparisonTokens(left);
  const b = proposalComparisonTokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach((token) => {
    if (b.has(token)) intersection += 1;
  });
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

function proposalIsDistinct(proposal, previousProposals) {
  const normalized = String(proposal || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return previousProposals.every((previous) => {
    const prior = String(previous || "").replace(/\s+/g, " ").trim().toLowerCase();
    return normalized !== prior && proposalSimilarity(normalized, prior) < .46;
  });
}

function completeProposalSentence(value) {
  const sentence = String(value || "").replace(/\s+/g, " ").trim();
  if (!sentence) return "";
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function rememberExperienceProposal({ subject, topic, proposal, routeKey }) {
  const memory = readExperienceProposalMemory();
  memory.items.push({
    subject,
    topic,
    proposal,
    routeKey,
    createdAt: new Date().toISOString()
  });
  memory.items = memory.items.slice(-30);
  writeExperienceProposalMemory(memory);
}

async function generateExperienceProposalLegacy() {
  if ($("#gameModeSelect").value === "simulator") {
    showToast("El simulador usa la experiencia científica curada del tema seleccionado.");
    return;
  }
  const button = $("#generateExperienceBtn");
  if (button.dataset.loading === "true") return;
  const subject = $("#subjectSelect").value;
  const topic = getSelectedTopic();
  const grade = $("#gradeSelect").value;
  const difficulty = $("#difficultySelect").value;
  const gameMode = $("#gameModeSelect").value;
  const topicTemplate = resolveTopicTemplate(subject, topic);
  const supportedControls = (topicTemplate.variant === "hydraulic" ? HYDRAULIC_CONTROL_PRESET : CONTROL_PRESETS[topicTemplate.type] || [])
    .map((control) => ({
      label: control.label,
      unit: control.unit,
      effect: control.effect
    }));
  const supportedControlLabels = supportedControls.map((control) => control.label);
  const supportedControlDescription = supportedControls
    .map((control) => `${control.label}${control.unit ? ` (${control.unit})` : ""}: ${control.effect}`)
    .join("; ");
  const currentProposal = $("#experiencePrompt").value.trim();
  const memory = readExperienceProposalMemory();
  const recentProposals = memory.items
    .filter((item) => item.subject === subject && String(item.topic).toLowerCase() === String(topic).toLowerCase())
    .slice(-6)
    .map((item) => item.proposal)
    .filter(Boolean);
  const isProposalRevision = Boolean(currentProposal);
  const originalButtonHtml = button.innerHTML;
  button.dataset.loading = "true";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Proponiendo…</span>';
  try {
    let acceptedProposal = "";
    let revisionFeedback = "";
    const protectedAnchors = isProposalRevision
      ? extractExperienceAnchors(currentProposal).map(({ token }) => token)
      : [];
    for (let attempt = 0; attempt < 3 && !acceptedProposal; attempt += 1) {
      const exclusions = !isProposalRevision && recentProposals.length
        ? recentProposals.map((proposal, index) => `${index + 1}. ${proposal.slice(0, 360)}`).join("\n")
        : "No existen restricciones históricas para esta adaptación.";
      const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
        method: "POST",
        body: {
          model: $("#modelSelect").value,
          payload: {
            systemInstruction: {
              parts: [{
                text: [
                  "Eres especialista en didáctica STEM y diseño de experiencias auténticas para secundaria.",
                  gameMode === "simulator"
                    ? "Diseñas simuladores científicos de exploración libre: variables continuas, medición en tiempo real, gráfica y fenómeno visual; nunca preguntas, niveles, puntuación ni respuestas correctas."
                    : "Diseñas videojuegos educativos con una misión clara, decisiones, evidencia, reto progresivo y retroalimentación; no los describas como un panel de sliders libre.",
                  "Cada propuesta debe representar un uso plausible del conocimiento fuera del aula, ser científicamente correcta y segura.",
                  "No aceptes contextos decorativos: la medición debe servir para tomar una decisión realista.",
                  "El adolescente debe ser protagonista y reconocer la situación como cercana a su realidad.",
                  isProposalRevision
                    ? "Actúas como diseñador de experiencias y editor fiel: el texto docente es un brief curricular obligatorio. Conserva todos sus temas, objetivos, objetos y acciones, pero desarróllalos dentro de una experiencia completa, coherente y jugable; no te limites a corregir o reordenar sus frases."
                    : "Elige el contexto libremente: no sigas listas, ejemplos predefinidos ni plantillas de profesiones."
                ].join(" ")
              }]
            },
            contents: [{
              role: "user",
              parts: [{
                text: [
                  isProposalRevision
                    ? `Revisa y mejora la propuesta manual del docente para ${SUBJECT_LABELS[subject]} sobre ${topic}.`
                    : `Diseña una propuesta nueva para ${SUBJECT_LABELS[subject]} sobre ${topic}.`,
                  `Nivel escolar: ${grade}. Dificultad: ${difficulty}.`,
                  `Modalidad: ${gameMode === "simulator" ? "simulador de exploración con variables editables" : "videojuego educativo basado en evidencia"}.`,
                  `Variables disponibles que puedes integrar cuando ayuden a convertir el contenido en acciones jugables: ${supportedControlDescription || "No hay variables adicionales disponibles."}.`,
                  isProposalRevision ? `BRIEF MANUAL OBLIGATORIO: TODOS ESTOS TEMAS E IDEAS DEBEN APARECER INTEGRADOS EN LA EXPERIENCIA FINAL:\n${currentProposal}` : "",
                  isProposalRevision && protectedAnchors.length
                    ? `ELEMENTOS LITERALES PROTEGIDOS QUE DEBEN SEGUIR RECONOCIBLES EN EL RESULTADO: ${protectedAnchors.join(", ")}.`
                    : "",
                  revisionFeedback,
                  isProposalRevision
                    ? "En preservedElements enumera palabras o frases concretas del texto docente que mantuviste; esta lista no sustituye la obligación de incluirlas también dentro de las tres oraciones."
                    : "En preservedElements devuelve una lista vacía.",
                  "En usedVariables enumera únicamente variables disponibles que realmente integraste en las acciones de la experiencia.",
                  "",
                  isProposalRevision
                    ? "Convierte el brief manual en una experiencia clara, completa, cotidiana y directamente realizable por adolescentes: crea una situación articuladora, acciones concretas, progresión y una decisión basada en evidencia, sin omitir ninguno de los temas aportados."
                    : "Inventa libremente una situación actual, cotidiana y específica con la que un adolescente pueda identificarse y actuar directamente.",
                  "No obligues al estudiante a representar un empleo adulto o una institución para justificar el experimento.",
                  isProposalRevision
                    ? "Puedes añadir contexto narrativo, acciones jugables, secuencia, mediciones, evidencia y consecuencias compatibles con el tema seleccionado y las variables disponibles. No añadas temas académicos ajenos ni sustituyas los contenidos del docente."
                    : "Usa como variables manipulables únicamente las variables disponibles indicadas. Puedes adaptar el contexto real, pero no sustituirlas por otras.",
                  isProposalRevision
                    ? "No agregues conceptos curriculares, sustancias o procesos científicos ajenos al brief, al tema seleccionado o a las variables disponibles. Los detalles nuevos deben servir para experimentar, comparar y decidir sobre los contenidos manuales."
                    : "Relaciona directamente esas variables con el fenómeno científico del tema. No inventes instrumentos, efectos, datos ni relaciones causales imposibles.",
                  isProposalRevision
                    ? "Conserva el alcance completo aunque incluya varios temas. Integra esos temas en una sola experiencia con misión, acciones observables, progresión y evidencia; evita presentarlos como una lista de objetivos o una simple paráfrasis."
                    : gameMode === "simulator"
                    ? "La experiencia debe permitir explorar libremente al menos dos variables continuas, ejecutar y pausar el fenómeno, observar una medición y una gráfica, comparar configuraciones y formular una conclusión. El objetivo es opcional y nunca bloquea la exploración."
                    : "La experiencia debe convertir al menos dos variables disponibles en decisiones dentro de una misión jugable, con riesgo o consecuencia comprensible, evidencia para superar el reto y retroalimentación; puede usar preguntas, niveles y puntuación.",
                  "Evita frases genéricas como «comprender el tema», «aprender de forma divertida», «situación de la vida real» o «realizar un experimento».",
                  isProposalRevision
                    ? "No reemplaces el brief por una plantilla, profesión, laboratorio o misión genérica. El contexto nuevo debe conectar y hacer operables las ideas manuales, no desplazarlas."
                    : "No repitas ni parafrasees estas propuestas recientes:",
                  isProposalRevision ? "" : exclusions,
                  "",
                  isProposalRevision
                    ? "Devuelve tres bloques complementarios que ya formen la experiencia final: situación o misión que integra todos los temas manuales; acciones y progresión del estudiante; evidencia, comparación y decisión final. Cada bloque puede contener varias oraciones. No devuelvas una lista ni una corrección cosmética del original."
                    : gameMode === "simulator"
                    ? "Devuelve tres oraciones complementarias: fenómeno cotidiano, variables que se explorarán y medición/gráfica que permitirá comparar resultados. No presentes una única respuesta correcta."
                    : "Devuelve tres oraciones complementarias: misión cotidiana, acciones jugables y evidencia necesaria para tomar la decisión o superar el reto.",
                  "No incluyas título, código, markdown ni nombres de estilos visuales."
                ].join("\n")
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  authenticContext: { type: "STRING" },
                  studentAction: { type: "STRING" },
                  evidenceAndDecision: { type: "STRING" },
                  usedVariables: {
                    type: "ARRAY",
                    minItems: Math.min(2, supportedControlLabels.length),
                    maxItems: 4,
                    items: supportedControlLabels.length
                      ? { type: "STRING", enum: supportedControlLabels }
                      : { type: "STRING" }
                  },
                  preservedElements: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                  }
                },
                required: ["authenticContext", "studentAction", "evidenceAndDecision", "usedVariables", "preservedElements"]
              },
              temperature: isProposalRevision ? .58 : .92,
              topP: .95
            }
          }
        }
      });
      const generated = parseGeneratedJson(extractResponseText(response));
      const parts = [
        completeProposalSentence(generated?.authenticContext),
        completeProposalSentence(generated?.studentAction),
        completeProposalSentence(generated?.evidenceAndDecision)
      ].filter(Boolean);
      const candidate = cleanVisualConfigurationReferences(parts.join(" "));
      const usedVariables = Array.isArray(generated?.usedVariables)
        ? [...new Set(generated.usedVariables.filter((label) => supportedControlLabels.includes(label)))]
        : [];
      const hasCompleteStructure = parts.length === 3
        && usedVariables.length >= Math.min(2, supportedControlLabels.length)
        && candidate.length >= 140
        && candidate.length <= (isProposalRevision ? 2200 : 900);
      const preservation = isProposalRevision
        ? experienceSourcePreservation(currentProposal, candidate)
        : { valid: true, missing: [] };
      const adaptation = isProposalRevision
        ? experienceAdaptationAddsValue(currentProposal, candidate)
        : { valid: true };
      const proposalWasImproved = !isProposalRevision || normalizeAnswer(candidate) !== normalizeAnswer(currentProposal);
      const unrequestedConcepts = isProposalRevision && subject === "biology"
        ? findUnrequestedBiologyConcepts(`${currentProposal} ${topic} ${supportedControlDescription}`, candidate)
        : [];
      const isAcceptablyDistinct = isProposalRevision || proposalIsDistinct(candidate, recentProposals);
      if (hasCompleteStructure && proposalWasImproved && preservation.valid && adaptation.valid && !unrequestedConcepts.length && isAcceptablyDistinct) {
        acceptedProposal = candidate;
      } else if (candidate) {
        if (!isProposalRevision) recentProposals.push(candidate);
        if (isProposalRevision && !preservation.valid) {
          revisionFeedback = `CORRECCIÓN OBLIGATORIA DEL INTENTO ANTERIOR: omitiste estos elementos del texto docente: ${preservation.missing.join(", ")}. Reescribe conservándolos explícitamente; no inventes otro escenario.`;
        } else if (isProposalRevision && !adaptation.valid) {
          revisionFeedback = "CORRECCIÓN OBLIGATORIA DEL INTENTO ANTERIOR: sólo reorganizaste o parafraseaste el brief. Conserva todos sus temas, pero conviértelos en una experiencia desarrollada con situación, acciones jugables, progresión, evidencia y una decisión final.";
        } else if (isProposalRevision && unrequestedConcepts.length) {
          revisionFeedback = `CORRECCIÓN OBLIGATORIA DEL INTENTO ANTERIOR: agregaste conceptos no solicitados (${unrequestedConcepts.join(", ")}). Elimínalos y utiliza exclusivamente el contenido de la propuesta manual.`;
        }
      }
    }
    if (!acceptedProposal) {
      throw new Error(isProposalRevision
        ? "La IA no logró adaptar la experiencia sin cambiar su esencia. Se conservó intacto tu texto; intenta de nuevo."
        : "La IA repitió una propuesta anterior o no produjo una situación real coherente. Intenta nuevamente.");
    }
    rememberExperienceProposal({
      subject,
      topic,
      proposal: acceptedProposal,
      routeKey: crypto.randomUUID()
    });
    $("#experiencePrompt").value = acceptedProposal;
    $("#experiencePrompt").dispatchEvent(new Event("input", { bubbles: true }));
    showToast(isProposalRevision ? "Brief manual convertido en una experiencia completa con IA." : "Propuesta auténtica y diferente creada con IA.");
  } catch (error) {
    console.error("[ScienceActivities] Experience proposal failed:", error);
    showToast(error?.message || "No fue posible crear la propuesta experimental.");
  } finally {
    button.dataset.loading = "false";
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = originalButtonHtml;
  }
}

async function generateExperienceProposal() {
  if ($("#gameModeSelect").value === "simulator") {
    showToast("El simulador usa la experiencia científica curada del tema seleccionado.");
    return;
  }
  const button = $("#generateExperienceBtn");
  if (button.dataset.loading === "true") return;
  const subject = $("#subjectSelect").value;
  const topic = getSelectedTopic();
  const grade = $("#gradeSelect").value;
  const difficulty = $("#difficultySelect").value;
  const expectedLearnings = $("#expectedLearnings").value.trim();
  const learningStatements = parseExpectedLearningStatements(expectedLearnings);
  const experienceSeed = $("#experiencePrompt").value.trim();
  const memory = readExperienceProposalMemory();
  const recentProposals = memory.items
    .filter((item) => item.subject === subject && String(item.topic).toLowerCase() === String(topic).toLowerCase())
    .slice(-6)
    .map((item) => item.proposal)
    .filter(Boolean);
  const originalButtonHtml = button.innerHTML;
  button.dataset.loading = "true";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Diseñando experiencia…</span>';
  try {
    let acceptedProposal = "";
    let acceptableRepeatedProposal = "";
    let acceptableSoftIssueProposal = "";
    let revisionFeedback = "";
    for (let attempt = 0; attempt < 3 && !acceptedProposal; attempt += 1) {
      const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
        method: "POST",
        body: {
          model: $("#modelSelect").value,
          payload: {
            systemInstruction: {
              parts: [{
                text: [
                  "Eres diseñador senior de experiencias auténticas y videojuegos educativos para secundaria.",
                  "Los aprendizajes esperados son requisitos curriculares, no una narración que debas parafrasear.",
                  "Primero organízalos en una progresión; después crea una sola situación cotidiana concreta en la que sea necesario aplicarlos.",
                  "La experiencia debe tener un problema verificable, acciones del estudiante, datos o evidencia, un producto final y una decisión con consecuencias plausibles.",
                  "No describas la interfaz, sliders, nombres internos de controles ni variables genéricas como Valor de x, Coeficiente o Constante.",
                  "No prometas resolver o erradicar una problemática social únicamente mediante un cálculo escolar. Mantén consecuencias realistas y proporcionales.",
                  "Redacta con claridad para adolescentes de 13 a 17 años y evita profesiones adultas, instituciones ficticias, laboratorios genéricos y frases promocionales."
                ].join(" ")
              }]
            },
            contents: [{
              role: "user",
              parts: [{
                text: [
                  "# Datos curriculares",
                  `Materia: ${SUBJECT_LABELS[subject]}.`,
                  `Tema de referencia: ${topic}.`,
                  `Nivel escolar: ${grade}. Dificultad: ${difficulty}.`,
                  learningStatements.length
                    ? `Aprendizajes esperados numerados:\n${learningStatements.map((statement, index) => `${index + 1}. ${statement}`).join("\n")}`
                    : "No se proporcionaron aprendizajes adicionales. Deriva los aprendizajes apropiados únicamente del tema, la materia y el grado.",
                  "",
                  "# Idea opcional del docente",
                  experienceSeed || "No hay una idea de contexto. Inventa una experiencia completamente nueva.",
                  "Si existe una idea, conserva únicamente su contexto, objetos o intención concreta; no reutilices su redacción ni la trates como lista curricular.",
                  "",
                  "# Diseño solicitado",
                  "Crea una experiencia posible de realizar o simular desde la vida cotidiana de un adolescente.",
                  "La situación debe nombrar un lugar o circunstancia reconocible, una necesidad concreta, datos disponibles y una limitación real.",
                  `Distribuye la progresión en entre 2 y ${Math.min(5, Math.max(3, learningStatements.length || 3))} etapas. Cada etapa debe indicar qué aprendizaje trabaja, qué hace el estudiante y qué evidencia produce.`,
                  "Todos los aprendizajes numerados deben aparecer en coveredLearningIndexes al menos una vez; puedes agrupar aprendizajes relacionados dentro de la misma etapa.",
                  "El producto final debe ser algo observable: plan, tabla, gráfica, estimación, prototipo, informe breve, comparación o recomendación justificada.",
                  "La decisión final debe depender de los resultados obtenidos, no de una respuesta moral genérica.",
                  "No conviertas cada aprendizaje en una oración separada ni acumules todos los verbos curriculares en un único párrafo.",
                  "No incluyas markdown dentro de los valores JSON.",
                  revisionFeedback,
                  !experienceSeed && recentProposals.length ? `No repitas estos contextos recientes: ${recentProposals.map((proposal) => proposal.slice(0, 220)).join(" | ")}` : ""
                ].filter(Boolean).join("\n")
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  authenticSituation: { type: "STRING", description: "Situación cotidiana concreta con lugar, necesidad, datos y limitación real; entre 70 y 220 palabras." },
                  studentMission: { type: "STRING", description: "Misión clara del estudiante dentro de esa situación, sin explicar una interfaz." },
                  stages: {
                    type: "ARRAY",
                    minItems: 2,
                    maxItems: 5,
                    items: {
                      type: "OBJECT",
                      properties: {
                        title: { type: "STRING", description: "Nombre breve y específico de la etapa." },
                        learningFocus: { type: "STRING", description: "Aprendizajes matemáticos o científicos que se trabajan en esta etapa." },
                        studentAction: { type: "STRING", description: "Acción concreta y observable que realiza el estudiante con datos u objetos de la situación." },
                        evidence: { type: "STRING", description: "Cálculo, comparación, registro, gráfica o evidencia producida por esa acción." },
                        coveredLearningIndexes: { type: "ARRAY", items: { type: "INTEGER", minimum: 1, maximum: Math.max(1, learningStatements.length) } }
                      },
                      required: ["title", "learningFocus", "studentAction", "evidence", "coveredLearningIndexes"]
                    }
                  },
                  finalProduct: { type: "STRING", description: "Producto observable que integra la evidencia de las etapas." },
                  finalDecision: { type: "STRING", description: "Decisión realista que el estudiante toma usando el producto y los resultados." }
                },
                required: ["authenticSituation", "studentMission", "stages", "finalProduct", "finalDecision"]
              },
              temperature: .52,
              topP: .9
            }
          }
        }
      });
      const generated = parseGeneratedJson(extractResponseText(response));
      const stages = Array.isArray(generated?.stages) ? generated.stages.slice(0, 5) : [];
      const situation = completeProposalSentence(generated?.authenticSituation);
      const mission = completeProposalSentence(generated?.studentMission);
      const stageParagraph = stages.map((stage, index) => {
        const connector = index === 0 ? "Primero" : index === stages.length - 1 ? "Finalmente" : "Después";
        return `${connector}, se trabaja ${String(stage?.learningFocus || "el aprendizaje previsto").trim()}: ${completeProposalSentence(stage?.studentAction)} Como evidencia, ${completeProposalSentence(stage?.evidence)}`;
      }).join(" ");
      const finalProduct = completeProposalSentence(generated?.finalProduct);
      const finalDecision = completeProposalSentence(generated?.finalDecision);
      const candidate = repairExperienceProposalLanguage(cleanVisualConfigurationReferences([
        [situation, mission].filter(Boolean).join(" "),
        stageParagraph,
        `Como producto final, ${finalProduct} Con esa evidencia, ${finalDecision}`
      ].filter(Boolean).join("\n\n")));
      const coveredIndexes = new Set(stages.flatMap((stage) => Array.isArray(stage?.coveredLearningIndexes) ? stage.coveredLearningIndexes.map(Number) : []));
      const coversEveryLearning = learningStatements.every((_, index) => coveredIndexes.has(index + 1));
      const learningCoverage = experienceLearningCoverage(expectedLearnings, `${candidate} ${stages.map((stage) => stage?.learningFocus || "").join(" ")}`);
      const designQuality = experienceDesignQuality({
        candidate,
        situation,
        mission,
        stages,
        finalProduct,
        finalDecision,
        expectedLearningCount: learningStatements.length
      });
      const distinct = Boolean(experienceSeed) || proposalIsDistinct(candidate, recentProposals);
      const curriculumAndDesignAreValid = candidate && coversEveryLearning && learningCoverage.valid && designQuality.valid;
      const curriculumIsValidWithOnlySoftIssues = candidate && coversEveryLearning && learningCoverage.valid && designQuality.usable;
      if (curriculumAndDesignAreValid && distinct) {
        acceptedProposal = candidate;
      } else if (candidate) {
        if (curriculumAndDesignAreValid && !acceptableRepeatedProposal) acceptableRepeatedProposal = candidate;
        if (curriculumIsValidWithOnlySoftIssues && !acceptableSoftIssueProposal) acceptableSoftIssueProposal = candidate;
        const missingIndexes = learningStatements.map((_, index) => index + 1).filter((index) => !coveredIndexes.has(index));
        console.warn("[ScienceActivities] Experience proposal validation rejected", {
          attempt: attempt + 1,
          expectedLearningCount: learningStatements.length,
          missingLearningIndexes: missingIndexes,
          semanticCoverage: Number(learningCoverage.coverage.toFixed(2)),
          qualityIssues: designQuality.issues,
          blockingQualityIssues: designQuality.blockingIssues,
          candidateLength: candidate.length,
          allowedMaximumLength: designQuality.maximumLength,
          distinct,
          revisingExistingIdea: Boolean(experienceSeed)
        });
        revisionFeedback = [
          missingIndexes.length ? `CORRECCIÓN: faltó integrar los aprendizajes ${missingIndexes.join(", ")}.` : "",
          !learningCoverage.valid ? `CORRECCIÓN: la experiencia no hace reconocibles estos aprendizajes: ${learningCoverage.missing.map((item) => item.index).join(", ")}.` : "",
          designQuality.issues.length ? `CORRECCIÓN: resuelve estos problemas de diseño: ${designQuality.issues.join(", ")}.` : "",
          !distinct ? "CORRECCIÓN: cambia por completo el contexto; se parece demasiado a una propuesta anterior." : ""
        ].filter(Boolean).join(" ");
      }
    }
    if (!acceptedProposal && acceptableRepeatedProposal) {
      acceptedProposal = acceptableRepeatedProposal;
      console.info("[ScienceActivities] Se aceptó una propuesta curricular válida aunque su contexto coincide con una experiencia anterior.");
    }
    if (!acceptedProposal && acceptableSoftIssueProposal) {
      acceptedProposal = acceptableSoftIssueProposal;
      console.info("[ScienceActivities] Se aceptó una propuesta curricular completa con una observación menor de formato.");
    }
    if (!acceptedProposal) throw new Error("La IA no logró construir una experiencia auténtica que cubra los aprendizajes. Se conservaron intactos tus campos; intenta nuevamente.");
    rememberExperienceProposal({ subject, topic, proposal: acceptedProposal, routeKey: crypto.randomUUID() });
    $("#experiencePrompt").value = acceptedProposal;
    $("#experiencePrompt").dispatchEvent(new Event("input", { bubbles: true }));
    state.activity.expectedLearnings = expectedLearnings;
    state.activity.experiencePrompt = acceptedProposal;
    showToast(learningStatements.length
      ? "Experiencia nueva creada a partir de los aprendizajes esperados."
      : "Experiencia auténtica nueva creada con IA.");
  } catch (error) {
    console.error("[ScienceActivities] Experience proposal failed:", error);
    showToast(error?.message || "No fue posible crear la propuesta de experiencia.");
  } finally {
    button.dataset.loading = "false";
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = originalButtonHtml;
  }
}

function buildFallbackLearningGuide(activity) {
  const levelCount = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  const controls = Array.isArray(activity.controls) ? activity.controls : [];
  const isMath = activity.subject === "math";
  const baseConcepts = controls.slice(0, 2).map((control) => ({
    term: control.label,
    definition: control.effect || (isMath
      ? "Valor que puedes modificar para comprobar una relación matemática."
      : "Variable que puedes modificar durante el experimento.")
  }));
  if (!baseConcepts.length) baseConcepts.push({ term: activity.topic, definition: activity.scientificPrinciple });
  return {
    title: `Bitácora de ${activity.topic}`,
    introduction: buildScienceExperienceIntroduction(activity),
    levels: Array.from({ length: levelCount }, (_, index) => ({
      title: `Misión ${index + 1}: ${activity.topic}`,
      narrative: isMath
        ? (index === 0
          ? "Analiza los datos, reconoce la estructura del problema y construye una representación matemática antes de resolverlo."
          : "Compara estrategias, transforma la expresión y comprueba qué procedimiento conserva la equivalencia del resultado.")
        : (index === 0
          ? "Tu equipo de investigación recibe un caso sin resolver. Analiza el sistema, identifica las variables y establece una hipótesis antes de ejecutar la prueba."
          : "La evidencia inicial no es suficiente. Contrasta resultados, detecta relaciones entre variables y decide qué modificación permitirá sostener una conclusión."),
      objective: isMath
        ? (index === 0
          ? `Reconocer datos, operaciones y representaciones relevantes de ${activity.topic}.`
          : `Resolver y justificar relaciones de ${activity.topic} mediante procedimientos equivalentes.`)
        : (index === 0
          ? `Identificar variables y evidencia relevante en un caso aplicado de ${activity.topic}.`
          : `Explicar y justificar una relación causal sobre ${activity.topic} mediante los resultados de la simulación.`),
      concepts: structuredClone(baseConcepts),
      hint: isMath
        ? (index === 0
          ? "Separa los datos conocidos, la incógnita y la operación que los relaciona."
          : "Comprueba el resultado sustituyendo los valores en la expresión original.")
        : (index === 0
          ? "Aísla una variable y registra qué evidencia apoyaría o refutaría tu hipótesis."
          : "Compara la magnitud del cambio y distingue correlación de una relación causal."),
      imagePrompt: [
        `Representa literalmente esta experiencia del docente: ${activity.experiencePrompt || activity.mission}.`,
        `Muestra una acción real y ejecutable relacionada con ${activity.topic}, nivel ${index + 1}.`,
        isMath
          ? "Expresa las matemáticas mediante los objetos y acciones reales mencionados; no uses símbolos flotantes ni un laboratorio científico."
          : "Mantén científicamente correctos los objetos, materiales, posturas y relaciones de causa y efecto."
      ].join(" "),
      imageDataUrl: ""
    }))
  };
}

function visibleLearningGuideText(guide = {}) {
  return [
    guide.title,
    guide.introduction,
    ...(guide.levels || []).flatMap((level) => [
      level.title,
      level.narrative,
      level.objective,
      level.hint,
      typeof level.example === "string" ? level.example : level.example?.title,
      typeof level.example === "object" ? level.example?.text : "",
      ...(level.concepts || []).flatMap((concept) => [concept.term, concept.definition])
    ])
  ].filter(Boolean).join(" ");
}

function normalizeLearningGuideForSubject(activity, guide) {
  const visibleText = guide ? visibleLearningGuideText(guide) : "";
  if (guide
    && isSubjectTextCompatible(activity.subject, visibleText)
    && isCurriculumContentCompatible(activity, visibleText)) {
    guide.introduction = buildScienceExperienceIntroduction(activity);
    return guide;
  }
  const fallback = buildFallbackLearningGuide(activity);
  fallback.levels = fallback.levels.map((level, index) => ({
    ...level,
    imageDataUrl: guide?.levels?.[index]?.imageDataUrl || "",
    imageSrc: guide?.levels?.[index]?.imageSrc || ""
  }));
  return fallback;
}

function limitLearningText(value, maxWords, maxCharacters) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  let concise = normalized.split(" ").slice(0, maxWords).join(" ");
  if (concise.length > maxCharacters) concise = concise.slice(0, maxCharacters).replace(/\s+\S*$/, "");
  return concise.length < normalized.length ? `${concise.replace(/[,:;.-]+$/, "")}…` : concise;
}

function completeLearningTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildExperienceBriefingCarousel(slides) {
  return `<section class="science-experience-briefing" data-experience-carousel role="region" aria-roledescription="carrusel" aria-label="Objetivo y principio del juego" tabindex="0">
    <div class="science-experience-carousel-track">
      ${slides.map((slide, index) => `<article data-experience-slide role="group" aria-roledescription="diapositiva" aria-label="${index + 1} de ${slides.length}" ${index ? "hidden" : ""}><small>${escapeHtml(slide.label)}</small><p>${escapeHtml(slide.text)}</p></article>`).join("")}
    </div>
    <nav class="science-experience-carousel-controls" aria-label="Navegación de la misión">
      <button type="button" data-experience-prev aria-label="Ver información anterior"><span aria-hidden="true">‹</span></button>
      <div class="science-experience-carousel-dots" role="tablist" aria-label="Secciones de la misión">
        ${slides.map((slide, index) => `<button type="button" role="tab" data-experience-dot="${index}" aria-label="${escapeHtml(slide.label)}" aria-selected="${index === 0}"></button>`).join("")}
      </div>
      <span data-experience-status aria-live="polite">1 de ${slides.length}</span>
      <button type="button" data-experience-next aria-label="Ver información siguiente"><span aria-hidden="true">›</span></button>
    </nav>
  </section>`;
}

function initializeExperienceBriefingCarousel(root) {
  const carousel = root?.querySelector?.("[data-experience-carousel]");
  if (!carousel || carousel.dataset.carouselReady === "true") return;
  const slides = [...carousel.querySelectorAll("[data-experience-slide]")];
  const dots = [...carousel.querySelectorAll("[data-experience-dot]")];
  const status = carousel.querySelector("[data-experience-status]");
  let activeIndex = 0;
  const show = (requestedIndex, focusDot = false) => {
    activeIndex = (requestedIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => { slide.hidden = index !== activeIndex; });
    dots.forEach((dot, index) => {
      dot.setAttribute("aria-selected", String(index === activeIndex));
      dot.tabIndex = index === activeIndex ? 0 : -1;
    });
    if (status) status.textContent = `${activeIndex + 1} de ${slides.length}`;
    if (focusDot) dots[activeIndex]?.focus();
  };
  carousel.querySelector("[data-experience-prev]")?.addEventListener("click", () => show(activeIndex - 1));
  carousel.querySelector("[data-experience-next]")?.addEventListener("click", () => show(activeIndex + 1));
  dots.forEach((dot, index) => dot.addEventListener("click", () => show(index)));
  carousel.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") show(0, true);
    else if (event.key === "End") show(slides.length - 1, true);
    else show(activeIndex + (event.key === "ArrowRight" ? 1 : -1), true);
  });
  carousel.dataset.carouselReady = "true";
  show(0);
}

function installResponsiveIntroductionLayout(frame, layer) {
  frame.__scienceIntroductionResizeObserver?.disconnect?.();
  const rootRules = [
    ["display", "flex"], ["flex-direction", "column"], ["align-items", "stretch"],
    ["grid-template-columns", "minmax(0, 1fr)"], ["grid-template-rows", "auto auto"],
    ["position", "relative"], ["inset", "auto"], ["width", "100%"],
    ["height", "auto"], ["min-height", "100%"], ["max-height", "none"], ["overflow", "visible"]
  ];
  const childRules = [
    ["position", "relative"], ["inset", "auto"], ["grid-column", "1"],
    ["grid-row", "auto"], ["width", "100%"], ["max-width", "none"]
  ];
  const setRules = (element, rules, active) => {
    if (!element) return;
    rules.forEach(([property, value]) => active
      ? element.style.setProperty(property, value, "important")
      : element.style.removeProperty(property));
  };
  const sync = () => {
    const briefing = layer.querySelector(".science-rive-briefing-screen.science-micro-mission");
    if (!briefing) return;
    const narrow = frame.getBoundingClientRect().width <= 820;
    const visual = briefing.querySelector(":scope > .science-micro-visual");
    const content = briefing.querySelector(":scope > .science-micro-content");
    briefing.classList.toggle("is-stacked-introduction", narrow);
    setRules(briefing, rootRules, narrow);
    setRules(visual, childRules, narrow);
    setRules(content, childRules, narrow);
    setRules(content, [["height", "auto"], ["min-height", "0"], ["overflow", "visible"], ["flex", "0 0 auto"]], narrow);
    setRules(visual, [["height", "clamp(240px, 58cqi, 440px)"], ["min-height", "240px"], ["max-height", "none"], ["flex", "0 0 auto"]], narrow);
    setRules(briefing.querySelector(".science-micro-concepts"), [["grid-template-columns", "minmax(0, 1fr)"]], narrow);
    briefing.querySelectorAll(".science-experience-briefing,.science-experience-carousel-track,.science-experience-carousel-track article").forEach((element) => {
      setRules(element, [["position", "relative"], ["inset", "auto"], ["height", "auto"], ["min-height", "0"], ["max-height", "none"], ["overflow", "visible"]], narrow);
    });
  };
  if (typeof ResizeObserver === "function") {
    frame.__scienceIntroductionResizeObserver = new ResizeObserver(sync);
    frame.__scienceIntroductionResizeObserver.observe(frame);
  }
  sync();
  requestAnimationFrame(sync);
}

function difficultyExampleMarkup(activity, level) {
  const generated = level?.example && typeof level.example === "object" ? level.example : null;
  const rawExample = generated?.text
    || [generated?.situation, generated?.result].filter(Boolean).join(" ")
    || (typeof level?.example === "string" ? level.example : "");
  if (!rawExample) return "";
  const title = generated?.title || "Ejemplo generado";
  const conciseExample = limitLearningText(rawExample, 32, 190);
  return `<div class="sa-difficulty-example"><i class="fas fa-flask-vial"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(conciseExample)}</span></div>`;
}

async function generateLearningGuideWithGemini(activity, attempt = 0) {
  const levelCount = Math.max(1, Math.floor(Number(activity.levelCount || 3)));
  const fallback = buildFallbackLearningGuide(activity);
  let guide = fallback;
  const isMath = activity.subject === "math";
  const requiresAppliedFormula = ["math", "physics", "chemistry"].includes(activity.subject);
  try {
    const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: $("#modelSelect").value,
        payload: {
          systemInstruction: {
            parts: [{ text: isMath
              ? `Eres diseñador instruccional de videojuegos de Matemáticas para adolescentes. Enseña antes de evaluar con lenguaje claro, breve y matemáticamente correcto. No mezcles Física, Química ni Biología. ${ADOLESCENT_CONTENT_DIRECTION}`
              : `Eres diseñador instruccional y narrativo de videojuegos STEM para adolescentes. Enseña antes de evaluar con lenguaje claro, breve y científicamente correcto. ${ADOLESCENT_CONTENT_DIRECTION}` }]
          },
          contents: [{
            role: "user",
            parts: [{
              text: [
                `Crea una guía de aprendizaje de exactamente ${levelCount} niveles.`,
                buildCurriculumGenerationContract(activity),
                `Materia: ${SUBJECT_LABELS[activity.subject]}. Tema: ${activity.topic}.`,
                `Aprendizajes esperados obligatorios: ${activity.expectedLearnings || "No se proporcionaron aprendizajes adicionales; usa el tema y el grado seleccionados."}`,
                `Experiencia obligatoria solicitada por el docente: ${activity.experiencePrompt || "No se proporcionó una instrucción adicional."}`,
                "El lugar físico, los objetos y la acción de las imágenes deben salir de la experiencia solicitada; no uses el bioma interno como sustituto del contexto real.",
                `Misión: ${activity.mission}. ${isMath ? "Principio matemático" : "Principio científico"}: ${activity.scientificPrinciple}.`,
                isMath
                  ? "Contrato de materia: usa exclusivamente conceptos, procedimientos, ejemplos y representaciones matemáticas. No incluyas matraces, reactivos, moléculas, células, genética, ecosistemas, fuerzas, circuitos ni proyectiles."
                  : `Mantén todo el contenido dentro de ${SUBJECT_LABELS[activity.subject]}.`,
                `Nivel escolar: ${$("#gradeSelect").value}.`,
                `Dificultad: ${$("#difficultySelect").value}.`,
                ADOLESCENT_CONTENT_DIRECTION,
                `Acabado visual obligatorio, únicamente para color, línea, sombreado e iluminación: ${activitySceneStyleFinish(activity.visualStyle)}.`,
                ACTIVITY_SCENE_REALISM_CONTRACT,
                "La dirección visual solo controla la imagen. No menciones el nombre del estilo ni términos de configuración artística en ningún contenido educativo visible.",
                "Cada nivel debe preparar al alumno con una sola micro-misión: objetivo, exactamente 1 o 2 conceptos, un ejemplo cotidiano y un prompt visual.",
                "Toda la guía, cada ejemplo, su fórmula y su explicación deben responder de forma concreta a la experiencia solicitada por el docente; no la ignores ni la sustituyas por un caso genérico.",
                "Límites obligatorios: title máximo 7 palabras; objective una oración de máximo 13 palabras; narrative máximo 18 palabras.",
                "Cada definición tendrá máximo 16 palabras. La pista tendrá máximo 14 palabras. No repitas una idea entre campos.",
                "La narrativa debe condensar una investigación, incidente técnico, problema real, reto de ingeniería o análisis de evidencia.",
                "Evita misiones basadas en personajes tiernos, mascotas, regalos, magia, dulces o recompensas infantiles.",
                "El ejemplo debe ser realista, aplicable a la vida cotidiana, exclusivo de ese nivel y comprensible sin ayuda del docente. Usa cantidades realistas para el objeto o situación elegidos.",
                "Para cada ejemplo devuelve title, text, formula y explanation.",
                "text debe tener entre 35 y 75 palabras y seguir este orden: 1) describe con claridad una situación que el adolescente pueda imaginar; 2) formula una pregunta explícita con signos de interrogación; 3) presenta los datos necesarios explicando qué representa cada cantidad y unidad.",
                "formula debe mostrar el procedimiento aplicado al caso en uno o más pasos unidos por →, sustituyendo exactamente los datos de text hasta llegar al resultado. Define en text o explanation cada símbolo usado. No devuelvas solamente una ley general.",
                "explanation debe tener entre 18 y 45 palabras, interpretar el resultado en lenguaje cotidiano y responder directamente la pregunta de text. No repitas la fórmula con palabras ni introduzcas términos nuevos.",
                "Evita frases comprimidas que acumulen masa, fuerza, coeficiente y resultado sin explicar su relación. Primero plantea el caso, después explica los datos y finalmente resuelve.",
                "Si el tema no admite una fórmula válida, formula debe ser una cadena vacía y explanation debe explicar paso a paso la relación causal del caso.",
                activity.subject === "biology"
                  ? "En Biología no uses ecuaciones, variables, potencias, porcentajes ni fórmulas como contenido pedagógico. Si el ejemplo requiere una cantidad, usa sólo un conteo directo con enteros pequeños y deja formula como cadena vacía."
                  : requiresAppliedFormula
                  ? "REQUISITO ESTRICTO: para cada nivel formula no puede estar vacía. Debe contener una ecuación o reacción con =, ≈, ∝ o → y mostrar el cálculo o sustitución de los mismos valores, unidades y resultado mencionados en text. Una fórmula general sin datos del ejemplo es inválida."
                  : "Cuando exista una relación cuantitativa válida, formula debe contener la ecuación aplicada con los datos del caso.",
                "explanation debe explicar en una oración por qué la fórmula, cálculo o relación confirma el resultado del ejemplo. No inventes valores, leyes ni unidades.",
                isMath
                  ? "Usa números, operaciones, expresiones, ecuaciones, funciones, figuras, mediciones, tablas, gráficas o probabilidades específicas del tema. No repitas la misma estructura ni los mismos datos entre niveles."
                  : "Usa valores, unidades, organismos, sustancias o fenómenos específicos del tema. No repitas la misma estructura ni los mismos datos entre niveles.",
                activity.difficulty === "guided"
                  ? "Dificultad Fácil: cada nivel enseña un concepto y el ejemplo requiere como máximo un paso directo, sin trampas ni datos irrelevantes."
                  : "Adapta el ejemplo a la dificultad seleccionada sin superar el grado escolar: equilibrada relaciona variables ya estudiadas; desafío puede exigir varios pasos sólo si corresponden al grado.",
                "Haz progresar el aprendizaje desde reconocer hasta relacionar, predecir, aplicar y explicar.",
                "Cada imagePrompt debe describir literalmente un único instante de la experiencia del docente: lugar real, objetos reales, persona o sujeto, postura y acción observables. No inventes otra historia ni uses metáforas visuales.",
                "El estilo indicado sólo puede modificar la paleta, el trazo, el sombreado y la iluminación. No debe aparecer como tema, escenario, tecnología, vestuario ni utilería.",
                "Cada imagePrompt debe solicitar explícitamente una ilustración vertical 9:16, con la acción principal centrada y el escenario real aprovechando toda la altura.",
                ADOLESCENT_IMAGE_DIRECTION,
                "La escena debe ser profesional y científicamente correcta, sin texto, letras, números, fórmulas, logotipos ni marcas.",
                "No menciones nombres técnicos de escenario, mundo, zona, estación, laboratorio numerado ni identificadores internos en ningún texto visible.",
                "Devuelve únicamente JSON."
              ].join("\n")
            }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                introduction: { type: "STRING" },
                levels: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      title: { type: "STRING" },
                      narrative: { type: "STRING" },
                      objective: { type: "STRING" },
                      concepts: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: { term: { type: "STRING" }, definition: { type: "STRING" } },
                          required: ["term", "definition"]
                        }
                      },
                      hint: { type: "STRING" },
                      example: {
                        type: "OBJECT",
                        properties: {
                          title: { type: "STRING" },
                          text: { type: "STRING" },
                          formula: { type: "STRING" },
                          explanation: { type: "STRING" }
                        },
                        required: ["title", "text", "formula", "explanation"]
                      },
                      imagePrompt: { type: "STRING" }
                    },
                    required: ["title", "narrative", "objective", "concepts", "hint", "example", "imagePrompt"]
                  }
                }
              },
              required: ["title", "introduction", "levels"]
            },
            temperature: .7
          }
        }
      }
    });
    const generated = parseGeneratedJson(extractResponseText(response));
    if (Array.isArray(generated?.levels) && generated.levels.length === levelCount) {
      const formulasAreApplied = !requiresAppliedFormula || generated.levels.every((level) => {
        const formula = String(level?.example?.formula || "").trim();
        return /[=≈∝→]/.test(formula) && /\d/.test(formula);
      });
      if (!formulasAreApplied) {
        if (attempt < 2) return generateLearningGuideWithGemini(activity, attempt + 1);
        throw new Error("Gemini no devolvió ecuaciones aplicadas para todos los ejemplos requeridos.");
      }
      const examplesAreClear = generated.levels.every((level) => {
        const text = String(level?.example?.text || "").trim();
        const explanation = String(level?.example?.explanation || "").trim();
        const textWords = text.split(/\s+/).filter(Boolean).length;
        const explanationWords = explanation.split(/\s+/).filter(Boolean).length;
        return textWords >= 35 && textWords <= 85
          && explanationWords >= 16 && explanationWords <= 50
          && /[¿?]/.test(text);
      });
      if (!examplesAreClear) {
        if (attempt < 2) return generateLearningGuideWithGemini(activity, attempt + 1);
        throw new Error("Gemini no redactó ejemplos suficientemente claros y detallados para secundaria.");
      }
      if (!isSubjectTextCompatible(activity.subject, visibleLearningGuideText(generated))) {
        if (attempt < 2) return generateLearningGuideWithGemini(activity, attempt + 1);
        throw new Error("Gemini devolvió una guía con contenido ajeno a la materia solicitada.");
      }
      guide = {
        title: String(generated.title || fallback.title),
        introduction: String(generated.introduction || fallback.introduction),
        levels: generated.levels.map((level, index) => ({
          ...fallback.levels[index],
          ...level,
          concepts: Array.isArray(level.concepts) && level.concepts.length ? level.concepts.slice(0, 2) : fallback.levels[index].concepts.slice(0, 2),
          imageDataUrl: ""
        }))
      };
    } else {
      throw new Error("Gemini no devolvió todos los niveles solicitados.");
    }
  } catch (error) {
    if (attempt < 2) return generateLearningGuideWithGemini(activity, attempt + 1);
    throw new Error(`No se pudo generar una guía completa con Gemini: ${error?.message || "respuesta inválida"}`);
  }

  const generateLevelImage = async (level, index) => {
    const prompt = [
      buildRealisticActivityImagePrompt(activity, level, index, levelCount),
      ADOLESCENT_IMAGE_DIRECTION,
      "Vertical 9:16 portrait game illustration. Full scene from top to bottom, centered main subject, tall environmental composition, no letterboxing and no important elements near the crop edges.",
      "Show one readable real-world scene, not a montage, infographic, metaphor or game interface. Composition and lighting may be polished, but the depicted action must remain practical and physically believable.",
      isMath
        ? "Accurate mathematics for teenagers. If the experience names a real activity such as sport, media editing, shopping, travel or construction, show that activity with its real tools and environment. Do not replace it with abstract puzzle pieces, a futuristic room or floating mathematics. No chemistry lab, molecules, cells, physics apparatus, text, letters, numbers, formulas, logo or watermark."
        : "Accurate science for teenagers in the real setting named by the experience. No text, letters, numbers, formulas, logo or watermark."
    ].join(" ");
    const models = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
    const errors = [];
    for (const model of models) {
      try {
        const result = await generateImagesOnDemand({
          mode: "generate",
          prompt,
          options: { model, aspectRatio: "9:16", imageSize: "1K", count: 1 },
          attachments: []
        });
        if (result?.[0]?.dataUrl) return result[0].dataUrl;
      } catch (error) {
        errors.push(`${model}: ${error?.message || "sin imagen"}`);
      }
    }
    throw new Error(errors.join(" · ") || "Gemini no devolvió una imagen válida.");
  };

  const imageResults = await Promise.allSettled(
    guide.levels.map((level, index) => generateLevelImage(level, index))
  );
  imageResults.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) guide.levels[index].imageDataUrl = result.value;
  });
  const failedImages = imageResults.filter((result) => result.status === "rejected").length;
  if (failedImages) {
    const firstFailure = imageResults.find((result) => result.status === "rejected");
    throw new Error(`Gemini no creó ${failedImages} de ${levelCount} imágenes del juego. ${firstFailure?.reason?.message || "Revisa el modelo, la cuota o los permisos."}`);
  }
  return guide;
}

async function removeSpriteSheetBackground(source, columns = 4, rows = 2) {
  const bitmap = await decodeImageSource(source);
  const frameSize = 512;
  const canvas = document.createElement("canvas");
  canvas.width = frameSize * columns;
  canvas.height = frameSize * rows;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const dominance = green - Math.max(red, blue);
    if (green > 95 && dominance > 28) {
      const removal = Math.min(1, Math.max(0, (dominance - 28) / 90));
      data[index + 3] = Math.round(255 * (1 - removal));
      data[index + 1] = Math.min(green, Math.max(red, blue) + 22);
    }
  }

  context.putImageData(pixels, 0, 0);
  const cleanedCanvas = document.createElement("canvas");
  cleanedCanvas.width = canvas.width;
  cleanedCanvas.height = canvas.height;
  const cleanedContext = cleanedCanvas.getContext("2d", { alpha: true });
  cleanedContext.imageSmoothingEnabled = false;

  const removeFrameGuideLines = (framePixels, width, height) => {
    const alphaThreshold = 64;
    const clearThinBands = (orientation) => {
      const length = orientation === "row" ? height : width;
      const span = orientation === "row" ? width : height;
      const counts = new Uint16Array(length);
      for (let line = 0; line < length; line += 1) {
        let count = 0;
        for (let point = 0; point < span; point += 1) {
          const x = orientation === "row" ? point : line;
          const y = orientation === "row" ? line : point;
          if (framePixels.data[(y * width + x) * 4 + 3] >= alphaThreshold) count += 1;
        }
        counts[line] = count;
      }
      const minimumLineLength = Math.round(span * .16);
      for (let start = 0; start < length;) {
        if (counts[start] < minimumLineLength) {
          start += 1;
          continue;
        }
        let end = start;
        let peak = counts[start];
        while (end + 1 < length && counts[end + 1] >= minimumLineLength) {
          end += 1;
          peak = Math.max(peak, counts[end]);
        }
        const before = start > 0 ? counts[start - 1] : 0;
        const after = end + 1 < length ? counts[end + 1] : 0;
        const isThinIsolatedLine = end - start + 1 <= 5
          && Math.max(before, after) < peak * .55;
        if (isThinIsolatedLine) {
          for (let line = Math.max(0, start - 1); line <= Math.min(length - 1, end + 1); line += 1) {
            for (let point = 0; point < span; point += 1) {
              const x = orientation === "row" ? point : line;
              const y = orientation === "row" ? line : point;
              framePixels.data[(y * width + x) * 4 + 3] = 0;
            }
          }
        }
        start = end + 1;
      }
    };
    clearThinBands("row");
    clearThinBands("column");
    return framePixels;
  };

  const findMainComponentBounds = (framePixels, width, height) => {
    const alphaThreshold = 72;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    const components = [];
    const offsets = [-1, 1, -width, width];
    for (let y = 2; y < height - 2; y += 1) {
      for (let x = 2; x < width - 2; x += 1) {
        const start = y * width + x;
        if (visited[start] || framePixels.data[start * 4 + 3] < alphaThreshold) continue;
        let head = 0;
        let tail = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const point = queue[head++];
          const pointX = point % width;
          const pointY = Math.floor(point / width);
          minX = Math.min(minX, pointX);
          maxX = Math.max(maxX, pointX);
          minY = Math.min(minY, pointY);
          maxY = Math.max(maxY, pointY);
          for (const next of offsets) {
            const candidate = point + next;
            const candidateX = candidate % width;
            if (candidate < 0 || candidate >= width * height || visited[candidate]) continue;
            if (Math.abs(candidateX - pointX) > 1) continue;
            if (framePixels.data[candidate * 4 + 3] < alphaThreshold) continue;
            visited[candidate] = 1;
            queue[tail++] = candidate;
          }
        }
        const component = { size: tail, minX, maxX, minY, maxY };
        components.push(component);
      }
    }
    if (!components.length) return null;
    components.sort((first, second) => second.size - first.size);
    const main = components[0];
    const expansion = Math.round(width * .24);
    const combined = { ...main };
    components.slice(1).forEach((component) => {
      const meaningfulSize = component.size >= Math.max(8, main.size * .001);
      const touchesExpandedBody = component.maxX >= main.minX - expansion
        && component.minX <= main.maxX + expansion
        && component.maxY >= main.minY - expansion
        && component.minY <= main.maxY + expansion;
      if (!meaningfulSize || !touchesExpandedBody) return;
      combined.minX = Math.min(combined.minX, component.minX);
      combined.maxX = Math.max(combined.maxX, component.maxX);
      combined.minY = Math.min(combined.minY, component.minY);
      combined.maxY = Math.max(combined.maxY, component.maxY);
      combined.size += component.size;
    });
    return combined;
  };

  const extractedFrames = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceX = column * frameSize;
      const sourceY = row * frameSize;
      const framePixels = removeFrameGuideLines(
        context.getImageData(sourceX, sourceY, frameSize, frameSize),
        frameSize,
        frameSize
      );
      context.putImageData(framePixels, sourceX, sourceY);
      const bounds = findMainComponentBounds(framePixels, frameSize, frameSize);
      if (!bounds) continue;
      const padding = 12;
      const cropX = Math.max(0, bounds.minX - padding);
      const cropY = Math.max(0, bounds.minY - padding);
      const cropWidth = Math.min(frameSize - cropX, bounds.maxX - bounds.minX + 1 + padding * 2);
      const cropHeight = Math.min(frameSize - cropY, bounds.maxY - bounds.minY + 1 + padding * 2);
      extractedFrames.push({ sourceX, sourceY, cropX, cropY, cropWidth, cropHeight });
    }
  }

  const widestFrame = Math.max(1, ...extractedFrames.map((frame) => frame.cropWidth));
  const tallestFrame = Math.max(1, ...extractedFrames.map((frame) => frame.cropHeight));
  const commonScale = Math.min(
    (frameSize * .76) / widestFrame,
    (frameSize * .84) / tallestFrame
  );
  extractedFrames.forEach((frame) => {
    const drawWidth = frame.cropWidth * commonScale;
    const drawHeight = frame.cropHeight * commonScale;
    const destinationX = frame.sourceX + (frameSize - drawWidth) / 2;
    const destinationY = frame.sourceY + frameSize - drawHeight - frameSize * .06;
    cleanedContext.drawImage(
      canvas,
      frame.sourceX + frame.cropX,
      frame.sourceY + frame.cropY,
      frame.cropWidth,
      frame.cropHeight,
      destinationX,
      destinationY,
      drawWidth,
      drawHeight
    );
  });

  bitmap.close?.();
  return {
    dataUrl: cleanedCanvas.toDataURL("image/png"),
    width: cleanedCanvas.width,
    height: cleanedCanvas.height,
    columns,
    rows,
    poses: {
      idle: 0,
      run: [1, 2, 3],
      jump: 4,
      fall: 5,
      hit: 6,
      celebrate: 7
    }
  };
}

async function generatePlayerSpriteWithGemini(activity, characterConfig = activity.playerCharacter || {}) {
  const styleDirection = VISUAL_STYLE_DIRECTIONS[activity.visualStyle]
    || VISUAL_STYLE_DIRECTIONS["tech-minimal"];
  const genderDirection = characterConfig.gender === "male"
    ? "male teenage protagonist"
    : characterConfig.gender === "nonbinary"
      ? "androgynous teenage protagonist"
      : "female teenage protagonist";
  const playerStyle = {
    "arcade-hd": "premium modern HD arcade sprite, detailed 32-bit pixel art",
    "pixel-16": "authentic polished 16-bit pixel art with crisp readable silhouette",
    "anime-action": "anime action-game sprite with cel-shaded arcade rendering",
    "kawaii-teen": "original kawaii teenage adventure-game sprite, expressive but not childish",
    "graphic-novel": "graphic-novel action-game sprite with bold ink and controlled shading",
  }[characterConfig.playerStyle] || "premium modern HD arcade sprite";
  const enabledMovements = Object.entries(characterConfig.movements || {})
    .filter(([, enabled]) => enabled)
    .map(([movement]) => movement)
    .join(", ");
  const result = await generateImagesOnDemand({
    mode: "generate",
    prompt: [
      `Create one original ${genderDirection} named ${characterConfig.name || "the player"} for a ${SUBJECT_LABELS[activity.subject] || activity.subject} game about ${activity.topic}.`,
      `Character role: ${characterConfig.role || "science adventurer"}. Player rendering: ${playerStyle}.`,
      characterConfig.prompt ? `Additional character direction: ${characterConfig.prompt}.` : "",
      "Produce a production-ready sprite sheet with exactly eight equal cells in a strict 4-column by 2-row grid.",
      "Top row from left to right: walk forward, walk backward, jump upward, strike or hit.",
      "Bottom row from left to right: crouch, push a heavy invisible object, pull an invisible object, throw an invisible object.",
      `Movements enabled by the editor: ${enabledMovements || "all eight movements"}.`,
      "In both walking poses both complete legs and both complete feet must remain visible, with clearly opposite leading legs.",
      "Do not hide one leg behind the other, omit a foot, merge limbs, add motion duplicates or use anatomical shortcuts.",
      "Keep exactly the same character identity, face, hairstyle, clothing, proportions, palette and equipment in all eight poses.",
      "Full body centered inside every cell, identical character scale and consistent foot baseline.",
      "Keep every body part, hair, hand, foot and accessory fully inside the central 60 percent of its cell, with at least 20 percent plain green margin from every cell edge.",
      "No pose may be cropped, truncated, incomplete, hidden behind another pose or cross into an adjacent cell.",
      "Crisp high-resolution 16-bit pixel art for a modern HD platform game. Mature adolescent design, not preschool or toddler imagery.",
      `Adapt the palette, clothing and visual language to this selected direction: ${styleDirection}.`,
      "Use a perfectly flat solid chroma green #00FF00 background across the complete image for automatic background removal.",
      "No text, labels, letters, numbers, frame borders, separator lines, corner marks, crop marks, baselines, logos, UI, scenery, floor, cast shadows or additional characters."
    ].join(" "),
    options: {
      model: "gemini-3.1-flash-image",
      aspectRatio: "16:9",
      imageSize: "2K",
      count: 1
    },
    attachments: []
  });
  const generated = result?.[0]?.dataUrl;
  if (!generated) return null;
  const sprite = await removeSpriteSheetBackground(generated, 4, 2);
  return {
    ...sprite,
    poses: {
      idle: 0,
      run: [0, 1],
      jump: 2,
      fall: 2,
      hit: 3,
      crouch: 4,
      push: 5,
      pull: 6,
      throw: 7,
      celebrate: 3,
    },
    movements: characterConfig.movements || {},
    characterId: characterConfig.id,
  };
}

const GENERATION_DRAFT_DB = "scienceActivitiesGeneration.v1";
const GENERATION_DRAFT_STORE = "assessmentDrafts";
const generationDraftMemoryCache = new Map();

function positiveInteger(value, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_QUESTIONS_PER_LEVEL = 15;

function configuredQuestionsPerLevel(value, fallback = 3) {
  return Math.min(MAX_QUESTIONS_PER_LEVEL, positiveInteger(value, fallback));
}

function generationDraftKey(activity) {
  return [
    "assessment-uniqueness-v4-gemini-only",
    activity.subject,
    normalizeAnswer(activity.topic),
    activity.grade,
    positiveInteger(activity.levelCount, 1),
    positiveInteger(activity.questionsPerLevel, 1),
    activity.difficulty,
    assessmentHash(String(activity.expectedLearnings || "")),
    assessmentHash(String(activity.experiencePrompt || ""))
  ].join("::");
}

function openGenerationDraftDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const request = window.indexedDB.open(GENERATION_DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GENERATION_DRAFT_STORE)) {
        request.result.createObjectStore(GENERATION_DRAFT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readGenerationDraft(key) {
  if (generationDraftMemoryCache.has(key)) {
    return structuredClone(generationDraftMemoryCache.get(key));
  }
  const database = await openGenerationDraftDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GENERATION_DRAFT_STORE, "readonly");
    const request = transaction.objectStore(GENERATION_DRAFT_STORE).get(key);
    request.onsuccess = () => {
      const result = request.result || null;
      if (result) generationDraftMemoryCache.set(key, structuredClone(result));
      resolve(result);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeGenerationDraft(key, activity, levels) {
  const draft = {
    key,
    subject: activity.subject,
    topic: activity.topic,
    levelCount: positiveInteger(activity.levelCount, 1),
    questionsPerLevel: positiveInteger(activity.questionsPerLevel, 1),
    levels: structuredClone(levels),
    updatedAt: Date.now()
  };
  generationDraftMemoryCache.set(key, structuredClone(draft));
  const database = await openGenerationDraftDatabase();
  if (!database) return;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GENERATION_DRAFT_STORE, "readwrite");
    transaction.objectStore(GENERATION_DRAFT_STORE).put(draft);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteGenerationDraft(key) {
  generationDraftMemoryCache.delete(key);
  const database = await openGenerationDraftDatabase();
  if (!database) return;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GENERATION_DRAFT_STORE, "readwrite");
    transaction.objectStore(GENERATION_DRAFT_STORE).delete(key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function isTransientAssessmentGenerationError(error) {
  const status = Number(error?.status || 0);
  return [429, 500, 502, 503, 504].includes(status)
    || /upstream_timeout|temporarily unavailable|service unavailable|resource_exhausted|quota/i.test(String(error?.message || ""));
}

async function requestAssessmentGeminiWithRetry(requestOptions) {
  let lastError;
  for (let networkAttempt = 0; networkAttempt < 3; networkAttempt += 1) {
    try {
      logScienceGenerationStep("Enviando solicitud de pregunta a Gemini", { intentoRed: networkAttempt + 1 });
      return await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), requestOptions);
    } catch (error) {
      lastError = error;
      if (!isTransientAssessmentGenerationError(error) || networkAttempt >= 2) throw error;
      const delayMs = 1500 * (2 ** networkAttempt);
      logScienceGenerationStep("Servicio Gemini temporalmente no disponible", { status: Number(error?.status || 0), esperaMs: delayMs }, "warn");
      console.warn(`[ScienceActivities] Gemini no está disponible temporalmente; reintentando la misma pregunta en ${delayMs / 1000} s (${networkAttempt + 1}/2).`);
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function assessmentSolution(assessment) {
  if (assessment.solution != null && String(assessment.solution).trim()) return String(assessment.solution).trim();
  if (["multiple", "image-multiple"].includes(assessment.type)) return String(assessment.options?.[Number(assessment.correct)] || "");
  if (assessment.type === "matching") return JSON.stringify(assessment.pairs || []);
  if (assessment.type === "keyword" || assessment.type === "fill-blank") return String(assessment.accepted?.[0] || "");
  if (assessment.type === "equation-build") return (assessment.correctSequence || []).join(" ");
  if (assessment.type === "exponent-placement") return (assessment.correctExponents || []).join(",");
  if (assessment.type === "chemical-balance") return (assessment.correctCoefficients || []).join(",");
  if (assessment.type === "numeric-answer") return `${assessment.correctValue ?? ""} ${assessment.unit || ""}`.trim();
  if (assessment.type === "graph-plot") return JSON.stringify(assessment.targetPoints || []);
  if (assessment.type === "sequence-order") return (assessment.correctOrder || []).join(" | ");
  if (assessment.type === "timeline-order") {
    const titleById = new Map((assessment.events || []).map((event) => [String(event?.id || ""), String(event?.title || event?.id || "")]));
    return (assessment.correctOrder || []).map((id) => titleById.get(String(id)) || String(id)).filter(Boolean).join(" → ");
  }
  if (assessment.type === "number-line-placement") {
    const value = Number(assessment.targetValue ?? assessment.correctValue);
    return Number.isFinite(value) ? String(value) : "";
  }
  return "";
}

function generatedAssessmentIsComplete(activity, source) {
  if (!source || !isAssessmentCompatibleWithSubject(activity, source)) return false;
  const assessment = normalizeAssessmentSchema(structuredClone(source));
  const hasRequiredText = (value) => typeof value === "string" && value.trim().length > 0;
  if (!hasRequiredText(assessment.prompt) || !hasRequiredText(assessment.feedback) || !hasRequiredText(assessment.context)) return false;
  if (!assessmentSolution(assessment)) return false;
  if (["multiple", "image-multiple"].includes(assessment.type)) {
    const valid = assessment.options?.length === 4
      && Number.isInteger(Number(assessment.correct))
      && Number(assessment.correct) >= 0
      && Number(assessment.correct) < assessment.options.length;
    return assessment.type === "multiple" ? valid : valid && Boolean(assessment.visual?.target) && Boolean(assessment.visual?.imagePrompt);
  }
  if (assessment.type === "matching") return assessment.pairs?.length >= 3;
  if (assessment.type === "keyword") return assessment.accepted?.length > 0;
  if (assessment.type === "fill-blank") {
    const sourceSegments = assessmentList(source.segments).map(String);
    const sourceExpression = String(source.expression || source.formula || source.equation || "");
    const hasAuthoredPhrase = sourceSegments.includes("___")
      && sourceSegments.some((segment) => segment.trim() && segment !== "___");
    return assessment.accepted?.length > 0 && (hasAuthoredPhrase || sourceExpression.includes("___"));
  }
  if (assessment.type === "equation-build") return assessment.pieces?.length > 0 && equationSequenceIsValid(assessment.correctSequence);
  if (assessment.type === "exponent-placement") return assessment.exponents?.length > 0 && assessment.correctExponents?.length > 0;
  if (assessment.type === "chemical-balance") return assessment.compounds?.length > 0 && assessment.correctCoefficients?.length > 0;
  if (assessment.type === "numeric-answer") return Number.isFinite(Number(assessment.correctValue));
  if (assessment.type === "graph-plot") return assessment.targetPoints?.length > 0;
  if (assessment.type === "sequence-order") return assessment.steps?.length > 0 && assessment.correctOrder?.length > 0;
  if (assessment.type === "number-line-placement") {
    return Number.isFinite(Number(assessment.targetValue))
      && Number.isFinite(Number(assessment.min))
      && Number.isFinite(Number(assessment.max))
      && Number(assessment.max) > Number(assessment.min)
      && Number(assessment.denominator) >= 1;
  }
  if (assessment.type === "timeline-order") {
    const events = assessment.events || [];
    const ids = events.map((event) => String(event?.id || ""));
    return events.length >= 3
      && events.length <= 8
      && new Set(ids).size === events.length
      && events.every((event) => event?.title && event?.description)
      && assessment.correctOrder?.length === events.length
      && assessment.correctOrder.every((id) => ids.includes(String(id)));
  }
  return false;
}

function prepareGeneratedAssessmentCandidate(activity, source, scheduledType, globalIndex) {
  if (!source || typeof source !== "object") return null;
  const expectedType = generatedTypeForScheduledType(scheduledType);
  const repairedSource = repairGeneratedAssessmentShape(source, expectedType);
  if (expectedType === "numeric-answer" && repairedSource.correctValue == null) return null;
  let assessment = normalizeAssessmentSchema(repairedSource);
  if (assessment.type !== expectedType) return null;
  assessment.context ||= String(
    activity.scenario?.description
    || activity.scenario?.label
    || activity.mission
    || activity.scientificPrinciple
    || `Aplica ${activity.topic} para resolver la misión científica.`
  ).trim();
  assessment.feedback ||= String(
    activity.successMessage
    || activity.scientificPrinciple
    || `La respuesta se comprueba con los conceptos de ${activity.topic}.`
  ).trim();
  if (expectedType === "fill-blank" && !hasAuthoredFillBlankExpression(assessment)) return null;
  if (assessment.type === "image-multiple" && (!assessment.visual?.target || !assessment.visual?.imagePrompt)) {
    assessment = buildConcreteVisualAssessment(activity, assessment, globalIndex);
  }
  const content = assessmentText(assessment);
  const canRepairCurriculumGrounding = isSubjectTextCompatible(activity.subject, content)
    && isQuestionTypeAllowed(activity, assessment.type)
    && isSimpleBiologyNumericAssessment(activity, assessment)
    && isAssessmentDifficultyCompatible(activity, assessment);
  if (canRepairCurriculumGrounding && !isCurriculumContentCompatible(activity, content)) {
    assessment.context = buildGeneratedAssessmentGroundingContext(activity, assessment.context);
  }
  return normalizeAssessmentSchema(assessment);
}

function generatedAssessmentSignature(source) {
  const assessment = normalizeAssessmentSchema(structuredClone(source));
  return normalizeAnswer([assessment.prompt, assessmentSolution(assessment), assessment.goal, assessment.feedback].join("::"));
}

function shuffleMultipleChoiceOptions(assessments = []) {
  let previousCorrectIndex = -1;
  assessments.forEach((assessment) => {
    if (!["multiple", "image-multiple"].includes(assessment?.type)) return;
    if (!Array.isArray(assessment.options) || assessment.options.length < 2) return;
    if (assessment.optionShuffleVersion === 2) {
      previousCorrectIndex = Number(assessment.correct);
      return;
    }
    const originalOptions = [...assessment.options];
    const originalCorrectIndex = Math.max(0, Math.min(originalOptions.length - 1, Number(assessment.correct) || 0));
    const originalIndexes = originalOptions.map((_, index) => index);
    let permutation = [...originalIndexes];
    let shuffledCorrectIndex = originalCorrectIndex;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      permutation = [...originalIndexes];
      for (let index = permutation.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [permutation[index], permutation[swapIndex]] = [permutation[swapIndex], permutation[index]];
      }
      shuffledCorrectIndex = permutation.indexOf(originalCorrectIndex);
      const orderChanged = permutation.some((value, index) => value !== index);
      if (orderChanged && shuffledCorrectIndex !== previousCorrectIndex) break;
    }
    if (!permutation.some((value, index) => value !== index) || shuffledCorrectIndex === previousCorrectIndex) {
      permutation = [...originalIndexes];
      const targetIndex = (Math.max(previousCorrectIndex, originalCorrectIndex) + 1) % permutation.length;
      [permutation[originalCorrectIndex], permutation[targetIndex]] = [permutation[targetIndex], permutation[originalCorrectIndex]];
      shuffledCorrectIndex = permutation.indexOf(originalCorrectIndex);
    }
    assessment.options = permutation.map((index) => originalOptions[index]);
    if (Array.isArray(assessment.experiment?.presets) && assessment.experiment.presets.length === permutation.length) {
      const originalPresets = [...assessment.experiment.presets];
      assessment.experiment.presets = permutation.map((index) => originalPresets[index]);
    }
    assessment.correct = shuffledCorrectIndex;
    assessment.solution = String(assessment.options?.[assessment.correct] || "");
    if (assessment.answerData && typeof assessment.answerData === "object") {
      assessment.answerData.options = [...assessment.options];
      assessment.answerData.correct = assessment.correct;
    }
    assessment.optionShuffleVersion = 2;
    previousCorrectIndex = shuffledCorrectIndex;
  });
  return assessments;
}

function finalizeGeneratedAssessment(activity, source, levelIndex, questionIndex, questionsPerLevel) {
  const globalIndex = (levelIndex * questionsPerLevel) + questionIndex;
  const assessment = normalizeAssessmentSchema(structuredClone(source));
  assessment.subject = activity.subject;
  assessment.levelIndex = levelIndex;
  assessment.questionIndex = questionIndex;
  assessment.globalIndex = globalIndex;
  assessment.levelId = `level-${levelIndex + 1}`;
  assessment.questionId ||= `${assessment.levelId}-question-${questionIndex + 1}`;
  assessment.solution = assessmentSolution(assessment);
  assessment.answerData = {
    type: assessment.type,
    options: assessment.options || [],
    correct: assessment.correct,
    accepted: assessment.accepted || [],
    pairs: assessment.pairs || [],
    pieces: assessment.pieces || [],
    correctSequence: assessment.correctSequence || [],
    correctValue: assessment.correctValue,
    unit: assessment.unit || ""
  };
  assessment.observationGuide = String(assessment.observationGuide || defaultAssessmentObservationGuide(assessment)).trim();
  assessment.animation = buildQuestionAnimationProfile(activity, assessment, globalIndex);
  assessment.gameplay = buildQuestionGameplayProfile(activity, assessment, globalIndex);
  const curriculumProfile = curriculumProfileFor(activity.subject, activity.topic);
  if (curriculumProfile) assessment.gameplay = {
    ...assessment.gameplay,
    mechanic: STRUCTURED_MECHANICS[assessment.type] || curriculumProfile.gameProfile.mechanic,
    modelId: curriculumProfile.gameProfile.modelId,
    sceneVariant: curriculumProfile.gameProfile.sceneVariant,
    profileId: curriculumProfile.id
  };
  assessment.experiment = buildQuestionExperiment(activity, assessment, globalIndex);
  return assessment;
}

async function requestAssessmentLevel(activity, levelIndex, questionsNeeded, acceptedQuestions, allAccepted, scheduledTypes = [], retryFeedback = []) {
  const level = activity.learningGuide?.levels?.[levelIndex] || {};
  const allowedGeneratedTypes = [...new Set(questionTypesForActivity(activity, ACTIVITY_QUESTION_TYPES).map(generatedTypeForScheduledType))];
  const responseSchema = buildCompactAssessmentGenerationSchema(activity, scheduledTypes, questionsNeeded);
  const previousSummary = allAccepted.map((assessment) => ({
    level: Number(assessment.levelIndex) + 1,
    prompt: assessment.prompt,
    solution: assessment.solution || assessmentSolution(assessment),
    type: assessment.type,
    mechanic: assessment.gameplay?.mechanic || assessment.gameplay?.interaction || ""
  }));
  const requestOptions = {
    method: "POST",
    body: {
      model: $("#modelSelect").value,
      payload: {
        systemInstruction: {
          parts: [{
            text: "Eres especialista en evaluación STEM para adolescentes. Genera contenido correcto, coherente, breve, verificable y sin repeticiones. Cumple estrictamente el contrato JSON solicitado."
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: [
              `Genera exactamente ${questionsNeeded} preguntas nuevas para el nivel ${levelIndex + 1}.`,
              buildCurriculumGenerationContract(activity),
              `Tipos obligatorios, en este mismo orden: ${scheduledTypes.map((type) => type === "image-multiple" ? "multiple (apta para imagen)" : generatedTypeForScheduledType(type)).join(", ")}. No sustituyas, omitas ni reordenes estos tipos.`,
              scheduledTypes.includes("image-multiple")
                ? "REQUISITO DE IMAGEN: devuelve type multiple, exactamente cuatro opciones distintas y breves, y haz que TODAS sean nombres concretos de estructuras, organismos, objetos o elementos observables del tema. Cada opción debe tener máximo 8 palabras. No uses oraciones, explicaciones, acciones, cantidades, fórmulas ni valores como opciones."
                : "Respeta los campos específicos del tipo solicitado.",
              `Materia exclusiva: ${SUBJECT_LABELS[activity.subject]}. Tema: ${activity.topic}. Grado: ${activity.grade}.`,
              `Perfil científico del juego: ${JSON.stringify(curriculumProfileFor(activity.subject, activity.topic)?.gameProfile || {})}. Conserva su contenido y modelo científico, pero usa los tipos obligatorios indicados arriba.`,
              `Aprendizajes esperados obligatorios: ${activity.expectedLearnings || "No se proporcionaron aprendizajes adicionales; usa el tema y el grado seleccionados."}`,
              `Experiencia obligatoria solicitada por el docente: ${activity.experiencePrompt || "No se proporcionó una instrucción adicional."}`,
              `Objetivo del nivel: ${level.objective || activity.mission}.`,
              `Conceptos del nivel: ${JSON.stringify(level.concepts || [])}.`,
              `Caso aplicado generado por Gemini para este nivel: ${JSON.stringify(level.example || {})}. Las preguntas deben evaluar ese mismo fenómeno, datos, unidades y relación; no sustituyas el caso por una plantilla genérica.`,
              "Todas las preguntas, respuestas y retroalimentaciones deben materializar la experiencia solicitada por el docente.",
              `Dificultad general: ${activity.difficulty}.`,
              `Preguntas válidas ya creadas en este nivel: ${JSON.stringify(acceptedQuestions.map((item) => ({ prompt: item.prompt, solution: item.solution, type: item.type })))}.`,
              `Contenido ya usado en toda la actividad, que no debes repetir: ${JSON.stringify(previousSummary)}.`,
              retryFeedback.length
                ? `CORRECCIONES OBLIGATORIAS DEL INTENTO ANTERIOR: ${retryFeedback.join(" | ")}. Regenera esas preguntas completas; no omitas campos ni cambies los tipos solicitados.`
                : "Este es el primer intento para estas posiciones; entrega todos los elementos completos.",
              activity.subject === "math"
                ? "Todo debe ser matemático. Prohibido introducir química, física, biología, reactivos, células, fuerzas o experimentos científicos ajenos al tema."
                : `No mezcles contenido de materias distintas de ${SUBJECT_LABELS[activity.subject]}.`,
              activity.subject === "biology"
                ? "En Biología, los tipos son únicamente formatos de interacción. No generes ni disfraces ecuaciones, gráficas, exponentes, balance químico o rectas numéricas como relaciones biológicas. Las cantidades sólo pueden ser conteos directos con enteros pequeños."
                : "Mantén cada formato de pregunta estrictamente dentro de la materia y el tema seleccionados.",
              activity.subject === "biology" && scheduledTypes.some((type) => generatedTypeForScheduledType(type) === "numeric-answer")
                ? "REGLA NUMÉRICA OBLIGATORIA: plantea un conteo directo de objetos o muestras explícitos, con una sola suma o resta sencilla. correctValue debe ser un entero de 0 a 30, tolerance debe ser exactamente 0 y unit debe nombrar lo contado. Prohibido usar porcentajes, tasas, promedios, proporciones, variables, fórmulas o más de una operación."
                : "Usa valores y unidades compatibles con la materia y el grado.",
              "Cada elemento debe incluir context, observationGuide, given, goal, prompt, type, feedback, solution, gameplay y experiment.",
              "context debe tener de 2 a 4 oraciones claras: presenta la situación, explica el concepto previo indispensable y especifica qué evidencia o datos están disponibles, sin revelar la respuesta.",
              "observationGuide debe ser una instrucción directa de una o dos oraciones que indique exactamente qué observar, comparar, calcular u ordenar. No uses frases genéricas y no adelantes la respuesta.",
              "prompt debe ser una pregunta breve, directa y con una sola tarea. Evita expresiones ambiguas como '¿qué conclusión científica?' si puedes nombrar exactamente la comparación o decisión requerida.",
              `Tipos permitidos para esta actividad: ${allowedGeneratedTypes.join(", ")}.`,
              "Para multiple incluye exactamente cuatro options y correct. La posición correcta debe poder ocupar A, B, C o D; no coloques siempre la respuesta correcta en la primera posición. Para matching incluye pairs. Para keyword incluye accepted. Para fill-blank incluye accepted y segments: segments debe contener una oración completa dividida exactamente como [\"texto anterior al hueco\", \"___\", \"texto posterior al hueco\"]. El texto anterior y posterior deben formar una afirmación natural al insertar la respuesta; nunca uses el prompt ni una instrucción como oración incompleta.",
              "Para equation-build incluye pieces desordenadas y correctSequence en el orden exacto de lectura, de izquierda a derecha. correctSequence, solution y la ecuación indicada en feedback deben representar exactamente la misma igualdad; nunca comiences con un operador binario. Para exponent-placement incluye bases, exponents y correctExponents.",
              "Para chemical-balance incluye compounds y correctCoefficients. Para numeric-answer incluye correctValue, tolerance y unit.",
              "Para graph-plot incluye axes y targetPoints. Para sequence-order incluye steps desordenados y correctOrder.",
              "Para timeline-order incluye timelineMode (chronology, process o ideas), entre 3 y 8 events con id único, label opcional, title y description, y correctOrder con todos los IDs en el orden exacto. Los events deben entregarse mezclados.",
              "La retroalimentación debe explicar la solución concreta y corregir un error conceptual. No uses textos genéricos.",
              "Cada pregunta debe ser semánticamente distinta: no reutilices el mismo enunciado, fórmula, datos, incógnita ni resultado de otra pregunta, incluso si cambias su tipo o redacción.",
              "Varía las mecánicas y no repitas la mecánica de la pregunta anterior cuando exista una alternativa apropiada.",
              "Devuelve únicamente JSON con la forma {\"assessments\": [...]}."
            ].join("\n")
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          maxOutputTokens: 8192,
          temperature: .72
        }
      }
    }
  };
  const promptPart = requestOptions.body.payload.contents[0].parts[0];
  let lastParseError;
  for (let jsonAttempt = 1; jsonAttempt <= 3; jsonAttempt += 1) {
    let response;
    try {
      response = await requestAssessmentGeminiWithRetry(requestOptions);
    } catch (error) {
      const invalidSchemaRequest = Number(error?.status || 0) === 400
        || /invalid_argument|invalid argument/i.test(String(error?.message || ""));
      if (!invalidSchemaRequest || !requestOptions.body.payload.generationConfig.responseSchema) throw error;
      console.warn("[ScienceActivities] Gemini rechazó el esquema compacto; reintentando la misma pregunta como JSON sin esquema.");
      delete requestOptions.body.payload.generationConfig.responseSchema;
      response = await requestAssessmentGeminiWithRetry(requestOptions);
    }
    try {
      const generated = parseGeneratedJson(extractResponseText(response));
      if (!Array.isArray(generated?.assessments)) throw new SyntaxError("El JSON no contiene el arreglo assessments.");
      logScienceGenerationStep("Respuesta JSON de pregunta validada", { intentoFormato: jsonAttempt, elementos: generated.assessments.length });
      return generated.assessments;
    } catch (error) {
      lastParseError = error;
      if (jsonAttempt >= 3) break;
      logScienceGenerationStep("Respuesta JSON incompleta; se repetirá la pregunta", { intentoFormato: jsonAttempt, error: String(error?.message || "formato inválido") }, "warn");
      console.warn(`[ScienceActivities] Gemini devolvió JSON inválido para la pregunta; reintentando formato (${jsonAttempt}/3).`);
      promptPart.text += [
        "",
        "CORRECCIÓN DE FORMATO OBLIGATORIA:",
        "La respuesta anterior fue JSON inválido o quedó incompleta.",
        `Vuelve a generar desde cero exactamente ${questionsNeeded} elemento completo dentro de assessments.`,
        "Cierra todas las cadenas, objetos y arreglos. No uses Markdown ni texto fuera del JSON."
      ].join("\n");
    }
  }
  throw new Error(`Gemini no devolvió JSON completo después de 3 intentos: ${String(lastParseError?.message || "formato inválido")}`);
}

async function regenerateCompleteAssessment(activity, assessmentIndex) {
  const assessments = Array.isArray(activity?.assessments) ? activity.assessments : [];
  const previousAssessment = assessments[assessmentIndex];
  if (!previousAssessment) throw new Error("La pregunta seleccionada ya no existe.");

  const scheduledType = previousAssessment.type === "image-multiple" ? "image-multiple" : String(previousAssessment.type || "");
  const allowedTypes = questionTypesForActivity(activity, ACTIVITY_QUESTION_TYPES);
  if (!allowedTypes.includes(scheduledType)) {
    throw new Error(`El tipo ${scheduledType || "desconocido"} no está permitido para esta materia y tema.`);
  }

  const questionsPerLevel = positiveInteger(activity.questionsPerLevel, 1);
  const levelIndex = Number.isInteger(Number(previousAssessment.levelIndex))
    ? Number(previousAssessment.levelIndex)
    : Math.floor(assessmentIndex / questionsPerLevel);
  const questionIndex = Number.isInteger(Number(previousAssessment.questionIndex))
    ? Number(previousAssessment.questionIndex)
    : assessmentIndex % questionsPerLevel;
  const otherAssessments = assessments.filter((_, index) => index !== assessmentIndex);
  const acceptedInLevel = otherAssessments.filter((assessment) => Number(assessment.levelIndex) === levelIndex);
  const existingSignatures = new Set(otherAssessments.map(generatedAssessmentSignature).filter(Boolean));
  let retryFeedback = [
    `Regenera por completo la pregunta ${questionIndex + 1} del nivel ${levelIndex + 1}.`,
    `Conserva el tipo obligatorio ${scheduledType}, pero crea un enunciado, respuesta, distractores o datos y retroalimentación nuevos.`
  ];
  let lastError;

  for (let contentAttempt = 1; contentAttempt <= 4; contentAttempt += 1) {
    logScienceGenerationStep("Regenerando pregunta completa", {
      pregunta: assessmentIndex + 1,
      tipo: scheduledType,
      intentoContenido: contentAttempt
    });
    try {
      const candidates = await requestAssessmentLevel(
        activity,
        levelIndex,
        1,
        acceptedInLevel,
        otherAssessments,
        [scheduledType],
        retryFeedback
      );
      const sourceCandidate = candidates.find((candidate) => candidate?.type === generatedTypeForScheduledType(scheduledType));
      const prepared = prepareGeneratedAssessmentCandidate(activity, sourceCandidate, scheduledType, assessmentIndex);
      const signature = prepared ? generatedAssessmentSignature(prepared) : "";
      const visualCompatible = scheduledType !== "image-multiple" || assessmentCanBecomeVisualQuestion(prepared);

      if (!prepared || !generatedAssessmentIsComplete(activity, prepared)) {
        retryFeedback = [`La pregunta regenerada de tipo ${generatedTypeForScheduledType(scheduledType)} quedó incompleta o no cumple la política curricular.`];
        continue;
      }
      if (!visualCompatible) {
        retryFeedback = ["La pregunta visual debe incluir exactamente cuatro opciones breves, concretas, distintas y observables."];
        continue;
      }
      if (!signature || existingSignatures.has(signature)) {
        retryFeedback = ["La pregunta regenerada repite contenido de otra pregunta de la actividad. Crea un caso y una solución distintos."];
        continue;
      }

      let regenerated = finalizeGeneratedAssessment(activity, prepared, levelIndex, questionIndex, questionsPerLevel);
      if (scheduledType === "image-multiple") {
        regenerated = buildVisualQuestionFromAssessment(activity, regenerated, assessmentIndex);
        logScienceGenerationStep("Generando imagen nueva para la pregunta regenerada", { pregunta: assessmentIndex + 1 });
        await regenerateVisualQuestionImage(activity, regenerated);
        regenerated = finalizeGeneratedAssessment(activity, regenerated, levelIndex, questionIndex, questionsPerLevel);
        if (!visualQuestionImageSource(regenerated)) throw new Error("Gemini no devolvió una imagen válida para la pregunta visual.");
      }

      shuffleMultipleChoiceOptions([regenerated]);
      regenerated.questionId = previousAssessment.questionId || `${regenerated.levelId}-question-${questionIndex + 1}`;
      regenerated.plannedType = scheduledType;
      regenerated.generationSource = "gemini";
      regenerated.regeneratedAt = Date.now();
      if (!generatedAssessmentIsComplete(activity, regenerated)) {
        throw new Error("La pregunta quedó incompleta después de preparar sus datos interactivos.");
      }
      logScienceGenerationStep("Pregunta completa regenerada", {
        pregunta: assessmentIndex + 1,
        tipo: regenerated.type,
        imagen: Boolean(visualQuestionImageSource(regenerated))
      });
      return regenerated;
    } catch (error) {
      lastError = error;
      if (isTransientAssessmentGenerationError(error)
        || ["visual_question_ambiguous", "visual_image_ambiguous", "visual_analysis_format"].includes(error?.code)) throw error;
      retryFeedback = [`El intento ${contentAttempt} falló: ${String(error?.message || "contenido inválido").slice(0, 260)}. Genera nuevamente todos los campos desde cero.`];
    }
  }

  throw new Error(lastError?.message || "Gemini no produjo una pregunta completa y distinta después de varios intentos.");
}

function buildVisualQuestionFromAssessment(activity, source, globalIndex) {
  let assessment = normalizeAssessmentSchema(structuredClone(source || {}));
  if (assessment.type !== "multiple" || assessment.options?.length !== 4) {
    const concepts = (activity.learningGuide?.levels || []).flatMap((level) => level.concepts || [])
      .map((item) => String(item?.term || "").trim()).filter(Boolean);
    const target = concepts[globalIndex % Math.max(1, concepts.length)] || String(activity.topic || "elemento científico");
    const distractors = concepts.filter((item) => normalizeAnswer(item) !== normalizeAnswer(target)).slice(0, 3);
    while (distractors.length < 3) distractors.push(["Proceso relacionado", "Estructura diferente", "Variable secundaria"][distractors.length]);
    assessment = normalizeAssessmentSchema({
      ...assessment, type: "multiple",
      prompt: `¿Cómo se llama el elemento señalado en la imagen sobre ${activity.topic}?`,
      options: [target, ...distractors], correct: 0,
      feedback: assessment.feedback || `El elemento señalado corresponde a ${target}.`
    });
  }
  const target = String(assessment.options[Number(assessment.correct)] || activity.topic).trim();
  const visualContract = buildVisualQuestionContract(activity, assessment, target);
  assessment.type = "image-multiple";
  assessment.prompt = visualContract.prompt;
  assessment.visual = {
    target,
    sourcePrompt: visualContract.sourcePrompt,
    alt: visualContract.alt,
    imagePrompt: visualContract.imagePrompt,
    imageDataUrl: "", imageUrl: "", imageSrc: ""
  };
  assessment.solution = target;
  assessment.answerData = { ...(assessment.answerData || {}), type: assessment.type, options: [...assessment.options], correct: assessment.correct };
  return assessment;
}

function visualAnswerIsNamedEntity(answer) {
  const text = String(answer || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const quantitative = /\d|%|°|[$€£¥]|\b(?:kg|g|mg|m|cm|mm|km|l|ml|mol|m\/s|m\/s²|n|j|w|pa|k|°c|ph)\b|[=+×÷]/i.test(text);
  const sentenceLike = /[.!?;:]|\b(es|son|está|están|ocurre|produce|aumenta|disminuye|reduce|convierte|interrumpe|sufre|permite|impide|causa|provoca|debido|porque|cuando|se)\b/i.test(text);
  return Boolean(text) && text.length <= 72 && words.length <= 8 && !quantitative && !sentenceLike;
}

function assessmentCanBecomeVisualQuestion(assessment) {
  if (!assessment || !["multiple", "image-multiple"].includes(assessment.type)) return false;
  if (!Array.isArray(assessment.options) || assessment.options.length !== 4) return false;
  const correctIndex = Number(assessment.correct);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= assessment.options.length) return false;
  const correctAnswer = String(assessment.options[correctIndex] || "").trim();
  if (!correctAnswer || /\d|%|°|[$€£¥]|[=+×÷]/.test(correctAnswer)) return false;
  const normalizedOptions = assessment.options.map((option) => normalizeAnswer(option));
  return assessment.options.every((option) => visualAnswerIsNamedEntity(option))
    && new Set(normalizedOptions).size === assessment.options.length;
}

function buildConcreteVisualAssessment(activity, source = {}, index = 0) {
  const guideConcepts = (activity.learningGuide?.levels || []).flatMap((level) => level.concepts || []);
  const conceptDefinitions = new Map();
  const generatedTerms = guideConcepts.map((concept) => {
    const term = String(concept?.term || concept?.title || concept?.name || "").trim();
    if (term) conceptDefinitions.set(normalizeAnswer(term), String(concept?.definition || concept?.description || "").trim());
    return term;
  });
  const strictBiology = activity.subject === "biology"
    && Number(activity.generation?.curriculumPolicyVersion || 0) >= CURRICULUM_POLICY_VERSION;
  const subjectTerms = {
    biology: strictBiology
      ? [String(activity.topic || "Estructura biológica"), "Estructura principal", "Parte externa", "Zona interna", "Región central", "Capa protectora", "Tejido circundante"]
      : ["Núcleo", "Mitocondria", "Cloroplasto", "Aparato de Golgi", "Membrana celular", "Ribosoma", "Vacuola", "Pared celular"],
    chemistry: ["Átomo", "Molécula", "Protón", "Electrón", "Enlace covalente", "Cristal", "Disolución", "Precipitado"],
    physics: ["Resorte", "Polea", "Imán", "Lente convergente", "Resistencia eléctrica", "Péndulo", "Prisma", "Vector de fuerza"],
    math: ["Parábola", "Radio", "Diámetro", "Ángulo recto", "Eje de simetría", "Vértice", "Hipotenusa", "Plano cartesiano"]
  }[activity.subject] || ["Muestra", "Variable", "Instrumento", "Resultado"];
  const terms = [...generatedTerms, ...subjectTerms].filter((term, termIndex, all) =>
    visualAnswerIsNamedEntity(term) && all.findIndex((candidate) => normalizeAnswer(candidate) === normalizeAnswer(term)) === termIndex
  );
  const targetIndex = Math.abs(index) % Math.max(1, terms.length);
  const target = terms[targetIndex] || subjectTerms[0];
  const distractors = terms.filter((term) => normalizeAnswer(term) !== normalizeAnswer(target)).slice(0, 3);
  while (distractors.length < 3) distractors.push(subjectTerms[(distractors.length + 1) % subjectTerms.length]);
  const correct = Math.abs(assessmentHash(`${activity.topic}:${target}:${index}`)) % 4;
  const options = distractors.slice(0, 3);
  options.splice(correct, 0, target);
  const questionLabels = {
    biology: "¿Qué estructura biológica señala la flecha?",
    chemistry: "¿Qué partícula, sustancia o estructura química señala la flecha?",
    physics: "¿Qué componente o fenómeno físico señala la flecha?",
    math: "¿Qué elemento matemático señala la flecha?"
  };
  return normalizeAssessmentSchema({
    ...source,
    type: "multiple",
    prompt: questionLabels[activity.subject] || "¿Qué elemento científico señala la flecha?",
    context: `En ${activity.experiencePrompt || activity.mission || "la experiencia indicada"}, observa una representación científica de ${activity.topic} y localiza la punta de la única flecha.`,
    observationGuide: "Sigue la punta de la flecha y compara la forma, ubicación y conexiones del elemento señalado con cada opción.",
    options,
    correct,
    correctAnswers: [correct],
    feedback: conceptDefinitions.get(normalizeAnswer(target)) || `La flecha señala ${target}, reconocible por su forma y ubicación en la representación.`
  });
}

function buildVisualQuestionContract(activity, assessment, target) {
  const topic = String(activity.topic || "el tema científico").trim();
  const originalPrompt = String(assessment.visual?.sourcePrompt || assessment.prompt || "").trim()
    .replace(/^observa (?:la|esta) (?:imagen|ilustración)[.:,;\s-]*/i, "");
  const namedEntity = visualAnswerIsNamedEntity(target);
  const prompt = namedEntity
    ? ({
      biology: "¿Qué estructura biológica señala la flecha?",
      chemistry: "¿Qué partícula, sustancia o estructura química señala la flecha?",
      physics: "¿Qué componente o fenómeno físico señala la flecha?",
      math: "¿Qué elemento matemático señala la flecha?"
    }[activity.subject] || "¿Qué elemento científico señala la flecha?")
    : originalPrompt
      ? `Observa la imagen y responde: ${originalPrompt}`
      : "¿Qué conclusión científica demuestra la imagen?";
  const targetInstruction = namedEntity
    ? `Depict the real, scientifically accepted appearance of ${target} in its correct context and place exactly one high-contrast arrow whose tip touches only ${target}.`
    : `Depict one real, observable and scientifically valid situation that provides evidence for this conclusion: ${target}. The arrow must point to the exact observable feature that supports the conclusion, never to an invented organ, object or symbol.`;
  const sourceQuestion = originalPrompt ? `Original scientific question to preserve: ${originalPrompt}.` : "";
  const answerChoices = Array.isArray(assessment.options)
    ? assessment.options.map((option, index) => `${String.fromCharCode(65 + index)}) ${String(option || "").trim()}`).join(" | ")
    : "";
  return {
    prompt,
    sourcePrompt: originalPrompt,
    alt: namedEntity
      ? `Representación científica de ${topic} con un único elemento señalado por una flecha.`
      : `Representación científica de ${topic} con una evidencia observable señalada por una flecha.`,
    imagePrompt: [
      `Create a scientifically accurate educational image for teenagers about ${topic}.`,
      `Teacher-requested experience context: ${activity.experiencePrompt || activity.mission || topic}. Use it only to choose a familiar setting; do not attempt to illustrate every concept, instruction or action from that text.`,
      buildCurriculumGenerationContract(activity),
      sourceQuestion,
      answerChoices ? `Use these answer choices only as semantic context; none may appear in the image: ${answerChoices}. The correct answer is ${target}, for alignment only.` : "",
      targetInstruction,
      "Scientific truth is mandatory: use established anatomy, geometry, scale relationships, apparatus, materials and cause-effect relationships appropriate to the subject. Do not invent structures, organisms, mechanisms, measurements or impossible combinations.",
      "The rendering may be realistic, illustrated or cartoon-styled, but stylization must not alter the scientific identity, essential proportions, location, connections or function of what is represented.",
      "Show only the information required to answer. Use one dominant specimen or object in a simple close-up composition and an uncluttered background. Do not create a montage, comparison panel, sequence, collage, multiple specimens or secondary teaching scene. Draw EXACTLY ONE arrow in the entire image, with one shaft and one arrowhead; draw zero secondary arrows, flow arrows, pointer lines or decorative directional marks. Start the arrow in empty background space and make its tip visibly terminate inside only one recognizable target.",
      "NEVER reveal the answer in the image. Do not copy, paraphrase, spell, label, caption or visually print the correct answer or any answer option. Do not include percentages, measurements, values, letters, numbers, formulas, legends, logos or watermarks. Represent the evidence visually only.",
      "Landscape 16:9 composition, complete subject visible, no crop and no decorative pseudo-scientific interface.",
      `Art finish only: ${activitySceneStyleFinish(activity.visualStyle)}. The style may alter only palette, linework, shading and lighting; it must not invent a futuristic setting, holograms, floating interfaces or fictional equipment.`
    ].filter(Boolean).join(" ")
  };
}

async function generateVisualQuestionImage(assessment) {
  const errors = [];
  for (const model of ["gemini-3.1-flash-image", "gemini-2.5-flash-image"]) {
    try {
      const result = await generateImagesOnDemand({
        mode: "generate", prompt: assessment.visual.imagePrompt,
        options: { model, aspectRatio: "16:9", imageSize: "1K", count: 1 }, attachments: []
      });
      if (result?.[0]?.dataUrl) return result[0].dataUrl;
    } catch (error) {
      errors.push(`${model}: ${error?.message || "sin imagen"}`);
    }
  }
  throw new Error(errors.join(" · ") || "Gemini no devolvió la imagen de la pregunta visual.");
}

async function visualQuestionInspectionPart(imageDataUrl) {
  // Los Data URL son recursos locales, no conexiones. Decodificarlos mediante
  // fetch activa connect-src y producción los bloquea correctamente por CSP.
  const bitmap = await decodeImageSource(imageDataUrl);
  const maximumWidth = 896;
  const maximumHeight = 504;
  const scale = Math.min(1, maximumWidth / bitmap.width, maximumHeight / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const thumbnail = canvas.toDataURL("image/jpeg", .72);
  const match = thumbnail.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) throw new Error("No se pudo preparar la imagen generada para su análisis visual.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function conciseVisualAnswerLabel(value) {
  return String(value || "")
    .replace(/^\s*(?:opci[oó]n\s*)?[A-D][).:\-]\s*/i, "")
    .replace(/\s*\([^)]{3,}\)\s*$/u, "")
    .split(/\s+(?:que|cuya|cuyo|donde|porque|es|son|está|están|permite|realiza|produce|regula|controla)\s+/i)[0]
    .split(/\s+[—–-]\s+|[\n:;,]/u)[0]
    .trim();
}

function alignVisualAnalysisResult(activity, assessment, analysis) {
  if (!analysis?.usable) {
    const error = new Error(`La imagen no permite una pregunta coherente: ${String(analysis?.issue || "objetivo visual ambiguo")}`);
    error.code = "visual_image_ambiguous";
    throw error;
  }
  // Las opciones ya fueron generadas y validadas antes de crear la imagen. El
  // análisis visual decide cuál de ellas toca realmente la flecha y ese índice
  // se convierte en la respuesta correcta. Nunca vuelve a redactar respuestas,
  // porque Gemini suele convertir nombres válidos en frases explicativas.
  const options = assessmentList(assessment.options).map(conciseVisualAnswerLabel).filter(Boolean);
  const plannedCorrect = Number(assessment.correct);
  if (options.length !== 4 || new Set(options.map(normalizeAnswer)).size !== 4 || !Number.isInteger(plannedCorrect) || plannedCorrect < 0 || plannedCorrect > 3 || !options.every(visualAnswerIsNamedEntity)) {
    const error = new Error("La pregunta original no contiene cuatro opciones nominales válidas y una solución inequívoca.");
    error.code = "visual_analysis_format";
    throw error;
  }
  const observedCorrect = Number(analysis.correct);
  if (!Number.isInteger(observedCorrect) || observedCorrect < 0 || observedCorrect > 3) {
    const error = new Error("El análisis visual no identificó una opción canónica inequívoca.");
    error.code = "visual_analysis_format";
    throw error;
  }
  const correct = observedCorrect;
  const target = options[correct];
  const analyzedTarget = conciseVisualAnswerLabel(analysis.target);
  if (!analyzedTarget || normalizeAnswer(analyzedTarget) !== normalizeAnswer(target)) {
    const error = new Error("El análisis visual no hizo coincidir el elemento observado con la opción correcta seleccionada.");
    error.code = "visual_analysis_format";
    throw error;
  }
  const given = assessmentList(analysis.given).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  const goal = String(analysis.goal || "").trim();
  const aligned = normalizeAssessmentSchema({
    ...assessment,
    type: "image-multiple",
    prompt: String(analysis.prompt || "").trim(),
    context: String(analysis.context || "").trim(),
    observationGuide: String(analysis.observationGuide || "").trim(),
    given,
    goal,
    options,
    correct,
    correctAnswers: [correct],
    feedback: String(analysis.feedback || "").trim(),
    visual: {
      ...(assessment.visual || {}),
      target,
      alt: String(analysis.alt || "").trim(),
      observedScene: String(analysis.observedScene || "").trim(),
      analysisVersion: 4,
      plannedTarget: options[plannedCorrect],
      answerAlignedFromImage: correct !== plannedCorrect
    }
  });
  if (!generatedAssessmentIsComplete(activity, aligned) || !assessmentCanBecomeVisualQuestion(aligned)) {
    const error = new Error("La pregunta redactada desde la imagen no cumple el contrato curricular o de opción múltiple.");
    error.code = "visual_analysis_format";
    throw error;
  }
  aligned.solution = String(aligned.options[aligned.correct] || "");
  aligned.answerData = { ...(aligned.answerData || {}), type: aligned.type, options: [...aligned.options], correct: aligned.correct };
  return aligned;
}

async function alignVisualQuestionToGeneratedImage(activity, assessment, imageDataUrl) {
  const inspectionPart = await visualQuestionInspectionPart(imageDataUrl);
  const canonicalOptions = assessmentList(assessment.options).map(conciseVisualAnswerLabel);
  const plannedCorrect = Number(assessment.correct);
  const responseSchema = {
    type: "object",
    properties: {
      usable: { type: "boolean" },
      issue: { type: "string" },
      observedScene: { type: "string" },
      target: { type: "string" },
      prompt: { type: "string" },
      context: { type: "string" },
      observationGuide: { type: "string" },
      given: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      goal: { type: "string" },
      options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
      correct: { type: "integer", minimum: 0, maximum: 3 },
      feedback: { type: "string" },
      alt: { type: "string" }
    },
    required: ["usable", "issue", "observedScene", "target", "prompt", "context", "observationGuide", "given", "goal", "options", "correct", "feedback", "alt"]
  };
  const requestOptions = {
    method: "POST",
    body: {
      model: $("#modelSelect")?.value || "gemini-3.6-flash",
      payload: {
        systemInstruction: { parts: [{ text: "Eres especialista en visión científica y evaluación escolar. Debes basar toda la pregunta únicamente en la evidencia realmente visible en la imagen adjunta." }] },
        contents: [{
          role: "user",
          parts: [{
            text: [
              "Analiza primero la imagen generada y después redacta la pregunta de opción múltiple.",
              `Materia exclusiva: ${SUBJECT_LABELS[activity.subject]}. Tema exclusivo: ${activity.topic}. Grado: ${activity.grade}.`,
              `Experiencia obligatoria del docente: ${activity.experiencePrompt || activity.mission || activity.topic}.`,
              buildCurriculumGenerationContract(activity),
              "Determina qué elemento toca realmente la punta de la flecha principal. No uses la intención del prompt anterior como prueba: manda únicamente lo que observas.",
              "Marca usable=false si no hay un único objetivo visual inequívoco, si la flecha no toca un elemento reconocible, si la escena contradice la materia o el tema, o si no pueden crearse cuatro opciones visualmente coherentes.",
              `OPCIONES CANÓNICAS, EN ESTE ORDEN INMUTABLE: ${canonicalOptions.map((option, index) => `${index}: ${option}`).join(" | ")}.`,
              "No inventes, amplíes, resumas, reformules ni reordenes las opciones. Copia exactamente las cuatro opciones canónicas en options y conserva sus índices.",
              "Si usable=true, correct debe ser el índice de la opción canónica que toca REALMENTE la punta de la flecha y target debe copiar exactamente esa opción. No intentes conservar ni adivinar una respuesta previa: manda únicamente la evidencia visible.",
              "Si la flecha señala con claridad cualquiera de las cuatro opciones canónicas, la imagen es usable aunque esa opción sea distinta de la usada para generar la ilustración. Marca usable=false sólo cuando no corresponda a ninguna opción o sea ambigua.",
              "Sólo DESPUÉS de elegir correct y target, redacta todos los demás textos desde esa misma evidencia visible.",
              "prompt debe preguntar por el elemento que realmente señala la flecha; context debe describir fielmente esa escena y conectarla con la experiencia docente sin revelar la respuesta; observationGuide debe indicar qué forma, posición o conexión comparar para reconocer exactamente la opción correcta.",
              "given debe contener de uno a cuatro datos breves que sí sean visibles o necesarios para interpretar esta imagen concreta; elimina cualquier dato heredado de otra pregunta. goal debe expresar la acción del alumno para identificar el elemento señalado, sin mencionar una respuesta diferente.",
              "feedback debe explicar por qué la opción observada en correct coincide con la forma y ubicación señaladas, sin describir otra opción.",
              "No introduzcas ATP, ecuaciones, procesos, objetos, escenarios ni conceptos que no aparezcan en la imagen y en el tema solicitado.",
              "alt debe describir la escena y la ubicación de la flecha sin revelar el nombre de la respuesta.",
              "Devuelve únicamente el JSON solicitado."
            ].join("\n")
          }, inspectionPart]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          maxOutputTokens: 4096,
          temperature: .2
        }
      }
    }
  };
  logScienceGenerationStep("Analizando coherencia de imagen y pregunta", {
    pregunta: Number(assessment.globalIndex ?? state.contentQuestionIndex) + 1,
    opcionesCanonicas: canonicalOptions.length
  });
  const response = await requestAssessmentGeminiWithRetry(requestOptions);
  const analysis = parseGeneratedJson(extractResponseText(response));
  logScienceGenerationStep("Análisis visual recibido", {
    pregunta: Number(assessment.globalIndex ?? state.contentQuestionIndex) + 1,
    usable: Boolean(analysis?.usable),
    opcionObservada: Number(analysis?.correct),
    opcionPlaneada: plannedCorrect
  });
  const aligned = alignVisualAnalysisResult(activity, assessment, analysis);
  Object.keys(assessment).forEach((key) => delete assessment[key]);
  Object.assign(assessment, aligned);
  logScienceGenerationStep("Pregunta visual alineada con la imagen", { pregunta: Number(assessment.globalIndex ?? state.contentQuestionIndex) + 1, respuesta: assessment.solution });
  return assessment;
}

async function regenerateVisualQuestionImage(activity, assessment) {
  if (!assessmentCanBecomeVisualQuestion(assessment)) {
    const repaired = buildConcreteVisualAssessment(activity, assessment, Number(assessment.globalIndex ?? state.contentQuestionIndex) || 0);
    Object.keys(assessment).forEach((key) => delete assessment[key]);
    Object.assign(assessment, repaired);
  }
  const correctIndex = Math.max(0, Math.min(assessment.options.length - 1, Number(assessment.correct) || 0));
  const target = String(assessment.options[correctIndex] || "").trim();
  if (!target) throw new Error("La pregunta no tiene una respuesta correcta válida para generar su imagen.");
  assessment.visual = assessment.visual && typeof assessment.visual === "object" ? assessment.visual : {};
  assessment.visual.target = target;
  const visualContract = buildVisualQuestionContract(activity, assessment, target);
  assessment.prompt = visualContract.prompt;
  assessment.visual.sourcePrompt = visualContract.sourcePrompt;
  assessment.visual.imagePrompt = visualContract.imagePrompt;
  assessment.visual.alt = visualContract.alt;
  logScienceGenerationStep("Generando única imagen de la pregunta visual", {
    pregunta: Number(assessment.globalIndex ?? state.contentQuestionIndex) + 1
  });
  const generatedImageDataUrl = await generateVisualQuestionImage(assessment);
  await alignVisualQuestionToGeneratedImage(activity, assessment, generatedImageDataUrl);
  assessment.visual.imageDataUrl = generatedImageDataUrl;
  assessment.visual.imageUrl = "";
  assessment.visual.imageSrc = "";
  assessment.visual.visualGenerationAttempts = 1;
  delete assessment.visual.generationError;
  return assessment.visual.imageDataUrl;
}

async function ensureSingleVisualQuestion(activity, assessments = []) {
  if (activity.gameMode === "simulator" || !assessments.length) return assessments;
  assessments.forEach((assessment) => {
    if (assessment.type === "image-multiple") assessment.type = "multiple";
  });
  const plannedVisualIndex = assessments.findIndex((assessment) => assessment.plannedType === "image-multiple");
  const preferredIndex = plannedVisualIndex >= 0
    ? plannedVisualIndex
    : assessmentHash(`${activity.subject}:${activity.topic}:${activity.title}`) % assessments.length;
  const multipleIndexes = assessments.map((assessment, index) => assessmentCanBecomeVisualQuestion(assessment) ? index : -1).filter((index) => index >= 0);
  let selectedIndex = multipleIndexes.length
    ? multipleIndexes.reduce((best, index) => Math.abs(index - preferredIndex) < Math.abs(best - preferredIndex) ? index : best, multipleIndexes[0])
    : -1;
  logScienceGenerationStep("Seleccionando pregunta para imagen", { candidatas: multipleIndexes.length, indiceSeleccionado: selectedIndex + 1 });
  if (!assessmentCanBecomeVisualQuestion(assessments[selectedIndex])) {
    selectedIndex = Math.max(0, Math.min(assessments.length - 1, preferredIndex));
    const source = assessments[selectedIndex];
    const repaired = buildConcreteVisualAssessment(activity, source, selectedIndex);
    repaired.generationSource = source?.generationSource || "gemini";
    repaired.plannedType = "image-multiple";
    assessments[selectedIndex] = repaired;
    if (!assessmentCanBecomeVisualQuestion(repaired)) {
      throw new Error("No se pudo normalizar una pregunta Gemini para la imagen obligatoria.");
    }
    logScienceGenerationStep("Pregunta Gemini normalizada para imagen", { pregunta: selectedIndex + 1 }, "warn");
  }
  const visualQuestion = buildVisualQuestionFromAssessment(activity, assessments[selectedIndex], selectedIndex);
  try {
    logScienceGenerationStep("Generando imagen de la pregunta visual", { pregunta: selectedIndex + 1, tipo: visualQuestion.type });
    await regenerateVisualQuestionImage(activity, visualQuestion);
    logScienceGenerationStep("Imagen de pregunta visual generada", { pregunta: selectedIndex + 1 });
  } catch (error) {
    visualQuestion.visual.generationError = String(error?.message || "No se pudo generar la imagen.");
    console.warn("[ScienceActivities] La pregunta visual quedó bloqueada porque no se pudo generar su imagen:", error);
    logScienceGenerationStep("Falló la imagen de la pregunta visual", { pregunta: selectedIndex + 1, error: String(error?.message || "error desconocido") }, "warn");
  }
  assessments[selectedIndex] = visualQuestion;
  return shuffleMultipleChoiceOptions(assessments);
}

async function generateAssessmentsWithGemini(activity) {
  if (activity.gameMode === "simulator") return [];
  const levelCount = positiveInteger(activity.levelCount, 3);
  const questionsPerLevel = positiveInteger(activity.questionsPerLevel, 3);
  const expectedCount = levelCount * questionsPerLevel;
  const typeSchedule = buildQuestionTypeSchedule(activity, expectedCount);
  const draftKey = generationDraftKey(activity);
  const storedDraft = await readGenerationDraft(draftKey).catch(() => null);
  logScienceGenerationStep("Calendario de preguntas preparado", { niveles: levelCount, preguntasPorNivel: questionsPerLevel, total: expectedCount, tipos: typeSchedule });
  const signatures = new Set();
  const levelDrafts = Array.from({ length: levelCount }, (_, levelIndex) => {
    const stored = Array.isArray(storedDraft?.levels?.[levelIndex]) ? storedDraft.levels[levelIndex] : [];
    return stored.reduce((accepted, assessment) => {
      if (accepted.length >= questionsPerLevel || assessment?.generationSource !== "gemini" || !generatedAssessmentIsComplete(activity, assessment)) return accepted;
      const globalIndex = (levelIndex * questionsPerLevel) + accepted.length;
      const storedPlannedType = String(assessment.plannedType || "");
      const storedPlannedTypeAllowed = storedPlannedType
        && questionTypesForActivity(activity, ACTIVITY_QUESTION_TYPES).includes(storedPlannedType);
      const scheduledType = storedPlannedTypeAllowed ? storedPlannedType : typeSchedule[globalIndex];
      typeSchedule[globalIndex] = scheduledType;
      if (assessment.type !== generatedTypeForScheduledType(scheduledType)) return accepted;
      const signature = generatedAssessmentSignature(assessment);
      if (!signature || signatures.has(signature)) return accepted;
      signatures.add(signature);
      const finalized = finalizeGeneratedAssessment(activity, assessment, levelIndex, accepted.length, questionsPerLevel);
      finalized.plannedType = scheduledType;
      accepted.push(finalized);
      return accepted;
    }, []);
  });
  logScienceGenerationStep("Borrador de preguntas restaurado", { recuperadas: levelDrafts.reduce((total, level) => total + level.length, 0), total: expectedCount });

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
    let attempts = 0;
    const maxAttempts = Math.max(15, questionsPerLevel * 4);
    const rejectionCountsBySlot = new Map();
    const skippedTypesBySlot = new Map();
    const maxRejectedAttemptsPerType = 2;
    let transientFailureGroups = 0;
    const maxTransientFailureGroups = 4;
    let retryFeedback = [];
    logScienceGenerationStep("Iniciando nivel de preguntas", { nivel: levelIndex + 1, recuperadas: levelDrafts[levelIndex].length, requeridas: questionsPerLevel });
    while (levelDrafts[levelIndex].length < questionsPerLevel && attempts < maxAttempts) {
      attempts += 1;
      // Una pregunta por respuesta evita que un corte al final del modelo invalide
      // varias preguntas Gemini correctas dentro del mismo arreglo JSON.
      const batchSize = 1;
      const scheduleOffset = (levelIndex * questionsPerLevel) + levelDrafts[levelIndex].length;
      const scheduledTypes = typeSchedule.slice(scheduleOffset, scheduleOffset + batchSize);
      logScienceGenerationStep("Solicitando pregunta", { nivel: levelIndex + 1, pregunta: levelDrafts[levelIndex].length + 1, totalNivel: questionsPerLevel, tipoPlanificado: scheduledTypes[0], intentoContenido: attempts });
      let candidates = [];
      try {
        candidates = await requestAssessmentLevel(activity, levelIndex, batchSize, levelDrafts[levelIndex], levelDrafts.flat(), scheduledTypes, retryFeedback);
      } catch (error) {
        console.warn(`[ScienceActivities] No se pudo generar la pregunta del nivel ${levelIndex + 1}:`, error);
        if (Number(error?.status || 0) === 400 || /invalid_argument|invalid argument/i.test(String(error?.message || ""))) {
          throw new Error(`Gemini rechazó la solicitud del nivel ${levelIndex + 1}: ${error?.message || "solicitud inválida"}. No se añadieron preguntas fallback.`);
        }
        if (isTransientAssessmentGenerationError(error)) {
          transientFailureGroups += 1;
          if (transientFailureGroups < maxTransientFailureGroups) {
            attempts -= 1;
            continue;
          }
          throw new Error(`Gemini continúa temporalmente sin disponibilidad después de varios reintentos. Se conservaron ${levelDrafts[levelIndex].length} de ${questionsPerLevel} preguntas para reanudar sin comenzar desde cero.`);
        }
        retryFeedback = [`La solicitud anterior falló: ${String(error?.message || "error temporal").slice(0, 240)}`];
        continue;
      }
      transientFailureGroups = 0;
      const unusedCandidates = candidates.map((candidate, index) => ({ candidate, index }));
      const rejected = [];
      for (const scheduledType of scheduledTypes) {
        if (levelDrafts[levelIndex].length >= questionsPerLevel) break;
        const questionIndex = levelDrafts[levelIndex].length;
        const globalIndex = (levelIndex * questionsPerLevel) + questionIndex;
        const expectedType = generatedTypeForScheduledType(scheduledType);
        const poolIndex = unusedCandidates.findIndex(({ candidate }) => candidate?.type === expectedType);
        const sourceCandidate = poolIndex >= 0 ? unusedCandidates.splice(poolIndex, 1)[0].candidate : null;
        const candidate = prepareGeneratedAssessmentCandidate(activity, sourceCandidate, scheduledType, globalIndex);
        const signature = candidate ? generatedAssessmentSignature(candidate) : "";
        const visualCompatible = scheduledType !== "image-multiple" || assessmentCanBecomeVisualQuestion(candidate);
        const completeCandidate = candidate && generatedAssessmentIsComplete(activity, candidate);
        const deferVisualRepair = scheduledType === "image-multiple" && completeCandidate && !visualCompatible;
        if (completeCandidate && (visualCompatible || deferVisualRepair) && signature && !signatures.has(signature)) {
          const finalized = finalizeGeneratedAssessment(activity, candidate, levelIndex, questionIndex, questionsPerLevel);
          finalized.plannedType = scheduledType;
          finalized.generationSource = "gemini";
          levelDrafts[levelIndex].push(finalized);
          signatures.add(signature);
          if (deferVisualRepair) {
            logScienceGenerationStep("Pregunta visual aceptada para adaptación posterior", {
              nivel: levelIndex + 1,
              pregunta: questionIndex + 1,
              tipoOriginal: candidate.type
            }, "warn");
          }
          logScienceGenerationStep("Pregunta aceptada", { nivel: levelIndex + 1, pregunta: questionIndex + 1, totalNivel: questionsPerLevel, tipo: scheduledType, progresoTotal: levelDrafts.flat().length, total: expectedCount });
          continue;
        }
        const reason = !sourceCandidate
          ? `Falta la pregunta ${questionIndex + 1} de tipo ${expectedType}`
          : expectedType === "numeric-answer" && activity.subject === "biology" && !isSimpleBiologyNumericAssessment(activity, sourceCandidate)
            ? `La pregunta ${questionIndex + 1} de tipo numeric-answer debe ser un conteo directo: correctValue entero de 0 a 30, tolerance 0, una sola operación y sin porcentajes, variables ni fórmulas`
          : !candidate || !generatedAssessmentIsComplete(activity, candidate)
            ? `La pregunta ${questionIndex + 1} de tipo ${expectedType} está incompleta o es incompatible con la materia`
            : !visualCompatible
              ? `La pregunta ${questionIndex + 1} debe tener cuatro opciones conceptuales aptas para una imagen`
              : `La pregunta ${questionIndex + 1} repite un enunciado o respuesta ya usados`;
        rejected.push(reason);
        // Conserva el orden exacto del calendario. Las posiciones posteriores se
        // regeneran junto con la primera inválida para que nunca se desplacen.
        break;
      }
      retryFeedback = rejected;
      if (rejected.length) {
        console.warn(`[ScienceActivities] Pregunta rechazada en nivel ${levelIndex + 1}: ${rejected.join(" | ")}`);
        logScienceGenerationStep("Pregunta rechazada por validación", { nivel: levelIndex + 1, pregunta: levelDrafts[levelIndex].length + 1, motivos: rejected }, "warn");
        const slotIndex = (levelIndex * questionsPerLevel) + levelDrafts[levelIndex].length;
        const failedType = typeSchedule[slotIndex];
        const rejectionKey = `${slotIndex}:${failedType}`;
        const rejectionCount = (rejectionCountsBySlot.get(rejectionKey) || 0) + 1;
        rejectionCountsBySlot.set(rejectionKey, rejectionCount);
        if (rejectionCount >= maxRejectedAttemptsPerType) {
          const skippedTypes = skippedTypesBySlot.get(slotIndex) || new Set();
          skippedTypes.add(failedType);
          skippedTypesBySlot.set(slotIndex, skippedTypes);
          const replacementType = nextQuestionTypeAfterRejection(activity, failedType, slotIndex, skippedTypes);
          typeSchedule[slotIndex] = replacementType;
          retryFeedback = [
            `El tipo ${failedType} se omitió después de ${rejectionCount} intentos inválidos.`,
            `Genera ahora una pregunta completa de tipo ${generatedTypeForScheduledType(replacementType)} y continúa con la actividad.`
          ];
          logScienceGenerationStep("Tipo de pregunta omitido tras varios rechazos", {
            nivel: levelIndex + 1,
            pregunta: levelDrafts[levelIndex].length + 1,
            tipoOmitido: failedType,
            tipoSiguiente: replacementType,
            intentos: rejectionCount
          }, "warn");
        }
      }
      await writeGenerationDraft(draftKey, activity, levelDrafts).catch((error) => {
        console.warn("[ScienceActivities] No se pudo guardar el borrador parcial:", error);
      });
      logScienceGenerationStep("Borrador parcial actualizado", { guardadas: levelDrafts.flat().length, total: expectedCount });
    }
    if (levelDrafts[levelIndex].length !== questionsPerLevel) {
      const generatedCount = levelDrafts[levelIndex].filter((assessment) => assessment.generationSource === "gemini").length;
      const lastRejection = retryFeedback.length ? ` Último rechazo: ${retryFeedback.join(" | ")}.` : "";
      if (!generatedCount) {
        throw new Error(`Gemini no generó ninguna pregunta válida para el nivel ${levelIndex + 1}.${lastRejection}`);
      }
      console.warn(`[ScienceActivities] El nivel ${levelIndex + 1} continuará con ${generatedCount} de ${questionsPerLevel} preguntas válidas.`);
      logScienceGenerationStep("Nivel completado omitiendo preguntas inválidas", {
        nivel: levelIndex + 1,
        solicitadas: questionsPerLevel,
        conservadas: generatedCount,
        omitidas: questionsPerLevel - generatedCount
      }, "warn");
    }
  }
  const effectiveQuestionsPerLevel = Math.min(...levelDrafts.map((level) => level.length));
  if (!Number.isFinite(effectiveQuestionsPerLevel) || effectiveQuestionsPerLevel < 1) {
    throw new Error("Gemini no generó suficientes preguntas válidas para construir el videojuego.");
  }
  const adjustedLevelDrafts = levelDrafts.map((level, levelIndex) => level
    .slice(0, effectiveQuestionsPerLevel)
    .map((assessment, questionIndex) => {
      const finalized = finalizeGeneratedAssessment(activity, assessment, levelIndex, questionIndex, effectiveQuestionsPerLevel);
      finalized.plannedType = assessment.plannedType;
      finalized.generationSource = "gemini";
      return finalized;
    }));
  const assessments = shuffleMultipleChoiceOptions(adjustedLevelDrafts.flat());
  const effectiveExpectedCount = levelCount * effectiveQuestionsPerLevel;
  activity.questionsPerLevel = effectiveQuestionsPerLevel;
  if (effectiveExpectedCount < expectedCount) {
    logScienceGenerationStep("Cantidad de preguntas ajustada a las respuestas válidas", {
      solicitadas: expectedCount,
      creadas: effectiveExpectedCount,
      preguntasPorNivel: effectiveQuestionsPerLevel
    }, "warn");
  }
  if (assessments.length !== effectiveExpectedCount) throw new Error("No fue posible organizar las preguntas válidas generadas por Gemini.");
  if (assessments.some((assessment) => assessment.generationSource !== "gemini")) {
    throw new Error("La actividad contiene preguntas que no provienen de Gemini y no puede completarse.");
  }
  logScienceGenerationStep("Preguntas Gemini terminadas", { generadas: assessments.length, solicitadas: expectedCount, total: effectiveExpectedCount });
  return assessments;
}

async function enforceExactlyOneVisualQuestion(activity, assessments = []) {
  const questions = Array.isArray(assessments) ? assessments.map((assessment) => normalizeAssessmentSchema(structuredClone(assessment))) : [];
  if (!questions.length) throw new Error("No hay preguntas disponibles para crear la pregunta visual.");
  let visualIndex = questions.findIndex((assessment) => assessment.type === "image-multiple" && assessmentCanBecomeVisualQuestion(assessment));
  questions.forEach((assessment, index) => {
    if (assessment.type === "image-multiple" && (index !== visualIndex || !assessmentCanBecomeVisualQuestion(assessment))) {
      assessment.type = "multiple";
      delete assessment.visual;
    }
  });
  if (visualIndex < 0) {
    const compatible = questions.map((assessment, index) => ({ assessment, index }))
      .filter(({ assessment }) => assessmentCanBecomeVisualQuestion(assessment));
    const seed = [...String(activity.subject || ""), ...String(activity.topic || "")]
      .reduce((total, character) => total + character.codePointAt(0), questions.length);
    if (!compatible.length) {
      const repairIndex = seed % questions.length;
      const source = questions[repairIndex];
      const repaired = buildConcreteVisualAssessment(activity, source, repairIndex);
      repaired.generationSource = source?.generationSource || "gemini";
      repaired.plannedType = "image-multiple";
      questions[repairIndex] = repaired;
      compatible.push({ assessment: repaired, index: repairIndex });
    }
    visualIndex = compatible[seed % compatible.length].index;
  }
  const visualQuestion = questions[visualIndex];
  visualQuestion.type = "image-multiple";
  const correctIndex = Math.max(0, Math.min(visualQuestion.options.length - 1, Number(visualQuestion.correct) || 0));
  const target = String(visualQuestion.visual?.target || visualQuestion.options[correctIndex] || "").trim();
  const hasImage = () => Boolean(visualQuestion.visual.imageDataUrl || visualQuestion.visual.imageUrl || visualQuestion.visual.imageSrc);
  const hasVerifiedImage = hasImage() && Number(visualQuestion.visual?.analysisVersion || 0) >= 1;
  if (!hasVerifiedImage) {
    const visualContract = buildVisualQuestionContract(activity, visualQuestion, target);
    visualQuestion.prompt = visualContract.prompt;
    visualQuestion.visual = {
      ...(visualQuestion.visual || {}),
      target,
      sourcePrompt: visualContract.sourcePrompt,
      imagePrompt: visualContract.imagePrompt,
      alt: visualContract.alt
    };
  }
  if (!hasImage()) {
    let lastError;
    for (let attempt = 0; attempt < 1 && !hasImage(); attempt += 1) {
      try {
        await regenerateVisualQuestionImage(activity, visualQuestion);
      } catch (error) {
        lastError = error;
      }
    }
    if (!hasImage()) {
      const sourcePrompt = String(visualQuestion.visual?.sourcePrompt || "").trim();
      const dependsOnImage = /imagen|ilustraci[oó]n|flecha|señala|observa/i.test(sourcePrompt);
      visualQuestion.type = "multiple";
      visualQuestion.prompt = sourcePrompt && !dependsOnImage
        ? sourcePrompt
        : `Selecciona la opción correcta para la situación planteada sobre ${activity.topic}.`;
      visualQuestion.answerData = {
        ...(visualQuestion.answerData || {}),
        type: "multiple",
        options: [...visualQuestion.options],
        correct: visualQuestion.correct
      };
      delete visualQuestion.visual;
      console.warn("[ScienceActivities] La mejora visual se omitió; la actividad continuará con una pregunta textual:", lastError);
      logScienceGenerationStep("Pregunta visual omitida sin cancelar el videojuego", {
        pregunta: visualIndex + 1,
        error: String(lastError?.message || "imagen no disponible")
      }, "warn");
      return questions;
    }
  }
  if (questions.filter((assessment) => assessment.type === "image-multiple").length !== 1) {
    throw new Error("No se pudo garantizar exactamente una pregunta visual en la actividad.");
  }
  return questions;
}

async function generateWithGemini(options = {}) {
  if (state.generating) return;
  const initialSetup = options?.initialSetup === true || sessionSetupState.active;
  const previousActivity = state.activity;
  const preserveActiveSessionTitle = !initialSetup && Boolean(state.activeSessionId);
  const preservedSessionTitle = preserveActiveSessionTitle
    ? String($("#activityTitle")?.value || previousActivity?.title || "").trim()
    : "";
  let generationSucceeded = false;
  let completedAssessmentDraftKey = "";
  const selectedMode = $("#gameModeSelect").value;
  const selectedSubject = $("#subjectSelect").value;
  const selectedTopic = getSelectedTopic();
  const requestedLevelCount = positiveInteger($("#gameLevelCount").value, 1);
  const requestedQuestionsPerLevel = configuredQuestionsPerLevel($("#questionsPerLevel").value, 1);
  $("#questionsPerLevel").value = String(requestedQuestionsPerLevel);
  const selectedProfile = curriculumProfileFor(selectedSubject, selectedTopic);
  const requestedExperience = selectedMode === "simulator"
    ? selectedProfile?.simulatorProfile?.focus || ""
    : $("#experiencePrompt").value.trim();
  const requestedExpectedLearnings = selectedMode === "simulator" ? "" : $("#expectedLearnings").value.trim();
  if (selectedMode === "game" && !requestedExperience) {
    showToast("Describe qué deben experimentar los estudiantes.");
    $("#experiencePrompt").focus();
    return;
  }
  beginScienceGenerationTrace({
    modo: selectedMode,
    materia: selectedSubject,
    tema: selectedTopic,
    niveles: requestedLevelCount,
    preguntasPorNivel: requestedQuestionsPerLevel,
    totalPreguntas: requestedLevelCount * requestedQuestionsPerLevel,
    modelo: $("#modelSelect").value,
    cantidadAprendizajes: parseExpectedLearningStatements(requestedExpectedLearnings).length,
    longitudExperiencia: requestedExperience.length
  });
  if (selectedMode === "simulator") {
    if (!selectedProfile) {
      finishScienceGenerationTrace("error", { etapa: "validación", error: `El tema ${selectedTopic} no tiene un simulador científico curado.` });
      showToast(`El tema ${selectedTopic} no tiene un simulador científico curado.`);
      return;
    }
    if (!validateSimulatorCustomVisualChoices()) {
      finishScienceGenerationTrace("error", { etapa: "validación visual", error: "La configuración visual del simulador está incompleta." });
      return;
    }
    state.generating = true;
    if (initialSetup) hideSessionSetupModal();
    await setGenerating(true);
    try {
    logScienceGenerationStep("Preparando configuración del simulador", { tema: selectedTopic });
    const selectedVariableValues = getSelectedSimulatorVariableValues();
    const simulatorActivity = buildTopicActivity(selectedSubject, selectedTopic, getSelectedScenario());
    simulatorActivity.controls.forEach((control) => {
      if (Number.isFinite(selectedVariableValues[control.id])) control.value = Math.max(Math.min(selectedVariableValues[control.id], Math.max(control.min, control.max)), Math.min(control.min, control.max));
    });
    simulatorActivity.simulator = { ...(simulatorActivity.simulator || {}), values: { ...(simulatorActivity.simulator?.values || {}), ...selectedVariableValues } };
    simulatorActivity.gameMode = "simulator";
    simulatorActivity.visualStyle = $("#visualStyleSelect").value;
    simulatorActivity.grade = $("#gradeSelect").value || SUBJECT_DEFAULT_GRADES[selectedSubject];
    simulatorActivity.difficulty = $("#difficultySelect").value;
    simulatorActivity.simulatorVisualSelection = getSelectedSimulatorVisualSelection();
    simulatorActivity.experiencePrompt = "";
    simulatorActivity.expectedLearnings = "";
    simulatorActivity.title = preservedSessionTitle || `${selectedTopic}: simulador interactivo`;
    simulatorActivity.subtitle = SIMULATION_LABELS[selectedProfile.simulatorProfile.modelId] || "Simulador científico";
    simulatorActivity.mission = selectedProfile.simulatorProfile.focus;
    simulatorActivity.scientificPrinciple = selectedProfile.simulatorProfile.formula;
    simulatorActivity.generation = { complete: true, levelCount: 0, questionsPerLevel: 0, totalQuestions: 0, completedAt: Date.now() };
    state.activity = normalizeActivity(simulatorActivity);
    logScienceGenerationStep("Generando escena visual del simulador", { modelo: selectedProfile.simulatorProfile.modelId });
    state.activity.visualScene = await generateSimulatorVisualSceneWithGemini(state.activity, { replan: true });
    state.previewActivity = structuredClone(state.activity);
    state.gameProgress = null;
    syncActivityToEditor();
    await renderGame({ resetProgress: true });
    logScienceGenerationStep("Preview del simulador renderizado", { tema: selectedTopic });
    generationSucceeded = true;
    if (initialSetup) completeInitialSessionSetup();
    const generatedScene = state.activity.visualScene;
    const hasGeneratedBackground = Boolean(generatedScene?.background?.dataUrl || generatedScene?.background?.imageUrl || generatedScene?.background?.imageSrc);
    const hasGeneratedPrimaryLayer = simulatorUsesProgrammaticPrimary(state.activity)
      || Boolean(generatedScene?.layers?.[0]?.dataUrl || generatedScene?.layers?.[0]?.imageUrl || generatedScene?.layers?.[0]?.imageSrc);
    showToast(latestSimulatorQuotaWarning(generatedScene) || (hasGeneratedBackground && hasGeneratedPrimaryLayer
      ? `Simulador visual de ${selectedTopic} preparado.`
      : `Simulador de ${selectedTopic} preparado con escena vectorial de respaldo. Revisa las advertencias visuales en Contenido.`));
    finishScienceGenerationTrace("success", { modo: "simulator", tema: selectedTopic });
    } catch (error) {
      console.error("[ScienceActivities] Simulator generation failed:", error);
      state.activity = previousActivity;
      finishScienceGenerationTrace("error", { etapa: "simulador", error: String(error?.message || "error desconocido") });
      showToast(error?.message || "No fue posible preparar el simulador.");
    } finally {
      state.generating = false;
      await setGenerating(false, { materializePreview: generationSucceeded });
      if (generationSucceeded) void autosaveProject("generation");
      else if (initialSetup) showSessionSetupModal();
    }
    return;
  }
  if (state.activity.subject !== selectedSubject || state.activity.topic !== selectedTopic) {
    state.activity = buildTopicActivity(selectedSubject, selectedTopic, getSelectedScenario());
  }
  state.activity.subject = selectedSubject;
  state.activity.topic = selectedTopic;
  state.activity.experiencePrompt = selectedMode === "simulator" ? "" : requestedExperience;
  state.activity.expectedLearnings = selectedMode === "simulator" ? "" : requestedExpectedLearnings;
  state.activity.scenario = structuredClone(getSelectedScenario());
  if (selectedSubject === "math") {
    const mathTemplate = resolveTopicTemplate("math", selectedTopic);
    state.activity.simulationType = mathTemplate.type;
    state.activity.variant = mathTemplate.variant;
    state.activity.grade = $("#gradeSelect").value || SUBJECT_DEFAULT_GRADES.math;
    state.activity.controls = structuredClone(CONTROL_PRESETS[mathTemplate.type] || CONTROL_PRESETS.math);
    state.activity.simulator = {
      ...(state.activity.simulator || {}),
      modelId: mathTemplate.variant,
      formula: STEM_MODEL_REGISTRY[mathTemplate.variant]?.formula || "Relación matemática",
      values: {}
    };
  }
  state.generating = true;
  if (initialSetup) hideSessionSetupModal();
  await setGenerating(true);
  try {
    logScienceGenerationStep("Solicitando diseño base del videojuego", { materia: selectedSubject, tema: selectedTopic });
    const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
      method: "POST",
      body: {
        model: $("#modelSelect").value,
        payload: {
          systemInstruction: {
            parts: [{
              text: "Eres diseñador senior de simulaciones STEM 2D para secundaria. Devuelve JSON válido y pedagógicamente correcto. No inventes leyes científicas. Diseña experimentos breves, visuales, inclusivos y seguros."
            }]
          },
          contents: [{ role: "user", parts: [{ text: buildPrompt() }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: ACTIVITY_SCHEMA,
            temperature: .74
          }
        }
      }
    });
    const generatedActivity = parseGeneratedJson(extractResponseText(response));
    logScienceGenerationStep("Diseño base recibido y JSON interpretado", { titulo: String(generatedActivity?.title || ""), tema: selectedTopic });
    generatedActivity.subject = selectedSubject;
    generatedActivity.topic = selectedTopic;
    if (preservedSessionTitle) generatedActivity.title = preservedSessionTitle;
    generatedActivity.grade = $("#gradeSelect").value || SUBJECT_DEFAULT_GRADES[selectedSubject];
    generatedActivity.difficulty = $("#difficultySelect").value;
    generatedActivity.gameMode = selectedMode;
    generatedActivity.visualStyle = $("#visualStyleSelect").value;
    generatedActivity.experiencePrompt = selectedMode === "simulator" ? "" : requestedExperience;
    generatedActivity.expectedLearnings = selectedMode === "simulator" ? "" : requestedExpectedLearnings;
    generatedActivity.scenario = structuredClone(getSelectedScenario());
    generatedActivity.generation = {
      ...(generatedActivity.generation || {}),
      curriculumPolicyVersion: CURRICULUM_POLICY_VERSION
    };
    if (selectedSubject === "math") {
      const mathTemplate = resolveTopicTemplate("math", selectedTopic);
      generatedActivity.simulationType = mathTemplate.type;
      generatedActivity.variant = mathTemplate.variant;
    }
    state.activity = normalizeActivity(generatedActivity);
    state.activity.levelCount = requestedLevelCount;
    state.activity.questionsPerLevel = requestedQuestionsPerLevel;
    state.activity.difficulty = $("#difficultySelect").value;
    state.activity.gameMode = $("#gameModeSelect").value;
    state.activity.visualStyle = $("#visualStyleSelect").value;
    const isSimulator = state.activity.gameMode === "simulator";
    logScienceGenerationStep("Generando guía pedagógica y personaje", { niveles: requestedLevelCount, tienePersonaje: Boolean(state.activity.playerCharacter) });
    const [learningGuide, playerSprite] = isSimulator
      ? [null, null]
      : await Promise.all([
        generateLearningGuideWithGemini(state.activity),
        Promise.resolve(state.activity.playerCharacter ? createCharacterSprite(state.activity.playerCharacter) : state.activity.playerSprite)
      ]);
    logScienceGenerationStep("Guía pedagógica y personaje preparados", { nivelesGuia: learningGuide?.levels?.length || 0, personajeGenerado: Boolean(playerSprite) });
    if (isSimulator) {
      state.activity.visualScene = await generateSimulatorVisualSceneWithGemini(state.activity, { replan: true });
    }
    state.activity.learningGuide = isSimulator ? null : normalizeLearningGuideForSubject(state.activity, learningGuide);
    state.activity.playerSprite = playerSprite;
    state.activity.playerCharacter = isSimulator ? null : state.activity.playerCharacter;
    if (isSimulator) {
      state.activity.assessments = [];
    } else {
      logScienceGenerationStep("Iniciando generación de preguntas Gemini", { total: requestedLevelCount * requestedQuestionsPerLevel });
      const activeAssessmentDraftKey = generationDraftKey(state.activity);
      const generatedAssessments = await generateAssessmentsWithGemini(state.activity);
      completedAssessmentDraftKey = activeAssessmentDraftKey;
      logScienceGenerationStep("Preparando pregunta visual obligatoria", { preguntas: generatedAssessments.length });
      const assessmentsWithVisual = await ensureSingleVisualQuestion(state.activity, generatedAssessments);
      state.activity.assessments = await enforceExactlyOneVisualQuestion(state.activity, assessmentsWithVisual);
      logScienceGenerationStep("Conjunto final de preguntas validado", { preguntas: state.activity.assessments.length, preguntasVisuales: state.activity.assessments.filter((assessment) => assessment.type === "image-multiple").length });
    }
    const expectedQuestionCount = isSimulator ? 0 : positiveInteger(state.activity.levelCount, 1)
      * positiveInteger(state.activity.questionsPerLevel, 1);
    if (state.activity.gameMode !== "simulator" && state.activity.assessments.length !== expectedQuestionCount) {
      throw new Error(`No se completaron las ${expectedQuestionCount} preguntas solicitadas.`);
    }
    state.activity.generation = {
      complete: true,
      curriculumPolicyVersion: CURRICULUM_POLICY_VERSION,
      questionSourcePolicy: isSimulator ? "simulator" : "gemini-only-v1",
      levelCount: isSimulator ? 0 : positiveInteger(state.activity.levelCount, 1),
      questionsPerLevel: isSimulator ? 0 : positiveInteger(state.activity.questionsPerLevel, 1),
      totalQuestions: expectedQuestionCount,
      completedAt: Date.now()
    };
    if (!isSimulator) ensureActivityAssessments(state.activity);
    sanitizeVisibleActivityCopy(state.activity);
    if (preservedSessionTitle) state.activity.title = preservedSessionTitle;
    logScienceGenerationStep("Título de sesión protegido", {
      conservado: Boolean(preservedSessionTitle),
      titulo: state.activity.title
    });
    logScienceGenerationStep("Sincronizando actividad con el editor", { totalPreguntas: expectedQuestionCount });
    syncActivityToEditor();
    state.previewActivity = structuredClone(state.activity);
    await renderGame();
    logScienceGenerationStep("Preview interactivo renderizado", { totalPreguntas: expectedQuestionCount });
    if (completedAssessmentDraftKey) {
      await deleteGenerationDraft(completedAssessmentDraftKey).catch((error) => {
        console.warn("[ScienceActivities] No se pudo limpiar el borrador ya completado:", error);
      });
    }
    generationSucceeded = true;
    if (initialSetup) completeInitialSessionSetup();
    showToast(isSimulator ? "La IA creó un simulador científico interactivo." : "La IA creó una nueva actividad interactiva.");
    finishScienceGenerationTrace("success", { modo: state.activity.gameMode, preguntas: expectedQuestionCount, titulo: state.activity.title });
  } catch (error) {
    console.error("[ScienceActivities] AI generation failed:", error);
    state.activity = previousActivity;
    finishScienceGenerationTrace("error", { etapa: "videojuego", error: String(error?.message || "error desconocido"), status: Number(error?.status || 0) });
    showToast(error?.message || "No fue posible completar la actividad. Puedes reanudar la generación.");
  } finally {
    state.generating = false;
    await setGenerating(false, { materializePreview: generationSucceeded });
    if (generationSucceeded) void autosaveProject("generation");
    else if (initialSetup) showSessionSetupModal();
  }
}

async function setGenerating(active, options = {}) {
  const overlay = $("#generationOverlay");
  const preview = $(".sa-stage");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (active) {
    overlay.classList.remove("is-completing", "is-revealing");
    preview?.classList.remove("sa-preview-materialize");
    overlay.style.removeProperty("--sa-spark-x");
    overlay.style.removeProperty("--sa-spark-y");
    overlay.classList.add("show");
  } else if (options.materializePreview) {
    const target = $(".sa-game-frame") || preview;
    const targetRect = target?.getBoundingClientRect();
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * .42;
    const targetX = targetRect
      ? Math.min(window.innerWidth - 24, Math.max(24, targetRect.left + (targetRect.width / 2)))
      : originX;
    const targetY = targetRect
      ? Math.min(window.innerHeight - 24, Math.max(24, targetRect.top + (targetRect.height / 2)))
      : originY;
    overlay.style.setProperty("--sa-spark-x", `${Math.round(targetX - originX)}px`);
    overlay.style.setProperty("--sa-spark-y", `${Math.round(targetY - originY)}px`);
    overlay.classList.add("is-completing");
    await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 40 : 1400));
    preview?.classList.remove("sa-preview-materialize");
    if (preview) void preview.offsetWidth;
    preview?.classList.add("sa-preview-materialize");
    overlay.classList.add("is-revealing");
    await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 20 : 240));
    overlay.classList.remove("show");
  } else {
    overlay.classList.remove("show");
  }
  document.body.classList.toggle("sa-is-generating", active);
  overlay.setAttribute("aria-hidden", String(!active));
  $("#formGenerateBtn").disabled = active;
  $("#generateBtn").disabled = active;
  $("#generateExperienceBtn").disabled = active;
  const generationStatus = $("#generationStatus");
  if (generationStatus) {
    generationStatus.classList.toggle("generating", active);
    generationStatus.innerHTML = active ? "<i></i> La IA está diseñando…" : "<i></i> Listo para experimentar";
  }
  if (!active) {
    window.setTimeout(() => {
      overlay.classList.remove("is-completing", "is-revealing");
    }, reducedMotion ? 30 : 260);
  }
}

async function renderGame(options = {}) {
  const renderRevision = Number(state.gameRenderRevision || 0) + 1;
  state.gameRenderRevision = renderRevision;
  installScienceActivitiesMotion($(".sa-game-frame"));
  const resetProgress = options?.resetProgress === true
    || options?.currentTarget?.id === "restartPreviewBtn";
  const previewActivity = state.previewActivity || structuredClone(state.activity);
  if (!state.previewActivity) state.previewActivity = structuredClone(previewActivity);
  state.assessmentController?.dispose?.();
  const previousInstance = state.gameInstance;
  state.gameInstance = null;
  previousInstance?.destroy?.();
  const activityChanged = state.editorReviewActivityRef !== previewActivity;
  if (resetProgress || activityChanged || !state.editorReviewProgress) {
    state.editorReviewProgress = createReviewProgressState();
  }
  state.editorReviewActivityRef = previewActivity;
  $(".sa-game-frame").dataset.visualStyle = previewActivity.visualStyle || "kawaii-lab";
  const runtimeActivity = structuredClone(previewActivity);
  runtimeActivity.scenario = { ...(runtimeActivity.scenario || {}), label: "" };
  try {
    if (runtimeActivity.gameMode === "simulator") {
      const repairedVisualScene = await repairStoredSimulatorLayerCutouts(runtimeActivity, runtimeActivity.visualScene);
      // La normalización también puede materializar los recursos locales por defecto
      // aunque no haya un recorte antiguo que reparar. El runtime siempre debe usarla.
      runtimeActivity.visualScene = repairedVisualScene.scene;
      if (repairedVisualScene.changed) {
        previewActivity.visualScene = structuredClone(repairedVisualScene.scene);
        if (state.activity?.gameMode === "simulator") state.activity.visualScene = structuredClone(repairedVisualScene.scene);
      }
      const simulatorInstance = await mountSimulatorFlow(runtimeActivity, renderRevision);
      if (state.gameRenderRevision !== renderRevision) {
        simulatorInstance?.destroy?.();
        return;
      }
      state.gameInstance = simulatorInstance;
      mountEditorQuestionReviewButton();
      if (state.contentSelection === "start") renderPreviewStartScreen(previewActivity);
      return;
    }
    const { createScienceGame, installAccessibleGameState } = await loadGameRuntime();
    if (state.gameRenderRevision !== renderRevision) return;
    const gameInstance = await createScienceGame("#scienceGameMount", "#scienceGameControls", runtimeActivity, {
      onSuccess: () => {}
    });
    if (state.gameRenderRevision !== renderRevision) {
      gameInstance?.destroy?.();
      return;
    }
    state.gameInstance = gameInstance;
    installAccessibleGameState(state.gameInstance);
    mountAssessmentFlow(previewActivity);
    mountEditorQuestionReviewButton();
    if (state.contentSelection === "start") renderPreviewStartScreen(previewActivity);
  } catch (error) {
    if (state.gameRenderRevision === renderRevision) {
      const mount = document.getElementById("scienceGameMount");
      if (mount) mount.innerHTML = `<div class="sa-empty-state"><strong>No fue posible restaurar esta sesión.</strong><span>${escapeHtml(error?.message || "El simulador no pudo inicializarse.")}</span></div>`;
    }
    throw error;
  }
}

function showPreviewPreparing() {
  const mount = document.getElementById("scienceGameMount");
  if (!mount) return;
  mount.innerHTML = '<div class="sa-empty-state sa-preview-preparing" role="status"><strong>Preparando preview…</strong><span>La sesión ya está lista para editarse.</span></div>';
}

async function mountPreviewProgressively() {
  const revision = Number(state.previewMountRevision || 0) + 1;
  state.previewMountRevision = revision;
  showPreviewPreparing();
  await afterBrowserPaint();
  if (revision !== state.previewMountRevision || !isGeneratedScienceActivity(state.previewActivity || state.activity)) return false;
  await renderGame();
  if (revision !== state.previewMountRevision) return false;
  markStartup("preview-interactive");
  return true;
}

async function restartPreviewFromBeginning() {
  const button = $("#restartPreviewBtn");
  if (button?.dataset.restarting === "true") return;
  if (button) {
    button.dataset.restarting = "true";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    state.editorReviewProgress = createReviewProgressState();
    state.gameProgress = null;
    await renderGame({ resetProgress: true });
    showToast("Juego reiniciado desde el primer nivel.");
  } catch (error) {
    console.error("[ScienceActivities] No fue posible reiniciar el juego:", error);
    showToast("No fue posible reiniciar el juego.");
  } finally {
    if (button) {
      button.dataset.restarting = "false";
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}

function applyInspectorTab(tabName) {
  const inspector = $(".sa-inspector");
  if (!inspector) return;
  const activeTab = ["general", "start", "objectives", "questions", "help"].includes(tabName) ? tabName : "general";
  state.inspectorTab = activeTab;
  inspector.dataset.activeTab = activeTab;
  inspector.querySelectorAll("[data-inspector-tab]").forEach((button) => {
    const selected = button.dataset.inspectorTab === activeTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  inspector.querySelectorAll("[data-inspector-group]").forEach((element) => {
    const group = element.dataset.inspectorGroup;
    element.hidden = group === "editor"
      ? !["start", "objectives", "questions"].includes(activeTab)
      : group !== activeTab;
  });
  inspector.querySelectorAll("[data-editor-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.editorPane !== activeTab;
  });
}

function initializeInspectorTabs() {
  const inspector = $(".sa-inspector");
  if (!inspector) return;
  const title = inspector.querySelector(".sa-panel-title");
  let tabs = inspector.querySelector(".sa-inspector-tabs");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.className = "sa-inspector-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.innerHTML = `
      <button type="button" role="tab" data-inspector-tab="general"><i class="fas fa-pen-to-square"></i><span>General</span></button>
      <button type="button" role="tab" data-inspector-tab="start"><i class="fas fa-door-open"></i><span>Inicio</span></button>
      <button type="button" role="tab" data-inspector-tab="objectives"><i class="fas fa-bullseye"></i><span>Objetivos</span></button>
      <button type="button" role="tab" data-inspector-tab="questions"><i class="fas fa-list-check"></i><span>Preguntas</span></button>
      <button type="button" role="tab" data-inspector-tab="help"><i class="fas fa-lightbulb"></i><span>Ayuda</span></button>`;
    title?.insertAdjacentElement("afterend", tabs);
    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-inspector-tab]");
      if (button) applyInspectorTab(button.dataset.inspectorTab);
    });
  }

  ["activityTitle", "missionInput", "principleInput"].forEach((id) => {
    document.getElementById(id)?.closest(".sa-field")?.setAttribute("data-inspector-group", "general");
  });
  const contentScroll = inspector.querySelector(".sa-content-scroll") || inspector;
  contentScroll.querySelectorAll(":scope > .sa-inspector-section:not(#scienceContentEditor)").forEach((section) => {
    section.dataset.inspectorGroup = "help";
  });
  const contentEditor = $("#scienceContentEditor");
  if (contentEditor) contentEditor.dataset.inspectorGroup = "editor";
  const applyButton = $("#applyContentChanges");
  if (applyButton) {
    const destination = state.activity.gameMode === "simulator" ? "simulador" : "preview";
    applyButton.innerHTML = `
      <span class="sa-action-sheen" aria-hidden="true"></span>
      <i class="fas fa-play" aria-hidden="true"></i>
      <span>Aplicar cambios al ${destination}</span>`;
    if (!applyButton.dataset.bound) {
      applyButton.dataset.bound = "true";
      applyButton.addEventListener("click", async () => {
        syncEditorToActivity();
        if (state.activity.gameMode === "simulator") {
          if (!validateSimulatorCustomVisualChoices()) return;
          const requestedSelectionKey = simulatorVisualSelectionKey(state.activity);
          const sceneSelectionChanged = state.activity.visualScene?.selectionKey !== requestedSelectionKey;
          if (sceneSelectionChanged) {
            state.generating = true;
            await setGenerating(true);
            try {
              state.activity.visualScene = await generateSimulatorVisualSceneWithGemini(state.activity, { replan: true });
              state.previewActivity = structuredClone(state.activity);
              renderSimulatorContentEditor($("#scienceContentEditor"));
              await renderGame();
              showToast(latestSimulatorQuotaWarning(state.activity.visualScene) || "Nuevo escenario y objeto aplicados al simulador.");
              void autosaveProject("simulator-visual-selection-apply");
            } catch (error) {
              showToast(error?.message || "No fue posible generar la nueva escena del simulador.");
            } finally {
              state.generating = false;
              await setGenerating(false, { materializePreview: true });
            }
            return;
          }
        }
        state.previewActivity = structuredClone(state.activity);
        await renderGame();
        showToast("Cambios aplicados al preview.");
        void autosaveProject("preview-apply");
      });
    }
  }
  applyInspectorTab(state.inspectorTab || "general");
}

function initializeRightPanelResize() {
  const page = $(".sa-page");
  const workspace = $(".sa-workspace");
  if (!page || !workspace) return;

  const panelCollapsedKeys = ["scienceActivities.inspectorCollapsed", "scienceActivities.briefCollapsed"];
  const PREVIEW_MIN_WIDTH = 280;
  const COLLAPSED_PANEL_WIDTH = 0;
  panelCollapsedKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  });

  const panelConfigs = [
    {
      selector: ".sa-inspector",
      variable: "--sa-inspector-width",
      widthKey: "scienceActivities.inspectorWidth",
      collapsedKey: "scienceActivities.inspectorCollapsed",
      workspaceClass: "sa-inspector-collapsed",
      defaultWidth: 350,
      minWidth: 280,
      maxWidth: 620,
      headerContainer: "#sa-panelHeaderControls",
      label: "Contenido",
      collapsible: true
    },
    {
      selector: ".sa-brief",
      variable: "--sa-brief-width",
      widthKey: "scienceActivities.briefWidth",
      collapsedKey: "scienceActivities.briefCollapsed",
      workspaceClass: "sa-brief-collapsed",
      defaultWidth: 320,
      minWidth: 280,
      maxWidth: 560,
      headerContainer: "#sa-panelHeaderControls",
      label: "Objetivos",
      collapsible: true
    },
    {
      selector: ".sa-sessions",
      variable: "--sa-sessions-width",
      widthKey: "scienceActivities.sessionsWidth",
      defaultWidth: 185,
      minWidth: 150,
      maxWidth: 460,
      resizerSide: "right",
      label: "Sesiones",
      collapsible: false
    }
  ];

  const toNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const panelStates = new Map();

  const currentWorkspaceWidth = () => {
    const width = toNumber(workspace.clientWidth, 0);
    if (width > 0) return width;
    return toNumber(toNumber(getComputedStyle(workspace).width, "0"), 0);
  };

  const currentPanelWidth = (state, fallback) => {
    if (!state) return fallback;
    const fromCss = toNumber(getComputedStyle(page).getPropertyValue(state.config.variable), toNumber(fallback, 0));
    if (state.collapsed) return COLLAPSED_PANEL_WIDTH;
    return fromCss;
  };

  const enforceRightPanelBudget = (sourceSelector) => {
    const inspectorState = panelStates.get(".sa-inspector");
    const briefState = panelStates.get(".sa-brief");
    if (!inspectorState || !briefState) return;

    const workspaceWidth = currentWorkspaceWidth();
    const maxRightColumns = Math.max(0, workspaceWidth - PREVIEW_MIN_WIDTH);
    if (maxRightColumns <= 0) return;

    let inspectorWidth = currentPanelWidth(inspectorState, stateFromKey(".sa-inspector"));
    let briefWidth = currentPanelWidth(briefState, stateFromKey(".sa-brief"));
    let overflow = inspectorWidth + briefWidth - maxRightColumns;
    if (overflow <= 0) return;

    const sourceState = panelStates.get(sourceSelector) || {};
    const firstSelector = sourceState.config?.selector === ".sa-inspector" ? ".sa-brief" : ".sa-inspector";
    const secondSelector = sourceState.config?.selector === ".sa-inspector" ? ".sa-inspector" : ".sa-brief";
    const first = panelStates.get(firstSelector);
    const second = panelStates.get(secondSelector);

    const shrink = (state, amount) => {
      if (!state || state.collapsed || amount <= 0) return amount;
      const stateMin = state.config.minWidth;
      const current = state.collapsed ? COLLAPSED_PANEL_WIDTH : currentPanelWidth(state, state.config.defaultWidth);
      const keep = Math.max(stateMin, current - amount);
      const reduced = current - keep;
      if (reduced <= 0) return amount;
      setPanelWidth(state, keep, false);
      return amount - reduced;
    };

    overflow = shrink(first, overflow);
    overflow = shrink(second, overflow);

    if (overflow > 0) {
      const fallbackState = first?.collapsed ? null : first;
      if (fallbackState) {
        applyCollapsedState(fallbackState, true, false);
      }
      inspectorWidth = currentPanelWidth(inspectorState, stateFromKey(".sa-inspector"));
      briefWidth = currentPanelWidth(briefState, stateFromKey(".sa-brief"));
      overflow = inspectorWidth + briefWidth - maxRightColumns;
      if (overflow > 0 && second && !second.collapsed) applyCollapsedState(second, true, false);
    }

    enforceSessionsWidth();
  };

  const enforceSessionsWidth = () => {
    const sessionState = panelStates.get(".sa-sessions");
    const inspectorState = panelStates.get(".sa-inspector");
    const briefState = panelStates.get(".sa-brief");
    if (!sessionState || !inspectorState || !briefState) return;

    const pageWidth = toNumber(page.clientWidth, toNumber(getComputedStyle(page).width, 0));
    if (!pageWidth) return;

    const rightOpenWidth = currentPanelWidth(inspectorState, toNumber(inspectorState.config.defaultWidth, 0))
      + currentPanelWidth(briefState, toNumber(briefState.config.defaultWidth, 0));
    const maxSessions = Math.max(sessionState.config.minWidth, pageWidth - (PREVIEW_MIN_WIDTH + rightOpenWidth));
    if (sessionState.expandedWidth > maxSessions) {
      setPanelWidth(sessionState, maxSessions, false);
    }
  };

  const stateFromKey = (selector) => {
    const state = panelStates.get(selector);
    return state ? state.expandedWidth : 0;
  };

  const setPanelWidth = (state, width, persist = true) => {
    const safe = Math.max(state.config.minWidth, Math.min(state.config.maxWidth, Math.round(width)));
    state.expandedWidth = safe;
    if (!state.collapsed) {
      workspace.style.setProperty(state.config.variable, `${safe}px`);
      page.style.setProperty(state.config.variable, `${safe}px`);
      if (state.handle) state.handle.setAttribute("aria-valuenow", String(safe));
      if (persist && state.config.widthKey) {
        localStorage.setItem(state.config.widthKey, String(safe));
      }
    }
  };

  const applyCollapsedState = (state, nextCollapsed, persist = true) => {
    if (!state.config.collapsible) return;

    state.collapsed = nextCollapsed;
    state.panel.classList.toggle("is-collapsed", state.collapsed);
    if (state.config.workspaceClass) {
      workspace.classList.toggle(state.config.workspaceClass, state.collapsed);
    }

    if (state.collapsed) {
      workspace.style.setProperty(state.config.variable, `${COLLAPSED_PANEL_WIDTH}px`);
      page.style.setProperty(state.config.variable, `${COLLAPSED_PANEL_WIDTH}px`);
    } else {
      const storedWidth = state.expandedWidth;
      workspace.style.setProperty(state.config.variable, `${storedWidth}px`);
      page.style.setProperty(state.config.variable, `${storedWidth}px`);
    }

    if (state.collapseButton) {
      const label = `${state.collapsed ? "Expandir" : "Contraer"} panel ${state.config.label}`;
      state.collapseButton.setAttribute("aria-expanded", String(!state.collapsed));
      state.collapseButton.setAttribute("aria-label", label);
      state.collapseButton.title = label;
      state.collapseButton.setAttribute("data-tooltip", label);
      state.collapseButton.classList.toggle("is-collapsed", state.collapsed);
    }

    if (state.handle) {
      state.handle.setAttribute("aria-valuenow", state.collapsed ? String(COLLAPSED_PANEL_WIDTH) : String(state.expandedWidth));
    }
    if (persist && state.config.collapsedKey) {
      localStorage.setItem(state.config.collapsedKey, String(state.collapsed));
    }

    enforceRightPanelBudget(state.config.selector);
    enforceSessionsWidth();
  };

  panelConfigs.forEach((config) => {
    const panel = $(config.selector);
    if (!panel || panel.dataset.resizableReady) return;
    panel.dataset.resizableReady = "true";
    panel.classList.add("sa-dock-panel");
    panel.querySelectorAll(".sa-panel-title .sa-panel-collapse").forEach((button) => button.remove());

    const rawCssWidth = getComputedStyle(workspace).getPropertyValue(config.variable).trim();
    const cssDefaultWidth = Number.parseFloat(rawCssWidth.replace("px", ""));
    const startWidthDefault = Number.isFinite(cssDefaultWidth) ? cssDefaultWidth : config.defaultWidth;
    const storedWidth = Number.parseFloat(localStorage.getItem(config.widthKey) || "");
    const initialWidth = Number.isFinite(storedWidth) ? storedWidth : startWidthDefault;
    let expandedWidth = Math.max(config.minWidth, Math.min(config.maxWidth, Math.round(initialWidth)));
    const state = { config, panel, handle: null, collapseButton: null, expandedWidth, collapsed: false };
    panelStates.set(config.selector, state);

    const handle = document.createElement("div");
    handle.className = `sa-dock-resizer ${config.selector === ".sa-brief" ? "sa-brief-resizer" : config.selector === ".sa-sessions" ? "sa-sessions-resizer" : "sa-inspector-resizer"}${config.resizerSide === "right" ? " sa-dock-resizer-right" : " sa-dock-resizer-left"}`;
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(config.minWidth));
    handle.setAttribute("aria-valuemax", String(config.maxWidth));
    handle.setAttribute("aria-label", `Cambiar ancho del panel ${config.label}`);
    if (config.resizerSide === "right") {
      panel.append(handle);
    } else {
      panel.prepend(handle);
    }
    state.handle = handle;
    handle.setAttribute("aria-valuemin", String(config.minWidth));
    handle.setAttribute("aria-valuemax", String(config.maxWidth));

    const makeCollapsible = config.collapsible !== false;
    const collapseButton = makeCollapsible ? document.createElement("button") : null;
    if (collapseButton) {
      collapseButton.className = "sa-panel-collapse sa-icon-button";
      collapseButton.type = "button";
      collapseButton.innerHTML = '<i class="fas fa-chevron-right" aria-hidden="true"></i>';
      const headerControlHost = document.querySelector(config.headerContainer || ".sa-summary");
      if (headerControlHost) headerControlHost.appendChild(collapseButton);
    }
    state.collapseButton = collapseButton;

    const setWidth = (width, persist = true) => {
      if (state.collapsed) return;
      setPanelWidth(state, width, persist);
      enforceRightPanelBudget(config.selector);
      enforceSessionsWidth();
    };

    const toggleCollapse = () => applyCollapsedState(state, !state.collapsed, true);

    setPanelWidth(state, expandedWidth, false);
    const normalized = currentPanelWidth(state, state.config.defaultWidth);
    if (normalized !== expandedWidth) setPanelWidth(state, normalized, false);
    if (makeCollapsible) {
      applyCollapsedState(state, state.collapsed, false);
      collapseButton.addEventListener("click", toggleCollapse);
    } else {
      state.collapsed = false;
      workspace.style.setProperty(config.variable, `${expandedWidth}px`);
    }

    const moveStep = (direction) => {
      if (config.resizerSide === "right") {
        return direction === "left" ? -16 : 16;
      }
      return direction === "left" ? 16 : -16;
    };

    handle.addEventListener("pointerdown", (event) => {
      if (state.collapsed) return;
      const startX = event.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("sa-resizing-panel");
      const move = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (config.resizerSide === "right") {
          setWidth(startWidth + delta);
        } else {
          setWidth(startWidth - delta);
        }
      };
      const stop = () => {
        handle.removeEventListener("pointermove", move);
        document.body.classList.remove("sa-resizing-panel");
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop, { once: true });
      handle.addEventListener("pointercancel", stop, { once: true });
    });
    handle.addEventListener("keydown", (event) => {
      if (state.collapsed || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const delta = moveStep(event.key === "ArrowLeft" ? "left" : "right");
      setWidth(state.expandedWidth + delta);
    });
  });

  enforceRightPanelBudget(".sa-inspector");
  enforceSessionsWidth();
}

function updateGameModeUI() {
  const isSimulator = $("#gameModeSelect")?.value === "simulator";
  const modeCopy = isSimulator
    ? {
        mode: "simulator",
        kicker: "Nueva sesión · Simulador científico",
        title: "Diseña tu simulador científico",
        description: "Define el fenómeno, las variables y el estilo visual. El estudio se abrirá cuando el simulador esté listo.",
        action: "Crear simulador",
        actionLabel: "Crear simulador científico"
      }
    : {
        mode: "game",
        kicker: "Nueva sesión · Videojuego educativo",
        title: "Diseña tu videojuego educativo",
        description: "Define la misión, los niveles y las preguntas. El estudio se abrirá cuando el videojuego esté listo.",
        action: "Crear videojuego",
        actionLabel: "Crear videojuego educativo"
      };
  const setupModal = $("#newSessionModal");
  if (setupModal) setupModal.dataset.experienceMode = modeCopy.mode;
  const form = $("#activityForm");
  if (form) form.dataset.experienceMode = modeCopy.mode;
  setOptionalText("#newSessionModalKicker", modeCopy.kicker);
  setOptionalText("#newSessionModalTitle", modeCopy.title);
  setOptionalText("#newSessionModalDescription", modeCopy.description);
  const generateLabel = $("#formGenerateBtn span:last-child");
  if (generateLabel) generateLabel.textContent = modeCopy.action;
  $("#formGenerateBtn")?.setAttribute("aria-label", modeCopy.actionLabel);
  form?.querySelectorAll("[data-experience-scope]").forEach((section) => {
    const visible = section.dataset.experienceScope === modeCopy.mode;
    section.hidden = !visible;
    section.setAttribute("aria-hidden", String(!visible));
    section.querySelectorAll("input, select, textarea, button").forEach((control) => {
      if (!visible) {
        if (!control.dataset.modeDisabled) control.dataset.modeDisabled = control.disabled ? "preserved" : "temporary";
        control.disabled = true;
      } else if (control.dataset.modeDisabled === "temporary") {
        control.disabled = false;
        delete control.dataset.modeDisabled;
      } else if (control.dataset.modeDisabled === "preserved") {
        delete control.dataset.modeDisabled;
      }
    });
  });
  if (isSimulator) fillSimulatorVisualChoiceOptions(state.activity?.simulatorVisualSelection);
  const questionsTab = document.querySelector('[data-inspector-tab="questions"]');
  const objectivesTab = document.querySelector('[data-inspector-tab="objectives"]');
  if (questionsTab) {
    questionsTab.hidden = false;
    const label = questionsTab.querySelector("span");
    if (label) label.textContent = isSimulator ? "Variables" : "Preguntas";
  }
  if (objectivesTab) {
    const label = objectivesTab.querySelector("span");
    if (label) label.textContent = isSimulator ? "Modelo" : "Objetivos";
  }
  const note = document.querySelector(".sa-form-note");
  if (note) {
    note.textContent = isSimulator
      ? "El simulador permite modificar variables, ejecutar el modelo, pausar y restablecer sus valores."
      : "El tema es una referencia. El sistema diseña la misión, las preguntas, las mecánicas y el desafío experimental.";
  }
  const titleField = $("#activityTitle")?.closest("label");
  if (titleField?.querySelector("span")) titleField.querySelector("span").textContent = isSimulator ? "Título del simulador" : "Título del juego";
  const experience = $("#experiencePrompt");
  const simulatorDescription = $("#simulatorProfileDescription");
  if (experience) {
    experience.placeholder = "Describe la misión, las decisiones del jugador y la evidencia necesaria para superar el reto…";
  }
  if (simulatorDescription && isSimulator) {
    const profile = curriculumProfileFor($("#subjectSelect").value, getSelectedTopic());
    simulatorDescription.textContent = profile
      ? `${profile.simulatorProfile.focus} Relación principal: ${profile.simulatorProfile.formula}.`
      : "Este tema no dispone de un simulador científico curado.";
  }
}

function syncActivityToEditor() {
  const activity = applyScienceActivityContext(state.activity);
  $("#subjectSelect").value = activity.subject;
  fillTopicSuggestions();
  const isCatalogTopic = (TOPICS[activity.subject] || []).includes(activity.topic);
  $("#topicInput").value = isCatalogTopic ? activity.topic : CUSTOM_TOPIC_VALUE;
  $("#customTopicInput").value = isCatalogTopic ? "" : activity.topic;
  toggleCustomTopicField();
  fillScenarioOptions(activity.scenario?.id);
  fillSimulatorVisualChoiceOptions(activity.simulatorVisualSelection, activity.controls);
  $("#visualStyleSelect").value = activity.visualStyle || "kawaii-lab";
  if (activity.playerSprite?.dataUrl && !activity.playerCharacter) {
    activity.playerCharacter = {
      id: `existing-${activity.subject || "science"}-${activity.visualStyle || "kawaii-lab"}`,
      name: "Personaje personalizado",
      role: "Personaje existente",
      subject: activity.subject || "physics",
      visualStyle: activity.visualStyle || "kawaii-lab",
      palette: ["#50d6b4", "#ff6f91", "#183b4e", "#ffd166"],
      custom: true,
    };
    activity.playerSprite.characterId = activity.playerCharacter.id;
  }
  const characters = fillCharacterOptions(activity.playerCharacter?.id, activity.playerCharacter);
  const selectedCharacter = characters.find((item) => item.id === $("#characterSelect")?.value) || characters[0];
  if (selectedCharacter && !activity.playerSprite?.dataUrl) {
    activity.playerCharacter = structuredClone(selectedCharacter);
    activity.playerSprite = createCharacterSprite(selectedCharacter);
  }
  renderCharacterPreview();
  $("#gameModeSelect").value = activity.gameMode || "game";
  $("#difficultySelect").value = activity.difficulty || $("#difficultySelect").value || "balanced";
  $("#gradeSelect").value = activity.grade || SUBJECT_DEFAULT_GRADES[activity.subject] || "2º secundaria";
  $("#gameLevelCount").value = String(activity.levelCount || 3);
  $("#questionsPerLevel").value = String(configuredQuestionsPerLevel(activity.questionsPerLevel, 3));
  $("#expectedLearnings").value = meaningfulActivityText(activity.expectedLearnings);
  $("#experiencePrompt").value = meaningfulActivityText(activity.experiencePrompt);
  $("#activityTitle").value = meaningfulActivityText(activity.title) || "Science Activity";
  $("#missionInput").value = activity.mission;
  $("#principleInput").value = activity.scientificPrinciple;
  $("#previewTitle").textContent = activity.title;
  setOptionalText("#summarySubject", SUBJECT_LABELS[activity.subject]);
  setOptionalText("#summarySimulation", SIMULATION_LABELS[activity.simulationType]);
  renderTips();
  renderContentEditor();
  initializeInspectorTabs();
  updateGameModeUI();
  initializeRightPanelResize();
}

function syncEditorToActivity() {
  state.activity.expectedLearnings = $("#gameModeSelect").value === "simulator" ? "" : $("#expectedLearnings").value.trim();
  state.activity.experiencePrompt = $("#gameModeSelect").value === "simulator" ? "" : $("#experiencePrompt").value.trim();
  state.activity.title = $("#activityTitle").value.trim() || "Science Activity";
  state.activity.mission = $("#missionInput").value.trim();
  state.activity.scientificPrinciple = $("#principleInput").value.trim();
  state.activity.subject = $("#subjectSelect").value;
  state.activity.grade = $("#gradeSelect").value;
  state.activity.gameMode = $("#gameModeSelect").value;
  state.activity.topic = getSelectedTopic();
  state.activity.levelCount = Number($("#gameLevelCount").value);
    state.activity.questionsPerLevel = configuredQuestionsPerLevel($("#questionsPerLevel").value, 3);
    $("#questionsPerLevel").value = String(state.activity.questionsPerLevel);
    state.activity.difficulty = $("#difficultySelect").value;
    state.activity.gameMode = $("#gameModeSelect").value;
  state.activity.visualStyle = $("#visualStyleSelect").value;
  state.activity.scenario = structuredClone(getSelectedScenario());
  state.activity.simulatorVisualSelection = getSelectedSimulatorVisualSelection();
  applyScienceActivityContext(state.activity);
  if (state.activity.gameMode === "game" && state.activity.learningGuide) {
    state.activity.learningGuide.introduction = buildScienceExperienceIntroduction(state.activity);
  }
  sanitizeVisibleActivityCopy(state.activity);
  $("#previewTitle").textContent = state.activity.title;
  setOptionalText("#summarySubject", SUBJECT_LABELS[state.activity.subject]);
}

function fillTopicSuggestions() {
  const topics = TOPICS[$("#subjectSelect").value] || [];
  const currentTopic = $("#topicInput").value;
  $("#topicInput").innerHTML = `${topics.map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`).join("")}
    <option value="${CUSTOM_TOPIC_VALUE}">Otro tema…</option>`;
  $("#topicInput").value = topics.includes(currentTopic) || currentTopic === CUSTOM_TOPIC_VALUE ? currentTopic : (topics[0] || CUSTOM_TOPIC_VALUE);
}

function getSelectedTopic() {
  return $("#topicInput").value === CUSTOM_TOPIC_VALUE
    ? $("#customTopicInput").value.trim()
    : $("#topicInput").value.trim();
}

function toggleCustomTopicField() {
  const isCustom = $("#topicInput").value === CUSTOM_TOPIC_VALUE;
  $("#customTopicField").hidden = !isCustom;
  $("#customTopicInput").required = isCustom;
  if (isCustom) window.requestAnimationFrame(() => $("#customTopicInput").focus());
}

function fillScenarioOptions(selectedId = "") {
  const subject = $("#subjectSelect").value;
  const scenarios = SCENARIOS[subject]?.length
    ? SCENARIOS[subject]
    : buildScenarioCatalog(subject);
  $("#scenarioSelect").innerHTML = scenarios.map((scenario) => `<option value="${scenario.id}">${escapeHtml(scenario.label)}</option>`).join("");
  const topicMatch = scenarios.find((scenario) => scenario.topic.toLowerCase() === getSelectedTopic().toLowerCase());
  $("#scenarioSelect").value = scenarios.some((scenario) => scenario.id === selectedId) ? selectedId : (topicMatch?.id || scenarios[0]?.id || "");
  $("#scenarioSelect").disabled = scenarios.length === 0;
}

function simulatorVariablesFor(subject, topic) {
  const profile = curriculumProfileFor(subject, topic);
  if (Array.isArray(profile?.simulatorProfile?.controls) && profile.simulatorProfile.controls.length) {
    return structuredClone(profile.simulatorProfile.controls);
  }
  const template = resolveTopicTemplate(subject, topic);
  return structuredClone(template.variant === "hydraulic" ? HYDRAULIC_CONTROL_PRESET : CONTROL_PRESETS[template.type] || []);
}

function toggleSimulatorCustomVisualFields({ focus = false } = {}) {
  const pairs = [
    { select: $("#simulatorScenarioSelect"), field: $("#simulatorCustomScenarioField"), input: $("#simulatorCustomScenarioInput") },
    { select: $("#simulatorObjectSelect"), field: $("#simulatorCustomObjectField"), input: $("#simulatorCustomObjectInput") }
  ];
  pairs.forEach(({ select, field, input }) => {
    const custom = select?.value === CUSTOM_SIMULATOR_VISUAL_VALUE;
    if (field) field.hidden = !custom;
    if (input) input.required = custom;
    if (focus && custom && input) requestAnimationFrame(() => input.focus());
  });
}

function fillSimulatorVisualChoiceOptions(selection = {}, selectedControls = state.activity?.controls || []) {
  const scenarioSelect = $("#simulatorScenarioSelect");
  const objectSelect = $("#simulatorObjectSelect");
  if (!scenarioSelect || !objectSelect) return;
  const subject = $("#subjectSelect")?.value || state.activity?.subject || "physics";
  const topic = getSelectedTopic() || state.activity?.topic || "";
  const catalog = simulatorVisualCatalog(subject, topic);
  const exactMathBoard = catalog.modelKey === "addition-subtraction" || catalog.modelKey === "quadratic-factorization-rectangle";
  const codeDrawnNumberLine = catalog.modelKey === "number-line";
  const visualChoiceGrid = document.querySelector("#simulatorVisualChoiceFields .sa-simulator-choice-grid");
  const objectChoiceColumn = $("#simulatorObjectChoiceColumn");
  const visualChoiceHint = document.querySelector("#simulatorVisualChoiceFields > small");
  if (visualChoiceGrid) visualChoiceGrid.hidden = exactMathBoard;
  if (objectChoiceColumn) objectChoiceColumn.hidden = exactMathBoard || codeDrawnNumberLine;
  if (visualChoiceHint) visualChoiceHint.textContent = exactMathBoard
    ? catalog.modelKey === "quadratic-factorization-rectangle"
      ? "Caja algebraica exacta: el rectángulo 2×2, las fichas, los signos y las etiquetas se dibujan con código y funcionan sin conexión."
      : "Tablero matemático exacto: la recta y las fichas se dibujan vectorialmente y no usan Gemini."
    : codeDrawnNumberLine
      ? "Gemini genera sólo el entorno. La recta, sus marcas, los puntos y el vector de desplazamiento se dibujan con geometría exacta en el simulador."
      : "Las opciones se adaptan automáticamente a la materia y al tema. Gemini generará exactamente esta combinación.";
  scenarioSelect.innerHTML = `${catalog.scenarios.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")}<option value="${CUSTOM_SIMULATOR_VISUAL_VALUE}">Otro escenario…</option>`;
  objectSelect.innerHTML = `${catalog.objects.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")}<option value="${CUSTOM_SIMULATOR_VISUAL_VALUE}">Otro objeto…</option>`;
  const customScenario = String(selection?.customScenario || (selection?.scenarioId === CUSTOM_SIMULATOR_VISUAL_VALUE ? selection?.scenarioLabel : "") || "");
  const customObject = String(selection?.customObject || (selection?.objectId === CUSTOM_SIMULATOR_VISUAL_VALUE ? selection?.objectLabel : "") || "");
  scenarioSelect.value = selection?.scenarioId === CUSTOM_SIMULATOR_VISUAL_VALUE ? CUSTOM_SIMULATOR_VISUAL_VALUE : catalog.scenarios.some((item) => item.id === selection?.scenarioId) ? selection.scenarioId : catalog.scenarios[0]?.id || "";
  objectSelect.value = selection?.objectId === CUSTOM_SIMULATOR_VISUAL_VALUE ? CUSTOM_SIMULATOR_VISUAL_VALUE : catalog.objects.some((item) => item.id === selection?.objectId) ? selection.objectId : catalog.objects[0]?.id || "";
  if ($("#simulatorCustomScenarioInput")) $("#simulatorCustomScenarioInput").value = customScenario;
  if ($("#simulatorCustomObjectInput")) $("#simulatorCustomObjectInput").value = customObject;
  toggleSimulatorCustomVisualFields();
  const variableContainer = $("#simulatorVariableChoices");
  const variableFormula = $("#simulatorVariableFormula");
  const variableCount = $("#simulatorVariableCount");
  if (!variableContainer) return;
  const selectedValues = new Map((Array.isArray(selectedControls) ? selectedControls : []).map((control) => [control.id, control.value]));
  const variables = simulatorVariablesFor(subject, topic).filter((control) => control.visible !== false);
  variableContainer.innerHTML = variables.map((control) => {
    const value = selectedValues.has(control.id) ? selectedValues.get(control.id) : control.value;
    const segmented = control.controlType === "segmented" && Array.isArray(control.options) && control.options.length;
    const range = segmented ? "Elige una operación" : `${control.min}–${control.max}${control.unit ? ` ${control.unit}` : ""}`;
    const editor = segmented
      ? `<span class="sa-simulator-segmented" role="radiogroup" aria-label="${escapeHtml(control.label)}">${control.options.map((option) => `<label><input type="radio" data-simulator-variable="${escapeHtml(control.id)}" name="simulator-variable-${escapeHtml(control.id)}" value="${Number(option.value)}" ${Number(value) === Number(option.value) ? "checked" : ""} ${control.editable === false ? "disabled" : ""}><span>${escapeHtml(option.label)}</span></label>`).join("")}</span>`
      : `<span class="sa-simulator-variable-input"><input type="number" inputmode="decimal" data-simulator-variable="${escapeHtml(control.id)}" min="${Number(control.min)}" max="${Number(control.max)}" step="${Number(control.step) || 1}" value="${Number(value)}" ${control.editable === false ? "disabled" : ""}><i>${escapeHtml(control.unit || "valor")}</i></span>`;
    return `<div class="sa-simulator-variable-card">
      <span><b>${escapeHtml(control.label)}</b><em>${escapeHtml(range)}</em></span>
      ${editor}
      <small>${escapeHtml(control.effect || "Modifica el comportamiento del modelo.")}</small>
    </div>`;
  }).join("");
  const profile = curriculumProfileFor(subject, topic);
  if (variableFormula) variableFormula.textContent = profile?.simulatorProfile?.formula ? `Relación: ${profile.simulatorProfile.formula}` : "";
  if (variableCount) variableCount.textContent = `${variables.length} ${variables.length === 1 ? "variable" : "variables"}`;
}

function getSelectedSimulatorVariableValues() {
  const values = {};
  document.querySelectorAll("#simulatorVariableChoices [data-simulator-variable]").forEach((input) => {
    if (input.type === "radio" && !input.checked) return;
    values[input.dataset.simulatorVariable] = Number(input.value);
  });
  return values;
}

function getSelectedSimulatorVisualSelection() {
  const subject = $("#subjectSelect")?.value || state.activity?.subject || "physics";
  const topic = getSelectedTopic() || state.activity?.topic || "";
  return normalizeSimulatorVisualSelection({ subject, topic }, {
    scenarioId: $("#simulatorScenarioSelect")?.value,
    objectId: $("#simulatorObjectSelect")?.value,
    customScenario: $("#simulatorCustomScenarioInput")?.value,
    customObject: $("#simulatorCustomObjectInput")?.value
  });
}

function validateSimulatorCustomVisualChoices() {
  const choices = [
    { select: $("#simulatorScenarioSelect"), input: $("#simulatorCustomScenarioInput"), message: "Describe el escenario personalizado que quieres generar." },
    { select: $("#simulatorObjectSelect"), input: $("#simulatorCustomObjectInput"), message: "Describe el objeto personalizado que quieres utilizar." }
  ];
  const missing = choices.find(({ select, input }) => select?.value === CUSTOM_SIMULATOR_VISUAL_VALUE && !input?.value.trim());
  if (!missing) return true;
  showToast(missing.message);
  missing.input?.focus();
  return false;
}

function getSelectedScenario() {
  const subject = $("#subjectSelect").value;
  const scenarios = SCENARIOS[subject]?.length
    ? SCENARIOS[subject]
    : buildScenarioCatalog(subject);
  const baseScenario = scenarios.find((scenario) => scenario.id === $("#scenarioSelect").value) || scenarios[0];
  const customTopic = getSelectedTopic();
  if ($("#topicInput").value !== CUSTOM_TOPIC_VALUE || !customTopic) return baseScenario;
  return {
    ...baseScenario,
    label: `${customTopic} · Escenario libre`,
    topic: customTopic,
    motif: `${slugify(customTopic)}-${baseScenario.biome}`
  };
}

function matchScenarioToTopic() {
  const scenarios = SCENARIOS[$("#subjectSelect").value] || [];
  const selectedMode = $("#gameModeSelect")?.value || state.activity?.gameMode || "game";
  toggleCustomTopicField();
  const selectedTopic = getSelectedTopic();
  if ($("#topicInput").value === CUSTOM_TOPIC_VALUE) {
    if (!selectedTopic) return;
    state.activity = buildTopicActivity($("#subjectSelect").value, selectedTopic, getSelectedScenario());
    state.activity.gameMode = selectedMode;
    $("#expectedLearnings").value = "";
    $("#experiencePrompt").value = "";
    syncActivityToEditor();
    return;
  }
  const match = scenarios.find((scenario) => scenario.topic.toLowerCase() === selectedTopic.toLowerCase());
  if (match) {
    $("#scenarioSelect").value = match.id;
    state.activity = buildTopicActivity($("#subjectSelect").value, match.topic, match);
    state.activity.gameMode = selectedMode;
    $("#expectedLearnings").value = "";
    $("#experiencePrompt").value = "";
    syncActivityToEditor();
    return;
  }
  syncEditorToActivity();
}

function renderTips() {
  $("#coachTips").innerHTML = state.activity.coachTips.map((tip, index) => `
    <div class="sa-tip">${escapeHtml(tip)}<button type="button" data-remove-tip="${index}" aria-label="Eliminar consejo"><i class="fas fa-xmark"></i></button></div>
  `).join("");
}

function openOfflineDatabase() {
  if (offlineDbPromise) return offlineDbPromise;
  offlineDbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB no está disponible."));
      return;
    }
    const requiredStores = [OFFLINE_SESSIONS_STORE, OFFLINE_DRAFTS_STORE, OFFLINE_SESSION_INDEX_STORE];
    const createMissingStores = (database) => {
      if (!database.objectStoreNames.contains(OFFLINE_SESSIONS_STORE)) {
        database.createObjectStore(OFFLINE_SESSIONS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(OFFLINE_DRAFTS_STORE)) {
        database.createObjectStore(OFFLINE_DRAFTS_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(OFFLINE_SESSION_INDEX_STORE)) {
        database.createObjectStore(OFFLINE_SESSION_INDEX_STORE, { keyPath: "id" });
      }
    };
    const openAtVersion = (version) => {
      const request = version ? indexedDB.open(OFFLINE_DB_NAME, version) : indexedDB.open(OFFLINE_DB_NAME);
      request.onupgradeneeded = () => createMissingStores(request.result);
      request.onsuccess = () => {
        const database = request.result;
        const missingStores = requiredStores.filter((storeName) => !database.objectStoreNames.contains(storeName));
        const repairVersion = nextOfflineDatabaseVersion(database.version, OFFLINE_DB_VERSION, missingStores.length === 0);
        if (!repairVersion) {
          database.onversionchange = () => database.close();
          resolve(database);
          return;
        }
        database.close();
        openAtVersion(repairVersion);
      };
      request.onblocked = () => reject(new Error("Cierra otras pestañas de Science Activities para completar la migración local."));
      request.onerror = () => reject(request.error || new Error("No fue posible abrir IndexedDB."));
    };
    openAtVersion();
  });
  offlineDbPromise.catch(() => { offlineDbPromise = null; });
  return offlineDbPromise;
}

async function readOfflineStore(storeName) {
  const database = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function readOfflineRecord(storeName, key) {
  const database = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function queueOfflineWrite(operation) {
  offlineWriteChain = offlineWriteChain.catch(() => {}).then(operation);
  return offlineWriteChain;
}

function writeOfflineRecords(storeName, records) {
  const snapshot = structuredClone((Array.isArray(records) ? records : [records]).filter(Boolean));
  if (!snapshot.length) return Promise.resolve();
  return queueOfflineWrite(async () => {
    const database = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      snapshot.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  });
}

function deleteOfflineRecords(storeNames, key) {
  return queueOfflineWrite(async () => {
    const database = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeNames, "readwrite");
      storeNames.forEach((storeName) => transaction.objectStore(storeName).delete(key));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  });
}

async function migrateOfflineSessionIndex() {
  let indexed = [];
  try {
    indexed = await readOfflineStore(OFFLINE_SESSION_INDEX_STORE);
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible leer el índice de sesiones:", error);
    return [];
  }
  if (indexed.length) return indexed.map(sessionMetadataFromRecord);

  let legacySessions = [];
  try { legacySessions = await readOfflineStore(OFFLINE_SESSIONS_STORE); } catch (_) { }
  if (!legacySessions.length) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      legacySessions = Array.isArray(stored) ? stored : [];
    } catch (_) { }
  }
  const metadata = legacySessions.map(sessionMetadataFromRecord).filter((session) => session.id);
  if (metadata.length) await writeOfflineRecords(OFFLINE_SESSION_INDEX_STORE, metadata);
  const validLegacyBodies = legacySessions.filter((session) => session.id && isHydratableSessionActivity(session.activity));
  if (validLegacyBodies.length) await writeOfflineRecords(OFFLINE_SESSIONS_STORE, validLegacyBodies);
  return metadata;
}

async function persistSessionMetadata(sessions) {
  const metadata = (Array.isArray(sessions) ? sessions : [sessions]).map(sessionMetadataFromRecord).filter((session) => session.id);
  if (!metadata.length) return;
  await writeOfflineRecords(OFFLINE_SESSION_INDEX_STORE, metadata);
  persistSessionsWithinQuota(state.sessions);
}

async function persistSessionBody(session, activity = session?.activity) {
  if (!session?.id || !activity) return;
  await writeOfflineRecords(OFFLINE_SESSIONS_STORE, {
    id: String(session.id),
    firebaseDocId: session.firebaseDocId || null,
    savedAt: String(session.bodySavedAt || session.savedAt || ""),
    activity: structuredClone(activity)
  });
}

async function persistOfflineDraft(sessionId, activity = state.activity, updatedAt = new Date().toISOString()) {
  if (!sessionId || !activity) return;
  await writeOfflineRecords(OFFLINE_DRAFTS_STORE, {
    key: `session:${String(sessionId)}`,
    sessionId: String(sessionId),
    activeSessionId: String(sessionId),
    updatedAt,
    activity: structuredClone(activity)
  });
}

async function readSessionDraft(sessionId) {
  if (!sessionId) return null;
  const exact = await readOfflineRecord(OFFLINE_DRAFTS_STORE, `session:${String(sessionId)}`);
  if (exact?.activity) return exact;
  const localDraft = readLocalDraftRecord();
  if (String(localDraft?.activeSessionId || "") !== String(sessionId)) return null;
  if (localDraft?.activity) return localDraft;
  const legacy = await readOfflineRecord(OFFLINE_DRAFTS_STORE, "current");
  return legacy?.activity ? { ...legacy, activeSessionId: String(sessionId) } : null;
}

async function fetchRemoteSession(session, signal) {
  if (!session?.firebaseDocId) return null;
  const auth = await getScienceAuth({ ready: true });
  if (!auth.currentUser) return null;
  const localId = encodeURIComponent(String(session.id || ""));
  const response = await authFetchJson(`/api/science-activities/session/${encodeURIComponent(session.firebaseDocId)}?localId=${localId}`, {
    sameOrigin: true,
    signal
  });
  return response?.session?.activity ? response.session : null;
}

async function resolveHydratedSessionActivity(session, { allowRemote = true, signal } = {}) {
  const candidates = [];
  if (isHydratableSessionActivity(session?.activity)) {
    candidates.push({ source: "legacy", timestamp: Date.parse(session.savedAt || "") || 0, activity: session.activity });
  }
  try {
    const body = await readOfflineRecord(OFFLINE_SESSIONS_STORE, String(session?.id || ""));
    if (isHydratableSessionActivity(body?.activity)) candidates.push({ source: "body", timestamp: Date.parse(body.savedAt || session?.bodySavedAt || "") || 0, activity: body.activity });
    const draft = await readSessionDraft(session?.id);
    if (isHydratableSessionActivity(draft?.activity)) candidates.push({ source: "draft", timestamp: Date.parse(draft.updatedAt || "") || 0, activity: draft.activity });
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible leer la sesión local:", error);
  }

  const newestLocalTimestamp = candidates.reduce((maximum, candidate) => Math.max(maximum, candidate.timestamp), 0);
  const remoteTimestamp = Date.parse(session?.remoteSavedAt || (session?.remoteAvailable ? session?.savedAt : "") || "") || 0;
  const localChangesPending = session?.syncState === "pending" && candidates.length > 0;
  if (allowRemote && !localChangesPending && session?.firebaseDocId && (!candidates.length || remoteTimestamp > newestLocalTimestamp)) {
    try {
      const remote = await fetchRemoteSession(session, signal);
      if (remote?.activity) {
        const timestamp = Date.parse(remote.savedAt || session.savedAt || "") || Date.now();
        candidates.push({ source: "remote", timestamp, activity: remote.activity });
        session.firebaseDocId = remote.firebaseDocId || session.firebaseDocId;
        session.bodySavedAt = remote.savedAt || session.savedAt || "";
        session.remoteSavedAt = remote.savedAt || session.remoteSavedAt || "";
        await persistSessionBody(session, remote.activity);
        await persistSessionMetadata(session);
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (!candidates.length) throw error;
      console.warn("[ScienceActivities] Se usará la copia local de la sesión:", error);
    }
  }

  const orderedCandidates = orderHydrationCandidates(candidates);
  const primary = orderedCandidates[0];
  if (!isHydratableSessionActivity(primary?.activity)) {
    const error = new Error("La sesión seleccionada no contiene una actividad guardada válida.");
    error.code = "SCIENCE_SESSION_ACTIVITY_MISSING";
    throw error;
  }
  const hydrated = orderedCandidates.slice(1).reduce(
    (result, candidate) => restoreOfflineAssets(result, candidate.activity),
    structuredClone(primary.activity)
  );
  return rehydrateLearningGuideImages(hydrated);
}

async function loadSessions() {
  state.sessions = (await migrateOfflineSessionIndex())
    .filter((session) => session.id)
    .sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")));
  state.activeSessionId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || null;
  if (!state.sessions.some((session) => String(session.id) === String(state.activeSessionId))) {
    state.activeSessionId = state.sessions[0]?.id || null;
    if (state.activeSessionId) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(state.activeSessionId));
    else localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  }
  loadSessionGroups();
  renderSessions();
  markStartup("session-index-ready");
}

async function syncRemoteSessionsInBackground({ refreshActive = true, interactionRevision = sessionInteractionRevision } = {}) {
  try {
    const auth = await getScienceAuth({ ready: true });
    if (!auth.currentUser) return false;
    const remote = await authFetchJson("/api/science-activities/list", { sameOrigin: true });
    const legacyRemoteBodies = [];
    const remoteRecords = Array.isArray(remote?.sessions) ? remote.sessions : [];
    const remoteSessions = remoteRecords.map((session) => {
      const activity = session.activity && typeof session.activity === "object" ? session.activity : null;
      const metadata = {
        id: session.localId || session.firebaseDocId,
        firebaseDocId: session.firebaseDocId,
        savedAt: session.savedAt || "",
        bodySavedAt: activity ? session.savedAt || "" : "",
        remoteSavedAt: session.savedAt || "",
        remoteAvailable: true,
        syncState: "saved",
        title: session.title || activity?.title || "Sesión sin título",
        subject: session.subject || activity?.subject || "",
        topic: session.topic || activity?.topic || "",
        gameMode: normalizedSessionMode(session.gameMode || activity?.gameMode)
      };
      if (metadata.id && activity) {
        legacyRemoteBodies.push({
          id: String(metadata.id),
          firebaseDocId: metadata.firebaseDocId || null,
          savedAt: metadata.savedAt,
          activity
        });
      }
      return metadata;
    }).filter((session) => session.id);
    if (legacyRemoteBodies.length) {
      await writeOfflineRecords(OFFLINE_SESSIONS_STORE, legacyRemoteBodies);
    }
    const merged = [...state.sessions];
    remoteSessions.forEach((session) => {
      const matchingIndexes = merged.reduce((indexes, local, index) => {
        if (sessionsShareIdentity(local, session)) indexes.push(index);
        return indexes;
      }, []);
      const local = matchingIndexes.map((index) => merged[index])
        .sort((left, right) => String(right.savedAt || "").localeCompare(String(left.savedAt || "")))[0];
      if (!local) {
        merged.push(session);
        return;
      }
      const remoteIsNewer = String(session.savedAt || "") > String(local.savedAt || "");
      const localMetadataIncomplete = !String(local.title || "").trim()
        || local.title === "Sesión sin título"
        || !String(local.subject || "").trim()
        || !String(local.topic || "").trim();
      const shouldAdoptRemote = local.syncState !== "pending" && (remoteIsNewer || localMetadataIncomplete);
      const reconciled = {
        ...local,
        ...(shouldAdoptRemote ? session : {}),
        firebaseDocId: session.firebaseDocId,
        bodySavedAt: session.bodySavedAt || local.bodySavedAt || "",
        remoteSavedAt: session.savedAt,
        remoteAvailable: true,
        syncState: remoteIsNewer || local.syncState !== "pending" ? "saved" : local.syncState
      };
      matchingIndexes.sort((left, right) => right - left).forEach((index) => merged.splice(index, 1));
      merged.push(reconciled);
    });
    const remoteListComplete = remote?.complete === true || (remote?.complete == null && remoteRecords.length < 50);
    const orphanedSessions = merged.filter((session) => !shouldKeepSessionAfterRemoteList(session, remoteSessions, remoteListComplete));
    state.sessions = merged
      .filter((session) => shouldKeepSessionAfterRemoteList(session, remoteSessions, remoteListComplete))
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
    await Promise.all(orphanedSessions.map((session) => (
      deleteOfflineRecords([OFFLINE_SESSION_INDEX_STORE], String(session.id))
    )));
    const canApplyRemoteSelection = sessionInteractionRevision === interactionRevision;
    if (canApplyRemoteSelection && !state.sessions.some((session) => String(session.id) === String(state.activeSessionId))) {
      state.activeSessionId = state.sessions[0]?.id || null;
      if (state.activeSessionId) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(state.activeSessionId));
    }
    await persistSessionMetadata(state.sessions);
    renderSessions();
    const active = state.sessions.find((session) => String(session.id) === String(state.activeSessionId));
    const activeNeedsRemote = active && active.syncState !== "pending"
      && String(active.remoteSavedAt || "") > String(active.bodySavedAt || "");
    if (refreshActive && canApplyRemoteSelection && active && (activeNeedsRemote || !isGeneratedScienceActivity(state.activity))) {
      await activateSession(active, { allowRemote: true, flushCurrent: false, silent: true });
    }
    markStartup("remote-sync-complete");
    return true;
  } catch (error) {
    console.warn("[ScienceActivities] No se pudieron sincronizar sesiones remotas; se mantiene el modo offline:", error);
    return false;
  }
}

function readLocalDraftRecord() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
    if (!draft || typeof draft !== "object") return null;
    if (draft.indexedDbOnly === true) {
      return {
        activity: null,
        updatedAt: draft.updatedAt || "",
        activeSessionId: draft.activeSessionId || null,
        legacy: false
      };
    }
    if (draft.activity && typeof draft.activity === "object") {
      return {
        activity: draft.activity,
        updatedAt: draft.updatedAt || "",
        activeSessionId: draft.activeSessionId || null,
        legacy: false
      };
    }
    return { activity: draft, updatedAt: "", activeSessionId: null, legacy: true };
  } catch (error) {
    console.warn("[ScienceActivities] Borrador local inválido:", error);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function restoreOfflineAssets(primaryActivity, offlineActivity) {
  const result = structuredClone(primaryActivity);
  if (!offlineActivity || typeof offlineActivity !== "object") return result;
  const resultLevels = result.learningGuide?.levels || [];
  const offlineLevels = offlineActivity.learningGuide?.levels || [];
  resultLevels.forEach((level, index) => {
    const offlineLevel = offlineLevels[index];
    if (!offlineLevel) return;
    if (!level.imageDataUrl && offlineLevel.imageDataUrl) level.imageDataUrl = offlineLevel.imageDataUrl;
    if (!level.imageUrl && offlineLevel.imageUrl) level.imageUrl = offlineLevel.imageUrl;
    if (!level.imageSrc && offlineLevel.imageSrc) level.imageSrc = offlineLevel.imageSrc;
  });
  if (result.playerSprite && offlineActivity.playerSprite) {
    if (!result.playerSprite.dataUrl && offlineActivity.playerSprite.dataUrl) {
      result.playerSprite.dataUrl = offlineActivity.playerSprite.dataUrl;
    }
  }
  if (result.visualScene && offlineActivity.visualScene) {
    if (!result.visualScene.background?.dataUrl && offlineActivity.visualScene.background?.dataUrl) result.visualScene.background.dataUrl = offlineActivity.visualScene.background.dataUrl;
    (result.visualScene.layers || []).forEach((layer, index) => {
      if (!layer.dataUrl && offlineActivity.visualScene.layers?.[index]?.dataUrl) layer.dataUrl = offlineActivity.visualScene.layers[index].dataUrl;
    });
  }
  return rehydrateLearningGuideImages(result);
}

function updateActiveSessionFromDraft(updatedAt) {
  if (sessionSetupState.active) return;
  if (!state.activeSessionId) return;
  const activeIndex = state.sessions.findIndex((session) => String(session.id) === String(state.activeSessionId));
  if (activeIndex < 0) return;
  state.sessions[activeIndex] = {
    ...state.sessions[activeIndex],
    savedAt: updatedAt,
    bodySavedAt: updatedAt,
    syncState: "pending",
    title: String(state.activity.title || "Sesión sin título"),
    subject: String(state.activity.subject || ""),
    topic: String(state.activity.topic || ""),
    gameMode: normalizedSessionMode(state.activity.gameMode)
  };
  persistSessionMetadata(state.sessions[activeIndex]).catch((error) => {
    console.warn("[ScienceActivities] No fue posible actualizar el índice de la sesión activa:", error);
  });
  persistSessionBody(state.sessions[activeIndex], state.activity).catch((error) => {
    console.warn("[ScienceActivities] No fue posible actualizar el cuerpo de la sesión activa:", error);
  });
  renderSessions();
}

function persistLocalDraft() {
  const updatedAt = new Date().toISOString();
  let localSaved = false;
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      version: 4,
      updatedAt,
      activeSessionId: state.activeSessionId,
      indexedDbOnly: true
    }));
    localSaved = true;
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible guardar el borrador local:", error);
  }
  updateActiveSessionFromDraft(updatedAt);
  persistOfflineDraft(state.activeSessionId, state.activity, updatedAt).catch((error) => {
    console.warn("[ScienceActivities] No fue posible guardar el borrador completo en IndexedDB:", error);
  });
  return localSaved;
}

function scheduleLocalDraftSave() {
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => {
    syncEditorToActivity();
    persistLocalDraft();
    window.clearTimeout(remoteSaveTimer);
    remoteSaveTimer = window.setTimeout(() => {
      void autosaveProject("user-change");
    }, 1200);
  }, 180);
}

function flushLocalDraftSave() {
  window.clearTimeout(draftSaveTimer);
  window.clearTimeout(remoteSaveTimer);
  if (!$("#activityTitle")) return Promise.resolve();
  syncEditorToActivity();
  persistLocalDraft();
  return autosaveProject("draft-flush");
}

function normalizeSessionGroups(groups = state.sessionGroups) {
  const knownSessionIds = new Set(state.sessions.map((session) => String(session.id)));
  const claimedSessionIds = new Set();
  return (Array.isArray(groups) ? groups : []).reduce((normalized, source, index) => {
    const sessionIds = [...new Set((Array.isArray(source?.sessionIds) ? source.sessionIds : [])
      .map(String)
      .filter((sessionId) => knownSessionIds.has(sessionId) && !claimedSessionIds.has(sessionId)))];
    if (!sessionIds.length) return normalized;
    sessionIds.forEach((sessionId) => claimedSessionIds.add(sessionId));
    normalized.push({
      id: String(source?.id || `session-group-${index + 1}`),
      name: String(source?.name || `Grupo ${index + 1}`).trim() || `Grupo ${index + 1}`,
      sessionIds,
      collapsed: source?.collapsed === true,
      createdAt: String(source?.createdAt || "")
    });
    return normalized;
  }, []);
}

function persistSessionGroups() {
  state.sessionGroups = normalizeSessionGroups();
  try {
    localStorage.setItem(SESSION_GROUPS_STORAGE_KEY, JSON.stringify(state.sessionGroups));
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible guardar los grupos de sesiones:", error);
  }
}

function loadSessionGroups() {
  try {
    state.sessionGroups = normalizeSessionGroups(JSON.parse(localStorage.getItem(SESSION_GROUPS_STORAGE_KEY) || "[]"));
  } catch (error) {
    console.warn("[ScienceActivities] Los grupos de sesiones locales eran inválidos:", error);
    state.sessionGroups = [];
  }
  persistSessionGroups();
}

function clearSessionSelection({ render = true } = {}) {
  state.selectedSessionIds.clear();
  if (render) renderSessions();
}

function toggleSessionSelection(sessionId) {
  const normalizedId = String(sessionId || "");
  if (!normalizedId) return;
  if (state.selectedSessionIds.has(normalizedId)) state.selectedSessionIds.delete(normalizedId);
  else state.selectedSessionIds.add(normalizedId);
  renderSessions();
  showToast(state.selectedSessionIds.size
    ? `${state.selectedSessionIds.size} sesión${state.selectedSessionIds.size === 1 ? "" : "es"} seleccionada${state.selectedSessionIds.size === 1 ? "" : "s"}. Usa Cmd/Ctrl + G para agrupar.`
    : "Selección de sesiones limpiada.");
}

function createSessionGroupFromSelection() {
  const selectedIds = [...state.selectedSessionIds].filter((sessionId) =>
    state.sessions.some((session) => String(session.id) === sessionId));
  if (selectedIds.length < 2) {
    showToast("Selecciona al menos dos sesiones con Cmd/Ctrl + clic.");
    return false;
  }
  const proposedName = `Grupo ${state.sessionGroups.length + 1}`;
  const name = window.prompt("Nombre del nuevo grupo:", proposedName)?.trim();
  if (!name) return false;
  state.sessionGroups = state.sessionGroups.map((group) => ({
    ...group,
    sessionIds: group.sessionIds.filter((sessionId) => !selectedIds.includes(String(sessionId)))
  })).filter((group) => group.sessionIds.length);
  state.sessionGroups.push({
    id: crypto.randomUUID(),
    name,
    sessionIds: selectedIds,
    collapsed: false,
    createdAt: new Date().toISOString()
  });
  state.selectedSessionIds.clear();
  persistSessionGroups();
  renderSessions();
  showToast(`Grupo “${name}” creado con ${selectedIds.length} sesiones.`);
  return true;
}

function sessionRailItemMarkup(session) {
  const sessionId = String(session.id);
  const selected = state.selectedSessionIds.has(sessionId);
  const active = sessionId === String(state.activeSessionId);
  const title = session.title || "Sesión sin título";
  return `<div class="sa-session-item${active ? " active" : ""}${selected ? " is-selected" : ""}" role="listitem" data-session-id="${escapeHtml(sessionId)}">
    <button class="sa-session" type="button" data-load-session-id="${escapeHtml(sessionId)}" aria-pressed="${String(selected)}" title="${escapeHtml(title)}"><span><strong>${escapeHtml(title)}</strong></span></button>
    <button class="sa-session-menu-toggle" type="button" data-session-menu aria-label="Opciones de ${escapeHtml(title)}" aria-expanded="false"><i class="fas fa-ellipsis-vertical"></i></button>
    <div class="sa-session-menu" data-session-menu-content hidden>
      <button type="button" data-session-action="rename" data-session-id="${escapeHtml(sessionId)}"><i class="fas fa-pen"></i>Renombrar</button>
      <button type="button" data-session-action="duplicate" data-session-id="${escapeHtml(sessionId)}"><i class="fas fa-copy"></i>Duplicar</button>
      <button type="button" data-session-action="delete" data-session-id="${escapeHtml(sessionId)}"><i class="fas fa-trash"></i>Eliminar</button>
    </div>
  </div>`;
}

function renderSessions() {
  const knownIds = new Set(state.sessions.map((session) => String(session.id)));
  [...state.selectedSessionIds].forEach((sessionId) => {
    if (!knownIds.has(sessionId)) state.selectedSessionIds.delete(sessionId);
  });
  state.sessionGroups = normalizeSessionGroups();
  const groupedIds = new Set(state.sessionGroups.flatMap((group) => group.sessionIds));
  const groupedMarkup = state.sessionGroups.map((group) => {
    const sessions = group.sessionIds.map((sessionId) =>
      state.sessions.find((session) => String(session.id) === String(sessionId))).filter(Boolean);
    return `<section class="sa-session-group${group.collapsed ? " is-collapsed" : ""}" data-session-group-id="${escapeHtml(group.id)}" role="group" aria-label="${escapeHtml(group.name)}">
      <header class="sa-session-group-heading">
        <button type="button" data-toggle-session-group="${escapeHtml(group.id)}" aria-expanded="${String(!group.collapsed)}" title="${group.collapsed ? "Expandir" : "Contraer"} ${escapeHtml(group.name)}"><i class="fas fa-chevron-down sa-session-group-chevron" aria-hidden="true"></i><i class="fas fa-folder" aria-hidden="true"></i><strong>${escapeHtml(group.name)}</strong><small>${sessions.length}</small></button>
        <span class="sa-session-group-actions">
          <button type="button" data-session-group-action="rename" data-session-group-id="${escapeHtml(group.id)}" aria-label="Renombrar ${escapeHtml(group.name)}" title="Renombrar grupo"><i class="fas fa-pen"></i></button>
          <button type="button" data-session-group-action="ungroup" data-session-group-id="${escapeHtml(group.id)}" aria-label="Desagrupar ${escapeHtml(group.name)}" title="Desagrupar"><i class="fas fa-folder-open"></i></button>
        </span>
      </header>
      <div class="sa-session-group-items"${group.collapsed ? " hidden" : ""}>${sessions.map(sessionRailItemMarkup).join("")}</div>
    </section>`;
  }).join("");
  const ungroupedMarkup = state.sessions.filter((session) => !groupedIds.has(String(session.id))).map(sessionRailItemMarkup).join("");
  $("#savedProjects").innerHTML = state.sessions.length
    ? `${groupedMarkup}${ungroupedMarkup}`
    : '<p class="sa-session-empty">Crea con IA y guarda aquí tus sesiones.</p>';
}

function persistActiveSessionPointer(session, updatedAt = "") {
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(session.id));
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    version: 5,
    updatedAt: updatedAt || session.bodySavedAt || session.savedAt || "",
    activeSessionId: String(session.id),
    indexedDbOnly: true
  }));
}

async function activateSession(session, { allowRemote = true, flushCurrent = true, silent = false, mountPreview = true, userInitiated = false } = {}) {
  if (!session?.id) throw new Error("No se encontró la sesión seleccionada.");
  if (userInitiated) noteSessionInteraction();
  state.previewMountRevision = Number(state.previewMountRevision || 0) + 1;
  if (flushCurrent && state.activeSessionId && String(state.activeSessionId) !== String(session.id) && isGeneratedScienceActivity(state.activity)) {
    await flushLocalDraftSave();
  }
  window.clearTimeout(draftSaveTimer);
  window.clearTimeout(remoteSaveTimer);
  state.sessionLoadAbortController?.abort?.();
  const controller = new AbortController();
  state.sessionLoadAbortController = controller;
  const loadRevision = Number(state.sessionLoadRevision || 0) + 1;
  state.sessionLoadRevision = loadRevision;
  const sessionElement = $(`[data-session-id="${CSS.escape(String(session.id))}"]`);
  sessionElement?.classList.add("is-loading");
  try {
    const hydratedActivity = await resolveHydratedSessionActivity(session, { allowRemote, signal: controller.signal });
    if (controller.signal.aborted || state.sessionLoadRevision !== loadRevision) return false;
    const normalized = normalizeActivity(hydratedActivity);
    state.activeSessionId = session.id;
    state.activity = normalized;
    state.previewActivity = structuredClone(normalized);
    state.contentSelection = "start";
    state.isRehydratingSession = true;
    persistActiveSessionPointer(session, session.bodySavedAt || session.savedAt || new Date().toISOString());
    syncActivityToEditor();
    sessionSetupState.active = false;
    sessionSetupState.previous = null;
    hideSessionSetupModal({ revealStudio: true });
    renderSessions();
    markStartup("session-visible");
    if (mountPreview) await renderGame();
    else showPreviewPreparing();
    if (controller.signal.aborted || state.sessionLoadRevision !== loadRevision) return false;
    state.isRehydratingSession = false;
    if (session.syncState === "pending") void autosaveProject("pending-session-opened");
    if (!silent) showToast("Sesión restaurada.");
    return true;
  } finally {
    state.isRehydratingSession = false;
    sessionElement?.classList.remove("is-loading");
    if (state.sessionLoadAbortController === controller) state.sessionLoadAbortController = null;
  }
}

async function deleteLocalSession(sessionId) {
  await deleteOfflineRecords([OFFLINE_SESSION_INDEX_STORE, OFFLINE_SESSIONS_STORE], String(sessionId));
  await deleteOfflineRecords([OFFLINE_DRAFTS_STORE], `session:${String(sessionId)}`);
}

async function renameRemoteSession(session, title, savedAt) {
  if (!(await getScienceAuth()).currentUser || !session?.firebaseDocId) return;
  await authFetchJson("/api/science-activities/rename", {
    sameOrigin: true,
    method: "POST",
    body: { firebaseDocId: session.firebaseDocId, localId: String(session.id), title, savedAt }
  });
}

async function deleteRemoteSession(session) {
  if (!(await getScienceAuth()).currentUser || !session?.firebaseDocId) return;
  await authFetchJson("/api/science-activities/delete", {
    sameOrigin: true,
    method: "POST",
    body: { firebaseDocId: session.firebaseDocId }
  });
}

function createStorageSafeActivity(activity) {
  const copy = structuredClone(activity);
  const removeEmbeddedAssets = (value) => {
    if (!value || typeof value !== "object") return;
    Object.entries(value).forEach(([key, child]) => {
      if (typeof child === "string" && child.startsWith("data:")) {
        value[key] = "";
        return;
      }
      removeEmbeddedAssets(child);
    });
  };
  removeEmbeddedAssets(copy);
  return copy;
}

function dataImageUrlToBlob(source) {
  const match = String(source || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("La imagen generada contiene un Data URL inválido.");
  const contentType = match[1] || "application/octet-stream";
  const encoded = match[3] || "";
  const binary = match[2] ? atob(encoded.replace(/\s/g, "")) : decodeURIComponent(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

async function decodeImageSource(source) {
  let sourceBlob;
  if (source instanceof Blob) {
    sourceBlob = source;
  } else if (/^data:image\//i.test(String(source || ""))) {
    sourceBlob = dataImageUrlToBlob(source);
  } else {
    const response = await fetch(source);
    if (!response.ok) throw new Error("No se pudo leer la imagen generada.");
    sourceBlob = await response.blob();
  }
  try {
    return await createImageBitmap(sourceBlob, { imageOrientation: "from-image" });
  } catch (_) {
    return createImageBitmap(sourceBlob);
  }
}

async function sanitizeAndResizeImage(source, targetWidth = 1280, { losslessAlpha = false } = {}) {
  const bitmap = await decodeImageSource(source);
  if (!bitmap.width || !bitmap.height) {
    bitmap.close?.();
    throw new Error("La imagen generada no tiene dimensiones válidas.");
  }
  const outputWidth = Math.max(1, Math.min(bitmap.width, Math.round(Number(targetWidth) || 1280)));
  const targetHeight = Math.max(1, Math.round(bitmap.height * (outputWidth / bitmap.width)));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, outputWidth, targetHeight);
  bitmap.close?.();
  const outputType = losslessAlpha ? "image/png" : "image/webp";
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("No se pudo recodificar la imagen.")),
      outputType,
      losslessAlpha ? undefined : .9
    );
  });
  canvas.width = 1;
  canvas.height = 1;
  return { blob, width: outputWidth, height: targetHeight, contentType: outputType };
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function blobToDataUrl(blob) {
  return `data:${blob.type || "image/webp"};base64,${await blobToBase64(blob)}`;
}

function updateSimulatorVisualGenerationStatus(message) {
  const status = $("#generationStatus");
  if (status && state.generating) status.innerHTML = `<i></i> ${escapeHtml(message)}`;
  const overlayText = $("#generationOverlay [data-generation-message], #generationOverlay p");
  if (overlayText) overlayText.textContent = message;
}

async function optimizeSimulatorBackground(source) {
  const bitmap = await decodeImageSource(source);
  const width = Math.min(1600, bitmap.width || 1600);
  const height = Math.max(1, Math.round(width * 9 / 16));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  const sourceRatio = bitmap.width / Math.max(1, bitmap.height), targetRatio = 16 / 9;
  const sourceWidth = sourceRatio > targetRatio ? bitmap.height * targetRatio : bitmap.width;
  const sourceHeight = sourceRatio > targetRatio ? bitmap.height : bitmap.width / targetRatio;
  context.drawImage(bitmap, (bitmap.width - sourceWidth) / 2, (bitmap.height - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo optimizar el fondo.")), "image/webp", .82));
  canvas.width = 1; canvas.height = 1;
  return { dataUrl: await blobToDataUrl(blob), width, height, bytes: blob.size };
}

function chromaDistance(red, green, blue, matte) {
  return Math.sqrt((red - matte[0]) ** 2 + (green - matte[1]) ** 2 + (blue - matte[2]) ** 2);
}

async function removeSimulatorLayerBackground(source, chroma = "green", options = {}) {
  const bitmap = await decodeImageSource(source);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
  const pixels = context.getImageData(0, 0, width, height);
  const matte = chroma === "magenta" ? [255, 0, 255] : [0, 255, 0];
  const cutout = removeConnectedImageBackground(pixels.data, width, height, matte);
  pixels.data.set(cutout.data);
  const primaryComponent = keepPrimaryImageComponent(pixels.data, width, height, { strict: options.strict === true });
  pixels.data.set(primaryComponent.data);
  const data = pixels.data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let position = 0; position < width * height; position++) {
    const offset = position * 4;
    if (data[offset + 3] < 8) continue;
    const distance = chromaDistance(data[offset], data[offset + 1], data[offset + 2], matte);
    if (!cutout.usedInferredMatte && distance < 155) {
      data[offset + 3] = Math.min(data[offset + 3], Math.round(255 * Math.max(0, (distance - 72) / 83)));
      if (chroma === "green") data[offset + 1] = Math.min(data[offset + 1], Math.max(data[offset], data[offset + 2]) + 18);
      else { data[offset] = Math.min(data[offset], data[offset + 1] + 22); data[offset + 2] = Math.min(data[offset + 2], data[offset + 1] + 22); }
    }
    if (data[offset + 3] >= 16) { const x = position % width, y = Math.floor(position / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  const despilled = despillImageMatte(data, width, height, matte, { radius: 3 });
  pixels.data.set(despilled.data);
  if (maxX < minX || maxY < minY) throw new Error("El elemento generado no contiene un objeto recortable.");
  context.putImageData(pixels, 0, 0);
  const padding = Math.max(8, Math.round(Math.max(width, height) * .025));
  const cropX = Math.max(0, minX - padding), cropY = Math.max(0, minY - padding), cropWidth = Math.min(width - cropX, maxX - minX + 1 + padding * 2), cropHeight = Math.min(height - cropY, maxY - minY + 1 + padding * 2);
  const outputScale = Math.min(1, 768 / Math.max(cropWidth, cropHeight));
  const output = document.createElement("canvas"); output.width = Math.max(1, Math.round(cropWidth * outputScale)); output.height = Math.max(1, Math.round(cropHeight * outputScale));
  const outputContext = output.getContext("2d", { alpha: true }); outputContext.imageSmoothingEnabled = true; outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, output.width, output.height);
  const blob = await new Promise((resolve, reject) => output.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo optimizar el elemento.")), "image/png"));
  const result = { dataUrl: await blobToDataUrl(blob), width: output.width, height: output.height, bytes: blob.size, chromaFringeRatio: despilled.residualPixels / Math.max(1, width * height) };
  canvas.width = 1; canvas.height = 1; output.width = 1; output.height = 1;
  return result;
}

async function repairStoredSimulatorLayerCutouts(activity, scene) {
  const sourceBackground = String(scene?.background?.dataUrl || scene?.background?.imageUrl || scene?.background?.imageSrc || "").trim();
  const sourcePrimary = (Array.isArray(scene?.layers) ? scene.layers : []).find((layer, index) => layer?.visible !== false && (layer?.role === "primary" || index === 0));
  const sourcePrimaryImage = String(sourcePrimary?.dataUrl || sourcePrimary?.imageUrl || sourcePrimary?.imageSrc || "").trim();
  const normalized = normalizeSimulatorVisualScene(activity, scene);
  const normalizedBackground = String(normalized.background?.dataUrl || normalized.background?.imageUrl || normalized.background?.imageSrc || "").trim();
  const normalizedPrimary = normalized.layers.find((layer, index) => layer?.visible !== false && (layer?.role === "primary" || index === 0));
  const normalizedPrimaryImage = String(normalizedPrimary?.dataUrl || normalizedPrimary?.imageUrl || normalizedPrimary?.imageSrc || "").trim();
  let changed = sourceBackground !== normalizedBackground || sourcePrimaryImage !== normalizedPrimaryImage;
  for (const layer of normalized.layers) {
    const source = String(layer.dataUrl || layer.imageUrl || layer.imageSrc || "").trim();
    if (layer.cutoutVersion >= 5 || !source) continue;
    const greenSubject = /plant|hoja|clorofil|verde|alga|bosque|ecosistem/i.test(`${layer.label} ${layer.prompt}`);
    try {
      Object.assign(layer, await removeSimulatorLayerBackground(source, greenSubject ? "magenta" : "green", { strict: isLinearTranslationScene(activity, layer) }));
      layer.cutoutVersion = 5;
      changed = true;
    } catch (error) {
      console.warn(`[ScienceActivities] No fue posible reparar el recorte de ${layer.label}:`, error);
    }
  }
  return { scene: normalizeSimulatorVisualScene(activity, normalized), changed };
}

async function generateSimulatorImage(prompt, { aspectRatio = "1:1", imageSize = "1K" } = {}) {
  const model = "gemini-3.1-flash-image";
  const result = await generateImagesOnDemand({ mode: "generate", prompt, options: { model, aspectRatio, imageSize, count: 1 }, attachments: [] });
  if (result?.[0]?.dataUrl) return result[0].dataUrl;
  throw new Error("Gemini no devolvió una imagen.");
}

async function prepareSimulatorVisualInspection(dataUrl) {
  const inspectionBitmap = await decodeImageSource(dataUrl);
  const inspectionMaxSide = 320;
  const inspectionScale = Math.min(1, inspectionMaxSide / Math.max(inspectionBitmap.width, inspectionBitmap.height));
  const inspectionCanvas = document.createElement("canvas");
  inspectionCanvas.width = Math.max(1, Math.round(inspectionBitmap.width * inspectionScale));
  inspectionCanvas.height = Math.max(1, Math.round(inspectionBitmap.height * inspectionScale));
  const inspectionContext = inspectionCanvas.getContext("2d", { alpha: true });
  inspectionContext.imageSmoothingEnabled = true;
  inspectionContext.imageSmoothingQuality = "high";
  inspectionContext.drawImage(inspectionBitmap, 0, 0, inspectionCanvas.width, inspectionCanvas.height);
  inspectionBitmap.close?.();
  let inspectionBlob = null;
  for (const quality of [.68, .56, .44]) {
    inspectionBlob = await new Promise((resolve, reject) => inspectionCanvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo preparar la miniatura de control visual.")), "image/webp", quality));
    if (inspectionBlob.size <= 80 * 1024) break;
  }
  if (inspectionBlob.size > 80 * 1024) {
    const compactCanvas = document.createElement("canvas");
    compactCanvas.width = Math.max(1, Math.round(inspectionCanvas.width * .7));
    compactCanvas.height = Math.max(1, Math.round(inspectionCanvas.height * .7));
    compactCanvas.getContext("2d", { alpha: true }).drawImage(inspectionCanvas, 0, 0, compactCanvas.width, compactCanvas.height);
    inspectionBlob = await new Promise((resolve, reject) => compactCanvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo compactar la miniatura de control visual.")), "image/webp", .44));
    compactCanvas.width = 1; compactCanvas.height = 1;
  }
  if (inspectionBlob.size > 96 * 1024) throw new Error("La miniatura de control visual sigue excediendo el tamaño seguro.");
  const inspectionDataUrl = await blobToDataUrl(inspectionBlob);
  inspectionCanvas.width = 1; inspectionCanvas.height = 1;
  const match = String(inspectionDataUrl || "").match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("No se pudo preparar la imagen para el control visual.");
  return { mimeType: match[1], data: match[2] };
}

async function validateSimulatorLayerIsolation(dataUrl, expectedLabel, { chromaFringeRatio = 1 } = {}) {
  const inspection = await prepareSimulatorVisualInspection(dataUrl);
  const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
    method: "POST",
    body: {
      model: $("#modelSelect")?.value || "gemini-3.1-flash",
      payload: {
        systemInstruction: { parts: [{ text: "Eres inspector visual de sprites científicos. Evalúa literalmente la imagen; no supongas ni completes elementos invisibles. Devuelve sólo JSON válido." }] },
        contents: [{ role: "user", parts: [
          { text: `El objeto esperado es: ${expectedLabel}. Acepta únicamente si existe exactamente un objeto físico completo y reconocible, sin flechas, líneas de movimiento, iconos, texto, letras, números, HUD, controles, paneles, diagramas, plataformas, paisaje, sombras separadas, objetos duplicados, piezas flotantes ni decoración ajena. El fondo transparente no cuenta como objeto. No rechaces por antialiasing subpíxel o uno o dos píxeles semitransparentes del borde; rechaza residuos de croma sólo cuando formen una franja claramente visible. Indica el problema concreto si no cumple.` },
          { inlineData: inspection }
        ] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { valid: { type: "boolean" }, issue: { type: "string" } },
            required: ["valid", "issue"]
          },
          temperature: 0
        }
      }
    }
  });
  const result = parseGeneratedJson(extractResponseText(response));
  const issue = String(result?.issue || "La imagen contiene elementos ajenos al objeto.");
  const fringeOnly = /(?:halo|fringe|borde|residuo).{0,36}(?:croma|chroma|verde|magenta)|(?:croma|chroma).{0,36}(?:halo|fringe|borde|residuo)/i.test(issue)
    && !/(?:flecha|texto|letra|número|hud|control|panel|diagrama|plataforma|paisaje|duplicad|pieza flotante|decoración|objeto adicional|incompleto)/i.test(issue);
  if (result?.valid !== true && fringeOnly && Number(chromaFringeRatio) <= .001) return { valid: true, issue: "" };
  return { valid: result?.valid === true, issue };
}

async function validateSimulatorCustomBackground(dataUrl, requestedScenario) {
  const inspection = await prepareSimulatorVisualInspection(dataUrl);
  const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
    method: "POST",
    body: {
      model: $("#modelSelect")?.value || "gemini-3.1-flash",
      payload: {
        systemInstruction: { parts: [{ text: "Eres inspector estricto de fondos para simuladores. Evalúa sólo lo visible y devuelve JSON válido." }] },
        contents: [{ role: "user", parts: [
          { text: `Solicitud literal del docente: "${requestedScenario}". Acepta únicamente si el fondo representa esa solicitud sin añadir elementos prominentes no pedidos. Para un fondo de universo, espacio, estrellas, nebulosas o galaxias, rechaza cualquier suelo, carretera, pista, pasarela, plataforma, puente, riel, edificio, habitación, laboratorio, máquina, mobiliario, objeto frontal, interfaz, texto, número, eje, recta o flecha. La necesidad de dejar espacio para la recta numérica nunca justifica construir una superficie. Explica concretamente cualquier elemento adicional.` },
          { inlineData: inspection }
        ] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { valid: { type: "boolean" }, issue: { type: "string" } },
            required: ["valid", "issue"]
          },
          temperature: 0
        }
      }
    }
  });
  const result = parseGeneratedJson(extractResponseText(response));
  return { valid: result?.valid === true, issue: String(result?.issue || "El fondo contiene elementos no solicitados.") };
}

function isGeminiQuotaExhausted(error) {
  const status = Number(error?.status || 0);
  return [429, 502, 503, 504].includes(status)
    || ["GEMINI_QUOTA_EXHAUSTED", "GEMINI_IMAGE_TEMPORARILY_UNAVAILABLE", "GEMINI_UPSTREAM_TIMEOUT"].includes(String(error?.code || "").toUpperCase())
    || /resource[_ ]exhausted|quota|too many requests|límite de generación|failed to fetch|networkerror|load failed|bad gateway|gateway timeout|upstream_timeout|no respondió a tiempo/i.test(String(error?.message || error?.detail?.error?.message || ""));
}

let simulatorGeminiQuotaBlockedUntil = 0;

function rememberSimulatorGeminiQuota(error) {
  const retryAfterMs = Math.max(1_000, Number(error?.retryAfterMs || error?.detail?.retryAfterSeconds * 1000 || 60_000));
  simulatorGeminiQuotaBlockedUntil = Math.max(simulatorGeminiQuotaBlockedUntil, Date.now() + Math.min(retryAfterMs, 5 * 60_000));
  return simulatorGeminiQuotaBlockedUntil - Date.now();
}

function simulatorQuotaWarning(error) {
  const seconds = Math.max(1, Math.ceil(Number(error?.retryAfterMs || 60_000) / 1000));
  return `Gemini no está disponible temporalmente o alcanzó su cuota. El simulador usará su escena local o programática de respaldo y conservará lo ya generado; intenta regenerar en aproximadamente ${seconds} segundos.`;
}

function latestSimulatorQuotaWarning(scene) {
  return [...(scene?.generationWarnings || [])].reverse().find((warning) => /gemini no está disponible temporalmente|cuota de imágenes gemini/i.test(String(warning || ""))) || "";
}

async function planSimulatorVisualScene(activity) {
  updateSimulatorVisualGenerationStatus("Planificando escena…");
  const controlList = (activity.controls || []).map((control) => `${control.id} (${control.label}, ${control.unit || "sin unidad"})`).join("; ");
  const visualSelection = normalizeSimulatorVisualSelection(activity, activity.simulatorVisualSelection);
  if (visualSelection.modelKey === "number-line") {
    return normalizeSimulatorVisualScene(activity, {
      version: SIMULATOR_VISUAL_SCENE_VERSION,
      status: "fallback",
      selectionKey: simulatorVisualSelectionKey(activity, visualSelection),
      background: { prompt: visualSelection.scenarioPrompt, alt: visualSelection.scenarioLabel },
      layers: [],
      generationWarnings: []
    });
  }
  const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
    method: "POST",
    body: {
      model: $("#modelSelect")?.value || "gemini-3.1-flash",
      payload: {
        systemInstruction: { parts: [{ text: "Eres director de arte científico y diseñador de animación 2D. Devuelve JSON válido. La precisión científica es obligatoria y toda animación debe representar la relación indicada por los datos." }] },
        contents: [{ role: "user", parts: [{ text: [
          `Diseña la escena visual de un simulador de ${SUBJECT_LABELS[activity.subject] || activity.subject} sobre ${activity.topic}.`,
          `Principio: ${activity.scientificPrinciple}. Fórmula: ${activity.simulator?.formula || "no indicada"}. Modelo: ${activity.simulator?.modelId || activity.simulationType}. Variables: ${controlList}.`,
          `Elección explícita del docente: escenario "${visualSelection.scenarioLabel}" (${visualSelection.scenarioPrompt}); objeto principal "${visualSelection.objectLabel}" (${visualSelection.objectPrompt}). Respeta exactamente ambas elecciones.`,
          `Dirección artística obligatoria: ${VISUAL_STYLE_DIRECTIONS[activity.visualStyle] || VISUAL_STYLE_DIRECTIONS["tech-minimal"]}.`,
          "Crea un fondo 16:9 contextual sin personas, texto, UI, fórmulas, marcas de agua ni el objeto principal; deja una zona central despejada para superponer los elementos.",
          "Propón entre 1 y 5 elementos científicos aislables. La primera capa debe ser el fenómeno u objeto principal. No dupliques objetos ni inventes anatomía, aparatos, materiales o relaciones.",
          "driver debe ser time, control:<id real> o measurement:<propiedad calculada>. Usa sólo los motionPreset permitidos por el esquema. anchorX/anchorY son proporciones 0..1, depth 1..20 y scale 0.08..0.75.",
          "Los prompts de capas deben describir un solo elemento completo, centrado, sin texto, sin escenario, sin sombra proyectada y con silueta clara."
        ].join(" ") }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SIMULATOR_VISUAL_PLAN_SCHEMA, temperature: .48 }
      }
    }
  });
  const plan = parseGeneratedJson(extractResponseText(response));
  const preferredControlIds = {
    friction: ["velocity", "force", "friction"], projectile: ["power", "angle"], gravity: ["gravity", "height"], thermal: ["sourceTemperature", "thermalConductance"],
    circuit: ["voltage", "resistance"], particles: ["temperature", "particleCount"], ecosystem: ["solarEnergy", "producerCapture", "transferEfficiency"], energy: ["height", "mass"],
    fluid: ["force", "inputForce", "density"], wave: ["frequency", "amplitude"], optics: ["angle", "refractiveIndex"], atomic: ["electrons", "protons"], cell: ["nutrients", "oxygen"], math: ["x", "coefficient"], "number-line": ["movementNumerator", "startNumerator"]
  };
  const controlIds = new Set((activity.controls || []).map((control) => control.id));
  const modelKey = visualSelection.modelKey;
  const composition = simulatorCompositionContract(modelKey, activity.subject);
  const primaryDriverId = (preferredControlIds[modelKey] || []).find((id) => controlIds.has(id)) || activity.controls?.[0]?.id;
  const plannedLayers = Array.isArray(plan.layers) ? plan.layers : [];
  if (!plannedLayers[0]) plannedLayers.push({
    id: "primary-subject", label: visualSelection.objectLabel, prompt: visualSelection.objectPrompt,
    role: "primary", driver: primaryDriverId ? `control:${primaryDriverId}` : "measurement:value",
    motionPreset: composition.motionPreset || "static", anchorX: composition.anchor?.x ?? .5,
    anchorY: composition.anchor?.y ?? .55, depth: 4, scale: .28, visible: true
  });
  if (plannedLayers[0]) {
    plannedLayers[0] = {
      ...plannedLayers[0], label: visualSelection.objectLabel,
      prompt: `${visualSelection.objectPrompt}. ${plannedLayers[0].prompt || ""}`.trim(), role: "primary",
      driver: primaryDriverId ? `control:${primaryDriverId}` : "measurement:value",
      motionPreset: composition.motionPreset || plannedLayers[0].motionPreset || "pulse",
      anchorX: composition.anchor?.x ?? plannedLayers[0].anchorX,
      anchorY: composition.anchor?.y ?? plannedLayers[0].anchorY
    };
  }
  // El ecosistema general conserva un solo productor generado. La variante de
  // flujo energético completa después sus seis niveles con la cadena raster local.
  if (modelKey === "friction" || modelKey === "ecosystem") plannedLayers.splice(1);
  return normalizeSimulatorVisualScene(activity, {
    version: 1, status: "fallback", selectionKey: simulatorVisualSelectionKey(activity, visualSelection),
    background: { ...(plan.background || {}), prompt: `${visualSelection.scenarioPrompt}. ${plan.background?.prompt || ""}`.trim(), alt: visualSelection.scenarioLabel },
    layers: plannedLayers, generationWarnings: []
  });
}

async function generateSimulatorVisualSceneWithGemini(activity, options = {}) {
  const visualSelection = normalizeSimulatorVisualSelection(activity, activity.simulatorVisualSelection);
  const requestedSelectionKey = simulatorVisualSelectionKey(activity, visualSelection);
  if (visualSelection.modelKey === "addition-subtraction" || visualSelection.modelKey === "quadratic-factorization-rectangle") {
    return normalizeSimulatorVisualScene(activity, {
      version: SIMULATOR_VISUAL_SCENE_VERSION,
      status: "fallback",
      selectionKey: requestedSelectionKey,
      background: visualSelection.modelKey === "quadratic-factorization-rectangle"
        ? { prompt: "Tablero algebraico técnico-minimalista dibujado por código", alt: "Caja algebraica 2×2" }
        : { prompt: "Tablero matemático exacto", alt: "Recta numérica y fichas de enteros" },
      layers: [],
      generationWarnings: []
    });
  }
  const existing = normalizeSimulatorVisualScene(activity, activity.visualScene);
  const codeDrawnNumberLine = visualSelection.modelKey === "number-line";
  if (codeDrawnNumberLine) {
    existing.layers = [];
    existing.generationWarnings = existing.generationWarnings.filter((warning) => /^(?:Fondo:|Gemini no está disponible|No fue posible planificar la escena)/i.test(String(warning || "")));
  }
  const selectionChanged = existing.selectionKey !== requestedSelectionKey;
  const cooldownRemaining = simulatorGeminiQuotaBlockedUntil - Date.now();
  if (cooldownRemaining > 0) {
    const warnings = [...existing.generationWarnings, simulatorQuotaWarning({ retryAfterMs: cooldownRemaining })];
    const safeFallback = selectionChanged
      ? { version: 1, status: "fallback", selectionKey: "", background: { prompt: visualSelection.scenarioPrompt, alt: visualSelection.scenarioLabel }, layers: [], generationWarnings: warnings }
      : { ...existing, status: "fallback", generationWarnings: warnings };
    return normalizeSimulatorVisualScene(activity, safeFallback);
  }
  if (selectionChanged) options = { ...options, backgroundOnly: false, layerId: "", replan: true };
  let scene = existing;
  let warnings = [...existing.generationWarnings];
  try {
    if (!options.layerId && (codeDrawnNumberLine || (!options.backgroundOnly && (!existing.layers.length || options.replan)))) scene = await planSimulatorVisualScene(activity);
  } catch (error) {
    if (isGeminiQuotaExhausted(error)) rememberSimulatorGeminiQuota(error);
    warnings.push(isGeminiQuotaExhausted(error) ? simulatorQuotaWarning({ ...error, retryAfterMs: simulatorGeminiQuotaBlockedUntil - Date.now() }) : `No fue posible planificar la escena: ${error?.message || "error de Gemini"}`);
    const safeFallback = selectionChanged
      ? { version: 1, status: "fallback", selectionKey: "", background: { prompt: visualSelection.scenarioPrompt, alt: visualSelection.scenarioLabel }, layers: [], generationWarnings: warnings }
      : { ...existing, status: "fallback", generationWarnings: warnings };
    return normalizeSimulatorVisualScene(activity, safeFallback);
  }
  const composition = simulatorCompositionContract(visualSelection.modelKey, activity.subject);
  scene.selectionKey = requestedSelectionKey;
  let quotaLimited = false;
  if (!options.layerId) {
    try {
      updateSimulatorVisualGenerationStatus("Generando fondo…");
      scene.background.prompt = visualSelection.scenarioPrompt;
      scene.background.alt = visualSelection.scenarioLabel;
      const explicitScenario = visualSelection.customScenario
        ? `HIGHEST PRIORITY USER-SPECIFIED SCENARIO: create exactly "${visualSelection.customScenario}" as the environment. This is a fresh redesign; do not reuse a previous laboratory, corridor, track, room or landscape unless the user explicitly requested it.`
        : `REQUIRED SCENARIO: ${visualSelection.scenarioPrompt}`;
      const customNumberLineScenario = visualSelection.modelKey === "number-line" && Boolean(visualSelection.customScenario);
      const backgroundStyle = customNumberLineScenario
        ? `${simulatorBackgroundArtDirection(activity.visualStyle)} Apply this only as color, lighting and rendering finish; it must not add, replace or reinterpret any scene content.`
        : simulatorBackgroundArtDirection(activity.visualStyle);
      const sceneComposition = simulatorScenarioBackgroundContract(visualSelection.modelKey, composition, visualSelection.customScenario);
      const loopContract = visualSelection.modelKey === "friction" ? "HORIZONTALLY LOOPABLE PLATE: the left and right edges must match in horizon height, road height, lighting and terrain so the image can repeat seamlessly while scrolling. Keep the full road perfectly horizontal. Do not place a unique landmark, mountain peak, building, tree, pole or high-contrast feature across either vertical edge." : "";
      const layoutInstruction = customNumberLineScenario
        ? `CONTENT FIDELITY OVERRIDES THE MATHEMATICAL TOPIC. ${sceneComposition}`
        : `NON-NEGOTIABLE SCIENTIFIC DIRECTION AND ACTION PATH: ${sceneComposition} The user's environment must be reconciled with this scientifically required path and camera direction.`;
      const objectExclusion = customNumberLineScenario ? "Do not add any foreground object." : `Keep the action path unobstructed and do not duplicate ${visualSelection.objectLabel}.`;
      const baseBackgroundPrompt = `${explicitScenario} ${layoutInstruction} ${backgroundStyle}. Wide 16:9 background plate. ${loopContract} ${SIMULATOR_BACKGROUND_EXCLUSION_CONTRACT} ${objectExclusion} Scientifically accurate.`;
      let verifiedBackground = null;
      let backgroundVerificationIssue = "";
      for (let attempt = 0; attempt < (customNumberLineScenario ? 2 : 1) && !verifiedBackground; attempt++) {
        const retryInstruction = attempt
          ? `RETRY AFTER VISUAL QA FAILURE: ${backgroundVerificationIssue} Remove that unrequested content completely; preserve only "${visualSelection.customScenario}".`
          : "";
        const raw = await generateSimulatorImage(`${retryInstruction} ${baseBackgroundPrompt}`, { aspectRatio: "16:9", imageSize: "2K" });
        if (customNumberLineScenario) {
          updateSimulatorVisualGenerationStatus("Verificando fidelidad del fondo…");
          const verification = await validateSimulatorCustomBackground(raw, visualSelection.customScenario);
          if (!verification.valid) {
            backgroundVerificationIssue = verification.issue;
            continue;
          }
        }
        verifiedBackground = await optimizeSimulatorBackground(raw);
      }
      if (!verifiedBackground) throw new Error(`Control visual rechazó el fondo: ${backgroundVerificationIssue}`);
      Object.assign(scene.background, { imageUrl: "", imageSrc: "", storagePath: "" }, verifiedBackground);
    } catch (error) {
      quotaLimited = isGeminiQuotaExhausted(error);
      if (quotaLimited) rememberSimulatorGeminiQuota(error);
      warnings.push(quotaLimited ? simulatorQuotaWarning(error) : `Fondo: ${error?.message || "no generado"}`);
    }
  }
  const targets = options.backgroundOnly || quotaLimited ? [] : scene.layers.filter((layer) => !options.layerId || layer.id === options.layerId);
  for (let index = 0; index < targets.length; index++) {
    const layer = targets[index], greenSubject = /plant|hoja|clorofil|verde|alga|bosque|ecosistem/i.test(`${layer.label} ${layer.prompt}`), chroma = greenSubject ? "magenta" : "green", color = chroma === "magenta" ? "#FF00FF magenta" : "#00FF00 green";
    try {
      updateSimulatorVisualGenerationStatus(`Generando elemento ${index + 1}/${targets.length}…`);
      const isPrimary = layer.role === "primary" || layer === scene.layers[0];
      const subjectPrompt = isPrimary ? `${visualSelection.objectPrompt}. ${composition.object}.` : layer.prompt;
      if (isPrimary) {
        layer.label = visualSelection.objectLabel;
        layer.prompt = visualSelection.objectPrompt;
      }
      const requestedObject = isPrimary
        ? visualSelection.customObject || visualSelection.objectLabel
        : String(layer.label || layer.prompt || `Elemento ${index + 1}`).trim();
      const objectIdentity = isPrimary
        ? `THE ONLY FOREGROUND SUBJECT IS EXACTLY ONE COMPLETE ${requestedObject}. It must be immediately recognizable as ${requestedObject}; never replace it with a machine, control panel, robot, abstract device or generic futuristic prop.`
        : `THE ONLY FOREGROUND SUBJECT IS EXACTLY ONE COMPLETE ${requestedObject}. It must represent ${layer.prompt || requestedObject} as one concrete, recognizable physical subject.`;
      const isolatedObjectPrompt = `${objectIdentity} Required view: ${isPrimary ? composition.object : layer.prompt}. Art finish only: ${simulatorObjectArtDirection(activity.visualStyle)}. This is a clean catalog-style single-object cutout source, NOT a scene, NOT an infographic and NOT an interface. Show only the physical subject itself. Do not illustrate its purpose, movement, velocity, force, direction, measurements or scientific formula. ABSOLUTELY NO arrows, motion trails, speed lines, icons, diagrams, charts, gauges, screens, controls, buttons, cables, labels, letters, numbers, formulas, HUD, UI, panels, frames, platforms, scenery, floor, shadows, reflections, secondary props, duplicate objects, detached decorative shapes or floating graphics. The subject must be centered, fully visible, uncropped and occupy 65–80% of the canvas. Keep at least 10% of perfectly empty chroma space around every side of the subject. Outside the exact physical silhouette of the single requested subject, every pixel must be the same perfectly flat solid ${color} chroma reaching all four edges.`;
      let verifiedLayer = null;
      let verificationIssue = "";
      for (let attempt = 0; attempt < 2 && !verifiedLayer; attempt++) {
        const retryInstruction = attempt ? `RETRY AFTER VISUAL QA FAILURE: ${verificationIssue} Correct that exact defect. ` : "";
        const raw = await generateSimulatorImage(`${retryInstruction}${isolatedObjectPrompt}`, { aspectRatio: "1:1", imageSize: "1K" });
        const cutout = await removeSimulatorLayerBackground(raw, chroma, { strict: isLinearTranslationScene(activity, layer) });
        const verification = await validateSimulatorLayerIsolation(cutout.dataUrl, requestedObject, { chromaFringeRatio: cutout.chromaFringeRatio });
        if (verification.valid) verifiedLayer = cutout;
        else verificationIssue = verification.issue;
      }
      if (!verifiedLayer) throw new Error(`Control visual rechazó la imagen: ${verificationIssue}`);
      Object.assign(layer, verifiedLayer);
      layer.cutoutVersion = 5;
      warnings = warnings.filter((warning) => !String(warning).startsWith(`${layer.label}:`));
    } catch (error) {
      quotaLimited = isGeminiQuotaExhausted(error);
      if (quotaLimited) rememberSimulatorGeminiQuota(error);
      warnings.push(quotaLimited ? simulatorQuotaWarning(error) : `${layer.label}: ${error?.message || "no generado"}`);
      layer.dataUrl = "";
      if (quotaLimited) break;
    }
  }
  updateSimulatorVisualGenerationStatus("Optimizando escena…");
  scene.generationWarnings = warnings.slice(-12);
  const estimatedBytes = Math.round((String(scene.background.dataUrl || "").length + scene.layers.reduce((sum, layer) => sum + String(layer.dataUrl || "").length, 0)) * .75);
  if (estimatedBytes > SIMULATOR_VISUAL_BUDGET_BYTES) scene.generationWarnings.push("La escena supera el presupuesto recomendado de 10 MB; se conservaron las capas principales.");
  return normalizeSimulatorVisualScene(activity, scene);
}

async function prepareSanitizedActivityImages(activity) {
  const cloudActivity = structuredClone(activity);
  const levels = cloudActivity.learningGuide?.levels || [];
  const images = [];
  await Promise.all(levels.map(async (level, index) => {
    const source = String(level.imageDataUrl || level.imageUrl || "").trim();
    if (!source) return;
    if (/^https:\/\//i.test(source) && level.storagePath) {
      level.imageUrl = source;
      level.imageDataUrl = source;
      return;
    }
    if (!/^(data:image\/|blob:)/i.test(source)) return;
    const cleanImage = await sanitizeAndResizeImage(source, 1280);
    images.push({
      assetType: "levelImage",
      levelIndex: index,
      dataBase64: await blobToBase64(cleanImage.blob),
      contentType: cleanImage.contentType,
      width: cleanImage.width,
      height: cleanImage.height
    });
    level.imageDataUrl = "";
    level.imageUrl = "";
  }));
  await Promise.all((cloudActivity.assessments || []).map(async (assessment, questionIndex) => {
    if (assessment.type !== "image-multiple") return;
    const source = String(assessment.visual?.imageDataUrl || assessment.visual?.imageUrl || assessment.visual?.imageSrc || "").trim();
    if (!source) return;
    if (/^https:\/\//i.test(source) && assessment.visual?.storagePath) {
      assessment.visual.imageUrl = source;
      assessment.visual.imageDataUrl = source;
      return;
    }
    if (!/^(data:image\/|blob:)/i.test(source)) return;
    const cleanImage = await sanitizeAndResizeImage(source, 1280);
    images.push({
      assetType: "questionImage", questionIndex,
      dataBase64: await blobToBase64(cleanImage.blob),
      contentType: cleanImage.contentType, width: cleanImage.width, height: cleanImage.height
    });
    assessment.visual.imageDataUrl = "";
    assessment.visual.imageUrl = "";
  }));
  const playerSource = String(cloudActivity.playerSprite?.dataUrl || "").trim();
  if (/^(data:image\/|blob:)/i.test(playerSource)) {
    const cleanSprite = await sanitizeAndResizeImage(playerSource, 1536);
    images.push({
      levelIndex: -1,
      assetType: "playerSprite",
      dataBase64: await blobToBase64(cleanSprite.blob),
      contentType: cleanSprite.contentType,
      width: cleanSprite.width,
      height: cleanSprite.height
    });
    cloudActivity.playerSprite.dataUrl = "";
  }
  const visualScene = normalizeSimulatorVisualScene(cloudActivity, cloudActivity.visualScene);
  cloudActivity.visualScene = visualScene;
  const backgroundSource = String(visualScene.background.dataUrl || visualScene.background.imageUrl || "").trim();
  if (/^https:\/\//i.test(backgroundSource) && visualScene.background.storagePath) {
    visualScene.background.imageUrl = backgroundSource;
  } else if (/^(data:image\/|blob:)/i.test(backgroundSource)) {
    const cleanBackground = await sanitizeAndResizeImage(backgroundSource, 1600);
    images.push({ assetType: "simulatorBackground", dataBase64: await blobToBase64(cleanBackground.blob), contentType: cleanBackground.contentType, width: cleanBackground.width, height: cleanBackground.height });
    visualScene.background.dataUrl = "";
    visualScene.background.imageUrl = "";
  }
  await Promise.all(visualScene.layers.map(async (layer, layerIndex) => {
    const source = String(layer.dataUrl || layer.imageUrl || "").trim();
    if (/^https:\/\//i.test(source) && layer.storagePath) { layer.imageUrl = source; return; }
    if (!/^(data:image\/|blob:)/i.test(source)) return;
    const cleanLayer = await sanitizeAndResizeImage(source, Math.min(768, Math.max(128, Number(layer.width) || 768)), { losslessAlpha: true });
    images.push({ assetType: "simulatorLayer", layerIndex, dataBase64: await blobToBase64(cleanLayer.blob), contentType: cleanLayer.contentType, width: cleanLayer.width, height: cleanLayer.height });
    layer.dataUrl = "";
    layer.imageUrl = "";
  }));
  return { cloudActivity, images };
}

function persistSessionsWithinQuota(sessions) {
  const sessionIndex = sessions.slice(0, 50).map((session) => ({
    id: session.id,
    firebaseDocId: session.firebaseDocId || null,
    savedAt: session.savedAt || "",
    indexedDbOnly: true,
    title: String(session.title || "Sesión sin título"),
    subject: session.subject || "",
    topic: session.topic || "",
    gameMode: normalizedSessionMode(session.gameMode)
  }));
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionIndex));
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible guardar el índice ligero de sesiones:", error);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }
  return sessions;
}

async function performProjectSave({ silent = false } = {}) {
  syncEditorToActivity();
  state.activity.gameProgress = state.activity.gameMode === "game"
    ? structuredClone(state.gameProgress || null)
    : null;
  const activitySnapshot = structuredClone(state.activity);
  const savingSessionId = String(state.activeSessionId || "");
  persistLocalDraft();
  const existing = state.sessions.find((item) => String(item.id) === savingSessionId);
  const session = {
    id: existing?.id || savingSessionId || crypto.randomUUID(),
    firebaseDocId: existing?.firebaseDocId || crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    bodySavedAt: "",
    remoteSavedAt: existing?.remoteSavedAt || "",
    remoteAvailable: Boolean(existing?.remoteAvailable),
    syncState: "pending",
    title: String(activitySnapshot.title || "Sesión sin título"),
    subject: String(activitySnapshot.subject || ""),
    topic: String(activitySnapshot.topic || ""),
    gameMode: normalizedSessionMode(activitySnapshot.gameMode)
  };
  session.bodySavedAt = session.savedAt;
  const existingIndex = state.sessions.findIndex((item) => String(item.id) === String(session.id));
  if (existingIndex >= 0) state.sessions[existingIndex] = session;
  else state.sessions.unshift(session);
  state.activeSessionId = session.id;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(session.id));
  try {
    persistSessionsWithinQuota(state.sessions);
    await persistSessionMetadata(session);
    await persistSessionBody(session, activitySnapshot);
    renderSessions();
    setProjectSaveStatus("Guardando…", "saving");
    if (!silent) showToast("Actividad guardada localmente. Sincronizando con Firebase…");
  } catch (error) {
    console.warn("[ScienceActivities] No fue posible guardar la sesión:", error);
    setProjectSaveStatus("Error al guardar", "error");
    showToast("El navegador no tiene espacio para guardar. Exporta el proyecto como ZIP.");
    return;
  }

  const auth = await getScienceAuth({ ready: true });
  if (!auth.currentUser) {
    session.syncState = "local";
    await persistSessionMetadata(session);
    setProjectSaveStatus("Guardado local", "saved");
    if (!silent) showToast("Actividad guardada localmente.");
    return;
  }

  try {
    if (!silent) showToast("Limpiando metadatos, ajustando imágenes y subiendo a Firebase Storage…");
    const prepared = await prepareSanitizedActivityImages(activitySnapshot);
    const response = await authFetchJson("/api/science-activities/save", {
      sameOrigin: true,
      method: "POST",
      body: {
        firebaseDocId: session.firebaseDocId,
        localId: String(session.id),
        savedAt: session.savedAt,
        activity: prepared.cloudActivity,
        images: prepared.images
      }
    });
    const savedActivity = response.activity || prepared.cloudActivity;
    session.firebaseDocId = response.firebaseDocId || session.firebaseDocId;
    session.remoteAvailable = true;
    session.remoteSavedAt = session.savedAt;
    session.bodySavedAt = session.savedAt;
    session.syncState = "saved";
    session.title = String(savedActivity.title || session.title);
    session.subject = String(savedActivity.subject || session.subject);
    session.topic = String(savedActivity.topic || session.topic);
    session.gameMode = normalizedSessionMode(savedActivity.gameMode);
    if (String(state.activeSessionId) === String(session.id)) {
      state.activity = savedActivity;
    }
    const localSessionIndex = state.sessions.findIndex((item) => item.id === session.id);
    if (localSessionIndex >= 0) state.sessions[localSessionIndex] = session;
    persistSessionsWithinQuota(state.sessions);
    await persistSessionMetadata(session);
    await persistSessionBody(session, createStorageSafeActivity(savedActivity));
    await persistOfflineDraft(session.id, savedActivity, session.savedAt);
    renderSessions();
    setProjectSaveStatus("Guardado", "saved");
    if (!silent) showToast("Actividad guardada localmente y sincronizada con Firebase.");
  } catch (error) {
    console.error("[ScienceActivities] Error al guardar en Firebase:", error);
    setProjectSaveStatus("Guardado local · sincronización pendiente", "pending");
    showToast("Se guardó localmente, pero Firebase no pudo sincronizar.");
  }
}

async function saveProject(options = {}) {
  const request = options instanceof Event ? { silent: false, reason: "manual" } : { silent: options?.silent === true, reason: options?.reason || "manual" };
  if (projectSaveInFlight) {
    pendingProjectSave = { silent: Boolean(pendingProjectSave?.silent && request.silent), reason: request.reason };
    return projectSaveInFlight;
  }
  projectSaveInFlight = performProjectSave(request);
  try {
    await projectSaveInFlight;
  } finally {
    projectSaveInFlight = null;
    if (pendingProjectSave) {
      const next = pendingProjectSave;
      pendingProjectSave = null;
      void saveProject(next);
    }
  }
}

function autosaveProject(reason) {
  if (state.generating || !isGeneratedScienceActivity(state.activity)) return Promise.resolve();
  return saveProject({ silent: true, reason });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function slugify(value) {
  return String(value || "science-activity").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "science-activity";
}

const EXPORTED_CSS = `
:root{--bg:#10151f;--panel:#18222e;--line:#334153;--text:#eef6f7;--muted:#91a4ad;--lime:#c4f05c}*{box-sizing:border-box}html,body{margin:0;min-height:100%;color:var(--text);font-family:"Trebuchet MS",sans-serif;background:var(--bg)}.game-shell{width:100%;min-height:100vh;margin:0;padding:0}.game-frame{position:relative;width:100%;height:100vh;height:100svh;min-height:540px;overflow:hidden;background:#0e1721}#scienceGame,#scienceGameMount{width:100%;height:100%}#scienceGame canvas,#scienceGameMount canvas{width:100%!important;height:100%!important;object-fit:contain}body[data-science-export] .science-assessment-host>.science-rive-briefing-screen.science-micro-mission{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border-radius:0!important;box-shadow:none!important}body[data-science-export] .science-assessment-host>.science-rive-answer-deck.is-rive-only{position:absolute!important;inset:0!important;top:0!important;left:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important}.controls{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:8px}.science-control{padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.science-control-head{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:.7rem;font-weight:800}.science-control output{color:var(--lime)}.science-control input{width:100%;accent-color:var(--lime)}.science-action{min-height:58px;color:#142018;border:0;border-radius:10px;background:var(--lime);font-weight:900;cursor:pointer}.science-action.secondary{color:var(--text);border:1px solid var(--line);background:var(--panel)}@media(max-width:700px){.game-frame{min-height:480px}.controls{grid-template-columns:repeat(2,1fr)}}`;

const EXPORTED_LAYOUT_CSS = `
html,body{width:100%;min-height:100%;overflow-x:hidden!important;overflow-y:auto!important}
@media(max-width:900px),(pointer:coarse){html:is(:fullscreen, :-webkit-full-screen),html:is(:fullscreen, :-webkit-full-screen) body[data-science-export]{width:100%!important;height:auto!important;min-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}html:is(:fullscreen, :-webkit-full-screen) body[data-science-export] :is(.game-shell,.game-frame,#scienceGameMount,.science-simulator-host,.science-phaser-simulator){position:relative!important;inset:auto!important;height:auto!important;min-height:100dvh!important;max-height:none!important;overflow:visible!important;touch-action:pan-y}html:is(:fullscreen, :-webkit-full-screen) body[data-science-export] .science-sim-controls input[type="range"]{touch-action:pan-y}}
body[data-science-export] .game-shell,body[data-science-export] .game-frame,body[data-science-export] #scienceGameMount{width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;max-height:none!important;overflow:visible!important}
body[data-science-export] #scienceGameMount.science-assessment-host{position:relative!important;display:block!important}
body[data-science-export] #scienceGameMount>.science-rive-briefing-screen.science-micro-mission{position:relative!important;inset:auto!important;width:100%!important;min-width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border-radius:0!important;overflow:visible!important;box-shadow:none!important}
body[data-science-export] #scienceGameMount>.science-rive-answer-deck.is-rive-only{position:relative!important;inset:auto!important;top:auto!important;left:auto!important;width:100%!important;min-width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:clamp(16px,4vw,54px)!important;display:grid!important;align-content:safe center!important;overflow:visible!important;transform:none!important}
body[data-science-export] #scienceGameMount>.science-rive-answer-deck.is-rive-only.is-matching-question{width:100%!important;min-width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;overflow:visible!important}
body[data-science-export] #scienceGameMount>.science-structured-game{position:relative!important;inset:auto!important;width:100%!important;min-width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;max-width:none!important;max-height:none!important;margin:0!important;overflow:visible!important}
body[data-science-export] #scienceGameMount>.science-assessment-layer.is-result{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;padding:clamp(16px,3vw,34px)!important;display:grid!important;place-items:center!important;overflow:visible!important;background:transparent!important}
body[data-science-export] .science-rive-result-screen{position:relative!important;inset:auto!important;display:block!important;width:100%!important;min-width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;max-width:none!important;max-height:none!important;margin:0!important;border-radius:0!important;overflow:visible!important;box-shadow:none!important}
body[data-science-export] .science-rive-result-content{width:100%!important;height:auto!important;min-height:100vh!important;min-height:100svh!important;max-height:none!important;padding:clamp(22px,4vw,58px)!important;display:flex!important;justify-content:safe center!important;overflow:visible!important;box-sizing:border-box!important}
body[data-science-export] .science-rive-result-actions{display:flex!important;flex-wrap:wrap!important;gap:12px!important;margin-top:0!important}
body[data-science-export] .science-rive-result-actions button{min-width:min(100%,220px)!important}
body[data-science-export] .science-export-fullscreen{position:fixed!important;z-index:2147483647!important;top:max(14px,env(safe-area-inset-top))!important;left:max(14px,env(safe-area-inset-left))!important;right:auto!important;min-width:48px!important;min-height:48px!important;padding:9px 13px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;color:#eaffff!important;-webkit-text-fill-color:#eaffff!important;border:1px solid rgba(129,235,213,.68)!important;border-radius:4px 14px 4px 14px!important;background:linear-gradient(145deg,rgba(7,35,47,.92),rgba(11,76,79,.92))!important;box-shadow:0 10px 24px rgba(0,15,24,.3),inset 0 1px 0 rgba(255,255,255,.14)!important;backdrop-filter:blur(12px)!important;font:900 .76rem/1 var(--sa-font,system-ui,sans-serif)!important;letter-spacing:.025em!important;cursor:pointer!important;transition:transform .18s ease,box-shadow .18s ease,background .18s ease!important}
body[data-science-export] .science-export-fullscreen[hidden]{display:none!important}
body[data-science-export] .science-export-fullscreen:hover,body[data-science-export] .science-export-fullscreen:focus-visible{outline:none!important;transform:translateY(-2px)!important;background:linear-gradient(145deg,#0a5360,#0f8580)!important;box-shadow:0 16px 34px rgba(0,15,24,.4),0 0 0 4px rgba(129,235,213,.18)!important}
body[data-science-export] .science-export-fullscreen svg{width:22px!important;height:22px!important;flex:0 0 auto!important;fill:none!important;stroke:currentColor!important;stroke-width:2.2!important;stroke-linecap:round!important;stroke-linejoin:round!important}
body[data-science-export] .science-export-fullscreen .is-exit{display:none!important}
body[data-science-export] .science-export-fullscreen[aria-pressed="true"] .is-enter{display:none!important}
body[data-science-export] .science-export-fullscreen[aria-pressed="true"] .is-exit{display:block!important}
body[data-science-export]{min-height:100dvh!important}body[data-science-export][data-export-started="false"]{overflow:hidden!important}body[data-science-export][data-export-started="false"]>.game-shell{visibility:hidden!important}.science-export-start{position:fixed;z-index:2147483646;inset:0;display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:max(22px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) max(22px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left));overflow:auto;color:#f5fcff;background:radial-gradient(circle at 18% 15%,rgba(99,234,213,.22),transparent 30%),radial-gradient(circle at 82% 82%,rgba(255,159,189,.2),transparent 34%),linear-gradient(145deg,#071521,#102d3b 58%,#152334)}.science-export-start[hidden]{display:none!important}.science-export-start:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.22;background-image:linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,#000,transparent)}.science-export-start-card{position:relative;width:min(680px,100%);padding:clamp(28px,6vw,64px);border:1px solid rgba(190,244,239,.42);border-radius:34px;background:linear-gradient(155deg,rgba(11,38,52,.9),rgba(11,25,39,.82));box-shadow:0 34px 90px rgba(0,8,18,.48),inset 0 1px rgba(255,255,255,.15);backdrop-filter:blur(24px);text-align:center}.science-export-start-mark{display:grid;place-items:center;width:82px;height:82px;margin:0 auto 24px;border:1px solid rgba(255,255,255,.28);border-radius:26px;background:linear-gradient(145deg,#63ead5,#38aeca);box-shadow:0 18px 44px rgba(56,217,255,.25);color:#062331}.science-export-start-mark svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.science-export-start-card small{display:block;color:#9eeade;font:900 .75rem/1.4 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}.science-export-start-card h1{margin:12px 0 14px;color:#fff;font:950 clamp(2rem,7vw,4.2rem)/.98 system-ui,sans-serif;letter-spacing:-.055em;text-wrap:balance}.science-export-start-card p{max-width:48ch;margin:0 auto 28px;color:#c2d9e3;font:600 clamp(1rem,2.4vw,1.18rem)/1.55 system-ui,sans-serif}.science-export-start-button{display:inline-flex;align-items:center;justify-content:center;gap:12px;min-width:min(100%,310px);min-height:64px;padding:16px 26px;border:0;border-radius:18px;background:linear-gradient(115deg,#c8ff4d,#63ead5);box-shadow:0 18px 40px rgba(99,234,213,.24);color:#09252d;font:950 1.05rem/1 system-ui,sans-serif;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}.science-export-start-button:hover{transform:translateY(-3px);box-shadow:0 24px 52px rgba(99,234,213,.34)}.science-export-start-button:focus-visible{outline:4px solid #fff;outline-offset:5px}.science-export-start-card footer{margin-top:20px;color:#91abb8;font:750 .78rem/1.4 system-ui,sans-serif;letter-spacing:.04em}body[data-export-style*="kawaii"] .science-export-start{background:radial-gradient(circle at 18% 18%,rgba(255,159,189,.36),transparent 31%),radial-gradient(circle at 82% 80%,rgba(99,234,213,.3),transparent 34%),linear-gradient(145deg,#261832,#4b2952)}body[data-export-style*="kawaii"] .science-export-start-card{border-radius:48px}body[data-export-style*="kawaii"] .science-export-start-mark{border-radius:50%;background:linear-gradient(145deg,#ff9fbd,#ffd166)}body[data-export-style*="arcade"] .science-export-start{background:radial-gradient(circle at 20% 15%,rgba(255,71,198,.3),transparent 30%),linear-gradient(145deg,#080523,#141247 60%,#29104d)}body[data-export-style*="arcade"] .science-export-start-card{border-radius:8px;box-shadow:10px 10px 0 rgba(99,234,213,.28)}body[data-export-style*="arcade"] .science-export-start-button{border-radius:6px;background:linear-gradient(115deg,#ffe45c,#ff5ac8)}
body[data-science-export][data-export-started="true"] .science-export-start{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
body[data-science-export] .science-rive-matching-board{width:100%!important;max-width:1180px!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))!important}
/* Export title screen: inherits the visual language of the selected game theme. */
.science-export-start{--start-accent:#63ead5;--start-highlight:#c8ff4d;--start-panel:#0b2634;--start-line:rgba(158,234,222,.52);--start-title-color:#f4fbff;--start-card-bg:linear-gradient(110deg,rgba(11,38,52,.98) 0 58%,rgba(11,25,39,.94));place-items:stretch!important;padding:0!important;background:radial-gradient(circle at 78% 18%,color-mix(in srgb,var(--start-accent) 18%,transparent),transparent 30%),linear-gradient(145deg,#071521,#102d3b 58%,#152334)!important}
.science-export-start:before{opacity:.12!important;background-size:54px 54px!important;mask-image:linear-gradient(135deg,#000,transparent 72%)!important}
.science-export-start-card{isolation:isolate;width:100%!important;min-height:100vh!important;min-height:100dvh!important;padding:clamp(28px,6vw,84px)!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-rows:auto 1fr auto!important;align-items:center!important;gap:clamp(24px,5vh,58px)!important;border:0!important;border-radius:0!important;background:var(--start-card-bg)!important;box-shadow:none!important;backdrop-filter:none!important;text-align:left!important}
.science-export-start-card:after{content:"";position:absolute;z-index:-1;right:clamp(28px,8vw,120px);top:50%;width:min(34vw,420px);aspect-ratio:1;border:1px solid color-mix(in srgb,var(--start-accent) 42%,transparent);border-radius:50%;background:repeating-radial-gradient(circle,color-mix(in srgb,var(--start-accent) 12%,transparent) 0 2px,transparent 3px 28px);transform:translateY(-50%);opacity:.72}
.science-export-start-heading{grid-column:1/-1;display:flex!important;align-items:center!important;gap:12px!important;width:fit-content;max-width:100%;padding:8px 14px 8px 9px;border:1px solid var(--start-line);border-radius:999px;background:color-mix(in srgb,var(--start-panel) 82%,transparent)}
.science-export-start-mark{width:34px!important;height:34px!important;margin:0!important;flex:0 0 34px!important;border:0!important;border-radius:50%!important;background:var(--start-accent)!important;box-shadow:0 0 0 5px color-mix(in srgb,var(--start-accent) 15%,transparent)!important}
.science-export-start-mark svg{width:19px!important;height:19px!important;stroke-width:2!important}
.science-export-start-card small{min-width:0;color:color-mix(in srgb,var(--start-accent) 82%,white)!important;font:750 clamp(.68rem,1.3vw,.82rem)/1.35 var(--sa-font,system-ui,sans-serif)!important;letter-spacing:.11em!important}
.science-export-start-copy{grid-column:1;grid-row:2;width:min(920px,100%);max-height:min(62vh,720px);align-self:center;overflow:auto;padding-right:clamp(4px,1vw,12px)}
.science-export-start-card h1{margin:0 0 18px!important;max-width:15ch;color:#f4fbff!important;font:700 clamp(2.2rem,6vw,5.2rem)/1.02 var(--sa-font,system-ui,sans-serif)!important;letter-spacing:-.035em!important;text-wrap:balance!important}
.science-export-start-card p{max-width:44ch;margin:0!important;color:#b8d0db!important;font:500 clamp(.95rem,1.8vw,1.14rem)/1.55 var(--sa-font,system-ui,sans-serif)!important}
.science-export-experience{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:920px}.science-export-experience section{min-width:0;padding:14px;border:1px solid color-mix(in srgb,var(--start-accent) 28%,transparent);border-radius:14px;background:rgba(4,23,35,.42)}.science-export-experience p,.science-export-experience ol{max-width:none!important;margin:6px 0 0!important;color:#b8d0db!important;font:500 clamp(.86rem,1.5vw,1.02rem)/1.48 var(--sa-font,system-ui,sans-serif)!important}.science-export-experience ol{padding-left:1.25rem}.science-export-experience li+li{margin-top:6px}.science-export-experience small{margin-bottom:3px;color:var(--start-accent)!important;font-size:.62rem!important;letter-spacing:.08em!important}
.science-export-start-actions{grid-column:1;grid-row:3;display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:18px!important}
.science-export-start-button{min-width:0!important;min-height:54px!important;padding:14px 22px!important;border:1px solid color-mix(in srgb,var(--start-highlight) 72%,white)!important;border-radius:12px!important;background:var(--start-highlight)!important;box-shadow:0 10px 0 color-mix(in srgb,var(--start-accent) 38%,#071521),0 20px 36px rgba(0,10,18,.25)!important;color:#09252d!important;font:800 .98rem/1 var(--sa-font,system-ui,sans-serif)!important}
.science-export-start-button b{font-size:1.25em;font-weight:600}.science-export-start-card footer{margin:0!important;color:#91abb8!important;font:650 .75rem/1.4 var(--sa-font,system-ui,sans-serif)!important;letter-spacing:.025em!important}
.science-export-start-history{display:grid!important;gap:4px!important;min-width:0!important;min-height:54px!important;padding:12px 20px!important;color:#e9ffff!important;border:1px solid rgba(158,234,222,.62)!important;border-radius:12px!important;background:rgba(5,29,42,.72)!important;font:800 .9rem/1.15 var(--sa-font,system-ui,sans-serif)!important;cursor:pointer}.science-export-start-history[hidden]{display:none!important}.science-export-start-history small{color:#9eeade!important;font-size:.68rem!important;letter-spacing:.04em!important;text-transform:none!important}.science-export-start-history:focus-visible{outline:4px solid #fff!important;outline-offset:5px!important}
body[data-export-style*="arcade"] .science-export-start{--start-accent:#ff4e9a;--start-highlight:#ffe259;--start-panel:#100d35;--start-card-bg:linear-gradient(105deg,rgba(14,10,51,.98) 0 60%,rgba(24,12,67,.92));background:radial-gradient(circle at 82% 20%,rgba(255,78,154,.24),transparent 30%),linear-gradient(145deg,#080523,#151044 62%,#29104d)!important}
body[data-export-style*="arcade"] .science-export-start-card{background:var(--start-card-bg)!important}
body[data-export-style*="arcade"] .science-export-start-card:after{border-radius:16px!important;transform:translateY(-50%) rotate(45deg)!important;background:repeating-linear-gradient(90deg,rgba(255,226,89,.09) 0 2px,transparent 2px 30px),repeating-linear-gradient(rgba(255,78,154,.08) 0 2px,transparent 2px 30px)!important}
body[data-export-style*="arcade"] .science-export-start-heading,body[data-export-style*="arcade"] .science-export-start-button{border-radius:6px!important}
body[data-export-style*="kawaii"] .science-export-start{--start-accent:#ff9fbd;--start-highlight:#ffd166;--start-panel:#38203f;--start-card-bg:linear-gradient(105deg,rgba(67,35,75,.98) 0 60%,rgba(51,27,64,.94));background:radial-gradient(circle at 80% 18%,rgba(255,209,102,.24),transparent 28%),linear-gradient(145deg,#261832,#4b2952)!important}
body[data-export-style*="kawaii"] .science-export-start-card{background:var(--start-card-bg)!important}.science-export-start-button:hover{transform:translateY(-2px)!important}
@media(max-width:720px){.science-export-start-card{grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr) auto!important;padding:clamp(24px,7vw,42px)!important}.science-export-start-card:after{right:-28vw;width:80vw;opacity:.38}.science-export-start-copy{grid-column:1;max-height:none}.science-export-start-card h1{max-width:17ch;font-size:clamp(2rem,11vw,3.45rem)!important}.science-export-experience{grid-template-columns:1fr!important}.science-export-start-actions{display:grid!important;grid-template-columns:1fr!important;width:100%}.science-export-start-button{width:100%!important}.science-export-start-card footer{text-align:center}}
@media(orientation:portrait) and (max-width:900px){.science-export-experience{grid-template-columns:1fr!important}}
body[data-export-style*="kawaii"] .science-export-start,body[data-export-style*="pastel"] .science-export-start,body[data-export-style*="storybook"] .science-export-start{--start-title-color:#fff7fc;--start-card-bg:linear-gradient(105deg,rgba(67,35,75,.98) 0 60%,rgba(51,27,64,.94))}body[data-export-style*="arcade"] .science-export-start{--start-title-color:#fff4a8}body[data-export-style*="tech"] .science-export-start,body[data-export-style*="tokyo"] .science-export-start,body[data-export-style*="neon"] .science-export-start{--start-title-color:#effcff;--start-card-bg:linear-gradient(105deg,rgba(5,28,43,.98) 0 60%,rgba(8,18,39,.96))}body[data-export-style*="eco"] .science-export-start,body[data-export-style*="bio"] .science-export-start{--start-title-color:#efffe8;--start-card-bg:linear-gradient(105deg,rgba(14,48,40,.98) 0 60%,rgba(9,30,33,.96))}body[data-export-style*="ocean"] .science-export-start{--start-title-color:#e8fbff;--start-card-bg:linear-gradient(105deg,rgba(5,49,70,.98) 0 60%,rgba(7,27,48,.96))}
.science-export-start-card h1{color:var(--start-title-color,#f4fbff)!important;-webkit-text-fill-color:var(--start-title-color,#f4fbff)!important;opacity:1!important;text-shadow:none!important}.science-export-start-card small{color:#9eeade!important;-webkit-text-fill-color:#9eeade!important;opacity:1!important}.science-export-experience :is(p,ol,li){color:#d8eaf1!important;-webkit-text-fill-color:#d8eaf1!important;font-weight:400!important;opacity:1!important;text-shadow:none!important}.science-export-experience li::marker{color:var(--start-accent)!important}.science-export-start-card footer{color:#a8bfca!important;-webkit-text-fill-color:#a8bfca!important}
body[data-science-export] :is([data-matching-left-list],[data-matching-right-list]){width:100%!important;min-width:0!important}
body[data-science-export] :is([data-matching-left-list],[data-matching-right-list]) button{grid-template-columns:42px minmax(0,1fr)!important;min-width:0!important;color:var(--science-hud-text)!important;-webkit-text-fill-color:var(--science-hud-text)!important;background:var(--science-hud-module)!important}
body[data-science-export] :is([data-matching-left-list],[data-matching-right-list]) button :is(strong,small){min-width:0!important;color:inherit!important;-webkit-text-fill-color:currentColor!important;word-break:normal!important;overflow-wrap:break-word!important}
body[data-science-export] :is(.science-sequence-bank,.science-token-bank)>button{color:#20354a!important;-webkit-text-fill-color:#20354a!important;background:#fff!important;opacity:1!important}
body[data-science-export] :is(.science-sequence-bank,.science-token-bank)>button :is(strong,span,small,kbd){color:#20354a!important;-webkit-text-fill-color:#20354a!important;opacity:1!important}
body[data-science-export] :is(.science-sequence-bank,.science-token-bank)>button.is-used{color:#42596a!important;-webkit-text-fill-color:#42596a!important;opacity:.62!important}
body[data-science-export] .science-sequence-slots{color:#20354a!important;-webkit-text-fill-color:#20354a!important;background:linear-gradient(145deg,#f0fcfb,#fffaf1)!important}
body[data-science-export] .science-sequence-placeholder{color:#526a7d!important;-webkit-text-fill-color:#526a7d!important;background:#fff!important;opacity:1!important}
body[data-science-export] .science-sequence-slots>li:not(.science-sequence-placeholder){color:#20354a!important;-webkit-text-fill-color:#20354a!important;background:#fff!important;opacity:1!important}
body[data-science-export] .science-sequence-slots>li:not(.science-sequence-placeholder) :is(strong,span,p,small){color:inherit!important;-webkit-text-fill-color:currentColor!important;opacity:1!important}
body[data-science-export] :is(.science-equation-slots,.science-molecule-equation article,.science-structured-board){color:#20354a!important;-webkit-text-fill-color:#20354a!important}
body[data-science-export] :is(.science-equation-slots>button,.science-molecule-equation article,.science-expression input,.science-numeric-console input){color:#20354a!important;-webkit-text-fill-color:#20354a!important;background:#fff!important;opacity:1!important}
body[data-science-export] :is(.science-expression input,.science-numeric-console input)::placeholder{color:#687b87!important;-webkit-text-fill-color:#687b87!important;opacity:1!important}
body[data-science-export] :is(.science-token-bank-label,.science-sequence-workspace>small){width:max-content!important;max-width:100%!important;margin:0!important;padding:7px 11px!important;display:inline-flex!important;align-items:center!important;gap:7px!important;color:#f3fffd!important;-webkit-text-fill-color:#f3fffd!important;border:1px solid rgba(95,224,210,.46)!important;border-radius:8px!important;background:#123443!important;text-shadow:none!important;opacity:1!important}
body[data-science-export] .science-sequence-workspace>small b{color:#9ee9df!important;-webkit-text-fill-color:#9ee9df!important}
body[data-science-export] .science-structured-game.is-sequence-order :is(.science-rive-sequence-route,.science-sequence-slots){width:100%!important;max-width:none!important}
body[data-science-export] #scienceGameMount>.science-structured-game.is-fill-blank{width:100%!important;min-width:100%!important;height:100svh!important;min-height:100svh!important;margin:0!important;grid-template-rows:auto auto auto auto!important;align-content:safe center!important;overflow:auto!important}
body[data-science-export] .science-structured-game.is-fill-blank>header{width:100%!important;margin-top:0!important}
body[data-science-export] .science-structured-game.is-fill-blank .science-structured-board{width:100%!important;place-items:center!important;align-content:center!important}
body[data-science-export] .science-image-question{width:min(100%,960px)!important;margin:clamp(14px,2.5vw,24px) auto 0!important;padding:clamp(8px,1.5vw,14px)!important;overflow:hidden!important;border:1px solid var(--science-hud-border)!important;border-radius:clamp(16px,2.5vw,28px)!important;background:var(--science-hud-module)!important}
body[data-science-export] .science-image-question img{display:block!important;width:100%!important;height:auto!important;max-width:100%!important;max-height:min(52vh,620px)!important;aspect-ratio:auto!important;object-fit:contain!important;object-position:center!important;border-radius:clamp(10px,1.8vw,21px)!important}
body[data-science-export] .science-rive-answer-deck[data-question-type="image-multiple"] .science-question-stage-header :is(h2,p){white-space:normal!important;overflow:visible!important;text-overflow:clip!important;-webkit-line-clamp:unset!important}@media(max-width:700px),(max-height:720px){body[data-science-export] .science-rive-answer-deck[data-question-type="image-multiple"] .science-question-stage-header>p{display:block!important;margin-top:2px!important;font-size:clamp(.68rem,2.8vw,.78rem)!important;line-height:1.42!important}}
body[data-science-export] .science-keyword-game-input{color:#172b38!important;-webkit-text-fill-color:#172b38!important;background:#fff!important;caret-color:#172b38!important}
body[data-science-export] .science-keyword-game-input::placeholder{color:#687b87!important;-webkit-text-fill-color:#687b87!important;opacity:1!important}
body[data-science-export] .science-score-summary{width:min(100%,760px)!important;margin:clamp(18px,3vw,30px) auto!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}
body[data-science-export] .science-score-summary>div{min-width:0!important;padding:16px 10px!important;display:grid!important;gap:7px!important;text-align:center!important;border:1px solid #c9dfe7!important;border-radius:18px!important;background:#f5fafb!important}
body[data-science-export] .science-score-summary small,body[data-science-export] .science-player-rank small{color:#668091!important;-webkit-text-fill-color:#668091!important;font-size:clamp(.68rem,1.1vw,.82rem)!important;font-weight:900!important;letter-spacing:.06em!important;text-transform:uppercase!important}
body[data-science-export] .science-score-summary strong{color:#17354a!important;-webkit-text-fill-color:#17354a!important;font-size:clamp(1.15rem,2vw,1.55rem)!important}
body[data-science-export] .science-player-rank{width:fit-content!important;max-width:100%!important;margin:0 auto clamp(18px,3vw,28px)!important;padding:10px 18px 10px 10px!important;display:flex!important;align-items:center!important;gap:11px!important;border-radius:999px!important;color:#17354a!important;-webkit-text-fill-color:#17354a!important;background:linear-gradient(135deg,#fff0a8,#d9f7b4)!important}
body[data-science-export] .science-player-rank>span{width:38px!important;height:38px!important;display:grid!important;place-items:center!important;border-radius:50%!important;color:#d99b0b!important;-webkit-text-fill-color:#d99b0b!important;background:#fff!important}
body[data-science-export] .science-player-rank>span svg{width:25px!important;height:25px!important;display:block!important;fill:#e2a916!important;stroke:#765400!important;stroke-width:1.2!important}
body[data-science-export] .science-player-rank>div{display:grid!important;text-align:left!important}
body[data-science-export] .science-level-stars{display:flex!important;justify-content:center!important;gap:10px!important;font-size:clamp(2rem,4vw,3rem)!important}
body[data-science-export] .science-level-stars span{color:#cad5d9!important;-webkit-text-fill-color:#cad5d9!important;filter:grayscale(1)!important;opacity:.48!important}
body[data-science-export] .science-level-stars span.is-active{color:#baf34f!important;-webkit-text-fill-color:#baf34f!important;filter:none!important;opacity:1!important}
body[data-science-export] .science-completion-actions{justify-content:center!important}
body[data-science-export] .science-completion-actions .science-share-result{color:#25324d!important;-webkit-text-fill-color:#25324d!important;background:linear-gradient(105deg,#c9f36c,#8ee5cb)!important}
body[data-science-export] .science-level-complete-card{width:min(100%,1040px)!important;margin:auto!important;text-align:center!important}
body[data-science-export] .science-multiple-answer-check{display:block!important;width:min(100%,420px)!important;margin:20px auto 0!important}
body[data-science-export] .science-rive-answer-list.is-multiple-select .science-rive-answer-card.is-selected{border-color:#baf34f!important;box-shadow:0 0 0 4px rgba(186,243,79,.2)!important}
body[data-science-export] :is(.science-rive-briefing-screen>*,.science-question-stage-header>*,.science-rive-answer-heading,.science-image-question,.science-rive-matching-column,.science-structured-game>header,.science-structured-board,.science-structured-evidence,.science-rive-result-content>*,.science-level-complete-card>*){animation:scienceExportEnter .58s cubic-bezier(.2,.78,.25,1) both}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button){transform-origin:50% 100%;animation:scienceExportSprout .72s cubic-bezier(.18,.89,.32,1.28) both}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div):nth-child(1){animation-delay:.08s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div):nth-child(2){animation-delay:.14s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div):nth-child(3){animation-delay:.2s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div):nth-child(4){animation-delay:.26s}
body[data-science-export] :is(.science-concept-grid>*,.science-result-actions>button):nth-child(1){animation-delay:.08s}
body[data-science-export] :is(.science-concept-grid>*,.science-result-actions>button):nth-child(2){animation-delay:.14s}
body[data-science-export] :is(.science-concept-grid>*,.science-result-actions>button):nth-child(3){animation-delay:.2s}
body[data-science-export] :is(.science-concept-grid>*,.science-result-actions>button):nth-child(4){animation-delay:.26s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(5){animation-delay:.32s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(6){animation-delay:.38s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(7){animation-delay:.44s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(8){animation-delay:.5s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(9){animation-delay:.56s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(10){animation-delay:.62s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(11){animation-delay:.68s}
body[data-science-export] :is(.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button):nth-child(12){animation-delay:.74s}
body[data-science-export] .science-rive-result-content>*:nth-child(2),body[data-science-export] .science-level-complete-card>*:nth-child(2){animation-delay:.08s}
body[data-science-export] .science-rive-result-content>*:nth-child(3),body[data-science-export] .science-level-complete-card>*:nth-child(3){animation-delay:.14s}
body[data-science-export] .science-rive-result-content>*:nth-child(4),body[data-science-export] .science-level-complete-card>*:nth-child(4){animation-delay:.2s}
body[data-science-export] .science-rive-result-content>*:nth-child(n+5),body[data-science-export] .science-level-complete-card>*:nth-child(n+5){animation-delay:.26s}
body[data-science-export] :is(.science-multiple-answer-check,.science-rive-matching-actions [data-matching-check],.science-structured-game>footer button){transform-origin:50% 100%;animation:scienceExportSprout .72s .34s cubic-bezier(.18,.89,.32,1.28) both}
@keyframes scienceExportEnter{from{opacity:0;transform:translateY(22px) scale(.985);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}
@keyframes scienceExportSprout{0%{opacity:0;transform:translateY(44px) scale(.18,.08) rotate(-2deg);filter:blur(7px);clip-path:inset(82% 8% 0 8% round 28px)}52%{opacity:1;transform:translateY(-7px) scale(1.045,.96) rotate(.5deg);filter:blur(0);clip-path:inset(0 0 0 0 round 0)}74%{transform:translateY(3px) scale(.985,1.025) rotate(0)}100%{opacity:1;transform:translateY(0) scale(1);filter:none;clip-path:inset(0 0 0 0 round 0)}}
@media(prefers-reduced-motion:reduce){body[data-science-export] :is(.science-rive-briefing-screen>*,.science-question-stage-header>*,.science-rive-answer-heading,.science-image-question,.science-rive-matching-column,.science-structured-game>header,.science-structured-board,.science-structured-evidence,.science-rive-result-content>*,.science-level-complete-card>*,.science-rive-answer-card,.science-rive-matching-column button,.science-token-bank>button,.science-sequence-bank>button,.science-score-summary>div,.science-concept-grid>*,.science-result-actions>button,.science-multiple-answer-check,.science-rive-matching-actions [data-matching-check],.science-structured-game>footer button){animation:none!important}.science-export-start-button{transition:none!important}}
@media(max-width:640px){body[data-science-export] #scienceGameMount>.science-rive-answer-deck.is-rive-only{padding:14px!important;align-content:safe center!important}body[data-science-export] .science-rive-result-content{padding:22px 16px 30px!important;justify-content:safe center!important}body[data-science-export] .science-rive-result-actions{display:grid!important;grid-template-columns:1fr!important}body[data-science-export] .science-rive-result-actions button{width:100%!important}body[data-science-export] .science-export-fullscreen{width:48px!important;min-width:48px!important;height:48px!important;min-height:48px!important;padding:0!important}body[data-science-export] .science-export-fullscreen span{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}}
@media(max-width:640px){body[data-science-export] .science-score-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}body[data-science-export] .science-player-rank{border-radius:22px!important}}
/* Final standalone simulator boundary: this is intentionally last in the ZIP. */
@media(min-width:901px){
body[data-science-export] #scienceGameMount>.science-phaser-simulator{--science-sim-safe-x:clamp(28px,3.5vw,58px);--science-sim-safe-y:clamp(30px,4vh,62px);position:relative!important;inset:auto!important;gap:12px!important;width:100%!important;min-height:100dvh!important;height:auto!important;padding:max(var(--science-sim-safe-y),env(safe-area-inset-top)) max(var(--science-sim-safe-x),env(safe-area-inset-right)) max(var(--science-sim-safe-y),env(safe-area-inset-bottom)) max(var(--science-sim-safe-x),env(safe-area-inset-left))!important;justify-content:safe center!important;overflow:visible!important}
body[data-science-export] #scienceGameMount .science-sim-header{align-items:flex-start!important;gap:12px!important}
body[data-science-export] #scienceGameMount .science-sim-status{align-self:flex-start!important;width:max-content!important;min-width:0!important;min-height:34px!important;height:34px!important;padding:6px 10px!important;line-height:1!important;white-space:nowrap!important}
body[data-science-export] #scienceGameMount .science-sim-grid{flex:0 0 auto!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;align-items:stretch!important}
body[data-science-export] #scienceGameMount .science-sim-viewport{width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:16/9!important;align-self:start!important}
body[data-science-export] #scienceGameMount .science-sim-telemetry{height:100%!important;min-height:0!important;max-height:none!important;aspect-ratio:auto!important}
body[data-science-export] #scienceGameMount .science-sim-telemetry{padding:clamp(12px,1.25vw,18px)!important}
body[data-science-export] #scienceGameMount .science-sim-telemetry>strong{margin:8px 0 2px!important;font-size:clamp(1.8rem,2.8vw,3rem)!important}
body[data-science-export] #scienceGameMount .science-sim-telemetry>code{margin-top:9px!important;padding:8px 10px!important}
body[data-science-export] #scienceGameMount .science-sim-objective{padding-top:9px!important}
body[data-science-export] #scienceGameMount .science-sim-controls{gap:7px!important}
body[data-science-export] #scienceGameMount .science-sim-controls label{padding:7px 11px!important}
body[data-science-export] #scienceGameMount .science-sim-controls label>span{margin-bottom:4px!important}
body[data-science-export] #scienceGameMount .science-sim-actions button{min-height:38px!important;padding:6px 14px!important}
}
@media(max-width:900px){body[data-science-export] #scienceGameMount>.science-phaser-simulator{--science-sim-safe-x:clamp(18px,4.5vw,30px);--science-sim-safe-y:clamp(22px,4vh,38px);justify-content:flex-start!important}body[data-science-export] #scienceGameMount .science-sim-viewport{width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:16/9!important}body[data-science-export] #scienceGameMount .science-sim-telemetry{height:auto!important;min-height:300px!important;aspect-ratio:auto!important}}
@container(max-width:900px){body[data-science-export] #scienceGameMount .science-sim-grid{width:100%!important;grid-template-columns:minmax(0,1fr)!important;grid-template-areas:"viewport" "telemetry"!important}body[data-science-export] #scienceGameMount .science-sim-viewport{grid-area:viewport;width:100%!important;min-width:0!important;max-width:none!important;justify-self:stretch!important}body[data-science-export] #scienceGameMount .science-sim-telemetry{grid-area:telemetry;width:100%!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:300px!important;justify-self:stretch!important;aspect-ratio:auto!important}body[data-science-export] #scienceGameMount .science-phaser-simulator[data-simulator-model="number-line"] .science-sim-controls{width:100%!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}body[data-science-export] #scienceGameMount .science-phaser-simulator[data-simulator-model="number-line"] .science-sim-control{width:100%!important;min-width:0!important;box-sizing:border-box!important}body[data-science-export] #scienceGameMount .science-phaser-simulator[data-simulator-model="number-line"] .science-sim-actions{width:100%!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}body[data-science-export] #scienceGameMount .science-phaser-simulator[data-simulator-model="number-line"] .science-sim-actions button{width:100%!important;max-width:none!important;box-sizing:border-box!important}}
@container(max-width:560px){body[data-science-export] #scienceGameMount .science-sim-header{display:grid!important;grid-template-columns:minmax(0,1fr)!important;align-items:start!important}body[data-science-export] #scienceGameMount .science-sim-status{justify-self:start!important}body[data-science-export] #scienceGameMount .science-phaser-simulator[data-simulator-model="number-line"] .science-sim-controls{grid-template-columns:minmax(0,1fr)!important}body[data-science-export] #scienceGameMount .science-phaser-simulator[data-simulator-model="number-line"] .science-sim-actions{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:900px),(pointer:coarse){html:is(:fullscreen, :-webkit-full-screen),html:is(:fullscreen, :-webkit-full-screen) body[data-science-export]{height:auto!important;min-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}html:is(:fullscreen, :-webkit-full-screen) body[data-science-export] :is(.game-shell,.game-frame,#scienceGameMount,.science-simulator-host,#scienceGameMount>.science-phaser-simulator){position:relative!important;inset:auto!important;height:auto!important;min-height:100dvh!important;max-height:none!important;overflow:visible!important;touch-action:pan-y}html:is(:fullscreen, :-webkit-full-screen) body[data-science-export] .science-sim-controls input[type="range"]{touch-action:pan-y}}
body[data-science-export] .science-export-fullscreen{position:fixed!important;z-index:2147483647!important;top:max(14px,env(safe-area-inset-top))!important;left:max(14px,env(safe-area-inset-left))!important;right:auto!important;bottom:auto!important;margin:0!important}
@media(max-width:780px),(pointer:coarse){body[data-science-export]{overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:auto!important;-webkit-overflow-scrolling:touch;touch-action:pan-y!important}body[data-science-export] #scienceGameMount>.science-rive-briefing-screen.science-micro-mission{position:relative!important;inset:auto!important;height:auto!important;min-height:100svh!important;max-height:none!important;padding-top:env(safe-area-inset-top)!important;overflow:visible!important}body[data-science-export] #scienceGameMount>.science-rive-briefing-screen.science-micro-mission .science-micro-visual{width:100%!important;height:min(72svh,133vw)!important;min-height:300px!important;max-height:760px!important;display:grid!important;place-items:center!important;overflow:hidden!important}body[data-science-export] #scienceGameMount>.science-rive-briefing-screen.science-micro-mission .science-micro-visual :is(.sa-level-hero,.science-level-hero){position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:contain!important;object-position:center center!important}body[data-science-export] #scienceGameMount>.science-rive-briefing-screen.science-micro-mission .science-micro-content{height:auto!important;overflow:visible!important;justify-content:flex-start!important;padding-bottom:max(28px,env(safe-area-inset-bottom))!important}}
`;

function buildExportStartGate(activity) {
  const content = resolveStartScreenContent(activity);
  const learningStatements = parseExpectedLearningStatements(content.expectedLearnings);
  const learningMarkup = learningStatements.length
    ? `<ol>${learningStatements.map((statement) => `<li>${escapeHtml(statement)}</li>`).join("")}</ol>`
    : `<p>${escapeHtml(`Comprender y aplicar ${activity.topic || "el tema seleccionado"}.`)}</p>`;
  const historyButton = activity.gameMode === "simulator" ? "" : `<button id="scienceExportHistoryButton" class="science-export-start-history" type="button" hidden><span>Ver bitácora</span><small id="scienceExportHistorySummary"></small></button>`;
  return `<section id="scienceExportStartGate" class="science-export-start" role="dialog" aria-modal="true" aria-labelledby="scienceExportStartTitle"><div class="science-export-start-card"><header class="science-export-start-heading"><span class="science-export-start-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M18 12l18 12-18 12z"/><circle cx="24" cy="24" r="21"/></svg></span><small>${escapeHtml(content.eyebrow)}</small></header><main class="science-export-start-copy"><h1 id="scienceExportStartTitle">${escapeHtml(content.title)}</h1><div class="science-export-experience"><section><small>Experiencia</small><p>${escapeHtml(content.experience)}</p></section><section class="science-export-learnings"><small>Aprendizajes esperados</small>${learningMarkup}</section></div></main><div class="science-export-start-actions"><button id="scienceExportStartButton" class="science-export-start-button" type="button"><span>${escapeHtml(content.buttonLabel)}</span><b aria-hidden="true">→</b></button>${historyButton}<footer>Pantalla completa · Disponible sin conexión</footer></div></div></section>`;
}

function renderPreviewStartScreen(activity = state.previewActivity || state.activity) {
  const frame = $(".sa-game-frame");
  if (!frame || !activity) return;
  frame.querySelector(".science-preview-start")?.remove();
  const content = resolveStartScreenContent(activity);
  const learningStatements = parseExpectedLearningStatements(content.expectedLearnings);
  const learningMarkup = learningStatements.length
    ? `<ol>${learningStatements.map((statement) => `<li>${escapeHtml(statement)}</li>`).join("")}</ol>`
    : `<p>${escapeHtml(`Comprender y aplicar ${activity.topic || "el tema seleccionado"}.`)}</p>`;
  const screen = document.createElement("section");
  screen.className = "science-preview-start";
  screen.setAttribute("role", "region");
  screen.setAttribute("aria-labelledby", "sciencePreviewStartTitle");
  screen.innerHTML = `<div class="science-preview-start-card"><header><span aria-hidden="true"><i class="fas fa-play"></i></span><small>${escapeHtml(content.eyebrow)}</small></header><main><h1 id="sciencePreviewStartTitle">${escapeHtml(content.title)}</h1><div class="science-preview-start-info"><section><small>Experiencia</small><p>${escapeHtml(content.experience)}</p></section><section><small>Aprendizajes esperados</small>${learningMarkup}</section></div></main><footer><button type="button" data-preview-start><span>${escapeHtml(content.buttonLabel)}</span><b aria-hidden="true">→</b></button><small>Vista previa de la pantalla inicial del ZIP</small></footer></div>`;
  screen.querySelector("[data-preview-start]")?.addEventListener("click", () => {
    screen.remove();
    state.contentSelection = "introduction";
    renderContentEditor();
    window.dispatchEvent(new CustomEvent("scienceactivities:select-question", { detail: { phase: "introduction" } }));
  });
  frame.append(screen);
}

function buildExportBootScript(loaderSource) {
  return `(function(){var d=document,e=d.documentElement,g=d.getElementById("scienceExportStartGate"),start=d.getElementById("scienceExportStartButton"),historyButton=d.getElementById("scienceExportHistoryButton"),historySummary=d.getElementById("scienceExportHistorySummary"),toggle=d.getElementById("scienceExportFullscreen"),request=e.requestFullscreen||e.webkitRequestFullscreen,exit=d.exitFullscreen||d.webkitExitFullscreen,started=false,prefix="scienceActivities:attempt-history:v1:";function sync(){var active=!!(d.fullscreenElement||d.webkitFullscreenElement);toggle.setAttribute("aria-pressed",String(active));toggle.setAttribute("aria-label",active?"Salir de pantalla completa":"Activar pantalla completa");toggle.querySelector("span").textContent=active?"Salir de pantalla completa":"Pantalla completa"}function savedHistory(){if(!historyButton)return;var c=window.SCIENCE_ASSESSMENT_CONFIG||{},id=String(c.historyId||c.exportPackage&&c.exportPackage.historyId||"");if(!id)return;try{var value=JSON.parse(localStorage.getItem(prefix+id)||"null"),attempts=value&&Array.isArray(value.attempts)?value.attempts:[];if(!attempts.length)return;var best=attempts.reduce(function(total,item){return Math.max(total,Number(item.score)||0)},0),count=Math.max(attempts.length,Number(value.totalCompleted)||0),penalty=count>=2?" · Próximo intento −25%":"";historySummary.textContent=count+" intento"+(count===1?"":"s")+" · Mejor score "+best.toLocaleString("es-MX")+penalty;historyButton.hidden=false}catch(error){historyButton.hidden=true}}function load(){var main=d.querySelector("main");if(main)main.inert=false;${loaderSource}}function launch(view,withFullscreen){if(started)return;started=true;window.SCIENCE_ASSESSMENT_INITIAL_VIEW=view||"game";start.disabled=true;if(historyButton)historyButton.disabled=true;var fullscreen=withFullscreen&&request?Promise.resolve(request.call(e)).catch(function(){return false}):Promise.resolve(false);d.body.dataset.exportStarted="true";g.hidden=true;g.setAttribute("aria-hidden","true");g.style.pointerEvents="none";g.remove();toggle.hidden=!request||!exit;load();fullscreen.finally(sync)}function begin(){launch("game",true)}function openHistory(){launch("history",false)}toggle.addEventListener("click",function(){var active=d.fullscreenElement||d.webkitFullscreenElement;if(active&&exit)Promise.resolve(exit.call(d)).catch(function(){});else if(request)Promise.resolve(request.call(e)).catch(function(){})});start.addEventListener("click",begin);start.addEventListener("keydown",function(event){if(event.key==="Enter"||event.key===" "){event.preventDefault();begin()}});if(historyButton)historyButton.addEventListener("click",openHistory);d.addEventListener("fullscreenchange",sync);d.addEventListener("webkitfullscreenchange",sync);toggle.hidden=true;sync();savedHistory();setTimeout(savedHistory,0);requestAnimationFrame(function(){start.focus()});window.__SCIENCE_EXPORT_START__={start:begin,history:openHistory,get started(){return started}}})();`;
}

function buildExportHtml(activity) {
  const config = JSON.stringify(activity).replace(/</g, "\\u003c");
  const gate = buildExportStartGate(activity);
  const moduleSource = `import{installScienceActivitiesMotion}from"./science-motion.mjs";installScienceActivitiesMotion(document.body);await import("./script.js");`;
  const boot = buildExportBootScript(`var script=d.createElement("script");script.type="module";script.textContent=${JSON.stringify(moduleSource)};script.addEventListener("error",function(){d.body.dataset.exportError="true"});d.body.append(script);`);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(activity.title)}</title><link rel="stylesheet" href="styles.css"></head><body data-science-export data-export-started="false" data-export-style="${escapeHtml(activity.visualStyle || "kawaii-lab")}">${gate}<button id="scienceExportFullscreen" class="science-export-fullscreen" type="button" aria-label="Activar pantalla completa" aria-pressed="false" hidden><svg class="is-enter" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg><svg class="is-exit" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/></svg><span>Pantalla completa</span></button><main class="game-shell sa-page" inert><section class="game-frame sa-game-frame" data-visual-style="${escapeHtml(activity.visualStyle || "kawaii-lab")}"><div id="scienceGameMount" class="sa-game-mount"></div></section><div id="scienceGameControls" class="controls"></div></main><script>window.SCIENCE_ACTIVITY=${config};window.SCIENCE_PHASER_URL="./vendor/phaser.esm.min.js";window.SCIENCE_ANIME_URL="./vendor/animejs/anime.esm.min.js";${boot}<\/script></body></html>`;
}

const SCIENCE_EXPORT_PACKAGE_VERSION = 18;

function createScienceExportHistoryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `science-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validatePreviewExportSnapshot(activity) {
  if (!activity || !isGeneratedScienceActivity(activity)) throw new Error("No existe un preview generado válido para exportar.");
  const mode = activity.gameMode === "simulator" ? "simulator" : "game";
  if (mode === "simulator") {
    if (!activity.simulator || !activity.curriculumProfile) throw new Error("El simulador del preview no contiene un perfil científico completo.");
    return;
  }
  const questions = Array.isArray(activity.assessments) ? activity.assessments : [];
  if (!questions.length) throw new Error("El videojuego debe contener al menos una pregunta para exportarse.");
  questions.forEach((question, index) => {
    if (!question?.type || !String(question.prompt || "").trim()) throw new Error(`La pregunta ${index + 1} está incompleta.`);
    if (["multiple", "image-multiple"].includes(question.type)) {
      if (!Array.isArray(question.options) || question.options.length !== 4) throw new Error(`La pregunta ${index + 1} no tiene cuatro opciones.`);
      const correctAnswers = Array.isArray(question.correctAnswers) && question.correctAnswers.length ? question.correctAnswers : [question.correct];
      if (!correctAnswers.length || correctAnswers.some((correct) => !Number.isInteger(Number(correct)) || Number(correct) < 0 || Number(correct) >= question.options.length)) throw new Error(`La pregunta ${index + 1} no tiene respuestas correctas válidas.`);
    }
    if (question.type === "matching" && (!Array.isArray(question.pairs) || question.pairs.length < 2)) {
      throw new Error(`La pregunta de emparejamiento ${index + 1} está incompleta.`);
    }
    if (question.type === "timeline-order") {
      const events = Array.isArray(question.events) ? question.events : [];
      const ids = events.map((event) => String(event?.id || ""));
      if (events.length < 3 || events.length > 8) throw new Error(`La línea de progresión ${index + 1} debe contener entre 3 y 8 elementos.`);
      if (new Set(ids).size !== events.length || ids.some((id) => !id)) throw new Error(`La línea de progresión ${index + 1} contiene identificadores inválidos o repetidos.`);
      if (events.some((event) => !String(event?.title || "").trim() || !String(event?.description || "").trim())) throw new Error(`Todos los elementos de la línea ${index + 1} necesitan título y descripción.`);
      if (!Array.isArray(question.correctOrder) || question.correctOrder.length !== events.length || question.correctOrder.some((id) => !ids.includes(String(id)))) throw new Error(`El orden correcto de la línea ${index + 1} está incompleto.`);
    }
  });
  const visualQuestions = questions.filter((question) => question.type === "image-multiple");
  visualQuestions.forEach((question, index) => {
    if (!visualQuestionImageSource(question)) {
      throw new Error(`La pregunta visual ${index + 1} no tiene una imagen disponible para incluir en el ZIP.`);
    }
  });
}

function exportedImageExtension(contentType = "", source = "") {
  const mime = String(contentType || "").toLowerCase();
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("gif")) return "gif";
  const pathname = String(source || "").split(/[?#]/)[0];
  const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

function exportedBase64ByteLength(encoded = "") {
  const value = String(encoded || "").replace(/\s/g, "");
  if (!value) return 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0));
}

function arrayBufferToExportBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function addExportImageAsset(zip, source, basePath, { losslessAlpha = false } = {}) {
  const value = String(source || "").trim();
  if (!value) return null;
  let sourceBlob;
  if (/^data:image\//i.test(value)) sourceBlob = dataImageUrlToBlob(value);
  else {
    let response;
    try {
      response = await fetch(new URL(value, window.location.href), { credentials: "omit" });
    } catch (error) {
      throw new Error(`No se pudo descargar el asset ${basePath}: ${error?.message || "error de red"}`);
    }
    if (!response.ok) throw new Error(`No se pudo descargar el asset ${basePath} (HTTP ${response.status}).`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error(`El asset ${basePath} no devolvió una imagen válida.`);
    sourceBlob = await response.blob();
  }
  const cleanImage = await sanitizeAndResizeImage(sourceBlob, 1280, { losslessAlpha });
  const encoded = await blobToBase64(cleanImage.blob);
  const extension = cleanImage.contentType === "image/png" ? "png" : "webp";
  const path = `${basePath}.${extension}`;
  const zipBytes = new Uint8Array(await cleanImage.blob.arrayBuffer());
  zip.file(path, zipBytes);
  return {
    path,
    dataUrl: `data:${cleanImage.contentType};base64,${encoded}`,
    bytes: cleanImage.blob.size,
    width: cleanImage.width,
    height: cleanImage.height,
    metadataStripped: true
  };
}

async function localizePreviewExportImages(zip, activity, runtimeActivity = activity) {
  let simulatorVisualBytes = 0;
  const playerSource = String(activity.playerSprite?.dataUrl || activity.playerSprite?.src || activity.playerSprite?.imageSrc || "").trim();
  if (playerSource) {
    const asset = await addExportImageAsset(zip, playerSource, "assets/player-sprite", { losslessAlpha: true });
    activity.playerSprite ||= {};
    runtimeActivity.playerSprite ||= {};
    activity.playerSprite.src = asset.path;
    runtimeActivity.playerSprite.src = asset.path;
    activity.playerSprite.dataUrl = "";
    runtimeActivity.playerSprite.dataUrl = "";
  }
  const levels = activity.learningGuide?.levels || [];
  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const source = String(level.imageDataUrl || level.imageUrl || level.imageSrc || "").trim();
    if (!source) continue;
    const asset = await addExportImageAsset(zip, source, `assets/level-${index + 1}`);
    level.imageSrc = asset.path;
    level.imageDataUrl = "";
    level.imageUrl = "";
  }
  const questions = activity.assessments || [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    if (question.type !== "image-multiple") continue;
    const source = visualQuestionImageSource(question);
    if (!source) throw new Error(`La pregunta visual ${index + 1} no contiene una imagen exportable.`);
    const asset = await addExportImageAsset(zip, source, `assets/question-${index + 1}`);
    question.visual.imageSrc = asset.path;
    question.visual.imageDataUrl = "";
    question.visual.imageUrl = "";
  }
  if (activity.visualScene) {
    runtimeActivity.visualScene ||= structuredClone(activity.visualScene);
    if (simulatorUsesFullyProgrammaticScene(activity)) {
      activity.visualScene.background = {};
      activity.visualScene.layers = [];
      runtimeActivity.visualScene.background = {};
      runtimeActivity.visualScene.layers = [];
    } else if (simulatorUsesProgrammaticPrimary(activity)) {
      activity.visualScene.layers = [];
      runtimeActivity.visualScene.layers = [];
    }
    const background = activity.visualScene.background || {};
    const runtimeBackground = runtimeActivity.visualScene.background || (runtimeActivity.visualScene.background = {});
    const backgroundSource = String(background.dataUrl || background.imageUrl || background.imageSrc || "").trim();
    if (backgroundSource) {
      const asset = await addExportImageAsset(zip, backgroundSource, "assets/simulator/background");
      background.imageSrc = asset.path;
      background.dataUrl = ""; background.imageUrl = "";
      runtimeBackground.dataUrl = asset.dataUrl;
      runtimeBackground.imageUrl = ""; runtimeBackground.imageSrc = "";
      simulatorVisualBytes += asset.bytes;
    }
    for (let index = 0; index < (activity.visualScene.layers || []).length; index++) {
      const layer = activity.visualScene.layers[index];
      const source = String(layer.dataUrl || layer.imageUrl || layer.imageSrc || "").trim();
      if (!source) continue;
      const asset = await addExportImageAsset(zip, source, `assets/simulator/layer-${index + 1}`, { losslessAlpha: true });
      layer.imageSrc = asset.path;
      layer.dataUrl = ""; layer.imageUrl = "";
      const runtimeLayer = runtimeActivity.visualScene.layers?.[index];
      if (runtimeLayer) {
        runtimeLayer.dataUrl = asset.dataUrl;
        runtimeLayer.imageUrl = ""; runtimeLayer.imageSrc = "";
      }
      simulatorVisualBytes += asset.bytes;
    }
  }
  return { simulatorVisualBytes };
}

function validateLocalizedSimulatorExport(activity, runtimeActivity, { simulatorVisualBytes = 0 } = {}) {
  validateLocalizedSimulatorExportContract(activity, runtimeActivity, { simulatorVisualBytes, budgetBytes: SIMULATOR_VISUAL_BUDGET_BYTES });
}

function buildPreviewAssessmentConfig(activity) {
  return {
    ...structuredClone(activity),
    visualScene: activity.gameMode === "simulator" ? null : structuredClone(activity.visualScene || null),
    levelCount: Math.max(1, Math.floor(Number(activity.levelCount || 1))),
    questionsPerLevel: Math.max(1, Math.floor(Number(activity.questionsPerLevel || activity.assessments?.length || 1))),
    questions: activity.gameMode === "simulator" ? [] : structuredClone(activity.assessments || []),
    theme: {
      sky: activity.scenario?.sky || "#dff4ff",
      ground: activity.scenario?.ground || "#8fd5c8",
      accent: activity.scenario?.accent || "#ff7d68"
    }
  };
}

function buildStandalonePreviewHtml(activity, assessmentConfig) {
  const activityJson = JSON.stringify(activity).replace(/</g, "\\u003c");
  const assessmentJson = JSON.stringify(assessmentConfig).replace(/</g, "\\u003c");
  const bundle = activity.gameMode === "simulator"
    ? "science-simulator-export.bundle.js"
    : String(activity.visualStyle || "").startsWith("rive-")
      ? "science-game-rive-export.bundle.js"
      : "science-game-export.bundle.js";
  const gate = buildExportStartGate(activity);
  const boot = buildExportBootScript(`var script=d.createElement("script");script.src="js/${bundle}";script.addEventListener("error",function(){d.body.dataset.exportError="true"});d.body.append(script);`);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(activity.title)}</title><link rel="stylesheet" href="css/styles.css"></head><body data-science-export data-export-started="false" data-export-style="${escapeHtml(activity.visualStyle || "kawaii-lab")}">${gate}<button id="scienceExportFullscreen" class="science-export-fullscreen" type="button" aria-label="Activar pantalla completa" aria-pressed="false" hidden><svg class="is-enter" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg><svg class="is-exit" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/></svg><span>Pantalla completa</span></button><main class="game-shell sa-page" inert><section class="game-frame sa-game-frame" data-visual-style="${escapeHtml(activity.visualStyle || "kawaii-lab")}"><div id="scienceGameMount" class="sa-game-mount"></div></section><div id="scienceGameControls" class="controls"></div></main><script>window.SCIENCE_ACTIVITY=${activityJson};window.SCIENCE_ASSESSMENT_CONFIG=${assessmentJson};${boot}<\/script></body></html>`;
}

function buildStandalonePreviewBootstrap(activity) {
  if (activity.gameMode === "simulator") {
    return `const mount=document.getElementById("scienceGameMount")||document.getElementById("scienceGame");const controls=document.getElementById("scienceGameControls")||document.getElementById("scienceControls");const runtime=await import("./science-simulator-runtime.mjs");await runtime.createScienceSimulator(mount,{...window.SCIENCE_ACTIVITY,challenge:window.SCIENCE_ACTIVITY.challenge,simulator:window.SCIENCE_ACTIVITY.simulator,curriculumProfile:window.SCIENCE_ACTIVITY.curriculumProfile});`;
  }
  return `import{createScienceGame,installAccessibleGameState}from"./science-game-runtime.mjs";import{installScienceActivitiesMotion}from"./science-motion.mjs";installScienceActivitiesMotion(document.body);const mount=document.getElementById("scienceGameMount")||document.getElementById("scienceGame");const controls=document.getElementById("scienceGameControls")||document.getElementById("scienceControls");const instance=await createScienceGame(mount,controls,window.SCIENCE_ACTIVITY);globalThis.scienceGameInstance=instance;installAccessibleGameState(instance);await import("./science-assessment.js");`;
}

async function exportPreviewProjectZip() {
  commitPendingAssessmentPoints({ updatePreview: true });
  const JSZip = await loadZipRuntime().catch((error) => {
    showToast(error.message);
    return null;
  });
  if (!JSZip) return;
  if (!state.previewActivity) return showToast("Primero genera o aplica los cambios al preview.");
  const exportActivity = structuredClone(state.previewActivity);
  const runtimeActivity = structuredClone(state.previewActivity);
  try {
    validatePreviewExportSnapshot(exportActivity);
  } catch (error) {
    showToast(error.message);
    return;
  }
  setGenerating(true);
  try {
    const isSimulator = exportActivity.gameMode === "simulator";
    const isRiveStyle = !isSimulator && String(exportActivity.visualStyle || "").startsWith("rive-");
    const exportBundle = isSimulator
      ? "science-simulator-export.bundle.js"
      : isRiveStyle
        ? "science-game-rive-export.bundle.js"
        : "science-game-export.bundle.js";
    const resourceRequests = [
      [exportBundle, new URL(`./export-bundles/${exportBundle}?v=${isSimulator ? SIMULATOR_EXPORT_BUNDLE_VERSION : SCIENCE_EXPORT_PACKAGE_VERSION}`, import.meta.url), "bundle compilado", true],
      ["vendor/animejs/LICENSE.md", ANIME_LICENSE_URL, "licencia de Anime.js", !isSimulator],
      ["science-assessment.css", new URL("../science-assessment-export.css?v=20260815-segmented-switch-v34", import.meta.url), "estilos del juego", true],
      ["science-hud-themes.css", new URL("../science-hud-themes.css?v=20260815-centered-gameplay-v18", import.meta.url), "temas visuales", true],
      ["science-timeline-responsive.css", new URL("../science-timeline-responsive.css?v=20260814-timeline-pointer-v11", import.meta.url), "layout responsive", true]
    ].filter(([, , , required]) => required);
    const textResources = await Promise.all(resourceRequests.map(async ([path, url, label]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No se pudo cargar ${label}.`);
      return [path, await response.text()];
    }));
    const binaryRequests = [];
    const binaryResources = await Promise.all(binaryRequests.map(async ([path, url, label, type]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No se pudo cargar ${label}.`);
      return [path, type === "text" ? await response.text() : await response.arrayBuffer()];
    }));
    const zip = new JSZip();
    const localizedImages = await localizePreviewExportImages(zip, exportActivity, runtimeActivity);
    validateLocalizedSimulatorExport(exportActivity, runtimeActivity, localizedImages);
    const historyId = createScienceExportHistoryId();
    exportActivity.historyId = historyId;
    runtimeActivity.historyId = historyId;
    exportActivity.exportPackage = { version: SCIENCE_EXPORT_PACKAGE_VERSION, source: "preview", exportedAt: new Date().toISOString(), startsFromBeginning: true, historyId };
    runtimeActivity.exportPackage = structuredClone(exportActivity.exportPackage);
    const assessmentConfig = buildPreviewAssessmentConfig(runtimeActivity);
    const themeCss = textResources.find(([path]) => path === "science-hud-themes.css")?.[1] || "";
    const assessmentCss = textResources.find(([path]) => path === "science-assessment.css")?.[1] || "";
    const timelineCss = textResources.find(([path]) => path === "science-timeline-responsive.css")?.[1] || "";
    zip.file("index.html", buildStandalonePreviewHtml(runtimeActivity, assessmentConfig));
    zip.file("css/styles.css", `${EXPORTED_CSS.trim()}\n\n${assessmentCss}\n\n${themeCss}\n\n${timelineCss}\n\n${EXPORTED_LAYOUT_CSS.trim()}`);
    zip.file("data/activity.json", JSON.stringify(exportActivity, null, 2));
    textResources.forEach(([path, source]) => {
      if (["science-assessment.css", "science-hud-themes.css", "science-timeline-responsive.css"].includes(path)) return;
      const destination = path.includes("/") ? path : `js/${path}`;
      zip.file(destination, source);
    });
    binaryResources.forEach(([path, source]) => zip.file(path, source));
    zip.file("LEEME.txt", `SCIENCE ACTIVITIES\n\n${exportActivity.title}\n${SUBJECT_LABELS[exportActivity.subject] || exportActivity.subject} · ${exportActivity.topic}\n\nPaquete offline generado desde el preview aprobado. Puedes abrir index.html directamente con doble clic o mediante un servidor local/plataforma educativa. Antes de empaquetarse, todas las imágenes fueron recodificadas para eliminar metadatos y limitadas a un ancho máximo de 1280 px, conservando su proporción. Las imágenes del simulador se conservan en assets/simulator/ y también se incrustan en la configuración ejecutable para evitar bloqueos CORS bajo file://. El avance del intento activo y la bitácora de los dos intentos completos más recientes se conservan en localStorage; sólo están disponibles en el mismo navegador y origen. El avance activo se reinicia únicamente al comenzar un nuevo intento o confirmar Reiniciar intentos.`);
    const blob = typeof zip.generateAsync === "function"
      ? await zip.generateAsync({ type: "blob" })
      : zip.generate({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(exportActivity.title)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(isSimulator ? "Simulador del preview exportado en ZIP." : "Videojuego del preview exportado en ZIP.");
  } catch (error) {
    console.error("[ScienceActivities] Preview ZIP export failed:", error);
    showToast(error?.message || "No fue posible exportar el preview.");
  } finally {
    setGenerating(false);
  }
}

async function exportProject() {
  syncEditorToActivity();
  commitPendingAssessmentPoints();
  if (state.activity.gameMode !== "simulator") distributeActivityAssessmentPoints(state.activity);
  const JSZip = await loadZipRuntime().catch((error) => {
    showToast(error.message);
    return null;
  });
  if (!JSZip) return;
  setGenerating(true);
  try {
    const exportActivity = structuredClone(state.activity);
    const [runtimeSource, phaserSource, animeSource, animeLicense, motionSource] = await Promise.all([
      fetch(RUNTIME_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer el motor de la actividad.");
        return response.text();
      }),
      fetch(PHASER_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer Phaser.");
        return response.text();
      }),
      fetch(ANIME_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer Anime.js.");
        return response.text();
      }),
      fetch(ANIME_LICENSE_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer la licencia de Anime.js.");
        return response.text();
      }),
      fetch(MOTION_URL).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer el sistema de animaciones.");
        return response.text();
      })
    ]);
    const zip = new JSZip();
    await localizePreviewExportImages(zip, exportActivity, exportActivity);
    zip.file("index.html", buildExportHtml(exportActivity));
    zip.file("styles.css", `${EXPORTED_CSS.trim()}\n\n${EXPORTED_LAYOUT_CSS.trim()}`);
    zip.file("script.js", `${runtimeSource}\n\nconst mount = document.getElementById("scienceGameMount") || document.getElementById("scienceGame");\nconst controls = document.getElementById("scienceGameControls") || document.getElementById("scienceControls");\nconst instance = await createScienceGame(mount, controls, window.SCIENCE_ACTIVITY); globalThis.scienceGameInstance = instance; installAccessibleGameState(instance);`);
    zip.file("vendor/phaser.esm.min.js", phaserSource);
    zip.file("vendor/animejs/anime.esm.min.js", animeSource);
    zip.file("vendor/animejs/LICENSE.md", animeLicense);
    zip.file("science-motion.mjs", motionSource.replace("../vendor/animejs/anime.esm.min.js", "./vendor/animejs/anime.esm.min.js"));
    zip.file("activity.json", JSON.stringify(exportActivity, null, 2));
    zip.file("LEEME.txt", `SCIENCE ACTIVITIES\n\n${exportActivity.title}\n${SUBJECT_LABELS[exportActivity.subject]} · ${exportActivity.topic}\n\nIncluye Phaser, Anime.js, el runtime de Rive y todos los recursos visuales para funcionar sin conexión. Las imágenes fueron recodificadas sin metadatos y limitadas a un ancho máximo de 1280 px.\nConsulta assets/RIVE-HUD-ATTRIBUTION.txt para la atribución del recurso Rive.\nAbre index.html con doble clic o desde una plataforma educativa. El paquete no requiere internet.`);
    const blob = typeof zip.generateAsync === "function" ? await zip.generateAsync({ type: "blob" }) : zip.generate({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(exportActivity.title)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("Juego exportado con Phaser, Anime.js y animaciones offline.");
  } catch (error) {
    console.error("[ScienceActivities] Export failed:", error);
    showToast(error?.message || "No fue posible exportar el juego.");
  } finally {
    setGenerating(false);
  }
}

async function exportProjectWithAssessment() {
  syncEditorToActivity();
  commitPendingAssessmentPoints();
  const JSZipConstructor = await loadZipRuntime().catch(() => null);
  if (!JSZipConstructor?.prototype?.generateAsync) {
    await exportProject();
    return;
  }

  const [
    assessmentScript,
    assessmentStyles,
    simulatorRuntimeSource,
    hudThemeStyles,
    timelineResponsiveStyles
  ] = await Promise.all([
    fetch(new URL("./science-assessment-export.js?v=20260815-result-capture-v9", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar el runtime de preguntas.");
      return response.text();
    }),
    fetch(new URL("../science-assessment-export.css?v=20260815-segmented-switch-v34", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudieron cargar los estilos de preguntas.");
      return response.text();
    }),
    fetch(new URL(SIMULATOR_RUNTIME_SPECIFIER, import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar el simulador Phaser.");
      return response.text();
    }),
    fetch(new URL("../science-hud-themes.css?v=20260815-centered-gameplay-v18", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudieron cargar los temas visuales del HUD.");
      return response.text();
    }),
    fetch(new URL("../science-timeline-responsive.css?v=20260814-timeline-pointer-v11", import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("No se pudo cargar el layout responsive.");
      return response.text();
    }),
  ]);

  syncEditorToActivity();
  if (state.activity.gameMode !== "simulator") distributeActivityAssessmentPoints(state.activity);
  const levelCount = Math.max(1, Math.floor(Number(state.activity.levelCount || 3)));
  const questionsPerLevel = Math.max(1, Math.floor(Number(state.activity.questionsPerLevel || 3)));
  const assessmentConfig = {
    historyId: createScienceExportHistoryId(),
    exportPackage: { version: SCIENCE_EXPORT_PACKAGE_VERSION, source: "assessment", historyId: "" },
    title: state.activity.title,
    subtitle: state.activity.subtitle,
    subject: state.activity.subject,
    topic: state.activity.topic,
    expectedLearnings: state.activity.expectedLearnings,
    experiencePrompt: state.activity.experiencePrompt,
    mission: state.activity.mission,
    scientificPrinciple: state.activity.scientificPrinciple,
    maxPoints: state.activity.maxPoints,
    levelCount,
    questionsPerLevel,
    gameMode: state.activity.gameMode || $("#gameModeSelect").value || "game",
    difficulty: state.activity.difficulty || $("#difficultySelect").value || "balanced",
    visualStyle: state.activity.visualStyle || $("#visualStyleSelect").value || "kawaii-lab",
    simulationType: state.activity.simulationType || "friction",
    theme: {
      sky: state.activity.scenario?.sky || "#dff4ff",
      ground: state.activity.scenario?.ground || "#8fd5c8",
      accent: state.activity.scenario?.accent || "#ff7d68"
    },
    challenge: {
      title: state.activity.title,
      description: state.activity.mission,
      targetLabel: state.activity.challenge?.targetLabel,
      targetValue: state.activity.challenge?.targetValue,
      tolerance: state.activity.challenge?.tolerance
    },
    controls: structuredClone(state.activity.controls || []),
    curriculumProfile: structuredClone(state.activity.curriculumProfile || null),
    profileId: state.activity.profileId,
    profileVersion: state.activity.profileVersion,
    simulator: structuredClone(state.activity.simulator || {}),
    simulatorVisualSelection: structuredClone(state.activity.simulatorVisualSelection || null),
    visualScene: structuredClone(state.activity.visualScene || null),
    learningGuide: structuredClone(state.activity.learningGuide || buildFallbackLearningGuide(state.activity)),
    playerSprite: structuredClone(state.activity.playerSprite || null),
    playerCharacter: structuredClone(state.activity.playerCharacter || null),
    questions: state.activity.gameMode === "simulator" ? [] : Array.from(
      { length: levelCount * questionsPerLevel },
      (_, index) => buildAssessment(state.activity, index)
    )
  };
  assessmentConfig.exportPackage.historyId = assessmentConfig.historyId;
  const originalGenerateAsync = JSZipConstructor.prototype.generateAsync;

  JSZipConstructor.prototype.generateAsync = async function patchedGenerateAsync(...args) {
    const playerSource = String(assessmentConfig.playerSprite?.dataUrl || assessmentConfig.playerSprite?.src || "").trim();
    if (playerSource) {
      const asset = await addExportImageAsset(this, playerSource, "assets/player-sprite", { losslessAlpha: true });
      assessmentConfig.playerSprite.src = asset.path;
      delete assessmentConfig.playerSprite.dataUrl;
    }
    for (let index = 0; index < (assessmentConfig.learningGuide?.levels || []).length; index += 1) {
      const level = assessmentConfig.learningGuide.levels[index];
      const source = String(level.imageDataUrl || level.imageUrl || level.imageSrc || "").trim();
      if (!source) continue;
      const asset = await addExportImageAsset(this, source, `assets/level-${index + 1}`);
      level.imageSrc = asset.path;
      delete level.imageDataUrl;
      delete level.imageUrl;
    }
    for (let index = 0; index < (assessmentConfig.questions || []).length; index += 1) {
      const question = assessmentConfig.questions[index];
      if (question.type !== "image-multiple") continue;
      const source = visualQuestionImageSource(question);
      if (!source) continue;
      const asset = await addExportImageAsset(this, source, `assets/question-${index + 1}`);
      question.visual.imageSrc = asset.path;
      delete question.visual.imageDataUrl;
      delete question.visual.imageUrl;
    }
    if (assessmentConfig.visualScene) {
      const background = assessmentConfig.visualScene.background || {};
      const backgroundSource = String(background.dataUrl || background.imageUrl || background.imageSrc || "").trim();
      if (backgroundSource) {
        const asset = await addExportImageAsset(this, backgroundSource, "assets/simulator/background");
        background.imageSrc = asset.path;
        delete background.dataUrl;
        delete background.imageUrl;
      }
      for (let index = 0; index < (assessmentConfig.visualScene.layers || []).length; index += 1) {
        const layer = assessmentConfig.visualScene.layers[index];
        const source = String(layer.dataUrl || layer.imageUrl || layer.imageSrc || "").trim();
        if (!source) continue;
        const asset = await addExportImageAsset(this, source, `assets/simulator/layer-${index + 1}`, { losslessAlpha: true });
        layer.imageSrc = asset.path;
        delete layer.dataUrl;
        delete layer.imageUrl;
      }
    }
    const serializedConfig = JSON.stringify(assessmentConfig).replace(/</g, "\\u003c");
    const htmlName = Object.keys(this.files).find((name) => /\.html?$/i.test(name));
    if (htmlName) {
      const htmlFile = this.file(htmlName);
      let html = await htmlFile.async("string");
      html = html.includes("</head>")
        ? html.replace("</head>", "  <link rel=\"stylesheet\" href=\"science-assessment.css\">\n</head>")
        : `<link rel="stylesheet" href="science-assessment.css">\n${html}`;
      const assessmentBoot = `<script>window.SCIENCE_ASSESSMENT_CONFIG=${serializedConfig};</script>\n<script src="science-assessment.js" defer></script>`;
      html = html.includes("</body>")
        ? html.replace("</body>", `${assessmentBoot}\n</body>`)
        : `${html}\n${assessmentBoot}`;
      this.file(htmlName, html);
    }
      this.file("science-assessment.js", assessmentScript);
      this.file("science-simulator-runtime.mjs", simulatorRuntimeSource);
      this.file("science-assessment.css", `${assessmentStyles}\n\n${hudThemeStyles}\n\n${timelineResponsiveStyles}`);
      return originalGenerateAsync.apply(this, args);
  };

  try {
    const originalScenarioLabel = state.activity.scenario?.label || "";
    if (state.activity.scenario) state.activity.scenario.label = "";
    await exportProject();
    if (state.activity.scenario) state.activity.scenario.label = originalScenarioLabel;
    showToast("Juego exportado con Phaser, Anime.js y HUD Rive offline.");
  } finally {
    if (state.activity.scenario && !state.activity.scenario.label) {
      state.activity.scenario.label = getSelectedScenario()?.label || "";
    }
    JSZipConstructor.prototype.generateAsync = originalGenerateAsync;
  }
}

function bindEvents() {
  $("#scienceThemeToggleBtn")?.addEventListener("click", cycleScienceTheme);
  $("#activityForm").addEventListener("submit", (event) => { event.preventDefault(); generateWithGemini({ initialSetup: sessionSetupState.active }); });
  $("#generateBtn").addEventListener("click", generateWithGemini);
  $("#generateExperienceBtn").addEventListener("click", generateExperienceProposal);
  $("#gameModeSelect").addEventListener("change", () => {
    state.activity.gameMode = $("#gameModeSelect").value;
    state.gameProgress = null;
    updateGameModeUI();
  });
  $("#subjectSelect").addEventListener("change", () => {
    const subject = $("#subjectSelect").value;
    const selectedMode = $("#gameModeSelect").value;
    $("#topicInput").value = TOPICS[subject][0];
    fillTopicSuggestions();
    fillScenarioOptions();
    state.activity.subject = subject;
    state.activity.topic = TOPICS[subject][0];
    state.activity = buildTopicActivity(subject, TOPICS[subject][0], getSelectedScenario());
    state.activity.gameMode = selectedMode;
    state.activity.assessments = [];
    state.activity.learningGuide = null;
    state.gameProgress = null;
    state.activity.grade = SUBJECT_DEFAULT_GRADES[subject];
    $("#gradeSelect").value = state.activity.grade;
    $("#expectedLearnings").value = "";
    $("#experiencePrompt").value = "";
    syncActivityToEditor();
    setOptionalText("#summarySubject", SUBJECT_LABELS[subject]);
  });
  $("#topicInput").addEventListener("input", matchScenarioToTopic);
  $("#customTopicInput").addEventListener("change", matchScenarioToTopic);
  $("#customTopicInput").addEventListener("input", () => {
    state.activity.topic = getSelectedTopic();
    state.activity.scenario = structuredClone(getSelectedScenario());
    fillSimulatorVisualChoiceOptions(state.activity.simulatorVisualSelection);
  });
  $("#scenarioSelect").addEventListener("change", () => {
    state.activity.scenario = structuredClone(getSelectedScenario());
  });
  ["simulatorScenarioSelect", "simulatorObjectSelect"].forEach((id) => {
    $("#" + id)?.addEventListener("change", () => {
      toggleSimulatorCustomVisualFields({ focus: true });
      const customInput = id === "simulatorScenarioSelect" ? $("#simulatorCustomScenarioInput") : $("#simulatorCustomObjectInput");
      if ($("#" + id).value !== CUSTOM_SIMULATOR_VISUAL_VALUE || customInput?.value.trim()) state.activity.simulatorVisualSelection = getSelectedSimulatorVisualSelection();
      scheduleLocalDraftSave();
    });
  });
  ["simulatorCustomScenarioInput", "simulatorCustomObjectInput"].forEach((id) => {
    $("#" + id)?.addEventListener("input", () => {
      if ($("#" + id).value.trim()) state.activity.simulatorVisualSelection = getSelectedSimulatorVisualSelection();
      scheduleLocalDraftSave();
    });
  });
  $("#simulatorVariableChoices")?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-simulator-variable]");
    if (!input) return;
    const value = Number(input.value);
    const control = state.activity.controls?.find((item) => item.id === input.dataset.simulatorVariable);
    if (control && Number.isFinite(value)) control.value = Math.max(Math.min(value, Math.max(control.min, control.max)), Math.min(control.min, control.max));
    state.activity.simulator = { ...(state.activity.simulator || {}), values: { ...(state.activity.simulator?.values || {}), [input.dataset.simulatorVariable]: value } };
    scheduleLocalDraftSave();
  });
  $("#visualStyleSelect").addEventListener("change", () => {
    state.activity.visualStyle = $("#visualStyleSelect").value;
    fillCharacterOptions();
    applySelectedCharacter(false);
    state.activity.learningGuide?.levels?.forEach((level, index) => {
      level.imagePrompt = buildActivityLevelSceneSeed(state.activity, level, index);
    });
    state.previewActivity = {
      ...(state.previewActivity || structuredClone(state.activity)),
      visualStyle: state.activity.visualStyle
    };
    scheduleLocalDraftSave();
    void renderGame();
    showToast("Estilo visual aplicado al preview.");
  });
  $("#characterSelect").addEventListener("change", () => applySelectedCharacter(false));
  $("#createCharacterBtn").addEventListener("click", createCharacterVariation);
  $("#closeCharacterModalBtn").addEventListener("click", closeCharacterModal);
  $("#cancelCharacterModalBtn").addEventListener("click", closeCharacterModal);
  $("#generateCharacterTemplateBtn").addEventListener("click", generateCharacterTemplate);
  $("#saveCharacterFirebaseBtn").addEventListener("click", saveCharacterToFirebase);
  $("#characterCreatorModal").addEventListener("click", (event) => {
    if (event.target === $("#characterCreatorModal")) closeCharacterModal();
  });
  ["activityTitle", "missionInput", "principleInput", "topicInput", "customTopicInput", "expectedLearnings", "experiencePrompt", "gameLevelCount", "questionsPerLevel", "difficultySelect", "visualStyleSelect"].forEach((id) => {
    $(`#${id}`).addEventListener("input", syncEditorToActivity);
  });
  $("#difficultySelect").addEventListener("change", () => {
    state.activity.difficulty = $("#difficultySelect").value;
  });
  $("#restartPreviewBtn").addEventListener("click", restartPreviewFromBeginning);
  $("#copyScienceAnswersBtn").addEventListener("click", async () => {
    try {
      commitPendingAssessmentPoints({ updatePreview: true });
      const { questionCount } = await copyScienceAnswers(state.activity);
      showToast(questionCount
        ? `${questionCount} ${questionCount === 1 ? "pregunta copiada" : "preguntas copiadas"} con respuestas y formato.`
        : "La actividad todavía no contiene preguntas para copiar.");
    } catch (error) {
      console.error("[ScienceActivities] Answer copy failed:", error);
      showToast(error?.message || "No fue posible copiar las preguntas y respuestas.");
    }
  });
  $("#fullscreenBtn").addEventListener("click", () => {
    const frame = $(".sa-game-frame");
    if (!document.fullscreenElement) frame.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  $("#saveProjectBtn").addEventListener("click", () => saveProject());
  $("#exportProjectBtn").addEventListener("click", exportPreviewProjectZip);
  $("#newProjectBtn").addEventListener("click", openInitialSessionSetup);
  $("#quickNewBtn").addEventListener("click", openInitialSessionSetup);
  $("#cancelNewSessionBtn").addEventListener("click", cancelInitialSessionSetup);
  $("#backToSessionsBtn").addEventListener("click", returnToSessionsFromSetup);
  document.addEventListener("keydown", (event) => {
    const commandKey = event.metaKey || event.ctrlKey;
    const editableTarget = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']");
    if (commandKey && String(event.key).toLowerCase() === "g" && !editableTarget && state.selectedSessionIds.size >= 2) {
      event.preventDefault();
      createSessionGroupFromSelection();
      return;
    }
    if (event.key === "Escape" && state.selectedSessionIds.size && !editableTarget) clearSessionSelection();
  });
  $("#savedProjects").addEventListener("click", async (event) => {
    const groupToggle = event.target.closest("[data-toggle-session-group]");
    if (groupToggle) {
      const group = state.sessionGroups.find((candidate) => candidate.id === String(groupToggle.dataset.toggleSessionGroup || ""));
      if (!group) return;
      group.collapsed = !group.collapsed;
      persistSessionGroups();
      renderSessions();
      return;
    }
    const groupActionButton = event.target.closest("[data-session-group-action]");
    if (groupActionButton) {
      const groupId = String(groupActionButton.dataset.sessionGroupId || "");
      const group = state.sessionGroups.find((candidate) => candidate.id === groupId);
      if (!group) return;
      if (groupActionButton.dataset.sessionGroupAction === "rename") {
        const nextName = window.prompt("Nombre del grupo:", group.name)?.trim();
        if (!nextName) return;
        group.name = nextName;
        persistSessionGroups();
        renderSessions();
        showToast(`Grupo renombrado como “${nextName}”.`);
      }
      if (groupActionButton.dataset.sessionGroupAction === "ungroup") {
        state.sessionGroups = state.sessionGroups.filter((candidate) => candidate.id !== groupId);
        persistSessionGroups();
        renderSessions();
        showToast(`Grupo “${group.name}” desagrupado.`);
      }
      return;
    }
    const menuButton = event.target.closest("[data-session-menu]");
    if (menuButton) {
      const menu = menuButton.closest(".sa-session-item")?.querySelector("[data-session-menu-content]");
      const willOpen = menu?.hidden;
      document.querySelectorAll(".sa-session-menu").forEach((item) => { item.hidden = true; });
      document.querySelectorAll("[data-session-menu]").forEach((item) => item.setAttribute("aria-expanded", "false"));
      if (menu && willOpen) {
        menu.hidden = false;
        menuButton.setAttribute("aria-expanded", "true");
      }
      return;
    }
    const actionButton = event.target.closest("[data-session-action]");
    if (actionButton) {
      noteSessionInteraction();
      const sessionId = String(actionButton.dataset.sessionId || "");
      const index = state.sessions.findIndex((candidate) => String(candidate.id) === sessionId);
      const session = state.sessions[index];
      if (!session) return;
      const action = actionButton.dataset.sessionAction;
      if (action === "rename") {
        const nextName = window.prompt("Nombre de la sesión:", session.title)?.trim();
        if (!nextName) return;
        const savedAt = new Date().toISOString();
        try {
          await renameRemoteSession(session, nextName, savedAt);
        } catch (error) {
          console.warn("[ScienceActivities] No fue posible renombrar la sesión remota:", error);
          showToast("No fue posible renombrar la sesión. Inténtalo de nuevo.");
          return;
        }
        session.title = nextName;
        session.savedAt = savedAt;
        session.remoteSavedAt = savedAt;
        session.remoteAvailable = Boolean(session.firebaseDocId);
        session.syncState = "saved";
        if (String(session.id) === String(state.activeSessionId)) {
          state.activity.title = nextName;
          if (state.previewActivity) state.previewActivity.title = nextName;
          syncActivityToEditor();
          session.bodySavedAt = savedAt;
          await persistSessionBody(session, state.activity);
          await persistOfflineDraft(session.id, state.activity, savedAt);
        }
      }
      if (action === "duplicate") {
        let sourceActivity;
        try {
          sourceActivity = await resolveHydratedSessionActivity(session);
        } catch (error) {
          showToast(error?.message || "No fue posible cargar la sesión para duplicarla.");
          return;
        }
        const duplicate = sessionMetadataFromRecord(session);
        duplicate.id = crypto.randomUUID();
        duplicate.firebaseDocId = crypto.randomUUID();
        duplicate.savedAt = new Date().toISOString();
        duplicate.bodySavedAt = duplicate.savedAt;
        duplicate.remoteSavedAt = "";
        duplicate.remoteAvailable = false;
        duplicate.syncState = "pending";
        duplicate.title = `${session.title} · copia`;
        sourceActivity.title = duplicate.title;
        state.sessions.unshift(duplicate);
        await persistSessionBody(duplicate, sourceActivity);
        await persistOfflineDraft(duplicate.id, sourceActivity, duplicate.savedAt);
      }
      if (action === "delete") {
        if (!window.confirm(`¿Eliminar la sesión "${session.title}"?`)) return;
        try {
          await deleteRemoteSession(session);
        } catch (error) {
          console.warn("[ScienceActivities] No fue posible eliminar la sesión remota:", error);
          showToast("No fue posible eliminar toda la sesión. Inténtalo de nuevo.");
          return;
        }
        state.sessions.splice(index, 1);
        await deleteLocalSession(session.id);
        if (String(session.id) === String(state.activeSessionId)) {
          state.activeSessionId = null;
          localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          state.activity = normalizeActivity(structuredClone(DEFAULT_ACTIVITY));
          state.previewActivity = null;
          state.gameProgress = null;
          syncActivityToEditor();
        }
      }
      try {
        persistSessionsWithinQuota(state.sessions);
        if (action !== "delete") await persistSessionMetadata(action === "duplicate" ? state.sessions[0] : session);
        persistSessionGroups();
        renderSessions();
        if (action === "delete" && !state.activeSessionId) {
          const fallback = state.sessions[0];
          if (fallback) await activateSession(fallback, { flushCurrent: false, silent: true });
          else showNoActiveSession();
        }
        showToast(action === "rename" ? "Sesión renombrada." : action === "duplicate" ? "Sesión duplicada." : "Sesión eliminada.");
      } catch (error) {
        console.warn("[ScienceActivities] No fue posible actualizar las sesiones:", error);
        showToast("No fue posible actualizar las sesiones locales.");
      }
      return;
    }
    const button = event.target.closest("[data-load-session-id]");
    if (!button) return;
    const sessionId = String(button.dataset.loadSessionId || "");
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleSessionSelection(sessionId);
      return;
    }
    if (state.selectedSessionIds.size) clearSessionSelection();
    const session = state.sessions.find((candidate) => String(candidate.id) === sessionId);
    if (!session) {
      showToast("No se encontró la sesión seleccionada.");
      return;
    }
    try {
      await activateSession(session, { userInitiated: true });
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("[ScienceActivities] No fue posible abrir la sesión:", error);
      showToast(error?.message || "No fue posible rehidratar la sesión seleccionada.");
    }
  });
  $("#addTipBtn").addEventListener("click", () => {
    const tip = window.prompt("Nuevo consejo breve para el estudiante:");
    if (!tip?.trim()) return;
    state.activity.coachTips.push(tip.trim());
    state.activity.coachTips = state.activity.coachTips.slice(0, 5);
    renderTips();
    scheduleLocalDraftSave();
  });
  $("#coachTips").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-tip]");
    if (!button) return;
    state.activity.coachTips.splice(Number(button.dataset.removeTip), 1);
    renderTips();
    scheduleLocalDraftSave();
  });
  $(".sa-page").addEventListener("input", (event) => {
    if (event.target.closest("#activityForm, .sa-inspector")) scheduleLocalDraftSave();
  });
  $(".sa-page").addEventListener("change", (event) => {
    if (event.target.closest("#activityForm, .sa-inspector")) scheduleLocalDraftSave();
  });
  window.addEventListener("pagehide", flushLocalDraftSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLocalDraftSave();
  });
}

async function init() {
  markStartup("init-start");
  const runtimeConfigReady = Promise.resolve(window.__CHARLY_RUNTIME_CONFIG_READY__).catch((error) => {
    console.warn("[ScienceActivities] La configuración runtime no terminó de cargar; se intentará usar same-origin:", error);
    return {};
  }).finally(() => markStartup("runtime-config-ready"));
  initializeScienceTheme();
  fillTopicSuggestions();
  fillScenarioOptions(state.activity.scenario?.id || DEFAULT_ACTIVITY.scenario.id);
  await loadSessions();
  bindEvents();

  let restored = false;
  const localActive = state.sessions.find((session) => String(session.id) === String(state.activeSessionId));
  if (localActive) {
    try {
      restored = await activateSession(localActive, { allowRemote: false, flushCurrent: false, silent: true, mountPreview: false });
    } catch (error) {
      console.info("[ScienceActivities] La sesión activa no está en caché local; se intentará restaurar desde el servidor.");
    }
  }

  if (!restored) {
    showNoActiveSession();
  }

  notifyEditorInteractive();
  if (restored) {
    void mountPreviewProgressively().catch((error) => {
      console.warn("[ScienceActivities] No fue posible preparar el preview progresivo:", error);
    });
  }

  const startupInteractionRevision = sessionInteractionRevision;
  setRemoteSessionSyncStatus("Sincronizando sesiones…", "syncing");
  void runtimeConfigReady
    .then(() => syncRemoteSessionsInBackground({
      refreshActive: true,
      interactionRevision: startupInteractionRevision
    }))
    .then((synced) => {
      setRemoteSessionSyncStatus(synced ? "Sesiones sincronizadas" : "Modo local", synced ? "saved" : "offline");
    })
    .catch((error) => {
      console.warn("[ScienceActivities] La sincronización remota no pudo iniciarse:", error);
      setRemoteSessionSyncStatus("Modo local", "offline");
    });
}

init().catch((error) => {
  console.error("[ScienceActivities] Initialization failed:", error);
  showToast("No fue posible iniciar el motor 2D.");
});
