import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

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
  DEFAULT_PODCASTER_VIDEO_MODEL: "veo-3.1-generate-preview",
  PODCASTER_VIDEO_MODEL_CANDIDATES: ["veo-3.1-generate-preview", "veo-3.1-lite-generate-preview"],
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
  normalizeDisfluency(value = {}) {
    return value && typeof value === "object" ? value : {};
  },
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
});
