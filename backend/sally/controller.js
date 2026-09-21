const path = require("node:path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { cleanMoodleHtml } = require("./html-policy.js");
const { collectTabbedCourse } = require("./course-reader.js");
const {inspectQuiz:readQuiz,createDescription}=require("./quiz-adapter.js");

function sameCourse(a,b){if(!a||!b)return false;const x=new URL(a),y=new URL(b);return x.origin===y.origin&&x.pathname===y.pathname&&x.searchParams.get("id")===y.searchParams.get("id");}
function resourceHash(html,visible){return createHash("sha256").update(JSON.stringify({html,visible})).digest("hex");}

const FIREBASE_API_KEY = "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0";
const FIREBASE_PROJECT_ID = "charly-brown";
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const ALLOWED_OPERATIONS = new Set([
  "inspect_course",
  "create_or_update_section",
  "create_or_update_resource",
  "upload_asset",
  "create_quiz",
  "create_quiz_description",
  "reorder_item",
  "verify_result"
]);

function cleanToken(value) {
  return String(value || "").trim();
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, "");
}

function resolveAccess(profile = {}, claims = {}) {
  const role = normalizeToken(profile.role || profile.rol || profile.userRole || profile.requestedRole || claims.role);
  const status = normalizeToken(profile.approvalStatus || profile.status || profile.estado || profile.estadoAprobacion || profile.aprobado || claims.approvalStatus || claims.status);
  const rejected = ["pending", "pendiente", "rejected", "rechazado", "denied", "denegado", "blocked", "bloqueado"].includes(status);
  const explicitlyApproved = ["approved", "aprobado", "active", "activo", "true"].includes(status)
    || profile.approved === true || profile.isApproved === true || profile.aprobado === true;
  const legacyApproved = Boolean(role && !["pending", "pendiente"].includes(role) && !status);
  return { allowed: Boolean(role && !["pending", "pendiente"].includes(role) && !rejected && (explicitlyApproved || legacyApproved)), role };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || body?.error || `Solicitud rechazada (${response.status}).`);
  return body;
}

function firestoreFieldsToObject(fields = {}) {
  const convert = (value = {}) => {
    if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
    if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
    if (value.mapValue) return firestoreFieldsToObject(value.mapValue.fields || {});
    return null;
  };
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, convert(value)]));
}

async function authorize(idToken) {
  const token = cleanToken(idToken);
  if (!token) throw new Error("Debes iniciar sesión para usar Sally Brown.");
  const account = await fetchJson(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token })
  });
  const user = account.users?.[0];
  if (!user?.localId || user.disabled) throw new Error("La sesión de Charly Brown no es válida.");
  let profile = {};
  try {
    const doc = await fetchJson(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(user.localId)}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    profile = firestoreFieldsToObject(doc.fields || {});
  } catch (_) {
    // Older accounts may rely on custom claims only.
  }
  let claims = {};
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    claims = payload || {};
  } catch (_) {}
  const access = resolveAccess(profile, claims);
  if (!access.allowed) throw new Error("Tu usuario debe estar aprobado y tener un rol asignado.");
  return { uid: user.localId, email: user.email || "", role: access.role, idToken: token };
}

function safeUrl(rawUrl, expectedOrigin = "") {
  const url = new URL(String(rawUrl || ""));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Sally solo puede abrir Moodle mediante HTTPS.");
  }
  if (expectedOrigin && url.origin !== expectedOrigin) throw new Error("La navegación salió del dominio Moodle autorizado.");
  return url;
}

