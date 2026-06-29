import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

if (!/const DEFAULT_PODCASTER_VIDEO_MODEL = "veo-3\.1-generate-preview";/.test(source)) {
  throw new Error("El backend debe usar veo-3.1-generate-preview como modelo Veo por defecto en Gemini API.");
}

if (!/const PODCASTER_VIDEO_MODEL_CANDIDATES = Object\.freeze\(\[\s*"veo-3\.1-generate-preview",\s*"veo-3\.1-fast-generate-preview",\s*"veo-3\.1-lite-generate-preview",\s*"veo-3\.0-generate-001",\s*"veo-3\.0-fast-generate-001",\s*"veo-2\.0-generate-001"\s*\]\);/m.test(source)) {
  throw new Error("El backend debe exponer todos los modelos Veo compatibles con esta integración.");
}

if (!/resolution\s*=\s*"1080p"/.test(source)) {
  throw new Error("El backend debe forzar resolution=1080p para Veo.");
}

if (!/\^veo-2\\\.0\\b/.test(source) || !/delete next\.resolution;/.test(source)) {
  throw new Error("El backend no debe enviar resolution=1080p a veo-2.0-generate-001.");
}

if (!/parameters:\s*applyVeoHdParameters\([\s\S]*variant\.body\.parameters[\s\S]*videoModel[\s\S]*\)/m.test(source)) {
  throw new Error("La resolución Veo debe resolverse por modelo al construir cada request.");
}

if (/compressionQuality\s*=/.test(source)) {
  throw new Error("El backend no debe enviar compressionQuality a Veo 3.1 en Gemini API.");
}

console.log("Backend Veo GA refresh OK.");
