"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ALLOWED_ANALYSIS_STATUSES = new Set(["idle", "uploading", "queued", "processing", "completed", "failed"]);
const ALLOWED_STYLE_KINDS = new Set(["paragraph", "character", "swatch"]);
const ANALIZAR_PDF_MAPPING_TOOL_NAME = "Peppermint Patty Editor";

function nowIso() {
  return new Date().toISOString();
}

function logAnalizarPdf(event = "", payload = null) {
  const label = `[analizar-pdf] ${nowIso()} ${String(event || "").trim()}`;
  if (!payload || typeof payload !== "object") {
    console.log(label);
    return;
  }
  try {
    console.log(label, JSON.stringify(payload));
  } catch (_) {
    console.log(label, payload);
  }
}

function clampText(value = "", max = 240) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeSection(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: clampText(source.id || `section_${index + 1}`, 120) || `section_${index + 1}`,
    title: clampText(source.title || "", 240),
    expectedPageNumber: Math.max(0, Number(source.expectedPageNumber || 0) || 0)
  };
}

function sanitizeColorEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: clampText(source.id || `color_${index + 1}`, 120) || `color_${index + 1}`,
    swatchName: clampText(source.swatchName || "", 240),
    cmyk: clampText(source.cmyk || "", 80),
    hex: clampText(source.hex || "", 32)
  };
}

function buildResultSummary(result = {}) {
  const paginationIssues = Array.isArray(result?.paginationIssues) ? result.paginationIssues.length : 0;
  const sectionIssues = Array.isArray(result?.sectionIssues) ? result.sectionIssues.length : 0;
  const spellingIssues = Array.isArray(result?.spellingIssues) ? result.spellingIssues.length : 0;
  const orthotypographyIssues = Array.isArray(result?.orthotypographyIssues) ? result.orthotypographyIssues.length : 0;
  const colorIssues = Array.isArray(result?.colorIssues) ? result.colorIssues.length : 0;
  const recortableIssues = Array.isArray(result?.recortableIssues) ? result.recortableIssues.length : 0;
  const stats = result?.stats && typeof result.stats === "object" ? result.stats : null;
  return {
    paginationIssueCount: paginationIssues,
    sectionIssueCount: sectionIssues,
    spellingIssueCount: spellingIssues,
    orthotypographyIssueCount: orthotypographyIssues,
    colorIssueCount: colorIssues,
    recortableIssueCount: recortableIssues,
    pageCount: Number(stats?.pageCount || 0) || 0,
    analyzedAt: nowIso()
  };
}

function normalizeAnalysisStatus(value = "") {
  const normalized = String(value || "").trim();
  return ALLOWED_ANALYSIS_STATUSES.has(normalized) ? normalized : "idle";
}

function sanitizeResultSummary(raw = {}, result = {}) {
  const base = buildResultSummary(result);
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    paginationIssueCount: Number(source.paginationIssueCount) >= 0
      ? Number(source.paginationIssueCount)
      : base.paginationIssueCount,
    sectionIssueCount: Number(source.sectionIssueCount) >= 0
      ? Number(source.sectionIssueCount)
      : base.sectionIssueCount,
    spellingIssueCount: Number(source.spellingIssueCount) >= 0
      ? Number(source.spellingIssueCount)
      : base.spellingIssueCount,
    orthotypographyIssueCount: Number(source.orthotypographyIssueCount) >= 0
      ? Number(source.orthotypographyIssueCount)
      : base.orthotypographyIssueCount,
    colorIssueCount: Number(source.colorIssueCount) >= 0
      ? Number(source.colorIssueCount)
      : base.colorIssueCount,
    recortableIssueCount: Number(source.recortableIssueCount) >= 0
      ? Number(source.recortableIssueCount)
      : base.recortableIssueCount,
    pageCount: Number(source.pageCount) >= 0
      ? Number(source.pageCount)
      : base.pageCount,
    analyzedAt: clampText(source.analyzedAt || base.analyzedAt, 80)
  };
}

function buildSessionKey(info = {}) {
  return [
    clampText(info?.nivel || "", 80).toLowerCase(),
    clampText(info?.grado || "", 80).toLowerCase(),
    clampText(info?.trimestre || "", 80).toLowerCase(),
    clampText(info?.edicionNumero || "", 80).toLowerCase()
  ].filter(Boolean).join("|");
}

