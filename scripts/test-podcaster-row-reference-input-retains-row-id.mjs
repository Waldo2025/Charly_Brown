import assert from "node:assert/strict";

globalThis.window = globalThis;
window.setGenerationStatus = () => {};
window.addChatMessage = () => {};

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
        return {
          drawImage() {}
        };
      },
      toDataURL() {
        return "data:image/jpeg;base64,AAA";
      }
    };
  }
};

class FakeFileInput {
  constructor() {
    this.dataset = {};
    this.files = [];
    this.value = "";
    this.listeners = new Map();
    this.clickCount = 0;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    this.clickCount += 1;
  }

  async dispatch(type) {
    const handler = this.listeners.get(type);
    if (!handler) throw new Error(`No hay listener para ${type}`);
    await handler();
  }
}

const { createPodcasterMediaReferenceApi } = await import("../public/podcaster/podcaster-media-reference.js");

const input = new FakeFileInput();
let activeSession = {
  id: "session_row_refs",
  cloudMeta: {
    ownerId: "user_1",
    savedAt: "2026-05-18T00:00:00.000Z"
  },
  rowReferenceImageMap: {},
  rowReferenceImageListMap: {},
  rowReferenceVideoMap: {},
  rowReferenceModeByRowId: {}
};

const api = createPodcasterMediaReferenceApi({
  getElements: () => ({ rowReferenceImageInput: input }),
  getActiveSession: () => activeSession,
  nowIso: () => "2026-05-18T12:00:00.000Z",
  MAX_LOCAL_REFERENCE_IMAGE_DATA_URL_CHARS: 1_000_000,
  MAX_LOCAL_REFERENCE_VIDEO_DATA_URL_CHARS: 1_000_000,
  buildImageReferenceRecordFromMedia(raw = {}, fallbackName = "Referencia") {
    const dataUrl = String(raw.dataUrl || "").trim();
    if (!dataUrl.startsWith("data:image/")) return null;
    return {
      name: String(raw.name || fallbackName).trim() || fallbackName,
      dataUrl,
      mimeType: String(raw.mimeType || "image/jpeg").trim().toLowerCase() || "image/jpeg",
      updatedAt: String(raw.updatedAt || "2026-05-18T12:00:00.000Z").trim() || "2026-05-18T12:00:00.000Z"
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

api.promptRowReferenceSelection("row_1");
input.dataset.rowId = "";
input.files = [new File(["img-1"], "scene-1.png", { type: "image/png" })];
await input.dispatch("change");

api.promptRowReferenceSelection("row_2");
input.dataset.rowId = "";
input.files = [new File(["img-2"], "scene-2.png", { type: "image/png" })];
await input.dispatch("change");

assert.deepEqual(
  Object.keys(activeSession.rowReferenceImageMap).sort(),
  ["row_1", "row_2"],
  "Cada escena debe conservar su propia referencia aunque el dataset.rowId del input se pierda antes del change."
);

assert.equal(
  activeSession.rowReferenceImageListMap.row_1?.[0]?.name,
  "scene-1.png",
  "La referencia de la primera escena debe seguir asociada a row_1."
);

assert.equal(
  activeSession.rowReferenceImageListMap.row_2?.[0]?.name,
  "scene-2.png",
  "La referencia de la segunda escena debe quedar asociada a row_2."
);

console.log("Podcaster row reference input retains row id OK.");
