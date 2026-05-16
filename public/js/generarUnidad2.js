// generarUnidad.js
import { getFirestore, addDoc, collection, doc, getDoc, getDocs, updateDoc, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { sanitizeRichText, escapeHtml } from "./security-utils.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";

const app = getDefaultFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);


const btnVerUnidades = document.getElementById("btnListaUnidadesGuardadas");
const modalLista = document.getElementById("modalUnidadesGuardadas");
const modalEditar = document.getElementById("modalEditarUnidad");
const contenedorLista = document.getElementById("contenedorUnidadesGuardadas");
const editorUnidad = document.getElementById("editorUnidadContenido");
const UNIDADES_COLLECTION = "unidadesGeneradas";

let unidadEditandoId = null;
let unidadEditandoCollection = UNIDADES_COLLECTION;
let autoSaveTimeout = null;
let unidadCompartirId = null;

function _valorAHtmlUnidadGuardada(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(_valorAHtmlUnidadGuardada).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const direct = obtenerContenidoUnidadGuardada(value);
    if (direct) return direct;
    return Object.entries(value)
      .filter(([key]) => /contenido|html|respuesta|resultado|final|alumno|maestro|seccion|sección|categoria|categoría/i.test(key))
      .map(([, child]) => _valorAHtmlUnidadGuardada(child))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function obtenerContenidoUnidadGuardada(data = {}) {
  const camposDirectos = [
    "contenido",
    "html",
    "htmlContenido",
    "contenidoHTML",
    "htmlUnidad",
    "unidadHTML",
    "resultadoHTML",
    "resultadoUnidad",
    "resultadoUnidadHTML",
    "respuestaFinal",
    "contenidoAlumno",
    "contenidoMaestro",
    "htmlAlumno",
    "htmlMaestro",
    "alumnoHTML",
    "maestroHTML"
  ];

  for (const key of camposDirectos) {
    const html = _valorAHtmlUnidadGuardada(data?.[key]);
    if (html) return html;
  }

  return Object.entries(data || {})
    .filter(([key]) => /contenido|html|respuesta|resultado|final|alumno|maestro|seccion|sección|categoria|categoría/i.test(key))
    .map(([, value]) => _valorAHtmlUnidadGuardada(value))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function obtenerTituloUnidadGuardada(data = {}, html = "") {
  const limpiarTitulo = (value = "") => String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const esTituloValido = (value = "") => {
    const text = limpiarTitulo(value);
    if (!text) return false;
    if (text.length > 140) return false;
    if (/[.!?]\s/.test(text)) return false;
    return true;
  };

  const candidatosExplicitos = [
    data.tituloUnidad,
    data.nombreUnidad,
    data.titulo,
    data.nombre
  ];

  for (const candidato of candidatosExplicitos) {
    if (esTituloValido(candidato)) return limpiarTitulo(candidato);
  }

  try {
    const parser = new DOMParser();
    const docHTML = parser.parseFromString(html || "", "text/html");
    const headings = Array.from(docHTML.querySelectorAll(".col-alumno h4, .col-alumno h3, h4, h3, h2, h1"));
    const ignorar = [
      /^subcategor/i,
      /^secuencia y alcance/i,
      /^pregunta detonante/i,
      /^lectura generadora/i,
      /^t[ií]tulo de la lectura/i,
      /^p[aá]gina alumno/i
    ];
    const headingValido = headings
      .map((node) => limpiarTitulo(node.textContent || ""))
      .find((text) => esTituloValido(text) && !ignorar.some((rx) => rx.test(text)));
    if (headingValido) return headingValido;

    const lecturaTitulo = limpiarTitulo(data.lecturaTitulo || "");
    if (esTituloValido(lecturaTitulo)) return lecturaTitulo;

    return "Sin título";
  } catch (_) {
    return "Sin título";
  }
}

async function abrirEditorUnidadCompartido({ id = "", collectionName = UNIDADES_COLLECTION, data = {}, html = "" } = {}) {
  if (typeof window.cbOpenLecturaEditorCompartido !== "function") {
    unidadEditandoId = id;
    unidadEditandoCollection = collectionName || UNIDADES_COLLECTION;
    const htmlLimpio = sanitizeRichText(String(html || "").replace(/<style[\s\S]*?<\/style>/gi, ""));
    editorUnidad.innerHTML = htmlLimpio;
    modalEditar.style.display = "block";
    return;
  }

  await window.cbOpenLecturaEditorCompartido({
    mode: "unidad-generada",
    id,
    titulo: obtenerTituloUnidadGuardada(data, html),
    tema: data.lecturaTitulo || data.tituloUnidad || "",
    nivel: data.nivel || "",
    grado: data.grado || "",
    trimestre: data.trimestre || "",
    unidad: data.unidad || "",
    contenidoHTML: html,
    publicar: data.publicar === true || data.published === true,
    serieLabel: "Lectura",
    nivelLabel: "Nivel",
    gradoLabel: "Grado",
    trimestreLabel: "Trimestre",
    unidadLabel: "Unidad",
    titlePlaceholder: "Título de la unidad",
    onPublishChange: async (publicar) => {
      await updateDoc(doc(db, collectionName || UNIDADES_COLLECTION, id), {
        publicar: publicar === true,
        published: publicar === true,
        editadoEn: new Date(),
        editadoPor: auth.currentUser?.email || auth.currentUser?.uid || "Desconocido"
      });
    },
    onSave: async (payload) => {
      await updateDoc(doc(db, collectionName || UNIDADES_COLLECTION, id), {
        contenido: payload.contenidoHTML,
        tituloUnidad: payload.titulo,
        nivel: payload.nivel,
        grado: payload.grado,
        trimestre: payload.trimestre,
        unidad: payload.unidad,
        publicar: payload.publicar === true,
        published: payload.publicar === true,
        editadoEn: new Date(),
        editadoPor: auth.currentUser?.email || auth.currentUser?.uid || "Desconocido"
      });
    }
  });
}

function formatearFechaUnidadGuardada(value) {
  if (!value) return "N/D";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  const fecha = new Date(value);
  return Number.isNaN(fecha.getTime()) ? "N/D" : fecha.toLocaleString();
}

async function obtenerSnapUnidadesGuardadas(collectionName) {
  try {
    return await getDocs(query(collection(db, collectionName)));
  } catch (error) {
    const uid = auth.currentUser?.uid || "";
    if (!uid) throw error;
    return getDocs(query(collection(db, collectionName), where("userId", "==", uid)));
  }
}

async function cargarDocsUnidadesGuardadas() {
  const consultas = await Promise.allSettled([
    obtenerSnapUnidadesGuardadas(UNIDADES_COLLECTION)
  ]);

  const docs = [];
  const errores = [];
  let totalLeidos = 0;
  consultas.forEach((result, index) => {
    const collectionName = UNIDADES_COLLECTION;
    if (result.status !== "fulfilled") {
      errores.push(`${collectionName}: ${result.reason?.message || "sin detalle"}`);
      return;
    }
    totalLeidos += result.value.size || 0;
    result.value.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const html = obtenerContenidoUnidadGuardada(data);
      if (!html) return;
      docs.push({
        id: docSnap.id,
        collectionName,
        data,
        html,
        titulo: obtenerTituloUnidadGuardada(data, html)
      });
    });
  });

  docs.sort((a, b) => {
    const fechaA = a.data.editadoEn?.toDate?.() || a.data.timestamp?.toDate?.() || a.data.createdAt?.toDate?.() || new Date(a.data.editadoEn || a.data.timestamp || a.data.createdAt || 0);
    const fechaB = b.data.editadoEn?.toDate?.() || b.data.timestamp?.toDate?.() || b.data.createdAt?.toDate?.() || new Date(b.data.editadoEn || b.data.timestamp || b.data.createdAt || 0);
    return fechaB.getTime() - fechaA.getTime();
  });

  return { docs, errores, totalLeidos };
}

