import { getDefaultFirebaseApp } from "./firebase-default-app.js";
// generarUnidadSecundaria.js

import { getFirestore, addDoc, collection, getDocs, where, query, updateDoc, getDoc, doc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/* =========================
   HELPERS SEGUROS
========================= */
const $ = (id) => document.getElementById(id);
const on = (id, event, handler) => {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
};
const escapeHtml = (value = "") => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

/* =========================
   CONFIGURACIÓN FIREBASE
========================= */
const app = getDefaultFirebaseApp();
const db = getFirestore(app);

/* =========================
   CATEGORÍAS Y SUBTEMAS
========================= */
const categoriasPorGrado = {
  "Primero": {
    "Lenguajes": ["Español"],
    "Ética, naturaleza y sociedades": ["Cívica y ética", "Historia del mundo", "Geografía"],
    "Saberes y pensamiento científico": ["Biología", "Matemáticas"]
  },
  "Segundo": {
    "Lenguajes": ["Español"],
    "Ética, naturaleza y sociedades": ["Cívica y ética", "Historia de México 1"],
    "Saberes y pensamiento científico": ["Física", "Matemáticas"]
  },
  "Tercero": {
    "Lenguajes": ["Español"],
    "Ética, naturaleza y sociedades": ["Cívica y ética", "Historia de México 2"],
    "Saberes y pensamiento científico": ["Química", "Matemáticas"]
  }
};

/* =========================
   UI SUBTEMAS
========================= */
function generarCamposSubtema(subtema, valores = {}) {
  const temaVal = valores[`${subtema}_tema`] || "";
  const lecturaVal = valores[`${subtema}_lectura`] || "";
  const aprendizajesVal = (valores[`${subtema}_aprendizajes`] || [""]).join("\n");
  const habilidadesVal = (valores[`${subtema}_habilidades`] || [""]).join("\n");
  const dominiosVal = (valores[`${subtema}_dominios`] || [""]).join("\n");
  const contenidosVal = (valores[`${subtema}_contenidos`] || [""]).join("\n");
  const procesosVal = (valores[`${subtema}_procesos`] || [""]).join("\n");
  const addFieldButton = (containerId, fieldType, fieldName, placeholder) => `
      <button
        type="button"
        class="btn-add-mini"
        data-action="add-dynamic-field"
        data-container-id="${escapeHtml(containerId)}"
        data-field-type="${escapeHtml(fieldType)}"
        data-field-name="${escapeHtml(fieldName)}"
        data-placeholder="${escapeHtml(placeholder)}"
      >
        <i class="fas fa-plus"></i>
      </button>
  `;

  return `
    <div class="subtema-block">
      <h4>📖 Subtema: ${escapeHtml(subtema)}</h4>
      
      <label>Tema:</label>
      <input type="text" name="${escapeHtml(subtema)}_tema" value="${escapeHtml(temaVal)}" placeholder="Tema del subtema..." required>

      <label>Lectura:</label>
      <input type="text" name="${escapeHtml(subtema)}_lectura" value="${escapeHtml(lecturaVal)}" placeholder="Título de la lectura..." required>

      <fieldset id="${escapeHtml(subtema)}_aprendizajesContainer">
        <legend>Aprendizajes ASC</legend>
        <textarea name="${escapeHtml(subtema)}_aprendizajes[]" placeholder="Aprendizaje esperado...">${escapeHtml(aprendizajesVal)}</textarea>
      </fieldset>
      ${addFieldButton(`${subtema}_aprendizajesContainer`, "textarea", `${subtema}_aprendizajes[]`, "Otro aprendizaje...")}

      <fieldset id="${escapeHtml(subtema)}_habilidadesContainer">
        <legend>Habilidad</legend>
        <textarea name="${escapeHtml(subtema)}_habilidades[]" placeholder="Ej. CRM, ERM, CSM...">${escapeHtml(habilidadesVal)}</textarea>
      </fieldset>
      ${addFieldButton(`${subtema}_habilidadesContainer`, "textarea", `${subtema}_habilidades[]`, "Otra habilidad...")}

      <fieldset id="${escapeHtml(subtema)}_dominiosContainer">
        <legend>Dominio Cognitivo</legend>
        <textarea name="${escapeHtml(subtema)}_dominios[]" placeholder="Dominios cognitivos...">${escapeHtml(dominiosVal)}</textarea>
      </fieldset>
      ${addFieldButton(`${subtema}_dominiosContainer`, "textarea", `${subtema}_dominios[]`, "Otro dominio...")}

      <fieldset id="${escapeHtml(subtema)}_contenidosContainer">
        <legend>Contenido</legend>
        <textarea name="${escapeHtml(subtema)}_contenidos[]" placeholder="Contenido clave...">${escapeHtml(contenidosVal)}</textarea>
      </fieldset>
      ${addFieldButton(`${subtema}_contenidosContainer`, "textarea", `${subtema}_contenidos[]`, "Otro contenido...")}

      <fieldset id="${escapeHtml(subtema)}_procesosContainer">
        <legend>Procesos de desarrollo de aprendizaje</legend>
        <textarea name="${escapeHtml(subtema)}_procesos[]" placeholder="Describe procesos de aprendizaje...">${escapeHtml(procesosVal)}</textarea>
      </fieldset>
      ${addFieldButton(`${subtema}_procesosContainer`, "textarea", `${subtema}_procesos[]`, "Otro proceso...")}
    </div>
    <hr>
  `;
}

function renderCategoriasPorGrado(grado, contenedor, valores = {}) {
  if (!contenedor) return;
  contenedor.innerHTML = "";
  if (!grado || !categoriasPorGrado[grado]) return;

  const categorias = categoriasPorGrado[grado];
  for (const categoria in categorias) {
    let bloqueCategoria = `<h3>📌 ${categoria}</h3>`;
    categorias[categoria].forEach(subtema => {
      bloqueCategoria += generarCamposSubtema(subtema, valores);
    });
    contenedor.innerHTML += bloqueCategoria;
  }
}

function addDynamicField(containerId, type, name, placeholder = "") {
  const container = $(containerId);
  if (!container) return;
  let element;
  if (type === "textarea") {
    element = document.createElement("textarea");
    element.name = name;
    element.placeholder = placeholder;
  } else {
    element = document.createElement("input");
    element.type = "text";
    element.name = name;
    element.placeholder = placeholder;
  }
  container.appendChild(element);
}
window.addDynamicField = addDynamicField;

/* =========================
   MODALES Y LISTENERS
========================= */

// NOTA: En tu HTML NO existe "modalSecuenciaSecundaria" (el de creación), así que no tratamos
// de abrirlo. Usamos el que sí está: "modalVerSecuencias" para listar/editar.

on("btnVerSecuenciasSecundaria", "click", async () => {
  const modal = $("modalVerSecuencias");
  if (modal) {
    modal.style.display = "block";
    await cargarSecuenciasGuardadas();
  }
});

on("cerrarModalVerSecuencias", "click", () => {
  const modal = $("modalVerSecuencias");
  if (modal) modal.style.display = "none";
});

// Modal edición
const modalEditar = $("modalEditarSecuencia");
on("cerrarModalEditarSecuencia", "click", () => {
  if (modalEditar) modalEditar.style.display = "none";
});

// Si existiera un formulario para CREAR SyA Secundaria (id="formSecuenciaAlcanceSecundaria")
// lo enganchamos de forma segura:
on("formSecuenciaAlcanceSecundaria", "submit", async function (e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = {};
  formData.forEach((value, key) => {
    const cleanKey = key.replace("[]", "");
    if (!data[cleanKey]) {
      data[cleanKey] = value;
    } else {
      if (!Array.isArray(data[cleanKey])) data[cleanKey] = [data[cleanKey]];
      data[cleanKey].push(value);
    }
  });

  if (!data.grado || !data.trimestre || !data.unidad) {
    alert("⚠️ Debes seleccionar Grado, Trimestre y Unidad antes de guardar.");
    return;
  }
  data.nivel = "Secundaria";
  data.fechaCreacion = new Date().toISOString();

  try {
    await addDoc(collection(db, "secuenciaAlcance"), data);
    alert(`✅ Secuencia para ${data.grado} guardada correctamente`);
    form.reset();
    const cont = $("contenedorCategorias");
    if (cont) cont.innerHTML = "";
    // si tuvieras un modal de creación, lo cerrarías aquí
  } catch (error) {
    alert("❌ Ocurrió un error al guardar. Revisa la consola.");
  }
});

// Cambio de grado (si existe el select en tu DOM)
on("gradoSelect", "change", function () {
  const cont = $("contenedorCategorias");
  renderCategoriasPorGrado(this.value, cont);
});

/* =========================
   LISTAR / EDITAR
========================= */
async function cargarSecuenciasGuardadas() {
  const listaContenedor = $("listaSecuenciasGuardadas");
  if (!listaContenedor) return;

  listaContenedor.innerHTML = "<p>⏳ Cargando secuencias de Secundaria...</p>";

  const q = query(collection(db, "secuenciaAlcance"), where("nivel", "==", "Secundaria"));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    listaContenedor.innerHTML = "<p>⚠️ No hay secuencias guardadas de Secundaria aún.</p>";
    return;
  }

  let html = `<table style="width:100%; border-collapse: collapse;">
    <thead><tr><th>📅 Fecha</th><th>Grado</th><th>Trimestre</th><th>Unidad</th><th>Acción</th></tr></thead><tbody>`;

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const fecha = data.fechaCreacion ? new Date(data.fechaCreacion).toLocaleDateString() : "-";
    const id = docSnap.id;

    html += `<tr>
      <td>${fecha}</td>
      <td>${data.grado || "-"}</td>
      <td>${data.trimestre || "-"}</td>
      <td>${data.unidad || "-"}</td>
      <td style="text-align:center;">
        <button class="btn-editar" data-action="editar-secuencia" data-doc-id="${escapeHtml(id)}">
          <i class="fas fa-edit"></i>
        </button>
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  listaContenedor.innerHTML = html;
}

// Render helper para arrays -> textarea con saltos de línea
function renderArrayForTextarea(valor) {
  if (!valor) return "";
  if (Array.isArray(valor)) return valor.join("\n");
  return String(valor);
}

async function editarSecuencia(docId) {
  try {
    const ref = doc(db, "secuenciaAlcance", docId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("⚠️ No se encontró la secuencia");
      return;
    }
    const data = snap.data();

    // básicos
    const selGrado = $("edit_grado");
    const selTrimestre = $("edit_trimestre");
    const selUnidad = $("edit_unidad");
    if (selGrado) selGrado.value = data.grado || "Primero";
    if (selTrimestre) selTrimestre.value = data.trimestre || "Trimestre 1";

    if (selUnidad) {
      selUnidad.innerHTML = "";
      for (let i = 1; i <= 15; i++) {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = i;
        selUnidad.appendChild(opt);
      }
      selUnidad.value = data.unidad || "1";
    }

    // detectar subtemas
    const subtemasDetectados = Object.keys(data)
      .filter(k => k.endsWith("_tema"))
      .map(k => k.replace("_tema", ""));

    const contenedorEdicion = $("contenedorEdicionSubtemas");
    if (contenedorEdicion) {
      contenedorEdicion.innerHTML = "";
      if (subtemasDetectados.length === 0) {
        contenedorEdicion.innerHTML = "<p>⚠️ Esta secuencia no tiene subtemas guardados.</p>";
      } else {
        subtemasDetectados.forEach(subtema => {
          const temaKey = `${subtema}_tema`;
          const lecturaKey = `${subtema}_lectura`;
          const aprendizajesKey = `${subtema}_aprendizajes[]`;
          const habilidadesKey = `${subtema}_habilidades[]`;
          const dominiosKey = `${subtema}_dominios[]`;
          const contenidosKey = `${subtema}_contenidos[]`;
          const procesosKey = `${subtema}_procesos[]`;

          contenedorEdicion.innerHTML += `
            <div class="subtema-edit-block">
              <h4>📖 ${escapeHtml(subtema)}</h4>
              <label>Tema:</label>
              <input type="text" name="${escapeHtml(temaKey)}" value="${escapeHtml(data[temaKey] || "")}">
              <label>Lectura:</label>
              <input type="text" name="${escapeHtml(lecturaKey)}" value="${escapeHtml(data[lecturaKey] || "")}">
              <label>Aprendizajes ASC:</label>
              <textarea name="${escapeHtml(aprendizajesKey)}">${escapeHtml(renderArrayForTextarea(data[aprendizajesKey]))}</textarea>
              <label>Habilidades:</label>
              <textarea name="${escapeHtml(habilidadesKey)}">${escapeHtml(renderArrayForTextarea(data[habilidadesKey]))}</textarea>
              <label>Dominios Cognitivos:</label>
              <textarea name="${escapeHtml(dominiosKey)}">${escapeHtml(renderArrayForTextarea(data[dominiosKey]))}</textarea>
              <label>Contenidos:</label>
              <textarea name="${escapeHtml(contenidosKey)}">${escapeHtml(renderArrayForTextarea(data[contenidosKey]))}</textarea>
              <label>Procesos de Aprendizaje:</label>
              <textarea name="${escapeHtml(procesosKey)}">${escapeHtml(renderArrayForTextarea(data[procesosKey]))}</textarea>
            </div>
            <hr>
          `;
        });
      }
    }

    if (modalEditar) {
      modalEditar.dataset.docId = docId;
      modalEditar.style.display = "block";
    }

  } catch (error) {
    alert("❌ Ocurrió un error al abrir la secuencia para editar.");
  }
}
window.editarSecuencia = editarSecuencia;

// Guardar cambios edición
on("formEditarSecuencia", "submit", async (e) => {
  e.preventDefault();
  if (!modalEditar) return;

  const docId = modalEditar.dataset.docId;
  if (!docId) {
    alert("⚠️ No se encontró el ID del documento");
    return;
  }

  const ref = doc(db, "secuenciaAlcance", docId);
  const formData = new FormData(e.target);
  const nuevosDatos = {};

  formData.forEach((value, key) => {
    const cleanKey = key.replace("[]", "");
    if (
      cleanKey.includes("_aprendizajes") ||
      cleanKey.includes("_habilidades") ||
      cleanKey.includes("_dominios") ||
      cleanKey.includes("_contenidos") ||
      cleanKey.includes("_procesos")
    ) {
      nuevosDatos[cleanKey] = String(value)
        .split("\n")
        .map(v => v.trim())
        .filter(Boolean);
    } else {
      nuevosDatos[cleanKey] = value;
    }
  });

  nuevosDatos.ultimaEdicion = new Date().toISOString();

  try {
    await updateDoc(ref, nuevosDatos);
    alert("✅ Secuencia actualizada correctamente");
    modalEditar.style.display = "none";
    await cargarSecuenciasGuardadas();
  } catch (error) {
    alert("❌ No se pudo actualizar, revisa la consola.");
  }
});

/* =========================
   MODAL: GENERAR UNIDAD SECUNDARIA
========================= */
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;

    if (actionTarget.dataset.action === "add-dynamic-field") {
      addDynamicField(
        actionTarget.dataset.containerId,
        actionTarget.dataset.fieldType,
        actionTarget.dataset.fieldName,
        actionTarget.dataset.placeholder || ""
      );
      return;
    }

    if (actionTarget.dataset.action === "editar-secuencia") {
      editarSecuencia(actionTarget.dataset.docId || "");
    }
  });

  const btnAbrirModalUnidadSec = $("btnAbrirModalUnidadSecundaria");
  const modalUnidadSec = $("modalGenerarUnidadSecundaria");
  const btnCerrarModalUnidadSec = $("cerrarModalUnidadSecundaria");

  if (btnAbrirModalUnidadSec && modalUnidadSec) {
    btnAbrirModalUnidadSec.addEventListener("click", () => {
      modalUnidadSec.style.display = "block";
    });
  }

  if (btnCerrarModalUnidadSec && modalUnidadSec) {
    btnCerrarModalUnidadSec.addEventListener("click", () => {
      modalUnidadSec.style.display = "none";
    });
  }

  window.addEventListener("click", (event) => {
    if (modalUnidadSec && event.target === modalUnidadSec) {
      modalUnidadSec.style.display = "none";
    }
  });

  // Guardar modelo gemini seleccionado (Sec)
  const selectGeminiSec = $("selectGeminiEndpointSecundaria");
  if (selectGeminiSec) {
    const modeloGuardadoSec = localStorage.getItem("gemini_modelo_secundaria");
    if (modeloGuardadoSec) selectGeminiSec.value = modeloGuardadoSec;

    selectGeminiSec.addEventListener("change", () => {
      localStorage.setItem("gemini_modelo_secundaria", selectGeminiSec.value);
    });
  }
});
