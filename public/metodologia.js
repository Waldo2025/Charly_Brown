// generarLectura.js
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js';
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, deleteDoc, orderBy  } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/9.1.3/firebase-storage.js';
import setupImageGenerator from './imageGenerator.js';

// Config
// Configuración Firebase
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "",
  authDomain: window.__CHARLY_CONFIG__?.firebase?.authDomain || "",
  projectId: window.__CHARLY_CONFIG__?.firebase?.projectId || "",
  storageBucket: window.__CHARLY_CONFIG__?.firebase?.storageBucket || "",
  messagingSenderId: window.__CHARLY_CONFIG__?.firebase?.messagingSenderId || "",
  appId: window.__CHARLY_CONFIG__?.firebase?.appId || "",
  measurementId: window.__CHARLY_CONFIG__?.firebase?.measurementId || ""
};


// ✅ Inicializar Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

const metodologiaRef = collection(db, 'metodologiaASC');

// IDs/Refs del DOM (nuevos)
const BTN_ABRIR = 'btnAbrirModalMetodologia';
const MODAL_LISTA = 'modalListaTemasMetodologicos';
const MODAL_EDIT = 'modalEditorTemaMetodologico';
const BACKDROP_LISTA = 'backdropListaTemasMetodologicos';
const BACKDROP_EDIT = 'backdropEditorTemaMetodologico';
const BTN_CERRAR_LISTA = 'btnCerrarListaTemasMetodologicos';
const BTN_CERRAR_EDIT = 'btnCerrarEditorTemaMetodologico';

const FORM_EDIT = 'formEditorTemaMetodologico';
const INPUT_ID = 'inputIdTemaMetodologico';
const INPUT_TITULO = 'inputTituloTema';
const INPUT_CONCEPTO = 'inputConceptoTema';
const INPUT_COMENT = 'inputComentariosTema';

const CONTENEDOR_TEMAS = 'contenedorTemasMetodologicos';

let editandoId = null;

/* ============ Utils para abrir/cerrar modales ============ */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ============ Init principal ============ */
export async function initMetodologiaASC() {
  // Abrir lista
  const btnAbrir = document.getElementById(BTN_ABRIR);
  if (btnAbrir) btnAbrir.addEventListener('click', () => openModal(MODAL_LISTA));

  // Cerrar lista
  document.getElementById(BTN_CERRAR_LISTA)?.addEventListener('click', () => closeModal(MODAL_LISTA));
  document.getElementById(BACKDROP_LISTA)?.addEventListener('click', () => closeModal(MODAL_LISTA));

  // Cerrar editor
  document.getElementById(BTN_CERRAR_EDIT)?.addEventListener('click', () => closeModal(MODAL_EDIT));
  document.getElementById(BACKDROP_EDIT)?.addEventListener('click', () => closeModal(MODAL_EDIT));

  // Submit editor
  document.getElementById(FORM_EDIT)?.addEventListener('submit', guardarTemaMetodologia);

    // Botón NUEVO
  document.getElementById('btnNuevoTemaMet')?.addEventListener('click', () => abrirEditorPara(null));

  // Importar XLSX
  document.getElementById('btnImportTemasXlsx')?.addEventListener('click', () => {
    document.getElementById('inputImportTemasXlsx')?.click();
  });
  document.getElementById('inputImportTemasXlsx')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importarDesdeExcel(file);
      alert('Temas importados correctamente.');
    } catch (err) {
      alert('No se pudo importar el archivo.');
    } finally {
      e.target.value = ''; // reset input
    }
  });

  // Exportar XLSX
  document.getElementById('btnExportTemasXlsx')?.addEventListener('click', async () => {
    try {
      await exportarTemasAExcel();
    } catch (err) {
      alert('No se pudo exportar.');
    }
  });


  // Delegación para Editar/Eliminar en la lista
  const contenedor = document.getElementById(CONTENEDOR_TEMAS);
  if (contenedor) {
    contenedor.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === 'edit') {
        await abrirEditorPara(id);
      } else if (action === 'delete') {
        await eliminarTema(id);
      }
    });
  }

  // Cargar datos
  await cargarTemasMetodologicos();
}

