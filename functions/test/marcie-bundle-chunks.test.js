const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { researchArticleEvidenceBundleServer, selectArticleEvidenceServer } = require("./research-fixture.cjs");

test("browser pipeline calls global research before source selection", async () => {
  const code = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
  const section = code.slice(code.indexOf("export async function researchArticleEvidenceBundle"), code.indexOf("export async function verifyArticleEvidence"));
  const calls = [];
  const dossier = { sources: [{ id: "s1", title: "Documento", url: "https://example.org/documento", verificationStatus: "verified" }] };
  const context = vm.createContext({
    MarcieResearchPolicy: require("../src/marcie-research-policy.js"), getConfiguredGeminiModel: () => "test-model",
    researchArticleEvidence: async (options) => { calls.push({ stage: "research", options }); return dossier; },
    authenticatedJsonRequestWithRetry: async (url, payload) => { calls.push({ stage: "select", url, payload }); return { byAudience: { parents: dossier, educators: dossier } }; },
    sanitizeTrustedSources: (sources) => sources
  });
  vm.runInContext(section.replace(/^export /gm, ""), context);
  const result = await context.researchArticleEvidenceBundle({ topic: "Aprendizaje", audiences: ["parents", "educators"], audienceBriefs: {} });
  assert.deepEqual(calls.map((call) => call.stage), ["research", "select"]);
  assert.equal(calls[0].options.globalResearch, true);
  assert.equal(calls[1].url, "/api/marcie/evidence/select");
  assert.equal(calls[1].payload.dossier, dossier);
  assert.equal(result.byAudience.parents.sources.length, 1);
});

test("browser pipeline falls back to the deployed bundle route when research-global returns 404", async () => {
  const code = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
  const section = code.slice(code.indexOf("export async function researchArticleEvidenceBundle"), code.indexOf("export async function verifyArticleEvidence"));
  const calls = [];
  const dossier = { sources: [{ id: "s1", title: "Documento", url: "https://example.org/documento", verificationStatus: "verified" }], facts: [] };
  const context = vm.createContext({
    MarcieResearchPolicy: require("../src/marcie-research-policy.js"), getConfiguredGeminiModel: () => "test-model", console,
    researchArticleEvidence: async () => { calls.push("global"); throw Object.assign(new Error("HTTP 404"), { status: 404 }); },
    authenticatedJsonRequestWithRetry: async (url) => { calls.push(url); return { byAudience: { parents: dossier, educators: dossier } }; },
    sanitizeTrustedSources: (sources) => sources
  });
  vm.runInContext(section.replace(/^export /gm, ""), context);
  const result = await context.researchArticleEvidenceBundle({ topic: "Aprendizaje", audiences: ["parents", "educators"] });
  assert.deepEqual(calls, ["global", "/api/marcie/evidence/research-bundle"]);
  assert.equal(result.byAudience.parents.sources.length, 1);
  assert.equal(result.globalDossier.sources.length, 1);
});

test("source selection does not assign a classified unrelated document to another audience", async () => {
  const sources = ["shared", "family", "family-2"].map((id) => ({ id, title: id, url: `https://example.org/${id}`, verificationStatus: "verified", year: "2022", supportSummary: "Hallazgo comprobado" }));
  const client = { models: { generateContent: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
    sharedIds: ["shared", "family"], matches: [
      { id: "shared", audiences: ["parents", "educators"] },
      { id: "family", audiences: ["parents"] }, { id: "family-2", audiences: ["parents"] }
    ] }) }] } }] }) } };
  const video = { id: "video-1", title: "Charla", url: "https://www.youtube.com/watch?v=12345678901", sourceType: "youtube_video", verificationStatus: "attributed_only", supportSummary: "Idea atribuible al video" };
  const result = await selectArticleEvidenceServer({ dossier: { sources: [...sources, video], facts: [], attributedReferences: [], analysis: {}, dateSearchComplete: true },
    topic: "Aprendizaje", audiences: ["parents", "educators"], minimumSources: 4, dependencies: { client } });
  assert.deepEqual(result.byAudience.educators.sources.map((source) => source.id), ["shared", "video-1"]);
  assert.equal(result.byAudience.educators.verificationStatus, "blocked");
  assert.ok(result.byAudience.parents.sources.some((source) => source.id === "family"));
});

