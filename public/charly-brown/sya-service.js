import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDefaultFirebaseApp } from "../js/firebase-default-app.js";
import { ALL_OPTION, getCategoriesForGrade } from "./unit-contracts.js";

const app = getDefaultFirebaseApp();
const db = getFirestore(app);

export async function loadSyaForMeta(meta = {}) {
  const docs = await loadSyaDocs();
  if (!docs.length) return buildFallbackSya(meta);
  const matches = docs
    .map((doc) => ({ ...doc, score: scoreSyaDoc(doc, meta) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = matches[0] || docs[0];
  return normalizeSyaDoc(best.data || {});
}

export function normalizeSyaDoc(data = {}) {
  const out = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value == null) return;
    if (["nivel", "grado", "trimestre", "unidad", "fechaCreacion"].includes(key)) return;
    if (typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        if (nestedValue == null) return;
        out[nestedKey] = String(nestedValue || "").trim();
      });
      return;
    }
    out[key] = String(value || "").trim();
  });
  return out;
}

export function buildFallbackSya(meta = {}) {
  const categories = getCategoriesForGrade(meta.grade);
  const out = {};
  Object.values(categories).flat().forEach((subtema) => {
    out[`${subtema}_T`] = `Tema sugerido para ${subtema}`;
    out[`${subtema}_AE`] = `Aprendizaje esperado de ${subtema}`;
    out[`${subtema}_C`] = `Contenido central de ${subtema}`;
    out[`${subtema}_P`] = `Proceso o práctica para trabajar ${subtema}`;
  });
  return out;
}

export function getSyaGroupedByCategory(meta = {}, sya = {}) {
  const categories = filterCategoriesBySelection(meta, getCategoriesForGrade(meta.grade));
  const grouped = [];
  Object.entries(categories).forEach(([category, subtopics]) => {
    const items = subtopics
      .map((subtopic) => buildSubtopicSyaEntry(sya, subtopic))
      .filter((entry) => entry && Object.values(entry.fields).some(Boolean));
    if (items.length) grouped.push({ category, items });
  });
  return grouped.length ? grouped : buildFallbackGroupedSya(meta, sya);
}

export function getFocusedSya(meta = {}, sya = {}) {
  const subtopic = String(meta.subtopic || "").trim();
  if (!subtopic || subtopic === ALL_OPTION) return { category: meta.category || "", subtopic: "", fields: {}, summary: "" };
  const category = inferCategoryForSubtopic(meta, getCategoriesForGrade(meta.grade), subtopic);
  const fields = buildSubtopicSyaFields(sya, subtopic);
  const summary = [
    fields.T ? `Tema (T): ${fields.T}` : "",
    fields.AE ? `Aprendizaje esperado (AE): ${fields.AE}` : "",
    fields.C ? `Contenido (C): ${fields.C}` : "",
    fields.P ? `Proceso o práctica (P): ${fields.P}` : ""
  ].filter(Boolean).join("\n");
  return {
    category,
    subtopic,
    fields,
    summary
  };
}

export function hasAllSelection(value = "") {
  return String(value || "").trim() === ALL_OPTION;
}

export function describeSyaSelection(meta = {}) {
  const category = String(meta.category || "").trim();
  const subtopic = String(meta.subtopic || "").trim();
  if (hasAllSelection(category) && hasAllSelection(subtopic)) return "todas las categorías y todos los subtemas seleccionados";
  if (hasAllSelection(subtopic)) return `todos los subtemas de ${category || "la categoría activa"}`;
  return `${category || "Categoría"} · ${subtopic || "Subtema"}`;
}

function filterCategoriesBySelection(meta = {}, categories = {}) {
  const selectedCategory = String(meta.category || "").trim();
  const selectedSubtopic = String(meta.subtopic || "").trim();
  const categoryEntries = hasAllSelection(selectedCategory) || !selectedCategory
    ? Object.entries(categories)
    : Object.entries(categories).filter(([category]) => category === selectedCategory);

  return Object.fromEntries(categoryEntries.map(([category, subtopics]) => {
    if (hasAllSelection(selectedSubtopic) || !selectedSubtopic) return [category, subtopics];
    const filtered = subtopics.filter((subtopic) => sameSubtopic(subtopic, selectedSubtopic));
    return [category, filtered];
  }).filter(([, subtopics]) => Array.isArray(subtopics) && subtopics.length));
}

function inferCategoryForSubtopic(meta = {}, categories = {}, subtopic = "") {
  const selectedCategory = String(meta.category || "").trim();
  if (selectedCategory && selectedCategory !== ALL_OPTION && categories[selectedCategory]?.includes(subtopic)) {
    return selectedCategory;
  }
  return Object.keys(categories).find((category) => categories[category]?.includes(subtopic)) || selectedCategory || "";
}

function buildSubtopicSyaEntry(sya = {}, subtopic = "") {
  const fields = buildSubtopicSyaFields(sya, subtopic);
  return {
    subtopic,
    fields
  };
}

