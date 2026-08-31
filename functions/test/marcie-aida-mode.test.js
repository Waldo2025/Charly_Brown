const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { researchArticleEvidenceServer } = require("../src/marcie-editorial-research.js");

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];
const page = () => new Response(`<!doctype html><title>Estudio científico</title><meta property="article:published_time" content="2026-08-10T12:00:00Z"><main>${"Evidencia científica sobre aprendizaje, historia y conocimiento vigente. ".repeat(12)}</main>`, { status: 200, headers: { "content-type": "text/html" } });
const modelJson = (value) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });

function aidaResearchClient(sourceCount) {
  const sources = Array.from({ length: sourceCount }, (_, index) => ({
    id: `s${index + 1}`,
    title: `Estudio ${index + 1}`,
    url: `https://institution-${index + 1}.edu/paper`,
    publisher: `Institución ${(index % 4) + 1}`,
    sourceType: "paper",
    evidenceRole: "current"
  }));
  return { models: { generateContent: async (request = {}) => {
    const prompt = String(request?.contents?.[0]?.parts?.[0]?.text || "");
    if (!prompt.includes("verificador documental estricto")) return modelJson({
      summary: "Síntesis científica actual",
      facts: [{ id: "fact-1", claim: "El aprendizaje cambia con la evidencia.", sourceIds: ["s1"], risk: "low" }],
      currentSignals: [{ id: "signal-1", signal: "Existe un cambio vigente comprobado.", sourceIds: ["s1"] }],
      historicalMilestones: [{ year: "1980", personOrInstitution: "Instituciones 1 y 2", contribution: "Avance respaldado", sourceIds: ["s1", "s2"] }],
      sources
    });
    const ids = [...prompt.matchAll(/(?:^|\n)ID ([^\n]+)/g)].map((match) => match[1].trim());
    return modelJson({ assessments: ids.map((id) => ({ id, status: "verified", supportSummary: "Respalda el dossier", locator: "Resultados" })) });
  } } };
}

test("Aida keeps eight sources as its target and verifies with three independent institutions", async () => {
  const dependencies = (count) => ({ client: aidaResearchClient(count), now: new Date("2026-08-25T12:00:00Z"), retrieveOptions: { resolveHost: publicDns, fetchImpl: async () => page() } });
  const blocked = await researchArticleEvidenceServer({ topic: "Aprendizaje", mode: "aida", minimumSources: 8, dependencies: dependencies(2) });
  assert.equal(blocked.verificationStatus, "blocked");
  assert.equal(blocked.verifiedSourceCount, 2);
  assert.match(blocked.blockers.join(" "), /3 páginas/);

  const verified = await researchArticleEvidenceServer({ topic: "Aprendizaje", mode: "aida", minimumSources: 8, dependencies: dependencies(3) });
  assert.equal(verified.verificationStatus, "verified");
  assert.equal(verified.verifiedSourceCount, 3);
  assert.equal(verified.institutionCount, 3);
  assert.equal(verified.targetSourceCount, 8);
  assert.equal(verified.minimumSourceCount, 3);
  assert.equal(verified.recommendations.length, 2);
  assert.equal(verified.currentSignals.length, 1);
  assert.equal(verified.historicalMilestones.length, 0, "current sources must not be repurposed as historical milestones");
  assert.equal(verified.researchPeriod, "6m");
  assert.equal(verified.currentSourceCount, 3);
});

