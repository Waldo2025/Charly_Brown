import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, deleteDoc  } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { metodologiaASC } from './metodologiaASC.js';
import { insertarGeneradorImagenes } from './generarImagenes.js';
import { estacionesPorNivelYMateria } from './metodologiaASC.js';
import { escapeHtml, sanitizeRichText, sanitizeTextInput } from './security-utils.js';
import { getDefaultFirebaseApp } from './firebase-default-app.js';
import VanillaTilt from './vendor/vanilla-tilt/vanilla-tilt.es2015.js';

const app = getDefaultFirebaseApp();
const db = getFirestore(app);
const auth = getAuth(app);


// Obtener parámetros de la URL
const params = new URLSearchParams(window.location.search);
const userId = params.get('userId');
const unidadContenido = document.getElementById('unidad-contenido');


let currentUserId = null;
let lecturaGenerada = '';
let seleccionTema = '';
let imagenBase64 = "";
let imagenFile = null;
let areasMejoraDetectadas = '';
let nivel = "";
let textoImagen = ""; 
let pdfFile = null;
let rubricaHTML = "";
let pdfEnProceso = false;
let materiasSeleccionadas = [];
let archivoTexto = "No se proporcionó imagen o PDF.";
let nivelSeleccionadoGlobal = "";
let gradoSeleccionadoGlobal = "";
let temaSeleccionadoGlobal = "";
let textoAcumuladoGlobal = "";
// Variables globales necesarias
let continuacionEnCurso = false;
let unidadId = params.get('unidadId');



onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        
        // Obtener el rol del usuario desde Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            // Logic moved to sidebar.js
        }

        // Obtener parámetros de la URL
        const params = new URLSearchParams(window.location.search);
        unidadId = params.get('unidadId'); // Ahora funciona porque unidadId es let
        
        if (!unidadId) {
            unidadContenido.innerHTML = "<p>No se ha especificado una unidad.</p>";
            return;
        }
        
        // Cargar unidad y luego lecturas
        await cargarUnidad(currentUserId);
        await cargarLecturas();
    } else {
        unidadContenido.innerHTML = "<p>Debes iniciar sesión para ver esta unidad.</p>";
        window.location.href = "login.html";
    }
});



const configurarBuscador = () => {
    const input = document.getElementById("searchInput");
    const filtroNivel = document.getElementById("filtroNivel");
    const filtroGrado = document.getElementById("filtroGrado");
    const filtroTrimestre = document.getElementById("filtroTrimestre");
    const filtroUnidad = document.getElementById("filtroUnidad");
  
    const contenedor = document.getElementById("app-container-contenido-unidad");
  
    const aplicarFiltros = () => {
        const texto = input?.value.toLowerCase().trim() || "";
        const nivel = filtroNivel?.value.toLowerCase() || "";
        const grado = filtroGrado?.value.toLowerCase() || "";
        const trimestre = filtroTrimestre?.value || "";
        const unidad = filtroUnidad?.value || "";
      
        const tarjetas = document.querySelectorAll(".lectura-card, .unidad-item, .searchable-item");
        let hayResultados = false;
      
        tarjetas.forEach((t) => {
          const contenido = t.innerText.toLowerCase();
      
          const visible =
            contenido.includes(texto) &&
            (nivel === "" || contenido.includes(nivel)) &&
            (grado === "" || contenido.includes(grado)) &&
            (trimestre === "" || contenido.includes(`trimestre ${trimestre}`)) &&
            (unidad === "" || contenido.includes(`unidad ${unidad}`));
      
          t.style.display = visible ? "block" : "none";
          if (visible) hayResultados = true;
        });
      
        let msg = document.getElementById("no-results-msg");
        if (!hayResultados && texto) {
          if (!msg) {
            msg = document.createElement("p");
            msg.id = "no-results-msg";
            msg.textContent = "No se encontraron resultados.";
            contenedor.appendChild(msg);
          }
        } else if (msg) {
          msg.remove();
        }
      };
      
  
    [input, filtroNivel, filtroGrado, filtroTrimestre, filtroUnidad].forEach((el) => {
      if (el && typeof el.addEventListener === "function") {
        el.addEventListener("input", aplicarFiltros);
        el.addEventListener("change", aplicarFiltros); // también para selects
      }
    });
  };
  
  document.getElementById("searchInput").addEventListener("input", function () {
    const valor = this.value.toLowerCase();
    document.querySelectorAll(".lectura-card").forEach(card => {
        const texto = card.innerText.toLowerCase();
        card.style.display = texto.includes(valor) ? "flex" : "none";
    });
});


