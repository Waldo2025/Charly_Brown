import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");

test("home montage export polling uses the dedicated export backend wrapper", () => {
  assert.match(
    source,
    /buildExportApiUrl\(`\/api\/podcaster\/montage\/export-status\?jobId=\$\{encodeURIComponent\([^`]+\)\}`\)/s
  );
  assert.match(
    source,
    /authFetchJson\(exportStatusUrl,\s*\{\s*auth:\s*false\s*\}\)/s
  );
});
