import assert from "node:assert/strict";
import fs from "node:fs/promises";

const appModulePath = new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url);
const backendModulePath = new URL("../backend/server.js", import.meta.url);
const source = await fs.readFile(appModulePath, "utf8");
const backendSource = await fs.readFile(backendModulePath, "utf8");

assert.match(
  source,
  /async function attachSelectedFilesToRevision\([^)]*options = \{\}\)/,
  "La asignación debe aceptar una política explícita de reemplazo."
);
assert.match(
  source,
  /if \(replaceExisting\) \{[\s\S]*?revision\.files = \[\];[\s\S]*?\}/,
  "Reimportar Collect debe retirar la entrada anterior antes de crear la nueva identidad de archivo."
);
assert.match(
  source,
  /attachSelectedFilesToRevision\(session, revisionId, \[file\], \{\s*replaceExisting: true,?\s*\}\)/,
  "El flujo de carpeta Collect debe reemplazar, no omitir ni acumular, el IDML de la ficha."
);
assert.doesNotMatch(
  source,
  /ya tiene un IDML/,
  "Una ficha con un IDML previo no debe bloquear la actualización desde una nueva carpeta Collect."
);
assert.match(
  source,
  /const importSessionId = String\(session\.id[\s\S]*?store\.getActiveSession\(\)\?\.id[\s\S]*?!== importSessionId/,
  "La importación debe quedar aislada en la sesión que estaba activa al elegir la carpeta."
);
assert.match(
  source,
  /replacedLocalBlobKeys[\s\S]*?deleteAnalizarPdfCachedFile\(localBlobKey\)/,
  "La caché anterior debe limpiarse después de persistir el reemplazo."
);
assert.match(
  source,
  /currentRevisionBlobKeyPrefix[\s\S]*?localBlobKey\.startsWith\(currentRevisionBlobKeyPrefix\)/,
  "La limpieza nunca debe borrar una copia local perteneciente a otra sesión o ficha."
);
assert.match(
  backendSource,
  /async function pruneAnalizarPdfAnalysisResultsForSession\(session = null\)/,
  "El backend debe eliminar resultados que ya no pertenecen al archivo vigente de la ficha."
);
assert.match(
  backendSource,
  /persistAnalizarPdfAnalysisResults\(uid, session\.id, analysisResults\);\s*await pruneAnalizarPdfAnalysisResultsForSession\(session\);/,
  "La depuración de resultados huérfanos debe ejecutarse después de guardar la sesión y sus resultados vigentes."
);

console.log("Analizar PDF Collect folder replacement contract: OK");
