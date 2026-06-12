import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const timelineUiSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url),
  "utf8"
);

assert.match(
  timelineUiSource,
  /const chipZIndex = isSelected \? 24 : 1;/,
  "El chip Gemini debe elevar su z-index cuando está seleccionado."
);

assert.match(
  timelineUiSource,
  /data-action="timeline-select-gemini-audio"[\s\S]*style="left:\$\{leftPx\.toFixed\(3\)\}px;width:\$\{widthPx\.toFixed\(3\)\}px;z-index:\$\{chipZIndex\}"/,
  "El render del chip Gemini debe exponer la acción de selección y aplicar el z-index calculado en el estilo inline."
);

console.log("Podcaster Gemini selected chip z-order OK.");
