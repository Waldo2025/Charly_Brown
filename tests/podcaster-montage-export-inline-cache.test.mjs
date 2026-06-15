import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

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

function extractMaybeAsyncFunction(name) {
  const isAsync = new RegExp(`async\\s+function\\s+${name}\\b`).test(source);
  return `${isAsync ? "async " : ""}${extractFunction(name)}`;
}

const context = {
  console,
  Buffer,
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  window: {
    location: {
      origin: "https://charly-brown.web.app"
    }
  },
  caches: {
    async match(request) {
      const url = String(request || "");
      if (url.includes("huge.mp3")) {
        return {
          headers: { get: () => "audio/mpeg" },
          blob: async () => ({
            size: 2_500_001,
            arrayBuffer: async () => new Uint8Array([1]).buffer
          })
        };
      }
      if (url.includes("video.mp4")) {
        return {
          headers: { get: () => "video/mp4" },
          blob: async () => ({
            size: 12,
            arrayBuffer: async () => Uint8Array.from(Buffer.from("cached-video")).buffer
          })
        };
      }
      if (url.includes("audio.mp3")) {
        return {
          headers: { get: () => "audio/mpeg" },
          blob: async () => ({
            size: 11,
            arrayBuffer: async () => Uint8Array.from(Buffer.from("cached-audio")).buffer
          })
        };
      }
      return null;
    }
  }
};

vm.createContext(context);
[
  "const MONTAGE_EXPORT_INLINE_MEDIA_MAX_BYTES = 2500000;",
  "const MONTAGE_EXPORT_INLINE_MEDIA_MAX_TOTAL_BYTES = 6000000;",
  extractFunction("estimateMontageDataUrlBytes"),
  extractFunction("buildMontageMediaCacheCandidates"),
  extractMaybeAsyncFunction("blobToDataUrl"),
  extractMaybeAsyncFunction("resolveCachedMontageMediaDataUrl"),
  extractMaybeAsyncFunction("maybeInlineMontageMediaAsset"),
  extractMaybeAsyncFunction("inlineMontageExportPayloadMedia")
].forEach((snippet) => {
  vm.runInContext(`${snippet};`, context);
});

test("montage export inlines cached media with a total size budget", async () => {
  const payload = {
    entries: [
      {
        rowId: "row-1",
        video: {
          downloadUrl: "https://example.com/video.mp4",
          mimeType: "video/mp4"
        },
        audio: {
          downloadUrl: "https://example.com/audio.mp3",
          mimeType: "audio/mpeg"
        }
      }
    ],
    backgroundMusic: {
      downloadUrl: "https://example.com/audio.mp3",
      mimeType: "audio/mpeg"
    },
    dialogueAudioMap: {
      "row-1": {
        downloadUrl: "https://example.com/audio.mp3",
        mimeType: "audio/mpeg"
      }
    },
    audioTimeline: {
      enabled: true,
      geminiSegments: [
        {
          rowId: "row-1",
          downloadUrl: "https://example.com/audio.mp3",
          mimeType: "audio/mpeg"
        }
      ],
      backgroundSegments: [
        {
          rowId: "bg-1",
          downloadUrl: "https://example.com/huge.mp3",
          mimeType: "audio/mpeg"
        }
      ]
    }
  };

  await context.inlineMontageExportPayloadMedia(payload);

  assert.match(String(payload.entries[0].video.dataUrl || ""), /^data:video\/mp4;base64,/);
  assert.match(String(payload.entries[0].audio.dataUrl || ""), /^data:audio\/mpeg;base64,/);
  assert.match(String(payload.backgroundMusic.dataUrl || ""), /^data:audio\/mpeg;base64,/);
  assert.match(String(payload.dialogueAudioMap["row-1"].dataUrl || ""), /^data:audio\/mpeg;base64,/);
  assert.match(String(payload.audioTimeline.geminiSegments[0].dataUrl || ""), /^data:audio\/mpeg;base64,/);
  assert.equal(String(payload.audioTimeline.backgroundSegments[0].dataUrl || ""), "");
});

test("montage export ignores cache responses that exceed the size cap", async () => {
  const result = await context.resolveCachedMontageMediaDataUrl(
    {
      downloadUrl: "https://example.com/huge.mp3",
      mimeType: "audio/mpeg"
    },
    "audio",
    { remainingBytes: 6_000_000 }
  );
  assert.equal(result, "");
});
