import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const podcasterSource = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = podcasterSource.indexOf(signature);
  if (start === -1) {
    throw new Error(`No se encontró ${name}`);
  }
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = start; index < podcasterSource.length; index += 1) {
    const char = podcasterSource[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  if (braceStart === -1) throw new Error(`No se encontró el cuerpo de ${name}`);
  let depth = 0;
  for (let index = braceStart; index < podcasterSource.length; index += 1) {
    const char = podcasterSource[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return podcasterSource.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const context = {
  console,
  normalizeMediaReferenceFromRecord(record = {}, mediaKeys = [], storageKeys = []) {
    const downloadUrl = mediaKeys.map((key) => String(record?.[key] || "").trim()).find(Boolean) || "";
    const storagePath = storageKeys.map((key) => String(record?.[key] || "").trim()).find(Boolean) || "";
    return { downloadUrl, storagePath };
  },
  normalizeVideoImagePrompts(value = []) {
    return Array.isArray(value) ? value : [];
  },
  nowIso() {
    return "2026-06-18T15:00:00.000Z";
  }
};

vm.createContext(context);
vm.runInContext(`${extractFunction("normalizeDialogueVideoMap")};`, context);

test("normalizeDialogueVideoMap defaults missing video type to video", () => {
  const normalized = context.normalizeDialogueVideoMap({
    "row-1": {
      downloadUrl: "https://example.test/video.mp4",
      mimeType: "video/mp4"
    }
  });

  assert.equal(normalized["row-1"].type, "video");
});

test("normalizeDialogueVideoMap defaults missing image type to image", () => {
  const normalized = context.normalizeDialogueVideoMap({
    "row-1": {
      downloadUrl: "https://example.test/image.jpg",
      mimeType: "image/jpeg"
    }
  });

  assert.equal(normalized["row-1"].type, "image");
});

test("normalizeDialogueVideoMap drops clips without any media source", () => {
  const normalized = context.normalizeDialogueVideoMap({
    "row-1": {
      mimeType: "video/mp4"
    }
  });

  assert.equal(Object.keys(normalized).length, 0);
});
