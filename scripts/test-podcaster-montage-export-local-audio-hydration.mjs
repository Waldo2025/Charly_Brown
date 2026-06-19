import assert from "node:assert/strict";
import fs from "node:fs";

const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

const exportSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-montage-export.js",
  "utf8"
);

assert.match(
  podcasterSource,
  /const dataUrl = String\(clip\.dataUrl \|\| clip\.localDataUrl \|\| ""\)\.trim\(\);[\s\S]*const localMediaCacheKey = String\(clip\.localMediaCacheKey \|\| ""\)\.trim\(\);[\s\S]*if \(!storagePath && !downloadUrl && !dataUrl && !localMediaCacheKey\) return;[\s\S]*localDataUrl: dataUrl,[\s\S]*localMediaCacheKey,/,
  "El mapa de audio Gemini debe preservar dataUrl y localMediaCacheKey para reutilizar blobs locales en export."
);

assert.match(
  podcasterSource,
  /const dataUrl = String\(segment\?\.dataUrl \|\| segment\?\.localDataUrl \|\| ""\)\.trim\(\);[\s\S]*const localMediaCacheKey = String\(segment\?\.localMediaCacheKey \|\| ""\)\.trim\(\);[\s\S]*if \(!downloadUrl && !storagePath && !dataUrl && !localMediaCacheKey\) return null;[\s\S]*localDataUrl: dataUrl,[\s\S]*localMediaCacheKey,/,
  "El fallback del track Gemini debe conservar referencias locales si existen."
);

assert.match(
  exportSource,
  /const cachedPlaybackBlobUrl = sourceUrl && typeof window\.playbackController\?\.getBlobUrlSync === "function"[\s\S]*const effectiveFetchUrl = cachedPlaybackBlobUrl \|\| sourceUrl;[\s\S]*const blob = await fetchMontageMediaBlob\(effectiveFetchUrl\);/,
  "La hidratación del export debe intentar reutilizar el blob ya cacheado por playbackController antes de volver a descargar el audio."
);

assert.match(
  exportSource,
  /localMediaCacheKey: String\(storedAudio\?\.localMediaCacheKey \|\| ""\)\.trim\(\)/,
  "Los segmentos Gemini del export deben propagar localMediaCacheKey para reusar caché local."
);

console.log("Podcaster montage export local audio hydration OK.");
