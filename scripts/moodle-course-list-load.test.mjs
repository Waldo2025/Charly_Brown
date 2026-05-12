import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/moodleCourse.js",
  "utf8"
);

function extractFunction(name) {
  const signatures = [
    `async function ${name}`,
    `function ${name}`,
    `export async function ${name}`,
    `export function ${name}`
  ];
  const start = signatures
    .map((signature) => source.indexOf(signature))
    .find((idx) => idx >= 0);
  if (start < 0) throw new Error(`No se encontró ${name}`);

  const paramsEnd = source.indexOf(")", start);
  const braceStart = source.indexOf("{", paramsEnd);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

assert.match(
  source,
  /void syncGeminiModelOptionsForMoodle\(\);\s*await cargarCursosUsuario\(\);/,
  "La carga de cursos no debe quedar bloqueada por la sincronización del selector Gemini."
);

{
  const harness = `
${extractFunction("esDocumentoCursoRaiz")}
${extractFunction("construirCursoLigeroParaFirestore")}
let cursoDocId = "curso-1";
let currentUserId = "user-1";
return { esDocumentoCursoRaiz, construirCursoLigeroParaFirestore };
`;

  const factory = new Function(harness);
  const api = factory();

  assert.equal(
    api.esDocumentoCursoRaiz("curso-1", { docType: "course" }),
    true,
    "Los cursos tipados explícitamente deben considerarse cursos raíz."
  );
  assert.equal(
    api.esDocumentoCursoRaiz("curso-1_mod-1", { docType: "module", cursoId: "curso-1" }),
    false,
    "Los módulos tipados no deben entrar en la lista de cursos."
  );

  const payload = api.construirCursoLigeroParaFirestore({
    id: "curso-9",
    nombre: "Curso de prueba",
    temas: []
  });

  assert.equal(payload.docType, "course", "El guardado del curso debe persistir docType=course.");
  assert.equal(payload.id, "curso-9", "El payload del curso debe preservar su id raíz.");
}

assert.match(
  source,
  /const datosActualizados = \{\s*\.\.\.cambiosSanitizados,\s*docType: "module"/,
  "Los módulos guardados deben persistir docType=module para que las listas futuras puedan filtrarlos sin heurísticas."
);

console.log("moodle-course-list-load.test.mjs: ok");
