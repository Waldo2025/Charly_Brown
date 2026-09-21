import { createId } from "./ui-components.js";
import {
  createUnitWorkflow,
  markActivitySection,
  markWorkflowStage,
  normalizeUnitWorkflow,
  registerResourceStage,
  setWorkflowActivitySections
} from "./workflow.js";

const emptyAccepted = () => ({ activities: [], resources: [], teacherNotes: [], reading: null, sya: null, syaOriginal: null });
const now = () => new Date().toISOString();
const clone = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const revised = (item = {}) => ({ ...item, revision: Math.max(1, Number(item.revision || 1)) });
const CURRENT_GEMINI_MODEL = "gemini-3.8-flash";
const LEGACY_GEMINI_MODELS = new Set(["", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest"]);
const normalizeGeminiModel = (value = "") => LEGACY_GEMINI_MODELS.has(String(value || "").trim()) ? CURRENT_GEMINI_MODEL : String(value).trim();

export const DEFAULT_SESSION = {
  schemaVersion: 3,
  id: "",
  title: "Nueva sesión",
  createdAt: "",
  updatedAt: "",
  activeUnitId: "",
  academicMeta: {
    mode: "Alumno", level: "Primaria", grade: "Tercero", trimester: "2",
    category: "Lenguaje y comunicación", subtopic: "ComprensionLectora",
    edition: "10va", model: CURRENT_GEMINI_MODEL, difficulty: "normal", relateToReading: true
  },
  meta: {},
  units: [],
  researchRuns: [],
  reading: null,
  sya: null,
  syaOriginal: null,
  syaContextKey: "",
  messages: [],
  proposals: [],
  accepted: emptyAccepted(),
  preferences: []
};

export function createEmptySession(overrides = {}) {
  return normalizeSession({
    ...clone(DEFAULT_SESSION),
    ...overrides,
    schemaVersion: 3,
    id: overrides.id || createId("session"),
    title: overrides.title || "Nueva sesión",
    createdAt: overrides.createdAt || now(),
    updatedAt: now(),
    activeUnitId: overrides.activeUnitId || "",
    units: Array.isArray(overrides.units) ? overrides.units : []
  });
}

export function createUnitRecord({ unit = "", title = "", meta = {}, readingMode = "existing", reading = null, activitySections = [] } = {}) {
  const value = String(unit || "1").trim() || "1";
  return normalizeUnit({
    id: createId("unit"),
    title: title || (value.toLowerCase() === "proyecto" ? "Proyecto" : `Unidad ${value}`),
    createdAt: now(), updatedAt: now(), revision: 0,
    meta: { ...meta, unit: value },
    reading,
    messages: [], proposals: [], accepted: { ...emptyAccepted(), reading }, preferences: [], researchRuns: [],
    workflow: createUnitWorkflow({ readingMode, reading, activitySections })
  }, meta);
}

export function getActiveUnit(session = {}) {
  return (session.units || []).find((unit) => unit.id === session.activeUnitId) || null;
}

export function createStore(initialSession = createEmptySession()) {
  let state = { session: normalizeSession(initialSession), sessions: [], loading: false };
  const listeners = new Set();
  const getState = () => clone(state);
  const notify = () => listeners.forEach((listener) => listener(getState()));
  const commit = (session) => {
    state = { ...state, session: normalizeSession({ ...session, updatedAt: now() }) };
    notify();
  };
  const mutateUnit = (mutator) => {
    const session = clone(state.session);
    const index = session.units.findIndex((unit) => unit.id === session.activeUnitId);
    if (index < 0) return false;
    const unit = clone(session.units[index]);
    mutator(unit, session);
    unit.updatedAt = now();
    session.units[index] = normalizeUnit(unit, session.academicMeta);
    commit(session);
    return true;
  };
  const bump = (unit) => { unit.revision = Math.max(0, Number(unit.revision || 0)) + 1; };

  return {
    subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); },
    getState,
    setSessions(sessions = []) { state = { ...state, sessions: sessions.map(normalizeSession) }; notify(); },
    setSession(session) { state = { ...state, session: normalizeSession(session) }; notify(); },
    patchSession(patch = {}) {
      const unitKeys = ["reading", "sya", "syaOriginal", "syaContextKey", "messages", "proposals", "accepted", "preferences", "researchRuns", "workflow"];
      if (state.session.activeUnitId && unitKeys.some((key) => Object.hasOwn(patch, key))) {
        mutateUnit((unit) => unitKeys.forEach((key) => { if (Object.hasOwn(patch, key)) unit[key] = clone(patch[key]); }));
        const rest = Object.fromEntries(Object.entries(patch).filter(([key]) => !unitKeys.includes(key)));
        if (Object.keys(rest).length) commit({ ...state.session, ...rest });
      } else commit({ ...state.session, ...patch });
    },
    updateMeta(meta = {}) {
      const session = clone(state.session);
      session.academicMeta = { ...session.academicMeta, ...meta };
      delete session.academicMeta.unit;
      session.units = session.units.map((unit) => ({
        ...unit,
        meta: { ...unit.meta, ...meta, unit: unit.meta?.unit || "1" }
      }));
      commit(session);
    },
    createUnit(data = {}) {
      const session = clone(state.session);
      const unit = createUnitRecord({ ...data, meta: session.academicMeta });
      session.units.push(unit);
      session.activeUnitId = unit.id;
      commit(session);
      return clone(unit);
    },
    updateUnit(unitId = "", patch = {}) {
      const session = clone(state.session);
      const unit = session.units.find((item) => item.id === unitId);
      if (!unit) return false;
      if (Object.hasOwn(patch, "title")) unit.title = String(patch.title || "").trim() || `Unidad ${unit.meta?.unit || ""}`.trim();
      if (Object.hasOwn(patch, "unit")) unit.meta = { ...unit.meta, unit: String(patch.unit || unit.meta?.unit || "1").trim() };
      unit.updatedAt = now();
      bump(unit);
      commit(session);
      return true;
    },
    removeUnit(unitId = "") {
      const session = clone(state.session);
      const index = session.units.findIndex((item) => item.id === unitId);
      if (index < 0) return false;
      session.units.splice(index, 1);
      if (session.activeUnitId === unitId) {
        session.activeUnitId = session.units[Math.min(index, session.units.length - 1)]?.id || "";
      }
      commit(session);
      return true;
    },
    setActivitySections(sections = []) {
      mutateUnit((unit) => { unit.workflow = setWorkflowActivitySections(unit.workflow, sections); });
    },
    markActivitySection(section = "", status = "pending", activityId = "", sectionId = "", subtopic = "") {
      mutateUnit((unit) => { unit.workflow = markActivitySection(unit.workflow, section, status, activityId, sectionId, subtopic); });
    },
    markWorkflowStage(stage = "", status = "pending", patch = {}) {
      mutateUnit((unit) => { unit.workflow = markWorkflowStage(unit.workflow, stage, status, patch); });
    },
    selectUnit(unitId = "") {
      if (!state.session.units.some((unit) => unit.id === unitId)) return false;
      commit({ ...state.session, activeUnitId: unitId });
      return true;
    },
    useReading(reading = null) {
      mutateUnit((unit) => {
        unit.reading = clone(reading);
        unit.accepted.reading = clone(reading);
        unit.workflow = createUnitWorkflow({
          readingMode: reading ? "existing" : "none",
          reading,
          activitySections: unit.workflow?.activitySections?.map((item) => item.section) || []
        });
        bump(unit);
      });
    },
    addMessage(message = {}) { mutateUnit((unit) => unit.messages.push({ id: createId("msg"), role: "assistant", text: "", createdAt: now(), ...message, unitId: unit.id })); },
    updateMessage(id = "", patch = {}) {
      mutateUnit((unit) => {
        const message = unit.messages.find((item) => item.id === id);
        if (message) Object.assign(message, clone(patch), { editedAt: now() });
      });
    },
    removeMessage(id = "") { mutateUnit((unit) => { unit.messages = unit.messages.filter((item) => item.id !== id); }); },
    addProposal(proposal = {}) {
      mutateUnit((unit) => unit.proposals.unshift({
        id: proposal.id || createId("proposal"), status: "pending", targetUnitId: unit.id,
        targetContentId: "", baseRevision: Number(unit.revision || 0), createdAt: now(), ...proposal
      }));
    },
    applyContentProposal(proposal = {}) {
      let outcome = { ok: false, error: "No hay una unidad activa." };
      mutateUnit((unit) => {
        if (proposal.targetUnitId && proposal.targetUnitId !== unit.id) {
          outcome = { ok: false, error: "La propuesta pertenece a otra unidad." };
          return;
        }
        if (proposal.action !== "create" && Number(proposal.baseRevision) !== Number(unit.revision)) {
          outcome = { ok: false, error: "El contenido cambió desde que se creó la propuesta. Vuelve a generar la corrección." };
          return;
        }
        const type = String(proposal.contentType || "activity");
        if (type === "reading") {
          const readingStage = String(proposal.readingStage || "reading");
          unit.accepted.reading = mergeReadingStage(unit.accepted.reading, proposal, unit.id, readingStage);
          unit.reading = unit.accepted.reading;
          unit.workflow = markWorkflowStage(unit.workflow, readingStage, "approved", { approvedAt: now(), proposalId: proposal.id });
          const stored = unit.proposals.find((item) => item.id === proposal.id);
          if (stored) { stored.status = "approved"; stored.approvedAt = now(); }
          bump(unit);
          outcome = { ok: true };
          return;
        }
        const list = type === "activity" ? unit.accepted.activities : unit.accepted.resources;
        const index = list.findIndex((item) => String(item.id) === String(proposal.targetContentId || ""));
        if (["update", "delete", "regenerate"].includes(proposal.action) && index < 0) {
          outcome = { ok: false, error: "El recurso de destino ya no existe." };
          return;
        }
        if (proposal.action === "delete") list.splice(index, 1);
        else {
          const entry = revised({
            ...(index >= 0 ? list[index] : {}),
            id: index >= 0 ? list[index].id : createId(type === "activity" ? "activity" : "resource"),
            title: proposal.title, section: proposal.section || unit.meta.category || "", sectionId: proposal.sectionId || (index >= 0 ? list[index].sectionId : "") || "", html: proposal.html || "",
            category: proposal.category || (index >= 0 ? list[index].category : "") || unit.meta.category || "",
            subtopic: proposal.subtopic || (index >= 0 ? list[index].subtopic : "") || unit.meta.subtopic || "",
            sourceProposalId: proposal.id || (index >= 0 ? list[index].sourceProposalId : "") || "",
            type: type === "worksheet" ? "ficha" : type === "annex" ? "anexo" : type === "cutout" ? "recortable" : type === "video-script" ? "video" : type,
            citations: proposal.citations || [], researchRunIds: proposal.researchRunIds || [], unitId: unit.id,
            activityId: proposal.targetActivityId || (index >= 0 ? list[index].activityId : "") || "",
            revision: index >= 0 ? Number(list[index].revision || 1) + 1 : 1,
            acceptedAt: now()
          });
          if (index >= 0) list[index] = entry; else list.push(entry);
          if (type === "activity") unit.workflow = markActivitySection(unit.workflow, entry.section, "approved", entry.id, entry.sectionId, entry.subtopic);
          else if (entry.activityId) unit.workflow = registerResourceStage(unit.workflow, { activityId: entry.activityId, resourceType: type, resourceId: entry.id, status: "approved" });
        }
        const stored = unit.proposals.find((item) => item.id === proposal.id);
        if (stored) { stored.status = "approved"; stored.approvedAt = now(); }
        bump(unit);
        outcome = { ok: true };
      });
      return outcome;
    },
    acceptActivity(activity = {}) {
      mutateUnit((unit) => {
        const entry = revised({ id: activity.id || createId("activity"), notes: [], ...activity, acceptedAt: now(), unitId: unit.id });
        unit.accepted.activities.push(entry);
        unit.workflow = markActivitySection(unit.workflow, entry.section || unit.meta.category || "", "approved", entry.id, entry.sectionId, entry.subtopic);
        bump(unit);
      });
    },
    acceptResources(resources = []) {
      mutateUnit((unit) => {
        (Array.isArray(resources) ? resources : [resources]).filter(Boolean).forEach((resource) => {
          const duplicate = unit.accepted.resources.some((item) => resource.sourceProposalId && item.sourceProposalId === resource.sourceProposalId && item.type === resource.type && item.code === resource.code);
          if (!duplicate) {
            const entry = revised({ id: resource.id || createId("resource"), notes: [], ...resource, acceptedAt: now(), unitId: unit.id });
            unit.accepted.resources.push(entry);
            if (entry.activityId) unit.workflow = registerResourceStage(unit.workflow, { activityId: entry.activityId, resourceType: entry.type || "resource", resourceId: entry.id, status: "approved" });
          }
        });
        bump(unit);
      });
    },
    linkProposalResources(proposalId = "", activityId = "") {
      if (!proposalId || !activityId) return;
      mutateUnit((unit) => {
        unit.accepted.resources = unit.accepted.resources.map((item) => item.sourceProposalId === proposalId ? { ...item, activityId } : item);
      });
    },
    removeActivity(id = "") { mutateUnit((unit) => { unit.accepted.activities = unit.accepted.activities.filter((item) => item.id !== id); bump(unit); }); },
    removeResource(id = "") { mutateUnit((unit) => { unit.accepted.resources = unit.accepted.resources.filter((item) => item.id !== String(id)); bump(unit); }); },
    updateActivity(id = "", patch = {}) {
      mutateUnit((unit) => {
        unit.accepted.activities = unit.accepted.activities.map((item) => item.id === id ? { ...item, ...patch, revision: Number(item.revision || 1) + 1 } : item);
        bump(unit);
      });
    },
    updateResource(id = "", patch = {}) {
      mutateUnit((unit) => {
        unit.accepted.resources = unit.accepted.resources.map((item) => item.id === id ? { ...item, ...patch, revision: Number(item.revision || 1) + 1 } : item);
        bump(unit);
      });
    },
    addTeacherNotes(notes = {}, activityId = "") {
      mutateUnit((unit) => {
        const entry = { id: notes.id || createId("notes"), html: notes.html || "", mode: notes.mode || "global", createdAt: now() };
        const activity = activityId ? unit.accepted.activities.find((item) => item.id === activityId) : null;
        if (activity) activity.notes = [...(activity.notes || []), entry]; else unit.accepted.teacherNotes.push(entry);
        bump(unit);
      });
    },
    addResourceNotes(notes = {}, resourceId = "") {
      mutateUnit((unit) => {
        const resource = unit.accepted.resources.find((item) => item.id === resourceId);
        if (resource) { resource.notes = [...(resource.notes || []), { id: notes.id || createId("notes"), html: notes.html || "", mode: "resource", createdAt: now() }]; bump(unit); }
      });
    },
    removeTeacherNotes(id = "") {
      mutateUnit((unit) => {
        const target = String(id);
        const filter = (items) => items.filter((item, index) => item.id !== target && String(index) !== target);
        unit.accepted.teacherNotes = filter(unit.accepted.teacherNotes);
        [...unit.accepted.activities, ...unit.accepted.resources].forEach((item) => { if (Array.isArray(item.notes)) item.notes = filter(item.notes); });
        bump(unit);
      });
    },
    editTeacherNotes(id = "", html = "") {
      mutateUnit((unit) => {
        const target = String(id);
        const update = (items) => items.map((item, index) => item.id === target || String(index) === target ? { ...item, html } : item);
        unit.accepted.teacherNotes = update(unit.accepted.teacherNotes);
        [...unit.accepted.activities, ...unit.accepted.resources].forEach((item) => { if (Array.isArray(item.notes)) item.notes = update(item.notes); });
        bump(unit);
      });
    },
    addPreference(text = "") {
      const value = String(text || "").trim();
      if (value) mutateUnit((unit) => { if (!unit.preferences.includes(value)) unit.preferences.push(value); });
    }
  };
}

