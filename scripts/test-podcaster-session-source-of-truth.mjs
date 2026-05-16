import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");
const legacyCollection = ["podcaster", "sessions", "payloads"].join("_");

if (!storeSource.includes('const sessionRef = deps.doc(deps.firestoreDb, "podcaster_sessions", key);')) {
  throw new Error("La carga completa de la sesion debe consultar podcaster_sessions.");
}

if (source.includes(legacyCollection)) {
  throw new Error("podcaster.js ya no debe depender de la coleccion legacy duplicada.");
}

if (!storeSource.includes('const sessionData = data?.session && typeof data.session === "object" ? data.session : data;')) {
  throw new Error("La carga completa debe tomar data.session como fuente unica de verdad.");
}

if (!source.includes("async function loadCloudSessionDocumentDirect(sessionId)")) {
  throw new Error("El helper de carga directa debe reflejar la fuente unica de verdad.");
}

if (!storeSource.includes("function mergeCloudVsLocalSessions(cloudSessions = [], localSessions = [], deps = {})")) {
  throw new Error("La política de merge cloud/local debe vivir en el session store.");
}

if (!source.includes("const mergedSession = mergeCloudSessionOverLocalCache(cloudSession, nextSession);")) {
  throw new Error("setActiveSession debe seguir pudiendo completar una sesión stub con fallback local.");
}

if (!source.includes("const bootstrapResult = await sessionStore.bootstrapSessions(nextUid);")) {
  throw new Error("La selección de snapshot inicial debe pasar por bootstrapSessions.");
}

console.log("Podcaster session source-of-truth is centralized in session store OK.");
