import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getDefaultFirebaseApp } from "../js/firebase-default-app.js";

export const PREFERRED_VOCABULARY_STUDENT_STORAGE_KEY = "cb_preferred_vocab_student_v2";
export const PREFERRED_VOCABULARY_TEACHER_STORAGE_KEY = "cb_preferred_vocab_teacher_v2";
export const PREFERRED_VOCABULARY_LEGACY_STORAGE_KEY = "cb_preferred_vocabulary_v1";

const CONFIG_COLLECTION = "charlyBrownConfig";
const VOCABULARY_DOC_ID = "preferredVocabulary";

export const STUDENT_CATEGORIES = Object.freeze([
  { id: "reto", label: "⚡ Reto Cognitivo", color: "blue", desc: "Consignas de justificación, contraste y deducción" },
  { id: "indagacion", label: "🔍 Indagación & Análisis", color: "indigo", desc: "Investigación, tablas y relaciones causa-efecto" },
  { id: "colaborativo", label: "🤝 Trabajo Colaborativo", color: "amber", desc: "Asamblea, diálogo y acuerdos en equipo" },
  { id: "creatividad", label: "🎨 Creatividad & Expresión", color: "rose", desc: "Bocetos, historietas y propuestas originales" },
  { id: "personalizada", label: "⭐ Personalizadas", color: "slate", desc: "Expresiones agregadas por el docente" }
]);

export const TEACHER_CATEGORIES = Object.freeze([
  { id: "neuroeducacion", label: "🧠 Neuroeducación", color: "emerald", desc: "Memoria de trabajo, atención y plasticidad" },
  { id: "andamiaje", label: "📐 Andamiaje & Metacognición", color: "blue", desc: "Modelado, ZDP y retroalimentación formativa" },
  { id: "nem", label: "🌱 Enfoque NEM & Comunidad", color: "teal", desc: "Aprendizaje situado y saberes comunitarios" },
  { id: "dua", label: "♿ DUA & Accesibilidad", color: "purple", desc: "Ajustes razonables y apoyos multisensoriales" },
  { id: "personalizada", label: "⭐ Personalizadas", color: "slate", desc: "Conceptos agregados por el docente" }
]);

export const DEFAULT_STUDENT_ITEMS = Object.freeze([
  // Reto cognitivo
  { text: "argumenta con evidencias", category: "reto" },
  { text: "justifica tu razonamiento", category: "reto" },
  { text: "formula y contrasta tu hipótesis", category: "reto" },
  { text: "compara semejanzas y diferencias", category: "reto" },
  { text: "deduce el patrón o regla", category: "reto" },
  { text: "sintetiza tus conclusiones", category: "reto" },
  { text: "diseña una propuesta creativa", category: "reto" },
  // Indagación
  { text: "investiga y registra tus hallazgos", category: "indagacion" },
  { text: "analiza causas y consecuencias", category: "indagacion" },
  { text: "organiza la información en una tabla", category: "indagacion" },
  { text: "distingue hechos de opiniones", category: "indagacion" },
  { text: "elabora un organizador gráfico", category: "indagacion" },
  { text: "propón una solución fundamentada", category: "indagacion" },
  // Colaborativo
  { text: "dialoga y llega a acuerdos", category: "colaborativo" },
  { text: "comparte tus reflexiones en asamblea", category: "colaborativo" },
  { text: "escucha con empatía y respeto", category: "colaborativo" },
  { text: "evalúa el trabajo de tu equipo", category: "colaborativo" },
  { text: "construyan una postura colectiva", category: "colaborativo" },
  // Creatividad
  { text: "diseña una historieta o boceto", category: "creatividad" },
  { text: "expresa tu postura con originalidad", category: "creatividad" },
  { text: "transforma la información en un cuento", category: "creatividad" },
  { text: "crea un cartel de divulgación", category: "creatividad" }
]);

