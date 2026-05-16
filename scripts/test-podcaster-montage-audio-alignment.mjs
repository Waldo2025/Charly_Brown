import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

const montageChipBlockMatch = source.match(
  /const buildMontageAudioSubtrackRowHtml = .*?const laneId = `montage-audio:\$\{trackId\}`;/s
);

if (!montageChipBlockMatch) {
  throw new Error("No se encontró el bloque de render del subtrack de audio del montaje.");
}

const montageChipBlock = montageChipBlockMatch[0];

if (!/STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX/.test(montageChipBlock)) {
  throw new Error(
    "El subtrack de audio del montaje debe conservar el ajuste visual para alinearse con los clips de video en el timeline."
  );
}

console.log("Montage audio chip alignment OK.");