export function normalizeSession(input = {}) {
  const raw = input && typeof input === "object" ? clone(input) : {};
  const base = clone(DEFAULT_SESSION);
  const academicMeta = { ...base.academicMeta, ...(raw.academicMeta || raw.meta || {}) };
  delete academicMeta.unit;
  academicMeta.model = normalizeGeminiModel(academicMeta.model);
  let units = Array.isArray(raw.units) ? raw.units.map((unit) => normalizeUnit(unit, academicMeta)) : [];
  let activeUnitId = String(raw.activeUnitId || "");

  if (Number(raw.schemaVersion || 0) < 2 && hasLegacyData(raw)) {
    const current = normalizeUnit({
      id: createId("unit"), title: raw.title, createdAt: raw.createdAt, updatedAt: raw.updatedAt,
      meta: raw.meta, reading: raw.reading, sya: raw.sya, syaOriginal: raw.syaOriginal,
      syaContextKey: raw.syaContextKey, messages: raw.messages, proposals: raw.proposals,
      accepted: raw.accepted, preferences: raw.preferences, researchRuns: raw.researchRuns
    }, academicMeta);
    units.push(current);
    activeUnitId = current.id;
  }
  if (!units.some((unit) => unit.id === activeUnitId)) activeUnitId = units.at(-1)?.id || "";
  return project({ ...base, ...raw, schemaVersion: 3, academicMeta, activeUnitId, units });
}

