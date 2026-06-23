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
