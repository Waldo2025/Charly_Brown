import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  source,
  /export async function runMontageExport\(\) \{\s*if \(window\.montageExportBusy \|\| montageExportSubmitLocked\) return;\s*montageExportSubmitLocked = true;\s*const previousJobId = String\(window\.montageExportJobState\.jobId \|\| ""\)\.trim\(\);\s*try \{/m,
  "runMontageExport debe capturar previousJobId fuera del try para poder recuperarlo en cualquier error de submit."
);

assert.match(
  source,
  /setMontageExportStatus\("No pudimos exportar tu video\.", hintParts\.join\(" "\), \{ tone: "error" \}\);\s*window\.setTimelinePreviewsSuspended\?\.\(false\);\s*setMontageExportPreviewPaused\(false\);\s*setMontageExportBusy\(false\);/m,
  "Cuando falla el submit del export, el modal debe reactivar previews y salir del estado pausado/busy."
);

console.log("Podcaster montage export submit error recovery OK.");
