import assert from "node:assert/strict";
import test from "node:test";
import { isMusicCreationRequest, resolveMusicDraftPrompt } from "../public/schroeder-sound-lab/creation-intent.mjs";

test("una orden de crear una pista prepara propuesta, sin clasificar preguntas como creación", () => {
  assert.equal(isMusicCreationRequest("genera la pista"), true);
  assert.equal(isMusicCreationRequest("Créala con esos elementos"), true);
  assert.equal(isMusicCreationRequest("sí, hazla"), true);
  assert.equal(isMusicCreationRequest("¿Cómo se compone una pista?"), false);
});

test("la confirmación conserva la idea musical previa para la propuesta", () => {
  const history = [
    { role: "user", text: "Quiero una pieza botánica con bambú y gotas de agua." },
    { role: "assistant", text: "Puedo prepararla con esos elementos." }
  ];
  assert.match(resolveMusicDraftPrompt("genera la pista", history), /pieza botánica con bambú y gotas de agua/);
  assert.equal(resolveMusicDraftPrompt("Crea jazz con piano", history), "Crea jazz con piano");
});