function buildRevisionKey(raw = {}) {
  return [
    clampText(raw?.unidad || "", 80).toLowerCase(),
    clampText(raw?.revisionNumero || "", 80).toLowerCase()
  ].filter(Boolean).join("|");
}

function buildRevisionTitle(raw = {}) {
  return [clampText(raw?.unidad || "", 80), clampText(raw?.revisionNumero || "", 80)].filter(Boolean).join(" · ") || "Revisión sin título";
}

function buildFileKey(name = "") {
  return clampText(name || "", 240).toLowerCase();
}

function buildStyleMappingScopeKey(raw = {}) {
  return [
    clampText(raw?.bookType || "", 32).toLowerCase(),
    clampText(raw?.nivel || "", 80).toLowerCase(),
    clampText(raw?.grado || "", 80).toLowerCase(),
    clampText(raw?.unidad || "", 80).toLowerCase()
  ].filter(Boolean).join("|");
}

function normalizeStyleKind(value = "") {
  const normalized = clampText(value || "", 24).toLowerCase();
  return ALLOWED_STYLE_KINDS.has(normalized) ? normalized : "paragraph";
}

function normalizePageScope(value = "") {
  const normalized = clampText(value || "", 16).toLowerCase();
  return normalized === "even" || normalized === "odd" ? normalized : "both";
}

function normalizeTargetPage(value = "") {
  return normalizeTargetPageList(value || "", { zeroMeansEmpty: true });
}

function normalizeExcludeTargetPage(value = "") {
  return normalizeTargetPageList(value || "", { zeroMeansEmpty: true, fallbackZero: true });
}

function normalizeTargetPageList(value = "", options = {}) {
  const zeroMeansEmpty = options?.zeroMeansEmpty === true;
  const fallbackZero = options?.fallbackZero === true;
  const tokens = clampText(value || "", 240)
    .split(",")
    .map((token) => Number.parseInt(String(token || "").trim(), 10))
    .filter((token) => Number.isFinite(token) && token >= 0 && token <= 999);
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (zeroMeansEmpty && token === 0) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }
  if (!unique.length) {
    return fallbackZero ? "0" : "";
  }
  return unique.join(", ");
}

function sanitizeStyleMappingEntry(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: clampText(source.id || `mapping_entry_${index + 1}`, 120) || `mapping_entry_${index + 1}`,
    alias: clampText(source.alias || "", 120),
    styleKind: normalizeStyleKind(source.styleKind),
    styleName: clampText(source.styleName || "", 240),
    pageScope: normalizePageScope(source.pageScope),
    targetPage: normalizeTargetPage(source.targetPage),
    excludeTargetPage: normalizeExcludeTargetPage(source.excludeTargetPage),
    enabled: source.enabled !== false,
    notes: clampText(source.notes || "", 240)
  };
}

function sanitizeStyleMapping(raw = {}, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const bookType = clampText(source.bookType || "", 32);
  const nivel = clampText(source.nivel || "", 80);
  const grado = clampText(source.grado || "", 80);
  const unidad = clampText(source.unidad || "", 80);
  return {
    id: clampText(source.id || options.id || "", 120),
    ownerId: clampText(source.ownerId || options.ownerId || "", 180),
    title: clampText(source.title || "Mapeo sin título", 240) || "Mapeo sin título",
    mappingSlug: clampText(source.mappingSlug || source.id || options.id || "", 160),
    scopeKey: clampText(source.scopeKey || buildStyleMappingScopeKey({ bookType, nivel, grado, unidad }), 240),
    bookType,
    nivel,
    grado,
    unidad,
    isActive: source.isActive === true,
    createdAt: clampText(source.createdAt || options.createdAt || nowIso(), 80),
    updatedAt: clampText(source.updatedAt || nowIso(), 80),
    entries: Array.isArray(source.entries) ? source.entries.map((entry, index) => sanitizeStyleMappingEntry(entry, index)) : []
  };
}

function buildStyleMappingEntries(definitions = [], idPrefix = "mapping_entry") {
  return definitions.map(([alias, styleKind, styleName], index) => sanitizeStyleMappingEntry({
    id: `${idPrefix}_${index + 1}`,
    alias,
    styleKind,
    styleName,
    enabled: true
  }, index));
}

