const test = require("node:test");
const assert = require("node:assert/strict");
const {
  bibliographicMetadataGaps,
  extractPageContent,
  extractPdfPublicationDate,
  extractBibliographicMetadata,
  formatApaCitation,
  retrieveSourcePage,
  verifyCandidateSources
} = require("../src/marcie-source-verifier.js");
const { extractAttributedReferences, generateJson, parseJsonResponse, rankTrendOpportunities, refreshMarcieTrends, researchDateWindow, verifyArticleEvidenceServer, verifyAndRepairArticleEvidenceServer } = require("../src/marcie-editorial-research.js");
const { identifierFromUrl } = require("../src/marcie-scholarly-fallback.js");
const { searchScientificCatalogs } = require("../src/marcie-catalog-search.js");

test("la reparación automática conserva artículos sin respaldo sin retirar contenido", async () => {
  const introduction = Array(120).fill("contenido verificado").join(" ");
  const unsupported = Array(140).fill("afirmación no comprobada").join(" ");
  const article = {
    title: "Artículo", blocks: [
      { id: "intro", type: "paragraph", text: introduction },
      { id: "claim", type: "paragraph", text: unsupported }
    ],
    articleClaims: [{ id: "c1", blockId: "claim", text: unsupported, status: "unsupported" }],
    sources: [], researchSources: [], verification: { status: "blocked", blockers: [unsupported] }
  };
  const calls = [];
  const result = await verifyAndRepairArticleEvidenceServer({
    article,
    dependencies: { verifyArticleEvidence: async (input) => {
      calls.push(input);
      return calls.length === 1 ? article : { ...input.article, verification: { status: "verified", blockers: [], coverage: 100 } };
    } }
  });
  assert.equal(calls.length, 1);
  assert.equal(result.verification.status, "blocked");
  assert.match(result.verification.blockers.join(" "), /afirmación no comprobada/);
  assert.deepEqual(result.blocks.map((block) => block.id), ["intro", "claim"]);
  assert.equal(result.automaticCorrections?.length || 0, 0);
});

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];
const html = (title, text) => `<!doctype html><html><head><title>${title}</title><meta property="article:published_time" content="2026-08-10T12:00:00Z"></head><body><main><h1>${title}</h1><p>${text.repeat(8)}</p></main></body></html>`;
const okPage = (title = "Estudio", text = "La evidencia describe cómo el sueño contribuye a consolidar la memoria. ") => new Response(html(title, text), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

function modelJson(value) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] };
}

test("malformed model JSON is classified as an upstream 502 and retried once", async () => {
  assert.deepEqual(parseJsonResponse({ candidates: [{ content: { parts: [{ text: '{"items":[{"id":1} {"id":2}]}' }] } }] }), { items: [{ id: 1 }, { id: 2 }] });
  assert.throws(() => parseJsonResponse({ candidates: [{ content: { parts: [{ text: '{"items":[1 2]}' }] } }] }), (error) => {
    assert.equal(error.code, "marcie_research_invalid_json");
    assert.equal(error.status, 502);
    return true;
  });
  const prompts = [];
  const client = { models: { generateContent: async (request) => {
    prompts.push(request.contents[0].parts[0].text);
    return prompts.length === 1
      ? { candidates: [{ content: { parts: [{ text: '{"items":[1 2]}' }] } }] }
      : modelJson({ items: [1, 2] });
  } } };
  const result = await generateJson({ client, prompt: "Devuelve elementos" });
  assert.deepEqual(result.parsed, { items: [1, 2] });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /REINTENTO DE FORMATO/);
});

function trendDb(existingSnapshot = null) {
  let written = null;
  const db = { collection(name) {
    if (name === "MarcieEditorialSettings") return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
    if (name === "MarcieEditorialCalendar") return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
    if (name === "MarcieTrendSnapshots") return { doc: (id) => ({
      id,
      get: async () => ({ exists: Boolean(existingSnapshot), data: () => existingSnapshot }),
      set: async (value) => { written = value; }
    }) };
    throw new Error(`unexpected collection ${name}`);
  } };
  return { db, written: () => written };
}

test("HTML extraction removes executable chrome and keeps the real title and article text", () => {
  const page = extractPageContent(`<title>Título real</title><script>secreto()</script><nav>Menú</nav><article><p>Contenido documental suficiente para verificar una afirmación.</p></article>`);
  assert.equal(page.title, "Título real");
  assert.match(page.text, /Contenido documental/);
  assert.doesNotMatch(page.text, /secreto|Menú/);
});

