const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const service = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
const json = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/services/marcie-json.js"), "utf8");
const reviewCode = service.slice(service.indexOf("export async function reviewArticleWithGemini"), service.indexOf("function parseJsonSafe"));

function reviewHarness(responses) {
  const calls = [];
  const context = vm.createContext({
    getConfiguredGeminiModel: () => "gemini-3.8-flash",
    getActiveMarciePrompt: () => "",
    generateWithGemini: async (request) => {
      calls.push(request);
      const response = responses[calls.length - 1];
      if (response instanceof Error) throw response;
      return response;
    },
    console: { log() {}, warn() {} }
  });
  vm.runInContext(json.replace(/\bexport /g, ""), context);
  vm.runInContext(reviewCode.replace(/\bexport /g, ""), context);
  return { review: context.reviewArticleWithGemini, calls };
}

const validReview = JSON.stringify({ readabilityScore: 88, summary: "Buen artículo", issues: [], seoRecommendations: [] });

test("editorial review accepts valid JSON in one bounded request", async () => {
  const { review, calls } = reviewHarness([validReview]);
  const result = await review({ article: { title: "Prueba", blocks: [] } });
  assert.equal(result.readabilityScore, 88);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fallback, false);
  assert.equal(calls[0].thinkingLevel, "LOW");
  assert.equal(calls[0].payload.generationConfig.maxOutputTokens, 4096);
});

test("editorial review retries malformed output once with a distinct model", async () => {
  const { review, calls } = reviewHarness([")*: Mención abrupta de acrónimos", validReview]);
  const result = await review({ article: { title: "Prueba", blocks: [] } });
  assert.equal(result.readabilityScore, 88);
  assert.deepEqual(calls.map((call) => call.model), ["gemini-3.8-flash", "gemini-3.5-flash"]);
});

test("two malformed audits preserve the article and require review", async () => {
  const { review, calls } = reviewHarness(["texto libre", "otro texto libre", "tercer texto libre"]);
  const result = await review({ article: { title: "Prueba", blocks: [] } });
  assert.equal(calls.length, 3);
  assert.equal(result.reviewStatus, "pending");
  assert.equal(result.readabilityScore, null);
  assert.equal(result.issues.length, 1);
});

test("authentication failures are not disguised as pending reviews", async () => {
  const failure = Object.assign(new Error("auth_required"), { status: 401 });
  const { review, calls } = reviewHarness([failure]);
  await assert.rejects(review({ article: { title: "Prueba", blocks: [] } }), /auth_required/);
  assert.equal(calls.length, 1);
});

test("a focused review sends only corrected blocks", async () => {
  const { review, calls } = reviewHarness([validReview]);
  await review({ article: { title: "Prueba", blocks: [{ id: "b1", text: "Texto corregido" }, { id: "b2", text: "Texto intacto" }] }, blockIds: ["b1"] });
  assert.match(calls[0].prompt, /Texto corregido/);
  assert.doesNotMatch(calls[0].prompt, /Texto intacto/);
});

test("a 429 triggers the next bounded review model", async () => {
  const quota = Object.assign(new Error("Too Many Requests"), { status: 429 });
  const { review, calls } = reviewHarness([quota, validReview]);
  const result = await review({ article: { title: "Prueba", blocks: [] } });
  assert.equal(result.readabilityScore, 88);
  assert.deepEqual(calls.map((call) => call.model), ["gemini-3.8-flash", "gemini-3.5-flash"]);
});

test("resume button is retained across awaits and pending audits cannot be approved", () => {
  const editor = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/editor-app.js"), "utf8");
  const pipeline = fs.readFileSync(path.join(root, "public/MarcieBlogEditor/js/components/pipeline-stepper.js"), "utf8");
  assert.match(editor, /const resumeButton = event\.currentTarget;[\s\S]*resumeButton\.disabled = false/);
  assert.match(pipeline, /if \(session\.audit\?\.reviewStatus === "pending"\)/);
});