function buildDefaultStyleMappingSeeds(ownerId = "") {
  const projectEntries = buildStyleMappingEntries([
    ["campo_formativo", "paragraph", "01_04_CAMPO FORMATIVO"],
    ["titulo_seccion", "paragraph", "01_00_TITULO"],
    ["nombre_seccion", "paragraph", "01_05 TITULO SECCION Y COMPETENCIA"],
    ["titulo_literaturas", "paragraph", "01_00_TITULO LITERATURAS Y EJERCICIOS"],
    ["recortable_indicator", "paragraph", "08_01_COMPETENCIA"],
    ["recortable_destination", "paragraph", "01_00_TITULO LITERATURAS Y EJERCICIOS"],
    ["recortable_footer", "paragraph", "12_01 PIE DE PAGINA DERCHO"],
    ["habilidad", "paragraph", "08_05_02 HABILIDADES"],
    ["folio_unidad", "character", "Z_FOLIO_UNIDAD"],
    ["folio_trimestre", "character", "Z_FOLIO_TIRMESTRE"],
    ["folio_nivel", "character", "Z_FOLIO_NIVEL"],
    ["folio_numero", "character", "Z_FOLIOS"],
    ["folio_numero_recortable", "character", "Z_FOLIOS RECORTABLES"],
    ["respuesta_alumno", "paragraph", "08_04_00 RESPUESTA ALUMNO"]
  ], "project_entry");

  const primeroUnidadEntries = buildStyleMappingEntries([
    ["titulo_unidad", "paragraph", "TITULO UNIDAD 10 ED"],
    ["temario", "paragraph", "PRESEF COL 2 TABLA DE CONTENIDOS"],
    ["titulo_seccion", "paragraph", "TITULO"],
    ["titulo_lectura", "paragraph", "PRESEF COL2 cajas basicas literatura"],
    ["instruccion", "paragraph", "INSTRUCCION"],
    ["subinstruccion", "paragraph", "SUBINSTRUCCION"],
    ["texto", "paragraph", "TEXTO"],
    ["caja_amarilla_texto", "paragraph", "PRESEF COL2 cajas basicas texto"],
    ["caja_amarilla_literatura", "paragraph", "PRESEF COL2 cajas basicas literatura"],
    ["trazos_gris", "paragraph", "ASC CURSIVE GRIS"],
    ["trazos_letras", "paragraph", "CURSIVA TEXTO TRAZOS Y LETRAS"],
    ["habilidad_verso", "paragraph", "PRESEF COL 2 HABILIDADES VERSO"],
    ["habilidad_recto", "paragraph", "PRESEF COL 2 HABILIDAD RECTO"],
    ["pie_pagina", "paragraph", "PRESEF COL2 PIE DE PAGINA VERSO"],
    ["habilidad_caracter", "character", "PRESEF COL2 HABILIDADES"]
  ], "unidad_primero_entry");

  return [
    sanitizeStyleMapping({
      id: "default_la_proyecto",
      title: "LA · Proyecto",
      mappingSlug: "la-proyecto-default",
      bookType: "LA",
      nivel: "Primaria",
      grado: "",
      unidad: "Proyecto",
      isActive: true,
      entries: projectEntries
    }, { ownerId, createdAt: nowIso() }),
    sanitizeStyleMapping({
      id: "default_la_primero_unidad",
      title: "LA · Primero · Unidad normal",
      mappingSlug: "la-primero-unidad-default",
      bookType: "LA",
      nivel: "Primaria",
      grado: "Primero",
      unidad: "Unidad normal",
      isActive: true,
      entries: primeroUnidadEntries
    }, { ownerId, createdAt: nowIso() })
  ];
}

function sanitizeResult(raw = {}) {
  const result = raw && typeof raw === "object" ? raw : {};
  return {
    paginationIssues: Array.isArray(result.paginationIssues) ? result.paginationIssues : [],
    sectionIssues: Array.isArray(result.sectionIssues) ? result.sectionIssues : [],
    spellingIssues: Array.isArray(result.spellingIssues) ? result.spellingIssues : [],
    orthotypographyIssues: Array.isArray(result.orthotypographyIssues) ? result.orthotypographyIssues : [],
    colorIssues: Array.isArray(result.colorIssues) ? result.colorIssues : [],
    recortableIssues: Array.isArray(result.recortableIssues) ? result.recortableIssues : [],
    stats: result.stats && typeof result.stats === "object" ? result.stats : null
  };
}

