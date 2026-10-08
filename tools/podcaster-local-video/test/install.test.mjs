import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function startDaemon({ installer, env = {}, presetConfig = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plv-install-"));
  const configFile = path.join(dir, "config.json");
  if (presetConfig) fs.writeFileSync(configFile, JSON.stringify(presetConfig, null, 2));
  const port = 18700 + Math.floor(Math.random() * 180);
  const child = spawn(process.execPath, [path.join(import.meta.dirname, "..", "server.mjs")], {
    env: {
      ...process.env,
      PODCASTER_LOCAL_VIDEO_PORT: String(port),
      PODCASTER_LOCAL_VIDEO_CONFIG: configFile,
      PODCASTER_LOCAL_VIDEO_INSTALLER: installer,
      COMFY_API_BASE: "http://127.0.0.1:1", // sin ComfyUI real: el instalador es un stub
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (c) => { log += c; });
  child.stderr.on("data", (c) => { log += c; });
  const waitUp = async () => {
    for (let i = 0; i < 60; i += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) return r.json();
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("daemon no levantó /health\n" + log);
  };
  const stop = () => { child.kill("SIGKILL"); fs.rmSync(dir, { recursive: true, force: true }); };
  const url = (p) => `http://127.0.0.1:${port}${p}`;
  return { port, url, waitUp, stop, configFile, dir };
}

async function consoleKeyOf(daemon) {
  const html = await (await daemon_fetch(daemon, "/consola")).text();
  const key = html.match(/const CONSOLE_KEY = "([0-9a-f]+)";/)?.[1];
  assert.ok(key, "la consola debe embutir su clave");
  return key;
}
function daemon_fetch(daemon, p, init) {
  return fetch(daemon.url(p), init);
}

async function waitForStatus(daemon, key, predicate, { timeoutMs = 8000, endpoint = "/install/status" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await (await daemon_fetch(daemon, endpoint, { headers: { "X-Console-Key": key } })).json();
    if (predicate(st)) return st;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`el estado de ${endpoint} nunca llegó a la condición esperada`);
}

const SUCCESS_STUB = `
import fs from "node:fs";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const step = (id, percent, message) => out({ type: "step", id, percent, message });
step("preflight", 4, "Revisando requisitos del Mac…");
await new Promise((r) => setTimeout(r, 500));
step("clone", 40, "Descargando ComfyUI…");
await new Promise((r) => setTimeout(r, 300));
const file = process.env.PODCASTER_LOCAL_VIDEO_CONFIG;
const saved = JSON.parse(fs.readFileSync(file, "utf8"));
saved.models = { unet: "stub_unet.safetensors", clip: "stub_clip.safetensors", vae: "stub_vae.safetensors" };
fs.writeFileSync(file, JSON.stringify(saved, null, 2));
step("done", 100, "Motor listo.");
out({ type: "done", models: saved.models });
process.exit(0);
`;

const FAIL_STUB = `
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "step", id: "preflight", percent: 2, message: "Revisando…" });
await new Promise((r) => setTimeout(r, 200));
out({ type: "error", message: "No encuentro Python 3.10–3.13.", hint: "Instala Python 3.12 desde python.org." });
process.exit(1);
`;

test("instalador: guardas de consola, progreso hasta done y recarga de modelos en /health", async () => {
  const stubPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "plv-stub-")), "ok-installer.mjs");
  fs.writeFileSync(stubPath, SUCCESS_STUB);
  const daemon = startDaemon({ installer: stubPath });
  try {
    const health0 = await daemon.waitUp();
    assert.equal(health0.engineInstalled, false, "sin modelos instalados todavía");

    // Sin clave de consola: nadie puede iniciar ni espiar la instalación.
    assert.equal((await daemon_fetch(daemon, "/install/status")).status, 403);
    assert.equal((await daemon_fetch(daemon, "/install/start", { method: "POST" })).status, 403);

    const key = await consoleKeyOf(daemon);
    const idle = await (await daemon_fetch(daemon, "/install/status", { headers: { "X-Console-Key": key } })).json();
    assert.equal(idle.running, false);
    assert.equal(idle.done, false);

    const started = await daemon_fetch(daemon, "/install/start", { method: "POST", headers: { "X-Console-Key": key } });
    assert.equal(started.status, 202);

    // Segunda pulsación mientras trabaja → 409.
    const again = await daemon_fetch(daemon, "/install/start", { method: "POST", headers: { "X-Console-Key": key } });
    assert.equal(again.status, 409);

    const mid = await waitForStatus(daemon, key, (st) => st.running && st.percent >= 4);
    assert.match(mid.message, /Revisando requisitos/);

    const final = await waitForStatus(daemon, key, (st) => !st.running && st.done);
    assert.equal(final.percent, 100);
    assert.equal(final.error, null);

    // El daemon recargó los modelos que el instalador escribió en la configuración.
    const health1 = await (await daemon_fetch(daemon, "/health")).json();
    assert.equal(health1.engineInstalled, true);
  } finally {
    daemon.stop();
    fs.rmSync(path.dirname(stubPath), { recursive: true, force: true });
  }
});

