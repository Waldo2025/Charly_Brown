import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";

/* Firebase */
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);



/* Helpers */
const $  = (q, ctx=document)=>ctx.querySelector(q);
const $$ = (q, ctx=document)=>Array.from(ctx.querySelectorAll(q));
const openModal  = (m)=> m && m.classList.remove("hidden");
const closeModal = (m)=> m && m.classList.add("hidden");
const isOpen     = (m)=> m && !m.classList.contains("hidden");

function llenarGradosPorNivel(nivel, selGrado) {
  if (!selGrado) return;
  const primaria   = ["Primero","Segundo","Tercero","Cuarto","Quinto","Sexto"];
  const secundaria = ["Primero","Segundo","Tercero"];
  const opciones = nivel === "Secundaria" ? secundaria : primaria;
  selGrado.innerHTML = `<option value="">Selecciona</option>` + opciones.map(g => `<option>${g}</option>`).join("");
}

function fmtFecha(v) {
  try {
    if (!v) return "-";
    if (typeof v === "string") return new Date(v).toLocaleDateString();
    if (v?.toDate) return v.toDate().toLocaleDateString();
  } catch {}
  return "-";
}
function esc(s){return String(s ?? "").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));}

function formToObject(form) {
  const obj = {};
  $$("input[name], select[name], textarea[name]", form).forEach(el=>{
    obj[el.name] = (el.value ?? "").toString().trim();
  });
  return obj;
}
function resetFormEditor(modalEditor) {
  const form = $("#formSecuenciaAlcance", modalEditor);
  form?.reset();
  const selNivel = $("#selNivel", modalEditor);
  const selGrado = $("#selGrado", modalEditor);
  const hiddenId = $("#syaDocId", modalEditor);
  if (hiddenId) hiddenId.value = "";
  if (selNivel) selNivel.value = "Primaria";
  llenarGradosPorNivel("Primaria", selGrado);
}

/* Refs globales (Tailwind) */
let MODAL_LISTA, MODAL_EDITOR, CONT_TABLA;

