const { randomUUID } = require("node:crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const z = require("zod/v4");
const { researchArticleEvidenceServer } = require("./marcie-editorial-research.js");
const researchPolicy = require("./marcie-research-policy.js");
const { buildCharlyExport } = require("./charly-brown-export.js");
const {
  ACTIVITY_SECTION_DEFINITIONS,
  buildActivityPrompt,
  buildActivityReadingContext,
  buildResourcePrompt,
  buildTeacherNotesPrompt,
  buildTeacherNotesResourceMap,
  collectUnitCitations,
  fallbackArtifact,
  formatApa7,
  id: createAgentId,
  nextWorkflowStep,
  normalizeCutoutDocument,
  normalizeWorkflow,
  renderCutoutPdf,
  validateProjectArtifact,
  validateEmbeddedActivityResources,
  validateResourceArtifact,
  validateTeacherNotesResourceReferences
} = require("./charly-brown-agent-tools.js");

const COLLECTION = "charlyBrownUnitSessions";
const MEMORY_COLLECTION = "charlyBrownTeachingMemory";
const ACTIVITY_SECTION_COLLECTION = "charlyBrownActivitySections";
const READING_COLLECTIONS = ["lecturasNuevas", "lecturasASC"];
const CONTENT_TYPES = ["reading", "activity", "worksheet", "annex", "cutout", "video-script"];
const DEFAULT_CHARLY_MODEL = "gemini-3.8-flash";
const EDITORIAL_REVIEW_MODEL = "gemini-3.5-flash-lite";
const THINKING_LEVELS = Object.freeze({ agent: "MEDIUM", creation: "HIGH", editorial: "MEDIUM" });
const NATURAL_STYLE_RULES = [
  "Escribe como un docente mexicano con experiencia: claro, concreto, cercano y profesional.",
  "Elimina introducciones genéricas, conclusiones de relleno y frases de asistente.",
  "No uses: es importante destacar, en el mundo actual, sumérgete, exploremos juntos ni equivalentes vacíos.",
  "Varía de manera natural la longitud de las oraciones y evita listas o estructuras mecánicamente simétricas.",
  "Conserva hechos, citas, intención didáctica, nivel escolar y estructura HTML.",
  "No inventes experiencias personales, moralejas, encabezados, emojis ni falsa autoría humana."
].join("\n");

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}
function toolError(message, code = "CHARLY_TOOL_ERROR") {
  const error = new Error(message); error.code = code; return error;
}
function emptyAccepted() { return { activities: [], resources: [], teacherNotes: [], reading: null, sya: null, syaOriginal: null }; }

function normalizeAccepted(value = {}) {
  return {
    ...emptyAccepted(), ...(value || {}),
    activities: Array.isArray(value?.activities) ? value.activities : [],
    resources: Array.isArray(value?.resources) ? value.resources : [],
    teacherNotes: Array.isArray(value?.teacherNotes) ? value.teacherNotes : []
  };
}

function normalizeUnit(value = {}, academicMeta = {}) {
  const unitNumber = String(value?.meta?.unit || "1");
  return {
    id: String(value.id || `unit_${randomUUID()}`),
    title: String(value.title || `Unidad ${unitNumber}`),
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString(),
    revision: Math.max(0, Number(value.revision || 0)),
    meta: { ...academicMeta, ...(value.meta || {}), unit: unitNumber },
    reading: value.reading || null,
    sya: value.sya || null,
    syaOriginal: value.syaOriginal || null,
    syaContextKey: String(value.syaContextKey || ""),
    messages: Array.isArray(value.messages) ? value.messages : [],
    proposals: Array.isArray(value.proposals) ? value.proposals : [],
    accepted: normalizeAccepted(value.accepted),
    preferences: Array.isArray(value.preferences) ? value.preferences : [],
    researchRuns: Array.isArray(value.researchRuns) ? value.researchRuns : [],
    workflow: normalizeWorkflow(value.workflow || {}, value.accepted?.reading || value.reading || null)
  };
}

function normalizeSession(value = {}) {
  const academicMeta = { ...(value.academicMeta || value.meta || {}) };
  delete academicMeta.unit;
  let units = Array.isArray(value.units) ? value.units.map((unit) => normalizeUnit(unit, academicMeta)) : [];
  let activeUnitId = String(value.activeUnitId || "");
  if (Number(value.schemaVersion || 0) < 2 && (value.meta?.unit || value.messages?.length || value.proposals?.length || value.accepted?.activities?.length || value.accepted?.resources?.length || value.accepted?.reading)) {
    const current = normalizeUnit({ ...value, id: `unit_${randomUUID()}`, meta: value.meta }, academicMeta);
    units.push(current); activeUnitId = current.id;
  }
  if (!units.some((unit) => unit.id === activeUnitId)) activeUnitId = units.at(-1)?.id || "";
  return { ...value, schemaVersion: 3, academicMeta, activeUnitId, units };
}

async function loadOwnedSession(db, uid, sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) throw toolError("Falta sessionId.", "INVALID_SESSION");
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw toolError("La sesión no existe.", "SESSION_NOT_FOUND");
  const raw = snap.data() || {};
  if (String(raw.ownerUid || raw.ownerId || raw.userId || "") !== uid) throw toolError("No tienes acceso a esta sesión.", "SESSION_FORBIDDEN");
  return { ref, session: normalizeSession({ id: snap.id, ...raw }) };
}

function requireUnit(session, unitId) {
  const unit = session.units.find((item) => item.id === String(unitId || ""));
  if (!unit) throw toolError("La unidad indicada no existe.", "UNIT_NOT_FOUND");
  return unit;
}

function syaContextKey(meta = {}) {
  return [meta.level, meta.grade, meta.trimester, meta.unit].map((value) => String(value || "").trim()).join("|");
}

function normalizeSyaDocument(value = {}) {
  const ignored = new Set(["id", "nivel", "grado", "trimestre", "unidad", "createdAt", "updatedAt"]);
  const normalized = {};
  Object.entries(value || {}).forEach(([key, entry]) => {
    if (ignored.has(key) || key.startsWith("__") || entry === null || entry === undefined) return;
    if (typeof entry === "object" && !Array.isArray(entry)) {
      Object.entries(entry).forEach(([nestedKey, nestedValue]) => {
        if (nestedValue !== null && nestedValue !== undefined && typeof nestedValue !== "object") normalized[nestedKey] = String(nestedValue).trim();
      });
      return;
    }
    const text = String(entry).trim();
    if (text) normalized[key] = text;
  });
  return normalized;
}

function normalizeSyaLookupKey(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, "").toLowerCase();
}

function matchesUnitCurriculum(value = {}, meta = {}) {
  return [
    [value.nivel, meta.level],
    [value.grado, meta.grade],
    [value.trimestre, meta.trimester],
    [value.unidad, meta.unit]
  ].every(([stored, expected]) => normalizeSyaLookupKey(stored) === normalizeSyaLookupKey(expected));
}

async function resolveUnitCurriculum(db, unit) {
  const expectedKey = syaContextKey(unit.meta);
  const stored = unit.accepted?.sya || unit.sya || null;
  if (stored && (!unit.syaContextKey || unit.syaContextKey === expectedKey)) {
    return { sya: stored, contextKey: expectedKey, source: "unit" };
  }
  const { level, grade, trimester, unit: unitNumber } = unit.meta || {};
  if (![level, grade, trimester, unitNumber].every((value) => String(value || "").trim())) {
    return { sya: stored, contextKey: expectedKey, source: stored ? "unit-stale" : "missing-academic-meta" };
  }
  try {
    const collection = db.collection("secuenciaAlcance");
    let query = collection.where("nivel", "==", level)
      .where("grado", "==", grade)
      .where("trimestre", "==", trimester)
      .where("unidad", "==", unitNumber);
    const snapshot = await query.get();
    const candidates = [];
    snapshot.forEach((doc) => candidates.push({ id: doc.id, ...(doc.data() || {}) }));
    if (!candidates.length && typeof collection.get === "function") {
      const all = await collection.get();
      all.forEach((doc) => {
        const value = { id: doc.id, ...(doc.data() || {}) };
        if (matchesUnitCurriculum(value, unit.meta)) candidates.push(value);
      });
    }
    candidates.sort((a, b) => Object.keys(normalizeSyaDocument(b)).length - Object.keys(normalizeSyaDocument(a)).length);
    const selected = candidates[0];
    if (!selected) return { sya: null, contextKey: expectedKey, source: "not-found" };
    return { sya: normalizeSyaDocument(selected), contextKey: expectedKey, source: "secuenciaAlcance", documentId: selected.id };
  } catch (_) {
    return { sya: stored, contextKey: expectedKey, source: stored ? "unit-fallback" : "unavailable" };
  }
}

function approvedContent(unit) {
  const out = [];
  if (unit.accepted.reading) out.push({ ...unit.accepted.reading, id: unit.accepted.reading.id || "reading", type: "reading", revision: Number(unit.accepted.reading.revision || 1) });
  unit.accepted.activities.forEach((item) => out.push({ ...item, type: "activity" }));
  unit.accepted.resources.forEach((item) => out.push({ ...item, type: mapResourceType(item.type) }));
  return out;
}

function mapResourceType(value = "") {
  const key = String(value).toLowerCase();
  if (key.includes("ficha")) return "worksheet";
  if (key.includes("anexo")) return "annex";
  if (key.includes("recort")) return "cutout";
  if (key.includes("video")) return "video-script";
  return CONTENT_TYPES.includes(key) ? key : "annex";
}

async function reviewNaturalWriting({ html, model, generateText }) {
  const source = String(html || "").trim();
  if (!source || !generateText) return { html: source, corrections: [] };
  const prompt = `Revisa el siguiente material educativo sin alterar su estructura ni sus respuestas.\n${NATURAL_STYLE_RULES}\n\nDevuelve SOLO JSON válido con {"html":"texto final","corrections":["cambio breve"]}.\n\nMATERIAL:\n${source}`;
  try {
    const raw = await generateText({ model: EDITORIAL_REVIEW_MODEL, prompt, json: true, thinkingLevel: THINKING_LEVELS.editorial });
    const parsed = JSON.parse(String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, ""));
    return { html: String(parsed.html || source), corrections: Array.isArray(parsed.corrections) ? parsed.corrections.slice(0, 12).map(String) : [] };
  } catch (_) {
    return { html: source, corrections: [] };
  }
}

