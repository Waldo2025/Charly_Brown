import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { buildGeminiApiUrl } from "../js/api-client.js";
import { stripHtml } from "./ui-components.js";
import { getInternalPrompts } from "./prompts-service.js";

export async function ensureReadingIllustration(reading = {}, { sessionId = "", targetUnitId = "", model = "" } = {}) {
  const sourceHtml = String(reading.sections?.narrativeHtml || reading.html || reading.text || "");
  if (!sourceHtml) return reading;
  if (/class\s*=\s*["'][^"']*cb-reading-illustration[^"']*["'][\s\S]*?<img\b/i.test(sourceHtml)) return reading;
  if (!sessionId || !targetUnitId) throw new Error("Faltan la sesión o la unidad para guardar la imagen de la lectura.");

  const cleanNarrativeHtml = sourceHtml.replace(/<figure\b[^>]*class\s*=\s*["'][^"']*cb-reading-illustration[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi, "").trim();
  const title = String(reading.title || "Lectura escolar").slice(0, 180);
  const url = buildGeminiApiUrl("/api/charly-brown/reading-image");
  const user = (typeof window !== "undefined" && window.__CHARLY_TEST_USER__) || getAuth().currentUser;
  if (!url || !user) throw new Error("Inicia sesión para generar la imagen de la lectura.");
  const token = typeof user.getIdToken === "function" ? await user.getIdToken() : (user.token || "test_token_123");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sessionId,
      targetUnitId,
      model,
      title,
      readingText: stripHtml(cleanNarrativeHtml).slice(0, 9000),
      styleInstructions: getInternalPrompts().readingIllustration || ""
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.asset?.url || !/^image\/(?:png|jpeg|webp)$/i.test(String(result.asset.mimeType || ""))) {
    throw new Error(String(result?.message || result?.error || "Gemini no entregó una imagen válida para la lectura."));
  }

  const escapeAttribute = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const figure = `<figure class="cb-reading-illustration" aria-hidden="true"><img src="${escapeAttribute(result.asset.url)}" alt="${escapeAttribute(result.alt || `Ilustración de ${title}`)}" loading="lazy"></figure>`;
  const illustratedHtml = `${figure}${cleanNarrativeHtml}`;
  return {
    ...reading,
    html: illustratedHtml,
    sections: { ...(reading.sections || {}), narrativeHtml: illustratedHtml },
    illustrationGenerated: true,
    illustrationAsset: result.asset,
    illustrationModel: result.model || "",
    illustrationVisualReview: result.visualReview || null,
    illustrationVisualBrief: result.visualBrief || null
  };
}
