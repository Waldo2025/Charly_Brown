import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const generarUnidadSource = readFileSync(
  new URL("../public/js/generarUnidad.js", import.meta.url),
  "utf8"
);
const generarLecturaSource = readFileSync(
  new URL("../public/js/generarLectura.js", import.meta.url),
  "utf8"
);
const generarLecturaIngestaSource = readFileSync(
  new URL("../public/js/generarLectura-iaIngesta.js", import.meta.url),
  "utf8"
);

test("generarUnidad usa la URL remota preferida para Gemini y evita el redirect 302 de /api", () => {
  assert.match(generarUnidadSource, /buildApiUrlPreferRemote/);
  assert.doesNotMatch(
    generarUnidadSource,
    /buildApiUrl\("\/api\/gemini\/generate"\)/
  );
});

test("generarLectura usa la URL remota preferida para Gemini y evita el redirect 302 de /api", () => {
  assert.match(generarLecturaSource, /buildApiUrlPreferRemote\("\/api\/gemini\/generate"\)/);
});

test("la ingesta IA de generarLectura usa la URL remota preferida para Gemini", () => {
  assert.match(
    generarLecturaIngestaSource,
    /buildApiUrlPreferRemote\("\/api\/gemini\/generate"\)/
  );
});
