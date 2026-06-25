import { createId } from "./ui-components.js";

export const DEFAULT_SESSION = {
  id: "",
  title: "Nueva unidad",
  createdAt: "",
  updatedAt: "",
  meta: {
    mode: "Alumno",
    level: "Primaria",
    grade: "Tercero",
    trimester: "2",
    unit: "3",
    category: "Lenguaje y comunicación",
    subtopic: "ComprensionLectora",
    edition: "10va",
    model: "gemini-2.5-flash",
    difficulty: "normal",
    relateToReading: true
  },
  reading: null,
  sya: null,
  syaOriginal: null,
  syaContextKey: "",
  messages: [],
  proposals: [],
  accepted: {
    activities: [],
    teacherNotes: [],
    reading: null,
    sya: null,
    syaOriginal: null
  },
  preferences: []
};

export function createEmptySession(overrides = {}) {
  const now = new Date().toISOString();
  return {
    ...structuredCloneSafe(DEFAULT_SESSION),
    ...overrides,
    id: overrides.id || createId("session"),
    createdAt: overrides.createdAt || now,
    updatedAt: now,
    title: overrides.title || "Nueva unidad"
  };
}

export function createStore(initialSession = createEmptySession()) {
  let state = { session: normalizeSession(initialSession), sessions: [], loading: false };
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(getState()));
  const getState = () => structuredCloneSafe(state);

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },
    getState,
    setSessions(sessions = []) {
      state = { ...state, sessions: sessions.map(normalizeSession) };
      notify();
    },
    setSession(session) {
      state = { ...state, session: normalizeSession(session) };
      notify();
    },
    patchSession(patch = {}) {
      state = { ...state, session: normalizeSession({ ...state.session, ...patch, updatedAt: new Date().toISOString() }) };
      notify();
    },
    updateMeta(meta = {}) {
      state = { ...state, session: normalizeSession({ ...state.session, meta: { ...state.session.meta, ...meta }, updatedAt: new Date().toISOString() }) };
      notify();
    },
    addMessage(message = {}) {
      state.session.messages.push({ id: createId("msg"), role: "assistant", text: "", createdAt: new Date().toISOString(), ...message });
      state.session.updatedAt = new Date().toISOString();
      notify();
    },
    addProposal(proposal = {}) {
      state.session.proposals.unshift({ id: createId("proposal"), status: "pending", createdAt: new Date().toISOString(), ...proposal });
      state.session.updatedAt = new Date().toISOString();
      notify();
    },
    acceptActivity(activity = {}) {
      state.session.accepted.activities.push({ id: activity.id || createId("activity"), notes: [], ...activity, acceptedAt: new Date().toISOString() });
      state.session.updatedAt = new Date().toISOString();
      notify();
    },
    removeActivity(activityId = "") {
      state.session.accepted.activities = state.session.accepted.activities.filter((item) => item.id !== activityId);
      state.session.updatedAt = new Date().toISOString();
      notify();
    },
    addTeacherNotes(notes = {}, activityId = "") {
      const entry = { id: notes.id || createId("notes"), html: notes.html || "", mode: notes.mode || "global", createdAt: new Date().toISOString() };
      if (activityId) {
        const activity = state.session.accepted.activities.find((item) => item.id === activityId);
        if (activity) activity.notes = [...(activity.notes || []), entry];
      } else {
        state.session.accepted.teacherNotes.push(entry);
      }
      state.session.updatedAt = new Date().toISOString();
      notify();
    },
    addPreference(text = "") {
      const safe = String(text || "").trim();
      if (!safe) return;
      if (!state.session.preferences.includes(safe)) state.session.preferences.push(safe);
      state.session.updatedAt = new Date().toISOString();
      notify();
    }
  };
}

export function normalizeSession(input = {}) {
  const base = structuredCloneSafe(DEFAULT_SESSION);
  const raw = input && typeof input === "object" ? input : {};
  return {
    ...base,
    ...raw,
    meta: { ...base.meta, ...(raw.meta || {}) },
    accepted: {
      ...base.accepted,
      ...(raw.accepted || {}),
      activities: Array.isArray(raw.accepted?.activities) ? raw.accepted.activities : [],
      teacherNotes: Array.isArray(raw.accepted?.teacherNotes) ? raw.accepted.teacherNotes : []
    },
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
    preferences: Array.isArray(raw.preferences) ? raw.preferences : []
  };
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
