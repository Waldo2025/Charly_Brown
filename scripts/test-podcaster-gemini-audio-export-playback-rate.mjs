import { readFileSync } from "node:fs";

const frontend = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

const geminiSegmentBlock = frontend.slice(
  frontend.indexOf("const buildGeminiTimelineSegments"),
  frontend.indexOf("const buildUploadedBackgroundSegments")
);
if (!geminiSegmentBlock.includes("const playbackRate = Math.max(")
  || !geminiSegmentBlock.includes("storedAudio?.playbackRate")
  || !geminiSegmentBlock.includes("resolveGeminiSegmentTimelineDurationMs")
  || !/durationMs,[\s\S]*playbackRate,[\s\S]*trimInMs/m.test(geminiSegmentBlock)) {
  throw new Error("El payload de export debe enviar playbackRate en cada segmento Gemini del timeline.");
}

if (!/const playbackRate = Math\.max\(0\.5, Math\.min\(10, Number\(segment\?\.playbackRate \|\| 1\) \|\| 1\)\);[\s\S]*durationMs,[\s\S]*playbackRate,[\s\S]*trimInMs/m.test(backend)) {
  throw new Error("El backend debe normalizar playbackRate en los segmentos de audio del timeline.");
}

if (!/const sourceDurationSec = Math\.max\(0\.1, finalDurationSec \* playbackRate\);/.test(backend)) {
  throw new Error("El trim de fuente debe considerar la velocidad para producir la duración de timeline esperada.");
}

if (!/buildFfmpegAtempoFilterChain\(playbackRate\)/.test(backend)) {
  throw new Error("El mix de audio del timeline debe aplicar atempo con el playbackRate Gemini.");
}

if (!/atrim=start=0:duration=\$\{finalDurationSec\.toFixed\(3\)\}/.test(backend)) {
  throw new Error("Después de atempo, el segmento debe recortarse a la duración exacta del timeline.");
}

if (!/await hydrateMontageExportPayloadMedia\(prepared\.payload\);\s*await reconcileMontageExportGeminiAudioDurations\(prepared\.payload\);\s*await inlineMontageExportPayloadMedia\(prepared\.payload\);/.test(frontend)) {
  throw new Error("La exportación debe medir la duración física después de hidratar el audio y antes de serializarlo.");
}

console.log("Podcaster Gemini audio export playbackRate OK.");