btnVerUnidades?.addEventListener("click", async () => {
  window.cbUnidadDock?.openSection?.("modalUnidadesGuardadas");
  modalLista.style.display = "block";
  contenedorLista.innerHTML = `<tr><td colspan="8"><i class="fas fa-spinner fa-spin"></i> Cargando unidades...</td></tr>`;

  try {
    const resultadoCarga = await cargarDocsUnidadesGuardadas();
    const unidades = resultadoCarga.docs || [];

    if (!unidades.length) {
      if (resultadoCarga.errores?.length && !resultadoCarga.totalLeidos) {
        contenedorLista.innerHTML = `<tr><td colspan='8'>❌ No se pudieron cargar unidades guardadas.<br><small>${escapeHtml(resultadoCarga.errores.join(" | "))}</small></td></tr>`;
      } else if (resultadoCarga.totalLeidos) {
        contenedorLista.innerHTML = "<tr><td colspan='8'>No hay unidades generadas con contenido guardado. Solo se encontraron unidades plantilla sin HTML generado.</td></tr>";
      } else {
        contenedorLista.innerHTML = "<tr><td colspan='8'>No hay unidades guardadas.</td></tr>";
      }
      return;
    }

    contenedorLista.innerHTML = unidades.map((unidadGuardada) => {
      const data = unidadGuardada.data;
      const docId = unidadGuardada.id;
      const collectionName = unidadGuardada.collectionName;
      const htmlUnidad = unidadGuardada.html;
      const compartido = !!data.sharewith && Object.keys(data.sharewith).length > 0;
      const tituloUnidad = unidadGuardada.titulo;

    
      // Formatear fecha de creación y edición
      const fechaCreacion = formatearFechaUnidadGuardada(data.timestamp || data.createdAt);
      const fechaEdicion = formatearFechaUnidadGuardada(data.editadoEn);
    
      return `
        <tr>
          <td>${escapeHtml(data.nivel || "")}</td>
          <td>${escapeHtml(data.grado || "")}</td>
          <td>${escapeHtml(data.trimestre || "")}</td>
          <td>${escapeHtml(data.unidad || "")}</td>
          <td contenteditable="true" class="titulo-editable" data-id="${escapeHtml(docId)}">
            ${escapeHtml(tituloUnidad)}
          </td>

          <td>${escapeHtml(fechaCreacion)}</td>
          <td>${escapeHtml(fechaEdicion)}</td>
          <td>
            <button class="btn-editar" data-id="${escapeHtml(docId)}" data-collection="${escapeHtml(collectionName)}" data-html="${encodeURIComponent(htmlUnidad)}" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-eliminar" data-id="${escapeHtml(docId)}" data-collection="${escapeHtml(collectionName)}" title="Eliminar">
              <i class="fas fa-trash-alt"></i>
            </button>
            <button class="btn-compartir" data-id="${escapeHtml(docId)}" data-collection="${escapeHtml(collectionName)}" title="Compartir" style="color:${compartido ? '#28a745' : '#888'};">
              <i class="fas fa-share-alt"></i>
            </button>
            <button class="btn-copiar" data-html="${encodeURIComponent(htmlUnidad)}" title="Copiar contenido">
              <i class="fas fa-copy" style="color:#007bff;"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
    
    // Reiniciar DataTable
    if ($.fn.DataTable.isDataTable('#tablaUnidades')) {
      $('#tablaUnidades').DataTable().destroy();
    }
    $('#tablaUnidades').DataTable({
      language: {
        url: "vendor/datatables/i18n/es-ES.json"
      }
    });

    // Editar
    document.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", async () => {
        const html = decodeURIComponent(btn.dataset.html);
        const id = btn.dataset.id || "";
        const collectionName = btn.dataset.collection || UNIDADES_COLLECTION;
        try {
          const unidadSnap = await getDoc(doc(db, collectionName, id));
          const data = unidadSnap.exists() ? unidadSnap.data() : {};
          await abrirEditorUnidadCompartido({
            id,
            collectionName,
            data,
            html: obtenerContenidoUnidadGuardada(data) || html
          });
        } catch (_) {
          await abrirEditorUnidadCompartido({ id, collectionName, data: {}, html });
        }
      });
    });

    // Eliminar
    document.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const collectionName = btn.dataset.collection || UNIDADES_COLLECTION;
        if (confirm("¿Seguro que deseas eliminar esta unidad?")) {
          await deleteDoc(doc(db, collectionName, id));
          alert("✅ Unidad eliminada.");
          location.reload();
        }
      });
    });

    document.querySelectorAll(".titulo-editable").forEach(celda => {
    // Variable para controlar cambios
    let tituloOriginal = celda.textContent.trim();
    
    // Guardar al perder foco
    const guardarTitulo = async () => {
      const nuevoTitulo = celda.textContent.trim();
      const docId = celda.dataset.id;

      // Si no hay cambios, no hacemos nada
      if (nuevoTitulo === tituloOriginal || !nuevoTitulo) {
        if (!nuevoTitulo) {
          celda.textContent = tituloOriginal; // Restauramos el original si está vacío
        }
        return;
      }

      try {
        const collectionName = celda.closest("tr")?.querySelector(".btn-editar")?.dataset?.collection || UNIDADES_COLLECTION;
        const unidadRef = doc(db, collectionName, docId);
        const unidadSnap = await getDoc(unidadRef);
        
        if (!unidadSnap.exists()) return;

        const unidadData = unidadSnap.data();
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(obtenerContenidoUnidadGuardada(unidadData), "text/html");
        
        // Actualizar título en el contenido HTML
        const h2 = docHTML.querySelector("h2");
        if (h2) h2.textContent = nuevoTitulo;

        const nuevoContenido = docHTML.body.innerHTML;

        await updateDoc(unidadRef, {
          contenido: nuevoContenido,
          tituloUnidad: nuevoTitulo,   // ✅ Guardamos un campo explícito
          editadoEn: new Date(),
          editadoPor: auth.currentUser?.email || auth.currentUser?.uid || "Desconocido"
        });


        // Actualizar el original y dar feedback visual
        tituloOriginal = nuevoTitulo;
        celda.style.backgroundColor = "#d4edda";
        setTimeout(() => (celda.style.backgroundColor = ""), 800);

        // Actualizar DataTables
        if ($.fn.DataTable.isDataTable('#tablaUnidades')) {
          $('#tablaUnidades').DataTable().draw(false);
        }

      } catch (error) {
        celda.textContent = tituloOriginal; // Revertir cambios
        celda.style.backgroundColor = "#f8d7da";
        setTimeout(() => (celda.style.backgroundColor = ""), 800);
        alert("Error al guardar. Intente nuevamente.");
      }
    };

    // Eventos
    celda.addEventListener("blur", guardarTitulo);
    
    celda.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        celda.blur();
      }
    });

    celda.addEventListener("paste", e => {
      e.preventDefault();
      const textoPlano = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, textoPlano);
    });
  });

    // Compartir
    document.querySelectorAll(".btn-compartir").forEach(btn => {
      btn.addEventListener("click", async () => {
        const unidadId = btn.dataset.id;
        const collectionName = btn.dataset.collection || UNIDADES_COLLECTION;
        unidadCompartirId = unidadId;
    
        const modal = document.getElementById("modalCompartirUnidad");
        const lista = document.getElementById("listaUsuariosCompartirUnidad");
    
        modal.style.display = "block";
        lista.innerHTML = "<p><i class='fas fa-spinner fa-spin'></i> Cargando usuarios...</p>";
    
        try {
          const usuariosSnap = await getDocs(collection(db, "users"));
          const unidadDoc = await getDoc(doc(db, collectionName, unidadId));
          const unidadData = unidadDoc.exists() ? unidadDoc.data() : {};
          const usuariosYaCompartidos = unidadData.sharewith || {};
    
          let contenido = "";
          usuariosSnap.forEach(doc => {
            const user = doc.data();
            const userId = doc.id;
            const nombre = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Usuario sin nombre";
            const checked = usuariosYaCompartidos[userId] ? "checked" : "";
    
            contenido += `
              <div class="usuario-item">
                <input type="checkbox" value="${escapeHtml(userId)}" ${checked}>
                <span>${escapeHtml(nombre)}</span>
              </div>
            `;
          });
    
          lista.innerHTML = contenido;
    
          // ✅ IMPORTANTE: Asignar evento justo aquí después de poblar el DOM
          const btnConfirmar = document.getElementById("btnConfirmarCompartir2");
          btnConfirmar.onclick = async () => {
            const seleccionados = Array.from(document.querySelectorAll("#listaUsuariosCompartirUnidad input[type=checkbox]:checked"))
              .map(cb => cb.value);
    
            if (seleccionados.length === 0) {
              alert("⚠️ Debes seleccionar al menos un usuario.");
              return;
            }
    
            const shareWith = {};
            seleccionados.forEach(uid => shareWith[uid] = true);
    
            try {
              await updateDoc(doc(db, collectionName, unidadId), { sharewith: shareWith });
              alert("✅ Unidad compartida.");
              modal.style.display = "none";
    
              // Actualiza el color del ícono en tiempo real
              btn.querySelector("i").style.color = "#28a745";
            } catch (e) {
              alert("❌ No se pudo compartir la unidad.");
            }
          };
    
        } catch (e) {
          lista.innerHTML = "<p>❌ Error al cargar usuarios.</p>";
        }
      });
    });
    
    document.querySelectorAll(".btn-copiar").forEach(btn => {
      btn.addEventListener("click", async () => {
        const html = decodeURIComponent(btn.dataset.html);
    
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = sanitizeRichText(html);
    
        const selection = window.getSelection();
        const range = document.createRange();
    
        document.body.appendChild(tempDiv);
        range.selectNodeContents(tempDiv);
        selection.removeAllRanges();
        selection.addRange(range);
    
        try {
          const success = document.execCommand("copy");
          selection.removeAllRanges();
          document.body.removeChild(tempDiv);
          alert(success ? "✅ Contenido copiado con formato." : "❌ No se pudo copiar.");
        } catch (err) {
          document.body.removeChild(tempDiv);
          alert("❌ Error al copiar.");
        }
      });
    });
    

    

  } catch (e) {
    contenedorLista.innerHTML = `<tr><td colspan='8'>❌ Error al cargar unidades guardadas.${e?.message ? `<br><small>${escapeHtml(e.message)}</small>` : ""}</td></tr>`;
  }
});

// Cerrar modales
document.getElementById("cerrarModalUnidades")?.addEventListener("click", () => {
  modalLista.style.display = "none";
});

document.getElementById("cerrarModalEditarUnidad")?.addEventListener("click", () => {
  modalEditar.style.display = "none";
});

// Guardado automático en tiempo real
editorUnidad?.addEventListener("input", () => {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    if (!unidadEditandoId) return;

    const nuevoContenido = editorUnidad.innerHTML;
    updateDoc(doc(db, unidadEditandoCollection || UNIDADES_COLLECTION, unidadEditandoId), {
      contenido: nuevoContenido,
      editadoEn: new Date(),
      editadoPor: auth.currentUser?.email || auth.currentUser?.uid || "Desconocido"
    }).then(() => {
    }).catch(e => {
    });
  }, 1500); // 1.5 segundos tras dejar de escribir
});


function limpiarHTML(html) {
  let corregido = html.trim();

  // Solo cerramos etiquetas que puedan estar desbalanceadas, sin eliminar contenido
  const cerrar = (abrir, cerrar) => {
    const abrirCount = (corregido.match(new RegExp(`<${abrir}(\\s|>)`, "gi")) || []).length;
    const cerrarCount = (corregido.match(new RegExp(`</${cerrar}>`, "gi")) || []).length;
    if (abrirCount > cerrarCount) {
      corregido += `</${cerrar}>`.repeat(abrirCount - cerrarCount);
    }
  };

  // Solo cerramos estas etiquetas específicas que pueden causar problemas
  ["ul", "ol", "table", "tr"].forEach(tag => cerrar(tag, tag));

  return corregido;
}

// ✅ Manejo de parámetros de URL para apertura automática
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  const unidadId = params.get("unidadId");

  if (action === "openUnidad" && unidadId) {
    console.log(`[Unidad2] Detectada acción abrir unidad: ${unidadId}`);
    
    try {
      const collectionName = params.get("col") || UNIDADES_COLLECTION;
      const docRef = doc(db, collectionName, unidadId);
      const snap = await getDoc(docRef);
      
      if (snap.exists()) {
        console.log(`[Unidad2] Documento encontrado, abriendo editor directo...`);
        const data = snap.data();
        const html = obtenerContenidoUnidadGuardada(data);
        
        // Abrir el editor directamente
        await abrirEditorUnidadCompartido({
          id: unidadId,
          collectionName,
          data,
          html
        });
      } else {
        console.warn(`[Unidad2] El documento ${unidadId} no existe en ${collectionName}.`);
        // Opcional: mostrar la lista como fallback
        if (btnVerUnidades) btnVerUnidades.click();
      }
    } catch (err) {
      console.error(`[Unidad2] Error al cargar unidad directa:`, err);
      if (btnVerUnidades) btnVerUnidades.click();
    }
    
    // Limpiar URL para evitar reaperturas accidentales
    const cleanParams = new URLSearchParams(window.location.search);
    cleanParams.delete("action");
    cleanParams.delete("unidadId");
    const newSearch = cleanParams.toString();
    const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "");
    window.history.replaceState({}, document.title, newUrl);
  }
});
