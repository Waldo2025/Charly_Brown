import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

test("backend session sanitizer preserves panel music fadeInMs and fadeOutMs", () => {
  assert.match(
    backendSource,
    /return \[loopIndex, \{ loopIndex, trimInMs, trimOutMs, fadeInMs, fadeOutMs \}\];/m
  );
});
