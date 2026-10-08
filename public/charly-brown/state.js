import { createId } from "./ui-components.js";
import {
  createUnitWorkflow,
  markActivitySection,
  markWorkflowStage,
  normalizeUnitWorkflow,
  registerResourceStage,
  setWorkflowActivitySections
} from "./workflow.js";
import { getCategoriesForGrade, ALL_OPTION } from "./unit-contracts.js";

const emptyAccepted = () => ({ activities: [], resources: [], teacherNotes: [], reading: null, sya: null, syaOriginal: null });
const now = () => new Date().toISOString();
const clone = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const revised = (item = {}) => ({ ...item, revision: Math.max(1, Number(item.revision || 1)) });
const CURRENT_GEMINI_MODEL = "gemini-3.8-flash";
const LEGACY_GEMINI_MODELS = new Set(["", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-flash-latest"]);
const normalizeGeminiModel = (value = "") => LEGACY_GEMINI_MODELS.has(String(value || "").trim()) ? CURRENT_GEMINI_MODEL : String(value).trim();

export function normalizeSubtopicKey(val = "") {
  if (!val) return "";
  let str = String(val).trim();
  if (str.includes(":")) {
    str = str.split(":").pop().trim();
  }
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function isSameSubtopicKey(subA = "", subB = "") {
  const keyA = normalizeSubtopicKey(subA);
  const keyB = normalizeSubtopicKey(subB);
  return Boolean(keyA && keyB && keyA === keyB);
}

export function normalizeResourceType(type = "") {
  const norm = String(type || "").toLowerCase().trim();
  if (norm === "worksheet" || norm === "ficha") return "ficha";
  if (norm === "annex" || norm === "anexo") return "anexo";
  if (norm === "cutout" || norm === "recortable") return "recortable";
  if (norm === "video-script" || norm === "video" || norm.includes("video")) return "video";
  return norm;
}

export const UNIT_RESOURCE_CAPS = Object.freeze({
  video: 10,
  recortable: 20,
  anexo: 20,
  ficha: 20
});

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

  const categoryMap = getCategoriesForGrade(meta.grade || "Primero");
  const disabled = new Set(meta.disabledSubtopics || []);

  const selectedCategories = (!meta.category || meta.category === ALL_OPTION)
    ? Object.keys(categoryMap)
    : [meta.category];

  const allSubtopics = selectedCategories.flatMap((cat) => {
    const subs = Array.isArray(categoryMap[cat]) ? categoryMap[cat] : [];
    return subs.map((subtopic) => ({ category: cat, subtopic }));
  });

  const activeSubtopics = allSubtopics.filter(({ category, subtopic }) => {
    return !disabled.has(`${category}:${subtopic}`) && !disabled.has(`:${subtopic}`);
  });

  const emptyActivities = activeSubtopics.map(({ category, subtopic }) => ({
    id: createId("activity"),
    section: category,
    subtopic: subtopic,
    html: "",
    revision: 1
  }));

  return normalizeUnit({
    id: createId("unit"),
    title: title || (value.toLowerCase() === "proyecto" ? "Proyecto" : `Unidad ${value}`),
    createdAt: now(), updatedAt: now(), revision: 0,
    meta: { ...meta, unit: value },
    reading,
    messages: [], proposals: [], accepted: { ...emptyAccepted(), reading, activities: emptyActivities }, preferences: [], researchRuns: [],
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
      const unitKeys = ["reading", "sya", "syaOriginal", "syaContextKey", "messages", "sourceAttachments", "sourceAttachmentsManaged", "proposals", "accepted", "preferences", "researchRuns", "workflow"];
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
        const storedProposal = unit.proposals.find((item) => String(item.id) === String(proposal.id || ""));
        if (proposal.id && (storedProposal?.status === "approved" || [
          ...(unit.accepted.activities || []), ...(unit.accepted.resources || []), ...(unit.accepted.teacherNotes || []),
          ...(unit.accepted.activities || []).flatMap((item) => item.notes || []),
          ...(unit.accepted.resources || []).flatMap((item) => item.notes || [])
        ].some((item) => String(item.sourceProposalId || "") === String(proposal.id)))) {
          outcome = { ok: false, error: "Esta propuesta ya fue aprobada." };
          return;
        }
        if (proposal.targetUnitId && proposal.targetUnitId !== unit.id) {
          outcome = { ok: false, error: "La propuesta pertenece a otra unidad." };
          return;
        }
        if (proposal.action !== "create" && Number(proposal.baseRevision) !== Number(unit.revision)) {
          const targetId = String(proposal.targetContentId || "");
          const target = [
            ...(unit.accepted.activities || []), ...(unit.accepted.resources || []), ...(unit.accepted.teacherNotes || []),
            ...(unit.accepted.activities || []).flatMap((item) => item.notes || []),
            ...(unit.accepted.resources || []).flatMap((item) => item.notes || [])
          ].find((item) => String(item.id) === targetId);
          if (!target || !proposal.artifact?.targetRevision || Number(target.revision || 1) !== Number(proposal.artifact.targetRevision)) {
            outcome = { ok: false, error: "La página de destino cambió desde que se creó la propuesta. Vuelve a generar la corrección." };
            return;
          }
        }
        const type = String(proposal.contentType || "activity");
        if (type === "sya") {
          const nextSya = proposal.artifact?.sya;
          if (!nextSya || typeof nextSya !== "object" || Array.isArray(nextSya)) {
            outcome = { ok: false, error: "La propuesta de Secuencia y Alcance no contiene datos válidos." };
            return;
          }
          const previousSya = proposal.artifact?.previousSya || {};
          const activeSya = unit.accepted.sya || unit.sya || previousSya;
          if (JSON.stringify(activeSya) !== JSON.stringify(previousSya)) {
            outcome = { ok: false, error: "La Secuencia y Alcance cambió desde esta propuesta. Vuelve a generarla antes de aprobar." };
            return;
          }
          const original = unit.accepted.syaOriginal || unit.syaOriginal || previousSya;
          unit.syaOriginal = clone(original || nextSya);
          unit.accepted.syaOriginal = clone(unit.syaOriginal);
          unit.sya = clone(nextSya);
          unit.accepted.sya = clone(nextSya);
          const stored = unit.proposals.find((item) => item.id === proposal.id);
          if (stored) { stored.status = "approved"; stored.approvedAt = now(); }
          bump(unit);
          outcome = { ok: true };
          return;
        }
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
        if (type === "teacher-note") {
          const targetId = String(proposal.targetContentId || "");
          const targetActivityId = String(proposal.targetActivityId || "");
          const sourceActivityProposalId = String(proposal.artifact?.sourceActivityProposalId || "");
          const linkedApprovedActivity = sourceActivityProposalId
            ? unit.accepted.activities.find((item) => String(item.sourceProposalId) === sourceActivityProposalId)
            : null;
          const targetResourceId = String(proposal.artifact?.targetResourceId || "");
          const activity = unit.accepted.activities.find((item) => String(item.id) === targetActivityId) || null;
          const resource = unit.accepted.resources.find((item) => String(item.id) === targetResourceId) || null;
          const containers = [
            { owner: null, notes: unit.accepted.teacherNotes },
            ...unit.accepted.activities.map((owner) => ({ owner, notes: owner.notes || (owner.notes = []) })),
            ...unit.accepted.resources.map((owner) => ({ owner, notes: owner.notes || (owner.notes = []) }))
          ];
          const currentContainer = targetId
            ? containers.find(({ notes }) => notes.some((note) => String(note.id) === targetId))
            : null;
          const currentIndex = currentContainer ? currentContainer.notes.findIndex((note) => String(note.id) === targetId) : -1;
          if (["update", "delete", "regenerate"].includes(proposal.action) && currentIndex < 0) {
            outcome = { ok: false, error: "La nota de destino ya no existe." };
            return;
          }
          const sourceMode = proposal.artifact?.noteMode === "source";
          if (!proposal.subtopic || (sourceMode ? Boolean(targetActivityId || targetResourceId) : !activity || !isSameSubtopicKey(activity.subtopic, proposal.subtopic))) {
            outcome = { ok: false, error: "La propuesta no tiene una actividad y un subtema válidos para colocar la nota." };
            return;
          }
          if (sourceMode && currentContainer?.owner) {
            outcome = { ok: false, error: "La nota de origen libre debe permanecer en la unidad." };
            return;
          }
          if (proposal.artifact?.noteMode === "resource" && (!resource || String(resource.activityId || "") !== targetActivityId)) {
            outcome = { ok: false, error: "El recurso de la nota ya no está vinculado con esa actividad." };
            return;
          }
          if (proposal.artifact?.noteMode === "resource" && resource) {
            const rawType = String(resource.type || "").toLowerCase();
            const rawCode = String(resource.code || "").toLowerCase();
            if (rawType.includes("recort") || rawType.includes("cutout") || rawCode.includes("recort")) {
              outcome = { ok: false, error: "Los recortables no deben tener notas del maestro independientes; sus orientaciones deben incluirse dentro de la nota del maestro de la actividad correspondiente." };
              return;
            }
          }
          if (proposal.action === "delete") currentContainer.notes.splice(currentIndex, 1);
          else {
            const existing = currentIndex >= 0 ? currentContainer.notes[currentIndex] : null;
            const entry = revised({
              ...(existing || {}), id: existing?.id || createId("notes"), title: proposal.title || existing?.title || "Nota del maestro",
              html: proposal.html || "", mode: proposal.artifact?.noteMode || existing?.mode || "single",
              activityId: targetActivityId || linkedApprovedActivity?.id || "", resourceId: targetResourceId,
              pendingActivityProposalId: linkedApprovedActivity ? "" : sourceActivityProposalId || existing?.pendingActivityProposalId || "",
              pageOrder: existing?.pageOrder ?? (sourceMode ? unit.accepted.teacherNotes.filter((item) => isSameSubtopicKey(item.subtopic, proposal.subtopic)).length : activity?.notes?.length || 0),
              section: activity?.section || proposal.section || "", sectionId: activity?.sectionId || proposal.sectionId || "",
              category: activity?.category || proposal.category || unit.meta.category || "", subtopic: activity?.subtopic || proposal.subtopic,
              sourceProposalId: proposal.id || existing?.sourceProposalId || "", resourceUsage: proposal.artifact?.resourceUsage || [],
              styleReview: proposal.artifact?.styleReview || proposal.styleReview || null,
              revision: existing ? Number(existing.revision || 1) + 1 : 1, acceptedAt: now(), unitId: unit.id
            });
            const destination = sourceMode ? unit.accepted.teacherNotes : proposal.artifact?.noteMode === "resource" ? resource.notes : activity.notes;
            if (existing && currentContainer.notes === destination) currentContainer.notes[currentIndex] = entry;
            else {
              if (existing) currentContainer.notes.splice(currentIndex, 1);
              destination.push(entry);
            }
          }
          const stored = unit.proposals.find((item) => item.id === proposal.id);
          if (stored) { stored.status = "approved"; stored.approvedAt = now(); }
          bump(unit);
          outcome = { ok: true };
          return;
        }
        const list = type === "activity" ? unit.accepted.activities : unit.accepted.resources;
        let index = list.findIndex((item) => String(item.id) === String(proposal.targetContentId || ""));
        if (index < 0 && type === "activity" && proposal.subtopic && proposal.artifact?.pagePlacement !== "add") {
          const subMatchIndex = list.findIndex((item) => isSameSubtopicKey(item.subtopic, proposal.subtopic));
          if (subMatchIndex >= 0) index = subMatchIndex;
        }
        if (type === "activity" && proposal.action === "create" && !proposal.targetContentId && index >= 0 && list[index].html) {
          outcome = { ok: false, error: "Ya existe una actividad aprobada para este subtema. La corrección debe apuntar a su ID para conservar su lugar y sus vínculos." };
          return;
        }
        if (["update", "delete", "regenerate"].includes(proposal.action) && index < 0) {
          outcome = { ok: false, error: "El recurso de destino ya no existe." };
          return;
        }
        if (proposal.action === "delete") list.splice(index, 1);
        else {
          const existing = index >= 0 ? list[index] : null;
          const pendingActivityId = String(proposal.artifact?.sourceActivityProposalId || "");
          const approvedPendingActivity = pendingActivityId
            ? unit.accepted.activities.find((item) => String(item.sourceProposalId) === pendingActivityId)
            : null;
          const isTargetedActivityEdit = type === "activity" && existing && Boolean(proposal.targetContentId)
            && ["update", "regenerate"].includes(proposal.action);
          const entry = revised({
            ...(existing || {}),
            id: index >= 0 ? list[index].id : createId(type === "activity" ? "activity" : "resource"),
            // An edit of an approved activity changes its content in place; its
            // curricular identity and position come from the exact target item.
            title: isTargetedActivityEdit ? existing.title : proposal.title,
            section: isTargetedActivityEdit ? existing.section : proposal.section || unit.meta.category || "",
            sectionId: isTargetedActivityEdit ? existing.sectionId : proposal.sectionId || existing?.sectionId || "",
            html: proposal.html || "",
            category: isTargetedActivityEdit ? existing.category : proposal.category || existing?.category || unit.meta.category || "",
            subtopic: isTargetedActivityEdit ? existing.subtopic : proposal.subtopic || existing?.subtopic || unit.meta.subtopic || "",
            sourceProposalId: proposal.id || (index >= 0 ? list[index].sourceProposalId : "") || "",
            type: type === "worksheet" ? "ficha" : type === "annex" ? "anexo" : type === "cutout" ? "recortable" : type === "video-script" ? "video" : type,
            artifact: proposal.artifact || null, assets: proposal.artifact?.assets || [],
            ...(type === "activity" ? {
              resourceSpecifications: Array.isArray(proposal.artifact?.resourceSpecifications)
                ? proposal.artifact.resourceSpecifications
                : (existing?.resourceSpecifications || [])
            } : {}),
            citations: proposal.citations || [], researchRunIds: proposal.researchRunIds || [], unitId: unit.id,
            activityId: proposal.targetActivityId || approvedPendingActivity?.id || (index >= 0 ? list[index].activityId : "") || "",
            pendingActivityProposalId: approvedPendingActivity ? "" : pendingActivityId || existing?.pendingActivityProposalId || "",
            pageOrder: existing?.pageOrder ?? list.filter((item) => isSameSubtopicKey(item.subtopic, proposal.subtopic) && (type === "activity" || normalizeResourceType(item.type) === normalizeResourceType(type))).length,
            revision: index >= 0 ? Number(list[index].revision || 1) + 1 : 1,
            acceptedAt: now()
          });
          if (index >= 0) list[index] = entry; else list.push(entry);
          if (type === "activity") {
            unit.workflow = markActivitySection(unit.workflow, entry.section, "approved", entry.id, entry.sectionId, entry.subtopic);
            const bind = (item) => {
              if (item.pendingActivityProposalId !== proposal.id) return;
              item.activityId = entry.id;
              item.pendingActivityProposalId = "";
            };
            unit.accepted.resources.forEach(bind);
            unit.accepted.teacherNotes.forEach(bind);
          }
          else if (entry.activityId) unit.workflow = registerResourceStage(unit.workflow, { activityId: entry.activityId, resourceType: type, resourceId: entry.id, status: "approved" });
        }
        if (type !== "activity") recalculateResourceCodes(unit.accepted.resources, unit.meta?.unit);
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

        // Find if there is an empty placeholder or an existing activity for this subtopic or ID
        const existingIndex = unit.accepted.activities.findIndex((a) => a.id === entry.id || (
          entry.mathGroup
            ? a.mathGroup === entry.mathGroup && Number(a.mathIndex) === Number(entry.mathIndex)
            : isSameSubtopicKey(a.subtopic, entry.subtopic)
        ));
        if (existingIndex !== -1) {
          // If the existing one is an empty placeholder, keep its original ID so the DOM doesn't break
          const isPlaceholder = !unit.accepted.activities[existingIndex].html;
          if (isPlaceholder) {
            entry.id = unit.accepted.activities[existingIndex].id;
          }
          unit.accepted.activities[existingIndex] = entry;
        } else {
          unit.accepted.activities.push(entry);
        }

        unit.workflow = markActivitySection(unit.workflow, entry.section || unit.meta.category || "", "approved", entry.id, entry.sectionId, entry.subtopic);
        bump(unit);
      });
    },
    acceptResources(resources = []) {
      mutateUnit((unit) => {
        (Array.isArray(resources) ? resources : [resources]).filter(Boolean).forEach((resource) => {
          if (unit.accepted.resources.length >= 100) return;
          const type = normalizeResourceType(resource.type);
          const maxAllowed = UNIT_RESOURCE_CAPS[type] ?? 1;
          const currentCount = unit.accepted.resources.filter((item) => normalizeResourceType(item.type) === type).length;
          if (currentCount >= maxAllowed) return;

          const duplicate = unit.accepted.resources.some((item) =>
            (resource.sourceProposalId && item.sourceProposalId === resource.sourceProposalId && item.type === type && item.code === resource.code) ||
            (resource.id && item.id === resource.id)
          );
          if (!duplicate) {
            const entry = revised({ id: resource.id || createId("resource"), notes: [], ...resource, type, acceptedAt: now(), unitId: unit.id });
            unit.accepted.resources.push(entry);
            if (entry.activityId) unit.workflow = registerResourceStage(unit.workflow, { activityId: entry.activityId, resourceType: entry.type || "resource", resourceId: entry.id, status: "approved" });
          }
        });
        recalculateResourceCodes(unit.accepted.resources, unit.meta?.unit);
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
    removeResource(id = "", targetUnitId = "") {
      const session = clone(state.session);
      const effectiveUnitId = targetUnitId || session.activeUnitId;
      const index = session.units.findIndex((unit) => unit.id === effectiveUnitId);
      if (index >= 0) {
        const unit = clone(session.units[index]);
        const cleanId = String(id || "").trim();
        unit.accepted.resources = (unit.accepted.resources || []).filter((item) => String(item.id || "").trim() !== cleanId && String(item.code || "").trim() !== cleanId);
        if (Array.isArray(unit.accepted.teacherNotes)) {
          unit.accepted.teacherNotes = unit.accepted.teacherNotes.filter((n) => String(n.resourceId || "").trim() !== cleanId);
        }
        (unit.accepted.activities || []).forEach((act) => {
          if (Array.isArray(act.notes)) act.notes = act.notes.filter((n) => String(n.resourceId || "").trim() !== cleanId);
        });
        bump(unit);
        unit.updatedAt = now();
        session.units[index] = normalizeUnit(unit, session.academicMeta);
        commit(session);
      } else {
        mutateUnit((unit) => {
          const cleanId = String(id || "").trim();
          unit.accepted.resources = (unit.accepted.resources || []).filter((item) => String(item.id || "").trim() !== cleanId && String(item.code || "").trim() !== cleanId);
          bump(unit);
        });
      }
    },
    reorderActivities(ids = []) {
      mutateUnit((unit) => {
        const current = unit.accepted.activities || [];
        linkResourcesToActivities(unit, current);
        const ordered = reorderByIds(current, ids);
        if (ordered.length !== current.length) return;
        ordered.forEach((activity, index) => { activity.displayOrder = index; });
        unit.accepted.activities = ordered;
        recalculateLinkedResourceCodes(unit);
        bump(unit);
      });
    },
    reorderResources(ids = []) {
      mutateUnit((unit) => {
        const current = unit.accepted.resources || [];
        const ordered = reorderByIds(current, ids);
        if (ordered.length !== current.length) return;
        ordered.forEach((resource, index) => { resource.order = index; });
        unit.accepted.resources = ordered;
        recalculateResourceCodes(unit.accepted.resources, unit.meta?.unit);
        bump(unit);
      });
    },
    reorderTeacherNotes(ids = []) {
      mutateUnit((unit) => {
        const current = unit.accepted.teacherNotes || [];
        const ordered = reorderByIds(current, ids);
        if (ordered.length !== current.length) return;
        unit.accepted.teacherNotes = ordered;
        bump(unit);
      });
    },
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
        const filter = (items) => items.filter((item, index) => item.id !== target && String(index) !== target && String(item.resourceId || "") !== target);
        unit.accepted.teacherNotes = filter(unit.accepted.teacherNotes);
        [...unit.accepted.activities, ...unit.accepted.resources].forEach((item) => {
          if (String(item.id) === target && Array.isArray(item.notes)) item.notes = [];
          else if (Array.isArray(item.notes)) item.notes = filter(item.notes);
        });
        bump(unit);
      });
    },
    editTeacherNotes(id = "", html = "") {
      mutateUnit((unit) => {
        const target = String(id);
        const update = (items) => items.map((item, index) => item.id === target || String(index) === target || String(item.resourceId || "") === target ? { ...item, html } : item);
        unit.accepted.teacherNotes = update(unit.accepted.teacherNotes);
        [...unit.accepted.activities, ...unit.accepted.resources].forEach((item) => {
          if (String(item.id) === target && (!item.notes || !item.notes.length)) {
            item.notes = [{ id: createId("notes"), html, mode: "resource", createdAt: now() }];
          } else if (Array.isArray(item.notes)) {
            item.notes = update(item.notes);
          }
        });
        bump(unit);
      });
    },
    addPreference(text = "") {
      const value = String(text || "").trim();
      if (value) mutateUnit((unit) => { if (!unit.preferences.includes(value)) unit.preferences.push(value); });
    }
  };
}

