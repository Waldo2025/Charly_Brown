import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  source,
  /const STUDIO_ONSCREEN_TEXT_LAYOUT_DEFAULTS_VERSION = 3;/,
  "El reset global de layouts debe subir la versión de defaults para ejecutarse automáticamente."
);

assert.match(
  source,
  /const currentLayoutDefaultsVersion = Math\.max\(1, Math\.round\(toFiniteNumber\(cfg\?\.timelineOnScreenTextLayoutDefaultsVersion, 1\)\)\);/,
  "El layout debe versionarse por separado de los defaults de duración."
);

assert.match(
  source,
  /const shouldResetLayouts = currentLayoutDefaultsVersion < STUDIO_ONSCREEN_TEXT_LAYOUT_DEFAULTS_VERSION;/,
  "La sesión debe detectar cuándo regenerar por completo los layouts heredados."
);

assert.match(
  source,
  /rows\.forEach\(\(row, index\) => \{[\s\S]*const defaultLayout = buildDefaultOnScreenTextLayoutForRow\(\{ \.\.\.row, index: index \+ 1 \}, settings\);[\s\S]*next\[rowId\] = defaultLayout;[\s\S]*changed = true;/m,
  "El reset debe reconstruir todos los layouts desde el estándar nuevo."
);

assert.match(
  source,
  /timelineOnScreenTextLayoutDefaultsVersion:\s*STUDIO_ONSCREEN_TEXT_LAYOUT_DEFAULTS_VERSION/,
  "La regeneración debe persistir la versión nueva del layout."
);

console.log("Podcast onscreen layout reset OK.");
