import { normalizeEscapeRoomProject, getMissionAcceptedAnswers } from "./escape-room-creator-model.mjs";

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

function resolveGameTheme(themeConfig = {}) {
  return {
    titleColor: String(themeConfig.titleColor || "#f5eefe"),
    subtitleColor: String(themeConfig.subtitleColor || "#e9d5ff"),
    paragraphColor: String(themeConfig.paragraphColor || "#c7b9db"),
    backgroundColor: String(themeConfig.backgroundColor || "#12091d"),
    cardColor: String(themeConfig.cardColor || "#23143d"),
    elevatedCardColor: String(themeConfig.elevatedCardColor || themeConfig.cardColor || "#2b1749"),
    cardRadius: clampThemeNumber(themeConfig.cardRadius, 0, 40, 22),
    titleSize: clampThemeNumber(themeConfig.titleSize, 24, 72, 46),
    subtitleSize: clampThemeNumber(themeConfig.subtitleSize, 14, 40, 22),
    paragraphSize: clampThemeNumber(themeConfig.paragraphSize, 12, 28, 16),
    buttonColor: String(themeConfig.buttonColor || "#a855f7"),
    buttonTextColor: String(themeConfig.buttonTextColor || "#ffffff"),
    accentColor: String(themeConfig.accentColor || themeConfig.buttonColor || "#7c3aed"),
    accentStrong: String(themeConfig.accentStrong || themeConfig.buttonColor || "#a855f7"),
    accentSoft: String(themeConfig.accentSoft || themeConfig.cardColor || "#3b1d63"),
    successColor: String(themeConfig.successColor || "#34d399"),
    warningColor: String(themeConfig.warningColor || "#f59e0b"),
    dangerColor: String(themeConfig.dangerColor || "#fb7185")
  };
}

