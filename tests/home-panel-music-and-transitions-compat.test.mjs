import test from "node:test";
import assert from "node:assert/strict";
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

function loadHomeFns() {
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
  return context;
}

test("home panel music preserves fadeInMs and fadeOutMs from persisted sourceItems and loop settings", () => {
  const context = loadHomeFns();
  const session = {
    id: "session-home-fadeout",
    panelMusicConfig: {
      sourceType: "track",
      selectedTrackKind: "uploaded",
      montageVolume: 88,
      trackLibrary: {
        uploadedTracks: [{
          slotLabel: "Audio 1",
          name: "Bed",
          downloadUrl: "https://cdn.example.test/bed.mp3",
          durationSec: 8,
          enabledInSession: true,
          trimInMs: 0,
          trimOutMs: 8000,
          loopSettings: [
            { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }
          ]
        }]
      },
      track: {
        slotLabel: "Audio 1",
        name: "Bed",
        downloadUrl: "https://cdn.example.test/bed.mp3",
        durationSec: 8,
        trimInMs: 0,
        trimOutMs: 8000,
        loopSettings: [
          { loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }
        ]
      },
      sourceItems: [{
        slotLabel: "Audio 1",
        sourceUrl: "https://cdn.example.test/bed.mp3",
        startOffsetMs: 0,
        endOffsetMs: 3200,
        trimInMs: 0,
        trimOutMs: 3200,
        durationSec: 8,
        trackIndex: 0,
        loopIndex: 0,
        fadeInMs: 500,
        fadeOutMs: 900
      }]
    }
  };

  const cfg = context.buildHomePanelMontageMusicConfig(session, {
    buildTimelineRuntimeEntries() {
      return [{ rowId: "row-1", startMs: 0, endMs: 3200 }];
    },
    getTimelineTotalDurationMs() {
      return 3200;
    },
    resolveStorageAudioUrl: context.resolveStorageAudioUrl
  });

  assert.equal(cfg.sourceItems[0].fadeInMs, 500);
  assert.equal(cfg.sourceItems[0].fadeOutMs, 900);
  assert.equal(cfg.loopSettings[0].fadeInMs, 500);
  assert.equal(cfg.loopSettings[0].fadeOutMs, 900);
});

test("home rebuilds uploaded track segments with fadeInMs and fadeOutMs from loopSettings", () => {
  const context = loadHomeFns();
  const session = {
    id: "session-home-uploaded-fadeout",
    panelMusicConfig: {
      sourceType: "track",
      selectedTrackKind: "uploaded",
      trackLibrary: {
        uploadedTracks: [{
          slotLabel: "Audio 1",
          name: "Bed",
          downloadUrl: "https://cdn.example.test/bed.mp3",
          durationSec: 8,
          enabledInSession: true,
          trimInMs: 0,
          trimOutMs: 8000,
          loopSettings: [
            { loopIndex: 0, trimInMs: 0, trimOutMs: 2500, fadeInMs: 400, fadeOutMs: 700 }
          ]
        }]
      },
      track: {
        slotLabel: "Audio 1",
        name: "Bed",
        downloadUrl: "https://cdn.example.test/bed.mp3",
        durationSec: 8,
        trimInMs: 0,
        trimOutMs: 8000,
        loopSettings: [
          { loopIndex: 0, trimInMs: 0, trimOutMs: 2500, fadeInMs: 400, fadeOutMs: 700 }
        ]
      }
    }
  };

  const cfg = context.buildHomePanelMontageMusicConfig(session, {
    buildTimelineRuntimeEntries() {
      return [{ rowId: "row-1", startMs: 0, endMs: 2500 }];
    },
    getTimelineTotalDurationMs() {
      return 2500;
    },
    resolveStorageAudioUrl: context.resolveStorageAudioUrl
  });

  assert.equal(cfg.sourceItems[0].fadeInMs, 400);
  assert.equal(cfg.sourceItems[0].fadeOutMs, 700);
});

test("home playback deps wire transition helpers for overlap playback", () => {
  assert.match(source, /import\s+\{\s*getTransitionForEdge\s*\}\s+from\s+"..\/podcaster\/podcaster-scene-transition\.js";/);
  assert.match(source, /getTransitionForEdge:\s*\(session,\s*fromRowId,\s*toRowId\)\s*=>\s*getTransitionForEdge\(session,\s*fromRowId,\s*toRowId\)/);
  assert.match(source, /resolveTimelineRuntimeOverlapPairAtMs:\s*\(session,\s*currentMs,\s*runtimeEntries\)\s*=>\s*\{/);
});
