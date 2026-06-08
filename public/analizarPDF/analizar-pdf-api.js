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

export async function listAnalizarPdfStyleMappings() {
  return authFetchJson("/api/analizar-pdf/style-mappings/list", { method: "GET" });
}

export async function saveAnalizarPdfStyleMapping(mapping) {
  return authFetchJson("/api/analizar-pdf/style-mappings/save", {
    method: "POST",
    body: { mapping }
  });
}

export async function deleteAnalizarPdfStyleMapping(mappingId = "") {
  return authFetchJson("/api/analizar-pdf/style-mappings/delete", {
    method: "POST",
    body: { mappingId }
  });
}

export async function activateAnalizarPdfStyleMapping(mappingId = "") {
  return authFetchJson("/api/analizar-pdf/style-mappings/activate", {
    method: "POST",
    body: { mappingId }
  });
}

export async function deleteAnalizarPdfSession(sessionId = "") {
  return authFetchJson("/api/analizar-pdf/sessions/delete", {
    method: "POST",
    body: { sessionId }
  });
}

export async function queueAnalizarPdfUpload(sessionId = "", file = null, sourceType = "pdf", fileContext = null) {
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
    "X-File-Name": file.name || `documento${expectedExt}`,
    ...(String(fileContext?.revisionId || "").trim() ? { "X-Revision-Id": String(fileContext.revisionId).trim() } : {}),
    ...(String(fileContext?.fileId || "").trim() ? { "X-File-Id": String(fileContext.fileId).trim() } : {}),
    ...(String(fileContext?.mappingId || "").trim() ? { "X-Mapping-Id": String(fileContext.mappingId).trim() } : {}),
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

export async function exportAnalizarPdfCorrectedIdml(sessionId = "", revisionId = "", fileId = "", correctionSelection = null, cleanupOptions = null) {
  const cleanSessionId = String(sessionId || "").trim();
  const cleanRevisionId = String(revisionId || "").trim();
  const cleanFileId = String(fileId || "").trim();
  if (!cleanSessionId || !cleanRevisionId || !cleanFileId) {
    throw new Error("Faltan sessionId, revisionId o fileId.");
  }
  const headers = await getAuthHeaders({
    "Content-Type": "application/json"
  });
  const response = await fetch(buildApiUrl("/api/analizar-pdf/export-corrected-idml"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      sessionId: cleanSessionId,
      revisionId: cleanRevisionId,
      fileId: cleanFileId,
      correctionSelection: correctionSelection && typeof correctionSelection === "object"
        ? correctionSelection
        : null,
      cleanupOptions: cleanupOptions && typeof cleanupOptions === "object"
        ? cleanupOptions
        : null
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || `HTTP ${response.status}`));
  }
  const downloadPath = String(data?.downloadUrl || "").trim();
  if (!downloadPath) {
    return data;
  }
  const downloadHeaders = await getAuthHeaders({});
  const downloadResponse = await fetch(buildApiUrl(downloadPath), {
    method: "GET",
    headers: downloadHeaders
  });
  if (!downloadResponse.ok) {
    throw new Error(`No se pudo descargar el IDML corregido (HTTP ${downloadResponse.status}).`);
  }
  const blob = await downloadResponse.blob();
  const objectUrl = URL.createObjectURL(blob);
  return {
    ...data,
    objectUrl,
    fileName: String(data?.exportResult?.fileName || data?.fileName || "corrected.idml")
  };
}
