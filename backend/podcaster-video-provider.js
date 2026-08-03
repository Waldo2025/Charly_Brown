"use strict";

const OMNI_VIDEO_MODEL = "gemini-omni-flash-preview";
const DEFAULT_VEO_VIDEO_MODEL = "veo-3.1-generate-preview";
const VEO_VIDEO_MODELS = Object.freeze([
  DEFAULT_VEO_VIDEO_MODEL,
  "veo-3.1-fast-generate-preview",
  "veo-3.1-lite-generate-preview"
]);
const VIDEO_MODELS = Object.freeze([OMNI_VIDEO_MODEL, ...VEO_VIDEO_MODELS]);
const PROVIDER_TIMEOUT_MS = 7 * 60 * 1000;
const MEDIA_TIMEOUT_MS = 3 * 60 * 1000;
const IN_SCENE_TEXT_MAX_CHARACTERS = 280;
const IN_SCENE_TEXT_MAX_WORDS = 40;
const IN_SCENE_TEXT_MAX_LINES = 4;

const LEGACY_VIDEO_MODEL_MAP = Object.freeze({
  "veo-2.0-generate-001": DEFAULT_VEO_VIDEO_MODEL,
  "veo-3.0-generate-001": DEFAULT_VEO_VIDEO_MODEL,
  "veo-3.0-fast-generate-001": "veo-3.1-fast-generate-preview"
});

function cleanString(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createVideoContractError(code, message, detail = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  if (detail && typeof detail === "object") error.detail = detail;
  return error;
}

function normalizeGenerator(value = "auto", model = "") {
  const requested = cleanString(value).toLowerCase();
  if (["auto", "omni", "veo"].includes(requested)) return requested;
  const modelName = cleanString(model).toLowerCase();
  if (modelName.startsWith("gemini-omni-")) return "omni";
  if (modelName.startsWith("veo-")) return "veo";
  return "auto";
}

function normalizeQuality(value = "final") {
  return cleanString(value).toLowerCase() === "draft" ? "draft" : "final";
}

function normalizeTextPolicy(value = "", inSceneText = "") {
  const requested = cleanString(value).toLowerCase();
  if (requested === "in_scene" || requested === "overlay_only") return requested;
  return cleanString(inSceneText) ? "in_scene" : "overlay_only";
}

function normalizeAspectRatio(value = "16:9", isReel = false) {
  const requested = cleanString(value);
  if (requested === "9:16" || requested === "16:9") return requested;
  return isReel ? "9:16" : "16:9";
}

function normalizeInSceneText(value = "", options = {}) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean);
  const text = lines.join("\n").trim();
  if (!text) return "";
  const words = text.split(/\s+/).filter(Boolean);
  if (text.length > IN_SCENE_TEXT_MAX_CHARACTERS || words.length > IN_SCENE_TEXT_MAX_WORDS || lines.length > IN_SCENE_TEXT_MAX_LINES) {
    if (options?.truncate === true) {
      return words.slice(0, IN_SCENE_TEXT_MAX_WORDS).join(" ").slice(0, IN_SCENE_TEXT_MAX_CHARACTERS).trim();
    }
    throw createVideoContractError(
      "in_scene_text_invalid",
      "inSceneText admite hasta 4 líneas, 40 palabras y 280 caracteres.",
      {
        characterCount: text.length,
        wordCount: words.length,
        lineCount: lines.length,
        maxCharacters: IN_SCENE_TEXT_MAX_CHARACTERS,
        maxWords: IN_SCENE_TEXT_MAX_WORDS,
        maxLines: IN_SCENE_TEXT_MAX_LINES
      }
    );
  }
  return text;
}

