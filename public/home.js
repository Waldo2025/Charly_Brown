import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, doc, 
  updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js";
import { escapeHtml, safeUrl, sanitizeRichText, sanitizeTextInput } from "./security-utils.js";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";

const app = initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
void bootstrapFirebaseAppCheck(app);
const db = getFirestore(app);
const auth = getAuth(app);


onAuthStateChanged(auth, async (user) => {
  if (user) {
    await verificarRolUsuario(user);

    // — ocultar/mostrar “Usuarios” —

    // — ocultar/mostrar “Gestión de Usuarios” sólo para admin —
    const gestionUsuariosLink = document.getElementById("gestionUsuariosLink");
    if (gestionUsuariosLink) {
      // añade d-none si NO es admin
      gestionUsuariosLink.classList.toggle("d-none", currentUserRole !== "admin");
    }
    // — ocultar/mostrar “Análisis Editorial” —
    const analisisLink = document.getElementById("analisisEditorialLink");
    if (analisisLink) {
      const permitidos = ["admin","author","developer"];
      const ocultar = !permitidos.includes(currentUserRole);
      // añade d-none si debe ocultarse; la quita si debe mostrarse
      analisisLink.classList.toggle("d-none", ocultar);
    }




    // Llamar a las funciones de configuración necesarias
    configurarEventos();
    configurarBuscador();

    // Aquí puedes incluir una espera adicional si es necesario para cargar otros recursos, como las lecturas o imágenes:
    await renderLecturas();
    await renderImagenesCompartidas();
  } else {
    window.location.href = "login.html"; // Redirigir a login si no hay usuario autenticado
  }
});

// Mueve esta línea al inicio para que sea global
let currentUserRole = "editor";

let coleccionLecturaActual = "lecturas";


// Función para verificar el rol del usuario en Firestore
const verificarRolUsuario = async (user) => {
  if (user) {
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      currentUserRole = userData.role || "editor"; // Asignar "editor" por defecto
    } else {
    }
  } else {
  }
};



let usuariosCache = new Map();

let unsubscribeLecturas;
let unsubscribeComentarios;

let currentUserName = "Anónimo";
let lecturaIdActual = null;
let toggleVerArchivados = false;
let toggleVerArchivadosImagenes = false;

// Obtener nombre del usuario actual
const obtenerNombreUsuarioActual = async (user) => {
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      return `${data.firstName || ""} ${data.lastName || ""}`.trim() || user.email || "Anónimo";
    }
    return user.email || "Usuario sin nombre";
  } catch (error) {
    return user.email || "Usuario sin nombre";
  }
};

// Función para renderizar comentarios de Firestore en el panel
const renderComentarios = async (lecturaId) => {
  const contenedorComentarios = document.getElementById("comentarios-lista");
  if (!contenedorComentarios) return;

  contenedorComentarios.innerHTML = "<p>Cargando comentarios...</p>";

  const q = query(collection(db, "comentarios"), where("lecturaId", "==", lecturaId));
  
  // Usar onSnapshot para escuchar cambios en tiempo real
  const unsubscribe = onSnapshot(q, (snap) => {
    if (snap.empty) {
      contenedorComentarios.innerHTML = "<p>No hay comentarios aún.</p>";
      return;
    }

    // Agrupar comentarios por texto comentado
    const comentariosAgrupados = {};
    snap.forEach(docSnap => {
      const comentarioData = docSnap.data();
      const textoComentado = comentarioData.seccion;
      
      if (!comentariosAgrupados[textoComentado]) {
        comentariosAgrupados[textoComentado] = [];
      }
      
      comentariosAgrupados[textoComentado].push({
        id: docSnap.id,
        ...comentarioData
      });
    });

    // Limpiar contenedor
    contenedorComentarios.innerHTML = "";

    // Renderizar cada grupo de comentarios
    Object.entries(comentariosAgrupados).forEach(([textoComentado, comentarios]) => {
      const grupoElemento = document.createElement("div");
      grupoElemento.className = "comment-group";

      const textoElemento = document.createElement("div");
      textoElemento.className = "commented-text";
      textoElemento.textContent = `"${textoComentado}"`;
      grupoElemento.appendChild(textoElemento);
      
      comentarios.forEach(comentarioData => {
        const comentarioElemento = crearElementoComentario(comentarioData);
        grupoElemento.appendChild(comentarioElemento);
      });

      contenedorComentarios.appendChild(grupoElemento);
    });
  });

  return unsubscribe;
};



// Función auxiliar para crear un elemento de comentario individual
// Función auxiliar mejorada para crear un elemento de comentario individual
function crearElementoComentario(comentarioData) {
  const comentarioElemento = document.createElement("div");
  comentarioElemento.className = "comment";
  comentarioElemento.dataset.id = comentarioData.id;

  const esPropietario = comentarioData.autor === currentUserName;
  const estaSeleccionado = comentarioData.seleccionadoPor?.includes(auth.currentUser?.uid) || false;
  const totalSelecciones = comentarioData.seleccionadoPor?.length || 0;

  const autorSafe = escapeHtml(comentarioData.autor || "Anónimo");
  const comentarioSafe = escapeHtml(comentarioData.comentario || "");
  const fechaSafe = escapeHtml(comentarioData.fecha?.toDate().toLocaleString() || "");
  comentarioElemento.innerHTML = `
    <div class="comment-header">
      <strong>${autorSafe}</strong>
      <div class="comment-actions">
        ${esPropietario ? `
        <i class="bx bx-trash delete-comment" title="Eliminar"></i>
        ` : ''}
        <span class="selection-info">
          <span class="selection-count" title="${totalSelecciones} selección(es)">
            ${totalSelecciones > 0 ? totalSelecciones : ''}
          </span>
          <i class='bx ${totalSelecciones > 0 ? 'bxs-checkbox-checked' : 'bx-checkbox'} select-comment' 
             style="color: ${totalSelecciones > 0 ? 'green' : 'gray'};"
             title="${estaSeleccionado ? 'Deseleccionar' : 'Seleccionar'}"></i>
        </span>
      </div>
    </div>
    <div class="comment-content" contenteditable="${esPropietario}">${comentarioSafe}</div>
    <small>${fechaSafe}</small>
  `;

  // Evento para resaltar texto al hacer clic en el comentario
  comentarioElemento.addEventListener('click', (e) => {
    if (!e.target.classList.contains('delete-comment') && !e.target.classList.contains('select-comment')) {
      resaltarTextoComentado(comentarioData.posicion, comentarioData.longitud, comentarioData.seccion);
    }
  });

  // Evento para seleccionar/deseleccionar comentario
  const selectIcon = comentarioElemento.querySelector('.select-comment');
  if (selectIcon) {
    selectIcon.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleSeleccionComentario(comentarioData.id, !estaSeleccionado);
    });
  }

  // Evento para eliminar comentario
  const deleteIcon = comentarioElemento.querySelector('.delete-comment');
  if (deleteIcon && esPropietario) {
    deleteIcon.addEventListener('click', async (e) => {
      e.stopPropagation();
      await eliminarComentario(comentarioData.id);
    });
  }

  // Evento para editar comentario
  const contentEditable = comentarioElemento.querySelector('.comment-content');
  if (contentEditable && esPropietario) {
    contentEditable.addEventListener('blur', async (e) => {
      const nuevoTexto = sanitizeTextInput(e.target.textContent || "", {maxLength: 3000, preserveNewlines: true});
      e.target.textContent = nuevoTexto;
      if (nuevoTexto !== comentarioData.comentario) {
        await actualizarComentario(comentarioData.id, nuevoTexto);
      }
    });
  }

  return comentarioElemento;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
  const notificacion = document.createElement('div');
  notificacion.className = `notification ${tipo}`;
  notificacion.textContent = mensaje;
  document.body.appendChild(notificacion);
  
  setTimeout(() => {
    notificacion.classList.add('fade-out');
    setTimeout(() => notificacion.remove(), 500);
  }, 3000);
}


