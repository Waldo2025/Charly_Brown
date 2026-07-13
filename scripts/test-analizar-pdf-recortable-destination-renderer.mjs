import assert from "node:assert/strict";
import fs from "node:fs";

const resultsSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-results.js",
  "utf8"
);
const recortablesSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/analizarPDF/analizar-pdf-recortables.js",
  "utf8"
);

assert.match(
  resultsSource,
  /function renderRecortableDestinationPageReportItems/,
  "El renderer debe tener una vista especializada para Recortables destino."
);
assert.match(
  resultsSource,
  /isRecortableDestinationContext\(session\)[\s\S]*renderRecortableDestinationPageReportItems/,
  "Recortables destino debe usar su renderer especializado, no el reporte general por pagina."
);
assert.match(
  resultsSource,
  /activeRevisionId[\s\S]*activeFileId[\s\S]*leftActive[\s\S]*rightActive/,
  "El renderer debe priorizar el archivo activo para que Recortables destino no quede debajo del Proyecto."
);
assert.match(
  resultsSource,
  /Coincidencia por c[oó]digo origen-destino/,
  "La vista destino debe mostrar coincidencia por código, no por página origen."
);
assert.match(
  resultsSource,
  /<h5>Ortotipograf[ií]a<\/h5>[\s\S]*renderSelectableIssueList\("orthotypography"/,
  "La vista destino debe conservar errores ortotipograficos."
);
assert.match(
  resultsSource,
  /<h5>Ortograf[ií]a<\/h5>[\s\S]*renderSelectableIssueList\("spelling"/,
  "La vista destino debe conservar errores ortograficos."
);
assert.doesNotMatch(
  resultsSource.match(/function renderRecortableDestinationPageReportItems[\s\S]*?function renderPageReportItems/)?.[0] || "",
  /renderFolioSignals|renderConfiguredAliasRows/,
  "La vista destino no debe renderizar los alias/estilos del mapeo como filas N\\/D."
);
assert.match(
  recortablesSource,
  /renderRecortableMetaList\(page = \{\}, options = \{\}\)/,
  "El bloque de recortables debe aceptar titulo contextual."
);
assert.match(
  recortablesSource,
  /const pushRow = \(row\) =>/,
  "El reporte por pagina debe acumular filas de complementos sin depender de una rama unica por pagina."
);
assert.doesNotMatch(
  recortablesSource.match(/if \(resolvedLinks\.length\)[\s\S]*?if \(!rows\.length/)?.[0] || "",
  /\}\s*else\s*\{/,
  "El reporte por pagina no debe ocultar originCodes/destinationCodes cuando ya existen resolvedLinks."
);
assert.match(
  resultsSource,
  /function buildRecortableRailItems\(page = \{\}, recortableMatchCodes = new Set\(\)\)/,
  "El rail debe construir entradas individuales para cada complemento detectado en la pagina."
);
assert.match(
  resultsSource,
  /function renderRailGroups\(items = \[\], context = \{\}, correctionSelection = \{\}, groupKeyPrefix = "", railTintHex = "", recortableMatchCodes = new Set\(\)\)/,
  "El rail debe recibir el tinte de unidad para propagarlo a todos los grupos internos."
);
assert.match(
  resultsSource,
  /renderRailGroups\([\s\S]*?entry,\s*entry\?\.correctionSelection \|\| \{\},\s*fileGroupKey,\s*railTintHex,\s*recortableMatchCodes\)/,
  "Los grupos internos del rail deben conservar el color de unidad del archivo/ficha."
);
assert.match(
  resultsSource,
  /pagesWithRecortables\.flatMap\(\(page\) => buildRecortableRailItems\(page,\s*recortableMatchCodes\)\)/,
  "El rail debe expandir una pagina a multiples accesos cuando contiene varios complementos."
);
assert.doesNotMatch(
  resultsSource.match(/const renderRecortablesGroup[\s\S]*?const renderPaginationGroup|const renderRecortablesGroup[\s\S]*?if \(recortableDestinationOnly\)/)?.[0] || "",
  /labels\[0\]|resolvedDestinations\]\[0\]|resolvedDestinations\[0\]/,
  "El rail no debe quedarse con el primer codigo encontrado en la pagina."
);
assert.match(
  resultsSource,
  /function buildGlobalRecortableMatchCodes\(fileEntries = \[\]\)/,
  "El rail debe calcular coincidencias globales origen-destino entre archivos analizados."
);
assert.match(
  resultsSource,
  /hasGlobalCodeMatch \? "ok"/,
  "Los badges de recortables deben marcarse OK por coincidencia global de código."
);

console.log("Recortable destination renderer OK.");
