"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OMNI_VIDEO_MODEL,
  DEFAULT_VEO_VIDEO_MODEL,
  VEO_VIDEO_MODELS,
  VIDEO_MODELS,
  PROVIDER_TIMEOUT_MS,
  MEDIA_TIMEOUT_MS,
  normalizeInSceneText,
  normalizeVideoModel,
  resolveVideoGenerator,
  normalizeVeoDuration,
  resolveVeoConfig,
  resolveOmniTask,
  buildOmniInteractionParams,
  extractOmniVideoOutput,
  extractVeoVideoOutput,
  createOmniVideo,
  createVeoVideo,
  toSdkVideo,
  validateVeoExtensionSource,
  materializeGeneratedVideo
} = require("./podcaster-video-provider.js");

test("publishes only Omni and the supported Veo 3.1 video catalog", () => {
  assert.equal(OMNI_VIDEO_MODEL, "gemini-omni-flash-preview");
  assert.equal(DEFAULT_VEO_VIDEO_MODEL, "veo-3.1-generate-preview");
  assert.deepEqual(VEO_VIDEO_MODELS, [
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.1-lite-generate-preview"
  ]);
  assert.deepEqual(VIDEO_MODELS, [OMNI_VIDEO_MODEL, ...VEO_VIDEO_MODELS]);
  assert.equal(VIDEO_MODELS.some((model) => /veo-(?:2\.0|3\.0)/.test(model)), false);
  assert.equal(PROVIDER_TIMEOUT_MS, 7 * 60 * 1000);
  assert.equal(MEDIA_TIMEOUT_MS, 3 * 60 * 1000);
});

test("maps legacy model settings but never returns a retired model", () => {
  assert.equal(normalizeVideoModel("veo-3.0-generate-001", "veo"), "veo-3.1-generate-preview");
  assert.equal(normalizeVideoModel("veo-3.0-fast-generate-001", "veo"), "veo-3.1-fast-generate-preview");
  assert.equal(normalizeVideoModel("veo-2.0-generate-001", "auto"), "veo-3.1-generate-preview");
  assert.equal(normalizeVideoModel("", "auto"), OMNI_VIDEO_MODEL);
  assert.equal(normalizeVideoModel("auto", "omni"), OMNI_VIDEO_MODEL);
  assert.equal(normalizeVideoModel("auto", "veo"), DEFAULT_VEO_VIDEO_MODEL);
  assert.equal(normalizeVideoModel("veo-3.1-fast-generate-preview", "veo"), "veo-3.1-fast-generate-preview");
  assert.equal(
    normalizeVideoModel("veo-3.1-fast-generate-preview", "veo", "final", { highQuality: true }),
    DEFAULT_VEO_VIDEO_MODEL
  );
  assert.throws(
    () => normalizeVideoModel("unknown-video-model", "auto"),
    (error) => error?.code === "unsupported_video_model" && error?.status === 400
  );
  assert.throws(
    () => normalizeVideoModel("veo-3.1-fast-generate-preview", "omni"),
    (error) => error?.code === "unsupported_video_model"
      && error?.detail?.reason === "generator_model_mismatch"
  );
  assert.throws(
    () => normalizeVideoModel(OMNI_VIDEO_MODEL, "veo"),
    (error) => error?.code === "unsupported_video_model"
      && error?.detail?.reason === "generator_model_mismatch"
  );
});

