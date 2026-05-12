import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/moodleCourse.js",
  "utf8"
);

function extractFunction(name) {
  const signatures = [
    `async function ${name}`,
    `function ${name}`
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

const harness = `
let cursoDocId = "curso-1";
let currentUserId = "user-1";
let curso = null;
let guardarCursoFirebaseCalls = 0;
let guardarModuloCalls = [];
let renderTemasCalls = 0;
function sincronizarCursoActivoEnCursosUsuario() { return true; }
function persistirCursoActivoEnLocalStorage() { return true; }
function extraerIdInternoModulo(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.includes("_") ? value.split("_").pop() : value;
}
async function guardarCursoFirebase() {
  guardarCursoFirebaseCalls += 1;
  return true;
}
async function guardarModulo(moduloId, payload) {
  guardarModuloCalls.push({ moduloId, payload });
  return true;
}
function renderTemas() {
  renderTemasCalls += 1;
}
function cargarSubtema() {}
const localStorage = {
  getItem() { return null; }
};
${extractFunction("construirCursoLigeroParaFirestore")}
${extractFunction("obtenerClaveComparacionModulo")}
${extractFunction("aplicarOrdenVisibleAModulosIds")}
${extractFunction("moverModuloSegunOrdenVisible")}
return {
  construirCursoLigeroParaFirestore,
  moverModuloSegunOrdenVisible,
  setCurso(nextCurso) { curso = nextCurso; },
  getCurso() { return curso; },
  getState() { return { guardarCursoFirebaseCalls, guardarModuloCalls, renderTemasCalls }; }
};
`;

const factory = new Function(harness);
const api = factory();

{
  const cursoLocal = {
    id: "curso-1",
    nombre: "Curso de prueba",
    temas: [
      {
        id: "tema-1",
        subtemas: [
          {
            id: "sub-1",
            nombre: "Subtema con módulos cargados",
            modulos: [
              { id: "mod-a" },
              { id: "mod-b" }
            ]
          }
        ]
      }
    ]
  };

  const payload = api.construirCursoLigeroParaFirestore(cursoLocal);
  assert.deepEqual(
    payload.temas[0].subtemas[0].modulosIds,
    ["mod-a", "mod-b"],
    "debe derivar modulosIds desde subtema.modulos cuando todavía no existe el array ligero"
  );
}

{
  api.setCurso({
    id: "curso-1",
    temas: [
      {
        id: "tema-1",
        subtemas: [
          { id: "sub-origen", modulosIds: ["mod-a", "mod-b"] },
          { id: "sub-destino", modulosIds: [] }
        ]
      }
    ]
  });

  const moved = await api.moverModuloSegunOrdenVisible(
    "sub-origen",
    "sub-destino",
    "mod-a",
    ["mod-b"],
    ["mod-a"]
  );

  assert.equal(
    moved,
    true,
    "mover entre subtemas debe confirmar persistencia aunque el orden visible ya coincida con el estado mutado"
  );
  assert.deepEqual(
    api.getCurso().temas[0].subtemas[0].modulosIds,
    ["mod-b"],
    "el origen debe conservar el orden restante"
  );
  assert.deepEqual(
    api.getCurso().temas[0].subtemas[1].modulosIds,
    ["mod-a"],
    "el destino debe conservar el módulo movido"
  );
  const state = api.getState();
  assert.equal(state.guardarCursoFirebaseCalls > 0, true, "el movimiento debe disparar guardado de curso");
  assert.equal(state.guardarModuloCalls.length > 0, true, "el movimiento debe actualizar el módulo en Firestore");
}

console.log("moodle-course-save-order.test.mjs: ok");
