import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/function doesMontageOnScreenTextSegmentBelongToScene\(/.test(backendSource)) {
  throw new Error("El backend debe tener helper explícito para asignar texto en pantalla a escenas.");
}

if (!/const hasExplicitSceneIndex = segment\?\.sceneIndex !== null[\s\S]*?if \(hasExplicitSceneIndex\) \{[\s\S]*?segmentSceneIndex === normalizedSceneIndex/.test(backendSource)) {
  throw new Error("El backend no debe tratar un sceneIndex ausente como si perteneciera a la escena actual.");
}

if (/const segmentSceneIndex = Math\.max\(1, Math\.round\(Number\(segment\?\.sceneIndex \|\| normalizedSceneIndex\)/.test(backendSource)) {
  throw new Error("Regresión: los segmentos sin sceneIndex se vuelven a asignar implícitamente a todas las escenas.");
}

console.log("Podcaster on-screen text scene belonging contract OK.");
