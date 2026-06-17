import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

assert.match(
  htmlSource,
  /<div class="montage-export-actions">[\s\S]*?<button id="montageExportDownloadBtn"[\s\S]*?hidden[\s\S]*?<i class="fas fa-download"/,
  "El modal de export debe incluir un boton oculto de descarga dentro de montage-export-actions."
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
  /window\.els\.montageExportDownloadBtn\.hidden = !shouldShow;/,
  "El boton solo debe mostrarse cuando hay una URL de descarga lista."
);

assert.match(
  exportSource,
  /setMontageExportDownloadButton\(\{[\s\S]*?url,[\s\S]*?filename: name[\s\S]*?\}\);/,
  "Cuando el job queda ready, el modal debe habilitar el boton con la URL y nombre del MP4."
);

assert.match(
  exportSource,
  /resetMontageExportJobState\(\)[\s\S]*?setMontageExportDownloadButton\(\{ visible: false \}\);/,
  "Al iniciar o resetear un export nuevo, el boton de descarga debe ocultarse."
);

assert.match(
  podcasterSource,
  /montageExportDownloadBtn\.addEventListener\("click",\s*\(\) => \{[\s\S]*?downloadReadyMontageExport\(\);/,
  "El boton listo debe tener un handler explicito para descargar el MP4."
);

console.log("ok - montage export ready download button contract");
