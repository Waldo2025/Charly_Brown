const { instrumentMcpServer } = require('./mcp/runtime.js');
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {InMemoryTransport}=require('@modelcontextprotocol/sdk/inMemory.js');
const z=require('zod/v4');
const {resolveAuthContext}=require('./common.js');
const {fail}=require('./science-production-policy.js');
const output=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
async function invokeScienceAgent({stage,subject='',execute}){
  if(!['planner','pedagogy','questions','simulator','candidate','image','validate','art-direction'].includes(stage))throw fail('Rol de agente inválido.');
  const domain=['physics','chemistry','biology','math'].includes(subject)?`-${subject}`:'';
  const server=new McpServer({name:`science-${stage}${domain}`,version:'1.0.0'});
  instrumentMcpServer(server, 'science-activities');
  let executionError;
  // Each internal agent receives only its stage capability and immutable run context.
  server.registerTool(`execute_${stage}`,{description:`Ejecuta el agente científico ${stage} dentro de su tarea autorizada.`,inputSchema:{}},async()=>{try{return output(await execute());}catch(error){executionError=error;throw error;}});
  const client=new Client({name:`science-${stage}${domain}-agent`,version:'1.0.0'}),[a,b]=InMemoryTransport.createLinkedPair();
  try{await server.connect(a);await client.connect(b);const result=await client.callTool({name:`execute_${stage}`,arguments:{}},undefined,{timeout:210000});if(executionError)throw executionError;if(result.isError)throw fail(result.content?.find(p=>p.type==='text')?.text||'Agente MCP falló.',422);return JSON.parse(result.content.find(p=>p.type==='text').text);}
  finally{await client.close();await server.close();}
}
function createScienceMcpServer({coordinator,auth}){
  const server=new McpServer({name:'science-activities',version:'1.0.0'});
  instrumentMcpServer(server, 'science-activities');
  const add=(name,scope,schema,handler)=>server.registerTool(name,{description:name.replaceAll('_',' '),inputSchema:schema},async args=>{
    if(auth.external&&!auth.scopes?.includes(scope))throw fail(`Se requiere alcance ${scope}.`,403);
    return output(await handler(args));
  });
  add('list_generations','science:read',{},async()=>({runs:await coordinator.store.list(auth.uid)}));
  add('list_science_topics','science:read',{subject:z.enum(['physics','chemistry','biology','math']).optional()},async a=>({topics:await require('./science-production-templates.js').listScienceTopics(a.subject)}));
  add('get_activity_template','science:read',{subject:z.enum(['physics','chemistry','biology','math']),topic:z.string().min(1).max(300)},async a=>({activity:await require('./science-production-templates.js').getActivityTemplate(a.subject,a.topic)}));
  add('get_generation','science:read',{runId:z.string().uuid()},async a=>({run:await coordinator.status(auth.uid,a.runId)}));
  add('plan_activity','science:plan',{config:z.record(z.string(),z.unknown()),activity:z.record(z.string(),z.unknown()).optional()},async a=>({run:await coordinator.plan(auth.uid,a.config,a.activity)}));
  add('revise_plan','science:plan',{runId:z.string().uuid(),revision:z.number().int().positive(),changes:z.union([z.string().max(12000),z.record(z.string(),z.unknown())])},async a=>({run:await coordinator.control(auth.uid,a.runId,'revise',a)}));
  add('approve_plan','science:plan',{runId:z.string().uuid(),revision:z.number().int().positive()},async a=>({run:await coordinator.control(auth.uid,a.runId,'approve',a)}));
  add('start_generation','science:execute',{runId:z.string().uuid(),revision:z.number().int().positive()},async a=>({run:await coordinator.control(auth.uid,a.runId,'start',a)}));
  add('cancel_generation','science:execute',{runId:z.string().uuid()},async a=>({run:await coordinator.control(auth.uid,a.runId,'cancel',a)}));
  add('retry_task','science:execute',{runId:z.string().uuid(),taskId:z.string().max(80)},async a=>({run:await coordinator.control(auth.uid,a.runId,'retry',a)}));
  add('regenerate_asset','science:execute',{runId:z.string().uuid(),taskId:z.string().max(80),questionIndex:z.number().int().nonnegative().optional()},async a=>({run:await coordinator.control(auth.uid,a.runId,'regenerate_asset',a)}));
  add('validate_activity','science:execute',{runId:z.string().uuid()},async a=>({run:await coordinator.control(auth.uid,a.runId,'validate_activity',a)}));
  return server;
}
function registerScienceMcpRoutes(app,dependencies={}){
  const {createScienceProductionCoordinator}=require('./science-production-coordinator.js');
  const coordinator=dependencies.coordinator||createScienceProductionCoordinator(dependencies),authenticate=dependencies.resolveAuthContext||resolveAuthContext;
  app.all('/api/science-activities/mcp',async(req,res)=>{
    let server,transport;
    try{
      const auth=await authenticate(req);if(!auth?.uid)throw fail('auth_required',401);
      if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
      server=createScienceMcpServer({coordinator,auth});transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
      res.on('close',()=>{void transport?.close();void server?.close();});
      await server.connect(transport);await transport.handleRequest(req,res,req.body);
    }catch(error){if(!res.headersSent){if(Number(error.status)===401&&dependencies.resourceMetadataUrl)res.set('WWW-Authenticate',`Bearer resource_metadata="${dependencies.resourceMetadataUrl}"`);res.status(Number(error.status)||500).json({error:String(error.message||'mcp_error')});}}
  });
}
module.exports={invokeScienceAgent,createScienceMcpServer,registerScienceMcpRoutes};
