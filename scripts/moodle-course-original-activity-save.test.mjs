import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const source = await readFile(new URL("../public/moodleCourse.js", import.meta.url), "utf8");

  assert.match(
    source,
    /await sincronizarSnapshotActividadOriginal\(\{/,
    "Al guardar instrucciones debe existir un refresco local explícito del bloque de actividad original."
  );

  assert.match(
    source,
    /const moduloRefrescado = await obtenerModulo\(moduloId, cursoIdModulo, \{ forceRefresh: true \}\);[\s\S]*await sincronizarSnapshotActividadOriginal\(\{/,
    "El flujo de guardar instrucciones debe rehidratar la card del módulo tras persistir cambios."
  );

  console.log("moodle-course-original-activity-save.test.mjs: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
