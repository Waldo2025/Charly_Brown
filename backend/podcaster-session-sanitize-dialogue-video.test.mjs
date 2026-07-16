import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeOnScreenTextTrackSettings } = require("../public/podcaster/podcaster-on-screen-text.js");

const source = readFileSync(new URL("./server.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  console,
  DEFAULT_PODCASTER_VIDEO_MODEL: "gemini-omni-flash-preview",
  PODCASTER_VIDEO_PROMPT_VERSION: "podcaster_video_v2",
  PODCASTER_VIDEO_MODEL_CANDIDATES: ["gemini-omni-flash-preview", "veo-3.1-generate-preview", "veo-3.1-lite-generate-preview"],
  disfluencyDefaults: {},
  clampText(value = "", max = 0) {
    const clean = String(value || "").trim();
    if (!max) return clean;
    return clean.slice(0, max);
  },
  clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  },
  normalizePersistedMediaReference({ downloadUrl = "", storagePath = "" } = {}) {
    return {
      downloadUrl: String(downloadUrl || "").trim(),
      storagePath: String(storagePath || "").trim()
    };
  },
  normalizeDialogueAudioWordTimings(value = []) {
    return Array.isArray(value) ? value : [];
  },
  sanitizeMontageExportReference(value = null) {
    return value && typeof value === "object" ? value : null;
  },
  normalizeInSceneText(value = "") {
    return String(value || "").trim().slice(0, 48);
  },
  normalizePodcasterVideoGenerator(value = "auto", model = "") {
    const clean = String(value || "").trim().toLowerCase();
    if (["auto", "omni", "veo"].includes(clean)) return clean;
    return String(model || "").startsWith("veo-") ? "veo" : "auto";
  },
  normalizePodcasterVideoQuality(value = "final") {
    return String(value || "").trim().toLowerCase() === "draft" ? "draft" : "final";
  },
  normalizeVideoModel(value = "") {
    return String(value || "").trim() || "gemini-omni-flash-preview";
  },
  normalizeDisfluency(value = {}) {
    return value && typeof value === "object" ? value : {};
  },
  normalizeOnScreenTextTrackSettings,
  rowIdSet: new Set(["row-1"]),
  scriptVideoMode: false,
  hosts: [],
  rows: [{ id: "row-1", text: "Hola" }]
};

vm.createContext(context);
vm.runInContext(`${extractFunction("sanitizePodcasterSession")};`, context);

test("sanitizePodcasterSession defaults missing dialogue video type to video", () => {
  const session = context.sanitizePodcasterSession({
    id: "session-1",
    title: "Sesion",
    script: {
      rows: [{ id: "row-1", text: "Hola" }]
    },
    dialogueVideoMap: {
      "row-1": {
        downloadUrl: "https://example.test/video.mp4",
        mimeType: "video/mp4"
      }
    }
  });

  assert.equal(session.dialogueVideoMap["row-1"].type, "video");
  assert.equal(session.dialogueVideoMap["row-1"].generator, "omni");
  assert.equal(session.dialogueVideoMap["row-1"].promptVersion, "podcaster_video_v2");
});

test("legacy overlay migration compares dialogue without case, accents or punctuation", () => {
  const session = context.sanitizePodcasterSession({
    id: "session-migration",
    script: {
      rows: [{
        id: "row-1",
        text: "¡HÓLA, MUNDO!",
        onScreenText: "hola mundo"
      }]
    }
  });

  assert.equal(session.script.rows[0].headlineText, "");
  assert.equal(session.script.rows[0].captionText, "hola mundo");
  assert.equal(session.script.rows[0].overlayMode, "captions");
  assert.equal(session.script.rows[0].textSource, "migrated");
});

test("cloud sanitizer preserves the canonical overlay style contract", () => {
  const sourceTrack = {
    fontFamily: "Sora",
    fontVariant: "bold-italic",
    fontWeight: "bold",
    fontStyle: "italic",
    strokeEnabled: false,
    strokeWidthPx: 3.25,
    shadowEnabled: true,
    shadowSizePx: 9,
    shadowBlurPx: 17,
    shadowOffsetYPx: 6,
    bgPreset: "glass",
    bgOpacity: 0.64,
    overlayYPct: 0.79
  };
  const session = context.sanitizePodcasterSession({
    id: "session-style",
    script: { rows: [{ id: "row-1", text: "Hola" }] },
    podcastVideoConfig: { onScreenTextTrack: sourceTrack }
  });
  const expected = normalizeOnScreenTextTrackSettings(sourceTrack);
  assert.deepEqual(
    JSON.parse(JSON.stringify(session.podcastVideoConfig.onScreenTextTrack)),
    JSON.parse(JSON.stringify(expected))
  );

  const legacy = context.sanitizePodcasterSession({
    id: "session-style-legacy",
    script: { rows: [{ id: "row-1", text: "Hola" }] },
    podcastVideoConfig: { onScreenTextTrack: {} }
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(legacy.podcastVideoConfig.onScreenTextTrack)),
    JSON.parse(JSON.stringify(normalizeOnScreenTextTrackSettings({})))
  );
});

