import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function startDaemon({ origins = "", configFile = "" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plv-pair-"));
  // Varias pruebas necesitan el mismo archivo de configuración tras reiniciar Snoopy.
  const finalConfig = configFile || path.join(dir, "config.json");
  const port = 18900 + Math.floor(Math.random() * 200);
  const child = spawn(process.execPath, [path.join(import.meta.dirname, "..", "server.mjs")], {
    env: {
      ...process.env,
      PODCASTER_LOCAL_VIDEO_PORT: String(port),
      PODCASTER_LOCAL_VIDEO_CONFIG: finalConfig,
      PODCASTER_LOCAL_VIDEO_ORIGINS: origins,
      COMFY_API_BASE: "http://127.0.0.1:1", // sin ComfyUI: pairing no lo necesita
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
  const stop = () => {
    child.kill("SIGKILL");
    if (!configFile) fs.rmSync(dir, { recursive: true, force: true });
  };
  const url = (p) => `http://127.0.0.1:${port}${p}`;
  return { port, url, waitUp, stop, configFile: finalConfig };
}

async function consoleKeyFrom(daemon) {
  const html = await (await fetch(daemon.url("/consola"))).text();
  return html.match(/const CONSOLE_KEY = "([0-9a-f]+)";/)?.[1];
}

const SITE = "https://charly-brown.web.app";

test("pairing: flujo código de 6 números — request, protección de consola, confirmación y entrega de clave", async () => {
  const daemon = startDaemon({ origins: SITE });
  try {
    await daemon.waitUp();

    // /consola: HTML Snoopy sin cabeceras CORS, con la clave de consola embebida.
    const consoleRes = await fetch(daemon.url("/consola"), { headers: { Origin: SITE } });
    assert.equal(consoleRes.status, 200);
    assert.match(consoleRes.headers.get("content-type") || "", /text\/html/);
    assert.equal(consoleRes.headers.get("access-control-allow-origin"), null);
    const html = await consoleRes.text();
    assert.match(html, /Servidor Snoopy/);
    const consoleKey = html.match(/const CONSOLE_KEY = "([0-9a-f]+)";/)?.[1];
    assert.ok(consoleKey, "la consola debe embutir su clave");

    // El sitio pide un código.
    const requested = await fetch(daemon.url("/pair/request"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: SITE },
      body: "{}",
    });
    assert.equal(requested.status, 201);
    assert.equal(requested.headers.get("access-control-allow-origin"), SITE);
    const { pairId, code } = await requested.json();
    assert.match(code, /^\d{3}-\d{3}$/);

    // Antes de confirmar: pending, y el token NO se entrega.
    const pendingStatus = await (await fetch(daemon.url("/pair/status"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify({ pairId }),
    })).json();
    assert.equal(pendingStatus.status, "pending");
    assert.equal(pendingStatus.token, undefined);

    // Confirmar sin clave de consola (intento desde el sitio) → 403.
    const hijack = await fetch(daemon.url("/pair/confirm"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify({ code }),
    });
    assert.equal(hijack.status, 403);

    // /pair/pending exige la clave de consola.
    const noKey = await fetch(daemon.url("/pair/pending"));
    assert.equal(noKey.status, 403);
    const withKey = await (await fetch(daemon.url("/pair/pending"), { headers: { "X-Console-Key": consoleKey } })).json();
    assert.equal(withKey.pairs.length, 1);
    assert.equal(withKey.pairs[0].origin, SITE);
    assert.equal(withKey.pairs[0].code, code);

    // Código equivocado desde la consola → 404.
    const wrong = await fetch(daemon.url("/pair/confirm"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "000000", consoleKey }),
    });
    assert.equal(wrong.status, 404);

    // El usuario teclea el código en la consola → conectado.
    const confirmed = await fetch(daemon.url("/pair/confirm"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, consoleKey }),
    });
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).origin, SITE);

    // El sitio hace polling y recibe la clave; ya puede crear jobs con ella.
    const paired = await (await fetch(daemon.url("/pair/status"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify({ pairId }),
    })).json();
    assert.equal(paired.status, "paired");
    const savedToken = JSON.parse(fs.readFileSync(daemon.configFile, "utf8")).token;
    assert.equal(paired.token, savedToken);

    const jobsRes = await fetch(daemon.url("/jobs"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Local-Video-Token": paired.token },
      body: JSON.stringify({ mode: "t2v", prompt: "solo para verificar autenticación" }),
    });
    assert.equal(jobsRes.status, 400, "autenticado: llega la validación de modo (no un 401)");
  } finally {
    daemon.stop();
  }
});

