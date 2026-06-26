import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDefaultFirebaseApp } from "../js/firebase-default-app.js";
import { stripHtml } from "./ui-components.js";

const app = getDefaultFirebaseApp();
const db = getFirestore(app);

export const READING_COLLECTIONS = [
  { id: "lecturasNuevas", type: "principal", label: "Lecturas nuevas", allowGlobal: true },
  { id: "lecturasASC", type: "asc", label: "Lecturas ASC", allowGlobal: true }
];

export async function listReadingsForUnit({ meta = {}, limit = 80 } = {}) {
  const settled = await Promise.allSettled(
    READING_COLLECTIONS.map(async (source) => {
      const docs = await getScopedDocs(source.id, { allowGlobal: source.allowGlobal });
      return docs.map((docSnap) => normalizeReadingDoc(docSnap, source));
    })
  );
  const rows = settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
  return rankAndDedupeReadings(filterReadingsForMeta(rows, meta), meta).slice(0, limit);
}

export async function saveGeneratedReading({ reading = {}, session = {} } = {}) {
  const user = getAuth().currentUser;
  if (!user || !reading?.html) return { saved: false, reason: "missing-user-or-reading" };
  const meta = session.meta || {};
  const payload = {
    titulo: reading.title || "Lectura generada",
    tema: reading.title || "Lectura generada",
    autorReferencia: "Charly Brown",
    tipoTexto: "Libre",
    tono: "Educativo",
    nivel: meta.level || "Primaria",
    grado: meta.grade || "",
    trimestre: meta.trimester || "",
    unidad: meta.unit || "",
    contenidoHTML: reading.html || "",
    contenidoPlano: stripHtml(reading.html || ""),
    preguntas: reading.questions || [],
    publicar: false,
    published: false,
    userId: user.uid,
    ownerId: user.uid,
    sourceTool: "charly-brown",
    timestamp: new Date()
  };
  const ref = await addDoc(collection(db, "lecturasNuevas"), payload);
  return { saved: true, id: ref.id, collection: "lecturasNuevas", reading: normalizeReading({ id: ref.id, ...payload }, "lecturasNuevas", "principal") };
}

export function normalizeReadingDoc(docSnap, source = {}) {
  return normalizeReading({ id: docSnap.id, ...(docSnap.data?.() || {}) }, source.id, source.type);
}

export function normalizeReading(row = {}, collectionName = "", type = "") {
  const html = row.contenidoHTML || row.textoLectura || row.lecturaHTML || row.htmlLectura || row.lectura || row.contenido || row.texto || "";
  const title = row.titulo || row.tema || row.nombre || "Lectura sin título";
  const questions = normalizeQuestions(row);
  const sections = splitReadingSections(row, html, questions);
  return {
    id: row.id || "",
    collection: collectionName || row.sourceCollection || row.coleccion || "",
    type: type || row.tipo || "",
    sourceLabel: collectionName === "lecturasASC" ? "ASC" : "Principal",
    title,
    html: sections.narrativeHtml || html,
    text: row.contenidoPlano || stripHtml(sections.narrativeHtml || html),
    questions,
    sections,
    meta: {
      nivel: row.nivel || "",
      grado: row.grado || row.gradoEscolar || "",
      trimestre: row.trimestre || row.trimestreNumero || row.periodo || "",
      unidad: firstDefined(row.unidad, row.unidadNumero, row.unidad_numero, row.numeroUnidad, row.numUnidad, ""),
      serie: row.serie || "",
      autorReferencia: row.autorReferencia || "",
      userId: row.userId || row.ownerId || row.uid || row.createdBy || ""
    },
    raw: row
  };
}

