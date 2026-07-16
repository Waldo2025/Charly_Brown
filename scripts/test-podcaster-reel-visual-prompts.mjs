import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { buildBackendPodcasterStudioScenePrompt } = require("../backend/server.js");
const { buildDialogueVideoPromptBundle } = require("../backend/dialogue-video-prompt.js");

console.log("Starting Reel Mode prompt generation tests...");

// Test buildBackendPodcasterStudioScenePrompt
const studioPromptResult = buildBackendPodcasterStudioScenePrompt({
  speakerLabel: "HostA",
  speakerName: "Youtuber de Prueba",
  scenarioPrompt: "Cabina de radio premium",
  expression: "Enthusiastic",
  contentMode: "reel"
});

console.log("Verifying studio prompt content for Reel Mode...");
assert.match(studioPromptResult, /zona central del encuadre/i);
assert.match(studioPromptResult, /layout vertical de red social/i);
assert.match(studioPromptResult, /cuerpo de frente, posicionado simétricamente/i);
assert.match(studioPromptResult, /mirada fija y directa al lente de la cámara/i);
assert.match(studioPromptResult, /Directiva frontal de YouTuber: postura enérgica orientada al frente/i);
assert.match(studioPromptResult, /La cámara es el interlocutor principal; el presentador habla directamente al espectador/i);
assert.match(studioPromptResult, /Encuadre vertical \(9:16\), plano medio corto/i);
assert.match(studioPromptResult, /La escena debe sentirse como un creador de contenido dinámico \(YouTuber\) explicando un tema/i);
assert.match(studioPromptResult, /Priorizar gestos expresivos con las manos, actitud entusiasta y contacto visual directo/i);

console.log("Studio prompt Reel Mode verification passed successfully!");

// Test buildDialogueVideoPromptBundle
const dialoguePromptResult = buildDialogueVideoPromptBundle({
  promptProfile: "podcaster_video_v2",
  educationalVideo: true,
  isReel: true,
  aspectRatio: "9:16",
  textPolicy: "overlay_only",
  sceneDescription: "Youtuber de frente explicando la fotosíntesis",
  visualNotes: "El youtuber sonríe y señala un gráfico animado de una planta que aparece flotando a su lado",
  imagePrompts: []
});

console.log("Verifying dialogue video prompt content for Reel Mode...");
assert.equal(dialoguePromptResult.promptVersion, "podcaster_video_v2");
assert.equal(dialoguePromptResult.aspectRatio, "9:16");
assert.match(dialoguePromptResult.prompt, /Create a polished 8-second video in 9:16\./);
assert.match(dialoguePromptResult.prompt, /Use one continuous, unbroken shot with no scene cuts\./);
assert.match(dialoguePromptResult.prompt, /Subject and setting: Youtuber de frente explicando la fotosíntesis\./);
assert.match(dialoguePromptResult.prompt, /Visible text: none\./);
assert.match(dialoguePromptResult.prompt, /No titles, subtitles, captions, labels, lettering, logos, watermarks, interface elements, or text-like glyphs\./);
assert.doesNotMatch(dialoguePromptResult.prompt, /16:9/);
assert.doesNotMatch(dialoguePromptResult.prompt, /timeline-scene-video/);

assert.ok(dialoguePromptResult.sceneImagePromptList.length >= 1);
assert.match(dialoguePromptResult.sceneImagePromptList[0], /Youtuber de frente explicando la fotosíntesis/);

console.log("Dialogue video prompt Reel Mode verification passed successfully!");
console.log("All Reel Mode prompt tests PASSED!");
