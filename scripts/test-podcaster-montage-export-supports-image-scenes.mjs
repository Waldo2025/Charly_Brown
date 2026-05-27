import { readFileSync } from "node:fs";

const front = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
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

if (!/visualEffects: activeSession\?\.visualEffectsMap\?\.\[rowId\] \|\| null/.test(front)) {
  throw new Error("El payload de export debe incluir visualEffectsMap por escena.");
}

if (!/function normalizeMontageVisualEffects\(raw = null\)/.test(back)
  || !/function buildMontageImageMotionVideoFilter\(\{/.test(back)
  || !/scale=w='ceil\(\$\{renderWidth\}\*\(\$\{zExpr\}\)\/2\)\*2'/.test(back)) {
  throw new Error("El backend debe normalizar y renderizar movimiento Ken Burns para escenas imagen.");
}

if (!/const visualEffects = normalizeMontageVisualEffects\(entry\?\.visualEffects \|\| null\);/.test(back)
  || !/buildMontageImageMotionVideoFilter\(\{[\s\S]*visualEffects[\s\S]*\}\)/.test(back)) {
  throw new Error("La rama de export de imagen debe aplicar visualEffects al filtro de video.");
}

if (!/return `\$\{inputLabel\}scale=\$\{coverWidth\}:\$\{coverHeight\}:force_original_aspect_ratio=increase,crop=\$\{width\}:\$\{height\},setsar=1\[\$\{outputLabel\}\]`;/.test(back)
  || !/const supersample = 2;/.test(back)
  || !/const effectDurationSec = Math\.max\(0\.2, Math\.min\(/.test(back)
  || !/const progressExpr = `\(\(\$\{rawProgressExpr\}\)\*\(\$\{rawProgressExpr\}\)\*\(3-2\*\(\$\{rawProgressExpr\}\)\)\)`;/.test(back)
  || !/const panZoom = `1\.06\+0\.14\*\(\$\{progressExpr\}\)`;/.test(back)
  || /zoompan=z=/.test(back)
  || /scale=\$\{width \* 2\}:\$\{height \* 2\}:force_original_aspect_ratio=increase/.test(back)
  || !/zExpr = `1\+0\.30\*\(\$\{progressExpr\}\)`;/.test(back)
  || !/zExpr = `1\.30-0\.30\*\(\$\{progressExpr\}\)`;/.test(back)) {
  throw new Error("El filtro Ken Burns de imágenes debe usar scale/crop con supersampling y completar el zoom en escenas cortas.");
}

if (/return `\$\{inputLabel\}scale=\$\{width\}:\$\{height\},setsar=1\[\$\{outputLabel\}\]`;/.test(back)
  || /`${inputLabel}scale=${renderWidth}:${renderHeight},setsar=1/.test(back)) {
  throw new Error("Las escenas imagen no deben escalarse directo al canvas porque eso deforma la proporción.");
}

if (!/return \{ width: even\(safeWidth\), height: even\(safeHeight\) \};/.test(back)) {
  throw new Error("La exportación source debe preservar el aspect ratio fuente para no estirar videos verticales.");
}

if (!/if \(key === "1080p"\) \{[\s\S]*return \{ width: 1920, height: 1080 \};[\s\S]*if \(key === "720p"\) \{[\s\S]*return \{ width: 1280, height: 720 \};/.test(back)) {
  throw new Error("Las resoluciones explícitas deben exportar canvas fijo 1080p/720p, no reducirse al tamaño fuente de la imagen.");
}

if (!/if \(!isImageAsset && visualLayoutMode === "blur-backdrop"\) \{/.test(back)) {
  throw new Error("Las escenas imagen no deben usar blur-backdrop/pad como layout de export porque produce marco negro o imagen chica.");
}

if (!/scale=\$\{canvas\.width\}:\$\{canvas\.height\}:force_original_aspect_ratio=increase,crop=\$\{canvas\.width\}:\$\{canvas\.height\},setsar=1,format=rgba/.test(back)) {
  throw new Error("La composición overlap/gaps debe usar cover/crop, no contain+pad negro.");
}

console.log("Podcaster montage export supports image scenes OK.");
