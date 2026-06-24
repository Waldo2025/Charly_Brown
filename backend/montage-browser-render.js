"use strict";

const fs = require("node:fs");
const path = require("node:path");

let cachedMontageBrowserRendererAvailability = null;

function ensureRenderPlaywrightBrowserPathEnv() {
  const isRenderRuntime = Boolean(
    String(process.env.RENDER_EXTERNAL_HOSTNAME || process.env.RENDER_SERVICE_ID || "").trim()
  );
  if (!isRenderRuntime) return;
  if (String(process.env.PLAYWRIGHT_BROWSERS_PATH || "").trim()) return;
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(__dirname, ".playwright-browsers");
}

function resolveBundledChromiumExecutableFromBrowserPath(browserPath = "") {
  const baseDir = path.resolve(String(browserPath || "").trim());
  if (!baseDir || !fs.existsSync(baseDir)) return "";
  const candidates = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => path.join(baseDir, entry.name, "chrome-linux64", "chrome"))
    .filter((candidate) => fs.existsSync(candidate));
  return candidates[0] || "";
}

function buildRendererUnavailableState({
  code = "playwright_unavailable",
  message = "playwright_unavailable",
  rawCode = "",
  playwrightModuleAvailable = false,
  playwrightChromiumExecutablePresent = false,
  playwrightChromiumExecutablePath = ""
} = {}) {
  return {
    available: false,
    code,
    message,
    rawCode: String(rawCode || "").trim() || undefined,
    playwrightModuleAvailable: playwrightModuleAvailable === true,
    playwrightChromiumExecutablePresent: playwrightChromiumExecutablePresent === true,
    playwrightChromiumExecutablePath: String(playwrightChromiumExecutablePath || "").trim() || undefined
  };
}

function normalizeMontageRenderMode(value = "", fallback = "browser") {
  const cleanValue = String(value || "").trim().toLowerCase();
  if (cleanValue === "ffmpeg-legacy") return "ffmpeg-legacy";
  if (cleanValue === "browser") return "browser";
  return "browser";
}

function shouldUseBrowserMontageRenderer(input = {}) {
  return normalizeMontageRenderMode(input?.renderMode || "browser") === "browser"
    && String(input?.exportMode || "normal").trim() === "normal"
    && input?.onlyAudio !== true;
}

function resolveRuntimeMontageRenderMode(requestedValue = "", availabilityOverride = null) {
  const requestedMode = normalizeMontageRenderMode(requestedValue || "browser");
  if (requestedMode !== "browser") {
    return {
      requestedMode,
      renderMode: requestedMode,
      downgraded: false,
      reasonCode: "",
      reasonMessage: ""
    };
  }
  const availability = availabilityOverride && typeof availabilityOverride === "object"
    ? availabilityOverride
    : getMontageBrowserRendererAvailability();
  if (availability?.available === true) {
    return {
      requestedMode,
      renderMode: "browser",
      downgraded: false,
      reasonCode: "",
      reasonMessage: ""
    };
  }
  return {
    requestedMode,
    renderMode: "ffmpeg-legacy",
    downgraded: true,
    reasonCode: String(availability?.code || "playwright_unavailable").trim() || "playwright_unavailable",
    reasonMessage: String(availability?.message || "Playwright Chromium no esta disponible en este runtime.").trim() || "Playwright Chromium no esta disponible en este runtime."
  };
}

function pathToFileUrl(targetPath = "") {
  const resolved = path.resolve(String(targetPath || "").trim());
  return `file://${resolved.startsWith("/") ? "" : "/"}${resolved.replace(/\\/g, "/")}`;
}

