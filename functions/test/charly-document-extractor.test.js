"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const JSZip = require("jszip");
const {
  detectFileType,
  extractExcelText,
  extractIdmlText,
  extractDocumentContent
} = require("../src/charly-document-extractor.js");

test("detectFileType identifies all expected formats", () => {
  assert.equal(detectFileType("libro.xlsx"), "xlsx");
  assert.equal(detectFileType("datos.csv"), "csv");
  assert.equal(detectFileType("guia.docx"), "docx");
  assert.equal(detectFileType("plantilla.idml"), "idml");
  assert.equal(detectFileType("documento.pdf"), "pdf");
  assert.equal(detectFileType("notas.txt"), "text");
});

test("extractExcelText extracts sheets as CSV", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Actividad", "Grado", "Puntaje"],
    ["Trazos con Y", "1°", "100"],
    ["Lectura Guiada", "1°", "90"]
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Actividades");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const text = extractExcelText(buffer);
  assert.match(text, /HOJA: Actividades/);
  assert.match(text, /Trazos con Y/);
  assert.match(text, /Lectura Guiada/);
});

test("extractIdmlText extracts story content from IDML zip", async () => {
  const zip = new JSZip();
  zip.file("designmap.xml", "<?xml version='1.0'?><Document/>");
  zip.file(
    "Stories/Story_u123.xml",
    '<?xml version="1.0"?><idPkg:Story><Story><ParagraphStyleRange><CharacterStyleRange><Content>Palabras con Y y trazos</Content></CharacterStyleRange></ParagraphStyleRange></Story></idPkg:Story>'
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const text = await extractIdmlText(buffer);
  assert.match(text, /Palabras con Y y trazos/);
});

test("extractDocumentContent handles text and csv files directly", async () => {
  const csvBuffer = Buffer.from("Nombre,Edad\nJuan,7\nAna,8");
  const res = await extractDocumentContent(csvBuffer, { name: "alumnos.csv", mimeType: "text/csv" });
  assert.equal(res.type, "csv");
  assert.match(res.text, /Juan,7/);
});

test("extractDocumentContent extracts text from valid PDF buffer", async () => {
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument();
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", resolve));
  doc.text("Unidad 1: Vocales y Consonantes\nSeccion A: Trazos");
  doc.end();
  await done;
  const pdfBuffer = Buffer.concat(chunks);

  const res = await extractDocumentContent(pdfBuffer, { name: "leccion.pdf", mimeType: "application/pdf" });
  assert.equal(res.type, "pdf");
  assert.match(res.text, /Unidad 1/);
  assert.match(res.text, /Vocales y Consonantes/);
});
