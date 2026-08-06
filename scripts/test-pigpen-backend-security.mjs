import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 18_800 + Math.floor(Math.random() * 700);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["backend/server.js"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    API_PORT: String(port),
    FIREBASE_APP_CHECK_MODE: "optional",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function waitUntilReady() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`El backend terminó antes de iniciar:\n${output}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch (_) {
      // El proceso todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Tiempo agotado esperando el backend:\n${output}`);
}

try {
  await waitUntilReady();

  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.has("x-powered-by"), false, "Express no debe revelar X-Powered-By.");
  assert.equal(health.headers.has("strict-transport-security"), false, "Express no debe imponer HSTS detrás del proxy.");
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");

  const unauthenticated = await fetch(`${origin}/api/gemini/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      payload: { contents: [{ role: "user", parts: [{ text: "hola" }] }] },
    }),
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).code, "AUTH_REQUIRED");

  const oversized = await fetch(`${origin}/api/gemini/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      payload: { contents: [{ parts: [{ text: "x".repeat(300_000) }] }] },
    }),
  });
  assert.equal(oversized.status, 413);
  const oversizedBody = await oversized.json();
  assert.equal(oversizedBody.detail?.limit, "256kb");
  assert.equal(oversized.headers.has("access-control-allow-origin"), false);

  const rejectedCors = await fetch(`${origin}/api/gemini/generate`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "POST",
    },
  });
  assert.equal(rejectedCors.status, 403);
  assert.equal(rejectedCors.headers.has("access-control-allow-origin"), false);
  assert.equal((await rejectedCors.json()).code, "CORS_NOT_ALLOWED");

  const acceptedCors = await fetch(`${origin}/api/gemini/generate`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://charly-brown.web.app",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,x-firebase-appcheck,content-type",
    },
  });
  assert.equal(acceptedCors.status, 204);
  assert.equal(acceptedCors.headers.get("access-control-allow-origin"), "https://charly-brown.web.app");

  console.log("PigPen backend security smoke OK.");
} finally {
  if (child.exitCode == null) child.kill("SIGTERM");
}
