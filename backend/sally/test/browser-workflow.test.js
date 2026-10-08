const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeBrowserWorkflow,workflowRisk}=require("../browser-workflow.js");

test("Browser workflow accepts semantic locators and rejects scripts, secrets and external navigation",()=>{
  const target="https://moodle.example/admin/user.php";
  const valid=normalizeBrowserWorkflow({steps:[{action:"fill",locator:{by:"label",name:"Nombre"},value:"Ana"},{action:"click",locator:{by:"role",role:"button",name:"Guardar cambios"}}]},target);
  assert.equal(valid.steps[0].locator.by,"label");assert.equal(valid.steps[1].locator.role,"button");
  assert.throws(()=>normalizeBrowserWorkflow({steps:[{action:"script",value:"alert(1)"}]},target),/no permitida/);
  assert.throws(()=>normalizeBrowserWorkflow({steps:[{action:"fill",locator:{by:"label",name:"Contraseña"},value:"secreto"}]},target),/contraseñas/);
  assert.throws(()=>normalizeBrowserWorkflow({steps:[{action:"goto",url:"https://evil.example/"}]},target),/salir del dominio/);
  assert.equal(workflowRisk({intent:"Eliminar curso"}),"high");
});
