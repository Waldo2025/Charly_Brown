import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

test("backend defines safePipeline and uses it for response streaming", () => {
  // Verify safePipeline definition exists
  assert.match(
    backendSource,
    /async function safePipeline\s*\(/,
    "backend/server.js should define safePipeline function"
  );

  // Verify safePipeline checks headersSent and ends destination writable
  assert.match(
    backendSource,
    /destination\.headersSent/,
    "safePipeline should check destination.headersSent"
  );
  assert.match(
    backendSource,
    /destination\.end\(\)/,
    "safePipeline should end destination if not ended"
  );

  // Verify standard pipeline is not called directly with res.status
  const directPipelineWithResMatches = backendSource.match(/await pipeline\([^,]+,\s*res/);
  assert.equal(
    directPipelineWithResMatches,
    null,
    "Should not call standard pipeline directly with 'res'. Use safePipeline instead."
  );

  // Verify safePipeline is called with res.status
  const safePipelineWithResMatches = backendSource.match(/await safePipeline\([^,]+,\s*res/);
  assert.ok(
    safePipelineWithResMatches && safePipelineWithResMatches.length > 0,
    "Should call safePipeline with 'res' for response streaming"
  );
});
