import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");

test("home montage export polling stays on the same-origin /api endpoint", () => {
  assert.match(
    source,
    /authFetchJson\(`\/api\/podcaster\/montage\/export-status\?jobId=\$\{encodeURIComponent\([^`]+\)\}`,\s*\{\s*auth:\s*false\s*\}\)/s
  );
  assert.doesNotMatch(source, /buildApiUrlPreferRemote\(`\/api\/podcaster\/montage\/export-status/);
});
