const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const net = require("node:net");
const { isPrivateIp } = require("./marcie-wordpress-core.js");

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const SOURCE_TIMEOUT_MS = 9000;
const SUPPORTED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
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
  if (!Number.isFinite(parsed.getTime())) return "";
  const year = parsed.getUTCFullYear();
  if (year < 1400 || year > new Date().getUTCFullYear() + 1) return "";
  return parsed.toISOString();
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

function extractPublicationDate(source = "", pageUrl = "") {
  const jsonLdDate = publicationDateFromJsonLd(source);
  if (jsonLdDate) return { publishedAt: jsonLdDate, dateSource: "json_ld" };
  for (const tag of String(source).match(/<meta\b[^>]*>/gi) || []) {
    const key = (htmlAttribute(tag, "property") || htmlAttribute(tag, "name") || htmlAttribute(tag, "itemprop")).toLowerCase();
    if (!["article:published_time", "datepublished", "date", "pubdate", "publishdate", "datecreated"].includes(key)) continue;
    const publishedAt = normalizePublicationDate(htmlAttribute(tag, "content"));
    if (publishedAt) return { publishedAt, dateSource: "meta" };
  }
  for (const tag of String(source).match(/<time\b[^>]*>/gi) || []) {
    const publishedAt = normalizePublicationDate(htmlAttribute(tag, "datetime"));
    if (publishedAt) return { publishedAt, dateSource: "time" };
  }
  const urlMatch = String(pageUrl).match(/\/(20\d{2})\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/|$)/);
  if (urlMatch) {
    const publishedAt = normalizePublicationDate(`${urlMatch[1]}-${String(urlMatch[2]).padStart(2, "0")}-${String(urlMatch[3]).padStart(2, "0")}T00:00:00Z`);
    if (publishedAt) return { publishedAt, dateSource: "url" };
  }
  return { publishedAt: "", dateSource: "unknown" };
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
    ...extractPublicationDate(source, pageUrl)
  };
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
  if ([404, 410].includes(response.status)) throw sourceFailure("not_found", { httpStatus: response.status });
  if (!response.ok) throw sourceFailure("unreachable", { httpStatus: response.status });
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!SUPPORTED_CONTENT_TYPES.includes(contentType)) throw sourceFailure("unsupported_type", { httpStatus: response.status, contentType });
  if ((current.pathname === "/" || !current.pathname) && !current.search) throw sourceFailure("generic_homepage", { httpStatus: response.status });
  const body = await readBoundedBody(response, Number(options.maxBytes || MAX_SOURCE_BYTES));
  const extracted = extractPageContent(body.toString("utf8"), contentType, current.toString());
  if (extracted.text.length < 240) throw sourceFailure("empty_content", { httpStatus: response.status });
  return {
    id: clampText(candidate.id, 120) || `source-${crypto.randomUUID()}`,
    requestedUrl: requested.toString(), finalUrl: current.toString(), domain: current.hostname.replace(/^www\./i, ""),
    proposedTitle: clampText(candidate.title, 500), retrievedTitle: extracted.title || clampText(candidate.title, 500) || current.hostname,
    text: extracted.text, publishedAt: extracted.publishedAt, dateSource: extracted.dateSource,
    httpStatus: response.status, contentType,
    contentHash: crypto.createHash("sha256").update(extracted.text).digest("hex"), retrievedAt: new Date().toISOString(),
    metadata: candidate
  };
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
    reason, httpStatus: Number(details.httpStatus || 0), publishedAt: clampText(details.publishedAt, 80), checkedAt: new Date().toISOString()
  };
}

