import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  ACTIVITY_SCENE_REALISM_CONTRACT,
  activitySceneStyleFinish,
  buildRealisticActivityImagePrompt,
  contextualLevelImageDetails
} from "../public/js/science-image-prompt-contract.mjs";

const videoActivity = {
  subject: "math",
  topic: "La recta numérica",
  visualStyle: "rive-tokyo-tech",
  experiencePrompt: "Edita en una laptop un video real de skateboarding y sincroniza el audio con el instante del impacto.",
  mission: "Ubica fracciones en la recta de tiempo del editor para sincronizar imagen y sonido."
};

test("el estilo controla el acabado y no inventa el escenario", () => {
  const finish = activitySceneStyleFinish("rive-tokyo-tech");
  assert.match(finish, /palette|linework|lighting/i);
  assert.doesNotMatch(finish, /HUD|laboratory|hologram|command center|station|spaceship/i);
});

test("el prompt final conserva literalmente experiencia, herramientas y acción", () => {
  const prompt = buildRealisticActivityImagePrompt(videoActivity, {
    narrative: "Una estudiante ajusta la pista de audio del video.",
    objective: "Sincronizar el impacto usando fracciones.",
    example: { text: "El impacto ocurre a tres cuartos de segundo en la línea de tiempo." }
  }, 0, 3);

  assert.match(prompt, /laptop/);
  assert.match(prompt, /video real de skateboarding/);
  assert.match(prompt, /pista de audio/);
  assert.match(prompt, /SCENE REALISM IS MANDATORY/);
  assert.match(prompt, /style may change only color palette, linework, shading and lighting/i);
});

test("descarta escenografía futurista heredada salvo petición explícita", () => {
  const legacyLevel = { imagePrompt: "A holographic command center with floating screens. A teenager edits the skate video on a normal laptop." };
  const repaired = contextualLevelImageDetails(videoActivity, legacyLevel);
  assert.doesNotMatch(repaired, /holographic|command center|floating screens/i);
  assert.match(repaired, /normal laptop/);

  const requested = contextualLevelImageDetails({
    ...videoActivity,
    experiencePrompt: "En un centro de mando holográfico del futuro con pantallas flotantes, sincroniza un video."
  }, legacyLevel);
  assert.match(requested, /holographic command center/i);
});

test("la integración usa el contrato en generación, fallback y cambio de estilo", async () => {
  const source = await readFile(new URL("../public/js/scienceActivities.js", import.meta.url), "utf8");
  assert.match(source, /buildRealisticActivityImagePrompt\(activity, level, index, levelCount\)/);
  assert.match(source, /ACTIVITY_SCENE_REALISM_CONTRACT/);
  assert.match(source, /Acabado visual obligatorio, únicamente para color, línea, sombreado e iluminación/);
  assert.match(source, /level\.imagePrompt = buildActivityLevelSceneSeed\(state\.activity, level, index\)/);
  assert.doesNotMatch(source, /level\.imagePrompt = `\$\{VISUAL_STYLE_DIRECTIONS\[state\.activity\.visualStyle\]\} 2D educational game scene/);
  assert.match(source, /async function alignVisualQuestionToGeneratedImage\(activity, assessment, imageDataUrl\)/);
  assert.match(source, /const bitmap = await decodeImageSource\(imageDataUrl\)/);
  assert.doesNotMatch(source, /fetch\(imageDataUrl\)/);
  assert.match(source, /Determina qué elemento toca realmente la punta de la flecha principal/);
  assert.match(source, /await alignVisualQuestionToGeneratedImage\(activity, assessment, generatedImageDataUrl\)/);
  assert.match(source, /analysisVersion: 1/);
  assert.match(source, /const hasVerifiedImage = hasImage\(\) && Number\(visualQuestion\.visual\?\.analysisVersion \|\| 0\) >= 1/);
});

test("el contrato prohíbe sustituciones irreales del caso cotidiano", () => {
  assert.match(ACTIVITY_SCENE_REALISM_CONTRACT, /Do not turn an ordinary task into a laboratory, command center, spaceship, fantasy world/);
  assert.match(ACTIVITY_SCENE_REALISM_CONTRACT, /No holograms, floating screens/);
});
