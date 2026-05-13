import { readFileSync } from "node:fs";
import vm from "node:vm";

const homeSource = readFileSync(new URL("../public/home.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

function extractConst(source, name) {
  const match = source.match(new RegExp(`const ${name} = [^;]+;`));
  if (!match) throw new Error(`No se encontró la constante ${name}.`);
  return match[0];
}

function extractFunction(source, name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}.`);
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
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}.`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}.`);
}

function createContext() {
  const context = {
    console,
    buildApiUrl(path) {
      return `https://example.test${path}`;
    },
    hasAvailableApiBase() {
      return true;
    },
    deriveStoragePathFromMediaSource(downloadUrl, storagePath) {
      return String(storagePath || "").trim() || (String(downloadUrl || "").startsWith("gs://") ? String(downloadUrl || "").trim() : "");
    },
    isMarkedStaleProxyMediaUrl() {
      return false;
    },
    resolveStaleAwareProxyMediaUrl(downloadUrl, storagePath) {
      return storagePath
        ? `https://example.test/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`
        : String(downloadUrl || "").trim();
    },
    window: {
      location: {
        origin: "https://example.test"
      }
    },
    URL
  };
  vm.createContext(context);
  return context;
}

const homeContext = createContext();
[
  extractConst(homeSource, "HOME_TIMELINE_MIN_CLIP_MS"),
  "resolveStorageAudioUrl",
  "normalizeHomePanelMusicDuckingWhenGeminiPct",
  "normalizeHomePanelMusicMutedLoopIndexes",
  "normalizeHomePanelMusicLoopSettings",
  "normalizeHomePanelMusicTrack",
  "normalizeHomePanelMusicTrackList",
  "getHomePanelMusicUploadedTracks",
  "getHomePanelMusicTrackDurationSec",
  "buildHomeUploadedPanelMusicSegments"
].forEach((snippet) => {
  const code = snippet.startsWith("const ") ? snippet : extractFunction(homeSource, snippet);
  vm.runInContext(`${code};`, homeContext);
});

const podcasterContext = createContext();
[
  extractConst(podcasterSource, "MAX_LOCAL_MUSIC_DATA_URL_CHARS"),
  extractConst(podcasterSource, "STUDIO_TIMELINE_MIN_CLIP_MS"),
  "normalizePanelMusicMutedLoopIndexes",
  "normalizePanelMusicLoopSettings",
  "normalizePanelMusicTrack",
  "getPanelMusicLoopSetting",
  "getPanelMusicTrackDurationSec",
  "buildUploadedPanelMusicSegments"
].forEach((snippet) => {
  const code = snippet.startsWith("const ") ? snippet : extractFunction(podcasterSource, snippet);
  vm.runInContext(`${code};`, podcasterContext);
});

podcasterContext.nowIso = () => "2026-05-12T00:00:00.000Z";

const sharedTracks = [
  {
    slotLabel: "Audio 1",
    name: "Bed",
    downloadUrl: "https://cdn.example.test/bed.mp3",
    durationSec: 5,
    enabledInSession: true,
    trimInMs: 0,
    trimOutMs: 5000,
    segmentStartOverrides: [{ loopIndex: 0, startMs: 400 }]
  },
  {
    slotLabel: "Audio 2",
    name: "Accent",
    downloadUrl: "https://cdn.example.test/accent.mp3",
    durationSec: 4,
    enabledInSession: true,
    trimInMs: 0,
    trimOutMs: 4000
  }
];

const timelineEntries = [
  { rowId: "row-1", startMs: 0, endMs: 2500 },
  { rowId: "row-2", startMs: 2500, endMs: 5000 },
  { rowId: "row-3", startMs: 5000, endMs: 8000 }
];

homeContext.getHomePanelMusicUploadedTracks = () => sharedTracks;
const homeSegments = homeContext.buildHomeUploadedPanelMusicSegments({ id: "session-home" }, {
  config: { trackLibrary: { uploadedTracks: sharedTracks } },
  buildTimelineRuntimeEntries() {
    return timelineEntries;
  },
  getTimelineTotalDurationMs() {
    return 8000;
  }
});

podcasterContext.getPanelMusicUploadedTracks = () => sharedTracks;
podcasterContext.getEnabledPanelMusicUploadedTracks = () => sharedTracks;
podcasterContext.buildTimelineRuntimeEntries = () => timelineEntries;
podcasterContext.getTimelineTotalDurationMs = () => 8000;
podcasterContext.getActiveSession = () => ({ id: "session-podcaster" });
const podcasterSegments = podcasterContext.buildUploadedPanelMusicSegments({ id: "session-podcaster" });

const simplify = (segments = []) => segments.map((segment) => ({
  slotLabel: String(segment?.slotLabel || "").trim(),
  trackIndex: Number(segment?.trackIndex || 0),
  loopIndex: Number(segment?.loopIndex || 0),
  startMs: Number(segment?.startMs || 0),
  endMs: Number(segment?.endMs || 0),
  trimInMs: Number(segment?.trimInMs || 0),
  trimOutMs: Number(segment?.trimOutMs || 0)
}));

const homeJson = JSON.stringify(simplify(homeSegments));
const podcasterJson = JSON.stringify(simplify(podcasterSegments));

if (homeJson !== podcasterJson) {
  throw new Error(`Home debe reconstruir los mismos segmentos de fondo que Podcaster.\nHOME: ${homeJson}\nPODCASTER: ${podcasterJson}`);
}

console.log("Home panel music segment parity OK.");
