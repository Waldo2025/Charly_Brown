import test from "node:test";
import assert from "node:assert/strict";

import {
  hostTier,
  hostRamGb,
  planLocalRender,
  calibrateK,
  ffmpegArgsForOutput,
  upscaleTargetForTier,
  K_SECONDS_PER_PIXEL_FRAME_STEP,
  ENGINE_ARTIFACTS,
  engineArtifactById,
  BASE_ENGINE_ID,
  QUALITY_PRESETS,
  selectArtifactForPreset,
  SMOOTH_OUTPUT_FPS,
} from "../comfy-client.mjs";

const g8 = hostTier(8);
const g16 = hostTier(16);
const big = hostTier(32);
const TURBO = engineArtifactById("wan22-max-turbo");

test("los perfiles de memoria separan 8 GB, 16 GB y equipos grandes", () => {
  assert.equal(g8.id, "8gb");
  assert.equal(g16.id, "16gb");
  assert.equal(big.id, "grande");
  assert.equal(hostTier(20).id, "16gb");
  assert.equal(hostTier(26).id, "grande");
  assert.equal(upscaleTargetForTier(g8), 1280, "un Mac de 8 GB entrega 720p");
  assert.equal(upscaleTargetForTier(g16), 1920, "un Mac de 16 GB entrega 1080p");
});

test("PODCASTER_LOCAL_VIDEO_TOTALMEM permite probar otro Mac", (t) => {
  const real = hostRamGb();
  process.env.PODCASTER_LOCAL_VIDEO_TOTALMEM = String(8 * 1024 ** 3);
  try {
    assert.equal(hostRamGb(), 8);
    assert.equal(hostTier().id, "8gb");
  } finally {
    process.env.PODCASTER_LOCAL_VIDEO_TOTALMEM = "";
    delete process.env.PODCASTER_LOCAL_VIDEO_TOTALMEM;
  }
  assert.equal(hostRamGb(), real);
  t.diagnostic("RAM real del equipo de pruebas: " + real + " GB");
});

test("16 GB · 8 s · Equilibrado: 640 px, 12 fps y pasos de sobra en su presupuesto", () => {
  const plan = planLocalRender({ durationSec: 8, tier: g16 });
  assert.equal(Math.max(plan.width, plan.height), 640, "la calidad se compra con pasos, no con píxeles");
  assert.equal(plan.fps, 12);
  assert.ok(plan.steps >= 8 && plan.steps <= 20, `pasos: ${plan.steps}`);
  assert.ok(plan.durationSec >= 7.5, `pidió 8 s y el plan hace ${plan.durationSec}s`);
  assert.ok(plan.estimatedSeconds <= plan.budgetMinutes * 60, "no puede prometer más tiempo del presupuesto");
  assert.equal(plan.overBudget, false);
  assert.equal(plan.note, "");
});

// 640 px es el techo del modelo base: lo compran Equilibrado y Máximo con pasos.
// El Turbo (704 px) vive solo en Rápido y se prueba abajo, con su propio artefacto.
test("subir a Máximo nunca pasa del techo de 640 px en 16 GB", () => {
  const plan = planLocalRender({ durationSec: 8, budgetMinutes: 90, tier: g16 });
  assert.ok(Math.max(plan.width, plan.height) <= g16.longEdge);
  assert.equal(plan.engineId, BASE_ENGINE_ID, "Máximo es el modelo base con más pasos, no el Turbo");
  const equilibrado = planLocalRender({ durationSec: 8, tier: g16 });
  assert.ok(plan.steps > equilibrado.steps, "los minutos extra van a pasos");
});

// Rápido sin Turbo todavía instalado: recorta minutos, nunca resolución.
test("bajar a Rápido recorta el tiempo, no la resolución", () => {
  const plan = planLocalRender({ durationSec: 8, budgetMinutes: 20, tier: g16 });
  assert.equal(Math.max(plan.width, plan.height), 640);
  assert.ok(plan.estimatedSeconds <= 20 * 60 || plan.steps >= 6, `estimado ${plan.estimatedSeconds}s`);
  assert.ok(plan.estimatedMinutes <= 21, `Rápido no puede irse a ${plan.estimatedMinutes} min`);
});

