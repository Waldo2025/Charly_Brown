const SUBJECT_LABELS = Object.freeze({
  science: "Ciencias Naturales",
  biology: "Biología",
  chemistry: "Química",
  physics: "Física",
  math: "Matemáticas"
});

const STYLES = Object.freeze({
  root: "max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #dbe5ea;color:#173047;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;box-sizing:border-box;",
  header: "padding:22px 26px 18px;border-top:5px solid #2da6b1;border-bottom:1px solid #dbe5ea;background:#f7fbfc;",
  eyebrow: "display:block;margin:0 0 4px;color:#168f9d;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;",
  title: "margin:0;color:#173047;font-size:23px;line-height:1.2;",
  meta: "margin:7px 0 0;color:#617783;font-size:11px;",
  level: "padding:18px 26px 4px;",
  levelTitle: "margin:0 0 10px;color:#20787f;font-size:16px;line-height:1.2;",
  question: "margin:0 0 12px;padding:13px 14px;border:1px solid #dbe5ea;border-radius:8px;background:#ffffff;",
  questionHead: "display:table;width:100%;border-collapse:collapse;",
  index: "display:table-cell;width:38px;padding-right:10px;color:#168f9d;font-family:monospace;font-size:11px;font-weight:800;vertical-align:top;",
  body: "display:table-cell;vertical-align:top;",
  type: "display:block;margin:0 0 3px;color:#7a8e98;font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;",
  score: "display:inline-block;margin:0 0 8px;padding:4px 7px;border:1px solid #b9e5df;border-radius:999px;background:#eaf8f6;color:#20787f;font-size:9px;font-weight:800;letter-spacing:.35px;",
  prompt: "margin:0 0 9px;color:#173047;font-size:13px;font-weight:700;",
  answerBox: "padding:9px 10px;border-left:3px solid #58c7bb;background:#f3fbfa;",
  answerLabel: "display:block;margin:0 0 3px;color:#527079;font-size:9px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;",
  answer: "margin:0;color:#173047;font-size:12px;font-weight:700;",
  variants: "margin:5px 0 0;color:#617783;font-size:10px;",
  scoringNote: "margin:10px 0 0;color:#617783;font-size:10px;",
  empty: "padding:20px 26px;color:#7a8e98;font-style:italic;"
});

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function list(value) {
  return (Array.isArray(value) ? value : value == null ? [] : [value])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function stepText(step) {
  if (typeof step === "string" || typeof step === "number") return String(step).trim();
  return String(step?.text ?? step?.title ?? step?.label ?? step?.step ?? step?.description ?? "").trim();
}

function typeLabel(type = "") {
  return ({
    multiple: "Opción múltiple",
    "image-multiple": "Pregunta visual",
    matching: "Relacionar columnas",
    keyword: "Palabra clave",
    "equation-build": "Construir ecuación",
    "fill-blank": "Completar espacio",
    "exponent-placement": "Colocar exponentes",
    "chemical-balance": "Balanceo químico",
    "numeric-answer": "Respuesta numérica",
    "number-line-placement": "Recta numérica",
    "graph-plot": "Graficar puntos",
    "sequence-order": "Ordenar procedimiento",
    "timeline-order": "Línea del tiempo"
  })[type] || "Pregunta";
}

function multipleAnswers(question = {}) {
  const options = list(question.options);
  const rawIndexes = Array.isArray(question.correctAnswers) && question.correctAnswers.length
    ? question.correctAnswers
    : [question.correct ?? question.correctIndex];
  return [...new Set(rawIndexes.map(Number))]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < options.length)
    .map((index) => options[index]);
}

