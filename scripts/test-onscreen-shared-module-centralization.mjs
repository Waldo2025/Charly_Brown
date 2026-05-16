import assert from "node:assert/strict";
import fs from "node:fs";

const shared = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-on-screen-text.js",
  "utf8"
);

const podcaster = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);

assert.match(
  shared,
  /function normalizeOnScreenTextClipItem\(raw = \{\}, rowId = ""\)/,
  "La normalización de clips debe vivir en el módulo compartido."
);

assert.match(
  shared,
  /function normalizeOnScreenTextLayoutItem\(raw = \{\}, rowId = ""\)/,
  "La normalización de layouts debe vivir en el módulo compartido."
);

assert.match(
  shared,
  /function buildDefaultOnScreenTextLayoutForRow\(row = null, settings = null, options = \{\}\)/,
  "El layout por defecto debe resolverse desde el módulo compartido."
);

assert.match(
  shared,
  /function getOnScreenTextBgPresetClass\(bgPreset = ""\)/,
  "La clase visual de fondo debe centralizarse en el módulo compartido."
);

assert.match(
  shared,
  /function wrapOnScreenTextPreviewText\(text = "", options = \{\}\)/,
  "El wrap de preview debe centralizarse en el módulo compartido."
);

assert.match(
  podcaster,
  /const normalizeSharedOnScreenTextClipItem = typeof onScreenTextRenderSpecApi\.normalizeOnScreenTextClipItem === "function"/,
  "Podcaster debe enlazar la API compartida para clips."
);

assert.match(
  podcaster,
  /const buildSharedDefaultOnScreenTextLayoutForRow = typeof onScreenTextRenderSpecApi\.buildDefaultOnScreenTextLayoutForRow === "function"/,
  "Podcaster debe enlazar la API compartida para layouts."
);

assert.match(
  podcaster,
  /const getSharedOnScreenTextBgPresetClass = typeof onScreenTextRenderSpecApi\.getOnScreenTextBgPresetClass === "function"/,
  "Podcaster debe enlazar la API compartida para clases visuales."
);

console.log("Onscreen shared module centralization OK.");
