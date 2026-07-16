import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const frontend = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
const videoPlayer = readFileSync(new URL("../public/video-player.html", import.meta.url), "utf8");

if (!/data-cache-src="podcaster\/podcaster-scene-media-render-spec\.js"/.test(html)) {
  throw new Error("podcaster.html debe cargar podcaster-scene-media-render-spec.js antes del runtime principal.");
}

if (!/PodcasterSceneMediaRenderSpec/.test(frontend)) {
  throw new Error("podcaster.js debe validar la disponibilidad del API compartido de scene media.");
}

if (!/resolveSceneMediaRenderSpec/.test(playback)
  || !/applyComputedSceneMediaLayout/.test(playback)) {
  throw new Error("El playback controller debe consumir la spec compartida y aplicar layout explícito.");
}

if (!/resolveSceneMediaRenderSpec/.test(exportSource)
  || !/syncMontageFrontendPreviewMediaLayout/.test(exportSource)) {
  throw new Error("El modal de export debe usar la spec compartida para el preview frontend.");
}

if (!/resolveSceneMediaRenderSpec/.test(backend)
  || !/buildSceneMediaPositionCropFilter/.test(backend)) {
  throw new Error("El backend debe derivar el crop y motion del export desde la spec compartida.");
}

const playerSpecIndex = videoPlayer.indexOf('data-cache-src="podcaster/podcaster-scene-media-render-spec.js"');
const playerControllerIndex = videoPlayer.indexOf('data-cache-src="podcaster/podcaster-playback-controller.js"');
if (playerSpecIndex < 0 || playerControllerIndex < 0 || playerSpecIndex > playerControllerIndex) {
  throw new Error("video-player debe cargar la spec compartida antes del playback controller.");
}

console.log("Podcaster scene media render spec integration OK.");
