"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ALLOWED_ANALYSIS_STATUSES = new Set(["idle", "uploading", "queued", "processing", "completed", "failed"]);

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
  const stats = result?.stats && typeof result.stats === "object" ? result.stats : null;
  return {
    paginationIssueCount: paginationIssues,
    sectionIssueCount: sectionIssues,
    spellingIssueCount: spellingIssues,
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
    pageCount: Number(source.pageCount) >= 0
      ? Number(source.pageCount)
      : base.pageCount,
    analyzedAt: clampText(source.analyzedAt || base.analyzedAt, 80)
  };
}

function sanitizeAnalizarPdfSession(raw = {}, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sessionId = clampText(source.id || options.id || "", 120);
  const result = source.result && typeof source.result === "object" ? source.result : {};
  const sanitizedResult = {
    paginationIssues: Array.isArray(result.paginationIssues) ? result.paginationIssues : [],
    sectionIssues: Array.isArray(result.sectionIssues) ? result.sectionIssues : [],
    spellingIssues: Array.isArray(result.spellingIssues) ? result.spellingIssues : [],
    orthotypographyIssues: Array.isArray(result.orthotypographyIssues) ? result.orthotypographyIssues : [],
    colorIssues: Array.isArray(result.colorIssues) ? result.colorIssues : [],
    stats: result.stats && typeof result.stats === "object" ? result.stats : null
  };
  return {
    id: sessionId,
    title: clampText(source.title || "Sesión sin título", 240) || "Sesión sin título",
    ownerId: clampText(source.ownerId || options.ownerId || "", 180),
    createdAt: clampText(source.createdAt || options.createdAt || nowIso(), 80),
    updatedAt: clampText(source.updatedAt || nowIso(), 80),
    sourceType: String(source.sourceType || "pdf").trim() === "idml" ? "idml" : "pdf",
    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisJobId: clampText(source.analysisJobId || "", 160),
    bibliographicInfo: {
      nivel: clampText(source?.bibliographicInfo?.nivel || "", 80),
      grado: clampText(source?.bibliographicInfo?.grado || "", 80),
      trimestre: clampText(source?.bibliographicInfo?.trimestre || "", 80),
      unidad: clampText(source?.bibliographicInfo?.unidad || "", 80),
      edicionNumero: clampText(source?.bibliographicInfo?.edicionNumero || "", 80),
      revisionNumero: clampText(source?.bibliographicInfo?.revisionNumero || "", 80)
    },
    colorConfig: {
      palette: Array.isArray(source?.colorConfig?.palette)
        ? source.colorConfig.palette.map((entry, index) => sanitizeColorEntry(entry, index))
        : []
    },
    indexConfig: {
      indexPageNumber: Math.max(0, Number(source?.indexConfig?.indexPageNumber || 0) || 0),
      sections: Array.isArray(source?.indexConfig?.sections)
        ? source.indexConfig.sections.map((entry, index) => sanitizeSection(entry, index))
        : []
    },
    resultSummary: sanitizeResultSummary(source.resultSummary, sanitizedResult),
    result: sanitizedResult
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
  buildResultSummary,
  classifyAnalizarPdfStartupError,
  createAnalizarPdfJobStore,
  ensureDirSync,
  logAnalizarPdf,
  resolveAnalyzerScript,
  sanitizeAnalizarPdfSession,
  spawnAnalizarPdfPythonJob
};
