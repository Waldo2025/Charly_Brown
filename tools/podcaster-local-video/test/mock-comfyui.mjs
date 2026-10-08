// ComfyUI simulado para pruebas manuales/E2E del Servidor Snoopy: implementa la
// API nativa (/system_stats, /upload/image, /prompt, /history, /view, /queue,
// /interrupt) y responde con un MP4 REAL generado por ffmpeg-static, para poder
// validar todo el circuito sin instalar Wan 2.2.
// Uso: node tools/podcaster-local-video/test/mock-comfyui.mjs [puerto=8188] [retardo=3]
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const PORT = Number(process.argv[2] || 8188);
const HISTORY_DELAY = Number(process.argv[3] || 3); // polls antes de dar salida

function resolveFfmpeg() {
  try {
    const req = createRequire(import.meta.url);
    const staticPath = req("ffmpeg-static");
    if (staticPath && fs.existsSync(staticPath)) return staticPath;
  } catch { /* sin ffmpeg-static */ }
  const which = spawnSync("ffmpeg", ["-version"]);
  if (which.status === 0) return "ffmpeg";
  throw new Error("ffmpeg no disponible: instala ffmpeg o usa el repo con ffmpeg-static");
}

function makeClip() {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mock-comfy-")), "clip_00001_.mp4");
  const ffmpeg = resolveFfmpeg();
  const result = spawnSync(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=832x480:rate=16:duration=2",
    "-vf", "drawtext=text='SNOOPY MOCK WAN 2.2':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out,
  ]);
  if (result.status !== 0) throw new Error("ffmpeg generando clip mock: " + result.stderr?.toString().slice(-300));
  return fs.readFileSync(out);
}

import { createRequire } from "node:module";
import { attachProgressSocket } from "./mock-ws.mjs";
const CLIP = makeClip();
const state = { prompts: new Map(), uploads: 0, interrupted: 0, freed: 0, progressSteps: 8, progressEveryMs: 700 };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const json = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/system_stats") return json({ system: { devices: [{ name: "mps (mock)" }] } });
    if (url.pathname === "/upload/image") { state.uploads += 1; return json({ name: "mock-first-frame.png" }); }
    if (url.pathname === "/prompt" && req.method === "POST") {
      const id = "prompt-" + (state.prompts.size + 1);
      state.prompts.set(id, { polls: 0, workflow: (() => { try { return JSON.parse(body || "{}"); } catch { return {}; } })() });
      // El avance por paso solo viaja por websocket, igual que ComfyUI real.
      state.ws?.runSteps(id, { steps: state.progressSteps, everyMs: state.progressEveryMs });
      return json({ prompt_id: id });
    }
    if (url.pathname.startsWith("/history/")) {
      const id = url.pathname.split("/")[2];
      const entry = state.prompts.get(id);
      if (!entry) return json({});
      entry.polls += 1;
      if (entry.polls <= HISTORY_DELAY) return json({});
      // Forma real de ComfyUI 0.38: SaveVideo anuncia el mp4 en `images`, no en `videos`.
      return json({
        [id]: {
          status: { status_str: "success", completed: true },
          outputs: { 11: { images: [{ filename: "clip_00001_.mp4", subfolder: "podcaster_local", type: "output" }], animated: [true] } },
        },
      });
    }
    if (url.pathname === "/view") {
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": CLIP.length });
      return res.end(CLIP);
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-comfyui] escuchando en http://127.0.0.1:${PORT} (clip real de ${Math.round(CLIP.length / 1024)} KB, retardo=${HISTORY_DELAY} polls)`);
});
