import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const cacheSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-file-cache.js", import.meta.url), "utf8");

test("lightweight startup catalog cannot overwrite the durable analysis cache", () => {
  assert.match(appSource, /const catalogOnlySessionIds = new Set\(\);/);
  assert.match(
    appSource,
    /if \(!key \|\| !session \|\| catalogOnlySessionIds\.has\(sessionId\)\) return Promise\.resolve\(null\);/
  );
  assert.match(
    appSource,
    /const cachedSessions = restoreSessionCatalog\(user\);[\s\S]*?catalogOnlySessionIds\.add\(sessionId\);[\s\S]*?renderAll\(\);/
  );
  assert.match(
    appSource,
    /sessionsWithLocalAnalysis\.forEach\(\(session\) => \{\s*catalogOnlySessionIds\.delete/
  );
});

test("local analysis writes are serialized and awaited through IndexedDB completion", () => {
  assert.match(appSource, /const localAnalysisPersistenceChains = new Map\(\);/);
  assert.match(appSource, /const previous = localAnalysisPersistenceChains\.get\(sessionId\) \|\| Promise\.resolve\(\);/);
  assert.match(appSource, /const task = previous[\s\S]*?await putAnalizarPdfCachedAnalysisSession\(snapshot\)/);
  assert.match(appSource, /async function saveActiveSessionSnapshot[\s\S]*?await persistLocalAnalysisSession\(session\);/);
  assert.match(cacheSource, /tx\.oncomplete = \(\) => finishResolve\(undefined\);/);
});

test("completed full and quick analyses receive a durable remote sidecar save", () => {
  assert.match(
    appSource,
    /async function persistDurableAnalysisSnapshot[\s\S]*?await persistLocalAnalysisSession\(session\);[\s\S]*?await saveSession\(session, \{ includeAnalysis: true \}\)/
  );
  assert.match(
    appSource,
    /payload\?\.status === "completed"[\s\S]*?persistDurableAnalysisSnapshot\(\{ reason: "analysis-job-completed" \}\)/
  );
  assert.match(
    appSource,
    /persistDurableAnalysisSnapshot\(\{ reason: "quick-analysis-completed" \}\)/
  );
});
