import test from "node:test";
import assert from "node:assert/strict";
import { contentDocument, CONTENT_SLOT, fillContentDocument } from "../public/js/pigpen-fixed-content.mjs";

test("fillContentDocument parses cleanly when response is enclosed in markdown code fences", () => {
  const doc = contentDocument({ title: CONTENT_SLOT, body: CONTENT_SLOT });
  const raw = [
    "```markdown",
    "<<<FIELD f00001>>>",
    "Mi título de prueba",
    "<<<END>>>",
    "<<<FIELD f00002>>>",
    "Mi cuerpo de prueba con \"comillas\" y saltos de línea",
    "<<<END>>>",
    "```"
  ].join("\n");

  const filled = fillContentDocument(doc, raw);
  assert.equal(filled.title, "Mi título de prueba");
  assert.equal(filled.body, "Mi cuerpo de prueba con \"comillas\" y saltos de línea");
});

test("fillContentDocument tolerates trailing markdown backticks without throwing invalid block error", () => {
  const doc = contentDocument({ greeting: CONTENT_SLOT });
  const raw = [
    "<<<FIELD f00001>>>",
    "¡Hola mundo!",
    "<<<END>>>",
    "```"
  ].join("\n");

  const filled = fillContentDocument(doc, raw);
  assert.equal(filled.greeting, "¡Hola mundo!");
});

test("fillContentDocument tolerates whitespace and casing variations in tags", () => {
  const doc = contentDocument({ a: CONTENT_SLOT, b: CONTENT_SLOT, c: CONTENT_SLOT });
  const raw = [
    "<<< FIELD f00001 >>>",
    "Campo A",
    "<<< END >>>",
    "<<<FIELD  f00002>>>",
    "Campo B",
    "<<<END >>>",
    "<<<field f00003>>>",
    "Campo C",
    "<<<end>>>"
  ].join("\n");

  const filled = fillContentDocument(doc, raw);
  assert.equal(filled.a, "Campo A");
  assert.equal(filled.b, "Campo B");
  assert.equal(filled.c, "Campo C");
});

test("fillContentDocument rejects injected JSON, structures, or duplicate fields", () => {
  const doc = contentDocument({ a: CONTENT_SLOT });
  const good = "<<<FIELD f00001>>>\nTexto\n<<<END>>>";

  assert.throws(() => fillContentDocument(doc, good + "\n{}"), /La respuesta de texto está incompleta o contiene bloques inválidos/);
  assert.throws(() => fillContentDocument(doc, good + good), /Campo de texto duplicado/);
  assert.throws(() => fillContentDocument(doc, "{\"a\":\"injected\"}"), /La respuesta de texto está incompleta o contiene bloques inválidos/);
});
