import { experience, createExperienceEngine, EXPERIENCE_CSS } from "./escape-room-experience.mjs?v=20260912-text-pieces-v9";
import { createRewardEngine } from "./escape-room-rewards.mjs?v=20260912-jigsaw-v3";
import { normalizeEscapeRoomProject, getMissionAcceptedAnswers, resolveFinalPasscode, resolveOptionAnswerIndex, normalizeAcceptedAnswers } from "./escape-room-creator-model.mjs?v=20260912-jigsaw-v63";
import { formatGameMessage, getGameMessages } from "./escape-room-game-i18n.mjs?v=20260907-room-unlock-v44";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function serializeForJavaScript(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function sanitizeFileName(value = "", fallback = "EscapeRoom") {
  const normalized = String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function inferExtensionFromDataUrl(dataUrl = "", fallback = "bin") {
  const match = String(dataUrl).match(/^data:([^;,]+)[;,]/i);
  const mime = match?.[1]?.toLowerCase() || "";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return fallback;
}

function extractDataUrlAsset(files, dataUrl = "", fileBase = "asset", fallbackExtension = "bin") {
  const raw = String(dataUrl || "").trim();
  if (!raw.startsWith("data:")) return "";
  const extension = inferExtensionFromDataUrl(raw, fallbackExtension);
  const fileName = `${fileBase}.${extension}`;
  files[fileName] = raw;
  return fileName;
}

function buildRuntimeMission(mission = {}, unlockedIds = []) {
  return {
    ...mission,
    respuestas_aceptadas: getMissionAcceptedAnswers(mission),
    desbloquea: Array.isArray(mission.desbloquea) ? mission.desbloquea : [],
    unlockedIds
  };
}

function normalizeRuntimeProject(project = {}) {
  const normalized = hydrateAcademicMissionPalettes(normalizeEscapeRoomProject(project));
  const missions = Array.isArray(normalized.misiones) ? normalized.misiones : [];
  normalized.misiones = missions.map((mission, index) => ({
    ...mission,
    bloqueada_inicial: index !== 0,
    desbloquea: missions[index + 1] ? [missions[index + 1].id] : []
  }));
  if(normalized.reward_plan || normalized.experience_config?.primary_reward==='imagen') {
    normalized.clave_final=resolveFinalPasscode(normalized).code;
    normalized.reward_plan=createRewardEngine(experience).bindPlan(normalized.reward_plan,normalized);
  }
  return normalized;
}

function buildProgressFingerprint(project = {}) {
  const source = JSON.stringify({
    modo_presentacion: project?.modo_presentacion === "menu_secciones" ? "menu_secciones" : "salas",
    duracion_minutos: Number(project?.duracion_minutos) || 0,
    clave_final: resolveFinalPasscode(project).code,
    experience_config: project.experience_config, reward_plan: project.reward_plan,
    misiones: (Array.isArray(project?.misiones) ? project.misiones : []).map((mission) => ({
      id: String(mission?.id || ""),
      titulo: String(mission?.titulo || ""),
      historia: String(mission?.historia || ""),
      contexto: String(mission?.contexto || ""),
      contexto_requerido: mission?.contexto_requerido !== false,
      datos_clave: Array.isArray(mission?.datos_clave) ? mission.datos_clave.map((item) => String(item ?? "")) : [],
      reto: String(mission?.reto || ""),
      preguntas: (Array.isArray(mission?.preguntas) ? mission.preguntas : []).map((question) => ({
        id: String(question?.id || ""),
        titulo: String(question?.titulo || ""),
        reto: String(question?.reto || ""),
        tipo_interaccion: String(question?.tipo_interaccion || ""),
        interaction_data: question.interaction_data,
        interaction_contract_version: Number(question?.interaction_contract_version) || 0,
        ...(Number(question?.content_revision) > 0 ? { content_revision: Number(question.content_revision) } : {}),
        subtipo_respuesta: String(question?.subtipo_respuesta || ""),
        respuesta_correcta: String(question?.respuesta_correcta || ""),
        respuestas_aceptadas: Array.isArray(question?.respuestas_aceptadas)
          ? question.respuestas_aceptadas.map((answer) => String(answer ?? ""))
          : [String(question?.respuesta_correcta || "")],
        opciones: Array.isArray(question?.opciones) ? question.opciones.map((option) => String(option ?? "")) : [],
        elementos: Array.isArray(question?.elementos) ? question.elementos.map((item) => String(item ?? "")) : [],
        texto_con_hueco: String(question?.texto_con_hueco || ""),
        parejas: Array.isArray(question?.parejas)
          ? question.parejas.map((pair) => [String(pair?.izquierda || ""), String(pair?.derecha || "")])
          : []
      }))
    }))
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function resolveMissionCardImage(mission = {}) {
  if (mission?.media?.tipo === "imagen" && mission.media.url) return mission.media.url;
  if (mission?.imagen) return mission.imagen;
  const questions = Array.isArray(mission?.preguntas) ? mission.preguntas : [];
  const mediaQuestion = questions.find((question) => question?.media?.tipo === "imagen" && question.media.url);
  if (mediaQuestion?.media?.url) return mediaQuestion.media.url;
  return questions.find((question) => String(question?.imagen || "").trim())?.imagen || "";
}

function resolveEndingImage(project = {}) {
  return project.endingImage || (project.dedicatedEndingImage ? "" : project.backgroundImage) || "";
}

function buildSectionCardFallback(kind = "activity") {
  const icons = {
    intro: '<path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Zm-6 7v5.5c0 1.5 2.7 3.5 6 3.5s6-2 6-3.5V10l-6 3-6-3Z"/>',
    instructions: '<path d="M6 3.5h9.5A2.5 2.5 0 0 1 18 6v14.5l-3-2-3 2-3-2-3 2v-17Zm3 4h6M9 11h6M9 14.5h4"/>',
    final: '<path d="M7 3h10v4a5 5 0 0 1-4 4.9V15h3v2H8v-2h3v-3.1A5 5 0 0 1 7 7V3Zm-3 2h3v2a4 4 0 0 1-3-2Zm16 0h-3v2a4 4 0 0 0 3-2Z"/>',
    activity: '<path d="M12 2.8 14.7 8l5.8.8-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1L9.3 8 12 2.8Z"/>'
  };
  return `<div class="section-card-fallback section-card-fallback-${escapeHtmlAttr(kind)}" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">${icons[kind] || icons.activity}</svg>
  </div>`;
}

function buildSectionCardMedia(imageUrl = "", alt = "", kind = "activity") {
  if (!imageUrl) return buildSectionCardFallback(kind);
  return `<div class="section-card-media"><img src="${escapeHtmlAttr(imageUrl)}" alt="${escapeHtmlAttr(alt)}" loading="lazy"></div>`;
}

function isDuplicateMediaNote(note = "", fallbackText = "") {
  const normalizedNote = String(note || "").trim();
  const normalizedFallback = String(fallbackText || "").trim();
  return Boolean(normalizedNote) && normalizedNote === normalizedFallback;
}

function extractQuestionAssets(files, mediaFolder, mission, question, questionIndex) {
  if (!question || typeof question !== "object") return;
  const questionBase = `${sanitizeFileName(mission.id, "mission")}-${sanitizeFileName(question.id || `question-${questionIndex + 1}`, "question")}`;

  if (question.media?.url && (/^file:/i.test(question.media.url) || /^\/Users\//.test(question.media.url) || /^[A-Za-z]:[\/]/.test(question.media.url))) {
    question.media.texto = question.media.texto || question.media.alt || "Este recurso apunta a un archivo local y no puede incrustarse automaticamente en el paquete exportado.";
    question.media.url = "";
  }
  if (question.media?.url?.startsWith("data:")) {
    const extension = inferExtensionFromDataUrl(question.media.url, question.media.tipo === "audio" ? "mp3" : question.media.tipo === "video" ? "mp4" : "png");
    const fileName = `${mediaFolder}/${questionBase}-media.${extension}`;
    files[fileName] = question.media.url;
    question.media.url = fileName;
  }

  if (question.imagen?.startsWith("data:")) {
    const imageFileName = extractDataUrlAsset(files, question.imagen, `${mediaFolder}/${questionBase}-reference`, "png");
    question.imagen = imageFileName;
    if (!question.media?.url) {
      question.media = {
        tipo: "imagen",
        url: imageFileName,
        alt: question.imagen_alt || question.titulo,
        titulo: question.titulo,
        texto: ""
      };
    }
  }
}

function extractMissionAssets(files, mediaFolder, mission, missionIndex) {
  if (mission.media?.url && (/^file:/i.test(mission.media.url) || /^\/Users\//.test(mission.media.url) || /^[A-Za-z]:[\/]/.test(mission.media.url))) {
    mission.media.texto = mission.media.texto || mission.media.alt || "Este recurso apunta a un archivo local y no puede incrustarse automaticamente en el paquete exportado.";
    mission.media.url = "";
  }
  if (mission.media?.url?.startsWith("data:")) {
    const extension = inferExtensionFromDataUrl(mission.media.url, mission.media.tipo === "audio" ? "mp3" : mission.media.tipo === "video" ? "mp4" : "png");
    const fileName = `${mediaFolder}/${sanitizeFileName(mission.id, "mission")}-media.${extension}`;
    files[fileName] = mission.media.url;
    mission.media.url = fileName;
  }
  if (mission.imagen?.startsWith("data:")) {
    const imageFileName = extractDataUrlAsset(
      files,
      mission.imagen,
      `${mediaFolder}/${sanitizeFileName(mission.id, "mission")}-reference`,
      "png"
    );
    mission.imagen = imageFileName;
    if (!mission.media?.url) {
      mission.media = {
        tipo: "imagen",
        url: imageFileName,
        alt: mission.imagen_alt || mission.titulo,
        titulo: mission.titulo,
        texto: ""
      };
    }
  }

  if (Array.isArray(mission.preguntas)) {
    mission.preguntas.forEach((question, questionIndex) => {
      extractQuestionAssets(files, mediaFolder, mission, question, questionIndex);
    });
  }
}

function formatDuration(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }
  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function clampThemeNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeThemeColor(value, fallback) {
  const raw = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return fallback;
}

const ACADEMIC_STATION_COLORS = Object.freeze({
  1: "#fcc659",
  2: "#bbd152",
  3: "#e95297",
  4: "#02b0a3"
});
const ACADEMIC_THEME_COLORS = Object.freeze({
  1: "#2da6b1",
  2: "#ea5a5a",
  3: "#952e89",
  4: "#e48119"
});

function normalizeAcademicIndex(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return ((safe - 1) % 4 + 4) % 4 + 1;
}

function resolveAcademicStationIndex(value, fallback = 1) {
  const normalized = String(value || "").trim().toLowerCase();
  const names = {
    "primera estación": 1,
    "segunda estación": 2,
    "tercera estación": 3,
    "cuarta estación": 4
  };
  if (Object.prototype.hasOwnProperty.call(names, normalized)) return names[normalized];
  if (!normalized || normalized === "todas") return normalizeAcademicIndex(fallback, fallback);
  return normalizeAcademicIndex(normalized, fallback);
}

function resolveMissionAcademicPalette(project = {}, mission = {}, index = 0) {
  const stored = mission?.paleta_academica || {};
  const isSecondary = String(project?.nivel || "").trim().toLowerCase() === "secundaria";
  const roomIndex = normalizeAcademicIndex(index + 1, 1);
  const stationIndex = stored.color_estacion
    ? normalizeAcademicIndex(stored.estacion_index, roomIndex)
    : isSecondary
      ? resolveAcademicStationIndex(project?.estacion, roomIndex)
      : roomIndex;
  const themeSource = isSecondary ? project?.tema : project?.unidad;
  const themeIndex = stored.color_tema_unidad
    ? normalizeAcademicIndex(stored.tema_unidad_index, 1)
    : normalizeAcademicIndex(themeSource, 1);
  return {
    color_estacion: normalizeThemeColor(stored.color_estacion, ACADEMIC_STATION_COLORS[stationIndex]),
    color_tema_unidad: normalizeThemeColor(stored.color_tema_unidad, ACADEMIC_THEME_COLORS[themeIndex]),
    estacion_index: stationIndex,
    tema_unidad_index: themeIndex
  };
}

function hydrateAcademicMissionPalettes(project = {}) {
  return {
    ...project,
    misiones: (Array.isArray(project?.misiones) ? project.misiones : []).map((mission, index) => ({
      ...mission,
      paleta_academica: resolveMissionAcademicPalette(project, mission, index)
    }))
  };
}

function buildMissionPaletteStyle(project = {}, mission = {}, index = 0) {
  const palette = resolveMissionAcademicPalette(project, mission, index);
  return `--room-station-color:${palette.color_estacion};--room-theme-color:${palette.color_tema_unidad};--accent:${palette.color_estacion};--accent-2:${palette.color_tema_unidad};--button-bg:${palette.color_tema_unidad};`;
}

function resolveAcademicBackgroundColor(project = {}) {
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  const firstMissionWithPalette = missions.find((mission) => mission?.paleta_academica?.color_tema_unidad);
  const isSecondary = String(project?.nivel || "").trim().toLowerCase() === "secundaria";
  const hasAcademicSelection = Boolean(
    firstMissionWithPalette
    || String(project?.unidad || "").trim()
    || (isSecondary && String(project?.tema || "").trim())
  );
  if (!hasAcademicSelection) return "";
  return resolveMissionAcademicPalette(project, firstMissionWithPalette || missions[0] || {}, 0).color_tema_unidad;
}

function resolveGameTheme(themeConfig = {}) {
  const titleColor = normalizeThemeColor(themeConfig.titleColor, "#f5eefe");
  const subtitleColor = normalizeThemeColor(themeConfig.subtitleColor, "#e9d5ff");
  const paragraphColor = normalizeThemeColor(themeConfig.paragraphColor, "#c7b9db");
  const backgroundColor = normalizeThemeColor(themeConfig.backgroundColor, "#12091d");
  const cardColor = normalizeThemeColor(themeConfig.cardColor, "#23143d");
  const buttonColor = normalizeThemeColor(themeConfig.buttonColor, "#a855f7");
  return {
    titleColor,
    subtitleColor,
    paragraphColor,
    backgroundColor,
    cardColor,
    elevatedCardColor: normalizeThemeColor(
      themeConfig.elevatedCardColor,
      normalizeThemeColor(themeConfig.cardColor, "#2b1749")
    ),
    cardRadius: clampThemeNumber(themeConfig.cardRadius, 0, 40, 22),
    titleSize: clampThemeNumber(themeConfig.titleSize, 24, 72, 46),
    subtitleSize: clampThemeNumber(themeConfig.subtitleSize, 14, 40, 22),
    paragraphSize: clampThemeNumber(themeConfig.paragraphSize, 12, 28, 16),
    buttonColor,
    buttonTextColor: normalizeThemeColor(themeConfig.buttonTextColor, "#ffffff"),
    accentColor: normalizeThemeColor(
      themeConfig.accentColor,
      normalizeThemeColor(themeConfig.buttonColor, "#7c3aed")
    ),
    accentStrong: normalizeThemeColor(
      themeConfig.accentStrong,
      normalizeThemeColor(themeConfig.buttonColor, "#a855f7")
    ),
    accentSoft: normalizeThemeColor(
      themeConfig.accentSoft,
      normalizeThemeColor(themeConfig.cardColor, "#3b1d63")
    ),
    successColor: normalizeThemeColor(themeConfig.successColor, "#34d399"),
    warningColor: normalizeThemeColor(themeConfig.warningColor, "#f59e0b"),
    dangerColor: normalizeThemeColor(themeConfig.dangerColor, "#fb7185")
  };
}

export function buildGameCss(projectOrTheme = {}) {
  const resolvedTheme = resolveGameTheme(projectOrTheme?.themeConfig || projectOrTheme);
  const academicBackgroundColor = resolveAcademicBackgroundColor(projectOrTheme);
  const theme = academicBackgroundColor
    ? { ...resolvedTheme, backgroundColor: academicBackgroundColor }
    : resolvedTheme;
  const displayTitleSize = Math.max(24, Math.min(32, theme.titleSize - 12));
  const displaySubtitleSize = Math.max(13, Math.min(18, theme.subtitleSize - 1));
  const displayParagraphSize = Math.max(12, Math.min(14, theme.paragraphSize - 2));
  const panelRgb = theme.cardColor.replace("#", "").match(/.{2}/g).map(value => parseInt(value, 16) / 255);
  const panelLuminance = panelRgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const choiceColors = panelLuminance > 0.3
    ? ["#075985", "#854d0e", "#5b21b6", "#065f46"]
    : ["#7dd3fc", "#fde68a", "#ddd6fe", "#a7f3d0"];
  return EXPERIENCE_CSS + `:root {
  --bg: ${theme.backgroundColor};
  --bg-2: ${theme.backgroundColor};
  --panel: ${theme.cardColor};
  --panel-soft: ${theme.elevatedCardColor};
  --line: color-mix(in srgb, ${theme.titleColor} 16%, transparent);
  --text: ${theme.titleColor};
  --muted: ${theme.paragraphColor};
  --accent: ${theme.accentColor};
  --accent-2: ${theme.accentStrong};
  --accent-3: ${theme.accentSoft};
  --success: ${theme.successColor};
  --danger: ${theme.dangerColor};
  --warn: ${theme.warningColor};
  --shadow: 0 28px 70px rgba(2, 6, 23, 0.52);
  --radius-xl: ${theme.cardRadius}px;
  --radius-lg: ${theme.cardRadius}px;
  --radius-md: ${Math.max(0, theme.cardRadius - 6)}px;
  --title-color: ${theme.titleColor};
  --subtitle-color: ${theme.subtitleColor};
  --paragraph-color: ${theme.paragraphColor};
  --button-bg: ${theme.buttonColor};
  --button-text: ${theme.buttonTextColor};
}
* { box-sizing: border-box; }
/* Shared by preview and ZIP, including runtime messages and inline styles. */
body, body *, body *::before, body *::after {
  font-weight: 400 !important;
}
body {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  font-family: "Segoe UI", system-ui, sans-serif;
  background: linear-gradient(135deg, var(--bg), var(--bg-2));
}
.game-logo-brand {
  display: block;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  object-fit: contain;
  pointer-events: none;
}
.editorial-fab {
  position: fixed;
  right: max(20px, env(safe-area-inset-right, 0px));
  bottom: max(20px, env(safe-area-inset-bottom, 0px));
  z-index: 9999;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  min-width: 52px;
  min-height: 52px;
  padding: 0;
  border: 1px solid rgba(255,255,255,.35);
  border-radius: 50%;
  background: #be185d;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.editorial-fab[hidden] { display: none; }
.editorial-fab svg { display: block; width: 24px; height: 24px; pointer-events: none; }
.editorial-fab:hover { background: #9d174d; }
.editorial-fab.is-dragging { cursor: grabbing; }
.editorial-fab:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
.fullscreen-toggle {
  position: static;
  display: inline-flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  color: var(--text);
  font: inherit;
  line-height: 1;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: color-mix(in srgb, var(--panel) 88%, white 12%);
  box-shadow: none;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}
.fullscreen-toggle:hover {
  border-color: color-mix(in srgb, var(--accent) 62%, var(--line));
  background: color-mix(in srgb, var(--accent) 12%, var(--panel-soft));
  color: var(--accent);
}
.fullscreen-toggle:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 50%, transparent);
  outline-offset: 3px;
}
.fullscreen-toggle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}
.fullscreen-toggle svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}
.fullscreen-toggle [data-fullscreen-label] {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.fullscreen-toggle .fullscreen-exit-icon { display: none; }
.fullscreen-toggle.is-active .fullscreen-enter-icon { display: none; }
.fullscreen-toggle.is-active .fullscreen-exit-icon { display: block; }
html:fullscreen,
html:fullscreen body,
html.is-fullscreen,
html.is-fullscreen body,
html.is-immersive-fallback,
html.is-immersive-fallback body {
  min-width: 100%;
  min-height: 100%;
  background: var(--bg);
}
html:fullscreen,
html:fullscreen body,
html.is-fullscreen,
html.is-fullscreen body {
  overflow-x: hidden;
  overflow-y: auto;
}
html:fullscreen .game-shell,
html.is-fullscreen .game-shell {
  max-width: none;
  width: 100%;
  padding: 14px;
}
html:fullscreen .game-card,
html.is-fullscreen .game-card {
  width: min(100%, 100%);
}
html.is-immersive-fallback,
html.is-immersive-fallback body {
  width: 100%;
  height: 100%;
  overscroll-behavior: none;
}
::backdrop { background: var(--bg); }
.game-shell {
  position: relative;
  z-index: 2;
  max-width: 1280px;
  margin: 0 auto;
  padding: 72px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.game-card {
  width: min(100%, 1180px);
  margin: 0 auto;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow);
  padding: 24px;
}
.hero-grid, .mission-layout, .map-grid, .mission-actions, .choice-grid, .match-grid, .media-card, .match-row-grid { display: grid; gap: 16px; }
.hero-grid { grid-template-columns: 1fr; margin-bottom: 22px; }
.hero-panel, .meta-panel, .map-panel, .mission-panel, .ending-panel {
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--panel-soft);
  padding: 18px;
}
.hero-panel {
  display: grid;
  gap: 14px;
}
.hero-status-row,
.hero-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.hero-status-row {
  justify-content: space-between;
}
.timer-shell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 0.88rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-soft) 88%, white 12%);
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.22);
}
.timer-shell.is-ready {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
.timer-shell.is-running {
  border-color: color-mix(in srgb, var(--success) 34%, transparent);
}
.timer-shell.is-complete {
  border-color: color-mix(in srgb, var(--success) 64%, transparent);
  background: color-mix(in srgb, var(--success) 12%, var(--panel-soft));
}
.timer-shell.is-warning {
  border-color: color-mix(in srgb, var(--warn) 36%, transparent);
}
.timer-shell.is-expired {
  border-color: color-mix(in srgb, var(--danger) 36%, transparent);
}
.timer-value {
  font-size: 1.08rem;
  font-weight: 900;
  color: var(--text);
  letter-spacing: 0.04em;
}
.timer-header {
  flex: 0 0 auto;
  min-width: 84px;
  min-height: 32px;
  gap: 7px;
  padding: 0.42rem 0.62rem;
  border-radius: 9px;
  background: color-mix(in srgb, var(--panel) 88%, white 12%);
  box-shadow: none;
  white-space: nowrap;
}
.timer-header .timer-icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: var(--muted);
}
.timer-header .timer-icon svg {
  width: 100%;
  height: 100%;
}
.timer-header .timer-value {
  font-variant-numeric: tabular-nums;
  font-size: 0.84rem;
  letter-spacing: 0.02em;
}
.timer-header.is-running .timer-icon,
.timer-header.is-complete .timer-icon {
  color: var(--success);
}
.timer-header.is-warning :is(.timer-icon, .timer-value) {
  color: var(--warn);
}
.timer-header.is-expired :is(.timer-icon, .timer-value) {
  color: var(--danger);
}
.hero-controls {
  justify-content: flex-start;
}
.hero-controls button[hidden] {
  display: none !important;
}
.hero-media {
  display: grid;
  justify-items: center;
  margin: 2px 0 4px;
}
.hero-media img {
  display: block;
  width: min(100%, 720px);
  border-radius: var(--radius-md);
  object-fit: cover;
  margin: 0 auto;
}
.ending-panel { text-align: center; }
.final-passcode-puzzle {
  display: grid;
  justify-items: center;
  gap: 14px;
  margin: 18px auto;
}
.final-passcode-tiles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  min-height: 58px;
}
.final-passcode-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  padding: 8px 12px;
  border: 2px solid color-mix(in srgb, var(--accent) 58%, var(--line));
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 1.35rem;
  font-weight: 900;
  line-height: 1;
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition: transform .16s ease, border-color .16s ease, background .16s ease;
}
.final-passcode-tile:hover { transform: translateY(-2px); }
.final-passcode-tile:focus-visible { outline: 3px solid var(--accent-2); outline-offset: 3px; }
.final-passcode-tile.is-selected {
  border-color: var(--accent-2);
  background: color-mix(in srgb, var(--accent-2) 18%, var(--panel));
  transform: translateY(-3px);
}
.final-passcode-tile.is-dragging {
  position: relative;
  z-index: 20;
  opacity: .9;
  cursor: grabbing;
  transition: none;
  box-shadow: 0 14px 26px rgba(0, 0, 0, .28);
}
.final-passcode-tile.is-drop-target {
  border-color: var(--accent-2);
  background: color-mix(in srgb, var(--accent-2) 22%, var(--panel));
  transform: translateY(-3px) scale(1.04);
}
.room-unlock-transition {
  position: relative;
  isolation: isolate;
  display: grid;
  justify-items: center;
  gap: 16px;
  max-width: 760px;
  margin: 20px auto 0;
  padding: clamp(28px, 6vw, 56px) clamp(20px, 6vw, 52px);
  overflow: hidden;
  text-align: center;
  border-color: color-mix(in srgb, var(--room-station-color, var(--accent)) 58%, var(--line));
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--room-station-color, var(--accent)) 22%, transparent), transparent 38%),
    linear-gradient(145deg, color-mix(in srgb, var(--panel-soft) 92%, black 8%), var(--panel));
  box-shadow: 0 26px 70px rgba(0, 0, 0, .34), inset 0 1px 0 rgba(255,255,255,.08);
}
.room-unlock-transition::before,
.room-unlock-transition::after {
  content: "";
  position: absolute;
  z-index: -1;
  width: 180px;
  height: 180px;
  border: 1px solid color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 36%, transparent);
  border-radius: 50%;
  animation: unlock-orbit 7s linear infinite;
}
.room-unlock-transition::before { top: -112px; left: -76px; }
.room-unlock-transition::after { right: -92px; bottom: -122px; animation-direction: reverse; animation-duration: 9s; }
.room-unlock-eyebrow {
  color: var(--room-station-color, var(--accent));
  font-size: .76rem;
  font-weight: 900;
  letter-spacing: .18em;
  text-transform: uppercase;
}
.room-unlock-transition .mission-title { margin: 0; max-width: 620px; }
.room-unlock-letter-shell {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(112px, 24vw, 150px);
  aspect-ratio: 1;
  margin: 4px 0;
  border: 1px solid color-mix(in srgb, var(--room-station-color, var(--accent)) 66%, white 8%);
  border-radius: 28px;
  background: color-mix(in srgb, var(--room-station-color, var(--accent)) 12%, var(--panel));
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--room-station-color, var(--accent)) 7%, transparent), 0 18px 48px color-mix(in srgb, var(--room-station-color, var(--accent)) 20%, transparent);
  animation: unlock-letter-arrival .62s cubic-bezier(.2,.9,.25,1.25) both;
}
.room-unlock-letter {
  color: var(--text);
  font-size: clamp(3.6rem, 12vw, 5.5rem);
  font-weight: 950;
  line-height: 1;
  letter-spacing: .04em;
  text-shadow: 0 0 24px color-mix(in srgb, var(--room-station-color, var(--accent)) 58%, transparent);
}
.room-unlock-feedback { max-width: 580px; margin: 0; color: var(--muted); }
.room-unlock-progress {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  background: color-mix(in srgb, var(--panel-soft) 88%, white 12%);
  font-size: .82rem;
  font-weight: 800;
}
.room-unlock-continue { min-width: min(100%, 260px); }
@keyframes unlock-letter-arrival {
  0% { opacity: 0; transform: translateY(18px) scale(.72) rotate(-5deg); filter: blur(8px); }
  70% { opacity: 1; transform: translateY(-3px) scale(1.04) rotate(1deg); filter: blur(0); }
  100% { opacity: 1; transform: none; filter: blur(0); }
}
@keyframes unlock-orbit { to { transform: rotate(360deg); } }
.ending-panel.is-alert {
  border-color: color-mix(in srgb, var(--danger) 78%, white 22%);
  box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.22), 0 0 38px rgba(251, 113, 133, 0.42);
  animation: red-alert-blink 1s ease-in-out infinite;
}
.game-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  margin: 0;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--panel-soft) 94%, black 6%);
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
  overflow: visible;
}
.game-header-start,
.game-header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}
html:fullscreen body:not(.menu-mode) .game-shell,
html.is-fullscreen body:not(.menu-mode) .game-shell {
  padding-top: calc(var(--game-toolbar-height, 72px) + 12px);
}
.game-header .is-concealed {
  visibility: hidden;
  pointer-events: none;
}
.game-header-start > [data-gallery-prev].is-concealed {
  display: none;
}
.gallery-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: nowrap;
}
.game-header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
}
.gallery-step {
  display: inline-flex;
  align-items: center;
  min-height: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
}
.question-progress {
  flex: 0 0 auto;
  min-width: max-content;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}
.question-progress strong {
  color: var(--text);
  font-weight: 800;
}
.gallery-stage {
  display: grid;
  gap: 18px;
  width: min(100%, 1120px);
  margin: 0 auto;
}
.gallery-screen {
  display: none;
  gap: 18px;
}
.gallery-screen.is-active {
  display: grid;
  animation: galleryFadeIn 180ms ease;
}
.gallery-screen[data-gallery-screen="mission"].is-active {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: start;
  gap: 18px;
}
.gallery-screen[data-gallery-screen="mission"].is-active > .map-panel {
  grid-column: 1;
  grid-row: 1 / span 2;
  align-self: start;
  position: sticky;
  top: 116px;
}
.gallery-screen[data-gallery-screen="mission"].is-active > #missionStage {
  grid-column: 2;
  grid-row: 1;
}
.gallery-screen[data-gallery-screen="mission"].is-active > .map-panel .map-grid {
  display: grid;
  grid-template-columns: 1fr;
  flex-direction: column;
  align-items: stretch;
  overflow: visible;
  padding-bottom: 0;
}
.gallery-screen[data-gallery-screen="mission"].is-active > .map-panel .map-card {
  width: 100%;
  min-width: 0;
}
.button-row.hero-actions {
  justify-content: flex-end;
}
.question-list {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}
.investigation-board {
  position: relative;
  display: grid;
  gap: 18px;
  margin-top: 18px;
  padding: clamp(18px, 3vw, 30px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--room-station-color, var(--accent)) 45%, var(--line));
  border-radius: var(--radius-lg);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 10%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 10%, transparent) 1px, transparent 1px),
    color-mix(in srgb, var(--panel-soft) 94%, black 6%);
  background-size: 28px 28px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 38px rgba(2,6,23,0.24);
}
.investigation-board::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, transparent 42%, color-mix(in srgb, var(--room-station-color, var(--accent)) 20%, transparent) 42.2%, transparent 42.7%);
}
.investigation-board > * { position: relative; z-index: 1; }
.investigation-board-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px 14px; align-items: baseline; }
.investigation-board-head > .label { margin: 0; }
.investigation-board-title { justify-self: end; min-width: 0; margin: 0; text-align: right; overflow-wrap: anywhere; font-size: clamp(1rem, 2vw, 1.4rem); }
.investigation-board-lead { grid-column: 1 / -1; margin: 0; color: var(--paragraph-color); font-size: clamp(1.2rem, 2.4vw, 1.7rem); }
.investigation-document,
.investigation-objective,
.evidence-card {
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 93%, white 7%);
  box-shadow: 0 10px 24px rgba(2,6,23,0.2);
}
.investigation-document { padding: 18px; border-radius: 4px 16px 6px 14px; transform: rotate(-0.15deg); }
.investigation-document p { margin: 0; color: var(--paragraph-color); line-height: 1.72; white-space: pre-line; }
.investigation-evidence-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.investigation-evidence-heading { margin-bottom: 12px; }
.evidence-card { min-height: 88px; padding: 15px; border-radius: 12px 4px 14px 5px; font-weight: 700; line-height: 1.45; }
.evidence-card:nth-child(even) { transform: rotate(0.35deg); }
.evidence-index { display: block; margin-bottom: 8px; color: var(--room-station-color, var(--accent)); font-size: 0.7rem; letter-spacing: 0.16em; }
.investigation-objective { padding: 16px 18px; border-radius: var(--radius-md); border-left: 4px solid var(--room-theme-color, var(--accent-2)); }
.investigation-objective strong { display: block; margin-bottom: 6px; color: var(--title-color); }
.investigation-objective p { margin: 0; color: var(--paragraph-color); line-height: 1.55; }
.investigation-board-actions { display: flex; justify-content: flex-end; }
.briefing-review { margin-top: 18px; border: 1px solid var(--line); border-radius: var(--radius-md); background: color-mix(in srgb, var(--panel-soft) 92%, white 8%); }
.briefing-review + .mission-layout { margin-top: clamp(18px, 2vw, 26px); }
.investigation-board { margin-bottom: 16px; }
.briefing-review summary { min-height: 44px; padding: 13px 16px; cursor: pointer; color: var(--title-color); font-weight: 800; }
.briefing-review .investigation-board { margin: 0; border: 0; border-top: 1px solid var(--line); border-radius: 0 0 var(--radius-md) var(--radius-md); box-shadow: none; }
.question-card.is-complete {
  border-color: rgba(52, 211, 153, 0.52);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 0 0 1px rgba(52, 211, 153, 0.18),
    0 16px 32px rgba(0,0,0,0.24);
}
.question-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.question-title {
  font-size: calc(1.18rem + 2pt);
  margin: 8px 0 12px;
}
.question-head > div { width: 100%; min-width: 0; }
.question-head .label { text-align: right; font-size: calc(0.68rem + 2pt); }
.question-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-soft) 90%, white 10%);
  color: var(--muted);
  font-weight: 700;
}
#roomStatusBox.status-box.room-status-box {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  text-align: left;
  width: 100%;
  gap: 10px;
  margin-top: 16px;
  padding: 22px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--paragraph-color);
  font-size: clamp(1.125rem, 1.6vw, 1.375rem);
  font-weight: 700;
  line-height: 1.5;
}
#roomStatusBox.status-box.room-status-box.is-good {
  border: 0;
  background: transparent;
  box-shadow: none;
  color: color-mix(in srgb, var(--success) 64%, white 36%);
}
#roomStatusBox.status-box.room-status-box.is-bad {
  border: 0;
  background: transparent;
  box-shadow: none;
  color: color-mix(in srgb, var(--danger) 68%, white 32%);
}
.question-response-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}
.question-response-row.is-inline-answer {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}
.question-response-row.is-inline-answer .question-challenge {
  flex: 1 1 auto;
}
.question-response-row.is-inline-answer .question-actions {
  margin-left: 0;
  width: 100%;
}
.question-challenge {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.question-challenge .choice-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.question-challenge .match-grid { grid-template-columns: 1fr; }
.question-challenge .match-row-grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  align-items: stretch;
}
.question-challenge .match-row-grid > .match-item {
  grid-column: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.question-challenge .match-row-grid > .match-select {
  grid-column: 2;
  min-width: 0;
  max-width: 100%;
  display: block;
}
.question-response-row .question-actions {
  justify-content: flex-end;
  width: 100%;
  margin: 0;
  align-self: start;
}
.question-actions {
  justify-content: flex-end;
}
.question-challenge {
  margin-top: 10px;
}
.question-response-row .question-challenge {
  margin-top: 0;
}
.field.question-answer-input {
  width: min(100%, 360px);
}
.field.question-answer-input.is-number {
  width: min(100%, 180px);
}
.free-response-field {
  display: grid;
  gap: 8px;
  width: 100%;
}
.field.question-answer-input.is-free-response {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  line-height: 1.5;
}
.free-response-note {
  font-size: 0.82rem;
  line-height: 1.4;
}
.true-false-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
}
.true-false-choice,
.sequence-item,
.sequence-move {
  min-height: 44px;
}
.fill-blank-block,
.sequence-board {
  display: grid;
  gap: 10px;
}
.fill-blank-sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  line-height: 1.7;
  font-weight: 700;
}
.fill-blank-input {
  width: min(100%, 240px) !important;
  border: 2px solid var(--accent) !important;
  border-radius: 12px !important;
  background: color-mix(in srgb, var(--accent) 12%, var(--panel)) !important;
  min-height: 48px;
  max-width: 100%;
  box-sizing: border-box;
  text-align: center;
}
.fill-blank-input:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.fill-blank-input[aria-invalid="true"] { border-color: #e66b73 !important; }
#experienceBonusDialog [data-exp-bonus-status]{padding:18px 20px;line-height:1.5}#experienceBonusDialog .exp-tray{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#experienceBonusDialog [data-exp-part]{background:var(--panel,#18202c);color:var(--text,#eef3fc);border:1px solid var(--line,#8888);border-radius:10px;padding:10px;font:inherit;min-height:44px}#experienceBonusDialog button:focus-visible{outline:3px solid var(--accent,#5279b9);outline-offset:2px}
.sequence-board{container-type:inline-size}@container(max-width:639px){.sequence-board .sequence-list{grid-template-columns:1fr}}
.sequence-list {
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sequence-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: stretch;
  border-radius: 14px;
}
.sequence-row.is-selected {
  outline: 3px solid color-mix(in srgb, var(--accent) 62%, white 38%);
  outline-offset: 2px;
}
.sequence-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 10px 13px;
  background: color-mix(in srgb, var(--panel-soft) 90%, white 10%);
  color: var(--text);
  text-align: left;
  touch-action: none;
  cursor: grab;
}
.sequence-item.is-dragging { opacity: .78; cursor: grabbing; z-index: 10; }
.sequence-number {
  display: inline-grid;
  place-items: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--button-text);
  font-weight: 900;
}
.sequence-controls { display: grid; grid-template-columns: repeat(2, 44px); gap: 4px; }
.sequence-move {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel-soft);
  color: var(--text);
  font-size: 1.1rem;
}
.sequence-move:disabled { opacity: .38; }
@media (max-width: 560px) {
  .sequence-row { grid-template-columns: 1fr; }
  .sequence-controls { justify-self: end; }
}
@media (prefers-reduced-motion: reduce) {
  .sequence-item { transition: none !important; }
}
.question-card .media-card {
  margin: 12px 0 24px;
}
.mission-challenge-content {
  display: grid;
  min-width: 0;
  gap: 12px;
  align-content: start;
}
.mission-challenge-label {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
}
.mission-challenge-label::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 54%, transparent), transparent);
}
.mission-challenge-content .challenge-box {
  position: relative;
  padding: 3px 0 3px 18px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--text);
  font-size: clamp(1rem, 1.45vw, 1.16rem);
  font-weight: 620;
  line-height: 1.58;
}
.mission-challenge-content .challenge-box::before {
  content: "";
  position: absolute;
  inset: 2px auto 2px 0;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--room-theme-color, var(--accent-2)), var(--room-station-color, var(--accent)));
  box-shadow: 0 0 16px color-mix(in srgb, var(--room-station-color, var(--accent)) 30%, transparent);
}
.mission-room-media {
  display: grid;
  min-width: 0;
  justify-items: center;
}
.mission-room-media .media-card {
  width: min(100%, 460px);
  margin: 0;
}
.mission-room-media .media-card img,
.mission-room-media .media-card video {
  width: 100%;
  max-height: 340px;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: color-mix(in srgb, var(--panel-soft) 92%, black 8%);
}
@media (min-width: 760px) {
  .mission-layout.has-room-media {
    grid-template-columns: minmax(240px, 0.78fr) minmax(320px, 1.22fr);
    align-items: start;
    gap: clamp(18px, 2.4vw, 28px);
  }
  .mission-layout.has-room-media .mission-room-media .media-card {
    width: 100%;
  }
  .question-card.is-media-answer-split {
    display: grid;
    grid-template-columns: minmax(260px, 0.9fr) minmax(320px, 1.1fr);
    align-items: start;
    gap: clamp(18px, 2.4vw, 28px);
  }
  .question-card.is-media-answer-split > .media-card {
    min-width: 0;
    margin: 0;
  }
  .question-card.is-media-answer-split > .media-card img {
    width: 100%;
    max-height: 420px;
    aspect-ratio: 4 / 3;
    object-fit: contain;
    background: color-mix(in srgb, var(--panel-soft) 92%, black 8%);
  }
  .question-card.is-media-answer-split > .question-card-content {
    display: grid;
    min-width: 0;
    gap: 12px;
    align-content: start;
  }
  .question-card.is-media-answer-split .question-story,
  .question-card.is-media-answer-split .question-challenge,
  .question-card.is-media-answer-split .hint-box,
  .question-card.is-media-answer-split .status-box {
    margin-top: 0;
  }
  .question-card.is-media-answer-split .field.question-answer-input {
    width: 100%;
  }
}
@keyframes galleryFadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes red-alert-blink {
  0%, 100% {
    background: color-mix(in srgb, var(--panel-soft) 90%, var(--danger) 10%);
    box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.18), 0 0 16px rgba(251, 113, 133, 0.18);
  }
  50% {
    background: color-mix(in srgb, var(--danger) 20%, var(--panel-soft) 80%);
    box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.32), 0 0 42px rgba(251, 113, 133, 0.5);
  }
}
.label {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.68rem;
  color: var(--accent-3);
  font-weight: 800;
}
h1, h2, h3, p { margin-top: 0; }
.title { font-size: clamp(1.3rem, 2.2vw, ${displayTitleSize}px); line-height: 1.12; margin: 6px 0 8px; color: var(--title-color); }
.subtitle { color: var(--subtitle-color); line-height: 1.5; font-size: calc(${displaySubtitleSize}px + 1pt); }
.muted, .status-note, .mission-story, .map-help { color: var(--paragraph-color); line-height: 1.55; font-size: ${displayParagraphSize}px; }
.muted, .mission-story { font-size: calc(${displayParagraphSize}px + 1pt); }
.free-response-note.muted { font-size: calc(0.82rem + 1pt); }
.progress-shell { margin-top: 18px; }
.progress-bar {
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}
.progress-bar > span {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent-3));
  transition: width 240ms ease;
}
.badge-row, .unlock-chip-row { display: flex; flex-wrap: wrap; gap: 10px; }
.badge-row { margin-bottom: 14px; }
.badge, .unlock-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.48rem 0.82rem;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-soft) 88%, white 12%);
  font-size: 0.78rem;
}
.map-grid {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  align-items: flex-end;
  justify-content: flex-start;
  margin-top: 6px;
  overflow-x: auto;
  padding-bottom: 10px;
}
.map-card {
  position: relative;
  min-width: 132px;
  border: 1px solid color-mix(in srgb, var(--room-station-color, var(--accent)) 58%, var(--line));
  border-bottom-color: color-mix(in srgb, var(--title-color) 22%, transparent);
  border-radius: var(--radius-md);
  background: linear-gradient(145deg, color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 12%, var(--panel)), var(--panel));
  color: var(--text);
  cursor: pointer;
  padding: 14px 18px 16px;
  text-align: center;
  font-weight: 800;
  letter-spacing: 0.02em;
  white-space: nowrap;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 12px 24px rgba(0,0,0,0.24);
  clip-path: polygon(8% 0, 100% 0, 92% 100%, 0 100%);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}
.map-card::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  clip-path: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent 36%);
  opacity: 0.75;
  pointer-events: none;
}
.map-card::after {
  content: "";
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent);
  opacity: 0.55;
  pointer-events: none;
}
.map-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent) 44%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 16px 28px rgba(0,0,0,0.3);
}
.map-card.is-locked {
  opacity: 0.45;
  cursor: not-allowed;
}
.map-card.is-complete {
  border-color: color-mix(in srgb, var(--success) 52%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 0 0 1px rgba(52,211,153,0.18),
    0 12px 24px rgba(0,0,0,0.24);
}
.map-card.is-active {
  z-index: 2;
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--accent) 72%, transparent);
  background: var(--panel-soft);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 18px 32px rgba(0,0,0,0.34),
    0 0 0 1px rgba(244,114,182,0.18);
}
.map-card.is-active::after {
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 66%, transparent), transparent);
  opacity: 0.9;
}
.mission-panel { margin-top: 20px; }
.mission-panel[data-room-palette] {
  border-color: color-mix(in srgb, var(--room-station-color) 58%, var(--line));
  background: linear-gradient(145deg, color-mix(in srgb, var(--room-theme-color) 8%, var(--panel-soft)), var(--panel-soft));
}
.mission-panel[data-room-palette] .mission-title,
.mission-panel[data-room-palette] .question-title {
  color: color-mix(in srgb, var(--room-theme-color) 62%, var(--title-color));
}
.mission-panel[data-room-palette] .label {
  color: var(--room-theme-color);
}
.mission-panel[data-room-palette] .primary {
  background: var(--room-theme-color);
}
.mission-panel[data-room-palette] .secondary {
  border-color: color-mix(in srgb, var(--room-station-color) 58%, var(--line));
  color: color-mix(in srgb, var(--room-station-color) 68%, var(--text));
}
.mission-panel[data-room-palette] .choice-card.is-selected,
.mission-panel[data-room-palette] .match-select:focus,
.mission-panel[data-room-palette] .field:focus {
  border-color: var(--room-theme-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--room-station-color) 24%, transparent);
}
.mission-title { font-size: clamp(1.4rem, 2.5vw, 2rem); margin-bottom: 8px; }
.challenge-box {
  padding: 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 12%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
}
.field, .choice-card, .match-item {
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-soft) 92%, black 8%);
  color: var(--text);
}
.field {
  width: 100%;
  padding: 0.92rem 1rem;
  font: inherit;
}
.field:focus { outline: none; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); border-color: color-mix(in srgb, var(--accent) 58%, transparent); }
.choice-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.choice-card[data-question-choice] {
  font-size: calc(clamp(1.125rem, 1.6vw, 1.375rem) - 1pt);
  line-height: 1.45;
  color: var(--choice-color);
}
${choiceColors.map((color, index) => `.choice-card[data-question-choice]:nth-child(4n + ${index + 1}) { --choice-color: ${color}; }`).join("\n")}
.choice-card {
  display: grid;
  place-items: center;
  min-height: 54px;
  padding: 10px 12px;
  line-height: 1.35;
  text-align: center;
  overflow-wrap: anywhere;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
@media (hover: hover) {
  .choice-card:not(.is-selected):hover {
    border-color: color-mix(in srgb, var(--accent-2) 54%, var(--line));
    background: color-mix(in srgb, var(--accent) 13%, var(--panel-soft));
    box-shadow: 0 10px 20px rgba(2, 6, 23, 0.18);
    transform: translateY(-2px);
  }
}
.choice-card[data-question-choice]:focus-visible {
  outline-color: var(--choice-color);
  background: color-mix(in srgb, var(--choice-color) 12%, var(--panel));
}
@media (hover: hover) {
  .choice-card[data-question-choice]:not(:disabled):hover {
    background: color-mix(in srgb, var(--choice-color) 12%, var(--panel));
    border-color: var(--choice-color);
  }
}
.choice-card.is-selected { border-color: color-mix(in srgb, var(--accent-2) 62%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-2) 28%, transparent); }
.timeout-results { width: min(760px, calc(100vw - 32px)); max-height: calc(100dvh - 40px); box-sizing: border-box; overflow: auto; padding: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); color: var(--text); box-shadow: var(--shadow); font-size: 15px; }
.timeout-results::backdrop { background: rgba(0,0,0,.65); }
.timeout-results-heading { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 14px; padding: 20px 24px; border-bottom: 1px solid var(--line); background: var(--panel); }
.timeout-heading-copy { flex: 1; min-width: 0; }
.timeout-clock { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 44px; border-radius: 12px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel)); border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); }
.timeout-clock svg { width: 24px; height: 24px; }
.timeout-results :is(h2,h3,p) { margin: 0; font-weight: 400; overflow-wrap: anywhere; }
.timeout-results h2 { font-size: 22px; line-height: 1.25; }
.timeout-results .timeout-game-title { margin-top: 5px; font-size: 13px; line-height: 1.45; color: var(--muted); }
.timeout-results button[data-results-close] { display: grid; place-items: center; padding: 0; width: 36px; height: 36px; flex: 0 0 36px; border-radius: 9px; background: var(--panel-soft); border: 1px solid var(--line); color: var(--text); font-size: 24px; line-height: 1; box-shadow: none; }
.timeout-results button[data-results-close]:hover { border-color: var(--accent); }
.timeout-results-body { padding: 20px 24px 24px; display: grid; gap: 16px; }
.timeout-results-footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; padding: 12px 24px; border-top: 1px solid var(--line); background: var(--panel); }
.timeout-results-footer button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border-radius: 9px; font-size: 14px; font-weight: 400; }
.timeout-result-room { overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--panel-soft) 25%, var(--panel)); }
.timeout-room-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; background: color-mix(in srgb, var(--accent) 6%, var(--panel)); border-bottom: 1px solid var(--line); }
.timeout-results h3 { font-size: 16px; letter-spacing: .03em; }
.timeout-grade { display: flex; align-items: baseline; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--text); }
.timeout-grade span { font-size: 28px; line-height: 1; }
.timeout-grade small { color: var(--muted); font-size: 13px; }
.timeout-meter { height: 3px; background: var(--line); }
.timeout-meter span { display: block; height: 100%; background: var(--accent); }
.timeout-result-room ol { list-style: none; padding: 0; margin: 0; }
.timeout-result-room li { padding: 14px 18px; }
.timeout-result-room li + li { border-top: 1px solid var(--line); }
.timeout-question-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 14px; }
.timeout-status { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 6px; font-size: 12px; border: 1px solid var(--line); background: color-mix(in srgb, var(--result-color) 12%, var(--panel)); color: var(--text); }
.timeout-status i { color: var(--result-color); font-style: normal; }
.timeout-status[data-result="correct"] { --result-color: var(--success); }
.timeout-status[data-result="incorrect"] { --result-color: var(--danger); }
.timeout-status[data-result="unanswered"] { --result-color: var(--muted); }
.timeout-results .timeout-feedback { margin-top: 8px; color: var(--muted); font-size: 14px; white-space: pre-wrap; line-height: 1.6; }
.timeout-results button:focus-visible, #timeoutResultsButton:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
@media (max-width: 480px) { .timeout-results { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); } .timeout-results-heading { padding: 16px 12px; gap: 10px; } .timeout-results-body { padding: 12px; gap: 12px; } .timeout-room-heading, .timeout-result-room li { padding: 12px; } .timeout-results h2 { font-size: 19px; } .timeout-clock { display: none; } }
.choice-card[data-question-choice].is-selected {
  outline: 2px solid var(--choice-color);
  outline-offset: 2px;
}
.match-grid { grid-template-columns: 1fr; }
.match-row-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; }
.match-item { padding: 12px 14px; cursor: default; font-weight: 700; }
.match-select {
  width: 100%;
  padding: 0.92rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-soft) 92%, black 8%);
  color: var(--text);
  font: inherit;
  color-scheme: dark;
}
.match-select option {
  background: var(--panel);
  color: var(--text);
}
.match-row-grid > .match-select {
  background: color-mix(in srgb, var(--room-station-color, var(--accent-2)) 22%, var(--panel));
  border-color: color-mix(in srgb, var(--room-station-color, var(--accent-2)) 55%, var(--line));
}
.match-row-grid > .match-select:not(:disabled):hover {
  background: color-mix(in srgb, var(--room-station-color, var(--accent-2)) 30%, var(--panel));
}
.match-select:focus { outline: none; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); border-color: color-mix(in srgb, var(--accent) 58%, transparent); }
.drag-match-board {
  display: grid;
  gap: 14px;
}
.drag-match-help {
  margin: 0;
  font-size: clamp(1.125rem, 1.6vw, 1.375rem);
  line-height: 1.5;
  color: var(--paragraph-color);
}
.drag-match-tray,
.drag-match-targets {
  display: grid;
  gap: 10px;
}
.drag-match-tray {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  min-height: 64px;
  padding: 12px;
  border: 1px dashed color-mix(in srgb, var(--room-station-color, var(--accent)) 56%, var(--line));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 8%, var(--panel));
}
.drag-match-targets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.drag-match-tile,
.drag-match-target {
  position: relative;
  min-height: 52px;
  border-radius: 16px;
  border: 1px solid var(--line);
  color: var(--text);
  font: inherit;
  font-weight: 750;
  transition: transform 150ms ease, border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
}
.drag-match-tile {
  z-index: 1;
  padding: 12px 14px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 18%, var(--panel-soft)), var(--panel-soft));
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.drag-match-tile:active,
.drag-match-tile.is-dragging { cursor: grabbing; }
.drag-match-tile.is-selected {
  border-color: var(--room-theme-color, var(--accent-2));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--room-station-color, var(--accent)) 24%, transparent), 0 12px 24px rgba(2, 6, 23, 0.24);
  transform: translateY(-2px);
}
.drag-match-target {
  display: grid;
  grid-template-columns: minmax(96px, 0.9fr) minmax(112px, 1.1fr);
  align-items: stretch;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--panel-soft) 92%, black 8%);
  text-align: left;
}
.drag-match-target-label,
.drag-match-target-slot {
  display: flex;
  min-width: 0;
  min-height: 52px;
  align-items: center;
  padding: 11px 13px;
}
.drag-match-target-label { border-right: 1px solid var(--line); font-size: calc(1em - 4pt); }
.drag-match-target-slot {
  font-size: calc(1em - 2pt);
  justify-content: center;
  color: var(--paragraph-color);
  background: color-mix(in srgb, var(--room-theme-color, var(--accent-2)) 7%, transparent);
}
.drag-match-target.is-filled .drag-match-target-slot {
  color: var(--text);
  font-weight: 800;
}
.drag-match-target.is-drop-ready,
.drag-match-target:hover {
  border-color: var(--room-theme-color, var(--accent-2));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--room-station-color, var(--accent)) 20%, transparent);
}
.drag-match-target.is-correct {
  border-color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, var(--panel));
}
.drag-match-target.is-wrong { animation: drag-match-shake 360ms ease both; border-color: var(--danger); }
.drag-match-empty { grid-column: 1 / -1; align-self: center; text-align: center; color: var(--paragraph-color); }
.word-bank-passage { line-height: 2.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.word-bank-passage .word-bank-slot { display: inline-flex; vertical-align: middle; min-width: 7ch; max-width: 100%; min-height: 44px; line-height: 1.3; margin: 3px 5px; border: 2px dashed var(--accent); border-radius: 9px; background: color-mix(in srgb, var(--accent) 12%, var(--panel)); }
.word-bank-passage .word-bank-slot .drag-match-target-slot { padding: 4px 12px; font-size: inherit; white-space: normal; }
.word-bank-slot:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.word-bank-board .drag-match-tray { display: flex; flex-wrap: wrap; gap: 10px; }
.word-bank-board .drag-match-tile { min-height: 44px; max-width: 100%; overflow-wrap: anywhere; }
@keyframes drag-match-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-7px) rotate(-0.5deg); }
  55% { transform: translateX(6px) rotate(0.5deg); }
  80% { transform: translateX(-3px); }
}
@media (max-width: 720px) {
  .drag-match-targets { grid-template-columns: 1fr; }
  .drag-match-target { grid-template-columns: minmax(88px, 0.8fr) minmax(112px, 1.2fr); }
}
@media (prefers-reduced-motion: reduce) {
  .drag-match-tile,
  .drag-match-target { transition: none; }
  .drag-match-target.is-wrong { animation: none; }
}
.media-card-empty {
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--line);
  background: color-mix(in srgb, var(--panel-soft) 78%, transparent);
  margin-bottom: 24px;
}
.media-card img, .media-card video { width: 100%; border-radius: var(--radius-md); display: block; }
.media-card audio { width: 100%; }
.ending-media {
  display: grid;
  gap: 12px;
  margin: 18px auto 10px;
  max-width: 760px;
}
.ending-media img {
  width: 100%;
  display: block;
  border-radius: var(--radius-md);
}
.button-row { display: flex; flex-wrap: wrap; gap: 12px; }
button {
  appearance: none;
  border: none;
  border-radius: 16px;
  padding: 0.88rem 1rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 400;
  cursor: pointer;
}
.primary { background: var(--button-bg); color: var(--button-text); }
.secondary { background: var(--button-bg); color: var(--button-text); border: 1px solid rgba(255,255,255,0.12); opacity: 0.88; }
h2, h3, .mission-title, .question-title {
  color: var(--title-color);
}
.game-card, .hero-panel, .meta-panel, .map-panel, .mission-panel, .ending-panel, .challenge-box, .field, .choice-card, .match-item, .match-select, .media-card-empty, .hint-box {
  background: var(--panel);
}
.hint-box {
  margin-top: 12px;
  border-radius: var(--radius-md);
  padding: 14px 16px;
}
.hint-box { background: color-mix(in srgb, var(--warn) 12%, var(--panel)); border: 1px solid color-mix(in srgb, var(--warn) 26%, transparent); color: color-mix(in srgb, var(--warn) 70%, white 30%); }
.status-box { display: flex; align-items: flex-start; gap: 10px; text-align: left; margin-top: 12px; padding: 8px 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--muted); line-height: 1.5; }
.status-box::before {
  content: "";
  flex: 0 0 1.15em;
  width: 1.15em;
  height: 1.15em;
  margin-top: .175em;
  background-color: currentColor;
  --status-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 11v6M12 7v.01'/%3E%3C/svg%3E");
  -webkit-mask: var(--status-icon) center / contain no-repeat;
  mask: var(--status-icon) center / contain no-repeat;
  mask-mode: alpha;
}
.status-box.is-good::before { --status-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='m7.5 12 3 3 6-6'/%3E%3C/svg%3E"); }
.status-box.is-bad::before { --status-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='m9 9 6 6m0-6-6 6'/%3E%3C/svg%3E"); }
.status-box:empty { display: none; }
.status-box.is-good { color: color-mix(in srgb, var(--success) 64%, white 36%); }
.status-box.is-bad { color: color-mix(in srgb, var(--danger) 68%, white 32%); }
[data-room-completion-notice] { margin-bottom: 18px; font-weight: 750; }
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
button:focus-visible,
.field:focus-visible,
.match-select:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent-2) 78%, white 22%);
  outline-offset: 4px;
}
.menu-mode .game-shell {
  padding-top: 72px;
  padding-bottom: 48px;
}
.menu-mode .menu-game-card {
  padding: clamp(18px, 3vw, 34px);
}
.menu-mode .gallery-stage {
  width: 100%;
}
.menu-mode .gallery-screen[data-gallery-screen="mission"].is-active {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto;
}
.menu-hero {
  display: grid;
  gap: clamp(18px, 2.3vw, 30px);
  padding: clamp(22px, 3vw, 42px);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 76% 18%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 34%),
    linear-gradient(112deg, color-mix(in srgb, var(--bg) 70%, #001d29), var(--panel-soft)),
    var(--panel-soft);
  overflow: hidden;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--accent) 20%, transparent), 0 22px 48px rgba(2, 6, 23, 0.28);
}
.menu-hero-heading { display: flex; align-items: flex-start; gap: 18px; padding-bottom: clamp(16px, 2vw, 24px); border-bottom: 1px solid var(--line); }
.menu-hero-mark { display: grid; flex: 0 0 54px; width: 54px; height: 54px; place-items: center; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 65%, var(--line)); border-radius: 50%; background: color-mix(in srgb, var(--accent) 9%, transparent); box-shadow: inset 0 0 0 5px color-mix(in srgb, var(--accent) 7%, transparent); }
.menu-hero-mark svg { width: 29px; height: 29px; }
.menu-hero-copy {
  min-width: 0;
  max-width: 940px;
}
.menu-hero-copy .label { color: var(--accent); }
.menu-hero-copy .title { margin: 7px 0 8px; font-size: clamp(1.85rem, 4vw, 3.25rem); }
.menu-hero-copy .subtitle { margin: 0; color: var(--subtitle-color); font-size: calc(clamp(1rem, 2vw, 1.28rem) + 1pt); }
.menu-hero-copy .title,
.menu-hero-copy .subtitle,
.section-card-title,
.menu-detail-copy {
  overflow-wrap: anywhere;
}
.menu-hero-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(230px, .48fr);
  gap: clamp(20px, 3vw, 42px);
  align-items: stretch;
}
.menu-progress-area { min-width: 0; }
.menu-progress-eyebrow { margin: 0 0 6px; color: var(--accent); font-size: .76rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.menu-progress-lead { margin: 0 0 18px; color: var(--subtitle-color); }
.menu-progress-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; }
.menu-progress-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(76px, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.menu-progress-step { display: grid; gap: 7px; min-width: 0; color: var(--muted); font-size: .72rem; text-align: center; }
.menu-progress-step::before { content: attr(data-step); display: grid; width: 42px; height: 42px; margin: 0 auto; place-items: center; color: var(--text); font-size: 1.15rem; font-weight: 800; border: 3px solid color-mix(in srgb, var(--muted) 28%, transparent); border-radius: 50%; background: color-mix(in srgb, var(--panel) 70%, black 30%); }
.menu-progress-step.is-active { color: var(--accent); font-weight: 700; }
.menu-progress-step.is-active::before { border-color: var(--accent); box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 10%, transparent); }
.menu-progress-step.is-complete::before { color: var(--bg); border-color: var(--success); background: var(--success); }
.menu-progress-step span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-progress-count { align-self: center; min-width: 128px; padding: 14px; color: var(--muted); text-align: center; border: 1px solid var(--line); border-radius: var(--radius-md); background: color-mix(in srgb, var(--panel) 68%, transparent); }
.menu-progress-count strong { display: block; color: var(--text); font-size: 1.65rem; line-height: 1; }
.menu-progress-count span { display: block; margin-top: 6px; font-size: .7rem; }
.menu-hero-controls { display: grid; align-content: center; gap: 16px; padding-left: clamp(18px, 3vw, 42px); border-left: 1px solid var(--line); }
.menu-hero-controls .timer-shell { justify-content: center; width: fit-content; }
.menu-hero-controls .timer-value { font-size: clamp(1.08rem, 2vw, 1.3rem); }
.menu-hero-controls .hero-controls { justify-content: flex-start; }
.menu-hero-controls .hero-controls .primary, .menu-hero-controls .hero-controls .secondary { width: 100%; }
.menu-progress { display: none; }
.menu-hero-tip { display: flex; align-items: center; gap: 14px; padding: 14px 16px; color: var(--subtitle-color); border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line)); border-radius: var(--radius-md); background: color-mix(in srgb, var(--accent) 7%, var(--panel)); }
.menu-hero-tip svg { flex: 0 0 28px; width: 28px; height: 28px; color: var(--warn); }
.menu-hero-tip strong { display: block; margin-bottom: 2px; color: color-mix(in srgb, var(--warn) 70%, var(--text)); }
.menu-hero-tip p { margin: 0; font-size: .88rem; }
.sections-panel {
  display: grid;
  gap: 16px;
}
.sections-panel-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.sections-panel-heading h2,
.sections-panel-heading p {
  margin-bottom: 0;
}
.sections-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.section-card {
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto;
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 270px;
  padding: 14px;
  overflow: hidden;
  text-align: left;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 34px rgba(2, 6, 23, 0.28);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
}
.section-card[data-menu-mission] {
  border-color: color-mix(in srgb, var(--room-station-color) 58%, var(--line));
  background: linear-gradient(145deg, color-mix(in srgb, var(--room-theme-color) 12%, var(--panel)), var(--panel));
  box-shadow: inset 5px 0 0 color-mix(in srgb, var(--room-station-color) 78%, transparent), 0 16px 34px rgba(2, 6, 23, 0.28);
}
.section-card[data-menu-mission] .section-card-kicker {
  color: var(--room-theme-color);
}
.section-card:not(:disabled):hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--accent) 62%, transparent);
  box-shadow: 0 22px 42px rgba(2, 6, 23, 0.4);
}
.section-card:disabled {
  cursor: not-allowed;
  opacity: 0.64;
}
.section-card.is-complete {
  border-color: color-mix(in srgb, var(--success) 58%, transparent);
}
.section-card-media,
.section-card-fallback {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 16%, var(--panel-soft));
}
.section-card-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.section-card-fallback {
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 28% 24%, color-mix(in srgb, var(--accent-2) 28%, transparent), transparent 38%),
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--panel-soft)), var(--panel));
}
.section-card-fallback svg {
  width: 42%;
  max-width: 88px;
  fill: none;
  stroke: var(--title-color);
  stroke-width: 1.65;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.section-card-kicker {
  color: var(--accent-2);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.section-card-title {
  display: block;
  min-width: 0;
  font-size: clamp(1rem, 1.8vw, 1.2rem);
  line-height: 1.25;
}
.section-card-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: end;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 800;
}
.section-card-status::before {
  content: "○";
  font-size: 0.9rem;
}
.section-card.is-locked .section-card-status::before {
  content: "🔒";
  font-size: 0.78rem;
}
.section-card.is-complete .section-card-status {
  color: var(--success);
}
.section-card.is-complete .section-card-status::before {
  content: "✓";
}
.menu-detail-screen {
  min-width: 0;
  isolation: isolate;
}
.menu-detail-shell {
  display: grid;
  gap: 20px;
  padding: clamp(18px, 4vw, 38px);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel-soft);
}
.menu-detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.menu-mission-shell {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.menu-mode .gallery-screen[data-gallery-screen="mission"].is-active {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto;
  gap: 16px;
}
.menu-mode .gallery-screen[data-gallery-screen="mission"].is-active > .menu-mission-shell {
  grid-column: 1;
  grid-row: auto;
  min-width: 0;
}
.menu-mode .menu-mission-shell > .menu-detail-toolbar {
  position: sticky;
  top: 12px;
  z-index: 3;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--panel-soft) 94%, black 6%);
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.24);
  backdrop-filter: blur(14px);
}
.menu-mission-shell .menu-detail-toolbar-actions {
  display: flex;
  margin-left: auto;
}
.menu-mode .menu-mission-shell > #missionStage {
  min-width: 0;
}
.menu-detail-media img {
  display: block;
  width: min(100%, 820px);
  max-height: 460px;
  margin: 0 auto;
  object-fit: cover;
  border-radius: var(--radius-md);
}
.menu-detail-copy {
  max-width: 78ch;
  margin: 0 auto;
  color: var(--paragraph-color);
  font-size: ${theme.paragraphSize}px;
  line-height: 1.7;
  white-space: pre-line;
}
.menu-mode #missionStage {
  min-width: 0;
}
.menu-mode #missionStage .mission-panel:first-child {
  margin-top: 0;
}
.menu-mode .mission-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}
.hidden { display: none !important; }
@media (max-width: 900px) {
  .game-shell {
    padding: 52px 14px 14px;
    gap: 10px;
  }
  .game-header {
    top: 0;
    padding: 12px;
    gap: 10px;
    flex-wrap: nowrap;
  }
  .game-header button,
  .game-header .secondary {
    padding: 0.72rem 0.9rem;
    border-radius: 14px;
    font-size: 0.78rem;
  }
  .game-header-center {
    gap: 10px;
  }
  .gallery-step,
  .question-progress {
    font-size: 0.74rem;
  }
  .game-card {
    width: 100%;
    padding: 16px;
    border-radius: 22px;
  }
  .gallery-stage {
    width: 100%;
    gap: 14px;
  }
  .hero-grid, .match-grid {
    grid-template-columns: 1fr;
  }
  .title {
    font-size: clamp(1.6rem, 7vw, ${Math.max(30, theme.titleSize - 8)}px);
    margin: 8px 0 10px;
  }
  .subtitle, .muted, .status-note, .mission-story, .map-help {
    line-height: 1.5;
    font-size: ${Math.max(12, Math.min(theme.paragraphSize, 18))}px;
  }
  .subtitle, .muted, .mission-story { font-size: calc(${Math.max(12, Math.min(theme.paragraphSize, 18))}px + 1pt); }
  .badge-row {
    margin-bottom: 10px;
  }
  .badge, .unlock-chip {
    padding: 0.42rem 0.72rem;
    font-size: 0.72rem;
  }
  .hero-panel,
  .meta-panel,
  .map-panel,
  .mission-panel,
  .ending-panel {
    padding: 14px;
    border-radius: 18px;
  }
  .hero-media img {
    width: 100%;
  }
  .gallery-screen[data-gallery-screen="mission"].is-active {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    gap: 12px;
  }
  .gallery-screen[data-gallery-screen="mission"].is-active > .map-panel {
    grid-column: 1;
    grid-row: auto;
    position: static;
    top: auto;
    width: 100%;
  }
  .gallery-screen[data-gallery-screen="mission"].is-active > #missionStage {
    grid-column: 1;
    grid-row: auto;
  }
  .gallery-screen[data-gallery-screen="mission"].is-active > .map-panel .map-grid {
    gap: 8px;
    padding-bottom: 0;
  }
  .map-grid {
    gap: 8px;
    padding-bottom: 6px;
  }
  .map-card {
    min-width: 108px;
    padding: 12px 14px 14px;
    font-size: 0.82rem;
  }
  .mission-title {
    font-size: clamp(1.2rem, 5.4vw, 1.7rem);
  }
  .challenge-box {
    padding: 12px;
  }
  .question-card .media-card {
    margin: 10px 0 18px;
  }
  .question-title {
    font-size: calc(1.02rem + 2pt);
  }
  .question-response-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .question-response-row.is-inline-answer {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
  .question-challenge {
    flex-basis: auto;
  }
  .field.question-answer-input,
  .match-select,
  .field {
    width: 100%;
    padding: 0.82rem 0.92rem;
    font-size: 0.96rem;
  }
  .question-response-row.is-inline-answer .field.question-answer-input.is-number {
    width: min(100%, 180px);
  }
  .field.question-answer-input.is-number {
    width: min(100%, 180px);
  }
  .choice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .choice-card,
  .match-item {
    padding: 10px;
  }
  .button-row {
    gap: 10px;
  }
  .question-response-row .question-actions {
    align-self: stretch;
    width: 100%;
    margin-left: 0;
  }
  .question-response-row.is-inline-answer .question-actions {
    width: 100%;
    align-self: stretch;
  }
  .question-actions {
    width: 100%;
  }
  .question-actions .secondary,
  .question-actions .primary,
  .mission-actions .secondary,
  .mission-actions .primary {
    width: auto;
  }
  .sections-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .menu-mode .game-shell {
    padding-top: 52px;
    padding-bottom: 32px;
  }
}

@media (max-width: 560px) {
  .fullscreen-toggle {
    width: 30px;
    height: 30px;
    min-height: 30px;
    flex-basis: 30px;
    padding: 0;
  }
  .menu-mode .game-shell {
    padding-top: 42px;
  }
  .game-logo-brand {
    flex-basis: 24px;
    width: 24px;
    height: 24px;
  }
  .game-shell {
    padding: 42px 10px 10px;
    gap: 8px;
  }
  .game-header {
    top: 0;
    padding: 10px;
    gap: 8px;
  }
  .game-header-actions { justify-self: end; min-width: 0; }
  .game-header-actions > .secondary { min-width: 0; white-space: normal; }
  .game-header button,
  .game-header .secondary {
    padding: 0.62rem 0.78rem;
    font-size: 0.72rem;
    border-radius: 12px;
  }
  .gallery-step,
  .question-progress {
    font-size: 0.68rem;
  }
  .game-card {
    padding: 12px;
    border-radius: 18px;
  }
  .gallery-stage {
    gap: 12px;
  }
  .hero-panel,
  .meta-panel,
  .map-panel,
  .mission-panel,
  .ending-panel {
    padding: 12px;
    border-radius: 16px;
  }
  .title {
    font-size: clamp(1.4rem, 8vw, 2rem);
  }
  .subtitle, .muted, .status-note, .mission-story, .map-help {
    font-size: 0.9rem;
  }
  .subtitle, .muted, .mission-story { font-size: calc(0.9rem + 1pt); }
  .badge-row {
    gap: 8px;
  }
  .badge, .unlock-chip {
    padding: 0.38rem 0.64rem;
  }
  .map-card {
    min-width: 96px;
    padding: 10px 12px 12px;
    font-size: 0.76rem;
  }
  .question-title {
    font-size: calc(0.96rem + 2pt);
  }
  .question-challenge .choice-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .question-card.is-media-answer-split > .media-card {
    margin: 10px 0 18px;
  }
  .field,
  .match-select {
    padding: 0.76rem 0.86rem;
    font-size: 0.92rem;
  }
  .question-challenge .match-row-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .question-challenge .match-row-grid > .match-item,
  .question-challenge .match-row-grid > .match-select {
    grid-column: 1;
  }
  .button-row {
    gap: 8px;
  }
  .hero-status-row {
    align-items: flex-start;
  }
  .timer-shell:not(.timer-header) {
    width: 100%;
    justify-content: space-between;
  }
  button {
    padding: 0.72rem 0.84rem;
    border-radius: 12px;
  }
  .sections-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .section-card {
    min-height: 0;
  }
  .menu-hero-meta,
  .menu-detail-toolbar {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }
  .menu-hero {
    padding: 20px 16px;
  }
  .menu-hero-heading {
    gap: 12px;
  }
  .menu-hero-mark {
    flex-basis: 44px;
    width: 44px;
    height: 44px;
  }
  .menu-progress-line {
    grid-template-columns: minmax(0, 1fr);
  }
  .menu-progress-count {
    justify-self: stretch;
  }
  .menu-hero-controls {
    padding: 16px 0 0;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .menu-hero-controls .timer-shell,
  .menu-hero-controls .hero-controls,
  .menu-detail-toolbar .secondary {
    width: 100%;
  }
  .menu-hero-controls .hero-controls button {
    flex: 1 1 150px;
  }
  .menu-mode .mission-actions {
    justify-content: stretch;
  }
  .menu-mode .mission-actions button {
    flex: 1 1 140px;
  }
}

/* Navegación flotante compartida por el preview y el paquete exportado. */
.gallery-screen[data-gallery-screen="mission"].is-active {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto;
  gap: 0;
  padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px));
}
.gallery-screen[data-gallery-screen="mission"].is-active > .map-panel {
  position: fixed;
  z-index: 55;
  left: 50%;
  right: auto;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  top: auto;
  grid-column: auto;
  grid-row: auto;
  width: min(420px, calc(100vw - 24px));
  max-height: min(36vh, 156px);
  margin: 0;
  padding: 8px;
  overflow-x: hidden;
  overflow-y: auto;
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-soft) 92%, transparent);
  box-shadow: 0 16px 40px rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(18px);
  transform: translateX(-50%);
  scrollbar-width: thin;
  overscroll-behavior: contain;
}
.gallery-screen[data-gallery-screen="mission"].is-active > #missionStage {
  grid-column: 1;
  grid-row: auto;
  min-width: 0;
}
.gallery-screen[data-gallery-screen="mission"].is-active > .map-panel .map-grid,
.map-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: stretch;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: visible;
}
.gallery-screen[data-gallery-screen="mission"].is-active > .map-panel .map-card,
.map-card {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  padding: 6px 7px;
  border-radius: 9px;
  clip-path: none;
  font-size: clamp(0.64rem, 2.4vw, 0.74rem);
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 10px rgba(0,0,0,0.2);
}
.map-card::before {
  clip-path: none;
}
.map-card::after {
  display: none;
}
.map-card:hover,
.map-card.is-active {
  transform: none;
}
.game-shell,
.menu-mode .game-shell {
  padding-top: calc(var(--game-toolbar-height, 72px) + 12px);
}
@media (max-width: 420px) {
  .game-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
  }
  .game-header-center { grid-row: 2; grid-column: 1 / -1; }
  html:fullscreen body:not(.menu-mode) .game-shell,
  html.is-fullscreen body:not(.menu-mode) .game-shell {
    padding-top: calc(var(--game-toolbar-height, 110px) + 12px);
  }
}
.game-header .fullscreen-toggle {
  width: 32px;
  height: 32px;
  min-height: 32px;
  flex-basis: 32px;
  padding: 0;
  border-radius: 9px;
}
/* Compact section corners, shared by every layout and the exported game. */
.game-shell {
  --section-radius: min(10px, var(--radius-lg));
  --section-inner-radius: min(8px, var(--radius-md));
}
.game-shell :is(.game-card, .hero-panel, .meta-panel, .map-panel, .mission-panel, .ending-panel, .investigation-board, .menu-hero, .section-card) {
  border-radius: var(--section-radius);
}
.gallery-screen[data-gallery-screen="mission"].is-active > .map-panel {
  border-radius: var(--section-radius);
}
.game-shell :is(.investigation-document, .investigation-objective, .evidence-card, .briefing-review, .challenge-box, .hint-box, .media-card, .media-card img, .media-card video, .menu-hero-tip, .menu-progress-count) {
  border-radius: var(--section-inner-radius);
}
.game-shell .briefing-review .investigation-board {
  border-radius: 0 0 var(--section-inner-radius) var(--section-inner-radius);
}
/* Button labels keep their individual responsive sizes, increased by 2pt. */
button[type="button"] { font-size: calc(0.78rem + 2pt); }
button[type="button"].choice-card[data-question-choice] { font-size: calc(clamp(1.125rem, 1.6vw, 1.375rem) - 1pt); }
button[type="button"].sequence-move { font-size: calc(1.1rem + 2pt); }
button[type="button"].final-passcode-tile { font-size: calc(1.35rem + 2pt); }
button[type="button"]:is(.drag-match-target, .fullscreen-toggle) { font-size: calc(1em + 2pt); }
button[type="button"].drag-match-tile { font-size: 1em; }
button[type="button"].map-card { font-size: calc(clamp(0.64rem, 2.4vw, 0.74rem) + 2pt); }
button[type="button"].map-card.is-complete { font-size: calc(clamp(0.64rem, 2.4vw, 0.74rem) + 4pt); }
#mapGrid button[type="button"].map-card { font-size: calc(clamp(0.64rem, 2.4vw, 0.74rem) + 3pt); }
#mapGrid button[type="button"].map-card.is-complete { font-size: calc(clamp(0.64rem, 2.4vw, 0.74rem) + 5pt); }
button[type="button"] .section-card-kicker { font-size: calc(0.72rem + 2pt); }
button[type="button"] .section-card-title { font-size: calc(clamp(1rem, 1.8vw, 1.2rem) + 2pt); }
button[type="button"] .section-card-status { font-size: calc(0.82rem + 2pt); }
@media (max-width: 560px) {
  .game-header button[type="button"] { font-size: calc(0.72rem + 2pt); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  .ending-panel.is-alert {
    animation: none;
    border-width: 2px;
  }
}

@keyframes green-blink {
  0%, 100% {
    background: var(--panel);
    box-shadow: 0 0 10px rgba(0, 255, 0, 0);
  }
  50% {
    background: color-mix(in srgb, var(--success) 20%, var(--panel));
    box-shadow: 0 0 30px var(--success);
  }
}
.is-success-flash {
  animation: green-blink 0.5s ease-in-out 4 !important;
}
`;
}

export function buildGameRuntime(project, options = {}) {
  const normalized = normalizeRuntimeProject(project);
  const messages = getGameMessages(normalized.idioma);
  const isMenuMode = normalized.modo_presentacion === "menu_secciones";
  const initialUnlocked = isMenuMode
    ? []
    : normalized.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id);
  const finalPasscode = resolveFinalPasscode(normalized);
  const progressFingerprint = buildProgressFingerprint(normalized);
  const runtimeProject = {
    ...normalized,
    misiones: normalized.misiones.map((mission) => buildRuntimeMission(mission, initialUnlocked))
  };

  return `const ESCAPE_ROOM_DATA = ${serializeForJavaScript(runtimeProject)};
const EXP = (${createExperienceEngine.toString()})();
const REWARDS = (${createRewardEngine.toString()})(EXP);
const ESCAPE_ROOM_I18N = ${serializeForJavaScript(messages)};
const ESCAPE_ROOM_FINAL_PASSCODE = ${JSON.stringify(finalPasscode.code)};
const ESCAPE_ROOM_FINAL_PASSCODE_IS_FALLBACK = ${finalPasscode.isFallback ? "true" : "false"};
const ESCAPE_ROOM_PRESENTATION_MODE = ${JSON.stringify(isMenuMode ? "menu_secciones" : "salas")};
const ESCAPE_ROOM_PROGRESS_VERSION = 5;
const ESCAPE_ROOM_PROGRESS_FINGERPRINT = ${JSON.stringify(progressFingerprint)};
const REVIEW_PROGRESS_ID = ${JSON.stringify(options.progressIdentity || "")};

// ${isMenuMode
  ? "Runtime de menú por secciones: las actividades se desbloquean de forma secuencial."
  : "Runtime de mapa libre: las salas desbloqueadas se eligen en cualquier orden permitido."}
(function initEscapeRoomGame() {
  const IS_MENU_MODE = ESCAPE_ROOM_PRESENTATION_MODE === "menu_secciones";
  const DEFAULT_DURATION_MINUTES = ${JSON.stringify(normalized.duracion_minutos || 35)};
  function t(key, params = {}) {
    if(ESCAPE_ROOM_DATA.reward_plan?.type==='imagen'){
      if(['finalCode','finalCodeAvailable','continueToFinalChallenge','finalCodePuzzleLabel'].includes(key))return REWARDS.puzzleText(ESCAPE_ROOM_DATA.idioma,'title');
      if(['finalCodeAutofilled','finalCodeEditorialVerified'].includes(key))return REWARDS.puzzleText(ESCAPE_ROOM_DATA.idioma,'verify');
    }
    const template = String(ESCAPE_ROOM_I18N[key] ?? key);
    return template.replace(/\\{([a-zA-Z0-9_]+)\\}/g, (_, name) => String(params[name] ?? "{" + name + "}"));
  }
  function safeFocus(element, options = { preventScroll: true }) {
    if (!element || typeof element.focus !== "function") return;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return;
    try {
      element.focus(options);
    } catch (_) {}
  }
  function getMissionPaletteStyle(mission) {
    const palette = mission?.paleta_academica || {};
    const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
    const stationColor = safeColor(palette.color_estacion, "#fcc659");
    const themeColor = safeColor(palette.color_tema_unidad, "#2da6b1");
    return "--room-station-color:" + stationColor
      + ";--room-theme-color:" + themeColor
      + ";--accent:" + stationColor
      + ";--accent-2:" + themeColor
      + ";--button-bg:" + themeColor + ";";
  }
  function getFinalPasscodeTokens() {
    return Array.from(String(ESCAPE_ROOM_FINAL_PASSCODE || "")).map((character, index) => ({
      id: "final-character-" + index,
      character
    }));
  }
  const FINAL_PASSCODE_TOKENS = getFinalPasscodeTokens();
  function buildInitialFinalPasscodeOrder() {
    const order = FINAL_PASSCODE_TOKENS.map((token) => token.id);
    if (order.length < 2) return order;
    let seed = Array.from(String(ESCAPE_ROOM_FINAL_PASSCODE || "")).reduce((total, character, index) => (
      ((total * 33) ^ (character.codePointAt(0) + index + 1)) >>> 0
    ), 2166136261);
    for (let index = order.length - 1; index > 0; index -= 1) {
      seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 3266489917) >>> 0;
      const target = seed % (index + 1);
      [order[index], order[target]] = [order[target], order[index]];
    }
    const tokenById = new Map(FINAL_PASSCODE_TOKENS.map((token) => [token.id, token]));
    const assembled = order.map((id) => tokenById.get(id)?.character || "").join("");
    const original = FINAL_PASSCODE_TOKENS.map((token) => token.character).join("");
    if (assembled === original) {
      const differentIndex = FINAL_PASSCODE_TOKENS.findIndex((token) => token.character !== FINAL_PASSCODE_TOKENS[0].character);
      if (differentIndex > 0) [order[0], order[differentIndex]] = [order[differentIndex], order[0]];
    }
    return order;
  }
  const state = {
    unlocked: new Set(IS_MENU_MODE ? [] : ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id)),
    completed: new Set(),
    completedQuestions: new Set(),
    readBriefings: new Set(ESCAPE_ROOM_DATA.misiones.filter((mission) => mission.contexto_requerido === false).map((mission) => mission.id)),
    experience: EXP.metrics(),
    questionAnswers: {},
    questionChoices: {},
    questionMatches: {},
    questionDragMatches: {},
    questionDragLocked: {},
    selectedDragTiles: {},
    questionSequenceOrders: {},
    questionSequenceTouched: {},
    timeoutResults: null,
    selectedSequenceItems: {},
    activeSequencePointer: null,
    activeDragPointer: null,
    suppressDragClickUntil: 0,
    currentMissionId: IS_MENU_MODE
      ? (ESCAPE_ROOM_DATA.misiones[0]?.id || null)
      : (ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null),
    galleryScreen: IS_MENU_MODE ? "menu" : "intro",
    lastMenuFocusSelector: '[data-menu-section="intro"]',
    missionEventsBound: false,
    durationSeconds: 0,
    isStarted: false,
    isFinished: false,
    startedAtMs: null,
    endAtMs: null,
    briefingTimerPausedAtMs: null,
    remainingSecondsAtFinish: null,
    timerIntervalId: null,
    isMasterSolved: false,
    finalPasscodeOrder: buildInitialFinalPasscodeOrder(),
    selectedFinalPasscodeToken: null,
    finalPasscodePointer: null,
    suppressFinalPasscodeClickUntil: 0,
    alertAudioContext: null,
    alertAudioNodes: null,
    nowOverrideMs: null,
    isImmersiveFallback: false,
    immersiveScrollY: 0,
    isHostFullscreen: false,
    editorialReviewContextKey: "",
    pendingRoomCompletionFeedback: "",
    roomUnlockTransition: null,
    roomUnlockTimeoutId: null
  };

  function isStorageAvailable() {
    try {
      const key = "__escape_room_runtime_test__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function getLegacyProgressStorageKey() {
    const slug = normalizeBaseText(ESCAPE_ROOM_DATA.titulo || "escape-room") || "escape-room";
    return "escapeRoomGame.progress." + slug;
  }

  let restoredReviewScrollY = 0;

  function getProgressStorageKey() {
    if (REVIEW_PROGRESS_ID) return "PigPenCreator.reviewProgress.v1." + encodeURIComponent(REVIEW_PROGRESS_ID);
    return getLegacyProgressStorageKey()
      + ".v" + ESCAPE_ROOM_PROGRESS_VERSION
      + "." + ESCAPE_ROOM_PRESENTATION_MODE
      + "." + ESCAPE_ROOM_PROGRESS_FINGERPRINT;
  }

  function serializeProgressState() {
    return {
      questionSignatures: getQuestionSignatures(),
      scrollY: REVIEW_PROGRESS_ID ? window.scrollY : 0,
      finalCode: ESCAPE_ROOM_FINAL_PASSCODE,
      rewardFingerprint: JSON.stringify(ESCAPE_ROOM_DATA.reward_plan || null),
      version: ESCAPE_ROOM_PROGRESS_VERSION,
      mode: ESCAPE_ROOM_PRESENTATION_MODE,
      fingerprint: ESCAPE_ROOM_PROGRESS_FINGERPRINT,
      briefingFlowVersion: 2,
      completed: [...state.completed],
      completedQuestions: [...state.completedQuestions],
      readBriefings: [...state.readBriefings],
      experience: state.experience,
      questionAnswers: state.questionAnswers,
      questionChoices: state.questionChoices,
      questionMatches: state.questionMatches,
      questionDragMatches: state.questionDragMatches,
      questionDragLocked: state.questionDragLocked,
      questionSequenceOrders: state.questionSequenceOrders,
      questionSequenceTouched: state.questionSequenceTouched,
      timeoutResults: state.timeoutResults,
      currentMissionId: state.currentMissionId,
      galleryScreen: state.galleryScreen,
      unlocked: [...state.unlocked],
      durationSeconds: state.durationSeconds,
      isStarted: state.isStarted,
      isFinished: state.isFinished,
      startedAtMs: state.startedAtMs,
      endAtMs: state.endAtMs,
      briefingTimerPausedAtMs: state.briefingTimerPausedAtMs,
      remainingSecondsAtFinish: state.remainingSecondsAtFinish,
      isMasterSolved: state.isMasterSolved,
      finalPasscodeOrder: state.finalPasscodeOrder
      ,roomUnlockTransition: state.roomUnlockTransition
    };
  }

  function getQuestionSignatures() {
    return Object.fromEntries(ESCAPE_ROOM_DATA.misiones.flatMap(mission => mission.preguntas.map(q => [mission.id + "::" + q.id,
      JSON.stringify([q.tipo_interaccion, q.interaction_contract_version, q.interaction_data, q.extra_hint, q.reto, q.respuesta_correcta, q.respuestas_aceptadas,
        q.opciones, (q.parejas || []).map(pair => [pair.izquierda, pair.derecha]), q.elementos, q.texto_con_hueco, q.subtipo_respuesta, q.content_revision,
        q.tipo_interaccion === "multimedia" ? [q.imagen, q.media] : null])
    ])));
  }

  function reconcileReviewProgress(parsed) {
    const signatures = getQuestionSignatures();
    const changed = new Set(Object.keys(signatures).filter(key => parsed.questionSignatures?.[key] !== signatures[key]));
    const valid = key => Object.hasOwn(signatures, key) && !changed.has(key);
    parsed.completedQuestions = (parsed.completedQuestions || []).filter(valid);
    for (const field of ["questionAnswers", "questionChoices", "questionMatches", "questionDragMatches", "questionDragLocked", "questionSequenceOrders", "questionSequenceTouched"]) {
      parsed[field] = Object.fromEntries(Object.entries(parsed[field] || {}).filter(([key]) => valid(key)));
    }
    const completed = new Set(parsed.completedQuestions);
    parsed.completed = (parsed.completed || []).filter(id => ESCAPE_ROOM_DATA.misiones.find(m => m.id === id)?.preguntas.every(q => completed.has(id + "::" + q.id)));
    if (changed.size || parsed.finalCode !== ESCAPE_ROOM_FINAL_PASSCODE) {
      parsed.isMasterSolved = false;
      parsed.isFinished = false;
      parsed.roomUnlockTransition = null;
      if (parsed.galleryScreen === "ending") parsed.galleryScreen = "mission";
    }
    return parsed;
  }

  function saveProgressState() {
    if (!isStorageAvailable()) return;
    try {
      window.localStorage.setItem(getProgressStorageKey(), JSON.stringify(serializeProgressState()));
    } catch (error) {
      const isQuota = error?.name === "QuotaExceededError" || String(error?.message || "").toLowerCase().includes("quota");
      if (!isQuota) {
        console.warn("No se pudo guardar el avance del escape room:", error);
      }
    }
  }

  function restoreProgressState() {
    if (!isStorageAvailable()) return;
    let raw = window.localStorage.getItem(getProgressStorageKey());
    let isLegacySave = false;
    if (!raw && REVIEW_PROGRESS_ID) {
      // Only an exact content match is eligible; never guess from a title alone.
      const oldKey = getLegacyProgressStorageKey() + ".v" + ESCAPE_ROOM_PROGRESS_VERSION + "." + ESCAPE_ROOM_PRESENTATION_MODE + "." + ESCAPE_ROOM_PROGRESS_FINGERPRINT;
      raw = window.localStorage.getItem(oldKey);
      if (raw) try {
        const old = JSON.parse(raw);
        old.questionSignatures = getQuestionSignatures();
        old.finalCode = ESCAPE_ROOM_FINAL_PASSCODE;
        raw = JSON.stringify(old);
      } catch (_) { raw = null; }
    }
    if (!raw && !IS_MENU_MODE && !REVIEW_PROGRESS_ID) {
      raw = window.localStorage.getItem(getLegacyProgressStorageKey());
      isLegacySave = Boolean(raw);
    }
    if(!raw && !REVIEW_PROGRESS_ID && ESCAPE_ROOM_DATA.reward_plan?.type==='imagen') {
      const matches=[],signatures=getQuestionSignatures(),prefix=getLegacyProgressStorageKey()+'.v';
      for(let i=0;i<window.localStorage.length;i++){
        const key=window.localStorage.key(i);if(!key?.startsWith(prefix))continue;
        try{
          const candidate=JSON.parse(window.localStorage.getItem(key)),reward=JSON.parse(candidate.rewardFingerprint||'null');
          if(reward?.type!=='imagen'||reward.puzzle_version===1||reward.image!==ESCAPE_ROOM_DATA.reward_plan.image||candidate.version!==ESCAPE_ROOM_PROGRESS_VERSION||candidate.mode!==ESCAPE_ROOM_PRESENTATION_MODE||candidate.finalCode!==ESCAPE_ROOM_FINAL_PASSCODE)continue;
          if(Object.keys(candidate.questionSignatures||{}).length!==Object.keys(signatures).length||!Object.entries(signatures).every(([key,value])=>candidate.questionSignatures[key]===value))continue;
          if(reward.rooms?.length!==ESCAPE_ROOM_DATA.reward_plan.rooms.length||!reward.rooms.every((r,i)=>r.room_id===ESCAPE_ROOM_DATA.reward_plan.rooms[i].room_id))continue;
          candidate.fingerprint=ESCAPE_ROOM_PROGRESS_FINGERPRINT;matches.push(candidate);
        }catch{}
      }
      if(matches.length===1)raw=JSON.stringify(matches[0]);
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!isLegacySave && !REVIEW_PROGRESS_ID) {
        const isCompatible = parsed?.version === ESCAPE_ROOM_PROGRESS_VERSION
          && parsed?.mode === ESCAPE_ROOM_PRESENTATION_MODE
          && parsed?.fingerprint === ESCAPE_ROOM_PROGRESS_FINGERPRINT;
        if (!isCompatible) return;
      }
      if (REVIEW_PROGRESS_ID) reconcileReviewProgress(parsed);
      if (REVIEW_PROGRESS_ID) restoredReviewScrollY = Math.max(0, Number(parsed.scrollY) || 0);
      const missionIds = new Set(ESCAPE_ROOM_DATA.misiones.map((mission) => mission.id));
      state.completed = new Set(Array.isArray(parsed.completed) ? parsed.completed.filter((id) => missionIds.has(id)) : []);
      if (IS_MENU_MODE && !REVIEW_PROGRESS_ID) {
        const sequentialCompleted = [];
        for (const mission of ESCAPE_ROOM_DATA.misiones) {
          if (!state.completed.has(mission.id)) break;
          sequentialCompleted.push(mission.id);
        }
        state.completed = new Set(sequentialCompleted);
      }
      state.completedQuestions = new Set(Array.isArray(parsed.completedQuestions) ? parsed.completedQuestions.filter((key) => String(key || "").includes("::")) : []);
      state.readBriefings = new Set([
        ...ESCAPE_ROOM_DATA.misiones.filter((mission) => mission.contexto_requerido === false).map((mission) => mission.id),
        ...(Array.isArray(parsed.readBriefings) ? parsed.readBriefings.filter((id) => missionIds.has(id)) : [])
      ]);
      state.experience = EXP.metrics(parsed.experience);
      const currentSignatures = getQuestionSignatures();
      [...new Set(['answers','attempts','assisted','discarded'].flatMap(field => Object.keys(state.experience[field])))].forEach(key => {
        if (parsed.questionSignatures?.[key] !== currentSignatures[key]) {
          for (const field of ['answers','attempts','assisted','discarded']) delete state.experience[field][key];
        }
      });
      if (parsed.finalCode !== ESCAPE_ROOM_FINAL_PASSCODE || parsed.rewardFingerprint !== JSON.stringify(ESCAPE_ROOM_DATA.reward_plan || null)) {
        let previousReward=null;try{previousReward=JSON.parse(parsed.rewardFingerprint||'null');}catch{}
        const imageMigration=previousReward?.type==='imagen' && ESCAPE_ROOM_DATA.reward_plan?.type==='imagen' && previousReward.image===ESCAPE_ROOM_DATA.reward_plan.image && previousReward.rooms?.length===ESCAPE_ROOM_DATA.reward_plan.rooms.length && previousReward.rooms.every((r,i)=>r.room_id===ESCAPE_ROOM_DATA.reward_plan.rooms[i].room_id);
        state.experience.final = {};
        if(!imageMigration){state.experience.awarded = {}; state.experience.inventory = {};}

      }
      state.questionAnswers = parsed.questionAnswers && typeof parsed.questionAnswers === "object" ? parsed.questionAnswers : {};
      state.questionSequenceTouched = parsed.questionSequenceTouched || {};
      state.timeoutResults = parsed.timeoutResults?.version === 1 && Array.isArray(parsed.timeoutResults.rooms) ? parsed.timeoutResults : null;
      state.questionChoices = parsed.questionChoices && typeof parsed.questionChoices === "object" ? parsed.questionChoices : {};
      state.questionMatches = parsed.questionMatches && typeof parsed.questionMatches === "object" ? parsed.questionMatches : {};
      state.questionDragMatches = parsed.questionDragMatches && typeof parsed.questionDragMatches === "object" ? parsed.questionDragMatches : {};
      state.questionDragLocked = parsed.questionDragLocked && typeof parsed.questionDragLocked === "object" ? parsed.questionDragLocked : {};
      state.questionSequenceOrders = parsed.questionSequenceOrders && typeof parsed.questionSequenceOrders === "object" ? parsed.questionSequenceOrders : {};
      state.unlocked = new Set(Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => missionIds.has(id)) : ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id));
      state.currentMissionId = missionIds.has(parsed.currentMissionId)
        ? parsed.currentMissionId
        : (IS_MENU_MODE
          ? (ESCAPE_ROOM_DATA.misiones[0]?.id || null)
          : (ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null));
      if (REVIEW_PROGRESS_ID && parsed.briefingFlowVersion !== 2) {
        const firstMission = ESCAPE_ROOM_DATA.misiones[0] || null;
        const hasFirstRoomInteraction = getRoomQuestions(firstMission).some((question) => {
          const key = getQuestionKey(firstMission, question);
          return state.completedQuestions.has(key)
            || String(state.questionAnswers[key] || "").trim() !== ""
            || Object.hasOwn(state.questionChoices, key)
            || Object.keys(state.questionMatches[key] || {}).length > 0
            || Object.keys(state.questionDragMatches[key] || {}).length > 0;
        });
        if (firstMission?.contexto_requerido !== false && !hasFirstRoomInteraction) {
          // Repair review progress written by the former floating Start action,
          // which marked room 1 as read before it was ever presented.
          state.readBriefings.delete(firstMission.id);
        }
      }
      const validScreens = IS_MENU_MODE ? ["menu", "intro", "instructions", "mission", "ending"] : ["intro", "mission", "ending"];
      state.galleryScreen = validScreens.includes(parsed.galleryScreen) ? parsed.galleryScreen : (IS_MENU_MODE ? "menu" : "intro");
      state.durationSeconds = normalizeDurationSeconds(parsed.durationSeconds);
      state.isStarted = parsed.isStarted === true;
      state.isFinished = parsed.isFinished === true;
      state.isMasterSolved = parsed.isMasterSolved === true;
      const finalTokenIds = new Set(FINAL_PASSCODE_TOKENS.map((token) => token.id));
      const restoredFinalOrder = Array.isArray(parsed.finalPasscodeOrder)
        ? parsed.finalPasscodeOrder.filter((id) => finalTokenIds.has(id))
        : [];
      state.finalPasscodeOrder = restoredFinalOrder.length === finalTokenIds.size && new Set(restoredFinalOrder).size === finalTokenIds.size
        ? restoredFinalOrder
        : buildInitialFinalPasscodeOrder();
      const restoredTransition = parsed.roomUnlockTransition && typeof parsed.roomUnlockTransition === "object"
        ? parsed.roomUnlockTransition
        : null;
      state.roomUnlockTransition = restoredTransition
        && missionIds.has(restoredTransition.completedMissionId)
        && state.completed.has(restoredTransition.completedMissionId)
        && (!restoredTransition.nextMissionId || missionIds.has(restoredTransition.nextMissionId))
        ? {
            phase: restoredTransition.phase === "feedback" ? "feedback" : "reward",
            feedbackUntilMs: Number(restoredTransition.feedbackUntilMs) || 0,
            completedMissionId: restoredTransition.completedMissionId,
            nextMissionId: restoredTransition.nextMissionId || null,
            startedAtMs: Number.isFinite(Number(restoredTransition.startedAtMs))
              ? Number(restoredTransition.startedAtMs)
              : Date.now()
          }
        : null;
      state.startedAtMs = Number.isFinite(Number(parsed.startedAtMs)) ? Number(parsed.startedAtMs) : null;
      state.endAtMs = Number.isFinite(Number(parsed.endAtMs)) ? Number(parsed.endAtMs) : null;
      state.briefingTimerPausedAtMs = parsed.briefingTimerPausedAtMs == null
        ? null
        : (Number.isFinite(Number(parsed.briefingTimerPausedAtMs)) ? Number(parsed.briefingTimerPausedAtMs) : null);
      if (REVIEW_PROGRESS_ID) state.briefingTimerPausedAtMs = null;
      const storedRemainingAtFinish = parsed.remainingSecondsAtFinish == null
        ? null
        : Number(parsed.remainingSecondsAtFinish);
      state.remainingSecondsAtFinish = Number.isFinite(storedRemainingAtFinish) && storedRemainingAtFinish >= 0
        ? Math.min(state.durationSeconds, Math.round(storedRemainingAtFinish))
        : null;
      if (state.isFinished && state.remainingSecondsAtFinish == null) {
        state.remainingSecondsAtFinish = state.isMasterSolved && state.endAtMs
          ? Math.max(0, Math.ceil((state.endAtMs - nowMs()) / 1000))
          : 0;
      }
      if (IS_MENU_MODE && !REVIEW_PROGRESS_ID) syncMenuUnlocksFromProgress();
      if (REVIEW_PROGRESS_ID && state.isStarted && state.currentMissionId) state.unlocked.add(state.currentMissionId);
      if (REVIEW_PROGRESS_ID) saveProgressState();
      if (isLegacySave) {
        saveProgressState();
        window.localStorage.removeItem(getLegacyProgressStorageKey());
      }
    } catch (error) {
      console.warn("No se pudo restaurar el avance del escape room:", error);
    }
  }

  function persistProgressState() {
    saveProgressState();
    syncBonusAvailability();
  }

  const els = {
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    galleryStep: document.getElementById("galleryStep"),
    galleryScreens: Array.from(document.querySelectorAll("[data-gallery-screen]")),
    galleryPrevButtons: Array.from(document.querySelectorAll("[data-gallery-prev]")),
    galleryNextButtons: Array.from(document.querySelectorAll("[data-gallery-next]")),
    mapGrid: document.getElementById("mapGrid"),
    missionStage: document.getElementById("missionStage"),
    questionProgress: document.getElementById("questionProgress"),
    roomStatusBox: document.getElementById("roomStatusBox"),
    endingPanel: document.getElementById("endingPanel"),
    timerShells: Array.from(document.querySelectorAll("[data-timer-shell]")),
    timerValues: Array.from(document.querySelectorAll("[data-timer-value]")),
    startButtons: Array.from(document.querySelectorAll("[data-game-start]")),
    resetButtons: Array.from(document.querySelectorAll("[data-game-reset]")),
    fullscreenButtons: Array.from(document.querySelectorAll("[data-fullscreen-toggle]")),
    menuCards: Array.from(document.querySelectorAll("[data-menu-card]")),
    liveStatus: document.getElementById("gameLiveStatus")
  };

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isNativeFullscreenAvailable() {
    const root = document.documentElement;
    if (document.fullscreenEnabled === false && !root.webkitRequestFullscreen) return false;
    return Boolean(root.requestFullscreen || root.webkitRequestFullscreen);
  }

  function announceFullscreen(message) {
    if (els.liveStatus) els.liveStatus.textContent = message;
  }

  function syncFullscreenControls() {
    const isActive = Boolean(getFullscreenElement()) || state.isImmersiveFallback || state.isHostFullscreen;
    document.documentElement.classList.toggle("is-fullscreen", isActive);
    els.fullscreenButtons.forEach((button) => {
      const label = isActive ? t("exitFullscreen") : t("fullscreen");
      button.classList.toggle("is-active", isActive);
      button.disabled = false;
      button.setAttribute("aria-pressed", String(isActive));
      button.setAttribute("aria-label", label);
      button.title = label;
      const labelNode = button.querySelector("[data-fullscreen-label]");
      if (labelNode) labelNode.textContent = label;
    });
  }

  function enterImmersiveFallback() {
    state.immersiveScrollY = window.scrollY;
    state.isImmersiveFallback = true;
    document.documentElement.classList.add("is-immersive-fallback");
    document.body.classList.add("is-immersive-fallback");
    window.scrollTo({ top: 0, behavior: "smooth" });
    announceFullscreen(t("immersiveOn"));
    syncFullscreenControls();
  }

  function exitImmersiveFallback() {
    state.isImmersiveFallback = false;
    document.documentElement.classList.remove("is-immersive-fallback");
    document.body.classList.remove("is-immersive-fallback");
    window.scrollTo({ top: state.immersiveScrollY, behavior: "auto" });
    announceFullscreen(t("immersiveOff"));
    syncFullscreenControls();
  }

  async function requestFullscreenTarget(target) {
    if (!target || !document.fullscreenEnabled && !target.webkitRequestFullscreen) {
      return false;
    }
    if (target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: "hide" });
      return true;
    }
    if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen();
      return true;
    }
    return false;
  }

  async function toggleFullscreen() {
    if (window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ === true && window.parent !== window) {
      window.parent.postMessage({ type: "pigpen-preview-fullscreen-toggle" }, "*");
      return;
    }
    if (state.isImmersiveFallback) {
      exitImmersiveFallback();
      return;
    }
    try {
      if (getFullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
        syncFullscreenControls();
        return;
      }
      if (!isNativeFullscreenAvailable()) {
        enterImmersiveFallback();
        return;
      }
      const candidates = [document.documentElement, document.body].filter(Boolean);
      let entered = false;
      for (const target of candidates) {
        try {
          entered = await requestFullscreenTarget(target);
          if (entered) break;
        } catch (error) {
          if (error?.name === "TypeError" && target !== document.body) {
            continue;
          }
          throw error;
        }
      }
      if (!entered) {
        enterImmersiveFallback();
        return;
      }
      syncFullscreenControls();
    } catch (error) {
      console.warn("No se pudo cambiar el modo de pantalla completa:", error);
      enterImmersiveFallback();
    }
  }

  function normalizeBaseText(value = "") {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^\\p{L}\\p{N}]+/gu, "");
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeHtmlAttr(value = "") {
    return escapeHtml(value).replace(/\x60/g, "&#96;");
  }

  function isRenderableMediaUrl(url = "") {
    return /^data:/i.test(url) || /^assets\\\//i.test(url) || /^\\\.{0,2}\\\//.test(url) || /^https?:\\\/\\\//i.test(url);
  }

  function nowMs() {
    return Number.isFinite(state.nowOverrideMs) ? state.nowOverrideMs : Date.now();
  }

  function normalizeDurationSeconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return Math.max(60, Math.round(DEFAULT_DURATION_MINUTES * 60));
    }
    return Math.max(1, Math.round(numeric));
  }

  function formatDuration(totalSeconds = 0) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    if (hours > 0) {
      return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
    }
    return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  function getRemainingSeconds() {
    if (state.isFinished && Number.isFinite(state.remainingSecondsAtFinish)) {
      return Math.max(0, Math.floor(state.remainingSecondsAtFinish));
    }
    if (!state.isStarted || !state.endAtMs) return state.durationSeconds;
    const referenceTime = Number.isFinite(state.briefingTimerPausedAtMs)
      ? state.briefingTimerPausedAtMs
      : nowMs();
    return Math.max(0, Math.ceil((state.endAtMs - referenceTime) / 1000));
  }

  function isFirstBriefingActive() {
    if (!state.isStarted || state.isFinished || state.galleryScreen !== "mission") return false;
    const mission = missionById(state.currentMissionId);
    return Boolean(mission && !state.readBriefings.has(mission.id));
  }

  function syncBriefingTimerPause() {
    // Editorial review uses an absolute deadline, including time outside the iframe.
    if (REVIEW_PROGRESS_ID) { state.briefingTimerPausedAtMs = null; return; }
    const shouldPause = Boolean(state.roomUnlockTransition) || isFirstBriefingActive();
    if (shouldPause && !Number.isFinite(state.briefingTimerPausedAtMs)) {
      state.briefingTimerPausedAtMs = nowMs();
      stopTimerInterval();
      persistProgressState();
      return;
    }
    if (!shouldPause && Number.isFinite(state.briefingTimerPausedAtMs)) {
      if (state.endAtMs) {
        state.endAtMs += Math.max(0, nowMs() - state.briefingTimerPausedAtMs);
      }
      state.briefingTimerPausedAtMs = null;
      persistProgressState();
      ensureTimerInterval();
    }
  }

  function stopTimerInterval() {
    if (!state.timerIntervalId) return;
    window.clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }

  function stopAlertSound() {
    const nodes = state.alertAudioNodes;
    state.alertAudioNodes = null;
    if (!nodes) return;
    try { nodes.oscillator?.stop?.(); } catch (_) {}
    try { nodes.oscillator?.disconnect?.(); } catch (_) {}
    try { nodes.gain?.disconnect?.(); } catch (_) {}
  }

  function startAlertSound() {
    if (state.alertAudioNodes) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = state.alertAudioContext || new AudioCtx();
      state.alertAudioContext = ctx;
      if (typeof ctx.resume === "function" && ctx.state === "suspended") {
        void ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.22);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.44);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.24);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.46);
      oscillator.onended = () => {
        if (state.alertAudioNodes?.oscillator === oscillator) {
          state.alertAudioNodes = null;
        }
        try { oscillator.disconnect(); } catch (_) {}
        try { gain.disconnect(); } catch (_) {}
      };
      state.alertAudioNodes = { oscillator, gain };
    } catch (error) {
      console.warn("No se pudo reproducir la alerta del panel maestro:", error);
    }
  }

  function syncEndingAlertState() {
    if (!els.endingPanel) return;
    const shouldAlert = state.galleryScreen === "ending" && areAllMissionsCompleted() && !state.isMasterSolved;
    els.endingPanel.classList.toggle("is-alert", shouldAlert);
    if (shouldAlert) {
      startAlertSound();
      return;
    }
    stopAlertSound();
  }

  function setGameInteractionState(isDisabled) {
    const disabled = Boolean(isDisabled);
    const targets = document.querySelectorAll(
      "[data-exp-action], [data-exp-bonus], [data-reward-action], [data-reward-position], [data-question-choice], [data-question-boolean], [data-question-verify], [data-question-hint], [data-question-match-select], [data-question-answer], [data-drag-tile], [data-drag-target], [data-sequence-item], [data-sequence-move], [data-final-passcode-token], #btnVerifyMasterPasscode, [data-editorial-autofill]"
    );
    targets.forEach((node) => {
      // The editorial control starts the game too; only answer controls must
      // be disabled before starting. Keep editorial actions locked at the end.
      const controlDisabled = node.matches('[data-editorial-autofill]')
        ? state.isFinished || Boolean(state.timeoutResults) || (state.isStarted && getRemainingSeconds() <= 0)
        : disabled;
      const bonusQuestion = node.dataset.expBonus ? findDragQuestion(node.dataset.expKey) : null;
      const staysLocked = !controlDisabled && (node.getAttribute("data-drag-locked") === "true"
        || (node.dataset.expBonus && (!bonusQuestion || !bonusIsReady(bonusQuestion.question, node.dataset.expKey, node.dataset.expBonus))));
      if ("disabled" in node) node.disabled = controlDisabled || staysLocked;
      if (controlDisabled || staysLocked) node.setAttribute("aria-disabled", "true");
      else node.removeAttribute("aria-disabled");
    });
  }

  function updateTimerUi() {
    const remainingSeconds = getRemainingSeconds();
    const isCompleted = state.isFinished && state.isMasterSolved;
    const isExpired = !isCompleted && (state.isFinished || (state.isStarted && remainingSeconds <= 0));
    const shellState = isCompleted
      ? "is-complete"
      : isExpired
        ? "is-expired"
      : !state.isStarted
        ? "is-ready"
        : remainingSeconds <= 300
          ? "is-warning"
          : "is-running";
    els.timerShells.forEach((shell) => {
      shell.classList.remove("is-ready", "is-running", "is-warning", "is-expired", "is-complete");
      shell.classList.add(shellState);
    });
    els.timerValues.forEach((node) => {
      node.textContent = formatDuration(remainingSeconds);
    });
    els.startButtons.forEach((button) => {
      button.hidden = state.isStarted;
      button.disabled = state.isStarted;
      button.textContent = state.isStarted ? t("started") : t("start");
    });
    els.resetButtons.forEach((button) => {
      button.disabled = false;
    });
    setGameInteractionState(!state.isStarted || isExpired || isCompleted);
  }

  function handleTimeExpired() {
    document.getElementById("questionHintDialog")?.close();
    stopTimerInterval();
    if (state.isMasterSolved) return;
    clearRoomUnlockTimer();
    if (!state.timeoutResults) state.timeoutResults = buildTimeoutResults();
    state.isFinished = true;
    state.endAtMs = nowMs();
    state.remainingSecondsAtFinish = 0;
    if (!IS_MENU_MODE) state.galleryScreen = "mission";
    updateTimerUi();
    persistProgressState();
    if (els.roomStatusBox) {
      setRoomStatus(t("timeExpired"), "bad");
    }
    showTimeoutResults();
  }

  function resultLabels() {
    const lang = String(ESCAPE_ROOM_DATA.idioma || 'es').slice(0, 2);
    const labels = {
      es: ['Tiempo agotado', 'Ver resultados', 'Cerrar', 'Sala', 'Pregunta', 'Correcta', 'Incorrecta', 'Sin responder', 'Retroalimentación no disponible', '¿Reiniciar el escape room y borrar el avance y los resultados de este tema?'],
      en: ['Time is up', 'View results', 'Close', 'Room', 'Question', 'Correct', 'Incorrect', 'Unanswered', 'Feedback unavailable', 'Restart this escape room and clear progress and results for this topic?'],
      fr: ['Temps écoulé', 'Voir les résultats', 'Fermer', 'Salle', 'Question', 'Correcte', 'Incorrecte', 'Sans réponse', 'Retour pédagogique indisponible', 'Recommencer et effacer la progression et les résultats de ce thème ?'],
      pt: ['Tempo esgotado', 'Ver resultados', 'Fechar', 'Sala', 'Pergunta', 'Correta', 'Incorreta', 'Sem resposta', 'Feedback indisponível', 'Reiniciar e apagar o progresso e os resultados deste tema?']
    };
    return labels[lang] || labels.es;
  }

  // Pure evaluation: never unlock rooms, return tiles, or rewrite answers.
  function renderExperienceInventory() {
    if (!ESCAPE_ROOM_DATA.reward_plan) return;
    let inventory = document.getElementById('expInventory');
    if (!inventory) { inventory = document.createElement('div'); inventory.id = 'expInventory'; }
    const anchor = state.galleryScreen === 'ending' ? els.endingPanel : els.missionStage;
    if (anchor && inventory.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(inventory, anchor);
    const progress = {...state.experience, awarded: {...state.experience.awarded}};
    if (state.roomUnlockTransition?.phase === "feedback") delete progress.awarded[state.roomUnlockTransition.completedMissionId];
    inventory.innerHTML = REWARDS.inventoryHTML(ESCAPE_ROOM_DATA.reward_plan, progress, ESCAPE_ROOM_DATA.idioma);
  }
  function bonusCapabilities(question) {
    const family = EXP.get(question.tipo_interaccion)?.family;
    return {
      descarte: ['single'].includes(family) || ['opcion_multiple','multimedia'].includes(question.tipo_interaccion),
      comprobacion: question.tipo_interaccion !== 'resolver_restricciones' && !!family && !['single','multi','evidence','expression','balance','coordinates'].includes(family) || ['relacion_columnas','drag_drop','completar_espacio','ordenar_secuencia'].includes(question.tipo_interaccion),
      pista: Boolean(question.interaction_data?.extra_hint || question.extra_hint)
    };
  }
  function answeredBonusParts(q, key) {
    let slots = [];
        if (EXP.get(q.tipo_interaccion)) slots = q.interaction_data.targets.filter(t => state.experience.answers[key]?.[t.id]?.length).map(t=>({id:t.id,label:t.label}));
        else if (q.tipo_interaccion === 'ordenar_secuencia') slots = (state.questionSequenceOrders[key] || []).map((_,i)=>({id:String(i),label:String(i+1)}));
        else slots = (q.parejas || []).map((p,i)=>({id:String(i),label:p.izquierda})).filter(t => usesDragAnswers(q) ? Number.isInteger(state.questionDragMatches[key]?.[t.id]) : String(state.questionMatches[key]?.[t.id] || '').trim());
    return slots;
  }
  const bonusSpotlights = new Set();
  function bonusIsReady(q, key, kind) {
    return state.isStarted && !state.isFinished && !state.timeoutResults && !state.completedQuestions.has(key)
      && state.experience.inventory[kind] > 0 && bonusCapabilities(q)[kind]
      && (kind !== 'comprobacion' || answeredBonusParts(q, key).length > 0);
  }
  function syncBonusAvailability() {
    document.querySelectorAll('[data-exp-bonus]').forEach(button => {
      const key = button.dataset.expKey, kind = button.dataset.expBonus, found = findDragQuestion(key);
      if (!found) return;
      const ready = bonusIsReady(found.question, key, kind);
      button.disabled = !ready;
      if (ready) button.removeAttribute("aria-disabled"); else button.setAttribute("aria-disabled", "true");
      const token = key + ':' + kind + ':' + state.experience.inventory[kind];
      if (ready && !bonusSpotlights.has(token)) { bonusSpotlights.add(token); button.classList.add('exp-bonus-glow'); }
      if (!ready) button.classList.remove('exp-bonus-glow');
    });
  }
  function renderBonusButtons(question, key, area = "all") {
    if (!ESCAPE_ROOM_DATA.experience_config?.extras?.length) return '';
    const capabilities = bonusCapabilities(question);
    const compatible = EXP.extras.filter(extra => ['descarte','comprobacion','pista'].includes(extra.id) && ESCAPE_ROOM_DATA.experience_config.extras.includes(extra.id) && capabilities[extra.id]);
    if (!compatible.length) return '';
    const available = compatible.filter(extra => state.experience.inventory[extra.id] > 0);
    const status = '';
    if (!available.length) return '';
    if (area === 'status') return status;
    const icons = {
      comprobacion: '<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5M7 10l2 2 4-4"/>',
      descarte: '<rect x="4" y="3" width="14" height="18" rx="3"/><path d="m8 9 6 6m0-6-6 6"/>',
      pista: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 3H9l-1-3Z"/>'
    };
    return '<div class="exp-tray exp-bonus-tray">' + available.map(extra => {
      const ready = bonusIsReady(question, key, extra.id), count = state.experience.inventory[extra.id];
      const token = key + ':' + extra.id + ':' + count;
      const glow = ready && !bonusSpotlights.has(token);
      if (glow) bonusSpotlights.add(token);
      const label = EXP.ui(ESCAPE_ROOM_DATA.idioma, 'bonus_' + extra.id) + ' (' + count + ')';
      const description = extra.id === 'comprobacion' && !answeredBonusParts(question,key).length ? EXP.ui(ESCAPE_ROOM_DATA.idioma,'partialEmpty') : label;
      return '<button type="button" class="exp-bonus-icon'+(glow?' exp-bonus-glow':'')+'" data-exp-bonus="' + extra.id + '" data-exp-key="' + escapeHtmlAttr(key) + '" title="'+escapeHtmlAttr(description)+'" aria-label="'+escapeHtmlAttr(label + (description!==label?'. '+description:''))+'"'+(!ready?' disabled':'')+'><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[extra.id]+'</svg><span class="exp-bonus-count" aria-hidden="true">'+count+'</span></button>';
    }).join('') + '</div>' + (area === 'controls' ? '' : status);
  }
  function showQuestionHint(key, trigger) {
    const found = findDragQuestion(key);
    if (!found) return;
    let dialog = document.getElementById('questionHintDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'questionHintDialog';
      dialog.className = 'question-hint-dialog';
      dialog.setAttribute('aria-labelledby', 'questionHintTitle');
      dialog.setAttribute('aria-describedby', 'questionHintText');
      document.body.appendChild(dialog);
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      });
      dialog.addEventListener('close', () => { if (dialog.returnFocus?.isConnected) safeFocus(dialog.returnFocus); });
    }
    dialog.returnFocus = trigger;
    const titles = {es:'Pista',en:'Hint',fr:'Indice',pt:'Dica'};
    const title = titles[String(ESCAPE_ROOM_DATA.idioma).split('-')[0]] || titles.en;
    dialog.innerHTML = '<header><div><h2 id="questionHintTitle">'+escapeHtml(title)+'</h2><p>'+escapeHtml(found.question.titulo)+'</p></div><button type="button" class="secondary" data-hint-close aria-label="'+escapeHtmlAttr(EXP.ui(ESCAPE_ROOM_DATA.idioma,'cancel'))+'"><span aria-hidden="true">×</span></button></header><div id="questionHintText">'+escapeHtml(found.question.pista || t('defaultHint'))+'</div>';
    dialog.querySelector('[data-hint-close]').addEventListener('click', () => dialog.close());
    if (!dialog.open) dialog.showModal();
  }
  function bonusDialog(key) {
    let dialog=document.getElementById('experienceBonusDialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='experienceBonusDialog';dialog.className='question-hint-dialog';
      dialog.setAttribute('aria-labelledby','experienceBonusTitle');document.body.appendChild(dialog);
      dialog.addEventListener('close',()=>{if(dialog.returnFocus?.isConnected)safeFocus(dialog.returnFocus);else safeFocus(document.querySelector('[data-exp-bonus][data-exp-key="'+CSS.escape(dialog.questionKey||'')+'"]')||document.querySelector('[data-question-key="'+CSS.escape(dialog.questionKey||'')+'"] button'));});
    }
    if(!dialog.open)dialog.returnFocus=document.activeElement;
    dialog.questionKey=key;
    dialog.innerHTML='<header><h2 id="experienceBonusTitle">'+escapeHtml(EXP.ui(ESCAPE_ROOM_DATA.idioma,'aid'))+'</h2><button type="button" class="secondary" data-bonus-close aria-label="'+escapeHtmlAttr(EXP.ui(ESCAPE_ROOM_DATA.idioma,'cancel'))+'">×</button></header><div data-exp-bonus-status="'+escapeHtmlAttr(key)+'" role="status" aria-live="polite"></div>';
    dialog.querySelector('[data-bonus-close]').addEventListener('click',()=>dialog.close());
    if(!dialog.open)dialog.showModal();
    return dialog.querySelector('[data-exp-bonus-status]');
  }
  function showBonusStatus(key, message) {
    bonusDialog(key).textContent=message;
  }
  function useExperienceBonus(kind, key, targetId) {
    const found = findDragQuestion(key); if (!found) return;
    if(state.completedQuestions.has(key)) return;
    const q = found.question, caps = bonusCapabilities(q), exp = state.experience;
    if (!bonusIsReady(q,key,kind)) return;
    let message = '', performed = false;
    if (kind === 'pista') { message = q.interaction_data?.extra_hint || q.extra_hint; performed = !!message; }
    if (kind === 'descarte') {
      exp.discarded ||= {}; const removed = exp.discarded[key] ||= [];
      let id;
      if (EXP.get(q.tipo_interaccion)) {
        const valid = new Set(q.interaction_data.solutions.flatMap(s => s.answers.flatMap(a => a.options)));
        id = q.interaction_data.options.find(o => !valid.has(o.id) && !removed.includes(o.id))?.id;
      } else { id = q.opciones.map((_,i)=>String(i)).find(i => Number(i) !== getQuestionCorrectChoiceIndex(q) && !removed.includes(i)); }
      if (id !== undefined) { removed.push(id); performed = true;
        if (EXP.get(q.tipo_interaccion)) { for (const target of q.interaction_data.targets) if (exp.answers[key]?.[target.id]?.includes(id)) exp.answers[key][target.id] = []; }
        else if (String(state.questionChoices[key]) === id) delete state.questionChoices[key];
      }
    }
    if (kind === 'comprobacion') {
      if (!targetId) {
        const slots = answeredBonusParts(q, key);
        if (!slots.length) { showBonusStatus(key, EXP.ui(ESCAPE_ROOM_DATA.idioma, 'partialEmpty')); return; }
        const box = bonusDialog(key);
        if (box) {box.innerHTML = '<p>' + escapeHtml(EXP.ui(ESCAPE_ROOM_DATA.idioma,'partial')) + '</p><div class="exp-tray">' + slots.map(t=>'<button type="button" class="secondary" data-exp-part="'+escapeHtmlAttr(t.id)+'" data-exp-key="'+escapeHtmlAttr(key)+'">'+escapeHtml(t.label)+'</button>').join('') + '</div>';box.classList.remove('hidden');}
        return;
      }
      let correct = false;
      if (EXP.get(q.tipo_interaccion)) {
        const chosen = state.experience.answers[key]?.[targetId]; if (!chosen?.length) return;
        correct = q.interaction_data.solutions.some(s=>JSON.stringify([...(EXP.solutionState(s)[targetId] || [])].sort())===JSON.stringify([...chosen].sort()));
      } else if (q.tipo_interaccion === 'ordenar_secuencia') {if (!state.questionSequenceOrders[key]?.length) return;correct = state.questionSequenceOrders[key][Number(targetId)] === Number(targetId);}
      else if (usesDragAnswers(q)) {if (!Number.isInteger(state.questionDragMatches[key]?.[targetId])) return;correct = isCorrectDragAssignment(q,state.questionDragMatches[key],Number(targetId));}
      else {const value=state.questionMatches[key]?.[targetId];if(!String(value || '').trim())return;correct=normalizeBaseText(value)===normalizeBaseText(q.parejas[Number(targetId)]?.derecha);}
      const label = EXP.get(q.tipo_interaccion) ? q.interaction_data.targets.find(t=>t.id===targetId)?.label : q.parejas?.[Number(targetId)]?.izquierda || String(Number(targetId)+1);
      message=(label ? label + ': ' : '') + EXP.ui(ESCAPE_ROOM_DATA.idioma,correct?'correct':'incorrect') + '. ' + EXP.ui(ESCAPE_ROOM_DATA.idioma,'partialSpent'); performed=true;
    }
    if (!performed) return;
    exp.inventory[kind] -= 1; exp.assisted[key] = true; persistProgressState(); render();
    if (message) showBonusStatus(key,message);
  }
  document.addEventListener('click', event => {
    const accessory = event.target.closest('[data-reward-accessory]');
    if (accessory) { const value=accessory.dataset.rewardAccessory; if(ESCAPE_ROOM_DATA.reward_plan?.rooms.some(r=>r.accessory===value && state.experience.awarded[r.room_id]?.extras.includes('personalizacion'))){state.experience.customization=value;persistProgressState();renderExperienceInventory();}return; }
    const input = event.target.closest('[data-exp-action]');
    if (input) {
      if (!state.isStarted || state.isFinished) return;
      const key = input.dataset.expKey, found = findDragQuestion(key);
      if (!found || state.completedQuestions.has(key)) return;
      state.experience.answers[key] = EXP.act(found.question.tipo_interaccion, found.question.interaction_data, state.experience.answers[key] || {}, input.dataset.expTarget, input.dataset.expOption, input.dataset.expAction);
      persistProgressState(); render();
      const buttons = els.missionStage.querySelectorAll('[data-exp-action]');
      safeFocus([...buttons].find(b=>b.dataset.expTarget===input.dataset.expTarget && b.dataset.expOption===input.dataset.expOption && b.dataset.expAction===input.dataset.expAction));
      return;
    }
    const bonus = event.target.closest('[data-exp-bonus], [data-exp-part]');
    if (bonus && state.isStarted && !state.isFinished) useExperienceBonus(bonus.dataset.expPart !== undefined ? 'comprobacion' : bonus.dataset.expBonus, bonus.dataset.expKey, bonus.dataset.expPart);
    const reward = event.target.closest('[data-reward-action]');
    if (reward && state.isStarted && !state.isFinished && areAllMissionsCompleted() && ESCAPE_ROOM_DATA.reward_plan) {
      const returnedPiece=reward.dataset.rewardAction==='return'?state.experience.final.selected:null;
      state.experience.final = REWARDS.actFinal(ESCAPE_ROOM_DATA.reward_plan,state.experience.final,reward.dataset.rewardAction,reward.dataset.rewardValue);
      persistProgressState();renderFinalPasscodePuzzle();
      const focusSelector=returnedPiece!==null?'[data-reward-action="select"][data-reward-value="'+returnedPiece+'"]':'[data-reward-action="'+reward.dataset.rewardAction+'"]'+(reward.dataset.rewardValue!==undefined?'[data-reward-value="'+reward.dataset.rewardValue+'"]':'');
      safeFocus(document.querySelector(focusSelector));
    }
  });
  let draggedPuzzlePiece=null,puzzlePointer=null,suppressPuzzleClickUntil=0;
  function canMovePuzzle(){return state.isStarted&&!state.isFinished&&areAllMissionsCompleted()&&ESCAPE_ROOM_DATA.reward_plan?.type==='imagen'&&getRemainingSeconds()>0;}
  function dropPuzzlePiece(piece,target){
    if(!canMovePuzzle()||!Number.isInteger(piece))return;
    const slot=target?.closest('[data-reward-action="place"]'),tray=target?.closest('.exp-puzzle-tray,[data-reward-action="return"]');
    if(!slot&&!tray)return;
    const plan=ESCAPE_ROOM_DATA.reward_plan,current=REWARDS.finalState(plan,state.experience.final);
    current.selected=piece;
    state.experience.final=REWARDS.actFinal(plan,current,slot?'place':'return',slot?.dataset.rewardValue);
    persistProgressState();renderFinalPasscodePuzzle();
    if(slot)safeFocus(document.querySelector('[data-reward-action="place"][data-reward-value="'+slot.dataset.rewardValue+'"]'));
  }
  document.addEventListener('dragstart',event=>{const piece=event.target.closest('[data-puzzle-piece]');if(!piece||!canMovePuzzle())return;draggedPuzzlePiece=Number(piece.dataset.puzzlePiece);event.dataTransfer.setData('text/plain',String(draggedPuzzlePiece));event.dataTransfer.effectAllowed='move';});
  document.addEventListener('dragover',event=>{if(draggedPuzzlePiece!==null&&event.target.closest('.exp-puzzle'))event.preventDefault();});
  document.addEventListener('drop',event=>{if(draggedPuzzlePiece===null)return;event.preventDefault();dropPuzzlePiece(draggedPuzzlePiece,event.target);draggedPuzzlePiece=null;});
  document.addEventListener('dragend',()=>{draggedPuzzlePiece=null;});
  document.addEventListener('pointerdown',event=>{const piece=event.target.closest('[data-puzzle-piece]');if(event.pointerType==='mouse'||!piece||!canMovePuzzle())return;puzzlePointer={id:event.pointerId,piece:Number(piece.dataset.puzzlePiece),x:event.clientX,y:event.clientY,moved:false};});
  document.addEventListener('pointermove',event=>{if(!puzzlePointer||event.pointerId!==puzzlePointer.id)return;if(Math.hypot(event.clientX-puzzlePointer.x,event.clientY-puzzlePointer.y)>8)puzzlePointer.moved=true;if(puzzlePointer.moved)event.preventDefault();},{passive:false});
  document.addEventListener('pointerup',event=>{if(!puzzlePointer||event.pointerId!==puzzlePointer.id)return;const drag=puzzlePointer;puzzlePointer=null;if(drag.moved){suppressPuzzleClickUntil=Date.now()+350;event.preventDefault();dropPuzzlePiece(drag.piece,document.elementFromPoint(event.clientX,event.clientY));}},true);
  document.addEventListener('pointercancel',()=>{puzzlePointer=null;});
  document.addEventListener('click',event=>{if(Date.now()<suppressPuzzleClickUntil&&event.target.closest('.exp-puzzle')){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('change', event => {
    const field=event.target.closest('[data-reward-position]');
    if(field && state.isStarted && !state.isFinished && areAllMissionsCompleted()) {state.experience.final.positions ||= {};state.experience.final.positions[field.dataset.rewardPosition]=field.value;persistProgressState();}
  });

  function evaluateQuestionResult(question, key) {
    if (state.completedQuestions.has(key)) return 'correct';
    let answered = false;
    let correct = false;
    const type = question.tipo_interaccion;
    if (EXP.get(type)) return EXP.evaluate(type, question.interaction_data, state.experience.answers[key] || {});
    if (type === 'opcion_multiple' || (type === 'multimedia' && question.interaction_contract_version === 1)) {
      const selected = state.questionChoices[key];
      answered = Number.isInteger(selected) && selected >= 0 && selected < question.opciones.length;
      correct = answered && selected === getQuestionCorrectChoiceIndex(question);
    } else if (type === 'verdadero_falso') {
      answered = typeof state.questionChoices[key] === 'boolean';
      correct = answered && state.questionChoices[key] === question.respuesta_correcta;
    } else if (type === 'relacion_columnas') {
      answered = question.parejas.length > 0 && question.parejas.every((_, i) => String(state.questionMatches[key]?.[i] || "").trim());
      correct = answered && question.parejas.length > 0 && checkMatchingQuestion(question, key);
    } else if (usesDragAnswers(question)) {
      const assignments = state.questionDragMatches[key] || {};
      answered = question.parejas.length > 0 && question.parejas.every((_, i) => Number.isInteger(assignments[String(i)]));
      correct = answered && question.parejas.length > 0 && question.parejas.every((_, index) => isCorrectDragAssignment(question, assignments, index));
    } else if (type === 'ordenar_secuencia') {
      const order = state.questionSequenceOrders[key] || [];
      const initial = getStableDragTileOrder(key + '::sequence', question.elementos.length);
      answered = state.questionSequenceTouched[key] === true || (order.length > 0 && order.some((value, index) => value !== initial[index]));
      correct = answered && order.length === question.elementos.length && order.length > 0 && order.every((value, index) => value === index);
    } else {
      const answer = String(state.questionAnswers[key] || '');
      answered = Boolean(answer.trim());
      correct = answered && (question.subtipo_respuesta === 'frase_libre' || getQuestionAcceptedAnswers(question).includes(normalizePlayerAnswer(answer, question)));
    }
    return correct ? 'correct' : answered ? 'incorrect' : 'unanswered';
  }

  function buildTimeoutResults() {
    return {
      version: 1, reason: 'timeout', finishedAt: nowMs(), title: ESCAPE_ROOM_DATA.titulo,
      rooms: ESCAPE_ROOM_DATA.misiones.map((mission, index) => {
        const questions = getRoomQuestions(mission).map(question => ({
          id: question.id, status: evaluateQuestionResult(question, getQuestionKey(mission, question)),
          feedback: String(question.retroalimentacion_correcta || '')
        }));
        const correct = questions.filter(question => question.status === 'correct').length;
        return { id: mission.id, number: index + 1, grade: questions.length ? Math.round(100 * correct / questions.length) / 10 : 0, questions };
      })
    };
  }

  function showTimeoutResults() {
    if (!state.timeoutResults) return;
    const labels = resultLabels();
    let dialog = document.getElementById('timeoutResultsDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'timeoutResultsDialog';
      dialog.className = 'timeout-results';
      dialog.setAttribute('aria-labelledby', 'timeoutResultsTitle');
      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => safeFocus(document.getElementById('timeoutResultsButton')));
    }
    dialog.innerHTML = '<header class="timeout-results-heading"><span class="timeout-clock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/></svg></span><div class="timeout-heading-copy"><h2 id="timeoutResultsTitle">' + escapeHtml(labels[0]) + '</h2><p class="timeout-game-title">' + escapeHtml(state.timeoutResults.title || '') + '</p></div><button type="button" class="secondary" data-results-close aria-label="' + escapeHtmlAttr(labels[2]) + '" title="' + escapeHtmlAttr(labels[2]) + '"><span aria-hidden="true">×</span></button></header><div class="timeout-results-body">' +
      state.timeoutResults.rooms.map(room => '<section class="timeout-result-room"><div class="timeout-room-heading"><h3>' + escapeHtml(labels[3]) + ' ' + escapeHtml(room.number) + '</h3><div class="timeout-grade"><span>' + escapeHtml(room.grade) + '</span><small>/ 10</small></div></div><div class="timeout-meter" aria-hidden="true"><span style="width:' + Math.max(0, Math.min(100, Number(room.grade) * 10 || 0)) + '%"></span></div><ol>' +
        room.questions.map((question, index) => {
          const statusIndex = question.status === 'correct' ? 5 : question.status === 'incorrect' ? 6 : 7;
          const icon = statusIndex === 5 ? '✓' : statusIndex === 6 ? '✕' : '–';
          const result = statusIndex === 5 ? 'correct' : statusIndex === 6 ? 'incorrect' : 'unanswered';
          return '<li><div class="timeout-question-heading"><span>' + escapeHtml(labels[4]) + ' ' + (index + 1) + '</span><span class="timeout-status" data-result="' + result + '"><i aria-hidden="true">' + icon + '</i>' + escapeHtml(labels[statusIndex]) + '</span></div><p class="timeout-feedback">' + escapeHtml(question.feedback || labels[8]) + '</p></li>';
        }).join('') + '</ol></section>').join('') + '</div><footer class="timeout-results-footer"><button type="button" class="secondary" data-results-reset><span aria-hidden="true">↻</span>' + escapeHtml(t('reset')) + '</button></footer>';
    dialog.querySelector('[data-results-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-results-reset]').addEventListener('click', resetEscapeRoom);
    let button = document.getElementById('timeoutResultsButton');
    if (!button) {
      button = document.createElement('button');
      button.id = 'timeoutResultsButton';
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = labels[1];
      button.addEventListener('click', showTimeoutResults);
      (document.querySelector('.game-header-actions') || document.querySelector('.game-header')).appendChild(button);
    }
    if (!dialog.open) dialog.showModal();
  }

  function tickTimer() {
    if (!state.isStarted || state.isFinished) return;
    if (getRemainingSeconds() <= 0) {
      handleTimeExpired();
      return;
    }
    updateTimerUi();
  }

  function ensureTimerInterval() {
    stopTimerInterval();
    if (!state.isStarted || state.isFinished) {
      updateTimerUi();
      return;
    }
    tickTimer();
    state.timerIntervalId = window.setInterval(tickTimer, 1000);
  }

  function normalizePlayerAnswer(value, mission) {
    const subtype = mission?.subtipo_respuesta || "frase_corta";
    const raw = String(value ?? "").trim();
    if (subtype === "numero") {
      const digits = raw.replace(/[^\\d.-]+/g, "");
      if (!digits) return "";
      const number = Number(digits);
      return Number.isFinite(number) ? String(number) : "";
    }
    const base = normalizeBaseText(raw);
    if (!base) return "";
    if (subtype === "letra") return base.slice(0, 1);
    return base;
  }

  function getMissionAcceptedAnswers(mission) {
    const values = Array.isArray(mission?.respuestas_aceptadas) ? mission.respuestas_aceptadas : [];
    return [...new Set(values.map((value) => normalizePlayerAnswer(value, mission)).filter(Boolean))];
  }

  function missionById(id) {
    return ESCAPE_ROOM_DATA.misiones.find((mission) => mission.id === id) || null;
  }

  function areAllMissionsCompleted() {
    return state.completed.size === ESCAPE_ROOM_DATA.misiones.length;
  }

  function syncMenuUnlocksFromProgress() {
    if (!IS_MENU_MODE) return;
    const unlocked = new Set(REVIEW_PROGRESS_ID ? state.unlocked : []);
    if (state.isStarted) {
      for (const mission of ESCAPE_ROOM_DATA.misiones) {
        if (state.completed.has(mission.id)) {
          unlocked.add(mission.id);
          continue;
        }
        unlocked.add(mission.id);
        break;
      }
    }
    state.unlocked = unlocked;
  }

  function renderEndingPanelState() {
    if (!els.endingPanel) return;
    const shouldShowEnding = state.galleryScreen === "ending" && areAllMissionsCompleted();
    els.endingPanel.classList.toggle("hidden", !shouldShowEnding);
    if (!shouldShowEnding) return;

    if (state.pendingRoomCompletionFeedback) {
      let completionNotice = els.endingPanel.querySelector("[data-room-completion-notice]");
      if (!completionNotice) {
        completionNotice = document.createElement("div");
        completionNotice.className = "status-box is-good";
        completionNotice.dataset.roomCompletionNotice = "true";
        els.endingPanel.prepend(completionNotice);
      }
      completionNotice.textContent = state.pendingRoomCompletionFeedback;
      state.pendingRoomCompletionFeedback = "";
    }

    const finalCode = extractFinalPasscode(ESCAPE_ROOM_DATA.conclusion);
    const masterPanelContainer = document.getElementById("masterPanelContainer");
    const victoryContainer = document.getElementById("victoryContainer");

    if ((finalCode || ESCAPE_ROOM_DATA.reward_plan?.type==='imagen') && !state.isMasterSolved) {
      if (masterPanelContainer) masterPanelContainer.classList.remove("hidden");
      if (victoryContainer) victoryContainer.classList.add("hidden");
      renderFinalPasscodePuzzle();
      return;
    }

    if (masterPanelContainer) masterPanelContainer.classList.add("hidden");
    if (victoryContainer) victoryContainer.classList.remove("hidden");
    if(victoryContainer && state.isMasterSolved && ESCAPE_ROOM_DATA.reward_plan?.type==='imagen' && !victoryContainer.querySelector('.exp-reward-complete')){
      const image=document.createElement('img');image.className='exp-reward-complete';image.src=ESCAPE_ROOM_DATA.reward_plan.image;image.alt=ESCAPE_ROOM_DATA.reward_plan.image_alt||'';image.style.cssText='display:block;width:100%;height:auto;margin:16px auto';victoryContainer.prepend(image);
    }

    let timeDisplay = els.endingPanel.querySelector(".ending-time-display");
    if (!timeDisplay) {
      timeDisplay = document.createElement("div");
      timeDisplay.className = "ending-time-display";
      timeDisplay.style.marginTop = "20px";
      timeDisplay.style.fontSize = "1.25rem";
      timeDisplay.style.fontWeight = "bold";
      timeDisplay.style.color = "var(--primary)";
      if (victoryContainer) victoryContainer.appendChild(timeDisplay);
      else els.endingPanel.appendChild(timeDisplay);
    }
    const elapsed = Math.max(0, state.durationSeconds - getRemainingSeconds());
    timeDisplay.innerHTML = escapeHtml(t("congratulationsTime", { time: formatDuration(elapsed) })).replace(formatDuration(elapsed), "<span>" + formatDuration(elapsed) + "</span>");
  }

  function renderMenuGallery() {
    const validScreens = ["menu", "intro", "instructions", "mission", "ending"];
    if (!validScreens.includes(state.galleryScreen)) state.galleryScreen = "menu";
    if (state.galleryScreen === "ending" && !areAllMissionsCompleted()) state.galleryScreen = "menu";

    els.galleryScreens.forEach((screen) => {
      const isActive = screen.dataset.galleryScreen === state.galleryScreen;
      screen.classList.toggle("is-active", isActive);
      screen.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    renderEndingPanelState();
    syncEndingAlertState();
    updateTimerUi();
    persistProgressState();
  }

  function renderGallery() {
    if (IS_MENU_MODE) {
      renderMenuGallery();
      return;
    }
    const galleryOrder = ["intro", "mission", "ending"];
    if (!galleryOrder.includes(state.galleryScreen)) {
      state.galleryScreen = "intro";
    }
    if (state.galleryScreen === "ending" && !areAllMissionsCompleted()) {
      state.galleryScreen = "mission";
    }

    els.galleryScreens.forEach((screen) => {
      const isActive = screen.dataset.galleryScreen === state.galleryScreen;
      screen.classList.toggle("is-active", isActive);
    });

    const activeIndex = galleryOrder.indexOf(state.galleryScreen);
    if (els.galleryStep) {
      els.galleryStep.textContent = t("sectionCounter", { current: activeIndex + 1, total: galleryOrder.length });
    }

    els.galleryPrevButtons.forEach((button) => {
      const isBlocked = state.galleryScreen === "intro" || Boolean(state.roomUnlockTransition);
      button.disabled = isBlocked;
      button.classList.toggle("is-concealed", isBlocked);
      button.setAttribute("aria-hidden", isBlocked ? "true" : "false");
      button.tabIndex = isBlocked ? -1 : 0;
    });

    els.galleryNextButtons.forEach((button) => {
      if (state.galleryScreen === "intro") {
        button.disabled = false;
        button.textContent = t("next");
        button.setAttribute("aria-label", t("next"));
        return;
      }
      if (state.galleryScreen === "mission") {
        if (state.roomUnlockTransition) {
          button.disabled = state.roomUnlockTransition.phase === "feedback";
          button.textContent = t("skipUnlockTransition");
          button.setAttribute("aria-label", t("skipUnlockTransition"));
          return;
        }
        const complete = areAllMissionsCompleted();
        button.disabled = false;
        button.textContent = complete ? t("seeVictory") : t("next");
        button.setAttribute("aria-label", complete ? t("seeVictory") : t("next"));
        return;
      }
      button.disabled = true;
      button.textContent = t("final");
      button.setAttribute("aria-label", t("final"));
    });

    renderEndingPanelState();

    syncEndingAlertState();
    updateTimerUi();
    persistProgressState();
  }

  function setGalleryScreen(screenName = "intro") {
    const galleryOrder = IS_MENU_MODE
      ? ["menu", "intro", "instructions", "mission", "ending"]
      : ["intro", "mission", "ending"];
    const fallbackScreen = IS_MENU_MODE ? "menu" : "intro";
    const nextScreen = galleryOrder.includes(screenName) ? screenName : fallbackScreen;
    if (nextScreen === "ending" && !areAllMissionsCompleted()) return;
    state.galleryScreen = nextScreen;
    render();
    if (nextScreen === "mission") {
      scrollMissionStageToTop();
    }
  }

  function goToPreviousGalleryScreen() {
    if (IS_MENU_MODE) {
      returnToMenu();
      return;
    }
    if (state.roomUnlockTransition) return;
    if (state.galleryScreen === "mission") setGalleryScreen("intro");
    else if (state.galleryScreen === "ending") setGalleryScreen("mission");
  }

  function goToNextGalleryScreen() {
    if (IS_MENU_MODE) return;
    if (state.roomUnlockTransition) {
      continueFromRoomUnlockTransition();
      return;
    }
    if (state.galleryScreen === "intro") setGalleryScreen("mission");
    else if (state.galleryScreen === "mission") {
      if (areAllMissionsCompleted()) {
        setGalleryScreen("ending");
        return;
      }

      const missions = ESCAPE_ROOM_DATA.misiones;
      const currentIndex = Math.max(0, missions.findIndex((mission) => mission.id === state.currentMissionId));
      let nextMission = null;
      for (let offset = 1; offset <= missions.length; offset += 1) {
        const candidate = missions[(currentIndex + offset) % missions.length];
        if (candidate && state.unlocked.has(candidate.id) && !state.completed.has(candidate.id)) {
          nextMission = candidate;
          break;
        }
      }

      if (nextMission) {
        state.currentMissionId = nextMission.id;
        persistProgressState();
        render();
      }
      scrollMissionStageToTop();
    }
  }

  function updateProgress() {
    const total = ESCAPE_ROOM_DATA.misiones.length || 1;
    const done = state.completed.size;
    const percent = Math.min((done / total) * 100, 100);
    if (els.progressText) els.progressText.textContent = done + " / " + total;
    if (els.progressBar) els.progressBar.style.width = percent + "%";
    if (IS_MENU_MODE) {
      document.querySelectorAll(".menu-progress-step").forEach((step, index) => {
        const mission = ESCAPE_ROOM_DATA.misiones[index];
        const complete = Boolean(mission && state.completed.has(mission.id));
        const active = Boolean(mission && !complete && state.unlocked.has(mission.id));
        step.classList.toggle("is-complete", complete);
        step.classList.toggle("is-active", active);
      });
    }
  }

  function getMenuCardState(button) {
    const section = button?.dataset?.menuSection || "";
    if (section === "intro" || section === "instructions") {
      return { locked: false, complete: false, status: t("available") };
    }
    if (section === "ending") {
      const complete = areAllMissionsCompleted();
      return {
        locked: !complete,
        complete: complete && state.isMasterSolved,
        status: complete ? (state.isMasterSolved ? t("completedMasc") : t("finalCodeAvailable")) : t("lockedCompleteActivities")
      };
    }
    const missionId = button?.dataset?.menuMission || "";
    const complete = state.completed.has(missionId);
    const unlocked = state.unlocked.has(missionId);
    const locked = !unlocked || (!complete && state.isFinished);
    return {
      locked,
      complete,
      status: complete
        ? t("completed")
        : state.isFinished
          ? t("lockedExpired")
          : unlocked
            ? t("available")
            : state.isStarted
              ? t("lockedPreviousActivity")
              : t("lockedStart")
    };
  }

  function renderMenuCards() {
    if (!IS_MENU_MODE) return;
    syncMenuUnlocksFromProgress();
    els.menuCards.forEach((button) => {
      const cardState = getMenuCardState(button);
      const mission = missionById(button.dataset.menuMission || "");
      const statusText = cardState.complete && mission
        ? t("completed") + " · " + (ESCAPE_ROOM_DATA.reward_plan && ESCAPE_ROOM_DATA.reward_plan.type !== "letras" ? EXP.ui(ESCAPE_ROOM_DATA.idioma,"earned") : t("unlockedCodeFragmentLabel", { fragment: getMissionCodeFragment(mission) }))
        : cardState.status;
      button.disabled = cardState.locked;
      button.setAttribute("aria-disabled", cardState.locked ? "true" : "false");
      button.classList.toggle("is-locked", cardState.locked);
      button.classList.toggle("is-complete", cardState.complete);
      const status = button.querySelector("[data-menu-card-status]");
      if (status) status.textContent = statusText;
      const title = button.querySelector(".section-card-title")?.textContent?.trim() || t("section");
      button.setAttribute("aria-label", title + ". " + statusText + ".");
    });
  }

  function focusActiveMenuScreen() {
    window.requestAnimationFrame(() => {
      const screen = document.querySelector('[data-gallery-screen="' + CSS.escape(state.galleryScreen) + '"]');
      const heading = screen?.querySelector("h1, h2");
      if (!heading) return;
      heading.setAttribute("tabindex", "-1");
      safeFocus(heading);
    });
  }

  function openMenuCard(button) {
    if (!IS_MENU_MODE || !button || button.disabled) return;
    const section = button.dataset.menuSection || "";
    const missionId = button.dataset.menuMission || "";
    state.lastMenuFocusSelector = missionId
      ? '[data-menu-card][data-menu-mission="' + CSS.escape(missionId) + '"]'
      : '[data-menu-card][data-menu-section="' + CSS.escape(section) + '"]';
    if (section === "mission") {
      if (!state.isStarted || !state.unlocked.has(missionId)) return;
      state.currentMissionId = missionId;
    }
    if (section === "ending" && !areAllMissionsCompleted()) return;
    state.galleryScreen = section;
    persistProgressState();
    render();
    focusActiveMenuScreen();
  }

  function returnToMenu() {
    if (!IS_MENU_MODE) return;
    if (state.roomUnlockTransition) {
      clearRoomUnlockTimer();
      state.roomUnlockTransition = null;
      state.galleryScreen = "menu";
      persistProgressState();
      render();
      return;
    }
    const focusSelector = state.lastMenuFocusSelector;
    state.galleryScreen = "menu";
    persistProgressState();
    render();
    window.requestAnimationFrame(() => {
      const card = focusSelector ? document.querySelector(focusSelector) : null;
      safeFocus(card);
    });
  }

  function goToNextMenuActivity() {
    if (!IS_MENU_MODE) return;
    if (state.roomUnlockTransition) {
      continueFromRoomUnlockTransition();
      return;
    }
    const currentIndex = ESCAPE_ROOM_DATA.misiones.findIndex((mission) => mission.id === state.currentMissionId);
    const nextMission = ESCAPE_ROOM_DATA.misiones
      .slice(Math.max(0, currentIndex + 1))
      .find((mission) => state.unlocked.has(mission.id) && !state.completed.has(mission.id));
    if (nextMission) {
      state.currentMissionId = nextMission.id;
      state.galleryScreen = "mission";
    } else if (areAllMissionsCompleted()) {
      state.galleryScreen = "ending";
    } else {
      returnToMenu();
      return;
    }
    persistProgressState();
    render();
    focusActiveMenuScreen();
  }

  function renderMap() {
    if (IS_MENU_MODE) {
      renderMenuCards();
      return;
    }
    if (!els.mapGrid) return;
    const target = els.mapGrid;
    target.innerHTML = "";
    ESCAPE_ROOM_DATA.misiones.forEach((mission, index) => {
      const locked = !state.unlocked.has(mission.id) || Boolean(state.roomUnlockTransition);
      const complete = state.completed.has(mission.id);
      const active = state.currentMissionId === mission.id;
      const roomLabel = t("room") + " " + String(index + 1).padStart(2, "0");
      const button = document.createElement("button");
      button.type = "button";
      button.className = \`map-card \${locked ? "is-locked" : ""} \${complete ? "is-complete" : ""} \${active ? "is-active" : ""}\`;
      button.dataset.openMission = mission.id;
      button.style.cssText = getMissionPaletteStyle(mission);
      button.disabled = locked;
      button.setAttribute("aria-label", roomLabel + (mission.titulo ? " · " + mission.titulo : ""));
      button.textContent = roomLabel;
      target.appendChild(button);
    });

    target.querySelectorAll("[data-open-mission]").forEach((button) => {
      button.addEventListener("click", () => {
        const missionId = button.getAttribute("data-open-mission");
        if (!missionId || !state.unlocked.has(missionId)) return;
        state.currentMissionId = missionId;
        persistProgressState();
        render();
        scrollMissionStageToTop();
      });
    });
  }

  function scrollMissionStageToTop() {
    window.requestAnimationFrame(() => {
      const missionPanel = document.querySelector("#missionStage .mission-panel");
      const scrollTarget = missionPanel || els.missionStage || document.querySelector('[data-gallery-screen="mission"]');
      if (scrollTarget && typeof scrollTarget.scrollIntoView === "function") {
        scrollTarget.scrollIntoView({ block: "start", behavior: "auto" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      const missionTitle = missionPanel?.querySelector(".mission-title");
      const focusTarget = missionTitle || missionPanel || scrollTarget;
      if (focusTarget) {
        focusTarget.setAttribute("tabindex", "-1");
        safeFocus(focusTarget);
        return;
      }
    });
  }

  function getRoomQuestions(mission) {
    return Array.isArray(mission?.preguntas) && mission.preguntas.length ? mission.preguntas : [];
  }

  function getQuestionKey(mission, question) {
    return String(mission?.id || "mission") + "::" + String(question?.id || "question");
  }

  function getQuestionAcceptedAnswers(question) {
    const values = Array.isArray(question?.respuestas_aceptadas) ? question.respuestas_aceptadas : [];
    const accepted = [...new Set(values.map((value) => normalizePlayerAnswer(value, question)).filter(Boolean))];
    if (accepted.length) return accepted;
    const correct = normalizePlayerAnswer(question?.respuesta_correcta, question);
    return correct ? [correct] : [];
  }

  function getQuestionAutofillText(question) {
    if (question?.subtipo_respuesta === "frase_libre") return t("trialFreeResponse");
    const correctAnswer = String(question?.respuesta_correcta || "").trim();
    if (correctAnswer) return correctAnswer;
    const firstAccepted = Array.isArray(question?.respuestas_aceptadas)
      ? question.respuestas_aceptadas.find((value) => String(value || "").trim())
      : "";
    return String(firstAccepted || "");
  }

  function getQuestionCorrectChoiceIndex(question) {
    return resolveOptionAnswerIndex(question?.opciones, question?.respuesta_correcta, question?.respuestas_aceptadas);
  }

  ${resolveOptionAnswerIndex.toString()}
  ${normalizeAcceptedAnswers.toString()}

  function areMissionQuestionsCompleted(mission) {
    const questions = getRoomQuestions(mission);
    return questions.length > 0 && questions.every((question) => state.completedQuestions.has(getQuestionKey(mission, question)));
  }

  function getCompletedQuestionCount(mission) {
    return getRoomQuestions(mission).filter((question) => state.completedQuestions.has(getQuestionKey(mission, question))).length;
  }

  function renderMissionTextBlock(question, key) {
    const placeholderBySubtype = {
      palabra: t("writeAnswer"),
      letra: t("writeAnswer"),
      numero: t("writeAnswer"),
      codigo_corto: t("writeAnswer"),
      frase_corta: t("writeAnswer"),
      frase_libre: t("writeAnswer")
    };
    const maxLength = question.subtipo_respuesta === "letra" ? 1 : (question.subtipo_respuesta === "palabra" ? 32 : "");
    const type = "text";
    const inputMode = question.subtipo_respuesta === "numero" ? ' inputmode="decimal"' : '';
    const inputClass = 'field question-answer-input' + (question.subtipo_respuesta === "numero" ? ' is-number' : '');
    const currentValue = state.questionAnswers[key] || "";
    if (question.subtipo_respuesta === "frase_libre") {
      return '<div class="free-response-field"><textarea id="questionAnswer-' + escapeHtmlAttr(key) + '" class="' + inputClass + ' is-free-response" data-question-answer="' + escapeHtmlAttr(key) + '" rows="4" spellcheck="true" autocapitalize="sentences" placeholder="' + escapeHtmlAttr(t("writeAnswer")) + '">' + escapeHtml(currentValue) + '</textarea><div class="muted free-response-note">' + escapeHtml(t("freeResponseNote")) + '</div></div>';
    }
    return '<input id="questionAnswer-' + escapeHtmlAttr(key) + '" class="' + inputClass + '" data-question-answer="' + escapeHtmlAttr(key) + '" type="' + type + '"' + inputMode + (maxLength ? ' maxlength="' + maxLength + '"' : '') + ' value="' + escapeHtmlAttr(currentValue) + '" placeholder="' + escapeHtmlAttr(placeholderBySubtype[question.subtipo_respuesta] || t("writeAnswer")) + '">';
  }

  function renderMissionChoiceBlock(question, key) {
    const selected = Number(state.questionChoices[key] ?? -1);
    // Mezclar solo la presentación: las respuestas guardadas, la evaluación y
    // el autofill siguen apuntando al índice original, no a su posición visual.
    const optionOrder = getStableDragTileOrder(key + '::choice-options', question.opciones.length);
    return '<div class="choice-grid">' + optionOrder.map((index) => {
      const option = question.opciones[index];
      const isSelected = selected === index ? ' is-selected' : '';
      return '<button type="button" class="choice-card' + isSelected + '" data-question-choice="' + escapeHtmlAttr(key) + '" data-choice-index="' + index + '">' + escapeHtml(option) + '</button>';
    }).join('') + '</div>';
  }

  function renderTrueFalseBlock(question, key) {
    const selected = state.questionChoices[key];
    return '<div class="choice-grid true-false-grid" role="group" aria-label="' + escapeHtmlAttr(t("selectOption")) + '">' +
      [true, false].map((value) => {
        const label = value ? t("trueLabel") : t("falseLabel");
        const isSelected = selected === value ? ' is-selected' : '';
        return '<button type="button" class="choice-card true-false-choice' + isSelected + '" data-question-boolean="' + escapeHtmlAttr(key) + '" data-boolean-value="' + value + '" aria-pressed="' + (selected === value ? 'true' : 'false') + '">' + escapeHtml(label) + '</button>';
      }).join('') + '</div>';
  }

  function renderFillBlankBlock(question, key) {
    const template = String(question.texto_con_hueco || question.reto || '___');
    const markerIndex = template.indexOf('___');
    const before = markerIndex >= 0 ? template.slice(0, markerIndex) : template;
    const after = markerIndex >= 0 ? template.slice(markerIndex + 3) : '';
    const currentValue = state.questionAnswers[key] || '';
    return '<div class="fill-blank-block"><p class="drag-match-help">' + escapeHtml(t("fillBlankInstruction")) + '</p><div class="fill-blank-sentence"><span>' + escapeHtml(before) + '</span><label class="sr-only" for="questionAnswer-' + escapeHtmlAttr(key) + '">' + escapeHtml(t("writeAnswer")) + '</label><input id="questionAnswer-' + escapeHtmlAttr(key) + '" class="field question-answer-input fill-blank-input" data-question-answer="' + escapeHtmlAttr(key) + '" type="text" value="' + escapeHtmlAttr(currentValue) + '" placeholder="…" aria-label="' + escapeHtmlAttr(t("writeAnswer")) + '"><span>' + escapeHtml(after) + '</span></div></div>';
  }

  function getSequenceOrder(question, key) {
    const count = Array.isArray(question.elementos) ? question.elementos.length : 0;
    const current = state.questionSequenceOrders[key];
    if (Array.isArray(current) && current.length === count && new Set(current).size === count && current.every((value) => Number.isInteger(value) && value >= 0 && value < count)) return current;
    const shuffled = getStableDragTileOrder(key + '::sequence', count);
    state.questionSequenceOrders[key] = shuffled;
    return shuffled;
  }

  function renderSequenceBlock(question, key) {
    const items = Array.isArray(question.elementos) ? question.elementos : [];
    const order = getSequenceOrder(question, key);
    const selected = Number(state.selectedSequenceItems[key]);
    const rows = order.map((sourceIndex, position) => {
      const label = String(items[sourceIndex] || '');
      const isSelected = selected === position;
      return '<li class="sequence-row' + (isSelected ? ' is-selected' : '') + '" data-sequence-drop="' + escapeHtmlAttr(key) + '" data-sequence-position="' + position + '">' +
        '<button type="button" class="sequence-item" data-sequence-item="' + escapeHtmlAttr(key) + '" data-sequence-position="' + position + '" aria-pressed="' + (isSelected ? 'true' : 'false') + '"><span class="sequence-number">' + (position + 1) + '</span><span>' + escapeHtml(label) + '</span></button>' +
        '<span class="sequence-controls"><button type="button" class="sequence-move" data-sequence-move="' + escapeHtmlAttr(key) + '" data-sequence-position="' + position + '" data-sequence-delta="-1" aria-label="' + escapeHtmlAttr(t("sequenceMoveUp") + ': ' + label) + '"' + (position === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="sequence-move" data-sequence-move="' + escapeHtmlAttr(key) + '" data-sequence-position="' + position + '" data-sequence-delta="1" aria-label="' + escapeHtmlAttr(t("sequenceMoveDown") + ': ' + label) + '"' + (position === order.length - 1 ? ' disabled' : '') + '>↓</button></span>' +
      '</li>';
    }).join('');
    return '<div class="sequence-board" data-sequence-board="' + escapeHtmlAttr(key) + '"><p class="drag-match-help">' + escapeHtml(t("sequenceInstructions")) + '</p><ol class="sequence-list">' + rows + '</ol><div class="sr-only" data-sequence-live="' + escapeHtmlAttr(key) + '" aria-live="polite" aria-atomic="true"></div></div>';
  }

  function renderMissionMatchingBlock(question, key) {
    const selections = state.questionMatches[key] || {};
    const candidates = [...question.parejas.map((pair) => pair.derecha),
      ...(question.interaction_contract_version === 2 ? (question.opciones || []) : [])]
      .map((value) => String(value || '').trim())
      .filter((value, index, values) => value && values.indexOf(value) === index);
    const optionOrder = getStableDragTileOrder(key + '::matching-options', candidates.length);
    const options = optionOrder.map((index) => candidates[index]);
    const rows = question.parejas.map((pair, index) => {
      const currentValue = selections[String(index)] || "";
      return '<div class="match-row-grid"><div class="match-item">' + escapeHtml(pair.izquierda) + '</div><select class="match-select" data-question-match-select="' + escapeHtmlAttr(key) + '" data-match-index="' + index + '"><option value="">' + escapeHtml(t("selectOption")) + '</option>' + options.map((option) => '<option value="' + escapeHtmlAttr(option) + '"' + (currentValue === option ? ' selected' : '') + '>' + escapeHtml(option) + '</option>').join('') + '</select></div>';
    }).join('');
    return '<div class="match-grid">' + rows + '</div>';
  }

  function getStableDragTileOrder(key, count) {
    const values = Array.from({ length: count }, (_, index) => index);
    let hash = 2166136261;
    const seed = String(REVIEW_PROGRESS_ID || ESCAPE_ROOM_PROGRESS_FINGERPRINT) + "::" + String(key);
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    for (let index = values.length - 1; index > 0; index -= 1) {
      hash = Math.imul(hash ^ (hash >>> 15), 2246822519) >>> 0;
      const swapIndex = hash % (index + 1);
      const current = values[index];
      values[index] = values[swapIndex];
      values[swapIndex] = current;
    }
    if (values.length > 1 && values.every((value, index) => value === index)) {
      values.push(values.shift());
    }
    return values;
  }

  function getDragAssignments(key) {
    if (!state.questionDragMatches[key] || typeof state.questionDragMatches[key] !== "object") {
      state.questionDragMatches[key] = {};
    }
    return state.questionDragMatches[key];
  }

  function getDragLockedTargets(key) {
    if (!state.questionDragLocked[key] || typeof state.questionDragLocked[key] !== "object") {
      state.questionDragLocked[key] = {};
    }
    return state.questionDragLocked[key];
  }

  function isWordBankQuestion(question) {
    return question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2;
  }

  function usesDragAnswers(question) {
    return question.tipo_interaccion === 'drag_drop' || isWordBankQuestion(question);
  }

  function getDragTiles(question) {
    const answers = (question.parejas || []).map(pair => String(pair.derecha || ''));
    return isWordBankQuestion(question) ? answers.concat(question.opciones || []) : answers;
  }

  function renderMissionDragDropBlock(question, key) {
    const wordBank = isWordBankQuestion(question);
    const pairs = Array.isArray(question.parejas) ? question.parejas : [];
    const tiles = getDragTiles(question);
    const assignments = getDragAssignments(key);
    const locked = getDragLockedTargets(key);
    const selectedTile = Number(state.selectedDragTiles[key]);
    const assignedTiles = new Set(Object.values(assignments).map((value) => Number(value)).filter(Number.isInteger));
    const tileOrder = getStableDragTileOrder(key, tiles.length);
    const tray = tileOrder.filter((tileIndex) => !assignedTiles.has(tileIndex)).map((tileIndex) => {
      const selected = selectedTile === tileIndex;
      const tile = tiles[tileIndex];
      return '<button type="button" class="drag-match-tile' + (selected ? ' is-selected' : '') + '" data-drag-tile="' + escapeHtmlAttr(key) + '" data-drag-tile-index="' + tileIndex + '" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-label="' + escapeHtmlAttr(t("dragTileLabel", { tile })) + '">' + escapeHtml(tile) + '</button>';
    }).join('');
    const targetButtons = pairs.map((pair, targetIndex) => {
      const assignedTile = Number(assignments[String(targetIndex)]);
      const hasTile = Number.isInteger(assignedTile) && tiles[assignedTile];
      const isLocked = locked[String(targetIndex)] === true;
      const tileLabel = hasTile ? tiles[assignedTile] : "";
      const targetClass = 'drag-match-target' + (wordBank ? ' word-bank-slot' : '') + (hasTile ? ' is-filled' : '') + (isLocked ? ' is-correct' : '');
      const ariaLabel = hasTile
        ? t("dragTargetFilledLabel", { target: pair.izquierda || "", tile: tileLabel })
        : t("dragTargetLabel", { target: pair.izquierda || "" });
      return '<button type="button" class="' + targetClass + '" data-drag-target="' + escapeHtmlAttr(key) + '" data-drag-target-index="' + targetIndex + '"' + (hasTile ? ' data-assigned-tile-index="' + assignedTile + '"' : '') + (isLocked ? ' data-drag-locked="true" disabled aria-disabled="true"' : '') + ' aria-label="' + escapeHtmlAttr(ariaLabel) + '">' + (wordBank ? '' : '<span class="drag-match-target-label">' + escapeHtml(pair.izquierda || "") + '</span>') + '<span class="drag-match-target-slot">' + escapeHtml(hasTile ? tileLabel : wordBank ? ' ' : t("dragEmptySlot")) + '</span></button>';
    });
    if (wordBank) {
      const fragments = String(question.texto_con_hueco || '').split('___');
      const passage = fragments.map((text, index) => escapeHtml(text) + (targetButtons[index] || '')).join('');
      return '<div class="drag-match-board word-bank-board" data-drag-board="' + escapeHtmlAttr(key) + '"><div class="word-bank-passage">' + passage + '</div><p class="drag-match-help">' + escapeHtml(t('dragInstructions')) + '</p><div class="drag-match-tray" aria-label="' + escapeHtmlAttr(t('dragTray')) + '">' + (tray || '<div class="drag-match-empty">' + escapeHtml(t('dragTrayEmpty')) + '</div>') + '</div><div class="sr-only" data-drag-live="' + escapeHtmlAttr(key) + '" aria-live="polite" aria-atomic="true"></div></div>';
    }
    const targets = targetButtons.join('');
    return '<div class="drag-match-board" data-drag-board="' + escapeHtmlAttr(key) + '">' +
      '<p class="drag-match-help">' + escapeHtml(t("dragInstructions")) + '</p>' +
      '<div class="drag-match-tray" aria-label="' + escapeHtmlAttr(t("dragTray")) + '">' + (tray || '<div class="drag-match-empty">' + escapeHtml(t("dragTrayEmpty")) + '</div>') + '</div>' +
      '<div class="drag-match-targets">' + targets + '</div>' +
      '<div class="sr-only" data-drag-live="' + escapeHtmlAttr(key) + '" aria-live="polite" aria-atomic="true"></div>' +
    '</div>';
  }

  function isDuplicateMediaNote(note, fallbackText) {
    const normalizedNote = String(note || '').trim();
    const normalizedFallback = String(fallbackText || '').trim();
    return Boolean(normalizedNote) && normalizedNote === normalizedFallback;
  }

  function renderQuestionMedia(question, fallbackText = '') {
    const media = question.media;
    const safeUrl = media?.url && isRenderableMediaUrl(media.url) ? media.url : "";
    if (!safeUrl) {
      const note = media?.texto || media?.alt || "";
      if (!note || isDuplicateMediaNote(note, fallbackText)) return "";
      return '<div class="media-card media-card-empty"><div class="muted">' + escapeHtml(note) + '</div></div>';
    }
    if (media.tipo === "audio") {
      return '<div class="media-card"><audio controls src="' + escapeHtmlAttr(safeUrl) + '"></audio><div class="muted">' + escapeHtml(media.alt || "") + '</div></div>';
    }
    if (media.tipo === "video") {
      return '<div class="media-card"><video controls src="' + escapeHtmlAttr(safeUrl) + '"></video><div class="muted">' + escapeHtml(media.alt || "") + '</div></div>';
    }
    return '<div class="media-card"><img src="' + escapeHtmlAttr(safeUrl) + '" alt="' + escapeHtmlAttr(media.alt || question.titulo) + '"></div>';
  }

  function filterDiscarded(html, key) {
    const removed = state.experience.discarded?.[key] || [];
    if (!removed.length) return html;
    const template = document.createElement('template'); template.innerHTML = html;
    template.content.querySelectorAll('[data-choice-index], [data-exp-option]').forEach(button => {
      const id = button.dataset.expOption || button.dataset.choiceIndex;
      if (removed.includes(id)) { button.hidden = true; button.disabled = true; }
    });
    return template.innerHTML;
  }
  function renderQuestionInteraction(question, key) {
    if (EXP.get(question.tipo_interaccion)) return filterDiscarded(EXP.render(question.tipo_interaccion, question.interaction_data, state.experience.answers[key] || {}, key, ESCAPE_ROOM_DATA.idioma), key);
    if ((question.tipo_interaccion === "opcion_multiple" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version === 1))) return filterDiscarded(renderMissionChoiceBlock(question, key), key);
    if (question.tipo_interaccion === "verdadero_falso") return renderTrueFalseBlock(question, key);
    if (question.tipo_interaccion === "relacion_columnas") return renderMissionMatchingBlock(question, key);
    if (usesDragAnswers(question)) return renderMissionDragDropBlock(question, key);
    if (question.tipo_interaccion === "ordenar_secuencia") return renderSequenceBlock(question, key);
    if (question.tipo_interaccion === "completar_espacio") return renderFillBlankBlock(question, key);
    return renderMissionTextBlock(question, key);
  }

  function renderQuestionCard(mission, question, questionIndex) {
    const key = getQuestionKey(mission, question);
    const total = getRoomQuestions(mission).length || 1;
    const complete = state.completedQuestions.has(key);
    const statusText = complete ? (question.retroalimentacion_correcta || t("correct")) : t("defaultChallenge");
    const mediaHtml = renderQuestionMedia(question, question.reto);
    const interactionHtml = complete ? '<div class="status-box is-good">' + escapeHtml(t("questionCompleted")) + '</div>' : renderQuestionInteraction(question, key);
    const isInlineAnswer = question.tipo_interaccion === 'texto' && question.subtipo_respuesta === 'numero';
    const isBriefTextAnswer = (question.tipo_interaccion === 'texto' || (question.tipo_interaccion === 'multimedia' && question.interaction_contract_version !== 1))
      && question.subtipo_respuesta !== 'frase_libre';
    const isVisualMedia = Boolean(question.media?.url)
      && isRenderableMediaUrl(question.media.url)
      && !['audio', 'video'].includes(question.media?.tipo);
    const usesMediaAnswerSplit = isBriefTextAnswer && isVisualMedia;
    const cardClass = 'mission-panel question-card'
      + (complete ? ' is-complete' : '')
      + (usesMediaAnswerSplit ? ' is-media-answer-split' : '');
    const responseRowClass = 'question-response-row' + (isInlineAnswer ? ' is-inline-answer' : '');
    const questionContent =
      '<div class="question-head">' +
        '<div>' +
          '<div class="label">' + escapeHtml(t("questionCounter", { current: String(questionIndex + 1).padStart(2, '0'), total: String(total).padStart(2, '0') })) + '</div>' +
          '<h3 class="question-title">' + escapeHtml(question.titulo) + '</h3>' +
        '</div>' +
      '</div>' +
      (isWordBankQuestion(question) && (!question.reto || String(question.reto).includes('___') || question.reto === question.texto_con_hueco) ? '' : '<p class="question-story">' + escapeHtml(question.tipo_interaccion === 'completar_espacio' && !isWordBankQuestion(question) && String(question.reto).includes('___') ? t('fillBlankInstruction') : question.reto) + '</p>') +
      (usesMediaAnswerSplit ? '' : mediaHtml) +
      '<div class="' + responseRowClass + '">' +
        '<div class="question-challenge">' + interactionHtml + '</div>' +
        '<div class="button-row question-actions">' +
          '<button type="button" class="primary" data-question-verify="' + escapeHtmlAttr(key) + '"' + (complete ? ' disabled' : '') + '>' + escapeHtml(complete ? t("completed") : t("verify")) + '</button>' +
          '<button type="button" class="secondary question-hint-icon" data-question-hint="' + escapeHtmlAttr(key) + '" title="' + escapeHtmlAttr(t("revealHint")) + '" aria-label="' + escapeHtmlAttr(t("revealHint")) + '"' + (complete ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 3H9l-1-3Z"/></svg></button>' +
          (complete ? '' : renderBonusButtons(question, key, 'controls')) +
        '</div>' +
      '</div>' +
      (complete ? '' : renderBonusButtons(question, key, 'status')) +
      '<div class="status-box' + (complete ? ' is-good' : '') + '" data-question-status="' + escapeHtmlAttr(key) + '" role="status" aria-live="polite" aria-atomic="true">' + escapeHtml(statusText) + '</div>';
    const cardContent = usesMediaAnswerSplit
      ? mediaHtml + '<div class="question-card-content">' + questionContent + '</div>'
      : questionContent;
    return '<article class="' + cardClass + '" data-question-card data-question-key="' + escapeHtmlAttr(key) + '">' + cardContent + '</article>';
  }

  function renderInvestigationBoard(mission, includeAcknowledge = false) {
    const evidence = Array.isArray(mission?.datos_clave) ? mission.datos_clave.filter(Boolean) : [];
    const briefingText = (field, fallbackKey) => String(mission?.[field] || '').trim() || t(fallbackKey);
    const evidenceHtml = evidence.length
      ? '<div><div class="label investigation-evidence-heading">' + escapeHtml(briefingText("briefing_evidencias_titulo", "keyEvidence")) + '</div><div class="investigation-evidence-grid">' + evidence.map((item, index) => (
          '<div class="evidence-card"><span class="evidence-index">' + String(index + 1).padStart(2, '0') + '</span>' + escapeHtml(item) + '</div>'
        )).join('') + '</div></div>'
      : '';
    const actionHtml = includeAcknowledge
      ? '<div class="investigation-board-actions"><button type="button" class="primary" data-briefing-ack="' + escapeHtmlAttr(mission.id) + '">' + escapeHtml(briefingText("briefing_boton_inicio", "briefingAcknowledge")) + '</button></div>'
      : '';
    return '<section class="investigation-board" data-briefing-board="' + escapeHtmlAttr(mission.id) + '" aria-labelledby="briefing-title-' + escapeHtmlAttr(mission.id) + '">' +
      '<div class="investigation-board-head"><div class="label">' + escapeHtml(mission.release || t("section")) + '</div><h3 class="investigation-board-title" id="briefing-title-' + escapeHtmlAttr(mission.id) + '">' + escapeHtml(briefingText("briefing_titulo", "investigationBoard")) + '</h3><p class="investigation-board-lead">' + escapeHtml(briefingText("briefing_instruccion", "briefingLead")) + '</p></div>' +
      '<article class="investigation-document"><p>' + escapeHtml(mission.contexto || mission.historia) + '</p></article>' +
      evidenceHtml +
      '<div class="investigation-objective"><strong>' + escapeHtml(briefingText("briefing_objetivo_titulo", "missionObjective")) + '</strong><p>' + escapeHtml(mission.reto) + '</p></div>' +
      actionHtml +
    '</section>';
  }

  function setRoomStatus(message, type) {
    if (!els.roomStatusBox) return;
    els.roomStatusBox.textContent = message;
    els.roomStatusBox.className = 'status-box room-status-box' + (type ? ' is-' + type : '');
  }

  function setQuestionStatus(key, message, type) {
    const status = els.missionStage?.querySelector('[data-question-status="' + CSS.escape(key) + '"]');
    if (!status) return;
    status.textContent = message;
    status.className = 'status-box' + (type ? ' is-' + type : '');
  }

  function setQuestionCardCompleteState(key) {
    const card = els.missionStage?.querySelector('[data-question-card][data-question-key="' + CSS.escape(key) + '"]');
    if (!card) return;
    card.classList.add('is-complete');
    card.querySelectorAll('button, input, select, textarea').forEach((field) => {
      if (field.matches('[data-question-hint]')) return;
      field.disabled = true;
    });
    const verify = card.querySelector('[data-question-verify]');
    if (verify) verify.textContent = t("completed");
  }

  function checkMatchingQuestion(question, key) {
    const selected = state.questionMatches[key] || {};
    return question.parejas.every((pair, index) => {
      const selectedValue = String(selected[String(index)] || "");
      const correctValue = String(pair.derecha || "");
      return selectedValue === correctValue;
    });
  }

  function announceDrag(key, message) {
    const text = String(message || "");
    const live = els.missionStage?.querySelector('[data-drag-live="' + CSS.escape(key) + '"]');
    if (live) live.textContent = text;
    if (els.liveStatus) els.liveStatus.textContent = text;
  }

  function findDragQuestion(key) {
    const mission = missionById(state.currentMissionId);
    if (!mission) return null;
    const question = getRoomQuestions(mission).find((item) => getQuestionKey(mission, item) === key) || null;
    return question ? { mission, question } : null;
  }

  function removeDragTileFromAssignments(assignments, tileIndex) {
    Object.keys(assignments).forEach((targetIndex) => {
      if (Number(assignments[targetIndex]) === Number(tileIndex)) delete assignments[targetIndex];
    });
  }

  function refreshDragBoard(key, focusSelector, announcement) {
    renderMission();
    window.requestAnimationFrame(() => {
      const focusTarget = focusSelector ? els.missionStage?.querySelector(focusSelector) : null;
      if (focusTarget && !focusTarget.disabled && (document.activeElement === document.body || !document.activeElement)) safeFocus(focusTarget);
      if (announcement) announceDrag(key, announcement);
    });
  }

  function selectDragTile(key, tileIndex) {
    const found = findDragQuestion(key);
    if (!found || !state.isStarted || state.isFinished) return;
    const tile = getDragTiles(found.question)[tileIndex];
    if (!tile) return;
    const assignments = getDragAssignments(key);
    const locked = getDragLockedTargets(key);
    const lockedTarget = Object.keys(assignments).find((targetIndex) => Number(assignments[targetIndex]) === tileIndex && locked[targetIndex] === true);
    if (lockedTarget != null) return;
    removeDragTileFromAssignments(assignments, tileIndex);
    state.selectedDragTiles[key] = tileIndex;
    persistProgressState();
    refreshDragBoard(
      key,
      '[data-drag-target="' + CSS.escape(key) + '"]:not(:disabled)',
      t("dragTileSelected", { tile })
    );
  }

  function placeDragTile(key, targetIndex, explicitTileIndex = null) {
    const found = findDragQuestion(key);
    if (!found || !state.isStarted || state.isFinished) return false;
    const pairs = found.question.parejas || [];
    const tiles = getDragTiles(found.question);
    const locked = getDragLockedTargets(key);
    if (locked[String(targetIndex)] === true || !pairs[targetIndex]) return false;
    const selectedTile = explicitTileIndex == null ? Number(state.selectedDragTiles[key]) : Number(explicitTileIndex);
    if (!Number.isInteger(selectedTile) || !tiles[selectedTile]) return false;
    const assignments = getDragAssignments(key);
    removeDragTileFromAssignments(assignments, selectedTile);
    assignments[String(targetIndex)] = selectedTile;
    delete state.selectedDragTiles[key];
    persistProgressState();
    refreshDragBoard(
      key,
      '[data-drag-tile="' + CSS.escape(key) + '"]',
      t("dragTilePlaced", { tile: tiles[selectedTile], target: pairs[targetIndex].izquierda || "" })
    );
    return true;
  }

  function checkDragDropQuestion(question, key) {
    const assignments = getDragAssignments(key);
    return question.parejas.length > 0 && question.parejas.every((_, targetIndex) => isCorrectDragAssignment(question, assignments, targetIndex));
  }

  function isCorrectDragAssignment(question, assignments, targetIndex) {
    const tile = assignments[String(targetIndex)];
    if (tile === undefined || !Number.isInteger(Number(tile))) return false;
    return isWordBankQuestion(question)
      ? getDragTiles(question)[Number(tile)] === question.parejas[targetIndex]?.derecha
      : Number(tile) === targetIndex;
  }

  function rejectIncorrectDragMatches(question, key) {
    const assignments = getDragAssignments(key);
    const locked = getDragLockedTargets(key);
    const wrongTargets = [];
    question.parejas.forEach((_, targetIndex) => {
      const assignedTile = Number(assignments[String(targetIndex)]);
      if (isCorrectDragAssignment(question, assignments, targetIndex)) {
        locked[String(targetIndex)] = true;
      } else if (Number.isInteger(assignedTile)) {
        wrongTargets.push(targetIndex);
      }
    });
    wrongTargets.forEach((targetIndex) => {
      const target = els.missionStage?.querySelector('[data-drag-target="' + CSS.escape(key) + '"][data-drag-target-index="' + targetIndex + '"]');
      if (target) target.classList.add("is-wrong");
    });
    announceDrag(key, t("dragTryAgain"));
    persistProgressState();
    window.setTimeout(() => {
      if (state.isFinished || getRemainingSeconds() <= 0) return;
      wrongTargets.forEach((targetIndex) => delete assignments[String(targetIndex)]);
      delete state.selectedDragTiles[key];
      persistProgressState();
      refreshDragBoard(key, '[data-drag-tile="' + CSS.escape(key) + '"]', t("dragIncorrectReturned"));
      setQuestionStatus(key, question.retroalimentacion_incorrecta || t("incorrect"), "bad");
    }, 380);
  }

  function announceSequence(key, message) {
    const text = String(message || '');
    const live = els.missionStage?.querySelector('[data-sequence-live="' + CSS.escape(key) + '"]');
    if (live) live.textContent = text;
    if (els.liveStatus) els.liveStatus.textContent = text;
  }

  function moveSequenceItem(key, fromPosition, toPosition) {
    if (!state.isStarted || state.isFinished || getRemainingSeconds() <= 0) return false;
    const found = findDragQuestion(key);
    if (!found || found.question.tipo_interaccion !== 'ordenar_secuencia') return false;
    const order = getSequenceOrder(found.question, key);
    const from = Math.max(0, Math.min(order.length - 1, Number(fromPosition)));
    const to = Math.max(0, Math.min(order.length - 1, Number(toPosition)));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return false;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    state.questionSequenceOrders[key] = order;
    state.questionSequenceTouched[key] = true;
    delete state.selectedSequenceItems[key];
    persistProgressState();
    const label = found.question.elementos?.[moved] || '';
    renderMission();
    window.requestAnimationFrame(() => {
      const focus = els.missionStage?.querySelector('[data-sequence-item="' + CSS.escape(key) + '"][data-sequence-position="' + to + '"]');
      safeFocus(focus);
      announceSequence(key, t("sequenceMoved", { item: label, position: to + 1 }));
    });
    return true;
  }

  function checkSequenceQuestion(question, key) {
    return getSequenceOrder(question, key).every((sourceIndex, position) => sourceIndex === position);
  }

  function markQuestionComplete(mission, question) {
    const key = getQuestionKey(mission, question);
    state.completedQuestions.add(key);
    setQuestionCardCompleteState(key);
    setQuestionStatus(key, question.retroalimentacion_correcta || t("correct"), 'good');
    persistProgressState();
    const completedCount = getCompletedQuestionCount(mission);
    const totalQuestions = getRoomQuestions(mission).length || 1;
    if (els.questionProgress) {
      els.questionProgress.textContent = t("questionsSolved", { done: completedCount, total: totalQuestions });
    }
    if (areMissionQuestionsCompleted(mission)) {
      const transition = markMissionComplete(mission);
      if (transition?.showUnlock) {
        render();
        return;
      }
      setRoomStatus(IS_MENU_MODE ? t("activityComplete") : t("roomComplete"), 'good');
      renderMission();
      return;
    }
    setRoomStatus(IS_MENU_MODE ? t("continueActivity") : t("continueRoom"), 'info');
  }

  function renderMission() {
    if (!els.missionStage) return;
    if (state.roomUnlockTransition?.phase === "feedback") {
      scheduleRoomUnlockAdvance();
    } else if (state.roomUnlockTransition) {
      renderRoomUnlockTransition();
      return;
    }
    const mission = missionById(state.currentMissionId);
    if (!mission) {
      els.missionStage.innerHTML = '';
      if (els.questionProgress) {
        els.questionProgress.textContent = t("questionsSolved", { done: 0, total: 0 });
      }
      return;
    }

    const questions = getRoomQuestions(mission);
    const completedCount = getCompletedQuestionCount(mission);
    const roomComplete = areMissionQuestionsCompleted(mission);
    const briefingRead = state.readBriefings.has(mission.id);
    const canReviewBriefing = briefingRead && (!state.isStarted || window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ === true);
    const roomStatusText = roomComplete
      ? (IS_MENU_MODE ? t("activityReady") : t("roomReady"))
      : (IS_MENU_MODE ? t("solveActivityQuestions") : t("solveRoomQuestions"));
    const roomCompletionNotice = state.pendingRoomCompletionFeedback
      ? '<div class="status-box is-good" data-room-completion-notice role="status" aria-live="polite">' + escapeHtml(state.pendingRoomCompletionFeedback) + '</div>'
      : '';
    state.pendingRoomCompletionFeedback = "";
    const questionCards = briefingRead ? questions.map((question, index) => renderQuestionCard(mission, question, index)).join('') : '';
    const missionMediaHtml = briefingRead ? renderQuestionMedia(mission, mission.reto) : '';
    if (els.questionProgress) {
      els.questionProgress.textContent = t("questionsSolved", { done: completedCount, total: questions.length });
    }
    const nextActionSlot = document.querySelector('[data-menu-next-slot]');
    if (nextActionSlot) {
      nextActionSlot.innerHTML = IS_MENU_MODE && roomComplete
        ? '<button type="button" class="primary" data-menu-next>' + escapeHtml(areAllMissionsCompleted() ? t("nextFinal") : t("next")) + '</button>'
        : '';
    }

    els.missionStage.innerHTML = roomCompletionNotice +
      '<section class="mission-panel" data-room-palette style="' + escapeHtmlAttr(getMissionPaletteStyle(mission)) + '">' +
        '<h2 class="mission-title">' + escapeHtml(mission.titulo) + '</h2>' +
        '<p class="mission-story">' + escapeHtml(mission.historia) + '</p>' +
        (briefingRead
          ? (canReviewBriefing ? '<details class="briefing-review"><summary>' + escapeHtml(String(mission.briefing_boton_revisar || '').trim() || t("briefingReview")) + '</summary>' + renderInvestigationBoard(mission, false) + '</details>' : '')
          : renderInvestigationBoard(mission, true)) +
        (briefingRead ? (
        '<div class="mission-layout' + (missionMediaHtml ? ' has-room-media' : '') + '">' +
          (missionMediaHtml ? '<div class="mission-room-media">' + missionMediaHtml + '</div>' : '') +
          '<div class="mission-challenge-content">' +
            '<div class="label mission-challenge-label">' + escapeHtml(t("challenge")) + '</div>' +
            '<div class="challenge-box">' + escapeHtml(mission.reto) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="status-box room-status-box" id="roomStatusBox">' + roomStatusText + '</div>' +
        '<div class="question-list">' + questionCards + '</div>'
        ) : '') +
      '</section>';

    els.questionProgress = document.getElementById('questionProgress');
    els.roomStatusBox = document.getElementById('roomStatusBox');
    wireMissionEvents();
  }

  function getMissionCodeFragment(mission) {
    const characters = Array.from(String(ESCAPE_ROOM_FINAL_PASSCODE || "")).filter((character) => character.trim());
    const roomCount = Math.max(1, ESCAPE_ROOM_DATA.misiones.length);
    const roomIndex = Math.max(0, ESCAPE_ROOM_DATA.misiones.findIndex((item) => item.id === mission?.id));
    const baseSize = Math.floor(characters.length / roomCount);
    const remainder = characters.length % roomCount;
    const start = (roomIndex * baseSize) + Math.min(roomIndex, remainder);
    const size = baseSize + (roomIndex < remainder ? 1 : 0);
    return characters.slice(start, start + Math.max(1, size)).join("") || "•";
  }

  function findNextAvailableMission(mission) {
    const currentIndex = ESCAPE_ROOM_DATA.misiones.findIndex((item) => item.id === mission?.id);
    return ESCAPE_ROOM_DATA.misiones
      .slice(Math.max(0, currentIndex + 1))
      .find((item) => state.unlocked.has(item.id) && !state.completed.has(item.id))
      || ESCAPE_ROOM_DATA.misiones.find((item) => state.unlocked.has(item.id) && !state.completed.has(item.id))
      || null;
  }

  function clearRoomUnlockTimer() {
    if (state.roomUnlockTimeoutId) window.clearTimeout(state.roomUnlockTimeoutId);
    state.roomUnlockTimeoutId = null;
  }

  function scheduleRoomUnlockAdvance() {
    clearRoomUnlockTimer();
    if (!state.roomUnlockTransition || state.isFinished) return;
    if (state.roomUnlockTransition.phase === "feedback") {
      const pending = state.roomUnlockTransition;
      state.roomUnlockTimeoutId = window.setTimeout(() => {
        if (state.roomUnlockTransition !== pending || state.isFinished) return;
        pending.phase = "reward";
        pending.startedAtMs = Date.now();
        state.roomUnlockTimeoutId = null;
        persistProgressState();
        render();
        scrollMissionStageToTop();
      }, Math.max(0, pending.feedbackUntilMs - Date.now()));
      return;
    }
    if (IS_MENU_MODE) return;
    const elapsed = Math.max(0, Date.now() - Number(state.roomUnlockTransition.startedAtMs || Date.now()));
    const remaining = Math.max(0, 5000 - elapsed);
    state.roomUnlockTimeoutId = window.setTimeout(() => {
      state.roomUnlockTimeoutId = null;
      continueFromRoomUnlockTransition();
    }, remaining);
  }

  function renderRoomUnlockTransition() {
    const transition = state.roomUnlockTransition;
    const completedMission = missionById(transition?.completedMissionId);
    if (!transition || !completedMission) {
      state.roomUnlockTransition = null;
      renderMission();
      return;
    }
    const fragment = getMissionCodeFragment(completedMission);
    const rewardPlan = ESCAPE_ROOM_DATA.reward_plan;
    const roomIndex = Math.max(0, ESCAPE_ROOM_DATA.misiones.findIndex((item) => item.id === completedMission.id));
    const isFinalRoom = !transition.nextMissionId;
    const isSingleLetter = Array.from(fragment).length === 1;
    const titleKey = isSingleLetter ? "codeFragmentUnlocked" : "codeFragmentUnlockedMany";
    const rewardTitle = rewardPlan && rewardPlan.type !== "letras" ? EXP.ui(ESCAPE_ROOM_DATA.idioma, "earned") : t(titleKey);
    const progressKey = isSingleLetter ? "unlockedCodeLetterProgress" : "unlockedCodeFragmentProgress";
    const continueLabel = isFinalRoom
      ? t("continueToFinalChallenge")
      : (IS_MENU_MODE ? t("continueToMenu") : t("continueToNextRoom"));
    const continueAriaLabel = IS_MENU_MODE ? continueLabel : t("skipUnlockTransition");
    const continueCountdown = IS_MENU_MODE ? "" : " · 5s";
    const nextActionSlot = document.querySelector('[data-menu-next-slot]');
    if (nextActionSlot) nextActionSlot.innerHTML = "";
    if (els.questionProgress) {
      els.questionProgress.textContent = t("questionsSolved", {
        done: getRoomQuestions(completedMission).length,
        total: getRoomQuestions(completedMission).length
      });
    }
    els.missionStage.innerHTML =
      '<section class="mission-panel room-unlock-transition" data-room-palette style="' + escapeHtmlAttr(getMissionPaletteStyle(completedMission)) + '" role="status" aria-live="polite" aria-labelledby="roomUnlockTitle">' +
        '<div class="room-unlock-eyebrow">' + escapeHtml(t("codeFragmentUnlockedEyebrow")) + '</div>' +
        '<h2 class="mission-title" id="roomUnlockTitle">' + escapeHtml(rewardTitle) + '</h2>' +
        (rewardPlan && rewardPlan.type !== 'letras' ? REWARDS.rewardHTML(rewardPlan, roomIndex, ESCAPE_ROOM_DATA.idioma) :
        '<div class="room-unlock-letter-shell" aria-label="' + escapeHtmlAttr(t("unlockedCodeFragmentLabel", { fragment })) + '">' +
          '<span class="room-unlock-letter" aria-hidden="true">' + escapeHtml(fragment) + '</span>' +
        '</div>') +
        (state.experience.awarded[completedMission.id]?.perfect ? '<p>' + escapeHtml(EXP.ui(ESCAPE_ROOM_DATA.idioma, 'perfect')) + '</p>' : '') +
        (String(completedMission.retroalimentacion_correcta || "").trim()
          ? '<p class="room-unlock-feedback">' + escapeHtml(completedMission.retroalimentacion_correcta) + '</p>'
          : '') +
        '<div class="room-unlock-progress">' + escapeHtml(rewardPlan && rewardPlan.type !== "letras" ? (roomIndex + 1) + " / " + ESCAPE_ROOM_DATA.misiones.length : t(progressKey, { current: roomIndex + 1, total: ESCAPE_ROOM_DATA.misiones.length })) + '</div>' +
        '<button type="button" class="primary room-unlock-continue" data-room-unlock-continue aria-label="' + escapeHtmlAttr(continueAriaLabel) + '">' + escapeHtml(continueLabel + continueCountdown) + '</button>' +
      '</section>';
    els.roomStatusBox = null;
    wireMissionEvents();
    scheduleRoomUnlockAdvance();
  }

  function continueFromRoomUnlockTransition() {
    const transition = state.roomUnlockTransition;
    if (!transition || transition.phase === "feedback") return;
    clearRoomUnlockTimer();
    state.roomUnlockTransition = null;
    state.pendingRoomCompletionFeedback = "";
    if (transition.nextMissionId) {
      state.currentMissionId = transition.nextMissionId;
      state.galleryScreen = IS_MENU_MODE ? "menu" : "mission";
    } else {
      state.galleryScreen = "ending";
    }
    persistProgressState();
    render();
    if (!IS_MENU_MODE && state.galleryScreen === "mission") scrollMissionStageToTop();
    else if (IS_MENU_MODE) focusActiveMenuScreen();
  }

  function markMissionComplete(mission) {
    state.completed.add(mission.id);
    if (ESCAPE_ROOM_DATA.experience_config) EXP.award(state.experience, mission, ESCAPE_ROOM_DATA.experience_config);
    if (IS_MENU_MODE) {
      syncMenuUnlocksFromProgress();
    } else {
      (mission.desbloquea || []).forEach((targetId) => state.unlocked.add(targetId));
    }
    updateProgress();
    renderMap();
    const nextMission = areAllMissionsCompleted() ? null : findNextAvailableMission(mission);
    state.roomUnlockTransition = {
      phase: "feedback",
      feedbackUntilMs: Date.now() + 3000,
      completedMissionId: mission.id,
      nextMissionId: nextMission?.id || null,
      startedAtMs: Date.now()
    };
    state.galleryScreen = "mission";
    persistProgressState();
    renderGallery();
    return { ending: false, nextMission, showUnlock: true };
  }

  function setEditorialReviewAction(action = "autofill") {
    const button = document.querySelector("[data-editorial-autofill]");
    if (!button) return;
    const shouldStart = action === "start";
    const shouldVerify = action === "verify";
    const shouldSkip = action === "skip";
    const currentMission = missionById(state.currentMissionId);
    const isBriefingStart = shouldStart
      && state.isStarted
      && state.galleryScreen === "mission"
      && currentMission
      && !state.readBriefings.has(currentMission.id);
    const isFinalCodeScreen = state.galleryScreen === "ending";
    const startLabel = isBriefingStart
      ? (String(currentMission?.briefing_boton_inicio || '').trim() || t("briefingAcknowledge"))
      : t("start");
    const buttonLabel = shouldSkip
      ? t("skipUnlockTransition")
      : shouldStart
      ? startLabel
      : isFinalCodeScreen
        ? (shouldVerify ? t("verify") + ": " + t("finalCode") : t("autofillScreen") + ": " + t("finalCode"))
        : (shouldVerify ? t("verifyAnswers") : t("autofillScreen"));
    const ariaLabel = shouldSkip
      ? t("skipUnlockTransition")
      : shouldStart
      ? startLabel
      : isFinalCodeScreen
        ? buttonLabel
        : (shouldVerify ? t("verifyAllAnswers") : t("autofillAllAnswers"));
    button.dataset.editorialAction = shouldSkip ? "skip" : (shouldStart ? "start" : (shouldVerify ? "verify" : "autofill"));
    const icons = {
      start: '<path d="m9 5 11 7-11 7V5Z"/>',
      autofill: '<path d="m4 20 12-12 4 4L8 24M14 3v4M12 5h4M4 5v4M2 7h4M20 17v4M18 19h4" transform="translate(0 -2)"/>',
      verify: '<path d="m5 12 4 4L19 6"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8"/>',
      skip: '<path d="m5 5 10 7-10 7V5ZM19 5v14"/>'
    };
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + icons[button.dataset.editorialAction] + '</svg>';
    button.title = buttonLabel;
    button.setAttribute("aria-label", ariaLabel);
    if (window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ === true && window.parent !== window) {
      // El preview editorial vive en un sandbox de origen opaco; el padre valida event.source y el esquema.
      window.parent.postMessage({
        type: "pigpen-editorial-action",
        action: button.dataset.editorialAction,
        label: ariaLabel
      }, "*");
    }
  }

  function syncEditorialReviewActionForCurrentScreen() {
    const currentMission = missionById(state.currentMissionId);
    const briefingPending = state.galleryScreen === "mission"
      && currentMission
      && !state.readBriefings.has(currentMission.id);
    const desiredAction = state.roomUnlockTransition
      ? "skip"
      : (!state.isStarted || briefingPending ? "start" : "autofill");
    const contextKey = state.galleryScreen + ":" + (state.currentMissionId || "none") + ":" + desiredAction;
    if (state.editorialReviewContextKey === contextKey) return;
    state.editorialReviewContextKey = contextKey;
    setEditorialReviewAction(desiredAction);
  }

  function focusEditorialPreviewQuestion(missionId, questionId) {
    if (window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ !== true) return false;
    const mission = missionById(String(missionId || ""));
    const question = getRoomQuestions(mission).find((item) => item.id === String(questionId || ""));
    if (!mission || !question) return false;

    state.currentMissionId = mission.id;
    state.galleryScreen = "mission";
    state.readBriefings.add(mission.id);
    render();

    window.requestAnimationFrame(() => {
      const key = getQuestionKey(mission, question);
      const card = els.missionStage?.querySelector('[data-question-card][data-question-key="' + CSS.escape(key) + '"]');
      if (!card) return;
      card.scrollIntoView({ block: "center", behavior: "auto" });
    });
    return true;
  }

  function focusEditorialPreviewBriefing(missionId) {
    if (window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ !== true) return false;
    const mission = missionById(String(missionId || ""));
    if (!mission) return false;

    state.currentMissionId = mission.id;
    state.galleryScreen = "mission";
    state.readBriefings.add(mission.id);
    render();

    window.requestAnimationFrame(() => {
      const briefing = els.missionStage?.querySelector(".briefing-review");
      if (!briefing) return;
      briefing.open = true;
      briefing.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return true;
  }

  if (window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ === true) {
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "pigpen-preview-fullscreen-state") {
        state.isHostFullscreen = payload.active === true;
        syncFullscreenControls();
        return;
      }
      if (payload.type === "pigpen-preview-editorial-action") {
        if (!["start", "autofill", "verify", "skip"].includes(payload.action)) return;
        setEditorialReviewAction(payload.action);
        autocompleteCurrentScreen();
        return;
      }
      if (payload.type !== "pigpen-preview-navigate") return;
      if (payload.target === "briefing") {
        focusEditorialPreviewBriefing(payload.missionId);
        return;
      }
      focusEditorialPreviewQuestion(payload.missionId, payload.questionId);
    });
  }

  function validateEditorialCurrentScreen() {
    if (state.galleryScreen === "ending") {
      const verifyMasterButton = document.getElementById("btnVerifyMasterPasscode");
      if (!verifyMasterButton) {
        setRoomStatus(t("finalCodeMissing"), "bad");
        return;
      }
      verifyMasterButton.click();
      setEditorialReviewAction("autofill");
      setRoomStatus(t("finalCodeEditorialVerified"), "good");
      return;
    }

    const mission = missionById(state.currentMissionId);
    if (state.galleryScreen !== "mission" || !mission) {
      setRoomStatus(t("noAnswersToVerify"), "info");
      setEditorialReviewAction("autofill");
      return;
    }

    const pendingQuestions = getRoomQuestions(mission).filter((question) => (
      !state.completedQuestions.has(getQuestionKey(mission, question))
    ));
    let validated = 0;
    pendingQuestions.forEach((question) => {
      const key = getQuestionKey(mission, question);
      const verifyButton = els.missionStage?.querySelector('[data-question-verify="' + CSS.escape(key) + '"]');
      if (!verifyButton) return;
      verifyButton.click();
      if (state.completedQuestions.has(key)) validated += 1;
    });

    const allValidated = pendingQuestions.length > 0 && validated === pendingQuestions.length;
    if (allValidated && state.completed.has(mission.id)) {
      if (IS_MENU_MODE) goToNextMenuActivity();
      else if (state.galleryScreen === "ending") setEditorialReviewAction("autofill");
      return;
    }
    setEditorialReviewAction(allValidated ? "autofill" : "verify");
    setRoomStatus(
      allValidated
        ? t("verifiedCount", { count: validated })
        : t("validatedCount", { count: validated, total: pendingQuestions.length }),
      allValidated ? 'good' : 'bad'
    );
  }

  function autocompleteCurrentScreen() {
    if (window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ !== true) return;
    if (state.isStarted && !state.isMasterSolved && (state.timeoutResults || getRemainingSeconds() <= 0)) { handleTimeExpired(); return; }
    const editorialButton = document.querySelector("[data-editorial-autofill]");
    if (editorialButton?.dataset.editorialAction === "skip") {
      continueFromRoomUnlockTransition();
      return;
    }
    if (editorialButton?.dataset.editorialAction === "verify") {
      validateEditorialCurrentScreen();
      return;
    }

    if (editorialButton?.dataset.editorialAction === "start") {
      if (!state.isStarted && !state.isFinished) {
        // Starting the review must only enter the first room. The briefing is
        // acknowledged by its own control (or by a later editorial action),
        // otherwise the first room appears already read and collapsed.
        startEscapeRoom();
        return;
      }
      if (state.isFinished) return;

      const mission = missionById(state.currentMissionId) || ESCAPE_ROOM_DATA.misiones.find((item) => (
        state.unlocked.has(item.id) && !state.completed.has(item.id)
      ));
      if (mission) {
        state.currentMissionId = mission.id;
        state.galleryScreen = "mission";
        state.readBriefings.add(mission.id);
        persistProgressState();
        render();
        setEditorialReviewAction("autofill");
        scrollMissionStageToTop();
      }
      return;
    }

    if (!state.isStarted && !state.isFinished) {
      startEscapeRoom();
    }

    if (!state.isFinished && state.galleryScreen !== "mission") {
      const nextMission = ESCAPE_ROOM_DATA.misiones.find((mission) => (
        state.unlocked.has(mission.id) && !state.completed.has(mission.id)
      )) || (!IS_MENU_MODE && !state.completed.has(state.currentMissionId) ? missionById(state.currentMissionId) : null);

      if (nextMission) {
        state.currentMissionId = nextMission.id;
        state.galleryScreen = "mission";
        persistProgressState();
        render();
      } else if (areAllMissionsCompleted()) {
        state.galleryScreen = "ending";
        persistProgressState();
        render();
      }
    }

    if (state.galleryScreen === "ending") {
      const finalCode = extractFinalPasscode(ESCAPE_ROOM_DATA.conclusion);
      if (finalCode) {
        state.finalPasscodeOrder = FINAL_PASSCODE_TOKENS.map((token) => token.id);
        if (ESCAPE_ROOM_DATA.reward_plan) {
          const plan = ESCAPE_ROOM_DATA.reward_plan;
          state.experience.final = plan.type==='imagen'?{puzzle_version:1,placements:plan.rooms.map((_,i)=>i),selected:null,solved:false}:{order:plan.rooms.map((_,i)=>i),choice:plan.code,sequence:plan.rooms.flatMap(r=>r.pattern),positions:Object.fromEntries([...plan.code].map((l,i)=>[i,l]))};
        }
        state.selectedFinalPasscodeToken = null;
        renderFinalPasscodePuzzle();
        persistProgressState();
        setEditorialReviewAction("verify");
        setRoomStatus(t("finalCodeAutofilled"), "good");
        return;
      }
    }

    if (state.galleryScreen !== "mission") {
      setRoomStatus(t("noEditableAnswers"), "info");
      return;
    }

    const mission = missionById(state.currentMissionId);
    if (!mission) {
      setRoomStatus(IS_MENU_MODE ? t("activeActivityMissing") : t("activeRoomMissing"), "bad");
      return;
    }

    const questions = getRoomQuestions(mission);
    let filled = 0;

    questions.forEach((question) => {
      const key = getQuestionKey(mission, question);
      // Editorial Autofill simulates a clean first-attempt run, including rewards.
      state.experience.attempts[key] = state.completedQuestions.has(key) ? 1 : 0;
      delete state.experience.assisted[key];
      delete state.experience.discarded[key];
      if (state.completedQuestions.has(key)) return;
      if (EXP.get(question.tipo_interaccion)) {
        state.experience.answers[key] = EXP.solutionState(question.interaction_data.solutions[0]); filled += 1; return;
      }

      if ((question.tipo_interaccion === "opcion_multiple" || (question.tipo_interaccion === "multimedia" && question.interaction_contract_version === 1))) {
        const choiceIndex = getQuestionCorrectChoiceIndex(question);
        if (choiceIndex >= 0) {
          state.questionChoices[key] = choiceIndex;
          els.missionStage?.querySelectorAll('[data-question-choice="' + CSS.escape(key) + '"]').forEach((node) => {
            const isSelected = Number(node.getAttribute("data-choice-index")) === choiceIndex;
            node.classList.toggle("is-selected", isSelected);
          });
          filled += 1;
        }
        return;
      }

      if (question.tipo_interaccion === "relacion_columnas") {
        state.questionMatches[key] = {};
        question.parejas.forEach((pair, index) => {
          state.questionMatches[key][String(index)] = pair.derecha;
          const select = els.missionStage?.querySelector('[data-question-match-select="' + CSS.escape(key) + '"][data-match-index="' + index + '"]');
          if (select) select.value = pair.derecha;
        });
        filled += 1;
        return;
      }

      if (usesDragAnswers(question)) {
        state.questionDragMatches[key] = {};
        state.questionDragLocked[key] = {};
        question.parejas.forEach((_, index) => {
          state.questionDragMatches[key][String(index)] = index;
        });
        delete state.selectedDragTiles[key];
        filled += 1;
        return;
      }

      if (question.tipo_interaccion === "verdadero_falso") {
        state.questionChoices[key] = question.respuesta_correcta === true;
        filled += 1;
        return;
      }

      if (question.tipo_interaccion === "ordenar_secuencia") {
        state.questionSequenceOrders[key] = question.elementos.map((_, index) => index);
        state.questionSequenceTouched[key] = true;
        delete state.selectedSequenceItems[key];
        filled += 1;
        return;
      }

      const autofillText = getQuestionAutofillText(question);
      state.questionAnswers[key] = autofillText;
      const input = els.missionStage?.querySelector('[data-question-answer="' + CSS.escape(key) + '"]');
      if (input) input.value = autofillText;
      if (autofillText) filled += 1;
    });

    persistProgressState();
    if (filled > 0) {
      renderMission();
      setEditorialReviewAction("verify");
      setRoomStatus(t("autofilledCount", { count: filled }), 'good');
    } else {
      setRoomStatus(t("noPendingAutofill"), "info");
    }
  }

  function wireMissionEvents() {
    if (!els.missionStage || state.missionEventsBound) return;
    state.missionEventsBound = true;

    els.missionStage.addEventListener('click', (event) => {
      const unlockContinueButton = event.target.closest('[data-room-unlock-continue]');
      if (unlockContinueButton) {
        continueFromRoomUnlockTransition();
        return;
      }
      const briefingButton = event.target.closest('[data-briefing-ack]');
      if (briefingButton) {
        const missionId = briefingButton.getAttribute('data-briefing-ack') || '';
        const mission = ESCAPE_ROOM_DATA.misiones.find((item) => item.id === missionId) || null;
        if (!missionId || state.isFinished) return;
        // En modo Salas se puede consultar el expediente desde "Siguiente"
        // antes de pulsar el botón global de inicio. La propia etiqueta de este
        // control promete iniciar la experiencia, así que debe activar también
        // el reloj en lugar de ignorar silenciosamente el clic.
        if (!state.isStarted) startEscapeRoom();
        if (!state.isStarted || state.isFinished) return;
        state.currentMissionId = missionId;
        state.galleryScreen = 'mission';
        state.readBriefings.add(missionId);
        persistProgressState();
        render();
        if (els.liveStatus) els.liveStatus.textContent = String(mission?.briefing_mensaje_listo || '').trim() || t("briefingReady");
        scrollMissionStageToTop();
        return;
      }
      const hintButton = event.target.closest('[data-question-hint]');
      if (hintButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? t("restartToPlay") : t("interactStart"), state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = hintButton.getAttribute('data-question-hint');
        state.experience.assisted[key] = true; persistProgressState();
        showQuestionHint(key, hintButton);
        setQuestionStatus(key || '', t("hintRevealed"), '');
        return;
      }

      const choiceButton = event.target.closest('[data-question-choice]');
      if (choiceButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? t("restartToPlay") : t("interactStart"), state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = choiceButton.getAttribute('data-question-choice') || '';
        const card = choiceButton.closest('[data-question-card]');
        if (!card) return;
        state.questionChoices[key] = Number(choiceButton.getAttribute('data-choice-index'));
        card.querySelectorAll('[data-question-choice="' + CSS.escape(key) + '"]').forEach((node) => node.classList.remove('is-selected'));
        choiceButton.classList.add('is-selected');
        persistProgressState();
        return;
      }

      const booleanButton = event.target.closest('[data-question-boolean]');
      if (booleanButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? t("restartToPlay") : t("interactStart"), state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = booleanButton.getAttribute('data-question-boolean') || '';
        state.questionChoices[key] = booleanButton.getAttribute('data-boolean-value') === 'true';
        persistProgressState();
        renderMission();
        return;
      }

      const sequenceMove = event.target.closest('[data-sequence-move]');
      if (sequenceMove) {
        if (!state.isStarted || state.isFinished) return;
        const key = sequenceMove.getAttribute('data-sequence-move') || '';
        const position = Number(sequenceMove.getAttribute('data-sequence-position'));
        const delta = Number(sequenceMove.getAttribute('data-sequence-delta'));
        moveSequenceItem(key, position, position + delta);
        return;
      }

      const sequenceItem = event.target.closest('[data-sequence-item]');
      if (sequenceItem) {
        if (Date.now() < state.suppressDragClickUntil || !state.isStarted || state.isFinished) return;
        const key = sequenceItem.getAttribute('data-sequence-item') || '';
        const position = Number(sequenceItem.getAttribute('data-sequence-position'));
        const selected = Number(state.selectedSequenceItems[key]);
        if (Number.isInteger(selected)) {
          if (selected === position) {
            delete state.selectedSequenceItems[key];
            renderMission();
          } else {
            moveSequenceItem(key, selected, position);
          }
        } else {
          state.selectedSequenceItems[key] = position;
          persistProgressState();
          const found = findDragQuestion(key);
          const sourceIndex = getSequenceOrder(found?.question || {}, key)[position];
          const label = found?.question?.elementos?.[sourceIndex] || '';
          renderMission();
          window.requestAnimationFrame(() => announceSequence(key, t("sequenceSelected", { item: label })));
        }
        return;
      }

      const dragTileButton = event.target.closest('[data-drag-tile]');
      if (dragTileButton) {
        if (event.detail !== 0 && Date.now() < state.suppressDragClickUntil) return;
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? t("restartToPlay") : t("interactStart"), state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = dragTileButton.getAttribute('data-drag-tile') || '';
        const tileIndex = Number(dragTileButton.getAttribute('data-drag-tile-index'));
        selectDragTile(key, tileIndex);
        return;
      }

      const dragTargetButton = event.target.closest('[data-drag-target]');
      if (dragTargetButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? t("restartToPlay") : t("interactStart"), state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = dragTargetButton.getAttribute('data-drag-target') || '';
        const targetIndex = Number(dragTargetButton.getAttribute('data-drag-target-index'));
        const selectedTile = Number(state.selectedDragTiles[key]);
        if (Number.isInteger(selectedTile)) {
          placeDragTile(key, targetIndex, selectedTile);
          return;
        }
        const assignedTile = Number(dragTargetButton.getAttribute('data-assigned-tile-index'));
        if (Number.isInteger(assignedTile)) {
          selectDragTile(key, assignedTile);
        } else {
          announceDrag(key, t("dragSelectFirst"));
        }
        return;
      }

      const verifyButton = event.target.closest('[data-question-verify]');
      if (verifyButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? t("restartToPlay") : t("solveStart"), state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = verifyButton.getAttribute('data-question-verify') || '';
        const mission = missionById(state.currentMissionId);
        if (!mission) return;
        const question = getRoomQuestions(mission).find((item) => getQuestionKey(mission, item) === key);
        if (!question) return;
        if (state.completedQuestions.has(key)) {
          setQuestionStatus(key, t("alreadyCompleted"), 'good');
          return;
        }

        if (question.tipo_interaccion === 'multimedia' && question.interaction_contract_version === 1 && !question.media?.url && !question.imagen) {
          setQuestionStatus(key, question.media?.alt || t('defaultChallenge'), 'bad');
          return;
        }
        const answerInput = els.missionStage.querySelector('[data-question-answer="' + CSS.escape(key) + '"]');
        if (answerInput) state.questionAnswers[key] = answerInput.value || '';
        const result = evaluateQuestionResult(question, key);
        if (result === 'unanswered' || result === 'invalid') { setQuestionStatus(key, EXP.ui(ESCAPE_ROOM_DATA.idioma, result === 'invalid' ? 'invalid' : 'empty'), 'info'); return; }
        EXP.recordAttempt(state.experience, key, result); persistProgressState();
        const isCorrect = result === 'correct';
        if (usesDragAnswers(question) && !isCorrect) {
          rejectIncorrectDragMatches(question, key);
          return;
        }

        const writtenInput = els.missionStage.querySelector('[data-question-answer="' + CSS.escape(key) + '"]');
        if (writtenInput) writtenInput.setAttribute('aria-invalid', String(!isCorrect));
        if (isCorrect) {
          markQuestionComplete(mission, question);
          return;
        }

        setQuestionStatus(
          key,
          question.subtipo_respuesta === 'frase_libre'
            ? t("answerRequired")
            : (question.retroalimentacion_incorrecta || t("incorrect")),
          'bad'
        );
      }
    });

    els.missionStage.addEventListener('pointerdown', (event) => {
      const sequenceItem = event.target.closest('[data-sequence-item]');
      if (sequenceItem && state.isStarted && !state.isFinished && event.button <= 0) {
        state.activeSequencePointer = {
          pointerId: event.pointerId,
          key: sequenceItem.getAttribute('data-sequence-item') || '',
          position: Number(sequenceItem.getAttribute('data-sequence-position')),
          startX: event.clientX,
          startY: event.clientY,
          node: sequenceItem,
          moved: false
        };
        sequenceItem.setPointerCapture?.(event.pointerId);
        return;
      }
      const tile = event.target.closest('[data-drag-tile]');
      if (!tile || !state.isStarted || state.isFinished || event.button > 0) return;
      const key = tile.getAttribute('data-drag-tile') || '';
      const tileIndex = Number(tile.getAttribute('data-drag-tile-index'));
      if (!key || !Number.isInteger(tileIndex)) return;
      state.activeDragPointer = {
        pointerId: event.pointerId,
        key,
        tileIndex,
        startX: event.clientX,
        startY: event.clientY,
        node: tile,
        moved: false
      };
      if (typeof tile.setPointerCapture === 'function') tile.setPointerCapture(event.pointerId);
    });

    els.missionStage.addEventListener('pointermove', (event) => {
      const sequence = state.activeSequencePointer;
      if (sequence && sequence.pointerId === event.pointerId && sequence.node?.isConnected) {
        const deltaX = event.clientX - sequence.startX;
        const deltaY = event.clientY - sequence.startY;
        if (!sequence.moved && Math.hypot(deltaX, deltaY) < 6) return;
        sequence.moved = true;
        sequence.node.classList.add('is-dragging');
        sequence.node.style.transform = 'translate3d(0,' + deltaY + 'px,0)';
        event.preventDefault();
        return;
      }
      const active = state.activeDragPointer;
      if (!active || active.pointerId !== event.pointerId || !active.node?.isConnected) return;
      const deltaX = event.clientX - active.startX;
      const deltaY = event.clientY - active.startY;
      if (!active.moved && Math.hypot(deltaX, deltaY) < 6) return;
      active.moved = true;
      active.node.classList.add('is-dragging');
      active.node.style.transform = 'translate3d(' + deltaX + 'px,' + deltaY + 'px,0) scale(1.03)';
      active.node.style.zIndex = '20';
      els.missionStage.querySelectorAll('[data-drag-target="' + CSS.escape(active.key) + '"]:not(:disabled)').forEach((target) => {
        const rect = target.getBoundingClientRect();
        const over = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        target.classList.toggle('is-drop-ready', over);
      });
      event.preventDefault();
    });

    const finishPointerDrag = (event, cancelled = false) => {
      const sequence = state.activeSequencePointer;
      if (sequence && sequence.pointerId === event.pointerId) {
        state.activeSequencePointer = null;
        sequence.node?.classList.remove('is-dragging');
        if (sequence.node) sequence.node.style.transform = '';
        if (sequence.moved && !cancelled) {
          state.suppressDragClickUntil = Date.now() + 300;
          const targets = Array.from(els.missionStage.querySelectorAll('[data-sequence-drop="' + CSS.escape(sequence.key) + '"]'));
          const target = targets.find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return event.clientY >= rect.top && event.clientY <= rect.bottom;
          });
          if (target) moveSequenceItem(sequence.key, sequence.position, Number(target.getAttribute('data-sequence-position')));
        }
        return;
      }
      const active = state.activeDragPointer;
      if (!active || active.pointerId !== event.pointerId) return;
      state.activeDragPointer = null;
      const node = active.node;
      if (node?.isConnected) {
        node.classList.remove('is-dragging');
        node.style.transform = '';
        node.style.zIndex = '';
        if (typeof node.releasePointerCapture === 'function' && node.hasPointerCapture?.(event.pointerId)) {
          node.releasePointerCapture(event.pointerId);
        }
      }
      els.missionStage.querySelectorAll('.is-drop-ready').forEach((target) => target.classList.remove('is-drop-ready'));
      if (!active.moved || cancelled) return;
      state.suppressDragClickUntil = Date.now() + 300;
      const candidates = Array.from(els.missionStage.querySelectorAll('[data-drag-target="' + CSS.escape(active.key) + '"]:not(:disabled)'));
      const target = candidates.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      });
      if (target) {
        placeDragTile(active.key, Number(target.getAttribute('data-drag-target-index')), active.tileIndex);
      } else {
        announceDrag(active.key, t("dragCancelled"));
      }
    };

    els.missionStage.addEventListener('pointerup', (event) => finishPointerDrag(event, false));
    els.missionStage.addEventListener('pointercancel', (event) => finishPointerDrag(event, true));

    els.missionStage.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const sequenceBoard = event.target.closest('[data-sequence-board]');
      if (sequenceBoard) {
        const sequenceKey = sequenceBoard.getAttribute('data-sequence-board') || '';
        delete state.selectedSequenceItems[sequenceKey];
        state.activeSequencePointer = null;
        persistProgressState();
        renderMission();
        event.preventDefault();
        return;
      }
      const board = event.target.closest('[data-drag-board]');
      if (!board) return;
      const key = board.getAttribute('data-drag-board') || '';
      delete state.selectedDragTiles[key];
      state.activeDragPointer = null;
      persistProgressState();
      refreshDragBoard(key, '[data-drag-tile="' + CSS.escape(key) + '"]', t("dragCancelled"));
      event.preventDefault();
    });

    els.missionStage.addEventListener('change', (event) => {
      const select = event.target.closest('[data-question-match-select]');
      if (!select) return;
      if (!state.isStarted || state.isFinished) {
        event.preventDefault();
        setRoomStatus(state.isFinished ? t("restartToPlay") : t("interactStart"), state.isFinished ? 'bad' : 'info');
        return;
      }
      const key = select.getAttribute('data-question-match-select') || '';
      const index = select.getAttribute('data-match-index') || '0';
      if (!state.questionMatches[key]) state.questionMatches[key] = {};
      state.questionMatches[key][String(index)] = select.value || '';
      persistProgressState();
    });

    els.missionStage.addEventListener('input', (event) => {
      const input = event.target.closest('[data-question-answer]');
      if (!input) return;
      if (!state.isStarted || state.isFinished) return;
      const key = input.getAttribute('data-question-answer') || '';
      state.questionAnswers[key] = input.value || '';
      persistProgressState();
    });
  }

  function startEscapeRoom() {
    if (state.timeoutResults) { showTimeoutResults(); return; }
    if (state.isStarted && !state.isFinished) return;
    const now = nowMs();
    state.durationSeconds = normalizeDurationSeconds(state.durationSeconds);
    state.isStarted = true;
    state.isFinished = false;
    state.startedAtMs = now;
    state.endAtMs = now + (state.durationSeconds * 1000);
    state.briefingTimerPausedAtMs = null;
    state.remainingSecondsAtFinish = null;
    if (IS_MENU_MODE) {
      state.galleryScreen = "menu";
      syncMenuUnlocksFromProgress();
    } else {
      state.galleryScreen = "mission";
    }
    ensureTimerInterval();
    persistProgressState();
    render();
    if (!IS_MENU_MODE) scrollMissionStageToTop();
  }

  function resetEscapeRoom() {
    document.getElementById("questionHintDialog")?.close();
    if (!window.confirm(resultLabels()[9])) return;
    document.getElementById('timeoutResultsDialog')?.remove();
    document.getElementById('timeoutResultsButton')?.remove();
    state.timeoutResults = null;
    state.questionSequenceTouched = {};
    stopTimerInterval();
    stopAlertSound();
    clearRoomUnlockTimer();
    state.unlocked = new Set(IS_MENU_MODE ? [] : ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id));
    state.completed = new Set();
    state.completedQuestions = new Set();
    state.readBriefings = new Set(ESCAPE_ROOM_DATA.misiones.filter((mission) => mission.contexto_requerido === false).map((mission) => mission.id));
    state.experience = EXP.metrics();
    state.questionAnswers = {};
    state.questionChoices = {};
    state.questionMatches = {};
    state.questionDragMatches = {};
    state.questionDragLocked = {};
    state.selectedDragTiles = {};
    state.questionSequenceOrders = {};
    state.selectedSequenceItems = {};
    state.activeSequencePointer = null;
    state.activeDragPointer = null;
    state.currentMissionId = IS_MENU_MODE
      ? (ESCAPE_ROOM_DATA.misiones[0]?.id || null)
      : (ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null);
    state.galleryScreen = IS_MENU_MODE ? "menu" : "intro";
    state.durationSeconds = normalizeDurationSeconds(DEFAULT_DURATION_MINUTES * 60);
    state.isStarted = false;
    state.isFinished = false;
    state.isMasterSolved = false;
    state.finalPasscodeOrder = buildInitialFinalPasscodeOrder();
    state.selectedFinalPasscodeToken = null;
    state.finalPasscodePointer = null;
    state.suppressFinalPasscodeClickUntil = 0;
    state.startedAtMs = null;
    state.endAtMs = null;
    state.briefingTimerPausedAtMs = null;
    state.remainingSecondsAtFinish = null;
    state.nowOverrideMs = null;
    state.roomUnlockTransition = null;
    setEditorialReviewAction("autofill");
    const statusBox = document.getElementById("masterStatusBox");
    if (statusBox) {
      statusBox.classList.add("hidden");
      statusBox.textContent = "";
    }
      if (els.endingPanel) {
        els.endingPanel.classList.remove("is-success-flash");
        els.endingPanel.classList.remove("is-alert");
      }
    if (isStorageAvailable()) {
      try {
        window.localStorage.removeItem(getProgressStorageKey());
      } catch (error) {
        console.warn("No se pudo limpiar el estado del escape room:", error);
      }
    }
    updateTimerUi();
    if (REVIEW_PROGRESS_ID) saveProgressState();
    render();
  }

  function getGameTextState() {
    const currentMission = missionById(state.currentMissionId);
    const activities = ESCAPE_ROOM_DATA.misiones.map((mission, index) => ({
      index: index + 1,
      id: mission.id,
      title: mission.titulo,
      status: state.completed.has(mission.id)
        ? "completed"
        : state.unlocked.has(mission.id) && !state.isFinished
          ? "available"
          : "locked"
    }));
    return {
      mode: ESCAPE_ROOM_PRESENTATION_MODE,
      screen: state.galleryScreen,
      started: state.isStarted,
      finished: state.isFinished,
      timeoutResults: state.timeoutResults,
      timerPaused: Number.isFinite(state.briefingTimerPausedAtMs),
      masterSolved: state.isMasterSolved,
      remainingSeconds: getRemainingSeconds(),
      progress: {
        completed: state.completed.size,
        total: ESCAPE_ROOM_DATA.misiones.length
      },
      finalChallenge: areAllMissionsCompleted() && !state.isMasterSolved ? {
        available: true,
        characterCount: state.finalPasscodeOrder.length,
        currentOrder: getAssembledFinalPasscode()
      } : undefined,
      roomUnlock: state.roomUnlockTransition ? {
        active: true,
        phase: state.roomUnlockTransition.phase || "reward",
        completedMissionId: state.roomUnlockTransition.completedMissionId,
        nextMissionId: state.roomUnlockTransition.nextMissionId,
        fragment: getMissionCodeFragment(missionById(state.roomUnlockTransition.completedMissionId)),
        autoAdvanceMilliseconds: Math.max(0, 5000 - (Date.now() - Number(state.roomUnlockTransition.startedAtMs || Date.now())))
      } : undefined,
      currentActivity: currentMission ? {
        id: currentMission.id,
        title: currentMission.titulo,
        briefingRead: state.readBriefings.has(currentMission.id),
        briefing: currentMission.contexto,
        keyEvidence: Array.isArray(currentMission.datos_clave) ? [...currentMission.datos_clave] : [],
        questions: getRoomQuestions(currentMission).map((question) => {
          const key = getQuestionKey(currentMission, question);
          return {
            id: question.id,
            title: question.titulo,
            type: question.tipo_interaccion,
            completed: state.completedQuestions.has(key),
            dragAssignments: usesDragAnswers(question) ? { ...(state.questionDragMatches[key] || {}) } : undefined,
            dragLocked: usesDragAnswers(question) ? { ...(state.questionDragLocked[key] || {}) } : undefined,
            sequenceOrder: question.tipo_interaccion === "ordenar_secuencia" ? [...getSequenceOrder(question, key)] : undefined
          };
        })
      } : null,
      activities,
      sections: IS_MENU_MODE
        ? [
            { id: "intro", status: "available" },
            { id: "instructions", status: "available" },
            ...activities,
            { id: "ending", status: areAllMissionsCompleted() ? (state.isMasterSolved ? "completed" : "available") : "locked" }
          ]
        : undefined
    };
  }

  function renderGameToText() {
    return JSON.stringify(getGameTextState(), null, 2);
  }

  function updateAccessibleState() {
    if (!els.liveStatus) return;
    const current = getGameTextState();
    const screenLabel = current.screen === "menu"
      ? t("menu")
      : current.screen === "mission"
        ? (IS_MENU_MODE ? t("activity") : t("room"))
        : current.screen === "instructions"
          ? t("instructions")
          : current.screen === "ending"
            ? t("finalMessage")
            : t("introduction");
    const status = current.started
      ? (current.finished ? t("statusFinished") : t("statusInProgress"))
      : t("statusNotStarted");
    els.liveStatus.textContent = t("currentScreen", { screen: screenLabel }) + " "
      + t("currentProgress", { done: current.progress.completed, total: current.progress.total }) + " "
      + t("gameStatus", { status })
      + (current.masterSolved ? " " + t("gameCompleted") + "." : "");
  }

  function advanceTime(milliseconds = 0) {
    const delta = Number(milliseconds);
    if (!Number.isFinite(delta) || delta < 0) return renderGameToText();
    state.nowOverrideMs = (Number.isFinite(state.nowOverrideMs) ? state.nowOverrideMs : Date.now()) + delta;
    if (state.isStarted && !state.isFinished) tickTimer();
    render();
    return renderGameToText();
  }

  function render() {
    syncBriefingTimerPause();
    syncEditorialReviewActionForCurrentScreen();
    renderGallery();
    renderMap();
    renderMission();
    updateProgress();
    updateTimerUi();
    updateAccessibleState();
    renderExperienceInventory();
  }

  els.galleryPrevButtons.forEach((button) => {
    button.addEventListener("click", goToPreviousGalleryScreen);
  });

  els.galleryNextButtons.forEach((button) => {
    button.addEventListener("click", goToNextGalleryScreen);
  });

  els.startButtons.forEach((button) => {
    button.addEventListener("click", startEscapeRoom);
  });

  els.resetButtons.forEach((button) => {
    button.addEventListener("click", resetEscapeRoom);
  });

  els.fullscreenButtons.forEach((button) => {
    button.addEventListener("click", toggleFullscreen);
  });
  document.addEventListener("fullscreenchange", syncFullscreenControls);
  document.addEventListener("webkitfullscreenchange", syncFullscreenControls);
  document.addEventListener("fullscreenerror", () => announceFullscreen(t("fullscreen")));

  els.menuCards.forEach((button) => {
    button.addEventListener("click", () => openMenuCard(button));
  });

  if (IS_MENU_MODE) {
    document.addEventListener("click", (event) => {
      const backButton = event.target.closest("[data-menu-back]");
      if (backButton) returnToMenu();
      const nextButton = event.target.closest("[data-menu-next]");
      if (nextButton) goToNextMenuActivity();
    });
  }

  // Reserve the actual toolbar height, including wrapped labels and mobile rows.
  const gameToolbar = document.querySelector(".game-header");
  if (gameToolbar) {
    const syncToolbarHeight = () => document.documentElement.style.setProperty("--game-toolbar-height", gameToolbar.getBoundingClientRect().height + "px");
    syncToolbarHeight();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(syncToolbarHeight).observe(gameToolbar);
    window.addEventListener("resize", syncToolbarHeight);
  }

  const editorialAutofillButton = document.querySelector("[data-editorial-autofill]");
  if (editorialAutofillButton && window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ === true) {
    editorialAutofillButton.hidden = false;
    setEditorialReviewAction(editorialAutofillButton.dataset.editorialAction || "start");
    let drag = null;
    let suppressClick = false;
    let movedPosition = null;
    const placeButton = (left, top) => {
      const rect = editorialAutofillButton.getBoundingClientRect();
      const x = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
      const y = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));
      Object.assign(editorialAutofillButton.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" });
      movedPosition = { x, y };
    };
    editorialAutofillButton.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      const rect = editorialAutofillButton.getBoundingClientRect();
      suppressClick = false;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
      editorialAutofillButton.setPointerCapture(event.pointerId);
    });
    editorialAutofillButton.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      suppressClick = true;
      editorialAutofillButton.classList.add("is-dragging");
      placeButton(drag.left + dx, drag.top + dy);
    });
    const endDrag = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      suppressClick = drag.moved || event.type === "pointercancel";
      drag = null;
      editorialAutofillButton.classList.remove("is-dragging");
      if (editorialAutofillButton.hasPointerCapture(event.pointerId)) editorialAutofillButton.releasePointerCapture(event.pointerId);
    };
    editorialAutofillButton.addEventListener("pointerup", endDrag);
    editorialAutofillButton.addEventListener("pointercancel", endDrag);
    editorialAutofillButton.addEventListener("lostpointercapture", endDrag);
    editorialAutofillButton.addEventListener("click", (event) => {
      if (suppressClick && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
        return;
      }
      suppressClick = false;
      autocompleteCurrentScreen();
    });
    editorialAutofillButton.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const rect = editorialAutofillButton.getBoundingClientRect();
      placeButton(rect.left + (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0), rect.top + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0));
    });
    window.addEventListener("resize", () => { if (movedPosition) placeButton(movedPosition.x, movedPosition.y); });
  }

  function extractFinalPasscode() {
    return ESCAPE_ROOM_FINAL_PASSCODE || null;
  }

  function getFinalPasscodeToken(tokenId) {
    return FINAL_PASSCODE_TOKENS.find((token) => token.id === tokenId) || null;
  }

  function getAssembledFinalPasscode() {
    return state.finalPasscodeOrder.map((tokenId) => getFinalPasscodeToken(tokenId)?.character || "").join("");
  }

  function announceFinalPasscode(message) {
    if (els.liveStatus) els.liveStatus.textContent = message;
  }

  function renderFinalPasscodePuzzle(focusTokenId = "") {
    const container = document.getElementById("finalPasscodeTiles");
    if (!container) return;
    if (ESCAPE_ROOM_DATA.reward_plan && ESCAPE_ROOM_DATA.reward_plan.type !== 'letras') {
      container.innerHTML = REWARDS.finalHTML(ESCAPE_ROOM_DATA.reward_plan, state.experience.final, ESCAPE_ROOM_DATA.idioma);
      const instructions = document.getElementById('finalPasscodeInstructions');
      if (instructions) instructions.textContent = EXP.ui(ESCAPE_ROOM_DATA.idioma, 'final');
      if(ESCAPE_ROOM_DATA.reward_plan.type==='imagen'){
        const label=REWARDS.puzzleText(ESCAPE_ROOM_DATA.idioma,'title');
        if(instructions)instructions.textContent=label;
        container.setAttribute('aria-label',label);
        const button=document.getElementById('btnVerifyMasterPasscode');if(button)button.textContent=REWARDS.puzzleText(ESCAPE_ROOM_DATA.idioma,'verify');
        const title=document.querySelector('#masterPanelContainer h2');if(title)title.textContent=label;
      }
      renderExperienceInventory(); return;
    }
    const total = state.finalPasscodeOrder.length;
    container.innerHTML = state.finalPasscodeOrder.map((tokenId, index) => {
      const token = getFinalPasscodeToken(tokenId);
      if (!token) return "";
      const selected = tokenId === state.selectedFinalPasscodeToken;
      const label = t("finalCodeTileLabel", { character: token.character, position: index + 1, total });
      return '<button type="button" class="final-passcode-tile' + (selected ? ' is-selected' : '') + '"'
        + ' data-final-passcode-token="' + escapeHtmlAttr(tokenId) + '"'
        + ' aria-label="' + escapeHtmlAttr(label) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">'
        + escapeHtml(token.character) + '</button>';
    }).join("");
    if (focusTokenId) {
      window.requestAnimationFrame(() => safeFocus(container.querySelector('[data-final-passcode-token="' + CSS.escape(focusTokenId) + '"]')));
    }
  }

  function moveFinalPasscodeToken(tokenId, targetIndex, { announce = true } = {}) {
    if (state.isFinished || (state.isStarted && getRemainingSeconds() <= 0)) return false;
    const fromIndex = state.finalPasscodeOrder.indexOf(tokenId);
    const safeTarget = Math.max(0, Math.min(state.finalPasscodeOrder.length - 1, Number(targetIndex)));
    if (fromIndex < 0 || !Number.isFinite(safeTarget) || fromIndex === safeTarget) return;
    const [moved] = state.finalPasscodeOrder.splice(fromIndex, 1);
    state.finalPasscodeOrder.splice(safeTarget, 0, moved);
    persistProgressState();
    renderFinalPasscodePuzzle(tokenId);
    if (announce) {
      const token = getFinalPasscodeToken(tokenId);
      announceFinalPasscode(t("finalCodeTileMoved", { character: token?.character || "", position: safeTarget + 1 }));
    }
  }

  function selectOrSwapFinalPasscodeToken(tokenId) {
    if (!state.selectedFinalPasscodeToken) {
      state.selectedFinalPasscodeToken = tokenId;
      const token = getFinalPasscodeToken(tokenId);
      renderFinalPasscodePuzzle(tokenId);
      announceFinalPasscode(t("finalCodeTileSelected", { character: token?.character || "" }));
      return;
    }
    if (state.selectedFinalPasscodeToken === tokenId) {
      state.selectedFinalPasscodeToken = null;
      renderFinalPasscodePuzzle(tokenId);
      return;
    }
    const firstIndex = state.finalPasscodeOrder.indexOf(state.selectedFinalPasscodeToken);
    const secondIndex = state.finalPasscodeOrder.indexOf(tokenId);
    if (firstIndex >= 0 && secondIndex >= 0) {
      [state.finalPasscodeOrder[firstIndex], state.finalPasscodeOrder[secondIndex]] = [state.finalPasscodeOrder[secondIndex], state.finalPasscodeOrder[firstIndex]];
    }
    state.selectedFinalPasscodeToken = null;
    persistProgressState();
    renderFinalPasscodePuzzle(tokenId);
  }

  function wireFinalPasscodePuzzle() {
    const container = document.getElementById("finalPasscodeTiles");
    if (!container || container.dataset.wired === "true") return;
    container.dataset.wired = "true";
    container.addEventListener("click", (event) => {
      if (Date.now() < state.suppressFinalPasscodeClickUntil) return;
      const tile = event.target.closest("[data-final-passcode-token]");
      if (tile) selectOrSwapFinalPasscodeToken(tile.dataset.finalPasscodeToken);
    });
    container.addEventListener("keydown", (event) => {
      const tile = event.target.closest("[data-final-passcode-token]");
      if (!tile || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const index = state.finalPasscodeOrder.indexOf(tile.dataset.finalPasscodeToken);
      moveFinalPasscodeToken(tile.dataset.finalPasscodeToken, index + (event.key === "ArrowLeft" ? -1 : 1));
    });
    container.addEventListener("pointerdown", (event) => {
      const tile = event.target.closest("[data-final-passcode-token]");
      if (!tile || event.button > 0) return;
      event.preventDefault();
      state.finalPasscodePointer = { tokenId: tile.dataset.finalPasscodeToken, pointerId: event.pointerId, node: tile, startX: event.clientX, startY: event.clientY, moved: false, targetIndex: -1 };
      tile.setPointerCapture?.(event.pointerId);
      tile.classList.add("is-dragging");
    });
    container.addEventListener("pointermove", (event) => {
      const pointer = state.finalPasscodePointer;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - pointer.startX;
      const deltaY = event.clientY - pointer.startY;
      if (Math.hypot(deltaX, deltaY) <= 8 && !pointer.moved) return;
      event.preventDefault();
      pointer.moved = true;
      pointer.node.style.transform = 'translate3d(' + deltaX + 'px,' + deltaY + 'px,0) scale(1.05)';
      const candidates = Array.from(container.querySelectorAll("[data-final-passcode-token]"))
        .filter((candidate) => candidate.dataset.finalPasscodeToken !== pointer.tokenId);
      const nearest = candidates.map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return { candidate, centerX, centerY, distance: Math.hypot(event.clientX - centerX, event.clientY - centerY) };
      }).sort((a, b) => a.distance - b.distance)[0] || null;
      container.querySelectorAll(".is-drop-target").forEach((candidate) => candidate.classList.remove("is-drop-target"));
      if (!nearest) return;
      nearest.candidate.classList.add("is-drop-target");
      const fromIndex = state.finalPasscodeOrder.indexOf(pointer.tokenId);
      let targetIndex = state.finalPasscodeOrder.indexOf(nearest.candidate.dataset.finalPasscodeToken);
      if (event.clientX > nearest.centerX) targetIndex += 1;
      if (fromIndex < targetIndex) targetIndex -= 1;
      pointer.targetIndex = Math.max(0, Math.min(state.finalPasscodeOrder.length - 1, targetIndex));
    });
    const finishFinalPasscodeDrag = (event, cancelled = false) => {
      const pointer = state.finalPasscodePointer;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      state.finalPasscodePointer = null;
      pointer.node.style.transform = "";
      pointer.node.classList.remove("is-dragging");
      container.querySelectorAll(".is-drop-target").forEach((tile) => tile.classList.remove("is-drop-target"));
      if (pointer.node.hasPointerCapture?.(event.pointerId)) pointer.node.releasePointerCapture?.(event.pointerId);
      if (cancelled || !pointer.moved || pointer.targetIndex < 0) return;
      state.suppressFinalPasscodeClickUntil = Date.now() + 300;
      moveFinalPasscodeToken(pointer.tokenId, pointer.targetIndex);
    };
    container.addEventListener("pointerup", (event) => finishFinalPasscodeDrag(event, false));
    container.addEventListener("pointercancel", (event) => finishFinalPasscodeDrag(event, true));
  }

  function verifyMasterPasscode() {
    if (!state.isStarted || state.isFinished || !areAllMissionsCompleted()) return;
    if (state.timeoutResults || (state.isStarted && getRemainingSeconds() <= 0)) { handleTimeExpired(); return; }
    const statusBox = document.getElementById("masterStatusBox");
    if (!statusBox) return;

    const puzzle=ESCAPE_ROOM_DATA.reward_plan?.type==='imagen';
    if(puzzle&&!ESCAPE_ROOM_DATA.reward_plan.image){statusBox.textContent=EXP.ui(ESCAPE_ROOM_DATA.idioma,'rewardPending');statusBox.className='status-box';return;}
    if(puzzle&&REWARDS.finalState(ESCAPE_ROOM_DATA.reward_plan,state.experience.final).placements.some(v=>v===null)){
      statusBox.textContent=REWARDS.puzzleText(ESCAPE_ROOM_DATA.idioma,'empty');statusBox.className='status-box';return;
    }
    const value = normalizeBaseText(getAssembledFinalPasscode());
    const finalCode = String(extractFinalPasscode() || "").trim().toLowerCase();

    if (ESCAPE_ROOM_DATA.reward_plan && ESCAPE_ROOM_DATA.reward_plan.type !== "letras" ? REWARDS.evaluateFinal(ESCAPE_ROOM_DATA.reward_plan, state.experience.final) : value === normalizeBaseText(finalCode)) {
      if(puzzle){state.experience.final={...REWARDS.finalState(ESCAPE_ROOM_DATA.reward_plan,state.experience.final),solved:true};persistProgressState();renderFinalPasscodePuzzle();}
      statusBox.textContent = puzzle?REWARDS.puzzleText(ESCAPE_ROOM_DATA.idioma,'success'):t("correctSystem");
      statusBox.className = "status-box is-good";
      statusBox.classList.remove("hidden");
      stopAlertSound();

      if (els.endingPanel) {
        els.endingPanel.classList.remove("is-alert");
        els.endingPanel.classList.add("is-success-flash");
      }

      setTimeout(() => {
        if (state.timeoutResults || getRemainingSeconds() <= 0) { handleTimeExpired(); return; }
        stopTimerInterval();
        state.remainingSecondsAtFinish = getRemainingSeconds();
        state.isMasterSolved = true;
        state.isFinished = true;
        if (!state.endAtMs) {
          state.endAtMs = nowMs();
        }
        if (els.endingPanel) {
          els.endingPanel.classList.remove("is-success-flash");
        }
        persistProgressState();
        render();
      }, 2000);
    } else {
      statusBox.textContent = puzzle?REWARDS.puzzleText(ESCAPE_ROOM_DATA.idioma,'wrong'):t("incorrectSystem");
      statusBox.className = "status-box is-bad";
      statusBox.classList.remove("hidden");
    }
  }

  const btnVerify = document.getElementById("btnVerifyMasterPasscode");
  if (btnVerify) {
    btnVerify.addEventListener("click", verifyMasterPasscode);
  }
  wireFinalPasscodePuzzle();

  state.durationSeconds = normalizeDurationSeconds((ESCAPE_ROOM_DATA.duracion_minutos || DEFAULT_DURATION_MINUTES) * 60);
  restoreProgressState();
  if (state.timeoutResults || (state.isStarted && !state.isMasterSolved && getRemainingSeconds() <= 0)) {
    state.isFinished = true;
    state.remainingSecondsAtFinish = 0;
    if (!state.timeoutResults) state.timeoutResults = buildTimeoutResults();
    persistProgressState();
  }
  // Capture before gameplay handlers: the timer's next tick must not leave a
  // window in which late answers, verification or autofill can be accepted.
  const timedControls = '[data-exp-action], [data-exp-bonus], [data-reward-action], [data-reward-position], [data-question-choice], [data-question-boolean], [data-question-answer], [data-question-match-select], [data-question-verify], [data-question-hint], [data-drag-tile], [data-drag-target], [data-sequence-item], [data-sequence-move], [data-editorial-autofill], #btnVerifyMasterPasscode, [data-final-passcode-token]';
  ['click', 'input', 'change', 'pointerdown', 'pointerup', 'drop', 'keydown'].forEach(type => {
    document.addEventListener(type, event => {
      if (!event.target.closest?.(timedControls) || !state.isStarted || state.isMasterSolved) return;
      if (state.timeoutResults || getRemainingSeconds() <= 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        handleTimeExpired();
      }
    }, true);
  });
  window.render_game_to_text = renderGameToText;
  window.advanceTime = advanceTime;
  ensureTimerInterval();
  window.addEventListener("beforeunload", persistProgressState);
  window.addEventListener("pagehide", persistProgressState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistProgressState();
  });
  syncFullscreenControls();
  render();
  if (state.timeoutResults) showTimeoutResults();
  if (REVIEW_PROGRESS_ID && restoredReviewScrollY) requestAnimationFrame(() => window.scrollTo(0, restoredReviewScrollY));
})();
`;
}

function buildFullscreenButton(messages) {
  const label = escapeHtmlAttr(messages.fullscreen);
  return `<button type="button" class="fullscreen-toggle" data-fullscreen-toggle aria-label="${label}" aria-pressed="false" title="${label}">
    <svg class="fullscreen-enter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
    <svg class="fullscreen-exit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
    <span data-fullscreen-label>${escapeHtml(messages.fullscreen)}</span>
  </button>`;
}

function buildMenuSectionsHtml(normalized, finalPasscode) {
  const messages = getGameMessages(normalized.idioma);
  const msg = (key, params = {}) => formatGameMessage(messages, key, params);
  const title = escapeHtml(normalized.titulo);
  const subtitle = escapeHtml(normalized.subtitulo);
  const introduction = escapeHtml(normalized.introduccion);
  const instructions = escapeHtml(normalized.instrucciones);
  const conclusion = escapeHtml(normalized.conclusion);
  const endingImageUrl = resolveEndingImage(normalized);
  const introductionMedia = buildSectionCardMedia(
    normalized.backgroundImage,
    normalized.titulo || messages.introduction,
    "intro"
  );
  const endingMedia = buildSectionCardMedia(
    endingImageUrl,
    normalized.titulo || messages.finalMessage,
    "final"
  );
  const detailTimer = () => `<div class="timer-shell is-ready" data-timer-shell aria-label="${escapeHtmlAttr(messages.countdown)}"><strong class="timer-value" data-timer-value>${formatDuration((normalized.duracion_minutos || 35) * 60)}</strong></div>`;
  const missionCards = normalized.misiones.map((mission, index) => {
    const activityNumber = String(index + 1).padStart(2, "0");
    const missionTitle = escapeHtml(mission.titulo);
    const paletteStyle = buildMissionPaletteStyle(normalized, mission, index);
    return `<button type="button" class="section-card is-locked" data-menu-card data-menu-section="mission" data-menu-mission="${escapeHtmlAttr(mission.id)}" style="${escapeHtmlAttr(paletteStyle)}" aria-disabled="true" disabled>
      ${buildSectionCardMedia(resolveMissionCardImage(mission), mission.imagen_alt || mission.titulo, "activity")}
      <span class="section-card-kicker">${escapeHtml(messages.activity)} ${activityNumber}</span>
      <strong class="section-card-title">${missionTitle}</strong>
      <span class="section-card-status" data-menu-card-status>${escapeHtml(messages.lockedStart)}</span>
    </button>`;
  }).join("\n");
  const heroProgressSteps = normalized.misiones.map((mission, index) => `<li class="menu-progress-step${index === 0 ? " is-active" : ""}" data-step="${index + 1}"><span>${escapeHtml(mission.titulo || `${messages.activity} ${index + 1}`)}</span></li>`).join("");
  const endingImageHtml = endingImageUrl
    ? `<div class="ending-media"><img src="${escapeHtmlAttr(endingImageUrl)}" alt="${escapeHtmlAttr(normalized.titulo || messages.gameCompleted)}"></div>`
    : buildSectionCardFallback("final");

  return `<!DOCTYPE html>
<html lang="${escapeHtmlAttr(normalized.idioma)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>${title}</title>
  <link rel="stylesheet" href="assets/game.css">
</head>
<body class="menu-mode">
  <p id="gameLiveStatus" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
  <main class="game-shell">
    <header class="game-header">
      <div class="game-header-start"><img src="logo.png" alt="PigPen" class="game-logo-brand"></div>
      <div class="game-header-actions">${buildFullscreenButton(messages)}</div>
    </header>
    <section class="game-card menu-game-card">
      <div class="gallery-stage">
        <section class="gallery-screen is-active" data-gallery-screen="menu" aria-hidden="false">
          <header class="menu-hero">
            <div class="menu-hero-heading">
              <div class="menu-hero-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="15" cy="9" r="4"></circle><path d="m12.2 11.8-8 8M7 17l-2-2m5-1-2-2"></path></svg>
              </div>
              <div class="menu-hero-copy">
                <div class="label">${escapeHtml(messages.menuModeLabel)}</div>
                <h1 class="title">${title}</h1>
                <p class="subtitle">${subtitle}</p>
              </div>
            </div>
            <div class="menu-hero-meta">
              <div class="menu-progress-area">
                <p class="menu-progress-eyebrow">${escapeHtml(messages.yourProgress)}</p>
                <p class="menu-progress-lead">${escapeHtml(messages.progressLead)}</p>
                <div class="menu-progress-line">
                  <ol class="menu-progress-steps" aria-label="${escapeHtmlAttr(messages.activitiesProgressAria)}">${heroProgressSteps}</ol>
                  <div class="menu-progress-count"><strong id="progressText">0 / ${normalized.misiones.length}</strong><span>${escapeHtml(messages.activitiesCompleted)}</span></div>
                </div>
                <div class="progress-shell menu-progress" aria-hidden="true"><div class="progress-bar"><span id="progressBar"></span></div></div>
              </div>
              <div class="menu-hero-controls">
                ${detailTimer()}
                <div class="hero-controls">
                  <button type="button" class="primary" data-game-start>${escapeHtml(messages.start)}</button>
                  <button type="button" class="secondary" data-game-reset>${escapeHtml(messages.reset)}</button>
                </div>
              </div>
            </div>
            <aside class="menu-hero-tip" aria-label="${escapeHtmlAttr(messages.tip)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M8.7 14.2A6.5 6.5 0 1 1 15.3 14c-.8.6-1.3 1.4-1.3 2.4H10c0-1-.5-1.8-1.3-2.2Z"></path><path d="M12 2v1M4.9 4.9l.7.7M2 12h1M19 12h3M18.4 5.6l.7-.7"></path></svg>
              <div><strong>${escapeHtml(messages.tip)}</strong><p>${escapeHtml(messages.tipText)}</p></div>
            </aside>
          </header>

          <section class="sections-panel" aria-labelledby="sectionsMenuTitle">
            <div class="sections-panel-heading">
              <div>
                <div class="label">${escapeHtml(messages.route)}</div>
                <h2 id="sectionsMenuTitle">${escapeHtml(messages.chooseSection)}</h2>
              </div>
              <p class="muted">${escapeHtml(messages.unlockOrder)}</p>
            </div>
            <div class="sections-grid" id="sectionsMenu">
              <button type="button" class="section-card" data-menu-card data-menu-section="intro" aria-disabled="false">
                ${introductionMedia}
                <span class="section-card-kicker">${escapeHtml(messages.beforeStart)}</span>
                <strong class="section-card-title">${escapeHtml(messages.introduction)}</strong>
                <span class="section-card-status" data-menu-card-status>${escapeHtml(messages.available)}</span>
              </button>
              <button type="button" class="section-card" data-menu-card data-menu-section="instructions" aria-disabled="false">
                ${buildSectionCardFallback("instructions")}
                <span class="section-card-kicker">${escapeHtml(messages.howToPlay)}</span>
                <strong class="section-card-title">${escapeHtml(messages.instructions)}</strong>
                <span class="section-card-status" data-menu-card-status>${escapeHtml(messages.available)}</span>
              </button>
              ${missionCards}
              <button type="button" class="section-card is-locked" data-menu-card data-menu-section="ending" aria-disabled="true" disabled>
                ${endingMedia}
                <span class="section-card-kicker">${escapeHtml(messages.closing)}</span>
                <strong class="section-card-title">${escapeHtml(messages.finalMessage)}</strong>
                <span class="section-card-status" data-menu-card-status>${escapeHtml(messages.lockedCompleteActivities)}</span>
              </button>
            </div>
          </section>
        </section>

        <section class="gallery-screen menu-detail-screen" data-gallery-screen="intro" aria-hidden="true">
          <article class="menu-detail-shell">
            <div class="menu-detail-toolbar">
              <button type="button" class="secondary" data-menu-back>${escapeHtml(messages.backToMenu)}</button>
              ${detailTimer()}
            </div>
            <div>
              <div class="label">${escapeHtml(messages.introduction)}</div>
              <h2 class="mission-title">${title}</h2>
            </div>
            ${normalized.backgroundImage ? `<div class="menu-detail-media"><img src="${escapeHtmlAttr(normalized.backgroundImage)}" alt="${escapeHtmlAttr(normalized.backgroundImageAlt || normalized.titulo || messages.introduction)}"></div>` : buildSectionCardFallback("intro")}
            <p class="menu-detail-copy">${introduction}</p>
          </article>
        </section>

        <section class="gallery-screen menu-detail-screen" data-gallery-screen="instructions" aria-hidden="true">
          <article class="menu-detail-shell">
            <div class="menu-detail-toolbar">
              <button type="button" class="secondary" data-menu-back>${escapeHtml(messages.backToMenu)}</button>
              ${detailTimer()}
            </div>
            <div>
              <div class="label">${escapeHtml(messages.howToPlay)}</div>
              <h2 class="mission-title">${escapeHtml(messages.instructions)}</h2>
            </div>
            ${buildSectionCardFallback("instructions")}
            <p class="menu-detail-copy">${instructions}</p>
          </article>
        </section>

        <section class="gallery-screen menu-detail-screen" data-gallery-screen="mission" aria-hidden="true">
          <article class="menu-mission-shell">
            <div class="menu-detail-toolbar" aria-label="${escapeHtmlAttr(messages.activityControls)}">
              <button type="button" class="secondary" data-menu-back>${escapeHtml(messages.menu)}</button>
              <div class="question-progress" id="questionProgress" aria-live="polite">${escapeHtml(msg("questionsSolved", { done: 0, total: 0 }))}</div>
              ${detailTimer()}
              <div class="menu-detail-toolbar-actions" data-menu-next-slot></div>
            </div>
            <section id="missionStage"></section>
          </article>
        </section>

        <section class="gallery-screen menu-detail-screen" data-gallery-screen="ending" aria-hidden="true">
          <div class="menu-detail-toolbar">
            <button type="button" class="secondary" data-menu-back>${escapeHtml(messages.backToMenu)}</button>
            ${detailTimer()}
          </div>
          <section id="endingPanel" class="ending-panel hidden">
            <div id="masterPanelContainer" class="master-panel-container hidden" style="text-align: center; max-width: 500px; margin: 0 auto; padding: 20px;">
              <div class="label" style="background: var(--warn); color: white; display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; text-transform: uppercase; margin-bottom: 15px;">${escapeHtml(messages.masterControlPanel)}</div>
              <h2 style="margin-bottom: 15px;">${escapeHtml(messages.criticalSystem)}</h2>
              <p class="muted" id="finalPasscodeInstructions">${escapeHtml(messages.finalCodePuzzleInstruction)}</p>
              <div class="final-passcode-puzzle">
                <div id="finalPasscodeTiles" class="final-passcode-tiles" role="group" aria-labelledby="finalPasscodeInstructions" aria-label="${escapeHtmlAttr(messages.finalCodePuzzleLabel)}"></div>
              </div>
              <div class="button-row" style="justify-content: center; margin-bottom: 20px; align-items: center;">
                <button type="button" class="primary" id="btnVerifyMasterPasscode">${escapeHtml(messages.deactivate)}</button>
              </div>
              <div id="masterStatusBox" class="status-box hidden" role="status" aria-live="polite"></div>
            </div>

            <div id="victoryContainer">
              <div class="label">${escapeHtml(messages.victory)}</div>
              <h2>${escapeHtml(messages.gameCompleted)}</h2>
              ${endingImageHtml}
              <p class="muted">${conclusion}</p>
            </div>
          </section>
        </section>
      </div>
    </section>
  </main>
  <script src="assets/game.js"></script>
</body>
</html>`;
}

export function buildGameHtml(project) {
  const normalized = normalizeRuntimeProject(project);
  const messages = getGameMessages(normalized.idioma);
  const msg = (key, params = {}) => formatGameMessage(messages, key, params);
  const finalPasscode = resolveFinalPasscode(normalized);
  if (normalized.modo_presentacion === "menu_secciones") {
    return buildMenuSectionsHtml(normalized, finalPasscode);
  }
  const title = escapeHtml(normalized.titulo);
  const subtitle = escapeHtml(normalized.subtitulo);
  const introduction = escapeHtml(normalized.introduccion);
  const conclusion = escapeHtml(normalized.conclusion);
  const heroImageHtml = normalized.backgroundImage
    ? `
            <div class="hero-media">
              <img src="${escapeHtmlAttr(normalized.backgroundImage)}" alt="${escapeHtmlAttr(normalized.backgroundImageAlt || normalized.titulo || "Escape room")}" loading="lazy">
            </div>`
    : "";
  const endingImageUrl = resolveEndingImage(normalized);
  const endingImageHtml = endingImageUrl
    ? `
        <div class="ending-media">
          <img src="${escapeHtmlAttr(endingImageUrl)}" alt="${escapeHtmlAttr(normalized.titulo || messages.gameCompleted)}">
        </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="${escapeHtmlAttr(normalized.idioma)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>${title}</title>
  <link rel="stylesheet" href="assets/game.css">
</head>
<body>
  <p id="gameLiveStatus" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
  <main class="game-shell">
    <header class="game-header">
      <div class="game-header-start">
        <button type="button" class="secondary is-concealed" data-gallery-prev aria-hidden="true" tabindex="-1" disabled>${escapeHtml(messages.previous)}</button>
        <img src="logo.png" alt="PigPen" class="game-logo-brand">
      </div>
      <div class="game-header-center">
        <div class="gallery-step" id="galleryStep">${escapeHtml(msg("sectionCounter", { current: 1, total: 3 }))}</div>
        <div class="timer-shell timer-header is-ready" data-timer-shell aria-label="${escapeHtmlAttr(messages.countdown)}">
          <span class="timer-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3"></path></svg></span>
          <strong class="timer-value" data-timer-value>${formatDuration((normalized.duracion_minutos || 35) * 60)}</strong>
        </div>
      </div>
      <div class="game-header-actions">
        <button type="button" class="secondary" data-gallery-next>${escapeHtml(messages.next)}</button>
        ${buildFullscreenButton(messages)}
      </div>
    </header>
    <section class="game-card">
      <div class="gallery-stage">
        <section class="gallery-screen is-active" data-gallery-screen="intro">
          <section class="hero-panel">
            <div class="label">Arena eSports</div>
            <h1 class="title">${title}</h1>
            <p class="subtitle">${subtitle}</p>
            <p class="muted">${introduction}</p>
            <div class="hero-controls">
              <button type="button" class="primary" data-game-start>${escapeHtml(messages.start)}</button>
              <button type="button" class="secondary" data-game-reset>${escapeHtml(messages.reset)}</button>
            </div>
            ${heroImageHtml}
            <div class="progress-shell">
              <div class="progress-bar"><span id="progressBar"></span></div>
              <p class="status-note">${escapeHtml(messages.progress)} <strong id="progressText">0 / ${normalized.misiones.length}</strong></p>
            </div>
          </section>
        </section>

        <section class="gallery-screen" data-gallery-screen="mission">
          <section class="map-panel">
            <div class="map-grid" id="mapGrid"></div>
          </section>

          <section id="missionStage"></section>
        </section>

        <section class="gallery-screen" data-gallery-screen="ending">
          <section id="endingPanel" class="ending-panel hidden">
            <!-- Contenedor del Panel de Control Maestro (Clave Final) -->
            <div id="masterPanelContainer" class="master-panel-container hidden" style="text-align: center; max-width: 500px; margin: 0 auto; padding: 20px;">
              <div class="label" style="background: var(--warn); color: white; display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; text-transform: uppercase; margin-bottom: 15px;">${escapeHtml(messages.masterControlPanel)}</div>
              <h3 style="margin-bottom: 15px;">${escapeHtml(messages.criticalSystem)}</h3>
              <p class="muted" id="finalPasscodeInstructions">${escapeHtml(messages.finalCodePuzzleInstruction)}</p>
              <div class="final-passcode-puzzle">
                <div id="finalPasscodeTiles" class="final-passcode-tiles" role="group" aria-labelledby="finalPasscodeInstructions" aria-label="${escapeHtmlAttr(messages.finalCodePuzzleLabel)}"></div>
              </div>
              <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; align-items: center;">
                <button type="button" class="primary" id="btnVerifyMasterPasscode" style="padding: 12px 24px; border-radius: 12px; font-weight: bold;">${escapeHtml(messages.deactivate)}</button>
              </div>
              <div id="masterStatusBox" class="status-box hidden" role="status" aria-live="polite"></div>
            </div>

            <!-- Contenedor de Éxito / Victoria -->
            <div id="victoryContainer">
              <div class="label">${escapeHtml(messages.victory)}</div>
              <h2>${escapeHtml(messages.gameCompleted)}</h2>
              ${endingImageHtml}
              <p class="muted">${conclusion}</p>
            </div>
          </section>
        </section>
      </div>
    </section>
  </main>
  <script src="assets/game.js"></script>
</body>
</html>`;
}

export function buildPreviewDocument(project, options = {}) {
  const normalized = normalizeRuntimeProject(project);
  const messages = getGameMessages(normalized.idioma);
  const styleProject = { ...normalized, themeConfig: normalized.themeConfig };
  const fullHtml = buildGameHtml(normalized);
  const bodyMatch = fullHtml.match(/<body([^>]*)>([\s\S]*?)<script src="assets\/game\.js"><\/script>\s*<\/body>/i);
  const bodyAttributes = bodyMatch?.[1] || "";
  const bodyContent = bodyMatch?.[2] || "";
  const editorialReview = options?.editorialReview === true;
  const editorialScript = editorialReview
    ? `<script>window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ = true;</script>`
    : "";
  const editorialButton = editorialReview
    ? `<button type="button" class="editorial-fab" data-editorial-autofill data-editorial-action="start" aria-label="${escapeHtmlAttr(messages.start)}" title="${escapeHtmlAttr(messages.start)}" hidden></button>`
    : "";
  return `<!DOCTYPE html>
<html lang="${escapeHtmlAttr(normalized.idioma)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>${escapeHtml(normalized.titulo)}</title>
  <style>${buildGameCss(styleProject)}</style>
</head>
<body${bodyAttributes}>
  ${bodyContent}
  ${editorialButton}
  ${editorialScript}
  <script>${buildGameRuntime(normalized, { progressIdentity: options.progressIdentity }).replace(/<\/script/gi, "<\\/script")}<\/script>
</body>
</html>`;
}

export function buildEscapeRoomPackage(project) {
  const normalized = normalizeRuntimeProject(project);
  // Compatibilidad de exportación para proyectos históricos: la clave se deriva
  // únicamente al materializar el paquete, nunca durante la creación o auditoría.
  normalized.clave_final = resolveFinalPasscode(normalized).code;
  const rewardIssues = normalized.reward_plan ? createRewardEngine(experience).issues(normalized.reward_plan) : [];
  const questionIssues = normalized.misiones.flatMap(m => m.preguntas.flatMap(q => experience.structuralIssues(q.tipo_interaccion, q.interaction_data)));
  if (rewardIssues.length || questionIssues.length) throw new Error([...rewardIssues, ...questionIssues].join(' · '));
  const files = {};
  const mediaFolder = "assets/media";

  if (normalized.reward_plan?.image?.startsWith("data:")) normalized.reward_plan.image = extractDataUrlAsset(files, normalized.reward_plan.image, `${mediaFolder}/reward-image`, "png");
  if(normalized.reward_plan?.type==='imagen' && normalized.experience_config)normalized.experience_config.reward_image=normalized.reward_plan.image;

  if (normalized.backgroundImage?.startsWith("data:")) {
    normalized.backgroundImage = extractDataUrlAsset(
      files,
      normalized.backgroundImage,
      `${mediaFolder}/${sanitizeFileName(normalized.titulo, "escape-room")}-background`,
      "png"
    );
  }

  if (normalized.endingImage?.startsWith("data:")) {
    normalized.endingImage = extractDataUrlAsset(files, normalized.endingImage,
      `${mediaFolder}/${sanitizeFileName(normalized.titulo, "escape-room")}-ending`, "png");
  }

  normalized.misiones.forEach((mission, missionIndex) => {
    extractMissionAssets(files, mediaFolder, mission, missionIndex);
  });

  files["index.html"] = buildGameHtml(normalized);
  // Preview keeps self-contained icons; the ZIP needs real files with paths
  // relative to assets/game.css, not to index.html.
  const cssIcons = new Map();
  files["assets/game.css"] = buildGameCss({ ...normalized, themeConfig: normalized.themeConfig })
    .replace(/url\("data:image\/svg\+xml,([^\"]+)"\)/g, (_match, encodedSvg) => {
      if (!cssIcons.has(encodedSvg)) {
        const path = `icons/status-${cssIcons.size + 1}.svg`;
        files[`assets/${path}`] = decodeURIComponent(encodedSvg);
        cssIcons.set(encodedSvg, path);
      }
      return `url("${cssIcons.get(encodedSvg)}")`;
    });
  files["assets/game.js"] = buildGameRuntime(normalized);
  files["assets/escape-room.json"] = JSON.stringify(normalized, null, 2);

  return {
    downloadName: sanitizeFileName(`EscapeRoom_${normalized.titulo}`, "EscapeRoom"),
    files
  };
}
