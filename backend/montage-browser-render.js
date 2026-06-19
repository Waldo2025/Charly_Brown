"use strict";

const fs = require("node:fs");
const path = require("node:path");

function normalizeMontageRenderMode(value = "", fallback = "browser") {
  const cleanValue = String(value || "").trim().toLowerCase();
  if (cleanValue === "browser" || cleanValue === "ffmpeg-legacy") return cleanValue;
  return String(fallback || "browser").trim().toLowerCase() === "ffmpeg-legacy" ? "ffmpeg-legacy" : "browser";
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
  timeoutMs = 120000
} = {}) {
  const { chromium } = require("playwright");
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
    const html = buildMontageBrowserRenderBootstrap({ publicRoot, payload, baseVideoPath, viewport });
    await fs.promises.writeFile(bootstrapHtmlPath, html, "utf8");
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
  buildMontageBrowserRenderBootstrap,
  renderMontageBrowserOverlayVideo
};
