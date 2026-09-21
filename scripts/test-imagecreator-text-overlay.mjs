import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const source = readFileSync(resolve(rootDir, "public/imagecreator/text-overlay.js"), "utf8");

test("la composición exacta conserva dimensiones y escribe sólo dentro de la caja marcada", () => {
  assert.match(source, /canvas\.width = Number\(image\.naturalWidth/);
  assert.match(source, /canvas\.height = Number\(image\.naturalHeight/);
  assert.match(source, /Math\.min\(canvas\.width - x/);
  assert.match(source, /context\.fillText\(line, x \+ \(width \/ 2\)/);
  assert.match(source, /exactTextOverlay: true/);
});
