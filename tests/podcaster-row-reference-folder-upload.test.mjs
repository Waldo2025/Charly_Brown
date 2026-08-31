import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis;
globalThis.addChatMessage = () => {};
globalThis.setGenerationStatus = () => {};

const {
  createPodcasterMediaReferenceApi,
  validateRowReferenceFolderFiles
} = await import("../public/podcaster/podcaster-media-reference.js");

function folderFile(name, type = "image/png", relativeRoot = "referencias") {
  return { name, type, webkitRelativePath: `${relativeRoot}/${name}` };
}

function realFolderFile(name, relativeRoot = "referencias") {
  const file = new File([name], name, { type: "image/png" });
  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: `${relativeRoot}/${name}`
  });
  return file;
}

const rows = [
  { id: "row_1" },
  { id: "row_2" },
  { id: "row_3" }
];

test("folder validation maps flexible zero padding to one-based scene order", () => {
  const result = validateRowReferenceFolderFiles([
    folderFile("Escena001.png"),
    folderFile("escena2.PNG"),
    folderFile("Escena03.png"),
    { name: ".DS_Store", type: "", webkitRelativePath: "referencias/.DS_Store" },
    { name: "._Escena01.png", type: "application/octet-stream", webkitRelativePath: "referencias/._Escena01.png" }
  ], rows);

  assert.equal(result.ok, true);
  assert.deepEqual(result.assignments.map(({ rowId, sceneNumber, file }) => ({
    rowId,
    sceneNumber,
    name: file.name
  })), [
    { rowId: "row_1", sceneNumber: 1, name: "Escena001.png" },
    { rowId: "row_2", sceneNumber: 2, name: "escena2.PNG" },
    { rowId: "row_3", sceneNumber: 3, name: "Escena03.png" }
  ]);
});

test("folder validation rejects missing, duplicate, extra, nested, and non-PNG images", () => {
  const duplicate = validateRowReferenceFolderFiles([
    folderFile("Escena1.png"),
    folderFile("Escena01.png"),
    folderFile("Escena3.png")
  ], rows);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join(" "), /duplicadas.*1/i);
  assert.match(duplicate.errors.join(" "), /Faltan.*2/i);

  const invalid = validateRowReferenceFolderFiles([
    folderFile("Escena1.png"),
    folderFile("Escena2.jpg", "image/jpeg"),
    folderFile("Escena3.png", "image/png", "referencias/subcarpeta"),
    folderFile("Escena4.png")
  ], rows);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /fuera de la carpeta principal/i);
  assert.match(invalid.errors.join(" "), /fuera de rango.*4/i);
});

test("invalid folders are rejected before mutating the active session", async () => {
  let mutationCount = 0;
  const activeSession = { id: "session_invalid_folder", script: { rows } };
  const api = createPodcasterMediaReferenceApi({
    getActiveSession: () => activeSession,
    upsertActiveSession() { mutationCount += 1; }
  });

  const result = await api.applyRowReferenceFolderFiles([
    folderFile("Escena1.png"),
    folderFile("Escena2.png")
  ]);

  assert.equal(result.ok, false);
  assert.equal(mutationCount, 0);
});

