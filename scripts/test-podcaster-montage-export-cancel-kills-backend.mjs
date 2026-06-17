import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

assert.match(
  exportSource,
  /export async function cancelMontageExportFromModal\(\)/,
  "El modulo de export debe exponer una accion explicita para cancelar desde el modal."
);

assert.match(
  exportSource,
  /const activeJobId = String\(window\.montageExportJobState\?\.jobId \|\| ""\)\.trim\(\);[\s\S]*?if \(activeJobId\) \{[\s\S]*?await requestMontageExportCancel\(activeJobId\);/,
  "Cancelar desde el modal debe enviar export-cancel al backend siempre que exista un jobId activo."
);

assert.match(
  exportSource,
  /authFetchJson\("\/api\/podcaster\/montage\/export-cancel",\s*\{[\s\S]*?method:\s*"POST"[\s\S]*?body:\s*\{ jobId: cleanJobId \}[\s\S]*?keepalive:\s*true/,
  "La cancelacion debe usar el endpoint backend de export-cancel con keepalive."
);

assert.doesNotMatch(
  exportSource,
  /requestMontageExportCancel[\s\S]*?catch \(error\)[\s\S]*?return false;/,
  "La cancelacion no debe tragarse errores del backend ni devolver false silenciosamente."
);

assert.match(
  exportSource,
  /catch \(error\) \{[\s\S]*?formatMontageExportCancelError\(error\)[\s\S]*?setMontageExportStatus\([\s\S]*?"No se pudo cancelar la exportación en el backend\."[\s\S]*?\{ tone: "error" \}[\s\S]*?throw error;/,
  "Si export-cancel falla, el modal debe mostrar el error exacto y mantener el fallo visible."
);

assert.match(
  podcasterSource,
  /cancelMontageExportFromModal/,
  "podcaster.js debe importar/usar la accion explicita de cancelacion."
);

assert.match(
  podcasterSource,
  /cancelMontageExportBtn\.addEventListener\("click",\s*\(\) => \{[\s\S]*?cancelMontageExportFromModal\(\)\.catch/,
  "El boton cancelMontageExportBtn debe llamar a la cancelacion backend, no solo cerrar el modal."
);

assert.doesNotMatch(
  podcasterSource,
  /cancelMontageExportBtn\.addEventListener\("click",\s*\(\) => \{\s*closeMontageExportModal\(\);\s*\}\);/,
  "El boton cancelar no debe limitarse a closeMontageExportModal()."
);

assert.doesNotMatch(
  podcasterSource,
  /cancelMontageExportBtn\.addEventListener\("click",[\s\S]*?cancelMontageExportFromModal\(\)\.catch\([\s\S]*?closeMontageExportModal\(\);/,
  "El boton cancelar no debe cerrar el modal como fallback si falla export-cancel."
);

console.log("ok - montage export cancel button kills backend job");
