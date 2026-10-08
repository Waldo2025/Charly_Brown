// Afinador de clips de salida: lleva el mp4 de Wan 2.2 al tamaño final del tier con
// lanczos + unsharp. Hay dos caminos gratuitos: el CLI de ffmpeg (si el Mac lo tiene)
// y el Python de ComfyUI con PyAV + Pillow (si no). Este Mac de prueba no trae ffmpeg,
// así que el segundo es el que de verdad entrega los 1080p.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpegArgsForOutput, upscaleSizeFor, SMOOTH_OUTPUT_FPS } from "./comfy-client.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const POLISH_SCRIPT = path.join(HERE, "polish-clip.py");

export function polisherCandidates(env = process.env) {
  const home = env.HOME || os.homedir();
  const ffmpeg = [
    env.PODCASTER_LOCAL_VIDEO_FFMPEG,
    "ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ].filter(Boolean);
  const python = [
    env.PODCASTER_LOCAL_VIDEO_PYTHON,
    path.join(home, "ComfyUI", "venv", "bin", "python"),
  ].filter(Boolean);
  return [
    ...ffmpeg.map((bin) => ({ kind: "ffmpeg", bin })),
    ...python.map((bin) => ({ kind: "pyav", bin })),
  ];
}

function runProbe(candidate) {
  const args = candidate.kind === "ffmpeg"
    ? ["-version"]
    : ["-c", "import av, PIL"];
  return new Promise((resolve) => {
    const child = spawn(candidate.bin, args);
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    child.stdin.end();
  });
}

/** El primer afinador que funcione en este Mac, o null si no hay ninguno. */
export async function resolveClipPolisher({ env = process.env, probe = runProbe } = {}) {
  const candidates = polisherCandidates(env);
  const skipped = [];
  for (const candidate of candidates) {
    if (candidate.kind === "pyav" && !fs.existsSync(POLISH_SCRIPT)) {
      skipped.push(`${candidate.bin} (falta polish-clip.py)`);
      continue;
    }
    if (await probe(candidate)) return candidate;
    skipped.push(candidate.bin);
  }
  return null;
}

let cachedPolisher;

export async function getClipPolisher() {
  if (cachedPolisher === undefined) cachedPolisher = await resolveClipPolisher();
  return cachedPolisher;
}

export function resetClipPolisherCache() {
  cachedPolisher = undefined;
}

function runFfmpeg(bin, buffer, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ffmpegArgsForOutput(options));
    const chunks = [];
    const errors = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errors.push(c));
    child.on("error", (err) => reject(new Error(`No se pudo ejecutar ffmpeg (${err.code}).`)));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg falló (${code}): ${Buffer.concat(errors).toString("utf8").slice(-300)}`));
    });
    child.stdin.end(buffer);
  });
}

function runPyav(python, buffer, { width, height, crf = "18", fps = 0, blend = false }) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snoopy-afinado-"));
    const input = path.join(dir, "clip.mp4");
    const output = path.join(dir, "afinado.mp4");
    fs.writeFileSync(input, buffer);
    const args = [POLISH_SCRIPT, "--input", input, "--output", output, "--width", String(width), "--height", String(height), "--crf", String(crf)];
    if (Number(fps) > 0) args.push("--fps", String(Math.round(Number(fps))));
    if (blend) args.push("--blend");
    const child = spawn(python, args);
    const errors = [];
    child.stderr.on("data", (c) => errors.push(c));
    child.on("error", (err) => {
      fs.rmSync(dir, { recursive: true, force: true });
      reject(new Error(`No se pudo ejecutar el afinador de ComfyUI (${err.code}).`));
    });
    child.on("close", (code) => {
      let polished = null;
      try {
        if (code === 0 && fs.existsSync(output)) polished = fs.readFileSync(output);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      if (polished && polished.length > 0) resolve(polished);
      else reject(new Error(`El afinador falló (${code}): ${Buffer.concat(errors).toString("utf8").slice(-300)}`));
    });
  });
}

/**
 * Cadencia de salida que tendría `polishClip` con estas opciones (0 = la nativa).
 * La consola la usa para prometer el movimiento suave sólo cuando de verdad llega.
 */
export function smoothFpsFor({ sourceFps = 0, smoothMotion = false } = {}) {
  const nativeFps = Number(sourceFps) > 0 ? Math.round(Number(sourceFps)) : 0;
  if (!smoothMotion || nativeFps <= 0) return 0;
  // El planificador entrega 8, 12 o 16 fps. Se mezcla cada grupo de 2 o 3 fotogramas
  // vecinos hasta el techo de 24, que es lo que se ve suelto sin inventar movimiento.
  // A 16 fps duplicar sería 32: se queda como está antes que sonar a telenovela.
  for (const factor of [3, 2]) {
    if (nativeFps * factor <= SMOOTH_OUTPUT_FPS) return nativeFps * factor;
  }
  return 0;
}

/**
 * Deja el clip en el tamaño final del equipo. Si no hay afinador (o falla), devuelve
 * el clip tal cual: se prefiere un video 640×352 útil antes que una escena perdida.
 * `polisher: null` fuerza el camino sin afinador; omitirlo usa el detectado en este Mac.
 */
export async function polishClip(buffer, options = {}) {
  const { nativeWidth = 0, nativeHeight = 0, targetLongEdge = 1920, sourceFps = 0, smoothMotion = false } = options;
  const tool = "polisher" in options ? options.polisher : await getClipPolisher();
  const size = upscaleSizeFor({ nativeWidth, nativeHeight, targetLongEdge });
  const nativeFps = Number(sourceFps) > 0 ? Math.round(Number(sourceFps)) : 0;
  const fps = smoothFpsFor({ sourceFps, smoothMotion });
  const smooth = fps > 0;
  if (!tool) {
    return { buffer, kind: null, ...size, note: "Sin afinador: el clip queda en su resolución nativa." };
  }
  const polished = tool.kind === "ffmpeg"
    ? await runFfmpeg(tool.bin, buffer, { nativeWidth, nativeHeight, targetLongEdge, fps })
    : await runPyav(tool.bin, buffer, { ...size, crf: options.crf, fps, blend: smooth });
  return { buffer: polished, kind: tool.kind, ...size, fps: fps || nativeFps || 0, motionSmoothed: Boolean(fps) };
}
