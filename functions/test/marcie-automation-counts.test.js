const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const bibliography = require("../src/marcie-bibliography.js");

const root = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("automated progress steps use dynamic audience counts and rational labels", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  assert.match(editor, /function automationAudienceCount/);
  assert.match(editor, /function automationStageCaptions/);
  assert.match(editor, /function automationStageMessages/);
  assert.match(editor, /Enfoques y búsquedas/);
  assert.doesNotMatch(editor, /preparando cuatro enfoques/i);
  assert.doesNotMatch(editor, /Generar 4 propuestas/);
  assert.doesNotMatch(editor, /automation-agent-status-msg/);
  assert.doesNotMatch(editor, /automation-agent-progress-track/);
  assert.match(editor, /automation-agent-progress-meta/);
  assert.match(editor, /data-automation-percent/);
  assert.match(editor, /data-automation-stage-message/);
});

test("quality stage repairs and rechecks every audience without auto-approving the result", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const verifier = read("functions/src/marcie-editorial-research.js");
  assert.match(editor, /Corrigiendo redacción \$\{index \+ 1\}/);
  assert.match(editor, /verifyArticleEvidence\(\{ article, topic: session\.topic \|\| session\.title, additionalSearches: 1, autoRepair: true, signal: controller\.signal \}\)/);
  assert.ok(editor.indexOf("article = await verifyArticleEvidence({ article, topic: session.topic || session.title, additionalSearches: 1, autoRepair: true, signal: controller.signal })") < editor.indexOf("try { audit = await runSessionReview(session, article, audience.id); }"));
  assert.match(editor, /if \(article\.provisionalDraft\)[\s\S]*?additionalSearches: 0, autoRepair: false/);
  assert.match(editor, /runSessionReview\(session, article, audience\.id, changedIds\)/);
  assert.match(editor, /session\.status = "review_required";\s*session\.approvedAudiences = \[\];/);
  assert.doesNotMatch(editor, /Requiere tu criterio editorial/);
  assert.match(verifier, /verifyAndRepairArticleEvidenceServer/);
  assert.match(verifier, /autoRepairEvidence\(verified\)/);
  const candidates = editor.slice(editor.indexOf("function getSessionEvidenceCandidates"), editor.indexOf("const automaticEvidenceTimers"));
  assert.match(candidates, /session\.researchByAudience\?\.\[audience\]/);
  assert.doesNotMatch(candidates, /Object\.values\(session\.articlesByAudience/);
  assert.doesNotMatch(candidates, /session\.trends/);
});

test("editorial correction edits only existing blocks and preserves citation ownership", async () => {
  const service = read("public/MarcieBlogEditor/js/services/marcie-gemini-service.js");
  const start = service.indexOf("export async function correctArticleAuditWithGemini");
  const end = service.indexOf("export async function reviewArticleWithGemini", start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const context = vm.createContext({
    MarcieBibliography: bibliography,
    LATAM_ARTICLE_LANGUAGE_POLICY: "Español neutro latinoamericano.",
    getConfiguredGeminiModel: () => "test-model",
    parseMarcieJson: JSON.parse,
    generateWithGemini: async (options) => { calls.push(options); return JSON.stringify({ patches: [{ index: 1, text: "Cambio que debe ignorarse." }, { index: 0, text: "Redacción más clara [source-valid]." }] }); }
  });
  vm.runInContext(service.slice(start, end).replace(/^export /, ""), context);
  const source = { id: "source-valid", title: "Documento", url: "https://example.org/document", authors: ["Autora, Ana"], year: "2024", publisher: "Universidad" };
  const article = { title: "Artículo", revision: 1, blocks: [
    { id: "b1", type: "paragraph", text: "Texto confuso [source-valid].", sourceIds: [source.id] },
    { id: "b2", type: "paragraph", text: "Segundo bloque intacto." }
  ], sources: [source], approval: { approvedAt: "ayer" } };
  const controller = new AbortController();
  const result = await context.correctArticleAuditWithGemini({ article, issues: [{ message: "Claridad", suggestion: "Simplificar" }], maxChangedBlocks: 1, targetBlockId: "b1", signal: controller.signal });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal, controller.signal);
  assert.equal(result.blocks[0].text, "Redacción más clara [source-valid].");
  assert.equal(result.blocks[0].sourceIds[0], source.id);
  assert.equal(result.blocks[1].text, "Segundo bloque intacto.");
  assert.match(calls[0].prompt, /corrige únicamente el bloque con index 0/);
  assert.equal(result.revision, 2);
  assert.equal(result.approval, undefined);
  assert.equal(article.blocks[0].text, "Texto confuso [source-valid].");
  assert.equal(result.verification.status, "pending");
});

