const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { researchArticleEvidenceServer } = require("../src/marcie-editorial-research.js");
const policy = require("../src/marcie-research-policy.js");
const json = value => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
const page = url => new Response(`<title>Estudio ${url}</title><meta name="citation_author" content="García, Ana"><meta name="citation_journal_title" content="Educación"><meta name="citation_publication_date" content="2020-01-01"><main>${"La investigación del aprendizaje aporta evidencia pertinente para la enseñanza. ".repeat(20)}</main>`, { headers: { "content-type": "text/html" } });
function dependencies(find) {
  const prompts = [], fetched = [];
  let searches = 0;
  return { prompts, fetched, now: new Date("2026-09-08"),
    client: { models: { generateContent: async request => {
      const prompt = request.contents[0].parts[0].text; prompts.push(prompt);
      if (prompt.includes("verificador documental estricto")) return json({ assessments: [...prompt.matchAll(/(?:^|\n)ID ([^\n]+)/g)].map(match => ({ id: match[1], status: "verified", supportSummary: "Evidencia del aprendizaje recuperada del documento.", locator: "Resultados" })) });
      if (prompt.includes("Extrae referencias atribuibles")) return json({ attributedReferences: [] });
      searches++;
      return json({ sources: find(searches), facts: [], currentSignals: [], historicalMilestones: [] });
    } } },
    retrieveOptions: { resolveHost: async () => [{ address: "93.184.216.34", family: 4 }], fetchImpl: async url => { fetched.push(url); return page(url); } }
  };
}
const candidates = (count, prefix = "paper") => Array.from({ length: count }, (_, i) => ({ id: prefix + i, title: "Estudio " + i, url: `https://scielo.org/${prefix}-${i}`, evidenceRole: "historical", sourceType: "paper" }));

test("research analyses every candidate, retains same-platform studies and recovered metadata", async () => {
  const deps = dependencies(() => candidates(10));
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", mode: "aida", minimumSources: 8, searchPlatforms: ["scielo"], dependencies: deps });
  assert.equal(dossier.sources.length, 10);
  assert.equal(deps.fetched.length, 10);
  assert.equal(dossier.sources[0].authors[0], "García, Ana");
  assert.equal(dossier.sources[0].journal, "Educación");
  assert.equal(dossier.analysisStatus, "complete");
  assert.equal(dossier.verificationStatus, "verified");
  assert.equal(dossier.historicalSourceCount, 10);
  assert.equal(dossier.facts.length, 10, "each analysed document contributes its checked findings");
});

test("insufficient research broadens queries only inside the selected platforms", async () => {
  const deps = dependencies(round => candidates(round === 1 ? 1 : 8));
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 8, searchPlatforms: ["scielo"], researchInstructions: ["#fuentes Libros de autores reconocidos"], dependencies: deps });
  assert.equal(dossier.sources.length, 8);
  assert.equal(dossier.verificationStatus, "verified");
  assert.equal(dossier.telemetry.searches, 2);
  assert.ok(deps.prompts.some(prompt => prompt.includes("Libros de autores reconocidos")));
  assert.ok(dossier.platformResults.every(result => result.id === "scielo"));
});

test("unanalyzed one-source dossiers cannot draft or bypass research through the cache", async () => {
  let drafts = 0, searches = 0;
  const dossier = { sources: [{ id: "s1", title: "Paper", url: "https://example.org/paper", verificationStatus: "verified" }], targetSourceCount: 8, verificationStatus: "blocked" };
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [], console,
    researchArticleEvidence: async () => { searches++; return dossier; },
    draftArticleWithGemini: async () => { drafts++; return { blocks: [] }; }
  });
  const code = fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8").replace(/^import[\s\S]*?;\s*$/gm, "").replace(/\bexport /g, "");
  vm.runInContext(code, context);
  const session = { id: "s", topic: "Aprendizaje", audience: "educators", editorialProfileSnapshot: { minimumSources: 8 }, researchByAudience: {} };
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(context.draftArticleForMode({ session, topic: session.topic }), /investigación|fuentes/i);
  assert.equal(drafts, 0);
  assert.equal(searches, 2);
});

test("a fully analysed dossier may draft below its aspirational source target", () => {
  const sources = candidates(6).map(source => ({ ...source, verificationStatus: "verified" }));
  const dossier = {
    sources,
    targetSourceCount: 8,
    analysisStatus: "complete",
    analysis: { sourceIds: sources.map(source => source.id) },
    verificationStatus: "blocked",
    blockers: ["La investigación tiene 6 de 8 fuentes verificadas requeridas tras 3 rondas."]
  };
  const state = policy.readiness(dossier);
  assert.equal(state.ready, true);
  assert.equal(state.count, 6);
  assert.equal(state.target, 8);
});

