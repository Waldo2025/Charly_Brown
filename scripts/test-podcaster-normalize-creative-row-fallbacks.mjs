import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!source.includes('rawSceneSource || row?.voiceOverText || row?.text || row?.notes || row?.visualNotes || row?.videoDirective || ""')) {
  throw new Error("normalizeCreativeRow ya no conserva fallback de sceneDescription desde voz/notas/directiva.");
}

if (!source.includes('row?.videoDirective || row?.voiceOverText || row?.text || rowNotes || ""')) {
  throw new Error("normalizeCreativeRow ya no conserva fallback de visualNotes desde voz/texto/notas.");
}

console.log("normalizeCreativeRow fallback compatibility OK.");
