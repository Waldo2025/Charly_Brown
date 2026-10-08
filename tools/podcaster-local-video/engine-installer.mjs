// Instalador del motor de video de Snoopy: ComfyUI + Wan 2.2 TI2V-5B.
// Lo arranca la consola vía POST /install/start (server.mjs) y lee sus líneas
// JSON por stdout para pintar la barra de progreso. No pide Terminal al usuario.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hostTier, hostRamGb, engineArtifactById } from "./comfy-client.mjs";

const COMFY_DIR = process.env.COMFY_HOME || path.join(os.homedir(), "ComfyUI");
const CONFIG_FILE = process.env.PODCASTER_LOCAL_VIDEO_CONFIG
  || path.join(os.homedir(), ".charlybrown", "podcaster-local-video.json");
const HF_BASE = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files";
const GGUF_HF_BASE = "https://huggingface.co/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main";
const GGUF_CLIP_HF_BASE = "https://huggingface.co/city96/umt5-xxl-encoder-gguf/resolve/main";
const GGUF_NODE_DIR = path.join(COMFY_DIR, "custom_nodes", "ComfyUI-GGUF");

/**
 * Qué descarga Snoopy según la memoria del Mac. Un Mac de 16 GB no puede con los
 * safetensors fp16 (10 GB) ni con el codificador fp8 (7 GB): el sistema se queda sin
 * RAM y la generación no avanza nunca, así que en equipos ligeros todo va en GGUF.
 */
export function modelPicksForTier(tier = hostTier()) {
  const vae = { label: "VAE (1,3 GB)", dir: "vae", candidates: ["wan2.2_vae.safetensors", "wan_2.1_vae.safetensors"] };
  if (tier.quant === "full") {
    return [
      { label: "modelo Wan 2.2 completo (10 GB)", dir: "diffusion_models", candidates: ["wan2.2_ti2v_5B_fp16.safetensors"] },
      { label: "codificador de texto (7 GB)", dir: "text_encoders", candidates: ["umt5_xxl_fp8_e4m3fn_scaled.safetensors", "umt5_xxl_fp16.safetensors", "umt5-xxl-enc-bf16.safetensors"] },
      vae,
    ];
  }
  return [
    {
      label: `modelo Wan 2.2 ligero ${tier.quant} (3 GB)`,
      dir: "diffusion_models",
      base: GGUF_HF_BASE,
      flat: true,
      candidates: [`Wan2.2-TI2V-5B-${tier.quant}.gguf`, "Wan2.2-TI2V-5B-Q4_K_M.gguf"],
    },
    {
      label: `codificador de texto ligero ${tier.quant} (3 GB)`,
      dir: "text_encoders",
      base: GGUF_CLIP_HF_BASE,
      flat: true,
      candidates: [`umt5-xxl-encoder-${tier.quant}.gguf`, "umt5-xxl-encoder-Q4_K_M.gguf"],
    },
    vae,
  ];
}

/**
 * Descarga de un peldaño de la escalera (nivel Rápido = Turbo): solo archivos, sin
 * clonar ComfyUI ni reinstalar Python. Devuelve null si el peldaño no existe o el
 * Mac no lo aguanta, y entonces el preset Rápido se queda en el modelo base.
 */
export function ladderPicksForTier(tier = hostTier(), artifactId = "") {
  const artifact = engineArtifactById(artifactId);
  if (!artifact.lazyDownload || !Array.isArray(artifact.unetCandidates)) return null;
  if (tier.id === "8gb") return null;
  return [
    {
      label: `${artifact.label} · modelo (${artifact.requiredGb} GB)`,
      dir: "diffusion_models",
      base: artifact.unetBase,
      flat: true,
      candidates: artifact.unetCandidates,
    },
    {
      label: `${artifact.label} · codificador de texto`,
      dir: "text_encoders",
      base: artifact.clipBase,
      flat: true,
      candidates: artifact.clipCandidates,
    },
  ];
}