test("a source count does not bypass missing document analysis or explicit blockers", () => {
  const sources = candidates(8).map(source => ({ ...source, verificationStatus: "verified" }));
  assert.equal(policy.readiness({ sources, targetSourceCount: 8, verificationStatus: "verified" }).ready, false);
  const dossier = { sources, targetSourceCount: 8, analysisStatus: "complete", analysis: { sourceIds: sources.map(source => source.id) }, verificationStatus: "verified" };
  assert.equal(policy.readiness(dossier).ready, true);
  assert.equal(policy.readiness({ ...dossier, verificationStatus: "blocked", blockers: ["Análisis pendiente"] }).ready, false);
});

test("research receives source preferences, profile policy, platform choices and exact target", async () => {
  const requests = [];
  const context = vm.createContext({ MarcieResearchPolicy: policy,
    listMarciePromptProfiles: () => [{ id: "editor", prompts: { source_research_policy: "Contrasta revisiones y libros identificables" } }],
    researchArticleEvidence: async request => { requests.push(request); return {}; },
    researchAidaTopicWithGemini: async request => { requests.push(request); return {}; }
  });
  const source = fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8");
  assert.match(source, /import\s*\{[^}]*\bresearchArticleEvidence\b[^}]*\}\s*from\s*"\.\/marcie-gemini-service/s);
  vm.runInContext(source.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/\bexport /g, ""), context);
  for (const editorialMode of ["marcie", "aida", "custom"]) {
    await context.researchTopicForMode({ session: { editorialMode, specifications: ["#fuentes Libros", "#extension 3000 palabras"], editorialProfileSnapshot: { minimumSources: 20, sourceTypes: ["academic"] }, sessionConfiguration: { promptProfileId: "editor", searchPlatforms: ["scielo"] } }, topic: "Tema exacto", region: "GLOBAL", period: "12m" });
  }
  for (const request of requests) {
    assert.equal(request.minimumSources, 20);
    assert.equal(request.topic, "Tema exacto");
    assert.equal(request.region, "GLOBAL");
    assert.equal(request.period, "12m");
    assert.deepEqual(Array.from(request.searchPlatforms), ["scielo"]);
    assert.deepEqual(Array.from(request.researchInstructions), ["#fuentes Libros", "Tipo de fuente preferido: academic", "Contrasta revisiones y libros identificables"]);
  }
});

test("an assessment batch failure preserves successfully analysed batches", async () => {
  const { verifyCandidateSources } = require("../src/marcie-source-verifier.js");
  const result = await verifyCandidateSources({ candidates: candidates(9), maxCandidates: 32, allowHistorical: true,
    retrieveOptions: dependencies(() => []).retrieveOptions,
    assessSources: async ({ pages }) => {
      if (pages.length === 8) throw Error("Temporary model failure");
      return pages.map(page => ({ id: page.id, status: "verified", supportSummary: "Hallazgo comprobado" }));
    }
  });
  assert.equal(result.verifiedSources.length, 1);
  assert.equal(result.rejectedSources.filter(source => source.reason === "verification_error").length, 8);
});

test("Aida uses every analysed source in its draft context without a second search", async () => {
  const sources = candidates(20).map(source => ({ ...source, verificationStatus: "verified", supportSummary: "Evidencia comprobada. ".repeat(100) }));
  const dossier = { sources, targetSourceCount: 20, analysisStatus: "complete", analysis: { sourceIds: sources.map(source => source.id) }, verificationStatus: "verified" };
  let generation;
  const context = vm.createContext({ MarcieResearchPolicy: policy,
    sanitizeTrustedSources: sources => sources || [],
    applyVerifiedAttributions: article => article,
    generateGroundedJson: async request => { generation = request; return { parsed: { title: "Article", blocks: [] } }; }
  });
  const code = fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-aida-service.js"), "utf8").replace(/^import[\s\S]*?;\s*$/gm, "").replace(/\bexport /g, "");
  vm.runInContext(code, context);
  const article = await context.draftAidaArticleWithGemini({ topic: "Aprendizaje", researchDossier: dossier, customRules: { minimumSources: 20 } });
  assert.ok(generation.prompt.includes("paper-19"));
  assert.ok(generation.prompt.length > 22000);
  assert.equal(generation.useResearchTools, false);
  assert.equal(article.sources.length, 20);
  assert.equal(article.researchDossier.targetSourceCount, 20);
});