test("an empty audience classification does not turn global documents into article sources", async () => {
  const dossier = { sources: [{ id: "global", title: "Documento", url: "https://example.org/documento", verificationStatus: "verified", supportSummary: "Hallazgo general" }], facts: [] };
  const client = { models: { generateContent: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"matches":[],"sharedIds":[]}' }] } }] }) } };
  const result = await selectArticleEvidenceServer({ dossier, audiences: ["parents", "educators"], dependencies: { client } });
  assert.equal(result.byAudience.parents.verifiedSourceCount, 0);
  assert.equal(result.byAudience.educators.verifiedSourceCount, 0);
});

test("shared research verifies each URL once and stops when both audiences have enough sources", async () => {
  const sources = Array.from({ length: 9 }, (_, index) => ({ id: `s${index}`, title: `Estudio ${index}`, url: `https://example.org/${index}` }));
  let searches = 0;
  let verified = 0;
  const client = { models: { generateContent: async (request) => {
    const prompt = request.contents[0].parts[0].text;
    if (prompt.startsWith("Clasifica")) return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ matches: sources.map((source) => ({ id: `source-${require("node:crypto").createHash("sha256").update(source.url).digest("hex").slice(0, 20)}`, audiences: ["parents", "educators"] })) }) }] } }] };
    searches += 1;
    return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ sources }) }] } }] };
  } } };
  const result = await researchArticleEvidenceBundleServer({
    topic: "Aprendizaje", audiences: ["parents", "educators"], audienceBriefs: { parents: "Hogar", educators: "Aula" },
    searchPlatforms: ["scielo", "redalyc"], minimumSources: 4,
    dependencies: { client, verifyCandidateSources: async ({ candidates }) => {
      verified += candidates.length;
      return { verifiedSources: candidates.map((source) => ({ ...source, year: "2020", verificationStatus: "verified", supportSummary: "Hallazgo pertinente", discoveredVia: source.discoveredVia })), rejectedSources: [], retrievedPages: [] };
    } }
  });
  assert.equal(searches, 2);
  assert.equal(verified, 9);
  assert.equal(result.byAudience.parents.verifiedSourceCount, 4);
  assert.equal(result.byAudience.parents.sharedSourceCount, 2);
  assert.equal(result.byAudience.parents.specificSourceCount, 2);
  assert.equal(result.sharedSourceCount, 2);
  assert.equal(result.byAudience.educators.verificationStatus, "verified");
});

test("shared research gives both audiences dated documents before undated fallbacks", async () => {
  const sources = Array.from({ length: 9 }, (_, index) => ({ id: `s${index}`, title: `Estudio ${index}`, url: `https://example.org/${index}` }));
  const response = (value) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });
  const client = { models: { generateContent: async (request) => response(request.contents[0].parts[0].text.startsWith("Clasifica")
    ? { matches: sources.map((source) => ({ id: `source-${require("node:crypto").createHash("sha256").update(source.url).digest("hex").slice(0, 20)}`, audiences: ["parents", "educators"] })) }
    : { sources }) } };
  const result = await researchArticleEvidenceBundleServer({
    topic: "Aprendizaje", audiences: ["parents", "educators"], audienceBriefs: { parents: "Hogar", educators: "Aula" },
    searchPlatforms: ["scielo", "redalyc"], minimumSources: 4,
    dependencies: { client, verifyCandidateSources: async ({ candidates }) => ({
      verifiedSources: candidates.map((source) => ({ ...source, year: Number(source.url.split("/").at(-1)) < 6 ? "2020" : "", verificationStatus: "verified", supportSummary: "Hallazgo pertinente", discoveredVia: source.discoveredVia })),
      rejectedSources: [], retrievedPages: []
    }) }
  });
  for (const audience of ["parents", "educators"]) {
    assert.equal(result.byAudience[audience].verifiedSourceCount, 4);
    assert.ok(result.byAudience[audience].sources.every((source) => source.year === "2020"));
    assert.equal(result.byAudience[audience].verificationStatus, "verified");
  }
});

test("article groups resume after a failed group without regenerating validated text", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-draft-chunks.js"), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/\bexport /g, "");
  let calls = 0;
  let failSecond = true;
  let checkpoint;
  const context = vm.createContext({
    console,
    parseMarcieJson: JSON.parse,
    generateWithGemini: async ({ prompt }) => {
      calls += 1;
      if (prompt.startsWith("Planifica")) return JSON.stringify({ subtitle: "Subtítulo", excerpt: "Resumen", sections: [
        { heading: "Origen", purpose: "Contexto" }, { heading: "Evidencia", purpose: "Datos" }, { heading: "Aplicación", purpose: "Consejos" }
      ] });
      const sections = JSON.parse(prompt.match(/Secciones solicitadas: (\[[\s\S]*?\])\. Produce/)?.[1] || "[]");
      if (sections[0]?.key === "section-3" && failSecond) throw Object.assign(new Error("temporary"), { status: 503 });
      return JSON.stringify({ blocks: sections.map((section) => ({ section: section.key, text: `Texto para ${section.key}`, sourceIds: ["source-1"] })) });
    }
  });
  vm.runInContext(`${source}\nglobalThis.generateArticleInChunks = generateArticleInChunks;`, context);
  const options = { model: "gemini-3.8-flash", title: "Tema", topic: "Tema", audience: "educators", brief: "Aula", dossier: { sources: [{ id: "source-1", title: "Estudio" }] }, onChunk: (value) => { checkpoint = value; } };
  await assert.rejects(context.generateArticleInChunks(options), /temporary/);
  assert.equal(checkpoint.completedGroups, 1);
  const beforeResume = calls;
  failSecond = false;
  const result = await context.generateArticleInChunks({ ...options, checkpoint });
  assert.equal(calls, beforeResume + 1);
  assert.equal(result.blocks.filter((block) => block.type === "heading").length, 3);
  assert.equal(result.blocks.filter((block) => block.type !== "heading").length, 3);
});