document.getElementById("btnReiniciarFiltros")?.addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
  
    // Reiniciar selects uno por uno
    const selects = ["filtroNivel", "filtroGrado", "filtroTrimestre", "filtroUnidad"];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = "";
        $(`#${id}`).selectpicker('refresh'); // Asegura que el cambio se refleje
      }
    });
  
    // Re-disparar eventos para que se apliquen filtros otra vez
    const eventoInput = new Event('input');
    const eventoChange = new Event('change');
    document.getElementById("searchInput").dispatchEvent(eventoInput);
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.dispatchEvent(eventoChange);
    });
});
    

configurarBuscador();

function createFieldLabel(labelText = "") {
    const strong = document.createElement("strong");
    strong.textContent = `${labelText}:`;
    return strong;
}

function createLabeledControl(labelText, control) {
    const label = document.createElement("label");
    label.append(createFieldLabel(labelText), document.createTextNode(" "), control);
    return label;
}

function renderUnidadHeaderEditable(container, data = {}) {
    if (!container) return;
    container.replaceChildren();

    const titulo = document.createElement("h2");
    titulo.id = "tituloUnidad";
    titulo.contentEditable = "true";
    titulo.textContent = `${data.nivel || "-"} - ${data.grado || "-"} - Unidad ${data.unidad || "-"}`;

    const trimestreInput = document.createElement("input");
    trimestreInput.type = "number";
    trimestreInput.id = "trimestreInput";
    trimestreInput.min = "1";
    trimestreInput.max = "3";
    trimestreInput.value = String(data.trimestre ?? "");

    const privacidadSelect = document.createElement("select");
    privacidadSelect.id = "privacidadSelect";
    ["Privado", "Público"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.selected = data.privacidad === value;
        option.textContent = value;
        privacidadSelect.appendChild(option);
    });

    const createdParagraph = document.createElement("p");
    createdParagraph.append(createFieldLabel("Creado el"), document.createTextNode(` ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : "Desconocido"}`));

    container.append(
        titulo,
        createLabeledControl("Trimestre", trimestreInput),
        createLabeledControl("Privacidad", privacidadSelect),
        createdParagraph
    );
}

function createEditableInfoBlock({labelText, id, value}) {
    const block = document.createElement("div");
    block.className = "info-block";

    const label = document.createElement("label");
    label.textContent = labelText;

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.id = id;
    editable.className = "editable";
    editable.textContent = String(value ?? "");

    block.append(label, editable);
    return block;
}

function createNumberInfoBlock({labelText, id, value}) {
    const block = document.createElement("div");
    block.className = "info-block";

    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "number";
    input.id = id;
    input.className = "input-numero";
    input.value = String(value ?? "");

    block.append(label, input);
    return block;
}

