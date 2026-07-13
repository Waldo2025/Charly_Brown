import assert from "node:assert/strict";
import fs from "node:fs/promises";

const logicModulePath = new URL("../public/analizarPDF/analizar-pdf-session-logic.js", import.meta.url);
const recortablesModulePath = new URL("../public/analizarPDF/analizar-pdf-recortables.js", import.meta.url);
const appModulePath = new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url);

let logicImportFailed = null;
let logic = null;
let recortablesImportFailed = null;
let recortables = null;
try {
  logic = await import(logicModulePath.href);
} catch (error) {
  logicImportFailed = error;
}
try {
  recortables = await import(recortablesModulePath.href);
} catch (error) {
  recortablesImportFailed = error;
}

assert.equal(
  logicImportFailed,
  null,
  `La lógica compartida de multi-ficha debe existir para cubrir la regresión: ${logicImportFailed?.message || "missing module"}`
);
assert.equal(
  recortablesImportFailed,
  null,
  `La vista de recortables debe ser importable para cubrir el estado pendiente: ${recortablesImportFailed?.message || "missing module"}`
);

const {
  buildAnalysisTargetsForAll,
  documentNameMatchesRevision,
  ensureActivePointers,
  getEffectiveRecortableRole,
  hasRenderableAnalysis,
  inferUnidadFromDocumentName,
  mergeRenderableFileResults,
  prioritizeRevisionsForRecortablesDestinations,
  shouldShowRecortableRole,
  upsertRevisionInSession,
} = logic;
const { renderRecortableMetaList } = recortables;
const logicSource = await fs.readFile(logicModulePath, "utf8");

function createBaseSession() {
  return {
    id: "session_1",
    title: "Primaria · Tercero · Trimestre 1 · 1ra",
    sourceType: "pdf",
    bibliographicInfo: {
      bookType: "LA",
      nivel: "Primaria",
      grado: "Tercero",
      trimestre: "Trimestre 1",
      unidad: "Unidad 1",
      edicionNumero: "1ra",
      revisionNumero: "F1",
    },
    revisions: [
      {
        id: "rev_a",
        revisionKey: "unidad 1|f1",
        title: "Unidad 1 · F1",
        unidad: "Unidad 1",
        revisionNumero: "F1",
        mappingId: "map_1",
        mappingTitle: "Mapeo 1",
        mappingUpdatedAt: "2026-07-06T00:00:00.000Z",
        files: [
          {
            id: "file_a",
            fileKey: "alpha.pdf",
            documentName: "alpha.pdf",
            sourceType: "pdf",
            hasLocalSource: true,
            localBlobKey: "blob_a",
            result: { stats: { pageReports: [{ pageName: "1" }] } },
            resultSummary: { pageCount: 1 },
          },
        ],
      },
      {
        id: "rev_b",
        revisionKey: "unidad 2|f1",
        title: "Unidad 2 · F1",
        unidad: "Unidad 2",
        revisionNumero: "F1",
        mappingId: "map_2",
        mappingTitle: "Mapeo 2",
        mappingUpdatedAt: "2026-07-06T00:00:00.000Z",
        files: [
          {
            id: "file_b",
            fileKey: "beta.pdf",
            documentName: "beta.pdf",
            sourceType: "pdf",
            hasLocalSource: true,
            localBlobKey: "blob_b",
            result: { stats: { pageReports: [{ pageName: "2" }] } },
            resultSummary: { pageCount: 1 },
          },
        ],
      },
    ],
  };
}

{
  assert.equal(shouldShowRecortableRole("Recortables"), true);
  assert.equal(shouldShowRecortableRole("Unidad 3"), false);
  assert.equal(
    getEffectiveRecortableRole({ unidad: "Recortables", recortableRole: "" }),
    "source",
    "Las fichas Recortables sin rol guardado deben iniciar con Fuente por default."
  );
}

