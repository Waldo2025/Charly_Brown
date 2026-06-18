import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const downloadRouteStart = source.indexOf('app.get("/api/assets/montage-download"');
const downloadRouteEnd = source.indexOf("\napp.", downloadRouteStart + 1);
const downloadRoute = source.slice(
  downloadRouteStart,
  downloadRouteEnd === -1 ? source.length : downloadRouteEnd
);

assert.ok(downloadRouteStart >= 0, "Debe existir la ruta de descarga del montaje.");

assert.doesNotMatch(
  source,
  /emitStage\("ready",\s*1,\s*"Exportación lista\."\)/,
  "El pipeline no debe publicar ready antes de que el worker persista result y downloadUrl."
);

assert.doesNotMatch(
  downloadRoute,
  /resolveMontageExportJobSnapshot\(jobId\)\.catch\(\(\)\s*=>\s*null\)/,
  "La descarga no debe ocultar fallos de lectura del job como si el export hubiera expirado."
);

assert.match(
  downloadRoute,
  /montage_export_lookup_unavailable/,
  "La descarga debe distinguir un fallo temporal al consultar el job."
);

assert.match(
  downloadRoute,
  /montage_export_not_ready/,
  "La descarga debe indicar cuando el job existe pero todavía no tiene resultado."
);

assert.match(
  downloadRoute,
  /montage_export_result_incomplete/,
  "La descarga debe detectar resultados persistidos sin datos completos."
);

assert.match(
  downloadRoute,
  /montage_export_storage_object_not_found/,
  "La descarga debe informar si el objeto final no aparece en Storage."
);

console.log("ok - montage export download durability contract");
