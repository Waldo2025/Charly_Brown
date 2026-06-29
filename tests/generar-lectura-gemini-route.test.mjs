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
const moodleCourseSource = readFileSync(
  new URL("../public/js/moodleCourse.js", import.meta.url),
  "utf8"
);
const moodleCourseGeminiSource = readFileSync(
  new URL("../public/js/moodlecourse-geminiOperations.js", import.meta.url),
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

test("moodleCourse evita el redirect 302 de Firebase Hosting para Gemini", () => {
  assert.match(moodleCourseGeminiSource, /"\.\/moodleCourse\.js\?v=2026-1\.0\.10\.65"/);
  assert.doesNotMatch(moodleCourseGeminiSource, /moodleCourse\.js\?v=2026-1\.0\.10\.64/);
  assert.match(
    moodleCourseGeminiSource,
    /const endpointPath = "\/api\/gemini\/generate";\s*const primaryUrl = buildApiUrlPreferRemote\(endpointPath\)/
  );
  assert.match(moodleCourseSource, /authFetchJson\("\/api\/gemini\/models", \{ method: "GET", preferRemote: true \}\)/);
  assert.match(
    moodleCourseSource,
    /authFetchJson\("\/api\/gemini\/generate", \{[\s\S]*preferRemote: true,[\s\S]*body:/
  );
});

test("moodleCourse hidrata filenames de imagen generados como placeholders locales", () => {
  assert.match(
    moodleCourseSource,
    /container\.querySelectorAll\("img\[src\]"\)\.forEach\(\(img\) => \{[\s\S]*construirPlaceholderImagenGemini\(imageId\)/
  );
  assert.match(
    moodleCourseSource,
    /\\\.\(\?:avif\|gif\|jpe\?g\|png\|svg\|webp\)/
  );
});
