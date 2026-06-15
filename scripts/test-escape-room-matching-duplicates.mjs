import assert from "node:assert/strict";

import { buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

const project = {
  titulo: "Emparejamiento duplicado",
  subtitulo: "Preview editorial",
  introduccion: "Prueba de autocalificación",
  conclusion: "Clave final",
  misiones: [
    {
      id: "m1",
      titulo: "Sala 1",
      tipo_interaccion: "relacion_columnas",
      subtipo_respuesta: "frase_corta",
      pregunta: "",
      reto: "Empareja los conceptos",
      pista: "Observa la relación exacta",
      parejas: [
        { izquierda: "A", derecha: "Tecnología" },
        { izquierda: "B", derecha: "Tecnología" },
        { izquierda: "C", derecha: "Naturaleza" }
      ],
      preguntas: [
        {
          id: "q1",
          titulo: "Pregunta 1",
          tipo_interaccion: "relacion_columnas",
          subtipo_respuesta: "frase_corta",
          reto: "Empareja los conceptos",
          pista: "Observa la relación exacta",
          parejas: [
            { izquierda: "A", derecha: "Tecnología" },
            { izquierda: "B", derecha: "Tecnología" },
            { izquierda: "C", derecha: "Naturaleza" }
          ],
          respuestas_aceptadas: ["Tecnología"]
        }
      ]
    }
  ]
};

const previewHtml = buildPreviewDocument(project, { editorialReview: true });

assert.ok(
  previewHtml.includes('function checkMatchingQuestion(question, key)'),
  "El preview debe incluir la validación de emparejamiento."
);

assert.ok(
  previewHtml.includes('return question.parejas.every((pair, index) => {'),
  "La validación debe comparar cada fila por índice."
);

assert.ok(
  !previewHtml.includes('new Set(selectedValues).size !== question.parejas.length'),
  "La validación no debe rechazar respuestas duplicadas por unicidad global."
);

console.log("Escape room matching duplicates OK.");