function getMontageBrowserRendererAvailability() {
  if (cachedMontageBrowserRendererAvailability) return cachedMontageBrowserRendererAvailability;
  try {
    ensureRenderPlaywrightBrowserPathEnv();
    const playwright = require("playwright");
    const playwrightModuleAvailable = true;
    const chromium = playwright?.chromium || null;
    if (!chromium || typeof chromium.launch !== "function") {
      cachedMontageBrowserRendererAvailability = buildRendererUnavailableState({
        code: "playwright_chromium_unavailable",
        message: "Playwright Chromium no esta disponible en este runtime.",
        playwrightModuleAvailable
      });
      return cachedMontageBrowserRendererAvailability;
    }
    let executablePath = "";
    try {
      executablePath = String(chromium.executablePath?.() || "").trim();
    } catch (error) {
      executablePath = "";
    }
    if (!executablePath || !fs.existsSync(executablePath)) {
      const fallbackPath = resolveBundledChromiumExecutableFromBrowserPath(process.env.PLAYWRIGHT_BROWSERS_PATH || "");
      if (fallbackPath) {
        executablePath = fallbackPath;
      }
    }
    const executablePresent = Boolean(executablePath) && fs.existsSync(executablePath);
    if (!executablePresent) {
      cachedMontageBrowserRendererAvailability = buildRendererUnavailableState({
        code: "playwright_chromium_missing",
        message: executablePath
          ? `Chromium de Playwright no esta instalado en ${executablePath}.`
          : "Chromium de Playwright no esta instalado.",
        playwrightModuleAvailable,
        playwrightChromiumExecutablePath: executablePath
      });
      return cachedMontageBrowserRendererAvailability;
    }
    cachedMontageBrowserRendererAvailability = {
      available: Boolean(playwright?.chromium),
      playwright,
      playwrightModuleAvailable,
      playwrightChromiumExecutablePresent: true,
      playwrightChromiumExecutablePath: executablePath
    };
  } catch (error) {
    cachedMontageBrowserRendererAvailability = buildRendererUnavailableState({
      code: "playwright_unavailable",
      message: String(error?.message || error || "playwright_unavailable"),
      rawCode: String(error?.code || "").trim()
    });
  }
  return cachedMontageBrowserRendererAvailability;
}

function isMontageBrowserRendererAvailable() {
  return getMontageBrowserRendererAvailability().available === true;
}

