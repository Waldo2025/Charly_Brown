import { experience } from "./escape-room-experience.mjs?v=20260912-text-pieces-v9";

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

const ANSWER_EXPORT_MESSAGES = Object.freeze({
  es: Object.freeze({
    answerKey: "Hoja de respuestas",
    topic: "Tema",
    topics: "temas",
    question: "Pregunta",
    questions: "preguntas",
    subject: "Materia",
    unit: "Unidad",
    activity: "Actividad",
    room: "Sala",
    answer: "Respuesta",
    alsoAccepted: "También acepta",
    true: "Verdadero",
    false: "Falso",
    freeResponse: "Formato retirado · Regenerar pregunta",
    noAnswer: "Sin respuesta configurada",
    noQuestions: "Sin preguntas.",
    noContent: "Este tema todavía no tiene contenido generado.",
    noSubject: "Sin materia"
  }),
  en: Object.freeze({
    answerKey: "Answer key",
    topic: "Chapter",
    topics: "chapters",
    question: "Question",
    questions: "questions",
    subject: "Subject",
    unit: "Unit",
    activity: "Activity",
    room: "Room",
    answer: "Answer",
    alsoAccepted: "Also accepted",
    true: "True",
    false: "False",
    freeResponse: "Retired format · Regenerate question",
    noAnswer: "No answer configured",
    noQuestions: "No questions.",
    noContent: "This topic does not have generated content yet.",
    noSubject: "No subject"
  }),
  fr: Object.freeze({
    answerKey: "Corrigé",
    topic: "Thème",
    topics: "thèmes",
    question: "Question",
    questions: "questions",
    subject: "Matière",
    unit: "Unité",
    activity: "Activité",
    room: "Salle",
    answer: "Réponse",
    alsoAccepted: "Également accepté",
    true: "Vrai",
    false: "Faux",
    freeResponse: "Réponse libre",
    noAnswer: "Aucune réponse configurée",
    noQuestions: "Aucune question.",
    noContent: "Ce thème ne contient pas encore de contenu généré.",
    noSubject: "Aucune matière"
  }),
  pt: Object.freeze({
    answerKey: "Gabarito",
    topic: "Tema",
    topics: "temas",
    question: "Pergunta",
    questions: "perguntas",
    subject: "Disciplina",
    unit: "Unidade",
    activity: "Atividade",
    room: "Sala",
    answer: "Resposta",
    alsoAccepted: "Também aceita",
    true: "Verdadeiro",
    false: "Falso",
    freeResponse: "Resposta aberta",
    noAnswer: "Nenhuma resposta configurada",
    noQuestions: "Nenhuma pergunta.",
    noContent: "Este tema ainda não possui conteúdo gerado.",
    noSubject: "Sem disciplina"
  })
});

function getAnswerExportMessages(locale = "es-419") {
  const language = String(locale || "es-419").trim().toLowerCase().split(/[-_]/)[0];
  return ANSWER_EXPORT_MESSAGES[language] || ANSWER_EXPORT_MESSAGES.es;
}

function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : plural;
}

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

