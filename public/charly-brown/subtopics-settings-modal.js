import {
  ALL_KNOWN_SUBTOPICS_BY_CATEGORY,
  GRADE_CATEGORY_DEFAULTS,
  PROJECT_DETAILS_BY_TRIMESTER,
  getDefaultCategoriesForGrade,
  getCategoriesForGrade,
  saveCustomGradeCategories,
  resetCustomGradeCategories
} from "./unit-contracts.js";
import {
  getStudentVocabularyItems,
  getTeacherVocabularyItems,
  savePreferredVocabulary,
  resetPreferredVocabulary,
  STUDENT_CATEGORIES,
  TEACHER_CATEGORIES,
  DEFAULT_STUDENT_ITEMS,
  DEFAULT_TEACHER_ITEMS,
  STUDENT_VOCABULARY_PRESETS,
  TEACHER_VOCABULARY_PRESETS,
  inferCategory
} from "./vocabulary-service.js";
import {
  getInternalPrompts,
  saveInternalPrompts,
  resetInternalPrompts,
  DEFAULT_INTERNAL_PROMPTS
} from "./prompts-service.js";
import {
  EXERCISE_DYNAMICS_CATALOG,
  getStoredExerciseDynamics,
  saveStoredExerciseDynamics
} from "./exercise-dynamics-catalog.js";
import { toast, escapeHtml } from "./ui-components.js";

const PRIMARY_GRADES = [
  { key: "Primero", label: "1° Primaria", phase: "Fase 3 (Alfabetización inicial)" },
  { key: "Segundo", label: "2° Primaria", phase: "Fase 3 (Consolidación de lectoescritura)" },
  { key: "Tercero", label: "3° Primaria", phase: "Fase 4 (Transición e indagación local)" },
  { key: "Cuarto", label: "4° Primaria", phase: "Fase 4 (Disciplinas integradas)" },
  { key: "Quinto", label: "5° Primaria", phase: "Fase 5 (Análisis crítico y abstracción)" },
  { key: "Sexto", label: "6° Primaria", phase: "Fase 5 (Egreso y proyectos avanzados)" }
];

const CATEGORY_META = {
  "Proyectos": { icon: "fa-diagram-project", label: "Proyectos Integradores" },
  "Lenguaje y comunicación": { icon: "fa-book-open", label: "Lenguaje y Comunicación" },
  "Ciencias experimentales": { icon: "fa-flask", label: "Ciencias Experimentales" },
  "Ciencias sociales": { icon: "fa-landmark", label: "Ciencias Sociales" },
  "Formación socioemocional": { icon: "fa-heart-pulse", label: "Formación Socioemocional" },
  "Matemáticas": { icon: "fa-calculator", label: "Matemáticas" }
};

const SUBTOPIC_LABELS = {
  Proyectos: "Proyectos integradores",
  Ortografía: "Convenciones lingüísticas: Ortografía",
  Gramatica: "Convenciones lingüísticas: Gramática",
  ExpresionEscrita: "Expresión escrita",
  TrazosDeLetras: "Trazos y letras (1°-2°)",
  ComprensionLectora: "Comprensión lectora",
  ExpresionOral: "Expresión oral",
  Socioemocional: "Educación socioemocional",
  ConocimientoDelMedio: "Conocimiento del Medio (1°-2°)",
  MiLocalidad: "Geografía: mi localidad (3°)",
  Naturales: "Ciencias Naturales (4°-6°)",
  Historia: "Historia (4°-6°)",
  Geografia: "Geografía (4°-6°)",
  CivicaEtica: "Formación Cívica y Ética",
  Habilidades: "Habilidades del lenguaje",
  Dictado: "Dictado",
  Artes: "Mapa mental (Plantilla)",
  Matematicas: "Pensamiento Matemático"
};

let activeModalGrade = "Primero";
let activeSettingsTab = "subtopics";
let activeVocabAudience = "student"; // "student" | "teacher"
let activeVocabCategoryFilter = "all";
let vocabSearchQuery = "";
let editingItemIndex = null; // index of item being edited inline

let draftGradeConfigs = {};
let draftStudentItems = [];
let draftTeacherItems = [];
let draftPrompts = {};
let draftExerciseDynamics = [];
let onConfigSavedCallback = null;

export function initSubtopicsSettingsModal({ onSave = null } = {}) {
  onConfigSavedCallback = onSave;
  bindModalEvents();
}

