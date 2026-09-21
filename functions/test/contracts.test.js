const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_LIVE_MODEL,
  DEFAULT_VEO_MODEL,
  DEFAULT_VEO_FAST_MODEL,
  normalizeModel,
  buildVertexGenerateRequest,
  isVertexInvalidArgument,
  buildVertexCompatibilityPayload
} = require("../src/vertex.js");
const {
  validateUploadRequest,
  buildStoragePath
} = require("../src/uploads.js");
const {
  normalizeStoragePath,
  isPublicLibraryPath,
  sessionIdFromStoragePath
} = require("../src/assets.js");
const {
  QUEUES,
  deterministicTaskId,
  buildHttpTaskRequest
} = require("../src/tasks.js");
const {
  buildRunJobRequest,
  shouldRetainMontageLease
} = require("../src/montage-dispatch.js");
const {
  normalizeVoiceName
} = require("../src/live-tickets.js");
const {
  safeSession,
  normalizeLibraryItem,
  isVideoSessionDocument,
  resolvePodcasterSessionEditAccess
} = require("../src/podcaster-data.js");
const { sanitizePersistedValue } = require("../src/montage-routes.js");
const {
  compactInput,
  publicAiJob,
  extractInteractionAudio,
  buildLyriaInteractionRequest,
  createVertexVideoOperationError,
  extractVertexVideoOutcome,
  createVertexVideoEmptyError,
  normalizeVertexVideoError,
  isRetryableAiJobError
} = require("../src/ai-jobs.js");
const { isAllowedBrowserOrigin } = require("../src/common.js");
const { staleJobAge, buildStaleJobPatch } = require("../src/stale-job-monitor.js");
const fs = require("node:fs");
const path = require("node:path");

test("model aliases replace retired Gemini and Veo previews", () => {
  assert.equal(normalizeModel("gemini-2.5-flash"), DEFAULT_TEXT_MODEL);
  assert.equal(normalizeModel("gemini-3.1-flash-image-preview"), DEFAULT_IMAGE_MODEL);
  assert.equal(normalizeModel("gemini-2.5-flash-native-audio-preview-12-2025"), DEFAULT_LIVE_MODEL);
  assert.equal(normalizeModel("veo-3.1-generate-preview"), DEFAULT_VEO_MODEL);
  assert.equal(normalizeModel("veo-3.1-lite-generate-preview"), "veo-3.1-lite-generate-001");
});

