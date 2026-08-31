import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis;

const { createPodcasterMediaReferenceApi } = await import("../public/podcaster/podcaster-media-reference.js");

test("row reference updates use the focused UI refresh without full editor renders", async () => {
  let activeSession = {
    id: "session_background_reference",
    rowReferenceImageMap: {},
    rowReferenceImageListMap: {},
    rowReferenceVideoMap: {},
    rowReferenceModeByRowId: {}
  };
  let upsertOptions = null;
  let focusedRefreshes = 0;
  let fullRenders = 0;
  const api = createPodcasterMediaReferenceApi({
    getActiveSession: () => activeSession,
    nowIso: () => "2026-08-27T08:00:00.000-05:00",
    MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS: 1_000_000,
    buildImageReferenceRecordFromMedia(raw = {}) {
      return String(raw.dataUrl || "").startsWith("data:image/")
        ? { ...raw, mimeType: String(raw.mimeType || "image/jpeg") }
        : null;
    },
    normalizeMediaReferenceFromRecord: () => ({ downloadUrl: "", storagePath: "" }),
    upsertActiveSession(mutator, options) {
      upsertOptions = options;
      activeSession = mutator(activeSession);
      return activeSession;
    },
    refreshRowReferenceUi(rowId, session) {
      assert.equal(rowId, "row_1");
      assert.equal(session, activeSession);
      focusedRefreshes += 1;
    },
    renderScript() { fullRenders += 1; },
    renderPodcastVideoShell() { fullRenders += 1; },
    renderCreativeVideoShell() { fullRenders += 1; },
    scheduleSessionLocalPersist() {},
    resolveCurrentUid: () => ""
  });

  await api.setRowReferenceImages("row_1", [{
    name: "reference.jpg",
    dataUrl: "data:image/jpeg;base64,AAA",
    mimeType: "image/jpeg"
  }]);

  assert.equal(focusedRefreshes, 1);
  assert.equal(fullRenders, 0);
  assert.equal(upsertOptions.lightweight, true);
  assert.equal(upsertOptions.persist, false);
  assert.equal(upsertOptions.recordHistory, false);
  assert.equal(upsertOptions.syncThread, false);
});

test("image reference compression runs in a dedicated worker", () => {
  const moduleSource = readFileSync(new URL("../public/podcaster/podcaster-media-reference.js", import.meta.url), "utf8");
  const workerSource = readFileSync(new URL("../public/podcaster/podcaster-image-reference-worker.js", import.meta.url), "utf8");
  assert.match(moduleSource, /new Worker\(workerUrl, \{ type: "module"/);
  assert.match(moduleSource, /processImageReferenceInWorker\(file/);
  assert.match(workerSource, /createImageBitmap\(file\)/);
  assert.match(workerSource, /new OffscreenCanvas\(targetWidth, targetHeight\)/);
  assert.match(workerSource, /canvas\.convertToBlob/);
});
