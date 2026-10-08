import test from "node:test";
import assert from "node:assert/strict";

import { loadWorkflowTemplate, renderWorkflow, hostTier, extractOutputVideo, engineArtifactById, BASE_ENGINE_ID } from "../comfy-client.mjs";

const SAFETENSORS = {
  unetName: "wan2.2_ti2v_5B_fp16.safetensors",
  clipName: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  vaeName: "wan2.2_vae.safetensors",
};
const GGUF = {
  unetName: "Wan2.2-TI2V-5B-Q4_K_M.gguf",
  clipName: "umt5-xxl-encoder-Q4_K_M.gguf",
  vaeName: "wan2.2_vae.safetensors",
};

function render(over = {}) {
  return renderWorkflow(loadWorkflowTemplate("i2v"), {
    prompt: "dos presentadores hablando",
    imageName: "frame.png",
    ...SAFETENSORS,
    ...over,
  });
}

test("i2v: safetensors usan los nodos oficiales de ComfyUI", () => {
  const workflow = render();
  assert.equal(workflow["1"].class_type, "UNETLoader");
  assert.equal(workflow["1"].inputs.unet_name, SAFETENSORS.unetName);
  assert.equal(workflow["1"].inputs.weight_dtype, "default");
  assert.equal(workflow["2"].class_type, "CLIPLoader");
  assert.equal(workflow["2"].inputs.type, "wan");
});

test("i2v: GGUF usa UnetLoaderGGUF/CLIPLoaderGGUF y suelta weight_dtype", () => {
  const workflow = render(GGUF);
  assert.equal(workflow["1"].class_type, "UnetLoaderGGUF");
  assert.equal(workflow["1"].inputs.unet_name, GGUF.unetName);
  assert.equal(workflow["1"].inputs.weight_dtype, undefined);
  assert.equal(workflow["2"].class_type, "CLIPLoaderGGUF");
  assert.equal(workflow["2"].inputs.type, "wan");
});

test("el grafo sigue cableado: latent de Wan entra en KSampler por el índice 0", () => {
  const workflow = render(GGUF);
  assert.equal(workflow["7"].class_type, "Wan22ImageToVideoLatent");
  assert.deepEqual(workflow["8"].inputs.latent_image, ["7", 0]);
  assert.deepEqual(workflow["8"].inputs.positive, ["4", 0]);
  assert.deepEqual(workflow["7"].inputs.start_image, ["6", 0]);
});

test("t2v sigue bloqueado con mensaje claro", () => {
  assert.throws(() => loadWorkflowTemplate("t2v"), /versión posterior/i);
});

test("renderWorkflow no pide más frames de los que caben en la RAM del equipo", () => {
  const tier = hostTier();
  const workflow = render({ width: 832, height: 480, lengthFrames: 121 });
  const cap = Math.max(17, Math.min(121, Math.floor(tier.pixelFramesCap / (832 * 480))));
  assert.equal(workflow["7"].inputs.length, cap);
});

test("el planificador manda pasos bajos: 6 pasos ya no se rellenan a 8", () => {
  const workflow = render({ steps: 6, width: 640, height: 352 });
  assert.equal(workflow["8"].inputs.steps, 6);
});

test("cada motor trae su cfg, sus pasos y su decodificador", () => {
  const base = engineArtifactById(BASE_ENGINE_ID);
  const turbo = engineArtifactById("wan22-max-turbo");

  const workflowBase = render({
    sampler: base.sampler,
    vaeDecodeClass: base.vaeDecodeClass,
    vaeTiled: base.vaeTiled,
    steps: 12,
  });
  assert.equal(workflowBase["8"].inputs.cfg, 5, "el modelo base sin guía se deforma");
  assert.equal(workflowBase["8"].inputs.sampler_name, "euler");
  assert.equal(workflowBase["9"].class_type, "VAEDecode");
  assert.equal(workflowBase["9"].inputs.tile_size, undefined, "VAEDecode rechazaría los argumentos de mosaico");

  const workflowTurbo = render({
    ...GGUF,
    unetName: "Wan2.2-TI2V-5B-Turbo-Q5_K_S.gguf",
    sampler: turbo.sampler,
    vaeDecodeClass: turbo.vaeDecodeClass,
    vaeTiled: turbo.vaeTiled,
    steps: 4,
  });
  assert.equal(workflowTurbo["8"].inputs.cfg, 1, "un destilado con cfg 5 tira sus 4 pasos");
  assert.equal(workflowTurbo["8"].inputs.steps, 4);
  assert.equal(workflowTurbo["9"].class_type, "VAEDecodeTiled");
  assert.equal(workflowTurbo["9"].inputs.tile_size, 512, "en 16 GB el VAE va por mosaicos");
  assert.equal(workflowTurbo["1"].class_type, "UnetLoaderGGUF");
});

test("un plan viejo, sin sampler, sale exactamente igual que siempre", () => {
  const workflow = render({ steps: 10 });
  assert.equal(workflow["8"].inputs.cfg, 5);
  assert.equal(workflow["8"].inputs.scheduler, "simple");
  assert.equal(workflow["8"].inputs.denoise, 1);
  assert.equal(workflow["9"].class_type, "VAEDecode");
});

test("el clip se encuentra en la forma real de ComfyUI 0.38 (SaveVideo → images)", () => {
  const entry = {
    status: { status_str: "success", completed: true },
    outputs: { 11: { images: [{ filename: "clip_00001_.mp4", subfolder: "podcaster_local", type: "output" }], animated: [true] } },
  };
  assert.deepEqual(extractOutputVideo(entry), { filename: "clip_00001_.mp4", subfolder: "podcaster_local", type: "output" });
});

test("los nodos de video explícitos mandan sobre las imágenes", () => {
  const entry = {
    outputs: {
      11: { images: [{ filename: "miniatura.png", subfolder: "", type: "output" }] },
      12: { gifs: [{ filename: "clip_00002_.mp4", subfolder: "podcaster_local", type: "output" }] },
    },
  };
  assert.equal(extractOutputVideo(entry).filename, "clip_00002_.mp4");
});

test("una carpeta de solo fotos no se confunde con un video", () => {
  const pngOnly = { outputs: { 11: { images: [{ filename: "frame.png", type: "output" }] } } };
  assert.equal(extractOutputVideo(pngOnly), null);
  assert.equal(extractOutputVideo({ outputs: {} }), null);
  assert.equal(extractOutputVideo(null), null);
});
