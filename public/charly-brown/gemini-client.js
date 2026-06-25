import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { buildApiUrlPreferRemote } from "../js/api-client.js";

export const GEMINI_MODEL_OPTIONS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-flash-latest",
  "gemini-2.0-flash"
];

export const GEMINI_MODEL_LABELS = {
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3-flash-preview": "Gemini 3 Flash (Preview)",
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro (Preview)",
  "gemini-3-pro-preview": "Gemini 3 Pro (Preview)",
  "gemini-3.1-flash-preview": "Gemini 3.1 Flash (Preview)",
  "gemini-3.1-flash-lite-preview": "Gemini 3.1 Flash Lite (Preview)",
  "gemini-flash-latest": "Gemini Flash Latest",
  "gemini-2.0-flash": "Gemini 2.0 Flash"
};

export async function generateWithGemini({ model = "gemini-2.5-flash", prompt = "", payload = null, signal = null, fallback = true } = {}) {
  const models = fallback ? uniqueModels([model, ...GEMINI_MODEL_OPTIONS]) : [model];
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

  const requestPayload = payload || {
    contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
    generationConfig: { temperature: 0.72, maxOutputTokens: 8192 }
  };

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
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || `Gemini models HTTP ${response.status}`));
  const models = Array.isArray(data?.models) ? data.models : [];
  const dynamic = models
    .map(normalizeGeminiModelInfo)
    .filter((item) => item.id && item.supportsGenerateContent && isTextGenerationModel(item.id));
  return mergeGeminiModels(dynamic);
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
  const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
  return {
    id,
    label: String(model.displayName || GEMINI_MODEL_LABELS[id] || formatGeminiModelLabel(id)),
    inputTokenLimit: Number(model.inputTokenLimit || 0),
    outputTokenLimit: Number(model.outputTokenLimit || 0),
    supportsGenerateContent: methods.includes("generateContent"),
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
  if (value === "gemini-2.5-flash") return 20;
  if (value === "gemini-2.5-pro") return 30;
  if (value.includes("3.5")) return 40;
  if (value.includes("3.1")) return 50;
  if (value.includes("3-")) return 60;
  if (value.includes("2.0")) return 90;
  return 70;
}
