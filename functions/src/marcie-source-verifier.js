const bibliography = require("./marcie-bibliography.js");
const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const { isPrivateIp } = require("./marcie-wordpress-core.js");
const { identifierFromUrl, readScholarlyAbstract } = require("./marcie-scholarly-fallback.js");

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const SOURCE_TIMEOUT_MS = 9000;
const SUPPORTED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "application/pdf"];
const HIGH_AUTHORITY_HOST_PATTERNS = [
  /(?:^|\.)doi\.org$/i, /(?:^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/i,
  /(?:^|\.)ncbi\.nlm\.nih\.gov$/i, /(?:^|\.)nature\.com$/i,
  /(?:^|\.)science\.org$/i, /(?:^|\.)thelancet\.com$/i,
  /(?:^|\.)springer\.com$/i, /(?:^|\.)wiley\.com$/i,
  /(?:^|\.)frontiersin\.org$/i, /(?:^|\.)plos\.org$/i,
  /(?:\.edu|\.gov|\.gob|\.ac)(?:\.[a-z]{2})?$/i
];

function clampText(value, max = 1000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizedSourceUrl(value = "") {
  let parsed;
  try { parsed = new URL(clampText(value, 3000)); } catch (_) { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  parsed.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => parsed.searchParams.delete(key));
  return parsed;
}

function sourceFailure(reason, details = {}) {
  const error = new Error(reason);
  error.code = reason;
  Object.assign(error, details);
  return error;
}

async function assertPublicUrl(parsed, resolveHost = dns.lookup) {
  if (!parsed || parsed.protocol !== "https:") throw sourceFailure("unsafe_url");
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal" || (net.isIP(host) && isPrivateIp(host))) {
    throw sourceFailure("unsafe_url");
  }
  let records;
  try { records = await resolveHost(host, { all: true, verbatim: true }); } catch (_) { throw sourceFailure("unreachable"); }
  if (!Array.isArray(records) || !records.length || records.some((record) => isPrivateIp(record?.address))) {
    throw sourceFailure("unsafe_url");
  }
}

async function readBoundedBody(response, maxBytes = MAX_SOURCE_BYTES) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw sourceFailure("unsupported_type");
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw sourceFailure("unsupported_type");
    return buffer;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => null);
      throw sourceFailure("unsupported_type");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function decodeHtml(value = "") {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value).replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const valueNumber = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(valueNumber) ? String.fromCodePoint(valueNumber) : " ";
    }
    return named[entity.toLowerCase()] || " ";
  });
}

function normalizePublicationDate(value = "") {
  const raw = decodeHtml(clampText(value, 160)).trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    if (year >= 1400 && year <= new Date().getUTCFullYear() + 1) return parsed.toISOString();
    return "";
  }
  const yearMatch = raw.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const year = Number.parseInt(yearMatch[1], 10);
    const monthMatch = raw.match(/[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])/);
    if (monthMatch) {
      const month = String(monthMatch[1]).padStart(2, "0");
      const day = String(monthMatch[2]).padStart(2, "0");
      const fullDate = new Date(`${year}-${month}-${day}T00:00:00Z`);
      if (Number.isFinite(fullDate.getTime())) return fullDate.toISOString();
    }
    return new Date(Date.UTC(year, 0, 1)).toISOString();
  }
  return "";
}

function htmlAttribute(tag = "", name = "") {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return decodeHtml(match?.[1] || "").trim();
}

function publicationDateFromJsonLd(source = "") {
  const scripts = [...String(source).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const findDate = (value) => {
    if (!value || typeof value !== "object") return "";
    const own = normalizePublicationDate(value.datePublished || value.dateCreated || "");
    if (own) return own;
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") {
        const found = findDate(nested);
        if (found) return found;
      }
    }
    return "";
  };
  for (const script of scripts) {
    try {
      const found = findDate(JSON.parse(decodeHtml(script[1]).trim()));
      if (found) return found;
    } catch (_) { /* malformed publisher metadata is ignored */ }
  }
  return "";
}

function jsonLdDocuments(source = "") {
  const documents = [];
  for (const match of String(source).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(decodeHtml(match[1]).trim());
      documents.push(...(Array.isArray(value) ? value : [value]));
    } catch (_) { /* malformed metadata is ignored */ }
  }
  return documents;
}

