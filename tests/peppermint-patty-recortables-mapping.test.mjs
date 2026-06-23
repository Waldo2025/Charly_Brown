import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");

test("recortables revisions receive a suggested mapping with recortable aliases", () => {
  assert.match(
    source,
    /if\s*\(\s*\/\^recortables\?\$\/i\.test\(unidad\)\s*\)\s*\{[\s\S]*?return buildMappingTemplateEntries\(bookType === "LA" \? LA_PROYECTO_MAPPING_TEMPLATE : PROYECTO_IDML_MAPPING_TEMPLATE\);[\s\S]*?\}/m
  );
});
