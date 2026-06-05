import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./check-languagetool-local.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

assert.match(
  source,
  /\/v2\/languages/,
  "El chequeo debe validar el endpoint oficial GET /v2/languages."
);

assert.match(
  source,
  /\/v2\/check/,
  "El chequeo debe validar el endpoint oficial POST /v2/check."
);

assert.match(
  source,
  /language:\s*"es"/,
  "El chequeo debe probar español, que es el idioma objetivo del analizador."
);

assert.equal(
  packageJson.scripts["languagetool:check"],
  "node scripts/check-languagetool-local.mjs",
  "package.json debe exponer el comando languagetool:check."
);

console.log("LanguageTool local check contract OK.");