// Función para alternar la selección de un comentario
async function toggleSeleccionComentario(comentarioId, seleccionar) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const comentarioRef = doc(db, "comentarios", comentarioId);

    if (seleccionar) {
      await updateDoc(comentarioRef, {
        seleccionadoPor: arrayUnion(user.uid)
      });
    } else {
      await updateDoc(comentarioRef, {
        seleccionadoPor: arrayRemove(user.uid)
      });
    }
  } catch (error) {
  }
}



async function actualizarComentario(comentarioId, nuevoTexto) {
  try {
    await updateDoc(doc(db, "comentarios", comentarioId), {
      comentario: sanitizeTextInput(nuevoTexto, {maxLength: 3000, preserveNewlines: true}),
      fecha: new Date() // Actualizar fecha de modificación
    });
  } catch (error) {
    alert("Hubo un error al actualizar el comentario");
  }
}

// Función para eliminar un comentario
async function eliminarComentario(comentarioId) {
  if (confirm("¿Estás seguro de que quieres eliminar este comentario?")) {
    try {
      await deleteDoc(doc(db, "comentarios", comentarioId));
      // Volver a renderizar los comentarios
      await renderComentarios(lecturaIdActual);
    } catch (error) {
      alert("Hubo un error al eliminar el comentario");
    }
  }
}



function resaltarTextoComentado(posicion, longitud, texto) {
 const editor = document.getElementById("modalTextoLectura");

 // 1) limpiar resaltados previos
 editor.querySelectorAll('.highlight-comment').forEach(s => s.classList.remove('highlight-comment'));
 editor.querySelectorAll('.highlight-paragraph').forEach(b => b.classList.remove('highlight-paragraph'));

 // 2) intentar encontrar <span data-start-pos> existente
 let spanObjetivo = Array.from(
   editor.querySelectorAll("span[data-start-pos][data-end-pos]")
 ).find(span => {
   const start = +span.dataset.startPos, end = +span.dataset.endPos;
   return start <= posicion && end >= posicion + longitud;
 });

 // 3) Si no existe span y tengo texto, recalculo posición con indexOf
 if (!spanObjetivo && texto) {
   const full = editor.textContent;
   const idx  = full.indexOf(texto);
   if (idx !== -1) {
     posicion = idx;
     longitud = texto.length;
   }
 }

 // 4) TreeWalker sobre TODO el editor para ubicar nodos de texto
 const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
 let charIndex = 0, startNode = null, endNode = null;
 let startOffset = 0, endOffset = 0, node;
 const endPos = posicion + longitud;

 while ((node = walker.nextNode())) {
   const nextIndex = charIndex + node.textContent.length;
   if (startNode === null && posicion >= charIndex && posicion < nextIndex) {
     startNode   = node;
     startOffset = posicion - charIndex;
   }
   if (startNode && endPos <= nextIndex) {
     endNode   = node;
     endOffset = endPos - charIndex;
     break;
   }
   charIndex = nextIndex;
 }

 if (!startNode || !endNode) {
 }

 // 5) envolver sólo el fragmento deseado
 let targetSpan;
 if (startNode === endNode) {
   // mismo nodo de texto
   const txt = startNode.textContent;
   const before = txt.slice(0, startOffset),
         mid    = txt.slice(startOffset, endOffset),
         after  = txt.slice(endOffset);
   const parent = startNode.parentNode;
   parent.insertBefore(document.createTextNode(before), startNode);
   targetSpan = document.createElement("span");
   targetSpan.textContent = mid;
   targetSpan.classList.add("highlight-comment");
   parent.insertBefore(targetSpan, startNode);
   parent.insertBefore(document.createTextNode(after), startNode);
   parent.removeChild(startNode);

 } else {
   // varios nodos de texto
   // a) fragmento final del primer nodo
   const t1 = startNode.textContent, pre1 = t1.slice(0, startOffset), mid1 = t1.slice(startOffset);
   const p1 = startNode.parentNode;
   p1.insertBefore(document.createTextNode(pre1), startNode);
   const span1 = document.createElement("span");
   span1.textContent = mid1;
   span1.classList.add("highlight-comment");
   p1.insertBefore(span1, startNode);
   p1.removeChild(startNode);

   // b) nodos intermedios completos
   walker.currentNode = span1;
   while ((node = walker.nextNode()) && node !== endNode) {
     const sp = document.createElement("span");
     sp.textContent = node.textContent;
     sp.classList.add("highlight-comment");
     node.parentNode.replaceChild(sp, node);
   }

   // c) fragmento inicial del último nodo
   const t2 = endNode.textContent, mid2 = t2.slice(0, endOffset), aft2 = t2.slice(endOffset);
   const p2 = endNode.parentNode;
   const span2 = document.createElement("span");
   span2.textContent = mid2;
   span2.classList.add("highlight-comment");
   p2.insertBefore(span2, endNode);
   p2.insertBefore(document.createTextNode(aft2), endNode);
   p2.removeChild(endNode);

   targetSpan = span1;
 }

 // 6) resaltar el bloque contenedor
 const block = targetSpan.closest("p, td, tr, .pregunta-item");
 if (block) block.classList.add("highlight-paragraph");

 // 7) centrar con scrollIntoView (detecta el contenedor scrollable)
 targetSpan.scrollIntoView({ behavior: "smooth", block: "center" });

 // 8) limpiar tras 5s
 setTimeout(() => {
   targetSpan.classList.remove("highlight-comment");
   if (block) block.classList.remove("highlight-paragraph");
 }, 5000);
}


// Función auxiliar para escapar strings para regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const mapaGradoTexto = {
  "1": "Primero",
  "2": "Segundo",
  "3": "Tercero",
  "4": "Cuarto",
  "5": "Quinto",
  "6": "Sexto"
};