test("REST Gemini payload is translated to the Vertex SDK request shape", () => {
  const request = buildVertexGenerateRequest({
    model: "models/gemini-2.5-flash:generateContent",
    payload: {
      contents: [{ role: "user", parts: [{ text: "hola" }] }],
      systemInstruction: { parts: [{ text: "responde en español" }] },
      generationConfig: { temperature: 0.25, responseMimeType: "application/json" },
      safetySettings: [{ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" }]
    }
  });
  assert.equal(request.model, DEFAULT_TEXT_MODEL);
  assert.equal(request.contents[0].parts[0].text, "hola");
  assert.equal(request.config.temperature, undefined, "Gemini 3.8 Flash no admite controles de muestreo explícitos en este proxy");
  assert.equal(request.config.responseMimeType, "application/json");
  assert.equal(request.config.systemInstruction.parts[0].text, "responde en español");
  assert.equal(request.config.safetySettings.length, 1);
});

test("buildVertexGenerateRequest normalizes and sanitizes structured output schema for Vertex OpenAPI compliance", () => {
  const schemaWithUnsupported = {
    type: "object",
    properties: {
      titulo: { type: "string", minLength: 1 },
      preguntas: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            reto: { type: "string" },
            elementos: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 6 }
          },
          required: ["reto"]
        }
      }
    },
    required: ["titulo", "preguntas"]
  };
  const request = buildVertexGenerateRequest({
    model: "gemini-2.5-flash",
    payload: {
      contents: [{ role: "user", parts: [{ text: "Genera el escape room" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schemaWithUnsupported
      }
    }
  });
  assert.equal(request.config.responseSchema.type, "object");
  assert.equal(request.config.responseSchema.properties.titulo.minLength, undefined);
  assert.equal(request.config.responseSchema.properties.preguntas.minItems, undefined);
  assert.equal(request.config.responseSchema.properties.preguntas.maxItems, undefined);
  assert.equal(request.config.responseSchema.properties.preguntas.items.properties.elementos.minItems, undefined);
  assert.equal(request.config.responseSchema.properties.preguntas.items.properties.elementos.maxItems, undefined);
  assert.deepEqual(request.config.responseSchema.required, ["titulo", "preguntas"]);
  assert.equal(request.config.responseJsonSchema, undefined);
});

test("Gemini invalid arguments fall back to a minimal payload without losing instructions", () => {
  const source = {
    systemInstruction: { parts: [{ text: "Devuelve solo JSON." }] },
    contents: [{ role: "user", parts: [{ text: "Genera el brief." }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object" },
      temperature: 0.2,
      maxOutputTokens: 16384
    }
  };
  const compatible = buildVertexCompatibilityPayload(source);
  assert.deepEqual(Object.keys(compatible), ["contents"]);
  assert.match(compatible.contents[0].parts[0].text, /^Devuelve solo JSON\.\n\nGenera el brief\.$/);
  assert.equal(source.contents[0].parts[0].text, "Genera el brief.", "the original request must not be mutated");
  assert.equal(isVertexInvalidArgument({ status: 400, message: '{"error":{"status":"INVALID_ARGUMENT"}}' }), true);
  assert.equal(isVertexInvalidArgument({ status: 429, message: "RESOURCE_EXHAUSTED" }), false);
});

test("Gemini proxy retries invalid generation configurations with the compatibility payload", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /if \(isVertexInvalidArgument\(error\)\)[\s\S]*buildVertexCompatibilityPayload\(payload\)/);
  assert.match(source, /X-Gemini-Compatibility-Retry", "minimal-payload"/);
});

test("Gemini proxy accepts bounded high-resolution inline vision references", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /const GEMINI_PROXY_JSON_LIMIT = "10mb"/);
  assert.match(source, /const GEMINI_PROXY_PAYLOAD_LIMIT_BYTES = 8 \* 1024 \* 1024/);
  assert.match(source, /createApp\("gemini-api",[\s\S]*?\{ jsonLimit: GEMINI_PROXY_JSON_LIMIT \}\)/);
  assert.doesNotMatch(source, /> 120 \* 1024/);
});

test("large scene videos use a direct resumable upload contract", () => {
  const input = validateUploadRequest({
    kind: "scene-video",
    sessionId: "Session_42",
    rowId: "Row_7",
    fileName: "Toma final.mp4",
    contentType: "video/mp4",
    size: 80 * 1024 * 1024
  });
  assert.equal(input.sessionId, "Session_42");
  assert.equal(input.rowId, "Row_7");
  assert.equal(input.size, 80 * 1024 * 1024);
  assert.throws(() => validateUploadRequest({ ...input, size: input.size + 1 }), /invalid_upload_size/);
  assert.throws(() => validateUploadRequest({ ...input, contentType: "text/html" }), /invalid_upload_content_type/);
  assert.equal(
    buildStoragePath({ ...input, uploadId: "upload-1", uid: "user-1" }),
    "podcaster/sessions/Session_42/owners/user-1/videos/Row_7-upload-1-toma-final.mp4"
  );
  assert.throws(() => validateUploadRequest({ ...input, sessionId: "../Session_42" }), /invalid_session_id/);
});

test("podcaster admin browser includes only video sessions", () => {
  assert.equal(isVideoSessionDocument({ session: { podcastStudioUiState: { composerGenerationMode: "video" } } }), true);
  assert.equal(isVideoSessionDocument({ session: { script: { videoContentType: "creative" } } }), true);
  assert.equal(isVideoSessionDocument({ session: { podcastStudioUiState: { composerGenerationMode: "podcast" } } }), false);
});

