import assert from "node:assert/strict";
import {
  PRIMARY_CATEGORIES,
  ALL_KNOWN_SUBTOPICS_BY_CATEGORY,
  GRADE_CATEGORY_DEFAULTS,
  getDefaultCategoriesForGrade,
  isDictationSelection,
  validateActivityHtml,
  buildActivityContractPrompt,
  DICTATION_HTML_CONTRACT
} from "../public/charly-brown/unit-contracts.js";
import { DEFAULT_ACTIVITY_SECTIONS } from "../public/charly-brown/workflow.js";

// 1. Verificación de subtema Dictado en catálogos y orden
assert.ok(
  PRIMARY_CATEGORIES["Lenguaje y comunicación"].includes("Dictado"),
  "PRIMARY_CATEGORIES debe incluir 'Dictado'"
);

const allTopics = ALL_KNOWN_SUBTOPICS_BY_CATEGORY["Lenguaje y comunicación"];
assert.ok(
  allTopics.includes("Dictado"),
  "ALL_KNOWN_SUBTOPICS_BY_CATEGORY debe incluir 'Dictado'"
);

// Verificar posición de Dictado después de Habilidades
const habIdx = allTopics.indexOf("Habilidades");
const dictIdx = allTopics.indexOf("Dictado");
assert.ok(dictIdx > habIdx, "'Dictado' debe estar ubicado después de 'Habilidades'");

// 2. Verificación de defaults por grado
for (const grade of ["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto"]) {
  const defaults = GRADE_CATEGORY_DEFAULTS[grade];
  assert.ok(
    defaults["Lenguaje y comunicación"].includes("Dictado"),
    `GRADE_CATEGORY_DEFAULTS para ${grade} debe incluir 'Dictado'`
  );
  const resolved = getDefaultCategoriesForGrade(grade);
  assert.ok(
    resolved["Lenguaje y comunicación"].includes("Dictado"),
    `getDefaultCategoriesForGrade('${grade}') debe incluir 'Dictado'`
  );
}

// 3. Verificación de DEFAULT_ACTIVITY_SECTIONS
const habSectionIdx = DEFAULT_ACTIVITY_SECTIONS.indexOf("Habilidades");
const dictSectionIdx = DEFAULT_ACTIVITY_SECTIONS.indexOf("Dictado");
const mathSectionIdx = DEFAULT_ACTIVITY_SECTIONS.indexOf("Matemáticas");
assert.ok(habSectionIdx !== -1, "DEFAULT_ACTIVITY_SECTIONS debe tener Habilidades");
assert.ok(dictSectionIdx !== -1, "DEFAULT_ACTIVITY_SECTIONS debe tener Dictado");
assert.ok(mathSectionIdx !== -1, "DEFAULT_ACTIVITY_SECTIONS debe tener Matemáticas");
assert.ok(
  dictSectionIdx > habSectionIdx && dictSectionIdx < mathSectionIdx,
  "En DEFAULT_ACTIVITY_SECTIONS, 'Dictado' debe ir exactamente entre 'Habilidades' y 'Matemáticas'"
);

// 4. Verificación de detección y contrato HTML
assert.ok(isDictationSelection({ subtopic: "Dictado" }), "isDictationSelection debe reconocer 'Dictado'");
assert.ok(isDictationSelection({ subtopic: "dictado" }), "isDictationSelection debe ser case-insensitive");

const validDictationHtml = `
<h2 class="cb-activity-title">Dictado</h2>
<div class="activity">
  <p><strong>Escribe en cada renglón la palabra que te dicte tu maestro.</strong> [IC. T. IND]</p>
  <ol class="steps steps-numbered cb-dictado-list">
    <li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">palabra1</span></div></div></li>
    <li><div class="cb-response-line"><div class="answer"><span class="cb-teacher-resp" style="color:#e6007e;">palabra2</span></div></div></li>
  </ol>
</div>`;

const validationResult = validateActivityHtml(validDictationHtml, { subtopic: "Dictado" });
assert.ok(validationResult.ok, `La actividad de Dictado debe ser válida: ${validationResult.errors.join(", ")}`);

// 5. Verificación de buildActivityContractPrompt
const promptText = buildActivityContractPrompt({ grade: "Segundo", subtopic: "Dictado" });
assert.match(promptText, /CONTRATO ESTRICTO PARA DICTADO/i);
assert.match(promptText, /cb-dictado-list/i);
assert.match(promptText, /caja caligráfica pautada/i);

console.log("Dictation subtopic tests passed successfully!");
