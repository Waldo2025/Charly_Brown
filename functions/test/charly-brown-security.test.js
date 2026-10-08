const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveAccessContext,
  isPrivilegedRole
} = require("../src/common.js");
const {
  normalizeCharlyModel,
  sanitizeRichHtml,
  sanitizeRichContentRecord,
  withIdempotency
} = require("../src/charly-brown-mcp.js");

test("el sanitizador MCP elimina scripts, eventos, estilos y URLs peligrosas", () => {
  const html = sanitizeRichHtml([
    '<p onclick="alert(1)" style="background:url(https://evil.example/x)">Texto</p>',
    '<script>alert(1)</script>',
    '<a href="javascript:alert(1)">peligroso</a>',
    '<a href="https://example.com" target="_blank">seguro</a>',
    '<img src="javascript:alert(1)" onerror="alert(1)">'
  ].join(""));

  assert.doesNotMatch(html, /script|onclick|style=|onerror|javascript:/i);
  assert.match(html, /<p>Texto<\/p>/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("la normalización de contenido antiguo también sanea campos HTML", () => {
  const record = sanitizeRichContentRecord({
    html: '<div><svg onload="alert(1)"><path d="M0 0" /></svg><b>válido</b></div>',
    sections: { narrativeHtml: '<img src="javascript:alert(1)">' }
  });
  assert.doesNotMatch(record.html, /onload|javascript:/i);
  assert.match(record.html, /<b>válido<\/b>/);
  assert.doesNotMatch(record.sections.narrativeHtml, /javascript:/i);
});

test("los modelos del agente se limitan a la allowlist server-side", () => {
  assert.equal(normalizeCharlyModel("gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(normalizeCharlyModel("gemini-3.7-flash"), "gemini-3.8-flash");
  assert.equal(normalizeCharlyModel("projects/evil/locations/global/models/unknown"), "gemini-3.8-flash");
});

test("la autorización canónica distingue aprobación y alcance global", () => {
  assert.deepEqual(deriveAccessContext({ claims: { role: "editor" } }), {
    role: "editor", status: "", approvedUser: true, canManageGlobal: true
  });
  assert.deepEqual(deriveAccessContext({ profile: { status: "approved", role: "docente" } }), {
    role: "docente", status: "approved", approvedUser: true, canManageGlobal: false
  });
  assert.equal(isPrivilegedRole("desarrollo"), true);
  assert.equal(deriveAccessContext({ profile: { status: "pending", role: "viewer" } }).approvedUser, false);
});

test("la idempotencia reutiliza el resultado de una operación concurrente", async () => {
  let executions = 0;
  const operation = () => withIdempotency("security-test-key", async () => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, executions };
  });
  const [first, second] = await Promise.all([operation(), operation()]);
  assert.deepEqual(first, second);
  assert.equal(executions, 1);
});
