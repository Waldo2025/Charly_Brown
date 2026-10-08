const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { GoogleAuth } = require('google-auth-library');
const { TOOL } = require('./server.js');
const auth = new GoogleAuth();
const envKey = type => `CHARLY_MCP_${type.replace(/-/g, '_').toUpperCase()}_URL`;
function configured() { return Object.keys(TOOL).every(type => Boolean(process.env[envKey(type)])); }
async function callSpecialist(type, input, { signal } = {}) {
  const base = process.env[envKey(type)];
  if (!base || !/^https:\/\//.test(base)) throw Object.assign(new Error(`Falta ${envKey(type)}`), { status: 503 });
  const identity = await auth.getIdTokenClient(base.replace(/\/$/, ''));
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', base), {
    fetch: async (url, options) => {
      const headers = new Headers(options?.headers);
      const tokenHeaders = await identity.getRequestHeaders();
      headers.set('Authorization', tokenHeaders.get('authorization'));
      return fetch(url, { ...options, headers, signal: signal || options?.signal });
    }
  });
  const client = new Client({ name: 'charly-coordinator', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: TOOL[type], arguments: input }, undefined, { timeout: 240000, signal });
    const value = result.structuredContent || JSON.parse(result.content?.find(c => c.type === 'text')?.text || '{}');
    if (result.isError) throw Object.assign(new Error(value.message || 'El especialista falló.'), { status: value.status || 500, code: value.error, retryAfterSeconds: value.retryAfterSeconds || 0 });
    return value;
  } finally { await client.close(); }
}
module.exports = { callSpecialist, configured, envKey };
