import assert from "node:assert/strict";
import fs from "node:fs";

const homeHtml = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/home.html",
  "utf8"
);
const homeJs = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/js/home.js",
  "utf8"
);

assert.match(
  homeHtml,
  /data-view="viewEscapeRooms"/,
  "Home debe poder navegar a una vista dedicada de Escape Rooms."
);

assert.match(
  homeHtml,
  /section id="viewEscapeRooms"/,
  "Home debe incluir una sección viewEscapeRooms."
);

assert.match(
  homeHtml,
  /id="contenedorEscapeRoomsUser"/,
  "Home debe incluir un contenedor para el catálogo de Escape Rooms."
);

assert.match(
  homeHtml,
  /id="escapeRoomPreviewModal"[\s\S]*?<iframe id="escapeRoomPreviewFrame"/,
  "Home debe incluir un modal con iframe para el preview del Escape Room."
);

assert.match(
  homeJs,
  /escapeRooms:\s*"published"/,
  "Los filtros del workbench deben incluir Escape Rooms."
);

assert.match(
  homeJs,
  /if \(viewId === 'viewEscapeRooms'\) loadUserEscapeRooms\(\);/,
  "La navegación de Home debe cargar la vista de Escape Rooms."
);

assert.match(
  homeJs,
  /async function loadUserEscapeRooms\(\)/,
  "Home debe implementar un loader específico para Escape Rooms."
);

assert.match(
  homeJs,
  /renderUserItemList\(contenedor,\s*escapeRooms,\s*'escapeRoom'\);/,
  "Home debe renderizar tarjetas de Escape Rooms con su tipo propio."
);

assert.match(
  homeJs,
  /data-type="escapeRoom_preview"/,
  "Cada tarjeta de Escape Room debe incluir una acción para ver preview."
);

assert.match(
  homeJs,
  /else if \(wbType === 'escapeRoom_preview'\) \{\s*openEscapeRoomPreview\(id\);/,
  "La acción de preview debe abrir el iframe del Escape Room."
);

assert.match(
  homeJs,
  /function openEscapeRoomPreview\(/,
  "Home debe exponer una función para abrir el preview del Escape Room."
);

assert.match(
  homeJs,
  /const trimestre = project\.trimestre \|\| item\.trimestre \|\| formState\.trimestreSelect \|\| "—";/,
  "Home debe leer el trimestre del escape room."
);

assert.match(
  homeJs,
  /const materia = project\.materia \|\| item\.materia \|\| formState\.materiaSelect \|\| "—";/,
  "Home debe leer la materia del escape room."
);

assert.match(
  homeJs,
  /const unidadTemaLabel = String\(nivel\)\.toLowerCase\(\) === "primaria" \? "Unidad" : "Tema";/,
  "Home debe cambiar la etiqueta entre Unidad y Tema según el nivel."
);

assert.match(
  homeJs,
  /const unidadTemaValue = project\.unidad \|\| item\.unidad \|\| project\.tema \|\| item\.tema \|\| formState\.unidadTemaSelect \|\| "—";/,
  "Home debe mostrar unidad o tema desde los datos persistidos."
);

assert.match(
  homeJs,
  /const estacion = project\.estacion \|\| item\.estacion \|\| formState\.estacionSelect \|\| "";/,
  "Home debe leer la estación cuando el escape room es de secundaria."
);

console.log("Home escape room workbench OK.");