export function openSubtopicsSettingsModal({ currentGrade = "Primero", onSave = null, initialTab = "subtopics" } = {}) {
  if (onSave) onConfigSavedCallback = onSave;
  activeModalGrade = PRIMARY_GRADES.some(g => g.key === currentGrade) ? currentGrade : "Primero";
  activeSettingsTab = ["subtopics", "vocabulary", "prompts", "exercises"].includes(initialTab) ? initialTab : "subtopics";
  activeVocabCategoryFilter = "all";
  vocabSearchQuery = "";
  editingItemIndex = null;

  // Load drafts for all grades
  draftGradeConfigs = {};
  PRIMARY_GRADES.forEach(g => {
    draftGradeConfigs[g.key] = getCategoriesForGrade(g.key);
  });

  // Load structured draft vocabularies separately
  draftStudentItems = JSON.parse(JSON.stringify(getStudentVocabularyItems()));
  draftTeacherItems = JSON.parse(JSON.stringify(getTeacherVocabularyItems()));

  // Load internal system prompts draft
  draftPrompts = getInternalPrompts();

  // Load exercise dynamics draft
  draftExerciseDynamics = [...getStoredExerciseDynamics()];

  const modal = document.getElementById("cbGradeSubtopicsModal");
  if (!modal) return;

  renderTopNavTabs();
  renderGradeTabs();
  renderGradeSubtopicsTable();
  renderProjectsInfo();
  renderVocabularyStudio();
  renderPromptsStudio();
  renderExercisesStudio();

  modal.hidden = false;
  modal.removeAttribute("hidden");
  modal.removeAttribute("aria-hidden");
  modal.classList.add("is-open");
  document.body.classList.add("cb-modal-open");
}

export function closeSubtopicsSettingsModal() {
  const modal = document.getElementById("cbGradeSubtopicsModal");
  if (!modal) return;

  modal.hidden = true;
  modal.setAttribute("hidden", "");
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("is-open");
  document.body.classList.remove("cb-modal-open");
}