function metadataNames(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => clampText(typeof item === "string" ? item : item?.name, 300)).filter(Boolean);
}

function extractBibliographicMetadata(source = "") {
  const authors = [];
  let publisher = "";
  let doi = "";
  let year = "";
  const publication = { journal:"", volume:"", issue:"", pages:"" };
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    metadataNames(value.author || value.creator).forEach((name) => authors.push(name));
    if (!publisher) publisher = metadataNames(value.publisher)[0] || clampText(value.isPartOf?.name, 300);
    const identifiers = [value.doi, value.identifier, value.sameAs].flat().filter(Boolean).map(String);
    if (!doi) doi = identifiers.map((item) => item.match(/(?:https?:\/\/doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[-._;()/:a-z0-9]+)/i)?.[1] || "").find(Boolean) || "";
    Object.values(value).forEach((nested) => {
      if (nested && typeof nested === "object") visit(nested);
    });
  };
  jsonLdDocuments(source).forEach(visit);
  for (const tag of String(source).match(/<meta\b[^>]*>/gi) || []) {
    const key = (htmlAttribute(tag, "name") || htmlAttribute(tag, "property")).toLowerCase();
    const content = clampText(htmlAttribute(tag, "content"), 500);
    const field = { citation_journal_title:"journal", citation_volume:"volume", citation_issue:"issue", citation_firstpage:"firstPage", citation_lastpage:"lastPage" }[key];
    if (field) publication[field] = content;
    if (["author", "citation_author", "dc.creator"].includes(key) && content) authors.push(content);
    if (!publisher && ["og:site_name", "citation_journal_title", "dc.publisher"].includes(key)) publisher = content;
    if (!doi && ["citation_doi", "dc.identifier"].includes(key)) doi = content.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i)?.[0] || "";
    if (!year && ["citation_year", "citation_publication_date", "citation_date", "dc.date", "dc.date.issued", "dcterms.issued"].includes(key)) {
      year = content.match(/\b(?:18|19|20)\d{2}\b/)?.[0] || "";
    }
  }
  publication.pages = [publication.firstPage, publication.lastPage].filter(Boolean).join("–");
  return { authors: [...new Set(authors)], publisher, doi, year, ...publication };
}

