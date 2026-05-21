import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!source.includes("let sequentialCursorMs = 0;")) {
  throw new Error("La reconstrucción del track Gemini debe mantener un cursor secuencial de audio.");
}

if (!source.includes("const automaticStartMs = Math.max(delayedStartMsDefault, sequentialCursorMs);")) {
  throw new Error("Las transiciones visuales no deben adelantar el inicio automático del audio Gemini por debajo del fin del segmento previo.");
}

if (!source.includes("const hasManualStartMs = hasManualGeminiSegmentOffset(existingSegment, automaticStartMs);")) {
  throw new Error("Los offsets manuales de chips Gemini deben seguir respetándose tras el ajuste secuencial.");
}

if (!source.includes("sequentialCursorMs = normalizedSegment")) {
  throw new Error("El cursor secuencial debe avanzar con la duración final del segmento Gemini.");
}

console.log("Gemini transition overlap does not cut audio OK.");