function createSallyBrownController({ sendEvent, getPath = () => require("node:os").tmpdir(), reauthorize = authorize, requestAllowed = null }) {
  let playwright = null;
  let context = null;
  let page = null;
  let streamPage = null;
  let ownerUid = "";
  let allowedOrigin = "";
  let modelUrl = "";
  let targetUrl = "";
  let courseView = "model";
  let captureTimer = null;
  let paused = false;
  let cancelled = false;
  let approvedPlanHash = "";
  const completedOperations = new Set();

  const emit = (type, payload = {}) => sendEvent({ type, payload, at: new Date().toISOString() });
  const requireSession = (actor) => {
    if (!page || !context || actor.uid !== ownerUid) throw new Error("No existe una sesión Moodle activa para este usuario.");
  };
  let capturing = null,lastCaptureAt=0,manualUntil=0;
  const snapshot = async (reason = "update") => {
    if(capturing){if(reason==="manual-input")await capturing;else return capturing;}
    const capture=(async()=>{
    const visiblePage=streamPage||page;
    if (!visiblePage || visiblePage.isClosed()) return null;
    const image = await visiblePage.screenshot({ type: "jpeg", quality: Date.now()<manualUntil?50:65,timeout:2500, mask:[visiblePage.locator("input[type='password']")] }).catch(() => null);
    if (!image) return null;
    lastCaptureAt=Date.now();
    const state = { image: `data:image/jpeg;base64,${image.toString("base64")}`, capturedAt:Date.now(), url: visiblePage.url(), title: await visiblePage.title().catch(() => "Moodle"), viewport: VIEWPORT, reason };
    emit("snapshot", state);
    return state;
    })();
    capturing=capture;try{return await capture;}finally{capturing=null;}
  };
  const startCapture = () => {
    clearInterval(captureTimer);
    captureTimer = setInterval(() => {if(Date.now()<manualUntil||Date.now()-lastCaptureAt>1400)void snapshot("interval");},300);
  };
  const audit = (action, actor, extra = {}) => emit("audit", { action, actor: { uid: actor.uid, email: actor.email, role: actor.role }, ...extra });

  async function availability() {
    try {
      playwright = playwright || require("playwright");
      return { automationAvailable: Boolean(playwright?.chromium), viewport: VIEWPORT, operations: [...ALLOWED_OPERATIONS] };
    } catch (error) {
      return { automationAvailable: false, reason: "Playwright no está disponible.", detail: error.message };
    }
  }

  async function start(payload, actor) {
    const target = safeUrl(payload.url);
    // Reopening the viewer must not restart Chromium: Moodle uses session cookies.
    if(context && page && !page.isClosed() && actor.uid===ownerUid && target.origin===allowedOrigin){
      if(Object.prototype.hasOwnProperty.call(payload,"modelUrl"))modelUrl=payload.modelUrl?safeUrl(payload.modelUrl,allowedOrigin).href:"";
      if(payload.targetUrl)targetUrl=safeUrl(payload.targetUrl,allowedOrigin).href;
      return navigate({...payload,action:"open"},actor);
    }
    await close({}, actor, true);
    playwright = playwright || require("playwright");
    ownerUid = actor.uid;
    allowedOrigin = target.origin;
    modelUrl = payload.modelUrl ? safeUrl(payload.modelUrl, allowedOrigin).href : payload.courseView==="target"?"":target.href;
    targetUrl = payload.targetUrl ? safeUrl(payload.targetUrl, allowedOrigin).href : "";
    courseView = payload.courseView === "target" ? "target" : "model";
    const profileKey = createHash("sha256").update(`${actor.uid}:${allowedOrigin}`).digest("hex").slice(0, 24);
    const userDataDir = path.join(getPath("userData"), "sally-brown", profileKey);
    await fs.mkdir(userDataDir, { recursive: true });
    context = await playwright.chromium.launchPersistentContext(userDataDir, {
      headless: true, viewport: VIEWPORT, acceptDownloads: true,
      locale: "es-MX", serviceWorkers: "block"
    });
    if (requestAllowed) await context.route("**/*", async route => {
      try { if (await requestAllowed(route.request().url())) await route.continue(); else await route.abort("blockedbyclient"); }
      catch (_) { await route.abort("blockedbyclient"); }
    });
    page = context.pages()[0] || await context.newPage();
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        try { safeUrl(frame.url(), allowedOrigin); } catch (error) { emit("error", { message: error.message }); void page.goBack().catch(() => {}); }
      }
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    startCapture();
    audit("browser.started", actor, { origin: allowedOrigin });
    return snapshot("started");
  }

  async function close(_payload, actor, internal = false) {
    clearInterval(captureTimer); captureTimer = null;
    if (context) await context.close().catch(() => {});
    approvedPlanHash = ""; completedOperations.clear();
    context = null; page = null; streamPage=null; paused = false; cancelled = false;
    if (!internal) audit("browser.closed", actor);
    ownerUid = ""; allowedOrigin = "";
    return { closed: true };
  }

  async function navigate(payload, actor) {
    requireSession(actor);
    if (payload.courseView) courseView = payload.courseView === "target" ? "target" : "model";
    if(payload.url){if(courseView==="target")targetUrl=safeUrl(payload.url,allowedOrigin).href;else modelUrl=safeUrl(payload.url,allowedOrigin).href;}
    const action = String(payload.action || "open");
    if (action === "back") await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 });
    else if (action === "forward") await page.goForward({ waitUntil: "domcontentloaded", timeout: 30000 });
    else if (action === "reload") await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    else await page.goto(safeUrl(payload.url, allowedOrigin).href, { waitUntil: "domcontentloaded", timeout: 45000 });
    audit("browser.navigate", actor, { action });
    return snapshot("navigation");
  }

  async function input(payload, actor) {
    requireSession(actor);
    manualUntil=Date.now()+4000;
    const events=payload.kind==="batch"?payload.events:[payload];
    if(!Array.isArray(events)||!events.length||events.length>64)throw Error("Lote de entrada inválido.");
    if(events.some(event=>!["click","scroll","key","text"].includes(event.kind)))throw Error("Evento de entrada no permitido.");
    for(const event of events){
      if (event.kind === "click") await page.mouse.click(Number(event.x), Number(event.y), { button: event.button === "right" ? "right" : "left" });
      else if (event.kind === "scroll") await page.mouse.wheel(Number(event.deltaX || 0), Number(event.deltaY || 0));
      else if (event.kind === "key") await page.keyboard.press(String(event.key || "").slice(0, 80).replace(/^Control\+/,"ControlOrMeta+"));
      else if (event.kind === "text") await page.keyboard.insertText(String(event.text || "").slice(0, 4000));
    }
    paused = true;
    emit("status", { state: "paused", reason: "manual-control" });
    return snapshot("manual-input");
  }

  async function inspect(_payload, actor) {
    requireSession(actor);
    cancelled=false;
    if (!_payload.verify) {
      const view = _payload.courseView === "target" ? "target" : _payload.courseView === "model" ? "model" : courseView;
      const requested = _payload.url || (view === "target" ? targetUrl : modelUrl);
      if (!requested) throw new Error("Indica el curso que quieres analizar.");
      const destination = safeUrl(requested, allowedOrigin);
      if (view === "target") targetUrl=destination.href; else modelUrl=destination.href;
      if (page.url() !== destination.href) await page.goto(destination.href, {waitUntil:"domcontentloaded"});
      courseView=view;
    }
    if (/\/login\//.test(new URL(page.url()).pathname) || await page.locator("form[action*='/login/'] input[name='password']").count()) {
      await snapshot("login-required");
      throw new Error("Inicia sesión en Moodle en el panel central y pulsa Analizar de nuevo. El curso aún no es accesible.");
    }
    const courseUrl=courseView==="target"?targetUrl:modelUrl;
    const inventory=await collectTabbedCourse(page,courseUrl||page.url(),{
      cancelled:()=>cancelled,progress:message=>emit("status",{state:"inspecting",message}),snapshot:()=>snapshot("reading-tab")
    });
    if (!inventory.sections.length) {
      await snapshot("course-unavailable");
      throw new Error("No se encontró la estructura del curso visible. Verifica el acceso al curso y que Moodle terminó de cargar.");
    }
    inventory.courseView=courseView;
    audit("course.inspected", actor, { sections: inventory.sections.length, courseView });
    inventory.pages = []; inventory.warnings ||= [];
    const urls = [...new Set(inventory.sections.flatMap(section => section.modules.map(item => item.url)))]
      .filter(url => { try { return safeUrl(url, allowedOrigin) && /\/mod\/[^/]+\/view\.php/.test(new URL(url).pathname); } catch { return false; } });
    const reader = await context.newPage();
    streamPage=reader;
    let resourceAttempts=0;
    const publishProgress=()=>emit("inventory",{...inventory,pages:undefined,coverage:{discovered:urls.length,analyzed:inventory.pages.length,failed:inventory.warnings.length,complete:false},inProgress:true});
    publishProgress();
    try {
      for (const url of urls) {
        if (cancelled) break;
        resourceAttempts++;
        emit("status",{state:"inspecting",message:`Leyendo recurso ${resourceAttempts} de ${urls.length}…`});
        try {
        const response=await reader.goto(url, {waitUntil:"domcontentloaded",timeout:20000});
        await snapshot("reading-resource");
        if(response && !response.ok())throw new Error("resource-http-error");
        if(/\/login\//.test(new URL(reader.url()).pathname)||await reader.locator("form[action*='/login/'] input[name='password']").count())
          throw Object.assign(new Error("La sesión Moodle expiró durante el análisis. Inicia sesión y vuelve a analizar."),{loginRequired:true});
        const content = await reader.evaluate(() => {
          const root=document.querySelector("#region-main, main, [role='main'], #page-content, #content")||document.body;
          if(!root)throw new Error("resource-body-missing");
          const nodes = [...root.querySelectorAll("h1,h2,h3,p,li,table,img")];
          const exportRoot=root.cloneNode(true);
          exportRoot.querySelectorAll("script,style,form,input,button,select,textarea,iframe,object,embed,link,meta").forEach(node=>node.remove());
          for(const node of exportRoot.querySelectorAll("*"))for(const attribute of [...node.attributes]){
            if(attribute.name.startsWith("on"))node.removeAttribute(attribute.name);
            if(["href","src"].includes(attribute.name)){
              try{const url=new URL(attribute.value,location.href);if([...url.searchParams.keys()].some(key=>/sesskey|token|password/i.test(key)))node.removeAttribute(attribute.name);}catch{node.removeAttribute(attribute.name);}
            }
          }
          const exportedHtml=exportRoot.innerHTML;
          return {
            title:document.title,
            text:(root.innerText || "").slice(0,30000),
            html:exportedHtml.slice(0,100000),
            htmlTruncated:exportedHtml.length>100000,textTruncated:(root.innerText||"").length>30000,
            design:nodes.slice(0,80).map(node => {
              const s=getComputedStyle(node);
              return {tag:node.tagName,text:(node.textContent||"").trim().slice(0,500),font:s.fontFamily,size:s.fontSize,color:s.color,lineHeight:s.lineHeight,weight:s.fontWeight};
            })
          };
        });
        if(!content.text.trim())throw new Error("resource-empty");
        inventory.pages.push({url,...content});
        } catch(error) {
          if(error.loginRequired){inventory.warnings.push({url,code:"login-required",message:error.message});inventory.interrupted="login-required";break;}
          inventory.warnings.push({url,code:"resource-unreadable",message:"No se pudo leer este recurso; puede ser un archivo, enlace externo o una página no compatible."});
        }
        if((inventory.pages.length+inventory.warnings.length)%10===0)publishProgress();
      }
    } finally { streamPage=null;await reader.close(); }
    inventory.coverage = {discovered:urls.length,analyzed:inventory.pages.length,failed:inventory.warnings.length,complete:!cancelled&&inventory.pages.length===urls.length&&inventory.tabCoverage.complete};
    if(courseUrl)await page.goto(courseUrl,{waitUntil:"domcontentloaded",timeout:20000}).catch(()=>{});
    await snapshot("inspection");
    emit("inventory",{...inventory,pages:undefined,inProgress:false});
    return inventory;
  }

  async function selection(payload, actor) {
    requireSession(actor);
    const region = payload.region;
    if (!region || !["x","y","width","height"].every(key => Number.isFinite(region[key]) && region[key]>=0 && region[key]<=1) ||
      region.width<=0 || region.height<=0 || region.x+region.width>1.001 || region.y+region.height>1.001) throw new Error("Selección inválida.");
    const result = await page.evaluate(({region,viewport})=>{
      const x=(region.x+region.width/2)*viewport.width,y=(region.y+region.height/2)*viewport.height;
      const node=document.elementFromPoint(x,y);
      if(!node) return {text:"",tag:"",styles:{}};
      const content=node.closest("p,h1,h2,h3,li,td,figure,.activity-item") || node;
      const s=getComputedStyle(content);
      const activity=content.closest("[data-id],li.activity");
      return {text:(content.textContent||"").trim().slice(0,6000),tag:content.tagName,
        activityId:activity?.getAttribute("data-id")||activity?.id||"",
        styles:{font:s.fontFamily,size:s.fontSize,color:s.color,lineHeight:s.lineHeight,weight:s.fontWeight}};
    },{region,viewport:VIEWPORT});
    paused=true;
    return {...result,region,url:page.url(),title:await page.title(),capturedAt:new Date().toISOString()};
  }

  async function approve(payload, actor) {
    const plan = Array.isArray(payload.plan) ? payload.plan : [];
    if (!plan.length || plan.some((op) => !ALLOWED_OPERATIONS.has(op.type))) throw new Error("El plan contiene operaciones no permitidas.");
    approvedPlanHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    audit("plan.approved", actor, { operationCount: plan.length, planHash: approvedPlanHash });
    return { approved: true, planHash: approvedPlanHash };
  }

  async function checkpoint(payload,actor){
    requireSession(actor);
    const destination=safeUrl(payload.targetUrl||targetUrl,allowedOrigin);
    if(sameCourse(destination.href,modelUrl))throw Error("El curso modelo es de solo lectura.");
    targetUrl=destination.href;
    const checkpoints=[];
    for(const operation of payload.plan||[]){
      if(!sameCourse(operation.target,targetUrl))throw Error("El destino del registro no coincide con el plan.");
      let moduleId=operation.payload?.moduleId;
      if(!moduleId&&operation.selection?.courseView==="target"){
        const selected=safeUrl(operation.selection.url,allowedOrigin);
        if(/^\/mod\/(page|label)\/view\.php$/.test(selected.pathname))moduleId=selected.searchParams.get("id");
      }
      if(operation.type!=="create_or_update_resource"||!moduleId){checkpoints.push({operationId:operation.id,reversible:false,reason:"Esta operación no tiene reversión automática certificada."});continue;}
      if(!/^\d+$/.test(String(moduleId)))throw Error("Identificador de recurso inválido.");
      await reauthorize(actor.idToken);
      await page.goto(new URL("/course/modedit.php?update="+moduleId,allowedOrigin).href,{waitUntil:"domcontentloaded"});
      await validateResourceForm();
      const html=await page.locator("textarea[name*='content'],textarea[name*='intro']").first().inputValue();
      const visible=await page.locator("select[name='visible']").first().inputValue();
      if(html.length>100000)throw Error("El HTML anterior supera el límite de respaldo seguro. No se modificará.");
      const reversible=!!html&&["0","1"].includes(visible)&&cleanMoodleHtml(html)===html;
      checkpoints.push({operationId:operation.id,moduleId:String(moduleId),target:targetUrl,html,visible,hash:resourceHash(html,visible),reversible,
        reason:reversible?"":"El HTML o la visibilidad original requieren restauración manual; se conserva una copia exacta.",capturedAt:new Date().toISOString()});
    }
    await page.goto(targetUrl,{waitUntil:"domcontentloaded"});courseView="target";
    return {checkpoints};
  }

  async function ensureEditing() {
    const editSwitch = page.locator("input[name='setmode']").first();
    if (await editSwitch.count() && !(await editSwitch.isChecked().catch(() => false))) {
      await editSwitch.check();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return;
    }
    const editLink = page.locator("a[href*='edit=on'], a:has-text('Activar edición'), a:has-text('Turn editing on')").first();
    if (await editLink.count()) await editLink.click();
  }

  async function submitVisibleForm() {
    const submit = page.locator("form:visible input[type='submit'][name='submitbutton'], form:visible button[type='submit']:has-text('Guardar'), form:visible input[type='submit'][value*='Guardar'], form:visible button[type='submit']:has-text('Save')").first();
    if (!(await submit.count())) throw new Error("No se encontró el botón Guardar del Moodle certificado.");
    await submit.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  }

  async function createOrUpdateSection(operation) {
    await ensureEditing();
    const data = operation.payload || {};
    const title = String(data.title || operation.title || operation.intent || "Nueva sección").trim().slice(0, 255);
    const existing = page.locator("li.section, .course-section, [data-sectionid]").filter({ hasText: title }).first();
    if (await existing.count()) return { action: "existing", title };
    const add = page.locator("a:has-text('Añadir sección'), button:has-text('Añadir sección'), a:has-text('Add section'), button:has-text('Add section'), a.add-section").last();
    if (!(await add.count())) throw new Error("No se encontró ‘Añadir sección’. Activa edición y verifica el tema Moodle certificado.");
    await add.click();
    const name = page.locator("form:visible input[name='name'], form:visible input[id*='name']").first();
    if (!(await name.count())) throw new Error("Moodle no mostró el formulario de nueva sección esperado.");
    await name.fill(title);
    const summary = page.locator("form:visible textarea[name='summary'], form:visible textarea[id*='summary']").first();
    if (await summary.count()) await summary.fill(String(data.summary || "").slice(0, 20000));
    await submitVisibleForm();
    return { action: "created", title };
  }

  async function openActivityChooser(sectionTitle = "") {
    await ensureEditing();
    if(!sectionTitle)throw new Error("Indica el nombre exacto de la sección destino.");
    const sections=page.locator("li.section, .course-section, [data-sectionid]");
    const titles=await sections.evaluateAll(nodes=>nodes.map(node=>String(node.querySelector(".sectionname,h3,h2")?.textContent||"").replace(/\s+/g," ").trim()));
    const matches=titles.map((title,index)=>title===sectionTitle.trim()?index:-1).filter(index=>index>=0);
    if(matches.length!==1)throw new Error("La sección destino no existe o su nombre es ambiguo. No se creará contenido hasta identificarla de forma única.");
    const section=sections.nth(matches[0]);
    if (!(await section.count())) throw new Error("No se encontró la sección destino.");
    const add = section.locator("button:has-text('Añadir una actividad'), a:has-text('Añadir una actividad'), button:has-text('Add an activity'), a:has-text('Add an activity'), .activity-add a, .activity-add button").first();
    if (!(await add.count())) throw new Error("No se encontró el control para añadir una actividad o recurso.");
    await add.click();
  }

  async function chooseActivity(names) {
    const chooser = page.locator("[role='dialog']:visible, .modal:visible, .chooser:visible").last();
    for (const name of names) {
      const item = chooser.locator(`a:has-text('${name}'), button:has-text('${name}')`).first();
      if (await item.count()) { await item.click(); return; }
    }
    throw new Error(`El selector de actividades no ofrece ${names[0]}.`);
  }

  async function createOrUpdateResource(operation) {
    const data = operation.payload || {};
    if(String(data.html||data.text||"").length>100000)throw new Error("El contenido supera 100 000 caracteres. Divide el contenido en recursos antes de aprobar.");
    if(data.moduleId){
      if(!["append","replace"].includes(data.mode))throw new Error("Indica si se debe añadir o reemplazar el contenido.");
      if(!/^\d+$/.test(String(data.moduleId)))throw new Error("Identificador de recurso inválido.");
      const editUrl=new URL("/course/modedit.php?update="+data.moduleId,allowedOrigin).href;
      await page.goto(editUrl,{waitUntil:"domcontentloaded"});
      await validateResourceForm();
      const editor=page.locator("textarea[name*='content'],textarea[name*='intro']").first();
      if(!await editor.count())throw new Error("No se encontró un editor HTML compatible.");
      const old=await editor.inputValue();
      const oldVisible=await page.locator("select[name='visible']").first().inputValue();
      if(!data.expectedHash||data.expectedHash!==resourceHash(old,oldVisible))throw Error("El recurso cambió o falta su respaldo. Prepara y aprueba de nuevo antes de modificarlo.");
      const html=String(data.html||"");if(!html)throw new Error("El contenido propuesto está vacío.");
      await writeResourceEditor(editor,data.mode==="append"?old+"\n"+html:html);
      await setResourceVisibility(data.visibility||"keep");
      await submitVisibleForm();
      await page.goto(editUrl,{waitUntil:"domcontentloaded"});
      await validateResourceForm();
      await verifyResourceContent(html,data.visibility||"keep");
      const afterHtml=await page.locator("textarea[name*='content'],textarea[name*='intro']").first().inputValue();
      const afterVisible=await page.locator("select[name='visible']").first().inputValue();
      await page.goto(targetUrl,{waitUntil:"domcontentloaded"});
      return {action:"updated",resourceId:String(data.moduleId),visibility:data.visibility||"keep",verified:true,afterHash:resourceHash(afterHtml,afterVisible),afterHtml,afterVisible};
    }
    if (operation.selection?.courseView === "target") {
      const selected = operation.selection;
      const selectedUrl = safeUrl(selected.url, allowedOrigin);
      const cmId = selectedUrl.searchParams.get("id");
      if (!/^\/mod\/(page|label)\/view\.php$/.test(selectedUrl.pathname) || !/^\d+$/.test(cmId || ""))
        throw new Error("Abre la página o etiqueta destino y vuelve a marcar el texto que quieres modificar.");
      await page.goto(new URL("/course/modedit.php?update="+cmId, allowedOrigin).href,{waitUntil:"domcontentloaded"});
      const courseField = page.locator("input[name='course']").first();
      const expectedCourse = new URL(targetUrl).searchParams.get("id");
      if (!(await courseField.count()) || await courseField.inputValue() !== expectedCourse)
        throw new Error("El recurso marcado no pertenece al curso destino.");
      const editor=page.locator("textarea[name*='content'],textarea[name*='intro']").first();
      if (!(await editor.count())) throw new Error("No se encontró el contenido editable del recurso.");
      const oldHtml=await editor.inputValue();
      const oldVisible=await page.locator("select[name='visible']").first().inputValue();
      if(!data.expectedHash||data.expectedHash!==resourceHash(oldHtml,oldVisible))throw Error("El recurso marcado cambió o falta su respaldo. Prepara y aprueba de nuevo.");
      const text=String(selected.text||"").trim();
      if(!text || !oldHtml.includes(text)) throw new Error("El texto marcado cambió o contiene formato complejo. Vuelve a seleccionar un bloque de texto.");
      const replacement=String(data.html||data.text||"");
      if(!replacement)throw new Error("La propuesta está vacía.");
      await editor.evaluate((node,value)=>{
        node.value=value;
        const tiny=window.tinymce?.get(node.id);
        if(tiny)tiny.setContent(value);
        node.dispatchEvent(new Event("input",{bubbles:true}));node.dispatchEvent(new Event("change",{bubbles:true}));
      },oldHtml.replace(text,replacement));
      await setResourceVisibility(data.visibility||"keep");
      await submitVisibleForm();
      await page.goto(new URL("/course/modedit.php?update="+cmId,allowedOrigin).href,{waitUntil:"domcontentloaded"});
      await validateResourceForm();await verifyResourceContent(replacement,data.visibility||"keep");
      await page.goto(targetUrl,{waitUntil:"domcontentloaded"});
      return {action:"updated",resourceId:cmId,selection:selected.region};
    }
    await openActivityChooser(String(data.sectionTitle || ""));
    const isLabel = data.kind === "label";
    await chooseActivity(isLabel ? ["Etiqueta", "Text and media area", "Label"] : ["Página", "Page"]);
    const name = page.locator("form:visible input[name='name'], form:visible input[id*='name']").first();
    if (!isLabel && await name.count()) await name.fill(String(data.title || operation.title || "Contenido").slice(0, 255));
    const editor = page.locator("form:visible textarea[name*='content'], form:visible textarea[id*='content'], form:visible textarea[name*='intro'], form:visible textarea[id*='intro']").first();
    if (!(await editor.count())) throw new Error("No se encontró el editor de contenido esperado.");
    await writeResourceEditor(editor,String(data.html || data.text || operation.intent || "").slice(0, 100000));
    await setResourceVisibility(data.visibility||"keep");
    await submitVisibleForm();
    if(!isLabel){
      await page.goto(targetUrl,{waitUntil:"domcontentloaded"});
      const link=page.locator("a[href*='/mod/page/view.php']").filter({hasText:String(data.title||operation.title||"Contenido")});
      if(await link.count()!==1)throw new Error("Moodle recibió el guardado, pero no se pudo identificar el recurso de forma única. Revisa el curso antes de repetir.");
      const id=new URL(await link.getAttribute("href"),allowedOrigin).searchParams.get("id");
      await page.goto(new URL("/course/modedit.php?update="+id,allowedOrigin).href,{waitUntil:"domcontentloaded"});
      await validateResourceForm();await verifyResourceContent(String(data.html||data.text||""),data.visibility||"keep");
      await page.goto(targetUrl,{waitUntil:"domcontentloaded"});
    }
    return { action: "created", type: isLabel ? "label" : "page", title: data.title || "Contenido" };
  }

  async function validateResourceForm(){
    const course=page.locator("input[name='course']").first();
    if(!await course.count()||await course.inputValue()!==new URL(targetUrl).searchParams.get("id"))throw new Error("El recurso no pertenece al curso destino aprobado.");
    const type=page.locator("input[name='modulename']").first();
    if(!await type.count()||!["page","label"].includes(await type.inputValue()))throw new Error("Solo se admite editar HTML de páginas y áreas de texto; no cuestionarios ni actividades de otro tipo.");
  }
  async function writeResourceEditor(editor,html){
    await editor.evaluate((node,value)=>{node.value=value;window.tinymce?.get(node.id)?.setContent(value);node.dispatchEvent(new Event("input",{bubbles:true}));node.dispatchEvent(new Event("change",{bubbles:true}));},html);
  }
  async function setResourceVisibility(visibility){
    if(visibility==="keep")return;
    if(!["hidden","visible"].includes(visibility))throw new Error("Visibilidad no admitida.");
    const field=page.locator("select[name='visible']").first();
    if(!await field.count())throw new Error("No se encontró el control de visibilidad Moodle. No se guardará el recurso.");
    await field.selectOption(visibility==="hidden"?"0":"1",{force:true});
  }
  async function verifyResourceContent(html,visibility){
    const editor=page.locator("textarea[name*='content'],textarea[name*='intro']").first();
    const matches=await editor.evaluate((node,expected)=>{const parse=value=>{const d=new DOMParser().parseFromString(value,"text/html");return d.body.textContent.replace(/\s+/g," ").trim();};return parse(node.value).includes(parse(expected));},html);
    if(!matches)throw new Error("Moodle no conservó el texto esperado. Revisa el recurso antes de repetir.");
    if(visibility!=="keep"&&await page.locator("select[name='visible']").inputValue()!==(visibility==="hidden"?"0":"1"))throw new Error("No se pudo verificar la visibilidad solicitada. Revisa el recurso.");
  }

  async function createQuiz(operation) {
    const data = operation.payload || {};
    await openActivityChooser(String(data.sectionTitle || ""));
    await chooseActivity(["Cuestionario", "Quiz"]);
    const name = page.locator("form:visible input[name='name'], form:visible input[id*='name']").first();
    if (!(await name.count())) throw new Error("No se encontró el nombre del cuestionario.");
    await name.fill(String(data.title || operation.title || "Cuestionario").slice(0, 255));
    const intro = page.locator("form:visible textarea[name*='intro'], form:visible textarea[id*='intro']").first();
    if (await intro.count()) await intro.fill(String(data.description || operation.intent || "").slice(0, 20000));
    await submitVisibleForm();
    return { action: "created", type: "quiz", title: data.title || "Cuestionario", questionsPending: Array.isArray(data.questions) ? data.questions.length : 0 };
  }

  async function uploadAsset(operation) {
    const data = operation.payload || {};
    const asset = Array.isArray(data.assets) ? data.assets[0] : data;
    let filePath = String(asset.localPath || "");
    let temporary = false;
    if (!filePath && asset.url) {
      const source = safeUrl(asset.url);
      if (!["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(source.hostname)) throw new Error("Solo se aceptan adjuntos procedentes del Storage de Charly Brown.");
      const response = await fetch(source.href,{redirect:"error",signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error("No se pudo recuperar el adjunto aprobado.");
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>30*1024*1024)throw new Error("El adjunto supera 30 MB.");chunks.push(chunk);}
      const bytes = Buffer.concat(chunks);
      const safeName = String(asset.name || "adjunto.bin").replace(/[^a-zA-Z0-9._-]+/g, "_");
      filePath = path.join(getPath("temp"), `sally-${Date.now()}-${safeName}`);
      await fs.writeFile(filePath, bytes, { flag: "wx" }); temporary = true;
    }
    if (!filePath || !path.isAbsolute(filePath)) throw new Error("La carga requiere un archivo aprobado.");
    await fs.access(filePath);
    await openActivityChooser(String(data.sectionTitle || ""));
    await chooseActivity(["Archivo", "File"]);
    const name = page.locator("form:visible input[name='name'], form:visible input[id*='name']").first();
    if (await name.count()) await name.fill(String(data.title || path.basename(filePath)).slice(0, 255));
    const input = page.locator("form:visible input[type='file']").first();
    if (!(await input.count())) throw new Error("El selector de archivos de este Moodle requiere un adaptador adicional.");
    try { await input.setInputFiles(filePath); await submitVisibleForm(); }
    finally { if (temporary) await fs.unlink(filePath).catch(() => {}); }
    return { action: "uploaded", title: asset.title || asset.name || path.basename(filePath) };
  }

  async function execute(payload, actor) {
    requireSession(actor);
    const plan = Array.isArray(payload.plan) ? payload.plan : [];
    const hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    if (!approvedPlanHash || hash !== approvedPlanHash) throw new Error("El plan cambió y requiere una nueva aprobación.");
    const destination = safeUrl(payload.targetUrl || targetUrl, allowedOrigin);
    if (sameCourse(destination.href,modelUrl)) throw new Error("El curso modelo es de referencia. Selecciona otro curso destino.");
    if (plan.some(op => op.type !== "inspect_course" && safeUrl(op.target, allowedOrigin).href !== destination.href))
      throw new Error("El destino cambió después de aprobar el plan.");
    targetUrl = destination.href;
    paused = false; cancelled = false;
    const results = [];
    let executionError="";
    try {
    for (const operation of plan) {
      if (cancelled) break;
      if (paused) { emit("status", { state: "paused" }); break; }
      if (!ALLOWED_OPERATIONS.has(operation.type)) throw new Error("Operación no permitida.");
      const id = String(operation.id || "");
      if (id && completedOperations.has(id)) { results.push({ id, status: "skipped" }); continue; }
      emit("operation", { id, type: operation.type, status: "running" });
      await reauthorize(actor.idToken);
      if (operation.type !== "inspect_course") {
        if (!targetUrl) throw new Error("Falta el curso destino.");
        if (courseView !== "target") {
          await page.goto(targetUrl, {waitUntil:"domcontentloaded"});
          courseView = "target";
        }
      }
      let result;
      if (["inspect_course", "verify_result"].includes(operation.type)) result = await inspect({verify:operation.type==="verify_result"}, actor);
      else if (operation.type === "create_or_update_section") result = await createOrUpdateSection(operation);
      else if (operation.type === "create_or_update_resource") result = await createOrUpdateResource(operation);
      else if (operation.type === "upload_asset") result = await uploadAsset(operation);
      else if (operation.type === "create_quiz") result = await createQuiz(operation);
      else if (operation.type === "create_quiz_description") {
        if(!(process.env.SALLY_CERTIFIED_COURSES||"").split(",").includes(targetUrl))throw Error("Curso no certificado para edición de preguntas.");
        result=await createDescription(page,operation,{courseUrl:targetUrl,authorize:()=>reauthorize(actor.idToken),fillHtml:async html=>{
          const editor=page.locator('textarea[name="questiontext[text]"]');if(await editor.count()!==1)throw Error("Editor de pregunta no reconocido.");
          await editor.evaluate((n,value)=>{n.value=value;const editor=window.tinymce?.get(n.id);if(editor)editor.setContent(value);n.dispatchEvent(new Event("input",{bubbles:true}));},html);
        }});
      }
      else if (operation.type === "reorder_item") throw new Error("El reordenamiento requiere identificadores del inventario del Moodle certificado.");
      if (id) completedOperations.add(id);
      results.push({ id, status: "completed", result });
      emit("operation", { id, type: operation.type, status: "completed" });
    }
    }catch(error){executionError=String(error.message||"La ejecución se interrumpió.").split("Call log:")[0].replace(/https?:\/\/[^\s]+/g,"[sitio]").slice(0,1000);if(!results.length)throw error;}
    audit("plan.executed", actor, { completed: results.length });
    return { state: executionError?"failed":cancelled ? "cancelled" : paused ? "paused" : "completed", results,...(executionError?{error:executionError}:{}) };
  }

  return {
    authorize, availability, start, close, navigate, input, inspect, selection, approve, execute, checkpoint,
    observe:async(_payload,actor)=>{requireSession(actor);return snapshot("agent-observation");},
    inspectQuiz:async(payload,actor)=>{requireSession(actor);safeUrl(payload.url,allowedOrigin);await reauthorize(actor.idToken);const result=await readQuiz(page,payload);await snapshot("inspection");return result;},
    readModule:async(payload,actor)=>{requireSession(actor);const u=safeUrl(payload.url,allowedOrigin);if(!/^\/mod\/[a-z]+\/view\.php$/.test(u.pathname))throw Error("Ruta de recurso no permitida.");await reauthorize(actor.idToken);await page.goto(u.href,{waitUntil:"domcontentloaded",timeout:30000});
      if(await page.locator('input[type="password"]').count())throw Error("Inicia sesión en Moodle para leer el recurso.");
      const data=await page.locator('#region-main,main').first().evaluate(n=>{const clone=n.cloneNode(true);clone.querySelectorAll("script,style,form,input").forEach(e=>e.remove());return {text:clone.textContent,html:clone.innerHTML};});
      await snapshot("inspection");return {url:u.href,title:await page.title(),...data};},
    control: async (payload, actor) => {
      requireSession(actor);
      const action = String(payload.action || "");
      if (action === "pause") paused = true;
      else if (action === "resume") { paused = false; cancelled = false; }
      else if (action === "cancel") { cancelled = true; paused = false; }
      else throw new Error("Control no permitido.");
      audit(`execution.${action}`, actor);
      emit("status", { state: action === "resume" ? "running" : `${action}led`.replace("pauselled", "paused") });
      return { ok: true, action };
    }
  };
}

module.exports = { createSallyBrownController, resolveAccess, safeUrl, ALLOWED_OPERATIONS };