function formatApaDate(publishedAt = "") {
  const date = new Date(publishedAt);
  if (!publishedAt || !Number.isFinite(date.getTime())) return "s. f.";
  return new Intl.DateTimeFormat("es-ES", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatApaCitation(source = {}) {
  return bibliography.format(source);
}

function bibliographicMetadataGaps(source = {}) {
  return bibliography.metadataGaps(source);
}

const ACADEMIC_DATE_META_KEYS = new Set([
  "article:published_time", "citation_publication_date", "citation_date", "citation_online_date",
  "citation_cover_date", "citation_year", "dc.date", "dc.date.issued", "dc.date.created",
  "dc.date.published", "dcterms.date", "dcterms.issued", "dcterms.created", "prism.publicationdate",
  "prism.coverdate", "datepublished", "date", "pubdate", "publishdate", "datecreated",
  "og:published_time", "og:article:published_time", "sailthru.date", "bepress_date",
  "parsely-pub-date", "rdate", "release_date"
]);

function extractPublicationDate(source = "", pageUrl = "") {
  const jsonLdDate = publicationDateFromJsonLd(source);
  if (jsonLdDate) return { publishedAt: jsonLdDate, dateSource: "json_ld" };
  for (const tag of String(source).match(/<meta\b[^>]*>/gi) || []) {
    const key = (htmlAttribute(tag, "property") || htmlAttribute(tag, "name") || htmlAttribute(tag, "itemprop")).toLowerCase();
    if (!ACADEMIC_DATE_META_KEYS.has(key)) continue;
    const publishedAt = normalizePublicationDate(htmlAttribute(tag, "content"));
    if (publishedAt) return { publishedAt, dateSource: "meta" };
  }
  for (const tag of String(source).match(/<time\b[^>]*>/gi) || []) {
    const publishedAt = normalizePublicationDate(htmlAttribute(tag, "datetime") || htmlAttribute(tag, "content"));
    if (publishedAt) return { publishedAt, dateSource: "time" };
  }
  const urlMatch = String(pageUrl).match(/\/(20\d{2})\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/|$)/)
    || String(pageUrl).match(/\/(20\d{2})\/(0?[1-9]|1[0-2])(?:\/|$)/);
  if (urlMatch) {
    const year = urlMatch[1];
    const month = urlMatch[2] ? String(urlMatch[2]).padStart(2, "0") : "01";
    const day = urlMatch[3] ? String(urlMatch[3]).padStart(2, "0") : "01";
    const publishedAt = normalizePublicationDate(`${year}-${month}-${day}T00:00:00Z`);
    if (publishedAt) return { publishedAt, dateSource: "url" };
  }
  return { publishedAt: "", dateSource: "unknown" };
}

function extractPdfPublicationDate(text = "") {
  const frontMatter = String(text).slice(0, 4000);
  const match = frontMatter.match(/\b(?:fecha de publicaci[oó]n|publicado(?: en l[ií]nea)?|publication date|published(?: online)?)\s*[:\-]?\s*((?:18|19|20)\d{2})(?:[-/.](\d{1,2})[-/.](\d{1,2}))?/i)
    || frontMatter.match(/\b(?:vol\.?|volume|n[uú]m\.?|issue|año)\s*\d+[^\n\r]{0,30}\b((?:18|19|20)\d{2})\b/i)
    || frontMatter.match(/(?:©|\b\(c\)|\bcopyright)\s*(?:[^\n\r]{0,30})?\b((?:18|19|20)\d{2})\b/i);
  if (!match) return { publishedAt: "", year: "", dateSource: "unknown" };
  const year = match[1];
  const publishedAt = match[2] && match[3]
    ? normalizePublicationDate(`${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`)
    : "";
  return { publishedAt, year, dateSource: "pdf_text" };
}

function extractPageContent(raw = "", contentType = "text/html", pageUrl = "") {
  const source = String(raw || "");
  if (contentType.startsWith("text/plain")) {
    return { title: "", text: source.replace(/\s+/g, " ").trim().slice(0, 24000), publishedAt: "", dateSource: "unknown" };
  }
  const titleMatch = source.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    || source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const stripped = source
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|form|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return {
    title: decodeHtml(titleMatch?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 500),
    text: decodeHtml(stripped).replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim().slice(0, 24000),
    ...extractPublicationDate(source, pageUrl),
    ...extractBibliographicMetadata(source)
  };
}

async function retrievePdfLandingPage(candidate, requested, current, pdfMetadata, options = {}) {
  const candidates = [candidate.landingUrl];
  if (pdfMetadata.doi) candidates.push(`https://doi.org/${pdfMetadata.doi}`);
  const parent = new URL(".", current);
  if (parent.pathname !== "/") candidates.push(parent.toString());
  for (const value of candidates.slice(0, 3)) {
    const start = normalizedSourceUrl(value);
    if (!start || start.toString() === current.toString() || start.toString() === requested.toString()) continue;
    let url = start;
    try {
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        await assertPublicUrl(url, options.resolveHost || dns.lookup);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(6000, Number(options.timeoutMs || SOURCE_TIMEOUT_MS)));
        let response;
        try {
          response = await (options.fetchImpl || globalThis.fetch)(url, { method: "GET", redirect: "manual", signal: controller.signal,
            headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "MarcieSourceVerifier/1.0" } });
        } finally { clearTimeout(timer); }
        if (response.status >= 300 && response.status < 400) {
          url = normalizedSourceUrl(new URL(response.headers.get("location"), url).toString());
          if (!url) break;
          continue;
        }
        if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) break;
        const html = (await readBoundedBody(response, 600_000)).toString("utf8");
        const linked = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].some((match) => {
          try {
            const linkedUrl = normalizedSourceUrl(new URL(decodeHtml(match[1]), url).toString());
            return linkedUrl && [requested, current].some((pdfUrl) => linkedUrl.hostname === pdfUrl.hostname && linkedUrl.pathname === pdfUrl.pathname);
          } catch (_) { return false; }
        });
        const extracted = extractPageContent(html, "text/html", url.toString());
        const matchingDoi = pdfMetadata.doi && extracted.doi && pdfMetadata.doi.toLowerCase() === extracted.doi.toLowerCase();
        if (linked || matchingDoi) return { url: url.toString(), extracted, linked };
        break;
      }
    } catch (_) { /* La página de descarga es una mejora opcional de una fuente PDF ya accesible. */ }
  }
  return null;
}