test("all user-facing editorial actions route through marcie-mode-service", () => {
  const root = path.resolve(__dirname, "../../public/MarcieBlogEditor/js");
  const files = ["editor-app.js", "components/pipeline-stepper.js", "components/topbar-actions.js"];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.doesNotMatch(source, /\breviewArticleWithGemini\s*\(/, `${relative} bypasses mode review`);
    assert.doesNotMatch(source, /\bdraftArticleWithGemini\s*\(/, `${relative} bypasses mode drafting`);
    assert.doesNotMatch(source, /\bsearchTrendsWithGemini\s*\(/, `${relative} bypasses mode research`);
  }
  const router = fs.readFileSync(path.join(root, "services/marcie-mode-service.js"), "utf8");
  assert.match(router, /export async function researchTopicForMode/);
  assert.match(router, /export async function generateProposalsForMode/);
  assert.match(router, /export async function draftArticleForMode/);
  assert.match(router, /export async function reviewArticleForMode/);
  assert.match(router, /researchAidaTopicWithGemini/);
  assert.match(router, /generateAidaProposalsWithGemini/);
  assert.match(router, /reviewAidaArticleWithGemini/);
});

test("blank sessions preserve the selected Aida mode, audiences and initial article contract", () => {
  const root = path.resolve(__dirname, "../../public/MarcieBlogEditor/js");
  const modalSource = fs.readFileSync(path.join(root, "components/modals.js"), "utf8");
  const editorSource = fs.readFileSync(path.join(root, "editor-app.js"), "utf8");
  assert.match(modalSource, /finish\(\{ mode: "blank", title: blankTitle, topic: "", specifications: \[\], \.\.\.readEditorialSelection\(\) \}\)/);
  assert.match(modalSource, /editorialMode === "aida" \? \["parents", "educators"\]/);
  assert.match(editorSource, /const initialAudience = request\.selectedAudiences\?\.\[0\]/);
  assert.match(editorSource, /editorialMode: request\.editorialMode \|\| "marcie"/);
  assert.match(editorSource, /modeCompatibility: request\.editorialMode === "aida" \? "empty"/);
});

test("the strict Aida service owns its prompts and eight-phase contract", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-aida-service.js"), "utf8");
  assert.doesNotMatch(source, /getActiveMarciePrompt/);
  for (const phase of ["headline", "problem", "deepen", "agitate", "turn", "why", "change", "close"]) assert.match(source, new RegExp(`\\b${phase}\\b`));
  assert.match(source, /Aida requiere al menos 3 páginas actuales concretas verificadas/);
  assert.match(source, /al menos tres publicaciones o instituciones diferentes/);
});

test("Aida researches the complete user topic and uses science and history as supporting layers", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-aida-service.js"), "utf8");
  const backend = fs.readFileSync(path.resolve(__dirname, "../src/marcie-editorial-research.js"), "utf8");
  const editor = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");

  assert.match(backend, /El tema indicado por el usuario es el centro de la investigación/);
  assert.match(backend, /añade ciencia o evolución histórica únicamente cuando exista evidencia/);
  assert.match(service, /Los hechos científicos y la historia enriquecen el argumento: no sustituyen el tema principal/);
  assert.match(service, /idea central fiel al tema/);
  assert.match(editor, /Investigar el tema · Aida/);
  assert.doesNotMatch(backend, /Investiga científicamente el tema/);
  assert.doesNotMatch(editor, /Investigar ciencia e historia · Aida/);
  assert.match(backend, /const researchLenses = editorialMode === "aida"/);
  assert.match(backend, /generatedBatches\.flatMap/);
});

test("an incomplete Aida dossier is researched again before drafting", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-aida-service.js"), "utf8");
  const contracts = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/contracts/editorial-contracts.js"), "utf8");

  assert.match(service, /existingDossierIsReady[\s\S]*?verificationStatus === "verified"[\s\S]*?existingCurrentSources\.length >= 3[\s\S]*?uniqueInstitutions\(existingCurrentSources\)\.size >= 3/);
  assert.match(service, /No repitas ni parafrasees una afirmación marcada como no respaldada/);
  assert.match(contracts, /Aida: \$\{verifiedSources\.length\} de 3 páginas mínimas verificadas/);
  assert.match(contracts, /blockerKeys\.has\(key\)/);
});

