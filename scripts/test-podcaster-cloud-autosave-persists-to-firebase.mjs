import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /cloudAutosaveInFlight = true;/,
  "El autosave cloud debe marcar una sincronización en curso."
);

assert.match(
  source,
  /await saveSessionToCloud\(session\.id, \{ silent: true \}\);/,
  "El autosave del timeline debe persistir en Firebase con saveSessionToCloud."
);

assert.match(
  source,
  /if \(cloudAutosaveInFlight\) \{[\s\S]*cloudAutosaveQueued = true;[\s\S]*return;[\s\S]*\}/,
  "El autosave cloud debe encolar cambios si ya hay un guardado en curso."
);

console.log("Podcaster cloud autosave persists to Firebase OK.");