/* ============ Cargar lista ============ */
export async function cargarTemasMetodologicos() {
  const contenedor = document.getElementById(CONTENEDOR_TEMAS);
  if (!contenedor) return;
  contenedor.innerHTML = '';

  const snap = await getDocs(metodologiaRef);
  if (snap.empty) {
    contenedor.innerHTML = `<p class="lecturas-empty">No hay temas metodológicos todavía.</p>`;
    return;
  }

  const filas = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const tema = escapeHtml(data.tema || '(Sin título)');
    const concepto = escapeHtml(stripHtml(data.concepto || '').slice(0, 170));
    const comentarios = escapeHtml(stripHtml(data.comentarios || '').slice(0, 120));
    filas.push(`
      <tr data-id="${docSnap.id}">
        <td title="${tema}">${tema}</td>
        <td title="${escapeHtml(stripHtml(data.concepto || ''))}">${concepto}${concepto.length >= 170 ? '…' : ''}</td>
        <td title="${escapeHtml(stripHtml(data.comentarios || ''))}">${comentarios || '—'}${comentarios.length >= 120 ? '…' : ''}</td>
        <td>
          <div class="lectura-row-actions">
            <button class="lectura-action-btn action-editar" data-action="edit" data-id="${docSnap.id}" title="Editar tema" aria-label="Editar tema">
              <i class="fas fa-pen"></i>
            </button>
            <button class="lectura-action-btn action-eliminar" data-action="delete" data-id="${docSnap.id}" title="Eliminar tema" aria-label="Eliminar tema">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `);
  });

  contenedor.innerHTML = `
    <table class="lecturas-table lecturas-table--managed">
      <thead>
        <tr>
          <th>Tema</th>
          <th>Concepto metodológico</th>
          <th>Comentarios</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${filas.join('')}</tbody>
    </table>
  `;
}

/* ============ Abrir editor (nuevo o existente) ============ */
async function abrirEditorPara(id = null) {
  editandoId = id;
  const $id = (s) => document.getElementById(s);

  if (id) {
    const snap = await getDoc(doc(db, 'metodologiaASC', id));
    const data = snap.exists() ? snap.data() : null;
    if (!data) return;

    $id(INPUT_ID).value = id;
    $id(INPUT_TITULO).value = data.tema || '';
    $id(INPUT_CONCEPTO).innerHTML = data.concepto || '';
    $id(INPUT_COMENT).innerHTML = data.comentarios || '';
  } else {
    // Nuevo
    $id(INPUT_ID).value = '';
    $id(INPUT_TITULO).value = '';
    $id(INPUT_CONCEPTO).innerHTML = '';
    $id(INPUT_COMENT).innerHTML = '';
  }

  openModal(MODAL_EDIT);
}

/* ============ Guardar (create/update) ============ */
async function guardarTemaMetodologia(e) {
  e.preventDefault();

  const idHidden = (document.getElementById(INPUT_ID)?.value || '').trim();
  const tema = document.getElementById(INPUT_TITULO)?.value.trim() || '';
  const concepto = document.getElementById(INPUT_CONCEPTO)?.innerHTML || '';
  const comentarios = document.getElementById(INPUT_COMENT)?.innerHTML || '';

  const payload = { tema, concepto, comentarios };

  if (idHidden) {
    await updateDoc(doc(db, 'metodologiaASC', idHidden), payload);
  } else {
    await addDoc(metodologiaRef, payload);
  }

  closeModal(MODAL_EDIT);
  await cargarTemasMetodologicos();
}

/* ============ Eliminar ============ */
async function eliminarTema(id) {
  if (!confirm('¿Eliminar este tema metodológico?')) return;
  await deleteDoc(doc(db, 'metodologiaASC', id));
  await cargarTemasMetodologicos();
}

