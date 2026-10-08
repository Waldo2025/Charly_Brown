import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { hostTier } from "../comfy-client.mjs";
import { attachProgressSocket } from "./mock-ws.mjs";

const FAKE_MP4 = Buffer.concat([Buffer.from("fake-mp4-payload"), Buffer.alloc(64, 7)]);

/**
 * Mock ComfyUI. Behavior knobs via its own state:
 *  - historyDelay: number of /history polls before the job reports outputs.
 *  - progressSteps / progressEveryMs: el avance real que ComfyUI manda por /ws.
 */
function startMockComfy() {
  const state = { historyDelay: 1, stallSystemStats: false, failFree: false, prompts: new Map(), uploads: 0, interrupted: 0, freed: 0, progressSteps: 8, progressEveryMs: 700 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const json = (data, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url.pathname === "/system_stats") {
        // GPU ocupada: ComfyUI real deja la petición colgada mientras genera.
        if (state.stallSystemStats) return;
        return json({ system: {} });
      }
      if (url.pathname === "/upload/image") { state.uploads += 1; return json({ name: "uploaded.png" }); }
      if (url.pathname === "/prompt" && req.method === "POST") {
        const parsed = JSON.parse(body || "{}");
        const id = "prompt-" + (state.prompts.size + 1);
        state.prompts.set(id, { polls: 0, workflow: parsed.prompt });
        // El avance real no existe por HTTP: ComfyUI lo emite por websocket.
        state.ws?.runSteps(id, { steps: state.progressSteps, everyMs: state.progressEveryMs });
        return json({ prompt_id: id });
      }
      if (url.pathname.startsWith("/history/")) {
        const id = url.pathname.split("/")[2];
        const entry = state.prompts.get(id);
        if (!entry) return json({});
        entry.polls += 1;
        if (entry.polls <= state.historyDelay) return json({});
        // Forma real de ComfyUI 0.38: SaveVideo anuncia el mp4 en `images`.
        return json({
          [id]: {
            status: { status_str: "success", completed: true },
            outputs: { 11: { images: [{ filename: "clip_00001_.mp4", subfolder: "podcaster_local", type: "output" }], animated: [true] } },
          },
        });
      }
      if (url.pathname === "/view") {
        res.writeHead(200, { "Content-Type": "video/mp4" });
        return res.end(FAKE_MP4);
      }
      if (url.pathname === "/queue" && req.method === "POST") return json({});
      if (url.pathname === "/interrupt" && req.method === "POST") { state.interrupted += 1; return json({}); }
      if (url.pathname === "/free" && req.method === "POST") {
        state.freed += 1;
        if (state.failFree) return json({ error: "sin memoria" }, 500);
        // ComfyUI real responde 200 con el cuerpo vacío.
        res.writeHead(200);
        return res.end();
      }
      json({ error: "not found" }, 404);
    });
  });
  state.ws = attachProgressSocket(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, state, port: server.address().port })));
}

