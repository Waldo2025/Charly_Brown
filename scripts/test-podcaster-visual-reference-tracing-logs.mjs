import { readFileSync } from "node:fs";

const frontendSource = readFileSync(
  new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url),
  "utf8"
);

const backendSource = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

if (/\[SceneVideoGeneration\]/.test(frontendSource)) {
  throw new Error("El frontend ya no debe emitir el prefijo genérico [SceneVideoGeneration].");
}

if (!/function traceVisualReferenceScene\(step = "", details = \{\}\)/.test(frontendSource)) {
  throw new Error("El frontend debe exponer un trazador específico para escenas con referencia visual.");
}

if (!/\[Podcaster\]\[SceneVideoRef\]\[/.test(frontendSource)) {
  throw new Error("El frontend debe usar el prefijo nuevo [Podcaster][SceneVideoRef].");
}

if (!/const traceReferenceVideo = \(step = "", details = \{\}\) => \{/.test(backendSource)) {
  throw new Error("El backend debe exponer un trazador específico para referencias visuales.");
}

if (!/\[backend\]\[scene-video-ref\]\[/.test(backendSource)) {
  throw new Error("El backend debe usar el prefijo [backend][scene-video-ref].");
}

console.log("Podcaster visual reference tracing logs OK.");
