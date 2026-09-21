import assert from "node:assert/strict";
import {
  assignBriefingCoverageAnchors,
  auditEscapeRoomText,
  collectForbiddenAnswerTerms,
  mergeFoundationWithQuestions
} from "../public/js/escape-room-content-quality.mjs";

const baseQuestion = {
  titulo: "Identify the process",
  reto: "Which process turns water into vapour?",
  tipo_interaccion: "texto",
  subtipo_respuesta: "palabra",
  respuesta_correcta: "evaporation",
  respuestas_aceptadas: ["evaporation"],
  pista: "Use the briefing detail about liquid water changing into vapour.",
  imagen_alt: "Water changing state"
};
const project = {
  idioma: "en-US",
  tema_curricular: "The water cycle",
  titulo: "Water cycle mission",
  instrucciones: "Use the water cycle briefing in every room to solve each evidence-based challenge and unlock the final mission.",
  clave_final: "HYDRO",
  misiones: [{
    id: "room-1",
    historia: "Scientists observe water changing state throughout the environment.",
    contexto: "The water cycle moves water through evaporation, condensation, precipitation, and collection. Evaporation changes liquid water into water vapour when heat supplies energy. Condensation cools water vapour into droplets that form clouds. Precipitation returns water to Earth as rain, snow, sleet, or hail. Collection stores water in oceans, lakes, rivers, soil, and ice before the cycle continues.",
    datos_clave: ["Evaporation changes liquid water into vapour.", "Condensation forms droplets.", "Precipitation returns water to Earth."],
    preguntas: [baseQuestion]
  }]
};

assert.deepEqual(auditEscapeRoomText(project).issues, [], "Un escape room coherente debe aprobar la auditoría determinista.");

const repeated = structuredClone(project);
repeated.misiones[0].preguntas.push({ ...baseQuestion, titulo: "Name the process again", tipo_interaccion: "opcion_multiple", opciones: ["evaporation", "rain"], id: "q2" });
const repeatIssues = auditEscapeRoomText(repeated).issues;
assert.ok(repeatIssues.some((issue) => issue.code === "repeated_answer"));
assert.ok(repeatIssues.some((issue) => issue.code === "repeated_question"));

for (const invalid of ["word2", "2word", "word 2"]) {
  const malformed = structuredClone(project);
  malformed.misiones[0].preguntas[0].respuesta_correcta = invalid;
  malformed.misiones[0].preguntas[0].respuestas_aceptadas = [invalid];
  assert.ok(auditEscapeRoomText(malformed).issues.some((issue) => issue.code === "invalid_word_answer"), `${invalid} debe rechazarse como palabra.`);
}

const accented = structuredClone(project);
accented.misiones[0].preguntas[0].respuesta_correcta = "comprensión";
accented.misiones[0].preguntas[0].respuestas_aceptadas = ["comprensión"];
assert.ok(!auditEscapeRoomText(accented).issues.some((issue) => issue.code === "invalid_word_answer"));

const twoWords = structuredClone(project);
twoWords.misiones[0].preguntas[0].respuesta_correcta = "Milky Way";
twoWords.misiones[0].preguntas[0].respuestas_aceptadas = ["Milky Way"];
assert.ok(!auditEscapeRoomText(twoWords).issues.some((issue) => issue.code === "invalid_word_answer"), "La auditoría debe aceptar dos palabras sin números.");

const sequenceWithoutScalarAnswer = structuredClone(project);
sequenceWithoutScalarAnswer.misiones[0].preguntas[0] = {
  ...baseQuestion,
  tipo_interaccion: "ordenar_secuencia",
  subtipo_respuesta: "palabra",
  respuesta_correcta: "",
  respuestas_aceptadas: [],
  elementos: ["Earth", "Mars", "Venus"],
  pista: "Compare the first letter of Earth, Mars, and Venus and arrange them from A to Z."
};
assert.ok(!auditEscapeRoomText(sequenceWithoutScalarAnswer).issues.some((issue) => issue.code === "invalid_word_answer"), "Una secuencia no debe exigir una respuesta escalar de tipo palabra.");

for (const [idioma, instrucciones] of [
  ["en-US", "Use the water cycle briefing and its evidence to solve every room before unlocking the final mission."],
  ["en-GB", "Use the water cycle briefing and its evidence to solve every room before unlocking the final mission."],
  ["es-419", "Usa el briefing del ciclo del agua y sus evidencias para resolver cada sala antes de desbloquear la misión final."],
  ["fr-FR", "Utilisez le briefing sur le cycle de l’eau et ses preuves pour résoudre chaque salle avant la mission finale."],
  ["pt-BR", "Use o briefing do ciclo da água e suas evidências para resolver cada sala antes da missão final."]
]) {
  const localized = structuredClone(project);
  localized.idioma = idioma;
  localized.instrucciones = instrucciones;
  assert.ok(!auditEscapeRoomText(localized).issues.some((issue) => ["generic_instructions", "unrelated_instructions"].includes(issue.code)), `${idioma} debe aceptar instrucciones contextuales.`);
}

assert.ok(collectForbiddenAnswerTerms(project, project.misiones[0]).includes("evaporation"));
assert.ok(collectForbiddenAnswerTerms(project).includes("HYDRO"));

const missingAnchors = structuredClone(project.misiones[0]);
missingAnchors.preguntas = [
  { ...baseQuestion, _coverage_anchor: "" },
  { ...baseQuestion, titulo: "Identify cloud formation", reto: "Which process forms droplets in clouds?", respuesta_correcta: "condensation", respuestas_aceptadas: ["condensation"], _coverage_anchor: "" }
];
const assignedCoverage = assignBriefingCoverageAnchors(missingAnchors);
assert.equal(assignedCoverage.issues.length, 0);
assert.equal(assignedCoverage.inferred, 2);
assert.match(missingAnchors.preguntas[0]._coverage_anchor, /evaporation/i);
assert.match(missingAnchors.preguntas[1]._coverage_anchor, /condensation/i);
assert.notEqual(missingAnchors.preguntas[0]._coverage_anchor, missingAnchors.preguntas[1]._coverage_anchor);

const foundation = { titulo: "Base", instrucciones: "Contextual", misiones: [{ id: "r1", contexto: "Brief", preguntas: [] }] };
const generated = { titulo: "Changed", misiones: [{ id: "r1", contexto: "Changed brief", preguntas: [{ id: "q1" }] }] };
const merged = mergeFoundationWithQuestions(foundation, generated);
assert.equal(merged.titulo, "Base");
assert.equal(merged.misiones[0].contexto, "Brief");
assert.equal(merged.misiones[0].preguntas[0].id, "q1");

console.log("Escape room content quality OK.");
