const { GoogleGenAI } = require("@google/genai");
const { PROJECT_ID } = require("./common.js");

const DEFAULT_TEXT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_LITE_MODEL = "gemini-3.5-flash-lite";
const MARCIE_FALLBACK_MODELS = Object.freeze(["gemini-3.8-flash", "gemini-3.5-flash"]);
const ALLOWED_TEXT_MODELS = Object.freeze([
  DEFAULT_TEXT_MODEL,
  ...MARCIE_FALLBACK_MODELS,
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview"
]);
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
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
  "gemini-3.5-flash": "gemini-3.5-flash",
  "gemini-3.6-flash": "gemini-3.8-flash",
  "gemini-3.7-flash": "gemini-3.8-flash",
  "gemini-flash-latest": DEFAULT_TEXT_MODEL,
  "gemini-3-pro-preview": "gemini-3.1-pro-preview",
  "gemini-2.5-flash-lite": DEFAULT_LITE_MODEL,
  "gemini-3.1-flash-image-preview": DEFAULT_IMAGE_MODEL,
  "gemini-3-pro-image-preview": "gemini-3-pro-image",
  "gemini-2.5-flash-image": DEFAULT_IMAGE_MODEL,
  "gemini-2.0-flash-preview-image-generation": "gemini-2.5-flash-image",
  "gemini-2.0-flash-image-generation-preview": "gemini-2.5-flash-image",
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

function normalizeTextModel(value = "", fallback = DEFAULT_TEXT_MODEL) {
  const normalized = normalizeModel(value, fallback);
  return ALLOWED_TEXT_MODELS.includes(normalized) ? normalized : fallback;
}

function createVertexClient({ location = "global", httpOptions = {} } = {}) {
  return require("./research/budget.js").guardClient(new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || PROJECT_ID,
    location,
    // The SDK retries transient errors automatically. Keep the provider retry
    // bounded so the application can switch models without multiplying bursts.
    httpOptions: {
      retryOptions: {
        attempts: 2,
        initialDelay: 1,
        maxDelay: 8,
        expBase: 2,
        jitter: 1
      },
      ...httpOptions
    }
  }));
}

function sanitizeVertexSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeVertexSchema);
  const sanitized = {};
  const unsupportedKeywords = new Set([
    "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
    "pattern", "uniqueItems", "$schema", "additionalProperties"
  ]);
  for (const [key, value] of Object.entries(schema)) {
    if (unsupportedKeywords.has(key)) continue;
    // Gemini exige enums de texto; un enum numérico (type:"integer", enum:[1]) devuelve 400
    // TYPE_STRING. Se descarta el enum en tipos no-string (el type fija el valor) y se
    // normalizan a texto los enums de tipo string.
    if (key === "enum") {
      if (!Array.isArray(value)) continue;
      const stringType = schema.type === undefined || String(schema.type).toLowerCase() === "string";
      if (!stringType) continue;
      sanitized[key] = value.map((entry) => (typeof entry === "string" ? entry : String(entry)));
      continue;
    }
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const sanitizedProps = {};
      for (const [propKey, propVal] of Object.entries(value)) {
        sanitizedProps[propKey] = sanitizeVertexSchema(propVal);
      }
      sanitized[key] = sanitizedProps;
    } else if (key === "items" && value && typeof value === "object") {
      sanitized[key] = sanitizeVertexSchema(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
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
  const rawSchema = generationConfig?.responseSchema
    || generationConfig?.responseJsonSchema
    || source.responseSchema
    || source.responseJsonSchema;
  if (rawSchema) {
    config.responseSchema = sanitizeVertexSchema(rawSchema);
    delete config.responseJsonSchema;
  }
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
    if (config.thinkingConfig && typeof config.thinkingConfig === "object") {
      config.thinkingConfig = { ...config.thinkingConfig };
      delete config.thinkingConfig.thinkingBudget;
      delete config.thinkingConfig.thinking_budget;
      if (!Object.keys(config.thinkingConfig).length) delete config.thinkingConfig;
    }
    delete config.thinkingBudget;
    delete config.thinking_budget;
  }
  return {
    model: normalizedModel,
    contents: normalizedContents,
    ...(Object.keys(config).length ? { config } : {})
  };
}

function isVertexInvalidArgument(error) {
  const details = [
    error?.code,
    error?.status,
    error?.message,
    error?.response?.data,
    error?.cause?.message
  ].filter(Boolean).map((value) => (
    typeof value === "string" ? value : JSON.stringify(value)
  )).join(" ");
  return Number(error?.status || error?.code || error?.response?.status || 0) === 400
    && /INVALID_ARGUMENT|invalid argument/i.test(details);
}

function buildVertexCompatibilityPayload(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const contents = normalizeGeminiContents(source.contents).map((content) => ({
    ...content,
    parts: Array.isArray(content.parts) ? content.parts.map((part) => ({ ...part })) : []
  }));
  const systemText = (Array.isArray(source.systemInstruction?.parts) ? source.systemInstruction.parts : [])
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join("\n");
  if (systemText) {
    const firstUserContent = contents.find((content) => content.role === "user");
    const firstTextPart = firstUserContent?.parts?.find((part) => typeof part?.text === "string");
    if (firstTextPart) firstTextPart.text = `${systemText}\n\n${firstTextPart.text}`;
    else contents.unshift({ role: "user", parts: [{ text: systemText }] });
  }
  return { contents };
}

module.exports = {
  DEFAULT_TEXT_MODEL,
  DEFAULT_LITE_MODEL,
  MARCIE_FALLBACK_MODELS,
  ALLOWED_TEXT_MODELS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VEO_MODEL,
  DEFAULT_VEO_FAST_MODEL,
  AVAILABLE_VEO_MODELS,
  MODEL_ALIASES,
  normalizeModel,
  normalizeTextModel,
  normalizeVeoModel,
  createVertexClient,
  buildVertexGenerateRequest,
  isVertexInvalidArgument,
  buildVertexCompatibilityPayload,
  sanitizeVertexSchema
};
