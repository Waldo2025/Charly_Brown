#!/usr/bin/env node
// Empaqueta "Servidor Snoopy" (motor de video local gratis) como una app de macOS
// con icono, lista para descargar desde el sitio:
//   public/descargas/servidor-snoopy-mac.zip
// El usuario descomprime, arrastra "Servidor Snoopy.app" a Aplicaciones y la abre con
// doble clic (o desde Launchpad/Dock). Doble clic en el .command seguía siendo un paso
// de experto; aquí desaparece.
// Uso: node scripts/build-servidor-snoopy.cjs        -> (re)construye el ZIP
//      node scripts/build-servidor-snoopy.cjs --check -> exit 1 si el ZIP está obsoleto
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "tools", "podcaster-local-video");
const OUT_DIR = path.join(ROOT, "public", "descargas");
const OUT_ZIP = path.join(OUT_DIR, "servidor-snoopy-mac.zip");
const OUT_META = path.join(OUT_DIR, "servidor-snoopy.json");
const APP_NAME = "Servidor Snoopy.app";
const APP_EXECUTABLE = "servidor-snoopy";
const BUNDLE_ID = "app.charlybrown.servidorsnoopy";

// El motor se resuelve entero relativo a su carpeta (assets/snoopy.png, workflows/),
// así que viaja junto dentro de Contents/Resources/engine.
const ENGINE_FILES = [
  "server.mjs",
  "comfy-client.mjs",
  "console-page.mjs",
  "engine-installer.mjs",
  "clip-polish.mjs",
  "polish-clip.py",
  "workflows/wan22-i2v.json",
  "assets/snoopy.png",
];
const APP_SOURCES = ["app/Info.plist", "app/servidor-snoopy-launcher.sh"];
const SOURCES = [...ENGINE_FILES, ...APP_SOURCES, "README.md"];

// Giga bytes libres que pide el instalador del motor según la RAM del Mac.
const DISK_GB_BY_TIER = { "8gb": 12, "16gb": 15, grande: 25 };
const ICON_ENTRIES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

function newestSourceMs() {
  let newest = 0;
  for (const rel of SOURCES) {
    const stat = fs.statSync(path.join(SRC, rel), { throwIfNoEntry: false });
    if (!stat) throw new Error(`Falta el archivo del paquete: tools/podcaster-local-video/${rel}`);
    newest = Math.max(newest, stat.mtimeMs);
  }
  return newest;
}

function isStale() {
  const zipStat = fs.statSync(OUT_ZIP, { throwIfNoEntry: false });
  if (!zipStat) return true;
  return newestSourceMs() > zipStat.mtimeMs;
}

function bundleVersion() {
  const server = fs.readFileSync(path.join(SRC, "server.mjs"), "utf8");
  return server.match(/const VERSION = "([^"]+)"/)?.[1] || "0.1.0";
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} falló: ${String(result.stderr || result.stdout || "").slice(0, 400)}`);
  }
  return String(result.stdout || "");
}

function buildIcon(resources) {
  const source = path.join(SRC, "assets", "snoopy.png");
  const iconset = path.join(resources, "AppIcon.iconset");
  fs.mkdirSync(iconset, { recursive: true });
  for (const [name, px] of ICON_ENTRIES) {
    run("sips", ["-z", String(px), String(px), source, "--out", path.join(iconset, name)]);
  }
  run("iconutil", ["-c", "icns", iconset, "--output", path.join(resources, "AppIcon.icns")]);
  fs.rmSync(iconset, { recursive: true, force: true });
}

function build() {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "servidor-snoopy-"));
  const appDir = path.join(staging, APP_NAME);
  const contents = path.join(appDir, "Contents");
  const resources = path.join(contents, "Resources");
  const engineDir = path.join(resources, "engine");

  try {
    fs.mkdirSync(path.join(contents, "MacOS"), { recursive: true });
    fs.mkdirSync(engineDir, { recursive: true });

    for (const rel of ENGINE_FILES) {
      const dest = path.join(engineDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(SRC, rel), dest);
    }

    const version = bundleVersion();
    const plist = fs.readFileSync(path.join(SRC, "app", "Info.plist"), "utf8")
      .replaceAll("BUILD_VERSION", version);
    fs.writeFileSync(path.join(contents, "Info.plist"), plist);
    fs.writeFileSync(path.join(contents, "PkgInfo"), "APPL????");

    const launcher = path.join(contents, "MacOS", APP_EXECUTABLE);
    fs.copyFileSync(path.join(SRC, "app", "servidor-snoopy-launcher.sh"), launcher);
    fs.chmodSync(launcher, 0o755);

    buildIcon(resources);

    fs.copyFileSync(path.join(SRC, "README.md"), path.join(staging, "LEEME.txt"));

    // Firma ad-hoc: sin ella macOS bloquea el binario del bundle en algunas versiones.
    run("codesign", ["--force", "--deep", "--sign", "-", appDir]);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.rmSync(OUT_ZIP, { force: true });
    run("zip", ["-r", "-X", "-q", OUT_ZIP, APP_NAME, "LEEME.txt"], { cwd: staging });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  const bytes = fs.statSync(OUT_ZIP).size;
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(OUT_ZIP)).digest("hex");
  fs.writeFileSync(OUT_META, JSON.stringify({
    name: "Servidor Snoopy",
    kind: "app",
    appName: APP_NAME,
    bundleId: BUNDLE_ID,
    version: bundleVersion(),
    codesign: "adhoc",
    platform: "macos-apple-silicon",
    downloadPath: "/descargas/servidor-snoopy-mac.zip",
    requiresDiskGb: DISK_GB_BY_TIER["16gb"],
    diskGbByTier: DISK_GB_BY_TIER,
    bytes,
    sha256,
    builtAt: new Date().toISOString(),
  }, null, 2));
  console.log(`Servidor Snoopy empaquetado: ${OUT_ZIP} (${(bytes / 1024).toFixed(0)} KB, sha256 ${sha256.slice(0, 12)}…)`);
}

if (process.argv.includes("--check")) {
  if (isStale()) {
    console.error("El paquete de Servidor Snoopy está obsoleto; corre: node scripts/build-servidor-snoopy.cjs");
    process.exit(1);
  }
  console.log("Paquete Servidor Snoopy actualizado.");
  process.exit(0);
}

build();