function renderUnidadInfoModalContent(container, u = {}) {
    if (!container) return;
    container.replaceChildren();

    const grid = document.createElement("div");
    grid.className = "unidad-info-grid";

    grid.appendChild(createEditableInfoBlock({
        labelText: "Nombre de la unidad:",
        id: "mod-nombreUnidad",
        value: u.nombreUnidad || ""
    }));

    grid.appendChild(createEditableInfoBlock({
        labelText: "Materia:",
        id: "mod-materia",
        value: u.materia || ""
    }));

    const infoRowMain = document.createElement("div");
    infoRowMain.className = "info-row";
    infoRowMain.append(
        createEditableInfoBlock({ labelText: "Nivel:", id: "mod-nivel", value: u.nivel || "-" }),
        createEditableInfoBlock({ labelText: "Grado:", id: "mod-grado", value: u.grado || "-" }),
        createNumberInfoBlock({ labelText: "Unidad:", id: "mod-unidad", value: u.unidad || "" })
    );

    const infoRowSecondary = document.createElement("div");
    infoRowSecondary.className = "info-row";
    infoRowSecondary.appendChild(createNumberInfoBlock({
        labelText: "Trimestre:",
        id: "mod-trimestre",
        value: u.trimestre || ""
    }));

    const privacidadBlock = document.createElement("div");
    privacidadBlock.className = "info-block";
    const privacidadLabel = document.createElement("label");
    privacidadLabel.textContent = "Privacidad:";
    const privacidadSelect = document.createElement("select");
    privacidadSelect.id = "mod-privacidad";
    privacidadSelect.className = "input-select";
    ["Privado", "Público"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.selected = u.privacidad === value;
        option.textContent = value;
        privacidadSelect.appendChild(option);
    });
    privacidadBlock.append(privacidadLabel, privacidadSelect);
    infoRowSecondary.appendChild(privacidadBlock);

    const createdBlock = document.createElement("div");
    createdBlock.className = "info-block";
    const createdLabel = document.createElement("label");
    createdLabel.textContent = "Creado el:";
    const createdText = document.createElement("p");
    createdText.textContent = u.createdAt?.toDate().toLocaleDateString() || "-";
    createdBlock.append(createdLabel, createdText);

    grid.append(infoRowMain, infoRowSecondary, createdBlock);
    container.appendChild(grid);
}


const cargarUnidad = async (userId) => {
    try {
    if (!unidadId) {
        unidadContenido.innerHTML = "<p>Faltan datos para cargar la unidad.</p>";
        return;
    }

    const docRef = doc(db, "Unidades", unidadId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.userId !== userId) {
        unidadContenido.innerHTML = "<p>No tienes permiso para ver esta unidad.</p>";
        return;
        }
        
        nivel = data.nivel;

        // Mostrar campos editables con DOM seguro.
        renderUnidadHeaderEditable(unidadContenido, data);

        // Eventos para guardar automáticamente
        document.getElementById("trimestreInput").addEventListener("change", async (e) => {
        await updateDoc(docRef, { trimestre: parseInt(e.target.value) });
        });

        document.getElementById("privacidadSelect").addEventListener("change", async (e) => {
        await updateDoc(docRef, { privacidad: e.target.value });
        });

        document.getElementById("tituloUnidad").addEventListener("blur", async (e) => {
        const texto = e.target.textContent;
        const match = texto.match(/^(.*) - (.*) - Unidad (.*)$/i);
        if (match) {
            const nivel = match[1];
            const grado = match[2];
            const unidad = match[3];
            await updateDoc(docRef, { nivel, grado, unidad });
        }
        });

    } else {
        unidadContenido.innerHTML = "<p>La unidad no fue encontrada.</p>";
    }

    } catch (error) {
    unidadContenido.innerHTML = "<p>Ocurrió un error al cargar la unidad.</p>";
    }
};

document.addEventListener("DOMContentLoaded", cargarUnidad);



