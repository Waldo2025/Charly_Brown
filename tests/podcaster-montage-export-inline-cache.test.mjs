import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

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
  URL,
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  buildApiUrlPreferRemote: (path) => `https://remote.test${path}`,
  buildExportApiUrl: (path) => `https://export.test${path}`,
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
            size: 12_500_001,
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
  "const MONTAGE_EXPORT_INLINE_AUDIO_MAX_BYTES = 12000000;",
  "const MONTAGE_EXPORT_INLINE_MEDIA_MAX_TOTAL_BYTES = 6000000;",
  extractFunction("getMontageInlineMediaMaxBytes"),
  extractFunction("estimateMontageDataUrlBytes"),
  extractFunction("buildMontageMediaCacheCandidates"),
  extractMaybeAsyncFunction("blobToDataUrl"),
  extractMaybeAsyncFunction("resolveCachedMontageMediaDataUrl"),
  extractMaybeAsyncFunction("maybeInlineMontageMediaAsset"),
  extractMaybeAsyncFunction("inlineMontageExportPayloadMedia"),
  extractFunction("normalizeMontageSubmissionMediaUrl"),
  extractFunction("isBackendResolvableMontageMediaSource"),
  extractFunction("stripInlineMontageMediaRecord"),
  extractFunction("stripMontageExportSubmissionPayload")
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

test("montage export strips inline media before submission", () => {
  const payload = {
    entries: [
      {
        rowId: "row-1",
        video: {
          storagePath: "podcaster/sessions/session-1/videos/scene.mp4",
          downloadUrl: "https://example.com/video.mp4",
          dataUrl: "data:video/mp4;base64,AAAA"
        },
        audio: {
          storagePath: "podcaster/sessions/session-1/audio/scene.mp3",
          downloadUrl: "https://example.com/audio.mp3",
          dataUrl: "data:audio/mpeg;base64,BBBB"
        }
      }
    ],
    backgroundMusic: {
      storagePath: "podcaster/library/music/track.mp3",
      downloadUrl: "https://example.com/music.mp3",
      dataUrl: "data:audio/mpeg;base64,CCCC"
    },
    dialogueAudioMap: {
      "row-1": {
        storagePath: "podcaster/sessions/session-1/audio/row-1.mp3",
        downloadUrl: "https://example.com/dialogue.mp3",
        dataUrl: "data:audio/mpeg;base64,DDDD"
      }
    },
    audioTimeline: {
      geminiSegments: [
        {
          rowId: "row-1",
          storagePath: "podcaster/sessions/session-1/audio/row-1.mp3",
          downloadUrl: "https://example.com/dialogue.mp3",
          dataUrl: "data:audio/mpeg;base64,EEEE"
        }
      ],
      backgroundSegments: [
        {
          rowId: "bg-1",
          storagePath: "podcaster/library/music/track.mp3",
          downloadUrl: "https://example.com/music.mp3",
          dataUrl: "data:audio/mpeg;base64,FFFF"
        }
      ]
    },
    onScreenTextTimeline: {
      segments: [],
      renderedSegments: [
        {
          rowId: "row-1",
          renderedFrames: [
            { kind: "base", dataUrl: "data:image/png;base64,GGGG" }
          ]
        }
      ]
    },
    onScreenTextRenderedSegments: [
      {
        rowId: "row-1",
        renderedFrames: [
          { kind: "base", dataUrl: "data:image/png;base64,HHHH" },
          { kind: "karaoke-word", wordIndex: 0, text: "Hola", dataUrl: "data:image/png;base64,IIII" }
        ]
      }
    ]
  };

  const stripped = context.stripMontageExportSubmissionPayload(payload);

  assert.equal(stripped.entries[0].video.dataUrl, "");
  assert.equal(stripped.entries[0].video.localDataUrl, "");
  assert.equal(stripped.entries[0].audio.dataUrl, "");
  assert.equal(stripped.backgroundMusic.dataUrl, "");
  assert.equal(stripped.dialogueAudioMap["row-1"].dataUrl, "");
  assert.equal(stripped.audioTimeline.geminiSegments[0].dataUrl, "");
  assert.equal(stripped.audioTimeline.backgroundSegments[0].dataUrl, "");
  assert.equal(stripped.onScreenTextTimeline.renderedSegments.length, 1);
  assert.equal(stripped.onScreenTextRenderedSegments.length, 1);
  assert.equal(stripped.onScreenTextRenderedSegments[0].renderedFrames.length, 2);
  assert.equal(stripped.onScreenTextRenderedSegments[0].renderedFrames[1].text, "Hola");
  assert.match(stripped.onScreenTextRenderedSegments[0].renderedFrames[0].dataUrl, /^data:image\/png;base64,/);
  assert.match(stripped.onScreenTextRenderedSegments[0].renderedFrames[1].dataUrl, /^data:image\/png;base64,/);
  assert.match(String(payload.entries[0].video.dataUrl || ""), /^data:video\/mp4;base64,/);
});