// Renderizar lecturas y comentarios asociados
const renderLecturas = () => {
  const contenedor = document.getElementById("contenedorLecturas");
  if (!contenedor) return;

  const user = auth.currentUser;
  const userId = user?.uid;
  let usuariosCache = new Map();
  let unidadesCache = new Map();

  const renderizarLecturasDesdeArray = async (lecturas) => {
    const fragment = document.createDocumentFragment();

    for (const data of lecturas) {
      const docId = data.id;
      if (data.archivado && !toggleVerArchivados) continue;
      if (!data.archivado && toggleVerArchivados) continue;

      if (data.userId && !usuariosCache.has(data.userId)) {
        try {
          const userSnap = await getDoc(doc(db, "users", data.userId));
          usuariosCache.set(data.userId, userSnap.exists() ? userSnap.data() : null);
        } catch (e) {
        }
      }
      const u = usuariosCache.get(data.userId);
      let autorNombre = "Autor desconocido";
      if (u) {
        autorNombre = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Autor desconocido";
      }

      let uUnidad = null;
      if (data.unidadId && !unidadesCache.has(data.unidadId)) {
        try {
          const unidadSnap = await getDoc(doc(db, "Unidades", data.unidadId));
          unidadesCache.set(data.unidadId, unidadSnap.exists() ? unidadSnap.data() : null);
        } catch (e) {
        }
      }
      uUnidad = unidadesCache.get(data.unidadId);
      const unidad = data.unidadData || {
        nivel: data.nivel || '',
        grado: data.grado || '',
        trimestre: data.trimestre || '',
        unidad: data.unidad || '',
        materia: data.materia || '',
        nombreUnidad: data.tema || data.unidad || ''
      };
      
      const nombreUnidad = unidad.nombreUnidad || unidad.unidad || '—';
      const materia = unidad.materia || '—';
      const nivel = unidad.nivel || '-';
      const grado = unidad.grado || '-';
      const trimestre = unidad.trimestre || '-';
      const numeroUnidad = unidad.unidad || '-';


      const likes = data.likes || [];
      const dislikes = data.dislikes || [];
      const likeActivo = userId ? likes.includes(userId) : false;
      const dislikeActivo = userId ? dislikes.includes(userId) : false;

      const item = document.createElement("div");
      item.className = "item-lectura";
      item.setAttribute("data-tilt", "");
      item.setAttribute("data-tilt-max", "18");
      item.setAttribute("data-tilt-speed", "400");
      item.setAttribute("data-tilt-glare", "true");
      item.setAttribute("data-tilt-max-glare", "0.3");

      item.dataset.id = data.id;
      item.dataset.nivel = String(unidad.nivel || '').toLowerCase();
      item.dataset.grado = String(unidad.grado || '').toLowerCase();
      item.dataset.trimestre = String(unidad.trimestre || '').toLowerCase();
      item.dataset.unidad = String(unidad.unidad || '').toLowerCase();
      item.dataset.coleccion = data.fromLecturasNuevas ? "lecturasNuevas" : "lecturas";


      let gradoTexto = mapaGradoTexto[String(unidad.grado)] || unidad.grado || '-';
      const clave = `${String(unidad.nivel)}_${gradoTexto}_${String(unidad.trimestre)}_${String(unidad.unidad)}`.toLowerCase();

      const bgImage = window.imagenesRelacionadasPorClave?.[clave];
      const bgImageSafe = safeUrl(bgImage, "");
      if (bgImageSafe) {
        item.style.backgroundImage = `url("${bgImageSafe}")`;
        item.style.backgroundSize = "cover";
        item.style.backgroundPosition = "center";
        item.style.backgroundRepeat = "no-repeat";
        item.style.color = "#fff";
        item.style.padding = "1rem";
        item.style.borderRadius = "10px";
        item.style.backdropFilter = "brightness(0.7)";
      }

      const previewTexto = stripHTML(localStorage.getItem(`lectura_${docId}`) || "").slice(0, 280);
      const autorNombreSafe = escapeHtml(autorNombre || "Autor desconocido");
      const nombreUnidadSafe = escapeHtml(nombreUnidad || "-");
      const materiaSafe = escapeHtml(materia || "-");
      const nivelSafe = escapeHtml(nivel || "-");
      const gradoSafe = escapeHtml(grado || "-");
      const trimestreSafe = escapeHtml(trimestre || "-");
      const numeroUnidadSafe = escapeHtml(numeroUnidad || "-");
      const previewTextoSafe = escapeHtml(previewTexto || "");

      item.innerHTML = `
        <div class="lectura-header" style="color: #fff; padding: 0.75rem; border-radius: 8px 8px 0 0;">
          <div><strong>${autorNombreSafe}</strong></div>
          <div style="font-size: smaller; margin-top: 0.3rem;">
            <strong>Tema:</strong> ${nombreUnidadSafe} &nbsp;|&nbsp;
          <strong>Materia:</strong> ${materiaSafe} &nbsp;|&nbsp;
          <strong>Nivel:</strong> ${nivelSafe} &nbsp;|&nbsp;
          <strong>Grado:</strong> ${gradoSafe} &nbsp;|&nbsp;
          <strong>Trimestre:</strong> ${trimestreSafe} &nbsp;|&nbsp;
          <strong>Unidad:</strong> ${numeroUnidadSafe}

          </div>
        </div>

        <div class="preview-lectura" style="font-size: smaller; margin: 0.75rem 0; padding: 0.5rem; border-radius: 6px; margin-top: 100px !important;">
          ${previewTextoSafe}...
        </div>

        <div class="acciones-lectura">
          <span class="contador-likes">${likes.length}</span>
          <i class='bx bx-check-circle aprobar-icon' data-id="${docId}" style="color: ${likeActivo ? '#06e106' : 'white'};"></i>
          <span class="contador-dislikes">${dislikes.length}</span>
          <i class='bx bx-x-circle rechazar-icon' data-id="${docId}" style="color: ${dislikeActivo ? '#ff0000' : 'white'};"></i>
          <i class='bx bx-expand-alt ver-lectura' data-id="${docId}"></i>
          <i class='bx bx-archive archivar-lectura' data-id="${docId}" title="${data.archivado ? 'Desarchivar' : 'Archivar'}" style="color: ${data.archivado ? 'dodgerblue' : 'white'};"></i>
        </div>
      `;
      fragment.appendChild(item);
    }

    contenedor.innerHTML = "";
    contenedor.appendChild(fragment);
    VanillaTilt.init(document.querySelectorAll(".item-lectura"));
    if (typeof aplicarFiltros === "function") aplicarFiltros();
  };

  const procesarSnapLecturas = async (snap) => {
    const lecturas = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const shareWith = data.sharewith || [];
      const esVisible = shareWith.includes("todos") || shareWith.includes(userId);
      if (!esVisible) continue;
  
      const texto = data.texto || data.contenidoHTML || "";
      const unidadData = data.unidadId
        ? (await getDoc(doc(db, "Unidades", data.unidadId))).data() || {}
        : {
            nivel: data.nivel || '',
            grado: data.grado || '',
            trimestre: data.trimestre || '',
            unidad: data.unidad || '',
            materia: data.materia || '',
            nombreUnidad: data.tema || data.unidad || ''
          };

  
      const lecturaConDatos = {
        id: docSnap.id,
        texto: texto,
        likes: data.likes || [],
        dislikes: data.dislikes || [],
        archivado: data.archivado || false,
        estatusLectura: data.estatusLectura || "Compartido",
        unidadId: data.unidadId || null,
        userId: data.userId || "",
        timestamp: data.timestamp || null,
        autorNombre: data.autorReferencia || "Autor desconocido",
        unidadData: unidadData
      };
  
      localStorage.setItem(`lectura_${docSnap.id}`, texto);
      lecturas.push(lecturaConDatos);
    }
    return lecturas;
  };
  

  let lecturasCombinadas = [];

  const unsub1 = onSnapshot(query(collection(db, "lecturas"), where("estatusLectura", "==", "Compartido")), async (snap1) => {
    const lecturas1 = await procesarSnapLecturas(snap1);
    const lecturas2 = JSON.parse(localStorage.getItem("cacheLecturasNuevas") || "[]");
    
    const mapaLecturas = new Map();
    [...lecturas1, ...lecturas2].forEach(l => mapaLecturas.set(l.id, l));
    lecturasCombinadas = Array.from(mapaLecturas.values());
    
    localStorage.setItem("lecturasCompartidas", JSON.stringify(lecturasCombinadas));
    renderizarLecturasDesdeArray(lecturasCombinadas);
  });

  const unsub2 = onSnapshot(query(collection(db, "lecturasNuevas"), where("estatusLectura", "==", "Compartido")), async (snap2) => {
    const lecturas2 = await procesarSnapLecturas(snap2);
    const lecturas1 = JSON.parse(localStorage.getItem("lecturasCompartidas") || "[]").filter(l => !l.fromLecturasNuevas);
    const lecturas2Marcadas = lecturas2.map(l => ({ ...l, fromLecturasNuevas: true }));
    
    const mapaLecturas = new Map();
    [...lecturas1, ...lecturas2Marcadas].forEach(l => mapaLecturas.set(l.id, l));
    lecturasCombinadas = Array.from(mapaLecturas.values());
    
    localStorage.setItem("cacheLecturasNuevas", JSON.stringify(lecturas2));
    localStorage.setItem("lecturasCompartidas", JSON.stringify(lecturasCombinadas));
    renderizarLecturasDesdeArray(lecturasCombinadas);
    
  });

  return () => {
    unsub1();
    unsub2();
  };
};