function sanitizeAnalizarPdfFile(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = sanitizeResult(source.result);
  const documentName = clampText(source.documentName || source.fileName || "", 240);
  return {
    id: clampText(source.id || `file_${index + 1}`, 120) || `file_${index + 1}`,
    fileKey: clampText(source.fileKey || buildFileKey(documentName) || `file_${index + 1}`, 240) || `file_${index + 1}`,
    documentName,
    mappingId: clampText(source.mappingId || "", 120),
    mappingTitle: clampText(source.mappingTitle || "", 240),
    mappingUpdatedAt: clampText(source.mappingUpdatedAt || "", 80),
    sourceAssetPath: clampText(source.sourceAssetPath || "", 600),
    localBlobKey: clampText(source.localBlobKey || "", 240),
    hasLocalSource: source.hasLocalSource === true,
    fileSize: Math.max(0, Number(source.fileSize || 0) || 0),
    fileLastModified: Math.max(0, Number(source.fileLastModified || 0) || 0),
    fileMimeType: clampText(source.fileMimeType || "", 160),
    sourceStoragePath: clampText(source.sourceStoragePath || "", 900),
    sourceDownloadUrl: clampText(source.sourceDownloadUrl || "", 3200),
    correctedStoragePath: clampText(source.correctedStoragePath || "", 900),
    correctedDownloadUrl: clampText(source.correctedDownloadUrl || "", 3200),
    correctedExportedAt: clampText(source.correctedExportedAt || "", 80),
    sourceType: String(source.sourceType || "pdf").trim() === "idml" ? "idml" : "pdf",
    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisJobId: clampText(source.analysisJobId || "", 160),
    createdAt: clampText(source.createdAt || nowIso(), 80),
    updatedAt: clampText(source.updatedAt || nowIso(), 80),
    resultSummary: sanitizeResultSummary(source.resultSummary, result),
    result
  };
}

function sanitizeAnalizarPdfRevision(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const files = Array.isArray(source.files) ? source.files.map((entry, fileIndex) => sanitizeAnalizarPdfFile(entry, fileIndex)) : [];
  const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
  return {
    id: clampText(source.id || `revision_${index + 1}`, 120) || `revision_${index + 1}`,
    revisionKey: clampText(source.revisionKey || buildRevisionKey(source) || `revision_${index + 1}`, 200) || `revision_${index + 1}`,
    title: clampText(source.title || buildRevisionTitle(source), 240) || buildRevisionTitle(source),
    unidad: clampText(source.unidad || "", 80),
    revisionNumero: clampText(source.revisionNumero || "", 80),
    mappingId: clampText(source.mappingId || "", 120),
    mappingTitle: clampText(source.mappingTitle || "", 240),
    mappingUpdatedAt: clampText(source.mappingUpdatedAt || "", 80),
    createdAt: clampText(source.createdAt || nowIso(), 80),
    updatedAt: clampText(source.updatedAt || nowIso(), 80),
    latestAnalysisAt: clampText(source.latestAnalysisAt || "", 80),
    fileCount: Math.max(0, Number(source.fileCount || files.length) || files.length),
    summary: {
      paginationIssueCount: Math.max(0, Number(summary.paginationIssueCount || 0) || 0),
      sectionIssueCount: Math.max(0, Number(summary.sectionIssueCount || 0) || 0),
      spellingIssueCount: Math.max(0, Number(summary.spellingIssueCount || 0) || 0),
      orthotypographyIssueCount: Math.max(0, Number(summary.orthotypographyIssueCount || 0) || 0),
      colorIssueCount: Math.max(0, Number(summary.colorIssueCount || 0) || 0),
      recortableIssueCount: Math.max(0, Number(summary.recortableIssueCount || 0) || 0)
    },
    files
  };
}

