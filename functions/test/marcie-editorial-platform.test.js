const test = require("node:test");
const assert = require("node:assert/strict");
const { evidenceBlockers, articleContentHash } = require("../src/marcie-wordpress.js");
const { WordPressClient, buildWordPressPostPayload } = require("../src/marcie-wordpress-core.js");
const { periodKey } = require("../src/marcie-trend-refresh.js");

function jsonResponse(data) {
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => data, text: async () => JSON.stringify(data) };
}

const verifiedArticle = {
  title: "Cómo aprende el cerebro",
  subtitle: "Evidencia y práctica",
  blocks: [{ id: "b1", type: "paragraph", text: "Dormir contribuye a consolidar la memoria." }],
  researchSources: [{ id: "s1", title: "Estudio", url: "https://example.edu/paper", qualityTier: 1, verificationStatus: "verified" }],
  articleClaims: [{ id: "c1", text: "Dormir contribuye a consolidar la memoria.", status: "supported", sourceIds: ["s1"] }],
  verification: { status: "verified", coverage: 100, contradictions: [] },
  seo: { title: "Cerebro y memoria", description: "Cómo el sueño interviene en la memoria.", slug: "cerebro-memoria", keywords: ["memoria"] }
};

test("evidence gate blocks incomplete and contradicted articles", () => {
  assert.deepEqual(evidenceBlockers(verifiedArticle), []);
  assert.ok(evidenceBlockers({ ...verifiedArticle, researchSources: [{ ...verifiedArticle.researchSources[0], verificationStatus: "legacy_unverified" }] }).includes("unverified_sources"));
  assert.ok(evidenceBlockers({ ...verifiedArticle, articleClaims: [{ status: "unsupported" }] }).includes("unsupported_claims"));
  assert.ok(evidenceBlockers({ ...verifiedArticle, verification: { status: "verified", coverage: 100, contradictions: ["conflicto"] } }).includes("contradictions_pending"));
});

test("Aida publication gate requires its eight phases, three verified sources and three institutions", () => {
  const phases = ["problem", "deepen", "agitate", "turn", "why", "change", "close"];
  const aidaArticle = {
    ...verifiedArticle,
    editorialMode: "aida",
    modeCompatibility: "compatible",
    blocks: phases.map((phase, index) => ({ id: `aida-${phase}`, type: "paragraph", phase, text: phase === "close" ? "Cierre. Frase de marca." : `Contenido ${index + 1}` })),
    aida: { phases: ["headline", ...phases], brandLine: "Frase de marca." },
    aidaCompliance: { status: "verified" },
    researchSources: Array.from({ length: 8 }, (_, index) => ({
      id: `s${index + 1}`,
      title: `Fuente ${index + 1}`,
      url: `https://source-${index + 1}.example.edu/paper`,
      domain: `source-${index + 1}.example.edu`,
      publisher: `Institución ${(index % 4) + 1}`,
      qualityTier: 1,
      verificationStatus: "verified"
    })),
    articleClaims: [{ id: "c1", text: "Afirmación respaldada", status: "supported", sourceIds: ["s1"] }],
    verification: { status: "verified", coverage: 100, contradictions: [] }
  };
  assert.deepEqual(evidenceBlockers(aidaArticle, { editorialMode: "aida" }), []);
  assert.ok(evidenceBlockers({ ...aidaArticle, researchSources: aidaArticle.researchSources.slice(0, 2) }, { editorialMode: "aida" }).includes("aida_insufficient_verified_sources"));
  assert.ok(evidenceBlockers({ ...aidaArticle, researchSources: aidaArticle.researchSources.map((source) => ({ ...source, publisher: "Una institución" })) }, { editorialMode: "aida" }).includes("aida_insufficient_institutions"));
  assert.ok(evidenceBlockers({ ...aidaArticle, blocks: aidaArticle.blocks.filter((block) => block.phase !== "turn") }, { editorialMode: "aida" }).includes("aida_structure_incompatible"));
  assert.ok(evidenceBlockers({ ...aidaArticle, blocks: [...aidaArticle.blocks].reverse() }, { editorialMode: "aida" }).includes("aida_structure_incompatible"));
});

test("material title, body, sources and SEO changes produce a new content fingerprint", () => {
  const initial = articleContentHash(verifiedArticle);
  assert.notEqual(articleContentHash({ ...verifiedArticle, title: "Título cambiado" }), initial);
  assert.notEqual(articleContentHash({ ...verifiedArticle, seo: { ...verifiedArticle.seo, slug: "otro-slug" } }), initial);
});

test("WordPress payload uses the article SEO contract", () => {
  const payload = buildWordPressPostPayload({ article: verifiedArticle, sessionId: "s1", audience: "coordinators" });
  assert.equal(payload.title, verifiedArticle.seo.title);
  assert.equal(payload.excerpt, verifiedArticle.seo.description);
  assert.equal(payload.slug, verifiedArticle.seo.slug);
});

test("WordPress scheduling, cancellation and reconciliation target one remote post", async () => {
  const calls = [];
  const client = new WordPressClient({
    config: { configured: true, baseUrl: "https://example.com", username: "editor", applicationPassword: "secret", allowInsecureLocal: false },
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), json: options.body ? JSON.parse(options.body) : null });
      return jsonResponse({ id: 44, status: calls.length === 1 ? "future" : calls.length === 2 ? "draft" : "publish", slug: "cerebro-memoria", link: "https://example.com/cerebro-memoria" });
    }
  });
  assert.equal((await client.schedulePost(44, { payload: { title: "SEO" }, date: "2026-09-01T10:00:00", dateGmt: "2026-09-01T15:00:00" })).status, "future");
  assert.equal((await client.cancelScheduledPost(44)).status, "draft");
  assert.equal((await client.getPost(44)).status, "publish");
  assert.ok(calls.every((call) => call.url.includes("/posts/44")));
  assert.equal(calls[0].json.status, "future");
});

test("trend refresh keys are idempotent for daily, weekly and monthly cadences", () => {
  const date = new Date("2026-08-24T12:00:00Z");
  assert.equal(periodKey("daily", date), "2026-08-24");
  assert.match(periodKey("weekly", date), /^2026-W\d{2}$/);
  assert.equal(periodKey("monthly", date), "2026-08");
});