test("instalador: error del stub se expone con mensaje y consejo, sin done", async () => {
  const stubPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "plv-stub-")), "bad-installer.mjs");
  fs.writeFileSync(stubPath, FAIL_STUB);
  const daemon = startDaemon({ installer: stubPath });
  try {
    await daemon.waitUp();
    const key = await consoleKeyOf(daemon);
    assert.equal((await daemon_fetch(daemon, "/install/start", { method: "POST", headers: { "X-Console-Key": key } })).status, 202);
    const st = await waitForStatus(daemon, key, (s) => !s.running && s.error);
    assert.equal(st.done, false);
    assert.match(st.error.message, /Python/);
    assert.match(st.error.hint, /python\.org/);
    const health = await (await daemon_fetch(daemon, "/health")).json();
    assert.equal(health.engineInstalled, false);
  } finally {
    daemon.stop();
    fs.rmSync(path.dirname(stubPath), { recursive: true, force: true });
  }
});

test("instalador: si falta el script del instalador, /install/start responde 500 claro", async () => {
  const daemon = startDaemon({ installer: path.join(os.tmpdir(), "no-existe-installer.mjs") });
  try {
    await daemon.waitUp();
    const key = await consoleKeyOf(daemon);
    const res = await daemon_fetch(daemon, "/install/start", { method: "POST", headers: { "X-Console-Key": key } });
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /engine-installer/);
  } finally {
    daemon.stop();
  }
});

// El stub de la escalera solo simula la descarga: el modo --ladder no clona ComfyUI
// ni toca Python, así que se prueba con archivos de mentiras en un COMFY_HOME falso.
const LADDER_STUB = `
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const step = (id, percent, message) => out({ type: "step", id, percent, message });
if (process.argv[2] !== "--ladder") {
  out({ type: "error", message: "El stub de la escalera esperaba --ladder <nivel>.", hint: "" });
  process.exit(1);
}
step("preflight", 8, "Motor base OK: solo bajamos archivos.");
await new Promise((r) => setTimeout(r, 200));
step("done", 100, "Nivel Rápido listo.");
out({ type: "done", artifactId: process.argv[3] });
process.exit(0);
`;

function fakeEngineRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plv-escalera-"));
  const comfyHome = path.join(root, "ComfyUI");
  fs.mkdirSync(path.join(comfyHome, "models", "diffusion_models"), { recursive: true });
  fs.mkdirSync(path.join(comfyHome, "models", "text_encoders"), { recursive: true });
  fs.writeFileSync(path.join(comfyHome, "models", "diffusion_models", "base-q4km.gguf"), "unet");
  fs.writeFileSync(path.join(comfyHome, "models", "text_encoders", "base-clip.gguf"), "clip");
  const stubPath = path.join(root, "ladder-installer.mjs");
  fs.writeFileSync(stubPath, LADDER_STUB);
  return { root, comfyHome, stubPath };
}

const BASE_CFG = {
  token: "a".repeat(32),
  models: { unet: "base-q4km.gguf", clip: "base-clip.gguf", vae: "wan2.2_vae.safetensors" },
};

