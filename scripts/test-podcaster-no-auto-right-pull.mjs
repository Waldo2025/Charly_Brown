import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/const STUDIO_REORDER_SUBTITLE_INSET_PX = 0;/.test(source)) {
  throw new Error("El inset automático de Gemini tras reorder debe ser 0.");
}

if (!/function resolveGeminiSegmentAnchorStartMs\(segment = null, fallbackAnchorMs = 0\)/.test(source)) {
  throw new Error("El anchor Gemini debe resolverse desde un helper único.");
}

if (!/const hasManualOffsetFromAnchor = hasManualGeminiSegmentOffset\(segment, sceneStartMs\);/.test(source)) {
  throw new Error("El reorder no debe volver a empujar un chip con offset manual hacia el anchor.");
}

if (!/hasManualStartMs \|\| options\?\.isTrimStart/.test(source)) {
  throw new Error("La reconciliación no debe reimponer anchorStartMs sobre startMs manual al persistir.");
}

console.log("No auto right pull for Gemini audio OK.");
