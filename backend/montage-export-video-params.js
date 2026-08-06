const IS_RENDER_RUNTIME = Boolean(
  String(process.env.RENDER_EXTERNAL_HOSTNAME || process.env.RENDER_SERVICE_ID || "").trim()
);

function resolveMontageExportVideoParams(format = "mp4_h264", qualityPreset = "balanced", bitrateSettings = null, targetResolution = "") {
  const cleanFormat = String(format || "").trim().toLowerCase();
  const preset = ["high", "balanced", "small"].includes(String(qualityPreset || "").trim().toLowerCase())
    ? String(qualityPreset).trim().toLowerCase()
    : "balanced";
  const normalizedTarget = (() => {
    const candidate = typeof targetResolution === "string"
      ? String(targetResolution || "").trim().toLowerCase()
      : "";
    if (typeof targetResolution === "object" && targetResolution) {
      const targetWidth = Math.max(0, Number(targetResolution?.width || 0) || 0);
      const targetHeight = Math.max(0, Number(targetResolution?.height || 0) || 0);
      if (targetWidth >= 1920 && targetHeight >= 1080) return "1080p";
      if (targetWidth >= 1440 && targetHeight >= 1080) return "2k";
    }
    if (candidate === "source" || candidate.length < 2) return "";
    if (candidate.startsWith("1080p") || candidate.startsWith("1920x1080")) return "1080p";
    if (candidate === "2k") return "2k";
    if (candidate.includes("2k")) return "2k";
    return candidate;
  })();
  const targetRequiresHigherBitrate = ["1080p", "2k", "1920x1080", "1920x1200", "2560x1440", "2560x1440p", "4k", "2160p"].includes(normalizedTarget);

  if (cleanFormat === "webm_vp9") {
    const crf = preset === "high" ? 28 : preset === "small" ? 36 : 32;
    return {
      container: "webm",
      vCodec: "libvpx-vp9",
      vArgs: ["-b:v", "0", "-crf", String(crf), "-deadline", "good"],
      aCodec: "libopus",
      aArgs: ["-b:a", "128k"]
    };
  }

  let crf = preset === "high" ? 18 : preset === "small" ? 24 : 20;
  let x264Preset = preset === "high" ? "medium" : preset === "small" ? "veryfast" : "faster";
  if (IS_RENDER_RUNTIME) {
    x264Preset = preset === "high" ? "veryfast" : preset === "small" ? "ultrafast" : "superfast";
  }
  const x264Params = IS_RENDER_RUNTIME ? "threads=1:rc-lookahead=0:sync-lookahead=0:bframes=0:ref=1" : "";
  let maxRate = preset === "high" ? "8M" : (preset === "small" ? "2M" : "6M");
  let bufSize = preset === "high" ? "16M" : (preset === "small" ? "4M" : "12M");
  if (!bitrateSettings && targetRequiresHigherBitrate) {
    maxRate = preset === "high" ? "14M" : (preset === "small" ? "3M" : "8M");
    bufSize = preset === "high" ? "28M" : (preset === "small" ? "6M" : "16M");
  }
  let isCbr = false;

  if (bitrateSettings && typeof bitrateSettings === "object") {
    if (bitrateSettings.mode === "custom") {
      crf = Math.max(0, Math.min(51, Number(bitrateSettings.minBitrateCrf || 23)));
      const customMax = Math.max(0.1, Math.min(100, Number(bitrateSettings.maxBitrateMbps || 5)));
      maxRate = `${customMax}M`;
      bufSize = `${customMax * 2}M`;
    } else if (bitrateSettings.mode === "cbr") {
      isCbr = true;
      const customMax = Math.max(0.1, Math.min(100, Number(bitrateSettings.maxBitrateMbps || 5)));
      maxRate = `${customMax}M`;
      bufSize = `${customMax}M`;
    }
  }

  const vArgs = ["-preset", x264Preset];
  if (isCbr) {
    vArgs.push("-b:v", maxRate, "-maxrate", maxRate, "-bufsize", bufSize);
  } else {
    vArgs.push("-crf", String(crf), "-maxrate", maxRate, "-bufsize", bufSize);
  }
  if (x264Params) {
    vArgs.push("-x264-params", x264Params);
  }
  vArgs.push("-movflags", "+faststart");

  return {
    container: "mp4",
    vCodec: "libx264",
    vArgs,
    aCodec: "aac",
    aArgs: ["-b:a", "160k"]
  };
}

function resolveMontageIntermediateVideoParams(format = "mp4_h264") {
  const cleanFormat = String(format || "").trim().toLowerCase();
  const x264Params = IS_RENDER_RUNTIME ? "threads=1:rc-lookahead=0:sync-lookahead=0:bframes=0:ref=1" : "";
  const crf = IS_RENDER_RUNTIME ? "19" : "18";
  const audioBitrate = IS_RENDER_RUNTIME ? "128k" : "192k";
  if (cleanFormat === "webm_vp9") {
    return {
      container: "webm",
      vCodec: "libvpx-vp9",
      vArgs: ["-b:v", "0", "-crf", "18", "-deadline", "good"],
      aCodec: "libopus",
      aArgs: ["-b:a", "160k"]
    };
  }
  return {
    container: "mp4",
    vCodec: "libx264",
    vArgs: ["-preset", "ultrafast", "-crf", crf, ...(x264Params ? ["-x264-params", x264Params] : [])],
    aCodec: "aac",
    aArgs: ["-b:a", audioBitrate]
  };
}

module.exports = {
  resolveMontageExportVideoParams,
  resolveMontageIntermediateVideoParams
};
