import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster.js", import.meta.url), "utf8");

const audioBuildMatch = source.match(
  /const buildMontageAudioSubtrackRowHtml = \(track = null, trackIndex = 0, trackItems = \[\]\) => \{[\s\S]*?const leftPx = Math\.max\([\s\S]*?\);[\s\S]*?data-action="timeline-select-scene"[\s\S]*?\};/m
);

if (!audioBuildMatch) {
  throw new Error("No se encontró buildMontageAudioSubtrackRowHtml.");
}

if (!/STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX = -15;/.test(source)) {
  throw new Error("El nudge horizontal de subtracks debe ser -15px.");
}

if (!/STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX/.test(audioBuildMatch[0])) {
  throw new Error("El chip de audio debe aplicar el nudge horizontal configurado.");
}

const textTrackMatch = source.match(
  /const buildOnScreenTextTrackRowHtml = \(\) => \{[\s\S]*?const leftPx = Math\.max\(0, Number\(clipLeftPx \|\| 0\)([\s\S]*?)\);[\s\S]*?podcast-onscreen-text-timeline-clip/m
);

if (!textTrackMatch) {
  throw new Error("No se encontró buildOnScreenTextTrackRowHtml.");
}

if (!(textTrackMatch[1] || "").includes("STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX")) {
  throw new Error("El clip de texto debe aplicar el nudge horizontal configurado.");
}

const normalTextTrackMatch = source.match(
  /const buildNormalOnScreenTextTrackRowHtml = \(\) => \{[\s\S]*?const leftPx = Math\.max\(0, Number\(clipLeftPx \|\| 0\)([\s\S]*?)\);[\s\S]*?podcast-onscreen-text-timeline-clip/m
);

if (!normalTextTrackMatch) {
  throw new Error("No se encontró buildNormalOnScreenTextTrackRowHtml.");
}

if (!(normalTextTrackMatch[1] || "").includes("STUDIO_TIMELINE_SUBTRACK_LEFT_NUDGE_PX")) {
  throw new Error("El clip de texto en modo normal debe aplicar el nudge horizontal configurado.");
}

console.log("Podcast subtrack left alignment OK.");
