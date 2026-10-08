const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { researchArticleEvidenceServer } = require("./research-fixture.cjs");
const policy = require("../src/marcie-research-policy.js");
const loadServiceSource = (source) => source.replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, "").replace(/^import[\s\S]*?;\s*$/gm, "").replace(/\bexport /g, "");
const json = value => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
const page = url => new Response(`<title>Estudio ${url}</title><meta name="citation_author" content="García, Ana"><meta name="citation_journal_title" content="Educación"><meta name="citation_publication_date" content="2020-01-01"><main>${"La investigación del aprendizaje aporta evidencia pertinente para la enseñanza. ".repeat(20)}</main>`, { headers: { "content-type": "text/html" } });
function dependencies(find) {
  const prompts = [], fetched = [];
  let searches = 0;
  return { prompts, fetched, now: new Date("2026-09-08"),
    client: { researchSearch: async () => ({ sources: find(searches + 1), results: [] }), models: { generateContent: async request => {
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

test("two audiences use one global search, one selection and no audience research during drafts", async () => {
  let globalCalls = 0;
  let individualCalls = 0;
  let drafts = 0;
  const source = { id: "global-1", title: "Documento", url: "https://scielo.org/documento", verificationStatus: "verified", supportSummary: "Hallazgo comprobado" };
  const sources = [source, ...Array.from({ length: 5 }, (_, index) => ({ id: `global-${index + 2}`, url: `https://scielo.org/documento-${index + 2}`, verificationStatus: "verified" }))];
  const dossier = { sources, facts: [], analysisStatus: "complete", analysis: { sourceIds: sources.map((item) => item.id) }, dateSearchComplete: true, verificationStatus: "verified" };
  const audienceDossier = (specific) => ({ ...dossier, sources: [...sources.slice(0, 2), ...sources.slice(specific, specific + 2)],
    analysis: { sourceIds: [...sources.slice(0, 2), ...sources.slice(specific, specific + 2)].map((item) => item.id) },
    sharedSourceIds: sources.slice(0, 2).map((item) => item.id), specificSourceIds: sources.slice(specific, specific + 2).map((item) => item.id), targetSourceCount: 4 });
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {}, console,
    researchArticleEvidence: async () => { individualCalls++; throw new Error("búsqueda duplicada"); },
    researchArticleEvidenceBundle: async () => {
      globalCalls++;
      return { globalDossier: dossier, byAudience: { parents: audienceDossier(2), educators: audienceDossier(4) } };
    },
    draftArticleWithGemini: async ({ audience, researchDossier }) => {
      drafts++;
      assert.equal(researchDossier.sources[0].id, source.id);
      return { title: audience, blocks: [], sources: researchDossier.sources };
    } });
  vm.runInContext(loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8")), context);
  const session = { id: "shared", topic: "Aprendizaje", selectedAudiences: ["parents", "educators"],
    proposals: [{ audience: "parents", title: "Familias", brief: "En casa" }, { audience: "educators", title: "Docentes", brief: "En el aula" }], researchByAudience: {} };
  await context.generateProposalsForMode({ session, topic: session.topic, reuseProposals: true });
  await context.draftArticleForMode({ session, audience: "parents", title: "Familias", topic: session.topic });
  await context.draftArticleForMode({ session, audience: "educators", title: "Docentes", topic: session.topic });
  assert.equal(globalCalls, 1);
  assert.equal(individualCalls, 0);
  assert.equal(drafts, 2);
});

test("partial global evidence continues and then searches only the audience still missing specific sources", async () => {
  const all = Array.from({ length: 6 }, (_, index) => ({ id: `global-${index + 1}`, url: `https://scielo.org/global-${index + 1}`, verificationStatus: "verified", year: "2020" }));
  const makeDossier = (sources, sharedIds = [], specificIds = []) => ({ sources, facts: [], analysisStatus: "complete",
    analysis: { sourceIds: sources.map((source) => source.id) }, verificationStatus: "verified", dateSearchComplete: true,
    sharedSourceIds: sharedIds, specificSourceIds: specificIds, sharedSourceTarget: 2, specificSourceTarget: 2, targetSourceCount: 4 });
  const calls = [];
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {}, console,
    researchArticleEvidenceBundle: async ({ existingGlobalDossier }) => {
      const globalDossier = existingGlobalDossier || makeDossier(all.slice(0, 3));
      const shared = all.slice(0, 2).map((source) => source.id);
      return { globalDossier, byAudience: {
        parents: makeDossier(globalDossier.sources.slice(0, 4), shared, globalDossier.sources.slice(2, 4).map((source) => source.id)),
        educators: makeDossier(globalDossier.sources.slice(0, 2), shared, [])
      } };
    },
    researchArticleEvidence: async ({ globalResearch, audience }) => {
      calls.push({ globalResearch, audience });
      return globalResearch ? makeDossier(all.slice(3)) : makeDossier([
        { id: "educator-1", url: "https://scielo.org/educator-1", verificationStatus: "verified", year: "2021" },
        { id: "educator-2", url: "https://scielo.org/educator-2", verificationStatus: "verified", year: "2022" }
      ]);
    } });
  vm.runInContext(loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8")), context);
  const session = { id: "partial-global", topic: "Aprendizaje", selectedAudiences: ["parents", "educators"],
    proposals: [{ audience: "parents", title: "Familias", brief: "En casa" }, { audience: "educators", title: "Docentes", brief: "En el aula" }], researchByAudience: {} };
  await context.generateProposalsForMode({ session, topic: session.topic, reuseProposals: true, researchContinuations: 1 });
  assert.deepEqual(calls.map((call) => `${call.globalResearch ? "global" : "specific"}:${call.audience}`), ["global:parents, educators", "specific:educators"]);
  assert.equal(policy.readiness(session.researchByAudience.parents, 4).ready, true);
  assert.equal(policy.readiness(session.researchByAudience.educators, 4).ready, true);
  assert.deepEqual(Array.from(session.researchByAudience.educators.sharedSourceIds), ["global-1", "global-2"]);
  assert.deepEqual(Array.from(session.researchByAudience.educators.specificSourceIds), ["educator-1", "educator-2"]);
  assert.equal(session.researchByAudience.educators.sources.some((source) => source.id === "global-3"), false);
});

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

test("research skips portal homepages before retrieval and continues with document URLs", async () => {
  const deps = dependencies(() => [{ id: "portal", title: "SciELO", url: "https://scielo.org/" }, ...candidates(4)]);
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 4, searchPlatforms: ["scielo"], dependencies: deps });
  assert.equal(dossier.verifiedSourceCount, 4);
  assert.equal(deps.fetched.length, 4);
  assert.ok(dossier.rejectedSources.some((source) => source.reason === "generic_homepage" && source.url === "https://scielo.org/"));
});

test("open scientific catalog records enter the normal document verifier", async () => {
  const deps = dependencies(() => []);
  deps.searchScientificCatalogs = async () => ({
    sources: Array.from({ length: 4 }, (_, index) => ({
      title: `Estudio científico ${index + 1}`, url: `https://pmc.ncbi.nlm.nih.gov/articles/PMC${1000 + index}/`,
      sourceType: "paper", evidenceRole: "historical", discoveredVia: ["supplemental", "europe_pmc"]
    })),
    results: [{ id: "europe_pmc", query: "aprendizaje", status: "searched", candidateCount: 4 }]
  });
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 4, searchPlatforms: ["supplemental"], dependencies: deps });
  assert.equal(dossier.verifiedSourceCount, 4);
  assert.equal(deps.fetched.length, 4);
  assert.ok(dossier.platformResults.some((result) => result.id === "europe_pmc" && result.discoveryMethod === "catalog_api"));
  assert.ok(dossier.sources.every((source) => source.verificationStatus === "verified"));
});