function buildMontageBrowserRenderBootstrap({
  publicRoot = "",
  payload = {},
  baseVideoPath = "",
  viewport = { width: 1280, height: 720 }
} = {}) {
  const cleanPublicRoot = path.resolve(String(publicRoot || "").trim() || path.resolve(__dirname, "..", "public"));
  const config = {
    payload,
    baseVideoUrl: pathToFileUrl(baseVideoPath),
    viewport: {
      width: Math.max(2, Math.round(Number(viewport?.width || 1280) || 1280)),
      height: Math.max(2, Math.round(Number(viewport?.height || 720) || 720))
    }
  };
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Podcaster Browser Render</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Bungee&family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=Lexend:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Oxanium:wght@400;500;600;700&family=Pacifico&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Sora:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@400;500;600;700&family=Unbounded:wght@400;500;600;700&family=Urbanist:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${pathToFileUrl(path.join(cleanPublicRoot, "podcaster.css"))}">
  </head>
  <body>
    <script>window.__PODCASTER_MONTAGE_RENDER_CONFIG__ = ${JSON.stringify(config)};</script>
    <script src="${pathToFileUrl(path.join(cleanPublicRoot, "podcaster", "podcaster-on-screen-text.js"))}"></script>
    <script src="${pathToFileUrl(path.join(cleanPublicRoot, "podcaster", "podcaster-text-render.js"))}"></script>
    <script type="module" src="${pathToFileUrl(path.join(cleanPublicRoot, "podcaster", "podcaster-render.js"))}"></script>
  </body>
</html>`;
}

async function renderMontageBrowserOverlayVideo({
  publicRoot = "",
  payload = {},
  baseVideoPath = "",
  bootstrapHtmlPath = "",
  outputDir = "",
  viewport = { width: 1280, height: 720 },
  timeoutMs = 120000,
  shouldAbort = null,
  registerAbortHandler = null
} = {}) {
  const availability = getMontageBrowserRendererAvailability();
  if (availability.available !== true || !availability.playwright?.chromium) {
    const err = new Error(availability.message || "playwright_unavailable");
    err.code = availability.code || "playwright_unavailable";
    throw err;
  }
  const { chromium } = availability.playwright;
  const videoDir = path.resolve(String(outputDir || "").trim());
  await fs.promises.mkdir(videoDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--allow-file-access-from-files",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  let context = null;
  let page = null;
  let abortPollTimer = null;
  let unregisterAbortHandler = null;
  try {
    context = await browser.newContext({
      viewport: {
        width: Math.max(2, Math.round(Number(viewport?.width || 1280) || 1280)),
        height: Math.max(2, Math.round(Number(viewport?.height || 720) || 720))
      },
      recordVideo: {
        dir: videoDir,
        size: {
          width: Math.max(2, Math.round(Number(viewport?.width || 1280) || 1280)),
          height: Math.max(2, Math.round(Number(viewport?.height || 720) || 720))
        }
      }
    });
    page = await context.newPage();
    page.on("console", (msg) => {
      console.info(`[backend][montage-browser-render][console] [${msg.type()}]`, msg.text());
    });
    page.on("pageerror", (err) => {
      console.error("[backend][montage-browser-render][pageerror]", err.message, err.stack);
    });
    const html = buildMontageBrowserRenderBootstrap({ publicRoot, payload, baseVideoPath, viewport });
    await fs.promises.writeFile(bootstrapHtmlPath, html, "utf8");
    const abortBrowserRender = async () => {
      try {
        if (page && !page.isClosed()) await page.close();
      } catch (_) {}
      try {
        if (context) await context.close();
      } catch (_) {}
      try {
        await browser.close();
      } catch (_) {}
    };
    if (typeof shouldAbort === "function") {
      abortPollTimer = setInterval(() => {
        let aborted = false;
        try {
          aborted = shouldAbort() === true;
        } catch (_) {
          aborted = false;
        }
        if (!aborted) return;
        void abortBrowserRender();
      }, 300);
      if (typeof abortPollTimer.unref === "function") abortPollTimer.unref();
    }
    if (typeof registerAbortHandler === "function") {
      unregisterAbortHandler = registerAbortHandler(() => {
        void abortBrowserRender();
      });
    }
    await page.goto(pathToFileUrl(bootstrapHtmlPath), { waitUntil: "load", timeout: timeoutMs });
    await page.waitForFunction(() => window.__podcasterMontageRenderReady === true, { timeout: Math.min(timeoutMs, 30000) });
    await page.waitForFunction(() => window.__podcasterMontageRenderDone === true || Boolean(window.__podcasterMontageRenderError), { timeout: timeoutMs });
    const renderError = await page.evaluate(() => window.__podcasterMontageRenderError || "");
    if (renderError) {
      const err = new Error(String(renderError || "browser_render_failed"));
      err.code = "browser_render_failed";
      throw err;
    }
    const videoHandle = await page.video();
    await page.close();
    await context.close();
    await browser.close();
    return videoHandle ? await videoHandle.path() : "";
  } finally {
    if (abortPollTimer) {
      clearInterval(abortPollTimer);
      abortPollTimer = null;
    }
    if (typeof unregisterAbortHandler === "function") unregisterAbortHandler();
    try {
      if (page && !page.isClosed()) await page.close();
    } catch (_) {}
    try {
      if (context) await context.close();
    } catch (_) {}
    try {
      await browser.close();
    } catch (_) {}
  }
}

module.exports = {
  normalizeMontageRenderMode,
  resolveRuntimeMontageRenderMode,
  shouldUseBrowserMontageRenderer,
  getMontageBrowserRendererAvailability,
  isMontageBrowserRendererAvailable,
  buildMontageBrowserRenderBootstrap,
  renderMontageBrowserOverlayVideo
};
