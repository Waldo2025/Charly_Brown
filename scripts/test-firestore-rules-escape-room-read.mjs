import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

const matchBlock = source.match(/match \/escapeRoom\/\{sessionId\} \{([\s\S]*?)\n    \}/);

if (!matchBlock) {
  throw new Error("Faltan reglas para la colección escapeRoom.");
}

const block = matchBlock[1];

if (!block.includes("allow read: if isSignedIn();")) {
  throw new Error("Los escape rooms deben poder leerse por cualquier usuario autenticado.");
}

if (!block.includes("allow create: if isSignedIn() && isOwner(request.resource.data.ownerId);")) {
  throw new Error("La creación de escape rooms debe seguir limitada a su propietario.");
}

console.log("Firestore rules escape room read OK.");
