import assert from "node:assert/strict";
import {
  buildMoodleAnswerKeyHtml,
  countAnswerKeyQuestions
} from "../public/js/escape-room-answer-export.mjs";

const topics = [
  {
    id: "topic-2",
    academicNumber: 2,
    title: "Segundo tema",
    project: {
      titulo: "Tema <script>alert(1)</script>",
      nivel: "Secundaria",
      tema: "2",
      estacion: "Segunda estación",
      materia: "Matemáticas",
      modo_presentacion: "menu_secciones",
      misiones: [{
        titulo: "Actividad final",
        paleta_academica: { color_tema_unidad: "#ea5a5a", color_estacion: "#bbd152" },
        preguntas: [{
          titulo: "Pregunta & respuesta",
          reto: "¿Cuál es la clave?",
          tipo_interaccion: "texto",
          respuesta_correcta: "Árbol",
          respuestas_aceptadas: ["Árbol", "árbol", "Arboleda"]
        }]
      }]
    }
  },
  {
    id: "topic-1",
    academicNumber: 1,
    project: {
      titulo: "Relaciones",
      nivel: "Primaria",
      unidad: "1",
      materia: "Español",
      modo_presentacion: "salas",
      misiones: [{
        titulo: "Sala inicial",
        paleta_academica: { color_tema_unidad: "#2da6b1", color_estacion: "#fcc659" },
        preguntas: [{
          titulo: "Une conceptos",
          reto: "Relaciona cada elemento.",
          tipo_interaccion: "relacion_columnas",
          parejas: [
            { izquierda: "México", derecha: "CDMX" },
            { izquierda: "Francia", derecha: "París" }
          ]
        }, {
          titulo: "Encaja pistas",
          reto: "Arrastra cada ficha.",
          tipo_interaccion: "drag_drop",
          parejas: [
            { izquierda: "Mamífero", derecha: "Ballena" },
            { izquierda: "Ave", derecha: "Colibrí" }
          ]
        }]
      }]
    }
  }
];

assert.equal(countAnswerKeyQuestions(topics), 3);

const result = buildMoodleAnswerKeyHtml({
  sessionTitle: "Sesión <Docente>",
  topics
});