test("pairing: raíz redirige a la consola y un origen desconocido no obtiene CORS en /pair/request", async () => {
  const daemon = startDaemon();
  try {
    await daemon.waitUp();
    const redirect = await fetch(daemon.url("/"), { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/consola");

    const evil = await fetch(daemon.url("/pair/request"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}",
    });
    // El daemon responde (no hay forma de ocultar el puerto en localhost) pero sin ACAO:
    // el navegador impide que evil.example lea el código.
    assert.equal(evil.headers.get("access-control-allow-origin"), null);

    const local = await fetch(daemon.url("/pair/request"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5010" }, body: "{}",
    });
    assert.equal(local.status, 201);
    assert.equal(local.headers.get("access-control-allow-origin"), "http://localhost:5010");
  } finally {
    daemon.stop();
  }
});

test("pairing: reiniciar Servidor Snoopy no desconecta al editor y «Desconectar» sí lo hace", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plv-persist-"));
  const sharedConfig = path.join(dir, "config.json");
  // Sin variable de orígenes: aquí solo manda el emparejamiento de la consola.
  const first = startDaemon({ configFile: sharedConfig });
  try {
    await first.waitUp();
    const consoleKey = await consoleKeyFrom(first);
    const { code } = await (await fetch(first.url("/pair/request"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: "{}",
    })).json();
    const confirmed = await fetch(first.url("/pair/confirm"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, consoleKey }),
    });
    assert.equal(confirmed.status, 200);
    const editors = (await confirmed.json()).editors;
    assert.deepEqual(editors.map((e) => e.origin), [SITE]);
    assert.equal(editors[0].connected, true);

    // El origen emparejado vive en el archivo de configuración, no en memoria.
    assert.deepEqual(JSON.parse(fs.readFileSync(sharedConfig, "utf8")).pairedOrigins.map((e) => e.origin), [SITE]);

    // /pair/pending ya no lista la solicitud confirmada: ahora vive en `editors`.
    const pending = await (await fetch(first.url("/pair/pending"), { headers: { "X-Console-Key": consoleKey } })).json();
    assert.equal(pending.pairs.length, 0, "una conexión confirmada deja de aparecer como pendiente");
    assert.equal(pending.editors.length, 1);

    const token = JSON.parse(fs.readFileSync(sharedConfig, "utf8")).token;
    first.stop();

    // Segunda arranque del mismo Snoopy: el editor sigue autorizado sin teclear nada.
    const second = startDaemon({ configFile: sharedConfig });
    try {
      await second.waitUp();
      const withOrigin = await fetch(second.url("/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Video-Token": token, Origin: SITE },
        body: JSON.stringify({ mode: "t2v", prompt: "sigue conectado" }),
      });
      assert.equal(withOrigin.status, 400, "autenticado por origen: llega la validación de modo");

      // Origen que nunca emparejó: el token solo no basta.
      const stranger = await fetch(second.url("/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Video-Token": token, Origin: "https://otro-sitio.example" },
        body: JSON.stringify({ mode: "t2v", prompt: "colándome" }),
      });
      assert.equal(stranger.status, 403);

      const otherKey = await consoleKeyFrom(second);
      const dropped = await fetch(second.url("/pair/disconnect"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Console-Key": otherKey },
        body: JSON.stringify({ origin: SITE }),
      });
      assert.equal(dropped.status, 200);
      assert.equal((await dropped.json()).editors.length, 0);

      const afterDisconnect = await fetch(second.url("/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Video-Token": token, Origin: SITE },
        body: JSON.stringify({ mode: "t2v", prompt: "ya desconectado" }),
      });
      assert.equal(afterDisconnect.status, 403, "desconectar quita el acceso de verdad");
      assert.match((await afterDisconnect.json()).error, /desconectado/i);
      assert.equal(JSON.parse(fs.readFileSync(sharedConfig, "utf8")).pairedOrigins.length, 0);
    } finally {
      second.stop();
    }
  } finally {
    first.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pairing: la consola genera un enlace de conexión de un solo uso y el editor lo canjea", async () => {
  const daemon = startDaemon();
  try {
    await daemon.waitUp();
    const consoleKey = await consoleKeyFrom(daemon);

    const denied = await fetch(daemon.url("/pair/invite"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 403, "solo la consola reparte enlaces de conexión");

    const invite = await (await fetch(daemon.url("/pair/invite"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Console-Key": consoleKey },
      body: "{}",
    })).json();
    assert.match(invite.invite, /^[0-9a-f]{32}$/);
    assert.equal(invite.origin, SITE);
    assert.equal(invite.url, SITE + "/podcaster.html?snoopy=" + invite.invite);

    const evil = await fetch(daemon.url("/pair/redeem"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ invite: invite.invite }),
    });
    assert.equal(evil.status, 403, "un sitio desconocido no puede canjear el enlace");

    const redeemed = await fetch(daemon.url("/pair/redeem"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: SITE },
      body: JSON.stringify({ invite: invite.invite }),
    });
    assert.equal(redeemed.status, 200);
    const payload = await redeemed.json();
    assert.equal(payload.status, "paired");
    assert.equal(payload.token, JSON.parse(fs.readFileSync(daemon.configFile, "utf8")).token);

    // El enlace caduca al usarse: nadie más lo aprovecha.
    const reused = await fetch(daemon.url("/pair/redeem"), {
      method: "POST", headers: { "Content-Type": "application/json", Origin: SITE },
      body: JSON.stringify({ invite: invite.invite }),
    });
    assert.equal(reused.status, 404);

    // Y el editor ya puede trabajar con ese token desde su origen.
    const jobs = await fetch(daemon.url("/jobs"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Local-Video-Token": payload.token, Origin: SITE },
      body: JSON.stringify({ mode: "t2v", prompt: "conectado con un clic" }),
    });
    assert.equal(jobs.status, 400);
  } finally {
    daemon.stop();
  }
});
