"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { getMontageBrowserRendererAvailability } = require("./montage-browser-render.js");

const PRESETS = new Set(["none", "fade-rise", "slide-reveal", "spring-pop", "soft-float"]);

function normalizeMotion(raw = null) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    preset: PRESETS.has(value.preset) ? value.preset : "none",
    exit: ["none", "fade", "slide"].includes(value.exit) ? value.exit : "none",
    durationSec: Math.min(3, Math.max(0.2, Number(value.durationSec || 0.8) || 0.8)),
    intensity: Math.min(1.5, Math.max(0.25, Number(value.intensity || 1) || 1))
  };
}

async function renderStylizedMotionFrames({ imagePath, animation, durationSec, outputDir, width = 1280, height = 720, fps = 24, shouldAbort = null } = {}) {
  const availability = getMontageBrowserRendererAvailability();
  if (!availability.available || !availability.playwright?.chromium) throw new Error("stylized_motion_browser_unavailable");
  const cleanMotion = normalizeMotion(animation);
  const cleanDurationSec = Math.max(0.5, Number(durationSec || 0) || 0.5);
  const frames = Math.max(1, Math.ceil(cleanDurationSec * fps));
  const root = path.resolve(__dirname, "..", "public");
  const gsapUrl = pathToFileURL(path.join(root, "vendor/gsap/gsap.min.js")).href;
  const motionUrl = pathToFileURL(path.join(root, "podcaster/podcaster-stylized-motion.js")).href;
  const imageUrl = pathToFileURL(path.resolve(imagePath)).href;
  await fs.promises.mkdir(outputDir, { recursive: true });
  const config = JSON.stringify({ cleanMotion, cleanDurationSec }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}
    #overlay{display:block;width:${width}px;height:${height}px}
  </style><script src="${gsapUrl}"></script></head><body>
    <img id="overlay" src="${imageUrl}" alt="">
    <script type="module">
      import { createStylizedImageMotionTimeline } from "${motionUrl}";
      const config = ${config};
      const image = document.getElementById("overlay");
      try {
      await image.decode();
      const motion = createStylizedImageMotionTimeline({
        gsap: window.gsap, element: image, motion: config.cleanMotion,
        sceneDurationSec: config.cleanDurationSec
      });
      window.__setStylizedFrame = (time) => motion.seek(time);
      window.__stylizedStaticRange = { start: motion.staticStartSec, end: motion.staticEndSec };
      window.__stylizedReady = true;
      } catch (error) { window.__stylizedError = String(error?.message || error || "asset_unavailable"); }
    </script></body></html>`;
  const htmlPath = path.join(outputDir, "render.html");
  await fs.promises.writeFile(htmlPath, html, "utf8");
  const browser = await availability.playwright.chromium.launch({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    let pageError = "";
    page.on("pageerror", (error) => { pageError = String(error?.message || error || ""); });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__stylizedReady === true || Boolean(window.__stylizedError), null, { timeout: 30000 })
      .catch(() => { throw new Error(`stylized_motion_asset_or_font_unavailable: ${pageError || "render_timeout"}`); });
    const renderError = await page.evaluate(() => window.__stylizedError || "");
    if (pageError || renderError) throw new Error(`stylized_motion_asset_or_font_unavailable: ${renderError || pageError}`);
    const staticRange = await page.evaluate(() => window.__stylizedStaticRange || { start: 0, end: 0 });
    let staticFramePath = "";
    for (let frame = 0; frame < frames; frame += 1) {
      if (typeof shouldAbort === "function" && shouldAbort()) throw new Error("montage_export_cancelled");
      const time = frame / fps;
      const framePath = path.join(outputDir, `frame-${String(frame).padStart(5, "0")}.png`);
      if (staticFramePath && time < Number(staticRange.end || 0) - (1 / fps)) {
        await fs.promises.link(staticFramePath, framePath).catch(() => fs.promises.copyFile(staticFramePath, framePath));
        continue;
      }
      await page.evaluate((value) => window.__setStylizedFrame(value), time);
      await page.screenshot({ path: framePath, omitBackground: true });
      if (!staticFramePath && time >= Number(staticRange.start || 0) && time < Number(staticRange.end || 0) - (1 / fps)) staticFramePath = framePath;
    }
    await page.close();
    return { pattern: path.join(outputDir, "frame-%05d.png"), frames, fps };
  } finally {
    await browser.close();
  }
}

module.exports = { normalizeMotion, renderStylizedMotionFrames };