assert.equal(result.questionCount, 3);
assert.equal(result.topicCount, 2);
assert.ok(result.html.startsWith("<div style="), "Moodle debe recibir un único fragmento raíz.");
assert.doesNotMatch(result.html, /<(?:html|head|style|script)\b/i, "El fragmento no debe depender de documento, scripts ni CSS global.");
assert.match(result.html, /style="[^"]+"/, "El diseño debe usar CSS inline.");
assert.match(result.html, /Sesión &lt;Docente&gt;/);
assert.match(result.html, /Tema &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(result.html, /<script>alert/);
assert.ok(result.html.indexOf("Relaciones") < result.html.indexOf("Tema &lt;script"), "Los temas deben ordenarse por número académico.");
assert.match(result.html, /México[\s\S]*CDMX[\s\S]*Francia[\s\S]*París/, "Las relaciones deben mostrar sus parejas correctas.");
assert.match(result.html, /Mamífero[\s\S]*Ballena[\s\S]*Ave[\s\S]*Colibrí/, "Drag & drop debe mostrar sus parejas en la hoja de respuestas.");
assert.match(result.html, /También acepta:<\/span> Arboleda/);
assert.doesNotMatch(result.html, /También acepta:<\/span>[^<]*Árbol/i, "La respuesta principal no debe repetirse como variante.");
assert.match(result.html, /Actividad 01/);
assert.match(result.html, /Sala 01/);
assert.match(result.html, /Materia:<\/strong> Matemáticas<\/span>/);
assert.match(result.html, /Tema:<\/strong> 2<\/span>/);
assert.doesNotMatch(result.html, />Estación:/, "La cabecera no debe mostrar un badge de estación.");
assert.doesNotMatch(result.html, /border-left:[34]px solid/, "Las tarjetas no deben usar barras gruesas de color.");
assert.doesNotMatch(result.html, /border-radius:999px/, "La metadata debe ser editorial y no usar badges coloreados.");
assert.match(result.html, /Respuesta<\/span><strong style="color:#172033;/, "Las respuestas deben conservar una presentación neutral.");
assert.match(result.html, /Materia:<\/strong> Español<\/span>/);
assert.match(result.html, /Unidad:<\/strong> 1<\/span>/);
assert.match(result.html, /<h2 style="[^"]*color:#20787f;">Relaciones<\/h2>/, "El color del tema debe reservarse para su título.");
assert.match(result.html, /<span style="[^"]*color:#83672e;">Sala 01<\/span>/, "El color de estación debe reservarse para el subtítulo de sala.");

const singleTopicResult = buildMoodleAnswerKeyHtml({
  sessionTitle: "Copia individual",
  topics: [topics[0]]
});
assert.equal(singleTopicResult.topicCount, 1, "La copia individual debe contener exactamente un tema.");
assert.match(singleTopicResult.html, /Tema &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(singleTopicResult.html, /Relaciones|México|CDMX/, "Un tema individual no debe filtrar respuestas de otros temas.");

const allStationsResult = buildMoodleAnswerKeyHtml({
  sessionTitle: "Estaciones y respuestas abiertas",
  topics: [{
    academicNumber: 3,
    project: {
      titulo: "Rotación de estaciones",
      nivel: "Secundaria",
      tema: "3",
      estacion: "Todas",
      materia: "Ciencias Naturales",
      misiones: [
        {
          titulo: "Primera sala multicolor",
          paleta_academica: { color_tema_unidad: "#952e89", color_estacion: "#fcc659" },
          preguntas: [
            { titulo: "Reflexiona", reto: "Explica tu propuesta.", subtipo_respuesta: "frase_libre", respuesta_correcta: "" },
            { titulo: "Clave", reto: "Escribe la clave.", subtipo_respuesta: "palabra", respuesta_correcta: "hoja" }
          ]
        },
        {
          titulo: "Segunda sala multicolor",
          paleta_academica: { color_tema_unidad: "#952e89", color_estacion: "#bbd152" },
          preguntas: [
            { titulo: "Número", reto: "Escribe el número.", subtipo_respuesta: "numero", respuesta_correcta: "4" },
            { titulo: "Código", reto: "Escribe el código.", subtipo_respuesta: "codigo_corto", respuesta_correcta: "BIO" }
          ]
        }
      ]
    }
  }]
});
assert.match(allStationsResult.html, />Respuesta libre<\/strong>/, "Las preguntas abiertas deben identificarse como respuesta libre.");
assert.doesNotMatch(allStationsResult.html, /Sin respuesta configurada/, "Una pregunta abierta no debe parecer incompleta.");
for (const color of ["#fcc659", "#bbd152", "#e95297", "#02b0a3"]) {
  assert.match(allStationsResult.html, new RegExp(`border-top:2px solid ${color}`), `Debe existir un acento compacto con el color de estación ${color}.`);
}
assert.deepEqual(
  [...allStationsResult.html.matchAll(/border-top:2px solid (#[0-9a-f]{6})/g)].map((match) => match[1]),
  ["#fcc659", "#bbd152", "#e95297", "#02b0a3"],
  "La secuencia de estaciones debe continuar entre salas sin repetir el último color."
);
assert.doesNotMatch(allStationsResult.html, /background:#(?:fffdfa|fdfefa|fefafc|f9fefe)/, "Las preguntas no deben usar fondos teñidos por estación.");
assert.doesNotMatch(allStationsResult.html, />Estación:/, "Incluso con Todas, no debe aparecer el badge de estación.");

const missingStationResult = buildMoodleAnswerKeyHtml({
  sessionTitle: "Estación heredada",
  topics: [{
    academicNumber: 4,
    project: {
      titulo: "Sin estación explícita",
      materia: "Español",
      misiones: [{
        titulo: "Sala",
        preguntas: [
          { titulo: "Uno", respuesta_correcta: "A" },
          { titulo: "Dos", respuesta_correcta: "B" }
        ]
      }]
    }
  }]
});
assert.deepEqual(
  [...missingStationResult.html.matchAll(/border-top:2px solid (#[0-9a-f]{6})/g)].map((match) => match[1]),
  ["#fcc659", "#bbd152"],
  "La ausencia de estación explícita debe comportarse como Todas."
);

const withoutEmptyTopics = buildMoodleAnswerKeyHtml({
  sessionTitle: "Sesión con borrador vacío",
  topics: [
    {
      academicNumber: 1,
      project: {
        titulo: "Tema listo",
        misiones: [{ titulo: "Sala", preguntas: [{ titulo: "Pregunta", respuesta_correcta: "A" }] }]
      }
    },
    {
      academicNumber: 2,
      title: "Nuevo escape room",
      project: null
    },
    {
      academicNumber: 3,
      project: { titulo: "Tema sin preguntas", misiones: [{ titulo: "Sala vacía", preguntas: [] }] }
    }
  ]
});
assert.equal(withoutEmptyTopics.topicCount, 1, "La copia global debe excluir todos los temas vacíos.");
assert.match(withoutEmptyTopics.html, /Tema listo/);
assert.doesNotMatch(withoutEmptyTopics.html, /Nuevo escape room|Tema sin preguntas|Sala vacía/);

const onlyEmptyTopic = buildMoodleAnswerKeyHtml({
  sessionTitle: "Solo vacío",
  topics: [{ academicNumber: 1, project: null }]
});
assert.equal(onlyEmptyTopic.questionCount, 0);
assert.equal(onlyEmptyTopic.topicCount, 0, "Un tema vacío individual no debe incorporarse al código copiado.");

console.log("Escape room Moodle answer export OK.");
