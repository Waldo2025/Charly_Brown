import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import diagnostics from '../functions/src/vertex-diagnostics.js';
import { vertexPolicy, vertexMetric } from '../scripts/vertex-alert-config.mjs';

test('Alerts require three failures per service, include warning severity, and exclude unrelated HTTP 429', () => {
  const c = vertexPolicy.conditions[0].conditionThreshold;
  for (const failures of [0, 1, 2]) assert.equal(failures > c.thresholdValue, false);
  assert.equal(3 > c.thresholdValue, true);
  assert.equal(c.aggregations[0].alignmentPeriod, '300s');
  assert.equal(vertexPolicy.severity, 'WARNING');
  assert.doesNotMatch(vertexMetric.filter, /httpRequest.status/);
  assert.match(vertexMetric.filter, /vertex_resource_exhausted/);
});

test('A failed request logs once; successful image fallback does not count as a failed request', async () => {
  const source = readFileSync(new URL('../functions/src/index.js', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf('geminiApp.post("/api/gemini/generate"'), source.indexOf('\nregisterSupportGraphicUploadRoute(geminiApp)'));
  for (const fallbackSucceeds of [true, false]) {
    let handler, calls = 0;
    const logs = [];
    const ctx = vm.createContext({ Buffer, GEMINI_PROXY_PAYLOAD_LIMIT_BYTES: 100000,
      GEMINI_PROVIDER_TIMEOUT_MS: 105000, PIGPEN_CONTENT_TIMEOUT_MS: 480000,
      vertexFailureDiagnostic: diagnostics.vertexFailureDiagnostic,
      console: { warn: value => logs.push(JSON.parse(value)) },
      geminiApp: { post: (_path, fn) => { handler = fn; } }, asyncRoute: x => x,
      resolveAuthContext: async () => {}, createVertexClient: () => ({}),
      buildVertexGenerateRequest: x => x, isVertexInvalidArgument: () => false,
      generateGeminiContentWithDeadline: async () => {
        calls++;
        if (calls === 2 && fallbackSucceeds) return { candidates: [] };
        throw Object.assign(Error('Resource exhausted ' + calls), { status: 429 });
      }
    });
    vm.runInContext(route, ctx);
    let status;
    const res = { set: () => {}, status: value => { status = value; return res; }, json: x => x };
    await handler({ body: { model: 'gemini-3.1-flash-image' }, requestId: 'test' }, res);
    assert.equal(calls, 2);
    assert.equal(logs.length, fallbackSucceeds ? 0 : 1);
    assert.equal(status, fallbackSucceeds ? 200 : 429);
    if (!fallbackSucceeds) {
      assert.equal(logs[0].model, 'gemini-3-pro-image');
      assert.equal(logs[0].providerMessage, 'Resource exhausted 2');
    }
  }
});