function normalizeReadingRecord(row = {}, collection = "") {
  const html = row.contenidoHTML || row.textoLectura || row.lecturaHTML || row.htmlLectura || row.lectura || row.contenido || row.texto || "";
  return {
    id: String(row.id || ""), collection, title: String(row.titulo || row.tema || row.nombre || "Lectura sin título"),
    html: String(html || ""), text: String(row.contenidoPlano || html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    questions: Array.isArray(row.preguntas) ? row.preguntas : [],
    sections: row.sections || {},
    meta: {
      nivel: String(row.nivel || ""), grado: String(row.grado || row.gradoEscolar || ""),
      trimestre: String(row.trimestre || row.trimestreNumero || row.periodo || ""),
      unidad: String(row.unidad || row.unidadNumero || row.numeroUnidad || "")
    }
  };
}

async function listReadingRecords(db, { collectionName = "", query = "", limit = 160 } = {}) {
  const collections = collectionName && READING_COLLECTIONS.includes(collectionName) ? [collectionName] : READING_COLLECTIONS;
  const rows = [];
  for (const name of collections) {
    const snap = await db.collection(name).get();
    snap.forEach((doc) => rows.push(normalizeReadingRecord({ id: doc.id, ...(doc.data() || {}) }, name)));
  }
  const needle = String(query || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return rows.filter((item) => !needle || `${item.title} ${item.text} ${Object.values(item.meta).join(" ")}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(needle)).slice(0, Math.min(400, Number(limit) || 160));
}

async function readMemoryRows(db, filters = {}) {
  const snap = await db.collection(MEMORY_COLLECTION).get();
  const rows = [];
  snap.forEach((doc) => {
    const row = { id: doc.id, ...(doc.data() || {}) };
    if (filters.status && row.status !== filters.status) return;
    if (filters.resourceType && row.resourceType && row.resourceType !== filters.resourceType) return;
    if (filters.grade && row.grade && row.grade !== filters.grade) return;
    if (filters.section && row.section && row.section !== filters.section) return;
    rows.push(row);
  });
  return rows.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function normalizeActivitySectionDefinition(value = {}, fallback = {}) {
  const cleanList = (items) => Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 30);
  return {
    id: String(value.id || fallback.id || "").trim(),
    name: String(value.name || fallback.name || "").trim().slice(0, 120),
    description: String(value.description || fallback.description || "").trim().slice(0, 600),
    objective: String(value.objective || fallback.objective || "").trim().slice(0, 1200),
    agentInstructions: String(value.agentInstructions || fallback.agentInstructions || "").trim().slice(0, 3000),
    levels: cleanList(value.levels ?? fallback.levels),
    grades: cleanList(value.grades ?? fallback.grades)
  };
}

async function readActivitySectionRecords(db, uid) {
  const snap = await db.collection(ACTIVITY_SECTION_COLLECTION).get();
  const rows = [];
  snap.forEach((doc) => {
    const row = { id: doc.id, ...(doc.data() || {}) };
    if (row.scope === "global" || (row.scope === "personal" && row.ownerUid === uid)) rows.push(row);
  });
  return rows.sort((a, b) => (a.scope === b.scope ? String(a.createdAt || "").localeCompare(String(b.createdAt || "")) : a.scope === "global" ? -1 : 1));
}

async function listEffectiveActivitySections(db, uid, { level = "", grade = "" } = {}) {
  const definitions = new Map(ACTIVITY_SECTION_DEFINITIONS.map((item) => {
    const original = normalizeActivitySectionDefinition(item, item);
    return [item.id, { ...original, original, sourceKind: "base", scope: "base", recordId: "", customized: false }];
  }));
  const records = await readActivitySectionRecords(db, uid);
  records.forEach((record) => {
    const targetId = String(record.targetId || "").trim();
    if (!targetId) return;
    const previous = definitions.get(targetId);
    if (!previous && record.sourceKind !== "custom") return;
    const original = normalizeActivitySectionDefinition(record.original || previous?.original || previous || {}, { id: targetId });
    const current = normalizeActivitySectionDefinition(record.current || {}, original);
    definitions.set(targetId, {
      ...current,
      id: targetId,
      original,
      sourceKind: String(record.sourceKind || "override"),
      scope: String(record.scope || "personal"),
      ownerUid: String(record.ownerUid || ""),
      recordId: record.id,
      revision: Number(record.revision || 1),
      customized: JSON.stringify(current) !== JSON.stringify(original)
    });
  });
  const cleanLevel = String(level || "").trim();
  const cleanGrade = String(grade || "").trim();
  return Array.from(definitions.values()).filter((section) => (
    (!section.levels.length || !cleanLevel || section.levels.includes(cleanLevel)) &&
    (!section.grades.length || !cleanGrade || section.grades.includes(cleanGrade))
  ));
}

function validateActivitySectionInput(value = {}) {
  const section = normalizeActivitySectionDefinition(value);
  if (!section.name) throw toolError("Escribe el nombre de la sección.", "ACTIVITY_SECTION_NAME_REQUIRED");
  if (!section.description) throw toolError("Escribe una descripción breve.", "ACTIVITY_SECTION_DESCRIPTION_REQUIRED");
  if (!section.objective) throw toolError("Escribe el propósito pedagógico.", "ACTIVITY_SECTION_OBJECTIVE_REQUIRED");
  if (!section.agentInstructions) throw toolError("Escribe las indicaciones para generar actividades.", "ACTIVITY_SECTION_INSTRUCTIONS_REQUIRED");
  return section;
}

function assertActivitySectionScope(scope, canManageGlobal) {
  const value = scope === "global" ? "global" : "personal";
  if (value === "global" && !canManageGlobal) throw toolError("Solo un editor puede guardar secciones para todos.", "ACTIVITY_SECTION_GLOBAL_FORBIDDEN");
  return value;
}

async function saveActivitySectionRecord({ db, uid, canManageGlobal, targetId = "", scope = "personal", current = {}, create = false }) {
  const safeScope = assertActivitySectionScope(scope, canManageGlobal);
  const now = new Date().toISOString();
  const records = await readActivitySectionRecords(db, uid);
  if (create) {
    const logicalId = `section_${randomUUID()}`;
    const definition = { ...validateActivitySectionInput(current), id: logicalId };
    const ref = db.collection(ACTIVITY_SECTION_COLLECTION).doc(`activity_section_${randomUUID()}`);
    await ref.set({
      targetId: logicalId, sourceKind: "custom", scope: safeScope,
      ownerUid: safeScope === "personal" ? uid : "", original: definition, current: definition,
      revision: 1, createdBy: uid, updatedBy: uid, createdAt: now, updatedAt: now
    });
    return logicalId;
  }
  const logicalId = String(targetId || "").trim();
  const effective = (await listEffectiveActivitySections(db, uid)).find((item) => item.id === logicalId);
  if (!effective) throw toolError("La sección que intentas editar ya no existe.", "ACTIVITY_SECTION_NOT_FOUND");
  const definition = { ...validateActivitySectionInput(current), id: logicalId };
  const existing = records.find((record) => record.targetId === logicalId && record.scope === safeScope && (safeScope === "global" || record.ownerUid === uid));
  if (existing) {
    await db.collection(ACTIVITY_SECTION_COLLECTION).doc(existing.id).set({
      current: definition, revision: Number(existing.revision || 0) + 1,
      updatedBy: uid, updatedAt: now, restoredAt: ""
    }, { merge: true });
  } else {
    const ref = db.collection(ACTIVITY_SECTION_COLLECTION).doc(`activity_section_${randomUUID()}`);
    await ref.set({
      targetId: logicalId, sourceKind: "override", scope: safeScope,
      ownerUid: safeScope === "personal" ? uid : "", original: effective.original || effective,
      current: definition, revision: 1, createdBy: uid, updatedBy: uid, createdAt: now, updatedAt: now
    });
  }
  return logicalId;
}

async function restoreActivitySectionRecord({ db, uid, canManageGlobal, targetId = "", scope = "personal" }) {
  const safeScope = assertActivitySectionScope(scope, canManageGlobal);
  const records = await readActivitySectionRecords(db, uid);
  const record = records.find((item) => item.targetId === targetId && item.scope === safeScope && (safeScope === "global" || item.ownerUid === uid));
  if (!record) throw toolError("No hay cambios guardados en ese alcance para restablecer.", "ACTIVITY_SECTION_OVERRIDE_NOT_FOUND");
  const now = new Date().toISOString();
  await db.collection(ACTIVITY_SECTION_COLLECTION).doc(record.id).set({
    current: normalizeActivitySectionDefinition(record.original || {}, { id: targetId }),
    revision: Number(record.revision || 0) + 1, updatedBy: uid, updatedAt: now, restoredAt: now
  }, { merge: true });
  return targetId;
}

function parseGeneratedJson(raw = "") {
  try { return JSON.parse(String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")); }
  catch (_) { return null; }
}

function createToolHandlers({ db, uid, generateText, research = researchArticleEvidenceServer, approvedUser = true, canManageGlobal = false }) {
  async function markWorkflowProposed({ sessionId, targetUnitId, stage = "", section = "", sectionId = "", proposalId = "" }) {
    const { ref, session } = await loadOwnedSession(db, uid, sessionId);
    const unit = requireUnit(session, targetUnitId);
    unit.workflow = normalizeWorkflow(unit.workflow, unit.accepted.reading);
    if (stage && unit.workflow.stages?.[stage]) {
      unit.workflow.stages[stage] = { ...unit.workflow.stages[stage], status: "proposed", proposalId };
    }
    if (section || sectionId) {
      unit.workflow.activitySections = unit.workflow.activitySections.map((item) => (sectionId && item.sectionId === sectionId) || (!sectionId && item.section === section)
        ? { ...item, section: section || item.section, sectionId: sectionId || item.sectionId || "", status: "proposed", proposalId }
        : item);
    }
    unit.updatedAt = new Date().toISOString();
    await ref.set({ ...session, units: session.units, updatedAt: unit.updatedAt }, { merge: true });
  }

  const handlers = {
    async get_session_context({ sessionId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      return { sessionId: session.id, title: session.title, academicMeta: session.academicMeta, activeUnitId: session.activeUnitId, unitCount: session.units.length };
    },
    async list_units({ sessionId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      return { units: session.units.map((unit) => ({ id: unit.id, title: unit.title, number: unit.meta.unit, revision: unit.revision, approvedCount: approvedContent(unit).length, active: unit.id === session.activeUnitId })) };
    },
    async read_unit({ sessionId, targetUnitId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      const curriculum = await resolveUnitCurriculum(db, unit);
      return { id: unit.id, title: unit.title, revision: unit.revision, meta: unit.meta, sya: curriculum.sya, syaContextKey: curriculum.contextKey, syaSource: curriculum.source, accepted: approvedContent(unit).map(({ html, ...item }) => ({ ...item, excerpt: String(html || item.text || "").replace(/<[^>]+>/g, " ").slice(0, 1200) })), researchRuns: unit.researchRuns.map((run) => ({ id: run.id, topic: run.topic, verifiedSourceCount: run.verifiedSourceCount })) };
    },
    async get_unit_curriculum({ sessionId, targetUnitId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      const curriculum = await resolveUnitCurriculum(db, unit);
      return { unitId: unit.id, meta: unit.meta, ...curriculum };
    },
    async list_unit_content({ sessionId, targetUnitId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      return { unitId: unit.id, revision: unit.revision, content: approvedContent(unit).map(({ html, text, ...item }) => ({ ...item, excerpt: String(html || text || "").replace(/<[^>]+>/g, " ").slice(0, 500) })) };
    },
    async read_content_item({ sessionId, targetUnitId, targetContentId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      const item = approvedContent(unit).find((content) => String(content.id) === String(targetContentId));
      if (!item) throw toolError("El recurso indicado no existe en esta unidad.", "CONTENT_NOT_FOUND");
      return { unitId: unit.id, content: item };
    },
    async list_readings({ collection: collectionName, query, limit }) {
      return { readings: await listReadingRecords(db, { collectionName, query, limit }), collections: READING_COLLECTIONS };
    },
    async read_reading({ collection: collectionName, readingId }) {
      if (!READING_COLLECTIONS.includes(collectionName)) throw toolError("Colección de lecturas no permitida.", "READING_COLLECTION_INVALID");
      const snap = await db.collection(collectionName).doc(String(readingId || "")).get();
      if (!snap.exists) throw toolError("La lectura no existe.", "READING_NOT_FOUND");
      return normalizeReadingRecord({ id: snap.id, ...(snap.data() || {}) }, collectionName);
    },
    async get_unit_workflow({ sessionId, targetUnitId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      return { unitId: unit.id, revision: unit.revision, workflow: normalizeWorkflow(unit.workflow, unit.accepted.reading), next: nextWorkflowStep(unit.workflow) };
    },
    async list_activity_sections({ sessionId, targetUnitId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      return {
        unitId: unit.id,
        grade: unit.meta.grade || "",
        sections: await listEffectiveActivitySections(db, uid, { level: unit.meta.level, grade: unit.meta.grade })
      };
    },
    async draft_activity_section({ sessionId, targetUnitId, targetId = "", brief }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      const sections = await listEffectiveActivitySections(db, uid, { level: unit.meta.level, grade: unit.meta.grade });
      const current = targetId ? sections.find((section) => section.id === targetId) || null : null;
      const prompt = [
        "Actúa como editor curricular. Devuelve únicamente JSON válido para crear o editar una sección de actividades.",
        "Claves obligatorias: name, description, objective, agentInstructions, levels, grades.",
        "description debe explicar el área en una frase breve; objective debe ser observable; agentInstructions debe ser un prompt operativo, concreto y sin frases genéricas.",
        "levels y grades deben ser arreglos de texto; usa arreglos vacíos cuando aplique a todos.",
        `Datos académicos: ${JSON.stringify({ level: unit.meta.level || "", grade: unit.meta.grade || "", trimester: unit.meta.trimester || "" })}`,
        `Secciones existentes para evitar duplicados: ${JSON.stringify(sections.map((section) => ({ id: section.id, name: section.name, description: section.description })))}`,
        current ? `Definición actual que se editará: ${JSON.stringify(current)}` : "Se creará una sección nueva.",
        `Petición del usuario: ${String(brief || "").trim()}`,
        NATURAL_STYLE_RULES
      ].join("\n\n");
      const generated = parseGeneratedJson(await generateText({ model: unit.meta.model || DEFAULT_CHARLY_MODEL, prompt, json: true, thinkingLevel: THINKING_LEVELS.creation }));
      if (!generated) throw toolError("No se pudo estructurar el borrador de la sección.", "ACTIVITY_SECTION_DRAFT_INVALID");
      return {
        targetId: current?.id || "",
        section: normalizeActivitySectionDefinition(generated, { id: current?.id || "draft" }),
        persisted: false,
        message: "Borrador listo. Muéstralo al usuario y pide confirmación antes de guardarlo."
      };
    },
    async create_activity_section({ scope, section }) {
      const targetId = await saveActivitySectionRecord({ db, uid, canManageGlobal, scope, current: section, create: true });
      return { targetId, sections: await listEffectiveActivitySections(db, uid) };
    },
    async update_activity_section({ targetId, scope, section }) {
      await saveActivitySectionRecord({ db, uid, canManageGlobal, targetId, scope, current: section, create: false });
      return { targetId, sections: await listEffectiveActivitySections(db, uid) };
    },
    async restore_activity_section({ targetId, scope }) {
      await restoreActivitySectionRecord({ db, uid, canManageGlobal, targetId, scope });
      return { targetId, sections: await listEffectiveActivitySections(db, uid) };
    },
    async propose_next_section({ sessionId, targetUnitId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      return { unitId: unit.id, revision: unit.revision, next: nextWorkflowStep(unit.workflow), message: "Esta es una sugerencia de flujo; no se generó ni aprobó contenido." };
    },
    async propose_content_change(args) {
      const { ref, session } = await loadOwnedSession(db, uid, args.sessionId);
      const unit = requireUnit(session, args.targetUnitId);
      if (Number(args.baseRevision) !== Number(unit.revision)) throw toolError("La unidad cambió desde que comenzó la edición. Vuelve a leerla antes de proponer.", "REVISION_CONFLICT");
      if (["update", "delete", "regenerate"].includes(args.action)) {
        const item = approvedContent(unit).find((content) => String(content.id) === String(args.targetContentId));
        if (!item) throw toolError("El recurso que intentas modificar no existe en esta unidad.", "CONTENT_NOT_FOUND");
      }
      const reviewed = ["create", "update", "regenerate"].includes(args.action)
        ? await reviewNaturalWriting({ html: args.html, model: args.model || unit.meta.model, generateText })
        : { html: "", corrections: [] };
      const proposal = {
        id: `proposal_${randomUUID()}`, status: "pending", action: args.action,
        targetUnitId: unit.id, targetContentId: String(args.targetContentId || ""),
        targetActivityId: String(args.targetActivityId || ""),
        baseRevision: Number(unit.revision), contentType: args.contentType,
        title: String(args.title || "Propuesta"), section: String(args.section || unit.meta.category || ""),
        sectionId: String(args.sectionId || ""),
        category: String(args.category || ""), subtopic: String(args.subtopic || ""),
        html: reviewed.html, styleReview: { corrections: reviewed.corrections, reviewedAt: new Date().toISOString(), voice: "docente-mexicano-natural" },
        researchRunIds: Array.isArray(args.researchRunIds) ? args.researchRunIds.filter((id) => unit.researchRuns.some((run) => run.id === id)) : [],
        citations: Array.isArray(args.citations) ? args.citations.slice(0, 20) : [],
        readingStage: String(args.readingStage || ""), artifact: args.artifact || null,
        createdAt: new Date().toISOString(), createdBy: "charly-mcp"
      };
      unit.proposals.unshift(proposal);
      unit.updatedAt = new Date().toISOString();
      await ref.set({ ...session, units: session.units, updatedAt: new Date().toISOString() }, { merge: true });
      return { proposal, message: "La propuesta quedó pendiente de aprobación; el panel aprobado todavía no cambió." };
    },
    async design_reading_stage(args) {
      const { session } = await loadOwnedSession(db, uid, args.sessionId);
      const unit = requireUnit(session, args.targetUnitId);
      if (Number(args.baseRevision) !== Number(unit.revision)) throw toolError("La unidad cambió. Vuelve a leerla antes de diseñar la lectura.", "REVISION_CONFLICT");
      const stage = args.readingStage;
      const approvedReading = unit.accepted.reading || null;
      if (stage !== "reading" && !approvedReading) throw toolError("Primero debe aprobarse la lectura antes de trabajar esta etapa.", "READING_REQUIRED");
      const sourceText = String(approvedReading?.html || approvedReading?.text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 18000);
      const memory = await readMemoryRows(db, { status: "active", resourceType: "reading", grade: unit.meta.grade, section: unit.meta.category }).catch(() => []);
      const stageInstruction = stage === "synonyms"
        ? "Crea únicamente una tabla de sinónimos basada en palabras que aparezcan en la lectura aprobada. Usa HTML <table> con palabra, sinónimo y significado contextual."
        : stage === "comprehension"
          ? "Crea únicamente preguntas de comprensión variadas sobre la lectura aprobada. Usa HTML estructurado con preguntas y una clave docente claramente separada."
          : "Crea únicamente la lectura narrativa, sin tabla de sinónimos ni preguntas. Usa título y párrafos HTML adecuados para la edad.";
      const prompt = [
        `Diseña la etapa ${stage} para ${unit.meta.level || "Primaria"}, ${unit.meta.grade || ""}.`,
        stageInstruction,
        args.brief ? `Solicitud del usuario: ${args.brief}` : "",
        sourceText ? `Lectura aprobada: ${sourceText}` : "",
        memory.length ? `Enseñanzas editoriales confirmadas: ${memory.slice(0, 8).map((item) => item.rule).join(" | ")}` : "",
        "Devuelve SOLO JSON válido con {\"title\":\"...\",\"html\":\"...\",\"citations\":[]}."
      ].filter(Boolean).join("\n\n");
      const artifact = parseGeneratedJson(await generateText?.({ model: args.model || unit.meta.model || DEFAULT_CHARLY_MODEL, prompt, json: true, thinkingLevel: THINKING_LEVELS.creation }));
      if (!artifact?.html) throw toolError("El agente no devolvió contenido estructurado para la lectura.", "READING_GENERATION_FAILED");
      const proposed = await handlers.propose_content_change({
        sessionId: args.sessionId, targetUnitId: unit.id,
        targetContentId: approvedReading?.id || "", baseRevision: args.baseRevision,
        action: approvedReading ? "update" : "create", contentType: "reading",
        title: String(artifact.title || approvedReading?.title || unit.title || "Lectura"),
        section: String(unit.meta.category || ""), html: String(artifact.html || ""),
        citations: Array.isArray(artifact.citations) ? artifact.citations : [],
        researchRunIds: args.researchRunIds || [], readingStage: stage, model: args.model
      });
      await markWorkflowProposed({ sessionId: args.sessionId, targetUnitId: unit.id, stage, proposalId: proposed.proposal.id });
      return { ...proposed, readingStage: stage, memoryUsed: memory.slice(0, 8).map((item) => item.id) };
    },
    async create_teacher_notes(args) {
      const { ref, session } = await loadOwnedSession(db, uid, args.sessionId);
      const unit = requireUnit(session, args.targetUnitId);
      if (Number(args.baseRevision) !== Number(unit.revision)) {
        throw toolError("La unidad cambió. Vuelve a leerla antes de crear las notas del maestro.", "REVISION_CONFLICT");
      }
      const mode = ["global", "single", "resource"].includes(args.mode) ? args.mode : "global";
      const targetActivityId = String(args.targetActivityId || "");
      const targetResourceId = String(args.targetResourceId || "");
      let items = [];
      let targetActivity = null;
      let targetResource = null;
      if (mode === "resource") {
        targetResource = unit.accepted.resources.find((item) => String(item.id) === targetResourceId) || null;
        if (!targetResource) throw toolError("El recurso aprobado indicado no existe.", "RESOURCE_NOT_FOUND");
        items = [targetResource];
      } else if (mode === "single") {
        targetActivity = unit.accepted.activities.find((item) => String(item.id) === targetActivityId) || null;
        if (!targetActivity) throw toolError("La actividad aprobada indicada no existe.", "ACTIVITY_NOT_FOUND");
        items = [targetActivity];
      } else {
        items = unit.accepted.activities;
      }
      if (!items.length) throw toolError("No hay actividades aprobadas para crear notas del maestro.", "APPROVED_ACTIVITIES_REQUIRED");
      if (!generateText) throw toolError("El generador de notas no está disponible.", "TEACHER_NOTES_GENERATOR_UNAVAILABLE");

      const curriculum = await resolveUnitCurriculum(db, unit);
      unit.sya = curriculum.sya || unit.sya;
      unit.syaContextKey = curriculum.contextKey || unit.syaContextKey;
      const prompt = buildTeacherNotesPrompt({ unit, items, mode, brief: args.brief });
      let generated = parseGeneratedJson(await generateText({
        model: args.model || unit.meta.model || DEFAULT_CHARLY_MODEL,
        prompt,
        json: true,
        thinkingLevel: THINKING_LEVELS.creation
      }));
      if (!generated?.html) throw toolError("El agente no devolvió notas del maestro estructuradas.", "TEACHER_NOTES_GENERATION_FAILED");
      const resourceMap = buildTeacherNotesResourceMap({ unit, items, mode });
      let resourceValidation = validateTeacherNotesResourceReferences(generated.html, resourceMap);
      if (!resourceValidation.ok && resourceMap.length) {
        const retryPrompt = `${prompt}\n\nREINTENTO OBLIGATORIO: la versión anterior omitió referencias explícitas. Corrige estos faltantes:\n- ${resourceValidation.missing.flatMap((entry) => entry.missing).join("\n- ")}\nMenciona literalmente cada recurso y su actividad vinculada, y explica preparación, momento de uso, acción del estudiante, evidencia y adaptación. Devuelve de nuevo el JSON completo.`;
        const retried = parseGeneratedJson(await generateText({
          model: args.model || unit.meta.model || DEFAULT_CHARLY_MODEL,
          prompt: retryPrompt,
          json: true,
          thinkingLevel: THINKING_LEVELS.creation
        }));
        if (retried?.html) generated = retried;
        resourceValidation = validateTeacherNotesResourceReferences(generated.html, resourceMap);
      }
      if (!resourceValidation.ok) {
        throw toolError(`Las notas no indican correctamente dónde usar todos los recursos: ${resourceValidation.missing.flatMap((entry) => entry.missing).join(", ")}.`, "TEACHER_NOTES_RESOURCE_REFERENCES_MISSING");
      }
      const reviewed = await reviewNaturalWriting({ html: generated.html, model: args.model || unit.meta.model, generateText });
      const reviewedResourceValidation = validateTeacherNotesResourceReferences(reviewed.html, resourceMap);
      if (!reviewedResourceValidation.ok) {
        throw toolError("La revisión editorial eliminó referencias obligatorias de recursos; las notas no se guardaron.", "TEACHER_NOTES_REVIEW_REMOVED_REFERENCES");
      }
      const now = new Date().toISOString();
      const notes = {
        id: `notes_${randomUUID()}`,
        title: String(generated.title || "Notas del maestro"),
        html: reviewed.html,
        mode,
        activityId: targetActivity?.id || "",
        resourceId: targetResource?.id || "",
        createdAt: now,
        createdBy: "charly-mcp",
        resourceUsage: resourceMap,
        styleReview: { corrections: reviewed.corrections, reviewedAt: now, voice: "docente-mexicano-natural" }
      };
      if (targetActivity) targetActivity.notes = [...(targetActivity.notes || []), notes];
      else if (targetResource) targetResource.notes = [...(targetResource.notes || []), notes];
      else unit.accepted.teacherNotes.push(notes);
      unit.revision = Math.max(0, Number(unit.revision || 0)) + 1;
      unit.updatedAt = now;
      await ref.set({ ...session, units: session.units, updatedAt: now }, { merge: true });
      return {
        teacherNotes: notes,
        unitId: unit.id,
        revision: unit.revision,
        saved: true,
        message: mode === "resource" ? "Notas del recurso creadas y guardadas." : mode === "single" ? "Notas de la actividad creadas y guardadas." : "Notas globales del maestro creadas y guardadas."
      };
    },
    async _design_resource(type, args) {
      const { session } = await loadOwnedSession(db, uid, args.sessionId);
      const unit = requireUnit(session, args.targetUnitId);
      if (Number(args.baseRevision) !== Number(unit.revision)) throw toolError("La unidad cambió. Vuelve a leerla antes de diseñar el recurso.", "REVISION_CONFLICT");
      const curriculum = await resolveUnitCurriculum(db, unit);
      unit.sya = curriculum.sya;
      unit.syaContextKey = curriculum.contextKey;
      const sectionCatalog = type === "activity"
        ? await listEffectiveActivitySections(db, uid, { level: unit.meta.level, grade: unit.meta.grade })
        : [];
      const sectionDefinition = type === "activity"
        ? sectionCatalog.find((item) => item.id === String(args.sectionId || "")) || sectionCatalog.find((item) => item.name === String(args.section || ""))
        : null;
      const activity = type === "activity"
        ? { id: "", title: args.title || sectionDefinition?.name || args.section || "Actividad", section: args.section || sectionDefinition?.name || unit.meta.category || "", sectionId: sectionDefinition?.id || args.sectionId || "", category: args.category || unit.meta.category || "", subtopic: args.subtopic || unit.meta.subtopic || "", html: args.brief || "" }
        : unit.accepted.activities.find((item) => String(item.id) === String(args.targetActivityId || ""));
      if (type !== "activity" && !activity) throw toolError("La actividad vinculada no existe en esta unidad.", "ACTIVITY_NOT_FOUND");
      const memory = await readMemoryRows(db, { status: "active", resourceType: type, grade: unit.meta.grade, section: activity.section }).catch(() => []);
      let artifact = null;
      let generationPrompt = "";
      if (generateText) {
        generationPrompt = type === "activity"
          ? buildActivityPrompt({
              unit,
              activity,
              sectionDefinition,
              brief: args.brief,
              memory: memory.slice(0, 8),
              structureMode: args.structureMode,
              structureInstructions: args.structureInstructions,
              resourceTypes: args.resourceTypes || []
            })
          : buildResourcePrompt({ type, unit, activity, brief: args.brief, memory: memory.slice(0, 8) });
        artifact = parseGeneratedJson(await generateText({ model: args.model || unit.meta.model || DEFAULT_CHARLY_MODEL, prompt: generationPrompt, json: true, thinkingLevel: THINKING_LEVELS.creation }));
      }
      artifact = artifact && typeof artifact === "object" ? artifact : fallbackArtifact({ type, activity, unit });
      artifact.title = String(artifact.title || args.title || `${type} de ${activity.section || unit.title}`);
      artifact.activityId = activity.id || "";
      let projectValidation = type === "activity"
        ? validateProjectArtifact(artifact, unit, activity)
        : { ok: true, errors: [], methodology: "", phases: [] };
      let embeddedResourceValidation = type === "activity"
        ? validateEmbeddedActivityResources(artifact.html, args.resourceTypes || [])
        : { ok: true, errors: [] };
      if (type === "activity" && (!projectValidation.ok || !embeddedResourceValidation.ok) && generateText) {
        const retryErrors = [...projectValidation.errors, ...embeddedResourceValidation.errors];
        const retryPrompt = `${generationPrompt}\n\nREINTENTO OBLIGATORIO. Corrige estos incumplimientos:\n- ${retryErrors.join("\n- ")}\nDevuelve nuevamente SOLO el JSON completo solicitado.`;
        const retried = parseGeneratedJson(await generateText({ model: args.model || unit.meta.model || DEFAULT_CHARLY_MODEL, prompt: retryPrompt, json: true, thinkingLevel: THINKING_LEVELS.creation }));
        if (retried && typeof retried === "object") {
          artifact = retried;
          artifact.title = String(artifact.title || args.title || `${type} de ${activity.section || unit.title}`);
          artifact.activityId = "";
          projectValidation = validateProjectArtifact(artifact, unit, activity);
          embeddedResourceValidation = validateEmbeddedActivityResources(artifact.html, args.resourceTypes || []);
        }
      }
      if (type === "cutout") {
        artifact.cutoutDocument = normalizeCutoutDocument(artifact.cutoutDocument || artifact.document || {});
        const rendered = await renderCutoutPdf(artifact.cutoutDocument);
        artifact.svg = rendered.svg;
        artifact.pdfBase64 = rendered.pdfBase64 || "";
        artifact.pdfMimeType = rendered.pdfMimeType;
        artifact.html = `${artifact.html || ""}<div class="cb-cutout-preview">${rendered.svg}</div>`;
      }
      const resourceValidation = validateResourceArtifact(artifact, type);
      const validation = { ...resourceValidation, ok: resourceValidation.ok && projectValidation.ok && embeddedResourceValidation.ok, project: projectValidation, embeddedResources: embeddedResourceValidation };
      if (!validation.ok) throw toolError(`El recurso no pasó validación: ${[...resourceValidation.errors, ...projectValidation.errors, ...embeddedResourceValidation.errors].join(" ")}`, projectValidation.ok ? "RESOURCE_VALIDATION_FAILED" : "PROJECT_VALIDATION_FAILED");
      const proposed = await handlers.propose_content_change({
        sessionId: args.sessionId, targetUnitId: args.targetUnitId, targetActivityId: activity.id,
        targetContentId: args.targetContentId || "", baseRevision: args.baseRevision,
        action: args.targetContentId ? "regenerate" : "create", contentType: type,
        title: artifact.title, section: activity.section || args.section || unit.meta.category || "", sectionId: activity.sectionId || args.sectionId || "",
        category: activity.category || args.category || "", subtopic: activity.subtopic || args.subtopic || "",
        html: artifact.html || "", artifact, citations: artifact.citations || [], researchRunIds: args.researchRunIds || [], model: args.model
      });
      if (type === "activity") {
        await markWorkflowProposed({ sessionId: args.sessionId, targetUnitId: unit.id, section: activity.section, sectionId: activity.sectionId, proposalId: proposed.proposal.id });
      }
      return { ...proposed, validation, memoryUsed: memory.slice(0, 8).map((item) => item.id), syaUsed: Boolean(curriculum.sya), syaContextKey: curriculum.contextKey, syaSource: curriculum.source };
    },
    async design_activity(args) { return handlers._design_resource("activity", args); },
    async design_worksheet(args) { return handlers._design_resource("worksheet", args); },
    async design_annex(args) { return handlers._design_resource("annex", args); },
    async design_cutout(args) { return handlers._design_resource("cutout", args); },
    async design_video_script(args) { return handlers._design_resource("video-script", args); },
    async validate_resource_artifact({ resourceType, artifact }) {
      return validateResourceArtifact(artifact || {}, resourceType);
    },
    async render_cutout({ cutoutDocument }) {
      const rendered = await renderCutoutPdf(cutoutDocument || {});
      return { document: rendered.document, svg: rendered.svg, pdfBase64: rendered.pdfBase64, pdfMimeType: rendered.pdfMimeType, pdfError: rendered.pdfError || "", validation: validateResourceArtifact({ title: rendered.document.title, activityId: "render-only", cutoutDocument: rendered.document }, "cutout") };
    },
    async list_unit_citations({ sessionId, targetUnitId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      return { unitId: unit.id, citations: collectUnitCitations(unit) };
    },
    async format_bibliography_apa7({ citations }) {
      return { citations: (Array.isArray(citations) ? citations : []).map((citation) => ({ ...citation, apa: formatApa7(citation) })) };
    },
    async search_teaching_memory({ resourceType, grade, section, query, limit = 12 }) {
      const rows = await readMemoryRows(db, { status: "active", resourceType, grade, section });
      const needle = String(query || "").toLowerCase();
      return { memories: rows.filter((item) => !needle || `${item.rule} ${item.explanation || ""}`.toLowerCase().includes(needle)).slice(0, Math.min(30, limit)) };
    },
    async propose_teaching_memory(args) {
      if (!approvedUser) throw toolError("Tu cuenta no está aprobada para proponer memoria organizacional.", "MEMORY_FORBIDDEN");
      const now = new Date().toISOString();
      const row = {
        id: createAgentId("memory"), status: "candidate", rule: String(args.rule || "").trim(), explanation: String(args.explanation || "").trim(),
        resourceType: String(args.resourceType || ""), grade: String(args.grade || ""), section: String(args.section || ""),
        beforeExample: String(args.beforeExample || ""), afterExample: String(args.afterExample || ""),
        sourceSessionId: String(args.sessionId || ""), sourceUnitId: String(args.targetUnitId || ""), sourceContentId: String(args.targetContentId || ""),
        version: 1, createdBy: uid, createdAt: now, updatedAt: now
      };
      if (!row.rule) throw toolError("La enseñanza necesita una regla concreta.", "MEMORY_RULE_REQUIRED");
      await db.collection(MEMORY_COLLECTION).doc(row.id).set(row);
      return { memory: row, requiresConfirmation: true };
    },
    async confirm_teaching_memory({ memoryId, confirm }) {
      if (!approvedUser || confirm !== true) throw toolError("La publicación requiere confirmación explícita de un usuario aprobado.", "MEMORY_CONFIRMATION_REQUIRED");
      const ref = db.collection(MEMORY_COLLECTION).doc(memoryId);
      const snap = await ref.get();
      if (!snap.exists) throw toolError("La enseñanza no existe.", "MEMORY_NOT_FOUND");
      const now = new Date().toISOString();
      await ref.set({ status: "active", confirmedBy: uid, confirmedAt: now, updatedAt: now }, { merge: true });
      return { id: memoryId, status: "active", confirmedBy: uid, confirmedAt: now };
    },
    async list_teaching_memory({ status = "active", limit = 50 }) {
      return { memories: (await readMemoryRows(db, { status })).slice(0, Math.min(100, limit)) };
    },
    async archive_teaching_memory({ memoryId }) {
      if (!approvedUser) throw toolError("Tu cuenta no está aprobada para archivar memoria organizacional.", "MEMORY_FORBIDDEN");
      const ref = db.collection(MEMORY_COLLECTION).doc(memoryId);
      const snap = await ref.get();
      if (!snap.exists) throw toolError("La enseñanza no existe.", "MEMORY_NOT_FOUND");
      const now = new Date().toISOString();
      await ref.set({ status: "archived", archivedBy: uid, archivedAt: now, updatedAt: now }, { merge: true });
      return { id: memoryId, status: "archived" };
    },
    async research_topic(args) {
      const { ref, session } = await loadOwnedSession(db, uid, args.sessionId);
      const unit = requireUnit(session, args.targetUnitId);
      const complex = args.depth === "deep" || /salud|medic|riesgo|cient[ií]fic|hist[oó]ric|controvers|actual/i.test(args.topic);
      const minimumSources = complex ? 6 : 3;
      const dossier = await research({
        topic: args.topic, audience: `docentes y estudiantes de ${unit.meta.grade || "Primaria"}`,
        mode: "marcie", minimumSources, region: "MX", period: args.period || "12m",
        searchPlatforms: researchPolicy.selection({}),
        researchInstructions: ["Redactar para libros educativos", "Priorizar documentos originales y fuentes en español cuando sean equivalentes"]
      });
      const run = {
        id: `research_${randomUUID()}`, unitId: unit.id, topic: args.topic, depth: complex ? "deep" : "standard",
        sources: dossier.sources || [], rejectedSources: dossier.rejectedSources || [], facts: dossier.facts || [],
        summary: dossier.summary || "", blockers: dossier.blockers || [], verifiedSourceCount: Number(dossier.verifiedSourceCount || 0),
        searchPlatforms: dossier.searchPlatforms || [], verificationStatus: dossier.verificationStatus || "blocked", createdAt: new Date().toISOString()
      };
      unit.researchRuns.unshift(run);
      unit.updatedAt = new Date().toISOString();
      await ref.set({ ...session, units: session.units, updatedAt: new Date().toISOString() }, { merge: true });
      return { researchRunId: run.id, topic: run.topic, summary: run.summary, facts: run.facts, sources: run.sources, blockers: run.blockers, verifiedSourceCount: run.verifiedSourceCount };
    },
    async read_research_run({ sessionId, targetUnitId, researchRunId }) {
      const { session } = await loadOwnedSession(db, uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      const run = unit.researchRuns.find((item) => item.id === researchRunId);
      if (!run) throw toolError("La investigación indicada no pertenece a esta unidad.", "RESEARCH_NOT_FOUND");
      return run;
    }
  };
  return handlers;
}

function registerTools(server, handlers) {
  const sessionId = z.string().min(1);
  const targetUnitId = z.string().min(1);
  const add = (name, description, inputSchema) => server.registerTool(name, { description, inputSchema }, async (args) => textResult(await handlers[name](args)));
  add("get_session_context", "Lee los datos académicos y la unidad activa de una sesión.", { sessionId });
  add("list_units", "Lista unidades sin inyectar sus conversaciones.", { sessionId });
  add("read_unit", "Lee una unidad específica en modo de solo lectura.", { sessionId, targetUnitId });
  add("get_unit_curriculum", "Lee la secuencia y alcance exacta de una unidad según nivel, grado, trimestre y número de unidad.", { sessionId, targetUnitId });
  add("list_unit_content", "Lista solo contenido aprobado de una unidad.", { sessionId, targetUnitId });
  add("read_content_item", "Lee un recurso aprobado por identificador.", { sessionId, targetUnitId, targetContentId: z.string().min(1) });
  add("list_readings", "Lista lecturas disponibles de lecturasNuevas y lecturasASC.", { collection: z.enum(READING_COLLECTIONS).optional(), query: z.string().max(500).optional(), limit: z.number().int().min(1).max(400).optional() });
  add("read_reading", "Lee una lectura concreta conservando su colección de origen.", { collection: z.enum(READING_COLLECTIONS), readingId: z.string().min(1) });
  add("get_unit_workflow", "Lee el avance Lectura, Sinónimos, Comprensión, Actividades y Recursos de una unidad.", { sessionId, targetUnitId });
  add("list_activity_sections", "Lista las secciones curriculares disponibles para elegir actividades.", { sessionId, targetUnitId });
  const activitySectionSchema = {
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(600),
    objective: z.string().min(1).max(1200),
    agentInstructions: z.string().min(1).max(3000),
    levels: z.array(z.string().max(80)).max(30).optional(),
    grades: z.array(z.string().max(80)).max(30).optional()
  };
  add("draft_activity_section", "Prepara un borrador estructurado para crear o editar una sección sin guardarlo en Firebase.", { sessionId, targetUnitId, targetId: z.string().optional(), brief: z.string().min(1).max(8000) });
  add("create_activity_section", "Crea una sección curricular personal o global sin alterar el catálogo base.", { scope: z.enum(["personal", "global"]), section: z.object(activitySectionSchema) });
  add("update_activity_section", "Guarda una personalización versionada de una sección curricular.", { targetId: z.string().min(1), scope: z.enum(["personal", "global"]), section: z.object(activitySectionSchema) });
  add("restore_activity_section", "Restablece una sección a su definición original sin borrar el historial.", { targetId: z.string().min(1), scope: z.enum(["personal", "global"]) });
  add("propose_next_section", "Indica el siguiente paso del flujo sin generar ni aprobar contenido.", { sessionId, targetUnitId });
  add("propose_content_change", "Crea una propuesta dirigida; nunca aprueba ni modifica directamente el panel.", {
    sessionId, targetUnitId, targetContentId: z.string().optional(), targetActivityId: z.string().optional(), baseRevision: z.number().int().min(0),
    action: z.enum(["create", "update", "delete", "regenerate"]), contentType: z.enum(CONTENT_TYPES),
    title: z.string().max(240), section: z.string().max(240).optional(), sectionId: z.string().max(200).optional(), html: z.string().max(120000).optional(),
    category: z.string().max(240).optional(), subtopic: z.string().max(240).optional(),
    researchRunIds: z.array(z.string()).max(12).optional(), citations: z.array(z.object({ sourceId: z.string().optional(), title: z.string(), url: z.string().url(), authors: z.any().optional(), year: z.any().optional(), publication: z.string().optional(), doi: z.string().optional() })).max(20).optional(),
    readingStage: z.enum(["reading", "synonyms", "comprehension"]).optional(), artifact: z.any().optional(), model: z.string().optional()
  });
  add("design_reading_stage", "Diseña Lectura, Sinónimos o Comprensión como una etapa del único recurso de lectura y crea una propuesta pendiente.", {
    sessionId, targetUnitId, baseRevision: z.number().int().min(0),
    readingStage: z.enum(["reading", "synonyms", "comprehension"]),
    brief: z.string().max(12000).optional(), researchRunIds: z.array(z.string()).max(12).optional(), model: z.string().optional()
  });
  add("create_teacher_notes", "Crea y guarda notas del maestro a partir de actividades o recursos aprobados, la lectura y la secuencia de la unidad.", {
    sessionId, targetUnitId, baseRevision: z.number().int().min(0),
    mode: z.enum(["global", "single", "resource"]),
    targetActivityId: z.string().optional(), targetResourceId: z.string().optional(),
    brief: z.string().max(12000).optional(), model: z.string().optional()
  });
  const designSchema = {
    sessionId, targetUnitId, targetActivityId: z.string().optional(), targetContentId: z.string().optional(),
    baseRevision: z.number().int().min(0), section: z.string().max(240).optional(), sectionId: z.string().max(200).optional(), title: z.string().max(240).optional(),
    brief: z.string().max(12000).optional(), researchRunIds: z.array(z.string()).max(12).optional(), model: z.string().optional()
  };
  const designActivitySchema = {
    ...designSchema,
    category: z.string().max(240).optional(),
    subtopic: z.string().max(240).optional(),
    resourceTypes: z.array(z.enum(["worksheet", "annex", "cutout", "video-script"])).min(1).max(4).optional(),
    structureMode: z.enum(["default", "custom"]).optional(),
    structureInstructions: z.string().max(12000).optional()
  };
  add("design_activity", "Diseña una actividad y crea una propuesta pendiente. Admite otra estructura cuando el usuario la solicita explícitamente mediante structureMode=custom y structureInstructions.", designActivitySchema);
  add("design_worksheet", "Diseña una ficha vinculada a una actividad y crea una propuesta pendiente.", { ...designSchema, targetActivityId: z.string().min(1) });
  add("design_annex", "Diseña un anexo vinculado a una actividad y crea una propuesta pendiente.", { ...designSchema, targetActivityId: z.string().min(1) });
  add("design_cutout", "Diseña un recortable editorial interactivo, validado y listo para impresión.", { ...designSchema, targetActivityId: z.string().min(1) });
  add("design_video_script", "Diseña un video como producto final vinculado a una actividad y crea una propuesta pendiente.", { ...designSchema, targetActivityId: z.string().min(1) });
  add("validate_resource_artifact", "Valida estructura, vínculo pedagógico y requisitos editoriales de un recurso.", { resourceType: z.enum(CONTENT_TYPES), artifact: z.any() });
  add("render_cutout", "Renderiza un CutoutDocument como SVG y PDF imprimible.", { cutoutDocument: z.any() });
  add("list_unit_citations", "Lista y deduplica las fuentes de contenido aprobado en una unidad.", { sessionId, targetUnitId });
  add("format_bibliography_apa7", "Formatea referencias estructuradas en APA 7.", { citations: z.array(z.any()).max(100) });
  add("search_teaching_memory", "Recupera enseñanzas editoriales activas de la organización.", { resourceType: z.string().optional(), grade: z.string().optional(), section: z.string().optional(), query: z.string().optional(), limit: z.number().int().min(1).max(30).optional() });
  add("propose_teaching_memory", "Crea un candidato de aprendizaje; requiere confirmación antes de activarse.", { rule: z.string().min(3).max(3000), explanation: z.string().max(5000).optional(), resourceType: z.string().optional(), grade: z.string().optional(), section: z.string().optional(), beforeExample: z.string().max(12000).optional(), afterExample: z.string().max(12000).optional(), sessionId: z.string().optional(), targetUnitId: z.string().optional(), targetContentId: z.string().optional() });
  add("confirm_teaching_memory", "Publica una enseñanza organizacional con confirmación explícita.", { memoryId: z.string().min(1), confirm: z.literal(true) });
  add("list_teaching_memory", "Lista memoria organizacional por estado.", { status: z.enum(["candidate", "active", "archived"]).optional(), limit: z.number().int().min(1).max(100).optional() });
  add("archive_teaching_memory", "Archiva una enseñanza sin borrar su auditoría.", { memoryId: z.string().min(1) });
  add("research_topic", "Investiga un tema en fuentes académicas de Marcie y verifica documentos originales.", { sessionId, targetUnitId, topic: z.string().min(3).max(2000), depth: z.enum(["standard", "deep"]).optional(), period: z.enum(["1m", "3m", "6m", "12m"]).optional() });
  add("read_research_run", "Lee un expediente de investigación perteneciente a una unidad.", { sessionId, targetUnitId, researchRunId: z.string().min(1) });
}

function createServer(context) {
  const server = new McpServer({ name: "charly-brown-editor", version: "2.1.0" });
  registerTools(server, createToolHandlers(context));
  return server;
}

async function createLocalClient(context) {
  const server = createServer(context);
  const client = new Client({ name: "charly-brown-chat-agent", version: "2.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, close: async () => { await client.close(); await server.close(); } };
}

function toolResultJson(result = {}) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text || "{}";
  try { return JSON.parse(text); } catch (_) { return { text }; }
}

function responseParts(response = {}) { return response.candidates?.[0]?.content?.parts || []; }
function responseText(response = {}) { return responseParts(response).map((part) => part.text || "").join("\n").trim(); }

function isTransientGeminiError(error) {
  const status = Number(error?.status || error?.code || error?.response?.status || 0);
  const details = [error?.message, error?.response?.data, error?.cause?.message]
    .filter(Boolean)
    .map((value) => typeof value === "string" ? value : JSON.stringify(value))
    .join(" ");
  return [429, 500, 502, 503, 504].includes(status)
    || /RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|overloaded|temporar|rate.?limit|quota/i.test(details);
}

function readableGeminiError(error) {
  const raw = String(error?.message || error?.code || "No se pudo completar la solicitud.");
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error?.message || parsed?.message || raw);
  } catch (_) {
    return raw;
  }
}

async function withGeminiRetry(operation, { maxAttempts = 3, baseDelayMs = 800, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransientGeminiError(error) || attempt >= maxAttempts) throw error;
      await sleep(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function selectAgentTools(tools = [], userText = "") {
  const value = String(userText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const selected = new Set([
    "get_session_context", "list_units", "read_unit", "get_unit_workflow", "propose_next_section",
    "list_unit_content", "read_content_item", "search_teaching_memory", "propose_content_change"
  ]);
  const add = (...names) => names.forEach((name) => selected.add(name));
  if (/lectura|sinonim|comprension|design_reading_stage|reading/.test(value)) add("list_readings", "read_reading", "design_reading_stage");
  if (/actividad|proyecto|seccion|design_activity/.test(value)) add("get_unit_curriculum", "list_activity_sections", "design_activity");
  if (/nota|maestro|docente|profesor|create_teacher_notes/.test(value)) add("get_unit_curriculum", "create_teacher_notes");
  if (/ficha|worksheet|design_worksheet/.test(value)) add("design_worksheet");
  if (/anexo|annex|design_annex/.test(value)) add("design_annex");
  if (/recort|puzzle|collage|design_cutout/.test(value)) add("design_cutout", "validate_resource_artifact", "render_cutout");
  if (/guion|video|design_video_script/.test(value)) add("design_video_script");
  if (/investig|profund|fuente|bibliograf|cita|doi|apa|research/.test(value)) add("research_topic", "read_research_run", "list_unit_citations", "format_bibliography_apa7");
  if (/crear.*seccion|editar.*seccion|prompt.*seccion|draft_activity_section/.test(value)) add("list_activity_sections", "draft_activity_section", "create_activity_section", "update_activity_section", "restore_activity_section");
  if (/recuerda|ensenanza|memoria|aprende|te enseno/.test(value)) add("propose_teaching_memory", "confirm_teaching_memory", "list_teaching_memory", "archive_teaching_memory");
  return tools.filter((tool) => selected.has(tool.name));
}

function proposalCompletion(value = {}) {
  const proposal = value?.proposal || {};
  const labels = { reading: "la lectura", activity: "la actividad", worksheet: "la ficha", annex: "el anexo", cutout: "el recortable", "video-script": "el video" };
  const label = labels[proposal.contentType] || "el contenido";
  const title = String(proposal.title || "Propuesta").trim();
  const specifications = [
    "## Especificaciones de la propuesta",
    `- **Tipo:** ${proposal.contentType || "contenido"}`,
    proposal.section ? `- **Sección:** ${proposal.section}` : "",
    proposal.readingStage ? `- **Etapa:** ${proposal.readingStage}` : "",
    proposal.targetActivityId ? `- **Actividad vinculada:** ${proposal.targetActivityId}` : "",
    `- **Estado:** pendiente de aprobación`,
    `- **Revisión base:** ${Number(proposal.baseRevision || 0)}`,
    Array.isArray(proposal.citations) && proposal.citations.length ? `- **Fuentes verificadas:** ${proposal.citations.length}` : ""
  ].filter(Boolean).join("\n");
  return { text: `Preparé ${label} “${title}”. Revísala en la propuesta y apruébala cuando esté lista.`, specifications };
}

function buildAgentHistory(messages = [], userText = "") {
  const turns = [];
  for (const message of (Array.isArray(messages) ? messages : []).slice(-12)) {
    if (message?.html && !String(message?.text || "").trim()) continue;
    const role = message?.role === "assistant" ? "model" : "user";
    const visible = String(message?.text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    const specifications = String(message?.specifications || "").trim().slice(0, 2400);
    const text = specifications ? `${visible}\n\nEspecificaciones asociadas:\n${specifications}` : visible;
    if (!text) continue;
    const previous = turns.at(-1);
    if (previous?.role === role) {
      previous.parts[0].text = `${previous.parts[0].text}\n\n${text}`.slice(-6400);
    } else {
      turns.push({ role, parts: [{ text }] });
    }
  }
  while (turns[0]?.role === "model") turns.shift();
  const prompt = String(userText || "").trim();
  const last = turns.at(-1);
  if (!last || last.role !== "user") {
    if (prompt) turns.push({ role: "user", parts: [{ text: prompt }] });
  } else if (prompt && !last.parts?.[0]?.text.includes(prompt)) {
    last.parts[0].text = `${last.parts[0].text}\n\n${prompt}`.slice(-6400);
  }
  return turns.slice(-8);
}

function ensureUserTurn(contents = [], fallbackText = "Continúa con la solicitud del usuario.") {
  if (contents.at(-1)?.role !== "user") {
    contents.push({ role: "user", parts: [{ text: fallbackText }] });
  }
  return contents;
}

function splitAgentResponse(value = "") {
  const source = String(value || "").trim();
  const match = source.match(/<cb-specifications>([\s\S]*?)<\/cb-specifications>/i);
  if (!match) return { text: source, specifications: "" };
  const specifications = String(match[1] || "").trim().slice(0, 24000);
  const text = source.replace(match[0], "").trim() || "Preparé las especificaciones para esta propuesta.";
  return { text, specifications };
}

async function runChatAgent({ context, sessionId, targetUnitId, userText, model }) {
  const { client, close } = await createLocalClient(context);
  try {
    const toolList = await client.listTools();
    const { session } = await loadOwnedSession(context.db, context.uid, sessionId);
    const unit = requireUnit(session, targetUnitId);
    const curriculum = await resolveUnitCurriculum(context.db, unit);
    if (typeof context.generateContent !== "function") {
      throw toolError("El generador Vertex no está configurado para el agente.", "VERTEX_NOT_CONFIGURED");
    }
    const relevantTools = selectAgentTools(toolList.tools, userText);
    const tools = [{ functionDeclarations: relevantTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) }];
    const systemInstruction = [
      "Eres Charly Brown, editor conversacional de libros educativos.",
      `Trabajas únicamente en sessionId=${sessionId} y targetUnitId=${targetUnitId}.`,
      `Datos académicos generales de la sesión: ${JSON.stringify(session.academicMeta || {})}. Úsalos como contexto obligatorio para nivel, grado, trimestre, edición y tipo de libro.`,
      "No modifiques contenido directamente: usa propose_content_change y espera aprobación humana.",
      "Crea como máximo una propuesta editorial por turno. El contenido extenso se trabaja por etapas y nunca se generan varios recursos pesados en una sola respuesta.",
      "En cada respuesta final escribe primero un comentario breve y natural de una o dos oraciones para mostrar en el chat. Si hay requisitos, decisiones pedagógicas, estructura, materiales, criterios o pasos de generación, colócalos únicamente entre <cb-specifications> y </cb-specifications> en Markdown. No repitas esas especificaciones fuera del bloque.",
      "Antes de diseñar contenido, consulta search_teaching_memory con el grado, la sección y el tipo de recurso. La memoria activa es orientación editorial, no autorización para aprobar.",
      "Cuando el usuario diga que recuerdes una enseñanza o corrija un patrón reutilizable, usa propose_teaching_memory y muestra la regla candidata. No la confirmes en el mismo turno; usa confirm_teaching_memory solo después de una confirmación explícita posterior del usuario.",
      "Para crear o editar una sección, consulta list_activity_sections y usa draft_activity_section. Muestra el borrador y pregunta si debe guardarse para el usuario o para todos; llama create_activity_section o update_activity_section únicamente después de una confirmación explícita. Restablece solo cuando el usuario lo solicite expresamente.",
      "Para actividades consulta primero list_activity_sections y usa design_activity con sectionId y el nombre vigentes. Si el usuario pide explícitamente otra estructura, llama design_activity con structureMode=custom y copia sus requisitos estructurales concretos en structureInstructions; no actives custom por iniciativa propia. Para fichas, anexos, recortables y videos usa design_worksheet, design_annex, design_cutout y design_video_script; vincula siempre targetActivityId. Presenta siempre el video como producto final y nunca menciones su documento de planificación o escritura audiovisual.",
      "Cuando la sección sea Proyectos, respeta el contrato trimestral de design_activity: trimestre 1 usa ABP, trimestre 2 usa STEAM y trimestre 3 usa AS. No intercambies metodologías ni fases.",
      "Antes de proponer una actividad consulta get_unit_curriculum. Usa la secuencia y alcance correspondiente al nivel, grado, trimestre y unidad como instrucción curricular obligatoria.",
      "Para Lectura, Sinónimos y Comprensión usa design_reading_stage con la etapa exacta indicada por get_unit_workflow.",
      "Para notas del maestro usa create_teacher_notes. Esta herramienta guarda las notas en la unidad, actividad o recurso aprobado indicado; no uses design_activity para redactarlas.",
      "Usa get_unit_workflow y propose_next_section para respetar el orden Lectura, Sinónimos, Comprensión, Actividades y Recursos.",
      "Antes de corregir un recurso existente, léelo por id y conserva su unidad. Nunca sustituyas otra sección por semejanza de título.",
      "Para actividades usa por defecto HTML con un bloque <div class=\"activity\">, instrucción principal en <strong>, una lista <ol class=\"steps steps-numbered\"> y respuestas esperadas dentro de <div class=\"answer\">. Cuando structureMode=custom, sigue structureInstructions en lugar de ese molde, sin perder rigor curricular. Mantén fichas, anexos, recortables y videos como recursos separados.",
      "Lectura, sinónimos y comprensión se aprueban por etapas, pero actualizan un único recurso reading. Usa readingStage para no crear tarjetas duplicadas.",
      "Consulta unidades anteriores solo cuando haga falta, con list_units y read_unit; no supongas su contenido.",
      "Cuando el usuario pida profundizar, comprobar datos o trate un tema científico, histórico, médico o actual, usa research_topic.",
      "Cita con enlaces las fuentes verificadas. Si la evidencia es insuficiente, dilo con claridad.",
      NATURAL_STYLE_RULES,
      `Contexto activo: ${JSON.stringify({ academicMeta: session.academicMeta || {}, title: unit.title, revision: unit.revision, meta: unit.meta, reading: unit.accepted.reading ? { id: unit.accepted.reading.id, ...buildActivityReadingContext(unit) } : null, sya: curriculum.sya, syaContextKey: curriculum.contextKey, syaSource: curriculum.source, approvedContent: approvedContent(unit).map((item) => ({ id: item.id, type: item.type, title: item.title, section: item.section })) })}`
    ].join("\n");
    const contents = buildAgentHistory(unit.messages, userText);
    const usedTools = [];
    const calledTools = new Set();
    for (let turn = 0; turn < 5; turn += 1) {
      ensureUserTurn(contents, userText);
      const response = await context.generateContent({
        model: DEFAULT_CHARLY_MODEL,
        contents,
        config: {
          systemInstruction,
          tools,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingLevel: THINKING_LEVELS.agent }
        }
      });
      const parts = responseParts(response);
      const calls = parts.filter((part) => part.functionCall).map((part) => part.functionCall);
      if (!calls.length) {
        const finalResponse = splitAgentResponse(responseText(response) || "Listo. ¿Qué quieres ajustar ahora?");
        return { ...finalResponse, usedTools };
      }
      contents.push({ role: "model", parts });
      const functionParts = [];
      let completedProposal = null;
      for (const call of calls) {
        const signature = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (calledTools.has(signature)) {
          const value = { error: "duplicate_tool_call", message: "La herramienta ya se ejecutó con estos argumentos. Continúa con el resultado anterior o responde." };
          usedTools.push({ name: call.name, ok: false, result: value });
          functionParts.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: value } });
          continue;
        }
        calledTools.add(signature);
        try {
          const result = await client.callTool({ name: call.name, arguments: call.args || {} });
          const value = toolResultJson(result);
          usedTools.push({ name: call.name, ok: !result.isError, result: value });
          functionParts.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: value } });
          if (value?.proposal) {
            completedProposal = value;
            break;
          }
        } catch (error) {
          const value = { error: String(error.code || error.message || "tool_failed") };
          usedTools.push({ name: call.name, ok: false, result: value });
          functionParts.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: value } });
        }
      }
      if (completedProposal) return { ...proposalCompletion(completedProposal), usedTools };
      if (turn >= 2) functionParts.push({ text: "Ya consultaste suficiente contexto. No repitas herramientas: crea una sola propuesta con la herramienta adecuada o responde de forma final." });
      contents.push({ role: "user", parts: functionParts });
    }
    const failed = usedTools.filter((item) => !item.ok && item.result?.error !== "duplicate_tool_call");
    return {
      text: failed.length
        ? "No pude terminar la propuesta porque una herramienta devolvió un error. Conservé intacto el contenido aprobado."
        : "Consulté el contexto de la unidad, pero no se creó una propuesta en este turno. Pide una sola lectura, actividad o recurso para continuar.",
      specifications: failed.length ? `## Incidencias\n${failed.map((item) => `- **${item.name}:** ${item.result?.error || "error"}`).join("\n")}` : "",
      usedTools
    };
  } finally { await close(); }
}

function registerCharlyBrownMcpRoutes(app, dependencies) {
  const contextFor = async (req) => {
    const auth = await dependencies.verifyFirebaseBearer(req);
    const claims = auth.decoded || {};
    let profile = {};
    try {
      const snap = await dependencies.db.collection("users").doc(auth.uid).get();
      profile = snap.exists ? snap.data() || {} : {};
    } catch (_) {}
    const role = String(claims.role || profile.role || profile.rol || profile.userRole || "").toLowerCase();
    const status = String(claims.approvalStatus || claims.status || profile.approvalStatus || profile.status || profile.estadoAprobacion || "").toLowerCase();
    const approvedUser = Boolean(
      ["approved", "aprobado", "active", "activo"].includes(status) ||
      ["admin", "administrator", "administrador", "superadmin", "owner", "author", "autor", "editor", "editorial", "developer", "desarrollo", "profe", "profesor", "docente"].includes(role) ||
      profile.approved === true || profile.aprobado === true
    );
    const canManageGlobal = ["admin", "administrator", "administrador", "superadmin", "owner", "author", "autor", "editor", "editorial", "developer", "desarrollo"].includes(role);
    return {
      db: dependencies.db,
      uid: auth.uid,
      approvedUser,
      canManageGlobal,
      generateText: (...args) => withGeminiRetry(() => dependencies.generateText(...args)),
      generateContent: (...args) => withGeminiRetry(() => dependencies.generateContent(...args)),
      research: dependencies.research
    };
  };
  const sendSectionError = (res, error) => {
    const code = String(error.code || error.message || "ACTIVITY_SECTION_FAILED");
    const forbidden = code.includes("FORBIDDEN");
    return res.status(Number(error.status || (forbidden ? 403 : 400))).json({ error: code, message: String(error.message || code) });
  };
  app.get("/api/charly-brown/activity-sections", async (req, res) => {
    try {
      const context = await contextFor(req);
      if (!context.approvedUser) return res.status(403).json({ error: "USER_NOT_APPROVED" });
      const sections = await listEffectiveActivitySections(context.db, context.uid, { level: req.query?.level, grade: req.query?.grade });
      return res.status(200).json({ sections, canManageGlobal: context.canManageGlobal });
    } catch (error) { return sendSectionError(res, error); }
  });
  app.post("/api/charly-brown/activity-sections", async (req, res) => {
    try {
      const context = await contextFor(req);
      if (!context.approvedUser) return res.status(403).json({ error: "USER_NOT_APPROVED" });
      const targetId = await saveActivitySectionRecord({ db: context.db, uid: context.uid, canManageGlobal: context.canManageGlobal, scope: req.body?.scope, current: req.body?.section, create: true });
      return res.status(201).json({ targetId, sections: await listEffectiveActivitySections(context.db, context.uid, req.body?.meta || {}) });
    } catch (error) { return sendSectionError(res, error); }
  });
  app.put("/api/charly-brown/activity-sections", async (req, res) => {
    try {
      const context = await contextFor(req);
      if (!context.approvedUser) return res.status(403).json({ error: "USER_NOT_APPROVED" });
      const targetId = await saveActivitySectionRecord({ db: context.db, uid: context.uid, canManageGlobal: context.canManageGlobal, targetId: req.body?.targetId, scope: req.body?.scope, current: req.body?.section, create: false });
      return res.status(200).json({ targetId, sections: await listEffectiveActivitySections(context.db, context.uid, req.body?.meta || {}) });
    } catch (error) { return sendSectionError(res, error); }
  });
  app.post("/api/charly-brown/activity-sections/restore", async (req, res) => {
    try {
      const context = await contextFor(req);
      if (!context.approvedUser) return res.status(403).json({ error: "USER_NOT_APPROVED" });
      const targetId = await restoreActivitySectionRecord({ db: context.db, uid: context.uid, canManageGlobal: context.canManageGlobal, targetId: String(req.body?.targetId || ""), scope: req.body?.scope });
      return res.status(200).json({ targetId, sections: await listEffectiveActivitySections(context.db, context.uid, req.body?.meta || {}) });
    } catch (error) { return sendSectionError(res, error); }
  });
  app.post("/api/charly-brown/export", async (req, res) => {
    try {
      const context = await contextFor(req);
      if (!context.approvedUser) return res.status(403).json({ error: "USER_NOT_APPROVED" });
      const { session } = await loadOwnedSession(dependencies.db, context.uid, String(req.body?.sessionId || ""));
      const artifact = await buildCharlyExport({ session, format: req.body?.format, documentKind: req.body?.documentKind });
      res.set({
        "Cache-Control": "private, no-store",
        "Content-Type": artifact.contentType,
        "Content-Disposition": `attachment; filename="${artifact.filename}"`,
        "X-Content-Type-Options": "nosniff"
      });
      return res.status(200).send(artifact.buffer);
    } catch (error) {
      return res.status(Number(error.status || 500)).json({
        error: String(error.code || "CHARLY_EXPORT_FAILED"),
        message: String(error.message || "No fue posible preparar la descarga.")
      });
    }
  });
  app.all("/api/charly-brown/mcp", async (req, res) => {
    let server; let transport;
    try {
      const context = await contextFor(req);
      if (req.method !== "POST") return res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
      server = createServer(context);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) res.status(Number(error.status || 500)).json({ jsonrpc: "2.0", error: { code: -32603, message: String(error.message || "MCP error") }, id: null });
    } finally {
      res.on("close", () => { transport?.close(); server?.close(); });
    }
  });
  app.post("/api/charly-brown/chat", async (req, res) => {
    try {
      const context = await contextFor(req);
      const sessionId = String(req.body?.sessionId || "");
      const targetUnitId = String(req.body?.targetUnitId || "");
      const userText = String(req.body?.text || "").trim().slice(0, 12000);
      if (!sessionId || !targetUnitId || !userText) return res.status(400).json({ error: "Faltan sessionId, targetUnitId o text." });
      const agent = await runChatAgent({ context, sessionId, targetUnitId, userText, model: req.body?.model });
      const { ref, session } = await loadOwnedSession(dependencies.db, context.uid, sessionId);
      const unit = requireUnit(session, targetUnitId);
      unit.messages.push({ id: `msg_${randomUUID()}`, unitId: unit.id, role: "assistant", text: agent.text, specifications: agent.specifications || "", toolCalls: agent.usedTools.map(({ name, ok }) => ({ name, ok })), createdAt: new Date().toISOString() });
      await ref.set({ ...session, units: session.units, updatedAt: new Date().toISOString() }, { merge: true });
      return res.status(200).json({ ok: true, text: agent.text, specifications: agent.specifications || "", usedTools: agent.usedTools.map(({ name, ok }) => ({ name, ok })), session: normalizeSession(session) });
    } catch (error) {
      const transient = isTransientGeminiError(error);
      const status = transient ? 429 : Number(error.status || 500);
      console.error("[charly-brown] chat failed", {
        sessionId: String(req.body?.sessionId || ""),
        targetUnitId: String(req.body?.targetUnitId || ""),
        status,
        code: String(error.code || "CHARLY_CHAT_FAILED"),
        message: readableGeminiError(error)
      });
      if (transient) res.set("Retry-After", "15");
      return res.status(status).json({
        error: transient ? "GEMINI_RATE_LIMITED" : String(error.code || error.message || "CHARLY_CHAT_FAILED"),
        message: transient
          ? "Gemini está recibiendo demasiadas solicitudes. Espera unos segundos y vuelve a intentarlo; tu contenido no se perdió."
          : readableGeminiError(error),
        ...(transient ? { retryAfterSeconds: 15 } : {})
      });
    }
  });
}

module.exports = {
  CONTENT_TYPES,
  DEFAULT_CHARLY_MODEL,
  EDITORIAL_REVIEW_MODEL,
  THINKING_LEVELS,
  NATURAL_STYLE_RULES,
  normalizeSession,
  createToolHandlers,
  createServer,
  runChatAgent,
  isTransientGeminiError,
  readableGeminiError,
  withGeminiRetry,
  selectAgentTools,
  proposalCompletion,
  buildAgentHistory,
  ensureUserTurn,
  splitAgentResponse,
  registerCharlyBrownMcpRoutes,
  reviewNaturalWriting,
  listEffectiveActivitySections,
  saveActivitySectionRecord,
  restoreActivitySectionRecord
};
