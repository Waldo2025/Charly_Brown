// Fixed, read-only Moodle DOM adapter. No selectors or scripts from the client.
function extractCourseStructure({courseUrl}) {
  const body=document.body,base=new URL(courseUrl);
  const text=node=>String(node?.textContent||"").replace(/\s+/g," ").trim();
  const sectionSelector="li.section, .course-section, [data-sectionid]";
  const cleanUrl=raw=>{try{const u=new URL(raw,location.href);u.username="";u.password="";for(const key of [...u.searchParams.keys()])if(/sesskey|token|password/i.test(key))u.searchParams.delete(key);return u.href;}catch{return "";}};
  const cleanHtml=node=>{if(!node)return "";const copy=node.cloneNode(true);copy.querySelectorAll("script,style,form,input,button,select,textarea,iframe,object,embed,link,meta").forEach(n=>n.remove());for(const n of [copy,...copy.querySelectorAll("*")])for(const a of [...n.attributes]){if(/^on/i.test(a.name))n.removeAttribute(a.name);if(["href","src"].includes(a.name)&&/sesskey|token|password/i.test(a.value))n.removeAttribute(a.name);}return copy.innerHTML;};
  const sectionNodes=[...body.querySelectorAll(sectionSelector)].filter(n=>!n.parentElement?.closest(sectionSelector)||n.hasAttribute("data-sectionid")&&n.getAttribute("data-sectionid")!==n.parentElement.closest(sectionSelector)?.getAttribute("data-sectionid"));
  const sections=sectionNodes.map((section,index)=>{
    const modules=[...section.querySelectorAll("li.activity, .activity-item, [data-activityname]")].filter(n=>n.closest(sectionSelector)===section&&!n.parentElement?.closest("li.activity, .activity-item, [data-activityname]"));
    const summary=section.querySelector(".summary, .section-summary, [data-for='sectionsummary']");
    const summaryHtml=cleanHtml(summary);
    return {index,id:section.getAttribute("data-sectionid")||section.id||"",number:section.getAttribute("data-number")||section.id.match(/^section-(\d+)$/)?.[1]||"",
      title:text(section.querySelector(".sectionname,h3,h2"))||`Sección ${index+1}`,sourceUrl:cleanUrl(location.href),summaryText:text(summary),summaryHtml:summaryHtml.slice(0,100000),summaryTruncated:summaryHtml.length>100000,
      modules:modules.map(item=>{const link=item.querySelector("a[href*='/mod/'][href*='view.php']")||item.querySelector(".activityname a,.instancename a,a[href]");const html=cleanHtml(item);return {id:item.getAttribute("data-id")||item.id||"",title:text(item.querySelector(".activityname,.instancename,a"))||text(item).slice(0,150),type:[...item.classList].find(name=>name.startsWith("modtype_"))?.slice(8)||"resource",url:link?cleanUrl(link.href):"",...(!link?{text:text(item),html:html.slice(0,100000),htmlTruncated:html.length>100000}:{})};}).filter(item=>item.title)};
  });
  const formatClass=[...body.classList].find(c=>/^format[-_]/.test(c));
  const format=formatClass?.replace(/^format[-_]/,"")||(body.querySelector(".format_onetopic-tabs,.format_onetopic-subtabs,.onetopic")?"onetopic":"unknown");
  const canonical=raw=>{
    try{const u=new URL(raw,location.href);if(u.origin!==base.origin)return "";
      if([...u.searchParams.keys()].some(k=>!/^(id|section|sectionid|sesskey)$/.test(k)))return "";
      if(u.pathname==="/course/view.php"&&u.searchParams.get("id")===base.searchParams.get("id")){
        const out=new URL(base.origin+u.pathname);out.searchParams.set("id",base.searchParams.get("id"));
        for(const k of ["section","sectionid"])if(/^\d+$/.test(u.searchParams.get(k)||""))out.searchParams.set(k,u.searchParams.get(k));
        return out.href;
      }
      if(u.pathname==="/course/section.php"&&/^\d+$/.test(u.searchParams.get("id")||""))return base.origin+u.pathname+"?id="+u.searchParams.get("id");
    }catch{}return "";
  };
  const tabRoot=".format_onetopic-tabs,.format_onetopic-subtabs,.tabtree,.tabrow0,.tabrow1,[role='tablist'],.course-content .nav-tabs,.onetopic .nav-tabs";
  const tabs=[];
  for(const a of body.querySelectorAll("a[href],.format_onetopic-tabs a,.format_onetopic-subtabs a,.tabrow0 a,.tabrow1 a,[role='tablist'] a, [role='tab'], button[data-bs-toggle='tab'], button[data-toggle='tab']")){
    const inTabs=a.closest(tabRoot),raw=a.getAttribute("href")||"",url=raw&&!raw.startsWith("#")?canonical(raw):"";
    const isSection=url&&(new URL(url).pathname==="/course/section.php"||/section(?:id)?=/.test(url));
    const target=a.getAttribute("aria-controls")||a.getAttribute("data-bs-target")||a.getAttribute("data-target")||(raw.startsWith("#")?raw:"");
    if(!inTabs&&!isSection)continue;
    if(!url&&!target&&!inTabs)continue;
    const label=text(a.querySelector(".tabname"))||a.getAttribute("title")||text(a);if(!label)continue;
    const parentItem=a.closest("li")?.parentElement?.closest("li");
    const parentAnchor=parentItem?.querySelector(":scope > a");
    const nested=!!a.closest(".format_onetopic-subtabs,.tabrow1")||!!parentAnchor;
    const activeParent=body.querySelector(".format_onetopic-tabs > li > a.active,.tabrow0 .here a,.tabrow0 a.active");
    const parent=parentAnchor|| (nested?activeParent:null);
    const parentUrl=parent?.getAttribute("href")?canonical(parent.getAttribute("href")):"";
    const key=url||`control:${a.id||target||label}`;
    const ancestors=[];let panel=a.parentElement?.closest("[role='tabpanel']");
    while(panel){const control=[...body.querySelectorAll("[aria-controls],[data-bs-target],[data-target]")].find(n=>(n.getAttribute("aria-controls")||n.getAttribute("data-bs-target")||n.getAttribute("data-target"))?.replace(/^#/,"")===panel.id);if(control)ancestors.unshift({id:control.id,target:control.getAttribute("aria-controls")||control.getAttribute("data-bs-target")||control.getAttribute("data-target"),title:text(control)});panel=panel.parentElement?.closest("[role='tabpanel']");}
    const active=a.matches(".active,[aria-selected='true']")||a.closest("li")?.matches(".here,.selected");
    tabs.push({key,title:label,url,level:ancestors.length|| (nested?1:0),parentKey:parentUrl||(ancestors.length?`control:${ancestors.at(-1).id||ancestors.at(-1).target}`:null),disabled:a.matches(".disabled,[aria-disabled='true']")||(!url&&!target&&!active),
      ...(!url&&!target&&active&&sections.length?{status:"read",sectionIds:sections.map(s=>s.id||s.title)}:{}),
      sourceUrl:canonical(location.href)||courseUrl,control:!url&&target?{id:a.id,target,title:label,ancestors}:null});
  }
  const courseId=body.className.match(/\bcourse-(\d+)\b/)?.[1]||String(window.M?.cfg?.courseId||"");
  return {title:text(body.querySelector("h1"))||document.title,url:cleanUrl(location.href),format:{id:format,label:format==="onetopic"?"Temas por pestañas (Onetopic)":format,evidence:formatClass||"DOM",tabbed:format==="onetopic"||tabs.length>0},courseId,sections,tabs,links:[...body.querySelectorAll("a[href]")].slice(0,300).map(a=>({title:text(a),url:cleanUrl(a.href)})).filter(a=>a.title)};
}

async function settleCourse(page,pending=new Set()){
  // Bound loading waits: missing/delayed content becomes a coverage warning.
  await page.waitForLoadState("networkidle",{timeout:5000}).catch(()=>{});
  await page.locator("body").waitFor({state:"attached",timeout:5000});
  const until=Date.now()+8000;
  // loadState may already be 'networkidle' from an earlier tab. Wait for this
  // activation's AJAX and DOM mutations rather than trusting that old state.
  do{
    const stable=await page.evaluate(()=>new Promise(resolve=>{
      let quiet,deadline;const done=value=>{clearTimeout(quiet);clearTimeout(deadline);observer.disconnect();resolve(value);};
      const observer=new MutationObserver(()=>{clearTimeout(quiet);quiet=setTimeout(()=>done(true),500);});
      observer.observe(document.querySelector("#region-main,.course-content")||document.body,{subtree:true,childList:true,characterData:true});
      quiet=setTimeout(()=>done(true),750);deadline=setTimeout(()=>done(false),5000);
    }));
    if(stable&&!pending.size)return true;
  }while(Date.now()<until);
  return false;
}

async function collectTabbedCourse(page,courseUrl,{cancelled=()=>false,progress=()=>{},snapshot=async()=>{},maxViews=250}={}){
  const pending=new Set();
  const request=req=>{if(["xhr","fetch","document"].includes(req.resourceType()))pending.add(req);};
  const finished=req=>pending.delete(req);
  page.on("request",request);page.on("requestfinished",finished);page.on("requestfailed",finished);
  try{
  const initialStable=await settleCourse(page,pending);
  const initial=await page.evaluate(extractCourseStructure,{courseUrl});
  const inventory={...initial,tabs:[],warnings:[]};
  if(!initialStable)inventory.warnings.push({code:"course-loading",message:"La vista inicial no terminó de estabilizarse; puede faltar contenido."});
  const sections=new Map(),tabs=new Map(),visited=new Set(),queue=[];
  const merge=data=>{
    for(const section of data.sections){
      const key=section.id||section.number||section.title;
      const old=sections.get(key);
      if(!old)sections.set(key,section);
      else sections.set(key,{...old,...section,summaryHtml:section.summaryHtml||old.summaryHtml,summaryText:section.summaryText||old.summaryText,
        modules:[...new Map([...old.modules,...section.modules].map(m=>[m.id||m.url||m.title,m])).values()]});
    }
    for(const tab of data.tabs){
      const old=tabs.get(tab.key);
      tabs.set(tab.key,{...old,...tab,parentKey:tab.parentKey||old?.parentKey||null,level:Math.max(tab.level,old?.level||0)});
      if(!old&&!tab.disabled&&tab.status!=="read")queue.push(tab.key);
    }
  };
  merge(initial);
  while(queue.length&&!cancelled()){
    const key=queue.shift();if(visited.has(key))continue;
    if(visited.size>=maxViews){inventory.warnings.push({code:"tab-limit",message:`Se alcanzó el límite de ${maxViews} vistas. El análisis está incompleto.`});break;}
    visited.add(key);const tab=tabs.get(key);
    progress(`Leyendo pestaña ${visited.size}: ${tab.title}…`);
    try{
      if(tab.url){const response=await page.goto(tab.url,{waitUntil:"domcontentloaded",timeout:20000});if(response&&!response.ok())throw Error("La pestaña no es accesible.");}
      else{
        if(page.url().split("#")[0]!==tab.sourceUrl.split("#")[0])await page.goto(tab.sourceUrl,{waitUntil:"domcontentloaded",timeout:20000});
        for(const control of [...(tab.control.ancestors||[]),tab.control]){
          const controls=page.locator("[role='tab'],a[data-bs-toggle='tab'],a[data-toggle='tab'],button[data-bs-toggle='tab'],button[data-toggle='tab']");
          const index=await controls.evaluateAll((nodes,control)=>nodes.findIndex(n=>control.id?n.id===control.id:(n.getAttribute("aria-controls")||n.getAttribute("data-bs-target")||n.getAttribute("data-target")||n.getAttribute("href"))===control.target),control);
          if(index<0)throw Error("No se encontró el control de la subpestaña.");
          await controls.nth(index).click({timeout:5000});
          if(!await settleCourse(page,pending))throw Error("La subpestaña no terminó de cargar.");
        }
      }
      if(!await settleCourse(page,pending))throw Error("La pestaña no terminó de cargar.");
      if(/\/login\//.test(new URL(page.url()).pathname)||await page.locator("form[action*='/login/'] input[name='password']").count())throw Error("La pestaña requiere iniciar sesión.");
      const data=await page.evaluate(extractCourseStructure,{courseUrl});
      const expected=new URL(courseUrl).searchParams.get("id");
      if(data.courseId&&data.courseId!==expected)throw Error("La pestaña pertenece a otro curso.");
      merge(data);const record=tabs.get(key);record.status="read";record.sectionIds=data.sections.map(s=>s.id||s.number||s.title);
      if(!data.sections.length)throw Error("La pestaña no mostró secciones legibles.");
      await snapshot();
    }catch(error){tabs.get(key).status="unread";inventory.warnings.push({url:tab.url||tab.sourceUrl,code:"tab-unreadable",message:`${tab.title}: ${error.message}`});}
  }
  for(const tab of tabs.values())if(!tab.status){tab.status=tab.disabled?"restricted":"pending";if(tab.disabled)inventory.warnings.push({code:"tab-restricted",message:`${tab.title}: pestaña sin enlace accesible o restringida.`});}
  inventory.sections=[...sections.values()];inventory.tabs=[...tabs.values()];
  for(const tab of inventory.tabs){
    const ancestors=[],seen=new Set([tab.key]);let parent=tabs.get(tab.parentKey);
    while(parent&&!seen.has(parent.key)){seen.add(parent.key);ancestors.unshift(parent.title);parent=tabs.get(parent.parentKey);}
    tab.path=[...ancestors,tab.title];tab.level=Math.max(tab.level,ancestors.length);
  }
  inventory.tabCoverage={discovered:tabs.size,read:inventory.tabs.filter(t=>t.status==="read").length,complete:initialStable&&!cancelled()&&inventory.tabs.every(t=>t.status==="read")};
  inventory.url=courseUrl;
  return inventory;
  }finally{page.off("request",request);page.off("requestfinished",finished);page.off("requestfailed",finished);}
}
module.exports={extractCourseStructure,collectTabbedCourse};
