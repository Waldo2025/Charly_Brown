import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  resolveSceneMediaRenderSpec
} = require("../public/podcaster/podcaster-scene-media-render-spec.js");

const approx = (actual, expected, epsilon = 0.001, label = "value") => {
  if (Math.abs(Number(actual) - Number(expected)) > epsilon) {
    throw new Error(`${label} expected ${expected}, got ${actual}`);
  }
};

const normalContain = resolveSceneMediaRenderSpec({
  canvasWidth: 1280,
  canvasHeight: 720,
  sourceWidth: 1920,
  sourceHeight: 1080,
  reelMode: false,
  visualLayoutMode: "default",
  mediaScale: 1.3,
  mediaOffsetXPct: 0.25,
  mediaOffsetYPct: -0.1,
  mediaMotionPreset: "pan-left-right",
  visualEffects: null,
  mediaKind: "video"
});

if (normalContain.fitMode !== "contain") {
  throw new Error("Normal 16:9 debe usar contain.");
}
approx(normalContain.frameRect.width, 1280, 0.001, "frame width");
approx(normalContain.frameRect.height, 720, 0.001, "frame height");
approx(normalContain.baseRect.width, 1280, 0.001, "base width");
approx(normalContain.baseRect.height, 720, 0.001, "base height");
approx(normalContain.scaledRect.width, 1664, 0.001, "scaled width");
approx(normalContain.scaledRect.height, 936, 0.001, "scaled height");
approx(normalContain.motion.amplitudeXPx, 133.12, 0.01, "motion amplitude X");
approx(normalContain.motion.amplitudeYPx, 0, 0.001, "motion amplitude Y");

const reelCover = resolveSceneMediaRenderSpec({
  canvasWidth: 720,
  canvasHeight: 1280,
  sourceWidth: 1920,
  sourceHeight: 1080,
  reelMode: true,
  visualLayoutMode: "default",
  mediaScale: 1,
  mediaOffsetXPct: 0,
  mediaOffsetYPct: 0,
  mediaMotionPreset: "none",
  visualEffects: null,
  mediaKind: "video"
});

if (reelCover.fitMode !== "cover") {
  throw new Error("Reel 9:16 debe usar cover.");
}
if (!(reelCover.baseRect.width > reelCover.frameRect.width)) {
  throw new Error("En reel cover el ancho base debe exceder el frame.");
}
approx(reelCover.baseRect.height, 1280, 0.001, "reel base height");

const blurBackdrop = resolveSceneMediaRenderSpec({
  canvasWidth: 1280,
  canvasHeight: 720,
  sourceWidth: 1080,
  sourceHeight: 1920,
  reelMode: false,
  visualLayoutMode: "blur-backdrop",
  mediaScale: 1,
  mediaOffsetXPct: 0,
  mediaOffsetYPct: 0,
  mediaMotionPreset: "none",
  visualEffects: null,
  mediaKind: "video"
});

if (blurBackdrop.fitMode !== "contain") {
  throw new Error("blur-backdrop debe conservar contain en foreground.");
}
approx(blurBackdrop.frameRect.width, 972.8, 0.01, "blur frame width");
approx(blurBackdrop.frameRect.height, 547.2, 0.01, "blur frame height");

const imageSpec = resolveSceneMediaRenderSpec({
  canvasWidth: 1280,
  canvasHeight: 720,
  sourceWidth: 1600,
  sourceHeight: 900,
  reelMode: false,
  visualLayoutMode: "default",
  mediaScale: 1.2,
  mediaOffsetXPct: 0.15,
  mediaOffsetYPct: -0.2,
  mediaMotionPreset: "pan-up-down",
  visualEffects: { effects: ["pan-left", "zoom-in"], speed: 7 },
  mediaKind: "image"
});

const videoSpec = resolveSceneMediaRenderSpec({
  canvasWidth: 1280,
  canvasHeight: 720,
  sourceWidth: 1600,
  sourceHeight: 900,
  reelMode: false,
  visualLayoutMode: "default",
  mediaScale: 1.2,
  mediaOffsetXPct: 0.15,
  mediaOffsetYPct: -0.2,
  mediaMotionPreset: "pan-up-down",
  visualEffects: { effects: ["pan-left", "zoom-in"], speed: 7 },
  mediaKind: "video"
});

approx(imageSpec.leftPx, videoSpec.leftPx, 0.001, "left parity");
approx(imageSpec.topPx, videoSpec.topPx, 0.001, "top parity");
approx(imageSpec.scaledRect.width, videoSpec.scaledRect.width, 0.001, "width parity");
approx(imageSpec.motion.amplitudeYPx, videoSpec.motion.amplitudeYPx, 0.001, "motion parity");

if (imageSpec.kenBurns.effect !== "zoom-in") {
  throw new Error("El último efecto válido debe dominar el Ken Burns compartido.");
}
approx(imageSpec.kenBurns.zoomFrom, 1, 0.001, "ken burns zoom from");
approx(imageSpec.kenBurns.zoomTo, 1.3, 0.001, "ken burns zoom to");
approx(imageSpec.kenBurns.panScale, 1.2, 0.001, "ken burns pan scale");

console.log("Podcaster scene media render spec OK.");
