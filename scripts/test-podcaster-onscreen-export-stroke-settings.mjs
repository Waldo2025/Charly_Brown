import { readFileSync } from "node:fs";

const shared = readFileSync(new URL("../public/on-screen-text-render-spec.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/strokeColor:\s*clampText\(trackRaw\?\.strokeColor \|\| "#0f172a", 24\) \|\| "#0f172a"/.test(source)
  || !/strokeWidthPx:\s*clampNumber\(trackRaw\?\.strokeWidthPx, 0, 12, 2\)/.test(source)) {
  throw new Error("El backend debe sanear color y grosor de stroke del texto en pantalla.");
}

if (!/const strokeColor = toFfmpegColor\(input\.onScreenTextSettings\?\.strokeColor \|\| "#0F172A", 1, "0F172A"\);/.test(source)
  || !/const strokeWidthPx = clampNumber\(settings\.strokeWidthPx, 0, 12, 2\);/.test(shared)
  || !/const strokeEnabled = strokeWidthPx > 0\.001;/.test(shared)) {
  throw new Error("El export debe usar la configuracion explicita de stroke desde la spec compartida.");
}

if (!/borderw=\$\{spec\.strokeEnabled \? spec\.strokeWidthPx : 0\}/.test(source)
  || !/bordercolor=\$\{strokeColor\}/.test(source)) {
  throw new Error("El drawtext exportado debe pintar el stroke con el color configurado.");
}

console.log("Podcast onscreen export stroke settings OK.");