test("a preparation failure leaves every scene reference untouched", async () => {
  let mutationCount = 0;
  let readCount = 0;
  const activeSession = {
    id: "session_atomic_failure",
    script: { rows: rows.slice(0, 2) },
    rowReferenceImageMap: {},
    rowReferenceImageListMap: {},
    rowReferenceVideoMap: {},
    rowReferenceModeByRowId: {}
  };
  const api = createPodcasterMediaReferenceApi({
    getActiveSession: () => activeSession,
    nowIso: () => "2026-08-29T12:00:00.000-05:00",
    readOptimizedImageReferenceDataUrl: async () => {
      readCount += 1;
      if (readCount === 2) throw new Error("imagen dañada");
      return "data:image/png;base64,VALID";
    },
    buildImageReferenceRecordFromMedia(raw = {}) {
      return String(raw.dataUrl || "").startsWith("data:image/") ? { ...raw } : null;
    },
    upsertActiveSession() { mutationCount += 1; }
  });

  const result = await api.applyRowReferenceFolderFiles([
    realFolderFile("Escena1.png"),
    realFolderFile("Escena02.png")
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "processing-failed");
  assert.equal(mutationCount, 0);
  assert.deepEqual(activeSession.rowReferenceImageMap, {});
});

test("bulk assignment replaces prior image lists and video references in one mutation", async () => {
  let mutationCount = 0;
  let bulkRefreshCount = 0;
  let releaseUploads;
  const uploadGate = new Promise((resolve) => { releaseUploads = resolve; });
  let activeSession = {
    id: "session_bulk_folder",
    script: { rows: rows.slice(0, 2) },
    rowReferenceImageMap: {
      row_1: { name: "old.png", dataUrl: "data:image/png;base64,OLD", mimeType: "image/png" }
    },
    rowReferenceImageListMap: {
      row_1: [
        { name: "old.png", dataUrl: "data:image/png;base64,OLD", mimeType: "image/png" },
        { name: "old-2.png", dataUrl: "data:image/png;base64,OLD2", mimeType: "image/png" }
      ]
    },
    rowReferenceVideoMap: {
      row_2: { name: "old.mp4", dataUrl: "data:video/mp4;base64,OLD", mimeType: "video/mp4" }
    },
    rowReferenceModeByRowId: { row_1: "image", row_2: "video" }
  };
  const api = createPodcasterMediaReferenceApi({
    getActiveSession: () => activeSession,
    nowIso: () => "2026-08-29T12:00:00.000-05:00",
    MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS: 1_000_000,
    MAX_LOCAL_REFERENCE_VIDEO_DATA_URL_CHARS: 1_000_000,
    buildImageReferenceRecordFromMedia(raw = {}) {
      return String(raw.dataUrl || "").startsWith("data:image/")
        ? { ...raw, mimeType: String(raw.mimeType || "image/png") }
        : null;
    },
    normalizeMediaReferenceFromRecord: (raw = {}) => ({
      downloadUrl: String(raw.downloadUrl || ""),
      storagePath: String(raw.storagePath || "")
    }),
    upsertActiveSession(mutator) {
      mutationCount += 1;
      activeSession = mutator(activeSession);
      return activeSession;
    },
    uploadReferenceImageToStorage: async (reference, options) => {
      await uploadGate;
      return {
        storagePath: `references/${options.id}.png`,
        downloadUrl: `https://storage.example/${options.id}.png`,
        mimeType: reference.mimeType
      };
    },
    refreshBulkRowReferenceUi() { bulkRefreshCount += 1; },
    scheduleSessionLocalPersist() {},
    resolveCurrentUid: () => ""
  });

  const result = await api.setRowReferenceImagesBulk([
    {
      rowId: "row_1",
      sceneNumber: 1,
      reference: { name: "Escena1.png", dataUrl: "data:image/png;base64,NEW1", mimeType: "image/png" }
    },
    {
      rowId: "row_2",
      sceneNumber: 2,
      reference: { name: "Escena02.png", dataUrl: "data:image/png;base64,NEW2", mimeType: "image/png" }
    }
  ]);

  assert.equal(mutationCount, 1, "all local assignments must commit atomically");
  assert.equal(bulkRefreshCount, 1);
  assert.deepEqual(activeSession.rowReferenceImageListMap.row_1.map((item) => item.name), ["Escena1.png"]);
  assert.deepEqual(activeSession.rowReferenceImageListMap.row_2.map((item) => item.name), ["Escena02.png"]);
  assert.equal(activeSession.rowReferenceVideoMap.row_2, undefined);
  assert.equal(activeSession.rowReferenceModeByRowId.row_2, "image");

  releaseUploads();
  const uploadResult = await result.uploadPromise;
  assert.equal(uploadResult.ok, true);
  assert.equal(uploadResult.uploadedCount, 2);
  assert.match(activeSession.rowReferenceImageMap.row_1.storagePath, /row_1:0\.png$/);
});

test("failed cloud uploads keep the complete local bulk assignment", async () => {
  let activeSession = {
    id: "session_bulk_local_fallback",
    script: { rows: rows.slice(0, 2) },
    rowReferenceImageMap: {},
    rowReferenceImageListMap: {},
    rowReferenceVideoMap: {},
    rowReferenceModeByRowId: {}
  };
  const api = createPodcasterMediaReferenceApi({
    getActiveSession: () => activeSession,
    nowIso: () => "2026-08-29T12:00:00.000-05:00",
    buildImageReferenceRecordFromMedia(raw = {}) {
      return String(raw.dataUrl || "").startsWith("data:image/") ? { ...raw } : null;
    },
    normalizeMediaReferenceFromRecord: () => ({ downloadUrl: "", storagePath: "" }),
    upsertActiveSession(mutator) {
      activeSession = mutator(activeSession);
      return activeSession;
    },
    uploadReferenceImageToStorage: async () => null,
    refreshBulkRowReferenceUi() {},
    scheduleSessionLocalPersist() {},
    resolveCurrentUid: () => ""
  });

  const result = await api.setRowReferenceImagesBulk([
    { rowId: "row_1", sceneNumber: 1, reference: { name: "Escena1.png", dataUrl: "data:image/png;base64,A" } },
    { rowId: "row_2", sceneNumber: 2, reference: { name: "Escena2.png", dataUrl: "data:image/png;base64,B" } }
  ]);
  const uploadResult = await result.uploadPromise;

  assert.equal(uploadResult.ok, false);
  assert.equal(uploadResult.failedCount, 2);
  assert.deepEqual(Object.keys(activeSession.rowReferenceImageMap).sort(), ["row_1", "row_2"]);
  assert.equal(activeSession.rowReferenceImageMap.row_1.name, "Escena1.png");
  assert.equal(activeSession.rowReferenceImageMap.row_2.name, "Escena2.png");
});

test("Editor Snoopy exposes the bulk folder button and directory input", () => {
  const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
  assert.match(html, /id="attachAllRowReferenceImagesBtn"[\s\S]*?data-action="attach-all-row-reference-images"/);
  assert.match(html, /id="rowReferenceFolderInput"[^>]*webkitdirectory[^>]*multiple/);
  assert.match(app, /rowReferenceFolderInput:\s*document\.getElementById\("rowReferenceFolderInput"\)/);
  assert.match(app, /attachAllRowReferenceImagesBtn:\s*document\.getElementById\("attachAllRowReferenceImagesBtn"\)/);
});