test("editorial correction has a deadline and aborts a stalled model request", async () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const section = editor.slice(editor.indexOf("async function withAutomationRequestDeadline"), editor.indexOf("async function cancelAutomatedSession"));
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout });
  vm.runInContext(section, context);
  let aborted = false;
  await assert.rejects(context.withAutomationRequestDeadline((signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
  }), 5), (error) => error.code === "marcie_correction_timeout");
  assert.equal(aborted, true);
});

test("automation stops on a Firestore version conflict even during optional progress saves", async () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const section = editor.slice(editor.indexOf("async function saveAutomationStage"), editor.indexOf("const AUTOMATED_COVER_GAP_MS"));
  const context = vm.createContext({ automationCancellations: new Map(), updateAutomatedSessionProgress() {}, rememberAutomation() {}, setSyncStatus() {},
    saveMarcieSession: async () => { throw Object.assign(new Error("Conflicto"), { code: "marcie_save_conflict" }); }, console });
  vm.runInContext(section, context);
  await assert.rejects(context.saveAutomationStage({ id: "session", automation: {} }, "review", 50, "Revisando"), (error) => error.code === "marcie_save_conflict");
});

test("a single audit issue never calls the full article drafter", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const start = editor.indexOf('panel.querySelectorAll("[data-fix-audit-issue]")');
  const end = editor.indexOf('panel.querySelector("[data-run-article-audit]")', start);
  const handler = editor.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /correctArticleAuditWithGemini\(\{/);
  assert.match(handler, /issues: \[\{ \.\.\.issue, suggestion: recommendation \}\]/);
  assert.match(handler, /maxChangedBlocks: 1/);
  assert.doesNotMatch(handler, /draftArticleForMode\(/);
  assert.match(editor, /async function runAutomaticEvidenceVerification\(session, \{ notify = false, additionalSearches = 0, autoRepair = false \}/);
});

test("evidence verification takes sources only from the selected audience", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const start = editor.indexOf("function getSessionEvidenceCandidates");
  const end = editor.indexOf("function retainVerifiedAudienceSources", start);
  const context = vm.createContext({ sanitizeTrustedSources: (sources) => sources });
  vm.runInContext(editor.slice(start, end), context);
  const candidates = context.getSessionEvidenceCandidates({
    audience: "parents",
    article: { sources: [{ id: "source-parents" }] },
    articlesByAudience: {
      parents: { sources: [{ id: "source-parents" }] },
      educators: { sources: [{ id: "source-educators" }] }
    },
    researchByAudience: {
      parents: { sources: [{ id: "dossier-parents" }] },
      educators: { sources: [{ id: "dossier-educators" }] }
    },
    trends: [{ sources: [{ id: "source-trend" }] }]
  });
  assert.deepEqual(Array.from(candidates, (source) => source.id), ["source-parents", "dossier-parents"]);
});

test("proposal prompt receives selected audiences instead of requesting four by default", () => {
  const gemini = read("public/MarcieBlogEditor/js/services/marcie-gemini-service.js");
  const mode = read("public/MarcieBlogEditor/js/services/marcie-mode-service.js");
  assert.match(gemini, /normalizeProposalAudiences/);
  assert.match(gemini, /EXACTAMENTE \$\{proposalCount\}/);
  assert.match(gemini, /maxOutputTokens: Math\.max\(1200, requestedIds\.length \* 850\)/);
  assert.doesNotMatch(gemini, /EXACTAMENTE cuatro propuestas/i);
  assert.match(mode, /audiences: requested/);
});

test("research evidence retries transient service failures but not research deadline timeouts", () => {
  const gemini = read("public/MarcieBlogEditor/js/services/marcie-gemini-service.js");
  assert.match(gemini, /authenticatedJsonRequestWithRetry\(globalResearch \? "\/api\/marcie\/evidence\/research-global" : "\/api\/marcie\/evidence\/research"/);
  assert.match(gemini, /retryStatuses: \[503, 504\]/);
  assert.match(gemini, /skipRetryCodes: \["marcie_research_timeout"\]/);
  assert.match(gemini, /Reintentando solicitud editorial transitoria/);
});

test("research progress persists global evidence before audience selection", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const stepStart = editor.indexOf("onResearchProgress: async ({ proposal, dossier, index, total, phase })");
  assert.notEqual(stepStart, -1);
  const stepEnd = editor.indexOf("proposalFallbackUsed", stepStart);
  const handler = editor.slice(stepStart, stepEnd);
  assert.match(handler, /if \(dossier\)/);
  assert.match(handler, /saveAutomationStage/);
  assert.match(handler, /updateAutomatedSessionProgress/);
});

test("temporary Gemini 500 INTERNAL errors are eligible for model fallback", () => {
  const client = read("public/charly-brown/gemini-client.js");
  assert.match(client, /error\?\.status === 500/);
  assert.match(client, /code === "internal"/);
});

test("research cache compacts dossiers and prunes aggressively after quota errors", () => {
  const cache = read("public/MarcieBlogEditor/js/services/marcie-research-cache.js");
  assert.match(cache, /function compactDossierForCache/);
  assert.match(cache, /MAX_CACHE_SOURCES/);
  assert.match(cache, /pruneOldResearchCache\(\{ aggressive: true \}\)/);
});

test("automation recovery preserves completed articles and retries a failed fetch once", async () => {
  const recovery = await import(`data:text/javascript,${encodeURIComponent(read("public/MarcieBlogEditor/js/services/marcie-automation-recovery.js"))}`);
  assert.equal(recovery.hasCompleteArticle({ blocks: [] }), false);
  assert.equal(recovery.hasCompleteArticle({ blocks: [{ id: "b1", text: "Listo" }] }), true);
  assert.equal(recovery.hasCompleteArticle({ blocks: [{ id: "b1" }] }), false);
  assert.equal(recovery.hasCompleteArticle({ blocks: [{ id: "b1", items: ["Punto verificado"] }] }), true);
  assert.equal(recovery.hasProposalsForAudiences([{ audience: "parents" }, { audience: "educators" }], ["parents", "educators"]), true);
  assert.equal(recovery.hasProposalsForAudiences([{ audience: "parents" }], ["parents", "educators"]), false);

  let attempts = 0;
  const article = await recovery.retryTransientFetch(async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("Failed to fetch");
    return { audience: "educators", blocks: [{ id: "b1", text: "Contenido" }] };
  }, { wait: async () => {} });
  assert.equal(attempts, 2);
  assert.equal(article.audience, "educators");

  attempts = 0;
  await assert.rejects(recovery.retryTransientFetch(async () => {
    attempts += 1;
    throw Object.assign(new Error("Gemini HTTP 500"), { status: 500 });
  }, { wait: async () => {} }), /Gemini HTTP 500/);
  assert.equal(attempts, 1);
});

