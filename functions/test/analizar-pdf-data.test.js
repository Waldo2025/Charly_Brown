const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SESSION_COLLECTION,
  STYLE_MAPPING_COLLECTION,
  sanitizeStyleMapping,
  registerAnalizarPdfDataRoutes
} = require("../src/analizar-pdf-data.js");
const firebaseConfig = require("../../firebase.json");

test("Peppermint Patty keeps the existing Firestore collections", () => {
  assert.equal(SESSION_COLLECTION, "analizarPDF");
  assert.equal(STYLE_MAPPING_COLLECTION, "analizarPDFStyleMappings");
});

test("style mappings preserve the frontend contract and normalize unsafe values", () => {
  const mapping = sanitizeStyleMapping({
    id: "mapping_test",
    title: "Plantilla",
    bookType: "LA",
    nivel: "Secundaria",
    grado: "1",
    unidad: "Unidad 1",
    isActive: true,
    entries: [{ styleKind: "invalid", pageScope: "odd", targetPage: "0, 3, 3, 4" }]
  });
  assert.equal(mapping.scopeKey, "la|secundaria|1|unidad 1");
  assert.equal(mapping.entries[0].styleKind, "paragraph");
  assert.equal(mapping.entries[0].pageScope, "odd");
  assert.equal(mapping.entries[0].targetPage, "3, 4");
});

test("all migrated data routes are registered behind the stable API contract", () => {
  const routes = [];
  const app = {
    get(path) { routes.push(`GET ${path}`); },
    post(path) { routes.push(`POST ${path}`); }
  };
  registerAnalizarPdfDataRoutes(app);
  assert.deepEqual(routes.sort(), [
    "GET /api/analizar-pdf/analysis-rules/catalog",
    "GET /api/analizar-pdf/custom-rules/list",
    "GET /api/analizar-pdf/sessions/detail",
    "GET /api/analizar-pdf/sessions/list",
    "GET /api/analizar-pdf/style-mappings/list",
    "POST /api/analizar-pdf/custom-rules/delete",
    "POST /api/analizar-pdf/custom-rules/save",
    "POST /api/analizar-pdf/sessions/delete",
    "POST /api/analizar-pdf/sessions/save",
    "POST /api/analizar-pdf/style-mappings/activate",
    "POST /api/analizar-pdf/style-mappings/delete",
    "POST /api/analizar-pdf/style-mappings/save"
  ].sort());
});

test("Hosting sends analizar-pdf to its Function before the generic API fallback", () => {
  const rewrites = firebaseConfig.hosting.rewrites;
  const analizarIndex = rewrites.findIndex((item) => item.source === "/api/analizar-pdf/**");
  const fallbackIndex = rewrites.findIndex((item) => item.source === "/api/**");
  assert.ok(analizarIndex >= 0);
  assert.equal(rewrites[analizarIndex].function.functionId, "analizarPdfApi");
  assert.ok(fallbackIndex > analizarIndex);
});
