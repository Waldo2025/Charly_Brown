import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

assert.match(
  source,
  /from "\.\/podcaster-session-store\.js(?:\?[^"]*)?"/,
  "podcaster.js debe importar el nuevo session store."
);

assert.match(
  source,
  /const bootstrapResult = await sessionStore\.bootstrapSessions\(/,
  "init debe delegar la resolución local-vs-cloud al session store."
);

assert.match(
  storeSource,
  /async function bootstrapSessions\(/,
  "El session store debe implementar bootstrapSessions."
);

assert.match(
  storeSource,
  /if \(localFingerprint && cloudFingerprint && localFingerprint === cloudFingerprint[\s\S]*useLocal: true/m,
  "bootstrapSessions debe preferir caché local cuando local y cloud coinciden."
);

assert.match(
  storeSource,
  /replaceLocalSessionFromCloud\(/,
  "bootstrapSessions debe poder reemplazar caché local desde cloud cuando difiere."
);

console.log("podcaster bootstrap resolves local vs cloud through session store OK.");