test("failed automated production can resume only missing audiences", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  assert.match(editor, /hasProposalsForAudiences\(session\.proposals, selectedAudienceIds\)/);
  assert.match(editor, /if \(hasCompleteArticle\(articlesByAudience\[audience\.id\]\)\)/);
  assert.match(editor, /data-automation-resume/);
  assert.match(editor, /session\.sessionConfiguration\?\.specifications \|\| session\.specifications/);
  assert.match(editor, /session\.article = session\.articlesByAudience\[completed\.id\]/);
  assert.match(editor, /Artículo \$\{index \+ 1\}\/\$\{audiences\.length\} listo \(\$\{audience\.label\}\)`, stageDonePct, true\)/);
});

test("una pausa de investigación no se presenta como producción de artículos terminada", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  assert.match(editor, /session\.status = "researching";/);
  assert.match(editor, /codeValue === "marcie_research_incomplete"/);
  assert.match(editor, /todavía no se redactaron los artículos/);
  assert.match(editor, /Reanudar investigación y artículos/);
  assert.match(editor, /session\.status = "drafting";/);
  assert.match(editor, /\["failed", "completed", "completed_with_findings", "cancelled"\]\.includes/);
  assert.match(editor, /automationProgressAnimationRun/);
});

test("la automatización terminada ofrece regeneración limpia y redacción con investigación reutilizable", () => {
  const editor = read("public/MarcieBlogEditor/js/editor-app.js");
  const cache = read("public/MarcieBlogEditor/js/services/marcie-research-cache.js");
  assert.match(editor, /data-automation-regenerate-clean/);
  assert.match(editor, /data-automation-redraft/);
  assert.match(editor, /hasReusableAutomationResearch/);
  assert.match(editor, /const canRegenerate = canRegenerateAutomationSession\(session\)/);
  assert.match(editor, /reuseResearch = false/);
  assert.match(editor, /Fuentes verificadas reutilizadas/);
  assert.match(cache, /supportSummary: trimText\(source\.supportSummary/);
  assert.match(cache, /supports: Array\.isArray\(source\.supports\)/);
});