function normalizeVideoModel(value = "", generator = "auto", quality = "final", options = {}) {
  const requested = cleanString(value).replace(/^models\//i, "").toLowerCase();
  const normalizedGenerator = normalizeGenerator(generator, requested);
  const isAutomaticModel = !requested || requested === "auto";
  if (isAutomaticModel) {
    return normalizedGenerator === "veo" ? DEFAULT_VEO_VIDEO_MODEL : OMNI_VIDEO_MODEL;
  }

  const mapped = LEGACY_VIDEO_MODEL_MAP[requested] || requested;
  if (!VIDEO_MODELS.includes(mapped)) {
    throw createVideoContractError(
      "unsupported_video_model",
      `Modelo de video no soportado: ${requested}.`,
      { requestedModel: requested, allowedModels: VIDEO_MODELS }
    );
  }

  const modelGenerator = mapped === OMNI_VIDEO_MODEL ? "omni" : "veo";
  if (normalizedGenerator !== "auto" && normalizedGenerator !== modelGenerator) {
    throw createVideoContractError(
      "unsupported_video_model",
      `El modelo ${mapped} no corresponde al generador ${normalizedGenerator}.`,
      {
        requestedModel: requested,
        mappedModel: mapped,
        requestedGenerator: normalizedGenerator,
        modelGenerator,
        reason: "generator_model_mismatch"
      }
    );
  }

  if (modelGenerator === "veo" && options?.highQuality === true) return DEFAULT_VEO_VIDEO_MODEL;
  return mapped;
}

function resolveVideoGenerator(options = {}) {
  const inSceneText = normalizeInSceneText(options?.inSceneText || "");
  const textPolicy = normalizeTextPolicy(options?.textPolicy, inSceneText);
  const requested = normalizeGenerator(options?.generator, options?.model);
  const quality = normalizeQuality(options?.quality);
  const needsVeo = options?.hasReferenceVideo === true
    || options?.hasLastFrame === true
    || options?.extendVideo === true;
  const requestedModelRaw = cleanString(options?.model).replace(/^models\//i, "").toLowerCase();
  const hasExplicitModel = Boolean(requestedModelRaw && requestedModelRaw !== "auto");
  const explicitModel = hasExplicitModel
    ? normalizeVideoModel(requestedModelRaw, "auto", quality)
    : "";
  const explicitModelGenerator = explicitModel
    ? (explicitModel === OMNI_VIDEO_MODEL ? "omni" : "veo")
    : "";
  const resolved = requested === "auto"
    ? (needsVeo ? "veo" : (explicitModelGenerator || "omni"))
    : requested;

  if (options?.correctInSceneText === true && !cleanString(options?.previousInteractionId)) {
    throw createVideoContractError(
      "previous_interaction_required",
      "Corregir texto dentro de la escena requiere previousInteractionId."
    );
  }
  if (options?.correctInSceneText === true && !inSceneText) {
    throw createVideoContractError(
      "in_scene_text_required",
      "Corregir texto dentro de la escena requiere inSceneText."
    );
  }
  if (textPolicy === "in_scene" && !inSceneText) {
    throw createVideoContractError(
      "in_scene_text_required",
      "textPolicy=in_scene requiere inSceneText."
    );
  }
  if (
    needsVeo
    && (requested === "omni" || (requested === "auto" && explicitModelGenerator === "omni"))
  ) {
    throw createVideoContractError(
      "video_capability_requires_veo",
      "La extensión, referencia de video o control de último fotograma requiere Veo 3.1.",
      { requestedGenerator: requested }
    );
  }
  const resolvedModelWithoutHqOverride = normalizeVideoModel(options?.model, resolved, quality);
  if (
    resolved === "veo"
    && resolvedModelWithoutHqOverride === "veo-3.1-lite-generate-preview"
    && options?.extendVideo === true
  ) {
    throw createVideoContractError(
      "veo_lite_video_input_unsupported",
      "Veo 3.1 Lite no admite extensión ni video de entrada. Usa Veo 3.1 Standard o Fast."
    );
  }
  const resolvedModel = normalizeVideoModel(options?.model, resolved, quality, {
    highQuality: options?.highQuality === true
  });
  if (
    resolved === "veo"
    && resolvedModel === "veo-3.1-lite-generate-preview"
    && quality !== "draft"
    && options?.highQuality !== true
  ) {
    throw createVideoContractError(
      "veo_lite_draft_only",
      "Veo 3.1 Lite sólo está disponible con quality=draft. Usa Draft o selecciona Veo 3.1 Standard/Fast."
    );
  }
  return resolved;
}

function normalizeVeoDuration(value = 8, options = {}) {
  const raw = Number(value);
  const requested = Number.isFinite(raw) ? Math.max(4, Math.min(8, raw)) : 8;
  const normalized = requested <= 4 ? 4 : (requested <= 6 ? 6 : 8);
  if (
    options?.hasReferences === true
    || options?.hasLastFrame === true
    || options?.extendVideo === true
    || cleanString(options?.resolution).toLowerCase() === "1080p"
  ) return 8;
  return normalized;
}

function resolveVeoConfig(options = {}) {
  const highQuality = options?.highQuality === true;
  const resolution = highQuality ? "1080p" : "720p";
  const durationSeconds = normalizeVeoDuration(options?.durationSeconds, {
    hasReferences: options?.hasReferences === true,
    hasLastFrame: options?.hasLastFrame === true,
    extendVideo: options?.extendVideo === true,
    resolution
  });
  return {
    aspectRatio: normalizeAspectRatio(options?.aspectRatio),
    durationSeconds,
    resolution,
    numberOfVideos: 1
  };
}

function resolveOmniTask(options = {}) {
  if (options?.correctInSceneText === true || cleanString(options?.previousInteractionId)) return "edit";
  const count = Array.isArray(options?.images) ? options.images.length : 0;
  if (count > 1 || options?.referenceImages === true) return "reference_to_video";
  if (count === 1) return "image_to_video";
  return "text_to_video";
}

function buildOmniInteractionParams(options = {}) {
  const model = OMNI_VIDEO_MODEL;
  const prompt = cleanString(options?.prompt);
  const previousInteractionId = cleanString(options?.previousInteractionId);
  const inSceneText = normalizeInSceneText(options?.inSceneText || "");
  const images = (Array.isArray(options?.images) ? options.images : [])
    .map((image) => ({
      type: "image",
      data: cleanString(image?.data || image?.imageBytes),
      mime_type: cleanString(image?.mimeType || image?.mime_type || "image/png") || "image/png"
    }))
    .filter((image) => image.data);
  const task = resolveOmniTask({
    images,
    referenceImages: options?.referenceImages === true,
    correctInSceneText: options?.correctInSceneText === true,
    previousInteractionId
  });
  const isEdit = task === "edit";
  const inputPrompt = isEdit
    ? `Change the visible text to exactly "${inSceneText.replace(/"/g, '\\"')}". Keep everything else the same. No other visible text.`
    : prompt;
  const imageRoleTags = task === "image_to_video"
    ? "<FIRST_FRAME>"
    : images.map((_, index) => `<IMAGE_REF_${index}>`).join(" ");
  const roleBoundPrompt = [imageRoleTags, inputPrompt].filter(Boolean).join(" ");
  const input = images.length && !isEdit
    ? [...images, { type: "text", text: roleBoundPrompt }]
    : inputPrompt;
  return {
    model,
    input,
    response_format: {
      type: "video",
      delivery: "uri",
      aspect_ratio: normalizeAspectRatio(options?.aspectRatio)
    },
    generation_config: {
      video_config: { task }
    },
    background: false,
    stream: false,
    // URI video delivery requires a stored interaction so Gemini can host the
    // generated file while it is retrieved and downloaded.
    store: true,
    ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {})
  };
}

function extractOmniVideoOutput(interaction = {}) {
  const direct = interaction?.output_video || interaction?.outputVideo;
  if (direct?.data || direct?.uri) {
    return {
      data: cleanString(direct.data),
      uri: cleanString(direct.uri),
      mimeType: cleanString(direct.mime_type || direct.mimeType || "video/mp4") || "video/mp4"
    };
  }
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const content = Array.isArray(steps[stepIndex]?.content) ? steps[stepIndex].content : [];
    for (const item of content) {
      if (cleanString(item?.type).toLowerCase() !== "video") continue;
      const data = cleanString(item?.data);
      const uri = cleanString(item?.uri);
      if (data || uri) {
        return {
          data,
          uri,
          mimeType: cleanString(item?.mime_type || item?.mimeType || "video/mp4") || "video/mp4"
        };
      }
    }
  }
  return null;
}

