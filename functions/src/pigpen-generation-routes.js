const { instrumentMcpServer } = require('./mcp/runtime.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { asyncRoute, resolveAuthContext } = require('./common.js');
const { createCoordinator } = require('./pigpen-generation-coordinator.js');
function registerGenerationRoutes(app, { coordinator = createCoordinator(), authenticate = resolveAuthContext } = {}) {
  app.get('/api/pigpen/generation/capabilities', asyncRoute(async(req,res)=>{await authenticate(req);res.json({enabled:true,version:1,rooms:4,images:2,persistent:true});}));
  app.post('/api/pigpen/generation',asyncRoute(async(req,res)=>{
    const {uid}=await authenticate(req);
    res.status(202).json(await coordinator.start(uid,{...req.body,idempotencyKey:req.headers['idempotency-key']||req.body?.idempotencyKey}));
  }));
  app.get('/api/pigpen/generation/active',asyncRoute(async(req,res)=>{
    const {uid}=await authenticate(req);
    const {data}=await coordinator.store.owned(uid,req.query.sessionId,req.query.topicId);
    res.json(data.generation?.runId?await coordinator.status(uid,data.generation.runId):{status:'idle'});
  }));
  app.get('/api/pigpen/generation/:id',asyncRoute(async(req,res)=>res.json(await coordinator.status((await authenticate(req)).uid,req.params.id))));
  app.post('/api/pigpen/generation/:id/:action',asyncRoute(async(req,res)=>res.json(await coordinator.control((await authenticate(req)).uid,req.params.id,req.params.action))));
  app.all('/api/pigpen/mcp',asyncRoute(async(req,res)=>{
    const {uid}=await authenticate(req);
    if(req.method!=='POST')return res.status(405).end();
    const server=new McpServer({name:'pigpen-generation',version:'1.0.0'});
  instrumentMcpServer(server, 'pigpen-generation');
    const startSchema={sessionId:z.string(),topicId:z.string(),config:z.record(z.string(),z.unknown()),idempotencyKey:z.string(),planRunId:z.string().optional(),reuseBlueprint:z.boolean().optional()};
    const output=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
    server.registerTool('plan_objective',{description:'Crear el objetivo y plan maestro rápido de un escape room.',inputSchema:startSchema},async args=>output(await coordinator.start(uid,{...args,mode:'objective'})));
    server.registerTool('generate_escape_room',{description:'Generar hasta cuatro salas en paralelo, imágenes y revisión multimodal.',inputSchema:startSchema},async args=>output(await coordinator.start(uid,{...args,mode:'full'})));
    server.registerTool('get_generation',{description:'Consultar avance y resultado persistente.',inputSchema:{runId:z.string()}},async({runId})=>output(await coordinator.status(uid,runId)));
    for(const [name,action]of [['cancel_generation','cancel'],['resume_generation','resume'],['retry_failed','retry']])server.registerTool(name,{description:`${action}: conservar tareas terminadas.`,inputSchema:{runId:z.string()}},async({runId})=>output(await coordinator.control(uid,runId,action)));
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    res.on('close',()=>{void transport.close();void server.close();});
    await server.connect(transport);await transport.handleRequest(req,res,req.body);
  }));
}
module.exports={registerGenerationRoutes};
