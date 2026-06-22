import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/api-client.js",
  "utf8"
);

assert.match(
  source,
  /const isBackendBusy = response\.status === 503 && data && \(data\.error === 'backend_busy' \|\| data\.code === 'backend_busy'\);/,
  "El cliente API debe detectar backend_busy como estado conocido."
);

assert.match(
  source,
  /if \(!isMontageQueueUnavailable && !isMontageBusyWithExport && !isBackendBusy\) \{/,
  "El cliente API no debe inundar consola con logs para backend_busy."
);

console.log("api-client backend_busy log suppression OK.");
