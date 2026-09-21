import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createRequire } from "node:module";
import {
  buildEditorialWorkbook,
  buildEditorialWorkbookBlob,
  readEditorialWorkbook
} from "../public/js/escape-room-editorial-workbook.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("../public/vendor/xlsx/xlsx.full.min.js");
const JSZip = require("../public/vendor/jszip/jszip.min.js");

const ROOT = "/Users/waldolopez/Desktop/Escape rooms/Inglés";
const TARGETS = [
  [2, 1, 1, 1, "Inglés 1/Trim 1/Chapter 1/EscapeRoom_The_Polis_Word_Vault.zip"],
  [3, 1, 1, 2, "Inglés 1/Trim 1/Chapter 2/EscapeRoom_Biome_Expedition_Grid.zip"],
  [4, 1, 1, 3, "Inglés 1/Trim 1/Chapter 3/EscapeRoom_The_Web_of_Life_Rescue.zip"],
  [7, 2, 1, 1, "Ingles 2/Trim 1/Chapter 1/EscapeRoom_The_Lost_Constellation_Console.zip"],
  [8, 2, 1, 2, "Ingles 2/Trim 1/Chapter 2/EscapeRoom_The_Locked_Merchant_Port_Deep_Sea_Expedition.zip"],
  [9, 2, 1, 3, "Ingles 2/Trim 1/Chapter 3/EscapeRoom_The_Midnight_Wall_Cipher.zip"],
  [10, 2, 1, 4, "Ingles 2/Trim 1/Chapter 4/EscapeRoom_Gravity_Lab_Lockdown.zip"],
  [11, 2, 1, 5, "Ingles 2/Trim 1/Chapter 5/EscapeRoom_The_Steam_Factory_Shutdown.zip"],
  [12, 3, 1, 1, "Inglés 3/Trim 1/chapter 1/EscapeRoom_Operation_Save_Every_Drop.zip"],
  [13, 3, 1, 2, "Inglés 3/Trim 1/Chapter 2/EscapeRoom_The_Binary_Signal_Rescue.zip"],
  [14, 3, 1, 3, "Inglés 3/Trim 1/Chapter 3/EscapeRoom_Blackbeard_s_Coded_Manifest.zip"],
  [15, 3, 1, 4, "Inglés 3/Trim 1/Chapter 4/EscapeRoom_The_Soreq_Flow_Code_A_Hydrological_Expedition.zip"],
  [16, 3, 1, 5, "Inglés 3/Trim 1/Chapter 5/EscapeRoom_The_Empathy_Shield.zip"],
  [17, 1, 2, 1, "Inglés 1/Trim 2/Chapter 1/EscapeRoom_Darwin_s_Selection_Vault.zip"],
  [18, 1, 2, 2, "Inglés 1/Trim 2/Chapter 2/EscapeRoom_The_Living_Language_Archive.zip"],
  [19, 1, 2, 3, "Inglés 1/Trim 2/Chapter 3/EscapeRoom_Backstage_at_the_Moving-Picture_Theater.zip"],
  [20, 1, 2, 4, "Inglés 1/Trim 2/chapter 4/EscapeRoom_The_Logic_Chamber.zip"],
  [21, 1, 2, 5, "Inglés 1/Trim 2/Chapter 5/EscapeRoom_The_Clean-Air_Emergency.zip"],
  [22, 2, 2, 1, "Ingles 2/Trim 2/Chapter 1/EscapeRoom_The_Silent_Airport_Code.zip"],
  [23, 2, 2, 2, "Ingles 2/Trim 2/Chapter 2/EscapeRoom_The_Three_Hidden_Studios.zip"],
  [24, 2, 2, 3, "Ingles 2/Trim 2/Chapter 3/EscapeRoom_The_Six-Panel_Cartoon_Archive.zip"],
  [25, 2, 2, 4, "Ingles 2/Trim 2/Chapter 4/EscapeRoom_The_Counterweight_Bridge_Vault.zip"],
  [26, 2, 2, 5, "Ingles 2/Trim 2/Chapter 5/EscapeRoom_The_Bioelectric_Control_Room.zip"]
];

function safeName(value) {
  return String(value || "escape-room")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 110) || "escape-room";
}

async function projectFromZip(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const gameFile = zip.file("assets/game.js");
  if (!gameFile) throw new Error(`No se encontró assets/game.js en ${zipPath}`);
  const source = await gameFile.async("string");
  const prefix = "const ESCAPE_ROOM_DATA = ";
  const start = source.indexOf(prefix);
  const end = source.indexOf(";\nconst ESCAPE_ROOM_I18N", start);
  if (start < 0 || end < 0) throw new Error(`No se pudo localizar ESCAPE_ROOM_DATA en ${zipPath}`);
  return JSON.parse(source.slice(start + prefix.length, end));
}

const manifest = [];
for (const [sheetRow, grade, trim, chapter, relativeZip] of TARGETS) {
  const zipPath = join(ROOT, relativeZip);
  const project = await projectFromZip(zipPath);
  const topic = { id: "", academicNumber: 1, title: project.titulo, formState: {}, project };
  const workbook = buildEditorialWorkbook(XLSX, {
    sessionId: "",
    sessionTitle: project.titulo,
    status: "draft",
    topics: [topic]
  });
  const bytes = await buildEditorialWorkbookBlob(XLSX, JSZip, workbook, { type: "uint8array" });
  const fileName = `Correcciones_${safeName(project.titulo)}.xlsx`;
  const outputPath = join(dirname(zipPath), fileName);
  writeFileSync(outputPath, bytes);

  const parsed = readEditorialWorkbook(XLSX, bytes);
  const visible = workbook.Workbook.Sheets.filter((sheet) => !sheet.Hidden).map((sheet) => sheet.name);
  const visibleHeaders = XLSX.utils.sheet_to_json(workbook.Sheets.Textos, { header: 1, range: 1, defval: "" })[0];
  const textRows = XLSX.utils.sheet_to_json(workbook.Sheets.Textos, { range: 1, defval: "" });
  if (visible.join(",") !== "Textos") throw new Error(`${fileName}: hoja visible inesperada.`);
  if (visibleHeaders.join("|") !== "Tema|Sala / Room|Pregunta|Contenido|Texto") throw new Error(`${fileName}: columnas visibles inesperadas.`);
  if (!textRows.length || !parsed.sheets.Textos.length) throw new Error(`${fileName}: no contiene textos editables.`);

  manifest.push({
    sheet: "Escape Rooms Inglés",
    sheetRow,
    correctionCell: `O${sheetRow}`,
    grade,
    trim,
    chapter,
    title: project.titulo,
    zipPath,
    outputPath,
    fileName,
    editableRows: textRows.length,
    size: bytes.length
  });
}

const manifestPath = join(process.cwd(), "artifacts", "english-editorial-review-manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ count: manifest.length, manifestPath, files: manifest }, null, 2));
