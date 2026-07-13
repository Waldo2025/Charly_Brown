import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasRenderableAnalysis,
  mergeRenderableFileResults,
} from "../public/analizarPDF/analizar-pdf-session-logic.js";

const appSource = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");

function buildEntry(unitNumber, revisionIndex) {
  return {
    revisionId: `revision_unidad_${unitNumber}`,
    fileId: `file_unidad_${unitNumber}`,
    revisionIndex,
    fileIndex: 0,
    fileTitle: `EEFESPPRI_10REV_TRIM1_P4_LA_${String(unitNumber).padStart(2, "0")}_L${unitNumber}.idml`,
    revisionTitle: `Unidad ${unitNumber} · F1`,
    analysisStatus: "completed",
    resultSummary: {
      paginationIssueCount: 0,
      sectionIssueCount: 0,
      spellingIssueCount: 0,
      orthotypographyIssueCount: 0,
      colorIssueCount: 0,
      recortableIssueCount: 0,
      pageCount: 1,
      analyzedAt: `2026-07-08T10:0${revisionIndex}:00.000Z`,
    },
    result: {
      paginationIssues: [],
      sectionIssues: [],
      spellingIssues: [],
      orthotypographyIssues: [],
      colorIssues: [],
      recortableIssues: [],
      stats: {
        documentName: `Unidad ${unitNumber}`,
        pageCount: 1,
        pageReports: [{ pageName: String(unitNumber) }],
      },
    },
  };
}

const entries = [
  buildEntry(1, 0),
  buildEntry(4, 1),
  buildEntry(5, 2),
  buildEntry(6, 3),
];

const merged = mergeRenderableFileResults({ fallbackEntries: entries });
assert.equal(merged.length, 4, "El rail debe conservar un grupo por cada archivo analizado.");
assert.deepEqual(
  merged.map((entry) => `${entry.revisionId}::${entry.fileId}`),
  [
    "revision_unidad_1::file_unidad_1",
    "revision_unidad_4::file_unidad_4",
    "revision_unidad_5::file_unidad_5",
    "revision_unidad_6::file_unidad_6",
  ],
  "La clave del rail debe ser revisionId::fileId, sin sustituir unidades secuenciales."
);
assert.deepEqual(
  merged.map((entry) => entry.result.stats.documentName),
  ["Unidad 1", "Unidad 4", "Unidad 5", "Unidad 6"],
  "Cada entrada debe conservar el resultado de su propio archivo."
);
assert.ok(entries.every((entry) => hasRenderableAnalysis(entry)), "Todas las entradas fixture deben ser renderizables.");

const clearBusySource = appSource.match(/function clearBusyAnalysisStateForJob[\s\S]*?\n}\n\nfunction applyAnalysisStatusPayloadToLocalSession/)?.[0] || "";
assert.ok(clearBusySource, "Debe existir clearBusyAnalysisStateForJob.");
assert.match(clearBusySource, /options = \{\}/, "La limpieza debe recibir contexto explícito del job.");
assert.match(clearBusySource, /targetRevisionId[\s\S]*targetFileId/, "La limpieza debe poder apuntar por revisionId/fileId.");
assert.doesNotMatch(clearBusySource, /\.result\s*=/, "La limpieza de busy state no debe modificar result.");
assert.doesNotMatch(clearBusySource, /\.resultSummary\s*=/, "La limpieza de busy state no debe modificar resultSummary.");

const applyPayloadSource = appSource.match(/function applyAnalysisStatusPayloadToLocalSession[\s\S]*?\n}\n\nfunction renderActionButtonState/)?.[0] || "";
assert.ok(applyPayloadSource, "Debe existir applyAnalysisStatusPayloadToLocalSession.");
assert.match(
  applyPayloadSource,
  /if \(revisionId && fileId\)[\s\S]*String\(revision\?\.id[\s\S]*String\(file\?\.id/,
  "El polling debe priorizar coincidencia exacta revisionId/fileId antes de fallback por jobId."
);

const startPollingSource = appSource.match(/async function startPolling[\s\S]*?\n}\n\nasync function bootstrap/)?.[0] || "";
assert.ok(startPollingSource, "Debe existir startPolling.");
assert.match(
  startPollingSource,
  /clearBusyAnalysisStateForJob\(cleanJobId,[\s\S]*revisionId: payload\?\.revisionId[\s\S]*fileId: payload\?\.fileId/,
  "La finalización del polling debe pasar revisionId/fileId a la limpieza."
);

const buildRenderableSource = appSource.match(/function buildRenderableSession[\s\S]*?\n}\n\nfunction syncPersistedTitleMap/)?.[0] || "";
assert.ok(buildRenderableSource, "Debe existir buildRenderableSession.");
assert.doesNotMatch(buildRenderableSource, /const activeFileResult/, "fileResults debe salir solo de session.revisions[].files[].");
assert.match(buildRenderableSource, /activeEntry:\s*null/, "No debe inyectarse una entrada activa duplicada al rail.");

console.log("Analizar PDF rail sequential job isolation OK.");
