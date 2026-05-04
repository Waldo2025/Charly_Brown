import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, doc,
  updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot,
  orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { firebaseWebConfig, assertFirebaseWebConfig } from "./firebase-web-config.js?v=2026-1.0.0.59";
import { escapeHtml, safeUrl, sanitizeRichText, sanitizeTextInput } from "./security-utils.js?v=2026-1.0.0.59";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js?v=2026-1.0.0.59";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { authFetchJson } from "./api-client.js";
import { PodcasterPlaybackController } from "./podcaster-playback-controller.js";

const app = initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
void bootstrapFirebaseAppCheck(app);
const db = getFirestore(app);
const auth = getAuth(app);


onAuthStateChanged(auth, async (user) => {
  if (user) {
    await verificarRolUsuario(user);
    
    // Obtener nombre real del usuario
    obtenerNombreUsuarioActual(user).then(name => {
      currentUserName = name;
      console.log("[Dashboard] Usuario identificado:", currentUserName);
    });

    // — Logic moved to sidebar.js —
    configurarEventos();
    configurarBuscador();
    configurarBusquedaWorkbench();
    initDashboardNavigation();

    await loadUserLecturas();
    await loadUserAprende();
    await renderImagenesCompartidas();
    await loadUserStats();

    // Finalización de carga - Ocultar splash screen
    const loader = document.getElementById("appLoadingScreen");
    if (loader) {
      setTimeout(() => loader.classList.add("is-hidden"), 300);
    }
  } else {
    window.location.href = "login.html";
  }
});

// Safety timeout para quitar el loader si algo falla
setTimeout(() => {
  const loader = document.getElementById("appLoadingScreen");
  if (loader && !loader.classList.contains("is-hidden")) {
    loader.classList.add("is-hidden");
  }
}, 5000);

// Función para notificar actividad al Studio (podcaster.js)
async function notifyActivity(action = "", sceneIndex = -1) {
  if (!currentMultimediaSession || !currentMultimediaSession.id) {
    console.log("[Dashboard] No hay sesión activa para notificar actividad.");
    return;
  }
  try {
    console.log("[Dashboard] Notificando actividad:", { action, sceneIndex, user: currentUserName });
    const sessionRef = doc(db, "podcaster_sessions", currentMultimediaSession.id);
    await updateDoc(sessionRef, {
      recentActivity: {
        userName: currentUserName,
        action: action,
        sceneIndex: (sceneIndex !== null && sceneIndex !== undefined) ? Number(sceneIndex) : -1,
        timestamp: Date.now()
      }
    });
    console.log("[Dashboard] Actividad notificada con éxito.");
  } catch (err) {
    console.warn("[Dashboard] Error al notificar actividad:", err);
  }
}

// Mueve esta línea al inicio para que sea global
let currentUserRole = "editor";

let coleccionLecturaActual = "lecturas";
const COLECCION_UNIDADES = "unidadesGeneradas";
const COLECCION_DOWNLOADS = "wordDownloads";


// Función para verificar el rol del usuario en Firestore
const verificarRolUsuario = async (user) => {
  if (user) {
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      currentUserRole = userData.role || userData.rol || userData.userRole || "editor"; // Asignar "editor" por defecto
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
      const nuevoTexto = sanitizeTextInput(e.target.textContent || "", { maxLength: 3000, preserveNewlines: true });
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
      comentario: sanitizeTextInput(nuevoTexto, { maxLength: 3000, preserveNewlines: true }),
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
    const idx = full.indexOf(texto);
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
      startNode = node;
      startOffset = posicion - charIndex;
    }
    if (startNode && endPos <= nextIndex) {
      endNode = node;
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
      mid = txt.slice(startOffset, endOffset),
      after = txt.slice(endOffset);
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
  // Usar global: usuariosCache
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
      item.className = "item-lectura card";
      item.dataset.id = data.id;

      let gradoTexto = mapaGradoTexto[String(unidad.grado)] || unidad.grado || '-';
      const clave = `${String(unidad.nivel)}_${gradoTexto}_${String(unidad.trimestre)}_${String(unidad.unidad)}`.toLowerCase();
      const bgImage = window.imagenesRelacionadasPorClave?.[clave];
      const bgImageSafe = safeUrl(bgImage, "");

      const previewTexto = stripHTML(localStorage.getItem(`lectura_${docId}`) || "").slice(0, 80);
      const autorNombreSafe = escapeHtml(autorNombre || "Autor desconocido");
      const nombreUnidadSafe = escapeHtml(nombreUnidad || "-");
      const materiaSafe = escapeHtml(materia || "-");
      const nivelSafe = escapeHtml(nivel || "-");
      const gradoSafe = escapeHtml(grado || "-");
      const previewTextoSafe = escapeHtml(previewTexto || "");

      item.innerHTML = `
        ${bgImageSafe ? `
        <div class="card-image" style="background-image: url('${bgImageSafe}');"></div>
        ` : ''}
        
        <header class="card-header" style="box-shadow: none; border-bottom: 1px solid #f5f5f5;">
          <div class="card-header-title" style="flex-direction: column; align-items: flex-start; padding: 1rem;">
            <span class="is-size-7 has-text-grey-light is-uppercase" style="letter-spacing: 0.5px;">Autor: ${autorNombreSafe}</span>
            <span class="is-size-6 has-text-weight-bold card-title-clamp" style="margin-top: 2px;">${nombreUnidadSafe}</span>
          </div>
        </header>

        <div class="card-content" style="padding: 0.75rem;">
          <div class="tag-container" style="margin-top: 0;">
            <span class="tag is-level is-small">${nivelSafe}</span>
            <span class="tag is-grade is-small">${gradoSafe}º</span>
            <span class="tag is-matter is-small">${materiaSafe}</span>
          </div>
        </div>

        <footer class="card-footer">
          <a href="#" class="card-footer-item aprobar-icon ${likeActivo ? 'is-active' : ''}" data-id="${docId}" title="Aprobar">
            <span class="icon is-small mr-1"><i class='bx bx-check-circle'></i></span>
            <small class="contador-likes">${likes.length}</small>
          </a>
          <a href="#" class="card-footer-item rechazar-icon ${dislikeActivo ? 'is-rejected' : ''}" data-id="${docId}" title="Rechazar">
            <span class="icon is-small mr-1"><i class='bx bx-x-circle'></i></span>
            <small class="contador-dislikes">${dislikes.length}</small>
          </a>
          <a href="#" class="card-footer-item ver-lectura" data-id="${docId}" title="Ver detalles">
            <span class="icon"><i class='bx bx-expand-alt'></i></span>
          </a>
          <a href="#" class="card-footer-item archivar-lectura ${data.archivado ? 'is-active' : ''}" data-id="${docId}" title="${data.archivado ? 'Desarchivar' : 'Archivar'}">
            <span class="icon"><i class='bx bx-archive'></i></span>
          </a>
        </footer>
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

  const unsub1 = onSnapshot(query(collection(db, "lecturas"), where("estatusLectura", "==", "Compartido"), where("publicar", "==", true)), async (snap1) => {
    const lecturas1 = await procesarSnapLecturas(snap1);
    const lecturas2 = JSON.parse(localStorage.getItem("cacheLecturasNuevas") || "[]");

    const mapaLecturas = new Map();
    [...lecturas1, ...lecturas2].forEach(l => mapaLecturas.set(l.id, l));
    lecturasCombinadas = Array.from(mapaLecturas.values());

    localStorage.setItem("lecturasCompartidas", JSON.stringify(lecturasCombinadas));
    renderizarLecturasDesdeArray(lecturasCombinadas);
  });

  const unsub2 = onSnapshot(query(collection(db, "lecturasNuevas"), where("estatusLectura", "==", "Compartido"), where("publicar", "==", true)), async (snap2) => {
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
  document.addEventListener("click", async (e) => {
    // Solo proceder si el click es dentro de un contenedor relevante o tiene una clase de acción
    const btnAction = e.target.closest(".ver-lectura, .aprobar-icon, .rechazar-icon, .archivar-lectura");
    if (!btnAction) return;

    const id = btnAction.dataset.id;
    const user = auth.currentUser;
    if (!id || !user) return;

    const lecturaItem = e.target.closest(".item-lectura");
    const coleccion = lecturaItem?.dataset.coleccion || "lecturas";
    const docRef = doc(db, coleccion, id);

    // APROBAR
    const btnAprobar = e.target.closest(".aprobar-icon");
    if (btnAprobar) {
      const snap = await getDoc(docRef);
      const data = snap.data();
      const likes = data.likes || [];
      const dislikes = data.dislikes || [];
      const item = btnAprobar.closest('.item-lectura');

      if (likes.includes(user.uid)) {
        await updateDoc(docRef, { likes: arrayRemove(user.uid) });
        btnAprobar.classList.remove("is-active");
        item.querySelector('.contador-likes').textContent = likes.length - 1;
      } else {
        await updateDoc(docRef, {
          likes: arrayUnion(user.uid),
          dislikes: arrayRemove(user.uid)
        });
        btnAprobar.classList.add("is-active");
        item.querySelector('.contador-likes').textContent = likes.length + 1;
        const rechazarIcon = item.querySelector('.rechazar-icon');
        if (rechazarIcon) {
          rechazarIcon.classList.remove("is-rejected");
          item.querySelector('.contador-dislikes').textContent = Math.max(0, dislikes.length - 1);
        }
      }
    }

    const btnRechazar = e.target.closest(".rechazar-icon");
    if (btnRechazar) {
      const snap = await getDoc(docRef);
      const data = snap.data();
      const likes = data.likes || [];
      const dislikes = data.dislikes || [];
      const item = btnRechazar.closest('.item-lectura');

      if (dislikes.includes(user.uid)) {
        await updateDoc(docRef, { dislikes: arrayRemove(user.uid) });
        btnRechazar.classList.remove("is-rejected");
        item.querySelector('.contador-dislikes').textContent = dislikes.length - 1;
      } else {
        await updateDoc(docRef, {
          dislikes: arrayUnion(user.uid),
          likes: arrayRemove(user.uid)
        });
        btnRechazar.classList.add("is-rejected");
        item.querySelector('.contador-dislikes').textContent = dislikes.length + 1;
        const aprobarIcon = item.querySelector('.aprobar-icon');
        if (aprobarIcon) {
          aprobarIcon.classList.remove("is-active");
          item.querySelector('.contador-likes').textContent = Math.max(0, likes.length - 1);
        }
      }
    }

    // ARCHIVAR LECTURA
    const btnArchivar = e.target.closest(".archivar-lectura");
    if (btnArchivar) {
      const icono = btnArchivar;
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
        icono.classList.toggle("is-active", nuevoEstado);
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



    const btnVer = e.target.closest(".ver-lectura");
    if (btnVer) {
      const id = btnVer.dataset.id;
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
      const clave = `${unidadRaw.nivel}_${gradoTexto}_${unidadRaw.trimestre}_${unidadRaw.unidad}`.toLowerCase();
      const urlImagen = window.imagenesRelacionadasPorClave?.[clave];

      const contenedor = document.getElementById("modalTextoLectura");
      renderLecturaModalContent(contenedor, textoGuardado, urlImagen);

      agregarMarcadoresDePosicion(contenedor);
      document.getElementById("modalLectura").style.display = "flex";
      lecturaIdActual = id;
      window.unsubscribeComentarios = await renderComentarios(id);

      contenedor.style.maxHeight = "none";
      contenedor.style.overflow = "visible";
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


async function loadUserAprende() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorAprendeUser");
  if (!contenedor) return;

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("aprende");
  updateWorkbenchListTitle("aprende");
  contenedor.innerHTML = '<p class="text-muted">Cargando tus sesiones...</p>';

  try {
    const isAdmin = ["admin", "superAdmin"].includes(currentUserRole);
    const filter = workbenchFilters.aprende || "published";

    let sesiones = [];
    if (filter === "published") {
      const q = query(collection(db, "moodleCourses"), where("publicar", "==", true)); 
      const snap = await getDocs(q);
      sesiones = snap.docs
        .filter(d => {
          const data = d.data();
          if (data.docType === "module") return false;
          if (data.docType === "course") return true;
          return !d.id.includes("_") && Array.isArray(data.temas);
        })
        .map(d => ({ id: d.id, ...d.data(), type: 'aprende' }));
    } else {
      const q = isAdmin
        ? collection(db, "moodleCourses")
        : query(collection(db, "moodleCourses"), where("userId", "==", user.uid));
      
      const snap = await getDocs(q);
      sesiones = snap.docs
        .filter(d => {
          const data = d.data();
          if (data.docType === "module") return false;
          if (data.docType === "course") return true;
          return !d.id.includes("_") && Array.isArray(data.temas);
        })
        .map(d => ({ id: d.id, ...d.data(), type: 'aprende' }));
    }

    const authorIds = new Set();
    sesiones.forEach(s => {
      if (s.userId) authorIds.add(s.userId);
      if (s.uid) authorIds.add(s.uid);
    });
    await prefetchUsers(authorIds);

    updateWorkbenchStats('aprende', sesiones);
    renderUserItemList(contenedor, sesiones, 'aprende');

  } catch (err) {
    console.error("[Dashboard] Error al cargar Aprende:", err);
    contenedor.innerHTML = '<p class="text-danger">Error al cargar las sesiones.</p>';
  }
}

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
  nodesToWrap.forEach(({ node, start, end }) => {
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

const configurarBusquedaWorkbench = () => {
  const setupSearch = (inputId, containerId) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("input", () => {
      const query = input.value.toLowerCase().trim();
      const items = document.querySelectorAll(`#${containerId} .workbench-item`);
      items.forEach(item => {
        // En el nuevo diseño el título está en .workbench-item-meta
        const title = item.querySelector(".workbench-item-meta")?.textContent.toLowerCase() || "";
        item.style.display = title.includes(query) ? "" : "none";
      });
    });
  };

  setupSearch("searchLecturas", "contenedorLecturasUser");
  setupSearch("searchUnidades", "contenedorUnidadesUser");
  setupSearch("searchMultimedia", "contenedorMultimediaUser");
  setupSearch("searchPodcasts", "contenedorPodcastsUser");
  setupSearch("searchAprende", "contenedorAprendeUser");
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