test("a direct PDF inherits publication metadata only from a page that links that PDF", async () => {
  const stream = "BT /F1 12 Tf 20 750 Td " + Array.from({ length: 8 }, () => "(Learning research supports classroom practice and evidence.) Tj 0 -20 Td").join(" ") + " ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n" + offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const candidate = { id: "pdf-landing", title: "Learning research", url: "https://example.org/files/paper.pdf", landingUrl: "https://example.org/paper" };
  const fetchImpl = async (url) => String(url).endsWith(".pdf")
    ? new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf" } })
    : new Response('<html><head><meta name="citation_publication_date" content="2022-05-01"><meta name="citation_author" content="Ana García"><title>Learning research</title></head><body><a href="/files/paper.pdf">Descargar PDF</a><p>Estudio sobre aprendizaje en el aula.</p></body></html>', { headers: { "content-type": "text/html" } });
  const page = await retrieveSourcePage(candidate, { resolveHost: publicDns, fetchImpl });
  assert.equal(page.metadata.bibliographicMetadata.landingUrl, candidate.landingUrl);
  assert.equal(page.publishedAt, "2022-05-01T00:00:00.000Z");
  assert.equal(page.metadata.pageAuthors[0], "Ana García");
  assert.match(page.text, /Página que enlaza el PDF/);
  const downloaded = await retrieveSourcePage(candidate, { resolveHost: publicDns, fetchImpl: async (url) => String(url).endsWith(".pdf")
    ? new Response(Buffer.from(pdf), { headers: { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="paper.pdf"' } })
    : fetchImpl(url) });
  assert.equal(downloaded.contentType, "application/pdf");
  assert.equal(downloaded.publishedAt, page.publishedAt);
  const unrelated = await retrieveSourcePage({ ...candidate, landingUrl: "https://example.org/unrelated" }, {
    resolveHost: publicDns,
    fetchImpl: async (url) => String(url).endsWith(".pdf")
      ? new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf" } })
      : new Response('<html><head><meta name="citation_publication_date" content="2022-05-01"></head><body><a href="/another.pdf">Otro PDF</a></body></html>', { headers: { "content-type": "text/html" } })
  });
  assert.equal(unrelated.publishedAt, "");
});

test("URL Context is skipped after successful fetch and used once for empty public pages", async () => {
  const candidate = { id: "source-1", title: "Estudio", url: "https://example.org/study" };
  let contextCalls = 0;
  const urlContextReader = async () => {
    contextCalls += 1;
    return { retrieved: true, finalUrl: candidate.url, text: "Hallazgos documentados sobre el aprendizaje escolar. ".repeat(12) };
  };
  const good = await retrieveSourcePage(candidate, { resolveHost: publicDns, fetchImpl: async () => okPage(), urlContextReader });
  assert.equal(good.retrievalMethod, "fetch");
  assert.equal(contextCalls, 0);
  const recovered = await verifyCandidateSources({
    candidates: [candidate, { ...candidate, id: "source-duplicate" }],
    retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => new Response("<main>Vacío</main>", { status: 200, headers: { "content-type": "text/html" } }), urlContextReader },
    assessSources: async ({ pages }) => pages.map((page) => ({ id: page.id, status: "verified", supportSummary: "Hallazgo" }))
  });
  assert.equal(contextCalls, 1);
  assert.equal(recovered.retrievedPages[0].retrievalMethod, "url_context");
});

test("Europe PMC recovers an exact DOI with abstract and APA metadata only after fetch fails", async () => {
  const url = "https://onlinelibrary.wiley.com/doi/10.1234/teaching.2025.7";
  const candidate = { id: "source-1", title: "Aprendizaje y estrés", url, sourceType: "journal" };
  const record = {
    doi: "10.1234/teaching.2025.7", pmid: "12345678", title: "Aprendizaje y estrés",
    abstractText: "<p>Estudio longitudinal sobre estrés verbal docente y desarrollo del lenguaje infantil. ".repeat(6) + "</p>",
    authorList: { author: [{ fullName: "Ana Pérez" }] }, firstPublicationDate: "2025-02-10",
    journalInfo: { journal: { title: "Revista de Educación" }, volume: "12", issue: "2" }
  };
  const calls = [];
  const fetchImpl = async (input) => {
    calls.push(String(input));
    return String(input).includes("europepmc")
      ? new Response(JSON.stringify({ resultList: { result: [record] } }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("unavailable", { status: 403 });
  };
  const result = await verifyCandidateSources({
    candidates: [candidate], retrieveOptions: { fetchImpl, resolveHost: publicDns },
    assessSources: async ({ pages }) => pages.map(page => ({ id: page.id, status: "verified", supportSummary: "El resumen respalda el hallazgo.", locator: "Resumen" }))
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /query=DOI%3A10\.1234%2Fteaching\.2025\.7/);
  assert.equal(result.retrievedPages[0].retrievalMethod, "europe_pmc");
  assert.equal(result.verifiedSources.length, 1);
  assert.match(result.verifiedSources[0].apaCitation, /Pérez/);
  assert.deepEqual(identifierFromUrl(new URL("https://pubmed.ncbi.nlm.nih.gov/12345678/")), { field: "EXT_ID", value: "12345678" });
});

test("Europe PMC rejects a mismatched record and is skipped when fetch succeeds", async () => {
  const candidate = { id: "source-1", url: "https://pubmed.ncbi.nlm.nih.gov/12345678/" };
  let apiCalls = 0;
  const mismatched = await retrieveSourcePage(candidate, {
    resolveHost: publicDns,
    fetchImpl: async (input) => {
      if (String(input).includes("europepmc")) {
        apiCalls += 1;
        return new Response(JSON.stringify({ resultList: { result: [{ pmid: "87654321" }] } }), { status: 200 });
      }
      return new Response("unavailable", { status: 403 });
    }
  }).catch(error => error);
  assert.equal(mismatched.code, "unreachable");
  assert.equal(apiCalls, 1);
  const page = await retrieveSourcePage(candidate, { resolveHost: publicDns, fetchImpl: async () => okPage() });
  assert.equal(page.retrievalMethod, "fetch");
  assert.equal(apiCalls, 1);
});

test("bibliographic metadata produces APA 7 without inventing missing fields", () => {
  const metadata = extractBibliographicMetadata(`<script type="application/ld+json">{"@type":"ScholarlyArticle","author":[{"name":"María Pérez"}],"publisher":{"name":"Revista Educación"},"identifier":"https://doi.org/10.1234/abc.5"}</script>`);
  assert.deepEqual(metadata.authors, ["María Pérez"]);
  assert.equal(metadata.publisher, "Revista Educación");
  assert.equal(metadata.doi, "10.1234/abc.5");
  assert.equal(formatApaCitation({ authors: metadata.authors, publishedAt: "2026-08-10", title: "Aprendizaje y memoria", publisher: metadata.publisher, doi: metadata.doi }), "Pérez, M. (2026). Aprendizaje y memoria. Revista Educación. https://doi.org/10.1234/abc.5");
  assert.equal(formatApaCitation({ authors: [], title: "Guía docente", publisher: "UNESCO", url: "https://unesco.example/guia" }), "UNESCO. (s. f.). Guía docente. https://unesco.example/guia");
});

test("PDF front matter supplies only an explicit publication year or date", () => {
  assert.deepEqual(extractPdfPublicationDate("Study title\nPublished: 2021\nResults from 2019"), { publishedAt: "", year: "2021", dateSource: "pdf_text" });
  assert.deepEqual(extractPdfPublicationDate("Study title\nPublication date: 2021-08-15\nResults"), { publishedAt: "2021-08-15T00:00:00.000Z", year: "2021", dateSource: "pdf_text" });
  assert.deepEqual(extractPdfPublicationDate("Study title\nCreated 2024\nResults from 2019"), { publishedAt: "", year: "", dateSource: "unknown" });
});

test("sources without complete APA metadata are rejected so research can replace them", async () => {
  assert.deepEqual(bibliographicMetadataGaps({ title: "Documento", publisher: "Institución", url: "https://example.org/doc" }), ["year"]);
  const result = await verifyCandidateSources({
    candidates: [{ id: "missing-year", title: "Documento", url: "https://example.org/doc" }],
    context: "Aprendizaje",
    retrieveOptions: {
      resolveHost: publicDns,
      fetchImpl: async () => new Response(`<!doctype html><title>Documento</title><main>${"Evidencia sobre aprendizaje. ".repeat(20)}</main>`, { status: 200, headers: { "content-type": "text/html" } })
    },
    assessSources: async ({ pages }) => pages.map((page) => ({ id: page.id, status: "verified", supportSummary: "Respalda", locator: "Resultados" }))
  });
  assert.equal(result.verifiedSources.length, 0);
  assert.equal(result.rejectedSources[0].reason, "incomplete_bibliographic_metadata");
  assert.deepEqual(result.rejectedSources[0].metadataGaps, ["year"]);
});

test("verified undated documents remain historical and use s. f. when dated alternatives run out", async () => {
  const candidates = Array.from({ length: 4 }, (_, index) => ({ id: `undated-${index}`, title: `Documento ${index}`, url: `https://example.org/doc-${index}`, evidenceRole: "current" }));
  const result = await verifyCandidateSources({
    candidates, context: "Aprendizaje", allowHistorical: true,
    dateWindow: { from: "2026-03-01", to: "2026-09-23" },
    retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => new Response(`<!doctype html><title>Documento</title><meta name="citation_author" content="Ana García"><meta name="citation_journal_title" content="Educación"><main>${"Evidencia pertinente sobre aprendizaje. ".repeat(20)}</main>`, { status: 200, headers: { "content-type": "text/html" } }) },
    assessSources: async ({ pages }) => pages.map((page) => ({ id: page.id, status: "verified", supportSummary: "El documento analiza el aprendizaje.", locator: "Resultados" }))
  });
  assert.equal(result.verifiedSources.length, 4);
  assert.equal(result.rejectedSources.length, 0);
  assert.ok(result.verifiedSources.every((source) => source.evidenceRole === "historical" && source.year === "" && source.apaCitation.includes("s. f.")));
});

test("a proposed year appearing only in the body is not treated as a publication date", async () => {
  const result = await verifyCandidateSources({
    candidates: [{ id: "study", title: "Estudio", url: "https://example.org/study", year: "2020", evidenceRole: "historical" }],
    context: "Aprendizaje", allowHistorical: true,
    retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => new Response(`<title>Estudio</title><meta name="citation_author" content="Ana García"><meta name="citation_journal_title" content="Educación"><main>${"El análisis compara datos escolares de 2020 sin indicar la fecha de publicación. ".repeat(20)}</main>`, { headers: { "content-type": "text/html" } }) },
    assessSources: async ({ pages }) => pages.map((page) => ({ id: page.id, status: "verified", supportSummary: "Datos escolares pertinentes", locator: "Resultados" }))
  });
  assert.equal(result.verifiedSources.length, 1);
  assert.equal(result.verifiedSources[0].year, "");
  assert.match(result.verifiedSources[0].apaCitation, /s\. f\./);
});

test("direct quotations survive only when they are short and literally present in the verified page", async () => {
  const client = { models: { generateContent: async () => modelJson({ attributedReferences: [
    { personOrInstitution: "María Pérez", role: "investigadora", text: "La curiosidad activa el aprendizaje", type: "direct_quote", sourceId: "s1", locator: "Introducción" },
    { personOrInstitution: "María Pérez", role: "investigadora", text: "Esta frase no aparece en la página", type: "direct_quote", sourceId: "s1", locator: "Introducción" },
    { personOrInstitution: "UNESCO", text: "La educación necesita contextos seguros", type: "paraphrase", sourceId: "s2" }
  ] }) } };
  const references = await extractAttributedReferences({
    client,
    verifiedSources: [
      { id: "s1", authors: ["María Pérez"], publisher: "Universidad Ejemplo", domain: "example.edu", verificationStatus: "verified" },
      { id: "s2", authors: [], publisher: "UNESCO", domain: "unesco.org", verificationStatus: "verified" }
    ],
    retrievedPages: [
      { id: "s1", text: "María Pérez, investigadora, sostiene: La curiosidad activa el aprendizaje en contextos significativos." },
      { id: "s2", text: "UNESCO analiza la importancia de contextos seguros para la educación." }
    ]
  });
  assert.equal(references.length, 2);
  assert.equal(references[0].type, "direct_quote");
  assert.equal(references[0].text, "La curiosidad activa el aprendizaje");
  assert.equal(references[1].type, "paraphrase");
});

test("publication date is recovered from the page and current sources outside the selected month are rejected", async () => {
  const currentHtml = `<!doctype html><html><head><title>Actual</title><meta property="article:published_time" content="2026-08-10T09:00:00-05:00"></head><body><article>${"Contenido actual pertinente. ".repeat(20)}</article></body></html>`;
  const oldHtml = `<!doctype html><html><head><title>Anterior</title><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2025-08-10"}</script></head><body><article>${"Contenido anterior pertinente. ".repeat(20)}</article></body></html>`;
  const dateWindow = researchDateWindow("1m", new Date("2026-08-25T12:00:00Z"));
  const result = await verifyCandidateSources({
    candidates: [
      { id: "current", title: "Actual", url: "https://news.example/2026/08/10/actual", evidenceRole: "current" },
      { id: "old", title: "Anterior", url: "https://old.example/2025/08/10/anterior", evidenceRole: "current" }
    ],
    context: "Contenido pertinente",
    dateWindow,
    retrieveOptions: { resolveHost: publicDns, fetchImpl: async (url) => new Response(String(url).includes("old.example") ? oldHtml : currentHtml, { status: 200, headers: { "content-type": "text/html" } }) },
    assessSources: async ({ pages }) => pages.map((page) => ({ id: page.id, status: "verified", supportSummary: "Respalda", locator: "Artículo" }))
  });
  assert.deepEqual(result.verifiedSources.map((source) => source.id), ["current"]);
  assert.equal(result.verifiedSources[0].publishedAt, "2026-08-10T14:00:00.000Z");
  assert.equal(result.rejectedSources.find((source) => source.id === "old")?.reason, "outside_period");
});

test("a historical source can remain as a dated antecedent but never counts as a current source", async () => {
  const result = await verifyCandidateSources({
    candidates: [{ id: "history", title: "Antecedente", url: "https://archive.example/2020/01/10/history", evidenceRole: "historical" }],
    context: "Antecedente histórico",
    dateWindow: researchDateWindow("1m", new Date("2026-08-25T12:00:00Z")),
    allowHistorical: true,
    retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => new Response(`<!doctype html><title>Antecedente</title><time datetime="2020-01-10"></time><article>${"Antecedente histórico documentado. ".repeat(15)}</article>`, { status: 200, headers: { "content-type": "text/html" } }) },
    assessSources: async ({ pages }) => pages.map((page) => ({ id: page.id, status: "verified", supportSummary: "Antecedente", locator: "Historia" }))
  });
  assert.equal(result.verifiedSources[0].evidenceRole, "historical");
  assert.equal(result.verifiedSources[0].year, "2020");
});

test("source retrieval rejects private hosts, missing pages and generic homepages", async () => {
  await assert.rejects(() => retrieveSourcePage({ url: "https://127.0.0.1/private" }, { resolveHost: publicDns, fetchImpl: async () => okPage() }), { code: "unsafe_url" });
  await assert.rejects(() => retrieveSourcePage({ url: "https://example.com/missing" }, { resolveHost: publicDns, fetchImpl: async () => new Response("missing", { status: 404, headers: { "content-type": "text/html" } }) }), { code: "not_found" });
  await assert.rejects(() => retrieveSourcePage({ url: "https://example.com/" }, { resolveHost: publicDns, fetchImpl: async () => okPage() }), { code: "generic_homepage" });
});

test("browser fallback is skipped when fetch extracts enough source text", async () => {
  let browserCalls = 0;
  const page = await retrieveSourcePage({ id: "fast", title: "Fuente", url: "https://example.com/source" }, {
    resolveHost: publicDns,
    fetchImpl: async () => okPage("Fuente", "Contenido verificable sobre aprendizaje y memoria. "),
    playwrightReader: async () => {
      browserCalls += 1;
      return { html: html("Fallback", "No debería usarse. ") };
    }
  });
  assert.equal(page.retrievalMethod, "fetch");
  assert.equal(browserCalls, 0);
});

test("browser fallback reads a dynamic source once when fetch returns empty content", async () => {
  let browserCalls = 0;
  const page = await retrieveSourcePage({ id: "dynamic", title: "Dinámica", url: "https://example.com/dynamic" }, {
    resolveHost: publicDns,
    fetchImpl: async () => new Response("<!doctype html><title>Dinámica</title><div id='app'></div>", { status: 200, headers: { "content-type": "text/html" } }),
    playwrightReader: async ({ url }) => {
      browserCalls += 1;
      return {
        finalUrl: url,
        html: html("Dinámica", "Texto cargado por navegador con evidencia suficiente para validar la fuente. ")
      };
    }
  });
  assert.equal(page.retrievalMethod, "playwright");
  assert.equal(page.retrievedTitle, "Dinámica");
  assert.equal(browserCalls, 1);
});

test("browser fallback can read a public article whose direct request returns 403", async () => {
  let browserCalls = 0;
  const page = await retrieveSourcePage({ id: "restricted", title: "Artículo", url: "https://example.com/article" }, {
    resolveHost: publicDns,
    fetchImpl: async () => new Response("Forbidden", { status: 403 }),
    playwrightReader: async ({ url }) => {
      browserCalls += 1;
      return { finalUrl: url, html: html("Artículo", "Contenido científico disponible en la página pública. ") };
    }
  });
  assert.equal(page.retrievalMethod, "playwright");
  assert.equal(browserCalls, 1);
});

test("browser fallback respects the per-run budget", async () => {
  let browserCalls = 0;
  await assert.rejects(() => retrieveSourcePage({ id: "empty", title: "Vacía", url: "https://example.com/empty" }, {
    resolveHost: publicDns,
    fetchImpl: async () => new Response("<!doctype html><title>Vacía</title><main></main>", { status: 200, headers: { "content-type": "text/html" } }),
    maxBrowserFallbacks: 0,
    playwrightReader: async () => {
      browserCalls += 1;
      return { html: html("Vacía", "Texto que no debería leerse. ") };
    }
  }), { code: "empty_content" });
  assert.equal(browserCalls, 0);
});

test("source verification keeps only content matches and audits discarded URLs", async () => {
  const result = await verifyCandidateSources({
    candidates: [
      { id: "s1", title: "Memoria", url: "https://one.example/paper" },
      { id: "s2", title: "Otro tema", url: "https://two.example/article" }
    ],
    context: "El sueño contribuye a consolidar la memoria.",
    retrieveOptions: { resolveHost: publicDns, fetchImpl: async (url) => okPage(String(url).includes("one") ? "Memoria" : "Otro") },
    assessSources: async () => [
      { id: "s1", status: "verified", supportSummary: "Describe consolidación de memoria", locator: "Resultados" },
      { id: "s2", status: "rejected", reason: "content_mismatch" }
    ]
  });
  assert.deepEqual(result.verifiedSources.map((source) => source.id), ["s1"]);
  assert.equal(result.verifiedSources[0].verificationStatus, "verified");
  assert.equal(result.rejectedSources[0].reason, "content_mismatch");
  assert.equal("text" in result.verifiedSources[0], false);
});

test("independent-source mode accepts at most one page per domain", async () => {
  const result = await verifyCandidateSources({
    candidates: [
      { id: "s1", title: "Uno", url: "https://same.example/a" },
      { id: "s2", title: "Dos", url: "https://same.example/b" }
    ],
    context: "Tema",
    distinctDomains: true,
    retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => okPage() },
    assessSources: async ({ pages }) => pages.map((page) => ({ id: page.id, status: "verified", supportSummary: "Apoya", locator: "Texto" }))
  });
  assert.equal(result.verifiedSources.length, 1);
  assert.equal(result.rejectedSources.length, 1);
});

test("high-risk article claims remain blocked without two sources and one tier-1 source", async () => {
  let call = 0;
  const client = { models: { generateContent: async () => {
    call += 1;
    if (call === 1) return modelJson({ assessments: [
      { id: "s1", status: "verified", supportSummary: "Apoya", locator: "Resultados" },
      { id: "s2", status: "verified", supportSummary: "Apoya", locator: "Discusión" }
    ] });
    return modelJson({ claims: [{ id: "c1", text: "En 1950 ocurrió el descubrimiento.", risk: "high", status: "supported", sourceIds: ["s1"], supportSummary: "Una fuente", locator: "Historia" }], contradictions: [] });
  } } };
  const article = await verifyArticleEvidenceServer({
    article: { title: "Historia", blocks: [{ id: "b1", text: "En 1950 ocurrió el descubrimiento." }], researchSources: [
      { id: "s1", title: "Fuente uno", url: "https://one.example/paper", sourceType: "web" },
      { id: "s2", title: "Fuente dos", url: "https://two.example/article", sourceType: "web" }
    ] },
    topic: "Historia",
    dependencies: { client, retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => okPage() } }
  });
  assert.equal(article.articleClaims[0].status, "partially_supported");
  assert.equal(article.verification.status, "blocked");
});

