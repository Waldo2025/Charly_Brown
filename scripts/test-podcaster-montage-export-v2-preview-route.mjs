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
  assert.match(htmlSource, /data-cache-src="podcaster\/podcaster-montage-export-v2\.js"/);
  assert.match(podcasterSource, /from "\.\/podcaster-montage-export-v2\.js"/);
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

test("export v2 resumes an existing montage export when backend is busy", () => {
  assert.match(legacyExportSource, /export function persistMontageExportActiveJob\b/);
  assert.match(exportV2Source, /\bpersistMontageExportActiveJob\b/);
  assert.match(exportV2Source, /const apiPayload = error\?\.detail && typeof error\.detail === "object" \? error\.detail : null/);
  assert.match(exportV2Source, /const activeJobId = String\(detail\?\.activeJobId \|\| apiPayload\?\.activeJobId \|\| ""\)\.trim\(\);/);
  assert.match(exportV2Source, /const activeJobKind = String\(detail\?\.kind \|\| apiPayload\?\.kind \|\| ""\)\.trim\(\);/);
  assert.match(
    exportV2Source,
    /if \(status === 429 \|\| code === "backend_busy_with_export"\) \{[\s\S]*if \(activeJobId && activeJobKind === "montage_export"\) \{[\s\S]*activeJobState\.jobId = activeJobId;[\s\S]*persistMontageExportActiveJob\(activeJobId, Date\.now\(\)\);[\s\S]*await continueMontageExportPolling\(\);[\s\S]*return;[\s\S]*\}/m,
    "export-v2 debe retomar el polling del job activo reportado por backend_busy_with_export."
  );
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
  assert.match(exportV2Source, /onScreenTextMode:\s*"rendered_png_overlay"/);
  assert.doesNotMatch(exportV2Source, /onScreenTextMode:\s*"ass"/);
});

test("export v2 preserves image visual effects through preview-runtime merge", () => {
  assert.match(legacyExportSource, /visualEffects:\s*activeSession\?\.visualEffectsMap\?\.\[rowId\] \|\| null/);
  assert.match(
    exportV2Source,
    /return \{[\s\S]*\.\.\.entry,[\s\S]*sourceDurationMs: runtime\.sourceDurationMs \|\| entry\.sourceDurationMs,[\s\S]*previewRuntime:/,
    "mergePreviewRuntimeIntoPayload debe enriquecer entries sin reconstruirlas ni perder visualEffects."
  );
  assert.match(
    backendSource,
    /visualEffects:\s*normalizeMontageVisualEffects\(item\?\.visualEffects \|\| null\)/,
    "normalizeMontageExportRequestBody debe conservar visualEffects antes de aplicar preview runtime v2."
  );
  assert.match(
    backendSource,
    /const visualEffects = normalizeMontageVisualEffects\(entry\?\.visualEffects \|\| null\);[\s\S]*buildMontageImageMotionVideoFilter\(\{[\s\S]*visualEffects,/,
    "La rama de imagen del export debe pasar visualEffects al filtro Ken Burns."
  );
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
    "setMontageExportStatus"
  ].forEach((name) => {
    assert.match(exportV2Source, new RegExp(`\\b${name}\\b`));
    assert.match(legacyExportSource, new RegExp(`export (?:async )?(?:function|let|const) ${name}\\b`));
  });
  assert.match(exportV2Source, /\bstripMontageExportSubmissionPayload\b/);
  assert.match(legacyExportSource, /export function stripMontageExportSubmissionPayload\b/);
  assert.doesNotMatch(exportV2Source, /import \{[\s\S]*montageExportJobState[\s\S]*\} from/);
  assert.doesNotMatch(exportV2Source, /import \{[\s\S]*montageExportState[\s\S]*\} from/);
});

test("export v2 strips hydrated media before POST to avoid large JSON bodies", () => {
  assert.match(
    exportV2Source,
    /const submissionPayload = stripMontageExportSubmissionPayload\(payload\);[\s\S]*authFetchJson\(exportV2Endpoint,[\s\S]*body: submissionPayload/,
    "export-v2 debe mandar el payload limpiado, no el payload hidratado con dataUrl/localDataUrl."
  );
  assert.doesNotMatch(
    exportV2Source,
    /authFetchJson\(exportV2Endpoint,[\s\S]{0,220}body: payload/,
    "export-v2 no debe enviar body: payload directo porque puede incluir media inline y provocar 413."
  );
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
