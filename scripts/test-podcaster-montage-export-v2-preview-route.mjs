import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

function readSource(path) {
  try {
    return readFileSync(new URL(path, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

const htmlSource = readSource("../public/podcaster.html");
const podcasterSource = readSource("../public/podcaster/podcaster.js");
const legacyExportSource = readSource("../public/podcaster/podcaster-montage-export.js");
const exportV2Source = readSource("../public/podcaster/podcaster-montage-export-v2.js");
const backendSource = readSource("../backend/server.js");

test("podcaster loads the preview-faithful montage export v2 module", () => {
  assert.match(htmlSource, /podcaster\/podcaster-montage-export-v2\.js\?v=/);
  assert.match(podcasterSource, /podcaster-montage-export-v2\.js\?v=/);
  assert.match(podcasterSource, /handleMontageExportConfirmClickV2 as handleMontageExportConfirmClick/);
});

test("export v2 submits the preview runtime contract to a new FFmpeg route", () => {
  assert.match(legacyExportSource, /export async function buildMontageExportPayloadForSubmission/);
  assert.match(exportV2Source, /buildPreviewRuntimeSnapshot/);
  assert.match(exportV2Source, /ffmpeg-preview-runtime-v2/);
  assert.match(exportV2Source, /\/api\/podcaster\/montage\/export-v2/);
});

test("backend exposes export-v2 as an FFmpeg preview-runtime pipeline", () => {
  assert.match(backendSource, /app\.post\("\/api\/podcaster\/montage\/export-v2"/);
  assert.match(backendSource, /normalizeMontageExportV2RequestBody/);
  assert.match(backendSource, /applyMontageExportV2PreviewRuntime/);
  assert.match(backendSource, /ffmpeg_preview_runtime/);
});
