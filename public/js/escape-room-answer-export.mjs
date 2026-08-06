function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLES = Object.freeze({
  root: "max-width:860px;margin:0 auto;background:#ffffff;border:1px solid #dfe4ec;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;box-sizing:border-box;",
  documentHead: "padding:20px 24px 16px;border-top:4px solid #172033;border-bottom:1px solid #dfe4ec;",
  eyebrow: "display:block;margin:0 0 3px;color:#2563eb;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;",
  documentTitle: "margin:0;font-size:22px;line-height:1.15;color:#172033;",
  documentMeta: "margin:5px 0 0;color:#667085;font-size:11px;",
  topic: "padding:18px 24px;border-bottom:1px solid #dfe4ec;",
  topicHead: "margin:0 0 12px;",
  topicTitle: "margin:0;font-size:17px;line-height:1.2;color:#172033;",
  count: "margin:3px 0 0;color:#667085;font-size:11px;",
  mission: "margin:10px 0 0;border:1px solid #dfe4ec;border-radius:6px;overflow:hidden;",
  missionHead: "padding:8px 10px;background:#ffffff;border-bottom:1px solid #dfe4ec;",
  missionLabel: "display:inline;margin-right:8px;color:#2563eb;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;",
  missionTitle: "display:inline;margin:0;color:#172033;font-size:13px;line-height:1.3;",
  question: "padding:9px 11px;border-bottom:1px solid #edf0f4;",
  questionGrid: "display:table;width:100%;border-collapse:collapse;",
  questionIndex: "display:table-cell;width:34px;padding:1px 8px 0 0;color:#98a2b3;font-family:monospace;font-size:10px;font-weight:700;vertical-align:top;",
  questionBody: "display:table-cell;vertical-align:top;",
  questionTitle: "margin:0;color:#172033;font-size:12px;line-height:1.3;",
  prompt: "margin:2px 0 5px;color:#475467;font-size:11px;",
  answerLabel: "margin-right:7px;color:#667085;font-size:9px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;",
  answer: "color:#172033;font-size:12px;font-weight:700;",
  variants: "margin:3px 0 0;color:#667085;font-size:10px;",
  variantsLabel: "font-weight:700;color:#475467;",
  pairTable: "width:100%;margin:3px 0 0;border-collapse:collapse;font-size:11px;",
  pairLeft: "width:48%;padding:3px 6px;background:#f8fafc;border:1px solid #e5e7eb;font-weight:600;",
  pairArrow: "width:4%;padding:3px;color:#98a2b3;text-align:center;",
  pairRight: "width:48%;padding:3px 6px;background:#ffffff;border:1px solid #e5e7eb;color:#172033;font-weight:700;",
  empty: "margin:0;padding:10px;color:#98a2b3;font-size:11px;font-style:italic;"
});

const STATION_COLORS = Object.freeze(["#fcc659", "#bbd152", "#e95297", "#02b0a3"]);

function normalizeHexColor(value = "", fallback = "#2563eb") {
  const raw = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return fallback;
}

function mixHex(color, target = "#ffffff", ratio = 0.85) {
  const from = normalizeHexColor(color).slice(1);
  const to = normalizeHexColor(target, "#ffffff").slice(1);
  const weight = Math.max(0, Math.min(1, Number(ratio) || 0));
  const mixed = [0, 2, 4].map((offset) => {
    const start = Number.parseInt(from.slice(offset, offset + 2), 16);
    const end = Number.parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * weight).toString(16).padStart(2, "0");
  });
  return `#${mixed.join("")}`;
}

function getReadableAccent(color = "#2563eb") {
  const base = normalizeHexColor(color);
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  };
  if (1.05 / (luminance(base) + 0.05) >= 4.5) return base;
  for (const ratio of [0.18, 0.28, 0.38, 0.48, 0.58]) {
    const candidate = mixHex(base, "#000000", ratio);
    if (1.05 / (luminance(candidate) + 0.05) >= 4.5) return candidate;
  }
  return "#172033";
}

function resolveProjectPalette(project = {}) {
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  const firstAcademicPalette = missions.find((mission) => mission?.paleta_academica)?.paleta_academica || {};
  const themeColor = normalizeHexColor(
    firstAcademicPalette.color_tema_unidad
      || project?.themeConfig?.backgroundColor
      || project?.themeConfig?.buttonColor
      || project?.themeConfig?.baseColor,
    "#2563eb"
  );
  const stationColor = normalizeHexColor(
    firstAcademicPalette.color_estacion || project?.themeConfig?.accentColor,
    "#0f766e"
  );
  return { themeColor, stationColor };
}