function bindModalEvents() {
  const modal = document.getElementById("cbGradeSubtopicsModal");
  if (!modal) return;

  modal.querySelectorAll("[data-modal-close='subtopics-settings']").forEach(el => {
    el.addEventListener("click", () => closeSubtopicsSettingsModal());
  });

  // Top nav tab switching (Subtemas vs Vocabulario)
  modal.querySelectorAll(".cb-settings-nav-tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      activeSettingsTab = tabBtn.dataset.settingsTab;
      renderTopNavTabs();
    });
  });

  // Vocabulary audience tab switching (Alumno vs Maestro)
  modal.querySelectorAll(".cb-vocab-audience-tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      activeVocabAudience = tabBtn.dataset.vocabAudience || "student";
      activeVocabCategoryFilter = "all";
      vocabSearchQuery = "";
      editingItemIndex = null;
      renderVocabularyStudio();
    });
  });

  // Vocabulary search input
  const searchInput = document.getElementById("cbVocabSearchInput");
  const searchClearBtn = document.getElementById("cbVocabSearchClearBtn");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      vocabSearchQuery = e.target.value.trim().toLowerCase();
      if (searchClearBtn) searchClearBtn.hidden = !vocabSearchQuery;
      renderVocabularyItemsList();
    });
  }
  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      vocabSearchQuery = "";
      searchClearBtn.hidden = true;
      renderVocabularyItemsList();
    });
  }

  // Vocabulary: Add word
  const addWordBtn = document.getElementById("cbVocabAddWordBtn");
  const wordInput = document.getElementById("cbVocabNewWordInput");
  const categorySelect = document.getElementById("cbVocabCategorySelect");

  const handleAddWord = () => {
    const text = wordInput?.value?.trim().replace(/\s+/g, " ");
    if (!text) return;

    const currentList = activeVocabAudience === "teacher" ? draftTeacherItems : draftStudentItems;
    const exists = currentList.some(item => item.text.toLowerCase() === text.toLowerCase());
    if (exists) {
      toast(`La expresión "${text}" ya existe en la lista.`, { type: "info" });
      return;
    }

    const selectedCategory = categorySelect?.value || inferCategory(text, activeVocabAudience);
    currentList.unshift({ text, category: selectedCategory });

    if (wordInput) wordInput.value = "";
    renderVocabularyStudio();
    toast(`Expresión añadida: "${text}"`, { type: "success" });
  };

  if (addWordBtn) addWordBtn.addEventListener("click", handleAddWord);
  if (wordInput) {
    wordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddWord();
      }
    });
  }

  // Toggle add card visibility
  const toggleAddBtn = document.getElementById("cbVocabToggleAddBtn");
  if (toggleAddBtn) {
    toggleAddBtn.addEventListener("click", () => {
      const addCard = document.getElementById("cbVocabAddCard");
      if (addCard) {
        addCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        wordInput?.focus();
      }
    });
  }

  // Vocabulary: Reset standard
  const vocabResetBtn = document.getElementById("cbVocabResetBtn");
  if (vocabResetBtn) {
    vocabResetBtn.addEventListener("click", () => {
      if (activeVocabAudience === "teacher") {
        draftTeacherItems = JSON.parse(JSON.stringify(DEFAULT_TEACHER_ITEMS));
        toast("Vocabulario de neuroeducación restaurado al estándar oficial.", { type: "info" });
      } else {
        draftStudentItems = JSON.parse(JSON.stringify(DEFAULT_STUDENT_ITEMS));
        toast("Vocabulario de retos para el alumno restaurado al estándar oficial.", { type: "info" });
      }
      editingItemIndex = null;
      renderVocabularyStudio();
    });
  }

  // Reset internal system prompts
  const promptsResetBtn = document.getElementById("cbPromptsResetBtn");
  if (promptsResetBtn) {
    promptsResetBtn.addEventListener("click", () => {
      draftPrompts = resetInternalPrompts();
      renderPromptsStudio();
      toast("Prompts e instrucciones globales del sistema restablecidos a su estado original.", { type: "info" });
    });
  }

  // Reset grade subtopics
  const resetBtn = document.getElementById("cbSubtopicsResetGradeBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      draftGradeConfigs[activeModalGrade] = getDefaultCategoriesForGrade(activeModalGrade);
      renderGradeSubtopicsTable();
      toast(`Subtemas de ${activeModalGrade} restaurados al estándar oficial SEP.`, { type: "info" });
    });
  }

  // Reset all grades subtopics
  const resetAllBtn = document.getElementById("cbSubtopicsResetAllBtn");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", () => {
      PRIMARY_GRADES.forEach(g => {
        draftGradeConfigs[g.key] = getDefaultCategoriesForGrade(g.key);
      });
      renderGradeSubtopicsTable();
      toast("Todos los grados restaurados al estándar oficial SEP.", { type: "info" });
    });
  }

  // Exercise dynamics: Select all
  const exercisesSelectAllBtn = document.getElementById("cbExercisesSelectAllBtn");
  if (exercisesSelectAllBtn) {
    exercisesSelectAllBtn.addEventListener("click", () => {
      draftExerciseDynamics = EXERCISE_DYNAMICS_CATALOG.map((item) => item.id);
      renderExercisesStudio();
      toast("Todas las dinámicas de ejercicios han sido activadas.", { type: "info" });
    });
  }

  // Exercise dynamics: Reset default
  const exercisesResetBtn = document.getElementById("cbExercisesResetBtn");
  if (exercisesResetBtn) {
    exercisesResetBtn.addEventListener("click", () => {
      draftExerciseDynamics = EXERCISE_DYNAMICS_CATALOG.filter((item) => item.defaultEnabled).map((item) => item.id);
      renderExercisesStudio();
      toast("Dinámicas de ejercicios restablecidas al catálogo predeterminado.", { type: "info" });
    });
  }

  // Save all settings (subtopics + structured vocabulary + system prompts + exercise dynamics)
  const saveBtn = document.getElementById("cbSubtopicsSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      // 1. Save all grades subtopics
      PRIMARY_GRADES.forEach(g => {
        const cleanConfig = {};
        const draft = draftGradeConfigs[g.key] || {};
        Object.entries(draft).forEach(([cat, subs]) => {
          if (Array.isArray(subs) && subs.length > 0) {
            cleanConfig[cat] = [...subs];
          }
        });
        saveCustomGradeCategories(g.key, cleanConfig);
      });

      // 2. Save structured preferred vocabularies
      await savePreferredVocabulary({
        studentItems: draftStudentItems,
        teacherItems: draftTeacherItems
      });

      // 3. Save internal system prompts & rules
      saveInternalPrompts(draftPrompts);

      // 4. Save exercise dynamics
      saveStoredExerciseDynamics(draftExerciseDynamics);
      window.dispatchEvent(new CustomEvent("charly:exercise-dynamics-updated", { detail: { enabled: draftExerciseDynamics } }));

      toast("Configuración curricular, vocabulario, prompts y dinámicas de ejercicios guardados.", { type: "success" });
      closeSubtopicsSettingsModal();
      if (typeof onConfigSavedCallback === "function") {
        onConfigSavedCallback(activeModalGrade);
      }
    });
  }
}

function renderTopNavTabs() {
  const modal = document.getElementById("cbGradeSubtopicsModal");
  if (!modal) return;

  modal.querySelectorAll(".cb-settings-nav-tab").forEach(tab => {
    const isCurrent = tab.dataset.settingsTab === activeSettingsTab;
    tab.classList.toggle("is-active", isCurrent);
    tab.setAttribute("aria-selected", isCurrent ? "true" : "false");
  });

  const subtopicsPane = document.getElementById("cbSettingsSubtopicsSection");
  const vocabPane = document.getElementById("cbSettingsVocabSection");
  const promptsPane = document.getElementById("cbSettingsPromptsSection");
  const exercisesPane = document.getElementById("cbSettingsExercisesSection");

  if (subtopicsPane) {
    subtopicsPane.hidden = activeSettingsTab !== "subtopics";
    subtopicsPane.classList.toggle("is-active", activeSettingsTab === "subtopics");
  }
  if (vocabPane) {
    vocabPane.hidden = activeSettingsTab !== "vocabulary";
    vocabPane.classList.toggle("is-active", activeSettingsTab === "vocabulary");
  }
  if (promptsPane) {
    promptsPane.hidden = activeSettingsTab !== "prompts";
    promptsPane.classList.toggle("is-active", activeSettingsTab === "prompts");
  }
  if (exercisesPane) {
    exercisesPane.hidden = activeSettingsTab !== "exercises";
    exercisesPane.classList.toggle("is-active", activeSettingsTab === "exercises");
  }
}