test("automatic routing uses Omni generally and Veo only for video-specific controls", () => {
  assert.equal(resolveVideoGenerator({ generator: "auto" }), "omni");
  assert.equal(resolveVideoGenerator({ generator: "auto", hasImage: true }), "omni");
  assert.equal(resolveVideoGenerator({ generator: "auto", model: OMNI_VIDEO_MODEL }), "omni");
  assert.equal(resolveVideoGenerator({ generator: "auto", model: "veo-3.1-fast-generate-preview" }), "veo");
  assert.equal(resolveVideoGenerator({ generator: "auto", model: "veo-3.0-generate-001" }), "veo");
  assert.equal(resolveVideoGenerator({ generator: "auto", hasReferenceVideo: true }), "veo");
  assert.equal(resolveVideoGenerator({ generator: "auto", hasLastFrame: true }), "veo");
  assert.equal(resolveVideoGenerator({ generator: "auto", extendVideo: true }), "veo");
  assert.equal(resolveVideoGenerator({ generator: "omni", inSceneText: "CHARLY PODCAST", textPolicy: "in_scene" }), "omni");
  assert.throws(
    () => resolveVideoGenerator({ generator: "auto", model: "not-a-real-video-model" }),
    (error) => error?.code === "unsupported_video_model" && error?.status === 400
  );
  assert.throws(
    () => resolveVideoGenerator({ generator: "omni", model: "veo-3.1-generate-preview" }),
    (error) => error?.code === "unsupported_video_model"
      && error?.detail?.reason === "generator_model_mismatch"
  );
});

test("rejects incompatible in-scene text and correction combinations clearly", () => {
  assert.throws(
    () => resolveVideoGenerator({ generator: "veo", textPolicy: "in_scene", inSceneText: "CHARLY PODCAST" }),
    (error) => error?.code === "in_scene_text_requires_omni" && /overlay/i.test(error.message)
  );
  assert.throws(
    () => resolveVideoGenerator({ generator: "auto", hasReferenceVideo: true, inSceneText: "CHARLY PODCAST" }),
    (error) => error?.code === "in_scene_text_requires_omni"
  );
  assert.throws(
    () => resolveVideoGenerator({
      generator: "auto",
      model: "veo-3.1-fast-generate-preview",
      inSceneText: "CHARLY PODCAST"
    }),
    (error) => error?.code === "in_scene_text_requires_omni"
  );
  assert.throws(
    () => resolveVideoGenerator({ generator: "omni", hasLastFrame: true }),
    (error) => error?.code === "video_capability_requires_veo"
  );
  assert.throws(
    () => resolveVideoGenerator({ generator: "auto", model: OMNI_VIDEO_MODEL, hasLastFrame: true }),
    (error) => error?.code === "video_capability_requires_veo"
  );
  assert.throws(
    () => resolveVideoGenerator({ generator: "omni", correctInSceneText: true, inSceneText: "NUEVO TEXTO" }),
    (error) => error?.code === "previous_interaction_required"
  );
  assert.throws(
    () => resolveVideoGenerator({ generator: "omni", correctInSceneText: true, previousInteractionId: "interaction-1" }),
    (error) => error?.code === "in_scene_text_required"
  );
  assert.throws(
    () => resolveVideoGenerator({ generator: "veo", model: "veo-3.1-lite-generate-preview", quality: "final" }),
    (error) => error?.code === "veo_lite_draft_only"
  );
  assert.throws(
    () => resolveVideoGenerator({
      generator: "veo",
      model: "veo-3.1-lite-generate-preview",
      quality: "draft",
      highQuality: true,
      extendVideo: true
    }),
    (error) => error?.code === "veo_lite_video_input_unsupported"
  );
});

test("validates in-scene text as one line, six words and 48 characters", () => {
  assert.equal(normalizeInSceneText("CHARLY PODCAST"), "CHARLY PODCAST");
  assert.throws(
    () => normalizeInSceneText("CHARLY\nPODCAST"),
    (error) => error?.code === "in_scene_text_invalid"
  );
  assert.throws(
    () => normalizeInSceneText("uno dos tres cuatro cinco seis siete"),
    (error) => error?.code === "in_scene_text_invalid"
  );
  assert.throws(
    () => normalizeInSceneText("X".repeat(49)),
    (error) => error?.code === "in_scene_text_invalid"
  );
});

