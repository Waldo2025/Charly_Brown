const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractPageContent,
  extractBibliographicMetadata,
  formatApaCitation,
  retrieveSourcePage,
  verifyCandidateSources
} = require("../src/marcie-source-verifier.js");
const { extractAttributedReferences, generateJson, parseJsonResponse, rankTrendOpportunities, refreshMarcieTrends, researchDateWindow, verifyArticleEvidenceServer } = require("../src/marcie-editorial-research.js");

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];
const html = (title, text) => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${text.repeat(8)}</p></main></body></html>`;
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

test("bibliographic metadata produces APA 7 without inventing missing fields", () => {
  const metadata = extractBibliographicMetadata(`<script type="application/ld+json">{"@type":"ScholarlyArticle","author":[{"name":"María Pérez"}],"publisher":{"name":"Revista Educación"},"identifier":"https://doi.org/10.1234/abc.5"}</script>`);
  assert.deepEqual(metadata.authors, ["María Pérez"]);
  assert.equal(metadata.publisher, "Revista Educación");
  assert.equal(metadata.doi, "10.1234/abc.5");
  assert.equal(formatApaCitation({ authors: metadata.authors, publishedAt: "2026-08-10", title: "Aprendizaje y memoria", publisher: metadata.publisher, doi: metadata.doi }), "María Pérez (10 de agosto de 2026). Aprendizaje y memoria. Revista Educación. https://doi.org/10.1234/abc.5");
  assert.equal(formatApaCitation({ authors: [], title: "Guía docente", publisher: "UNESCO", url: "https://unesco.example/guia" }), "UNESCO (s. f.). Guía docente. https://unesco.example/guia");
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
