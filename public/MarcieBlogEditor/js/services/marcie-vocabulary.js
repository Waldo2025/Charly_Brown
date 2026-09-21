export const MARCIE_VOCABULARY_STORAGE_KEY = "marcie_editorial_vocabulary_v1";

export const DEFAULT_EDITORIAL_VOCABULARY = Object.freeze([
  "Neuroplasticidad", "Neurodesarrollo", "Aprendizaje", "Memoria", "Atención",
  "Funciones ejecutivas", "Memoria de trabajo", "Control inhibitorio", "Flexibilidad cognitiva",
  "Metacognición", "Autorregulación", "Motivación", "Emoción", "Sistema de recompensa",
  "Dopamina", "Estrés", "Cortisol", "Seguridad emocional", "Bienestar", "Sueño",
  "Consolidación de la memoria", "Recuperación de la información", "Práctica de recuperación",
  "Práctica distribuida", "Conocimientos previos", "Aprendizaje significativo",
  "Transferencia del aprendizaje", "Retroalimentación", "Error", "Curiosidad",
  "Participación activa", "Carga cognitiva", "Procesamiento de la información",
  "Pensamiento crítico", "Resolución de problemas", "Toma de decisiones", "Lenguaje",
  "Lectura", "Comprensión", "Interacción social", "Cognición social", "Sentido de pertenencia",
  "Autonomía", "Resiliencia", "Adolescencia", "Desarrollo infantil", "Poda sináptica",
  "Mielinización", "Sinapsis", "Redes neuronales", "Corteza prefrontal", "Hipocampo",
  "Amígdala", "Sistema límbico", "Experiencia", "Ambiente de aprendizaje",
  "Estrategias de enseñanza", "Evidencia científica", "Práctica basada en evidencia",
  "Evaluación formativa", "Inclusión", "Diversidad", "Diseño Universal para el Aprendizaje",
  "DUA", "Aprendizaje colaborativo", "Aprendizaje activo", "Desarrollo socioemocional",
  "Plasticidad cerebral", "Neurociencia educativa", "Cerebro en desarrollo"
]);

function vocabularyKey(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normalizeEditorialVocabulary(value = []) {
  const entries = Array.isArray(value) ? value : String(value || "").split(/[\n,;]+/);
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const term = String(entry || "").replace(/\s+/g, " ").trim().slice(0, 100);
    const key = vocabularyKey(term);
    if (!term || seen.has(key)) continue;
    seen.add(key);
    normalized.push(term);
    if (normalized.length >= 250) break;
  }
  return normalized;
}

export function readEditorialVocabulary(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem?.(MARCIE_VOCABULARY_STORAGE_KEY) || "null");
    const normalized = normalizeEditorialVocabulary(saved);
    return normalized.length ? normalized : [...DEFAULT_EDITORIAL_VOCABULARY];
  } catch (_) {
    return [...DEFAULT_EDITORIAL_VOCABULARY];
  }
}

export function saveEditorialVocabulary(value, storage = globalThis.localStorage) {
  const normalized = normalizeEditorialVocabulary(value);
  try { storage?.setItem?.(MARCIE_VOCABULARY_STORAGE_KEY, JSON.stringify(normalized)); } catch (_) {}
  return normalized;
}

export function buildEditorialVocabularyInstruction(value = []) {
  const terms = normalizeEditorialVocabulary(value);
  if (!terms.length) return "";
  return `Vocabulario editorial preferente: ${terms.join("; ")}. Usa únicamente los términos que resulten naturales, pertinentes para el tema y compatibles con la evidencia disponible. No insertes palabras por cuota, no fuerces referencias neurocientíficas y define brevemente un tecnicismo cuando la audiencia pueda necesitarlo.`;
}
