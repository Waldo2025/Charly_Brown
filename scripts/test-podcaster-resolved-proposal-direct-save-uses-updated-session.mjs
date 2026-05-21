import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const store = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");

if (!source.includes("const updatedSession = upsertActiveSession((current) => {")) {
  throw new Error("updateRowProposalState debe capturar la sesión actualizada antes de persistir.");
}

if (!source.includes('await sessionStore.saveManual(updatedSession.id, { render: false, silent: true });')) {
  throw new Error("updateRowProposalState debe delegar el guardado de la sesión actualizada al session store.");
}

if (!source.includes("renderPodcastVideoTimeline(updatedSession, { force: true });")) {
  throw new Error("La UI del timeline debe refrescarse con la sesión actualizada.");
}

if (!store.includes("async function saveSessionDirectToCloud(payload = null, deps = {}) {")) {
  throw new Error("El fallback directo a Firestore debe vivir en podcaster-session-store.js.");
}

console.log("Resolved proposal save uses session store OK.");
