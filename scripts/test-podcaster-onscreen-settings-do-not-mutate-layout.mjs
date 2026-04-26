import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/function expandOnScreenTextLayoutToFitText\(layout = null, row = null, settings = null\)/.test(source)) {
  throw new Error("La funcion auxiliar de expansion de layout debe seguir existiendo para uso local si se requiere.");
}

if (/const expanded = expandOnScreenTextLayoutToFitText\(layout, row, settings\);/.test(source)
  || /return expandOnScreenTextLayoutToFitText\(existing\[key\], row, cfg\?\.onScreenTextTrack \|\| \{\}\) \|\| existing\[key\];/.test(source)
  || /return expandOnScreenTextLayoutToFitText\(defaultLayout, row, cfg\?\.onScreenTextTrack \|\| \{\}\) \|\| defaultLayout;/.test(source)) {
  throw new Error("La configuracion tipografica no debe mutar ni expandir automaticamente el clip/layout persistido.");
}

console.log("Podcast onscreen settings do not mutate layout OK.");
