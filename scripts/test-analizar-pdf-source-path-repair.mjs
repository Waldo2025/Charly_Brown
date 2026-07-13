import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildAnalysisTargetsForAll } from "../public/analizarPDF/analizar-pdf-session-logic.js";

const require = createRequire(import.meta.url);
const {
  findAnalizarPdfLocalSourceByName,
  repairAnalizarPdfSessionSourceAssetPaths,
  resolveStableAnalizarPdfSourcePath,
} = require("../backend/analizar-pdf.js");

const sessionId = `analizar_pdf_test_${Date.now()}`;
const revisionWithStableId = "revision_stable";
const revisionWithStaleId = "revision_stale";
const stableFileId = "file_stable";
const staleFileId = "file_stale";
const recoveredRevisionId = "revision_recovered";
const recoveredFileId = "file_recovered";
const recoveredDocumentName = "unidad-2-recuperada.idml";
const stablePath = resolveStableAnalizarPdfSourcePath(sessionId, revisionWithStableId, stableFileId, "idml");
const recoveredStablePath = resolveStableAnalizarPdfSourcePath(sessionId, recoveredRevisionId, recoveredFileId, "idml");
const stalePath = path.join(os.tmpdir(), `missing-analizar-pdf-source-${Date.now()}.idml`);
const localSourceRoot = path.join(os.tmpdir(), `analizar-pdf-local-source-root-${Date.now()}`);
const previousLocalSourceRoots = process.env.ANALIZAR_PDF_LOCAL_SOURCE_ROOTS;

fs.mkdirSync(path.dirname(stablePath), { recursive: true });
fs.writeFileSync(stablePath, "fixture", "utf8");
fs.mkdirSync(path.join(localSourceRoot, "nested"), { recursive: true });
const recoveredLocalPath = path.join(localSourceRoot, "nested", recoveredDocumentName);
fs.writeFileSync(recoveredLocalPath, "recovered fixture", "utf8");
process.env.ANALIZAR_PDF_LOCAL_SOURCE_ROOTS = localSourceRoot;

try {
  assert.equal(findAnalizarPdfLocalSourceByName(recoveredDocumentName, "idml"), recoveredLocalPath);

  const repaired = repairAnalizarPdfSessionSourceAssetPaths({
    id: sessionId,
    ownerId: "owner",
    sourceType: "idml",
    revisions: [
      {
        id: revisionWithStableId,
        title: "Proyecto",
        files: [
          {
            id: stableFileId,
            sourceType: "idml",
            documentName: "proyecto.idml",
            fileKey: "proyecto.idml",
            sourceAssetPath: stalePath,
            analysisStatus: "queued",
          },
        ],
      },
      {
        id: revisionWithStaleId,
        title: "Unidad 1",
        files: [
          {
            id: staleFileId,
            sourceType: "idml",
            documentName: "unidad-1.idml",
            fileKey: "unidad-1.idml",
            sourceAssetPath: stalePath,
            analysisStatus: "processing",
            analysisJobId: "job_stale",
          },
        ],
      },
      {
        id: recoveredRevisionId,
        title: "Unidad 2",
        files: [
          {
            id: recoveredFileId,
            sourceType: "idml",
            documentName: recoveredDocumentName,
            fileKey: recoveredDocumentName,
            sourceAssetPath: "",
            analysisStatus: "failed",
            analysisJobId: "job_failed",
          },
        ],
      },
    ],
  });

  const stableFile = repaired.revisions[0].files[0];
  const staleFile = repaired.revisions[1].files[0];
  const recoveredFile = repaired.revisions[2].files[0];

  assert.equal(stableFile.sourceAssetPath, stablePath);
  assert.equal(staleFile.sourceAssetPath, "");
  assert.equal(staleFile.analysisStatus, "idle");
  assert.equal(staleFile.analysisJobId, "");
  assert.equal(recoveredFile.sourceAssetPath, recoveredStablePath);
  assert.equal(recoveredFile.analysisStatus, "idle");
  assert.equal(recoveredFile.analysisJobId, "");
  assert.equal(fs.readFileSync(recoveredStablePath, "utf8"), "recovered fixture");
  assert.equal(repaired.__sourceAssetPathsRepaired, true);

  const targets = await buildAnalysisTargetsForAll({
    session: repaired,
    resolveCachedFileForEntry: async () => null,
    selectedFiles: [],
  });

  assert.deepEqual(
    targets.map((entry) => ({
      revisionId: entry.revision.id,
      fileId: entry.targetFile.id,
      useStoredSource: entry.useStoredSource === true,
    })),
    [
      { revisionId: revisionWithStableId, fileId: stableFileId, useStoredSource: true },
      { revisionId: recoveredRevisionId, fileId: recoveredFileId, useStoredSource: true },
    ]
  );
} finally {
  if (previousLocalSourceRoots === undefined) {
    delete process.env.ANALIZAR_PDF_LOCAL_SOURCE_ROOTS;
  } else {
    process.env.ANALIZAR_PDF_LOCAL_SOURCE_ROOTS = previousLocalSourceRoots;
  }
  fs.rmSync(path.join(os.tmpdir(), "analizar-pdf-sources", sessionId), { recursive: true, force: true });
  fs.rmSync(localSourceRoot, { recursive: true, force: true });
}

console.log("Analizar PDF source path repair OK.");
