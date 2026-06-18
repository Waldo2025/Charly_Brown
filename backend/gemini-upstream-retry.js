const GEMINI_UPSTREAM_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryableGeminiUpstreamStatus(status = 0) {
  return GEMINI_UPSTREAM_RETRYABLE_STATUSES.has(Number(status || 0));
}

function buildGeminiUpstreamRetryDelays(attempts = 3, baseDelayMs = 450) {
  const total = Math.max(1, Number(attempts || 0) || 1);
  const base = Math.max(0, Number(baseDelayMs || 0) || 0);
  return Array.from({ length: total }, (_, index) => base * (index + 1));
}

async function waitMs(delayMs = 0) {
  const ms = Math.max(0, Number(delayMs || 0) || 0);
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGeminiWithRetry({
  requestFn,
  shouldRetry = isRetryableGeminiUpstreamStatus,
  retryDelaysMs = buildGeminiUpstreamRetryDelays()
} = {}) {
  if (typeof requestFn !== "function") {
    throw new TypeError("requestFn must be a function");
  }

  const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : [];
  let lastResult = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const result = await requestFn({ attempt });
    lastResult = result;
    const status = Number(result?.upstream?.status || 0) || 0;
    if (!shouldRetry(status, result, attempt)) {
      return result;
    }
    const delayMs = Number(delays[attempt] || 0) || 0;
    if (delayMs > 0) {
      await waitMs(delayMs);
    }
  }

  return lastResult;
}

module.exports = {
  GEMINI_UPSTREAM_RETRYABLE_STATUSES,
  isRetryableGeminiUpstreamStatus,
  buildGeminiUpstreamRetryDelays,
  fetchGeminiWithRetry
};
