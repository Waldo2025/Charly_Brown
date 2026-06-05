import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const sample = "public/analizarPDF/EEFESPPRI_10REV_TRIM1_P5_LA_ABP_FORMACION copy.idml";
const session = JSON.stringify({
  id: "sample",
  sourceType: "idml",
  indexConfig: {
    sections: [{ id: "section_1", title: "SECCION INEXISTENTE", expectedPageNumber: 1 }],
  },
  colorConfig: {
    palette: [{ id: "color_1", swatchName: "A_COLOR UNIDAD", cmyk: "64,39,0,0", hex: "#5c9cff" }],
  },
});

const run = spawnSync(
  "python3",
  ["backend/python/analyze_idml.py", "--input", sample, "--session-json", session],
  { encoding: "utf8" },
);

assert.equal(run.status, 0, run.stderr);

const result = JSON.parse(run.stdout);
assert.equal(result.stats.sourceType, "idml");
assert.ok(result.stats.pageCount > 0);
assert.ok(Array.isArray(result.stats.usedSwatches));
assert.ok(Array.isArray(result.stats.pagePreview));
assert.ok(Array.isArray(result.stats.swatchInventory));
assert.ok(Array.isArray(result.stats.topParagraphStyles));
assert.ok(Array.isArray(result.stats.configurationWarnings));
assert.ok(Array.isArray(result.stats.pageReports));
assert.ok(result.stats.pageReports.length > 0);
assert.ok("content" in result.stats.pageReports[0]);
assert.ok("paginationIssues" in result);
assert.ok("sectionIssues" in result);
assert.ok("orthotypographyIssues" in result);
assert.ok("colorIssues" in result);
assert.ok(Array.isArray(result.paginationIssues));
assert.ok(Array.isArray(result.sectionIssues));
assert.ok(Array.isArray(result.orthotypographyIssues));
assert.ok(Array.isArray(result.colorIssues));
assert.ok(result.sectionIssues.length > 0, "expected configured section mismatch to be reported");
assert.ok(result.colorIssues.length > 0, "expected palette mismatch to be reported");

const paginationCheck = spawnSync(
  "python3",
  [
    "-c",
    [
      "import json, sys",
      "sys.path.insert(0, 'backend/python')",
      "from analizar_idml.pagination import find_pagination_issues",
      "pages = [{'pageId': 'p1', 'pageName': '6'}, {'pageId': 'p2', 'pageName': '8'}]",
      "sys.stdout.write(json.dumps(find_pagination_issues(pages), ensure_ascii=False))",
    ].join("; "),
  ],
  { encoding: "utf8" },
);

assert.equal(paginationCheck.status, 0, paginationCheck.stderr);
const paginationIssues = JSON.parse(paginationCheck.stdout);
assert.deepEqual(paginationIssues, ["Numeración incorrecta: se esperaba 7 y se encontró 8."]);