test("article recheck assesses source relevance against the topic, then checks claims separately", async () => {
  const prompts = [];
  const client = { models: { generateContent: async (request) => {
    const prompt = request.contents[0].parts[0].text;
    prompts.push(prompt);
    if (prompt.includes("verificador documental estricto")) return modelJson({ assessments: [{ id: "s1", status: "verified", supportSummary: "Explica una estrategia de autorregulación", locator: "Resultados" }] });
    return modelJson({ claims: [{ id: "c1", blockId: "b1", text: "Una estrategia mejora la autorregulación.", evidenceKind: "external_fact", risk: "low", status: "supported", sourceIds: ["s1"], supportSummary: "Resultados", locator: "Resultados" }], contradictions: [] });
  } } };
  const article = await verifyArticleEvidenceServer({
    article: { title: "Autorregulación escolar", subtitle: "Estrategias educativas", blocks: [{ id: "b1", text: "Una estrategia mejora la autorregulación." }, { id: "b2", text: "Detalle exclusivo del segundo apartado." }], researchSources: [{ id: "s1", title: "Estudio sobre autorregulación", url: "https://one.example/paper", sourceType: "paper" }] },
    topic: "Autorregulación escolar",
    dependencies: { client, retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => okPage("Autorregulación", "Una estrategia mejora la autorregulación escolar. ") } }
  });
  assert.equal(article.verification.checkedUrls.length, 1);
  assert.equal(article.verification.status, "verified");
  assert.ok(prompts[0].includes("Autorregulación escolar. Estrategias educativas"));
  assert.ok(!prompts[0].includes("Detalle exclusivo del segundo apartado"));
  assert.ok(prompts[1].includes("Detalle exclusivo del segundo apartado"));
});