test("accepts only recent 720p Veo Standard/Fast outputs for extension", () => {
  const nowMs = Date.parse("2026-07-15T12:00:00.000Z");
  const source = {
    video: { uri: "files/veo-source-1", mimeType: "video/mp4" },
    generator: "veo",
    model: "veo-3.1-fast-generate-preview",
    generatedAt: "2026-07-14T12:00:00.000Z",
    resolution: "720p",
    aspectRatio: "16:9",
    durationSec: 8,
    nowMs
  };
  assert.deepEqual(validateVeoExtensionSource(source), {
    uri: "files/veo-source-1",
    mimeType: "video/mp4"
  });
  assert.throws(
    () => validateVeoExtensionSource({ ...source, generatedAt: "2026-07-12T11:59:59.000Z" }),
    (error) => error?.code === "veo_extension_source_invalid" && error?.status === 400
  );
  assert.throws(
    () => validateVeoExtensionSource({ ...source, resolution: "1080p" }),
    (error) => error?.code === "veo_extension_source_invalid"
  );
  assert.throws(
    () => validateVeoExtensionSource({
      ...source,
      video: { uri: "https://cdn.example.test/upload.mp4", mimeType: "video/mp4" }
    }),
    (error) => error?.code === "veo_extension_source_invalid"
  );
});

test("rounds Veo duration upward and forces eight seconds for constrained modes", () => {
  assert.equal(normalizeVeoDuration(4), 4);
  assert.equal(normalizeVeoDuration(4.01), 6);
  assert.equal(normalizeVeoDuration(6), 6);
  assert.equal(normalizeVeoDuration(6.01), 8);
  assert.equal(normalizeVeoDuration(8), 8);
  assert.equal(normalizeVeoDuration(4, { hasReferences: true }), 8);
  assert.equal(normalizeVeoDuration(4, { hasLastFrame: true }), 8);
  assert.equal(normalizeVeoDuration(4, { extendVideo: true }), 8);
  assert.equal(normalizeVeoDuration(4, { resolution: "1080p" }), 8);

  assert.deepEqual(resolveVeoConfig({ quality: "draft", durationSeconds: 4.01, aspectRatio: "9:16" }), {
    aspectRatio: "9:16",
    durationSeconds: 6,
    resolution: "720p",
    numberOfVideos: 1
  });
  assert.deepEqual(resolveVeoConfig({ quality: "final", durationSeconds: 4, aspectRatio: "16:9" }), {
    aspectRatio: "16:9",
    durationSeconds: 4,
    resolution: "720p",
    numberOfVideos: 1
  });
  assert.deepEqual(resolveVeoConfig({ quality: "final", highQuality: true, durationSeconds: 4, aspectRatio: "16:9" }), {
    aspectRatio: "16:9",
    durationSeconds: 8,
    resolution: "1080p",
    numberOfVideos: 1
  });
  assert.equal(resolveVeoConfig({ durationSeconds: 4, hasReferences: true }).durationSeconds, 8);
  assert.equal(resolveVeoConfig({ durationSeconds: 4, hasLastFrame: true }).durationSeconds, 8);
  assert.equal(resolveVeoConfig({ durationSeconds: 4, extendVideo: true }).durationSeconds, 8);
});

test("Veo model, duration and resolution matrix keeps normal final at 720p", () => {
  const cases = [
    {
      model: "veo-3.1-generate-preview",
      quality: "final",
      requestedDuration: 4,
      effectiveModel: "veo-3.1-generate-preview",
      effectiveDuration: 4
    },
    {
      model: "veo-3.1-fast-generate-preview",
      quality: "final",
      requestedDuration: 4.1,
      effectiveModel: "veo-3.1-fast-generate-preview",
      effectiveDuration: 6
    },
    {
      model: "veo-3.1-lite-generate-preview",
      quality: "draft",
      requestedDuration: 6.1,
      effectiveModel: "veo-3.1-lite-generate-preview",
      effectiveDuration: 8
    }
  ];
  for (const item of cases) {
    assert.equal(normalizeVideoModel(item.model, "veo", item.quality), item.effectiveModel);
    const config = resolveVeoConfig({ quality: item.quality, durationSeconds: item.requestedDuration });
    assert.equal(config.resolution, "720p");
    assert.equal(config.durationSeconds, item.effectiveDuration);
  }
  assert.equal(
    normalizeVideoModel("veo-3.1-fast-generate-preview", "veo", "final", { highQuality: true }),
    DEFAULT_VEO_VIDEO_MODEL
  );
  assert.deepEqual(resolveVeoConfig({ highQuality: true, durationSeconds: 4 }), {
    aspectRatio: "16:9",
    durationSeconds: 8,
    resolution: "1080p",
    numberOfVideos: 1
  });
});

