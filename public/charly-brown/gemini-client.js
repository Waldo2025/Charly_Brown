import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { buildGeminiApiUrl } from "../js/api-client.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GEMINI_FALLBACK_MODELS = Object.freeze(["gemini-3.8-flash", "gemini-3.5-flash"]);
const GEMINI_MODEL_STORAGE_KEY = "marcie_gemini_model";
const GEMINI_MODEL_STORAGE_MIGRATION_KEY = "marcie_gemini_model_migration";
const GEMINI_MODEL_STORAGE_MIGRATION_VERSION = "retired-flash-models-20261006";

export const GEMINI_MODEL_OPTIONS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest"
];

export const GEMINI_MODEL_LABELS = {
  "gemini-3.8-flash": "Gemini 3.8 Flash",
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
    const stored = String(localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) || "").trim();
    const migration = String(localStorage.getItem(GEMINI_MODEL_STORAGE_MIGRATION_KEY) || "").trim();
    if (["gemini-3.6-flash", "gemini-3.7-flash"].includes(stored)) {
      localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, "gemini-3.8-flash");
      localStorage.setItem(GEMINI_MODEL_STORAGE_MIGRATION_KEY, GEMINI_MODEL_STORAGE_MIGRATION_VERSION);
      return "gemini-3.8-flash";
    }
    return stored || DEFAULT_GEMINI_MODEL;
  } catch (_) {
    return DEFAULT_GEMINI_MODEL;
  }
}

export function setConfiguredGeminiModel(model = "") {
  const value = normalizeModelId(model) || DEFAULT_GEMINI_MODEL;
  try {
    localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, value);
    localStorage.setItem(GEMINI_MODEL_STORAGE_MIGRATION_KEY, GEMINI_MODEL_STORAGE_MIGRATION_VERSION);
  } catch (_) {}
  return value;
}

function retryAfterSeconds(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, numeric);
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? Math.max(0, Math.ceil((timestamp - Date.now()) / 1000)) : 0;
}

export async function generateWithGemini({ model = "", prompt = "", payload = null, signal = null, fallback = true, fallbackModels = null, thinkingLevel = "HIGH" } = {}) {
  const selectedModel = String(model || getConfiguredGeminiModel()).trim() || DEFAULT_GEMINI_MODEL;
  const models = fallback ? uniqueModels([selectedModel, ...(Array.isArray(fallbackModels) ? fallbackModels : DEFAULT_GEMINI_FALLBACK_MODELS)]) : [selectedModel];
  let lastError = null;
  for (const candidate of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await requestGemini({ model: candidate, prompt, payload, signal, thinkingLevel });
      } catch (error) {
        lastError = error;
        if (!isRetryableModelError(error) || attempt === 2) break;
        const is429 = Number(error?.status || error?.code) === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(String(error?.message || ""));
        const retryAfterMs = Number(error.retryAfterSeconds || 0) * 1000;
        if (is429 && retryAfterMs > 60000) break;
        const baseWaitMs = is429 ? 4000 * (2 ** attempt) : 1000 * (2 ** attempt);
        const waitMs = Math.max(retryAfterMs, baseWaitMs) + Math.random() * 500;
        console.warn("[Gemini] Reintentando solicitud transitoria", { model: candidate, status: error.status || error.code, attempt: attempt + 1, waitMs: Math.round(waitMs) });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, waitMs);
          signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason || new DOMException("Cancelado", "AbortError")); }, { once: true });
        });
      }
    }
    if (!isRetryableModelError(lastError)) break;
  }
  throw lastError || new Error("Gemini no respondió.");
}

export async function sendCharlyChat({ sessionId = "", targetUnitId = "", text = "", model = "", requestedTools = [], requestId = "", editorialConfig = {}, attachments = [], signal = null } = {}) {
  const url = buildGeminiApiUrl("/api/charly-brown/chat");
  if (!url) throw new Error("Backend de Charly Brown no configurado.");
  const user = (typeof window !== "undefined" && window.__CHARLY_TEST_USER__) || getAuth().currentUser;
  if (!user) throw new Error("Inicia sesión para usar el chat.");
  const token = typeof user.getIdToken === "function" ? await user.getIdToken() : (user.token || "test_token_123");
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ sessionId, targetUnitId, text, model, requestedTools, requestId, editorialConfig, attachments })
    });
  } catch (netErr) {
    // Si la conexión fue rechazada por reinicio breve del backend, esperar y reintentar
    await new Promise((r) => setTimeout(r, 1500));
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ sessionId, targetUnitId, text, model, requestedTools, requestId, editorialConfig, attachments })
    });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(data?.message || data?.error?.message || data?.error || `Charly Brown HTTP ${response.status}`));
    error.status = response.status;
    error.code = String(data?.error || "CHARLY_CHAT_FAILED");
    error.retryAfterSeconds = retryAfterSeconds(data?.retryAfterSeconds || response.headers.get("Retry-After"));
    throw error;
  }
  return data;
}

