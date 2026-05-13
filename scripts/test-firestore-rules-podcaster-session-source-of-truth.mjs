import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const legacyCollection = ["podcaster", "sessions", "payloads"].join("_");

if (!source.includes("function canReadPodcasterSessionData(data)")) {
  throw new Error("Falta helper para permisos de lectura de sesiones podcaster.");
}

if (source.includes(`match /${legacyCollection}/{sessionId}`)) {
  throw new Error("Las reglas ya no deben exponer la coleccion legacy duplicada.");
}

if (!source.includes("match /podcaster_sessions/{sessionId}")) {
  throw new Error("Deben mantenerse reglas para podcaster_sessions.");
}

console.log("Firestore rules single source of truth OK.");