function extractVeoVideoOutput(operation = {}) {
  const response = operation?.response || operation?.result || {};
  const generated = Array.isArray(response?.generatedVideos)
    ? response.generatedVideos[0]
    : (Array.isArray(response?.generated_videos)
      ? response.generated_videos[0]
      : (Array.isArray(response?.generatedSamples)
        ? response.generatedSamples[0]
        : (Array.isArray(response?.generated_samples) ? response.generated_samples[0] : null)));
  const video = generated?.video || generated || null;
  if (!video) return null;
  const data = cleanString(video?.videoBytes || video?.video_bytes || video?.data);
  const uri = cleanString(video?.uri || video?.fileUri || video?.file_uri);
  if (!data && !uri) return null;
  return {
    data,
    uri,
    mimeType: cleanString(video?.mimeType || video?.mime_type || "video/mp4") || "video/mp4"
  };
}

function toSdkImage(image = {}) {
  const imageBytes = cleanString(image?.data || image?.imageBytes || image?.bytesBase64Encoded);
  const gcsUri = cleanString(image?.gcsUri);
  if (!imageBytes && !gcsUri) return null;
  return {
    ...(imageBytes ? { imageBytes } : {}),
    ...(gcsUri ? { gcsUri } : {}),
    mimeType: cleanString(image?.mimeType || "image/png") || "image/png"
  };
}