test("builds supported Omni tasks without Veo-only tuning parameters", () => {
  const image = { data: "aW1hZ2U=", mimeType: "image/png" };
  assert.equal(resolveOmniTask({}), "text_to_video");
  assert.equal(resolveOmniTask({ images: [image] }), "image_to_video");
  assert.equal(resolveOmniTask({ images: [image, image] }), "reference_to_video");
  assert.equal(resolveOmniTask({ correctInSceneText: true, previousInteractionId: "interaction-1" }), "edit");

  const params = buildOmniInteractionParams({
    prompt: "[00:00-00:06] A continuous studio shot.",
    aspectRatio: "9:16",
    images: [image],
    temperature: 0.9,
    negativePrompt: "bad text",
    resolution: "1080p",
    durationSeconds: 6
  });

  assert.equal(params.model, OMNI_VIDEO_MODEL);
  assert.deepEqual(params.response_format, {
    type: "video",
    delivery: "uri",
    aspect_ratio: "9:16"
  });
  assert.equal(params.generation_config.video_config.task, "image_to_video");
  assert.deepEqual(params.input.slice(0, 3), [
    { type: "image", data: "aW1hZ2U=", mime_type: "image/png" },
    { type: "text", text: "<FIRST_FRAME> [00:00-00:06] A continuous studio shot." }
  ]);
  assert.equal(params.background, false);
  assert.equal(params.stream, false);
  assert.equal(params.store, true, "URI video delivery must always store the interaction");
  assert.equal(Object.hasOwn(params, "temperature"), false);
  assert.equal(Object.hasOwn(params, "negativePrompt"), false);
  assert.equal(Object.hasOwn(params, "resolution"), false);
  assert.equal(Object.hasOwn(params, "durationSeconds"), false);
  assert.equal(JSON.stringify(params).includes("1080p"), false);

  const referenceParams = buildOmniInteractionParams({
    prompt: "Keep the referenced subject and environment coherent.",
    images: [image, image],
    referenceImages: true
  });
  assert.equal(referenceParams.generation_config.video_config.task, "reference_to_video");
  assert.deepEqual(
    referenceParams.input.filter((item) => item?.type === "text").map((item) => item.text),
    ["<IMAGE_REF_0> <IMAGE_REF_1> Keep the referenced subject and environment coherent."]
  );
});

test("builds an Omni text correction from the previous interaction only once", () => {
  const params = buildOmniInteractionParams({
    prompt: "Ignored for an edit",
    inSceneText: "CHARLY PODCAST",
    correctInSceneText: true,
    previousInteractionId: "interaction-previous",
    aspectRatio: "16:9"
  });

  assert.equal(params.previous_interaction_id, "interaction-previous");
  assert.equal(params.generation_config.video_config.task, "edit");
  assert.equal(params.store, true);
  assert.equal((String(params.input).match(/CHARLY PODCAST/g) || []).length, 1);
  assert.match(String(params.input), /Keep everything else the same\. No other visible text\./);
});

test("extracts Omni and Veo media from inline and URI response shapes", () => {
  assert.deepEqual(extractOmniVideoOutput({
    output_video: { data: "bXA0", mime_type: "video/mp4" }
  }), { data: "bXA0", uri: "", mimeType: "video/mp4" });

  assert.deepEqual(extractOmniVideoOutput({
    steps: [{ content: [{ type: "video", uri: "files/omni-video", mime_type: "video/mp4" }] }]
  }), { data: "", uri: "files/omni-video", mimeType: "video/mp4" });

  assert.deepEqual(extractVeoVideoOutput({
    response: { generatedSamples: [{ video: { uri: "files/veo-video", mimeType: "video/mp4" } }] }
  }), { data: "", uri: "files/veo-video", mimeType: "video/mp4" });
});