async function cargarLecturas() {
    const cont = document.getElementById("listaLecturas");
    cont.innerHTML = "<p>Cargando lecturas...</p>";
    
    // Verificar que tenemos los IDs necesarios
    if (!currentUserId || !unidadId) {
        cont.innerHTML = "<p>Error: Faltan datos para cargar lecturas.</p>";
        return;
    }

    try {

        const q = query(
            collection(db, "lecturas"),
            where("userId", "==", currentUserId),
            where("unidadId", "==", unidadId)
        );
        
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            cont.innerHTML = "<p>No hay lecturas guardadas para esta unidad.</p>";
            return;
        }




        cont.innerHTML = "";

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const datosUnidad = await obtenerDatosUnidad(data.unidadId);
            
            const div = document.createElement("div");
            div.classList.add("lectura-card");
            
            // ✅ Agregamos atributos de filtro como dataset
            div.dataset.nivel = (datosUnidad?.nivel || "").toLowerCase();
            div.dataset.grado = (datosUnidad?.grado || "").toLowerCase();
            div.dataset.trimestre = (datosUnidad?.trimestre || "").toString();
            div.dataset.unidad = (datosUnidad?.unidad || "").toString();
            
            const encabezadoUnidad = datosUnidad ? `
                <div class="lectura-encabezado">
                <strong>${escapeHtml(datosUnidad.materia || 'Materia no definida')}</strong> – 
                ${escapeHtml(datosUnidad.nombreUnidad || 'Sin nombre')}
                <br>
                <small>
                    Nivel: ${escapeHtml(datosUnidad.nivel || '-')} | 
                    Grado: ${escapeHtml(datosUnidad.grado || '-')} | 
                    Trimestre ${escapeHtml(datosUnidad.trimestre || '-')}, Unidad ${escapeHtml(datosUnidad.unidad || '-')}
                </small>
                </div>
            ` : '';
            
            div.innerHTML = `
                ${encabezadoUnidad}
                <h4>${escapeHtml(data.tema || 'Sin título')}</h4>
                <p class="lectura-preview">
                ${escapeHtml(stripHTML(data.texto).slice(0, 120))}${stripHTML(data.texto).length > 120 ? '...' : ''}
                </p>
                <div class="lectura-meta">
                <small>${data.createdAt?.toDate()?.toLocaleDateString() || 'Fecha no disponible'}</small>
                <div class="lectura-acciones">
                    <button class="editar-lectura" data-id="${escapeHtml(doc.id)}" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="eliminar-lectura" data-id="${escapeHtml(doc.id)}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                    <button class="toggle-estatus" data-id="${escapeHtml(doc.id)}" title="Compartir lectura">
                    <i class="fas fa-share-alt" style="color: ${data.estatusLectura === 'Compartido' ? 'green' : 'gray'}"></i>
                    </button>
                </div>
                </div>
            `;
            
            // 🎯 Tilt effect
            VanillaTilt.init(div, {
                max: 2,
                speed: 400,
                glare: true,
                "max-glare": 0.5
            });
            
            cont.appendChild(div);
            }
                        
        document.querySelectorAll('.editar-lectura').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.currentTarget;
                const docId = button.getAttribute('data-id');
                await mostrarLecturaCompleta(docId);
            });
        });

        document.querySelectorAll('.toggle-estatus').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.currentTarget.getAttribute('data-id');
                if (!docId) return;
            
                try {
                const docRef = doc(db, "lecturas", docId);
                const snap = await getDoc(docRef);
            
                if (!snap.exists()) return;
                const data = snap.data();
            
                if (data.estatusLectura === "Compartido") {
                    // Descompartir
                    await updateDoc(docRef, {
                    estatusLectura: "Editando",
                    sharewith: []
                    });
            
                    alert("❌ Lectura descompartida");
                    await cargarLecturas();
                } else {
                    // Mostrar modal de compartir
                    mostrarModalCompartirLectura(docId);
                }
                } catch (error) {
                alert("Hubo un error al cambiar el estatus.");
                }
            });
        });

        // Agregar evento a botones de eliminar (¡IMPORTANTE!)
        document.querySelectorAll('.eliminar-lectura').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.currentTarget;
                const docId = button.getAttribute('data-id');
                if (confirm("¿Estás seguro de que deseas eliminar esta lectura?")) {
                    try {
                        await deleteDoc(doc(db, "lecturas", docId));
                        await cargarLecturas(); // Recargar lista
                    } catch (error) {
                        mostrarError("No se pudo eliminar la lectura.");
                    }
                }
            });
        });
                
        // Agregar eventos a los botones "Ver completo"
        document.querySelectorAll('.ver-mas').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const docId = e.target.getAttribute('data-id');
                mostrarLecturaCompleta(docId);
            });
        });

    } catch (error) {
        cont.textContent = `Error al cargar lecturas: ${error.message || "sin detalle"}`;
    }
}