async function getScopedDocs(collectionName, { allowGlobal = false } = {}) {
  const user = getAuth().currentUser;
  const colRef = collection(db, collectionName);
  const uid = user?.uid || "";
  const email = String(user?.email || "").toLowerCase();
  const merged = new Map();
  const candidateQueries = [
    query(colRef, where("publicar", "==", true)),
    query(colRef, where("published", "==", true)),
    query(colRef, where("estatusLectura", "==", "Compartido"))
  ];

  if (uid) {
    ["ownerId", "userId", "uid", "createdBy"].forEach((key) => {
      candidateQueries.push(query(colRef, where(key, "==", uid)));
    });
    candidateQueries.push(
      query(colRef, where("sharewith", "array-contains", uid)),
      query(colRef, where("sharedWithIds", "array-contains", uid)),
      query(colRef, where("sharedWithUids", "array-contains", uid))
    );
  }

  if (email) {
    candidateQueries.push(query(colRef, where("sharedWith", "array-contains", email)));
  }

  const settled = await Promise.allSettled(candidateQueries.map((candidate) => getDocs(candidate)));
  settled
    .filter((result) => result.status === "fulfilled")
    .forEach((result) => result.value.forEach((docSnap) => merged.set(docSnap.id, docSnap)));

  if (allowGlobal || uid) {
    try {
      const snap = await getDocs(colRef);
      snap.forEach((docSnap) => merged.set(docSnap.id, docSnap));
    } catch (_) {}
  } else if (!merged.size) {
    try {
      const snap = await getDocs(colRef);
      snap.forEach((docSnap) => {
        const row = docSnap.data() || {};
        if (ownsOrShares(row, { uid, email })) merged.set(docSnap.id, docSnap);
      });
    } catch (_) {}
  }

  return Array.from(merged.values());
}

function ownsOrShares(row = {}, { uid = "", email = "" } = {}) {
  const ownerMatch = !!uid && [row.userId, row.ownerId, row.uid, row.createdBy].map(String).includes(uid);
  const sharedEmail = !!email && Array.isArray(row.sharedWith) && row.sharedWith.map((value) => String(value).toLowerCase()).includes(email);
  const sharedUid = !!uid && Array.isArray(row.sharedWithUids) && row.sharedWithUids.map(String).includes(uid);
  return ownerMatch || sharedEmail || sharedUid;
}

