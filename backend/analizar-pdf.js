"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ALLOWED_ANALYSIS_STATUSES = new Set(["idle", "uploading", "queued", "processing", "completed", "failed", "cancelled"]);
const ALLOWED_STYLE_KINDS = new Set(["paragraph", "character", "swatch"]);
const ANALIZAR_PDF_MAPPING_TOOL_NAME = "Peppermint Patty Editor";
const EMPTY_ANALYSIS_RESULT = Object.freeze({
  paginationIssues: [],
  sectionIssues: [],
  spellingIssues: [],
  orthotypographyIssues: [],
  redactionIssues: [],
  noteIssues: [],
  noteHistoryIssues: [],
  trackedChangeIssues: [],
  customRuleIssues: [],
  colorIssues: [],
  recortableIssues: [],
  stats: null
});

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
  const swatchName = clampText(source.swatchName || source.name || "", 240);
  return {
    id: clampText(source.id || `color_${index + 1}`, 120) || `color_${index + 1}`,
    name: swatchName,
    swatchName,
    cmyk: clampText(source.cmyk || "", 80),
    hex: clampText(source.hex || "", 32)
  };
}

function sanitizeFrameRect(raw = null) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const next = {};
  for (const key of ["x1", "y1", "x2", "y2"]) {
    const value = Number(raw?.[key]);
    if (Number.isFinite(value)) {
      next[key] = value;
    }
  }
  return Object.keys(next).length ? next : null;
}

