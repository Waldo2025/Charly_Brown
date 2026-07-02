import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const legacyCollection = ["podcaster", "sessions", "payloads"].join("_");

if (!storeSource.includes('const sessionRef = deps.doc(deps.firestoreDb, "podcaster_sessions", key);')) {
  throw new Error("La carga completa de la sesion debe consultar podcaster_sessions.");
}

if (!backendSource.includes('app.get("/api/podcaster/sessions/get"')) {
  throw new Error("El backend debe exponer /api/podcaster/sessions/get para cargar la sesión activa completa.");
}

if (!storeSource.includes('/api/podcaster/sessions/get?sessionId=')) {
  throw new Error("loadSingleSessionFromCloud debe intentar primero el endpoint backend autenticado.");
}

if (source.includes(legacyCollection)) {
  throw new Error("podcaster.js ya no debe depender de la coleccion legacy duplicada.");
}

if (!storeSource.includes("function buildSessionFromPodcasterDoc(data = null, sessionId = \"\")")) {
  throw new Error("La carga completa debe mezclar data.session con campos top-level del documento como home.html.");
}

if (!backendSource.includes("function buildPodcasterSessionFromDocData(data = null, sessionId = \"\")")) {
  throw new Error("El backend debe mezclar data.session con campos top-level del documento para /sessions/get.");
}

if (!source.includes("async function loadCloudSessionDocumentDirect(sessionId)")) {
  throw new Error("El helper de carga directa debe reflejar la fuente unica de verdad.");
}

if (!storeSource.includes("function mergeCloudVsLocalSessions(cloudSessions = [], localSessions = [], deps = {})")) {
  throw new Error("La política de merge cloud/local debe vivir en el session store.");
}

if (!source.includes("const targetSession = getActiveSession() || nextSession;")
  || !source.includes("const mergedSession = mergeCloudSessionOverLocalCache(cloudSession, targetSession);")
  || !source.includes("Object.assign(targetSession,")) {
  throw new Error("setActiveSession debe completar la sesión activa vigente con fallback local después del await.");
}

if (!source.includes("const bootstrapResult = await sessionStore.bootstrapSessions(nextUid);")) {
  throw new Error("La selección de snapshot inicial debe pasar por bootstrapSessions.");
}

if (!source.includes("function getRequestedSessionIdFromUrl()")) {
  throw new Error("Podcaster debe leer sessionId de la URL enviada desde home.html.");
}

if (!source.includes("state.activeSessionId = requestedSessionId || lastActiveId;")) {
  throw new Error("El sessionId de la URL debe tener prioridad sobre la última sesión de localStorage.");
}

if (!source.includes("await setActiveSession(state.activeSessionId, { forceHydrate: Boolean(requestedSessionId) });")) {
  throw new Error("Abrir desde home.html debe forzar la hidratación completa de la sesión solicitada.");
}

console.log("Podcaster session source-of-truth is centralized in session store OK.");