function buildSubtopicSyaFields(sya = {}, subtopic = "") {
  const keys = resolveSyaKeyBases(subtopic);
  const normalizedMap = buildNormalizedSyaFieldMap(sya);
  return {
    T: pickFirstSyaValue(sya, normalizedMap, keys, "T") || pickByPrefix(normalizedMap, keys, "T"),
    AE: pickFirstSyaValue(sya, normalizedMap, keys, "AE") || pickByPrefix(normalizedMap, keys, "AE"),
    C: pickFirstSyaValue(sya, normalizedMap, keys, "C") || pickByPrefix(normalizedMap, keys, "C"),
    P: pickFirstSyaValue(sya, normalizedMap, keys, "P") || pickByPrefix(normalizedMap, keys, "P")
  };
}

function pickFirstSyaValue(sya = {}, normalizedMap = {}, keyBases = [], suffix = "") {
  for (const base of keyBases) {
    const key = `${base}_${suffix}`;
    const value = String(sya?.[key] || "").trim();
    if (value) return value;
    const normalizedKey = normalizeSyaLookupKey(key);
    const fallbackValue = String(normalizedMap?.[normalizedKey] || "").trim();
    if (fallbackValue) return fallbackValue;
  }
  return "";
}

function resolveSyaKeyBases(subtopic = "") {
  const safe = String(subtopic || "").trim();
  if (!safe) return [];
  const compact = safe.replace(/\s+/g, "");
  const lowerFirst = compact ? compact.charAt(0).toLowerCase() + compact.slice(1) : "";
  const normalized = normalizeSyaLookupKey(compact);
  const aliases = new Set([safe, compact, lowerFirst]);
  if (compact === "ConocimientoDelMedio" || normalized === "conocimientodelmedio") aliases.add("conocimientoDelMedio");
  if (compact === "Ortografía" || normalized === "ortografia") aliases.add("Ortografia");
  if (compact === "ComprensionLectora" || normalized === "comprensionlectora") {
    aliases.add("Lectura");
    aliases.add("ComprensiónLectora");
    aliases.add("Comprension Lectora");
  }
  if (compact === "ExpresionEscrita" || normalized === "expresionescrita") aliases.add("ExpresiónEscrita");
  if (compact === "ExpresionOral" || normalized === "expresionoral") aliases.add("ExpresiónOral");
  if (compact === "Matematicas" || normalized === "matematicas") aliases.add("Matemáticas");
  return Array.from(aliases).filter(Boolean);
}

function buildNormalizedSyaFieldMap(sya = {}) {
  const out = {};
  Object.entries(sya || {}).forEach(([key, value]) => {
    const safeValue = String(value || "").trim();
    if (!safeValue) return;
    out[normalizeSyaLookupKey(key)] = safeValue;
  });
  return out;
}

function pickByPrefix(normalizedMap = {}, keyBases = [], suffix = "") {
  const prefixes = keyBases.map((base) => normalizeSyaLookupKey(`${base}_${suffix}`)).filter(Boolean);
  for (const [key, value] of Object.entries(normalizedMap || {})) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) return String(value || "").trim();
  }
  return "";
}

function buildFallbackGroupedSya(meta = {}, sya = {}) {
  const categories = getCategoriesForGrade(meta.grade);
  return Object.entries(categories)
    .map(([category, subtopics]) => ({
      category,
      items: subtopics.map((subtopic) => ({ subtopic, fields: buildSubtopicSyaFields(sya, subtopic) }))
    }))
    .filter((group) => group.items.some((item) => Object.values(item.fields).some(Boolean)));
}

async function loadSyaDocs() {
  const snap = await getDocs(collection(db, "secuenciaAlcance"));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
}

function scoreSyaDoc(doc = {}, meta = {}) {
  const data = doc.data || {};
  let score = 0;
  const level = normalizeSyaLookupKey(meta.level || "");
  const grade = normalizeSyaLookupKey(meta.grade || "");
  const trimester = normalizeSyaLookupKey(meta.trimester || "");
  const unit = normalizeSyaLookupKey(meta.unit || "");

  if (level && normalizeSyaLookupKey(data.nivel || "") === level) score += 4;
  if (grade && normalizeSyaLookupKey(data.grado || "") === grade) score += 4;
  if (trimester && normalizeSyaLookupKey(data.trimestre || "") === trimester) score += 4;
  if (unit && normalizeSyaLookupKey(data.unidad || "") === unit) score += 4;

  // Prefer docs that already contain curricular keys.
  const keys = Object.keys(data);
  if (keys.some((key) => /_(T|AE|C|P)$/i.test(key))) score += 2;
  if (keys.some((key) => /_/i.test(key))) score += 1;
  return score;
}

function sameSubtopic(a = "", b = "") {
  return normalizeSyaLookupKey(a) === normalizeSyaLookupKey(b);
}

function normalizeSyaLookupKey(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, "")
    .toLowerCase()
    .trim();
}
