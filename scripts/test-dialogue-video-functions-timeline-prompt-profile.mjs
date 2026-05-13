import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { buildDialogueVideoPromptBundle: buildBackendPromptBundle } = require("../backend/dialogue-video-prompt.js");
const { buildDialogueVideoPromptBundle: buildFunctionsPromptBundle } = require("../functions/dialogue-video-prompt.js");

function createFixture(overrides = {}) {
  return {
    promptProfile: "timeline-scene-video",
    educationalVideo: true,
    speakerName: "Narrador",
    speakerLabel: "Narrador",
    voiceName: "",
    genderGroup: "",
    expression: "Neutral",
    counterpartSpeakerName: "",
    scenarioPrompt: "",
    scenePrompt: "Dirección base secundaria que no debe mandar.",
    sceneDescription: "Interior cinematográfico",
    visualNotes: "Una vista aérea abstracta del continente americano. La palabra 'Descubrimiento' aparece brevemente y luego se tacha con una 'X'. Un mapa de Latinoamérica se ilumina. Nombres como 'Día de la Resistencia Indígena' y 'Día de la Nación Pluricultural' aparecen sobre diferentes países, cambiando dinámicamente para mostrar la diversidad de denominaciones.",
    videoDirective: "Apoyo secundario: mantener legibilidad editorial y ritmo visual.",
    imagePrompts: [
      "Apoyo visual secundario: mapa iluminado de América Latina.",
      "Apoyo visual secundario: variación con nombres de conmemoraciones por país."
    ],
    performanceDirective: "",
    previousScene: null,
    relateWithPreviousScene: false,
    continuityFrameBase64: "",
    forceImmediateChange: false,
    hasPortraitAsset: false,
    dialogueAudioStoragePath: "",
    dialogueAudioUrl: "",
    inferredTargetDurationSec: 8,
    originalText: "",
    text: "Hoy cambia la forma de nombrar esta fecha en América Latina.",
    characterPrompt: "",
    studioScenePrompt: "",
    useSceneReferenceAsInitImage: false,
    referenceImageName: "",
    hasSceneReferenceVideo: false,
    referenceVideoName: "",
    regenerationAnalysis: null,
    ...overrides
  };
}

const backendResult = buildBackendPromptBundle(createFixture({
  relateWithPreviousScene: true,
  continuityFrameBase64: "ZmFrZQ==",
  forceImmediateChange: true,
  previousScene: {
    sceneNumber: 2,
    speakerName: "Narrador",
    speakerLabel: "Narrador",
    targetSpeechLine: "Escena previa",
    previousVideoTargetSpeechLine: "Clip previo",
    expression: "Neutral",
    hasVideo: true
  }
}));
const functionsResult = buildFunctionsPromptBundle(createFixture({
  relateWithPreviousScene: true,
  continuityFrameBase64: "ZmFrZQ==",
  forceImmediateChange: true,
  previousScene: {
    sceneNumber: 2,
    speakerName: "Narrador",
    speakerLabel: "Narrador",
    targetSpeechLine: "Escena previa",
    previousVideoTargetSpeechLine: "Clip previo",
    expression: "Neutral",
    hasVideo: true
  }
}));

assert.equal(functionsResult.prompt, backendResult.prompt, "Functions y backend deben construir el mismo prompt para timeline-scene-video.");
assert.match(functionsResult.prompt, /Interior cinematográfico/);
assert.match(functionsResult.prompt, /continente americano/i);
assert.match(functionsResult.prompt, /Latinoamérica/i);
assert.match(functionsResult.prompt, /Conserva continuidad con la escena anterior en el primer fotograma y luego obedece el nuevo contenido solicitado\./);
assert.match(functionsResult.prompt, /La continuidad con la escena anterior es obligatoria solo como punto de arranque del clip;/);
assert.doesNotMatch(functionsResult.prompt, /Prioridad máxima:/);

console.log("Functions timeline scene prompt profile regression OK.");
