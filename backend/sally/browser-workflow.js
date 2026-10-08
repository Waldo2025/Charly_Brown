const {randomUUID}=require("node:crypto");

const STEP_ACTIONS=new Set(["goto","click","fill","select","check","uncheck","upload","wait","assert"]);
const LOCATOR_TYPES=new Set(["role","label","text","placeholder","title"]);
const HIGH_RISK=/\b(delete|remove|unenrol|suspend|restore|backup|role|grade|config|purge|reset|borrar|eliminar|desmatricular|suspender|restaurar|respaldo|rol|calificaci[oó]n|configuraci[oó]n|reiniciar)\b/i;
const SECRET=/password|passwd|contraseña|token|secret|mfa|otp|captcha/i;

function cleanText(value,max=1000){return String(value||"").trim().slice(0,max);}
function workflowRisk(value={}){
  const declared=String(value.risk||"").toLowerCase();
  if(declared==="destructive"||declared==="high")return "high";
  return HIGH_RISK.test(JSON.stringify(value))?"high":"standard";
}
function confirmationFor(intent){return `CONFIRMAR: ${cleanText(intent,160)}`;}
function normalizeLocator(raw={}){
  const by=String(raw.by||"").toLowerCase(),name=cleanText(raw.name,300);
  if(!LOCATOR_TYPES.has(by)||!name)throw Error("Cada paso interactivo necesita un localizador semántico por rol, etiqueta, texto, placeholder o título.");
  if(SECRET.test(name))throw Error("Sally no puede localizar ni completar campos de contraseñas, tokens, MFA o CAPTCHA.");
  const locator={by,name,exact:raw.exact!==false};
  if(by==="role"){locator.role=cleanText(raw.role,40);if(!locator.role)throw Error("El localizador por rol necesita el rol accesible.");}
  return locator;
}
function normalizeBrowserWorkflow(raw,targetUrl){
  const base=new URL(targetUrl),steps=Array.isArray(raw.steps)?raw.steps:[];
  if(!steps.length||steps.length>40)throw Error("El flujo del navegador debe contener entre 1 y 40 pasos.");
  const normalized=steps.map((rawStep,index)=>{
    const action=String(rawStep.action||"").toLowerCase();
    if(!STEP_ACTIONS.has(action))throw Error(`Paso ${index+1}: acción no permitida.`);
    const step={id:rawStep.id||randomUUID(),action};
    if(action==="goto"){
      const url=new URL(String(rawStep.url||""),base);
      if(url.origin!==base.origin||url.username||url.password)throw Error("El flujo intenta salir del dominio Moodle autorizado.");
      step.url=url.href;
    }else if(action==="wait"){
      step.milliseconds=Math.max(100,Math.min(5000,Number(rawStep.milliseconds)||500));
    }else{
      step.locator=normalizeLocator(rawStep.locator);
      if(["fill","select","upload"].includes(action)){
        if(SECRET.test(step.locator.name))throw Error("El flujo contiene un campo secreto no permitido.");
        step.value=cleanText(rawStep.value,action==="fill"?50000:2000);
        if(!step.value)throw Error(`Paso ${index+1}: falta el valor.`);
        if(action==="upload"&&!/^sallyBrown\/[\w-]+\/[\w-]+\/attachments\//.test(step.value))throw Error("Solo se pueden adjuntar archivos privados de esta sesión.");
      }
      if(action==="assert")step.expected=cleanText(rawStep.expected||rawStep.value,1000);
    }
    return step;
  });
  return {steps:normalized,risk:workflowRisk(raw)};
}

function semanticLocator(page,spec){
  if(spec.by==="role")return page.getByRole(spec.role,{name:spec.name,exact:spec.exact});
  if(spec.by==="label")return page.getByLabel(spec.name,{exact:spec.exact});
  if(spec.by==="text")return page.getByText(spec.name,{exact:spec.exact});
  if(spec.by==="placeholder")return page.getByPlaceholder(spec.name,{exact:spec.exact});
  return page.getByTitle(spec.name,{exact:spec.exact});
}

async function executeBrowserWorkflow(page,origin,operation,{resolveUpload}={}){
  const workflow=normalizeBrowserWorkflow(operation.payload||{},operation.target);
  const completed=[];
  for(const step of workflow.steps){
    if(step.action==="goto")await page.goto(step.url,{waitUntil:"domcontentloaded",timeout:45000});
    else if(step.action==="wait")await page.waitForTimeout(step.milliseconds);
    else {
      const locator=semanticLocator(page,step.locator).first();
      if(await locator.count()!==1)throw Error(`No se identificó de forma única: ${step.locator.name}.`);
      if(step.action==="click")await locator.click();
      else if(step.action==="fill")await locator.fill(step.value);
      else if(step.action==="select")await locator.selectOption({label:step.value}).catch(()=>locator.selectOption(step.value));
      else if(step.action==="check")await locator.check();
      else if(step.action==="uncheck")await locator.uncheck();
      else if(step.action==="upload")await locator.setInputFiles(await resolveUpload(step.value));
      else if(step.action==="assert"){
        const text=cleanText(await locator.textContent().catch(()=>""),5000);
        if(step.expected&&!text.includes(step.expected))throw Error(`La verificación no encontró el resultado esperado en ${step.locator.name}.`);
      }
    }
    const current=new URL(page.url());
    if(current.origin!==origin)throw Error("Moodle redirigió fuera del dominio autorizado.");
    completed.push(step.id);
  }
  return {action:"browser_workflow",completed,risk:workflow.risk,url:page.url(),title:await page.title()};
}

module.exports={STEP_ACTIONS,LOCATOR_TYPES,workflowRisk,confirmationFor,normalizeBrowserWorkflow,executeBrowserWorkflow};
