import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

if (!source.includes("function isAnalizarPdfSessionShape(data, sessionId)")) {
  throw new Error("Falta helper de shape para analizarPDF.");
}

if (!source.includes("match /analizarPDF/{sessionId}")) {
  throw new Error("Faltan reglas para la colección analizarPDF.");
}

if (!source.includes("request.resource.data.ownerId == resource.data.ownerId")) {
  throw new Error("Las reglas deben impedir cambiar ownerId en updates.");
}

console.log("Firestore rules analizarPDF contract OK.");
