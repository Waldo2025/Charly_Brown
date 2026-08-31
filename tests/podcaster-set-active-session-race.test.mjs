import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function extractSetActiveSessionSource() {
  const source = readFileSync(
    new URL("../public/podcaster/podcaster.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("async function setActiveSession(sessionId, options = {})");
  const end = source.indexOf("\nfunction ensureSession()", start);
  assert.ok(start >= 0 && end > start, "setActiveSession must remain extractable for the race regression");
  return source.slice(start, end).trim();
}

function instantiateSetActiveSession(bindings) {
  const names = Object.keys(bindings);
  const values = names.map((name) => bindings[name]);
  const factory = Function(
    ...names,
    `"use strict";
    let activeSessionActivationToken = 0;
    let suppressPodcastStudioUiStateSync = false;
    return (${extractSetActiveSessionSource()});`,
  );
  return factory(...values);
}

test("a late cloud activation A cannot mutate or rerender after session B completes", async () => {
  const cloudA = deferred();
  const sessionA = {
    id: "session-a",
    isStub: true,
    title: "Local A",
    script: { rows: [] },
  };
  const sessionB = {
    id: "session-b",
    isStub: true,
    title: "Local B",
    script: { rows: [] },
  };
  const state = {
    activeSessionId: "",
    sessions: [sessionA, sessionB],
  };
  const effects = {
    cloudLoads: [],
    playbackSync: [],
    render: [],
    prewarm: [],
  };
  const getActiveSession = () => state.sessions.find(
    (session) => session.id === state.activeSessionId,
  ) || null;
  const noOp = () => {};
  const fakeWindow = {
    innerWidth: 1280,
    localStorage: {
      setItem() {},
      getItem() { return null; },
    },
  };
  const playbackController = {
    stop() {},
    beginSessionTransition() {},
    sync(session) { effects.playbackSync.push(session?.id || ""); },
  };

  const setActiveSession = instantiateSetActiveSession({
    state,
    window: fakeWindow,
    document: { querySelectorAll: () => [] },
    console: { info() {}, warn() {}, error() {} },
    playbackController,
    podcastVideoState: {},
    academicMetadataApi: null,
    PodcasterResize: {
      POD_INSPECTOR_WIDTH_KEY: "inspector-width",
      POD_INSPECTOR_WIDTH_MIN: 240,
      POD_INSPECTOR_WIDTH_MAX: 640,
      POD_VIDEO_LIBRARY_COLLAPSED_KEY: "library-collapsed",
      podcastStageMaxHeightPx: 720,
    },
    ACTIVE_SESSION_ID_KEY: "active-session",
    PODCAST_STUDIO_INSPECTOR_COLLAPSED_KEY: "inspector-collapsed",
    setWorkspacePanelLoading: noOp,
    expandSession: noOp,
    setupActivityListener: noOp,
    getActiveSession,
    shouldHydrateSessionFromCloud: () => true,
    setGenerationStatus: noOp,
    isSessionDirtyInLocalCache: () => false,
    hasCloudSessionMarker: () => true,
    getSessionRows: (session) => session?.script?.rows || [],
    getDialogueVideoMap: (session) => session?.dialogueVideoMap || {},
    getDialogueAudioMap: (session) => session?.dialogueAudioMap || {},
    loadCloudSessionDocumentDirect: async (sessionId) => {
      effects.cloudLoads.push(sessionId);
      if (sessionId === sessionA.id) return cloudA.promise;
      return {
        id: sessionB.id,
        title: "Cloud B",
        cloudPayload: "B wins",
        script: { rows: [{ id: "row-b" }] },
      };
    },
    mergeCloudSessionOverLocalCache: (cloud, local) => ({
      ...local,
      ...cloud,
      id: local.id,
    }),
    persistSessions: noOp,
    syncMontageExportFilenameForSession: noOp,
    resetPodcastStudioSessionUiState: noOp,
    normalizePodcastStudioUiState: () => ({
      inspectorCollapsed: false,
      inspectorWidthPx: 320,
      libraryCollapsed: false,
      stageMaxHeightPx: 720,
      timelineViewMode: "",
      lastActiveRowId: "",
      composerGenerationMode: "",
      composerVideoTableMode: "",
      composerVideoNoModifyMode: false,
    }),
    setPodcastStudioInspectorCollapsed: noOp,
    setPodcastStudioInspectorWidth: noOp,
    setPodcastVideoLibraryCollapsed: noOp,
    setPodcastVideoStageMaxHeight: noOp,
    upsertPodcastVideoConfig: noOp,
    setComposerGenerationMode: noOp,
    setComposerVideoTableMode: noOp,
    setComposerVideoNoModifyMode: noOp,
    hydrateSessionReferenceMedia: async () => false,
    hydratePanelMusicLocalCaches: async () => false,
    rehydrateGeminiDialogueAudioMap: () => ({ changed: false, dialogueAudioMap: {} }),
    syncGeminiDialogueTrackWithRuntime: noOp,
    normalizeLegacyGeminiTrackOffsets: noOp,
    invalidateStudioRuntimeCache: noOp,
    getPodcastVideoConfig: () => ({}),
    render: () => { effects.render.push(state.activeSessionId); },
    prewarmSessionMediaWithOverlay: async (session) => {
      effects.prewarm.push(session?.id || "");
    },
  });

  const activationA = setActiveSession(sessionA.id, {
    forceHydrate: true,
    showLoader: false,
  });
  await Promise.resolve();
  assert.deepEqual(effects.cloudLoads, [sessionA.id]);

  const activationB = setActiveSession(sessionB.id, {
    forceHydrate: true,
    showLoader: false,
  });
  await activationB;

  assert.equal(state.activeSessionId, sessionB.id);
  assert.equal(sessionB.title, "Cloud B");
  assert.equal(sessionB.cloudPayload, "B wins");
  assert.deepEqual(effects.playbackSync, [sessionB.id]);
  assert.deepEqual(effects.render, [sessionB.id]);
  assert.deepEqual(effects.prewarm, [sessionB.id]);
  const completedBSnapshot = structuredClone(sessionB);

  cloudA.resolve({
    id: sessionA.id,
    title: "Late Cloud A",
    cloudPayload: "must be ignored",
    script: { rows: [{ id: "late-row-a" }] },
  });
  await activationA;

  assert.equal(state.activeSessionId, sessionB.id);
  assert.deepEqual(sessionB, completedBSnapshot, "late A cannot mutate active B");
  assert.equal(sessionA.title, "Local A", "late A cannot even hydrate its stale local target");
  assert.equal(sessionA.cloudPayload, undefined);
  assert.deepEqual(effects.playbackSync, [sessionB.id]);
  assert.deepEqual(effects.render, [sessionB.id]);
  assert.deepEqual(effects.prewarm, [sessionB.id]);
});
