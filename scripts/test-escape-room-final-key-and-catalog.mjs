import assert from "node:assert/strict";
import {
  normalizeEscapeRoomProject,
  resolveFinalPasscode
} from "../public/js/escape-room-creator-model.mjs";
import { buildEscapeRoomPackage, buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";
import { buildMoodleAnswerKeyHtml } from "../public/js/escape-room-answer-export.mjs";
import { buildInteractionPlan, ESCAPE_ROOM_INTERACTION_CATALOG } from "../public/js/escape-room-interaction-plan.mjs";

const aliases = ["clave_final", "final_key", "final_code", "passcode", "clave"];
aliases.forEach((alias) => {
  const normalized = normalizeEscapeRoomProject({ titulo: "Alias", [alias]: "nova-42", misiones: [] });
  assert.equal(normalized.clave_final, "NOVA42", `Debe importar el alias ${alias}.`);
});

const legacy = { titulo: "Legacy", conclusion: 'The system displays "Victory".', misiones: [{ titulo: "One" }] };
assert.equal(resolveFinalPasscode(legacy).code, "VICTORY", "Debe preservar exactamente el extractor legado, incluso sus coincidencias amplias.");
assert.equal(resolveFinalPasscode({ ...legacy, clave_final: "freedom9" }).code, "FREEDOM9", "La clave explícita debe prevalecer sobre la conclusión.");
const legacyManifest = JSON.parse(buildEscapeRoomPackage(legacy).files["assets/escape-room.json"]);
assert.equal(legacyManifest.clave_final, "VICTORY", "Al exportar un proyecto antiguo debe materializar su misma clave.");
const legacyRoundTrip = JSON.parse(buildEscapeRoomPackage(legacyManifest).files["assets/escape-room.json"]);
assert.equal(legacyRoundTrip.clave_final, legacyManifest.clave_final, "Reexportar un manifiesto antiguo no debe cambiar la solución.");

const plan = buildInteractionPlan(8, 4, "catalog-regression");
assert.equal(plan.length, 8);
assert.ok(plan.every((types) => types.length === 4 && new Set(types).size === 4), "Cada actividad debe usar cuatro familias diferentes.");
assert.ok(plan.every((types) => types.filter((type) => type === "drag_drop").length <= 1), "Drag & Drop no debe repetirse dentro de una actividad.");
assert.ok(plan.every((types, index) => index === 0 || types[0] !== plan[index - 1][0]), "Actividades consecutivas no deben comenzar con el mismo tipo.");
assert.equal(new Set(plan.map((types) => types.join("|"))).size, plan.length, "Las secuencias deben ser diferentes cuando el catálogo lo permite.");
assert.deepEqual(new Set(plan.flat()), new Set(ESCAPE_ROOM_INTERACTION_CATALOG), "La mezcla debe aprovechar todo el catálogo.");

const project = {
  idioma: "en-US",
  modo_presentacion: "menu_secciones",
  titulo: "Catalog test",
  clave_final: "STOP42",
  conclusion: "The team celebrates.",
  misiones: [{
    id: "m1",
    titulo: "Activity 1",
    preguntas: [
      { id: "q1", titulo: "Truth", reto: "The statement is correct.", tipo_interaccion: "verdadero_falso", respuesta_correcta: false },
      { id: "q2", titulo: "Order", reto: "Order the phases.", tipo_interaccion: "ordenar_secuencia", elementos: ["Alpha", "Beta", "Gamma"] },
      { id: "q3", titulo: "Blank", reto: "Complete it.", tipo_interaccion: "completar_espacio", texto_con_hueco: "Protocol ___ is active.", respuesta_correcta: "NOVA", respuestas_aceptadas: ["NOVA"] }
    ]
  }]
};
const pkg = buildEscapeRoomPackage(project);
const manifest = JSON.parse(pkg.files["assets/escape-room.json"]);
assert.equal(manifest.clave_final, "STOP42");
assert.deepEqual(manifest.misiones[0].preguntas.map((question) => question.tipo_interaccion), ["verdadero_falso", "ordenar_secuencia", "completar_espacio"]);
assert.equal(manifest.misiones[0].preguntas[0].respuesta_correcta, false);
assert.match(pkg.files["index.html"], /Final code: STOP42/);
assert.match(pkg.files["assets/game.js"], /questionSequenceOrders/);
assert.match(pkg.files["assets/game.js"], /data-question-boolean/);
assert.match(pkg.files["assets/game.js"], /fill-blank-block/);
assert.doesNotThrow(() => new Function(pkg.files["assets/game.js"]), "El runtime exportado debe compilar sin dependencias externas.");

const preview = buildPreviewDocument(project, { editorialReview: true });
assert.match(preview, /Final code: STOP42/);
assert.match(preview, /questionSequenceOrders/);
const answerKey = buildMoodleAnswerKeyHtml({ topics: [{ title: project.titulo, project }] }).html;
assert.match(answerKey, /Falso/);
assert.match(answerKey, /Alpha/);
assert.match(answerKey, /NOVA/);

console.log("Escape room final key and catalog OK.");