function rankAndDedupeReadings(rows = [], meta = {}) {
  const seen = new Set();
  return rows
    .filter((item) => item.html || item.text)
    .map((item) => ({ ...item, score: scoreReading(item, meta) }))
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title), "es"))
    .filter((item) => {
      const key = [
        normalizeKey(item.title),
        normalizeKey(item.meta?.grado),
        normalizeKey(item.meta?.trimestre),
        normalizeKey(item.meta?.unidad),
        normalizeKey((item.text || item.html || "").slice(0, 240))
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function scoreReading(item = {}, meta = {}) {
  let score = item.collection === "lecturasNuevas" ? 4 : 2;
  if (same(item.meta?.nivel, meta.level || "Primaria")) score += 2;
  if (sameGrade(item.meta?.grado, meta.grade)) score += 5;
  if (sameNumericSlot(item.meta?.trimestre, meta.trimester)) score += 4;
  if (sameNumericSlot(item.meta?.unidad, meta.unit)) score += 4;
  return score;
}

function filterReadingsForMeta(rows = [], meta = {}) {
  const ranked = rows.filter(Boolean);
  const grade = normalizeGrade(meta.grade);
  const trimester = normalizeNumericSlot(meta.trimester);
  const unit = normalizeNumericSlot(meta.unit);
  const matches = (reading = {}, requireGrade = false, requireTrimester = false, requireUnit = false) => {
    if (requireGrade && grade && normalizeGrade(reading.meta?.grado) !== grade) return false;
    if (requireTrimester && trimester && normalizeNumericSlot(reading.meta?.trimestre) !== trimester) return false;
    if (requireUnit && unit && normalizeNumericSlot(reading.meta?.unidad) !== unit) return false;
    return true;
  };

  const exact = ranked.filter((reading) => matches(reading, true, true, true));
  if (exact.length) return exact;

  const gradeTrimester = ranked.filter((reading) => matches(reading, true, true, false));
  if (gradeTrimester.length) return gradeTrimester;

  const gradeUnit = ranked.filter((reading) => matches(reading, true, false, true));
  if (gradeUnit.length) return gradeUnit;

  const gradeOnly = ranked.filter((reading) => matches(reading, true, false, false));
  if (gradeOnly.length) return gradeOnly;

  const trimesterUnit = ranked.filter((reading) => matches(reading, false, true, true));
  if (trimesterUnit.length) return trimesterUnit;

  return ranked;
}

function same(a, b) {
  return normalizeKey(a) && normalizeKey(a) === normalizeKey(b);
}

function sameGrade(a, b) {
  const left = normalizeGrade(a);
  const right = normalizeGrade(b);
  return left && left === right;
}

function sameNumericSlot(a, b) {
  const left = normalizeNumericSlot(a);
  const right = normalizeNumericSlot(b);
  return left && left === right;
}

function normalizeGrade(value = "") {
  const base = normalizeKey(value);
  if (!base) return "";
  const numeric = extractLeadingNumber(base);
  if (numeric) return String(numeric);
  if (/^(primero|primer|1ro|1er)$/.test(base)) return "1";
  if (/^(segundo|2do)$/.test(base)) return "2";
  if (/^(tercero|3ro)$/.test(base)) return "3";
  if (/^(cuarto|4to)$/.test(base)) return "4";
  if (/^(quinto|5to)$/.test(base)) return "5";
  if (/^(sexto|6to)$/.test(base)) return "6";
  return base;
}

function normalizeNumericSlot(value = "") {
  const base = normalizeKey(value);
  if (!base) return "";
  const numeric = extractLeadingNumber(base);
  return numeric ? String(numeric) : base;
}

function extractLeadingNumber(value = "") {
  const match = String(value || "").match(/\b([0-9]{1,2})\b/);
  return match ? Number(match[1]) : 0;
}

function normalizeKey(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestions(row = {}) {
  const directSources = collectQuestionSources(row);
  for (const source of directSources) {
    const normalized = normalizeQuestionSource(source).filter((item) => item.texto || item.respuesta || item.criterio || item.nivel);
    if (normalized.length) return dedupeQuestions(normalized);
  }

  const htmlFallbacks = [
    row.preguntasHTML,
    row.preguntasVistaGuardadasHTML,
    row.contenidoHTML,
    row.htmlLectura,
    row.lecturaHTML,
    row.lectura,
    row.contenido,
    row.texto
  ].map((value) => String(value || "").trim()).filter(Boolean);
  for (const htmlFallback of htmlFallbacks) {
    const parsed = extractQuestionsFromHtml(htmlFallback);
    if (parsed.length) return dedupeQuestions(parsed);
  }
  return [];
}

function collectQuestionSources(row = {}) {
  return [
    row.preguntas,
    row.preguntasComprension,
    row.preguntas_comprension,
    row.questions,
    row.questionsComprension,
    row.questions_comprension,
    row.campos?.preguntas,
    row.campos?.preguntasComprension,
    row.campos?.preguntas_comprension,
    row.campos?.questions,
    row.rawData?.preguntas,
    row.rawData?.preguntasComprension,
    row.rawData?.preguntas_comprension,
    row.rawData?.questions,
    row.rawData?.campos?.preguntas,
    row.rawData?.campos?.preguntasComprension,
    row.rawData?.campos?.preguntas_comprension
  ].filter((value) => value != null && value !== "");
}

function normalizeQuestionItem(item = {}) {
  if (typeof item === "string") return parseQuestionText(item);
  const texto = String(item.texto || item.pregunta || item.prompt || item.text || "").trim();
  const respuesta = String(item.respuesta || item.answer || item.solution || "").trim();
  const criterio = String(item.criterio || item.criteria || "").trim();
  const nivel = String(item.nivel || item.level || "").trim();
  const parsedPrompt = texto ? parseQuestionText(texto) : { prompt: "", answer: "", criteria: "", level: "" };
  return {
    texto: parsedPrompt.prompt || texto,
    respuesta: respuesta || parsedPrompt.answer,
    criterio: criterio || parsedPrompt.criteria,
    nivel: nivel || parsedPrompt.level
  };
}

function parseQuestionText(text = "") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return { prompt: "", answer: "", criteria: "", level: "" };

  const answerMatch = raw.match(/(?:respuesta esperada|respuesta)\s*:\s*([\s\S]+)$/i);
  const levelMatch = raw.match(/(?:nivel taxonomico|nivel)\s*:\s*([^\n\r—-]+?)(?=\s*(?:criterio|respuesta esperada|respuesta)\s*:|$)/i);
  const criteriaMatch = raw.match(/criterio\s*:\s*([^\n\r]+?)(?=\s*(?:nivel taxonomico|nivel|respuesta esperada|respuesta)\s*:|$)/i);

  let prompt = raw;
  [answerMatch?.[0], levelMatch?.[0], criteriaMatch?.[0]].filter(Boolean).forEach((snippet) => {
    prompt = prompt.replace(snippet, " ");
  });
  prompt = prompt.replace(/^[0-9]+\.\s*/, "").replace(/\s+/g, " ").trim();

  return {
    prompt,
    answer: String(answerMatch?.[1] || "").replace(/\s+/g, " ").trim(),
    criteria: String(criteriaMatch?.[1] || "").replace(/\s+/g, " ").trim(),
    level: String(levelMatch?.[1] || "").replace(/\s+/g, " ").trim()
  };
}

function normalizeQuestionSource(value = "") {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => normalizeQuestionItem(item));
  if (typeof value === "object") {
    if (value.texto || value.pregunta || value.respuesta || value.nivel || value.criterio) {
      return [normalizeQuestionItem(value)];
    }
    if (Array.isArray(value.preguntasComprension)) return value.preguntasComprension.map((item) => normalizeQuestionItem(item));
    if (Array.isArray(value.questions)) return value.questions.map((item) => normalizeQuestionItem(item));
    if (Array.isArray(value.items)) return value.items.map((item) => normalizeQuestionItem(item));
    if (Array.isArray(value.preguntas)) return value.preguntas.map((item) => normalizeQuestionItem(item));
    const objectValues = Object.values(value);
    if (objectValues.length && objectValues.every((item) => typeof item === "object" || typeof item === "string")) {
      return objectValues.flatMap((item) => normalizeQuestionSource(item));
    }
    const single = normalizeQuestionItem(value);
    return single.texto || single.respuesta || single.criterio || single.nivel ? [single] : [];
  }
  const text = String(value || "").trim();
  if (!text) return [];
  return extractQuestionsFromHtml(text);
}

function dedupeQuestions(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [
      normalizeKey(item.texto || item.prompt || item.pregunta),
      normalizeKey(item.respuesta || item.answer),
      normalizeKey(item.criterio || item.criteria),
      normalizeKey(item.nivel || item.level)
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitReadingSections(row = {}, html = "", questions = []) {
  const narrativeHtml = extractNarrativeHtml(html);
  return {
    narrativeHtml,
    synonyms: resolveReadingSynonyms(row, html),
    questions,
    questionsHtml: Array.isArray(questions) && questions.length ? "" : String(row.preguntasHTML || row.preguntasVistaGuardadasHTML || "").trim()
  };
}

function extractNarrativeHtml(html = "") {
  const source = String(html || "").trim();
  if (!source || typeof DOMParser === "undefined") return source;
  const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  const wrap = doc.body.firstElementChild;
  if (!wrap) return source;

  wrap.querySelectorAll("table.lectura-tabla-sinonimos").forEach((node) => node.remove());

  const children = Array.from(wrap.children);
  const sectionMatchers = [
    /^(preguntas de comprension|preguntas de comprensión)$/i,
    /^(tabla de sinonimos|tabla de sinónimos|sinonimos|sinónimos|glosario|vocabulario)$/i
  ];
  let cutIndex = -1;
  children.forEach((child, index) => {
    const text = String(child.textContent || "").replace(/\s+/g, " ").trim();
    if (cutIndex === -1 && sectionMatchers.some((matcher) => matcher.test(text))) cutIndex = index;
  });
  if (cutIndex >= 0) {
    children.slice(cutIndex).forEach((node) => node.remove());
  }
  return String(wrap.innerHTML || source).trim();
}

function resolveReadingSynonyms(row = {}, html = "") {
  const structured =
    row.tablaSinonimos ||
    row.tabla_sinonimos ||
    row.sinonimos ||
    row["sinónimos"] ||
    row.sinonimosTabla ||
    row.tablaDeSinonimos ||
    row.glosario ||
    row.vocabulario ||
    "";

  const parsedStructured = normalizeSynonymEntries(structured);
  if (parsedStructured.length) return parsedStructured;

  const parsedHtml = extractSynonymRowsFromHtml(html);
  if (parsedHtml.length) return parsedHtml;

  return [];
}

function normalizeSynonymEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") {
        const parts = item.split(/[:—-]/).map((part) => part.trim()).filter(Boolean);
        return parts[0] ? { palabra: parts[0], sinonimos: parts.slice(1).join(", ") } : null;
      }
      const palabra = String(item?.palabra || item?.termino || item?.término || item?.vocabulario || "").trim();
      const sinonimos = Array.isArray(item?.sinonimos || item?.["sinónimos"])
        ? (item?.sinonimos || item?.["sinónimos"]).join(", ")
        : String(item?.sinonimos || item?.["sinónimos"] || item?.equivalente || item?.definicion || item?.definición || "").trim();
      return palabra ? { palabra, sinonimos } : null;
    }).filter((item) => item?.palabra && item?.sinonimos);
  }

  if (typeof value === "object") {
    return Object.entries(value).map(([palabra, sinonimos]) => ({
      palabra: String(palabra || "").trim(),
      sinonimos: Array.isArray(sinonimos) ? sinonimos.join(", ") : String(sinonimos || "").trim()
    })).filter((item) => item.palabra && item.sinonimos);
  }

  const text = String(value || "").trim();
  if (!text) return [];
  const fromHtml = extractSynonymRowsFromHtml(text);
  if (fromHtml.length) return fromHtml;
  return text
    .split(/\n|;/)
    .map((line) => {
      const parts = String(line || "").split(/[:—-]/).map((part) => part.trim()).filter(Boolean);
      return parts[0] ? { palabra: parts[0], sinonimos: parts.slice(1).join(", ") } : null;
    })
    .filter((item) => item?.palabra && item?.sinonimos);
}