test("escalera: la consola baja el Turbo y «Rápido» deja de ser una promesa vacía", async (t) => {
  const { root, comfyHome, stubPath } = fakeEngineRoot();
  const daemon = startDaemon({
    installer: stubPath,
    env: { COMFY_HOME: comfyHome, PODCASTER_LOCAL_VIDEO_TOTALMEM: String(16 * 1024 ** 3) },
    presetConfig: BASE_CFG,
  });
  const headers = () => ({ "Content-Type": "application/json", "X-Console-Key": key });
  let key = "";
  try {
    await daemon.waitUp();
    key = await consoleKeyOf(daemon);
    const q0 = await (await daemon_fetch(daemon, "/quality", { headers: { "X-Console-Key": key } })).json();
    if (!Number.isFinite(q0.diskFreeGb) || q0.diskFreeGb < 11) {
      t.diagnostic(`este Mac solo tiene ${q0.diskFreeGb} GB libres: se omite la descarga del stub`);
      return;
    }
    const turbo0 = q0.engines.find((e) => e.id === "wan22-max-turbo");
    assert.equal(turbo0.installed, false);
    assert.equal(turbo0.presetIds.join(","), "rapido", "el Turbo es Rápido, no Máximo");
    assert.equal(q0.presets.find((p) => p.id === "rapido").engineId, "wan22-base-q4km");
    assert.match(q0.presets.find((p) => p.id === "rapido").note, /Descargar Rápido Turbo/);

    const started = await daemon_fetch(daemon, "/engine/ladder/download", {
      method: "POST", headers: headers(), body: JSON.stringify({ artifactId: "wan22-max-turbo" }),
    });
    assert.equal(started.status, 202);
    const done = await waitForStatus(daemon, key, (s) => !s.running && s.done, { endpoint: "/engine/ladder/status" });
    assert.match(done.message, /Nivel Rápido listo/);

    // Archivos del Turbo en disco: el daemon los ve sin reinstalar el motor.
    fs.writeFileSync(path.join(comfyHome, "models", "diffusion_models", "Wan2.2-TI2V-5B-Turbo-Q5_K_S.gguf"), "turbo");
    fs.writeFileSync(path.join(comfyHome, "models", "text_encoders", "umt5-xxl-encoder-Q5_K_M.gguf"), "encoder");
    const posted = await (await daemon_fetch(daemon, "/quality", {
      method: "POST", headers: headers(), body: JSON.stringify({ preset: "rapido" }),
    })).json();
    assert.equal(posted.presetId, "rapido");
    assert.equal(posted.engine.artifactId, "wan22-max-turbo", "Rápido ya gasta su presupuesto en el Turbo");
    assert.equal(posted.engine.fallbackNote, "");
    assert.equal(posted.presets.find((p) => p.id === "maximo").engineId, "wan22-base-q4km",
      "Máximo compra pasos del modelo base, no el destilado");
    assert.ok(posted.nextPlan.steps <= 6, `un destilado no puede pedir ${posted.nextPlan.steps} pasos`);
    assert.equal(Math.max(posted.nextPlan.width, posted.nextPlan.height), 704, "y los minutos libres van a píxeles");
  } finally {
    daemon.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("escalera: rechazos honestos antes de gastar un giga", async () => {
  const { root, comfyHome, stubPath } = fakeEngineRoot();
  const daemon = startDaemon({
    installer: stubPath,
    env: { COMFY_HOME: comfyHome, PODCASTER_LOCAL_VIDEO_TOTALMEM: String(16 * 1024 ** 3) },
    presetConfig: BASE_CFG,
  });
  try {
    await daemon.waitUp();
    assert.equal((await daemon_fetch(daemon, "/engine/ladder/download", { method: "POST" })).status, 403,
      "solo la consola baja peldaños");

    const key = await consoleKeyOf(daemon);
    const headers = { "Content-Type": "application/json", "X-Console-Key": key };

    const incluido = await daemon_fetch(daemon, "/engine/ladder/download", {
      method: "POST", headers, body: JSON.stringify({ artifactId: "wan22-base-q4km" }),
    });
    assert.equal(incluido.status, 400);
    assert.match((await incluido.json()).error, /ya viene incluido/);

    // Un Mac de 8 GB nunca ve el Turbo, ni siquiera por API.
    const ocho = startDaemon({
      installer: stubPath,
      env: { COMFY_HOME: comfyHome, PODCASTER_LOCAL_VIDEO_TOTALMEM: String(8 * 1024 ** 3) },
      presetConfig: BASE_CFG,
    });
    try {
      await ocho.waitUp();
      const ochoKey = await consoleKeyOf(ocho);
      const rechazado = await daemon_fetch(ocho, "/engine/ladder/download", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Console-Key": ochoKey },
        body: JSON.stringify({ artifactId: "wan22-max-turbo" }),
      });
      assert.equal(rechazado.status, 400);
      assert.match((await rechazado.json()).error, /8 GB/);
      const q8 = await (await daemon_fetch(ocho, "/quality", { headers: { "X-Console-Key": ochoKey } })).json();
      assert.equal(q8.presets.find((p) => p.id === "rapido").engineId, "wan22-base-q4km");
      assert.match(q8.presets.find((p) => p.id === "rapido").note, /8 GB/);
      assert.equal(q8.engines.find((e) => e.id === "wan22-max-turbo").disponibleParaElEquipo, false);
    } finally {
      ocho.stop();
    }
  } finally {
    daemon.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
