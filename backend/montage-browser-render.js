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
  if (cleanValue === "browser") return "browser";
  return "browser";
}

function shouldUseBrowserMontageRenderer(input = {}) {
  return normalizeMontageRenderMode(input?.renderMode || "browser") === "browser"
    && String(input?.exportMode || "normal").trim() === "normal"
    && input?.onlyAudio !== true;
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

function pushBounded(list = [], value = "", maxItems = 20) {
  const clean = String(value || "").trim();
  if (!clean) return;
  list.push(clean);
  if (list.length > maxItems) list.splice(0, list.length - maxItems);
}

function attachMontageBrowserDiagnostics(page, diagnostics = {}) {
  const state = diagnostics && typeof diagnostics === "object" ? diagnostics : {};
  state.consoleErrors = Array.isArray(state.consoleErrors) ? state.consoleErrors : [];
  state.failedRequests = Array.isArray(state.failedRequests) ? state.failedRequests : [];
  state.pageErrors = Array.isArray(state.pageErrors) ? state.pageErrors : [];
  page.on("console", (msg) => {
    const location = msg.location?.() || {};
    const locationUrl = String(location?.url || "").trim();
    const lineNumber = Number(location?.lineNumber || 0) || 0;
    const detail = `${msg.text()}${locationUrl ? ` @ ${locationUrl}${lineNumber ? `:${lineNumber}` : ""}` : ""}`;
    console.info(`[backend][montage-browser-render][console] [${msg.type()}]`, detail);
    if (msg.type() === "error") pushBounded(state.consoleErrors, detail);
  });
  page.on("pageerror", (err) => {
    const detail = `${String(err?.message || err || "pageerror").trim()}${err?.stack ? `\n${err.stack}` : ""}`;
    console.error("[backend][montage-browser-render][pageerror]", detail);
    pushBounded(state.pageErrors, detail);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure?.();
    const detail = `${request.method()} ${request.url()} :: ${String(failure?.errorText || "request_failed").trim()}`;
    console.warn("[backend][montage-browser-render][requestfailed]", detail);
    pushBounded(state.failedRequests, detail);
  });
  page.on("response", (response) => {
    const status = Number(response.status?.() || 0) || 0;
    if (status < 400) return;
    const detail = `${status} ${response.url()}`;
    console.warn("[backend][montage-browser-render][response-error]", detail);
    pushBounded(state.failedRequests, detail);
  });
  return state;
}

async function readMontageBrowserRenderState(page) {
  if (!page || page.isClosed()) return {};
  return await page.evaluate(() => ({
    ready: globalThis.__podcasterMontageRenderReady === true,
    done: globalThis.__podcasterMontageRenderDone === true,
    error: String(globalThis.__podcasterMontageRenderError || "").trim(),
    video: (() => {
      const video = document.querySelector("video");
      if (!video) return null;
      return {
        currentTime: Number.isFinite(Number(video.currentTime)) ? Number(video.currentTime) : 0,
        duration: Number.isFinite(Number(video.duration)) ? Number(video.duration) : 0,
        ended: video.ended === true,
        paused: video.paused === true,
        readyState: Number(video.readyState || 0) || 0,
        networkState: Number(video.networkState || 0) || 0,
        playbackRate: Number.isFinite(Number(video.playbackRate)) ? Number(video.playbackRate) : 1,
        src: String(video.currentSrc || video.src || "").slice(0, 500)
      };
    })(),
    href: String(location?.href || "").trim()
  })).catch(() => ({}));
}

function buildMontageBrowserDiagnosticDetail(diagnostics = {}, pageState = {}) {
  return {
    pageState,
    failedRequests: Array.isArray(diagnostics.failedRequests) ? diagnostics.failedRequests.slice(-12) : [],
    consoleErrors: Array.isArray(diagnostics.consoleErrors) ? diagnostics.consoleErrors.slice(-12) : [],
    pageErrors: Array.isArray(diagnostics.pageErrors) ? diagnostics.pageErrors.slice(-6) : []
  };
}

async function forceBrowserRenderCompletion(page, diagnostics = {}) {
  const forcedState = await page.evaluate(() => {
    const video = document.querySelector("video");
    if (video) {
      try {
        const duration = Number.isFinite(Number(video.duration)) ? Number(video.duration) : 0;
        const nextCurrentMs = Number.isFinite(Number(video.currentTime || 0)) ? Math.max(0, Number(video.currentTime || 0)) : 0;
        if (duration > 0) {
          video.currentTime = Math.min(duration, nextCurrentMs + 0.15);
        }
        video.currentTime = Math.max(0, nextCurrentMs);
        if (typeof video.pause === "function") video.pause();
      } catch (_) {}
    }
    globalThis.__podcasterMontageRenderDone = true;
    return {
      done: globalThis.__podcasterMontageRenderDone === true,
      error: String(globalThis.__podcasterMontageRenderError || "").trim()
    };
  }).catch(() => null);
  await page.waitForTimeout(250).catch(() => {});
  if (!forcedState || typeof forcedState !== "object") return buildMontageBrowserDiagnosticDetail(diagnostics, {});
  let resolvedState = {};
  try {
    resolvedState = await readMontageBrowserRenderState(page);
  } catch (_) {
    resolvedState = forcedState;
  }
  return buildMontageBrowserDiagnosticDetail(
    diagnostics,
    resolvedState && typeof resolvedState === "object" ? resolvedState : forcedState
  );
}

async function waitForMontageBrowserReady(page, diagnostics = {}, timeoutMs = 30000, stage = "browser_ready") {
  try {
    await page.waitForFunction(
      () => globalThis.__podcasterMontageRenderReady === true || Boolean(globalThis.__podcasterMontageRenderError),
      { timeout: Math.max(1000, Math.min(Number(timeoutMs || 30000) || 30000, 30000)) }
    );
  } catch (error) {
    const pageState = await readMontageBrowserRenderState(page);
    const err = new Error("montage_browser_renderer_boot_timeout");
    err.code = "montage_browser_renderer_boot_timeout";
    err.stage = stage;
    err.detail = buildMontageBrowserDiagnosticDetail(diagnostics, pageState);
    throw err;
  }
  const renderError = await page.evaluate(() => globalThis.__podcasterMontageRenderError || "").catch(() => "");
  if (renderError) {
    const pageState = await readMontageBrowserRenderState(page);
    const err = new Error(String(renderError || "browser_render_failed"));
    err.code = "browser_render_failed";
    err.stage = stage;
    err.detail = buildMontageBrowserDiagnosticDetail(diagnostics, pageState);
    throw err;
  }
}

async function preflightMontageBrowserRenderer({
  publicRoot = "",
  payload = {},
  bootstrapHtmlPath = "",
  viewport = { width: 1280, height: 720 },
  timeoutMs = 20000
} = {}) {
  const availability = getMontageBrowserRendererAvailability();
  if (availability.available !== true || !availability.playwright?.chromium) {
    const err = new Error(availability.message || "playwright_unavailable");
    err.code = availability.code || "playwright_unavailable";
    throw err;
  }
  const { chromium } = availability.playwright;
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--allow-file-access-from-files",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  let context = null;
  let page = null;
  try {
    context = await browser.newContext({
      viewport: {
        width: Math.max(2, Math.round(Number(viewport?.width || 1280) || 1280)),
        height: Math.max(2, Math.round(Number(viewport?.height || 720) || 720))
      }
    });
    page = await context.newPage();
    const diagnostics = attachMontageBrowserDiagnostics(page, {});
    const html = buildMontageBrowserRenderBootstrap({
      publicRoot,
      payload,
      baseVideoPath: "",
      viewport
    });
    await fs.promises.writeFile(bootstrapHtmlPath, html, "utf8");
    await page.goto(pathToFileUrl(bootstrapHtmlPath), { waitUntil: "load", timeout: timeoutMs });
    await waitForMontageBrowserReady(page, diagnostics, timeoutMs, "browser_preflight");
    return true;
  } finally {
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
    const diagnostics = attachMontageBrowserDiagnostics(page, {});
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
    await waitForMontageBrowserReady(page, diagnostics, timeoutMs, "browser_render_ready");
    const renderStartAtMs = Date.now();
    const expectedDurationMs = Math.max(
      0,
      Math.round(Number(payload?.expectedDurationMs || 0) || 0)
    );
    const forceDoneTimeoutMs = Math.max(30000, Math.max(10000, expectedDurationMs) + 12000);
    try {
      await page.waitForFunction(() => window.__podcasterMontageRenderDone === true || Boolean(window.__podcasterMontageRenderError), { timeout: timeoutMs });
    } catch (error) {
      const pageState = await readMontageBrowserRenderState(page);
      const recoveryDetail = await forceBrowserRenderCompletion(page, diagnostics);
      const finalPageState = recoveryDetail?.pageState || pageState;
      if (finalPageState?.error) {
        const err = new Error(String(finalPageState.error || "browser_render_failed"));
        err.code = "browser_render_failed";
        err.stage = "browser_render_record";
        err.detail = recoveryDetail;
        throw err;
      }
      const elapsedMs = Math.max(0, Date.now() - renderStartAtMs);
      const videoDurationMs = Math.round(Number(finalPageState?.video?.duration || 0) * 1000);
      const videoCurrentMs = Math.round(Number(finalPageState?.video?.currentTime || 0) * 1000);
      const targetDurationMs = Math.max(expectedDurationMs, Number.isFinite(videoDurationMs) ? videoDurationMs : 0);
      const forceDoneByProgress = Number.isFinite(videoDurationMs) && videoDurationMs > 0 && videoCurrentMs >= Math.max(0, videoDurationMs - 120);
      const forceDoneByTime = targetDurationMs <= 0
        ? elapsedMs >= forceDoneTimeoutMs
        : elapsedMs >= Math.max(30000, targetDurationMs + 12000);
      if (!finalPageState?.done && !(forceDoneByProgress || forceDoneByTime)) {
        const err = new Error("montage_browser_renderer_record_timeout");
        err.code = "montage_browser_renderer_record_timeout";
        err.stage = "browser_render_record";
        err.detail = recoveryDetail;
        throw err;
      }
      return;
    }
    const renderError = await page.evaluate(() => window.__podcasterMontageRenderError || "");
    if (renderError) {
      const err = new Error(String(renderError || "browser_render_failed"));
      err.code = "browser_render_failed";
      err.detail = buildMontageBrowserDiagnosticDetail(diagnostics, await readMontageBrowserRenderState(page));
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
  shouldUseBrowserMontageRenderer,
  getMontageBrowserRendererAvailability,
  isMontageBrowserRendererAvailable,
  buildMontageBrowserRenderBootstrap,
  preflightMontageBrowserRenderer,
  renderMontageBrowserOverlayVideo
};