{
  const session = createBaseSession();
  const { session: nextSession, revision } = upsertRevisionInSession({
    session,
    activeRevisionId: "rev_b",
    revisionInfo: {
      unidad: "Unidad 1",
      revisionNumero: "F1",
    },
    filesToMerge: [{ name: "gamma.pdf", sourceType: "pdf" }],
    defaultMapping: {
      id: "map_2",
      title: "Mapeo 2",
      updatedAt: "2026-07-06T00:00:00.000Z",
    },
    nowIso: () => "2026-07-06T00:00:00.000Z",
    createRevisionId: () => "rev_new_should_not_be_used",
    createFileId: () => "file_gamma",
  });

  assert.equal(revision.id, "rev_b", "La revisión activa debe seguir siendo la identidad fuente aunque coincida el revisionKey de otra ficha.");
  assert.equal(nextSession.revisions.length, 2, "No debe fusionar ni eliminar otras fichas al editar la revisión activa.");
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_b")?.files?.length,
    1,
    "La ficha activa debe reemplazar el archivo anterior en vez de acumular versiones."
  );
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_b")?.files?.[0]?.documentName,
    "gamma.pdf",
    "El archivo vigente debe ser el último seleccionado para esa ficha."
  );
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_b")?.recortableRole,
    undefined,
    "Las unidades no recortables no deben persistir recortableRole."
  );
}

{
  assert.equal(inferUnidadFromDocumentName("EEFESPPRI_10REV_TRIM1_P4_LA_00_UP.idml"), "Proyecto");
  assert.equal(inferUnidadFromDocumentName("EEFESPPRI_10REV_TRIM1_P4_LA_03_L3.idml"), "Unidad 3");
  assert.equal(inferUnidadFromDocumentName("EEFESPPRI_10REV_TRIM1_P4_LA_08_COMP_LEC.idml"), "Lecturas");
  assert.equal(inferUnidadFromDocumentName("EEFESPPRI_10REV_TRIM1_P4_LA_09_REC.idml"), "Recortables");
  assert.equal(
    documentNameMatchesRevision("EEFESPPRI_10REV_TRIM1_P4_LA_06_L6.idml", { unidad: "Unidad 3" }),
    false,
    "Un archivo L6 no debe adjuntarse a Unidad 3."
  );
  assert.equal(
    documentNameMatchesRevision("EEFESPPRI_10REV_TRIM1_P4_LA_02_L2.idml", { unidad: "Proyecto" }),
    false,
    "Un archivo L2 no debe adjuntarse a Proyecto."
  );
}

