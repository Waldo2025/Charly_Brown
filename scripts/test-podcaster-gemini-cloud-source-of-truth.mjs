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
  /const bootstrapResult = await sessionStore\.bootstrapSessions\(/,
  "init debe delegar la resolución local-vs-cloud al session store."
);

assert.match(
  storeSource,
  /if \(localFingerprint && cloudFingerprint && localFingerprint === cloudFingerprint && localUpdatedAt === cloudUpdatedAt\) \{/,
  "El session store debe preferir la caché local cuando fingerprint y updatedAt coinciden."
);

assert.match(
  source,
  /const mergedSession = mergeCloudSessionOverLocalCache\(cloudSession, nextSession\);/,
  "Las sesiones stub deben seguir pudiendo completarse desde cloud."
);

assert.doesNotMatch(
  source,
  /if \(nextSession\?\.isStub \|\| nextSession\?\.script\?\.rows\?\.length\)/,
  "setActiveSession ya no debe rehidratar desde cloud una sesión local completa."
);

console.log("Podcaster local-first bootstrap and stub-only cloud hydration OK.");