const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");const step = (id, percent, message) => out({ type: "step", id, percent, message });
const fail = (message, hint) => {
  out({ type: "error", message, hint: hint || "" });
  process.exit(1);
};

function run(cmd, args, { onLine, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let tail = "";
    const consume = (buf, sink) => {
      const text = buf.toString("utf8");
      tail = (tail + text).slice(-6000);
      if (onLine) text.split("\n").filter(Boolean).slice(-3).forEach((l) => onLine(l.slice(0, 200)));
      void sink;
    };
    child.stdout.on("data", (b) => consume(b));
    child.stderr.on("data", (b) => consume(b));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} terminó con código ${code}\n${tail.slice(-400)}`))));
  });
}

async function exists(cmd, args = ["--version"]) {
  try {
    await run(cmd, args);
    return true;
  } catch {
    return false;
  }
}

function freeGb() {
  try {
    const stat = fs.statfsSync(os.homedir());
    return Math.floor((stat.bavail * stat.bsize) / 1024 / 1024 / 1024);
  } catch {
    return Infinity;
  }
}

async function detectPython() {
  const candidates = ["python3.13", "python3.12", "python3.11", "python3.10", "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "python3"];
  for (const c of candidates) {
    if (!(await exists(c, ["-c", "import sys"]))) continue;
    try {
      const version = await run(c, ["-c", "import sys;print('%d.%d'%sys.version_info[:2])"]);
      const [major, minor] = version.trim().split(".").map(Number);
      if (major === 3 && minor >= 10 && minor <= 13) return { cmd: c, version: version.trim() };
    } catch { /* prueba siguiente */ }
  }
  return null;
}

async function headUrl(url) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const size = Number(response.headers.get("content-length") || 0);
    return { size: size > 1_000_000 ? size : 0 };
  } catch {
    return null;
  }
}

async function download(url, dest, { percentBase, percentSpan, label, onPulse, expectedSize = 0 } = {}) {
  if (fs.existsSync(dest)) {
    const have = fs.statSync(dest).size;
    const complete = expectedSize > 0 ? have === expectedSize : have > 1_000_000;
    if (complete) {
      step("model", Math.round(percentBase + percentSpan), `${label}: ya descargado, se reutiliza.`);
      return;
    }
    step("model", percentBase, `Reanudando ${label}: van ${Math.round(have / 1e6)} MB de ${Math.round((expectedSize || 0) / 1e6)} MB…`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  step("model", percentBase, `Descargando ${label}…`);
  await run("curl", ["-fL", "--retry", "3", "-C", "-", "--progress-bar", "-o", dest, url], {
    onLine: () => {},
  }).catch(async (error) => {
    fs.rmSync(dest, { force: true });
    throw error;
  });
  if (onPulse) onPulse();
  step("model", Math.round(percentBase + percentSpan), `${label} listo (${Math.round(fs.statSync(dest).size / 1024 / 1024)} MB).`);
}

async function runFullInstall() {
  step("preflight", 2, "Revisando requisitos del Mac…");
  if (process.platform !== "darwin") fail("Este instalador es para Mac (Apple Silicon).");
  const gb = freeGb();
  const tier = hostTier();
  const light = tier.quant !== "full";
  const requiredGb = tier.id === "grande" ? 25 : tier.id === "8gb" ? 12 : 15;
  if (gb < requiredGb && Number.isFinite(gb)) fail(`Falta espacio en disco: hay ~${gb} GB libres y se necesitan ~${requiredGb} GB.`, "Vacía Downloads/películas y reintenta.");
  if (!(await exists("git"))) fail("Falta «git».", "macOS lo instala solo: en Terminal escribe xcode-select --install (único comando que harás).");
  const python = await detectPython();
  if (!python) fail("No encuentro Python 3.10–3.13.", "Instala Python 3.12 desde python.org (descarga el .pkg para Apple silicon) y pulsa Reintentar.");
  step("preflight", 6, `OK: git + Python ${python.version}, ${Number.isFinite(gb) ? `${gb} GB libres` : "espacio suficiente"}.`);

  if (!fs.existsSync(path.join(COMFY_DIR, "main.py"))) {
    step("clone", 8, "Descargando ComfyUI (open source)…");
    fs.mkdirSync(path.dirname(COMFY_DIR), { recursive: true });
    await run("git", ["clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI", COMFY_DIR]);
  } else {
    step("clone", 10, "ComfyUI ya estaba en ~/ComfyUI, lo reutilizo.");
  }

  const venvPython = path.join(COMFY_DIR, "venv", "bin", "python");
  if (!fs.existsSync(venvPython)) {
    step("venv", 14, "Creando el entorno de Python de ComfyUI…");
    await run(python.cmd, ["-m", "venv", path.join(COMFY_DIR, "venv")]);
  }
  step("pip", 18, "Instalando PyTorch (aceleración Metal/MPS)… esto tarda varios minutos.");
  await run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  await run(venvPython, ["-m", "pip", "install", "torch", "torchvision", "torchaudio"]);
  step("pip", 40, "Instalando dependencias de ComfyUI…");
  await run(venvPython, ["-m", "pip", "install", "-r", path.join(COMFY_DIR, "requirements.txt")]);
  step("pip", 52, "Motor ComfyUI instalado.");

  const groups = modelPicksForTier(tier);
  if (light) {
    step("gguf", 53, `Tu Mac tiene ${Math.round(hostRamGb())} GB de RAM: instalo la versión ligera de Wan 2.2 (${tier.quant}), modelo y codificador en GGUF, para que quepan en memoria…`);
    if (!fs.existsSync(path.join(GGUF_NODE_DIR, "nodes.py"))) {
      await run("git", ["clone", "--depth", "1", "https://github.com/city96/ComfyUI-GGUF", GGUF_NODE_DIR]);
    }
    await run(venvPython, ["-m", "pip", "install", "-r", path.join(GGUF_NODE_DIR, "requirements.txt")]);
  }

  const picks = await downloadGroups(groups, { percentBase: 55, spanPerGroup: 13 });

  step("config", 96, "Ajustando la consola de Snoopy con los modelos elegidos…");
  const saved = saveConfigPatch({ models: { unet: picks[0], clip: picks[1], vae: picks[2] } });

  step("done", 100, "🟢 Motor listo. Snoopy puede generar videos gratis con tu GPU.");
  out({ type: "done", comfyDir: COMFY_DIR, models: saved.models });
}

/**
 * Peldaño extra de calidad (nivel Rápido): llegan solo los archivos GGUF y el lector
 * de GGUF, porque ComfyUI y PyTorch ya están del motor base. No pisa `models`: si
 * esta descarga falla, Snoopy sigue generando con el paquete de siempre.
 */
async function installLadder(artifactId) {
  step("preflight", 2, "Revisando la escalera de calidad…");
  if (process.platform !== "darwin") fail("Este instalador es para Mac (Apple Silicon).");
  const tier = hostTier();
  const picks = ladderPicksForTier(tier, artifactId);
  if (!picks) fail(`El nivel «${artifactId || "?"}» no se puede descargar en este Mac.`, "El modo Rápido seguirá usando el modelo base; nada de esto estorba.");
  if (tier.id === "8gb") fail("Tu Mac de 8 GB no aguanta este nivel: el modelo y su codificador no caben en memoria.", "No hace falta descargar nada: Rápido ya funciona con el modelo base.");
  if (!fs.existsSync(path.join(COMFY_DIR, "main.py"))) fail("Falta el motor de ComfyUI.", "Primero instala el motor con el botón principal de la consola; después podrás bajar el nivel Rápido.");
  const artifact = engineArtifactById(artifactId);
  const needGb = Math.ceil(Number(artifact.requiredGb) || 8) + 3;
  const gb = freeGb();
  if (gb < needGb && Number.isFinite(gb)) fail(`Falta espacio en disco: hay ~${gb} GB libres y este nivel pide ~${needGb} GB de margen.`, "Vacía Downloads/películas o clips viejos y reintenta.");
  step("preflight", 8, `OK: motor base instalado, ${Number.isFinite(gb) ? `${gb} GB libres` : "espacio suficiente"}.`);

  // Los Turbo vienen en GGUF: un Mac grande instaló safetensors y no tiene el nodo
  // que los lee, así que se añade aquí (pesa KBs) antes de bajar los archivos.
  if (!fs.existsSync(path.join(GGUF_NODE_DIR, "nodes.py"))) {
    step("gguf", 12, "Añadiendo el lector de modelos GGUF…");
    if (!(await exists("git"))) fail("Falta «git» para el lector GGUF.", "En Terminal escribe xcode-select --install y pulsa Reintentar.");
    fs.mkdirSync(path.dirname(GGUF_NODE_DIR), { recursive: true });
    await run("git", ["clone", "--depth", "1", "https://github.com/city96/ComfyUI-GGUF", GGUF_NODE_DIR]);
    const venvPython = path.join(COMFY_DIR, "venv", "bin", "python");
    if (fs.existsSync(venvPython)) {
      await run(venvPython, ["-m", "pip", "install", "-r", path.join(GGUF_NODE_DIR, "requirements.txt")]);
    }
  }

  const names = await downloadGroups(picks, { percentBase: 16, spanPerGroup: 40 });

  step("config", 96, "Ajustando la consola de Snoopy con el nivel Rápido…");
  const saved = saveConfigPatch({ ladderModels: { unet: names[0], clip: names[1] } });

  step("done", 100, `🟢 Nivel Rápido listo: ${artifact.label} ya está en este Mac.`);
  out({ type: "done", comfyDir: COMFY_DIR, ladderModels: saved.ladderModels, artifactId });
}

/** Descarga los archivos de cada peldaño y devuelve sus nombres en orden. */
async function downloadGroups(groups, { percentBase, spanPerGroup }) {
  const names = [];
  let cursor = percentBase;
  for (const group of groups) {
    let chosen = null;
    for (const name of group.candidates) {
      const url = group.flat ? `${group.base}/${name}` : `${group.base || HF_BASE}/${group.dir}/${name}`;
      const head = await headUrl(url);
      if (head) { chosen = { name, url, size: head.size }; break; }
    }
    if (!chosen) fail(`No encontré ningún archivo para ${group.label} en Hugging Face.`, "Revisa tu conexión e inténtalo de nuevo.");
    const dest = path.join(COMFY_DIR, "models", group.dir, chosen.name);
    await download(chosen.url, dest, { percentBase: cursor, percentSpan: spanPerGroup, label: group.label, expectedSize: chosen.size });
    names.push(chosen.name);
    cursor += spanPerGroup;
  }
  return names;
}

/** Fusiona en ~/.charlybrown/podcaster-local-video.json sin borrar lo que ya había. */
function saveConfigPatch(patch) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { /* primera ejecución */ }
  const next = { ...saved, ...patch };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

// --ladder <peldaño> = solo descargar ese nivel extra; sin argumento, instalación
// completa del motor (clone + Python + modelo base).
async function main(argv) {
  const ladder = argv.indexOf("--ladder");
  if (ladder >= 0) return installLadder(String(argv[ladder + 1] || "").trim());
  return runFullInstall();
}

// Solo se ejecuta como script (lo lanza server.mjs con process.execPath + su ruta);
// así los tests pueden importar modelPicksForTier y ladderPicksForTier sin instalar nada.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main(process.argv.slice(2)).catch((error) => fail(String(error?.message || error)));
