const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMontageExportJobStore
} = require("./job-store-firestore.js");

function createFakeDocStore() {
  const docs = new Map();

  const collection = () => ({
    doc(id) {
      return {
        id,
        async set(value, options = {}) {
          const previous = docs.get(id) || null;
          if (options && options.merge && previous && typeof previous === "object") {
            docs.set(id, { ...previous, ...value });
            return;
          }
          docs.set(id, value);
        },
        async get() {
          const value = docs.get(id);
          return {
            exists: docs.has(id),
            data() {
              return value;
            }
          };
        },
        async delete() {
          docs.delete(id);
        }
      };
    }
  });

  return {
    docs,
    collection
  };
}

test("createJob writes a durable queued montage export job", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T15:00:00.000Z"
  });

  const created = await store.createJob({
    jobId: "job-1",
    sessionId: "session-1",
    ownerId: "user-1",
    request: { filename: "montage.mp4" },
    totalScenes: 14
  });

  assert.equal(created.jobId, "job-1");
  assert.equal(created.type, "montage_export");
  assert.equal(created.status, "queued");
  assert.equal(created.stage, "queued");
  assert.equal(created.totalScenes, 14);
  assert.equal(created.ownerId, "user-1");
  assert.equal(created.request.filename, "montage.mp4");
  assert.equal(created.createdAt, "2026-04-27T15:00:00.000Z");
  assert.equal(fakeDb.docs.get("job-1").jobId, "job-1");
});

test("createJob strips undefined values before writing to Firestore", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T15:00:00.000Z"
  });

  const created = await store.createJob({
    jobId: "job-undef",
    sessionId: "session-undef",
    ownerId: "user-undef",
    request: {
      filename: "montage.mp4",
      currentDownloadUrl: undefined,
      nested: {
        currentDownloadUrl: undefined
      }
    },
    totalScenes: 1
  });

  assert.equal(created.request.filename, "montage.mp4");
  assert.equal(Object.prototype.hasOwnProperty.call(created.request, "currentDownloadUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.nested, "currentDownloadUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(fakeDb.docs.get("job-undef").request, "currentDownloadUrl"), false);
});

test("createJob strips inline on-screen raster payloads from persisted request input", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T15:00:00.000Z"
  });

  const created = await store.createJob({
    jobId: "job-raster-redact",
    sessionId: "session-raster",
    ownerId: "user-raster",
    request: {
      baseUrl: "https://example.com",
      input: {
        sessionId: "session-raster",
        entriesRaw: [{ rowId: "row-1", noisy: true }],
        audioTimelineRaw: { enabled: true },
        onScreenTextTimelineRaw: {
          enabled: true,
          renderedSegments: [{
            rowId: "row-1",
            renderedFrames: [{
              kind: "base",
              dataUrl: "data:image/png;base64,QUJDRA=="
            }]
          }]
        },
        onScreenTextRenderedSegments: [{
          rowId: "row-1",
          renderedFrames: [{
            kind: "base",
            wordIndex: -1,
            dataUrl: "data:image/png;base64,QUJDRA=="
          }, {
            kind: "karaoke-word",
            wordIndex: 0,
            dataUrl: "data:image/png;base64,QUJDREU="
          }]
        }]
      }
    },
    totalScenes: 1
  });

  assert.equal(created.request.input.sessionId, "session-raster");
  assert.equal(created.request.input.persistedInlineRastersRedacted, true);
  assert.equal(created.request.input.persistedInlineRasterFrameCount, 3);
  assert.equal(created.request.input.persistedInlineRasterSegmentCount, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input, "entriesRaw"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input, "audioTimelineRaw"), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(created.request.input.onScreenTextTimelineRaw || {}, "renderedSegments"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(created.request.input.onScreenTextRenderedSegments[0].renderedFrames[0], "dataUrl"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(fakeDb.docs.get("job-raster-redact").request.input.onScreenTextRenderedSegments[0].renderedFrames[1], "dataUrl"),
    false
  );
});

