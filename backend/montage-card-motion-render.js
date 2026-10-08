"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { getMontageBrowserRendererAvailability } = require("./montage-browser-render.js");

const PREMIUM_MODELS = new Set([
  "editorial-lower-third", "frosted-glass", "gradient-mesh",
  "minimal-outline", "quote-premium", "signal-premium"
]);

function isPremiumCard(card) {
  return Number(card?.renderVersion || 0) >= 2 && PREMIUM_MODELS.has(card?.styleModel);
}

async function renderCardMotionFrames({ card, outputDir, width, height, fps = 24, shouldAbort = null } = {}) {
  const availability = getMontageBrowserRendererAvailability();
  if (!availability.available || !availability.playwright?.chromium) throw new Error("card_motion_browser_unavailable");
  if (!isPremiumCard(card)) throw new Error("card_motion_model_unsupported");
  const root = path.resolve(__dirname, "..", "public");
  const fileUrl = (relative) => pathToFileURL(path.join(root, relative)).href;
  const durationSec = Math.max(0.5, Number(card.durationMs || 4000) / 1000);
  const frames = Math.max(1, Math.ceil(durationSec * fps));
  await fs.promises.mkdir(outputDir, { recursive: true });
  const safeCard = JSON.stringify(card).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="${fileUrl("local-fonts.css")}">
    <link rel="stylesheet" href="${fileUrl("podcaster.css")}">
    <link rel="stylesheet" href="${fileUrl("podcaster/podcaster-overlay-card-studio.css")}">
    <link rel="stylesheet" href="${fileUrl("podcaster/css/podcaster-overlays-2026.css")}">
    <style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}
    .podcast-overlay-card-layer{position:absolute;inset:0;width:100%;height:100%;background:transparent;overflow:hidden}
    .podcast-overlay-card-layer{pointer-events:none}.podcast-overlay-card{pointer-events:none}</style>
    <script src="${fileUrl("vendor/gsap/gsap.min.js")}"></script><script>window.__podcasterCardExportRender=true;</script></head><body>
    <div class="podcast-overlay-card-layer" id="layer"></div>
    <script type="module">
      import { renderCard } from "${fileUrl("podcaster/podcaster-overlay-card-studio.js")}";
      import { createCardMotionTimeline } from "${fileUrl("podcaster/podcaster-card-motion.js")}";
      try {
      const card = ${safeCard};
      document.getElementById("layer").innerHTML = renderCard(card, { interactive: false });
      await document.fonts.ready;
      const node = document.querySelector(".podcast-overlay-card");
      const motion = createCardMotionTimeline({ gsap: window.gsap, element: node, card });
      window.__setCardFrame = (time) => motion.seek(time);
      window.__cardStaticRange = { start: motion.staticStartSec, end: motion.staticEndSec };
      window.__cardReady = true;
      } catch (error) { window.__cardError = String(error?.message || error || "resource_unavailable"); }
    </script></body></html>`;
  const htmlPath = path.join(outputDir, "render.html");
  await fs.promises.writeFile(htmlPath, html, "utf8");
  const browser = await availability.playwright.chromium.launch({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    let pageError = "";
    page.on("pageerror", (error) => { pageError = String(error?.message || error || ""); });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => window.__cardReady === true || Boolean(window.__cardError), null, { timeout: 30000 })
      .catch(() => { throw new Error(`card_motion_resource_unavailable: ${pageError || "render_timeout"}`); });
    const renderError = await page.evaluate(() => window.__cardError || "");
    if (pageError || renderError) throw new Error(`card_motion_resource_unavailable: ${renderError || pageError}`);
    const bounds = await page.evaluate((time) => {
      window.__setCardFrame(time);
      const box = document.querySelector(".podcast-overlay-card").getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }, Math.min(durationSec / 2, 1));
    const cropX = Math.max(0, Math.floor(bounds.x - 110));
    const cropY = Math.max(0, Math.floor(bounds.y - 110));
    const cropRight = Math.min(width, Math.ceil(bounds.x + bounds.width + 110));
    const cropBottom = Math.min(height, Math.ceil(bounds.y + bounds.height + 110));
    const clip = { x: cropX, y: cropY, width: Math.max(1, cropRight - cropX), height: Math.max(1, cropBottom - cropY) };
    const staticRange = await page.evaluate(() => window.__cardStaticRange);
    let staticFramePath = "";
    for (let frame = 0; frame < frames; frame += 1) {
      if (typeof shouldAbort === "function" && shouldAbort()) throw new Error("montage_export_cancelled");
      const time = frame / fps;
      const framePath = path.join(outputDir, `frame-${String(frame).padStart(5, "0")}.png`);
      if (staticFramePath && time < Number(staticRange.end || 0) - (1 / fps)) {
        await fs.promises.link(staticFramePath, framePath).catch(() => fs.promises.copyFile(staticFramePath, framePath));
        continue;
      }
      await page.evaluate((value) => window.__setCardFrame(value), time);
      await page.screenshot({ path: framePath, clip, omitBackground: true });
      if (!staticFramePath && time >= Number(staticRange.start || 0) && time < Number(staticRange.end || 0) - (1 / fps)) staticFramePath = framePath;
    }
    await page.close();
    return { pattern: path.join(outputDir, "frame-%05d.png"), frames, fps, cropX, cropY };
  } finally {
    await browser.close();
  }
}

module.exports = { isPremiumCard, renderCardMotionFrames };
