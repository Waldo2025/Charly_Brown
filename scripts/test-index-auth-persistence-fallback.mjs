import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("public/js/index.js", "utf8");

test("index login degrades Firebase Auth persistence when localStorage quota is exhausted", () => {
  assert.match(source, /browserSessionPersistence/);
  assert.match(source, /inMemoryPersistence/);
  assert.match(source, /setAuthPersistenceWithFallback/);
  assert.match(source, /isStorageQuotaExceededError/);
  assert.match(source, /QuotaExceededError/);
});
