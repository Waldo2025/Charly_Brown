export const PODCASTER_VIDEO_MODEL_AUTO = "auto";
export const PODCASTER_VIDEO_MODEL_OMNI = "gemini-omni-flash-preview";

export const VERTEX_VEO_MODEL_FALLBACKS = Object.freeze([
  "veo-3.1-generate-001",
  "veo-3.1-fast-generate-001",
  "veo-3.1-lite-generate-001",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
  "veo-2.0-generate-001"
]);

const VEO_MODEL_ALIASES = Object.freeze({
  "veo-3.1-generate-preview": "veo-3.1-generate-001",
  "veo-3.1-fast-generate-preview": "veo-3.1-fast-generate-001",
  "veo-3.1-lite-generate-preview": "veo-3.1-lite-generate-001",
  "veo-3.0-generate-preview": "veo-3.0-generate-001",
  "veo-3.0-fast-generate-preview": "veo-3.0-fast-generate-001",
  "veo-2.0-generate-preview": "veo-2.0-generate-001",
  "veo-2.0-generate-exp": "veo-2.0-generate-001"
});

export const AVAILABLE_PODCASTER_VIDEO_MODELS = Object.freeze([
  PODCASTER_VIDEO_MODEL_AUTO,
  PODCASTER_VIDEO_MODEL_OMNI,
  ...VERTEX_VEO_MODEL_FALLBACKS
]);

export function normalizeVertexVeoModelId(value = "") {
  const clean = String(value || "")
    .trim()
    .replace(/^.*\/models\//i, "")
    .replace(/:(?:predict|generateVideos)$/i, "");
  return VEO_MODEL_ALIASES[clean] || clean;
}

export function isVertexVeoModelId(value = "") {
  return /^veo-\d+(?:\.\d+)+(?:-(?:fast|lite))?-generate-(?:\d{3}|preview)$/i
    .test(normalizeVertexVeoModelId(value));
}

export function collectAvailablePodcasterVideoModels(records = []) {
  const discovered = (Array.isArray(records) ? records : [])
    .map((record) => normalizeVertexVeoModelId(
      typeof record === "string" ? record : (record?.name || record?.model || "")
    ))
    .filter(isVertexVeoModelId);
  const veoModels = Array.from(new Set([...VERTEX_VEO_MODEL_FALLBACKS, ...discovered]));
  veoModels.sort((left, right) => {
    const leftIndex = VERTEX_VEO_MODEL_FALLBACKS.indexOf(left);
    const rightIndex = VERTEX_VEO_MODEL_FALLBACKS.indexOf(right);
    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    }
    return right.localeCompare(left, undefined, { numeric: true });
  });
  return [PODCASTER_VIDEO_MODEL_AUTO, PODCASTER_VIDEO_MODEL_OMNI, ...veoModels];
}

export function formatPodcasterVideoModelLabel(modelId = "") {
  const model = normalizeVertexVeoModelId(modelId);
  if (model === PODCASTER_VIDEO_MODEL_AUTO) return "Automático — Omni recomendado";
  if (model === PODCASTER_VIDEO_MODEL_OMNI) return "Gemini Omni Flash";
  const match = model.match(/^veo-(\d+(?:\.\d+)+)(?:-(fast|lite))?-generate-(\d{3}|preview)$/i);
  if (!match) return model;
  const flavor = match[2] ? ` ${match[2][0].toUpperCase()}${match[2].slice(1)}` : " Standard";
  const stage = match[3] === "preview" || match[2] === "lite" ? " · Preview" : " · GA";
  return `Veo ${match[1]}${flavor}${stage}`;
}
