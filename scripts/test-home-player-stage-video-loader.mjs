import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.js",
  "utf8"
);

assert.match(
  source,
  /setPodcastStageVideoSourceForElement:\s*async\s*\(el,\s*url,\s*options = \{\}\)\s*=>\s*\{/,
  "Home debe exponer un cargador de video para el stage del player."
);

assert.match(
  source,
  /el\.dataset\.src = cleanUrl;/,
  "El cargador de video en Home debe registrar el src lógico para que el controlador detecte el clip activo."
);

assert.match(
  source,
  /preferredSource = multimediaPlaybackController\.getBlobUrlSync\(cleanUrl\) \|\| "";/,
  "Home debe priorizar el blob cacheado del controlador para evitar stage negro con URLs proxy frágiles."
);

assert.match(
  source,
  /preferredSource = await multimediaPlaybackController\.getBlobUrl\(cleanUrl\);/,
  "Home debe poder hidratar el blob si aún no estaba en memoria."
);

assert.match(
  source,
  /el\.onloadeddata = \(\) => onDone\(true\);/,
  "El cargador de video en Home debe marcar ready cuando ya existe frame decodificado."
);

assert.match(
  source,
  /el\.oncanplay = \(\) => onDone\(true\);/,
  "El cargador de video en Home debe mantener el fallback de ready en oncanplay."
);

assert.match(
  source,
  /resolve\(Boolean\(ready\) && stillExpected && hasData\);/,
  "El cargador de video en Home debe propagar un booleano real de readiness."
);

assert.match(
  source,
  /setTimeout\(\(\) => onDone\(true\), 3500\);/,
  "El cargador de video en Home debe tener timeout de escape sin bloquear el swap."
);

console.log("Home player stage video loader OK.");
