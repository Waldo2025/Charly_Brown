// Generated from functions/src/mcp/runtime.js; do not edit.
// Shared MCP instrumentation. Never log tool arguments, results or credentials.
const { performance } = require('node:perf_hooks');
function instrumentMcpServer(server, serverName) {
  if (server.__costInstrumentation) return server;
  const register = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) => register(name, config, async (...args) => {
    const started = performance.now();
    let success = false;
    try {
      const result = await handler(...args);
      success = result?.isError !== true;
      return result;
    } finally {
      console.info(JSON.stringify({ severity: 'INFO', event: 'mcp_tool_execution',
        server: serverName, tool: name, success,
        durationMs: Math.round(performance.now() - started),
        // Process-wide RSS; this is not memory attributed exclusively to this tool.
        processRssBytes: process.memoryUsage().rss }));
    }
  });
  Object.defineProperty(server, '__costInstrumentation', { value: true });
  return server;
}
module.exports = { instrumentMcpServer };
