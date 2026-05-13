import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /function extractDashboardSessionRows\(session = null\) \{[\s\S]*const scriptRows = Array\.isArray\(source\?\.script\?\.rows\) \? source\.script\.rows : \[];[\s\S]*const topRows = Array\.isArray\(source\?\.rows\) \? source\.rows : \[];[\s\S]*const candidateSets = \[scriptRows, nestedSessionScriptRows, nestedSessionRows, topRows\]\.filter\(s => s\.length > 0\);[\s\S]*merged = mergeDashboardRows\(merged, candidateSets\[i\]\);/,
  "home.js debe fusionar secuencialmente todas las variantes legacy de filas para no perder datos de escena."
);

assert.match(
  source,
  /function mergeDashboardRowData\(primaryRow = null, fallbackRow = null\) \{[\s\S]*"text",[\s\S]*"sceneDescription",[\s\S]*"onScreenText",[\s\S]*"visualNotes"/,
  "La fusión de filas del dashboard debe preservar script, descripción, OST y visual de la escena."
);

assert.match(
  source,
  /const rows = extractDashboardSessionRows\(session\);[\s\S]*const hasAnyProposal = rows\.some/,
  "El dashboard debe derivar su estado multimedia desde las filas fusionadas de la sesión."
);

assert.match(
  source,
  /const rows = extractDashboardSessionRows\(currentMultimediaSession\);[\s\S]*const row = resolveDashboardActiveRow\(rows, activeEntry\);/,
  "La actualización reactiva del panel debe resolver la fila activa dentro de las filas rehidratadas."
);

assert.match(
  source,
  /const rows = extractDashboardSessionRows\(s\);[\s\S]*const entries = rows\.map\(\(row, index\) => \{/,
  "El timeline runtime del dashboard debe usar las filas fusionadas para mantener alineado el panel de escena."
);

console.log("Home scene info row hydration OK.");