test("sanitizePodcasterSession preserves modern provider and text metadata", () => {
  const session = context.sanitizePodcasterSession({
    id: "session-2",
    script: {
      rows: [{
        id: "row-1",
        text: "Narración literal",
        headlineText: "IDEA CENTRAL",
        captionText: "Narración literal",
        inSceneText: "CHARLY PODCAST",
        overlayMode: "both",
        textSource: "manual"
      }]
    },
    podcastVideoConfig: {
      videoGenerator: "auto",
      videoModel: "gemini-omni-flash-preview",
      videoQuality: "final"
    },
    dialogueVideoMap: {
      "row-1": {
        downloadUrl: "https://example.test/video.mp4",
        generator: "omni",
        provider: "gemini",
        model: "gemini-omni-flash-preview",
        quality: "final",
        textPolicy: "in_scene",
        aspectRatio: "9:16",
        resolution: "",
        interactionId: "v1_interaction",
        promptVersion: "podcaster_video_v2",
        promptHash: "abc123",
        requestedDurationSec: 6,
        durationSec: 8,
        headlineText: "IDEA CENTRAL",
        captionText: "Narración literal",
        inSceneText: "CHARLY PODCAST",
        overlayMode: "both",
        textSource: "manual"
      }
    }
  });

  const row = session.script.rows[0];
  assert.equal(row.headlineText, "IDEA CENTRAL");
  assert.equal(row.captionText, "Narración literal");
  assert.equal(row.inSceneText, "CHARLY PODCAST");
  assert.equal(row.overlayMode, "both");
  assert.equal(row.textSource, "manual");

  const video = session.dialogueVideoMap["row-1"];
  assert.equal(video.generator, "omni");
  assert.equal(video.textPolicy, "in_scene");
  assert.equal(video.aspectRatio, "9:16");
  assert.equal(video.interactionId, "v1_interaction");
  assert.equal(video.promptHash, "abc123");
  assert.equal(video.requestedDurationSec, 6);
  assert.equal(video.inSceneText, "CHARLY PODCAST");
  assert.equal(session.podcastVideoConfig.cheapVideoMode, false);
});

test("legacy onScreenText identical to dialogue migrates to captions without inventing a headline", () => {
  const session = context.sanitizePodcasterSession({
    id: "session-3",
    script: {
      rows: [{ id: "row-1", text: "Texto literal", onScreenText: "Texto literal" }]
    }
  });

  const row = session.script.rows[0];
  assert.equal(row.headlineText, "");
  assert.equal(row.captionText, "Texto literal");
  assert.equal(row.overlayMode, "captions");
  assert.equal(row.textSource, "migrated");
});

test("explicitly empty canonical text fields do not revive a legacy onScreenText alias", () => {
  const session = context.sanitizePodcasterSession({
    id: "session-4",
    script: {
      rows: [{
        id: "row-1",
        text: "Diálogo literal",
        headlineText: "",
        captionText: "",
        onScreenText: "TEXTO LEGACY"
      }]
    }
  });

  const row = session.script.rows[0];
  assert.equal(row.headlineText, "");
  assert.equal(row.captionText, "");
  assert.equal(row.onScreenText, "");
  assert.equal(row.overlayMode, "none");
  assert.equal(row.textSource, "generated");
});

test("automatic video routing survives a backend session roundtrip", () => {
  const session = context.sanitizePodcasterSession({
    id: "session-5",
    script: { rows: [{ id: "row-1", text: "Hola" }] },
    podcastVideoConfig: {
      videoRoutingVersion: 2,
      videoGenerator: "auto",
      videoModel: "auto",
      videoQuality: "final"
    }
  });

  assert.equal(session.podcastVideoConfig.videoRoutingVersion, 2);
  assert.equal(session.podcastVideoConfig.videoGenerator, "auto");
  assert.equal(session.podcastVideoConfig.videoModel, "auto");
  assert.equal(session.podcastVideoConfig.videoQuality, "final");
});

test("legacy explicit Veo model infers Veo routing during migration", () => {
  const session = context.sanitizePodcasterSession({
    id: "session-6",
    script: { rows: [{ id: "row-1", text: "Hola" }] },
    podcastVideoConfig: {
      videoModel: "veo-3.1-fast-generate-preview",
      videoQuality: "final"
    }
  });

  assert.equal(session.podcastVideoConfig.videoRoutingVersion, 2);
  assert.equal(session.podcastVideoConfig.videoGenerator, "veo");
  assert.equal(session.podcastVideoConfig.videoModel, "veo-3.1-fast-generate-preview");
});
