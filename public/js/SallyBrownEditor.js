import { collectCourseInventories, resolveChatRequest } from "./sally-workflow.js";
import { createRemoteBrowser } from "./sally-remote.js";
import { courseReport } from "./sally-report.js";
import { rememberSession, restoredSession } from "./sally-session-selection.js";
import { appendHistory, loadHistory, readPrivateJson } from "./sally-history.js";
import { installConversations } from "./sally-conversation-ui.js";
import { messagesFor, conversationOf, legacyId, contextFor, reusableInventory } from "./sally-conversations.js";
import { fillTemplate, contentMatches } from "./sally-template.js";
import { createTemplateStore } from "./sally-template-store.js";
import { installTemplateManager } from "./sally-template-manager.js";
import { installTasks } from "./sally-tasks.js";
import { proposeCourseChanges, answerCourseQuestion } from "./sally-proposal.js";
import { bindSelection } from "./sally-selection.js";
import { installUserImport } from "./sally-user-import.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, updateDoc, where, arrayUnion } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { deleteObject, getDownloadURL, getStorage, listAll, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";
import { canonicalApprovalStatus, resolveApprovedUserProfile } from "./user-approval.js";
import { sanitizeTextInput, sanitizeHtml } from "./security-utils.js";

const app = getDefaultFirebaseApp();
const auth = getAuth(app); const db = getFirestore(app); const storage = getStorage(app);
const COLLECTION = "SallyBrownSessions";
const el = (id) => document.getElementById(id);
const state = { targetInventory: null, workflowBusy: false, courseView: "target", marking: false, selection: null, user: null, access: null, sessions: [], activeId: "", filter: "active", plan: [], planHash: "", inventory: null, attachments: [], automation: false, viewport: { width: 1440, height: 900 }, unsubscribe: [], eventOff: null };
state.chatThread="unified";state.chatDrafts={unified:""};

function canonicalRole(value = "") { return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, ""); }
async function findProfile(user) {
  const direct = await getDoc(doc(db, "users", user.uid)).catch(() => null);
  if (direct?.exists()) return direct.data() || {};
  for (const [field, value] of [["uid", user.uid], ["email", user.email], ["email", String(user.email || "").toLowerCase()]]) {
    if (!value) continue;
    const snap = await getDocs(query(collection(db, "users"), where(field, "==", value), limit(1))).catch(() => null);
    if (snap && !snap.empty) return snap.docs[0].data() || {};
  }
  return {};
}
async function authorizePage(user) {
  if (!user) return null;
  const [profile, tokenResult] = await Promise.all([findProfile(user), user.getIdTokenResult().catch(() => null)]);
  const profileAccess = resolveApprovedUserProfile(profile); const claimAccess = resolveApprovedUserProfile(tokenResult?.claims || {});
  const explicitProfileStatus = canonicalApprovalStatus(profile.approvalStatus || profile.status || profile.estado || profile.estadoAprobacion || profile.aprobado);
  const role = canonicalRole(profileAccess.role || claimAccess.role);
  const approved = ["pending", "rejected"].includes(explicitProfileStatus) ? false : (profileAccess.approved || claimAccess.approved);
  if (!approved || !role || ["pending", "pendiente"].includes(role)) return null;
  return { role, approved: true, profile };
}
function redirectDenied() { window.location.replace("index.html"); }
function toast(message) { const node = el("sallyToast"); node.textContent = message; node.classList.add("is-visible"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("is-visible"), 2800); }
function activeSession() { return state.sessions.find((item) => item.id === state.activeId) || null; }
function safeText(value, max = 4000) { return sanitizeTextInput(String(value || "").slice(0, max)); }
function nowIso() { return new Date().toISOString(); }
function bounded(promise,milliseconds,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));}
function draftFromForm() { state.chatDrafts.unified=el("sallyBrief").value;return { brief: el("sallyBrief").value, chatDrafts:{...state.chatDrafts},chatThread:"unified", modelCourse: el("sallyNoModel").checked?"":safeText(el("sallySourceCourse").value, 1000), sourceCourse:el("sallyNoModel").checked?"":safeText(el("sallySourceCourse").value, 1000), targetCourse: safeText(el("sallyTargetCourse").value, 1000),modelDisabled:el("sallyNoModel").checked }; }
function entryThread(entry){return entry.thread||entry.courseView||(["plan","execution","checkpoint"].includes(entry.kind)?"target":"model");}
async function selectChat(thread){
  if(state.conversations){await state.conversations.selectThread(thread);return;}
  if(state.workflowBusy)return toast("Espera a que termine la operación actual.");
  state.chatDrafts[state.chatThread]=el("sallyBrief").value;
  state.chatThread=thread;el("sallyBrief").value=state.chatDrafts[thread]||"";
  renderChatScope();
  state.workflowBusy=true;
  try{
    await saveSession({chatThread:thread,chatDrafts:{...state.chatDrafts}});
    const url=el(thread==="model"?"sallySourceCourse":"sallyTargetCourse").value.trim();
    if(url&&state.automation){state.workflowBusy=true;await switchCourse(thread);}
    else{state.courseView=thread;state.marking=false;state.selection=null;el("sallyMark").hidden=true;el("sallyBrowserImage").hidden=true;el("sallyEmptyBrowser").hidden=false;}
  }catch(error){workflowMessage(error.message);toast(error.message);}finally{state.workflowBusy=false;}
}
function renderChatScope(){
  const noModel=el("sallyNoModel").checked;el("sallySourceCourse").disabled=noModel;el("sallyOpenModelEndpoint").disabled=noModel;
  el("sallyBuildPlan").title="Enviar mensaje";el("sallyBuildPlan").setAttribute("aria-label","Enviar mensaje");
  renderConversation();
}
function operationLabel(type) { return ({ inspect_course: "Analizar curso", create_or_update_course:"Crear o actualizar curso",create_or_update_section: "Crear o actualizar secciones", create_or_update_resource: "Insertar contenido y HTML",create_moodle_module:"Crear módulo Moodle",create_meta_link:"Configurar metacurso",browser_workflow:"Acción administrativa Moodle", upload_asset: "Adjuntar archivos e imágenes", create_quiz: "Crear cuestionario", reorder_item: "Ordenar elementos", verify_result: "Verificar resultado" })[type] || type; }

async function invoke(command, payload = {}) {
  if (!state.remote) throw new Error("El navegador remoto aún no está conectado.");
  return state.remote.invoke(command, payload);
}

function bindSessionListeners() {
  state.unsubscribe.forEach((off) => off()); state.unsubscribe = [];
  const own = query(collection(db, COLLECTION), where("ownerId", "==", state.user.uid));
  const shared = query(collection(db, COLLECTION), where("collaborators", "array-contains", state.user.uid));
  const buckets = new Map();
  const apply = (key, snapshot) => {
    buckets.set(key,snapshot.docs.map(d=>({id:d.id,...d.data()})));
    const merged=new Map();[...buckets.values()].flat().forEach(item=>merged.set(item.id,item));
    state.sessions=[...merged.values()].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    renderSessions();
    const restored=restoredSession(localStorage,state.user.uid,state.sessions,{ready:buckets.size===2,activeId:state.activeId});
    if(restored!==null&&restored!==state.activeId)selectSession(restored);
  };
  state.unsubscribe.push(onSnapshot(own, (snap) => apply("own", snap), (error) => { el("sallySessionStatus").textContent = error.code === "permission-denied" ? "Acceso a sesiones denegado: verifica la aprobación y las reglas publicadas." : "No fue posible cargar sesiones."; }));
  state.unsubscribe.push(onSnapshot(shared, (snap) => apply("shared", snap), () => apply("shared", { docs: [] })));
}