/* ============ (Opcionales) Exportar / Importar ============ */
export async function exportarTemasAExcel() {
  if (typeof XLSX === 'undefined') throw new Error('XLSX no está cargado');

  const SAFE_LIMIT = 32760; // un poco menos de 32767 por seguridad

  const splitIntoChunks = (str, size) => {
    const out = [];
    for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
    return out;
  };

  const snap = await getDocs(metodologiaRef);

  // Hoja principal (mostrar, truncando si se pasa)
  const mainRows = [];

  // Hoja secundaria (guardar los textos completos pero PARTIDOS en <= SAFE_LIMIT)
  const overflowRows = []; // {Index, Tema, Campo, Parte, TextoParte, LongitudTotal}

  let index = 0;
  snap.forEach(docSnap => {
    index++;
    const d = docSnap.data();
    const tema = d.tema || '';
    const conceptoFull = stripHtml(d.concepto || '');
    const comentariosFull = stripHtml(d.comentarios || '');

    // --- Concepto: para hoja principal (posible truncado)
    let conceptoCell = conceptoFull;
    if (conceptoFull.length > SAFE_LIMIT) {
      conceptoCell = conceptoFull.slice(0, SAFE_LIMIT - 3) + ' […]';
      const parts = splitIntoChunks(conceptoFull, SAFE_LIMIT);
      parts.forEach((p, i) => {
        overflowRows.push({
          Index: index,
          Tema: tema,
          Campo: 'Concepto',
          Parte: i + 1,
          TextoParte: p,
          LongitudTotal: conceptoFull.length
        });
      });
    }

    // --- Comentarios: para hoja principal (posible truncado)
    let comentariosCell = comentariosFull;
    if (comentariosFull.length > SAFE_LIMIT) {
      comentariosCell = comentariosFull.slice(0, SAFE_LIMIT - 3) + ' […]';
      const parts = splitIntoChunks(comentariosFull, SAFE_LIMIT);
      parts.forEach((p, i) => {
        overflowRows.push({
          Index: index,
          Tema: tema,
          Campo: 'Comentarios',
          Parte: i + 1,
          TextoParte: p,
          LongitudTotal: comentariosFull.length
        });
      });
    }

    mainRows.push({
      Index: index,
      Tema: tema,
      Concepto: conceptoCell,
      Comentarios: comentariosCell
    });
  });

  const wb = XLSX.utils.book_new();

  // Hoja 1: resumen (con posible truncado, siempre <= SAFE_LIMIT)
  const wsMain = XLSX.utils.json_to_sheet(mainRows);
  XLSX.utils.book_append_sheet(wb, wsMain, 'Temas ASC');

  // Hoja 2: texto completo en partes (cada parte <= SAFE_LIMIT)
  if (overflowRows.length) {
    const wsOverflow = XLSX.utils.json_to_sheet(overflowRows);
    XLSX.utils.book_append_sheet(wb, wsOverflow, 'Texto completo');
  }

  // Escribir archivo (por si acaso, capturamos errores)
  try {
    XLSX.writeFile(wb, 'temasMetodologicos.xlsx');
  } catch (e) {
    alert('El archivo tiene textos muy largos. Te exporto un CSV sin límite por celda.');
    // Fallback a CSV (sin límite de celda, pero Excel seguirá mostrando por celda hasta su tope visual):
    const wsCSV = XLSX.utils.json_to_sheet(
      mainRows.map(r => ({
        Index: r.Index,
        Tema: r.Tema,
        Concepto: r.Concepto?.replace(/\r?\n/g, ' '),
        Comentarios: r.Comentarios?.replace(/\r?\n/g, ' ')
      }))
    );
    const csv = XLSX.utils.sheet_to_csv(wsCSV);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'temasMetodologicos.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
}


export async function importarDesdeExcel(file) {
  if (!file) return;
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const temas = XLSX.utils.sheet_to_json(sheet);

  for (const t of temas) {
    if (!t.Tema) continue;
    await addDoc(metodologiaRef, {
      tema: t.Tema || '',
      concepto: t.Concepto || '',
      comentarios: t.Comentarios || ''
    });
  }
  await cargarTemasMetodologicos();
}

/* ============ Helpers ============ */
function stripHtml(html = '') {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}
function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/* ============ Exponer abrirEditor si necesitas botón "Nuevo" ============ */
export function nuevoTema() {
  abrirEditorPara(null);
}

// Lanza el init cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initMetodologiaASC());
} else {
  initMetodologiaASC();
}

// (opcional) helper para depurar rápido en consola
window.__debugOpenASC = () => document.getElementById('btnAbrirModalMetodologia')?.click();
