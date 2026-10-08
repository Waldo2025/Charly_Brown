import assert from "node:assert/strict";
import { buildWordDocumentHtml, annotateActivityHtmlForWord } from "../public/charly-brown/export-service.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { collectApprovedDocument } = require("../functions/src/charly-brown-export.js");

const mockSession = {
  id: "test-session-1",
  title: "Unidad 3: El Universo y la Lengua",
  academicMeta: { level: "Primaria", grade: "Tercero", trimester: "1" },
  units: [{
    id: "unit-1",
    title: "Unidad 3: El Universo y la Lengua",
    meta: { unit: "3", category: "Lenguaje y comunicación" },
    sya: {
      ejeArticulador: "Apropiación de las culturas a través de la lectura y la escritura",
      competencia: "Comunica y aplica convenciones lingüísticas"
    },
    accepted: {
      activities: [{
        id: "act-1",
        subtopic: "Ortografía",
        section: "Ortografía",
        title: "Palabras con hiato y diptongo",
        html: `
          <div class="activity">
            <p><strong>Lee con atención las siguientes palabras.</strong> [IC. T. IND]</p>
            <ol class="steps steps-numbered">
              <li>Identifica la vocal fuerte y la vocal débil.</li>
              <li>Separa en sílabas cada término.</li>
            </ol>
            <p class="answer"><span style="color:#e6007e;">Respuesta: ma-íz, pa-ís</span></p>
          </div>
        `
      }],
      teacherNotes: [{
        id: "note-1",
        subtopic: "Ortografía",
        title: "Orientaciones didácticas de Ortografía",
        html: "<p>Comience la sesión pidiendo a los alumnos que pronuncien las vocales.</p>"
      }]
    }
  }]
};

// 1. Verificación en buildWordDocumentHtml (Frontend Client Export)
const studentHtml = buildWordDocumentHtml(mockSession, { documentKind: "student" });

// Subtema
assert.ok(studentHtml.includes('data-word-style="0103SUBTITULONIVEL2"'), "Debe incluir el estilo 0103SUBTITULONIVEL2 para el Subtema");
assert.ok(studentHtml.includes("<strong>Subtema:</strong> Ortografía"), "Debe mostrar el nombre del subtema");

// Campo formativo
assert.ok(studentHtml.includes('data-word-style="0104CAMPOFORMATIVO"'), "Debe incluir 0104CAMPOFORMATIVO para Campo formativo");

// Eje articulador
assert.ok(studentHtml.includes('data-word-style="0802EJEARTICULADOR"'), "Debe incluir 0802EJEARTICULADOR para Eje articulador");

// Habilidad cognitiva
assert.ok(studentHtml.includes('data-word-style="080502HABILIDADES"'), "Debe incluir 080502HABILIDADES para Habilidad cognitiva");
assert.ok(studentHtml.includes("Habilidad cognitiva:</strong>"), "Debe inferir y mostrar la etiqueta de habilidad cognitiva");
assert.ok(studentHtml.includes("Evaluación de Sistemas Simbólicos (ESS)"), "Debe inferir la habilidad cognitiva de Ortografía");

// Título actividad
assert.ok(studentHtml.includes('data-word-style="0105TITULOSECCIONYCOMPETENCIA">Palabras con hiato y diptongo</p>'), "Debe usar 0105TITULOSECCIONYCOMPETENCIA para el título");

// Instrucción
assert.ok(studentHtml.includes('data-word-style="020100INSTRUCCION"'), "Debe marcar la instrucción con 020100INSTRUCCION");

// Listas numeradas
assert.ok(studentHtml.includes('data-word-style="020200TEXTONUMERADONIVEL1"'), "Debe marcar los pasos li con 020200TEXTONUMERADONIVEL1");

// Respuestas del alumno
assert.ok(studentHtml.includes('data-word-style="080400RESPUESTAALUMNO"'), "Debe marcar la respuesta con 080400RESPUESTAALUMNO");
assert.ok(studentHtml.includes('data-word-char-style="ARESPUESTAALUMNO"'), "Debe marcar el carácter de respuesta con ARESPUESTAALUMNO");

// 2. Verificación de Notas del Maestro
const teacherHtml = buildWordDocumentHtml(mockSession, { documentKind: "teacher-notes" });
assert.ok(teacherHtml.includes('data-word-style="1002SPEC"'), "Las notas del maestro deben usar el estilo 1002SPEC");

// 3. Verificación en collectApprovedDocument (Backend Export)
const backendDoc = collectApprovedDocument(mockSession, { documentKind: "student" });
assert.equal(backendDoc.sections.length, 1);
const blocks = backendDoc.sections[0].blocks;
assert.ok(blocks.some(b => b.type === "subtopic" && b.style === "0103SUBTITULONIVEL2"), "Backend debe incluir bloque subtopic 0103SUBTITULONIVEL2");
assert.ok(blocks.some(b => b.type === "habilidades" && b.style === "080502HABILIDADES"), "Backend debe incluir bloque habilidades 080502HABILIDADES");
assert.ok(blocks.some(b => b.type === "instruction"), "Backend debe clasificar instrucción");

console.log("Word 10ED template styles export tests passed successfully!");