function renderSessions() {
  const search = el("sallySessionSearch").value.trim().toLowerCase();
  const sessions = state.sessions.filter((item) => Boolean(item.archived) === (state.filter === "archived") && (!search || String(item.title || "").toLowerCase().includes(search)));
  el("sallySessionStatus").textContent = `${sessions.length} ${sessions.length === 1 ? "sesión" : "sesiones"}`;
  el("sallySessionList").innerHTML = sessions.length ? sessions.map((item) => `<article class="sally-session ${item.id === state.activeId ? "is-active" : ""}" data-session-id="${item.id}"><span class="sally-session__icon"><i class="fas fa-book-open"></i></span><div class="sally-session__copy"><strong>${escapeHtml(item.title || "Nueva sesión")}</strong><span>${escapeHtml(item.status || "draft")} · ${formatDate(item.updatedAt)}</span></div><button class="sally-session__menu-btn" data-menu-session="${item.id}" aria-label="Menú de ${escapeHtml(item.title || "sesión")}"><i class="fas fa-ellipsis"></i></button><div class="sally-session__menu" data-session-menu="${item.id}" hidden><button data-session-action="rename" title="Renombrar" aria-label="Renombrar"><i class="fas fa-pen"></i></button><button data-session-action="archive" title="${item.archived ? "Restaurar" : "Archivar"}" aria-label="${item.archived ? "Restaurar" : "Archivar"}"><i class="fas fa-box-archive"></i></button><button class="danger" data-session-action="delete" title="Eliminar" aria-label="Eliminar"><i class="fas fa-trash"></i></button></div></article>`).join("") : `<div class="sally-empty-compact">No hay sesiones ${state.filter === "archived" ? "archivadas" : "activas"}.</div>`;
}
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value || ""); return node.innerHTML; }
function formatDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(date) : "ahora"; }
async function createSession() {
  if(state.workflowBusy)return toast("Espera a que termine la operación actual.");
  const id=crypto.randomUUID(),createdAt=nowIso();
  const session={ownerId:state.user.uid,collaborators:[],title:"Nuevo curso Moodle",status:"draft",archived:false,sourceCourse:"",targetCourse:"",createdAt,updatedAt:createdAt};
  await setDoc(doc(db,COLLECTION,id),session);
  if(!state.sessions.some(item=>item.id===id))state.sessions.push({id,...session});
  selectSession(id);
}
function selectSession(id) {
  if(state.workflowBusy)return toast("Espera a que termine el análisis antes de cambiar de sesión.");
  state.conversations?.stash();state.conversationId=legacyId("unified");state.approvalBinding=null;state.selectedTemplate=null;
  state.remote?.setSession(id);
  el("sallyBrowserImage").hidden=true;el("sallyEmptyBrowser").hidden=false;
  state.selection=null;state.marking=false;el("sallyMark").hidden=true;
  state.activeId = id; const session = activeSession();
  state.lastFrameAt=0;
  state.checkpointId=session?.checkpointId||"";
  state.chatThread="unified";
  state.chatDrafts={unified:session?.brief||"",...(session?.chatDrafts||{})};
  state.history=[];state.historyLoading=true;renderConversation();void restoreSessionContent(session);
  rememberSession(localStorage,state.user.uid,id);
  state.filter=session?.archived?"archived":"active";
  document.querySelectorAll("[data-session-filter]").forEach(button=>button.classList.toggle("is-active",button.dataset.sessionFilter===state.filter));
  el("sallyBrief").value = state.chatDrafts.unified || ""; el("sallySourceCourse").value = session?.modelCourse || session?.sourceCourse || ""; el("sallyTargetCourse").value = session?.targetCourse || "";el("sallyNoModel").checked=Boolean(session?.modelDisabled);
  renderChatScope();
  el("sallyMoodleUrl").value = session?.moodleUrl || session?.sourceCourse || ""; state.plan = []; state.planHash = ""; state.inventory = null; state.targetInventory=null; state.attachments = [];
  renderSessions(); renderPlan(); renderInventory(); renderAttachments(); updateApprovalUi(session?.status || "draft"); closeDrawers();
}
async function saveSession(patch = {}) {
  if (!state.activeId) return;
  // Conversation content stays in immutable private history, never in the project document.
  const project={},content={};
  for(const [key,value] of Object.entries(patch)){
    if(["modelCourse","sourceCourse","targetCourse","moodleUrl","modelDisabled"].includes(key))project[key]=value;
    else content[key]=value;
  }
  if(Object.keys(content).length)await recordConversation({kind:"state",patch:content,text:""});
  await updateDoc(doc(db,COLLECTION,state.activeId),{...project,updatedAt:nowIso()});
}
async function sessionAction(id, action) {
  const session = state.sessions.find((item) => item.id === id); if (!session || session.ownerId !== state.user.uid) return toast("Solo el propietario puede realizar esta acción.");
  if (action === "rename") { const title = safeText(window.prompt("Nombre de la sesión", session.title || "") || "", 120); if (title) await updateDoc(doc(db, COLLECTION, id), { title, updatedAt: nowIso() }); }
  if (action === "archive") await updateDoc(doc(db, COLLECTION, id), { archived: !session.archived, updatedAt: nowIso() });
  if (action === "delete" && window.confirm(`¿Eliminar “${session.title || "esta sesión"}” y sus evidencias?`)) { const removeTree = async (folder) => { const listing = await listAll(folder).catch(() => null); if (!listing) return; await Promise.all(listing.prefixes.map(removeTree)); await Promise.all(listing.items.map((item) => deleteObject(item).catch(() => {}))); }; await removeTree(ref(storage, `sallyBrown/${state.user.uid}/${id}`)); await deleteDoc(doc(db, COLLECTION, id)); if (state.activeId === id) selectSession(""); }
}

