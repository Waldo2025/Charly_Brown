const { GoogleGenAI } = require("@google/genai");
const { PROJECT_ID } = require("./common.js");

const DEFAULT_TEXT_MODEL = "gemini-3.6-flash";
const DEFAULT_LITE_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const DEFAULT_LIVE_MODEL = "gemini-live-2.5-flash-native-audio";
const DEFAULT_VEO_MODEL = "veo-3.1-generate-001";
const DEFAULT_VEO_FAST_MODEL = "veo-3.1-fast-generate-001";
const AVAILABLE_VEO_MODELS = Object.freeze([
  DEFAULT_VEO_MODEL,
  DEFAULT_VEO_FAST_MODEL,
  "veo-3.1-lite-generate-001",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
  "veo-2.0-generate-001"
]);

const MODEL_ALIASES = Object.freeze({
  "gemini-2.5-flash": DEFAULT_TEXT_MODEL,
  "gemini-3-flash-preview": DEFAULT_TEXT_MODEL,
  "gemini-flash-latest": DEFAULT_TEXT_MODEL,
  "gemini-3-pro-preview": "gemini-3.1-pro-preview",
  "gemini-2.5-flash-lite": DEFAULT_LITE_MODEL,
  "gemini-3.1-flash-image-preview": DEFAULT_IMAGE_MODEL,
  "gemini-3-pro-image-preview": "gemini-3-pro-image",
  "gemini-2.5-flash-image": DEFAULT_IMAGE_MODEL,
  "gemini-2.0-flash-preview-image-generation": "gemini-2.5-flash-image",
  "gemini-2.0-flash-image-generation-preview": "gemini-2.5-flash-image",
  "gemini-2.5-flash-native-audio-preview-12-2025": DEFAULT_LIVE_MODEL,
  "veo-2.0-generate-001": DEFAULT_VEO_MODEL,
  "veo-3.0-generate-001": DEFAULT_VEO_MODEL,
  "veo-3.0-fast-generate-001": DEFAULT_VEO_FAST_MODEL,
  "veo-3.1-generate-preview": DEFAULT_VEO_MODEL,
  "veo-3.1-fast-generate-preview": DEFAULT_VEO_FAST_MODEL,
  "veo-3.1-lite-generate-preview": "veo-3.1-lite-generate-001"
});

function normalizeVeoModel(value = "", fallback = DEFAULT_VEO_MODEL) {
  const clean = String(value || "").trim().replace(/^.*\/models\//i, "");
  if (AVAILABLE_VEO_MODELS.includes(clean)) return clean;
  const normalized = MODEL_ALIASES[clean] || clean;
  if (AVAILABLE_VEO_MODELS.includes(normalized)) return normalized;
  if (/^veo-\d+(?:\.\d+)+(?:-(?:fast|lite))?-generate-(?:\d{3}|preview)$/i.test(normalized)) return normalized;
  return fallback;
}

function normalizeGeminiContentRole(value = "") {
  const role = String(value || "").trim().toLowerCase();
  if (!role) return "user";
  if (role === "user" || role === "model") return role;
  if (role === "assistant") return "model";
  if (role === "system") return "user";
  return "user";
}

function normalizeGeminiContents(contents = []) {
  if (!Array.isArray(contents)) return [];
  return contents
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const cleanItem = { ...item };
      cleanItem.role = normalizeGeminiContentRole(cleanItem.role);
      return cleanItem;
    })
    .filter(Boolean);
}

function normalizeModel(value = "", fallback = DEFAULT_TEXT_MODEL) {
  const clean = String(value || "")
    .trim()
    .replace(/^(?:.*\/)?models\//i, "")
    .replace(/:(generateContent|streamGenerateContent)$/i, "");
  if (!clean || clean.toLowerCase() === "auto") return fallback;
  return MODEL_ALIASES[clean] || clean || fallback;
}

function createVertexClient({ location = "global" } = {}) {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || PROJECT_ID,
    location
  });
}

function buildVertexGenerateRequest({ model, payload = {} } = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const {
    contents,
    systemInstruction,
    generationConfig,
    safetySettings,
    tools,
    toolConfig,
    cachedContent
  } = source;
  const normalizedModel = normalizeModel(model);
  const normalizedContents = normalizeGeminiContents(contents);
  const config = {
    ...(generationConfig && typeof generationConfig === "object" ? generationConfig : {}),
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(Array.isArray(safetySettings) ? { safetySettings } : {}),
    ...(Array.isArray(tools) ? { tools } : {}),
    ...(toolConfig && typeof toolConfig === "object" ? { toolConfig } : {}),
    ...(cachedContent ? { cachedContent } : {})
  };
  if (normalizedModel === "gemini-3.5-flash-lite"
    || /^gemini-3\.[6-9](?:-|$)/.test(normalizedModel)
    || /^gemini-[4-9](?:\.|-|$)/.test(normalizedModel)) {
    delete config.temperature;
    delete config.topP;
    delete config.topK;
    delete config.top_p;
    delete config.top_k;
    delete config.candidateCount;
    delete config.candidate_count;
  }
  return {
    model: normalizedModel,
    contents: normalizedContents,
    ...(Object.keys(config).length ? { config } : {})
  };
}

module.exports = {
  DEFAULT_TEXT_MODEL,
  DEFAULT_LITE_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_LIVE_MODEL,
  DEFAULT_VEO_MODEL,
  DEFAULT_VEO_FAST_MODEL,
  AVAILABLE_VEO_MODELS,
  MODEL_ALIASES,
  normalizeModel,
  normalizeVeoModel,
  createVertexClient,
  buildVertexGenerateRequest
};
