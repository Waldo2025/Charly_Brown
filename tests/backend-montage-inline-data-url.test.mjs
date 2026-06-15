import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const source = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`No se encontró ${name}`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

function extractMaybeAsyncFunction(name) {
  const isAsync = new RegExp(`async\\s+function\\s+${name}\\b`).test(source);
  return `${isAsync ? "async " : ""}${extractFunction(name)}`;
}

const context = {
  console,
  Buffer,
  path,
  fs: {
    promises: {
      writeFile: async (filePath, buffer) => fsPromises.writeFile(filePath, buffer),
      stat: async (filePath) => fsPromises.stat(filePath).catch(() => null)
    }
  },
  clampText(value = "", max = 0) {
    return String(value || "").trim().slice(0, Math.max(0, Number(max) || 0));
  },
  getAudioExtension() {
    return "mp3";
  },
  getImageExtension() {
    return "png";
  },
  getVideoExtension() {
    return "mp4";
  },
  normalizeStorageFilePath(value = "") {
    return String(value || "").trim();
  },
  normalizeStorageSegment(value = "") {
    return String(value || "").trim();
  },
  parseFirebaseStorageGoogleApisObjectUrl() {
    return false;
  },
  redactUrlForLogs(value = "") {
    return String(value || "");
  },
  withTimeout(task) {
    return task();
  },
  downloadUrlToFile: async () => {
    context.__downloadUrlCalls = (context.__downloadUrlCalls || 0) + 1;
    throw new Error("network_download_should_not_run");
  },
  downloadStoragePathToFile: async () => {
    context.__downloadStorageCalls = (context.__downloadStorageCalls || 0) + 1;
    throw new Error("storage_download_should_not_run");
  }
};

vm.createContext(context);
[
  "const MONTAGE_EXPORT_INLINE_DATA_URL_MAX_BYTES = 2500000;",
  "const MONTAGE_EXPORT_SCENE_DOWNLOAD_TIMEOUT_MS = 120000;",
  extractFunction("decodeInlineDataUrl"),
  extractMaybeAsyncFunction("writeDataUrlToFile"),
  extractFunction("createMontageAssetDownloader")
].forEach((snippet) => {
  vm.runInContext(`${snippet};`, context);
});

test("montage downloader writes inline data before network sources", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "cb-montage-inline-"));
  try {
    const downloadInput = context.createMontageAssetDownloader({ tmpDir, uid: "user-1" });
    const outPath = await downloadInput(
      {
        dataUrl: "data:video/mp4;base64,SGVsbG8=",
        mimeType: "video/mp4"
      },
      "video",
      0
    );

    assert.equal(readFileSync(outPath, "utf8"), "Hello");
    assert.equal(context.__downloadUrlCalls || 0, 0);
    assert.equal(context.__downloadStorageCalls || 0, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("inline data url helper rejects oversized payloads", () => {
  const oversized = `data:text/plain,${"a".repeat(2_500_001)}`;
  assert.throws(() => context.decodeInlineDataUrl(oversized), /inline_data_too_large/);
});