document.addEventListener("DOMContentLoaded", () => {
  // Modales Tailwind
  MODAL_LISTA  = $("#modalListaSecuencias");
  MODAL_EDITOR = $("#modalEditorSyA");
  CONT_TABLA   = $("#contenedorSecuenciasGuardadas");

  // Botones que pueden abrir la lista (hay dos en tu HTML)
  const btnOpen1 = $("#btnVerSecuencias");     // "Ver > SyA Primaria"
  const btnOpen2 = $("#btnSecuenciaAlcance");  // pill "SyA · Primaria"

  // Controles del modal de lista (scoped)
  const btnNuevaLista   = $("#btnNuevaSecuencia", MODAL_LISTA);
  const btnImportLista  = $("#btnImportarXlsx", MODAL_LISTA);
  const inputXlsxLista  = $("#inputImportarXlsx", MODAL_LISTA);
  const btnExportAll    = $("#btnExportarTodoSecuencias", MODAL_LISTA);
  const buscadorLista   = $("#buscadorSyA", MODAL_LISTA);

  // Controles del modal editor (scoped)
  const btnCloseEditor = $("#cerrarModalEditorSyA", MODAL_EDITOR);
  const btnCancelEditor = $("#cancelarEditorSyA", MODAL_EDITOR);
  const formEditor      = $("#formSecuenciaAlcance", MODAL_EDITOR);
  const tituloEditor    = $("#tituloEditorSyA", MODAL_EDITOR);
  const hiddenId        = $("#syaDocId", MODAL_EDITOR);
  const selNivel        = $("#selNivel", MODAL_EDITOR);
  const selGrado        = $("#selGrado", MODAL_EDITOR);
  const selTrimestre    = $("#selTrimestre", MODAL_EDITOR);
  const selUnidad       = $("#selUnidad", MODAL_EDITOR);

  /* Abrir lista desde cualquiera de los dos botones */
  [btnOpen1, btnOpen2].forEach(btn=>{
    btn?.addEventListener("click", async () => {
      openModal(MODAL_LISTA);
      await renderTabla(); // Siempre refresca
    });
  });

  /* Cerrar lista (botón y clic en backdrop) */
  MODAL_LISTA?.addEventListener("click", (e) => {
    const t = e.target;
    // click en backdrop
    if (t?.id === "backdropListaSecuencias") {
      closeModal(MODAL_LISTA);
      return;
    }
    // click en cualquier botón con data-close="lista" (sirve para ambos botones)
    if (t?.closest?.('[data-close="lista"]')) {
      closeModal(MODAL_LISTA);
    }
  });

  /* Nueva secuencia => abrir editor vacío */
  btnNuevaLista?.addEventListener("click", () => {
    resetFormEditor(MODAL_EDITOR);
    if (tituloEditor) tituloEditor.textContent = "Nueva secuencia";
    openModal(MODAL_EDITOR);
  });

  /* Importar XLSX (lista) - CORREGIDO: elimina comillas dobles excesivas */
  btnImportLista?.addEventListener("click", ()=> inputXlsxLista?.click());
  inputXlsxLista?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      await ensureXLSX();
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type:"array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });
      if (!rows.length) { alert("El archivo está vacío."); return; }
      
for (const r of rows) {
  const data = {};

  Object.keys(r).forEach(key => {
    let value = r[key];

    // 🔹 Si es número, convertirlo a string
    if (typeof value === "number") {
      value = value.toString();
    }

    // 🔹 Si es nulo o indefinido, usar cadena vacía
    if (value == null) {
      value = "";
    }

    // 🔹 Mantener cualquier texto tal cual, sin alterar comillas
    data[key] = value;
  });

  // Agregar fecha de creación si no existe
  if (!data.fechaCreacion) data.fechaCreacion = new Date().toISOString();
  if (!data.id) delete data.id; // Firestore asigna ID automáticamente

  await addDoc(collection(db, "secuenciaAlcance"), data);
}

      await renderTabla();
      alert("Archivo importado correctamente. Comillas normalizadas.");
    } catch (err) {
      alert("No se pudo importar este archivo .xlsx");
    } finally {
      e.target.value = "";
    }
  });

  /* Exportar todo */
  btnExportAll?.addEventListener("click", async () => {
    try {
      await exportAllXlsx(); // se encarga de ensureXLSX internamente
    } catch (err) {
      alert("No se pudo exportar.");
    }
  });

  /* Buscador (solo dentro de la lista Tailwind) */
  buscadorLista?.addEventListener("input", () => {
    const q = (buscadorLista.value || "").toLowerCase().trim();
    const tbody = $("tbody", CONT_TABLA);
    if (!tbody) return;
    $$("tr", tbody).forEach(tr => {
      const txt = tr.textContent.toLowerCase();
      tr.style.display = txt.includes(q) ? "" : "none";
    });
  });

  /* === Filtros de Trimestre y Unidad === */
  const filtroTrimestre = $("#filtroTrimestre", MODAL_LISTA);
  const filtroUnidad    = $("#filtroUnidad", MODAL_LISTA);

  /* Función genérica aplicada a buscador + filtros */
  function aplicarFiltrosSyA() {
    const q = (buscadorLista?.value || "").toLowerCase().trim();
    const t = filtroTrimestre?.value || "";
    const u = filtroUnidad?.value || "";

    const tbody = $("tbody", CONT_TABLA);
    if (!tbody) return;

    $$("tr", tbody).forEach(tr => {
      let visible = true;

      const txt = tr.textContent.toLowerCase();

      // Filtro texto
      if (q && !txt.includes(q)) visible = false;

      // Filtro Trimestre
      if (t) {
        const colTrim = tr.children[3]?.textContent?.trim();
        if (String(colTrim) !== t) visible = false;
      }

      // Filtro Unidad
      if (u) {
        const colU = tr.children[4]?.textContent?.trim();
        if (String(colU) !== u) visible = false;
      }

      tr.style.display = visible ? "" : "none";
    });
  }

  /* Eventos */
  buscadorLista?.addEventListener("input", aplicarFiltrosSyA);
  filtroTrimestre?.addEventListener("change", aplicarFiltrosSyA);
  filtroUnidad?.addEventListener("change", aplicarFiltrosSyA);


  /* Editor: cerrar (botón y backdrop) */
  btnCloseEditor?.addEventListener("click", () => closeModal(MODAL_EDITOR));
  btnCancelEditor?.addEventListener("click", () => closeModal(MODAL_EDITOR));
  // Cerrar por click en backdrop
  MODAL_EDITOR?.addEventListener("click", (e) => {
    if (e.target?.id === "backdropEditorSyA") closeModal(MODAL_EDITOR);
  });
  /* Editor: submit crear/editar */
  formEditor?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formToObject(formEditor);
    if (!data.nivel || !data.grado) { alert("Completa Nivel y Grado."); return; }
    data.fechaCreacion = data.fechaCreacion || new Date().toISOString();

    try {
      if (hiddenId?.value) {
        await updateDoc(doc(db, "secuenciaAlcance", hiddenId.value), data);
      } else {
        await addDoc(collection(db, "secuenciaAlcance"), data);
      }
      closeModal(MODAL_EDITOR);
      await renderTabla();
    } catch (err) {
      alert("No se pudo guardar.");
    }
  });

  /* Dependencia: grados por nivel (en el editor, scoped) */
  selNivel?.addEventListener("change", (e)=> llenarGradosPorNivel(e.target.value, selGrado));
  if (selNivel && selGrado) {
    llenarGradosPorNivel(selNivel.value || "Primaria", selGrado);
  }

  /* ESC para cerrar el modal activo */
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (isOpen(MODAL_EDITOR)) closeModal(MODAL_EDITOR);
      else if (isOpen(MODAL_LISTA)) closeModal(MODAL_LISTA);
    }
  });
});

