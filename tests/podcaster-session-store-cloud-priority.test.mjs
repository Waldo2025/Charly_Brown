import test from "node:test";
import assert from "node:assert/strict";

const store = await import("../public/podcaster/podcaster-session-store.js");

const { mergeCloudVsLocalSessions, bootstrapSessions, loadSessionsFromCloud, loadSessionsFromLocalCache, loadSingleSessionFromCloud } = store;

test("mergeCloudVsLocalSessions prefers full cloud rows over stale local rows", () => {
  const cloudSessions = [{
    id: "s1",
    updatedAt: "2026-05-20T10:00:00.000Z",
    isStub: false,
    script: {
      rows: [{
        id: "row-1",
        text: "cloud",
        visualNotesProposal: "",
        visualNotesProposals: ["cloud proposal"],
        visualNotesResolvedProposals: ["cloud proposal"]
      }]
    },
    podcastVideoConfig: { cloud: true }
  }];
  const localSessions = [{
    id: "s1",
    updatedAt: "2026-05-19T10:00:00.000Z",
    script: {
      rows: [{
        id: "row-1",
        text: "local",
        visualNotesProposal: "stale local proposal",
        visualNotesProposals: ["stale local proposal"],
        visualNotesResolvedProposals: []
      }]
    },
    podcastVideoConfig: { local: true }
  }];

  const [merged] = mergeCloudVsLocalSessions(cloudSessions, localSessions, {});

  assert.equal(merged.script.rows[0].text, "cloud");
  assert.equal(merged.script.rows[0].visualNotesProposal, "");
  assert.deepEqual(merged.script.rows[0].visualNotesResolvedProposals, ["cloud proposal"]);
  assert.equal(merged.podcastVideoConfig.cloud, true);
  assert.equal(merged.podcastVideoConfig.local, true);
});

test("mergeCloudVsLocalSessions keeps local fallback rows for stub cloud sessions", () => {
  const cloudSessions = [{
    id: "s1",
    updatedAt: "2026-05-20T10:00:00.000Z",
    isStub: true,
    script: { rows: [{ id: "row-1", text: "stub" }] }
  }];
  const localSessions = [{
    id: "s1",
    updatedAt: "2026-05-19T10:00:00.000Z",
    script: { rows: [{ id: "row-1", text: "local full", visualNotesProposal: "keep me" }] },
    podcastVideoConfig: { local: true }
  }];

  const [merged] = mergeCloudVsLocalSessions(cloudSessions, localSessions, {
    mergeSessionRowsWithFallback(primaryRows = [], fallbackRows = []) {
      return primaryRows.length ? primaryRows.map((row, index) => ({ ...(fallbackRows[index] || {}), ...row })) : fallbackRows;
    }
  });

  assert.equal(merged.script.rows[0].text, "stub");
  assert.equal(merged.script.rows[0].visualNotesProposal, "keep me");
  assert.equal(merged.podcastVideoConfig.local, true);
  assert.equal(merged.podcastVideoConfig.reelModeEnabled, false);
});

test("mergeCloudVsLocalSessions keeps local content when cloud document is empty metadata", () => {
  const cloudSessions = [{
    id: "s1",
    title: "cloud title",
    updatedAt: "2026-07-02T12:00:00.000Z",
    isStub: false,
    script: { rows: [] },
    cloudMeta: { ownerId: "uid-1" }
  }];
  const localSessions = [{
    id: "s1",
    title: "local full title",
    updatedAt: "2026-07-02T11:00:00.000Z",
    chat: [{ role: "assistant", content: "local chat" }],
    script: { rows: [{ id: "row-1", text: "local row" }] },
    podcastVideoConfig: { timelineClipsByRowId: { "row-1": [{ id: "clip-1" }] } }
  }];

  const [merged] = mergeCloudVsLocalSessions(cloudSessions, localSessions, {});

  assert.equal(merged.title, "cloud title");
  assert.equal(merged.chat[0].content, "local chat");
  assert.equal(merged.script.rows[0].text, "local row");
  assert.equal(merged.cloudMeta.ownerId, "uid-1");
  assert.equal(merged.isStub, false);
});

