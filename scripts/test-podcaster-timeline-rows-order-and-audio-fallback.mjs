import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const uiSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-ui.js",
  "utf8"
);

const runtimeSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-media-runtime.js",
  "utf8"
);

assert.match(
  uiSource,
  /function renderPodcastVideoTimeline\(session = null, options = \{\}\) \{[\s\S]*?const rows = getSessionRows\(activeSession\);/,
  "El render lightweight del timeline debe declarar rows antes de usarlo."
);

assert.match(
  runtimeSource,
  /if \(cleanStoragePath\) \{[\s\S]*?const proxyUrl = [\s\S]*?finalUrl = isMarkedStaleProxyMediaUrl\(proxyUrl\) \? clean : proxyUrl;/,
  "Cuando el proxy por storagePath ya está marcado como roto, el audio debe caer a proxy por URL directa si existe."
);

console.log("Podcaster timeline rows order and audio fallback OK.");
