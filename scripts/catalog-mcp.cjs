// Register schemas only; do not execute tools or call providers.
const fs=require('node:fs');
const context={uid:'catalog',db:{},generateText:async()=>''};
const servers={
  Charly:require('../functions/src/charly-brown-mcp.js').createServer(context),
  Marcie:require('../functions/src/marcie-editorial-agent.js').createMarcieEditorialMcpServer(context),
  Science:require('../functions/src/science-mcp.js').createScienceMcpServer({coordinator:{},auth:{uid:'catalog'}}),
  Sally:require('../backend/sally/sally-mcp.js').createSallyMcpServer({actor:{uid:'catalog'},sessions:new Map(),authorizeSession:async()=>''})
};
for(const type of ['annex','cutout','worksheet','video-script'])servers['Charly '+type]=require('../functions/src/charly-resources/server.js').createSpecialistServer(type);
const tools=Object.fromEntries(Object.entries(servers).map(([name,server])=>[name,Object.keys(server._registeredTools)]));
tools.PigPen=['plan_objective','generate_escape_room','get_generation','cancel_generation','resume_generation','retry_failed'];
fs.writeFileSync('docs/mcp-tools.json',JSON.stringify({schemaVersion:1,tools},null,2)+'\n');
for(const server of Object.values(servers))void server.close();
console.log(Object.entries(tools).map(([name,list])=>`${name}: ${list.length} herramientas`).join('\n'));
