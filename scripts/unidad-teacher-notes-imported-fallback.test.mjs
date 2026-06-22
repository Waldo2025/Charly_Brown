import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/generarUnidad.js",
  "utf8"
);

assert.match(
  source,
  /function _unidadBuildImportedTeacherNotesFallbackSourceHtml\(documentoFuente = ""\)/,
  "Debe existir un helper para reconstruir actividades del documento importado antes del fallback."
);

assert.match(
  source,
  /const fuenteFallback = _unidadBuildImportedTeacherNotesFallbackSourceHtml\(fuenteDoc\);[\s\S]*_unidadBuildTeacherNotesStructuredHtml\(\{[\s\S]*contenidoActividades:\s*fuenteFallback,/,
  "El fallback de notas del maestro importadas debe reutilizar el builder estructurado por actividad."
);

assert.match(
  source,
  /_unidadBuildTeacherNotesImportedFallbackHtml\(\{[\s\S]*documentoFuente,[\s\S]*grado,[\s\S]*teacherNotesFormat:/,
  "La generación desde documento importado debe pasar el documento fuente y el grado al fallback."
);

console.log("unidad-teacher-notes-imported-fallback.test.mjs: ok");
