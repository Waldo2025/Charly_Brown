import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/analizar-pdf.js", import.meta.url), "utf8");
const idmlSource = readFileSync(new URL("../backend/python/analyze_idml.py", import.meta.url), "utf8");
const pdfSource = readFileSync(new URL("../backend/python/analyze_pdf.py", import.meta.url), "utf8");

test("python analyzer payload is passed through a temp file instead of a huge cli json argument", () => {
  assert.match(backendSource, /const sessionPayload = JSON\.stringify\(options\.session \|\| \{\}\);/);
  assert.match(backendSource, /const sessionJsonPath = path\.join\(sessionDir, "session\.json"\);/);
  assert.match(backendSource, /"--session-json-file",\s*sessionJsonPath/);
  assert.doesNotMatch(backendSource, /"--session-json",\s*JSON\.stringify\(options\.session \|\| \{\}\)/);
});

test("python analyzers accept session-json-file input", () => {
  assert.match(idmlSource, /parser\.add_argument\("--session-json-file", default=""\)/);
  assert.match(idmlSource, /if args\.session_json_file:\n\s+session_payload = Path\(args\.session_json_file\)\.read_text\(encoding="utf-8"\)/);
  assert.match(pdfSource, /parser\.add_argument\("--session-json-file", default=""\)/);
  assert.match(pdfSource, /if args\.session_json_file:\n\s+session_payload = Path\(args\.session_json_file\)\.read_text\(encoding="utf-8"\)/);
});
