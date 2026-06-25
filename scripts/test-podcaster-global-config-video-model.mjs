import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/function readGlobalVideoConfigControls\(\) \{/.test(source)
  || !/function persistGlobalVideoConfigDraft\(\) \{/.test(source)
  || !/upsertPodcastVideoConfig\(\(cfg\) => \(\{\s*\.\.\.cfg,\s*\.\.\.nextVideoConfig\s*\}\), \{\s*persist: false,\s*autosave: false\s*\}\);/s.test(source)
  || !/\[els\.globalCheapVideoMode, els\.globalMediaLoadMode\][\s\S]*persistGlobalVideoConfigDraft\(\);/m.test(source)) {
  throw new Error("La configuración global de VEO debe persistir al cambiar y reutilizar upsertPodcastVideoConfig.");
}

console.log("Podcaster global config video model persistence OK.");
