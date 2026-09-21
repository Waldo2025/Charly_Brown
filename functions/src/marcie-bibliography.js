/* Canonical shared bibliography implementation. Browser mirror is checked by tests. */
(function(root) {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const esc = value => clean(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  function doi(value) { return clean(value).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").toLowerCase(); }
  function sourceAuthors(source = {}) {
    return (Array.isArray(source.authors) ? source.authors : [source.authors || source.author]).filter(Boolean);
  }
  function isInstitutionName(value, source = {}) {
    const raw = clean(typeof value === "object" ? value.name : value);
    if (!raw) return false;
    if (raw === clean(source.publisher) || /^[A-ZÁÉÍÓÚÑ0-9&.-]{2,}$/.test(raw)) return true;
    return /\b(universidad|university|instituto|institute|centro|center|colegio|college|escuela|school|ministerio|ministry|secretar[ií]a|department|departamento|organizaci[oó]n|organization|asociaci[oó]n|association|fundaci[oó]n|foundation|academia|sociedad|society|consejo|council|agencia|agency|editorial|press|unesco|unicef|ocde|oecd|oms|who)\b/i.test(raw);
  }
  function initials(value = "") {
    return clean(value).split(/[\s-]+/).filter(Boolean).map(part => part[0]?.toUpperCase() + ".").join(" ");
  }
  function authorParts(value, source = {}) {
    if (value && typeof value === "object") {
      if (value.family) return { family: clean(value.family), given: clean(value.given), institution: false };
      return { family: clean(value.name), given: "", institution: true };
    }
    const raw = clean(value);
    if (!raw || isInstitutionName(raw, source)) return { family: raw, given: "", institution: true };
    const inverted = raw.match(/^([^,]+),\s*(.+)$/);
    if (inverted) return { family: clean(inverted[1]), given: clean(inverted[2]), institution: false };
    const words = raw.split(/\s+/);
    if (words.length < 2) return { family: raw, given: "", institution: false };
    return { family: words.at(-1), given: words.slice(0, -1).join(" "), institution: false };
  }
  function authorName(value) {
    const parsed = authorParts(value);
    if (parsed.institution || !parsed.given) return parsed.family;
    return parsed.family + ", " + initials(parsed.given);
  }
  function authors(source) {
    const list = sourceAuthors(source).map(value => {
      const parsed = authorParts(value, source);
      return parsed.institution || !parsed.given ? parsed.family : parsed.family + ", " + initials(parsed.given);
    }).filter(Boolean);
    if (!list.length && clean(source.publisher)) return clean(source.publisher);
    if (!list.length) return "";
    const chosen = list.length > 20 ? [...list.slice(0, 19), "…", list[list.length - 1]] : list;
    return chosen.length === 1 ? chosen[0] : chosen.slice(0, -1).join(", ") + (list.length > 20 ? ", " : ", & ") + chosen.at(-1);
  }
  function year(source) { return clean(source.year || source.publishedAt || source.datePublished).match(/\b(?:18|19|20)\d{2}\b/)?.[0] || "s. f."; }
  function link(source) {
    const id = doi(source.doi);
    const value = id ? "https://doi.org/" + id : clean(source.url || source.finalUrl);
    try { return /^https?:$/.test(new URL(value).protocol) ? value : ""; } catch (_) { return ""; }
  }
  function parts(source, html = false) {
    const rich = html === true;
    const markdown = html === "markdown";
    const t = rich ? esc : clean;
    const italic = value => rich ? "<em>" + t(value) + "</em>" : markdown ? "*" + t(value) + "*" : t(value);
    const name = authors(source);
    const title = clean(source.title) || "[Documento sin título]";
    const journal = clean(source.journal || source.journalTitle);
    const first = name
      ? t(name) + (name.endsWith(".") ? " (" : ". (") + (year(source) + (source.citationSuffix || "")) + "). "
      : (journal ? t(title) : italic(title)) + ". (" + year(source) + "). ";
    const work = name ? (journal ? t(title) : italic(title)) + ". " : "";
    const volume = clean(source.volume), issue = clean(source.issue), pages = clean(source.pages);
    const publisher = clean(source.publisher);
    const publication = journal
      ? italic(journal + (volume ? ", " + volume : "")) + (issue ? "(" + t(issue) + ")" : "") + (pages ? ", " + t(pages) : "") + ". "
      : (publisher && publisher !== name ? t(publisher) + ". " : "");
    const url = link(source);
    return first + work + publication + (rich && url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + "</a>" : url);
  }
  function attributions(article = {}) {
    return [...(article.attributedReferences || []), ...(article.researchDossier?.attributedReferences || [])];
  }
  function resolveId(article, id) {
    const value = String(id);
    const targets = [...new Set(attributions(article).filter(reference => String(reference.id) === value).map(reference => reference.sourceId).filter(Boolean).map(String))];
    // Conflicting mappings are unresolved, never silently associated with the first source.
    return targets.length === 1 ? targets[0] : value;
  }
  function pool(article = {}) {
    return [...(article.usedSources || []), ...(article.sources || []), ...(article.supplementarySources || []), ...(article.researchSources || []), ...(article.researchDossier?.sources || [])].filter(Boolean);
  }
  function markerGroupIds(article, content = "") {
    const known = new Set([...pool(article).flatMap(source => [source.id, ...(source.aliasIds || [])]), ...attributions(article).map(reference => reference.id)].filter(Boolean).map(String));
    const ids = String(content).split(/\s*[,;]\s*/).map(id => id.trim());
    if (!ids.length || ids.some(id => !/^[a-zA-Z][\w:.-]*$/.test(id))) return [];
    return ids.every(id => /^(reference|source)-/.test(id) || known.has(id)) ? ids : [];
  }
  function markerIds(article, text = "") {
    return [...String(text).matchAll(/\[([^\]\n]+)\](?!\()/g)].flatMap(match => markerGroupIds(article, match[1]));
  }
  function blockIds(article, block = {}) {
    return [...new Set([...(block.sourceIds || []), ...(block.referenceIds || []), ...markerIds(article, [block.text || "", ...(block.items || [])].join("\n"))].map(String))];
  }
  function sources(article = {}) {
    const used = new Set([...(article.usedSourceIds || []), ...(article.blocks || []).flatMap(block => blockIds(article, block))].map(id => resolveId(article, id)));
    const candidates = [
      ...(article.usedSources || []),
      ...(article.sources || []),
      ...(article.supplementarySources || []),
      ...pool(article).filter(s => used.has(String(s.id)) || (s.aliasIds || []).some(id => used.has(String(id))))
    ];
    const found = new Map();
    for (const source of candidates) {
      if (!source || !clean(source.title)) continue;
      const key = doi(source.doi) || link(source).replace(/#.*$/, "") || clean(source.title).toLowerCase();
      if (!found.has(key)) found.set(key, {...source, aliasIds:[...(source.aliasIds || []), source.id].filter(Boolean)});
      else found.set(key, {...source, ...found.get(key), aliasIds:[...new Set([...(found.get(key).aliasIds || []), ...(source.aliasIds || []), source.id].filter(Boolean))]});
    }
    const sorted = [...found.values()].sort((a,b) => (authors(a) || a.title).localeCompare(authors(b) || b.title, "es") || year(a).localeCompare(year(b)) || clean(a.title).localeCompare(clean(b.title), "es"));
    const groups = new Map();
    for (const source of sorted) {
      const key = (authors(source) || source.title) + ":" + year(source);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(source);
    }
    const suffix = index => index < 26 ? String.fromCharCode(97 + index) : suffix(Math.floor(index / 26) - 1) + suffix(index % 26);
    for (const group of groups.values()) group.forEach((source,index) => { source.citationSuffix = group.length > 1 ? suffix(index) : ""; });
    return sorted;
  }
  function inlineAuthor(value, source = {}) {
    const parsed = authorParts(value, source);
    if (parsed.institution || !parsed.given) return parsed.family;
    return parsed.family + ", " + initials(parsed.given);
  }
  function citation(source, parenthetical = true) {
    const list = sourceAuthors(source);
    const fallback = clean(source.publisher) || clean(source.title) || "Documento sin autor";
    const label = list.length > 2
      ? inlineAuthor(list[0], source) + " et al."
      : list.length === 2
        ? inlineAuthor(list[0], source) + " y " + inlineAuthor(list[1], source)
        : list.length === 1 ? inlineAuthor(list[0], source) : fallback;
    const value = label + ", " + year(source) + (source.citationSuffix || "");
    return parenthetical ? "(" + value + ")" : value;
  }
  function links(article, ids = []) {
    const references = sources(article);
    const indexes = [...new Set(ids.map(id => references.findIndex(source => source.id === resolveId(article, id) || source.aliasIds?.includes(resolveId(article, id)))))].filter(index => index >= 0);
    return indexes.length ? citationGroupLink(references, indexes.map(index => references[index].id)) : "";
  }
  function citationGroupLink(references, ids = [], tokenIds = ids) {
    const entries = ids.map(id => {
      const source = references.find(candidate => candidate.id === id || candidate.aliasIds?.includes(id));
      return { id, source };
    });
    if (!entries.length) return "";
    const token = tokenIds.join(", ");
    const content = entries.map(({ id, source }) => source
      ? '<a href="#source-' + esc(source.id) + '" title="' + esc(parts(source)) + '" aria-label="Referencia: ' + esc(citation(source)) + '" style="text-decoration:none">' + esc(citation(source, false)) + '</a>'
      : '<span title="Falta el documento de la referencia ' + esc(id) + '" aria-label="Referencia sin documento asociado">?</span>').join("; ");
    return '<span data-citation-link contenteditable="false" data-citation-token="' + esc(token) + '" style="white-space:nowrap">(' + content + ')</span>';
  }
  function metadataGaps(source = {}) {
    const list = sourceAuthors(source);
    const gaps = [];
    if (!clean(source.title)) gaps.push("title");
    if (!list.length && !clean(source.publisher)) gaps.push("author");
    if (!/^\d{4}$/.test(year(source))) gaps.push("year");
    if (!clean(source.journal || source.publisher)) gaps.push("publication");
    if (!link(source)) gaps.push("locator");
    return gaps;
  }
  function integrity(article = {}) {
    const references = sources(article);
    const missing = [...new Set((article.blocks || []).flatMap(block => blockIds(article, block)))].filter(id => !references.some(source => source.id === resolveId(article, id) || source.aliasIds?.includes(resolveId(article, id))));
    return { valid: !missing.length, missing, referenceCount: references.length };
  }
  function assertIntegrity(article = {}) {
    const result = integrity(article);
    if (!result.valid) throw new Error("Hay citas sin documento bibliográfico asociado: " + result.missing.join(", ") + ". Completa o vuelve a investigar esas referencias antes de continuar.");
    return result;
  }
  function renderCitations(article, block, html) {
    const references = sources(article);
    const inlineIds = new Set();
    const rendered = String(html).split(/(<[^>]*>)/g).map(part => part.startsWith("<") ? part : part.replace(/\[([^\]\n]+)\](?!\()/g, (token, content) => {
      const ids = [...new Set(markerGroupIds(article, content))];
      if (!ids.length) return token;
      const resolvedIds = ids.map(id => {
        const resolved = resolveId(article, id);
        inlineIds.add(resolved);
        return resolved;
      });
      const linked = citationGroupLink(references, resolvedIds, ids);
      if (linked) return linked;
      return '<span data-citation-link data-citation-token="' + esc(ids.join(", ")) + '" contenteditable="false" title="Referencia pendiente: falta el documento original" aria-label="Referencia sin documento asociado">(?)</span>';
    })).join("");
    const remaining = blockIds(article, block).filter(id => !inlineIds.has(resolveId(article, id)));
    const pending = remaining.filter(id => !references.some(source => source.id === resolveId(article, id) || source.aliasIds?.includes(resolveId(article, id))));
    const trailing = links(article, remaining) + pending.map(id => '<span data-citation-link data-citation-token="' + esc(id) + '" contenteditable="false" title="Falta el documento de esta referencia">(?)</span>').join(" ");
    if (trailing && /<\/li>\s*<\/(?:ul|ol)>\s*$/.test(rendered)) return rendered.replace(/(<\/li>\s*<\/(?:ul|ol)>\s*)$/, (_, suffix) => " " + trailing + suffix);
    return trailing ? rendered.replace(/(<\/[^>]+>\s*)$/, (_, suffix) => " " + trailing + suffix) : rendered;
  }
  function markdown(article = {}) {
    const references = sources(article);
    const blocks = (article.blocks || []).map(block => {
      let text = block.text || "";
      if (block.type === "heading") text = (block.level === "h3" ? "### " : "## ") + text;
      else if (block.type === "quote") text = "> " + (block.attribution || "") + ': *“' + text + '”*';
      else if (Array.isArray(block.items) && block.items.length) text = block.items.map((item,index) => (block.listType === "ordered" ? (index+1)+". " : "- ") + item).join("\n");
      return renderCitations(article, block, text + "</span>").replace(/<\/span>$/, "");
    }).join("\n\n");
    return "# " + (article.title || "") + "\n\n" + (article.subtitle ? article.subtitle + "\n\n" : "") + blocks + "\n\n## Referencias bibliográficas\n\n" + references.map(source => '<a id="source-' + esc(source.id) + '"></a>' + parts(source, "markdown")).join("\n\n");
  }
  const api = { markdown, citation, links, sources, resolveId, markerIds, blockIds, integrity, assertIntegrity, metadataGaps, renderCitations, format: s => parts(s), formatHtml: s => parts(s, true), formatMarkdown: s => parts(s, "markdown"), year, authors, link };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MarcieBibliography = api;
})(globalThis);
