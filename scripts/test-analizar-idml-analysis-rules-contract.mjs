import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const catalogSource = read("functions/src/analizar-pdf-data.js");
const pipelineSource = read("backend/python/analizar_idml/pipeline.py");
const resultsSource = read("public/analizarPDF/analizar-pdf-results.js");

const expectedCatalogIds = [
  "idml.structure", "pagination.sequence", "sections.expected", "styles.mapping",
  "layers.assignment", "swatches.inventory", "frames.overflow", "typography.widows",
  "spelling.dictionary", "orthotypography.rules", "redaction.coherence", "notes.extract",
  "changes.extract", "language.resolve", "assets.references", "custom.rules"
];

for (const id of expectedCatalogIds) assert.match(catalogSource, new RegExp(`\\[\\"${id.replace(".", "\\.")}\\"`), `Falta ${id} en el catálogo`);
for (const token of ["find_pagination_issues", "find_section_issues", "find_spelling_issues", "find_orthotypography_issues", "find_redaction_issues", "_attach_page_notes", "_attach_tracked_changes", "_build_recortable_checks", "evaluate_custom_rules"]) assert.ok(pipelineSource.includes(token), `El catálogo anuncia una capacidad sin implementación: ${token}`);
for (const token of ["custom-rules", "customRuleIssues", "Condiciones personalizadas"]) assert.ok(resultsSource.includes(token), `El resultado personalizado no está conectado al rail: ${token}`);
assert.match(catalogSource, /ANALYSIS_RULE_CATALOG_VERSION/);
assert.match(catalogSource, /RULE_COMPARATORS/);
console.log("analysis-rules contract: ok");