const PROMPT_FIELDS = [
  {
    key: "activityProfile",
    label: "Perfil Editorial de Actividades Didácticas",
    icon: "fa-book-open",
    desc: "Instrucciones del agente para redactar actividades didácticas."
  },
  {
    key: "activityContractProfile",
    label: "Contrato de Actividades",
    icon: "fa-list-check",
    desc: "Directrices para conservar la estructura curricular y HTML de las actividades."
  },
  {
    key: "refinementProfile",
    label: "Edición de Actividades",
    icon: "fa-pen-to-square",
    desc: "Criterios para refinar contenido aprobado y preservar su información."
  },
  {
    key: "chatProfile",
    label: "Asistente Conversacional",
    icon: "fa-comments",
    desc: "Tono y límites de las respuestas conversacionales de Charly."
  },
  {
    key: "teacherNotes",
    label: "Orientaciones y Notas del Maestro",
    icon: "fa-graduation-cap",
    desc: "Directrices metodológicas para el docente: preparación previa, momentos de aplicación en aula, preguntas mediadoras y ajustes razonables de inclusión."
  },
  {
    key: "worksheet",
    label: "Fichas de Refuerzo Impresas",
    icon: "fa-file-lines",
    desc: "Perfil y estructura para la formulación de fichas de ejercicios prácticos, pasos ordenados y pautas de solución."
  },
  {
    key: "annex",
    label: "Anexos Gráficos y Conceptuales",
    icon: "fa-image",
    desc: "Perfil para la generación de esquemas, mapas, diagramas y preguntas de análisis visual."
  },
  {
    key: "cutout",
    label: "Recortables Manipulativos",
    icon: "fa-scissors",
    desc: "Instrucciones de corte, dinámicas de mesa y funciones pedagógicas de las piezas recortables."
  },
  {
    key: "videoScript",
    label: "Guiones de Video Educativo",
    icon: "fa-film",
    desc: "Estructura audiovisual para videos animados: gancho inicial, desarrollo explicativo dinámico y reto de cierre."
  },
  {
    key: "readingProfile",
    label: "Lecturas Escolares",
    icon: "fa-book-open-reader",
    desc: "Estructura, lenguaje y recursos visuales de las lecturas narrativas."
  },
  {
    key: "synonymsProfile",
    label: "Tabla de Sinónimos",
    icon: "fa-language",
    desc: "Selección de palabras de la lectura y sinónimos adecuados al grado."
  },
  {
    key: "comprehensionProfile",
    label: "Comprensión Lectora",
    icon: "fa-circle-question",
    desc: "Preguntas y respuestas para evaluar la lectura."
  },
  {
    key: "readingIllustration",
    label: "Ilustración de Lectura",
    icon: "fa-image",
    desc: "Instrucciones visuales para crear la ilustración consultable."
  },
  {
    key: "contentReview",
    label: "Revisión Editorial",
    icon: "fa-spell-check",
    desc: "Criterios para pulir el contenido generado sin alterar sus datos ni estructura."
  }
];

function renderPromptsStudio() {
  const grid = document.getElementById("cbPromptsEditorGrid");
  if (!grid) return;

  grid.innerHTML = PROMPT_FIELDS.map((field) => {
    const value = draftPrompts[field.key] ?? DEFAULT_INTERNAL_PROMPTS[field.key] ?? "";
    return `
      <div class="cb-prompt-card">
        <div class="cb-prompt-card-header">
          <i class="fas ${field.icon}" aria-hidden="true"></i>
          <span>${escapeHtml(field.label)}</span>
        </div>
        <p class="cb-prompt-card-description">${escapeHtml(field.desc || "Define criterios para este tipo de contenido.")}</p>
        <textarea
          class="cb-prompt-textarea"
          data-prompt-key="${escapeHtml(field.key)}"
          rows="5"
          placeholder="Escribe las instrucciones globales para este tipo de contenido..."
        >${escapeHtml(value)}</textarea>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".cb-prompt-textarea").forEach((textarea) => {
    textarea.addEventListener("input", (e) => {
      const key = e.target.dataset.promptKey;
      if (key) draftPrompts[key] = e.target.value;
    });
  });
}

function renderGradeTabs() {
  const container = document.getElementById("cbSubtopicsGradeTabs");
  if (!container) return;

  container.innerHTML = PRIMARY_GRADES.map(g => {
    const isActive = g.key === activeModalGrade;
    return `
      <button type="button" class="cb-grade-tab-btn ${isActive ? 'is-active' : ''}" data-grade="${escapeHtml(g.key)}">
        <span class="cb-grade-tab-title">${escapeHtml(g.label)}</span>
        <span class="cb-grade-tab-phase">${escapeHtml(g.phase.split('(')[0].trim())}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".cb-grade-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeModalGrade = btn.dataset.grade;
      renderGradeTabs();
      renderGradeSubtopicsTable();
      renderProjectsInfo();
    });
  });
}