await loadUserLecturas(); // ✅ Ahora ya tiene acceso al mapa de imágenes
await loadUserAprende();

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

  loadUserLecturas();
  loadUserAprende();
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
      comentario: sanitizeTextInput(comentario, { maxLength: 3000, preserveNewlines: true }),
      autor: currentUserName,
      fecha: new Date(),
      posicion: posicion,
      longitud: longitud,
      seleccionadoPor: [],
      editadoEn: new Date(),
      editadoPor: auth.currentUser?.email || auth.currentUser?.uid || "Desconocido"
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
    "Ã±": "ñ", "Ã ": "Á", "Ã‰": "É", "Ã ": "Í", "Ã“": "Ó", "Ãš": "Ú",
    "â€œ": "“", "â€ ": "”", "â€˜": "‘", "â€™": "’",
    "â€“": "–", "â€”": "—", "â€¦": "…", "Â¡": "¡", "Â¿": "¿",
    "Ã¼": "ü", "Ãœ": "Ü"
  };

  return texto.replace(/Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±|Ã |Ã‰|Ã |Ã“|Ãš|â€œ|â€ |â€˜|â€™|â€“|â€”|â€¦|Â¡|Â¿|Ã¼|Ãœ/g, match => mapa[match] || match);
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
  // Usar global: usuariosCache

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
        archivado: data.archivado || false,
        editadoEn: data.editadoEn || new Date(),
        editadoPor: data.editadoPor || "Desconocido"
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
          archivado: nuevoEstado,
          editadoEn: new Date(),
          editadoPor: auth.currentUser?.email || auth.currentUser?.uid || "Desconocido"
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

mostrarModalUpdates("v2.0.0");/**
 * NAVEGACIÓN DEL DASHBOARD
 */
function initDashboardNavigation() {
  // Click en las tarjetas del dashboard
  document.querySelectorAll('.section-card[data-view]').forEach(card => {
    card.addEventListener('click', (e) => {
      const viewId = card.dataset.view;
      if (viewId) mostrarSeccion(viewId);
    });
  });

  // Botones de volver
  document.querySelectorAll('.btn-back, .flow-back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view || 'viewDashboard';
      mostrarSeccion(targetView);
    });
  });
}

function mostrarSeccion(viewId) {
  document.querySelectorAll('.home-view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active');
  });
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
    if (viewId === 'viewLecturas') loadUserLecturas();
    if (viewId === 'viewUnidades') loadUserUnidades();
    if (viewId === 'viewDownloads') loadUserDownloads();
    if (viewId === 'viewMultimedia') loadUserMultimedia();
    if (viewId === 'viewPodcasts') loadUserPodcasts();
  }
}

/**
 * CARGA DE DATOS DEL USUARIO
 */
let chartLecturasInstance = null;
let chartUnidadesInstance = null;
const workbenchFilters = {
  lecturas: "published",
  unidades: "published",
  multimedia: "published",
  podcasts: "published"
};

async function loadUserStats() {
  // Esta función puede precargar datos para el dashboard principal si es necesario
}

function isCurrentUserAdmin() {
  return ["admin", "Admin", "superAdmin", "superadmin", "SuperAdmin", "administrador", "Administrador", "owner", "Owner"].includes(currentUserRole);
}

function isCurrentUserEditorial() {
  return isCurrentUserAdmin() || ["author", "Author", "autor", "Autor", "editor", "Editor", "editorial", "Editorial", "editoria", "Editoria"].includes(currentUserRole);
}

function configureWorkbenchFilters() {
  const isAdmin = isCurrentUserAdmin();
  document.querySelectorAll("[data-admin-label][data-user-label]").forEach((label) => {
    label.textContent = isAdmin ? label.dataset.adminLabel : label.dataset.userLabel;
  });

  document.querySelectorAll("[data-workbench-view][data-workbench-filter]").forEach((button) => {
    if (button.dataset.workbenchBound === "1") return;
    button.addEventListener("click", () => {
      const view = button.dataset.workbenchView;
      const filter = button.dataset.workbenchFilter || "published";
      if (!view) return;
      workbenchFilters[view] = filter;
      updateWorkbenchFilterButtons(view);
      if (view === "lecturas") loadUserLecturas();
      if (view === "unidades") loadUserUnidades();
      if (view === "multimedia") loadUserMultimedia();
      if (view === "podcasts") loadUserPodcasts();
      if (view === "aprende") loadUserAprende();
    });
    button.dataset.workbenchBound = "1";
  });
}

function updateWorkbenchFilterButtons(view) {
  const activeFilter = workbenchFilters[view] || "published";
  document.querySelectorAll(`[data-workbench-view="${view}"]`).forEach((button) => {
    const isActive = button.dataset.workbenchFilter === activeFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updateWorkbenchListTitle(scope) {
  const isAdmin = isCurrentUserAdmin();
  const filter = workbenchFilters[scope] || "published";
  const labels = {
    lecturas: { published: "Lecturas publicadas", all: "Todas las lecturas", mine: "Mis lecturas creadas" },
    unidades: { published: "Unidades publicadas", all: "Todas las unidades", mine: "Mis unidades creadas" },
    aprende: { published: "Sesiones publicadas", all: "Todas las sesiones", mine: "Mis sesiones creadas" }
  };
  
  const scopeLabels = labels[scope] || labels.lecturas;
  const label = filter === "published" ? scopeLabels.published : (isAdmin ? scopeLabels.all : scopeLabels.mine);
  
  const idMap = { lecturas: "lecturasWorkbenchListTitle", unidades: "unidadesWorkbenchListTitle", aprende: "aprendeWorkbenchListTitle" };
  const title = document.getElementById(idMap[scope] || "lecturasWorkbenchListTitle");
  if (title) title.textContent = label;
}

function mergeFirestoreDocs(snaps, collectionNames) {
  const map = new Map();
  snaps.forEach((snap, index) => {
    const collectionName = collectionNames[index] || "";
    snap.forEach((docSnap) => {
      map.set(`${collectionName}:${docSnap.id}`, {
        id: docSnap.id,
        ...docSnap.data(),
        coleccion: collectionName
      });
    });
  });
  return Array.from(map.values());
}

function isUserOwnedDoc(item, uid) {
  return item?.userId === uid ||
    item?.uid === uid ||
    item?.createdBy === uid ||
    item?.ownerUid === uid;
}

async function getOwnedDocsFromCollection(collectionName, uid, collectionAlias = collectionName) {
  const ownerFields = ["userId", "uid", "createdBy", "ownerUid"];
  const snaps = await Promise.allSettled(
    ownerFields.map((field) => getDocs(query(collection(db, collectionName), where(field, "==", uid))))
  );
  const docs = [];
  snaps.forEach((result) => {
    if (result.status === "fulfilled") docs.push(result.value);
  });
  return mergeFirestoreDocs(docs, docs.map(() => collectionAlias));
}

async function loadUserLecturas() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorLecturasUser");
  if (!contenedor) return;
  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("lecturas");
  updateWorkbenchListTitle("lecturas");
  contenedor.innerHTML = '<p class="text-muted">Cargando tus lecturas...</p>';

  try {
    const isAdmin = isCurrentUserAdmin();
    const filter = workbenchFilters.lecturas || "published";

    let lecturas = [];
    const isEditorial = isCurrentUserEditorial();

    if (filter === "published") {
      // TODOS los publicados para Admin, Author y Editor
      if (isAdmin || isEditorial) {
        const [snap1, snap2] = await Promise.all([
          getDocs(query(collection(db, "lecturas"), where("publicar", "==", true))),
          getDocs(query(collection(db, "lecturasNuevas"), where("publicar", "==", true)))
        ]);
        lecturas = mergeFirestoreDocs([snap1, snap2], ["lecturas", "lecturasNuevas"]);
      } else {
        // Otros roles solo ven lo suyo publicado (fallback)
        const [ownedLecturas, ownedNuevas] = await Promise.all([
          getOwnedDocsFromCollection("lecturas", user.uid, "lecturas"),
          getOwnedDocsFromCollection("lecturasNuevas", user.uid, "lecturasNuevas")
        ]);
        lecturas = [...ownedLecturas, ...ownedNuevas].filter(it => it.publicar === true);
      }
    } else {
      // Filtro "Mis Documentos" (o "Todos" para Admin)
      if (isAdmin) {
        const [snap1, snap2] = await Promise.all([
          getDocs(collection(db, "lecturas")),
          getDocs(collection(db, "lecturasNuevas"))
        ]);
        lecturas = mergeFirestoreDocs([snap1, snap2], ["lecturas", "lecturasNuevas"]);
      } else {
        // Solo lo propio para Author/Editor
        const [ownedLecturas, ownedNuevas] = await Promise.all([
          getOwnedDocsFromCollection("lecturas", user.uid, "lecturas"),
          getOwnedDocsFromCollection("lecturasNuevas", user.uid, "lecturasNuevas")
        ]);
        lecturas = [...ownedLecturas, ...ownedNuevas];
      }
    }

    if (!isAdmin && filter !== "published") {
      lecturas = lecturas.filter((item) => isUserOwnedDoc(item, user.uid));
    }
    if (filter === "published") {
      lecturas = lecturas.filter((item) => item.publicar === true || item.published === true);
    }

    const authorIds = new Set();
    lecturas.forEach((data) => {
      if (data.userId) authorIds.add(data.userId);
      if (data.uid) authorIds.add(data.uid);
    });

    await prefetchUsers(authorIds);

    updateWorkbenchStats('lecturas', lecturas);
    renderUserItemList(contenedor, lecturas, 'lectura');
    renderUserMonthlyStatsChart('chartLecturas', lecturas, 'Lecturas por Usuario/Mes', chartLecturasInstance, (inst) => chartLecturasInstance = inst);

  } catch (err) {
    console.error("Error al cargar lecturas del usuario:", err);
    updateWorkbenchStats('lecturas', []);
    contenedor.innerHTML = '<p class="text-danger">Error al cargar datos.</p>';
  }
}

async function loadUserUnidades() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorUnidadesUser");
  if (!contenedor) return;

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("unidades");
  updateWorkbenchListTitle("unidades");
  contenedor.innerHTML = '<p class="text-muted">Cargando tus unidades...</p>';

  try {
    const isAdmin = isCurrentUserAdmin();
    const filter = workbenchFilters.unidades || "published";
    let unidades = [];
    const isEditorial = isCurrentUserEditorial();

    if (filter === "published") {
      if (isAdmin || isEditorial) {
        const snap = await getDocs(query(collection(db, COLECCION_UNIDADES), where("publicar", "==", true)));
        unidades = mergeFirestoreDocs([snap], [COLECCION_UNIDADES]);
      } else {
        const owned = await getOwnedDocsFromCollection(COLECCION_UNIDADES, user.uid);
        unidades = owned.filter(it => it.publicar === true);
      }
    } else {
      if (isAdmin) {
        const snap = await getDocs(collection(db, COLECCION_UNIDADES));
        unidades = mergeFirestoreDocs([snap], [COLECCION_UNIDADES]);
      } else {
        unidades = await getOwnedDocsFromCollection(COLECCION_UNIDADES, user.uid);
      }
    }

    if (!isAdmin && filter !== "published") {
      unidades = unidades.filter((item) => isUserOwnedDoc(item, user.uid));
    }
    const authorIds = new Set();

    unidades.forEach((data) => {
      if (data.userId) authorIds.add(data.userId);
      if (data.uid) authorIds.add(data.uid);
    });

    if (filter === "published") {
      unidades = unidades.filter((item) => item.publicar === true || item.published === true);
    }

    await prefetchUsers(authorIds);

    updateWorkbenchStats('unidades', unidades);
    renderUserItemList(contenedor, unidades, 'unidad');
    renderUserMonthlyStatsChart('chartUnidades', unidades, 'Unidades por Usuario/Mes', chartUnidadesInstance, (inst) => chartUnidadesInstance = inst);

  } catch (err) {
    console.error("Error al cargar unidades del usuario:", err);
    updateWorkbenchStats('unidades', []);
    contenedor.innerHTML = '<p class="text-danger">Error al cargar datos.</p>';
  }
}

function updateWorkbenchStats(scope, items) {
  const total = Array.isArray(items) ? items.length : 0;
  const published = Array.isArray(items)
    ? items.filter((item) => item?.publicar === true || item?.published === true).length
    : 0;
  const prefix = scope === 'unidades' ? 'unidades' : 'lecturas';
  const totalEl = document.getElementById(`${prefix}WorkbenchTotal`);
  const publishedEl = document.getElementById(`${prefix}WorkbenchPublished`);
  if (totalEl) totalEl.textContent = String(total);
  if (publishedEl) publishedEl.textContent = String(published);
}

async function prefetchUsers(uids) {
  const promises = [];
  uids.forEach(uid => {
    if (!usuariosCache.has(uid)) {
      promises.push(
        getDoc(doc(db, "users", uid)).then(snap => {
          if (snap.exists()) {
            const d = snap.data();
            const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || "Usuario";
            usuariosCache.set(uid, name);
          } else {
            usuariosCache.set(uid, "Desconocido");
          }
        }).catch(() => usuariosCache.set(uid, "Error"))
      );
    }
  });
  await Promise.all(promises);
}

async function loadUserMultimedia() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorMultimediaUser");
  if (!contenedor) return;

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("multimedia");
  contenedor.innerHTML = '<p class="text-muted">Cargando videos...</p>';

  try {
    const isAdmin = isCurrentUserAdmin();
    const isEditorial = isCurrentUserEditorial();
    const filter = workbenchFilters.multimedia || "published";

    let q;
    if (filter === "published") {
      // TODOS los publicados para Admin, Author y Editor
      if (isAdmin || isEditorial) {
        q = query(collection(db, "podcaster_sessions"), where("publicar", "==", true), limit(150));
      } else {
        // Otros roles solo ven lo suyo publicado
        q = query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), where("publicar", "==", true), limit(150));
      }
    } else {
      // Filtro "Mis Documentos" (o "Todos" para Admin)
      if (isAdmin) {
        q = query(collection(db, "podcaster_sessions"), limit(150));
      } else {
        // Solo lo propio para Author/Editor
        q = query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), limit(150));
      }
    }

    const snap = await getDocs(q);
    console.log(`[Dashboard] Multimedia Query found ${snap.size} sessions (Filter: ${filter}).`);
    let allItems = [];
    snap.forEach(doc => {
      const data = doc.data();
      const session = data.session || data;
      console.log(`[Dashboard] Checking session ${doc.id}:`, data);

      // Detección ultra-permisiva de video (incluye videoMode, contentTypes y presencia de clips de video)
      const isVideo = !!(data.videoMode === true ||
        session?.videoMode === true ||
        session?.script?.videoMode === true ||
        (session?.script?.videoContentType && session.script.videoContentType !== 'none') ||
        (session?.videoContentType && session.videoContentType !== 'none') ||
        (data.videoContentType && data.videoContentType !== 'none') ||
        (session?.dialogueVideoMap && Object.keys(session.dialogueVideoMap).length > 0) ||
        (session?.podcastStudioUiState?.dialogueVideosByRowId && Object.keys(session.podcastStudioUiState.dialogueVideosByRowId).length > 0));

      console.log(`[Dashboard] isVideo check for ${doc.id}:`, isVideo);
      if (isVideo) {
        allItems.push({
          id: doc.id,
          ...data,
          titulo: data.title || data.session?.title || "Video sin nombre",
          coleccion: "podcaster_sessions"
        });
      }
    });

    // Ordenar en memoria por updatedAt desc
    allItems.sort((a, b) => {
      const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt || 0);
      const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt || 0);
      return dateB - dateA;
    });

    console.log("[Dashboard] Multimedia list to render:", allItems.length);
    renderUserItemList(contenedor, allItems, 'multimedia');

    // Actualizar contadores
    const totalCount = document.getElementById("multimediaWorkbenchTotal");
    const pubCount = document.getElementById("multimediaWorkbenchPublished");
    if (totalCount) totalCount.textContent = allItems.length;
    if (pubCount) pubCount.textContent = allItems.length;

  } catch (err) {
    if (err.code === "permission-denied" || err.message?.includes("permissions")) {
       console.warn("[Dashboard] El usuario no tiene permisos para ver Multimedia.");
       if (contenedor) contenedor.innerHTML = '<p class="text-muted" style="font-size: 0.8rem; opacity: 0.7;"><i class="fas fa-lock"></i> No tienes permisos para ver esta sección.</p>';
    } else {
       console.error("Error al cargar multimedia:", err);
       if (contenedor) contenedor.innerHTML = '<p class="text-danger">Error al cargar datos.</p>';
    }
  }
}

