import { readFileSync } from "node:fs";

const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../backend/workers/podcaster-montage-export-worker.js", import.meta.url), "utf8");
const stabilitySource = readFileSync(new URL("../backend/podcaster-stability.js", import.meta.url), "utf8");
const jobStoreSource = readFileSync(new URL("../backend/montage-export/job-store-firestore.js", import.meta.url), "utf8");
const renderYaml = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");

if (!/const MONTAGE_EXPORT_MAX_CONCURRENT = Math\.max\(1, Number\(process\.env\.MONTAGE_EXPORT_MAX_CONCURRENT \|\| 1\) \|\| 1\);/.test(serverSource)) {
  throw new Error("El backend debe serializar montage export por defecto para evitar dos FFmpeg simultaneos en Render starter.");
}

if (!/montageExportMaxConcurrent = Number\(process\.env\.MONTAGE_EXPORT_MAX_CONCURRENT \|\| 1\) \|\| 1/.test(stabilitySource)) {
  throw new Error("El coordinador de heavy-work debe usar 1 como default de montage export.");
}

if (!/process\.env\.MONTAGE_EXPORT_WORKER_CONCURRENCY \|\| process\.env\.MONTAGE_EXPORT_MAX_CONCURRENT \|\| 1/.test(workerSource)) {
  throw new Error("El worker de export debe usar concurrencia 1 por defecto.");
}

if (!/async listActiveJobs\(\{ limit = 10 \} = \{\}\)/.test(jobStoreSource)
  || !/\.where\("status", "in", \["queued", "running"\]\)/.test(jobStoreSource)) {
  throw new Error("El job store debe poder listar jobs activos persistidos en Firestore.");
}

if (!/async function resolveBlockingPersistedMontageExportJob/.test(serverSource)
  || !/const blockingPersistedJob = await resolveBlockingPersistedMontageExportJob\(\);/.test(serverSource)
  || !/rejected submit because persisted export is still active/.test(serverSource)
  || !/backend_busy_with_export/.test(serverSource)) {
  throw new Error("El submit de export debe rechazar un job nuevo si Firestore ya tiene uno queued/running.");
}

const snoopyBlock = renderYaml.match(/name: snoopy-export[\s\S]*?(?=\n  - type: worker)/)?.[0] || "";
const workerBlock = renderYaml.match(/name: charly-brown-podcaster-export-worker[\s\S]*?(?=\n  - type: keyvalue)/)?.[0] || "";

for (const [name, block] of [["snoopy-export", snoopyBlock], ["export-worker", workerBlock]]) {
  if (!/key: MONTAGE_EXPORT_MAX_CONCURRENT\s*\n\s*value: 1/.test(block)
    || !/key: MONTAGE_EXPORT_WORKER_CONCURRENCY\s*\n\s*value: 1/.test(block)) {
    throw new Error(`${name} debe declarar concurrencia 1 para montage export en render.yaml.`);
  }
}

console.log("Backend montage export serial active guard OK.");
