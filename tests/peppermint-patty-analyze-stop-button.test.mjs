import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-api.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

test("analyze button turns into stop and calls cancel api for active busy jobs", () => {
  assert.match(appSource, /const ANALYZE_BTN_DEFAULT_LABEL =/);
  assert.match(appSource, /els\.analyzeBtn\.textContent = fileBusy \? "Detener análisis" : ANALYZE_BTN_DEFAULT_LABEL;/);
  assert.match(appSource, /const activeJobId = String\(activeFile\?\.analysisJobId \|\| session\?\.analysisJobId \|\| ""\)\.trim\(\);/);
  assert.match(appSource, /if \(isBusyAnalysisStatus\(activeFile\?\.analysisStatus \|\| ""\) && activeJobId\) \{[\s\S]*cancelAnalizarPdfAnalysis\(activeJobId\)/m);
  assert.match(apiSource, /export async function cancelAnalizarPdfAnalysis\(jobId = ""\) \{/);
  assert.match(serverSource, /app\.post\("\/api\/analizar-pdf\/analyze-cancel"/);
});

test("polling auth failures clear busy analysis state instead of leaving stuck spinners", () => {
  assert.match(appSource, /function isAuthAnalysisError\(error = null\) \{/);
  assert.match(appSource, /function clearBusyAnalysisStateForJob\(jobId = "", nextStatus = "failed"\) \{/);
  assert.match(appSource, /function settleAnalysisPoll\(result = null\) \{/);
  assert.match(appSource, /function rejectAnalysisPoll\(error\) \{/);
  assert.match(appSource, /state\.isAnalyzingCurrent = false;/);
  assert.match(appSource, /state\.isAnalyzingAll = false;/);
  assert.match(appSource, /setBusyOverlay\(""\);/);
  assert.match(appSource, /clearBusyAnalysisStateForJob\(cleanJobId, payload\?\.status \|\| "completed"\);/);
  assert.match(appSource, /isAuthAnalysisError\(error\)\s*\?\s*"La sesión expiró o perdió autorización para consultar el análisis\. Vuelve a cargar la página\."/);
});

test("analyze-all polling waits for each job to settle before advancing to the next target", () => {
  assert.match(appSource, /return new Promise\(\(resolve, reject\) => \{/);
  assert.match(appSource, /state\.analysisPollController = \{\s*jobId: cleanJobId,\s*resolve,\s*reject,/m);
  assert.match(appSource, /if \(payload\?\.status === "queued" \|\| payload\?\.status === "processing"\) \{[\s\S]*state\.analysisPollTimer = window\.setTimeout\(tick, 2500\);/m);
  assert.match(appSource, /settleAnalysisPoll\(payload\);/);
  assert.match(appSource, /settleAnalysisPoll\(\{ jobId: activeJobId, status: "cancelled", cancelled: true \}\);/);
});
