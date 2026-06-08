import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const sample = "public/analizarPDF/EEFESPPRI_10REV_TRIM1_P1_LA_U1.idml";
const session = JSON.stringify({
  id: "sample-recortable-visual",
  sourceType: "idml",
  bibliographicInfo: {
    unidad: "Proyecto",
    grado: "Primero",
  },
});

const run = spawnSync(
  "python3",
  ["backend/python/analyze_idml.py", "--input", sample, "--session-json", session],
  { encoding: "utf8" },
);

assert.equal(run.status, 0, run.stderr);

const result = JSON.parse(run.stdout);
const pageReports = result?.stats?.pageReports || [];
const visualRecortablePages = pageReports.filter((page) => {
  const summary = page?.recortableSummary || {};
  return Boolean(summary.visualIndicator) && Array.isArray(summary.originCodes) && summary.originCodes.length;
});

assert.ok(visualRecortablePages.length > 0, "La muestra de Primaria 1 debe detectar al menos un recortable visual.");
assert.ok(
  visualRecortablePages.some((page) => (page.recortableSummary.originCodes || []).some((code) => /T\d+/i.test(code))),
  "La detección visual debe recuperar códigos tipo 1dT1 desde el texto instruccional.",
);

const videoTitleProbe = spawnSync(
  "python3",
  [
    "-c",
    "import json; from backend.python.analizar_idml.pipeline import _extract_video_titles, _extract_linked_asset_mentions; print(json.dumps({'titles': _extract_video_titles('Observa el video “Sustantivos propios y comunes”.'), 'mentions': _extract_linked_asset_mentions('Observa el video “Sustantivos propios y comunes”. Localiza en la lectura los nombres propios.')}))",
  ],
  { encoding: "utf8" },
);

assert.equal(videoTitleProbe.status, 0, videoTitleProbe.stderr);
const videoProbePayload = JSON.parse(videoTitleProbe.stdout);
assert.deepEqual(
  videoProbePayload.titles,
  ["Sustantivos propios y comunes"],
  "Los videos deben extraer el nombre visible, no un código.",
);
assert.deepEqual(
  videoProbePayload.mentions,
  [{ kind: "video", code: "Sustantivos propios y comunes", label: "Sustantivos propios y comunes" }],
  "La mención textual del video debe resolverse por título entre comillas, no como 'Video A'.",
);

const inheritanceProbe = spawnSync(
  "python3",
  [
    "-c",
    "import json; from backend.python.analizar_idml.pipeline import _build_mapping_alias_index, _expand_alias_index_with_style_inheritance; from backend.python.analizar_idml.package import open_idml; from backend.python.analizar_idml.styles import parse_styles; session={'analysisMapping':{'entries':[{'alias':'subinstruccion','styleKind':'paragraph','styleName':'SUBINSTRUCCION','enabled':True}]}}; alias=_build_mapping_alias_index(session); archive=open_idml('public/analizarPDF/EEFESPPRI_10REV_TRIM1_P1_LA_U1.idml'); styles=parse_styles(archive, 'Resources/Styles.xml'); expanded=_expand_alias_index_with_style_inheritance(alias, styles); archive.close(); print(json.dumps(expanded['subinstruccion']['paragraph']))",
  ],
  { encoding: "utf8" },
);

assert.equal(inheritanceProbe.status, 0, inheritanceProbe.stderr);
assert.ok(
  JSON.parse(inheritanceProbe.stdout).includes("PRESEF COL 2 SUBINSTRUCCION PLECAS"),
  "El alias SUBINSTRUCCION debe expandirse a estilos derivados basados en ese estilo.",
);

console.log("Analizar IDML visual recortable regression OK.");
