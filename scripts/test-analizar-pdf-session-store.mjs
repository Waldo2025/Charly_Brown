import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  pathToFileURL
} from "node:url";

const apiModulePath = new URL("../public/analizarPDF/analizar-pdf-api.js", import.meta.url);
const appModulePath = new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url);
const sessionStorePath = new URL("../public/analizarPDF/analizar-pdf-session-store.js", import.meta.url);
const apiSource = await readFile(apiModulePath, "utf8");
const appSource = await readFile(appModulePath, "utf8");
const source = await readFile(sessionStorePath, "utf8");
const stubImport = `const deleteAnalizarPdfSession = async () => {};
const getAnalizarPdfAnalysisStatus = async () => ({});
const listAnalizarPdfSessions = async () => ({ sessions: [] });
const queueAnalizarPdfUpload = async () => ({});
globalThis.__savedAnalizarPdfSessions = [];
const saveAnalizarPdfSession = async (session, analysisResults = []) => {
  globalThis.__savedAnalizarPdfSessions.push({ session, analysisResults });
  return { session: { ...session, revisions: (session.revisions || []).map((revision) => ({
    ...revision,
    files: (revision.files || []).map((file) => {
      const sidecar = analysisResults.find((entry) => entry.revisionId === revision.id && entry.fileId === file.id);
      return sidecar ? { ...file, result: sidecar.result, resultSummary: sidecar.resultSummary, quickAnalysis: sidecar.quickAnalysis || null } : file;
    })
  })) } };
};`;
const patchedSource = source.replace(
  /import\s*\{[\s\S]*?\}\s*from\s*["']\.\/analizar-pdf-api\.js(?:\?[^"']*)?["'];/,
  stubImport
).replace(
  /import\s*\{\s*createAnalizarPdfSaveCoordinator\s*\}\s*from\s*["']\.\/analizar-pdf-save-coordinator\.js["'];/,
  `const createAnalizarPdfSaveCoordinator = ({ saveImpl } = {}) => ({ save: saveImpl });`
);
assert.notEqual(
  patchedSource,
  source,
  "El test debe poder sustituir imports del API/coordinador para ejecutar el session store en Node."
);

assert.match(
  appSource,
  /function getUploadUiState\(session = null, files = state\.selectedFiles\)/,
  "La app debe centralizar el estado de subida por sourceType."
);
assert.match(
  appSource,
  /els\.fileInput\.accept = uploadState\.accept;/,
  "La app debe actualizar el atributo accept desde el estado de subida."
);
assert.match(
  appSource,
  /session\.sourceType = sourceType;/,
  "La app debe persistir el sourceType seleccionado en la sesión activa."
);
assert.match(
  appSource,
  /queueAnalizarPdfUpload\(sessionId, file, uploadState\.sourceType, fileContext\)/,
  "La app debe pasar sourceType y contexto del archivo al path de subida."
);

const tempDir = await mkdtemp(path.join(os.tmpdir(), "analizar-pdf-session-store-"));
const tempModulePath = path.join(tempDir, "analizar-pdf-session-store.mjs");
const tempApiModulePath = path.join(tempDir, "analizar-pdf-api.mjs");
try {
  await writeFile(tempModulePath, patchedSource, "utf8");
  const apiPatchedSource = apiSource.replace(
    /import\s*\{\s*authFetch,\s*authFetchJson,\s*(?:buildApiUrl,\s*)?hasAvailableApiBase\s*\}\s*from\s*["']\.\.\/js\/api-client\.js["'];/,
    `const authFetch = async (url, options = {}) => fetch(url, options);
const authFetchJson = async () => ({});
const buildApiUrl = (path) => path;
const hasAvailableApiBase = () => true;`
  );
  assert.notEqual(
    apiPatchedSource,
    apiSource,
    "El test debe poder sustituir el import del API client para ejecutar el helper de upload."
  );
  await writeFile(tempApiModulePath, apiPatchedSource, "utf8");

  const {
    createEmptyAnalizarPdfSession,
    normalizeAnalizarPdfSession,
    saveSession
  } = await import(pathToFileURL(tempModulePath).href);
  const { queueAnalizarPdfUpload } = await import(pathToFileURL(tempApiModulePath).href);

  globalThis.File = globalThis.File || class File extends Blob {
    constructor(parts = [], name = "", options = {}) {
      super(parts, options);
      this.name = name;
      this.lastModified = options.lastModified || Date.now();
      this.type = options.type || "";
    }
  };

  let fetchCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ jobId: "job_123", status: "queued" })
    };
  };

  const empty = createEmptyAnalizarPdfSession();
  assert.equal(empty.sourceType, "pdf");
  assert.equal(empty.analysisStatus, "idle");
  assert.deepEqual(empty.bibliographicInfo, {
    bookType: "",
    nivel: "",
    grado: "",
    trimestre: "",
    unidad: "",
    edicionNumero: "",
    revisionNumero: "",
    recortableRole: "source"
  });
  assert.deepEqual(empty.colorConfig, { palette: [] });
  assert.deepEqual(empty.result.orthotypographyIssues, []);
  assert.deepEqual(empty.result.colorIssues, []);
  assert.deepEqual(empty.resultSummary, {
    paginationIssueCount: 0,
    sectionIssueCount: 0,
    spellingIssueCount: 0,
    orthotypographyIssueCount: 0,
    redactionIssueCount: 0,
    noteIssueCount: 0,
    trackedChangeIssueCount: 0,
    customRuleIssueCount: 0,
    colorIssueCount: 0,
    recortableIssueCount: 0,
    pageCount: 0,
    analyzedAt: ""
  });

  const sourceTypedSession = normalizeAnalizarPdfSession({ sourceType: "idml" });
  assert.equal(sourceTypedSession.sourceType, "idml");
  assert.equal(sourceTypedSession.colorConfig.palette.length, 0);

  await assert.rejects(
    queueAnalizarPdfUpload("session_1", new File(["pdf"], "capitulo.pdf", { type: "application/pdf" }), "idml"),
    /El archivo debe ser \.idml\./
  );

  fetchCalls = [];
  const queuedIdml = await queueAnalizarPdfUpload(
    "session_2",
    new File(["idml"], "capitulo.idml", { type: "" }),
    "idml"
  );
  assert.equal(queuedIdml.jobId, "job_123");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/api/analizar-pdf/analyze");
  assert.equal(fetchCalls[0].options.headers["Content-Type"], "application/octet-stream");
  assert.equal(fetchCalls[0].options.headers["X-File-Name"], "capitulo.idml");

  fetchCalls = [];
  const queuedPdf = await queueAnalizarPdfUpload(
    "session_3",
    new File(["pdf"], "capitulo.pdf", { type: "application/pdf" }),
    "pdf"
  );
  assert.equal(queuedPdf.status, "queued");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.headers["Content-Type"], "application/pdf");
  assert.equal(fetchCalls[0].options.headers["X-File-Name"], "capitulo.pdf");

  const normalized = normalizeAnalizarPdfSession({
    sourceType: "idml",
    analysisStatus: "unexpected",
    bibliographicInfo: {
      bookType: "LA",
      nivel: "P5",
      grado: "10",
      trimestre: "Trimestre 1",
      unidad: "Unidad 3",
      edicionNumero: "10",
      revisionNumero: "F2"
    },
    colorConfig: {
      palette: [{ id: "c1", swatchName: "A_COLOR UNIDAD", cmyk: "64,39,0,0", hex: "#6f9eff" }]
    },
    resultSummary: { analyzedAt: "2026-06-03T00:00:00.000Z", pageCount: 24, ignored: true },
    result: {
      orthotypographyIssues: ["spacing"],
      colorIssues: ["swatch mismatch"],
      paginationIssues: ["p1"],
      sectionIssues: ["s1"],
      spellingIssues: ["w1"],
      stats: { pageCount: 18 }
    }
  });

  assert.equal(normalized.sourceType, "idml");
  assert.equal(normalized.analysisStatus, "idle");
  assert.equal(normalized.bibliographicInfo.bookType, "LA");
  assert.equal(normalized.bibliographicInfo.unidad, "Unidad 3");
  assert.equal(normalized.bibliographicInfo.revisionNumero, "F2");
  assert.equal(normalized.colorConfig.palette[0].swatchName, "A_COLOR UNIDAD");
  assert.deepEqual(normalized.result.orthotypographyIssues, ["spacing"]);
  assert.deepEqual(normalized.result.colorIssues, ["swatch mismatch"]);
  assert.deepEqual(normalized.resultSummary, {
    paginationIssueCount: 1,
    sectionIssueCount: 1,
    spellingIssueCount: 1,
    orthotypographyIssueCount: 1,
    redactionIssueCount: 0,
    noteIssueCount: 0,
    trackedChangeIssueCount: 0,
    customRuleIssueCount: 0,
    colorIssueCount: 1,
    recortableIssueCount: 0,
    pageCount: 24,
    analyzedAt: "2026-06-03T00:00:00.000Z"
  });

  globalThis.__savedAnalizarPdfSessions = [];
  const savedWithAnalysisOption = await saveSession({
    ...normalized,
    id: "session_with_heavy_analysis",
    revisions: [{
      id: "revision_heavy",
      title: "Unidad 1 · F1",
      unidad: "Unidad 1",
      revisionNumero: "F1",
      files: [{
        id: "file_heavy",
        documentName: "unidad.idml",
        resultSummary: {
          paginationIssueCount: 2,
          sectionIssueCount: 0,
          spellingIssueCount: 1,
          orthotypographyIssueCount: 1,
          colorIssueCount: 0,
          recortableIssueCount: 0,
          pageCount: 96,
          analyzedAt: "2026-07-08T00:00:00.000Z"
        },
        result: {
          paginationIssues: ["p"],
          sectionIssues: [],
          spellingIssues: ["s"],
          orthotypographyIssues: ["o"],
          colorIssues: [],
          recortableIssues: [],
          stats: {
            pageCount: 96,
            swatchInventory: [{ name: "U1", hex: "#336699" }],
            pageReports: [{ pageName: "1", content: { otro: [{ text: "pesado" }] } }]
          }
        }
      }]
    }]
  }, { includeAnalysis: true });
  assert.equal(savedWithAnalysisOption.id, "session_with_heavy_analysis");
  assert.equal(globalThis.__savedAnalizarPdfSessions.length, 1);
  const remotePayload = globalThis.__savedAnalizarPdfSessions[0].session;
  const sidecarPayload = globalThis.__savedAnalizarPdfSessions[0].analysisResults;
  assert.deepEqual(remotePayload.result.spellingIssues, []);
  assert.equal(remotePayload.result.stats, null);
  assert.deepEqual(remotePayload.revisions[0].files[0].result.spellingIssues, []);
  assert.equal(remotePayload.revisions[0].files[0].result.stats, null);
  assert.equal(remotePayload.revisions[0].files[0].resultSummary.pageCount, 0);
  assert.equal(sidecarPayload.length, 1);
  assert.equal(sidecarPayload[0].revisionId, "revision_heavy");
  assert.equal(sidecarPayload[0].fileId, "file_heavy");
  assert.equal(sidecarPayload[0].result.stats.pageCount, 96);
  assert.equal(sidecarPayload[0].result.stats.swatchInventory[0].name, "U1");
  assert.equal(sidecarPayload[0].result.stats.swatchInventory[0].swatchName, "U1");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Analizar PDF Task 3 contract OK.");