function appendLecturaModalImage(container, imageUrl = "") {
  const safeImageUrl = safeUrl(imageUrl, "");
  if (!container || !safeImageUrl) return;

  const imageBlock = document.createElement("div");
  imageBlock.style.backgroundImage = `url("${safeImageUrl}")`;
  imageBlock.style.backgroundPosition = "center";
  imageBlock.style.backgroundSize = "cover";
  imageBlock.style.backgroundRepeat = "no-repeat";
  imageBlock.style.width = "100%";
  imageBlock.style.height = "200px";
  imageBlock.style.margin = "1rem 0";
  imageBlock.style.borderRadius = "8px";
  container.appendChild(imageBlock);
}

function renderLecturaModalContent(container, rawHtml = "", imageUrl = "") {
  if (!container) return;
  container.replaceChildren();

  const sanitizedHtml = sanitizeRichText(rawHtml || "", { fallback: "<p></p>" });
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(sanitizedHtml, "text/html");
  const bloques = Array.from(htmlDoc.body.children);

  let insertedImage = false;
  bloques.forEach((block) => {
    const clone = block.cloneNode(true);
    const blockText = String(clone.textContent || "").toLowerCase();
    container.appendChild(clone);
    if (!insertedImage && (blockText.includes("análisis") || blockText.includes("competencia") || blockText.includes("estructura"))) {
      appendLecturaModalImage(container, imageUrl);
      insertedImage = true;
    }
  });
}





// Like, comentario, modal
const configurarEventos = () => {
  const contenedor = document.getElementById("contenedorPublicaciones");

  contenedor.addEventListener("click", async (e) => {
    const id = e.target.dataset.id;
    const user = auth.currentUser;
    if (!id || !user) return;
  
    const lecturaItem = e.target.closest(".item-lectura");
    const coleccion = lecturaItem?.dataset.coleccion || "lecturas";
    const docRef = doc(db, coleccion, id);
    
    // APROBAR
    if (e.target.classList.contains("aprobar-icon")) {
      const snap = await getDoc(docRef);
      const data = snap.data();
      const likes = data.likes || [];
      const dislikes = data.dislikes || [];
      const item = e.target.closest('.item-lectura');

      if (likes.includes(user.uid)) {
        // Quitar like
        await updateDoc(docRef, {
          likes: arrayRemove(user.uid)
        });
        // Actualizar UI
        e.target.style.color = "gray";
        item.querySelector('.contador-likes').textContent = likes.length - 1;
      } else {
        // Agregar like y quitar dislike si existe
        await updateDoc(docRef, {
          likes: arrayUnion(user.uid),
          dislikes: arrayRemove(user.uid)
        });
        // Actualizar UI
        e.target.style.color = "green";
        item.querySelector('.contador-likes').textContent = likes.length + 1;
        const rechazarIcon = item.querySelector('.rechazar-icon');
        if (rechazarIcon) {
          rechazarIcon.style.color = "gray";
          item.querySelector('.contador-dislikes').textContent = Math.max(0, dislikes.length - 1);
        }
      }
    }

    // RECHAZAR
    if (e.target.classList.contains("rechazar-icon")) {
      const snap = await getDoc(docRef);
      const data = snap.data();
      const likes = data.likes || [];
      const dislikes = data.dislikes || [];
      const item = e.target.closest('.item-lectura');

      if (dislikes.includes(user.uid)) {
        // Quitar dislike
        await updateDoc(docRef, {
          dislikes: arrayRemove(user.uid)
        });
        // Actualizar UI
        e.target.style.color = "gray";
        item.querySelector('.contador-dislikes').textContent = dislikes.length - 1;
      } else {
        // Agregar dislike y quitar like si existe
        await updateDoc(docRef, {
          dislikes: arrayUnion(user.uid),
          likes: arrayRemove(user.uid)
        });
        // Actualizar UI
        e.target.style.color = "ff0000";
        item.querySelector('.contador-dislikes').textContent = dislikes.length + 1;
        const aprobarIcon = item.querySelector('.aprobar-icon');
        if (aprobarIcon) {
          aprobarIcon.style.color = "gray";
          item.querySelector('.contador-likes').textContent = Math.max(0, likes.length - 1);
        }
      }
    }

    // ARCHIVAR LECTURA
    if (e.target.classList.contains("archivar-lectura")) {
      const icono = e.target;
      const item = icono.closest(".item-lectura");

      try {
        const docSnap = await getDoc(doc(db, "lecturas", id));
        const data = docSnap.data();
        const nuevoEstado = !data.archivado;

        const confirmado = confirm(nuevoEstado
          ? "¿Seguro que deseas archivar esta lectura?"
          : "¿Deseas desarchivar esta lectura?");

        if (!confirmado) return;

        await updateDoc(docRef, { archivado: nuevoEstado });

        // ✅ Actualizar color y tooltip del ícono sin quitar el item
        icono.style.color = nuevoEstado ? "dodgerblue" : "gray";
        icono.title = nuevoEstado ? "Desarchivar" : "Archivar";

        // Si estás mostrando solo no archivados y se acaba de archivar, quítalo
        if (!toggleVerArchivados && nuevoEstado) {
          item.remove();
        }

        // Si estás mostrando solo archivados y se desarchiva, quítalo también
        if (toggleVerArchivados && !nuevoEstado) {
          item.remove();
        }
      } catch (err) {
        alert("Ocurrió un error al archivar/desarchivar.");
      }
    }


    // Editar lectura (redirigir al contenidoUnidad)
    if (e.target.classList.contains("editar-lectura")) {
      const item = e.target.closest(".item-lectura");
      const lecturaId = item?.dataset.id;
      const lectura = lecturasCombinadas.find(l => l.id === lecturaId);
    
      if (lectura && lectura.unidadId) {
        window.location.href = `contenidoUnidad.html?unidadId=${lectura.unidadId}&userId=${user.uid}`;
      } else {
        alert("No se puede editar esta lectura porque no está vinculada a una unidad.");
      }
    }
    
    

    if (e.target.classList.contains("ver-lectura")) {
      const id = e.target.dataset.id;
      if (!id) return;
      if (window.unsubscribeComentarios) window.unsubscribeComentarios();
    
      lecturaIdActual = id;

      let snap = await getDoc(doc(db, "lecturas", id));
      if (snap.exists()) {
        coleccionLecturaActual = "lecturas";
      } else {
        snap = await getDoc(doc(db, "lecturasNuevas", id));
        if (snap.exists()) {
          coleccionLecturaActual = "lecturasNuevas";
        } else {
          alert("❌ La lectura no se encontró en ninguna colección.");
          return;
        }
      }
      
      let textoGuardado = localStorage.getItem(`lectura_${id}`) || "";
      let lecturaDoc = null;
      try {
        const snap1 = await getDoc(doc(db, "lecturas", id));
        lecturaDoc = snap1.exists() ? snap1.data() : (await getDoc(doc(db, "lecturasNuevas", id))).data();
        if (lecturaDoc.texto) {
          textoGuardado = lecturaDoc.texto;
          localStorage.setItem(`lectura_${id}`, textoGuardado);
        }
      } catch (err) {
      }
      if (!lecturaDoc) {
        alert("❌ La lectura no se encontró en Firestore.");
        return;
      }

      const unidadRaw = lecturaDoc.unidadData ?? {
        nivel: lecturaDoc.nivel, grado: lecturaDoc.grado,
        trimestre: lecturaDoc.trimestre, unidad: lecturaDoc.unidad
      };
      const gradoTexto = mapaGradoTexto[String(unidadRaw.grado)] || unidadRaw.grado || "-";
      const clave      = `${unidadRaw.nivel}_${gradoTexto}_${unidadRaw.trimestre}_${unidadRaw.unidad}`.toLowerCase();
      const urlImagen  = window.imagenesRelacionadasPorClave?.[clave];

      const contenedor = document.getElementById("modalTextoLectura");
      renderLecturaModalContent(contenedor, textoGuardado, urlImagen);

      agregarMarcadoresDePosicion(contenedor);
      document.getElementById("modalLectura").style.display = "flex";
      lecturaIdActual = id;
      window.unsubscribeComentarios = await renderComentarios(id);

      contenedor.style.maxHeight = "none";
      contenedor.style.overflow  = "visible";
    }
    
  


  });

  // Cerrar modal
  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("cerrar-modal") || e.target.id === "modalLectura") {
      document.getElementById("modalLectura").style.display = "none";
      
    }
    
  });

  document.getElementById("btnEditarLectura").addEventListener("click", () => {
    const contenido = document.getElementById("modalTextoLectura");
    contenido.contentEditable = "true";
    contenido.focus();
  
    document.getElementById("btnEditarLectura").style.display = "none";
    document.getElementById("btnGuardarLectura").style.display = "inline-block";
  });
  
  document.getElementById("btnGuardarLectura").addEventListener("click", async () => {
    const contenido = document.getElementById("modalTextoLectura");
    const nuevoTexto = sanitizeRichText(contenido.innerHTML.trim());
  
    if (lecturaIdActual && nuevoTexto) {
      try {
        const lecturaRef = doc(db, coleccionLecturaActual, lecturaIdActual);
        const snap = await getDoc(lecturaRef);
  
        if (!snap.exists()) {
          alert("⚠️ No se encontró la lectura para guardar. Puede haber sido eliminada.");
          return;
        }
  
        await updateDoc(lecturaRef, { texto: nuevoTexto });
        contenido.innerHTML = nuevoTexto;
  
        alert("Lectura actualizada correctamente.");
        contenido.contentEditable = "false";
        document.getElementById("btnEditarLectura").style.display = "inline-block";
        document.getElementById("btnGuardarLectura").style.display = "none";
  
      } catch (err) {
        alert("Hubo un error al guardar.");
      }
    }
  });
  
    

};


