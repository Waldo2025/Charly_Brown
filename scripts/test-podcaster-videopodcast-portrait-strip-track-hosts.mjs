import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró ${name} en public/podcaster/podcaster.js`);
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
  VOICES: ["Host A", "Host B", "Narrador"],
  DEFAULT_HOSTS: ["Host A", "Host B"],
  EXPRESSIONS: ["Neutral"],
  podcastVideoState: {
    activeSpeaker: ""
  },
  podcastRenderState: {
    portraitStructureKey: "",
    portraitStructureRenderCount: 0
  },
  els: {
    podcastPortraitStrip: {
      hidden: true,
      innerHTML: "",
      childElementCount: 0,
      closest() {
        return { style: { display: "" } };
      }
    }
  },
  logPodcastRenderDebug() {},
  escapeHtml(value) {
    return String(value ?? "");
  },
  getActiveSession() {
    return context.activeSession;
  },
  getSessionRows(session = null) {
    const activeSession = session || context.activeSession;
    return Array.isArray(activeSession?.script?.rows) ? activeSession.script.rows : [];
  },
  isCurrentModeVideo() {
    return false;
  },
  resolveGeminiLiveVoice() {
    return "Aoede";
  },
  GEMINI_LIVE_VOICE_OPTIONS: ["Aoede"],
  getGlobalScenarioDeck() {
    return { items: [], activeId: null };
  },
  collectGlobalSpeakerDraft() {
    return null;
  },
  getSpeakerVoiceMap() {
    return {};
  },
  getSpeakerExpressionMap() {
    return {};
  },
  getSpeakerNameMap() {
    return {};
  },
  getSpeakerReferenceImageMap() {
    return {};
  },
  getScenarioReferenceImageMap() {
    return {};
  },
  resolvePortraitForSpeaker() {
    return null;
  },
  resolvePodcastPortraitUrl() {
    return "";
  },
  resolveSpeakerDisplayName(speaker) {
    return String(speaker || "").trim() || "Host";
  },
  resolveSpeakerVoiceName(speaker) {
    return String(speaker || "").trim() || "Host A";
  },
  resolveAgentVoiceProfile() {
    return { genderGroup: "" };
  },
  normalizeVoiceGenderGroup(value = "") {
    return String(value || "").trim().toLowerCase();
  },
  buildScenarioPreviewDataUrl(title = "", prompt = "") {
    return `preview:${title}:${prompt}`;
  },
  syncPodcastPortraitStripActiveStates() {},
  buildPodcastPortraitStripStructureKey() {
    return "track-hosts";
  }
};

vm.createContext(context);

[
  "normalizeVideoContentType",
  "resolveVideoContentType",
  "getPanelModeCopy",
  "isEducationalVideoMode",
  "isVideoPodcastMode",
  "normalizeLiveVoiceName",
  "getSpeakerOptions",
  "getPodcastPortraitStripHosts",
  "renderPodcastPortraitStrip"
].forEach((name) => {
  vm.runInContext(`${extractFunction(name)};`, context);
});

context.activeSession = {
  videoContentType: "videopodcast",
  script: {
    videoContentType: "videopodcast",
    hosts: ["Narrador"],
    rows: [
      { id: "row-1", speaker: "Host A" },
      { id: "row-2", speaker: "Host B" }
    ]
  }
};

context.renderPodcastPortraitStrip(context.activeSession, { force: true });

const html = String(context.els.podcastPortraitStrip.innerHTML || "");

if (!html.includes('data-speaker="Host A"') || !html.includes('data-speaker="Host B"')) {
  throw new Error("El footer de videopodcast debe renderizar cards para los locutores reales de las filas/tracks.");
}

if (html.includes('data-speaker="Narrador"')) {
  throw new Error("El footer de videopodcast no debe degradarse a una card neutral/Narrador cuando las filas ya usan otros locutores.");
}

console.log("Podcaster videopodcast portrait strip track hosts OK.");
