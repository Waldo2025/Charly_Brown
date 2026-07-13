import { authFetch, authFetchJson, buildApiUrl, hasAvailableApiBase } from "../js/api-client.js";

const LOCAL_ANALYSIS_CONTEXT_HEADER_MAX_LENGTH = 6000;

function encodeAnalizarPdfHeaderJson(value = null) {
  if (!value || typeof value !== "object") return "";
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function buildLocalAnalysisContextHeader(fileContext = null) {
  const encoded = encodeAnalizarPdfHeaderJson(fileContext?.localAnalysisContext || null);
  if (encoded && encoded.length > LOCAL_ANALYSIS_CONTEXT_HEADER_MAX_LENGTH) {
    console.warn("[analizar-pdf] contexto local omitido: excede el límite seguro de header", {
      encodedLength: encoded.length,
      maxLength: LOCAL_ANALYSIS_CONTEXT_HEADER_MAX_LENGTH,
    });
    return {};
  }
  return encoded ? { "X-Local-Analysis-Context": encoded } : {};
}

export async function listAnalizarPdfSessions() {
  return authFetchJson("/api/analizar-pdf/sessions/list", { method: "GET", preferRemote: false });
}

export async function saveAnalizarPdfSession(session, analysisResults = []) {
  return authFetchJson("/api/analizar-pdf/sessions/save", {
    method: "POST",
    body: { session, analysisResults: Array.isArray(analysisResults) ? analysisResults : [] },
    preferRemote: false
  });
}

export async function listAnalizarPdfStyleMappings() {
  return authFetchJson("/api/analizar-pdf/style-mappings/list", { method: "GET", preferRemote: false });
}

export async function saveAnalizarPdfStyleMapping(mapping) {
  return authFetchJson("/api/analizar-pdf/style-mappings/save", {
    method: "POST",
    body: { mapping },
    preferRemote: false
  });
}

export async function deleteAnalizarPdfStyleMapping(mappingId = "") {
  return authFetchJson("/api/analizar-pdf/style-mappings/delete", {
    method: "POST",
    body: { mappingId },
    preferRemote: false
  });
}

export async function activateAnalizarPdfStyleMapping(mappingId = "") {
  return authFetchJson("/api/analizar-pdf/style-mappings/activate", {
    method: "POST",
    body: { mappingId },
    preferRemote: false
  });
}

async function postAnalizarPdfIdmlTool(endpoint = "", sessionId = "", revisionId = "", fileId = "", options = {}) {
  const cleanSessionId = String(sessionId || "").trim();
  const cleanRevisionId = String(revisionId || "").trim();
  const cleanFileId = String(fileId || "").trim();
  const file = options?.file instanceof File ? options.file : null;
  const useStoredSource = options?.useStoredSource === true;
  const mappingId = String(options?.mappingId || "").trim();
  const fileName = String(options?.fileName || options?.documentName || file?.name || "documento.idml").trim() || "documento.idml";
  if (!cleanSessionId || !cleanRevisionId || !cleanFileId) {
    throw new Error("Faltan sessionId, revisionId o fileId.");
  }
  if (!String(endpoint || "").trim()) {
    throw new Error("Falta endpoint.");
  }
  if (file) {
    const response = await authFetch(endpoint, {
      method: "POST",
      preferRemote: false,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Session-Id": cleanSessionId,
        "X-Revision-Id": cleanRevisionId,
        "X-File-Id": cleanFileId,
        "X-File-Name": fileName,
        ...(mappingId ? { "X-Mapping-Id": mappingId } : {}),
      },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(data?.error || `HTTP ${response.status}`));
    }
    return data;
  }
  if (useStoredSource) {
    const response = await authFetch(endpoint, {
      method: "POST",
      preferRemote: false,
      headers: {
        "X-Use-Stored-Source": "1",
        "X-Session-Id": cleanSessionId,
        "X-Revision-Id": cleanRevisionId,
        "X-File-Id": cleanFileId,
        "X-File-Name": fileName,
        ...(mappingId ? { "X-Mapping-Id": mappingId } : {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(data?.error || `HTTP ${response.status}`));
    }
    return data;
  }
  return authFetchJson(endpoint, {
    method: "POST",
    body: {
      sessionId: cleanSessionId,
      revisionId: cleanRevisionId,
      fileId: cleanFileId,
    },
    preferRemote: false
  });
}

export async function createAnalizarPdfIdmlTemplateFromFile(sessionId = "", revisionId = "", fileId = "", options = {}) {
  return postAnalizarPdfIdmlTool("/api/analizar-pdf/idml-template-from-file", sessionId, revisionId, fileId, options);
}

export async function runAnalizarPdfQuickOrthotypography(sessionId = "", revisionId = "", fileId = "", options = {}) {
  return postAnalizarPdfIdmlTool("/api/analizar-pdf/quick-orthotypography", sessionId, revisionId, fileId, options);
}

export async function deleteAnalizarPdfSession(sessionId = "") {
  return authFetchJson("/api/analizar-pdf/sessions/delete", {
    method: "POST",
    body: { sessionId },
    preferRemote: false
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
  const response = await authFetch("/api/analizar-pdf/analyze", {
    method: "POST",
    preferRemote: false,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Session-Id": cleanSessionId,
      "X-File-Name": file.name || `documento${expectedExt}`,
      ...(String(fileContext?.revisionId || "").trim() ? { "X-Revision-Id": String(fileContext.revisionId).trim() } : {}),
      ...(String(fileContext?.fileId || "").trim() ? { "X-File-Id": String(fileContext.fileId).trim() } : {}),
      ...(String(fileContext?.mappingId || "").trim() ? { "X-Mapping-Id": String(fileContext.mappingId).trim() } : {}),
      ...buildLocalAnalysisContextHeader(fileContext),
    },
    body: file
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || `HTTP ${response.status}`));
  }
  return data;
}

export async function queueAnalizarPdfStoredSourceAnalysis(sessionId = "", sourceType = "pdf", fileContext = null) {
  const cleanSessionId = String(sessionId || "").trim();
  const normalizedSourceType = String(sourceType || "").trim() === "idml" ? "idml" : "pdf";
  const expectedExt = normalizedSourceType === "idml" ? ".idml" : ".pdf";
  const fileName = String(fileContext?.fileName || fileContext?.documentName || `documento${expectedExt}`).trim() || `documento${expectedExt}`;
  if (!cleanSessionId) throw new Error("Falta sessionId.");
  if (!hasAvailableApiBase()) throw new Error("API_UNAVAILABLE");
  const response = await authFetch("/api/analizar-pdf/analyze", {
    method: "POST",
    preferRemote: false,
    headers: {
      "X-Use-Stored-Source": "1",
      "X-Session-Id": cleanSessionId,
      "X-File-Name": fileName,
      ...(String(fileContext?.revisionId || "").trim() ? { "X-Revision-Id": String(fileContext.revisionId).trim() } : {}),
      ...(String(fileContext?.fileId || "").trim() ? { "X-File-Id": String(fileContext.fileId).trim() } : {}),
      ...(String(fileContext?.mappingId || "").trim() ? { "X-Mapping-Id": String(fileContext.mappingId).trim() } : {}),
      ...buildLocalAnalysisContextHeader(fileContext),
    },
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
    method: "GET",
    preferRemote: false
  });
}

export async function cancelAnalizarPdfAnalysis(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) throw new Error("Falta jobId.");
  return authFetchJson("/api/analizar-pdf/analyze-cancel", {
    method: "POST",
    body: { jobId: cleanJobId },
    preferRemote: false
  });
}

export async function exportAnalizarPdfCorrectedIdml(sessionId = "", revisionId = "", fileId = "", correctionSelection = null, cleanupOptions = null, analysisResult = null) {
  const cleanSessionId = String(sessionId || "").trim();
  const cleanRevisionId = String(revisionId || "").trim();
  const cleanFileId = String(fileId || "").trim();
  if (!cleanSessionId || !cleanRevisionId || !cleanFileId) {
    throw new Error("Faltan sessionId, revisionId o fileId.");
  }
  const response = await authFetch("/api/analizar-pdf/export-corrected-idml", {
    method: "POST",
    preferRemote: false,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId: cleanSessionId,
      revisionId: cleanRevisionId,
      fileId: cleanFileId,
      correctionSelection: correctionSelection && typeof correctionSelection === "object"
        ? correctionSelection
        : null,
      cleanupOptions: cleanupOptions && typeof cleanupOptions === "object"
        ? cleanupOptions
        : null,
      result: analysisResult && typeof analysisResult === "object"
        ? analysisResult
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
  const downloadResponse = await authFetch(buildApiUrl(downloadPath), {
    method: "GET",
    preferRemote: false
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
