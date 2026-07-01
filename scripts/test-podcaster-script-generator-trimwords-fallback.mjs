import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-script-generator.js",
  "utf8"
);

assert.match(
  source,
  /secondsToClock,\s*trimWords:\s*windowTrimWords,\s*escapeHtml:/,
  "podcaster-script-generator debe capturar window.trimWords con alias para no congelar undefined."
);

assert.match(
  source,
  /const trimWords = typeof windowTrimWords === "function"\s*\?\s*windowTrimWords\s*:\s*\(\(text = "", maxWords = 0\) => \{/,
  "podcaster-script-generator debe tener fallback local de trimWords cuando carga antes de podcaster.js."
);

assert.match(
  source,
  /return words\.slice\(0, safeMax\)\.join\(" "\);/,
  "El fallback local de trimWords debe recortar a maxWords."
);

console.log("podcaster script generator trimWords fallback OK.");
