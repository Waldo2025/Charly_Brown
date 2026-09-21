import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  buildEditorialWorkbookBlob,
  buildEditorialWorkbook,
  previewEditorialImport,
  readEditorialWorkbook
} from "../public/js/escape-room-editorial-workbook.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("../public/vendor/xlsx/xlsx.full.min.js");
const JSZip = require("../public/vendor/jszip/jszip.min.js");
const creatorHtml = readFileSync(new URL("../public/PigPenCreator.html", import.meta.url), "utf8");
const creatorJs = readFileSync(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");

assert.match(creatorHtml, /id="btnEditorialReview"/);
assert.match(creatorHtml, /id="erEditorialReviewModal"[\s\S]*id="btnApplyEditorialWorkbook"/);
assert.match(creatorHtml, /id="erEditorialDriveUrl"[\s\S]*id="btnImportEditorialDrive"/);
assert.match(creatorJs, /writeBatch[\s\S]*lastEditorialImportAt/);
assert.match(creatorJs, /previewEditorialImport[\s\S]*fetchSessionTopics/);
assert.match(creatorJs, /ensureEditorialJsZip[\s\S]*vendor\/jszip\/jszip\.min\.js/);
assert.match(creatorJs, /authFetch\("\/api\/pigpen\/editorial-workbook"/);
assert.match(creatorJs, /buildEditorialWorkbookBlob[\s\S]*XLSX\.writeFile/, "La exportación debe conservar una descarga de respaldo sin estilos.");
assert.doesNotMatch(creatorJs, /Aplicar\s*=\s*Sí|cambios marcados|marcadas para aplicar/, "La interfaz editorial no debe depender de la columna Aplicar.");
assert.match(creatorJs, /No se detectaron cambios en la columna Texto\./);
assert.match(creatorJs, /batch\.update\(doc\(db, ESCAPE_ROOM_COLLECTION[\s\S]*project: topic\.project/, "La importación debe actualizar únicamente el JSON de los temas modificados.");

const project = {
  titulo: "Escape original",
  subtitulo: "Subtítulo",
  introduccion: "Introducción",
  instrucciones: "Instrucciones",
  conclusion: "Final",
  clave_final: "CLAVE",
  misiones: [{
    id: "mission-1",
    titulo: "Sala 1",
    historia: "Historia",
    contexto: "Contexto",
    datos_clave: ["Dato"],
    reto: "Reto",
    pista: "Pista",
    imagen_prompt: "Santuario de mármol",
    imagen_alt: "Santuario",
    preguntas: [{
      id: "question-1",
      titulo: "Pregunta original",
      reto: "Elige una opción",
      pista: "Pista",
      imagen_prompt: "Detalle del santuario",
      imagen_alt: "Imagen",
      retroalimentacion_correcta: "Correcto",
      retroalimentacion_incorrecta: "Intenta otra vez",
      tipo_interaccion: "opcion_multiple",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "B",
      respuestas_aceptadas: ["B"],
      opciones: ["A", "B", "C"],
      parejas: [],
      elementos: []
    }, {
      id: "question-2",
      titulo: "Respuesta breve",
      reto: "Escribe la respuesta",
      pista: "Pista",
      imagen_alt: "",
      retroalimentacion_correcta: "Correcto",
      retroalimentacion_incorrecta: "Intenta otra vez",
      tipo_interaccion: "texto",
      subtipo_respuesta: "palabra",
      respuesta_correcta: "original",
      respuestas_aceptadas: ["original"],
      opciones: [],
      parejas: [],
      elementos: []
    }, {
      id: "question-3",
      titulo: "Relaciona",
      reto: "Relaciona los conceptos",
      pista: "Pista",
      tipo_interaccion: "relacion_columnas",
      respuesta_correcta: "",
      respuestas_aceptadas: [],
      opciones: [],
      parejas: [{ izquierda: "Sol", derecha: "Estrella", pista: "Emite luz" }, { izquierda: "Tierra", derecha: "Planeta", pista: "Orbita una estrella" }],
      elementos: []
    }, {
      id: "question-4",
      titulo: "Ordena",
      reto: "Ordena los pasos",
      pista: "Pista",
      tipo_interaccion: "ordenar_secuencia",
      respuesta_correcta: "",
      respuestas_aceptadas: [],
      opciones: [],
      parejas: [],
      elementos: ["Primero", "Después", "Final"]
    }]
  }]
};
const topics = [{ id: "topic-1", academicNumber: 1, title: project.titulo, formState: {}, project }];

function updateSheetRow(sheet, predicate, updates) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headers = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    headers[column] = String(sheet[XLSX.utils.encode_cell({ r: 1, c: column })]?.v || "");
  }
  for (let row = 2; row <= range.e.r; row += 1) {
    const record = Object.fromEntries(headers.map((header, column) => [header, sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v ?? ""]));
    if (!predicate(record)) continue;
    for (const [header, value] of Object.entries(updates)) {
      const column = headers.indexOf(header);
      assert.ok(column >= 0, `No existe la columna ${header}`);
      sheet[XLSX.utils.encode_cell({ r: row, c: column })] = { t: typeof value === "number" ? "n" : "s", v: value };
    }
    return;
  }
  assert.fail("No se encontró la fila esperada.");
}

const workbook = buildEditorialWorkbook(XLSX, { sessionId: "session-1", sessionTitle: "Sesión", topics });
assert.deepEqual(workbook.SheetNames, ["Instrucciones", "Textos", "__map", "__meta"]);
const incompleteEditorialProject = structuredClone(project);
incompleteEditorialProject.misiones[0].preguntas[2].parejas = [
  { izquierda: "Sol", derecha: "Estrella", pista: "Pendiente de revisión" }
];
const incompleteEditorialWorkbook = buildEditorialWorkbook(XLSX, {
  sessionId: "session-incomplete",
  sessionTitle: "Borrador incompleto",
  topics: [{ id: "topic-incomplete", academicNumber: 1, title: "Borrador", project: incompleteEditorialProject }]
});
assert.ok(
  incompleteEditorialWorkbook.Sheets.Textos,
  "El Excel editorial debe poder exportar actividades incompletas para que Editorial las corrija."
);
assert.equal(workbook.Workbook.Sheets.find((sheet) => sheet.name === "Instrucciones")?.Hidden, 1);
assert.equal(workbook.Workbook.Sheets.find((sheet) => sheet.name === "Textos")?.Hidden || 0, 0, "Textos debe ser la única hoja visible para Editorial.");
assert.equal(workbook.Workbook.Sheets.find((sheet) => sheet.name === "__map")?.Hidden, 2, "El mapa técnico debe permanecer muy oculto.");
const textHeaders = XLSX.utils.sheet_to_json(workbook.Sheets.Textos, { header: 1, range: 1, defval: "" })[0];
assert.deepEqual(textHeaders, ["Tema", "Sala / Room", "Pregunta", "Contenido", "Texto"]);
assert.equal(textHeaders.length, 5, "La hoja visible no debe incluir columnas técnicas.");
const friendlyTextRows = XLSX.utils.sheet_to_json(workbook.Sheets.Textos, { range: 1, defval: "" });
assert.equal(friendlyTextRows[0].Tema, 1, "Cada fila debe mostrar el número de tema.");
assert.ok(friendlyTextRows.some((row) => row["Sala / Room"] === 1 && row.Pregunta === 1), "Las filas de pregunta deben mostrar sala y pregunta.");
assert.ok(friendlyTextRows.filter((row) => row.Pregunta === 1).every((row) => row["Sala / Room"] === 1), "La ubicación debe repetirse en todas las filas de la pregunta.");
assert.equal(friendlyTextRows[0].Texto, "Escape original", "Editorial debe editar directamente el texto actual.");
assert.ok(friendlyTextRows.some((row) => row.Contenido === "Opción 2 (respuesta correcta)" && row.Texto === "B"), "La respuesta correcta debe aparecer en la misma hoja de textos.");
assert.ok(friendlyTextRows.some((row) => row.Contenido === "Respuesta correcta" && row.Texto === "original"), "Las respuestas escritas deben aparecer en la misma hoja.");
assert.ok(
  friendlyTextRows.some((row) => row["Sala / Room"] === 1 && row.Contenido === "Briefing · Botón Review the briefing" && row.Texto === "Volver a consultar el expediente"),
  "Cada sala debe exportar el texto localizado de Review the briefing."
);
assert.equal(workbook.Sheets.Textos["!cols"].length, 5, "La hoja visible debe contener solamente cinco columnas.");

updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Título" && row.Texto === "Pregunta original", {
  Texto: "Pregunta corregida"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Palabra clave final", {
  Texto: "PISTA"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Opción 2 (respuesta correcta)", {
  Texto: "D"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Respuesta correcta", {
  Texto: "corregida"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Pareja 1: lado derecho", {
  Texto: "Astro"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Pareja 1: pista" && row.Pregunta === 3, {
  Texto: "Produce su propia luz"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Paso 2", {
  Texto: "Luego"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Briefing · Botón Review the briefing", {
  Texto: "Revisar nuevamente el expediente"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Prompt de imagen" && row.Pregunta === "", {
  Texto: "Santuario clásico de mármol"
});
updateSheetRow(workbook.Sheets.Textos, (row) => row.Contenido === "Prompt de imagen" && row.Pregunta === 1, {
  Texto: "Detalle clásico del santuario"
});

