import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");

test("analyze-all clears stale busy statuses when no local targets can be resolved", () => {
  assert.match(source, /async function clearBusyStatusesWithoutLocalFiles\(session = null, options = \{\}\) \{/);
  assert.match(source, /if \(!targets\.length\) \{[\s\S]*await clearBusyStatusesWithoutLocalFiles\(session, \{[\s\S]*scope:\s*"targets"[\s\S]*\}\);[\s\S]*setJobMetaText\(emptyMessage \|\| "No hay archivos disponibles para analizar\."\);[\s\S]*return;/m);
  assert.match(source, /async function refreshSessions\(preferredSessionId = ""\) \{[\s\S]*await clearBusyStatusesWithoutLocalFiles\(store\.getActiveSession\(\), \{\s*scope: "all"\s*\}\);[\s\S]*renderAll\(\);[\s\S]*\}/m);
  assert.match(source, /file\.analysisStatus = "failed";[\s\S]*file\.analysisJobId = "";[\s\S]*file\.hasLocalSource = false;[\s\S]*file\.localBlobKey = "";/m);
});
