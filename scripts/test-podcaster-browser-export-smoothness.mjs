import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { chromium } from "playwright";

const run = promisify(execFile);
const root = resolve("public");
const temporary = await mkdtemp(resolve(".tmp-podcaster-browser-export-"));
const exportSource = await readFile(join(root, "podcaster/podcaster-montage-export.js"), "utf8");
const functions = exportSource.slice(
  exportSource.indexOf("function selectFrontendMontageExportMimeType()"),
  exportSource.indexOf("export function validateFrontendMontageExport(")
);
const constants = exportSource.match(/^const MONTAGE_FRONTEND_EXPORT_.*$/gm).join("\n");
const harness = `<!doctype html><html><body>
<div id="stage" style="position:relative;width:640px;height:360px;background:#000">
  <video id="primary" class="podcast-active-speaker-video" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
  <video id="alternate" class="podcast-active-speaker-video" muted playsinline hidden style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
</div></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(harness);
      return;
    }
    const source = pathname.startsWith("/fixture-")
      ? join(temporary, pathname.slice(1))
      : resolve(root, `.${pathname}`);
    if (!source.startsWith(root + "/") && !source.startsWith(temporary + "/")) throw new Error("invalid_path");
    const bytes = await readFile(source);
    const contentType = pathname.endsWith(".mp4") ? "video/mp4"
      : pathname.endsWith(".wav") ? "audio/wav" : "text/javascript";
    response.writeHead(200, { "content-type": contentType, "content-length": bytes.length });
    response.end(bytes);
  } catch (_) {
    response.writeHead(404);
    response.end();
  }
});

let browser;
try {
  for (const [name, filter] of [["fixture-a.mp4", "testsrc2=size=640x360:rate=24:duration=3"],
    ["fixture-b.mp4", "testsrc2=size=640x360:rate=24:duration=3,hue=h=90"]]) {
    await run(ffmpeg, ["-y", "-f", "lavfi", "-i", filter, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", join(temporary, name)]);
  }
  await run(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", join(temporary, "fixture-tone.wav")]);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const results = [];
  for (const baseline of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.goto(origin);
    await page.evaluate(async () => {
      const [{ PodcasterPlaybackController }, surface, reels, capture] = await Promise.all([
        import("/podcaster/podcaster-playback-controller.js"),
        import("/podcaster/podcaster-montage-render-surface.js"),
        import("/podcaster/podcaster-reels.js"),
        import("/podcaster/podcaster-browser-export-capture.js")
      ]);
      Object.assign(window, { PodcasterPlaybackController, ...surface, ...reels, ...capture });
    });
    await page.addScriptTag({ content: `${constants}
      const STUDIO_TIMELINE_MIN_CLIP_MS = 500;
      const getMontageExportPreviewContainer = () => document.getElementById("stage");
      const isMontageExportPreviewJassubActive = () => false;
      const shouldUseMontageExportPreviewJassub = () => false;
      const getMontageExportPreviewSubtitleCanvas = () => null;
      const normalizeImageWarp = () => ({});
      const hasImageWarpMotion = () => false;
      const setMontageExportStatus = () => {};
      const setMontageExportProgress = () => {};
      const logMontageExportDevtools = (stage, data) => window.exportLogs.push({stage, ...data});
      ${functions}
      window.recordFrontendMontageCanvas = recordFrontendMontageCanvas;
    ` });
    const recording = await page.evaluate(async (baseline) => {
      window.exportLogs = [];
      window.montageExportState = { resolution: "1080p" };
      window.montageExportJobState = {};
      const primary = document.getElementById("primary");
      const alternate = document.getElementById("alternate");
      window.els = { montageExportPreviewVideo: primary, montageExportPreviewVideoAlt: alternate };
      const entries = ["a", "b"].map((name, index) => ({
        rowId: name, sceneIndex: index + 1, videoSrc: `${location.origin}/fixture-${name}.mp4`,
        startMs: index * 2000, endMs: (index + 1) * 2000,
        timelineStartMs: index * 2000, timelineEndMs: (index + 1) * 2000,
        durationMs: 2000, effectiveDurationMs: 2000, mediaDurationMs: 3000,
        clip: { trimInMs: 0, trimOutMs: 2000 }, visualEffects: {}
      }));
      const session = { id: "browser-export-regression", script: { rows: [] } };
      window.getActiveSession = () => session;
      const controller = new PodcasterPlaybackController();
      controller.init({ podcastVideoStage: document.getElementById("stage"),
        podcastActiveSpeakerVideo: primary, podcastActiveSpeakerVideoAlt: alternate }, {
        getActiveSession: () => session, buildTimelineRuntimeEntries: () => entries,
        getTimelineTotalDurationMs: () => 4000, getPodcastVideoConfig: () => ({}),
        getPlaybackSpeed: () => 1, ensureTimelineClipsByRowId: () => ({})
      });
      // Same-origin fixture media uses the production hydration, decoder,
      // playback controller and MP4 recording path.
      if (baseline) controller.setExternalVideoPlayback = () => {};
      const tick = controller.tick.bind(controller);
      let ticks = 0;
      controller.tick = async (...args) => {
        // Simulate occasional delayed preview/layout work. Both runs receive
        // the same delay so the paused-controller negative control is valid.
        if (window.montageExportJobState.frontendRecorder?.state === "recording" && ++ticks % 12 === 0) {
          await new Promise(resolve => setTimeout(resolve, 60));
        }
        return tick(...args);
      };
      window.exportPreviewController = controller;
      let seeks = 0;
      for (const video of [primary, alternate]) {
        video.addEventListener("seeking", () => {
          if (window.montageExportJobState.frontendRecorder?.state === "recording" && !video.hidden) seeks++;
        });
      }
      const tone = `${location.origin}/fixture-tone.wav`;
      const result = await recordFrontendMontageCanvas({ session, payload: {
        entries, resolution: "1080p", brandOverlay: { enabled: false },
        audioTimeline: { masterVolumePct: 100, geminiSegments: [
          { id: "voice-a", kind: "voice", url: tone, startMs: 0, durationMs: 2000, volumePct: 100 },
          { id: "voice-b", kind: "voice", url: tone, startMs: 2000, durationMs: 2000, volumePct: 100, fadeInMs: 300, fadeOutMs: 300 }
        ] }
      } });
      const bytes = Array.from(new Uint8Array(await result.blob.arrayBuffer()));
      const stats = window.exportLogs.find((log) => log.stage === "frontend_export_capture_complete");
      controller.releaseSessionRuntimeMedia();
      return { bytes, mimeType: result.mimeType, seeks, stats };
    }, baseline);
    const output = join(temporary, baseline ? "before.mp4" : "after.mp4");
    await writeFile(output, Buffer.from(recording.bytes));
    assert.match(recording.mimeType, /^video\/mp4/, "fixture must exercise native MP4 recording");
    const decoded = await run(ffmpeg, ["-i", output, "-vf", "scale=32:18", "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
    const frameSize = 32 * 18 * 3;
    const frameCount = decoded.stdout.length / frameSize;
    let repeatedRun = 0;
    let longestRepeatedRun = 0;
    for (let index = 1; index < frameCount; index++) {
      const current = decoded.stdout.subarray(index * frameSize, (index + 1) * frameSize);
      const previous = decoded.stdout.subarray((index - 1) * frameSize, index * frameSize);
      let delta = 0;
      for (let pixel = 0; pixel < frameSize; pixel++) delta += Math.abs(current[pixel] - previous[pixel]);
      repeatedRun = delta / frameSize < 0.4 ? repeatedRun + 1 : 0;
      longestRepeatedRun = Math.max(longestRepeatedRun, repeatedRun);
    }
    const metadata = decoded.stderr.toString();
    const duration = metadata.match(/Duration:\s*00:00:([\d.]+)/)?.[1];
    const audio = await run(ffmpeg, ["-i", output, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 1024 * 1024 });
    const rmsAt = (start, end) => {
      let sum = 0, count = 0;
      for (let sample = Math.round(start * 8000); sample < Math.round(end * 8000); sample++) {
        if (sample * 4 + 4 > audio.stdout.length) break;
        sum += audio.stdout.readFloatLE(sample * 4) ** 2; count++;
      }
      return Math.sqrt(sum / Math.max(1, count));
    };
    const metrics = { baseline, seeks: recording.seeks, frameCount, longestRepeatedRun,
      durationSec: Number(duration), lateVoiceRms: rmsAt(2.5, 3.5), ...recording.stats };
    results.push(metrics);
    console.log(JSON.stringify(metrics));
    await page.close();
  }
  const [before, after] = results;
  assert.ok(before.seeks >= 6, "negative control must reproduce repeated decoder seeks");
  assert.ok(after.seeks <= 4, "local recording must not seek continuously inside scenes");
  assert.ok(after.frameCount >= 80, "four seconds must retain cadence even with deliberately delayed ticks");
  assert.ok(after.longestRepeatedRun <= 3, "MP4 must not contain long runs of frozen frames");
  assert.ok(Math.abs(after.durationSec - 4) <= 0.15, "audio/video duration must match the timeline");
  assert.ok(after.lateVoiceRms > 0.04, "late voice must stay audible after its fade-in");
  console.log("Podcaster browser MP4 cadence, scene cut and late audio passed.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