function retrievedPageFromExtracted(candidate = {}, requested, current, responseDetails = {}, extracted = {}) {
  return {
    id: clampText(candidate.id, 120) || `source-${crypto.randomUUID()}`,
    requestedUrl: requested.toString(), finalUrl: current.toString(), domain: current.hostname.replace(/^www\./i, ""),
    proposedTitle: clampText(candidate.title, 500), retrievedTitle: extracted.title || clampText(candidate.title, 500) || current.hostname,
    text: extracted.text, publishedAt: extracted.publishedAt, dateSource: extracted.dateSource,
    httpStatus: responseDetails.httpStatus || 200, contentType: responseDetails.contentType || "text/html",
    contentHash: crypto.createHash("sha256").update(extracted.text).digest("hex"), retrievedAt: new Date().toISOString(),
    retrievalMethod: responseDetails.retrievalMethod || "fetch",
    metadata: { ...candidate, bibliographicMetadata: extracted, pageAuthors: extracted.authors, pagePublisher: extracted.publisher, pageDoi: extracted.doi, pageYear: extracted.year || "" }
  };
}

async function defaultPlaywrightReader({ url = "", timeoutMs = 8000 } = {}) {
  let chromium;
  try { ({ chromium } = require("playwright")); } catch (_) { return null; }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ javaScriptEnabled: true });
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) return route.abort().catch(() => null);
      return route.continue().catch(() => null);
    }).catch(() => null);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(3000, timeoutMs) }).catch(() => null);
    return { finalUrl: page.url(), html: await page.content() };
  } finally {
    await browser?.close?.().catch(() => null);
  }
}

async function retrieveSourcePageWithBrowserFallback(candidate = {}, requested, current, options = {}) {
  const state = options.browserFallbackState;
  const maxFallbacks = Math.max(0, Math.min(6, Number(options.maxBrowserFallbacks ?? 3)));
  const reader = typeof options.playwrightReader === "function"
    ? options.playwrightReader
    : (options.enablePlaywrightFallback ? defaultPlaywrightReader : null);
  if (!reader || maxFallbacks <= 0 || (state && Number(state.count || 0) >= maxFallbacks)) return null;
  if (state) state.count = Number(state.count || 0) + 1;
  let result;
  try {
    result = await reader({
      url: current.toString(),
      candidate,
      timeoutMs: Math.max(1500, Math.min(15000, Number(options.browserTimeoutMs || 8000)))
    });
  } catch (_) {
    return null;
  }
  if (!result || typeof result !== "object") return null;
  const finalUrl = normalizedSourceUrl(result.finalUrl || current.toString());
  if (!finalUrl) return null;
  await assertPublicUrl(finalUrl, options.resolveHost || dns.lookup);
  const extracted = result.html
    ? extractPageContent(result.html, "text/html", finalUrl.toString())
    : {
        title: clampText(result.title, 500),
        text: clampText(result.text, 24000),
        publishedAt: normalizePublicationDate(result.publishedAt || ""),
        dateSource: result.publishedAt ? "browser" : "unknown",
        authors: Array.isArray(result.authors) ? result.authors : [],
        publisher: clampText(result.publisher, 300),
        doi: clampText(result.doi, 300)
      };
  if (String(extracted.text || "").length < 240) return null;
  return retrievedPageFromExtracted(candidate, requested, finalUrl, { httpStatus: 200, contentType: "text/html", retrievalMethod: "playwright" }, extracted);
}

async function retrieveSourcePageWithUrlContext(candidate = {}, requested, current, options = {}) {
  const reader = options.urlContextReader;
  const state = options.urlContextFallbackState;
  const limit = Math.max(0, Math.min(3, Number(options.maxUrlContextFallbacks ?? 2)));
  if (typeof reader !== "function" || limit === 0 || (state && state.count >= limit)) return null;
  if (/youtu(?:\.be|be\.com)/i.test(current.hostname)) return null;
  if (state) state.count += 1;
  let result;
  try { result = await reader({ url: current.toString(), candidate }); }
  catch (_) { return null; }
  if (!result || result.retrieved !== true) return null;
  const finalUrl = normalizedSourceUrl(result.finalUrl || current.toString());
  if (!finalUrl || finalUrl.hostname !== current.hostname) return null;
  await assertPublicUrl(finalUrl, options.resolveHost || dns.lookup);
  const extracted = {
    title: clampText(result.title || candidate.title, 500),
    text: clampText(result.text, 24000),
    publishedAt: normalizePublicationDate(result.publishedAt || ""),
    dateSource: result.publishedAt ? "url_context" : "unknown",
    authors: Array.isArray(result.authors) ? result.authors : [],
    publisher: clampText(result.publisher, 300), doi: clampText(result.doi, 300)
  };
  if (extracted.text.length < 240) return null;
  return retrievedPageFromExtracted(candidate, requested, finalUrl, { httpStatus: 200, contentType: "text/plain", retrievalMethod: "url_context" }, extracted);
}

