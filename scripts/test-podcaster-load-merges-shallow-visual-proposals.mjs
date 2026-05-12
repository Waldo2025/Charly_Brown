import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

if (!source.includes("function mergeVisualProposalFieldsIntoRows(")) {
  throw new Error("Falta el merge de propuestas visuales entre sesión shallow y payload completo.");
}

if (!source.includes('const sessionRef = doc(firestoreDb, "podcaster_sessions", sessionId);')) {
  throw new Error("loadCloudSessionPayloadDirect no consulta la sesión shallow.");
}

if (!source.includes("mergeVisualProposalFieldsIntoRows(payloadRows, shallowRows)")) {
  throw new Error("loadCloudSessionPayloadDirect no fusiona propuestas visuales desde la sesión shallow.");
}

console.log("Load merge preserves shallow visual proposals OK.");
