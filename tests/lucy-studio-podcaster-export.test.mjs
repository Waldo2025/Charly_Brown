import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("assets-store.js uses uploadBytes and never calls uploadString", async () => {
  const content = await source("public/imagecreator/assets-store.js");

  // Debe usar uploadBytes y getDownloadURL
  assert.match(content, /uploadBytes/);
  assert.match(content, /getDownloadURL/);

  // NO debe importar ni utilizar uploadString (que fallaba con storage/invalid-format)
  assert.doesNotMatch(content, /uploadString/);

  // Debe contar con la función toBlob para convertir de forma robusta
  assert.match(content, /async function toBlob/);
});

test("scene-blob-store.js sanitizes base64 and handles newlines without throwing", async () => {
  const content = await source("public/imagecreator/scene-blob-store.js");

  // dataUrlToBlob debe limpiar espacios y saltos de línea
  assert.match(content, /replace\(\/\\s\+\/g,\s*""\)/);
  assert.match(content, /export async function dataUrlToBlob/);
});

test("video-script-workflow.js implements Podcaster export with active session proposal and recent list", async () => {
  const content = await source("public/imagecreator/video-script-workflow.js");

  // 1. Detección y limpieza de cuota en localStorage
  assert.match(content, /cleanupLegacyLocalStorageBloat/);
  assert.match(content, /lucy_studio_cache_/);

  // 2. No almacena base64 en localStorage en cacheSceneImage
  assert.match(content, /cacheSceneImage\(index = 0, result = \{\}\)/);
  assert.doesNotMatch(content, /localStorage\.setItem\([^)]*dataUrl:\s*result\.dataUrl/);

  // 3. Flujo de exportación: busca sesión activa y recientes
  assert.match(content, /cb_podcaster_active_session_id_v1/);
  assert.match(content, /podcaster_sessions/);
  assert.match(content, /ic-podcaster-active-card/);
  assert.match(content, /icExportToActiveBtn/);
  assert.match(content, /Cargar imágenes a esta sesión abierta/);

  // 4. Lista de sesiones recientes y creación de nueva
  assert.match(content, /ic-podcaster-session-list/);
  assert.match(content, /icExportCreateNewSessionBtn/);
  assert.match(content, /Crear Nueva Sesión en Podcaster/);

  // 5. Mapeo canónico a Podcaster
  const transfer = await source("public/imagecreator/podcaster-reference-transfer.js");
  assert.match(transfer, /rowReferenceImageMap/);
  assert.match(transfer, /rowReferenceImageListMap/);
  assert.match(transfer, /rowReferenceModeByRowId/);
  assert.match(content, /podcaster\.html\?sessionId=/);

  // 6. Protección de cuota en payload puente
  assert.match(content, /PODCASTER_VIDEO_IMPORT_STORAGE_KEY/);
  assert.match(content, /try\s*\{\s*localStorage\.setItem\(PODCASTER_VIDEO_IMPORT_STORAGE_KEY/);
});

test("video-script-workflow.js shows completion view and podcaster button when reopening studio with all scenes approved", async () => {
  const content = await source("public/imagecreator/video-script-workflow.js");

  // Al abrir el estudio con todas aprobadas, debe invocar showCompletionInStudio
  assert.match(content, /const allApproved = totalCount > 0 && this\.currentScript\.scenes\.every\(\(_, idx\) => this\.sceneImages\[idx\]\?\.approved === true\);/);
  assert.match(content, /if \(allApproved\) \{\s*await this\.showCompletionInStudio\(\);/);

  // icStudioCompletionView debe tener botón para exportar a Podcaster y botón para ver la galería
  assert.match(content, /id="icStudioCompletionView"/);
  assert.match(content, /id="icStudioFinishExportBtn"/);
  assert.match(content, /id="icStudioCompletionToGalleryBtn"/);

  // El encabezado del modal debe tener botón permanente de exportación cuando todas están aprobadas
  assert.match(content, /id="icStudioHeaderExportBtn"/);
  assert.match(content, /headerExportBtn\.classList\.remove\("hidden"\)/);
});

test("video-script-workflow.js preserves the existing script and saves complete references", async () => {
  const content = await source("public/imagecreator/video-script-workflow.js");

  assert.match(content, /planPodcasterReferenceTransfer\(totalScenes, data\)/);
  assert.match(content, /currentPlan\.rowIds\.join/);
  assert.match(content, /buildPodcasterReferenceMaps/);
  assert.doesNotMatch(content, /"script\.rows": rows/);
  assert.match(content, /cb_podcaster_sessions_v2:\$\{uid\}/);
  assert.match(content, /Object\.assign\(local, savedMaps/);
});

test("backend/server.js exposes /api/assets/signed-url endpoint", async () => {
  const content = await source("backend/server.js");

  // Debe exponer la ruta /api/assets/signed-url
  assert.match(content, /app\.get\("\/api\/assets\/signed-url"/);
  assert.match(content, /getStorageBucketCandidatesForOptions/);
});