async function loadUserPodcasts() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorPodcastsUser");
  if (!contenedor) return;

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("podcasts");
  contenedor.innerHTML = '<p class="text-muted">Cargando podcasts...</p>';

  try {
    const isAdmin = isCurrentUserAdmin();
    const isEditorial = isCurrentUserEditorial();
    const filter = workbenchFilters.podcasts || "published";

    let q;
    if (filter === "published") {
      if (isAdmin || isEditorial) {
        q = query(collection(db, "podcaster_sessions"), where("publicar", "==", true), limit(150));
      } else {
        q = query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), where("publicar", "==", true), limit(150));
      }
    } else {
      if (isAdmin) {
        q = query(collection(db, "podcaster_sessions"), limit(150));
      } else {
        q = query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), limit(150));
      }
    }

    const snap = await getDocs(q);
    console.log(`[Dashboard] Podcasts Query found ${snap.size} sessions (Filter: ${filter}).`);
    let allItems = [];
    snap.forEach(doc => {
      const data = doc.data();
      const session = data.session || data;
      // Detección ultra-permisiva de video
      const isVideo = !!(data.videoMode === true ||
        session?.videoMode === true ||
        session?.script?.videoMode === true ||
        (session?.script?.videoContentType && session.script.videoContentType !== 'none') ||
        (session?.videoContentType && session.videoContentType !== 'none') ||
        (data.videoContentType && data.videoContentType !== 'none') ||
        (session?.dialogueVideoMap && Object.keys(session.dialogueVideoMap).length > 0) ||
        (session?.podcastStudioUiState?.dialogueVideosByRowId && Object.keys(session.podcastStudioUiState.dialogueVideosByRowId).length > 0));

      if (!isVideo) {
        allItems.push({
          id: doc.id,
          ...data,
          titulo: data.title || data.session?.title || "Podcast sin nombre",
          coleccion: "podcaster_sessions"
        });
      }
    });

    // Ordenar en memoria por updatedAt desc
    allItems.sort((a, b) => {
      const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt || 0);
      const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt || 0);
      return dateB - dateA;
    });

    renderUserItemList(contenedor, allItems, 'podcast');

    // Actualizar contadores
    document.getElementById("podcastsWorkbenchTotal").textContent = allItems.length;
    document.getElementById("podcastsWorkbenchPublished").textContent = allItems.length;

  } catch (err) {
    console.error("Error al cargar podcasts:", err);
    contenedor.innerHTML = '<p class="text-danger">Error al cargar datos.</p>';
  }
}

async function loadUserDownloads() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorDownloadsUser");
  if (!contenedor) return;
  contenedor.innerHTML = '<p class="text-muted">Cargando registro de descargas...</p>';

  try {
    const isAdmin = ["admin", "superAdmin"].includes(currentUserRole);

    let q;
    if (isAdmin) {
      q = collection(db, COLECCION_DOWNLOADS);
    } else {
      q = query(collection(db, COLECCION_DOWNLOADS), where("userId", "==", user.uid));
    }

    const snap = await getDocs(q);
    const downloads = [];
    const authorIds = new Set();

    snap.forEach(doc => {
      const data = doc.data();
      downloads.push({ id: doc.id, ...data });
      if (data.userId) authorIds.add(data.userId);
      if (data.uid) authorIds.add(data.uid);
    });

    if (isAdmin || isEditorial) await prefetchUsers(authorIds);

    renderUserItemList(contenedor, downloads, 'download');
    renderUserMonthlyStatsChart('chartDownloads', downloads, 'Descargas por Usuario/Mes', chartDownloadsInstance, (inst) => chartDownloadsInstance = inst);

  } catch (err) {
    console.error("Error al cargar descargas:", err);
    contenedor.innerHTML = '<p class="text-danger">Error al cargar datos.</p>';
  }
}

let chartDownloadsInstance = null;

/**
 * REPRODUCTOR MULTIMEDIA (DASHBOARD)
 */
let currentMultimediaSession = null;
let homePlaybackState = {
  stageVideoSlot: 0,
  montageCursorMs: 0,
  montageAudioPlayers: {}
};

const storage = getStorage(app);
const multimediaPlaybackController = new PodcasterPlaybackController();

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function resolveStorageVideoUrl(downloadUrl, storagePath) {
  if (storagePath) {
    const s = String(storagePath);
    if (s.startsWith("gs://") || s.startsWith("http")) return s;
    const bucket = window.__CHARLY_CONFIG__?.firebase?.storageBucket || 'charly-brown.firebasestorage.app';
    return `gs://${bucket}/${s}`;
  }
  return downloadUrl || "";
}

function resolveStorageAudioUrl(downloadUrl, storagePath) {
  if (storagePath) {
    const s = String(storagePath);
    if (s.startsWith("gs://") || s.startsWith("http")) return s;
    const bucket = window.__CHARLY_CONFIG__?.firebase?.storageBucket || 'charly-brown.firebasestorage.app';
    return `gs://${bucket}/${s}`;
  }
  return downloadUrl || "";
}

