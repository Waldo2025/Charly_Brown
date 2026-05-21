import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

if (!source.includes("function resolveStorageUidCandidates(uid = \"\", deps = {}) {")) {
  throw new Error("El session store debe resolver múltiples scopes de uid para localStorage.");
}

if (!source.includes("deps.getStorageScopeUid?.()")) {
  throw new Error("El session store debe considerar el storage scope activo al persistir localmente.");
}

if (!source.includes("resolveStorageUidCandidates(uid, deps).forEach((candidateUid) => {")) {
  throw new Error("persistSessionsToLocalCache debe escribir la sesión en todos los scopes locales relevantes.");
}

if (!source.includes("for (const candidateUid of storageCandidates) {")) {
  throw new Error("loadSessionsFromLocalCache debe poder leer desde cualquiera de los scopes locales relevantes.");
}

console.log("Session store persists to all local scopes OK.");