function renderProjectsInfo() {
  const container = document.getElementById("cbSubtopicsProjectsInfo");
  if (!container) return;

  const currentGradeObj = PRIMARY_GRADES.find(g => g.key === activeModalGrade) || PRIMARY_GRADES[0];

  container.innerHTML = `
    <div class="cb-projects-banner">
      <div class="cb-projects-banner-header">
        <div class="cb-projects-banner-title">
          <i class="fas fa-cubes-stacked" aria-hidden="true"></i>
          <span>Estructura de Proyectos por Trimestre (Unidad 1 de cada trimestre) · ${escapeHtml(currentGradeObj.phase)}</span>
        </div>
      </div>
      <div class="cb-projects-grid">
        ${Object.entries(PROJECT_DETAILS_BY_TRIMESTER).map(([trim, detail]) => `
          <div class="cb-project-trim-card">
            <div class="cb-project-trim-badge">Trimestre ${trim} · ${escapeHtml(detail.methodology)}</div>
            <div class="cb-project-trim-name"><i class="fas ${detail.icon}"></i> ${escapeHtml(detail.name)}</div>
            <ol class="cb-project-phases-list">
              ${detail.phases.map(phase => `<li>${escapeHtml(phase)}</li>`).join("")}
            </ol>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderGradeSubtopicsTable() {
  const container = document.getElementById("cbSubtopicsConfigMatrix");
  if (!container) return;

  const currentConfig = draftGradeConfigs[activeModalGrade] || {};

  container.innerHTML = Object.entries(ALL_KNOWN_SUBTOPICS_BY_CATEGORY).map(([category, allSubtopics]) => {
    const meta = CATEGORY_META[category] || { icon: "fa-folder", label: category };
    const enabledSubtopics = currentConfig[category] || [];
    const isCategoryEnabled = enabledSubtopics.length > 0;

    return `
      <div class="cb-subtopics-cat-card ${isCategoryEnabled ? 'is-enabled' : 'is-disabled'}" data-category="${escapeHtml(category)}">
        <div class="cb-subtopics-cat-header">
          <div class="cb-subtopics-cat-info">
            <i class="fas ${meta.icon} cb-subtopics-cat-icon" aria-hidden="true"></i>
            <div>
              <h4 class="cb-subtopics-cat-title">${escapeHtml(meta.label)}</h4>
              <p class="cb-subtopics-cat-desc">${enabledSubtopics.length} de ${allSubtopics.length} subtemas activos</p>
            </div>
          </div>
          <label class="cb-subtopics-switch" title="Activar/Desactivar categoría completa">
            <input type="checkbox" class="cb-cat-toggle-input" ${isCategoryEnabled ? 'checked' : ''} data-category="${escapeHtml(category)}">
            <span class="cb-subtopics-switch-slider"></span>
          </label>
        </div>
        <div class="cb-subtopics-chips-grid">
          ${allSubtopics.map(subtopic => {
            const isChecked = enabledSubtopics.includes(subtopic);
            const label = SUBTOPIC_LABELS[subtopic] || subtopic;
            return `
              <label class="cb-subtopic-chip ${isChecked ? 'is-checked' : ''}">
                <input type="checkbox" class="cb-subtopic-chip-input" 
                  data-category="${escapeHtml(category)}" 
                  data-subtopic="${escapeHtml(subtopic)}" 
                  ${isChecked ? 'checked' : ''}>
                <span class="cb-subtopic-chip-check"><i class="fas fa-check"></i></span>
                <span class="cb-subtopic-chip-text">${escapeHtml(label)}</span>
              </label>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  // Bind category switches
  container.querySelectorAll(".cb-cat-toggle-input").forEach(switchEl => {
    switchEl.addEventListener("change", (e) => {
      const cat = e.target.dataset.category;
      const isChecked = e.target.checked;
      if (isChecked) {
        draftGradeConfigs[activeModalGrade][cat] = [...(ALL_KNOWN_SUBTOPICS_BY_CATEGORY[cat] || [])];
      } else {
        draftGradeConfigs[activeModalGrade][cat] = [];
      }
      renderGradeSubtopicsTable();
    });
  });

  // Bind subtopic chip checkboxes
  container.querySelectorAll(".cb-subtopic-chip-input").forEach(chipInput => {
    chipInput.addEventListener("change", (e) => {
      const cat = e.target.dataset.category;
      const sub = e.target.dataset.subtopic;
      const isChecked = e.target.checked;

      draftGradeConfigs[activeModalGrade][cat] = draftGradeConfigs[activeModalGrade][cat] || [];
      const set = new Set(draftGradeConfigs[activeModalGrade][cat]);
      if (isChecked) {
        set.add(sub);
      } else {
        set.delete(sub);
      }
      draftGradeConfigs[activeModalGrade][cat] = Array.from(set);
      renderGradeSubtopicsTable();
    });
  });
}

function renderVocabularyStudio() {
  const isTeacher = activeVocabAudience === "teacher";
  const currentItems = isTeacher ? draftTeacherItems : draftStudentItems;
  const categories = isTeacher ? TEACHER_CATEGORIES : STUDENT_CATEGORIES;
  const presets = isTeacher ? TEACHER_VOCABULARY_PRESETS : STUDENT_VOCABULARY_PRESETS;

  // 1. Update audience tabs
  const modal = document.getElementById("cbGradeSubtopicsModal");
  if (modal) {
    modal.querySelectorAll(".cb-vocab-audience-tab").forEach(tab => {
      const isCurrent = tab.dataset.vocabAudience === activeVocabAudience;
      tab.classList.toggle("is-active", isCurrent);
      tab.setAttribute("aria-selected", isCurrent ? "true" : "false");
    });
  }

  // 2. Update Add Card Header & Select options
  const addTitle = document.getElementById("cbVocabAddCardTitle");
  const wordInput = document.getElementById("cbVocabNewWordInput");
  const categorySelect = document.getElementById("cbVocabCategorySelect");

  if (addTitle) {
    addTitle.textContent = isTeacher
      ? "Añadir concepto pedagógico o neuroeducativo (Docente)"
      : "Añadir expresión o consigna de reto (Alumno)";
  }
  if (wordInput) {
    wordInput.placeholder = isTeacher
      ? "Ej. andamiaje pedagógico, memoria de trabajo, DUA..."
      : "Ej. argumenta con evidencias, organiza en tabla...";
  }
  if (categorySelect) {
    categorySelect.innerHTML = categories.map(cat => `
      <option value="${escapeHtml(cat.id)}">${escapeHtml(cat.label)}</option>
    `).join("");
  }

  // 3. Render Category Filter Pills
  const pillsContainer = document.getElementById("cbVocabCategoryFilterPills");
  if (pillsContainer) {
    const countsByCategory = {};
    currentItems.forEach(item => {
      countsByCategory[item.category] = (countsByCategory[item.category] || 0) + 1;
    });

    pillsContainer.innerHTML = [
      `
      <button type="button" class="cb-vocab-cat-pill ${activeVocabCategoryFilter === 'all' ? 'is-active' : ''}" data-category-filter="all">
        <span class="cb-vocab-cat-pill-label">Todas</span>
        <span class="cb-vocab-cat-pill-count">${currentItems.length}</span>
      </button>
      `,
      ...categories.map(cat => {
        const count = countsByCategory[cat.id] || 0;
        const isActive = activeVocabCategoryFilter === cat.id;
        return `
          <button type="button" class="cb-vocab-cat-pill cb-vocab-cat-pill--${cat.color} ${isActive ? 'is-active' : ''}" data-category-filter="${escapeHtml(cat.id)}">
            <span class="cb-vocab-cat-pill-label">${escapeHtml(cat.label)}</span>
            <span class="cb-vocab-cat-pill-count">${count}</span>
          </button>
        `;
      })
    ].join("");

    pillsContainer.querySelectorAll(".cb-vocab-cat-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        activeVocabCategoryFilter = pill.dataset.categoryFilter;
        renderVocabularyStudio();
      });
    });
  }

  // 4. Render Presets Row
  const presetsContainer = document.getElementById("cbVocabPresetsContainer");
  if (presetsContainer) {
    presetsContainer.innerHTML = Object.keys(presets).map(name => {
      const presetWords = presets[name] || [];
      const currentTextsSet = new Set(currentItems.map(i => i.text.toLowerCase()));
      const missingCount = presetWords.filter(w => !currentTextsSet.has(w.toLowerCase())).length;

      return `
        <button type="button" class="cb-vocab-preset-btn ${missingCount === 0 ? 'is-complete' : ''}" data-preset="${escapeHtml(name)}">
          <i class="fas ${missingCount === 0 ? 'fa-check-circle' : 'fa-plus-circle'}" aria-hidden="true"></i>
          <span>${escapeHtml(name)}</span>
          ${missingCount > 0 ? `<span class="cb-vocab-preset-badge">+${missingCount}</span>` : ''}
        </button>
      `;
    }).join("");

    presetsContainer.querySelectorAll(".cb-vocab-preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const presetName = btn.dataset.preset;
        const words = presets[presetName] || [];
        const currentTextsSet = new Set(currentItems.map(i => i.text.toLowerCase()));
        let addedCount = 0;

        words.forEach(word => {
          if (!currentTextsSet.has(word.toLowerCase())) {
            currentItems.push({
              text: word,
              category: inferCategory(word, activeVocabAudience)
            });
            currentTextsSet.add(word.toLowerCase());
            addedCount++;
          }
        });

        renderVocabularyStudio();
        if (addedCount > 0) {
          toast(`Añadidas ${addedCount} expresiones del preset "${presetName}".`, { type: "info" });
        } else {
          toast(`Todas las expresiones del preset ya están añadidas.`, { type: "info" });
        }
      });
    });
  }

  // 5. Render Items List
  renderVocabularyItemsList();
}

