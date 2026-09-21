export function bindSelection({ state, invoke, toast, save, changed }) {
  const stage = document.getElementById("sallyBrowserStage");
  const image = document.getElementById("sallyBrowserImage");
  const mark = document.getElementById("sallyMark");
  const pencil = document.getElementById("sallyPencil");
  const info = document.getElementById("sallySelectionContext");
  let anchor = null;
  function clear() {
    anchor=null;state.selection=null;mark.hidden=true;info.hidden=true;changed();
    void save({selection:null,approvedPlanHash:"",status:"draft"}).catch(error=>toast(error.message));
  }
  pencil.addEventListener("click", () => {
    if(image.hidden) return toast("Abre primero el curso que quieres marcar.");
    state.marking=!state.marking;stage.classList.toggle("is-marking",state.marking);
    pencil.setAttribute("aria-pressed",String(state.marking));if(!state.marking) clear();
  });
  document.getElementById("sallyClearMark").addEventListener("click",clear);
  const point = event => {
    const r=image.getBoundingClientRect();
    return {x:Math.max(0,Math.min(r.width,event.clientX-r.left)),y:Math.max(0,Math.min(r.height,event.clientY-r.top)),r};
  };
  stage.addEventListener("pointerdown",event=>{
    if(!state.marking || image.hidden) return;
    event.preventDefault();anchor=point(event);stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove",event=>{
    if(!anchor)return;
    const p=point(event),r=stage.getBoundingClientRect();
    Object.assign(mark.style,{
      left:(p.r.left-r.left+Math.min(anchor.x,p.x)+stage.scrollLeft)+"px",
      top:(p.r.top-r.top+Math.min(anchor.y,p.y)+stage.scrollTop)+"px",
      width:Math.abs(anchor.x-p.x)+"px",height:Math.abs(anchor.y-p.y)+"px"
    });mark.hidden=false;
  });
  stage.addEventListener("pointerup",async event=>{
    if(!anchor)return;
    const p=point(event),a=anchor;anchor=null;
    if(Math.abs(a.x-p.x)<8||Math.abs(a.y-p.y)<8){mark.hidden=true;return;}
    const region={x:Math.min(a.x,p.x)/p.r.width,y:Math.min(a.y,p.y)/p.r.height,width:Math.abs(a.x-p.x)/p.r.width,height:Math.abs(a.y-p.y)/p.r.height};
    try{
      const selection=await invoke("selection",{region});
      state.selection={...selection,courseView:state.courseView};changed();info.hidden=false;
      info.textContent=(state.courseView==="model"?"Referencia marcada":"Área destino marcada")+" · "+(selection.text?.slice(0,200)||"Selección visual")+". Describe la propuesta en el objetivo.";
      await save({selection:state.selection,approvedPlanHash:"",status:"draft"});
      document.getElementById("sallyBrief").focus();
    }catch(error){toast(error.message);clear();}
  });
  stage.addEventListener("pointercancel",()=>{anchor=null;mark.hidden=true;});
}