test("Aida preserves its dossier on refresh and advances from analysis to production", () => {
  const root = path.resolve(__dirname, "../../public/MarcieBlogEditor/js");
  const pipeline = fs.readFileSync(path.join(root, "components/pipeline-stepper.js"), "utf8");
  const editor = fs.readFileSync(path.join(root, "editor-app.js"), "utf8");
  const guardIndex = pipeline.indexOf("if (previousSourceCount > 0 && nextSourceCount === 0)");
  const verifiedGuardIndex = pipeline.indexOf("if (previousWasVerified && !nextIsVerified)");
  const assignmentIndex = pipeline.indexOf("session.trends = [result]");

  assert.ok(guardIndex >= 0 && guardIndex < assignmentIndex, "empty refresh must be rejected before replacing the dossier");
  assert.ok(verifiedGuardIndex >= 0 && verifiedGuardIndex < assignmentIndex, "blocked refresh must be rejected before replacing verified research");
  assert.doesNotMatch(editor, /Volver a analizar con Aida/);
  assert.match(editor, /data-continue-editorial-production/);
  assert.match(editor, /Crear, redactar y analizar/);
  assert.match(editor, /closeActiveModal\(\);[\s\S]*?requestAnimationFrame\(\(\) => openEditorialPhaseModal\(2\)\)/);
});

