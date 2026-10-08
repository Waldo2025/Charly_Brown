import { readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const LOCAL_VIDEO_MODEL_ID = "local-wan-2.2";

const GB = 1024 ** 3;
const MIN_RENDER_STEPS = 6;
const MAX_RENDER_STEPS = 20;

// Wan muestrea a 12 fps y a esa cadencia el movimiento va a saltos. La mezcla de
// pares en el afinado lo sube a 24 fps sin gastar un paso más de GPU.
export const SMOOTH_OUTPUT_FPS = 24;

// Coste medido en un Mac de 16 GB con Wan 2.2 Q4 y --cache-none: segundos de
// muestreo por cada (frame × píxel × paso). El daemon lo recalibra con el tiempo
// real de cada escena, así que un Mac de 8 GB ya estima bien desde la segunda.
export const K_SECONDS_PER_PIXEL_FRAME_STEP = 9.67e-6;

// Techo de resolución nativa por equipo: por encima de 640 px el muestreo se paga en
// horas, y la nitidez final se recupera reescalando con ffmpeg, no con más píxeles.
// pixelFramesCap es la memoria de trabajo (frames × píxeles) que cabe sin bloquearse.
const HOST_TIERS = [
  { id: "8gb", maxRamGb: 10, longEdge: 512, pixelFramesCap: 10e6, upscaleLongEdge: 1280, quant: "Q3_K_M", budgetMinutes: 60 },
  { id: "16gb", maxRamGb: 24, longEdge: 640, pixelFramesCap: 32e6, upscaleLongEdge: 1920, quant: "Q4_K_M", budgetMinutes: 40 },
  { id: "grande", maxRamGb: Infinity, longEdge: 832, pixelFramesCap: 60e6, upscaleLongEdge: 1920, quant: "full", budgetMinutes: 45 },
];

export function comfyModelsDir(comfyDir = process.env.COMFY_HOME || path.join(os.homedir(), "ComfyUI")) {
  return path.join(comfyDir, "models");
}

// ── Escalera de motores ──────────────────────────────────────────────────────
// Seguimos en Wan 2.2 TI2V-5B (Apache-2.0, gratis). Lo que cambia entre peldaños es
// el paquete: el Turbo está destilado a 4 pasos, así que el mismo presupuesto de
// minutos alcanza para muestrear más grande en vez de más pasos.
export const BASE_ENGINE_ID = "wan22-base-q4km";

const TURBO_UNET_BASE = "https://huggingface.co/hum-ma/Wan2.2-TI2V-5B-Turbo-GGUF/resolve/main";
const TURBO_CLIP_BASE = "https://huggingface.co/city96/umt5-xxl-encoder-gguf/resolve/main";

export const ENGINE_ARTIFACTS = [
  {
    id: BASE_ENGINE_ID,
    label: "Wan 2.2 5B (ligero, Q4)",
    stepsMin: MIN_RENDER_STEPS,
    stepsMax: MAX_RENDER_STEPS,
    // Valores que Wan 2.2 base necesita: sin guía y con pocos pasos se deforma.
    sampler: { cfg: 5.0, samplerName: "euler", scheduler: "simple", denoise: 1.0 },
    vaeDecodeClass: "VAEDecode",
    vaeTiled: false,
    longEdgeBonus: 0,
    // Cuántos pasos exige cada peldaño de fluidez para preferir 16/12/8 fps.
    prefer: { smooth: 12, fluid: 8, economical: 8 },
    requiredGb: 0,
    lazyDownload: false,
  },
  {
    id: "wan22-max-turbo",
    label: "Wan 2.2 5B Turbo (destilado, 4 pasos)",
    stepsMin: 4,
    stepsMax: 6,
    // Un modelo destilado se muestrea sin guidance: cfg > 1 arruina los 4 pasos.
    sampler: { cfg: 1.0, samplerName: "euler", scheduler: "simple", denoise: 1.0 },
    vaeDecodeClass: "VAEDecodeTiled",
    vaeTiled: true,
    // 640 → 704 px de lado largo, pagado con los minutos que liberan los 4 pasos.
    longEdgeBonus: 64,
    prefer: { smooth: 4, fluid: 4, economical: 4 },
    requiredGb: 7.7,
    lazyDownload: true,
    unetBase: TURBO_UNET_BASE,
    clipBase: TURBO_CLIP_BASE,
    unetCandidates: ["Wan2.2-TI2V-5B-Turbo-Q5_K_S.gguf", "Wan2.2-TI2V-5B-Turbo-Q4_K_M.gguf"],
    clipCandidates: ["umt5-xxl-encoder-Q5_K_M.gguf", "umt5-xxl-encoder-Q4_K_M.gguf"],
  },
];

export function engineArtifactById(id = "") {
  const key = String(id || "").trim();
  return ENGINE_ARTIFACTS.find((artifact) => artifact.id === key) || ENGINE_ARTIFACTS[0];
}

export const QUALITY_PRESETS = [
  // Rápido = Turbo: 4 pasos dejan presupuesto libre y eso se paga con más píxeles.
  { id: "rapido", minutes: 20, label: "Rápido", engineIds: ["wan22-max-turbo", BASE_ENGINE_ID] },
  // Equilibrado y Máximo = modelo base con más pasos. Turbo compra velocidad y tamaño
  // de cuadro, no belleza: un destilado de 4 pasos no supera al modelo bueno con 20.
  { id: "equilibrado", minutes: 40, label: "Equilibrado", engineIds: [BASE_ENGINE_ID] },
  { id: "maximo", minutes: 90, label: "Máximo", engineIds: [BASE_ENGINE_ID] },
];

export function qualityPresetByIdOrMinutes(idOrMinutes) {
  const key = String(idOrMinutes ?? "").trim();
  return QUALITY_PRESETS.find((preset) => preset.id === key)
    || QUALITY_PRESETS.find((preset) => preset.minutes === Number(key))
    || null;
}

function firstExisting(dir, names = []) {
  for (const name of names) {
    try {
      if (existsSync(path.join(dir, name))) return name;
    } catch { /* ruta ilegible: se toma como no instalada */ }
  }
  return null;
}

/**
 * Qué peldaños de la escalera están realmente en este Mac. Se comprueba el archivo,
 * no la configuración: un modelo borrado a mano debe bajar el peldaño y decirlo.
 */
export function listInstalledArtifacts({ comfyDir, config = {}, tier = hostTier() } = {}) {
  const modelsDir = comfyModelsDir(comfyDir);
  const diffusionDir = path.join(modelsDir, "diffusion_models");
  const encoderDir = path.join(modelsDir, "text_encoders");
  const ladder = config.ladderModels && typeof config.ladderModels === "object" ? config.ladderModels : {};

  const baseUnet = String(config.models?.unet || "").trim();
  const baseClip = String(config.models?.clip || "").trim();
  const baseInstalled = Boolean(baseUnet)
    && existsSync(path.join(diffusionDir, path.basename(baseUnet)))
    && Boolean(baseClip)
    && existsSync(path.join(encoderDir, path.basename(baseClip)));

  const turbo = engineArtifactById("wan22-max-turbo");
  const turboUnet = firstExisting(diffusionDir, [ladder.unet, ...turbo.unetCandidates].filter(Boolean));
  const turboClip = firstExisting(encoderDir, [ladder.clip, ...turbo.clipCandidates].filter(Boolean));

  return {
    [BASE_ENGINE_ID]: {
      installed: baseInstalled,
      unet: baseUnet || null,
      clip: baseClip || null,
      label: engineArtifactById(BASE_ENGINE_ID).label,
      missing: baseInstalled ? [] : ["falta el paquete base (instala el motor)"],
    },
    "wan22-max-turbo": {
      installed: Boolean(turboUnet && turboClip),
      unet: turboUnet,
      clip: turboClip,
      label: turbo.label,
      requiredGb: turbo.requiredGb,
      gbEstimadas: turbo.requiredGb,
      // En 8 GB no cabe ni el clip de 512 px con VAE por tiles: no se ofrece.
      disponibleParaElEquipo: tier.id !== "8gb",
      missing: [
        ...(!turboUnet ? ["modelo Turbo (≈3,6 GB)"] : []),
        ...(!turboClip ? ["codificador Q5 (≈4,1 GB)"] : []),
      ],
    },
  };
}

/**
 * Elige el motor de un preset. Si el Turbo no está instalado todavía, Rápido sigue
 * funcionando con el modelo base y `fallbackNote` lo dice en la consola.
 */
export function selectArtifactForPreset(presetId = "", installed = {}, tier = hostTier()) {
  const preset = qualityPresetByIdOrMinutes(presetId) || QUALITY_PRESETS[1];
  const turboId = "wan22-max-turbo";
  const wantsTurbo = preset.engineIds[0] === turboId;
  const turboReady = Boolean(installed[turboId]?.installed);
  // En 8 GB no cabe ni el cuadro de 704 px con el VAE por tiles: siempre modelo base.
  if (wantsTurbo && turboReady && tier.id !== "8gb") {
    return { preset, artifact: engineArtifactById(turboId), fallbackNote: "" };
  }
  const artifact = engineArtifactById(BASE_ENGINE_ID);
  if (!wantsTurbo) return { preset, artifact, fallbackNote: "" };
  return {
    preset,
    artifact,
    fallbackNote: tier.id === "8gb"
      ? "Rápido se queda en el modelo base: tu Mac de 8 GB no puede con el paquete Turbo."
      : "Rápido usa el modelo base. El Turbo (4 pasos, 704 px) está disponible con «Descargar Rápido Turbo».",
  };
}

/** Etiqueta del motor que sale en el plan, para que el usuario sepa qué está usando. */
export function artifactLabelFor(plan = null) {
  const label = String(plan?.engineLabel || "").trim();
  const size = plan?.width && plan?.height ? ` · ${Math.round(plan.width)}×${Math.round(plan.height)}` : "";
  const steps = plan?.steps ? ` · ${plan.steps} pasos` : "";
  return `${label || engineArtifactById(BASE_ENGINE_ID).label}${size}${steps}`;
}

// Lados largos posibles, todos múltiplos de 32 (Wan 2.2 codifica en bloques de 32 px).
const LONG_EDGES = [832, 768, 704, 640, 576, 512, 448, 384];

// Nombres por defecto del paquete oficial Comfy-Org/Wan_2.2_ComfyUI_Repackaged.
// El instalador de la consola guarda en ~/.charlybrown/podcaster-local-video.json
// los nombres realmente descargados y esos tienen prioridad sobre estos.
export const DEFAULT_WAN22_MODELS = {
  unet: "wan2.2_ti2v_5B_fp16.safetensors",
  clip: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  vae: "wan2.2_vae.safetensors",
};

export function loadWorkflowTemplate(mode) {
  if (mode !== "i2v") {
    throw Object.assign(new Error("El modo t2v local estará disponible en una versión posterior. Usa image-to-video con un primer frame."), { statusCode: 400 });
  }
  return JSON.parse(readFileSync(path.join(import.meta.dirname, "workflows", "wan22-i2v.json"), "utf8"));
}

export function renderWorkflow(template, values) {
  const unetName = String(values.unetName || DEFAULT_WAN22_MODELS.unet);
  const clipName = String(values.clipName || DEFAULT_WAN22_MODELS.clip);
  // Los .gguf se cargan con los nodos de ComfyUI-GGUF (un Mac de 16 GB no puede con
  // los safetensors completos). Esos nodos no aceptan weight_dtype, solo unet_name.
  const unetIsGguf = /\.gguf$/i.test(unetName.trim());
  const sampler = values.sampler && typeof values.sampler === "object" ? values.sampler : {};
  const width = clampInt(values.width, 128, 1280, 640);
  const height = clampInt(values.height, 128, 1280, 352);
  // Red de seguridad por si alguien manda dimensiones a mano: los frames que caben
  // en la memoria de este equipo, con el techo de 121 (7,5 s) del modelo.
  const maxFrames = Math.max(17, Math.min(121, Math.floor(hostTier().pixelFramesCap / (width * height))));
  let raw = JSON.stringify(template);
  const subs = {
    __UNET_CLASS__: JSON.stringify(unetIsGguf ? "UnetLoaderGGUF" : "UNETLoader"),
    __CLIP_CLASS__: JSON.stringify(/\.gguf$/i.test(clipName.trim()) ? "CLIPLoaderGGUF" : "CLIPLoader"),
    __PROMPT__: JSON.stringify(String(values.prompt || "")),
    __NEGATIVE__: JSON.stringify(String(values.negativePrompt || "")),
    __IMAGE_NAME__: JSON.stringify(String(values.imageName || "")),
    __UNET__: JSON.stringify(unetName),
    __CLIP__: JSON.stringify(clipName),
    __VAE__: JSON.stringify(String(values.vaeName || DEFAULT_WAN22_MODELS.vae)),
    __WIDTH__: String(width),
    __HEIGHT__: String(height),
    __LENGTH__: String(clampInt(values.lengthFrames, 17, maxFrames, 65)),
    __FPS__: String(clampInt(values.fps, 8, 30, 16)),
    __SEED__: String(clampInt(values.seed, 0, 2 ** 31 - 1, Math.floor(Math.random() * 1e9))),
    __STEPS__: String(clampInt(values.steps, 4, 50, 12)),
    // Sin artefacto puesto, el workflow sale exactamente igual que siempre: cfg 5,
    // euler/simple y VAEDecode. Así un plan viejo no cambia el comportamiento.
    __CFG__: String(Number(sampler.cfg) > 0 ? Number(sampler.cfg) : 5),
    __SAMPLER__: JSON.stringify(String(sampler.samplerName || "euler")),
    __SCHEDULER__: JSON.stringify(String(sampler.scheduler || "simple")),
    __DENOISE__: String(Number(sampler.denoise) > 0 ? Number(sampler.denoise) : 1),
    __VAE_DECODE_CLASS__: JSON.stringify(String(values.vaeDecodeClass || "VAEDecode")),
  };
  for (const [token, replacement] of Object.entries(subs)) {
    raw = raw.split(`"${token}"`).join(replacement);
  }
  const workflow = JSON.parse(raw);
  if (unetIsGguf && workflow["1"]?.inputs) delete workflow["1"].inputs.weight_dtype;
  // El decodificador por mosaicos pide tamaño de tesela; VAEDecode rechazaría ese
  // campo, así que solo se añaden cuando el peldaño de verdad usa VAEDecodeTiled.
  const decodeInputs = workflow["9"]?.inputs;
  if (decodeInputs) {
    delete decodeInputs.__TILED_ARGS__;
    if (values.vaeTiled) {
      Object.assign(decodeInputs, {
        tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8,
      });
    }
  }
  return workflow;
}

/**
 * Cuánto aguanta este equipo. `PODCASTER_LOCAL_VIDEO_TOTALMEM` permite probar los
 * perfiles de otro Mac sin cambiar de máquina.
 */
export function hostTier(ramGb = hostRamGb()) {
  return HOST_TIERS.find((tier) => ramGb <= tier.maxRamGb) || HOST_TIERS[HOST_TIERS.length - 1];
}

export function hostRamGb() {
  const override = Number(process.env.PODCASTER_LOCAL_VIDEO_TOTALMEM);
  const bytes = Number.isFinite(override) && override > 0 ? override : os.totalmem();
  return bytes / GB;
}

/** Lado largo del video final: un Mac de 8 GB entrega 720p, los demás 1080p. */
export function upscaleTargetForTier(tier = hostTier()) {
  return tier.upscaleLongEdge;
}

function rungsFor({ portrait, tier, artifact = engineArtifactById(BASE_ENGINE_ID) }) {
  const aspect = 16 / 9;
  // Wan 2.2 codifica en bloques de 32 px (VAE 16× × parche 2×): un lado que no
  // divida entre 32 hace fallar a ComfyUI, así que se redondea hacia abajo.
  const longEdgeCap = tier.longEdge + (Number(artifact.longEdgeBonus) || 0);
  return LONG_EDGES
    .filter((longEdge) => longEdge <= longEdgeCap)
    .map((longEdge) => {
      // Redondeamos hacia abajo: así 640 da 352 (nunca más píxeles de los previstos).
      const shortEdge = Math.max(160, Math.floor(longEdge / aspect / 32) * 32);
      return portrait
        ? { width: shortEdge, height: longEdge }
        : { width: longEdge, height: shortEdge };
    });
}

function framesFor(seconds, fps, { generous = true } = {}) {
  // Wan 2.2 exige 4n+1 frames: 8 s a 12 fps son 97, y 4 s a 16 fps son 65.
  const raw = seconds * fps - 1;
  const blocks = generous ? Math.round(raw / 4) : Math.floor(raw / 4);
  return Math.max(17, 1 + 4 * blocks);
}

/**
 * Plan de render dentro de un presupuesto de minutos. La duración manda (8 s por
 * escena) y la resolución nunca sube del techo del equipo. Lo que compra cada
 * preset depende del motor: el base gasta los minutos en pasos, el Turbo ya viene
 * destilado a 4 pasos, así que los minutos sobran y se van a píxeles reales.
 */
export function planLocalRender({ durationSec = 8, portrait = false, budgetMinutes, tier = hostTier(), k, artifact = engineArtifactById(BASE_ENGINE_ID) } = {}) {
  const stepCost = Number(k) > 0 ? Number(k) : K_SECONDS_PER_PIXEL_FRAME_STEP;
  const minutes = clampInt(budgetMinutes ?? tier.budgetMinutes, 5, 240, tier.budgetMinutes);
  const budgetSeconds = minutes * 60;
  const seconds = Math.max(2, Math.min(8, Number(durationSec) || 8));
  const stepsMin = clampInt(artifact.stepsMin, 4, 50, MIN_RENDER_STEPS);
  const stepsMax = Math.max(stepsMin, clampInt(artifact.stepsMax, 4, 50, MAX_RENDER_STEPS));
  const prefer = artifact.prefer || { smooth: 12, fluid: 8, economical: 8 };

  for (const { width, height } of rungsFor({ portrait, tier, artifact })) {
    const pixels = width * height;
    const options = new Map([16, 12, 8]
      .map((fps) => {
        // Primero el redondeo que respeta la duración pedida; si no cabe, el de abajo.
        const lengthFrames = [true, false]
          .map((generous) => framesFor(seconds, fps, { generous }))
          .find((candidate) => candidate * pixels <= tier.pixelFramesCap);
        if (!lengthFrames) return null;
        const perStep = stepCost * lengthFrames * pixels;
        const steps = clampInt(Math.floor(budgetSeconds / perStep), stepsMin, stepsMax, stepsMin);
        return { width, height, lengthFrames, fps, steps, pixelFrames: lengthFrames * pixels, estimatedSeconds: Math.round(perStep * steps) };
      })
      .filter(Boolean)
      .map((option) => [option.fps, option]));

    const smooth = options.get(16);
    const fluid = options.get(12);
    const economical = options.get(8);
    // Movimiento fluido solo si paga los pasos que pide el motor; si no, 12 fps con
    // menos; si no, recortamos fps antes que resolución, y siempre preferimos lo que
    // quepa en el presupuesto prometido.
    const candidates = [smooth, fluid, economical].filter(Boolean);
    const chosen = (smooth && smooth.steps >= prefer.smooth && smooth)
      || (fluid && fluid.steps >= prefer.fluid && fluid)
      || (economical && economical.steps >= prefer.economical && economical)
      || candidates.find((candidate) => candidate.estimatedSeconds <= budgetSeconds)
      || candidates[candidates.length - 1];
    if (!chosen) continue;

    const estimatedMinutes = Math.round(chosen.estimatedSeconds / 60);
    const duration = Math.round((chosen.lengthFrames / chosen.fps) * 100) / 100;
    return {
      ...chosen,
      durationSec: duration,
      budgetMinutes: minutes,
      tierId: tier.id,
      engineId: artifact.id,
      engineLabel: artifact.label,
      estimatedMinutes,
      overBudget: chosen.estimatedSeconds > budgetSeconds,
      note: chosen.estimatedSeconds > budgetSeconds
        ? `Con ${minutes} min por escena no alcanza ni para el mínimo de pasos: Snoopy tarda unos ${estimatedMinutes} min en ${duration} s.`
        : "",
    };
  }

  // Equipo sin memoria para el paso cómodo: clip corto en la resolución más pequeña.
  const rung = rungsFor({ portrait, tier, artifact }).at(-1);
  const lengthFrames = framesFor(Math.min(seconds, 4), 8);
  const perStep = stepCost * lengthFrames * rung.width * rung.height;
  const estimatedSeconds = Math.round(perStep * stepsMin);
  return {
    width: rung.width,
    height: rung.height,
    lengthFrames,
    fps: 8,
    steps: stepsMin,
    pixelFrames: lengthFrames * rung.width * rung.height,
    durationSec: Math.round((lengthFrames / 8) * 100) / 100,
    budgetMinutes: minutes,
    tierId: tier.id,
    engineId: artifact.id,
    engineLabel: artifact.label,
    estimatedMinutes: Math.round(estimatedSeconds / 60),
    overBudget: true,
    note: "La memoria de tu equipo es muy justa: Snoopy recorta la escena a lo que cabe y avanza despacio. Cierra otras apps y pulsa «Liberar memoria» al terminar.",
  };
}

/**
 * El coste por paso se calibra por motor: 4 pasos de Turbo no pueden corregir la
 * estimación del modelo base (y viceversa). Antes había un solo número; se sigue
 * leyendo como el coste del modelo base.
 */
export function kForArtifact(storedK, artifactId = BASE_ENGINE_ID) {
  if (storedK && typeof storedK === "object") {
    const value = Number(storedK[artifactId]);
    return value > 0 ? value : undefined;
  }
  const legacy = Number(storedK);
  if (!(legacy > 0)) return undefined;
  return artifactId === BASE_ENGINE_ID ? legacy : undefined;
}

export function kMapWith(storedK, artifactId, nextK) {
  const map = storedK && typeof storedK === "object" ? { ...storedK } : {};
  if (!Object.keys(map).length && Number(storedK) > 0) map[BASE_ENGINE_ID] = Number(storedK);
  map[artifactId] = nextK;
  return map;
}

/**
 * Corrige el coste por paso con el tiempo real de la escena terminada (media móvil),
 * para que la siguiente estimación se parezca a este Mac y no al promedio.
 */
export function calibrateK({ secondsElapsed, lengthFrames, width, height, steps }, previousK) {
  const base = Number(previousK) > 0 ? Number(previousK) : K_SECONDS_PER_PIXEL_FRAME_STEP;
  const work = Number(lengthFrames) * Number(width) * Number(height) * Number(steps);
  const observed = Number(secondsElapsed);
  if (!(work > 0) || !(observed > 0)) return base;
  return Math.min(1e-3, Math.max(1e-7, (base + observed / work) / 2));
}

/**
 * Tamaño de salida tras el reescalado: el lado largo llega al target del tier
 * (1920 en 16 GB, 1280 en 8 GB) respetando el aspecto y con lados pares.
 */
export function upscaleSizeFor({ nativeWidth = 0, nativeHeight = 0, targetLongEdge = 1920 } = {}) {
  const width = Number(nativeWidth) || 0;
  const height = Number(nativeHeight) || 0;
  const longEdge = Math.max(width, height);
  if (!(longEdge > 0) || longEdge >= targetLongEdge) {
    return { width: even(width), height: even(height), scaled: false };
  }
  const scale = targetLongEdge / longEdge;
  return { width: even(width * scale), height: even(height * scale), scaled: true };
}

/**
 * El afinador lleva el clip a 1080p (720p en Macs de 8 GB) con lanczos + unsharp: es
 * definición de salida, no de difusión, así que cuesta segundos y no pide memoria.
 */
export function ffmpegArgsForOutput({ nativeWidth = 0, nativeHeight = 0, targetLongEdge = 1920, fps = 0 } = {}) {
  const vf = [];
  // Primero la cadencia: mezclar fotogramas sobre 640×352 cuesta mucho menos que
  // sobre el 1080p ya reescalado.
  if (Number(fps) > 0) vf.push(`minterpolate=fps=${Math.round(Number(fps))}:mi_mode=blend`);
  const target = upscaleSizeFor({ nativeWidth, nativeHeight, targetLongEdge });
  if (target.scaled) {
    vf.push(`scale=${target.width}:${target.height}:flags=lanczos`);
    vf.push("unsharp=5:5:0.8:5:5:0.0");
  }
  return [
    "-i", "pipe:0",
    ...(vf.length ? ["-vf", vf.join(",")] : []),
    "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "-f", "mp4", "pipe:1",
  ];
}

function even(value) {
  return Math.max(16, Math.round(value / 2) * 2);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export class ComfyClient {
  constructor({ baseUrl = "http://127.0.0.1:8188", fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetch = fetchImpl;
  }

  async #json(pathname, init) {
    const response = await this.fetch(this.baseUrl + pathname, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ComfyUI ${pathname} → HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return response.json();
  }

  // La sonda de salud no puede esperar a una GPU ocupada: ComfyUI deja de responder
  // mientras ejecuta un job, así que usa un timeout corto y el daemon cachea el valor.
  async reachable({ timeoutMs = 900 } = {}) {
    try {
      await this.#json("/system_stats", { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
      return true;
    } catch {
      return false;
    }
  }

  /** Suelta los modelos de RAM/VRAM (≈9 GB en Wan 2.2) para dejar el Mac respirar. */
  async freeMemory() {
    // /free responde 200 con el cuerpo vacío: no pasa por #json, que exige JSON.
    const response = await this.fetch(this.baseUrl + "/free", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`ComfyUI /free → HTTP ${response.status}: ${text.slice(0, 160)}`);
    }
    return true;
  }

  /** Uploads the first-frame image and returns the ComfyUI input filename. */
  async uploadImage(dataUrlOrBase64) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrlOrBase64 || ""));
    const mime = match ? match[1] : "image/png";
    const bytes = Buffer.from(match ? match[2] : String(dataUrlOrBase64 || ""), "base64");
    if (!bytes.length) throw Object.assign(new Error("firstFrame vacío o no es base64."), { statusCode: 400 });
    const ext = /jpeg|jpg/.test(mime) ? "jpg" : /webp/.test(mime) ? "webp" : "png";
    const name = `podcaster_local_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: mime }), name);
    form.append("overwrite", "true");
    await this.#json("/upload/image", { method: "POST", body: form });
    return name;
  }

  async queuePrompt(workflow) {
    const result = await this.#json("/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: "charlybrown-podcaster-local" }),
    });
    if (!result?.prompt_id) {
      const detail = result?.error ? JSON.stringify(result.error).slice(0, 300) : "respuesta inesperada";
      throw new Error(`ComfyUI rechazó el workflow: ${detail}`);
    }
    return result.prompt_id;
  }

  async history(promptId) {
    const result = await this.#json(`/history/${encodeURIComponent(promptId)}`, { method: "GET" });
    return result?.[promptId] || null;
  }

  async fetchOutput(file) {
    const params = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder || "",
      type: file.type || "output",
    });
    const response = await this.fetch(`${this.baseUrl}/view?${params}`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`ComfyUI /view → HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async removeFromQueue(promptId) {
    await this.#json("/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: [promptId] }),
    }).catch(() => {});
  }

  async interrupt() {
    await this.#json("/interrupt", { method: "POST" }).catch(() => {});
  }

  /**
   * El avance real («voy por el paso 5 de 8») solo existe en el websocket de
   * ComfyUI: por HTTP `/history` no responde hasta que el video termina. Si el
   * websocket no está disponible devolvemos un watcher mudo y el daemon sigue con
   * su contador aproximado, así que ver paso es un extra, nunca un requisito.
   */
  watchProgress({ clientId = "charlybrown-podcaster-local" } = {}) {
    const mute = { stepOf: () => null, finished: () => false, close() { } };
    if (typeof WebSocket !== "function") return mute;
    const latest = { value: 0, max: 0, promptId: "", finishedPromptId: "" };
    let socket = null;
    try {
      socket = new WebSocket(`${this.baseUrl.replace(/^http/, "ws")}/ws?clientId=${encodeURIComponent(clientId)}`);
    } catch {
      return mute;
    }
    socket.addEventListener?.("message", (event) => {
      // ComfyUI también manda previsualizaciones binarias; solo nos interesa JSON.
      if (typeof event?.data !== "string") return;
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const data = message?.data || {};
      if (message?.type === "progress" && Number(data.max) > 0) {
        latest.value = Math.max(0, Number(data.value) || 0);
        latest.max = Number(data.max);
        latest.promptId = String(data.prompt_id || "");
        return;
      }
      if ((message?.type === "executing" && !data.node) || message?.type === "execution_success") {
        latest.finishedPromptId = String(data.prompt_id || latest.promptId || "");
      }
    });
    socket.addEventListener?.("error", () => { });
    socket.addEventListener?.("close", () => { });
    return {
      stepOf(promptId = "") {
        if (!latest.max) return null;
        if (promptId && latest.promptId && latest.promptId !== promptId) return null;
        return { value: latest.value, max: latest.max };
      },
      finished(promptId = "") {
        return Boolean(promptId && latest.finishedPromptId === promptId);
      },
      close() {
        try {
          socket.close();
        } catch { /* ya cayó sola */ }
      },
    };
  }
}

const VIDEO_FILE_RE = /\.(mp4|webm|mov|mkv|avi)$/i;

/**
 * El nodo SaveVideo de ComfyUI 0.38 anuncia el clip dentro de `images` (con
 * `animated: true`), no en `videos`, así que mirar solo esa clave perdía
 * recortes ya generados. Los nodos de video explícitos siguen teniendo prioridad.
 */
export function extractOutputVideo(historyEntry) {
  const output = historyEntry?.outputs || {};
  const nodes = Object.values(output);
  for (const node of nodes) {
    const explicit = node?.videos || node?.gifs || [];
    if (explicit.length) return explicit[0];
  }
  for (const node of nodes) {
    const mp4 = (node?.images || []).filter((file) => VIDEO_FILE_RE.test(String(file?.filename || "")));
    if (mp4.length) return mp4[0];
  }
  return null;
}