export const DEFAULT_TEACHER_ITEMS = Object.freeze([
  // Neuroeducación
  { text: "activación de conocimientos previos", category: "neuroeducacion" },
  { text: "atención sostenida", category: "neuroeducacion" },
  { text: "carga cognitiva dosificada", category: "neuroeducacion" },
  { text: "memoria de trabajo", category: "neuroeducacion" },
  { text: "plasticidad cerebral", category: "neuroeducacion" },
  { text: "vínculo emocional positivo", category: "neuroeducacion" },
  { text: "curiosidad detonante", category: "neuroeducacion" },
  { text: "pausa activa reflexiva", category: "neuroeducacion" },
  { text: "consolidación del aprendizaje", category: "neuroeducacion" },
  { text: "activación multisensorial", category: "neuroeducacion" },
  { text: "autorregulación emocional", category: "neuroeducacion" },
  // Andamiaje
  { text: "andamiaje pedagógico", category: "andamiaje" },
  { text: "metacognición guiada", category: "andamiaje" },
  { text: "zona de desarrollo próximo", category: "andamiaje" },
  { text: "transferencia a situaciones reales", category: "andamiaje" },
  { text: "retroalimentación formativa", category: "andamiaje" },
  { text: "evaluación auténtica", category: "andamiaje" },
  { text: "modelamiento explícito", category: "andamiaje" },
  { text: "consigna estructurada", category: "andamiaje" },
  // NEM
  { text: "aprendizaje situado", category: "nem" },
  { text: "problematización de la realidad", category: "nem" },
  { text: "diálogo reflexivo en comunidad", category: "nem" },
  { text: "toma de acuerdos colaborativa", category: "nem" },
  { text: "pensamiento crítico y reflexivo", category: "nem" },
  { text: "inclusión y equidad educativa", category: "nem" },
  { text: "saberes comunitarios", category: "nem" },
  // DUA
  { text: "diseño universal para el aprendizaje", category: "dua" },
  { text: "ajustes razonables", category: "dua" },
  { text: "apoyos visuales y manipulativos", category: "dua" },
  { text: "múltiples formas de representación", category: "dua" },
  { text: "ritmos diversos de aprendizaje", category: "dua" },
  { text: "instrucción multinivel", category: "dua" }
]);

export const DEFAULT_STUDENT_VOCABULARY = Object.freeze(DEFAULT_STUDENT_ITEMS.map(item => item.text));
export const DEFAULT_TEACHER_VOCABULARY = Object.freeze(DEFAULT_TEACHER_ITEMS.map(item => item.text));
export const DEFAULT_PREFERRED_VOCABULARY = Object.freeze([...DEFAULT_STUDENT_VOCABULARY, ...DEFAULT_TEACHER_VOCABULARY]);

export const STUDENT_VOCABULARY_PRESETS = Object.freeze({
  "⚡ Consignas y Reto Cognitivo": DEFAULT_STUDENT_ITEMS.filter(i => i.category === "reto").map(i => i.text),
  "🔍 Indagación y Pensamiento Crítico": DEFAULT_STUDENT_ITEMS.filter(i => i.category === "indagacion").map(i => i.text),
  "🤝 Trabajo Colaborativo": DEFAULT_STUDENT_ITEMS.filter(i => i.category === "colaborativo").map(i => i.text),
  "🎨 Creatividad y Expresión": DEFAULT_STUDENT_ITEMS.filter(i => i.category === "creatividad").map(i => i.text)
});

export const TEACHER_VOCABULARY_PRESETS = Object.freeze({
  "🧠 Neuroeducación y Cognición": DEFAULT_TEACHER_ITEMS.filter(i => i.category === "neuroeducacion").map(i => i.text),
  "📐 Andamiaje & Metacognición": DEFAULT_TEACHER_ITEMS.filter(i => i.category === "andamiaje").map(i => i.text),
  "🌱 Enfoque NEM & Comunidad": DEFAULT_TEACHER_ITEMS.filter(i => i.category === "nem").map(i => i.text),
  "♿ DUA y Accesibilidad": DEFAULT_TEACHER_ITEMS.filter(i => i.category === "dua").map(i => i.text)
});

export const VOCABULARY_PRESETS = Object.freeze({
  ...STUDENT_VOCABULARY_PRESETS,
  ...TEACHER_VOCABULARY_PRESETS
});

let inMemoryStudentItems = null;
let inMemoryTeacherItems = null;
let firestoreUnsubscribe = null;

function getDb() {
  try {
    const app = getDefaultFirebaseApp();
    return getFirestore(app);
  } catch (_) {
    return null;
  }
}

function getAuthInstance() {
  try {
    const app = getDefaultFirebaseApp();
    return getAuth(app);
  } catch (_) {
    return null;
  }
}

let authListenerUnsubscribe = null;

