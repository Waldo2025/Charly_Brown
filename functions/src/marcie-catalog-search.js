const CATALOG_TIMEOUT_MS = 6000;
const DOI_PATTERN = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;

function cleanQuery(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function usefulWords(value) {
  const stop = new Set(["and", "the", "for", "with", "from", "para", "como", "sobre", "desde", "entre", "las", "los", "del", "una", "uno", "con", "que", "por", "estudios", "study", "article", "artículo"]);
  return [...new Set(String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]{4,}/g) || [])]
    .filter((word) => !stop.has(word));
}

function relevantTitle(title, query) {
  const terms = usefulWords(query);
  const titleWords = new Set(usefulWords(title));
  return terms.length < 2 || terms.filter((word) => titleWords.has(word)).length >= 2;
}

async function readCatalogJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": "MarcieResearch/1.0" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`catalog_http_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function europePmcSources(payload, query) {
  return (payload?.resultList?.result || []).flatMap((item) => {
    const doi = String(item?.doi || "").trim();
    const pmcid = String(item?.pmcid || "").trim();
    const title = String(item?.title || "").trim();
    if (!title || !relevantTitle(title, query) || (!/^PMC\d+$/i.test(pmcid) && !DOI_PATTERN.test(doi))) return [];
    return [{
      title,
      url: /^PMC\d+$/i.test(pmcid) ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : `https://doi.org/${doi}`,
      authors: String(item?.authorString || "").split(/,\s*/).filter(Boolean).slice(0, 12),
      publishedAt: String(item?.firstPublicationDate || ""),
      publisher: String(item?.journalTitle || ""),
      doi: DOI_PATTERN.test(doi) ? doi : "",
      sourceType: "paper",
      evidenceRole: "historical",
      discoveredVia: ["supplemental", "europe_pmc"]
    }];
  });
}

function crossrefSources(payload, query) {
  return (payload?.message?.items || []).flatMap((item) => {
    const doi = String(item?.DOI || "").trim();
    const title = String(item?.title?.[0] || "").trim();
    if (!DOI_PATTERN.test(doi) || !title || !relevantTitle(title, query) || item.type !== "journal-article") return [];
    const dateParts = item.published?.["date-parts"]?.[0] || [];
    const publishedAt = dateParts.length === 3 ? `${dateParts[0]}-${String(dateParts[1]).padStart(2, "0")}-${String(dateParts[2]).padStart(2, "0")}` : dateParts.length >= 1 ? String(dateParts[0]) : "";
    return [{
      title,
      url: `https://doi.org/${doi}`,
      authors: (item.author || []).map((author) => [author.given, author.family].filter(Boolean).join(" ")).filter(Boolean).slice(0, 12),
      publishedAt,
      publisher: String(item["container-title"]?.[0] || item.publisher || ""),
      doi,
      sourceType: "paper",
      evidenceRole: "historical",
      discoveredVia: ["supplemental", "crossref"]
    }];
  });
}

async function searchScientificCatalogs({ queries = [], fetchImpl = globalThis.fetch, timeoutMs = CATALOG_TIMEOUT_MS } = {}) {
  const selected = [...new Set((Array.isArray(queries) ? queries : []).map(cleanQuery).filter(Boolean))].slice(0, 2);
  const sources = [];
  const results = [];
  for (const query of selected) {
    const encoded = encodeURIComponent(query);
    const catalogs = [
      { id: "europe_pmc", url: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encoded}&format=json&resultType=core&pageSize=8`, parse: europePmcSources },
      { id: "crossref", url: `https://api.crossref.org/works?query.bibliographic=${encoded}&rows=8&sort=published&order=desc&filter=type%3Ajournal-article`, parse: crossrefSources }
    ];
    const settled = await Promise.allSettled(catalogs.map(async (catalog) => catalog.parse(await readCatalogJson(catalog.url, fetchImpl, timeoutMs), query)));
    settled.forEach((result, index) => {
      const catalog = catalogs[index];
      if (result.status === "fulfilled") {
        sources.push(...result.value);
        results.push({ id: catalog.id, query, status: "searched", candidateCount: result.value.length });
      } else {
        results.push({ id: catalog.id, query, status: "error", error: String(result.reason?.message || result.reason).slice(0, 120) });
      }
    });
  }
  const uniqueSources = [...new Map(sources.map((source) => [source.doi.toLowerCase() || source.url.toLowerCase(), source])).values()];
  uniqueSources.sort((left, right) => {
    const yearLeft = Number(String(left.publishedAt || "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 0);
    const yearRight = Number(String(right.publishedAt || "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 0);
    return yearRight - yearLeft;
  });
  return {
    sources: uniqueSources,
    results
  };
}

module.exports = { searchScientificCatalogs, relevantTitle };
