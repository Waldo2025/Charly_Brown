import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!/const STUDIO_REORDER_SUBTITLE_INSET_PX = 0;/.test(source)) {
  throw new Error("El inset automático de Gemini tras reorder debe ser 0.");
}

if (!/const STUDIO_GEMINI_LEGACY_DEFAULT_DELAY_MS = 1000;/.test(source)) {
  throw new Error("Debe existir la constante de delay legado para normalizar sesiones antiguas.");
}

if (!/Math\.abs\(currentStartMs - legacyDelayStartMs\) > STUDIO_TIMELINE_SNAP_MS/.test(source)) {
  throw new Error("La normalización debe reconocer el delay legado de 1 segundo.");
}

if (!/normalizeLegacyGeminiTrackOffsets\(getActiveSession\(\)\);/.test(source)) {
  throw new Error("La sesión activa debe corregir offsets legados de Gemini al abrir.");
}

console.log("No auto right pull for Gemini audio OK.");
