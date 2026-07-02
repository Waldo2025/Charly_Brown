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

const recoveredSession = {
  id: "session-recovered",
  chat: [{ role: "assistant", content: "contenido recuperado" }],
  script: { rows: [{ id: "row-recovered", voiceOverText: "recuperado" }] },
  prompt: "prompt recuperado",
  threads: [{
    id: "thread-empty",
    name: "Versión 1",
    chat: [],
    script: { rows: [] },
    prompt: "",
    createdAt: 1,
    updatedAt: 1
  }],
  activeThreadId: "thread-empty"
};

api.syncActiveThreadToSession(recoveredSession, { repairEmptyThreads: true });
if (recoveredSession.threads.length !== 1
  || recoveredSession.threads[0].id !== "thread-empty"
  || recoveredSession.threads[0].chat?.[0]?.content !== "contenido recuperado"
  || recoveredSession.threads[0].script?.rows?.[0]?.voiceOverText !== "recuperado") {
  throw new Error("Una Versión 1 vacía creada desde metadata debe repararse con el contenido hidratado.");
}

const emptyRootSession = {
  id: "session-empty-root",
  chat: [],
  script: { rows: [] },
  prompt: "",
  threads: [{
    id: "thread-full",
    name: "Versión 1",
    chat: [{ role: "assistant", content: "contenido dentro del thread" }],
    script: { rows: [{ id: "row-thread", voiceOverText: "fila dentro del thread" }] },
    prompt: "prompt dentro del thread",
    createdAt: 1,
    updatedAt: 1
  }],
  activeThreadId: "thread-full"
};

api.syncActiveThreadToSession(emptyRootSession);
if (emptyRootSession.chat?.[0]?.content !== "contenido dentro del thread"
  || emptyRootSession.script?.rows?.[0]?.voiceOverText !== "fila dentro del thread"
  || emptyRootSession.prompt !== "prompt dentro del thread") {
  throw new Error("Una sesión raíz vacía debe restaurarse desde la versión activa antes de renderizar.");
}

const emptyRootSessionWithRepair = {
  id: "session-empty-root-repair",
  chat: [],
  script: { rows: [] },
  prompt: "",
  threads: [{
    id: "thread-full-repair",
    name: "Versión 1",
    chat: [{ role: "assistant", content: "contenido a mantener" }],
    script: { rows: [{ id: "row-thread-repair", voiceOverText: "fila a mantener" }] },
    prompt: "prompt a mantener",
    createdAt: 1,
    updatedAt: 1
  }],
  activeThreadId: "thread-full-repair"
};

api.syncActiveThreadToSession(emptyRootSessionWithRepair, { repairEmptyThreads: true });
if (emptyRootSessionWithRepair.chat?.[0]?.content !== "contenido a mantener"
  || emptyRootSessionWithRepair.script?.rows?.[0]?.voiceOverText !== "fila a mantener"
  || emptyRootSessionWithRepair.prompt !== "prompt a mantener") {
  throw new Error("Una sesión con hilos con contenido no debe sobrescribirse al usar repairEmptyThreads: true.");
}

console.log("Podcaster thread version creation OK.");
