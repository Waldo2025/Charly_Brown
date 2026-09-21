import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../public/js/sally-workflow.js",import.meta.url),"utf8");
const {resolveChatRequest,collectCourseInventories}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
for(const brief of ["revisa el curso modelo","muéstrame el módulo de introducción","¿cómo están creadas las secciones?","busca información para crear un módulo","continúa tu respuesta"]){
  assert.deepEqual(resolveChatRequest(brief,"model"),{analysisOnly:true,views:["model"]});
}
assert.deepEqual(resolveChatRequest("Copia el módulo del modelo al destino con otro texto","model"),{analysisOnly:false,views:["model","target"]});
assert.deepEqual(resolveChatRequest("Revisa el curso","target"),{analysisOnly:true,views:["target"]});
assert.deepEqual(resolveChatRequest("Modifica el texto","target"),{analysisOnly:false,views:["target"]});
const opened=[];
await collectCourseInventories({modelUrl:"https://moodle.test/course/view.php?id=85",targetUrl:"",views:resolveChatRequest("revisa el modelo","model").views,available:true,open:async view=>opened.push(view),inspect:async()=>({sections:[{title:"Tema"}]}),progress:()=>{}});
assert.deepEqual(opened,["model"]);
const proposalSource=(await readFile(new URL("../public/js/sally-proposal.js",import.meta.url),"utf8")).replace(/^import .*;\n/gm,"");
const stub='const buildApiUrlPreferRemote=x=>x;const authFetchJson=async(_url,options)=>{globalThis.sallyPrompt=JSON.parse(options.body);return globalThis.sallyResponse;};';
const {answerCourseQuestion}=await import("data:text/javascript;base64,"+Buffer.from(stub+proposalSource).toString("base64"));
const full="Respuesta completa ".repeat(1000);
globalThis.sallyResponse={candidates:[{finishReason:"STOP",content:{parts:[{text:full}]}}]};
const answer=await answerCourseQuestion({brief:"revisa el modelo",inventory:{sections:[{title:"Introducción"}]},thread:"model"});
assert.equal(answer.text,full);assert.equal(answer.incomplete,false);
assert.match(globalThis.sallyPrompt.payload.contents[0].parts[0].text,/No pidas curso destino/);
globalThis.sallyResponse.candidates[0].finishReason="MAX_TOKENS";
assert.equal((await answerCourseQuestion({brief:"continúa",thread:"model"})).incomplete,true);
delete globalThis.sallyResponse;delete globalThis.sallyPrompt;
console.log("PASS: model-only reading requires no destination; explicit transfer and target editing route separately.");
