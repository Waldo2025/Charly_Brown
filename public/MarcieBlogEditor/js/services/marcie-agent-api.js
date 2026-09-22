import { buildMarcieApiUrl } from "/js/api-client.js";
import { getCurrentUser } from "./marcie-firebase.js";

async function postAgent(path, payload = {}) {
  const user = getCurrentUser();
  if (!user) throw new Error("Inicia sesión para usar el agente editorial.");
  const token = await user.getIdToken();
  const response = await fetch(buildMarcieApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
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

export function sendAgentTurn(runId, input) {
  return postAgent("/api/marcie/agent/chat", { runId, input });
}

export function analyzeYoutubeVideos(urls, objective = "") {
  return postAgent("/api/marcie/videos/analyze", { urls, objective });
}

export function startAgentRun(runId) {
  return postAgent("/api/marcie/agent/run", { runId, event: "started" });
}

export function updateAgentRun(runId, event, { sessionId = "", error = "" } = {}) {
  return postAgent("/api/marcie/agent/run", { runId, event, sessionId, error });
}
