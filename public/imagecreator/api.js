import { authFetchJson, buildGeminiApiUrl } from "../js/api-client.js";
import { prepareAttachmentsForGemini } from "./attachments.js?v=2026-09-07.9";
import { buildGeminiImagePayload, estimateGeminiPayloadBytes } from "./payloads.js?v=2026-09-14.1";
import { MAX_GEMINI_PAYLOAD_BYTES, MAX_RESULTS_PER_TURN } from "./constants.js?v=2026-09-07.1";

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
    ? `Lucy Studio alcanzó temporalmente el límite de generación de imágenes. Intenta nuevamente en aproximadamente ${seconds} segundos.`
    : `Lucy Studio no respondió a tiempo. La escena conservará lo ya generado; intenta nuevamente en aproximadamente ${seconds} segundos.`);
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

function measureResultImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) return reject(new Error("La imagen generada no tiene dimensiones válidas."));
      const gcd = (a, b) => b ? gcd(b, a % b) : a;
      const divisor = gcd(width, height);
      resolve({ width, height, aspectRatio: `${width / divisor}:${height / divisor}` });
    };
    image.onerror = () => reject(new Error("No fue posible leer la imagen generada."));
    image.src = dataUrl;
  });
}

async function extractGeminiImageResults(imageData = {}, { sourceMessageId = "", options = {} } = {}) {
  const parts = Array.isArray(imageData?.candidates?.[0]?.content?.parts) ? imageData.candidates[0].content.parts : [];
  const results = parts
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
        imageSize: String(options?.imageSize || "1K").trim() || "1K",
        sourceMessageId,
        createdAt: new Date().toISOString(),
        fileName: `image-${String(index + 1).padStart(2, "0")}`
      };
    })
    .filter(Boolean);
  return Promise.all(results.map(async (result) => ({
    ...result,
    ...await measureResultImage(result.dataUrl)
  })));
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
    const savingsKind = options?.savingsKind === "script" ? "script" : "photo";
    const savingsId = savingsKind === "script"
      ? String(options?.scriptSessionId || "studio_draft")
      : `photo_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${index}`}`;
    try {
      const payload = buildGeminiImagePayload({ mode, prompt, options, attachments: preparedAttachments });
      if (estimateGeminiPayloadBytes(payload) > MAX_GEMINI_PAYLOAD_BYTES) {
        throw new Error("Las referencias adjuntas siguen siendo demasiado pesadas para Lucy Studio. Usa menos imágenes o referencias más ligeras.");
      }
      // eslint-disable-next-line no-await-in-loop
      const response = await authFetchJson(buildGeminiApiUrl("/api/gemini/generate"), {
        method: "POST",
        body: {
          model: options?.model || "gemini-2.5-flash-image",
          generationProfile: "imagecreator",
          savingsContext: { kind: savingsKind, objectId: savingsId },
          payload
        }
      });
      const extracted = await extractGeminiImageResults(response, {
        sourceMessageId: "",
        options
      });
      if (!extracted.length) {
        lastError = "Lucy Studio no devolvió una imagen válida.";
        continue;
      }
      for (const item of extracted.slice(0, 1)) {
        results.push(item);
      }
    } catch (error) {
      if (isGeminiImageTransientError(error)) {
        const retryAfterMs = quotaRetryDelayMs(error);
        geminiImageQuotaBlockedUntil = Date.now() + retryAfterMs;
        throw buildGeminiImageQuotaError(error, retryAfterMs);
      }
      lastError = error instanceof Error ? error : new Error(String(error || "Error al generar imagen con Lucy Studio."));
    }
  }

  if (!results.length) {
    throw lastError || new Error("Lucy Studio no devolvió imágenes.");
  }

  return results;
}
