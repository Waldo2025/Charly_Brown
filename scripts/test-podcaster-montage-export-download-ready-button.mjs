import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

assert.match(
  htmlSource,
  /<div class="montage-export-actions">[\s\S]*?<select id="montageExportDownloadBtn"[\s\S]*?hidden[\s\S]*?<option value="">Seleccionar exportación<\/option>/,
  "El modal de export debe incluir un select oculto de descargas dentro de montage-export-actions."
);

assert.match(
  podcasterSource,
  /montageExportDownloadBtn:\s*document\.getElementById\("montageExportDownloadBtn"\)/,
  "podcaster.js debe registrar el boton de descarga listo en els."
);

assert.match(
  exportSource,
  /function setMontageExportDownloadButton\(\{[\s\S]*?url = ""[\s\S]*?filename = ""[\s\S]*?\} = \{\}\)/,
  "El modulo de export debe exponer una rutina para mostrar/ocultar el boton segun URL lista."
);

assert.match(
  exportSource,
  /select\.hidden = true;[\s\S]*?select\.hidden = false;/,
  "El select solo debe mostrarse cuando hay una URL de descarga lista o historial de la sesión."
);

assert.match(
  exportSource,
  /setMontageExportDownloadButton\(\{[\s\S]*?url,[\s\S]*?filename: name[\s\S]*?\}\);/,
  "Cuando el job queda ready, el modal debe habilitar el boton con la URL y nombre del MP4."
);

assert.match(
  exportSource,
  /function buildMontageExportDownloadHistoryKey\(sessionId = ""\)[\s\S]*?\$\{MONTAGE_EXPORT_DOWNLOAD_HISTORY_KEY\}:\$\{cleanSessionId\}/,
  "El historial de descargas MP4 debe guardarse por sessionId para no mezclar exports de otras sesiones."
);

assert.match(
  exportSource,
  /normalizeMontageExportDownloadHistory\([\s\S]*?\{ sessionId: cleanSessionId \}/,
  "La carga del historial de descargas MP4 debe filtrar entradas por la sesión activa."
);

assert.match(
  exportSource,
  /const referenceCandidate = reference\?\.downloadUrl \? reference : latestHistoryItem;/,
  "Al abrir el modal, el export persistido en la sesión activa debe tener prioridad sobre el historial."
);

assert.match(
  exportSource,
  /resetMontageExportJobState\(\)[\s\S]*?setMontageExportDownloadButton\(\{ visible: false \}\);/,
  "Al iniciar o resetear un export nuevo, el boton de descarga debe ocultarse."
);

assert.match(
  podcasterSource,
  /montageExportDownloadBtn\.addEventListener\("change",\s*\(event\) => \{[\s\S]*?downloadReadyMontageExport\(value\);/,
  "El select de descargas debe descargar explícitamente el MP4 seleccionado."
);

console.log("ok - montage export ready download button contract");