function sanitizeAnalizarPdfSession(raw = {}, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sessionId = clampText(source.id || options.id || "", 120);
  const sanitizedResult = sanitizeResult(source.result);
  const bibliographicInfo = {
    bookType: clampText(source?.bibliographicInfo?.bookType || "", 32),
    nivel: clampText(source?.bibliographicInfo?.nivel || "", 80),
    grado: clampText(source?.bibliographicInfo?.grado || "", 80),
    trimestre: clampText(source?.bibliographicInfo?.trimestre || "", 80),
    unidad: clampText(source?.bibliographicInfo?.unidad || "", 80),
    edicionNumero: clampText(source?.bibliographicInfo?.edicionNumero || "", 80),
    revisionNumero: clampText(source?.bibliographicInfo?.revisionNumero || "", 80)
  };
  return {
    id: sessionId,
    title: clampText(source.title || "Sesión sin título", 240) || "Sesión sin título",
    ownerId: clampText(source.ownerId || options.ownerId || "", 180),
    createdAt: clampText(source.createdAt || options.createdAt || nowIso(), 80),
    updatedAt: clampText(source.updatedAt || nowIso(), 80),
    sessionKey: clampText(source.sessionKey || buildSessionKey(bibliographicInfo), 240),
    sourceType: String(source.sourceType || "pdf").trim() === "idml" ? "idml" : "pdf",
    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisJobId: clampText(source.analysisJobId || "", 160),
    bibliographicInfo,
    colorConfig: {
      palette: Array.isArray(source?.colorConfig?.palette)
        ? source.colorConfig.palette.map((entry, index) => sanitizeColorEntry(entry, index))
        : []
    },
    indexConfig: {
      indexPageNumber: Math.max(0, Number(source?.indexConfig?.indexPageNumber || 0) || 0),
      temarioPageNumber: Math.max(0, Number(source?.indexConfig?.temarioPageNumber || 0) || 0),
      sections: Array.isArray(source?.indexConfig?.sections)
        ? source.indexConfig.sections.map((entry, index) => sanitizeSection(entry, index))
        : []
    },
    resultSummary: sanitizeResultSummary(source.resultSummary, sanitizedResult),
    result: sanitizedResult,
    revisions: Array.isArray(source.revisions) ? source.revisions.map((entry, index) => sanitizeAnalizarPdfRevision(entry, index)) : [],
    comparisons: Array.isArray(source.comparisons) ? source.comparisons : []
  };
}

function createAnalizarPdfJobStore() {
  const jobs = new Map();

  function set(jobId = "", patch = {}) {
    const key = String(jobId || "").trim();
    if (!key) return null;
    const next = {
      ...(jobs.get(key) || {}),
      ...(patch && typeof patch === "object" ? patch : {}),
      jobId: key,
      updatedAt: nowIso()
    };
    jobs.set(key, next);
    return next;
  }

  function get(jobId = "") {
    return jobs.get(String(jobId || "").trim()) || null;
  }

  return { set, get };
}

let languageToolStartPromise = null;
let languageToolProcess = null;

async function fetchJsonCompat(url, init = {}) {
  const fetchFn = typeof fetch === "function"
    ? fetch
    : (...args) => import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));
  const response = await fetchFn(url, init);
  if (!response.ok) {
    throw new Error(`LanguageTool HTTP ${response.status}`);
  }
  return response.json();
}

