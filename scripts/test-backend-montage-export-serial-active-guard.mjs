import { readFileSync } from "node:fs";

const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../backend/workers/podcaster-montage-export-worker.js", import.meta.url), "utf8");
const stabilitySource = readFileSync(new URL("../backend/podcaster-stability.js", import.meta.url), "utf8");
const renderYaml = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");

if (!/const MONTAGE_EXPORT_MAX_CONCURRENT = Math\.max\(1, Number\(process\.env\.MONTAGE_EXPORT_MAX_CONCURRENT \|\| 1\) \|\| 1\);/.test(serverSource)) {
  throw new Error("El backend debe conservar un límite de concurrencia configurable para montage export.");
}

if (!/montageExportMaxConcurrent = Number\(process\.env\.MONTAGE_EXPORT_MAX_CONCURRENT \|\| 1\) \|\| 1/.test(stabilitySource)) {
  throw new Error("El coordinador de heavy-work debe respetar el límite configurable de montage export.");
}

if (!/process\.env\.MONTAGE_EXPORT_WORKER_CONCURRENCY \|\| process\.env\.MONTAGE_EXPORT_MAX_CONCURRENT \|\| 1/.test(workerSource)) {
  throw new Error("El worker de export debe usar el límite de concurrencia configurable.");
}

if (/resolveBlockingPersistedMontageExportJob/.test(serverSource)) {
  throw new Error("El submit de export no debe bloquear globalmente una nueva sesión por otro job activo.");
}

const snoopyBlock = renderYaml.match(/name: snoopy-export[\s\S]*?(?=\n  - type: worker)/)?.[0] || "";
const workerBlock = renderYaml.match(/name: charly-brown-podcaster-export-worker[\s\S]*?(?=\n  - type: keyvalue)/)?.[0] || "";

for (const [name, block] of [["snoopy-export", snoopyBlock], ["export-worker", workerBlock]]) {
  if (!/key: MONTAGE_EXPORT_MAX_CONCURRENT\s*\n\s*value: 2/.test(block)
    || !/key: MONTAGE_EXPORT_WORKER_CONCURRENCY\s*\n\s*value: 2/.test(block)) {
    throw new Error(`${name} debe declarar concurrencia 2 para montage export en render.yaml.`);
  }
}

console.log("Backend montage export concurrent queue guard OK.");
