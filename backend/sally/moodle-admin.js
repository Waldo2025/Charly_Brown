function needsInput(message,fields=[]){const error=new Error(message);error.code="NEEDS_USER_INPUT";error.fields=fields;throw error;}
async function fillFirst(page,selectors,value,{required=false,label="campo"}={}){
  if(value===undefined||value===null||value==="")return false;
  const locator=page.locator(selectors).first();
  if(!await locator.count()){if(required)needsInput(`Moodle solicita un campo no reconocido: ${label}.`,[label]);return false;}
  await locator.fill(String(value));return true;
}
async function submit(page){
  const named=page.getByRole("button",{name:/Guardar|Save|Continuar|Continue|Subir|Upload/i}).first();
  const fallback=page.locator("form:visible button[type='submit'], form:visible input[type='submit']").first();
  const button=await named.count()?named:fallback;
  if(!await button.count())needsInput("No se reconoció el botón para continuar. Completa el formulario visible y reanuda.");
  await button.click();await page.waitForLoadState("domcontentloaded",{timeout:30000}).catch(()=>{});
}

async function createOrUpdateCourse(page,origin,operation){
  const data=operation.payload||{},courseId=String(data.courseId||"");
  const url=new URL(courseId?`/course/edit.php?id=${encodeURIComponent(courseId)}`:`/course/edit.php?category=${encodeURIComponent(data.categoryId||1)}`,origin);
  await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:45000});
  await fillFirst(page,"input[name='fullname'], input[id*='fullname']",data.fullname||data.title,{required:true,label:"nombre completo"});
  await fillFirst(page,"input[name='shortname'], input[id*='shortname']",data.shortname,{required:true,label:"nombre corto"});
  await fillFirst(page,"input[name='idnumber'], input[id*='idnumber']",data.idnumber);
  await fillFirst(page,"textarea[name*='summary'], textarea[id*='summary']",data.summary);
  if(data.categoryId){const category=page.locator("select[name='category'], select[id*='category']").first();if(await category.count())await category.selectOption(String(data.categoryId));}
  await submit(page);
  const current=new URL(page.url());
  if(!/\/course\/(view|edit)\.php$/.test(current.pathname))needsInput("Moodle no confirmó el curso. Revisa los campos marcados en el formulario.");
  return {action:courseId?"updated":"created",courseId:current.searchParams.get("id")||courseId,shortname:String(data.shortname||"")};
}

async function createGenericModule(page,operation,{openActivityChooser,chooseActivity,submitVisibleForm,assistField}){
  const data=operation.payload||{};
  await openActivityChooser(String(data.sectionTitle||""));
  const labels=[data.activityName,data.type].filter(Boolean);
  if(!labels.length)needsInput("Indica el tipo de actividad Moodle.",["activityName"]);
  await chooseActivity(labels);
  const fields=data.fields&&typeof data.fields==="object"?data.fields:{};
  const name=String(fields.name||data.title||operation.title||"").trim();
  await fillFirst(page,"form:visible input[name='name'], form:visible input[id*='name']",name,{required:true,label:"nombre"});
  for(const [field,value] of Object.entries(fields)){
    if(field==="name"||value===undefined||value===null)continue;
    const locator=page.locator(`form:visible [name='${field.replace(/[^a-zA-Z0-9_\[\]-]/g,"")}']`).first();
    if(!await locator.count()){if(await assistField?.({field,value}))continue;needsInput(`No se reconoció el campo obligatorio ${field}.`,[field]);}
    const tag=await locator.evaluate(node=>node.tagName);
    if(tag==="SELECT")await locator.selectOption(String(value));else if((await locator.getAttribute("type"))==="checkbox"){if(Boolean(value))await locator.check();else await locator.uncheck();}else await locator.fill(String(value));
  }
  await submitVisibleForm();
  return {action:"created",type:String(data.type||data.activityName),title:name};
}

async function importUsersCsv(page,origin,csv,tempFile){
  await page.goto(new URL("/admin/tool/uploaduser/index.php",origin).href,{waitUntil:"domcontentloaded",timeout:45000});
  const input=page.locator("input[type='file']").first();if(!await input.count())needsInput("La carga de usuarios no está habilitada o requiere permisos de administrador.");
  await input.setInputFiles(tempFile);await submit(page);
  const errors=await page.locator(".alert-danger,.error,.invalid-feedback").allTextContents();
  if(errors.some(Boolean))needsInput("Moodle rechazó la vista previa del CSV: "+errors.join(" ").slice(0,500));
  const uploadType=page.locator("select[name='uutype']").first();if(await uploadType.count())await uploadType.selectOption("2").catch(()=>{});
  const existing=page.locator("select[name='uuupdatetype']").first();if(await existing.count())await existing.selectOption("1").catch(()=>{});
  for(const [name,value] of [["uupasswordnew","0"],["uupasswordold","0"],["uuforcepasswordchange","0"],["uumatchemail","1"],["uuallowrenames","0"],["uuallowdeletes","0"],["uuallowsuspends","0"],["uustandardusernames","1"]]){const field=page.locator(`select[name='${name}']`).first();if(await field.count())await field.selectOption(value).catch(()=>{});}
  await submit(page);
  const text=await page.locator("#region-main,main").first().innerText().catch(()=>"");
  return {action:"imported",verified:/usuarios? (creados?|actualizados?)|users? (created|updated)/i.test(text),summary:text.slice(0,1200),bytes:Buffer.byteLength(csv)};
}

async function createMetaLink(page,origin,operation){
  const data=operation.payload||{};
  if(!/^\d+$/.test(String(data.targetCourseId||""))||!/^\d+$/.test(String(data.sourceCourseId||"")))needsInput("Indica los identificadores numéricos de los cursos origen y destino.",["sourceCourseId","targetCourseId"]);
  await page.goto(new URL(`/enrol/instances.php?id=${data.targetCourseId}`,origin).href,{waitUntil:"domcontentloaded",timeout:45000});
  const chooser=page.locator("select[name='add']").first();
  if(await chooser.count())await chooser.selectOption("meta");else{const link=page.getByRole("link",{name:/metacurso|course meta link/i}).first();if(!await link.count())needsInput("No se encontró el método Enlace a metacurso. Verifica que el plugin esté habilitado.");await link.click();}
  const course=page.locator("select[name='customint1'], select[name='link']").first();if(!await course.count())needsInput("Selecciona manualmente el curso origen del metacurso y reanuda.",["curso origen"]);
  await course.selectOption(String(data.sourceCourseId)).catch(()=>needsInput("El curso origen no aparece en la lista permitida.",["curso origen"]));
  await submit(page);return {action:"linked",sourceCourseId:String(data.sourceCourseId),targetCourseId:String(data.targetCourseId)};
}

module.exports={createOrUpdateCourse,createGenericModule,importUsersCsv,createMetaLink,needsInput};
