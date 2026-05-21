import test from "node:test";
import assert from "node:assert/strict";

class FakeFileReader {
  constructor() {
    this.result = "";
    this.onload = null;
    this.onerror = null;
  }

  readAsDataURL(file) {
    this.result = `data:${file.type || "image/png"};base64,AAA`;
    queueMicrotask(() => {
      this.onload?.({ target: this });
    });
  }
}

class FakeImage {
  constructor() {
    this.width = 100;
    this.height = 100;
    this.onload = null;
    this.onerror = null;
  }

  set src(_value) {
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

class FakeFileInput {
  constructor() {
    this.dataset = {};
    this.files = [];
    this.value = "";
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {}

  async dispatch(type) {
    const handler = this.listeners.get(type);
    if (!handler) throw new Error(`No hay listener para ${type}`);
    await handler();
  }
}

test("adding a scene reference preserves older scene references even from legacy primary-only state", async () => {
  globalThis.window = globalThis;
  window.setGenerationStatus = () => {};
  window.addChatMessage = () => {};
  globalThis.FileReader = FakeFileReader;
  globalThis.Image = FakeImage;
  globalThis.document = {
    createElement(tagName = "") {
      if (String(tagName).toLowerCase() !== "canvas") {
        throw new Error(`Elemento no soportado en test: ${tagName}`);
      }
      return {
        width: 0,
        height: 0,
        getContext() {
          return { drawImage() {} };
        },
        toDataURL() {
          return "data:image/jpeg;base64,AAA";
        }
      };
    }
  };

  const { createPodcasterMediaReferenceApi } = await import("../public/podcaster/podcaster-media-reference.js");
  const input = new FakeFileInput();
  let activeSession = {
    id: "session_legacy_refs",
    rowReferenceImageMap: {
      row_1: {
        name: "legacy-scene-1.png",
        dataUrl: "data:image/jpeg;base64,LEGACY",
        mimeType: "image/jpeg",
        updatedAt: "2026-05-20T10:00:00.000Z"
      }
    },
    rowReferenceImageListMap: {},
    rowReferenceVideoMap: {},
    rowReferenceModeByRowId: {
      row_1: "image"
    }
  };

  const api = createPodcasterMediaReferenceApi({
    getElements: () => ({ rowReferenceImageInput: input }),
    getActiveSession: () => activeSession,
    nowIso: () => "2026-05-20T12:00:00.000Z",
    MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS: 1_000_000,
    MAX_LOCAL_REFERENCE_VIDEO_DATA_URL_CHARS: 1_000_000,
    buildImageReferenceRecordFromMedia(raw = {}, fallbackName = "Referencia") {
      const dataUrl = String(raw.dataUrl || "").trim();
      if (!dataUrl.startsWith("data:image/")) return null;
      return {
        name: String(raw.name || fallbackName).trim() || fallbackName,
        dataUrl,
        mimeType: String(raw.mimeType || "image/jpeg").trim().toLowerCase() || "image/jpeg",
        updatedAt: String(raw.updatedAt || "2026-05-20T12:00:00.000Z").trim() || "2026-05-20T12:00:00.000Z"
      };
    },
    normalizeMediaReferenceFromRecord(raw = {}) {
      return {
        downloadUrl: String(raw.downloadUrl || "").trim(),
        storagePath: String(raw.storagePath || "").trim()
      };
    },
    upsertActiveSession(mutator) {
      activeSession = mutator(activeSession);
      return activeSession;
    },
    renderScript() {},
    syncPodcastStudioInspector() {},
    renderPodcastVideoShell() {},
    renderCreativeVideoShell() {},
    scheduleSessionLocalPersist() {},
    setPodcastVideoRow() {},
    resolveSceneNumberByRowId(rowId = "") {
      return rowId === "row_1" ? 1 : 2;
    },
    resolveCurrentUid() {
      return "";
    }
  });

  api.bindInputEvents();
  api.promptRowReferenceSelection("row_2");
  input.files = [new File(["img-2"], "scene-2.png", { type: "image/png" })];
  await input.dispatch("change");

  assert.deepEqual(
    Object.keys(activeSession.rowReferenceImageMap).sort(),
    ["row_1", "row_2"]
  );
  assert.equal(activeSession.rowReferenceImageListMap.row_1?.[0]?.name, "legacy-scene-1.png");
  assert.equal(activeSession.rowReferenceImageListMap.row_2?.[0]?.name, "scene-2.png");
});
