import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v2Source = readFileSync(
  new URL("../public/podcaster/podcaster-montage-export-v2.js", import.meta.url),
  "utf8"
);
const apiWrapperSource = readFileSync(
  new URL("../public/js/api-client-podcaster.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

assert.match(
  v2Source,
  /if \(window\.els\?\.montageExportOnlyAudio\?\.checked === true && window\.montageExportState\) \{[\s\S]*window\.montageExportState\.onlyAudio = true;/,
  "Export V2 debe sincronizar el checkbox real de solo audio antes de construir el payload."
);

assert.match(
  v2Source,
  /const onlyAudio = prepared\.payload\?\.onlyAudio === true;/,
  "Export V2 debe detectar explícitamente onlyAudio desde el payload preparado."
);

assert.match(
  v2Source,
  /const onScreenTextSegmentCount = onlyAudio \? 0 : Array\.isArray/,
  "Export V2 no debe exigir segmentos/capturas de karaoke en audio-only."
);

assert.match(
  v2Source,
  /if \(onlyAudio\) \{[\s\S]*payload\.format = "mp3_audio";[\s\S]*payload\.onScreenTextTimeline = null;[\s\S]*payload\.partyKaraoke = false;[\s\S]*\}/,
  "Export V2 debe limpiar capas visuales y forzar mp3_audio en audio-only."
);

assert.match(
  v2Source,
  /const submissionPayload = \{[\s\S]*onlyAudio,[\s\S]*format: onlyAudio \? "mp3_audio" : payload\.format[\s\S]*\};/,
  "El request final V2 debe conservar alineados onlyAudio y mp3_audio después de limpiar el payload."
);

assert.match(
  v2Source,
  /const nestedDetail = detail\?\.detail && typeof detail\.detail === "object" \? detail\.detail : null;[\s\S]*Array\.isArray\(nestedDetail\?\.issues\)/,
  "Export V2 debe mostrar detalles útiles cuando preflight falla con detail.detail.issues."
);

assert.match(
  apiWrapperSource,
  /api-client\.js\?v=2026-1\.0\.10\.530/,
  "El wrapper api-client-podcaster debe forzar la versión vigente de api-client.js."
);

assert.match(
  podcasterSource,
  /api-client-podcaster\.js\?v=2026-1\.0\.10\.530/,
  "podcaster.js debe importar el wrapper API con cache-buster vigente para no reutilizar api-client-podcaster viejo."
);

console.log("Podcaster montage export V2 audio-only contract OK.");