function resolveMissionStationColor(mission = {}, fallback = "#0f766e") {
  return normalizeHexColor(mission?.paleta_academica?.color_estacion, fallback);
}

function renderAcademicMeta(label, value) {
  if (!value) return "";
  return `<span style="display:inline;margin-right:10px;color:#667085;font-size:10px;line-height:1.4;"><strong style="color:#344054;font-weight:700;">${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`;
}

function normalizeComparableAnswer(value = "") {
  return String(value ?? "").trim().toLocaleLowerCase("es");
}

function getAcceptedAnswerVariants(question = {}) {
  const primaryKey = normalizeComparableAnswer(question.respuesta_correcta);
  const seen = new Set(primaryKey ? [primaryKey] : []);
  return (Array.isArray(question.respuestas_aceptadas) ? question.respuestas_aceptadas : [])
    .map((answer) => String(answer ?? "").trim())
    .filter((answer) => {
      const key = normalizeComparableAnswer(answer);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderRelationshipAnswer(question = {}) {
  const pairs = Array.isArray(question.parejas) ? question.parejas : [];
  if (!pairs.length) return "";
  return `<table role="presentation" style="${STYLES.pairTable}"><tbody>${pairs.map((pair) => `
    <tr>
      <td style="${STYLES.pairLeft}">${escapeHtml(pair?.izquierda || "—")}</td>
      <td aria-hidden="true" style="${STYLES.pairArrow}">→</td>
      <td style="${STYLES.pairRight}">${escapeHtml(pair?.derecha || "—")}</td>
    </tr>`).join("")}
  </tbody></table>`;
}

function renderQuestion(question = {}, questionIndex = 0, isLast = false, colors = {}) {
  const questionStationColor = normalizeHexColor(colors.questionStationColor, colors.stationColor || "#0f766e");
  const readableStationColor = getReadableAccent(questionStationColor);
  const primary = String(question.respuesta_correcta || "").trim();
  const isFreeResponse = String(question.subtipo_respuesta || "").trim() === "frase_libre";
  const variants = getAcceptedAnswerVariants(question);
  const relationshipAnswer = question.tipo_interaccion === "relacion_columnas"
    ? renderRelationshipAnswer(question)
    : "";
  const title = String(question.titulo || `Pregunta ${questionIndex + 1}`).trim();
  const prompt = String(question.reto || question.enunciado || question.pregunta || title).trim();
  const answerMarkup = isFreeResponse
    ? `<strong style="${STYLES.answer}">Respuesta libre</strong>`
    : relationshipAnswer || (primary
      ? `<strong style="${STYLES.answer}">${escapeHtml(primary)}</strong>`
      : `<span style="${STYLES.empty}">Sin respuesta configurada</span>`);
  const baseQuestionStyle = isLast ? STYLES.question.replace("border-bottom:1px solid #edf0f4;", "") : STYLES.question;

  return `<div style="${baseQuestionStyle}">
    <div style="${STYLES.questionGrid}">
      <div style="${STYLES.questionIndex}padding-top:4px;border-top:2px solid ${questionStationColor};color:${readableStationColor};">${String(questionIndex + 1).padStart(2, "0")}</div>
      <div style="${STYLES.questionBody}">
        <h4 style="${STYLES.questionTitle}color:${readableStationColor};">${escapeHtml(title)}</h4>
        <p style="${STYLES.prompt}">${escapeHtml(prompt)}</p>
        <div><span style="${STYLES.answerLabel}">Respuesta</span>${answerMarkup}</div>
        ${variants.length ? `<p style="${STYLES.variants}"><span style="${STYLES.variantsLabel}">También acepta:</span> ${variants.map(escapeHtml).join(" · ")}</p>` : ""}
      </div>
    </div>
  </div>`;
}

function renderMission(mission = {}, missionIndex = 0, presentationMode = "salas", colors = {}) {
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
  const label = presentationMode === "menu_secciones" ? "Actividad" : "Sala";
  const stationColor = resolveMissionStationColor(mission, colors.stationColor);
  const readableStationColor = getReadableAccent(stationColor);
  return `<div style="${STYLES.mission}">
    <div style="${STYLES.missionHead}">
      <span style="${STYLES.missionLabel}color:${readableStationColor};">${label} ${String(missionIndex + 1).padStart(2, "0")}</span>
      <h3 style="${STYLES.missionTitle}">${escapeHtml(mission.titulo || `${label} ${missionIndex + 1}`)}</h3>
    </div>
    ${questions.length
      ? questions.map((question, index) => renderQuestion(question, index, index === questions.length - 1, {
          ...colors,
          questionStationColor: colors.allStations
            ? STATION_COLORS[(Number(colors.stationSequenceStart || 0) + index) % STATION_COLORS.length]
            : stationColor
        })).join("")
      : `<p style="${STYLES.empty}">Sin preguntas.</p>`}
  </div>`;
}

function renderTopic(topic = {}, topicIndex = 0, isLast = false) {
  const project = topic.project && typeof topic.project === "object" ? topic.project : null;
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  const academicNumber = Number(topic.academicNumber) || topicIndex + 1;
  const title = project?.titulo || topic.title || `Tema ${academicNumber}`;
  const colors = resolveProjectPalette(project || {});
  const unitOrTopicLabel = String(project?.nivel || "").trim() === "Primaria" ? "Unidad" : "Tema";
  const unitOrTopicValue = project?.unidad || project?.tema || academicNumber;
  const stationSelection = String(project?.estacion || "").trim().toLocaleLowerCase("es");
  const allStations = !stationSelection || stationSelection === "todas";
  const readableThemeColor = getReadableAccent(colors.themeColor);
  const questionCount = missions.reduce((total, mission) => total + (Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0), 0);
  const topicStyleBase = isLast ? STYLES.topic.replace("border-bottom:1px solid #dfe4ec;", "") : STYLES.topic;
  return `<section style="${topicStyleBase}">
    <div style="${STYLES.topicHead}">
      <span style="${STYLES.eyebrow}color:${readableThemeColor};">Tema ${escapeHtml(academicNumber)}</span>
      <h2 style="${STYLES.topicTitle}color:${readableThemeColor};">${escapeHtml(title)}</h2>
      <p style="${STYLES.count}">${questionCount} ${questionCount === 1 ? "pregunta" : "preguntas"}</p>
      <div style="margin-top:4px;">
        ${renderAcademicMeta("Materia", project?.materia || "Sin materia")}
        ${renderAcademicMeta(unitOrTopicLabel, unitOrTopicValue)}
      </div>
    </div>
    ${missions.length
      ? (() => {
          let stationSequenceStart = 0;
          return missions.map((mission, index) => {
            const missionHtml = renderMission(mission, index, project?.modo_presentacion, {
              ...colors,
              allStations,
              stationSequenceStart
            });
            stationSequenceStart += Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0;
            return missionHtml;
          }).join("");
        })()
      : `<p style="${STYLES.empty}">Este tema todavía no tiene contenido generado.</p>`}
  </section>`;
}

export function countAnswerKeyQuestions(topics = []) {
  return (Array.isArray(topics) ? topics : []).reduce((topicTotal, topic) => (
    topicTotal + (Array.isArray(topic?.project?.misiones) ? topic.project.misiones : []).reduce((missionTotal, mission) => (
      missionTotal + (Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0)
    ), 0)
  ), 0);
}

export function buildMoodleAnswerKeyHtml({ sessionTitle = "Sesión", topics = [] } = {}) {
  const sortedTopics = [...(Array.isArray(topics) ? topics : [])]
    .filter((topic) => countAnswerKeyQuestions([topic]) > 0)
    .sort((a, b) => (Number(a?.academicNumber) || 0) - (Number(b?.academicNumber) || 0));
  const questionCount = countAnswerKeyQuestions(sortedTopics);
  const safeTitle = String(sessionTitle || "Sesión").trim() || "Sesión";
  const html = `<div style="${STYLES.root}">
  <div style="${STYLES.documentHead}">
    <span style="${STYLES.eyebrow}">Hoja de respuestas</span>
    <h1 style="${STYLES.documentTitle}">${escapeHtml(safeTitle)}</h1>
    <p style="${STYLES.documentMeta}">${sortedTopics.length} ${sortedTopics.length === 1 ? "tema" : "temas"} · ${questionCount} ${questionCount === 1 ? "pregunta" : "preguntas"}</p>
  </div>
  ${sortedTopics.map((topic, index) => renderTopic(topic, index, index === sortedTopics.length - 1)).join("")}
</div>`;
  return { html, questionCount, topicCount: sortedTopics.length };
}
