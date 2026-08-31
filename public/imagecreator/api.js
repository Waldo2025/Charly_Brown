import { authFetchJson, buildVeoApiUrl } from "../js/api-client.js";
import { prepareAttachmentsForGemini } from "./attachments.js";
import { buildGeminiImagePayload, estimateGeminiPayloadBytes } from "./payloads.js";
import { MAX_GEMINI_PAYLOAD_BYTES, MAX_RESULTS_PER_TURN } from "./constants.js";

const GEMINI_IMAGE_QUOTA_COOLDOWN_MS = 60_000;
let geminiImageQuotaBlockedUntil = 0;

function isGeminiImageQuotaError(error) {
  return Number(error?.status || 0) === 429
    || String(error?.code || "").toUpperCase() === "GEMINI_QUOTA_EXHAUSTED"
    || /resource[_ ]exhausted|quota|too many requests/i.test(String(error?.message || error?.detail?.error?.message || ""));
}

function isGeminiImageTransientError(error) {
  const status = Number(error?.status || 0);
  const text = String(error?.message || error?.detail?.error?.message || error?.code || "");
  return isGeminiImageQuotaError(error)
    || [502, 503, 504].includes(status)
    || /failed to fetch|networkerror|load failed|bad gateway|gateway timeout|upstream_timeout|temporarily unavailable/i.test(text);
}

function quotaRetryDelayMs(error) {
  const explicitSeconds = Number(error?.detail?.retryAfterSeconds || error?.detail?.retryAfter || 0);
  if (Number.isFinite(explicitSeconds) && explicitSeconds > 0) return Math.min(explicitSeconds * 1000, 5 * 60_000);
  const retryInfo = Array.isArray(error?.detail?.error?.details)
    ? error.detail.error.details.find((item) => /RetryInfo/i.test(String(item?.["@type"] || "")))
    : null;
  const match = String(retryInfo?.retryDelay || "").match(/([\d.]+)s/i);
  return match ? Math.min(Math.ceil(Number(match[1]) * 1000), 5 * 60_000) : GEMINI_IMAGE_QUOTA_COOLDOWN_MS;
}

function buildGeminiImageQuotaError(error, retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const quotaLimited = isGeminiImageQuotaError(error);
  const transientError = new Error(quotaLimited
    ? `Gemini alcanzó temporalmente el límite de generación de imágenes. Intenta nuevamente en aproximadamente ${seconds} segundos.`
    : `Gemini no respondió a tiempo. La escena conservará lo ya generado; intenta nuevamente en aproximadamente ${seconds} segundos.`);
  transientError.name = quotaLimited ? "GeminiQuotaError" : "GeminiTemporaryUnavailableError";
  transientError.code = quotaLimited ? "GEMINI_QUOTA_EXHAUSTED" : "GEMINI_IMAGE_TEMPORARILY_UNAVAILABLE";
  transientError.status = quotaLimited ? 429 : 503;
  transientError.retryAfterMs = retryAfterMs;
  transientError.detail = error?.detail;
  return transientError;
}

function makeId(prefix = "msg") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractGeminiImageResults(imageData = {}, { sourceMessageId = "", options = {} } = {}) {
  const parts = Array.isArray(imageData?.candidates?.[0]?.content?.parts) ? imageData.candidates[0].content.parts : [];
  return parts
    .map((part, index) => {
      const inline = part?.inlineData || part?.inline_data;
      const mimeType = String(inline?.mimeType || inline?.mime_type || "").trim();
      const base64 = String(inline?.data || "").trim();
      if (!mimeType || !base64 || !/^image\//i.test(mimeType)) return null;
      return {
        id: makeId("img"),
        mimeType,
        dataUrl: `data:${mimeType};base64,${base64}`,
        model: String(options?.model || "").trim(),
        aspectRatio: String(options?.aspectRatio || "1:1").trim() || "1:1",
        imageSize: String(options?.imageSize || "1K").trim() || "1K",
        sourceMessageId,
        createdAt: new Date().toISOString(),
        fileName: `image-${String(index + 1).padStart(2, "0")}`
      };
    })
    .filter(Boolean);
}

export async function generateImagesViaGemini({ mode, prompt, options, attachments }) {
  const cooldownRemaining = geminiImageQuotaBlockedUntil - Date.now();
  if (cooldownRemaining > 0) throw buildGeminiImageQuotaError(null, cooldownRemaining);
  const count = Math.max(1, Math.min(MAX_RESULTS_PER_TURN, Number(options?.count || 1) || 1));
  const results = [];
  let lastError = null;
  const preparedAttachments = await prepareAttachmentsForGemini(attachments, {
    maxPayloadBytes: MAX_GEMINI_PAYLOAD_BYTES
  });

  for (let index = 0; index < count; index += 1) {
    try {
      const payload = buildGeminiImagePayload({ mode, prompt, options, attachments: preparedAttachments });
      if (estimateGeminiPayloadBytes(payload) > MAX_GEMINI_PAYLOAD_BYTES) {
        throw new Error("Las referencias adjuntas siguen siendo demasiado pesadas para Gemini. Usa menos imágenes o referencias más ligeras.");
      }
      // eslint-disable-next-line no-await-in-loop
      const response = await authFetchJson(buildVeoApiUrl("/api/gemini/generate"), {
        method: "POST",
        body: {
          model: options.model,
          payload
        }
      });
      const extracted = extractGeminiImageResults(response, {
        sourceMessageId: "",
        options
      });
      if (!extracted.length) {
        lastError = "Gemini no devolvió una imagen válida.";
        continue;
      }
      for (const item of extracted) {
        results.push(item);
      }
    } catch (error) {
      if (isGeminiImageTransientError(error)) {
        const retryAfterMs = quotaRetryDelayMs(error);
        geminiImageQuotaBlockedUntil = Date.now() + retryAfterMs;
        throw buildGeminiImageQuotaError(error, retryAfterMs);
      }
      lastError = error instanceof Error ? error : new Error(String(error || "Error al generar imagen con Gemini."));
    }
  }

  if (!results.length) {
    throw lastError || new Error("Gemini no devolvió imágenes.");
  }

  return results;
}
