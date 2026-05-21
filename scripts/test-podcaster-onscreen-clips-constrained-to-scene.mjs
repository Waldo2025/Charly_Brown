import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/next\[rowId\] = sceneClip\s*\?\s*\(constrainOnScreenTextClipToScene\(normalized, sceneClip, rowId\) \|\| normalized\)\s*:\s*normalized;/.test(source)) {
  throw new Error("ensureOnScreenTextClipsByRowId debe volver a encerrar cada chip de texto en pantalla dentro de su escena.");
}

console.log("Podcaster onscreen clips constrained to scene OK.");