test("Omni adapter returns interaction metadata without polling another model", async () => {
  const requests = [];
  const client = {
    interactions: {
      async create(params, requestOptions) {
        requests.push({ params, requestOptions });
        return {
          id: "interaction-omni-1",
          output_video: { uri: "files/omni-1", mime_type: "video/mp4" }
        };
      }
    }
  };

  const result = await createOmniVideo({
    client,
    prompt: "[00:00-00:06] A continuous scene.",
    aspectRatio: "9:16",
    inSceneText: "CHARLY PODCAST",
    timeoutMs: 1234
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].params.store, true);
  assert.equal(requests[0].params.response_format.delivery, "uri");
  assert.equal(requests[0].requestOptions.timeout, 1234);
  assert.equal(result.generator, "omni");
  assert.equal(result.model, OMNI_VIDEO_MODEL);
  assert.equal(result.variant, "text_to_video");
  assert.equal(result.interactionId, "interaction-omni-1");
  assert.equal(result.uri, "files/omni-1");
});

test("Veo adapter polls the accepted operation and returns effective metadata", async () => {
  const generatedRequests = [];
  const pollRequests = [];
  const client = {
    models: {
      async generateVideos(request) {
        generatedRequests.push(request);
        return { name: "operations/veo-1", done: false };
      }
    },
    operations: {
      async getVideosOperation(request) {
        pollRequests.push(request);
        return {
          name: "operations/veo-1",
          done: true,
          response: {
            generatedSamples: [{ video: { uri: "files/veo-1", mimeType: "video/mp4" } }]
          }
        };
      }
    }
  };

  const result = await createVeoVideo({
    client,
    model: "veo-3.1-fast-generate-preview",
    quality: "draft",
    prompt: "A continuous no-text shot.",
    durationSeconds: 4.2,
    aspectRatio: "16:9",
    timeoutMs: 5000,
    pollIntervalMs: 250,
    sleep: async () => {}
  });

  assert.equal(generatedRequests.length, 1);
  assert.equal(generatedRequests[0].model, "veo-3.1-fast-generate-preview");
  assert.equal(generatedRequests[0].config.durationSeconds, 6);
  assert.equal(generatedRequests[0].config.resolution, "720p");
  assert.equal(generatedRequests[0].config.aspectRatio, "16:9");
  assert.equal(pollRequests.length, 1);
  assert.equal(pollRequests[0].operation.name, "operations/veo-1");
  assert.ok(pollRequests[0].config.httpOptions.timeout >= 1000);
  assert.equal(result.generator, "veo");
  assert.equal(result.model, "veo-3.1-fast-generate-preview");
  assert.equal(result.operationName, "operations/veo-1");
  assert.equal(result.durationSeconds, 6);
  assert.equal(result.resolution, "720p");
  assert.equal(result.uri, "files/veo-1");
});

test("Veo keeps a normal first-frame generation at four seconds", async () => {
  const requests = [];
  const client = {
    models: {
      async generateVideos(request) {
        requests.push(request);
        return {
          name: "operations/first-frame-4s",
          done: true,
          response: {
            generatedVideos: [{ video: { uri: "files/first-frame-4s", mimeType: "video/mp4" } }]
          }
        };
      }
    },
    operations: { async getVideosOperation() { throw new Error("No polling expected"); } }
  };

  const result = await createVeoVideo({
    client,
    model: "veo-3.1-fast-generate-preview",
    quality: "final",
    prompt: "Animate the supplied first frame.",
    firstFrame: { data: "aW1hZ2U=", mimeType: "image/png" },
    durationSeconds: 4,
    aspectRatio: "9:16"
  });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].image, { imageBytes: "aW1hZ2U=", mimeType: "image/png" });
  assert.equal(requests[0].config.durationSeconds, 4);
  assert.equal(requests[0].config.resolution, "720p");
  assert.equal(requests[0].config.aspectRatio, "9:16");
  assert.equal(Object.hasOwn(requests[0].config, "referenceImages"), false);
  assert.equal(Object.hasOwn(requests[0].config, "lastFrame"), false);
  assert.equal(result.durationSeconds, 4);
});

