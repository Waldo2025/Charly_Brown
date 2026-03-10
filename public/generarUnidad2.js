// generarUnidad.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-app.js";
import { getFirestore, addDoc, collection, doc, getDoc, getDocs, updateDoc, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/9.1.3/firebase-firestore.js";

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


const btnVerUnidades = document.getElementById("btnListaUnidadesGuardadas");
const modalLista = document.getElementById("modalUnidadesGuardadas");
const modalEditar = document.getElementById("modalEditarUnidad");
const contenedorLista = document.getElementById("contenedorUnidadesGuardadas");
const editorUnidad = document.getElementById("editorUnidadContenido");

let unidadEditandoId = null;
let autoSaveTimeout = null;
let unidadCompartirId = null;

btnVerUnidades?.addEventListener("click", async () => {
  window.cbUnidadDock?.openSection?.("modalUnidadesGuardadas");
  modalLista.style.display = "block";
  contenedorLista.innerHTML = `<tr><td colspan="5"><i class="fas fa-spinner fa-spin"></i> Cargando unidades...</td></tr>`;

  try {
    const snap = await getDocs(query(collection(db, "unidadesGeneradas")));

    if (snap.empty) {
      contenedorLista.innerHTML = "<tr><td colspan='5'>No hay unidades guardadas.</td></tr>";
      return;
    }

    contenedorLista.innerHTML = snap.docs.map(doc => {
      const data = doc.data();
      const docId = doc.id;
      const compartido = !!data.sharewith && Object.keys(data.sharewith).length > 0;
    
      // Obtener el primer <h2> del contenido HTML
      let tituloUnidad = data.tituloUnidad || "";

      if (!tituloUnidad) {
        try {
          const parser = new DOMParser();
          const docHTML = parser.parseFromString(data.contenido || "", "text/html");
          const h2 = docHTML.querySelector("h2");
          tituloUnidad = h2 ? h2.textContent.trim() : "Sin título";
        } catch (e) {
          tituloUnidad = "Sin título";
        }
      }

    
      // Formatear fecha de creación y edición
      const fechaCreacion = data.timestamp?.toDate?.().toLocaleString?.() || "N/D";
      const fechaEdicion = data.editadoEn?.toDate?.().toLocaleString?.() || "N/D";
    
      return `
        <tr>
          <td>${data.nivel}</td>
          <td>${data.grado}</td>
          <td>${data.trimestre}</td>
          <td>${data.unidad}</td>
          <td contenteditable="true" class="titulo-editable" data-id="${docId}">
            ${tituloUnidad}
          </td>

          <td>${fechaCreacion}</td>
          <td>${fechaEdicion}</td>
          <td>
            <button class="btn-editar" data-id="${docId}" data-html="${encodeURIComponent(data.contenido)}" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-eliminar" data-id="${docId}" title="Eliminar">
              <i class="fas fa-trash-alt"></i>
            </button>
            <button class="btn-compartir" data-id="${docId}" title="Compartir" style="color:${compartido ? '#28a745' : '#888'};">
              <i class="fas fa-share-alt"></i>
            </button>
            <button class="btn-copiar" data-html="${encodeURIComponent(data.contenido)}" title="Copiar contenido">
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
        url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json"
      }
    });

    // Editar
    document.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", () => {
        const html = decodeURIComponent(btn.dataset.html);
        unidadEditandoId = btn.dataset.id;
        const htmlLimpio = html.replace(/<style[\s\S]*?<\/style>/gi, "");
        editorUnidad.innerHTML = htmlLimpio;
        modalEditar.style.display = "block";
      });
    });

    // Eliminar
    document.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (confirm("¿Seguro que deseas eliminar esta unidad?")) {
          await deleteDoc(doc(db, "unidadesGeneradas", id));
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
        const unidadRef = doc(db, "unidadesGeneradas", docId);
        const unidadSnap = await getDoc(unidadRef);
        
        if (!unidadSnap.exists()) return;

        const unidadData = unidadSnap.data();
        const parser = new DOMParser();
        const docHTML = parser.parseFromString(unidadData.contenido || "", "text/html");
        
        // Actualizar título en el contenido HTML
        const h2 = docHTML.querySelector("h2");
        if (h2) h2.textContent = nuevoTitulo;

        const nuevoContenido = docHTML.body.innerHTML;

        await updateDoc(unidadRef, {
          contenido: nuevoContenido,
          tituloUnidad: nuevoTitulo,   // ✅ Guardamos un campo explícito
          editadoEn: new Date()
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
        unidadCompartirId = unidadId;
    
        const modal = document.getElementById("modalCompartirUnidad");
        const lista = document.getElementById("listaUsuariosCompartirUnidad");
    
        modal.style.display = "block";
        lista.innerHTML = "<p><i class='fas fa-spinner fa-spin'></i> Cargando usuarios...</p>";
    
        try {
          const usuariosSnap = await getDocs(collection(db, "users"));
          const unidadDoc = await getDoc(doc(db, "unidadesGeneradas", unidadId));
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
                <input type="checkbox" value="${userId}" ${checked}>
                <span>${nombre}</span>
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
              await updateDoc(doc(db, "unidadesGeneradas", unidadId), { sharewith: shareWith });
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
        tempDiv.innerHTML = html;
    
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
    contenedorLista.innerHTML = "<tr><td colspan='5'>❌ Error al cargar unidades guardadas.</td></tr>";
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
    updateDoc(doc(db, "unidadesGeneradas", unidadEditandoId), {
      contenido: nuevoContenido,
      editadoEn: new Date()
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
