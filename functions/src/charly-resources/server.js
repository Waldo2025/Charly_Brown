const { instrumentMcpServer } = require('../mcp/runtime.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const z = require('zod/v4');
const { TYPES, LABELS } = require('./contracts.js');
const { generateResourceWithValidationRetry } = require('./generate.js');
const { runtime } = require('./runtime.js');
const TOOL = { annex: 'design_annex', cutout: 'design_cutout', worksheet: 'design_worksheet', 'video-script': 'design_video_script' };
function createSpecialistServer(type, dependencies = {}) {
  if (!TYPES.includes(type)) throw new Error('CHARLY_SPECIALIST inválido');
  const server = new McpServer({ name: `charly-${type}`, version: '1.0.0' });
  instrumentMcpServer(server, 'charly-specialist');
  server.registerTool(TOOL[type], {
    description: `Produce ${LABELS[type]} terminado y validado para una actividad. No modifica la sesión.`,
    inputSchema: {
      ownerUid: z.string().regex(/^[^/]{1,128}$/), sessionId: z.string().regex(/^[^/]{1,200}$/), targetUnitId: z.string().regex(/^[^/]{1,200}$/),
      idempotencyKey: z.string().min(16).max(128), model: z.string().max(100),
      unit: z.object({ meta: z.record(z.string(), z.unknown()), accepted: z.record(z.string(), z.unknown()).optional(), sya: z.unknown().optional(), reading: z.unknown().optional() }),
      activity: z.object({
        id: z.string().min(1),
        title: z.string().optional(),
        html: z.string().max(120000),
        section: z.string().optional(),
        category: z.string().optional(),
        subtopic: z.string().optional(),
        resourceSpecifications: z.array(z.record(z.string(), z.unknown())).min(1).max(4)
      }),
      brief: z.string().max(12000).optional(), code: z.string().max(120).optional(), memory: z.array(z.unknown()).max(8).optional()
    }
  }, async input => {
    try {
      const services = dependencies.generateJson ? dependencies : runtime(input.model);
      const generate = () => generateResourceWithValidationRetry(type, input, services);
      const artifact = await (services.cachedGeneration ? services.cachedGeneration(type, input, generate) : generate());
      return { isError: false, content: [{ type: 'text', text: JSON.stringify(artifact) }], structuredContent: artifact };
    } catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error.code || 'RESOURCE_FAILED', message: error.message, status: error.status || 500, retryAfterSeconds: error.retryAfterSeconds || 0 }) }] }; }
  });
  return server;
}
function createSpecialistApp(type) {
  const express = require('express'); const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_, res) => res.json({ ok: true, specialist: type }));
  app.post('/mcp', async (req, res) => {
    const server = createSpecialistServer(type);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (error) { if (!res.headersSent) res.status(500).json({ error: error.message }); }
  });
  return app;
}
module.exports = { createSpecialistServer, createSpecialistApp, TOOL };