test("research keeps undated evidence in reserve and prefers newly found dated documents", async () => {
  let searches = 0;
  const client = { models: { generateContent: async () => json({ sources: candidates(4, ++searches === 1 ? "undated" : "dated") }) } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 4, searchPlatforms: ["scielo"],
    dependencies: { client, verifyCandidateSources: async ({ candidates: found }) => ({
      verifiedSources: found.map((source) => ({ ...source, year: source.url.includes("dated-") && !source.url.includes("undated-") ? "2020" : "", verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical" })),
      rejectedSources: [], retrievedPages: []
    }) } });
  assert.equal(searches, 2);
  assert.equal(dossier.sources.length, 8);
  assert.equal(dossier.datedSourceCount, 4);
  assert.equal(dossier.dateSearchComplete, true);
  assert.ok(dossier.sources.slice(0, 4).every((source) => source.year === "2020"));
  assert.equal(policy.readiness(dossier, 4).ready, true);
});

test("a pending candidate does not stop discovery on the other selected platforms", async () => {
  let discoveries = 0;
  const client = { models: { generateContent: async () => json({
    sources: ++discoveries === 1 ? candidates(1, "pending") : discoveries === 3 ? candidates(4, "dated") : []
  }) } };
  const dossier = await researchArticleEvidenceServer({
    topic: "Autorregulación verbal", minimumSources: 4, searchPlatforms: ["supplemental", "scielo"],
    timeBudgetMs: 180_000,
    dependencies: { client, verifyCandidateSources: async ({ candidates: found }) => ({
      verifiedSources: found.filter((source) => source.url.includes("dated-")).map((source) => ({
        ...source, year: "2020", verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical"
      })),
      rejectedSources: found.filter((source) => source.url.includes("pending-")).map((source) => ({ id: source.id, reason: "verification_error" })),
      retrievedPages: []
    }) }
  });
  assert.ok(dossier.platformResults.some((platform) => platform.id === "scielo" && platform.status === "searched"));
  assert.equal(dossier.verifiedSourceCount, 4);
  assert.equal(dossier.pendingCandidates.length, 1);
  assert.equal(dossier.dateSearchComplete, true);
});

test("research uses verified undated historical sources after dated searches are exhausted", async () => {
  let searches = 0;
  const client = { models: { generateContent: async () => json({ sources: ++searches === 1 ? candidates(4, "undated") : [] }) } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 4, searchPlatforms: ["scielo"],
    dependencies: { client, verifyCandidateSources: async ({ candidates: found }) => ({
      verifiedSources: found.map((source) => ({ ...source, year: "", verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical" })),
      rejectedSources: [], retrievedPages: []
    }) } });
  assert.equal(searches, policy.searchBudget.maxRounds + 1);
  assert.equal(dossier.datedSourceCount, 0);
  assert.equal(dossier.dateSearchComplete, true);
  assert.equal(policy.readiness(dossier, 4).ready, true);
});

test("a budget cutoff keeps undated sources pending until dated alternatives are searched on resume", async () => {
  let now = 0;
  let searches = 0;
  const client = { models: { generateContent: async () => json({ sources: candidates(4, ++searches === 1 ? "undated" : "dated") }) } };
  const options = { topic: "Aprendizaje", minimumSources: 4, searchPlatforms: ["scielo"], timeBudgetMs: 1,
    dependencies: { client, clock: () => now, verifyCandidateSources: async ({ candidates: found }) => {
      now = 2;
      return { verifiedSources: found.map((source) => ({ ...source, year: source.url.includes("undated-") ? "" : "2020", verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical" })), rejectedSources: [], retrievedPages: [] };
    } } };
  const first = await researchArticleEvidenceServer(options);
  assert.equal(first.sources.length, 4);
  assert.equal(first.dateSearchComplete, false);
  assert.equal(policy.readiness(first, 4).ready, false);
  now = 0;
  const resumed = await researchArticleEvidenceServer({ ...options, excludeUrls: first.sources.map((source) => source.url) });
  assert.equal(searches, 2);
  assert.equal(resumed.datedSourceCount, 4);
  assert.equal(resumed.dateSearchComplete, true);
});

test("failed follow-up searches do not prematurely release undated fallbacks", async () => {
  let searches = 0;
  const client = { models: { generateContent: async () => {
    if (++searches === 1) return json({ sources: candidates(4, "undated") });
    throw Object.assign(new Error("upstream failure"), { status: 400 });
  } } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 4, searchPlatforms: ["scielo"],
    dependencies: { client, verifyCandidateSources: async ({ candidates: found }) => ({
      verifiedSources: found.map((source) => ({ ...source, verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical" })),
      rejectedSources: [], retrievedPages: []
    }) } });
  assert.equal(dossier.sources.length, 4);
  assert.equal(dossier.dateSearchComplete, false);
  assert.equal(policy.readiness(dossier, 4).ready, false);
  assert.ok(dossier.platformResults.some((platform) => platform.status === "error"));
});

test("research returns verified partial work before its time budget expires", async () => {
  let now = 0;
  const client = { models: { generateContent: async () => json({ sources: candidates(1), facts: [], currentSignals: [], historicalMilestones: [] }) } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 6, searchPlatforms: ["scielo"], timeBudgetMs: 1,
    dependencies: { client, clock: () => now, verifyCandidateSources: async ({ candidates: found }) => {
      now = 2;
      return { verifiedSources: found.map((source) => ({ ...source, year: "2020", verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical" })), rejectedSources: [], retrievedPages: [] };
    } } });
  assert.equal(dossier.sources.length, 1);
  assert.equal(dossier.telemetry.searches, 1);
  assert.equal(dossier.verificationStatus, "blocked");
  assert.equal(dossier.telemetry.durationMs, 2);
});

test("bounded research visits open repositories first and rotates platforms on resume", async () => {
  let now = 0;
  const prompts = [];
  const client = { models: { generateContent: async (request) => {
    prompts.push(request.contents[0].parts[0].text);
    return json({ sources: candidates(1), facts: [], currentSignals: [], historicalMilestones: [] });
  } } };
  const options = { topic: "Aprendizaje", minimumSources: 6, searchPlatforms: ["ebsco", "scielo", "supplemental"], timeBudgetMs: 1,
    dependencies: { client, clock: () => now, verifyCandidateSources: async ({ candidates: found }) => {
      now = 2;
      return { verifiedSources: found.map((source) => ({ ...source, verificationStatus: "verified", supportSummary: "Hallazgo", evidenceRole: "historical" })), rejectedSources: [], retrievedPages: [] };
    } } };
  const first = await researchArticleEvidenceServer(options);
  assert.match(prompts[0], /Busca también fuera/);
  assert.equal(first.nextPlatformOffset, 1);
  now = 0;
  prompts.length = 0;
  await researchArticleEvidenceServer({ ...options, startPlatformOffset: first.nextPlatformOffset });
  assert.match(prompts[0], /site:scielo\.org/);
});

test("discovered candidates survive a budget cutoff and are verified before another search", async () => {
  let now = 0;
  let searches = 0;
  let verifiedBatches = 0;
  const client = { models: { generateContent: async () => {
    searches++;
    now = 2;
    return json({ sources: candidates(7), facts: [], currentSignals: [], historicalMilestones: [] });
  } } };
  const dependencies = { client, clock: () => now, verifyCandidateSources: async ({ candidates: found }) => {
    verifiedBatches++;
      return { verifiedSources: found.map((source) => ({ ...source, year: "2020", verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical" })), rejectedSources: [], retrievedPages: [] };
  } };
  const options = { topic: "Aprendizaje", minimumSources: 6, searchPlatforms: ["scielo"], timeBudgetMs: 1, dependencies };
  const first = await researchArticleEvidenceServer(options);
  assert.equal(first.sources.length, 0);
  assert.equal(first.pendingCandidates.length, 7);
  assert.equal(verifiedBatches, 0);
  const searchesBeforeResume = searches;
  now = 0;
  const resumed = await researchArticleEvidenceServer({ ...options, pendingCandidates: first.pendingCandidates });
  assert.equal(searches, searchesBeforeResume);
  assert.equal(resumed.sources.length, 7);
  assert.equal(resumed.pendingCandidates.length, 0);
  assert.equal(resumed.verificationStatus, "verified");
});

test("a budget cutoff retains more than sixteen pending documents", async () => {
  let now = 0;
  const client = { models: { generateContent: async () => {
    now = 2;
    return json({ sources: candidates(40), facts: [], currentSignals: [], historicalMilestones: [] });
  } } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 6,
    searchPlatforms: ["scielo"], timeBudgetMs: 1,
    dependencies: { client, clock: () => now, verifyCandidateSources: async () => { throw new Error("No debe verificar después del corte"); } } });
  assert.equal(dossier.pendingCandidates.length, 40);
});

test("a provider 429 tries the bounded model fallback chain and marks the dossier as quota-limited", async () => {
  let calls = 0;
  const client = { models: { generateContent: async () => {
    calls++;
    throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
  } } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 6,
    searchPlatforms: ["scielo", "redalyc", "supplemental"], timeBudgetMs: 150_000, dependencies: { client } });
  assert.equal(calls, 9); // Three concurrent platforms, each with the bounded three-model fallback.
  assert.equal(dossier.quotaLimited, true);
  assert.match(dossier.blockers.join(" "), /cuota/i);
});

test("transient assessment failures remain pending instead of triggering another search", async () => {
  let searches = 0;
  const client = { models: { generateContent: async () => {
    searches++;
    return json({ sources: candidates(2), facts: [], currentSignals: [], historicalMilestones: [] });
  } } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 6,
    searchPlatforms: ["scielo", "redalyc"], timeBudgetMs: 150_000,
    dependencies: { client, verifyCandidateSources: async ({ candidates: found }) => ({ verifiedSources: [],
      rejectedSources: found.map((source) => ({ id: source.id, reason: "verification_error", httpStatus: 200 })), retrievedPages: [], quotaLimited: true }) } });
  assert.equal(searches, 2);
  assert.equal(dossier.pendingCandidates.length, 2);
  assert.equal(dossier.quotaLimited, true);
});

test("a repeatedly unverifiable candidate does not block discovery on resume", async () => {
  let searches = 0;
  const blocked = { ...candidates(1, "blocked")[0], verificationAttempts: 1 };
  const client = { models: { generateContent: async () => {
    searches++;
    return json({ sources: candidates(6, "fresh"), facts: [], currentSignals: [], historicalMilestones: [] });
  } } };
  const dossier = await researchArticleEvidenceServer({ topic: "Aprendizaje", minimumSources: 6,
    searchPlatforms: ["scielo"], timeBudgetMs: 150_000, pendingCandidates: [blocked],
    dependencies: { client, verifyCandidateSources: async ({ candidates: found }) => ({
      verifiedSources: found.filter((source) => source.id !== blocked.id).map((source) => ({ ...source, year: "2020", verificationStatus: "verified", supportSummary: "Hallazgo comprobado", evidenceRole: "historical" })),
      rejectedSources: found.filter((source) => source.id === blocked.id).map((source) => ({ id: source.id, reason: "verification_error", httpStatus: 200 })),
      retrievedPages: [], quotaLimited: false
    }) } });
  assert.equal(searches, 1);
  assert.equal(dossier.verifiedSourceCount, 6);
  assert.equal(dossier.pendingCandidates.length, 0);
});

test("proposal research preserves partial sources and propagates a server timeout", async () => {
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {},
    researchArticleEvidence: async () => { throw Object.assign(new Error("Investigación agotada"), { status: 503, code: "marcie_research_timeout", requestId: "req-1" }); },
    console });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const partial = { sources: [{ id: "s1", url: "https://scielo.org/one", verificationStatus: "verified" }], analysisStatus: "complete", analysis: { sourceIds: ["s1"] }, verificationStatus: "blocked" };
  const session = { id: "s", topic: "Aprendizaje", selectedAudiences: ["parents"], proposals: [{ audience: "parents", title: "Aprendizaje en casa", brief: "Guía" }], researchByAudience: { parents: partial } };
  await assert.rejects(context.generateProposalsForMode({ session, topic: session.topic, reuseProposals: true }), (error) => error.status === 503 && error.code === "marcie_research_timeout" && error.requestId === "req-1");
  assert.equal(session.researchByAudience.parents.sources.length, 1);
});

test("resuming proposal research excludes checked URLs and combines only the missing sources", async () => {
  const requests = [];
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {},
    researchArticleEvidence: async (request) => {
      requests.push(request);
      const sources = Array.from({ length: 5 }, (_, index) => ({ id: `new-${index}`, url: `https://scielo.org/new-${index}`, verificationStatus: "verified" }));
      return { sources, facts: [], analysisStatus: "complete", analysis: { sourceIds: sources.map((source) => source.id) }, targetSourceCount: 6, verificationStatus: "blocked", blockers: ["Se verificaron 5 de 6 fuentes requeridas."] };
    }, console });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const existing = { id: "old", url: "https://scielo.org/old", verificationStatus: "verified" };
  const session = { id: "s", topic: "Aprendizaje", selectedAudiences: ["parents"], proposals: [{ audience: "parents", title: "Aprendizaje en casa", brief: "Guía" }], researchByAudience: { parents: { sources: [existing], rejectedSources: [
    { url: "https://scielo.org/missing", reason: "not_found", httpStatus: 404 },
    { url: "https://scielo.org/temporary", reason: "verification_error", httpStatus: 200 }
  ], analysisStatus: "complete", analysis: { sourceIds: ["old"] }, verificationStatus: "blocked" } } };
  await context.generateProposalsForMode({ session, topic: session.topic, reuseProposals: true });
  assert.deepEqual(Array.from(requests[0].excludeUrls), [existing.url, "https://scielo.org/missing"]);
  assert.equal(session.researchByAudience.parents.sources.length, 6);
  assert.equal(session.researchByAudience.parents.rejectedSources.length, 2);
  assert.equal(policy.readiness(session.researchByAudience.parents, 6).ready, true);
});

test("automated proposal research performs one bounded continuation for partial evidence", async () => {
  let calls = 0;
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {},
    researchArticleEvidence: async () => {
      calls += 1;
      const start = calls === 1 ? 0 : 3;
      const sources = Array.from({ length: 3 }, (_, index) => ({ id: `source-${start + index}`, url: `https://scielo.org/source-${start + index}`, verificationStatus: "verified" }));
      return { sources, facts: [], analysisStatus: "complete", analysis: { sourceIds: sources.map((source) => source.id) }, targetSourceCount: 6, verificationStatus: "blocked", blockers: [`Se verificaron ${start + 3} de 6 fuentes requeridas.`], nextPlatformOffset: calls };
    }, console });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const session = { id: "s", topic: "Aprendizaje", selectedAudiences: ["parents"], proposals: [{ audience: "parents", title: "Aprendizaje en casa", brief: "Guía" }], researchByAudience: {} };
  await context.generateProposalsForMode({ session, topic: session.topic, reuseProposals: true, researchContinuations: 1 });
  assert.equal(calls, 2);
  assert.equal(session.researchByAudience.parents.sources.length, 6);
  assert.equal(policy.readiness(session.researchByAudience.parents, 6).ready, true);
});

test("resumed audience research replaces undated role choices with dated sources", async () => {
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {}, console,
    researchArticleEvidence: async () => {
      const sources = candidates(4, "dated").map((source) => ({ ...source, year: "2020", verificationStatus: "verified" }));
      return { sources, facts: [], analysisStatus: "complete", analysis: { sourceIds: sources.map((source) => source.id) }, dateSearchComplete: true, targetSourceCount: 4, verificationStatus: "verified", blockers: [] };
    } });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const undated = candidates(4, "undated").map((source) => ({ ...source, verificationStatus: "verified" }));
  const session = { id: "s", topic: "Aprendizaje", selectedAudiences: ["parents"],
    proposals: [{ audience: "parents", title: "Aprendizaje en casa", brief: "Guía" }],
    researchByAudience: { parents: { sources: undated, analysisStatus: "complete", analysis: { sourceIds: undated.map((source) => source.id) },
      sharedSourceIds: undated.slice(0, 2).map((source) => source.id), specificSourceIds: undated.slice(2).map((source) => source.id),
      verificationStatus: "blocked", blockers: ["La búsqueda de fuentes fechadas quedó pendiente."] } } };
  await context.generateProposalsForMode({ session, topic: session.topic, reuseProposals: true });
  const dossier = session.researchByAudience.parents;
  assert.equal(policy.readiness(dossier, 4).ready, true);
  assert.ok(dossier.sharedSourceIds.every((id) => id.startsWith("dated")));
  assert.ok(dossier.specificSourceIds.every((id) => id.startsWith("dated")));
});

test("resuming an older chat session includes the open search option that the chat previously omitted", async () => {
  const requests = [];
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", researchArticleEvidence: async (request) => { requests.push(request); return {}; } });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const seven = policy.platforms.map((platform) => platform.id);
  await context.researchTopicForMode({ session: { agentRunId: "old-chat", searchPlatforms: seven }, topic: "Aprendizaje" });
  await context.researchTopicForMode({ session: { searchPlatforms: seven }, topic: "Aprendizaje" });
  assert.deepEqual(Array.from(requests[0].searchPlatforms), [...seven, "supplemental"]);
  assert.deepEqual(Array.from(requests[1].searchPlatforms), seven, "an explicit manual selection remains unchanged");
});

test("provisional drafting uses the partial dossier without reopening the research gate", async () => {
  const requests = [];
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    draftArticleWithGemini: async (request) => { requests.push(request); return { title: "Borrador", blocks: [{ text: "Orientación general", sourceIds: [] }] }; } });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const session = { id: "partial", topic: "Aprendizaje", audience: "educators", researchByAudience: { educators: {
    sources: [], facts: [], verifiedSourceCount: 0, targetSourceCount: 4, verificationStatus: "blocked"
  } } };
  const article = await context.draftArticleForMode({ session, title: "Aprendizaje", topic: "Aprendizaje", audience: "educators", allowProvisionalDraft: true, isAutomated: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].provisionalDraft, true);
  assert.equal(requests[0].researchDossier.provisionalDraft, true);
  assert.equal(article.blocks[0].text, "Orientación general");
});

test("manual drafting falls back to a review draft after research exhausts its verified sources", async () => {
  const requests = [];
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {},
    researchArticleEvidence: async () => ({ sources: [], facts: [], analysisStatus: "complete", analysis: { sourceIds: [] }, dateSearchComplete: true, targetSourceCount: 4, verificationStatus: "blocked", blockers: [] }),
    draftArticleWithGemini: async (request) => { requests.push(request); return { title: "Borrador", provisionalDraft: request.provisionalDraft, blocks: [{ text: "Orientación general", sourceIds: [] }] }; } });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const session = { id: "manual", topic: "Aprendizaje", audience: "educators", selectedAudiences: ["educators"] };
  const article = await context.draftArticleForMode({ session, title: "Aprendizaje", topic: "Aprendizaje", audience: "educators" });
  assert.equal(article.provisionalDraft, true);
  assert.equal(requests[0].researchDossier.verifiedSourceCount, 0);
  assert.equal(session.researchByAudience.educators.verificationStatus, "blocked");
});

test("single-audience drafting resumes partial research and clears stale blockers", async () => {
  const requests = [];
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [],
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {}, console,
    researchArticleEvidence: async (request) => {
      requests.push(request);
      const sources = Array.from({ length: 5 }, (_, index) => ({ id: `new-${index}`, url: `https://scielo.org/new-${index}`, verificationStatus: "verified" }));
      return { sources, facts: [], analysisStatus: "complete", analysis: { sourceIds: sources.map((source) => source.id) },
        targetSourceCount: 6, verificationStatus: "blocked", blockers: ["Se verificaron 5 de 6 fuentes requeridas.", "La investigación no encontró ninguna fuente verificable después de completar las rondas de búsqueda."] };
    } });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const old = { id: "old", url: "https://scielo.org/old", verificationStatus: "verified" };
  const session = { id: "s", topic: "Aprendizaje", audience: "educators", selectedAudiences: ["educators"],
    proposals: [{ audience: "educators", title: "Aprendizaje en el aula", brief: "Guía" }],
    researchByAudience: { educators: { sources: [old], rejectedSources: [{ url: "https://scielo.org/missing", reason: "not_found", httpStatus: 404 }],
      pendingCandidates: [{ id: "pending", url: "https://scielo.org/pending", verificationAttempts: 1 }],
      analysisStatus: "incomplete", analysis: { sourceIds: ["old"] }, verificationStatus: "blocked" } } };
  const dossier = await context.ensureAudienceResearchForDraft({ session, title: "Aprendizaje en el aula", topic: session.topic, audience: "educators", brief: "Guía" });
  assert.deepEqual(Array.from(requests[0].excludeUrls), [old.url, "https://scielo.org/missing"]);
  assert.equal(requests[0].pendingCandidates.length, 1);
  assert.equal(dossier.sources.length, 6);
  assert.equal(dossier.blockers.length, 0);
  assert.equal(policy.readiness(dossier, 6).ready, true);
});

