"use strict";

const { normalizeAspectRatio, normalizeInSceneText, normalizeTextPolicy } = require("./podcaster-video-provider.js");

const PODCASTER_VIDEO_PROMPT_VERSION = "podcaster_video_v2";
const TEXT_DIRECTIVE_PATTERN = /(?:\b(?:text|texts|title|titles|subtitle|subtitles|caption|captions|label|labels|letter|letters|word|words|logo|logos|watermark|watermarks|sign|signage|typography|typeface|interface|ui)\b|\b(?:texto|textos|t[ií]tulo|t[ií]tulos|subt[ií]tulo|subt[ií]tulos|caption|captions|etiqueta|etiquetas|letra|letras|palabra|palabras|logo|logos|marca de agua|marcas de agua|r[oó]tulo|r[oó]tulos|letrero|letreros|se[nñ]al|se[nñ]alizaci[oó]n|tipograf[ií]a|interfaz)\b|(?:says?|reads?|written|spelled|dice|diga|aparece|aparezcan|escrito|escriba|mostrar|muestra)\s+["“'])/iu;
const VISIBLE_COPY_CONTEXT_PATTERN = /(?:\b(?:display(?:s|ed|ing)?|show(?:s|ed|ing|n)?|present(?:s|ed|ing)?|contain(?:s|ed|ing)?|feature(?:s|d|ing)?|bear(?:s|ing)?|paint(?:s|ed|ing)?|print(?:s|ed|ing)?|write|writes|written|spell(?:s|ed|ing)?|read(?:s|ing)?|render(?:s|ed|ing)?|inscrib(?:e|es|ed|ing)|etch(?:es|ed|ing)|emblazon(?:s|ed|ing)?|project(?:s|ed|ing)?|screen|monitor|display|board|plaque|poster|banner|billboard|marquee|storefront|facade|façade|wall|panel|surface|neon)\b|\b(?:muestra|mostrar|exhibe|exhibir|presenta|presentar|contiene|contener|lleva|lucir|luce|pinta|pintado|impreso|escribe|escrito|deletrea|inscrito|grabado|proyecta|pantalla|monitor|cartel|placa|pizarra|tablero|p[oó]ster|banderola|marquesina|fachada|pared|muro|panel|superficie|ne[oó]n)\b|\b(?:hold|focus|linger|zoom)\s+(?:on|onto)\b)/iu;

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function promptFragmentKey(value = "") {
  return clean(value)
    .toLocaleLowerCase("en-US")
    .replace(/[.!?…;:,]+$/u, "")
    .trim();
}

function limitPromptText(value = "", maxChars = 400) {
  const text = clean(value);
  if (!text || text.length <= maxChars) return text;
  const slice = text.slice(0, Math.max(1, maxChars));
  const boundary = slice.lastIndexOf(" ");
  return `${(boundary > maxChars * 0.65 ? slice.slice(0, boundary) : slice).trim()}…`;
}

function removeExactEditorialCopy(value = "", copies = []) {
  let next = String(value || "");
  let removedCount = 0;
  const uniqueCopies = Array.from(new Set((Array.isArray(copies) ? copies : [])
    .map((copy) => clean(copy))
    .filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  for (const copy of uniqueCopies) {
    const copyPattern = copy.split(/\s+/u).map(escapeRegExp).join("\\s+");
    const prefixBoundary = /^[\p{L}\p{N}]/u.test(copy) ? "(?<![\\p{L}\\p{N}])" : "";
    const suffixBoundary = /[\p{L}\p{N}]$/u.test(copy) ? "(?![\\p{L}\\p{N}])" : "";
    const pattern = new RegExp(`${prefixBoundary}${copyPattern}${suffixBoundary}`, "giu");
    next = next.replace(pattern, () => {
      removedCount += 1;
      return "";
    });
  }
  return {
    value: clean(next)
      .replace(/\s+([,.;:!?])/gu, "$1")
      .replace(/(?:\s+[,;:]|[,;:]\s*)$/u, "")
      .trim(),
    removedCount
  };
}

function removeEditorialCopyInstructions(value = "", copies = []) {
  const uniqueCopies = Array.from(new Set((Array.isArray(copies) ? copies : [])
    .map((copy) => clean(copy))
    .filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  if (!uniqueCopies.length) return { value: clean(value), removedCount: 0 };
  const kept = [];
  let removedCount = 0;
  for (const fragment of splitDirectiveFragments(value)) {
    const containsEditorialCopy = uniqueCopies.some((copy) => {
      const copyPattern = copy.split(/\s+/u).map(escapeRegExp).join("\\s+");
      const prefixBoundary = /^[\p{L}\p{N}]/u.test(copy) ? "(?<![\\p{L}\\p{N}])" : "";
      const suffixBoundary = /[\p{L}\p{N}]$/u.test(copy) ? "(?![\\p{L}\\p{N}])" : "";
      return new RegExp(`${prefixBoundary}${copyPattern}${suffixBoundary}`, "iu").test(fragment);
    });
    if (containsEditorialCopy && VISIBLE_COPY_CONTEXT_PATTERN.test(fragment)) {
      removedCount += 1;
      continue;
    }
    kept.push(fragment);
  }
  return { value: kept.join(" ").trim(), removedCount };
}

function buildUniquePromptSpec(values = [], maxChars = 1200) {
  const seen = new Set();
  const fragments = [];
  for (const value of Array.isArray(values) ? values : []) {
    for (const fragment of splitDirectiveFragments(value)) {
      const key = promptFragmentKey(fragment);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      fragments.push(ensureSentence(fragment));
    }
  }
  return limitPromptText(fragments.join(" "), maxChars);
}

function ensureSentence(value = "") {
  const text = clean(value);
  if (!text) return "";
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function normalizePromptList(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean)));
}

function splitDirectiveFragments(value = "") {
  return String(value || "")
    .split(/(?:\r?\n|\s*\|\s*|(?<=[.!?;])\s+)/u)
    .map((fragment) => clean(fragment))
    .filter(Boolean);
}

function editorialCopyVariants(value = "") {
  const variants = [clean(value), ...splitDirectiveFragments(value)];
  return variants.flatMap((variant) => {
    const withoutTerminalPunctuation = variant
      .replace(/^[\s“”"'…]+|[\s.!?…;:,“”"']+$/gu, "")
      .trim();
    return withoutTerminalPunctuation && withoutTerminalPunctuation !== variant
      ? [variant, withoutTerminalPunctuation]
      : [variant];
  }).filter(Boolean);
}

function sanitizeVisualDirective(value = "") {
  const fragments = splitDirectiveFragments(value);
  const kept = [];
  let removedCount = 0;
  for (const fragment of fragments) {
    if (TEXT_DIRECTIVE_PATTERN.test(fragment)) {
      removedCount += 1;
    } else {
      kept.push(fragment);
    }
  }
  return {
    value: kept.join(" ").trim(),
    removedCount
  };
}

function sanitizeVisualPromptFields(options = {}) {
  const regenerationAnalysis = options?.regenerationAnalysis && typeof options.regenerationAnalysis === "object"
    ? options.regenerationAnalysis
    : {};
  const fields = {
    sceneDescription: options?.sceneDescription || options?.scenePrompt || "",
    visualNotes: options?.visualNotes || "",
    scenePrompt: options?.scenePrompt || "",
    videoDirective: options?.videoDirective || "",
    performanceDirective: options?.performanceDirective || "",
    scenarioPrompt: options?.scenarioPrompt || "",
    transition: options?.transition || "",
    regenerationSummary: regenerationAnalysis?.summary || "",
    regenerationPreserve: Array.isArray(regenerationAnalysis?.preserve) ? regenerationAnalysis.preserve.join(". ") : "",
    regenerationImprove: Array.isArray(regenerationAnalysis?.improve) ? regenerationAnalysis.improve.join(". ") : "",
    regenerationAvoid: Array.isArray(regenerationAnalysis?.avoid) ? regenerationAnalysis.avoid.join(". ") : "",
    regenerationQualityPrompt: regenerationAnalysis?.qualityPrompt || ""
  };
  const sanitized = {};
  const removedDirectives = [];
  const editorialCopies = [
    options?.headlineText,
    options?.captionText,
    options?.onScreenText,
    options?.inSceneText
  ].flatMap(editorialCopyVariants);
  for (const [field, value] of Object.entries(fields)) {
    const contextualCopyResult = removeEditorialCopyInstructions(value, editorialCopies);
    const exactCopyResult = removeExactEditorialCopy(contextualCopyResult.value, editorialCopies);
    const result = sanitizeVisualDirective(exactCopyResult.value);
    sanitized[field] = result.value;
    const removedCount = result.removedCount + exactCopyResult.removedCount + contextualCopyResult.removedCount;
    if (removedCount > 0) {
      removedDirectives.push({ field, count: removedCount });
    }
  }
  const imagePrompts = [];
  let removedImagePromptCount = 0;
  for (const value of normalizePromptList(options?.imagePrompts || [])) {
    const contextualCopyResult = removeEditorialCopyInstructions(value, editorialCopies);
    const exactCopyResult = removeExactEditorialCopy(contextualCopyResult.value, editorialCopies);
    const result = sanitizeVisualDirective(exactCopyResult.value);
    if (result.value) imagePrompts.push(result.value);
    removedImagePromptCount += result.removedCount + exactCopyResult.removedCount + contextualCopyResult.removedCount;
  }
  if (removedImagePromptCount > 0) {
    removedDirectives.push({ field: "imagePrompts", count: removedImagePromptCount });
  }
  sanitized.imagePrompts = Array.from(new Set(imagePrompts)).slice(0, 3);
  return { sanitized, removedDirectives };
}

function mergeRemovedDirectiveMetadata(...groups) {
  const counts = new Map();
  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      const field = clean(typeof item === "string" ? item : item?.field).slice(0, 80);
      if (!field) continue;
      const count = Math.max(1, Math.min(100, Math.round(Number(item?.count) || 1)));
      counts.set(field, Math.min(100, (counts.get(field) || 0) + count));
    }
  }
  return Array.from(counts, ([field, count]) => ({ field, count })).slice(0, 24);
}

function buildDialogueVideoPromptBundle(options = {}) {
  const isReel = options?.isReel === true || clean(options?.contentMode).toLowerCase() === "reel";
  const aspectRatio = normalizeAspectRatio(options?.aspectRatio, isReel);
  const inSceneText = normalizeInSceneText(options?.inSceneText || "");
  const textPolicy = normalizeTextPolicy(options?.textPolicy, inSceneText);
  const externalDialogueAudio = Boolean(clean(options?.dialogueAudioStoragePath || options?.dialogueAudioUrl));
  const generator = clean(options?.generator || "auto").toLowerCase() || "auto";
  const { sanitized, removedDirectives } = sanitizeVisualPromptFields(options);
  const previousScene = options?.previousScene && typeof options.previousScene === "object"
    ? options.previousScene
    : null;
  const relateWithPreviousScene = options?.relateWithPreviousScene === true;
  const imageInputRole = ["first_frame", "references", "video_extension"].includes(clean(options?.imageInputRole).toLowerCase())
    ? clean(options.imageInputRole).toLowerCase()
    : "none";
  const durationSec = Math.max(4, Math.min(8, Number(options?.inferredTargetDurationSec) || 8));
  const sceneVisualPrompt = buildUniquePromptSpec([
    sanitized.sceneDescription,
    sanitized.visualNotes,
    sanitized.scenePrompt,
    sanitized.videoDirective
  ], 1200);
  const sceneImagePromptList = sanitized.imagePrompts.length
    ? sanitized.imagePrompts
    : (sceneVisualPrompt ? [sceneVisualPrompt] : []);
  const sceneVisualKeys = new Set(splitDirectiveFragments(sceneVisualPrompt).map(promptFragmentKey).filter(Boolean));
  const referenceIntentPrompts = sanitized.imagePrompts
    .filter((item) => !sceneVisualKeys.has(promptFragmentKey(item)))
    .map((item) => limitPromptText(item, 260))
    .filter(Boolean)
    .slice(0, 3);
  const voiceOverText = limitPromptText(options?.text, 600);
  const regenerationInstruction = [
    sanitized.regenerationSummary ? `Current clip assessment: ${ensureSentence(sanitized.regenerationSummary)}` : "",
    sanitized.regenerationPreserve ? `Preserve: ${ensureSentence(sanitized.regenerationPreserve)}` : "",
    sanitized.regenerationImprove ? `Improve: ${ensureSentence(sanitized.regenerationImprove)}` : "",
    sanitized.regenerationAvoid ? `Avoid: ${ensureSentence(sanitized.regenerationAvoid)}` : "",
    sanitized.regenerationQualityPrompt ? `Quality refinement: ${ensureSentence(sanitized.regenerationQualityPrompt)}` : ""
  ].filter(Boolean).join(" ");
  const compactRegenerationInstruction = limitPromptText(regenerationInstruction, 800);
  const exactInSceneText = inSceneText.replace(/"/g, '\\"');
  const textInstruction = textPolicy === "in_scene"
    ? `Visible text: render exactly one natural, readable sign or surface that says "${exactInSceneText}". Spell it exactly as quoted. No other visible text.`
    : "Visible text: none. No titles, subtitles, captions, labels, lettering, logos, watermarks, interface elements, or text-like glyphs.";
  const audioInstruction = externalDialogueAudio
    ? "Audio: generate ambient sound only. No speech, narration, or lip-synced dialogue; external dialogue will be added in post-production."
    : (voiceOverText
      ? `Audio: natural ambience. The speaker says: ${ensureSentence(voiceOverText)} Never show the dialogue as visible text.`
      : "Audio: natural ambience only. No dialogue.");
  const prompt = [
    `Create a polished ${durationSec}-second video in ${aspectRatio}.`,
    `Timeline 00:00–00:${String(Math.round(durationSec)).padStart(2, "0")}: remain in the same scene and complete the requested action naturally.`,
    "Use one continuous, unbroken shot with no scene cuts.",
    sceneVisualPrompt ? `Subject and setting: ${ensureSentence(sceneVisualPrompt)}` : "Subject and setting: a coherent cinematic scene matching the supplied visual references.",
    sanitized.performanceDirective ? `Action: ${ensureSentence(limitPromptText(sanitized.performanceDirective, 360))}` : "Action: subtle, physically plausible motion with a clear focal subject.",
    sanitized.transition ? `Opening motion: ${ensureSentence(limitPromptText(sanitized.transition, 220))}` : "Opening motion: begin directly on the requested action.",
    sanitized.scenarioPrompt ? `Environment and lighting: ${ensureSentence(limitPromptText(sanitized.scenarioPrompt, 500))}` : "Environment and lighting: realistic, intentional, premium editorial lighting.",
    compactRegenerationInstruction ? `Regeneration guidance: ${compactRegenerationInstruction}` : "",
    referenceIntentPrompts.length ? `Reference intent: ${referenceIntentPrompts.map(ensureSentence).join(" ")}` : "",
    relateWithPreviousScene
      ? "Continuity: match the supplied previous-scene frame at the opening, then continue naturally into this scene."
      : "",
    relateWithPreviousScene && previousScene?.expression
      ? `Performance continuity: evolve naturally from ${clean(previousScene.expression)} to ${clean(options?.expression || "neutral")}.`
      : "",
    imageInputRole === "first_frame"
      ? "Use the supplied first-frame image as the opening frame and preserve its composition and subject identity."
      : (imageInputRole === "references"
        ? "Use the supplied reference images in input order without displaying them as still images."
        : (imageInputRole === "video_extension"
          ? "Continue the supplied input video naturally without restarting or replacing its final state."
          : "")),
    "Camera and composition: stable intentional framing, realistic lens behavior, coherent depth, no abrupt reframing.",
    audioInstruction,
    textInstruction
  ].filter(Boolean).join("\n");

  return {
    promptVersion: PODCASTER_VIDEO_PROMPT_VERSION,
    generator,
    aspectRatio,
    textPolicy,
    inSceneText,
    externalDialogueAudio,
    sceneVisualPrompt,
    sceneImagePromptList,
    removedDirectives: mergeRemovedDirectiveMetadata(options?.removedTextDirectives, removedDirectives),
    prompt
  };
}

module.exports = {
  PODCASTER_VIDEO_PROMPT_VERSION,
  TEXT_DIRECTIVE_PATTERN,
  VISIBLE_COPY_CONTEXT_PATTERN,
  sanitizeVisualDirective,
  sanitizeVisualPromptFields,
  removeExactEditorialCopy,
  removeEditorialCopyInstructions,
  buildUniquePromptSpec,
  mergeRemovedDirectiveMetadata,
  buildDialogueVideoPromptBundle
};
