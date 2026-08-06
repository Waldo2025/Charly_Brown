import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const playerHtml = readFileSync(new URL("../public/video-player.html", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
const playbackSource = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
const localMediaCacheSource = readFileSync(new URL("../public/podcaster/podcaster-local-media-cache.js", import.meta.url), "utf8");

assert.match(
  playerHtml,
  /<video id="playerVideoA"[\s\S]*?<video id="playerVideoB"/,
  "video-player debe conservar las dos superficies de video para cambios de escena sin corte negro."
);
assert.match(
  playerHtml,
  /data-cache-src="podcaster\/podcaster-playback-controller\.js"/,
  "video-player debe usar el controlador compartido del editor."
);
assert.match(
  homeSource,
  /function getHomeDialogueVideoMap\([\s\S]*?dialogueVideoMap[\s\S]*?dialogueVideosByRowId/,
  "El reproductor debe resolver el mapa de video persistido y sus fallbacks compatibles."
);
assert.match(
  homeSource,
  /const primarySceneMedia = resolveHomePrimarySceneMediaRecord\(sceneClip\);[\s\S]*?const videoSrc = resolveStorageVideoUrl\(sceneMediaDownloadUrl, sceneMediaStoragePath,\s*\{[\s\S]*?type: sceneMediaType,[\s\S]*?mimeType: sceneMediaMimeType/,
  "La fuente visible debe salir del registro persistido y resolverse por Storage."
);
assert.match(
  homeSource,
  /mimeType: sceneMediaMimeType,[\s\S]*?type: sceneMediaType,[\s\S]*?mediaKind: sceneMediaType/,
  "El runtime del player debe conservar MIME y clasificación de la escena reemplazada."
);
assert.match(
  homeSource,
  /resolveDialogueVideoForRow: \(s, rowId\)[\s\S]*?getHomeDialogueVideoMap\(s\)\?\.\[key\]/,
  "El controlador compartido debe poder rehidratar directamente el MP4 de dialogueVideoMap."
);
assert.match(
  homeSource,
  /dialogueVideoMap: incomingSession\?\.dialogueVideoMap \|\| currentMultimediaSession\.dialogueVideoMap/,
  "La actualización en vivo debe conservar el mapa visual cuando el snapshot parcial no lo incluya."
);
assert.match(
  homeSource,
  /invalidateRowMediaCache\(rowId, freshSession,[\s\S]*?previousClip:[\s\S]*?nextClip:[\s\S]*?includeAudio: false/,
  "Al adoptar cambios, video-player debe evacuar el blob visual anterior."
);
assert.match(
  playerHtml,
  /id="btnPurgeVideoCache"[\s\S]*?aria-label="Purgar caché y recargar videos actualizados"/,
  "video-player debe exponer un comando accesible para purgar y recargar medios."
);
assert.match(
  homeSource,
  /purgeAndReloadVideoPlayerMedia[\s\S]*?purgeAllMediaCaches\(\)[\s\S]*?forceServer: true[\s\S]*?homeMediaPurgeRevision/,
  "La purga debe borrar cachés, leer la sesión desde servidor y forzar URLs nuevas."
);
assert.match(
  playbackSource,
  /async purgeAllMediaCaches\(\)[\s\S]*?clearPodcasterLocalMediaCache\(\)[\s\S]*?caches\.delete\(this\.mediaCacheName\)/,
  "El controlador debe vaciar memoria, IndexedDB y Cache Storage."
);
assert.match(
  localMediaCacheSource,
  /export async function clearPodcasterLocalMediaCache\(\)[\s\S]*?store\.clear\(\)/,
  "La capa IndexedDB debe ofrecer una purga total explícita."
);

console.log("video-player device MP4 replacement parity contract OK.");
