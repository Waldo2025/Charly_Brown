// ===== Campos Formativos (lista + editor, estilo Tailwind) =====

// Firebase
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js";

// Config
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: window.__CHARLY_CONFIG__?.firebase?.authDomain || "",
  projectId: window.__CHARLY_CONFIG__?.firebase?.projectId || "",
  storageBucket: window.__CHARLY_CONFIG__?.firebase?.storageBucket || "",
  messagingSenderId: window.__CHARLY_CONFIG__?.firebase?.messagingSenderId || "",
  appId: window.__CHARLY_CONFIG__?.firebase?.appId || "",
  measurementId: window.__CHARLY_CONFIG__?.firebase?.measurementId || ""
};
const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Utils
const $  = (q, ctx=document)=>ctx.querySelector(q);
const $$ = (q, ctx=document)=>Array.from(ctx.querySelectorAll(q));
const esc = s => String(s ?? "").replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
function openModal(m){ if(!m) return; m.classList?.remove("hidden"); m.style.display="block"; document.body.style.overflow="hidden"; }
function closeModal(m){ if(!m) return; m.classList?.add("hidden"); m.style.display="none"; document.body.style.overflow="auto"; }
function ensureXLSX(){ return window.XLSX ? Promise.resolve() : new Promise((res, rej)=>{ const s=document.createElement("script"); s.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }

// Campos/headers soportados (formato XLSX)
const CF_FIELDS = [
  "campo","asignatura","nivel","trimestre","unidad",
  "aprendizajeEsperado","pda","tipoActividad",
  "nivelEsperado","diferenciacion","timestamp","userId","id"
];
// sinónimos aceptados al importar
const IMPORT_MAP = {
  "Campo":"campo", "Asignatura":"asignatura", "Nivel":"nivel",
  "Trimestre":"trimestre", "Unidad":"unidad",
  "Aprendizaje esperado":"aprendizajeEsperado", "AprendizajeEsperado":"aprendizajeEsperado",
  "PDA":"pda",
  "Tipo de actividad":"tipoActividad", "TipoActividad":"tipoActividad",
  "Nivel esperado":"nivelEsperado","NivelEsperado":"nivelEsperado",
  "Diferenciación":"diferenciacion","Diferenciacion":"diferenciacion",
  "Timestamp":"timestamp","UserId":"userId","ID":"id","Id":"id"
};

// Asignaturas por campo
const ASIG_POR_CAMPO = {
  "Lenguajes": ["Ortografía","Gramática","Expresión Escrita","Expresión Oral","Arte"],
  "Saberes y pensamiento científico": ["Ciencias Naturales","Matemáticas","Finanzas"],
  "Ética, Naturaleza y sociedad": ["Geografía","Historia de México","Historia del Mundo","Conocimiento del mundo","Conocimiento de mi localidad"],
  "De lo humano y comunitario": ["Formación Cívica y Ética","Educación Socioemocional","Valores","Cultura de paz"]
};
function fillAsignaturasUI(campoVal, selEl, inputEl){
  const lista = ASIG_POR_CAMPO[campoVal] || [];
  if (selEl){
    selEl.innerHTML = `<option value="">Selecciona una asignatura</option>` + lista.map(a=>`<option>${esc(a)}</option>`).join("");
  } else if (inputEl){
    inputEl.value = ""; // el usuario escribe libremente si no hay select
  }
}

// Estado y refs
let MODAL_LISTA, MODAL_EDITOR;
let BTN_OPEN, BTN_CLOSE_LISTA, CONT_TABLA, BUSCADOR, BTN_NUEVO, BTN_EXPORT, BTN_IMPORT, IN_FILE;
let FORM, HID_ID, IN_CAMPO, IN_ASIG_INPUT, IN_ASIG_SELECT, IN_NIVEL, IN_TRIM, IN_UNID, IN_AE, IN_PDA, IN_TIPOACT, IN_NIVEL_EXP, IN_DIF, TITLE_EDITOR;
let EDIT_MODE = "new"; // "new" | "edit"

// Inicio
document.addEventListener("DOMContentLoaded", ()=>{
  // Lista
  MODAL_LISTA = $("#modalListaCampos") || $("#listamodalCamposFormativos");
  CONT_TABLA  = $("#contenedorCamposLista") || $("#contenedorCamposFormativos");
  BUSCADOR    = $("#buscadorCampos");
  BTN_OPEN    = $("#btnCamposFormativos");
  BTN_CLOSE_LISTA = $("#cerrarModalListaCampos") || $("#cerrarModalCampos");
  BTN_NUEVO   = $("#btnNuevoCampo");
  BTN_EXPORT  = $("#btnExportCamposXlsx");
  BTN_IMPORT  = $("#btnImportCamposXlsx");
  IN_FILE     = $("#inputImportCamposXlsx");

  // Editor
  MODAL_EDITOR = $("#modalEditorCampoFormativo") || $("#modalEditarCampoFormativo");
  FORM         = $("#formEditarCampo");
  HID_ID       = $("#campoDocId") || $("#campoId");
  IN_CAMPO     = $("#editCampo");
  IN_ASIG_INPUT= $("#editAsignatura");
  IN_ASIG_SELECT = $("#editAsignaturaSel");
  IN_NIVEL     = $("#editNivel");
  IN_TRIM      = $("#editTrimestre");
  IN_UNID      = $("#editUnidad");
  IN_AE        = $("#editAprendizaje");
  IN_PDA       = $("#editPDA");
  IN_TIPOACT   = $("#editTipoActividad");
  IN_NIVEL_EXP = $("#editNivelEsperado");
  IN_DIF       = $("#editDiferenciacion");
  TITLE_EDITOR = $("#tituloEditorCampo") || (MODAL_EDITOR?.querySelector("h3"));

  // ---- Abrir lista
  BTN_OPEN?.addEventListener("click", async ()=>{
    openModal(MODAL_LISTA);
    await renderTabla();
  });

  // ---- Cerrar lista
  BTN_CLOSE_LISTA?.addEventListener("click", ()=> closeModal(MODAL_LISTA));
  MODAL_LISTA?.addEventListener("click", (e)=>{ if(e.target===MODAL_LISTA) closeModal(MODAL_LISTA); });

  // ---- Buscar en tabla
  BUSCADOR?.addEventListener("input", ()=>{
    const q=(BUSCADOR.value||"").toLowerCase().trim();
    if (!CONT_TABLA) return;
    $$("tbody tr", CONT_TABLA).forEach(tr=>{
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });

  // ---- Nuevo
  BTN_NUEVO?.addEventListener("click", ()=> openEditorNew());

  // ---- Exportar
  BTN_EXPORT?.addEventListener("click", exportAllXlsx);

  // ---- Importar
  BTN_IMPORT?.addEventListener("click", ()=> IN_FILE?.click());
  IN_FILE?.addEventListener("change", async (ev)=>{
    const f = ev.target.files?.[0]; if(!f) return;
    await importFromXlsx(f);
    ev.target.value="";
    await renderTabla();
  });

  // ---- Dependencias editor
  IN_CAMPO?.addEventListener("change", ()=>{
    fillAsignaturasUI(IN_CAMPO.value, IN_ASIG_SELECT, IN_ASIG_INPUT);
  });

  // ---- Guardar (nuevo/editar)
  FORM?.addEventListener("submit", onSubmitEditor);

  // ---- Cerrar editor
  ($("#cerrarModalEditorCampo") || $("#cerrarModalEditarCampo"))?.addEventListener("click", ()=> closeModal(MODAL_EDITOR));
  MODAL_EDITOR?.addEventListener("click",(e)=>{ if(e.target===MODAL_EDITOR) closeModal(MODAL_EDITOR); });

  // ESC
  document.addEventListener("keydown",(e)=>{
    if (e.key==="Escape"){
      if (MODAL_EDITOR && (MODAL_EDITOR.style.display==="block" || !MODAL_EDITOR.classList.contains("hidden"))) closeModal(MODAL_EDITOR);
      else if (MODAL_LISTA && (MODAL_LISTA.style.display==="block" || !MODAL_LISTA.classList.contains("hidden"))) closeModal(MODAL_LISTA);
    }
  });
});

// ========== Tabla ==========
async function renderTabla(){
  if (!CONT_TABLA) return;
  CONT_TABLA.innerHTML = `<p class="text-gray-500">Cargando...</p>`;

  const snap = await getDocs(collection(db,"camposFormativos"));
  if (snap.empty){
    CONT_TABLA.innerHTML = `<div class="p-3 text-gray-500">Sin registros.</div>`;
    return;
  }

  let html = `
    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="text-left text-gray-600">
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Campo</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Asignatura</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Nivel</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Tri</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Uni</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold w-40">Acciones</th>
        </tr>
      </thead>
      <tbody>`;
  snap.forEach(d=>{
    const x=d.data();
    html += `
      <tr data-id="${d.id}" class="border-b border-gray-100 hover:bg-gray-50">
        <td class="px-3 py-2">${esc(x.campo||"-")}</td>
        <td class="px-3 py-2">${esc(x.asignatura||"-")}</td>
        <td class="px-3 py-2">${esc(x.nivel||"-")}</td>
        <td class="px-3 py-2">${esc(x.trimestre||"-")}</td>
        <td class="px-3 py-2">${esc(x.unidad||"-")}</td>
        <td class="px-3 py-2">
          <div class="flex items-center gap-2">
            <button class="act-edit inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button class="act-del inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            <button class="act-xlsx inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Descargar .xlsx"><i class="fa-solid fa-file-excel"></i></button>
          </div>
        </td>
      </tr>`;
  });
  html += `</tbody></table>`;
  CONT_TABLA.innerHTML = html;

  CONT_TABLA.querySelectorAll(".act-edit").forEach(b=> b.addEventListener("click", onEditRow));
  CONT_TABLA.querySelectorAll(".act-del").forEach(b=> b.addEventListener("click", onDeleteRow));
  CONT_TABLA.querySelectorAll(".act-xlsx").forEach(b=> b.addEventListener("click", onExportOne));
}

// ========== Editor ==========
function resetEditor(){
  if (FORM) FORM.reset();
  if (HID_ID) HID_ID.value="";
  if (TITLE_EDITOR) TITLE_EDITOR.textContent = "Nuevo campo formativo";
  fillAsignaturasUI("", IN_ASIG_SELECT, IN_ASIG_INPUT);
}
function openEditorNew(){
  EDIT_MODE = "new";
  resetEditor();
  openModal(MODAL_EDITOR);
}
async function onEditRow(e){
  const id = e.currentTarget.closest("tr")?.dataset.id; if(!id) return;
  const snap = await getDoc(doc(db,"camposFormativos", id));
  if (!snap.exists()){ alert("No encontrado."); return; }
  const x = snap.data();

  EDIT_MODE = "edit";
  if (TITLE_EDITOR) TITLE_EDITOR.textContent = "Editar campo formativo";

  // set campos
  HID_ID && (HID_ID.value = id);
  IN_CAMPO && (IN_CAMPO.value = x.campo || "");
  fillAsignaturasUI(x.campo, IN_ASIG_SELECT, IN_ASIG_INPUT);
  if (IN_ASIG_SELECT) IN_ASIG_SELECT.value = x.asignatura || "";
  if (IN_ASIG_INPUT)  IN_ASIG_INPUT.value  = x.asignatura || "";
  IN_NIVEL && (IN_NIVEL.value = x.nivel || "");
  IN_TRIM  && (IN_TRIM.value  = x.trimestre || "");
  IN_UNID  && (IN_UNID.value  = x.unidad || "");
  IN_AE    && (IN_AE.value    = x.aprendizajeEsperado || "");
  IN_PDA   && (IN_PDA.value   = x.pda || "");
  IN_TIPOACT && (IN_TIPOACT.value = x.tipoActividad || "");
  IN_NIVEL_EXP && (IN_NIVEL_EXP.value = x.nivelEsperado || "");
  IN_DIF && (IN_DIF.value = x.diferenciacion || "");

  openModal(MODAL_EDITOR);
}
async function onSubmitEditor(ev){
  ev.preventDefault();

  const asignaturaVal = IN_ASIG_SELECT ? IN_ASIG_SELECT.value : IN_ASIG_INPUT?.value;
  const payload = {
    campo: IN_CAMPO?.value?.trim() || "",
    asignatura: asignaturaVal?.trim() || "",
    nivel: IN_NIVEL?.value?.trim() || "",
    trimestre: IN_TRIM?.value?.trim() || "",
    unidad: IN_UNID?.value?.trim() || "",
    aprendizajeEsperado: IN_AE?.value?.trim() || "",
    pda: IN_PDA?.value?.trim() || "",
    tipoActividad: IN_TIPOACT?.value?.trim() || "",
    nivelEsperado: IN_NIVEL_EXP?.value?.toString()?.trim() || "",
    diferenciacion: IN_DIF?.value?.trim() || ""
  };

  // Validaciones básicas
  const req = ["campo","asignatura","nivel","trimestre","unidad","tipoActividad"];
  if (req.some(k=> !payload[k])){
    alert("Completa los campos obligatorios (campo, asignatura, nivel, trimestre, unidad, tipo de actividad).");
    return;
  }

  try{
    if (EDIT_MODE==="edit" && HID_ID?.value){
      await updateDoc(doc(db,"camposFormativos", HID_ID.value), payload);
    }else{
      const user = auth.currentUser;
      payload.userId = user?.uid || "anon";
      payload.timestamp = new Date().toISOString();
      await addDoc(collection(db,"camposFormativos"), payload);
    }
    closeModal(MODAL_EDITOR);
    await renderTabla();
    alert("✅ Guardado.");
  }catch(err){
    alert("❌ No se pudo guardar.");
  }
}
async function onDeleteRow(e){
  const id = e.currentTarget.closest("tr")?.dataset.id; if(!id) return;
  if (!confirm("¿Eliminar este registro?")) return;
  await deleteDoc(doc(db,"camposFormativos", id));
  await renderTabla();
}

// ========== Export/Import ==========
function normalizeCell(v){
  if (v==null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v==="object") return JSON.stringify(v);
  return String(v);
}
async function exportAllXlsx(){
  await ensureXLSX();
  const snap = await getDocs(collection(db,"camposFormativos"));
  const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  if (!rows.length){ alert("No hay registros para exportar."); return; }

  // headers: usa orden CF_FIELDS pero solo los presentes
  const present = new Set(); rows.forEach(r=> Object.keys(r).forEach(k=>present.add(k)));
  const headers = CF_FIELDS.filter(h=>present.has(h));
  const aoa = [headers, ...rows.map(r=> headers.map(h=> normalizeCell(r[h])))];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map((h,i)=>({ wch: Math.min(60, Math.max(10, String(h).length+2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CamposFormativos");
  XLSX.writeFile(wb, `CamposFormativos_${new Date().toISOString().slice(0,10)}.xlsx`, {compression:true});
}
async function onExportOne(e){
  await ensureXLSX();
  const id = e.currentTarget.closest("tr")?.dataset.id; if(!id) return;
  const snap = await getDoc(doc(db,"camposFormativos", id));
  if (!snap.exists()){ alert("No encontrado."); return; }
  const raw = { id, ...snap.data() };
  const headers = CF_FIELDS.filter(h=> h in raw);
  const aoa = [ headers, headers.map(h=> normalizeCell(raw[h])) ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map(h=>({wch: Math.min(60, Math.max(10, String(h).length+2))}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Campo");
  const fecha = (raw.timestamp && !isNaN(Date.parse(raw.timestamp))) ? raw.timestamp.slice(0,10) : new Date().toISOString().slice(0,10);
  const nombre = `Campo_${(raw.campo||"").replace(/\s+/g,"")}_${fecha}.xlsx`;
  XLSX.writeFile(wb, nombre, {compression:true});
}
async function importFromXlsx(file){
  try{
    await ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, {type:"array"});
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows= XLSX.utils.sheet_to_json(ws, {defval:""});

    if (!rows.length){ alert("El archivo está vacío."); return; }

    for (const r0 of rows){
      // normaliza headers a las claves internas
      const r = {};
      Object.entries(r0).forEach(([k,v])=>{
        const key = (IMPORT_MAP[k] || IMPORT_MAP[k.trim()] || k).trim();
        r[key] = v;
      });

      // arma payload
      const payload = {
        campo: String(r.campo||"").trim(),
        asignatura: String(r.asignatura||"").trim(),
        nivel: String(r.nivel||"").trim(),
        trimestre: String(r.trimestre||"").trim(),
        unidad: String(r.unidad||"").trim(),
        aprendizajeEsperado: String(r.aprendizajeEsperado||"").trim(),
        pda: String(r.pda||"").trim(),
        tipoActividad: String(r.tipoActividad||"").trim(),
        nivelEsperado: String(r.nivelEsperado||"").trim(),
        diferenciacion: String(r.diferenciacion||"").trim(),
        timestamp: r.timestamp || new Date().toISOString(),
        userId: r.userId || (auth.currentUser?.uid || "import")
      };

      // si el XLSX trae id, intenta update; si no, add
      if (r.id){
        try{
          await updateDoc(doc(db,"camposFormativos", String(r.id)), payload);
        }catch{
          await addDoc(collection(db,"camposFormativos"), payload);
        }
      }else{
        await addDoc(collection(db,"camposFormativos"), payload);
      }
    }
    alert("✅ Importación completada.");
  }catch(err){
    alert("❌ No se pudo importar el .xlsx");
  }
}
