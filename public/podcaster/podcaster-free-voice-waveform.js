export const FREE_VOICE_SILENCE_GAP_MS = 2000;
export const FREE_VOICE_WAVEFORM_VERSION = 3;

const WAVEFORM_POINTS = 180;
const ANALYSIS_WINDOW_MS = 10;
const SILENCE_PADDING_MS = 70;
const MAX_PHRASES = 200;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makePhraseRanges(windowLevels, durationMs, threshold) {
  const active = windowLevels.map((level) => level >= threshold);
  const silenceWindows = Math.ceil(FREE_VOICE_SILENCE_GAP_MS / ANALYSIS_WINDOW_MS);
  const rawRanges = [];
  let firstActive = -1;
  let lastActive = -1;

  for (let index = 0; index < active.length; index += 1) {
    if (!active[index]) continue;
    if (firstActive < 0) {
      firstActive = index;
      lastActive = index;
      continue;
    }
    if (index - lastActive - 1 > silenceWindows) {
      rawRanges.push([firstActive * ANALYSIS_WINDOW_MS, Math.min(durationMs, (lastActive + 1) * ANALYSIS_WINDOW_MS)]);
      firstActive = index;
    }
    lastActive = index;
  }

  if (firstActive >= 0) {
    rawRanges.push([firstActive * ANALYSIS_WINDOW_MS, Math.min(durationMs, (lastActive + 1) * ANALYSIS_WINDOW_MS)]);
  }
  if (!rawRanges.length) return [];

  return rawRanges.slice(0, MAX_PHRASES).map(([startMs, endMs]) => [
    Math.max(0, Math.floor(startMs - SILENCE_PADDING_MS)),
    Math.min(durationMs, Math.ceil(endMs + SILENCE_PADDING_MS))
  ]);
}

export async function analyzeFreeVoiceAudio(blob) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error("No se recibió un audio válido.");
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("El navegador no permite analizar la forma de onda.");

  const context = new AudioContextClass();
  try {
    const source = await blob.arrayBuffer();
    const audio = await context.decodeAudioData(source.slice(0));
    const sampleRate = Number(audio.sampleRate || 0);
    const frameCount = Number(audio.length || 0);
    if (!sampleRate || !frameCount) throw new Error("El audio no contiene muestras legibles.");

    const windowFrames = Math.max(1, Math.round(sampleRate * ANALYSIS_WINDOW_MS / 1000));
    const windowCount = Math.ceil(frameCount / windowFrames);
    const windowLevels = new Float32Array(windowCount);
    const waveform = new Uint8Array(WAVEFORM_POINTS);
    const channelData = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
    let maxLevel = 0;

    for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
      const start = windowIndex * windowFrames;
      const end = Math.min(frameCount, start + windowFrames);
      let sumSquares = 0;
      let count = 0;
      for (const channel of channelData) {
        for (let frame = start; frame < end; frame += 1) {
          const sample = channel[frame] || 0;
          sumSquares += sample * sample;
          count += 1;
        }
      }
      const level = count ? Math.sqrt(sumSquares / count) : 0;
      windowLevels[windowIndex] = level;
      maxLevel = Math.max(maxLevel, level);
    }

    let maxWaveLevel = 0;
    const waveLevels = new Float32Array(WAVEFORM_POINTS);
    for (let point = 0; point < WAVEFORM_POINTS; point += 1) {
      const start = Math.floor(point * frameCount / WAVEFORM_POINTS);
      const end = Math.max(start + 1, Math.floor((point + 1) * frameCount / WAVEFORM_POINTS));
      let peak = 0;
      for (const channel of channelData) {
        for (let frame = start; frame < Math.min(frameCount, end); frame += 1) {
          peak = Math.max(peak, Math.abs(channel[frame] || 0));
        }
      }
      waveLevels[point] = peak;
      maxWaveLevel = Math.max(maxWaveLevel, peak);
    }
    for (let point = 0; point < WAVEFORM_POINTS; point += 1) {
      waveform[point] = Math.round(clamp(maxWaveLevel ? waveLevels[point] / maxWaveLevel : 0, 0, 1) * 255);
    }

    const durationMs = Math.max(1, Math.round(audio.duration * 1000));
    const threshold = Math.max(0.002, maxLevel * 0.055);
    return {
      durationMs,
      waveform: Array.from(waveform),
      phraseRanges: makePhraseRanges(windowLevels, durationMs, threshold)
    };
  } finally {
    await context.close().catch(() => {});
  }
}

export function buildFreeVoiceWaveformPath(peaks = [], trimInMs = 0, trimOutMs = 0, sourceDurationMs = 0) {
  const values = Array.isArray(peaks) ? peaks : [];
  if (!values.length) return "";
  const duration = Math.max(1, Number(sourceDurationMs) || 1);
  const left = clamp(Number(trimInMs) / duration, 0, 1);
  const right = clamp(Number(trimOutMs || duration) / duration, left, 1);
  const firstIndex = Math.floor(left * values.length);
  const lastIndex = Math.max(firstIndex + 1, Math.ceil(right * values.length));
  const visible = values.slice(firstIndex, lastIndex);
  if (!visible.length) return "";
  const points = Math.max(2, visible.length);
  const step = 100 / points;
  const upper = [];
  const lower = [];
  visible.forEach((value, index) => {
    const x = index * step;
    const normalized = clamp(Number(value) / 255, 0, 1);
    // Compresión solo visual para que las consonantes y las voces suaves se distingan.
    const amplitude = Math.pow(normalized, 0.58);
    const halfHeight = 0.35 + amplitude * 18.65;
    upper.push(`${index ? "L" : "M"}${x.toFixed(2)} ${(20 - halfHeight).toFixed(2)}`);
    lower.push(`${x.toFixed(2)} ${(20 + halfHeight).toFixed(2)}`);
  });
  const lastX = Math.min(100, points * step);
  const lastAmplitude = Math.pow(clamp(Number(visible[visible.length - 1]) / 255, 0, 1), 0.58);
  const lastHalfHeight = 0.35 + lastAmplitude * 18.65;
  upper.push(`L${lastX.toFixed(2)} ${(20 - lastHalfHeight).toFixed(2)}`);
  lower.reverse();
  return `${upper.join("")}${lower.map((point) => `L${point}`).join("")}Z`;
}
