"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = new Set(process.argv.slice(2));
const verifyOnly = args.has("--verify-only");
const backendRoot = path.resolve(__dirname, "..");
const browserPath = path.resolve(
  String(process.env.PLAYWRIGHT_BROWSERS_PATH || "").trim()
  || path.join(backendRoot, ".playwright-browsers")
);

function findChromiumExecutable(baseDir = "") {
  const cleanBase = path.resolve(String(baseDir || "").trim());
  if (!cleanBase || !fs.existsSync(cleanBase)) return "";
  const stack = [{ dir: cleanBase, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    if (!current || current.depth > 5) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);
      if (entry.isFile() && entry.name === "chrome" && entryPath.includes(`${path.sep}chrome-linux64${path.sep}`)) {
        return entryPath;
      }
      if (entry.isDirectory()) stack.push({ dir: entryPath, depth: current.depth + 1 });
    }
  }
  return "";
}

function resolvePlaywrightCliPath() {
  const packageJsonPath = require.resolve("playwright/package.json", { paths: [backendRoot, process.cwd()] });
  return path.join(path.dirname(packageJsonPath), "cli.js");
}

function log(message = "", detail = "") {
  const suffix = detail ? ` ${detail}` : "";
  console.log(`[backend][playwright-install] ${message}${suffix}`);
}

if (!verifyOnly && (
  String(process.env.SKIP_PLAYWRIGHT_BROWSER_INSTALL || "").trim() === "1"
  || String(process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || "").trim() === "1"
)) {
  log("skipped", "SKIP_PLAYWRIGHT_BROWSER_INSTALL/PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set.");
  process.exit(0);
}

fs.mkdirSync(browserPath, { recursive: true });

const existingExecutable = findChromiumExecutable(browserPath);
if (existingExecutable) {
  log("chromium-ready", existingExecutable);
  process.exit(0);
}

if (verifyOnly) {
  console.error(`[backend][playwright-install] Chromium is missing in ${browserPath}`);
  process.exit(1);
}

let cliPath = "";
try {
  cliPath = resolvePlaywrightCliPath();
} catch (error) {
  console.error(`[backend][playwright-install] Cannot resolve Playwright CLI: ${error.message || error}`);
  process.exit(1);
}

log("installing-chromium", browserPath);
const result = spawnSync(process.execPath, [cliPath, "install", "chromium"], {
  cwd: backendRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browserPath
  },
  stdio: "inherit"
});

if (result.status !== 0) {
  console.error(`[backend][playwright-install] Playwright install failed with exit ${result.status}`);
  process.exit(result.status || 1);
}

const installedExecutable = findChromiumExecutable(browserPath);
if (!installedExecutable) {
  console.error(`[backend][playwright-install] Chromium install finished but no chrome executable was found in ${browserPath}`);
  process.exit(1);
}

log("chromium-installed", installedExecutable);
