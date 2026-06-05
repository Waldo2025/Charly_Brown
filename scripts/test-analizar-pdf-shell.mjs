import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/analizarPDF.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");
const sidepanelSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-sidepanel.js", import.meta.url), "utf8");
const htmlIds = [...htmlSource.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index))];

if (duplicateIds.length) {
  throw new Error(`analizarPDF.html no debe repetir ids. Duplicados: ${duplicateIds.join(", ")}`);
}

function assertHtmlHasId(id, message) {
  const matches = htmlSource.match(new RegExp(`id="${id}"`, "g")) || [];
  if (matches.length !== 1) {
    throw new Error(message);
  }
}

assertHtmlHasId("analizarPdfLayout", "analizarPDF.html debe definir el layout principal.");

assertHtmlHasId("analizarPdfSidepanel", "analizarPDF.html debe incluir sidepanel de sesiones.");

assertHtmlHasId("analizarPdfFileInput", "analizarPDF.html debe incluir input de PDF.");

assertHtmlHasId("analizarPdfResults", "analizarPDF.html debe incluir contenedor de resultados.");

assertHtmlHasId("analizarPdfSourceType", "analizarPDF.html debe incluir selector de tipo de fuente.");

assertHtmlHasId("analizarPdfNivelInput", "analizarPDF.html debe incluir el input de nivel.");

assertHtmlHasId("analizarPdfRevisionNumeroInput", "analizarPDF.html debe incluir el input de numero de revision.");

assertHtmlHasId("analizarPdfUnidadInput", "analizarPDF.html debe incluir el input de unidad.");

assertHtmlHasId("analizarPdfPaletteList", "analizarPDF.html debe incluir el contenedor de paleta.");

assertHtmlHasId("analizarPdfAddPaletteColorBtn", "analizarPDF.html debe incluir el boton para agregar color.");

assertHtmlHasId("analizarPdfAddSectionBtn", "analizarPDF.html debe incluir el boton principal para agregar secciones.");

assertHtmlHasId("analizarPdfQuickAddSectionBtn", "analizarPDF.html debe incluir el boton rapido para agregar secciones.");

if (!htmlSource.includes('data-action="add-section"')) {
  throw new Error("analizarPDF.html debe marcar los controles de agregar seccion con data-action.");
}

if (!htmlSource.includes('src="analizarPDF/analizar-pdf-app.js"')) {
  throw new Error("analizarPDF.html debe cargar el entrypoint modular del sitio.");
}

if (!appSource.includes("createAnalizarPdfSessionStore")) {
  throw new Error("El app principal debe usar el session store modular.");
}

if (!appSource.includes("createAnalizarPdfSidepanelApi")) {
  throw new Error("El app principal debe usar el módulo del sidepanel.");
}

if (!appSource.includes("createAnalizarPdfResultsRenderer")) {
  throw new Error("El app principal debe usar el renderer de resultados.");
}

if (!appSource.includes('document.getElementById("analizarPdfSourceType")')) {
  throw new Error("El app principal debe bindear analizarPdfSourceType.");
}

if (!appSource.includes('document.getElementById("analizarPdfNivelInput")')) {
  throw new Error("El app principal debe bindear analizarPdfNivelInput.");
}

if (!appSource.includes('document.getElementById("analizarPdfRevisionNumeroInput")')) {
  throw new Error("El app principal debe bindear analizarPdfRevisionNumeroInput.");
}

if (!appSource.includes('document.getElementById("analizarPdfUnidadInput")')) {
  throw new Error("El app principal debe bindear analizarPdfUnidadInput.");
}

if (!appSource.includes('document.getElementById("analizarPdfPaletteList")')) {
  throw new Error("El app principal debe bindear analizarPdfPaletteList.");
}

if (!appSource.includes('document.getElementById("analizarPdfAddPaletteColorBtn")')) {
  throw new Error("El app principal debe bindear analizarPdfAddPaletteColorBtn.");
}

if (!appSource.includes('document.querySelectorAll(\'[data-action="add-section"]\')')) {
  throw new Error("El app principal debe wirear de forma determinista todos los controles de agregar seccion.");
}

if (!/Ortotipografía/.test(resultsSource)) {
  throw new Error("El renderer de resultados debe incluir la tarjeta de ortotipografia.");
}

if (!/Colores/.test(resultsSource)) {
  throw new Error("El renderer de resultados debe incluir la tarjeta de colores.");
}

if (!/orthotypographyIssues/.test(resultsSource)) {
  throw new Error("El renderer de resultados debe renderizar orthotypographyIssues.");
}

if (!/colorIssues/.test(resultsSource)) {
  throw new Error("El renderer de resultados debe renderizar colorIssues.");
}

if (!sidepanelSource.includes('data-action="create-session"') && !sidepanelSource.includes('create-session')) {
  throw new Error("El sidepanel debe implementar creación de sesiones.");
}

if (!htmlSource.includes('id="analizarPdfLayout"')) {
  throw new Error("analizarPDF.html debe definir el layout principal.");
}

console.log("Analizar PDF shell contract OK.");
