const SOURCE_FIELDS = ["title", "authors", "author", "year", "publishedAt", "datePublished", "journal", "journalTitle", "volume", "issue", "pages", "publisher", "channel"];
const SOURCE_POOLS = ["sources", "usedSources", "supplementarySources", "researchSources"];
const BIBLIOGRAPHY_HEADING = /^(?:#{1,6}\s*)?(?:referencias bibliogr[aá]ficas|bibliograf[ií]a|referencias)(?:\s*:)?$/i;

function sourceKeys(source = {}) {
  const keys = [];
  if (source.id) keys.push(`id:${String(source.id)}`);
  if (source.doi) keys.push(`doi:${String(source.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase()}`);
  const url = source.url || source.finalUrl;
  if (url) keys.push(`url:${String(url).replace(/#.*$/, "").replace(/\/$/, "").toLowerCase()}`);
  return keys;
}

function withoutBibliographyBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return [];
  const result = [];
  for (const block of blocks) {
    const raw = typeof block?.text === "string" ? block.text : "";
    if (BIBLIOGRAPHY_HEADING.test(raw.trim())) break;
    const lines = raw.split(/\r?\n/);
    const headingLine = lines.findIndex((line) => BIBLIOGRAPHY_HEADING.test(line.trim()));
    if (headingLine >= 0) {
      const retained = lines.slice(0, headingLine).join("\n").trimEnd();
      if (retained) result.push({ ...block, text: retained });
      break;
    }
    result.push(block);
  }
  return result;
}

function normalizeArticleRevision(original = {}, proposed = {}) {
  const candidates = new Map();
  for (const pool of [...SOURCE_POOLS, "researchDossier"]) {
    const entries = pool === "researchDossier" ? proposed.researchDossier?.sources : proposed[pool];
    for (const source of Array.isArray(entries) ? entries : []) {
      for (const key of sourceKeys(source)) {
        if (!candidates.has(key)) candidates.set(key, source);
      }
    }
  }
  const mergeSource = (source) => {
    const candidate = sourceKeys(source).map((key) => candidates.get(key)).find(Boolean);
    if (!candidate) return source;
    const updates = Object.fromEntries(SOURCE_FIELDS.filter((field) => candidate[field] != null && candidate[field] !== "").map((field) => [field, candidate[field]]));
    return { ...source, ...updates };
  };
  const revised = { ...original, ...proposed, blocks: withoutBibliographyBlocks(proposed.blocks ?? original.blocks) };
  for (const pool of SOURCE_POOLS) {
    if (Array.isArray(original[pool])) revised[pool] = original[pool].map(mergeSource);
    else delete revised[pool];
  }
  if (original.researchDossier) {
    revised.researchDossier = {
      ...original.researchDossier,
      ...(Array.isArray(original.researchDossier.sources) ? { sources: original.researchDossier.sources.map(mergeSource) } : {})
    };
  } else {
    delete revised.researchDossier;
  }
  return revised;
}

module.exports = { normalizeArticleRevision, withoutBibliographyBlocks };
