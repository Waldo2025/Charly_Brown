const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Gemini proxy leaves enough time for large editorial generations", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /GEMINI_PROVIDER_TIMEOUT_MS = 105_000/);
  assert.match(source, /timeoutSeconds: 120/);
  assert.match(source, /gemini_upstream_timeout[\s\S]*?Retry-After", "2"/);
});

test("Gemini proxy recovers one transient provider 500 within the same HTTP request", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  const route = source.slice(source.indexOf('geminiApp.post("/api/gemini/generate"'), source.indexOf("\nregisterSupportGraphicUploadRoute(geminiApp)"));
  let handler;
  let calls = 0;
  const headers = {};
  const context = vm.createContext({
    Buffer,
    GEMINI_PROXY_PAYLOAD_LIMIT_BYTES: 100000,
    GEMINI_PROVIDER_TIMEOUT_MS: 105000,
    PIGPEN_CONTENT_TIMEOUT_MS: 480000,
    geminiApp: { post: (_path, callback) => { handler = callback; } },
    asyncRoute: (callback) => callback,
    resolveAuthContext: async () => {},
    createVertexClient: () => ({}),
    buildVertexGenerateRequest: (request) => request,
    generateGeminiContentWithDeadline: async () => {
      if (++calls === 1) throw Object.assign(new Error("Internal error encountered"), { status: 500 });
      return { text: "Artículo generado" };
    },
    setTimeout: (callback) => { callback(); return 1; }
  });
  vm.runInContext(route, context);
  const response = { set: (key, value) => { headers[key] = value; }, status: () => response, json: (value) => value };
  const result = await handler({ body: { model: "gemini-3.8-flash", payload: { contents: [] } } }, response);
  assert.equal(calls, 2);
  assert.equal(result.text, "Artículo generado");
  assert.equal(headers["X-Gemini-Internal-Retry"], "recovered");
});
