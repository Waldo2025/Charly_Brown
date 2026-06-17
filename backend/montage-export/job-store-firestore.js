const DEFAULT_COLLECTION = "podcaster_export_jobs";
const DEFAULT_JOB_TTL_MS = 2 * 60 * 60 * 1000;

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, num));
}

function toIsoDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return value === undefined ? undefined : value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = stripUndefinedDeep(item);
    if (clean !== undefined) {
      result[key] = clean;
    }
  }
  return result;
}

function sanitizePersistedRenderedFrames(renderedFrames = []) {
  let redactedFrameCount = 0;
  const sanitizedFrames = Array.isArray(renderedFrames)
    ? renderedFrames.map((frame) => {
      const source = frame && typeof frame === "object" ? frame : null;
      if (!source) return source;
      const nextFrame = { ...source };
      if (typeof nextFrame.dataUrl === "string" && nextFrame.dataUrl.trim().startsWith("data:image/")) {
        delete nextFrame.dataUrl;
        redactedFrameCount += 1;
      }
      return nextFrame;
    })
    : [];
  return {
    sanitizedFrames,
    redactedFrameCount
  };
}

function sanitizePersistedRenderedSegments(renderedSegments = []) {
  let redactedFrameCount = 0;
  let redactedSegmentCount = 0;
  const sanitizedSegments = Array.isArray(renderedSegments)
    ? renderedSegments.map((segment) => {
      const source = segment && typeof segment === "object" ? segment : null;
      if (!source) return source;
      const {
        sanitizedFrames,
        redactedFrameCount: segmentRedactedFrameCount
      } = sanitizePersistedRenderedFrames(source.renderedFrames);
      if (segmentRedactedFrameCount > 0) {
        redactedSegmentCount += 1;
        redactedFrameCount += segmentRedactedFrameCount;
      }
      return {
        ...source,
        renderedFrames: sanitizedFrames
      };
    })
    : [];
  return {
    sanitizedSegments,
    redactedFrameCount,
    redactedSegmentCount
  };
}

function sanitizeMontageExportPersistedInput(input = null) {
  const source = input && typeof input === "object" ? input : null;
  if (!source) return null;
  const nextInput = { ...source };
  let redactedFrameCount = 0;
  let redactedSegmentCount = 0;

  if (Object.prototype.hasOwnProperty.call(nextInput, "entriesRaw")) {
    delete nextInput.entriesRaw;
  }
  if (Object.prototype.hasOwnProperty.call(nextInput, "audioTimelineRaw")) {
    delete nextInput.audioTimelineRaw;
  }

  if (Array.isArray(nextInput.onScreenTextRenderedSegments)) {
    const sanitized = sanitizePersistedRenderedSegments(nextInput.onScreenTextRenderedSegments);
    nextInput.onScreenTextRenderedSegments = sanitized.sanitizedSegments;
    redactedFrameCount += sanitized.redactedFrameCount;
    redactedSegmentCount += sanitized.redactedSegmentCount;
  }

  if (nextInput.onScreenTextTimelineRaw && typeof nextInput.onScreenTextTimelineRaw === "object") {
    const timelineRaw = { ...nextInput.onScreenTextTimelineRaw };
    if (Array.isArray(timelineRaw.renderedSegments)) {
      const sanitized = sanitizePersistedRenderedSegments(timelineRaw.renderedSegments);
      redactedFrameCount += sanitized.redactedFrameCount;
      redactedSegmentCount += sanitized.redactedSegmentCount;
      delete timelineRaw.renderedSegments;
    }
    nextInput.onScreenTextTimelineRaw = timelineRaw;
  }

  if (redactedFrameCount > 0) {
    nextInput.persistedInlineRastersRedacted = true;
    nextInput.persistedInlineRasterFrameCount = redactedFrameCount;
    nextInput.persistedInlineRasterSegmentCount = redactedSegmentCount;
  }

  return nextInput;
}

function sanitizeMontageExportPersistedRequest(request = null) {
  const source = request && typeof request === "object" ? request : null;
  if (!source) return null;
  const nextRequest = {
    ...source
  };
  if (Object.prototype.hasOwnProperty.call(nextRequest, "input")) {
    nextRequest.input = sanitizeMontageExportPersistedInput(nextRequest.input);
  }
  return nextRequest;
}