async function waitForLanguageTool(baseUrl = "", attempts = 12, delayMs = 1000) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fetchJsonCompat(`${baseUrl.replace(/\/+$/, "")}/v2/languages`);
      return true;
    } catch (_) {
      if (index === attempts - 1) throw _;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

function resolveLanguageToolStartCommand(options = {}) {
  const port = Number(options.port || process.env.LANGUAGETOOL_PORT || 8081) || 8081;
  const explicit = String(process.env.LANGUAGETOOL_COMMAND || "").trim();
  if (explicit) {
    const parts = explicit.split(/\s+/).filter(Boolean);
    return { command: parts[0], args: parts.slice(1) };
  }
  return { command: "languagetool", args: ["--http", "--port", String(port)] };
}

function classifyAnalizarPdfStartupError(error) {
  const message = String(error?.message || error || "").trim();
  const lower = message.toLowerCase();
  if (
    lower.includes("no module named 'fitz'") ||
    lower.includes('no module named "fitz"') ||
    lower.includes("no module named 'enchant'") ||
    lower.includes('no module named "enchant"') ||
    lower.includes("the 'enchant' c library was not found") ||
    lower.includes("modulenotfounderror") && lower.includes("fitz") ||
    lower.includes("modulenotfounderror") && lower.includes("enchant") ||
    lower.includes("pymupdf") ||
    lower.includes("pyenchant")
  ) {
    return {
      status: 500,
      code: "PYTHON_DEPENDENCY_MISSING",
      error: "PYTHON_DEPENDENCY_MISSING: instala PyMuPDF y PyEnchant/enchant en el python3 usado por el backend."
    };
  }
  if (
    lower.includes("python exit") ||
    lower.includes("invalid python json output") ||
    lower.includes("traceback")
  ) {
    return {
      status: 500,
      code: "PDF_ANALYZER_START_FAILED",
      error: `PDF_ANALYZER_START_FAILED: ${message || "falló el script Python del analizador."}`
    };
  }
  return {
    status: Number(error?.status || 500),
    code: "ANALIZAR_PDF_START_FAILED",
    error: message || "ANALIZAR_PDF_START_FAILED"
  };
}

async function ensureLanguageToolServer(options = {}) {
  const port = Number(options.port || process.env.LANGUAGETOOL_PORT || 8081) || 8081;
  const baseUrl = String(options.baseUrl || process.env.LANGUAGETOOL_BASE_URL || `http://127.0.0.1:${port}`).trim().replace(/\/+$/, "");
  try {
    await waitForLanguageTool(baseUrl, 1, 10);
    return { baseUrl, managed: false };
  } catch (_) {
    // continue
  }

  if (!languageToolStartPromise) {
    languageToolStartPromise = (async () => {
      const { command, args } = resolveLanguageToolStartCommand({ port });
      await new Promise((resolve, reject) => {
        languageToolProcess = spawn(command, args, {
          stdio: "ignore",
          detached: true
        });
        languageToolProcess.once("error", reject);
        languageToolProcess.once("spawn", resolve);
      });
      languageToolProcess.unref();
      await waitForLanguageTool(baseUrl, 20, 1000);
      return { baseUrl, managed: true };
    })().finally(() => {
      languageToolStartPromise = null;
    });
  }

  return languageToolStartPromise;
}

function resolveAnalyzerScript(session = {}) {
  const sourceType = String(session?.sourceType || "pdf").trim();
  if (sourceType === "idml") {
    return path.join(__dirname, "python", "analyze_idml.py");
  }
  return path.join(__dirname, "python", "analyze_pdf.py");
}

function spawnAnalizarPdfPythonJob(options = {}) {
  const pythonBin = String(options.pythonBin || process.env.PDF_ANALYZER_PYTHON_BIN || "python3").trim() || "python3";
  const scriptPath = path.resolve(String(options.scriptPath || ""));
  const args = [
    scriptPath,
    "--input",
    path.resolve(String(options.pdfPath || "")),
    "--session-json",
    JSON.stringify(options.session || {})
  ];
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1"
  };
  logAnalizarPdf("python.spawn", {
    pythonBin,
    scriptPath,
    pdfPath: path.resolve(String(options.pdfPath || "")),
    sessionId: String(options?.session?.id || ""),
    args
  });
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.on("spawn", () => {
      logAnalizarPdf("python.spawned", { pid: child.pid || 0 });
    });
    child.stdout.on("data", (chunk) => {
      const text = String(chunk || "");
      stdout += text;
      logAnalizarPdf("python.stdout.chunk", {
        pid: child.pid || 0,
        bytes: Buffer.byteLength(text),
        preview: text.slice(0, 300)
      });
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      stderr += text;
      logAnalizarPdf("python.stderr.chunk", {
        pid: child.pid || 0,
        bytes: Buffer.byteLength(text),
        preview: text.slice(0, 300)
      });
    });
    child.on("error", (error) => {
      logAnalizarPdf("python.error", {
        pid: child.pid || 0,
        message: String(error?.message || error)
      });
      reject(error);
    });
    child.on("close", (code) => {
      logAnalizarPdf("python.close", {
        pid: child.pid || 0,
        code,
        stdoutBytes: Buffer.byteLength(stdout),
        stderrBytes: Buffer.byteLength(stderr),
        stdoutPreview: stdout.slice(0, 600),
        stderrPreview: stderr.slice(0, 600)
      });
      if (code !== 0) {
        const error = new Error(stderr.trim() || stdout.trim() || `Python exit ${code}`);
        error.code = code;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Invalid Python JSON output: ${error.message}`));
      }
    });
  });
}

function ensureDirSync(dirPath = "") {
  fs.mkdirSync(String(dirPath || ""), { recursive: true });
}

module.exports = {
  ANALIZAR_PDF_MAPPING_TOOL_NAME,
  buildResultSummary,
  buildDefaultStyleMappingSeeds,
  buildStyleMappingScopeKey,
  classifyAnalizarPdfStartupError,
  createAnalizarPdfJobStore,
  ensureDirSync,
  logAnalizarPdf,
  normalizeAnalysisStatus,
  resolveAnalyzerScript,
  sanitizeResultSummary,
  sanitizeAnalizarPdfSession,
  sanitizeStyleMapping,
  sanitizeStyleMappingEntry,
  spawnAnalizarPdfPythonJob
};
