const API_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

function identifierFromUrl(url) {
  const host = url.hostname.toLowerCase();
  const pmid = host === "pubmed.ncbi.nlm.nih.gov" ? url.pathname.match(/^\/(\d{6,9})\/?$/)?.[1] : null;
  if (pmid) return { field: "EXT_ID", value: pmid };
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (_) { return null; }
  const doi = pathname.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i)?.[0]?.replace(/[.,;]+$/, "");
  if (doi && (host === "doi.org" || /(?:^|\.)(?:wiley\.com|springer\.com|nature\.com|sciencedirect\.com|tandfonline\.com|sagepub\.com|frontiersin\.org|plos\.org)$/.test(host))) {
    return { field: "DOI", value: doi };
  }
  return null;
}

async function readScholarlyAbstract(url, { fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  const identifier = identifierFromUrl(url);
  if (!identifier) return null;
  const query = `${identifier.field}:${identifier.value}`;
  const endpoint = new URL(API_URL);
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("resultType", "core");
  endpoint.searchParams.set("pageSize", "1");
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json", "User-Agent": "MarcieSourceVerifier/1.0" }
    });
    if (!response.ok || Number(response.headers.get("content-length") || 0) > 512000) return null;
    const raw = await response.text();
    if (raw.length > 512000) return null;
    const record = JSON.parse(raw).resultList?.result?.[0];
    if (!record) return null;
    const actual = identifier.field === "DOI" ? record.doi : record.pmid;
    if (String(actual || "").toLowerCase() !== identifier.value.toLowerCase()) return null;
    const text = String(record.abstractText || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const authors = record.authorList?.author?.map(author => author.fullName).filter(Boolean) || [];
    const publishedAt = record.firstPublicationDate || record.journalInfo?.printPublicationDate || "";
    const journal = record.journalInfo?.journal?.title || "";
    if (text.length < 240 || !record.pmid || !record.title || !authors.length || !publishedAt || !journal) return null;
    return {
      title: record.title, text, authors, publishedAt, dateSource: "europe_pmc",
      publisher: journal, journal, volume: record.journalInfo?.volume || "",
      issue: record.journalInfo?.issue || "", pages: record.pageInfo || "", doi: record.doi || "",
      finalUrl: `https://europepmc.org/article/MED/${record.pmid}`
    };
  } catch (_) {
    return null;
  }
}

module.exports = { identifierFromUrl, readScholarlyAbstract };
