import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const stopMotion = require("../public/podcaster/podcaster-stop-motion.js");
const stopMotionBeats = require("../public/podcaster/podcaster-stop-motion-beats.js");
const { validateMontageExportPreflight } = require("../backend/montage-export/preflight-validation.js");

function buildFrames(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `frame-${index + 1}`,
    name: `Imagen ${index + 1}`,
    mimeType: "image/png",
    downloadUrl: `https://example.test/frame-${index + 1}.png`
  }));
}

test("distribuye ocho imágenes uniformemente en ocho segundos", () => {
  const sequence = stopMotion.normalizeStopMotion({ frames: buildFrames(8) });
  assert.equal(stopMotion.resolveStopMotionIntervalMs(8000, 8), 1000);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 0, 8000).index, 0);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 999, 8000).index, 0);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 1000, 8000).index, 1);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 7999, 8000).index, 7);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 8000, 8000).index, 7);
});

test("recalcula el intervalo cuando la escena se recorta", () => {
  const sequence = stopMotion.normalizeStopMotion({ frames: buildFrames(8) });
  assert.equal(stopMotion.resolveStopMotionIntervalMs(4000, 8), 500);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 499, 4000).index, 0);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 500, 4000).index, 1);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 3500, 4000).index, 7);
});

test("normaliza orden, exige dos imágenes y limita la secuencia a sesenta", () => {
  assert.equal(stopMotion.normalizeStopMotion({ frames: buildFrames(1) }), null);
  const sequence = stopMotion.normalizeStopMotion({ frames: buildFrames(65).reverse() });
  assert.equal(sequence.frames.length, 60);
  assert.deepEqual(sequence.frames.map((frame) => frame.order), Array.from({ length: 60 }, (_, index) => index));
});