const multimediaPlaybackDeps = {
  getTimelineTotalDurationMs: (s) => {
    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(s);
    if (!entries.length) return 0;
    return Math.max(...entries.map(e => e.endMs));
  },
  buildTimelineRuntimeEntries: (s) => {
    const rows = s?.rows || s?.script?.rows || [];
    const videoConfig = s?.podcastVideoConfig || s?.script?.podcastVideoConfig || {};
    const ui = s?.podcastStudioUiState || {};

    // Buscar clipMap en múltiples ubicaciones posibles
    const clipMap = s?.timelineClipMap || videoConfig.timelineClipsByRowId || ui.timelineClipsByRowId || {};
    const videoMap = s?.dialogueVideoMap || ui.dialogueVideosByRowId || {};
    const audioMap = s?.dialogueAudioMap || ui.dialogueAudiosByRowId || {};

    // Asegurar que usamos el acumulado para evitar huecos si los clips no tienen startMs
    let currentMs = 0;
    const entries = rows.map((row, index) => {
      const rowId = row.id || `row_${index}`;
      if (!row.id) row.id = rowId; // Asegurar en el objeto local
      let clip = clipMap[rowId];

      const sceneClip = videoMap[rowId];
      const audioClip = audioMap[rowId];

      // Si no hay video ni audio, saltar esta fila
      if (!sceneClip && !audioClip) return null;

      // Si no hay clip definido en el timeline, crear uno virtual para el dashboard
      if (!clip) {
        const durationSec = Number(audioClip?.durationSec || 8);
        clip = {
          rowId,
          startMs: currentMs,
          durationMs: durationSec * 1000,
          trimInMs: 0,
          trimOutMs: 0,
          zIndex: index + 1
        };
      }

      const videoSrc = resolveStorageVideoUrl(sceneClip?.downloadUrl, sceneClip?.storagePath);
      const audioSrc = resolveStorageAudioUrl(audioClip?.downloadUrl, audioClip?.storagePath);

      const entry = {
        rowId,
        index,
        clip,
        startMs: Number(clip.startMs) || currentMs,
        endMs: 0,
        effectiveDurationMs: 0,
        videoSrc,
        audioSrc,
        video: {
          storagePath: String(sceneClip?.storagePath || "").trim(),
          url: String(sceneClip?.downloadUrl || "").trim(),
          mimeType: "video/mp4"
        },
        audio: {
          storagePath: String(audioClip?.storagePath || "").trim(),
          url: String(audioClip?.downloadUrl || "").trim(),
          mimeType: "audio/wav"
        },
        audioDurationMs: Number(audioClip?.durationSec || 0) * 1000,
        zIndex: Number(clip.zIndex || index + 1)
      };

      // DETECCIÓN DE UNIDADES: Si el número es muy pequeño (ej. 2.5), probablemente son segundos.
      let rawDur = Number(clip.durationMs || clip.sourceDurationMs || 0);
      if (rawDur > 0 && rawDur < 100) rawDur *= 1000;
      
      // Fallback a audio de Gemini
      if (rawDur <= 0) {
        rawDur = Number(audioClip?.durationSec || 0) * 1000;
      }
      
      // Fallback final
      if (rawDur <= 0) rawDur = 3000;

      const trimIn = Number(clip.trimInMs || 0);
      let trimOut = Number(clip.trimOutMs || rawDur);
      if (trimOut > 0 && trimOut < 100) trimOut *= 1000;
      
      if (trimOut <= trimIn) trimOut = trimIn + rawDur;

      const durationMs = Math.max(500, trimOut - trimIn);
      
      entry.startMs = currentMs;
      entry.durationMs = durationMs;
      entry.effectiveDurationMs = durationMs;
      entry.endMs = entry.startMs + durationMs;
      
      currentMs = entry.endMs;
      console.log(`[Dashboard] Entry ${index} (${rowId}): ${entry.startMs}ms -> ${entry.endMs}ms`);
      return entry;
    }).filter(Boolean);

    console.log("[Dashboard] Final entries built:", entries.length);
    return entries.sort((a, b) => a.startMs - b.startMs);
  },
  resolveFirebaseStorageUrl: async (gsPath) => {
    if (!gsPath) return "";
    try {
      const config = window.__CHARLY_CONFIG__ || {};
      const apiBase = (config.apiBaseUrl || "").replace(/\/api$/, "");
      if (apiBase) {
        const proxyUrl = `${apiBase}/api/assets/proxy-media?storagePath=${encodeURIComponent(gsPath)}`;
        console.log("[Dashboard] Proxy URL resolved:", proxyUrl);
        return proxyUrl;
      }
      return gsPath;
    } catch (e) {
      console.warn("[Dashboard] Error al resolver URL de Storage:", gsPath, e);
      return gsPath;
    }
  },
  setPodcastStageVideoSourceForElement: async (el, url) => {
    if (!el) return;
    return new Promise((resolve) => {
      console.log("[Dashboard] Loading video source:", url);
      el.src = url;
      el.load();

      let hasResolved = false;
      const onDone = () => {
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
      };

      el.onloadedmetadata = onDone;
      el.oncanplay = onDone;
      el.onerror = (err) => {
        console.warn("[Dashboard] Error loading video source:", url, err);
        onDone();
      };

      // Seguridad: no bloquear más de 3.5s si el video es pesado o hay red lenta
      setTimeout(onDone, 3500);
    });
  },
  setActiveStageVideoSlot: (slot) => { homePlaybackState.stageVideoSlot = slot; },
  podcastVideoState: homePlaybackState,
  isDashboard: true,
  getPlaybackSpeed: () => 1,
  getPodcastVideoConfig: (s) => {
    if (!s) return {};
    if (!s.podcastVideoConfig) {
      s.podcastVideoConfig = s.podcastStudioUiState?.podcastVideoConfig || {};
    }
    const cfg = s.podcastVideoConfig;
    
    // 1. SINTETIZAR PISTA DE DIÁLOGO
    if (!cfg.geminiDialogueTrack || !cfg.geminiDialogueTrack.segments?.length) {
      const segments = [];
      const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(s);
      entries.forEach(entry => {
        if (entry.audioSrc) {
          segments.push({
            rowId: entry.rowId,
            startMs: entry.startMs,
            durationMs: entry.durationMs,
            sourceUrl: entry.audioSrc
          });
        }
      });
      cfg.geminiDialogueTrack = { enabled: true, segments };
    }

    // 2. SINTETIZAR TEXTO EN PANTALLA Y SUS CLIPS
    if (!cfg.onScreenTextTrack) {
      cfg.onScreenTextTrack = { enabled: true, showTrack: true, stylePreset: 'glow' };
    }
    
    if (!cfg.timelineOnScreenTextClipsByRowId) {
      const textClips = {};
      const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(s);
      entries.forEach(entry => {
        // Usar el texto de la fila o un genérico
        const allRows = s.rows || s.script?.rows || [];
        const row = allRows.find(r => r.id === entry.rowId);
        const dialogueText = row?.onScreenText || row?.text || "";
        if (dialogueText) {
          textClips[entry.rowId] = {
            id: `text_${entry.rowId}`,
            rowId: entry.rowId,
            startMs: entry.startMs,
            durationMs: entry.durationMs,
            onScreenText: dialogueText
          };
        }
      });
      cfg.timelineOnScreenTextClipsByRowId = textClips;
      console.log("[Dashboard] Synthesized on-screen text clips:", Object.keys(textClips).length);
    }
    
    return cfg;
  },
  updatePodcastVideoTransportUi: () => {
    const timeline = document.getElementById("playerTimeline");
    const label = document.getElementById("playerTimeLabel");
    if (timeline) {
      const total = multimediaPlaybackController.state.totalDurationMs || 1;
      const current = multimediaPlaybackController.state.currentMs;
      timeline.value = (current / total) * 100;
      label.textContent = `${formatMs(current)} / ${formatMs(total)}`;

      const playBtn = document.getElementById("playerPlayBtn");
      const pauseBtn = document.getElementById("playerPauseBtn");
      if (playBtn && pauseBtn) {
        if (multimediaPlaybackController.state.isPlaying) {
          playBtn.style.display = "none";
          pauseBtn.style.display = "grid";
        } else {
          playBtn.style.display = "grid";
          pauseBtn.style.display = "none";
        }
      }

      // Monitor de Escena Reactivo
      if (currentMultimediaSession) {
        const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(currentMultimediaSession);
        const activeEntry = entries.find(e => current >= e.startMs && current < e.endMs);
        if (activeEntry) {
          const rows = currentMultimediaSession.rows || currentMultimediaSession.script?.rows || [];
          const row = rows.find(r => r.id === activeEntry.rowId);
          
          const scriptEl = document.getElementById("infoSceneScript");
          const descEl = document.getElementById("infoSceneDesc");
          const ostEl = document.getElementById("infoSceneOST");
          const visualEl = document.getElementById("infoSceneVisual");
          const timeEl = document.getElementById("infoSceneTime");
          const proposalTextarea = document.getElementById("infoSceneProposalText");

          // Guardar el ID actual para el guardado
          window._currentActiveRowId = activeEntry.rowId;

          if (scriptEl) scriptEl.textContent = row?.text || "--";
          if (descEl) descEl.textContent = row?.sceneDescription || row?.description || "--";
          if (ostEl) ostEl.textContent = row?.onScreenText || "--";
          
          if (visualEl) {
            if (row?.visualNotesOriginalStored === true && row?.visualNotesOriginalText !== row?.visualNotes) {
              visualEl.innerHTML = `<span style="color: #10b981; font-size: 10px; display: block; margin-bottom: 2px;">(PROPUESTA APLICADA)</span>${row.visualNotes}<br><small style="color: #64748b; font-size: 9px; display: block; margin-top: 4px;">Original: ${row.visualNotesOriginalText}</small>`;
            } else {
              visualEl.textContent = row?.visualNotes || row?.visualElement || "--";
            }
          }

          // Propuesta Pendiente (Aparte)
          const activeProposalGroup = document.getElementById("infoSceneActiveProposalGroup");
          const activeProposalEl = document.getElementById("infoSceneActiveProposal");
          if (activeProposalGroup && activeProposalEl) {
            if (row?.visualNotesProposal) {
              activeProposalGroup.style.display = "block";
              activeProposalEl.textContent = row.visualNotesProposal;
              
              const btnApply = document.getElementById("btnApplyActiveProposal");
              const btnDelete = document.getElementById("btnDeleteActiveProposal");
              
              if (btnApply) {
                 btnApply.onclick = async () => {
                    await aplicarPropuestaDesdeDashboard(row.visualNotesProposal);
                 };
              }
              if (btnDelete) {
                 btnDelete.onclick = async () => {
                    if (confirm("¿Eliminar definitivamente esta propuesta pendiente?")) {
                       await eliminarPropuestaDesdeDashboard(row.visualNotesProposal);
                    }
                 };
              }
            } else {
              activeProposalGroup.style.display = "none";
            }
          }
          
          if (timeEl) timeEl.textContent = `${(current / 1000).toFixed(1)}s`;
          
          // Sincronizar el historial de propuestas
          const proposalsGroup = document.getElementById("infoSceneProposalsGroup");
          const proposalsList = document.getElementById("infoSceneProposalsList");
          if (proposalsList) {
             const proposals = Array.isArray(row?.visualNotesProposals) ? row.visualNotesProposals : (row?.visualNotesProposal ? [row.visualNotesProposal] : []);
             if (proposals.length > 0) {
                if (proposalsGroup) proposalsGroup.style.display = "block";
                proposalsList.innerHTML = proposals.map((p, pIdx) => `
                   <div style="font-size: 11px; background: rgba(251, 191, 36, 0.05); border-left: 2px solid #fbbf24; padding: 4px 8px; color: #fde68a; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                      <span style="flex: 1;">${p}</span>
                      <button class="btn-apply-proposal-dashboard" data-proposal-text="${p.replace(/"/g, '&quot;')}" style="background: none; border: none; color: #10b981; cursor: pointer; padding: 2px;" title="Aplicar esta propuesta">
                         <i class="fas fa-check-circle"></i>
                      </button>
                      <button class="btn-delete-proposal-dashboard" data-proposal-text="${p.replace(/"/g, '&quot;')}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px;" title="Eliminar esta propuesta">
                         <i class="fas fa-trash"></i>
                      </button>
                   </div>
                `).join("");

                // Agregar listeners a los nuevos botones
                proposalsList.querySelectorAll(".btn-apply-proposal-dashboard").forEach(btn => {
                   btn.onclick = async (e) => {
                      const text = e.currentTarget.dataset.proposalText;
                      await aplicarPropuestaDesdeDashboard(text);
                   };
                });

                proposalsList.querySelectorAll(".btn-delete-proposal-dashboard").forEach(btn => {
                   btn.onclick = async (e) => {
                      const text = e.currentTarget.dataset.proposalText;
                      if (confirm("¿Eliminar definitivamente esta propuesta del historial?")) {
                         await eliminarPropuestaDesdeDashboard(text);
                      }
                   };
                });
             } else {
                if (proposalsGroup) proposalsGroup.style.display = "none";
                proposalsList.innerHTML = "";
             }
          }

          // Sincronizar el textarea solo si cambia de escena y no estamos escribiendo (foco)
          if (proposalTextarea && document.activeElement !== proposalTextarea) {
             if (proposalTextarea.dataset.lastRowId !== activeEntry.rowId) {
                proposalTextarea.value = ""; // Limpiar para nueva propuesta
                proposalTextarea.dataset.lastRowId = activeEntry.rowId;
             }
          }
        }
      }
    }
  },
  getPanelMontageMusicConfig: (s) => {
    const cfg = s?.panelMusicConfig || s?.session?.panelMusicConfig || 
                s?.panelMusicState || s?.session?.panelMusicState ||
                s?.podcastStudioUiState?.panelMusicState || 
                s?.podcastStudioUiState?.panelMusicConfig || 
                { sourceType: 'none' };
    
    // Si ya tiene sourceItems, asegurar que las URLs se resuelvan (vía proxy si es gs://)
    if (Array.isArray(cfg.sourceItems)) {
      cfg.sourceItems = cfg.sourceItems.map(item => ({
        ...item,
        // El controlador usará resolveFirebaseStorageUrl si empieza con gs://
        // pero aquí podemos asegurar que no venga null
        sourceUrl: item.sourceUrl || ""
      }));
    }

    const rawUrl = cfg.sourceUrl || cfg.url || (cfg.track?.downloadUrl) || "";
    let finalUrl = rawUrl;
    
    if (rawUrl && String(rawUrl).startsWith('gs://')) {
      const bucket = window.__CHARLY_CONFIG__?.firebase?.storageBucket || 'charly-brown.firebasestorage.app';
      const gsPath = rawUrl.startsWith('gs://') ? rawUrl : `gs://${bucket}/${rawUrl}`;
      const apiBase = (window.__CHARLY_CONFIG__?.apiBaseUrl || "").replace(/\/api$/, "");
      finalUrl = `${apiBase}/api/assets/proxy-media?storagePath=${encodeURIComponent(gsPath)}`;
    }
    
    cfg.sourceUrl = finalUrl;
    cfg.url = finalUrl;
    cfg.enabled = cfg.sourceType !== 'none' && (!!finalUrl || (cfg.sourceItems && cfg.sourceItems.length > 0));
    
    console.log("[Dashboard] Normalized Background Music Config:", { 
      sourceType: cfg.sourceType, 
      hasSourceUrl: !!cfg.sourceUrl, 
      sourceItemsCount: cfg.sourceItems?.length || 0 
    });
    return cfg;
  },
  ensureOnScreenTextClipsByRowId: (s) => {
    const cfg = multimediaPlaybackDeps.getPodcastVideoConfig(s);
    return cfg.timelineOnScreenTextClipsByRowId || {};
  },
  getActiveSession: () => currentMultimediaSession,
  getAuthHeaders: async () => {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },
  resolveDialogueAudioForRow: (s, rowId) => (s?.dialogueAudioMap || s?.podcastStudioUiState?.dialogueAudiosByRowId)?.[rowId],
  resolveStorageAudioUrl: (url, path) => resolveStorageAudioUrl(url, path),
  ensureTimelineClipsByRowId: (s) => s?.timelineClipMap || s?.podcastStudioUiState?.timelineClipsByRowId || {},
  resolveTimelineClipMix: (s, rowId) => (s?.timelineClipMixes || s?.podcastStudioUiState?.timelineClipMixesByRowId || s?.podcastStudioUiState?.timelineClipMixes)?.[rowId] || { voiceVolume: 1, backgroundVolume: 1 },
  getOnScreenTextClipEffectiveDurationMs: (c) => c?.durationMs || 0,
  normalizeOnScreenTextTrackSettings: (s) => window.normalizeOnScreenTextTrackSettings ? window.normalizeOnScreenTextTrackSettings(s) : { enabled: true, showTrack: true },
  getOnScreenTextClipText: (row) => row.onScreenText || row.text || "",
  resolveOnScreenTextRenderMetrics: (s, o) => window.resolveOnScreenTextRenderMetrics ? window.resolveOnScreenTextRenderMetrics(s, o) : {},
  getOnScreenTextStylePresetClass: (p) => window.getOnScreenTextStylePresetClass ? window.getOnScreenTextStylePresetClass(p) : "",
  getOnScreenTextBgPresetClass: (p) => window.getOnScreenTextBgPresetClass ? window.getOnScreenTextBgPresetClass(p) : "",
  buildOnScreenTextBubbleInlineStyle: (s, o) => window.buildOnScreenTextBubbleInlineStyle ? window.buildOnScreenTextBubbleInlineStyle(s, o) : "",
  escapeHtml: (t) => {
    const div = document.createElement('div');
    div.textContent = t;
    return div.innerHTML;
  },
  syncPodcastTimelinePlayhead: (ms, total, s) => {
    // Already handled by updatePodcastVideoTransportUi
  },
  setPodcastVideoStatus: (status) => {
    console.log(`[Player] Status: ${status}`);
  }
};

