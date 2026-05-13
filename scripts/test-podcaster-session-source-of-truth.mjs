import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");
const legacyCollection = ["podcaster", "sessions", "payloads"].join("_");

if (!source.includes('const sessionRef = doc(firestoreDb, "podcaster_sessions", sessionId);')) {
  throw new Error("La carga completa de la sesion debe consultar podcaster_sessions.");
}

if (source.includes(legacyCollection)) {
  throw new Error("podcaster.js ya no debe depender de la coleccion legacy duplicada.");
}

if (!source.includes('const sessionData = data?.session && typeof data.session === "object" ? data.session : data;')) {
  throw new Error("La carga completa debe tomar data.session como fuente unica de verdad.");
}

if (!source.includes("async function loadCloudSessionDocumentDirect(sessionId)")) {
  throw new Error("El helper de carga directa debe reflejar la fuente unica de verdad.");
}

if (!source.includes("function mergeCloudSessionOverLocalCache(cloudSession = null, localSession = null)")) {
  throw new Error("Debe existir un helper explícito para fusionar la nube sobre la caché local.");
}

if (!source.includes("const mergedSession = mergeCloudSessionOverLocalCache(cloudSession, nextSession);")) {
  throw new Error("setActiveSession debe hidratar la sesión con merge cloud-over-local para conservar fallback sin romper la fuente de verdad remota.");
}

console.log("Podcaster session source-of-truth OK.");