test("el contrato integra persistencia, playback y una sola cadena de movimiento backend", () => {
  const replacement = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
  const exportSource = readFileSync(new URL("../public/podcaster/podcaster-montage-export.js", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");

  assert.match(replacement, /mediaData\.stopMotion\s*=\s*\{/);
  assert.match(replacement, /timingMode:\s*stopMotionTimingMode/);
  assert.match(playback, /resolveStopMotionEntryAtMs\(entry,\s*currentMs\)/);
  assert.match(playback, /const preserveVisibleFrame = Boolean\(entry\?\.stopMotionFrame\)/);
  assert.match(exportSource, /stopMotion:\s*window\.PodcasterStopMotion\?\.normalizeStopMotion/);
  assert.match(backend, /buildMontageStopMotionInputVideo/);
  assert.match(backend, /concat=n=\$\{normalized\.frames\.length\}:v=1:a=0/);
  assert.match(backend, /buildMontageImageMotionVideoFilter\(\{/);
});

test("playback rehidrata stop motion desde todas las formas de sesión usadas por Snoopy y video-player", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    ...(previousWindow || {}),
    PodcasterStopMotion: stopMotion
  };
  try {
    await import("../public/podcaster/podcaster-text-render.js");
    const { PodcasterPlaybackController } = await import("../public/podcaster/podcaster-playback-controller.js");
    const sequence = { version: 1, timingMode: "fit-scene", frames: buildFrames(3) };
    const controller = new PodcasterPlaybackController();

    controller.state.session = {
      session: {
        dialogueVideoMap: {
          "row-nested": { type: "image", stopMotion: sequence }
        }
      }
    };
    assert.equal(controller.resolveEntryStopMotion({ rowId: "row-nested" })?.frames.length, 3);

    controller.state.session = {};
    assert.equal(controller.resolveEntryStopMotion({
      rowId: "row-runtime",
      video: { stopMotion: sequence }
    })?.frames.length, 3);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("preflight acepta secuencias completas y señala el frame exacto que falta", () => {
  const base = {
    sessionId: "session-1",
    exportMode: "normal",
    format: "mp4_h264",
    resolution: "720p",
    renderMode: "browser",
    entries: [{
      rowId: "row-1",
      sceneIndex: 1,
      timelineStartMs: 0,
      timelineEndMs: 4000,
      durationMs: 4000,
      video: {
        type: "image",
        stopMotion: { frames: buildFrames(2) }
      }
    }]
  };
  assert.equal(validateMontageExportPreflight(base).ok, true);
  const invalid = structuredClone(base);
  invalid.entries[0].video.stopMotion.frames[1].downloadUrl = "";
  const result = validateMontageExportPreflight(invalid);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "missing_stop_motion_frame_source");
  assert.equal(result.issues[0].path, "entries.0.video.stopMotion.frames.1");
});

test("los nombres Unicode se serializan como headers ASCII y el backend los recupera", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  const uploader = readFileSync(new URL("../public/podcaster/podcaster-resumable-upload.js", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
  const originalName = "niño 🎬 final.png";
  const encodedName = encodeURIComponent(originalName);
  const headers = new Headers({ "X-File-Name": encodedName });

  assert.equal(decodeURIComponent(headers.get("X-File-Name")), originalName);
  assert.match(source, /uploadPodcasterAsset\(uploadFile,/);
  assert.match(uploader, /"X-File-Name":\s*encodeURIComponent\(fileName\)/);
  assert.match(backend, /decodedFileName = decodeURIComponent\(encodedFileName\)/);
});

test("las imágenes locales se limpian y redimensionan antes de subirlas", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  assert.match(source, /import\s*\{\s*optimizeRasterImage\s*\}/);
  assert.match(source, /targetWidth:\s*1280/);
  assert.match(source, /forceReencode:\s*true/);
  assert.match(source, /uploadPodcasterAsset\(uploadFile,/);
});

test("el modal rehidrata una secuencia existente y sus controles de movimiento", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  assert.match(source, /function\s+hydrateExistingStopMotion\s*\(/);
  assert.match(source, /dialogueVideoMap\?\.\[key\]\?\.stopMotion/);
  assert.match(source, /setReplacementImageMode\("stop-motion"\)/);
  assert.match(source, /function\s+hydrateMovementControls\s*\(/);
  assert.match(source, /visualEffectsMap\?\.\[key\]/);
  assert.match(source, /const restoredStopMotion = hydrateExistingStopMotion\(currentEditingRowId,\s*session\)/);
  // La rehidratación debe aceptar todas las formas de sesión y conservar el ritmo.
  assert.match(source, /podcastStudioUiState\?\.dialogueVideosByRowId\?\.\[key\]\?\.stopMotion/);
  assert.match(source, /buildTimelineRuntimeEntries\(activeSession\)/);
  assert.match(source, /normalizeStopMotion\?\.\(\s*resolvePersistedStopMotion\(key,\s*activeSession\)\s*\)/);
  assert.match(source, /if\s*\(restoredStopMotion\)\s*\{[\s\S]{0,220}?setReplacementSectionTab\("format"\)/);
  assert.match(source, /frameWeights:\s*normalizeStopMotionFrameWeightsForPersistence|const frameWeights = normalizeStopMotionFrameWeightsForPersistence\(\)/);
});

test("un fallo de subida descarta el recurso anterior y bloquea la confirmación", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  // Las subidas van serializadas, así que las variables de "último archivo"
  // pertenecen al intento que falló. Dejarlas llenas hacía aplicar la subida
  // previa y el guardado terminaba en "ruta de almacenamiento válida" o
  // "archivo no está disponible todavía", seguido de "Se seleccionó otro recurso".
  const catchBlock = source.match(/Exception in FilePond upload process:[\s\S]{0,900}?if \(stopMotionFrameId\) \{/);
  assert.ok(catchBlock, "el manejo de error de FilePond debe existir");
  assert.equal((catchBlock[0].match(/uploaded(?:MediaUrl|StoragePath|MediaType) = null;/g) || []).length, 3);
  assert.match(source, /El archivo no terminó de subirse\. Reintenta la subida antes de confirmar el reemplazo\./);
  assert.match(source, /El archivo no quedó guardado en la nube\. Vuelve a subirlo y luego confirma el reemplazo\./);
  assert.doesNotMatch(source, /if \(!mediaUrl \|\| !currentEditingRowId\) \{/);
  // Cada frame de stop motion es un objeto nuevo: pasar la subida anterior como
  // reemplazo hacía que el backend borrara el archivo de otro frame (404 al
  // cargar la escena). El backend además sólo borra rutas de la propia sesión.
  assert.match(source, /previousStoragePath: isStopMotionMode\(\) \? "" : String\(uploadedStoragePath \|\| ""\)\.trim\(\)/);
  const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
  assert.match(backend, /podcaster\/sessions\/\$\{sessionSlug\}\//);
});

test("un reemplazo manual adopta la revisión remota de la escena", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  const podcaster = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
  // El archivo se subó y confirmó en este momento, así que la selección remota
  // pasa a ser la base. Sin esto, una escena cuya copia local divergió de la nube
  // queda rechazada para siempre con "Otra edición cambió esta escena…".
  assert.match(source, /context\.manualReplacement = true;/);
  assert.equal((podcaster.match(/manualReplacement === true/g) || []).length, 1);
  assert.match(podcaster, /if \(adoptRemoteBase \|\| !Number\.isFinite\(cloudRowMs\)/);
  // La generación asíncrona (Veo, voz) puede terminar tarde sobre una selección
  // más nueva: conservaba el descarte estricto.
  const generationCommit = podcaster.slice(
    podcaster.indexOf("async function persistLatestDialogueVideoForRow"),
    podcaster.indexOf("window.PodcasterSceneMedia =")
  );
  assert.ok(generationCommit.length > 0);
  assert.doesNotMatch(generationCommit, /manualReplacement/);
});

test("sincroniza todos los frames con golpes musicales conservando el orden", () => {
  const frames = buildFrames(4);
  const beatPositions = stopMotionBeats.selectOrderedBeatPositions([900, 2100, 3100], 4000, frames.length);
  assert.deepEqual(beatPositions, [0, 0.225, 0.525, 0.775]);
  const sequence = stopMotion.normalizeStopMotion({
    timingMode: "music-beat",
    beatPositions,
    frames
  });
  assert.equal(sequence.timingMode, "music-beat");
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 899, 4000).index, 0);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 900, 4000).index, 1);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 2100, 4000).index, 2);
  assert.equal(stopMotion.resolveStopMotionFrame(sequence, 3999, 4000).index, 3);
});

test("detecta golpes reales en una forma de onda y los distribuye en la escena", () => {
  const sampleRate = 1000;
  const samples = new Float32Array(4000);
  [900, 2100, 3100].forEach((start) => {
    for (let index = start; index < start + 60; index += 1) samples[index] = 1;
  });
  const audioBuffer = {
    sampleRate,
    numberOfChannels: 1,
    duration: 4,
    getChannelData: () => samples
  };
  const result = stopMotionBeats.analyzeAudioBuffer(audioBuffer, {
    durationMs: 4000,
    frameCount: 4
  });
  assert.equal(result.peaksMs.length, 3);
  assert.equal(result.beatPositions.length, 4);
  assert.ok(result.beatPositions[1] > 0.20 && result.beatPositions[1] < 0.24);
  assert.ok(result.beatPositions[2] > 0.50 && result.beatPositions[2] < 0.54);
  assert.ok(result.beatPositions[3] > 0.74 && result.beatPositions[3] < 0.79);
});

test("editor, persistencia temporal y export respetan el mapa musical", () => {
  const replacement = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  const jobStore = readFileSync(new URL("../backend/montage-export/job-store-firestore.js", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
  assert.match(html, /id="stopMotionSyncToMusic"/);
  assert.match(replacement, /beatPositions:\s*stopMotionBeatPositions/);
  assert.match(jobStore, /timingMode:[\s\S]*?"music-beat"[\s\S]*?beatPositions:/);
  assert.match(backend, /const frameDurationsSec = normalized\.timingMode === "music-beat"/);
  assert.match(backend, /frameDurationsSec\[index\]\.toFixed\(6\)/);
});

test("las etiquetas Ken Burns traducen correctamente la dirección percibida", () => {
  const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
  assert.match(html, /data-effect="pan-right"[^>]*>.*Izq a Der/);
  assert.match(html, /data-effect="pan-left"[^>]*>.*Der a Izq/);
  assert.match(html, /data-effect="pan-down"[^>]*>.*Abajo a Arriba/);
  assert.match(html, /data-effect="pan-up"[^>]*>.*Arriba a Abajo/);
  assert.match(html, /data-effect="zoom-in"[^>]*>.*Zoom In/);
  assert.match(html, /data-effect="zoom-out"[^>]*>.*Zoom Out/);
});

test("video-player usa el mismo recorrido Ken Burns completo que el editor", () => {
  const player = readFileSync(new URL("../public/video-player.html", import.meta.url), "utf8");
  const home = readFileSync(new URL("../public/js/home.js", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
  const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
  assert.match(player, /data-cache-href="podcaster\.css(\?[^"]*)?"/);
  assert.match(player, /data-cache-src="podcaster\/podcaster-scene-media-render-spec\.js/);
  assert.match(player, /data-cache-src="js\/home\.js\?rev=/);
  assert.match(home, /podcaster-playback-controller\.js\?v=/);
  assert.match(home, /podcaster-scene-media-render-spec\.js/);
  assert.match(playback, /"--kb-pan-start-y"/);
  assert.match(playback, /"--kb-pan-end-y"/);
  assert.match(playback, /entry\?\.video\?\.stopMotion/);
  assert.match(home, /function\s+resolveStorageVideoUrl\s*\(/);
  assert.match(home, /buildDirectFirebaseMediaReference\(/);
  assert.match(editor, /treatAsImage \|\| hasImageExt \? "image" : "media"/);
});

test("el nodo visible recibe la geometría Ken Burns y el modal rehidrata una imagen individual", () => {
  const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
  const replacement = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
  assert.match(playback, /requestImageStageSwap\(entry[\s\S]*?applyEntryVisualStateToSurface\(entry,\s*(?:imageEl|targetImage)\)/);
  assert.match(playback, /shouldRestartKenBurns[\s\S]*?(?:imageEl|targetImage)\.style\.animation = "none"/);
  assert.match(playback, /sceneMediaKenBurnsAnimationKey/);
  assert.match(replacement, /function\s+hydrateExistingSingleMedia\s*\(/);
  assert.match(replacement, /normalizeExistingSceneMedia\(rowId,\s*session\)/);
  assert.match(replacement, /const restoredSingleMedia = !restoredStopMotion && hydrateExistingSingleMedia/);
  assert.match(html, /id="sceneExistingMediaSelection"/);
  assert.match(html, /id="removeSceneExistingMediaBtn"/);
});

test("el reemplazo no descarta la selección cuando la edición local va adelantada a la nube", () => {
  const editor = readFileSync(new URL("../public/podcaster/podcaster.js", import.meta.url), "utf8");
  const store = readFileSync(new URL("../public/podcaster/podcaster-session-store.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");

  // Transacción de la nube: la fila local más nueva es la base válida, porque el
  // autoguardado va en retraso y su revisión propia no es un cambio remoto.
  assert.match(editor, /preferNewerLocalMediaEntry\(cloudSession|const cloudBase = preferNewerLocalMediaEntry/);
  assert.match(editor, /selectSceneMedia\(cloudBase,\s*rowId,\s*clip,\s*context\)/);
  // Escritura local posterior: si la revisión se movió durante la hidratación,
  // se reintenta con esa revisión en vez de dejar el video anterior en pantalla.
  assert.match(editor, /selection\.reason !== "selection-changed"[\s\S]*?baseRevision: podcasterMediaState\.mediaRevision\(/);
  // Conflicto real con la nube: si la selección remota es más antigua que el
  // recurso recién creado, se reintenta dentro de la misma transacción usando su
  // revisión como base (la caché local puede ir retrasada por el autoguardado).
  assert.match(editor, /committed\.reason === "selection-changed"[\s\S]*?baseRevision: cloudClipRevision/);
  // Refresh de la nube: fusiona por updatedAt con tombstones; reemplazar el mapa
  // a ciegas borraba el stop motion recién subido.
  assert.match(store, /replaceLocalSessionFromCloud[\s\S]*?reconcileSessionMedia\(previousLocal, cloudSession\)/);
  // Vincular videos desde Storage no pisa una escena con fotos manuales.
  assert.match(editor, /hasManualPhotos/);
  // El escenario del editor usa el swap interno de imagen (doble slot) y el
  // fotograma que corresponde al cursor, sin depender del módulo diferido.
  const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
  assert.match(playback, /if \(isImageStageClip\)[\s\S]{0,2000}?resolveStopMotionEntryAtMs\([\s\S]*?requestImageStageSwap\([\s\S]*?return;\s*\}/);
  assert.doesNotMatch(playback, /window\.swapStageToImagePreview|window\.hideStageImagePreview/);
  // Chip dividido: la gate lee el mapa normalizado y el chip sólo pinta
  // divisiones. Meter miniaturas obligaba a hidratar N recursos privados en
  // cada refresco del timeline (y un src crudo devuelve 403 en Storage).
  const timelineUi = readFileSync(new URL("../public/podcaster/podcaster-timeline-ui.js", import.meta.url), "utf8");
  assert.match(timelineUi, /normalizeStopMotion\?\.\(dialogueMap\[rowId\]\?\.stopMotion \|\| null\)/);
  assert.match(timelineUi, /class="podcast-stop-motion-segment"[\s\S]{0,240}?reordenar"><\/div>/);
  assert.doesNotMatch(timelineUi, /class="podcast-stop-motion-segment"[\s\S]{0,240}?<img/);
  assert.match(html, /podcaster\.js\?rev=/);
});

test("las miniaturas blob sólo se revocan después de retirarlas del DOM", () => {
  const replacement = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  assert.match(
    replacement,
    /stopMotionFrames = stopMotionFrames\.filter[\s\S]*?renderStopMotionTray\(\);\s*releaseDetachedObjectUrl\(detachedPreviewUrl\)/,
    "Quitar un frame debe renderizar primero y revocar después."
  );
  assert.match(
    replacement,
    /stopMotionFrames = \[\][\s\S]*?renderStopMotionTray\(\);\s*detachedPreviewUrls\.forEach\(releaseDetachedObjectUrl\)/,
    "Vaciar la secuencia debe desacoplar todos los img antes de revocar sus blobs."
  );
  assert.match(
    replacement,
    /previewUrl:\s*resolveReplacementPreviewUrl\(uploadedMediaUrl,\s*uploadedStoragePath\)[\s\S]*?renderStopMotionTray\(\);\s*releaseDetachedObjectUrl\(detachedPreviewUrl\)/,
    "Una carga terminada debe sustituir el blob por la URL persistente antes de liberarlo."
  );
});