function chemicalEquation(question = {}) {
  const compounds = Array.isArray(question.compounds) ? question.compounds : [];
  const coefficients = Array.isArray(question.correctCoefficients) ? question.correctCoefficients : [];
  if (!compounds.length || !coefficients.length) return [];
  const term = (compound, index) => `${coefficients[index] ?? 1} ${compound?.formula || "?"}`;
  const reactants = compounds.map((compound, index) => ({ compound, index })).filter(({ compound }) => compound?.side !== "product").map(({ compound, index }) => term(compound, index));
  const products = compounds.map((compound, index) => ({ compound, index })).filter(({ compound }) => compound?.side === "product").map(({ compound, index }) => term(compound, index));
  return [products.length ? `${reactants.join(" + ")} → ${products.join(" + ")}` : coefficients.join(" : ")];
}

export function scienceQuestionScore(question = {}) {
  const configured = Math.max(0, Math.round(Number(question?.points) || 0));
  return { base: configured, maximum: configured };
}

export function scienceQuestionAnswers(question = {}) {
  if (["multiple", "image-multiple"].includes(question.type)) return multipleAnswers(question);
  if (question.type === "matching") {
    return (Array.isArray(question.pairs) ? question.pairs : []).map((pair) => {
      const left = Array.isArray(pair) ? pair[0] : pair?.left ?? pair?.term ?? pair?.concept;
      const right = Array.isArray(pair) ? pair[1] : pair?.right ?? pair?.definition ?? pair?.match;
      return left && right ? `${left} → ${right}` : "";
    }).filter(Boolean);
  }
  if (["keyword", "fill-blank"].includes(question.type)) return list(question.accepted ?? question.acceptedAnswers ?? question.answer);
  if (question.type === "equation-build") return [(question.correctSequence || []).map(stepText).filter(Boolean).join(" ")].filter(Boolean);
  if (question.type === "exponent-placement") return list(question.correctExponents);
  if (question.type === "chemical-balance") return chemicalEquation(question);
  if (question.type === "numeric-answer") {
    const value = question.correctValue ?? question.answer;
    return value == null || value === "" ? [] : [`${value}${question.unit ? ` ${question.unit}` : ""}`];
  }
  if (question.type === "number-line-placement") {
    const value = question.targetValue ?? question.correctValue;
    return value == null || value === "" ? [] : [String(value)];
  }
  if (question.type === "graph-plot") return (question.targetPoints || []).map((point) => `(${point?.x}, ${point?.y})`);
  if (question.type === "sequence-order") return [(question.correctOrder || []).map(stepText).filter(Boolean).join(" → ")].filter(Boolean);
  if (question.type === "timeline-order") {
    const titleById = new Map((question.events || []).map((event) => [String(event?.id || ""), stepText(event)]));
    return [(question.correctOrder || []).map((id) => titleById.get(String(id)) || String(id)).filter(Boolean).join(" → ")].filter(Boolean);
  }
  return list(question.solution ?? question.correctAnswer ?? question.answer);
}

function renderQuestion(question, index) {
  const answers = scienceQuestionAnswers(question);
  const score = scienceQuestionScore(question);
  const [primary = "Respuesta no configurada", ...alternatives] = answers;
  return `<article style="${STYLES.question}">
    <div style="${STYLES.questionHead}">
      <div style="${STYLES.index}">${String(index + 1).padStart(2, "0")}</div>
      <div style="${STYLES.body}">
        <span style="${STYLES.type}">${escapeHtml(typeLabel(question.type))}</span>
        <span style="${STYLES.score}">Valor de la pregunta: ${score.maximum.toLocaleString("es-MX")} puntos</span>
        <p style="${STYLES.prompt}">${escapeHtml(question.prompt || question.question || question.title || `Pregunta ${index + 1}`)}</p>
        <div style="${STYLES.answerBox}">
          <span style="${STYLES.answerLabel}">Respuesta correcta</span>
          <p style="${STYLES.answer}">${escapeHtml(primary)}</p>
          ${alternatives.length ? `<p style="${STYLES.variants}"><strong>También acepta:</strong> ${alternatives.map(escapeHtml).join(" · ")}</p>` : ""}
        </div>
      </div>
    </div>
  </article>`;
}

