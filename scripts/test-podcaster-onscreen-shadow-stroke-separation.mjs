import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const shared = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");

if (!/function buildOnScreenTextPreviewShadowCss\(settings = null, options = \{\}\) \{/.test(shared)) {
  throw new Error("La sombra del texto en pantalla debe centralizarse en el módulo compartido.");
}

if (!/const strokeWidthPx = Math\.max\(0, Math\.round\(Number\(options\?\.strokeWidthPx \?\? current\.strokeWidthPx \?\? 0\) \|\| 0\)\);/.test(shared)
  || !/const radii = \[Math\.max\(0\.5, strokeWidthPx\)\];/.test(shared)
  || !/if \(strokeWidthPx > 1\.35\) \{\s*radii\.unshift\(Math\.max\(0\.4, strokeWidthPx \* 0\.58\)\);\s*\}/.test(shared)
  || !/const steps = Math\.max\(12, Math\.ceil\(radius \* \(ringIndex === radii\.length - 1 \? 18 : 12\)\)\);/.test(shared)) {
  throw new Error("Cuando hay stroke, la sombra debe renderizarse separada del borde y no contaminarlo.");
}

if (!/--pod-onscreen-text-user-shadow:\$\{buildOnScreenTextPreviewShadowCss\(current, \{ strokeWidthPx: metrics\.previewBorderWidthPx \}\)\}/.test(shared)
  || !/return buildSharedOnScreenTextPreviewShadowCss\s*\?\s*buildSharedOnScreenTextPreviewShadowCss\(settings, options\)/.test(source)) {
  throw new Error("El panel y el overlay deben usar la implementación compartida de sombra con grosor de stroke.");
}

console.log("Podcast onscreen shadow stroke separation OK.");
