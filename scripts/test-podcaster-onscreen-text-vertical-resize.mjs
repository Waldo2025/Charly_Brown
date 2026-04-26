import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

const handlesMatch = source.match(
  /function getOnScreenTextResizeHandles\(settings = null\) \{([\s\S]*?)\n\}/m
);

if (!handlesMatch) {
  throw new Error("No se encontró getOnScreenTextResizeHandles.");
}

if (/bgPreset[\s\S]*return \["w", "e"\]/.test(handlesMatch[1])) {
  throw new Error("El texto sin fondo no debe limitar el resize a izquierda/derecha.");
}

const styleMatch = source.match(
  /function buildOnScreenTextBubbleInlineStyle\(settings = null, options = \{\}\) \{([\s\S]*?)\n\}/m
);

if (!styleMatch) {
  throw new Error("No se encontró buildOnScreenTextBubbleInlineStyle.");
}

if (!/`width:\$\{bubbleWidth\}px`/.test(styleMatch[1])
  || !/`min-height:\$\{bubbleHeight\}px`/.test(styleMatch[1])
  || !/"height:auto"/.test(styleMatch[1])) {
  throw new Error("La burbuja debe mantener ancho explícito y altura flexible para respetar el resize vertical sin cortar lineas.");
}

if (/fitToContent:\s*isTextOnlyBubble/.test(source)) {
  throw new Error("El render del overlay no debe volver a activar fitToContent para texto sin fondo.");
}

if (/stylePreset === "glow"[\s\S]*?bgPreset[\s\S]*?estimateOnScreenTextLayoutHeightPct/.test(source)) {
  throw new Error("Glow + bg:none no debe recalcular heightPct automáticamente después de un resize manual.");
}

const beginDragMatch = source.match(
  /startHeightPct:[\s\S]*?fitToContent:\s*([^\n,]+)/m
);

if (!beginDragMatch) {
  throw new Error("No se encontró la configuración de resize del overlay.");
}

if (!/false/.test(beginDragMatch[1])) {
  throw new Error("El resize del overlay no debe forzar fitToContent para texto sin fondo.");
}

console.log("Podcast onscreen text vertical resize OK.");
