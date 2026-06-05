const MODE_PROMPTS = Object.freeze({
  generate: "Genera una imagen original a partir del prompt del usuario. Devuelve una respuesta visual útil y coherente.",
  edit: "Edita la imagen o imágenes de referencia del usuario respetando el objetivo indicado en el prompt. Prioriza cambios claros y consistentes.",
  compose: "Combina las referencias del usuario en una sola imagen integrada. Conserva elementos clave de cada referencia y evita texto innecesario.",
  variation: "Produce una variación clara de la referencia principal del usuario. Mantén identidad visual y cambia composición, detalles o atmósfera según el prompt."
});

export function estimateGeminiPayloadBytes(payload = {}) {
  try {
    return new TextEncoder().encode(JSON.stringify(payload || {})).length;
  } catch (_) {
    return Number.MAX_SAFE_INTEGER;
  }
}

function supportsImageSize(model = "") {
  const normalized = String(model || "").trim().toLowerCase();
  return normalized === "gemini-3.1-flash-image" || normalized === "gemini-3-pro-image-preview";
}

function normalizeAttachmentRecord(attachment = {}) {
  return {
    name: String(attachment?.name || "referencia").trim() || "referencia",
    mimeType: String(attachment?.mimeType || "image/jpeg").trim() || "image/jpeg",
    base64: String(attachment?.inlineBase64 || attachment?.base64 || "").trim()
  };
}

function assertModeRequirements(mode = "generate", attachments = []) {
  const count = Array.isArray(attachments) ? attachments.length : 0;
  if ((mode === "edit" || mode === "variation") && count < 1) {
    throw new Error("Debes adjuntar al menos una imagen para editar o variar.");
  }
  if (mode === "compose" && count < 2) {
    throw new Error("Debes adjuntar al menos dos referencias para componer.");
  }
}

export function buildGeminiImagePayload({ mode = "generate", prompt = "", options = {}, attachments = [] } = {}) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) throw new Error("El prompt no puede estar vacío.");

  const normalizedMode = String(mode || "generate").trim() || "generate";
  const normalizedAttachments = Array.isArray(attachments) ? attachments.map(normalizeAttachmentRecord).filter((item) => item.base64) : [];
  assertModeRequirements(normalizedMode, normalizedAttachments);

  const parts = [
    { text: MODE_PROMPTS[normalizedMode] || MODE_PROMPTS.generate },
    { text: cleanPrompt }
  ];

  normalizedAttachments.forEach((attachment, index) => {
    parts.push({
      text: `Referencia ${index + 1}: ${attachment.name}`
    });
    parts.push({
      inlineData: {
        mimeType: attachment.mimeType,
        data: attachment.base64
      }
    });
  });

  const imageConfig = {
    aspectRatio: String(options?.aspectRatio || "1:1").trim() || "1:1"
  };
  if (supportsImageSize(options?.model)) {
    imageConfig.imageSize = String(options?.imageSize || "1K").trim() || "1K";
  }

  return {
    contents: [
      {
        role: "user",
        parts
      }
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig
    }
  };
}
