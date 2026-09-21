import test from "node:test";
import assert from "node:assert/strict";

import { traducirPromptConfiguradoLocal } from "../public/js/mindmapPromptTranslation.mjs";

test("traduce al inglés el prompt configurado mostrado en Crear stickers", () => {
  const source = 'un elemento, o conjunto de elementos, persona o acción que represente el significado de la palabra "tallest", un dibujo simple, casi infantil casi sticker pero sin linea blanca, banco y negro, sin tantos elementos algun elemento a color solo si lo amerita';
  const translated = traducirPromptConfiguradoLocal(source);

  assert.equal(
    translated,
    'an element, group of elements, person, or action that represents the meaning of the word "tallest", a simple, childlike, sticker-style drawing without a white outline, mostly black and white, with few elements and a touch of color only when appropriate'
  );
});

test("traduce la plantilla predeterminada sin alterar la palabra objetivo", () => {
  const source = 'un elemento, o conjunto de elementos, persona o acción que represente el significado de la palabra "because", dibujo minimalista hecho por un niño en blanco y negro con algunos elementos a color, fondo blanco puro sin fondo de sticker ni marco, sin texto';
  const translated = traducirPromptConfiguradoLocal(source);

  assert.match(translated, /^an element, group of elements, person, or action/);
  assert.match(translated, /"because"/);
  assert.match(translated, /a minimalist child-drawn illustration/);
  assert.doesNotMatch(translated, /\b(un|dibujo|palabra|niño|fondo|sin texto)\b/i);
});
