import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { hostTier } from "../comfy-client.mjs";
import { modelPicksForTier, ladderPicksForTier } from "../engine-installer.mjs";

const INSTALLER = path.join(import.meta.dirname, "..", "engine-installer.mjs");

/** Lanza el instalador de verdad pero en una carpeta vacía: las guardas cortan antes de la red. */
function runInstaller(args, env = {}) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "plv-ladder-"));
  const result = spawnSync(process.execPath, [INSTALLER, ...args], {
    encoding: "utf8",
    env: { ...process.env, PODCASTER_LOCAL_VIDEO_CONFIG: path.join(configDir, "config.json"), ...env },
  });
  const lines = String(result.stdout || "").split("\n").filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
  return { status: result.status, lines, error: lines.find((line) => line.type === "error") || null };
}

const g8 = hostTier(8);
const g16 = hostTier(16);
const big = hostTier(32);

test("un Mac de 8 GB descarga solo GGUF: ni el fp16 de 10 GB ni el fp8 de 7 GB", () => {
  const picks = modelPicksForTier(g8);
  const names = picks.map((group) => group.candidates.join(","));
  assert.deepEqual(picks.map((group) => group.dir), ["diffusion_models", "text_encoders", "vae"]);
  for (const group of picks.slice(0, 2)) {
    assert.match(group.base, /huggingface\.co/, "los ligeros vienen de los repos GGUF");
    for (const name of group.candidates) {
      assert.match(name, /\.gguf$/, `8 GB no descarga ${name}: no cabría en memoria`);
    }
  }
  assert.match(picks[0].candidates[0], /Q3_K_M/, "en 8 GB la UNet baja a Q3");
  assert.match(picks[1].candidates[0], /Q3_K_M/, "y el codificador también, si no la RAM no llega");
  assert.equal(names.some((n) => /fp16|fp8/.test(n)), false);
});

test("un Mac de 16 GB usa Q4_K_M en modelo y codificador", () => {
  const picks = modelPicksForTier(g16);
  assert.match(picks[0].candidates[0], /Wan2\.2-TI2V-5B-Q4_K_M\.gguf$/);
  assert.match(picks[1].candidates[0], /umt5-xxl-encoder-Q4_K_M\.gguf$/);
  assert.equal(picks[1].dir, "text_encoders");
});

test("los equipos grandes conservan el paquete oficial completo", () => {
  const picks = modelPicksForTier(big);
  assert.equal(picks[0].candidates[0], "wan2.2_ti2v_5B_fp16.safetensors");
  assert.match(picks[1].candidates[0], /umt5_xxl_fp8/);
  assert.equal(picks[2].candidates[0], "wan2.2_vae.safetensors");
});

test("todo modelo tiene respaldo y destino conocido en ComfyUI", () => {
  for (const tier of [g8, g16, big]) {
    const picks = modelPicksForTier(tier);
    assert.equal(picks.length, 3, "UNet + codificador + VAE");
    for (const group of picks) {
      assert.ok(group.label && group.candidates.length > 0);
      assert.ok(["diffusion_models", "text_encoders", "vae"].includes(group.dir));
    }
    // El orden importa: server.mjs guarda picks[0]=unet, picks[1]=clip, picks[2]=vae.
    assert.equal(picks[0].dir, "diffusion_models");
    assert.equal(picks[1].dir, "text_encoders");
  }
});

test("la escalera solo ofrece el Turbo, en GGUF y nunca en 8 GB", () => {
  const picks = ladderPicksForTier(g16, "wan22-max-turbo");
  assert.deepEqual(picks.map((p) => p.dir), ["diffusion_models", "text_encoders"],
    "el Turbo baja modelo y codificador: el VAE ya está con el motor base");
  for (const group of picks) {
    assert.equal(group.flat, true, "estos repos suben los archivos raíz, no en split_files");
    assert.ok(group.candidates.every((name) => name.endsWith(".gguf")), "en 16 GB todo va cuantizado");
  }
  assert.equal(ladderPicksForTier(g8, "wan22-max-turbo"), null, "un Mac de 8 GB no lo aguanta: no se ofrece");
  assert.equal(ladderPicksForTier(g16, "wan22-base-q4km"), null, "el modelo base ya viene en la instalación principal");
  assert.equal(ladderPicksForTier(g16, ""), null, "un peldaño inventado no descarga nada");
});

test("engine-installer --ladder se niega antes de tocar la red", () => {
  const ocho = runInstaller(["--ladder", "wan22-max-turbo"], {
    PODCASTER_LOCAL_VIDEO_TOTALMEM: String(8 * 1024 ** 3),
  });
  assert.equal(ocho.status, 1);
  assert.match(ocho.error.message, /no se puede descargar en este Mac/);
  assert.match(ocho.error.hint, /modelo base/, "y avisa que Rápido seguirá funcionando");

  const sinComfy = fs.mkdtempSync(path.join(os.tmpdir(), "plv-sin-comfy-"));
  const sinMotor = runInstaller(["--ladder", "wan22-max-turbo"], {
    COMFY_HOME: sinComfy,
    PODCASTER_LOCAL_VIDEO_TOTALMEM: String(16 * 1024 ** 3),
  });
  assert.match(sinMotor.error.message, /Falta el motor de ComfyUI/);
  assert.equal(sinMotor.lines.some((line) => line.type === "step" && line.percent > 20), false,
    "las guardas cortan antes de cualquier progreso de descarga");
});