test("mergeCloudVsLocalSessions keeps cloud academic metadata over a stale local cache", () => {
  const [merged] = mergeCloudVsLocalSessions([{
    id: "s1",
    title: "cloud",
    updatedAt: "2026-08-30T12:00:00.000Z",
    isStub: true,
    trimestre: "1",
    academicMetadata: { nivel: "", grado: "", trimestre: "1", unidad: "", materia: "", unitLabel: "Unidad" },
    script: { rows: [] }
  }], [{
    id: "s1",
    title: "local",
    updatedAt: "2026-08-30T13:00:00.000Z",
    trimestre: "",
    academicMetadata: { trimestre: "" },
    script: { rows: [{ id: "r1", text: "contenido local" }] }
  }], {});

  assert.equal(merged.trimestre, "1");
  assert.equal(merged.academicMetadata.trimestre, "1");
  assert.equal(merged.script.rows[0].text, "contenido local");
});

test("loadSessionsFromLocalCache recovers full legacy session over scoped empty stub", () => {
  const writes = [];
  const storageAdapter = {
    readJson(key) {
      if (String(key).startsWith("test_sessions:deleted:")) return [];
      if (key === "test_sessions:uid-1") {
        return [{
          id: "s1",
          title: "stub scoped",
          isStub: true,
          script: { rows: [] },
          cloudMeta: { ownerId: "uid-1" }
        }];
      }
      if (key === "test_legacy_sessions") {
        return [{
          id: "s1",
          title: "legacy full",
          chat: [{ id: "m1", role: "assistant", text: "hola" }],
          script: { rows: [{ id: "r1", text: "contenido" }] }
        }];
      }
      return [];
    },
    writeJson(key, value) { writes.push({ key, value }); },
    getItem() { return ""; },
    setItem() {},
    removeItem() {}
  };

  const sessions = loadSessionsFromLocalCache("uid-1", {
    STORAGE_KEY_BASE: "test_sessions",
    LEGACY_STORAGE_KEY: "test_legacy_sessions"
  }, storageAdapter);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].title, "legacy full");
  assert.equal(sessions[0].script.rows[0].text, "contenido");
  assert.equal(sessions[0].cloudMeta.ownerId, "uid-1");
  assert.equal(sessions[0].isStub, false);
  assert.ok(writes.some((entry) => entry.key === "test_sessions:uid-1"));
});

test("loadSingleSessionFromCloud merges top-level video session data when data.session is empty", async () => {
  const session = await loadSingleSessionFromCloud("s1", "uid-1", {
    hasAvailableApiBase: () => false,
    firestoreDb: {},
    doc(_db, collectionName, id) {
      return { collectionName, id };
    },
    async getDoc(ref) {
      assert.equal(ref.collectionName, "podcaster_sessions");
      assert.equal(ref.id, "s1");
      return {
        exists: () => true,
        data: () => ({
          ownerId: "uid-1",
          title: "12 de octubre",
          session: {
            id: "s1",
            title: "12 de octubre",
            script: { rows: [] },
            dialogueVideoMap: {}
          },
          script: {
            rows: [{ id: "row-1", text: "top-level scene" }]
          },
          dialogueVideoMap: {
            "row-1": [{ storagePath: "podcaster/sessions/s1/owners/uid-1/videos/row-1/video.mp4" }]
          }
        })
      };
    }
  });

  assert.equal(session.id, "s1");
  assert.equal(session.script.rows[0].text, "top-level scene");
  assert.equal(session.dialogueVideoMap["row-1"][0].storagePath.includes("video.mp4"), true);
});

