"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildImagePrompt } = require("../src/ai-jobs.js");

// El motor local anima la imagen de escena como primer frame. Mientras el prompt de la
// imagen decía «Title: …» el modelo pintaba el rótulo y Wan lo animaba derretido.
test("la imagen de escena entrega el tema como tema, nunca como rótulo", () => {
  const prompt = buildImagePrompt("scene_image", {
    title: "Fase 1: Evaporación | ¿El mar puede flotar?",
    prompt: "un océano de nubes al amanecer"
  });
  assert.doesNotMatch(prompt, /\bTitle:/i);
  assert.match(prompt, /without text, captions, watermarks or logos/i);
  assert.match(prompt, /never draw, write, render or imply any words, letters, signage, captions or titles/i);
  assert.match(prompt, /Scene subject .*Fase 1: Evaporación/s);
  assert.match(prompt, /un océano de nubes al amanecer/);
});

test("el retrato sigue sin texto y conserva quien habla", () => {
  const prompt = buildImagePrompt("speaker_portrait", {
    speakerName: "Profe Charly",
    expression: "curioso",
    scenarioPrompt: "estudio editorial moderno"
  });
  assert.doesNotMatch(prompt, /\bTitle:/i);
  assert.match(prompt, /without text or logos/i);
  assert.match(prompt, /Speaker: Profe Charly/);
  assert.match(prompt, /Expression: curioso/);
});