{
  const session = createBaseSession();
  const { session: nextSession, addedFiles } = upsertRevisionInSession({
    session,
    activeRevisionId: "rev_b",
    revisionInfo: {
      unidad: "Unidad 2",
      revisionNumero: "F1",
    },
    filesToMerge: [{ name: "EEFESPPRI_10REV_TRIM1_P4_LA_09_REC.idml", sourceType: "idml" }],
    defaultMapping: {
      id: "map_2",
      title: "Mapeo 2",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
    nowIso: () => "2026-07-08T00:00:00.000Z",
    createFileId: () => "file_rec_misassigned",
  });

  assert.equal(addedFiles.length, 0, "Una unidad normal no debe recibir automáticamente un IDML REC.");
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_b")?.files?.some((file) => /_REC\\.idml$/i.test(file.documentName || "")),
    false,
    "El archivo REC no debe quedar duplicado en unidades normales."
  );

  session.revisions.push({
    id: "rev_rec",
    revisionKey: "recortables|f1",
    title: "Recortables · F1",
    unidad: "Recortables",
    revisionNumero: "F1",
    recortableRole: "destination",
    mappingId: "map_rec",
    mappingTitle: "Recortables",
    mappingUpdatedAt: "2026-07-08T00:00:00.000Z",
    files: [],
  });
  const { session: recSession, addedFiles: recAddedFiles } = upsertRevisionInSession({
    session,
    activeRevisionId: "rev_rec",
    revisionInfo: {
      unidad: "Recortables",
      revisionNumero: "F1",
      recortableRole: "destination",
    },
    filesToMerge: [{ name: "EEFESPPRI_10REV_TRIM1_P4_LA_09_REC.idml", sourceType: "idml" }],
    defaultMapping: {
      id: "map_rec",
      title: "Recortables",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
    nowIso: () => "2026-07-08T00:00:00.000Z",
    createFileId: () => "file_rec_destination",
  });

  assert.equal(recAddedFiles.length, 1, "La ficha Recortables destino sí debe recibir el IDML REC.");
  assert.equal(
    recSession.revisions.find((entry) => entry.id === "rev_rec")?.files?.[0]?.documentName,
    "EEFESPPRI_10REV_TRIM1_P4_LA_09_REC.idml",
    "El IDML REC debe quedar asociado a la ficha declarada como Recortables."
  );
}

{
  const session = createBaseSession();
  session.bibliographicInfo.unidad = "Recortables";
  session.bibliographicInfo.revisionNumero = "F-Buffer";
  session.bibliographicInfo.recortableRole = "destination";
  session.revisions = [
    {
      id: "rev_source",
      revisionKey: "recortables|f1",
      title: "Recortables · F1",
      unidad: "Recortables",
      revisionNumero: "F1",
      recortableRole: "source",
      files: [],
    },
    {
      id: "rev_other",
      revisionKey: "recortables|f2",
      title: "Recortables · F2",
      unidad: "Recortables",
      revisionNumero: "F2",
      recortableRole: "destination",
      files: [],
    },
  ];

  const { session: nextSession, revision } = upsertRevisionInSession({
    session,
    activeRevisionId: "rev_source",
    revisionInfo: {
      unidad: "Recortables",
      revisionNumero: "F1-Editada",
      recortableRole: "source",
    },
    filesToMerge: [],
    nowIso: () => "2026-07-07T00:00:00.000Z",
  });

  assert.equal(revision.id, "rev_source", "La ficha activa debe seguir actualizándose por id.");
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_source")?.revisionNumero,
    "F1-Editada",
    "La ficha activa debe conservar su revisión editada."
  );
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_source")?.recortableRole,
    "source",
    "La ficha activa debe conservar su rol recortable propio."
  );
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_other")?.revisionNumero,
    "F2",
    "Editar una ficha no debe reescribir la revisión de las demás fichas."
  );
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_other")?.recortableRole,
    "destination",
    "Editar una ficha no debe contaminar el rol recortable de las demás fichas."
  );
}

{
  const session = createBaseSession();
  session.revisions = [
    {
      id: "unidad_3",
      revisionKey: "unidad 3|f1",
      title: "Unidad 3 · F1",
      unidad: "Unidad 3",
      revisionNumero: "F1",
      files: [
        {
          id: "file_unidad_3",
          fileKey: "unidad3.idml",
          documentName: "unidad3.idml",
          sourceType: "idml",
          hasLocalSource: true,
          localBlobKey: "blob_unidad_3",
          result: { stats: { pageReports: [{ pageName: "8" }] } },
          resultSummary: { pageCount: 1 },
        },
      ],
    },
    {
      id: "rev_rec",
      revisionKey: "recortables|f1",
      title: "Recortables · F1",
      unidad: "Recortables",
      revisionNumero: "F1",
      recortableRole: "destination",
      files: [
        {
          id: "file_rec",
          fileKey: "recortables.idml",
          documentName: "recortables.idml",
          sourceType: "idml",
          hasLocalSource: true,
          localBlobKey: "blob_rec",
          result: { stats: { pageReports: [{ pageName: "31" }] } },
          resultSummary: { pageCount: 1 },
        },
      ],
    },
  ];
  const targets = await buildAnalysisTargetsForAll({
    session,
    activeRevisionId: "unidad_3",
    selectedFiles: [],
    resolveCachedFileForEntry: async (file) => ({ name: file.documentName, cacheHit: true }),
    buildFileKey: (value = "") => String(value || "").trim().toLowerCase(),
  });

  assert.deepEqual(
    targets.map((entry) => entry.revision.id),
    ["unidad_3", "rev_rec"],
    "Una ficha Recortables destino debe analizarse al final para consolidar coincidencias contra las unidades origen."
  );
}