function toSdkVideo(video = {}) {
  const videoBytes = cleanString(video?.data || video?.videoBytes || video?.bytesBase64Encoded);
  const uri = cleanString(video?.uri || video?.gcsUri);
  if (!videoBytes && !uri) return null;
  return {
    ...(videoBytes ? { videoBytes } : {}),
    ...(uri ? { uri } : {}),
    mimeType: cleanString(video?.mimeType || "video/mp4") || "video/mp4"
  };
}

function validateVeoExtensionSource(options = {}) {
  const video = toSdkVideo(options?.video || {});
  const uri = cleanString(video?.uri);
  const generator = cleanString(options?.generator).toLowerCase();
  const model = cleanString(options?.model).replace(/^models\//i, "");
  const resolution = cleanString(options?.resolution).toLowerCase();
  const aspectRatio = cleanString(options?.aspectRatio);
  const durationSec = Number(options?.durationSec);
  const generatedAtMs = Date.parse(cleanString(options?.generatedAt));
  const nowMs = Number.isFinite(Number(options?.nowMs)) ? Number(options.nowMs) : Date.now();
  const ageMs = nowMs - generatedAtMs;
  const maxAgeMs = 2 * 24 * 60 * 60 * 1000;
  const supportedModel = model === DEFAULT_VEO_VIDEO_MODEL || model === "veo-3.1-fast-generate-preview";
  const validGeminiFileUri = Boolean(uri && extractGeminiFileName(uri));

  if (
    !video
    || !validGeminiFileUri
    || generator !== "veo"
    || !supportedModel
    || resolution !== "720p"
    || !["16:9", "9:16"].includes(aspectRatio)
    || !Number.isFinite(durationSec)
    || durationSec <= 0
    || durationSec > 141
    || !Number.isFinite(generatedAtMs)
    || ageMs < -5 * 60 * 1000
    || ageMs > maxAgeMs
  ) {
    throw createVideoContractError(
      "veo_extension_source_invalid",
      "Veo sólo puede extender un video 720p generado por Veo 3.1 Standard/Fast durante los últimos 2 días. Usa el clip original o conviértelo en referencia de último fotograma.",
      {
        hasProviderUri: validGeminiFileUri,
        generator,
        model,
        resolution,
        aspectRatio,
        durationSec: Number.isFinite(durationSec) ? durationSec : null,
        generatedAt: Number.isFinite(generatedAtMs) ? new Date(generatedAtMs).toISOString() : null
      }
    );
  }
  return video;
}

async function createOmniVideo(options = {}) {
  const client = options?.client;
  if (!client?.interactions?.create) throw new Error("Gemini SDK no expone interactions.create.");
  const params = buildOmniInteractionParams(options);
  const interaction = await client.interactions.create(params, {
    timeout: Math.max(1000, Number(options?.timeoutMs || PROVIDER_TIMEOUT_MS) || PROVIDER_TIMEOUT_MS)
  });
  const media = extractOmniVideoOutput(interaction);
  if (!media) {
    const error = new Error("Gemini Omni completó la interacción sin devolver video.");
    error.code = "omni_completed_without_video";
    error.status = 502;
    throw error;
  }
  return {
    ...media,
    generator: "omni",
    model: OMNI_VIDEO_MODEL,
    variant: cleanString(params?.generation_config?.video_config?.task || "text_to_video"),
    interactionId: cleanString(interaction?.id),
    request: params
  };
}

function createVeoOperationTimeoutError(operation = {}, model = "", timeoutMs = PROVIDER_TIMEOUT_MS) {
  const error = new Error("Veo superó el límite total del proveedor. No se inició otro modelo.");
  error.code = "veo_operation_poll_timeout";
  error.status = 504;
  error.detail = {
    operationName: cleanString(operation?.name),
    model: cleanString(model),
    timeoutMs
  };
  return error;
}

async function createVeoVideo(options = {}) {
  const client = options?.client;
  if (!client?.models?.generateVideos || !client?.operations?.getVideosOperation) {
    throw new Error("Gemini SDK no expone el cliente oficial de video Veo.");
  }
  const quality = normalizeQuality(options?.quality);
  const highQuality = options?.highQuality === true;
  const requestedModel = normalizeVideoModel(options?.model, "veo", quality);
  if (requestedModel === "veo-3.1-lite-generate-preview" && quality !== "draft" && !highQuality) {
    throw createVideoContractError(
      "veo_lite_draft_only",
      "Veo 3.1 Lite sólo está disponible con quality=draft. Usa Draft o selecciona Veo 3.1 Standard/Fast."
    );
  }
  const model = normalizeVideoModel(options?.model, "veo", quality, { highQuality });
  const images = (Array.isArray(options?.images) ? options.images : []).map(toSdkImage).filter(Boolean);
  const firstFrame = toSdkImage(options?.firstFrame || null);
  const lastFrame = toSdkImage(options?.lastFrame || null);
  const video = toSdkVideo(options?.video || null);
  const extendVideo = options?.extendVideo === true || Boolean(video);
  if (options?.extendVideo === true && !video) {
    throw createVideoContractError(
      "veo_extension_video_required",
      "La extensión con Veo 3.1 requiere un video de entrada válido."
    );
  }
  if (requestedModel === "veo-3.1-lite-generate-preview" && video) {
    throw createVideoContractError(
      "veo_lite_video_input_unsupported",
      "Veo 3.1 Lite no admite extensión ni video de entrada. Usa Veo 3.1 Standard o Fast."
    );
  }
  if (video && (firstFrame || lastFrame || images.length)) {
    throw createVideoContractError(
      "veo_video_input_conflict",
      "La extensión de video no puede combinarse con firstFrame, lastFrame ni referenceImages."
    );
  }
  if (highQuality && video) {
    throw createVideoContractError(
      "veo_extension_1080p_unsupported",
      "La extensión de video de Veo 3.1 sólo admite 720p; desactiva Alta calidad."
    );
  }
  if (lastFrame && !firstFrame) {
    throw createVideoContractError(
      "veo_last_frame_requires_first_frame",
      "lastFrame sólo está disponible en image-to-video y requiere firstFrame."
    );
  }
  if (lastFrame && (video || images.length)) {
    throw createVideoContractError(
      "veo_last_frame_input_conflict",
      "lastFrame no puede combinarse con video ni referenceImages."
    );
  }
  if (firstFrame && images.length) {
    throw createVideoContractError(
      "veo_first_frame_reference_conflict",
      "firstFrame no puede combinarse con referenceImages."
    );
  }
  const config = resolveVeoConfig({
    quality,
    highQuality,
    durationSeconds: options?.durationSeconds,
    aspectRatio: options?.aspectRatio,
    hasReferences: images.length > 0,
    hasLastFrame: Boolean(lastFrame),
    extendVideo,
    externalDialogueAudio: options?.externalDialogueAudio === true
  });
  const timeoutMs = Math.max(1000, Number(options?.timeoutMs || PROVIDER_TIMEOUT_MS) || PROVIDER_TIMEOUT_MS);
  const now = typeof options?.now === "function" ? options.now : Date.now;
  const startedAt = now();
  const remainingMs = () => Math.max(0, timeoutMs - Math.max(0, now() - startedAt));
  const throwIfDeadlineExpired = (operation = {}) => {
    if (remainingMs() <= 0) throw createVeoOperationTimeoutError(operation, model, timeoutMs);
  };
  config.httpOptions = { timeout: timeoutMs };
  if (lastFrame) config.lastFrame = lastFrame;
  if (images.length) {
    if (model === "veo-3.1-lite-generate-preview") {
      throw createVideoContractError(
        "veo_lite_reference_images_unsupported",
        "Veo 3.1 Lite no admite referenceImages. Usa Veo 3.1 Standard/Fast u Omni."
      );
    }
    config.referenceImages = images.slice(0, 3).map((image) => ({ image, referenceType: "ASSET" }));
  }
  const request = {
    model,
    prompt: cleanString(options?.prompt),
    ...(video ? { video } : {}),
    ...(firstFrame && !images.length && !video ? { image: firstFrame } : {}),
    config
  };
  let operation = await client.models.generateVideos(request);
  throwIfDeadlineExpired(operation);
  if (!cleanString(operation?.name)) {
    const error = new Error("Veo no devolvió nombre de operación.");
    error.code = "veo_operation_missing";
    error.status = 502;
    throw error;
  }
  const pollIntervalMs = Math.max(250, Number(options?.pollIntervalMs || 10000) || 10000);
  const sleep = typeof options?.sleep === "function"
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  while (operation?.done !== true) {
    throwIfDeadlineExpired(operation);
    if (typeof options?.onPoll === "function") options.onPoll(operation);
    throwIfDeadlineExpired(operation);
    await sleep(Math.min(pollIntervalMs, remainingMs()));
    throwIfDeadlineExpired(operation);
    operation = await client.operations.getVideosOperation({
      operation,
      config: {
        httpOptions: {
          timeout: Math.min(60000, Math.max(1, remainingMs()))
        }
      }
    });
    throwIfDeadlineExpired(operation);
  }
  if (operation?.error) {
    const detail = cleanString(operation?.error?.message || operation?.error);
    const error = new Error(detail || "Veo no pudo generar el video.");
    error.code = "veo_generation_failed";
    error.status = 502;
    error.detail = { operationName: cleanString(operation?.name), model };
    throw error;
  }
  const media = extractVeoVideoOutput(operation);
  if (!media) {
    const error = new Error("Veo completó la operación sin devolver video.");
    error.code = "veo_completed_without_video";
    error.status = 502;
    throw error;
  }
  return {
    ...media,
    generator: "veo",
    model,
    variant: "official-sdk",
    interactionId: "",
    operationName: cleanString(operation?.name),
    request,
    durationSeconds: config.durationSeconds,
    resolution: config.resolution,
    highQuality
  };
}

function extractGeminiFileName(uri = "") {
  const match = cleanString(uri).match(/(?:^|\/)files\/([^/:?]+)/i);
  return match ? `files/${match[1]}` : "";
}

async function fetchWithTimeout(fetchFn, url, init = {}, timeoutMs = MEDIA_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || MEDIA_TIMEOUT_MS));
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function materializeGeneratedVideo(options = {}) {
  const media = options?.media || {};
  const maxBytes = Math.max(1, Number(options?.maxBytes || 80 * 1024 * 1024) || 80 * 1024 * 1024);
  if (cleanString(media?.data)) {
    const buffer = Buffer.from(cleanString(media.data), "base64");
    if (!buffer.length || buffer.length > maxBytes) {
      const error = new Error("El video inline está vacío o excede el tamaño permitido.");
      error.code = "generated_video_size_invalid";
      error.status = 413;
      throw error;
    }
    return { buffer, mimeType: cleanString(media?.mimeType || "video/mp4") || "video/mp4" };
  }
  const rawUri = cleanString(media?.uri);
  if (!rawUri) {
    const error = new Error("El proveedor no devolvió URI ni bytes de video.");
    error.code = "generated_video_missing";
    error.status = 502;
    throw error;
  }
  const fetchFn = options?.fetchFn;
  if (typeof fetchFn !== "function") throw new Error("Falta fetchFn para descargar el video generado.");
  const apiKey = cleanString(options?.apiKey);
  const headers = apiKey ? { "x-goog-api-key": apiKey } : {};
  const timeoutMs = Math.max(1000, Number(options?.timeoutMs || MEDIA_TIMEOUT_MS) || MEDIA_TIMEOUT_MS);
  const apiBase = cleanString(options?.apiBase || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const isRelativeGeminiFile = /^files\//i.test(rawUri);
  const isAbsoluteGeminiFile = rawUri.startsWith(`${apiBase}/files/`)
    || /^https:\/\/generativelanguage\.googleapis\.com\/[^?#]*\/files\//i.test(rawUri);
  const fileName = (isRelativeGeminiFile || isAbsoluteGeminiFile) ? extractGeminiFileName(rawUri) : "";
  const uri = fileName
    ? (/:(?:download)(?:[?&#]|$)|[?&]alt=media(?:&|$)/i.test(rawUri)
      ? (/^https?:\/\//i.test(rawUri) ? rawUri : `${apiBase}/${rawUri}`)
      : `${apiBase}/${fileName}:download?alt=media`)
    : rawUri;
  const sleep = typeof options?.sleep === "function"
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const startedAt = Date.now();
  if (fileName) {
    while (Date.now() - startedAt < timeoutMs) {
      const stateResponse = await fetchWithTimeout(fetchFn, `${apiBase}/${fileName}`, { method: "GET", headers }, Math.min(30000, timeoutMs));
      const stateData = await stateResponse.json().catch(() => ({}));
      if (!stateResponse.ok) {
        const error = new Error(cleanString(stateData?.error?.message || `HTTP ${stateResponse.status}`));
        error.code = "generated_video_status_failed";
        error.status = Number(stateResponse.status || 502);
        throw error;
      }
      const state = cleanString(stateData?.state?.name || stateData?.state).toUpperCase();
      if (state === "ACTIVE" || !state) break;
      if (state === "FAILED") {
        const error = new Error("El archivo de video generado pasó a estado FAILED.");
        error.code = "generated_video_file_failed";
        error.status = 502;
        throw error;
      }
      await sleep(Math.min(5000, Math.max(0, timeoutMs - (Date.now() - startedAt))));
    }
  }
  if (Date.now() - startedAt >= timeoutMs) {
    const error = new Error("Tiempo agotado al preparar la descarga del video generado.");
    error.code = "generated_video_download_timeout";
    error.status = 504;
    throw error;
  }
  const response = await fetchWithTimeout(fetchFn, uri, { method: "GET", headers }, Math.max(1000, timeoutMs - (Date.now() - startedAt)));
  if (!response.ok) {
    const error = new Error(`No se pudo descargar el video generado (HTTP ${response.status}).`);
    error.code = "generated_video_download_failed";
    error.status = Number(response.status || 502);
    throw error;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) {
    const error = new Error("El video descargado está vacío o excede el tamaño permitido.");
    error.code = "generated_video_size_invalid";
    error.status = 413;
    throw error;
  }
  return {
    buffer,
    mimeType: cleanString(response.headers?.get?.("content-type") || media?.mimeType || "video/mp4") || "video/mp4"
  };
}

module.exports = {
  OMNI_VIDEO_MODEL,
  DEFAULT_VEO_VIDEO_MODEL,
  VEO_VIDEO_MODELS,
  VIDEO_MODELS,
  PROVIDER_TIMEOUT_MS,
  MEDIA_TIMEOUT_MS,
  normalizeGenerator,
  normalizeQuality,
  normalizeTextPolicy,
  normalizeAspectRatio,
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
  extractGeminiFileName,
  materializeGeneratedVideo
};
