import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve("public");
const checkedExtensions = new Set([".html", ".js"]);
const skippedDirs = new Set(["vendor"]);

async function collectPublicAssets(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) {
        files.push(...await collectPublicAssets(fullPath));
      }
      continue;
    }

    if (checkedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

test("public runtime assets do not redirect to removed login.html", async () => {
  const files = await collectPublicAssets(rootDir);
  const offenders = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (source.includes("login.html")) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(offenders, [], "login.html was removed; auth redirects should target index.html");
});