function normalizeUnit(input = {}, academicMeta = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const unitValue = String(raw.meta?.unit || "1");
  const meta = { ...academicMeta, ...(raw.meta || {}), unit: unitValue };
  meta.model = normalizeGeminiModel(meta.model);
  return {
    id: String(raw.id || createId("unit")), title: String(raw.title || `Unidad ${unitValue}`),
    createdAt: raw.createdAt || now(), updatedAt: raw.updatedAt || now(), revision: Math.max(0, Number(raw.revision || 0)),
    meta,
    reading: raw.reading || null, sya: raw.sya || null, syaOriginal: raw.syaOriginal || null,
    syaContextKey: String(raw.syaContextKey || ""), messages: Array.isArray(raw.messages) ? raw.messages : [],
    proposals: Array.isArray(raw.proposals) ? raw.proposals : [], accepted: normalizeAccepted(raw.accepted),
    preferences: Array.isArray(raw.preferences) ? raw.preferences : [], researchRuns: Array.isArray(raw.researchRuns) ? raw.researchRuns : [],
    workflow: normalizeUnitWorkflow(raw.workflow || createUnitWorkflow({ readingMode: raw.reading || raw.accepted?.reading ? "existing" : "existing", reading: raw.accepted?.reading || raw.reading || null }))
  };
}

