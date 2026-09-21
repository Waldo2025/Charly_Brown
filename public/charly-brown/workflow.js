export const WORKFLOW_STATUS = Object.freeze({
  PENDING: "pending",
  PROPOSED: "proposed",
  APPROVED: "approved",
  SKIPPED: "skipped",
  BLOCKED: "blocked"
});

export const READING_STAGES = Object.freeze(["reading", "synonyms", "comprehension"]);

export const DEFAULT_ACTIVITY_SECTIONS = Object.freeze([
  "Proyectos",
  "Lenguaje y comunicación",
  "Ciencias experimentales",
  "Ciencias sociales",
  "Formación socioemocional",
  "Artes",
  "Habilidades",
  "Matemáticas"
]);

const VALID_STATUS = new Set(Object.values(WORKFLOW_STATUS));

export function createUnitWorkflow({ readingMode = "existing", reading = null, activitySections = [] } = {}) {
  const sections = normalizeSectionSelections(activitySections);
  const hasReading = Boolean(reading);
  const hasSynonyms = Boolean(reading?.sections?.synonyms?.length || reading?.synonyms?.length);
  const hasQuestions = Boolean(
    reading?.sections?.questions?.length ||
    reading?.questions?.length ||
    String(reading?.sections?.questionsHtml || "").trim()
  );
  const skipReading = readingMode === "none";
  return normalizeUnitWorkflow({
    readingMode,
    stages: {
      reading: stage(skipReading ? "skipped" : hasReading ? "approved" : "pending"),
      synonyms: stage(skipReading ? "skipped" : hasSynonyms ? "approved" : "pending"),
      comprehension: stage(skipReading ? "skipped" : hasQuestions ? "approved" : "pending")
    },
    activitySections: sections.map((section, order) => ({ ...section, order, status: "pending", activityIds: [] })),
    resources: [],
    updatedAt: new Date().toISOString()
  });
}

export function normalizeUnitWorkflow(value = {}) {
  const readingMode = ["existing", "chat", "none"].includes(value?.readingMode) ? value.readingMode : "existing";
  const stages = Object.fromEntries(READING_STAGES.map((key) => [key, normalizeStage(value?.stages?.[key])]));
  if (readingMode === "none") READING_STAGES.forEach((key) => { stages[key] = stage("skipped", stages[key]); });
  return {
    readingMode,
    stages,
    activitySections: normalizeActivitySections(value?.activitySections),
    resources: Array.isArray(value?.resources) ? value.resources.map(normalizeResourceStage).filter(Boolean) : [],
    updatedAt: String(value?.updatedAt || "")
  };
}

export function setWorkflowReadingMode(workflow = {}, readingMode = "existing", reading = null) {
  const current = normalizeUnitWorkflow(workflow);
  const next = createUnitWorkflow({
    readingMode,
    reading,
    activitySections: current.activitySections
  });
  next.resources = current.resources;
  return next;
}

export function markWorkflowStage(workflow = {}, key = "", status = "pending", patch = {}) {
  const next = normalizeUnitWorkflow(workflow);
  if (READING_STAGES.includes(key)) next.stages[key] = stage(status, { ...next.stages[key], ...patch });
  next.updatedAt = new Date().toISOString();
  return next;
}

export function setWorkflowActivitySections(workflow = {}, sections = []) {
  const next = normalizeUnitWorkflow(workflow);
  const current = new Map(next.activitySections.map((item) => [activitySectionKey(item), item]));
  next.activitySections = normalizeSectionSelections(sections).map((section, order) => ({
    ...section,
    order,
    status: current.get(activitySectionKey(section))?.status || "pending",
    activityIds: [...(current.get(activitySectionKey(section))?.activityIds || [])]
  }));
  next.updatedAt = new Date().toISOString();
  return next;
}