test("archived podcaster sessions require restore except for an admin editing another owner", () => {
  const archived = { ownerId: "owner-1", sharedWithIds: ["shared-1"], archived: true };
  assert.equal(resolvePodcasterSessionEditAccess(archived, { uid: "owner-1" }, false).archivedBlocked, true);
  assert.equal(resolvePodcasterSessionEditAccess(archived, { uid: "shared-1" }, false).archivedBlocked, true);
  const adminAccess = resolvePodcasterSessionEditAccess(archived, { uid: "admin-1" }, true);
  assert.equal(adminAccess.archivedBlocked, false);
  assert.equal(adminAccess.ownerId, "owner-1", "admin edits must preserve the original owner");
  assert.equal(resolvePodcasterSessionEditAccess(archived, { uid: "owner-1" }, true).archivedBlocked, true);
  assert.equal(resolvePodcasterSessionEditAccess({ ...archived, archived: false }, { uid: "shared-1" }, false).allowed, true);
  assert.equal(resolvePodcasterSessionEditAccess({ ...archived, archived: false }, { uid: "stranger" }, false).allowed, false);
});

test("signed asset adapter accepts only podcaster storage paths", () => {
  assert.equal(normalizeStoragePath("/podcaster/library/scenes/one/video.mp4"), "podcaster/library/scenes/one/video.mp4");
  assert.equal(isPublicLibraryPath("podcaster/library/scenes/one/video.mp4"), true);
  assert.equal(
    sessionIdFromStoragePath("podcaster/sessions/session-42/owners/user-1/videos/one.mp4"),
    "session-42"
  );
  assert.throws(() => normalizeStoragePath("other/private.txt"), /invalid_storage_path/);
  assert.throws(() => normalizeStoragePath("podcaster/../private.txt"), /invalid_storage_path/);
});

test("Cloud Tasks payload is thin, deterministic and authenticated with OIDC", () => {
  const first = deterministicTaskId("montage", "job-42");
  const second = deterministicTaskId("montage", "job-42");
  assert.equal(first, second);
  const request = buildHttpTaskRequest({
    queue: QUEUES.montage,
    kind: "montage",
    jobId: "job-42",
    targetUrl: "https://dispatch.example.test/",
    serviceAccountEmail: "tasks@example.iam.gserviceaccount.com",
    payload: { sessionId: "session-42" }
  });
  assert.match(request.task.name, /podcaster-montage\/tasks\/montage-/);
  assert.equal(request.task.httpRequest.oidcToken.audience, "https://dispatch.example.test/");
  assert.equal(request.task.dispatchDeadline.seconds, 60);
  assert.deepEqual(JSON.parse(request.task.httpRequest.body.toString("utf8")), {
    jobId: "job-42",
    sessionId: "session-42"
  });
});

test("private task functions preserve the Cloud Tasks invoker across deploys", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /const TASK_INVOKER_EMAIL = "charly-tasks-invoker@charly-brown\.iam\.gserviceaccount\.com"/);
  assert.equal((source.match(/invoker: \[TASK_INVOKER_EMAIL\]/g) || []).length, 2);
});

test("Cloud Run override sends only the durable montage job id", () => {
  const request = buildRunJobRequest({ jobId: "job-42" });
  assert.match(request.name, /jobs\/podcaster-montage-export$/);
  const env = Object.fromEntries(request.overrides.containerOverrides[0].env.map((item) => [item.name, item.value]));
  assert.equal(env.MONTAGE_JOB_ID, "job-42");
  assert.equal(env.BACKEND_SERVICE_ROLE, "export");
  assert.equal(request.overrides.taskCount, 1);
  assert.equal(request.overrides.timeout.seconds, 1800);
});

test("montage capacity ignores missing and terminal lease owners", () => {
  const now = Date.now();
  const lease = { leaseUntilMs: now + 60_000 };
  assert.equal(shouldRetainMontageLease(lease, { status: "running" }, now), true);
  assert.equal(shouldRetainMontageLease(lease, { status: "ready" }, now), false);
  assert.equal(shouldRetainMontageLease(lease, { status: "cancelled" }, now), false);
  assert.equal(shouldRetainMontageLease(lease, null, now), false);
  assert.equal(shouldRetainMontageLease({ leaseUntilMs: now - 1 }, { status: "running" }, now), false);
});

