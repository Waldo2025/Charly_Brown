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
  /if \(isMontageExportStatusRedirectFailure\(error\)\) \{[\s\S]*window\.montageExportJobState\.preferFirestorePolling = true;[\s\S]*window\.montageExportJobState\.firestorePreferredMissCount = 0;[\s\S]*\}/m,
  "Después de un redirectFailure con fallback válido, el cliente debe dejar de insistir contra export-status remoto."
);

assert.match(
  source,
  /if \(window\.montageExportJobState\.preferFirestorePolling === true\) \{[\s\S]*poll_firestore_preferred_miss[\s\S]*schedulePreferredFirestorePollRetry\(cleanJobId, missCount\);[\s\S]*return;/m,
  "Si ya entró a modo Firestore, un miss aislado no debe reactivar export-status remoto; debe reintentar por Firestore."
);

assert.doesNotMatch(
  source,
  /firestorePollCount[\s\S]{0,240}preferFirestorePolling = false;/m,
  "Una vez que el polling cae a Firestore por CORS/502, no debe volver periódicamente al endpoint export-status."
);

assert.match(
  source,
  /window\.montageExportJobState\.preferFirestorePolling = false;[\s\S]*window\.montageExportJobState\.firestorePreferredMissCount = 0;/m,
  "Al iniciar o aceptar un nuevo job, el modo Firestore preferido y su contador de misses deben reiniciarse."
);

assert.match(
  source,
  /preferFirestorePolling:\s*false,\s*firestorePreferredMissCount:\s*0,/m,
  "El estado del export debe persistir también un contador para misses del polling preferido por Firestore."
);

console.log("Podcaster montage export firestore polling fallback OK.");
