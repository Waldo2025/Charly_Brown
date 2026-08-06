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