test("Gemini Live only accepts the configured voice catalog", () => {
  assert.equal(normalizeVoiceName("zephyr"), "Zephyr");
  assert.equal(normalizeVoiceName("Vindemiatrix"), "Vindemiatrix");
  assert.equal(normalizeVoiceName("not-a-voice"), "Aoede");
});

test("podcaster sessions keep their established document shape", () => {
  const session = safeSession({ id: "session-42", title: "Tema", script: { rows: [{ id: "row-1", speaker: "Host A" }] }, podcastStudioUiState: { zoom: 1.2 } });
  assert.equal(session.id, "session-42");
  assert.equal(session.script.rows[0].speaker, "Host A");
  assert.equal(session.podcastStudioUiState.zoom, 1.2);
  assert.throws(() => safeSession({ id: "large", body: "x".repeat(910 * 1024) }), /podcaster_session_too_large/);
});

test("public library responses remove historical Render media URLs", () => {
  const item = normalizeLibraryItem({
    libraryId: "library-1",
    mimeType: "image/png",
    storagePath: "gs://charly-brown.firebasestorage.app/podcaster/library/scenes/library-1/image.png",
    downloadUrl: "https://legacy.onrender.com/api/assets/proxy-image?storagePath=old",
    thumbUrl: "https://legacy.onrender.com/api/assets/proxy-image?storagePath=old"
  });
  assert.equal(item.storagePath, "podcaster/library/scenes/library-1/image.png");
  assert.match(item.downloadUrl, /^\/api\/assets\/proxy-media\?storagePath=/);
  assert.equal(item.thumbUrl, item.downloadUrl);
  assert.doesNotMatch(JSON.stringify(item), /onrender\.com/);
});

test("durable jobs strip inline media and legacy Render URLs", () => {
  const sanitized = sanitizePersistedValue({
    sessionId: "session-42",
    imageDataUrl: "data:image/png;base64,abc",
    media: { storagePath: "podcaster/sessions/session-42/video.mp4", downloadUrl: "https://legacy.onrender.com/api/assets/proxy-media?storagePath=podcaster%2Fsessions%2Fsession-42%2Fvideo.mp4" }
  });
  assert.equal(sanitized.imageDataUrl, undefined);
  assert.match(sanitized.media.downloadUrl, /^https:\/\/charly-brown\.web\.app\/api\/assets\/proxy-media/);
  assert.doesNotMatch(JSON.stringify(sanitized), /onrender\.com/);
});

test("AI jobs are asynchronous, owner-scoped and never persist inline references", () => {
  const input = compactInput({ sessionId: "session-42", prompt: "cinematic", referenceImageDataUrl: "data:image/png;base64,abc" });
  assert.equal(input.referenceImageDataUrl, undefined);
  const payload = publicAiJob({ jobId: "job-42", type: "scenario_image", ownerId: "user-1", status: "queued", stage: "queued" });
  assert.equal(payload.jobId, "job-42");
  assert.equal(payload.statusUrl, "/api/podcaster/jobs/job-42");
});

test("Veo policy rejections are permanent and Cloud Tasks must not retry them", () => {
  const error = createVertexVideoOperationError({
    code: 3,
    message: "The prompt contains sensitive words that violate Google's Responsible AI practices."
  });
  assert.equal(error.code, "vertex_video_prompt_blocked");
  assert.equal(error.providerCode, 3);
  assert.equal(error.retryable, false);
  assert.equal(isRetryableAiJobError(error), false);
  assert.equal(isRetryableAiJobError(Object.assign(new Error("invalid argument"), { code: 3 })), false);
  assert.equal(isRetryableAiJobError(Object.assign(new Error("unavailable"), { status: 503 })), true);

  const wrappedError = normalizeVertexVideoError(new Error(
    'vertex_video_error:{"code":3,"message":"The prompt could not be submitted. This prompt contains sensitive words that violate Google\'s Responsible AI practices."}'
  ));
  assert.equal(wrappedError.code, "vertex_video_prompt_blocked");
  assert.equal(wrappedError.providerCode, 3);
  assert.equal(wrappedError.retryable, false);
  assert.equal(isRetryableAiJobError(wrappedError), false);

  const legacyPayload = publicAiJob({
    jobId: "legacy-policy-job",
    type: "dialogue_video",
    status: "error",
    stage: "error",
    error: {
      code: 'vertex_video_error:{"code":3,"message":"The prompt contains sensitive words that violate Google\'s Responsible AI practices."}',
      message: 'vertex_video_error:{"code":3,"message":"The prompt contains sensitive words that violate Google\'s Responsible AI practices."}'
    }
  });
  assert.equal(legacyPayload.stage, "blocked");
  assert.equal(legacyPayload.retryable, false);
  assert.equal(legacyPayload.error.code, "vertex_video_prompt_blocked");
});