function attachFirestoreListener(db, onUpdate) {
  if (!db) return;
  try {
    const docRef = doc(db, CONFIG_COLLECTION, VOCABULARY_DOC_ID);
    if (firestoreUnsubscribe) {
      try { firestoreUnsubscribe(); } catch (_) {}
      firestoreUnsubscribe = null;
    }

    firestoreUnsubscribe = onSnapshot(docRef, (snap) => {
      if (snap && snap.exists()) {
        const data = snap.data();
        let changed = false;

        if (Array.isArray(data?.studentItems) && data.studentItems.length > 0) {
          inMemoryStudentItems = normalizeItemsList(data.studentItems, "student");
          saveStudentToLocalStorage(inMemoryStudentItems);
          changed = true;
        } else if (Array.isArray(data?.studentWords) && data.studentWords.length > 0) {
          inMemoryStudentItems = normalizeWordsToItems(data.studentWords, "student");
          saveStudentToLocalStorage(inMemoryStudentItems);
          changed = true;
        }

        if (Array.isArray(data?.teacherItems) && data.teacherItems.length > 0) {
          inMemoryTeacherItems = normalizeItemsList(data.teacherItems, "teacher");
          saveTeacherToLocalStorage(inMemoryTeacherItems);
          changed = true;
        } else if (Array.isArray(data?.teacherWords) && data.teacherWords.length > 0) {
          inMemoryTeacherItems = normalizeWordsToItems(data.teacherWords, "teacher");
          saveTeacherToLocalStorage(inMemoryTeacherItems);
          changed = true;
        }

        if (changed && typeof onUpdate === "function") {
          onUpdate({
            studentItems: inMemoryStudentItems,
            teacherItems: inMemoryTeacherItems,
            studentWords: inMemoryStudentItems.map(i => i.text),
            teacherWords: inMemoryTeacherItems.map(i => i.text)
          });
        }
      }
    }, (error) => {
      const errMsg = error?.message || String(error || "");
      if (error?.code === "permission-denied" || errMsg.includes("permissions") || errMsg.includes("permission")) {
        // Expected fallback when user lacks Firestore permissions; stay on local storage
        if (firestoreUnsubscribe) {
          try { firestoreUnsubscribe(); } catch (_) {}
          firestoreUnsubscribe = null;
        }
      } else {
        console.warn("[charly-brown] Firestore vocabulary listener notice:", errMsg);
      }
    });
  } catch (err) {
    // Quiet fallback to local state
  }
}

export function initPreferredVocabulary({ onUpdate = null } = {}) {
  if (!inMemoryStudentItems || !inMemoryTeacherItems) {
    loadAllFromLocalStorage();
  }

  const db = getDb();
  if (!db) return;

  const auth = getAuthInstance();
  if (auth && typeof onAuthStateChanged === "function") {
    if (auth?.currentUser) {
      attachFirestoreListener(db, onUpdate);
    }
    if (!authListenerUnsubscribe) {
      authListenerUnsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          attachFirestoreListener(db, onUpdate);
        } else if (firestoreUnsubscribe) {
          try { firestoreUnsubscribe(); } catch (_) {}
          firestoreUnsubscribe = null;
        }
      });
    }
  } else {
    attachFirestoreListener(db, onUpdate);
  }
}

export async function fetchPreferredVocabularyFromFirestore() {
  const db = getDb();
  if (!db) return getPreferredVocabularyState();

  try {
    const docRef = doc(db, CONFIG_COLLECTION, VOCABULARY_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data?.studentItems) && data.studentItems.length > 0) {
        inMemoryStudentItems = normalizeItemsList(data.studentItems, "student");
        saveStudentToLocalStorage(inMemoryStudentItems);
      } else if (Array.isArray(data?.studentWords) && data.studentWords.length > 0) {
        inMemoryStudentItems = normalizeWordsToItems(data.studentWords, "student");
        saveStudentToLocalStorage(inMemoryStudentItems);
      }

      if (Array.isArray(data?.teacherItems) && data.teacherItems.length > 0) {
        inMemoryTeacherItems = normalizeItemsList(data.teacherItems, "teacher");
        saveTeacherToLocalStorage(inMemoryTeacherItems);
      } else if (Array.isArray(data?.teacherWords) && data.teacherWords.length > 0) {
        inMemoryTeacherItems = normalizeWordsToItems(data.teacherWords, "teacher");
        saveTeacherToLocalStorage(inMemoryTeacherItems);
      }

      return getPreferredVocabularyState();
    }
  } catch (error) {
    console.warn("[charly-brown] fetchPreferredVocabularyFromFirestore fallback:", error?.message || error);
  }

  return getPreferredVocabularyState();
}

function loadAllFromLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    inMemoryStudentItems = [...DEFAULT_STUDENT_ITEMS];
    inMemoryTeacherItems = [...DEFAULT_TEACHER_ITEMS];
    return;
  }

  try {
    const rawStudent = window.localStorage.getItem(PREFERRED_VOCABULARY_STUDENT_STORAGE_KEY);
    const rawTeacher = window.localStorage.getItem(PREFERRED_VOCABULARY_TEACHER_STORAGE_KEY);

    if (rawStudent) {
      const parsed = JSON.parse(rawStudent);
      inMemoryStudentItems = Array.isArray(parsed) && parsed.length > 0 ? normalizeItemsList(parsed, "student") : [...DEFAULT_STUDENT_ITEMS];
    } else {
      inMemoryStudentItems = [...DEFAULT_STUDENT_ITEMS];
    }

    if (rawTeacher) {
      const parsed = JSON.parse(rawTeacher);
      inMemoryTeacherItems = Array.isArray(parsed) && parsed.length > 0 ? normalizeItemsList(parsed, "teacher") : [...DEFAULT_TEACHER_ITEMS];
    } else {
      inMemoryTeacherItems = [...DEFAULT_TEACHER_ITEMS];
    }
  } catch (_) {
    inMemoryStudentItems = [...DEFAULT_STUDENT_ITEMS];
    inMemoryTeacherItems = [...DEFAULT_TEACHER_ITEMS];
  }
}

function saveStudentToLocalStorage(list = []) {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(PREFERRED_VOCABULARY_STUDENT_STORAGE_KEY, JSON.stringify(list));
    } catch (_) {}
  }
}

function saveTeacherToLocalStorage(list = []) {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(PREFERRED_VOCABULARY_TEACHER_STORAGE_KEY, JSON.stringify(list));
    } catch (_) {}
  }
}

export function getPreferredVocabularyState() {
  if (!inMemoryStudentItems || !inMemoryTeacherItems) {
    loadAllFromLocalStorage();
  }
  return {
    studentItems: [...(inMemoryStudentItems || DEFAULT_STUDENT_ITEMS)],
    teacherItems: [...(inMemoryTeacherItems || DEFAULT_TEACHER_ITEMS)],
    studentWords: (inMemoryStudentItems || DEFAULT_STUDENT_ITEMS).map(i => i.text),
    teacherWords: (inMemoryTeacherItems || DEFAULT_TEACHER_ITEMS).map(i => i.text)
  };
}

export function getStudentVocabulary() {
  const state = getPreferredVocabularyState();
  return state.studentWords;
}

export function getTeacherVocabulary() {
  const state = getPreferredVocabularyState();
  return state.teacherWords;
}

export function getStudentVocabularyItems() {
  const state = getPreferredVocabularyState();
  return state.studentItems;
}

export function getTeacherVocabularyItems() {
  const state = getPreferredVocabularyState();
  return state.teacherItems;
}

export function getPreferredVocabulary(options = {}) {
  const target = typeof options === "string" ? options : (options?.target || "all");
  const state = getPreferredVocabularyState();
  if (target === "student") return state.studentWords;
  if (target === "teacher") return state.teacherWords;
  return [...state.studentWords, ...state.teacherWords];
}