{
  const session = createBaseSession();
  const { session: nextSession, revision } = upsertRevisionInSession({
    session,
    activeRevisionId: "rev_b",
    revisionInfo: {
      unidad: "Recortables",
      revisionNumero: "F1",
      recortableRole: "both",
    },
    filesToMerge: [],
    defaultMapping: {
      id: "map_2",
      title: "Mapeo 2",
      updatedAt: "2026-07-06T00:00:00.000Z",
    },
    nowIso: () => "2026-07-06T00:00:00.000Z",
  });

  assert.equal(revision.id, "rev_b");
  assert.equal(
    nextSession.revisions.find((entry) => entry.id === "rev_b")?.recortableRole,
    "both",
    "La revisión activa debe persistir recortableRole cuando la unidad es Recortables."
  );
}

{
  const prioritized = prioritizeRevisionsForRecortablesDestinations([
    { id: "unidad_3", unidad: "Unidad 3" },
    { id: "rec_a", unidad: "Recortables", recortableRole: "destination" },
    { id: "rec_b", unidad: "Recortables", recortableRole: "both" },
  ]);
  assert.deepEqual(
    prioritized.map((entry) => entry.id),
    ["unidad_3", "rec_a", "rec_b"],
    "Las fichas Recortables con destino deben moverse al final manteniendo su orden relativo."
  );
}

{
  const session = createBaseSession();
  const selectedFiles = [{ name: "alpha.pdf" }];
  const cachedByFileId = new Map([
    ["file_b", { name: "beta.pdf", cacheHit: true }],
  ]);
  const targets = await buildAnalysisTargetsForAll({
    session,
    activeRevisionId: "rev_a",
    selectedFiles,
    resolveCachedFileForEntry: async (file) => cachedByFileId.get(file.id) || null,
    buildFileKey: (value = "") => String(value || "").trim().toLowerCase(),
  });

  assert.deepEqual(
    targets.map((entry) => ({
      revisionId: entry.revision.id,
      fileId: entry.targetFile.id,
      fileName: entry.selectedFile.name,
    })),
    [
      { revisionId: "rev_a", fileId: "file_a", fileName: "alpha.pdf" },
      { revisionId: "rev_b", fileId: "file_b", fileName: "beta.pdf" },
    ],
    "El análisis completo debe incluir la ficha activa con su selección temporal y las demás fichas con su archivo persistido."
  );
}

{
  const session = createBaseSession();
  const selectedFiles = [{ name: "beta.pdf" }];
  const targets = await buildAnalysisTargetsForAll({
    session,
    activeRevisionId: "rev_a",
    selectedFiles,
    resolveCachedFileForEntry: async () => null,
    buildFileKey: (value = "") => String(value || "").trim().toLowerCase(),
  });

  assert.deepEqual(
    targets.map((entry) => ({
      revisionId: entry.revision.id,
      fileId: entry.targetFile.id,
      fileName: entry.selectedFile.name,
    })),
    [
      { revisionId: "rev_b", fileId: "file_b", fileName: "beta.pdf" },
    ],
    "El análisis completo debe emparejar archivos seleccionados con cualquier ficha, no solo con la activa."
  );
}

{
  const session = createBaseSession();
  session.revisions[0].files[0].hasLocalSource = false;
  session.revisions[0].files[0].localBlobKey = "";
  session.revisions[0].files[0].sourceAssetPath = "/tmp/analizar-pdf-sources/session_1/rev_a/file_a.pdf";
  const targets = await buildAnalysisTargetsForAll({
    session,
    activeRevisionId: "rev_a",
    selectedFiles: [],
    resolveCachedFileForEntry: async () => null,
    buildFileKey: (value = "") => String(value || "").trim().toLowerCase(),
  });

  assert.deepEqual(
    targets.map((entry) => ({
      revisionId: entry.revision.id,
      fileId: entry.targetFile.id,
      useStoredSource: entry.useStoredSource === true,
    })),
    [
      { revisionId: "rev_a", fileId: "file_a", useStoredSource: true },
    ],
    "El análisis completo debe usar la fuente guardada en servidor cuando ya no existe cache local para una ficha."
  );
}

