const { GoogleGenAI } = require("@google/genai");
const { PROJECT_ID } = require("./common.js");

const DEFAULT_TEXT_MODEL = "gemini-3.5-flash";
const DEFAULT_LITE_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const DEFAULT_LIVE_MODEL = "gemini-live-2.5-flash-native-audio";
const DEFAULT_VEO_MODEL = "veo-3.1-generate-001";
const DEFAULT_VEO_FAST_MODEL = "veo-3.1-fast-generate-001";

const MODEL_ALIASES = Object.freeze({
  "gemini-2.5-flash": DEFAULT_TEXT_MODEL,
  "gemini-3-flash-preview": DEFAULT_TEXT_MODEL,
  "gemini-2.5-flash-lite": "gemini-3.1-flash-lite",
  "gemini-3.1-flash-image-preview": DEFAULT_IMAGE_MODEL,
  "gemini-2.0-flash-preview-image-generation": "gemini-2.5-flash-image",
  "gemini-2.0-flash-image-generation-preview": "gemini-2.5-flash-image",
  "gemini-2.5-flash-native-audio-preview-12-2025": DEFAULT_LIVE_MODEL,
  "veo-2.0-generate-001": DEFAULT_VEO_MODEL,
  "veo-3.0-generate-001": DEFAULT_VEO_MODEL,
  "veo-3.0-fast-generate-001": DEFAULT_VEO_FAST_MODEL,
  "veo-3.1-generate-preview": DEFAULT_VEO_MODEL,
  "veo-3.1-fast-generate-preview": DEFAULT_VEO_FAST_MODEL,
  "veo-3.1-lite-generate-preview": DEFAULT_VEO_FAST_MODEL
});

function normalizeModel(value = "", fallback = DEFAULT_TEXT_MODEL) {
  const clean = String(value || "")
    .trim()
    .replace(/^models\//i, "")
    .replace(/:(generateContent|streamGenerateContent)$/i, "");
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
  const config = {
    ...(generationConfig && typeof generationConfig === "object" ? generationConfig : {}),
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(Array.isArray(safetySettings) ? { safetySettings } : {}),
    ...(Array.isArray(tools) ? { tools } : {}),
    ...(toolConfig && typeof toolConfig === "object" ? { toolConfig } : {}),
    ...(cachedContent ? { cachedContent } : {})
  };
  return {
    model: normalizeModel(model),
    contents: contents || [],
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
  MODEL_ALIASES,
  normalizeModel,
  createVertexClient,
  buildVertexGenerateRequest
};