test("supplemental research queries scientific catalogs directly and keeps only relevant article records", async () => {
  const requests = [];
  const result = await searchScientificCatalogs({
    queries: ["self talk anxiety"],
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes("europepmc")) return new Response(JSON.stringify({ resultList: { result: [
        { title: "Compassionate self talk reduces anxiety", pmcid: "PMC123456", doi: "10.1234/example.1", firstPublicationDate: "2025-02-10", journalTitle: "Journal of Psychology" },
        { title: "Unrelated chemistry experiment", pmcid: "PMC999999", doi: "10.1234/example.2" }
      ] } }), { status: 200 });
      return new Response(JSON.stringify({ message: { items: [
        { type: "journal-article", title: ["Self talk and anxiety in adolescents"], DOI: "10.1234/example.3", published: { "date-parts": [[2024, 5, 2]] } }
      ] } }), { status: 200 });
    }
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(result.results.map((item) => item.status), ["searched", "searched"]);
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.some((source) => source.url === "https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/"));
  assert.ok(result.sources.every((source) => source.publishedAt));
});

test("article recheck uses URL context when a previously selected document rejects direct fetch", async () => {
  let contextReads = 0;
  const client = { models: { generateContent: async (request) => {
    if (request.config?.tools?.some((tool) => tool.urlContext)) {
      contextReads += 1;
      return { candidates: [{ finishReason: "STOP", urlContextMetadata: { urlMetadata: [{ urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS", retrievedUrl: "https://papers.example/study" }] }, content: { parts: [{ text: JSON.stringify({
        title: "Self talk and anxiety in schools", authors: ["Ana López"], publishedAt: "2025-03-01", publisher: "Journal of School Psychology",
        text: "La investigación describe el diálogo interno y la ansiedad en la escuela. ".repeat(12)
      }) }] } }] };
    }
    const prompt = request.contents[0].parts[0].text;
    if (prompt.includes("verificador documental estricto")) return modelJson({ assessments: [{ id: "s1", status: "verified", supportSummary: "Examina ansiedad escolar", locator: "Resultados" }] });
    return modelJson({ claims: [{ id: "c1", blockId: "b1", text: "El diálogo interno influye en la ansiedad escolar.", evidenceKind: "external_fact", risk: "low", status: "supported", sourceIds: ["s1"], locator: "Resultados" }], contradictions: [] });
  } } };
  const article = await verifyArticleEvidenceServer({
    article: { title: "Diálogo interno y ansiedad escolar", blocks: [{ id: "b1", text: "El diálogo interno influye en la ansiedad escolar." }], researchSources: [{ id: "s1", title: "Self talk and anxiety in schools", url: "https://papers.example/study", sourceType: "paper" }], researchDossier: { targetSourceCount: 1 } },
    topic: "Diálogo interno y ansiedad escolar",
    dependencies: { client, retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => new Response("Prohibido", { status: 403 }) } }
  });
  assert.equal(contextReads, 1);
  assert.equal(article.verification.checkedUrls.length, 1);
  assert.equal(article.verification.status, "verified");
});