function sanitizeStringList(items = [], maxItems = 24, maxChars = 240) {
  return (Array.isArray(items) ? items : [])
    .map((item) => clampText(item || "", maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizePageBlockEntry(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return compactAnalizarPdfPayloadValue({
    pageName: clampText(source.pageName || "", 40),
    storyId: clampText(source.storyId || "", 120),
    storyTitle: clampText(source.storyTitle || "", 240),
    styleName: clampText(source.styleName || "", 240),
    blockType: clampText(source.blockType || "", 80),
    blockOrder: Number.isFinite(Number(source.blockOrder)) ? Number(source.blockOrder) : 0,
    text: clampText(source.text || "", 600),
    characterStyles: sanitizeStringList(source.characterStyles, 24, 240),
    swatches: sanitizeStringList(source.swatches, 12, 120),
    textStatus: clampText(source.textStatus || "correcto", 80) || "correcto",
    frameRect: sanitizeFrameRect(source.frameRect),
    fromMaster: source.fromMaster === true,
  }, { preserveKeys: new Set(["pageName", "text"]) });
}

function sanitizePageIssue(raw = {}, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return compactAnalizarPdfPayloadValue({
    pageName: clampText(source.pageName || "", 40),
    storyId: clampText(source.storyId || "", 120),
    storyTitle: clampText(source.storyTitle || "", 240),
    storySource: clampText(source.storySource || "", 240),
    styleName: clampText(source.styleName || "", 240),
    blockType: clampText(source.blockType || "", 80),
    token: clampText(source.token || "", 240),
    excerpt: clampText(source.excerpt || "", 600),
    suggestion: clampText(source.suggestion || "", 600),
    replacements: sanitizeStringList(source.replacements, 12, 240),
    context: clampText(source.context || "", 900),
    message: clampText(source.message || source.reason || "", 900),
    reason: clampText(source.reason || "", 240),
    severity: clampText(source.severity || "", 40),
    code: clampText(source.code || "", 80),
    ruleId: clampText(source.ruleId || "", 120),
    ruleName: clampText(source.ruleName || "", 160),
    mechanism: clampText(source.mechanism || "", 80),
    languageCode: clampText(source.languageCode || "", 20),
    layerId: clampText(source.layerId || "", 120),
    layerName: clampText(source.layerName || "", 240),
    providers: sanitizeStringList(source.providers, 12, 80),
    confidence: Number.isFinite(Number(source.confidence)) ? Math.max(0, Math.min(1, Number(source.confidence))) : undefined,
    origins: sanitizeStringList(source.origins, 24, 80),
    destinations: sanitizeStringList(source.destinations, 24, 80),
    destination: clampText(source.destination || "", 240),
    destinationLabel: clampText(source.destinationLabel || "", 240),
    role: clampText(source.role || "", 40),
    status: clampText(source.status || "", 40),
    linkedFile: clampText(source.linkedFile || "", 240),
    fileTitle: clampText(source.fileTitle || "", 240),
    revisionTitle: clampText(source.revisionTitle || "", 240),
    sourcePageName: clampText(source.sourcePageName || "", 40),
    targetPageName: clampText(source.targetPageName || "", 40),
    includeEmptyMessage: options?.includeEmptyMessage === true ? true : undefined,
  }, { preserveKeys: new Set(["pageName", "message", "severity", "code"]) });
}

function sanitizePageNotes(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => compactAnalizarPdfPayloadValue({
    pageName: clampText(item?.pageName || "", 40),
    storyId: clampText(item?.storyId || "", 120),
    storyTitle: clampText(item?.storyTitle || "", 240),
    text: clampText(item?.text || "", 900),
    userName: clampText(item?.userName || "", 160),
    creationDate: clampText(item?.creationDate || "", 80),
    modificationDate: clampText(item?.modificationDate || "", 80),
    collapsed: item?.collapsed === true,
    changeType: clampText(item?.changeType || "", 80),
  }, { preserveKeys: new Set(["pageName", "text"]) }));
}

function sanitizeRecortableSummary(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return compactAnalizarPdfPayloadValue({
    originCodes: sanitizeStringList(source.originCodes, 24, 120),
    destinationCodes: sanitizeStringList(source.destinationCodes, 24, 120),
    pendingDestinations: (Array.isArray(source.pendingDestinations) ? source.pendingDestinations : []).map((item) => compactAnalizarPdfPayloadValue({
      code: clampText(item?.code || "", 120),
      destination: clampText(item?.destination || "", 120),
      destinationLabel: clampText(item?.destinationLabel || "", 240),
      message: clampText(item?.message || "", 900),
      severity: clampText(item?.severity || "", 40),
      status: clampText(item?.status || "", 40),
    })),
    resolvedDestinations: (Array.isArray(source.resolvedDestinations) ? source.resolvedDestinations : []).map((item) => compactAnalizarPdfPayloadValue({
      code: clampText(item?.code || "", 120),
      destination: clampText(item?.destination || "", 120),
      message: clampText(item?.message || "", 900),
      severity: clampText(item?.severity || "", 40),
      status: clampText(item?.status || "", 40),
      fileTitle: clampText(item?.fileTitle || "", 240),
      revisionTitle: clampText(item?.revisionTitle || "", 240),
      pageName: clampText(item?.pageName || "", 40),
      sourcePageName: clampText(item?.sourcePageName || "", 40),
    })),
    resolvedLinks: (Array.isArray(source.resolvedLinks) ? source.resolvedLinks : []).map((item) => compactAnalizarPdfPayloadValue({
      role: clampText(item?.role || "", 40),
      code: clampText(item?.code || "", 120),
      destination: clampText(item?.destination || "", 240),
      message: clampText(item?.message || "", 900),
      severity: clampText(item?.severity || "", 40),
      status: clampText(item?.status || "", 40),
      fileTitle: clampText(item?.fileTitle || "", 240),
      revisionTitle: clampText(item?.revisionTitle || "", 240),
      pageName: clampText(item?.pageName || "", 40),
      sourcePageName: clampText(item?.sourcePageName || "", 40),
    })),
  });
}

function sanitizePageReport(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sanitizeBucket = (items = []) => (Array.isArray(items) ? items : []).map((item) => sanitizePageBlockEntry(item));
  const content = source.content && typeof source.content === "object" ? source.content : {};
  const footerMarkers = source.footerMarkers && typeof source.footerMarkers === "object" ? source.footerMarkers : {};
  const numbering = source.numbering && typeof source.numbering === "object" ? source.numbering : null;
  return compactAnalizarPdfPayloadValue({
    pageName: clampText(source.pageName || "", 40),
    appliedMaster: clampText(source.appliedMaster || "", 240),
    masterName: clampText(source.masterName || "", 240),
    content: {
      "títulos": sanitizeBucket(content["títulos"]),
      "subtítulos": sanitizeBucket(content["subtítulos"]),
      "instrucciones": sanitizeBucket(content["instrucciones"]),
      "subinstrucciones": sanitizeBucket(content["subinstrucciones"]),
      "párrafos normales": sanitizeBucket(content["párrafos normales"]),
      "otro": sanitizeBucket(content.otro),
    },
    aliasValues: Object.fromEntries(
      Object.entries(source.aliasValues && typeof source.aliasValues === "object" ? source.aliasValues : {})
        .map(([key, value]) => [clampText(key || "", 120), clampText(value || "", 600)])
        .filter(([key, value]) => key && value)
    ),
    fieldProfiles: (Array.isArray(source.fieldProfiles) ? source.fieldProfiles : []).map((item) => compactAnalizarPdfPayloadValue({
      alias: clampText(item?.alias || "", 120),
      label: clampText(item?.label || "", 240),
      hex: clampText(item?.hex || "", 32),
      swatchName: clampText(item?.swatchName || "", 240),
      canonicalSwatchName: clampText(item?.canonicalSwatchName || "", 240),
      source: clampText(item?.source || "", 40),
    })),
    configuredSwatches: (Array.isArray(source.configuredSwatches) ? source.configuredSwatches : []).map((item) => compactAnalizarPdfPayloadValue({
      alias: clampText(item?.alias || "", 120),
      swatchName: clampText(item?.swatchName || "", 240),
      inText: item?.inText === true,
      inFrames: item?.inFrames === true,
    })),
    footerMarkers: compactAnalizarPdfPayloadValue({
      sectionName: clampText(footerMarkers.sectionName || "", 240),
      sectionTitle: clampText(footerMarkers.sectionTitle || "", 240),
      sectionCode: clampText(footerMarkers.sectionCode || "", 120),
      trimester: clampText(footerMarkers.trimester || "", 120),
      grade: clampText(footerMarkers.grade || "", 120),
      pageNumber: clampText(footerMarkers.pageNumber || "", 40),
      footerRecortable: footerMarkers.footerRecortable === true,
      skills: sanitizeStringList(footerMarkers.skills, 16, 160),
    }),
    numbering: numbering ? compactAnalizarPdfPayloadValue({
      pageName: clampText(numbering.pageName || "", 40),
      ok: numbering.ok === true,
      visiblePageNumber: clampText(numbering.visiblePageNumber || "", 40),
      message: clampText(numbering.message || "", 600),
    }, { preserveKeys: new Set(["pageName", "ok"]) }) : null,
    spellingIssues: (Array.isArray(source.spellingIssues) ? source.spellingIssues : []).map((item) => sanitizePageIssue(item)),
    orthotypographyIssues: (Array.isArray(source.orthotypographyIssues) ? source.orthotypographyIssues : []).map((item) => sanitizePageIssue(item)),
    redactionIssues: (Array.isArray(source.redactionIssues) ? source.redactionIssues : []).map((item) => sanitizePageIssue(item)),
    recortableIssues: (Array.isArray(source.recortableIssues) ? source.recortableIssues : []).map((item) => sanitizePageIssue(item)),
    customRuleIssues: (Array.isArray(source.customRuleIssues) ? source.customRuleIssues : []).map((item) => sanitizePageIssue(item)),
    notes: sanitizePageNotes(source.notes),
    noteHistory: sanitizePageNotes(source.noteHistory),
    instructionWorkModes: (Array.isArray(source.instructionWorkModes) ? source.instructionWorkModes : []).map((item) => compactAnalizarPdfPayloadValue({
      kind: clampText(item?.kind || "", 120),
      text: clampText(item?.text || "", 600),
    })),
    recortableSummary: sanitizeRecortableSummary(source.recortableSummary),
    notes: compactAnalizarPdfPayloadValue(source.notes || []),
    noteHistory: compactAnalizarPdfPayloadValue(source.noteHistory || []),
    trackedChanges: compactAnalizarPdfPayloadValue(source.trackedChanges || []),
  }, { preserveKeys: new Set(["pageName"]) });
}

function sanitizeResultStats(raw = null) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const source = raw;
  return compactAnalizarPdfPayloadValue({
    documentName: clampText(source.documentName || "", 240),
    storyCount: Math.max(0, Number(source.storyCount || 0) || 0),
    pageCount: Math.max(0, Number(source.pageCount || 0) || 0),
    paragraphStyleCount: Math.max(0, Number(source.paragraphStyleCount || 0) || 0),
    characterStyleCount: Math.max(0, Number(source.characterStyleCount || 0) || 0),
    swatchCount: Math.max(0, Number(source.swatchCount || 0) || 0),
    spreadCount: Math.max(0, Number(source.spreadCount || 0) || 0),
    sourceType: clampText(source.sourceType || "", 32),
    durationMs: Math.max(0, Number(source.durationMs || 0) || 0),
    configurationWarnings: sanitizeStringList(source.configurationWarnings, 20, 900),
    swatchInventory: (Array.isArray(source.swatchInventory) ? source.swatchInventory : []).map((item, index) => sanitizeColorEntry(item, index)),
    pageReports: (Array.isArray(source.pageReports) ? source.pageReports : []).slice(0, 120).map((page) => sanitizePageReport(page)),
    language: compactAnalizarPdfPayloadValue(source.language || {}),
    analysisRules: compactAnalizarPdfPayloadValue(source.analysisRules || {}),
  }, { preserveKeys: new Set(["documentName", "pageCount", "pageReports"]) });
}

function compactAnalizarPdfPayloadValue(value, options = {}) {
  const preserveKeys = options?.preserveKeys instanceof Set ? options.preserveKeys : new Set();
  const compact = (item, key = "") => {
    if (Array.isArray(item)) {
      const nextItems = item
        .map((entry) => compact(entry, ""))
        .filter((entry) => entry !== undefined);
      return nextItems.length || preserveKeys.has(key) ? nextItems : undefined;
    }
    if (!item || typeof item !== "object") {
      if (item === undefined || item === null) return undefined;
      if (typeof item === "string" && !item.trim() && !preserveKeys.has(key)) return undefined;
      return item;
    }
    const result = {};
    for (const [entryKey, entryValue] of Object.entries(item)) {
      const clean = compact(entryValue, entryKey);
      if (clean !== undefined) {
        result[entryKey] = clean;
      }
    }
    return Object.keys(result).length || preserveKeys.has(key) ? result : undefined;
  };
  return compact(value, "") || {};
}

function stripUndefinedDeepLocal(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeepLocal(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return value === undefined ? undefined : value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = stripUndefinedDeepLocal(item);
    if (clean !== undefined) {
      result[key] = clean;
    }
  }
  return result;
}

function buildResultSummary(result = {}) {
  const paginationIssues = Array.isArray(result?.paginationIssues) ? result.paginationIssues.length : 0;
  const sectionIssues = Array.isArray(result?.sectionIssues) ? result.sectionIssues.length : 0;
  const spellingIssues = Array.isArray(result?.spellingIssues) ? result.spellingIssues.length : 0;
  const orthotypographyIssues = Array.isArray(result?.orthotypographyIssues) ? result.orthotypographyIssues.length : 0;
  const redactionIssues = Array.isArray(result?.redactionIssues) ? result.redactionIssues.length : 0;
  const noteIssues = Array.isArray(result?.noteIssues) ? result.noteIssues.length : 0;
  const trackedChangeIssues = Array.isArray(result?.trackedChangeIssues) ? result.trackedChangeIssues.length : 0;
  const customRuleIssues = Array.isArray(result?.customRuleIssues) ? result.customRuleIssues.length : 0;
  const colorIssues = Array.isArray(result?.colorIssues) ? result.colorIssues.length : 0;
  const recortableIssues = Array.isArray(result?.recortableIssues) ? result.recortableIssues.length : 0;
  const stats = result?.stats && typeof result.stats === "object" ? result.stats : null;
  return {
    paginationIssueCount: paginationIssues,
    sectionIssueCount: sectionIssues,
    spellingIssueCount: spellingIssues,
    orthotypographyIssueCount: orthotypographyIssues,
    redactionIssueCount: redactionIssues,
    noteIssueCount: noteIssues,
    trackedChangeIssueCount: trackedChangeIssues,
    customRuleIssueCount: customRuleIssues,
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
  const hasAnalyzedAt = Object.prototype.hasOwnProperty.call(source, "analyzedAt");
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
    redactionIssueCount: Number(source.redactionIssueCount) >= 0
      ? Number(source.redactionIssueCount)
      : base.redactionIssueCount,
    noteIssueCount: Number(source.noteIssueCount) >= 0 ? Number(source.noteIssueCount) : base.noteIssueCount,
    trackedChangeIssueCount: Number(source.trackedChangeIssueCount) >= 0 ? Number(source.trackedChangeIssueCount) : base.trackedChangeIssueCount,
    customRuleIssueCount: Number(source.customRuleIssueCount) >= 0 ? Number(source.customRuleIssueCount) : base.customRuleIssueCount,
    colorIssueCount: Number(source.colorIssueCount) >= 0
      ? Number(source.colorIssueCount)
      : base.colorIssueCount,
    recortableIssueCount: Number(source.recortableIssueCount) >= 0
      ? Number(source.recortableIssueCount)
      : base.recortableIssueCount,
    pageCount: Number(source.pageCount) >= 0
      ? Number(source.pageCount)
      : base.pageCount,
    analyzedAt: hasAnalyzedAt
      ? clampText(source.analyzedAt || "", 80)
      : clampText(base.analyzedAt, 80)
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

function buildStyleMappingLookupScopeKeys(raw = {}) {
  const keys = [];
  const exactKey = buildStyleMappingScopeKey(raw);
  if (exactKey) {
    keys.push(exactKey);
  }
  const wildcardGradeKey = buildStyleMappingScopeKey({
    ...raw,
    grado: ""
  });
  if (wildcardGradeKey && !keys.includes(wildcardGradeKey)) {
    keys.push(wildcardGradeKey);
  }
  return keys;
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
    groupId: clampText(source.groupId || "", 160),
    groupTitle: clampText(source.groupTitle || "", 240),
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
  return [];
}

function sanitizeResult(raw = {}) {
  const result = raw && typeof raw === "object" ? raw : {};
  return {
    paginationIssues: Array.isArray(result.paginationIssues) ? result.paginationIssues : [],
    sectionIssues: Array.isArray(result.sectionIssues) ? result.sectionIssues : [],
    spellingIssues: Array.isArray(result.spellingIssues) ? result.spellingIssues : [],
    orthotypographyIssues: Array.isArray(result.orthotypographyIssues) ? result.orthotypographyIssues : [],
    redactionIssues: Array.isArray(result.redactionIssues) ? result.redactionIssues : [],
    noteIssues: Array.isArray(result.noteIssues) ? result.noteIssues : [],
    noteHistoryIssues: Array.isArray(result.noteHistoryIssues) ? result.noteHistoryIssues : [],
    trackedChangeIssues: Array.isArray(result.trackedChangeIssues) ? result.trackedChangeIssues : [],
    customRuleIssues: Array.isArray(result.customRuleIssues) ? result.customRuleIssues : [],
    colorIssues: Array.isArray(result.colorIssues) ? result.colorIssues : [],
    recortableIssues: Array.isArray(result.recortableIssues) ? result.recortableIssues : [],
    stats: sanitizeResultStats(result.stats)
  };
}

function stripAnalizarPdfAnalysisResults(rawSession = {}) {
  const session = sanitizeAnalizarPdfSession(rawSession || {});
  const emptySummary = sanitizeResultSummary({}, EMPTY_ANALYSIS_RESULT);
  session.analysisStatus = "idle";
  session.analysisJobId = "";
  session.resultSummary = emptySummary;
  session.result = { ...EMPTY_ANALYSIS_RESULT };
  session.revisions = (Array.isArray(session.revisions) ? session.revisions : []).map((revision) => ({
    ...revision,
    latestAnalysisAt: "",
    summary: {
      paginationIssueCount: 0,
      sectionIssueCount: 0,
      spellingIssueCount: 0,
      orthotypographyIssueCount: 0,
      redactionIssueCount: 0,
      colorIssueCount: 0,
      recortableIssueCount: 0,
    },
    files: (Array.isArray(revision.files) ? revision.files : []).map((file) => ({
      ...file,
      analysisStatus: "idle",
      analysisJobId: "",
      resultSummary: emptySummary,
      result: { ...EMPTY_ANALYSIS_RESULT }
    }))
  }));
  return session;
}

function sanitizeAnalizarPdfFile(raw = {}, index = 0) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = sanitizeResult(source.result);
  const documentName = clampText(source.documentName || source.fileName || "", 240);
  const sourceReference = [
    documentName,
    source.sourceAssetPath,
    source.sourceStoragePath,
    source.sourceDownloadUrl
  ].map((value) => clampText(value || "", 900).toLowerCase()).join(" ");
  const inferredSourceType = String(source.sourceType || "").trim() === "idml" || /\.idml(?:\?|#|$)/i.test(sourceReference)
    ? "idml"
    : "pdf";
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
    workflowRole: ["source", "destination", "both"].includes(String(source.workflowRole || "").toLowerCase()) ? String(source.workflowRole).toLowerCase() : "source",
    linkedAssetKind: ["recortable", "ficha", "anexo", "video"].includes(String(source.linkedAssetKind || "").toLowerCase()) ? String(source.linkedAssetKind).toLowerCase() : "",
    analysisSelected: source.analysisSelected !== false,
    detectedLanguageCode: clampText(source.detectedLanguageCode || result?.stats?.language?.resolvedCode || "", 16),
    languageConfidence: Math.max(0, Math.min(1, Number(source.languageConfidence || result?.stats?.language?.confidence || 0) || 0)),
    sourceStoragePath: clampText(source.sourceStoragePath || "", 900),
    sourceDownloadUrl: clampText(source.sourceDownloadUrl || "", 3200),
    correctedStoragePath: clampText(source.correctedStoragePath || "", 900),
    correctedDownloadUrl: clampText(source.correctedDownloadUrl || "", 3200),
    correctedExportedAt: clampText(source.correctedExportedAt || "", 80),
    sourceType: inferredSourceType,
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
  const unidad = clampText(source.unidad || "", 80);
  const rawRecortableRole = clampText(source.recortableRole || "", 32).toLowerCase();
  return {
    id: clampText(source.id || `revision_${index + 1}`, 120) || `revision_${index + 1}`,
    revisionKey: clampText(source.revisionKey || buildRevisionKey(source) || `revision_${index + 1}`, 200) || `revision_${index + 1}`,
    title: clampText(source.title || buildRevisionTitle(source), 240) || buildRevisionTitle(source),
    unidad,
    revisionNumero: clampText(source.revisionNumero || "", 80),
    workflowRole: ["source", "destination", "both"].includes(String(source.workflowRole || "").toLowerCase()) ? String(source.workflowRole).toLowerCase() : "source",
    linkedAssetKind: ["recortable", "ficha", "anexo", "video"].includes(String(source.linkedAssetKind || "").toLowerCase()) ? String(source.linkedAssetKind).toLowerCase() : "",
    detectedStructure: compactAnalizarPdfPayloadValue(source.detectedStructure || {}),
    recortableRole: /^recortables$/i.test(unidad)
      ? (["source", "destination", "both"].includes(rawRecortableRole) ? rawRecortableRole : "source")
      : "",
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
      redactionIssueCount: Math.max(0, Number(summary.redactionIssueCount || 0) || 0),
      noteIssueCount: Math.max(0, Number(summary.noteIssueCount || 0) || 0),
      trackedChangeIssueCount: Math.max(0, Number(summary.trackedChangeIssueCount || 0) || 0),
      customRuleIssueCount: Math.max(0, Number(summary.customRuleIssueCount || 0) || 0),
      colorIssueCount: Math.max(0, Number(summary.colorIssueCount || 0) || 0),
      recortableIssueCount: Math.max(0, Number(summary.recortableIssueCount || 0) || 0)
    },
    files
  };
}

function sanitizeAnalysisRuleConfig(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const customRuleIds = [...new Set((Array.isArray(source.customRuleIds) ? source.customRuleIds : []).map((value) => clampText(value, 120)).filter(Boolean))].slice(0, 20);
  const customRules = (Array.isArray(source.customRules) ? source.customRules : []).filter((rule) => rule && typeof rule === "object" && customRuleIds.includes(String(rule.id || ""))).slice(0, 20).map((rule) => compactAnalizarPdfPayloadValue(rule));
  return { customRuleIds, catalogVersion: clampText(source.catalogVersion || "", 40), customRules };
}

function sanitizeAnalizarPdfSession(raw = {}, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sessionId = clampText(source.id || options.id || "", 120);
  const sanitizedResult = sanitizeResult(source.result);
  const rawBibliographicRole = clampText(source?.bibliographicInfo?.recortableRole || "", 32).toLowerCase();
  const bibliographicInfo = {
    bookType: clampText(source?.bibliographicInfo?.bookType || "", 32),
    nivel: clampText(source?.bibliographicInfo?.nivel || "", 80),
    grado: clampText(source?.bibliographicInfo?.grado || "", 80),
    trimestre: clampText(source?.bibliographicInfo?.trimestre || "", 80),
    unidad: clampText(source?.bibliographicInfo?.unidad || "", 80),
    edicionNumero: clampText(source?.bibliographicInfo?.edicionNumero || "", 80),
    revisionNumero: clampText(source?.bibliographicInfo?.revisionNumero || "", 80),
    recortableRole: ["source", "destination", "both"].includes(rawBibliographicRole) ? rawBibliographicRole : "source"
  };
  return {
    id: sessionId,
    title: clampText(source.title || "Sesión sin título", 240) || "Sesión sin título",
    ownerId: clampText(source.ownerId || options.ownerId || "", 180),
    createdAt: clampText(source.createdAt || options.createdAt || nowIso(), 80),
    updatedAt: clampText(source.updatedAt || nowIso(), 80),
    sessionKey: clampText(source.sessionKey || buildSessionKey(bibliographicInfo), 240),
    sourceType: String(source.sourceType || "pdf").trim() === "idml" ? "idml" : "pdf",
    workflowFormat: String(source.workflowFormat || "en_forma") === "libre" ? "libre" : "en_forma",
    languageCode: ["auto", "es-MX", "en-US", "fr-FR", "pt-BR", "de-DE", "it-IT", "ca-ES"].includes(String(source.languageCode || "")) ? String(source.languageCode) : "es-MX",
    analysisRuleConfig: sanitizeAnalysisRuleConfig(source.analysisRuleConfig),
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

function getAnalizarPdfSortableTimestamp(...values) {
  let latest = 0;
  for (const value of values) {
    const timestamp = Date.parse(String(value || "").trim());
    if (Number.isFinite(timestamp) && timestamp > latest) {
      latest = timestamp;
    }
  }
  return latest;
}

function hasAnalizarPdfRenderableFileResult(file = null) {
  if (!file || typeof file !== "object") {
    return false;
  }
  const result = file.result && typeof file.result === "object" ? file.result : {};
  const summary = file.resultSummary && typeof file.resultSummary === "object" ? file.resultSummary : {};
  const stats = result.stats && typeof result.stats === "object" ? result.stats : {};
  return Boolean(
    Math.max(0, Number(summary.pageCount || 0) || 0) > 0
    || Math.max(0, Number(stats.pageCount || 0) || 0) > 0
    || (Array.isArray(stats.pageReports) && stats.pageReports.length > 0)
    || ["paginationIssues", "sectionIssues", "spellingIssues", "orthotypographyIssues", "redactionIssues", "colorIssues", "recortableIssues"]
      .some((key) => Array.isArray(result?.[key]) && result[key].length > 0)
    || ["completed", "processing", "queued", "uploading"].includes(normalizeAnalysisStatus(file.analysisStatus || ""))
  );
}

function getAnalizarPdfFileStateTimestamp(file = null) {
  const result = file?.result && typeof file.result === "object" ? file.result : {};
  const summary = file?.resultSummary && typeof file.resultSummary === "object" ? file.resultSummary : {};
  const stats = result.stats && typeof result.stats === "object" ? result.stats : {};
  const hasResultPayload = Boolean(
    Math.max(0, Number(summary.pageCount || 0) || 0) > 0
    || Math.max(0, Number(stats.pageCount || 0) || 0) > 0
    || (Array.isArray(stats.pageReports) && stats.pageReports.length > 0)
    || ["paginationIssues", "sectionIssues", "spellingIssues", "orthotypographyIssues", "redactionIssues", "colorIssues", "recortableIssues"]
      .some((key) => Array.isArray(result?.[key]) && result[key].length > 0)
  );
  return getAnalizarPdfSortableTimestamp(
    file?.updatedAt,
    hasResultPayload ? summary.analyzedAt : ""
  );
}

function buildAnalizarPdfRevisionSummaryFromFiles(files = []) {
  return (Array.isArray(files) ? files : []).reduce((acc, file) => {
    const summary = file?.resultSummary || {};
    acc.paginationIssueCount += Number(summary.paginationIssueCount || 0) || 0;
    acc.sectionIssueCount += Number(summary.sectionIssueCount || 0) || 0;
    acc.spellingIssueCount += Number(summary.spellingIssueCount || 0) || 0;
    acc.orthotypographyIssueCount += Number(summary.orthotypographyIssueCount || 0) || 0;
    acc.redactionIssueCount += Number(summary.redactionIssueCount || 0) || 0;
    acc.colorIssueCount += Number(summary.colorIssueCount || 0) || 0;
    acc.recortableIssueCount += Number(summary.recortableIssueCount || 0) || 0;
    return acc;
  }, {
    paginationIssueCount: 0,
    sectionIssueCount: 0,
    spellingIssueCount: 0,
    orthotypographyIssueCount: 0,
    redactionIssueCount: 0,
    colorIssueCount: 0,
    recortableIssueCount: 0
  });
}

function getAnalizarPdfRevisionLatestAnalysisAt(files = []) {
  let latest = "";
  let latestTime = 0;
  for (const file of Array.isArray(files) ? files : []) {
    const analyzedAt = String(file?.resultSummary?.analyzedAt || "").trim();
    const analyzedTime = getAnalizarPdfSortableTimestamp(analyzedAt);
    if (analyzedAt && analyzedTime >= latestTime) {
      latest = analyzedAt;
      latestTime = analyzedTime;
    }
  }
  return latest;
}

function shouldPreserveAnalizarPdfFileResult(existingFile = null, incomingFile = null) {
  if (!hasAnalizarPdfRenderableFileResult(existingFile)) {
    return false;
  }
  const incomingHasResult = hasAnalizarPdfRenderableFileResult(incomingFile);
  const existingTime = getAnalizarPdfFileStateTimestamp(existingFile);
  const incomingTime = getAnalizarPdfFileStateTimestamp(incomingFile);
  if (incomingHasResult) {
    return existingTime > incomingTime;
  }
  return incomingTime <= existingTime;
}

function mergeAnalizarPdfSessionPreservingFreshFileResults(existingRaw = null, incomingRaw = null, options = {}) {
  const incoming = sanitizeAnalizarPdfSession(incomingRaw || {}, options);
  if (!existingRaw || typeof existingRaw !== "object") {
    return incoming;
  }
  const existing = sanitizeAnalizarPdfSession(existingRaw, {
    id: incoming.id || existingRaw?.id || options.id || "",
    ownerId: incoming.ownerId || existingRaw?.ownerId || options.ownerId || "",
    createdAt: existingRaw?.createdAt || incoming.createdAt || options.createdAt || nowIso()
  });
  const existingRevisionsById = new Map(
    (Array.isArray(existing.revisions) ? existing.revisions : [])
      .map((revision) => [String(revision?.id || "").trim(), revision])
      .filter(([id]) => id)
  );
  let preservedAny = false;
  incoming.revisions = (Array.isArray(incoming.revisions) ? incoming.revisions : []).map((revision) => {
    const revisionId = String(revision?.id || "").trim();
    const existingRevision = existingRevisionsById.get(revisionId);
    if (!existingRevision) {
      return revision;
    }
    const existingFilesById = new Map(
      (Array.isArray(existingRevision.files) ? existingRevision.files : [])
        .map((file) => [String(file?.id || "").trim(), file])
        .filter(([id]) => id)
    );
    let preservedRevision = false;
    const files = (Array.isArray(revision.files) ? revision.files : []).map((file) => {
      const existingFile = existingFilesById.get(String(file?.id || "").trim());
      if (!existingFile || !shouldPreserveAnalizarPdfFileResult(existingFile, file)) {
        return file;
      }
      preservedAny = true;
      preservedRevision = true;
      return {
        ...file,
        analysisStatus: existingFile.analysisStatus || file.analysisStatus,
        analysisJobId: existingFile.analysisJobId || file.analysisJobId,
        resultSummary: existingFile.resultSummary || file.resultSummary,
        result: existingFile.result || file.result,
        correctedStoragePath: existingFile.correctedStoragePath || file.correctedStoragePath,
        correctedDownloadUrl: existingFile.correctedDownloadUrl || file.correctedDownloadUrl,
        correctedExportedAt: existingFile.correctedExportedAt || file.correctedExportedAt,
        updatedAt: existingFile.updatedAt || file.updatedAt
      };
    });
    if (!preservedRevision) {
      return revision;
    }
    return {
      ...revision,
      files,
      fileCount: files.length,
      latestAnalysisAt: getAnalizarPdfRevisionLatestAnalysisAt(files) || revision.latestAnalysisAt || existingRevision.latestAnalysisAt || "",
      summary: buildAnalizarPdfRevisionSummaryFromFiles(files)
    };
  });
  if (preservedAny) {
    incoming.__preservedFreshFileResults = true;
  }
  return incoming;
}

function resolveStableAnalizarPdfSourcePath(sessionId = "", revisionId = "", fileId = "", sourceType = "pdf") {
  const cleanSessionId = clampText(sessionId, 120);
  const cleanRevisionId = clampText(revisionId, 120);
  const cleanFileId = clampText(fileId, 120);
  if (!cleanSessionId || !cleanRevisionId || !cleanFileId) {
    return "";
  }
  const ext = String(sourceType || "").trim() === "idml" ? ".idml" : ".pdf";
  return path.join(os.tmpdir(), "analizar-pdf-sources", cleanSessionId, cleanRevisionId, `${cleanFileId}${ext}`);
}

function getAnalizarPdfLocalSourceRoots() {
  const configured = String(process.env.ANALIZAR_PDF_LOCAL_SOURCE_ROOTS || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const roots = configured.length ? configured : [path.join(os.homedir(), "Downloads")];
  return roots
    .map((entry) => path.resolve(entry))
    .filter((entry, index, list) => entry && list.indexOf(entry) === index && fs.existsSync(entry));
}

function findAnalizarPdfLocalSourceByName(documentName = "", sourceType = "pdf") {
  const targetName = path.basename(clampText(documentName || "", 320));
  if (!targetName) return "";
  const expectedExt = String(sourceType || "").trim() === "idml" ? ".idml" : ".pdf";
  if (expectedExt && path.extname(targetName).toLowerCase() !== expectedExt) {
    return "";
  }
  const roots = getAnalizarPdfLocalSourceRoots();
  const matches = [];
  const maxEntries = 12000;
  const maxDepth = 7;
  let visited = 0;
  const visit = (dirPath = "", depth = 0) => {
    if (!dirPath || depth > maxDepth || visited > maxEntries) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (visited > maxEntries) return;
      visited += 1;
      if (entry.name.startsWith(".")) continue;
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath, depth + 1);
        continue;
      }
      if (!entry.isFile() || entry.name !== targetName) continue;
      try {
        const stat = fs.statSync(entryPath);
        if (stat.size > 0) {
          matches.push({ path: entryPath, mtimeMs: stat.mtimeMs || 0, size: stat.size || 0 });
        }
      } catch (_) {
        // ignore unreadable candidates
      }
    }
  };
  for (const root of roots) {
    visit(root, 0);
  }
  if (!matches.length) return "";
  matches.sort((left, right) => {
    if (right.mtimeMs !== left.mtimeMs) return right.mtimeMs - left.mtimeMs;
    return right.size - left.size;
  });
  return matches[0]?.path || "";
}

function repairAnalizarPdfSessionSourceAssetPaths(rawSession = {}) {
  const session = sanitizeAnalizarPdfSession(rawSession, {
    id: rawSession?.id || "",
    ownerId: rawSession?.ownerId || "",
    createdAt: rawSession?.createdAt || nowIso()
  });
  let repaired = false;
  for (const revision of Array.isArray(session.revisions) ? session.revisions : []) {
    for (const file of Array.isArray(revision.files) ? revision.files : []) {
      const currentPath = clampText(file.sourceAssetPath || "", 600);
      if (currentPath && fs.existsSync(currentPath)) {
        continue;
      }
      const stablePath = resolveStableAnalizarPdfSourcePath(session.id, revision.id, file.id, file.sourceType || session.sourceType);
      if (stablePath && fs.existsSync(stablePath)) {
        file.sourceAssetPath = stablePath;
        file.updatedAt = nowIso();
        repaired = true;
        continue;
      }
      const recoveredSourcePath = findAnalizarPdfLocalSourceByName(file.documentName || file.name || "", file.sourceType || session.sourceType);
      if (stablePath && recoveredSourcePath && fs.existsSync(recoveredSourcePath)) {
        try {
          ensureDirSync(path.dirname(stablePath));
          fs.copyFileSync(recoveredSourcePath, stablePath);
          file.sourceAssetPath = stablePath;
          if (["failed", "cancelled"].includes(normalizeAnalysisStatus(file.analysisStatus))) {
            file.analysisStatus = "idle";
            file.analysisJobId = "";
          }
          file.updatedAt = nowIso();
          repaired = true;
          logAnalizarPdf("sourceAssetPath.recovered-local", {
            sessionId: session.id || "",
            revisionId: revision.id || "",
            fileId: file.id || "",
            documentName: file.documentName || "",
            recoveredSourcePath,
            stablePath
          });
          continue;
        } catch (error) {
          logAnalizarPdf("sourceAssetPath.recover-local-failed", {
            sessionId: session.id || "",
            revisionId: revision.id || "",
            fileId: file.id || "",
            documentName: file.documentName || "",
            recoveredSourcePath,
            message: String(error?.message || error)
          });
        }
      }
      if (currentPath) {
        file.sourceAssetPath = "";
        if (["uploading", "queued", "processing"].includes(normalizeAnalysisStatus(file.analysisStatus))) {
          file.analysisStatus = "idle";
          file.analysisJobId = "";
        }
        file.updatedAt = nowIso();
        repaired = true;
      }
    }
  }
  if (repaired) {
    session.__sourceAssetPathsRepaired = true;
  }
  return session;
}

function reconcileStaleAnalizarPdfSessionJobs(rawSession = {}, jobStore = null) {
  const session = sanitizeAnalizarPdfSession(rawSession, {
    id: rawSession?.id || "",
    ownerId: rawSession?.ownerId || "",
    createdAt: rawSession?.createdAt || nowIso()
  });
  if (!jobStore || typeof jobStore.get !== "function") {
    return session;
  }

  const reconcileStatus = (status = "", jobId = "") => {
    const cleanStatus = normalizeAnalysisStatus(status);
    const cleanJobId = clampText(jobId || "", 160);
    if (!["queued", "processing", "uploading"].includes(cleanStatus)) {
      return { status: cleanStatus, jobId: cleanJobId, changed: false };
    }
    const job = cleanJobId ? jobStore.get(cleanJobId) : null;
    const jobStatus = normalizeAnalysisStatus(job?.status || "");
    if (job && ["queued", "processing", "uploading"].includes(jobStatus)) {
      return { status: cleanStatus, jobId: cleanJobId, changed: false };
    }
    if (job && ["completed", "failed", "cancelled"].includes(jobStatus)) {
      return { status: jobStatus, jobId: "", changed: jobStatus !== cleanStatus || cleanJobId !== "" };
    }
    return { status: "failed", jobId: "", changed: true };
  };

  let changed = false;
  const next = JSON.parse(JSON.stringify(session));
  const sessionReconciled = reconcileStatus(next.analysisStatus, next.analysisJobId);
  next.analysisStatus = sessionReconciled.status;
  next.analysisJobId = sessionReconciled.jobId;
  changed = changed || sessionReconciled.changed;

  next.revisions = Array.isArray(next.revisions) ? next.revisions.map((revision) => {
    const revisionNext = revision && typeof revision === "object" ? { ...revision } : revision;
    const revisionReconciled = reconcileStatus(revisionNext?.analysisStatus, revisionNext?.analysisJobId);
    if (revisionNext && typeof revisionNext === "object") {
      revisionNext.analysisStatus = revisionReconciled.status;
      revisionNext.analysisJobId = revisionReconciled.jobId;
      changed = changed || revisionReconciled.changed;
      revisionNext.files = Array.isArray(revisionNext.files) ? revisionNext.files.map((file) => {
        const fileNext = file && typeof file === "object" ? { ...file } : file;
        const fileReconciled = reconcileStatus(fileNext?.analysisStatus, fileNext?.analysisJobId);
        if (fileNext && typeof fileNext === "object") {
          fileNext.analysisStatus = fileReconciled.status;
          fileNext.analysisJobId = fileReconciled.jobId;
          changed = changed || fileReconciled.changed;
        }
        return fileNext;
      }) : [];
    }
    return revisionNext;
  }) : [];

  next.__staleJobsReconciled = changed;
  return next;
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
  const sessionPayload = JSON.stringify(options.session || {});
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "analizar-pdf-session-"));
  const sessionJsonPath = path.join(sessionDir, "session.json");
  fs.writeFileSync(sessionJsonPath, sessionPayload, "utf8");
  const args = [
    scriptPath,
    "--input",
    path.resolve(String(options.pdfPath || "")),
    "--session-json-file",
    sessionJsonPath
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
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (_) {
          // noop
        }
        reject(error);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (_) {
          // noop
        }
        resolve(parsed);
      } catch (error) {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (_) {
          // noop
        }
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
  buildStyleMappingLookupScopeKeys,
  buildStyleMappingScopeKey,
  classifyAnalizarPdfStartupError,
  createAnalizarPdfJobStore,
  ensureDirSync,
  findAnalizarPdfLocalSourceByName,
  logAnalizarPdf,
  mergeAnalizarPdfSessionPreservingFreshFileResults,
  normalizeAnalysisStatus,
  reconcileStaleAnalizarPdfSessionJobs,
  repairAnalizarPdfSessionSourceAssetPaths,
  resolveAnalyzerScript,
  resolveStableAnalizarPdfSourcePath,
  sanitizeResult,
  sanitizeResultSummary,
  sanitizeAnalizarPdfSession,
  stripAnalizarPdfAnalysisResults,
  sanitizeStyleMapping,
  sanitizeStyleMappingEntry,
  spawnAnalizarPdfPythonJob
};
