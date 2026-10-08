const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../public/MarcieBlogEditor/js/services/marcie-gemini-service.js"), "utf8");
const verifyCode = source.slice(source.indexOf("export async function verifyArticleEvidence"), source.indexOf("export async function refreshEditorialTrends")).replace("export async function", "async function");
const requestCode = source.slice(source.indexOf("async function authenticatedJsonRequest("), source.indexOf("function extractGeneratedImage("));

function verifier(fetch) {
  const context = vm.createContext({
    fetch,
    TypeError,
    AbortController,
    console: { warn() {} },
    setTimeout(callback, delay) { if (delay < 240_000) queueMicrotask(callback); return 1; },
    clearTimeout() {},
    getCurrentUser: () => ({ getIdToken: async () => "test-token" }),
    buildMarcieApiUrl: path => `https://example.test${path}`,
    sanitizeTopicTitle: value => value
  });
  vm.runInContext(`${requestCode}\n${verifyCode}\nglobalThis.verify = verifyArticleEvidence;`, context);
  return context.verify;
}

test("verification retries two temporary 503 responses and preserves the article payload", async () => {
  const article = { title: "Prueba", blocks: [{ id: "p1", text: "Texto conservado" }] };
  const bodies = [];
  const verify = verifier(async (_, options) => {
    bodies.push(JSON.parse(options.body));
    return bodies.length < 3
      ? { ok: false, status: 503, json: async () => ({ error: { code: "marcie_verification_timeout" } }) }
      : { ok: true, status: 200, json: async () => ({ article: { ...article, verification: { status: "verified" } } }) };
  });
  const result = await verify({ article, topic: "Prueba" });
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies.map(body => body.article.blocks[0].text), ["Texto conservado", "Texto conservado", "Texto conservado"]);
  assert.equal(result.verification.status, "verified");
});

test("verification does not retry a permanent client error", async () => {
  let requests = 0;
  const verify = verifier(async () => {
    requests++;
    return { ok: false, status: 400, json: async () => ({ error: { code: "invalid_article" } }) };
  });
  await assert.rejects(verify({ article: {} }), error => error.status === 400);
  assert.equal(requests, 1);
});