function agregarMarcadoresDePosicion(elemento) {
  // Limpiar marcadores existentes
  const existingMarkers = elemento.querySelectorAll('span[data-start-pos]');
  existingMarkers.forEach(marker => {
    marker.replaceWith(...marker.childNodes);
  });
  
  // Normalizar el contenido para combinar nodos de texto adyacentes
  elemento.normalize();
  
  // Usar TreeWalker para manejar nodos de texto
  const walker = document.createTreeWalker(
    elemento,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let currentPos = 0;
  let node;
  const nodesToWrap = [];
  
  // Identificar nodos que necesitan marcadores
  while (node = walker.nextNode()) {
    const nodeLength = node.nodeValue.length;
    
    if (nodeLength > 0) {
      nodesToWrap.push({
        node,
        start: currentPos,
        end: currentPos + nodeLength
      });
    }
    
    currentPos += nodeLength;
  }
  
  // Agregar marcadores a los nodos identificados
  nodesToWrap.forEach(({node, start, end}) => {
    const parent = node.parentNode;
    const wrapper = document.createElement('span');
    wrapper.dataset.startPos = start;
    wrapper.dataset.endPos = end;
    
    parent.insertBefore(wrapper, node);
    wrapper.appendChild(node);
  });
}


const configurarBuscador = () => {
  const input = document.getElementById("searchInput");
  const filtroNivel = document.getElementById("filtroNivel");
  const filtroGrado = document.getElementById("filtroGrado");
  const filtroTrimestre = document.getElementById("filtroTrimestre");
  const filtroUnidad = document.getElementById("filtroUnidad");

  [input, filtroNivel, filtroGrado, filtroTrimestre, filtroUnidad].forEach((el) => {
    if (el && typeof el.addEventListener === "function") {
      el.addEventListener("input", aplicarFiltros);
      el.addEventListener("change", aplicarFiltros); // importante para selects
    }
  });
};


function aplicarFiltros() {
  const input = document.getElementById("searchInput");
  const filtroNivel = document.getElementById("filtroNivel");
  const filtroGrado = document.getElementById("filtroGrado");
  const filtroTrimestre = document.getElementById("filtroTrimestre");
  const filtroUnidad = document.getElementById("filtroUnidad");

  const texto = input?.value.toLowerCase().trim() || "";
  const nivel = filtroNivel?.value.toLowerCase() || "";
  const grado = filtroGrado?.value.toLowerCase() || "";
  const trimestre = filtroTrimestre?.value.toLowerCase() || "";
  const unidad = filtroUnidad?.value.toLowerCase() || "";

  const contenedores = [
    document.getElementById("contenedorLecturas"),
    document.getElementById("contenedorImagenesCompartidas")
  ].filter(Boolean);

  let hayResultados = false;

  contenedores.forEach(contenedor => {
    const tarjetas = contenedor.querySelectorAll(".item-lectura, .item-imagen");

    tarjetas.forEach((t) => {
      const visible =
        (texto === "" || t.innerText.toLowerCase().includes(texto)) &&
        (nivel === "" || t.dataset.nivel === nivel) &&
        (grado === "" || t.dataset.grado === grado) &&
        (trimestre === "" || t.dataset.trimestre === trimestre) &&
        (unidad === "" || t.dataset.unidad === unidad);

        t.style.display = visible ? (t.classList.contains("item-imagen") ? "flex" : "block") : "none";
        if (visible) hayResultados = true;
    });
  });

  // Mostrar u ocultar mensaje
  let msg = document.getElementById("no-results-msg");
  if (!hayResultados && texto) {
    if (!msg) {
      msg = document.createElement("p");
      msg.id = "no-results-msg";
      msg.textContent = "No se encontraron resultados.";
      document.querySelector("main").appendChild(msg);
    }
  } else if (msg) {
    msg.remove();
  }
}


document.addEventListener("DOMContentLoaded", () => {
  $('.selectpicker').selectpicker();
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
  


  
  await renderImagenesCompartidas(); // 🔁 Carga imágenes y guarda en localStorage

  // 🔐 Crear mapa global de imágenes relacionadas por clave nivel_grado_trimestre_unidad
  const imagenesCache = JSON.parse(localStorage.getItem("imagenesCompartidas") || "[]");
  window.imagenesRelacionadasPorClave = {};
  
  imagenesCache.forEach(img => {
    const clave = `${img.nivel}_${img.grado}_${img.trimestre}_${img.unidad}`.toLowerCase();
    if (!window.imagenesRelacionadasPorClave[clave]) {
      window.imagenesRelacionadasPorClave[clave] = img.url; // usa la primera imagen encontrada
    }
  });
  
  await renderLecturas(); // ✅ Ahora ya tiene acceso al mapa de imágenes
  
  configurarEventos();
  configurarBuscador();
  

  // Ejecutar los filtros después de que se cargan lecturas e imágenes
  setTimeout(() => {
    if (typeof aplicarFiltros === "function") aplicarFiltros();
  }, 1000);

// Configurar el botón flotante de comentarios
const toggleBtn = document.getElementById('toggleComentariosBtn');
if (toggleBtn) {
  const panelComentarios = document.getElementById('panelComentarios');
  const editorHome = document.querySelector('.modal-editor-home');
  
  if (panelComentarios && editorHome) {
    // Estado inicial (panel visible)
    let panelVisible = true;
    
    toggleBtn.addEventListener('click', () => {
      panelVisible = !panelVisible;
      
      if (panelVisible) {
        // Mostrar panel
        panelComentarios.classList.remove('panel-oculto');
        editorHome.classList.remove('editor-completo');
        toggleBtn.innerHTML = '<i class="bx bx-comment"></i>';
      } else {
        // Ocultar panel
        panelComentarios.classList.add('panel-oculto');
        editorHome.classList.add('editor-completo');
        toggleBtn.innerHTML = '<i class="bx bx-comment-dots"></i>';
      }
    });
  }
}

// Mostrar cuadro de texto para comentar
const comentarBtn = document.getElementById('comentarBtn');
const comentariosLista = document.getElementById('comentarios-lista');
let selectedText = "";

// Detectar selección de texto
document.getElementById("modalTextoLectura").addEventListener('mouseup', () => {
  const selection = window.getSelection().toString().trim();
  if (selection) {
    selectedText = selection;
    comentarBtn.style.display = 'inline-block'; // Mostrar el botón de comentar
  } else {
    comentarBtn.style.display = 'none'; // Ocultar el botón si no hay selección
  }
});



document.getElementById("toggleArchivadosBtn")?.addEventListener("click", () => {
  toggleVerArchivados = !toggleVerArchivados;
  document.getElementById("toggleArchivadosBtn").innerHTML = toggleVerArchivados
    ? `<i class='bx bx-box'></i> Ocultar archivados`
    : `<i class='bx bx-box'></i> Mostrar archivados`;

  renderLecturas();
  renderImagenesCompartidas();
});


document.addEventListener('DOMContentLoaded', function () {

  const comentarBtn = document.getElementById('comentarBtn');
  const modalComentario = document.getElementById('modalComentario');
  const cerrarModal = modalComentario.querySelector(".cerrar-modal");
  const guardarComentarioBtn = document.getElementById("guardarComentarioBtn");
  const inputComentario = document.getElementById("inputComentario");

  // Variable global para almacenar el texto seleccionado
  let selectedText = "";

  // Detectar selección de texto
  document.getElementById("modalTextoLectura").addEventListener('mouseup', () => {
    selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      comentarBtn.style.display = 'inline-block'; // Mostrar el botón de comentar
    } else {
      comentarBtn.style.display = 'none'; // Ocultar el botón si no hay selección
    }
  });

  // Cuando se hace clic en el botón "Comentar"
  comentarBtn.addEventListener('click', () => {
    modalComentario.style.display = 'flex'; // Mostrar el modal
  });

  // Cerrar el modal cuando se hace clic en la 'X'
  cerrarModal.addEventListener("click", () => {
    modalComentario.style.display = "none"; // Ocultar el modal de comentario
  });

  // Cerrar el modal si el usuario hace clic fuera del área del modal
  window.addEventListener('click', (event) => {
    if (event.target === modalComentario) {
      modalComentario.style.display = "none"; // Ocultar el modal si se hace clic fuera
    }
  });

  // Guardar el comentario cuando se presiona el botón "Guardar Comentario"
  guardarComentarioBtn.addEventListener("click", async () => {
    const comentario = inputComentario.value.trim();
    if (comentario && selectedText) {
      await agregarComentario(selectedText, comentario);
      modalComentario.style.display = "none"; // Cerrar el modal después de guardar
    }
  });
});

// Función para agregar comentario a la base de datos y mostrarlo
async function agregarComentario(seccion, comentario) {
  if (!lecturaIdActual || !comentario.trim()) return;

  try {
    // Obtener la selección actual
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    
    // Calcula posición absoluta sumando longitud de cada nodo de texto
    const editor = document.getElementById("modalTextoLectura");
    let charIndex = 0;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node === range.startContainer) {
        charIndex += range.startOffset;
        break;
      }
      charIndex += node.textContent.length;
    }
    
    const posicion = charIndex;
    const longitud = range.toString().length;
    


    // Guardar el comentario en Firestore
    const comentarioRef = collection(db, "comentarios");
    const comentarioData = {
      lecturaId: lecturaIdActual,
      uid: auth.currentUser?.uid || "",
      seccion: seccion,
      comentario: sanitizeTextInput(comentario, {maxLength: 3000, preserveNewlines: true}),
      autor: currentUserName,
      fecha: new Date(),
      posicion: posicion,
      longitud: longitud,
      seleccionadoPor: [] // Inicializar como array vacío
    };

    await addDoc(comentarioRef, comentarioData);
    await renderComentarios(lecturaIdActual);

    // Limpiar el input si existe
    if (document.getElementById("inputComentario")) {
      document.getElementById("inputComentario").value = "";
    }
  } catch (error) {
  }
}

  
// Lógica para manejar la acción de "comentar" y mostrar el modal
comentarBtn.addEventListener("click", () => {
  const commentModal = document.createElement('div');
  commentModal.classList.add('comment-modal');

  // Verificar si el modal de comentario ya está creado
  if (document.querySelector('.comment-modal')) {
    return; // Si el modal ya está en el DOM, no lo crees de nuevo
  }

  // Crear el cuadro de texto para ingresar el comentario
  const textArea = document.createElement('textarea');
  textArea.placeholder = "Escribe tu comentario sobre la selección...";
  textArea.style.width = "100%";
  textArea.style.height = "100px";

  const saveButton = document.createElement('button');
  saveButton.textContent = "Guardar comentario";

  saveButton.addEventListener('click', () => {
    const comentario = textArea.value.trim();
    if (comentario) {
      agregarComentario(selectedText, comentario);
      commentModal.remove(); // Cerrar modal de comentario
    }
  });

  commentModal.appendChild(textArea);
  commentModal.appendChild(saveButton);

  document.body.appendChild(commentModal);
});

  

