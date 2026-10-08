const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runtime,
  isRetryableTextError,
  textModelChain
} = require('../src/charly-resources/runtime.js');

const jsonResponse = (data) => ({
  text: JSON.stringify(data),
  candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }]
});

test('isRetryableTextError detects 500, 503, 429 and internal error strings', () => {
  assert.equal(isRetryableTextError({ status: 500 }), true);
  assert.equal(isRetryableTextError({ status: 503 }), true);
  assert.equal(isRetryableTextError({ status: 429 }), true);
  assert.equal(isRetryableTextError({ message: '{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}' }), true);
  assert.equal(isRetryableTextError({ message: 'Resource exhausted' }), true);
  assert.equal(isRetryableTextError({ status: 400, message: 'Invalid argument' }), false);
  assert.equal(isRetryableTextError({ status: 422, message: 'Unprocessable Entity' }), false);
});

test('textModelChain includes primary model and fallbacks', () => {
  const chain = textModelChain('gemini-3.8-flash');
  assert.ok(chain.includes('gemini-3.8-flash'));
  assert.ok(chain.length >= 3);
  assert.equal(chain[0], 'gemini-3.8-flash');
});

test('generateJson transparently recovers from transient 500 internal error on first attempt', async () => {
  let callCount = 0;
  const client = {
    models: {
      generateContent: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw Object.assign(new Error('{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}'), { status: 500 });
        }
        return jsonResponse({ title: 'Nota del maestro', html: '<p>Guía de mediación docente.</p>' });
      }
    }
  };
  const rt = runtime('gemini-3.8-flash', { client });
  const result = await rt.generateJson('Crea una nota');
  assert.equal(result.title, 'Nota del maestro');
  assert.equal(callCount, 2);
});

test('generateJson falls back to next model when primary model persistently fails with 500', async () => {
  const modelsCalled = [];
  const client = {
    models: {
      generateContent: async (request) => {
        modelsCalled.push(request.model);
        if (request.model === 'gemini-3.8-flash') {
          throw Object.assign(new Error('Internal error encountered.'), { status: 500 });
        }
        return jsonResponse({ title: 'Nota recuperada', html: '<p>Contenido desde modelo fallback.</p>' });
      }
    }
  };
  const rt = runtime('gemini-3.8-flash', { client });
  const result = await rt.generateJson('Crea una nota');
  assert.equal(result.title, 'Nota recuperada');
  assert.ok(modelsCalled.length >= 2);
  assert.equal(modelsCalled[0], 'gemini-3.8-flash');
  assert.notEqual(modelsCalled.at(-1), 'gemini-3.8-flash');
});