export function buildGameCss(projectOrTheme = {}) {
  const theme = resolveGameTheme(projectOrTheme?.themeConfig || projectOrTheme);
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
.game-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px 24px;
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
  gap: 12px;
  padding: 0.78rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-soft) 88%, white 12%);
}
.timer-shell.is-ready {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
.timer-shell.is-running {
  border-color: color-mix(in srgb, var(--success) 34%, transparent);
}
.timer-shell.is-warning {
  border-color: color-mix(in srgb, var(--warn) 36%, transparent);
}
.timer-shell.is-expired {
  border-color: color-mix(in srgb, var(--danger) 36%, transparent);
}
.timer-copy {
  display: grid;
  gap: 2px;
}
.timer-label {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 800;
}
.timer-value {
  font-size: 1rem;
  font-weight: 900;
  color: var(--text);
  letter-spacing: 0.04em;
}
.timer-status {
  font-size: 0.78rem;
  color: var(--muted);
  font-weight: 700;
}
.timer-fab {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 60;
  min-width: 220px;
  justify-content: space-between;
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
.room-status-box {
  margin-top: 8px;
}
.question-response-row {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.question-response-row.is-inline-answer {
  flex-wrap: nowrap;
  align-items: center;
}
.question-response-row.is-inline-answer .question-challenge {
  flex: 0 0 auto;
}
.question-response-row.is-inline-answer .question-actions {
  margin-left: 0;
  width: auto;
}
.question-challenge {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  flex: 1 1 360px;
  min-width: 0;
}
.question-challenge .choice-grid,
.question-challenge .match-grid {
  grid-template-columns: 1fr;
}
.question-challenge .match-row-grid {
  grid-template-columns: 1fr;
}
.question-response-row .question-actions {
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  align-self: flex-end;
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
.question-card .media-card {
  margin-top: 12px;
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
.label {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.68rem;
  color: var(--accent-3);
  font-weight: 800;
}
h1, h2, h3, p { margin-top: 0; }
.title { font-size: clamp(2rem, 4vw, ${theme.titleSize}px); line-height: 1.04; margin: 10px 0 12px; color: var(--title-color); }
.subtitle { color: var(--subtitle-color); line-height: 1.5; font-size: ${theme.subtitleSize}px; }
.muted, .status-note, .mission-story, .map-help { color: var(--paragraph-color); line-height: 1.6; font-size: ${theme.paragraphSize}px; }
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
  border: 1px solid var(--line);
  border-bottom-color: color-mix(in srgb, var(--title-color) 22%, transparent);
  border-radius: var(--radius-md);
  background: var(--panel);
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
.choice-card { padding: 14px; cursor: pointer; }
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
}
.match-select:focus { outline: none; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); border-color: color-mix(in srgb, var(--accent) 58%, transparent); }
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
  font-weight: 800;
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
.hidden { display: none !important; }
@media (max-width: 900px) {
  .game-shell {
    padding: 0 14px 14px;
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
    font-size: 0.92rem;
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
    margin-top: 10px;
  }
  .question-title {
    font-size: 1.02rem;
  }
  .question-response-row {
    flex-direction: column;
    gap: 10px;
  }
  .question-response-row.is-inline-answer {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
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
    width: min(100%, 150px);
  }
  .field.question-answer-input.is-number {
    width: min(100%, 180px);
  }
  .choice-grid {
    grid-template-columns: 1fr;
  }
  .timer-fab {
    right: 14px;
    left: 14px;
    bottom: 14px;
    min-width: 0;
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
    width: auto;
    align-self: center;
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
}

@media (max-width: 560px) {
  .game-shell {
    padding: 0 10px 10px;
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
    font-size: 0.84rem;
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
  .button-row {
    gap: 8px;
  }
  .hero-status-row {
    align-items: flex-start;
  }
  .timer-shell {
    width: 100%;
    justify-content: space-between;
  }
  button {
    padding: 0.72rem 0.84rem;
    border-radius: 12px;
  }
}
`;
}

export function buildGameRuntime(project) {
  const normalized = normalizeEscapeRoomProject(project);
  const initialUnlocked = normalized.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id);
  const runtimeProject = {
    ...normalized,
    misiones: normalized.misiones.map((mission) => buildRuntimeMission(mission, initialUnlocked))
  };

  return `const ESCAPE_ROOM_DATA = ${JSON.stringify(runtimeProject, null, 2)};

// Runtime de mapa libre: las salas desbloqueadas se eligen en cualquier orden permitido.
(function initEscapeRoomGame() {
  const DEFAULT_DURATION_MINUTES = ${JSON.stringify(normalized.duracion_minutos || 35)};
  const state = {
    unlocked: new Set(ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id)),
    completed: new Set(),
    completedQuestions: new Set(),
    questionAnswers: {},
    questionChoices: {},
    questionMatches: {},
    currentMissionId: ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null,
    galleryScreen: "intro",
    missionEventsBound: false,
    durationSeconds: 0,
    isStarted: false,
    isFinished: false,
    startedAtMs: null,
    endAtMs: null,
    timerIntervalId: null
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

  function getProgressStorageKey() {
    const slug = normalizeBaseText(ESCAPE_ROOM_DATA.titulo || "escape-room") || "escape-room";
    return "escapeRoomGame.progress." + slug;
  }

  function serializeProgressState() {
    return {
      completed: [...state.completed],
      completedQuestions: [...state.completedQuestions],
      questionAnswers: state.questionAnswers,
      questionChoices: state.questionChoices,
      questionMatches: state.questionMatches,
      currentMissionId: state.currentMissionId,
      galleryScreen: state.galleryScreen,
      unlocked: [...state.unlocked],
      durationSeconds: state.durationSeconds,
      isStarted: state.isStarted,
      isFinished: state.isFinished,
      startedAtMs: state.startedAtMs,
      endAtMs: state.endAtMs
    };
  }

  function saveProgressState() {
    if (!isStorageAvailable()) return;
    try {
      window.localStorage.setItem(getProgressStorageKey(), JSON.stringify(serializeProgressState()));
    } catch (error) {
      console.warn("No se pudo guardar el avance del escape room:", error);
    }
  }

  function restoreProgressState() {
    if (!isStorageAvailable()) return;
    const raw = window.localStorage.getItem(getProgressStorageKey());
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const missionIds = new Set(ESCAPE_ROOM_DATA.misiones.map((mission) => mission.id));
      state.completed = new Set(Array.isArray(parsed.completed) ? parsed.completed.filter((id) => missionIds.has(id)) : []);
      state.completedQuestions = new Set(Array.isArray(parsed.completedQuestions) ? parsed.completedQuestions.filter((key) => String(key || "").includes("::")) : []);
      state.questionAnswers = parsed.questionAnswers && typeof parsed.questionAnswers === "object" ? parsed.questionAnswers : {};
      state.questionChoices = parsed.questionChoices && typeof parsed.questionChoices === "object" ? parsed.questionChoices : {};
      state.questionMatches = parsed.questionMatches && typeof parsed.questionMatches === "object" ? parsed.questionMatches : {};
      state.unlocked = new Set(Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => missionIds.has(id)) : ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id));
      state.currentMissionId = missionIds.has(parsed.currentMissionId) ? parsed.currentMissionId : (ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null);
      state.galleryScreen = ["intro", "mission", "ending"].includes(parsed.galleryScreen) ? parsed.galleryScreen : "intro";
      state.durationSeconds = normalizeDurationSeconds(parsed.durationSeconds);
      state.isStarted = parsed.isStarted === true;
      state.isFinished = parsed.isFinished === true;
      state.startedAtMs = Number.isFinite(Number(parsed.startedAtMs)) ? Number(parsed.startedAtMs) : null;
      state.endAtMs = Number.isFinite(Number(parsed.endAtMs)) ? Number(parsed.endAtMs) : null;
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
    timerStatuses: Array.from(document.querySelectorAll("[data-timer-status]")),
    startButtons: Array.from(document.querySelectorAll("[data-game-start]")),
    resetButtons: Array.from(document.querySelectorAll("[data-game-reset]"))
  };

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
    return /^data:/i.test(url) || /^assets\\\//i.test(url) || /^\\\.{0,2}\\\//.test(url);
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
    if (!state.isStarted || !state.endAtMs) return state.durationSeconds;
    return Math.max(0, Math.ceil((state.endAtMs - Date.now()) / 1000));
  }

  function stopTimerInterval() {
    if (!state.timerIntervalId) return;
    window.clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }

  function setGameInteractionState(isDisabled) {
    const disabled = Boolean(isDisabled);
    const targets = document.querySelectorAll(
      "[data-question-choice], [data-question-verify], [data-question-hint], [data-question-match-select], [data-question-answer]"
    );
    targets.forEach((node) => {
      if ("disabled" in node) node.disabled = disabled;
      if (disabled) node.setAttribute("aria-disabled", "true");
      else node.removeAttribute("aria-disabled");
    });
  }

  function updateTimerUi() {
    const remainingSeconds = getRemainingSeconds();
    const isExpired = state.isFinished || (state.isStarted && remainingSeconds <= 0);
    const shellState = isExpired
      ? "is-expired"
      : !state.isStarted
        ? "is-ready"
        : remainingSeconds <= 300
          ? "is-warning"
          : "is-running";
    const statusText = isExpired
      ? "Tiempo agotado"
      : !state.isStarted
        ? "Listo para iniciar"
        : "Escape room en curso";

    els.timerShells.forEach((shell) => {
      shell.classList.remove("is-ready", "is-running", "is-warning", "is-expired");
      shell.classList.add(shellState);
    });
    els.timerValues.forEach((node) => {
      node.textContent = formatDuration(remainingSeconds);
    });
    els.timerStatuses.forEach((node) => {
      node.textContent = statusText;
    });
    els.startButtons.forEach((button) => {
      button.hidden = state.isStarted;
      button.disabled = state.isStarted;
      button.textContent = state.isStarted ? "Escape room iniciado" : "Iniciar escape room";
    });
    els.resetButtons.forEach((button) => {
      button.disabled = false;
    });
    setGameInteractionState(!state.isStarted || isExpired);
  }

  function handleTimeExpired() {
    stopTimerInterval();
    state.isFinished = true;
    state.endAtMs = Date.now();
    state.galleryScreen = "mission";
    updateTimerUi();
    persistProgressState();
    if (els.roomStatusBox) {
      setRoomStatus("El tiempo terminó. Reinicia el escape room para volver a intentarlo.", "bad");
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
    return Array.isArray(mission?.respuestas_aceptadas)
      ? mission.respuestas_aceptadas.map((value) => normalizeBaseText(value)).filter(Boolean)
      : [];
  }

  function missionById(id) {
    return ESCAPE_ROOM_DATA.misiones.find((mission) => mission.id === id) || null;
  }

  function areAllMissionsCompleted() {
    return state.completed.size === ESCAPE_ROOM_DATA.misiones.length;
  }

  function renderGallery() {
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
      els.galleryStep.textContent = "Sección " + (activeIndex + 1) + " de " + galleryOrder.length;
    }

    els.galleryPrevButtons.forEach((button) => {
      button.disabled = state.galleryScreen === "intro";
    });

    els.galleryNextButtons.forEach((button) => {
      if (state.galleryScreen === "intro") {
        button.disabled = false;
        button.textContent = "Siguiente";
        return;
      }
      if (state.galleryScreen === "mission") {
        const complete = areAllMissionsCompleted();
        button.disabled = !complete;
        button.textContent = complete ? "Ver victoria" : "Completa todas las salas";
        return;
      }
      button.disabled = true;
      button.textContent = "Final";
    });

    if (els.endingPanel) {
      const shouldShowEnding = state.galleryScreen === "ending" && areAllMissionsCompleted();
      els.endingPanel.classList.toggle("hidden", !shouldShowEnding);
    }

    updateTimerUi();
    persistProgressState();
  }

  function setGalleryScreen(screenName = "intro") {
    const galleryOrder = ["intro", "mission", "ending"];
    const nextScreen = galleryOrder.includes(screenName) ? screenName : "intro";
    if (nextScreen === "ending" && !areAllMissionsCompleted()) return;
    state.galleryScreen = nextScreen;
    renderGallery();
  }

  function goToPreviousGalleryScreen() {
    if (state.galleryScreen === "mission") setGalleryScreen("intro");
    else if (state.galleryScreen === "ending") setGalleryScreen("mission");
  }

  function goToNextGalleryScreen() {
    if (state.galleryScreen === "intro") setGalleryScreen("mission");
    else if (state.galleryScreen === "mission" && areAllMissionsCompleted()) setGalleryScreen("ending");
  }

  function updateProgress() {
    const total = ESCAPE_ROOM_DATA.misiones.length || 1;
    const done = state.completed.size;
    const percent = Math.min((done / total) * 100, 100);
    if (els.progressText) els.progressText.textContent = done + " / " + total;
    if (els.progressBar) els.progressBar.style.width = percent + "%";
  }

  function renderMap() {
    if (!els.mapGrid) return;
    const target = els.mapGrid;
    target.innerHTML = "";
    ESCAPE_ROOM_DATA.misiones.forEach((mission, index) => {
      const locked = !state.unlocked.has(mission.id);
      const complete = state.completed.has(mission.id);
      const active = state.currentMissionId === mission.id;
      const roomLabel = \`Sala \${String(index + 1).padStart(2, "0")}\`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = \`map-card \${locked ? "is-locked" : ""} \${complete ? "is-complete" : ""} \${active ? "is-active" : ""}\`;
      button.dataset.openMission = mission.id;
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
      });
    });
  }

  function getRoomQuestions(mission) {
    return Array.isArray(mission?.preguntas) && mission.preguntas.length ? mission.preguntas : [];
  }

  function getQuestionKey(mission, question) {
    return String(mission?.id || "mission") + "::" + String(question?.id || "question");
  }

  function getQuestionAcceptedAnswers(question) {
    return Array.isArray(question?.respuestas_aceptadas)
      ? question.respuestas_aceptadas.map((value) => normalizeBaseText(value)).filter(Boolean)
      : [];
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
      palabra: "Escribe una palabra",
      letra: "Escribe una letra",
      numero: "Escribe un numero",
      codigo_corto: "Escribe el codigo",
      frase_corta: "Escribe tu respuesta"
    };
    const maxLength = question.subtipo_respuesta === "letra" ? 1 : "";
    const type = question.subtipo_respuesta === "numero" ? "number" : "text";
    const inputClass = 'field question-answer-input' + (question.subtipo_respuesta === "numero" ? ' is-number' : '');
    const currentValue = state.questionAnswers[key] || "";
    return '<input id="questionAnswer-' + escapeHtmlAttr(key) + '" class="' + inputClass + '" data-question-answer="' + escapeHtmlAttr(key) + '" type="' + type + '"' + (maxLength ? ' maxlength="' + maxLength + '"' : '') + ' value="' + escapeHtmlAttr(currentValue) + '" placeholder="' + escapeHtmlAttr(placeholderBySubtype[question.subtipo_respuesta] || "Escribe tu respuesta") + '">';
  }

  function renderMissionChoiceBlock(question, key) {
    const selected = Number(state.questionChoices[key] ?? -1);
    return '<div class="choice-grid">' + question.opciones.map((option, index) => {
      const isSelected = selected === index ? ' is-selected' : '';
      return '<button type="button" class="choice-card' + isSelected + '" data-question-choice="' + escapeHtmlAttr(key) + '" data-choice-index="' + index + '">' + escapeHtml(option) + '</button>';
    }).join('') + '</div>';
  }

  function renderMissionMatchingBlock(question, key) {
    const selections = state.questionMatches[key] || {};
    const options = [...question.parejas]
      .map((pair) => pair.derecha)
      .sort((a, b) => a.localeCompare(b, "es"));
    const rows = question.parejas.map((pair, index) => {
      const currentValue = selections[String(index)] || "";
      return '<div class="match-row-grid"><div class="match-item">' + escapeHtml(pair.izquierda) + '</div><select class="match-select" data-question-match-select="' + escapeHtmlAttr(key) + '" data-match-index="' + index + '"><option value="">Selecciona una opcion</option>' + options.map((option) => '<option value="' + escapeHtmlAttr(option) + '"' + (currentValue === option ? ' selected' : '') + '>' + escapeHtml(option) + '</option>').join('') + '</select></div>';
    }).join('');
    return '<div class="match-grid">' + rows + '</div>';
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
    if (question.tipo_interaccion === "relacion_columnas") return renderMissionMatchingBlock(question, key);
    return renderMissionTextBlock(question, key);
  }

  function renderQuestionCard(mission, question, questionIndex) {
    const key = getQuestionKey(mission, question);
    const total = getRoomQuestions(mission).length || 1;
    const complete = state.completedQuestions.has(key);
    const cardClass = 'mission-panel question-card' + (complete ? ' is-complete' : '');
    const statusText = complete ? (question.retroalimentacion_correcta || 'Correcto.') : 'Resuelve esta pregunta para avanzar.';
    const mediaHtml = renderQuestionMedia(question, question.reto);
    const interactionHtml = complete ? '<div class="status-box is-good">Pregunta completada.</div>' : renderQuestionInteraction(question, key);
    const isInlineAnswer = question.tipo_interaccion === 'texto' && question.subtipo_respuesta === 'numero';
    const responseRowClass = 'question-response-row' + (isInlineAnswer ? ' is-inline-answer' : '');
    return '<article class="' + cardClass + '" data-question-card data-question-key="' + escapeHtmlAttr(key) + '">' +
      '<div class="question-head">' +
        '<div>' +
          '<div class="label">Pregunta ' + String(questionIndex + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0') + '</div>' +
          '<h3 class="question-title">' + escapeHtml(question.titulo) + '</h3>' +
        '</div>' +
      '</div>' +
      '<p class="question-story">' + escapeHtml(question.reto) + '</p>' +
      (mediaHtml ? mediaHtml : '') +
      '<div class="' + responseRowClass + '">' +
        '<div class="question-challenge">' + interactionHtml + '</div>' +
        '<div class="button-row question-actions">' +
          '<button type="button" class="primary" data-question-verify="' + escapeHtmlAttr(key) + '"' + (complete ? ' disabled' : '') + '>' + (complete ? 'Completada' : 'Verificar') + '</button>' +
          '<button type="button" class="secondary" data-question-hint="' + escapeHtmlAttr(key) + '"' + (complete ? ' disabled' : '') + '>Ver pista</button>' +
        '</div>' +
      '</div>' +
      '<div class="hint-box hidden" data-question-hint-box="' + escapeHtmlAttr(key) + '">' + escapeHtml(question.pista) + '</div>' +
      '<div class="status-box" data-question-status="' + escapeHtmlAttr(key) + '">' + escapeHtml(statusText) + '</div>' +
    '</article>';
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
    if (verify) verify.textContent = 'Completada';
  }

  function checkMatchingQuestion(question, key) {
    const selected = state.questionMatches[key] || {};
    const selectedValues = Object.values(selected).filter(Boolean);
    if (selectedValues.length !== question.parejas.length) return false;
    if (new Set(selectedValues).size !== question.parejas.length) return false;
    return question.parejas.every((pair, index) => selected[String(index)] === pair.derecha);
  }

  function markQuestionComplete(mission, question) {
    const key = getQuestionKey(mission, question);
    state.completedQuestions.add(key);
    setQuestionCardCompleteState(key);
    setQuestionStatus(key, question.retroalimentacion_correcta || 'Correcto.', 'good');
    persistProgressState();
    const completedCount = getCompletedQuestionCount(mission);
    const totalQuestions = getRoomQuestions(mission).length || 1;
    if (els.questionProgress) {
      els.questionProgress.innerHTML = 'Preguntas resueltas: <strong>' + completedCount + ' / ' + totalQuestions + '</strong>';
    }
    if (areMissionQuestionsCompleted(mission)) {
      markMissionComplete(mission);
      setRoomStatus('Sala completada. Se desbloquearon nuevas rutas.', 'good');
      renderMission();
      return;
    }
    setRoomStatus('Continúa resolviendo las preguntas de esta sala.', 'info');
  }

  function renderMission() {
    if (!els.missionStage) return;
    const mission = missionById(state.currentMissionId);
    if (!mission) {
      els.missionStage.innerHTML = '';
      if (els.questionProgress) {
        els.questionProgress.innerHTML = 'Preguntas resueltas: <strong>0 / 0</strong>';
      }
      return;
    }

    const questions = getRoomQuestions(mission);
    const completedCount = getCompletedQuestionCount(mission);
    const roomComplete = areMissionQuestionsCompleted(mission);
    const roomStatusText = roomComplete ? 'Sala completada. Listo para avanzar.' : 'Resuelve las preguntas en cualquier orden para desbloquear la siguiente sala.';
    const questionCards = questions.map((question, index) => renderQuestionCard(mission, question, index)).join('');

    if (els.questionProgress) {
      els.questionProgress.innerHTML = 'Preguntas resueltas: <strong>' + completedCount + ' / ' + questions.length + '</strong>';
    }

    els.missionStage.innerHTML =
      '<section class="mission-panel">' +
        '<h2 class="mission-title">' + escapeHtml(mission.titulo) + '</h2>' +
        '<p class="mission-story">' + escapeHtml(mission.historia) + '</p>' +
        '<div class="mission-layout">' +
          renderQuestionMedia(mission, mission.reto) +
          '<div class="label">Reto</div>' +
          '<div class="challenge-box">' + escapeHtml(mission.reto) + '</div>' +
          '<div class="status-box room-status-box" id="roomStatusBox">' + roomStatusText + '</div>' +
        '</div>' +
        '<div class="question-list">' + questionCards + '</div>' +
      '</section>';

    els.questionProgress = document.getElementById('questionProgress');
    els.roomStatusBox = document.getElementById('roomStatusBox');
    wireMissionEvents();
  }

  function markMissionComplete(mission) {
    state.completed.add(mission.id);
    (mission.desbloquea || []).forEach((targetId) => state.unlocked.add(targetId));
    persistProgressState();
    updateProgress();
    renderMap();
    if (areAllMissionsCompleted()) {
      setGalleryScreen('ending');
      return;
    }
    renderGallery();
  }

  function wireMissionEvents() {
    if (!els.missionStage || state.missionEventsBound) return;
    state.missionEventsBound = true;

    els.missionStage.addEventListener('click', (event) => {
      const hintButton = event.target.closest('[data-question-hint]');
      if (hintButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? 'El tiempo terminó. Reinicia el escape room para volver a jugar.' : 'Primero inicia el escape room para interactuar.', state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = hintButton.getAttribute('data-question-hint');
        const hintBox = els.missionStage?.querySelector('[data-question-hint-box="' + CSS.escape(key || '') + '"]');
        if (hintBox) hintBox.classList.remove('hidden');
        setQuestionStatus(key || '', 'Pista revelada. Ajusta tu lectura del reto.', 'good');
        return;
      }

      const choiceButton = event.target.closest('[data-question-choice]');
      if (choiceButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? 'El tiempo terminó. Reinicia el escape room para volver a jugar.' : 'Primero inicia el escape room para interactuar.', state.isFinished ? 'bad' : 'info');
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

      const verifyButton = event.target.closest('[data-question-verify]');
      if (verifyButton) {
        if (!state.isStarted || state.isFinished) {
          setRoomStatus(state.isFinished ? 'El tiempo terminó. Reinicia el escape room para volver a jugar.' : 'Primero inicia el escape room para resolver las preguntas.', state.isFinished ? 'bad' : 'info');
          return;
        }
        const key = verifyButton.getAttribute('data-question-verify') || '';
        const mission = missionById(state.currentMissionId);
        if (!mission) return;
        const question = getRoomQuestions(mission).find((item) => getQuestionKey(mission, item) === key);
        if (!question) return;
        if (state.completedQuestions.has(key)) {
          setQuestionStatus(key, 'Esta pregunta ya estaba completada.', 'good');
          return;
        }

        let isCorrect = false;
        if (question.tipo_interaccion === 'opcion_multiple') {
          const selectedIndex = Number(state.questionChoices[key] ?? -1);
          const selected = question.opciones[selectedIndex] || '';
          isCorrect = getQuestionAcceptedAnswers(question).includes(normalizePlayerAnswer(selected, question));
        } else if (question.tipo_interaccion === 'relacion_columnas') {
          isCorrect = checkMatchingQuestion(question, key);
        } else {
          const answerInput = els.missionStage.querySelector('[data-question-answer="' + CSS.escape(key) + '"]');
          const answer = answerInput ? answerInput.value || '' : (state.questionAnswers[key] || '');
          state.questionAnswers[key] = answer;
          isCorrect = getQuestionAcceptedAnswers(question).includes(normalizePlayerAnswer(answer, question));
        }

        if (isCorrect) {
          markQuestionComplete(mission, question);
          return;
        }

        setQuestionStatus(key, question.retroalimentacion_incorrecta || 'Respuesta incorrecta. Intenta otra vez.', 'bad');
      }
    });

    els.missionStage.addEventListener('change', (event) => {
      const select = event.target.closest('[data-question-match-select]');
      if (!select) return;
      if (!state.isStarted || state.isFinished) {
        event.preventDefault();
        setRoomStatus(state.isFinished ? 'El tiempo terminó. Reinicia el escape room para volver a jugar.' : 'Primero inicia el escape room para interactuar.', state.isFinished ? 'bad' : 'info');
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
    const now = Date.now();
    state.durationSeconds = normalizeDurationSeconds(state.durationSeconds);
    state.isStarted = true;
    state.isFinished = false;
    state.startedAtMs = now;
    state.endAtMs = now + (state.durationSeconds * 1000);
    state.galleryScreen = "mission";
    ensureTimerInterval();
    persistProgressState();
    render();
  }

  function resetEscapeRoom() {
    stopTimerInterval();
    state.unlocked = new Set(ESCAPE_ROOM_DATA.misiones.filter((mission) => !mission.bloqueada_inicial).map((mission) => mission.id));
    state.completed = new Set();
    state.completedQuestions = new Set();
    state.questionAnswers = {};
    state.questionChoices = {};
    state.questionMatches = {};
    state.currentMissionId = ESCAPE_ROOM_DATA.misiones.find((mission) => !mission.bloqueada_inicial)?.id || ESCAPE_ROOM_DATA.misiones[0]?.id || null;
    state.galleryScreen = "intro";
    state.durationSeconds = normalizeDurationSeconds(DEFAULT_DURATION_MINUTES * 60);
    state.isStarted = false;
    state.isFinished = false;
    state.startedAtMs = null;
    state.endAtMs = null;
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

  function render() {
    renderGallery();
    renderMap();
    renderMission();
    updateProgress();
    updateTimerUi();
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

  state.durationSeconds = normalizeDurationSeconds((ESCAPE_ROOM_DATA.duracion_minutos || DEFAULT_DURATION_MINUTES) * 60);
  restoreProgressState();
  if (state.isStarted && !state.isFinished && getRemainingSeconds() <= 0) {
    state.isFinished = true;
  }
  ensureTimerInterval();
  window.addEventListener("beforeunload", persistProgressState);
  window.addEventListener("pagehide", persistProgressState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistProgressState();
  });
  render();
})();
`;
}

export function buildGameHtml(project) {
  const normalized = normalizeEscapeRoomProject(project);
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
          <img src="${escapeHtmlAttr(endingImageUrl)}" alt="${escapeHtmlAttr(normalized.titulo || "Escape room completado")}">
        </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="assets/game.css">
</head>
<body>
  <main class="game-shell">
    <header class="game-header">
      <button type="button" class="secondary" data-gallery-prev>Anterior</button>
      <div class="game-header-center">
        <div class="gallery-step" id="galleryStep">Sección 1 de 3</div>
      </div>
      <button type="button" class="secondary" data-gallery-next>Siguiente</button>
    </header>
    <div class="timer-shell timer-fab is-ready" data-timer-shell>
      <div class="timer-copy">
        <span class="timer-label">Temporizador</span>
        <strong class="timer-value" data-timer-value>${formatDuration((normalized.duracion_minutos || 35) * 60)}</strong>
      </div>
      <span class="timer-status" data-timer-status>Listo para iniciar</span>
    </div>
    <section class="game-card">
      <div class="gallery-stage">
        <section class="gallery-screen is-active" data-gallery-screen="intro">
          <section class="hero-panel">
            <div class="label">Arena eSports</div>
            <h1 class="title">${title}</h1>
            <p class="subtitle">${subtitle}</p>
            <p class="muted">${introduction}</p>
            <div class="hero-controls">
              <button type="button" class="primary" data-game-start>Iniciar escape room</button>
              <button type="button" class="secondary" data-game-reset>Reiniciar escape room</button>
            </div>
            ${heroImageHtml}
            <div class="progress-shell">
              <div class="progress-bar"><span id="progressBar"></span></div>
              <p class="status-note">Progreso <strong id="progressText">0 / ${normalized.misiones.length}</strong></p>
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
            <div class="label">Victoria</div>
            <h2>Escape room completado</h2>
            ${endingImageHtml}
            <p class="muted">${conclusion}</p>
          </section>
        </section>
      </div>
    </section>
  </main>
  <script src="assets/game.js"></script>
</body>
</html>`;
}

export function buildPreviewDocument(project) {
  const normalized = normalizeEscapeRoomProject(project);
  const fullHtml = buildGameHtml(normalized);
  const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<script src="assets\/game\.js"><\/script>\s*<\/body>/i);
  const bodyContent = bodyMatch?.[1] || "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(normalized.titulo)}</title>
  <style>${buildGameCss(project)}</style>
</head>
<body>
  ${bodyContent}
  <script>${buildGameRuntime(normalized)}<\/script>
</body>
</html>`;
}

export function buildEscapeRoomPackage(project) {
  const normalized = normalizeEscapeRoomProject(project);
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
  files["assets/game.css"] = buildGameCss(project);
  files["assets/game.js"] = buildGameRuntime(normalized);
  files["assets/escape-room.json"] = JSON.stringify(normalized, null, 2);

  return {
    downloadName: sanitizeFileName(`EscapeRoom_${normalized.titulo}`, "EscapeRoom"),
    files
  };
}