test("createJob strips inline audio and media payloads from persisted request input", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T15:00:00.000Z"
  });

  const created = await store.createJob({
    jobId: "job-inline-media-redact",
    sessionId: "session-inline-media",
    ownerId: "user-inline-media",
    request: {
      baseUrl: "https://example.com",
      input: {
        sessionId: "session-inline-media",
        entries: [{
          rowId: "row-1",
          video: {
            downloadUrl: "https://example.com/video.mp4",
            dataUrl: "data:video/mp4;base64,AAAA"
          },
          audio: {
            storagePath: "gs://bucket/audio.wav",
            localDataUrl: "data:audio/wav;base64,BBBB"
          }
        }],
        backgroundMusic: {
          localDataUrl: "data:audio/mp3;base64,CCCC"
        },
        dialogueAudioMap: {
          "row-1": {
            downloadUrl: "https://example.com/audio.wav",
            dataUrl: "data:audio/wav;base64,DDDD"
          }
        },
        audioTimeline: {
          geminiSegments: [{
            rowId: "row-1",
            localDataUrl: "data:audio/wav;base64,EEEE"
          }],
          backgroundSegments: [{
            id: "bg-1",
            dataUrl: "data:audio/mp3;base64,FFFF"
          }]
        }
      }
    },
    totalScenes: 1
  });

  assert.equal(created.request.input.persistedInlineMediaRedacted, true);
  assert.equal(created.request.input.persistedInlineMediaRecordCount, 6);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input.entries[0].video, "dataUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input.entries[0].audio, "localDataUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input.backgroundMusic, "localDataUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input.dialogueAudioMap["row-1"], "dataUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input.audioTimeline.geminiSegments[0], "localDataUrl"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input.audioTimeline.backgroundSegments[0], "dataUrl"), false);
});

test("createJob tolerates null media records while sanitizing persisted request input", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T15:00:00.000Z"
  });

  const created = await store.createJob({
    jobId: "job-inline-media-null",
    sessionId: "session-inline-media-null",
    ownerId: "user-inline-media-null",
    request: {
      baseUrl: "https://example.com",
      input: {
        sessionId: "session-inline-media-null",
        entries: [{
          rowId: "row-1",
          video: null,
          audio: null
        }],
        backgroundMusic: null,
        dialogueAudioMap: {
          "row-1": null
        },
        audioTimeline: {
          geminiSegments: [null],
          backgroundSegments: [null]
        }
      }
    },
    totalScenes: 1
  });

  assert.equal(created.request.input.entries[0].video, null);
  assert.equal(created.request.input.entries[0].audio, null);
  assert.equal(created.request.input.backgroundMusic, null);
  assert.equal(created.request.input.dialogueAudioMap["row-1"], null);
  assert.equal(created.request.input.audioTimeline.geminiSegments[0], null);
  assert.equal(created.request.input.audioTimeline.backgroundSegments[0], null);
  assert.equal(Object.prototype.hasOwnProperty.call(created.request.input, "persistedInlineMediaRedacted"), false);
});

test("updateJob merges progress and heartbeat without deleting request metadata", async () => {
  const fakeDb = createFakeDocStore();
  const timestamps = [
    "2026-04-27T15:00:00.000Z",
    "2026-04-27T15:05:00.000Z"
  ];
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => timestamps.shift() || "2026-04-27T15:05:00.000Z"
  });

  await store.createJob({
    jobId: "job-2",
    sessionId: "session-2",
    ownerId: "user-2",
    request: { filename: "foo.mp4" },
    totalScenes: 8
  });

  const updated = await store.updateJob("job-2", {
    status: "running",
    stage: "render_scene_segments",
    progress: 0.5,
    currentSceneIndex: 4,
    sceneSubstage: "scene_ffmpeg_render",
    hint: "Renderizando escena 4."
  });

  assert.equal(updated.status, "running");
  assert.equal(updated.progress, 0.5);
  assert.equal(updated.currentSceneIndex, 4);
  assert.equal(updated.sceneSubstage, "scene_ffmpeg_render");
  assert.equal(updated.request.filename, "foo.mp4");
  assert.equal(updated.updatedAt, "2026-04-27T15:05:00.000Z");
  assert.equal(updated.heartbeatAt, "2026-04-27T15:05:00.000Z");
});

test("getJob returns null for expired montage export jobs", async () => {
  const fakeDb = createFakeDocStore();
  const store = createMontageExportJobStore({
    db: fakeDb,
    now: () => "2026-04-27T16:00:00.000Z"
  });

  fakeDb.docs.set("job-expired", {
    jobId: "job-expired",
    type: "montage_export",
    status: "error",
    stage: "error",
    expiresAt: "2026-04-27T15:59:59.000Z"
  });

  const found = await store.getJob("job-expired");
  assert.equal(found, null);
});
