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
  /const hasStorageBackedRemoteSource = Boolean\(String\(asset\?\.storagePath \|\| ""\)\.trim\(\)\);[\s\S]*const cachedPlaybackBlobUrl = sourceUrl && !hasStorageBackedRemoteSource && typeof window\.playbackController\?\.getBlobUrlSync === "function"[\s\S]*const effectiveFetchUrl = cachedPlaybackBlobUrl \|\| sourceUrl;[\s\S]*const blob = await fetchMontageMediaBlob\(effectiveFetchUrl\);/,
  "La hidratación del export debe reutilizar playbackController solo para assets sin storagePath; los remotos durables los resuelve el worker."
);

assert.match(
  exportSource,
  /const hasStorageBackedRemoteSource = Boolean\(String\(asset\?\.storagePath \|\| ""\)\.trim\(\)\);[\s\S]*if \(hasStorageBackedRemoteSource\) \{[\s\S]*url: sourceUrl,[\s\S]*downloadUrl: sourceUrl/,
  "La hidratación del export no debe descargar desde el frontend assets remotos que ya tienen storagePath; el worker los resuelve server-side."
);

assert.match(
  exportSource,
  /const preferredResolver = kind === "audio"[\s\S]*window\.resolveStorageAudioUrl\?\.\(directDownloadUrl, storagePath\)[\s\S]*const fallbackResolver = kind === "audio"[\s\S]*window\.resolveStorageVideoUrl\?\.\(directDownloadUrl, storagePath\)[\s\S]*const resolvedProxyUrl = resolveCandidate\(preferredResolver\) \|\| resolveCandidate\(fallbackResolver\);/,
  "Los assets de audio del export deben resolver primero con resolveStorageAudioUrl y no aceptar un gs:// crudo como URL final."
);

assert.doesNotMatch(
  exportSource,
  /const hasExplicitSource = Boolean\([\s\S]*clean\.dataUrl = ""[\s\S]*clean\.localDataUrl = ""/,
  "El payload final del export no debe borrar dataUrl/localDataUrl ya hidratados justo antes del POST."
);

assert.match(
  exportSource,
  /localMediaCacheKey: String\(storedAudio\?\.localMediaCacheKey \|\| ""\)\.trim\(\)/,
  "Los segmentos Gemini del export deben propagar localMediaCacheKey para reusar caché local."
);

console.log("Podcaster montage export local audio hydration OK.");
