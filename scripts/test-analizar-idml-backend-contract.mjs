import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../backend/python/analyze_idml.py", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("../backend/python/analizar_idml/pipeline.py", import.meta.url), "utf8");

assert.match(entry, /from analizar_idml\.pipeline import analyze_idml_document/);
assert.match(entry, /--input/);
assert.match(entry, /--session-json/);
assert.match(pipeline, /orthotypographyIssues/);
assert.match(pipeline, /colorIssues/);
assert.match(pipeline, /sourceType["']?\s*:\s*["']idml["']/);
assert.match(pipeline, /GeminiVerifier/);

console.log("Analizar IDML backend contract OK.");
