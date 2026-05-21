import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

if (!/const DEFAULT_PODCASTER_VIDEO_MODEL = "veo-3\.1-generate-preview";/.test(source)) {
  throw new Error("El backend debe usar veo-3.1-generate-preview como modelo Veo por defecto en Gemini API.");
}

if (!/const PODCASTER_VIDEO_MODEL_CANDIDATES = Object\.freeze\(\[\s*"veo-3\.1-generate-preview",\s*"veo-3\.1-fast-generate-preview",\s*"veo-3\.1-lite-generate-preview"\s*\]\);/m.test(source)) {
  throw new Error("El backend debe usar los modelos Veo 3.1 preview actuales, incluyendo lite como fallback.");
}

if (/veo-3\.1-(?:fast-)?generate-001/.test(source)) {
  throw new Error("El backend no debe mezclar los IDs generate-001 de Vertex en esta ruta Gemini API.");
}

console.log("Backend Veo model refresh OK.");
