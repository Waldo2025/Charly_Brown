import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/js/PigPenCreator.js", import.meta.url), "utf8");
const quotaHelpersStart = source.indexOf("function isGeminiQuotaExhausted(");
const quotaHelpersEnd = source.indexOf("\nfunction isGeminiUpstreamTimeout(", quotaHelpersStart);
assert.ok(quotaHelpersStart >= 0 && quotaHelpersEnd > quotaHelpersStart, "No se encontraron los helpers de cuota de Gemini.");

const { isGeminiQuotaExhausted, getGeminiQuotaRetryDelayMs } = new Function(
  `${source.slice(quotaHelpersStart, quotaHelpersEnd)}\nreturn { isGeminiQuotaExhausted, getGeminiQuotaRetryDelayMs };`
)();

assert.equal(isGeminiQuotaExhausted({ status: 429, detail: { error: "gemini_quota_exhausted" } }), true);
assert.equal(isGeminiQuotaExhausted({ status: 503, message: "gemini_upstream_timeout" }), false);
assert.equal(getGeminiQuotaRetryDelayMs({ detail: { retryAfterSeconds: 60 } }, 0, 0), 60_000);
assert.equal(getGeminiQuotaRetryDelayMs({}, 0, 0), 8_000);
assert.equal(getGeminiQuotaRetryDelayMs({}, 1, 0), 16_000);

assert.match(
  source,
  /runWithConcurrency\(missingMissionIndexes, 1,[\s\S]*?requestGeneratedRoomBundle/,
  "Las salas deben generarse estrictamente una por una."
);
assert.match(source, /quotaRetries >= 2[\s\S]*?getGeminiQuotaRetryDelayMs[\s\S]*?await waitForGeminiRetry\(delayMs\)/);
assert.match(source, /onGenerate: \(\) => generateEscapeRoomFromBrief\(null, \{ throwOnError: true \}\)/);
assert.match(source, /if \(throwOnError\) throw error;[\s\S]*?return false;/);
assert.match(source, /syncObjectivePlanStatus\(\{ requiresReview: !isUpstreamTimeout && !isQuotaExhausted \}\)/);

console.log("PigPen Gemini quota recovery OK.");
