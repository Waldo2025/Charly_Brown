import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const serverSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const helperSource = readFileSync(new URL("../backend/analizar-pdf.js", import.meta.url), "utf8");
const pythonSource = readFileSync(new URL("../backend/python/analyze_pdf.py", import.meta.url), "utf8");
const pipelineSource = readFileSync(new URL("../backend/python/analizar_pdf/pipeline.py", import.meta.url), "utf8");
const idmlPipelineSource = readFileSync(new URL("../backend/python/analizar_idml/pipeline.py", import.meta.url), "utf8");

[
  "/api/analizar-pdf/sessions/list",
  "/api/analizar-pdf/sessions/save",
  "/api/analizar-pdf/sessions/delete",
  "/api/analizar-pdf/analyze",
  "/api/analizar-pdf/analyze-status",
  "/api/analizar-pdf/idml-template-from-file",
  "/api/analizar-pdf/quick-orthotypography"
].forEach((route) => {
  assert.match(serverSource, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

[
  "sanitizeAnalizarPdfSession",
  "createAnalizarPdfJobStore",
  "classifyAnalizarPdfStartupError",
  "mergeAnalizarPdfSessionPreservingFreshFileResults",
  "resolveAnalyzerScript",
  "spawnAnalizarPdfPythonJob"
].forEach((name) => {
  assert.match(
    helperSource,
    new RegExp(`function ${name}\\(|module\\.exports = \\{[\\s\\S]*\\b${name}\\b`, "m"),
    `backend/analizar-pdf.js debe exportar ${name}.`
  );
});

assert.match(helperSource, /sourceType/);
assert.match(helperSource, /analyze_idml\.py/);
assert.match(helperSource, /analyze_pdf\.py/);
assert.match(pipelineSource, /orthotypographyIssues/);
assert.match(idmlPipelineSource, /redactionIssues/);
assert.match(idmlPipelineSource, /find_redaction_issues/);
assert.match(idmlPipelineSource, /redaction_verifier = GeminiVerifier\(\)/, "Redacción debe usar un verificador Gemini propio.");
assert.match(idmlPipelineSource, /redaction_verifier\.max_requests = max/, "Redacción debe tener presupuesto propio suficiente.");
assert.match(pipelineSource, /colorIssues/);
assert.match(pipelineSource, /sourceType["']?\s*:\s*["']pdf["']/);

assert.match(
  helperSource,
  /PYTHON_DEPENDENCY_MISSING|PDF_ANALYZER_START_FAILED|ANALIZAR_PDF_START_FAILED/m,
  "El backend debe mapear errores explícitos del analizador Python."
);

assert.match(
  serverSource,
  /classifyAnalizarPdfStartupError\(/,
  "backend/server.js debe clasificar errores de arranque del analizador."
);

assert.match(
  serverSource,
  /session\.sourceType === "idml" \? "\.idml" : "\.pdf"/,
  "backend/server.js debe validar la extensión esperada según sourceType."
);

assert.match(
  serverSource,
  /resolveAnalyzerScript\(/,
  "backend/server.js debe resolver el script Python según sourceType."
);

assert.match(
  serverSource,
  /async function prepareAnalizarPdfIdmlToolSource\(/,
  "backend/server.js debe compartir la preparación de fuente IDML para herramientas."
);
assert.match(
  serverSource,
  /req\.headers\["x-use-stored-source"\]/,
  "Las herramientas IDML deben aceptar stored-source por header."
);
assert.match(
  serverSource,
  /fs\.copyFileSync\(tempFilePath,\s*stableSourcePath\)/,
  "Las herramientas IDML deben aceptar upload binario y guardar sourceAssetPath estable."
);
assert.match(
  serverSource,
  /sourceAssetPath:\s*stableSourcePath/,
  "Las herramientas IDML deben persistir sourceAssetPath estable tras upload."
);

assert.match(
  pythonSource,
  /import fitz|from fitz import/m,
  "El analizador Python debe usar PyMuPDF."
);

assert.match(
  pythonSource,
  /import enchant|pyenchant|DictWithPWL|enchant\.Dict/m,
  "El analizador Python debe usar diccionarios locales para ortografía."
);

const tmpDir = mkdtempSync(path.join(tmpdir(), "analizar-pdf-contract-"));
const samplePdf = path.join(tmpDir, "sample.pdf");
writeFileSync(
  samplePdf,
  Buffer.from(
    "%PDF-1.1\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
    "utf8"
  )
);

const run = spawnSync(
  "python3",
  [
    "backend/python/analyze_pdf.py",
    "--input",
    samplePdf,
    "--session-json",
    JSON.stringify({ id: "contract", sourceType: "pdf", indexConfig: { sections: [] } }),
  ],
  { encoding: "utf8", cwd: new URL("..", import.meta.url) }
);

rmSync(tmpDir, { recursive: true, force: true });

assert.equal(run.status, 0, run.stderr);
const result = JSON.parse(run.stdout);
assert.equal(result.stats.sourceType, "pdf");
assert.ok(Array.isArray(result.paginationIssues));
assert.ok(Array.isArray(result.sectionIssues));
assert.ok(Array.isArray(result.spellingIssues));
assert.ok(Array.isArray(result.orthotypographyIssues));
assert.ok(Array.isArray(result.colorIssues));

const { sanitizeResult } = await import("../backend/analizar-pdf.js");
const sanitizedIdmlResult = sanitizeResult({
  redactionIssues: [{
    pageName: "1",
    styleName: "Texto",
    excerpt: "Texto confuso de prueba",
    suggestion: "Texto claro de prueba",
    reason: "Falta claridad.",
    confidence: 0.91,
  }],
  stats: {
    pageCount: 1,
    swatchInventory: [{ name: "U1", hex: "#336699" }],
    pageReports: [{ pageName: "1", redactionIssues: [{ excerpt: "Texto confuso de prueba", suggestion: "Texto claro de prueba", confidence: 0.91 }] }],
  },
});
assert.equal(sanitizedIdmlResult.stats.swatchInventory[0].name, "U1");
assert.equal(sanitizedIdmlResult.stats.swatchInventory[0].swatchName, "U1");
assert.equal(sanitizedIdmlResult.redactionIssues[0].styleName, "Texto");
assert.equal(sanitizedIdmlResult.redactionIssues[0].confidence, 0.91);
assert.equal(sanitizedIdmlResult.stats.pageReports[0].redactionIssues[0].suggestion, "Texto claro de prueba");

console.log("Analizar PDF backend contract OK.");
