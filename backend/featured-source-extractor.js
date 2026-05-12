function normalizeWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStructuredText(value = "") {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtmlNoise(html = "") {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
}

function decodeHtmlEntities(value = "") {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html = "") {
  const withBreaks = String(html || "")
    .replace(/<\/(p|div|section|article|main|header|footer|li)>/gi, "\n\n")
    .replace(/<\/(h1|h2|h3|h4|h5|h6)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");

  return normalizeStructuredText(
    decodeHtmlEntities(withBreaks)
      .replace(/[ \t]{2,}/g, " ")
  );
}

function extractTitle(html = "", fallbackUrl = "") {
  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = normalizeWhitespace(decodeHtmlEntities(titleMatch?.[1] || ""));
  if (title) return title;
  try {
    const parsed = new URL(String(fallbackUrl || "").trim());
    return normalizeWhitespace(parsed.hostname || "Fuente destacada");
  } catch (_) {
    return "Fuente destacada";
  }
}

function extractFeaturedSourceTextFromHtml(html = "", sourceUrl = "") {
  const cleanedHtml = stripHtmlNoise(html);
  const title = extractTitle(cleanedHtml, sourceUrl);
  const extractedText = htmlToText(cleanedHtml);
  return {
    title,
    extractedText,
    finalUrl: String(sourceUrl || "").trim()
  };
}

module.exports = {
  extractFeaturedSourceTextFromHtml
};
