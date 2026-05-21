import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");

function extractConst(name) {
  const match = source.match(new RegExp(`const ${name} = [^;]+;`));
  if (!match) {
    throw new Error(`No se encontró la constante ${name} en public/js/home.js`);
  }
  return match[0];
}

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró ${name} en public/js/home.js`);
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

[
  extractConst("HOME_TIMELINE_MIN_CLIP_MS"),
  "resolveStorageAudioUrl",
  "normalizeHomePanelMusicDuckingWhenGeminiPct",
  "normalizeHomePanelMusicMutedLoopIndexes",
  "normalizeHomePanelMusicLoopSettings",
  "normalizeHomePanelMusicTrack",
  "normalizeHomePanelMusicTrackList",
  "resolveHomePanelMusicTrackKind",
  "getHomePanelMusicUploadedTracks",
  "getHomePanelMusicTrackDurationSec",
  "resolveHomePanelMusicTrackByKind",
  "normalizeHomePanelMusicSourceItems",
  "buildHomeUploadedPanelMusicSegments",
  "buildHomePanelMontageMusicConfig"
].forEach((snippet) => {
  const code = snippet.startsWith("const ") ? snippet : extractFunction(snippet);
  vm.runInContext(`${code};`, context);
});

const session = {
  id: "session-audio",
  panelMusicConfig: {
    sourceType: "track",
    selectedTrackKind: "uploaded",
    volume: 22,
    montageVolume: 88,
    duckingWhenGeminiPct: 55,
    stabilize: true,
    trackLibrary: {
      uploadedTracks: [
        {
          slotLabel: "Audio 1",
          name: "Intro",
          downloadUrl: "https://cdn.example.test/audio-1.mp3",
          durationSec: 4,
          montageVolume: 77,
          duckingWhenGeminiPct: 52,
          enabledInSession: true,
          trimInMs: 0,
          trimOutMs: 4000
        },
        {
          slotLabel: "Audio 2",
          name: "Bridge",
          storagePath: "gs://bucket/audio-2.mp3",
          durationSec: 4,
          montageVolume: 63,
          duckingWhenGeminiPct: 48,
          enabledInSession: true,
          trimInMs: 0,
          trimOutMs: 4000
        }
      ]
    },
    track: {
      slotLabel: "Audio 1",
      name: "Intro",
      downloadUrl: "https://cdn.example.test/audio-1.mp3",
      durationSec: 4,
      montageVolume: 77,
      duckingWhenGeminiPct: 52
    }
  }
};

const cfg = context.buildHomePanelMontageMusicConfig(session, {
  buildTimelineRuntimeEntries() {
    return [
      { rowId: "row-1", startMs: 0, endMs: 3000 },
      { rowId: "row-2", startMs: 3000, endMs: 7000 }
    ];
  },
  getTimelineTotalDurationMs() {
    return 7000;
  },
  resolveStorageAudioUrl: context.resolveStorageAudioUrl
});

if (cfg.volume !== 88) {
  throw new Error(`La mezcla de montaje en home debe usar montageVolume como volumen base. Recibido: ${cfg.volume}`);
}

if (!Array.isArray(cfg.sourceItems) || cfg.sourceItems.length !== 2) {
  throw new Error("Home debe reconstruir sourceItems de tracks subidos cuando no vienen persistidos.");
}

if (cfg.sourceItems[0].volume !== 77 || cfg.sourceItems[0].duckingWhenGeminiPct !== 52) {
  throw new Error("Home debe respetar overrides de volumen y ducking del track subido activo.");
}

if (!String(cfg.sourceItems[1].sourceUrl || "").includes("/api/assets/proxy-media?storagePath=")) {
  throw new Error("Home debe resolver storagePath a proxy-media para segmentos reconstruidos.");
}

const sceneBackgroundFactor = 1.25;
const firstItem = cfg.sourceItems[0];
const finalVolumeWhenGeminiSpeaks = (firstItem.volume / 100) * (firstItem.duckingWhenGeminiPct / 100) * sceneBackgroundFactor;
if (Math.abs(finalVolumeWhenGeminiSpeaks - 0.5005) > 0.0001) {
  throw new Error(`El volumen final esperado con Gemini activo no coincide. Recibido: ${finalVolumeWhenGeminiSpeaks}`);
}

const singleTrackSession = {
  id: "session-single-track",
  panelMusicConfig: {
    sourceType: "track",
    selectedTrackKind: "uploaded",
    volume: 18,
    montageVolume: 90,
    duckingWhenGeminiPct: 60,
    stabilize: true,
    trackLibrary: {
      uploadedTracks: [
        {
          slotLabel: "Audio 1",
          name: "Bed",
          downloadUrl: "https://cdn.example.test/bed.mp3",
          durationSec: 8,
          montageVolume: 72,
          duckingWhenGeminiPct: 58,
          enabledInSession: true,
          trimInMs: 0,
          trimOutMs: 8000
        }
      ]
    },
    track: {
      slotLabel: "Audio 1",
      name: "Bed",
      downloadUrl: "https://cdn.example.test/bed.mp3",
      durationSec: 8,
      montageVolume: 72,
      duckingWhenGeminiPct: 58
    }
  }
};

const singleTrackCfg = context.buildHomePanelMontageMusicConfig(singleTrackSession, {
  buildTimelineRuntimeEntries() {
    return [
      { rowId: "row-1", startMs: 0, endMs: 2500 },
      { rowId: "row-2", startMs: 2500, endMs: 5000 },
      { rowId: "row-3", startMs: 5000, endMs: 7500 }
    ];
  },
  getTimelineTotalDurationMs() {
    return 7500;
  },
  resolveStorageAudioUrl: context.resolveStorageAudioUrl
});

if (!Array.isArray(singleTrackCfg.sourceItems) || singleTrackCfg.sourceItems.length !== 1) {
  throw new Error("Home no debe partir un solo track subido en un segmento por escena cuando Studio lo agrupa de forma continua.");
}

if (singleTrackCfg.sourceItems[0].startOffsetMs !== 0 || singleTrackCfg.sourceItems[0].endOffsetMs !== 7500) {
  throw new Error(`Home debe reconstruir un segmento continuo para el single-track. Recibido: ${singleTrackCfg.sourceItems[0].startOffsetMs}-${singleTrackCfg.sourceItems[0].endOffsetMs}`);
}

console.log("Home panel music playback config OK.");