function mergeReadingStage(currentReading = null, proposal = {}, unitId = "", readingStage = "reading") {
  const current = currentReading && typeof currentReading === "object" ? clone(currentReading) : {};
  const base = {
    ...current,
    id: current.id || proposal.targetContentId || createId("reading"),
    title: proposal.title || current.title || "Lectura",
    unitId,
    collection: current.collection || proposal.collection || "lecturasNuevas",
    citations: mergeUniqueCitations(current.citations, proposal.citations),
    researchRunIds: [...new Set([...(current.researchRunIds || []), ...(proposal.researchRunIds || [])])],
    sections: { ...(current.sections || {}) },
    revision: Number(current.revision || 0) + 1
  };
  if (readingStage === "synonyms") {
    base.sections.synonyms = proposal.synonyms || proposal.reading?.sections?.synonyms || [];
    if (proposal.html) base.sections.synonymsHtml = proposal.html;
  } else if (readingStage === "comprehension") {
    base.questions = proposal.questions || proposal.reading?.questions || [];
    base.sections.questions = base.questions;
    if (proposal.html) base.sections.questionsHtml = proposal.html;
  } else {
    base.html = proposal.html || proposal.reading?.html || current.html || "";
    base.text = proposal.reading?.text || current.text || "";
    base.sections.narrativeHtml = proposal.reading?.sections?.narrativeHtml || base.html;
    if (proposal.reading?.sections?.synonyms?.length) base.sections.synonyms = proposal.reading.sections.synonyms;
    if (proposal.reading?.questions?.length) {
      base.questions = proposal.reading.questions;
      base.sections.questions = proposal.reading.questions;
    }
  }
  return revised(base);
}

