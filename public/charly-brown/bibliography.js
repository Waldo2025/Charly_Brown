export function collectSessionBibliography(session = {}) {
  const entries = [];
  (session.units || []).forEach((unit) => {
    approvedItems(unit).forEach((content) => {
      (content.citations || []).forEach((citation) => entries.push(normalizeCitation(citation, {
        unitId: unit.id,
        unitTitle: buildUnitTitle(unit),
        contentId: content.id,
        activityId: content.activityId || "",
        researchRunIds: content.researchRunIds || []
      })));
    });
  });
  const merged = new Map();
  entries.filter((item) => item.url || item.title).forEach((item) => {
    const key = citationKey(item);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item, links: [linkage(item)] });
      return;
    }
    current.links = dedupeLinks([...current.links, linkage(item)]);
    current.unitIds = [...new Set([...current.unitIds, ...item.unitIds])];
  });
  return Array.from(merged.values()).sort((a, b) => a.apa.localeCompare(b.apa, "es"));
}

export function normalizeCitation(value = {}, linkageValue = {}) {
  const source = value && typeof value === "object" ? value : { title: String(value || "") };
  const authors = normalizeAuthors(source.authors || source.author || source.autor || source.creator);
  const year = normalizeYear(source.year || source.date || source.fecha || source.publishedAt);
  const title = clean(source.title || source.titulo || source.name || "Fuente sin título");
  const publication = clean(source.publication || source.journal || source.publisher || source.publicacion || source.siteName || "");
  const doi = normalizeDoi(source.doi || "");
  const url = normalizeUrl(source.url || source.link || (doi ? `https://doi.org/${doi}` : ""));
  const normalized = {
    id: clean(source.id || source.sourceId || ""), authors, year, title, publication,
    volume: clean(source.volume || ""), issue: clean(source.issue || source.number || ""),
    pages: clean(source.pages || ""), doi, url,
    accessedAt: clean(source.accessedAt || source.consultedAt || ""),
    verificationStatus: clean(source.verificationStatus || source.status || ""),
    unitIds: linkageValue.unitId ? [String(linkageValue.unitId)] : [],
    unitTitle: clean(linkageValue.unitTitle || ""), contentId: clean(linkageValue.contentId || ""),
    activityId: clean(linkageValue.activityId || ""), researchRunIds: linkageValue.researchRunIds || []
  };
  normalized.apa = formatApa7(normalized);
  return normalized;
}

export function formatApa7(citation = {}) {
  const authorText = citation.authors.length ? formatAuthors(citation.authors) : "Autor no identificado";
  const year = citation.year || "s. f.";
  const title = ensurePeriod(citation.title || "Fuente sin título");
  const publication = citation.publication ? ` ${citation.publication}` : "";
  const volume = citation.volume ? `, ${citation.volume}${citation.issue ? `(${citation.issue})` : ""}` : "";
  const pages = citation.pages ? `, ${citation.pages}` : "";
  const locator = citation.doi ? ` https://doi.org/${citation.doi}` : citation.url ? ` ${citation.url}` : "";
  return `${authorText} (${year}). ${title}${publication}${volume}${pages}.${locator}`.replace(/\.\./g, ".").trim();
}

function approvedItems(unit = {}) {
  const accepted = unit.accepted || {};
  return [accepted.reading, ...(accepted.activities || []), ...(accepted.resources || [])].filter(Boolean);
}

function buildUnitTitle(unit = {}) {
  const number = String(unit.meta?.unit || "").trim();
  return String(unit.title || (number ? `Unidad ${number}` : "Unidad")).trim();
}

function normalizeAuthors(value) {
  if (Array.isArray(value)) return value.map(authorName).filter(Boolean);
  return String(value || "").split(/\s*;\s*|\s+and\s+|\s+y\s+/i).map(authorName).filter(Boolean);
}

function authorName(value) {
  if (typeof value === "object") return clean(value.name || [value.family, value.given].filter(Boolean).join(", "));
  return clean(value);
}

function formatAuthors(authors = []) {
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors.slice(0, -1).join(", ")}, & ${authors.at(-1)}`;
}

function normalizeYear(value = "") {
  return String(value || "").match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

function normalizeDoi(value = "") {
  return clean(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
}

function normalizeUrl(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch (_) {
    return raw;
  }
}

function citationKey(item = {}) {
  if (item.doi) return `doi:${item.doi.toLowerCase()}`;
  if (item.url) return `url:${item.url.toLowerCase().replace(/\/$/, "")}`;
  return `meta:${normalize(`${item.authors.join(" ")} ${item.title} ${item.year}`)}`;
}

function linkage(item = {}) {
  return { unitId: item.unitIds[0] || "", unitTitle: item.unitTitle, contentId: item.contentId, activityId: item.activityId };
}

function dedupeLinks(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.unitId}:${item.contentId}:${item.activityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensurePeriod(value = "") {
  const text = clean(value);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function normalize(value = "") {
  return clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}