function initMultimediaPlayer() {
  console.log("[Dashboard] Intentando inicializar el reproductor...");
  
  const videoA = document.getElementById("playerVideoA");
  const videoB = document.getElementById("playerVideoB");
  const overlay = document.getElementById("playerOverlay");
  const stage = document.getElementById("playerStage");
  
  if (!videoA || !videoB || !overlay || !stage) {
    console.error("[Dashboard] Faltan elementos críticos para el reproductor:", { videoA: !!videoA, videoB: !!videoB, overlay: !!overlay, stage: !!stage });
    // No abortamos del todo, intentamos seguir si al menos están los videos
  }

  const els = {
    podcastActiveSpeakerVideo: videoA,
    podcastActiveSpeakerVideoAlt: videoB,
    podcastOnScreenTextOverlay: overlay,
    podcastVideoStage: stage
  };
  
  multimediaPlaybackController.init(els, multimediaPlaybackDeps);

  const playBtn = document.getElementById("playerPlayBtn");
  const pauseBtn = document.getElementById("playerPauseBtn");
  const stopBtn = document.getElementById("playerStopBtn");
  const prevBtn = document.getElementById("playerPrevBtn");
  const nextBtn = document.getElementById("playerNextBtn");

  if (playBtn) playBtn.onclick = () => multimediaPlaybackController.play();
  if (pauseBtn) pauseBtn.onclick = () => multimediaPlaybackController.pause();
  if (stopBtn) stopBtn.onclick = () => multimediaPlaybackController.stop();
  if (prevBtn) prevBtn.onclick = () => multimediaPlaybackController.prev();
  if (nextBtn) nextBtn.onclick = () => multimediaPlaybackController.next();

  const timeline = document.getElementById("playerTimeline");
  if (timeline) {
    timeline.oninput = (e) => {
      const pct = parseFloat(e.target.value) / 100;
      const total = multimediaPlaybackController.state.totalDurationMs || 0;
      multimediaPlaybackController.seek(pct * total);
    };
  }

  document.getElementById("cerrarMultimediaPlayer")?.addEventListener("click", () => {
    multimediaPlaybackController.stop();
    document.getElementById("modalMultimediaPlayer").classList.add("hidden");
  });

  document.getElementById("renderizarMultimedia")?.addEventListener("click", async () => {
    const session = currentMultimediaSession;
    if (!session) return;

    const btn = document.getElementById("renderizarMultimedia");
    const originalIcon = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      const clips = multimediaPlaybackDeps.buildTimelineRuntimeEntries(session);
      if (!clips.length) {
        alert("No hay escenas con video/audio para exportar.");
        return;
      }

      const payload = {
        sessionId: session.id,
        entries: clips,
        format: "mp4_h264",
        resolution: "source",
        qualityPreset: "balanced",
        bitrateMode: "vbr",
        includeReviewExcel: false,
        filename: `Export_${session.title || session.id}`.replace(/\s+/g, '_'),
        onscreenTextSettings: session.podcastVideoConfig?.onscreenTextSettings || session.podcastStudioUiState?.onscreenTextSettings || {},
        panelMusicConfig: session.panelMusicConfig || session.podcastStudioUiState?.panelMusicConfig || {}
      };

      console.log("[Dashboard] Iniciando exportación de montaje...", payload);

      const result = await authFetchJson("/podcaster/montage/export", {
        method: "POST",
        body: payload
      });

      alert("Exportación iniciada con éxito. El video estará listo en unos minutos y aparecerá en tu galería.");
      console.log("[Dashboard] Exportación iniciada:", result);

    } catch (e) {
      console.error("[Dashboard] Error al exportar:", e);
      alert("Error al exportar video: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalIcon;
    }
  });
}

