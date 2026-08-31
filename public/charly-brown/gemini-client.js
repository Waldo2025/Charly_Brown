import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { buildApiUrlPreferRemote } from "../js/api-client.js";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_MODEL_STORAGE_KEY = "marcie_gemini_model";

export const GEMINI_MODEL_OPTIONS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest"
];

export const GEMINI_MODEL_LABELS = {
  "gemini-3.7-flash": "Gemini 3.7 Flash",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3-flash-preview": "Gemini 3 Flash (Preview)",
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro (Preview)",
  "gemini-flash-latest": "Gemini Flash Latest"
};

export function getConfiguredGeminiModel() {
  try {
    return String(localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  } catch (_) {
    return DEFAULT_GEMINI_MODEL;
  }
}

export function setConfiguredGeminiModel(model = "") {
  const value = normalizeModelId(model) || DEFAULT_GEMINI_MODEL;
  try {
    localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, value);
  } catch (_) {}
  return value;
}

export async function generateWithGemini({ model = "", prompt = "", payload = null, signal = null, fallback = true } = {}) {
  const selectedModel = String(model || getConfiguredGeminiModel()).trim() || DEFAULT_GEMINI_MODEL;
  const models = fallback ? uniqueModels([selectedModel, ...GEMINI_MODEL_OPTIONS]) : [selectedModel];
  let lastError = null;
  for (const candidate of models) {
    try {
      return await requestGemini({ model: candidate, prompt, payload, signal });
    } catch (error) {
      lastError = error;
      if (!isRetryableModelError(error)) break;
    }
  }
  throw lastError || new Error("Gemini no respondió.");
}

async function requestGemini({ model = "gemini-2.5-flash", prompt = "", payload = null, signal = null } = {}) {
  const url = buildApiUrlPreferRemote("/api/gemini/generate");
  if (!url) throw new Error("Backend Gemini no configurado.");

  const auth = getAuth();
  const user = auth.currentUser;
  const headers = { "Content-Type": "application/json" };
  if (user?.getIdToken) headers.Authorization = `Bearer ${await user.getIdToken()}`;

  const requestPayload = prepareGeminiPayloadForModel(model, payload || {
    contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
    generationConfig: { temperature: 0.72, maxOutputTokens: 8192 }
  });

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, payload: requestPayload }),
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(data?.error?.message || data?.error || `Gemini HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return extractGeminiText(data);
}

export function extractGeminiText(data = {}) {
  return String(data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("") || "").trim();
}

export async function listGeminiModels({ signal = null } = {}) {
  const url = buildApiUrlPreferRemote("/api/gemini/models");
  if (!url) return getStaticGeminiTextModels();
  const auth = getAuth();
  const user = auth.currentUser;
  const headers = { "Content-Type": "application/json" };
  if (user?.getIdToken) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const response = await fetch(url, {
    method: "GET",
    headers,
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || `Gemini models HTTP ${response.status}`));
  const models = Array.isArray(data?.models) ? data.models : [];
  const dynamic = models
    .map(normalizeGeminiModelInfo)
    .filter((item) => item.id && item.supportsGenerateContent && isTextGenerationModel(item.id));
  return dynamic.length
    ? dynamic.sort((a, b) => modelSortRank(a.id) - modelSortRank(b.id) || a.label.localeCompare(b.label, "es"))
    : getStaticGeminiTextModels();
}

export function getStaticGeminiTextModels() {
  return GEMINI_MODEL_OPTIONS.map((id) => ({
    id,
    label: GEMINI_MODEL_LABELS[id] || formatGeminiModelLabel(id),
    inputTokenLimit: 0,
    outputTokenLimit: 0,
    source: "static"
  }));
}

function isRetryableModelError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 429 ||
    error?.status === 503 ||
    /high demand|overloaded|temporar|try again|unavailable|quota/.test(message);
}

function uniqueModels(models = []) {
  return [...new Set(models.filter(Boolean))];
}

function normalizeGeminiModelInfo(model = {}) {
  const id = normalizeModelId(model.name || model.model || "");
  const methods = [
    ...(Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : []),
    ...(Array.isArray(model.supportedActions) ? model.supportedActions : [])
  ].map((method) => String(method || "").toLowerCase());
  return {
    id,
    label: String(model.displayName || GEMINI_MODEL_LABELS[id] || formatGeminiModelLabel(id)),
    inputTokenLimit: Number(model.inputTokenLimit || 0),
    outputTokenLimit: Number(model.outputTokenLimit || 0),
    supportsGenerateContent: methods.length
      ? methods.some((method) => method === "generatecontent" || method.endsWith(":generatecontent"))
      : isTextGenerationModel(id),
    source: "backend"
  };
}

function mergeGeminiModels(dynamic = []) {
  const merged = new Map();
  for (const item of getStaticGeminiTextModels()) merged.set(item.id, item);
  for (const item of dynamic) merged.set(item.id, item);
  return [...merged.values()].sort((a, b) => modelSortRank(a.id) - modelSortRank(b.id) || a.label.localeCompare(b.label, "es"));
}

function normalizeModelId(name = "") {
  return String(name || "")
    .trim()
    .replace(/^.*\/models\//i, "")
    .replace(/^models\//i, "")
    .replace(/:(generateContent|streamGenerateContent)$/i, "");
}

function isTextGenerationModel(id = "") {
  const value = String(id || "").toLowerCase();
  if (!value) return false;
  if (value.includes("image")) return false;
  if (value.includes("tts")) return false;
  if (value.includes("audio")) return false;
  if (value.includes("veo")) return false;
  if (value.includes("imagen")) return false;
  if (value.includes("embedding")) return false;
  if (value.includes("aqa")) return false;
  if (value.includes("robotics")) return false;
  if (value.includes("computer-use")) return false;
  if (value.includes("deep-research")) return false;
  return value.startsWith("gemini-") || value.includes("learnlm");
}

function formatGeminiModelLabel(id = "") {
  return String(id || "")
    .replace(/^gemini-/i, "Gemini ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function modelSortRank(id = "") {
  const value = String(id || "").toLowerCase();
  if (value === "gemini-2.5-flash-lite") return 10;
  if (value === "gemini-3.5-flash-lite") return 20;
  if (value === "gemini-3.1-flash-lite") return 30;
  if (value === "gemini-3.7-flash") return 40;
  if (value === "gemini-3.6-flash") return 50;
  if (value === "gemini-3.5-flash") return 60;
  if (value.includes("3.1-pro")) return 70;
  if (value.includes("3-flash")) return 80;
  if (value === "gemini-2.5-flash") return 90;
  if (value === "gemini-2.5-pro") return 100;
  return 110;
}

function prepareGeminiPayloadForModel(model = "", payload = {}) {
  const id = normalizeModelId(model).toLowerCase();
  const rejectsSamplingParameters = id === "gemini-3.5-flash-lite"
    || /^gemini-3\.[6-9](?:-|$)/.test(id)
    || /^gemini-[4-9](?:\.|-|$)/.test(id);
  if (!rejectsSamplingParameters || !payload?.generationConfig) return payload;
  const prepared = {
    ...payload,
    generationConfig: { ...payload.generationConfig }
  };
  delete prepared.generationConfig.temperature;
  delete prepared.generationConfig.topP;
  delete prepared.generationConfig.topK;
  delete prepared.generationConfig.top_p;
  delete prepared.generationConfig.top_k;
  return prepared;
}
