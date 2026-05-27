import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../public/podcaster/podcaster-on-screen-text.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/strokeColor:\s*clampText\(trackRaw\?\.strokeColor \|\| "#0f172a", 24\) \|\| "#0f172a"/.test(source)
  || !/strokeWidthPx:\s*clampNumber\(trackRaw\?\.strokeWidthPx, 0, 12, 2\)/.test(source)) {
  throw new Error("El backend debe sanear color y grosor de stroke del texto en pantalla.");
}

if (!/const strokeColor = toFfmpegColor\(onScreenTextSettings\?\.strokeColor \|\| "#0F172A", 1, "0F172A"\);/.test(source)
  || !/const strokeWidthPx = clampNumber\(settings\.strokeWidthPx, 0, 12, 2\);/.test(shared)
  || !/strokeWidthPx > 0\.001/.test(shared)) {
  throw new Error("El export debe usar la configuracion explicita de stroke desde la spec compartida.");
}

if (!/const baseStrokeWidth = Math\.max\(0, Number\(spec\.strokeEnabled \? spec\.strokeWidthPx : 0\) \|\| 0\);/.test(source)
  || !/borderw=\$\{layerStrokeWidth\}/.test(source)
  || !/bordercolor=\$\{overrides\.bordercolor \|\| strokeColor\}/.test(source)) {
  throw new Error("El drawtext exportado debe pintar el stroke con el color configurado.");
}

console.log("Podcast onscreen export stroke settings OK.");
