function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toFiniteNumber(value, fallback = Number.NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTimingValue(value, fallback = Number.NaN) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const source = String(value || "").trim();
  if (!source) return fallback;
  const secondsMatch = source.match(/^(\d+(?:\.\d+)?)s$/i);
  if (secondsMatch) {
    return Math.round((Number(secondsMatch[1]) || 0) * 1000);
  }
  const numeric = Number(source);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function tokenizeSubtitleText(text = "") {
  return String(text || "").match(/(\s+|[^\s]+)/g) || [];
}

function estimateProportionalWordTimings(words = [], durationMs = 0) {
  if (!Array.isArray(words) || !words.length || !durationMs || durationMs <= 0) return [];
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  if (totalChars <= 0) {
    const wordDur = Math.round(durationMs / words.length);
    return words.map((w, index) => ({
      text: w,
      startMs: index * wordDur,
      endMs: Math.min(durationMs, (index + 1) * wordDur),
      tokenIndex: index
    }));
  }
  let currentStartMs = 0;
  return words.map((word, index) => {
    const weight = word.length / totalChars;
    const wordDur = Math.round(weight * durationMs);
    const startMs = currentStartMs;
    const endMs = index === words.length - 1 ? durationMs : Math.min(durationMs, currentStartMs + wordDur);
    currentStartMs = endMs;
    return {
      text: word,
      startMs,
      endMs,
      tokenIndex: index
    };
  });
}

export function normalizeKaraokeWordTimings(audioClip = null, subtitleText = "") {
  const source = Array.isArray(audioClip?.wordTimings)
    ? audioClip.wordTimings
    : Array.isArray(audioClip?.alignment?.words)
      ? audioClip.alignment.words
      : Array.isArray(audioClip?.words)
        ? audioClip.words
        : [];
  const subtitleWords = String(subtitleText || "").trim().split(/\s+/).filter(Boolean);
  const next = [];
  source.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const text = String(item.text || item.word || item.token || subtitleWords[index] || "").replace(/\s+/g, " ").trim();
    const startMs = Math.max(0, Math.round(normalizeTimingValue(
      item.startMs ?? item.startTimeMs ?? item.start ?? item.offsetMs ?? item.offset
    )));
    const endMs = Math.max(0, Math.round(normalizeTimingValue(
      item.endMs ?? item.endTimeMs ?? item.end ?? item.offsetEndMs
    )));
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
    next.push({
      text,
      startMs,
      endMs,
      tokenIndex: next.length
    });
  });
  if (!next.length) {
    const durationMs = audioClip?.durationMs ?? (audioClip?.durationSec != null ? audioClip.durationSec * 1000 : (audioClip?.duration != null ? audioClip.duration * 1000 : 0));
    if (durationMs > 0 && subtitleWords.length > 0) {
      return estimateProportionalWordTimings(subtitleWords, durationMs);
    }
  }
  next.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.tokenIndex - b.tokenIndex);
  return next.map((item, index) => ({
    text: item.text,
    startMs: item.startMs,
    endMs: item.endMs,
    tokenIndex: index
  }));
}

export function resolveActiveKaraokeWordIndex(wordTimings = [], currentMs = 0, clipStartMs = 0) {
  const safeWordTimings = Array.isArray(wordTimings) ? wordTimings : [];
  const localMs = Math.max(0, Math.round(Number(currentMs || 0) - Number(clipStartMs || 0)));
  const active = safeWordTimings.find((item) => localMs >= Number(item?.startMs || 0) && localMs < Number(item?.endMs || 0));
  return active ? Number(active.tokenIndex || 0) : -1;
}

export function buildKaraokeSubtitleMarkup(text = "", wordTimings = [], activeIndex = -1) {
  const tokens = tokenizeSubtitleText(text);
  if (!tokens.length || !Array.isArray(wordTimings) || !wordTimings.length) {
    return escapeHtml(text);
  }
  let wordIndex = 0;
  return tokens.map((token) => {
    if (/^\s+$/.test(token)) return token;
    const isActive = wordIndex === activeIndex;
    const className = `podcast-karaoke-word${isActive ? " is-active" : ""}`;
    const html = `<span class="${className}" data-karaoke-index="${wordIndex}" style="font-size: inherit !important;">${escapeHtml(token)}</span>`;
    wordIndex += 1;
    return html;
  }).join("");
}
