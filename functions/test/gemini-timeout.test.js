const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Gemini proxy leaves enough time for large editorial generations", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /GEMINI_PROVIDER_TIMEOUT_MS = 105_000/);
  assert.match(source, /timeoutSeconds: 120/);
  assert.match(source, /gemini_upstream_timeout[\s\S]*?Retry-After", "2"/);
});