function createMontageExportJobStore({
  db,
  collectionName = DEFAULT_COLLECTION,
  ttlMs = DEFAULT_JOB_TTL_MS,
  now = () => new Date().toISOString()
} = {}) {
  if (!db || typeof db.collection !== "function") {
    throw new Error("firestore_db_required");
  }

  const collection = () => db.collection(collectionName);
  const nextNow = () => toIsoDate(now()) || new Date().toISOString();
  const nextExpiryFrom = (baseIso = "") => new Date(Date.parse(baseIso || nextNow()) + Math.max(60_000, Number(ttlMs || 0) || DEFAULT_JOB_TTL_MS)).toISOString();

  const normalizeBase = (source = {}, patch = {}) => {
    const timestamp = nextNow();
    const merged = { ...source, ...patch };
    return {
      ...merged,
      jobId: String(merged.jobId || source.jobId || "").trim(),
      type: "montage_export",
      status: String(merged.status || source.status || "queued").trim() || "queued",
      stage: String(merged.stage || source.stage || "queued").trim() || "queued",
      sceneSubstage: String(merged.sceneSubstage || source.sceneSubstage || "").trim(),
      hint: String(merged.hint || source.hint || "").trim(),
      progress: clamp01(merged.progress, source.progress || 0),
      currentSceneIndex: Number.isFinite(Number(merged.currentSceneIndex)) ? Math.max(0, Math.round(Number(merged.currentSceneIndex) || 0)) : Math.max(0, Math.round(Number(source.currentSceneIndex) || 0)),
      totalScenes: Number.isFinite(Number(merged.totalScenes)) ? Math.max(0, Math.round(Number(merged.totalScenes) || 0)) : Math.max(0, Math.round(Number(source.totalScenes) || 0)),
      heartbeatAt: Object.prototype.hasOwnProperty.call(patch, "heartbeatAt")
        ? (String(patch.heartbeatAt || "").trim() || timestamp)
        : timestamp,
      updatedAt: timestamp,
      expiresAt: nextExpiryFrom(timestamp)
    };
  };

  return {
    async createJob({
      jobId = "",
      sessionId = "",
      ownerId = "",
      request = null,
      totalScenes = 0
    } = {}) {
      const createdAt = nextNow();
      const persistedRequest = sanitizeMontageExportPersistedRequest(request);
      const job = stripUndefinedDeep({
        jobId: String(jobId || "").trim(),
        sessionId: String(sessionId || "").trim(),
        ownerId: String(ownerId || "").trim(),
        type: "montage_export",
        status: "queued",
        stage: "queued",
        sceneSubstage: "",
        progress: 0,
        hint: "Export en cola.",
        currentSceneIndex: 0,
        totalScenes: Math.max(0, Math.round(Number(totalScenes) || 0)),
        failedSceneIndex: 0,
        failedRowId: "",
        failedSubstage: "",
        warnings: [],
        result: null,
        error: null,
        request: persistedRequest,
        heartbeatAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        expiresAt: nextExpiryFrom(createdAt)
      }) || {};
      await collection().doc(job.jobId).set(job);
      return job;
    },

    async updateJob(jobId = "", patch = {}) {
      const cleanJobId = String(jobId || "").trim();
      if (!cleanJobId) throw new Error("job_id_required");
      const ref = collection().doc(cleanJobId);
      const snap = await ref.get();
      const existing = snap.exists ? (snap.data() || {}) : { jobId: cleanJobId };
      const sanitizedPatch = patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "request")
        ? {
          ...patch,
          request: sanitizeMontageExportPersistedRequest(patch.request)
        }
        : patch;
      const cleanPatch = stripUndefinedDeep(sanitizedPatch) || {};
      const job = normalizeBase(existing, cleanPatch);
      if (patch && Object.prototype.hasOwnProperty.call(patch, "warnings")) {
        job.warnings = Array.isArray(cleanPatch.warnings) ? cleanPatch.warnings : [];
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, "result")) {
        job.result = cleanPatch.result && typeof cleanPatch.result === "object" ? cleanPatch.result : null;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, "error")) {
        job.error = cleanPatch.error && typeof cleanPatch.error === "object" ? cleanPatch.error : null;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, "request")) {
        job.request = cleanPatch.request && typeof cleanPatch.request === "object" ? cleanPatch.request : null;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, "failedSceneIndex")) {
        job.failedSceneIndex = Math.max(0, Math.round(Number(cleanPatch.failedSceneIndex) || 0));
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, "failedRowId")) {
        job.failedRowId = String(cleanPatch.failedRowId || "").trim();
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, "failedSubstage")) {
        job.failedSubstage = String(cleanPatch.failedSubstage || "").trim();
      }
      await ref.set(job, { merge: true });
      return job;
    },

    async getJob(jobId = "") {
      const cleanJobId = String(jobId || "").trim();
      if (!cleanJobId) return null;
      const snap = await collection().doc(cleanJobId).get();
      if (!snap.exists) return null;
      const job = snap.data() || null;
      if (!job) return null;
      const expiresAtMs = Number(new Date(job.expiresAt || 0).getTime() || 0) || 0;
      const nowMs = Number(new Date(nextNow()).getTime() || 0) || 0;
      if (expiresAtMs && nowMs && expiresAtMs < nowMs) return null;
      return job;
    }
  };
}

module.exports = {
  createMontageExportJobStore,
  DEFAULT_COLLECTION,
  DEFAULT_JOB_TTL_MS,
  sanitizeMontageExportPersistedRequest,
  sanitizeMontageExportPersistedInput
};
