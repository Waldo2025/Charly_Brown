// Read-only provider smoke: one tool request and its response; no session/assets writes.
const { createVertexClient } = require('../functions/src/vertex.js');
const { DEFAULT_CHARLY_MODEL } = require('../functions/src/charly-brown-mcp.js');
(async () => {
  const client = createVertexClient({ location: 'global' });
  const model = process.env.CHARLY_SMOKE_MODEL || DEFAULT_CHARLY_MODEL;
  const tools = [{ functionDeclarations: [{ name: 'validate_scene', description: 'Checks the supplied scene title.', parametersJsonSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false } }] }];
  const contents = [{ role: 'user', parts: [{ text: 'Call validate_scene with title Jardín.' }] }];
  const first = await client.models.generateContent({ model, contents, config: { tools, toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['validate_scene'] } }, maxOutputTokens: 512 } });
  const content = first.candidates?.[0]?.content;
  const calls = content?.parts?.filter(p => p.functionCall).map(p => p.functionCall) || [];
  if (!calls.length) throw new Error('Vertex did not return the required function call.');
  contents.push(content, { role: 'user', parts: calls.map(call => ({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: { valid: true } } })) });
  contents.at(-1).parts.push({ text: 'Continúa con el siguiente recurso.' });
  const second = await client.models.generateContent({ model, contents, config: { tools, toolConfig: { functionCallingConfig: { mode: 'NONE' } }, maxOutputTokens: 512 } });
  if (!second.candidates?.[0]?.content?.parts?.some(p => p.text)) throw new Error('Vertex did not complete the tool round trip.');
  console.log(JSON.stringify({ ok: true, model, calls: calls.length, preservedModelParts: content.parts.length }));
})().catch(error => { console.error(String(error.message || error)); process.exitCode = 1; });