async function abrirReproductorMultimedia(session) {
  currentMultimediaSession = session;
  const modal = document.getElementById("modalMultimediaPlayer");
  const title = document.getElementById("playerTitle");
  const btnToggle = document.getElementById("btnToggleSceneInfo");
  const sidePanel = document.getElementById("playerSidePanel");

  if (modal) {
    modal.classList.remove("hidden");
    if (title) title.textContent = session.title || "Sin título";
    
    // Resetear panel lateral
    if (sidePanel) sidePanel.classList.remove("is-open");
    if (btnToggle) btnToggle.classList.remove("active");

    // Resetear monitor de escena
    ["infoSceneScript", "infoSceneDesc", "infoSceneOST", "infoSceneVisual"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "--";
    });
    const timeEl = document.getElementById("infoSceneTime");
    if (timeEl) timeEl.textContent = "00:00.0";
    
    // Inicializar con la primera escena
    const rows = session.rows || session.script?.rows || [];
    if (rows.length > 0) {
      window._currentActiveRowId = rows[0].id;
      const first = rows[0];
      if (document.getElementById("infoSceneScript")) document.getElementById("infoSceneScript").textContent = first.text || "--";
      if (document.getElementById("infoSceneDesc")) document.getElementById("infoSceneDesc").textContent = first.sceneDescription || first.description || "--";
      if (document.getElementById("infoSceneOST")) document.getElementById("infoSceneOST").textContent = first.onScreenText || "--";
      if (document.getElementById("infoSceneVisual")) {
        const visualEl = document.getElementById("infoSceneVisual");
        const proposal = first.visualNotesProposal;
        visualEl.innerHTML = proposal ? `<strong>(PROPUESTA ACTIVA)</strong><br>${proposal}` : (first.visualNotes || "--");
        
        // Historial de propuestas
        const proposalsList = document.getElementById("infoSceneProposalsList");
        const proposalsGroup = document.getElementById("infoSceneProposalsGroup");
        if (proposalsList) {
          const proposals = Array.isArray(first.visualNotesProposals) ? first.visualNotesProposals : (first.visualNotesProposal ? [first.visualNotesProposal] : []);
          if (proposals.length > 0) {
            if (proposalsGroup) proposalsGroup.style.display = "block";
            proposalsList.innerHTML = proposals.map(p => `
              <div style="font-size: 11px; background: rgba(251, 191, 36, 0.1); border-left: 2px solid #fbbf24; padding: 4px 8px; color: #fde68a;">${p}</div>
            `).join("");
          } else {
            if (proposalsGroup) proposalsGroup.style.display = "none";
          }
        }
      }
      if (document.getElementById("infoSceneProposalText")) {
        document.getElementById("infoSceneProposalText").value = "";
      }
    }

    multimediaPlaybackController.sync(session);
    multimediaPlaybackController.stop();

    // Asegurar cableado de guardar propuesta (por si se perdió el evento original)
    const btnSave = document.getElementById("btnSaveVisualProposal");
    if (btnSave) {
      // Limpiar listeners previos para evitar duplicados
      const newBtn = btnSave.cloneNode(true);
      btnSave.parentNode.replaceChild(newBtn, btnSave);
      
      newBtn.addEventListener("click", async (e) => {
        console.log("[Dashboard] Click detectado en Guardar Propuesta. ID Fila:", window._currentActiveRowId);
        if (!currentMultimediaSession || !window._currentActiveRowId) {
          alert("No hay una escena seleccionada para proponer cambios.");
          return;
        }
        
        const btn = e.currentTarget;
        const originalText = btn.innerHTML;
        const proposalText = document.getElementById("infoSceneProposalText").value;
        
        try {
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
          
          const sessionRef = doc(db, "podcaster_sessions", currentMultimediaSession.id);
          console.log("[Dashboard] Intentando guardar en Firebase:", sessionRef.path);
          const snap = await getDoc(sessionRef);
          
          if (snap.exists()) {
            const data = snap.data();
            console.log("[Dashboard] DATOS COMPLETOS DE FIREBASE:", JSON.stringify(data).substring(0, 1000) + "...");
            
            // BUSQUEDA PROFUNDA DE FILAS (Prioridad al objeto session)
            let rows = [];
            const s = data.session || {};
            
            if (s.script?.rows) rows = s.script.rows;
            else if (s.rows) rows = s.rows;
            else if (data.script?.rows) rows = data.script.rows;
            else if (data.rows) rows = data.rows;
            else if (s.podcastStudioUiState?.rows) rows = s.podcastStudioUiState.rows;
            else {
               // Fuerza bruta: buscar el primer array que parezca una lista de filas
               const searchIn = (obj) => {
                  for (const key in obj) {
                     if (Array.isArray(obj[key]) && obj[key].length > 0 && (obj[key][0].id || obj[key][0].text)) return obj[key];
                     if (obj[key] && typeof obj[key] === 'object') {
                        const found = searchIn(obj[key]);
                        if (found) return found;
                     }
                  }
                  return null;
               };
               rows = searchIn(data) || [];
            }

            const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(currentMultimediaSession);
            const activeEntry = entries.find(e => e.rowId === window._currentActiveRowId);
            
            console.log("[Dashboard] Diagnóstico de Guardado:", {
               buscandoId: window._currentActiveRowId,
               filasEnFirebase: rows.length,
               entradasTimeline: entries.length,
               escenaDetectada: activeEntry ? activeEntry.index : "No detectada",
               clavesDoc: Object.keys(data)
            });

            // Intento 1: Por ID exacto
            let rowIndex = rows.findIndex(r => r.id === window._currentActiveRowId);
            
            // Intento 2: Por índice si el ID tiene formato de índice
            if (rowIndex === -1 && window._currentActiveRowId.startsWith("row_")) {
              const idx = parseInt(window._currentActiveRowId.replace("row_", ""));
              if (!isNaN(idx) && rows[idx]) rowIndex = idx;
            }
            
            // Intento 3: SI TODO FALLA, buscamos por posición en el Timeline
            if (rowIndex === -1 && activeEntry) {
              console.log("[Dashboard] ID no hallado, usando índice de entrada del Timeline:", activeEntry.index);
              rowIndex = activeEntry.index;
            }
            
            if (rowIndex !== -1 && rows[rowIndex]) {
              console.log("[Dashboard] Fila localizada con éxito en índice:", rowIndex);
              
              // Actualizar tanto el campo individual como el HISTORIAL
              rows[rowIndex].visualNotesProposal = proposalText;
              if (!Array.isArray(rows[rowIndex].visualNotesProposals)) {
                rows[rowIndex].visualNotesProposals = [];
              }
              if (!rows[rowIndex].visualNotesProposals.includes(proposalText)) {
                rows[rowIndex].visualNotesProposals.push(proposalText);
              }
              
              const updateData = {};
              let foundKey = "rows";
              if (data.session?.script?.rows) foundKey = "session.script.rows";
              else if (data.session?.rows) foundKey = "session.rows";
              else if (data.script?.rows) foundKey = "script.rows";
              else if (data.session?.podcastStudioUiState?.rows) foundKey = "session.podcastStudioUiState.rows";
              else {
                  // Fallback dinámico si se halló por fuerza bruta
                  const findPath = (obj, target, currentPath = "") => {
                      for (const key in obj) {
                          const path = currentPath ? `${currentPath}.${key}` : key;
                          if (obj[key] === target) return path;
                          if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                              const p = findPath(obj[key], target, path);
                              if (p) return p;
                          }
                      }
                      return null;
                  };
                  foundKey = findPath(data, rows) || "rows";
              }
              
              console.log("[Dashboard] Guardando en campo:", foundKey);
              updateData[foundKey] = rows;
              updateData.updatedAt = new Date().toISOString();
              
              await updateDoc(sessionRef, updateData);
              
              // Notificar actividad al Studio
              await notifyActivity("está añadiendo una propuesta nueva", rowIndex);
              
              // Actualizar local de forma redundante para asegurar el renderizado
              if (currentMultimediaSession.script?.rows) {
                 currentMultimediaSession.script.rows = rows;
              }
              if (currentMultimediaSession.rows) {
                 currentMultimediaSession.rows = rows;
              }
              if (currentMultimediaSession.session?.script?.rows) {
                 currentMultimediaSession.session.script.rows = rows;
              }

              // Forzar refresco inmediato de la UI
              multimediaPlaybackDeps.updatePodcastVideoTransportUi();

              alert("✅ Propuesta guardada correctamente.");
            } else {
              console.warn("[Dashboard] Fallo al localizar fila. Buscábamos:", window._currentActiveRowId);
              alert("No se encontró la escena actual en el documento original. Por favor, asegúrate de que el ID coincide.");
            }
          } else {
            alert("El documento de la sesión no existe en Firebase.");
          }
        } catch (err) {
          console.error("[Dashboard] Error fatal al guardar:", err);
          alert("Error de Firebase: " + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    }

    // Resetear botón de play
    const playBtn = document.getElementById("playerPlayBtn");
    if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';

    // Nueva lógica del botón de propuesta (+)
    const btnToggleProposal = document.getElementById("btnShowNewProposal");
    const newProposalContainer = document.getElementById("newProposalContainer");
    const proposalTextarea = document.getElementById("infoSceneProposalText");

    if (btnToggleProposal && newProposalContainer) {
       btnToggleProposal.onclick = () => {
          const isHidden = newProposalContainer.style.display === "none";
          
          if (isHidden) {
             // Caso 1: Estaba oculto -> Mostrar
             newProposalContainer.style.display = "block";
             btnToggleProposal.style.color = "#fbbf24"; // Ámbar (activo)
             if (proposalTextarea) proposalTextarea.focus();
             
             // Notificar actividad: empezando a redactar
             notifyActivity("está proponiendo cambios", window._currentActiveRowId?.replace("row_", "") || -1);
          } else {
             // Caso 2: Ya estaba visible -> "Crear nueva" (Limpiar y enfocar)
             if (proposalTextarea) {
                proposalTextarea.value = "";
                proposalTextarea.focus();
                // Opcional: Feedback visual rápido de limpieza
                proposalTextarea.style.backgroundColor = "rgba(251, 191, 36, 0.1)";
                setTimeout(() => {
                   if (proposalTextarea) proposalTextarea.style.backgroundColor = "";
                }, 300);
             }
          }
       };
    }

    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(session);
    if (entries.length > 0) {
      await multimediaPlaybackController.tick(0);
    }
  }
}

// Cableado de controles del reproductor (Eliminado - movido a initMultimediaPlayer)

async function eliminarPropuestaDesdeDashboard(proposalText) {
   if (!currentMultimediaSession || !window._currentActiveRowId) return;
   
   console.log("[Dashboard] Eliminando propuesta:", window._currentActiveRowId);
   
   try {
      const sessionRef = doc(db, "podcaster_sessions", currentMultimediaSession.id);
      const snap = await getDoc(sessionRef);
      
      if (snap.exists()) {
         const data = snap.data();
         let rows = [];
         const s = data.session || {};
         
         if (s.script?.rows) rows = s.script.rows;
         else if (s.rows) rows = s.rows;
         else if (data.script?.rows) rows = data.script.rows;
         else if (data.rows) rows = data.rows;
         else rows = s.podcastStudioUiState?.rows || [];

         let rowIndex = rows.findIndex(r => r.id === window._currentActiveRowId);
         if (rowIndex === -1 && window._currentActiveRowId.startsWith("row_")) {
            const idx = parseInt(window._currentActiveRowId.replace("row_", ""));
            if (!isNaN(idx) && rows[idx]) rowIndex = idx;
         }

         if (rowIndex !== -1 && rows[rowIndex]) {
            // Eliminar del array de propuestas
            if (Array.isArray(rows[rowIndex].visualNotesProposals)) {
               rows[rowIndex].visualNotesProposals = rows[rowIndex].visualNotesProposals.filter(p => p !== proposalText);
            }
            // Si era la propuesta individual
            if (rows[rowIndex].visualNotesProposal === proposalText) {
               delete rows[rowIndex].visualNotesProposal;
            }

            // Detectar campo para guardar
            let foundKey = "rows";
            if (data.session?.script?.rows) foundKey = "session.script.rows";
            else if (data.session?.rows) foundKey = "session.rows";
            else if (data.script?.rows) foundKey = "script.rows";
            
            const updateData = {};
            updateData[foundKey] = rows;
            updateData.updatedAt = new Date().toISOString();
            
            await updateDoc(sessionRef, updateData);
            
            // Notificar actividad al Studio
            await notifyActivity("ha eliminado una propuesta", rowIndex);
            
            // Actualizar objeto local de forma redundante para asegurar el renderizado
            if (currentMultimediaSession.script?.rows) {
               currentMultimediaSession.script.rows = rows;
            }
            if (currentMultimediaSession.rows) {
               currentMultimediaSession.rows = rows;
            }
            if (currentMultimediaSession.session?.script?.rows) {
               currentMultimediaSession.session.script.rows = rows;
            }

            // Forzar refresco inmediato de la UI
            multimediaPlaybackDeps.updatePodcastVideoTransportUi();

            console.log("[Dashboard] Propuesta eliminada con éxito");
         }
      }
   } catch (error) {
      console.error("[Dashboard] Error al eliminar propuesta:", error);
      alert("No se pudo eliminar la propuesta. Intenta de nuevo.");
   }
}

async function aplicarPropuestaDesdeDashboard(proposalText) {
   if (!currentMultimediaSession || !window._currentActiveRowId) return;
   
   console.log("[Dashboard] Aplicando propuesta como oficial:", window._currentActiveRowId);
   
   try {
      const sessionRef = doc(db, "podcaster_sessions", currentMultimediaSession.id);
      const snap = await getDoc(sessionRef);
      
      if (snap.exists()) {
         const data = snap.data();
         let rows = [];
         const s = data.session || {};
         
         // Reutilizamos la lógica de búsqueda de filas que ya tenemos
         if (s.script?.rows) rows = s.script.rows;
         else if (s.rows) rows = s.rows;
         else if (data.script?.rows) rows = data.script.rows;
         else if (data.rows) rows = data.rows;
         else rows = s.podcastStudioUiState?.rows || [];

         let rowIndex = rows.findIndex(r => r.id === window._currentActiveRowId);
         if (rowIndex === -1 && window._currentActiveRowId.startsWith("row_")) {
            const idx = parseInt(window._currentActiveRowId.replace("row_", ""));
            if (!isNaN(idx) && rows[idx]) rowIndex = idx;
         }

         if (rowIndex !== -1 && rows[rowIndex]) {
            const targetRow = rows[rowIndex];

            // En lugar de sobrescribir, la marcamos como activa/seleccionada
            targetRow.visualNotesProposal = proposalText;
            
            // Aseguramos que esté en el historial
            if (!Array.isArray(targetRow.visualNotesProposals)) {
               targetRow.visualNotesProposals = [];
            }
            if (!targetRow.visualNotesProposals.includes(proposalText)) {
               targetRow.visualNotesProposals.push(proposalText);
            }

            // Detectar campo para guardar
            let foundKey = "rows";
            if (data.session?.script?.rows) foundKey = "session.script.rows";
            else if (data.session?.rows) foundKey = "session.rows";
            else if (data.script?.rows) foundKey = "script.rows";
            
            const updateData = {};
            updateData[foundKey] = rows;
            updateData.updatedAt = new Date().toISOString();
            
            await updateDoc(sessionRef, updateData);
            
            // Notificar actividad al Studio
            await notifyActivity("ha seleccionado una propuesta como activa", rowIndex);
            
            // Actualizar local de forma redundante
            if (currentMultimediaSession.script?.rows) {
               currentMultimediaSession.script.rows = rows;
            }
            if (currentMultimediaSession.rows) {
               currentMultimediaSession.rows = rows;
            }
            if (currentMultimediaSession.session?.script?.rows) {
               currentMultimediaSession.session.script.rows = rows;
            }

            // Sincronizar player y forzar UI
            multimediaPlaybackController.sync(currentMultimediaSession);
            multimediaPlaybackDeps.updatePodcastVideoTransportUi();

            alert("✅ Propuesta aplicada como elemento visual oficial.");
         }
      }
   } catch (err) {
      console.error("[Dashboard] Error al aplicar propuesta:", err);
      alert("Error al aplicar: " + err.message);
   }
}

// Evento para togglear el panel
document.getElementById("btnToggleSceneInfo")?.addEventListener("click", () => {
  const panel = document.getElementById("playerSidePanel");
  const btn = document.getElementById("btnToggleSceneInfo");
  if (panel) {
    panel.classList.toggle("is-open");
    btn?.classList.toggle("active");
  }
});

// Guardar propuesta de cambio visual (Eliminado - movido a abrirReproductorMultimedia)

function showNotification(message, type = "info") {
  const container = document.getElementById("notification-container") || (() => {
    const el = document.createElement("div");
    el.id = "notification-container";
    el.style.cssText = "position: fixed; top: 20px; right: 20px; z-index: 11000; display: flex; flex-direction: column; gap: 10px; pointer-events: none;";
    document.body.appendChild(el);
    return el;
  })();

  const toast = document.createElement("div");
  toast.style.cssText = "min-width: 300px; padding: 16px 20px; border-radius: 12px; background: #1e293b; color: white; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border-left: 4px solid #38bdf8; display: flex; align-items: center; justify-content: space-between; gap: 12px; pointer-events: auto; animation: slideIn 0.3s ease forwards; font-size: 14px;";
  
  if (type === "success") toast.style.borderLeftColor = "#10b981";
  if (type === "error") toast.style.borderLeftColor = "#ef4444";
  if (type === "warning") toast.style.borderLeftColor = "#f59e0b";

  const icon = type === "success" ? "fa-check-circle" : type === "error" ? "fa-exclamation-circle" : type === "warning" ? "fa-exclamation-triangle" : "fa-info-circle";
  
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <i class="fas ${icon}" style="font-size: 18px; color: ${toast.style.borderLeftColor}"></i>
      <span>${message}</span>
    </div>
    <button style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px;"><i class="fas fa-times"></i></button>
  `;

  const closeBtn = toast.querySelector("button");
  const close = () => {
    toast.style.animation = "slideOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  };
  closeBtn.onclick = close;
  
  container.appendChild(toast);
  setTimeout(close, 6000);
}

// Add animation styles if not present
if (!document.getElementById("notification-styles")) {
  const style = document.createElement("style");
  style.id = "notification-styles";
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(120%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// --- LÓGICA DE EXPORTACIÓN DE VIDEO ---

let exportJobState = {
  jobId: null,
  pollTimer: null,
  isBusy: false
};

function initExportUiEvents() {
  const btnOpen = document.getElementById("btnOpenExportModal");
  const modal = document.getElementById("videoExportModal");
  const btnConfirm = document.getElementById("btnConfirmExport");
  
  const rangeBitrate = document.getElementById("exportBitrateMbps");
  const labelBitrate = document.getElementById("exportBitrateValue");
  const rangeCrf = document.getElementById("exportCrfValue");
  const labelCrf = document.getElementById("exportCrfLabel");
  
  const radioBitrateMode = document.getElementsByName("exportBitrateMode");
  const groupBitrateValue = document.getElementById("exportBitrateValueGroup");
  const groupCrfValue = document.getElementById("exportCrfValueGroup");

  btnOpen?.addEventListener("click", () => {
    if (!currentMultimediaSession) return;
    modal?.classList.remove("hidden");
  });

  rangeBitrate?.addEventListener("input", (e) => {
    if (labelBitrate) labelBitrate.textContent = `${e.target.value} Mbps`;
  });

  rangeCrf?.addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    let desc = "Balanceado";
    if (val < 18) desc = "Muy Alta Calidad";
    else if (val < 21) desc = "Alta Calidad";
    else if (val > 28) desc = "Baja Calidad (Pequeño)";
    else if (val > 24) desc = "Calidad Estándar-Baja";
    
    if (labelCrf) labelCrf.textContent = `${val} (${desc})`;
  });

  radioBitrateMode.forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "cbr") {
        groupBitrateValue.style.display = "flex";
        groupCrfValue.style.display = "none";
      } else {
        groupBitrateValue.style.display = "none";
        groupCrfValue.style.display = "flex";
      }
    });
  });

  btnConfirm?.addEventListener("click", () => startMontageExport());
}

async function startMontageExport() {
  if (exportJobState.isBusy) return;
  if (!currentMultimediaSession) return;

  const btnConfirm = document.getElementById("btnConfirmExport");
  const modal = document.getElementById("videoExportModal");
  
  // Recoger opciones
  const resolution = document.querySelector('input[name="exportResolution"]:checked')?.value || "source";
  const bitrateMode = document.querySelector('input[name="exportBitrateMode"]:checked')?.value || "custom";
  const maxBitrateMbps = parseFloat(document.getElementById("exportBitrateMbps")?.value || "5");
  const minBitrateCrf = parseInt(document.getElementById("exportCrfValue")?.value || "23");

  const bitrateSettings = {
    mode: bitrateMode,
    maxBitrateMbps: maxBitrateMbps,
    minBitrateCrf: minBitrateCrf
  };

  try {
    exportJobState.isBusy = true;
    btnConfirm?.classList.add("btn-export-loading");
    btnConfirm.disabled = true;

    // Construir payload simplificado basado en lo que el backend espera
    // Reusamos la lógica de persistencia para obtener los sourceItems correctos
    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(currentMultimediaSession);
    const audioTimeline = currentMultimediaSession.panelMusicConfig || {};
    
    // El backend espera una estructura específica que normalizeMontageExportRequestBody procesa
    const payload = {
      sessionId: currentMultimediaSession.id,
      title: currentMultimediaSession.title || "Export Dashboard",
      resolution: resolution,
      bitrateSettings: bitrateSettings,
      format: "mp4_h264",
      qualityPreset: "balanced",
      includeBackgroundMusic: true,
      entries: entries.map(e => ({
        rowId: e.rowId,
        video: e.video,
        dialogueAudio: e.dialogueAudio,
        startMs: e.startMs,
        durationMs: e.durationMs,
        trimInMs: e.trimInMs,
        trimOutMs: e.trimOutMs,
        onScreenText: e.onScreenText
      })),
      backgroundMusic: currentMultimediaSession.panelMusicConfig || null,
      audioTimeline: {
         enabled: true,
         backgroundSegments: currentMultimediaSession.panelMusicConfig?.sourceItems || []
      }
    };

    console.log("[Dashboard] Iniciando exportación con payload:", payload);
    
    const response = await authFetchJson("/api/podcaster/montage/export", {
      method: "POST",
      body: JSON.stringify({ input: payload })
    });

    if (response.jobId) {
      exportJobState.jobId = response.jobId;
      modal?.classList.add("hidden");
      showNotification("🚀 Exportación iniciada. Te avisaremos cuando esté lista.", "info");
      pollExportStatus();
    } else {
      throw new Error("No se recibió jobId del servidor");
    }

  } catch (err) {
    console.error("[Dashboard] Error al iniciar exportación:", err);
    showNotification("❌ Error al iniciar exportación: " + err.message, "error");
  } finally {
    exportJobState.isBusy = false;
    btnConfirm?.classList.remove("btn-export-loading");
    if (btnConfirm) btnConfirm.disabled = false;
  }
}

async function pollExportStatus() {
  if (!exportJobState.jobId) return;

  try {
    const data = await authFetchJson(`/api/podcaster/montage/export-status?jobId=${encodeURIComponent(exportJobState.jobId)}`);
    
    if (data.status === "ready") {
      const url = data.downloadUrl || data.export?.downloadUrl;
      if (url) {
        showNotification("✅ ¡Video listo! Iniciando descarga...", "success");
        const a = document.createElement("a");
        a.href = url;
        a.download = data.export?.filename || "video-exportado.mp4";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      exportJobState.jobId = null;
    } else if (data.status === "error") {
      showNotification("❌ Error en la exportación: " + (data.error?.message || "Error desconocido"), "error");
      exportJobState.jobId = null;
    } else {
      // Seguimos polleando
      const progress = Math.round((data.progress || 0) * 100);
      console.log(`[Dashboard] Export progress: ${progress}% - Stage: ${data.stage}`);
      
      // Podríamos mostrar el progreso en un toast persistente o en el botón
      exportJobState.pollTimer = setTimeout(() => pollExportStatus(), 3000);
    }
  } catch (err) {
    console.warn("[Dashboard] Error al consultar estado de exportación:", err);
    exportJobState.pollTimer = setTimeout(() => pollExportStatus(), 5000);
  }
}

// Inicializar eventos de exportación
initExportUiEvents();

function renderUserItemList(container, items, type) {
  container.innerHTML = "";
  if (items.length === 0) {
    container.innerHTML = '<p class="text-muted">No has creado contenido aún.</p>';
    return;
  }

  console.log(`[Dashboard] Rendering ${items.length} items of type ${type}`);
  items.forEach(item => {
    const card = document.createElement("div");
    // Clase base según el tipo
    let accentClass = "workbench-item-lectura";
    if (type === "unidad") accentClass = "workbench-item-unidad";
    if (type === "download") accentClass = "workbench-item-download";
    if (type === "aprende") accentClass = "workbench-item-aprende";
    if (type === "multimedia" || type === "podcast") accentClass = "workbench-item-multimedia";
    
    card.className = `workbench-item ${accentClass}`;

    let displayTitle = "";
    let metaLabel = "";

    if (type === 'lectura') {
      displayTitle = item.titulo || item.lecturaTitulo || item.tema || (item.coleccion === 'lecturasNuevas' ? "sin titulo" : "Lectura sin título");
      metaLabel = "LECTURA";
    } else if (type === 'unidad') {
      const rawTitle = item.nombreUnidad || item.titulo || item.tema || "";
      if (rawTitle && String(rawTitle).toLowerCase() !== "sin título") {
        displayTitle = rawTitle;
        metaLabel = "UNIDAD";
      } else {
        const nivel = item.nivel || "";
        const grado = item.grado || "";
        const trimestre = item.trimestre || "";
        const unidadNum = item.unidad || "";

        let fallback = "";
        if (nivel) fallback += nivel + " ";
        if (grado) fallback += grado + "° ";
        if (trimestre) fallback += "- T" + trimestre + " ";
        if (unidadNum) fallback += "- U" + unidadNum;

        displayTitle = fallback.trim() || "Unidad sin título";
        metaLabel = "UNIDAD";
      }
    } else {
      displayTitle = item.titulo || item.nombre || "Documento";
      metaLabel = type.toUpperCase();
      
      // Ajuste específico para Aprende
      if (type === 'aprende') {
        displayTitle = item.nombre || "Sesión de Aprende";
      }
    }

    const rawDate = item.timestamp || item.creado || item.actualizado || item.updatedAt || item.sessionUpdatedAt || item.createdAt;
    
    let dateObj = null;
    if (rawDate) {
      if (rawDate.toDate) {
        dateObj = rawDate.toDate();
      } else if (rawDate.seconds !== undefined) {
        // Manejar objetos planos que parecen Timestamps {seconds, nanoseconds}
        dateObj = new Date(rawDate.seconds * 1000);
      } else {
        dateObj = new Date(rawDate);
      }
    }
    
    let date = "Fecha desconocida";
    if (dateObj && !isNaN(dateObj.getTime())) {
      date = dateObj.toLocaleDateString();
    }
    const isAdmin = ["admin", "superAdmin"].includes(currentUserRole);

    const contentText = item.texto || item.contenidoHTML || "";
    const preview = stripHTML(contentText).slice(0, 80) + (contentText.length > 80 ? "..." : "");

    let iconClass = "fas fa-file-alt";
    if (type === 'lectura') iconClass = "fas fa-book-open";
    if (type === 'unidad') iconClass = "fas fa-layer-group";
    if (type === 'download') iconClass = "fas fa-file-word";
    if (type === 'multimedia') iconClass = "fas fa-video";
    if (type === 'podcast') iconClass = "fas fa-microphone-lines";
    if (type === 'aprende') iconClass = "fas fa-wand-magic-sparkles";
    const typeLabel = type === 'lectura' ? 'Lectura' : type === 'unidad' ? 'Unidad' : type === 'aprende' ? 'Aprende' : 'Descarga';
    const statusLabel = item.publicar === true || item.published === true ? 'Publicada' : 'Borrador';

    let unitTypeLabel = "";
    if (type === 'unidad') {
      const isCategory = item.isCategory || item.tipoUnidad === 'categoria' || (!item.modulos || item.modulos.length === 0);
      const catName = item.categoria || item.subtema || item.tema || "";
      unitTypeLabel = isCategory
        ? `<span class="workbench-tag" title="${escapeHtml(catName)}">Categoría${catName ? ': ' + escapeHtml(catName) : ''}</span>`
        : `<span class="workbench-tag is-status">Unidad completa</span>`;
    } else if (type === 'aprende') {
      const numTemas = Array.isArray(item.temas) ? item.temas.length : 0;
      unitTypeLabel = `<span class="workbench-tag" style="background: rgba(99, 102, 241, 0.1); color: #6366f1; border-color: rgba(99, 102, 241, 0.2);">
        <i class="fas fa-layer-group mr-1"></i> ${numTemas} ${numTemas === 1 ? 'Tema' : 'Temas'}
      </span>`;
    }

    let authorName = item.propietarioNombre || item.creadoPor || item.autorReferencia || item.authorName || item.usuario || item.email || "Desconocido";
    const authorId = item.userId || item.uid || item.createdBy || item.ownerId || item.idUsuario;

    let editorInfo = "";
    if (item.editadoPor) {
      editorInfo = ` · Editado por ${escapeHtml(item.editadoPor)}`;
    }

    if (authorId) {
      if (auth.currentUser && authorId === auth.currentUser.uid) {
        authorName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || "Mí mismo";
      } else {
        const cached = usuariosCache.get(authorId);
        if (cached) {
          if (typeof cached === 'object') {
            authorName = cached.userName || cached.displayName || cached.nombre || cached.email || authorName;
          } else {
            authorName = cached;
          }
        } else if (isAdmin) {
          authorName = item.email || item.userEmail || (authorId.length > 15 ? authorId.slice(0, 8) + "..." : authorId);
        }
      }
    } else if (item.email) {
      authorName = item.email;
    } else if (!item.autorReferencia) {
      authorName = "Sistema / Migrado";
    }

    if (type === 'multimedia' || type === 'podcast') {
      const session = item.session || item;
      const ui = session?.podcastStudioUiState || {};
      const clipMap = session?.timelineClipMap || ui.timelineClipsByRowId || {};
      
      let previewUrl = "";
      const firstVideoClip = Object.values(clipMap).find(c => c.videoSrc);
      if (firstVideoClip) {
        const rawSrc = firstVideoClip.videoSrc;
        previewUrl = rawSrc.startsWith('gs://') 
          ? `${window.__CHARLY_CONFIG__?.apiBaseUrl}/api/assets/proxy-media?storagePath=${encodeURIComponent(rawSrc)}`
          : rawSrc;
      }

      card.className = `workbench-item workbench-item-multimedia accordion-item`;
      card.innerHTML = `
        <div class="multimedia-accordion-header">
          <div class="workbench-item-preview">
            ${previewUrl ? `<video src="${previewUrl}" muted playsinline></video>` : `<i class="fas fa-video" style="color: #475569; font-size: 16px;"></i>`}
          </div>
          <div class="workbench-item-title">${escapeHtml(displayTitle)}</div>
          <i class="fas fa-chevron-down multimedia-accordion-icon"></i>
        </div>
        <div class="multimedia-accordion-body">
          <div class="multimedia-details-grid">
            <div class="multimedia-detail-item">
              <span class="multimedia-detail-label">Autor</span>
              <span class="multimedia-detail-value">${escapeHtml(authorName.split('@')[0])}</span>
            </div>
            <div class="multimedia-detail-item">
              <span class="multimedia-detail-label">Fecha</span>
              <span class="multimedia-detail-value">${new Date(item.sessionUpdatedAt || item.updatedAt).toLocaleDateString()}</span>
            </div>
            <div class="multimedia-detail-item">
              <span class="multimedia-detail-label">Estado</span>
              <span class="multimedia-detail-value"><span class="workbench-tag is-status">Publicado</span></span>
            </div>
            <div class="multimedia-action-area">
              <button class="btn-multimedia-play-large btn-multimedia-play" data-id="${item.id}">
                <i class="fas fa-play-circle"></i> Ver Video
              </button>
            </div>
          </div>
        </div>
      `;

      const header = card.querySelector('.multimedia-accordion-header');
      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn-multimedia-play')) return;
        card.classList.toggle('is-expanded');
      });

      const video = card.querySelector('video');
      if (video) {
        card.addEventListener('mouseenter', () => video.play().catch(() => { }));
        card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
      }
    } else {
      card.className = `workbench-item ${accentClass} accordion-item`;
      card.innerHTML = `
        <div class="workbench-accordion-header">
          <div class="workbench-item-icon" aria-hidden="true">
            <img src="${type === 'aprende' ? 'woodstock.png' : 'SnoopyPodcastCreator.png'}" alt="Icon" class="flow-status-img" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">
          </div>

          <div class="workbench-item-copy">
            <div class="workbench-item-meta">
              <span>${escapeHtml(metaLabel)}</span>
            </div>
            <h2 class="workbench-item-title">${escapeHtml(displayTitle)}</h2>
          </div>
          
          <i class="fas fa-chevron-down workbench-accordion-icon"></i>
        </div>

        <div class="workbench-accordion-body">
          <div class="workbench-details-grid">
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Autor</span>
              <span class="workbench-detail-value">${escapeHtml(authorName)}</span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Fecha de creación</span>
              <span class="workbench-detail-value">${date}</span>
            </div>
            ${unitTypeLabel ? `
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Categoría / Nivel</span>
              <span class="workbench-detail-value">${unitTypeLabel}</span>
            </div>
            ` : ''}
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Estado</span>
              <span class="workbench-detail-value">
                <span class="workbench-tag is-status">${statusLabel}</span>
              </span>
            </div>
            
            <div class="workbench-action-area">
              <div class="workbench-item-actions" style="flex-direction: row; gap: 0.75rem; justify-content: flex-end; width: 100%;">
                ${type !== 'download' ? `
                  <a href="#" class="btn-workbench-action btn-item-edit" data-id="${item.id}" data-type="${type}" data-col="${item.coleccion || ''}" title="Editar" style="padding: 0.6rem 1.2rem; font-size: 0.85rem;">
                    <i class="fas fa-edit"></i>
                    <span>Editar</span>
                  </a>
                  ${type === 'lectura' ? `
                  <a href="#" class="btn-workbench-action ver-lectura" data-id="${item.id}" data-col="${item.coleccion || ''}" title="Ver lectura" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; background: #6366f1 !important; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3) !important;">
                    <i class="fas fa-eye"></i>
                    <span>Ver Lectura</span>
                  </a>
                  ` : ''}
                  ${type === 'aprende' ? `
                  <a href="#" class="btn-workbench-action ver-aprende" data-id="${item.id}" title="Ver Contenido" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; background: #f59e0b !important; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3) !important;">
                    <i class="fas fa-eye"></i>
                    <span>Ver Contenido</span>
                  </a>
                  ` : ''}
                ` : `
                  <span class="workbench-tag">Solo lectura</span>
                `}
              </div>
            </div>
          </div>
        </div>
      `;

      const header = card.querySelector('.workbench-accordion-header');
      header.addEventListener('click', (e) => {
        // No expandir si se hace clic en un botón de acción (aunque ahora están en el cuerpo)
        if (e.target.closest('.workbench-action')) return;
        card.classList.toggle('is-expanded');
      });
    }
    container.appendChild(card);
  });

  container.addEventListener('click', async (e) => {
    const btnEdit = e.target.closest('.btn-item-edit');
    const btnVer = e.target.closest('.ver-lectura');
    const btnVerAprende = e.target.closest('.ver-aprende');
    const btnPlay = e.target.closest('.btn-multimedia-play');

    if (btnVerAprende) {
      const id = btnVerAprende.dataset.id;
      openAprendeViewer(id);
      return;
    }

    if (btnPlay) {
      const id = btnPlay.dataset.id;
      try {
        const docRef = doc(db, "podcaster_sessions", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const session = data.session || data;
          session.id = id; // Crucial: Preservar el ID para guardado posterior
          abrirReproductorMultimedia(session);
        }
      } catch (err) {
        console.error("Error al cargar sesión para reproducir:", err);
      }
      return;
    }

    if (btnEdit) {
      const id = btnEdit.dataset.id;
      const type = btnEdit.dataset.type;
      if (type === 'lectura') {
        const col = btnEdit.dataset.col || 'lecturas';
        coleccionLecturaActual = col;
        abrirEditorLectura(id, col);
      } else if (type === 'unidad') {
        window.location.href = `generarLectura.html?unidadId=${id}&userId=${auth.currentUser.uid}&action=openUnidad`;
      } else if (type === 'multimedia') {
        window.location.href = `podcaster.html?sessionId=${id}`;
      } else if (type === 'podcast') {
        window.location.href = `podcaster.html?sessionId=${id}`;
      } else if (type === 'aprende') {
        window.location.href = `moodleCourse.html?cursoId=${id}`;
      }
    } else if (btnVer) {
      const id = btnVer.dataset.id;
      const col = btnVer.dataset.col || 'lecturas';

      if (typeof window.cbOpenLecturasAgentViewer === "function") {
        try {
          const docRef = doc(db, col, id);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const d = snap.data();
            const music = d?.music || d?.musica || {};
            const musicAssets = {
              readingUrl: String(music?.readingUrl || music?.lecturaUrl || d?.musicReadingUrl || "").trim(),
              gameUrl: String(music?.gameUrl || music?.juegoUrl || d?.musicGameUrl || "").trim(),
              readingPath: String(music?.readingPath || music?.lecturaPath || d?.musicReadingPath || "").trim(),
              gamePath: String(music?.gamePath || music?.juegoPath || d?.musicGamePath || "").trim()
            };
            window.cbOpenLecturasAgentViewer({
              id,
              coleccion: col,
              sourceCollection: col,
              titulo: d.titulo || d.tema || d.nombreUnidad || 'Lectura sin título',
              htmlLectura: d.contenidoHTML || d.texto || '<p>(Sin contenido)</p>',
              musicAssets,
              allowMusicGeneration: true,
              preguntas: Array.isArray(d.preguntas) ? d.preguntas : [],
              metadatos: {
                nivel: d.nivel || '',
                grado: d.grado || '',
                trimestre: d.trimestre || '',
                unidad: d.unidad ?? ''
              }
            });
          } else {
            alert("❌ No se encontró el documento en Firestore.");
          }
        } catch (err) {
          console.error("Error al abrir viewer:", err);
          alert("❌ Error al cargar los detalles de la lectura.");
        }
      } else {
        console.warn("Viewer no disponible en esta vista.");
        lecturaIdActual = id;
        coleccionLecturaActual = col;
        const btnVerGlobal = document.querySelector(`.ver-lectura[data-id="${id}"]`);
        if (btnVerGlobal) btnVerGlobal.click();
      }
    }
  });
}

function renderUserMonthlyStatsChart(canvasId, items, label, existingInstance, setInstance) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (existingInstance) existingInstance.destroy();

  const user = auth.currentUser;
  const isAdmin = ["admin", "superAdmin"].includes(currentUserRole);
  const myUid = user?.uid;

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(key);
  }

  const matrix = {};
  months.forEach(m => matrix[m] = {});

  items.forEach(item => {
    const ts = item.timestamp || item.createdAt || item.editadoEn;
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));

    if (!d || isNaN(d.getTime())) return;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    if (matrix[key]) {
      const authorId = item.userId || item.uid || item.createdBy || item.ownerId || item.creadoPor;
      if (!isAdmin && authorId !== myUid && item.userId !== myUid && item.uid !== myUid) return;

      const name = (authorId && authorId.includes('@')) ? authorId : (usuariosCache.get(authorId) || authorId || 'Desconocido');
      matrix[key][name] = (matrix[key][name] || 0) + 1;
    }
  });

  const userNames = new Set();
  Object.values(matrix).forEach(m => {
    Object.keys(m).forEach(name => userNames.add(name));
  });

  const colors = [
    'rgba(59, 130, 246, 0.7)',
    'rgba(147, 51, 234, 0.7)',
    'rgba(236, 72, 153, 0.7)',
    'rgba(249, 115, 22, 0.7)',
    'rgba(34, 197, 94, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(20, 184, 166, 0.7)',
    'rgba(234, 179, 8, 0.7)'
  ];

  const datasets = Array.from(userNames).map((name, i) => {
    return {
      label: name,
      data: months.map(m => matrix[m][name] || 0),
      backgroundColor: colors[i % colors.length],
      borderColor: colors[i % colors.length].replace('0.7', '1'),
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 40
    };
  });

  const xLabels = months.map(m => {
    const [year, month] = m.split('-');
    return new Date(year, month - 1).toLocaleString('es-ES', { month: 'short', year: '2-digit' });
  });

  const newChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: xLabels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: isAdmin && userNames.size > 1,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            usePointStyle: true,
            padding: 15,
            font: { size: 11 }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });

  setInstance(newChart);
}

function renderStatsChart(canvasId, items, label, existingInstance, setInstance) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (existingInstance) existingInstance.destroy();

  // Agrupar por mes en formato YYYY-MM para ordenar
  const stats = {};
  items.forEach(item => {
    const d = item.timestamp?.toDate ? item.timestamp.toDate() : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    stats[key] = (stats[key] || 0) + 1;
  });

  // Ordenar las llaves cronológicamente
  const sortedKeys = Object.keys(stats).sort();
  const labels = sortedKeys.map(key => {
    const [year, month] = key.split('-');
    const d = new Date(year, month - 1);
    return d.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
  });
  const data = sortedKeys.map(key => stats[key]);

  const newChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { display: false } },
        x: { grid: { display: false } }
      }
    }
  });

  setInstance(newChart);
}

/**
 * ACCESO DIRECTO AL EDITOR
 */
async function abrirEditorLectura(id, col) {
  // Redirigir a generarLectura.html con el ID de la lectura
  window.location.href = `generarLectura.html?editId=${id}&col=${col || 'lecturas'}`;
}

/**
 * LOG DE DESCARGAS DE WORD
 */
window.addEventListener('word-download-started', async (e) => {
  const user = auth.currentUser;
  if (!user) return;

  const { filename, title, mode, nuevoTitulo } = e.detail;

  try {
    await addDoc(collection(db, COLECCION_DOWNLOADS), {
      userId: user.uid,
      userEmail: user.email,
      userName: usuariosCache.get(user.uid) || user.email,
      filename,
      title,
      mode: mode || "desconocido", // Alumno / Maestro
      timestamp: new Date(),
      tituloUnidad: nuevoTitulo,   // ✅ Guardamos un campo explícito
      editadoEn: new Date(),
      editadoPor: auth.currentUser?.email || auth.currentUser?.uid || "Desconocido"
    });
    console.log("Descarga de Word registrada con éxito.");
  } catch (err) {
    console.error("Error al registrar descarga de Word:", err);
  }
});


// Inicializar el reproductor multimedia del dashboard
initMultimediaPlayer();

/**
 * Abre el viewer de Aprende (reutilizando el diseño de ascEditorBackdrop)
 */
async function openAprendeViewer(cursoId) {
  const modal = document.getElementById("ascEditorModal");
  const backdrop = document.getElementById("ascEditorBackdrop");
  const titleInput = document.getElementById("ascTitulo");
  const contentDiv = document.getElementById("ascEditorContent");
  const closeBtn = document.getElementById("ascEditorClose");
  const editBtn = document.getElementById("ascEditorGoToEdit");
  const wordBtn = document.getElementById("ascEditorDownloadWord");

  if (!modal || !contentDiv) return;

  // Reset y mostrar loading
  titleInput.value = "Cargando curso...";
  contentDiv.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 gap-4">
      <div class="loading-spinner-snoopy w-24 h-auto opacity-50"></div>
      <p class="text-slate-400 font-medium animate-pulse">Compilando módulos del curso...</p>
    </div>
  `;
  modal.classList.remove("hidden");

  // Botones de acción
  if (editBtn) {
    editBtn.onclick = () => {
      window.open(`generarLectura.html?id=${cursoId}`, '_blank');
    };
  }

  if (wordBtn) {
    wordBtn.onclick = () => {
      exportarAprendeViewerWord(titleInput.value, contentDiv.innerHTML);
    };
  }

  // Cerrar modal
  const closeModal = () => {
    modal.classList.add("hidden");
    contentDiv.innerHTML = "";
    titleInput.value = "";
  };

  closeBtn.onclick = closeModal;
  backdrop.onclick = closeModal;

  try {
    const docRef = doc(db, "moodleCourses", cursoId);
    const snap = await getDoc(docRef);
    
    if (!snap.exists()) {
      contentDiv.innerHTML = "<p class='text-danger'>El curso no existe o ha sido eliminado.</p>";
      return;
    }

    const curso = snap.data();
    titleInput.value = curso.titulo || curso.nombre || "Sin título";

    // Recopilar todos los IDs de módulos
    const modulosIds = [];
    (curso.temas || []).forEach(tema => {
      (tema.subtemas || []).forEach(sub => {
        if (sub.modulosIds) {
          sub.modulosIds.forEach(mId => {
            modulosIds.push({
              id: mId,
              tema: tema.nombre,
              subtema: sub.nombre
            });
          });
        }
      });
    });

    if (modulosIds.length === 0) {
      contentDiv.innerHTML = "<p class='text-muted italic text-center py-10'>Este curso aún no tiene módulos de contenido.</p>";
      return;
    }

    // Cargar contenidos de módulos en paralelo
    const promesas = modulosIds.map(async (m) => {
      const mDocId = m.id.includes('_') ? m.id : `${cursoId}_${m.id}`;
      const mRef = doc(db, "moodleCourses", mDocId);
      const mSnap = await getDoc(mRef);
      return mSnap.exists() ? { ...mSnap.data(), ...m } : null;
    });

    const resultados = await Promise.all(promesas);
    
    // Renderizar
    let fullHTML = "";
    let currentTema = "";
    let currentSubtema = "";

    resultados.filter(r => r && r.contenido).forEach(res => {
      // Mostrar separadores de tema/subtema si cambian
      if (res.tema !== currentTema) {
        fullHTML += `<div class="mt-12 mb-6 pb-2 border-b-2 border-slate-200"><h1 class="text-3xl font-black text-slate-800 uppercase tracking-tight">${escapeHtml(res.tema)}</h1></div>`;
        currentTema = res.tema;
      }
      if (res.subtema !== currentSubtema) {
        fullHTML += `<div class="mt-8 mb-4"><h2 class="text-xl font-bold text-indigo-600">${escapeHtml(res.subtema)}</h2></div>`;
        currentSubtema = res.subtema;
      }

      // El módulo
      fullHTML += `
        <div class="aprende-preview-module">
          <div class="aprende-preview-module-title">
            <i class="fas fa-cube"></i> ${escapeHtml(res.nombre || 'Módulo')}
          </div>
          <div class="aprende-preview-content-html">
            ${res.contenido}
          </div>
        </div>
      `;
    });

    if (!fullHTML) {
      contentDiv.innerHTML = "<p class='text-muted italic text-center py-10'>No se encontró contenido generado en los módulos.</p>";
    } else {
      contentDiv.innerHTML = fullHTML;
    }

  } catch (err) {
    console.error("[Dashboard] Error al abrir viewer Aprende:", err);
    contentDiv.innerHTML = "<p class='text-danger'>Error al cargar el contenido del curso.</p>";
  }
}

/**
 * Exporta el contenido del viewer a Word usando htmlDocx
 */
function exportarAprendeViewerWord(titulo, htmlContenido) {
  if (!window.htmlDocx) {
    alert("La librería de exportación a Word no está lista.");
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; }
  h1 { color: #1e293b; font-size: 24pt; margin-bottom: 20pt; }
  h2 { color: #4f46e5; font-size: 18pt; margin-top: 30pt; }
  h3 { color: #6366f1; font-size: 14pt; margin-top: 20pt; }
  .aprende-preview-module-title { font-weight: bold; color: #6366f1; text-transform: uppercase; margin-top: 20pt; }
  .aprende-preview-content-html { margin-bottom: 20pt; }
  table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
  th, td { border: 1px solid #cbd5e1; padding: 8pt; text-align: left; }
</style>
</head>
<body>
  <h1>${titulo}</h1>
  ${htmlContenido}
</body>
</html>
  `;

  try {
    const blob = window.htmlDocx.asBlob(html);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${titulo.replace(/[/\\?%*:|"<>]/g, '-')}.docx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (err) {
    console.error("Error al exportar a Word:", err);
    alert("Hubo un error al generar el archivo Word.");
  }
}
