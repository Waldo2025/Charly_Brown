import assert from "node:assert/strict";
import {
  EXERCISE_DYNAMICS_CATALOG,
  getStoredExerciseDynamics,
  saveStoredExerciseDynamics,
  buildExerciseDynamicsDirective,
  normalizeExerciseDynamics,
  detectExerciseDynamics
} from "../public/charly-brown/exercise-dynamics-catalog.js";
import { buildActivityContractPrompt } from "../public/charly-brown/unit-contracts.js";

// 1. Verificar catálogo completo de 18 dinámicas
assert.equal(EXERCISE_DYNAMICS_CATALOG.length, 18, "El catálogo debe contener exactamente 18 dinámicas visuales de ejercicios");

const expectedIds = [
  "banco_palabras",
  "rellenar_espacios",
  "sopa_letras",
  "emparejamiento",
  "opcion_multiple",
  "cuadro_sinoptico",
  "instruccion_directa",
  "subrayar_colores",
  "pasaje_lectura",
  "lineas_pauta",
  "tabla_datos",
  "linea_tiempo",
  "indicador_cuaderno",
  "matematicas_fracciones",
  "juego_practico",
  "imagenes_comparativas",
  "recoleccion_investigacion",
  "dictado"
];

expectedIds.forEach((id) => {
  const item = EXERCISE_DYNAMICS_CATALOG.find((d) => d.id === id);
  assert.ok(item, `El catálogo debe incluir la dinámica '${id}'`);
  assert.ok(item.label, `La dinámica '${id}' debe tener una etiqueta descriptiva`);
  assert.ok(item.htmlSnippet, `La dinámica '${id}' debe tener un snippet HTML`);
});

// 2. Verificar directiva de prompt
const directive = buildExerciseDynamicsDirective(["sopa_letras", "rellenar_espacios", "emparejamiento"]);
assert.match(directive, /Sopa de letras/);
assert.match(directive, /cb-word-search-wrap/);
assert.match(directive, /Rellenar espacios en blanco/);
assert.match(directive, /Relación de columnas/);
assert.deepEqual(normalizeExerciseDynamics([]), [], "Una selección vacía no debe activar el catálogo entero");
assert.deepEqual(normalizeExerciseDynamics(["sopa_letras", "inexistente", "sopa_letras"]), ["sopa_letras"]);
assert.deepEqual(detectExerciseDynamics('<div class="cb-activity-bank"></div><div class="cb-matching-columns"></div>'), ["banco_palabras", "emparejamiento"]);

// 3. Verificar integración en buildActivityContractPrompt
const promptText = buildActivityContractPrompt({
  grade: "Tercero",
  category: "Lenguaje y comunicación",
  subtopic: "Ortografía",
  enabledExerciseDynamics: ["sopa_letras", "banco_palabras"]
});
assert.match(promptText, /DINÁMICAS Y TIPOS DE EJERCICIOS ACTIVOS/, "buildActivityContractPrompt debe incorporar la directiva de dinámicas");
assert.match(promptText, /Sopa de letras con cuadrícula editorial/);
assert.match(promptText, /Banco de palabras o números en caja/);

console.log("Exercise dynamics catalog tests passed successfully!");
