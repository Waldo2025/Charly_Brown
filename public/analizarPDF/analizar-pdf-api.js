import { authFetch, authFetchJson, hasAvailableApiBase } from "../js/api-client.js";

const localJobs = new Map();
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

function bytesToBase64(bytes = new Uint8Array()) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function encodeCompressedHeaderJson(value = null) {
  if (!value || typeof value !== "object" || typeof CompressionStream !== "function") return "";
  try {
    const source = new TextEncoder().encode(JSON.stringify(value));
    const compressedStream = new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer());
    return `gzip:${bytesToBase64(compressed)}`;
  } catch (_) {
    return "";
  }
}

async function buildLocalAnalysisContextHeader(fileContext = null) {
  const localAnalysisContext = fileContext?.localAnalysisContext || null;
  let encoded = encodeAnalizarPdfHeaderJson(localAnalysisContext);
  if (encoded && encoded.length > LOCAL_ANALYSIS_CONTEXT_HEADER_MAX_LENGTH) {
    encoded = await encodeCompressedHeaderJson(localAnalysisContext);
  }
  if (encoded && encoded.length > LOCAL_ANALYSIS_CONTEXT_HEADER_MAX_LENGTH) {
    console.warn("[analizar-pdf] contexto local omitido: excede el límite seguro de header", {
      encodedLength: encoded.length,
      maxLength: LOCAL_ANALYSIS_CONTEXT_HEADER_MAX_LENGTH,
    });
    return {};
  }
  return encoded ? { "X-Local-Analysis-Context": encoded } : {};
}

function buildAnalysisCategoriesHeader(fileContext = null) {
  const categories = fileContext?.analysisCategories || fileContext?.localAnalysisContext?.analysisCategories || null;
  const encoded = encodeAnalizarPdfHeaderJson(categories);
  return encoded ? { "X-Analysis-Categories": encoded } : {};
}

export async function listAnalizarPdfSessions() {
  return authFetchJson("/api/analizar-pdf/sessions/list?limit=20", { method: "GET", preferRemote: true });
}

export async function getAnalizarPdfSessionDetail(sessionId = "") {
  const cleanSessionId = String(sessionId || "").trim();
  if (!cleanSessionId) {
    throw new Error("Falta sessionId.");
  }
  return authFetchJson(`/api/analizar-pdf/sessions/detail?sessionId=${encodeURIComponent(cleanSessionId)}`, {
    method: "GET",
    preferRemote: true
  });
}

export async function saveAnalizarPdfSession(session, analysisResults = []) {
  return authFetchJson("/api/analizar-pdf/sessions/save", {
    method: "POST",
    body: { session, analysisResults: Array.isArray(analysisResults) ? analysisResults : [] },
    preferRemote: true
  });
}

export async function listAnalizarPdfStyleMappings() {
  return authFetchJson("/api/analizar-pdf/style-mappings/list", { method: "GET", preferRemote: true });
}

export async function saveAnalizarPdfStyleMapping(mapping) {
  return authFetchJson("/api/analizar-pdf/style-mappings/save", {
    method: "POST",
    body: { mapping },
    preferRemote: true
  });
}

export async function deleteAnalizarPdfStyleMapping(mappingId = "") {
  return authFetchJson("/api/analizar-pdf/style-mappings/delete", {
    method: "POST",
    body: { mappingId },
    preferRemote: true
  });
}