async function retrieveSourcePageWithScholarlyFallback(candidate = {}, requested, current, options = {}) {
  const state = options.scholarlyFallbackState;
  if (!identifierFromUrl(current)) return null;
  if (state && state.count >= 3) return null;
  if (state) state.count += 1;
  const extracted = await readScholarlyAbstract(current, {
    fetchImpl: options.fetchImpl || globalThis.fetch,
    timeoutMs: Math.min(6000, Number(options.timeoutMs || SOURCE_TIMEOUT_MS))
  });
  if (!extracted) return null;
  const finalUrl = normalizedSourceUrl(extracted.finalUrl);
  if (!finalUrl) return null;
  await assertPublicUrl(finalUrl, options.resolveHost || dns.lookup);
  return retrievedPageFromExtracted(candidate, requested, finalUrl,
    { httpStatus: 200, contentType: "text/plain", retrievalMethod: "europe_pmc" }, extracted);
}

async function retrieveSourcePage(candidate = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const resolveHost = options.resolveHost || dns.lookup;
  const timeoutMs = Number(options.timeoutMs || SOURCE_TIMEOUT_MS);
  const requested = normalizedSourceUrl(candidate.url);
  if (!requested) throw sourceFailure("unsafe_url");
  let current = requested;
  let response;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(current, resolveHost);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.9", "User-Agent": "MarcieSourceVerifier/1.0" }
      });
    } catch (error) {
      if (error?.code && ["unsafe_url", "unsupported_type"].includes(error.code)) throw error;
      const contextPage = await retrieveSourcePageWithUrlContext(candidate, requested, current, options);
      if (contextPage) return contextPage;
      const browserPage = await retrieveSourcePageWithBrowserFallback(candidate, requested, current, options);
      if (browserPage) return browserPage;
      const scholarlyPage = await retrieveSourcePageWithScholarlyFallback(candidate, requested, current, options);
      if (scholarlyPage) return scholarlyPage;
      throw sourceFailure("unreachable");
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === MAX_REDIRECTS) throw sourceFailure("unreachable", { httpStatus: response.status });
      const location = response.headers.get("location");
      if (!location) throw sourceFailure("unreachable", { httpStatus: response.status });
      try { current = normalizedSourceUrl(new URL(location, current).toString()); }
      catch (_) { throw sourceFailure("unsafe_url", { httpStatus: response.status }); }
      if (!current) throw sourceFailure("unsafe_url");
      continue;
    }
    break;
  }
  if ([404, 410].includes(response.status)) {
    const scholarlyPage = await retrieveSourcePageWithScholarlyFallback(candidate, requested, current, options);
    if (scholarlyPage) return scholarlyPage;
    throw sourceFailure("not_found", { httpStatus: response.status });
  }
  if (!response.ok) {
    const contextPage = await retrieveSourcePageWithUrlContext(candidate, requested, current, options);
    if (contextPage) return contextPage;
    const browserPage = await retrieveSourcePageWithBrowserFallback(candidate, requested, current, options);
    if (browserPage) return browserPage;
    const scholarlyPage = await retrieveSourcePageWithScholarlyFallback(candidate, requested, current, options);
    if (scholarlyPage) return scholarlyPage;
    throw sourceFailure("unreachable", { httpStatus: response.status });
  }
  let contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const possiblePdfDownload = (!contentType || contentType === "application/octet-stream")
    && (/\.pdf$/i.test(current.pathname) || /filename\*?\s*=.*\.pdf/i.test(response.headers.get("content-disposition") || ""));
  if (!SUPPORTED_CONTENT_TYPES.includes(contentType) && !possiblePdfDownload) throw sourceFailure("unsupported_type", { httpStatus: response.status, contentType });
  if ((current.pathname === "/" || !current.pathname) && !current.search) throw sourceFailure("generic_homepage", { httpStatus: response.status });
  const body = await readBoundedBody(response, Number(options.maxBytes || MAX_SOURCE_BYTES));
  if (possiblePdfDownload && body.subarray(0, 5).toString("ascii") === "%PDF-") contentType = "application/pdf";
  if (!SUPPORTED_CONTENT_TYPES.includes(contentType)) throw sourceFailure("unsupported_type", { httpStatus: response.status, contentType });
  let extracted;
  let pdfDocumentTextLength = 0;
  if (contentType === "application/pdf") {
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(body) });
    try {
      const result = await parser.getText();
      pdfDocumentTextLength = String(result.text || "").length;
      const metadata = await parser.getInfo();
      extracted = { text: result.text, title: metadata.info?.Title || "", authors: metadata.info?.Author ? [metadata.info.Author] : [], ...extractPdfPublicationDate(result.text), doi: result.text.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i)?.[0] || "" };
    } finally { await parser.destroy(); }
    const landing = await retrievePdfLandingPage(candidate, requested, current, extracted, options);
    if (landing) {
      const page = landing.extracted;
      extracted = {
        ...extracted,
        title: extracted.title || page.title,
        authors: extracted.authors?.length ? extracted.authors : page.authors,
        publisher: page.publisher || extracted.publisher,
        journal: page.journal || extracted.journal,
        doi: extracted.doi || page.doi,
        publishedAt: extracted.publishedAt || page.publishedAt,
        year: extracted.year || page.year || (page.publishedAt ? String(new Date(page.publishedAt).getUTCFullYear()) : ""),
        dateSource: extracted.publishedAt || extracted.year ? extracted.dateSource : (page.publishedAt || page.year ? `pdf_landing_${page.dateSource || "metadata"}` : "unknown"),
        landingUrl: landing.url,
        landingText: page.text.slice(0, 3500),
        text: `${extracted.text}\n\nPágina que enlaza el PDF: ${page.text.slice(0, 3500)}`.slice(0, 24000)
      };
    }
  } else extracted = extractPageContent(body.toString("utf8"), contentType, current.toString());
  if (contentType === "application/pdf" && pdfDocumentTextLength < 240) throw sourceFailure("empty_content", { httpStatus: response.status });
  if (extracted.text.length < 240) {
    const contextPage = await retrieveSourcePageWithUrlContext(candidate, requested, current, options);
    if (contextPage) return contextPage;
    const browserPage = await retrieveSourcePageWithBrowserFallback(candidate, requested, current, options);
    if (browserPage) return browserPage;
    const scholarlyPage = await retrieveSourcePageWithScholarlyFallback(candidate, requested, current, options);
    if (scholarlyPage) return scholarlyPage;
    throw sourceFailure("empty_content", { httpStatus: response.status });
  }
  return retrievedPageFromExtracted(candidate, requested, current, { httpStatus: response.status, contentType, retrievalMethod: "fetch" }, extracted);
}

