export const podcasterGenerationShared = {
  dialogueAudioGenerationPending: new Set(),
  dialogueVideoGenerationPending: new Set(),
  timelineSceneVideoGenerationPending: new Set(),
  timelineSceneVideoGenerationStatus: new Map(),
  brokenDialogueVideoRows: new Set(),
  buildTimelineSceneGenerationKey: null,
  runSceneVideoGenerationFlow: null,
  generateDialogueVideoForRow: null,
  generateDialogueAudioForRow: null
};

export function registerPodcasterGenerationShared(patch = {}) {
  if (!patch || typeof patch !== "object") return podcasterGenerationShared;
  Object.entries(patch).forEach(([key, value]) => {
    if (!(key in podcasterGenerationShared)) return;
    podcasterGenerationShared[key] = value;
  });
  return podcasterGenerationShared;
}

export function requirePodcasterGenerationShared() {
  if (typeof podcasterGenerationShared.buildTimelineSceneGenerationKey !== "function") {
    throw new Error("PodcasterGenerationShared.buildTimelineSceneGenerationKey no está disponible.");
  }
  if (!(podcasterGenerationShared.timelineSceneVideoGenerationPending instanceof Set)) {
    throw new Error("PodcasterGenerationShared.timelineSceneVideoGenerationPending no está disponible.");
  }
  if (!(podcasterGenerationShared.timelineSceneVideoGenerationStatus instanceof Map)) {
    throw new Error("PodcasterGenerationShared.timelineSceneVideoGenerationStatus no está disponible.");
  }
  return podcasterGenerationShared;
}
