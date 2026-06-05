import { createDefaultImageCreatorOptions, IMAGE_CREATOR_SESSION_TITLE } from "./constants.js";

export function createImageCreatorState() {
  return {
    currentUser: null,
    sessions: [],
    activeSessionId: "",
    activeSession: null,
    isGenerating: false,
    options: createDefaultImageCreatorOptions(),
    composerAttachments: [],
    composerError: "",
    composerMeta: "",
    searchTerm: "",
    optionsPanelOpen: false,
    pendingVariationSource: null,
    sessionStatusText: "Cargando sesiones...",
    sessionSaveState: "idle",
    lastKnownMessageCount: 0
  };
}

export function createEmptySession(ownerId = "", ownerEmail = "") {
  return {
    ownerId: String(ownerId || "").trim(),
    ownerEmail: String(ownerEmail || "").trim(),
    title: IMAGE_CREATOR_SESSION_TITLE,
    archived: false,
    lastPrompt: "",
    createdAt: null,
    updatedAt: null,
    session: {
      messages: []
    }
  };
}

export function deriveSessionTitleFromPrompt(prompt = "", fallback = IMAGE_CREATOR_SESSION_TITLE) {
  const clean = String(prompt || "").trim();
  if (!clean) return fallback;
  return clean.slice(0, 60);
}

export function findSessionById(sessions = [], sessionId = "") {
  return (Array.isArray(sessions) ? sessions : []).find((session) => String(session?.id || "") === String(sessionId || "")) || null;
}
