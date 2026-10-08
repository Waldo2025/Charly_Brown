import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const url = process.argv[process.argv.indexOf('--url') + 1];
if (!process.argv.includes('--url') || !url || !process.env.SCIENCE_MCP_ACCESS_TOKEN) throw Error('Uso: SCIENCE_MCP_ACCESS_TOKEN=<token> node scripts/smoke-science-mcp.mjs --url https://host/api/science-activities/mcp');
const client = new Client({ name: 'science-reference-smoke', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${process.env.SCIENCE_MCP_ACCESS_TOKEN}` } } }));
  const tools = await client.listTools();
  for (const name of ['plan_activity', 'approve_plan', 'start_generation', 'get_generation', 'cancel_generation', 'retry_task', 'regenerate_asset', 'validate_activity']) if (!tools.tools.some(tool => tool.name === name)) throw Error(`Falta herramienta: ${name}`);
  const result = await client.callTool({ name: 'list_generations', arguments: {} });
  if (result.isError) throw Error('La consulta autenticada falló.');
  console.log(JSON.stringify({ connected: true, tools: tools.tools.map(tool => tool.name), authenticatedRead: true }));
} finally { await client.close(); }
