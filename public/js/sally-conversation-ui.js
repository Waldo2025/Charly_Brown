import { conversationsFrom, messagesFor, legacyId } from "./sally-conversations.js";
import { renderResult, renderChanges, resultLabel, prose } from "./sally-result-view.js";
import {readLocalState,writeLocalState} from "./sally-local-state.js";

export function installConversations({state,el,record,render,readJson,toast}) {
  const key=()=>`sally-conversation:${state.user?.uid}:${state.activeId}`;
  const draftKey=id=>`${key()}:draft:${id}`;
  let generation=0,opener;
  const scoped=()=>messagesFor(state.history||[],state.conversationId);
  function list(){
    const select=el("sallyConversationSelect");select.replaceChildren();
    const all=conversationsFrom(state.history||[]);
    for(const c of all.filter(c=>Boolean(c.archived)===el("sallyShowArchived").checked))select.add(new Option(c.name,c.id));
    select.value=state.conversationId;
    const current=all.find(c=>c.id===state.conversationId);
    el("sallyArchiveConversation").title=current?.archived?"Restaurar conversación":"Archivar conversación";
    el("sallyArchiveConversation").setAttribute("aria-label",el("sallyArchiveConversation").title);
    const archiveLabel=el("sallyArchiveConversation").querySelector("span");if(archiveLabel)archiveLabel.textContent=current?.archived?"Restaurar":"Archivar";
    el("sallyResultsTitle").textContent=current?.name||"Resultados";
  }
  function open(entryId){
    opener=document.activeElement;el("sallyResultsPanel").hidden=false;
    el("sallyToggleResults").setAttribute("aria-expanded","true");
    const label=el("sallyToggleResults").querySelector("span");if(label)label.textContent="Ocultar resultados";
    if(entryId){el("sallyResultVersion").value=entryId;const disclosure=el("sallyResultVersion").closest("details");if(disclosure)disclosure.open=true;}
    void showVersion();el("sallyCloseResults").focus();
  }
  function close(){el("sallyResultsPanel").hidden=true;el("sallyToggleResults").setAttribute("aria-expanded","false");const label=el("sallyToggleResults").querySelector("span");if(label)label.textContent="Mostrar resultados";if(opener?.isConnected)opener.focus();}
  function versions(){
    el("sallyResultMetadata").textContent=[["Modelo",state.inventory],["Destino",state.targetInventory]].filter(([,inv])=>inv).map(([name,inv])=>`${name} · ${inv.analyzedAt?new Date(inv.analyzedAt).toLocaleString("es"):"fecha anterior no disponible"} · ${inv.stale?"requiere actualización":inv.coverage?.complete===true?"cobertura completa":inv.coverage?.complete===false?"cobertura parcial":"cobertura no certificada"}`).join("\n");
    const select=el("sallyResultVersion"),previous=select.value;
    select.replaceChildren(new Option("Resultados actuales",""));
    for(const e of [...scoped()].reverse().filter(e=>e.role==="assistant"))select.add(new Option(`${resultLabel(e.kind)} · ${new Date(e.createdAt).toLocaleString("es")}`,e.id));
    if([...select.options].some(o=>o.value===previous))select.value=previous;
  }
  async function showVersion(){
    const token=++generation,id=state.conversationId;
    const entries=scoped(),selected=entries.find(e=>e.id===el("sallyResultVersion").value);
    const pre=el("sallyResultDetail");pre.textContent="";
    el("sallyCurrentResults").hidden=Boolean(selected);
    if(selected){
      renderResult(pre,selected,null);
      try{const paths=selected.inventoryPaths||[];
        const data=selected.inventoryPath?await readJson(selected.inventoryPath):selected.plan||selected.result||selected.checkpoints||(paths.length?await Promise.all(paths.map(readJson)):null);
        if(token===generation&&id===state.conversationId)renderResult(pre,selected,data);
      }catch(error){if(token===generation)prose(pre,"No se pudo cargar el resultado: "+error.message);}
    }
    renderChanges(el("sallyChanges"),entries);
  }
  function stash(){if(state.conversationId)writeLocalState(draftKey(state.conversationId),el("sallyBrief").value,{draft:true});}
  async function select(id,{show=true,saveDraft=true}={}){
    if(state.historyLoading)return toast("Espera a que se carguen las conversaciones.");
    if(state.workflowBusy&&!state.allowConversationSwitch)return toast("Espera a que termine la operación del navegador.");
    if(saveDraft)stash();
    const c=conversationsFrom(state.history||[]).find(c=>c.id===id);if(!c)return;
    const sessionId=state.activeId;const selectionGeneration=state.conversationGeneration=(state.conversationGeneration||0)+1;
    ++generation;state.conversationId=id;state.chatThread="unified";state.courseView="target";
    state.plan=[];state.planHash="";state.checkpointId="";state.approvalBinding=null;state.selection=null;state.inventory=null;state.targetInventory=null;state.attachments=[];state.selectedTemplate=null;
    el("sallySelectionContext").hidden=true;el("sallyMark").hidden=true;
    const entries=messagesFor(state.history||[],id);
    for(const e of entries){if(e.plan)state.plan=e.plan;if(e.kind==="state"){
      for(const field of ["plan","attachments","selection","checkpointId","selectedTemplate"])if(field in e.patch)state[field]=e.patch[field];
    }}
    const lastDraft=[...entries].reverse().find(e=>e.kind==="state"&&typeof e.patch?.brief==="string");
    el("sallyBrief").value=readLocalState(draftKey(id))??lastDraft?.patch.brief??c.draft??"";
    el("sallyShowArchived").checked=Boolean(c.archived);
    writeLocalState(key(),id);writeLocalState(`${key()}:${c.thread}`,id);list();render();versions();
    if(show)open();
    for(const view of ["model","target"]){
      const e=[...entries].reverse().find(e=>e.inventoryPath&&(e.courseView||e.thread)===view);
      if(!e)continue;
      try{const inv=await readJson(e.inventoryPath);if(state.conversationId!==id||state.activeId!==sessionId||state.conversationGeneration!==selectionGeneration)return;
        state[view==="model"?"inventory":"targetInventory"]={...inv,report:e.text,analyzedAt:e.createdAt,stale:(state.history||[]).some(item=>item.kind==="execution"&&item.createdAt>e.createdAt&&view==="target"&&(!item.targetUrl||item.targetUrl===inv.url))};
      }catch(error){toast("No se pudo recuperar el inventario: "+error.message);}
    }
    if(state.conversationId===id&&state.activeId===sessionId&&state.conversationGeneration===selectionGeneration){render();versions();}
    if(state.conversationId===id)void state.tasks?.refresh().catch(error=>toast(error.message));
  }
  // Session identity is also checked by select's async reads.
  async function restore(){const saved=readLocalState(key());await select(saved&&conversationsFrom(state.history||[]).some(c=>c.id===saved)?saved:legacyId(state.chatThread),{show:false,saveDraft:false});}
  const action=fn=>()=>Promise.resolve().then(fn).catch(error=>toast(error.message));
  async function create(thread="unified"){if(!state.activeId)throw Error("Selecciona un proyecto primero.");if(state.workflowBusy)throw Error("Espera a que termine la operación.");const name=window.prompt("Nombre de la conversación","Nueva conversación");if(!name?.trim())return null;const id=crypto.randomUUID();await record({kind:"conversation",conversationId:id,thread,patch:{name:name.trim().slice(0,120),archived:false},text:""});el("sallyShowArchived").checked=false;await select(id);return id;}
  async function share(entry){
    if(state.workflowBusy)return toast("Espera a que termine la operación.");
    const thread=state.chatThread==="unified"?"unified":state.chatThread==="model"?"target":"model",choices=conversationsFrom(state.history||[]).filter(c=>c.thread===thread&&!c.archived&&c.id!==state.conversationId);
    const choice=window.prompt("Compartir referencia: 0 = nueva conversación\n"+choices.map((c,i)=>`${i+1} = ${c.name}`).join("\n"),"0");if(choice===null)return;
    const id=choice==="0"?await create(thread):choices[Number(choice)-1]?.id;if(!id)return;
    await record({kind:"reference",role:"user",thread,conversationId:id,text:entry.text,sourceEntryId:entry.id,sourceConversationId:entry.conversationId||legacyId(entry.thread||"model"),inventoryPath:entry.inventoryPath||"",courseView:entry.courseView||entry.thread});
    await select(id);toast("Referencia compartida; Moodle no fue modificado.");
  }
  el("sallyConversationSelect").onchange=action(()=>select(el("sallyConversationSelect").value));
  el("sallyNewConversation").onclick=action(()=>create());
  el("sallyRenameConversation").onclick=action(async()=>{const name=window.prompt("Nombre de la conversación",el("sallyResultsTitle").textContent);if(name?.trim())await record({kind:"conversation",patch:{name:name.trim().slice(0,120)},text:""});list();});
  el("sallyArchiveConversation").onclick=action(async()=>{const c=conversationsFrom(state.history||[]).find(c=>c.id===state.conversationId);if(!c)return;await record({kind:"conversation",patch:{archived:!c.archived},text:""});el("sallyShowArchived").checked=!c.archived;list();});
  el("sallyShowArchived").onchange=list;
  el("sallyToggleResults").onclick=()=>el("sallyResultsPanel").hidden?open():close();el("sallyCloseResults").onclick=close;
  el("sallyResultVersion").onchange=()=>void showVersion();
  el("sallyResultsPanel").addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();close();}});
  el("sallyBrief").addEventListener("input",stash);
  return {select,restore,create,share,open,selectThread(thread){const remembered=readLocalState(`${key()}:${thread}`);return select(conversationsFrom(state.history||[]).some(c=>c.id===remembered)?remembered:legacyId(thread));},refresh(){list();versions();void showVersion();},stash};
}
