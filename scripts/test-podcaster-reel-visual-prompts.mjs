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
  promptProfile: "timeline-scene-video",
  educationalVideo: true,
  isReel: true,
  sceneDescription: "Youtuber de frente explicando la fotosíntesis",
  visualNotes: "El youtuber sonríe y señala un gráfico animado de una planta que aparece flotando a su lado",
  imagePrompts: []
});

console.log("Verifying dialogue video prompt content for Reel Mode...");
assert.match(dialoguePromptResult.prompt, /Genera un video corto de redes sociales \(Short\/Reel\) en formato vertical, claro, enérgico y realista\./);
assert.match(dialoguePromptResult.prompt, /La prioridad es representar al youtuber centrado de frente explicando con entusiasmo/);
assert.match(dialoguePromptResult.prompt, /El presentador debe permanecer visible y centrado en el medio de la pantalla vertical\./);
assert.match(dialoguePromptResult.prompt, /Prohibido texto incrustado, subtítulos, overlays complejos o elementos de interfaz\. Se permiten únicamente símbolos o diagramas didácticos limpios/);
assert.match(dialoguePromptResult.prompt, /Composición vertical de YouTuber en 9:16, limpia, con el presentador posicionado de frente exactamente en el centro de la pantalla/);

assert.ok(dialoguePromptResult.sceneImagePromptList.length >= 2);
assert.match(dialoguePromptResult.sceneImagePromptList[0], /Variación vertical 9:16 de youtuber\/presentador en primer plano centrado/);
assert.match(dialoguePromptResult.sceneImagePromptList[1], /Toma alternativa vertical de apoyo youtuber centrado/);

console.log("Dialogue video prompt Reel Mode verification passed successfully!");
console.log("All Reel Mode prompt tests PASSED!");
