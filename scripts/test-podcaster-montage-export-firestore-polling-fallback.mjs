import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /preferFirestorePolling:\s*false/,
  "El estado del export debe inicializar una bandera para preferir polling por Firestore."
);

assert.match(
  source,
  /if \(window\.montageExportJobState\.preferFirestorePolling === true\) \{[\s\S]*loadMontageExportJobStatusFromFirestore\(cleanJobId\)/m,
  "Si export-status queda roto por redirect/CORS, el polling debe poder continuar directamente por Firestore."
);

assert.match(
  source,
  /if \(isMontageExportStatusRedirectFailure\(error\)\) \{\s*window\.montageExportJobState\.preferFirestorePolling = true;\s*\}/m,
  "Después de un redirectFailure con fallback válido, el cliente debe dejar de insistir contra export-status remoto."
);

assert.match(
  source,
  /window\.montageExportJobState\.preferFirestorePolling = false;/,
  "Al iniciar o aceptar un nuevo job, el modo Firestore preferido debe reiniciarse."
);

console.log("Podcaster montage export firestore polling fallback OK.");
