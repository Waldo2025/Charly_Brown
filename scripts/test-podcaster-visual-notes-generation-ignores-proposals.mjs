import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

assert.match(
  source,
  /function resolveVisualNotesForGeneration\(row = null\)\s*\{/,
  "Debe existir un helper separado para resolver el elemento visual usado en generación."
);

assert.match(
  source,
  /if \(row\?\.visualNotesEditedStored === true\) \{\s*const edited = String\(row\?\.visualNotesEditedText \|\| ""\)/,
  "La generación debe priorizar el texto editado si existe."
);

const helperMatch = source.match(
  /function resolveVisualNotesForGeneration\(row = null\)\s*\{([\s\S]*?)\n\}/
);

assert.ok(
  helperMatch,
  "Debe poder localizarse el cuerpo de resolveVisualNotesForGeneration."
);

assert.ok(
  !helperMatch[1].includes("visualNotesProposal"),
  "La generación no debe tomar la propuesta visual como sustituto del visual oficial."
);

assert.match(
  source,
  /visualNotes:\s*String\(resolveVisualNotesForGeneration\(row\) \|\| row\?\.visual \|\| ""\)\.trim\(\)/,
  "La generación de video debe enviar el valor de visualNotes resuelto para generación, no la propuesta."
);

assert.doesNotMatch(
  source,
  /Propuesta Activa \(Se usar[aá] para generar el v[ií]deo\)/,
  "La UI no debe afirmar que la propuesta activa sustituye al elemento visual al generar."
);

console.log("Visual notes generation ignores proposals regression OK.");
