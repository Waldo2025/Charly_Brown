import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster-threads.js", import.meta.url), "utf8");
const context = {
  window: {},
  Date,
  Math,
  JSON,
  console
};
vm.createContext(context);
vm.runInContext(source, context, { filename: "podcaster-threads.js" });

const api = context.window.PodcasterThreads;
if (!api?.createNewThread || !api?.switchThread) {
  throw new Error("PodcasterThreads API no está disponible.");
}

const session = {
  id: "session-test",
  chat: [{ role: "user", content: "mensaje original" }],
  script: { rows: [{ id: "row-1", voiceOverText: "original" }] },
  prompt: "prompt original",
  videoConfig: { enabled: true },
  threads: [],
  activeThreadId: ""
};

api.createNewThread(session);

if (session.threads.length !== 2) {
  throw new Error(`Crear nuevo chat debe preservar Versión 1 y añadir Versión 2. Threads: ${session.threads.length}`);
}

const versionOne = session.threads.find((thread) => thread.name === "Versión 1");
const versionTwo = session.threads.find((thread) => thread.name === "Versión 2");

if (!versionOne || !versionTwo) {
  throw new Error("Deben existir Versión 1 y Versión 2 después de crear un nuevo chat.");
}

if (versionOne.chat?.[0]?.content !== "mensaje original"
  || versionOne.script?.rows?.[0]?.voiceOverText !== "original"
  || versionOne.prompt !== "prompt original") {
  throw new Error("Versión 1 fue sobrescrita al crear un nuevo chat.");
}

if (session.activeThreadId !== versionTwo.id
  || session.chat.length !== 0
  || session.script !== null
  || session.prompt !== "") {
  throw new Error("El nuevo chat debe quedar activo y vacío sin pisar la versión anterior.");
}

session.chat.push({ role: "assistant", content: "nuevo contenido" });
api.switchThread(session, versionOne.id);

if (session.chat?.[0]?.content !== "mensaje original") {
  throw new Error("Cambiar a Versión 1 debe restaurar su contenido original.");
}

api.switchThread(session, versionTwo.id);
if (session.chat?.[0]?.content !== "nuevo contenido") {
  throw new Error("Versión 2 debe conservar su contenido al alternar entre versiones.");
}

console.log("Podcaster thread version creation OK.");
