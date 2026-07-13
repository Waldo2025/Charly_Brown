import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

if (!source.includes("function isAnalizarPdfSessionShape(data, sessionId)")) {
  throw new Error("Falta helper de shape para analizarPDF.");
}

if (!source.includes("match /analizarPDF/{sessionId}")) {
  throw new Error("Faltan reglas para la colección analizarPDF.");
}

if (!source.includes("match /analizarPDF/{sessionId}/analysisResults/{resultId}")) {
  throw new Error("Faltan reglas para los documentos laterales analysisResults de analizarPDF.");
}

if (!source.includes("match /analizarPDF/{sessionId}/revisions/{revisionId}")) {
  throw new Error("Faltan reglas para la subcolección revisions de analizarPDF.");
}

if (!source.includes("match /analizarPDF/{sessionId}/analysisResults/{resultId}/chunks/{chunkId}")) {
  throw new Error("Faltan reglas para chunks de resultados de analizarPDF.");
}

if (!source.includes("allow write: if false;")) {
  throw new Error("Las reglas deben impedir escritura directa de clientes en resultados/chunks de análisis.");
}

if (!source.includes("request.resource.data.ownerId == resource.data.ownerId")) {
  throw new Error("Las reglas deben impedir cambiar ownerId en updates.");
}

console.log("Firestore rules analizarPDF contract OK.");