function startDaemon({ comfyPort, origins = "", reuse = null }) {
  const dir = reuse?.dir || fs.mkdtempSync(path.join(os.tmpdir(), "plv-test-"));
  const configFile = path.join(dir, "config.json");
  const port = 18700 + Math.floor(Math.random() * 200);
  const child = spawn(process.execPath, [path.join(import.meta.dirname, "..", "server.mjs")], {
    env: {
      ...process.env,
      PODCASTER_LOCAL_VIDEO_PORT: String(port),
      PODCASTER_LOCAL_VIDEO_CONFIG: configFile,
      PODCASTER_LOCAL_VIDEO_ORIGINS: origins,
      COMFY_API_BASE: `http://127.0.0.1:${comfyPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (c) => { log += c; });
  child.stderr.on("data", (c) => { log += c; });
  const token = () => JSON.parse(fs.readFileSync(configFile, "utf8")).token;
  const waitHealth = async () => {
    for (let i = 0; i < 60; i += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) return r.json();
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("daemon no levantó /health\n" + log);
  };
  const stop = () => { child.kill("SIGKILL"); if (!reuse) fs.rmSync(dir, { recursive: true, force: true }); };
  // Reiniciar sin borrar la carpeta: así se prueba que la biblioteca del disco sobrevive.
  const kill = () => child.kill("SIGKILL");
  return { port, dir, token, waitHealth, stop, kill, getLog: () => log, configFile: () => configFile };
}

const FRAME = "data:image/png;base64," + Buffer.from("tiny-png").toString("base64");

async function waitFor(asyncFn, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await asyncFn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("timeout esperando condición del job");
    await new Promise((r) => setTimeout(r, 250));
  }
}

test("daemon: health sin token, 401 sin pairing, ciclo i2v completo y video mp4", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    const health = await daemon.waitHealth();
    assert.equal(health.ok, true);
    assert.deepEqual(health.models, ["local-wan-2.2"]);
    assert.equal(health.comfyReachable, true);

    const noAuth = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(noAuth.status, 401);

    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const bad = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, { method: "POST", headers, body: JSON.stringify({ mode: "i2v" }) });
    assert.equal(bad.status, 400);

    const t2v = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, { method: "POST", headers, body: JSON.stringify({ mode: "t2v", prompt: "hola" }) });
    assert.equal(t2v.status, 400);

    const created = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers,
      body: JSON.stringify({ mode: "i2v", prompt: "robot bailando", firstFrame: FRAME, width: 832, height: 480, durationSec: 4, fps: 16 }),
    });
    assert.equal(created.status, 202);
    const { jobId } = await created.json();

    const job = await waitFor(async () => {
      const r = await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}`, { headers: { "X-Local-Video-Token": daemon.token() } });
      const j = await r.json();
      return j.status === "ready" || j.status === "error" ? j : null;
    });
    assert.equal(job.status, "ready", job.hint);
    assert.equal(job.model, "local-wan-2.2");

    // El tiempo real de la escena recalibra la estimación de la siguiente, guardada
    // por motor: el coste del Turbo no puede corregir al modelo base.
    const savedConfig = JSON.parse(fs.readFileSync(daemon.configFile(), "utf8"));
    const kBase = Number(savedConfig.kCalibrated?.["wan22-base-q4km"]);
    assert.ok(kBase > 0 && kBase <= 1e-3, `coste por paso recalibrado: ${JSON.stringify(savedConfig.kCalibrated)}`);
    assert.equal(Object.keys(savedConfig.kCalibrated || {}).length, 1, "solo calibra el motor que generó la escena");
    assert.ok(job.plan?.estimatedMinutes > 0, "el sitio pinta la estimación desde el plan");

    const video = await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}/video`, { headers: { "X-Local-Video-Token": daemon.token() } });
    assert.equal(video.status, 200);
    assert.equal(video.headers.get("content-type"), "video/mp4");
    assert.deepEqual(Buffer.from(await video.arrayBuffer()), FAKE_MP4);
    assert.equal(comfy.state.uploads, 1);
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("daemon: cola llena (1+1) devuelve 429 y cancel funciona", async () => {
  const comfy = await startMockComfy();
  comfy.state.historyDelay = 999; // nunca completa: deja los jobs corriendo
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const post = () => fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers, body: JSON.stringify({ mode: "i2v", prompt: "lento", firstFrame: FRAME }),
    });
    const first = await post();
    const second = await post();
    assert.equal(first.status, 202);
    assert.equal(second.status, 202);
    const third = await post();
    assert.equal(third.status, 429);

    const secondBody = await second.json();
    const canceled = await fetch(`http://127.0.0.1:${daemon.port}/jobs/${secondBody.jobId}/cancel`, { method: "POST", headers });
    assert.equal(canceled.status, 200);
    assert.equal((await canceled.json()).status, "canceled");

    const fourth = await post();
    assert.equal(fourth.status, 202, "el cancel libera un hueco de la cola");
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("daemon: CORS allowlist (localhost siempre, extra por env, resto sin cabecera)", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port, origins: "https://charly-brown.web.app" });
  try {
    await daemon.waitHealth();
    const preflight = async (origin) => fetch(`http://127.0.0.1:${daemon.port}/health`, { method: "OPTIONS", headers: { Origin: origin } });

    const okSite = await preflight("https://charly-brown.web.app");
    assert.equal(okSite.headers.get("access-control-allow-origin"), "https://charly-brown.web.app");
    const okLocal = await preflight("http://localhost:5010");
    assert.equal(okLocal.headers.get("access-control-allow-origin"), "http://localhost:5010");
    const evil = await preflight("https://evil.example");
    assert.equal(evil.headers.get("access-control-allow-origin"), null);
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("daemon: /health responde aunque ComfyUI esté colgado generando", async () => {
  const comfy = await startMockComfy();
  comfy.state.stallSystemStats = true;
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    const startedAt = Date.now();
    const health = await daemon.waitHealth();
    const elapsedMs = Date.now() - startedAt;
    assert.equal(health.ok, true, "el daemon sigue vivo aunque la GPU esté ocupada");
    assert.equal(health.comfyReachable, false);
    assert.ok(elapsedMs < 2500, `/health tardó ${elapsedMs} ms en responder`);

    comfy.state.stallSystemStats = false;
    const deadline = Date.now() + 10000;
    let refreshed = health;
    while (Date.now() < deadline) {
      refreshed = await (await fetch(`http://127.0.0.1:${daemon.port}/health`)).json();
      if (refreshed.comfyReachable === true) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(refreshed.comfyReachable, true, "la sonda se refresca en segundo plano al liberarse ComfyUI");
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("daemon: planifica 8 s dentro del techo del equipo y se lo cuenta al sitio", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const created = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers,
      body: JSON.stringify({ mode: "i2v", prompt: "robot bailando", firstFrame: FRAME, durationSec: 8, fps: 16 }),
    });
    assert.equal(created.status, 202);
    const { jobId, plan } = await created.json();
    const tier = hostTier();
    assert.ok(plan?.width && plan?.steps, "POST /jobs debe devolver el plan que va a ejecutar");
    assert.equal(plan.width % 16, 0, "Wan 2.2 necesita anchos múltiplo de 16");
    assert.equal(plan.height % 16, 0, "Wan 2.2 necesita altos múltiplo de 16");
    assert.ok(Math.max(plan.width, plan.height) <= tier.longEdge, `${plan.width}x${plan.height} pasa del techo de ${tier.longEdge}px`);
    assert.ok(plan.lengthFrames * plan.width * plan.height <= tier.pixelFramesCap, "el plan no puede pedir más memoria de la que hay");
    assert.ok(plan.estimatedMinutes > 0, "sin estimación el usuario espera a ciegas");

    const job = await (await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}`, { headers })).json();
    assert.ok(job.durationSec >= 7, `pidió 8 s y el motor le devolvió ${job.durationSec}s`);
    assert.equal(job.plan.width, plan.width);
    assert.ok(job.plan.steps >= 6 && job.plan.steps <= 20, `pasos fuera de rango: ${job.plan.steps}`);
    await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}/cancel`, { method: "POST", headers });
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("daemon: la consola cambia el presupuesto de calidad y el plan lo refleja", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const key = await consoleKeyFrom(daemon);
    const headers = { "Content-Type": "application/json", "X-Console-Key": key };
    const denied = await fetch(`http://127.0.0.1:${daemon.port}/quality`);
    assert.equal(denied.status, 403, "sin clave de consola nadie toca la calidad");

    const before = await (await fetch(`http://127.0.0.1:${daemon.port}/quality`, { headers })).json();
    assert.ok(before.tierId && Array.isArray(before.presets) && before.presets.length === 3);
    const fastSteps = before.nextPlan.steps;

    const switched = await (await fetch(`http://127.0.0.1:${daemon.port}/quality`, {
      method: "POST", headers, body: JSON.stringify({ preset: "maximo" }),
    })).json();
    assert.equal(switched.budgetMinutes, 90);
    assert.ok(switched.nextPlan.steps > fastSteps, "más minutos deben traducirse en más pasos, no en más píxeles");
    assert.ok(Math.max(switched.nextPlan.width, switched.nextPlan.height) <= hostTier().longEdge,
      "subir la calidad nunca debe pasar del techo de resolución del equipo");

    const bad = await fetch(`http://127.0.0.1:${daemon.port}/quality`, {
      method: "POST", headers, body: JSON.stringify({ preset: "ultra" }),
    });
    assert.equal(bad.status, 400);

    // El presupuesto elegido se guarda: sobrevive a un reinicio del motor.
    const saved = JSON.parse(fs.readFileSync(daemon.configFile(), "utf8"));
    assert.equal(saved.renderBudgetMinutes, 90);
    assert.ok(saved.token, "guardar calidad no puede borrar el token de emparejamiento");
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("movimiento suave: viene encendido, la consola lo apaga y se guarda como la calidad", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    const health0 = await daemon.waitHealth();
    assert.equal(health0.engine.smoothMotion, true, "el movimiento suave viene encendido: es gratis");
    assert.equal(health0.engine.smoothTargetFps, 24, "el techo prometido son 24 fps");

    const key = await consoleKeyFrom(daemon);
    const headers = { "Content-Type": "application/json", "X-Console-Key": key };
    assert.equal((await fetch(`http://127.0.0.1:${daemon.port}/quality`)).status, 403);

    const before = await (await fetch(`http://127.0.0.1:${daemon.port}/quality`, { headers })).json();
    assert.equal(before.smoothMotion, true);
    assert.equal(before.smoothTargetFps, 24);
    // Con afinador, una escena de 8 o 12 fps sube a 24; la de 16 se queda como está.
    const promete = before.clipFinish && [8, 12].includes(before.nextPlan.fps) ? 24 : 0;
    assert.equal(before.smoothNextFps, promete, `clipFinish=${before.clipFinish} · plan ${before.nextPlan.fps} fps`);

    // El interruptor puede venir solo: no obliga a reelegir el nivel de calidad.
    const presetAntes = before.presetId;
    const apagado = await (await fetch(`http://127.0.0.1:${daemon.port}/quality`, {
      method: "POST", headers, body: JSON.stringify({ smoothMotion: false }),
    })).json();
    assert.equal(apagado.smoothMotion, false);
    assert.equal(apagado.smoothNextFps, 0, "apagado no mezcla nada");
    assert.equal(apagado.presetId, presetAntes, "mover el interruptor no cambia la calidad elegida");

    const health1 = await (await fetch(`http://127.0.0.1:${daemon.port}/health`)).json();
    assert.equal(health1.engine.smoothMotion, false, "el sitio también ve el interruptor apagado");

    // Como la calidad: se guarda en el disco y sobrevive a cerrar la app.
    const saved = JSON.parse(fs.readFileSync(daemon.configFile(), "utf8"));
    assert.equal(saved.smoothMotion, false);
    assert.ok(saved.token, "guardar el interruptor no puede borrar el token de emparejamiento");

    // Cerrar y reabrir Servidor Snoopy no lo vuelve a encender por su cuenta.
    daemon.kill();
    const reabierto = startDaemon({ comfyPort: comfy.port, reuse: daemon });
    try {
      const health2 = await reabierto.waitHealth();
      assert.equal(health2.engine.smoothMotion, false);
      const key2 = await consoleKeyFrom(reabierto);
      const encendido = await (await fetch(`http://127.0.0.1:${reabierto.port}/quality`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Console-Key": key2 },
        body: JSON.stringify({ preset: "rapido", smoothMotion: true }),
      })).json();
      assert.equal(encendido.smoothMotion, true);
      assert.equal(encendido.budgetMinutes, 20, "el preset del mismo clic también se aplicó");
    } finally {
      reabierto.stop();
    }
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("consola: la cola cuenta el tiempo de la escena en curso", async () => {
  const comfy = await startMockComfy();
  comfy.state.historyDelay = 999; // la GPU nunca termina: el job se queda en curso
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const key = await consoleKeyFrom(daemon);

    const denied = await fetch(`http://127.0.0.1:${daemon.port}/queue`);
    assert.equal(denied.status, 403, "la cola es solo de la consola");

    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const created = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers,
      body: JSON.stringify({ mode: "i2v", prompt: "robot bailando", firstFrame: FRAME, durationSec: 8 }),
    });
    const { jobId, plan } = await created.json();

    const queue = await waitFor(async () => {
      const q = await (await fetch(`http://127.0.0.1:${daemon.port}/queue`, { headers: { "X-Console-Key": key } })).json();
      return q.jobs?.some((job) => job.status === "running") ? q : null;
    });
    assert.equal(queue.busy, true);
    const running = queue.jobs.find((job) => job.status === "running");
    assert.equal(running.jobId, jobId);
    assert.equal(running.plan.width, plan.width, "la consola debe mostrar el plan real de la escena");
    assert.ok(running.plan.estimatedMinutes > 0);
    assert.equal(typeof running.plan.elapsedMinutes, "number", "sin reloj no se puede decir «le faltan X min»");

    const html = await (await fetch(`http://127.0.0.1:${daemon.port}/consola`)).text();
    assert.ok(html.includes('id="heroBar"'), "la consola necesita el panel de la escena en curso");
    assert.ok(html.includes('data-preset="equilibrado"'), "la consola necesita el control de calidad");
    assert.ok(html.includes('"/queue"'), "la consola debe preguntar por la cola");
    assert.ok(html.includes('id="clipsBox"'), "la consola necesita la lista de videos guardados");
    assert.ok(html.includes('id="editorsBox"'), "la consola necesita los editores conectados");
    assert.ok(html.includes("/pair/disconnect"), "la consola necesita poder desconectar un editor");
    assert.ok(html.includes("/pair/invite"), "la consola necesita conectar al editor con un clic");

    await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}/cancel`, { method: "POST", headers });
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("consola: puede cancelar la escena en curso y un código pendiente", async () => {
  const comfy = await startMockComfy();
  comfy.state.historyDelay = 999; // la GPU se queda trabajando
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const key = await consoleKeyFrom(daemon);
    const consoleHeaders = { "Content-Type": "application/json", "X-Console-Key": key };
    const siteHeaders = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };

    const created = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers: siteHeaders,
      body: JSON.stringify({ mode: "i2v", prompt: "robot bailando", firstFrame: FRAME, durationSec: 8 }),
    });
    const { jobId } = await created.json();
    await waitFor(async () => {
      const q = await (await fetch(`http://127.0.0.1:${daemon.port}/queue`, { headers: consoleHeaders })).json();
      return q.jobs?.some((job) => job.status === "running") ? q : null;
    });

    const sinClave = await fetch(`http://127.0.0.1:${daemon.port}/scene/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }),
    });
    assert.equal(sinClave.status, 403, "solo la consola detiene la GPU con su clave");

    // Sin jobId la consola cancela lo que esté en curso: el usuario no ve ids.
    const canceled = await fetch(`http://127.0.0.1:${daemon.port}/scene/cancel`, {
      method: "POST", headers: consoleHeaders, body: JSON.stringify({}),
    });
    assert.equal(canceled.status, 200);
    const job = await canceled.json();
    assert.equal(job.jobId, jobId);
    assert.equal(job.status, "canceled");
    assert.equal(job.step, null, "una escena cancelada no puede seguir anunciando pasos");
    assert.ok(comfy.state.interrupted >= 1, "cancelar tiene que interrumpir ComfyUI, no solo pintar el estado");
    const idle = await waitFor(async () => {
      const q = await (await fetch(`http://127.0.0.1:${daemon.port}/queue`, { headers: consoleHeaders })).json();
      return q.busy === false ? q : null;
    });
    assert.equal(idle.jobs.length, 0, "la cola queda vacía tras cancelar");

    const nada = await fetch(`http://127.0.0.1:${daemon.port}/scene/cancel`, { method: "POST", headers: consoleHeaders, body: JSON.stringify({}) });
    assert.equal(nada.status, 404, "si no hay escena, la consola lo dice en vez de fingir un cancel");

    // El código de conexión caduca solo, pero la consola también lo puede cerrar ya.
    const pairReq = await fetch(`http://127.0.0.1:${daemon.port}/pair/request`, {
      method: "POST", headers: { Origin: "http://localhost:5010" },
    });
    const pair = await pairReq.json();
    assert.ok(pair.pairId, "el sitio necesita un id para poder preguntar por su código");
    const pending = await (await fetch(`http://127.0.0.1:${daemon.port}/pair/pending`, { headers: consoleHeaders })).json();
    assert.equal(pending.pairs[0].pairId, pair.pairId, "la consola necesita el id para cancelar el código");
    const closed = await fetch(`http://127.0.0.1:${daemon.port}/pair/cancel-code`, {
      method: "POST", headers: consoleHeaders, body: JSON.stringify({ pairId: pair.pairId }),
    });
    assert.equal(closed.status, 200);
    const after = await (await fetch(`http://127.0.0.1:${daemon.port}/pair/pending`, { headers: consoleHeaders })).json();
    assert.equal(after.pairs.length, 0, "el código cancelado desaparece de la consola");
    const sitio = await fetch(`http://127.0.0.1:${daemon.port}/pair/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairId: pair.pairId }),
    });
    assert.equal(sitio.status, 404, "el editor debe saber que su código se cerró");
    const repetir = await fetch(`http://127.0.0.1:${daemon.port}/pair/cancel-code`, {
      method: "POST", headers: consoleHeaders, body: JSON.stringify({ pairId: pair.pairId }),
    });
    assert.equal(repetir.status, 404, "cancelar dos veces el mismo código no es un éxito");

    const html = await (await fetch(`http://127.0.0.1:${daemon.port}/consola`)).text();
    assert.ok(html.includes('id="heroCancel"'), "la consola necesita un botón de cancelar escena");
    assert.ok(html.includes("/scene/cancel"), "la consola necesita llamar a la cancelación de escena");
    assert.ok(html.includes("/pair/cancel-code"), "la consola necesita poder cancelar un código pendiente");
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("avance real: los pasos de ComfyUI llegan por websocket y la barra dice la verdad", async () => {
  const comfy = await startMockComfy();
  comfy.state.historyDelay = 999; // nunca entrega el clip: observamos la escena en curso
  comfy.state.progressSteps = 4;
  comfy.state.progressEveryMs = 800;
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const key = await consoleKeyFrom(daemon);
    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const created = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers,
      body: JSON.stringify({ mode: "i2v", prompt: "robot bailando", firstFrame: FRAME, durationSec: 8 }),
    });
    const { jobId } = await created.json();

    const read = async (pick) => waitFor(async () => {
      const q = await (await fetch(`http://127.0.0.1:${daemon.port}/queue`, { headers: { "X-Console-Key": key } })).json();
      const job = q.jobs?.find((item) => item.jobId === jobId);
      return job && pick(job) ? job : null;
    });

    const muestreo = await read((job) => job.step && job.step.value >= 1 && job.step.value < job.step.max);
    assert.equal(muestreo.step.max, 4, "la consola tiene que saber cuántos pasos hay");
    assert.match(muestreo.stage, /muestreando en tu GPU/);
    assert.match(muestreo.hint, /Paso \d+ de 4/, "hay que poder decir «voy por el paso 2 de 4»");
    assert.ok(muestreo.progress > 0.15 && muestreo.progress < 0.85, "la barra sigue los pasos, no un contador inventado");
    assert.equal(muestreo.plan.overEstimate, false);
    assert.ok(muestreo.plan.remainingMinutes >= 1, "dentro del estimado sí quedan minutos");

    // Al terminar los pasos ComfyUI sigue callado mientras la VAE comprime: es la fase
    // que parecía colgada, así que Snoopy tiene que nombrarla.
    const compresion = await read((job) => job.step?.phase === "decode");
    assert.match(compresion.stage, /comprimiendo el video/);
    assert.match(compresion.hint, /comprimiendo/i);
    assert.equal(compresion.progress, 0.88, "queda el tramo final, no un 90 % eterno");

    await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}/cancel`, { method: "POST", headers });
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

async function consoleKeyFrom(daemon) {
  const html = await (await fetch(`http://127.0.0.1:${daemon.port}/consola`)).text();
  const key = html.match(/const CONSOLE_KEY = "([0-9a-f]+)";/)?.[1];
  assert.ok(key, "la consola debe embutir su clave");
  return key;
}