test("montage export preserves inline-only media sources", () => {
  const payload = {
    entries: [
      {
        rowId: "row-inline",
        video: {
          dataUrl: "data:video/mp4;base64,AAAA",
          localDataUrl: "data:video/mp4;base64,BBBB"
        },
        audio: {
          dataUrl: "data:audio/mpeg;base64,CCCC",
          localDataUrl: "data:audio/mpeg;base64,DDDD"
        }
      }
    ]
  };

  const stripped = context.stripMontageExportSubmissionPayload(payload);

  assert.equal(stripped.entries[0].video.dataUrl, "data:video/mp4;base64,AAAA");
  assert.equal(stripped.entries[0].video.localDataUrl, "data:video/mp4;base64,BBBB");
  assert.equal(stripped.entries[0].audio.dataUrl, "data:audio/mpeg;base64,CCCC");
  assert.equal(stripped.entries[0].audio.localDataUrl, "data:audio/mpeg;base64,DDDD");
});

test("montage export preserves dataUrl when audio only has local cache keys", () => {
  const payload = {
    dialogueAudioMap: {
      "row-1": {
        url: "podcaster-local-media:session-1:row-1:audio",
        localMediaCacheKey: "podcaster-local-media:session-1:row-1:audio",
        dataUrl: "data:audio/wav;base64,AAAA",
        localDataUrl: "data:audio/wav;base64,BBBB"
      }
    },
    audioTimeline: {
      geminiSegments: [
        {
          rowId: "row-1",
          url: "podcaster-local-media:session-1:row-1:audio",
          localMediaCacheKey: "podcaster-local-media:session-1:row-1:audio",
          dataUrl: "data:audio/wav;base64,CCCC",
          localDataUrl: "data:audio/wav;base64,DDDD"
        }
      ],
      backgroundSegments: [
        {
          id: "bg-1",
          url: "podcaster-local-media:session-1:bg-1:audio",
          localMediaCacheKey: "podcaster-local-media:session-1:bg-1:audio",
          dataUrl: "data:audio/mpeg;base64,EEEE",
          localDataUrl: "data:audio/mpeg;base64,FFFF"
        }
      ]
    }
  };

  const stripped = context.stripMontageExportSubmissionPayload(payload);

  assert.equal(stripped.dialogueAudioMap["row-1"].dataUrl, "data:audio/wav;base64,AAAA");
  assert.equal(stripped.dialogueAudioMap["row-1"].localDataUrl, "data:audio/wav;base64,BBBB");
  assert.equal(stripped.audioTimeline.geminiSegments[0].dataUrl, "data:audio/wav;base64,CCCC");
  assert.equal(stripped.audioTimeline.geminiSegments[0].localDataUrl, "data:audio/wav;base64,DDDD");
  assert.equal(stripped.audioTimeline.backgroundSegments[0].dataUrl, "data:audio/mpeg;base64,EEEE");
  assert.equal(stripped.audioTimeline.backgroundSegments[0].localDataUrl, "data:audio/mpeg;base64,FFFF");
});

test("montage export preserves inline audio when storagePath coexists with local cache key", () => {
  const payload = {
    dialogueAudioMap: {
      "row-1": {
        storagePath: "podcaster/sessions/session-1/audio/row-1.wav",
        downloadUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/row-1.wav?alt=media&token=abc",
        localMediaCacheKey: "podcaster-local-media:session-1:row-1:audio",
        dataUrl: "data:audio/wav;base64,AAAA",
        localDataUrl: "data:audio/wav;base64,BBBB"
      }
    },
    audioTimeline: {
      geminiSegments: [
        {
          rowId: "row-1",
          storagePath: "podcaster/sessions/session-1/audio/row-1.wav",
          downloadUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/row-1.wav?alt=media&token=abc",
          localMediaCacheKey: "podcaster-local-media:session-1:row-1:audio",
          dataUrl: "data:audio/wav;base64,CCCC",
          localDataUrl: "data:audio/wav;base64,DDDD"
        }
      ],
      backgroundSegments: [
        {
          id: "bg-1",
          storagePath: "podcaster/library/music/track.mp3",
          downloadUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/track.mp3?alt=media&token=abc",
          localMediaCacheKey: "podcaster-local-media:session-1:bg-1:audio",
          dataUrl: "data:audio/mpeg;base64,EEEE",
          localDataUrl: "data:audio/mpeg;base64,FFFF"
        }
      ]
    }
  };

  const stripped = context.stripMontageExportSubmissionPayload(payload);

  assert.equal(stripped.dialogueAudioMap["row-1"].dataUrl, "data:audio/wav;base64,AAAA");
  assert.equal(stripped.dialogueAudioMap["row-1"].localDataUrl, "data:audio/wav;base64,BBBB");
  assert.equal(stripped.audioTimeline.geminiSegments[0].dataUrl, "data:audio/wav;base64,CCCC");
  assert.equal(stripped.audioTimeline.geminiSegments[0].localDataUrl, "data:audio/wav;base64,DDDD");
  assert.equal(stripped.audioTimeline.backgroundSegments[0].dataUrl, "data:audio/mpeg;base64,EEEE");
  assert.equal(stripped.audioTimeline.backgroundSegments[0].localDataUrl, "data:audio/mpeg;base64,FFFF");
});