export async function deleteCharlyAttachment({ sessionId = "", targetUnitId = "", storagePath = "" } = {}) {
  const url = buildGeminiApiUrl("/api/charly-brown/attachments/delete");
  const user = (typeof window !== "undefined" && window.__CHARLY_TEST_USER__) || getAuth().currentUser;
  if (!url || !user) throw new Error("Inicia sesión para eliminar el archivo.");
  const token = typeof user.getIdToken === "function" ? await user.getIdToken() : (user.token || "test_token_123");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, targetUnitId, storagePath })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.message || data.error || "No se pudo eliminar el archivo."));
  return data;
}

export async function improveCharlySya({ sessionId = "", targetUnitId = "", category = "", subtopic = "", fields = {} } = {}) {
  const url = buildGeminiApiUrl("/api/charly-brown/sya/improve");
  if (!url) throw new Error("Backend de Charly Brown no configurado.");
  const user = (typeof window !== "undefined" && window.__CHARLY_TEST_USER__) || getAuth().currentUser;
  if (!user) throw new Error("Inicia sesión para mejorar la secuencia y alcance.");
  const token = typeof user.getIdToken === "function" ? await user.getIdToken() : (user.token || "test_token_123");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, targetUnitId, category, subtopic, fields })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.message || data?.error || "No se pudo mejorar la secuencia y alcance."));
  return data;
}