test("merging dossiers does not mark unanalysed sources as complete", () => {
  const context = vm.createContext({ MarcieResearchPolicy: policy });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const sources = candidates(6).map((source) => ({ ...source, verificationStatus: "verified" }));
  const merged = context.mergeResearchDossiers(
    { sources: sources.slice(0, 2), analysis: { sourceIds: [sources[0].id] } },
    { sources: sources.slice(2), analysis: { sourceIds: sources.slice(2).map((source) => source.id) }, targetSourceCount: 6 }
  );
  assert.equal(merged.analysisStatus, "incomplete");
  assert.equal(merged.analysis.sourceIds.length, 5);
  assert.equal(policy.readiness(merged, 6).ready, false);
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

test("one-source dossiers produce review drafts but remain blocked for approval", async () => {
  let drafts = 0, searches = 0;
  const dossier = { sources: [{ id: "s1", title: "Paper", url: "https://example.org/paper", verificationStatus: "verified" }], targetSourceCount: 8, verificationStatus: "blocked" };
  const context = vm.createContext({ MarcieResearchPolicy: policy, listMarciePromptProfiles: () => [], console,
    buildEditorialVocabularyInstruction: () => "", normalizeEditorialVocabulary: () => [],
    restoreSessionResearchFromCache() {}, getResearchDossierFromCache: () => null,
    saveResearchDossierToCache() {}, saveSessionResearchToCache() {}, isTransientFetchError: () => false,
    researchArticleEvidence: async () => { searches++; return dossier; },
    draftArticleWithGemini: async ({ provisionalDraft }) => { drafts++; return { provisionalDraft, blocks: [{ text: "Borrador", sourceIds: [] }] }; }
  });
  const code = loadServiceSource(fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8"));
  vm.runInContext(code, context);
  const session = { id: "s", topic: "Aprendizaje", audience: "educators", editorialProfileSnapshot: { minimumSources: 8 }, researchByAudience: {} };
  for (let attempt = 0; attempt < 2; attempt++) {
    const article = await context.draftArticleForMode({ session, topic: session.topic });
    assert.equal(article.provisionalDraft, true);
  }
  assert.equal(drafts, 2);
  assert.equal(searches, 2);
  assert.equal(policy.readiness(session.researchByAudience.educators, 8).ready, false);
});

test("network and server failures during audience research propagate instead of becoming empty dossiers", async () => {
  const source = fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8");
  const start = source.indexOf("function proposalResearchFingerprint");
  const end = source.indexOf("export async function generateProposalsForMode", start);
  let researchError;
  const context = vm.createContext({
    restoreSessionResearchFromCache() {},
    getResearchDossierFromCache: () => null,
    researchInstructionsForSession: () => [],
    researchPolicy: { fingerprint: () => "fingerprint", target: () => 6 },
    researchTopicForMode: async () => { throw researchError; },
    isTransientFetchError: (error) => error instanceof vm.runInContext("TypeError", context)
  });
  vm.runInContext(source.slice(start, end), context);
  researchError = vm.runInContext('new TypeError("Failed to fetch")', context);
  await assert.rejects(context.ensureAudienceResearchForDraft({ session: { topic: "Aprendizaje" }, topic: "Aprendizaje" }), /Failed to fetch/);
  researchError = Object.assign(new Error("La investigación tardó demasiado"), { status: 503, code: "marcie_research_timeout" });
  await assert.rejects(context.ensureAudienceResearchForDraft({ session: { topic: "Aprendizaje" }, topic: "Aprendizaje" }), /La investigación tardó demasiado/);
});

test("a fully analysed dossier remains incomplete below its source target", () => {
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
  assert.equal(state.ready, false);
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

test("pending extra candidates do not invalidate four analysed and verified documents", () => {
  const source = fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-mode-service.js"), "utf8");
  const start = source.indexOf("function refreshResearchAnalysisStatus(");
  const end = source.indexOf("function researchContinuation(", start);
  const browserPolicySource = fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/contracts/marcie-research-policy.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(browserPolicySource, context);
  vm.runInContext(source.slice(start, end), context);
  const sources = candidates(4).map(item => ({ ...item, verificationStatus: "verified" }));
  const dossier = { sources, targetSourceCount: 4, analysisStatus: "incomplete", analysis: { sourceIds: sources.map(item => item.id) }, pendingCandidates: [{ url: "https://example.org/extra" }], verificationStatus: "blocked", blockers: ["Quedan 1 resultados sin analizar por el límite técnico de esta ejecución."] };
  const refreshed = context.refreshResearchAnalysisStatus(dossier);
  assert.equal(refreshed.analysisStatus, "complete");
  assert.equal(context.MarcieResearchPolicy.readiness(refreshed, 4).ready, true);
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
  vm.runInContext(loadServiceSource(source), context);
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
    LATAM_ARTICLE_LANGUAGE_POLICY: "Español latinoamericano neutro",
    sanitizeTrustedSources: sources => sources || [],
    applyVerifiedAttributions: article => article,
    generateArticleInChunks: async request => { generation = request; return { title: "Article", blocks: [] }; }
  });
  const code = fs.readFileSync(require("node:path").join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-aida-service.js"), "utf8").replace(/^import[\s\S]*?;\s*$/gm, "").replace(/\bexport /g, "");
  vm.runInContext(code, context);
  const article = await context.draftAidaArticleWithGemini({ topic: "Aprendizaje", researchDossier: dossier, customRules: { minimumSources: 20 } });
  assert.equal(generation.dossier.sources.length, 20);
  assert.equal(generation.dossier.sources.at(-1).id, "paper19");
  assert.equal(generation.mode, "aida");
  assert.equal(article.sources.length, 20);
  assert.equal(article.researchDossier.targetSourceCount, 20);
});
