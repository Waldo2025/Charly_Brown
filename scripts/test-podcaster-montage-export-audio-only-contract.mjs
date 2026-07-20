import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frontendSource = readFileSync(
  new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url),
  "utf8"
);
const backendSource = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);
const preflightSource = readFileSync(
  new URL("../backend/montage-export/preflight-validation.js", import.meta.url),
  "utf8"
);

assert.match(
  frontendSource,
  /const onlyAudioExport = window\.montageExportState\.onlyAudio === true\s*\|\| window\.els\?\.montageExportOnlyAudio\?\.checked === true;/,
  "El builder frontend debe resolver explícitamente el modo audio-only desde estado o checkbox."
);

assert.match(
  frontendSource,
  /if \(!rowId \|\| \(!onlyAudioExport && \(\!\(videoStoragePath \|\| videoDownloadUrl \|\| videoDataUrl\) && !hasCustomBg\)\)\) \{/,
  "Audio-only no debe bloquear escenas por falta de video."
);

assert.match(
  frontendSource,
  /format: onlyAudioExport \? "mp3_audio" : effectiveFormat,/,
  "Audio-only debe pedir formato mp3_audio al backend."
);

assert.match(
  frontendSource,
  /prepared\.payload\.onScreenTextRenderedSegments = prepared\.payload\.onlyAudio === true\s*\?\s*\[\]/,
  "Audio-only no debe renderizar frames de texto para video."
);

assert.match(
  preflightSource,
  /const onlyAudio = source\.onlyAudio === true \|\| format === "mp3_audio";/,
  "La preflight del backend debe reconocer audio-only por bandera o formato MP3."
);

assert.match(
  preflightSource,
  /if \(!onlyAudio && !hasVisualSource && !hasSyntheticSource\) \{/,
  "La preflight no debe exigir fuente visual en audio-only."
);

assert.match(
  backendSource,
  /if \(clean === "mp3_audio"\) return "mp3";/,
  "El backend debe entregar extensión mp3 para audio-only."
);

assert.match(
  backendSource,
  /if \(ext === "mp3"\) return "audio\/mpeg";/,
  "El backend debe entregar MIME audio/mpeg para audio-only."
);

assert.match(
  backendSource,
  /onlyAudio,\s*format,/,
  "normalizeMontageExportRequestBody debe conservar onlyAudio en el input normalizado."
);

assert.match(
  backendSource,
  /const onlyAudio = raw\?\.onlyAudio === true \|\| requestedFormat === "mp3_audio";/,
  "El backend debe inferir onlyAudio cuando el cliente envía directamente mp3_audio."
);

assert.match(
  backendSource,
  /if \(input\.onlyAudio === true\) \{[\s\S]*renderMontageAudioOnlyExport\(/,
  "El pipeline backend debe saltar render visual y usar la ruta MP3 directa."
);

console.log("Podcaster montage export audio-only contract OK.");