// Función para manejar el botón flotante de comentarios
function configurarBotonComentarios() {
  const toggleBtn = document.getElementById('toggleComentariosBtn');
  const panelComentarios = document.getElementById('panelComentarios');
  const editorHome = document.querySelector('.modal-editor-home');
  
  // Estado inicial (panel visible)
  let panelVisible = true;
  
  toggleBtn.addEventListener('click', () => {
    panelVisible = !panelVisible;
    
    if (panelVisible) {
      // Mostrar panel
      panelComentarios.classList.remove('panel-oculto');
      editorHome.classList.remove('editor-completo');
      toggleBtn.innerHTML = '<i class="bx bx-comment"></i>';
    } else {
      // Ocultar panel
      panelComentarios.classList.add('panel-oculto');
      editorHome.classList.add('editor-completo');
      toggleBtn.innerHTML = '<i class="bx bx-comment-dots"></i>';
    }
  });
}

// Llamar a la función cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', configurarBotonComentarios);



function convertirNodo(nodo) {
  if (nodo.nodeType === 3) return nodo.textContent;

  const tag = nodo.tagName?.toLowerCase();
  const contenido = Array.from(nodo.childNodes).map(convertirNodo).join("");

  const paraStyle = nodo.getAttribute?.("data-parastyle");
  const charStyle = nodo.getAttribute?.("data-charstyle");


  // 👉 Detectar .spec para estilo de párrafo SPEC
  if (tag === 'div' && nodo.classList?.contains('spec')) {
      return `<ParaStyle:SPEC>${contenido}\r`;
  }


  // Aplicar estilo de carácter si existe
  if (charStyle) {
      return `<CharStyle:${charStyle}>${contenido}<CharStyle:>`;
  }

  // Aplicar estilo de párrafo si existe
  if (paraStyle) {
      return `<ParaStyle:${paraStyle}>${contenido}\r`;
  }

  switch (tag) {
      case 'h1':
          return `<ParaStyle:TITULO>${contenido}\r`;

      case 'h2':
          return `<ParaStyle:SUBTITULO>${contenido}\r`;

      case 'p': {
          const texto = nodo.textContent.trim();
          const esInstruccion = /^instrucciones[:：]/i.test(texto);
          const estilo = esInstruccion ? 'INSTRUCCION' : 'TEXTO';
          return `<ParaStyle:${estilo}>${contenido}\r`;
      }

      case 'ul':
      case 'ol':
          return contenido; // Listas procesan sus <li>

      case 'li': {
          const parent = nodo.parentElement;
          const parentTag = parent?.tagName?.toLowerCase();
          const abuelo = parent?.parentElement;
          const esAnidada = abuelo && (abuelo.tagName?.toLowerCase() === 'ul' || abuelo.tagName?.toLowerCase() === 'ol');
          
          let estilo = "TEXTO"; // Estilo por defecto
      
          if (parentTag === 'ol' && parent?.type === '1') {
              estilo = "INSTRUCCION"; // Lista numerada (1, 2, 3...)
          } else if (parentTag === 'ol' && parent?.type === 'a') {
              estilo = "SUBINSTRUCCION"; // Lista con letras (a, b, c...)
          } else if (parentTag === 'ul' || esAnidada) {
              estilo = "SUBINSTRUCCION NIVEL 2"; // Viñetas o listas dentro de otras
          }
      
          return `<ParaStyle:${estilo}>${contenido}\r`;
      }
          
      case 'strong':
      case 'b':
          return `<CharStyle:BOLD>${contenido}<CharStyle:>`;

      case 'em':
      case 'i':
          return `<CharStyle:ITALIC>${contenido}<CharStyle:>`;

      case 'td':
          return `${contenido}\t`;

      case 'tr':
          return `${contenido}\r`;

      default:
          // Por defecto, aplicar estilo TEXTO
          return `<ParaStyle:TEXTO>${contenido}\r`;
  }
}



