// El Mac de prueba no trae ffmpeg, así que el afinador tiene que encontrar solo el
// Python de ComfyUI (PyAV + Pillow) y entregar el clip en el tamaño final del tier.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { polisherCandidates, resolveClipPolisher, polishClip, smoothFpsFor, POLISH_SCRIPT } from "../clip-polish.mjs";
import { upscaleSizeFor, SMOOTH_OUTPUT_FPS } from "../comfy-client.mjs";

const VENV_PYTHON = path.join(os.homedir(), "ComfyUI", "venv", "bin", "python");

function venvReady() {
  if (!fs.existsSync(VENV_PYTHON)) return false;
  try {
    execFileSync(VENV_PYTHON, ["-c", "import av, PIL"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function makeClip(python, { width, height, frames = 6, rate = 12 }) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "snoopy-clip-")), "clip.mp4");
  const script = `
import av
from PIL import Image
dst = av.open(${JSON.stringify(out)}, mode="w", format="mp4")
enc = dst.add_stream("libx264", rate=${rate})
enc.width, enc.height, enc.pix_fmt = ${width}, ${height}, "yuv420p"
for i in range(${frames}):
    img = Image.new("RGB", (${width}, ${height}), (i * 30 % 255, 70, 150))
    for p in enc.encode(av.VideoFrame.from_image(img)):
        dst.mux(p)
for p in enc.encode():
    dst.mux(p)
dst.close()
`;
  execFileSync(python, ["-c", script]);
  return fs.readFileSync(out);
}

function clipSize(python, buffer) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "snoopy-size-")), "clip.mp4");
  fs.writeFileSync(file, buffer);
  const script = `
import av, json
c = av.open(${JSON.stringify(file)})
v = c.streams.video[0]
print(json.dumps({"width": v.width, "height": v.height, "frames": v.frames or 0, "fps": float(v.average_rate or 0), "seconds": (c.duration or 0) / 1000000}))
`;
  return JSON.parse(execFileSync(python, ["-c", script], { encoding: "utf8" }).trim());
}

test("afinador: primero ffmpeg y luego el Python de ComfyUI", () => {
  const candidates = polisherCandidates({ HOME: "/Users/uno", PODCASTER_LOCAL_VIDEO_FFMPEG: "/mi/ffmpeg" });
  assert.deepEqual(candidates.map((c) => `${c.kind}:${c.bin}`).slice(0, 2), ["ffmpeg:/mi/ffmpeg", "ffmpeg:ffmpeg"]);
  assert.ok(candidates.some((c) => c.kind === "ffmpeg" && c.bin === "/opt/homebrew/bin/ffmpeg"));
  const last = candidates[candidates.length - 1];
  assert.equal(last.kind, "pyav");
  assert.equal(last.bin, path.join("/Users/uno", "ComfyUI", "venv", "bin", "python"));
});

test("afinador: se queda con el primer camino que funciona", async () => {
  const probes = { "/opt/homebrew/bin/ffmpeg": false, [VENV_PYTHON]: true };
  const picked = await resolveClipPolisher({
    env: { HOME: os.homedir(), PODCASTER_LOCAL_VIDEO_FFMPEG: "" },
    probe: async (c) => probes[c.bin] === true,
  });
  assert.equal(picked?.kind, "pyav");

  const nothing = await resolveClipPolisher({ env: { HOME: os.homedir() }, probe: async () => false });
  assert.equal(nothing, null);
});

test("afinador: el tamaño final respeta el techo del tier y el aspecto", () => {
  assert.deepEqual(upscaleSizeFor({ nativeWidth: 640, nativeHeight: 352, targetLongEdge: 1920 }),
    { width: 1920, height: 1056, scaled: true });
  assert.deepEqual(upscaleSizeFor({ nativeWidth: 352, nativeHeight: 640, targetLongEdge: 1920 }),
    { width: 1056, height: 1920, scaled: true });
  assert.deepEqual(upscaleSizeFor({ nativeWidth: 512, nativeHeight: 288, targetLongEdge: 1280 }),
    { width: 1280, height: 720, scaled: true });
  const already = upscaleSizeFor({ nativeWidth: 1920, nativeHeight: 1080, targetLongEdge: 1920 });
  assert.equal(already.scaled, false, "un clip que ya llega a 1080p no se vuelve a agrandar");
  assert.deepEqual([already.width, already.height], [1920, 1080]);
});

test("afinador: sin afinador el clip se conserva, no se pierde la escena", async () => {
  const buffer = Buffer.from("clip-falso");
  const result = await polishClip(buffer, { nativeWidth: 640, nativeHeight: 352, targetLongEdge: 1920, polisher: null });
  assert.equal(result.buffer, buffer);
  assert.equal(result.kind, null);
  assert.match(result.note, /Sin afinador/);
});

