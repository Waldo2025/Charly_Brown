import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis;

const { createPodcasterMediaReferenceApi } = await import("../public/podcaster/podcaster-media-reference.js");

test("scene generation can wait until its reference has a durable Storage path", async () => {
  let releaseUpload;
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  let activeSession = {
    id: "session_upload_gate",
    rowReferenceImageMap: {},
    rowReferenceImageListMap: {},
    rowReferenceVideoMap: {},
    rowReferenceModeByRowId: {}
  };

  const api = createPodcasterMediaReferenceApi({
    getActiveSession: () => activeSession,
    nowIso: () => "2026-08-26T18:00:00.000-05:00",
    MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS: 1_000_000,
    buildImageReferenceRecordFromMedia(raw = {}, fallbackName = "Referencia") {
      const dataUrl = String(raw.dataUrl || "").trim();
      const storagePath = String(raw.storagePath || "").trim();
      if (!dataUrl.startsWith("data:image/") && !storagePath) return null;
      return {
        ...raw,
        name: String(raw.name || fallbackName),
        dataUrl,
        storagePath,
        mimeType: String(raw.mimeType || "image/png")
      };
    },
    normalizeMediaReferenceFromRecord: (raw = {}) => ({
      downloadUrl: String(raw.downloadUrl || ""),
      storagePath: String(raw.storagePath || "")
    }),
    upsertActiveSession(mutator) {
      activeSession = mutator(activeSession);
      return activeSession;
    },
    uploadReferenceImageToStorage: async () => {
      await uploadGate;
      return {
        storagePath: "podcaster/sessions/session_upload_gate/owners/user_1/references/scene-5.png",
        downloadUrl: "https://storage.example/scene-5.png"
      };
    },
    renderScript() {},
    syncPodcastStudioInspector() {},
    renderPodcastVideoShell() {},
    renderCreativeVideoShell() {},
    scheduleSessionLocalPersist() {},
    resolveCurrentUid: () => ""
  });

  await api.setRowReferenceImages("row_5", [{
    name: "scene-5.png",
    dataUrl: "data:image/png;base64,AAA",
    mimeType: "image/png"
  }]);

  assert.equal(api.getRowReferenceImageList(activeSession, "row_5")[0].storagePath, "");
  let waitFinished = false;
  const wait = api.waitForRowReferenceUploads("row_5").then((result) => {
    waitFinished = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(waitFinished, false, "generation must remain gated while upload is pending");

  releaseUpload();
  const result = await wait;
  assert.equal(result.ok, true);
  assert.equal(result.uploadedCount, 1);
  assert.match(api.getRowReferenceImageList(activeSession, "row_5")[0].storagePath, /scene-5\.png$/);
});

test("video generation rejects a local-only scene reference before creating a paid job", () => {
  const source = readFileSync(
    new URL("../public/podcaster/podcaster-video-generator.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /waitForRowReferenceUploads\(key\)/);
  assert.match(source, /reference_image_upload_required/);
  assert.match(source, /no termin[oó] de subirse/);
});
