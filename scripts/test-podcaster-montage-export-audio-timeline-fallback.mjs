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
  /const urlCandidate = String\(proxySource\.storagePath && !proxySource\.url \? "" : \(proxySource\.url \|\| rawUrl\)\)\.trim\(\);[\s\S]*const inlineUrlData = urlCandidate\.startsWith\("data:"\) \? urlCandidate : "";\s*const url = inlineUrlData \? "" : urlCandidate;[\s\S]*const resolvedStoragePath = clampText\(storagePath \|\| proxySource\.storagePath \|\| "", 900\);[\s\S]*const dataUrl = String\(asset\?\.dataUrl \|\| asset\?\.localDataUrl \|\| inlineUrlData \|\| ""\)\.trim\(\);/,
  "El downloader del export debe preferir fuentes durables y tratar data URLs inline al normalizar el audio."
);

assert.match(
  source,
  /function convertGsUrlToFirebaseStorageMediaUrl\(url = ""\) \{[\s\S]*firebasestorage\.googleapis\.com\/v0\/b\/\$\{encodeURIComponent\(bucket\)\}\/o\/\$\{encodeURIComponent\(objectPath\)\}\?alt=media[\s\S]*\}/,
  "El backend debe convertir gs://bucket/object a Firebase media URL para el fallback de export."
);

assert.match(
  source,
  /async function findLatestSessionDialogueAudioStoragePath\(\{ sessionId = "", uid = "", rowId = "" \} = \{\}\) \{[\s\S]*owners\/\$\{ownerSlug\}\/audio\/\$\{rowSlug\}-[\s\S]*maxResults: 50[\s\S]*\}/,
  "El backend debe poder redescubrir el audio Gemini más reciente por sessionId, owner y rowId cuando el storagePath guardado ya no exista."
);

assert.match(
  source,
  /const fallbackUrl = convertGsUrlToFirebaseStorageMediaUrl\(url\) \|\| url;[\s\S]*branch: "storage_path_url_fallback"[\s\S]*downloadUrlToFile\(fallbackUrl, outPath, \{ shouldAbort: isAborted \}\)/,
  "Si falla storagePath, el export debe reintentar timeline audio usando fallback HTTP derivado desde gs://."
);

assert.match(
  source,
  /kind === "timeline-audio"[\s\S]*findLatestSessionDialogueAudioStoragePath\(\{[\s\S]*sessionId,[\s\S]*uid,[\s\S]*rowId: String\(asset\?\.rowId \|\| ""\)\.trim\(\)[\s\S]*branch: "session_audio_recovery"[\s\S]*downloadStoragePathToFile\(recoveredStoragePath, outPath, \{ shouldAbort: isAborted \}\)/,
  "Cuando falle un timeline-audio, el export debe intentar recuperar el último audio de la fila antes de declararlo faltante."
);

console.log("Podcaster montage export audio timeline fallback OK.");