/* Tabla (CRUD lectura) */
async function renderTabla() {
  if (!CONT_TABLA) return;
  CONT_TABLA.innerHTML = `<p class="text-gray-500">Cargando...</p>`;

  const snap = await getDocs(collection(db, "secuenciaAlcance"));
  if (snap.empty) {
    CONT_TABLA.innerHTML = `<p class="text-gray-500">Sin registros.</p>`;
    return;
  }

  let html = `
    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="text-left text-gray-600">
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Fecha</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Nivel</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Grado</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Trimestre</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold">Unidad</th>
          <th class="border-b border-gray-200 px-3 py-2 font-semibold w-40">Acciones</th>
        </tr>
      </thead>
      <tbody>
  `;

  snap.forEach(d => {
    const x = d.data();
    html += `
      <tr data-id="${d.id}" class="border-b border-gray-100 hover:bg-gray-50">
        <td class="px-3 py-2">${fmtFecha(x.fechaCreacion)}</td>
        <td class="px-3 py-2">${esc(x.nivel || "-")}</td>
        <td class="px-3 py-2">${esc(x.grado || "-")}</td>
        <td class="px-3 py-2">${esc(x.trimestre || "-")}</td>
        <td class="px-3 py-2">${esc(x.unidad || "-")}</td>
        <td class="px-3 py-2">
          <div class="flex items-center gap-2">
            <button class="act-edit inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="act-del inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
            <button class="act-xlsx inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100" title="Descargar .xlsx">
              <i class="fa-solid fa-file-excel"></i>
            </button>
          </div>
        </td>
      </tr>`;
  });

  html += `</tbody></table>`;
  CONT_TABLA.innerHTML = html;

  // binds por fila (delegado simple)
  CONT_TABLA.querySelectorAll(".act-edit").forEach(b => b.addEventListener("click", onEdit));
  CONT_TABLA.querySelectorAll(".act-del").forEach(b => b.addEventListener("click", onDelete));
  CONT_TABLA.querySelectorAll(".act-xlsx").forEach(b => b.addEventListener("click", onExportOne));
}

