import assert from "node:assert/strict";
import test from "node:test";

globalThis.window ??= {};
window.location ??= {
  origin: "https://example.test",
  href: "https://example.test/podcaster.html",
};

globalThis.HTMLMediaElement ??= {
  HAVE_NOTHING: 0,
  HAVE_METADATA: 1,
  HAVE_CURRENT_DATA: 2,
  HAVE_FUTURE_DATA: 3,
  HAVE_ENOUGH_DATA: 4,
};

const { PodcasterPlaybackController } = await import(
  "../public/podcaster/podcaster-playback-controller.js"
);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createVideoEntry(rowId, videoSrc, startMs) {
  return {
    rowId,
    videoSrc,
    startMs,
    endMs: startMs + 8_000,
    effectiveDurationMs: 8_000,
    durationMs: 8_000,
    clip: {
      rowId,
      type: "video",
      downloadUrl: videoSrc,
      durationMs: 8_000,
      sourceDurationMs: 8_000,
    },
  };
}

test("row invalidation walks primary, generated-video, and stop-motion media sources", async () => {
  const rowId = "nested-media-row";
  const clip = {
    downloadUrl: "https://cdn.example.test/top-level.mp4",
    primarySegment: {
      downloadUrl: "https://cdn.example.test/primary.mp4",
      storagePath: "gs://bucket/primary.mp4",
      sourceUrl: "https://origin.example.test/primary-source.mp4",
      localMediaCacheKey: "primary-local-key",
    },
    generatedVideos: [{
      video: {
        downloadUrl: "https://cdn.example.test/generated.mp4",
        storagePath: "gs://bucket/generated.mp4",
      },
    }],
    stopMotion: {
      frames: [
        {
          sourceUrl: "https://cdn.example.test/frame-1.png",
          localDataUrl: "podcaster-local-media:frame-local-key",
        },
        {
          downloadUrl: "https://cdn.example.test/frame-2.png",
          storagePath: "gs://bucket/frame-2.png",
        },
      ],
    },
  };
  const session = {
    id: "nested-media-session",
    dialogueVideoMap: { [rowId]: clip },
  };
  const invalidated = [];
  const controller = new PodcasterPlaybackController();
  controller.state.session = session;
  controller.getBlobUrlSync = () => "";
  controller.invalidateAuthorizedAssetSource = () => {};
  controller.invalidateBlobUrl = async (source) => {
    invalidated.push(String(source));
    return true;
  };
  let preparationCalls = 0;
  controller.prepareSessionMedia = async () => {
    preparationCalls += 1;
    return true;
  };
  controller.deps = {
    resolveStorageVideoUrl: (downloadUrl, storagePath) => {
      const source = String(storagePath || downloadUrl || "").trim();
      return source ? `resolved:${source}` : "";
    },
  };

  assert.equal(await controller.invalidateRowMediaCache(rowId, session, { previousClip: clip }), true);

  const invalidatedSet = new Set(invalidated);
  [
    "https://cdn.example.test/top-level.mp4",
    "https://cdn.example.test/primary.mp4",
    "gs://bucket/primary.mp4",
    "https://origin.example.test/primary-source.mp4",
    "primary-local-key",
    "podcaster-local-media:primary-local-key",
    "https://cdn.example.test/generated.mp4",
    "gs://bucket/generated.mp4",
    "https://cdn.example.test/frame-1.png",
    "podcaster-local-media:frame-local-key",
    "frame-local-key",
    "https://cdn.example.test/frame-2.png",
    "gs://bucket/frame-2.png",
  ].forEach((source) => {
    assert.equal(invalidatedSet.has(source), true, `expected invalidation for ${source}`);
  });
  assert.equal(preparationCalls, 2, "the changed row is hydrated and the stable manifest reconciled");
});

