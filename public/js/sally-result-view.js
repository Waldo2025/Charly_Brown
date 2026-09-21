// Presentation only: Moodle content is untrusted and is never executed as HTML.
const labels={analysis:"Análisis",message:"Respuesta",plan:"Plan de cambios",checkpoint:"Respaldo",execution:"Ejecución",error:"Aviso",completed:"Completado",failed:"Falló",paused:"Pausado",cancelled:"Cancelado",running:"En curso",draft:"Borrador",pending:"Pendiente",approved:"Aprobado",awaiting_approval:"Pendiente de aprobación",page:"Página",label:"Texto y medios",resource:"Archivo o recurso",quiz:"Cuestionario",url:"Enlace",book:"Libro",folder:"Carpeta",forum:"Foro",assign:"Tarea",hidden:"Oculto a estudiantes",visible:"Visible a estudiantes",keep:"Conservar visibilidad",append:"Añadir al final",replace:"Reemplazar contenido",create_or_update_section:"Crear o actualizar sección",create_or_update_resource:"Crear o actualizar recurso",upload_asset:"Adjuntar archivo",create_quiz:"Crear cuestionario",reorder_item:"Reordenar elemento",verify_result:"Verificar resultado",inspect_course:"Analizar curso"};
export const resultLabel=value=>labels[value]||String(value||"Sin especificar").replaceAll("_"," ");
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;}
function fold(parent,title,open=false){const d=node("details",undefined,"sally-result-card");d.open=open;d.append(node("summary",title));parent.append(d);return d;}
function link(parent,url,title="Abrir en Moodle") {try{const u=new URL(url);if(!["https:","http:"].includes(u.protocol))return;const a=node("a",title);a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";parent.append(a);}catch{}}
function htmlText(html){const doc=new DOMParser().parseFromString(String(html),"text/html");doc.querySelectorAll("script,style,iframe,object").forEach(n=>n.remove());doc.querySelectorAll("p,div,li,br,h1,h2,h3,h4,tr").forEach(n=>n.append(doc.createTextNode("\n")));return doc.body.textContent.trim();}
export function prose(parent,text){
  if(!text)return;
  for(const part of String(text).split(/\n\s*\n/)){const h=part.match(/^#{1,6}\s+([^\n]+)$/);const p=node(h?"h4":"p",h?h[1]:undefined,"sally-result-prose");
    if(!h){for(const [i,chunk] of part.split(/\*\*([^*]+)\*\*/g).entries())p.append(i%2?node("strong",chunk):document.createTextNode(chunk));}parent.append(p);}
}
function facts(parent,pairs){const dl=node("dl",undefined,"sally-result-facts");for(const [label,value] of pairs){if(value===undefined||value===null||value==="")continue;dl.append(node("dt",label),node("dd",value));}if(dl.childNodes.length)parent.append(dl);}
function content(parent,value,title="Contenido") {if(value){const d=fold(parent,title);prose(d,value);}}
function inventory(parent,data){
  const section=node("section",undefined,"sally-result-inventory");parent.append(section);
  section.append(node("h3",data.title||"Inventario del curso"));link(section,data.url,"Ver curso en Moodle");
  const sections=data.sections||[],count=sections.reduce((sum,s)=>sum+(s.modules?.length||0),0);
  facts(section,[["Estructura",`${sections.length} secciones · ${count} recursos`],["Formato",typeof data.format==="string"?data.format:data.format?.name||data.format?.type],["Cobertura",data.coverage?.complete===true?"Completa":data.coverage?.complete===false?"Parcial: hay contenido pendiente de leer":"No certificada"]]);
  if(data.warnings?.length){const warning=fold(section,`Avisos (${data.warnings.length})`,true);for(const w of data.warnings){prose(warning,typeof w==="string"?w:w.message);link(warning,w.url,"Consultar recurso");}}
  if(data.tabs?.length){const tabs=fold(section,`Pestañas y subpestañas (${data.tabs.length})`);const ul=node("ul");tabs.append(ul);for(const t of data.tabs){const li=node("li",`${t.level>0?"Subpestaña: ":""}${t.title||t.name||"Sin título"}${t.status?" · "+resultLabel(t.status):""}`);link(li,t.url,"Abrir pestaña");ul.append(li);}}
  for(const s of sections){const d=fold(section,`${s.title||"Sección sin título"} · ${s.modules?.length||0} recursos`);prose(d,s.summaryText||htmlText(s.summaryHtml||""));
    const ul=node("ul",undefined,"sally-result-resources");d.append(ul);
    for(const m of s.modules||[]){const li=node("li");li.append(node("strong",m.title||"Recurso sin título"),node("span",resultLabel(m.type),"sally-result-muted"));link(li,m.url,"Ver recurso");content(li,m.text||htmlText(m.html||""),"Leer contenido");ul.append(li);}}
  if(data.pages?.length){const pages=fold(section,`Contenido leído (${data.pages.length})`);for(const p of data.pages){const d=fold(pages,p.title||"Recurso leído");link(d,p.url,"Ver recurso");prose(d,p.text||htmlText(p.html||"")||"Sin texto extraíble.");if(p.textTruncated||p.htmlTruncated)prose(d,"Lectura parcial: el contenido extraído tiene límites.");}}
}
function operation(parent,op,index){const p=op.payload||op;const d=fold(parent,`${index+1}. ${op.intent||p.title||resultLabel(op.type)||"Cambio propuesto"}`,true);
  facts(d,[["Acción",op.type?resultLabel(op.type):null],["Estado",op.status?resultLabel(op.status):null],["Sección",p.sectionTitle],["Recurso",p.title|| (p.moduleId?`Recurso #${p.moduleId}`:null)],["Visibilidad",p.visibility?resultLabel(p.visibility):null],["Tratamiento",p.mode?resultLabel(p.mode):null]]);
  link(d,op.target,"Ver curso destino");content(d,p.text||htmlText(p.html||""),"Texto del contenido propuesto");if(op.result)change(d,op.result);if(op.error)prose(d,typeof op.error==="string"?op.error:op.error.message);
}
function change(parent,data){
  facts(parent,[["Verificación",data.verified===true?"Resultado verificado":null],["Resultado",data.action==="updated"?"Recurso actualizado":data.action==="created"?"Recurso creado":null],["Recurso",data.resourceId?`Recurso #${data.resourceId}`:null],["Visibilidad final",data.afterVisible!==undefined?(String(data.afterVisible)==="0"?"Oculto a estudiantes":"Visible a estudiantes"):data.visibility?resultLabel(data.visibility):null]]);
  facts(parent,[["Estado",data.state?resultLabel(data.state):null],["Recurso",data.title||(data.moduleId?`Recurso #${data.moduleId}`:null)],["Visibilidad",data.visible!==undefined?(String(data.visible)==="0"?"Oculto a estudiantes":"Visible a estudiantes"):null],["Reversión",data.reversible===true?"Respaldo disponible para preparar una reversión":data.reversible===false?"Requiere revisión manual":null]]);
  prose(parent,data.reason||data.message);if(data.error)prose(parent,typeof data.error==="string"?data.error:data.error.message);
  link(parent,data.url||data.target,"Ver en Moodle");content(parent,data.text||htmlText(data.afterHtml||data.html||""),"Leer contenido guardado");
  if(data.results)for(const [i,item] of data.results.entries())operation(parent,item,i);
}
export function renderResultData(parent,data,kind=""){
  if(!data)return;
  if(Array.isArray(data)){if(kind==="plan"){parent.append(node("h3",`Plan de cambios · ${data.length} acciones`));data.forEach((op,i)=>operation(parent,op,i));}
    else for(const [i,item] of data.entries()){if(item?.sections)inventory(parent,item);else if(kind==="checkpoint")change(fold(parent,`Respaldo ${i+1}`,true),item);else renderResultData(parent,item);}
  }else if(data.sections)inventory(parent,data);
  else if(data.results||kind==="execution"||kind==="checkpoint"||data.reversible!==undefined)change(parent,data);
  else if(data.operations)renderResultData(parent,data.operations,"plan");
  else prose(parent,data.message||data.text||data.reason||"Registro conservado. No hay información adicional para mostrar.");
}
export function renderResult(parent,entry,data){parent.replaceChildren();prose(parent,entry.text);renderResultData(parent,data,entry.plan?"plan":entry.checkpoints?"checkpoint":entry.kind);}
export function renderChanges(parent,entries){parent.replaceChildren();const changes=entries.filter(e=>e.result||e.checkpoints).reverse();if(!changes.length){prose(parent,"Sin cambios registrados.");return;}for(const e of changes){const d=fold(parent,`${resultLabel(e.kind)} · ${new Date(e.createdAt).toLocaleString("es")}`);prose(d,e.text);renderResultData(d,e.result||e.checkpoints,e.checkpoints?"checkpoint":"execution");}}