export function markActivitySection(workflow = {}, section = "", status = "approved", activityId = "", sectionId = "", subtopic = "") {
  const next = normalizeUnitWorkflow(workflow);
  const label = String(section || "").trim();
  const stableId = String(sectionId || "").trim();
  const topic = String(subtopic || "").trim();
  let item = next.activitySections.find((entry) => {
    const sameSection = (stableId && entry.sectionId === stableId) || (!stableId && entry.section === label);
    return sameSection && (!topic || entry.subtopic === topic);
  });
  if (!item && label) {
    item = { section: label, sectionId: stableId, order: next.activitySections.length, status: "pending", activityIds: [] };
    next.activitySections.push(item);
  }
  if (item) {
    item.section = label || item.section;
    item.sectionId = stableId || item.sectionId || "";
    item.status = VALID_STATUS.has(status) ? status : "pending";
    if (activityId && !item.activityIds.includes(activityId)) item.activityIds.push(activityId);
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function registerResourceStage(workflow = {}, { activityId = "", resourceType = "", resourceId = "", status = "approved" } = {}) {
  const next = normalizeUnitWorkflow(workflow);
  const key = `${activityId}:${resourceType}`;
  const existing = next.resources.find((item) => `${item.activityId}:${item.resourceType}` === key);
  if (existing) {
    existing.status = VALID_STATUS.has(status) ? status : "pending";
    if (resourceId && !existing.resourceIds.includes(resourceId)) existing.resourceIds.push(resourceId);
  } else if (activityId && resourceType) {
    next.resources.push({ activityId, resourceType, status, resourceIds: resourceId ? [resourceId] : [] });
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function getNextWorkflowStep(workflow = {}) {
  const current = normalizeUnitWorkflow(workflow);
  for (const key of READING_STAGES) {
    const status = current.stages[key].status;
    if (!["approved", "skipped"].includes(status)) return { kind: key, status };
  }
  if (!current.activitySections.length) return { kind: "activity-selection", status: "pending" };
  const activity = current.activitySections.find((item) => !["approved", "skipped"].includes(item.status));
  if (activity) return { kind: "activity", ...activity };
  return { kind: "resources", status: "pending" };
}

function normalizeStage(value = {}) {
  if (typeof value === "string") return stage(value);
  return stage(value?.status, value);
}

function stage(status = "pending", value = {}) {
  return {
    status: VALID_STATUS.has(status) ? status : "pending",
    proposalId: String(value?.proposalId || ""),
    approvedAt: String(value?.approvedAt || ""),
    skippedAt: String(value?.skippedAt || "")
  };
}

function normalizeActivitySections(value = []) {
  return (Array.isArray(value) ? value : []).map((item, index) => {
    const row = typeof item === "string" ? { section: item } : item || {};
    const section = String(row.section || "").trim();
    if (!section) return null;
    return {
      section,
      sectionId: String(row.sectionId || "").trim(),
      description: String(row.description || "").trim(),
      objective: String(row.objective || "").trim(),
      agentInstructions: String(row.agentInstructions || "").trim(),
      category: String(row.category || "").trim(),
      subtopic: String(row.subtopic || "").trim(),
      resourceSelections: normalizeResourceSelections(row.resourceSelections),
      resourcesConfigured: row.resourcesConfigured === true,
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
      status: VALID_STATUS.has(row.status) ? row.status : "pending",
      activityIds: uniqueStrings(row.activityIds)
    };
  }).filter(Boolean).sort((a, b) => a.order - b.order);
}

function normalizeResourceSelections(value = {}) {
  return {
    fichas: Boolean(value?.fichas),
    anexos: Boolean(value?.anexos),
    recortables: Boolean(value?.recortables),
    videos: Boolean(value?.videos)
  };
}

function normalizeSectionSelections(value = []) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map((item) => {
    const row = typeof item === "string" ? { section: item } : item || {};
    const section = String(row.section || row.name || "").trim();
    const sectionId = String(row.sectionId || row.id || "").trim();
    const subtopic = String(row.subtopic || "").trim();
    const key = activitySectionKey({ section, sectionId, subtopic });
    if (!section || !key || seen.has(key)) return null;
    seen.add(key);
    return {
      section,
      sectionId,
      description: String(row.description || "").trim(),
      objective: String(row.objective || "").trim(),
      agentInstructions: String(row.agentInstructions || "").trim(),
      category: String(row.category || "").trim(),
      subtopic,
      resourceSelections: normalizeResourceSelections(row.resourceSelections),
      resourcesConfigured: row.resourcesConfigured === true
    };
  }).filter(Boolean);
}

function activitySectionKey(value = {}) {
  return `${String(value.sectionId || value.section || "").trim()}::${String(value.subtopic || "").trim()}`;
}

function normalizeResourceStage(value = {}) {
  const activityId = String(value?.activityId || "").trim();
  const resourceType = String(value?.resourceType || "").trim();
  if (!activityId || !resourceType) return null;
  return {
    activityId,
    resourceType,
    status: VALID_STATUS.has(value?.status) ? value.status : "pending",
    resourceIds: uniqueStrings(value?.resourceIds)
  };
}

function uniqueStrings(value = []) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean))];
}
