const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GEMINI_UPSTREAM_RETRYABLE_STATUSES,
  isRetryableGeminiUpstreamStatus,
  buildGeminiUpstreamRetryDelays,
  fetchGeminiWithRetry
} = require("./gemini-upstream-retry.js");

test("retryable Gemini statuses include transient upstream failures", () => {
  assert.equal(GEMINI_UPSTREAM_RETRYABLE_STATUSES.has(503), true);
  assert.equal(isRetryableGeminiUpstreamStatus(429), true);
  assert.equal(isRetryableGeminiUpstreamStatus(500), true);
  assert.equal(isRetryableGeminiUpstreamStatus(400), false);
});

test("buildGeminiUpstreamRetryDelays returns incremental backoff delays", () => {
  assert.deepEqual(buildGeminiUpstreamRetryDelays(3, 450), [450, 900, 1350]);
});

test("fetchGeminiWithRetry retries transient upstream 503 until success", async () => {
  const statuses = [503, 503, 200];
  const attempts = [];
  const result = await fetchGeminiWithRetry({
    retryDelaysMs: [0, 0],
    requestFn: async ({ attempt }) => {
      attempts.push(attempt);
      const status = statuses[attempt];
      return {
        upstream: { status, ok: status >= 200 && status < 300 },
        data: { status }
      };
    }
  });

  assert.deepEqual(attempts, [0, 1, 2]);
  assert.equal(result.upstream.status, 200);
});

test("fetchGeminiWithRetry stops on non-retryable upstream status", async () => {
  const attempts = [];
  const result = await fetchGeminiWithRetry({
    retryDelaysMs: [0, 0, 0],
    requestFn: async ({ attempt }) => {
      attempts.push(attempt);
      return {
        upstream: { status: 400, ok: false },
        data: { error: "bad_request" }
      };
    }
  });

  assert.deepEqual(attempts, [0]);
  assert.equal(result.upstream.status, 400);
});
