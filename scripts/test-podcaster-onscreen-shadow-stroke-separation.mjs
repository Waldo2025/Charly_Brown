import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/function buildOnScreenTextPreviewShadowCss\(settings = null, options = \{\}\) \{/.test(source)) {
  throw new Error("La sombra del texto en pantalla debe aceptar opciones de render.");
}

if (!/const strokeWidthPx = Math\.max\(0, Math\.round\(Number\(options\?\.strokeWidthPx \?\? current\.strokeWidthPx \?\? 0\) \|\| 0\)\);/.test(source)
  || !/const radii = \[Math\.max\(0\.5, strokeWidthPx\)\];/.test(source)
  || !/if \(strokeWidthPx > 1\.35\) \{\s*radii\.unshift\(Math\.max\(0\.4, strokeWidthPx \* 0\.58\)\);\s*\}/.test(source)
  || !/const steps = Math\.max\(12, Math\.ceil\(radius \* \(ringIndex === radii\.length - 1 \? 18 : 12\)\)\);/.test(source)) {
  throw new Error("Cuando hay stroke, la sombra debe renderizarse separada del borde y no contaminarlo.");
}

if (!/--pod-onscreen-text-user-shadow:\$\{buildOnScreenTextPreviewShadowCss\(current, \{ strokeWidthPx: metrics\.previewBorderWidthPx \}\)\}/.test(source)
  || !/overlay\.style\.setProperty\("--pod-onscreen-text-user-shadow", buildOnScreenTextPreviewShadowCss\(settings, \{ strokeWidthPx: renderMetrics\.previewBorderWidthPx \}\)\);/.test(source)) {
  throw new Error("El panel y el overlay deben pasar el grosor de stroke al calculo de sombra.");
}

console.log("Podcast onscreen shadow stroke separation OK.");