test("Aida drafting defers factual verification and review reuses unchanged evidence", () => {
  const root = path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services");
  const aida = fs.readFileSync(path.join(root, "marcie-aida-service.js"), "utf8");
  const backend = fs.readFileSync(path.resolve(__dirname, "../src/marcie-editorial-research.js"), "utf8");

  assert.match(aida, /storedHash === await articleContentHash\(article\)/);
  assert.match(aida, /hasCurrentEvidenceVerification\(articleWithMode\)[\s\S]*?additionalSearches: 0/);
  assert.equal((aida.match(/additionalSearches: 0/g) || []).length, 1, "Aida drafting must defer verification; review may verify without supplemental searches");
  assert.match(aida, /verification: \{ status: "pending"/);
  assert.match(backend, /EVIDENCE_VERIFY_DEADLINE_MS = 105_000/);
  assert.match(backend, /"marcie_verification_timeout"/);
});

test("automatic page verification does not launch research or mix editorial review blockers", () => {
  const root = path.resolve(__dirname, "../../public/MarcieBlogEditor/js");
  const editor = fs.readFileSync(path.join(root, "editor-app.js"), "utf8");
  const service = fs.readFileSync(path.join(root, "services/marcie-gemini-service.js"), "utf8");
  const contracts = fs.readFileSync(path.join(root, "contracts/editorial-contracts.js"), "utf8");
  const backend = fs.readFileSync(path.resolve(__dirname, "../src/marcie-editorial-research.js"), "utf8");

  assert.match(editor, /function scheduleAutomaticEvidenceVerification/);
  assert.match(editor, /function runAutomaticEvidenceVerification[\s\S]*?verifyArticleEvidence\(\{[\s\S]*?additionalSearches: 0/);
  assert.match(editor, /invalidateMaterialApproval[\s\S]*?scheduleAutomaticEvidenceVerification\(session\)/);
  assert.match(service, /verifyArticleEvidence\(\{ article = \{\}, topic = "", additionalSearches = 0/);
  assert.match(contracts, /const evidenceOnly = context\.scope === "evidence"/);
  assert.doesNotMatch(backend, /blockers\.push\("El artículo no contiene las ocho fases Aida completas\."\)/);
});

test("automatic verification reuses session evidence and exposes only retry on failure", () => {
  const editor = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");

  assert.match(editor, /function getSessionEvidenceCandidates\(session = \{\}\)/);
  assert.match(editor, /Object\.values\(session\.articlesByAudience \|\| \{\}\)\.forEach\(appendSources\)/);
  assert.match(editor, /researchSources: evidenceCandidates/);
  assert.match(editor, /Control factual completado automáticamente/);
  assert.match(editor, /btnVerifyEvidence\.classList\.toggle\("hidden", isChecking \|\| !verificationError\)/);
  assert.doesNotMatch(editor, /Comprobar afirmaciones/);
  assert.doesNotMatch(editor, /`Verificación incompleta: \$\{blockers\.join\(" · "\)\}`/);
});

test("the evidence panel renders shared source references instead of repeating full URLs per claim", () => {
  const editor = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");

  assert.match(editor, /const reference = `F\$\{evidenceSources\.length \+ 1\}`/);
  assert.match(editor, /Fuentes de la matriz/);
  assert.match(editor, /claimReferences/);
  assert.doesNotMatch(editor, /links\.map\(\(link\) => `<a class="mt-2 block text-\[10px\]/);
});

test("creation and export modals include manually created article variants", () => {
  const editor = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/editor-app.js"), "utf8");

  assert.match(editor, /const proposalsByAudience = new Map\(\)/);
  assert.match(editor, /origin: existing\?\.origin \|\| "manual"/);
  assert.match(editor, /Creado manualmente/);
  assert.match(editor, /function getSessionArticleExportEntries\(session = \{\}\)/);
  assert.match(editor, /Exportar todos los estilos/);
  assert.match(editor, /\? exportEntries/);
  assert.doesNotMatch(editor, /Exportar los 3 artículos/);
});

test("session writes are serialized, deduplicated and retried after Firestore throttling", () => {
  const store = fs.readFileSync(path.resolve(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-session-store.js"), "utf8");

  assert.match(store, /const sessionSaveQueues = new Map\(\)/);
  assert.match(store, /const lastCommittedFingerprints = new Map\(\)/);
  assert.match(store, /"resource-exhausted"/);
  assert.match(store, /500 \* \(2 \*\* attempt\)/);
  assert.match(store, /lastCommittedFingerprints\.get\(session\.id\) === fingerprint/);
  assert.match(store, /LOCAL_STORAGE_PENDING_SAVE_KEY/);
  assert.match(store, /previous\.catch\(\(\) => undefined\)\.then\(\(\) => persistMarcieSession\(session\)\)/);
});

test("long-running Marcie research bypasses the Firebase Hosting 60-second proxy", () => {
  const root = path.resolve(__dirname, "../../public");
  const apiClient = fs.readFileSync(path.join(root, "js/api-client.js"), "utf8");
  const service = fs.readFileSync(path.join(root, "MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
  const firebaseConfig = fs.readFileSync(path.resolve(__dirname, "../../firebase.json"), "utf8");
  const functionsIndex = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");

  assert.match(apiClient, /DEFAULT_MARCIE_API_BASE = "https:\/\/us-central1-charly-brown\.cloudfunctions\.net\/geminiApi"/);
  assert.match(service, /startsWith\("\/api\/marcie\/"\)[\s\S]*?buildMarcieApiUrl\(path\)/);
  assert.match(firebaseConfig, /https:\/\/us-central1-charly-brown\.cloudfunctions\.net/);
  assert.match(functionsIndex, /exports\.geminiApi = onRequest\(\{[\s\S]*?timeoutSeconds: 120/);
});

test("the research modal uses the reusable shadcn-like editorial form", () => {
  const root = path.resolve(__dirname, "../../public/MarcieBlogEditor");
  const editor = fs.readFileSync(path.join(root, "js/editor-app.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "css/MarcieBlogEditor.css"), "utf8");

  assert.match(editor, /class="research-setup-card"/);
  assert.match(editor, /class="research-standard"/);
  assert.match(editor, /class="research-evidence-policy"/);
  assert.match(editor, /class="research-run-button"/);
  assert.doesNotMatch(editor, /rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50\/75 to-white/);
  assert.match(styles, /\.editorial-research-dialog \.editorial-phase-tab\.is-active/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*?\.research-run-button \{ width: 100%; \}/);
});