function workflowMessage(message) {
  el("sallyApprovalHint").textContent=message;
}
async function recordConversation(entry){
  if(state.historyLoading)throw Error("Espera a que se carguen las conversaciones.");
  const {sessionId:explicitSession,...data}=entry;
  const id=explicitSession||state.activeId;if(!id)return;
  const record=await appendHistory(storage,state.user.uid,id,{thread:state.chatThread,conversationId:state.conversationId||legacyId(state.chatThread),...data});
  if(state.activeId===id){state.history=[...(state.history||[]),record];renderConversation();renderTemplateList();state.conversations?.refresh();}
  await updateDoc(doc(db,COLLECTION,id),{historyUpdatedAt:nowIso(),historyAuthors:arrayUnion(state.user.uid)});
  return record;
}
function renderConversation(){
  const node=el("sallyConversation");if(!node)return;node.replaceChildren();
  state.historyExpanded ||= new Map();
  // Sort a copy: the stored chronology and the AI conversation remain intact.
  const entries=(state.history||[]).map((entry,index)=>({entry,index})).filter(({entry})=>!["conversation","state"].includes(entry.kind)&&conversationOf(entry)===(state.conversationId||legacyId(state.chatThread)))
    .sort((a,b)=>(Date.parse(b.entry.createdAt)||0)-(Date.parse(a.entry.createdAt)||0)||b.index-a.index).map(({entry})=>entry);
  for(const [index,entry] of entries.entries()){
    const item=document.createElement("details"),summary=document.createElement("summary"),preview=document.createElement("span");
    const key=JSON.stringify([state.activeId,state.chatThread,entry.id||entry.path||entry.createdAt]);
    item.className="sally-history-entry";item.dataset.historyId=entry.id||"";
    item.open=state.historyExpanded.has(key)?state.historyExpanded.get(key):index===0;
    summary.addEventListener("click",()=>state.historyExpanded.set(key,!item.open));
    const article=document.createElement("article"),heading=document.createElement("strong"),text=document.createElement("div");
    heading.textContent=`${entry.role==="user"?"Tú":"Sally"} · ${new Date(entry.createdAt).toLocaleString("es")}`;
    preview.className="sally-history-preview";preview.textContent=(entry.text||"Registro del historial").replace(/\s+/g," ").slice(0,140);
    summary.append(heading,preview);item.append(summary,article);
    text.className="sally-history-text";text.textContent=entry.kind==="analysis"?"Análisis guardado. Abre sus resultados para consultar el reporte y el inventario completos.":entry.text||"";article.append(text);
    if(entry.questions?.length){const questions=document.createElement("p");questions.textContent=entry.questions.join("\n");questions.className="sally-history-text";article.append(questions);}
    if(entry.incomplete){const warning=document.createElement("p");warning.textContent="El proveedor interrumpió esta respuesta. Se conservó todo lo recibido; solicita continuar.";article.append(warning);}
    if(entry.role==="assistant"){const results=document.createElement("button");results.className="sally-icon";results.title="Ver resultados de esta respuesta";results.setAttribute("aria-label",results.title);results.innerHTML='<i class="fas fa-columns"></i>';results.onclick=()=>state.conversations.open(entry.id);article.append(results);}
    if(entry.text){const share=document.createElement("button");share.className="sally-icon";share.title="Compartir referencia con otra conversación";share.setAttribute("aria-label",share.title);share.innerHTML='<i class="fas fa-share"></i>';share.onclick=()=>void state.conversations.share(entry).catch(error=>toast(error.message));article.append(share);}
    if(entry.kind==="execution"&&entry.result?.results?.some(item=>item.result?.afterHash)){const undo=document.createElement("button");undo.className="sally-icon";undo.title="Preparar reversión de este cambio";undo.setAttribute("aria-label",undo.title);undo.innerHTML='<i class="fas fa-rotate-left"></i>';undo.onclick=()=>void prepareReversal(entry).catch(error=>toast(error.message));article.append(undo);}
    if(entry.inventoryPath){const button=document.createElement("button");button.className="sally-icon";button.title="Descargar análisis completo";button.setAttribute("aria-label",button.title);button.innerHTML='<i class="fas fa-download"></i>';button.onclick=async()=>{try{const data=await readPrivateJson(storage,entry.inventoryPath);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=`analisis-${entry.runId||entry.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){toast(error.message);}};article.append(button);}
    node.append(item);
  }
}
async function restoreSessionContent(session){
  if(!session){state.historyLoading=false;return;}const id=session.id;
  try{
    const history=await loadHistory(storage,session);if(state.activeId!==id)return;
    state.history=[...new Map([...history,...(state.history||[])].map(entry=>[entry.id,entry])).values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));renderConversation();renderTemplateList();
    for(const [view,inventory] of [["model",session.inventory],["target",session.targetInventory]]){
      if(inventory?.storagePath&&!state.history.some(entry=>entry.inventoryPath===inventory.storagePath))state.history.push({id:`inherited-${view}`,conversationId:legacyId(view),thread:view,courseView:view,kind:"analysis",role:"assistant",createdAt:session.updatedAt||nowIso(),inventoryPath:inventory.storagePath,text:"Resultado heredado del proyecto; vinculación original no disponible.\n"+(inventory.report||"")});
    }
    if(session.plan?.length&&!state.history.some(e=>e.plan))state.history.push({id:"inherited-plan",conversationId:legacyId("target"),thread:"target",kind:"plan",role:"assistant",createdAt:session.updatedAt||nowIso(),plan:session.plan,text:"Plan heredado del proyecto; vinculación original no disponible. Requiere una nueva aprobación."});
    for(const thread of ["model","target"]){
      const brief=session.chatDrafts?.[thread]||(thread==="model"?session.brief:"")||"";
      if(brief&&!state.history.some(e=>conversationOf(e)===legacyId(thread)&&e.kind==="state"))state.history.push({id:`inherited-draft-${thread}`,conversationId:legacyId(thread),thread,kind:"state",createdAt:session.createdAt||"",patch:{brief},text:""});
    }
    if(state.activeId===id){state.historyLoading=false;await state.conversations?.restore();}
  }catch(error){if(state.activeId===id){state.historyLoading=false;renderConversation();toast("No se pudo cargar el historial: "+error.message);}}
}
function renderTemplateList(){
  if(state.templateManager){state.templateManager.refresh();return;}
  const select=el("sallyTemplateList");if(!select)return;const previous=select.value;
  select.replaceChildren(new Option("Nueva plantilla",""));
  for(const entry of messagesFor(state.history||[],state.conversationId||legacyId(state.chatThread)))if(entry.kind==="template")select.add(new Option(entry.name||"Plantilla",entry.id));
  select.value=previous;
}
function renderContentLibrary(){
  const source=el("sallySourceModule"),destination=el("sallyDestinationModule");if(!source)return;
  state.contentMatches=contentMatches([state.inventory,state.targetInventory],el("sallyContentSearch").value);
  source.replaceChildren();state.contentMatches.forEach((page,index)=>source.add(new Option(`${page.courseView==="target"?"Destino":"Modelo"}: ${page.title||page.url}`,String(index))));
  const selected=destination.value;destination.replaceChildren(new Option("Crear una página nueva",""));
  const ids=new Set();for(const section of state.targetInventory?.sections||[])for(const item of section.modules||[]){
    let id;try{const url=new URL(item.url);if(!/\/mod\/(page|label)\/view\.php/.test(url.pathname))continue;id=url.searchParams.get("id");}catch{continue;}
    if(!/^\d+$/.test(id||"")||ids.has(id))continue;ids.add(id);destination.add(new Option(item.title,id));
  }
  destination.value=selected;showContentExcerpt();
}
function showContentExcerpt(){el("sallyContentExcerpt").textContent=(state.contentMatches?.[Number(el("sallySourceModule").value)]?.text||"Sin coincidencias. Analiza el curso para buscar contenido.").slice(0,1000);}
async function prepareHtmlPlan(html,intent){
  if(state.workflowBusy)throw Error("Espera a que termine la operación actual.");
  if(!state.activeId)throw Error("Selecciona una sesión.");
  if(state.chatThread!=="target")throw Error("Comparte el contenido con una conversación Destino para preparar cambios.");
  const target=el("sallyTargetCourse").value.trim();new URL(target);
  const moduleId=el("sallyDestinationModule").value,sectionTitle=el("sallyResourceSection").value.trim(),title=el("sallyResourceTitle").value.trim();
  if(!moduleId&&(!sectionTitle||!title))throw Error("Indica título y sección exacta para la página nueva.");
  if(!moduleId&&el("sallyResourceVisibility").value==="keep")throw Error("Indica la visibilidad de la página nueva.");
  state.workflowBusy=true;
  try {
  await switchCourse("target");
  state.plan=[{id:crypto.randomUUID(),type:"create_or_update_resource",target,intent,status:"draft",selection:null,
    payload:{kind:"page",html:sanitizeHtml(html),title,sectionTitle,moduleId,mode:el("sallyContentMode").value,visibility:el("sallyResourceVisibility").value}}];
  state.planHash="";await saveSession({plan:state.plan,status:"awaiting_approval",approvedPlanHash:""});
  renderPlan();updateApprovalUi("awaiting_approval");
  await recordConversation({role:"user",kind:"message",thread:"target",text:intent});
  await recordConversation({role:"assistant",kind:"plan",thread:"target",text:"Propuesta preparada. Revisa contenido, destino y visibilidad antes de aprobar. Moodle todavía no fue modificado.",plan:state.plan});
  } finally {state.workflowBusy=false;}
}
function bindContentLibrary(){
  const action=handler=>()=>Promise.resolve().then(handler).catch(error=>{workflowMessage(error.message);toast(error.message);});
  state.templateManager=installTemplateManager({state,el,store:createTemplateStore(db,state.user.uid),toast,prepare:prepareHtmlPlan,apply:async template=>{
    if(state.workflowBusy||state.historyLoading)throw Error("Espera a que termine la operación actual.");
    if(!state.activeId||state.chatThread!=="target")throw Error("Abre una conversación Destino para elegir su plantilla. Puedes guardar plantillas globales sin un proyecto.");
    state.workflowBusy=true;
    try{await saveSession({selectedTemplate:template,approvedPlanHash:"",status:"draft"});
      state.selectedTemplate=template;state.planHash="";state.approvalBinding=null;renderAttachments();updateApprovalUi("draft");
      toast("Plantilla elegida. Describe el cambio para el destino en el chat.");
    }finally{state.workflowBusy=false;}
  }});
  el("sallyClearTemplate").onclick=action(async()=>{if(state.workflowBusy)return;state.workflowBusy=true;try{await saveSession({selectedTemplate:null,approvedPlanHash:"",status:"draft"});state.selectedTemplate=null;state.planHash="";state.approvalBinding=null;renderAttachments();updateApprovalUi("draft");}finally{state.workflowBusy=false;}});
  el("sallyContentSearch").oninput=renderContentLibrary;el("sallySourceModule").onchange=showContentExcerpt;
  el("sallyCopyContent").onclick=action(()=>{const source=state.contentMatches?.[Number(el("sallySourceModule").value)];if(!source)throw Error("Selecciona contenido de un análisis.");if(source.htmlTruncated||(!source.html&&source.textTruncated))throw Error("Este recurso fue extraído parcialmente; no se copiará como si estuviera completo.");return prepareHtmlPlan(source.html||`<p>${escapeHtml(source.text||"")}</p>`,"Copiar contenido de "+source.title+" al recurso destino seleccionado");});
}
async function runAnalysis(views) {
  const draft=draftFromForm();
  const origin={sessionId:state.activeId,conversationId:state.conversationId,thread:state.chatThread};
  const runId=crypto.randomUUID();state.runId=runId;
  state.analysisCompletedViews=new Set();
  return collectCourseInventories({
    modelUrl:draft.modelCourse,targetUrl:draft.targetCourse,views,available:state.automation,
    open:switchCourse,inspect:payload=>invoke("inspect",payload),progress:workflowMessage,
    onInventory:async(inventory,view)=>{
      state.analysisCompletedViews.add(view);
      inventory.report=courseReport(inventory);
      inventory.analyzedAt=nowIso();
      if(view==="model")state.inventory=inventory;else state.targetInventory=inventory;
      renderInventory();
      const storagePath=`sallyBrown/${state.user.uid}/${state.activeId}/inventories/${runId}/${view}.json`;
      // Persist the complete result before publishing its reference.
      await uploadBytes(ref(storage,storagePath),new Blob([JSON.stringify(inventory)],{type:"application/json"}));
      await recordConversation({...origin,role:"assistant",kind:"analysis",text:inventory.report,inventoryPath:storagePath,runId,courseView:view});
      renderContentLibrary();
    }
  });
}
async function buildPlan() {
  if(state.tasks)return state.tasks.sendContext().catch(error=>toast(error.message));
  if(state.workflowBusy)return;
  const draft=draftFromForm();
  if(!state.activeId)return toast("Crea una sesión primero.");
  if(!draft.brief)return toast("Describe qué curso quieres analizar o qué cambio necesitas.");
  if(!state.automation){showDesktopRequired();return;}
  const {analysisOnly,views}=resolveChatRequest(draft.brief,state.chatThread);
  if(!analysisOnly&&state.chatThread!=="target")return toast("Comparte esta solicitud con una conversación Destino para preparar los cambios.");
  const origin={sessionId:state.activeId,conversationId:state.conversationId,thread:state.chatThread};
  state.workflowBusy=true;el("sallyBuildPlan").disabled=true;
  try {
    await recordConversation({role:"user",kind:"message",text:draft.brief});
    await saveSession(draft);
    const analysis={};
    const missing=views.filter(view=>{const inv=view==="model"?state.inventory:state.targetInventory,url=view==="model"?draft.modelCourse:draft.targetCourse;
      if(reusableInventory(inv,url,draft.brief)){analysis[view]=inv;return false;}return true;});
    if(missing.length)Object.assign(analysis,await runAnalysis(missing));
    workflowMessage(Object.entries(analysis).map(([view,inv])=>`${view==="model"?"Modelo":"Destino"}: inventario ${inv.analyzedAt||"heredado"} · ${inv.coverage?.complete===false?"parcial":"disponible"}`).join(" · "));
    if(!analysisOnly&&Object.values(analysis).some(inventory=>inventory.coverage?.complete===false)){
      state.plan=[];state.planHash="";renderPlan();updateApprovalUi("draft");
      await saveSession({plan:[],status:"draft",approvedPlanHash:""});
      workflowMessage("Inventario parcial disponible. Algunos recursos no se pudieron leer; revisa los avisos antes de proponer cambios.");
      return;
    }
    if(analysisOnly) {
      workflowMessage("Respondiendo tu consulta con el contenido analizado…");
      state.allowConversationSwitch=true;
      const answer=await answerCourseQuestion({brief:draft.brief,thread:origin.thread,inventory:analysis.model,targetInventory:analysis.target,history:contextFor(state.history||[],origin.conversationId)});
      const records=messagesFor(state.history||[],origin.conversationId).reverse();
      const inventoryPaths=views.map(view=>records.find(e=>e.inventoryPath&&(e.courseView||e.thread)===view)?.inventoryPath).filter(Boolean);
      await recordConversation({...origin,role:"assistant",kind:"message",inventoryPaths,...answer});
      const analyzed=views.map(view=>view==="target"?"destino":"modelo").join(" y ");
      if(state.conversationId===origin.conversationId)workflowMessage("Consulta del curso "+analyzed+" completada. Revisa los resultados.");
      return;
    }
    workflowMessage("Preparando una propuesta con los cursos analizados…");
    const proposal=await proposeCourseChanges({...draft,inventory:analysis.model||state.inventory,targetInventory:analysis.target,selection:state.selection,template:state.selectedTemplate?.html||"",history:contextFor(state.history||[],origin.conversationId)});
    state.plan=proposal.operations;state.planHash="";
    renderPlan();updateApprovalUi(state.plan.length?"awaiting_approval":"draft");
    workflowMessage(proposal.questions.length ? proposal.questions.join(" ") : proposal.summary);
    await recordConversation({role:"assistant",kind:"plan",thread:"target",text:proposal.summary,plan:state.plan,questions:proposal.questions});
    if(state.chatThread!=="target")await recordConversation({role:"assistant",kind:"message",text:"La propuesta se guardó en la conversación Destino para revisión y aprobación. El modelo no se ha modificado."});
    await saveSession({...draft,plan:state.plan,selection:state.selection,planVersion:Number(activeSession()?.planVersion||0)+1,
      approvedPlanHash:"",status:state.plan.length?"awaiting_approval":"draft",proposalSummary:proposal.summary});
  } catch(error) {if(state.conversationId===origin.conversationId)workflowMessage(error.message);toast(error.message);await recordConversation({...origin,role:"assistant",kind:"error",text:error.message}).catch(()=>{});}
  finally {state.allowConversationSwitch=false;state.workflowBusy=false;el("sallyBuildPlan").disabled=!state.automation;}
}
function renderPlan() { el("sallyOperationCount").textContent = `${state.plan.length} ${state.plan.length === 1 ? "acción" : "acciones"}`; el("sallyPlan").innerHTML = state.plan.length ? state.plan.map((op, i) => `<div class="sally-plan-item"><span>${i + 1}</span><div><strong>${escapeHtml(operationLabel(op.type))}</strong><small>${escapeHtml(op.intent || op.target || "Curso destino")}</small><small>${escapeHtml(op.target || "")} · ${escapeHtml(op.payload?.moduleId ? "Recurso #" + op.payload.moduleId : "Nuevo recurso en " + (op.payload?.sectionTitle || ""))} · ${escapeHtml(op.payload?.mode || "")} · ${escapeHtml(op.payload?.visibility === "hidden" ? "Oculto a estudiantes" : op.payload?.visibility === "visible" ? "Visible a estudiantes" : "Conservar visibilidad")}</small><details><summary>Propuesta</summary><pre>${escapeHtml(op.payload?.html || op.payload?.text || op.payload?.title || "")}</pre></details></div></div>`).join("") : `<div class="sally-empty-compact">El plan aparecerá aquí antes de modificar Moodle.</div>`; }
function renderInventory() { const reportNode=el("sallyAnalysisReport"); if(reportNode){reportNode.replaceChildren();for(const [label,data] of [["Modelo",state.inventory],["Destino",state.targetInventory]]){if(!data)continue;const title=document.createElement("h4");title.textContent=label;reportNode.append(title);for(const paragraph of (data.report||courseReport(data)).split("\n\n")){const p=document.createElement("p");p.textContent=paragraph;reportNode.append(p);}}} const inv = state.courseView === "target" ? state.targetInventory : state.inventory; if (!inv) { el("sallyInventoryCount").textContent = "Sin analizar"; el("sallyInventory").innerHTML = ""; return; } const sections = Array.isArray(inv.sections) ? inv.sections : []; const moduleCount = sections.reduce((n,s) => n + (s.modules?.length || 0), 0); el("sallyInventoryCount").textContent = `${state.courseView === "target" ? "Destino" : "Modelo"} · ${sections.length} secciones · ${moduleCount} recursos`; el("sallyInventory").innerHTML = (inv.warnings||[]).map(w=>`<p class="sally-empty-compact">${escapeHtml(w.message)} ${escapeHtml(w.url)}</p>`).join("") + sections.map((section) => `<div class="sally-inventory-group"><strong>${escapeHtml(section.title)}</strong><div>${section.modules?.length || 0} elementos</div><ul>${(section.modules || []).map(m=>`<li>${escapeHtml(m.title)} · ${escapeHtml(m.type)}</li>`).join("")}</ul></div>`).join(""); }
function renderAttachments() { el("sallyAttachments").innerHTML = state.attachments.map((file) => `<span class="sally-attachment" title="${escapeHtml(file.name)}"><i class="fas fa-paperclip"></i> ${escapeHtml(file.name)}</span>`).join("");el("sallyAppliedTemplate").hidden=!state.selectedTemplate;el("sallyAppliedTemplateName").textContent=state.selectedTemplate?`Plantilla: ${state.selectedTemplate.name} · versión ${state.selectedTemplate.version||"personalizada"}`:""; }
function updateApprovalUi(status) { const approved = status === "approved" && Boolean(state.planHash) && state.approvalBinding?.conversationId===state.conversationId; el("sallyPlanStatus").textContent = approved ? "Aprobado" : status === "running" ? "Ejecutando" : "Borrador"; el("sallyApprove").disabled = state.chatThread!=="target" || !state.plan.length || approved || !state.automation; el("sallyExecute").disabled = !approved || !state.automation; el("sallyApprovalHint").textContent = approved ? "Plan aprobado. Sally puede ejecutarlo." : "Revisa el plan antes de aprobarlo."; }

async function uploadFiles(files) {
  if (!state.activeId) return toast("Crea una sesión antes de adjuntar archivos.");
  if(state.workflowBusy||state.historyLoading)return toast("Espera a que termine la operación actual.");
  state.workflowBusy=true;
  try{
    const attachments=[...state.attachments];
    for(const file of files){
      if(file.size>30*1024*1024){toast(`${file.name} supera 30 MB.`);continue;}
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,"_");
      const storagePath=`sallyBrown/${state.user.uid}/${state.activeId}/attachments/${state.conversationId}/${crypto.randomUUID()}-${safeName}`;
      const target=ref(storage,storagePath);
      await uploadBytes(target,file,{contentType:file.type||"application/octet-stream",customMetadata:{sessionId:state.activeId,conversationId:state.conversationId,ownerId:state.user.uid}});
      attachments.push({id:crypto.randomUUID(),conversationId:state.conversationId,name:file.name,size:file.size,type:file.type,path:storagePath,url:await getDownloadURL(target)});
    }
    await saveSession({attachments,approvedPlanHash:"",status:"draft"});
    state.attachments=attachments;state.planHash="";state.approvalBinding=null;renderAttachments();updateApprovalUi("draft");
  }catch(error){toast("No se pudieron guardar los adjuntos: "+error.message);}
  finally{state.workflowBusy=false;}
}
function setBusy(busy) { el("sallyBrowserLoading").hidden = !busy; }
function addEvidence(snapshot) { if (!snapshot?.image) return; const img = document.createElement("img"); img.src = snapshot.image; img.alt = snapshot.title || "Evidencia Moodle"; el("sallyEvidenceStrip").prepend(img); while (el("sallyEvidenceStrip").children.length > 8) el("sallyEvidenceStrip").lastElementChild.remove(); }
function applySnapshot(snapshot) { if (!snapshot?.image || state.marking || (snapshot.capturedAt&&snapshot.capturedAt<=(state.lastFrameAt||0))) return; state.lastFrameAt=snapshot.capturedAt||0;state.viewport = snapshot.viewport || state.viewport; const image = el("sallyBrowserImage"); image.src = snapshot.image; image.hidden = false; el("sallyEmptyBrowser").hidden = true; if(snapshot.title||snapshot.url)el("sallyBrowserTitle").textContent = snapshot.title || snapshot.url; el("sallyMoodleUrl").value = snapshot.url || el("sallyMoodleUrl").value; el("sallyBrowserState").textContent = "Conectado"; if (["inspection","before-operation","after-operation"].includes(snapshot.reason)) addEvidence(snapshot); }
async function openMoodle(url) {
  if(!state.automation){showDesktopRequired();throw new Error("El navegador remoto no está disponible. Recarga la página.");}
  setBusy(true);
  try {
    const rect=el("sallyBrowserStage").getBoundingClientRect();
    const snapshot=await invoke("start",
      {url,action:"open",modelUrl:el("sallySourceCourse").value,targetUrl:el("sallyTargetCourse").value,courseView:state.courseView,viewport:{width:Math.round(rect.width),height:Math.round(rect.height)}});
    applySnapshot(snapshot);
    await saveSession({moodleUrl:url});
  } finally {setBusy(false);}
}
async function inspectCourse() {
  if(!state.automation){showDesktopRequired();return;}
  if(state.workflowBusy)return;
  state.workflowBusy=true;setBusy(true);
  try {
    await recordConversation({role:"user",kind:"message",text:"Analizar de nuevo el curso "+(state.courseView==="target"?"destino":"modelo")});
    const result=await runAnalysis([state.courseView]);
    workflowMessage(result[state.courseView]?.coverage?.complete===false?"Inventario parcial: revisa los recursos pendientes en los avisos.":"Curso "+(state.courseView==="target"?"destino":"modelo")+" analizado. Revisa el inventario.");
  } catch(error){workflowMessage(error.message);toast(error.message);await recordConversation({role:"assistant",kind:"error",text:error.message}).catch(()=>{});}
  finally{state.workflowBusy=false;setBusy(false);}
}
async function approvePlan() {
  if(state.chatThread!=="target"||!state.plan.length)return toast("Selecciona un plan de una conversación Destino.");
  if(state.workflowBusy)return;state.workflowBusy=true;
  try {
    await switchCourse("target");
    const {checkpoints}=await invoke("checkpoint",{plan:state.plan,targetUrl:el("sallyTargetCourse").value});
    const plan=state.plan.map(op=>{
      const before=checkpoints.find(item=>item.operationId===op.id);
      if(op.payload?.expectedHash&&before?.hash!==op.payload.expectedHash)throw Error("El recurso cambió desde la propuesta o reversión. No se aprobará sobre una versión diferente.");
      return before?.hash?{...op,payload:{...op.payload,expectedHash:before.hash}}:op;
    });
    // A durable copy must exist before approval enables any Moodle write.
    const record=await recordConversation({role:"assistant",thread:"target",kind:"checkpoint",text:"Respaldo previo a los cambios. "+checkpoints.filter(item=>!item.reversible).map(item=>item.reason).join(" "),checkpoints,plan});
    state.checkpointId=record.id;state.plan=plan;
    const result=await invoke("approve",{plan});state.planHash=result.planHash;
    await saveSession({plan,checkpointId:record.id,approvedPlanHash:result.planHash,approvedAt:nowIso(),approvedBy:state.user.uid,status:"approved"});
    state.approvalBinding={conversationId:state.conversationId,target:el("sallyTargetCourse").value,plan:JSON.stringify(plan)};
    updateApprovalUi("approved");toast("Plan aprobado y respaldo guardado.");
  }catch(error){toast(error.message);workflowMessage(error.message);}
  finally{state.workflowBusy=false;}
}
async function prepareReversal(entry){
  if(state.workflowBusy)throw Error("Espera a que termine la operación actual.");
  if(conversationOf(entry)!==state.conversationId||state.chatThread!=="target")throw Error("Abre la conversación original del cambio para preparar su reversión.");
  const backup=state.history.find(item=>item.id===entry.checkpointId);
  if(!backup)throw Error("No se encontró el respaldo anterior de esta ejecución.");
  const completed=entry.result.results.filter(item=>item.status==="completed");
  if(completed.some(item=>!item.result?.afterHash||!backup.checkpoints?.find(before=>before.operationId===item.id)?.reversible))throw Error("Esta ejecución incluye cambios sin reversión automática. Consulta el registro completo para restauración manual.");
  const plan=[...completed].reverse().map(item=>{
    const before=backup.checkpoints.find(candidate=>candidate.operationId===item.id);
    return {id:crypto.randomUUID(),type:"create_or_update_resource",target:before.target,intent:"Revertir contenido y visibilidad del recurso #"+before.moduleId,status:"draft",payload:{moduleId:before.moduleId,kind:"page",html:before.html,mode:"replace",visibility:before.visible==="0"?"hidden":"visible",expectedHash:item.result.afterHash}};
  });
  if(!plan.length)throw Error("No hay cambios reversibles.");
  if(plan.some(op=>op.target!==el("sallyTargetCourse").value.trim()))throw Error("La URL destino cambió. Restaura la URL indicada en el registro antes de revertir.");
  state.plan=plan;state.planHash="";
  await saveSession({plan,status:"awaiting_approval",approvedPlanHash:""});renderPlan();updateApprovalUi("awaiting_approval");
  await recordConversation({role:"assistant",thread:"target",kind:"plan",text:"Reversión preparada. Requiere aprobación; se rechazará si el recurso sufrió cambios posteriores.",plan,revertsEntryId:entry.id});
}
async function executePlan() {
  const binding=state.approvalBinding;
  if(!binding||!state.planHash||binding.conversationId!==state.conversationId||binding.target!==el("sallyTargetCourse").value||binding.plan!==JSON.stringify(state.plan))return toast("Aprueba esta versión del plan en su conversación antes de ejecutarla.");
  if(state.workflowBusy)return;state.workflowBusy=true;setBusy(true);
  let outcome;
  try {
    await saveSession({status:"running",executionStartedAt:nowIso()});updateApprovalUi("running");
    const result=outcome=await invoke("execute",{plan:state.plan,targetUrl:el("sallyTargetCourse").value,modelUrl:el("sallySourceCourse").value});
    state.approvalBinding=null;state.planHash="";if(state.targetInventory)state.targetInventory.stale=true;
    await recordConversation({role:"assistant",thread:"target",kind:"execution",text:`Ejecución: ${result.state}`,result,targetUrl:el("sallyTargetCourse").value,checkpointId:state.checkpointId||""});
    // Full HTML lives in private Storage, not a size-limited Firestore document.
    await saveSession({status:result.state,lastExecution:{state:result.state,operationCount:result.results?.length||0},executionEndedAt:nowIso()});
    updateApprovalUi(result.state);toast(result.state==="completed"?"Plan completado.":`Ejecución ${result.state}.`);
  }catch(error){
    if(outcome){await saveSession({status:outcome.state,lastError:"No se pudo guardar el registro completo de la ejecución."}).catch(()=>{});updateApprovalUi(outcome.state);workflowMessage("Moodle respondió: "+outcome.state+". Falló el guardado del registro; revisa el curso y no repitas la ejecución automáticamente.");}
    else{await saveSession({status:"failed",lastError:safeText(error.message,1000)});await recordConversation({role:"assistant",thread:"target",kind:"error",text:error.message}).catch(()=>{});updateApprovalUi("failed");toast(error.message);}
  }
  finally{state.workflowBusy=false;setBusy(false);}
}

async function switchCourse(view) {
  const url = el(view === "model" ? "sallySourceCourse" : "sallyTargetCourse").value.trim();
  if (!url) throw new Error(view === "model" ? "Indica la URL del curso modelo." : "Indica la URL del curso destino.");
  state.marking=false;state.selection=null;el("sallyMark").hidden=true;
  el("sallyBrowserStage").classList.remove("is-marking");el("sallyPencil").setAttribute("aria-pressed","false");
  state.courseView=view;
  el("sallyViewModel").setAttribute("aria-pressed",String(view==="model"));
  el("sallyViewTarget").setAttribute("aria-pressed",String(view==="target"));
  await openMoodle(url);
}
function installResizers() { document.querySelectorAll("[data-resizer]").forEach((handle) => { const side = handle.dataset.resizer; const cssVar = side === "left" ? "--sally-left" : "--sally-right"; const key = `sally-pane-${side}`; const saved = Number(localStorage.getItem(key)); if (saved) document.documentElement.style.setProperty(cssVar, `${saved}px`); const apply = (value) => { const width = Math.max(side === "left" ? 220 : 300, Math.min(side === "left" ? 390 : 520, value)); document.documentElement.style.setProperty(cssVar, `${width}px`); localStorage.setItem(key, String(width)); }; handle.addEventListener("pointerdown", (event) => { handle.setPointerCapture(event.pointerId); const start = event.clientX; const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar)); const move = (e) => apply(base + (side === "left" ? e.clientX - start : start - e.clientX)); const done = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", done); }; handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", done); }); handle.addEventListener("keydown", (event) => { if (!["ArrowLeft","ArrowRight","Home"].includes(event.key)) return; event.preventDefault(); const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar)); apply(event.key === "Home" ? (side === "left" ? 278 : 370) : current + (event.key === "ArrowRight" ? (side === "left" ? 12 : -12) : (side === "left" ? -12 : 12))); }); }); }
function closeDrawers() { document.querySelectorAll(".sally-pane.is-open").forEach((node) => node.classList.remove("is-open")); el("sallyDrawerBackdrop").hidden = true; }
function bindUi() {
  state.conversations=installConversations({state,el,record:recordConversation,readJson:path=>readPrivateJson(storage,path),toast,render:()=>{renderChatScope();renderPlan();renderInventory();renderAttachments();renderContentLibrary();renderTemplateList();updateApprovalUi("draft");}});
  state.tasks=installTasks({state,el,record:recordConversation,saveContext:saveSession,templates:()=>state.templateManager?.items()||[],uploadFiles,toast});
  installUserImport({state,el,toast});
  document.querySelectorAll("[data-sally-prompt]").forEach(button=>button.addEventListener("click",()=>{el("sallyBrief").value=button.dataset.sallyPrompt;el("sallyBrief").focus();el("sallyQuickMenu").open=false;}));
  el("sallyImportShortcut").addEventListener("click",()=>el("sallyOpenUserImport").click());
  el("sallyImportShortcut").addEventListener("click",()=>{el("sallyQuickMenu").open=false;});
  el("sallyToggleEndpoints").addEventListener("click",()=>{const panel=el("sallyEndpoints"),show=panel.hidden;panel.hidden=!show;el("sallyToggleEndpoints").setAttribute("aria-expanded",String(show));el("sallyToggleEndpoints").querySelector("span").textContent=show?"Ocultar modelo y destino":"Modelo y destino";});
  el("sallyConversationMenu").querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{el("sallyConversationMenu").open=false;}));
  document.addEventListener("click",event=>{for(const id of ["sallyConversationMenu","sallyQuickMenu"]){const menu=el(id);if(menu?.open&&!menu.contains(event.target))menu.open=false;}});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"){el("sallyConversationMenu").open=false;el("sallyQuickMenu").open=false;}});
  bindContentLibrary();
  el("sallyNewSession").addEventListener("click", () => void createSession()); el("sallySessionSearch").addEventListener("input", renderSessions);
  document.querySelectorAll("[data-session-filter]").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.sessionFilter; document.querySelectorAll("[data-session-filter]").forEach((b) => b.classList.toggle("is-active", b === button)); renderSessions(); }));
  el("sallySessionList").addEventListener("click", (event) => { const menuButton = event.target.closest("[data-menu-session]"); if (menuButton) { event.stopPropagation(); const menu = document.querySelector(`[data-session-menu="${menuButton.dataset.menuSession}"]`); document.querySelectorAll(".sally-session__menu").forEach((node) => { if (node !== menu) node.hidden = true; }); menu.hidden = !menu.hidden; return; } const action = event.target.closest("[data-session-action]"); const card = event.target.closest("[data-session-id]"); if (action && card) { event.stopPropagation(); void sessionAction(card.dataset.sessionId, action.dataset.sessionAction); return; } if (card) selectSession(card.dataset.sessionId); });
  ["sallySourceCourse","sallyTargetCourse","sallyNoModel"].forEach((id) => el(id).addEventListener("change", () => {renderChatScope();const patch = draftFromForm(); state.planHash = ""; void saveSession({ ...patch, approvedPlanHash: "", status: "draft" }); updateApprovalUi("draft"); }));
  el("sallyBuildPlan").addEventListener("click",()=>void state.tasks.send().catch(error=>toast(error.message)));el("sallyBrief").addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();void state.tasks.send().catch(error=>toast(error.message));}}); el("sallyFiles").addEventListener("change", (event) => { void uploadFiles([...event.target.files]); event.target.value = ""; }); el("sallyApprove").addEventListener("click", () => void approvePlan()); el("sallyExecute").addEventListener("click", () => void executePlan()); el("sallyInspect").addEventListener("click", () => void inspectCourse());
  el("sallyUrlForm").addEventListener("submit", (event) => { event.preventDefault(); void openMoodle(el("sallyMoodleUrl").value).catch(error=>{workflowMessage(error.message);toast(error.message);}); });
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", async () => { try { applySnapshot(await invoke("navigate", { action: button.dataset.nav })); } catch (error) { toast(error.message); } }));
  document.querySelectorAll("[data-control]").forEach((button) => button.addEventListener("click", async () => { try { await invoke("control", { action: button.dataset.control }); el("sallyBrowserState").textContent = button.dataset.control === "resume" ? "Ejecutando" : button.dataset.control === "pause" ? "Pausado" : "Cancelado"; } catch (error) { toast(error.message); } }));
  const image = el("sallyBrowserImage"); image.addEventListener("click", async (event) => { if (state.marking) return; el("sallyBrowserStage").focus({preventScroll:true}); const rect = image.getBoundingClientRect(); const x = (event.clientX - rect.left) * state.viewport.width / rect.width; const y = (event.clientY - rect.top) * state.viewport.height / rect.height; try { applySnapshot(await invoke("input", { kind: "click", x, y })); } catch (error) { toast(error.message); } });
  el("sallyBrowserStage").addEventListener("wheel", (event) => { if (image.hidden || state.marking) return; event.preventDefault(); void invoke("input", { kind: "scroll", deltaX: event.deltaX, deltaY: event.deltaY }).then(applySnapshot).catch((error) => toast(error.message)); }, { passive: false });
  el("sallyBrowserStage").addEventListener("keydown", (event) => { if (image.hidden || state.marking || event.isComposing || ["Control","Meta","Alt","Shift"].includes(event.key)) return; if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="v")return; event.preventDefault(); const special=event.key.length!==1||event.ctrlKey||event.metaKey||event.altKey;const key=[...(event.ctrlKey||event.metaKey?["Control"]:[]),...(event.altKey?["Alt"]:[]),...(event.shiftKey&&special?["Shift"]:[]),event.key].join("+");void invoke("input", special ? { kind: "key", key } : { kind: "text", text: event.key }).then(applySnapshot).catch((error) => toast(error.message)); });
  el("sallyOpenSessions").addEventListener("click", () => { el("sallySessionsPane").classList.add("is-open"); el("sallyDrawerBackdrop").hidden = false; }); el("sallyOpenBrief").addEventListener("click", () => { el("sallyBriefPane").classList.add("is-open"); el("sallyDrawerBackdrop").hidden = false; }); el("sallyDrawerBackdrop").addEventListener("click", closeDrawers);
  bindSelection({ state, invoke, toast, save:saveSession, changed: () => {state.planHash="";updateApprovalUi("draft");} });
  el("sallyViewModel").addEventListener("click", () => void switchCourse("model").catch(error=>{workflowMessage(error.message);toast(error.message);}));
  el("sallyViewTarget").addEventListener("click", () => void switchCourse("target").catch(error=>{workflowMessage(error.message);toast(error.message);}));
  el("sallyOpenModelEndpoint").addEventListener("click",()=>void switchCourse("model").catch(error=>toast(error.message)));
  el("sallyOpenTargetEndpoint").addEventListener("click",()=>void switchCourse("target").catch(error=>toast(error.message)));
  document.querySelectorAll(".sally-app button[aria-label]").forEach(button => button.title ||= button.getAttribute("aria-label"));
  el("sallyBrowserStage").addEventListener("paste",event=>{if(image.hidden||state.marking)return;event.preventDefault();const text=event.clipboardData?.getData("text/plain");if(text)void invoke("input",{kind:"text",text}).then(applySnapshot).catch(error=>toast(error.message));});
  let resizeTimer;
  state.browserResizeObserver=new ResizeObserver(()=>{
    clearTimeout(resizeTimer);
    if(!state.remote||image.hidden||state.workflowBusy)return;
    resizeTimer=setTimeout(()=>{
      const rect=el("sallyBrowserStage").getBoundingClientRect(),viewport={width:Math.round(rect.width),height:Math.round(rect.height)};
      if(Math.abs(viewport.width-state.viewport.width)<3&&Math.abs(viewport.height-state.viewport.height)<3)return;
      void invoke("resize",{viewport}).then(snapshot=>{if(snapshot?.image)applySnapshot(snapshot);}).catch(()=>{});
    },250);
  });
  state.browserResizeObserver.observe(el("sallyBrowserStage"));
  installResizers();
}

function showDesktopRequired() {
  el("sallyEmptyBrowser").hidden=false;
  el("sallyEmptyBrowser").querySelector("h2").textContent="No se pudo conectar con el servidor";
  el("sallyEmptyBrowser").querySelector("p").textContent="Recarga la página para volver a conectar. No necesitas Electron ni preparar el inventario manualmente.";
  workflowMessage("El navegador remoto no está disponible. Recarga para volver a intentarlo.");
}
async function initialize(user, access) {
  state.user = user; state.access = access; bindUi();
  state.remote=createRemoteBrowser({getUser:()=>auth.currentUser,onEvent:event=>{
    if(event.type==="snapshot")applySnapshot(event.payload);
  if(event.type==="command-error"){
    const detail=event.payload;
    toast(`${detail.command} · HTTP ${detail.status}: ${detail.message}`);
  }
    if(event.type==="inventory"&&state.workflowBusy){
      const inventory=event.payload;
      if(!state.analysisCompletedViews?.has(inventory.courseView)){
        if(inventory.courseView==="target")state.targetInventory=inventory;else state.inventory=inventory;
        renderInventory();
      }
    }
    if(event.type==="status"){el("sallyBrowserState").textContent=event.payload?.state||"Activo";if(event.payload?.message){state.tasks?.activity(event.payload.message);if(state.workflowBusy)workflowMessage(event.payload.message);}}
    if(event.type==="realtime-state"){const mode=event.payload?.state;el("sallyBrowserLatency").textContent=mode==="connected"?`Tiempo real · ${event.payload.fps||10} FPS`:mode==="reconnecting"?"Reconectando…":"Modo HTTP";}
    if(event.type==="latency")el("sallyBrowserLatency").textContent=`Tiempo real · ${Math.round(event.payload.milliseconds)} ms`;
    if(event.type==="disconnected"){el("sallyBrowserImage").hidden=true;el("sallyEmptyBrowser").hidden=false;}
    if(event.type==="error"||event.type==="connection-error")workflowMessage(event.payload?.message||"No se pudo conectar.");
  }});
  bindSessionListeners();
  const availability = await state.remote.availability().catch(error=>({automationAvailable:false,error:error.message}));
  state.automation = availability.automationAvailable === true; state.viewport = availability.viewport || state.viewport;
  state.agentAvailable=availability.agentAvailable===true;void state.tasks.refresh().catch(error=>toast(error.message));
  el("sallyRuntimeDot").classList.toggle("is-online", state.automation); el("sallyRuntimeLabel").textContent = state.automation ? "Navegador remoto · conectado" : "Servidor no disponible"; el("sallyDesktopOnlyNotice").hidden = state.automation;
  el("sallyBuildPlan").disabled=false;
  if(!state.automation)showDesktopRequired();
  state.eventOff = ()=>{state.browserResizeObserver?.disconnect();state.remote.dispose();state.templateManager?.dispose();state.tasks?.dispose();};
  document.body.classList.remove("sally-locked"); el("sallyAccessGate").remove(); el("sallyApp").hidden = false; updateApprovalUi(activeSession()?.status||"draft");
}

let authResolved = false;
function showAccessError(message){const gate=el("sallyAccessGate");const status=el("sallyAccessStatus");if(!gate)return;gate.classList.add("is-error");if(status)status.textContent=message;}
onAuthStateChanged(auth, async (user) => { if (authResolved) { if (!user || user.uid !== state.user?.uid) { state.unsubscribe.forEach(off=>off()); state.eventOff?.(); redirectDenied(); } return; } authResolved = true; if (!user) return redirectDenied(); let access;try{access=await bounded(authorizePage(user),12000,"La verificación de acceso tardó demasiado. Recarga para intentarlo de nuevo.");}catch(error){showAccessError(error.message||"No se pudo verificar el acceso.");return;}if(!access)return redirectDenied(); await initialize(user, access).catch((error) => { console.error("[SallyBrown] Initialization failed", error);showAccessError(error.message||"No se pudo iniciar Sally. Recarga para volver a intentarlo."); }); });
setTimeout(() => { if (!authResolved) redirectDenied(); }, 7000);
window.addEventListener("pagehide", () => { state.unsubscribe.forEach((off) => off()); state.eventOff?.(); });