function renderQuestion(question = {}, questionIndex = 0, isLast = false, colors = {}, messages = ANSWER_EXPORT_MESSAGES.es) {
  const questionStationColor = normalizeHexColor(colors.questionStationColor, colors.stationColor || "#0f766e");
  const readableStationColor = getReadableAccent(questionStationColor);
  const primary = experience.get(question.tipo_interaccion) ? experience.answerText(question.tipo_interaccion, question.interaction_data) : String(question.respuesta_correcta || "").trim();
  const isFreeResponse = String(question.subtipo_respuesta || "").trim() === "frase_libre";
  const variants = getAcceptedAnswerVariants(question);
  const relationshipAnswer = (["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion) || (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2))
    ? renderRelationshipAnswer(question)
    : "";
  const sequenceAnswer = question.tipo_interaccion === "ordenar_secuencia" && Array.isArray(question.elementos)
    ? `<ol style="margin:6px 0 0;padding-left:22px;">${question.elementos.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
    : "";
  const trueFalseAnswer = question.tipo_interaccion === "verdadero_falso"
    ? (question.respuesta_correcta === true ? messages.true : messages.false)
    : "";
  const title = String(question.titulo || `${messages.question} ${questionIndex + 1}`).trim();
  const prompt = String(question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2 ? question.texto_con_hueco : question.reto || question.enunciado || question.pregunta || title).trim();
  const answerMarkup = isFreeResponse
    ? `<strong style="${STYLES.answer}">${escapeHtml(messages.freeResponse)}</strong>`
    : relationshipAnswer || sequenceAnswer || (trueFalseAnswer
      ? `<strong style="${STYLES.answer}">${escapeHtml(trueFalseAnswer)}</strong>`
      : primary
      ? `<strong style="${STYLES.answer}">${escapeHtml(primary)}</strong>`
      : `<span style="${STYLES.empty}">${escapeHtml(messages.noAnswer)}</span>`);
  const baseQuestionStyle = isLast ? STYLES.question.replace("border-bottom:1px solid #edf0f4;", "") : STYLES.question;

  return `<div style="${baseQuestionStyle}">
    <div style="${STYLES.questionGrid}">
      <div style="${STYLES.questionIndex}padding-top:4px;border-top:2px solid ${questionStationColor};color:${readableStationColor};">${String(questionIndex + 1).padStart(2, "0")}</div>
      <div style="${STYLES.questionBody}">
        <h4 style="${STYLES.questionTitle}color:${readableStationColor};">${escapeHtml(title)}</h4>
        <p style="${STYLES.prompt}">${escapeHtml(prompt)}</p>
        <div><span style="${STYLES.answerLabel}">${escapeHtml(messages.answer)}</span>${answerMarkup}</div>
        ${variants.length ? `<p style="${STYLES.variants}"><span style="${STYLES.variantsLabel}">${escapeHtml(messages.alsoAccepted)}:</span> ${variants.map(escapeHtml).join(" · ")}</p>` : ""}
      </div>
    </div>
  </div>`;
}

function renderMission(mission = {}, missionIndex = 0, presentationMode = "salas", colors = {}, messages = ANSWER_EXPORT_MESSAGES.es) {
  const questions = Array.isArray(mission.preguntas) ? mission.preguntas : [];
  const label = presentationMode === "menu_secciones" ? messages.activity : messages.room;
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
        }, messages)).join("")
      : `<p style="${STYLES.empty}">${escapeHtml(messages.noQuestions)}</p>`}
  </div>`;
}

function renderTopic(topic = {}, topicIndex = 0, isLast = false) {
  const project = topic.project && typeof topic.project === "object" ? topic.project : null;
  const messages = getAnswerExportMessages(project?.idioma);
  const missions = Array.isArray(project?.misiones) ? project.misiones : [];
  const academicNumber = Number(topic.academicNumber) || topicIndex + 1;
  const title = project?.titulo || topic.title || `${messages.topic} ${academicNumber}`;
  const colors = resolveProjectPalette(project || {});
  const unitOrTopicLabel = String(project?.nivel || "").trim() === "Primaria" ? messages.unit : messages.topic;
  const unitOrTopicValue = project?.unidad || project?.tema || academicNumber;
  const stationSelection = String(project?.estacion || "").trim().toLocaleLowerCase("es");
  const allStations = !stationSelection || stationSelection === "todas";
  const readableThemeColor = getReadableAccent(colors.themeColor);
  const questionCount = missions.reduce((total, mission) => total + (Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0), 0);
  const topicStyleBase = isLast ? STYLES.topic.replace("border-bottom:1px solid #dfe4ec;", "") : STYLES.topic;
  return `<section style="${topicStyleBase}">
    <div style="${STYLES.topicHead}">
      <span style="${STYLES.eyebrow}color:${readableThemeColor};">${escapeHtml(messages.topic)} ${escapeHtml(academicNumber)}</span>
      <h2 style="${STYLES.topicTitle}color:${readableThemeColor};">${escapeHtml(title)}</h2>
      <p style="${STYLES.count}">${questionCount} ${escapeHtml(pluralize(questionCount, messages.question.toLowerCase(), messages.questions))}</p>
      <div style="margin-top:4px;">
        ${renderAcademicMeta(messages.subject, project?.materia || messages.noSubject)}
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
            }, messages);
            stationSequenceStart += Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0;
            return missionHtml;
          }).join("");
        })()
      : `<p style="${STYLES.empty}">${escapeHtml(messages.noContent)}</p>`}
  </section>`;
}

export function countAnswerKeyQuestions(topics = []) {
  return (Array.isArray(topics) ? topics : []).reduce((topicTotal, topic) => (
    topicTotal + (Array.isArray(topic?.project?.misiones) ? topic.project.misiones : []).reduce((missionTotal, mission) => (
      missionTotal + (Array.isArray(mission?.preguntas) ? mission.preguntas.length : 0)
    ), 0)
  ), 0);
}

function renderPlainQuestionAnswer(question = {}, messages = ANSWER_EXPORT_MESSAGES.es) {
  if (experience.get(question.tipo_interaccion)) return experience.answerText(question.tipo_interaccion, question.interaction_data);
  if (["relacion_columnas", "drag_drop"].includes(question.tipo_interaccion) || (question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2)) {
    return (Array.isArray(question.parejas) ? question.parejas : [])
      .map((pair) => `${String(pair?.izquierda || "—").trim()} → ${String(pair?.derecha || "—").trim()}`)
      .join("\n");
  }
  if (question.tipo_interaccion === "ordenar_secuencia") {
    return (Array.isArray(question.elementos) ? question.elementos : [])
      .map((item, index) => `${index + 1}. ${String(item || "").trim()}`)
      .join("\n");
  }
  if (question.tipo_interaccion === "verdadero_falso") {
    return question.respuesta_correcta === true ? messages.true : messages.false;
  }
  if (String(question.subtipo_respuesta || "").trim() === "frase_libre") return messages.freeResponse;
  return String(question.respuesta_correcta || messages.noAnswer).trim();
}

function buildAnswerKeyPlainText({ topics = [] } = {}) {
  const lines = [];
  topics.forEach((topic, topicIndex) => {
    const project = topic.project && typeof topic.project === "object" ? topic.project : {};
    const messages = getAnswerExportMessages(project.idioma);
    const topicNumber = Number(topic.academicNumber) || topicIndex + 1;
    lines.push(`${messages.topic.toLocaleUpperCase()} ${topicNumber}: ${project.titulo || topic.title || `${messages.topic} ${topicNumber}`}`);
    if (project.materia) lines.push(`${messages.subject}: ${project.materia}`);
    (Array.isArray(project.misiones) ? project.misiones : []).forEach((mission, missionIndex) => {
      const missionLabel = project.modo_presentacion === "menu_secciones" ? messages.activity : messages.room;
      lines.push("", `${missionLabel.toLocaleUpperCase()} ${String(missionIndex + 1).padStart(2, "0")}: ${mission.titulo || `${missionLabel} ${missionIndex + 1}`}`);
      (Array.isArray(mission.preguntas) ? mission.preguntas : []).forEach((question, questionIndex) => {
        const title = String(question.titulo || `${messages.question} ${questionIndex + 1}`).trim();
        const prompt = String(question.tipo_interaccion === 'completar_espacio' && question.interaction_contract_version === 2 ? question.texto_con_hueco : question.reto || question.enunciado || question.pregunta || title).trim();
        lines.push(`${String(questionIndex + 1).padStart(2, "0")}. ${title}`, prompt, `${messages.answer}: ${renderPlainQuestionAnswer(question, messages)}`);
        const variants = getAcceptedAnswerVariants(question);
        if (variants.length) lines.push(`${messages.alsoAccepted}: ${variants.join(" · ")}`);
      });
    });
    lines.push("");
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildMoodleAnswerKeyHtml({ topics = [] } = {}) {
  const sortedTopics = [...(Array.isArray(topics) ? topics : [])]
    .filter((topic) => countAnswerKeyQuestions([topic]) > 0)
    .sort((a, b) => (Number(a?.academicNumber) || 0) - (Number(b?.academicNumber) || 0));
  const questionCount = countAnswerKeyQuestions(sortedTopics);
  const html = `<div style="${STYLES.root}">
  ${sortedTopics.map((topic, index) => renderTopic(topic, index, index === sortedTopics.length - 1)).join("")}
</div>`;
  return {
    html,
    text: buildAnswerKeyPlainText({ topics: sortedTopics }),
    questionCount,
    topicCount: sortedTopics.length
  };
}
