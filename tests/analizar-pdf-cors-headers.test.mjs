import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

test("analizar pdf CORS allows custom upload headers for per-file analysis", () => {
  assert.match(source, /allowedHeaders:\s*\[[\s\S]*"X-Session-Id"/m);
  assert.match(source, /allowedHeaders:\s*\[[\s\S]*"X-Revision-Id"/m);
  assert.match(source, /allowedHeaders:\s*\[[\s\S]*"X-File-Id"/m);
  assert.match(source, /allowedHeaders:\s*\[[\s\S]*"X-Mapping-Id"/m);
  assert.match(source, /allowedHeaders:\s*\[[\s\S]*"X-File-Name"/m);
});
