import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
const frontend = readFileSync(
  new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url),
  "utf8"
);
const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

assert.match(
  html,
  /data-stop-motion-mode="video"[\s\S]*?Video MP4/,
  "El modal debe ofrecer un modo Video MP4 explícito."
);
assert.match(
  html,
  /id="podcast-media-upload-input"[^>]*accept="image\/\*,video\/mp4,video\/quicktime,\.mp4,\.mov"/,
  "El selector nativo debe permitir elegir MP4 y MOV desde el dispositivo."
);
assert.match(
  frontend,
  /function resolveSceneVideoFileKind\([\s\S]*?video\/mp4[\s\S]*?video\/quicktime[\s\S]*?endsWith\("\.mov"\)/,
  "El frontend debe distinguir MP4 y MOV antes de subir."
);
assert.match(
  frontend,
  /acceptedFileTypes: isVideoReplacementMode\(\)[\s\S]*?\['video\/mp4', 'application\/mp4', 'video\/quicktime'\]/,
  "FilePond debe restringir el modo de video a MP4/MOV."
);
assert.match(
  frontend,
  /setReplacementImageMode\(media\.type === "video" \? "video" : "single"\)/,
  "Un video existente debe rehidratar el modal en modo Video MP4."
);
assert.match(
  frontend,
  /type: uploadedIsImage \? "image" : "video"[\s\S]*?storagePath: uploadedStoragePath/,
  "El resultado subido debe conservar tipo video y storagePath para persistencia."
);
assert.match(
  backend,
  /const isMp4 = normalizedMimeType === "video\/mp4" \|\| normalizedMimeType === "application\/mp4";/,
  "El endpoint debe aceptar MP4 explícitamente."
);
assert.match(
  backend,
  /const isQuickTime = normalizedMimeType === "video\/quicktime";[\s\S]*?transcodeDialogueVideoToMp4\(buffer, "video\/quicktime"/,
  "El endpoint debe convertir MOV a MP4 antes de Storage."
);
assert.match(
  backend,
  /async function probeMediaWithFfmpeg[\s\S]*?"-frames:v",\s*"1"[\s\S]*?"-an"/,
  "La inspección de códecs debe leer un solo fotograma, no decodificar el video completo."
);
assert.match(
  backend,
  /transcodeDialogueVideoToMp4\(buffer, "video\/quicktime", \{[\s\S]*?videoPreset: "veryfast"[\s\S]*?videoCrf: 20/,
  "Los MOV que requieren recodificación deben usar el preset interactivo rápido."
);
assert.match(
  backend,
  /buffer\.toString\("ascii", 4, 8\) !== "ftyp"/,
  "El endpoint debe comprobar la firma ISO BMFF del MP4."
);
assert.match(
  backend,
  /kind: isImage \? "scene_image_replacement" : "scene_video_replacement"/,
  "El MP4 debe guardarse en Storage como reemplazo de video de escena."
);
assert.match(
  frontend,
  /showSceneMediaUploadError\(err\?\.message \|\| "No se pudo subir el archivo\."\)/,
  "El modal debe mostrar el error exacto que FilePond ocultaba."
);
assert.match(
  frontend,
  /function uploadSceneMediaRequest\([\s\S]*?new XMLHttpRequest\(\)[\s\S]*?xhr\.upload\.onprogress/,
  "La carga de videos debe reportar progreso real mediante XMLHttpRequest."
);
assert.match(
  frontend,
  /Archivo recibido\. Convirtiendo MOV a MP4…/,
  "El modal debe distinguir la conversión MOV de la transferencia del archivo."
);
assert.match(
  frontend,
  /uploadCancelled \|\| err\?\.name === "AbortError"/,
  "Cancelar una carga no debe presentarse como un error de subida."
);
assert.match(
  html,
  /id="sceneMediaUploadStatus"[^>]*role="status"/,
  "El modal debe exponer el estado de subida y conversión de forma accesible."
);

console.log("Podcaster device MP4 scene replacement contract OK.");
