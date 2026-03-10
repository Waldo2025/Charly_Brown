// generarUnidadSecundaria.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import { getFirestore, addDoc, collection, getDocs, where, query, updateDoc, getDoc, doc } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";

/* =========================
   HELPERS SEGUROS
========================= */
const $ = (id) => document.getElementById(id);
const on = (id, event, handler) => {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
};

/* =========================
   CONFIGURACIÓN FIREBASE
========================= */
const firebaseConfig = {
  apiKey: window.__CB_FIREBASE_WEB_API_KEY__ || window.__CHARLY_CONFIG__?.firebase?.apiKey || "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
  authDomain: "charly-brown.firebaseapp.com",
  projectId: "charly-brown",
  storageBucket: "charly-brown.firebasestorage.app",
  messagingSenderId: "128488238449",
  appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
  measurementId: "G-RL0BMDZKE6"
};
const app = initializeApp(firebaseConfig);
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

  return `
    <div class="subtema-block">
      <h4>📖 Subtema: ${subtema}</h4>
      
      <label>Tema:</label>
      <input type="text" name="${subtema}_tema" value="${temaVal}" placeholder="Tema del subtema..." required>

      <label>Lectura:</label>
      <input type="text" name="${subtema}_lectura" value="${lecturaVal}" placeholder="Título de la lectura..." required>

      <fieldset id="${subtema}_aprendizajesContainer">
        <legend>Aprendizajes ASC</legend>
        <textarea name="${subtema}_aprendizajes[]" placeholder="Aprendizaje esperado...">${aprendizajesVal}</textarea>
      </fieldset>
      <button type="button" class="btn-add-mini" onclick="addDynamicField('${subtema}_aprendizajesContainer','textarea','${subtema}_aprendizajes[]','Otro aprendizaje...')">
        <i class="fas fa-plus"></i>
      </button>

      <fieldset id="${subtema}_habilidadesContainer">
        <legend>Habilidad</legend>
        <textarea name="${subtema}_habilidades[]" placeholder="Ej. CRM, ERM, CSM...">${habilidadesVal}</textarea>
      </fieldset>
      <button type="button" class="btn-add-mini" onclick="addDynamicField('${subtema}_habilidadesContainer','textarea','${subtema}_habilidades[]','Otra habilidad...')">
        <i class="fas fa-plus"></i>
      </button>

      <fieldset id="${subtema}_dominiosContainer">
        <legend>Dominio Cognitivo</legend>
        <textarea name="${subtema}_dominios[]" placeholder="Dominios cognitivos...">${dominiosVal}</textarea>
      </fieldset>
      <button type="button" class="btn-add-mini" onclick="addDynamicField('${subtema}_dominiosContainer','textarea','${subtema}_dominios[]','Otro dominio...')">
        <i class="fas fa-plus"></i>
      </button>

      <fieldset id="${subtema}_contenidosContainer">
        <legend>Contenido</legend>
        <textarea name="${subtema}_contenidos[]" placeholder="Contenido clave...">${contenidosVal}</textarea>
      </fieldset>
      <button type="button" class="btn-add-mini" onclick="addDynamicField('${subtema}_contenidosContainer','textarea','${subtema}_contenidos[]','Otro contenido...')">
        <i class="fas fa-plus"></i>
      </button>

      <fieldset id="${subtema}_procesosContainer">
        <legend>Procesos de desarrollo de aprendizaje</legend>
        <textarea name="${subtema}_procesos[]" placeholder="Describe procesos de aprendizaje...">${procesosVal}</textarea>
      </fieldset>
      <button type="button" class="btn-add-mini" onclick="addDynamicField('${subtema}_procesosContainer','textarea','${subtema}_procesos[]','Otro proceso...')">
        <i class="fas fa-plus"></i>
      </button>
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

// Campo dinámico (expuesto en window por los onclick del HTML generado)
window.addDynamicField = function (containerId, type, name, placeholder = "") {
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
};

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
        <button class="btn-editar" onclick="editarSecuencia('${id}')">
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

// Exponer para botón inline
window.editarSecuencia = async function (docId) {
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
              <h4>📖 ${subtema}</h4>
              <label>Tema:</label>
              <input type="text" name="${temaKey}" value="${data[temaKey] || ""}">
              <label>Lectura:</label>
              <input type="text" name="${lecturaKey}" value="${data[lecturaKey] || ""}">
              <label>Aprendizajes ASC:</label>
              <textarea name="${aprendizajesKey}">${renderArrayForTextarea(data[aprendizajesKey])}</textarea>
              <label>Habilidades:</label>
              <textarea name="${habilidadesKey}">${renderArrayForTextarea(data[habilidadesKey])}</textarea>
              <label>Dominios Cognitivos:</label>
              <textarea name="${dominiosKey}">${renderArrayForTextarea(data[dominiosKey])}</textarea>
              <label>Contenidos:</label>
              <textarea name="${contenidosKey}">${renderArrayForTextarea(data[contenidosKey])}</textarea>
              <label>Procesos de Aprendizaje:</label>
              <textarea name="${procesosKey}">${renderArrayForTextarea(data[procesosKey])}</textarea>
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
};

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
