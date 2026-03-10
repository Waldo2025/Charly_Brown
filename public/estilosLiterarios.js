// ===== Estilos literarios (lista + modal único para NUEVO/EDITAR) =====

// --- Firebase ---
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";

// Config
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db  = getFirestore(app);

// --- Utils ---
const $  = (q, ctx=document)=>ctx.querySelector(q);
const $$ = (q, ctx=document)=>Array.from(ctx.querySelectorAll(q));
function esc(s){ return String(s ?? "").replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m])); }

async function ensureXLSX(){
  if (window.XLSX) return;
  await new Promise((res, rej)=>{
    const s=document.createElement("script");
    s.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
}

// --- Categorías personalizadas ---
const CATEGORIAS_COLL = "categoriasEstilos";
const VAL_OTRO = "__OTRO__";

// --- Estado/Refs DOM ---
let MODAL, BTN_OPEN, BTN_CLOSE, BUSC, CONT_TAB;
let BTN_NUEVO, BTN_IMPORT, IN_FILE, BTN_EXPORT;

// Modal (se usará para NUEVO y EDITAR)
let EDIT_MODAL, EDIT_CLOSE, EDIT_FORM, EDIT_ID, EDIT_AUTOR, EDIT_TIPO, EDIT_EJEMPLO, EDIT_CAT, EDIT_CANCEL, EDIT_TITLE, EDIT_SUBMIT_BTN;

// Inputs “Otro”
let WRAP_CAT_EDIT, IN_CAT_EDITNEW;

// Control de modo del modal
let EDIT_MODE = "edit"; // 'new' | 'edit'
let buscadorBound = false;

// ---------- Tabla ----------
async function renderTablaEstilos(){
  CONT_TAB.innerHTML = `<p class="text-gray-500">Cargando estilos...</p>`;
  try{
    const snap = await getDocs(collection(db,"autoresEjemplo"));
    if (!snap.size){
      CONT_TAB.innerHTML = `
        <div class="text-gray-500">
          No hay estilos guardados. 
          <button id="ctaCrearEstilo" class="ml-2 inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900">Crear uno</button>
        </div>`;
      $("#ctaCrearEstilo")?.addEventListener("click", openCreateModal);
      return;
    }

    let html = `
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="text-left text-gray-600">
            <th class="border-b border-gray-200 px-3 py-2 font-semibold">Autor</th>
            <th class="border-b border-gray-200 px-3 py-2 font-semibold">Tipo de texto</th>
            <th class="border-b border-gray-200 px-3 py-2 font-semibold">Ejemplo</th>
            <th class="border-b border-gray-200 px-3 py-2 font-semibold">Categoría</th>
            <th class="border-b border-gray-200 px-3 py-2 font-semibold w-32">Acciones</th>
          </tr>
        </thead>
        <tbody>`;
    snap.forEach(d=>{
      const x=d.data();
      html += `
        <tr data-id="${d.id}" class="border-b border-gray-100 hover:bg-gray-50">
          <td class="px-3 py-2">${esc(x.autor||"—")}</td>
          <td class="px-3 py-2">${esc(x.tipoTexto||"—")}</td>
          <td class="px-3 py-2" title="${esc(x.ejemplo||"")}">
            <div class="max-w-[520px] truncate">${esc(x.ejemplo||"—")}</div>
          </td>
          <td class="px-3 py-2">${esc(x.categoria||"General")}</td>
          <td class="px-3 py-2">
            <div class="flex items-center gap-2">
              <button class="act-edit inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Editar">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="act-del inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Eliminar">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    CONT_TAB.innerHTML = html;

    if (!buscadorBound && BUSC){
      buscadorBound = true;
      BUSC.addEventListener("input", ()=>{
        const q=(BUSC.value||"").toLowerCase().trim();
        CONT_TAB.querySelectorAll("tbody tr").forEach(tr=>{
          tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    }
    CONT_TAB.querySelectorAll(".act-edit").forEach(b=> b.addEventListener("click", onEditEstilo));
    CONT_TAB.querySelectorAll(".act-del").forEach(b=> b.addEventListener("click", onDeleteEstilo));
  }catch(err){
    CONT_TAB.innerHTML = `<div class="text-red-700">Error al cargar estilos.<br><small>${esc(err?.message||String(err))}</small></div>`;
  }
}

// ---------- Categorías ----------
async function cargarCategoriasEnSelects(){
  let userCats=[];
  try{
    const snap = await getDocs(collection(db, CATEGORIAS_COLL));
    userCats = snap.docs.map(d=>({id:d.id, ...(d.data()||{})}))
      .filter(x=> (x.nombre||"").trim()).sort((a,b)=> a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));

  const baseValues = [
    "Análisis Literario",
    "Claridad y Precisión en la Explicación Gramatical y Lingüística",
    "Desarrollo de Personajes y Narrativa",
    "Descripción y Análisis de Obras de Arte",
    "Ensayo Literario Argumentativo",
    "Explicación Clara de Principios Económicos y Financieros",
    "Explicación Clara y Concisa de Conceptos",
    "Explicación Lógica y Deductiva de Conceptos Matemáticos",
    "Narrativa Histórica Rigurosa y Atractiva",
    "Narrativa de Crisis y Mercados Financieros",
    "Narrativa de Descubrimientos y Procesos Científicos",
    "Narrativa de la Historia y la Filosofía de las Matemáticas",
    "Reflexión Personal y Filosófica sobre el Arte",
    "Uso del Lenguaje y Estilo"
  ];

  const repoblar = (sel)=>{
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";
    sel.insertAdjacentHTML("beforeend", `<option value="">Selecciona una categoría</option>`);
    baseValues.forEach(v=> sel.insertAdjacentHTML("beforeend", `<option value="${esc(v)}">${esc(v)}</option>`));
    if (userCats.length){
      const ogId=`og-${sel.id}-mine`;
      sel.insertAdjacentHTML("beforeend", `<optgroup id="${ogId}" label="Mis categorías"></optgroup>`);
      const og = document.getElementById(ogId);
      userCats.forEach(c=> og.insertAdjacentHTML("beforeend", `<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`));
    }
    sel.insertAdjacentHTML("beforeend", `<option disabled>──────────</option>`);
    sel.insertAdjacentHTML("beforeend", `<option value="${VAL_OTRO}">Otro</option>`);
    if (prev && [...sel.options].some(o=>o.value===prev)) sel.value = prev;
  };

  repoblar(EDIT_CAT);
  } catch(err){
    console.error("No se pudieron cargar categorías", err);
  }
}

function syncOtroUI(selectEl, wrapDiv){
  if (!selectEl || !wrapDiv) return;
  const show = selectEl.value === VAL_OTRO;
  wrapDiv.classList.toggle("hidden", !show);
  if (!show){ const inp = wrapDiv.querySelector("input"); if (inp) inp.value=""; }
}

async function ensureCategoria(nombre){
  const clean=(nombre||"").trim(); if (!clean) return "";
  const snap = await getDocs(collection(db, CATEGORIAS_COLL));
  const exists = snap.docs.some(d => (d.data()?.nombre||"").trim()
                      .localeCompare(clean,'es',{sensitivity:'accent'})===0);
  if (!exists){
    await addDoc(collection(db, CATEGORIAS_COLL), { nombre: clean, createdAt: new Date() });
  }
  return clean;
}

// ---------- Acciones fila ----------
async function onEditEstilo(e){
  const id = e.currentTarget.closest("tr")?.dataset.id; if(!id) return;
  try{
    const snap = await getDoc(doc(db,"autoresEjemplo", id));
    if (!snap.exists()){ alert("Documento no encontrado."); return; }
    const x = snap.data();

    EDIT_MODE = "edit";
    await cargarCategoriasEnSelects();

    EDIT_ID.value = id;
    EDIT_AUTOR.value = x.autor||"";
    EDIT_TIPO.value = x.tipoTexto||"";
    EDIT_EJEMPLO.value = x.ejemplo||"";
    if (![...EDIT_CAT.options].some(o=>o.value===x.categoria)){
      EDIT_CAT.insertAdjacentHTML("afterbegin", `<option value="${esc(x.categoria)}">${esc(x.categoria)}</option>`);
    }
    EDIT_CAT.value = x.categoria || "";

    EDIT_TITLE.textContent = "Editar estilo literario";
    EDIT_SUBMIT_BTN.textContent = "Guardar cambios";
    syncOtroUI(EDIT_CAT, WRAP_CAT_EDIT);

    openEditModal();
  }catch(err){
    alert("No se pudo cargar el estilo.");
  }
}

async function onDeleteEstilo(e){
  const id = e.currentTarget.closest("tr")?.dataset.id; if(!id) return;
  if (!confirm("¿Eliminar este estilo?")) return;
  try{
    await deleteDoc(doc(db,"autoresEjemplo", id));
    await renderTablaEstilos();
  } catch (err) {
    alert("No se pudo eliminar el estilo.");
  }
}

// ---------- NUEVO (modal centrado) ----------
async function openCreateModal(){
  EDIT_MODE = "new";
  await cargarCategoriasEnSelects();

  EDIT_ID.value = "";
  EDIT_AUTOR.value = "";
  EDIT_TIPO.value = "";
  EDIT_EJEMPLO.value = "";
  EDIT_CAT.value = "";

  EDIT_TITLE.textContent = "Nuevo estilo";
  EDIT_SUBMIT_BTN.textContent = "Guardar";
  syncOtroUI(EDIT_CAT, WRAP_CAT_EDIT);

  openEditModal();
}

// ---------- Import/Export ----------
async function importarXlsx(file){
  try{
    await ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, {type:"array"});
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {defval:""});
    if (!rows.length){ alert("El archivo está vacío."); return; }

    for (const r of rows){
      const autor     = r.autor ?? r.Autor ?? r.AUTOR ?? r["Nombre del autor"];
      const tipoTexto = r.tipoTexto ?? r["Tipo de texto"] ?? r.TipoTexto ?? r["Tipo"];
      const ejemplo   = r.ejemplo ?? r.Ejemplo ?? r["Literatura de ejemplo"];
      const categoria = r.categoria ?? r.Categoría ?? r.Categoria ?? "General";
      if (!autor || !tipoTexto || !ejemplo) continue;

      await addDoc(collection(db,"autoresEjemplo"), {
        autor: String(autor).trim(),
        tipoTexto: String(tipoTexto).trim(),
        ejemplo: String(ejemplo).trim(),
        categoria: String(categoria).trim(),
        fecha: new Date()
      });
    }
    await renderTablaEstilos();
    alert("✅ Importación completada.");
  }catch(err){
    alert("❌ No se pudo importar este .xlsx");
  }
}

async function exportarXlsx(){
  try{
    await ensureXLSX();
    const snap = await getDocs(collection(db,"autoresEjemplo"));
    const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    if (!rows.length){ alert("No hay estilos para exportar."); return; }

    const headers = ["id","autor","tipoTexto","ejemplo","categoria","fecha"];
    const aoa = [ headers ];
    for (const r of rows){
      aoa.push([
        r.id||"", r.autor||"", r.tipoTexto||"", r.ejemplo||"",
        r.categoria||"General",
        r.fecha?.toDate?.()?.toISOString?.()?.slice(0,10) || r.fecha || ""
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map(h=>({ wch: Math.min(60, Math.max(10, String(h).length+2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estilos");
    XLSX.writeFile(wb, `Estilos_Literarios_${new Date().toISOString().slice(0,10)}.xlsx`, {compression:true});
  }catch(err){
    alert("❌ Error al exportar.");
  }
}

// ---------- Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  // Lista
  MODAL     = $("#modalEstilosLiterarios");
  BTN_OPEN  = $("#btnAgregarEstilo") || $("#btnListaEstilos");
  BTN_CLOSE = $("#cerrarModalEstilos");
  BUSC      = $("#buscadorEstilos");
  CONT_TAB  = $("#contenedorTablaEstilos");

  // Import/Export
  BTN_IMPORT  = $("#btnImportEstilosXlsx");
  IN_FILE     = $("#inputImportEstilosXlsx");
  BTN_EXPORT  = $("#btnExportEstilosXlsx");

  // Modal único (editar/nuevo)
  EDIT_MODAL      = $("#modalEditarEstilo");
  EDIT_CLOSE      = $("#cerrarModalEditarEstilo");
  EDIT_FORM       = $("#formEditarEstilo");
  EDIT_ID         = $("#editEstiloId");
  EDIT_AUTOR      = $("#editAutorEstiloU");
  EDIT_TIPO       = $("#editTipoTextoEstiloU");
  EDIT_EJEMPLO    = $("#editTextoEstiloU");
  EDIT_CAT        = $("#editCategoriaEstiloU");
  EDIT_CANCEL     = $("#cancelarEditarEstilo");
  EDIT_TITLE      = EDIT_MODAL?.querySelector("h3");
  EDIT_SUBMIT_BTN = EDIT_FORM?.querySelector('button[type="submit"]');

  // Input "Otro" en el modal
  WRAP_CAT_EDIT   = $("#wrapCatCustomEdit");
  IN_CAT_EDITNEW  = $("#catCustomEdit");

  // Botón "Nuevo" abre el modal centrado
  BTN_NUEVO = $("#btnNuevoEstilo");
  BTN_NUEVO?.addEventListener("click", openCreateModal);

  // Abrir lista
  BTN_OPEN?.addEventListener("click", async ()=>{
    openListModal();
    await cargarCategoriasEnSelects();
    await renderTablaEstilos();
  });

  // Cerrar lista (botón)
  BTN_CLOSE?.addEventListener("click", closeListModal);
  // Cerrar lista por backdrop
  MODAL?.addEventListener("click",(e)=>{
    if (e.target && e.target.classList?.contains("bg-black/50")) closeListModal();
  });
  // ESC para lista
  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape" && MODAL && !MODAL.classList.contains("hidden")) closeListModal();
  });

  // Categorías en modal
  EDIT_CAT?.addEventListener("change", ()=> syncOtroUI(EDIT_CAT, WRAP_CAT_EDIT));

  // Guardar (NUEVO o EDITAR) en el mismo submit
  EDIT_FORM?.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const autor     = EDIT_AUTOR.value.trim();
    const tipoTexto = EDIT_TIPO.value.trim();
    const ejemplo   = EDIT_EJEMPLO.value.trim();

    let categoria = EDIT_CAT.value;
    if (categoria === VAL_OTRO){
      const nueva = IN_CAT_EDITNEW?.value?.trim();
      if (!nueva){ alert("Escribe un nombre para la nueva categoría."); return; }
      categoria = await ensureCategoria(nueva);
      await cargarCategoriasEnSelects();
    }

    if (!autor || !tipoTexto || !ejemplo || !categoria){
      alert("Completa todos los campos."); return;
    }

    try{
      if (EDIT_MODE === "edit"){
        const id = EDIT_ID.value;
        await updateDoc(doc(db,"autoresEjemplo", id), { autor, tipoTexto, ejemplo, categoria });
      }else{
        await addDoc(collection(db,"autoresEjemplo"), { autor, tipoTexto, ejemplo, categoria, fecha:new Date() });
      }
      closeEditModal();
      await renderTablaEstilos();
      alert("✅ Guardado.");
    }catch(err){
      alert("❌ No se pudo guardar.");
    }
  });

  // Import/Export
  BTN_IMPORT?.addEventListener("click", ()=> IN_FILE.click());
  IN_FILE?.addEventListener("change", async (ev)=>{
    const file = ev.target.files?.[0]; if(!file) return;
    await importarXlsx(file); ev.target.value="";
  });
  BTN_EXPORT?.addEventListener("click", exportarXlsx);

  // Cerrar modal (nuevo/editar)
  EDIT_CLOSE?.addEventListener("click", closeEditModal);
  EDIT_CANCEL?.addEventListener("click", closeEditModal);
  // Cerrar por backdrop
  EDIT_MODAL?.addEventListener("click", (e)=>{ if(e.target && e.target.classList?.contains("bg-black/50")) closeEditModal(); });
  // ESC para editor
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && EDIT_MODAL && !EDIT_MODAL.classList.contains("hidden")) closeEditModal(); });
});

// --- abrir/cerrar modal LISTA ---
function openListModal(){
  MODAL?.classList.remove("hidden");
  document.body.style.overflow="hidden";
}
function closeListModal(){
  MODAL?.classList.add("hidden");
  document.body.style.overflow="auto";
}

// --- abrir/cerrar modal (compartido para nuevo/editar) ---
function openEditModal(){
  EDIT_MODAL?.classList.remove("hidden");
  document.body.style.overflow="hidden";
}
function closeEditModal(){
  EDIT_MODAL?.classList.add("hidden");
  document.body.style.overflow="auto";
}