test("video attribution is preserved but does not replace documentary corroboration", async () => {
  const client = { models: { generateContent: async () => modelJson({ claims: [{ id: "c-video", text: "La autora explica una estrategia.", evidenceKind: "video_attribution", risk: "low", status: "supported", sourceIds: ["youtube-dQw4w9WgXcQ"], supportSummary: "Atribución localizada", locator: "02:14" }], contradictions: [] }) } };
  const video = { id: "youtube-dQw4w9WgXcQ", sourceType: "youtube_video", title: "Estrategias", authors: ["Canal educativo"], url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", supportSummary: "La autora explica una estrategia.", locator: "02:14" };
  const article = await verifyArticleEvidenceServer({
    article: { title: "Estrategias", blocks: [{ id: "b1", text: "La autora explica una estrategia.", sourceIds: [video.id] }], sources: [video], researchSources: [video] },
    topic: "Estrategias",
    dependencies: { client }
  });
  assert.equal(article.sources[0].sourceType, "youtube_video");
  assert.equal(article.articleClaims[0].evidenceKind, "video_attribution");
  assert.equal(article.articleClaims[0].status, "supported");
  assert.equal(article.verification.status, "blocked");
  assert.match(article.verification.blockers.join(" "), /ninguna fuente verificable/i);
  assert.equal(article.verification.videoSources[0].verificationStatus, "attributed_only");
});

test("video blocks require attribution, timestamp, and short direct quotations", async () => {
  const client = { models: { generateContent: async () => modelJson({ claims: [{ id: "c-video", text: "Una explicación del video.", evidenceKind: "video_attribution", risk: "low", status: "supported", sourceIds: ["youtube-dQw4w9WgXcQ"], locator: "" }], contradictions: [] }) } };
  const video = { id: "youtube-dQw4w9WgXcQ", sourceType: "youtube_video", title: "Estrategias", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", supportSummary: "Una explicación." };
  const longQuote = Array.from({ length: 26 }, (_, index) => `palabra${index + 1}`).join(" ");
  const article = await verifyArticleEvidenceServer({
    article: { title: "Estrategias", blocks: [{ id: "q1", type: "quote", text: longQuote, sourceIds: [video.id] }], sources: [video], researchSources: [video] },
    topic: "Estrategias",
    dependencies: { client }
  });
  const blockers = article.verification.blockers.join(" ");
  assert.match(blockers, /marca de tiempo/i);
  assert.match(blockers, /supera 25 palabras/i);
  assert.match(blockers, /atribución explícita/i);
});

test("legacy trend snapshots are replaced by signal-based topics without source verification", async () => {
  const store = trendDb({ schemaVersion: 1, verificationStatus: "verified", opportunities: [{ topic: "Vieja" }] });
  let calls = 0;
  const client = { models: { generateContent: async () => {
    calls += 1;
    return modelJson({ opportunities: [{ topic: "Sueño", summary: "El sueño y la memoria", signals: ["Cambio"], momentum: "rising", freshness: "recent" }] });
  } } };
  const result = await refreshMarcieTrends({
    force: false,
    settingsOverride: { cadence: "daily", region: "MX" },
    dependencies: { db: store.db, client }
  });
  assert.equal(result.skipped, false);
  assert.equal(calls, 1);
  assert.equal(store.written().schemaVersion, 6);
  assert.equal(store.written().opportunities.length, 1);
  assert.equal(store.written().opportunities[0].verificationStatus, "signal_based");
  assert.deepEqual(store.written().opportunities[0].sources, []);
  assert.equal(store.written().verificationStatus, "signal_based");
  assert.equal(store.written().rejectedOpportunities.length, 0);
  assert.deepEqual(store.written().sourceAudit, []);
});

test("trend refresh returns multiple topics from one open Google Search pass", async () => {
  const store = trendDb();
  const client = { models: { generateContent: async () => modelJson({ opportunities: [
    { topic: "Sueño", summary: "El sueño y la memoria", signals: ["Cambio"], momentum: "rising", freshness: "recent" },
    { topic: "Atención digital", summary: "Nuevos debates", signals: ["Debate docente", "Conversación familiar"], momentum: "breakout", freshness: "immediate" }
  ] }) } };
  await refreshMarcieTrends({
    force: true,
    settingsOverride: { cadence: "weekly", region: "MX" },
    dependencies: { db: store.db, client }
  });
  assert.equal(store.written().opportunities.length, 2);
  assert.equal(store.written().opportunities[0].topic, "Atención digital");
  assert.equal(store.written().opportunities[0].rank, 1);
  assert.equal(store.written().opportunities.reduce((total, item) => total + item.trendingPercent, 0), 100);
  assert.equal(store.written().verificationStatus, "signal_based");
  assert.equal(store.written().pipelineStats.rankedTopicCount, 2);
});

test("trend ranking discovers a winner and distributes exactly 100 percent", () => {
  const ranked = rankTrendOpportunities([
    {
      topic: "Aprendizaje y sueño",
      signals: ["Señal 1", "Señal 2", "Señal 3", "Señal 4"],
      momentum: "breakout",
      freshness: "immediate"
    },
    {
      topic: "Otra tendencia",
      signals: ["Señal 1"],
      momentum: "steady",
      freshness: "monthly"
    }
  ]);
  assert.equal(ranked[0].topic, "Aprendizaje y sueño");
  assert.equal(ranked[0].rank, 1);
  assert.ok(ranked[0].trendingPercent > ranked[1].trendingPercent);
  assert.equal(ranked.reduce((total, item) => total + item.trendingPercent, 0), 100);
  assert.deepEqual(Object.keys(ranked[0].rankingFactors), ["momentum", "freshness", "signalStrength", "discoveryProminence"]);
  assert.deepEqual(ranked[0].sources, []);
});

test("trend search does not fetch or require source URLs", async () => {
  const store = trendDb();
  let fetchCalls = 0;
  const client = { models: { generateContent: async () => modelJson({ opportunities: [
    { topic: "Aprendizaje y sueño", summary: "Conversación emergente", signals: ["Más interés docente"], momentum: "emerging", freshness: "recent" },
    { topic: "Atención digital", summary: "Debate reciente", signals: ["Nuevas recomendaciones", "Conversación familiar"], momentum: "rising", freshness: "immediate" }
  ] }) } };
  await refreshMarcieTrends({
    force: true,
    settingsOverride: { cadence: "monthly", region: "Global" },
    dependencies: {
      db: store.db,
      client,
      retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => { fetchCalls += 1; return okPage(); } }
    }
  });
  const snapshot = store.written();
  assert.equal(snapshot.schemaVersion, 6);
  assert.equal(fetchCalls, 0);
  assert.equal(snapshot.opportunities.length, 2);
  assert.deepEqual(snapshot.opportunities.map((item) => item.verificationStatus), ["signal_based", "signal_based"]);
  assert.equal(snapshot.opportunities.reduce((total, item) => total + item.trendingPercent, 0), 100);
  assert.equal(snapshot.verificationStatus, "signal_based");
  assert.equal(snapshot.rejectedOpportunities.length, 0);
  assert.deepEqual(snapshot.rejectionStats, {});
});
