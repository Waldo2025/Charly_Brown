const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDialogueVideoPromptBundle
} = require("./dialogue-video-prompt.js");

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
    visualNotes: "Una vista aérea abstracta del continente americano. La palabra 'Descubrimiento' aparece brevemente y luego se tacha con una 'X'. Un mapa de Latinoamérica se ilumina.",
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

test("timeline scene profile prioritizes raw scene description and visual notes before advanced fields", () => {
  const result = buildDialogueVideoPromptBundle(createFixture());

  assert.equal(typeof result.prompt, "string");
  assert.match(result.prompt, /Usa exactamente esta descripción de escena como base del plano\/entorno: Interior cinematográfico\./);
  assert.match(result.prompt, /Usa exactamente este elemento visual como contenido principal del clip: Una vista aérea abstracta del continente americano\./);
  assert.match(result.prompt, /Contexto narrativo de voz en off: Hoy cambia la forma de nombrar esta fecha en América Latina\./);
  assert.match(result.prompt, /ScenePrompt de apoyo:/);
  assert.match(result.prompt, /VideoDirective de apoyo:/);
  assert.match(result.prompt, /ImagePrompts de apoyo:/);
  assert.doesNotMatch(result.prompt, /Prioridad máxima:/);
  assert.ok(
    result.prompt.indexOf("Usa exactamente esta descripción de escena como base del plano/entorno:")
      < result.prompt.indexOf("ScenePrompt de apoyo:"),
    "sceneDescription debe aparecer antes de scenePrompt"
  );
  assert.ok(
    result.prompt.indexOf("Usa exactamente este elemento visual como contenido principal del clip:")
      < result.prompt.indexOf("VideoDirective de apoyo:"),
    "visualNotes debe aparecer antes de videoDirective"
  );
});

test("timeline scene profile omits continuity instruction when relateWithPreviousScene is off", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    relateWithPreviousScene: false,
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

  assert.doesNotMatch(result.prompt, /Conserva continuidad con la escena anterior en el primer fotograma/);
});

test("timeline scene profile adds continuity instruction only when relateWithPreviousScene is on", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
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

  assert.match(result.prompt, /Conserva continuidad con la escena anterior en el primer fotograma y luego obedece el nuevo contenido solicitado\./);
  assert.match(result.prompt, /La continuidad con la escena anterior es obligatoria solo como punto de arranque del clip;/);
  assert.match(result.prompt, /Tras el primer fotograma, prioriza el nuevo Elemento visual/);
});

test("timeline scene profile structures prompt correctly when isReel is on", () => {
  const result = buildDialogueVideoPromptBundle(createFixture({
    isReel: true,
    imagePrompts: []
  }));

  assert.match(result.prompt, /Genera un video corto de redes sociales \(Short\/Reel\) en formato vertical, claro, enérgico y realista\./);
  assert.match(result.prompt, /La prioridad es representar al youtuber centrado de frente explicando con entusiasmo la Descripción de escena y el Elemento visual\./);
  assert.match(result.prompt, /El presentador debe permanecer visible y centrado en el medio de la pantalla vertical\./);
  assert.match(result.prompt, /Prohibido texto incrustado, subtítulos, overlays complejos o elementos de interfaz\. Se permiten únicamente símbolos o diagramas didácticos limpios flotando sutilmente/);
  assert.match(result.prompt, /Composición vertical de YouTuber en 9:16, limpia, con el presentador posicionado de frente exactamente en el centro de la pantalla, mirando directamente a la lente de la cámara/);

  assert.ok(result.sceneImagePromptList.length >= 2);
  assert.match(result.sceneImagePromptList[0], /Variación vertical 9:16 de youtuber\/presentador en primer plano centrado/);
  assert.match(result.sceneImagePromptList[1], /Toma alternativa vertical de apoyo youtuber centrado/);
});