test("8 GB entra con 512 px y sin pasarse de su memoria", () => {
  for (const minutes of [20, 60, 90]) {
    const plan = planLocalRender({ durationSec: 8, budgetMinutes: minutes, tier: g8 });
    assert.ok(Math.max(plan.width, plan.height) <= 512, `${plan.width}x${plan.height} excede el techo de 8 GB`);
    assert.ok(plan.lengthFrames * plan.width * plan.height <= g8.pixelFramesCap, "pide más memoria de la que hay");
    assert.ok(plan.steps >= 6 && plan.steps <= 20);
    assert.ok(plan.estimatedMinutes > 0);
  }
});

test("todo lo que sale del planificador es válido para Wan 2.2", () => {
  for (const tier of [g8, g16, big]) {
    for (const artifact of ENGINE_ARTIFACTS) {
      for (const seconds of [2, 4, 8]) {
        for (const portrait of [false, true]) {
          const plan = planLocalRender({ durationSec: seconds, portrait, tier, artifact });
          // Wan 2.2 codifica en bloques de 32 px (VAE 16× y parche 2×): un lado que
          // no divida entre 32 hace fallar a ComfyUI, así que nunca se planea.
          assert.equal(plan.width % 32, 0, `${tier.id}/${artifact.id} ${plan.width}`);
          assert.equal(plan.height % 32, 0, `${tier.id}/${artifact.id} ${plan.height}`);
          assert.equal((plan.lengthFrames - 1) % 4, 0, "los frames tienen que ser 4n+1");
          if (portrait) assert.ok(plan.height >= plan.width, "vertical debe ser más alto que ancho");
          else assert.ok(plan.width >= plan.height, "horizontal debe ser más ancho que alto");
        }
      }
    }
  }
});

test("el equipo sin memoria suficiente recorta la escena y lo dice", () => {
  const tiny = { ...g8, pixelFramesCap: 1000, budgetMinutes: 60 };
  const plan = planLocalRender({ durationSec: 8, tier: tiny });
  assert.equal(plan.overBudget, true);
  assert.match(plan.note, /memoria/i);
  assert.ok(plan.lengthFrames <= 65, "no puede prometer 8 s en un equipo que no las aguanta");
});

test("ffmpeg reescala a 1080p con lanczos y afina, sin tocar la difusión", () => {
  const args = ffmpegArgsForOutput({ nativeWidth: 640, nativeHeight: 352, targetLongEdge: 1920 });
  const vf = args[args.indexOf("-vf") + 1];
  assert.match(vf, /^scale=1920:1056:flags=lanczos,/);
  assert.match(vf, /unsharp=/);
  assert.ok(args.includes("libx264") && args.includes("yuv420p"));
  assert.equal(args[args.indexOf("-crf") + 1], "18");

  const vertical = ffmpegArgsForOutput({ nativeWidth: 352, nativeHeight: 640, targetLongEdge: 1920 });
  assert.match(vertical[vertical.indexOf("-vf") + 1], /^scale=1056:1920:/);

  // 8 GB sube a 720p exactos desde 512×288.
  const from8Gb = ffmpegArgsForOutput({ nativeWidth: 512, nativeHeight: 288, targetLongEdge: upscaleTargetForTier(g8) });
  assert.match(from8Gb[from8Gb.indexOf("-vf") + 1], /^scale=1280:720:/);

  // Si ya saliera a 1080p, no escala (y sigue transcodificando para normalizar).
  const already = ffmpegArgsForOutput({ nativeWidth: 1920, nativeHeight: 1080, targetLongEdge: 1920 });
  assert.equal(already.includes("-vf"), false);
});

