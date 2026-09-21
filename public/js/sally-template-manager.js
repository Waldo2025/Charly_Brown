import {sanitizeHtml} from "./security-utils.js";
import {fillTemplate} from "./sally-template.js";

export function installTemplateManager({state,el,store,toast}){
  const modal=el("sallyTemplateModal");let rows=[],selected=null,dirty=false,busy=false,opener;
  modal.querySelector(".sally-template-editor").append(el("sallyTemplatesPanel"));
  modal.querySelector(".sally-template-library-select").append(el("sallyTemplateList").closest("label"));
  const valuesLabel=el("sallyTemplateValues").closest("label");valuesLabel.hidden=true;
  const fields=document.createElement("div");fields.className="sally-template-fields";valuesLabel.before(fields);
  function templateFields(){let values={};try{values=JSON.parse(el("sallyTemplateValues").value);}catch{}
    fields.replaceChildren();const keys=[...new Set([...el("sallyTemplateHtml").value.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map(m=>m[1]))];
    if(keys.length){const heading=document.createElement("h3");heading.textContent="Textos de muestra para la vista previa";fields.append(heading);}
    for(const key of keys){const label=document.createElement("label"),title=document.createElement("span"),input=document.createElement("textarea");label.className="sally-field";title.textContent=key.replaceAll("_"," ");input.rows=2;input.value=values[key]||"";input.placeholder="O describe el texto correcto en el chat";input.oninput=()=>{values[key]=input.value;el("sallyTemplateValues").value=JSON.stringify(values);preview();};label.append(title,input);fields.append(label);}
  }
  el("sallyTemplatesPanel").open=true;el("sallyTemplatesPanel").querySelector(":scope > summary").hidden=true;
  function status(message){el("sallyTemplateStatus").textContent=message;}
  function list(){
    const previous=el("sallyTemplateList").value,query=el("sallyTemplateSearch").value.toLocaleLowerCase();
    el("sallyTemplateList").replaceChildren(new Option("Nueva plantilla",""));
    for(const t of rows.filter(t=>Boolean(t.archived)===el("sallyTemplateArchived").checked&&t.name.toLocaleLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name)))el("sallyTemplateList").add(new Option(`${t.name}${t.ownerId===state.user.uid?" · Tu plantilla":" · Compartida"}`,t.id));
    for(const t of (state.history||[]).filter(e=>e.kind==="template"&&e.name?.toLocaleLowerCase().includes(query)))el("sallyTemplateList").add(new Option(t.name+" · Privada de este proyecto","local:"+t.id));
    el("sallyTemplateList").value=previous;
  }
  function preview(){
    let html=sanitizeHtml(el("sallyTemplateHtml").value);try{html=fillTemplate(html,JSON.parse(el("sallyTemplateValues").value));}catch{}
    // No scripts, forms, navigation, or network access in the preview.
    el("sallyTemplatePreview").srcdoc=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>body{font:15px/1.6 system-ui;padding:16px;overflow-wrap:anywhere}</style>${html}`;
  }
  function load(template){selected=template;dirty=false;el("sallyTemplateName").value=template?.name||"";el("sallyTemplateHtml").value=template?.html||"";el("sallyTemplateValues").value="{}";
    const owned=!template||template.ownerId===state.user.uid;
    el("sallySaveTemplate").disabled=!owned;el("sallyArchiveTemplate").disabled=!template||!owned||template.local;
    el("sallyArchiveTemplate").title=template?.archived?"Restaurar plantilla":"Archivar plantilla";el("sallyArchiveTemplate").setAttribute("aria-label",el("sallyArchiveTemplate").title);
    status(template?`${template.local?"Plantilla privada. Guardar una copia la publicará en la biblioteca.":"Biblioteca compartida · versión "+template.version}${!owned?". Puedes usarla o guardar una copia; el original pertenece a otro usuario.":""}`:"Nueva plantilla. Al guardar será visible para los usuarios aprobados.");templateFields();preview();
  }
  function close(){if(busy)return;if(dirty&&!window.confirm("¿Cerrar sin guardar los cambios del editor?"))return;modal.close();}
  const action=fn=>async()=>{if(busy)return;busy=true;try{await fn();}catch(error){status(error.message);toast(error.message);}finally{busy=false;}};
  async function save(copy=false){const html=sanitizeHtml(el("sallyTemplateHtml").value),name=el("sallyTemplateName").value;
    const creating=copy||!selected||selected.local;const nextVersion=creating?1:selected.version+1;const archived=!creating&&Boolean(selected.archived);
    const id=await store.save({id:!copy&&!selected?.local?selected?.id:undefined,version:selected?.version,name,html,archived:!copy&&Boolean(selected?.archived)});
    load({id,name,html,ownerId:state.user.uid,version:nextVersion,archived});list();el("sallyTemplateList").value=id;status("Plantilla guardada en la biblioteca compartida.");toast("Plantilla global guardada.");return id;
  }
  function snapshot(){const html=sanitizeHtml(el("sallyTemplateHtml").value);if(!html.trim())throw Error("Elige o escribe una plantilla.");if(html.length>150000)throw Error("La plantilla es demasiado grande.");return {id:selected?.id||"",version:dirty?0:selected?.version||0,name:el("sallyTemplateName").value.trim()||"Plantilla personalizada",html};}
  el("sallyOpenTemplates").onclick=()=>{opener=document.activeElement;list();modal.showModal();el("sallyTemplateSearch").focus();};
  el("sallyCloseTemplates").onclick=close;modal.addEventListener("cancel",e=>{e.preventDefault();close();});modal.addEventListener("close",()=>opener?.focus());
  el("sallyTemplateList").onchange=()=>{if(dirty&&!window.confirm("¿Descartar los cambios sin guardar?")){el("sallyTemplateList").value=selected?.id||"";return;}const id=el("sallyTemplateList").value;load(id.startsWith("local:")?{...state.history.find(t=>t.id===id.slice(6)),local:true}:rows.find(t=>t.id===id));};
  el("sallyTemplateSearch").oninput=list;el("sallyTemplateArchived").onchange=list;
  el("sallyNewTemplate").onclick=()=>{if(!dirty||window.confirm("¿Descartar los cambios sin guardar?")){el("sallyTemplateList").value="";load(null);}};
  el("sallyAddTemplate").onclick=()=>el("sallyTemplateFile").click();
  el("sallyTemplateFile").onchange=action(async()=>{const file=el("sallyTemplateFile").files[0];if(!file)return;if(file.size>150000)throw Error("El archivo supera 150 KB.");if(dirty&&!window.confirm("¿Reemplazar el contenido sin guardar?"))return;load(null);el("sallyTemplateName").value=file.name;el("sallyTemplateHtml").value=await file.text();dirty=true;preview();el("sallyTemplateFile").value="";});
  for(const id of ["sallyTemplateName","sallyTemplateHtml"]){el(id).addEventListener("input",()=>{dirty=true;if(id==="sallyTemplateHtml"){templateFields();preview();}});}
  el("sallySaveTemplate").onclick=action(()=>save());el("sallyCopyTemplate").onclick=action(()=>save(true));
  el("sallyArchiveTemplate").onclick=action(async()=>{if(!selected||!window.confirm(`${selected.archived?"Restaurar":"Archivar"} esta plantilla global?`))return;await store.save({...selected,archived:!selected.archived});load(null);});
  load(null);const off=store.watch(data=>{rows=data;list();},error=>status(error.code==="permission-denied"?"No se puede acceder a la biblioteca. Verifica que las reglas de plantillas estén publicadas y tu perfil aprobado.":"No se pudo cargar la biblioteca: "+error.message));
  return {refresh:list,items:()=>rows.map(t=>({...t,html:sanitizeHtml(t.html)})),dispose:off};
}