const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
const document = readEditorialWorkbook(XLSX, data);
const preview = previewEditorialImport(document, { sessionId: "session-1", topics });
assert.deepEqual(preview.errors, []);
assert.deepEqual(preview.conflicts, []);
assert.equal(preview.changes.length, 10);
assert.equal(preview.nextTopics[0].project.clave_final, "PISTA");
const nextQuestion = preview.nextTopics[0].project.misiones[0].preguntas[0];
assert.equal(nextQuestion.titulo, "Pregunta corregida");
assert.deepEqual(nextQuestion.opciones, ["A", "D", "C"]);
assert.equal(nextQuestion.respuesta_correcta, "D");
assert.equal(preview.nextTopics[0].project.misiones[0].preguntas[1].respuesta_correcta, "corregida");
assert.equal(preview.nextTopics[0].project.misiones[0].preguntas[2].parejas[0].derecha, "Astro");
assert.equal(preview.nextTopics[0].project.misiones[0].preguntas[2].parejas[0].pista, "Produce su propia luz");
assert.deepEqual(preview.nextTopics[0].project.misiones[0].preguntas[3].elementos, ["Primero", "Luego", "Final"]);
assert.equal(preview.nextTopics[0].project.misiones[0].briefing_boton_revisar, "Revisar nuevamente el expediente", "La importación debe aplicar los nuevos textos de briefing.");
assert.equal(preview.nextTopics[0].project.misiones[0].imagen_prompt, "Santuario clásico de mármol");
assert.equal(nextQuestion.imagen_prompt, "Detalle clásico del santuario");