export async function savePreferredVocabulary(payload = {}) {
  let studentItems = null;
  let teacherItems = null;

  if (Array.isArray(payload)) {
    studentItems = normalizeWordsToItems(payload, "student");
    teacherItems = getTeacherVocabularyItems();
  } else {
    if (Array.isArray(payload.studentItems)) {
      studentItems = normalizeItemsList(payload.studentItems, "student");
    } else if (Array.isArray(payload.studentWords)) {
      studentItems = normalizeWordsToItems(payload.studentWords, "student");
    } else {
      studentItems = getStudentVocabularyItems();
    }

    if (Array.isArray(payload.teacherItems)) {
      teacherItems = normalizeItemsList(payload.teacherItems, "teacher");
    } else if (Array.isArray(payload.teacherWords)) {
      teacherItems = normalizeWordsToItems(payload.teacherWords, "teacher");
    } else {
      teacherItems = getTeacherVocabularyItems();
    }
  }

  inMemoryStudentItems = [...studentItems];
  inMemoryTeacherItems = [...teacherItems];
  saveStudentToLocalStorage(studentItems);
  saveTeacherToLocalStorage(teacherItems);

  // Persist to Cloud Firestore for all users
  const db = getDb();
  const auth = getAuthInstance();
  if (db) {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, VOCABULARY_DOC_ID);
      await setDoc(docRef, {
        studentItems,
        teacherItems,
        studentWords: studentItems.map(i => i.text),
        teacherWords: teacherItems.map(i => i.text),
        words: [...studentItems.map(i => i.text), ...teacherItems.map(i => i.text)],
        updatedAt: new Date().toISOString(),
        updatedBy: auth?.currentUser?.uid || "anonymous_docente"
      }, { merge: true });
    } catch (error) {
      console.warn("[charly-brown] Could not save vocabulary to Firestore:", error?.message || error);
    }
  }

  return {
    studentItems,
    teacherItems,
    studentWords: studentItems.map(i => i.text),
    teacherWords: teacherItems.map(i => i.text)
  };
}

export function addPreferredWord(word = "", target = "student", category = "personalizada") {
  const cleanWord = String(word || "").trim().replace(/\s+/g, " ");
  if (!cleanWord) return target === "teacher" ? getTeacherVocabularyItems() : getStudentVocabularyItems();

  const state = getPreferredVocabularyState();
  const list = target === "teacher" ? state.teacherItems : state.studentItems;
  const exists = list.some(w => w.text.toLowerCase() === cleanWord.toLowerCase());

  if (!exists) {
    list.push({ text: cleanWord, category: category || inferCategory(cleanWord, target) });
    if (target === "teacher") {
      savePreferredVocabulary({ teacherItems: list });
    } else {
      savePreferredVocabulary({ studentItems: list });
    }
  }
  return list;
}

export function updatePreferredWord(oldText = "", newText = "", newCategory = "", target = "student") {
  const cleanOld = String(oldText || "").trim().toLowerCase();
  const cleanNew = String(newText || "").trim().replace(/\s+/g, " ");
  if (!cleanOld || !cleanNew) return target === "teacher" ? getTeacherVocabularyItems() : getStudentVocabularyItems();

  const state = getPreferredVocabularyState();
  const list = target === "teacher" ? state.teacherItems : state.studentItems;

  const itemIndex = list.findIndex(w => w.text.toLowerCase() === cleanOld);
  if (itemIndex !== -1) {
    list[itemIndex].text = cleanNew;
    if (newCategory) list[itemIndex].category = newCategory;
    if (target === "teacher") {
      savePreferredVocabulary({ teacherItems: list });
    } else {
      savePreferredVocabulary({ studentItems: list });
    }
  }
  return list;
}

export function removePreferredWord(word = "", target = "student") {
  const cleanWord = String(word || "").trim().toLowerCase();
  const state = getPreferredVocabularyState();
  const list = target === "teacher" ? state.teacherItems : state.studentItems;
  const filtered = list.filter(w => w.text.toLowerCase() !== cleanWord);

  if (target === "teacher") {
    savePreferredVocabulary({ teacherItems: filtered });
  } else {
    savePreferredVocabulary({ studentItems: filtered });
  }
  return filtered;
}

export function resetPreferredVocabulary(target = "all") {
  let studentItems = getStudentVocabularyItems();
  let teacherItems = getTeacherVocabularyItems();

  if (target === "student" || target === "all") {
    studentItems = [...DEFAULT_STUDENT_ITEMS];
  }
  if (target === "teacher" || target === "all") {
    teacherItems = [...DEFAULT_TEACHER_ITEMS];
  }

  savePreferredVocabulary({ studentItems, teacherItems });
  return target === "teacher" ? teacherItems : target === "student" ? studentItems : { studentItems, teacherItems };
}

