import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf.css", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-results.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-session-store.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}`);
  const end = appSource.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return appSource.slice(start, end);
}

test("session and analysis rails reveal without waiting for remote hydration", () => {
  const sessionReveal = functionSource("scheduleSessionRailReveal", "renderSessionRailWithAnimation");
  const completedReveal = functionSource("scheduleCompletedRailGroupReveal", "renderResultsWithRailAnimations");
  const actionsReveal = functionSource("scheduleInlineRailActionReveal", "scheduleCompletedRailGroupReveal");

  assert.doesNotMatch(appSource, /initialRailHydrationComplete/);
  assert.doesNotMatch(sessionReveal, /refreshSessions|refreshActiveSessionDetail|rehydrat|initialRailHydration/);
  assert.doesNotMatch(completedReveal, /refreshSessions|refreshActiveSessionDetail|rehydrat|initialRailHydration/);
  assert.doesNotMatch(actionsReveal, /refreshSessions|refreshActiveSessionDetail|rehydrat|initialRailHydration/);
  assert.match(sessionReveal, /delay:\s*stagger\(32\)/);
  assert.match(sessionReveal, /duration:\s*320/);
  assert.match(completedReveal, /delay:\s*stagger\(40\)/);
  assert.match(completedReveal, /duration:\s*360/);
});

test("rail header action buttons have square corners", () => {
  assert.match(
    cssSource,
    /\.analizar-pdf-rail-selection-toggle \{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;/
  );
});

test("completed rail items retain their extracted color before the first render", () => {
  assert.match(appSource, /function buildSessionCatalogSnapshot[\s\S]*?const revisionTintHex = resolveRevisionAccentColor\(revision\)[\s\S]*?railTintHex:/);
  assert.match(appSource, /const locallyHydratedSession = await restoreLocalAnalysisSession\(store\.getActiveSession\(\)\)[\s\S]*?renderAll\(\);/);
  assert.match(appSource, /railTintHex: String\(entry\.railTintHex \|\| ""\)\.trim\(\)/);
  assert.match(resultsSource, /const cachedHex = String\(entry\?\.railTintHex \|\| ""\)\.trim\(\)[\s\S]*?return cachedHex/);
  assert.match(resultsSource, /buildEmptyRailEntry[\s\S]*?railTintHex: String\(file\?\.railTintHex \|\| ""\)\.trim\(\)/);
  assert.match(storeSource, /railTintHex: \/\^#\(\?:\[0-9a-f\]\{3\}\|\[0-9a-f\]\{6\}\)\$\/i\.test\(railTintHex\) \? railTintHex : ""/);
});
