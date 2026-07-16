"use strict";

const { createHash } = require("node:crypto");
const {
  sanitizeVisualPromptFields,
  mergeRemovedDirectiveMetadata
} = require("./dialogue-video-prompt.js");

const PODCASTER_VIDEO_TRANSLATION_TASK = "podcaster_video_prompt_translation_v2";
const PODCASTER_VIDEO_TRANSLATION_MODEL = "gemini-3.5-flash";
const TRANSLATION_CACHE_LIMIT = 256;
const translationCache = new Map();

const STRING_FIELDS = Object.freeze([
  "sceneDescription",
  "visualNotes",
  "scenePrompt",
  "videoDirective",
  "performanceDirective",
  "scenarioPrompt",
  "transition",
  "regenerationSummary",
  "regenerationPreserve",
  "regenerationImprove",
  "regenerationAvoid",
  "regenerationQualityPrompt"
]);

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasLikelySpanishVisualDirections(payload = {}) {
  const source = [
    ...STRING_FIELDS.map((field) => payload?.[field]),
    ...(Array.isArray(payload?.imagePrompts) ? payload.imagePrompts : [])
  ].map(clean).filter(Boolean).join(" ");
  if (!source) return false;
  return /[áéíóúüñ¿¡]/iu.test(source)
    || /\b(?:el|la|los|las|un|una|con|sin|sobre|desde|hacia|entre|mientras|c[aá]mara|plano|escena|luz|iluminaci[oó]n|presentador|locutor|fondo|movimiento|corte|transici[oó]n|acercamiento|alejamiento|rostro|manos|estudio|calida|c[aá]lida|lento|lenta|r[aá]pido|r[aá]pida)\b/iu.test(source);
}

function extractResponseText(response = {}) {
  if (typeof response?.text === "string") return response.text.trim();
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => clean(part?.text)).filter(Boolean).join("\n").trim();
}

function parseTranslationResponse(response = {}) {
  const raw = extractResponseText(response)
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function buildTranslationPayload(options = {}) {
  const { sanitized, removedDirectives } = sanitizeVisualPromptFields(options);
  const payload = Object.fromEntries(STRING_FIELDS.map((field) => [field, clean(sanitized?.[field])]));
  payload.imagePrompts = Array.isArray(sanitized?.imagePrompts)
    ? sanitized.imagePrompts.map(clean).filter(Boolean).slice(0, 3)
    : [];
  return { payload, removedDirectives };
}

function validateTranslatedPayload(source = {}, translated = {}) {
  const result = {};
  for (const field of STRING_FIELDS) {
    const sourceValue = clean(source?.[field]);
    const translatedValue = clean(translated?.[field]);
    if (sourceValue && !translatedValue) return null;
    result[field] = translatedValue;
  }
  const sourceImages = Array.isArray(source?.imagePrompts) ? source.imagePrompts : [];
  const translatedImages = Array.isArray(translated?.imagePrompts)
    ? translated.imagePrompts.map(clean).filter(Boolean)
    : [];
  if (sourceImages.length && translatedImages.length !== sourceImages.length) return null;
  result.imagePrompts = translatedImages.slice(0, 3);
  return result;
}

function rememberTranslation(key = "", value = null) {
  if (!key || !value) return;
  if (translationCache.size >= TRANSLATION_CACHE_LIMIT) {
    const oldestKey = translationCache.keys().next().value;
    if (oldestKey) translationCache.delete(oldestKey);
  }
  translationCache.set(key, value);
}

async function normalizePodcasterVisualDirectionsToEnglish(options = {}) {
  const client = options?.client;
  const visualOptions = options?.visualOptions && typeof options.visualOptions === "object"
    ? options.visualOptions
    : {};
  const { payload, removedDirectives } = buildTranslationPayload(visualOptions);
  const needsTranslation = hasLikelySpanishVisualDirections(payload);
  let normalized = payload;
  let translated = false;

  if (needsTranslation) {
    if (!client?.models?.generateContent) {
      const error = new Error("No se puede normalizar el prompt visual a inglés porque Gemini generateContent no está disponible.");
      error.code = "podcaster_visual_translation_unavailable";
      error.status = 500;
      throw error;
    }
    const cacheKey = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
    const cached = translationCache.get(cacheKey);
    if (cached) {
      normalized = cached;
      translated = true;
    } else {
      const response = await client.models.generateContent({
        model: PODCASTER_VIDEO_TRANSLATION_MODEL,
        contents: [{
          role: "user",
          parts: [{
            text: [
              `Task: ${PODCASTER_VIDEO_TRANSLATION_TASK}.`,
              "Translate every non-empty value in the JSON object into concise, natural English cinematic direction.",
              "Preserve meaning and proper nouns, but never introduce titles, captions, logos, lettering, words, or visible text.",
              "Keep empty values empty and preserve the imagePrompts array length and order.",
              "Return only JSON matching the supplied schema.",
              JSON.stringify(payload)
            ].join("\n")
          }]
        }],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              ...Object.fromEntries(STRING_FIELDS.map((field) => [field, { type: "string" }])),
              imagePrompts: { type: "array", items: { type: "string" }, maxItems: 3 }
            },
            required: [...STRING_FIELDS, "imagePrompts"]
          },
          httpOptions: {
            timeout: Math.max(1000, Number(options?.timeoutMs || 60000) || 60000)
          }
        }
      });
      normalized = validateTranslatedPayload(payload, parseTranslationResponse(response));
      if (!normalized) {
        const error = new Error("Gemini no devolvió una traducción visual completa y válida; no se inició la generación de video.");
        error.code = "podcaster_visual_translation_invalid";
        error.status = 502;
        throw error;
      }
      rememberTranslation(cacheKey, normalized);
      translated = true;
    }
  }

  return {
    visualOptions: {
      ...visualOptions,
      sceneDescription: normalized.sceneDescription,
      visualNotes: normalized.visualNotes,
      scenePrompt: normalized.scenePrompt,
      videoDirective: normalized.videoDirective,
      performanceDirective: normalized.performanceDirective,
      scenarioPrompt: normalized.scenarioPrompt,
      transition: normalized.transition,
      imagePrompts: normalized.imagePrompts,
      regenerationAnalysis: {
        summary: normalized.regenerationSummary,
        preserve: normalized.regenerationPreserve ? [normalized.regenerationPreserve] : [],
        improve: normalized.regenerationImprove ? [normalized.regenerationImprove] : [],
        avoid: normalized.regenerationAvoid ? [normalized.regenerationAvoid] : [],
        qualityPrompt: normalized.regenerationQualityPrompt
      },
      removedTextDirectives: mergeRemovedDirectiveMetadata(
        visualOptions?.removedTextDirectives,
        removedDirectives
      )
    },
    translated,
    promptLanguage: "en",
    taskProfile: PODCASTER_VIDEO_TRANSLATION_TASK,
    model: translated ? PODCASTER_VIDEO_TRANSLATION_MODEL : null
  };
}

module.exports = {
  PODCASTER_VIDEO_TRANSLATION_TASK,
  PODCASTER_VIDEO_TRANSLATION_MODEL,
  STRING_FIELDS,
  hasLikelySpanishVisualDirections,
  parseTranslationResponse,
  buildTranslationPayload,
  validateTranslatedPayload,
  normalizePodcasterVisualDirectionsToEnglish
};