export async function activateAnalizarPdfStyleMapping(mappingId = "") {
  return authFetchJson("/api/analizar-pdf/style-mappings/activate", {
    method: "POST",
    body: { mappingId },
    preferRemote: true
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
      preferRemote: true,
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
      preferRemote: true,
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
    preferRemote: true
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
    preferRemote: true
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
  if (normalizedSourceType === 'pdf' && fileContext?.processingLocation !== 'server') {
    const jobId = `local-pdf-${crypto.randomUUID()}`, controller = new AbortController();
    const job = { jobId, sessionId: cleanSessionId, revisionId: fileContext?.revisionId, fileId: fileContext?.fileId, status: 'queued', controller };
    localJobs.set(jobId, job);
    // Return immediately so the existing progress/cancel UI owns the running job.
    Promise.resolve().then(async () => {
      try {
        job.status = 'processing';
        const [{ extractPdf }, { createPdfRules }] = await Promise.all([import('../document-processing/pdf-extractor.js'), import('../document-processing/pdf-rules.js')]);
        const categories = fileContext?.analysisCategories || {};
        const rules = createPdfRules(fileContext?.localSession || {}, categories), started = performance.now();
        const manifest = await extractPdf(file, { signal: controller.signal, spelling: categories.spelling !== false,
          onProgress: progress => { job.progress = progress; }, onBatch: pages => rules.add(pages) });
        if (!manifest.complete) throw Error(`Cobertura incompleta: ${manifest.completed.length}/${manifest.pageCount} páginas.`);
        job.result = rules.finish(); job.result.stats.durationMs = Math.round(performance.now() - started);
        job.resultSummary = { paginationIssueCount: job.result.paginationIssues.length, sectionIssueCount: job.result.sectionIssues.length, spellingIssueCount: job.result.spellingIssues.length };
        job.status = 'completed';
      } catch (error) {
        if (controller.signal.aborted) { job.status = 'cancelled'; return; }
        job.status = 'error'; job.error = String(error.message);
        if (window.confirm(`No se pudo completar el análisis local: ${job.error}\n¿Quieres procesar este archivo en el servidor? Esto usa cómputo de Cloud Run.`)) {
          job.status='processing';job.error='';job.progress={phase:'upload',uploaded:0,total:file.size};
          try { const remote = await queueAnalizarPdfUpload(sessionId, file, sourceType, { ...fileContext, processingLocation: 'server',signal:controller.signal,onUploadProgress:progress=>{job.progress={phase:'upload',...progress};} }); job.remoteJobId = remote.jobId; job.status = 'queued'; }
          catch (fallbackError) { job.status = controller.signal.aborted?'cancelled':'error'; job.error = fallbackError.message; }
        }
      }
    });
    return { jobId, status: 'queued', processingLocation: 'browser' };
  }
  if (!hasAvailableApiBase()) throw new Error("API_UNAVAILABLE");
  if(normalizedSourceType==='pdf'&&file.size>24*1024**2){
    const created=await authFetchJson('/api/analizar-pdf/sources/create',{method:'POST',preferRemote:true,body:{sessionId:cleanSessionId,revisionId:fileContext?.revisionId,fileId:fileContext?.fileId,size:file.size}});
    const signal=fileContext?.signal;
    for(let offset=0;offset<file.size;){
      signal?.throwIfAborted();const end=Math.min(file.size,offset+8*1024**2);
      try {
        const response=await fetch(created.uploadUrl,{method:'PUT',headers:{'Content-Type':'application/pdf','Content-Range':`bytes ${offset}-${end-1}/${file.size}`},body:file.slice(offset,end),signal:signal||AbortSignal.timeout(120000)});
        if(!response.ok&&response.status!==308)throw Error(`No se pudo guardar el PDF: HTTP ${response.status}`);offset=end;
      }catch(error){
        if(signal?.aborted)throw error;
        const status=await fetch(created.uploadUrl,{method:'PUT',headers:{'Content-Range':`bytes */${file.size}`},signal:signal||AbortSignal.timeout(30000)});
        if(status.ok)offset=file.size;
        else if(status.status===308){const range=status.headers.get('Range'),resumed=range?Number(range.match(/-(\d+)$/)?.[1])+1:0;if(!Number.isFinite(resumed)||resumed===offset)throw error;offset=resumed;}else throw error;
      }
      fileContext?.onUploadProgress?.({uploaded:offset,total:file.size});
    }
    await authFetchJson('/api/analizar-pdf/sources/finalize',{method:'POST',preferRemote:true,body:{uploadId:created.uploadId}});
    return queueAnalizarPdfStoredSourceAnalysis(sessionId,sourceType,fileContext);
  }
  const localAnalysisContextHeader = await buildLocalAnalysisContextHeader(fileContext);
  const response = await authFetch("/api/analizar-pdf/analyze", {
    method: "POST",
    preferRemote: true,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Session-Id": cleanSessionId,
      "X-File-Name": file.name || `documento${expectedExt}`,
      ...(String(fileContext?.revisionId || "").trim() ? { "X-Revision-Id": String(fileContext.revisionId).trim() } : {}),
      ...(String(fileContext?.fileId || "").trim() ? { "X-File-Id": String(fileContext.fileId).trim() } : {}),
      ...(String(fileContext?.mappingId || "").trim() ? { "X-Mapping-Id": String(fileContext.mappingId).trim() } : {}),
      ...buildAnalysisCategoriesHeader(fileContext),
      ...localAnalysisContextHeader,
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
    preferRemote: true,
    headers: {
      "Content-Type": "application/json",
      "X-Use-Stored-Source": "1",
      "X-Session-Id": cleanSessionId,
      "X-File-Name": fileName,
      ...(String(fileContext?.revisionId || "").trim() ? { "X-Revision-Id": String(fileContext.revisionId).trim() } : {}),
      ...(String(fileContext?.fileId || "").trim() ? { "X-File-Id": String(fileContext.fileId).trim() } : {}),
      ...(String(fileContext?.mappingId || "").trim() ? { "X-Mapping-Id": String(fileContext.mappingId).trim() } : {}),
      ...buildAnalysisCategoriesHeader(fileContext),
    },
    body: JSON.stringify({
      localAnalysisContext: fileContext?.localAnalysisContext || null,
      analysisCategories: fileContext?.analysisCategories || fileContext?.localAnalysisContext?.analysisCategories || null,
    }),
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
  if (localJobs.has(cleanJobId)) {
    const { controller, remoteJobId, ...job } = localJobs.get(cleanJobId);
    if (remoteJobId) return { ...(await getAnalizarPdfAnalysisStatus(remoteJobId)), jobId: cleanJobId };
    return job;
  }
  return authFetchJson(`/api/analizar-pdf/analyze-status?jobId=${encodeURIComponent(cleanJobId)}`, {
    method: "GET",
    preferRemote: true
  });
}

export async function cancelAnalizarPdfAnalysis(jobId = "") {
  const cleanJobId = String(jobId || "").trim();
  if (!cleanJobId) throw new Error("Falta jobId.");
  if (localJobs.has(cleanJobId)) {
    const job = localJobs.get(cleanJobId); job.controller.abort(); job.status = 'cancelled';
    if (job.remoteJobId) await cancelAnalizarPdfAnalysis(job.remoteJobId);
    return { jobId: cleanJobId, status: 'cancelled' };
  }
  return authFetchJson("/api/analizar-pdf/analyze-cancel", {
    method: "POST",
    body: { jobId: cleanJobId },
    preferRemote: true
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
    preferRemote: true,
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
  const downloadResponse = await authFetch(downloadPath, {
    method: "GET",
    preferRemote: true
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

export async function listAnalizarPdfAnalysisRuleCatalog() {
  return authFetchJson("/api/analizar-pdf/analysis-rules/catalog", { preferRemote: true });
}

export async function listAnalizarPdfCustomRules() {
  return authFetchJson("/api/analizar-pdf/custom-rules/list", { preferRemote: true });
}

export async function saveAnalizarPdfCustomRule(rule = {}) {
  return authFetchJson("/api/analizar-pdf/custom-rules/save", {
    method: "POST",
    body: JSON.stringify({ rule }),
    preferRemote: true
  });
}

export async function deleteAnalizarPdfCustomRule(ruleId = "") {
  return authFetchJson("/api/analizar-pdf/custom-rules/delete", {
    method: "POST",
    body: JSON.stringify({ ruleId }),
    preferRemote: true
  });
}