const obtenerDatosUnidad = async (unidadId) => {
    if (!unidadId) return null;
    try {
        const docSnap = await getDoc(doc(db, "Unidades", unidadId));
        if (docSnap.exists()) {
            return docSnap.data();
        }
    } catch (err) {
    }
    return null;
};


function stripHTML(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
}


// GUARDAR LECTURA EN FIRESTORE

document.addEventListener("DOMContentLoaded", () => {
    const btnTodos = document.getElementById("btnCompartirTodos");
    const btnUsuario = document.getElementById("btnCompartirUsuario");
    const modal = document.getElementById("modalCompartirLectura");
    const exportarLecturaTaggedBtn = document.getElementById("exportarLecturaTaggedBtn");
    const cerrarPanelLecturasGuardadasBtn = document.getElementById("cerrarPanelLecturasGuardadasBtn");
    
    if (btnTodos && modal) {
        btnTodos.addEventListener("click", async () => {
        if (!lecturaIdCompartir) return;
    
        const docRef = doc(db, "lecturas", lecturaIdCompartir);
        await updateDoc(docRef, {
            estatusLectura: "Compartido",
            sharewith: ["todos"]
        });
    
        alert("✅ Compartido públicamente");
        modal.style.display = "none";
        await cargarLecturas();
        });
    }
    
    if (btnUsuario && modal) {
        btnUsuario.addEventListener("click", async () => {
        const select = document.getElementById("emailCompartirLectura");
        const seleccionados = Array.from(select.selectedOptions).map(opt => opt.value);
    
        if (!lecturaIdCompartir || seleccionados.length === 0) {
            alert("Selecciona al menos un usuario.");
            return;
        }
    
        const docRef = doc(db, "lecturas", lecturaIdCompartir);
        await updateDoc(docRef, {
            estatusLectura: "Compartido",
            sharewith: seleccionados
        });
    
        alert("✅ Compartido con usuario(s) seleccionado(s)");
        modal.style.display = "none";
        await cargarLecturas();
        });
    }


    const cerrar = document.getElementById("cerrarModalCompartirLecturaBtn");
    if (cerrar) {
        cerrar.addEventListener("click", () => {
        document.getElementById("modalCompartirLectura").style.display = "none";
        });
    }

    exportarLecturaTaggedBtn?.addEventListener("click", () => {
        if (typeof window.exportarLecturaComoTaggedText === "function") {
            window.exportarLecturaComoTaggedText();
        }
    });

    cerrarPanelLecturasGuardadasBtn?.addEventListener("click", () => {
        const panel = document.getElementById("panelLecturasGuardadas");
        if (panel) panel.style.display = "none";
    });
            
    });

    document.addEventListener('DOMContentLoaded', function() {
    // 🔥 Forzar ocultar el editorLectura al cargar

    const cerrarEditorLecturaBtn = document.getElementById('cerrarEditorLecturaBtn');
    const editorLectura = document.getElementById('editorLectura');
    if (cerrarEditorLecturaBtn && editorLectura) {
        cerrarEditorLecturaBtn.addEventListener('click', () => {
        editorLectura.style.display = 'none';
        });
    }

});
    

      

