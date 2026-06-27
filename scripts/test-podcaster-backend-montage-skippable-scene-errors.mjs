import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.doesNotMatch(
  source,
  /function shouldSkipMontageEntryError\(|buildMontageSkippedEntry\(/,
  "El backend no debe conservar helpers para omitir escenas fallidas durante el export."
);

assert.match(
  source,
  /catch \(error\) \{[\s\S]*failedSceneIndex: sceneIndex,[\s\S]*failedRowId: rowId,[\s\S]*throw error;[\s\S]*\} finally \{/m,
  "Los errores por escena deben propagarse con escena/substage en vez de continuar con un MP4 incompleto."
);

console.log("Podcaster backend montage strict scene errors OK.");
