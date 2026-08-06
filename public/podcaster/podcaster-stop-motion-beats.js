(function initPodcasterStopMotionBeats(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") {
    root.PodcasterStopMotionBeats = {
      ...(root.PodcasterStopMotionBeats || {}),
      ...api
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildStopMotionBeatApi() {
  const ANALYSIS_VERSION = 1;

  function selectOrderedBeatPositions(candidateTimesMs = [], durationMs = 0, frameCount = 0) {
    const duration = Math.max(1, Number(durationMs || 0) || 1);
    const count = Math.max(0, Math.round(Number(frameCount || 0) || 0));
    if (count < 2) return [];
    const candidates = [...new Set((Array.isArray(candidateTimesMs) ? candidateTimesMs : [])
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0 && value < duration)
      .sort((a, b) => a - b))];
    const positions = [0];
    let previousMs = 0;
    for (let index = 1; index < count; index += 1) {
      const targetMs = (duration * index) / count;
      const remainingFrames = count - index;
      const latestMs = duration - Math.max(1, (duration / count) * remainingFrames * 0.16);
      const minimumMs = previousMs + Math.max(1, (duration / count) * 0.16);
      const viable = candidates.filter((value) => value >= minimumMs && value <= latestMs);
      const chosenMs = viable.length
        ? viable.reduce((best, value) => (
          Math.abs(value - targetMs) < Math.abs(best - targetMs) ? value : best
        ), viable[0])
        : Math.max(minimumMs, Math.min(latestMs, targetMs));
      positions.push(Math.max(0, Math.min(0.999999, chosenMs / duration)));
      previousMs = chosenMs;
    }
    return positions;
  }

  function detectEnergyPeaks(audioBuffer = null, options = {}) {
    const sampleRate = Math.max(1, Number(audioBuffer?.sampleRate || 0) || 0);
    const channelCount = Math.max(0, Number(audioBuffer?.numberOfChannels || 0) || 0);
    if (!sampleRate || !channelCount || typeof audioBuffer?.getChannelData !== "function") return [];
    const durationMs = Math.max(1, Number(options.durationMs || 0) || (Number(audioBuffer.duration || 0) * 1000) || 1);
    const startOffsetMs = Math.max(0, Number(options.startOffsetMs || 0) || 0);
    const sourceDurationMs = Math.max(1, Number(audioBuffer.duration || 0) * 1000 || 1);
    const loopStartMs = Math.max(0, Number(options.loopStartMs || 0) || 0);
    const loopEndMs = Math.max(loopStartMs + 1, Math.min(sourceDurationMs, Number(options.loopEndMs || sourceDurationMs) || sourceDurationMs));
    const loopSpanMs = Math.max(1, loopEndMs - loopStartMs);
    const windowMs = 24;
    const windowSamples = Math.max(64, Math.round((sampleRate * windowMs) / 1000));
    const energies = [];
    const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
    for (let localMs = 0; localMs < durationMs; localMs += windowMs) {
      const unwrappedSourceMs = startOffsetMs + localMs;
      const sourceMs = loopStartMs + ((((unwrappedSourceMs - loopStartMs) % loopSpanMs) + loopSpanMs) % loopSpanMs);
      const startSample = Math.max(0, Math.min(channels[0].length - 1, Math.floor((sourceMs / 1000) * sampleRate)));
      let energy = 0;
      let samplesRead = 0;
      for (let offset = 0; offset < windowSamples && startSample + offset < channels[0].length; offset += 4) {
        let mixed = 0;
        channels.forEach((channel) => { mixed += Math.abs(Number(channel[startSample + offset] || 0)); });
        energy += mixed / channelCount;
        samplesRead += 1;
      }
      energies.push(samplesRead ? energy / samplesRead : 0);
    }
    const novelty = energies.map((energy, index) => Math.max(0, energy - (energies[Math.max(0, index - 1)] || 0)));
    const peaks = [];
    const minimumGapMs = 180;
    novelty.forEach((value, index) => {
      const from = Math.max(0, index - 8);
      const to = Math.min(novelty.length, index + 9);
      const neighborhood = novelty.slice(from, to);
      const average = neighborhood.reduce((sum, item) => sum + item, 0) / Math.max(1, neighborhood.length);
      const localMax = Math.max(...neighborhood, 0);
      const timeMs = index * windowMs;
      if (value > Math.max(0.0005, average * 1.45) && value >= localMax && (!peaks.length || timeMs - peaks.at(-1) >= minimumGapMs)) {
        peaks.push(timeMs);
      }
    });
    return peaks;
  }

  function analyzeAudioBuffer(audioBuffer = null, options = {}) {
    const durationMs = Math.max(1, Number(options.durationMs || 0) || 1);
    const frameCount = Math.max(0, Math.round(Number(options.frameCount || 0) || 0));
    const peaksMs = detectEnergyPeaks(audioBuffer, options);
    return {
      version: ANALYSIS_VERSION,
      peaksMs,
      beatPositions: selectOrderedBeatPositions(peaksMs, durationMs, frameCount)
    };
  }

  return {
    ANALYSIS_VERSION,
    selectOrderedBeatPositions,
    detectEnergyPeaks,
    analyzeAudioBuffer
  };
});
