import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-playback-controller.js",
  "utf8"
);

assert.ok(
  source.includes("const localMediaCacheKey = String(firstSegment?.localMediaCacheKey || clip?.localMediaCacheKey || \"\").trim();")
    && source.includes("const localVideoSrc = localMediaCacheKey ? await this.resolveLocalMediaObjectUrl(localMediaCacheKey) : \"\";")
    && source.includes("const remoteSrc = resolveUrl?.(")
    && source.includes("const src = localVideoSrc || remoteSrc;"),
  "syncStageMedia debe preferir la caché local del video antes de resolver Storage remoto para no depender de objetos 404."
);

assert.match(
  source,
  /localMediaCacheKey: String\(segment\?\.localMediaCacheKey \|\| clip\?\.localMediaCacheKey \|\| \"\"\)\.trim\(\)/,
  "resolveDialogueVideoSegments debe propagar localMediaCacheKey hacia los segmentos de playback."
);

console.log("Podcaster video local cache fallback OK.");
