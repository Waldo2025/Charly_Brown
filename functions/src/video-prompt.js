"use strict";

const VIDEO_PROMPT_VERSION = "podcaster_video_v3_reference_action";

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sentence(value = "") {
  const text = clean(value);
  if (!text) return "";
  return /[.!?…]$/u.test(text) ? text : `${text}.`;
}

function uniqueSpec(values = [], maxChars = 1400) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLocaleLowerCase("en-US").replace(/[.!?…;:,]+$/u, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(sentence(text));
  }
  return output.join(" ").slice(0, maxChars).trim();
}

function buildDialogueVideoPrompt(input = {}, options = {}) {
  const sceneDescription = uniqueSpec([
    input.sceneDescription,
    input.scenePrompt
  ], 1200);
  const action = uniqueSpec([
    input.visualNotes,
    input.videoDirective,
    input.performanceDirective
  ], 1200);
  const inSceneText = clean(input.inSceneText).slice(0, 280);
  const excludeScript = input.excludeScriptFromVideoPrompt === true
    || clean(input.dialoguePolicy).toLowerCase() === "ambient_only";
  const hasExternalDialogue = Boolean(clean(
    input.dialogueAudioStoragePath
    || input.dialogueAudioUrl
    || input.audioStoragePath
    || input.audioUrl
  ));
  const spokenDialogue = excludeScript || hasExternalDialogue
    ? ""
    : clean(input.text || input.targetSpeechLine || input.voiceOverText).slice(0, 1200);
  const hasReferenceImage = options.hasReferenceImage === true;
  const referenceMode = clean(options.referenceMode || (hasReferenceImage ? "first_frame" : "none"));
  const aspectRatio = clean(input.aspectRatio) === "9:16" ? "9:16" : "16:9";
  // Veo scene generation produces a full eight-second source. Timeline edits
  // (including clips shorter than eight seconds) are represented separately by
  // trimInMs/trimOutMs and must never reduce the provider request duration.
  const durationSeconds = 8;

  const prompt = [
    `Create a polished ${durationSeconds}-second video in ${aspectRatio} as one continuous shot.`,
    sceneDescription
      ? `Scene appearance and setting: ${sceneDescription}`
      : "Scene appearance and setting: preserve the supplied visual source faithfully.",
    action
      ? `Required action: ${action} Perform this action clearly and naturally.`
      : "Required action: subtle, physically plausible movement in the same scene.",
    hasReferenceImage && referenceMode === "first_frame"
      ? "The supplied image is the exact visual source and opening frame. Preserve the same subject identity, composition, environment, objects, materials, colors, lighting, and camera angle; animate that scene to perform the required action instead of redesigning it."
      : (hasReferenceImage
        ? "The supplied images are binding visual evidence. Match their identity, composition, environment, objects, materials, colors, and lighting as closely as possible while performing the required action."
        : "Maintain coherent identity, composition, lighting, and realistic motion."),
    spokenDialogue
      ? `The visible character speaks this exact dialogue naturally: ${sentence(spokenDialogue)} Never display the dialogue as subtitles or captions.`
      : "No speech, narration, or lip-synced dialogue; use natural ambience only.",
    (() => {
      if (!inSceneText) {
        return "No visible text, titles, subtitles, captions, labels, logos, watermarks, interface elements, or text-like glyphs.";
      }
      const exactInSceneText = inSceneText.replace(/"/g, '\\"');
      const isSpanish = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/u.test(inSceneText)
        || /\b(?:el|la|los|las|un|una|unos|unas|con|sin|sobre|desde|hacia|hasta|entre|mientras|seg[uú]n|para|por|pero|aunque|como|c[oó]mo|cuando|cu[aá]ndo|donde|d[oó]nde|quien|qui[eé]n|que|qu[eé]|cual|cu[aá]l|cuanto|cu[aá]nto|tanto|tanta|tantos|tantas|este|esta|estos|estas|esto|ese|esa|esos|esas|eso|aquel|aquella|aquellos|aquellas|mi|mis|tu|tus|su|sus|nuestro|nuestra|nuestros|nuestras|del|al|m[aá]s|menos|muy|mucho|mucha|muchos|muchas|poco|poca|pocos|pocas|todo|toda|todos|todas|otro|otra|otros|otras|cada|ambos|ambas|organizar|informaci[oó]n|educaci[oó]n|aprender|estudio|escuela|clase|vida|mundo|tiempo|a[nñ]o|a[nñ]os|d[ií]a|d[ií]as|hoy|ayer|siempre|nunca|bien|mal|nuevo|nueva|nuevos|nuevas|bueno|buena|buenos|buenas|gran|grande|grandes|mejor|mejores|peor|peores)\b/iu.test(inSceneText);
      const wordCount = inSceneText.trim().split(/\s+/).filter(Boolean).length;
      const langDirect = isSpanish
        ? "Language: Spanish. Preserve authentic Spanish orthography, accent marks, and inverted punctuation."
        : "Language: English.";
      return `Render exactly one natural, readable sign or surface that says "${exactInSceneText}". ${langDirect} Word count: exactly ${wordCount} words; render each word cleanly and strictly once without repeating, duplicating, stuttering, or introducing misspelled variants. Spell it exactly. No other visible text.`;
    })()
  ].join("\n");

  return {
    promptVersion: VIDEO_PROMPT_VERSION,
    prompt,
    sceneDescription,
    action,
    spokenDialogue,
    inSceneText,
    generateAudio: Boolean(spokenDialogue),
    durationSeconds,
    aspectRatio,
    referenceMode
  };
}

module.exports = {
  VIDEO_PROMPT_VERSION,
  buildDialogueVideoPrompt
};
