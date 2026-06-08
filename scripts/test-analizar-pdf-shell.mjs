import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/PeppermintPattyAnalizer.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");
const sidepanelSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-sidepanel.js", import.meta.url), "utf8");
const htmlIds = [...htmlSource.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index))];

if (duplicateIds.length) {
  throw new Error(`PeppermintPattyAnalizer.html no debe repetir ids. Duplicados: ${duplicateIds.join(", ")}`);
}

function assertHtmlHasId(id, message) {
  const matches = htmlSource.match(new RegExp(`id="${id}"`, "g")) || [];
  if (matches.length !== 1) {
    throw new Error(message);
  }
}

assertHtmlHasId("analizarPdfLayout", "PeppermintPattyAnalizer.html debe definir el layout principal.");

assertHtmlHasId("analizarPdfSidepanel", "PeppermintPattyAnalizer.html debe incluir sidepanel de sesiones.");

assertHtmlHasId("analizarPdfFileInput", "PeppermintPattyAnalizer.html debe incluir input de PDF.");

assertHtmlHasId("analizarPdfPageReports", "PeppermintPattyAnalizer.html debe incluir contenedor de reporte por página.");

assertHtmlHasId("analizarPdfSourceType", "PeppermintPattyAnalizer.html debe incluir selector de tipo de fuente.");

assertHtmlHasId("analizarPdfBookTypeInput", "PeppermintPattyAnalizer.html debe incluir el input de tipo de libro.");

assertHtmlHasId("analizarPdfNivelInput", "PeppermintPattyAnalizer.html debe incluir el input de nivel.");

assertHtmlHasId("analizarPdfRevisionNumeroInput", "PeppermintPattyAnalizer.html debe incluir el input de numero de revision.");

assertHtmlHasId("analizarPdfUnidadInput", "PeppermintPattyAnalizer.html debe incluir el input de unidad.");

if (!htmlSource.includes('src="analizarPDF/analizar-pdf-app.js"')) {
  throw new Error("PeppermintPattyAnalizer.html debe cargar el entrypoint modular del sitio.");
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

if (!appSource.includes('document.getElementById("analizarPdfBookTypeInput")')) {
  throw new Error("El app principal debe bindear analizarPdfBookTypeInput.");
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
  throw new Error("PeppermintPattyAnalizer.html debe definir el layout principal.");
}

console.log("Analizar PDF shell contract OK.");
