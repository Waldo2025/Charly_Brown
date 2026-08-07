import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const context = {};
vm.createContext(context);
vm.runInContext(`${extractFunction("buildMontageBrandOverlayFilter")};`, context);

const resolverContext = {
  path,
  REPO_ROOT: "/app",
  PUBLIC_ROOT: "/app/public",
  fs: {
    existsSync(candidate) {
      return candidate === "/app/public/podcaster/logo.png";
    }
  },
  process: { cwd: () => "/app" }
};
vm.createContext(resolverContext);
vm.runInContext(`${extractFunction("resolveBrandOverlayAssetPath")};`, resolverContext);

test("resolveBrandOverlayAssetPath accepts public-root and repository-root logo paths", () => {
  assert.equal(
    resolverContext.resolveBrandOverlayAssetPath("podcaster/logo.png"),
    "/app/public/podcaster/logo.png"
  );
  assert.equal(
    resolverContext.resolveBrandOverlayAssetPath("public/podcaster/logo.png"),
    "/app/public/podcaster/logo.png"
  );
});

test("resolveBrandOverlayAssetPath does not invent a path for a missing logo", () => {
  assert.equal(resolverContext.resolveBrandOverlayAssetPath("public/podcaster/missing.png"), "");
});

test("buildMontageBrandOverlayFilter uses an explicit ffmpeg input label for the logo", () => {
  const graph = context.buildMontageBrandOverlayFilter({
    enabled: true,
    position: "top-right",
    widthPct: 0.05,
    marginPct: 0.025,
    opacity: 1
  }, {
    width: 1280,
    reelModeEnabled: false,
    baseInputLabel: "[basev]",
    brandInputLabel: "[1:v]",
    outputLabel: "vout"
  });

  assert.match(graph, /\[1:v\]format=rgba/);
  assert.match(graph, /\[basev\]\[brand\]overlay=/);
  assert.doesNotMatch(graph, /movie=filename=/);
});
