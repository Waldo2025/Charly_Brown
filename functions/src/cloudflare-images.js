// Proveedor gratuito de imágenes (Cloudflare Workers AI) para PigPen.
// El id del modelo es virtual: nunca llega a Vertex. Las rutas de functions lo reconocen,
// extraen el prompt del payload con forma de Gemini y devuelven la imagen moldeada de vuelta
// al formato REST de Gemini, de modo que el navegador (extractGeminiImageData, optimizador
// WebP y subida a Storage) funciona sin cambios.
// La cuenta gratuita solo acepta { prompt }: sin ancho/alto, sin seed y sin imagen de
// referencia, por eso la edición de imágenes sigue siendo de pago por diseño.

const CLOUDFLARE_IMAGE_MODEL_ID = "cloudflare-flux-1-schnell";

const cloudflareImagesConfig = () => ({
  token: String(process.env.CLOUDFLARE_AI_TOKEN || "").trim(),
  accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim()
});

const cloudflareImagesEnabled = () => {
  const { token, accountId } = cloudflareImagesConfig();
  return Boolean(token && accountId);
};

const cloudflareImageOffer = () => ({ enabled: cloudflareImagesEnabled(), model: CLOUDFLARE_IMAGE_MODEL_ID });

// Une todos los fragmentos de texto del payload con forma de Gemini. Los builders de PigPen
// mandan una sola parte de texto; esto además cubre cualquier llamada multiparte.
// No recorta aquí: condenseCloudflarePrompt necesita ver el documento completo (el prompt
// específico del acertijo va al final) y generateCloudflareInlineImage aplica los límites.
const CLOUDFLARE_PROMPT_LIMIT = 2048;
function clampCloudflarePrompt(text) {
  const value = String(text || "");
  if (value.length <= CLOUDFLARE_PROMPT_LIMIT) return value;
  const cut = value.slice(0, CLOUDFLARE_PROMPT_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 1200 ? cut.slice(0, lastSpace) : cut).trim();
}

// flux-1-schnell solo lee sus primeras ~60-100 palabras (codificador CLIP de 77 tokens más
// un tope corto en T5) e ignora o invierte las negaciones. El contrato completo de PigPen
// (~2,500 caracteres de políticas y reglas) diluye al acertijo, así que se condensa a un
// pie de foto afirmativo: prompt específico primero, luego reto, tema y estilo.
const CLOUDFLARE_CAPTION_LIMIT = 320;
const CLOUDFLARE_DROP_PREFIXES = [
  "TEXTO MÍNIMO EN IMAGEN:",
  "REGLA NO NEGOCIABLE:",
  "REGLA ESTRICTA:",
  "Idioma del contenido pedagógico",
  "Escena funcional para",
  "Pregunta interna:",
  "Sin texto legible"
];
const CLOUDFLARE_LABEL_PREFIXES = [
  "La imagen debe apoyar el briefing y su introducción a los ejercicios:",
  "La imagen debe apoyar el reto:",
  "Dirección visual:",
  "Tema principal:",
  "Tema:",
  "Ambientación:"
];

function dropLeadingNegativeSentences(text) {
  return text
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/^(evita|no |sin |nunca|bajo ninguna|under no)/i.test(sentence.trim()))
    .join(" ")
    .trim();
}

function condenseCloudflarePrompt(document) {
  const value = String(document || "").trim();
  if (!value || value.length <= CLOUDFLARE_CAPTION_LIMIT) return value;
  const content = [];
  let captionLine = "";
  let textLine = "";
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (CLOUDFLARE_DROP_PREFIXES.some((prefix) => line.startsWith(prefix))) continue;
    if (line.startsWith("TEXTO VISIBLE OBLIGATORIO")) { textLine = line; continue; }
    if (line.startsWith("CORRECCIÓN VISUAL:")) { captionLine = line.slice("CORRECCIÓN VISUAL:".length).trim(); continue; }
    content.push(line);
  }
  const subject = content.length ? content.pop() : "";
  const challenge = [];
  const decor = [];
  for (const line of content) {
    const label = CLOUDFLARE_LABEL_PREFIXES.find((prefix) => line.startsWith(prefix));
    const text = label ? line.slice(label.length) : line;
    const cleaned = dropLeadingNegativeSentences(text);
    if (!cleaned) continue;
    (label && label.startsWith("La imagen debe apoyar") ? challenge : decor).push(cleaned);
  }
  const caption = [subject, captionLine, ...challenge, ...decor, textLine]
    .filter(Boolean)
    .map((part) => part.replace(/[.\s]+$/g, ""))
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
  if (!caption) return clampCloudflarePrompt(value).slice(0, CLOUDFLARE_CAPTION_LIMIT);
  if (caption.length <= CLOUDFLARE_CAPTION_LIMIT) return caption;
  const cut = caption.slice(0, CLOUDFLARE_CAPTION_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trim();
}

function extractCloudflareImagePrompt(payload = {}) {
  const contents = Array.isArray(payload?.contents) ? payload.contents : [];
  const lines = [];
  for (const content of contents) {
    for (const part of (Array.isArray(content?.parts) ? content.parts : [])) {
      const text = String(part?.text || "").trim();
      if (text) lines.push(text);
    }
  }
  return lines.join("\n");
}

// Llama a flux-1-schnell y devuelve { mimeType, data } en base64, listo para el pipeline
// de sharp del worker o para moldearlo como inlineData de Gemini.
async function generateCloudflareInlineImage(prompt, { signal } = {}) {
  const { token, accountId } = cloudflareImagesConfig();
  if (!token || !accountId) {
    throw Object.assign(new Error("cloudflare_image_disabled"), { status: 503 });
  }
  const limited = clampCloudflarePrompt(condenseCloudflarePrompt(prompt));
  if (!limited) {
    throw Object.assign(new Error("cloudflare_image_prompt_missing"), { status: 400 });
  }
  const upstream = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: limited }),
      signal
    }
  );
  let data = null;
  try { data = await upstream.json(); } catch (_) { data = null; }
  if (!upstream.ok || !data?.result?.image) {
    const quota = upstream.status === 429
      || /quota|limit|exceed|credit|insufficient|per-day/i.test(JSON.stringify(data?.errors || ""));
    const error = Object.assign(new Error(quota ? "cloudflare_quota_exhausted" : "cloudflare_image_failed"), {
      status: quota ? 429 : 502,
      detail: JSON.stringify(data?.errors || {}).slice(0, 300)
    });
    throw error;
  }
  return { mimeType: "image/jpeg", data: String(data.result.image), neurons: Number(data?.result?.usage?.neurons || 0) };
}

// Respuesta con la forma exacta que lee el navegador (candidates[].content.parts[].inlineData).
function buildGeminiShapeFromCloudflare(inline) {
  return {
    candidates: [{
      content: { parts: [{ inlineData: { mimeType: inline.mimeType, data: inline.data } }] },
      finishReason: "STOP"
    }],
    usageMetadata: {
      promptTokenCount: 0,
      candidatesTokenCount: Math.round(Number(inline.neurons || 0) * 100),
      totalTokenCount: 0
    }
  };
}

module.exports = {
  CLOUDFLARE_IMAGE_MODEL_ID,
  cloudflareImagesEnabled,
  cloudflareImageOffer,
  extractCloudflareImagePrompt,
  condenseCloudflarePrompt,
  generateCloudflareInlineImage,
  buildGeminiShapeFromCloudflare
};