export function buildScienceAnswerKeyHtml(activity = {}) {
  const questions = Array.isArray(activity.assessments) ? activity.assessments : [];
  const configuredTotal = questions.reduce((total, question) => total + scienceQuestionScore(question).maximum, 0);
  const activityMaximum = Math.max(0, Math.round(Number(activity.maxPoints) || configuredTotal));
  const groups = new Map();
  questions.forEach((question, index) => {
    const level = Math.max(0, Number(question?.levelIndex) || Math.floor(index / Math.max(1, Number(activity.questionsPerLevel) || 1)));
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push({ question, index });
  });
  const html = `<section style="${STYLES.root}">
    <header style="${STYLES.header}">
      <span style="${STYLES.eyebrow}">Hoja de respuestas · Science Activities</span>
      <h1 style="${STYLES.title}">${escapeHtml(activity.title || "Actividad científica")}</h1>
      <p style="${STYLES.meta}">${escapeHtml(SUBJECT_LABELS[activity.subject] || activity.subject || "Ciencias")} · ${escapeHtml(activity.topic || "Sin tema")} · ${questions.length} ${questions.length === 1 ? "pregunta" : "preguntas"}</p>
      <p style="${STYLES.scoringNote}">Puntaje máximo de la actividad: ${activityMaximum.toLocaleString("es-MX")} puntos · Total asignado entre las preguntas: ${configuredTotal.toLocaleString("es-MX")} puntos.</p>
    </header>
    ${questions.length ? [...groups.entries()].map(([level, entries]) => `<section style="${STYLES.level}"><h2 style="${STYLES.levelTitle}">Nivel ${level + 1}</h2>${entries.map(({ question, index }) => renderQuestion(question, index)).join("")}</section>`).join("") : `<p style="${STYLES.empty}">La actividad todavía no contiene preguntas.</p>`}
  </section>`;
  return { html, questionCount: questions.length, levelCount: groups.size, configuredTotal, activityMaximum };
}

export async function writeScienceAnswerHtml(html, { navigatorRef = navigator, windowRef = window, documentRef = document } = {}) {
  const markup = String(html || "").trim();
  if (!markup) throw new Error("No hay respuestas para copiar.");
  if (typeof navigatorRef?.clipboard?.write === "function" && typeof windowRef.ClipboardItem === "function") {
    try {
      await navigatorRef.clipboard.write([new windowRef.ClipboardItem({
        "text/html": new Blob([markup], { type: "text/html" }),
        "text/plain": new Blob([markup], { type: "text/plain" })
      })]);
      return true;
    } catch (error) {
      console.warn("[ScienceActivities] Rich clipboard unavailable; using compatible copy.", error);
    }
  }
  const holder = documentRef.createElement("div");
  holder.contentEditable = "true";
  holder.style.cssText = "position:fixed;left:-10000px;top:0;";
  holder.innerHTML = markup;
  documentRef.body.appendChild(holder);
  let wroteHtml = false;
  const handleCopy = (event) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", markup);
    event.clipboardData.setData("text/plain", markup);
    wroteHtml = true;
  };
  documentRef.addEventListener("copy", handleCopy);
  try {
    const selection = windowRef.getSelection();
    const range = documentRef.createRange();
    range.selectNodeContents(holder);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const copied = documentRef.execCommand("copy");
    selection?.removeAllRanges();
    if (!copied || !wroteHtml) throw new Error("El navegador no permitió copiar el HTML con formato.");
    return true;
  } finally {
    documentRef.removeEventListener("copy", handleCopy);
    holder.remove();
  }
}

export async function copyScienceAnswers(activity = {}) {
  const result = buildScienceAnswerKeyHtml(activity);
  if (!result.questionCount) return result;
  await writeScienceAnswerHtml(result.html);
  return result;
}
