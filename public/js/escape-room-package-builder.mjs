import { normalizeEscapeRoomProject, getMissionAcceptedAnswers, resolveFinalPasscode } from "./escape-room-creator-model.mjs";
import { formatGameMessage, getGameMessages } from "./escape-room-game-i18n.mjs";

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

function buildProgressFingerprint(project = {}) {
  const source = JSON.stringify({
    modo_presentacion: project?.modo_presentacion === "menu_secciones" ? "menu_secciones" : "salas",
    clave_final: resolveFinalPasscode(project).code,
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
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  return project?.backgroundImage
    || missions.find((mission) => mission?.media?.tipo === "imagen" && mission.media.url)?.media?.url
    || missions.find((mission) => String(mission?.imagen || "").trim())?.imagen
    || missions.flatMap((mission) => Array.isArray(mission?.preguntas) ? mission.preguntas : [])
      .find((question) => question?.media?.tipo === "imagen" && question.media.url)?.media?.url
    || missions.flatMap((mission) => Array.isArray(mission?.preguntas) ? mission.preguntas : [])
      .find((question) => String(question?.imagen || "").trim())?.imagen
    || "";
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
  return `:root {
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
body {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  font-family: "Segoe UI", system-ui, sans-serif;
  background: linear-gradient(135deg, var(--bg), var(--bg-2));
}
.game-logo-brand {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 42px;
  height: auto;
  z-index: 1;
  pointer-events: none;
}
.fullscreen-toggle {
  position: fixed;
  top: max(10px, env(safe-area-inset-top));
  right: max(10px, env(safe-area-inset-right));
  z-index: 90;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 9px 12px;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 750;
  line-height: 1;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-soft) 92%, black 8%);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.3);
  backdrop-filter: blur(16px);
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease;
}
.fullscreen-toggle:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 62%, var(--line));
  background: color-mix(in srgb, var(--accent) 12%, var(--panel-soft));
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
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
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
  overflow: hidden;
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
.timer-fab {
  position: fixed;
  left: 18px;
  right: auto;
  bottom: 18px;
  z-index: 60;
  min-width: 0;
  width: fit-content;
  max-width: calc(100vw - 36px);
  justify-content: flex-start;
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(18px);
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
.ending-panel.is-alert {
  border-color: color-mix(in srgb, var(--danger) 78%, white 22%);
  box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.22), 0 0 38px rgba(251, 113, 133, 0.42);
  animation: red-alert-blink 1s ease-in-out infinite;
}
.game-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--panel-soft) 94%, black 6%);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
  overflow: visible;
}
.game-header .is-concealed {
  visibility: hidden;
  pointer-events: none;
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
.investigation-board-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.investigation-board-title { margin: 5px 0 0; font-size: clamp(1.2rem, 2.4vw, 1.7rem); }
.investigation-board-lead { margin: 0; color: var(--paragraph-color); }
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
.evidence-card { min-height: 88px; padding: 15px; border-radius: 12px 4px 14px 5px; font-weight: 700; line-height: 1.45; }
.evidence-card:nth-child(even) { transform: rotate(0.35deg); }
.evidence-index { display: block; margin-bottom: 8px; color: var(--room-station-color, var(--accent)); font-size: 0.7rem; letter-spacing: 0.16em; }
.investigation-objective { padding: 16px 18px; border-radius: var(--radius-md); border-left: 4px solid var(--room-theme-color, var(--accent-2)); }
.investigation-objective strong { display: block; margin-bottom: 6px; color: var(--title-color); }
.investigation-objective p { margin: 0; color: var(--paragraph-color); line-height: 1.55; }
.investigation-board-actions { display: flex; justify-content: flex-end; }
.briefing-review { margin-top: 18px; border: 1px solid var(--line); border-radius: var(--radius-md); background: color-mix(in srgb, var(--panel-soft) 92%, white 8%); }
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
  font-size: 1.18rem;
  margin: 8px 0 0;
}
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
  margin-top: 8px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #ffffff;
  font-size: clamp(1.15rem, 2vw, 1.4rem);
  font-weight: 800;
  line-height: 1.55;
}
#roomStatusBox.status-box.room-status-box.is-good,
#roomStatusBox.status-box.room-status-box.is-bad {
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #ffffff;
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
.question-challenge .choice-grid,
.question-challenge .match-grid {
  grid-template-columns: 1fr;
}
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
  border-style: dashed !important;
  text-align: center;
}
.sequence-list {
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
.subtitle { color: var(--subtitle-color); line-height: 1.5; font-size: ${displaySubtitleSize}px; }
.muted, .status-note, .mission-story, .map-help { color: var(--paragraph-color); line-height: 1.55; font-size: ${displayParagraphSize}px; }
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
  box-shadow: inset 5px 0 0 color-mix(in srgb, var(--room-station-color) 78%, transparent);
}
.mission-panel[data-room-palette] .mission-title,
.mission-panel[data-room-palette] .question-title {
  color: color-mix(in srgb, var(--room-theme-color) 62%, var(--title-color));
}
.mission-panel[data-room-palette] .question-card {
  border-left: 4px solid var(--room-station-color);
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
.choice-card {
  padding: 14px;
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
.choice-card.is-selected { border-color: color-mix(in srgb, var(--accent-2) 62%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-2) 28%, transparent); }
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
.match-select:focus { outline: none; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); border-color: color-mix(in srgb, var(--accent) 58%, transparent); }
.drag-match-board {
  display: grid;
  gap: 14px;
}
.drag-match-help {
  margin: 0;
  font-size: 0.84rem;
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
.drag-match-target-label { border-right: 1px solid var(--line); }
.drag-match-target-slot {
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
.timer-fab {
  border: 1px solid var(--line);
  color: var(--button-text);
}
h2, h3, .mission-title, .question-title {
  color: var(--title-color);
}
.game-card, .hero-panel, .meta-panel, .map-panel, .mission-panel, .ending-panel, .challenge-box, .field, .choice-card, .match-item, .match-select, .media-card-empty, .status-box, .hint-box {
  background: var(--panel);
}
.hint-box, .status-box {
  margin-top: 12px;
  border-radius: var(--radius-md);
  padding: 14px 16px;
}
.hint-box { background: color-mix(in srgb, var(--warn) 12%, var(--panel)); border: 1px solid color-mix(in srgb, var(--warn) 26%, transparent); color: color-mix(in srgb, var(--warn) 70%, white 30%); }
.status-box { background: color-mix(in srgb, var(--panel-soft) 90%, white 10%); border: 1px solid var(--line); color: var(--muted); }
.status-box.is-good { background: color-mix(in srgb, var(--success) 12%, var(--panel)); border-color: color-mix(in srgb, var(--success) 26%, transparent); color: color-mix(in srgb, var(--success) 64%, white 36%); }
.status-box.is-bad { background: color-mix(in srgb, var(--danger) 12%, var(--panel)); border-color: color-mix(in srgb, var(--danger) 26%, transparent); color: color-mix(in srgb, var(--danger) 68%, white 32%); }
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
.menu-hero-copy .subtitle { margin: 0; color: var(--subtitle-color); font-size: clamp(1rem, 2vw, 1.28rem); }
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
    padding: 6px 2px 0;
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
    font-size: 1.02rem;
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
  .choice-grid {
    grid-template-columns: 1fr;
  }
  .timer-fab {
    left: 14px;
    right: auto;
    bottom: 14px;
    min-width: 0;
    width: fit-content;
    max-width: calc(100vw - 28px);
  }
  .choice-card,
  .match-item {
    padding: 12px;
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
    width: 40px;
    padding: 9px;
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
  .menu-mode .game-shell {
    padding-top: 42px;
  }
  .menu-mode .game-logo-brand {
    top: 6px;
    left: 6px;
    width: 28px;
  }
  .game-shell {
    padding: 42px 10px 10px;
    gap: 8px;
  }
  .game-header {
    top: 0;
    padding: 4px 0 0;
    gap: 8px;
  }
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
    font-size: 0.96rem;
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
  .timer-shell:not(.timer-fab) {
    width: 100%;
    justify-content: space-between;
  }
  .timer-fab.timer-shell {
    width: fit-content;
    max-width: calc(100vw - 28px);
    justify-content: flex-start;
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

export function buildGameRuntime(project) {
  const normalized = hydrateAcademicMissionPalettes(normalizeEscapeRoomProject(project));
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
const ESCAPE_ROOM_I18N = ${serializeForJavaScript(messages)};
const ESCAPE_ROOM_FINAL_PASSCODE = ${JSON.stringify(finalPasscode.code)};
const ESCAPE_ROOM_FINAL_PASSCODE_IS_FALLBACK = ${finalPasscode.isFallback ? "true" : "false"};
const ESCAPE_ROOM_PRESENTATION_MODE = ${JSON.stringify(isMenuMode ? "menu_secciones" : "salas")};
const ESCAPE_ROOM_PROGRESS_VERSION = 3;
const ESCAPE_ROOM_PROGRESS_FINGERPRINT = ${JSON.stringify(progressFingerprint)};

// ${isMenuMode
  ? "Runtime de menú por secciones: las actividades se desbloquean de forma secuencial."
  : "Runtime de mapa libre: las salas desbloqueadas se eligen en cualquier orden permitido."}
(function initEscapeRoomGame() {
  const IS_MENU_MODE = ESCAPE_ROOM_PRESENTATION_MODE === "menu_secciones";
  const DEFAULT_DURATION_MINUTES = ${JSON.stringify(normalized.duracion_minutos || 35)};
  function t(key, params = {}) {
    const template = String(ESCAPE_ROOM_I18N[key] ?? key);
    return template.replace(/\\{([a-zA-Z0-9_]+)\\}/g, (_, name) => String(params[name] ?? "{" + name + "}"));
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
  const state = {
    unlocked: new Set(IS_MENU_MODE ? [] : ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id)),
    completed: new Set(),
    completedQuestions: new Set(),
    readBriefings: new Set(ESCAPE_ROOM_DATA.misiones.filter((mission) => mission.contexto_requerido === false).map((mission) => mission.id)),
    questionAnswers: {},
    questionChoices: {},
    questionMatches: {},
    questionDragMatches: {},
    questionDragLocked: {},
    selectedDragTiles: {},
    questionSequenceOrders: {},
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
    remainingSecondsAtFinish: null,
    timerIntervalId: null,
    isMasterSolved: false,
    alertAudioContext: null,
    alertAudioNodes: null,
    nowOverrideMs: null,
    isImmersiveFallback: false,
    immersiveScrollY: 0,
    editorialReviewContextKey: ""
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

  function getProgressStorageKey() {
    return getLegacyProgressStorageKey()
      + ".v" + ESCAPE_ROOM_PROGRESS_VERSION
      + "." + ESCAPE_ROOM_PRESENTATION_MODE
      + "." + ESCAPE_ROOM_PROGRESS_FINGERPRINT;
  }

  function serializeProgressState() {
    return {
      version: ESCAPE_ROOM_PROGRESS_VERSION,
      mode: ESCAPE_ROOM_PRESENTATION_MODE,
      fingerprint: ESCAPE_ROOM_PROGRESS_FINGERPRINT,
      completed: [...state.completed],
      completedQuestions: [...state.completedQuestions],
      readBriefings: [...state.readBriefings],
      questionAnswers: state.questionAnswers,
      questionChoices: state.questionChoices,
      questionMatches: state.questionMatches,
      questionDragMatches: state.questionDragMatches,
      questionDragLocked: state.questionDragLocked,
      questionSequenceOrders: state.questionSequenceOrders,
      currentMissionId: state.currentMissionId,
      galleryScreen: state.galleryScreen,
      unlocked: [...state.unlocked],
      durationSeconds: state.durationSeconds,
      isStarted: state.isStarted,
      isFinished: state.isFinished,
      startedAtMs: state.startedAtMs,
      endAtMs: state.endAtMs,
      remainingSecondsAtFinish: state.remainingSecondsAtFinish,
      isMasterSolved: state.isMasterSolved
    };
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
    if (!raw && !IS_MENU_MODE) {
      raw = window.localStorage.getItem(getLegacyProgressStorageKey());
      isLegacySave = Boolean(raw);
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!isLegacySave) {
        const isCompatible = parsed?.version === ESCAPE_ROOM_PROGRESS_VERSION
          && parsed?.mode === ESCAPE_ROOM_PRESENTATION_MODE
          && parsed?.fingerprint === ESCAPE_ROOM_PROGRESS_FINGERPRINT;
        if (!isCompatible) return;
      }
      const missionIds = new Set(ESCAPE_ROOM_DATA.misiones.map((mission) => mission.id));
      state.completed = new Set(Array.isArray(parsed.completed) ? parsed.completed.filter((id) => missionIds.has(id)) : []);
      if (IS_MENU_MODE) {
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
      state.questionAnswers = parsed.questionAnswers && typeof parsed.questionAnswers === "object" ? parsed.questionAnswers : {};
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
      const validScreens = IS_MENU_MODE ? ["menu", "intro", "instructions", "mission", "ending"] : ["intro", "mission", "ending"];
      state.galleryScreen = validScreens.includes(parsed.galleryScreen) ? parsed.galleryScreen : (IS_MENU_MODE ? "menu" : "intro");
      state.durationSeconds = normalizeDurationSeconds(parsed.durationSeconds);
      state.isStarted = parsed.isStarted === true;
      state.isFinished = parsed.isFinished === true;
      state.isMasterSolved = parsed.isMasterSolved === true;
      state.startedAtMs = Number.isFinite(Number(parsed.startedAtMs)) ? Number(parsed.startedAtMs) : null;
      state.endAtMs = Number.isFinite(Number(parsed.endAtMs)) ? Number(parsed.endAtMs) : null;
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
      if (IS_MENU_MODE) syncMenuUnlocksFromProgress();
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
    const isActive = Boolean(getFullscreenElement()) || state.isImmersiveFallback;
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
    return Math.max(0, Math.ceil((state.endAtMs - nowMs()) / 1000));
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
      "[data-question-choice], [data-question-verify], [data-question-hint], [data-question-match-select], [data-question-answer], [data-drag-tile], [data-drag-target]"
    );
    targets.forEach((node) => {
      const staysLocked = !disabled && node.getAttribute("data-drag-locked") === "true";
      if ("disabled" in node) node.disabled = disabled || staysLocked;
      if (disabled || staysLocked) node.setAttribute("aria-disabled", "true");
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
    stopTimerInterval();
    state.isFinished = true;
    state.endAtMs = nowMs();
    state.remainingSecondsAtFinish = 0;
    if (!IS_MENU_MODE) state.galleryScreen = "mission";
    updateTimerUi();
    persistProgressState();
    if (els.roomStatusBox) {
      setRoomStatus(t("timeExpired"), "bad");
    }
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
    const unlocked = new Set();
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

    const finalCode = extractFinalPasscode(ESCAPE_ROOM_DATA.conclusion);
    const masterPanelContainer = document.getElementById("masterPanelContainer");
    const victoryContainer = document.getElementById("victoryContainer");

    if (finalCode && !state.isMasterSolved) {
      if (masterPanelContainer) masterPanelContainer.classList.remove("hidden");
      if (victoryContainer) victoryContainer.classList.add("hidden");
      return;
    }

    if (masterPanelContainer) masterPanelContainer.classList.add("hidden");
    if (victoryContainer) victoryContainer.classList.remove("hidden");

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
      const isFirstScreen = state.galleryScreen === "intro";
      button.disabled = isFirstScreen;
      button.classList.toggle("is-concealed", isFirstScreen);
      button.setAttribute("aria-hidden", isFirstScreen ? "true" : "false");
      button.tabIndex = isFirstScreen ? -1 : 0;
    });

    els.galleryNextButtons.forEach((button) => {
      if (state.galleryScreen === "intro") {
        button.disabled = false;
        button.textContent = t("next");
        return;
      }
      if (state.galleryScreen === "mission") {
        const complete = areAllMissionsCompleted();
        button.disabled = !complete;
        button.textContent = complete ? t("seeVictory") : t("completeAllRooms");
        return;
      }
      button.disabled = true;
      button.textContent = t("final");
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
    renderGallery();
    if (nextScreen === "mission") {
      scrollMissionStageToTop();
    }
  }

  function goToPreviousGalleryScreen() {
    if (IS_MENU_MODE) {
      returnToMenu();
      return;
    }
    if (state.galleryScreen === "mission") setGalleryScreen("intro");
    else if (state.galleryScreen === "ending") setGalleryScreen("mission");
  }

  function goToNextGalleryScreen() {
    if (IS_MENU_MODE) return;
    if (state.galleryScreen === "intro") setGalleryScreen("mission");
    else if (state.galleryScreen === "mission" && areAllMissionsCompleted()) setGalleryScreen("ending");
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
      button.disabled = cardState.locked;
      button.setAttribute("aria-disabled", cardState.locked ? "true" : "false");
      button.classList.toggle("is-locked", cardState.locked);
      button.classList.toggle("is-complete", cardState.complete);
      const status = button.querySelector("[data-menu-card-status]");
      if (status) status.textContent = cardState.status;
      const title = button.querySelector(".section-card-title")?.textContent?.trim() || t("section");
      button.setAttribute("aria-label", title + ". " + cardState.status + ".");
    });
  }

  function focusActiveMenuScreen() {
    window.requestAnimationFrame(() => {
      const screen = document.querySelector('[data-gallery-screen="' + CSS.escape(state.galleryScreen) + '"]');
      const heading = screen?.querySelector("h1, h2");
      if (!heading) return;
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
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
    const focusSelector = state.lastMenuFocusSelector;
    state.galleryScreen = "menu";
    persistProgressState();
    render();
    window.requestAnimationFrame(() => {
      const card = focusSelector ? document.querySelector(focusSelector) : null;
      card?.focus({ preventScroll: true });
    });
  }

  function goToNextMenuActivity() {
    if (!IS_MENU_MODE) return;
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
      const locked = !state.unlocked.has(mission.id);
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
        focusTarget.focus({ preventScroll: true });
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
    return [...new Set(values.map((value) => normalizePlayerAnswer(value, question)).filter(Boolean))];
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
    const accepted = getQuestionAcceptedAnswers(question);
    const options = Array.isArray(question?.opciones) ? question.opciones : [];
    for (let index = 0; index < options.length; index += 1) {
      const normalized = normalizePlayerAnswer(options[index], question);
      if (accepted.includes(normalized)) return index;
    }
    return -1;
  }

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
    return '<div class="choice-grid">' + question.opciones.map((option, index) => {
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
    return '<div class="fill-blank-block"><p class="drag-match-help">' + escapeHtml(t("fillBlankInstruction")) + '</p><div class="fill-blank-sentence"><span>' + escapeHtml(before) + '</span><label class="sr-only" for="questionAnswer-' + escapeHtmlAttr(key) + '">' + escapeHtml(t("writeAnswer")) + '</label><input id="questionAnswer-' + escapeHtmlAttr(key) + '" class="field question-answer-input fill-blank-input" data-question-answer="' + escapeHtmlAttr(key) + '" type="text" value="' + escapeHtmlAttr(currentValue) + '" placeholder="___"><span>' + escapeHtml(after) + '</span></div></div>';
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
    const options = [...question.parejas]
      .map((pair) => pair.derecha)
      .sort((a, b) => a.localeCompare(b, ESCAPE_ROOM_DATA.idioma));
    const rows = question.parejas.map((pair, index) => {
      const currentValue = selections[String(index)] || "";
      return '<div class="match-row-grid"><div class="match-item">' + escapeHtml(pair.izquierda) + '</div><select class="match-select" data-question-match-select="' + escapeHtmlAttr(key) + '" data-match-index="' + index + '"><option value="">' + escapeHtml(t("selectOption")) + '</option>' + options.map((option) => '<option value="' + escapeHtmlAttr(option) + '"' + (currentValue === option ? ' selected' : '') + '>' + escapeHtml(option) + '</option>').join('') + '</select></div>';
    }).join('');
    return '<div class="match-grid">' + rows + '</div>';
  }

  function getStableDragTileOrder(key, count) {
    const values = Array.from({ length: count }, (_, index) => index);
    let hash = 2166136261;
    const seed = String(ESCAPE_ROOM_PROGRESS_FINGERPRINT) + "::" + String(key);
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

  function renderMissionDragDropBlock(question, key) {
    const pairs = Array.isArray(question.parejas) ? question.parejas : [];
    const assignments = getDragAssignments(key);
    const locked = getDragLockedTargets(key);
    const selectedTile = Number(state.selectedDragTiles[key]);
    const assignedTiles = new Set(Object.values(assignments).map((value) => Number(value)).filter(Number.isInteger));
    const tileOrder = getStableDragTileOrder(key, pairs.length);
    const tray = tileOrder.filter((tileIndex) => !assignedTiles.has(tileIndex)).map((tileIndex) => {
      const selected = selectedTile === tileIndex;
      const pair = pairs[tileIndex] || {};
      return '<button type="button" class="drag-match-tile' + (selected ? ' is-selected' : '') + '" data-drag-tile="' + escapeHtmlAttr(key) + '" data-drag-tile-index="' + tileIndex + '" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-label="' + escapeHtmlAttr(t("dragTileLabel", { tile: pair.derecha || "" })) + '">' + escapeHtml(pair.derecha || "") + '</button>';
    }).join('');
    const targets = pairs.map((pair, targetIndex) => {
      const assignedTile = Number(assignments[String(targetIndex)]);
      const hasTile = Number.isInteger(assignedTile) && pairs[assignedTile];
      const isLocked = locked[String(targetIndex)] === true;
      const tileLabel = hasTile ? String(pairs[assignedTile].derecha || "") : "";
      const targetClass = 'drag-match-target' + (hasTile ? ' is-filled' : '') + (isLocked ? ' is-correct' : '');
      const ariaLabel = hasTile
        ? t("dragTargetFilledLabel", { target: pair.izquierda || "", tile: tileLabel })
        : t("dragTargetLabel", { target: pair.izquierda || "" });
      return '<button type="button" class="' + targetClass + '" data-drag-target="' + escapeHtmlAttr(key) + '" data-drag-target-index="' + targetIndex + '"' + (hasTile ? ' data-assigned-tile-index="' + assignedTile + '"' : '') + (isLocked ? ' data-drag-locked="true" disabled aria-disabled="true"' : '') + ' aria-label="' + escapeHtmlAttr(ariaLabel) + '"><span class="drag-match-target-label">' + escapeHtml(pair.izquierda || "") + '</span><span class="drag-match-target-slot">' + escapeHtml(hasTile ? tileLabel : t("dragEmptySlot")) + '</span></button>';
    }).join('');
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

  function renderQuestionInteraction(question, key) {
    if (question.tipo_interaccion === "opcion_multiple") return renderMissionChoiceBlock(question, key);
    if (question.tipo_interaccion === "verdadero_falso") return renderTrueFalseBlock(question, key);
    if (question.tipo_interaccion === "relacion_columnas") return renderMissionMatchingBlock(question, key);
    if (question.tipo_interaccion === "drag_drop") return renderMissionDragDropBlock(question, key);
    if (question.tipo_interaccion === "ordenar_secuencia") return renderSequenceBlock(question, key);
    if (question.tipo_interaccion === "completar_espacio") return renderFillBlankBlock(question, key);
    return renderMissionTextBlock(question, key);
  }

  function renderQuestionCard(mission, question, questionIndex) {
    const key = getQuestionKey(mission, question);
    const total = getRoomQuestions(mission).length || 1;
    const complete = state.completedQuestions.has(key);
    const cardClass = 'mission-panel question-card' + (complete ? ' is-complete' : '');
    const statusText = complete ? (question.retroalimentacion_correcta || t("correct")) : t("defaultChallenge");
    const mediaHtml = renderQuestionMedia(question, question.reto);
    const interactionHtml = complete ? '<div class="status-box is-good">' + escapeHtml(t("questionCompleted")) + '</div>' : renderQuestionInteraction(question, key);
    const isInlineAnswer = question.tipo_interaccion === 'texto' && question.subtipo_respuesta === 'numero';
    const responseRowClass = 'question-response-row' + (isInlineAnswer ? ' is-inline-answer' : '');
    return '<article class="' + cardClass + '" data-question-card data-question-key="' + escapeHtmlAttr(key) + '">' +
      '<div class="question-head">' +
        '<div>' +
          '<div class="label">' + escapeHtml(t("questionCounter", { current: String(questionIndex + 1).padStart(2, '0'), total: String(total).padStart(2, '0') })) + '</div>' +
          '<h3 class="question-title">' + escapeHtml(question.titulo) + '</h3>' +
        '</div>' +
      '</div>' +
      '<p class="question-story">' + escapeHtml(question.reto) + '</p>' +
      (mediaHtml ? mediaHtml : '') +
      '<div class="' + responseRowClass + '">' +
        '<div class="question-challenge">' + interactionHtml + '</div>' +
        '<div class="button-row question-actions">' +
          '<button type="button" class="primary" data-question-verify="' + escapeHtmlAttr(key) + '"' + (complete ? ' disabled' : '') + '>' + escapeHtml(complete ? t("completed") : t("verify")) + '</button>' +
          '<button type="button" class="secondary" data-question-hint="' + escapeHtmlAttr(key) + '"' + (complete ? ' disabled' : '') + '>' + escapeHtml(t("revealHint")) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="hint-box hidden" data-question-hint-box="' + escapeHtmlAttr(key) + '">' + escapeHtml(question.pista) + '</div>' +
      '<div class="status-box" data-question-status="' + escapeHtmlAttr(key) + '">' + escapeHtml(statusText) + '</div>' +
    '</article>';
  }

  function renderInvestigationBoard(mission, includeAcknowledge = false) {
    const evidence = Array.isArray(mission?.datos_clave) ? mission.datos_clave.filter(Boolean) : [];
    const evidenceHtml = evidence.length
      ? '<div><div class="label">' + escapeHtml(t("keyEvidence")) + '</div><div class="investigation-evidence-grid">' + evidence.map((item, index) => (
          '<div class="evidence-card"><span class="evidence-index">' + String(index + 1).padStart(2, '0') + '</span>' + escapeHtml(item) + '</div>'
        )).join('') + '</div></div>'
      : '';
    const actionHtml = includeAcknowledge
      ? '<div class="investigation-board-actions"><button type="button" class="primary" data-briefing-ack="' + escapeHtmlAttr(mission.id) + '">' + escapeHtml(t("briefingAcknowledge")) + '</button></div>'
      : '';
    return '<section class="investigation-board" data-briefing-board="' + escapeHtmlAttr(mission.id) + '" aria-labelledby="briefing-title-' + escapeHtmlAttr(mission.id) + '">' +
      '<div class="investigation-board-head"><div><div class="label">' + escapeHtml(mission.release || t("section")) + '</div><h3 class="investigation-board-title" id="briefing-title-' + escapeHtmlAttr(mission.id) + '">' + escapeHtml(t("investigationBoard")) + '</h3></div><p class="investigation-board-lead">' + escapeHtml(t("briefingLead")) + '</p></div>' +
      '<article class="investigation-document"><p>' + escapeHtml(mission.contexto || mission.historia) + '</p></article>' +
      evidenceHtml +
      '<div class="investigation-objective"><strong>' + escapeHtml(t("missionObjective")) + '</strong><p>' + escapeHtml(mission.reto) + '</p></div>' +
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
      if (focusTarget && !focusTarget.disabled) focusTarget.focus({ preventScroll: true });
      if (announcement) announceDrag(key, announcement);
    });
  }

  function selectDragTile(key, tileIndex) {
    const found = findDragQuestion(key);
    if (!found || !state.isStarted || state.isFinished) return;
    const pair = found.question.parejas?.[tileIndex];
    if (!pair) return;
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
      t("dragTileSelected", { tile: pair.derecha || "" })
    );
  }

  function placeDragTile(key, targetIndex, explicitTileIndex = null) {
    const found = findDragQuestion(key);
    if (!found || !state.isStarted || state.isFinished) return false;
    const pairs = found.question.parejas || [];
    const locked = getDragLockedTargets(key);
    if (locked[String(targetIndex)] === true || !pairs[targetIndex]) return false;
    const selectedTile = explicitTileIndex == null ? Number(state.selectedDragTiles[key]) : Number(explicitTileIndex);
    if (!Number.isInteger(selectedTile) || !pairs[selectedTile]) return false;
    const assignments = getDragAssignments(key);
    removeDragTileFromAssignments(assignments, selectedTile);
    assignments[String(targetIndex)] = selectedTile;
    delete state.selectedDragTiles[key];
    persistProgressState();
    refreshDragBoard(
      key,
      '[data-drag-tile="' + CSS.escape(key) + '"]',
      t("dragTilePlaced", { tile: pairs[selectedTile].derecha || "", target: pairs[targetIndex].izquierda || "" })
    );
    return true;
  }

  function checkDragDropQuestion(question, key) {
    const assignments = getDragAssignments(key);
    return question.parejas.every((_, targetIndex) => Number(assignments[String(targetIndex)]) === targetIndex);
  }

  function rejectIncorrectDragMatches(question, key) {
    const assignments = getDragAssignments(key);
    const locked = getDragLockedTargets(key);
    const wrongTargets = [];
    question.parejas.forEach((_, targetIndex) => {
      const assignedTile = Number(assignments[String(targetIndex)]);
      if (assignedTile === targetIndex) {
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
    const found = findDragQuestion(key);
    if (!found || found.question.tipo_interaccion !== 'ordenar_secuencia') return false;
    const order = getSequenceOrder(found.question, key);
    const from = Math.max(0, Math.min(order.length - 1, Number(fromPosition)));
    const to = Math.max(0, Math.min(order.length - 1, Number(toPosition)));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return false;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    state.questionSequenceOrders[key] = order;
    delete state.selectedSequenceItems[key];
    persistProgressState();
    const label = found.question.elementos?.[moved] || '';
    renderMission();
    window.requestAnimationFrame(() => {
      const focus = els.missionStage?.querySelector('[data-sequence-item="' + CSS.escape(key) + '"][data-sequence-position="' + to + '"]');
      focus?.focus({ preventScroll: true });
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
      markMissionComplete(mission);
      setRoomStatus(IS_MENU_MODE ? t("activityComplete") : t("roomComplete"), 'good');
      renderMission();
      return;
    }
    setRoomStatus(IS_MENU_MODE ? t("continueActivity") : t("continueRoom"), 'info');
  }

  function renderMission() {
    if (!els.missionStage) return;
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
    const canReviewBriefing = briefingRead && !state.isStarted;
    const roomStatusText = roomComplete
      ? (IS_MENU_MODE ? t("activityReady") : t("roomReady"))
      : (IS_MENU_MODE ? t("solveActivityQuestions") : t("solveRoomQuestions"));
    const questionCards = briefingRead ? questions.map((question, index) => renderQuestionCard(mission, question, index)).join('') : '';
    if (els.questionProgress) {
      els.questionProgress.textContent = t("questionsSolved", { done: completedCount, total: questions.length });
    }
    const nextActionSlot = document.querySelector('[data-menu-next-slot]');
    if (nextActionSlot) {
      nextActionSlot.innerHTML = IS_MENU_MODE && roomComplete
        ? '<button type="button" class="primary" data-menu-next>' + escapeHtml(areAllMissionsCompleted() ? t("nextFinal") : t("next")) + '</button>'
        : '';
    }

    els.missionStage.innerHTML =
      '<section class="mission-panel" data-room-palette style="' + escapeHtmlAttr(getMissionPaletteStyle(mission)) + '">' +
        '<h2 class="mission-title">' + escapeHtml(mission.titulo) + '</h2>' +
        '<p class="mission-story">' + escapeHtml(mission.historia) + '</p>' +
        (briefingRead
          ? (canReviewBriefing ? '<details class="briefing-review"><summary>' + escapeHtml(t("briefingReview")) + '</summary>' + renderInvestigationBoard(mission, false) + '</details>' : '')
          : renderInvestigationBoard(mission, true)) +
        (briefingRead ? (
        '<div class="mission-layout">' +
          renderQuestionMedia(mission, mission.reto) +
          '<div class="label">' + escapeHtml(t("challenge")) + '</div>' +
          '<div class="challenge-box">' + escapeHtml(mission.reto) + '</div>' +
          '<div class="status-box room-status-box" id="roomStatusBox">' + roomStatusText + '</div>' +
        '</div>' +
        '<div class="question-list">' + questionCards + '</div>'
        ) : '') +
      '</section>';

    els.questionProgress = document.getElementById('questionProgress');
    els.roomStatusBox = document.getElementById('roomStatusBox');
    wireMissionEvents();
  }

  function markMissionComplete(mission) {
    state.completed.add(mission.id);
    if (IS_MENU_MODE) {
      syncMenuUnlocksFromProgress();
      persistProgressState();
      updateProgress();
      renderMap();
      renderGallery();
      return;
    }
    (mission.desbloquea || []).forEach((targetId) => state.unlocked.add(targetId));
    persistProgressState();
    updateProgress();
    renderMap();
    if (areAllMissionsCompleted()) {
      const finalCode = extractFinalPasscode(ESCAPE_ROOM_DATA.conclusion);
      if (finalCode && !state.isMasterSolved) {
        setGalleryScreen('ending');
      } else {
        stopTimerInterval();
        state.remainingSecondsAtFinish = getRemainingSeconds();
        state.isFinished = true;
        if (!state.endAtMs) {
          state.endAtMs = nowMs();
        }
        setGalleryScreen('ending');
      }
      return;
    }
    renderGallery();
  }

  function setEditorialReviewAction(action = "autofill") {
    const button = document.querySelector("[data-editorial-autofill]");
    if (!button) return;
    const shouldVerify = action === "verify";
    button.dataset.editorialAction = shouldVerify ? "verify" : "autofill";
    button.textContent = shouldVerify ? t("verifyAnswers") : t("autofillScreen");
    button.setAttribute("aria-label", shouldVerify ? t("verifyAllAnswers") : t("autofillAllAnswers"));
    if (window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ === true && window.parent !== window) {
      // El preview editorial vive en un sandbox de origen opaco; el padre valida event.source y el esquema.
      window.parent.postMessage({ type: "pigpen-editorial-action", action: button.dataset.editorialAction }, "*");
    }
  }

  function syncEditorialReviewActionForCurrentScreen() {
    const contextKey = state.galleryScreen + ":" + (state.currentMissionId || "none");
    if (state.editorialReviewContextKey === contextKey) return;
    state.editorialReviewContextKey = contextKey;
    setEditorialReviewAction("autofill");
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
    setEditorialReviewAction(allValidated ? "autofill" : "verify");
    setRoomStatus(
      allValidated
        ? t("verifiedCount", { count: validated })
        : t("validatedCount", { count: validated, total: pendingQuestions.length }),
      allValidated ? 'good' : 'bad'
    );
  }

  function autocompleteCurrentScreen() {
    const editorialButton = document.querySelector("[data-editorial-autofill]");
    if (editorialButton?.dataset.editorialAction === "verify") {
      validateEditorialCurrentScreen();
      return;
    }

    if (!state.isStarted && !state.isFinished) {
      startEscapeRoom();
    }

    if (!state.isFinished && state.galleryScreen !== "mission") {
      const nextMission = ESCAPE_ROOM_DATA.misiones.find((mission) => (
        state.unlocked.has(mission.id) && !state.completed.has(mission.id)
      )) || (!IS_MENU_MODE ? missionById(state.currentMissionId) : null);

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
      const input = document.getElementById("masterPasscodeInput");
      if (input && finalCode) {
        input.value = finalCode;
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
      if (state.completedQuestions.has(key)) return;

      if (question.tipo_interaccion === "opcion_multiple") {
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

      if (question.tipo_interaccion === "drag_drop") {
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
      const briefingButton = event.target.closest('[data-briefing-ack]');
      if (briefingButton) {
        const missionId = briefingButton.getAttribute('data-briefing-ack') || '';
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
        renderMission();
        if (els.liveStatus) els.liveStatus.textContent = t("briefingReady");
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
        const hintBox = els.missionStage?.querySelector('[data-question-hint-box="' + CSS.escape(key || '') + '"]');
        if (hintBox) hintBox.classList.remove('hidden');
        setQuestionStatus(key || '', t("hintRevealed"), 'good');
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
        if (Date.now() < state.suppressDragClickUntil) return;
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

        let isCorrect = false;
        if (question.tipo_interaccion === 'opcion_multiple') {
          const selectedIndex = Number(state.questionChoices[key] ?? -1);
          const selected = question.opciones[selectedIndex] || '';
          isCorrect = getQuestionAcceptedAnswers(question).includes(normalizePlayerAnswer(selected, question));
        } else if (question.tipo_interaccion === 'verdadero_falso') {
          isCorrect = typeof state.questionChoices[key] === 'boolean' && state.questionChoices[key] === question.respuesta_correcta;
        } else if (question.tipo_interaccion === 'relacion_columnas') {
          isCorrect = checkMatchingQuestion(question, key);
        } else if (question.tipo_interaccion === 'drag_drop') {
          isCorrect = checkDragDropQuestion(question, key);
          if (!isCorrect) {
            rejectIncorrectDragMatches(question, key);
            return;
          }
        } else if (question.tipo_interaccion === 'ordenar_secuencia') {
          isCorrect = checkSequenceQuestion(question, key);
        } else {
          const answerInput = els.missionStage.querySelector('[data-question-answer="' + CSS.escape(key) + '"]');
          const answer = answerInput ? answerInput.value || '' : (state.questionAnswers[key] || '');
          state.questionAnswers[key] = answer;
          isCorrect = question.subtipo_respuesta === 'frase_libre'
            ? Boolean(String(answer).trim())
            : getQuestionAcceptedAnswers(question).includes(normalizePlayerAnswer(answer, question));
        }

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
    if (state.isStarted && !state.isFinished) return;
    const now = nowMs();
    state.durationSeconds = normalizeDurationSeconds(state.durationSeconds);
    state.isStarted = true;
    state.isFinished = false;
    state.startedAtMs = now;
    state.endAtMs = now + (state.durationSeconds * 1000);
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
    stopTimerInterval();
    stopAlertSound();
    state.unlocked = new Set(IS_MENU_MODE ? [] : ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id));
    state.completed = new Set();
    state.completedQuestions = new Set();
    state.readBriefings = new Set(ESCAPE_ROOM_DATA.misiones.filter((mission) => mission.contexto_requerido === false).map((mission) => mission.id));
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
    state.startedAtMs = null;
    state.endAtMs = null;
    state.remainingSecondsAtFinish = null;
    state.nowOverrideMs = null;
    setEditorialReviewAction("autofill");
    const input = document.getElementById("masterPasscodeInput");
    const statusBox = document.getElementById("masterStatusBox");
    if (input) input.value = "";
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
      masterSolved: state.isMasterSolved,
      remainingSeconds: getRemainingSeconds(),
      progress: {
        completed: state.completed.size,
        total: ESCAPE_ROOM_DATA.misiones.length
      },
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
            dragAssignments: question.tipo_interaccion === "drag_drop" ? { ...(state.questionDragMatches[key] || {}) } : undefined,
            dragLocked: question.tipo_interaccion === "drag_drop" ? { ...(state.questionDragLocked[key] || {}) } : undefined,
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
    syncEditorialReviewActionForCurrentScreen();
    renderGallery();
    renderMap();
    renderMission();
    updateProgress();
    updateTimerUi();
    updateAccessibleState();
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

  const editorialAutofillButton = document.querySelector("[data-editorial-autofill]");
  if (editorialAutofillButton && window.__ESCAPE_ROOM_EDITORIAL_REVIEW__ === true) {
    editorialAutofillButton.hidden = false;
    editorialAutofillButton.addEventListener("click", autocompleteCurrentScreen);
  }

  function extractFinalPasscode() {
    return ESCAPE_ROOM_FINAL_PASSCODE || null;
  }

  function verifyMasterPasscode() {
    const input = document.getElementById("masterPasscodeInput");
    const statusBox = document.getElementById("masterStatusBox");
    if (!input || !statusBox) return;

    const value = String(input.value || "").trim().toLowerCase();
    const finalCode = String(extractFinalPasscode() || "").trim().toLowerCase();

    if (value === finalCode) {
      statusBox.textContent = t("correctSystem");
      statusBox.className = "status-box is-good";
      statusBox.classList.remove("hidden");
      stopAlertSound();

      if (els.endingPanel) {
        els.endingPanel.classList.remove("is-alert");
        els.endingPanel.classList.add("is-success-flash");
      }

      setTimeout(() => {
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
      statusBox.textContent = t("incorrectSystem");
      statusBox.className = "status-box is-bad";
      statusBox.classList.remove("hidden");
    }
  }

  const btnVerify = document.getElementById("btnVerifyMasterPasscode");
  const inputPasscode = document.getElementById("masterPasscodeInput");
  if (btnVerify) {
    btnVerify.addEventListener("click", verifyMasterPasscode);
  }
  if (inputPasscode) {
    inputPasscode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        verifyMasterPasscode();
      }
    });
  }

  state.durationSeconds = normalizeDurationSeconds((ESCAPE_ROOM_DATA.duracion_minutos || DEFAULT_DURATION_MINUTES) * 60);
  restoreProgressState();
  if (state.isStarted && !state.isFinished && getRemainingSeconds() <= 0) {
    state.isFinished = true;
    state.remainingSecondsAtFinish = 0;
  }
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
  <img src="logo.png" alt="PigPen" class="game-logo-brand">
  ${buildFullscreenButton(messages)}
  <p id="gameLiveStatus" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
  <main class="game-shell">
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
            ${normalized.backgroundImage ? `<div class="menu-detail-media"><img src="${escapeHtmlAttr(normalized.backgroundImage)}" alt="${escapeHtmlAttr(normalized.titulo || messages.introduction)}"></div>` : buildSectionCardFallback("intro")}
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
              <p class="muted" style="margin-bottom: 25px;">${escapeHtml(messages.finalCodePrompt)}</p>
              <p class="final-code-reveal" style="margin-bottom: 18px;"><strong>${escapeHtml(msg("finalCodeReveal", { code: finalPasscode.code }))}</strong></p>
              <div class="button-row" style="justify-content: center; margin-bottom: 20px; align-items: center;">
                <label class="sr-only" for="masterPasscodeInput">${escapeHtml(messages.finalCode)}</label>
                <input class="field" type="text" id="masterPasscodeInput" placeholder="${escapeHtmlAttr(messages.finalCode)}" autocomplete="off" style="max-width: 220px; text-align: center; letter-spacing: 2px; font-weight: bold;">
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
  const normalized = hydrateAcademicMissionPalettes(normalizeEscapeRoomProject(project));
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
              <img src="${escapeHtmlAttr(normalized.backgroundImage)}" alt="${escapeHtmlAttr(normalized.titulo || "Escape room")}" loading="lazy">
            </div>`
    : "";
  const endingQuestionImage = normalized.misiones
    .flatMap((mission) => Array.isArray(mission.preguntas) ? mission.preguntas : [])
    .find((question) => question.media?.url && question.media.tipo === "imagen")?.media?.url
    || normalized.misiones
      .flatMap((mission) => Array.isArray(mission.preguntas) ? mission.preguntas : [])
      .find((question) => String(question.imagen || "").trim())?.imagen
    || "";
  const endingImageUrl = normalized.backgroundImage
    || normalized.misiones.find((mission) => mission.media?.url && mission.media.tipo === "imagen")?.media?.url
    || normalized.misiones.find((mission) => String(mission.imagen || "").trim())?.imagen
    || endingQuestionImage
    || "";
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
  <img src="logo.png" alt="Logo" class="game-logo-brand">
  ${buildFullscreenButton(messages)}
  <p id="gameLiveStatus" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
  <main class="game-shell">
    <header class="game-header">
      <button type="button" class="secondary is-concealed" data-gallery-prev aria-hidden="true" tabindex="-1" disabled>${escapeHtml(messages.previous)}</button>
      <div class="game-header-center">
        <div class="gallery-step" id="galleryStep">${escapeHtml(msg("sectionCounter", { current: 1, total: 3 }))}</div>
      </div>
      <button type="button" class="secondary" data-gallery-next>${escapeHtml(messages.next)}</button>
    </header>
    <div class="timer-shell timer-fab is-ready" data-timer-shell aria-label="${escapeHtmlAttr(messages.countdown)}"><strong class="timer-value" data-timer-value>${formatDuration((normalized.duracion_minutos || 35) * 60)}</strong></div>
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
              <p class="muted" style="margin-bottom: 25px;">${escapeHtml(messages.finalCodePrompt)}</p>
              <p class="final-code-reveal" style="margin-bottom: 18px;"><strong>${escapeHtml(msg("finalCodeReveal", { code: finalPasscode.code }))}</strong></p>
              <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; align-items: center;">
                <input type="text" id="masterPasscodeInput" placeholder="${escapeHtmlAttr(messages.finalCode)}" style="padding: 12px 20px; border-radius: 12px; border: 2px solid var(--line); background: var(--panel-soft); color: var(--text); font-size: 1.5rem; text-align: center; width: 180px; letter-spacing: 2px; font-weight: bold; outline: none; transition: border-color 0.2s;" />
                <button type="button" class="primary" id="btnVerifyMasterPasscode" style="padding: 12px 24px; border-radius: 12px; font-weight: bold;">${escapeHtml(messages.deactivate)}</button>
              </div>
              <div id="masterStatusBox" class="status-box hidden" style="margin-top: 15px; padding: 10px; border-radius: 8px;"></div>
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
  const normalized = hydrateAcademicMissionPalettes(normalizeEscapeRoomProject(project));
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
    ? `<button type="button" data-editorial-autofill data-editorial-action="autofill" aria-label="${escapeHtmlAttr(messages.autofillAllAnswers)}" hidden style="position: fixed; right: 20px; bottom: 20px; z-index: 9999; border: 0; border-radius: 999px; padding: 12px 16px; background: #ec4899; color: #fff; font-weight: 700; box-shadow: 0 12px 30px rgba(236,72,153,.35);">${escapeHtml(messages.autofillScreen)}</button>`
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
  <script>${buildGameRuntime(normalized).replace(/<\/script/gi, "<\\/script")}<\/script>
</body>
</html>`;
}

export function buildEscapeRoomPackage(project) {
  const normalized = hydrateAcademicMissionPalettes(normalizeEscapeRoomProject(project));
  const files = {};
  const mediaFolder = "assets/media";

  if (normalized.backgroundImage?.startsWith("data:")) {
    normalized.backgroundImage = extractDataUrlAsset(
      files,
      normalized.backgroundImage,
      `${mediaFolder}/${sanitizeFileName(normalized.titulo, "escape-room")}-background`,
      "png"
    );
  }

  normalized.misiones.forEach((mission, missionIndex) => {
    extractMissionAssets(files, mediaFolder, mission, missionIndex);
  });

  files["index.html"] = buildGameHtml(normalized);
  files["assets/game.css"] = buildGameCss({ ...normalized, themeConfig: normalized.themeConfig });
  files["assets/game.js"] = buildGameRuntime(normalized);
  files["assets/escape-room.json"] = JSON.stringify(normalized, null, 2);

  return {
    downloadName: sanitizeFileName(`EscapeRoom_${normalized.titulo}`, "EscapeRoom"),
    files
  };
}