test("row invalidation preserves an unrelated full-session download and Play waits for the row refresh", async () => {
  const sourceA = "https://cdn.example.test/row-a.mp4";
  const sourceB = "https://cdn.example.test/row-b.mp4";
  const entries = [
    createVideoEntry("row-a", sourceA, 0),
    createVideoEntry("row-b", sourceB, 8_000),
  ];
  const session = {
    id: "isolated-row-session",
    script: { rows: [{ id: "row-a" }, { id: "row-b" }] },
    dialogueVideoMap: {
      "row-a": entries[0].clip,
      "row-b": entries[1].clip,
    },
  };
  const rowBDownload = createDeferred();
  const rowBStarted = createDeferred();
  const rowARefresh = createDeferred();
  const rowARefreshStarted = createDeferred();
  const invalidationStarted = createDeferred();
  let rowACached = true;
  let rowBCached = false;
  let rowANetworkStarts = 0;
  let rowBNetworkStarts = 0;
  let rowBAbortedWhilePending = 0;
  let rowBPending = false;
  let clockStarts = 0;

  const controller = new PodcasterPlaybackController();
  controller.state.session = session;
  controller.state.currentMs = 0;
  controller.state.totalDurationMs = 16_000;
  controller.getBlobUrl = async (source, options = {}) => {
    if (source === sourceA) {
      if (rowACached) return "blob:row-a-cached";
      rowANetworkStarts += 1;
      rowARefreshStarted.resolve();
      const refreshed = await rowARefresh.promise;
      rowACached = true;
      return refreshed;
    }
    if (source === sourceB) {
      if (rowBCached) return "blob:row-b-cached";
      rowBNetworkStarts += 1;
      rowBPending = true;
      options.signal?.addEventListener?.("abort", () => {
        if (rowBPending) rowBAbortedWhilePending += 1;
      }, { once: true });
      rowBStarted.resolve();
      const hydrated = await rowBDownload.promise;
      rowBPending = false;
      rowBCached = true;
      return hydrated;
    }
    throw new Error(`unexpected source: ${source}`);
  };
  controller.getBlobUrlSync = () => "";
  controller.invalidateAuthorizedAssetSource = () => {};
  controller.invalidateBlobUrl = async (source) => {
    if (String(source) === sourceA) {
      rowACached = false;
      invalidationStarted.resolve();
    }
    return true;
  };
  controller.sync = () => {};
  controller.initAudioContext = () => null;
  controller.getOrCreateBackgroundAudioElement = () => null;
  controller.preparePlaybackRange = async () => true;
  controller.prepareStageSlotsAtMs = async () => true;
  controller.getEntryAtMs = () => null;
  controller.syncAudio = async () => true;
  controller.prewarmTimelineStageVideos = async () => true;
  controller.syncStageMediaMotionPlaybackState = () => {};
  controller.startClock = () => { clockStarts += 1; };
  controller.deps = {
    buildTimelineRuntimeEntries: () => entries,
    getPodcastVideoConfig: () => ({ geminiDialogueTrack: { enabled: true, segments: [] } }),
    getPanelMontageMusicConfig: () => ({ sourceType: "none", sourceItems: [] }),
    resolveDialogueAudioForRow: () => null,
    getPlaybackSpeed: () => 1,
    setPodcastVideoStatus: () => {},
    updatePodcastVideoTransportUi: () => {},
  };

  const fullPreparation = controller.prepareSessionMedia({ session });
  await rowBStarted.promise;
  assert.equal(rowBNetworkStarts, 1);

  const rowInvalidation = controller.invalidateRowMediaCache("row-a", session, {
    previousClip: entries[0].clip,
    nextClip: { ...entries[0].clip, downloadUrl: sourceA },
  });
  await invalidationStarted.promise;

  let playSettled = false;
  const playRequest = controller.play(0).then((result) => {
    playSettled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(playSettled, false);
  assert.equal(rowBAbortedWhilePending, 0, "row B must keep its original in-flight signal");
  assert.equal(rowBNetworkStarts, 1, "row B must not restart while its first download is pending");

  rowBDownload.resolve("blob:row-b-cached");
  await fullPreparation;
  await rowARefreshStarted.promise;
  await Promise.resolve();

  assert.equal(playSettled, false, "Play must wait for the invalidated row to finish hydrating");
  assert.equal(rowBAbortedWhilePending, 0);
  assert.equal(rowBNetworkStarts, 1);

  rowARefresh.resolve("blob:row-a-refreshed");
  assert.equal(await rowInvalidation, true);
  assert.equal(await playRequest, true);
  assert.equal(rowANetworkStarts, 1);
  assert.equal(rowBNetworkStarts, 1, "manifest reconciliation must reuse row B's hydrated cache");
  assert.equal(clockStarts, 1);
});

test("two nearby row invalidations retain independent generations and both complete", async () => {
  const session = {
    id: "two-row-invalidations",
    dialogueVideoMap: {
      "row-a": { downloadUrl: "https://cdn.example.test/a.mp4" },
      "row-b": { downloadUrl: "https://cdn.example.test/b.mp4" },
    },
  };
  const rowAGate = createDeferred();
  const rowBGate = createDeferred();
  const rowAStarted = createDeferred();
  const rowBStarted = createDeferred();
  const hydratedRows = [];
  const controller = new PodcasterPlaybackController();
  controller.state.session = session;
  controller.getBlobUrlSync = () => "";
  controller.invalidateAuthorizedAssetSource = () => {};
  controller.invalidateBlobUrl = async () => true;
  controller.prepareSessionMedia = async (options = {}) => {
    const rowId = options.onlyRowIds?.[0] || "";
    if (!rowId) return true;
    hydratedRows.push(rowId);
    if (rowId === "row-a") {
      rowAStarted.resolve();
      await rowAGate.promise;
    } else if (rowId === "row-b") {
      rowBStarted.resolve();
      await rowBGate.promise;
    }
    return true;
  };
  controller.deps = {};

  const invalidationA = controller.invalidateRowMediaCache("row-a", session);
  const invalidationB = controller.invalidateRowMediaCache("row-b", session);

  await rowAStarted.promise;
  let invalidationBSettled = false;
  invalidationB.then(() => { invalidationBSettled = true; });
  await Promise.resolve();
  assert.equal(invalidationBSettled, false);
  assert.equal(controller.getRowMediaGeneration("row-a"), 1);
  assert.equal(controller.getRowMediaGeneration("row-b"), 1);

  rowAGate.resolve();
  assert.equal(await invalidationA, true);
  await rowBStarted.promise;
  rowBGate.resolve();
  assert.equal(await invalidationB, true);

  await Promise.resolve();
  assert.deepEqual(hydratedRows, ["row-a", "row-b"]);
  assert.equal(controller.rowMediaPreparationPromises.size, 0);
});
