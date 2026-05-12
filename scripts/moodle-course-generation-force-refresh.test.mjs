import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const source = await readFile(new URL("../public/moodlecourse-geminiOperations.js", import.meta.url), "utf8");

  assert.match(
    source,
    /let modulo = await obtenerModulo\(moduloIdNormalizado, cursoIdModulo,\s*\{ forceRefresh: true \}\);/,
    "Generar con IA debe arrancar leyendo el módulo fresco desde Firestore, no desde cache local."
  );

  console.log("moodle-course-generation-force-refresh.test.mjs: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