{
  const session = createBaseSession();
  const pointers = ensureActivePointers(session, "rev_b", "file_b");
  assert.deepEqual(
    pointers,
    { activeRevisionId: "rev_b", activeFileId: "file_b" },
    "Si la revisión y archivo siguen existiendo tras polling, deben conservarse."
  );

  const fallbackPointers = ensureActivePointers(session, "rev_missing", "file_missing");
  assert.deepEqual(
    fallbackPointers,
    { activeRevisionId: "rev_a", activeFileId: "file_a" },
    "Si el puntero activo desaparece, el fallback debe resolverse de forma controlada a la primera ficha válida."
  );
}

{
  const merged = mergeRenderableFileResults({
    activeEntry: {
      revisionId: "rev_old",
      fileId: "file_old",
      revisionIndex: 1,
      fileIndex: 0,
      fileTitle: "old.idml",
      revisionTitle: "Unidad 1",
      analysisStatus: "completed",
      result: { stats: { pageReports: [{ pageName: "10" }] } },
      resultSummary: { pageCount: 1 },
    },
    fallbackEntries: [
      {
        revisionId: "rev_old",
        fileId: "file_old",
        revisionIndex: 1,
        fileIndex: 0,
        fileTitle: "old.idml",
        revisionTitle: "Unidad 1",
        analysisStatus: "completed",
        result: { stats: { pageReports: [{ pageName: "2" }] } },
        resultSummary: { pageCount: 1 },
      },
      {
        revisionId: "rev_active",
        fileId: "file_active",
        revisionIndex: 0,
        fileIndex: 0,
        fileTitle: "active.idml",
        revisionTitle: "Proyecto",
        analysisStatus: "completed",
        result: { stats: { pageReports: [{ pageName: "1" }] } },
        resultSummary: { pageCount: 1 },
      },
    ],
  });

  assert.deepEqual(
    merged.map((entry) => `${entry.revisionId}:${entry.fileId}`),
    ["rev_active:file_active", "rev_old:file_old"],
    "El rail debe respetar el orden de fichas editoriales y no anteponer la ficha activa fuera de ese orden."
  );
}

{
  const session = createBaseSession();
  const fallbackTargets = await buildAnalysisTargetsForAll({
    session,
    activeRevisionId: "rev_a",
    selectedFiles: [{ name: "archivo-que-no-corresponde.idml" }],
    resolveCachedFileForEntry: async (file) => file.id === "file_a" ? { name: "alpha.pdf", cacheHit: true } : null,
    buildFileKey: (value = "") => String(value || "").trim().toLowerCase(),
  });

  assert.deepEqual(
    fallbackTargets.map((entry) => ({
      revisionId: entry.revision.id,
      fileId: entry.targetFile.id,
      fileName: entry.selectedFile?.name || "",
    })),
    [
      { revisionId: "rev_a", fileId: "file_a", fileName: "alpha.pdf" },
    ],
    "Cuando la selección temporal no coincide, el análisis debe seguir pudiendo resolver el archivo persistido de la ficha correspondiente."
  );
}

{
  const html = renderRecortableMetaList({
    pageName: "12",
    recortableSummary: {
      pendingDestinations: [{ code: "Recortable PcT1", destinationLabel: "pendiente" }],
    },
    recortableIssues: [{ severity: "pending", message: "Recortable PcT1: destino pendiente." }],
  });

  assert.match(html, /Pendiente/);
  assert.match(html, /PcT1/);
}