// 3. Función para mostrar lectura completa
async function mostrarLecturaCompleta(docId) {
    try {
        const modal = document.getElementById('lecturaModal');
        const editor = document.getElementById('modalEditor');
        const titulo = document.getElementById('modalTitulo');
        
        const docRef = doc(db, "lecturas", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
        
            // Reemplaza contenido
            titulo.textContent = data.tema || 'Lectura sin título';

            // Inicializar el editor si no está activado aún
            if (!$('#modalEditor').hasClass('trumbowyg-editor')) {
                $('#modalEditor').trumbowyg({
                    svgPath: 'vendor/trumbowyg/icons.svg',
                    lang: 'es',
                    autogrow: true,
                    btns: [
                        ['viewHTML'],
                        ['undo', 'redo'],
                        ['formatting'],
                        ['strong', 'em', 'del'],
                        ['superscript', 'subscript'],
                        ['link'],
                        ['insertImage'],
                        ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
                        ['unorderedList', 'orderedList'],
                        ['horizontalRule'],
                        ['removeformat'],
                        ['fullscreen']
                    ]
                });
            }
            
            // Establecer el contenido HTML
            $('#modalEditor').trumbowyg('html', sanitizeRichText(data.texto || ''));
            $('#modalEditor').data('docId', docId); // Guardar ID
            
            modal.style.display = 'block';


        }
        
    } catch (error) {
        mostrarError("Error al cargar la lectura completa.");
    }
}


// Cerrar modal cuando se hace clic fuera del contenido
window.addEventListener('click', (event) => {
    const modal = document.getElementById('lecturaModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

// Cerrar modal con el botón
const cerrarModalBtn = document.getElementById('cerrarModalBtn');
if (cerrarModalBtn) {
  cerrarModalBtn.addEventListener('click', () => {
    document.getElementById('lecturaModal').style.display = 'none';
  });
}

document.addEventListener('click', async (e) => {
    const guardarBtn = e.target.closest('#guardarCambiosBtn');
    if (!guardarBtn) return;

    const editor = document.getElementById('modalEditor');
    const docId = $('#modalEditor').data('docId');
    const nuevoTexto = sanitizeRichText($('#modalEditor').trumbowyg('html').trim());

    if (!docId || !nuevoTexto) {
        mostrarError("No se puede guardar el texto vacío");
        return;
    }

    try {
        const docRef = doc(db, "lecturas", docId);
        await updateDoc(docRef, {
            texto: nuevoTexto,
            updatedAt: new Date()
        });

        await cargarLecturas();
        document.getElementById('lecturaModal').style.display = 'none';
    } catch (error) {
        mostrarError("Error al guardar los cambios");
    }
});


document.addEventListener("DOMContentLoaded", () => {
  const guardarBtn = document.getElementById("guardarLecturaBtn");
  if (guardarBtn) {
    guardarBtn.addEventListener("click", async () => {
      const textoFinal = sanitizeRichText($('#textoLectura').trumbowyg('html'));
      // 🔍 Obtener datos del usuario desde la colección "users"
      const userDocRef = doc(db, "users", currentUserId);
      const userDocSnap = await getDoc(userDocRef);

      let autorNombre = "Anónimo";
      let autorEmail = "";

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const nombre = userData.firstName || "";
        const apellido = userData.lastName || "";
        autorNombre = `${nombre} ${apellido}`.trim() || "Anónimo";
        autorEmail = userData.email || "";
      }

      if (!textoFinal || textoFinal.trim() === "<p><br></p>") {
        alert("Texto vacío");
        return;
      }

      if (!currentUserId || !unidadId) {
        alert("Error: No se ha identificado la unidad o usuario.");
        return;
      }

      try {
        await addDoc(collection(db, "lecturas"), {
          userId: currentUserId,
          unidadId: unidadId,
          texto: textoFinal,
          tema: sanitizeTextInput(seleccionTema, {maxLength: 240}),
          formato: 'html',
          createdAt: new Date(),
          autorNombre: autorNombre,
          autorEmail: autorEmail
        });

        alert("Lectura guardada correctamente.");
        await cargarLecturas();
        
        const generador = document.getElementById("generador-lecturas");
        if (generador) generador.style.display = "none";

      } catch (error) {
        alert("Error al guardar la lectura. Revisa la consola.");
      }
    });
  }
});




document.addEventListener("DOMContentLoaded", () => {
    insertarGeneradorImagenes("#generadorImagenesContainer");
});



document.getElementById("modalTitulo").addEventListener("blur", async (e) => {
    const nuevoTitulo = sanitizeTextInput(e.target.textContent, {maxLength: 240});
    e.target.textContent = nuevoTitulo;
    const docId = $('#modalEditor').data('docId');

    if (!docId || !nuevoTitulo) return;

    try {
    const docRef = doc(db, "lecturas", docId);
    await updateDoc(docRef, { tema: nuevoTitulo, updatedAt: new Date() });

    // Recargar lista de lecturas para reflejar el nuevo título
    await cargarLecturas();
    } catch (error) {
    mostrarError("No se pudo actualizar el título.");
    }
});




let lecturaIdCompartir = null;

async function mostrarModalCompartirLectura(docId) {
    lecturaIdCompartir = docId;
    document.getElementById("modalCompartirLectura").style.display = "block";

    const select = document.getElementById("emailCompartirLectura");
    select.innerHTML = '<option disabled>Cargando usuarios...</option>';

    try {
    const snapshot = await getDocs(collection(db, "users"));
    select.innerHTML = "";

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const option = document.createElement("option");
        option.value = docSnap.id;
        option.textContent = data.nombre || data.email || "Sin nombre";
        select.appendChild(option);
    });
    } catch (e) {
    select.innerHTML = '<option disabled>Error al cargar</option>';
    }
}



  // Mostrar u ocultar el generador