function normalizarCaracteresCorruptos(texto) {
  const mapa = {
      "Ã¡": "á", "Ã©": "é", "Ã­": "í", "Ã³": "ó", "Ãº": "ú",
      "Ã±": "ñ", "Ã": "Á", "Ã‰": "É", "Ã": "Í", "Ã“": "Ó", "Ãš": "Ú",
      "â€œ": "“", "â€": "”", "â€˜": "‘", "â€™": "’",
      "â€“": "–", "â€”": "—", "â€¦": "…", "Â¡": "¡", "Â¿": "¿",
      "Ã¼": "ü", "Ãœ": "Ü"
  };

  return texto.replace(/Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±|Ã|Ã‰|Ã|Ã“|Ãš|â€œ|â€|â€˜|â€™|â€“|â€”|â€¦|Â¡|Â¿|Ã¼|Ãœ/g, match => mapa[match] || match);
}




function verificarContenidoAntesExportar() {
  const contenido = $('#textoLectura').trumbowyg('html');
  const divPrueba = document.createElement("div");
  divPrueba.innerHTML = contenido;
  
  // Verificar acentos
  const tieneAcentos = /[áéíóúÁÉÍÓÚñÑ]/.test(contenido);
  
  // Verificar estilos
  const tieneEstiloTexto = /<ParaStyle:TEXTO>/.test(convertirNodo(divPrueba));
  
  return { tieneAcentos, tieneEstiloTexto };
}



function eliminarEmojis(texto) {
  // Elimina caracteres emoji (símbolos, pictogramas, etc.)
  return texto.replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
}

