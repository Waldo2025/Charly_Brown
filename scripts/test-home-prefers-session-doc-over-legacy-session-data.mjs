import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);
const legacyCollection = ["podcaster", "sessions", "payloads"].join("_");

assert.doesNotMatch(
  source,
  new RegExp(`legacyRef|${legacyCollection}`),
  "Home no debe consultar documentos legacy al abrir o sincronizar el reproductor multimedia."
);

assert.match(
  source,
  /function mergeDashboardRows\(primaryRows = \[\], fallbackRows = \[\]\) \{[\s\S]*if \(primaryList\.length === 0\) \{[\s\S]*fallbackById\.forEach\(/,
  "Solo deben agregarse filas del fallback cuando la fuente principal no tiene filas."
);

assert.match(
  source,
  /const sessionData = data\?\.session && typeof data\.session === "object" \? data\.session : data;[\s\S]*const mergedRows = mergeDashboardRows\(\s*extractDashboardSessionRows\(base\),\s*extractDashboardSessionRows\(fallbackClone\)\s*\);/,
  "La sesion del documento principal debe ganar y solo usar el fallback para compatibilidad local."
);

assert.match(
  source,
  /multimediaPlayerUnsubscribe = onSnapshot\(sessionRef, updateFn\);/,
  "El reproductor multimedia debe escuchar solo el documento principal."
);

console.log("Home prefers session doc over legacy session data OK.");
