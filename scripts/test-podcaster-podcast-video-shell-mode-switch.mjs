import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const timelineUi = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
const podcasterJs = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!html.includes('id="podcastVideoModeToggle"')) {
  throw new Error("podcaster.html debe incluir un switch #podcastVideoModeToggle dentro del podcast-studio-track-head.");
}

if (!html.includes('id="podcastTimelineZoomOutRange"')) {
  throw new Error("podcaster.html debe mover el slider #podcastTimelineZoomOutRange al podcast-studio-track-head.");
}

if (timelineUi.includes('id="podcastTimelineZoomOutRange"')) {
  throw new Error("podcaster-timeline-ui.js ya no debe inyectar el slider de zoom dentro del ruler.");
}

if (!podcasterJs.includes('podcast-video-shell--audio-only')) {
  throw new Error("podcaster.js debe marcar el shell con una clase audio-only para podcast normal.");
}

if (!podcasterJs.includes('podcastVideoModeToggle')) {
  throw new Error("podcaster.js debe conectar el nuevo switch de modo podcast/video.");
}

console.log("Podcaster podcast/video shell mode switch OK.");
