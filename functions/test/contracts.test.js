const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_LIVE_MODEL,
  DEFAULT_VEO_MODEL,
  DEFAULT_VEO_FAST_MODEL,
  normalizeModel,
  buildVertexGenerateRequest
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
  buildRunJobRequest
} = require("../src/montage-dispatch.js");
const {
  normalizeVoiceName
} = require("../src/live-tickets.js");
const { safeSession } = require("../src/podcaster-data.js");
const { sanitizePersistedValue } = require("../src/montage-routes.js");
const { compactInput, publicAiJob } = require("../src/ai-jobs.js");

test("model aliases replace retired Gemini and Veo previews", () => {
  assert.equal(normalizeModel("gemini-2.5-flash"), DEFAULT_TEXT_MODEL);
  assert.equal(normalizeModel("gemini-3.1-flash-image-preview"), DEFAULT_IMAGE_MODEL);
  assert.equal(normalizeModel("gemini-2.5-flash-native-audio-preview-12-2025"), DEFAULT_LIVE_MODEL);
  assert.equal(normalizeModel("veo-3.1-generate-preview"), DEFAULT_VEO_MODEL);
  assert.equal(normalizeModel("veo-3.1-lite-generate-preview"), DEFAULT_VEO_FAST_MODEL);
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
  assert.equal(request.config.temperature, 0.25);
  assert.equal(request.config.responseMimeType, "application/json");
  assert.equal(request.config.systemInstruction.parts[0].text, "responde en español");
  assert.equal(request.config.safetySettings.length, 1);
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

test("Cloud Run override sends only the durable montage job id", () => {
  const request = buildRunJobRequest({ jobId: "job-42" });
  assert.match(request.name, /jobs\/podcaster-montage-export$/);
  const env = Object.fromEntries(request.overrides.containerOverrides[0].env.map((item) => [item.name, item.value]));
  assert.equal(env.MONTAGE_JOB_ID, "job-42");
  assert.equal(env.BACKEND_SERVICE_ROLE, "export");
  assert.equal(request.overrides.taskCount, 1);
  assert.equal(request.overrides.timeout.seconds, 1800);
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
