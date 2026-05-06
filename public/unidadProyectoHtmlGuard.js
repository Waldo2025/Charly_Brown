export function resolveProyectoMainHtml({
  originalHtml = "",
  candidateHtml = "",
  resourcesByType = {}
} = {}) {
  const original = String(originalHtml || "").trim();
  const candidate = String(candidateHtml || "").trim();
  if (!candidate) return original;
  if (!original) return candidate;

  const strip = (html = "") => String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasLectura = (html = "") => /<h3[^>]*>\s*Lectura generadora\s*<\/h3>/i.test(String(html || ""));
  const hasPreguntas = (html = "") => /<h3[^>]*>\s*Preguntas de comprensión\s*<\/h3>/i.test(String(html || ""));
  const hasProjectPhases = (html = "") => /class=["'][^"']*\bproject-phases\b[^"']*["']/i.test(String(html || ""))
    || /class=["'][^"']*\bphase\b[^"']*["']/i.test(String(html || ""));
  const hasActivities = (html = "") => /class=["'][^"']*\bactivity\b[^"']*["']/i.test(String(html || ""))
    || /<ol[^>]*class=["'][^"']*\bsteps\b[^"']*["']/i.test(String(html || ""));
  const resourceCount = Object.values(resourcesByType || {}).filter((value) => String(value || "").trim()).length;

  const originalText = strip(original);
  const candidateText = strip(candidate);
  const originalHasStructure = hasPreguntas(original) || hasProjectPhases(original) || hasActivities(original);
  const candidateHasStructure = hasPreguntas(candidate) || hasProjectPhases(candidate) || hasActivities(candidate);
  const candidateIsMostlyReading = hasLectura(candidate) && !candidateHasStructure;
  const shrankTooMuch = candidateText.length > 0 && originalText.length > 320
    ? candidateText.length < Math.max(180, Math.floor(originalText.length * 0.45))
    : false;

  if (candidateIsMostlyReading) return original;
  if (resourceCount > 0 && originalHasStructure && !candidateHasStructure) return original;
  if (resourceCount > 0 && shrankTooMuch && originalHasStructure) return original;

  return candidate;
}
