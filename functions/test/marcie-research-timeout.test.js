const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { RESEARCH_DEADLINE_MS } = require("../src/marcie-editorial-research.js");

test("research has time to complete and returns a CORS-safe error before the platform timeout", () => {
  const index = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8");
  const match = index.match(/exports\.geminiApi = onRequest\(\{[\s\S]*?timeoutSeconds:\s*(\d+)/);
  assert.ok(match, "geminiApi timeout must be declared");
  const platformTimeoutMs = Number(match[1]) * 1000;
  assert.equal(platformTimeoutMs, 540_000);
  assert.equal(RESEARCH_DEADLINE_MS, 510_000);
  assert.ok(RESEARCH_DEADLINE_MS < platformTimeoutMs);
});

test("the editor explains a research timeout instead of reporting it as CORS", () => {
  const service = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
  assert.match(service, /marcie_research_timeout:[^\n]+investigación bibliográfica tardó demasiado/i);
});
