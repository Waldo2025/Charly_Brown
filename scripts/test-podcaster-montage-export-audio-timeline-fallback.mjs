import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/backend/server.js",
  "utf8"
);

assert.match(
  source,
  /const useTimelineAudio = timelineAudioSegments\.length > 0 && audioTimelineRaw\?\.enabled !== false;/,
  "El backend debe activar la mezcla de audio cuando existen segmentos, aunque el flag enabled falte."
);

assert.match(
  source,
  /const resolveProxyMediaSource = \(assetUrl = ""\) => \{[\s\S]*\/api\/assets\/proxy-media[\s\S]*storagePath/,
  "El downloader del export debe resolver proxy-media hacia storagePath o URL original antes de mezclar."
);

assert.match(
  source,
  /const url = String\(segment\?\.url \|\| segment\?\.downloadUrl \|\| segment\?\.localDataUrl \|\| segment\?\.dataUrl \|\| ""\)\.trim\(\);/,
  "La normalización del timeline de audio debe aceptar downloadUrl y localDataUrl además de url."
);

assert.match(
  source,
  /const url = String\(proxySource\.storagePath && !proxySource\.url \? "" : \(proxySource\.url \|\| rawUrl\)\)\.trim\(\);[\s\S]*const resolvedStoragePath = clampText\(storagePath \|\| proxySource\.storagePath \|\| "", 900\);/,
  "El downloader del export debe preferir fuentes durables al normalizar el audio."
);

console.log("Podcaster montage export audio timeline fallback OK.");
