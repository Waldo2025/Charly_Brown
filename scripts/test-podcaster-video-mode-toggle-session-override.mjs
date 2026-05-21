import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró ${name} en public/podcaster.js`);
  }
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) {
    throw new Error(`No se encontró el cuerpo de ${name}`);
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  composerVideoEnabled: false,
  activeSession: null,
  getActiveSession() {
    return context.activeSession;
  },
  isCurrentModeVideo() {
    return context.composerVideoEnabled;
  }
};

vm.createContext(context);
[
  "normalizeVideoContentType",
  "resolveVideoContentType",
  "getPanelModeCopy"
].forEach((name) => {
  vm.runInContext(`${extractFunction(name)};`, context);
});

const podcastSession = {
  videoContentType: "videopodcast",
  script: {
    videoContentType: "videopodcast",
    rows: [{ id: "row-1", speaker: "Host A", text: "Hola" }]
  }
};

context.activeSession = podcastSession;
context.composerVideoEnabled = true;

const panelCopy = context.getPanelModeCopy(podcastSession);
if (panelCopy.videoMode !== false || panelCopy.videoContentType !== "videopodcast") {
  throw new Error("Una sesión videopodcast no debe colapsar al modo creativo aunque haya video activo en el composer.");
}

context.composerVideoEnabled = false;
const podcastPanelCopy = context.getPanelModeCopy(podcastSession);
if (podcastPanelCopy.videoMode !== false || podcastPanelCopy.videoContentType !== "videopodcast") {
  throw new Error("Al desactivar el switch, una sesión videopodcast debe volver a renderizarse fuera del modo creativo.");
}

context.composerVideoEnabled = true;
const videoPodcastPanelCopy = context.getPanelModeCopy(podcastSession);
if (videoPodcastPanelCopy.videoMode !== false || videoPodcastPanelCopy.videoContentType !== "videopodcast") {
  throw new Error("Una sesión videopodcast debe conservarse como videopodcast y no colapsar al modo creativo.");
}

console.log("Podcaster video mode toggle session override OK.");
