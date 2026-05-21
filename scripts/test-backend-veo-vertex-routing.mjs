import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../backend/server.js", import.meta.url),
  "utf8"
);

if (!/GEMINI_BASE}\/models\/\$\{encodeURIComponent\(videoModel\)\}:predictLongRunning/.test(source)) {
  throw new Error("La generación de video Veo debe seguir usando Gemini API predictLongRunning.");
}

if (/publishers\/google\/models\/\$\{encodeURIComponent\(videoModel\)\}:predictLongRunning/.test(source)) {
  throw new Error("La generación de video Veo no debe cambiarse a Vertex AI en esta integración.");
}

if (!/label: "text-only\+aspect\+duration"[\s\S]*instances: \[\{\s*prompt\s*\}\]/m.test(source)) {
  throw new Error("La variante text-only+aspect+duration no debe incluir referenceImages.");
}

if (!/label: "text-only\+aspect"[\s\S]*instances: \[\{\s*prompt\s*\}\]/m.test(source)) {
  throw new Error("La variante text-only+aspect no debe incluir referenceImages.");
}

if (!/const referenceDurationSec = \(sceneReferenceAssets\.length \|\| continuityReferenceImage \|\| hasPortraitAsset\)\s*\?\s*8\s*:\s*inferredTargetDurationSec;/.test(source)) {
  throw new Error("Las variantes con referenceImages deben fijar durationSeconds en 8.");
}

console.log("Backend Veo Gemini routing OK.");
