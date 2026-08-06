import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const results = read("public/analizarPDF/analizar-pdf-results.js");
const app = read("public/analizarPDF/analizar-pdf-app.js");
const api = read("public/analizarPDF/analizar-pdf-api.js");
const server = read("backend/server.js");
const pipeline = read("backend/python/analizar_idml/pipeline.py");

assert.match(results, /export function getAnalizarPdfAnalysisCategories\(\)/);
assert.match(results, /id: "spelling", label: "Ortografía", defaultVisible: false/);
assert.match(results, /Los desactivados se omitirán en el siguiente análisis/);
assert.match(results, /id: "quick-orthotypography"/);
assert.match(app, /analysisCategories: getAnalizarPdfAnalysisCategories\(\)/);
assert.match(app, /source: "full-analysis-reuse"/);
assert.match(app, /analysisCategories\["quick-orthotypography"\] !== false/);
const analyzeCurrentBlock = app.slice(
  app.indexOf('els.analyzeBtn?.addEventListener("click"'),
  app.indexOf('els.analyzeAllBtn?.addEventListener("click"')
);
assert.doesNotMatch(analyzeCurrentBlock, /handleCreateTemplatesFromAll/);
assert.match(app, /state\.analysisPollTimer = window\.setTimeout\(tick, 900\)/);
assert.match(app, /Promise\.all\(\[durableSnapshotPromise, eruptionPromise\]\)/);
assert.match(app, /const elapsedMs = activeAnalysisFlowStartedAt > 0/);
assert.match(api, /"X-Analysis-Categories"/);
assert.match(server, /draft\.analysisCategories = Object\.fromEntries/);
assert.match(pipeline, /if run_redaction:/);
assert.match(pipeline, /if run_orthotypography:/);
assert.match(pipeline, /if run_recortables:/);
assert.match(pipeline, /if run_tracked_changes:/);
assert.match(pipeline, /if not run_text_status:/);

console.log("analysis filter execution plan contract: ok");
