import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;

await import("../public/podcaster/podcaster-script-editor.js");
const { updateSingleScriptRow } = window.PodcasterScriptEditor;

test("scene field editing replaces only the selected row", () => {
  const first = { id: "row_1", sceneDescription: "Primera" };
  const second = { id: "row_2", sceneDescription: "Anterior" };
  const third = { id: "row_3", sceneDescription: "Tercera" };
  const rows = [first, second, third];
  const next = updateSingleScriptRow({ script: { rows } }, "row_2", (row) => ({
    ...row,
    sceneDescription: "Actualizada"
  }));

  assert.notEqual(next, rows);
  assert.equal(next[0], first);
  assert.notEqual(next[1], second);
  assert.equal(next[1].sceneDescription, "Actualizada");
  assert.equal(next[2], third);
  assert.equal(second.sceneDescription, "Anterior");
});