test("afinador: sin polish-clip.py no se ofrece el camino de Python", async () => {
  const script = POLISH_SCRIPT;
  assert.ok(fs.existsSync(script), "el afinador de ComfyUI necesita polish-clip.py dentro del paquete");
});

const VENV_READY = venvReady();

test("afinador real: 128×72 sube a 256×144 con PyAV + Pillow", { skip: VENV_READY ? false : "necesita el venv de ComfyUI con PyAV + Pillow" }, async () => {
  const original = makeClip(VENV_PYTHON, { width: 128, height: 72 });
  const result = await polishClip(original, {
    nativeWidth: 128,
    nativeHeight: 72,
    targetLongEdge: 256,
    polisher: { kind: "pyav", bin: VENV_PYTHON },
  });
  assert.ok(result.buffer.length > 0);
  assert.notEqual(result.buffer.toString("hex"), original.toString("hex"), "el archivo tiene que cambiar");
  const size = clipSize(VENV_PYTHON, result.buffer);
  assert.deepEqual([size.width, size.height], [256, 144]);
  assert.equal(size.fps, 12, "el reescalado no puede cambiar los fps");
});

test("movimiento suave: mezcla hasta 24 fps y deja en paz los 16", () => {
  assert.equal(smoothFpsFor({ sourceFps: 12, smoothMotion: true }), SMOOTH_OUTPUT_FPS);
  assert.equal(smoothFpsFor({ sourceFps: 8, smoothMotion: true }), 24, "a 8 fps se mezcla de tres en tres");
  assert.equal(smoothFpsFor({ sourceFps: 16, smoothMotion: true }), 0, "duplicar 16 sería 32: se ve artificial");
  assert.equal(smoothFpsFor({ sourceFps: 12, smoothMotion: false }), 0, "el interruptor apagado no toca nada");
  assert.equal(smoothFpsFor({ smoothMotion: true }), 0, "sin cadencia conocida no hay mezcla que prometer");
});

test("afinador real: 12 fps de la GPU salen a 24 fps suaves con la misma duración",
  { skip: VENV_READY ? false : "necesita el venv de ComfyUI con PyAV + Pillow" }, async () => {
    const original = makeClip(VENV_PYTHON, { width: 128, height: 72, frames: 6, rate: 12 });
    const result = await polishClip(original, {
      nativeWidth: 128,
      nativeHeight: 72,
      targetLongEdge: 256,
      sourceFps: 12,
      smoothMotion: true,
      polisher: { kind: "pyav", bin: VENV_PYTHON },
    });
    assert.equal(result.fps, 24, "el afinado promete 24 fps");
    assert.equal(result.motionSmoothed, true);
    const size = clipSize(VENV_PYTHON, result.buffer);
    assert.equal(size.fps, 24, "la cadencia prometida tiene que estar escrita en el archivo");
    assert.equal(size.frames, 12, "mezclar cada par deja un fotograma extra: el doble de frames");
    assert.ok(Math.abs(size.seconds - 0.5) < 0.02, `el video no puede durar más: ${size.seconds} s`);
  });

test("afinador real: 8 fps salen a 24 fps mezclando de tres en tres, sin estirar el clip",
  { skip: VENV_READY ? false : "necesita el venv de ComfyUI con PyAV + Pillow" }, async () => {
    // Es el caso real de este Mac: las escenas largas del planificador salen a 8 fps.
    const original = makeClip(VENV_PYTHON, { width: 128, height: 72, frames: 6, rate: 8 });
    const result = await polishClip(original, {
      nativeWidth: 128,
      nativeHeight: 72,
      targetLongEdge: 256,
      sourceFps: 8,
      smoothMotion: true,
      polisher: { kind: "pyav", bin: VENV_PYTHON },
    });
    assert.equal(result.motionSmoothed, true);
    const size = clipSize(VENV_PYTHON, result.buffer);
    assert.equal(size.fps, 24);
    assert.equal(size.frames, 18, "tres fotogramas por cada cuadro que salió de la GPU");
    assert.ok(Math.abs(size.seconds - 0.75) < 0.03, `la escena no puede durar más: ${size.seconds} s`);
  });

test("afinador real: un clip de 16 fps conserva su cadencia aunque el interruptor esté encendido",
  { skip: VENV_READY ? false : "necesita el venv de ComfyUI con PyAV + Pillow" }, async () => {
    const original = makeClip(VENV_PYTHON, { width: 128, height: 72, frames: 6, rate: 16 });
    const result = await polishClip(original, {
      nativeWidth: 128,
      nativeHeight: 72,
      targetLongEdge: 256,
      sourceFps: 16,
      smoothMotion: true,
      polisher: { kind: "pyav", bin: VENV_PYTHON },
    });
    assert.equal(result.fps, 16, "16 fps no se suben a 32: ya se ven sueltos");
    assert.equal(result.motionSmoothed, false);
    const size = clipSize(VENV_PYTHON, result.buffer);
    assert.equal(size.frames, 6, "sin mezcla no se inventan fotogramas");
  });