// Modificar la función de exportación para incluir la verificación
function exportarLecturaComoTaggedText() {
  const contenidoHTML = $('#textoLectura').trumbowyg('html');
  if (!contenidoHTML || contenidoHTML.trim() === "") {
      alert("No hay contenido para exportar.");
      return;
  }

  const div = document.createElement("div");
  div.innerHTML = contenidoHTML;

  let taggedText = "<ASCII-MAC>\r" + eliminarEmojis(convertirNodo(div));

  // Corrige caracteres corruptos tipo "Ã¡"
  taggedText = normalizarCaracteresCorruptos(taggedText);

  // Reemplazar saltos de línea por estilo Mac
  taggedText = taggedText.replace(/\r?\n|\n/g, '\r');

  // Convertir texto a Latin1 de forma segura
  const latin1Text = unescape(encodeURIComponent(taggedText)); // convierte a ISO-8859-1

  // Crear data URL forzado a Latin1 para simular descarga
  const blob = new Blob([latin1Text], { type: "text/plain;charset=iso-8859-1" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "lectura_exportada.txt";
  a.click();

  URL.revokeObjectURL(url);
}

window.exportarLecturaComoTaggedText = exportarLecturaComoTaggedText;



document.getElementById("exportarModalInDesignBtn").addEventListener("click", () => {
  const contenidoHTML = document.getElementById("modalTextoLectura").innerHTML;

  if (!contenidoHTML || contenidoHTML.trim() === "") {
    alert("No hay contenido para exportar.");
    return;
  }

  const div = document.createElement("div");
  div.innerHTML = contenidoHTML;

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


function stripHTML(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
  }




  async function renderImagenesCompartidas() {
    const contenedor = document.getElementById("contenedorImagenesCompartidas");
    if (!contenedor) return;
  
    contenedor.innerHTML = ""; // Limpia antes de renderizar
  
    const user = auth.currentUser;
    let usuariosCache = new Map();
  
    const mapaGradoTexto = {
      "1": "Primero",
      "2": "Segundo",
      "3": "Tercero",
      "4": "Cuarto",
      "5": "Quinto",
      "6": "Sexto"
    };
  
    // 🧠 Intentar cargar desde localStorage
    const cache = localStorage.getItem("imagenesCompartidas");
    if (cache) {
      try {
        const imgsCacheadas = JSON.parse(cache);
        window.imagenesRelacionadasPorClave = {};
        imgsCacheadas.forEach(img => {
          const gradoTexto = mapaGradoTexto[String(img.grado)] || img.grado;
          const clave = `${img.nivel}_${gradoTexto}_${img.trimestre}_${img.unidad}`.toLowerCase();
          window.imagenesRelacionadasPorClave[clave] = img.url;
        });
        await renderDesdeArray(imgsCacheadas);
      } catch (err) {
      }
    }
  
    // 🔁 Escucha cambios en tiempo real
    const q = query(collection(db, "imagenesCompartidas"), where("share", "==", true));
    onSnapshot(q, async (snap) => {
      const imagenes = [];
      const seenImages = new Set();
      window.imagenesRelacionadasPorClave = {}; // Reinicia antes de actualizar
  
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        const dedupeKey = `${String(data.uid || "")}::${String(data.nombre || id)}`;
        if (seenImages.has(dedupeKey)) return;
        seenImages.add(dedupeKey);
        const gradoTexto = mapaGradoTexto[String(data.grado)] || data.grado;
  
        const clave = `${data.nivel}_${gradoTexto}_${data.trimestre}_${data.unidad}`.toLowerCase();
        window.imagenesRelacionadasPorClave[clave] = data.url;
  
        imagenes.push({
          id,
          nombre: data.nombre,
          url: data.url,
          uid: data.uid,
          nivel: data.nivel,
          grado: data.grado,
          trimestre: data.trimestre,
          unidad: data.unidad,
          share: data.share,
          archivado: data.archivado || false
        });
      });
  
      localStorage.setItem("imagenesCompartidas", JSON.stringify(imagenes));
      await renderDesdeArray(imagenes);
    });
  }
    
  

  export async function renderDesdeArray(imagenes) {
    const contenedor = document.getElementById("contenedorImagenesCompartidas");
    if (!contenedor) return;
  
    const fragment = document.createDocumentFragment();
    window.imagenesRelacionadasPorClave = {}; // 🔄 Reiniciar índice
  
    
  
    for (const data of imagenes) {
      if (!data.share) continue;
    
      const clave = `${data.nivel}_${data.grado}_${data.trimestre}_${data.unidad}`.toLowerCase(); // 👈 ESTA LÍNEA FALTABA
    
      if (!window.imagenesRelacionadasPorClave[clave]) {
        window.imagenesRelacionadasPorClave[clave] = data.url;
      }
    
    

      
      if (!window.imagenesRelacionadasPorClave[clave]) {
        window.imagenesRelacionadasPorClave[clave] = data.url;
      }
      
      if (!toggleVerArchivados && data.archivado) continue;
      if (toggleVerArchivados && !data.archivado) continue;
  
      let autorNombre = "Autor desconocido";
      if (data.uid && !usuariosCache.has(data.uid)) {
        try {
          const userSnap = await getDoc(doc(db, "users", data.uid));
          usuariosCache.set(data.uid, userSnap.exists() ? userSnap.data() : null);
        } catch (err) {
        }
      }
  
      const u = usuariosCache.get(data.uid);
      if (u) autorNombre = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || data.uid;
      const autorNombreSafe = escapeHtml(autorNombre || "Autor desconocido");
      const nivelSafe = escapeHtml(data.nivel || "-");
      const gradoSafe = escapeHtml(data.grado || "-");
      const trimestreSafe = escapeHtml(data.trimestre || "-");
      const unidadSafe = escapeHtml(data.unidad || "-");
      const nombreSafe = escapeHtml(data.nombre || "imagen");
      const imageUrlSafe = safeUrl(data.url, "#");
  
      const item = document.createElement("div");
      item.className = "item-imagen";
      item.dataset.nivel = (data.nivel || "").toLowerCase();
      item.dataset.grado = (data.grado || "").toLowerCase();
      item.dataset.trimestre = (data.trimestre || "").toLowerCase();
      item.dataset.unidad = (data.unidad || "").toLowerCase();

  
      item.innerHTML = `
        <div class="imagen-tarjeta">
          <div class="imagen-preview">
            <img src="${imageUrlSafe}" alt="${nombreSafe}" />
          </div>
          <div class="info-preview" style="flex: 1; color: #222;">
            <div style="font-weight: bold; margin-bottom: 0.5rem; font-size: 1rem;">Autor: ${autorNombreSafe}</div>
            <div style="margin-bottom: 0.4rem;">
              <strong>Nivel:</strong> ${nivelSafe} &nbsp;|&nbsp;
              <strong>Grado:</strong> ${gradoSafe} &nbsp;|&nbsp;
              <strong>Trimestre:</strong> ${trimestreSafe} &nbsp;|&nbsp;
              <strong>Unidad:</strong> ${unidadSafe}
            </div>
            <div class="acciones-lectura" style="margin-top: 0.5rem;">
              <a href="${imageUrlSafe}" target="_blank" rel="noopener noreferrer" title="Ver imagen">
                <i class='bx bx-image-alt' style="font-size: 24px; margin-right: 12px;"></i>
              </a>
              <a href="${imageUrlSafe}" download="${nombreSafe}.png" rel="noopener noreferrer" title="Descargar imagen">
                <i class='bx bx-download' style="font-size: 24px;"></i>
              </a>
              <i class='bx bx-archive archivar-imagen' 
                data-id="${data.id}"
                title="Archivar imagen"
                style="font-size: 24px; margin-left: 12px; color: gray; cursor: pointer;"></i>
            </div>
          </div>
        </div>
      `;

      item.querySelector(".archivar-imagen")?.addEventListener("click", async () => {
        const nuevoEstado = !data.archivado;
        const confirmado = confirm(nuevoEstado
          ? "¿Archivar esta imagen?"
          : "¿Desarchivar esta imagen?");
        if (!confirmado) return;
        try {
          await updateDoc(doc(db, "imagenesCompartidas", data.id), {
            archivado: nuevoEstado
          });
          item.remove(); // quitar del DOM
        } catch (err) {
        }
      });

    fragment.appendChild(item);
  }

  contenedor.innerHTML = "";
  contenedor.appendChild(fragment);
  aplicarFiltros?.();
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleIlustracionesBtn = document.getElementById("toggleIlustracionesBtn");
  const contenedorImagenes = document.getElementById("contenedorImagenes");

  if (!toggleIlustracionesBtn || !contenedorImagenes) {
    return;
  }

  let mostrandoIlustraciones = false;

  toggleIlustracionesBtn.addEventListener("click", () => {
    mostrandoIlustraciones = !mostrandoIlustraciones; // ✅ esto cambia el estado
    contenedorImagenes.style.display = mostrandoIlustraciones ? "block" : "none";
    toggleIlustracionesBtn.innerHTML = mostrandoIlustraciones
      ? `<i class='bx bx-image'></i> Ocultar ilustraciones`
      : `<i class='bx bx-image'></i> Mostrar ilustraciones`;
  });
});



// El modal se muestra solo si la versión guardada en localStorage es distinta a la versión actual.
// Cuando quieras mostrar un nuevo modal en el futuro, solo cambia VERSION_ACTUAL_UPDATES a "v2.1.1", "v3.0", etc.
function mostrarModalUpdates(version = "v2.0.0") {
  const yaVisto = localStorage.getItem("updates_visto");

  if (yaVisto !== version) {
    const modal = document.getElementById("modalUpdates");
    const cerrarBtn = document.getElementById("cerrarUpdates");
    const entendidoBtn = document.getElementById("btnCerrarUpdates");

    if (!modal || !cerrarBtn || !entendidoBtn) return;

    modal.style.display = "flex";

    const cerrar = () => {
      modal.style.display = "none";
      localStorage.setItem("updates_visto", version);
    };

    cerrarBtn.addEventListener("click", cerrar);
    entendidoBtn.addEventListener("click", cerrar);
  }
}

mostrarModalUpdates("v2.0.0");
