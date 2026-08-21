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
const restartRecoverySource = readSource("../backend/montage-export/restart-recovery.js");
const renderSource = readSource("../render.yaml");

test("podcaster loads the preview-faithful montage export v2 module", () => {
  assert.match(htmlSource, /data-cache-src="podcaster\/podcaster\.js"[^>]*data-cache-type="module"/);
  assert.match(podcasterSource, /podcaster-montage-export-v2\.js/);
  assert.match(podcasterSource, /handleMontageExportConfirmClickV2 as handleMontageExportConfirmClick/);
});

test("ready export status exposes and downloads result URLs", () => {
  assert.match(legacyExportSource, /data\?\.result\?\.downloadUrl/);
  assert.match(legacyExportSource, /autoDownloadTriggered/);
  assert.match(legacyExportSource, /downloadReadyMontageExport\(\)/);
});

test("export v2 stores the job id in the global polling state", () => {
  assert.match(exportV2Source, /const activeJobState = window\.montageExportJobState \|\| \{\}/);
  assert.match(exportV2Source, /activeJobState\.jobId = jobId/);
  assert.match(exportV2Source, /window\.montageExportJobState = activeJobState/);
  assert.doesNotMatch(exportV2Source, /montageExportJobState\.jobId = jobId/);
});

test("export v2 submits the preview runtime contract to a new FFmpeg route", () => {
  assert.match(legacyExportSource, /export async function buildMontageExportPayloadForSubmission/);
  assert.match(exportV2Source, /buildPreviewRuntimeSnapshot/);
  assert.match(exportV2Source, /ffmpeg-preview-runtime-v2/);
  assert.match(exportV2Source, /\/api\/podcaster\/montage\/export-v2/);
  assert.match(exportV2Source, /ffmpeg_preview_runtime_v2_request/);
  assert.match(exportV2Source, /ffmpeg_preview_runtime_v2_response/);
  assert.match(exportV2Source, /renderOnScreenTextFrames:\s*true/);
  assert.match(exportV2Source, /renderedTextFrameCount\s*<\s*1/);
  assert.match(exportV2Source, /onScreenTextMode:\s*onlyAudio\s*\?\s*"disabled_audio_only"\s*:\s*"rendered_png_overlay"/);
  assert.match(exportV2Source, /const submissionPayload = \{[\s\S]*\.\.\.stripMontageExportSubmissionPayload\(payload\)[\s\S]*onlyAudio,[\s\S]*format:[\s\S]*body: submissionPayload/);
  assert.doesNotMatch(exportV2Source, /onScreenTextMode:\s*"ass"/);
});

test("export v2 imports only exported montage-export helpers", () => {
  [
    "buildMontageExportPayloadForSubmission",
    "clearMontageExportPolling",
    "continueMontageExportPolling",
    "getMontagePreviewRowId",
    "logMontageExportDevtools",
    "pollMontageExportJob",
    "resetMontageExportJobState",
    "setMontageExportBusy",
    "setMontageExportContinueButton",
    "setMontageExportDownloadButton",
    "setMontageExportProgress",
    "setMontageExportStatus",
    "stripMontageExportSubmissionPayload"
  ].forEach((name) => {
    assert.match(exportV2Source, new RegExp(`\\b${name}\\b`));
    assert.match(legacyExportSource, new RegExp(`export (?:async )?(?:function|let|const) ${name}\\b`));
  });
  assert.doesNotMatch(exportV2Source, /import \{[\s\S]*montageExportJobState[\s\S]*\} from/);
  assert.doesNotMatch(exportV2Source, /import \{[\s\S]*montageExportState[\s\S]*\} from/);
});

test("backend exposes export-v2 as an FFmpeg preview-runtime pipeline", () => {
  assert.match(backendSource, /app\.post\("\/api\/podcaster\/montage\/export-v2"/);
  assert.match(backendSource, /normalizeMontageExportV2RequestBody/);
  assert.match(backendSource, /applyMontageExportV2PreviewRuntime/);
  assert.match(backendSource, /\[backend\]\[montage-export-v2\]\[request-received\]/);
  assert.match(backendSource, /\[backend\]\[montage-export-v2\]\[enqueue\]/);
  assert.match(backendSource, /v2_requires_worker_isolation/);
  assert.match(backendSource, /\[backend\]\[montage-export-v2\]\[direct-started\]/);
  assert.match(backendSource, /ffmpeg_preview_runtime/);
});

test("export-status resumes v2 jobs with the preview-runtime payload intact", () => {
  assert.match(backendSource, /function normalizeMontageExportResumeRequestBody/);
  assert.match(backendSource, /normalizeMontageExportV2RequestBody\(body\)/);
  assert.match(backendSource, /normalizeMontageExportResumeRequestBody\(request\.input\)/);
  assert.match(restartRecoverySource, /isPreviewRuntimeV2/);
  assert.match(restartRecoverySource, /queueAvailable && !isPreviewRuntimeV2/);
});

test("Render export services emit short FFmpeg heartbeats", () => {
  assert.match(renderSource, /name:\s+snoopy-export[\s\S]*MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS\s*\n\s*value:\s+2000/);
  assert.match(renderSource, /name:\s+charly-brown-podcaster-export-worker[\s\S]*MONTAGE_EXPORT_FFMPEG_HEARTBEAT_MS\s*\n\s*value:\s+2000/);
});
