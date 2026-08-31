function buildEmptyResult() {
  return {
    paginationIssues: [],
    sectionIssues: [],
    spellingIssues: [],
    orthotypographyIssues: [],
    colorIssues: [],
    recortableIssues: [],
    stats: null,
  };
}

function buildEmptyResultSummary() {
  return {
    paginationIssueCount: 0,
    sectionIssueCount: 0,
    spellingIssueCount: 0,
    orthotypographyIssueCount: 0,
    colorIssueCount: 0,
    recortableIssueCount: 0,
    pageCount: 0,
    analyzedAt: "",
  };
}

function buildEmptyRevisionSummary() {
  return {
    paginationIssueCount: 0,
    sectionIssueCount: 0,
    spellingIssueCount: 0,
    orthotypographyIssueCount: 0,
    colorIssueCount: 0,
    recortableIssueCount: 0,
  };
}

export function normalizeUnidad(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function normalizeRecortableRole(value = "", unidad = "") {
  if (normalizeUnidad(unidad) !== "recortables") {
    return "";
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "source" || normalized === "destination" || normalized === "both") {
    return normalized;
  }
  return "source";
}

export function shouldShowRecortableRole(unidad = "") {
  return normalizeUnidad(unidad) === "recortables";
}

function looksLikeRecortableDocumentName(value = "") {
  const name = String(value || "").trim();
  if (!name) return false;
  return /(?:^|[_\-\s])REC(?:[_\-\s.]|$)/i.test(name) || /recortable/i.test(name);
}

export function inferUnidadFromDocumentName(value = "") {
  const name = String(value || "").trim();
  if (!name) return "";
  if (/(?:^|[_\-\s])(?:00[_\-\s]?)?INTRO(?:[_\-\s.]|$)/i.test(name)) {
    return "Intro";
  }
  if (looksLikeRecortableDocumentName(name)) {
    return "Recortables";
  }
  if (/(?:^|[_\-\s])(?:COMP[_\-\s]?)?LEC(?:[_\-\s.]|$)/i.test(name)) {
    return "Lecturas";
  }
  if (/(?:^|[_\-\s])(?:00[_\-\s]?)?(?:UP|PROYECTO)(?:[_\-\s.]|$)/i.test(name)) {
    return "Proyecto";
  }
  const lessonMatch = name.match(/(?:^|[_\-\s])(?:0?(\d{1,2})[_\-\s]?(?:U|L)\1|(?:U|L)0?(\d{1,2}))(?:[_\-\s.]|$)/i);
  if (lessonMatch) {
    return `Unidad ${Number(lessonMatch[1] || lessonMatch[2])}`;
  }
  return "";
}

export function documentNameMatchesRevision(documentName = "", revision = {}) {
  const inferredUnidad = inferUnidadFromDocumentName(documentName);
  if (!inferredUnidad) {
    return true;
  }
  return normalizeUnidad(inferredUnidad) === normalizeUnidad(revision?.unidad || "");
}

function shouldAttachFileToRevision(documentName = "", revision = {}) {
  if (!documentNameMatchesRevision(documentName, revision)) {
    return false;
  }
  if (!looksLikeRecortableDocumentName(documentName)) {
    return true;
  }
  return shouldShowRecortableRole(revision?.unidad || "");
}

export function getEffectiveRecortableRole(revision = {}) {
  return normalizeRecortableRole(revision?.recortableRole, revision?.unidad);
}

export function recortableRoleSupportsDestination(revision = {}) {
  const role = getEffectiveRecortableRole(revision);
  return role === "destination" || role === "both";
}

export function prioritizeRevisionsForRecortablesDestinations(revisions = [], options = {}) {
  const excludedRevisionIds = new Set(
    Array.isArray(options?.excludeRevisionIds)
      ? options.excludeRevisionIds.map((value) => String(value || "").trim()).filter(Boolean)
      : []
  );
  const destinationRecortables = [];
  const remaining = [];
  for (const revision of revisions) {
    const revisionId = String(revision?.id || "").trim();
    if (excludedRevisionIds.has(revisionId)) {
      remaining.push(revision);
      continue;
    }
    if (recortableRoleSupportsDestination(revision)) {
      destinationRecortables.push(revision);
      continue;
    }
    remaining.push(revision);
  }
  return [...remaining, ...destinationRecortables];
}

export function ensureActivePointers(session = null, preferredRevisionId = "", preferredFileId = "") {
  const revisions = Array.isArray(session?.revisions) ? session.revisions : [];
  const preferredRevision = revisions.find((entry) => String(entry?.id || "").trim() === String(preferredRevisionId || "").trim()) || null;
  const fallbackRevision = preferredRevision || revisions[0] || null;
  const files = Array.isArray(fallbackRevision?.files) ? fallbackRevision.files : [];
  const preferredFile = files.find((entry) => String(entry?.id || "").trim() === String(preferredFileId || "").trim()) || null;
  const fallbackFile = preferredFile || files[0] || null;
  return {
    activeRevisionId: String(fallbackRevision?.id || "").trim(),
    activeFileId: String(fallbackFile?.id || "").trim(),
  };
}

export async function buildAnalysisTargetsForAll({
  session = null,
  activeRevisionId = "",
  selectedFiles = [],
  selectedRevisionIds = null,
  resolveCachedFileForEntry = async () => null,
  buildFileKey = (value = "") => String(value || "").trim().toLowerCase(),
} = {}) {
  // Conserva el orden visual dentro de cada fase, pero resuelve destinos antes de fuentes.
  const revisions = Array.isArray(session?.revisions) ? [...session.revisions] : [];
  const selectedFilesByKey = new Map();
  for (const selectedFile of Array.isArray(selectedFiles) ? selectedFiles.filter(Boolean) : []) {
    const fileKey = buildFileKey(selectedFile?.name || "");
    if (!fileKey || selectedFilesByKey.has(fileKey)) continue;
    selectedFilesByKey.set(fileKey, selectedFile);
  }
  const frozenSelectedRevisionIds = Array.isArray(selectedRevisionIds)
    ? new Set(selectedRevisionIds.map((value) => String(value || "").trim()).filter(Boolean))
    : null;
  const targets = [];
  for (const revision of revisions) {
    const revisionId = String(revision?.id || "").trim();
    if (!revisionId) continue;
    if (frozenSelectedRevisionIds && !frozenSelectedRevisionIds.has(revisionId)) continue;
    const files = (Array.isArray(revision?.files) ? revision.files : []).filter((file) => (
      frozenSelectedRevisionIds ? true : file?.analysisSelected !== false
    ));
    const revisionSelectedFiles = files
      .map((entry) => selectedFilesByKey.get(String(entry?.fileKey || "").trim()) || null)
      .filter(Boolean);
    if (revisionSelectedFiles.length) {
      let matchedSelectedFiles = 0;
      for (const selectedFile of revisionSelectedFiles) {
        const targetFile = files.find((entry) => String(entry?.fileKey || "").trim() === buildFileKey(selectedFile?.name || "")) || null;
        if (!targetFile) continue;
        targets.push({ selectedFile, targetFile, revision });
        matchedSelectedFiles += 1;
      }
      if (matchedSelectedFiles > 0) {
        continue;
      }
    }
    for (const targetFile of files) {
      const cachedFile = await resolveCachedFileForEntry(targetFile);
      if (cachedFile) {
        targets.push({ selectedFile: cachedFile, targetFile, revision });
        continue;
      }
      if (
        String(targetFile?.sourceAssetPath || "").trim()
        || String(targetFile?.sourceStoragePath || "").trim()
        || String(targetFile?.sourceDownloadUrl || "").trim()
      ) {
        targets.push({ selectedFile: null, targetFile, revision, useStoredSource: true });
      }
    }
  }
  const phase = (target) => {
    const role = String(target?.targetFile?.workflowRole || target?.revision?.workflowRole || "source").toLowerCase();
    return role === "destination" ? 0 : role === "both" ? 1 : 2;
  };
  return targets.map((target, index) => ({ target, index })).sort((a, b) => phase(a.target) - phase(b.target) || a.index - b.index).map(({ target }) => target);
}

function defaultRenderableAnalysisPredicate(entry = {}) {
  const summary = entry?.resultSummary && typeof entry.resultSummary === "object" ? entry.resultSummary : {};
  const result = entry?.result && typeof entry.result === "object" ? entry.result : {};
  const pageReports = Array.isArray(entry?.result?.stats?.pageReports) ? entry.result.stats.pageReports.length : 0;
  const status = String(entry?.analysisStatus || "").trim().toLowerCase();
  const issueCount = [
    Number(summary.paginationIssueCount || result?.paginationIssues?.length || 0) || 0,
    Number(summary.sectionIssueCount || result?.sectionIssues?.length || 0) || 0,
    Number(summary.spellingIssueCount || result?.spellingIssues?.length || 0) || 0,
    Number(summary.orthotypographyIssueCount || result?.orthotypographyIssues?.length || 0) || 0,
    Number(summary.colorIssueCount || result?.colorIssues?.length || 0) || 0,
    Number(summary.recortableIssueCount || result?.recortableIssues?.length || 0) || 0,
  ].reduce((acc, value) => acc + value, 0);
  const pageCount = Number(summary.pageCount || entry?.result?.stats?.pageCount || 0) || 0;
  return Boolean(
    pageReports ||
    issueCount > 0 ||
    pageCount > 0 ||
    ["uploading", "queued", "processing"].includes(status)
  );
}

function defaultRenderableEntryKey(entry = {}) {
  const revisionId = String(entry?.revisionId || "").trim();
  const fileId = String(entry?.fileId || "").trim();
  if (revisionId || fileId) {
    return `${revisionId}::${fileId}`;
  }
  return [
    String(entry?.revisionTitle || "").trim().toLowerCase(),
    String(entry?.fileTitle || entry?.documentName || "").trim().toLowerCase(),
  ].join("::");
}

function defaultRenderableEntryOrder(entry = {}) {
  const revisionIndex = Number(entry?.revisionIndex);
  const fileIndex = Number(entry?.fileIndex);
  return [
    Number.isFinite(revisionIndex) ? revisionIndex : Number.MAX_SAFE_INTEGER,
    Number.isFinite(fileIndex) ? fileIndex : Number.MAX_SAFE_INTEGER,
  ];
}

export function mergeRenderableFileResults({
  activeEntry = null,
  fallbackEntries = [],
  hasRenderableAnalysis = defaultRenderableAnalysisPredicate,
  getEntryKey = defaultRenderableEntryKey,
  getEntryOrder = defaultRenderableEntryOrder,
} = {}) {
  const mergedByKey = new Map();
  const anonymous = [];
  const hasRenderableQuickAnalysis = (entry = null) => {
    if (!entry?.quickAnalysis || typeof entry.quickAnalysis !== "object") return false;
    if (Array.isArray(entry.quickAnalysis.pages)) return true;
    return String(entry.quickAnalysis.status || "").trim().toLowerCase() === "completed";
  };
  const appendEntry = (entry = null) => {
    if (!entry || (!hasRenderableAnalysis(entry) && !hasRenderableQuickAnalysis(entry))) return;
    const key = getEntryKey(entry);
    if (!key) {
      anonymous.push(entry);
      return;
    }
    const previous = mergedByKey.get(key) || null;
    if (!previous) {
      mergedByKey.set(key, entry);
      return;
    }
    const nextOrder = getEntryOrder(entry);
    const previousOrder = getEntryOrder(previous);
    const shouldReplace = (
      nextOrder[0] < previousOrder[0]
      || (nextOrder[0] === previousOrder[0] && nextOrder[1] <= previousOrder[1])
    );
    if (shouldReplace) {
      mergedByKey.set(key, entry);
    }
  };
  for (const entry of Array.isArray(fallbackEntries) ? fallbackEntries : []) {
    appendEntry(entry);
  }
  appendEntry(activeEntry);
  return [
    ...[...mergedByKey.values()].sort((left, right) => {
      const [leftRevisionIndex, leftFileIndex] = getEntryOrder(left);
      const [rightRevisionIndex, rightFileIndex] = getEntryOrder(right);
      if (leftRevisionIndex !== rightRevisionIndex) return leftRevisionIndex - rightRevisionIndex;
      return leftFileIndex - rightFileIndex;
    }),
    ...anonymous,
  ];
}

export function hasRenderableAnalysis(entry = {}) {
  return defaultRenderableAnalysisPredicate(entry);
}

export function upsertRevisionInSession({
  session = null,
  activeRevisionId = "",
  revisionInfo = {},
  filesToMerge = [],
  defaultMapping = null,
  getNormalizedSourceType = (value = "") => value,
  buildRevisionKey = (raw = {}) => [
    String(raw?.unidad || "").trim().toLowerCase(),
    String(raw?.revisionNumero || "").trim().toLowerCase(),
  ].filter(Boolean).join("|"),
  buildRevisionTitle = (raw = {}) => [
    String(raw?.unidad || "").trim(),
    String(raw?.revisionNumero || "").trim(),
  ].filter(Boolean).join(" · ") || "Nueva ficha editorial",
  buildFileKey = (value = "") => String(value || "").trim().toLowerCase(),
  buildRevisionSummary = () => buildEmptyRevisionSummary(),
  nowIso = () => new Date().toISOString(),
  createRevisionId = () => `revision_${Date.now()}`,
  createFileId = () => `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
} = {}) {
  const draft = structuredClone(session || {});
  draft.revisions = Array.isArray(draft.revisions) ? draft.revisions : [];
  const normalizedRevisionInfo = {
    unidad: String(revisionInfo?.unidad || "").trim(),
    revisionNumero: String(revisionInfo?.revisionNumero || "").trim(),
    recortableRole: normalizeRecortableRole(revisionInfo?.recortableRole, revisionInfo?.unidad),
  };
  const revisionKey = buildRevisionKey(normalizedRevisionInfo);
  const activeRevision = String(activeRevisionId || "").trim()
    ? draft.revisions.find((entry) => String(entry?.id || "").trim() === String(activeRevisionId || "").trim()) || null
    : null;
  const isActiveDraft = Boolean(activeRevision && String(activeRevision.revisionKey || "").startsWith("__draft__"));
  if (!revisionKey && !isActiveDraft) {
    return { session: draft, revision: null, addedFiles: [], activeFileId: "" };
  }

  const revisionTitle = revisionKey
    ? buildRevisionTitle(normalizedRevisionInfo)
    : String(activeRevision?.title || "Nueva ficha editorial").trim();
  const existingByKey = revisionKey
    ? draft.revisions.find((entry) => String(entry?.revisionKey || "").trim() === revisionKey) || null
    : null;

  let revision = null;
  if (activeRevision) {
    revision = activeRevision;
  } else if (existingByKey) {
    revision = existingByKey;
  }

  if (!revision) {
    revision = {
      id: createRevisionId(),
      revisionKey,
      title: revisionTitle,
      unidad: normalizedRevisionInfo.unidad,
      revisionNumero: normalizedRevisionInfo.revisionNumero,
      recortableRole: normalizedRevisionInfo.recortableRole,
      mappingId: String(defaultMapping?.id || "").trim(),
      mappingTitle: String(defaultMapping?.title || "").trim(),
      mappingUpdatedAt: String(defaultMapping?.updatedAt || "").trim(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      latestAnalysisAt: "",
      fileCount: 0,
      summary: buildEmptyRevisionSummary(),
      files: [],
    };
    draft.revisions.push(revision);
  } else {
    revision.title = revisionTitle;
    if (revisionKey) {
      revision.revisionKey = revisionKey;
      revision.unidad = normalizedRevisionInfo.unidad;
      revision.revisionNumero = normalizedRevisionInfo.revisionNumero;
      revision.recortableRole = normalizedRevisionInfo.recortableRole;
    }
    revision.mappingId = String(revision.mappingId || defaultMapping?.id || "").trim();
    revision.mappingTitle = String(revision.mappingTitle || defaultMapping?.title || "").trim();
    revision.mappingUpdatedAt = String(revision.mappingUpdatedAt || defaultMapping?.updatedAt || "").trim();
    revision.updatedAt = nowIso();
  }

  revision.files = Array.isArray(revision.files) ? revision.files : [];
  const addedFiles = [];
  const matchingCandidates = (Array.isArray(filesToMerge) ? filesToMerge : [])
    .filter((candidate) => {
      const documentName = String(candidate?.name || candidate?.documentName || "").trim();
      return documentName && shouldAttachFileToRevision(documentName, revision);
    });
  const selectedCandidates = matchingCandidates.length
    ? [matchingCandidates[matchingCandidates.length - 1]]
    : [];
  for (const candidate of selectedCandidates) {
    const documentName = String(candidate?.name || candidate?.documentName || "").trim();
    if (!documentName) continue;
    const fileKey = buildFileKey(documentName);
    const existing = revision.files.find((entry) => String(entry?.fileKey || "").trim() === fileKey) || null;
    if (existing) {
      revision.files = [existing];
      existing.documentName = documentName;
      existing.sourceType = getNormalizedSourceType(candidate?.sourceType || draft.sourceType);
      existing.mappingId = String(existing.mappingId || revision.mappingId || defaultMapping?.id || "").trim();
      existing.mappingTitle = String(existing.mappingTitle || revision.mappingTitle || defaultMapping?.title || "").trim();
      existing.mappingUpdatedAt = String(existing.mappingUpdatedAt || revision.mappingUpdatedAt || defaultMapping?.updatedAt || "").trim();
      existing.updatedAt = nowIso();
      addedFiles.push(existing);
      continue;
    }
    const fileEntry = {
      id: createFileId(),
      fileKey,
      documentName,
      mappingId: String(revision.mappingId || defaultMapping?.id || "").trim(),
      mappingTitle: String(revision.mappingTitle || defaultMapping?.title || "").trim(),
      mappingUpdatedAt: String(revision.mappingUpdatedAt || defaultMapping?.updatedAt || "").trim(),
      sourceAssetPath: "",
      localBlobKey: "",
      hasLocalSource: false,
      fileSize: 0,
      fileLastModified: 0,
      fileMimeType: "",
      sourceType: getNormalizedSourceType(candidate?.sourceType || draft.sourceType),
      analysisStatus: "idle",
      analysisJobId: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      resultSummary: buildEmptyResultSummary(),
      result: buildEmptyResult(),
    };
    revision.files = [fileEntry];
    addedFiles.push(fileEntry);
  }

  revision.fileCount = revision.files.length;
  revision.summary = buildRevisionSummary(revision.files);
  if (revisionKey) {
    revision.revisionKey = revisionKey;
    revision.title = revisionTitle;
    revision.unidad = normalizedRevisionInfo.unidad;
    revision.revisionNumero = normalizedRevisionInfo.revisionNumero;
    revision.recortableRole = normalizedRevisionInfo.recortableRole;
  }

  if (!shouldShowRecortableRole(revision.unidad)) {
    delete revision.recortableRole;
  }

  return {
    session: draft,
    revision,
    addedFiles,
    activeFileId: String(addedFiles[addedFiles.length - 1]?.id || revision.files?.[0]?.id || "").trim(),
  };
}
