import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

if (!/const sceneProbe = isImageAsset[\s\S]*?const sourceDims = sceneProbe\.dimensions;[\s\S]*?const videoHasAudio = sceneProbe\.hasAudio;/.test(backendSource)) {
  throw new Error("El export debe reutilizar un solo probe por escena para dimensiones y audio.");
}

if (/else if \(outExt === "mp4"\) \{[\s\S]*?montage-faststart\.mp4[\s\S]*?finalOutPath = remuxOutPath;[\s\S]*?\}/.test(backendSource)) {
  throw new Error("El export no debe hacer un remux faststart intermedio redundante antes del encode final.");
}

console.log("Podcaster montage export performance regressions OK.");
