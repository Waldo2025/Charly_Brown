const test = require('node:test');
const assert = require('node:assert/strict');
const { vertexFailureDiagnostic } = require('../src/vertex-diagnostics.js');

test('Preserves structured quota evidence without logging request payload or headers', () => {
  const error = { status: 429, response: { data: { error: {
    code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for model',
    details: [{ violations: [{ subject: 'requests_per_minute', description: 'Limit 10' }] }, { retryDelay: '12s' }]
  } }, config: { headers: { Authorization: 'secret' }, data: 'private prompt' } } };
  const entry = vertexFailureDiagnostic(error, { model: 'gemini-test', requestId: 'request-1' });
  assert.equal(entry.providerMessage, 'Quota exceeded for model');
  assert.equal(entry.quotaViolations[0].subject, 'requests_per_minute');
  assert.equal(entry.retryDelay, '12s');
  assert.equal(entry.model, 'gemini-test');
  assert.doesNotMatch(JSON.stringify(entry), /secret|private prompt/);
});

test('Generic exhaustion remains unclassified and messages are bounded and redacted', () => {
  const entry = vertexFailureDiagnostic(new Error(JSON.stringify({ error: {
    status: 'RESOURCE_EXHAUSTED', message: 'Resource exhausted. Bearer token123 https://x?key=abc&other=ok'
  } })));
  assert.deepEqual(entry.quotaViolations, []);
  assert.doesNotMatch(entry.providerMessage, /token123|key=abc/);
  assert.match(entry.providerMessage, /Resource exhausted/);
  assert.equal(vertexFailureDiagnostic(new Error('x'.repeat(5000))).providerMessage.length, 1500);
});