export function inferCategory(text = "", target = "student") {
  const lower = String(text || "").toLowerCase();
  if (target === "teacher") {
    if (/neuro|memoria|atenci|plasticidad|v[ií]nculo|pausa|cognitiva|emocional/i.test(lower)) return "neuroeducacion";
    if (/andamiaje|metacogni|zdp|transferencia|retroalimentaci|formativa|modela|consigna/i.test(lower)) return "andamiaje";
    if (/situado|comunitari|realidad|di[aá]logo|nem|saberes/i.test(lower)) return "nem";
    if (/dua|ajuste|accesib|visual|manipul|ritmos|inclusi/i.test(lower)) return "dua";
    return "personalizada";
  }
  if (/argumenta|justifica|hip[oó]tesis|compara|deduce|sintetiza|reto/i.test(lower)) return "reto";
  if (/investiga|analiza|tabla|hechos|opini|gr[aá]fico|soluci/i.test(lower)) return "indagacion";
  if (/dialoga|acuerdo|asamblea|empat[ií]a|equipo|colectiv/i.test(lower)) return "colaborativo";
  if (/diseña|historieta|boceto|cuento|cartel|creat/i.test(lower)) return "creatividad";
  return "personalizada";
}

export function normalizeItemsList(list = [], target = "student") {
  if (!Array.isArray(list)) return target === "teacher" ? [...DEFAULT_TEACHER_ITEMS] : [...DEFAULT_STUDENT_ITEMS];
  const seen = new Set();
  const result = [];
  list.forEach(item => {
    const text = typeof item === "string" ? item : item?.text;
    const category = typeof item === "object" ? item?.category : null;
    const cleanText = String(text || "").trim().replace(/\s+/g, " ");
    const key = cleanText.toLowerCase();
    if (cleanText && !seen.has(key)) {
      seen.add(key);
      result.push({
        text: cleanText,
        category: category || inferCategory(cleanText, target)
      });
    }
  });
  return result;
}

export function normalizeWordsToItems(words = [], target = "student") {
  if (!Array.isArray(words)) return target === "teacher" ? [...DEFAULT_TEACHER_ITEMS] : [...DEFAULT_STUDENT_ITEMS];
  const seen = new Set();
  const result = [];
  words.forEach(word => {
    const cleanText = String(word || "").trim().replace(/\s+/g, " ");
    const key = cleanText.toLowerCase();
    if (cleanText && !seen.has(key)) {
      seen.add(key);
      result.push({
        text: cleanText,
        category: inferCategory(cleanText, target)
      });
    }
  });
  return result;
}

export function normalizeVocabularyList(list = []) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach(item => {
    const text = typeof item === "string" ? item : item?.text;
    const clean = String(text || "").trim().replace(/\s+/g, " ");
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  });
  return result;
}

export function buildVocabularyPromptDirective({ target = "student" } = {}) {
  const state = getPreferredVocabularyState();

  if (target === "teacher") {
    const teacherWords = state.teacherWords || [];
    if (!teacherWords.length) return "";
    return [
      "ORIENTACIÓN DE VOCABULARIO PEDAGÓGICO Y NEUROEDUCACIÓN (NOTAS DEL MAESTRO):",
      `- Conceptos y principios pedagógicos preferentes: "${teacherWords.join('", "')}".`,
      "- Incorpora estos términos y conceptos de neuroeducación (andamiaje, activación de conocimientos previos, carga cognitiva dosificada, memoria de trabajo, atención sostenida, DUA) en las secciones de orientaciones, neurología aplicada y atención a la diversidad de forma natural, rigurosa y contextualizada."
    ].join("\n");
  }

  if (target === "student") {
    const studentWords = state.studentWords || [];
    if (!studentWords.length) return "";
    return [
      "VOCABULARIO PREFERENTE Y CONSIGNAS DE RETO (PARA EL ALUMNO):",
      `- Expresiones, retos cognitivos y consignas sugeridas: "${studentWords.join('", "')}".`,
      "- Incorpora estas expresiones y verbos de reto en las instrucciones, preguntas reflexivas y actividades de forma natural, adaptando la complejidad al grado escolar correspondiente."
    ].join("\n");
  }

  const allWords = [...state.studentWords, ...state.teacherWords];
  if (!allWords.length) return "";
  return [
    "ORIENTACIÓN DE VOCABULARIO PREFERENTE Y NEUROEDUCACIÓN:",
    `- Vocabulario para alumnos: "${state.studentWords.join('", "')}".`,
    `- Principios pedagógicos y neuroeducación para docente: "${state.teacherWords.join('", "')}".`,
    "- Utiliza estas palabras y conceptos de forma pertinente según la audiencia del bloque generado."
  ].join("\n");
}
