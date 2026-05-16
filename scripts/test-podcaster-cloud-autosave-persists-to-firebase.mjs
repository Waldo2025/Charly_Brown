import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const storeSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-session-store.js",
  "utf8"
);

assert.match(
  source,
  /await sessionStore\.saveManual\(/,
  "Los botones Guardar deben delegar el guardado cloud manual al session store."
);

assert.doesNotMatch(
  source,
  /await saveSessionToCloud\(session\.id, \{ silent: true \}\);/,
  "La edición normal ya no debe guardar la sesión en Firebase mediante silent cloud save."
);

assert.doesNotMatch(
  source,
  /cloudAutosaveInFlight = true;/,
  "podcaster.js ya no debe orquestar un autosave cloud en segundo plano."
);

assert.match(
  storeSource,
  /async function saveSessionManuallyToCloud\(/,
  "El session store debe encapsular el guardado cloud manual."
);

assert.match(
  storeSource,
  /markSessionDirty\(/,
  "El session store debe marcar sesiones dirty para edición local."
);

console.log("podcaster cloud sync is manual and centralized in session store OK.");
