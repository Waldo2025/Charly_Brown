import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/generarUnidad.js",
  "utf8"
);

function extractFunction(name) {
  const signatures = [`async function ${name}`, `function ${name}`];
  const start = signatures
    .map((signature) => source.indexOf(signature))
    .find((idx) => idx >= 0);
  if (start < 0) throw new Error(`No se encontró ${name}`);
  const paramsEnd = source.indexOf(")", start);
  const braceStart = source.indexOf("{", paramsEnd);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
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
function _obtenerTextoCompletoLectura(lectura = {}) {
  return String(lectura?.contenidoHTML || "").trim();
}
function _htmlAPlainText(html = "") {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
}
function _limpiarSeccionesLecturaNoNarrables(texto = "") {
  return String(texto || "");
}
function _normalizarContenidoLecturaHTMLUnidad(contenido = "") {
  return String(contenido || "").trim();
}
function _leerLecturaCache() {
  return globalThis.__lecturaCache || null;
}
${extractFunction("_contenidoLecturaUnidad")}
${extractFunction("_normalizarEstructuraLectura")}
${extractFunction("_resolverLecturaPorId")}
${extractFunction("_unidadIntentarResolverLecturasSeleccionadas")}
${extractFunction("_unidadIsGenerationNavigationLocked")}
${extractFunction("_unidadShouldAbortMissingResolvedReading")}
return { _contenidoLecturaUnidad, _normalizarEstructuraLectura, _resolverLecturaPorId, _unidadIntentarResolverLecturasSeleccionadas, _unidadIsGenerationNavigationLocked, _unidadShouldAbortMissingResolvedReading };
`;

const factory = new Function(harness);
const {
  _contenidoLecturaUnidad,
  _normalizarEstructuraLectura,
  _resolverLecturaPorId,
  _unidadIntentarResolverLecturasSeleccionadas,
  _unidadIsGenerationNavigationLocked,
  _unidadShouldAbortMissingResolvedReading
} = factory();

{
  const lecturaLigera = {
    id: "lectura-1",
    titulo: "Aprender a leer el mundo",
    rawData: {
      lecturaHtml: "<p>Texto completo de la lectura.</p>",
      preguntasComprension: [{ pregunta: "¿Qué aprendió?", respuesta: "A leer el mundo." }]
    }
  };

  const normalizada = _normalizarEstructuraLectura(lecturaLigera);
  const contenido = _contenidoLecturaUnidad(normalizada);

  assert.match(
    contenido,
    /Texto completo de la lectura/,
    "la lectura normalizada debe conservar contenido accesible aunque venga en rawData.lecturaHtml"
  );
  assert.equal(
    normalizada.preguntasComprension?.length,
    1,
    "la lectura normalizada debe conservar preguntasComprension"
  );
}

{
  globalThis.__lecturaCache = null;
  globalThis.window = {
    lecturasNuevas: [{
      id: "lectura-2",
      titulo: "Bosque azul",
      lecturaHtml: "<p>Había una vez un bosque azul.</p>",
      sourceCollection: "lecturasNuevas"
    }],
    lecturasASC: [],
    lecturasFiltradas: [],
    todasLasLecturas: []
  };
  globalThis._hidratarLecturasUnidadDesdeCacheLocal = () => {};
  globalThis.db = {};
  globalThis.doc = () => ({});
  globalThis.getDoc = async () => ({ exists: () => false });

  const lectura = await _resolverLecturaPorId("lectura-2");
  const contenido = _contenidoLecturaUnidad(lectura);

  assert.match(
    contenido,
    /bosque azul/i,
    "resolver desde lecturasNuevas debe preservar el contenido original del pool"
  );
}

{
  let remoteLoaded = false;
  let appliedId = "";
  globalThis.__lecturaCache = null;
  globalThis.window = {
    lecturasNuevas: [],
    lecturasASC: [],
    lecturasFiltradas: [],
    todasLasLecturas: [],
    lecturaNuevaCoincidenteGlobal: null
  };
  globalThis._hidratarLecturasUnidadDesdeCacheLocal = () => {};
  globalThis._obtenerLecturaPersistidaUnidad = () => ({ id: "firebase-1", label: "Lectura persistida" });
  globalThis._aplicarLecturaPrincipalSeleccionada = (lectura) => {
    appliedId = String(lectura?.id || "");
    globalThis.selectTema.value = appliedId;
    return true;
  };
  globalThis._restaurarUltimaLecturaSeleccionadaUnidad = () => false;
  globalThis.selectTema = { value: "", innerHTML: "", dispatchEvent() {} };
  globalThis.selectTemaASC = { value: "", options: [], appendChild(opt) { this.options.push(opt); } };
  globalThis.document = {
    getElementById(id) {
      if (id === "unidadTemaTexto") return { value: "" };
      return null;
    },
    createElement() {
      return { value: "", textContent: "" };
    }
  };
  globalThis.db = {};
  globalThis.doc = () => ({});
  globalThis.getDoc = async (_ref) => ({
    exists: () => remoteLoaded,
    id: "firebase-1",
    data: () => ({ titulo: "Desde Firebase", lecturaHtml: "<p>Contenido remoto</p>" })
  });
  globalThis.cargarTodasLasLecturas = async () => {
    remoteLoaded = true;
  };

  const resolved = await _unidadIntentarResolverLecturasSeleccionadas();

  assert.equal(appliedId, "firebase-1", "debe aplicar la lectura resuelta desde Firebase antes de caer a IA");
  assert.equal(resolved.hasSelection, true, "debe detectar selección válida después de cargar Firebase");
}

{
  globalThis.window = { generandoCategoria: "", categoriaEnProceso: "", stopRequestedUnidad: false };
  globalThis.spinnerResultadoUnidadProceso = { style: { display: "none" } };
  assert.equal(_unidadIsGenerationNavigationLocked(), false, "sin generación activa no debe bloquear navegación");

  globalThis.window.generandoCategoria = "Lenguaje y comunicación";
  assert.equal(_unidadIsGenerationNavigationLocked(), true, "si hay categoría generándose debe bloquear navegación");

  globalThis.window.generandoCategoria = "";
  globalThis.spinnerResultadoUnidadProceso.style.display = "flex";
  assert.equal(_unidadIsGenerationNavigationLocked(), true, "si el overlay de carga está visible debe bloquear navegación");
}

{
  assert.equal(
    _unidadShouldAbortMissingResolvedReading({
      hasRealSelection: true,
      lecturaResuelta: { lecturaDisponible: false, lectura: null }
    }),
    true,
    "si había selección real pero no se resolvió lectura, debe abortar para no inventar una lectura"
  );
  assert.equal(
    _unidadShouldAbortMissingResolvedReading({
      hasRealSelection: false,
      lecturaResuelta: { lecturaDisponible: false, lectura: null }
    }),
    false,
    "si no había selección real, el flujo no debe abortar por este motivo"
  );
}

console.log("unidad-reading-resolution.test.mjs: ok");
