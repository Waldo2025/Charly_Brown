import assert from "node:assert/strict";

const store = await import("../public/podcaster/podcaster-session-store.js");

const { bootstrapSessions } = store;

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
const persistedWrite = written.findLast?.((entry) => (
  String(entry?.key || "").startsWith("test_sessions:uid-1")
  && Array.isArray(entry?.value)
)) || null;
const persistedSession = persistedWrite?.value?.find?.((session) => session.id === "s1") || null;
assert.ok(persistedSession);
assert.equal(persistedSession.dialogueAudioMap["row-1"].playbackRate, 4.5);

console.log("Podcaster bootstrap persists merged local cloud session OK.");