test("montage export normalizes relative proxy-media urls for backend submission", () => {
  const payload = {
    backgroundMusic: {
      url: "/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fmusic%2Ftrack.mp3",
      downloadUrl: "/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fmusic%2Ftrack.mp3",
      dataUrl: "data:audio/mpeg;base64,AAAA"
    },
    audioTimeline: {
      backgroundSegments: [
        {
          rowId: "bg-1",
          url: "/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Ftrack.mp3%3Falt%3Dmedia",
          downloadUrl: "/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Ftrack.mp3%3Falt%3Dmedia",
          dataUrl: "data:audio/mpeg;base64,BBBB"
        }
      ]
    }
  };

  const stripped = context.stripMontageExportSubmissionPayload(payload);

  assert.equal(stripped.backgroundMusic.dataUrl, "");
  assert.equal(
    stripped.backgroundMusic.url,
    "https://export.test/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fmusic%2Ftrack.mp3"
  );
  assert.equal(
    stripped.backgroundMusic.downloadUrl,
    "https://export.test/api/assets/proxy-media?storagePath=podcaster%2Flibrary%2Fmusic%2Ftrack.mp3"
  );
  assert.equal(stripped.audioTimeline.backgroundSegments[0].dataUrl, "");
  assert.equal(
    stripped.audioTimeline.backgroundSegments[0].url,
    "https://export.test/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Ftrack.mp3%3Falt%3Dmedia"
  );
  assert.equal(
    stripped.audioTimeline.backgroundSegments[0].downloadUrl,
    "https://export.test/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Ftrack.mp3%3Falt%3Dmedia"
  );
});

test("montage export rewrites absolute gemini proxy-media urls to the export backend", () => {
  const payload = {
    entries: [
      {
        rowId: "row-1",
        video: {
          url: "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fscene.mp4%3Falt%3Dmedia",
          downloadUrl: "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fabc%2Fvideos%2Fscene.mp4"
        },
        audio: {
          url: "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fabc%2Faudio%2Fclip.wav",
          downloadUrl: "https://charly-brown-gemini-backend.onrender.com/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fclip.wav%3Falt%3Dmedia"
        }
      }
    ]
  };

  const stripped = context.stripMontageExportSubmissionPayload(payload);

  assert.equal(
    stripped.entries[0].video.url,
    "https://export.test/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fscene.mp4%3Falt%3Dmedia"
  );
  assert.equal(
    stripped.entries[0].video.downloadUrl,
    "https://export.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fabc%2Fvideos%2Fscene.mp4"
  );
  assert.equal(
    stripped.entries[0].audio.url,
    "https://export.test/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fabc%2Faudio%2Fclip.wav"
  );
  assert.equal(
    stripped.entries[0].audio.downloadUrl,
    "https://export.test/api/assets/proxy-media?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fbucket%2Fo%2Fclip.wav%3Falt%3Dmedia"
  );
});

test("montage export confirm button uses an explicit handler and the modal stays clickable", () => {
  assert.match(source, /export async function handleMontageExportConfirmClick\(event = null\)/);
  assert.match(podcasterSource, /confirmMontageExportBtn\.addEventListener\("click", handleMontageExportConfirmClick\)/);

  const persistedJobIndex = source.indexOf("const persistedJob = loadPersistedMontageExportActiveJob();");
  assert.ok(persistedJobIndex >= 0, "Debe existir la rama de job persistido.");
  const persistedJobSlice = source.slice(persistedJobIndex, persistedJobIndex + 340);
  assert.ok(
    !persistedJobSlice.includes("window.montageExportBusy = true;"),
    "El modal no debe bloquear el botón al reabrirse por un job persistido."
  );
});