function extractSynonymRowsFromHtml(html = "") {
  const source = String(html || "").trim();
  if (!source || typeof DOMParser === "undefined" || !/<table[\s\S]*?>/i.test(source)) return [];
  const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  const table = doc.querySelector("table.lectura-tabla-sinonimos, table");
  if (!table) return [];
  return Array.from(table.querySelectorAll("tr"))
    .map((row) => Array.from(row.querySelectorAll("td, th")).map((cell) => String(cell.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean))
    .filter((cells) => cells.length >= 2)
    .map((cells) => ({ palabra: cells[0], sinonimos: cells[1] }))
    .filter((item) => item.palabra && item.sinonimos && !isSynonymMetaLine(item.palabra) && !isSynonymMetaLine(item.sinonimos));
}

function isSynonymMetaLine(text = "") {
  return /^(tabla de sinonimos|tabla de sinónimos|sinonimos|sinónimos|glosario|vocabulario|palabra|sinonimo|sinónimo|sinonimos sencillos|sinónimos sencillos)$/i.test(String(text || "").trim());
}

function extractQuestionsFromHtml(html = "") {
  const source = String(html || "").trim();
  if (!source) return [];
  if (typeof DOMParser !== "undefined" && /<(ol|ul|div|section|article|table|p)[\s\S]*>/i.test(source)) {
    const doc = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return [];
    const questionContainers = Array.from(root.querySelectorAll("ol, ul, table, .cb-reading-questions, .preguntas, .preguntas-lectura"));
    const candidates = [];
    if (questionContainers.length) {
      questionContainers.forEach((container) => {
        candidates.push(...Array.from(container.querySelectorAll("li, tr, p")));
      });
    } else {
      candidates.push(...Array.from(root.querySelectorAll("li, p, tr")));
    }
    const structured = candidates
      .map((node) => extractQuestionFromNode(node))
      .filter(Boolean);
    if (structured.length) return dedupeQuestions(structured);

    const heading = Array.from(root.querySelectorAll("*")).find((node) => /preguntas de comprension|preguntas de comprensión/i.test(String(node.textContent || "").trim()));
    if (!heading) return [];
    const following = [];
    let node = heading.nextElementSibling;
    while (node) {
      if (/^(h1|h2|h3|h4|h5|h6)$/i.test(node.tagName) && /preguntas de comprension|preguntas de comprensión/i.test(String(node.textContent || "").trim())) break;
      following.push(node);
      node = node.nextElementSibling;
    }
    return following.map((item) => extractQuestionFromNode(item)).filter(Boolean);
  }

  return source
    .split(/\n+/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((text) => {
      const answerMatch = text.match(/respuesta\s*:?\s*(.+)$/i);
      const prompt = text.replace(/respuesta\s*:?\s*.+$/i, "").trim();
      return normalizeQuestionItem({
        pregunta: prompt || text,
        respuesta: answerMatch?.[1] || ""
      });
    })
    .filter((item) => item.prompt || item.answer);
}

function extractQuestionFromNode(node = null) {
  if (!node) return null;
  const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/^preguntas de comprension|^preguntas de comprensión$/i.test(text)) return null;
  const labelTexts = extractQuestionLabelsFromNode(node);
  const bodyText = stripQuestionLabels(text, labelTexts);
  const parsed = parseQuestionText(bodyText);
  if (!parsed.prompt) {
    const firstSentence = bodyText.split(/(?<=[.!?])\s+/)[0] || bodyText;
    parsed.prompt = firstSentence.replace(/^[0-9]+\.\s*/, "").trim();
  }
  const data = {
    texto: parsed.prompt || bodyText,
    nivel: labelTexts.nivel || parsed.level,
    criterio: labelTexts.criterio || parsed.criteria,
    respuesta: labelTexts.respuesta || parsed.answer
  };
  if (!data.texto && !data.respuesta && !data.nivel && !data.criterio) return null;
  return data;
}

function extractQuestionLabelsFromNode(node = null) {
  const out = { nivel: "", criterio: "", respuesta: "" };
  if (!node || typeof node.querySelectorAll !== "function") return out;
  const labelNodes = node.querySelectorAll("strong, b");
  labelNodes.forEach((labelNode) => {
    const labelText = normalizeKey(labelNode.textContent || "");
    const value = normalizeLabelValue(labelNode);
    if (/^nivel/.test(labelText)) out.nivel = out.nivel || value;
    if (/^criterio/.test(labelText)) out.criterio = out.criterio || value;
    if (/^respuesta/.test(labelText)) out.respuesta = out.respuesta || value;
  });
  return out;
}

function normalizeLabelValue(labelNode = null) {
  if (!labelNode) return "";
  const parent = labelNode.parentElement;
  if (!parent) return "";
  const clone = parent.cloneNode(true);
  clone.querySelectorAll("strong, b").forEach((n) => n.remove());
  return String(clone.textContent || "").replace(/^[\s:—-]+/, "").replace(/\s+/g, " ").trim();
}

function stripQuestionLabels(text = "", labels = {}) {
  let out = String(text || "");
  Object.values(labels || {}).forEach((value) => {
    if (value) out = out.replace(value, " ");
  });
  return out.replace(/nivel\s*:\s*[^—-]+/i, "").replace(/criterio\s*:\s*[^—-]+/i, "").replace(/respuesta esperada\s*:\s*[^—-]+/i, "").replace(/respuesta\s*:\s*[^—-]+/i, "").replace(/\s+/g, " ").trim();
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}
