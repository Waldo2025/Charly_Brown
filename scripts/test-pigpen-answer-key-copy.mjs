import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../public/PigPenCreator.css", import.meta.url), "utf8");

assert.match(
  source,
  /class="er-topic-item"[\s\S]*class="er-topic-button \$\{topic\.id === state\.activeTopicId[\s\S]*data-topic-copy-answers="\$\{escapeHtmlAttr\(topic\.id\)\}"/,
  "Cada tema debe mostrar su propia acción de copiar respuestas."
);
assert.match(
  source,
  /from "\.\/escape-room-answer-export\.mjs"/,
  "El Creator debe conectar el generador de hojas de respuestas."
);
assert.match(
  source,
  /function getLatestTopicForAnswerCopy\(topic = \{\}\)[\s\S]*topic\.id !== state\.activeTopicId[\s\S]*project: materializeProjectForExport\(\)/,
  "El solucionario debe incluir la versión actual del tema activo aunque todavía no se haya guardado."
);
assert.match(
  source,
  /function copyTopicAnswers\(topicId\)[\s\S]*topics: \[latestTopic\][\s\S]*copyAnswerKeyToClipboard/,
  "La acción debe copiar únicamente las respuestas del tema elegido."
);
assert.match(
  source,
  /"text\/html": new Blob[\s\S]*"text\/plain": new Blob/,
  "El portapapeles debe incluir HTML enriquecido y una alternativa para campos de código."
);
assert.match(
  source,
  /const plainText = markup/,
  "Los destinos que solo aceptan texto deben recibir el HTML fuente con sus estilos inline."
);
assert.match(
  source,
  /event\.clipboardData\.setData\("text\/html", markup\)[\s\S]*event\.clipboardData\.setData\("text\/plain", plainText\)/,
  "El fallback también debe declarar explícitamente HTML y texto en el evento copy."
);
assert.match(
  source,
  /const pendingSave = topicId === state\.activeTopicId[\s\S]*const latestTopic[\s\S]*await copyAnswerKeyToClipboard[\s\S]*if \(pendingSave\) await pendingSave/,
  "La escritura al portapapeles debe comenzar antes de esperar a Firestore para conservar el permiso del clic."
);
assert.match(
  source,
  /const copyButton = event\.target\.closest\("\[data-topic-copy-answers\]"\)[\s\S]*copyTopicAnswers\(copyButton\.dataset\.topicCopyAnswers\)/,
  "La lista de temas debe delegar el clic al copiador del tema correspondiente."
);
assert.match(
  styles,
  /\.er-topic-item[\s\S]*grid-template-columns: minmax\(0, 1fr\) 32px[\s\S]*\.er-topic-export/,
  "El icono de copia debe conservar su columna dentro de cada fila de tema."
);

console.log("PigPenCreator answer-key copy OK.");
