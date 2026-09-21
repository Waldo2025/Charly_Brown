const {createHash}=require("node:crypto");
const {cleanMoodleHtml}=require("./html-policy.js");
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function inspectQuiz(page,{url,courseUrl}){
  const u=new URL(url),c=new URL(courseUrl),id=u.searchParams.get("id");
  if(u.origin!==c.origin||u.pathname!=="/mod/quiz/view.php"||!/^\d+$/.test(id||""))throw Error("Cuestionario no válido.");
  await page.goto(u.href,{waitUntil:"domcontentloaded"});
  const links=await page.locator('a[href*="/course/view.php"]').evaluateAll(nodes=>nodes.map(n=>n.href));
  if(!links.some(h=>new URL(h).searchParams.get("id")===c.searchParams.get("id")))throw Error("No se confirmó el curso del cuestionario.");
  await page.goto(u.origin+"/mod/quiz/edit.php?cmid="+id,{waitUntil:"domcontentloaded"});
  const editText=await page.locator('#region-main').innerText();
  const structureLocked=/no puede agregar o quitar preguntas|cannot add or remove questions/i.test(editText);
  const questions=await page.locator('.slot[data-slot],li[id^="slot-"]').evaluateAll(nodes=>nodes.map(n=>({slot:n.getAttribute("data-slot")||n.id.replace("slot-",""),title:n.querySelector('.questionname,.slotname,.question-text')?.textContent?.trim()||n.textContent.trim(),type:n.querySelector('img.qtypeicon')?.getAttribute("alt")||n.getAttribute("data-qtype")||"unknown"})));
  if(!questions.length)throw Error("No se pudieron leer las preguntas del cuestionario. Verifica permisos y formato.");
  return {quizId:id,title:await page.title(),url:u.href,questions,hash:digest(questions),structureLocked,
    restriction:structureLocked?"Moodle bloquea añadir o quitar preguntas porque el cuestionario ya tiene intentos. Usa un cuestionario nuevo sin intentos; no borres los existentes.":""};
}
async function createDescription(page,operation,{courseUrl,authorize,fillHtml}){
  const p=operation.payload,quizUrl=new URL("/mod/quiz/view.php?id="+p.quizId,courseUrl).href;
  let inventory=await inspectQuiz(page,{url:quizUrl,courseUrl});
  if(inventory.structureLocked)throw Error(inventory.restriction);
  const name=`${p.title||"Información"} [Sally ${operation.id}]`;
  if(inventory.questions.some(q=>q.title.includes(name)))return {action:"existing",verified:true,quizId:p.quizId};
  if(inventory.hash!==p.quizHash)throw Error("Las preguntas del cuestionario cambiaron. Vuelve a investigar antes de insertar.");
  const index=inventory.questions.findIndex(q=>q.slot===p.beforeSlot);
  const menus=page.locator('.add-menu');
  if(index<0||await menus.count()!==inventory.questions.length+1)throw Error("No se reconoció una inserción segura antes de la pregunta. Se necesita adaptar este formato Moodle.");
  await menus.nth(index).getByRole("button").click();
  await page.getByText(/una nueva pregunta|a new question/i,{exact:false}).last().click();
  const radio=page.locator('input[type="radio"][value="description"]');if(await radio.count()!==1)throw Error("Moodle no ofrece el tipo nativo Descripción.");await radio.check();
  await page.getByRole("button",{name:/^(Agregar|Añadir|Add)$/i}).click();
  await page.locator('input[name="name"]').fill(name);await fillHtml(cleanMoodleHtml(p.html));await authorize();
  await page.locator('input[name="submitbutton"],button[name="submitbutton"]').click();
  inventory=await inspectQuiz(page,{url:quizUrl,courseUrl});
  const inserted=inventory.questions.findIndex(q=>q.title.includes(name));
  if(inserted!==index||inventory.questions[index+1]?.title!==operation.payload.beforeTitle)throw Error("La inserción se guardó pero no se pudo verificar su posición. Revisa el cuestionario, no repitas automáticamente.");
  return {action:"created",verified:true,quizId:p.quizId,questionTitle:name,position:inserted,afterHash:inventory.hash};
}
module.exports={inspectQuiz,createDescription};