test("Veo total deadline includes time spent accepting generateVideos", async () => {
  let nowMs = 0;
  const sleeps = [];
  let pollCalls = 0;
  let generatedRequest;
  const client = {
    models: {
      async generateVideos(request) {
        generatedRequest = request;
        nowMs += 800;
        return { name: "operations/deadline-1", done: false };
      }
    },
    operations: {
      async getVideosOperation() {
        pollCalls += 1;
        return { name: "operations/deadline-1", done: false };
      }
    }
  };

  await assert.rejects(
    createVeoVideo({
      client,
      prompt: "A continuous scene.",
      timeoutMs: 1000,
      pollIntervalMs: 500,
      now: () => nowMs,
      sleep: async (ms) => {
        sleeps.push(ms);
        nowMs += ms;
      }
    }),
    (error) => error?.code === "veo_operation_poll_timeout"
      && error?.status === 504
      && error?.detail?.operationName === "operations/deadline-1"
      && error?.detail?.timeoutMs === 1000
  );

  assert.equal(generatedRequest.config.httpOptions.timeout, 1000);
  assert.deepEqual(sleeps, [200]);
  assert.equal(pollCalls, 0);
});

test("Veo Lite never accepts reference images silently", async () => {
  let generated = false;
  const client = {
    models: {
      async generateVideos() {
        generated = true;
        return { name: "operations/should-not-start", done: true };
      }
    },
    operations: { async getVideosOperation() { return {}; } }
  };

  await assert.rejects(
    createVeoVideo({
      client,
      model: "veo-3.1-lite-generate-preview",
      quality: "draft",
      prompt: "A scene.",
      images: [{ data: "aW1hZ2U=", mimeType: "image/png" }]
    }),
    (error) => error?.code === "veo_lite_reference_images_unsupported"
  );
  assert.equal(generated, false);
});

test("Veo Lite rejects final quality before starting an operation", async () => {
  let generated = false;
  const client = {
    models: { async generateVideos() { generated = true; return {}; } },
    operations: { async getVideosOperation() { return {}; } }
  };
  await assert.rejects(
    createVeoVideo({
      client,
      model: "veo-3.1-lite-generate-preview",
      quality: "final",
      prompt: "A scene."
    }),
    (error) => error?.code === "veo_lite_draft_only"
  );
  assert.equal(generated, false);
});

test("Veo extension sends the input video at 720p for eight seconds", async () => {
  const requests = [];
  const client = {
    models: {
      async generateVideos(request) {
        requests.push(request);
        return {
          name: "operations/extension-1",
          done: true,
          response: { generatedVideos: [{ video: { uri: "files/extension-1", mimeType: "video/mp4" } }] }
        };
      }
    },
    operations: { async getVideosOperation() { throw new Error("No polling expected"); } }
  };

  const inputVideo = { data: "dmlkZW8=", mimeType: "video/mp4" };
  assert.deepEqual(toSdkVideo(inputVideo), { videoBytes: "dmlkZW8=", mimeType: "video/mp4" });
  const result = await createVeoVideo({
    client,
    model: "veo-3.1-fast-generate-preview",
    quality: "final",
    prompt: "Continue the same shot.",
    video: inputVideo,
    extendVideo: true,
    durationSeconds: 4
  });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].video, { videoBytes: "dmlkZW8=", mimeType: "video/mp4" });
  assert.equal(Object.hasOwn(requests[0], "image"), false);
  assert.equal(requests[0].config.resolution, "720p");
  assert.equal(requests[0].config.durationSeconds, 8);
  assert.equal(result.resolution, "720p");
});

test("Veo Lite rejects video extension without silently switching models", async () => {
  let generated = false;
  const client = {
    models: { async generateVideos() { generated = true; return {}; } },
    operations: { async getVideosOperation() { return {}; } }
  };
  await assert.rejects(
    createVeoVideo({
      client,
      model: "veo-3.1-lite-generate-preview",
      quality: "draft",
      prompt: "Continue the shot.",
      video: { data: "dmlkZW8=", mimeType: "video/mp4" },
      extendVideo: true
    }),
    (error) => error?.code === "veo_lite_video_input_unsupported"
  );
  assert.equal(generated, false);
});

