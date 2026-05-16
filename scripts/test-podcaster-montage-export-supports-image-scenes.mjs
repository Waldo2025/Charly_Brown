import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/mediaKind:\s*String\(primarySegment\?\.type \|\| clip\?\.type \|\| \(videoMimeType\.startsWith\("image\/"\) \? "image" : "video"\)\)/.test(front)
  && !/type:\s*String\(primarySegment\?\.type \|\| clip\?\.type \|\| \(videoMimeType\.startsWith\("image\/"\) \? "image" : "video"\)\)/.test(front)) {
  throw new Error("El payload de export debe distinguir explícitamente entre escenas image y video.");
}

if (!/const isImageAsset = String\(videoAsset\?\.mediaKind \|\| videoAsset\?\.type \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "image"[\s\S]*\|\| String\(videoAsset\?\.mimeType \|\| ""\)\.trim\(\)\.toLowerCase\(\)\.startsWith\("image\/"\);/.test(back)) {
  throw new Error("El backend debe inferir explícitamente cuándo una escena del montaje es imagen.");
}

if (!/const inputVisualPath = await downloadInput\(videoAsset, isImageAsset \? "image" : "video", i\);/.test(back)) {
  throw new Error("El backend debe descargar escenas imagen con un kind explícito distinto de video.");
}

if (!/if \(isImageAsset\) \{[\s\S]*"-loop", "1"[\s\S]*\} else \{/.test(back)) {
  throw new Error("La exportación debe tener una rama explícita de FFmpeg para imágenes fijas con -loop 1.");
}

if (!/const videoHasAudio = isImageAsset \? false : await probeMediaHasAudioWithFfmpeg\(inputVisualPath\);/.test(back)) {
  throw new Error("La exportación de escenas imagen no debe intentar probe de audio de video.");
}

if (!/const sourceDims = isImageAsset[\s\S]*probeImageDimensions/.test(back)
  && !/const sourceDims = isImageAsset[\s\S]*probeMediaDimensions/.test(back)
  && !/const sourceDims = isImageAsset[\s\S]*probeMediaVideoDimensionsWithFfmpeg/.test(back)) {
  throw new Error("La exportación de escenas imagen debe resolver dimensiones con una rama explícita.");
}

console.log("Podcaster montage export supports image scenes OK.");