/* Acciones fila */
async function onDelete(e) {
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  if (!confirm("¿Eliminar esta secuencia?")) return;
  await deleteDoc(doc(db, "secuenciaAlcance", id));
  await renderTabla();
}

async function onEdit(e) {
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  const snap = await getDoc(doc(db, "secuenciaAlcance", id));
  if (!snap.exists()) { alert("No encontrado."); return; }

  const data = snap.data();
  const modalEditor = $("#modalEditorSyA");

  // CORRECCIÓN: Limpiar comillas dobles excesivas al cargar datos
  const cleanData = {};
  Object.keys(data).forEach(key => {
    let value = data[key];
    if (typeof value === 'string') {
      // Eliminar comillas dobles excesivas
      value = value.replace(/""""/g, '"');
      // Normalizar a una sola comilla doble si es necesario
      if (value.startsWith('"') && value.endsWith('"') && value !== `"${value.slice(1, -1)}"`) {
        value = `"${value.slice(1, -1).replace(/""/g, '"')}"`;
      }
    }
    cleanData[key] = value;
  });

  // Campos scoped al editor
  const selNivel     = $("#selNivel", modalEditor);
  const selGrado     = $("#selGrado", modalEditor);
  const selTrimestre = $("#selTrimestre", modalEditor);
  const selUnidad    = $("#selUnidad", modalEditor);
  const form         = $("#formSecuenciaAlcance", modalEditor);
  const hiddenId     = $("#syaDocId", modalEditor);
  const tituloEditor = $("#tituloEditorSyA", modalEditor);

  // set básicos
  if (selNivel)  selNivel.value = cleanData.nivel || "Primaria";
  if (selGrado)  llenarGradosPorNivel(selNivel?.value || "Primaria", selGrado), selGrado.value = cleanData.grado || "";
  if (selTrimestre) selTrimestre.value = cleanData.trimestre || "1";
  if (selUnidad)    selUnidad.value    = cleanData.unidad || "1";

  // set dinámicos: todos los input[name] excepto los básicos
  $$("input[name], textarea[name], select[name]", form).forEach(el=>{
    const k = el.name;
    if (["id","nivel","grado","trimestre","unidad","fechaCreacion"].includes(k)) return;
    el.value = cleanData[k] ?? "";
  });

  if (hiddenId) hiddenId.value = id;
  if (tituloEditor) tituloEditor.textContent = "Editar secuencia";
  openModal(modalEditor);
}

async function onExportOne(e) {
  const id = e.currentTarget.closest("tr")?.dataset.id;
  if (!id) return;
  try {
    await exportOneXlsx(id); // usa el nuevo exportador
  } catch (err) {
    alert("No se pudo exportar el registro.");
  }
}

 
// --- 1) Headers EXACTOS de la BD (sin transformar nombres) ---
function buildExactHeaders(rows) {
  // Si quieres poner fijos primero, los prioriza SOLO si existen en los datos
  const FIXED = ["id", "nivel", "grado", "trimestre", "unidad", "fechaCreacion"];
  const keys = new Set();
  for (const r of rows) Object.keys(r || {}).forEach(k => keys.add(k));

  const fixed = FIXED.filter(k => keys.has(k));
  const rest  = [...keys].filter(k => !fixed.includes(k))
                         .sort((a,b)=> a.localeCompare(b, "es"));
  return [...fixed, ...rest];
}

// --- 2) Celdas normalizadas a texto (nunca generan nuevas columnas) ---
/* ========= LISTA BLANCA: SOLO ESTOS CAMPOS ========= */
const ALLOWED_FIELDS = [
  // Fijos
  "id","nivel","grado","trimestre","unidad","fechaCreacion",

  // Artes
  "Artes_T","Artes_AE","Artes_C","Artes_P",

  // Cívica y Ética
  "CivicaEtica_T","CivicaEtica_AE","CivicaEtica_C","CivicaEtica_P",
  
  // Lectura
  "Lectura_T","Lectura_AE","Lectura_C","Lectura_P",

  // Mi localidad
  "MiLocalidad_T","MiLocalidad_AE","MiLocalidad_C","MiLocalidad_P",

  // Expresión Escrita
  "ExpresionEscrita_T","ExpresionEscrita_AE","ExpresionEscrita_C","ExpresionEscrita_P",

  // Expresión Oral
  "ExpresionOral_T","ExpresionOral_AE","ExpresionOral_C","ExpresionOral_P",

  // Finanzas
  "Finanzas_T","Finanzas_AE","Finanzas_C","Finanzas_P",

  // Geografía (sin acento, según tus ejemplos)
  "Geografia_T","Geografia_AE","Geografia_C","Geografia_P",

  // Gramática (sin acento en la clave)
  "Gramatica_T","Gramatica_AE","Gramatica_C","Gramatica_P",

  // Habilidades
  "Habilidades_T","Habilidades_AE","Habilidades_C","Habilidades_P",

  // Historia
  "Historia_T","Historia_AE","Historia_C","Historia_P",

  // Matemáticas (sin acento en la clave)
  "Matematicas_T","Matematicas_AE","Matematicas_C","Matematicas_P",

  // Naturales
  "Naturales_T","Naturales_AE","Naturales_C","Naturales_P",

  // Ortografía (CON acento en la clave)
  "Ortografía_T","Ortografía_AE","Ortografía_C","Ortografía_P",

  // Socioemocional
  "Socioemocional_T","Socioemocional_AE","Socioemocional_C","Socioemocional_P",

  // Tecnología (CON acento en la clave)
  "Tecnologia_T","Tecnologia_AE","Tecnologia_C","Tecnologia_P",

   // Conocimientos del Medio
  "conocimientoDelMedio_T", "conocimientoDelMedio_AE", "conocimientoDelMedio_C", "conocimientoDelMedio_P",

];

/* ========= Normalizador de celdas CORREGIDO ========= */
function normalizeCell(v) {
  if (v == null) return '';
  
  // CORRECCIÓN: Si es un string con comillas dobles excesivas, normalizarlo
  if (typeof v === 'string') {
    // Eliminar comillas dobles excesivas
    v = v.replace(/""""/g, '"');
    
    // Si ya está entre comillas dobles, mantenerlo pero normalizar
    if (v.startsWith('"') && v.endsWith('"')) {
      const content = v.slice(1, -1);
      // Escapar correctamente las comillas internas y volver a envolver
      const escapedContent = content.replace(/"/g, '""');
      return `"${escapedContent}"`;
    }
    
    // Si no está entre comillas pero contiene comillas, necesita estar entre comillas
    if (v.includes('"') || v.includes(',') || v.includes('\n') || v.includes('\t')) {
      const escapedContent = v.replace(/"/g, '""');
      return `"${escapedContent}"`;
    }
    
    // Para strings simples sin caracteres especiales, devolver sin comillas
    return v;
  }
  
  // Para otros tipos de datos
  if (v && typeof v === "object" && typeof v.toDate === "function") {
    try { 
      const dateStr = v.toDate().toISOString().slice(0,19).replace("T"," ");
      return dateStr;
    } catch {}
  }
  
  if (v instanceof Date) {
    const dateStr = v.toISOString().slice(0,19).replace("T"," ");
    return dateStr;
  }
  
  if (Array.isArray(v)) {
    const arrayStr = v.map(item => String(item).replace(/"/g, '""')).join(" | ");
    return `"${arrayStr}"`;
  }
  
  if (typeof v === "object") {
    const jsonStr = JSON.stringify(v).replace(/\r?\n/g," ").replace(/"/g, '""');
    return `"${jsonStr}"`;
  }
  
  // Para otros tipos, convertir a string y manejar comillas si es necesario
  const stringValue = String(v).replace(/\r?\n/g," ").replace(/\t/g,"  ");
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    const escapedValue = stringValue.replace(/"/g, '""');
    return `"${escapedValue}"`;
  }
  
  return stringValue;
}

/* ========= Headers EXACTOS (intersección entre allowed y lo que realmente está en los docs) ========= */
function buildAllowedHeadersFromRows(rows) {
  const present = new Set();
  for (const r of rows) Object.keys(r || {}).forEach(k => present.add(k));
  // Respeta el orden de ALLOWED_FIELDS, pero solo incluye los que están presentes
  const headers = ALLOWED_FIELDS.filter(k => present.has(k));
  // Si quieres que siempre salgan los fijos aunque falten, descomenta:
  // for (const f of ["id","nivel","grado","trimestre","unidad","fechaCreacion"]) if (!headers.includes(f)) headers.unshift(f);
  return headers.length ? headers : ["id"]; // fallback mínimo
}

/* ========= Carga única de SheetJS ========= */
async function ensureXLSX() {
  if (window.XLSX) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

/* ========= EXPORTAR UNO ========= */
async function exportOneXlsx(id) {
  await ensureXLSX();

  const snap = await getDoc(doc(db, "secuenciaAlcance", id));
  if (!snap.exists()) { alert("No existe el documento."); return; }

  // Solo campos permitidos + id
  const raw = { id, ...snap.data() };
  
  // CORRECCIÓN: Limpiar comillas dobles excesivas antes de exportar
  const cleanData = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in raw) {
      let value = raw[k];
      if (typeof value === 'string') {
        value = value.replace(/""""/g, '"');
        if (value.startsWith('"') && value.endsWith('"') && value !== `"${value.slice(1, -1)}"`) {
          value = `"${value.slice(1, -1).replace(/""/g, '"')}"`;
        }
      }
      cleanData[k] = value;
    }
  }

  const headers = buildAllowedHeadersFromRows([cleanData]);
  const aoa = [ headers, headers.map(h => normalizeCell(cleanData[h])) ];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-ancho
  ws["!cols"] = headers.map((h, c) => {
    const len = Math.max(String(h).length, String(aoa[1][c] ?? "").length);
    return { wch: Math.max(10, Math.min(60, len + 2)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Secuencia");

  const f = raw.fechaCreacion ? new Date(raw.fechaCreacion) : new Date();
  const fecha = isNaN(f) ? new Date().toISOString().slice(0,10) : f.toISOString().slice(0,10);
  const nombre = `Secuencia_${(raw.nivel||'').replace(/\s+/g,'')}_${raw.grado||''}_T${raw.trimestre||''}_U${raw.unidad||''}_${fecha}.xlsx`;
  XLSX.writeFile(wb, nombre, { compression: true });
}

/* ========= EXPORTAR TODOS ========= */
async function exportAllXlsx() {
  await ensureXLSX();

  const snap = await getDocs(collection(db, "secuenciaAlcance"));
  const rawRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!rawRows.length) { alert("No hay registros para exportar."); return; }

  // CORRECCIÓN: Limpiar comillas dobles excesivas en todos los registros
  const cleanRows = rawRows.map(r => {
    const o = {};
    for (const k of ALLOWED_FIELDS) {
      if (k in r) {
        let value = r[k];
        if (typeof value === 'string') {
          value = value.replace(/""""/g, '"');
          if (value.startsWith('"') && value.endsWith('"') && value !== `"${value.slice(1, -1)}"`) {
            value = `"${value.slice(1, -1).replace(/""/g, '"')}"`;
          }
        }
        o[k] = value;
      }
    }
    return o;
  });

  const headers = buildAllowedHeadersFromRows(cleanRows);
  const aoa = [
    headers,
    ...cleanRows.map(r => headers.map(h => normalizeCell(r[h])))
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-ancho
  ws["!cols"] = headers.map((h, c) => {
    let maxLen = String(h).length;
    for (let r = 1; r < aoa.length; r++) {
      const v = aoa[r][c];
      if (v != null) maxLen = Math.max(maxLen, String(v).length);
    }
    return { wch: Math.max(10, Math.min(60, maxLen + 2)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Secuencias");
  const nombre = `Secuencias_Alcances_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, nombre, { compression: true });
}