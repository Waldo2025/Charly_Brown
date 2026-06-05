import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readWorkspaceFile(relativePath) {
  return readFileSync(resolve(new URL("..", import.meta.url).pathname, relativePath), "utf8");
}

test("session store aplica presupuesto explícito para evitar exceder 1 MiB en Firestore", () => {
  const source = readWorkspaceFile("public/imagecreator/sessions-store.js");
  assert.match(source, /MAX_FIRESTORE_SESSION_BYTES/, "Debe existir un presupuesto explícito de tamaño para sesiones.");
  assert.match(source, /while\s*\(\s*estimateSerializedBytes\(/, "La compactación debe recortar hasta entrar en presupuesto.");
});
