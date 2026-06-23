import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/analizarPDF/analizar-pdf-app.js", import.meta.url), "utf8");

test("duplicate mapping clones the current editor draft instead of reloading only the active saved mapping", () => {
  const start = source.indexOf('els.duplicateMappingBtn?.addEventListener("click", () => {');
  const end = source.indexOf('els.deleteMappingBtn?.addEventListener("click", async () => {');
  assert.ok(start >= 0 && end > start, "expected duplicate mapping handler block");
  const handler = source.slice(start, end);
  assert.match(
    handler,
    /const mapping = collectCurrentMappingDraftFromDom\(\);[\s\S]*?state\.activeMappingId = ""[\s\S]*?id: "",[\s\S]*?mappingSlug: "",[\s\S]*?title: `\$\{mapping\.title \|\| "Mapeo"\} \(copia\)`[\s\S]*?isActive: false[\s\S]*?renderMappingsModal\(\);/m
  );
  assert.doesNotMatch(
    handler,
    /const mapping = getActiveMapping\(\);/m
  );
});
