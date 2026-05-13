import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("const hasContinuity = Boolean(requestBody.relateWithPreviousScene);")) {
  throw new Error("No se encontró el bloque de fallback técnico para continuidad.");
}

if (source.includes("requestBody.relateWithPreviousScene = false;")) {
  throw new Error("El fallback no debe desactivar relateWithPreviousScene silenciosamente.");
}

if (source.includes("requestBody.continuityReferenceImageDataUrl = \"\";")) {
  throw new Error("El fallback no debe borrar silenciosamente el frame de continuidad.");
}

if (!source.includes("if (hasContinuity && (hasPortrait || hasReferences))")) {
  throw new Error("El fallback debe degradar primero referencias secundarias antes que la continuidad.");
}

console.log("Continuity fallback preserves relate regression OK.");
