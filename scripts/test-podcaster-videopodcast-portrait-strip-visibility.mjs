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
  hidden: false,
  classList: {
    values: new Set(["is-footer-collapsed"]),
    contains(name) {
      return this.values.has(name);
    }
  },
  style: {
    display: "none",
    removeProperty(name) {
      if (name === "display") this.display = "";
    }
  }
};

const mockPortraitStrip = {
  hidden: false,
  innerHTML: "existing-content",
  closest(selector) {
    if (selector === ".snoopy-portrait-dock") {
      return mockFooter;
    }
    return null;
  }
};

const context = {
  els: {
    podcastPortraitStrip: mockPortraitStrip
  },
  currentModeVideo: false,
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
    return context.currentModeVideo;
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
  "getPodcastPortraitStripHosts",
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
if (mockFooter.hidden !== true) {
  throw new Error("El dock de Retratos debería tener hidden en modo podcast de audio.");
}
if (mockFooter.style.display !== "") {
  throw new Error("El dock debería eliminar cualquier display inline heredado.");
}
if (mockPortraitStrip.innerHTML !== "") {
  throw new Error("El strip de retratos debería haberse vaciado.");
}
if (context.podcastRenderState.portraitStructureKey !== "") {
  throw new Error("La clave de estructura debería estar vacía.");
}

console.log("Test Case 1: Audio-only hides footer correctly OK.");

// Case 2: Video Podcast mode in the podcast composer -> visible and rendered.
mockFooter.style.display = "none";
mockFooter.hidden = true;
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
context.getSessionRows = () => [];
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
if (mockFooter.hidden !== false) {
  throw new Error("El dock de Retratos debería estar visible en modo video podcast.");
}
if (mockFooter.style.display !== "") {
  throw new Error("El dock debería limpiar el display inline al volver a video podcast.");
}

console.log("Test Case 2: Video podcast shows footer correctly OK.");

// Case 3: The video-active switch always wins, even during a transient persisted videopodcast state.
context.currentModeVideo = true;
mockPortraitStrip.innerHTML = "video-podcast-content";
context.renderPodcastPortraitStrip(videoSession);

if (mockFooter.hidden !== true || mockPortraitStrip.hidden !== true) {
  throw new Error("Retratos debe permanecer oculto cuando Video activo está encendido.");
}
if (mockPortraitStrip.innerHTML !== "") {
  throw new Error("Video activo debería vaciar el contenido del dock oculto.");
}
if (!mockFooter.classList.contains("is-footer-collapsed")) {
  throw new Error("Ocultar por modo no debe borrar la preferencia manual de colapso.");
}

console.log("Test Case 3: Active video hides a persisted videopodcast dock correctly OK.");

// Case 4: Returning to podcast-with-video restores the dock without changing collapse preference.
context.currentModeVideo = false;
context.renderPodcastPortraitStrip(videoSession);

if (mockFooter.hidden !== false || mockPortraitStrip.hidden !== false) {
  throw new Error("Retratos debería reaparecer al volver a Podcast con video.");
}
if (!mockFooter.classList.contains("is-footer-collapsed")) {
  throw new Error("La preferencia is-footer-collapsed debe conservarse al volver.");
}

console.log("Test Case 4: Returning to video podcast preserves collapse preference OK.");
console.log("All portrait strip visibility test cases passed successfully!");
