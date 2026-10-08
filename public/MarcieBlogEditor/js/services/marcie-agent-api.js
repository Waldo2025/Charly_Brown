import { buildMarcieApiUrl } from "/js/api-client.js";
import { getCurrentUser } from "./marcie-firebase.js";

function makeRequestId() {
  return globalThis.crypto?.randomUUID?.() || `marcie-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function summarizePayload(payload = {}) {
  const input = payload.input || {};
  const value = String(input.value || "");
  return {
    hasRunId: Boolean(payload.runId),
    mode: payload.mode || "",
    action: input.action || "",
    selectedOptionId: /^(educators|students|parents|coordinators)-(hook|antihook)-\d+$/.test(value) ? value : "",
    selectedCount: Array.isArray(input.selectedValues) ? input.selectedValues.length : 0,
    textLength: String(input.text || "").length
  };
}

async function postAgent(path, payload = {}) {
  const user = getCurrentUser();
  if (!user) throw new Error("Inicia sesión para usar el agente editorial.");
  const token = await user.getIdToken();
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const endpoint = buildMarcieApiUrl(path);
  console.info("[MarcieAgentAPI] request start", { method: "POST", path, requestId, payload: summarizePayload(payload) });
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    });
  } catch (cause) {
    const error = new Error(cause?.message || "No se recibió respuesta del servidor.");
    error.cause = cause;
    error.requestId = requestId;
    error.endpoint = path;
    error.networkError = true;
    console.warn("[MarcieAgentAPI] request transport failure", {
      method: "POST",
      path,
      requestId,
      durationMs: Date.now() - startedAt,
      message: error.message,
      payload: summarizePayload(payload)
    });
    throw error;
  }
  console.info("[MarcieAgentAPI] response received", {
    method: "POST",
    path,
    requestId,
    status: response.status,
    durationMs: Date.now() - startedAt
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || result.error || `Error del agente (${response.status})`);
    error.status = response.status;
    error.detail = result;
    error.requestId = result.requestId || requestId;
    throw error;
  }
  return result;
}

async function getAgent(path) {
  const user = getCurrentUser();
  if (!user) throw new Error("Inicia sesión para usar el agente editorial.");
  const token = await user.getIdToken();
  const response = await fetch(buildMarcieApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || result.error || `Error del agente (${response.status})`);
    error.status = response.status;
    error.detail = result;
    throw error;
  }
  return result;
}

export function startAgentConversation() {
  return postAgent("/api/marcie/agent/chat", { input: {} });
}

export function sendAgentTurn(runId, input, { mode = "configuration", sessionId = "" } = {}) {
  return postAgent("/api/marcie/agent/chat", { runId, input, mode, sessionId });
}

export function getAgentHistory(sessionId) {
  return getAgent(`/api/marcie/agent/history?sessionId=${encodeURIComponent(sessionId)}`);
}

export function analyzeYoutubeVideos(urls, objective = "") {
  return postAgent("/api/marcie/videos/analyze", { urls, objective });
}

export function getYoutubeVideoMetadata(urls) {
  return postAgent("/api/marcie/videos/metadata", { urls });
}

export function startAgentRun(runId) {
  return postAgent("/api/marcie/agent/run", { runId, event: "started" });
}

export function updateAgentRun(runId, event, { sessionId = "", error = "" } = {}) {
  return postAgent("/api/marcie/agent/run", { runId, event, sessionId, error });
}