test("el coste por paso se recalibra con el tiempo real (media móvil)", () => {
  const base = K_SECONDS_PER_PIXEL_FRAME_STEP;
  const plan = { lengthFrames: 97, width: 640, height: 352, steps: 11 };
  // El modelo promete ~39 min para ese plan; una escena real de 80 min debe subir la constante.
  const slow = calibrateK({ ...plan, secondsElapsed: 4800 }, base);
  assert.ok(slow > base, "un Mac lento debe estimar más minutos la próxima vez");
  assert.ok(slow < base * 3, "la media móvil no puede dispararse con una sola medición");

  const fast = calibrateK({ ...plan, secondsElapsed: 600 }, slow);
  assert.ok(fast < slow, "y un Mac rápido debe bajarla");

  assert.equal(calibrateK({ ...plan, secondsElapsed: 0 }, base), base);
  assert.equal(calibrateK({ ...plan, lengthFrames: 0, secondsElapsed: 1200 }, base), base);
  assert.ok(calibrateK({ lengthFrames: 17, width: 160, height: 160, steps: 6, secondsElapsed: 1e9 }, base) <= 1e-3, "topada");
});

test("el presupuesto elegido se acota a algo razonable", () => {
  assert.equal(planLocalRender({ budgetMinutes: 1, tier: g16 }).budgetMinutes, 5);
  assert.equal(planLocalRender({ budgetMinutes: 9999, tier: g16 }).budgetMinutes, 240);
  assert.equal(planLocalRender({ budgetMinutes: undefined, tier: g16 }).budgetMinutes, g16.budgetMinutes);
});

test("Rápido con Turbo: los minutos que liberan los 4 pasos se pagan en píxeles", () => {
  const plan = planLocalRender({ durationSec: 8, budgetMinutes: 20, tier: g16, artifact: TURBO });
  assert.equal(plan.engineId, TURBO.id);
  assert.equal(Math.max(plan.width, plan.height), 704, `704 px de lado largo, no ${plan.width}×${plan.height}`);
  assert.ok(plan.steps >= 4 && plan.steps <= 6, `un modelo destilado no pasa de 6 pasos: ${plan.steps}`);
  assert.ok(plan.durationSec >= 7.5, `pidió 8 s y el plan hace ${plan.durationSec} s`);
});

test("la escalera pone el Turbo solo en Rápido, y nunca en un Mac de 8 GB", () => {
  const conTurbo = { [BASE_ENGINE_ID]: { installed: true }, [TURBO.id]: { installed: true } };
  const sinTurbo = { [BASE_ENGINE_ID]: { installed: true }, [TURBO.id]: { installed: false } };
  assert.equal(selectArtifactForPreset("rapido", conTurbo, g16).artifact.id, TURBO.id);

  const ocho = selectArtifactForPreset("rapido", conTurbo, g8);
  assert.equal(ocho.artifact.id, BASE_ENGINE_ID, "8 GB no aguanta 704 px ni con el VAE por mosaicos");
  assert.match(ocho.fallbackNote, /8 GB/);

  const pendiente = selectArtifactForPreset("rapido", sinTurbo, g16);
  assert.equal(pendiente.artifact.id, BASE_ENGINE_ID, "sin Turbo descargado, Rápido sigue siendo útil");
  assert.match(pendiente.fallbackNote, /Descargar Rápido Turbo/);

  for (const preset of QUALITY_PRESETS.filter((p) => p.id !== "rapido")) {
    assert.equal(selectArtifactForPreset(preset.id, conTurbo, g16).artifact.id, BASE_ENGINE_ID,
      `${preset.label} compra pasos, no el Turbo`);
  }
});

test("movimiento suave: mezcla a 24 fps antes de agrandar, y nada cambia sin interruptor", () => {
  const suave = ffmpegArgsForOutput({ nativeWidth: 640, nativeHeight: 352, targetLongEdge: 1920, fps: SMOOTH_OUTPUT_FPS });
  assert.equal(suave[suave.indexOf("-vf") + 1],
    `minterpolate=fps=${SMOOTH_OUTPUT_FPS}:mi_mode=blend,scale=1920:1056:flags=lanczos,unsharp=5:5:0.8:5:5:0.0`,
    "la cadencia va primero: cuesta menos sobre el cuadro chico");

  const normal = ffmpegArgsForOutput({ nativeWidth: 640, nativeHeight: 352, targetLongEdge: 1920 });
  assert.ok(!normal[normal.indexOf("-vf") + 1].includes("minterpolate"), "sin interruptor no se re-muestrea");
});
