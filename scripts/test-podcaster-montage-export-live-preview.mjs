import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /const MONTAGE_EXPORT_PREVIEW_REFRESH_MIN_MS = 2200;/,
  "El preview vivo debe usar una cadencia explícita para refrescar la misma escena."
);

assert.match(
  source,
  /function shouldSuspendMontagePreviewActivity\(\) \{[\s\S]*montageExportPreviewPaused === true[\s\S]*\}/,
  "La suspensión del preview debe depender de una pausa explícita, no del busy de export."
);

assert.doesNotMatch(
  source,
  /function shouldSuspendMontagePreviewActivity\(\) \{[\s\S]*montageExportBusy === true[\s\S]*\}/,
  "El estado busy no debe congelar el preview del modal."
);

assert.doesNotMatch(
  source,
  /setTimelinePreviewsSuspended\(true\)/,
  "El arranque de export no debe suspender el preview del modal ni el timeline por defecto."
);

assert.doesNotMatch(
  source,
  /if \(sameRow\) return;[\s\S]*lastJobPreviewAt\)/,
  "El refresco del preview debe poder repetirse para la misma escena con throttle, no bloquearse por completo."
);

assert.match(
  source,
  /setMontageExportPreviewPaused/,
  "Debe existir una pausa explícita separada del busy del export."
);

console.log("Podcaster montage export live preview OK.");
