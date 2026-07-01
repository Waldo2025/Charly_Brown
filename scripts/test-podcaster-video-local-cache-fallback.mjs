import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const playbackSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.ok(
  playbackSource.includes("const localMediaCacheKey = String(firstSegment?.localMediaCacheKey || clip?.localMediaCacheKey || \"\").trim();")
    && playbackSource.includes("const localVideoSrc = localMediaCacheKey ? await this.resolveLocalMediaObjectUrl(localMediaCacheKey) : \"\";")
    && playbackSource.includes("const remoteSrc = resolveUrl?.(")
    && playbackSource.includes("const src = localVideoSrc || remoteSrc;"),
  "syncStageMedia debe preferir la caché local del video antes de resolver Storage remoto para no depender de objetos 404."
);

assert.ok(
  source.includes("const localMediaCacheKey = String(raw.localMediaCacheKey || \"\").trim();")
    && source.includes("const localAudioSrc = localMediaCacheKey ? `podcaster-local-media:${localMediaCacheKey}` : \"\";")
    && source.includes("const resolvedAudioSrc = audioSrc || localAudioSrc;")
    && source.includes("localMediaCacheKey,"),
  "normalizeGeminiDialogueTrackSegment debe preservar localMediaCacheKey y construir un audioSrc local cuando corresponda."
);

console.log("Podcaster video local cache fallback OK.");
