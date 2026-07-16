"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PODCASTER_VIDEO_TRANSLATION_TASK,
  PODCASTER_VIDEO_TRANSLATION_MODEL,
  hasLikelySpanishVisualDirections,
  buildTranslationPayload,
  normalizePodcasterVisualDirectionsToEnglish
} = require("./podcaster-video-prompt-translation.js");

test("detects Spanish visual direction but ignores already-English direction", () => {
  assert.equal(hasLikelySpanishVisualDirections({ sceneDescription: "Plano medio con luz cálida." }), true);
  assert.equal(hasLikelySpanishVisualDirections({ sceneDescription: "Medium shot with warm studio light." }), false);
});

test("sanitizes editorial copy before visual translation", () => {
  const { payload, removedDirectives } = buildTranslationPayload({
    headlineText: "CHARLY PODCAST",
    captionText: "Hola mundo",
    sceneDescription: "La fachada contiene CHARLY PODCAST.",
    visualNotes: "El presentador saluda con Hola mundo.",
    inSceneText: "ESTUDIO CHARLY",
    imagePrompts: ["Un muro dice ESTUDIO CHARLY."]
  });

  assert.doesNotMatch(JSON.stringify(payload), /CHARLY PODCAST|Hola mundo|ESTUDIO CHARLY/);
  assert.ok(removedDirectives.length >= 2);
});

test("translates sanitized visual fields with the explicit task and current text model", async () => {
  const calls = [];
  const client = {
    models: {
      async generateContent(request) {
        calls.push(request);
        return {
          text: JSON.stringify({
            sceneDescription: "A host stands in a warm studio.",
            visualNotes: "The host gestures naturally.",
            scenePrompt: "Slow camera push-in.",
            videoDirective: "Keep one continuous shot.",
            performanceDirective: "The host looks into the lens.",
            scenarioPrompt: "Warm editorial lighting.",
            transition: "Begin directly on the action.",
            regenerationSummary: "",
            regenerationPreserve: "",
            regenerationImprove: "",
            regenerationAvoid: "",
            regenerationQualityPrompt: "",
            imagePrompts: ["A warm studio reference without lettering."]
          })
        };
      }
    }
  };

  const result = await normalizePodcasterVisualDirectionsToEnglish({
    client,
    visualOptions: {
      sceneDescription: "Un presentador está en un estudio cálido.",
      visualNotes: "El presentador gesticula con naturalidad.",
      scenePrompt: "Acercamiento lento de cámara.",
      videoDirective: "Mantener una toma continua.",
      performanceDirective: "El presentador mira a cámara.",
      scenarioPrompt: "Iluminación editorial cálida.",
      transition: "Empezar directamente con la acción.",
      imagePrompts: ["Referencia de estudio cálido sin letras."]
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, PODCASTER_VIDEO_TRANSLATION_MODEL);
  assert.match(calls[0].contents[0].parts[0].text, new RegExp(PODCASTER_VIDEO_TRANSLATION_TASK));
  assert.equal(calls[0].config.temperature, 0);
  assert.equal(calls[0].config.responseMimeType, "application/json");
  assert.equal(result.translated, true);
  assert.equal(result.promptLanguage, "en");
  assert.match(result.visualOptions.sceneDescription, /warm studio/);
});

test("does not call the translation model for an English-only visual spec", async () => {
  const result = await normalizePodcasterVisualDirectionsToEnglish({
    client: { models: { async generateContent() { throw new Error("must not run"); } } },
    visualOptions: {
      sceneDescription: "A subject walks through a warm studio.",
      visualNotes: "Stable medium shot.",
      imagePrompts: []
    }
  });
  assert.equal(result.translated, false);
  assert.equal(result.visualOptions.sceneDescription, "A subject walks through a warm studio.");
});
