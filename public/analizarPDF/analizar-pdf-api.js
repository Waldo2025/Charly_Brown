import { authFetchJson, buildApiUrl, getAuthHeaders, hasAvailableApiBase } from "../js/api-client.js";

export async function listAnalizarPdfSessions() {
  return authFetchJson("/api/analizar-pdf/sessions/list", { method: "GET" });
}

export async function saveAnalizarPdfSession(session) {
  return authFetchJson("/api/analizar-pdf/sessions/save", {
    method: "POST",
    body: { session }
  });
}

export async function deleteAnalizarPdfSession(sessionId = "") {
  return authFetchJson("/api/analizar-pdf/sessions/delete", {
    method: "POST",
    body: { sessionId }
  });
}

export async function queueAnalizarPdfUpload(sessionId = "", file = null, sourceType = "pdf") {
  const cleanSessionId = String(sessionId || "").trim();
  const normalizedSourceType = String(sourceType || "").trim() === "idml" ? "idml" : "pdf";
  const expectedExt = normalizedSourceType === "idml" ? ".idml" : ".pdf";
  if (!cleanSessionId) throw new Error("Falta sessionId.");
  if (!(file instanceof File)) throw new Error(`Selecciona un archivo ${expectedExt}.`);
  if (!String(file.name || "").toLowerCase().endsWith(expectedExt)) {
    throw new Error(`El archivo debe ser ${expectedExt}.`);
  }
  if (!hasAvailableApiBase()) throw new Error("API_UNAVAILABLE");
  const headers = await getAuthHeaders({
    "Content-Type": file.type || "application/octet-stream",
    "X-Session-Id": cleanSessionId,
    "X-File-Name": file.name || `documento${expectedExt}`
  });
  const response = await fetch(buildApiUrl("/api/analizar-pdf/analyze"), {
    method: "POST",
    headers,
    body: file
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || `HTTP ${response.status}`));
  }
  return data;
}

export async function getAnalizarPdfAnalysisStatus(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) throw new Error("Falta jobId.");
  return authFetchJson(`/api/analizar-pdf/analyze-status?jobId=${encodeURIComponent(cleanJobId)}`, {
    method: "GET"
  });
}