function renderVocabularyItemsList() {
  const isTeacher = activeVocabAudience === "teacher";
  document.querySelectorAll("[data-vocab-hint]").forEach((hint) => { hint.hidden = hint.dataset.vocabHint !== activeVocabAudience; });
  const currentItems = isTeacher ? draftTeacherItems : draftStudentItems;
  const categories = isTeacher ? TEACHER_CATEGORIES : STUDENT_CATEGORIES;
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

  // Filter items
  const filtered = currentItems.filter((item, index) => {
    item._index = index;
    if (activeVocabCategoryFilter !== "all" && item.category !== activeVocabCategoryFilter) {
      return false;
    }
    if (vocabSearchQuery) {
      const matchText = item.text.toLowerCase().includes(vocabSearchQuery);
      const catLabel = catMap[item.category]?.label?.toLowerCase() || "";
      const matchCat = catLabel.includes(vocabSearchQuery);
      return matchText || matchCat;
    }
    return true;
  });

  // Update header count
  const countEl = document.getElementById("cbVocabCount");
  const filterStatusEl = document.getElementById("cbVocabFilterStatus");
  if (countEl) {
    const audienceLabel = isTeacher ? "para notas del maestro" : "para actividades del alumno";
    countEl.textContent = `${currentItems.length} ${currentItems.length === 1 ? "expresión" : "expresiones"} ${audienceLabel}`;
  }
  if (filterStatusEl) {
    if (filtered.length !== currentItems.length) {
      filterStatusEl.textContent = `Mostrando ${filtered.length} de ${currentItems.length}`;
    } else {
      filterStatusEl.textContent = "";
    }
  }

  const grid = document.getElementById("cbVocabItemsGrid");
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="cb-vocab-studio-empty">
        <div class="cb-vocab-empty-icon"><i class="fas fa-filter-circle-xmark"></i></div>
        <h4 class="cb-vocab-empty-title">No se encontraron expresiones</h4>
        <p class="cb-vocab-empty-sub">No hay elementos que coincidan con la búsqueda o el filtro activo.</p>
        <button type="button" class="cb-chip-action cb-chip-action--ghost" id="cbVocabClearFiltersBtn">
          <span>Limpiar filtros</span>
        </button>
      </div>
    `;
    grid.querySelector("#cbVocabClearFiltersBtn")?.addEventListener("click", () => {
      activeVocabCategoryFilter = "all";
      vocabSearchQuery = "";
      const searchInput = document.getElementById("cbVocabSearchInput");
      if (searchInput) searchInput.value = "";
      renderVocabularyStudio();
    });
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const cat = catMap[item.category] || { label: item.category || "General", color: "slate" };
    const isEditing = editingItemIndex === item._index;

    if (isEditing) {
      return `
        <div class="cb-vocab-item-card is-editing" data-index="${item._index}">
          <div class="cb-vocab-item-edit-form">
            <input type="text" class="cb-vocab-item-edit-input" value="${escapeHtml(item.text)}" aria-label="Editar texto">
            <select class="cb-vocab-item-edit-select" aria-label="Cambiar categoría">
              ${categories.map(c => `
                <option value="${escapeHtml(c.id)}" ${c.id === item.category ? 'selected' : ''}>${escapeHtml(c.label)}</option>
              `).join("")}
            </select>
            <div class="cb-vocab-item-edit-actions">
              <button type="button" class="cb-vocab-btn-action cb-vocab-btn-action--save" data-action="save-edit" title="Guardar cambios">
                <i class="fas fa-check"></i>
              </button>
              <button type="button" class="cb-vocab-btn-action cb-vocab-btn-action--cancel" data-action="cancel-edit" title="Cancelar">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="cb-vocab-item-card" data-index="${item._index}">
        <div class="cb-vocab-item-main">
          <span class="cb-vocab-tag cb-vocab-tag--${cat.color}">${escapeHtml(cat.label)}</span>
          <span class="cb-vocab-item-text" title="Doble clic para editar">${escapeHtml(item.text)}</span>
        </div>
        <div class="cb-vocab-item-actions">
          <button type="button" class="cb-vocab-icon-btn" data-action="edit" title="Editar expresión">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="cb-vocab-icon-btn" data-action="copy" title="Copiar al portapapeles">
            <i class="fas fa-copy"></i>
          </button>
          <button type="button" class="cb-vocab-icon-btn cb-vocab-icon-btn--danger" data-action="delete" title="Eliminar de la lista">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Bind item action buttons
  grid.querySelectorAll(".cb-vocab-item-card").forEach(card => {
    const index = Number(card.dataset.index);

    // Edit button
    card.querySelector("[data-action='edit']")?.addEventListener("click", () => {
      editingItemIndex = index;
      renderVocabularyItemsList();
      const input = grid.querySelector(`[data-index="${index}"] .cb-vocab-item-edit-input`);
      input?.focus();
      input?.select();
    });

    // Double click to edit text
    card.querySelector(".cb-vocab-item-text")?.addEventListener("dblclick", () => {
      editingItemIndex = index;
      renderVocabularyItemsList();
    });

    // Copy button
    card.querySelector("[data-action='copy']")?.addEventListener("click", async () => {
      const text = currentItems[index]?.text;
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
          toast(`Copiado: "${text}"`, { type: "info" });
        } catch (_) {}
      }
    });

    // Delete button
    card.querySelector("[data-action='delete']")?.addEventListener("click", () => {
      const removedText = currentItems[index]?.text;
      currentItems.splice(index, 1);
      if (editingItemIndex === index) editingItemIndex = null;
      renderVocabularyStudio();
      toast(`Eliminada: "${removedText}"`, { type: "info" });
    });

    // Save edit
    card.querySelector("[data-action='save-edit']")?.addEventListener("click", () => {
      const input = card.querySelector(".cb-vocab-item-edit-input");
      const select = card.querySelector(".cb-vocab-item-edit-select");
      const newText = input?.value?.trim().replace(/\s+/g, " ");
      const newCat = select?.value;

      if (newText) {
        currentItems[index].text = newText;
        if (newCat) currentItems[index].category = newCat;
        editingItemIndex = null;
        renderVocabularyStudio();
        toast("Expresión actualizada.", { type: "success" });
      }
    });

    // Cancel edit
    card.querySelector("[data-action='cancel-edit']")?.addEventListener("click", () => {
      editingItemIndex = null;
      renderVocabularyItemsList();
    });

    // Keydown on edit input (Enter to save, Escape to cancel)
    card.querySelector(".cb-vocab-item-edit-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        card.querySelector("[data-action='save-edit']")?.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        card.querySelector("[data-action='cancel-edit']")?.click();
      }
    });
  });
}