const conflictTopics = structuredClone(topics);
conflictTopics[0].project.misiones[0].preguntas[0].titulo = "Cambio simultáneo";
const conflict = previewEditorialImport(document, { sessionId: "session-1", topics: conflictTopics });
assert.equal(conflict.conflicts.length, 1);
assert.equal(conflict.nextTopics[0].project.misiones[0].preguntas[0].titulo, "Cambio simultáneo");

const wrongSession = previewEditorialImport(document, { sessionId: "otra-sesion", topics });
assert.match(wrongSession.errors.join(" "), /otra sesión/i);

const portableWorkbook = buildEditorialWorkbook(XLSX, {
  sessionId: "",
  sessionTitle: "Sesión portable",
  topics: [{ ...topics[0], id: "", project: structuredClone(project) }]
});
updateSheetRow(portableWorkbook.Sheets.Textos, (row) => row.Contenido === "Título" && row.Texto === "Pregunta original", {
  Texto: "Pregunta portable"
});
const portableDocument = readEditorialWorkbook(XLSX, XLSX.write(portableWorkbook, { type: "array", bookType: "xlsx" }));
const liveTopics = structuredClone(topics);
liveTopics[0].id = "live-topic";
liveTopics[0].project.misiones[0].id = "live-mission";
liveTopics[0].project.misiones[0].preguntas.forEach((question, index) => { question.id = `live-question-${index + 1}`; });
const portablePreview = previewEditorialImport(portableDocument, { sessionId: "live-session", topics: liveTopics });
assert.deepEqual(portablePreview.errors, [], "Un archivo sin sessionId debe poder aplicarse a la sesión abierta mediante referencias T/S/P.");
assert.equal(portablePreview.nextTopics[0].project.misiones[0].preguntas[0].titulo, "Pregunta portable");
assert.deepEqual(portablePreview.changedTopicIds, ["live-topic"], "La importación portable debe resolver el ID real del tema para poder persistir el cambio.");

const styledData = await buildEditorialWorkbookBlob(XLSX, JSZip, workbook, { type: "uint8array" });
const styledZip = await JSZip.loadAsync(styledData);
const textSheetXml = await styledZip.file("xl/worksheets/sheet2.xml").async("string");
assert.match(textSheetXml, /<sheetView[^>]*showGridLines="0"[^>]*><pane[^>]*state="frozen"/);
assert.match(textSheetXml, /<c[^>]*r="E3"[^>]*s="5"/i, "La columna Texto debe conservar el resaltado amarillo.");
const styledDocument = readEditorialWorkbook(XLSX, styledData);
assert.equal(styledDocument.meta.sessionId, "session-1");

const compatibleV4Workbook = buildEditorialWorkbook(XLSX, { sessionId: "session-1", sessionTitle: "Sesión", topics });
const metaRange = XLSX.utils.decode_range(compatibleV4Workbook.Sheets.__meta["!ref"]);
for (let row = metaRange.s.r; row <= metaRange.e.r; row += 1) {
  const keyCell = compatibleV4Workbook.Sheets.__meta[XLSX.utils.encode_cell({ r: row, c: 0 })];
  if (keyCell?.v !== "editorialWorkbookVersion") continue;
  compatibleV4Workbook.Sheets.__meta[XLSX.utils.encode_cell({ r: row, c: 1 })] = { t: "n", v: 4 };
}
assert.doesNotThrow(
  () => readEditorialWorkbook(XLSX, XLSX.write(compatibleV4Workbook, { type: "array", bookType: "xlsx" })),
  "La importación debe conservar compatibilidad con archivos editoriales v4."
);

console.log("PigPen editorial workbook OK.");
