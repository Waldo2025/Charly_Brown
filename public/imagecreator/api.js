import { authFetchJson, buildVeoApiUrl } from "../js/api-client.js?v=2026-06-25.1";
import { prepareAttachmentsForGemini } from "./attachments.js";
import { buildGeminiImagePayload, estimateGeminiPayloadBytes } from "./payloads.js";
import { MAX_GEMINI_PAYLOAD_BYTES, MAX_RESULTS_PER_TURN } from "./constants.js";

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
  const count = Math.max(1, Math.min(MAX_RESULTS_PER_TURN, Number(options?.count || 1) || 1));
  const results = [];
  let lastError = "";
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
      lastError = String(error?.message || "Error al generar imagen con Gemini.");
    }
  }

  if (!results.length) {
    throw new Error(lastError || "Gemini no devolvió imágenes.");
  }

  return results;
}
