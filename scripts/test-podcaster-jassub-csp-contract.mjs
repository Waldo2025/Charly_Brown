import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const firebaseConfig = readFileSync(new URL("../firebase.json", import.meta.url), "utf8");

assert.match(
  firebaseConfig,
  /Content-Security-Policy[\s\S]*script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'/,
  "Firebase Hosting debe permitir wasm-unsafe-eval para que el worker WASM de JASSUB pueda instanciar libass."
);

assert.match(
  firebaseConfig,
  /worker-src 'self' blob:/,
  "Firebase Hosting debe permitir worker-src self/blob para el renderer de JASSUB."
);

console.log("Podcaster JASSUB CSP contract OK.");