test("Veo rejects unsupported extension and last-frame combinations before cost", async () => {
  let generated = false;
  const client = {
    models: { async generateVideos() { generated = true; return {}; } },
    operations: { async getVideosOperation() { return {}; } }
  };
  await assert.rejects(
    createVeoVideo({
      client,
      prompt: "Continue.",
      extendVideo: true,
      video: { data: "dmlkZW8=", mimeType: "video/mp4" },
      highQuality: true
    }),
    (error) => error?.code === "veo_extension_1080p_unsupported"
  );
  await assert.rejects(
    createVeoVideo({
      client,
      prompt: "Reach the final composition.",
      lastFrame: { data: "aW1hZ2U=", mimeType: "image/png" }
    }),
    (error) => error?.code === "veo_last_frame_requires_first_frame"
  );
  await assert.rejects(
    createVeoVideo({
      client,
      prompt: "Reach the final composition.",
      firstFrame: { data: "aW1hZ2Ux", mimeType: "image/png" },
      lastFrame: { data: "aW1hZ2Uy", mimeType: "image/png" },
      images: [{ data: "cmVmZXJlbmNl", mimeType: "image/png" }]
    }),
    (error) => error?.code === "veo_last_frame_input_conflict"
      || error?.code === "veo_first_frame_reference_conflict"
  );
  assert.equal(generated, false);
});

test("Veo lastFrame is sent only with an image-to-video first frame", async () => {
  const requests = [];
  const client = {
    models: {
      async generateVideos(request) {
        requests.push(request);
        return {
          name: "operations/last-frame-1",
          done: true,
          response: { generatedVideos: [{ video: { uri: "files/last-frame-1", mimeType: "video/mp4" } }] }
        };
      }
    },
    operations: { async getVideosOperation() { throw new Error("No polling expected"); } }
  };

  await createVeoVideo({
    client,
    prompt: "Move naturally between the supplied frames.",
    firstFrame: { data: "aW1hZ2Ux", mimeType: "image/png" },
    lastFrame: { data: "aW1hZ2Uy", mimeType: "image/png" },
    durationSeconds: 4
  });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].image, { imageBytes: "aW1hZ2Ux", mimeType: "image/png" });
  assert.deepEqual(requests[0].config.lastFrame, { imageBytes: "aW1hZ2Uy", mimeType: "image/png" });
  assert.equal(requests[0].config.durationSeconds, 8);
  assert.equal(Object.hasOwn(requests[0].config, "referenceImages"), false);
  assert.equal(Object.hasOwn(requests[0], "video"), false);
});

test("materializes inline and file URI outputs with header authentication, never a query key", async () => {
  const inline = await materializeGeneratedVideo({
    media: { data: Buffer.from("inline-video").toString("base64"), mimeType: "video/mp4" }
  });
  assert.equal(inline.buffer.toString(), "inline-video");

  const calls = [];
  const response = (body, options = {}) => ({
    ok: options.ok !== false,
    status: options.status || 200,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? (options.mimeType || "video/mp4") : "" },
    async json() { return body && typeof body === "object" && !Buffer.isBuffer(body) ? body : {}; },
    async arrayBuffer() { return Buffer.from(body || ""); }
  });
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/files/video-1")) return response({ state: "ACTIVE" });
    return response("downloaded-video");
  };

  const downloaded = await materializeGeneratedVideo({
    media: { uri: "files/video-1", mimeType: "video/mp4" },
    apiKey: "test-key",
    fetchFn,
    timeoutMs: 5000,
    sleep: async () => {}
  });

  assert.equal(downloaded.buffer.toString(), "downloaded-video");
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.init.headers["x-goog-api-key"] === "test-key"), true);
  assert.equal(calls.some((call) => /[?&]key=/.test(call.url)), false);
  assert.match(calls[1].url, /files\/video-1:download\?alt=media$/);

  calls.length = 0;
  await materializeGeneratedVideo({
    media: {
      uri: "https://generativelanguage.googleapis.com/v1beta/files/video-1",
      mimeType: "video/mp4"
    },
    apiKey: "test-key",
    fetchFn,
    timeoutMs: 5000,
    sleep: async () => {}
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /files\/video-1:download\?alt=media$/);
});
