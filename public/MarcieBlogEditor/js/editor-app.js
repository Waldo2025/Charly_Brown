import {
  subscribeToMarcieSessions,
  createMarcieSession,
  saveMarcieSession,
  deleteMarcieSession,
  seedInitialSessionIfEmpty,
  MARCIE_COLLECTION
} from "./services/marcie-session-store.js?v=20260831r2";
import {
  ensureApprovedUserAccess,
  logOutUser,
  findUserProfile
} from "./services/marcie-auth-guard.js";
import { initPanelResizers } from "./components/panel-resizer.js";
import { openSessionContextMenu } from "./components/session-menu.js?v=20260831r2";
import { initPipelineStepper, runTrendSearchForSession } from "./components/pipeline-stepper.js?v=20260831r5";
import { initCommandPalette, openCommandPalette } from "./components/command-palette.js?v=20260831r2";
import { makeArticleEditable } from "./components/inline-editor.js?v=20260831r2";
import { initTopbarActions, openAiAssistantModal } from "./components/topbar-actions.js?v=20260831r3";
import { initEditorialDashboard } from "./components/editorial-dashboard.js?v=20260831r12";
import { listEditorialProfilesOnce, saveEditorialProfile } from "./services/marcie-editorial-store.js";
import { showModal, showNewSessionModal, showToast, closeActiveModal } from "./components/modals.js?v=20260831r4";
import { articleContentHash, generateArticleImageWithGemini, sanitizeTrustedSources, verifyArticleEvidence } from "./services/marcie-gemini-service.js?v=20260831r6";
import { draftArticleForMode, generateProposalsForMode, refineTopicForMode, reviewArticleForMode, sessionUsesAida } from "./services/marcie-mode-service.js?v=20260831r6";
import { articleVerificationBlockers, isAidaArticleCompatible, isArticleFullyVerified } from "./contracts/editorial-contracts.js?v=20260831r3";
import { DEFAULT_GEMINI_MODEL, getConfiguredGeminiModel, getStaticGeminiTextModels, listGeminiModels, setConfiguredGeminiModel } from "/charly-brown/gemini-client.js";
import { DEFAULT_PROMPT_PROFILE_ID, FREE_PROMPT_PROFILE_ID, MARCIE_PROMPT_DEFINITIONS, getActiveMarciePromptProfileId, getDefaultMarciePrompts, getFreeMarciePrompts, listMarciePromptProfiles, saveMarciePromptProfile, setActiveMarciePromptProfile } from "./services/marcie-prompt-settings.js?v=20260831r3";
import { cancelScheduledPublication, createWordPressDraft, getWordPressStatus, publishWordPressArticle, testWordPressConnection } from "./services/marcie-wordpress-service.js";

const MARCIE_UI_THEME_STORAGE_KEY = "marcie_ui_theme_v1";
const MARCIE_UI_THEMES = [
  { id: "light", label: "Claro" },
  { id: "medium", label: "Medio" },
  { id: "dark", label: "Oscuro" }
];

function normalizeMarcieUiTheme(value) {
  return MARCIE_UI_THEMES.some((theme) => theme.id === value) ? value : "light";
}

function readMarcieUiTheme() {
  try {
    return normalizeMarcieUiTheme(localStorage.getItem(MARCIE_UI_THEME_STORAGE_KEY));
  } catch (_) {
    return "light";
  }
}

function applyMarcieUiTheme(value, { persist = false } = {}) {
  const themeId = normalizeMarcieUiTheme(value);
  const currentIndex = MARCIE_UI_THEMES.findIndex((theme) => theme.id === themeId);
  const currentTheme = MARCIE_UI_THEMES[currentIndex];
  const nextTheme = MARCIE_UI_THEMES[(currentIndex + 1) % MARCIE_UI_THEMES.length];

  document.documentElement.dataset.marcieUiTheme = themeId;
  if (document.body) document.body.dataset.marcieUiTheme = themeId;

  const button = document.getElementById("btn-ui-theme");
  if (button) {
    button.dataset.theme = themeId;
    button.title = `Tema ${currentTheme.label}. Cambiar a ${nextTheme.label}`;
    button.setAttribute("aria-label", `Tema actual: ${currentTheme.label}. Cambiar a ${nextTheme.label}`);
    button.querySelectorAll("[data-marcie-theme-icon]").forEach((icon) => {
      icon.classList.toggle("hidden", icon.dataset.marcieThemeIcon !== themeId);
    });
  }

  if (persist) {
    try {
      localStorage.setItem(MARCIE_UI_THEME_STORAGE_KEY, themeId);
    } catch (_) {}
  }

  return themeId;
}

function initMarcieUiTheme() {
  applyMarcieUiTheme(readMarcieUiTheme());
  document.getElementById("btn-ui-theme")?.addEventListener("click", () => {
    const currentTheme = normalizeMarcieUiTheme(document.documentElement.dataset.marcieUiTheme);
    const currentIndex = MARCIE_UI_THEMES.findIndex((theme) => theme.id === currentTheme);
    applyMarcieUiTheme(MARCIE_UI_THEMES[(currentIndex + 1) % MARCIE_UI_THEMES.length].id, { persist: true });
  });
}

// Estado de la aplicación en memoria
const appState = {
  sessions: [],
  activeSessionId: null,
  filter: "all", // "all" | "recent" | "draft" | "review" | "published"
  searchQuery: "",
  currentTab: "article", // "article" | "structured" | "seo"
  isSaving: false,
  currentUser: null,
  isGeneratingArticle: false,
  articleGenerationProgress: null,
  generatingImageSessionId: null,
  showArchived: false
};

async function runSessionReview(session, article = session?.article, audience = article?.audience || session?.audience || "educators") {
  const result = await reviewArticleForMode({ session, article: article || { title: session?.title, blocks: [] } });
  const audit = { ...result };
  if (audit.verifiedArticle) {
    const verifiedArticle = audit.verifiedArticle;
    delete audit.verifiedArticle;
    if (!session.articlesByAudience) session.articlesByAudience = {};
    session.articlesByAudience[audience] = verifiedArticle;
    if (session.audience === audience || session.article === article) session.article = verifiedArticle;
  }
  return audit;
}

function compactGeminiModelLabel(model = "") {
  return String(model || "")
    .replace(/^gemini-/i, "")
    .replace(/-preview.*$/i, " preview")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function updateGeminiModelBadge(model = getConfiguredGeminiModel()) {
  const badge = document.getElementById("header-gemini-model-badge");
  if (badge) {
    badge.textContent = compactGeminiModelLabel(model);
    badge.title = model;
  }
}

async function openGeminiModelSettings() {
  const currentModel = getConfiguredGeminiModel();
  let profiles = listMarciePromptProfiles();
  let selectedProfileId = getActiveMarciePromptProfileId();
  let selectedPromptId = MARCIE_PROMPT_DEFINITIONS[0].id;
  let draftPrompts = { ...(profiles.find((profile) => profile.id === selectedProfileId)?.prompts || getDefaultMarciePrompts()) };
  showModal({
    title: "Configuración de Gemini",
    widthClass: "max-w-4xl",
    contentHtml: `
      <div class="gemini-settings-shell">
        <div class="gemini-settings-tabs" role="tablist" aria-label="Secciones de configuración">
          <button type="button" role="tab" data-gemini-settings-tab="model" aria-selected="true" class="is-active">Modelo</button>
          <button type="button" role="tab" data-gemini-settings-tab="prompts" aria-selected="false">Prompts internos</button>
        </div>

        <section data-gemini-settings-panel="model" class="gemini-settings-panel">
          <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">El modelo seleccionado se usará para tendencias, propuestas, redacción, revisión y el asistente editorial. Las imágenes conservan su modelo especializado.</div>
          <label class="mt-4 block space-y-2">
            <span class="text-xs font-bold text-slate-800">Modelo para texto</span>
            <select id="gemini-model-select" disabled class="input-field h-11"><option>Cargando modelos disponibles por la API...</option></select>
          </label>
          <div id="gemini-model-status" class="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500" aria-live="polite"><i data-lucide="loader-circle" class="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin"></i>Consultando los modelos con capacidad de generación de contenido.</div>
          <p class="mt-3 text-[10px] leading-relaxed text-slate-400">La preferencia se guarda en este navegador. El modelo económico predeterminado es <strong>${DEFAULT_GEMINI_MODEL}</strong>.</p>
        </section>

        <section data-gemini-settings-panel="prompts" class="gemini-settings-panel hidden">
          <div class="gemini-prompt-profile-bar">
            <label><span>Configuración activa</span><select id="gemini-prompt-profile-select"></select></label>
            <label><span>Nombre para guardar</span><input id="gemini-prompt-profile-name" type="text" maxlength="80" placeholder="Ej. Voz institucional cálida"></label>
            <div class="gemini-prompt-profile-actions">
              <button id="clear-internal-prompts" type="button" class="is-free-mode"><i data-lucide="wind"></i><span>Modo libre</span></button>
              <button id="restore-default-prompts" type="button"><i data-lucide="rotate-ccw"></i><span>Restaurar defaults</span></button>
            </div>
          </div>
          <p class="gemini-prompt-free-note">Modo libre vacía todas las directrices editoriales visibles. La estructura técnica del artículo y de la exportación permanece protegida.</p>
          <div class="gemini-prompt-workspace">
            <nav id="gemini-prompt-list" class="gemini-prompt-list" aria-label="Prompts internos"></nav>
            <div class="gemini-prompt-editor">
              <div><span id="gemini-prompt-group"></span><h4 id="gemini-prompt-title"></h4><p id="gemini-prompt-description"></p></div>
              <textarea id="gemini-prompt-text" spellcheck="true"></textarea>
              <div class="gemini-prompt-editor-note"><span>Protegido</span> Los esquemas JSON y variables técnicas permanecen internos para evitar errores de formato.</div>
            </div>
          </div>
        </section>
      </div>
    `,
    footerButtonsHtml: `
      <button id="cancel-gemini-model" class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
      <button id="save-gemini-model" class="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Guardar configuración</button>
    `
  });

  const select = document.getElementById("gemini-model-select");
  const status = document.getElementById("gemini-model-status");
  const saveButton = document.getElementById("save-gemini-model");
  const promptProfileSelect = document.getElementById("gemini-prompt-profile-select");
  const promptProfileName = document.getElementById("gemini-prompt-profile-name");
  const promptList = document.getElementById("gemini-prompt-list");
  const promptText = document.getElementById("gemini-prompt-text");
  const renderProfileOptions = () => {
    profiles = listMarciePromptProfiles();
    promptProfileSelect.replaceChildren(...profiles.map((profile) => {
      const option = document.createElement("option"); option.value = profile.id; option.textContent = profile.name; return option;
    }));
    promptProfileSelect.value = selectedProfileId;
    const current = profiles.find((profile) => profile.id === selectedProfileId);
    promptProfileName.value = current?.builtIn ? "" : current?.name || "";
  };
  const renderPromptEditor = () => {
    const definition = MARCIE_PROMPT_DEFINITIONS.find((item) => item.id === selectedPromptId) || MARCIE_PROMPT_DEFINITIONS[0];
    promptList.innerHTML = MARCIE_PROMPT_DEFINITIONS.map((item) => `<button type="button" data-prompt-id="${item.id}" class="${item.id === definition.id ? "is-active" : ""}"><span>${item.group}</span><strong>${item.label}</strong></button>`).join("");
    document.getElementById("gemini-prompt-group").textContent = definition.group;
    document.getElementById("gemini-prompt-title").textContent = definition.label;
    document.getElementById("gemini-prompt-description").textContent = definition.description;
    promptText.value = Object.prototype.hasOwnProperty.call(draftPrompts, definition.id) ? draftPrompts[definition.id] : definition.defaultPrompt;
  };
  renderProfileOptions();
  renderPromptEditor();
  document.querySelectorAll("[data-gemini-settings-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.geminiSettingsTab;
    document.querySelectorAll("[data-gemini-settings-tab]").forEach((item) => { const active = item === button; item.classList.toggle("is-active", active); item.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-gemini-settings-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.geminiSettingsPanel !== tab));
  }));
  promptList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prompt-id]"); if (!button) return;
    draftPrompts[selectedPromptId] = promptText.value.trim(); selectedPromptId = button.dataset.promptId; renderPromptEditor();
  });
  promptText?.addEventListener("input", () => { draftPrompts[selectedPromptId] = promptText.value; });
  promptProfileSelect?.addEventListener("change", () => {
    selectedProfileId = promptProfileSelect.value;
    const profile = listMarciePromptProfiles().find((item) => item.id === selectedProfileId);
    draftPrompts = { ...(profile?.prompts || getDefaultMarciePrompts()) }; renderProfileOptions(); renderPromptEditor();
  });
  document.getElementById("restore-default-prompts")?.addEventListener("click", () => { draftPrompts = getDefaultMarciePrompts(); selectedProfileId = DEFAULT_PROMPT_PROFILE_ID; renderProfileOptions(); renderPromptEditor(); });
  document.getElementById("clear-internal-prompts")?.addEventListener("click", () => {
    draftPrompts = getFreeMarciePrompts();
    selectedProfileId = FREE_PROMPT_PROFILE_ID;
    renderProfileOptions();
    renderPromptEditor();
    showToast("Prompts editoriales vaciados. Guarda la configuración para activar el modo libre.", "info");
  });
  document.getElementById("cancel-gemini-model")?.addEventListener("click", closeActiveModal);
  saveButton?.addEventListener("click", () => {
    const selectedModel = setConfiguredGeminiModel(select?.value || DEFAULT_GEMINI_MODEL);
    draftPrompts[selectedPromptId] = promptText.value.trim();
    const defaults = getDefaultMarciePrompts();
    const isDefaultDraft = JSON.stringify(draftPrompts) === JSON.stringify(defaults);
    const isFreeDraft = MARCIE_PROMPT_DEFINITIONS.every(({ id }) => !String(draftPrompts[id] || "").trim());
    if (selectedProfileId === DEFAULT_PROMPT_PROFILE_ID && isDefaultDraft && !promptProfileName.value.trim()) {
      setActiveMarciePromptProfile(DEFAULT_PROMPT_PROFILE_ID);
    } else if (selectedProfileId === FREE_PROMPT_PROFILE_ID && isFreeDraft && !promptProfileName.value.trim()) {
      setActiveMarciePromptProfile(FREE_PROMPT_PROFILE_ID);
    } else {
      const savedProfile = saveMarciePromptProfile({ id: selectedProfileId, name: promptProfileName.value, prompts: draftPrompts });
      selectedProfileId = savedProfile.id;
    }
    updateGeminiModelBadge(selectedModel);
    closeActiveModal();
    showToast(`Gemini y prompts configurados con ${compactGeminiModelLabel(selectedModel)}.`, "success");
  });

  try {
    let models;
    let loadedFromApi = true;
    try {
      models = await listGeminiModels();
    } catch (error) {
      loadedFromApi = false;
      models = getStaticGeminiTextModels();
    }
    if (!select || !document.body.contains(select)) return;
    select.replaceChildren(...models.map((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      const limits = model.inputTokenLimit ? ` · ${model.inputTokenLimit.toLocaleString("es-MX")} tokens` : "";
      const economical = model.id === DEFAULT_GEMINI_MODEL ? " · Predeterminado económico" : "";
      option.textContent = `${model.label}${limits}${economical}`;
      return option;
    }));
    select.value = models.some((model) => model.id === currentModel) ? currentModel : DEFAULT_GEMINI_MODEL;
    if (!select.value && models[0]) select.value = models[0].id;
    select.disabled = false;
    if (status) {
      status.innerHTML = loadedFromApi
        ? `<i data-lucide="circle-check" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"></i>${models.length} modelos de texto disponibles obtenidos desde la API.`
        : `<i data-lucide="triangle-alert" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"></i>No fue posible consultar la API. Se muestra la lista de respaldo.`;
    }
    window.lucide?.createIcons?.();
  } catch (error) {
    if (status) status.textContent = `No se pudieron cargar los modelos: ${error.message}`;
  }
}

window.__marcieSetArticleGenerationState = ({ isGenerating, current, total, audienceLabel, message, heading } = {}) => {
  appState.isGeneratingArticle = Boolean(isGenerating);
  appState.articleGenerationProgress = appState.isGeneratingArticle
    ? {
        current: Number.isFinite(Number(current)) ? Number(current) : null,
        total: Number.isFinite(Number(total)) ? Number(total) : null,
        audienceLabel: String(audienceLabel || "").trim(),
        message: String(message || "").trim(),
        heading: String(heading || "").trim()
      }
    : null;
  if (appState.currentTab === "article" && dom.articleView && dom.editorialGuideView) {
    if (appState.isGeneratingArticle) {
      dom.editorialGuideView.classList.add("hidden");
      dom.editorialGuideView.style.display = "none";
      dom.editorialGuideView.hidden = true;
      dom.articleView.classList.remove("hidden");
      dom.articleView.style.display = "";
      dom.articleView.hidden = false;
    }
  }
  renderActiveSession();
};

window.__marcieShowArticleGenerationSpinner = (session = {}, progress = {}) => {
  window.__marcieSetArticleGenerationState({ isGenerating: true, ...progress });
  appState.currentTab = "article";
  if (dom.articleView) {
    dom.articleView.classList.remove("hidden");
    dom.articleView.style.display = "";
    dom.articleView.hidden = false;
  }
  if (dom.structuredView) {
    dom.structuredView.classList.add("hidden");
    dom.structuredView.style.display = "none";
    dom.structuredView.hidden = true;
  }
  if (dom.seoView) {
    dom.seoView.classList.add("hidden");
    dom.seoView.style.display = "none";
    dom.seoView.hidden = true;
  }
  if (appState.currentTab === "article") {
    renderArticleGeneratingState(session);
  }
};

window.__marcieHideArticleGenerationSpinner = () => {
  window.__marcieSetArticleGenerationState({ isGenerating: false });
};

const ARTICLE_GENERATOR_ANIME_SRC = "/vendor/animejs/anime.esm.min.js";
let animeModulePromise = null;
const ARTICLE_GENERATION_SPINNER_HOST_ID = "article-generation-spinner";
let articleGeneratingAnimation = null;
let automationProgressAnimations = [];

function animateSpinnerTarget(animate, targets, params = {}) {
  if (!targets || !animate || typeof animate !== "function") return null;
  return animate(targets, params);
}

function getArticleViewContentHost() {
  return dom.articleView ? dom.articleView.querySelector("article") : null;
}

function getArticleGenerationSpinnerHost() {
  if (!dom.articleView) return null;

  const existing = document.getElementById(ARTICLE_GENERATION_SPINNER_HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement("div");
  host.id = ARTICLE_GENERATION_SPINNER_HOST_ID;
  host.className = "absolute inset-0 z-20 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6";
  host.dataset.articleGenerationHost = "true";
  return host;
}

function hideArticleViewContentForGeneration() {
  if (!dom.articleView) return;

  dom.articleView.style.position = "relative";

  const articleGuideShell = document.getElementById("article-guide-shell");
  const articleGuideView = document.getElementById("editorial-guide-view");
  if (articleGuideShell) articleGuideShell.style.display = "none";
  if (articleGuideView) {
    articleGuideView.style.display = "none";
    articleGuideView.hidden = true;
    articleGuideView.classList.add("hidden");
  }

  Array.from(dom.articleView.children).forEach((child) => {
    if (child.id === ARTICLE_GENERATION_SPINNER_HOST_ID) {
      child.style.display = "";
      child.hidden = false;
      child.classList.remove("hidden");
      return;
    }

    child.style.display = "none";
    child.hidden = true;
    child.classList.add("hidden");
  });
}

function restoreArticleViewContent() {
  if (!dom.articleView) return;

  Array.from(dom.articleView.children).forEach((child) => {
    if (child.id === ARTICLE_GENERATION_SPINNER_HOST_ID) {
      child.remove();
      return;
    }

    child.style.display = "";
    child.hidden = false;
    child.classList.remove("hidden");
  });

  const spinnerHost = document.getElementById(ARTICLE_GENERATION_SPINNER_HOST_ID);
  if (spinnerHost) spinnerHost.remove();
}

// Referencias del DOM
const $ = (id) => document.getElementById(id);

const dom = {
  sessionList: $("session-list"),
  sessionSearch: $("session-search"),
  btnNewSession: $("btn-new-session"),
  btnSeeMoreSessions: $("btn-see-more-sessions"),
  filterButtons: document.querySelectorAll("[data-filter]"),
  btnCycleView: $("btn-cycle-view"),
  audienceButtons: document.querySelectorAll("[data-audience]"),

  // Contenedores de vista central
  centerSubheader: $("center-subheader"),
  editorialModeBadge: $("editorial-mode-badge"),
  editorialModeBadgeLabel: $("editorial-mode-badge-label"),
  articleView: $("article-view"),
  structuredView: $("structured-view"),
  seoView: $("seo-view"),
  structuredJsonCode: $("structured-json-code"),
  seoFormContainer: $("seo-form-container"),

  editorialGuideView: $("editorial-guide-view"),
  editorialGuideShell: $("article-guide-shell"),

  // Elementos de artículo
  articleTitle: $("article-title"),
  articleSubtitle: $("article-subtitle"),
  articleMetaDate: $("article-meta-date"),
  articleMetaAuthor: $("article-meta-author"),
  articleMetaReadTime: $("article-meta-readtime"),
  articleMetaTags: $("article-meta-tags"),
  articleFeaturedImage: $("article-featured-image"),
  articleBodyContainer: $("article-body-container"),
  articleSourcesList: $("article-sources-list"),
  btnSourceCitationFormat: $("btn-source-citation-format"),
  seoTitleInput: $("seo-title-input"),
  seoDescriptionInput: $("seo-description-input"),
  seoKeywordsInput: $("seo-keywords-input"),
  seoSlugInput: $("seo-slug-input"),
  seoDescriptionCounter: $("seo-description-counter"),
  evidenceSummary: $("article-evidence-summary"),
  evidenceBlockers: $("article-evidence-blockers"),
  evidenceMatrix: $("article-evidence-matrix"),
  btnVerifyEvidence: $("btn-verify-evidence"),

  // Botones de acción
  btnCopyArticle: $("btn-copy-article"),
  btnShareArticle: $("btn-share-article"),
  btnArticleOptions: $("btn-article-options"),
  btnNotificationBell: document.querySelector(".btn-ghost.rounded-full"),
  btnTrendInsightMore: $("btn-trend-insight-more"),

  // Status indicator
  firebaseStatus: $("firebase-status-indicator"),
  userAvatar: $("user-avatar")
};

function slugifySeo(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function renderSeoPanel(article = {}) {
  const seo = article.seo || {};
  if (dom.seoTitleInput && document.activeElement !== dom.seoTitleInput) dom.seoTitleInput.value = seo.title || article.title || "";
  if (dom.seoDescriptionInput && document.activeElement !== dom.seoDescriptionInput) dom.seoDescriptionInput.value = seo.description || article.excerpt || "";
  if (dom.seoKeywordsInput && document.activeElement !== dom.seoKeywordsInput) dom.seoKeywordsInput.value = Array.isArray(seo.keywords) ? seo.keywords.join(", ") : (seo.keywords || (article.tags || []).join(", "));
  if (dom.seoSlugInput && document.activeElement !== dom.seoSlugInput) dom.seoSlugInput.value = seo.slug || slugifySeo(article.title || "");
  if (dom.seoDescriptionCounter) dom.seoDescriptionCounter.textContent = `${String(dom.seoDescriptionInput?.value || "").length} / 155`;
}

function renderEvidencePanel(article = {}) {
  const claims = Array.isArray(article.articleClaims) ? article.articleClaims : [];
  const uniqueClaims = claims.filter((claim, index, allClaims) => {
    const key = String(claim?.claim || claim?.text || claim?.id || "").trim().toLowerCase();
    return key && allClaims.findIndex((candidate) => String(candidate?.claim || candidate?.text || candidate?.id || "").trim().toLowerCase() === key) === index;
  });
  const rejectedSources = Array.isArray(article.sourceAudit) ? article.sourceAudit : [];
  const blockers = articleVerificationBlockers(article, { editorialMode: getActiveSession()?.editorialMode, scope: "evidence" });
  const pendingClaimTexts = new Set(uniqueClaims
    .filter((claim) => claim?.status !== "supported")
    .map((claim) => String(claim?.claim || claim?.text || "").trim().toLowerCase())
    .filter(Boolean));
  const summaryBlockers = blockers.filter((blocker) => !pendingClaimTexts.has(String(blocker || "").trim().toLowerCase()));
  const verifiedSourceCount = (Array.isArray(article.researchSources || article.sources) ? (article.researchSources || article.sources) : [])
    .filter((source) => source?.verificationStatus === "verified").length;
  const pendingClaimCount = uniqueClaims.filter((claim) => claim?.status !== "supported").length;
  const coverage = Number(article.verification?.coverage || 0);
  const verificationStatus = String(article.verification?.status || "pending");
  const verificationError = String(article.verification?.error || "").trim();
  const isChecking = verificationStatus === "verifying";
  const isComplete = verificationStatus === "verified" && blockers.length === 0;
  const evidencePanel = dom.evidenceSummary?.closest(".article-evidence-shell");
  if (evidencePanel) evidencePanel.dataset.state = isChecking ? "checking" : isComplete ? "verified" : verificationError ? "error" : blockers.length ? "attention" : "pending";
  if (dom.evidenceSummary) dom.evidenceSummary.textContent = isChecking
    ? `Comprobando ${verifiedSourceCount || "las"} fuente${verifiedSourceCount === 1 ? "" : "s"} en segundo plano…`
    : isComplete
      ? `Listo · ${verifiedSourceCount} fuente${verifiedSourceCount === 1 ? "" : "s"} y todas las afirmaciones respaldadas`
      : verificationError
        ? "La comprobación no pudo terminar"
        : pendingClaimCount
          ? pendingClaimCount === 1 ? "1 afirmación requiere revisión editorial" : `${pendingClaimCount} afirmaciones requieren revisión editorial`
          : blockers.length && verificationStatus !== "pending"
            ? "El artículo necesita evidencia antes de aprobarse"
            : "La comprobación se ejecutará automáticamente";
  if (dom.btnVerifyEvidence) {
    dom.btnVerifyEvidence.classList.toggle("hidden", isChecking || !verificationError);
    dom.btnVerifyEvidence.disabled = isChecking;
    dom.btnVerifyEvidence.textContent = "Reintentar";
  }
  if (dom.evidenceBlockers) {
    const notices = verificationError ? [verificationError] : verificationStatus === "pending" ? [] : summaryBlockers;
    dom.evidenceBlockers.textContent = notices.join(" · ");
    dom.evidenceBlockers.classList.toggle("hidden", notices.length === 0 || isChecking);
  }
  if (dom.evidenceMatrix) {
    const evidenceLinks = Array.isArray(article.evidenceLinks) ? article.evidenceLinks : [];
    const sources = Array.isArray(article.researchSources || article.sources) ? (article.researchSources || article.sources) : [];
    const sourcesById = new Map(sources.map((source) => [String(source?.id || ""), source]));
    const referenceByKey = new Map();
    const evidenceSources = [];
    evidenceLinks.forEach((link) => {
      const source = sourcesById.get(String(link?.sourceId || "")) || {};
      const url = safeSourceUrlForArticle(link?.url || source?.url || source?.finalUrl || "");
      const key = String(link?.sourceId || url || link?.title || source?.title || "").trim();
      if (!key || referenceByKey.has(key)) return;
      const reference = `F${evidenceSources.length + 1}`;
      const title = String(link?.title || source?.title || source?.publisher || "Fuente verificada").trim();
      let domain = String(source?.domain || "").trim();
      if (!domain && url !== "#") {
        try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}
      }
      const entry = { key, reference, title, domain, url };
      referenceByKey.set(key, entry);
      evidenceSources.push(entry);
    });
    const renderClaim = (claim, actionable = false) => {
      const links = evidenceLinks.filter((link) => link.claimId === claim.id || link.claim === claim.claim);
      const claimReferences = [...new Map(links.map((link) => {
        const source = sourcesById.get(String(link?.sourceId || "")) || {};
        const url = safeSourceUrlForArticle(link?.url || source?.url || source?.finalUrl || "");
        const key = String(link?.sourceId || url || link?.title || source?.title || "").trim();
        return [key, referenceByKey.get(key)];
      }).filter(([, entry]) => entry)).values()];
      const badge = claim.status === "supported" ? "bg-emerald-100 text-emerald-700" : claim.status === "contradicted" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
      const statusLabel = claim.status === "supported" ? "Respaldada" : claim.status === "contradicted" ? "Contradicha" : claim.status === "partially_supported" ? "Parcial" : "Sin respaldo";
      const supportSummary = String(claim.supportSummary || links.find((link) => link?.supportSummary)?.supportSummary || "").trim();
      const referencesHtml = claimReferences.length
        ? `<div class="mt-3 flex flex-wrap items-center gap-1.5"><span class="mr-1 text-[10px] font-medium text-slate-500">Evidencia:</span>${claimReferences.map((entry) => entry.url === "#" ? `<span class="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[9px] font-semibold text-slate-600" title="${escapeHtml(entry.title)}">${entry.reference}</span>` : `<a class="rounded-md border border-teal-200 bg-teal-50 px-1.5 py-1 text-[9px] font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener" title="${escapeHtml(entry.title)}" aria-label="Abrir ${entry.reference}: ${escapeHtml(entry.title)}">${entry.reference}</a>`).join("")}</div>`
        : `<p class="mt-3 text-[10px] font-medium text-amber-700">Sin una página asociada.</p>`;
      const reviewAction = actionable ? `<button type="button" data-review-evidence-claim="${escapeHtml(claim.id || "")}" class="article-evidence-review-action">Revisar en la redacción</button>` : "";
      return `<article class="article-evidence-claim"><div class="flex items-start justify-between gap-3"><p class="text-xs leading-relaxed text-slate-700">${escapeHtml(claim.claim || claim.text || "Afirmación")}</p><span class="shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${badge}">${statusLabel}</span></div>${supportSummary ? `<p class="mt-2 text-[10px] leading-relaxed text-slate-500">${escapeHtml(supportSummary)}</p>` : ""}${referencesHtml}${reviewAction}</article>`;
    };
    const pendingClaims = uniqueClaims.filter((claim) => claim?.status !== "supported");
    const claimsHtml = pendingClaims.length
      ? `<div class="article-evidence-issues"><div class="article-evidence-issues-heading"><span>Requiere tu criterio editorial</span><span>${pendingClaims.length}</span></div>${pendingClaims.map((claim) => renderClaim(claim, true)).join("")}</div>`
      : "";
    const sourcesHtml = evidenceSources.length ? `<div class="space-y-2">${evidenceSources.map((source) => `<div class="flex min-w-0 items-center gap-2"><span class="shrink-0 rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-600">${source.reference}</span><div class="min-w-0 flex-1"><p class="truncate text-[10px] font-semibold text-slate-700" title="${escapeHtml(source.title)}">${escapeHtml(source.title)}</p><p class="truncate text-[9px] text-slate-400">${escapeHtml(source.domain || "Página verificada")}</p></div>${source.url === "#" ? "" : `<a class="shrink-0 text-[10px] font-semibold text-teal-700 hover:underline" href="${escapeHtml(source.url)}" target="_blank" rel="noopener">Abrir</a>`}</div>`).join("")}</div>` : `<p class="text-xs text-slate-500">Sin referencias asociadas todavía.</p>`;
    const auditHtml = rejectedSources.length ? `<details class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><summary class="cursor-pointer text-xs font-semibold text-amber-900">${rejectedSources.length} fuente(s) descartadas durante la recuperación</summary><div class="mt-2 space-y-2">${rejectedSources.map((source) => `<div class="rounded-lg border border-amber-100 bg-white/70 p-2"><b class="block truncate text-[10px] text-slate-700">${escapeHtml(source.title || source.url || "Fuente")}</b><span class="text-[9px] text-amber-800">${escapeHtml(source.reason || "verification_error")}</span></div>`).join("")}</div></details>` : "";
    const technicalDetails = !isChecking && (uniqueClaims.length || evidenceSources.length || rejectedSources.length)
      ? `<details class="article-evidence-details"><summary>Detalles de evidencia <span>${coverage}% · ${uniqueClaims.length} afirmaciones</span></summary><div class="article-evidence-details-body"><div><p class="article-evidence-detail-label">Matriz completa</p><div class="space-y-2">${uniqueClaims.length ? uniqueClaims.map((claim) => renderClaim(claim)).join("") : `<p class="text-xs text-slate-500">Sin afirmaciones extraídas.</p>`}</div></div><div><p class="article-evidence-detail-label">Fuentes de la matriz</p>${sourcesHtml}</div>${auditHtml}</div></details>`
      : "";
    dom.evidenceMatrix.innerHTML = isChecking ? `<div class="article-evidence-progress"><span></span><p>Contrastando afirmaciones con las páginas recuperadas. Puedes seguir editando mientras termina.</p></div>` : `${claimsHtml}${technicalDetails}`;
    dom.evidenceMatrix.querySelectorAll("[data-review-evidence-claim]").forEach((button) => button.addEventListener("click", () => {
      dom.articleBodyContainer?.scrollIntoView({ behavior: "smooth", block: "center" });
      dom.articleBodyContainer?.focus({ preventScroll: true });
    }));
  }
}

function getSessionEvidenceCandidates(session = {}) {
  const candidates = [];
  const appendSources = (articleOrDossier = {}) => {
    const sources = articleOrDossier.researchSources || articleOrDossier.sources || [];
    if (Array.isArray(sources)) candidates.push(...sources);
  };
  appendSources(session.article || {});
  Object.values(session.articlesByAudience || {}).forEach(appendSources);
  (Array.isArray(session.trends) ? session.trends : []).forEach(appendSources);
  return sanitizeTrustedSources(candidates);
}

const automaticEvidenceTimers = new Map();
const automaticEvidenceRuns = new Map();

function evidenceJobKey(session = {}) {
  return `${session.id || "session"}:${session.audience || session.article?.audience || "educators"}`;
}

function scheduleAutomaticEvidenceVerification(session, { delay = 1400 } = {}) {
  if (!session?.article?.blocks?.length || !getSessionEvidenceCandidates(session).length) return;
  const key = evidenceJobKey(session);
  clearTimeout(automaticEvidenceTimers.get(key));
  automaticEvidenceTimers.set(key, setTimeout(() => {
    automaticEvidenceTimers.delete(key);
    runAutomaticEvidenceVerification(session).catch((error) => console.warn("[MarcieEvidence] Verificación automática incompleta:", error));
  }, delay));
}

async function runAutomaticEvidenceVerification(session, { notify = false } = {}) {
  const key = evidenceJobKey(session);
  if (!session?.article || automaticEvidenceRuns.has(key)) return automaticEvidenceRuns.get(key) || null;
  const audience = session.audience || session.article.audience || "educators";
  const evidenceCandidates = getSessionEvidenceCandidates(session);
  if (!evidenceCandidates.length) return null;
  const work = (async () => {
    const articleAtStart = { ...session.article, sources: evidenceCandidates, researchSources: evidenceCandidates };
    const contentHashAtStart = await articleContentHash(articleAtStart);
    session.article.verification = { ...(session.article.verification || {}), status: "verifying", error: "" };
    if (getActiveSession()?.id === session.id) renderEvidencePanel(session.article);
    try {
      const verified = await verifyArticleEvidence({ article: articleAtStart, topic: session.topic || session.title, additionalSearches: 0 });
      const currentArticle = session.articlesByAudience?.[audience] || session.article;
      const currentHash = await articleContentHash({ ...currentArticle, sources: evidenceCandidates, researchSources: evidenceCandidates });
      if (currentHash !== contentHashAtStart) {
        scheduleAutomaticEvidenceVerification(session, { delay: 500 });
        return null;
      }
      session.article = verified;
      session.articlesByAudience = { ...(session.articlesByAudience || {}), [audience]: verified };
      session.approvedAudiences = (session.approvedAudiences || []).filter((item) => item !== audience);
      session.status = "review_required";
      await saveMarcieSession(session);
      if (getActiveSession()?.id === session.id) renderActiveSession();
      const pending = (verified.articleClaims || []).filter((claim) => claim?.status !== "supported").length;
      if (notify) showToast(pending ? pending === 1 ? "1 afirmación requiere revisión editorial." : `${pending} afirmaciones requieren revisión editorial.` : "Control factual completado automáticamente.", pending ? "info" : "success");
      return verified;
    } catch (error) {
      session.article.verification = { ...(session.article.verification || {}), status: "error", error: error.message || "La comprobación no pudo terminar." };
      if (getActiveSession()?.id === session.id) renderEvidencePanel(session.article);
      if (notify) showToast(`No fue posible completar el control factual: ${error.message}`, "error");
      return null;
    }
  })().finally(() => automaticEvidenceRuns.delete(key));
  automaticEvidenceRuns.set(key, work);
  return work;
}

let seoSaveTimer = null;
function invalidateMaterialApproval(session, reason = "El contenido cambió después de verificarse.") {
  if (!session?.article) return;
  const audience = session.audience || session.article.audience || "educators";
  session.approvedAudiences = (session.approvedAudiences || []).filter((item) => item !== audience);
  delete session.article.approval;
  session.article.verification = { ...(session.article.verification || {}), status: "stale", coverage: 0, blockers: [reason], verifiedAt: "" };
  session.status = "review_required";
  const publication = session.publicationsByAudience?.[audience];
  if (publication?.status === "future") cancelScheduledPublication(session, reason).catch((error) => console.warn("[MarcieWordPress] No se pudo cancelar la programación:", error));
  scheduleAutomaticEvidenceVerification(session);
}

function bindSeoControls() {
  [dom.seoTitleInput, dom.seoDescriptionInput, dom.seoKeywordsInput, dom.seoSlugInput].filter(Boolean).forEach((input) => input.addEventListener("input", () => {
    const session = getActiveSession();
    if (!session?.article) return;
    const audience = session.audience || session.article.audience || "educators";
    session.article.seo = {
      title: dom.seoTitleInput.value.trim(),
      description: dom.seoDescriptionInput.value.trim().slice(0, 155),
      keywords: dom.seoKeywordsInput.value.split(",").map((value) => value.trim()).filter(Boolean),
      slug: slugifySeo(dom.seoSlugInput.value || dom.seoTitleInput.value)
    };
    session.articlesByAudience = { ...(session.articlesByAudience || {}), [audience]: session.article };
    invalidateMaterialApproval(session, "Los metadatos SEO cambiaron después de la aprobación.");
    if (dom.seoDescriptionCounter) dom.seoDescriptionCounter.textContent = `${session.article.seo.description.length} / 155`;
    clearTimeout(seoSaveTimer);
    seoSaveTimer = setTimeout(() => saveMarcieSession(session).catch((error) => showToast(error.message, "error")), 450);
  }));
}

const ARTICLE_META_ROW_CLASS = "flex flex-wrap items-center gap-3 text-sm text-slate-600 mb-8";
const ARTICLE_TITLE_ID = "article-title";
const ARTICLE_SUBTITLE_ID = "article-subtitle";
const authorNameCache = new Map();
const authorNamePending = new Map();

const ARTICLE_APPEARANCE_DEFAULTS = Object.freeze({
  "data-text-title-size": "xsmall",
  "data-text-subtitle-size": "small",
  "data-text-p-size": "normal",
  "data-text-title-weight": "semibold",
  "data-text-subtitle-weight": "normal",
  "data-text-font": "sans",
  "data-quote-color": "teal",
  "data-text-line-height": "normal"
});

const ARTICLE_TEMPLATES = Object.freeze([
  {
    id: "default", name: "Default Editorial", description: "El estilo original de Marcie, limpio y equilibrado.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    vars: { canvas: "#ffffff", surface: "#ffffff", heading: "#0f172a", text: "#334155", muted: "#64748b", accent: "#0f766e", accentSoft: "#f0fdfa", border: "#e2e8f0", quoteBg: "#eff6ff", quoteBorder: "#0f766e", quoteText: "#0f172a", quoteIcon: "#93c5fd", fontHeading: "'Inter', sans-serif", fontBody: "'Inter', sans-serif", radius: "0.5rem", titleSize: "1.3rem", titleLine: "1.75rem", subtitleSize: "1rem", subtitleLine: "1.5rem", bodySize: "1rem", bodyLine: "1.5", coverRadius: "0.5rem", preview: "linear-gradient(135deg,#cbd5e1,#0f766e)" }
  },
  {
    id: "nordic", name: "Nordic Journal", description: "Serif cálida, aire generoso y tonos de papel.",
    fontUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500;6..72,700&display=swap",
    vars: { canvas: "#fbfaf6", surface: "#fffefb", heading: "#292722", text: "#514d45", muted: "#817b70", accent: "#8a6a45", accentSoft: "#f3ede3", border: "#ddd6c9", quoteBg: "#f2eee6", quoteBorder: "#8a6a45", quoteText: "#39352f", quoteIcon: "#c5b69f", fontHeading: "'Newsreader', serif", fontBody: "'DM Sans', sans-serif", radius: "0.25rem", titleSize: "2rem", titleLine: "1.08", subtitleSize: "1.08rem", subtitleLine: "1.6", bodySize: "1.03rem", bodyLine: "1.75", coverRadius: "0.25rem", preview: "linear-gradient(135deg,#d8c7aa,#7d8b78)" }
  },
  {
    id: "signal", name: "Signal Brutalist", description: "Contraste directo, retícula marcada y carácter gráfico.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;600&display=swap",
    vars: { canvas: "#f7f500", surface: "#ffffff", heading: "#111111", text: "#171717", muted: "#4b4b4b", accent: "#ef3b24", accentSoft: "#fff0ed", border: "#111111", quoteBg: "#111111", quoteBorder: "#ef3b24", quoteText: "#ffffff", quoteIcon: "#f7f500", fontHeading: "'Archivo Black', sans-serif", fontBody: "'IBM Plex Sans', sans-serif", radius: "0rem", titleSize: "2.15rem", titleLine: "1", subtitleSize: "1rem", subtitleLine: "1.45", bodySize: "1rem", bodyLine: "1.55", coverRadius: "0rem", preview: "linear-gradient(135deg,#111 0 48%,#ef3b24 48% 70%,#f7f500 70%)" }
  },
  {
    id: "coral", name: "Coral Magazine", description: "Revista contemporánea con ritmo y acentos vibrantes.",
    fontUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap",
    vars: { canvas: "#fffaf7", surface: "#ffffff", heading: "#3b1f2b", text: "#583b46", muted: "#8b6e78", accent: "#e85d4a", accentSoft: "#fff0ea", border: "#f0d3c9", quoteBg: "#fff0ea", quoteBorder: "#e85d4a", quoteText: "#5a2830", quoteIcon: "#f6b8aa", fontHeading: "'Fraunces', serif", fontBody: "'DM Sans', sans-serif", radius: "1rem", titleSize: "2.05rem", titleLine: "1.08", subtitleSize: "1.08rem", subtitleLine: "1.55", bodySize: "1rem", bodyLine: "1.68", coverRadius: "1rem", preview: "linear-gradient(135deg,#ffb69f,#e85d4a 55%,#732c45)" }
  },
  {
    id: "academic", name: "Academic Ledger", description: "Sobriedad académica, jerarquía clara y lectura rigurosa.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;600&display=swap",
    vars: { canvas: "#f8f7f3", surface: "#ffffff", heading: "#182a3a", text: "#35495a", muted: "#71808d", accent: "#2f5d7c", accentSoft: "#edf3f6", border: "#cfd8de", quoteBg: "#edf3f6", quoteBorder: "#2f5d7c", quoteText: "#203b50", quoteIcon: "#a8c2d2", fontHeading: "'Libre Baskerville', serif", fontBody: "'Source Sans 3', sans-serif", radius: "0.2rem", titleSize: "1.85rem", titleLine: "1.22", subtitleSize: "1rem", subtitleLine: "1.6", bodySize: "1rem", bodyLine: "1.72", coverRadius: "0.2rem", preview: "linear-gradient(135deg,#dce6eb,#426b84)" }
  },
  {
    id: "botanical", name: "Botanical Essay", description: "Verdes naturales y una voz editorial orgánica.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Manrope:wght@400;500;600&display=swap",
    vars: { canvas: "#f5f8f1", surface: "#fcfdf9", heading: "#20382b", text: "#405448", muted: "#718176", accent: "#56785f", accentSoft: "#e8f0e5", border: "#ccd9c9", quoteBg: "#e8f0e5", quoteBorder: "#56785f", quoteText: "#294333", quoteIcon: "#a8c0aa", fontHeading: "'Lora', serif", fontBody: "'Manrope', sans-serif", radius: "1.25rem", titleSize: "1.95rem", titleLine: "1.18", subtitleSize: "1.04rem", subtitleLine: "1.65", bodySize: "1rem", bodyLine: "1.75", coverRadius: "1.25rem", preview: "linear-gradient(135deg,#b8caa8,#4d755c 55%,#e4c894)" }
  },
  {
    id: "newspaper", name: "Neo Newspaper", description: "Impacto periodístico con estructura editorial moderna.",
    fontUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Roboto+Slab:wght@500;700&display=swap",
    vars: { canvas: "#f6f3eb", surface: "#fffdf7", heading: "#181818", text: "#333333", muted: "#66615a", accent: "#b42318", accentSoft: "#f9e9e5", border: "#333333", quoteBg: "#fffdf7", quoteBorder: "#b42318", quoteText: "#181818", quoteIcon: "#d7aaa3", fontHeading: "'Roboto Slab', serif", fontBody: "'IBM Plex Sans', sans-serif", radius: "0rem", titleSize: "2.2rem", titleLine: "1.03", subtitleSize: "1.02rem", subtitleLine: "1.5", bodySize: "1rem", bodyLine: "1.65", coverRadius: "0rem", preview: "linear-gradient(135deg,#222,#ddd4c2 50%,#b42318 51%)" }
  },
  {
    id: "midnight", name: "Midnight Ink", description: "Tinta profunda, superficies nocturnas y detalles dorados.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap",
    vars: { canvas: "#101722", surface: "#151f2d", heading: "#fff8e7", text: "#eef4ff", muted: "#c0ccdc", accent: "#e2bd73", accentSoft: "#253044", border: "#43536a", quoteBg: "#1d2939", quoteBorder: "#e2bd73", quoteText: "#fff4d6", quoteIcon: "#c49d55", fontHeading: "'Playfair Display', serif", fontBody: "'Manrope', sans-serif", radius: "0.65rem", titleSize: "2rem", titleLine: "1.12", subtitleSize: "1.05rem", subtitleLine: "1.6", bodySize: "1rem", bodyLine: "1.72", coverRadius: "0.65rem", preview: "linear-gradient(135deg,#080d14,#20334d 58%,#d7ad5c)" }
  },
  {
    id: "playful", name: "Playful Learning", description: "Color, claridad y energía para contenidos educativos.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap",
    vars: { canvas: "#fffdf5", surface: "#ffffff", heading: "#27335b", text: "#465175", muted: "#7882a0", accent: "#f26b4f", accentSoft: "#fff0cc", border: "#d9def2", quoteBg: "#eaf7ff", quoteBorder: "#3b9dd8", quoteText: "#244d68", quoteIcon: "#9bd2ef", fontHeading: "'Nunito', sans-serif", fontBody: "'Nunito', sans-serif", radius: "1.25rem", titleSize: "1.9rem", titleLine: "1.15", subtitleSize: "1.04rem", subtitleLine: "1.58", bodySize: "1rem", bodyLine: "1.68", coverRadius: "1.25rem", preview: "linear-gradient(135deg,#ffd166,#f26b4f 48%,#55c2ff 49% 75%,#7a69e8)" }
  },
  {
    id: "blueprint", name: "Tech Blueprint", description: "Precisión técnica, azul eléctrico y detalles monoespaciados.",
    fontUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap",
    vars: { canvas: "#f4f9ff", surface: "#ffffff", heading: "#072b4f", text: "#264766", muted: "#66829c", accent: "#0878d1", accentSoft: "#e2f2ff", border: "#b7d5ec", quoteBg: "#e2f2ff", quoteBorder: "#0878d1", quoteText: "#0b3b63", quoteIcon: "#87bee5", fontHeading: "'Space Grotesk', sans-serif", fontBody: "'Space Grotesk', sans-serif", radius: "0.35rem", titleSize: "1.95rem", titleLine: "1.1", subtitleSize: "1rem", subtitleLine: "1.55", bodySize: "0.98rem", bodyLine: "1.68", coverRadius: "0.35rem", preview: "linear-gradient(135deg,#052b50,#0878d1 58%,#55d9ff)" }
  },
  {
    id: "swiss", name: "Swiss International", description: "Retícula racional, rojo preciso y tipografía de alto impacto.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Work+Sans:wght@400;500;600&display=swap",
    vars: { canvas: "#f4f3ef", surface: "#ffffff", heading: "#111111", text: "#272727", muted: "#686868", accent: "#e1251b", accentSoft: "#ffe7e3", border: "#161616", quoteBg: "#111111", quoteBorder: "#e1251b", quoteText: "#ffffff", quoteIcon: "#e1251b", fontHeading: "'Barlow Condensed', sans-serif", fontBody: "'Work Sans', sans-serif", radius: "0rem", titleSize: "2.35rem", titleLine: "0.96", subtitleSize: "1rem", subtitleLine: "1.5", bodySize: "1rem", bodyLine: "1.62", coverRadius: "0rem", preview: "linear-gradient(115deg,#f4f3ef 0 38%,#e1251b 38% 58%,#111 58%)" }
  },
  {
    id: "deco", name: "Art Deco Atelier", description: "Marfil, ónix y oro con elegancia geométrica.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Montserrat:wght@400;500;600&display=swap",
    vars: { canvas: "#f8f1df", surface: "#fffaf0", heading: "#17130f", text: "#433b31", muted: "#796d5c", accent: "#a87928", accentSoft: "#eee0bf", border: "#b99550", quoteBg: "#17130f", quoteBorder: "#c7a35a", quoteText: "#fff7e6", quoteIcon: "#c7a35a", fontHeading: "'Cinzel', serif", fontBody: "'Montserrat', sans-serif", radius: "0.15rem", titleSize: "1.9rem", titleLine: "1.22", subtitleSize: "1rem", subtitleLine: "1.62", bodySize: "0.98rem", bodyLine: "1.72", coverRadius: "0.15rem", preview: "linear-gradient(135deg,#17130f 0 42%,#c7a35a 42% 48%,#f8f1df 48% 72%,#17130f 72%)" }
  },
  {
    id: "terminal", name: "Retro Terminal", description: "Consola fósforo, retícula digital y precisión monoespaciada.",
    fontUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap",
    vars: { canvas: "#07110c", surface: "#0c1c13", heading: "#b9ff8f", text: "#d9ffe2", muted: "#82b691", accent: "#55ff7d", accentSoft: "#12321d", border: "#285c38", quoteBg: "#0d2817", quoteBorder: "#55ff7d", quoteText: "#d9ffe2", quoteIcon: "#55ff7d", fontHeading: "'JetBrains Mono', monospace", fontBody: "'JetBrains Mono', monospace", radius: "0.2rem", titleSize: "1.75rem", titleLine: "1.25", subtitleSize: "0.95rem", subtitleLine: "1.65", bodySize: "0.94rem", bodyLine: "1.72", coverRadius: "0.2rem", preview: "repeating-linear-gradient(0deg,#07110c 0 5px,#0d2617 6px,#07110c 7px),linear-gradient(135deg,#55ff7d,#07110c)" }
  },
  {
    id: "memphis", name: "Memphis Studio", description: "Geometría optimista, primarios intensos y ritmo lúdico.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600&display=swap",
    vars: { canvas: "#fff6df", surface: "#ffffff", heading: "#14235c", text: "#35416e", muted: "#707895", accent: "#1557ff", accentSoft: "#dce7ff", border: "#14235c", quoteBg: "#ffcadf", quoteBorder: "#ff3c85", quoteText: "#4c1740", quoteIcon: "#ff3c85", fontHeading: "'Bricolage Grotesque', sans-serif", fontBody: "'DM Sans', sans-serif", radius: "0.75rem", titleSize: "2.15rem", titleLine: "1", subtitleSize: "1.03rem", subtitleLine: "1.55", bodySize: "1rem", bodyLine: "1.65", coverRadius: "0.75rem", preview: "conic-gradient(from 35deg,#1557ff 0 22%,#ff3c85 22% 43%,#ffd633 43% 67%,#30c7a7 67% 84%,#fff6df 84%)" }
  },
  {
    id: "washi", name: "Japanese Washi", description: "Papel sereno, tinta sumi y un acento bermellón.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&family=Noto+Serif+JP:wght@500;600;700&display=swap",
    vars: { canvas: "#f4efe4", surface: "#faf7ef", heading: "#211f1b", text: "#48443d", muted: "#817a6f", accent: "#c83f2f", accentSoft: "#f2ded8", border: "#c9c0b1", quoteBg: "#ebe5d9", quoteBorder: "#c83f2f", quoteText: "#302d28", quoteIcon: "#c83f2f", fontHeading: "'Noto Serif JP', serif", fontBody: "'Noto Sans JP', sans-serif", radius: "0.1rem", titleSize: "1.95rem", titleLine: "1.3", subtitleSize: "1rem", subtitleLine: "1.8", bodySize: "1rem", bodyLine: "1.85", coverRadius: "0.1rem", preview: "radial-gradient(circle at 72% 38%,#c83f2f 0 15%,transparent 16%),linear-gradient(115deg,#211f1b 0 3%,#f4efe4 3% 72%,#d9d0c0 72%)" }
  },
  {
    id: "aurora", name: "Aurora Glass", description: "Cristal luminoso, profundidad acuática y bordes suaves.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
    vars: { canvas: "#edf9fb", surface: "rgba(255,255,255,.68)", heading: "#12304f", text: "#35536b", muted: "#6c8798", accent: "#008eaa", accentSoft: "#d9f7f7", border: "#a7dce0", quoteBg: "rgba(215,246,247,.82)", quoteBorder: "#00a4ae", quoteText: "#173f50", quoteIcon: "#58cbd1", fontHeading: "'Plus Jakarta Sans', sans-serif", fontBody: "'Plus Jakarta Sans', sans-serif", radius: "1.2rem", titleSize: "2.05rem", titleLine: "1.08", subtitleSize: "1.03rem", subtitleLine: "1.62", bodySize: "1rem", bodyLine: "1.7", coverRadius: "1.2rem", preview: "radial-gradient(circle at 20% 18%,#b9fff4,transparent 34%),radial-gradient(circle at 80% 75%,#9abfff,transparent 38%),linear-gradient(135deg,#f4ffff,#c8eaf4)" }
  },
  {
    id: "risograph", name: "Riso Zine", description: "Tinta desfasada, energía independiente y contraste impreso.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Anton&family=Public+Sans:wght@400;500;600;700&display=swap",
    vars: { canvas: "#f5f0df", surface: "#fffaf0", heading: "#172f7a", text: "#263866", muted: "#6d7190", accent: "#ef2b84", accentSoft: "#ffd8e8", border: "#172f7a", quoteBg: "#ffe1a6", quoteBorder: "#ef2b84", quoteText: "#172f7a", quoteIcon: "#ef2b84", fontHeading: "'Anton', sans-serif", fontBody: "'Public Sans', sans-serif", radius: "0rem", titleSize: "2.15rem", titleLine: "1.02", subtitleSize: "1rem", subtitleLine: "1.52", bodySize: "1rem", bodyLine: "1.64", coverRadius: "0rem", preview: "linear-gradient(135deg,transparent 0 12%,#ef2b84 12% 46%,transparent 46% 52%,#172f7a 52% 86%,#f5f0df 86%),repeating-linear-gradient(45deg,#f5f0df 0 3px,#ffd8e8 3px 5px)" }
  },
  {
    id: "desert", name: "Desert Modern", description: "Arena, arcilla e índigo con una calma arquitectónica.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Karla:wght@400;500;600&display=swap",
    vars: { canvas: "#f4e4ca", surface: "#fbf0dd", heading: "#29345c", text: "#564e4a", muted: "#88786b", accent: "#b8553d", accentSoft: "#eed0bb", border: "#c8a984", quoteBg: "#e9d3b5", quoteBorder: "#29345c", quoteText: "#403631", quoteIcon: "#b8553d", fontHeading: "'Cormorant Garamond', serif", fontBody: "'Karla', sans-serif", radius: "1.5rem", titleSize: "2.25rem", titleLine: "1.02", subtitleSize: "1.08rem", subtitleLine: "1.68", bodySize: "1.02rem", bodyLine: "1.76", coverRadius: "4rem 4rem 0.8rem 0.8rem", preview: "radial-gradient(circle at 25% 75%,#b8553d 0 24%,transparent 25%),radial-gradient(circle at 74% 32%,#29345c 0 18%,transparent 19%),linear-gradient(135deg,#e8c69b,#f4e4ca)" }
  },
  {
    id: "spaceage", name: "Space Age 70s", description: "Curvas retrofuturistas, naranja quemado y crema solar.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Righteous&display=swap",
    vars: { canvas: "#f7e6b9", surface: "#fff2cf", heading: "#4a281d", text: "#624437", muted: "#927262", accent: "#e75d26", accentSoft: "#ffd19d", border: "#7d4a2f", quoteBg: "#5b3023", quoteBorder: "#ffb33b", quoteText: "#fff0c8", quoteIcon: "#ffb33b", fontHeading: "'Righteous', sans-serif", fontBody: "'Outfit', sans-serif", radius: "1.75rem", titleSize: "2rem", titleLine: "1.08", subtitleSize: "1.05rem", subtitleLine: "1.58", bodySize: "1rem", bodyLine: "1.68", coverRadius: "3rem", preview: "radial-gradient(circle at 70% 50%,#ffb33b 0 13%,#e75d26 14% 27%,#7d4a2f 28% 40%,transparent 41%),linear-gradient(135deg,#f7e6b9,#edc476)" }
  },
  {
    id: "holographic", name: "Holographic Pop", description: "Irisaciones digitales, brillo cromado y energía futurista.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=Syne:wght@600;700;800&display=swap",
    vars: { canvas: "#f8f6ff", surface: "rgba(255,255,255,.76)", heading: "#241b46", text: "#4d4567", muted: "#82799d", accent: "#7d3cff", accentSoft: "#eee5ff", border: "#c9b7ef", quoteBg: "#f0e8ff", quoteBorder: "#00a7c7", quoteText: "#34245c", quoteIcon: "#ff4fb4", fontHeading: "'Syne', sans-serif", fontBody: "'Manrope', sans-serif", radius: "1rem", titleSize: "2.1rem", titleLine: "1.03", subtitleSize: "1.04rem", subtitleLine: "1.62", bodySize: "1rem", bodyLine: "1.7", coverRadius: "1rem", preview: "linear-gradient(120deg,#79f2ff 0%,#d7b5ff 25%,#ff9dce 48%,#fff4a9 72%,#8cf7d3 100%)" }
  },
  {
    id: "bubblegum", name: "Bubblegum Club", description: "Rosa pop, lima eléctrica y formas blandas con actitud juvenil.",
    fontUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fredoka:wght@600;700&display=swap",
    vars: { canvas: "#fff2f8", surface: "#ffffff", heading: "#3e174d", text: "#613c68", muted: "#9a789f", accent: "#f02f8f", accentSoft: "#ffd6ea", border: "#e9b5d2", quoteBg: "#dfff62", quoteBorder: "#3e174d", quoteText: "#30213a", quoteIcon: "#f02f8f", fontHeading: "'Fredoka', sans-serif", fontBody: "'DM Sans', sans-serif", radius: "1.5rem", titleSize: "2.2rem", titleLine: "1", subtitleSize: "1.05rem", subtitleLine: "1.55", bodySize: "1rem", bodyLine: "1.66", coverRadius: "2.5rem", preview: "radial-gradient(circle at 20% 30%,#dfff62 0 18%,transparent 19%),linear-gradient(135deg,#ff87bf,#f02f8f 55%,#6536d8)" }
  },
  {
    id: "cyberpop", name: "Cyberpop Night", description: "Neón nocturno, interfaces musicales y pulso digital.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Space+Grotesk:wght@400;500;600&display=swap",
    vars: { canvas: "#0d0920", surface: "#17102e", heading: "#fbf6ff", text: "#e3dafa", muted: "#a79bc4", accent: "#00f5d4", accentSoft: "#17363c", border: "#6747a8", quoteBg: "#211044", quoteBorder: "#ff3cac", quoteText: "#fff1fb", quoteIcon: "#00f5d4", fontHeading: "'Orbitron', sans-serif", fontBody: "'Space Grotesk', sans-serif", radius: ".65rem", titleSize: "1.9rem", titleLine: "1.12", subtitleSize: "1rem", subtitleLine: "1.6", bodySize: ".98rem", bodyLine: "1.7", coverRadius: ".65rem", preview: "linear-gradient(135deg,#0d0920 0 40%,#7138ff 40% 58%,#ff3cac 58% 76%,#00f5d4 76%)" }
  },
  {
    id: "skater", name: "Skater Zine", description: "Fotocopia, cinta adhesiva y tipografía urbana sin pulir.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700&family=Oswald:wght@600;700&display=swap",
    vars: { canvas: "#ece9df", surface: "#faf8f0", heading: "#151515", text: "#303030", muted: "#686868", accent: "#ef4d23", accentSoft: "#ffd9c9", border: "#151515", quoteBg: "#151515", quoteBorder: "#ef4d23", quoteText: "#ffffff", quoteIcon: "#f5df38", fontHeading: "'Oswald', sans-serif", fontBody: "'Archivo', sans-serif", radius: "0rem", titleSize: "2.4rem", titleLine: ".94", subtitleSize: "1rem", subtitleLine: "1.48", bodySize: ".98rem", bodyLine: "1.58", coverRadius: "0rem", preview: "repeating-linear-gradient(-12deg,#151515 0 8px,#ece9df 8px 18px,#ef4d23 18px 24px)" }
  },
  {
    id: "dopamine", name: "Dopamine Daily", description: "Color optimista, bloques grandes y energía social.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700;800&display=swap",
    vars: { canvas: "#fff9e7", surface: "#ffffff", heading: "#132c52", text: "#30496d", muted: "#74839a", accent: "#ff4f40", accentSoft: "#ffe2a8", border: "#1a4ed8", quoteBg: "#b9f4d8", quoteBorder: "#1a4ed8", quoteText: "#143950", quoteIcon: "#ff4f40", fontHeading: "'Bricolage Grotesque', sans-serif", fontBody: "'Bricolage Grotesque', sans-serif", radius: "1rem", titleSize: "2.25rem", titleLine: ".98", subtitleSize: "1.05rem", subtitleLine: "1.55", bodySize: "1rem", bodyLine: "1.64", coverRadius: "1rem", preview: "conic-gradient(from 20deg,#ff4f40,#ffcf33,#4ad7a1,#1a4ed8,#ff68ad,#ff4f40)" }
  },
  {
    id: "y2k", name: "Y2K Chrome", description: "Cromo líquido, azul hielo y nostalgia del futuro dosmilero.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=Michroma&display=swap",
    vars: { canvas: "#edf4ff", surface: "rgba(255,255,255,.78)", heading: "#10244d", text: "#3a5279", muted: "#788ba9", accent: "#246bfe", accentSoft: "#dce9ff", border: "#9eb9e8", quoteBg: "#e8dcff", quoteBorder: "#7b41e8", quoteText: "#2c2450", quoteIcon: "#23cddb", fontHeading: "'Michroma', sans-serif", fontBody: "'Manrope', sans-serif", radius: "1.4rem", titleSize: "1.65rem", titleLine: "1.25", subtitleSize: "1rem", subtitleLine: "1.65", bodySize: "1rem", bodyLine: "1.7", coverRadius: "45% 12% 45% 12%", preview: "linear-gradient(125deg,#fff 0 12%,#9bf3ff 28%,#b7a5ff 48%,#fff 63%,#6e8fff 82%,#d9faff)" }
  },
  {
    id: "matcha", name: "Matcha Social", description: "Verde cremoso, editorial relajada y cultura de café.",
    fontUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap",
    vars: { canvas: "#edf1dc", surface: "#fafbec", heading: "#263d28", text: "#485a45", muted: "#778271", accent: "#678b4e", accentSoft: "#dbe8bd", border: "#b7c69a", quoteBg: "#fff2ba", quoteBorder: "#678b4e", quoteText: "#38452f", quoteIcon: "#e2836f", fontHeading: "'Fraunces', serif", fontBody: "'DM Sans', sans-serif", radius: "1.4rem", titleSize: "2.15rem", titleLine: "1.05", subtitleSize: "1.05rem", subtitleLine: "1.65", bodySize: "1rem", bodyLine: "1.75", coverRadius: "3rem .8rem 3rem .8rem", preview: "radial-gradient(circle at 70% 35%,#fff2ba 0 22%,transparent 23%),linear-gradient(135deg,#a9c477,#527a43)" }
  },
  {
    id: "sunsetsocial", name: "Sunset Social", description: "Atardecer coral, violeta suave y composición para compartir.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap",
    vars: { canvas: "#fff3ed", surface: "#fffaf7", heading: "#40224f", text: "#624663", muted: "#987b91", accent: "#f05a67", accentSoft: "#ffd9d5", border: "#efbbb8", quoteBg: "#f0ddff", quoteBorder: "#8a53d2", quoteText: "#452c5b", quoteIcon: "#f05a67", fontHeading: "'Sora', sans-serif", fontBody: "'Sora', sans-serif", radius: "1.25rem", titleSize: "2rem", titleLine: "1.08", subtitleSize: "1.03rem", subtitleLine: "1.62", bodySize: "1rem", bodyLine: "1.7", coverRadius: "1.25rem", preview: "linear-gradient(145deg,#ffcf86,#ff7b7b 42%,#b85ad7 72%,#493e91)" }
  },
  {
    id: "comicpulse", name: "Comic Pulse", description: "Viñetas, titulares explosivos y color de historieta contemporánea.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Bangers&family=Nunito:wght@400;600;700&display=swap",
    vars: { canvas: "#fff8d1", surface: "#ffffff", heading: "#17245b", text: "#34436a", muted: "#6e7896", accent: "#ef3340", accentSoft: "#ffd8d8", border: "#17245b", quoteBg: "#63d9ff", quoteBorder: "#17245b", quoteText: "#17245b", quoteIcon: "#ef3340", fontHeading: "'Bangers', cursive", fontBody: "'Nunito', sans-serif", radius: ".45rem", titleSize: "2.55rem", titleLine: ".95", subtitleSize: "1.04rem", subtitleLine: "1.55", bodySize: "1rem", bodyLine: "1.65", coverRadius: ".45rem", preview: "radial-gradient(circle,#17245b 1px,transparent 2px),linear-gradient(135deg,#ffd633 0 45%,#ef3340 45% 70%,#63d9ff 70%)" }
  },
  {
    id: "pixelcandy", name: "Pixel Candy", description: "Píxel suave, caramelos digitales y nostalgia de videojuegos.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Mono:wght@400;700&display=swap",
    vars: { canvas: "#20153d", surface: "#2d2050", heading: "#fff5b8", text: "#f5eaff", muted: "#c4acd9", accent: "#62f6c5", accentSoft: "#214c4d", border: "#9c6bff", quoteBg: "#432760", quoteBorder: "#ff6eb4", quoteText: "#fff2fa", quoteIcon: "#62f6c5", fontHeading: "'Press Start 2P', monospace", fontBody: "'Space Mono', monospace", radius: ".15rem", titleSize: "1.35rem", titleLine: "1.55", subtitleSize: ".92rem", subtitleLine: "1.7", bodySize: ".92rem", bodyLine: "1.75", coverRadius: ".15rem", preview: "repeating-linear-gradient(90deg,#9c6bff 0 12px,#ff6eb4 12px 24px,#62f6c5 24px 36px,#fff5b8 36px 48px)" }
  },
  {
    id: "indiecollage", name: "Indie Collage", description: "Recortes editoriales, fotografía imaginaria y contraste artesanal.",
    fontUrl: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,600;6..96,800&family=Work+Sans:wght@400;500;600&display=swap",
    vars: { canvas: "#eee9df", surface: "#fffdf8", heading: "#221e1c", text: "#4b4540", muted: "#81786f", accent: "#c83d57", accentSoft: "#f3d5db", border: "#36302c", quoteBg: "#d7e6ca", quoteBorder: "#36302c", quoteText: "#30382a", quoteIcon: "#c83d57", fontHeading: "'Bodoni Moda', serif", fontBody: "'Work Sans', sans-serif", radius: ".1rem", titleSize: "2.35rem", titleLine: ".98", subtitleSize: "1rem", subtitleLine: "1.58", bodySize: "1rem", bodyLine: "1.68", coverRadius: "0rem", preview: "linear-gradient(25deg,#36302c 0 25%,transparent 25%),linear-gradient(145deg,#c83d57 0 32%,#d7e6ca 32% 67%,#d8b889 67%)" }
  },
  {
    id: "swissglass", name: "Swiss Glass Lab", description: "Retícula suiza atravesada por cristal aurora.", fontUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap",
    vars: { canvas: "#eefbfd", surface: "rgba(255,255,255,.7)", heading: "#101820", text: "#334a55", muted: "#6c838d", accent: "#ef342a", accentSoft: "#ffe5e1", border: "#62c7d2", quoteBg: "rgba(190,244,245,.72)", quoteBorder: "#ef342a", quoteText: "#173b43", quoteIcon: "#00a8b5", fontHeading: "'Barlow Condensed', sans-serif", fontBody: "'Plus Jakarta Sans', sans-serif", radius: ".35rem", titleSize: "2.4rem", titleLine: ".95", subtitleSize: "1rem", subtitleLine: "1.58", bodySize: "1rem", bodyLine: "1.68", coverRadius: ".35rem", preview: "linear-gradient(120deg,rgba(114,239,255,.8),rgba(255,255,255,.4) 42%,#ef342a 43% 58%,#101820 59%)" }
  },
  {
    id: "decoholo", name: "Deco Hologram", description: "Simetría Art Déco con reflejos iridiscentes.", fontUrl: "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Manrope:wght@400;500;600&display=swap",
    vars: { canvas: "#f8f1ff", surface: "rgba(255,255,255,.8)", heading: "#241632", text: "#53425c", muted: "#897994", accent: "#9b63ff", accentSoft: "#eadfff", border: "#c59aea", quoteBg: "#241632", quoteBorder: "#77e8e2", quoteText: "#fff8ff", quoteIcon: "#ff9bcf", fontHeading: "'Cinzel', serif", fontBody: "'Manrope', sans-serif", radius: ".2rem", titleSize: "1.95rem", titleLine: "1.2", subtitleSize: "1rem", subtitleLine: "1.65", bodySize: "1rem", bodyLine: "1.72", coverRadius: ".2rem", preview: "linear-gradient(135deg,#241632 0 32%,#77e8e2 32% 42%,#ff9bcf 42% 58%,#d8b5ff 58% 72%,#241632 72%)" }
  },
  {
    id: "terminalriso", name: "Terminal Riso", description: "Código fósforo impreso con tinta magenta desfasada.", fontUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Anton&display=swap",
    vars: { canvas: "#101718", surface: "#172122", heading: "#b8ff7d", text: "#e4f6dd", muted: "#9bae96", accent: "#ff3c96", accentSoft: "#48213b", border: "#6c8e55", quoteBg: "#261f33", quoteBorder: "#b8ff7d", quoteText: "#fff1fa", quoteIcon: "#ff3c96", fontHeading: "'Anton', sans-serif", fontBody: "'JetBrains Mono', monospace", radius: "0rem", titleSize: "2.15rem", titleLine: "1", subtitleSize: ".95rem", subtitleLine: "1.65", bodySize: ".94rem", bodyLine: "1.72", coverRadius: "0rem", preview: "repeating-linear-gradient(45deg,#101718 0 8px,#ff3c96 8px 13px,#b8ff7d 13px 16px,#101718 16px 24px)" }
  },
  {
    id: "washimemphis", name: "Washi Memphis", description: "Serenidad japonesa intervenida con geometría pop.", fontUrl: "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap",
    vars: { canvas: "#f5efe1", surface: "#fffaf0", heading: "#24211d", text: "#504a41", muted: "#80786b", accent: "#e3454d", accentSoft: "#f7d9d3", border: "#292723", quoteBg: "#cbe9df", quoteBorder: "#2463d4", quoteText: "#213c42", quoteIcon: "#e3454d", fontHeading: "'Noto Serif JP', serif", fontBody: "'DM Sans', sans-serif", radius: ".65rem", titleSize: "2rem", titleLine: "1.25", subtitleSize: "1rem", subtitleLine: "1.75", bodySize: "1rem", bodyLine: "1.8", coverRadius: ".2rem 2rem .2rem 2rem", preview: "radial-gradient(circle at 28% 40%,#e3454d 0 15%,transparent 16%),conic-gradient(from 30deg,#f5efe1,#ffd64a,#2463d4,#cbe9df,#f5efe1)" }
  },
  {
    id: "desertdeco", name: "Desert Deco", description: "Arquitectura del desierto con marcos dorados geométricos.", fontUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Montserrat:wght@400;500;600&display=swap",
    vars: { canvas: "#ecd8b9", surface: "#f8ead2", heading: "#31253e", text: "#594b50", muted: "#89766e", accent: "#ad653f", accentSoft: "#e7c2a6", border: "#9a7339", quoteBg: "#31253e", quoteBorder: "#d8ad5b", quoteText: "#fff1d6", quoteIcon: "#d8ad5b", fontHeading: "'Cormorant Garamond', serif", fontBody: "'Montserrat', sans-serif", radius: ".2rem", titleSize: "2.3rem", titleLine: "1", subtitleSize: "1rem", subtitleLine: "1.7", bodySize: "1rem", bodyLine: "1.75", coverRadius: "4rem 4rem .2rem .2rem", preview: "linear-gradient(135deg,#31253e 0 25%,#d8ad5b 25% 30%,#ad653f 30% 55%,#ecd8b9 55%)" }
  },
  {
    id: "spacebotanical", name: "Cosmic Botanical", description: "Botánica orgánica bajo curvas retroespaciales.", fontUrl: "https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Righteous&display=swap",
    vars: { canvas: "#e9edcf", surface: "#f8f3d8", heading: "#243b32", text: "#46584b", muted: "#768375", accent: "#e06b32", accentSoft: "#f4caa5", border: "#708666", quoteBg: "#243b32", quoteBorder: "#f2bb43", quoteText: "#f8f3d8", quoteIcon: "#e06b32", fontHeading: "'Righteous', sans-serif", fontBody: "'Lora', serif", radius: "2rem", titleSize: "2rem", titleLine: "1.12", subtitleSize: "1.05rem", subtitleLine: "1.65", bodySize: "1rem", bodyLine: "1.78", coverRadius: "50% 50% 1rem 1rem", preview: "radial-gradient(circle at 65% 45%,#f2bb43 0 13%,#e06b32 14% 25%,#243b32 26% 36%,transparent 37%),linear-gradient(135deg,#b8ca84,#e9edcf)" }
  },
  {
    id: "nordiccyber", name: "Nordic Cyber", description: "Minimalismo nórdico con señalética digital ácida.", fontUrl: "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,600;6..72,700&family=Space+Grotesk:wght@400;500;600&display=swap",
    vars: { canvas: "#f4f3ee", surface: "#fffefa", heading: "#202424", text: "#454b49", muted: "#77807c", accent: "#00a879", accentSoft: "#d8f4e9", border: "#9ea9a4", quoteBg: "#202424", quoteBorder: "#b8ff38", quoteText: "#f8fff1", quoteIcon: "#b8ff38", fontHeading: "'Newsreader', serif", fontBody: "'Space Grotesk', sans-serif", radius: ".25rem", titleSize: "2.2rem", titleLine: "1.03", subtitleSize: "1.03rem", subtitleLine: "1.65", bodySize: "1rem", bodyLine: "1.75", coverRadius: ".25rem", preview: "linear-gradient(135deg,#f4f3ee 0 48%,#202424 48% 72%,#b8ff38 72% 82%,#00a879 82%)" }
  },
  {
    id: "coralnews", name: "Coral Newsroom", description: "Periodismo de revista con calidez coral contemporánea.", fontUrl: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
    vars: { canvas: "#fff5ee", surface: "#fffdf9", heading: "#321f28", text: "#564047", muted: "#8a7178", accent: "#d9443f", accentSoft: "#fbd8cf", border: "#4a3338", quoteBg: "#321f28", quoteBorder: "#ff9c7f", quoteText: "#fff7f1", quoteIcon: "#ff9c7f", fontHeading: "'Fraunces', serif", fontBody: "'IBM Plex Sans', sans-serif", radius: ".15rem", titleSize: "2.35rem", titleLine: ".98", subtitleSize: "1.02rem", subtitleLine: "1.58", bodySize: "1rem", bodyLine: "1.68", coverRadius: ".15rem", preview: "linear-gradient(120deg,#321f28 0 40%,#fff5ee 40% 62%,#d9443f 62% 82%,#ffb09a 82%)" }
  },
  {
    id: "blueprintzine", name: "Blueprint Zine", description: "Plano técnico cruzado con impresión independiente.", fontUrl: "https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:wght@400;500&display=swap",
    vars: { canvas: "#eaf5ff", surface: "#f8fcff", heading: "#062c59", text: "#284c70", muted: "#6685a1", accent: "#ff3f76", accentSoft: "#ffdbe7", border: "#0878d1", quoteBg: "#062c59", quoteBorder: "#ff3f76", quoteText: "#ffffff", quoteIcon: "#64dcff", fontHeading: "'Anton', sans-serif", fontBody: "'IBM Plex Mono', monospace", radius: "0rem", titleSize: "2.2rem", titleLine: "1", subtitleSize: ".95rem", subtitleLine: "1.65", bodySize: ".94rem", bodyLine: "1.72", coverRadius: "0rem", preview: "repeating-linear-gradient(0deg,transparent 0 12px,rgba(8,120,209,.25) 13px),linear-gradient(135deg,#062c59 0 55%,#ff3f76 55% 70%,#64dcff 70%)" }
  },
  {
    id: "midnightaurora", name: "Midnight Aurora", description: "Noche editorial con luz boreal translúcida.", fontUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap",
    vars: { canvas: "#0c1420", surface: "rgba(19,31,47,.82)", heading: "#f5fbff", text: "#dceaf3", muted: "#9eb4c4", accent: "#57e4d2", accentSoft: "#173b42", border: "#345a70", quoteBg: "rgba(32,51,77,.88)", quoteBorder: "#9d7cff", quoteText: "#f1edff", quoteIcon: "#57e4d2", fontHeading: "'Playfair Display', serif", fontBody: "'Plus Jakarta Sans', sans-serif", radius: "1rem", titleSize: "2.15rem", titleLine: "1.08", subtitleSize: "1.04rem", subtitleLine: "1.65", bodySize: "1rem", bodyLine: "1.74", coverRadius: "1rem", preview: "radial-gradient(circle at 20% 20%,#57e4d2 0,transparent 30%),radial-gradient(circle at 80% 65%,#9d7cff 0,transparent 34%),linear-gradient(135deg,#0c1420,#1b2f48)" }
  }
]);

function getArticleTemplate(templateId = "default") {
  return ARTICLE_TEMPLATES.find((template) => template.id === templateId) || ARTICLE_TEMPLATES[0];
}

function getRandomArticleTemplate(excludedId = "") {
  const candidates = ARTICLE_TEMPLATES.filter((template) => template.id !== excludedId);
  if (!candidates.length) return ARTICLE_TEMPLATES[0];
  if (!globalThis.crypto?.getRandomValues) return candidates[Math.floor(Math.random() * candidates.length)];
  const range = 0x100000000;
  const limit = range - (range % candidates.length);
  const value = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(value); while (value[0] >= limit);
  return candidates[value[0] % candidates.length];
}

function articleTemplateStyle(template, overrides = {}) {
  const values = { ...template.vars, ...overrides };
  const map = {
    canvas: "--article-canvas", surface: "--article-surface", heading: "--article-heading", text: "--article-text",
    muted: "--article-muted", accent: "--article-accent", accentSoft: "--article-accent-soft", border: "--article-border",
    quoteBg: "--article-quote-bg", quoteBorder: "--article-quote-border", quoteText: "--article-quote-text", quoteIcon: "--article-quote-icon",
    fontHeading: "--article-font-heading", fontBody: "--article-font-body", radius: "--article-radius", titleSize: "--article-title-size",
    titleLine: "--article-title-line", subtitleSize: "--article-subtitle-size", subtitleLine: "--article-subtitle-line",
    bodySize: "--article-body-size", bodyLine: "--article-body-line", coverRadius: "--article-cover-radius", preview: "--article-preview-art"
  };
  return Object.entries(map).map(([key, cssName]) => `${cssName}:${values[key]}`).join(";");
}

function getArticleTemplateSharedCss(scope) {
  return `
${scope}{background:var(--article-canvas)!important;color:var(--article-text);font-family:var(--article-font-body);}
${scope} article{color:var(--article-text);font-family:var(--article-font-body);}
${scope} #article-title,${scope} [data-article-title]{margin:0 0 1.25rem;color:var(--article-heading)!important;font-family:var(--article-font-heading)!important;font-size:var(--article-title-size);line-height:var(--article-title-line);letter-spacing:-.025em;}
${scope} #article-subtitle,${scope} [data-article-subtitle]{margin:0 0 2rem;color:var(--article-muted)!important;font-family:var(--article-font-body)!important;font-size:var(--article-subtitle-size);line-height:var(--article-subtitle-line);}
${scope} [data-article-meta-row]{margin-bottom:2rem!important;}
${scope} [data-article-meta-row]>*,${scope} .article-meta-badge{border-radius:calc(var(--article-radius)*.75)!important;border-color:var(--article-border)!important;box-shadow:none!important;font-weight:400!important;}
${scope} .marcie-cover-figure{border-radius:var(--article-cover-radius)!important;box-shadow:0 18px 45px color-mix(in srgb,var(--article-heading) 13%,transparent)!important;}
${scope} [data-article-divider],${scope} .article-divider{background:var(--article-border)!important;border-color:var(--article-border)!important;}
${scope} #article-body-container{color:var(--article-text);font-family:var(--article-font-body);}
${scope} #article-body-container>p,${scope} #article-body-container li{color:var(--article-text)!important;font-size:var(--article-body-size);line-height:var(--article-body-line);}
${scope} #article-body-container :is(strong,b,em,i){color:inherit!important;-webkit-text-fill-color:currentColor!important;}
${scope} #article-body-container :is(strong,b){font-weight:700!important;}
${scope} #article-body-container :is(ul,ol) li,${scope} #article-body-container :is(ul,ol) li > :not(a),${scope} #article-body-container :is(ul,ol) li :is(span,strong,b,em,i){color:var(--article-text)!important;-webkit-text-fill-color:currentColor!important;opacity:1!important;}
${scope} #article-body-container :is(ul,ol) li::marker{color:var(--article-accent)!important;}
${scope} #article-body-container .article-inline-code{padding:.12em .38em;border:1px solid var(--article-border);border-radius:calc(var(--article-radius)*.45);background:var(--article-accent-soft)!important;color:var(--article-accent)!important;-webkit-text-fill-color:currentColor!important;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;}
${scope} #article-body-container h2,${scope} #article-body-container h3{color:var(--article-heading)!important;font-family:var(--article-font-heading)!important;}
${scope} #article-body-container a{color:var(--article-accent)!important;}
${scope} #article-body-container li::marker{color:var(--article-accent);}
${scope} #article-body-container blockquote{position:relative;margin:2rem 0!important;padding:1.5rem 1.5rem 1.5rem 4.4rem!important;border:0!important;border-left:4px solid var(--article-quote-border)!important;border-radius:0 var(--article-radius) var(--article-radius) 0!important;background:var(--article-quote-bg)!important;color:var(--article-quote-text)!important;font-style:normal!important;}
${scope} #article-body-container blockquote .article-quote-icon,${scope} #article-body-container blockquote .export-quote-icon{position:absolute;top:1.5rem;left:1.5rem;width:2rem;height:2rem;color:var(--article-quote-icon)!important;stroke-width:1.8;opacity:1;z-index:0;}
${scope} #article-body-container blockquote p{position:relative;z-index:1;margin:0!important;color:var(--article-quote-text)!important;font-size:1.125rem!important;font-weight:500!important;line-height:1.75!important;}
${scope} #article-body-container blockquote footer{position:relative;z-index:1;margin-top:.75rem;color:var(--article-text)!important;font-size:.875rem;font-style:normal;font-weight:400;opacity:.9;}
${scope} [data-article-sources]{border-color:var(--article-border)!important;}
${scope} .export-inline-icon{display:block;flex:0 0 auto;width:1rem;height:1rem;fill:none!important;stroke:currentColor!important;stroke-width:1.8;visibility:visible!important;opacity:1!important;overflow:visible;}
${scope} [data-article-sources] .article-sources-heading{color:var(--article-heading)!important;}
${scope} [data-article-sources] .article-sources-heading .export-inline-icon{color:var(--article-accent)!important;stroke:var(--article-accent)!important;}
${scope} [data-article-sources] h4{color:var(--article-heading)!important;font-family:var(--article-font-heading)!important;}
${scope} .article-source-item,${scope} [data-article-sources] li{border-color:var(--article-border)!important;border-radius:var(--article-radius)!important;background:var(--article-surface)!important;}
${scope} .article-source-title{color:var(--article-heading)!important;}
${scope} .article-source-link{color:var(--article-accent)!important;}
${scope}[data-article-template="midnight"] [contenteditable="true"]{color:#eef4ff!important;caret-color:#e2bd73!important;background-color:transparent!important;-webkit-text-fill-color:#eef4ff!important;}
${scope}[data-article-template="midnight"] [data-article-title][contenteditable="true"]{color:#fff8e7!important;-webkit-text-fill-color:#fff8e7!important;}
${scope}[data-article-template="midnight"] [data-article-subtitle][contenteditable="true"]{color:#c0ccdc!important;-webkit-text-fill-color:#c0ccdc!important;}
${scope}[data-article-template="midnight"] [contenteditable="true"] p,${scope}[data-article-template="midnight"] [contenteditable="true"] li,${scope}[data-article-template="midnight"] [contenteditable="true"] strong,${scope}[data-article-template="midnight"] [contenteditable="true"] em{color:#eef4ff!important;-webkit-text-fill-color:#eef4ff!important;}
${scope}[data-article-template="midnight"] [contenteditable="true"] h2,${scope}[data-article-template="midnight"] [contenteditable="true"] h3{color:#fff8e7!important;-webkit-text-fill-color:#fff8e7!important;}
${scope}[data-article-template="midnight"] [contenteditable="true"]::selection,${scope}[data-article-template="midnight"] [contenteditable="true"] *::selection{background:#e2bd73!important;color:#101722!important;-webkit-text-fill-color:#101722!important;}
${scope}[data-article-template="midnight"] [contenteditable="true"]:focus{outline:none!important;box-shadow:0 0 0 2px rgba(226,189,115,.32)!important;}
${getArticleTemplateBadgeCss(scope)}
${getArticleTemplateSourceCss(scope)}
${getArticleTemplateVisualCss(scope)}
`;
}

function getArticleTemplateBadgeCss(scope) {
  const theme = (id) => `${scope}[data-article-template="${id}"] [data-article-meta-row]`;
  const items = (id) => `${theme(id)}>* ,${theme(id)} .article-meta-badge`;
  const item = (id, position) => `${theme(id)}>*:nth-child(${position}),${theme(id)} .article-meta-badge:nth-child(${position})`;
  return `
${scope} [data-article-meta-row] svg{color:inherit!important;stroke:currentColor!important;}
${scope} [data-article-meta-row]>* ,${scope} [data-article-meta-row] .article-meta-badge{opacity:1!important;-webkit-text-fill-color:currentColor!important;}
${scope} [data-article-meta-row]>* >*,${scope} [data-article-meta-row] .article-meta-badge>*{color:inherit!important;-webkit-text-fill-color:currentColor!important;text-decoration-color:currentColor!important;}
${scope} [data-article-sources][data-source-citation-format="apa"] .article-sources-list{grid-template-columns:1fr!important;counter-reset:marcie-apa-source;}
${scope} [data-article-sources][data-source-citation-format="apa"] .article-source-item{position:relative;border-left:4px solid var(--article-accent)!important;counter-increment:marcie-apa-source;}
${scope} [data-article-sources][data-source-citation-format="apa"] .article-source-title{overflow:visible!important;white-space:normal!important;text-overflow:clip!important;font-weight:500!important;line-height:1.55!important;}
${scope} [data-article-sources][data-source-citation-format="apa"] .article-source-title::before{display:inline-flex;margin:0 .45rem .18rem 0;padding:.12rem .36rem;border-radius:999px;background:var(--article-accent)!important;color:var(--article-canvas)!important;content:"APA 7 · " counter(marcie-apa-source);font-size:.58rem;font-style:normal;font-weight:800;letter-spacing:.035em;vertical-align:middle;}

${items("nordic")}{padding:.42rem .72rem!important;border:1px solid #cfc4b3!important;border-radius:.2rem!important;background:#f3ede3!important;color:#665039!important;font-family:'DM Sans',sans-serif!important;font-size:.72rem!important;letter-spacing:.025em;}
${item("nordic", 2)}{background:#e8eee5!important;color:#4e6554!important;border-color:#c6d1c2!important;}
${item("nordic", 3)}{background:#eee9df!important;color:#6e6251!important;}
${item("nordic", 4)}{background:transparent!important;color:#81715e!important;border-style:dashed!important;}

${theme("signal")}{gap:.45rem!important;}
${items("signal")}{padding:.42rem .62rem!important;border:2px solid #111!important;border-radius:0!important;background:#fff!important;color:#111!important;font-family:'IBM Plex Mono',monospace!important;font-size:.68rem!important;font-weight:500!important;letter-spacing:.035em;text-transform:uppercase;box-shadow:3px 3px 0 #111!important;}
${item("signal", 1)},${item("signal", 1)} span,${item("signal", 1)} svg{background:#111!important;color:#f7f500!important;-webkit-text-fill-color:#f7f500!important;opacity:1!important;}
${item("signal", 2)},${item("signal", 2)} span,${item("signal", 2)} svg{background:#ef3b24!important;color:#fff!important;-webkit-text-fill-color:#fff!important;opacity:1!important;}
${item("signal", 3)},${item("signal", 3)} span,${item("signal", 3)} svg{background:#f7f500!important;color:#111!important;-webkit-text-fill-color:#111!important;opacity:1!important;}
${item("signal", 4)},${item("signal", 4)} span,${item("signal", 4)} svg{background:#fff!important;color:#111!important;-webkit-text-fill-color:#111!important;opacity:1!important;}

${items("coral")}{padding:.48rem .78rem!important;border:0!important;border-radius:999px!important;background:#ffe6de!important;color:#943f35!important;font-family:'DM Sans',sans-serif!important;box-shadow:inset 0 0 0 1px rgba(232,93,74,.16)!important;}
${item("coral", 2)}{background:#f7e7ee!important;color:#7b3e57!important;}
${item("coral", 3)}{background:#fff0d9!important;color:#8b5d22!important;}
${item("coral", 4)}{background:#f2e9ff!important;color:#69468b!important;}

${theme("academic")}{gap:.5rem 1rem!important;padding:.65rem 0!important;border-top:1px solid #cfd8de;border-bottom:1px solid #cfd8de;}
${items("academic")}{padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#2f5d7c!important;font-family:'Source Sans 3',sans-serif!important;font-size:.72rem!important;font-weight:600!important;letter-spacing:.045em;text-transform:uppercase;}
${item("academic", 2)}{color:#435b6d!important;}
${item("academic", 3)}{color:#526f82!important;}
${item("academic", 4)}{color:#6a5960!important;}

${items("botanical")}{padding:.46rem .74rem!important;border:1px solid #c4d2c0!important;border-radius:1rem 1rem 1rem .28rem!important;background:#e8f0e5!important;color:#3f6449!important;font-family:'Manrope',sans-serif!important;}
${item("botanical", 2)}{background:#eef1df!important;color:#60683c!important;border-color:#d7dbb9!important;}
${item("botanical", 3)}{background:#e2eee8!important;color:#376356!important;border-color:#bed4ca!important;}
${item("botanical", 4)}{background:#f1eadc!important;color:#755f3c!important;border-color:#ddd0b7!important;}

${theme("newspaper")}{gap:.35rem 1.1rem!important;padding:.55rem 0!important;border-top:3px double #333;border-bottom:1px solid #333;}
${items("newspaper")}{padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#333!important;font-family:'IBM Plex Sans',sans-serif!important;font-size:.68rem!important;font-weight:600!important;letter-spacing:.07em;text-transform:uppercase;}
${item("newspaper", 1)}{color:#b42318!important;}
${item("newspaper", 4)}{margin-left:auto;color:#b42318!important;}

${items("midnight")}{padding:.48rem .76rem!important;border:1px solid #52647c!important;border-radius:.45rem!important;background:#202c3d!important;color:#f1f5fb!important;-webkit-text-fill-color:#f1f5fb!important;font-family:'Manrope',sans-serif!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)!important;opacity:1!important;}
${items("midnight")} span,${items("midnight")} svg{color:inherit!important;-webkit-text-fill-color:currentColor!important;opacity:1!important;}
${item("midnight", 1)},${item("midnight", 1)} span,${item("midnight", 1)} svg{border-color:#9b7d43!important;color:#f6d995!important;-webkit-text-fill-color:#f6d995!important;}
${item("midnight", 2)},${item("midnight", 2)} span,${item("midnight", 2)} svg{background:#2b374a!important;color:#fff4d6!important;-webkit-text-fill-color:#fff4d6!important;}
${item("midnight", 3)},${item("midnight", 3)} span,${item("midnight", 3)} svg{border-color:#607894!important;color:#d7e9ff!important;-webkit-text-fill-color:#d7e9ff!important;}
${item("midnight", 4)},${item("midnight", 4)} span,${item("midnight", 4)} svg{background:#322b39!important;border-color:#806589!important;color:#f0d6f5!important;-webkit-text-fill-color:#f0d6f5!important;}

${items("playful")}{padding:.5rem .78rem!important;border:2px solid transparent!important;border-radius:999px!important;font-family:'Nunito',sans-serif!important;font-weight:700!important;box-shadow:0 3px 0 rgba(39,51,91,.12)!important;}
${item("playful", 1)}{background:#fff0b8!important;color:#745615!important;border-color:#f2d77a!important;}
${item("playful", 2)}{background:#ffe1da!important;color:#924431!important;border-color:#f4aa9a!important;}
${item("playful", 3)}{background:#dff4ff!important;color:#246184!important;border-color:#9dd7f4!important;}
${item("playful", 4)}{background:#ebe5ff!important;color:#584798!important;border-color:#c6b9f4!important;}

${theme("blueprint")}{gap:.42rem!important;}
${items("blueprint")}{padding:.42rem .64rem!important;border:1px solid #87b9dc!important;border-radius:.2rem!important;background:#e2f2ff!important;color:#07568f!important;font-family:'IBM Plex Mono',monospace!important;font-size:.66rem!important;font-weight:500!important;letter-spacing:.015em;box-shadow:inset 3px 0 0 #0878d1!important;}
${item("blueprint", 2)}{background:#edf7ff!important;color:#274f70!important;box-shadow:inset 3px 0 0 #4c7fa6!important;}
${item("blueprint", 3)}{background:#e7f7f6!important;color:#21645f!important;box-shadow:inset 3px 0 0 #31938a!important;}
${item("blueprint", 4)}{background:#eef0ff!important;color:#465394!important;box-shadow:inset 3px 0 0 #6878ca!important;}
`;
}

function getArticleTemplateSourceCss(scope) {
  const section = (id) => `${scope}[data-article-template="${id}"] [data-article-sources]`;
  const list = (id) => `${section(id)} .article-sources-list,${section(id)} ul`;
  const item = (id) => `${section(id)} .article-source-item,${section(id)} li`;
  const icon = (id) => `${section(id)} .article-source-item-icon,${section(id)} li>span:first-child,${section(id)} li>div:first-child`;
  return `
${scope} [data-article-sources] .article-sources-list,${scope} [data-article-sources] ul{list-style:none;padding-left:0;}
${scope} [data-article-sources] .article-source-item,${scope} [data-article-sources] li{transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;}
${scope} [data-article-sources] .article-source-item:hover,${scope} [data-article-sources] li:hover{transform:translateY(-2px);border-color:var(--article-accent)!important;}

${section("nordic")}{padding-top:2rem!important;border-top:1px solid #cfc4b3!important;}
${list("nordic")}{gap:.75rem!important;}
${item("nordic")}{padding:1rem!important;border:1px solid #d8cdbc!important;border-radius:.2rem!important;background:#f6f1e8!important;box-shadow:inset 3px 0 0 #8a6a45!important;}
${icon("nordic")}{color:#8a6a45!important;background:#e9dfcf!important;border-radius:.15rem!important;}
${section("nordic")} .article-source-title{font-family:'Newsreader',serif!important;font-size:1rem!important;}

${section("signal")}{padding-top:1.5rem!important;border-top:4px solid #111!important;}
${section("signal")} h4{text-transform:uppercase;letter-spacing:-.03em;}
${list("signal")}{gap:.65rem!important;}
${item("signal")}{padding:.9rem!important;border:2px solid #111!important;border-radius:0!important;background:#fff!important;box-shadow:5px 5px 0 #111!important;}
${item("signal")}:nth-child(2n){background:#f7f500!important;}
${icon("signal")}{color:#fff!important;background:#ef3b24!important;border:2px solid #111!important;border-radius:0!important;}
${section("signal")} .article-source-title{font-family:'IBM Plex Sans',sans-serif!important;font-weight:700!important;text-transform:uppercase;}
${section("signal")} .article-source-link{font-family:'IBM Plex Mono',monospace!important;font-weight:600!important;text-decoration:underline!important;}

${section("coral")}{padding-top:2.4rem!important;border-top:0!important;}
${section("coral")} h4{font-family:'Fraunces',serif!important;}
${list("coral")}{gap:.85rem!important;}
${item("coral")}{padding:1rem!important;border:1px solid #f0c7bd!important;border-radius:1rem!important;background:linear-gradient(145deg,#fff,#fff0ea)!important;box-shadow:0 10px 24px rgba(122,53,65,.08)!important;}
${item("coral")}:nth-child(2n){background:linear-gradient(145deg,#fff,#f7e7ee)!important;}
${icon("coral")}{color:#fff!important;background:#e85d4a!important;border-radius:999px!important;}

${section("academic")}{padding-top:2rem!important;border-top:2px solid #2f5d7c!important;}
${section("academic")} h4{font-family:'Libre Baskerville',serif!important;}
${list("academic")}{display:block!important;}
${item("academic")}{margin:0!important;padding:.9rem 0!important;border:0!important;border-bottom:1px solid #cfd8de!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;}
${item("academic")}:hover{transform:none!important;padding-left:.35rem!important;}
${icon("academic")}{color:#2f5d7c!important;background:#edf3f6!important;border:1px solid #c2d1da!important;border-radius:.2rem!important;}
${section("academic")} .article-source-title{font-family:'Source Sans 3',sans-serif!important;font-weight:600!important;}

${section("botanical")}{padding-top:2.3rem!important;border-top:1px solid #b8cab5!important;}
${list("botanical")}{gap:.85rem!important;}
${item("botanical")}{padding:1rem!important;border:1px solid #c4d2c0!important;border-radius:1.1rem 1.1rem 1.1rem .3rem!important;background:#eef4eb!important;box-shadow:0 8px 22px rgba(58,91,66,.07)!important;}
${icon("botanical")}{color:#45694f!important;background:#dbe8d7!important;border-radius:1rem 1rem 1rem .25rem!important;}
${section("botanical")} .article-source-title{font-family:'Lora',serif!important;}

${section("newspaper")}{padding-top:1rem!important;border-top:4px double #333!important;}
${section("newspaper")} h4{text-transform:uppercase;letter-spacing:.045em;}
${list("newspaper")}{display:block!important;border-bottom:1px solid #333;}
${item("newspaper")}{display:grid!important;grid-template-columns:2rem minmax(0,1fr)!important;margin:0!important;padding:.8rem 0!important;border:0!important;border-top:1px solid #8e8980!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;}
${item("newspaper")}:hover{transform:none!important;background:#efeae0!important;}
${icon("newspaper")}{color:#b42318!important;background:transparent!important;border:0!important;border-radius:0!important;}
${section("newspaper")} .article-source-title{font-family:'Roboto Slab',serif!important;font-weight:700!important;}
${section("newspaper")} .article-source-link{text-transform:uppercase;letter-spacing:.06em;font-size:.65rem!important;}

${section("midnight")}{padding-top:2.2rem!important;border-top:1px solid #475569!important;}
${list("midnight")}{gap:.8rem!important;}
${item("midnight")}{padding:1rem!important;border:1px solid #3d4b60!important;border-radius:.65rem!important;background:#1d2939!important;box-shadow:0 12px 28px rgba(0,0,0,.2)!important;}
${item("midnight")}:hover{border-color:#d7ad5c!important;box-shadow:0 12px 30px rgba(215,173,92,.1)!important;}
${icon("midnight")}{color:#e5c883!important;background:#2d3542!important;border:1px solid #806a3f!important;border-radius:.45rem!important;}
${section("midnight")} .article-source-item-content,${section("midnight")} li>div:last-child{color:#eef4ff!important;-webkit-text-fill-color:#eef4ff!important;opacity:1!important;}
${section("midnight")} .article-source-title,${section("midnight")} li>div:last-child>span,${section("midnight")} li>div:last-child>p{color:#fff8e7!important;-webkit-text-fill-color:#fff8e7!important;font-family:'Playfair Display',serif!important;opacity:1!important;}
${section("midnight")} .article-source-link,${section("midnight")} li>div:last-child a,${section("midnight")} li>div:last-child a *{color:#f1cf88!important;-webkit-text-fill-color:#f1cf88!important;opacity:1!important;}
${section("midnight")} .article-source-link svg,${section("midnight")} li>div:last-child a svg{color:#f1cf88!important;stroke:#f1cf88!important;-webkit-text-fill-color:transparent!important;opacity:1!important;}

${section("playful")}{padding-top:2rem!important;border-top:3px dashed #c6b9f4!important;}
${list("playful")}{gap:.85rem!important;}
${item("playful")}{padding:1rem!important;border:2px solid #f2d77a!important;border-radius:1.25rem!important;background:#fff8d9!important;box-shadow:0 5px 0 rgba(39,51,91,.1)!important;}
${item("playful")}:nth-child(2n){border-color:#9dd7f4!important;background:#eaf8ff!important;}
${item("playful")}:nth-child(3n){border-color:#c6b9f4!important;background:#f0edff!important;}
${icon("playful")}{color:#fff!important;background:#f26b4f!important;border-radius:999px!important;transform:rotate(-4deg);}
${section("playful")} .article-source-title{font-family:'Nunito',sans-serif!important;font-weight:800!important;}

${section("blueprint")}{padding-top:2rem!important;border-top:1px solid #87b9dc!important;}
${section("blueprint")} h4{font-family:'Space Grotesk',sans-serif!important;letter-spacing:-.02em;}
${list("blueprint")}{gap:.65rem!important;}
${item("blueprint")}{padding:.9rem!important;border:1px solid #87b9dc!important;border-radius:.25rem!important;background-color:#edf7ff!important;background-image:linear-gradient(rgba(8,120,209,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(8,120,209,.05) 1px,transparent 1px)!important;background-size:12px 12px!important;box-shadow:inset 3px 0 0 #0878d1!important;}
${icon("blueprint")}{color:#0878d1!important;background:#d8edfc!important;border:1px solid #87b9dc!important;border-radius:.2rem!important;}
${section("blueprint")} .article-source-title{font-family:'Space Grotesk',sans-serif!important;font-weight:600!important;}
${section("blueprint")} .article-source-link{font-family:'IBM Plex Mono',monospace!important;font-size:.65rem!important;}

@media (prefers-reduced-motion:reduce){${scope} [data-article-sources] li{transition:none!important;}}
`;
}

function getArticleTemplateVisualCss(scope) {
  const theme = (id) => `${scope}[data-article-template="${id}"]`;
  const meta = (id) => `${theme(id)} [data-article-meta-row]`;
  const badges = (id) => `${meta(id)}>* ,${meta(id)} .article-meta-badge`;
  const sources = (id) => `${theme(id)} [data-article-sources]`;
  const sourceItem = (id) => `${sources(id)} .article-source-item,${sources(id)} li`;
  return `
${theme("swiss")} article h1{font-weight:800!important;text-transform:uppercase;letter-spacing:-.045em!important;border-top:8px solid #111;padding-top:.55rem;}
${theme("swiss")} article h2,${theme("swiss")} article h3{text-transform:uppercase;letter-spacing:-.02em;border-bottom:3px solid #e1251b;padding-bottom:.25rem;}
${theme("swiss")} .marcie-cover-figure{border:3px solid #111!important;box-shadow:8px 8px 0 #e1251b!important;filter:saturate(.85) contrast(1.08);}
${badges("swiss")}{border:2px solid #111!important;border-radius:0!important;background:#fff!important;color:#111!important;font-family:'Work Sans',sans-serif!important;text-transform:uppercase;letter-spacing:.04em;}
${meta("swiss")} .article-meta-badge--date,${meta("swiss")}>*:first-child{background:#e1251b!important;color:#fff!important;}
${theme("swiss")} article blockquote{border-left:8px solid #e1251b!important;border-radius:0!important;}
${sources("swiss")}{border-top:8px solid #111!important;}
${sourceItem("swiss")}{border:2px solid #111!important;border-radius:0!important;box-shadow:4px 4px 0 #e1251b!important;}

${theme("deco")} article h1{text-align:center;text-transform:uppercase;letter-spacing:.09em!important;border-top:1px solid #a87928;border-bottom:3px double #a87928;padding:.8rem .4rem;}
${theme("deco")} article h2,${theme("deco")} article h3{text-align:center;text-transform:uppercase;letter-spacing:.08em;}
${theme("deco")} .marcie-cover-figure{border:1px solid #a87928!important;outline:5px double #17130f;outline-offset:-12px;box-shadow:0 14px 32px rgba(23,19,15,.18)!important;filter:sepia(.18) contrast(1.04);}
${meta("deco")}{justify-content:center;border-top:1px solid #a87928;border-bottom:1px solid #a87928;padding:.55rem 0;}
${badges("deco")}{border:0!important;border-radius:0!important;background:transparent!important;color:#6d5324!important;font-family:'Montserrat',sans-serif!important;text-transform:uppercase;letter-spacing:.08em;}
${theme("deco")} article blockquote{border:1px solid #c7a35a!important;border-left:5px double #c7a35a!important;border-radius:0!important;box-shadow:inset 0 0 0 5px #17130f!important;}
${sources("deco")}{border-top:4px double #a87928!important;text-align:center;}
${sourceItem("deco")}{border:1px solid #b99550!important;border-radius:0!important;background:#fffaf0!important;box-shadow:inset 0 0 0 3px #f8f1df!important;}

${theme("terminal")}{background-image:repeating-linear-gradient(0deg,rgba(85,255,125,.025) 0 1px,transparent 1px 4px)!important;}
${theme("terminal")} article h1{text-transform:uppercase;letter-spacing:.03em!important;text-shadow:0 0 14px rgba(85,255,125,.32);}
${theme("terminal")} article h1::before{content:'> ';color:#55ff7d;}
${theme("terminal")} article h2::before,${theme("terminal")} article h3::before{content:'// ';color:#55ff7d;}
${theme("terminal")} .marcie-cover-figure{border:1px solid #55ff7d!important;box-shadow:0 0 24px rgba(85,255,125,.16)!important;filter:grayscale(.35) sepia(.2) hue-rotate(75deg) contrast(1.12);}
${badges("terminal")}{border:1px solid #285c38!important;border-radius:.2rem!important;background:#0c1c13!important;color:#b9ff8f!important;font-family:'JetBrains Mono',monospace!important;box-shadow:inset 0 0 10px rgba(85,255,125,.06)!important;}
${theme("terminal")} article blockquote{box-shadow:inset 0 0 18px rgba(85,255,125,.06)!important;}
${sources("terminal")}{border-top:1px dashed #55ff7d!important;}
${sourceItem("terminal")}{border:1px solid #285c38!important;background:#0c1c13!important;box-shadow:inset 3px 0 0 #55ff7d!important;}
${theme("terminal")} [contenteditable="true"]{color:#d9ffe2!important;caret-color:#55ff7d!important;-webkit-text-fill-color:#d9ffe2!important;}
${theme("terminal")} [contenteditable="true"] *{color:inherit!important;-webkit-text-fill-color:inherit!important;}
${theme("terminal")} [contenteditable="true"]::selection,${theme("terminal")} [contenteditable="true"] *::selection{background:#55ff7d!important;color:#07110c!important;-webkit-text-fill-color:#07110c!important;}
${theme("terminal")} [contenteditable="true"]:focus{outline:none!important;box-shadow:0 0 0 2px rgba(85,255,125,.3)!important;}

${theme("memphis")} article h1{text-shadow:3px 3px 0 #ffd633;transform:rotate(-.4deg);}
${theme("memphis")} article h2,${theme("memphis")} article h3{display:table;padding:.15rem .45rem;background:#1557ff;color:#fff!important;box-shadow:4px 4px 0 #ffd633;transform:rotate(-.25deg);}
${theme("memphis")} .marcie-cover-figure{border:3px solid #14235c!important;box-shadow:8px 8px 0 #ff3c85!important;transform:rotate(.35deg);}
${badges("memphis")}{border:2px solid #14235c!important;border-radius:999px!important;background:#ffd633!important;color:#14235c!important;font-family:'DM Sans',sans-serif!important;box-shadow:2px 2px 0 #14235c!important;}
${meta("memphis")} .article-meta-badge:nth-child(2),${meta("memphis")}>*:nth-child(2){background:#ffcadf!important;}
${meta("memphis")} .article-meta-badge:nth-child(3),${meta("memphis")}>*:nth-child(3){background:#bdf4e5!important;}
${theme("memphis")} article blockquote{border:2px solid #14235c!important;border-left:8px solid #ff3c85!important;box-shadow:6px 6px 0 #ffd633!important;transform:rotate(-.25deg);}
${sources("memphis")}{border-top:4px dotted #1557ff!important;}
${sourceItem("memphis")}{border:2px solid #14235c!important;border-radius:.8rem!important;box-shadow:4px 4px 0 #30c7a7!important;}

${theme("washi")}{background-image:linear-gradient(90deg,rgba(76,66,52,.025) 1px,transparent 1px),linear-gradient(rgba(76,66,52,.018) 1px,transparent 1px)!important;background-size:22px 22px!important;}
${theme("washi")} article h1{border-left:5px solid #c83f2f;padding-left:1rem;letter-spacing:.015em!important;}
${theme("washi")} article h2,${theme("washi")} article h3{border-bottom:1px solid #c9c0b1;padding-bottom:.4rem;}
${theme("washi")} .marcie-cover-figure{border-radius:.1rem!important;box-shadow:12px 12px 0 #ded5c6!important;filter:grayscale(.25) sepia(.12);}
${meta("washi")}{border-top:1px solid #c9c0b1;border-bottom:1px solid #c9c0b1;padding:.45rem 0;}
${badges("washi")}{border:0!important;border-radius:0!important;background:transparent!important;color:#5e574d!important;font-family:'Noto Sans JP',sans-serif!important;}
${meta("washi")} .article-meta-badge:first-child,${meta("washi")}>*:first-child{color:#c83f2f!important;}
${theme("washi")} article blockquote{border-left:2px solid #c83f2f!important;border-radius:0!important;background:transparent!important;}
${sources("washi")}{border-top:1px solid #211f1b!important;}
${sourceItem("washi")}{border:0!important;border-bottom:1px solid #c9c0b1!important;border-radius:0!important;background:transparent!important;}

${theme("aurora")}{background-image:radial-gradient(circle at 8% 4%,rgba(73,227,216,.2),transparent 28%),radial-gradient(circle at 92% 18%,rgba(102,151,255,.2),transparent 31%)!important;}
${theme("aurora")} article h1{background:linear-gradient(90deg,#12304f,#008eaa,#596ed8);-webkit-background-clip:text;background-clip:text;color:transparent!important;}
${theme("aurora")} article h2,${theme("aurora")} article h3{color:#126c80!important;}
${theme("aurora")} .marcie-cover-figure{border:1px solid rgba(255,255,255,.8)!important;box-shadow:0 20px 45px rgba(38,132,157,.2)!important;}
${badges("aurora")}{border:1px solid rgba(143,211,219,.7)!important;border-radius:999px!important;background:rgba(255,255,255,.58)!important;color:#17677a!important;backdrop-filter:blur(10px);}
${theme("aurora")} article blockquote{border:1px solid rgba(0,164,174,.3)!important;border-left:5px solid #00a4ae!important;box-shadow:0 14px 32px rgba(38,132,157,.12)!important;backdrop-filter:blur(12px);}
${sources("aurora")}{border-top:1px solid rgba(0,142,170,.25)!important;}
${sourceItem("aurora")}{border:1px solid rgba(143,211,219,.7)!important;background:rgba(255,255,255,.58)!important;box-shadow:0 12px 28px rgba(38,132,157,.1)!important;backdrop-filter:blur(10px);}

${theme("risograph")}{background-image:radial-gradient(rgba(23,47,122,.08) .7px,transparent .7px)!important;background-size:5px 5px!important;}
${theme("risograph")} article h1{text-transform:uppercase;letter-spacing:.015em!important;text-shadow:3px 2px 0 #ff91bd;}
${theme("risograph")} article h2,${theme("risograph")} article h3{text-transform:uppercase;color:#172f7a!important;text-decoration:underline;text-decoration-color:#ef2b84;text-decoration-thickness:4px;}
${theme("risograph")} .marcie-cover-figure{border:3px solid #172f7a!important;box-shadow:7px 6px 0 #ef2b84!important;filter:saturate(1.2) contrast(1.08);}
${badges("risograph")}{border:2px solid #172f7a!important;border-radius:0!important;background:#ffe1a6!important;color:#172f7a!important;font-family:'Public Sans',sans-serif!important;box-shadow:3px 3px 0 #ef2b84!important;}
${theme("risograph")} article blockquote{border:2px solid #172f7a!important;border-left:7px solid #ef2b84!important;border-radius:0!important;box-shadow:6px 5px 0 rgba(23,47,122,.25)!important;}
${sources("risograph")}{border-top:5px solid #ef2b84!important;}
${sourceItem("risograph")}{border:2px solid #172f7a!important;border-radius:0!important;box-shadow:5px 4px 0 #ef2b84!important;}

${theme("desert")} article h1{letter-spacing:-.015em!important;font-weight:600!important;}
${theme("desert")} article h2,${theme("desert")} article h3{color:#29345c!important;font-style:italic;}
${theme("desert")} .marcie-cover-figure{border:1px solid #c8a984!important;box-shadow:0 20px 38px rgba(91,62,45,.18)!important;filter:sepia(.12) saturate(.86);}
${badges("desert")}{border:1px solid #c8a984!important;border-radius:1.5rem 1.5rem .3rem .3rem!important;background:#eed0bb!important;color:#6f382d!important;font-family:'Karla',sans-serif!important;}
${meta("desert")} .article-meta-badge:nth-child(2),${meta("desert")}>*:nth-child(2){background:#d9d9c2!important;color:#414b49!important;}
${theme("desert")} article blockquote{border:0!important;border-left:6px solid #29345c!important;border-radius:0 3rem 3rem 0!important;}
${sources("desert")}{border-top:1px solid #c8a984!important;}
${sourceItem("desert")}{border:1px solid #c8a984!important;border-radius:1.5rem 1.5rem .45rem .45rem!important;background:#fbf0dd!important;}

${theme("spaceage")} article h1{letter-spacing:.01em!important;text-shadow:2px 3px 0 #ffb33b;}
${theme("spaceage")} article h2,${theme("spaceage")} article h3{color:#e75d26!important;letter-spacing:.02em;}
${theme("spaceage")} .marcie-cover-figure{border:4px solid #7d4a2f!important;box-shadow:0 10px 0 #e75d26!important;filter:sepia(.16) saturate(1.05);}
${badges("spaceage")}{border:2px solid #7d4a2f!important;border-radius:999px!important;background:#ffcf7a!important;color:#4a281d!important;font-family:'Outfit',sans-serif!important;box-shadow:inset 0 -3px 0 rgba(125,74,47,.2)!important;}
${theme("spaceage")} article blockquote{border:3px solid #7d4a2f!important;border-left:10px solid #ffb33b!important;border-radius:2.5rem!important;box-shadow:0 7px 0 #e75d26!important;}
${sources("spaceage")}{border-top:5px solid #7d4a2f!important;}
${sourceItem("spaceage")}{border:2px solid #7d4a2f!important;border-radius:2rem!important;background:#fff2cf!important;box-shadow:inset 0 -4px 0 #ffd18a!important;}

${theme("holographic")}{background-image:radial-gradient(circle at 12% 8%,rgba(121,242,255,.3),transparent 25%),radial-gradient(circle at 88% 14%,rgba(255,157,206,.3),transparent 27%)!important;}
${theme("holographic")} article h1{background:linear-gradient(100deg,#241b46 5%,#7d3cff 38%,#e33b9c 66%,#008da8 95%);-webkit-background-clip:text;background-clip:text;color:transparent!important;}
${theme("holographic")} article h2,${theme("holographic")} article h3{color:#6333bd!important;}
${theme("holographic")} .marcie-cover-figure{border:2px solid transparent!important;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(120deg,#79f2ff,#d7b5ff,#ff9dce,#fff4a9) border-box!important;box-shadow:0 18px 42px rgba(125,60,255,.16)!important;}
${badges("holographic")}{border:1px solid rgba(125,60,255,.25)!important;border-radius:999px!important;background:linear-gradient(120deg,rgba(121,242,255,.32),rgba(215,181,255,.35),rgba(255,157,206,.32))!important;color:#4b2a87!important;backdrop-filter:blur(10px);}
${theme("holographic")} article blockquote{border:2px solid transparent!important;border-left:6px solid #00a7c7!important;background:linear-gradient(#f0e8ff,#f0e8ff) padding-box,linear-gradient(120deg,#79f2ff,#d7b5ff,#ff9dce) border-box!important;box-shadow:0 14px 30px rgba(125,60,255,.12)!important;}
${sources("holographic")}{border-top:2px solid transparent!important;border-image:linear-gradient(90deg,#79f2ff,#7d3cff,#ff9dce) 1!important;}
${sourceItem("holographic")}{border:1px solid transparent!important;background:linear-gradient(rgba(255,255,255,.8),rgba(255,255,255,.8)) padding-box,linear-gradient(120deg,#79f2ff,#d7b5ff,#ff9dce) border-box!important;box-shadow:0 12px 28px rgba(125,60,255,.1)!important;}

${theme("bubblegum")} article h1{text-shadow:3px 3px 0 #dfff62;}${theme("bubblegum")} article h2,${theme("bubblegum")} article h3{display:table;padding:.15rem .55rem;border-radius:999px;background:#3e174d;color:#fff!important;}${theme("bubblegum")} .marcie-cover-figure{border:3px solid #3e174d!important;box-shadow:9px 9px 0 #dfff62!important;}${badges("bubblegum")}{background:#ffd6ea!important;color:#5c1d55!important;border:1px solid #f02f8f!important;border-radius:999px!important;}${sourceItem("bubblegum")}{border-radius:1.5rem!important;background:#fff7fb!important;}
${theme("cyberpop")} article h1{text-transform:uppercase;text-shadow:0 0 18px rgba(0,245,212,.35);}${theme("cyberpop")}{background-image:linear-gradient(rgba(103,71,168,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(103,71,168,.1) 1px,transparent 1px)!important;background-size:28px 28px!important;}${badges("cyberpop")}{background:#211044!important;color:#00f5d4!important;border:1px solid #ff3cac!important;}${sourceItem("cyberpop")}{background:#17102e!important;border:1px solid #6747a8!important;box-shadow:inset 3px 0 #00f5d4!important;}
${theme("skater")} article h1{text-transform:uppercase;transform:rotate(-1deg);text-shadow:4px 4px 0 #ef4d23;}${theme("skater")} .marcie-cover-figure{filter:grayscale(1) contrast(1.25);border:4px solid #151515!important;box-shadow:10px 8px 0 #ef4d23!important;}${badges("skater")}{border:2px solid #151515!important;border-radius:0!important;background:#f5df38!important;color:#151515!important;transform:rotate(-1deg);}${sourceItem("skater")}{border:2px solid #151515!important;border-radius:0!important;box-shadow:4px 4px 0 #ef4d23!important;}
${theme("dopamine")} article h1{text-shadow:4px 4px 0 #ffcf33;}${theme("dopamine")} article h2,${theme("dopamine")} article h3{color:#1a4ed8!important;}${badges("dopamine")}{border:2px solid #1a4ed8!important;background:#ffe2a8!important;color:#132c52!important;border-radius:.7rem!important;}${meta("dopamine")}>*:nth-child(2){background:#b9f4d8!important;}${meta("dopamine")}>*:nth-child(3){background:#ffd3e5!important;}${sourceItem("dopamine")}{border:2px solid #1a4ed8!important;box-shadow:5px 5px 0 #ff4f40!important;}
${theme("y2k")} article h1{background:linear-gradient(100deg,#10244d,#246bfe,#7b41e8);-webkit-background-clip:text;background-clip:text;color:transparent!important;}${theme("y2k")} .marcie-cover-figure{border:2px solid #fff!important;box-shadow:0 18px 38px rgba(36,107,254,.22)!important;}${badges("y2k")}{border:1px solid #9eb9e8!important;background:rgba(255,255,255,.68)!important;color:#244f9d!important;border-radius:999px!important;}${sourceItem("y2k")}{border:1px solid #9eb9e8!important;background:rgba(255,255,255,.7)!important;border-radius:1.4rem!important;}
${theme("matcha")} article h1{font-style:italic;}${theme("matcha")} article h2,${theme("matcha")} article h3{border-bottom:3px solid #678b4e;padding-bottom:.3rem;}${badges("matcha")}{border:0!important;background:#dbe8bd!important;color:#385433!important;border-radius:999px!important;}${sourceItem("matcha")}{border:1px solid #b7c69a!important;background:#fafbec!important;border-radius:1.4rem .4rem 1.4rem .4rem!important;}
${theme("sunsetsocial")} article h1{background:linear-gradient(90deg,#40224f,#f05a67,#8a53d2);-webkit-background-clip:text;background-clip:text;color:transparent!important;}${theme("sunsetsocial")} .marcie-cover-figure{box-shadow:0 22px 45px rgba(138,83,210,.2)!important;}${badges("sunsetsocial")}{background:#ffd9d5!important;color:#6a304f!important;border:1px solid #efbbb8!important;border-radius:999px!important;}${sourceItem("sunsetsocial")}{border:1px solid #efbbb8!important;border-radius:1.25rem!important;background:#fffaf7!important;}
${theme("comicpulse")} article h1{text-transform:uppercase;letter-spacing:.025em!important;text-shadow:4px 4px 0 #63d9ff;}${theme("comicpulse")} article h2,${theme("comicpulse")} article h3{display:table;padding:.2rem .5rem;background:#ef3340;color:#fff!important;transform:rotate(-.4deg);}${theme("comicpulse")} .marcie-cover-figure{border:4px solid #17245b!important;box-shadow:8px 8px 0 #ef3340!important;}${badges("comicpulse")}{border:2px solid #17245b!important;background:#ffd633!important;color:#17245b!important;box-shadow:2px 2px 0 #17245b!important;}${sourceItem("comicpulse")}{border:3px solid #17245b!important;box-shadow:5px 5px 0 #63d9ff!important;}
${theme("pixelcandy")}{background-image:linear-gradient(rgba(156,107,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(156,107,255,.08) 1px,transparent 1px)!important;background-size:16px 16px!important;}${theme("pixelcandy")} article h1{text-shadow:3px 3px 0 #ff6eb4;}${badges("pixelcandy")}{border:2px solid #9c6bff!important;border-radius:0!important;background:#432760!important;color:#62f6c5!important;font-family:'Space Mono',monospace!important;}${sourceItem("pixelcandy")}{border:2px solid #9c6bff!important;border-radius:0!important;background:#2d2050!important;box-shadow:4px 4px 0 #ff6eb4!important;}
${theme("indiecollage")} article h1{display:inline;background:#fffdf8;box-shadow:8px 0 #fffdf8,-8px 0 #fffdf8;}${theme("indiecollage")} .marcie-cover-figure{filter:sepia(.2) contrast(1.1);border:1px solid #36302c!important;box-shadow:10px 10px 0 #c83d57!important;transform:rotate(.5deg);}${badges("indiecollage")}{border:1px solid #36302c!important;border-radius:0!important;background:#d7e6ca!important;color:#36302c!important;}${sourceItem("indiecollage")}{border:1px solid #36302c!important;border-radius:0!important;background:#fffdf8!important;transform:rotate(-.15deg);}

${theme("swissglass")} article h1{text-transform:uppercase;border-top:7px solid #101820;padding-top:.5rem;}${theme("swissglass")}{background-image:radial-gradient(circle at 85% 8%,rgba(98,199,210,.25),transparent 30%)!important;}${badges("swissglass")}{border:1px solid rgba(98,199,210,.8)!important;background:rgba(255,255,255,.6)!important;color:#173b43!important;border-radius:.2rem!important;}${sourceItem("swissglass")}{border:1px solid #62c7d2!important;border-radius:.35rem!important;background:rgba(255,255,255,.65)!important;box-shadow:4px 4px 0 #ef342a!important;}
${theme("decoholo")} article h1{text-align:center;text-transform:uppercase;letter-spacing:.08em!important;border-block:3px double #9b63ff;padding:.7rem;}${theme("decoholo")} .marcie-cover-figure{outline:4px double #241632;outline-offset:-11px;box-shadow:0 18px 40px rgba(155,99,255,.2)!important;}${badges("decoholo")}{background:linear-gradient(120deg,#d5ffff,#f1d5ff,#ffd7ea)!important;color:#4a285f!important;border:1px solid #c59aea!important;}${sourceItem("decoholo")}{border:1px solid transparent!important;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(120deg,#77e8e2,#ff9bcf,#9b63ff) border-box!important;}
${theme("terminalriso")}{background-image:radial-gradient(rgba(184,255,125,.08) 1px,transparent 1px)!important;background-size:6px 6px!important;}${theme("terminalriso")} article h1{text-transform:uppercase;text-shadow:3px 2px 0 #ff3c96;}${badges("terminalriso")}{border:1px solid #b8ff7d!important;border-radius:0!important;background:#261f33!important;color:#b8ff7d!important;box-shadow:3px 3px 0 #ff3c96!important;}${sourceItem("terminalriso")}{border:1px solid #6c8e55!important;border-radius:0!important;background:#172122!important;box-shadow:5px 4px 0 #ff3c96!important;}
${theme("washimemphis")} article h1{border-left:5px solid #e3454d;padding-left:1rem;text-shadow:2px 2px 0 #ffd64a;}${theme("washimemphis")} article h2,${theme("washimemphis")} article h3{display:table;background:#2463d4;color:#fff!important;padding:.15rem .5rem;}${badges("washimemphis")}{border:1px solid #292723!important;background:#ffd64a!important;color:#292723!important;border-radius:999px!important;}${sourceItem("washimemphis")}{border:1px solid #292723!important;background:#fffaf0!important;box-shadow:4px 4px 0 #cbe9df!important;}
${theme("desertdeco")} article h1{text-align:center;text-transform:uppercase;letter-spacing:.05em!important;border-block:1px solid #9a7339;padding:.7rem;}${theme("desertdeco")} .marcie-cover-figure{outline:4px double #d8ad5b;outline-offset:-12px;}${badges("desertdeco")}{border:1px solid #9a7339!important;background:#e7c2a6!important;color:#4d3036!important;border-radius:1.5rem 1.5rem .2rem .2rem!important;}${sourceItem("desertdeco")}{border:1px solid #9a7339!important;background:#f8ead2!important;border-radius:2rem 2rem .2rem .2rem!important;}
${theme("spacebotanical")} article h1{text-shadow:2px 3px 0 #f2bb43;}${theme("spacebotanical")} article h2,${theme("spacebotanical")} article h3{color:#e06b32!important;}${badges("spacebotanical")}{border:1px solid #708666!important;background:#f4caa5!important;color:#243b32!important;border-radius:999px!important;}${sourceItem("spacebotanical")}{border:1px solid #708666!important;background:#f8f3d8!important;border-radius:2rem!important;box-shadow:inset 0 -4px #f2bb43!important;}
${theme("nordiccyber")} article h1{border-bottom:5px solid #b8ff38;padding-bottom:.35rem;}${theme("nordiccyber")} article h2,${theme("nordiccyber")} article h3{font-family:'Space Grotesk',sans-serif!important;text-transform:uppercase;letter-spacing:.05em;}${badges("nordiccyber")}{border:1px solid #9ea9a4!important;border-radius:.2rem!important;background:#d8f4e9!important;color:#20584a!important;}${sourceItem("nordiccyber")}{border:1px solid #9ea9a4!important;border-radius:.25rem!important;background:#fffefa!important;box-shadow:inset 4px 0 #b8ff38!important;}
${theme("coralnews")} article h1{border-top:5px solid #321f28;border-bottom:1px solid #321f28;padding:.45rem 0;}${theme("coralnews")} .marcie-cover-figure{filter:sepia(.12);border-radius:.15rem!important;}${badges("coralnews")}{border:1px solid #4a3338!important;border-radius:0!important;background:#fbd8cf!important;color:#5d2f39!important;}${sourceItem("coralnews")}{border:0!important;border-top:1px solid #4a3338!important;border-radius:0!important;background:transparent!important;}
${theme("blueprintzine")}{background-image:linear-gradient(rgba(8,120,209,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(8,120,209,.06) 1px,transparent 1px)!important;background-size:18px 18px!important;}${theme("blueprintzine")} article h1{text-transform:uppercase;text-shadow:3px 3px 0 #ff3f76;}${badges("blueprintzine")}{border:2px solid #0878d1!important;border-radius:0!important;background:#fff!important;color:#062c59!important;box-shadow:3px 3px 0 #ff3f76!important;}${sourceItem("blueprintzine")}{border:2px solid #0878d1!important;border-radius:0!important;background:#f8fcff!important;box-shadow:5px 5px 0 #ff3f76!important;}
${theme("midnightaurora")}{background-image:radial-gradient(circle at 10% 5%,rgba(87,228,210,.18),transparent 28%),radial-gradient(circle at 90% 15%,rgba(157,124,255,.2),transparent 30%)!important;}${theme("midnightaurora")} article h1{background:linear-gradient(90deg,#f5fbff,#57e4d2,#b49aff);-webkit-background-clip:text;background-clip:text;color:transparent!important;}${badges("midnightaurora")}{border:1px solid #345a70!important;background:rgba(32,51,77,.75)!important;color:#dffefa!important;border-radius:999px!important;}${sourceItem("midnightaurora")}{border:1px solid #345a70!important;background:rgba(19,31,47,.82)!important;border-radius:1rem!important;box-shadow:0 14px 30px rgba(87,228,210,.08)!important;}

@media (max-width:640px){${theme("swiss")} article h1,${theme("memphis")} article h1,${theme("risograph")} article h1{font-size:clamp(1.65rem,9vw,var(--article-title-size))!important;}${theme("memphis")} .marcie-cover-figure,${theme("risograph")} .marcie-cover-figure{transform:none;}}
@media (prefers-reduced-motion:reduce){${theme("memphis")} article h1,${theme("memphis")} article h2,${theme("memphis")} article h3,${theme("memphis")} article blockquote{transform:none!important;}}
`;
}

function ensureArticleTemplatePreviewStyles() {
  if (document.getElementById("marcie-article-template-styles")) return;
  const style = document.createElement("style");
  style.id = "marcie-article-template-styles";
  style.textContent = getArticleTemplateSharedCss(".article-template-surface");
  document.head.appendChild(style);
}

function ensureArticleTemplateFont(template) {
  const id = `marcie-template-font-${template.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = template.fontUrl;
  document.head.appendChild(link);
}

function applyArticleTemplate(article = {}) {
  if (!dom.articleView) return;
  ensureArticleTemplatePreviewStyles();
  const template = getArticleTemplate(article.templateId);
  ensureArticleTemplateFont(template);
  dom.articleView.dataset.articleTemplate = template.id;
  dom.articleView.setAttribute("style", `${dom.articleView.getAttribute("style") || ""};${articleTemplateStyle(template)}`);

  const appearance = article.appearance || {};
  Object.entries(ARTICLE_APPEARANCE_DEFAULTS).forEach(([attr, fallback]) => {
    const legacy = localStorage.getItem(`marcie_textSettings_${attr}`);
    const value = appearance[attr] || legacy;
    if (value) dom.articleView.setAttribute(attr, value);
    else dom.articleView.removeAttribute(attr);
    if (!value && fallback && template.id === "default") dom.articleView.setAttribute(attr, fallback);
  });
}

async function persistArticleAppearance(attr, value) {
  const session = getActiveSession();
  if (!session?.article) return;
  session.article.appearance = { ...(session.article.appearance || {}), [attr]: value };
  if (!session.articlesByAudience) session.articlesByAudience = {};
  session.articlesByAudience[session.audience || session.article.audience || "educators"] = session.article;
  try { await saveMarcieSession(session); } catch (error) { console.warn("[MarcieBlogEditor] No se pudo guardar la apariencia:", error); }
}

async function selectArticleTemplate(templateId) {
  const session = getActiveSession();
  if (!session?.article) throw new Error("No hay un artículo activo.");
  const template = getArticleTemplate(templateId);
  session.article.templateId = template.id;
  if (!session.articlesByAudience) session.articlesByAudience = {};
  session.articlesByAudience[session.audience || session.article.audience || "educators"] = session.article;
  applyArticleTemplate(session.article);
  await saveMarcieSession(session);
  return template;
}

function openArticleTemplateGallery() {
  const session = getActiveSession();
  if (!session?.article) {
    showToast("Primero selecciona o genera un artículo.", "warning");
    return;
  }

  ARTICLE_TEMPLATES.forEach(ensureArticleTemplateFont);
  const selectedId = getArticleTemplate(session.article.templateId).id;
  const cardsHtml = ARTICLE_TEMPLATES.map((template) => `
    <button
      type="button"
      class="article-template-card${template.id === selectedId ? " is-selected" : ""}"
      data-article-template-option="${escapeHtml(template.id)}"
      aria-label="Aplicar plantilla ${escapeHtml(template.name)}"
      aria-pressed="${template.id === selectedId ? "true" : "false"}"
      style="${escapeHtml(articleTemplateStyle(template))}"
    >
      <span class="article-template-card__preview" aria-hidden="true">
        <span class="article-template-card__eyebrow">Marcie Editorial · 6 min</span>
        <span class="article-template-card__cover"></span>
        <span class="article-template-card__title">Ideas que transforman el aprendizaje</span>
        <span class="article-template-card__line"></span>
        <span class="article-template-card__line" style="width:68%"></span>
        <span class="article-template-card__quote">“Una buena idea cambia la manera de mirar el aula.”</span>
      </span>
      <span class="article-template-card__details">
        <span>
          <span class="article-template-card__name">${escapeHtml(template.name)}</span>
          <span class="article-template-card__description">${escapeHtml(template.description)}</span>
        </span>
        <span class="article-template-card__action">${template.id === selectedId ? "Seleccionada" : "Aplicar"}</span>
      </span>
    </button>
  `).join("");

  const modal = showModal({
    title: "Plantillas para el artículo",
    widthClass: "max-w-5xl",
    contentHtml: `
      <div class="mb-4 flex items-start justify-between gap-4">
        <p class="max-w-2xl text-xs leading-relaxed text-slate-500">Elige un lenguaje visual para el artículo actual. La plantilla se guarda con este artículo y el ZIP conservará el mismo diseño.</p>
        <div class="flex shrink-0 items-center gap-2">
          <button id="btn-random-article-template" type="button" class="btn btn-outline h-8 px-3 text-[10px] flex items-center gap-1.5" title="Elegir cualquiera de las plantillas al azar"><i data-lucide="shuffle" class="h-3.5 w-3.5"></i>Plantilla al azar</button>
          <span class="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-700">${ARTICLE_TEMPLATES.length} estilos</span>
        </div>
      </div>
      <div class="article-template-gallery" role="listbox" aria-label="Plantillas disponibles">
        ${cardsHtml}
      </div>
    `
  });
  modal.element.classList.add("article-template-modal");
  requestAnimationFrame(() => {
    modal.element.querySelector("[data-article-template-option].is-selected")?.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
  });
  modal.element.querySelector("#btn-random-article-template")?.addEventListener("click", () => {
    const currentCard = modal.element.querySelector("[data-article-template-option].is-selected");
    const randomTemplate = getRandomArticleTemplate(currentCard?.getAttribute("data-article-template-option") || selectedId);
    modal.element.querySelector(`[data-article-template-option="${randomTemplate.id}"]`)?.click();
  });

  modal.element.querySelectorAll("[data-article-template-option]").forEach((card) => {
    card.addEventListener("click", async () => {
      const templateId = card.getAttribute("data-article-template-option");
      if (!templateId || card.disabled) return;
      const action = card.querySelector(".article-template-card__action");
      card.disabled = true;
      if (action) action.textContent = "Aplicando...";
      try {
        const template = await selectArticleTemplate(templateId);
        modal.element.querySelectorAll("[data-article-template-option]").forEach((option) => {
          const isSelected = option.getAttribute("data-article-template-option") === template.id;
          option.classList.toggle("is-selected", isSelected);
          option.setAttribute("aria-pressed", String(isSelected));
          const optionAction = option.querySelector(".article-template-card__action");
          if (optionAction) optionAction.textContent = isSelected ? "Seleccionada" : "Aplicar";
        });
        showToast(`Plantilla “${template.name}” aplicada`, "success");
      } catch (error) {
        if (action) action.textContent = "Reintentar";
        showToast(`No se pudo guardar la plantilla: ${error.message}`, "error");
      } finally {
        card.disabled = false;
      }
    });
  });
}

function normalizeTextValue(value = "") {
  return String(value || "").trim();
}

function normalizeLookupValue(value = "") {
  return normalizeTextValue(value).toLowerCase();
}

function looksLikeEmail(value = "") {
  return /.+@.+\..+/.test(normalizeTextValue(value));
}

function joinIfPresent(...values) {
  return values.map((v) => normalizeTextValue(v)).filter(Boolean).join(" ");
}

function getDisplayNameFromUserProfile(profile = {}) {
  if (!profile || typeof profile !== "object") return "";

  const fullName = normalizeTextValue(
    profile.displayName ||
    profile.fullName ||
    profile.name ||
    profile.nombre ||
    profile.nombreCompleto
  );
  if (fullName) return fullName;

  const firstName = normalizeTextValue(
    profile.firstName ||
    profile.first_name ||
    profile.nombre ||
    profile.primerNombre ||
    profile.nombreUsuario
  );
  const lastName = normalizeTextValue(
    profile.lastName ||
    profile.last_name ||
    profile.apellido ||
    profile.segundoNombre ||
    profile.segApellido ||
    profile.nameFirst ||
    profile.nameLast
  );
  return joinIfPresent(firstName, lastName);
}

function getPrimaryAuthorFallback(article, session) {
  const candidates = [
    article?.authorName,
    article?.author,
    article?.authorDisplayName,
    session?.authorName,
    session?.author
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTextValue(candidate);
    if (!normalized) continue;
    if (!looksLikeEmail(normalized)) {
      return normalized;
    }
    return normalized;
  }

  return "";
}

function getAuthorLookupKeys(session = {}, article = {}) {
  const emailCandidates = [
    session?.authorEmail,
    session?.ownerEmail,
    article?.authorEmail
  ];
  const uidCandidates = [
    session?.authorUid,
    session?.ownerUid,
    session?.ownerId,
    article?.authorUid
  ];

  const keys = [];
  const uid = normalizeLookupValue(uidCandidates.find(Boolean));
  const email = normalizeLookupValue(emailCandidates.find(Boolean));

  if (uid) keys.push(`uid:${uid}`);
  if (email) keys.push(`email:${email}`);

  return keys;
}

async function getUserDisplayNameFromUsers(lookup = {}) {
  const uid = normalizeTextValue(lookup.uid);
  const email = normalizeTextValue(lookup.email);
  const keys = [];

  if (uid) keys.push(`uid:${normalizeLookupValue(uid)}`);
  if (email) keys.push(`email:${normalizeLookupValue(email)}`);
  if (!keys.length) return "";

  for (const key of keys) {
    if (authorNameCache.has(key)) return authorNameCache.get(key);
  }

  const inFlightKey = keys.sort().join("|");
  if (authorNamePending.has(inFlightKey)) {
    return authorNamePending.get(inFlightKey);
  }

  const request = (async () => {
    const profile = await findUserProfile({ uid, email });
    const displayName = getDisplayNameFromUserProfile(profile?.data || {});
    const result = displayName || "";

    keys.forEach((key) => {
      authorNameCache.set(key, result);
    });

    return result;
  })().finally(() => {
    authorNamePending.delete(inFlightKey);
  });

  authorNamePending.set(inFlightKey, request);
  return request;
}

function extractAuthorFromProfileLookup(article, session, currentUser) {
  const uidCandidates = [
    session?.authorUid,
    session?.ownerUid,
    session?.ownerId,
    article?.authorUid
  ];
  const emailCandidates = [
    session?.authorEmail,
    session?.ownerEmail,
    article?.authorEmail,
    appState.currentUser?.email
  ];

  return [
    {
      uid: normalizeTextValue(uidCandidates.find(Boolean)),
      email: normalizeTextValue(emailCandidates[0])
    },
    {
      uid: "",
      email: normalizeTextValue(article?.authorEmail)
    },
    {
      uid: "",
      email: normalizeTextValue(session?.ownerEmail)
    },
    {
      uid: normalizeTextValue(currentUser?.uid),
      email: normalizeTextValue(currentUser?.email)
    }
  ];
}

async function resolveAuthorDisplayName({ article = {}, session = {} } = {}) {
  const staticAuthorName = getPrimaryAuthorFallback(article, session);
  if (staticAuthorName && !looksLikeEmail(staticAuthorName)) {
    return staticAuthorName;
  }

  const lookupCandidates = extractAuthorFromProfileLookup(article, session, appState.currentUser);
  const seen = new Set();

  for (const lookup of lookupCandidates) {
    const uid = normalizeTextValue(lookup.uid);
    const email = normalizeTextValue(lookup.email);
    const candidateKey = `${uid || ""}|${normalizeLookupValue(email)}`;
    if (!uid && !email || seen.has(candidateKey)) continue;
    seen.add(candidateKey);

    const resolved = await getUserDisplayNameFromUsers(lookup);
    if (resolved && !looksLikeEmail(resolved)) {
      return resolved;
    }
  }

  return staticAuthorName && !looksLikeEmail(staticAuthorName) ? staticAuthorName : "Autor";
}

function setNodeHidden(node, shouldHide) {
  if (!node) return;
  node.hidden = shouldHide;
  node.style.display = shouldHide ? "none" : "";
  node.classList.toggle("hidden", shouldHide);
}

async function getAnimeModule() {
  if (!animeModulePromise) {
    animeModulePromise = import(ARTICLE_GENERATOR_ANIME_SRC).then((module) => {
      const animate = module?.animate || module?.default?.animate || module?.default;
      if (typeof animate !== "function") {
        throw new Error("Módulo de anime.js sin función animate exportada.");
      }
      return { animate };
    });
  }

  return animeModulePromise;
}

function stopArticleGeneratingAnimation(restoreContent = true) {
  if (articleGeneratingAnimation) {
    if (Array.isArray(articleGeneratingAnimation)) {
      articleGeneratingAnimation.forEach((anim) => {
        if (!anim) return;
        if (typeof anim.pause === "function") anim.pause();
        if (typeof anim.cancel === "function") anim.cancel();
      });
    } else {
      if (typeof articleGeneratingAnimation.pause === "function") articleGeneratingAnimation.pause();
      if (typeof articleGeneratingAnimation.cancel === "function") articleGeneratingAnimation.cancel();
    }
  }

  articleGeneratingAnimation = null;
  if (restoreContent) {
    restoreArticleViewContent();
  }
}

function renderArticleGeneratingState(session = {}) {
  if (!dom.articleView) return;

  if (dom.editorialGuideView) {
    dom.editorialGuideView.style.display = "none";
    dom.editorialGuideView.hidden = true;
    dom.editorialGuideView.classList.add("hidden");
  }

  dom.articleView.scrollTop = 0;
  dom.articleView.classList.remove("hidden");
  dom.articleView.style.display = "";
  dom.articleView.hidden = false;
  hideArticleViewContentForGeneration();

  const defaultAudienceLabel = session.audience === "students"
    ? "Estudiantes"
    : session.audience === "parents"
      ? "Padres y tutores"
      : session.audience === "coordinators"
        ? "Coordinadores académicos"
        : "Docentes y directivos";
  const generationProgress = appState.articleGenerationProgress || {};
  const audienceLabel = generationProgress.audienceLabel || defaultAudienceLabel;
  const generationHeading = generationProgress.heading || "Generando artículo con IA";
  const generationMessage = generationProgress.message
    || `Estamos redactando el contenido para ${audienceLabel.toLowerCase()}. Esto puede tardar unos segundos.`;
  const hasCount = generationProgress.current > 0 && generationProgress.total > 0;
  const generationCount = hasCount
    ? `<span class="article-generation-count">Artículo ${generationProgress.current} de ${generationProgress.total}</span>`
    : "";

  const spinnerHost = getArticleGenerationSpinnerHost();
  if (!spinnerHost) return;
  dom.articleView.appendChild(spinnerHost);

  spinnerHost.setAttribute("role", "status");
  spinnerHost.setAttribute("aria-live", "polite");
  spinnerHost.setAttribute("aria-label", `${generationHeading}. ${generationMessage}`);
  spinnerHost.innerHTML = `
    <div class="w-full py-14 flex flex-col items-center justify-center gap-5 px-6">
      <div class="relative w-44 h-44 flex items-center justify-center">
        <div id="article-generation-orbit" class="absolute inset-0 rounded-full border-4 border-transparent border-t-teal-500 border-r-purple-500/90"></div>
        <div id="article-generation-orbit-secondary" class="absolute inset-4 rounded-full border-4 border-transparent border-b-purple-400 border-l-teal-400/80"></div>
        <div id="article-generation-pulse" class="absolute inset-10 rounded-full border border-slate-200/70 bg-white shadow-lg"></div>
        <div id="article-generation-logo" class="absolute inset-14 rounded-full bg-white shadow-xl flex items-center justify-center border border-white">
          <img src="/MarcieBlogEditorLogo2.png" alt="Marcie" class="w-8 h-8 object-contain rounded" />
        </div>
      </div>
      <div class="text-center max-w-md">
        ${generationCount}
        <p class="text-sm font-semibold text-slate-800">${escapeHtml(generationHeading)}</p>
        <p class="text-xs text-slate-500 mt-2">${escapeHtml(generationMessage)}</p>
        <div class="article-generation-dots" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;

  stopArticleGeneratingAnimation(false);
  void getAnimeModule().then(({ animate }) => {
    if (!appState.isGeneratingArticle || appState.currentTab !== "article") return;

    const orbit = document.getElementById("article-generation-orbit");
    const orbitSecondary = document.getElementById("article-generation-orbit-secondary");
    const logo = document.getElementById("article-generation-logo");
    const pulse = document.getElementById("article-generation-pulse");

    if (!orbit || !orbitSecondary || !logo || !pulse) return;

    articleGeneratingAnimation = [
      animateSpinnerTarget(animate, orbit, {
        rotate: [0, 360],
        duration: 1600,
        loop: true,
        ease: "out(2)",
      }),
      animateSpinnerTarget(animate, orbitSecondary, {
        rotate: [0, -360],
        duration: 1900,
        loop: true,
        ease: "inOut(2)",
      }),
      animateSpinnerTarget(animate, logo, {
        scale: [1, 1.07],
        alternate: true,
        duration: 700,
        loop: true,
        ease: "inOut(2)",
        transformOrigin: "50% 50%",
      }),
      animateSpinnerTarget(animate, pulse, {
        scale: [1, 1.12, 1],
        opacity: [0.9, 0.65, 0.9],
        duration: 1400,
        loop: true,
        ease: "inOut(2)",
      }),
    ];
  }).catch((error) => {
    console.error("[MarcieBlogEditor] Error al cargar Anime.js para spinner:", error);
  });
}

function shouldShowEditorialGuide(session, article) {
  if (!session || session.status !== "new") return false;
  const blocks = Array.isArray(article?.blocks) ? article.blocks : [];
  const hasTrends = Array.isArray(session.trends) && session.trends.length > 0;
  const hasProposals = Array.isArray(session.proposals) && session.proposals.length > 0;

  return blocks.length === 0 && !hasTrends && !hasProposals;
}

const EDITORIAL_GUIDE_STEP_DEFS = {
  1: {
    color: "teal",
    circleClass: "bg-teal-500",
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>`,
    label: "Tendencias",
    title: "Paso 1 — Buscar tendencias",
    desc: "Ingresa un tema educativo. El asistente escaneará datos recientes de Google Trends, X (Twitter) y foros académicos para detectar señales con alta demanda y relevancia editorial.",
    tips: ["Usa términos amplios como «IA en aulas» o «evaluación formativa».", "El sistema calcula un TrendScore de 0–100 basado en crecimiento, frescura y diversidad de fuentes.", "Puedes cambiar la región y el periodo de análisis."],
    badge: "Punto de inicio"
  },
  2: {
    color: "blue",
    circleClass: "bg-blue-500",
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 17l4-8 4 4 4-6 4 4"/><path stroke-linecap="round" stroke-linejoin="round" d="M3 17h18"/></svg>`,
    label: "Contexto",
    title: "Paso 2 — Analizar contexto",
    desc: "El asistente procesa las señales encontradas y genera un diagnóstico editorial profundo: detecta ángulos pedagógicos, audiencias potenciales y la competencia de contenido existente.",
    tips: ["El análisis considera el nivel educativo y el tipo de institución.", "Identifica brechas de contenido en el mercado editorial."],
    badge: "Diagnóstico"
  },
  3: {
    color: "purple",
    circleClass: "bg-purple-500",
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 5.5-3 7H8c-.5-1.5-3-3.5-3-7a7 7 0 0 1 7-7z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 21h6m-6-3h6"/></svg>`,
    label: "Propuestas",
    title: "Paso 3 — Crear propuestas",
    desc: "Genera hasta 4 propuestas de artículo con diferentes enfoques para docentes, estudiantes, familias y coordinadores académicos. Incluye título, subtítulo, estructura y ángulo diferenciador.",
    tips: ["Cambia la audiencia en la barra superior antes de generar.", "Puedes seleccionar una propuesta como base y redactar el artículo completo.", "Las propuestas respetan el brief editorial de tu institución."],
    badge: "Creatividad"
  },
  4: {
    color: "amber",
    circleClass: "bg-amber-500",
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
    label: "Auditoría",
    title: "Paso 4 — Auditoría y Revisión",
    desc: "El asistente analiza el artículo redactado y genera un informe con: puntaje de legibilidad, densidad de keywords, tono pedagógico y sugerencias de mejora clasificadas por prioridad.",
    tips: ["La auditoría se guarda automáticamente aunque no apruebes el artículo.", "Puedes re-auditar en cualquier momento desde el mismo paso.", "Los hallazgos se agrupan por severidad: alta, media y baja."],
    badge: "Control de calidad"
  },
  5: {
    color: "rose",
    circleClass: "bg-rose-500",
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>`,
    label: "Exportar",
    title: "Paso 5 — Exportar y Publicar",
    desc: "Descarga el artículo finalizado en Markdown, cópialo en HTML limpio o comparte un enlace. También puedes marcarlo como «Publicado» en tu biblioteca de sesiones.",
    tips: ["El Markdown es compatible con Notion, Ghost, WordPress y la mayoría de CMS.", "El JSON estructurado incluye metadatos SEO, fuentes y bloques tipados."],
    badge: "Publicación"
  }
};

const EDITORIAL_MERGED_STEP_DEFS = {
  1: {
    color: "teal",
    circleClass: "bg-teal-500",
    icon: EDITORIAL_GUIDE_STEP_DEFS[1].icon,
    label: "Investigar",
    title: "Etapa 1 — Investigar y analizar",
    desc: "Busca tendencias educativas y analiza su contexto editorial en una sola etapa: demanda, relevancia, audiencias, ángulos pedagógicos y brechas de contenido.",
    tips: ["Explora términos amplios y revisa su TrendScore.", "Valida las señales, la audiencia y la competencia.", "Confirma la oportunidad editorial antes de crear propuestas."],
    badge: "Investigación"
  },
  2: {
    color: "purple",
    circleClass: "bg-purple-500",
    icon: EDITORIAL_GUIDE_STEP_DEFS[3].icon,
    label: "Crear y analizar",
    title: "Etapa 2 — Crear, redactar y analizar",
    desc: "Genera propuestas, desarrolla el artículo y completa su auditoría editorial dentro de una sola etapa de producción y control de calidad.",
    tips: ["Elige la audiencia antes de generar propuestas.", "Selecciona una propuesta para redactar el artículo.", "Revisa legibilidad, keywords, tono y hallazgos antes de exportar."],
    badge: "Producción"
  },
  3: {
    color: "rose",
    circleClass: "bg-rose-500",
    icon: EDITORIAL_GUIDE_STEP_DEFS[5].icon,
    label: "Exportar",
    title: "Etapa 3 — Exportar y publicar",
    desc: EDITORIAL_GUIDE_STEP_DEFS[5].desc,
    tips: EDITORIAL_GUIDE_STEP_DEFS[5].tips,
    badge: "Publicación"
  }
};

function getEditorialMergedStepDef(step, session = getActiveSession()) {
  const base = EDITORIAL_MERGED_STEP_DEFS[step];
  if (!base || !sessionUsesAida(session || {})) return base;
  if (step === 1) return {
    ...base,
    label: "Investigar el tema",
    title: "Etapa 1 — Investigación integral Aida",
    desc: "Investiga el tema completo con 8–12 páginas concretas. Añade hechos científicos y evolución histórica cuando sean pertinentes y estén respaldados.",
    tips: ["Usa las fuentes de mayor autoridad para el ámbito del tema.", "Relaciona cada afirmación y señal actual con una página recuperada.", "No completes datos, años, personas ni descubrimientos sin respaldo."],
    badge: "Investigación Aida"
  };
  if (step === 2) return {
    ...base,
    label: "Ocho fases Aida",
    title: "Etapa 2 — Crear, redactar y comprobar Aida",
    desc: "Construye una propuesta por público, redacta las ocho fases y audita idea central, analogía, evidencia, cronología y cierre de marca.",
    tips: ["Abre con una escena o problema reconocible.", "Mantén una idea central fiel al tema y una analogía dominante.", "Usa ciencia e historia como respaldo pertinente y revisa todas las afirmaciones."],
    badge: "Producción Aida"
  };
  return base;
}

const EDITORIAL_PHASE_TABS = {
  1: [
    { id: "search", tabLabel: "Buscar", ...EDITORIAL_GUIDE_STEP_DEFS[1] },
    { id: "context", tabLabel: "Analizar", ...EDITORIAL_GUIDE_STEP_DEFS[2] }
  ],
  2: [
    { id: "proposals", tabLabel: "Crear", ...EDITORIAL_GUIDE_STEP_DEFS[3] },
    {
      id: "draft",
      tabLabel: "Redactar",
      color: "blue",
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
      title: "Redactar el artículo",
      desc: "Convierte la propuesta seleccionada en un artículo completo para la audiencia activa, con título, subtítulo, bloques editoriales, citas, fuentes y metadatos.",
      tips: ["Selecciona primero la propuesta con mejor enfoque.", "Revisa título, subtítulo y estructura antes de auditar.", "Puedes editar directamente cada bloque del artículo generado."],
      badge: "Redacción"
    },
    { id: "audit", tabLabel: "Analizar", ...EDITORIAL_GUIDE_STEP_DEFS[4], title: "Analizar y revisar el artículo" }
  ]
};

function getEditorialAudienceLabel(audience = "educators") {
  if (audience === "students") return "Estudiantes";
  if (audience === "parents") return "Padres y tutores";
  if (audience === "coordinators") return "Coordinadores académicos";
  return "Docentes y directivos";
}

function openEditorialPhaseModal(phaseId) {
  const tabs = EDITORIAL_PHASE_TABS[phaseId];
  if (!tabs?.length) return;

  const aidaMode = sessionUsesAida(getActiveSession() || {});
  const phaseTitle = phaseId === 1
    ? (aidaMode ? "Investigar el tema · Aida" : "Investigar y analizar")
    : (aidaMode ? "Crear las ocho fases · Aida" : "Crear, redactar y analizar");
  const modal = showModal({
    title: phaseTitle,
    widthClass: phaseId === 2 ? "max-w-5xl" : "max-w-3xl",
    contentHtml: `
      <div class="editorial-guide-modal-marker ${phaseId === 1 ? "editorial-research-dialog" : ""}">
        <div class="editorial-phase-tabs grid ${tabs.length === 2 ? "grid-cols-2" : "grid-cols-3"} rounded-xl border border-slate-200 bg-slate-50" role="tablist" aria-label="Subpasos de ${escapeHtml(phaseTitle)}">
          ${tabs.map((tab, index) => `
            <button type="button" role="tab" data-editorial-phase-tab="${escapeHtml(tab.id)}" data-tab-tone="${escapeHtml(tab.color || "teal")}" aria-selected="${index === 0 ? "true" : "false"}" class="editorial-phase-tab min-w-0 px-3 py-2 text-xs font-semibold transition-all ${index === 0 ? "is-active" : ""}">
              ${escapeHtml(tab.tabLabel)}
            </button>
          `).join("")}
        </div>
        <div data-editorial-phase-panel class="mt-4 min-h-[220px]" role="tabpanel"></div>
      </div>
    `
  });

  const buttons = Array.from(modal.element.querySelectorAll("[data-editorial-phase-tab]"));
  const panel = modal.element.querySelector("[data-editorial-phase-panel]");
  const renderSearchForm = () => {
    const session = getActiveSession();
    const currentTopic = session?.topic || session?.title || "";
    panel.innerHTML = `
      <form id="editorial-trend-search-form" class="research-setup-form" data-editorial-mode="${aidaMode ? "aida" : "marcie"}">
        <section class="research-setup-card" aria-labelledby="research-setup-heading">
          <header class="research-setup-header">
            <div class="research-setup-heading">
              <span class="research-mode-mark" aria-hidden="true">${EDITORIAL_GUIDE_STEP_DEFS[1].icon}</span>
              <div>
                <span class="research-eyebrow">${aidaMode ? "Modo Aida · Investigación verificada" : "Radar editorial · Investigación"}</span>
                <h3 id="research-setup-heading">${aidaMode ? "Define el alcance del tema" : "Define la búsqueda editorial"}</h3>
                <p>${aidaMode ? "Aida investigará el tema completo y añadirá ciencia o evolución histórica únicamente cuando sean pertinentes y comprobables." : "Consulta contexto, señales y fuentes recientes para construir el artículo."}</p>
              </div>
            </div>
            <div class="research-standard" aria-label="Estándar de investigación">
              <span><b>${aidaMode ? "8–12" : "6–12"}</b><small>fuentes</small></span>
              <span><b>${aidaMode ? "≥ 4" : "Varias"}</b><small>instituciones</small></span>
            </div>
          </header>

          <div class="research-setup-fields">
            <label class="research-field research-field--topic" for="editorial-trend-query">
              <span>Tema del artículo</span>
              <small>Escribe el asunto central; Aida no lo sustituirá por ciencia o historia.</small>
              <div class="research-input-wrap">
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path></svg>
                <input id="editorial-trend-query" name="topic" type="search" required value="${escapeHtml(currentTopic)}" placeholder="Ej. Cómo influye el sueño en el aprendizaje adolescente" autocomplete="off" />
              </div>
            </label>

            <label class="research-field" for="editorial-trend-country">
              <span>Región</span>
              <small>Contexto geográfico</small>
              <select id="editorial-trend-country" name="country">
                <option value="MX">México</option>
                <option value="LATAM">Latinoamérica</option>
                <option value="GLOBAL">Global</option>
              </select>
            </label>

            <label class="research-field" for="editorial-trend-period">
              <span>Vigencia</span>
              <small>Ventana para señales actuales</small>
              <select id="editorial-trend-period" name="period">
                <option value="today">Últimas 24 horas</option>
                <option value="1w">Últimos 7 días</option>
                <option value="1m">Último mes</option>
                <option value="2m">Últimos 2 meses</option>
                <option value="3m">Últimos 3 meses</option>
                <option value="6m" selected>Últimos 6 meses</option>
                <option value="1y">Último año</option>
              </select>
            </label>
          </div>

          <footer class="research-setup-footer">
            <div class="research-evidence-policy" aria-label="Criterios editoriales">
              <span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg>Tema completo</span>
              <span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg>Fuentes concretas</span>
              <span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg>Historia solo con evidencia</span>
            </div>
            <button id="editorial-run-trend-search" type="submit" class="research-run-button">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"></path></svg>
              <span>${aidaMode ? "Investigar con Aida" : "Iniciar investigación"}</span>
            </button>
          </footer>
        </section>
      </form>
    `;

    const form = panel.querySelector("#editorial-trend-search-form");
    const runButton = panel.querySelector("#editorial-run-trend-search");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const activeSession = getActiveSession();
      const formData = new FormData(form);
      const topic = String(formData.get("topic") || "").trim();
      if (!topic) {
        showToast("Escribe un tema para iniciar la búsqueda.", "warning");
        panel.querySelector("#editorial-trend-query")?.focus();
        return;
      }

      runButton.disabled = true;
      runButton.innerHTML = `
        <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <span>${aidaMode ? "Comprobando evidencia..." : "Analizando fuentes..."}</span>
      `;

      try {
        await runTrendSearchForSession({
          session: activeSession,
          topic,
          country: String(formData.get("country") || "MX"),
          period: String(formData.get("period") || "6m")
        });
        renderSessionList();
        renderActiveSession();
        showToast(aidaMode ? "Investigación Aida creada y comprobada." : "Señales y fuentes descubiertas con Gemini.", "success");
        activateTab("context");
      } catch (error) {
        console.error("[MarcieBlogEditor] Error en búsqueda de tendencias:", error);
        showToast(`No fue posible completar la búsqueda: ${error.message}`, "error");
        runButton.disabled = false;
        runButton.innerHTML = `
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <span>${aidaMode ? "Investigar con Aida" : "Iniciar investigación"}</span>
        `;
      }
    });
  };

  const renderTrendAnalysis = () => {
    const trend = getActiveSession()?.trends?.[0];
    const bindInitialAnalysisAction = () => {
      const analysisButton = panel.querySelector("[data-run-trend-analysis]");
      analysisButton?.addEventListener("click", async () => {
        const session = getActiveSession();
        const topic = session?.topic || session?.title || "";
        if (!session || !topic) {
          showToast("Define primero un tema para realizar el análisis.", "warning");
          activateTab("search");
          return;
        }

        analysisButton.disabled = true;
        analysisButton.innerHTML = `
          <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ${aidaMode ? "Investigando y analizando con Aida..." : "Analizando con Gemini..."}
        `;

        try {
          await runTrendSearchForSession({
            session,
            topic,
            country: session.researchRegion || "MX",
            period: session.researchPeriod || "6m"
          });
          renderSessionList();
          renderActiveSession();
          renderTrendAnalysis();
          showToast(aidaMode ? "Investigación Aida actualizada." : "Análisis editorial actualizado con Gemini.", "success");
        } catch (error) {
          console.error("[MarcieBlogEditor] Error al analizar tendencias:", error);
          showToast(`No fue posible completar el análisis: ${error.message}`, "error");
          analysisButton.disabled = false;
          analysisButton.textContent = aidaMode ? "Investigar y analizar con Aida" : "Realizar análisis con Gemini";
        }
      });
    };

    if (!trend) {
      panel.innerHTML = `
        <div class="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/75 to-white p-5 text-center shadow-sm">
          <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white">${EDITORIAL_GUIDE_STEP_DEFS[2].icon}</div>
          <h4 class="mt-3 text-sm font-semibold text-blue-900">Aún no hay resultados para analizar</h4>
          <p class="mt-1 text-xs text-slate-600">Puedes analizar directamente el tema de la sesión o configurar primero la búsqueda.</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" data-go-to-trend-search class="btn btn-outline h-9 px-4 text-xs">Configurar búsqueda</button>
            <button type="button" data-run-trend-analysis class="btn btn-primary h-9 px-4 text-xs flex items-center gap-1.5">
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19V9m5 10V5m5 14v-7m5 7V3"></path></svg>
              ${aidaMode ? "Investigar y analizar con Aida" : "Realizar análisis con Gemini"}
            </button>
          </div>
        </div>`;
      panel.querySelector("[data-go-to-trend-search]")?.addEventListener("click", () => activateTab("search"));
      bindInitialAnalysisAction();
      return;
    }

    const signals = Array.isArray(trend.signals) ? trend.signals : [];
    const milestones = Array.isArray(trend.historicalMilestones) ? trend.historicalMilestones : [];
    panel.innerHTML = `
      <div class="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/75 to-white p-5 shadow-sm">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div class="shrink-0 border-b border-blue-200 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${aidaMode ? "Fuentes verificadas" : "TrendScore"}</div>
            <div class="mt-1 text-4xl font-black leading-none text-teal-600">${escapeHtml(aidaMode ? trend.currentSourceCount ?? trend.verifiedSourceCount ?? trend.sources?.length ?? 0 : trend.trendScore || 0)}</div>
            <div class="mt-1 text-xs font-medium text-slate-500">${aidaMode ? `${escapeHtml(trend.institutionCount || 0)} instituciones` : "/ 100 puntos"}</div>
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-sm font-semibold text-blue-900">${aidaMode ? "Investigación integral y evidencia Aida" : "Análisis de tendencias y señales"}</h4>
            <p class="mt-2 text-xs font-medium leading-relaxed text-slate-700">${escapeHtml(trend.summary || "Análisis completado.")}</p>
            <div class="mt-3 flex flex-wrap gap-2 text-[10px]">
              ${aidaMode
                ? `<span class="research-verification-pill ${trend.verificationStatus === "verified" ? "is-verified" : "is-blocked"}">${trend.verificationStatus === "verified" ? "Evidencia completa" : "Evidencia bloqueada"}</span><span class="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">Ventana: ${escapeHtml(trend.dateWindow?.from?.slice(0, 10) || "—")}–${escapeHtml(trend.dateWindow?.to?.slice(0, 10) || "—")}</span><span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">${escapeHtml(milestones.length)} hitos respaldados</span>`
                : `<span class="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-purple-700">Crecimiento: ${escapeHtml(trend.growth || "N/D")}</span><span class="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Frescura: ${escapeHtml(trend.freshness || "N/D")}</span><span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Diversidad: ${escapeHtml(trend.sourceDiversity || "N/D")}</span>`}
            </div>
          </div>
        </div>
        ${signals.length ? `<div class="mt-4 border-t border-blue-200 pt-3"><p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Señales detectadas</p><div class="grid grid-cols-1 gap-2 sm:grid-cols-2">${signals.map((signal) => `<div class="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] font-medium leading-snug text-slate-600">${escapeHtml(signal)}</div>`).join("")}</div></div>` : ""}
        ${aidaMode && milestones.length ? `<div class="mt-4 border-t border-blue-200 pt-3"><p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Evolución respaldada</p><div class="space-y-2">${milestones.map((milestone) => `<div class="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600"><b class="text-slate-900">${escapeHtml(milestone.year || "Hito")}</b> · ${escapeHtml(milestone.personOrInstitution || "")} — ${escapeHtml(milestone.contribution || "")}</div>`).join("")}</div></div>` : ""}
        <div class="research-analysis-footer">
          <p>${trend.verificationStatus === "verified" ? "Investigación guardada. Continúa con la construcción del artículo." : "Puedes continuar con el borrador; la aprobación seguirá bloqueada hasta completar la evidencia."}</p>
          <button type="button" data-continue-editorial-production class="research-next-button">
            <span>Crear, redactar y analizar</span>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"></path></svg>
          </button>
        </div>
      </div>`;
    panel.querySelector("[data-continue-editorial-production]")?.addEventListener("click", () => {
      closeActiveModal();
      requestAnimationFrame(() => openEditorialPhaseModal(2));
    });
  };

  const audienceLabel = getEditorialAudienceLabel;

  const renderProposalWorkspace = () => {
    const session = getActiveSession();
    const storedProposals = Array.isArray(session?.proposals)
      ? session.proposals
      : Array.isArray(session?.proposals?.proposals)
        ? session.proposals.proposals
        : Array.isArray(session?.editorialProposals)
          ? session.editorialProposals
          : [];
    const articlesByAudience = { ...(session?.articlesByAudience || {}) };
    const activeAudience = session?.audience || session?.article?.audience || "educators";
    if (session?.article && (session.article.title || session.article.subtitle || session.article.blocks?.length)) {
      articlesByAudience[activeAudience] = session.article;
    }
    const proposalsByAudience = new Map();
    storedProposals.forEach((proposal, index) => {
      const audience = proposal?.audience || session?.selectedAudiences?.[index] || ARTICLE_EXPORT_AUDIENCES[index]?.id || `style-${index + 1}`;
      proposalsByAudience.set(audience, {
        ...proposal,
        audience,
        audienceLabel: proposal?.audienceLabel || audienceLabel(audience),
        hasArticle: Boolean(articlesByAudience[audience]?.blocks?.length),
        origin: "generated"
      });
    });
    Object.entries(articlesByAudience)
      .filter(([, article]) => article && (article.title || article.subtitle || article.blocks?.length))
      .forEach(([audience, article]) => {
        const existing = proposalsByAudience.get(audience);
        const dossier = session?.researchByAudience?.[audience] || {};
        proposalsByAudience.set(audience, {
          ...(existing || {}),
          audience,
          audienceLabel: existing?.audienceLabel || article.audienceLabel || audienceLabel(audience),
          title: existing?.title || article.title || session?.topic || "Artículo educativo",
          brief: existing?.brief || article.subtitle || "Estilo de redacción creado manualmente.",
          hasArticle: Boolean(article.blocks?.length),
          origin: existing?.origin || "manual",
          sourceIds: existing?.sourceIds || (dossier.sources || []).map((source) => String(source.id)),
          researchStatus: existing?.researchStatus || dossier.verificationStatus || "incomplete",
          verifiedSourceCount: Number(existing?.verifiedSourceCount ?? dossier.verifiedSourceCount ?? dossier.sources?.length ?? 0),
          targetSourceCount: Number(existing?.targetSourceCount ?? dossier.targetSourceCount ?? 6)
        });
      });
    const audienceOrder = [...new Set([...(session?.selectedAudiences || []), ...proposalsByAudience.keys()])];
    const proposals = audienceOrder.map((audience) => proposalsByAudience.get(audience)).filter(Boolean);
    panel.innerHTML = `
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/75 to-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 class="text-sm font-semibold text-purple-900">${aidaMode ? "Crear enfoques científicos Aida" : "Crear enfoques editoriales"}</h4>
            <p class="mt-1 text-xs leading-relaxed text-slate-600">${aidaMode ? "Cada público recibirá una escena, una idea central fiel al tema, una analogía dominante y fuentes concretas; ciencia e historia se usarán como respaldo pertinente." : "Gemini generará propuestas diferenciadas para docentes, estudiantes, familias y coordinadores académicos."}</p>
          </div>
          <button type="button" data-generate-proposals class="btn btn-primary h-9 shrink-0 px-4 text-xs flex items-center gap-1.5">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v18m9-9H3"></path></svg>
            ${proposals.length ? "Regenerar propuestas y artículos" : `Generar ${session?.selectedAudiences?.length || 4} propuestas`}
          </button>
        </div>
        <div data-proposals-result class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          ${proposals.length ? proposals.map((proposal, proposalIndex) => `
            <article class="flex min-h-[190px] flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-purple-400 hover:shadow-md">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="w-fit rounded-full bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-700">${escapeHtml(proposal.audienceLabel || audienceLabel(proposal.audience))}</span>
                ${proposal.hasArticle ? `<span class="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Artículo existente</span>` : ""}
                ${proposal.origin === "manual" ? `<span class="w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold text-slate-600">Creado manualmente</span>` : ""}
                <span class="w-fit rounded-full border ${Number(proposal.verifiedSourceCount || 0) >= Number(proposal.targetSourceCount || 6) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"} px-2 py-0.5 text-[9px] font-semibold">${Number(proposal.verifiedSourceCount || 0)}/${Number(proposal.targetSourceCount || 6)} fuentes verificadas</span>
              </div>
              <strong class="mt-3 text-sm leading-snug text-slate-900">${escapeHtml(proposal.title || "Propuesta editorial")}</strong>
              <span class="mt-2 flex-1 text-[11px] leading-relaxed text-slate-600">${escapeHtml(proposal.brief || "")}</span>
              ${(session?.researchByAudience?.[proposal.audience]?.sources || []).length ? `<details class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[10px]"><summary class="cursor-pointer font-semibold text-slate-700">Ver bibliografía de la propuesta</summary><ol class="mt-2 space-y-1.5">${session.researchByAudience[proposal.audience].sources.map((source) => `<li><a class="text-teal-700 hover:underline" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.apaCitation || source.title || "Fuente verificada")}</a></li>`).join("")}</ol></details>` : ""}
              ${aidaMode ? `<div class="mt-3 space-y-1.5 rounded-lg border border-purple-100 bg-purple-50/60 p-2.5 text-[10px] leading-relaxed text-purple-900"><p><b>Idea central:</b> ${escapeHtml(proposal.centralIdea || proposal.angle || "Pendiente")}</p><p><b>Analogía:</b> ${escapeHtml(proposal.dominantAnalogy || "Pendiente")}</p><p><b>Evidencia:</b> ${escapeHtml(proposal.sourceIds?.length || 0)} fuentes del dossier</p></div>` : ""}
              <div class="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <button type="button" data-regenerate-proposal="${proposalIndex}" class="inline-flex items-center gap-1.5 rounded-md border border-purple-200 px-2.5 py-1.5 text-[10px] font-semibold text-purple-700 transition hover:bg-purple-50">
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.6m15.3 2A8 8 0 004.6 9m0 0H9m11 11v-5h-.6m0 0A8 8 0 014.1 13m15.3 2H15"></path></svg>
                  Re-hacer
                </button>
                ${proposal.hasArticle ? `<button type="button" data-generate-proposal-image="${proposalIndex}" class="inline-flex items-center gap-1.5 rounded-md border border-sky-200 px-2.5 py-1.5 text-[10px] font-semibold text-sky-700 transition hover:bg-sky-50">
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></svg>
                  ${articlesByAudience[proposal.audience]?.featuredImage?.url ? "Regenerar imagen" : "Crear imagen"}
                </button>` : ""}
                <button type="button" data-select-proposal="${proposalIndex}" class="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2.5 py-1.5 text-[10px] font-semibold text-teal-700 transition hover:bg-teal-100">
                  ${proposal.hasArticle ? "Abrir" : "Redactar"}
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"></path></svg>
                </button>
              </div>
            </article>
          `).join("") : `
            <div class="col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
              <p class="text-xs font-medium text-slate-600">Todavía no hay propuestas generadas para esta sesión.</p>
            </div>
          `}
        </div>
      </div>`;

    panel.querySelector("[data-generate-proposals]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const activeSession = getActiveSession();
      if (!activeSession) return;
      button.disabled = true;
      button.innerHTML = `<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Creando enfoques...`;
      try {
        const response = await generateProposalsForMode({
          session: activeSession,
          topic: activeSession.topic || activeSession.title,
          signals: activeSession.trends?.[0]?.signals || [],
          onResearchProgress: async ({ proposal, index, total }) => {
            button.innerHTML = `<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Verificando fuentes ${index + 1}/${total}: ${audienceLabel(proposal.audience)}...`;
            await saveMarcieSession(activeSession);
          }
        });
        const requiredCount = activeSession.selectedAudiences?.length || 4;
        const nextProposals = Array.isArray(response?.proposals) ? response.proposals.slice(0, requiredCount) : [];
        if (nextProposals.length < requiredCount) throw new Error("Gemini no devolvió un enfoque para cada público seleccionado.");
        activeSession.proposals = nextProposals;
        activeSession.researchByAudience = response.researchByAudience || activeSession.researchByAudience || {};
        await saveMarcieSession(activeSession);

        const previousArticles = activeSession.articlesByAudience || {};
        const regeneratedArticles = {};
        for (let index = 0; index < nextProposals.length; index += 1) {
          const proposal = nextProposals[index];
          const audience = proposal.audience || ARTICLE_EXPORT_AUDIENCES[index]?.id || "educators";
          button.innerHTML = `<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Redactando ${index + 1}/${requiredCount}...`;
          const generated = await draftArticleForMode({
            session: activeSession,
            title: proposal.title || activeSession.topic || activeSession.title,
            topic: activeSession.topic || proposal.title || activeSession.title,
            audience,
            brief: proposal.brief || proposal.angle || ""
          });
          const previousArticle = previousArticles[audience] || {};
          const nextArticle = {
            ...generated,
            sources: generated.sources || previousArticle.sources || activeSession.trends?.[0]?.sources || [],
            supplementarySources: Array.isArray(previousArticle.supplementarySources)
              ? previousArticle.supplementarySources
              : (Array.isArray(generated.supplementarySources) ? generated.supplementarySources : [])
          };
          ["featuredImage", "templateId", "appearance", "sourceCitationStyle"].forEach((field) => {
            if (previousArticle[field] !== undefined) nextArticle[field] = previousArticle[field];
            if (nextArticle[field] === undefined) delete nextArticle[field];
          });
          regeneratedArticles[audience] = nextArticle;
        }

        const activeAudience = regeneratedArticles[activeSession.audience]
          ? activeSession.audience
          : (nextProposals[0]?.audience || "educators");
        activeSession.proposals = nextProposals;
        activeSession.articlesByAudience = { ...previousArticles, ...regeneratedArticles };
        activeSession.audience = activeAudience;
        activeSession.article = regeneratedArticles[activeAudience];
        activeSession.selectedProposal = nextProposals.find((proposal) => proposal.audience === activeAudience) || nextProposals[0];
        activeSession.title = activeSession.article?.title || activeSession.selectedProposal?.title || activeSession.title;
        activeSession.status = "review_required";
        delete activeSession.audit;
        delete activeSession.auditsByAudience;
        await saveMarcieSession(activeSession);
        renderSessionList();
        renderActiveSession();
        renderProposalWorkspace();
        showToast(`${requiredCount} enfoques y artículos fueron regenerados.`, "success");
      } catch (error) {
        console.error("[MarcieBlogEditor] Error regenerando propuestas y artículos:", error);
        showToast(`No fue posible regenerar los artículos: ${error.message}`, "error");
        button.disabled = false;
        button.textContent = proposals.length ? "Regenerar propuestas y artículos" : "Generar 4 propuestas";
      }
    });

    panel.querySelectorAll("[data-select-proposal]").forEach((card) => {
      card.addEventListener("click", async () => {
        const activeSession = getActiveSession();
        const selected = proposals[Number(card.getAttribute("data-select-proposal"))];
        if (!activeSession || !selected) return;
        activeSession.audience = selected.audience || "educators";
        activeSession.selectedProposal = selected;
        const existingArticle = activeSession.articlesByAudience?.[activeSession.audience] ||
          (activeSession.article?.audience === activeSession.audience ? activeSession.article : null);
        if (selected.hasArticle && existingArticle) {
          activeSession.article = existingArticle;
          if (existingArticle.title) activeSession.title = existingArticle.title;
          activeSession.status = "review_required";
        }
        await saveMarcieSession(activeSession);
        if (selected.hasArticle && existingArticle) {
          appState.currentTab = "article";
          closeActiveModal();
          renderSessionList();
          renderActiveSession();
          showToast(`Artículo existente abierto para ${audienceLabel(activeSession.audience)}.`, "success");
        } else {
          activateTab("draft");
        }
      });
    });

    panel.querySelectorAll("[data-generate-proposal-image]").forEach((button) => {
      button.addEventListener("click", async () => {
        const activeSession = getActiveSession();
        const proposal = proposals[Number(button.getAttribute("data-generate-proposal-image"))];
        const audience = proposal?.audience || "educators";
        const targetArticle = activeSession?.articlesByAudience?.[audience];
        if (!activeSession || !targetArticle?.blocks?.length || appState.generatingImageSessionId) return;
        const originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M12 2a10 10 0 0110 10"></path></svg> Creando...`;
        appState.generatingImageSessionId = activeSession.id;
        setSyncStatus(`Generando portada para ${audienceLabel(audience)}...`);
        try {
          targetArticle.featuredImage = await generateArticleImageWithGemini({
            article: targetArticle,
            sessionId: activeSession.id,
            approachId: audience,
            approachLabel: audienceLabel(audience)
          });
          activeSession.articlesByAudience[audience] = targetArticle;
          if ((activeSession.audience || activeSession.article?.audience) === audience) activeSession.article = targetArticle;
          await saveMarcieSession(activeSession);
          setSyncStatus("🟢 Sincronizado con Firebase");
          renderActiveSession();
          renderProposalWorkspace();
          showToast(`Portada creada para ${audienceLabel(audience)}.`, "success");
        } catch (error) {
          console.error(`[MarcieBlogEditor] Error al generar portada para ${audience}:`, error);
          setSyncStatus("⚠️ Error al generar la portada", true);
          showToast(`No se pudo generar la portada de ${audienceLabel(audience)}: ${error.message}`, "error");
          button.disabled = false;
          button.innerHTML = originalHtml;
        } finally {
          appState.generatingImageSessionId = null;
        }
      });
    });

    panel.querySelectorAll("[data-regenerate-proposal]").forEach((button) => {
      button.addEventListener("click", async () => {
        const activeSession = getActiveSession();
        const proposal = proposals[Number(button.getAttribute("data-regenerate-proposal"))];
        if (!activeSession || !proposal) return;

        const audience = proposal.audience || "educators";
        const originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M12 2a10 10 0 0110 10"></path></svg> Re-haciendo...`;

        try {
          const generated = await draftArticleForMode({
            session: activeSession,
            title: proposal.title || activeSession.topic || activeSession.title,
            topic: activeSession.topic || activeSession.title,
            audience,
            brief: proposal.brief || ""
          });
          if (!activeSession.articlesByAudience) activeSession.articlesByAudience = {};
          activeSession.articlesByAudience[audience] = generated;
          activeSession.audience = audience;
          activeSession.article = generated;
          activeSession.selectedProposal = proposal;
          if (generated.title) activeSession.title = generated.title;
          activeSession.status = "review_required";
          delete activeSession.audit;
          await saveMarcieSession(activeSession);
          appState.currentTab = "article";
          closeActiveModal();
          renderSessionList();
          renderActiveSession();
          showToast(`Artículo re-hecho para ${audienceLabel(audience)}.`, "success");
        } catch (error) {
          console.error("[MarcieBlogEditor] Error rehaciendo enfoque:", error);
          showToast(`No fue posible re-hacer el enfoque: ${error.message}`, "error");
          button.disabled = false;
          button.innerHTML = originalHtml;
        }
      });
    });
  };

  const renderDraftWorkspace = () => {
    const session = getActiveSession();
    const aidaMode = sessionUsesAida(session || {});
    const selected = session?.selectedProposal || session?.proposals?.find((proposal) => proposal.audience === session?.audience) || null;
    const selectedAudience = selected?.audience || session?.audience || "educators";
    panel.innerHTML = `
      <div class="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/75 to-white p-5 shadow-sm">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">${EDITORIAL_PHASE_TABS[2][1].icon}</div>
          <div class="min-w-0 flex-1">
            <h4 class="text-sm font-semibold text-blue-900">${aidaMode ? "Redactar artículo con el motor Aida" : "Redactar artículo con Gemini"}</h4>
            <p class="mt-1 text-xs text-slate-600">${aidaMode ? "Desarrolla las ocho fases desde el dossier científico verificado, con una idea central y una analogía dominante." : "Selecciona la audiencia y genera el artículo completo desde la propuesta elegida."}</p>
          </div>
        </div>
        <div class="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label for="production-audience" class="mb-1.5 block text-xs font-semibold text-slate-700">Audiencia</label>
            <select id="production-audience" class="input-field h-9 w-full text-xs">
              ${ARTICLE_EXPORT_AUDIENCES.filter((item) => session?.selectedAudiences?.includes(item.id) || item.id === selectedAudience).map((item) => `<option value="${escapeHtml(item.id)}" ${selectedAudience === item.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
            </select>
          </div>
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Propuesta seleccionada</span>
            <h5 data-draft-title class="mt-1.5 text-sm font-semibold leading-snug text-slate-900">${escapeHtml(selected?.title || session?.topic || session?.title || "Artículo educativo")}</h5>
            <p data-draft-brief class="mt-1.5 text-[11px] leading-relaxed text-slate-600">${escapeHtml(selected?.brief || "Desarrollar un artículo educativo claro, útil y respaldado por las señales investigadas.")}</p>
          </div>
          <div class="flex justify-end">
            <button type="button" data-generate-article class="btn btn-primary h-9 px-4 text-xs flex items-center gap-1.5">
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4Z"></path></svg>
              Redactar artículo
            </button>
          </div>
        </div>
      </div>`;

    const audienceSelect = panel.querySelector("#production-audience");
    audienceSelect?.addEventListener("change", () => {
      const activeSession = getActiveSession();
      const proposal = activeSession?.proposals?.find((item) => item.audience === audienceSelect.value);
      activeSession.audience = audienceSelect.value;
      activeSession.selectedProposal = proposal || null;
      panel.querySelector("[data-draft-title]").textContent = proposal?.title || activeSession.topic || activeSession.title;
      panel.querySelector("[data-draft-brief]").textContent = proposal?.brief || "Desarrollar un artículo educativo claro, útil y respaldado por las señales investigadas.";
    });

    panel.querySelector("[data-generate-article]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const activeSession = getActiveSession();
      if (!activeSession) return;
      const audience = audienceSelect?.value || "educators";
      const proposal = activeSession.proposals?.find((item) => item.audience === audience) || activeSession.selectedProposal;
      button.disabled = true;
      button.textContent = "Abriendo Asistente Editorial...";
      try {
        activeSession.audience = audience;
        if (!activeSession.articlesByAudience) activeSession.articlesByAudience = {};
        const existingArticle = activeSession.articlesByAudience[audience];
        const articleTitle = proposal?.title || existingArticle?.title || activeSession.topic || activeSession.title || "Artículo educativo";
        const articleBrief = proposal?.brief || existingArticle?.subtitle || "Desarrollar un artículo educativo claro, útil y respaldado por fuentes confiables.";

        if (sessionUsesAida(activeSession)) {
          button.textContent = "Redactando las ocho fases Aida...";
          const generated = await draftArticleForMode({
            session: activeSession,
            title: articleTitle,
            topic: activeSession.topic || articleTitle,
            audience,
            brief: articleBrief
          });
          activeSession.selectedProposal = proposal || activeSession.selectedProposal || null;
          activeSession.article = generated;
          activeSession.articlesByAudience[audience] = generated;
          activeSession.title = generated.title || articleTitle;
          activeSession.status = "review_required";
          activeSession.approvedAudiences = (activeSession.approvedAudiences || []).filter((item) => item !== audience);
          delete activeSession.audit;
          await saveMarcieSession(activeSession);
          appState.currentTab = "article";
          closeActiveModal();
          renderSessionList();
          renderActiveSession();
          showToast("Artículo redactado con las ocho fases Aida.", "success");
          return;
        }

        activeSession.selectedProposal = proposal || activeSession.selectedProposal || null;
        activeSession.article = existingArticle || {
          schemaVersion: "1.0",
          title: articleTitle,
          subtitle: articleBrief,
          excerpt: articleBrief,
          audience,
          category: "Educación",
          readingTimeMinutes: 6,
          tags: ["Educación"],
          blocks: [{ id: "b1", type: "paragraph", text: articleBrief }],
          sources: activeSession.trends?.[0]?.sources || [],
          seo: {}
        };
        activeSession.articlesByAudience[audience] = activeSession.article;
        activeSession.title = activeSession.article.title || articleTitle;
        activeSession.status = "drafting";
        await saveMarcieSession(activeSession);
        appState.currentTab = "article";
        closeActiveModal();
        renderSessionList();
        renderActiveSession();
        openAiAssistantModal({
          getActiveSession,
          onRefresh: () => {
            renderSessionList();
            renderActiveSession();
          },
          initialPrompt: existingArticle
            ? "Edita y mejora el artículo completo manteniendo su enfoque editorial, audiencia y fuentes."
            : `Redacta el artículo completo a partir de este enfoque para ${audienceLabel(audience)}: ${articleBrief}`
        });
      } catch (error) {
        console.error("[MarcieBlogEditor] Error abriendo el Asistente Editorial:", error);
        showToast(`No fue posible abrir el Asistente Editorial: ${error.message}`, "error");
        button.disabled = false;
        button.textContent = "Redactar artículo";
      }
    });
  };

  const renderAuditWorkspace = () => {
    const session = getActiveSession();
    const hasArticle = Boolean(session?.article?.blocks?.length);
    const aidaMode = sessionUsesAida(session || {});
    const legacyAidaArticle = aidaMode && hasArticle && !isAidaArticleCompatible(session.article);
    const audit = session?.audit;
    const allIssues = Array.isArray(audit?.issues) ? audit.issues : [];
    const correctionHistory = Array.isArray(session?.correctionHistory) ? session.correctionHistory : [];
    const resolvedIssueKeys = new Set(Array.isArray(audit?.resolvedIssueKeys) ? audit.resolvedIssueKeys.map(String) : []);
    const getIssueKey = (issue, index) => String(
      issue?.id || issue?.issueId || issue?.key || issue?.type || issue?.message ||
      issue?.title || issue?.finding || issue?.suggestion || `hallazgo-${index}`
    );
    const issues = allIssues.filter((issue, index) => !resolvedIssueKeys.has(getIssueKey(issue, index)));
    const auditReady = Boolean(audit && issues.length === 0);
    panel.innerHTML = `
      <div class="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/75 to-white p-5 shadow-sm">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 class="text-sm font-semibold text-amber-900">${aidaMode ? "Auditoría editorial y factual Aida" : "Auditoría y revisión editorial"}</h4>
            <p class="mt-1 text-xs text-slate-600">${aidaMode ? "Comprueba las ocho fases, la idea central, la analogía, la evidencia, la cronología y el cierre de marca." : "Analiza claridad, estructura, tono pedagógico y oportunidades de mejora."}</p>
          </div>
          <button type="button" data-run-article-audit ${hasArticle ? "" : "disabled"} class="btn btn-primary h-9 shrink-0 px-4 text-xs flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.6-8A12 12 0 0112 3a12 12 0 01-8.6 3A12 12 0 003 9c0 5.6 3.8 10.3 9 11.6 5.2-1.3 9-6 9-11.6 0-1-.1-2-.4-3Z"></path></svg>
            ${audit ? "Reanalizar artículo" : "Analizar artículo"}
          </button>
        </div>
        ${legacyAidaArticle ? `<div class="mt-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><b class="text-xs text-rose-900">Artículo heredado incompatible con Aida</b><p class="mt-1 text-[11px] text-rose-700">Se conservará, pero no puede aprobarse ni publicarse hasta convertirlo a las ocho fases.</p></div><button type="button" data-correct-legacy-aida class="btn btn-primary h-9 shrink-0 px-4 text-xs">Corregir a Aida</button></div>` : ""}
        ${!hasArticle ? `<div class="mt-4 rounded-lg border border-dashed border-amber-300 bg-white/70 p-5 text-center"><p class="text-xs text-slate-600">Primero redacta un artículo para poder analizarlo.</p><button type="button" data-go-to-draft class="btn btn-outline mt-3 h-8 px-3 text-xs">Ir a redactar</button></div>` : ""}
        ${audit ? `
          <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
            <div class="rounded-xl border border-slate-200 bg-white p-4">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Puntaje editorial</span>
              <div class="mt-2 text-4xl font-black leading-none ${auditReady ? "text-emerald-600" : "text-slate-900"}">${escapeHtml(audit.readabilityScore || (auditReady ? 98 : 92))}</div>
              <p class="mt-3 text-[11px] leading-relaxed text-slate-600">${escapeHtml(auditReady ? "No hay hallazgos pendientes. El artículo está listo para publicar." : audit.summary || "Auditoría completada.")}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-4">
              <h5 class="text-xs font-semibold text-slate-900">Hallazgos y sugerencias</h5>
              <div class="mt-3 grid max-h-[260px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                ${issues.length ? issues.map((issue, issueIndex) => `<div class="flex flex-col rounded-lg border border-slate-200 bg-slate-50 p-3"><strong class="text-[11px] text-slate-900">${escapeHtml(issue.message || issue.title || issue.finding || "Hallazgo editorial")}</strong><p class="mt-1 text-[10px] leading-relaxed text-slate-600">${escapeHtml(issue.suggestion || issue.description || issue.recommendation || "Revisar este punto.")}</p><div class="mt-3 border-t border-slate-200 pt-2"><button type="button" data-fix-audit-issue="${issueIndex}" class="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-slate-800"><svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12l4 4L19 7"></path></svg>Corregir</button></div></div>`).join("") : `<div class="col-span-full rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center"><svg class="mx-auto h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><p class="mt-2 text-xs font-semibold text-emerald-800">No quedan hallazgos por corregir</p><p class="mt-1 text-[10px] text-emerald-700">El artículo está listo para publicación.</p></div>`}
              </div>
            </div>
          </div>` : ""}
        ${correctionHistory.length ? `
          <section class="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0Z"></path></svg>
                </span>
                <div>
                  <h5 class="text-xs font-semibold text-slate-900">Historial de correcciones</h5>
                  <p class="text-[10px] text-slate-500">Cambios aplicados con el Asistente Editorial</p>
                </div>
              </div>
              <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">${correctionHistory.length} ${correctionHistory.length === 1 ? "corrección" : "correcciones"}</span>
            </div>
            <div class="mt-3 flex max-h-[240px] flex-col divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
              ${correctionHistory.slice(0, 20).map((entry) => `
                <article class="flex items-start gap-3 py-3 first:pt-3">
                  <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.25" d="m5 12 4 4L19 7"></path></svg>
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <strong class="text-[11px] text-slate-900">${escapeHtml(entry.issue || "Hallazgo editorial corregido")}</strong>
                      <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-600">${escapeHtml(entry.audienceLabel || audienceLabel(entry.audience))}</span>
                    </div>
                    <p class="mt-1 text-[10px] leading-relaxed text-slate-600">${escapeHtml(entry.recommendation || "Mejora aplicada al artículo.")}</p>
                    <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-400">
                      <span>${escapeHtml(entry.articleTitle || "Artículo")}</span>
                      <time datetime="${escapeHtml(entry.createdAt || "")}">${entry.createdAt ? escapeHtml(new Date(entry.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })) : "Fecha no disponible"}</time>
                    </div>
                  </div>
                </article>
              `).join("")}
            </div>
          </section>` : ""}
      </div>`;

    panel.querySelector("[data-correct-legacy-aida]")?.addEventListener("click", async (event) => {
      const activeSession = getActiveSession();
      if (!activeSession?.article) return;
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Convirtiendo a Aida...";
      try {
        const audience = activeSession.article.audience || activeSession.audience || "parents";
        const corrected = await draftArticleForMode({
          session: activeSession,
          title: activeSession.article.title || activeSession.title,
          topic: activeSession.topic || activeSession.title,
          audience,
          brief: "Convierte el contenido heredado a las ocho fases Aida. Conserva únicamente hechos y fuentes que puedan verificarse."
        });
        activeSession.article = corrected;
        activeSession.articlesByAudience = { ...(activeSession.articlesByAudience || {}), [audience]: corrected };
        activeSession.audit = await runSessionReview(activeSession, corrected, audience);
        activeSession.status = "review_required";
        activeSession.approvedAudiences = (activeSession.approvedAudiences || []).filter((item) => item !== audience);
        await saveMarcieSession(activeSession);
        renderSessionList();
        renderActiveSession();
        renderAuditWorkspace();
        showToast("El artículo fue convertido y revisado con el motor Aida.", "success");
      } catch (error) {
        showToast(`No fue posible convertir el artículo: ${error.message}`, "error");
        button.disabled = false;
        button.textContent = "Corregir a Aida";
      }
    });

    panel.querySelector("[data-go-to-draft]")?.addEventListener("click", () => activateTab("draft"));
    panel.querySelectorAll("[data-fix-audit-issue]").forEach((button) => {
      button.addEventListener("click", async () => {
        const activeSession = getActiveSession();
        const issueIndex = Number(button.getAttribute("data-fix-audit-issue"));
        const issue = issues[issueIndex];
        if (!activeSession?.article || !issue) return;

        const issueKey = getIssueKey(issue, issueIndex);
        const recommendation = issue.suggestion || issue.recommendation || issue.description || "Mejorar este punto editorial.";
        const originalHtml = button.innerHTML;
        const originalClassName = button.className;
        button.disabled = true;
        button.dataset.fixStatus = "fixing";
        button.className = "inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-700";
        button.innerHTML = `<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M12 2a10 10 0 0110 10"></path></svg> Corrigiendo...`;

        try {
          const audience = activeSession.article?.audience || activeSession.audience || "educators";
          const correctedArticle = await draftArticleForMode({
            session: activeSession,
            title: activeSession.article.title || activeSession.title,
            topic: activeSession.topic || activeSession.title,
            audience,
            brief: `Corrige el artículo manteniendo su estructura, enfoque, tono y fuentes.\n\nHallazgo: ${issue.message || issue.title || issue.finding || "Hallazgo editorial"}\nSugerencia: ${recommendation}`
          });
          activeSession.article = correctedArticle;
          if (!activeSession.articlesByAudience) activeSession.articlesByAudience = {};
          activeSession.articlesByAudience[audience] = correctedArticle;
          if (correctedArticle.title) activeSession.title = correctedArticle.title;
          activeSession.status = "review_required";

          const refreshedAudit = await runSessionReview(activeSession, correctedArticle, correctedArticle.audience || activeSession.audience);
          refreshedAudit.resolvedIssueKeys = [...resolvedIssueKeys, issueKey];
          activeSession.audit = refreshedAudit;
          const correctionEntry = {
            id: `correction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date().toISOString(),
            status: "corrected",
            issueKey,
            issue: issue.message || issue.title || issue.finding || "Hallazgo editorial",
            recommendation,
            audience,
            audienceLabel: audienceLabel(audience),
            articleTitle: correctedArticle.title || activeSession.title || "Artículo"
          };
          activeSession.correctionHistory = [
            correctionEntry,
            ...(Array.isArray(activeSession.correctionHistory) ? activeSession.correctionHistory : [])
          ].slice(0, 100);
          await saveMarcieSession(activeSession);
          button.dataset.fixStatus = "fixed";
          button.className = "inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-600 px-2.5 py-1.5 text-[10px] font-semibold text-white";
          button.innerHTML = `<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m5 12 4 4L19 7"></path></svg> Corregido`;
          await new Promise((resolve) => setTimeout(resolve, 700));
          renderSessionList();
          renderActiveSession();
          renderAuditWorkspace();
          showToast("Hallazgo corregido y artículo analizado nuevamente.", "success");
        } catch (error) {
          console.error("[MarcieBlogEditor] Error corrigiendo hallazgo:", error);
          showToast(`No fue posible aplicar la corrección: ${error.message}`, "error");
          button.disabled = false;
          button.dataset.fixStatus = "idle";
          button.className = originalClassName;
          button.innerHTML = originalHtml;
        }
      });
    });
    panel.querySelector("[data-run-article-audit]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const activeSession = getActiveSession();
      if (!activeSession?.article?.blocks?.length) return;
      button.disabled = true;
      button.innerHTML = `<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Analizando artículo...`;
      try {
        activeSession.audit = await runSessionReview(activeSession, activeSession.article, activeSession.audience);
        await saveMarcieSession(activeSession);
        renderSessionList();
        renderActiveSession();
        renderAuditWorkspace();
        showToast("Auditoría editorial completada y guardada.", "success");
      } catch (error) {
        console.error("[MarcieBlogEditor] Error auditando artículo:", error);
        showToast(`No fue posible analizar el artículo: ${error.message}`, "error");
        button.disabled = false;
        button.textContent = "Analizar artículo";
      }
    });
  };

  const activateTab = (tabId) => {
    const tab = tabs.find((item) => item.id === tabId) || tabs[0];
    const colors = EDITORIAL_GUIDE_COLOR_MAP[tab.color] || EDITORIAL_GUIDE_COLOR_MAP.teal;
    buttons.forEach((button) => {
      const active = button.getAttribute("data-editorial-phase-tab") === tab.id;
      button.setAttribute("aria-selected", String(active));
      button.classList.toggle("is-active", active);
    });
    if (!panel) return;
    if (phaseId === 1 && tab.id === "search") {
      renderSearchForm();
      return;
    }
    if (phaseId === 1 && tab.id === "context") {
      renderTrendAnalysis();
      return;
    }
    if (phaseId === 2 && tab.id === "proposals") {
      renderProposalWorkspace();
      return;
    }
    if (phaseId === 2 && tab.id === "draft") {
      renderDraftWorkspace();
      return;
    }
    if (phaseId === 2 && tab.id === "audit") {
      renderAuditWorkspace();
      return;
    }
    panel.innerHTML = `
      <div class="rounded-xl border ${colors.border} ${colors.bg} p-5 shadow-sm">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-full ${colors.iconBg} text-white flex items-center justify-center shrink-0 shadow-sm">${tab.icon}</div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="text-sm font-semibold ${colors.title}">${escapeHtml(tab.title)}</h4>
              <span class="rounded-full px-2 py-0.5 text-[10px] font-bold ${colors.badge}">${escapeHtml(tab.badge)}</span>
            </div>
            <p class="mt-2 text-xs leading-relaxed text-slate-600">${escapeHtml(tab.desc)}</p>
          </div>
        </div>
        <div class="mt-4 border-t ${colors.border} pt-3">
          <p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Qué incluye</p>
          <ul class="flex flex-col gap-1.5">
            ${tab.tips.map((tip) => `<li class="flex items-start gap-2 text-[11px] font-medium text-slate-600"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}"></span>${escapeHtml(tip)}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  };

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => activateTab(button.getAttribute("data-editorial-phase-tab")));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = buttons[(index + direction + buttons.length) % buttons.length];
      next.focus();
      activateTab(next.getAttribute("data-editorial-phase-tab"));
    });
  });
  activateTab(tabs[0].id);
}

const EDITORIAL_GUIDE_COLOR_MAP = {
  teal:   { bg: "bg-gradient-to-br from-teal-50/75 to-white",   border: "border-teal-200",   title: "text-teal-900",  badge: "bg-teal-100 text-teal-700", dot: "bg-teal-400", iconBg: "bg-teal-500", titleBar: "bg-teal-50 border-teal-100" },
  blue:   { bg: "bg-gradient-to-br from-blue-50/75 to-white",   border: "border-blue-200",   title: "text-blue-900",   badge: "bg-blue-100 text-blue-700",  dot: "bg-blue-400",  iconBg: "bg-blue-500",   titleBar: "bg-blue-50 border-blue-100" },
  purple: { bg: "bg-gradient-to-br from-purple-50/75 to-white", border: "border-purple-200", title: "text-purple-900", badge: "bg-purple-100 text-purple-700", dot: "bg-purple-400", iconBg: "bg-purple-500", titleBar: "bg-purple-50 border-purple-100" },
  amber:  { bg: "bg-gradient-to-br from-amber-50/75 to-white",  border: "border-amber-200",  title: "text-amber-900",  badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-400",  iconBg: "bg-amber-500",  titleBar: "bg-amber-50 border-amber-100" },
  rose:   { bg: "bg-gradient-to-br from-rose-50/75 to-white",   border: "border-rose-200",   title: "text-rose-900",   badge: "bg-rose-100 text-rose-700",  dot: "bg-rose-400",  iconBg: "bg-rose-500",   titleBar: "bg-rose-50 border-rose-100" },
};

function renderEditorialGuideInArticleBody() {
  if (!dom.articleBodyContainer || !dom.editorialGuideShell || !dom.editorialGuideView) return;
  const session = getActiveSession();

  dom.editorialGuideShell.innerHTML = `
    <div class="flex flex-col gap-6">
      <p class="text-xs text-slate-500 leading-relaxed">
        El flujo editorial se completa en <strong class="text-slate-700">3 etapas</strong>. Selecciona cada etapa para ver qué hace y cómo usarla.
      </p>

      <div class="relative">
        <div class="absolute top-5 left-0 right-0 h-[2px] bg-slate-200 z-0 mx-[10%]"></div>
        <div class="article-guide-progress-line absolute top-5 left-[10%] h-[2px] bg-gradient-to-r from-teal-400 to-purple-500 z-0 transition-all duration-500" style="width:0%"></div>

        <div class="relative z-10 flex justify-between px-[6%]">
          ${[1,2,3].map((n) => {
            const def = getEditorialMergedStepDef(n, session);
            return `
              <button type="button" data-article-guide-step="${n}" class="article-guide-step-btn guide-step-btn flex flex-col items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-4 rounded-lg" title="Abrir ${escapeHtml(def.title)}" aria-label="Abrir ${escapeHtml(def.title)}">
                <div class="w-10 h-10 rounded-full ${def.circleClass} text-white flex items-center justify-center shadow-md ring-4 ring-white transition-all duration-200">
                  ${def.icon}
                </div>
                <span class="text-[10px] font-semibold text-slate-500 group-hover:text-slate-800 transition-colors whitespace-nowrap">${def.label}</span>
                <span class="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold text-slate-400 shadow-xs transition-colors group-hover:border-slate-300 group-hover:text-slate-700">Abrir</span>
              </button>
            `;
          }).join("")}
        </div>
      </div>

      <div class="article-guide-step-detail min-h-[132px] rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 transition-all duration-300 shadow-sm"></div>

      <p class="text-xs text-slate-400 text-center">Puedes editar el texto final del artículo directamente desde la vista central una vez generado.</p>
    </div>
  `;

  const shell = dom.editorialGuideShell;
  const detail = shell.querySelector(".article-guide-step-detail");
  const progress = shell.querySelector(".article-guide-progress-line");
  const btns = shell.querySelectorAll(".article-guide-step-btn");
  if (!detail || !progress || btns.length === 0) return;

  const progressMap = { 1: "0%", 2: "50%", 3: "98%" };

  const activateStep = (n) => {
    const data = getEditorialMergedStepDef(n, getActiveSession());
    const c = EDITORIAL_GUIDE_COLOR_MAP[data.color];
    btns.forEach((btn) => btn.setAttribute("data-active", btn.getAttribute("data-article-guide-step") === String(n) ? "true" : "false"));
    progress.style.width = progressMap[n] || "0%";

    detail.className = `article-guide-step-detail min-h-[132px] rounded-xl border ${c.border} ${c.bg} bg-gradient-to-br from-slate-50/80 to-white p-5 transition-all duration-300 shadow-sm`;
    detail.innerHTML = `
      <div class="rounded-xl border ${c.titleBar} px-4 py-3 mb-3">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-full ${c.iconBg} text-white flex items-center justify-center shrink-0 border border-white shadow-sm">
            ${data.icon}
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-semibold text-sm ${c.title}">${data.title}</h4>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${c.badge}">${data.badge}</span>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed mt-1.5">${data.desc}</p>
          </div>
        </div>
      </div>
      <div class="border-t ${c.border} pt-3 mt-1">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Consejos</p>
        <ul class="flex flex-col gap-1.5">
          ${data.tips.map((tip) => `
            <li class="flex items-start gap-2 text-[11px] text-slate-600 font-medium">
              <span class="w-1.5 h-1.5 rounded-full ${c.dot} mt-1.5 shrink-0"></span>
              ${tip}
            </li>
          `).join("")}
        </ul>
      </div>
    `;
  };

  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = parseInt(btn.getAttribute("data-article-guide-step"), 10);
      activateStep(step);
      if (step === 1 || step === 2) {
        openEditorialPhaseModal(step);
        return;
      }
      if (step === 3) {
        const exportButton = document.getElementById("opt-export-html");
        if (exportButton) exportButton.click();
        else showToast("El módulo de exportación aún no está disponible.", "warning");
      }
    });
  });

  activateStep(1);
}

function setEditorialHeaderStateForSession(session, hasGuideInBody) {
  if (!dom.articleTitle || !dom.articleSubtitle || !dom.articleView) return;

  if (hasGuideInBody) {
    dom.articleTitle.removeAttribute("id");
    dom.articleSubtitle.removeAttribute("id");
  } else {
    dom.articleTitle.setAttribute("id", ARTICLE_TITLE_ID);
    dom.articleSubtitle.setAttribute("id", ARTICLE_SUBTITLE_ID);
  }

  const articleMetaRow = dom.articleView.querySelector("[data-article-meta-row]");
  const articleDivider = dom.articleView.querySelector("[data-article-divider]");
  const articleSources = dom.articleView.querySelector("[data-article-sources]");

  setNodeHidden(dom.articleTitle, hasGuideInBody);
  setNodeHidden(dom.articleSubtitle, hasGuideInBody);

  if (articleMetaRow) {
    setNodeHidden(articleMetaRow, hasGuideInBody);
    if (!hasGuideInBody) {
      articleMetaRow.className = "";
      articleMetaRow.classList.add(...ARTICLE_META_ROW_CLASS.split(" "));
    }
  }

  if (articleDivider) {
    setNodeHidden(articleDivider, hasGuideInBody);
  }

  if (articleSources) {
    setNodeHidden(articleSources, hasGuideInBody);
  }

  const centerSubheader = dom.centerSubheader;
  const btnToggleSubheader = document.getElementById("btn-toggle-subheader");

  if (centerSubheader) {
    centerSubheader.style.overflow = "hidden";
    centerSubheader.style.transition = "max-height 0.25s ease, padding 0.25s ease, border 0.25s ease";

    if (hasGuideInBody) {
      centerSubheader.style.maxHeight = "0px";
      centerSubheader.style.paddingTop = "0";
      centerSubheader.style.paddingBottom = "0";
      centerSubheader.style.borderBottomWidth = "0";
      centerSubheader.classList.add("collapsed-subheader");
      if (btnToggleSubheader) btnToggleSubheader.title = "Mostrar opciones";
    } else {
      centerSubheader.classList.remove("collapsed-subheader");
      centerSubheader.style.maxHeight = "none";
      centerSubheader.style.paddingTop = "";
      centerSubheader.style.paddingBottom = "";
      centerSubheader.style.borderBottomWidth = "";
      if (btnToggleSubheader) btnToggleSubheader.title = "Ocultar opciones";
    }
  }
}

function setSyncStatus(text, isError = false) {
  if (!dom.firebaseStatus) return;
  dom.firebaseStatus.textContent = text;
  dom.firebaseStatus.className = isError
    ? "text-xs font-medium text-red-600 flex items-center gap-1.5"
    : "text-xs font-medium text-teal-600 flex items-center gap-1.5";
}

export function getActiveSession() {
  return appState.sessions.find((s) => s.id === appState.activeSessionId) || appState.sessions[0] || null;
}

export function getAllSessions() {
  return appState.sessions;
}

function renderEditorialModeBadge(session = null) {
  if (!dom.editorialModeBadge || !dom.editorialModeBadgeLabel) return;
  if (!session) {
    dom.editorialModeBadge.hidden = true;
    return;
  }
  const mode = ["marcie", "aida", "custom"].includes(String(session.editorialMode || session.article?.editorialMode || "").toLowerCase())
    ? String(session.editorialMode || session.article?.editorialMode).toLowerCase()
    : "marcie";
  const labels = { marcie: "Modo Marcie", aida: "Modo Aida", custom: "Modo Otro" };
  const label = labels[mode];
  dom.editorialModeBadge.hidden = false;
  dom.editorialModeBadge.dataset.mode = mode;
  dom.editorialModeBadgeLabel.textContent = label;
  dom.editorialModeBadge.setAttribute("aria-label", `Modo editorial: ${label.replace("Modo ", "")}`);
  dom.editorialModeBadge.title = `Esta sesión usa el ${label.toLowerCase()}`;
}

function renderSessionList() {
  if (!dom.sessionList) return;

  const query = appState.searchQuery.toLowerCase().trim();
  const filter = appState.filter;

  const filtered = appState.sessions.filter((session) => {
    // Filtro de archivados
    if (appState.showArchived) {
      if (!session.isArchived) return false;
    } else {
      if (session.isArchived) return false;
    }

    // Filtro por búsqueda
    const matchesQuery = !query ||
      session.title.toLowerCase().includes(query) ||
      (session.topic && session.topic.toLowerCase().includes(query));

    if (!matchesQuery) return false;

    // Filtro por estado
    if (filter === "all") return true;
    if (filter === "recent") return true;
    if (filter === "draft") return session.status === "new" || session.status === "drafting";
    if (filter === "review") return session.status === "review_required";
    if (filter === "published") return session.status === "published" || session.status === "approved";
    return true;
  });

  if (filtered.length === 0) {
    dom.sessionList.innerHTML = `
      <div class="text-center py-8 text-slate-400 text-xs">
        No se encontraron sesiones con el filtro actual.
      </div>
    `;
    return;
  }

  // Agrupar en "Hoy" y "Anteriores"
  const today = new Date().toDateString();
  const todaySessions = [];
  const earlierSessions = [];

  filtered.forEach((session) => {
    const sessionDate = new Date(session.updatedAt || session.createdAt).toDateString();
    if (sessionDate === today) {
      todaySessions.push(session);
    } else {
      earlierSessions.push(session);
    }
  });

  let html = "";

  if (todaySessions.length > 0) {
    html += `
      <div class="mb-3">
        <h3 class="text-[10px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Hoy</h3>
        <div class="flex flex-col gap-1.5">
          ${todaySessions.map((s) => renderSessionItem(s)).join("")}
        </div>
      </div>
    `;
  }

  if (earlierSessions.length > 0) {
    html += `
      <div class="mb-3">
        <h3 class="text-[10px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Esta semana y anteriores</h3>
        <div class="flex flex-col gap-1.5">
          ${earlierSessions.map((s) => renderSessionItem(s)).join("")}
        </div>
      </div>
    `;
  }

  dom.sessionList.innerHTML = html;

  // Re-enlazar listeners de selección y menú contextual
  dom.sessionList.querySelectorAll("[data-session-id]").forEach((item) => {
    item.addEventListener("click", () => {
      const sessionId = item.getAttribute("data-session-id");
      appState.activeSessionId = sessionId;
      renderSessionList();
      renderActiveSession();
    });

    const menuBtn = item.querySelector("[data-menu-trigger]");
    if (menuBtn) {
      menuBtn.addEventListener("click", (e) => {
        const sessionId = item.getAttribute("data-session-id");
        const session = appState.sessions.find((s) => s.id === sessionId);
        if (session) {
          openSessionContextMenu(session, e, () => {
            renderSessionList();
            renderActiveSession();
          });
        }
      });
    }
  });

  // Re-inicializar iconos de Lucide
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function getBadgeForStatus(status) {
  switch (status) {
    case "published":
      return `<span class="badge badge-success text-[10px]">Publicado</span>`;
    case "approved":
      return `<span class="badge badge-success text-[10px]">Aprobado</span>`;
    case "review_required":
      return `<span class="badge badge-secondary text-[10px]">En revisión</span>`;
    case "proposal_ready":
      return `<span class="badge badge-secondary text-[10px]">Propuesta</span>`;
    case "researching":
      return `<span class="badge badge-warning text-[10px]">Investigando</span>`;
    case "drafting":
    case "new":
    default:
      return `<span class="badge badge-warning text-[10px]">Borrador</span>`;
  }
}

function getIconForAudience(audience) {
  switch (audience) {
    case "students":
      return { bg: "bg-blue-50", color: "text-blue-600", icon: "user" };
    case "parents":
      return { bg: "bg-orange-50", color: "text-orange-600", icon: "users" };
    case "educators":
    default:
      return { bg: "bg-teal-50", color: "text-teal-600", icon: "globe" };
  }
}

function renderSessionItem(session) {
  const isActive = session.id === appState.activeSessionId;
  const iconConfig = getIconForAudience(session.audience);

  return `
    <div data-session-id="${session.id}" data-session-active="${isActive ? "true" : "false"}" class="marcie-session-item ${isActive ? 'is-active bg-[#edf3fb] border border-blue-200/90 shadow-2xs' : 'bg-[#f4f7fb] hover:bg-[#ebf2fb] border border-slate-200/60'} rounded-lg p-2 cursor-pointer transition-all flex items-center gap-2">
      <!-- Icono según el tipo de artículo -->
      <div class="w-7 h-7 rounded-md ${iconConfig.bg} flex items-center justify-center ${iconConfig.color} shrink-0 shadow-2xs">
        <i data-lucide="${iconConfig.icon}" class="w-3.5 h-3.5"></i>
      </div>

      <!-- Título de la sesión -->
      <div class="font-medium text-[0.78rem] text-slate-900 truncate flex-1 leading-tight">
        ${escapeHtml(session.title)}
      </div>

      <!-- Controles -->
      <div class="flex items-center gap-1 shrink-0">
        ${isActive ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shadow-2xs" title="Sesión activa"></span>' : ''}
        <button data-menu-trigger="true" class="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-200/60 transition-colors" title="Opciones">
          <i data-lucide="more-vertical" class="w-3 h-3"></i>
        </button>
      </div>
    </div>
  `;
}

function renderActiveSession() {
  const session = getActiveSession();
  renderEditorialModeBadge(session);
  if (!session) return;

  const article = session.article || {};
  applyArticleTemplate(article);
  const shouldShowEditorialGuideForSession = shouldShowEditorialGuide(session, article);
  const isGeneratingArticle = appState.isGeneratingArticle;
  const activeSessionId = session.id;

  const nowStr = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  // Título y metadatos
  if (dom.articleTitle) dom.articleTitle.textContent = article.title || session.title;
  if (dom.articleSubtitle) dom.articleSubtitle.textContent = article.subtitle || "";
  if (dom.articleMetaDate) dom.articleMetaDate.textContent = article.publishedDateText || nowStr;
  if (dom.articleMetaAuthor) {
    const rawFallbackAuthorName = getPrimaryAuthorFallback(article, session);
    const currentUserDisplayName = normalizeTextValue(appState.currentUser?.displayName);
    const safeCurrentUserDisplayName = currentUserDisplayName && !looksLikeEmail(currentUserDisplayName) ? currentUserDisplayName : "";
    const fallbackAuthorName = rawFallbackAuthorName && !looksLikeEmail(rawFallbackAuthorName)
      ? rawFallbackAuthorName
      : (safeCurrentUserDisplayName || "Autor");
    dom.articleMetaAuthor.textContent = fallbackAuthorName;

    resolveAuthorDisplayName({ article, session }).then((resolvedAuthor) => {
      if (!dom.articleMetaAuthor) return;
      const activeSessionNow = getActiveSession();
      if (!activeSessionNow || activeSessionNow.id !== activeSessionId) return;
      if (resolvedAuthor) dom.articleMetaAuthor.textContent = resolvedAuthor;
    }).catch(() => {});
  }
  if (dom.articleMetaReadTime) dom.articleMetaReadTime.textContent = `${article.readingTimeMinutes || 6} min de lectura`;
  if (dom.articleMetaTags) dom.articleMetaTags.textContent = (article.tags || []).join(", ") || "Educación, Innovación";
  setEditorialHeaderStateForSession(session, shouldShowEditorialGuideForSession);
  renderArticleFeaturedImage(session, article);

  const isArticleTab = appState.currentTab === "article";
  if (dom.articleView && dom.editorialGuideView) {
    if (isGeneratingArticle && isArticleTab) {
      dom.editorialGuideView.classList.add("hidden");
      dom.editorialGuideView.style.display = "none";
      dom.editorialGuideView.hidden = true;
      dom.articleView.classList.remove("hidden");
      dom.articleView.style.display = "";
      dom.articleView.hidden = false;
    } else {
      setNodeHidden(dom.editorialGuideView, !isArticleTab || !shouldShowEditorialGuideForSession);
      setNodeHidden(dom.articleView, !isArticleTab || shouldShowEditorialGuideForSession);
      stopArticleGeneratingAnimation();
    }
  }

  if (isGeneratingArticle && isArticleTab) {
    renderArticleGeneratingState(session);
    return;
  }

  if (!isGeneratingArticle && !isArticleTab) {
    stopArticleGeneratingAnimation();
  }

  // Renderizar bloques del artículo o informe de tendencias descubiertas
  if (dom.articleBodyContainer) {
    const blocks = Array.isArray(article.blocks) ? article.blocks : [];
    const audienceResearch = session.researchByAudience?.[session.audience || article.audience] || article.researchDossier || {};
    const articleVerifiedSourceCount = Array.isArray(article.sources) ? article.sources.filter((source) => source?.verificationStatus === "verified").length : null;
    const verifiedSourceCount = Number(articleVerifiedSourceCount ?? audienceResearch.verifiedSourceCount ?? 0);
    const targetSourceCount = Number(audienceResearch.targetSourceCount || 6);
    const incompleteResearchHtml = blocks.length && verifiedSourceCount < targetSourceCount
      ? `<div class="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Bibliografía incompleta:</strong> este artículo se redactó únicamente con ${verifiedSourceCount} fuente(s) real(es) verificada(s) de un objetivo de ${targetSourceCount}. No se incorporaron fuentes no comprobadas.</div>`
      : "";
    if (blocks.length === 0) {
      const trend = session.trends?.[0];
      if (trend) {
        dom.articleBodyContainer.innerHTML = `
          <div class="space-y-6 my-2">
            <!-- Diagnóstico de Tendencia Gemini -->
            <div class="bg-gradient-to-br from-teal-50/90 via-slate-50 to-purple-50/40 border border-teal-200 rounded-xl p-5 shadow-xs">
              <div class="flex items-center justify-between gap-4 mb-3">
                <div class="flex items-center gap-2">
                  <span class="p-1.5 bg-teal-100 text-teal-800 rounded-lg">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                  </span>
                  <h3 class="font-bold text-slate-900 text-sm">Diagnóstico Editorial de Tendencia</h3>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-500 font-medium">TrendScore:</span>
                  <span class="badge badge-success text-xs font-bold px-2.5 py-1">${trend.trendScore == null ? "Sin métrica" : `${trend.trendScore} / 100`}</span>
                </div>
              </div>
              <p class="text-slate-700 text-xs sm:text-sm leading-relaxed mb-4">${escapeHtml(trend.summary || "Señal descubierta a partir de debates educativos recientes.")}</p>

              <div class="grid grid-cols-3 gap-3 pt-3 border-t border-teal-100 text-xs">
                <div class="bg-white/90 p-2.5 rounded-lg border border-teal-100/80 shadow-2xs">
                  <div class="text-slate-500 text-[10px] uppercase font-bold">Crecimiento</div>
                  <div class="text-purple-700 font-bold text-sm mt-0.5">${trend.growth || "No medido"}</div>
                </div>
                <div class="bg-white/90 p-2.5 rounded-lg border border-teal-100/80 shadow-2xs">
                  <div class="text-slate-500 text-[10px] uppercase font-bold">Frescura</div>
                  <div class="text-slate-800 font-bold text-sm mt-0.5">${trend.freshness || "No medida"}</div>
                </div>
                <div class="bg-white/90 p-2.5 rounded-lg border border-teal-100/80 shadow-2xs">
                  <div class="text-slate-500 text-[10px] uppercase font-bold">Fuentes</div>
                  <div class="text-teal-700 font-bold text-sm mt-0.5">${trend.sourceDiversity || "Alta"}</div>
                </div>
              </div>
            </div>

            <!-- Señales Pedagógicas Detectadas -->
            ${Array.isArray(trend.signals) && trend.signals.length > 0 ? `
              <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-2xs">
                <h4 class="font-bold text-slate-800 text-xs sm:text-sm mb-3 flex items-center gap-2">
                  <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                  Señales Clave Detectadas en Aulas y Debates
                </h4>
                <ul class="space-y-2 text-xs text-slate-700">
                  ${trend.signals.map((sig) => `
                    <li class="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                      <span class="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0"></span>
                      <span class="leading-relaxed font-medium">${escapeHtml(sig)}</span>
                    </li>
                  `).join("")}
                </ul>
              </div>
            ` : ""}

            <!-- Banner de Acción Rápida -->
            <div class="p-4 bg-purple-50/80 border border-purple-200 rounded-xl flex items-center justify-between gap-4">
              <div>
                <div class="font-bold text-purple-900 text-xs">Siguiente paso del flujo editorial:</div>
                <div class="text-purple-700 text-[11px]">Genera 4 propuestas por audiencia o redacta directamente el artículo completo.</div>
              </div>
            <button id="btn-quick-draft" class="btn btn-primary h-8 px-4 text-xs font-semibold shadow-xs shrink-0 cursor-pointer flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                Redactar
              </button>
            </div>
          </div>
        `;

        document.getElementById("btn-quick-draft")?.addEventListener("click", () => {
          const card = document.querySelector('[data-step-id="2"] .flex-1');
          if (card) card.click();
        });
      } else if (shouldShowEditorialGuideForSession) {
        renderEditorialGuideInArticleBody();
      } else {
        dom.articleBodyContainer.innerHTML = `
          <div class="py-16 text-center text-slate-400 text-xs">
            <svg class="w-10 h-10 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p class="font-medium text-slate-500 mb-1">Aún no hay contenido redactado para esta sesión.</p>
            <p>Usa la <strong>Etapa 1: Investigar y analizar</strong> o la <strong>Etapa 2: Crear, redactar y revisar</strong> en el panel derecho.</p>
          </div>
        `;
      }
    } else {
      dom.articleBodyContainer.innerHTML = `${incompleteResearchHtml}${blocks.map((block) => renderBlock(block)).join("")}`;
    }
  }

  // Fuentes consultadas
  if (dom.articleSourcesList) {
    const sources = getArticleExportSources(article);
    const isApa = isSourceCitationFormatApa(article);
    const articleSourcesSection = dom.articleSourcesList.closest("[data-article-sources]");
    articleSourcesSection?.setAttribute("data-source-citation-format", isApa ? "apa" : "default");
    dom.articleSourcesList.classList.toggle("is-apa", isApa);
    dom.articleSourcesList.classList.toggle("sm:grid-cols-2", !isApa);
    if (dom.btnSourceCitationFormat) {
      const label = dom.btnSourceCitationFormat.querySelector("#source-citation-format-label");
      dom.btnSourceCitationFormat.disabled = sources.length === 0;
      dom.btnSourceCitationFormat.setAttribute("aria-pressed", String(isApa));
      dom.btnSourceCitationFormat.title = isApa ? "Volver al formato estándar" : "Cambiar fuentes a formato APA";
      dom.btnSourceCitationFormat.classList.toggle("border-teal-300", isApa);
      dom.btnSourceCitationFormat.classList.toggle("bg-teal-50", isApa);
      dom.btnSourceCitationFormat.classList.toggle("text-teal-700", isApa);
      if (label) label.textContent = isApa ? "Vista APA activa" : "Ver en APA";
    }
    dom.articleSourcesList.innerHTML = sources.map((s) => `
      <li class="article-source-item group flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-xs transition-all">
        <div class="bg-slate-100 p-2 rounded-lg text-slate-500 group-hover:text-slate-700 transition-colors">
          <i data-lucide="link" class="w-4 h-4"></i>
        </div>
        <div class="flex flex-col gap-1 flex-1 min-w-0">
          <span class="article-source-title text-slate-800 font-semibold text-sm leading-tight ${isApa ? "whitespace-normal" : "truncate"}" title="${escapeHtml(isApa ? formatSourceForArticleView(s) : s.title)}">${escapeHtml(isApa ? formatSourceForArticleView(s) : s.title)}</span>
          ${(() => {
            const safeSourceHref = safeSourceUrlForArticle(s.url);
            const linkLabel = safeSourceHref === "#" ? "Sin enlace" : "Ver referencia";
            return `<a href="${escapeHtml(safeSourceHref)}" target="${safeSourceHref === "#" ? "_self" : "_blank"}" rel="${safeSourceHref === "#" ? "" : "noopener"}" class="text-slate-500 hover:text-teal-600 hover:underline text-xs font-medium flex items-center gap-1 w-max">${linkLabel} <i data-lucide="external-link" class="w-3 h-3"></i></a>`;
          })()}
        </div>
      </li>
    `).join("");
  }
  renderSeoPanel(article);
  renderEvidencePanel(article);
  const evidenceStatus = String(article.verification?.status || "pending");
  if (!appState.isGeneratingArticle && ["pending", "stale"].includes(evidenceStatus) && article.blocks?.length) {
    scheduleAutomaticEvidenceVerification(session, { delay: 650 });
  }

  // Vista estructurada JSON
  if (dom.structuredJsonCode) {
    dom.structuredJsonCode.textContent = JSON.stringify(session, null, 2);
  }

  // Actualizar botones de audiencia
  updateAudienceSelector(session.audience);

  // Actualizar íconos de estado del pipeline
  updatePipelineStepIcons(session);

  // Actualizar Insight de Tendencia en el Panel Derecho
  const trendContainer = document.getElementById("trend-insight-container");
  if (trendContainer) {
    if (session.trends && session.trends.length > 0) {
      const trend = session.trends[0];
      const summaryEl = document.getElementById("trend-insight-summary");
      const scoreEl   = document.getElementById("trend-insight-score");
      const signalsEl = document.getElementById("trend-insight-signals");
      const barChart  = document.getElementById("trend-bar-chart");
      const barLabels = document.getElementById("trend-bar-labels");
      const metricsEl = document.getElementById("trend-metrics");

      if (summaryEl) summaryEl.textContent = trend.summary || session.selectedBrief || "Análisis generado para la propuesta.";
      if (scoreEl) scoreEl.textContent = trend.trendScore != null ? `${trend.trendScore}/100` : "Señal verificada";

      if (barChart && barLabels) {
        barChart.innerHTML = `<div class="self-center text-[10px] leading-relaxed text-slate-500">Sin serie cuantitativa: Marcie no dibuja porcentajes que las fuentes no aportan.</div>`;
        barLabels.innerHTML = "";
      }

      // Métricas de tendencia
      if (metricsEl) {
        const metrics = [
          { label: "TrendScore", value: trend.trendScore ? `${trend.trendScore}/100` : "–", color: "text-purple-700" },
          { label: "Fuentes", value: String((trend.sources || []).length), color: "text-teal-700" },
          { label: "Ventana", value: trend.period || "Declarada", color: "text-blue-700" },
        ];
        metricsEl.innerHTML = metrics.map(m => `
          <div class="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
            <div class="text-[9px] text-slate-400 uppercase font-bold mb-0.5">${m.label}</div>
            <div class="${m.color} font-bold text-xs">${m.value}</div>
          </div>`).join("");
      }

      if (signalsEl && Array.isArray(trend.signals) && trend.signals.length > 0) {
        signalsEl.innerHTML = trend.signals.map(s => `<li>${escapeHtml(s)}</li>`).join("");
      } else if (signalsEl) {
        signalsEl.innerHTML = `<li>No se identificaron señales respaldadas para esta consulta.</li>`;
      }

      trendContainer.classList.remove("hidden");
    } else {
      trendContainer.classList.add("hidden");
    }
  }

  // Hacer editable el artículo en tiempo real
  makeArticleEditable({
    getSession: () => getActiveSession(),
    onMaterialChange: (editedSession) => invalidateMaterialApproval(editedSession),
    onSaved: () => {
      renderSessionList();
    }
  });

  // Re-inicializar iconos
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function renderArticleFeaturedImage(session, article = {}) {
  const host = dom.articleFeaturedImage;
  if (!host) return;

  const hasArticle = Array.isArray(article.blocks) && article.blocks.length > 0;
  setNodeHidden(host, !hasArticle);
  if (!hasArticle) {
    host.innerHTML = "";
    return;
  }

  const isGenerating = appState.generatingImageSessionId === session.id;
  const image = article.featuredImage && typeof article.featuredImage === "object" ? article.featuredImage : null;

  if (isGenerating) {
    host.innerHTML = `
      <div class="marcie-cover-state marcie-cover-state--loading" role="status" aria-live="polite">
        <div class="marcie-cover-loader" aria-hidden="true">
          <span></span><span></span><span></span>
          <img src="/MarcieBlogEditorLogo2.png" alt="" />
        </div>
        <div>
          <p class="marcie-cover-state__title">Creando la portada de este artículo</p>
          <p class="marcie-cover-state__copy">Gemini está preparando una imagen específica para ${escapeHtml(getEditorialAudienceLabel(session.audience || article.audience || "educators"))}.</p>
        </div>
      </div>
    `;
    return;
  }

  if (image?.url) {
    host.innerHTML = `
      <figure class="marcie-cover-figure">
        <img src="${escapeHtml(image.url)}" alt="Portada editorial de ${escapeHtml(article.title || session.title)}" loading="eager" />
        <figcaption class="marcie-cover-actions">
          <button type="button" class="marcie-cover-button marcie-cover-button--overlay" data-generate-article-image>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"/></svg>
            Regenerar portada
          </button>
        </figcaption>
      </figure>
    `;
  } else {
    host.innerHTML = `
      <div class="marcie-cover-state marcie-cover-state--empty">
        <div class="marcie-cover-state__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></svg>
        </div>
        <div class="marcie-cover-state__content">
          <p class="marcie-cover-state__eyebrow">Imagen destacada</p>
          <p class="marcie-cover-state__title">Dale una identidad visual al artículo</p>
          <p class="marcie-cover-state__copy">Crearemos una portada 16:9 específica para este artículo y su audiencia.</p>
        </div>
        <button type="button" class="marcie-cover-button" data-generate-article-image>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/></svg>
          Generar portada con IA
        </button>
      </div>
    `;
  }

  host.querySelector("[data-generate-article-image]")?.addEventListener("click", async () => {
    if (appState.generatingImageSessionId) return;
    const currentAudience = session.audience || article.audience || "educators";
    appState.generatingImageSessionId = session.id;
    renderArticleFeaturedImage(session, article);
    setSyncStatus(`Generando portada para ${getEditorialAudienceLabel(currentAudience)}...`);

    try {
      article.featuredImage = await generateArticleImageWithGemini({
        article,
        sessionId: session.id,
        approachId: currentAudience,
        approachLabel: getEditorialAudienceLabel(currentAudience)
      });
      session.articlesByAudience = { ...(session.articlesByAudience || {}), [currentAudience]: article };
      session.article = article;
      await saveMarcieSession(session);
      setSyncStatus("🟢 Sincronizado con Firebase");
      showToast(`Portada generada para ${getEditorialAudienceLabel(currentAudience)}.`, "success");
    } catch (error) {
      console.error(`[MarcieBlogEditor] Error al generar portada para ${currentAudience}:`, error);
      setSyncStatus("⚠️ Error al generar la portada", true);
      showToast(`No se pudo generar la portada: ${error.message}`, "error");
    } finally {
      appState.generatingImageSessionId = null;
      renderArticleFeaturedImage(session, article);
    }
  });
}

/**
 * Actualiza dinámicamente los íconos de estado de los pasos del pipeline
 * según el estado actual de la sesión. Cada paso tiene su color único.
 */
function updatePipelineStepIcons(session) {
  // Configuración de colores únicos por paso (no todos verde)
  const stepConfig = {
    1: { bg: "bg-teal-500", icon: "check", label: "Investigación completada" },
    2: { bg: "bg-purple-500", icon: "check", label: "Creación y revisión completadas" },
    3: { bg: "bg-rose-500", icon: "check", label: "Exportado" },
  };

  // Determinar qué pasos están completados según el estado de la sesión
  const completedSteps = new Set();
  const hasResearch = Boolean((session.trends && session.trends.length > 0) || session.analysis || session.context);
  const hasArticle = Boolean(session.article && Array.isArray(session.article.blocks) && session.article.blocks.length > 0);
  const hasExport = session.status === "published" || Boolean(session.exported);
  if (hasResearch || hasArticle || hasExport) completedSteps.add(1);
  if (hasArticle || hasExport) completedSteps.add(2);
  if (hasExport) completedSteps.add(3);

  document.querySelectorAll("[data-step-id]").forEach((stepEl) => {
    const stepId = parseInt(stepEl.getAttribute("data-step-id"), 10);
    const config = stepConfig[stepId];
    if (!config) return;
    const isDone = completedSteps.has(stepId);
    const statusIcon = stepEl.querySelector(".step-status-icon");
    const badge = stepEl.querySelector(".step-badge");

    if (statusIcon) {
      if (isDone) {
        statusIcon.innerHTML = `
          <div class="w-5 h-5 rounded-full ${config.bg} text-white flex items-center justify-center shrink-0 shadow-xs" title="${config.label}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </div>`;
      } else {
        statusIcon.innerHTML = "";
      }
    }

    // Actualizar estilo del badge numérico
      if (badge) {
        if (isDone) {
          const colorMap = {
            1: "bg-teal-50 text-teal-700 border-teal-200",
            2: "bg-purple-50 text-purple-700 border-purple-200",
            3: "bg-rose-50 text-rose-700 border-rose-200",
          };
          badge.className = `step-badge w-8 h-8 rounded-full ${colorMap[stepId] || "bg-teal-50 text-teal-700 border-teal-200"} flex items-center justify-center text-xs font-bold border shadow-xs z-10 shrink-0`;
        } else {
          badge.className = "step-badge w-8 h-8 rounded-full bg-white text-slate-500 flex items-center justify-center text-xs font-bold border border-slate-200 shadow-xs z-10 shrink-0";
        }
      }
  });
}


function parseInlineStyles(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/__(.*?)__/g, '<strong class="font-semibold">$1</strong>')
    .replace(/_(.*?)_/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="article-inline-code">$1</code>');
}

function renderBlock(block) {
  if (!block) return "";
  switch (block.type) {
    case "paragraph":
      return `<p class="text-slate-700 leading-relaxed mb-6">${parseInlineStyles(escapeHtml(block.text))}</p>`;
    case "heading":
      return `<h3 class="text-xl font-bold text-slate-800 mb-4 mt-8">${parseInlineStyles(escapeHtml(block.text))}</h3>`;
    case "quote":
      return `
        <blockquote class="bg-teal-50 border-l-4 border-teal-500 p-6 rounded-r-lg my-8 relative">
          <svg class="article-quote-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-1 5-4 5v3Z"></path><path d="M14 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-1 5-4 5v3Z"></path></svg>
          <p class="text-teal-900 font-medium text-lg leading-relaxed relative z-10">${parseInlineStyles(escapeHtml(block.text))}</p>
          ${block.attribution ? `<footer class="text-sm text-teal-700 mt-3">— ${parseInlineStyles(escapeHtml(block.attribution))}</footer>` : ""}
        </blockquote>
      `;
    case "bulletList":
    case "list":
      const items = Array.isArray(block.items) ? block.items : [];
      if (items.length === 0) return "";
      const isOrdered = block.listType === "ordered" || block.type === "orderedList";
      const listStyle = isOrdered ? "list-decimal font-medium" : "list-disc";
      const markerColor = isOrdered ? "text-teal-600" : "marker:text-teal-400";
      return `
        <ul class="${listStyle} ${markerColor} pl-6 mb-6 space-y-3 text-slate-700 leading-relaxed">
          ${items.map((item) => `<li><span class="text-slate-700 font-normal">${parseInlineStyles(escapeHtml(item))}</span></li>`).join("")}
        </ul>
      `;
    default:
      return `<div class="mb-4 text-slate-700">${parseInlineStyles(escapeHtml(block.text))}</div>`;
  }
}

function exportInlineHtml(text = "") {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

function getArticleExportTypographyConfig() {
  const articleView = document.getElementById("article-view") || dom.articleView;
  const readAttr = (name, fallback) => (articleView?.getAttribute(name) || fallback);

  const lineHeight = readAttr("data-text-line-height", "normal");
  const lineHeights = {
    compact: "1.25",
    normal: "1.5",
    loose: "1.8",
    auto: "normal"
  };

  const titleFontWeight = readAttr("data-text-title-weight", "semibold");
  const subtitleFontWeight = readAttr("data-text-subtitle-weight", "normal");
  const quoteColor = readAttr("data-quote-color", "teal");
  const fontFamily = readAttr("data-text-font", "sans");
  const titleSize = readAttr("data-text-title-size", "xsmall");
  const subtitleSize = readAttr("data-text-subtitle-size", "small");
  const pSize = readAttr("data-text-p-size", "normal");

  const fontFamilyMap = {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  };

  const titleSizeMap = {
    xsmall: { size: "1.3rem", line: "1.75rem" },
    small: { size: "1.55rem", line: "1.8rem" },
    normal: { size: "1.55rem", line: "1.75rem" },
    large: { size: "2rem", line: "1.9rem" }
  };

  const subtitleSizeMap = {
    small: { size: "1rem", line: "1.5rem", h3: "1.125rem", h3line: "1.5rem" },
    normal: { size: "1.18rem", line: "1.6rem", h3: "1.25rem", h3line: "1.75rem" },
    large: { size: "1.42rem", line: "1.75rem", h3: "1.5rem", h3line: "2rem" }
  };

  const pSizeMap = {
    small: { size: "0.875rem" },
    normal: { size: "1rem" },
    large: { size: "1.125rem" }
  };

  const quoteColorMap = {
    teal: {
      background: "#eff6ff",
      border: "#0f766e",
      text: "#0f172a",
      accent: "#0f766e",
      icon: "#93c5fd"
    },
    blue: {
      background: "#eff6ff",
      border: "#3b82f6",
      text: "#1e3a8a",
      accent: "#2563eb",
      icon: "#bfdbfe"
    },
    purple: {
      background: "#faf5ff",
      border: "#a855f7",
      text: "#581c87",
      accent: "#7c3aed",
      icon: "#ddd6fe"
    },
    amber: {
      background: "#fffbeb",
      border: "#f59e0b",
      text: "#78350f",
      accent: "#d97706",
      icon: "#fde68a"
    }
  };

  const quote = quoteColorMap[quoteColor] || quoteColorMap.teal;
  const title = titleSizeMap[titleSize] || titleSizeMap.xsmall;
  const subtitle = subtitleSizeMap[subtitleSize] || subtitleSizeMap.small;
  const paragraph = pSizeMap[pSize] || pSizeMap.normal;

  return {
    fontFamily: fontFamilyMap[fontFamily] || fontFamilyMap.sans,
    titleSize: title.size,
    titleLineHeight: title.line,
    titleWeight: titleFontWeight === "medium" ? 500 : titleFontWeight === "bold" ? 700 : titleFontWeight === "semibold" ? 600 : 400,
    subtitleSize: subtitle.size,
    subtitleLineHeight: subtitle.line,
    subtitleWeight: subtitleFontWeight === "medium" ? 500 : subtitleFontWeight === "bold" ? 700 : subtitleFontWeight === "semibold" ? 600 : 400,
    h3Size: subtitle.h3,
    h3LineHeight: subtitle.h3line,
    pSize: paragraph.size,
    lineHeight: lineHeights[lineHeight] || lineHeights.normal,
    quote
  };
}

function getSafeSourceHost(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "Enlace";
  }
}

function isSafeExportImageUrl(url = "") {
  const normalized = String(url || "").trim();
  if (!normalized) return false;
  if (normalized.startsWith("data:image/")) return true;
  if (normalized.startsWith("assets/") || normalized.startsWith("./assets/")) return true;
  if (normalized.startsWith("file://")) return false;
  try {
    const parsed = new URL(normalized);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function isSafeExportTextUrl(url = "") {
  const normalized = String(url || "").trim();
  if (!normalized) return false;
  if (normalized.startsWith("file://")) return false;
  try {
    const parsed = new URL(normalized);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function getArticleExportSources(article = {}) {
  const trusted = sanitizeTrustedSources(Array.isArray(article.sources) ? article.sources : []);
  const supplementary = Array.isArray(article.supplementarySources) ? article.supplementarySources : [];
  const merged = [...trusted, ...supplementary];
  const seen = new Set();
  return merged.filter((source) => {
    const rawKey = String(source?.url || source?.title || "").trim();
    if (!rawKey || seen.has(rawKey)) return false;
    seen.add(rawKey);
    return true;
  });
}

function isSourceCitationFormatApa(article = {}) {
  return article?.sourceCitationStyle === "apa" || article?.sourceCitationFormat === "apa";
}

function formatSourceForArticleView(source = {}) {
  const citation = normalizeTextValue(source.apaCitation);
  if (citation) return citation;

  const authors = Array.isArray(source.authors)
    ? source.authors.map((author) => normalizeTextValue(author)).filter(Boolean).join(", ")
    : normalizeTextValue(source.authors || source.author);
  const year = normalizeTextValue(source.year || source.publishedYear || source.datePublished);
  const title = normalizeTextValue(source.title) || "Fuente sin título";
  const publisher = normalizeTextValue(source.publisher || source.organization || source.siteName);
  const url = safeSourceUrlForArticle(source.url);
  let domain = "";
  if (url !== "#") {
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}
  }
  const responsibleAuthor = authors || publisher || domain || "Autor no identificado";
  const publicationYear = year ? String(year).match(/\b(?:19|20)\d{2}\b/)?.[0] || year : "s. f.";
  const publication = publisher && publisher !== responsibleAuthor ? publisher : "";
  return [
    `${responsibleAuthor}. (${publicationYear}).`,
    `${title}.`,
    publication ? `${publication}.` : "",
    url !== "#" ? url : ""
  ].filter(Boolean).join(" ");
}

function safeSourceUrlForArticle(url = "") {
  return isSafeExportTextUrl(url) ? String(url).trim() : "#";
}

function formatSourceForExport(articleSourceMode = "default", source = {}) {
  if (articleSourceMode !== "apa") {
    return normalizeTextValue(source.title) || "Fuente sin título";
  }
  const citation = formatSourceForArticleView(source);
  return normalizeTextValue(citation) || normalizeTextValue(source.title) || "Fuente sin título";
}

function formatExportInlineHtml(text = "") {
  return parseInlineStyles(escapeHtml(text));
}

function renderExportArticleBlock(block) {
  if (!block) return "";
  const text = formatExportInlineHtml(block.text || "");

  if (block.type === "heading") {
    return `<h3>${text}</h3>`;
  }

  if (block.type === "quote") {
    return `
      <blockquote>
        <svg class="export-quote-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-1 5-4 5v3Z"></path><path d="M14 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-1 5-4 5v3Z"></path>
        </svg>
        <p>${text}</p>
        ${block.attribution ? `<footer>— ${formatExportInlineHtml(block.attribution)}</footer>` : ""}
      </blockquote>
    `;
  }

  if (block.type === "bulletList" || block.type === "list") {
    const items = Array.isArray(block.items) ? block.items : [];
    if (!items.length) return "";
    const isOrdered = block.listType === "ordered" || block.type === "orderedList";
    const tagName = isOrdered ? "ol" : "ul";
    return `<${tagName}>${items.map((item) => `<li>${formatExportInlineHtml(item || "")}</li>`).join("")}</${tagName}>`;
  }

  return `<p>${text}</p>`;
}

function exportSourceBadgeIcon(kind) {
  const iconMap = {
    date: "<path d=\"M8 2v4M16 2v4M3 10h18\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/><path d=\"M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01\"/>",
    user: "<path d=\"M20 21a8 8 0 1 0-16 0\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>",
    clock: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3.5 2\"/>",
    tag: "<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" stroke=\"none\"/>",
    link: "<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>",
    external: "<path d=\"M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>",
    book: "<path d=\"M2 3.6A2.6 2.6 0 0 1 4.6 1H9a3 3 0 0 1 3 3v18a3 3 0 0 0-3-3H4.6A2.6 2.6 0 0 0 2 21.6z\"/><path d=\"M22 3.6A2.6 2.6 0 0 0 19.4 1H15a3 3 0 0 0-3 3v18a3 3 0 0 1 3-3h4.4a2.6 2.6 0 0 1 2.6 2.6z\"/>"
  };
  const path = iconMap[kind] || iconMap.link;
  return `<svg class="export-inline-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

function sanitizeExportSourceUrl(url = "") {
  const safeUrl = String(url || "").trim();
  return isSafeExportTextUrl(safeUrl) ? safeUrl : "#";
}

function getArticleExportTypographyConfigForArticle(article = {}) {
  const template = getArticleTemplate(article.templateId);
  const appearance = article.appearance || {};
  const titleSizes = { xsmall: ["1.3rem", "1.75rem"], small: ["1.55rem", "1.8rem"], normal: ["1.55rem", "1.75rem"], large: ["2rem", "1.9rem"] };
  const subtitleSizes = { small: ["1rem", "1.5rem", "1.125rem", "1.5rem"], normal: ["1.18rem", "1.6rem", "1.25rem", "1.75rem"], large: ["1.42rem", "1.75rem", "1.5rem", "2rem"] };
  const paragraphSizes = { small: "0.875rem", normal: "1rem", large: "1.125rem" };
  const lineHeights = { compact: "1.25", normal: "1.5", loose: "1.8", auto: "normal" };
  const weights = { normal: 400, medium: 500, semibold: 600, bold: 700 };
  const fonts = { sans: template.vars.fontBody, serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" };
  const quoteColors = {
    teal: { background: "#eff6ff", border: "#0f766e", text: "#0f172a", accent: "#0f766e", icon: "#93c5fd" },
    blue: { background: "#eff6ff", border: "#3b82f6", text: "#1e3a8a", accent: "#2563eb", icon: "#bfdbfe" },
    purple: { background: "#faf5ff", border: "#a855f7", text: "#581c87", accent: "#7c3aed", icon: "#ddd6fe" },
    amber: { background: "#fffbeb", border: "#f59e0b", text: "#78350f", accent: "#d97706", icon: "#fde68a" }
  };
  const title = appearance["data-text-title-size"] ? titleSizes[appearance["data-text-title-size"]] : [template.vars.titleSize, template.vars.titleLine];
  const subtitle = appearance["data-text-subtitle-size"] ? subtitleSizes[appearance["data-text-subtitle-size"]] : [template.vars.subtitleSize, template.vars.subtitleLine, "1.25rem", "1.75rem"];
  const quoteOverride = appearance["data-quote-color"] ? quoteColors[appearance["data-quote-color"]] : null;
  return {
    fontFamily: fonts[appearance["data-text-font"]] || template.vars.fontBody,
    titleSize: title[0], titleLineHeight: title[1], titleWeight: weights[appearance["data-text-title-weight"]] || 600,
    subtitleSize: subtitle[0], subtitleLineHeight: subtitle[1], subtitleWeight: weights[appearance["data-text-subtitle-weight"]] || 400,
    h3Size: subtitle[2], h3LineHeight: subtitle[3], pSize: paragraphSizes[appearance["data-text-p-size"]] || template.vars.bodySize,
    lineHeight: lineHeights[appearance["data-text-line-height"]] || template.vars.bodyLine,
    quote: quoteOverride || { background: template.vars.quoteBg, border: template.vars.quoteBorder, text: template.vars.quoteText, accent: template.vars.accent, icon: template.vars.quoteIcon }
  };
}

function buildArticleHtmlDocument(session = {}, { coverSrc = "", author = "" } = {}) {
  const article = session.article || {};
  const title = article.seo?.title || article.title || session.title || "Artículo educativo";
  const template = getArticleTemplate(article.templateId);
  const typography = getArticleExportTypographyConfigForArticle(article);
  const blocksHtml = (article.blocks || []).map((block) => renderExportArticleBlock(block)).join("\n");
  const sourceMode = isSourceCitationFormatApa(article) ? "apa" : "default";
  const sources = getArticleExportSources(article);
  const sourceHtml = sources.length
    ? `<section data-article-sources data-source-citation-format="${sourceMode}">\n      <div class="article-sources-heading">${exportSourceBadgeIcon("book")}<h4>Fuentes consultadas</h4></div>\n      <ul class="article-sources-list">${sources
      .map((source) => {
        const safeSourceHref = sanitizeExportSourceUrl(source.url);
        const citationText = formatSourceForExport(sourceMode, source);
        const linkLabel = sourceMode === "apa" ? "Ver referencia" : "Visitar fuente externa";
        return `<li class="article-source-item"><span class="article-source-item-icon">${exportSourceBadgeIcon("link")}</span><div class="article-source-item-content"><span class="article-source-title" title="${escapeHtml(citationText)}">${escapeHtml(citationText)}</span><a href="${escapeHtml(safeSourceHref)}" target="${safeSourceHref === "#" ? "_self" : "_blank"}" rel="noopener noreferrer" class="article-source-link">${linkLabel} ${exportSourceBadgeIcon("external")}</a></div></li>`;
      })
      .join("")}</ul>\n    </section>`
    : "";

  const resolvedCoverSrc = isSafeExportImageUrl(coverSrc) ? coverSrc : isSafeExportImageUrl(article.featuredImage?.url) ? article.featuredImage.url : "";
  const coverHtml = resolvedCoverSrc
    ? `<figure class="marcie-cover-figure"><img src="${escapeHtml(resolvedCoverSrc)}" alt="Portada de ${escapeHtml(title)}"></figure>`
    : "";
  const readTimeMinutes = Number(article.readingTimeMinutes || 0);
  const fallbackDateText = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const dateText = escapeHtml(article.publishedDateText || fallbackDateText);
  const authorText = escapeHtml(author || getPrimaryAuthorFallback(article, session) || "Autor");
  const tagsText = escapeHtml((article.tags || []).join(", ") || "Educación, Innovación");

  const metaRowHtml = `
    <div data-article-meta-row class="article-meta-row">
      <span class="article-meta-badge article-meta-badge--date">${exportSourceBadgeIcon("date")}<span>${dateText || "Sin fecha"}</span></span>
      <span class="article-meta-badge article-meta-badge--author">${exportSourceBadgeIcon("user")}<span>${authorText || "Autor"}</span></span>
      <span class="article-meta-badge article-meta-badge--readtime">${exportSourceBadgeIcon("clock")}<span>${readTimeMinutes} min de lectura</span></span>
      <span class="article-meta-badge article-meta-badge--tags">${exportSourceBadgeIcon("tag")}<span>${tagsText}</span></span>
    </div>
  `;

  return `<!doctype html>
<html lang="es">
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${escapeHtml(template.fontUrl)}">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(article.seo?.description || article.excerpt || "")}" />
  <style>
    :root {
      --font-body: ${typography.fontFamily};
      --font-code: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      --quote-background: ${typography.quote.background};
      --quote-border: ${typography.quote.border};
      --quote-text: ${typography.quote.text};
      --quote-icon: ${typography.quote.icon};
      --title-size: ${typography.titleSize};
      --title-line: ${typography.titleLineHeight};
      --title-weight: ${typography.titleWeight};
      --subtitle-size: ${typography.subtitleSize};
      --subtitle-line: ${typography.subtitleLineHeight};
      --subtitle-weight: ${typography.subtitleWeight};
      --h3-size: ${typography.h3Size};
      --h3-line: ${typography.h3LineHeight};
      --p-size: ${typography.pSize};
      --line-height: ${typography.lineHeight};
    }

    *,
    *::before,
    *::after { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 2.25rem 2rem;
      color: #334155;
      background: #ffffff;
      font-family: var(--font-body);
    }

    .article-shell {
      max-width: 56rem;
      margin: 0 auto;
    }

    #article-title {
      color: #0f172a;
      margin: 0 0 1.25rem;
      font-size: var(--title-size);
      line-height: var(--title-line);
      font-weight: var(--title-weight);
      letter-spacing: -0.025em;
    }

    #article-subtitle {
      color: #64748b;
      margin: 0 0 1.5rem;
      font-size: var(--subtitle-size);
      line-height: var(--subtitle-line);
      font-weight: var(--subtitle-weight);
    }

    [data-article-meta-row] {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin: 0 0 2rem;
      font-size: 0.875rem;
    }

    .article-meta-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.38rem 0.78rem;
      border-radius: 0.375rem;
      border: 1px solid;
      font-weight: 500;
      white-space: nowrap;
    }

    .article-meta-badge svg {
      width: 1rem;
      height: 1rem;
      color: currentColor;
    }

    .article-meta-badge--date { color: #0e7490; background: #ecfeff; border-color: #a5f3fc; }
    .article-meta-badge--author { color: #b45309; background: #ffedd5; border-color: #fed7aa; }
    .article-meta-badge--readtime { color: #15803d; background: #dcfce7; border-color: #86efac; }
    .article-meta-badge--tags { color: #6d28d9; background: #ede9fe; border-color: #ddd6fe; }

    .marcie-cover-figure {
      margin: 0 0 2.5rem;
      position: relative;
      overflow: hidden;
      border-radius: 0.5rem;
      background: #e2e8f0;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 18px 45px rgba(15, 23, 42, 0.1);
    }

    .marcie-cover-figure > img {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
    }

    .article-divider {
      height: 1px;
      width: 100%;
      background: #e2e8f0;
      margin-bottom: 2.5rem;
    }

    #article-body-container h3 {
      margin: 2rem 0 0.8rem;
      font-size: var(--h3-size);
      line-height: var(--h3-line);
      color: #1e293b;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    #article-body-container p,
    #article-body-container li {
      margin: 0 0 1.25rem;
      font-size: var(--p-size);
      line-height: var(--line-height);
      color: #334155;
    }

    #article-body-container ul,
    #article-body-container ol {
      margin: 0 0 1.25rem 1.4rem;
      padding: 0;
      line-height: var(--line-height);
    }

    #article-body-container ul { list-style: disc; }
    #article-body-container ol { list-style: decimal; }

    #article-body-container li { margin-bottom: 0.5rem; }
    #article-body-container li::marker { color: #0d9488; }
    #article-body-container strong { color: #0f172a; font-weight: 700; }
    #article-body-container em { font-style: italic; }
    #article-body-container code {
      font-family: var(--font-code);
      background: #f1f5f9;
      color: #7c3aed;
      border-radius: 0.375rem;
      padding: 0.15rem 0.35rem;
      font-size: 0.96em;
    }

    #article-body-container blockquote {
      position: relative;
      margin: 2rem 0;
      padding: 1rem 1.25rem 1rem 3.6rem;
      border-left: 4px solid var(--quote-border);
      background: var(--quote-background);
      color: var(--quote-text);
      border-radius: 0 0.5rem 0.5rem 0;
    }

    .export-quote-icon {
      position: absolute;
      top: 1rem;
      left: 1rem;
      width: 1.95rem;
      height: 1.95rem;
      color: var(--quote-icon);
      stroke-width: 1.8;
      opacity: 0.45;
    }

    #article-body-container blockquote p {
      margin: 0;
      line-height: calc(var(--line-height) + 0.1);
      color: var(--quote-text);
      font-weight: 500;
      font-size: 1rem;
    }

    #article-body-container blockquote footer {
      margin-top: 0.6rem;
      font-size: 0.95rem;
      color: #334155;
      font-style: normal;
      opacity: 0.95;
    }

    [data-article-sources] {
      margin-top: 4rem;
      padding-top: 2.5rem;
      border-top: 1px solid rgba(226, 232, 240, 0.7);
    }

    .article-sources-heading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.2rem;
      color: #1e293b;
      font-weight: 700;
      font-size: 1.125rem;
    }

    .article-sources-heading .export-inline-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .article-sources-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .article-source-item {
      display: flex;
      align-items: flex-start;
      gap: 0.7rem;
      min-width: 0;
      padding: 0.8rem;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 0.6rem;
      color: #0f172a;
    }

    .article-source-item-icon {
      flex: 0 0 auto;
      width: 1.75rem;
      height: 1.75rem;
      display: grid;
      place-items: center;
      border-radius: 0.45rem;
      background: #f1f5f9;
      color: #64748b;
    }

    .article-source-item-icon .export-inline-icon { width: 0.95rem; height: 0.95rem; }

    .article-source-item-content {
      min-width: 0;
      flex: 1;
    }

    .article-source-title {
      display: block;
      font-weight: 600;
      font-size: 0.875rem;
      margin-bottom: 0.26rem;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .article-source-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: #64748b;
      text-decoration: none;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .article-source-link .export-inline-icon {
      width: 0.76rem;
      height: 0.76rem;
      stroke-width: 1.75;
      margin-bottom: 0.04rem;
    }

    @media (max-width: 640px) { body { padding: 2rem 1.1rem; } .article-sources-list { grid-template-columns: 1fr; } }
    @media (min-width: 640px) { .article-sources-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
  <style>${getArticleTemplateSharedCss(".article-template-root")}</style>
</head>
<body class="article-template-root" data-article-template="${escapeHtml(template.id)}" style="${escapeHtml(articleTemplateStyle(template, {
    titleSize: typography.titleSize, titleLine: typography.titleLineHeight, subtitleSize: typography.subtitleSize,
    subtitleLine: typography.subtitleLineHeight, bodySize: typography.pSize, bodyLine: typography.lineHeight,
    fontBody: typography.fontFamily, quoteBg: typography.quote.background, quoteBorder: typography.quote.border,
    quoteText: typography.quote.text, quoteIcon: typography.quote.icon
  }))}">
  <script>
    (function() {
      const isValidExportExternalLink = (href) => /^https?:\/\//i.test(href);
      document.addEventListener("click", (event) => {
        const target = event.target.closest?.("a[href]");
        if (!target) return;
        const href = String(target.getAttribute("href") || "").trim();
        if (!href || href === "#" || !isValidExportExternalLink(href) || href === location.href) {
          if (href && href !== "#") target.setAttribute("href", "#");
          if (!href || href === "#") event.preventDefault();
          return;
        }
      }, true);
      document.querySelectorAll("iframe, frame, object, embed").forEach((node) => node.remove());
    })();
  </script>
  <article class="article-shell prose prose-slate max-w-none">
    <header>
      <h1 id="article-title">${escapeHtml(title)}</h1>
      ${article.subtitle ? `<p id="article-subtitle">${escapeHtml(article.subtitle)}</p>` : ""}
      ${metaRowHtml}
    </header>
    ${coverHtml}
    <div class="article-divider" data-article-divider></div>
    <div id="article-body-container" class="outline-none focus:ring-2 focus:ring-teal-100 rounded px-2 -mx-2">${blocksHtml}</div>
    ${sourceHtml}
  </article>
</body>
</html>`;
}
function escapeXmlText(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFallbackCoverBlob(article = {}) {
  const title = String(article.title || "Artículo educativo").trim() || "Artículo educativo";
  const subtitle = String(article.subtitle || "").trim();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" fill="none">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#bae6fd"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)" />
  <text x="64" y="332" fill="#0f172a" font-family="Arial, sans-serif" font-size="52" font-weight="700">
    ${escapeXmlText(title.slice(0, 55))}
  </text>
  <text x="64" y="392" fill="#334155" font-family="Arial, sans-serif" font-size="28">
    ${escapeXmlText(subtitle ? subtitle.slice(0, 90) : "Sin portada personalizada")}
  </text>
</svg>`;

  return {
    blob: new Blob([svg], { type: "image/svg+xml" }),
    extension: "svg"
  };
}

function articleExportFilename(title = "Artículo educativo", extension = "html") {
  const base = String(title || "articulo-educativo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "articulo-educativo";
  return `${base}.${extension}`;
}

const ARTICLE_EXPORT_AUDIENCES = [
  { id: "educators", slug: "docentes", label: "Docentes y directivos" },
  { id: "students", slug: "estudiantes", label: "Estudiantes" },
  { id: "parents", slug: "padres", label: "Padres y tutores" },
  { id: "coordinators", slug: "coordinadores", label: "Coordinadores académicos" }
];

function getSessionArticleExportEntries(session = {}) {
  const audienceCatalog = new Map(ARTICLE_EXPORT_AUDIENCES.map((audience) => [audience.id, audience]));
  const articlesByAudience = { ...(session.articlesByAudience || {}) };
  const activeId = session.audience || session.article?.audience || "educators";
  if (session.article && Array.isArray(session.article.blocks) && session.article.blocks.length > 0) {
    articlesByAudience[activeId] = session.article;
  }
  const orderedIds = [...new Set([...(session.selectedAudiences || []), ...Object.keys(articlesByAudience)])];
  return orderedIds
    .map((id, index) => {
      const article = articlesByAudience[id];
      if (!article || !Array.isArray(article.blocks) || article.blocks.length === 0) return null;
      const knownAudience = audienceCatalog.get(id);
      return {
        id,
        slug: knownAudience?.slug || slugifySeo(article.styleName || article.title || id) || `estilo-${index + 1}`,
        label: knownAudience?.label || article.audienceLabel || article.styleName || `Estilo ${index + 1}`,
        article
      };
    })
    .filter(Boolean);
}

async function fetchArticleCover(article = {}) {
  const imageUrl = String(article.featuredImage?.url || "").trim();
  if (imageUrl && imageUrl.startsWith("file://")) return buildFallbackCoverBlob(article);
  if (!imageUrl) return buildFallbackCoverBlob(article);
  try {
    if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && !imageUrl.startsWith("data:image/")) return buildFallbackCoverBlob(article);
    const response = await fetch(imageUrl, { cache: "no-store" });
    if (!response.ok) return buildFallbackCoverBlob(article);
    const blob = await response.blob();
    if (!String(blob.type || "").startsWith("image/")) return buildFallbackCoverBlob(article);
    return {
      blob,
      extension: blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png"
    };
  } catch {
    return buildFallbackCoverBlob(article);
  }
}

async function exportArticlesAsZip(session, entries = []) {
  if (typeof window.JSZip !== "function") throw new Error("El generador ZIP no está disponible.");
  if (!entries.length) throw new Error("No hay artículos para exportar.");

  const zip = new window.JSZip();
  const isSingleArticle = entries.length === 1;
  for (const entry of entries) {
    const article = entry.article || {};
    if (!Array.isArray(article.blocks) || article.blocks.length === 0) {
      throw new Error(`Falta generar el artículo para ${entry.label}.`);
    }
    const resolvedAuthor = await resolveAuthorDisplayName({ article, session, articleUid: entry.id });
    const cover = await fetchArticleCover(article);
    const htmlFilename = isSingleArticle ? "index.html" : `articulo-${entry.slug}.html`;
    const imageFilename = isSingleArticle ? `portada.${cover.extension}` : `portada-${entry.slug}.${cover.extension}`;
    const exportSession = { ...session, title: article.title || session.title, article };
    zip.file(htmlFilename, buildArticleHtmlDocument(exportSession, {
      coverSrc: `assets/${imageFilename}`,
      author: resolvedAuthor || getPrimaryAuthorFallback(article, session) || "Autor"
    }));
    zip.folder("assets").file(imageFilename, cover.blob);
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = isSingleArticle
    ? articleExportFilename(entries[0].article?.title || session.title, "zip")
    : articleExportFilename(`${session.topic || session.title}-tres-articulos`, "zip");
  link.click();
  URL.revokeObjectURL(url);
}

function getWordPressPublicationForSession(session = {}) {
  const audience = session.audience || session.article?.audience || "educators";
  return session.publicationsByAudience?.[audience] || null;
}

async function openWordPressPublicationDialog() {
  const session = getActiveSession();
  if (!session) {
    showToast("Selecciona una sesión antes de publicar.", "error");
    return;
  }
  document.getElementById("article-options-menu")?.classList.add("hidden");
  showModal({
    title: "Publicar en WordPress",
    contentHtml: `<div class="flex items-center justify-center gap-2 py-10 text-xs text-slate-500"><span class="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-700"></span>Consultando la conexión y el borrador remoto…</div>`
  });

  let status;
  try {
    status = await getWordPressStatus(session);
  } catch (error) {
    showModal({
      title: "Publicar en WordPress",
      contentHtml: `<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-relaxed text-red-800"><strong>No se pudo consultar WordPress.</strong><p class="mt-2">${escapeHtml(error.message)}</p></div>`,
      footerButtonsHtml: `<button id="wp-close-error" class="btn btn-outline h-9 px-4 text-xs">Cerrar</button>`
    });
    document.getElementById("wp-close-error")?.addEventListener("click", closeActiveModal);
    return;
  }

  const publication = status.publication || getWordPressPublicationForSession(session);
  const configured = status.configured === true;
  const remotePublished = publication?.status === "publish";
  const hasDraft = Number(publication?.remoteId || 0) > 0;
  const activeAudience = session.audience || session.article?.audience || "educators";
  const approved = Array.isArray(session.approvedAudiences) && session.approvedAudiences.includes(activeAudience);
  const stateLabel = remotePublished ? "Publicado" : hasDraft ? "Borrador remoto" : approved ? "Aprobado, listo para enviar" : "Pendiente de aprobación editorial";
  const stateClass = remotePublished
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : hasDraft ? "border-blue-200 bg-blue-50 text-blue-800" : approved ? "border-teal-200 bg-teal-50 text-teal-800" : "border-amber-200 bg-amber-50 text-amber-800";

  const modal = showModal({
    title: "Publicar en WordPress",
    widthClass: "max-w-2xl",
    contentHtml: `
      <div class="space-y-4 text-xs">
        <section class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div><span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Artículo activo</span><h4 class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(session.article?.title || session.title)}</h4></div>
            <span class="rounded-full border px-3 py-1 font-semibold ${stateClass}">${stateLabel}</span>
          </div>
        </section>
        ${configured ? `
          <section class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="flex items-center justify-between gap-3"><div><span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sitio configurado</span><p class="mt-1 font-semibold text-slate-800">${escapeHtml(status.siteHost || status.siteUrl)}</p></div><button id="wp-test-connection" class="btn btn-outline h-8 px-3 text-[11px]">Probar conexión</button></div>
          </section>
        ` : `
          <section class="rounded-xl border border-amber-200 bg-amber-50 p-4 leading-relaxed text-amber-900">
            <strong>WordPress todavía no está configurado en el servidor.</strong>
            <p class="mt-2">Crea el secreto <code>MARCIE_WORDPRESS_CONFIG_JSON</code> con la URL, el usuario técnico y su Application Password. Las credenciales no se capturan ni se guardan en este navegador.</p>
          </section>
        `}
        ${hasDraft ? `
          <section class="rounded-xl border border-slate-200 bg-white p-4">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destino remoto</span>
            <div class="mt-2 flex flex-wrap gap-2">
              ${publication.editUrl ? `<button id="wp-open-editor" class="btn btn-outline h-8 px-3 text-[11px]">Abrir editor de WordPress</button>` : ""}
              ${publication.remoteUrl ? `<button id="wp-open-public" class="btn btn-outline h-8 px-3 text-[11px]">Abrir artículo</button>` : ""}
            </div>
          </section>
        ` : ""}
        <p id="wp-publication-status" class="min-h-5 text-[11px] text-slate-500" aria-live="polite"></p>
      </div>
    `,
    footerButtonsHtml: `
      <button id="wp-close" class="btn btn-outline h-9 px-4 text-xs">Cerrar</button>
      ${configured && approved && !hasDraft ? `<button id="wp-create-draft" class="btn btn-primary h-9 px-4 text-xs">Crear borrador en WordPress</button>` : ""}
      ${configured && approved && hasDraft && !remotePublished ? `<button id="wp-publish-now" class="btn btn-primary h-9 px-4 text-xs">Publicar ahora</button>` : ""}
    `
  });

  const feedback = modal.element.querySelector("#wp-publication-status");
  const runAction = async (button, pendingText, task, successText) => {
    if (!button) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = pendingText;
    if (feedback) feedback.textContent = pendingText;
    try {
      const result = await task();
      if (result?.publication) {
        session.publicationsByAudience = { ...(session.publicationsByAudience || {}), [session.audience || "educators"]: result.publication };
      }
      showToast(successText, "success");
      await openWordPressPublicationDialog();
    } catch (error) {
      if (feedback) feedback.textContent = error.message;
      showToast(`WordPress: ${error.message}`, "error");
      button.disabled = false;
      button.textContent = original;
    }
  };

  modal.element.querySelector("#wp-close")?.addEventListener("click", closeActiveModal);
  modal.element.querySelector("#wp-open-editor")?.addEventListener("click", () => window.open(publication.editUrl, "_blank", "noopener,noreferrer"));
  modal.element.querySelector("#wp-open-public")?.addEventListener("click", () => window.open(publication.remoteUrl, "_blank", "noopener,noreferrer"));
  const testButton = modal.element.querySelector("#wp-test-connection");
  testButton?.addEventListener("click", () => runAction(testButton, "Probando…", testWordPressConnection, "Conexión con WordPress verificada."));
  const draftButton = modal.element.querySelector("#wp-create-draft");
  draftButton?.addEventListener("click", () => runAction(draftButton, "Creando borrador…", () => createWordPressDraft(session), "Borrador creado en WordPress."));
  const publishButton = modal.element.querySelector("#wp-publish-now");
  publishButton?.addEventListener("click", () => {
    if (!window.confirm("¿Publicar ahora este artículo en WordPress? Esta acción lo hará visible en el sitio.")) return;
    void runAction(publishButton, "Publicando…", () => publishWordPressArticle(session), "Artículo publicado en WordPress.");
  });
}

function updateAudienceSelector(selectedAudience = "educators") {
  dom.audienceButtons.forEach((btn) => {
    const audience = btn.getAttribute("data-audience");
    if (audience === selectedAudience) {
      btn.className = "px-3.5 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shrink-0 transition-all cursor-pointer font-bold shadow-xs flex items-center gap-1.5";
    } else {
      btn.className = "px-3.5 py-1.5 rounded-full text-slate-500 hover:bg-slate-100 border border-transparent shrink-0 transition-all cursor-pointer flex items-center gap-1.5";
    }
  });
}

const AUTOMATION_STAGE_ORDER = ["proposals", "articles", "covers", "review", "corrections"];

function stopAutomationProgressAnimations() {
  automationProgressAnimations.forEach((animation) => {
    if (typeof animation?.pause === "function") animation.pause();
    if (typeof animation?.cancel === "function") animation.cancel();
  });
  automationProgressAnimations = [];
}

function startAutomationProgressAnimations(root) {
  stopAutomationProgressAnimations();
  if (!root || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  void getAnimeModule().then(({ animate }) => {
    if (!root.isConnected) return;
    const addAnimation = (target, options) => {
      const animation = animateSpinnerTarget(animate, target, options);
      if (animation) automationProgressAnimations.push(animation);
    };
    addAnimation(root.querySelector("[data-agent-avatar]"), { translateY: [-5, 5], rotate: [-1.5, 1.5], duration: 1900, alternate: true, loop: true, ease: "inOutSine" });
    addAnimation(root.querySelector("[data-agent-orbit]"), { rotate: [0, 360], duration: 12000, loop: true, ease: "linear" });
    addAnimation(root.querySelectorAll("[data-agent-orbit] > [data-agent-orbit-label]"), { rotate: [0, -360], duration: 12000, loop: true, ease: "linear" });
    addAnimation(root.querySelector("[data-agent-orbit-reverse]"), { rotate: [360, 0], duration: 9000, loop: true, ease: "linear" });
    addAnimation(root.querySelectorAll("[data-agent-orbit-reverse] > [data-agent-orbit-label]"), { rotate: [0, 360], duration: 9000, loop: true, ease: "linear" });
    addAnimation(root.querySelectorAll("[data-agent-spark]"), { scale: [0.65, 1.25], opacity: [0.35, 1], duration: 1250, alternate: true, loop: true, ease: "inOutSine" });
    addAnimation(root.querySelector("[data-agent-bubble]"), { translateY: [0, -4], scale: [0.98, 1.015], duration: 1600, alternate: true, loop: true, ease: "inOutSine" });
    addAnimation(root.querySelectorAll("[data-automation-stage]"), { translateY: [14, 0], opacity: [0, 1], duration: 620, ease: "out(3)" });
  }).catch((error) => console.warn("[MarcieAutomation] Anime.js no disponible:", error));
}

function celebrateAutomationCompletion(root) {
  if (!root || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  void getAnimeModule().then(({ animate }) => {
    const confetti = root.querySelectorAll("[data-agent-confetti]");
    const avatar = root.querySelector("[data-agent-avatar]");
    animateSpinnerTarget(animate, confetti, { translateY: [0, 58], rotate: [0, 190], scale: [0.3, 1], opacity: [0, 1, 0], duration: 1500, ease: "out(3)" });
    animateSpinnerTarget(animate, avatar, { scale: [1, 1.13, 0.96, 1.05, 1], rotate: [0, -5, 5, 0], duration: 1050, ease: "out(3)" });
  }).catch(() => {});
}

function showAutomatedSessionProgress(session) {
  const modal = showModal({
    title: "Marcie está creando tu producción",
    widthClass: "max-w-3xl",
    onClose: stopAutomationProgressAnimations,
    contentHtml: `
      <div class="automation-agent-experience" data-automation-progress-root>
        <section class="automation-agent-stage">
          <span data-agent-spark class="automation-agent-spark is-one">✦</span>
          <span data-agent-spark class="automation-agent-spark is-two">●</span>
          <span data-agent-spark class="automation-agent-spark is-three">✦</span>
          <span data-agent-confetti class="automation-agent-confetti is-one"></span>
          <span data-agent-confetti class="automation-agent-confetti is-two"></span>
          <span data-agent-confetti class="automation-agent-confetti is-three"></span>
          <div class="automation-agent-visual">
            <div data-agent-orbit class="automation-agent-orbit is-outer" aria-hidden="true"><span data-agent-orbit-label class="automation-agent-orbit-label">Idea</span><span data-agent-orbit-label class="automation-agent-orbit-label">Texto</span><span data-agent-orbit-label class="automation-agent-orbit-label">SEO</span></div>
            <div data-agent-orbit-reverse class="automation-agent-orbit is-inner" aria-hidden="true"><span class="automation-agent-orbit-glyph">✦</span><span data-agent-orbit-label class="automation-agent-orbit-label">Imagen</span></div>
            <div data-agent-avatar class="automation-agent-avatar">
              <div class="automation-agent-halo"></div>
              <img src="/MarcieBlogEditorLogo2.png" alt="Agente editorial Marcie trabajando" />
              <span class="automation-agent-live-dot"></span>
            </div>
          </div>
          <div class="automation-agent-copy">
            <div class="automation-agent-kicker"><span></span> Agente editorial en vivo</div>
            <h4>${escapeHtml(session.topic || session.title)}</h4>
            <div data-agent-bubble class="automation-agent-bubble">
              <span class="automation-agent-bubble-face">✦</span>
              <p data-automation-message>Estoy organizando las ideas y preparando cuatro enfoques únicos...</p>
            </div>
            <div class="automation-agent-progress-meta"><span>Producción completa</span><strong data-automation-percent>0%</strong></div>
            <div class="automation-agent-progress-track"><div data-automation-bar class="automation-agent-progress-bar"></div></div>
          </div>
        </section>
        <div class="automation-agent-steps">
          ${[
            ["proposals", "✦", "Enfoques", "4 propuestas"],
            ["articles", "✎", "Artículos", "Redacción"],
            ["covers", "▧", "Portadas", "Imagen IA"],
            ["review", "◎", "Análisis", "Calidad + SEO"],
            ["corrections", "✓", "Pulido", "Corrección final"]
          ].map(([id, icon, label, caption]) => `
            <div data-automation-stage="${id}" class="automation-agent-step">
              <span data-automation-stage-icon>${icon}</span>
              <strong>${label}</strong>
              <small>${caption}</small>
            </div>
          `).join("")}
        </div>
        <div class="automation-agent-note">
          <span>☁</span><p>Puedes cerrar esta ventana. Marcie seguirá trabajando y guardará cada avance automáticamente.</p>
        </div>
      </div>
    `
  });
  startAutomationProgressAnimations(modal.element.querySelector("[data-automation-progress-root]"));
}

function updateAutomatedSessionProgress(stage, message, percent) {
  const root = document.querySelector("[data-automation-progress-root]");
  if (!root) return;
  const currentIndex = AUTOMATION_STAGE_ORDER.indexOf(stage);
  const messageNode = root.querySelector("[data-automation-message]");
  const percentNode = root.querySelector("[data-automation-percent]");
  const bar = root.querySelector("[data-automation-bar]");
  if (messageNode) messageNode.textContent = message;
  if (percentNode) percentNode.textContent = `${percent}%`;
  if (bar) bar.style.width = `${percent}%`;
  root.querySelectorAll("[data-automation-stage]").forEach((node) => {
    const index = AUTOMATION_STAGE_ORDER.indexOf(node.getAttribute("data-automation-stage"));
    const icon = node.querySelector("[data-automation-stage-icon]");
    const completed = index < currentIndex || percent === 100;
    const active = index === currentIndex && percent < 100;
    node.classList.toggle("is-complete", completed);
    node.classList.toggle("is-active", active);
    if (icon) {
      if (completed) icon.textContent = "✓";
    }
  });
  if (percent === 100 && !root.dataset.celebrated) {
    root.dataset.celebrated = "true";
    celebrateAutomationCompletion(root);
  }
}

async function saveAutomationStage(session, stage, progress, message) {
  session.automation = {
    ...(session.automation || {}),
    mode: "automated",
    status: progress >= 100 ? "completed" : "running",
    stage,
    progress,
    message,
    updatedAt: new Date().toISOString()
  };
  updateAutomatedSessionProgress(stage, message, progress);
  setSyncStatus(message);
  await saveMarcieSession(session);
}

const AUTOMATED_COVER_GAP_MS = 20_000;
const AUTOMATED_COVER_RETRY_DELAY_MS = 30_000;

function waitForAutomatedCover(delayMs) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
}

async function generateAutomatedCoverWithRetry(options, onQuotaWait) {
  try {
    return await generateArticleImageWithGemini(options);
  } catch (error) {
    if (Number(error?.status) !== 429) throw error;
    if (typeof onQuotaWait === "function") onQuotaWait(AUTOMATED_COVER_RETRY_DELAY_MS);
    await waitForAutomatedCover(AUTOMATED_COVER_RETRY_DELAY_MS);
    return generateArticleImageWithGemini(options);
  }
}

async function runAutomatedSessionWorkflow(session, specifications = []) {
  const toneSpecifications = specifications
    .filter((item) => String(item || "").toLowerCase().startsWith("#tono "))
    .map((item) => String(item).replace(/^#tono\s+/i, "").trim())
    .filter(Boolean);
  const toneInstruction = toneSpecifications.length
    ? `\nTonos transversales obligatorios: ${toneSpecifications.join(", ")}. Conserva estos tonos en los cuatro enfoques y adáptalos sin perder su esencia: para docentes, voz de colega experto; para estudiantes, lenguaje directo y motivador sin infantilizar; para familias, voz clara, empática y práctica; para coordinadores, voz estratégica, institucional y accionable.`
    : "";
  const specificationText = specifications.length
    ? `\nEspecificaciones obligatorias del usuario:\n${specifications.map((item) => `- ${item}`).join("\n")}${toneInstruction}`
    : toneInstruction;
  const selectedAudienceIds = Array.isArray(session.selectedAudiences) && session.selectedAudiences.length
    ? session.selectedAudiences
    : ["educators", "students", "parents", "coordinators"];
  const audiences = ARTICLE_EXPORT_AUDIENCES.filter(({ id }) => selectedAudienceIds.includes(id));
  try {
    if (sessionUsesAida(session) && session.trends?.[0]?.editorialMode !== "aida") {
      await saveAutomationStage(session, "proposals", 4, "Construyendo la investigación integral Aida...");
      await runTrendSearchForSession({
        session,
        topic: session.topic || session.title,
        country: session.researchRegion || "MX",
        period: session.researchPeriod || "6m"
      });
    }
    await saveAutomationStage(session, "proposals", 8, `Generando ${audiences.length} propuesta(s) ${sessionUsesAida(session) ? "Aida" : "de enfoque"}...`);
    const proposalResponse = await generateProposalsForMode({
      session,
      topic: session.topic,
      signals: toneInstruction ? [...specifications, toneInstruction.trim()] : specifications,
      onResearchProgress: async ({ proposal, index, total }) => {
        updateAutomatedSessionProgress("proposals", `Investigando propuesta ${index + 1}/${total}: ${proposal.audienceLabel || proposal.audience}...`, 10 + Math.round(((index + 1) / total) * 8));
        await saveMarcieSession(session);
      }
    });
    const proposals = Array.isArray(proposalResponse?.proposals) ? proposalResponse.proposals : [];
    if (proposals.length < audiences.length) throw new Error("Gemini no devolvió una propuesta para cada público seleccionado.");
    session.proposals = proposals;
    session.status = "proposal_ready";
    await saveAutomationStage(session, "articles", 20, `Propuestas listas. Comenzando la redacción de ${audiences.length} artículos...`);

    const articlesByAudience = {};
    try {
      for (let index = 0; index < audiences.length; index += 1) {
        const audience = audiences[index];
        const proposal = proposals.find((item) => item.audience === audience.id) || proposals[index];
        session.audience = audience.id;
        window.__marcieShowArticleGenerationSpinner?.(session, {
          current: index + 1,
          total: audiences.length,
          audienceLabel: audience.label,
          message: `Marcie está redactando el enfoque para ${audience.label.toLowerCase()} y organizando sus fuentes.`
        });
        updateAutomatedSessionProgress("articles", `Redactando ${index + 1}/${audiences.length}: ${audience.label}...`, 25 + index * 9);
        const article = await draftArticleForMode({
          session,
          title: proposal.title || session.topic,
          topic: session.topic,
          audience: audience.id,
          brief: `${proposal.brief || proposal.angle || session.topic}${specificationText}`
        });
        article.automationSpecifications = [...specifications];
        articlesByAudience[audience.id] = article;
        session.articlesByAudience = articlesByAudience;
        session.article = article;
        await saveMarcieSession(session);
      }
    } finally {
      window.__marcieHideArticleGenerationSpinner?.();
    }

    session.articlesByAudience = articlesByAudience;
    await saveAutomationStage(session, "covers", 50, `Artículos listos. Generando ${audiences.length} portadas, una por una...`);
    const coverErrors = [];
    for (let index = 0; index < audiences.length; index += 1) {
      const audience = audiences[index];
      if (index > 0) {
        updateAutomatedSessionProgress("covers", `Esperando antes de la portada ${index + 1}/${audiences.length} para proteger la cuota de Gemini...`, 52 + index * 4);
        await waitForAutomatedCover(AUTOMATED_COVER_GAP_MS);
      }
      updateAutomatedSessionProgress("covers", `Creando portada ${index + 1}/${audiences.length}: ${audience.label}...`, 54 + index * 4);
      try {
        articlesByAudience[audience.id].featuredImage = await generateAutomatedCoverWithRetry({
          article: articlesByAudience[audience.id],
          sessionId: session.id,
          approachId: audience.id,
          approachLabel: audience.label
        }, (retryDelayMs) => {
          updateAutomatedSessionProgress("covers", `Cuota temporal alcanzada para ${audience.label}. Reintentando en ${Math.round(retryDelayMs / 1000)} segundos...`, 54 + index * 4);
        });
      } catch (error) {
        coverErrors.push(`${audience.label}: ${error.message}`);
        console.error(`[MarcieBlogEditor] Error al generar portada automatizada para ${audience.id}:`, error);
      }
      session.articlesByAudience = articlesByAudience;
      session.article = articlesByAudience[audience.id];
      session.audience = audience.id;
      await saveMarcieSession(session);
    }

    await saveAutomationStage(session, "review", 74, "Analizando calidad, tono, SEO y hallazgos por audiencia...");
    const auditsByAudience = {};
    for (let index = 0; index < audiences.length; index += 1) {
      const audience = audiences[index];
      updateAutomatedSessionProgress("review", `Analizando ${index + 1}/${audiences.length}: ${audience.label}...`, 76 + index * 4);
      auditsByAudience[audience.id] = await runSessionReview(session, articlesByAudience[audience.id], audience.id);
      await saveMarcieSession(session);
    }

    await saveAutomationStage(session, "corrections", 87, "Corrigiendo automáticamente los hallazgos detectados...");
    for (let index = 0; index < audiences.length; index += 1) {
      const audience = audiences[index];
      const audit = auditsByAudience[audience.id] || {};
      const issues = Array.isArray(audit.issues) ? audit.issues : [];
      updateAutomatedSessionProgress("corrections", `Corrigiendo ${index + 1}/${audiences.length}: ${audience.label}...`, 89 + index * 3);
      if (!issues.length) continue;
      const previousArticle = articlesByAudience[audience.id];
      const correctionBrief = `Corrige de forma explícita los siguientes hallazgos sin perder el enfoque, las fuentes válidas ni la estructura del artículo:\n${issues.map((issue) => `- ${issue.message || issue.type}: ${issue.suggestion || "Corregir"}`).join("\n")}${specificationText}`;
      const correctedArticle = await draftArticleForMode({
        session,
        title: previousArticle.title,
        topic: session.topic,
        audience: audience.id,
        brief: correctionBrief
      });
      correctedArticle.featuredImage = previousArticle.featuredImage;
      correctedArticle.templateId = previousArticle.templateId;
      correctedArticle.appearance = previousArticle.appearance;
      correctedArticle.automationSpecifications = [...specifications];
      articlesByAudience[audience.id] = correctedArticle;
      auditsByAudience[audience.id] = await runSessionReview(session, correctedArticle, audience.id);
      await saveMarcieSession(session);
    }

    const remainingFindings = Object.values(auditsByAudience).reduce((total, audit) => total + (Array.isArray(audit?.issues) ? audit.issues.length : 0), 0);
    const evidenceBlockers = audiences.flatMap(({ id }) => articleVerificationBlockers(articlesByAudience[id] || {}, { editorialMode: session.editorialMode }).map((reason) => `${id}: ${reason}`));
    session.articlesByAudience = articlesByAudience;
    session.auditsByAudience = auditsByAudience;
    session.audience = audiences[0]?.id || "educators";
    session.article = articlesByAudience[session.audience];
    session.audit = auditsByAudience[session.audience];
    session.status = remainingFindings || evidenceBlockers.length ? "review_required" : "approved";
    session.approvedAudiences = remainingFindings || evidenceBlockers.length ? [] : audiences.map((audience) => audience.id);
    if (!remainingFindings && !evidenceBlockers.length) {
      audiences.forEach(({ id }) => {
        articlesByAudience[id].approval = { approvedAt: new Date().toISOString(), contentHash: articlesByAudience[id].verification?.contentHash || "", articleVersion: session.updatedAt || "" };
      });
    }
    session.automation = {
      ...(session.automation || {}),
      status: remainingFindings || coverErrors.length ? "completed_with_findings" : "completed",
      stage: "corrections",
      progress: 100,
      message: remainingFindings
        ? `Automatización terminada con ${remainingFindings} hallazgos pendientes.`
        : coverErrors.length
          ? `Automatización terminada con ${coverErrors.length} portada(s) pendiente(s); pueden reintentarse individualmente.`
          : "Producción editorial completada con sus portadas.",
      coverErrors,
      remainingFindings,
      completedAt: new Date().toISOString()
    };
    await saveMarcieSession(session);
    updateAutomatedSessionProgress("corrections", session.automation.message, 100);
    setSyncStatus("🟢 Automatización sincronizada con Firebase");
    renderSessionList();
    renderActiveSession();
    showToast(session.automation.status === "completed" ? "Sesión automatizada completada." : session.automation.message, session.automation.status === "completed" ? "success" : "warning");
  } catch (error) {
    session.automation = {
      ...(session.automation || {}),
      status: "failed",
      message: error.message,
      failedAt: new Date().toISOString()
    };
    await saveMarcieSession(session).catch(() => {});
    updateAutomatedSessionProgress(session.automation.stage || "proposals", `La automatización se detuvo: ${error.message}`, session.automation.progress || 0);
    throw error;
  }
}

async function createEditorialSessionFromModal({ defaultValue = "", allowBlankSession = true, sourceTrend = null } = {}) {
  const editorialProfiles = await listEditorialProfilesOnce().catch(() => []);
  const request = await showNewSessionModal({
    defaultValue,
    allowBlankSession,
    freeModeDefault: getActiveMarciePromptProfileId() === FREE_PROMPT_PROFILE_ID,
    activePromptProfileId: getActiveMarciePromptProfileId(),
    promptProfiles: listMarciePromptProfiles().map(({ id, name }) => ({ id, name })),
    editorialProfiles,
    onRefineTopic: (topic, specifications, editorialMode, editorialProfileSnapshot) => refineTopicForMode({ editorialMode, editorialProfileSnapshot, topic, specifications })
  });
  if (!request) return null;

  if (request.mode === "automated") {
    setActiveMarciePromptProfile(request.promptProfileId || DEFAULT_PROMPT_PROFILE_ID);
  }
  if (request.editorialMode === "custom") {
    const savedProfile = await saveEditorialProfile({ ...(request.editorialProfileSnapshot || {}), id: request.editorialProfileSnapshot?.id || undefined });
    request.editorialProfileId = savedProfile.id;
    request.editorialProfileVersion = savedProfile.version;
    request.editorialProfileSnapshot = savedProfile;
  }

  const title = request.title;
  const topic = request.topic;
  const initialAudience = request.selectedAudiences?.[0] || (request.editorialMode === "aida" ? "parents" : "educators");
  const trendSnapshot = sourceTrend ? { ...sourceTrend, sources: [] } : null;
  const initialStatus = trendSnapshot ? "trends_ready" : "new";
  const initialArticle = {
    schemaVersion: "1.0",
    title,
    subtitle: trendSnapshot?.summary || "",
    audience: initialAudience,
    blocks: [],
    sources: [],
    researchSources: [],
    editorialMode: request.editorialMode || "marcie",
    modeCompatibility: request.editorialMode === "aida" ? "empty" : "compatible",
    seo: { title, description: trendSnapshot?.summary || "", keywords: [], slug: "" }
  };
  const automation = request.mode === "automated"
    ? { mode: "automated", promptMode: request.freeMode ? "free" : "configured", promptProfileId: request.promptProfileId || DEFAULT_PROMPT_PROFILE_ID, status: "queued", stage: "proposals", progress: 0 }
    : null;
  const sessionPayload = {
    title,
    topic,
    status: initialStatus,
    audience: initialAudience,
    article: initialArticle,
    specifications: request.specifications,
    editorialMode: request.editorialMode || "marcie",
    editorialProfileId: request.editorialProfileId || request.editorialMode || "marcie",
    editorialProfileVersion: request.editorialProfileVersion || 1,
    editorialProfileSnapshot: request.editorialProfileSnapshot || { name: "Marcie" },
    selectedAudiences: request.selectedAudiences || ["educators", "students", "parents", "coordinators"],
    automation,
    trends: trendSnapshot ? [trendSnapshot] : [],
    log: trendSnapshot ? [{ id: `log-${Date.now()}`, at: new Date().toISOString(), message: `Sesión creada desde el radar: ${String(sourceTrend.topic || sourceTrend.title || title)}` }] : []
  };

  setSyncStatus("Creando sesión en Firebase...");
  const newId = await createMarcieSession(sessionPayload);
  const now = Date.now();
  const localSession = {
    id: newId,
    ...sessionPayload,
    articlesByAudience: { [initialAudience]: initialArticle },
    createdAt: now,
    updatedAt: now
  };
  appState.sessions = [localSession, ...appState.sessions.filter((session) => session.id !== newId)];
  appState.activeSessionId = newId;
  appState.currentTab = "article";
  renderSessionList();
  renderActiveSession();
  setSyncStatus("🟢 Sincronizado con Firebase");

  if (request.mode === "automated") {
    showAutomatedSessionProgress(localSession);
    await runAutomatedSessionWorkflow(localSession, request.specifications);
  } else if (trendSnapshot) {
    setSyncStatus("Generando propuestas desde la tendencia...");
    try {
      const proposalResponse = await generateProposalsForMode({
        session: localSession,
        topic,
        signals: Array.isArray(trendSnapshot.signals) ? trendSnapshot.signals : []
      });
      localSession.proposals = Array.isArray(proposalResponse?.proposals) ? proposalResponse.proposals : [];
      localSession.status = localSession.proposals.length ? "proposal_ready" : "trends_ready";
      await saveMarcieSession(localSession);
      renderSessionList();
      renderActiveSession();
      setSyncStatus("🟢 Sesión y propuestas sincronizadas");
      showToast(localSession.proposals.length ? "Sesión creada con propuestas editoriales." : "Sesión creada con la tendencia seleccionada.", "success");
    } catch (error) {
      console.error("[MarcieBlogEditor] No se pudieron generar propuestas desde el radar:", error);
      setSyncStatus("🟡 Sesión creada; propuestas pendientes");
      showToast("La sesión se creó con la tendencia, pero las propuestas deben reintentarse.", "warning");
    }
  } else {
    showToast(request.mode === "blank" ? "Sesión en blanco creada." : "Sesión creada exitosamente", "success");
  }

  return newId;
}

function setupEventListeners() {
  document.getElementById("btn-ai-assistant-header")?.addEventListener("click", () => {
    openAiAssistantModal({ getActiveSession, onRefresh: renderActiveSession });
  });

  dom.btnSourceCitationFormat?.addEventListener("click", async () => {
    const session = getActiveSession();
    if (!session?.article) return;
    const sources = getArticleExportSources(session.article);
    if (!sources.length) {
      showToast("Este artículo todavía no tiene fuentes consultadas.", "info");
      return;
    }
    const nextStyle = isSourceCitationFormatApa(session.article) ? "default" : "apa";
    session.article.sourceCitationStyle = nextStyle;
    session.article.sourceCitationFormat = nextStyle;
    if (!session.articlesByAudience) session.articlesByAudience = {};
    session.articlesByAudience[session.audience || session.article.audience || "educators"] = session.article;
    try {
      await saveMarcieSession(session);
      renderActiveSession();
      showToast(nextStyle === "apa" ? "Fuentes mostradas en formato APA." : "Fuentes mostradas en formato estándar.", "success");
    } catch (error) {
      showToast(`No se pudo guardar el formato de fuentes: ${error.message}`, "error");
    }
  });

  // Toggle del sub-header de pestañas y audiencia
  const btnToggleSubheader = document.getElementById("btn-toggle-subheader");
  const centerSubheader = document.getElementById("center-subheader");
  if (btnToggleSubheader && centerSubheader) {
    // Configurar transición y overflow antes de medir
    centerSubheader.style.overflow = "hidden";
    centerSubheader.style.transition = "max-height 0.25s ease, padding 0.25s ease, border 0.25s ease";

    // Medir la altura real del contenido y fijar como inicial
    const naturalHeight = centerSubheader.scrollHeight;
    centerSubheader.style.maxHeight = naturalHeight + "px";

    btnToggleSubheader.addEventListener("click", () => {
      const isCollapsed = centerSubheader.classList.contains("collapsed-subheader");
      if (isCollapsed) {
        // Expandir: usar scrollHeight real en el momento de abrir
        const openHeight = centerSubheader.scrollHeight;
        centerSubheader.style.maxHeight = Math.max(openHeight, 56) + "px";
        centerSubheader.style.paddingTop = "";
        centerSubheader.style.paddingBottom = "";
        centerSubheader.style.borderBottomWidth = "";
        centerSubheader.classList.remove("collapsed-subheader");
        btnToggleSubheader.title = "Ocultar opciones";
        // Después de la transición, quitar maxHeight fijo para dejar fluir el contenido
        setTimeout(() => {
          if (!centerSubheader.classList.contains("collapsed-subheader")) {
            centerSubheader.style.maxHeight = "none";
          }
        }, 280);
      } else {
        // Colapsar: primero fijar la altura actual para que la transición funcione
        centerSubheader.style.maxHeight = centerSubheader.scrollHeight + "px";
        // Forzar reflow
        centerSubheader.getBoundingClientRect();
        centerSubheader.style.maxHeight = "0px";
        centerSubheader.style.paddingTop = "0";
        centerSubheader.style.paddingBottom = "0";
        centerSubheader.style.borderBottomWidth = "0";
        centerSubheader.classList.add("collapsed-subheader");
        btnToggleSubheader.title = "Mostrar opciones";
      }
    });
  }

  // Búsqueda local de sesiones
  const btnToggleSearch = document.getElementById("btn-toggle-search");
  const searchContainer = document.getElementById("session-search-container");
  if (btnToggleSearch && searchContainer) {
    btnToggleSearch.addEventListener("click", () => {
      searchContainer.classList.toggle("hidden");
      if (!searchContainer.classList.contains("hidden") && dom.sessionSearch) {
        dom.sessionSearch.focus();
      }
    });
  }

  // Alternar vista de archivados
  const btnArchiveSessions = document.getElementById("btn-archive-sessions");
  if (btnArchiveSessions) {
    btnArchiveSessions.addEventListener("click", () => {
      appState.showArchived = !appState.showArchived;
      if (appState.showArchived) {
        btnArchiveSessions.classList.add("bg-slate-200", "text-slate-800");
      } else {
        btnArchiveSessions.classList.remove("bg-slate-200", "text-slate-800");
      }
      renderSessionList();
    });
  }

  if (dom.sessionSearch) {
    dom.sessionSearch.addEventListener("input", (e) => {
      appState.searchQuery = e.target.value;
      renderSessionList();
    });
  }

  // Filtros de estado (Todos, Recientes, Borradores, En revisión, Publicados)
  dom.filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      dom.filterButtons.forEach((b) => {
        b.className = "session-filter-tab w-full min-w-0 px-1.5 py-1.5 text-[10px] tracking-wide font-medium transition-all cursor-pointer";
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });

      const filter = btn.getAttribute("data-filter") || "all";
      btn.className = "session-filter-tab is-active w-full min-w-0 px-1.5 py-1.5 text-[10px] tracking-wide font-bold shadow-xs transition-all cursor-pointer";
      btn.setAttribute("aria-pressed", "true");

      appState.filter = filter;
      renderSessionList();
    });
  });

  // Botón nueva sesión
  if (dom.btnNewSession) {
    dom.btnNewSession.addEventListener("click", async () => {
      try {
        await createEditorialSessionFromModal({ allowBlankSession: true });
      } catch (error) {
        console.error("Error al crear sesión:", error);
        setSyncStatus("⚠️ Error al crear sesión", true);
      }
    });
  }

  // Botón "Ver todas las sesiones"
  if (dom.btnSeeMoreSessions) {
    dom.btnSeeMoreSessions.addEventListener("click", () => {
      openCommandPalette({
        getSessions: getAllSessions,
        onSelectSession: (id) => {
          appState.activeSessionId = id;
          renderSessionList();
          renderActiveSession();
        },
        onRefresh: () => {
          renderSessionList();
          renderActiveSession();
        }
      });
    });
  }

  // Control cíclico de vistas: Artículo → Vista estructurada → SEO
  if (dom.btnCycleView) {
    const views = [
      { id: "article", label: "Artículo", color: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100" },
      { id: "structured", label: "Vista estructurada", color: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
      { id: "seo", label: "SEO", color: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" }
    ];
    const baseClass = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2";

    dom.btnCycleView.addEventListener("click", () => {
      const currentIndex = Math.max(0, views.findIndex((view) => view.id === appState.currentTab));
      const nextView = views[(currentIndex + 1) % views.length];
      const followingView = views[(currentIndex + 2) % views.length];
      appState.currentTab = nextView.id;

      dom.btnCycleView.dataset.currentView = nextView.id;
      dom.btnCycleView.className = `${baseClass} ${nextView.color}`;
      dom.btnCycleView.title = `${nextView.label} · Cambiar a ${followingView.label}`;
      dom.btnCycleView.setAttribute("aria-label", `Vista actual: ${nextView.label}. Cambiar a ${followingView.label}`);

      if (dom.articleView) dom.articleView.classList.toggle("hidden", nextView.id !== "article");
      if (dom.structuredView) dom.structuredView.classList.toggle("hidden", nextView.id !== "structured");
      if (dom.seoView) dom.seoView.classList.toggle("hidden", nextView.id !== "seo");
      renderActiveSession();
    });
  }

  // Selector de audiencia (Conmuta el artículo específico por audiencia)
  dom.audienceButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const audience = btn.getAttribute("data-audience");
      const session = getActiveSession();
      if (!session) return;

      session.audience = audience;
      if (!session.articlesByAudience) session.articlesByAudience = {};

      const audLabel = audience === "educators"
        ? "Docentes y directivos"
        : audience === "students"
          ? "Estudiantes"
          : audience === "coordinators"
            ? "Coordinadores académicos y directivos escolares"
            : "Padres y tutores";
      updateAudienceSelector(audience);

      // Si ya existe el artículo redactado para esta audiencia, conmutarlo inmediatamente
      if (session.articlesByAudience[audience] && session.articlesByAudience[audience].blocks?.length > 0) {
        session.article = session.articlesByAudience[audience];
        if (session.article.title) session.title = session.article.title;
        setSyncStatus("Guardando cambios...");

        try {
          await saveMarcieSession(session);
          setSyncStatus("🟢 Sincronizado con Firebase");
          showToast(`✨ Enfoque activo: ${audLabel}`, "success");
          renderActiveSession();
          renderSessionList();
        } catch (err) {
          console.error("Error al guardar audiencia:", err);
          setSyncStatus("⚠️ Error al guardar", true);
        }
      } else {
        // Generar en tiempo real el artículo específico calibrado con PNL para la nueva audiencia
        setSyncStatus(`Redactando para ${audLabel}...`);
        appState.isGeneratingArticle = true;
        if (session) {
          session.status = "drafting";
        }
        renderActiveSession();

        try {
          const generated = await draftArticleForMode({
            session,
            title: session.title,
            topic: session.topic || session.title,
            audience: audience
          });

          session.articlesByAudience[audience] = generated;
          session.article = generated;
          if (generated.title) session.title = generated.title;
          session.status = "review_required";
          appState.isGeneratingArticle = false;
          await saveMarcieSession(session);
          setSyncStatus("🟢 Sincronizado con Firebase");
          showToast(`✨ Artículo redactado con PNL para ${audLabel}.`, "success");
          renderActiveSession();
          renderSessionList();
        } catch (err) {
          console.error("Error al generar artículo para la audiencia seleccionada:", err);
          setSyncStatus("⚠️ Error al generar", true);
          showToast(`Error al redactar: ${err.message}`, "error");
          appState.isGeneratingArticle = false;
          renderActiveSession();
        } finally {
          if (appState.isGeneratingArticle) {
            appState.isGeneratingArticle = false;
          }
        }
      }
    });
  });

  // Copiar artículo
  if (dom.btnCopyArticle) {
    dom.btnCopyArticle.addEventListener("click", () => {
      const session = getActiveSession();
      if (!session) return;
      const text = `${session.title}\n\n${(session.article?.blocks || []).map((b) => b.text || "").join("\n\n")}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast("Artículo copiado al portapapeles", "success");
      });
    });
  }

  // Compartir artículo
  if (dom.btnShareArticle) {
    dom.btnShareArticle.addEventListener("click", () => {
      const session = getActiveSession();
      if (!session) return;
      showModal({
        title: "Compartir Artículo",
        contentHtml: `
          <div class="flex flex-col gap-3">
            <p class="text-xs text-slate-500">Enlace de lectura para el artículo seleccionado:</p>
            <div class="flex gap-2">
              <input type="text" class="input-field text-xs" readonly value="${window.location.origin}/MarcieBlogEditor.html?session=${session.id}" />
            </div>
            <p class="text-[11px] text-slate-400">Solo usuarios con acceso autorizado pueden revisar y editar este contenido.</p>
          </div>
        `,
        footerButtonsHtml: `
          <button class="btn btn-primary h-8 px-4 text-xs" onclick="navigator.clipboard.writeText(window.location.href); alert('Enlace copiado');">Copiar Enlace</button>
        `
      });
    });
  }

  // Fullscreen de artículo
  const btnFullscreen = document.getElementById("btn-fullscreen-article");
  const marcieAppRoot = document.getElementById("marcieAppRoot");
  if (btnFullscreen && marcieAppRoot) {
    btnFullscreen.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        marcieAppRoot.requestFullscreen().catch(err => {
          console.error("Error al entrar a pantalla completa:", err);
        });
      } else {
        document.exitFullscreen();
      }
    });

    document.addEventListener("fullscreenchange", () => {
      const isMarcieFullscreen = document.fullscreenElement === marcieAppRoot;
      btnFullscreen.title = isMarcieFullscreen ? "Salir de pantalla completa" : "Pantalla completa";
      btnFullscreen.setAttribute("aria-label", isMarcieFullscreen
        ? "Salir de pantalla completa"
        : "Abrir pantalla completa incluyendo el header");
      btnFullscreen.innerHTML = `<i data-lucide="${isMarcieFullscreen ? "minimize" : "maximize"}" class="w-4 h-4"></i>`;
      if (window.lucide?.createIcons) window.lucide.createIcons();
    });
  }

  // Toggle Panel Derecho (Asistente IA)
  const btnToggleRightPanelFs = document.getElementById("btn-toggle-right-panel-fullscreen");
  const rightPanel = document.getElementById("right-panel");
  const rightResizer = document.getElementById("right-resizer");

  const toggleRightPanel = () => {
    if(rightPanel) rightPanel.classList.toggle("hidden");
    if(rightResizer) rightResizer.classList.toggle("hidden");
  };

  if (btnToggleRightPanelFs) btnToggleRightPanelFs.addEventListener("click", toggleRightPanel);

  // Menú de opciones del Top Header (Dropdown 3 puntos)
  const btnHeaderOptions = document.getElementById("btn-header-options");
  const headerOptionsMenu = document.getElementById("header-options-menu");
  if (btnHeaderOptions && headerOptionsMenu) {
    btnHeaderOptions.addEventListener("click", (e) => {
      e.stopPropagation();
      headerOptionsMenu.classList.toggle("hidden");
    });

    // Cerrar al hacer clic fuera
    document.addEventListener("click", (e) => {
      if (!headerOptionsMenu.contains(e.target) && e.target !== btnHeaderOptions && !btnHeaderOptions.contains(e.target)) {
        headerOptionsMenu.classList.add("hidden");
      }
    });
  }

  updateGeminiModelBadge();
  document.getElementById("opt-gemini-model")?.addEventListener("click", () => {
    headerOptionsMenu?.classList.add("hidden");
    openGeminiModelSettings();
  });

  // Modal de ayuda del Asistente
	  const btnHelpAssistant = document.getElementById("btn-help-assistant");
  if (btnHelpAssistant) {
    btnHelpAssistant.addEventListener("click", () => {
      const guideStepDefs = {
        1: { color: "teal",    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>` },
        2: { color: "blue",    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 17l4-8 4 4 4-6 4 4"/><path stroke-linecap="round" stroke-linejoin="round" d="M3 17h18"/></svg>` },
        3: { color: "purple",  icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 5.5-3 7H8c-.5-1.5-3-3.5-3-7a7 7 0 0 1 7-7z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 21h6m-6-3h6"/></svg>` },
        4: { color: "amber",   icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>` },
        5: { color: "rose",    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>` }
      };

      showModal({
        title: "Guía del Asistente Editorial",
        widthClass: "max-w-2xl",
        contentHtml: `
          <div class="editorial-guide-modal-marker flex flex-col gap-6">

            <p class="text-xs text-slate-500 leading-relaxed">
              El flujo editorial se completa en <strong class="text-slate-700">3 etapas</strong>. Selecciona cada etapa para ver qué hace y cómo usarla.
            </p>

            <!-- Línea de tiempo horizontal -->
            <div class="relative">
              <!-- Línea conectora -->
              <div class="absolute top-5 left-0 right-0 h-[2px] bg-slate-200 z-0 mx-[10%]"></div>
              <div id="guide-progress-line" class="absolute top-5 left-[10%] h-[2px] bg-gradient-to-r from-teal-400 to-purple-500 z-0 transition-all duration-500" style="width:0%"></div>

              <!-- Bolitas de pasos -->
              <div class="relative z-10 flex justify-between px-[6%]">
                ${[
                  { n:1, label:"Investigar", color:"bg-teal-500", svg:EDITORIAL_MERGED_STEP_DEFS[1].icon },
                  { n:2, label:"Crear y analizar", color:"bg-purple-500", svg:EDITORIAL_MERGED_STEP_DEFS[2].icon },
                  { n:3, label:"Exportar", color:"bg-rose-500", svg:EDITORIAL_MERGED_STEP_DEFS[3].icon },
                ].map(s => `
                  <button data-guide-step="${s.n}" class="guide-step-btn flex flex-col items-center gap-2 group focus:outline-none">
                    <div class="w-10 h-10 rounded-full ${s.color} text-white flex items-center justify-center shadow-md ring-4 ring-white transition-all duration-200">
                      ${s.svg}
                    </div>
                    <span class="text-[10px] font-semibold text-slate-500 group-hover:text-slate-800 transition-colors whitespace-nowrap">${s.label}</span>
                  </button>
                `).join("")}
              </div>
            </div>

            <!-- Panel de detalle del paso -->
            <div id="guide-step-detail" class="min-h-[120px] rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 transition-all duration-300 shadow-sm">
              <p class="text-xs text-slate-400 text-center mt-6">Selecciona un paso para ver su descripción</p>
            </div>

            <p class="text-xs text-slate-400 text-center">Puedes editar el texto final manualmente haciendo clic sobre cualquier bloque del artículo.</p>
          </div>
        `,
        footerButtonsHtml: `
          <button class="btn btn-outline h-9 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Cerrar</button>
          <button class="btn btn-primary h-9 px-6 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">¡Entendido!</button>
        `
      });

      // Iconos SVG por paso (para el panel de detalle)
      const stepIcons = {
        1: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>`,
        2: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 17l4-8 4 4 4-6 4 4"/><path stroke-linecap="round" stroke-linejoin="round" d="M3 17h18"/></svg>`,
        3: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 5.5-3 7H8c-.5-1.5-3-3.5-3-7a7 7 0 0 1 7-7z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 21h6m-6-3h6"/></svg>`,
        4: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
        5: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>`,
      };

      // Datos de cada paso
      const stepData = {
        1: {
          color:   "teal",
          title:   "Paso 1 — Buscar tendencias",
          desc:    "Ingresa un tema educativo. El asistente escaneará datos recientes de Google Trends, X (Twitter) y foros académicos para detectar señales con alta demanda y relevancia editorial.",
          tips:    ["Usa términos amplios como «IA en aulas» o «evaluación formativa».", "El sistema calcula un TrendScore de 0–100 basado en crecimiento, frescura y diversidad de fuentes.", "Puedes cambiar la región y el periodo de análisis."],
          badge:   "Punto de inicio"
        },
        2: {
          color:   "blue",
          title:   "Paso 2 — Analizar contexto",
          desc:    "El asistente procesa las señales encontradas y genera un diagnóstico editorial profundo: detecta ángulos pedagógicos, audiencias potenciales y la competencia de contenido existente.",
          tips:    ["El análisis considera el nivel educativo y el tipo de institución.", "Identifica brechas de contenido en el mercado editorial."],
          badge:   "Diagnóstico"
        },
        3: {
          color:   "purple",
          title:   "Paso 3 — Crear propuestas",
          desc:    "Genera hasta 4 propuestas de artículo con diferentes enfoques para docentes, estudiantes, familias y coordinadores académicos. Incluye título, subtítulo, estructura y ángulo diferenciador.",
          tips:    ["Cambia la audiencia en la barra superior antes de generar.", "Puedes seleccionar una propuesta como base y redactar el artículo completo.", "Las propuestas respetan el brief editorial de tu institución."],
          badge:   "Creatividad"
        },
        4: {
          color:   "amber",
          title:   "Paso 4 — Auditoría y Revisión",
          desc:    "El asistente analiza el artículo redactado y genera un informe con: puntaje de legibilidad, densidad de keywords, tono pedagógico y sugerencias de mejora clasificadas por prioridad.",
          tips:    ["La auditoría se guarda automáticamente aunque no apruebes el artículo.", "Puedes re-auditar en cualquier momento desde el mismo paso.", "Los hallazgos se agrupan por severidad: alta, media y baja."],
          badge:   "Control de calidad"
        },
        5: {
          color:   "rose",
          title:   "Paso 5 — Exportar y Publicar",
          desc:    "Descarga el artículo finalizado en Markdown, cópialo en HTML limpio o comparte un enlace. También puedes marcarlo como «Publicado» en tu biblioteca de sesiones.",
          tips:    ["El Markdown es compatible con Notion, Ghost, WordPress y la mayoría de CMS.", "El JSON estructurado incluye metadatos SEO, fuentes y bloques tipados."],
          badge:   "Publicación"
        }
      };

      const colorMap = {
        teal:   { bg: "bg-gradient-to-br from-teal-50/75 to-white",   border: "border-teal-200",   title: "text-teal-900",  badge: "bg-teal-100 text-teal-700", dot: "bg-teal-400", iconBg: "bg-teal-500", titleBar: "bg-teal-50 border-teal-100" },
        blue:   { bg: "bg-gradient-to-br from-blue-50/75 to-white",   border: "border-blue-200",   title: "text-blue-900",   badge: "bg-blue-100 text-blue-700",  dot: "bg-blue-400",  iconBg: "bg-blue-500",   titleBar: "bg-blue-50 border-blue-100" },
        purple: { bg: "bg-gradient-to-br from-purple-50/75 to-white", border: "border-purple-200", title: "text-purple-900", badge: "bg-purple-100 text-purple-700", dot: "bg-purple-400", iconBg: "bg-purple-500", titleBar: "bg-purple-50 border-purple-100" },
        amber:  { bg: "bg-gradient-to-br from-amber-50/75 to-white",  border: "border-amber-200",  title: "text-amber-900",  badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-400",  iconBg: "bg-amber-500",  titleBar: "bg-amber-50 border-amber-100" },
        rose:   { bg: "bg-gradient-to-br from-rose-50/75 to-white",   border: "border-rose-200",   title: "text-rose-900",   badge: "bg-rose-100 text-rose-700",  dot: "bg-rose-400",  iconBg: "bg-rose-500",   titleBar: "bg-rose-50 border-rose-100" },
      };

      const detail   = document.getElementById("guide-step-detail");
      const progress = document.getElementById("guide-progress-line");
      const btns     = document.querySelectorAll(".guide-step-btn");

      // Porcentaje de progreso por paso
      const progressMap = { 1: "0%", 2: "50%", 3: "98%" };

      const activateStep = (n) => {
        const data = getEditorialMergedStepDef(n, getActiveSession());
        const c    = colorMap[data.color];

        // Actualizar bolitas activas
        btns.forEach(b => b.setAttribute("data-active", b.getAttribute("data-guide-step") === String(n) ? "true" : "false"));

        // Avanzar barra de progreso
        if (progress) progress.style.width = progressMap[n] || "0%";

        // Renderizar detalle
        detail.className = `min-h-[132px] rounded-xl border ${c.border} ${c.bg} bg-gradient-to-br from-slate-50/80 to-white p-5 transition-all duration-300`;
        detail.innerHTML = `
          <div class="rounded-xl border ${c.titleBar} px-4 py-3 mb-3">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-full ${c.iconBg} text-white flex items-center justify-center shrink-0 border border-white shadow-sm">
                ${EDITORIAL_MERGED_STEP_DEFS[n].icon}
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-semibold text-sm ${c.title}">${data.title}</h4>
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${c.badge}">${data.badge}</span>
                </div>
                <p class="text-xs text-slate-600 leading-relaxed mt-1.5">${data.desc}</p>
              </div>
            </div>
          </div>
          <div class="border-t ${c.border} pt-3 mt-1">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Consejos</p>
            <ul class="flex flex-col gap-1.5">
              ${data.tips.map(t => `
                <li class="flex items-start gap-2 text-[11px] text-slate-600 font-medium">
                  <span class="w-1.5 h-1.5 rounded-full ${c.dot} mt-1.5 shrink-0"></span>
                  ${t}
                </li>`).join("")}
            </ul>
          </div>`;
      };

      btns.forEach(btn => {
        btn.addEventListener("click", () => {
          activateStep(parseInt(btn.getAttribute("data-guide-step"), 10));
        });
      });

      // Activar el paso 1 por defecto
      activateStep(1);
    });
  }

  document.querySelectorAll("[data-merged-step-ids]:not([aria-hidden='true'])").forEach((step) => {
    if (step.dataset.mergedStepBound === "true") return;
    step.dataset.mergedStepBound = "true";
    step.setAttribute("role", "button");
    step.setAttribute("tabindex", "0");
    step.setAttribute("aria-haspopup", "dialog");
    const openStep = () => {
      const phaseId = Number(step.getAttribute("data-step-id"));
      if (phaseId === 3) {
        document.getElementById("opt-export-html")?.click();
        return;
      }
      openEditorialPhaseModal(phaseId);
    };
    step.addEventListener("click", openStep);
    step.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openStep();
    });
  });

  // Menú Opciones del artículo (Dropdown)
  const btnToggleStepsList = document.getElementById("btn-toggle-steps-list");
  const editorialStepsList = document.getElementById("editorial-steps-list");
  const iconStepsChevronDown = document.getElementById("icon-steps-chevron-down");
  const iconStepsChevronUp = document.getElementById("icon-steps-chevron-up");

  if (btnToggleStepsList && editorialStepsList) {
    const syncStepListToggleIcon = () => {
      const isCollapsed = editorialStepsList.classList.contains("hidden");
      btnToggleStepsList.setAttribute("aria-expanded", String(!isCollapsed));
      btnToggleStepsList.title = isCollapsed ? "Ver pasos" : "Ocultar pasos";
      btnToggleStepsList.classList.toggle("rotate-180", isCollapsed);
      if (iconStepsChevronDown) iconStepsChevronDown.classList.toggle("hidden", !isCollapsed);
      if (iconStepsChevronUp) iconStepsChevronUp.classList.toggle("hidden", isCollapsed);
    };

    btnToggleStepsList.addEventListener("click", () => {
      editorialStepsList.classList.toggle("hidden");
      syncStepListToggleIcon();
    });

    syncStepListToggleIcon();
  }

  const articleOptionsMenu = document.getElementById("article-options-menu");
  if (dom.btnArticleOptions && articleOptionsMenu) {
    dom.btnArticleOptions.addEventListener("click", (e) => {
      e.stopPropagation();
      articleOptionsMenu.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!articleOptionsMenu.contains(e.target) && e.target !== dom.btnArticleOptions) {
        articleOptionsMenu.classList.add("hidden");
      }
    });

    // Cerrar al hacer clic en cualquier opción
    articleOptionsMenu.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        articleOptionsMenu.classList.add("hidden");
      });
    });
  }

  // Configuración de Apariencia de Texto
  const btnTextSettings = document.getElementById("opt-text-settings");
  if (btnTextSettings) {
    btnTextSettings.addEventListener("click", () => {
      showModal({
        title: "Apariencia del texto",
        widthClass: "max-w-2xl",
        contentHtml: `
          <div class="flex flex-col gap-4">
            <p class="text-xs text-slate-500 leading-relaxed mb-1">Personaliza cómo se muestra el artículo generado en el panel de lectura. Estos cambios afectan la visualización local y la exportación de estilos.</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Typography & Spacing Column -->
              <div class="flex flex-col gap-4">
                <!-- Typography Card -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col gap-4">
                  <h4 class="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Familia Tipográfica</h4>
                  <div class="flex flex-col gap-2">
                    <button id="ts-font-sans" class="text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:border-teal-400">
                      <span class="font-sans text-sm block mb-0.5">Inter (Moderno)</span>
                      <span class="text-[10px] text-slate-400">Limpia, sin serifas, ideal para pantallas.</span>
                    </button>
                    <button id="ts-font-serif" class="text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:border-teal-400">
                      <span class="font-serif text-sm block mb-0.5">Georgia (Clásico)</span>
                      <span class="text-[10px] text-slate-400">Con serifas, aspecto de libro o periódico.</span>
                    </button>
                    <button id="ts-font-mono" class="text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:border-teal-400">
                      <span class="font-mono text-sm block mb-0.5">Fira Code (Técnico)</span>
                      <span class="text-[10px] text-slate-400">Monoespaciada, aspecto de código.</span>
                    </button>
                  </div>
                </div>

                <!-- Line Spacing Card -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col gap-3">
                  <h4 class="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Interlineado</h4>
                  <div class="flex flex-col gap-2">
                    <button id="ts-lineHeight-auto" class="text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:border-teal-400 flex items-center justify-between">
                      <div class="flex flex-col">
                        <span class="font-medium">Automático</span>
                        <span class="text-[10px] text-slate-400">Ajuste del sistema</span>
                      </div>
                      <i data-lucide="monitor" class="w-4 h-4 text-slate-400"></i>
                    </button>
                    <button id="ts-lineHeight-compact" class="text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:border-teal-400 flex items-center justify-between">
                      <div class="flex flex-col">
                        <span class="font-medium">Compacto</span>
                        <span class="text-[10px] text-slate-400">1.25x</span>
                      </div>
                      <i data-lucide="align-justify" class="w-3 h-3 text-slate-400"></i>
                    </button>
                    <button id="ts-lineHeight-normal" class="text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:border-teal-400 flex items-center justify-between">
                      <div class="flex flex-col">
                        <span class="font-medium">Normal</span>
                        <span class="text-[10px] text-slate-400">1.50x</span>
                      </div>
                      <i data-lucide="align-justify" class="w-4 h-4 text-slate-400"></i>
                    </button>
                    <button id="ts-lineHeight-loose" class="text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors bg-white border-slate-200 text-slate-700 hover:border-teal-400 flex items-center justify-between">
                      <div class="flex flex-col">
                        <span class="font-medium">Amplio</span>
                        <span class="text-[10px] text-slate-400">1.75x</span>
                      </div>
                      <i data-lucide="align-justify" class="w-5 h-5 text-slate-400"></i>
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-4">
                <!-- Size Card -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-800 mb-2">Tamaño de Título principal</label>
                    <div class="flex items-center p-1 bg-slate-200/50 rounded-lg">
                      <button id="ts-titleSize-xsmall" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Mini</button>
                      <button id="ts-titleSize-small" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Pequeño</button>
                      <button id="ts-titleSize-normal" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Normal</button>
                      <button id="ts-titleSize-large" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Grande</button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-slate-800 mb-2">Peso de Título</label>
                    <div class="flex items-center p-1 bg-slate-200/50 rounded-lg">
                      <button id="ts-titleWeight-normal" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Normal</button>
                      <button id="ts-titleWeight-medium" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Medio</button>
                      <button id="ts-titleWeight-semibold" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Semi-bold</button>
                      <button id="ts-titleWeight-bold" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Bold</button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-slate-800 mb-2">Tamaño de Subtítulo</label>
                    <div class="flex items-center p-1 bg-slate-200/50 rounded-lg">
                      <button id="ts-subtitleSize-small" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Pequeño</button>
                      <button id="ts-subtitleSize-normal" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Normal</button>
                      <button id="ts-subtitleSize-large" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Grande</button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-slate-800 mb-2">Peso de Subtítulo</label>
                    <div class="flex items-center p-1 bg-slate-200/50 rounded-lg">
                      <button id="ts-subtitleWeight-normal" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Normal</button>
                      <button id="ts-subtitleWeight-medium" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Medio</button>
                      <button id="ts-subtitleWeight-semibold" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Semi-bold</button>
                      <button id="ts-subtitleWeight-bold" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Bold</button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-slate-800 mb-2">Tamaño de Párrafos</label>
                    <div class="flex items-center p-1 bg-slate-200/50 rounded-lg">
                      <button id="ts-pSize-small" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Pequeño</button>
                      <button id="ts-pSize-normal" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Normal</button>
                      <button id="ts-pSize-large" class="flex-1 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-200 transition-colors">Grande</button>
                    </div>
                  </div>
                </div>

                <!-- Quotes Card -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-3">
                  <label class="block text-xs font-bold text-slate-800">Color de Citas (Blockquote)</label>
                  <div class="flex items-center gap-2">
                    <button id="ts-quote-teal" class="w-8 h-8 rounded-full bg-teal-500 border-2 border-transparent hover:scale-110 transition-transform shadow-xs" title="Teal (Defecto)"></button>
                    <button id="ts-quote-blue" class="w-8 h-8 rounded-full bg-blue-500 border-2 border-transparent hover:scale-110 transition-transform shadow-xs" title="Azul"></button>
                    <button id="ts-quote-purple" class="w-8 h-8 rounded-full bg-purple-500 border-2 border-transparent hover:scale-110 transition-transform shadow-xs" title="Púrpura"></button>
                    <button id="ts-quote-amber" class="w-8 h-8 rounded-full bg-amber-500 border-2 border-transparent hover:scale-110 transition-transform shadow-xs" title="Ámbar"></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `,
        footerButtonsHtml: `
          <button class="btn btn-primary h-9 px-4 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Listo</button>
        `
      });

      const articleView = document.getElementById("article-view");
      if (!articleView) return;

      // Helpers
      const setSegmentedControl = (groupPrefix, activeValue) => {
        const valuesByGroup = {
          'ts-titleSize': ['xsmall', 'small', 'normal', 'large'],
          'ts-subtitleSize': ['small', 'normal', 'large'],
          'ts-pSize': ['small', 'normal', 'large'],
          'ts-titleWeight': ['normal', 'medium', 'semibold', 'bold'],
          'ts-subtitleWeight': ['normal', 'medium', 'semibold', 'bold']
        };
        const values = valuesByGroup[groupPrefix] || ['small', 'normal', 'large'];

        values.forEach(val => {
          const btn = document.getElementById(`${groupPrefix}-${val}`);
          if (btn) {
            if (val === activeValue) {
              btn.classList.add('bg-white', 'shadow-sm', 'text-slate-900');
              btn.classList.remove('text-slate-600', 'hover:bg-slate-200');
            } else {
              btn.classList.remove('bg-white', 'shadow-sm', 'text-slate-900');
              btn.classList.add('text-slate-600', 'hover:bg-slate-200');
            }
          }
        });
      };

      const setFontControl = (activeValue) => {
        ['sans', 'serif', 'mono'].forEach(val => {
          const btn = document.getElementById(`ts-font-${val}`);
          if (btn) {
            if (val === activeValue) {
              btn.classList.add('border-teal-500', 'bg-teal-50/50', 'ring-1', 'ring-teal-500');
              btn.classList.remove('border-slate-200');
            } else {
              btn.classList.remove('border-teal-500', 'bg-teal-50/50', 'ring-1', 'ring-teal-500');
              btn.classList.add('border-slate-200');
            }
          }
        });
      };

      const setQuoteControl = (activeValue) => {
        ['teal', 'blue', 'purple', 'amber'].forEach(val => {
          const btn = document.getElementById(`ts-quote-${val}`);
          if (btn) {
            if (val === activeValue) {
              btn.classList.add('ring-2', 'ring-offset-2', 'ring-slate-400');
            } else {
              btn.classList.remove('ring-2', 'ring-offset-2', 'ring-slate-400');
            }
          }
        });
      };

      const setLineHeightControl = (activeValue) => {
        ['auto', 'compact', 'normal', 'loose'].forEach(val => {
          const btn = document.getElementById(`ts-lineHeight-${val}`);
          if (btn) {
            if (val === activeValue) {
              btn.classList.add('border-teal-500', 'bg-teal-50/50', 'ring-1', 'ring-teal-500');
              btn.classList.remove('border-slate-200');
            } else {
              btn.classList.remove('border-teal-500', 'bg-teal-50/50', 'ring-1', 'ring-teal-500');
              btn.classList.add('border-slate-200');
            }
          }
        });
      };

      // Set initial states
      setSegmentedControl('ts-titleSize', articleView.getAttribute('data-text-title-size') || 'xsmall');
      setSegmentedControl('ts-subtitleSize', articleView.getAttribute('data-text-subtitle-size') || 'small');
      setSegmentedControl('ts-pSize', articleView.getAttribute('data-text-p-size') || 'normal');
      setSegmentedControl('ts-titleWeight', articleView.getAttribute('data-text-title-weight') || 'semibold');
      setSegmentedControl('ts-subtitleWeight', articleView.getAttribute('data-text-subtitle-weight') || 'normal');
      setFontControl(articleView.getAttribute('data-text-font') || 'sans');
      setQuoteControl(articleView.getAttribute('data-quote-color') || 'teal');
      setLineHeightControl(articleView.getAttribute('data-text-line-height') || 'normal');

      // Bind events
      const bindOption = (id, attr, val, updateFn, prefix = '') => {
        document.getElementById(id)?.addEventListener('click', () => {
          articleView.setAttribute(attr, val);
          localStorage.setItem('marcie_textSettings_' + attr, val);
          persistArticleAppearance(attr, val);
          if (prefix) updateFn(prefix, val);
          else updateFn(val);
        });
      };

      bindOption('ts-titleSize-xsmall', 'data-text-title-size', 'xsmall', setSegmentedControl, 'ts-titleSize');
      bindOption('ts-titleSize-small', 'data-text-title-size', 'small', setSegmentedControl, 'ts-titleSize');
      bindOption('ts-titleSize-normal', 'data-text-title-size', 'normal', setSegmentedControl, 'ts-titleSize');
      bindOption('ts-titleSize-large', 'data-text-title-size', 'large', setSegmentedControl, 'ts-titleSize');

      bindOption('ts-titleWeight-normal', 'data-text-title-weight', 'normal', setSegmentedControl, 'ts-titleWeight');
      bindOption('ts-titleWeight-medium', 'data-text-title-weight', 'medium', setSegmentedControl, 'ts-titleWeight');
      bindOption('ts-titleWeight-semibold', 'data-text-title-weight', 'semibold', setSegmentedControl, 'ts-titleWeight');
      bindOption('ts-titleWeight-bold', 'data-text-title-weight', 'bold', setSegmentedControl, 'ts-titleWeight');

      bindOption('ts-subtitleSize-small', 'data-text-subtitle-size', 'small', setSegmentedControl, 'ts-subtitleSize');
      bindOption('ts-subtitleSize-normal', 'data-text-subtitle-size', 'normal', setSegmentedControl, 'ts-subtitleSize');
      bindOption('ts-subtitleSize-large', 'data-text-subtitle-size', 'large', setSegmentedControl, 'ts-subtitleSize');

      bindOption('ts-subtitleWeight-normal', 'data-text-subtitle-weight', 'normal', setSegmentedControl, 'ts-subtitleWeight');
      bindOption('ts-subtitleWeight-medium', 'data-text-subtitle-weight', 'medium', setSegmentedControl, 'ts-subtitleWeight');
      bindOption('ts-subtitleWeight-semibold', 'data-text-subtitle-weight', 'semibold', setSegmentedControl, 'ts-subtitleWeight');
      bindOption('ts-subtitleWeight-bold', 'data-text-subtitle-weight', 'bold', setSegmentedControl, 'ts-subtitleWeight');

      bindOption('ts-pSize-small', 'data-text-p-size', 'small', setSegmentedControl, 'ts-pSize');
      bindOption('ts-pSize-normal', 'data-text-p-size', 'normal', setSegmentedControl, 'ts-pSize');
      bindOption('ts-pSize-large', 'data-text-p-size', 'large', setSegmentedControl, 'ts-pSize');

      bindOption('ts-lineHeight-auto', 'data-text-line-height', 'auto', setLineHeightControl);
      bindOption('ts-lineHeight-compact', 'data-text-line-height', 'compact', setLineHeightControl);
      bindOption('ts-lineHeight-normal', 'data-text-line-height', 'normal', setLineHeightControl);
      bindOption('ts-lineHeight-loose', 'data-text-line-height', 'loose', setLineHeightControl);

      bindOption('ts-font-sans', 'data-text-font', 'sans', setFontControl);
      bindOption('ts-font-serif', 'data-text-font', 'serif', setFontControl);
      bindOption('ts-font-mono', 'data-text-font', 'mono', setFontControl);

      bindOption('ts-quote-teal', 'data-quote-color', 'teal', setQuoteControl);
      bindOption('ts-quote-blue', 'data-quote-color', 'blue', setQuoteControl);
      bindOption('ts-quote-purple', 'data-quote-color', 'purple', setQuoteControl);
      bindOption('ts-quote-amber', 'data-quote-color', 'amber', setQuoteControl);
    });
  }

  // Selector de plantillas editoriales
  const btnArticleTemplates = document.getElementById("btn-article-templates");
  if (btnArticleTemplates) {
    btnArticleTemplates.addEventListener("click", openArticleTemplateGallery);
  }

  const btnExportHtmlHeader = document.getElementById("btn-export-html-header");
  if (btnExportHtmlHeader) {
    btnExportHtmlHeader.addEventListener("click", () => {
      document.getElementById("opt-export-html")?.click();
    });
  }

  document.getElementById("btn-publish-wordpress-header")?.addEventListener("click", openWordPressPublicationDialog);
  document.getElementById("opt-publish-wordpress")?.addEventListener("click", openWordPressPublicationDialog);

  // Copiar JSON
  const btnCopyJson = document.getElementById("opt-copy-json");
  if (btnCopyJson) {
    btnCopyJson.addEventListener("click", () => {
      const session = getActiveSession();
      if (!session) return;
      navigator.clipboard.writeText(JSON.stringify(session, null, 2)).then(() => {
        showToast("JSON copiado al portapapeles", "success");
      });
    });
  }

  const btnCopyHtml = document.getElementById("opt-copy-html");
  if (btnCopyHtml) {
    btnCopyHtml.addEventListener("click", async () => {
      const session = getActiveSession();
      if (!session) return;
      try {
        await navigator.clipboard.writeText(buildArticleHtmlDocument(session));
        showToast("HTML del artículo copiado", "success");
      } catch (error) {
        showToast(`No se pudo copiar el HTML: ${error.message}`, "error");
      }
    });
  }

  const btnExportHtml = document.getElementById("opt-export-html");
  if (btnExportHtml) {
    btnExportHtml.addEventListener("click", () => {
      const session = getActiveSession();
      if (!session) return;
      const exportEntries = getSessionArticleExportEntries(session);
      const completeArticles = exportEntries.length;
      const completeCovers = exportEntries.filter(({ article }) => Boolean(article?.featuredImage?.url)).length;
      const modal = showModal({
        title: "Exportar artículos en HTML",
        widthClass: "max-w-2xl",
        contentHtml: `
          <div class="space-y-4">
            <p class="text-xs leading-relaxed text-slate-500">Elige el contenido que deseas incluir. La descarga será un ZIP con archivos HTML e imágenes optimizadas para web.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" data-html-export-scope="current" class="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 hover:bg-teal-50/40 hover:shadow-sm transition-all cursor-pointer">
                <span class="w-9 h-9 mb-3 grid place-items-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/></svg>
                </span>
                <strong class="block text-sm text-slate-900">Exportar artículo actual</strong>
                <span class="block mt-1 text-[11px] leading-relaxed text-slate-500">Un HTML y la portada del enfoque abierto.</span>
              </button>
              <button type="button" data-html-export-scope="all" class="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 hover:bg-teal-50/40 hover:shadow-sm transition-all cursor-pointer">
                <span class="w-9 h-9 mb-3 grid place-items-center rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                </span>
                <strong class="block text-sm text-slate-900">Exportar todos los estilos</strong>
                <span class="block mt-1 text-[11px] leading-relaxed text-slate-500">Incluye cada variante existente, también las creadas manualmente.</span>
                <span class="inline-flex mt-3 rounded-full px-2 py-0.5 text-[10px] font-bold ${completeArticles > 0 && completeCovers === completeArticles ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}">${completeArticles} artículo${completeArticles === 1 ? "" : "s"} · ${completeCovers} portada${completeCovers === 1 ? "" : "s"}</span>
              </button>
            </div>
          </div>
        `
      });

      modal.element.querySelectorAll("[data-html-export-scope]").forEach((option) => {
        option.addEventListener("click", async () => {
          const scope = option.getAttribute("data-html-export-scope");
          const entries = scope === "all"
            ? exportEntries
            : [{
                id: session.audience || session.article?.audience || "educators",
                slug: ARTICLE_EXPORT_AUDIENCES.find(({ id }) => id === (session.audience || session.article?.audience))?.slug || "actual",
                label: "Artículo actual",
                article: session.article
              }];
          const originalHtml = option.innerHTML;
          modal.element.querySelectorAll("[data-html-export-scope]").forEach((button) => { button.disabled = true; });
          option.innerHTML = `<span class="min-h-[108px] flex items-center justify-center gap-2 text-sm font-semibold text-teal-700"><span class="w-4 h-4 rounded-full border-2 border-teal-200 border-t-teal-700 animate-spin"></span> Preparando ZIP...</span>`;
          try {
            await exportArticlesAsZip(session, entries);
            modal.close();
            showToast(scope === "all" ? `ZIP exportado con ${entries.length} estilo${entries.length === 1 ? "" : "s"}` : "ZIP del artículo exportado", "success");
          } catch (error) {
            console.error("[MarcieBlogEditor] Error al exportar HTML en ZIP:", error);
            showToast(`No se pudo exportar: ${error.message}`, "error");
            option.innerHTML = originalHtml;
            modal.element.querySelectorAll("[data-html-export-scope]").forEach((button) => { button.disabled = false; });
          }
        });
      });
    });
  }

  // Exportar a Markdown
  const btnExportMd = document.getElementById("opt-export-md");
  if (btnExportMd) {
    btnExportMd.addEventListener("click", () => {
      const session = getActiveSession();
      if (!session) return;

      const article = session.article || {};
      const seo = article.seo || {};
      const mdContent = `---\ntitle: "${String(seo.title || article.title || session.title).replace(/"/g, '\\"')}"\ndescription: "${String(seo.description || article.excerpt || "").replace(/"/g, '\\"')}"\nslug: "${seo.slug || slugifySeo(article.title || session.title)}"\nkeywords: [${(seo.keywords || article.tags || []).map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(", ")}]\n---\n\n# ${article.title || session.title}\n\n${(article.blocks || []).map((b) => b.text || (b.items || []).map((item) => `- ${item}`).join("\n") || "").join("\n\n")}`;
      const blob = new Blob([mdContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      a.click();
      URL.revokeObjectURL(url);

      showToast("Archivo Markdown exportado", "success");
    });
  }

  // Campana de notificaciones / actividad
  if (dom.btnNotificationBell) {
    dom.btnNotificationBell.addEventListener("click", () => {
      const session = getActiveSession();
      const logs = session?.log || [
        { message: "Sesión conectada con Firestore", at: new Date().toLocaleTimeString() }
      ];

      showModal({
        title: "Bitácora de Actividad",
        contentHtml: `
          <div class="space-y-2 text-xs">
            ${logs.map((l) => `
              <div class="p-2 bg-slate-50 border border-slate-100 rounded-lg flex justify-between items-center">
                <span class="text-slate-700 font-medium">${l.message}</span>
                <span class="text-[10px] text-slate-400">${new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            `).join("")}
          </div>
        `,
        footerButtonsHtml: `
          <button class="btn btn-outline h-8 px-3 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Listo</button>
        `
      });
    });
  }

  // Botón "Ver más" de Insight de Tendencia
  if (dom.btnTrendInsightMore) {
    dom.btnTrendInsightMore.addEventListener("click", () => {
      const trend = getActiveSession()?.trends?.[0];
      showModal({
        title: "Detalle del Insight de Tendencia",
        contentHtml: `
          <div class="flex flex-col gap-3 text-xs text-slate-600">
            <p><strong>Tema:</strong> ${escapeHtml(trend?.topic || getActiveSession()?.topic || "Sin análisis")}</p>
            <p><strong>Resumen:</strong> ${escapeHtml(trend?.summary || "Todavía no se ha ejecutado una búsqueda verificable.")}</p>
            <p><strong>Páginas recuperadas:</strong> ${Number(trend?.sources?.length || 0)}</p>
          </div>
        `,
        footerButtonsHtml: `
          <button class="btn btn-primary h-8 px-3 text-xs" onclick="document.getElementById('marcie-modal-backdrop')?.remove()">Entendido</button>
        `
      });
    });
  }

  // Avatar / Cierre de sesión
  if (dom.userAvatar) {
    dom.userAvatar.addEventListener("click", () => {
      const email = appState.currentUser?.email || "Usuario autenticado";
      if (confirm(`Sesión iniciada como:\n${email}\n\n¿Deseas cerrar sesión?`)) {
        logOutUser();
      }
    });
  }

  // Toolbar Flotante Inline (Selección de texto)
  const inlineToolbar = document.getElementById("inline-toolbar");
  if (inlineToolbar && dom.articleBodyContainer) {
    let hideTimeout;

    // Actualiza la posición y visibilidad del toolbar
    document.addEventListener("selectionchange", () => {
      clearTimeout(hideTimeout);
      const selection = window.getSelection();

      // Si no hay selección, selección vacía o no está en el artículo, oculta el toolbar
      if (!selection.rangeCount || selection.isCollapsed) {
        hideTimeout = setTimeout(() => {
          inlineToolbar.classList.add("hidden");
          inlineToolbar.classList.remove("opacity-100");
        }, 150); // Pequeño retardo para no parpadear
        return;
      }

      const range = selection.getRangeAt(0);
      const commonAncestor = range.commonAncestorContainer;

      // Verificar si la selección está dentro del contenedor del artículo
      if (!dom.articleBodyContainer.contains(commonAncestor) && !dom.articleTitle?.contains(commonAncestor) && !dom.articleSubtitle?.contains(commonAncestor)) {
        inlineToolbar.classList.add("hidden");
        return;
      }

      // Calcular posición y mostrar
      const rect = range.getBoundingClientRect();
      // Ajustar posición tomando en cuenta el contenedor relativo (ahora está en center-panel)
      const centerPanel = dom.articleView.parentElement;
      const panelRect = centerPanel.getBoundingClientRect();
      inlineToolbar.style.top = `${rect.top - panelRect.top - 8}px`;
      inlineToolbar.style.left = `${rect.left - panelRect.left + (rect.width / 2)}px`;

      inlineToolbar.classList.remove("hidden");
      // Pequeño delay para la transición de opacidad
      setTimeout(() => inlineToolbar.classList.add("opacity-100"), 10);
    });

    // Evitar que hacer click en el toolbar pierda la selección del texto
    inlineToolbar.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    // Funciones de formato al hacer click en los botones
    const applyFormat = (command, value = null) => {
      document.execCommand(command, false, value);

      // Intentar actualizar el session blocks si editó el body (simple re-parseo)
      const session = getActiveSession();
      if (session && document.activeElement === dom.articleBodyContainer) {
        // Alerta de que la sincronización de bloques JSON desde el DOM puede no ser 100% precisa,
        // pero permite al usuario editar.
        const childNodes = Array.from(dom.articleBodyContainer.childNodes);
        const newBlocks = [];
        childNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            let type = "paragraph";
            if (node.tagName === "H3" || node.tagName === "H2") type = "heading";
            else if (node.tagName === "BLOCKQUOTE") type = "quote";
            else if (node.tagName === "UL" || node.tagName === "OL") type = "list";

            newBlocks.push({ type, text: node.innerHTML || node.textContent });
          }
        });
        if (newBlocks.length > 0) {
          session.article.blocks = newBlocks;
          invalidateMaterialApproval(session);
          saveMarcieSession(session);
        }
      } else if (session) {
        // Editó title o subtitle
        const newTitle = dom.articleTitle?.textContent;
        if (newTitle) session.title = newTitle;
        if (session.article) session.article.title = newTitle;
        invalidateMaterialApproval(session);
        saveMarcieSession(session);
      }
    };

    document.getElementById("it-bold")?.addEventListener("click", () => applyFormat("bold"));
    document.getElementById("it-italic")?.addEventListener("click", () => applyFormat("italic"));
    document.getElementById("it-underline")?.addEventListener("click", () => applyFormat("underline"));
    document.getElementById("it-h2")?.addEventListener("click", () => applyFormat("formatBlock", "H2"));
    document.getElementById("it-h3")?.addEventListener("click", () => applyFormat("formatBlock", "H3"));

    document.getElementById("it-ai-edit")?.addEventListener("click", () => {
      const selection = window.getSelection();
      if (!selection.rangeCount || selection.isCollapsed) return;
      const selectedText = selection.toString();

      openAiAssistantModal({
        getActiveSession,
        onRefresh: () => renderActiveSession(),
        preselectedText: selectedText
      });

      // Ocultar el toolbar inline
      inlineToolbar.classList.add("hidden");
    });

    // Toolbar Flotante de Bloque (focus)
    const blockAiToolbar = document.getElementById("block-ai-toolbar");
    const btnBlockAiEdit = document.getElementById("btn-block-ai-edit");
    let activeBlock = null;

    if (blockAiToolbar && btnBlockAiEdit) {
      // Posicionar el toolbar sobre el elemento enfocado
      dom.articleView.addEventListener("focusin", (e) => {
        const target = e.target;
        // Solo para bloques principales
        if (target === dom.articleTitle || target === dom.articleSubtitle || target.parentElement === dom.articleBodyContainer) {
          activeBlock = target;
          const rect = target.getBoundingClientRect();
          const centerPanel = dom.articleView.parentElement;
          const panelRect = centerPanel.getBoundingClientRect();

          blockAiToolbar.style.top = `${rect.top - panelRect.top - 14}px`;
          blockAiToolbar.style.right = `20px`; // Fijar a la derecha del contenedor
          blockAiToolbar.classList.remove("hidden");
        }
      });

      // Ocultar al perder el foco fuera del articleView
      document.addEventListener("mousedown", (e) => {
        if (!dom.articleView.contains(e.target) && !blockAiToolbar.contains(e.target)) {
          blockAiToolbar.classList.add("hidden");
          activeBlock = null;
        }
      });

      btnBlockAiEdit.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!activeBlock) return;

        const text = activeBlock.textContent || activeBlock.innerText;
        openAiAssistantModal({
          getActiveSession,
          onRefresh: () => renderActiveSession(),
          preselectedText: text
        });

        blockAiToolbar.classList.add("hidden");
      });
    }
  }
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Inicialización de la aplicación
export async function initApp() {
  initMarcieUiTheme();
  console.log(`[MarcieBlogEditor] Verificando acceso de usuario aprobado...`);
  setSyncStatus("Verificando acceso...");

  // 1. Auth Guard: Verificar que el usuario esté autenticado y aprobado
  const authCheck = await ensureApprovedUserAccess({ redirectTo: "/index.html" });
  if (!authCheck.allowed) {
    return;
  }

  const user = authCheck.user;
  appState.currentUser = user;

  // Actualizar usuario en el header principal global de CharlyBrown
  const updateGlobalHeaderEmail = () => {
    const headerEmailEl = document.getElementById("headerUserEmail");
    if (headerEmailEl && user?.email) {
      headerEmailEl.textContent = user.email;
      headerEmailEl.setAttribute("title", user.email);
    }
  };
  updateGlobalHeaderEmail();
  document.addEventListener("charlylayout:ready", updateGlobalHeaderEmail);

  // Actualizar avatar interno de Marcie
  if (dom.userAvatar) {
    const email = user.email || "Usuario";
    const initials = email.substring(0, 2).toUpperCase();
    dom.userAvatar.innerHTML = `<div class="w-5 h-5 bg-teal-700 text-white rounded-full flex items-center justify-center font-bold text-[8px] shrink-0">${initials}</div> <span class="truncate">Cerrar sesión (${email})</span>`;
    dom.userAvatar.title = `${email} (Clic para cerrar sesión)`;
  }

  // Restaurar preferencias de apariencia del texto
  const articleView = document.getElementById("article-view");
  if (articleView) {
    const savedTitleSize = localStorage.getItem('marcie_textSettings_data-text-title-size');
    const savedSubtitleSize = localStorage.getItem('marcie_textSettings_data-text-subtitle-size');
    const savedPSize = localStorage.getItem('marcie_textSettings_data-text-p-size');
    const savedTitleWeight = localStorage.getItem('marcie_textSettings_data-text-title-weight');
    const savedSubtitleWeight = localStorage.getItem('marcie_textSettings_data-text-subtitle-weight');
    const savedFont = localStorage.getItem('marcie_textSettings_data-text-font');
    const savedQuoteColor = localStorage.getItem('marcie_textSettings_data-quote-color');
    const savedLineHeight = localStorage.getItem('marcie_textSettings_data-text-line-height');

    if (savedTitleSize) articleView.setAttribute('data-text-title-size', savedTitleSize);
    if (savedSubtitleSize) articleView.setAttribute('data-text-subtitle-size', savedSubtitleSize);
    if (savedPSize) articleView.setAttribute('data-text-p-size', savedPSize);
    if (savedTitleWeight) articleView.setAttribute('data-text-title-weight', savedTitleWeight);
    if (savedSubtitleWeight) articleView.setAttribute('data-text-subtitle-weight', savedSubtitleWeight);
    if (savedFont) articleView.setAttribute('data-text-font', savedFont);
    if (savedQuoteColor) articleView.setAttribute('data-quote-color', savedQuoteColor);
    if (savedLineHeight) articleView.setAttribute('data-text-line-height', savedLineHeight);
  }

  // 2. Inicializar tiradores de redimensionamiento de paneles
  initPanelResizers();

  // 3. Inicializar event listeners de la interfaz
  setupEventListeners();
  bindSeoControls();
  dom.btnVerifyEvidence?.addEventListener("click", async () => {
    const session = getActiveSession();
    if (!session?.article) return;
    const button = dom.btnVerifyEvidence;
    button.disabled = true;
    button.textContent = "Reintentando…";
    try {
      await runAutomaticEvidenceVerification(session, { notify: true });
    } catch (error) {
      showToast(`No fue posible verificar: ${error.message}`, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Reintentar";
    }
  });

  // 4. Inicializar acciones de la barra superior (búsqueda ⌘K, Asistente IA, Notificaciones y Perfil)
  initTopbarActions({
    getSessions: getAllSessions,
    onSelectSession: (id) => {
      appState.activeSessionId = id;
      renderSessionList();
      renderActiveSession();
    },
    onRefresh: () => {
      renderSessionList();
      renderActiveSession();
    },
    getActiveSession: () => getActiveSession(),
    getCurrentUser: () => appState.currentUser
  });
  initEditorialDashboard({
    getSessions: getAllSessions,
    getActiveSession: () => getActiveSession(),
    onUseTrendInCurrentSession: async (trend) => {
      const session = getActiveSession();
      if (!session) throw new Error("No hay una sesión activa.");
      const topic = String(trend?.topic || trend?.title || "").trim();
      if (!topic) throw new Error("La tendencia no contiene un tema válido.");
      session.topic = topic;
      session.status = "trends_ready";
      session.trends = [{ ...trend, sources: [] }];
      if (!Array.isArray(session.log)) session.log = [];
      session.log.unshift({ id: `log-${Date.now()}`, at: new Date().toISOString(), message: `Tema del radar seleccionado: ${topic}` });
      if (!session.article?.blocks?.length) {
        session.title = topic;
        session.article = { ...(session.article || {}), title: topic, subtitle: trend.summary || "", sources: [], researchSources: [] };
      }
      await saveMarcieSession(session);
      renderSessionList();
      renderActiveSession();
    },
    onCreateSessionFromTrend: async (trend) => {
      const topic = String(trend?.topic || trend?.title || "Tema educativo emergente").trim();
      return createEditorialSessionFromModal({
        defaultValue: topic,
        allowBlankSession: false,
        sourceTrend: trend
      });
    },
    onOpenSession: (sessionId, audience) => {
      appState.activeSessionId = sessionId;
      const session = getActiveSession();
      if (session && audience) {
        session.audience = audience;
        session.article = session.articlesByAudience?.[audience] || session.article;
      }
      appState.currentTab = "article";
      renderSessionList();
      renderActiveSession();
    }
  });

  // 5. Inicializar Stepper del Motor IA (6 pasos)
  initPipelineStepper({
    getSession: () => getActiveSession(),
    onUpdateSession: () => {
      renderSessionList();
      renderActiveSession();
    },
    onArticleGenerationState: ({ isGenerating }) => {
      appState.isGeneratingArticle = Boolean(isGenerating);
      renderActiveSession();
    }
  });

  // 5. Inicializar Command Palette (⌘ K)
  initCommandPalette({
    getSessions: getAllSessions,
    onSelectSession: (id) => {
      appState.activeSessionId = id;
      renderSessionList();
      renderActiveSession();
    },
    onRefresh: () => {
      renderSessionList();
      renderActiveSession();
    }
  });

  // 6. Escuchar sesiones de Firestore en tiempo real filtradas por ownerId
  subscribeToMarcieSessions(
    (sessions) => {
      appState.sessions = sessions;
      setSyncStatus("🟢 Firebase conectado");

      if (!appState.activeSessionId && sessions.length > 0) {
        appState.activeSessionId = sessions[0].id;
      }

      renderSessionList();
      renderActiveSession();
    },
    (err) => {
      console.warn("[MarcieBlogEditor] Error en tiempo real:", err);
      setSyncStatus("🟡 Modo offline / local", true);
    },
    user.uid
  );

  // 7. Crear semilla inicial si el usuario aún no tiene sesiones en Firestore
  void seedInitialSessionIfEmpty(user.uid);
}

// Arrancar al cargar el DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
