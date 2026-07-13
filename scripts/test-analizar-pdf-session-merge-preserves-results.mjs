import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  mergeAnalizarPdfSessionPreservingFreshFileResults,
} = require("../backend/analizar-pdf.js");

const emptyResult = {
  paginationIssues: [],
  sectionIssues: [],
  spellingIssues: [],
  orthotypographyIssues: [],
  colorIssues: [],
  recortableIssues: [],
  stats: null,
};

const analyzedResult = (documentName, pageName) => ({
  paginationIssues: [],
  sectionIssues: [],
  spellingIssues: [],
  orthotypographyIssues: [],
  colorIssues: [],
  recortableIssues: [],
  stats: {
    documentName,
    pageCount: 1,
    pageReports: [{ pageName }],
  },
});

const analyzedSummary = (analyzedAt) => ({
  paginationIssueCount: 0,
  sectionIssueCount: 0,
  spellingIssueCount: 0,
  orthotypographyIssueCount: 0,
  colorIssueCount: 0,
  recortableIssueCount: 0,
  pageCount: 1,
  analyzedAt,
});

const existing = {
  id: "analizar_pdf_merge_test",
  ownerId: "user_1",
  createdAt: "2026-07-08T10:00:00.000Z",
  updatedAt: "2026-07-08T10:06:00.000Z",
  sourceType: "idml",
  revisions: [
    {
      id: "revision_unidad_1",
      title: "Unidad 1 · F1",
      unidad: "Unidad 1",
      files: [
        {
          id: "file_unidad_1",
          documentName: "EEFESPPRI_10REV_TRIM1_P4_LA_01_L1.idml",
          sourceType: "idml",
          analysisStatus: "completed",
          updatedAt: "2026-07-08T10:05:00.000Z",
          resultSummary: analyzedSummary("2026-07-08T10:05:00.000Z"),
          result: analyzedResult("EEFESPPRI_10REV_TRIM1_P4_LA_01_L1.idml", "1"),
        },
      ],
    },
    {
      id: "revision_unidad_2",
      title: "Unidad 2 · F1",
      unidad: "Unidad 2",
      files: [
        {
          id: "file_unidad_2",
          documentName: "EEFESPPRI_10REV_TRIM1_P4_LA_02_L2.idml",
          sourceType: "idml",
          analysisStatus: "queued",
          updatedAt: "2026-07-08T10:06:00.000Z",
          result: emptyResult,
        },
      ],
    },
  ],
};

const staleIncoming = {
  ...existing,
  updatedAt: "2026-07-08T10:07:00.000Z",
  revisions: [
    {
      id: "revision_unidad_1",
      title: "Unidad 1 · F1",
      unidad: "Unidad 1",
      files: [
        {
          id: "file_unidad_1",
          documentName: "EEFESPPRI_10REV_TRIM1_P4_LA_01_L1.idml",
          sourceType: "idml",
          analysisStatus: "idle",
          updatedAt: "2026-07-08T10:01:00.000Z",
          result: emptyResult,
        },
      ],
    },
    {
      id: "revision_unidad_2",
      title: "Unidad 2 · F1",
      unidad: "Unidad 2",
      files: [
        {
          id: "file_unidad_2",
          documentName: "EEFESPPRI_10REV_TRIM1_P4_LA_02_L2.idml",
          sourceType: "idml",
          analysisStatus: "completed",
          updatedAt: "2026-07-08T10:07:00.000Z",
          resultSummary: analyzedSummary("2026-07-08T10:07:00.000Z"),
          result: analyzedResult("EEFESPPRI_10REV_TRIM1_P4_LA_02_L2.idml", "2"),
        },
      ],
    },
  ],
};

const merged = mergeAnalizarPdfSessionPreservingFreshFileResults(existing, staleIncoming, {
  id: existing.id,
  ownerId: existing.ownerId,
  createdAt: existing.createdAt,
});

const unit1 = merged.revisions.find((revision) => revision.id === "revision_unidad_1")?.files?.[0];
const unit2 = merged.revisions.find((revision) => revision.id === "revision_unidad_2")?.files?.[0];

assert.equal(unit1?.analysisStatus, "completed", "El merge no debe degradar Unidad 1 a idle con un snapshot viejo.");
assert.equal(unit1?.resultSummary?.pageCount, 1, "El merge debe conservar el resultado ya renderizable de Unidad 1.");
assert.equal(unit1?.result?.stats?.documentName, "EEFESPPRI_10REV_TRIM1_P4_LA_01_L1.idml");
assert.equal(unit2?.analysisStatus, "completed", "El merge debe aceptar el resultado nuevo de Unidad 2.");
assert.equal(unit2?.result?.stats?.documentName, "EEFESPPRI_10REV_TRIM1_P4_LA_02_L2.idml");

const clearIncoming = structuredClone(existing);
clearIncoming.revisions[0].files[0].analysisStatus = "idle";
clearIncoming.revisions[0].files[0].updatedAt = "2026-07-08T10:08:00.000Z";
clearIncoming.revisions[0].files[0].resultSummary = {
  paginationIssueCount: 0,
  sectionIssueCount: 0,
  spellingIssueCount: 0,
  orthotypographyIssueCount: 0,
  colorIssueCount: 0,
  recortableIssueCount: 0,
  pageCount: 0,
  analyzedAt: "",
};
clearIncoming.revisions[0].files[0].result = emptyResult;

const cleared = mergeAnalizarPdfSessionPreservingFreshFileResults(existing, clearIncoming, {
  id: existing.id,
  ownerId: existing.ownerId,
  createdAt: existing.createdAt,
});
const clearedUnit1 = cleared.revisions.find((revision) => revision.id === "revision_unidad_1")?.files?.[0];
assert.equal(clearedUnit1?.analysisStatus, "idle", "Un borrado intencional con updatedAt nuevo debe poder limpiar el análisis.");
assert.equal(clearedUnit1?.resultSummary?.pageCount, 0);
