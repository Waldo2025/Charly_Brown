import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-session-store.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-api.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const fileCacheSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-file-cache.js", import.meta.url), "utf8");

assert.match(
  storeSource,
  /export function stripAnalysisResultsFromSession/,
  "La autosave remota debe poder guardar metadata sin resultados de análisis."
);

assert.match(
  storeSource,
  /collectAnalysisResultsForRemoteStorage/,
  "saveSession debe separar resultados de análisis para persistencia remota lateral."
);

assert.match(
  storeSource,
  /saveAnalizarPdfSession\(\s*stripAnalysisResultsFromSession\(normalized\),\s*collectAnalysisResultsForRemoteStorage\(normalized\)\s*\)/,
  "saveSession debe enviar metadata ligera al documento principal y resultados como sidecar."
);

assert.doesNotMatch(
  appSource,
  /persistActiveSession\(\[\], \{ includeAnalysis: true \}\)/,
  "El botón Guardar no debe enviar resultados completos a Firestore."
);

assert.match(
  appSource,
  /persistLocalAnalysisSession\(store\.getActiveSession\(\)\);[\s\S]*await persistActiveSession\(\[\]\);/,
  "El botón Guardar debe conservar análisis localmente y persistir solo metadata remota."
);

assert.match(
  appSource,
  /keepBatchOverlay: state\.isAnalyzingAll === true/,
  "El polling de cada job debe conservar el overlay mientras Analizar todo siga activo."
);

assert.match(
  appSource,
  /putAnalizarPdfCachedAnalysisSession\(session\)/,
  "Los análisis locales pesados deben persistirse en IndexedDB, no depender solo de localStorage."
);

assert.match(
  appSource,
  /getAnalizarPdfCachedAnalysisSession\(sessionId\)/,
  "La carga de sesiones debe rehidratar análisis locales desde IndexedDB."
);

assert.match(
  fileCacheSource,
  /const SESSION_STORE_NAME = "analysisSessions"/,
  "IndexedDB debe tener un store dedicado para sesiones de análisis."
);

assert.match(
  serverSource,
  /stripAnalizarPdfAnalysisResults\(/,
  "El backend debe limpiar resultados pesados antes de escribir sesiones en Firestore."
);

assert.match(
  serverSource,
  /ANALIZAR_PDF_ANALYSIS_RESULTS_COLLECTION/,
  "El backend debe guardar análisis renderizable en una colección lateral de Firestore."
);

assert.match(
  serverSource,
  /ANALIZAR_PDF_REVISIONS_COLLECTION\s*=\s*"revisions"/,
  "El backend debe guardar cada ficha editorial en la subcolección revisions."
);

assert.match(
  serverSource,
  /function buildAnalizarPdfSessionRootDocument[\s\S]*revisions:\s*\[\]/,
  "El documento principal de analizarPDF no debe conservar la lista completa de fichas editoriales."
);

assert.match(
  serverSource,
  /persistAnalizarPdfRevisionsForSession/,
  "El backend debe persistir fichas editoriales como subdocumentos separados."
);

assert.match(
  serverSource,
  /loadAnalizarPdfRevisionsForSession/,
  "La carga de sesiones debe rehidratar fichas editoriales desde subcolección."
);

assert.match(
  serverSource,
  /sanitizeResult,\s*[\s\S]*?sanitizeResultSummary,/,
  "El backend debe importar sanitizeResult para guardar resultados laterales sin fallar en sessions/save."
);

assert.match(
  serverSource,
  /splitBase64JsonPayload/,
  "Los análisis guardados en Firebase deben fragmentarse para evitar el límite de 1 MiB por documento."
);

assert.match(
  serverSource,
  /mergeAnalysisResultsIntoAnalizarPdfSession/,
  "La carga de sesiones debe rehidratar resultados laterales para reconstruir rail y reporte."
);

assert.match(
  appSource,
  /LOCAL_ANALYSIS_SESSION_STORAGE_PREFIX/,
  "El análisis debe conservarse localmente en el navegador."
);

assert.match(
  appSource,
  /applyAnalysisStatusPayloadToLocalSession\(payload\)/,
  "El resultado del polling debe incorporarse a la sesión local."
);

assert.match(
  apiSource,
  /result: analysisResult/,
  "La exportación corregida debe poder usar el análisis local sin exigir guardado previo."
);

assert.match(
  serverSource,
  /result: job\.result \|\| null/,
  "analyze-status debe devolver el resultado del job para persistencia local."
);

assert.doesNotMatch(
  serverSource,
  /sourceAssetPath: stableSourcePath,\s*result,\s*resultSummary/s,
  "El backend no debe persistir result/resultSummary en el documento principal al completar un análisis."
);

console.log("Analizar PDF local analysis persistence contract OK.");
