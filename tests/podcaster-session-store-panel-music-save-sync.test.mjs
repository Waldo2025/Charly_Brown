import test from "node:test";
import assert from "node:assert/strict";
import { createPodcasterSessionStore } from "../public/podcaster/podcaster-session-store.js";

test("manual cloud save forces panel music state sync before building payload and local cache", async () => {
  const writes = [];
  let syncCalls = 0;
  let sessionState = [{
    id: "session-1",
    title: "Sesion",
    updatedAt: "2026-05-21T10:00:00.000Z",
    script: { rows: [] },
    panelMusicConfig: {
      trackLibrary: {
        uploadedTracks: [{
          slotLabel: "Audio 1",
          durationSec: 0,
          trimInMs: 0,
          trimOutMs: 3200,
          loopSettings: [{ loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 0, fadeOutMs: 0 }]
        }]
      },
      track: {
        slotLabel: "Audio 1",
        durationSec: 0,
        trimInMs: 0,
        trimOutMs: 3200,
        loopSettings: [{ loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 0, fadeOutMs: 0 }]
      }
    }
  }];

  const store = createPodcasterSessionStore({
    STORAGE_KEY_BASE: "test_sessions",
    nowIso: () => "2026-05-21T12:00:00.000Z",
    resolveCurrentUid: () => "uid-1",
    getStorageScopeUid: () => "uid-1",
    getSessions: () => sessionState,
    setSessions: (nextSessions) => { sessionState = Array.isArray(nextSessions) ? nextSessions : []; },
    getActiveSession: () => sessionState[0],
    persistPanelMusicToActiveSession: () => {
      syncCalls += 1;
      sessionState[0] = {
        ...sessionState[0],
        panelMusicConfig: {
          ...sessionState[0].panelMusicConfig,
          trackLibrary: {
            ...sessionState[0].panelMusicConfig.trackLibrary,
            uploadedTracks: [{
              ...sessionState[0].panelMusicConfig.trackLibrary.uploadedTracks[0],
              loopSettings: [{ loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }]
            }]
          },
          track: {
            ...sessionState[0].panelMusicConfig.track,
            loopSettings: [{ loopIndex: 0, trimInMs: 0, trimOutMs: 3200, fadeInMs: 500, fadeOutMs: 900 }]
          }
        }
      };
    },
    hasAvailableApiBase: () => false,
    buildCloudSessionPayload: (target) => target,
    compactCloudSessionPayload: (payload) => ({ payload, bytes: 0, strippedReferenceMedia: false, trimmedChat: false }),
    MAX_CLOUD_SESSION_PAYLOAD_BYTES: 999999,
    firestoreDb: {},
    doc: (...parts) => parts,
    getDoc: async () => ({ exists: () => false, data: () => null }),
    setDoc: async () => ({ ok: true }),
    serverTimestamp: () => "server-ts",
    logPodcastRenderDebug: () => {},
    storageAdapter: {
      readJson(key, fallback) { return fallback; },
      writeJson(key, value) { writes.push({ key, value }); },
      getItem() { return ""; },
      setItem() {},
      removeItem() {}
    }
  });

  await store.saveManual("session-1", { silent: true, render: false });

  assert.equal(syncCalls, 1);
  assert.equal(sessionState[0].panelMusicConfig.track.loopSettings[0].fadeInMs, 500);
  assert.equal(sessionState[0].panelMusicConfig.track.loopSettings[0].fadeOutMs, 900);
  assert.ok(writes.some((entry) => JSON.stringify(entry.value).includes("\"fadeInMs\":500")));
  assert.ok(writes.some((entry) => JSON.stringify(entry.value).includes("\"fadeOutMs\":900")));
});
