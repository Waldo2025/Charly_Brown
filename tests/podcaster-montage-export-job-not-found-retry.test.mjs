import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const scheduledTimers = [];
const statusUpdates = [];
const persistCalls = [];

const context = {
  console,
  loadMontageExportJobStatusFallback: async () => null,
  applyMontageExportPolledStatus: async (data) => {
    if (data?.status === "ready") {
      context.window.montageExportJobState.jobNotFoundCount = 0;
      context.window.montageExportBusy = false;
      context.persistMontageExportActiveJob("");
      return true;
    }
    return false;
  },
  loadMontageExportJobStatusFromFirestore: async () => null,
  buildMontageExportEndpoint: (path) => `https://remote.test${path}`,
  schedulePreferredFirestorePollRetry() {},
  authFetchJson: async (url) => {
    context.__lastAuthFetchUrl = String(url || "");
    context.__fetchCount = (context.__fetchCount || 0) + 1;
    if (context.__fetchCount === 1) {
      const error = new Error("job_not_found");
      error.status = 404;
      error.detail = { error: "job_not_found", status: 404 };
      throw error;
    }
    return {
      ok: true,
      jobId: "job-1",
      status: "ready",
      stage: "ready",
      progress: 1,
      hint: "Video listo.",
      export: {
        filename: "montage.mp4",
      }
    };
  },
  buildApiUrl(path = "") {
    return `https://remote.test${String(path || "").trim()}`;
  },
  buildApiUrlPreferRemote(path = "") {
    return `https://remote.test${String(path || "").trim()}`;
  },
  resolveApiBase() {
    return "/api";
  },
  getRemoteApiBase() {
    return "https://charly-brown-gemini-backend.onrender.com/api";
  },
  describeMontageExportStage(stage = "") {
    return String(stage || "").trim();
  },
  describeMontageExportSceneSubstage() {
    return "";
  },
  formatMontageSkippedEntries() {
    return "";
  },
  isTransientMontageExportTransportError() {
    return false;
  },
  setMontageExportStatus(title = "", hint = "", meta = {}) {
    statusUpdates.push({ title, hint, meta });
  },
  setMontageExportBusy(value = false) {
    context.window.montageExportBusy = Boolean(value);
  },
  setMontageExportProgress(value = null) {
    context.window.montageExportProgress = value;
  },
  setMontageExportContinueButton() {},
  setMontageExportDownloadButton() {},
  downloadMontageReviewExcel() {},
  clearMontageExportPolling() {
    context.window.montageExportJobState.pollTimer = null;
  },
  persistMontageExportActiveJob(jobId = "", startedAtMs = 0) {
    persistCalls.push({ jobId, startedAtMs });
  },
  setMontageExportPreviewPaused() {},
  shouldSuspendMontagePreviewActivity() {
    return false;
  },
  maybeRefreshMontageExportPreviewFromJob() {},
  logMontageExportDevtools() {},
  scheduleMontageExportPollRetry() {},
  document: {
    createElement() {
      return {
        click() {},
        remove() {}
      };
    },
    body: {
      appendChild() {}
    }
  },
  window: {
    montageExportState: { exportMode: "normal" },
    montageExportBusy: true,
    montageExportProgress: 0.1,
    montageExportJobState: {
      jobId: "job-1",
      pollTimer: null,
      resumeOnOnlineHandler: null,
      startedAtMs: Date.parse("2026-04-27T15:00:00.000Z"),
      lastStage: "",
      lastSceneSubstage: "",
      lastHint: "",
      lastProgress: -1,
      pollFailureCount: 0,
      jobNotFoundCount: 0,
      reviewExcelEnabled: false,
      reviewExcelPayload: null,
      reviewExcelFilename: ""
    },
    setTimelinePreviewsSuspended(value) {
      context.window.timelineSuspended = Boolean(value);
    },
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setTimeout(callback, delay) {
      scheduledTimers.push({ callback, delay });
      return scheduledTimers.length;
    }
  }
};

vm.createContext(context);
[
  "const MONTAGE_EXPORT_POLL_MAX_MS = 0;",
  "const MONTAGE_EXPORT_JOB_NOT_FOUND_MAX_RETRIES = 4;",
  extractFunction("isMontageExportStatusRedirectFailure"),
  extractFunction("scheduleMontageExportJobNotFoundRetry"),
  `${/async\s+function\s+pollMontageExportJob/.test(source) ? "async " : ""}${extractFunction("pollMontageExportJob")}`
].forEach((snippet) => {
  vm.runInContext(`${snippet};`, context);
});

test("montage export polling retries job_not_found before failing", async () => {
  await context.pollMontageExportJob("job-1");

  assert.equal(context.window.montageExportBusy, true);
  assert.equal(context.window.montageExportJobState.jobNotFoundCount, 1);
  assert.equal(String(context.__lastAuthFetchUrl || ""), "https://remote.test/api/podcaster/montage/export-status?jobId=job-1");
  assert.ok(statusUpdates.some((item) => String(item.title || "").includes("momentáneamente")));
  assert.equal(scheduledTimers.length, 1);

  await scheduledTimers[0].callback();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(context.window.montageExportJobState.jobNotFoundCount, 0);
  assert.equal(context.window.montageExportBusy, false);
  assert.equal(context.window.montageExportJobState.jobId, "job-1");
  assert.ok(persistCalls.some((item) => item.jobId === ""));
});
