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

const mockFooter = {
  style: { display: "" }
};

const mockPortraitStrip = {
  hidden: false,
  innerHTML: "existing-content",
  closest(selector) {
    if (selector === ".podcast-studio-footer") {
      return mockFooter;
    }
    return null;
  }
};

const context = {
  els: {
    podcastPortraitStrip: mockPortraitStrip
  },
  podcastRenderState: {
    portraitStructureKey: "old-key",
    portraitStructureRenderCount: 0
  },
  logPodcastRenderDebug() {},
  escapeHtml(str) {
    return str || "";
  },
  activeSession: null,
  getActiveSession() {
    return context.activeSession;
  },
  isCurrentModeVideo() {
    return false;
  }
};

vm.createContext(context);

// Extract dependencies
[
  "normalizeVideoContentType",
  "resolveVideoContentType",
  "getPanelModeCopy",
  "isEducationalVideoMode",
  "isVideoPodcastMode",
  "renderPodcastPortraitStrip"
].forEach((name) => {
  vm.runInContext(`${extractFunction(name)};`, context);
});

// Case 1: Video Podcast mode is false (audio podcast) -> Should hide footer and clear content
const audioSession = {
  videoContentType: "none"
};
context.activeSession = audioSession;

context.renderPodcastPortraitStrip(audioSession);

if (mockPortraitStrip.hidden !== true) {
  throw new Error("El strip de retratos debería estar oculto en modo podcast de audio.");
}
if (mockFooter.style.display !== "none") {
  throw new Error("El footer contenedor (.podcast-studio-footer) debería estar oculto en modo podcast de audio.");
}
if (mockPortraitStrip.innerHTML !== "") {
  throw new Error("El strip de retratos debería haberse vaciado.");
}
if (context.podcastRenderState.portraitStructureKey !== "") {
  throw new Error("La clave de estructura debería estar vacía.");
}

console.log("Test Case 1: Audio-only hides footer correctly OK.");

// Case 2: Video Podcast mode is true -> Should set display to "" and hidden to false (it would then proceed to render)
// (we will check the early check flow)
mockFooter.style.display = "none";
mockPortraitStrip.hidden = true;

const videoSession = {
  videoContentType: "videopodcast",
  script: {
    videoContentType: "videopodcast",
    rows: []
  }
};
context.activeSession = videoSession;

// Mock the rest of dependencies called if it doesn't early return
context.getSpeakerOptions = () => [];
context.getGlobalScenarioDeck = () => ({ items: [], activeId: null });
context.collectGlobalSpeakerDraft = () => ({});
context.getSpeakerVoiceMap = () => ({});
context.getSpeakerExpressionMap = () => ({});
context.getSpeakerNameMap = () => ({});
context.getSpeakerReferenceImageMap = () => ({});
context.getScenarioReferenceImageMap = () => ({});
context.buildPodcastPortraitStripStructureKey = () => "new-key";
context.syncPodcastPortraitStripActiveStates = () => {};

context.renderPodcastPortraitStrip(videoSession);

if (mockPortraitStrip.hidden !== false) {
  throw new Error("El strip de retratos debería estar visible en modo video podcast.");
}
if (mockFooter.style.display !== "") {
  throw new Error("El footer contenedor (.podcast-studio-footer) debería estar visible en modo video podcast.");
}

console.log("Test Case 2: Video podcast shows footer correctly OK.");
console.log("All portrait strip visibility test cases passed successfully!");
