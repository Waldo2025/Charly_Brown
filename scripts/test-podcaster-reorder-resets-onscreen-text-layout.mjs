import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/const STUDIO_REORDER_ONSCREEN_TEXT_WIDTH_PCT = 0\.52;/.test(source)) {
  throw new Error("El reorder debe fijar un widthPct estándar para texto en pantalla.");
}

if (!/const STUDIO_REORDER_ONSCREEN_TEXT_HEIGHT_PCT = 0\.16;/.test(source)) {
  throw new Error("El reorder debe fijar un heightPct estándar para texto en pantalla.");
}

const fnMatch = source.match(
  /function normalizeOnScreenTextLayoutsForReorderedTimeline\(session = null\) \{([\s\S]*?)\n\}/m
);

if (!fnMatch) {
  throw new Error("No se encontró normalizeOnScreenTextLayoutsForReorderedTimeline.");
}

const body = fnMatch[1];

if (/prev\.widthPct|prev\.heightPct/.test(body)) {
  throw new Error("El reorder no debe conservar widthPct/heightPct previos del texto.");
}

if (!/const widthPct = STUDIO_REORDER_ONSCREEN_TEXT_WIDTH_PCT;/.test(body)) {
  throw new Error("El reorder debe usar un widthPct fijo.");
}

if (!/const heightPct = STUDIO_REORDER_ONSCREEN_TEXT_HEIGHT_PCT;/.test(body)) {
  throw new Error("El reorder debe usar un heightPct fijo.");
}

if (!/const xPct = Math\.max\(0, Math\.min\(1 - widthPct, centerXPct - \(widthPct \/ 2\)\)\);/.test(body)) {
  throw new Error("El reorder debe centrar horizontalmente el texto.");
}

if (!/const yPct = Math\.max\(0, Math\.min\(1 - heightPct, safeBottomEdgePct - heightPct\)\);/.test(body)) {
  throw new Error("El reorder debe anclar el texto al bottom seguro.");
}

console.log("Podcast reorder resets onscreen text layout OK.");
