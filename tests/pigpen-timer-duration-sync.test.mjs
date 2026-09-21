import assert from "node:assert/strict";
import test from "node:test";

import { buildEscapeRoomPackage, buildPreviewDocument } from "../public/js/escape-room-package-builder.mjs";

function buildDurationProject(durationMinutes) {
  return {
    titulo: "Duración manual",
    duracion_minutos: durationMinutes,
    misiones: []
  };
}

function readFingerprint(runtime = "") {
  return runtime.match(/const ESCAPE_ROOM_PROGRESS_FINGERPRINT = "([^"]+)"/)?.[1] || "";
}

test("manual duration controls preview, manifest and exported timer", () => {
  const durationMinutes = 7.5;
  const project = buildDurationProject(durationMinutes);
  const preview = buildPreviewDocument(project);
  const pkg = buildEscapeRoomPackage(project);
  const manifest = JSON.parse(pkg.files["assets/escape-room.json"]);

  assert.equal(manifest.duracion_minutos, durationMinutes);
  assert.match(preview, /data-timer-value>07:30</);
  assert.match(pkg.files["index.html"], /data-timer-value>07:30</);
  assert.match(pkg.files["assets/game.js"], /const DEFAULT_DURATION_MINUTES = 7\.5;/);
  assert.match(pkg.files["assets/game.js"], /state\.durationSeconds = normalizeDurationSeconds\(\(ESCAPE_ROOM_DATA\.duracion_minutos \|\| DEFAULT_DURATION_MINUTES\) \* 60\)/);
});

test("changing duration invalidates persisted timer state", () => {
  const firstRuntime = buildEscapeRoomPackage(buildDurationProject(7.5)).files["assets/game.js"];
  const changedRuntime = buildEscapeRoomPackage(buildDurationProject(8)).files["assets/game.js"];

  assert.ok(readFingerprint(firstRuntime));
  assert.ok(readFingerprint(changedRuntime));
  assert.notEqual(readFingerprint(firstRuntime), readFingerprint(changedRuntime));
});