{
  const appSource = await fs.readFile(appModulePath, "utf8");
  assert.doesNotMatch(
    appSource,
    /activeFileResult[\s\S]*?resultSummary:\s*file\.resultSummary\s*\|\|\s*session\.resultSummary[\s\S]*?fallbackFileResults/s,
    "El rail no debe tratar una ficha activa sin análisis como si estuviera analizada por heredar el resultSummary de otra ficha."
  );
  assert.doesNotMatch(
    appSource,
    /activeFileResult[\s\S]*?analysisStatus:\s*file\.analysisStatus\s*\|\|\s*session\.analysisStatus[\s\S]*?fallbackFileResults/s,
    "El rail no debe heredar analysisStatus desde la sesión para un archivo distinto."
  );
  assert.match(
    appSource,
    /const targetRevisionId = String\(state\.activeRevisionId \|\| ""\)\.trim\(\)/,
    "La persistencia de archivos debe fijar la revisión objetivo al inicio para evitar contaminar otra ficha si el usuario cambia de selección durante el guardado."
  );
  assert.match(
    appSource,
    /if \(state\.isRehydratingFileSelection\) \{\s*return;\s*\}/,
    "La rehidratación programática del input no debe disparar persistencia cruzada."
  );
  const runAnalysisForTargetsSource = appSource.match(/async function runAnalysisForTargets[\s\S]*?\n}\n\nfunction syncFileInputForSession/)?.[0] || "";
  assert.ok(runAnalysisForTargetsSource, "Debe existir runAnalysisForTargets para validar el contrato de análisis múltiple.");
  assert.doesNotMatch(
    runAnalysisForTargetsSource,
    /persistActiveSession\(\[\]\)/,
    "Analizar todo no debe llamar persistActiveSession([]) dentro del loop: ese metodo re-ejecuta upsert/normalizacion de la ficha activa y puede sustituir resultados de otras fichas."
  );
  assert.match(
    runAnalysisForTargetsSource,
    /saveActiveSessionSnapshot\(\)/,
    "Analizar todo debe guardar snapshots planos por target sin recalcular la ficha activa."
  );
}

{
  const resultsSource = await fs.readFile(
    "/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js",
    "utf8"
  );
  assert.doesNotMatch(
    resultsSource,
    /collapseEntriesByRevision|getRevisionScopedEntryKey|choosePreferredRevisionEntry/,
    "El rail no debe conservar utilidades que colapsen entradas por ficha y sustituyan analisis de archivos distintos."
  );
  assert.match(
    resultsSource,
    /const fileGroupKey = \[[\s\S]*String\(entry\?\.revisionId[\s\S]*String\(entry\?\.fileId/,
    "Cada grupo renderizado en el rail debe estar identificado por revisionId y fileId."
  );
  assert.match(
    logicSource,
    /return `\$\{revisionId\}::\$\{fileId\}`;/,
    "La fusion de resultados renderizables debe sustituir solo el mismo revisionId::fileId."
  );
}

{
  assert.equal(
    hasRenderableAnalysis({
      analysisStatus: "idle",
      resultSummary: {
        paginationIssueCount: 0,
        sectionIssueCount: 0,
        spellingIssueCount: 0,
        orthotypographyIssueCount: 0,
        colorIssueCount: 0,
        recortableIssueCount: 0,
        pageCount: 0,
        analyzedAt: "",
      },
      result: { stats: null },
    }),
    false,
    "Una ficha con resultSummary vacío por default no debe aparecer como acceso rápido analizado."
  );

  assert.equal(
    hasRenderableAnalysis({
      analysisStatus: "completed",
      resultSummary: {
        paginationIssueCount: 0,
        sectionIssueCount: 0,
        spellingIssueCount: 0,
        orthotypographyIssueCount: 0,
        colorIssueCount: 0,
        recortableIssueCount: 0,
        pageCount: 12,
        analyzedAt: "2026-07-07T00:00:00.000Z",
      },
      result: { stats: { pageReports: [{ pageName: "1" }] } },
    }),
    true,
    "Una ficha realmente analizada sí debe seguir apareciendo en el rail."
  );
}

{
  const merged = mergeRenderableFileResults({
    activeEntry: {
      revisionId: "rev_active",
      fileId: "file_active",
      fileTitle: "active.idml",
      revisionTitle: "Proyecto",
      analysisStatus: "idle",
      result: { stats: null },
      resultSummary: {
        paginationIssueCount: 0,
        sectionIssueCount: 0,
        spellingIssueCount: 0,
        orthotypographyIssueCount: 0,
        colorIssueCount: 0,
        recortableIssueCount: 0,
        pageCount: 0,
        analyzedAt: "",
      },
    },
    fallbackEntries: [],
  });

  assert.deepEqual(
    merged,
    [],
    "Una ficha activa limpiada no debe reconstruir el rail por el simple fallback de objetos vacíos."
  );
}

console.log("Analizar PDF multi-revision regression OK.");
