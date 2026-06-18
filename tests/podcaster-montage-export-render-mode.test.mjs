import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");

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

const context = {
  normalizeMontageRenderMode: (value = "") => {
    const clean = String(value || "").trim().toLowerCase();
    return clean === "ffmpeg-legacy" ? "ffmpeg-legacy" : "browser";
  }
};

vm.createContext(context);
vm.runInContext("const MONTAGE_EXPORT_SETTINGS_SCHEMA_VERSION = 3;", context);
vm.runInContext(`${extractFunction("normalizeMontageExportSettings")};`, context);

test("normalizeMontageExportSettings defaults renderMode to browser", () => {
  const result = context.normalizeMontageExportSettings({});
  assert.equal(result.renderMode, "browser");
});

test("normalizeMontageExportSettings preserves ffmpeg legacy fallback mode", () => {
  const result = context.normalizeMontageExportSettings({ renderMode: "ffmpeg-legacy" });
  assert.equal(result.renderMode, "ffmpeg-legacy");
});
