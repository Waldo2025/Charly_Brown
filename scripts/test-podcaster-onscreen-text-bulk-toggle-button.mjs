import { readFileSync } from "node:fs";

const timelineUiSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

const buttonMatches = timelineUiSource.match(/data-action="timeline-toggle-onscreen-text-hidden"/g) || [];
if (buttonMatches.length < 2) {
  throw new Error("El timeline UI debe renderizar el botón global para ocultar/mostrar texto en pantalla en ambos layouts.");
}

if (!/function setAllOnScreenTextClipsHidden\(/.test(podcasterSource)) {
  throw new Error("podcaster.js debe implementar el toggle masivo de visibilidad de texto en pantalla.");
}

if (!/\[data-action='timeline-toggle-onscreen-text-hidden']:not\(\[data-row-id\]\)/.test(podcasterSource)) {
  throw new Error("El timeline debe manejar el botón global de ocultar/mostrar texto en pantalla.");
}

console.log("Podcaster onscreen text bulk toggle button OK.");