function classifySourceQuality(source = {}) {
  const host = String(source.domain || "").toLowerCase();
  const declared = String(source.metadata?.sourceType || "").toLowerCase();
  if (HIGH_AUTHORITY_HOST_PATTERNS.some((pattern) => pattern.test(host)) || /paper|journal|academic|government|university|book/.test(declared)) return 1;
  if (/magazine|professional|institution|education|science/.test(declared)) return 2;
  return 3;
}

function rejection(candidate = {}, reason = "verification_error", details = {}) {
  return {
    id: clampText(candidate.id, 120), url: clampText(candidate.url, 3000), title: clampText(candidate.title, 500),
    discoveredVia: candidate.discoveredVia || [], metadataGaps: Array.isArray(details.metadataGaps) ? details.metadataGaps : [],
    reason, httpStatus: Number(details.httpStatus || 0), publishedAt: clampText(details.publishedAt, 80), checkedAt: new Date().toISOString()
  };
}

async function verifyCandidateSources({ candidates = [], context = "", assessSources, retrievalCache = new Map(), distinctDomains = false, maxCandidates = 16, retrievalConcurrency = 4, retrieveOptions = {}, dateWindow = null, allowHistorical = false } = {}) {
  const unique = [];
  const seen = new Set();
  const seenIds = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const parsed = normalizedSourceUrl(candidate?.url);
    if (!parsed) continue;
    if (seen.has(parsed.toString())) {
      const prior = unique.find(source => source.url === parsed.toString());
      if (prior) prior.discoveredVia = [...new Set([...(prior.discoveredVia || []), ...(candidate.discoveredVia || [])])];
      continue;
    }
    seen.add(parsed.toString());
    const baseId = clampText(candidate.id, 120) || `source-${unique.length + 1}`;
    let id = baseId;
    while (seenIds.has(id)) id = `${baseId}-${unique.length + 1}`;
    seenIds.add(id);
    unique.push({ ...candidate, url: parsed.toString(), id });
    if (unique.length >= Math.max(1, Math.min(32, Number(maxCandidates) || 16))) break;
  }
  const retrieved = [];
  const rejectedSources = [];
  const browserFallbackState = { count: 0 };
  const urlContextFallbackState = { count: 0 };
  const scholarlyFallbackState = { count: 0 };
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, Math.min(6, Number(retrievalConcurrency) || 4)), unique.length) }, async () => {
    while (cursor < unique.length) {
      const candidate = unique[cursor];
      cursor += 1;
      let pagePromise = retrievalCache.get(candidate.url);
      if (!pagePromise) {
        const load = () => retrieveSourcePage(candidate, { ...retrieveOptions, browserFallbackState, urlContextFallbackState, scholarlyFallbackState });
        pagePromise = typeof retrieveOptions.schedule === "function" ? retrieveOptions.schedule(load) : load();
        retrievalCache.set(candidate.url, pagePromise);
      }
    try {
      const page = await pagePromise;
      let role = String(candidate.evidenceRole || "current").toLowerCase() === "historical" ? "historical" : "current";
      const publishedTime = page.publishedAt ? new Date(page.publishedAt).getTime() : NaN;
      const fromTime = dateWindow?.from ? new Date(dateWindow.from).getTime() : NaN;
      const toTime = dateWindow?.to ? new Date(dateWindow.to).getTime() : NaN;
      if (allowHistorical && (!Number.isFinite(publishedTime) || (Number.isFinite(fromTime) && publishedTime < fromTime))) role = "historical";
      if (dateWindow && role === "current" && !Number.isFinite(publishedTime)) {
        rejectedSources.push(rejection(candidate, "publication_date_unknown", page));
      } else if (dateWindow && role === "current" && ((Number.isFinite(fromTime) && publishedTime < fromTime) || (Number.isFinite(toTime) && publishedTime > toTime))) {
        rejectedSources.push(rejection(candidate, "outside_period", page));
      } else if (role === "historical" && !allowHistorical) {
        rejectedSources.push(rejection(candidate, "outside_period", page));
      } else {
        retrieved.push({ ...page, id: candidate.id, metadata: { ...candidate, ...page.metadata, discoveredVia: candidate.discoveredVia || [], evidenceRole: role } });
      }
    } catch (error) {
      rejectedSources.push(rejection(candidate, error?.code || "verification_error", error));
    }
    }
  });
  await Promise.all(workers);
  const sourceOrder = new Map(unique.map((candidate, index) => [candidate.id, index]));
  retrieved.sort((a, b) => (sourceOrder.get(a.id) ?? 999) - (sourceOrder.get(b.id) ?? 999));
  if (!retrieved.length || typeof assessSources !== "function") {
    return { verifiedSources: [], rejectedSources: [...rejectedSources, ...retrieved.map((item) => rejection(item.metadata, "verification_error"))], retrievedPages: retrieved, quotaLimited: false };
  }
  let assessments;
  let assessmentFailed = false;
  let quotaLimited = false;
  try {
    const assessmentBatches = [];
    for (let index = 0; index < retrieved.length; index += 8) assessmentBatches.push(retrieved.slice(index, index + 8));
    const assessedBatches = [];
    // Vertex/Gemini applies request-rate quotas. Keep document-assessment calls
    // sequential so a single research run cannot burst several model requests.
    for (const pages of assessmentBatches) {
      try {
        assessedBatches.push(await assessSources({ context: clampText(context, 12000), pages }));
      } catch (error) {
        if (Number(error?.status || error?.code) === 429 || /RESOURCE_EXHAUSTED|Too Many Requests|"code"\s*:\s*429/i.test(String(error?.message || ""))) quotaLimited = true;
        assessedBatches.push(pages.map(page => ({ id: page.id, status: "rejected", reason: "verification_error" })));
        if (quotaLimited) break;
      }
    }
    assessments = assessedBatches.flat();
  } catch (_) {
    assessments = [];
    assessmentFailed = true;
  }
  const byId = new Map((Array.isArray(assessments) ? assessments : []).map((item) => [String(item.id || ""), item]));
  const verifiedSources = [];
  const acceptedDomains = new Set();
  for (const page of retrieved) {
    const assessment = byId.get(page.id);
    if (!assessment || assessment.status !== "verified" || !String(assessment.supportSummary || "").trim()) {
      rejectedSources.push(rejection(page.metadata, assessment?.reason || (assessmentFailed ? "verification_error" : "content_mismatch"), page));
      continue;
    }
    if (distinctDomains && acceptedDomains.has(page.domain)) {
      rejectedSources.push(rejection(page.metadata, "content_mismatch", page));
      continue;
    }
    const pageAuthors = Array.isArray(page.metadata.pageAuthors) ? page.metadata.pageAuthors.filter(Boolean) : [];
    const textPublicationYear = extractPdfPublicationDate(page.text).year;
    const resolvedYear = page.publishedAt ? String(new Date(page.publishedAt).getUTCFullYear()) : (page.metadata.pageYear || textPublicationYear || "");
    const verifiedSource = {
      id: page.id, title: page.retrievedTitle, url: page.finalUrl, requestedUrl: page.requestedUrl,
      landingUrl: page.metadata.bibliographicMetadata?.landingUrl || "",
      journal: page.metadata.bibliographicMetadata?.journal || clampText(page.metadata.journal || page.metadata.journalTitle, 300),
      volume: page.metadata.bibliographicMetadata?.volume || "", issue: page.metadata.bibliographicMetadata?.issue || "", pages: page.metadata.bibliographicMetadata?.pages || "",
      discoveredVia: page.metadata.discoveredVia || [],
      finalUrl: page.finalUrl, domain: page.domain, publisher: clampText(page.metadata.pagePublisher || page.metadata.publisher || page.domain, 300),
      authors: pageAuthors,
      publishedAt: page.publishedAt || (resolvedYear ? `${resolvedYear}-01-01T00:00:00.000Z` : ""),
      dateSource: page.dateSource !== "unknown" ? page.dateSource : (resolvedYear ? (textPublicationYear ? "pdf_text" : "meta") : "unknown"),
      year: resolvedYear,
      evidenceRole: page.metadata.evidenceRole || "current",
      doi: clampText(page.metadata.pageDoi, 300), sourceType: clampText(page.metadata.sourceType, 80) || "web",
      qualityTier: classifySourceQuality(page), verificationStatus: "verified", retrievalStatus: "success",
      verifiedAt: page.retrievedAt, retrievedAt: page.retrievedAt, contentHash: page.contentHash,
      supportSummary: clampText(assessment.supportSummary, 600), locator: clampText(assessment.locator, 300),
      supports: Array.isArray(assessment.supports) ? assessment.supports.map((value) => clampText(value, 160)).filter(Boolean).slice(0, 20) : []
    };
    if (allowHistorical && !verifiedSource.year) verifiedSource.evidenceRole = "historical";
    const metadataGaps = bibliographicMetadataGaps(verifiedSource);
    if (verifiedSource.evidenceRole === "historical" && !verifiedSource.year && !pageAuthors.length && !page.metadata.pagePublisher) metadataGaps.push("author");
    if (metadataGaps.length) {
      rejectedSources.push(rejection(page.metadata, "incomplete_bibliographic_metadata", { ...page, metadataGaps }));
      continue;
    }
    acceptedDomains.add(page.domain);
    verifiedSource.apaCitation = bibliography.format(verifiedSource);
    verifiedSources.push(verifiedSource);
  }
  return { verifiedSources, rejectedSources, retrievedPages: retrieved, quotaLimited };
}

module.exports = {
  MAX_REDIRECTS, MAX_SOURCE_BYTES, SUPPORTED_CONTENT_TYPES,
  assertPublicUrl, bibliographicMetadataGaps, extractPageContent, extractPublicationDate, extractPdfPublicationDate, extractBibliographicMetadata, formatApaCitation, normalizedSourceUrl, retrieveSourcePage,
  verifyCandidateSources
};
