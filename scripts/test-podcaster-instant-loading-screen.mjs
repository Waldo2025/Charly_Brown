import assert from "node:assert/strict";
import fs from "node:fs";

const htmlSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster.html",
  "utf8"
);
const jsSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  htmlSource,
  /<body class="podcaster-booting">/,
  "podcaster.html debe iniciar con body en modo podcaster-booting para bloquear el contenido sin estilo."
);

assert.match(
  htmlSource,
  /#appLoadingScreen \{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*999999;[\s\S]*background:\s*#101827;/,
  "podcaster.html debe incluir CSS crítico inline para que el splash screen cubra la app antes de que cargue podcaster.css."
);

assert.match(
  htmlSource,
  /body\.podcaster-booting > :not\(#appLoadingScreen\) \{[\s\S]*visibility:\s*hidden;/,
  "podcaster.html debe ocultar el resto del body mientras el splash inicial está activo."
);

assert.match(
  jsSource,
  /function hideInitialPodcasterLoadingScreen\(\) \{[\s\S]*document\.body\?\.classList\?\.remove\("podcaster-booting"\);[\s\S]*loader\.classList\.add\("is-hidden"\);[\s\S]*\}/,
  "podcaster.js debe quitar podcaster-booting al ocultar el splash inicial."
);

console.log("Podcaster instant loading screen OK.");