test("a 1200–1600 word request plans five sections and expands short groups", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-draft-chunks.js"), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/\bexport /g, "");
  const prompts = [];
  const context = vm.createContext({ generateWithGemini: async ({ prompt }) => {
    prompts.push(prompt);
    if (prompt.startsWith("Planifica")) return JSON.stringify({ subtitle: "Sub", excerpt: "Resumen", sections: Array.from({ length: 5 }, (_, index) => ({ heading: `Parte ${index + 1}`, purpose: "Explicación" })) });
    const sections = JSON.parse(prompt.match(/Secciones solicitadas: (\[[\s\S]*?\])\. Produce/)?.[1] || "[]");
    const expanded = prompt.includes("La versión anterior sumó");
    return JSON.stringify({ blocks: sections.map((section) => ({ section: section.key, text: Array(expanded ? 245 : 20).fill("evidencia").join(" "), sourceIds: ["s1"] })) });
  } });
  vm.runInContext(`${source}\nglobalThis.generateArticleInChunks = generateArticleInChunks;`, context);
  const article = await context.generateArticleInChunks({ model: "gemini", title: "Tema", topic: "Tema", audience: "parents", brief: "#extension Estándar, entre 1200 y 1600 palabras", dossier: { sources: [{ id: "s1" }] } });
  assert.match(prompts[0], /exactamente 5 secciones/);
  assert.ok(prompts.some((prompt) => prompt.includes("La versión anterior sumó")));
  assert.ok(article.blocks.map((block) => block.text).join(" ").split(/\s+/).length >= 1200);
});

test("provisional article can be drafted with no verified sources and no invented citations", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-draft-chunks.js"), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/\bexport /g, "");
  const prompts = [];
  const context = vm.createContext({ generateWithGemini: async ({ prompt }) => {
    prompts.push(prompt);
    if (prompt.startsWith("Planifica")) return JSON.stringify({ subtitle: "Guía", excerpt: "Orientaciones", sections: [
      { heading: "Contexto", purpose: "Introducción" }, { heading: "Aplicación", purpose: "Consejos" }, { heading: "Cierre", purpose: "Resumen" }
    ] });
    const sections = JSON.parse(prompt.match(/Secciones solicitadas: (\[[\s\S]*?\])\. Produce/)?.[1] || "[]");
    return JSON.stringify({ blocks: sections.map((section) => ({ section: section.key, text: "Orientación general [fuente-inventada] para revisar.", sourceIds: ["fuente-inventada"] })) });
  } });
  vm.runInContext(`${source}\nglobalThis.generateArticleInChunks = generateArticleInChunks;`, context);
  const article = await context.generateArticleInChunks({ model: "gemini", title: "Tema", topic: "Tema", audience: "parents", brief: "Hogar", dossier: { sources: [], facts: [], provisionalDraft: true } });
  assert.ok(prompts.some((prompt) => prompt.includes("BORRADOR PARA REVISIÓN")));
  assert.ok(article.blocks.every((block) => block.sourceIds.length === 0));
  assert.ok(article.blocks.every((block) => !block.text.includes("fuente-inventada")));
  assert.ok(article.blocks.some((block) => block.text.includes("Orientación general")));
});

test("an outline checkpoint survives failure before the first content group", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-draft-chunks.js"), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/\bexport /g, "");
  let outlineCalls = 0;
  let contentCalls = 0;
  let fail = true;
  let checkpoint;
  const context = vm.createContext({
    generateWithGemini: async ({ prompt }) => {
      if (prompt.startsWith("Planifica")) {
        outlineCalls += 1;
        return JSON.stringify({ subtitle: "Sub", excerpt: "Resumen", sections: [
          { heading: "Uno", purpose: "Idea" }, { heading: "Dos", purpose: "Idea" }, { heading: "Tres", purpose: "Idea" }
        ] });
      }
      contentCalls += 1;
      if (fail) throw Object.assign(new Error("quota"), { status: 429 });
      const sections = JSON.parse(prompt.match(/Secciones solicitadas: (\[[\s\S]*?\])\. Produce/)?.[1] || "[]");
      return JSON.stringify({ blocks: sections.map((section) => ({ section: section.key, text: "Contenido verificado", sourceIds: ["s1"] })) });
    }
  });
  vm.runInContext(`${source}\nglobalThis.generateArticleInChunks = generateArticleInChunks;`, context);
  const options = { model: "gemini-3.8-flash", title: "Tema", topic: "Tema", audience: "parents", dossier: { sources: [{ id: "s1" }] }, onChunk: (value) => { checkpoint = value; } };
  await assert.rejects(context.generateArticleInChunks(options), /quota/);
  assert.equal(contentCalls, 1);
  assert.equal(checkpoint.completedGroups, 0);
  fail = false;
  const result = await context.generateArticleInChunks({ ...options, checkpoint });
  assert.equal(outlineCalls, 1);
  assert.equal(result.blocks.length, 6);
});
