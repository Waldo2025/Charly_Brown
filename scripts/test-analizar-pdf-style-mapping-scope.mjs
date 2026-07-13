import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildDefaultStyleMappingSeeds,
  buildStyleMappingLookupScopeKeys,
} = require("../backend/analizar-pdf.js");

{
  const keys = buildStyleMappingLookupScopeKeys({
    bookType: "LA",
    nivel: "Primaria",
    grado: "Cuarto",
    unidad: "Recortables",
  });
  assert.deepEqual(
    keys,
    ["la|primaria|cuarto|recortables", "la|primaria|recortables"],
    "La resolución de mapeos debe intentar primero el grado exacto y luego el grado comodín para Recortables."
  );
}

{
  const seeds = buildDefaultStyleMappingSeeds("");
  assert.deepEqual(
    seeds,
    [],
    "No deben crearse plantillas default; las plantillas deben derivarse desde archivos IDML reales."
  );
}

{
  const appSource = fs.readFileSync(path.resolve("public/analizarPDF/analizar-pdf-app.js"), "utf8");
  const serverSource = fs.readFileSync(path.resolve("backend/server.js"), "utf8");
  assert.match(appSource, /function buildMappingLookupScopeKeys\(/);
  assert.match(
    appSource,
    /const scopeKeys = buildMappingLookupScopeKeys\([\s\S]*?for \(const scopeKey of scopeKeys\)/,
    "La UI debe resolver mapeos con fallback por grado comodín."
  );
  assert.match(serverSource, /default_la_proyecto/);
  assert.match(serverSource, /default_la_recortables/);
  assert.match(serverSource, /default_la_primero_unidad/);
  assert.match(
    serverSource,
    /legacyDefaultIds[\s\S]*?\.delete\(\)/,
    "El backend debe remover las plantillas default legacy si ya existen."
  );
}

console.log("Analizar PDF style mapping scope regression OK.");