function mergeUniqueCitations(left = [], right = []) {
  const merged = new Map();
  [...(left || []), ...(right || [])].forEach((item) => {
    if (!item) return;
    const key = String(item.doi || item.url || item.sourceId || item.title || JSON.stringify(item)).toLowerCase();
    if (!merged.has(key)) merged.set(key, item);
  });
  return Array.from(merged.values());
}

function project(session) {
  const unit = getActiveUnit(session);
  if (!unit) return { ...session, meta: { ...session.academicMeta, unit: "" }, reading: null, sya: null, syaOriginal: null, syaContextKey: "", messages: [], proposals: [], accepted: emptyAccepted(), preferences: [] };
  return { ...session, meta: { ...session.academicMeta, ...unit.meta }, reading: unit.reading, sya: unit.sya, syaOriginal: unit.syaOriginal, syaContextKey: unit.syaContextKey, messages: unit.messages, proposals: unit.proposals, accepted: unit.accepted, preferences: unit.preferences, researchRuns: unit.researchRuns };
}

function normalizeAccepted(value = {}) {
  return { ...emptyAccepted(), ...(value || {}), activities: Array.isArray(value?.activities) ? value.activities.map(revised) : [], resources: Array.isArray(value?.resources) ? value.resources.map(revised) : [], teacherNotes: Array.isArray(value?.teacherNotes) ? value.teacherNotes : [] };
}

function hasLegacyData(raw = {}) {
  return Boolean(raw.meta?.unit || raw.reading || raw.sya || raw.accepted?.reading || raw.accepted?.activities?.length || raw.accepted?.resources?.length || raw.messages?.length || raw.proposals?.length);
}
