import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!backendSource.includes("const relateWithPreviousScene = req.body?.relateWithPreviousScene === true;")) {
  throw new Error("No se encontró la lectura de relateWithPreviousScene en el backend.");
}

if (backendSource.includes("req.body.relateWithPreviousScene = false;")) {
  throw new Error("El backend no debe desactivar relateWithPreviousScene silenciosamente.");
}

if (backendSource.includes("req.body.continuityReferenceImageDataUrl = \"\";")) {
  throw new Error("El backend no debe borrar silenciosamente el frame de continuidad.");
}

if (!backendSource.includes("requestVariants.push") || !backendSource.includes("continuityReferenceImage")) {
  throw new Error("El backend debe construir las variantes de request incluyendo continuidad.");
}

console.log("Continuity fallback preserves relate regression OK.");
