import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const { isValidPodcasterHeadlineText } = require("../public/podcaster/podcaster-on-screen-text.js");

const helperSource = source.match(
  /function resolveCreativeHeadlineTextEdit\(rawValue = "", previousValue = ""\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(helperSource, "Debe existir el helper puro de confirmación de titulares.");

const resolveCreativeHeadlineTextEdit = new Function(
  "isValidPodcasterHeadlineText",
  `return (${helperSource});`
)(isValidPodcasterHeadlineText);

assert.deepEqual(
  resolveCreativeHeadlineTextEdit("NUEVA MIRADA", "TEXTO ANTERIOR"),
  { accepted: true, value: "NUEVA MIRADA" }
);
assert.deepEqual(
  resolveCreativeHeadlineTextEdit("", "TEXTO ANTERIOR"),
  { accepted: true, value: "" },
  "El titular es opcional: vacío debe confirmarse."
);
assert.deepEqual(
  resolveCreativeHeadlineTextEdit("uno", "TEXTO MANUAL"),
  { accepted: false, value: "TEXTO MANUAL" },
  "Un titular inválido debe conservar el valor manual previo."
);
assert.deepEqual(
  resolveCreativeHeadlineTextEdit("uno dos tres cuatro cinco seis siete", "anterior"),
  { accepted: false, value: "" },
  "Si tampoco existe un valor previo válido, el fallback seguro es vacío."
);
assert.deepEqual(
  resolveCreativeHeadlineTextEdit("X".repeat(49), "TEXTO MANUAL"),
  { accepted: false, value: "TEXTO MANUAL" }
);

assert.match(
  source,
  /if \(field === "headlineText" && isLiveInput\) return;/,
  "El input provisional debe permitir escribir sin mutar la sesión ni validar palabras intermedias."
);
assert.match(
  source,
  /if \(field === "headlineText" && !headlineEdit\.accepted\) \{[\s\S]*?target\.value = headlineEdit\.value;[\s\S]*?return;\n\s*\}/,
  "Un change inválido debe revertir el control y salir antes del upsert."
);

console.log("Podcaster manual headline commit validation OK.");