test("loadSingleSessionFromCloud preserves full timeline maps when nested session has partial video config", async () => {
  const session = await loadSingleSessionFromCloud("s2", "uid-1", {
    hasAvailableApiBase: () => false,
    firestoreDb: {},
    doc(_db, collectionName, id) {
      return { collectionName, id };
    },
    async getDoc(ref) {
      assert.equal(ref.collectionName, "podcaster_sessions");
      assert.equal(ref.id, "s2");
      return {
        exists: () => true,
        data: () => ({
          ownerId: "uid-1",
          title: "Timeline completo",
          podcastVideoConfig: {
            timelineClipsByRowId: {
              "row-1": { rowId: "row-1", type: "color", backgroundColor: "#112233", startMs: 0, durationMs: 2500 },
              "row-2": { rowId: "row-2", type: "video", videoSrc: "https://cdn.example.test/row-2.mp4", startMs: 2500, durationMs: 3000 }
            },
            timelineSceneAudioMixByRowId: {
              "row-1": { backgroundMusicVolumePct: 80 }
            },
            geminiDialogueTrack: {
              enabled: true,
              segments: [
                { rowId: "row-1", startMs: 300, durationMs: 1800 },
                { rowId: "row-2", startMs: 2800, durationMs: 2200 }
              ]
            }
          },
          dialogueVideoMap: {
            "row-2": [{ downloadUrl: "https://cdn.example.test/row-2.mp4" }]
          },
          session: {
            id: "s2",
            title: "Timeline completo",
            script: {
              rows: [
                { id: "row-1", text: "Escena con fondo" },
                { id: "row-2", text: "Escena con video" }
              ]
            },
            podcastVideoConfig: {
              reelModeEnabled: true,
              timelineClipsByRowId: {
                "row-2": { rowId: "row-2", mediaScale: 1.2 }
              },
              geminiDialogueTrack: {
                enabled: true,
                segments: []
              }
            },
            dialogueVideoMap: {}
          }
        })
      };
    }
  });

  assert.equal(session.podcastVideoConfig.reelModeEnabled, true);
  assert.equal(session.podcastVideoConfig.timelineClipsByRowId["row-1"].backgroundColor, "#112233");
  assert.equal(session.podcastVideoConfig.timelineClipsByRowId["row-2"].videoSrc, "https://cdn.example.test/row-2.mp4");
  assert.equal(session.podcastVideoConfig.timelineClipsByRowId["row-2"].mediaScale, 1.2);
  assert.equal(session.podcastVideoConfig.timelineSceneAudioMixByRowId["row-1"].backgroundMusicVolumePct, 80);
  assert.equal(session.podcastVideoConfig.geminiDialogueTrack.segments.length, 2);
  assert.equal(session.dialogueVideoMap["row-2"][0].downloadUrl, "https://cdn.example.test/row-2.mp4");
});

test("saveManual falls back to direct Firestore save when API rejects Firebase auth", async () => {
  const writes = [];
  const storageWrites = [];
  let nextSessions = [];
  const sessionStore = store.createPodcasterSessionStore({
    STORAGE_KEY_BASE: "test_sessions",
    SESSION_SYNC_META_KEY_BASE: "test_sync",
    nowIso: () => "2026-07-02T16:00:00.000Z",
    hasAvailableApiBase: () => true,
    async authFetchJson() {
      const error = new Error("AUTH_FORBIDDEN");
      error.status = 401;
      error.detail = { error: "AUTH_INVALID" };
      throw error;
    },
    firestoreDb: {},
    doc(_db, collectionName, id) {
      return { collectionName, id };
    },
    async getDoc(ref) {
      assert.equal(ref.collectionName, "podcaster_sessions");
      return {
        exists: () => false,
        data: () => null
      };
    },
    async setDoc(ref, data, options) {
      writes.push({ ref, data, options });
    },
    serverTimestamp() {
      return { __serverTimestamp: true };
    },
    resolveCurrentUid: () => "uid-1",
    getSessions: () => [{
      id: "s-save",
      title: "Guardar",
      updatedAt: "2026-07-02T15:59:00.000Z",
      script: { rows: [{ id: "row-1", text: "Hola" }] }
    }],
    getActiveSession: () => ({
      id: "s-save",
      title: "Guardar",
      updatedAt: "2026-07-02T15:59:00.000Z",
      script: { rows: [{ id: "row-1", text: "Hola" }] }
    }),
    buildCloudSessionPayload: (session) => session,
    compactCloudSessionPayload: (payload) => ({ payload, bytes: 128 }),
    MAX_CLOUD_SESSION_PAYLOAD_BYTES: 1024 * 1024,
    getDialogueVideoMap: () => ({}),
    getDialogueAudioMap: () => ({}),
    setSessions(next) {
      nextSessions = Array.isArray(next) ? next : [];
    },
    storage: {
      getItem() { return ""; },
      setItem(key, value) { storageWrites.push({ key, value }); },
      removeItem() {}
    }
  });

  await sessionStore.saveManual("s-save", { silent: true, render: false });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].ref.collectionName, "podcaster_sessions");
  assert.equal(writes[0].ref.id, "s-save");
  assert.equal(writes[0].data.ownerId, "uid-1");
  assert.equal(writes[0].data.session.id, "s-save");
  assert.equal(writes[0].options.merge, true);
  assert.equal(nextSessions[0].cloudMeta.ownerId, "uid-1");
  assert.ok(storageWrites.some((entry) => String(entry.key || "").startsWith("test_sessions:uid-1")));
});

