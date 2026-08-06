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
  const backend = readFileSync(new URL("../backend/server.js", import.meta.url), "utf8");
  const originalName = "niño 🎬 final.png";
  const encodedName = encodeURIComponent(originalName);
  const headers = new Headers({ "X-File-Name": encodedName });

  assert.equal(decodeURIComponent(headers.get("X-File-Name")), originalName);
  assert.match(source, /"X-File-Name":\s*encodeHttpHeaderValue\(uploadFile\.name,\s*"scene-media"\)/);
  assert.match(backend, /decodedFileName = decodeURIComponent\(encodedFileName\)/);
});

test("las imágenes locales se limpian y redimensionan antes de subirlas", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  assert.match(source, /import\s*\{\s*optimizeRasterImage\s*\}/);
  assert.match(source, /targetWidth:\s*1280/);
  assert.match(source, /forceReencode:\s*true/);
  assert.match(source, /body:\s*uploadFile/);
});

test("el modal rehidrata una secuencia existente y sus controles de movimiento", () => {
  const source = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  assert.match(source, /function\s+hydrateExistingStopMotion\s*\(/);
  assert.match(source, /dialogueVideoMap\?\.\[key\]\?\.stopMotion/);
  assert.match(source, /setReplacementImageMode\("stop-motion"\)/);
  assert.match(source, /function\s+hydrateMovementControls\s*\(/);
  assert.match(source, /visualEffectsMap\?\.\[key\]/);
  assert.match(source, /const restoredStopMotion = hydrateExistingStopMotion\(currentEditingRowId,\s*session\)/);
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
  const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
  assert.match(player, /data-cache-href="podcaster\.css"/);
  assert.match(player, /data-cache-src="podcaster\/podcaster-scene-media-render-spec\.js"/);
  assert.match(player, /data-cache-src="podcaster\/podcaster-playback-controller\.js"/);
  assert.match(home, /podcaster-playback-controller\.js\?v=2026-1\.0\.10\.559/);
  assert.match(home, /podcaster-scene-media-render-spec\.js\?v=2026-1\.0\.10\.559/);
  assert.match(playback, /"--kb-pan-start-y"/);
  assert.match(playback, /"--kb-pan-end-y"/);
  assert.match(playback, /entry\?\.video\?\.stopMotion/);
  assert.match(home, /resolveStorageVideoUrl:\s*\(url,\s*path,\s*options = \{\}\)/);
  assert.match(home, /const endpoint = treatAsImage \|\| hasImageExt \? "proxy-image" : "proxy-media"/);
  assert.match(home, /cachedRuntimeVideoMapRef === videoMap/);
});

test("el nodo visible recibe la geometría Ken Burns y el modal rehidrata una imagen individual", () => {
  const playback = readFileSync(new URL("../public/podcaster/podcaster-playback-controller.js", import.meta.url), "utf8");
  const replacement = readFileSync(new URL("../public/podcaster/podcaster-media-replacement.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/podcaster.html", import.meta.url), "utf8");
  assert.match(playback, /requestImageStageSwap\(entry[\s\S]*?applyEntryVisualStateToSurface\(entry,\s*imageEl\)/);
  assert.match(playback, /shouldRestartKenBurns[\s\S]*?imageEl\.style\.animation = "none"/);
  assert.match(playback, /sceneMediaKenBurnsAnimationKey/);
  assert.match(replacement, /function\s+hydrateExistingSingleMedia\s*\(/);
  assert.match(replacement, /normalizeExistingSceneMedia\(rowId,\s*session\)/);
  assert.match(replacement, /const restoredSingleMedia = !restoredStopMotion && hydrateExistingSingleMedia/);
  assert.match(html, /id="sceneExistingMediaSelection"/);
  assert.match(html, /id="removeSceneExistingMediaBtn"/);
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
