import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/moodleCourse.js",
  "utf8"
);

assert.match(
  source,
  /const shouldCloseFloatingModuleActionsMenu =[\s\S]*event\.preventDefault\(\);\s*handler\(\);\s*if \(shouldCloseFloatingModuleActionsMenu\) \{\s*cerrarMenuAccionesModuloFlotante\(\);\s*\}/,
  "Al ejecutar una opción dentro de #cbModuleActionsFloatingMenu, el menú flotante debe cerrarse después de disparar la acción."
);

console.log("moodle-course-floating-menu-close.test.mjs: ok");
