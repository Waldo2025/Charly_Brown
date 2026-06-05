import assert from "node:assert/strict";

import {
  normalizeEscapeRoomProject,
  getMissionAcceptedAnswers,
  normalizePlayerAnswer,
  validateMissionAnswer,
  validateQuestionAnswer,
  normalizeMediaValue
} from "../public/js/escape-room-creator-model.mjs";

const project = normalizeEscapeRoomProject({
  titulo: "Boveda Algebraica",
  misiones: [
    {
      id: "m1",
      titulo: "Codigo uno",
      tipo_interaccion: "texto",
      subtipo_respuesta: "letra",
      respuesta_correcta: "B",
      respuestas_aceptadas: ["b", " beta "],
      preguntas: [
        {
          id: "q1",
          titulo: "Pregunta interna",
          tipo_interaccion: "texto",
          subtipo_respuesta: "palabra",
          respuesta_correcta: "llave",
          respuestas_aceptadas: ["llave"]
        }
      ],
      desbloquea: ["m2"]
    },
    {
      id: "m2",
      titulo: "Clave numerica",
      tipo_interaccion: "multimedia",
      subtipo_respuesta: "numero",
      respuesta_correcta: "42",
      media: {
        tipo: "audio",
        url: "assets/media/pista.mp3"
      }
    },
    {
      id: "m3",
      titulo: "Emparejar",
      tipo_interaccion: "relacion_columnas",
      parejas: [
        { izquierda: "x", derecha: "2" },
        { izquierda: "y", derecha: "7" }
      ],
      bloqueada_inicial: true
    }
  ]
});

assert.equal(project.misiones.length, 3, "Debe conservar las misiones normalizadas.");
assert.equal(project.misiones[0].subtipo_respuesta, "letra", "Debe preservar el subtipo de respuesta.");
assert.equal(project.misiones[1].media.tipo, "audio", "Debe normalizar el media de una misión multimedia.");
assert.deepEqual(project.misiones[0].desbloquea, ["m2"], "Debe preservar la regla simple de desbloqueo.");
assert.equal(project.misiones[2].bloqueada_inicial, true, "Debe preservar el estado inicial bloqueado.");

assert.ok(Array.isArray(project.misiones[0].preguntas), "Debe normalizar una lista de preguntas internas por sala.");
assert.equal(project.misiones[0].preguntas.length, 1, "Debe conservar la pregunta interna declarada.");
assert.equal(project.misiones[0].preguntas[0].respuesta_correcta, "llave", "Debe normalizar la respuesta correcta de la pregunta interna.");

assert.equal(
  validateQuestionAnswer(project.misiones[0].preguntas[0], "LLAVE"),
  true,
  "Debe validar respuestas correctas en preguntas internas."
);

assert.deepEqual(
  getMissionAcceptedAnswers(project.misiones[0]),
  ["b", "beta"],
  "Debe priorizar respuestas_aceptadas sobre respuesta_correcta para validar."
);

assert.equal(
  normalizePlayerAnswer(" Á-2 ", { subtipo_respuesta: "codigo_corto" }),
  "a2",
  "Debe normalizar codigos cortos sin acentos ni separadores."
);

assert.equal(
  normalizePlayerAnswer(" 0042 ", { subtipo_respuesta: "numero" }),
  "42",
  "Debe normalizar respuestas numericas removiendo ceros de relleno."
);

assert.equal(
  validateMissionAnswer(project.misiones[0], "B"),
  true,
  "Debe aceptar la respuesta correcta aunque exista una lista de variantes."
);

assert.equal(
  validateMissionAnswer(project.misiones[0], "beta"),
  true,
  "Debe aceptar variantes definidas en respuestas_aceptadas."
);

assert.equal(
  validateMissionAnswer(project.misiones[1], "0042"),
  true,
  "Debe validar numeros equivalentes en misiones multimedia."
);

assert.equal(
  validateMissionAnswer(project.misiones[0], "ZZ"),
  false,
  "Debe rechazar respuestas incorrectas."
);

const descriptiveMedia = normalizeMediaValue("Terminal de computadora antigua con pantalla de fósforo verde mostrando expresiones algebraicas.");
assert.equal(descriptiveMedia?.url || "", "", "No debe tratar una descripcion larga como URL de media.");
assert.match(descriptiveMedia?.texto || "", /Terminal de computadora antigua/i, "Debe preservar la descripcion como texto de apoyo.");

console.log("escapeRoomCreator model OK.");