test("bootstrapSessions prefers cloud snapshot when local and cloud differ", async () => {
  const written = [];
  const local = [{
    id: "s1",
    updatedAt: "2026-05-19T00:00:00.000Z",
    title: "local",
    script: { rows: [{ id: "r1", text: "local" }] }
  }];
  const cloud = [{
    id: "s1",
    updatedAt: "2026-05-20T00:00:00.000Z",
    title: "cloud",
    isStub: false,
    script: { rows: [{ id: "r1", text: "cloud" }] }
  }];
  const storageAdapter = {
    readJson(key) {
      if (String(key).startsWith("test_sessions:deleted:")) return [];
      if (String(key).startsWith("test_sessions:uid-1")) return local;
      return [];
    },
    writeJson(key, value) { written.push({ key, value }); },
    getItem() { return ""; },
    setItem() {},
    removeItem() {}
  };

  const result = await bootstrapSessions("uid-1", {
    STORAGE_KEY_BASE: "test_sessions",
    nowIso: () => "2026-05-20T12:00:00.000Z",
    mergeSessionRowsWithFallback(primaryRows = [], fallbackRows = []) {
      return primaryRows.length ? primaryRows : fallbackRows;
    },
    mergeSessionsById(primary = [], secondary = []) {
      return [...primary, ...secondary];
    },
    forceCloud: false,
    authFetchJson: async () => ({ sessions: cloud }),
    hasAvailableApiBase: () => true
  }, storageAdapter);

  assert.equal(result.sessions[0].title, "cloud");
  assert.equal(result.sessions[0].script.rows[0].text, "cloud");
  assert.equal(result.useLocal, false);
  assert.ok(written.length > 0);
});

test("bootstrapSessions persists merged local cloud session instead of raw cloud snapshot", async () => {
  const written = [];
  const local = [{
    id: "s1",
    updatedAt: "2026-06-12T00:00:00.000Z",
    title: "local",
    dialogueAudioMap: {
      "row-1": { rowId: "row-1", playbackRate: 4.5, downloadUrl: "local.wav" }
    },
    script: { rows: [{ id: "row-1", text: "local", playbackRate: 4.5 }] }
  }];
  const cloud = [{
    id: "s1",
    updatedAt: "2026-06-11T00:00:00.000Z",
    title: "cloud",
    isStub: false,
    dialogueAudioMap: {
      "row-1": { rowId: "row-1", playbackRate: 1, downloadUrl: "cloud.wav" }
    },
    script: { rows: [{ id: "row-1", text: "cloud", playbackRate: 1 }] }
  }];
  const storageAdapter = {
    readJson(key) {
      if (String(key).startsWith("test_sessions:deleted:")) return [];
      if (String(key).startsWith("test_sessions:uid-1")) return local;
      return [];
    },
    writeJson(key, value) { written.push({ key, value }); },
    getItem() { return ""; },
    setItem() {},
    removeItem() {}
  };

  const result = await bootstrapSessions("uid-1", {
    STORAGE_KEY_BASE: "test_sessions",
    nowIso: () => "2026-06-12T12:00:00.000Z",
    normalizePodcastVideoConfig(value) { return value || {}; },
    mergeSessionRowsWithFallback(primaryRows = [], fallbackRows = []) {
      return primaryRows.length
        ? primaryRows.map((row, index) => ({ ...(fallbackRows[index] || {}), ...row }))
        : fallbackRows;
    },
    mergeSessionsById(primary = [], secondary = []) {
      return [...primary, ...secondary];
    },
    forceCloud: false,
    authFetchJson: async () => ({ sessions: cloud }),
    hasAvailableApiBase: () => true
  }, storageAdapter);

  assert.equal(result.sessions[0].dialogueAudioMap["row-1"].playbackRate, 4.5);
  assert.equal(result.sessions[0].script.rows[0].playbackRate, 1);
  const persistedSession = written.find((entry) => entry.key === "test_sessions:uid-1")?.value?.find?.((session) => session.id === "s1") || null;
  assert.ok(persistedSession);
  assert.equal(persistedSession.dialogueAudioMap["row-1"].playbackRate, 4.5);
});

