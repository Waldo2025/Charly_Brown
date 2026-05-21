import { readFileSync } from "node:fs";

const cssSource = readFileSync(
  new URL("../public/podcaster.css", import.meta.url),
  "utf8"
);
const resizeSource = readFileSync(
  new URL("../public/podcaster/podcaster-resize.js", import.meta.url),
  "utf8"
);

if (!/\.podcast-video-preview-shell\s*\{[\s\S]*gap:\s*0;[\s\S]*justify-content:\s*flex-start;[\s\S]*\}/m.test(cssSource)) {
  throw new Error("podcast-video-preview-shell no debe reservar gap vertical que robe alto util al video.");
}

if (!/const previewEl = stage\.querySelector\("\.podcast-video-preview"\) \|\| stage\.querySelector\("\.podcast-video-preview-shell"\);/.test(resizeSource)) {
  throw new Error("El resize del stage debe medir primero .podcast-video-preview, no el shell completo.");
}

console.log("Podcaster preview shell height OK.");