function reorderByIds(items = [], ids = []) {
  const byId = new Map(items.map((item, index) => [String(item.id || index), item]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
  if (ordered.length === items.length) return ordered;
  const included = new Set(ordered);
  const replacements = [...ordered];
  return items.map((item) => included.has(item) ? replacements.shift() : item);
}

function recalculateLinkedResourceCodes(unit = {}) {
  const activities = unit.accepted?.activities || [];
  const resources = unit.accepted?.resources || [];
  linkResourcesToActivities(unit, activities);
  const oldOrder = new Map(activities.map((activity, index) => [activity.id, index]));
  const linked = resources.map((resource, index) => {
    const activity = activities.find((item) => String(item.id) === String(resource.activityId || ""));
    return { resource, index, activityOrder: activity ? oldOrder.get(activity.id) ?? 999 : 999 };
  });
  linked.sort((a, b) => a.activityOrder - b.activityOrder || Number(a.resource.order ?? a.index) - Number(b.resource.order ?? b.index) || a.index - b.index);
  unit.accepted.resources = linked.map(({ resource }, index) => { resource.order = index; return resource; });
  recalculateResourceCodes(unit.accepted.resources, unit.meta?.unit);
}

function linkResourcesToActivities(unit = {}, activities = []) {
  (unit.accepted?.resources || []).forEach((resource) => {
    let activity = activities.find((item) => String(item.id) === String(resource.activityId || resource.targetActivityId || ""));
    if (!activity && resource.subtopic) activity = activities.find((item) => isSameSubtopicKey(item.subtopic, resource.subtopic));
    if (!activity) {
      const match = String(resource.id || resource.code || "").match(/(?:ficha|anexo|recortable|video|res)[-_](\d+)[-_](\d+)/i);
      if (match) activity = activities[Number(match[2]) - 1];
    }
    if (activity) resource.activityId = activity.id;
  });
}

function recalculateResourceCodes(resources = [], unitNumber = "1") {
  const unit = String(unitNumber || "1").replace(/\D+/g, "") || "1";
  const counts = new Map();
  resources.forEach((resource) => {
    const type = normalizeResourceType(resource.type);
    if (type === "video") {
      resource.code = "Guion de Video";
      return;
    }
    const label = type === "ficha" ? "Ficha"
      : type === "anexo" ? "Anexo"
      : type === "recortable" ? "Recortable"
      : "Recurso";
    const index = counts.get(type) || 0;
    counts.set(type, index + 1);
    resource.code = `${label} ${unit}${String.fromCharCode(97 + (index % 26))}`;
  });
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
    automation: raw.automation || null,
    reading: raw.reading || raw.accepted?.reading || null,
    sya: raw.sya || raw.accepted?.sya || null,
    syaOriginal: raw.syaOriginal || raw.accepted?.syaOriginal || null,
    syaContextKey: String(raw.syaContextKey || ""), messages: Array.isArray(raw.messages) ? raw.messages : [],
    sourceAttachments: Array.isArray(raw.sourceAttachments) ? raw.sourceAttachments : [],
    sourceAttachmentsManaged: raw.sourceAttachmentsManaged === true,
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
  let activities = Array.isArray(value?.activities) ? value.activities.map(revised) : [];

  const filledSubtopicKeys = new Set(
    activities.filter((a) => a.html && String(a.html).trim()).map((a) => normalizeSubtopicKey(a.subtopic))
  );

  if (filledSubtopicKeys.size > 0) {
    activities = activities.filter((a) => {
      const key = normalizeSubtopicKey(a.subtopic);
      const isPlaceholder = !a.html || !String(a.html).trim();
      return !isPlaceholder || !filledSubtopicKeys.has(key);
    });
  }

  const rawResources = Array.isArray(value?.resources) ? value.resources.map(revised) : [];
  const typeCounts = { video: 0, recortable: 0, anexo: 0, ficha: 0 };
  const seenIds = new Set();
  const resources = [];

  for (const res of rawResources) {
    if (resources.length >= 100) break;
    if (!res) continue;
    const type = normalizeResourceType(res.type);
    const maxAllowed = UNIT_RESOURCE_CAPS[type] ?? 1;
    if (res.id && seenIds.has(res.id)) continue;
    if ((typeCounts[type] || 0) < maxAllowed) {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      if (res.id) seenIds.add(res.id);
      resources.push({ ...res, type });
    }
  }

  return {
    ...emptyAccepted(),
    ...(value || {}),
    activities,
    resources,
    teacherNotes: Array.isArray(value?.teacherNotes) ? value.teacherNotes : []
  };
}

function hasLegacyData(raw = {}) {
  return Boolean(raw.meta?.unit || raw.reading || raw.sya || raw.accepted?.reading || raw.accepted?.activities?.length || raw.accepted?.resources?.length || raw.messages?.length || raw.proposals?.length);
}
