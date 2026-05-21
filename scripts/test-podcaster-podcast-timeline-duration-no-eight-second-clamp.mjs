import { readFileSync } from "node:fs";

const timelineModelSource = readFileSync(
  new URL("../public/podcaster/podcaster-timeline-model.js", import.meta.url),
  "utf8"
);
const podcasterSource = readFileSync(
  new URL("../public/podcaster/podcaster.js", import.meta.url),
  "utf8"
);

if (!/const bounded = isVideoEducational[\s\S]*Math\.max\(STUDIO_TIMELINE_MIN_CLIP_MS, candidate \|\| 8000\)/.test(timelineModelSource)) {
  throw new Error("El timeline model no debe limitar podcast a VIDEO_SCENE_MAX_SEC en getRowSourceDurationMs.");
}

if (!/const useFullSceneDuration = isPodcastMode\(activeSession\) && !isEducationalVideoMode\(activeSession\);/.test(timelineModelSource)) {
  throw new Error("El timeline model debe usar duración completa de escena para on-screen text en podcast.");
}

if (!/if \(isPodcastMode\(activeSession\) && !isEducationalVideoMode\(activeSession\)\)\s*\{\s*return false;\s*\}/.test(podcasterSource)) {
  throw new Error("podcaster.js no debe recentrar clips de texto en pantalla a 7s cuando es podcast.");
}

if (!/wasDefaultCenteredPodcastClip/.test(podcasterSource)) {
  throw new Error("podcaster.js debe expandir clips legacy de texto en pantalla cuando venían recortados a 7s en podcast.");
}

console.log("Podcaster podcast timeline durations OK.");