test("Veo filtered media preserves the RAI reason instead of reporting an empty video", () => {
  const operation = {
    done: true,
    result: {
      raiMediaFilteredCount: 1,
      raiMediaFilteredReasons: ["Input image was filtered by Responsible AI policy."],
      generatedVideos: []
    }
  };
  const outcome = extractVertexVideoOutcome(operation);
  assert.equal(outcome.video, null);
  assert.equal(outcome.filteredCount, 1);
  assert.deepEqual(outcome.filteredReasons, ["Input image was filtered by Responsible AI policy."]);

  const error = createVertexVideoEmptyError(operation);
  assert.equal(error.code, "vertex_video_content_filtered");
  assert.equal(error.retryable, false);
  assert.equal(isRetryableAiJobError(error), false);
  assert.deepEqual(error.providerReasons, ["Input image was filtered by Responsible AI policy."]);
});

test("Veo output extraction accepts SDK result and raw GCS response shapes", () => {
  assert.equal(extractVertexVideoOutcome({
    result: { generatedVideos: [{ video: { uri: "gs://bucket/video.mp4" } }] }
  }).video.uri, "gs://bucket/video.mp4");
  assert.equal(extractVertexVideoOutcome({
    response: { videos: [{ gcsUri: "gs://bucket/raw.mp4", mimeType: "video/mp4" }] }
  }).video.gcsUri, "gs://bucket/raw.mp4");

  const emptyError = createVertexVideoEmptyError({ response: { generatedVideos: [] } });
  assert.equal(emptyError.code, "vertex_video_empty");
  assert.equal(emptyError.retryable, false);
  assert.equal(isRetryableAiJobError(emptyError), false);
});