test("consola: /memory informa y /memory/free suelta los modelos de ComfyUI", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const consoleKey = await consoleKeyFrom(daemon);
    const headers = { "X-Console-Key": consoleKey };

    assert.equal((await fetch(`http://127.0.0.1:${daemon.port}/memory`)).status, 403, "sin clave no se lee la memoria");
    assert.equal((await fetch(`http://127.0.0.1:${daemon.port}/memory/free`, { method: "POST" })).status, 403);

    const mem = await (await fetch(`http://127.0.0.1:${daemon.port}/memory`, { headers })).json();
    assert.ok(mem.ramTotalGb > 0, "la consola debe mostrar la RAM del equipo");
    assert.equal(typeof mem.swapUsedGb, "number");
    assert.ok(["comoda", "justa", "critica"].includes(mem.level));
    assert.ok(typeof mem.advice === "string" && mem.advice.length > 0);
    assert.equal(mem.busy, false);

    const freed = await fetch(`http://127.0.0.1:${daemon.port}/memory/free`, { method: "POST", headers });
    assert.equal(freed.status, 200);
    const payload = await freed.json();
    assert.equal(payload.comfyReleased, true);
    assert.equal(comfy.state.freed, 1, "Snoopy debe llamar a /free de ComfyUI");
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("consola: liberar memoria se niega mientras la GPU está generando", async () => {
  const comfy = await startMockComfy();
  comfy.state.historyDelay = 999;
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const consoleKey = await consoleKeyFrom(daemon);
    const jobHeaders = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const created = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers: jobHeaders,
      body: JSON.stringify({ mode: "i2v", prompt: "robot bailando", firstFrame: FRAME }),
    });
    const { jobId } = await created.json();
    await waitFor(async () => (await (await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}`, { headers: jobHeaders })).json()).status === "running");

    const mem = await (await fetch(`http://127.0.0.1:${daemon.port}/memory`, { headers: { "X-Console-Key": consoleKey } })).json();
    assert.equal(mem.busy, true);

    const denied = await fetch(`http://127.0.0.1:${daemon.port}/memory/free`, { method: "POST", headers: { "X-Console-Key": consoleKey } });
    assert.equal(denied.status, 409);
    assert.match((await denied.json()).error, /generando/);
    assert.equal(comfy.state.freed, 0, "no se sueltan los modelos a mitad de generación");
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("consola: en equipos de poca RAM el job suelta los modelos al terminar", async () => {
  const lowRam = os.totalmem() <= 20 * 1024 ** 3;
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  try {
    await daemon.waitHealth();
    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const created = await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers,
      body: JSON.stringify({ mode: "i2v", prompt: "robot bailando", firstFrame: FRAME }),
    });
    const { jobId } = await created.json();
    const job = await waitFor(async () => {
      const j = await (await fetch(`http://127.0.0.1:${daemon.port}/jobs/${jobId}`, { headers })).json();
      return j.status === "ready" || j.status === "error" ? j : null;
    });
    assert.equal(job.status, "ready", job.hint);
    if (lowRam) {
      const consoleKey = await consoleKeyFrom(daemon);
      const mem = await waitFor(async () => {
        const payload = await (await fetch(`http://127.0.0.1:${daemon.port}/memory`, { headers: { "X-Console-Key": consoleKey } })).json();
        return payload.lastRelease?.automatic ? payload : null;
      }, 12000);
      assert.ok(comfy.state.freed >= 1, "tras generar, Snoopy debe devolver la memoria al Mac");
      assert.equal(mem.busy, false);
      assert.equal(typeof mem.lastRelease.freedGb, "number");
    }
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("biblioteca: cada clip terminado se guarda y la consola puede volver a verlo", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  const base = () => `http://127.0.0.1:${daemon.port}`;
  try {
    await daemon.waitHealth();
    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const created = await (await fetch(`${base()}/jobs`, {
      method: "POST", headers,
      body: JSON.stringify({ mode: "i2v", prompt: "dos presentadores hablando", firstFrame: FRAME, durationSec: 8 }),
    })).json();

    const job = await waitFor(async () => {
      const j = await (await fetch(`${base()}/jobs/${created.jobId}`, { headers })).json();
      return j.status === "ready" || j.status === "error" ? j : null;
    });
    assert.equal(job.status, "ready", job.hint);
    assert.ok(job.clip?.id, "el job devuelve su clip ya guardado");

    assert.equal((await fetch(`${base()}/clips`)).status, 403, "la lista de videos es solo de la consola");
    const key = await consoleKeyFrom(daemon);
    const list = await (await fetch(`${base()}/clips`, { headers: { "X-Console-Key": key } })).json();
    assert.equal(list.clips.length, 1);
    const clip = list.clips[0];
    assert.equal(clip.jobId, created.jobId);
    assert.equal(clip.durationSec, job.durationSec);
    // La ficha dice la cadencia real del archivo: sin afinador posible (el mock entrega
    // bytes sueltos, no un video) se conserva la de la GPU y nada se inventa.
    assert.equal(clip.fps, clip.nativeFps, "una escena sin afinar queda a la cadencia de la GPU");
    assert.equal(clip.motionSmoothed, false);
    assert.ok(clip.bytes > 0);
    assert.equal(clip.storageUrl, null);

    const video = await fetch(`${base()}/clips/${clip.id}`, { headers: { "X-Console-Key": key } });
    assert.equal(video.status, 200);
    assert.equal(video.headers.get("content-type"), "video/mp4");
    assert.deepEqual(Buffer.from(await video.arrayBuffer()), FAKE_MP4);

    const traversal = await fetch(`${base()}/clips/${encodeURIComponent("../../etc/passwd")}`, { headers: { "X-Console-Key": key } });
    assert.ok(traversal.status === 400 || traversal.status === 404, "no se puede salir de la carpeta de clips");

    const linked = await (await fetch(`${base()}/jobs/${created.jobId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ title: "Escena 3 · entrevista", storageUrl: "https://firebasestorage.example/escena-3.mp4" }),
    })).json();
    assert.equal(linked.clip.title, "Escena 3 · entrevista");
    const again = await (await fetch(`${base()}/clips`, { headers: { "X-Console-Key": key } })).json();
    assert.equal(again.clips[0].storageUrl, "https://firebasestorage.example/escena-3.mp4");

    const sinToken = await fetch(`${base()}/jobs/${created.jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(sinToken.status, 401);
  } finally {
    daemon.stop();
    comfy.server.close();
  }
});

test("huérfanos: si Snoopy se reinicia, el clip sigue alcanzable para el sitio", async () => {
  const comfy = await startMockComfy();
  const daemon = startDaemon({ comfyPort: comfy.port });
  let revived = null;
  try {
    await daemon.waitHealth();
    const headers = { "Content-Type": "application/json", "X-Local-Video-Token": daemon.token() };
    const created = await (await fetch(`http://127.0.0.1:${daemon.port}/jobs`, {
      method: "POST", headers,
      body: JSON.stringify({ mode: "i2v", prompt: "escena que queda huérfana", firstFrame: FRAME, durationSec: 8 }),
    })).json();
    const job = await waitFor(async () => {
      const j = await (await fetch(`http://127.0.0.1:${daemon.port}/jobs/${created.jobId}`, { headers })).json();
      return j.status === "ready" || j.status === "error" ? j : null;
    });
    assert.equal(job.status, "ready", job.hint);

    // Snoopy se reinicia: el job en memoria se pierde, la biblioteca del disco no.
    daemon.kill();
    revived = startDaemon({ comfyPort: comfy.port, reuse: { dir: daemon.dir } });
    await revived.waitHealth();
    const base = () => `http://127.0.0.1:${revived.port}`;

    const rescatado = await (await fetch(`${base()}/jobs/${created.jobId}`, { headers })).json();
    assert.equal(rescatado.status, "ready", "el job perdido se reconstruye desde el disco");
    assert.equal(rescatado.fromDisk, true);

    const video = await fetch(`${base()}/jobs/${created.jobId}/video`, { headers });
    assert.equal(video.status, 200, "el clip vuelve a poder descargarse");
    assert.equal(video.headers.get("content-type"), "video/mp4");
    assert.deepEqual(Buffer.from(await video.arrayBuffer()), FAKE_MP4);

    const desconocido = await fetch(`${base()}/jobs/no-existe-1234/video`, { headers });
    assert.equal(desconocido.status, 404, "un job que nunca existió sigue siendo 404");

    const linked = await (await fetch(`${base()}/jobs/${created.jobId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ title: "Escena 1", storageUrl: "https://firebasestorage.example/rescatada.mp4" }),
    })).json();
    assert.equal(linked.clip.storageUrl, "https://firebasestorage.example/rescatada.mp4");
  } finally {
    daemon.kill();
    revived?.stop();
    comfy.server.close();
  }
});
