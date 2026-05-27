function toFiniteNumber(value, fallback = Number.NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toMs(value, fallback = Number.NaN) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const source = String(value || "").trim();
  if (!source) return fallback;
  const clockMatch = source.match(/^(\d+(?:\.\d+)?)s$/i);
  if (clockMatch) {
    return Math.round((Number(clockMatch[1]) || 0) * 1000);
  }
  const numeric = Number(source);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDialogueAudioWordTimings(raw = []) {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.words)
      ? raw.words
      : Array.isArray(raw?.wordTimings)
        ? raw.wordTimings
        : [];
  const next = [];
  source.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const text = String(item.text || item.word || item.token || item.value || "").replace(/\s+/g, " ").trim();
    const startMs = Math.max(0, Math.round(toMs(
      item.startMs ?? item.startTimeMs ?? item.start ?? item.startOffsetMs ?? item.offsetMs ?? item.offset
    )));
    const endMs = Math.max(0, Math.round(toMs(
      item.endMs ?? item.endTimeMs ?? item.end ?? item.endOffsetMs ?? item.offsetEndMs
    )));
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
    next.push({
      text,
      startMs,
      endMs,
      tokenIndex: next.length
    });
  });
  next.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.tokenIndex - b.tokenIndex);
  return next.map((item, index) => ({
    text: item.text,
    startMs: item.startMs,
    endMs: item.endMs,
    tokenIndex: index
  }));
}

function collectAlignmentCandidates(responseBody = {}) {
  const candidates = [];
  const directParts = Array.isArray(responseBody?.candidates?.[0]?.content?.parts)
    ? responseBody.candidates[0].content.parts
    : Array.isArray(responseBody?.parts)
      ? responseBody.parts
      : [];
  directParts.forEach((part) => {
    if (!part || typeof part !== "object") return;
    candidates.push(part?.alignment);
    candidates.push(part?.audioMetadata?.alignment);
    candidates.push(part?.audio_metadata?.alignment);
    candidates.push(part?.metadata?.alignment);
  });
  candidates.push(responseBody?.alignment);
  candidates.push(responseBody?.audioMetadata?.alignment);
  candidates.push(responseBody?.audio_metadata?.alignment);
  candidates.push(responseBody?.metadata?.alignment);
  candidates.push(responseBody?.candidates?.[0]?.alignment);
  candidates.push(responseBody?.candidates?.[0]?.metadata?.alignment);
  return candidates.filter(Boolean);
}

function extractGeminiDialogueAudioWordTimings(responseBody = {}) {
  const candidates = collectAlignmentCandidates(responseBody);
  for (const candidate of candidates) {
    const normalized = normalizeDialogueAudioWordTimings(candidate?.wordTimings || candidate?.words || candidate);
    if (normalized.length) return normalized;
  }
  return [];
}

module.exports = {
  normalizeDialogueAudioWordTimings,
  extractGeminiDialogueAudioWordTimings
};
