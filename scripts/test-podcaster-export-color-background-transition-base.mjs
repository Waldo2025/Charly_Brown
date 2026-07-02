import { readFileSync } from "node:fs";

const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/function resolveMontageCompositionBaseColor\(entries = \[\]\)/.test(backend)) {
  throw new Error("El backend debe resolver un color base para composiciones con transiciones.");
}

if (!/const baseColor = resolveMontageCompositionBaseColor\(chunkPlan\.entries\);/.test(backend)) {
  throw new Error("El compositor de overlaps debe usar el color base del chunk renderizado.");
}

if (/color=c=black:s=\$\{canvas\.width\}x\$\{canvas\.height\}:d=\$\{totalSec\.toFixed\(3\)\}:r=24/.test(backend)) {
  throw new Error("El compositor de overlaps no debe usar base negra fija para fondos de color.");
}

if (!/backgroundColor: hasCustomBg \? clampText\(entry\?\.backgroundColor \|\| "", 150\) : ""/.test(backend)) {
  throw new Error("Las entradas exportadas deben preservar backgroundColor para transiciones.");
}

console.log("Podcaster color background transition base OK.");
