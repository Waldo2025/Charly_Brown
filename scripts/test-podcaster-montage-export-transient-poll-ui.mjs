import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

assert.match(
  source,
  /const MONTAGE_EXPORT_TRANSIENT_SILENT_RETRIES = 2;/,
  "El polling debe tolerar microcortes transitorios antes de mostrar warning"
);

assert.match(
  source,
  /const MONTAGE_EXPORT_RECENT_POLL_GRACE_MS = 45 \* 1000;/,
  "El polling debe definir una ventana de progreso reciente"
);

assert.match(
  source,
  /lastPollSuccessAtMs: 0,/,
  "El estado del job debe rastrear la ultima consulta exitosa"
);

assert.match(
  source,
  /window\.montageExportJobState\.lastPollSuccessAtMs = Date\.now\(\);/,
  "Cada poll exitoso debe refrescar lastPollSuccessAtMs"
);

assert.match(
  source,
  /const canKeepLastProgressVisible = transientNetworkError[\s\S]*failureCount <= MONTAGE_EXPORT_TRANSIENT_SILENT_RETRIES[\s\S]*lastStage/,
  "Los fallos transitorios con progreso reciente deben conservar el estado visible"
);

assert.match(
  source,
  /if \(canKeepLastProgressVisible\) \{[\s\S]*scheduleMontageExportPollRetry\(cleanJobId, failureCount, \{ transient: true \}\);[\s\S]*return;/,
  "Los microcortes iniciales deben reintentar sin sobrescribir la UI con perdida temporal"
);

assert.match(
  source,
  /cleanErrorCode === "montage_export_worker_restarted"/,
  "La UI debe distinguir un restart real del backend de un microcorte temporal"
);

console.log("ok - montage export transient poll UI keeps last progress visible");