const botonAbrirGenerador = document.getElementById("btnAbrirGeneradorImagenes");
const contenedor = document.getElementById("contenedorGeneradorImagenes");
const cerrarGenerador = document.getElementById("cerrarGeneradorImagenes");
const containerInterno = document.getElementById("generadorImagenesContainer");

botonAbrirGenerador.addEventListener("click", async () => {
  if (containerInterno.innerHTML.trim() === "") {
    // Cargar contenido del archivo generarImagen.html
    try {
      const res = await fetch("generarImagen.html");
      const html = await res.text();
      // Insertar solo el contenido del <body>, no el <head>
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      containerInterno.innerHTML = bodyMatch ? bodyMatch[1] : html;
      // Ejecutar scripts manualmente si es necesario
      const scripts = containerInterno.querySelectorAll("script");
      for (let script of scripts) {
        const newScript = document.createElement("script");
        newScript.type = script.type || "text/javascript";
        if (script.src) {
          newScript.src = script.src;
        } else {
          newScript.textContent = script.textContent;
        }
        document.body.appendChild(newScript);
      }
    } catch (e) {
    }
  }

  contenedor.style.display = "block";
});

cerrarGenerador.addEventListener("click", () => {
  contenedor.style.display = "none";
});



document.getElementById("exportarModalInDesignBtn").addEventListener("click", () => {
    const contenidoHTML = $('#modalEditor').trumbowyg('html');

    if (!contenidoHTML || contenidoHTML.trim() === "") {
        alert("No hay contenido para exportar.");
        return;
    }

    const div = document.createElement("div");
    div.innerHTML = sanitizeRichText(contenidoHTML);

    let taggedText = "<ASCII-MAC>\r" + eliminarEmojis(convertirNodo(div));

    taggedText = normalizarCaracteresCorruptos(taggedText);
    taggedText = taggedText.replace(/\r?\n|\n/g, '\r');

    const latin1Text = unescape(encodeURIComponent(taggedText));
    const blob = new Blob([latin1Text], { type: "text/plain;charset=iso-8859-1" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "lectura_indesign.txt";
    a.click();
    URL.revokeObjectURL(url);
});



$(document).ready(function() {
    $('#textoLectura').trumbowyg({
        svgPath: 'vendor/trumbowyg/icons.svg',
        lang: 'es',
        autogrow: true,
        removeformatPasted: false,
        btns: [
            ['viewHTML'],
            ['undo', 'redo'],
            ['formatting'],
            ['strong', 'em', 'del'],
            ['superscript', 'subscript'],
            ['fontsize'],
            ['foreColor', 'backColor'],
            ['link'],
            ['insertImage', 'base64'],
            ['upload', 'noembed'],
            ['highlight'],
            ['table'],
            ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
            ['unorderedList', 'orderedList'],
            ['horizontalRule'],
            ['removeformat'],
            ['fullscreen']
        ]
    });
        
});

document.getElementById("cerrarModalBtnTop").addEventListener("click", () => {
    document.getElementById("lecturaModal").style.display = "none";
});
      

document.addEventListener("DOMContentLoaded", () => {
    const btnAbrir = document.getElementById("abrirUnidadBtn");
    const modal    = document.getElementById("modalUnidad");
    const cerrar   = document.querySelector(".close-modal-unidad");
    const cont     = document.getElementById("unidad-contenido");
    const db       = getFirestore();
  
    const params   = new URLSearchParams(window.location.search);
    const unidadId = params.get("unidadId");
  
    const cargarInfoUnidad = async () => {
      if (!unidadId) {
        cont.innerHTML = `<p>No se especificó la unidad.</p>`;
        return;
      }
  
      try {
        const snap = await getDoc(doc(db, "Unidades", unidadId));
        if (!snap.exists()) {
          cont.innerHTML = `<p>Unidad no encontrada.</p>`;
          return;
        }
  
        const u = snap.data();
        renderUnidadInfoModalContent(cont, u);
                      
        // Guardar nombreUnidad
        document.getElementById("mod-nombreUnidad").addEventListener("blur", async e => {
          const txt = e.target.textContent.replace(/^Nombre de la unidad:\s*/, "").trim();
          await updateDoc(doc(db, "Unidades", unidadId), { nombreUnidad: txt });
        });
  
        // Guardar materia
        document.getElementById("mod-materia").addEventListener("blur", async e => {
          const txt = e.target.textContent.replace(/^Materia:\s*/, "").trim();
          await updateDoc(doc(db, "Unidades", unidadId), { materia: txt });
        });
  
        document.getElementById("mod-nivel").addEventListener("blur", async e => {
            await updateDoc(doc(db, "Unidades", unidadId), { nivel: e.target.textContent.trim() });
        });

        // Guardar grado
        document.getElementById("mod-grado").addEventListener("blur", async e => {
            await updateDoc(doc(db, "Unidades", unidadId), { grado: e.target.textContent.trim() });
        });

        // Guardar unidad
        document.getElementById("mod-unidad").addEventListener("change", async e => {
            const valor = parseInt(e.target.value);
            if (!isNaN(valor)) {
                await updateDoc(doc(db, "Unidades", unidadId), { unidad: valor });
            }
        });



        // Guardar trimestre
        document.getElementById("mod-trimestre").addEventListener("change", async e => {
          const valor = parseInt(e.target.value);
          if (!isNaN(valor)) {
            await updateDoc(doc(db, "Unidades", unidadId), { trimestre: valor });
          }
        });
  
        // Guardar privacidad
        document.getElementById("mod-privacidad").addEventListener("change", async e => {
          const valor = e.target.value;
          await updateDoc(doc(db, "Unidades", unidadId), { privacidad: valor });
        });
  
      } catch (err) {
        cont.innerHTML = `<p>Error cargando datos.</p>`;
      }
    };
  
    // Mostrar modal y cargar datos
    if (btnAbrir && modal && cerrar) {
      btnAbrir.addEventListener("click", async () => {
        await cargarInfoUnidad(); // ✅ Cargar antes de mostrar
        modal.style.display = "block";
      });
  
      cerrar.addEventListener("click", () => {
        modal.style.display = "none";
      });
  
      window.addEventListener("click", e => {
        if (e.target === modal) {
          modal.style.display = "none";
        }
      });
    }
});


document.getElementById("btnAbrirGenerador").addEventListener("click", () => {
  window.location.href = "generarLectura.html";
});
