import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

if (!source.includes("function canReadPodcasterSessionData(data)")) {
  throw new Error("Falta helper para permisos de lectura de sesiones podcaster.");
}

if (!source.includes("match /podcaster_sessions_payloads/{sessionId}")) {
  throw new Error("Faltan reglas para podcaster_sessions_payloads.");
}

if (!source.includes("allow read: if canAccessPodcasterSessionById(sessionId);")) {
  throw new Error("El payload podcaster no permite lectura a usuarios autorizados.");
}

console.log("Firestore rules for podcaster payload access OK.");
