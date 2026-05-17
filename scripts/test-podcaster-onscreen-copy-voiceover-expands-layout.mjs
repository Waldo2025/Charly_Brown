import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/function expandOnScreenTextLayoutsForRows\(session = null, rowIds = \[\], options = \{\}\)/.test(source)) {
  throw new Error("Debe existir un helper para expandir layouts de texto en pantalla al copiar el guion.");
}

if (!/copyVoiceOverTextToOnScreenText\(rowId = ""\)[\s\S]*onScreenTextNoSummarize: true[\s\S]*expandOnScreenTextLayoutsForRows\(getActiveSession\(\), \[key\], \{ persist: true \}\);/m.test(source)) {
  throw new Error("Copiar guion a texto en pantalla por escena debe preservar el texto completo y expandir su layout.");
}

if (!/copyVoiceOverTextToOnScreenTextAllScenes\(\)[\s\S]*const changedRowIds = \[\];[\s\S]*changedRowIds\.push\(String\(item\?\.id \|\| ""\)\.trim\(\)\);[\s\S]*expandOnScreenTextLayoutsForRows\(getActiveSession\(\), changedRowIds, \{ persist: true \}\);/m.test(source)) {
  throw new Error("Copiar guion a texto en pantalla en todas las escenas debe expandir layouts para las filas afectadas.");
}

console.log("Podcaster onscreen copy voiceover expands layout OK.");
