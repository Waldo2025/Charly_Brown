import test from "node:test";
import assert from "node:assert/strict";

const store = await import("../public/podcaster/podcaster-session-store.js");

const {
  mergeCloudVsLocalSessions,
  bootstrapSessions,
  loadSessionsFromCloud,
  saveSessionManuallyToCloud
} = store;

function createFirestoreCloudDeps(ownedSessions = [], sharedSessions = []) {
  let getDocsCallCount = 0;
  return {
    firestoreDb: {},
    collection: () => ({}),
    query: (...parts) => parts,
    where: () => ({}),
    limit: () => ({}),
    getDocs: async () => ({
      docs: (getDocsCallCount++ === 0 ? ownedSessions : sharedSessions).map((session) => ({
        id: session.id,
        data: () => ({
          session,
          ownerId: "uid-1",
          sharedWithIds: [],
          updatedAt: { toDate: () => new Date(session.updatedAt || "2026-06-30T00:00:00.000Z") }
        })
      }))
    })
  };
}

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
    authFetchJson: async () => {
      throw new Error("sessions API should not be called");
    },
    hasAvailableApiBase: () => true,
    ...createFirestoreCloudDeps(cloud)
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
    authFetchJson: async () => {
      throw new Error("sessions API should not be called");
    },
    hasAvailableApiBase: () => true,
    ...createFirestoreCloudDeps(cloud)
  }, storageAdapter);

  assert.equal(result.sessions[0].dialogueAudioMap["row-1"].playbackRate, 4.5);
  assert.equal(result.sessions[0].script.rows[0].playbackRate, 1);
  const persistedSession = written.find((entry) => entry.key === "test_sessions:uid-1")?.value?.find?.((session) => session.id === "s1") || null;
  assert.ok(persistedSession);
  assert.equal(persistedSession.dialogueAudioMap["row-1"].playbackRate, 4.5);
});

test("loadSessionsFromCloud reads directly from Firestore without calling the sessions API", async () => {
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
      throw new Error("sessions API should not be called");
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

test("saveSessionManuallyToCloud writes directly to Firestore without calling the sessions API", async () => {
  const session = {
    id: "s1",
    title: "Manual save",
    updatedAt: "2026-06-30T12:00:00.000Z",
    script: { rows: [{ id: "row-1", text: "Hola" }] }
  };
  const writtenDocs = [];
  const persistedSessions = [];
  const persistedMeta = [];
  const storageAdapter = {
    readJson(key, fallback) {
      if (String(key).startsWith("test_sessions:sync:")) return {};
      return fallback;
    },
    writeJson(key, value) {
      if (String(key).startsWith("test_sessions:sync:")) persistedMeta.push({ key, value });
    },
    getItem() { return ""; },
    setItem(key, value) {
      persistedSessions.push({ key, value });
    },
    removeItem() {}
  };

  const response = await saveSessionManuallyToCloud("s1", { silent: true }, {
    STORAGE_KEY_BASE: "test_sessions",
    SESSION_SYNC_META_KEY_BASE: "test_sessions:sync",
    MAX_CLOUD_SESSION_PAYLOAD_BYTES: 2000000,
    resolveCurrentUid: () => "uid-1",
    getSessions: () => [session],
    setSessions: (sessions) => persistedSessions.push({ key: "state", value: sessions }),
    getActiveSession: () => session,
    buildCloudSessionPayload: (target) => ({ ...target }),
    compactCloudSessionPayload: (payload) => ({
      payload,
      bytes: 256,
      strippedReferenceMedia: false,
      trimmedChat: false
    }),
    hasAvailableApiBase: () => true,
    authFetchJson: async () => {
      throw new Error("sessions API should not be called");
    },
    firestoreDb: {},
    doc: (...parts) => parts,
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    setDoc: async (ref, data, options) => {
      writtenDocs.push({ ref, data, options });
    },
    serverTimestamp: () => "server-time",
    nowIso: () => "2026-06-30T12:00:00.000Z",
    normalizePodcastVideoConfig: (value) => value || {}
  }, storageAdapter);

  assert.equal(response.ok, true);
  assert.equal(response.ownerId, "uid-1");
  assert.equal(writtenDocs.length, 1);
  assert.equal(writtenDocs[0].data.session.id, "s1");
  assert.equal(writtenDocs[0].data.ownerId, "uid-1");
  assert.ok(persistedSessions.some((entry) => entry.key === "state"));
  assert.ok(persistedMeta.length > 0);
});