async function verifyCandidateSources({ candidates = [], context = "", assessSources, retrievalCache = new Map(), distinctDomains = false, maxCandidates = 16, retrievalConcurrency = 4, retrieveOptions = {}, dateWindow = null, allowHistorical = false } = {}) {
  const unique = [];
  const seen = new Set();
  const seenIds = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const parsed = normalizedSourceUrl(candidate?.url);
    if (!parsed || seen.has(parsed.toString())) continue;
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
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, Math.min(6, Number(retrievalConcurrency) || 4)), unique.length) }, async () => {
    while (cursor < unique.length) {
      const candidate = unique[cursor];
      cursor += 1;
      let pagePromise = retrievalCache.get(candidate.url);
      if (!pagePromise) {
        const load = () => retrieveSourcePage(candidate, retrieveOptions);
        pagePromise = typeof retrieveOptions.schedule === "function" ? retrieveOptions.schedule(load) : load();
        retrievalCache.set(candidate.url, pagePromise);
      }
    try {
      const page = await pagePromise;
      const role = String(candidate.evidenceRole || "current").toLowerCase() === "historical" ? "historical" : "current";
      const publishedTime = page.publishedAt ? new Date(page.publishedAt).getTime() : NaN;
      const fromTime = dateWindow?.from ? new Date(dateWindow.from).getTime() : NaN;
      const toTime = dateWindow?.to ? new Date(dateWindow.to).getTime() : NaN;
      if (dateWindow && role === "current" && !Number.isFinite(publishedTime)) {
        rejectedSources.push(rejection(candidate, "publication_date_unknown", page));
      } else if (dateWindow && role === "current" && ((Number.isFinite(fromTime) && publishedTime < fromTime) || (Number.isFinite(toTime) && publishedTime > toTime))) {
        rejectedSources.push(rejection(candidate, "outside_period", page));
      } else if (role === "historical" && !allowHistorical) {
        rejectedSources.push(rejection(candidate, "outside_period", page));
      } else {
        retrieved.push({ ...page, id: candidate.id, metadata: { ...candidate, evidenceRole: role } });
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
    return { verifiedSources: [], rejectedSources: [...rejectedSources, ...retrieved.map((item) => rejection(item.metadata, "verification_error"))], retrievedPages: retrieved };
  }
  let assessments;
  let assessmentFailed = false;
  try {
    const assessmentBatches = [];
    for (let index = 0; index < retrieved.length; index += 8) assessmentBatches.push(retrieved.slice(index, index + 8));
    assessments = (await Promise.all(assessmentBatches.map((pages) => assessSources({ context: clampText(context, 12000), pages })))).flat();
  } catch (_) {
    assessments = [];
    assessmentFailed = true;
  }
  const byId = new Map((Array.isArray(assessments) ? assessments : []).map((item) => [String(item.id || ""), item]));
  const verifiedSources = [];
  const acceptedDomains = new Set();
  for (const page of retrieved) {
    const assessment = byId.get(page.id);
    if (!assessment || assessment.status !== "verified") {
      rejectedSources.push(rejection(page.metadata, assessment?.reason || (assessmentFailed ? "verification_error" : "content_mismatch"), page));
      continue;
    }
    if (distinctDomains && acceptedDomains.has(page.domain)) {
      rejectedSources.push(rejection(page.metadata, "content_mismatch", page));
      continue;
    }
    acceptedDomains.add(page.domain);
    verifiedSources.push({
      id: page.id, title: page.retrievedTitle, url: page.finalUrl, requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl, domain: page.domain, publisher: clampText(page.metadata.publisher || page.metadata.organization, 300),
      authors: page.metadata.authors || page.metadata.author || "",
      publishedAt: page.publishedAt || "", dateSource: page.dateSource || "unknown",
      year: page.publishedAt ? String(new Date(page.publishedAt).getUTCFullYear()) : clampText(page.metadata.year || page.metadata.publishedYear, 20),
      evidenceRole: page.metadata.evidenceRole || "current",
      doi: clampText(page.metadata.doi, 300), sourceType: clampText(page.metadata.sourceType, 80) || "web",
      qualityTier: classifySourceQuality(page), verificationStatus: "verified", retrievalStatus: "success",
      verifiedAt: page.retrievedAt, retrievedAt: page.retrievedAt, contentHash: page.contentHash,
      supportSummary: clampText(assessment.supportSummary, 600), locator: clampText(assessment.locator, 300),
      supports: Array.isArray(assessment.supports) ? assessment.supports.map((value) => clampText(value, 160)).filter(Boolean).slice(0, 20) : []
    });
  }
  return { verifiedSources, rejectedSources, retrievedPages: retrieved };
}

module.exports = {
  MAX_REDIRECTS, MAX_SOURCE_BYTES, SUPPORTED_CONTENT_TYPES,
  assertPublicUrl, extractPageContent, extractPublicationDate, normalizedSourceUrl, retrieveSourcePage,
  verifyCandidateSources
};