export async function controlCharlyChat(requestId, action = "status") {
  const url = buildGeminiApiUrl(`/api/charly-brown/chat/${encodeURIComponent(requestId)}${action === "stop" ? "/stop" : ""}`);
  const user = (typeof window !== "undefined" && window.__CHARLY_TEST_USER__) || getAuth().currentUser;
  if (!url || !user) throw new Error("No se pudo acceder a la generación del chat.");
  const token = typeof user.getIdToken === "function" ? await user.getIdToken() : (user.token || "test_token_123");
  const requestUrl = action === "stop" ? url : `${url}${url.includes("?") ? "&" : "?"}_status=${Date.now()}`;
  let response;
  try {
    response = await fetch(requestUrl, {
      method: action === "stop" ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (netErr) {
    await new Promise((r) => setTimeout(r, 1200));
    response = await fetch(requestUrl, {
      method: action === "stop" ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => null);
  }
  if (!response) {
    return { status: "running", progress: "Reconectando con el servidor…" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "No se pudo consultar la generación.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function requestGemini({ model = DEFAULT_GEMINI_MODEL, prompt = "", payload = null, signal = null, thinkingLevel = "HIGH" } = {}) {
  const url = buildGeminiApiUrl("/api/gemini/generate");
  if (!url) throw new Error("Backend Gemini no configurado.");

  const auth = getAuth();
  const user = auth.currentUser;
  const headers = { "Content-Type": "application/json" };
  if (user?.getIdToken) headers.Authorization = `Bearer ${await user.getIdToken()}`;

  const requestPayload = prepareGeminiPayloadForModel(model, payload || {
    contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
    generationConfig: { temperature: 0.72, maxOutputTokens: 32768 }
  }, thinkingLevel);

  const startedAt = performance.now();
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
    error.code = String(data?.error?.code || data?.code || data?.error || "");
    error.requestId = String(data?.requestId || "");
    error.retryAfterSeconds = retryAfterSeconds(data?.retryAfterSeconds || response.headers.get("Retry-After"));
    throw error;
  }
  console.info("[Gemini] generation", {
    model, durationMs: Math.round(performance.now() - startedAt),
    finishReason: data?.candidates?.[0]?.finishReason || "unknown",
    promptTokens: data?.usageMetadata?.promptTokenCount || 0,
    outputTokens: data?.usageMetadata?.candidatesTokenCount || 0,
    thoughtTokens: data?.usageMetadata?.thoughtsTokenCount || 0
  });
  const finishReason = String(data?.candidates?.[0]?.finishReason || "").toUpperCase();
  if (finishReason && finishReason !== "STOP") {
    const error = new Error(`Gemini finalizó la respuesta antes de completarla (${finishReason}).`);
    error.code = "gemini_incomplete_response";
    error.finishReason = finishReason;
    throw error;
  }
  return extractGeminiText(data);
}

export function extractGeminiText(data = {}) {
  return String(data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("") || "").trim();
}

export async function listGeminiModels({ signal = null } = {}) {
  const url = buildGeminiApiUrl("/api/charly-brown/models");
  if (!url) return getStaticGeminiTextModels();
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    const headers = { "Content-Type": "application/json" };
    if (user?.getIdToken) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    let response = await fetch(url, {
      method: "GET",
      headers,
      ...(signal ? { signal } : {})
    }).catch(() => null);

    if (!response) {
      await new Promise((r) => setTimeout(r, 1200));
      response = await fetch(url, {
        method: "GET",
        headers,
        ...(signal ? { signal } : {})
      }).catch(() => null);
    }

    if (!response || !response.ok) return getStaticGeminiTextModels();
    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data?.models) ? data.models : [];
    const dynamic = models
      .map(normalizeGeminiModelInfo)
      .filter((item) => item.id && item.supportsGenerateContent && isTextGenerationModel(item.id));
    return dynamic.length
      ? dynamic.sort((a, b) => modelSortRank(a.id) - modelSortRank(b.id) || a.label.localeCompare(b.label, "es"))
      : getStaticGeminiTextModels();
  } catch (_) {
    return getStaticGeminiTextModels();
  }
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
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status || 0);
  return status === 429 || code === "429" || code === "resource_exhausted" ||
    (error?.status === 500 && (code === "internal" || /internal error|temporar|try again/.test(message))) ||
    status === 503 ||
    /resource_exhausted|high demand|overloaded|temporar|try again|unavailable|quota|rate.?limit/.test(message);
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
  const normalized = String(name || "")
    .trim()
    .replace(/^.*\/models\//i, "")
    .replace(/^models\//i, "")
    .replace(/:(generateContent|streamGenerateContent)$/i, "");
  return ["gemini-3.6-flash", "gemini-3.7-flash"].includes(normalized) ? "gemini-3.8-flash" : normalized;
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
  if (value === "gemini-3.8-flash") return 5;
  if (value === "gemini-2.5-flash-lite") return 10;
  if (value === "gemini-3.5-flash-lite") return 20;
  if (value === "gemini-3.1-flash-lite") return 30;
  if (value === "gemini-3.5-flash") return 60;
  if (value.includes("3.1-pro")) return 70;
  if (value.includes("3-flash")) return 80;
  if (value === "gemini-2.5-flash") return 90;
  if (value === "gemini-2.5-pro") return 100;
  return 110;
}

function prepareGeminiPayloadForModel(model = "", payload = {}, thinkingLevel = "HIGH") {
  const id = normalizeModelId(model).toLowerCase();
  const rejectsSamplingParameters = id === "gemini-3.5-flash-lite"
    || /^gemini-3\.[6-9](?:-|$)/.test(id)
    || /^gemini-[4-9](?:\.|-|$)/.test(id);
  if (!rejectsSamplingParameters || !payload?.generationConfig) return payload;
  const prepared = {
    ...payload,
    generationConfig: {
      ...payload.generationConfig,
      thinkingConfig: payload.generationConfig.thinkingConfig || { thinkingLevel }
    }
  };
  delete prepared.generationConfig.temperature;
  delete prepared.generationConfig.topP;
  delete prepared.generationConfig.topK;
  delete prepared.generationConfig.top_p;
  delete prepared.generationConfig.top_k;
  delete prepared.generationConfig.thinkingBudget;
  delete prepared.generationConfig.thinking_budget;
  if (prepared.generationConfig.thinkingConfig && typeof prepared.generationConfig.thinkingConfig === "object") {
    prepared.generationConfig.thinkingConfig = { ...prepared.generationConfig.thinkingConfig };
    delete prepared.generationConfig.thinkingConfig.thinkingBudget;
    delete prepared.generationConfig.thinkingConfig.thinking_budget;
    if (!Object.keys(prepared.generationConfig.thinkingConfig).length) delete prepared.generationConfig.thinkingConfig;
  }
  return prepared;
}
