import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const replacementSource = readFileSync(
  new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

assert.match(
  replacementSource,
  /videoEl\.muted = true;[\s\S]*videoEl\.defaultMuted = true;[\s\S]*videoEl\.volume = 0;[\s\S]*videoEl\.playsInline = true;[\s\S]*videoEl\.loop = true;/,
  "El preview de reemplazo debe permanecer silenciado, inline y en loop."
);

assert.match(
  replacementSource,
  /function resolveReplacementPreviewUrl[\s\S]*?if \(cleanStoragePath\) \{[\s\S]*buildApiUrl\(`\/api\/assets\/proxy-media\?storagePath=\$\{encodeURIComponent\(cleanStoragePath\)\}`\);[\s\S]*return rawUrl;/,
  "Las miniaturas deben preferir el proxy autenticable por storagePath sobre URLs Firebase sin token."
);

assert.match(
  replacementSource,
  /const previewUrl = resolveReplacementPreviewUrl\(downloadUrl, storagePath\);/,
  "El modal debe usar el resolver exclusivo de preview sin alterar la referencia persistida."
);

assert.match(
  replacementSource,
  /videoEl\.currentTime = Math\.min\(0\.15,[\s\S]*Number\(videoEl\.duration\) \/ 20\)\);/,
  "Debe buscar un frame posterior al cero para evitar miniaturas negras."
);

assert.match(
  replacementSource,
  /card\.classList\.add\('is-selected'\);[\s\S]*if \(previewVideo\) playSceneReplacementPreview\(previewVideo\);/,
  "Seleccionar una tarjeta debe iniciar inmediatamente su preview."
);

assert.doesNotMatch(
  replacementSource,
  /onmouseover=|onmouseout=/,
  "Los previews no deben depender de handlers inline de hover."
);

assert.match(
  podcasterSource,
  /function closeSceneVideoSelectorModal\(\) \{[\s\S]*stopLibraryPreviews\?\.\(\{ keepFrames: true \}\);/,
  "Cerrar el modal debe detener cualquier preview en reproducción."
);

console.log("Podcaster scene replacement muted video preview OK.");
