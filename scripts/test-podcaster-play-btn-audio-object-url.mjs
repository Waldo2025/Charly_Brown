import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");

if (!/const audioSrc = await ensurePodcastStageAudioCachedObjectUrl\(storedAudioSrc\);/.test(source)) {
  throw new Error("playRowAudio debe esperar una object URL cacheada antes de reproducir audio Gemini.");
}

if (!/const audioSrc = await ensurePodcastStageAudioCachedObjectUrl\(storedAudioSrc\);[\s\S]*playbackController\.playStandaloneAudio\(key, audioSrc,/m.test(source)) {
  throw new Error("playStudioDialoguePreviewAudio debe usar la object URL cacheada al reproducir audio guardado.");
}

console.log("Podcaster play button audio object URL OK.");
