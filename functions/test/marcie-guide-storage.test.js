const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const storageModule = pathToFileURL(path.join(__dirname, "../../public/MarcieBlogEditor/js/components/marcie-guide-storage.mjs")).href;

test("la guía persiste un estado acotado sin transcripciones ni respuestas completas", async () => {
  const { createGuideSnapshot } = await import(storageModule);
  const snapshot = createGuideSnapshot({
    runId: "run-1",
    phase: "video_topic",
    input: "borrador",
    responseState: {
      phase: "video_topic",
      uiPrompt: { type: "single_choice", options: [{ id: "next", label: "Continuar" }] },
      configuration: { topic: "Salud mental", sourceInputs: { youtube: [{ videoId: "abc", transcript: "x".repeat(500_000) }] } },
      videoResearch: { videos: [{ title: "Video", summary: "s".repeat(500_000), transcript: "x".repeat(500_000) }] }
    },
    messages: Array.from({ length: 100 }, (_, index) => ({ role: "assistant", text: `Mensaje ${index}: ${"x".repeat(5000)}` }))
  });
  const serialized = JSON.stringify(snapshot);
  assert.ok(serialized.length <= 32_000);
  assert.equal(snapshot.runId, "run-1");
  assert.equal(snapshot.responseState.uiPrompt.options[0].id, "next");
  assert.ok(snapshot.messages.length <= 16);
  assert.ok(!serialized.includes("transcript"));
});

test("si se supera la cuota, reintenta con menos historial y deja seguir la guía", async () => {
  const { createGuideSnapshot, saveGuideSnapshot } = await import(storageModule);
  const stored = new Map();
  let attempts = 0;
  const storage = { setItem(key, value) {
    attempts += 1;
    if (value.length > 5000) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    stored.set(key, value);
  } };
  const snapshot = createGuideSnapshot({
    runId: "run-2", phase: "sources", responseState: { phase: "sources", uiPrompt: { type: "single_choice", options: [{ id: "scielo", label: "SciELO" }] } },
    messages: Array.from({ length: 16 }, () => ({ role: "assistant", text: "x".repeat(1100) }))
  });
  assert.equal(saveGuideSnapshot(storage, "guide", snapshot), true);
  assert.equal(attempts, 2);
  const restored = JSON.parse(stored.get("guide"));
  assert.equal(restored.runId, "run-2");
  assert.equal(restored.responseState.uiPrompt.options[0].id, "scielo");
  assert.equal(restored.messages.length, 3);
  assert.equal(saveGuideSnapshot({ setItem() { throw Object.assign(new Error("quota"), { name: "QuotaExceededError" }); } }, "guide", snapshot), false);
});

test("al llenarse localStorage conserva la guía en sessionStorage", async () => {
  const { createGuideSnapshot, saveGuideWithFallback } = await import(storageModule);
  const session = new Map();
  const fullStorage = { setItem() { throw Object.assign(new Error("quota"), { name: "QuotaExceededError" }); } };
  const sessionStorage = { setItem(key, value) { session.set(key, value); } };
  const snapshot = createGuideSnapshot({ runId: "run-3", phase: "sources", messages: [{ role: "assistant", text: "Elige plataforma" }] });
  const mode = saveGuideWithFallback(fullStorage, sessionStorage, "guide", snapshot);
  assert.equal(mode, "session");
  assert.equal(JSON.parse(session.get("guide")).runId, "run-3");
  assert.equal(saveGuideWithFallback(fullStorage, sessionStorage, "guide", snapshot, mode), "session");
  assert.equal(saveGuideWithFallback(fullStorage, fullStorage, "guide", snapshot, mode), "memory");
});
