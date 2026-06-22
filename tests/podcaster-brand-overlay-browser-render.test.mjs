import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/podcaster/podcaster-render.js", import.meta.url), "utf8");

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
vm.runInContext(`${extractFunction("placeBrandOverlay")};`, context);

test("placeBrandOverlay renders brand image from assetUrl even when assetPath is missing", () => {
  const img = { hidden: true, style: {} };
  context.placeBrandOverlay(img, {
    enabled: true,
    assetUrl: "data:image/png;base64,abc123",
    position: "top-right",
    widthPct: 0.05,
    marginPct: 0.025,
    opacity: 1
  }, 1280);

  assert.equal(img.hidden, false);
  assert.equal(img.src, "data:image/png;base64,abc123");
  assert.equal(img.style.zIndex, "40");
});
