import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const helperProbe = spawnSync(
  "python3",
  [
    "-c",
    [
      "import json",
      "from backend.python.analizar_idml.pipeline import _extract_alias_values",
      "alias_index={'titulo_seccion': {'paragraph': ['TITULO'], 'character': [], 'swatch': []}}",
      "page={'pageName':'9','content':{'títulos':[{'text':'Bloque B','styleName':'TITULO','characterStyles':[],'frameRect':{'x1':120,'y1':40,'x2':200,'y2':80}},{'text':'Bloque A','styleName':'TITULO','characterStyles':[],'frameRect':{'x1':20,'y1':40,'x2':100,'y2':80}},{'text':'Bloque C','styleName':'TITULO','characterStyles':[],'frameRect':{'x1':20,'y1':120,'x2':100,'y2':160}}],'subtítulos':[],'instrucciones':[],'subinstrucciones':[],'párrafos normales':[],'otro':[]},'masterContent':{}}",
      "print(json.dumps(_extract_alias_values(page, alias_index), ensure_ascii=False))",
    ].join("; "),
  ],
  { encoding: "utf8" },
);

assert.equal(helperProbe.status, 0, helperProbe.stderr);
const helperPayload = JSON.parse(helperProbe.stdout);
assert.equal(
  helperPayload.titulo_seccion,
  "Bloque A\nBloque B\nBloque C",
  "Los aliases deben agregar múltiples cajas en orden geométrico y unirlas con salto de línea.",
);

const sample = "public/analizarPDF/EEFESPPRI_10REV_TRIM1_P2_LA_02_U1.idml";
const session = JSON.stringify({
  id: "sample-style-driven-extraction",
  sourceType: "idml",
  bibliographicInfo: {
    unidad: "Unidad normal",
    grado: "Segundo",
    nivel: "Primaria",
    bookType: "LA",
  },
  analysisMapping: {
    entries: [
      { alias: "titulo_seccion", styleKind: "paragraph", styleName: "TITULO", enabled: true },
      { alias: "pie_pagina", styleKind: "paragraph", styleName: "PRESEF COL2 PIE DE PAGINA VERSO", enabled: true },
      { alias: "folio_impar", styleKind: "paragraph", styleName: "PRESEF COL 2 FOLIO RECTO", enabled: true },
      { alias: "folio_par", styleKind: "paragraph", styleName: "PRESEF COL 2 FOLIO VERSO", enabled: true },
    ],
  },
});

const run = spawnSync(
  "python3",
  ["backend/python/analyze_idml.py", "--input", sample, "--session-json", session],
  { encoding: "utf8" },
);

assert.equal(run.status, 0, run.stderr);
const result = JSON.parse(run.stdout);
const page31 = (result?.stats?.pageReports || []).find((page) => String(page?.pageName) === "31");
const page32 = (result?.stats?.pageReports || []).find((page) => String(page?.pageName) === "32");

assert.ok(page31, "La muestra debe incluir la página 31.");
assert.ok(page32, "La muestra debe incluir la página 32.");

assert.deepEqual(
  page31.footerMarkers,
  {
    sectionName: "Convenciones lingüísticas: Gramática",
    sectionTitle: "¿En qué se parecen?",
    sectionCode: "Unidad 1",
    trimester: "Trimestre 1",
    grade: "Nivel 2",
    pageNumber: "31",
    skills: [],
    footerRecortable: false,
  },
  "La página 31 debe extraer los datos del pie recto usando los estilos configurados.",
);

assert.deepEqual(
  page32.footerMarkers,
  {
    sectionName: "Expresión escrita",
    sectionTitle: "Oraciones ordenadas",
    sectionCode: "Unidad 1",
    trimester: "Trimestre 1",
    grade: "Nivel 2",
    pageNumber: "32",
    skills: [],
    footerRecortable: false,
  },
  "La página 32 debe extraer los datos del pie verso usando los estilos configurados.",
);

const separatedFooterSession = JSON.stringify({
  id: "sample-style-driven-extraction-separated",
  sourceType: "idml",
  bibliographicInfo: {
    unidad: "Unidad normal",
    grado: "Segundo",
    nivel: "Primaria",
    bookType: "LA",
  },
  analysisMapping: {
    entries: [
      { alias: "titulo_seccion", styleKind: "paragraph", styleName: "TITULO", enabled: true },
      { alias: "pie_pagina_recto", styleKind: "paragraph", styleName: "PRESEF COL 2 PIE DE PAGINA RECTO", enabled: true },
      { alias: "pie_pagina_verso", styleKind: "paragraph", styleName: "PRESEF COL2 PIE DE PAGINA VERSO", enabled: true },
      { alias: "folio_impar", styleKind: "paragraph", styleName: "PRESEF COL 2 FOLIO RECTO", enabled: true },
      { alias: "folio_par", styleKind: "paragraph", styleName: "PRESEF COL 2 FOLIO VERSO", enabled: true },
    ],
  },
});

const separatedFooterRun = spawnSync(
  "python3",
  ["backend/python/analyze_idml.py", "--input", sample, "--session-json", separatedFooterSession],
  { encoding: "utf8" },
);

assert.equal(separatedFooterRun.status, 0, separatedFooterRun.stderr);
const separatedFooterResult = JSON.parse(separatedFooterRun.stdout);
const separatedFooterPage31 = (separatedFooterResult?.stats?.pageReports || []).find((page) => String(page?.pageName) === "31");
const separatedFooterPage32 = (separatedFooterResult?.stats?.pageReports || []).find((page) => String(page?.pageName) === "32");

assert.equal(
  String(separatedFooterPage31?.footerMarkers?.sectionName || ""),
  "Convenciones lingüísticas: Gramática",
  "La plantilla debe soportar aliases recto/verso separados para el pie de página.",
);
assert.equal(
  String(separatedFooterPage32?.footerMarkers?.sectionName || ""),
  "Expresión escrita",
  "La plantilla debe soportar aliases recto/verso separados para el pie de página.",
);

const missingTitleSession = JSON.stringify({
  id: "sample-style-driven-extraction-missing",
  sourceType: "idml",
  bibliographicInfo: {
    unidad: "Unidad normal",
    grado: "Segundo",
    nivel: "Primaria",
    bookType: "LA",
  },
  analysisMapping: {
    entries: [
      { alias: "pie_pagina", styleKind: "paragraph", styleName: "PRESEF COL2 PIE DE PAGINA VERSO", enabled: true },
      { alias: "folio_impar", styleKind: "paragraph", styleName: "PRESEF COL 2 FOLIO RECTO", enabled: true },
      { alias: "folio_par", styleKind: "paragraph", styleName: "PRESEF COL 2 FOLIO VERSO", enabled: true },
    ],
  },
});

const missingTitleRun = spawnSync(
  "python3",
  ["backend/python/analyze_idml.py", "--input", sample, "--session-json", missingTitleSession],
  { encoding: "utf8" },
);

assert.equal(missingTitleRun.status, 0, missingTitleRun.stderr);
const missingTitleResult = JSON.parse(missingTitleRun.stdout);
const missingTitlePage31 = (missingTitleResult?.stats?.pageReports || []).find((page) => String(page?.pageName) === "31");
assert.equal(
  String(missingTitlePage31?.footerMarkers?.sectionTitle || ""),
  "",
  "Si el estilo configurado para título no existe en el mapeo, el campo debe quedar vacío.",
);

console.log("Analizar IDML style-driven extraction regression OK.");
