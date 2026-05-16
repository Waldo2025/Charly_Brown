const PROYECTO_RESOURCE_ORDER = ["recortable", "anexo", "ficha", "video"];

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMissingPlaceholder({ type = "", clave = "" } = {}) {
  const safeType = String(type || "").trim().toLowerCase();
  const safeClave = String(clave || "").trim() || (
    safeType === "ficha" ? "Ficha" :
    safeType === "anexo" ? "Anexo" :
    safeType === "recortable" ? "Recortable" :
    safeType === "video" ? "Guion de video" :
    "Recurso"
  );
  return `
    <div class="unidad-resource-missing-placeholder" data-resource-missing="true" data-resource-type="${escapeHtml(safeType)}" style="padding:14px 16px;border:2px dashed #f59e0b;border-radius:14px;background:#fffbeb;color:#92400e;">
      <p style="margin:0 0 8px 0;font-weight:800;">${escapeHtml(safeClave)}</p>
      <p style="margin:0;">Este bloque fue solicitado, pero no llegó en la respuesta separada del proyecto. Revisa el prompt o regenera la categoría.</p>
    </div>
  `.trim();
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAnchorKeywords(...values) {
  const stop = new Set([
    "que", "como", "para", "con", "sin", "los", "las", "del", "por", "una", "uno", "unos", "unas",
    "sobre", "desde", "este", "esta", "estos", "estas", "actividad", "principal", "proyecto", "video",
    "guion", "lectura", "base", "idea", "clave", "mejor", "explica", "modelo", "muestra", "cierra",
    "retoma", "actividad", "posterior", "inmediata", "alumnado", "apoya", "directo", "trabajo"
  ]);
  return Array.from(new Set(
    values
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .flatMap((value) => value.split(" "))
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !stop.has(word))
  )).slice(0, 8);
}

function isInvalidExtractedResourceHtml(type = "", html = "", context = {}) {
  const safeType = String(type || "").trim().toLowerCase();
  const source = String(html || "").trim();
  if (!source) return true;
  if (/class\s*=\s*["'][^"']*\bproject-phases\b/i.test(source)) return true;
  if (/class\s*=\s*["'][^"']*\bphase\b/i.test(source)) return true;
  if (safeType === "video" && /<h3[^>]*>\s*\d+\.\s*(indagar|recolectar|formular|organizar|vivir|resultados?|presentemos)/i.test(source)) {
    return true;
  }
  if (safeType === "video") {
    const normalizedSource = normalizeText(source);
    const genericPatterns = [
      /explica una idea clave/,
      /retoma la lectura base/,
      /actividad posterior inmediata/,
      /muestra un modelo breve/,
      /cierra con sintesis/,
      /apoyar la actividad del alumnado/,
      /este video muestra pistas clave/
    ];
    const hasGenericScript = genericPatterns.some((pattern) => pattern.test(normalizedSource));
    const anchorKeywords = buildAnchorKeywords(
      context?.activityTitle,
      context?.activityText,
      context?.readingTitle,
      context?.readingSummary
    );
    if (hasGenericScript) return true;
    if (anchorKeywords.length > 0 && !anchorKeywords.some((word) => normalizedSource.includes(word))) {
      return true;
    }
  }
  return false;
}

export function buildProyectoSeparatedResourcePlan({
  splitResourcesByType = {},
  requestedResources = {},
  fallbackHtmlByType = {},
  videoContext = {}
} = {}) {
  const requested = requestedResources || {};
  const split = splitResourcesByType || {};
  const fallback = fallbackHtmlByType || {};
  const mapping = {
    recortable: { requestedKey: "recortables", label: "Recortable" },
    anexo: { requestedKey: "anexos", label: "Anexo" },
    ficha: { requestedKey: "fichas", label: "Ficha" },
    video: { requestedKey: "videos", label: "Guion de video" }
  };

  return PROYECTO_RESOURCE_ORDER.flatMap((type) => {
    const config = mapping[type];
    const resourceMeta = requested?.[config.requestedKey] || {};
    if (!resourceMeta?.generado) return [];
    const htmlAlumno = String(split?.[type] || "").trim();
    const htmlFallback = String(fallback?.[type] || "").trim();
    const clave = String(resourceMeta?.clave || config.label).trim();
    const invalidExtractedHtml = isInvalidExtractedResourceHtml(type, htmlAlumno, type === "video" ? videoContext : {});
    const missing = !htmlAlumno || invalidExtractedHtml;
    return [{
      type,
      clave,
      missing,
      htmlAlumno: missing
        ? (htmlFallback || buildMissingPlaceholder({ type, clave }))
        : htmlAlumno
    }];
  });
}
