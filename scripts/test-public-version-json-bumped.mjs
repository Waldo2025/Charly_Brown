import assert from "node:assert/strict";
import fs from "node:fs";

const version = JSON.parse(
  fs.readFileSync("/Users/waldolopez/Documents/CharlyBrown/public/version.json", "utf8")
);

assert.match(version.version, /^1\.0\.10\.\d+$/);
assert.equal(version.cache_version, version.build);
const changelog = Array.isArray(version.changelog) ? version.changelog : [];
const releaseNotes = Array.isArray(version.releaseNotes) ? version.releaseNotes : [];
const notes = [...changelog, ...releaseNotes];
assert.ok(
  (
    String(changelog[0] || "").includes("audio Gemini")
    && String(changelog[0] || "").includes("localMediaCacheKey")
    && String(changelog[0] || "").includes("caché local")
    && String(changelog[0] || "").includes("404/403")
  ) || (
    String(changelog[0] || "").includes("timeline de Podcaster")
    && String(changelog[0] || "").includes("localMediaCacheKey")
    && String(changelog[0] || "").includes("caché local")
    && String(changelog[0] || "").includes("404")
  ) || (
    String(changelog[0] || "").includes("audio Gemini inline")
    && String(changelog[0] || "").includes("localMediaCacheKey")
    && String(changelog[0] || "").includes("storagePath/downloadUrl")
    && String(changelog[0] || "").includes("dataUrl/localDataUrl")
  ) || (
    String(changelog[0] || "").includes("publicSceneVideoStoragePath")
    && String(changelog[0] || "").includes("publicSceneStoragePath")
    && String(changelog[0] || "").includes("downloadUrl")
    && String(changelog[0] || "").includes("403")
  ) || (
    String(changelog[0] || "").includes("storageLookupFailedAt")
    && String(changelog[0] || "").includes("getDownloadURL")
    && String(changelog[0] || "").includes("403/404")
  ) || (
    String(changelog[0] || "").includes("storagePath")
    && String(changelog[0] || "").includes("Firebase Storage SDK")
    && String(changelog[0] || "").includes("404/403")
    && String(changelog[0] || "").includes("stale")
  ) || (
    String(changelog[0] || "").includes("Firebase Storage SDK")
    && String(changelog[0] || "").includes("downloadUrl")
    && String(changelog[0] || "").includes("server.js")
    && String(changelog[0] || "").includes("fallback legacy")
  ) || (
    String(changelog[0] || "").includes("cache-busters `u=`")
    && String(changelog[0] || "").includes("downloadUrl tokenizados")
    && String(changelog[0] || "").includes("podcaster/library")
    && String(changelog[0] || "").includes("403")
  ) || (
    String(changelog[0] || "").includes("podcaster.html")
    && String(changelog[0] || "").includes("CSS crítico inline")
    && String(changelog[0] || "").includes("body en modo booting")
    && String(changelog[0] || "").includes("spinner")
  ),
  "La nota más reciente debe reflejar la conservación del audio Gemini inline, la persistencia/rehidratación de publicSceneVideoStoragePath, la deduplicación por storagePath, el bypass por SDK, el fix de tokens vencidos de Firebase Storage o el splash screen inicial de Podcaster."
);
assert.ok(
  notes.some((note) => String(note || "").includes("same-origin")
    && String(note || "").includes("proxy-media")
    && String(note || "").includes("Firebase Storage")
    && String(note || "").includes("token")),
  "Las release notes deben conservar que los proxy-media de assets quedan same-origin y se prefieren URLs directas tokenizadas de Firebase."
);
assert.ok(
  notes.some((note) => String(note || "").includes("timeline")
    && String(note || "").includes("proxy-media")
    && String(note || "").includes("gs://")
    && String(note || "").includes("charly-brown-gemini-backend")),
  "Las release notes deben conservar que el timeline ya no conserva proxy-media heredado con storagePath gs:// apuntando a Gemini."
);
assert.ok(
  notes.some((note) => String(note || "").includes("export MP4 v2")
    && String(note || "").includes("storagePath")
    && String(note || "").includes("proxy-media")
    && String(note || "").includes("Firebase Storage SDK directo")
    && String(note || "").includes("charly-brown-gemini-backend")),
  "Las release notes deben conservar que preview/export resuelve storagePath anidado en proxy-media directo por Firebase."
);
assert.ok(
  notes.some((note) => String(note || "").includes("export MP4 v2")
    && String(note || "").includes("audios Gemini")
    && String(note || "").includes("música de fondo")
    && String(note || "").includes("localMediaCacheKey")),
  "Las release notes deben conservar que export v2 conserva audio local/cacheado."
);
assert.ok(
  notes.some((note) => String(note || "").includes("export MP4 v2")
    && String(note || "").includes("backend_busy_with_export/429")
    && String(note || "").includes("Seguir exportación")),
  "Las release notes deben conservar que export v2 retoma jobs activos cuando snoopy-export responde ocupado."
);
assert.ok(
  notes.some((note) => String(note || "").includes("export MP4 v2")
    && String(note || "").includes("proxy-media")
    && String(note || "").includes("Firebase Storage SDK directo")
    && String(note || "").includes("storagePath")),
  "Las release notes deben conservar el bypass directo de Firebase Storage en export v2."
);
assert.ok(
  notes.some((note) => String(note || "").includes("escenas públicas")
    && String(note || "").includes("imágenes con movimiento")
    && String(note || "").includes("visualEffectsMap")
    && String(note || "").includes("rowId")),
  "Las release notes deben conservar la persistencia del movimiento de escenas públicas de imagen."
);
assert.ok(
  notes.some((note) => String(note || "").includes("escenas públicas")
    && String(note || "").includes("imagen")
    && String(note || "").includes("Firebase Storage SDK")
    && String(note || "").includes("video")),
  "Las release notes deben conservar el preview de escenas públicas de imagen."
);
assert.ok(
  notes.some((note) => String(note || "").includes("librería pública")
    && String(note || "").includes("Firebase SDK directo")
    && String(note || "").includes("podcaster_scene_library")
    && String(note || "").includes("/api/podcaster/scene-library")),
  "Las release notes deben conservar la librería pública directa por Firebase SDK."
);
assert.ok(
  notes.some((note) => String(note || "").includes("uploadBytesResumable")
    && String(note || "").includes("scene-media/upload")
    && String(note || "").includes("Firebase Storage SDK")),
  "Las release notes deben conservar la subida directa por Firebase Storage SDK."
);
assert.ok(
  notes.some((note) => String(note || "").includes("owner folders")
    && String(note || "").includes("Firebase Storage SDK")
    && String(note || "").includes("Generados")
    && String(note || "").includes("Otros")),
  "Las release notes deben conservar el listado de todos los owner folders para Generados/Otros."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Firebase Storage SDK")
    && String(note || "").includes("list-videos")
    && String(note || "").includes("list-audios")),
  "Las release notes deben conservar el listado directo por Firebase Storage SDK."
);
assert.ok(
  notes.some((note) => String(note || "").includes("podcaster-media-replacement")
    && String(note || "").includes("DOMContentLoaded")
    && String(note || "").includes("openSceneVideoSelectorModal")),
  "Las release notes deben conservar el fix de PodcasterMediaReplacement.openSceneVideoSelectorModal."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Home")
    && String(note || "").includes("Descargar MP4")
    && String(note || "").includes("montageExportHistory")),
  "Las release notes deben conservar el select Descargar MP4 de Home."
);
assert.ok(
  notes.some((note) => String(note || "").includes("export-v2")
    && String(note || "").includes("payload")
    && String(note || "").includes("413")),
  "Las release notes deben conservar el fix del payload 413 de export-v2."
);
assert.ok(
  notes.some((note) => String(note || "").includes("podcaster-chat-assistant")
    && String(note || "").includes("podcaster.js")
    && String(note || "").includes("renderChat")),
  "Las release notes deben conservar el fix del orden de carga del chat assistant."
);
assert.ok(
  notes.some((note) => String(note || "").includes("trimWords")),
  "Las release notes deben conservar el fix de trimWords del script generator."
);
assert.ok(
  notes.some((note) => String(note || "").includes("Firestore SDK")),
  "Las release notes deben conservar el fix de sesiones por Firestore directo."
);
assert.ok(
  notes.some((note) => String(note || "").includes("same-origin")),
  "Las release notes deben conservar el fix de same-origin."
);
assert.ok(
  notes.some((note) => String(note || "").includes("job_not_found")),
  "Las release notes deben conservar el fix de retry tolerante para job_not_found."
);

console.log("public version.json bumped OK.");
