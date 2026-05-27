function resolveMontageExportVideoParams(format = "mp4_h264", qualityPreset = "balanced", bitrateSettings = null) {
  const cleanFormat = String(format || "").trim().toLowerCase();
  const preset = ["high", "balanced", "small"].includes(String(qualityPreset || "").trim().toLowerCase())
    ? String(qualityPreset).trim().toLowerCase()
    : "balanced";

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
  let x264Preset = preset === "high" ? "slow" : preset === "small" ? "fast" : "medium";
  let maxRate = preset === "high" ? "8M" : (preset === "small" ? "2M" : "5M");
  let bufSize = preset === "high" ? "16M" : (preset === "small" ? "4M" : "10M");
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
    vArgs: ["-preset", "slow", "-crf", "12", "-movflags", "+faststart"],
    aCodec: "aac",
    aArgs: ["-b:a", "192k"]
  };
}

module.exports = {
  resolveMontageExportVideoParams,
  resolveMontageIntermediateVideoParams
};