test("loadSessionsFromCloud falls back to Firestore when the API returns 401", async () => {
  const firestoreOwnedSessions = [{
    id: "s1",
    title: "firestore",
    updatedAt: "2026-06-15T00:00:00.000Z"
  }];
  const firestoreSharedSessions = [{
    id: "s2",
    title: "shared",
    updatedAt: "2026-06-15T01:00:00.000Z"
  }];
  let getDocsCallCount = 0;

  const result = await loadSessionsFromCloud("uid-1", {
    hasAvailableApiBase: () => true,
    authFetchJson: async () => {
      const error = new Error("AUTH_INVALID");
      error.status = 401;
      throw error;
    },
    storageAdapter: {
      readJson(key) {
        if (String(key).startsWith("cb_podcaster_sessions_v2:deleted:")) return [];
        return [];
      },
      writeJson() {},
      getItem() { return ""; },
      setItem() {},
      removeItem() {}
    },
    firestoreDb: {},
    doc: (...parts) => parts,
    collection: () => ({}),
    query: (...parts) => parts,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    getDocs: async () => ({
      docs: (getDocsCallCount++ === 0 ? firestoreOwnedSessions : firestoreSharedSessions).map((session) => ({
        id: session.id,
        data: () => ({
          session,
          ownerId: "uid-1",
          updatedAt: { toDate: () => new Date(session.updatedAt) }
        })
      }))
    }),
    nowIso: () => "2026-06-15T01:00:00.000Z"
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "s2");
  assert.equal(result[1].id, "s1");
  assert.equal(result[0].title, "shared");
  assert.equal(result[1].title, "firestore");
});

test("loadSessionsFromCloud can prefer Firestore directly to avoid noisy session auth redirects", async () => {
  let apiCalls = 0;
  let getDocsCallCount = 0;

  const result = await loadSessionsFromCloud("uid-1", {
    preferDirectSessionFirestore: true,
    hasAvailableApiBase: () => true,
    authFetchJson: async () => {
      apiCalls += 1;
      return { sessions: [] };
    },
    storageAdapter: {
      readJson(key) {
        if (String(key).startsWith("cb_podcaster_sessions_v2:deleted:")) return [];
        return [];
      },
      writeJson() {},
      getItem() { return ""; },
      setItem() {},
      removeItem() {}
    },
    firestoreDb: {},
    collection: () => ({}),
    query: (...parts) => parts,
    where: () => ({}),
    limit: () => ({}),
    getDocs: async () => ({
      docs: (getDocsCallCount++ === 0 ? [{
        id: "s1",
        title: "firestore",
        updatedAt: "2026-06-15T00:00:00.000Z"
      }] : []).map((session) => ({
        id: session.id,
        data: () => ({
          session,
          ownerId: "uid-1",
          updatedAt: { toDate: () => new Date(session.updatedAt) }
        })
      }))
    }),
    nowIso: () => "2026-06-15T01:00:00.000Z"
  });

  assert.equal(apiCalls, 0);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "firestore");
});

test("loadSessionsFromCloud preserves lightweight API stubs for lazy active-session hydration", async () => {
  let apiCalls = 0;
  const result = await loadSessionsFromCloud("uid-1", {
    hasAvailableApiBase: () => true,
    authFetchJson: async () => {
      apiCalls += 1;
      return {
        sessions: [{
          id: "s1",
          title: "Solo metadata",
          updatedAt: "2026-06-15T00:00:00.000Z",
          isStub: true,
          script: { rows: [] }
        }]
      };
    },
    storageAdapter: {
      readJson(key) {
        if (String(key).startsWith("cb_podcaster_sessions_v2:deleted:")) return [];
        return [];
      },
      writeJson() {},
      getItem() { return ""; },
      setItem() {},
      removeItem() {}
    }
  });

  assert.equal(apiCalls, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].isStub, true);
  assert.deepEqual(result[0].script.rows, []);
});

test("loadSessionsFromCloud infers API metadata-only sessions as stubs when flag is missing", async () => {
  const result = await loadSessionsFromCloud("uid-1", {
    hasAvailableApiBase: () => true,
    authFetchJson: async () => ({
      sessions: [{
        id: "s1",
        title: "Metadata sin flag",
        updatedAt: "2026-06-15T00:00:00.000Z"
      }]
    }),
    storageAdapter: {
      readJson(key) {
        if (String(key).startsWith("cb_podcaster_sessions_v2:deleted:")) return [];
        return [];
      },
      writeJson() {},
      getItem() { return ""; },
      setItem() {},
      removeItem() {}
    }
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].isStub, true);
  assert.deepEqual(result[0].script.rows, []);
});
