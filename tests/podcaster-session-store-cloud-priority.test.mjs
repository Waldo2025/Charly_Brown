import test from "node:test";
import assert from "node:assert/strict";

const store = await import("../public/podcaster/podcaster-session-store.js");

const { mergeCloudVsLocalSessions, bootstrapSessions } = store;

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
  assert.deepEqual(merged.podcastVideoConfig, { cloud: true });
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
  assert.deepEqual(merged.podcastVideoConfig, { local: true });
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
