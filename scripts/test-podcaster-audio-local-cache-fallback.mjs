import assert from "node:assert/strict";
import fs from "node:fs";

const podcasterSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster.js",
  "utf8"
);
const timelineUiSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-ui.js",
  "utf8"
);
const timelineModelSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-timeline-model.js",
  "utf8"
);
const timelineSource = fs.readFileSync(
  "/Users/waldolopez/Documents/CharlyBrown/public/podcaster/podcaster-audioGemini-timeline.js",
  "utf8"
);

assert.ok(
  podcasterSource.includes("const shouldPreferLocalMediaCache = Boolean(localMediaCacheKey);")
    && podcasterSource.includes("const localAudioKey = String(storedAudio?.localMediaCacheKey || \"\").trim();")
    && podcasterSource.includes("const localAudioSrc = localAudioKey && typeof playbackController.resolveLocalMediaObjectUrl === \"function\"")
    && podcasterSource.includes("const storedAudioSrc = localAudioSrc || resolveStorageAudioUrl(storedAudio?.downloadUrl || \"\", storedAudio?.storagePath || \"\");"),
  "Podcaster debe preferir caché local para audio Gemini en preview/playback antes de resolver Storage remoto."
);

assert.ok(
  timelineSource.includes("window.resolveDialogueAudioForRow?.(activeSession, rowId)")
    && timelineSource.includes("const localMediaCacheKey = String(audioClip.localMediaCacheKey || \"\").trim();")
    && timelineSource.includes("podcaster-local-media:")
    && timelineSource.includes("window?.playbackController?.resolveLocalMediaObjectUrl"),
  "El preloader de audio Gemini debe resolver la caché local y no depender solo de Firebase Storage."
);

assert.ok(
  timelineUiSource.includes("const storedAudioSrc = resolveStorageAudioUrl(audioClip?.downloadUrl || \"\", audioClip?.storagePath || \"\", {")
    && timelineUiSource.includes("localMediaCacheKey: storedAudioLocalMediaCacheKey")
    && timelineUiSource.includes("const segmentAudioSrc = resolveStorageAudioUrl(")
    && timelineUiSource.includes("localMediaCacheKey: segmentLocalMediaCacheKey")
    && timelineUiSource.includes("podcaster-local-media:"),
  "El timeline UI debe pedir audio Gemini usando localMediaCacheKey para evitar reconsultar Storage cuando ya hay caché local."
);

assert.ok(
  timelineModelSource.includes("const localMediaCacheKey = String(")
    && timelineModelSource.includes("resolveStorageAudioUrl(audioClip?.downloadUrl || \"\", audioClip?.storagePath || \"\", {")
    && timelineModelSource.includes("localMediaCacheKey: String(audioClip?.localMediaCacheKey || \"\").trim()"),
  "El timeline model debe pasar localMediaCacheKey a los resolvers de audio y video."
);

assert.ok(
  podcasterSource.includes("const localMediaCacheKey = String(raw.localMediaCacheKey || \"\").trim();")
    && podcasterSource.includes("const localAudioSrc = localMediaCacheKey ? `podcaster-local-media:${localMediaCacheKey}` : \"\";")
    && podcasterSource.includes("const resolvedAudioSrc = audioSrc || localAudioSrc;")
    && podcasterSource.includes("localMediaCacheKey,"),
  "normalizeGeminiDialogueTrackSegment debe preservar localMediaCacheKey y construir un audioSrc local cuando corresponda."
);

assert.ok(
  podcasterSource.includes("const localAudioKey = String(")
    && podcasterSource.includes("segment?.localMediaCacheKey")
    && podcasterSource.includes("effectiveSrc = src || (localAudioKey ? `podcaster-local-media:${localAudioKey}` : \"\");"),
  "El export Gemini debe conservar el localMediaCacheKey del segmento y usarlo como fuente local preferente."
);

console.log("Podcaster audio local cache fallback OK.");
