import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!source.includes("async function setActiveSession(sessionId, options = {})")) {
  throw new Error("No existe setActiveSession.");
}

if (!source.includes("mergeVisualProposalFieldsIntoRows(merged, fallback);")) {
  throw new Error("La lógica de fallback visual entre filas debe seguir existiendo.");
}

if (!/const resolvedRows = mergeRowsByUpdatedAt\(\s*mergeSessionRowsWithFallback\(cloudRows, localRows\),\s*localRows\s*\);/.test(storeSource)) {
  throw new Error("El merge cloud/local debe seguir pudiendo recomponer filas desde fallback local.");
}

if (!source.includes("if (options.forceHydrate === true || shouldHydrateSessionFromCloud(nextSession)) {")) {
  throw new Error("setActiveSession debe ir a cloud cuando la sesión es stub, caché vacía o viene solicitada por URL.");
}

if (!source.includes("const targetSession = getActiveSession() || nextSession;")) {
  throw new Error("setActiveSession debe re-leer la sesión activa después del await de cloud.");
}

if (!source.includes("mergeCloudSessionOverLocalCache(cloudSession, targetSession)")) {
  throw new Error("La hidratación cloud debe mezclarse con la sesión activa vigente, no con una referencia vieja.");
}

if (!source.includes("Object.assign(targetSession,")) {
  throw new Error("La sesión activa vigente debe recibir los datos hidratados.");
}

if (!source.includes("let activatedSession = nextSession;")
  || !source.includes("activatedSession = getActiveSession() || activatedSession || nextSession;")
  || !source.includes("normalizePodcastStudioUiState(activatedSession?.podcastStudioUiState || null, activatedSession)")
  || !source.includes("playbackController.sync(activatedSession, getPodcastVideoConfig(activatedSession))")) {
  throw new Error("setActiveSession debe restaurar UI y playback desde la sesión hidratada vigente.");
}

if (!source.includes("composerVideoTableMode: String(source.composerVideoTableMode || composerVideoTableMode || \"compose\").trim() === \"create\" ? \"create\" : \"compose\"")) {
  throw new Error("normalizePodcastStudioUiState debe conservar el modo Componer/Crear por sesión.");
}

if (!backendSource.includes("podcastStudioUiState: sessionUiState")
  || !backendSource.includes("videoContentType: sessionVideoContentType || null")) {
  throw new Error("El listado backend debe incluir metadatos de modo para clasificar stubs de video.");
}

console.log("setActiveSession keeps visual fallback while hydrating empty cloud cache OK.");
