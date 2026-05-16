import { readFileSync } from "node:fs";

const jsSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../public/podcaster.css", import.meta.url), "utf8");

const beginDragMatch = jsSource.match(
  /function beginOnScreenTextOverlayDrag\(event = null\) \{([\s\S]*?)\n\}/m
);

if (!beginDragMatch) {
  throw new Error("No se encontró beginOnScreenTextOverlayDrag.");
}

if (/syncPodcastOnScreenTextOverlay\(/.test(beginDragMatch[1])) {
  throw new Error("La selección del texto no debe rerenderizar el overlay durante pointerdown/drag.");
}

const selectionFrameMatch = cssSource.match(
  /\.podcast-onscreen-selection-frame \{([\s\S]*?)\n\}/m
);

if (!selectionFrameMatch) {
  throw new Error("No se encontró .podcast-onscreen-selection-frame.");
}

if (!/box-sizing:\s*border-box;/.test(selectionFrameMatch[1])) {
  throw new Error("El frame de selección debe usar box-sizing:border-box para no deformar la burbuja.");
}

console.log("Podcast onscreen text selection drag OK.");
