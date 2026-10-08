const test=require("node:test");
const assert=require("node:assert/strict");
const {Client}=require("@modelcontextprotocol/sdk/client/index.js");
const {InMemoryTransport}=require("@modelcontextprotocol/sdk/inMemory.js");
const {createSallyMcpServer}=require("../sally-mcp.js");
const {prepareUserImport}=require("../user-import.js");
const {ALLOWED_ACTIONS}=require("../computer-use.js");
const {createMoodleApi}=require("../moodle-api.js");

async function localMcp(controller){
  const sessions=new Map([["alice:project",{controller,actor:{uid:"alice"},touched:Date.now()}]]);
  const server=createSallyMcpServer({actor:{uid:"alice",idToken:"token"},sessions,authorizeSession:async({params})=>"alice:"+params.id});
  const client=new Client({name:"test",version:"1"});const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();await server.connect(serverTransport);await client.connect(clientTransport);return {client,server,close:async()=>{await client.close();await server.close();}};
}
function value(result){return result.structuredContent||JSON.parse(result.content[0].text);}

test("MCP prepares immutable write batches and executes only an explicitly confirmed hash",async()=>{
  let writes=0,approved=0;
  const mcp=await localMcp({availability:async()=>({automationAvailable:true}),approve:async()=>{approved++;},execute:async()=>{writes++;return {state:"completed",results:[]};}});
  try{
    const tools=await mcp.client.listTools();assert(tools.tools.some(tool=>tool.name==="moodle_prepare_course_batch"));assert(tools.tools.some(tool=>tool.name==="moodle_execute_approved_batch"));
    const prepared=value(await mcp.client.callTool({name:"moodle_prepare_course_batch",arguments:{sessionId:"project",targetUrl:"https://aprende.asc.education/course/view.php?id=1",action:"create",course:{fullname:"Curso de prueba",shortname:"PRUEBA"}}}));
    assert.equal(prepared.state,"awaiting_confirmation");assert.equal(writes,0);assert.equal(approved,0);
    const denied=await mcp.client.callTool({name:"moodle_execute_approved_batch",arguments:{sessionId:"project",batchId:prepared.batchId,batchHash:"0".repeat(64),confirm:true}});assert.equal(denied.isError,true);assert.equal(writes,0);
    const completed=value(await mcp.client.callTool({name:"moodle_execute_approved_batch",arguments:{sessionId:"project",batchId:prepared.batchId,batchHash:prepared.batchHash,confirm:true}}));assert.equal(completed.state,"completed");assert.equal(approved,1);assert.equal(writes,1);
  }finally{await mcp.close();}
});

test("Generic Moodle workflows stay semantic, same-origin and require reinforced confirmation for high risk",async()=>{
  let writes=0;
  const mcp=await localMcp({availability:async()=>({automationAvailable:true}),approve:async()=>({}),execute:async()=>{writes++;return {state:"completed",results:[]};}});
  try{
    const prepared=value(await mcp.client.callTool({name:"moodle_prepare_browser_workflow",arguments:{sessionId:"project",targetUrl:"https://aprende.asc.education/admin/user.php",intent:"Eliminar usuario de prueba",risk:"high",steps:[{action:"click",locator:{by:"role",role:"button",name:"Eliminar usuario"}}]}}));
    assert.equal(prepared.risk,"high");assert.match(prepared.confirmationText,/CONFIRMAR:/);assert.equal(writes,0);
    const denied=await mcp.client.callTool({name:"moodle_execute_approved_batch",arguments:{sessionId:"project",batchId:prepared.batchId,batchHash:prepared.batchHash,confirm:true}});assert.equal(denied.isError,true);assert.equal(writes,0);
    const completed=value(await mcp.client.callTool({name:"moodle_execute_approved_batch",arguments:{sessionId:"project",batchId:prepared.batchId,batchHash:prepared.batchHash,confirm:true,confirmationText:prepared.confirmationText}}));assert.equal(completed.state,"completed");assert.equal(writes,1);
    const external=await mcp.client.callTool({name:"moodle_prepare_browser_workflow",arguments:{sessionId:"project",targetUrl:"https://aprende.asc.education/admin/user.php",intent:"Abrir página",steps:[{action:"goto",url:"https://evil.example/admin"}]}});assert.equal(external.isError,true);
  }finally{await mcp.close();}
});

test("User CSV is normalized, masked in preview and blocked when required data is missing",()=>{
  const ready=prepareUserImport([{usuario:"ana",nombre:"Ana",apellidos:"López",correo:"ana@example.com",contraseña:"secreto",curso:"META-1",rol:"alumno"}]);
  assert.equal(ready.blocked,false);assert.match(ready.csv,/ana,Anna|ana,Ana/);assert(!JSON.stringify(ready.preview).includes("secreto"));assert.equal(ready.preview[0].role1,"student");
  const blocked=prepareUserImport([{usuario:"ana",nombre:"Ana"}],{defaultCourse:"META-1"});assert.equal(blocked.blocked,true);assert(blocked.preview[0].errors.some(error=>error.includes("password")));
});

test("Computer Use action allowlist excludes navigation and final write commands",()=>{
  assert(ALLOWED_ACTIONS.has("click_at"));assert(!ALLOWED_ACTIONS.has("navigate"));assert(!ALLOWED_ACTIONS.has("delete"));assert(!ALLOWED_ACTIONS.has("submit"));
});

test("Moodle Web Services use the official REST function contract and reject other origins",async()=>{
  let request;
  const api=createMoodleApi({token:"secret",allowedOrigins:["https://moodle.example"],fetchImpl:async(url,options)=>{request={url:String(url),body:String(options.body)};return {ok:true,json:async()=>[{id:1,name:"Tema"}]};}});
  const result=await api.readCourse("https://moodle.example/course/view.php?id=42");assert.equal(result[0].id,1);assert.equal(request.url,"https://moodle.example/webservice/rest/server.php");assert.match(request.body,/wstoken=secret/);assert.match(request.body,/wsfunction=core_course_get_contents/);assert.match(request.body,/courseid=42/);
  await assert.rejects(()=>api.readCourse("https://evil.example/course/view.php?id=42"),/origen autorizado/);
});