test("Veo generation uses the non-deprecated source request", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/ai-jobs.js"), "utf8");
  const videoProcessor = source.slice(
    source.indexOf("async function processVideoJob"),
    source.indexOf("function extractAudioParts")
  );
  assert.match(videoProcessor, /generateVideos\(\{[\s\S]*?source:\s*\{[\s\S]*?prompt:\s*promptSpec\.prompt/);
  assert.doesNotMatch(videoProcessor, /generateVideos\(\{\s*\n\s*model:[^\n]+,\s*\n\s*prompt:\s*promptSpec\.prompt/);
  assert.match(source, /if \(!retryable\) return \{ failed: true, retryable: false \}/);
  assert.match(source, /VERTEX_VIDEO_OPERATION_DEADLINE_MS = 26 \* 60 \* 1000/);
  assert.doesNotMatch(videoProcessor, /polls < 170/);
});

test("Lyria 3 uses the global Interactions API and accepts nested audio output", () => {
  const request = buildLyriaInteractionRequest({ model: "lyria-3-clip-preview", prompt: "warm ambient" });
  assert.match(request.url, /\/locations\/global\/interactions$/);
  assert.equal(request.method, "POST");
  assert.deepEqual(request.data, {
    model: "lyria-3-clip-preview",
    input: [{ type: "text", text: "warm ambient" }]
  });
  assert.deepEqual(extractInteractionAudio({
    outputs: [{ type: "model_output", content: [{ type: "audio", mime_type: "audio/mpeg", data: "YWJj" }] }]
  }), [{ data: "YWJj", mimeType: "audio/mpeg" }]);
});

test("Gemini TTS requests audio-only output", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/ai-jobs.js"), "utf8");
  assert.match(source, /responseModalities:\s*\["AUDIO"\]/);
  assert.doesNotMatch(source, /responseModalities:\s*\["AUDIO",\s*"TEXT"\]/);
});

test("Functions allow production, preview and localhost browser origins", () => {
  assert.equal(isAllowedBrowserOrigin("https://charly-brown.web.app"), true);
  assert.equal(isAllowedBrowserOrigin("https://charly-brown--google-preview-abc123.web.app"), true);
  assert.equal(isAllowedBrowserOrigin("http://127.0.0.1:5010"), true);
  assert.equal(isAllowedBrowserOrigin("http://localhost:5010"), true);
  assert.equal(isAllowedBrowserOrigin("http://127.0.0.1"), true);
  assert.equal(isAllowedBrowserOrigin("http://localhost"), true);
  assert.equal(isAllowedBrowserOrigin("http://127.0.0.1.evil.example:5010"), false);
  assert.equal(isAllowedBrowserOrigin("https://localhost.evil.example:5010"), false);
  assert.equal(isAllowedBrowserOrigin("https://evil.example"), false);
});

test("Firebase ID token verification works with least-privilege runtime IAM", () => {
  const commonSource = fs.readFileSync(path.join(__dirname, "../src/common.js"), "utf8");
  assert.match(commonSource, /verifyIdToken\(token\)/);
  assert.doesNotMatch(commonSource, /verifyIdToken\(token,\s*true\)/);
});

test("resumable upload authorization includes privileged shared-session roles", () => {
  const uploadSource = fs.readFileSync(path.join(__dirname, "../src/uploads.js"), "utf8");
  assert.match(uploadSource, /isPrivilegedRole/);
  assert.match(uploadSource, /isPrivilegedRole\(authContext\.role\)/);
});

test("montage status is authenticated and owner-scoped", () => {
  const montageSource = fs.readFileSync(path.join(__dirname, "../src/montage-routes.js"), "utf8");
  const statusRoute = montageSource.match(/app\.get\("\/api\/podcaster\/montage\/export-status"[\s\S]*?\n\s*\}\)\);/)?.[0] || "";
  assert.match(statusRoute, /resolveAuthContext\(req\)/);
  assert.match(statusRoute, /job\.ownerId/);
  assert.match(statusRoute, /job_forbidden/);
});

test("stale job monitoring uses the most recent heartbeat", () => {
  const now = Date.parse("2026-08-06T18:00:00.000Z");
  assert.equal(staleJobAge({
    createdAt: "2026-08-06T17:00:00.000Z",
    updatedAt: "2026-08-06T17:30:00.000Z",
    heartbeatAt: { toMillis: () => Date.parse("2026-08-06T17:55:00.000Z") }
  }, now), 5 * 60 * 1000);
});

test("stale Veo and montage jobs become terminal so monitoring does not alert forever", () => {
  const timestamp = { seconds: 123 };
  const admin = {
    firestore: { FieldValue: { serverTimestamp: () => timestamp } }
  };
  const aiPatch = buildStaleJobPatch("podcaster_ai_jobs", admin);
  assert.equal(aiPatch.status, "error");
  assert.equal(aiPatch.stage, "stale");
  assert.equal(aiPatch.retryable, false);
  assert.equal(aiPatch.error.code, "ai_job_heartbeat_expired");
  assert.equal(aiPatch.updatedAt, timestamp);

  const exportPatch = buildStaleJobPatch("podcaster_export_jobs", admin);
  assert.equal(exportPatch.status, "error");
  assert.equal(exportPatch.stage, "stale");
  assert.equal(exportPatch.retryable, false);
  assert.equal(exportPatch.error.code, "export_job_heartbeat_expired");
  assert.equal(exportPatch.heartbeatAt, timestamp);
  assert.equal(exportPatch.updatedAt, timestamp);

  assert.equal(buildStaleJobPatch("unknown_jobs", admin), null);
});
