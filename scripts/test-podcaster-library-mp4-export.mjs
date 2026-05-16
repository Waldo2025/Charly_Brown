import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
const back = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

const nativeAudioFn = front.match(
  /function shouldUseNativeVideoAudioForRow\(session = null, rowId = ""\) \{([\s\S]*?)\n\}/m
);

if (!nativeAudioFn) {
  throw new Error("No se encontró shouldUseNativeVideoAudioForRow.");
}

if (!/public-scene-library|sourcePublicSceneLibraryId|publicSceneLibraryId/.test(nativeAudioFn[1])) {
  throw new Error("Los videos de librería deben preservar audio nativo por defecto en export.");
}

const keepNativeFn = front.match(
  /function shouldKeepNativeVideoAudioForRow\(session = null, rowId = ""\) \{([\s\S]*?)\n\}/m
);

if (!keepNativeFn) {
  throw new Error("No se encontró shouldKeepNativeVideoAudioForRow.");
}

if (/shouldUseNativeVideoAudioForRow\([^)]*\)\s*\|\|/.test(keepNativeFn[1])
  || !/Number\(mix\.videoVolume \|\| 0\) > 0\.0001/.test(keepNativeFn[1])) {
  throw new Error("El export debe respetar timelineClipVeoVolumeRange=0 y no forzar audio nativo solo por ser video de biblioteca.");
}

if (/mp4_h265|H\.265|HEVC|libx265/.test(front) || /mp4_h265|libx265/.test(back)) {
  throw new Error("El export de montaje no debe ofrecer ni codificar H.265/HEVC; MP4 debe salir H.264/AAC compatible.");
}

if (!/const requestedFormat = String\(montageExportState\.format \|\| "mp4_h264"\)\.trim\(\);/.test(front)
  || !/const effectiveFormat = requestedFormat === "webm_vp9"\s*\?\s*"webm_vp9"\s*:\s*"mp4_h264";/.test(front)) {
  throw new Error("El export debe normalizar cualquier MP4 legado a H.264.");
}

if (!/montage_concat/.test(back)) {
  throw new Error("No se encontró la etapa montage_concat.");
}

if (/\[\s*"-y"[^\]]*"-f", "concat"[^\]]*"-c", "copy"[^\]]*concatOutPath\s*\]/s.test(back)) {
  throw new Error("La concatenación final no debe usar copy para MP4 de librería local.");
}

if (!/\[v_ducked\]\[mix\]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=-1\.5dB\[outa\]/.test(back)) {
  throw new Error("La mezcla timeline debe conservar el audio base del video exportado.");
}

if (!/const exportOffsetsByRowId = new Map\(\);/.test(back)
  || !/exportOffsetsByRowId\.set\(String\(entry\.rowId \|\| ""\)\.trim\(\), \{[\s\S]*startMs: cursorMs/.test(back)
  || !/const relativeStartMs = Math\.max\(0, startMs - baseTimelineStartMs\);/.test(back)
  || !/const adjustedStartMs = exportOffset[\s\S]*Math\.max\(0, exportOffset\.startMs \+ relativeStartMs\)/.test(back)) {
  throw new Error("El export debe realinear el audio Gemini usando offsets del timeline ya concatenado, no solo startMs originales.");
}

if (!/const trimInMs = Math\.max\(0, Math\.round\(Number\(\(segment\?\.trimInMs \?\? runtime\?\.clip\?\.trimInMs \?\? 0\)\) \|\| 0\)\);/.test(front)
  || !/const trimOutMsRaw = Math\.round\(Number\(\(segment\?\.trimOutMs \?\? runtime\?\.clip\?\.trimOutMs \?\? 0\)\) \|\| 0\);/.test(front)) {
  throw new Error("El export Gemini debe respetar trimInMs=0 del segmento y no heredar recortes visuales por usar ||.");
}

console.log("Podcast library mp4 export OK.");