function renderExercisesStudio() {
  const container = document.getElementById("cbExercisesConfigGrid");
  if (!container) return;

  container.innerHTML = EXERCISE_DYNAMICS_CATALOG.map((dyn) => {
    const isChecked = draftExerciseDynamics.includes(dyn.id);
    return `
      <div class="cb-exercise-card ${isChecked ? 'is-active' : ''}" data-exercise-id="${dyn.id}" style="border: 1.5px solid ${isChecked ? '#2563eb' : 'var(--cb-up-border, #e2e8f0)'}; border-radius: 12px; padding: 14px 16px; background: ${isChecked ? 'rgba(37, 99, 235, 0.03)' : 'var(--cb-up-surface, #ffffff)'}; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; transition: border-color 0.15s, box-shadow 0.15s;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 34px; height: 34px; border-radius: 8px; background: ${isChecked ? '#eff6ff' : '#f1f5f9'}; color: ${isChecked ? '#2563eb' : '#64748b'}; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0;">
                <i class="fas ${dyn.icon}"></i>
              </div>
              <div>
                <strong style="font-size: 13.5px; color: var(--cb-up-text); display: block; line-height: 1.3;">${escapeHtml(dyn.label)}</strong>
                <span style="font-size: 11px; color: var(--cb-up-muted); font-weight: 500;">${escapeHtml(dyn.category)}</span>
              </div>
            </div>
            <label class="cb-switch" style="position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; cursor: pointer;">
              <input type="checkbox" class="cb-exercise-toggle" data-exercise-id="${dyn.id}" ${isChecked ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span class="cb-switch-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isChecked ? '#2563eb' : '#cbd5e1'}; transition: 0.2s; border-radius: 22px;">
                <span style="position: absolute; content: ''; height: 16px; width: 16px; left: ${isChecked ? '19px' : '3px'}; bottom: 3px; background-color: white; transition: 0.2s; border-radius: 50%; display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></span>
              </span>
            </label>
          </div>
          <p style="font-size: 12px; line-height: 1.45; color: var(--cb-up-muted); margin: 0 0 6px 0;">${escapeHtml(dyn.desc)}</p>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".cb-exercise-toggle").forEach((toggle) => {
    toggle.addEventListener("change", (e) => {
      const id = toggle.dataset.exerciseId;
      if (e.target.checked) {
        if (!draftExerciseDynamics.includes(id)) draftExerciseDynamics.push(id);
      } else {
        draftExerciseDynamics = draftExerciseDynamics.filter((x) => x !== id);
      }
      renderExercisesStudio();
    });
  });
}
