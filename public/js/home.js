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
import { getDefaultFirebaseApp } from "./firebase-default-app.js";
import { escapeHtml, safeUrl, sanitizeRichText, sanitizeTextInput } from "./security-utils.js";
import { bootstrapFirebaseAppCheck } from "./firebase-app-check.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { authFetchJson, buildApiUrl, buildApiUrlPreferRemote, buildExportApiUrl, hasAvailableApiBase } from "./api-client.js";
import { PodcasterPlaybackController } from "../podcaster/podcaster-playback-controller.js?v=2026-1.0.10.572";
import { createPodcasterMediaRuntimeApi } from "../podcaster/podcaster-media-runtime.js?v=2026-1.0.10.539";
import { syncReelModeUi, resolveEffectiveExportResolution } from "../podcaster/podcaster-reels.js";
import { buildAugmentedTimelineRuntimeEntries } from "../podcaster/podcaster-scene-timing.js";
import { getTransitionForEdge } from "../podcaster/podcaster-scene-transition.js";
import { createPodcasterStageFullscreenController } from "../podcaster/podcaster-fullscreen.js";
import { buildPreviewDocument } from "./escape-room-package-builder.mjs";
import "../podcaster/podcaster-scene-media-render-spec.js";
import { createVideoPlayerReviewManager } from "./video-player-review-manager.js";
import { setScenePanelSectionVisibility, bindNewProposalToggleButtons } from "./video-player-panel-ui.js";

const app = getDefaultFirebaseApp();
void bootstrapFirebaseAppCheck(app);
// Home puede cargarse después de otros módulos que ya inicializaron Firestore.
// Reutilizamos la instancia existente para no inicializarla con opciones distintas.
const db = getFirestore(app);
const auth = getAuth(app);
const workbenchFilters = {
  lecturas: "published",
  unidades: "published",
  multimedia: "published",
  podcasts: "published",
  escapeRooms: "published",
  aprende: "published"
};
let chartLecturasInstance = null;
let chartUnidadesInstance = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await verificarRolUsuario(user);

    // Obtener nombre real del usuario
    obtenerNombreUsuarioActual(user).then(name => {
      currentUserName = name;

    });

    const sharedVideoSessionId = getSharedVideoSessionId();
    if (sharedVideoSessionId) {
      await openSharedVideoSession(sharedVideoSessionId);
    } else {
      // — Logic moved to sidebar.js —
      configurarEventos();
      configurarBuscador();
      configurarBusquedaWorkbench();
      initDashboardNavigation();

      await loadUserLecturas();
      await loadUserAprende();
      await renderImagenesCompartidas();
      await loadUserStats();
    }

    // Finalización de carga - Ocultar splash screen
    const loader = document.getElementById("appLoadingScreen");
    if (loader) {
      setTimeout(() => loader.classList.add("is-hidden"), 300);
    }
  } else {
    window.location.href = "index.html";
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
    return;
  }
  try {
    const sessionRef = doc(db, "podcaster_sessions", currentMultimediaSession.id);
    await updateDoc(sessionRef, {
      recentActivity: {
        userName: currentUserName,
        action: action,
        sceneIndex: (sceneIndex !== null && sceneIndex !== undefined) ? Number(sceneIndex) : -1,
        timestamp: Date.now()
      }
    });
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

let dashboardUnsubscribes = {
  lecturas: null,
  unidades: null,
  multimedia: null,
  podcasts: null,
  aprende: null,
  downloads: null
};
const escapeRoomPreviewCache = new Map();

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
    const lecturas2Marcadas = (lecturasCombinadas || []).filter(l => l.fromLecturasNuevas);

    const mapaLecturas = new Map();
    [...lecturas1, ...lecturas2Marcadas].forEach(l => mapaLecturas.set(l.id, l));
    lecturasCombinadas = Array.from(mapaLecturas.values());
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

  const wrapper = document.createElement("div");
  wrapper.className = "lectura-modal-image-wrapper";

  const img = document.createElement("img");
  img.src = safeImageUrl;
  img.alt = "Imagen de apoyo";

  wrapper.appendChild(img);
  container.appendChild(wrapper);
}

function renderLecturaModalContent(container, rawHtml = "", imageUrl = "", collectionName = "") {
  if (!container) return;
  container.replaceChildren();

  // Crear la superficie de papel (art-surface)
  const surface = document.createElement("div");
  surface.className = "modal-lectura-art-surface aprende-preview-content-html";
  container.appendChild(surface);

  const sanitizedHtml = sanitizeRichText(rawHtml || "", { fallback: "<p></p>" });
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(sanitizedHtml, "text/html");
  const bloques = Array.from(htmlDoc.body.children);

  const isASC = collectionName === "lecturasASC";
  let insertedImage = false;

  bloques.forEach((block) => {
    const clone = block.cloneNode(true);
    const blockText = String(clone.textContent || "").trim();
    if (!blockText && clone.tagName === "P") return; // Saltar párrafos vacíos

    if (isASC && clone.tagName === "P") {
      // Aplicar estilo de burbuja premium para ASC
      const bubbleBlock = document.createElement("div");
      bubbleBlock.className = "lectura-bubble-block";
      const bubble = document.createElement("div");
      bubble.className = "lectura-premium-bubble";
      bubble.appendChild(clone);
      bubbleBlock.appendChild(bubble);
      surface.appendChild(bubbleBlock);
    } else {
      surface.appendChild(clone);
    }

    // Inyectar imagen de apoyo si aplica
    if (!insertedImage && (blockText.toLowerCase().includes("análisis") || blockText.toLowerCase().includes("competencia") || blockText.toLowerCase().includes("estructura"))) {
      appendLecturaModalImage(surface, imageUrl);
      insertedImage = true;
    }
  });

  // Si no se insertó imagen y hay una disponible, ponerla al final
  if (!insertedImage && imageUrl) {
    appendLecturaModalImage(surface, imageUrl);
  }
}





// Like, comentario, modal
let eventosConfigurados = false;
const configurarEventos = () => {
  if (eventosConfigurados) return;
  eventosConfigurados = true;

  document.addEventListener("click", async (e) => {
    // 1. DETECCIÓN DE ELEMENTOS (Header vs Acción)
    const accHeader = e.target.closest(".workbench-accordion-header, .multimedia-accordion-header");
    const btnAction = e.target.closest(".ver-lectura, .aprobar-icon, .rechazar-icon, .archivar-lectura, .btn-workbench-action, .btn-multimedia-play");

    // 2. MANEJO DE ACORDEÓN (Si se hace click en el header y NO es un botón de acción)
    if (accHeader && !btnAction) {
      const card = accHeader.closest(".workbench-item, .item-lectura, .accordion-item");
      if (card) {
        card.classList.toggle("is-expanded");
        return;
      }
    }

    // 3. FILTRADO DE ACCIONES (Si no hay botón de acción, no hacer nada más)
    if (!btnAction) return;

    // Prevenir comportamiento por defecto para botones de acción (links con #)
    e.preventDefault();

    const id = btnAction.dataset.id;
    const user = auth.currentUser;
    if (!id || !user) return;

    const lecturaItem = e.target.closest(".item-lectura, .workbench-item");
    const coleccion = btnAction.dataset.coleccion || lecturaItem?.dataset.coleccion || "lecturas";
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



    // 4. VER LECTURA
    const btnVer = e.target.closest(".ver-lectura");
    if (btnVer) {
      const colVer = btnVer.dataset.coleccion || coleccion || "lecturas";
      await abrirLecturaDashboard(id, colVer);
      return;
    }

    // 5. ACCIONES DEL WORKBENCH (UNIDADES, MULTIMEDIA, APRENDE)
    const btnWorkbench = e.target.closest('.btn-workbench-action');
    if (btnWorkbench) {
      const wbType = btnWorkbench.dataset.type;

      if (wbType === 'unidad') {
        window.location.href = `generarLectura.html?unidadId=${id}&userId=${user.uid}&action=openUnidad`;
      } else if (wbType === 'multimedia' || wbType === 'podcast') {
        window.location.href = `podcaster.html?sessionId=${id}`;
      } else if (wbType === 'aprende') {
        window.location.href = `moodleCourse.html?cursoId=${id}`;
      } else if (wbType === 'aprende_ver') {
        openAprendeViewer(id);
      } else if (wbType === 'escapeRoom_preview') {
        void openEscapeRoomPreview(id, btnWorkbench.dataset.topicId || "");
      }
      return;
    }

    // 6. PLAY MULTIMEDIA
    const btnPlay = e.target.closest('.btn-multimedia-play');
    if (btnPlay) {
      const playerUrl = new URL("video-player.html", window.location.href);
      playerUrl.search = "";
      playerUrl.hash = "";
      playerUrl.searchParams.set("sessionId", id);
      window.open(playerUrl.href, "_blank", "noopener");
      return;
    }




  });

  // Cerrar modal
  document.body.addEventListener("click", (e) => {
    if (e.target.closest(".cerrar-modal") || e.target.id === "modalLectura") {
      const modal = document.getElementById("modalLectura");
      if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
        if (window.unsubscribeComentarios) window.unsubscribeComentarios();
      }
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

  // Cancelar suscripción previa si existe
  if (typeof dashboardUnsubscribes.aprende === 'function') {
    dashboardUnsubscribes.aprende();
  }

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("aprende");
  updateWorkbenchListTitle("aprende");
  contenedor.innerHTML = '<div class="flex justify-center p-8"><div class="loading-spinner-snoopy w-12 h-12 opacity-40"></div></div>';

  try {
    const isAdmin = ["admin", "superAdmin"].includes(currentUserRole);
    const filter = workbenchFilters.aprende || "published";

    let q;
    if (filter === "published") {
      q = query(collection(db, "moodleCourses"), where("publicar", "==", true), orderBy("actualizado", "desc"));
    } else {
      q = isAdmin
        ? query(collection(db, "moodleCourses"), orderBy("actualizado", "desc"))
        : query(collection(db, "moodleCourses"), where("userId", "==", user.uid), orderBy("actualizado", "desc"));
    }

    // Usar onSnapshot para sincronización en tiempo real
    dashboardUnsubscribes.aprende = onSnapshot(q, async (snap) => {
      let sesiones = snap.docs
        .filter(d => {
          const data = d.data();
          if (data.docType === "module") return false;
          if (data.archivado === true) return false;
          if (data.docType === "course") return true;
          return !d.id.includes("_") && Array.isArray(data.temas);
        })
        .map(d => ({ id: d.id, ...d.data(), type: 'aprende' }));

      const authorIds = new Set();
      sesiones.forEach(s => {
        if (s.userId) authorIds.add(s.userId);
        if (s.uid) authorIds.add(s.uid);
      });
      if (authorIds.size > 0) {
        await prefetchUsers(authorIds);
      }

      updateWorkbenchStats('aprende', sesiones);
      renderUserItemList(contenedor, sesiones, 'aprende');
    }, (err) => {
      console.error("[Dashboard] Error en onSnapshot Aprende:", err);
      contenedor.innerHTML = '<p class="text-danger">Error al sincronizar sesiones.</p>';
    });

  } catch (err) {
    console.error("[Dashboard] Error al iniciar carga de Aprende:", err);
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


let buscadorConfigurado = false;
const configurarBuscador = () => {
  if (buscadorConfigurado) return;
  buscadorConfigurado = true;

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
        const title = item.querySelector(".workbench-item-title")?.textContent.toLowerCase() || "";
        const meta = item.querySelector(".workbench-item-meta")?.textContent.toLowerCase() || "";
        item.style.display = title.includes(query) || meta.includes(query) ? "" : "none";
      });
    });
  };

  setupSearch("searchLecturas", "contenedorLecturasUser");
  setupSearch("searchUnidades", "contenedorUnidadesUser");
  setupSearch("searchMultimedia", "contenedorMultimediaUser");
  setupSearch("searchPodcasts", "contenedorPodcastsUser");
  setupSearch("searchEscapeRooms", "contenedorEscapeRoomsUser");
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
    document.getElementById("contenedorImagenesCompartidas"),
    document.getElementById("contenedorUnidadesUser"),
    document.getElementById("contenedorMultimediaUser"),
    document.getElementById("contenedorPodcastsUser"),
    document.getElementById("contenedorEscapeRoomsUser"),
    document.getElementById("contenedorAprendeUser")
  ].filter(Boolean);

  let hayResultados = false;

  contenedores.forEach(contenedor => {
    const tarjetas = contenedor.querySelectorAll(".item-lectura, .item-imagen, .workbench-item");

    tarjetas.forEach((t) => {
      const visible =
        (texto === "" || t.innerText.toLowerCase().includes(texto)) &&
        (nivel === "" || t.dataset.nivel === nivel) &&
        (grado === "" || t.dataset.grado === grado) &&
        (trimestre === "" || t.dataset.trimestre === trimestre) &&
        (unidad === "" || t.dataset.unidad === unidad);

      // Manejar diferentes modos de display
      if (visible) {
        if (t.classList.contains("item-imagen")) t.style.display = "flex";
        else if (t.classList.contains("workbench-item")) t.style.display = "block";
        else t.style.display = "block";
        hayResultados = true;
      } else {
        t.style.display = "none";
      }
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

// configurarEventos() y configurarBuscador() ya se llaman en onAuthStateChanged
// evitaremos la doble llamada para que no se dupliquen los event listeners
// configurarEventos();
// configurarBuscador();


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

// Detectar selección de texto (solo existe en el dashboard completo)
document.getElementById("modalTextoLectura")?.addEventListener('mouseup', () => {
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
  const modalTextoLectura = document.getElementById("modalTextoLectura");
  if (!comentarBtn || !modalComentario || !modalTextoLectura) return;
  const cerrarModal = modalComentario.querySelector(".cerrar-modal");
  const guardarComentarioBtn = document.getElementById("guardarComentarioBtn");
  const inputComentario = document.getElementById("inputComentario");

  // Variable global para almacenar el texto seleccionado
  let selectedText = "";

  // Detectar selección de texto
  modalTextoLectura.addEventListener('mouseup', () => {
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
comentarBtn?.addEventListener("click", () => {
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



document.getElementById("exportarModalInDesignBtn")?.addEventListener("click", () => {
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
    if (viewId === 'viewMultimedia') loadUserMultimedia();
    if (viewId === 'viewPodcasts') loadUserPodcasts();
    if (viewId === 'viewEscapeRooms') loadUserEscapeRooms();
  }
}

/**
 * CARGA DE DATOS DEL USUARIO
 */
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
      if (view === "escapeRooms") loadUserEscapeRooms();
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

  if (typeof dashboardUnsubscribes.unidades === 'function') {
    dashboardUnsubscribes.unidades();
  }

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("unidades");
  updateWorkbenchListTitle("unidades");
  contenedor.innerHTML = '<div class="flex justify-center p-8"><div class="loading-spinner-snoopy w-12 h-12 opacity-40"></div></div>';

  try {
    const isAdmin = isCurrentUserAdmin();
    const isEditorial = isCurrentUserEditorial();
    const filter = workbenchFilters.unidades || "published";

    let q;
    if (filter === "published") {
      q = query(collection(db, COLECCION_UNIDADES), where("publicar", "==", true), orderBy("timestamp", "desc"));
    } else {
      q = isAdmin
        ? query(collection(db, COLECCION_UNIDADES), orderBy("timestamp", "desc"))
        : query(collection(db, COLECCION_UNIDADES), where("userId", "==", user.uid), orderBy("timestamp", "desc"));
    }

    dashboardUnsubscribes.unidades = onSnapshot(q, async (snap) => {
      let unidades = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'unidad' }));

      // Pre-cargar nombres de autores
      const authorIds = new Set();
      unidades.forEach((data) => {
        if (data.userId) authorIds.add(data.userId);
        if (data.uid) authorIds.add(data.uid);
      });
      if (authorIds.size > 0) {
        await prefetchUsers(authorIds);
      }

      updateWorkbenchStats('unidades', unidades);
      renderUserItemList(contenedor, unidades, 'unidad');
      renderUserMonthlyStatsChart('chartUnidades', unidades, 'Unidades por Usuario/Mes', chartUnidadesInstance, (inst) => chartUnidadesInstance = inst);
    }, (err) => {
      console.error("Error en onSnapshot unidades:", err);
      contenedor.innerHTML = '<p class="text-danger">Error al sincronizar unidades.</p>';
    });

  } catch (err) {
    console.error("Error al cargar unidades del usuario:", err);
    contenedor.innerHTML = '<p class="text-danger">Error al iniciar carga de unidades.</p>';
  }
}

function updateWorkbenchStats(scope, items) {
  const total = Array.isArray(items) ? items.length : 0;
  const published = Array.isArray(items)
    ? items.filter((item) => item?.publicar === true || item?.published === true || item?.status === "published").length
    : 0;
  const prefixMap = {
    lecturas: 'lecturas',
    unidades: 'unidades',
    multimedia: 'multimedia',
    podcasts: 'podcasts',
    escapeRooms: 'escapeRooms',
    aprende: 'aprende'
  };
  const prefix = prefixMap[scope] || 'lecturas';
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
            usuariosCache.set(uid, snap.data());
          } else {
            usuariosCache.set(uid, { email: "Desconocido", firstName: "Usuario", lastName: "Desconocido" });
          }
        }).catch(() => usuariosCache.set(uid, { email: "Error" }))
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

  if (typeof dashboardUnsubscribes.multimedia === 'function') {
    dashboardUnsubscribes.multimedia();
  }

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("multimedia");
  contenedor.innerHTML = '<div class="flex justify-center p-8"><div class="loading-spinner-snoopy w-12 h-12 opacity-40"></div></div>';

  try {
    const isAdmin = isCurrentUserAdmin();
    const isEditorial = isCurrentUserEditorial();
    const filter = workbenchFilters.multimedia || "published";

    let q;
    if (filter === "published") {
      q = (isAdmin || isEditorial)
        ? query(collection(db, "podcaster_sessions"), where("publicar", "==", true), orderBy("updatedAt", "desc"), limit(100))
        : query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), where("publicar", "==", true), orderBy("updatedAt", "desc"), limit(100));
    } else {
      q = isAdmin
        ? query(collection(db, "podcaster_sessions"), orderBy("updatedAt", "desc"), limit(100))
        : query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), orderBy("updatedAt", "desc"), limit(100));
    }

    dashboardUnsubscribes.multimedia = onSnapshot(q, async (snap) => {
      let allItems = [];
      const authorIds = new Set();

      snap.forEach(docSnap => {
        const data = docSnap.data();
        const session = data.session || data;

        const isVideo = !!(data.videoMode === true ||
          session?.videoMode === true ||
          session?.script?.videoMode === true ||
          (session?.script?.videoContentType && session.script.videoContentType !== 'none') ||
          (session?.videoContentType && session.videoContentType !== 'none') ||
          (data.videoContentType && data.videoContentType !== 'none') ||
          (session?.dialogueVideoMap && Object.keys(session.dialogueVideoMap).length > 0) ||
          (session?.podcastStudioUiState?.dialogueVideosByRowId && Object.keys(session.podcastStudioUiState.dialogueVideosByRowId).length > 0));

        if (isVideo) {
          allItems.push({
            id: docSnap.id,
            ...data,
            titulo: data.title || data.session?.title || "Video sin nombre",
            type: 'multimedia',
            coleccion: "podcaster_sessions"
          });
          const authorId = data.ownerId || data.userId || data.uid;
          if (authorId) authorIds.add(authorId);
        }
      });

      if (authorIds.size > 0) await prefetchUsers(authorIds);

      renderUserItemList(contenedor, allItems, 'multimedia');

      const totalCount = document.getElementById("multimediaWorkbenchTotal");
      if (totalCount) totalCount.textContent = allItems.length;
      const pubCount = document.getElementById("multimediaWorkbenchPublished");
      if (pubCount) pubCount.textContent = allItems.filter(i => i.publicar === true).length;
    });

  } catch (err) {
    console.error("Error al cargar multimedia:", err);
    contenedor.innerHTML = '<p class="text-danger">Error al iniciar carga de videos.</p>';
  }
}

async function loadUserPodcasts() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorPodcastsUser");
  if (!contenedor) return;

  if (typeof dashboardUnsubscribes.podcasts === 'function') {
    dashboardUnsubscribes.podcasts();
  }

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("podcasts");
  contenedor.innerHTML = '<div class="flex justify-center p-8"><div class="loading-spinner-snoopy w-12 h-12 opacity-40"></div></div>';

  try {
    const isAdmin = isCurrentUserAdmin();
    const isEditorial = isCurrentUserEditorial();
    const filter = workbenchFilters.podcasts || "published";

    let q;
    if (filter === "published") {
      q = (isAdmin || isEditorial)
        ? query(collection(db, "podcaster_sessions"), where("publicar", "==", true), orderBy("updatedAt", "desc"), limit(100))
        : query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), where("publicar", "==", true), orderBy("updatedAt", "desc"), limit(100));
    } else {
      q = isAdmin
        ? query(collection(db, "podcaster_sessions"), orderBy("updatedAt", "desc"), limit(100))
        : query(collection(db, "podcaster_sessions"), where("ownerId", "==", user.uid), orderBy("updatedAt", "desc"), limit(100));
    }

    dashboardUnsubscribes.podcasts = onSnapshot(q, async (snap) => {
      let allItems = [];
      const authorIds = new Set();

      snap.forEach(docSnap => {
        const data = docSnap.data();
        const session = data.session || data;
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
            id: docSnap.id,
            ...data,
            titulo: data.title || data.session?.title || "Podcast sin nombre",
            type: 'podcast',
            coleccion: "podcaster_sessions"
          });
          const authorId = data.ownerId || data.userId || data.uid;
          if (authorId) authorIds.add(authorId);
        }
      });

      if (authorIds.size > 0) await prefetchUsers(authorIds);

      renderUserItemList(contenedor, allItems, 'podcast');

      const totalCount = document.getElementById("podcastsWorkbenchTotal");
      if (totalCount) totalCount.textContent = allItems.length;
      const pubCount = document.getElementById("podcastsWorkbenchPublished");
      if (pubCount) pubCount.textContent = allItems.filter(i => i.publicar === true).length;
    });

  } catch (err) {
    console.error("Error al cargar podcasts:", err);
    contenedor.innerHTML = '<p class="text-danger">Error al iniciar carga de podcasts.</p>';
  }
}

async function loadUserEscapeRooms() {
  const user = auth.currentUser;
  if (!user) return;

  const contenedor = document.getElementById("contenedorEscapeRoomsUser");
  if (!contenedor) return;

  configureWorkbenchFilters();
  updateWorkbenchFilterButtons("escapeRooms");
  contenedor.innerHTML = '<div class="flex justify-center p-8"><div class="loading-spinner-snoopy w-12 h-12 opacity-40"></div></div>';

  try {
    const snap = await getDocs(query(collection(db, "escapeRoom"), orderBy("updatedAt", "desc")));
    const filter = workbenchFilters.escapeRooms || "published";
    const isAdmin = isCurrentUserAdmin();

    let escapeRooms = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      coleccion: "escapeRoom",
      type: "escapeRoom"
    }));

    if (filter === "published") {
      escapeRooms = escapeRooms.filter((item) => item.status === "published");
    } else if (!isAdmin) {
      escapeRooms = escapeRooms.filter((item) => isUserOwnedDoc(item, user.uid) || item.ownerId === user.uid);
    }

    const authorIds = new Set();
    escapeRooms.forEach((item) => {
      if (item.ownerId) authorIds.add(item.ownerId);
      if (item.userId) authorIds.add(item.userId);
      if (item.uid) authorIds.add(item.uid);
    });
    if (authorIds.size > 0) await prefetchUsers(authorIds);

    updateWorkbenchStats("escapeRooms", escapeRooms);
    renderUserItemList(contenedor, escapeRooms, 'escapeRoom');
  } catch (err) {
    console.error("Error al cargar escape rooms:", err);
    updateWorkbenchStats("escapeRooms", []);
    contenedor.innerHTML = '<p class="text-danger">Error al cargar escape rooms.</p>';
  }
}

function closeEscapeRoomPreview() {
  const modal = document.getElementById("escapeRoomPreviewModal");
  const frame = document.getElementById("escapeRoomPreviewFrame");
  if (frame) frame.removeAttribute("srcdoc");
  if (modal) modal.classList.add("hidden");
}

async function openEscapeRoomPreview(id, topicId = "") {
  const cacheKey = topicId ? `${id}:${topicId}` : id;
  let project = escapeRoomPreviewCache.get(cacheKey);
  const modal = document.getElementById("escapeRoomPreviewModal");
  const frame = document.getElementById("escapeRoomPreviewFrame");
  const title = document.getElementById("escapeRoomPreviewTitle");

  if (!project && topicId) {
    try {
      const topicSnap = await getDoc(doc(db, "escapeRoom", id, "topics", topicId));
      const topicData = topicSnap.exists() ? topicSnap.data() : null;
      project = topicData?.project && typeof topicData.project === "object" ? topicData.project : null;
      if (project) escapeRoomPreviewCache.set(cacheKey, project);
    } catch (error) {
      console.error("No se pudo cargar el tema del escape room:", error);
    }
  }

  if (!project || !modal || !frame) {
    showNotification("No se pudo cargar el preview del escape room.", "error");
    return;
  }

  frame.srcdoc = buildPreviewDocument(project, { editorialReview: true });
  if (title) title.textContent = project.titulo || "Preview del Escape Room";
  modal.classList.remove("hidden");
}

document.getElementById("escapeRoomPreviewClose")?.addEventListener("click", closeEscapeRoomPreview);
document.getElementById("escapeRoomPreviewBackdrop")?.addEventListener("click", closeEscapeRoomPreview);




/**
 * REPRODUCTOR MULTIMEDIA (DASHBOARD)
 */
let currentMultimediaSession = null;
let multimediaPlayerUnsubscribe = null;
let homePlaybackState = {
  stageVideoSlot: 0,
  montageCursorMs: 0,
  montageAudioPlayers: {},
  montageActive: true
};

function extractDashboardSessionRows(session = null) {
  const source = session && typeof session === "object" ? session : {};
  const scriptRows = Array.isArray(source?.script?.rows) ? source.script.rows : [];
  const nestedSessionScriptRows = Array.isArray(source?.session?.script?.rows) ? source.session.script.rows : [];
  const nestedSessionRows = Array.isArray(source?.session?.rows) ? source.session.rows : [];
  const topRows = Array.isArray(source?.rows) ? source.rows : [];

  // Recopilar todos los sets de filas no vacíos
  const candidateSets = [scriptRows, nestedSessionScriptRows, nestedSessionRows, topRows].filter(s => s.length > 0);

  if (candidateSets.length === 0) {
    return [];
  }
  if (candidateSets.length === 1) return candidateSets[0];

  // Si hay varios, mezclarlos secuencialmente
  let merged = candidateSets[0];
  for (let i = 1; i < candidateSets.length; i++) {
    merged = mergeDashboardRows(merged, candidateSets[i]);
  }
  return merged;
}

function pickDashboardRowValue(primaryValue, fallbackValue) {
  if (typeof primaryValue === "string") {
    return primaryValue.trim() ? primaryValue : fallbackValue;
  }
  if (Array.isArray(primaryValue)) {
    return primaryValue.length ? primaryValue : (Array.isArray(fallbackValue) ? fallbackValue : primaryValue);
  }
  if (primaryValue == null) return fallbackValue;
  return primaryValue;
}

function mergeDashboardRowData(primaryRow = null, fallbackRow = null) {
  const primary = primaryRow && typeof primaryRow === "object" ? primaryRow : {};
  const fallback = fallbackRow && typeof fallbackRow === "object" ? fallbackRow : {};
  const merged = { ...fallback, ...primary };
  [
    "id",
    "text",
    "Guion",
    "guion",
    "guión",
    "voiceOverText",
    "narration",
    "voiceOver",
    "script",
    "sceneDescription",
    "description",
    "Descripción",
    "onScreenText",
    "Texto en Pantalla",
    "visualNotes",
    "visualElement",
    "Elemento visual",
    "Elemento Visual",
    "visualNotesOriginalText",
    "visualNotesProposal"
  ].forEach((key) => {
    if (key === "visualNotesProposal") {
      // Para la propuesta activa, respetamos el valor del documento principal incluso si es vacío
      merged[key] = (primary[key] !== undefined) ? String(primary[key] || "").trim() : pickDashboardRowValue(primary[key], fallback[key]);
    } else {
      merged[key] = pickDashboardRowValue(primary[key], fallback[key]);
    }
  });
  // Campos de propuestas: El documento de Firestore (primary) manda sobre la resolución
  merged.visualNotesProposals = normalizeDashboardProposalState(
    primary.visualNotesProposals !== undefined
      ? primary.visualNotesProposals
      : (fallback.visualNotesProposals || [])
  );
  merged.visualNotesResolvedProposals = normalizeDashboardProposalState(
    primary.visualNotesResolvedProposals !== undefined
      ? primary.visualNotesResolvedProposals
      : (fallback.visualNotesResolvedProposals || [])
  );

  return merged;
}

function resolveDashboardRowScript(row = null) {
  return String(
    row?.voiceOverText
    || row?.text
    || row?.Guion
    || row?.guion
    || row?.guión
    || row?.narration
    || row?.voiceOver
    || row?.script
    || ""
  ).trim();
}

function resolveDashboardRowSceneDescription(row = null) {
  return String(
    row?.sceneDescription
    || row?.Descripción
    || row?.description
    || row?.scenePrompt
    || row?.descripcionEscena
    || row?.descripcionDeEscena
    || row?.escena
    || row?.scene
    || ""
  ).trim();
}

function resolveDashboardRowOnScreenText(row = null) {
  return String(
    row?.onScreenText
    || row?.["Texto en pantalla"]
    || row?.["Texto en Pantalla"]
    || row?.textoPantalla
    || row?.textoEnPantalla
    || ""
  ).trim();
}

const HOME_DEFAULT_ON_SCREEN_TEXT_TRACK_SETTINGS = Object.freeze({
  enabled: true,
  showTrack: true,
  fontFamily: "Unbounded",
  fontSizePx: 44,
  stylePreset: "3d",
  fontWeight: "normal",
  fontStyle: "normal",
  fontVariant: "regular",
  textAlign: "center",
  textColor: "#f8fafc",
  karaokeHighlightColor: "#facc15",
  karaokeHighlightStyle: "pill",
  karaokeHighlightOpacity: 0.92,
  karaokeHighlightPaddingXPx: 10,
  karaokeHighlightPaddingYPx: 4,
  karaokeHighlightRadiusPx: 12,
  strokeColor: "#0f172a",
  strokeEnabled: true,
  strokeWidthPx: 3,
  textOpacity: 1,
  bgPreset: "glass",
  bgOpacity: 1,
  bgScale: 1,
  shadowEnabled: true,
  shadowBlurPx: 12,
  shadowOffsetXPx: 0,
  shadowOffsetYPx: 4,
  shadowOpacity: 0.55,
  shadowSizePx: 0
});

function normalizeHomeOnScreenTextTrackSettings(raw = null) {
  if (typeof window.normalizeOnScreenTextTrackSettings === "function") {
    return window.normalizeOnScreenTextTrackSettings(raw || {});
  }
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    ...HOME_DEFAULT_ON_SCREEN_TEXT_TRACK_SETTINGS,
    ...Object.fromEntries(
      Object.entries(source).filter(([, value]) => value !== undefined)
    )
  };
}

function buildDashboardMontageOnScreenTextSegments(session = null, runtimeEntries = []) {
  const activeSession = session || currentMultimediaSession;
  if (!activeSession) return { settings: { enabled: false }, segments: [], suppressFallbackFromEntries: true };
  const rows = extractDashboardSessionRows(activeSession) || [];
  const cfg = multimediaPlaybackDeps.getPodcastVideoConfig(activeSession) || {};
  const settings = normalizeHomeOnScreenTextTrackSettings(cfg?.onScreenTextTrack || {});
  const trackVisible = settings.enabled !== false && settings.showTrack !== false;
  const clipMap = cfg.timelineOnScreenTextClipsByRowId || {};
  const clips = Object.values(clipMap || {});
  const allHidden = clips.length > 0 && clips.every((clip) => clip?.hidden === true);
  const suppressFallbackFromEntries = allHidden || !trackVisible;
  if (!trackVisible) return { settings, segments: [], suppressFallbackFromEntries };

  const layoutMap = cfg.timelineOnScreenTextLayoutByRowId || {};
  const runtimeByRowId = new Map((Array.isArray(runtimeEntries) ? runtimeEntries : []).map((entry) => [String(entry?.rowId || "").trim(), entry]));
  
  const segments = rows.map((row, index) => {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return null;
    const clip = clipMap[rowId] || null;
    if (clip && clip.hidden === true) return null;
    const text = typeof window.getOnScreenTextClipText === 'function'
      ? window.getOnScreenTextClipText(row)
      : resolveDashboardRowOnScreenText(row);
    if (!text) return null;
    const runtime = runtimeByRowId.get(rowId) || null;
    const startMs = Math.max(0, Math.round(Number(clip?.startMs ?? runtime?.startMs ?? 0) || 0));
    const durationMs = Math.max(
      800,
      Math.round((typeof window.getOnScreenTextClipEffectiveDurationMs === 'function'
        ? window.getOnScreenTextClipEffectiveDurationMs(clip)
        : Number(clip?.trimOutMs || clip?.sourceDurationMs || 0) - Number(clip?.trimInMs || 0)) || runtime?.durationMs || 1000)
    );
    const layout = layoutMap[rowId] || (typeof window.buildDefaultOnScreenTextLayoutForRow === 'function'
      ? window.buildDefaultOnScreenTextLayoutForRow({ ...row, index: index + 1 }, settings)
      : { yPct: 0.92, widthPct: 0.85, heightPct: 0.14, xPct: 0 });
    return {
      id: `${rowId}-onscreen`,
      rowId,
      sceneIndex: index + 1,
      text,
      startMs,
      durationMs,
      trimInMs: Math.max(0, Math.round(Number(clip?.trimInMs || 0) || 0)),
      trimOutMs: Math.max(0, Math.round(Number(clip?.trimOutMs || 0) || 0)),
      zIndex: Math.max(1, Math.round(Number(clip?.zIndex || index + 1) || index + 1)),
      layout
    };
  }).filter(Boolean);
  return { settings, segments, suppressFallbackFromEntries };
}

function resolveDashboardRowVisualNotes(row = null) {
  return String(
    row?.visualNotes
    || row?.visualElement
    || row?.["Elemento visual"]
    || row?.["Elemento Visual"]
    || row?.visual
    || row?.elementoVisual
    || row?.elemento_visual
    || ""
  ).trim();
}

function resolveDashboardActiveRow(rows = [], activeEntry = null) {
  const list = Array.isArray(rows) ? rows : [];
  const entry = activeEntry && typeof activeEntry === "object" ? activeEntry : null;
  const byId = entry?.rowId ? list.find((row) => String(row?.id || "").trim() === String(entry.rowId || "").trim()) : null;
  if (byId) return byId;
  const idx = Number(entry?.index);
  if (Number.isFinite(idx) && idx >= 0 && idx < list.length) {
    return list[idx] || null;
  }
  return null;
}

function mergeDashboardRows(primaryRows = [], fallbackRows = []) {
  const primaryList = Array.isArray(primaryRows) ? primaryRows : [];
  const fallbackList = Array.isArray(fallbackRows) ? fallbackRows : [];
  const mergedRows = [];
  const fallbackById = new Map();
  fallbackList.forEach((row, index) => {
    const key = String(row?.id || `row-index-${index}`).trim();
    fallbackById.set(key, row);
  });
  primaryList.forEach((row, index) => {
    const key = String(row?.id || `row-index-${index}`).trim();
    mergedRows.push(mergeDashboardRowData(row, fallbackById.get(key)));
    fallbackById.delete(key);
  });
  // NO añadir filas huérfanas del fallback si ya tenemos filas en el set primario.
  // Esto evita que filas eliminadas en el Studio vuelvan a aparecer en el Dashboard.
  if (primaryList.length === 0) {
    fallbackById.forEach((row) => {
      mergedRows.push(mergeDashboardRowData({}, row));
    });
  }
  return mergedRows;
}

function buildDashboardProposalShallowRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const nextRow = { ...row };
    // Preservamos el ID original. No generamos IDs aleatorios aquí para evitar romper la sincronización.
    if (typeof nextRow.text === "string") nextRow.text = nextRow.text.trim();
    if (typeof nextRow.voiceOverText === "string") nextRow.voiceOverText = nextRow.voiceOverText.trim();
    return nextRow;
  });
}

function cloneDashboardSessionPayload(session = null) {
  if (!session || typeof session !== "object") return null;
  try {
    return JSON.parse(JSON.stringify(session));
  } catch (_) {
    return null;
  }
}

function isDashboardPlainRecord(value = null) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasDashboardRecordEntries(value = null) {
  return isDashboardPlainRecord(value) && Object.keys(value).length > 0;
}

function mergeDashboardRecordValue(topValue = null, nestedValue = null) {
  const top = isDashboardPlainRecord(topValue) ? topValue : {};
  const nested = isDashboardPlainRecord(nestedValue) ? nestedValue : {};
  if (!hasDashboardRecordEntries(top)) return nestedValue;
  if (!hasDashboardRecordEntries(nested)) return topValue;
  return { ...top, ...nested };
}

function mergeDashboardPanelMusicConfig(fallbackConfig = null, primaryConfig = null) {
  const fallback = isDashboardPlainRecord(fallbackConfig) ? fallbackConfig : {};
  const primary = isDashboardPlainRecord(primaryConfig) ? primaryConfig : {};
  const merged = {
    ...fallback,
    ...primary,
    trackLibrary: {
      ...(isDashboardPlainRecord(fallback.trackLibrary) ? fallback.trackLibrary : {}),
      ...(isDashboardPlainRecord(primary.trackLibrary) ? primary.trackLibrary : {})
    }
  };
  if (!Array.isArray(primary.sourceItems) && Array.isArray(fallback.sourceItems)) {
    merged.sourceItems = fallback.sourceItems;
  }
  return merged;
}

function buildDashboardSessionFromPodcasterDoc(data = null, sessionId = "", fallbackSession = null) {
  const docData = isDashboardPlainRecord(data) ? data : {};
  const nested = isDashboardPlainRecord(docData.session) ? docData.session : {};
  const topLevel = { ...docData };
  delete topLevel.session;

  const fallback = cloneDashboardSessionPayload(fallbackSession) || {};
  const session = {
    ...fallback,
    ...topLevel,
    ...nested,
    id: String(sessionId || nested.id || topLevel.id || fallback.id || "").trim()
  };

  const mergedRows = mergeDashboardRows(
    mergeDashboardRows(extractDashboardSessionRows(nested), extractDashboardSessionRows(topLevel)),
    extractDashboardSessionRows(fallback)
  );
  if (mergedRows.length) {
    session.script = {
      ...(isDashboardPlainRecord(fallback.script) ? fallback.script : {}),
      ...(isDashboardPlainRecord(topLevel.script) ? topLevel.script : {}),
      ...(isDashboardPlainRecord(nested.script) ? nested.script : {}),
      rows: mergedRows
    };
    session.rows = mergedRows;
  }

  const topVideoConfig = isDashboardPlainRecord(topLevel.podcastVideoConfig) ? topLevel.podcastVideoConfig : {};
  const nestedVideoConfig = isDashboardPlainRecord(nested.podcastVideoConfig) ? nested.podcastVideoConfig : {};
  const fallbackVideoConfig = isDashboardPlainRecord(fallback.podcastVideoConfig) ? fallback.podcastVideoConfig : {};
  session.podcastVideoConfig = mergeHomePodcastVideoConfig(
    mergeHomePodcastVideoConfig(fallbackVideoConfig, topVideoConfig),
    nestedVideoConfig
  );

  const topUi = isDashboardPlainRecord(topLevel.podcastStudioUiState) ? topLevel.podcastStudioUiState : {};
  const nestedUi = isDashboardPlainRecord(nested.podcastStudioUiState) ? nested.podcastStudioUiState : {};
  const fallbackUi = isDashboardPlainRecord(fallback.podcastStudioUiState) ? fallback.podcastStudioUiState : {};
  session.podcastStudioUiState = {
    ...fallbackUi,
    ...topUi,
    ...nestedUi,
    podcastVideoConfig: mergeHomePodcastVideoConfig(
      mergeHomePodcastVideoConfig(fallbackUi.podcastVideoConfig || {}, topUi.podcastVideoConfig || {}),
      nestedUi.podcastVideoConfig || {}
    )
  };

  [
    "dialogueVideoMap",
    "dialogueAudioMap",
    "timelineClipMap",
    "panelMusicConfig",
    "rowReferenceImageMap",
    "rowReferenceImageListMap",
    "rowReferenceVideoMap",
    "rowReferenceModeByRowId",
    "visualEffectsMap"
  ].forEach((key) => {
    const mergedValue = mergeDashboardRecordValue(
      mergeDashboardRecordValue(fallback[key], topLevel[key]),
      nested[key]
    );
    if (hasDashboardRecordEntries(mergedValue)) {
      session[key] = mergedValue;
    }
  });

  if (session.panelMusicConfig && !hasDashboardRecordEntries(session.podcastVideoConfig.panelMusicConfig)) {
    session.podcastVideoConfig = mergeHomePodcastVideoConfig(session.podcastVideoConfig, {
      panelMusicConfig: session.panelMusicConfig
    });
  } else if (session.panelMusicConfig) {
    session.podcastVideoConfig = mergeHomePodcastVideoConfig(session.podcastVideoConfig, {
      panelMusicConfig: mergeDashboardPanelMusicConfig(session.panelMusicConfig, session.podcastVideoConfig.panelMusicConfig)
    });
  }

  if (docData.publicar === true) session.publicar = true;
  if (docData.archived === true) session.archived = true;
  if (docData.ownerId || docData.updatedAt?.toDate) {
    session.cloudMeta = {
      ownerId: String(docData.ownerId || "").trim() || null,
      savedAt: docData.updatedAt?.toDate ? docData.updatedAt.toDate().toISOString() : null
    };
  }

  return session;
}

function findDashboardActiveRowIndex(rows = [], activeRowId = "", activeEntry = null) {
  const key = String(activeRowId || "").trim();
  const list = Array.isArray(rows) ? rows : [];
  let rowIndex = list.findIndex((row) => String(row?.id || "").trim() === key);
  if (rowIndex === -1 && key.startsWith("row_")) {
    const idx = parseInt(key.replace("row_", ""), 10);
    if (!Number.isNaN(idx) && list[idx]) rowIndex = idx;
  }
  if (rowIndex === -1 && activeEntry && Number.isFinite(Number(activeEntry.index))) {
    rowIndex = Number(activeEntry.index);
  }
  return rowIndex;
}

async function loadFullDashboardPodcasterSession(sessionId = "", fallbackSession = null) {
  const cleanId = String(sessionId || fallbackSession?.id || "").trim();
  if (!cleanId) return fallbackSession || null;
  try {
    const sessionRef = doc(db, "podcaster_sessions", cleanId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return fallbackSession || null;
    const data = sessionSnap.data() || {};
    const base = buildDashboardSessionFromPodcasterDoc(data, cleanId, fallbackSession);
    if (!base || typeof base !== "object") return fallbackSession || null;
    return base;
  } catch (error) {
    console.warn("[Dashboard] No se pudo cargar la sesión completa desde podcaster_sessions:", error);
    return fallbackSession || null;
  }
}

function getSharedVideoSessionId() {
  return String(new URLSearchParams(window.location.search).get("sessionId") || "").trim();
}

async function openSharedVideoSession(sessionId = "") {
  const cleanId = String(sessionId || "").trim();
  if (!cleanId) return false;

  document.body.classList.add("is-shared-video-view");
  try {
    const session = await loadFullDashboardPodcasterSession(cleanId, { id: cleanId });
    if (!session || !extractDashboardSessionRows(session).length) {
      throw new Error("La sesión no existe o no contiene escenas disponibles.");
    }
    await abrirReproductorMultimedia(session);
    document.title = `${String(session.title || "Video compartido").trim()} | Charly Brown`;
    return true;
  } catch (error) {
    console.error("[Dashboard] No se pudo abrir el enlace compartido:", error);
    const modal = document.getElementById("videoPlayerPage");
    if (modal) {
      modal.classList.remove("hidden");
      modal.innerHTML = `
        <div class="shared-video-error" role="alert">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <h1>No se pudo abrir el video</h1>
          <p>${escapeHtml(error?.message || "Comprueba que el enlace y tus permisos sean correctos.")}</p>
          <a href="home.html">Volver al inicio</a>
        </div>
      `;
    }
    return false;
  }
}

function createDashboardSessionFallback(data = null, sessionId = "") {
  const base = buildDashboardSessionFromPodcasterDoc(data, sessionId);
  if (!base || typeof base !== "object") {
    return { id: String(sessionId || "").trim() };
  }
  base.id = String(sessionId || base.id || "").trim();
  return base;
}

async function mutateDashboardProposalSession(activeRowId = "", mutator = null) {
  const sessionId = String(currentMultimediaSession?.id || "").trim();
  const rowId = String(activeRowId || window._currentActiveRowId || "").trim();
  if (!sessionId || !rowId || typeof mutator !== "function") return { ok: false, rowIndex: -1 };

  const sessionRef = doc(db, "podcaster_sessions", sessionId);

  try {
    const sessionSnap = await getDoc(sessionRef);
    const now = new Date().toISOString();
    const writeOps = [];
    let rowIndex = -1;

    if (sessionSnap.exists()) {
      const sDoc = sessionSnap.data() || {};
      const sSession = sDoc.session || sDoc;
      let sRows = null;
      const sRowsPath = "session.script.rows";

      if (Array.isArray(sSession.script?.rows)) {
        sRows = sSession.script.rows;
      } else if (Array.isArray(sSession.rows)) {
        sRows = sSession.rows;
      } else if (Array.isArray(sDoc.rows)) {
        sRows = sDoc.rows;
      }

      if (sRowsPath && Array.isArray(sRows)) {
        const rowsCopy = sRows.map(r => ({ ...r }));
        const idx = rowsCopy.findIndex(r => String(r.id || "").trim() === rowId);
        if (idx >= 0) {
          rowIndex = idx;
          if (mutator(rowsCopy, idx, sSession) === true) {
            const proposalRows = buildDashboardProposalShallowRows(rowsCopy);
            const payload = {
              [sRowsPath]: proposalRows,
              "session.updatedAt": now,
              sessionUpdatedAt: now,
              updatedAt: now
            };
            if (sSession.rowReferenceImageMap) {
              payload["session.rowReferenceImageMap"] = sSession.rowReferenceImageMap;
            }
            if (sSession.rowReferenceImageListMap) {
              payload["session.rowReferenceImageListMap"] = sSession.rowReferenceImageListMap;
            }
            if (sSession.rowReferenceModeByRowId) {
              payload["session.rowReferenceModeByRowId"] = sSession.rowReferenceModeByRowId;
            }
            writeOps.push(updateDoc(sessionRef, payload));
          }
        }
      }
    }

    if (writeOps.length > 0) {
      await Promise.all(writeOps);
    }

    return { ok: writeOps.length > 0, rowIndex, session: currentMultimediaSession };
  } catch (err) {
    console.error("[Dashboard] Error crítico en mutateDashboardProposalSession:", err);
    return { ok: false, rowIndex: -1, session: currentMultimediaSession };
  }
}

async function mutateDashboardSessionRows(mutator = null) {
  const sessionId = String(currentMultimediaSession?.id || "").trim();
  if (!sessionId || typeof mutator !== "function") return { ok: false, session: currentMultimediaSession };

  const sessionRef = doc(db, "podcaster_sessions", sessionId);
  try {
    const sessionSnap = await getDoc(sessionRef);
    const now = new Date().toISOString();
    if (!sessionSnap.exists()) return { ok: false, session: currentMultimediaSession };

    const sDoc = sessionSnap.data() || {};
    const sSession = sDoc.session || sDoc;
    let sRows = null;

    if (Array.isArray(sSession.script?.rows)) {
      sRows = sSession.script.rows;
    } else if (Array.isArray(sSession.rows)) {
      sRows = sSession.rows;
    } else if (Array.isArray(sDoc.rows)) {
      sRows = sDoc.rows;
    }

    if (!Array.isArray(sRows)) return { ok: false, session: currentMultimediaSession };

    const rowsCopy = sRows.map((row) => ({ ...row }));
    if (mutator(rowsCopy, sSession) !== true) return { ok: false, session: currentMultimediaSession };

    const payload = {
      "session.script.rows": buildDashboardProposalShallowRows(rowsCopy),
      "session.updatedAt": now,
      sessionUpdatedAt: now,
      updatedAt: now
    };
    if (sSession.rowReferenceImageMap) payload["session.rowReferenceImageMap"] = sSession.rowReferenceImageMap;
    if (sSession.rowReferenceImageListMap) payload["session.rowReferenceImageListMap"] = sSession.rowReferenceImageListMap;
    if (sSession.rowReferenceModeByRowId) payload["session.rowReferenceModeByRowId"] = sSession.rowReferenceModeByRowId;

    await updateDoc(sessionRef, payload);
    return { ok: true, session: currentMultimediaSession };
  } catch (err) {
    console.error("[Dashboard] Error crítico en mutateDashboardSessionRows:", err);
    return { ok: false, session: currentMultimediaSession };
  }
}

let videoPlayerReviewManager;
function getVideoPlayerReviewManager() {
  if (!videoPlayerReviewManager) {
    videoPlayerReviewManager = createVideoPlayerReviewManager({
      getDb: () => db,
      getAuth: () => auth,
      getSession: () => currentMultimediaSession,
      setSession: (session) => {
        currentMultimediaSession = session;
      },
      getController: () => multimediaPlaybackController,
      getRows: (session) => extractDashboardSessionRows(session),
      buildTimelineEntries: (session) => multimediaPlaybackDeps.buildTimelineRuntimeEntries(session),
      resolveActiveRow: (rows, activeEntry) => resolveDashboardActiveRow(rows, activeEntry),
      getCurrentUserName: () => currentUserName,
      mutateProposalSession: mutateDashboardProposalSession,
      mutateAllRows: mutateDashboardSessionRows,
      loadFullSession: loadFullDashboardPodcasterSession,
      syncTransport: () => multimediaPlaybackDeps.updatePodcastVideoTransportUi(),
      notifyActivity
    });
  }
  return videoPlayerReviewManager;
}

const storage = getStorage(app);
const multimediaPlaybackController = new PodcasterPlaybackController();
const multimediaMediaRuntimeApi = createPodcasterMediaRuntimeApi({
  buildApiUrlPreferRemote,
  buildApiUrl
});
const multimediaRuntimeResolveStaleAwareProxyMediaUrl = multimediaMediaRuntimeApi.resolveStaleAwareProxyMediaUrl;
const markStaleProxyMediaUrl = multimediaMediaRuntimeApi.markStaleProxyMediaUrl;

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseFirebaseStorageObjectUrl(rawUrl = "") {
  const clean = String(rawUrl || "").trim();
  if (!clean) return null;
  try {
    const parsed = new URL(clean, window.location.origin);
    const host = String(parsed.hostname || "").toLowerCase();
    const isFirebaseStorageHost = (
      host === "firebasestorage.googleapis.com"
      || host.endsWith("firebasestorage.app")
      || host === "storage.googleapis.com"
    );
    if (!isFirebaseStorageHost) return null;
    if (host === "firebasestorage.googleapis.com") {
      const match = String(parsed.pathname || "").match(/^\/(?:v0\/)?b\/([^/]+)\/o\/(.+)$/);
      if (!match) return null;
      const bucket = String(match[1] || "").trim();
      let objectPath = String(match[2] || "").trim();
      if (!bucket || !objectPath) return null;
      try { objectPath = decodeURIComponent(objectPath); } catch (_) { }
      if (/%2f/i.test(objectPath) || /%25/i.test(objectPath)) {
        try { objectPath = decodeURIComponent(objectPath); } catch (_) { }
      }
      objectPath = objectPath.replace(/^\/+/, "").trim();
      return objectPath ? { bucket, storagePath: objectPath } : null;
    }
    if (host === "storage.googleapis.com") {
      const parts = String(parsed.pathname || "").split("/").filter(Boolean);
      if (parts.length < 2) return null;
      const bucket = String(parts.shift() || "").trim();
      const normalizedStoragePath = parts.join("/").trim();
      return bucket && normalizedStoragePath ? { bucket, storagePath: normalizedStoragePath } : null;
    }
    const pathname = String(parsed.pathname || "").replace(/^\/+/, "").trim();
    return pathname ? { bucket: host, storagePath: pathname } : null;
  } catch (_) {
    return null;
  }
}

function deriveStoragePathFromMediaSource(rawUrl = "", storagePath = "") {
  const cleanStoragePath = String(storagePath || "").trim();
  if (cleanStoragePath) return cleanStoragePath;
  const parsed = parseFirebaseStorageObjectUrl(rawUrl);
  return String(parsed?.storagePath || "").trim();
}

function resolveStaleAwareProxyMediaUrl(rawUrl = "", storagePath = "", kind = "media") {
  return multimediaRuntimeResolveStaleAwareProxyMediaUrl(rawUrl, storagePath, kind);
}

function resolveStorageVideoUrl(downloadUrl, storagePath) {
  const clean = String(downloadUrl || "").trim();
  const cleanStoragePath = deriveStoragePathFromMediaSource(clean, storagePath || "");
  if (!clean && !cleanStoragePath) return "";
  if (!hasAvailableApiBase()) return clean;
  try {
    if (cleanStoragePath) {
      return resolveStaleAwareProxyMediaUrl(clean, cleanStoragePath, "media");
    }
    if (clean.startsWith("/api/assets/proxy-media?")) return buildApiUrlPreferRemote(clean);
    if (clean.startsWith("/api/assets/proxy-image?")) {
      const parsedProxy = new URL(buildApiUrlPreferRemote(clean), window.location.origin);
      const nested = String(parsedProxy.searchParams.get("url") || "").trim();
      return nested ? buildApiUrlPreferRemote(`/api/assets/proxy-media?url=${encodeURIComponent(nested)}`) : buildApiUrlPreferRemote(clean);
    }
    const parsed = new URL(clean, window.location.origin);
    const pathname = String(parsed.pathname || "").toLowerCase();
    const hasVideoExt = /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(pathname);
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(String(parsed.hostname || ""));
    if (isStorageUrl || hasVideoExt) {
      return buildApiUrlPreferRemote(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
    }
    return clean;
  } catch (_) {
    return clean;
  }
}

function resolveStorageAudioUrl(downloadUrl, storagePath) {
  const clean = String(downloadUrl || "").trim();
  const cleanStoragePath = deriveStoragePathFromMediaSource(clean, storagePath || "");
  if (!clean && !cleanStoragePath) return "";
  if (!hasAvailableApiBase()) return clean;
  try {
    const firebaseGsUrl = (() => {
      const gsSource = String(cleanStoragePath || clean || "").trim();
      if (!gsSource.startsWith("gs://")) return "";
      const withoutScheme = gsSource.replace(/^gs:\/\//i, "");
      const slashIndex = withoutScheme.indexOf("/");
      if (slashIndex < 0) return "";
      const bucket = String(withoutScheme.slice(0, slashIndex) || "").trim();
      const objectPath = String(withoutScheme.slice(slashIndex + 1) || "").trim();
      if (!bucket || !objectPath) return "";
      return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
    })();
    if (firebaseGsUrl) {
      return buildApiUrlPreferRemote(`/api/assets/proxy-media?url=${encodeURIComponent(firebaseGsUrl)}`);
    }
    if (cleanStoragePath) {
      return resolveStaleAwareProxyMediaUrl(clean, cleanStoragePath, "media");
    }
    if (clean.startsWith("/api/assets/proxy-media?")) return buildApiUrlPreferRemote(clean);
    if (clean.startsWith("/api/assets/proxy-image?")) {
      const parsedProxy = new URL(buildApiUrlPreferRemote(clean), window.location.origin);
      const nested = String(parsedProxy.searchParams.get("url") || "").trim();
      return nested ? buildApiUrlPreferRemote(`/api/assets/proxy-media?url=${encodeURIComponent(nested)}`) : buildApiUrlPreferRemote(clean);
    }
    const parsed = new URL(clean, window.location.origin);
    const pathname = String(parsed.pathname || "").toLowerCase();
    const hasAudioExt = /\.(wav|mp3|ogg|m4a|flac)(?:$|\?)/i.test(pathname);
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(String(parsed.hostname || ""));
    if (isStorageUrl || hasAudioExt) {
      return buildApiUrlPreferRemote(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
    }
    return clean;
  } catch (_) {
    return clean;
  }
}

async function resolveAuthorizedAssetUrl(proxyUrl = "") {
  const clean = String(proxyUrl || "").trim();
  if (!clean) return "";

  const parsed = new URL(clean, window.location.origin);
  const storagePath = String(parsed.searchParams.get("storagePath") || "").trim();
  if (!storagePath) return clean;

  const data = await authFetchJson(
    `/api/assets/signed-url?storagePath=${encodeURIComponent(storagePath)}`
  );
  const signedUrl = String(data?.url || "").trim();
  if (!signedUrl) throw new Error("signed_asset_url_missing");
  return signedUrl;
}

const HOME_TIMELINE_MIN_CLIP_MS = 500;

function normalizeHomePanelMusicDuckingWhenGeminiPct(value, fallback = 60) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  if (raw >= 40 && raw <= 100) return raw;
  if (raw >= 0 && raw < 40) return Math.max(40, 100 - raw);
  return fallback;
}

function normalizeHomePanelMusicVolume(value, fallback = 0) {
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : fallback;
}

function normalizeHomePanelMusicMutedLoopIndexes(value = []) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => Math.max(0, Math.floor(Number(item) || 0)))
      .filter((item) => Number.isFinite(item) && item >= 0 && item <= 999)
  )).sort((a, b) => a - b);
}

function normalizeHomePanelMusicLoopSettings(value = [], sourceDurationMs = 0) {
  if (!Array.isArray(value)) return [];
  const maxDurationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, Math.round(Number(sourceDurationMs || 0) || 0));
  const maxTrimInMs = Math.max(0, maxDurationMs - HOME_TIMELINE_MIN_CLIP_MS);
  const map = new Map();
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const loopIndex = Math.max(0, Math.floor(Number(item.loopIndex) || 0));
    if (!Number.isFinite(loopIndex) || loopIndex > 999) return;
    const trimInMs = Math.max(0, Math.min(maxTrimInMs, Math.round(Number(item.trimInMs || 0) || 0)));
    const rawTrimOutMs = Math.round(Number(item.trimOutMs || maxDurationMs) || maxDurationMs);
    const trimOutMs = Math.max(trimInMs + HOME_TIMELINE_MIN_CLIP_MS, Math.min(maxDurationMs, rawTrimOutMs));
    map.set(loopIndex, {
      loopIndex,
      trimInMs,
      trimOutMs,
      fadeInMs: Math.max(0, Math.min(trimOutMs - trimInMs, Math.round(Number(item.fadeInMs || 0) || 0))),
      fadeOutMs: Math.max(0, Math.min(trimOutMs - trimInMs, Math.round(Number(item.fadeOutMs || 0) || 0)))
    });
  });
  return Array.from(map.values()).sort((a, b) => a.loopIndex - b.loopIndex);
}

function normalizeHomePanelMusicTrack(track = null) {
  if (!track || typeof track !== "object") return null;
  const sourceDurationMs = Math.max(0, Math.round((Number(track.durationSec || 0) || 0) * 1000));
  const startOffsetMs = Math.max(0, Math.round(Number(track.startOffsetMs || 0) || 0));
  const maxTrimInMs = Math.max(0, sourceDurationMs - HOME_TIMELINE_MIN_CLIP_MS);
  const trimInMs = Math.max(0, Math.min(maxTrimInMs, Math.round(Number(track.trimInMs || 0) || 0)));
  const rawTrimOutMs = Math.round(Number(track.trimOutMs || sourceDurationMs) || sourceDurationMs);
  const trimOutMs = sourceDurationMs > 0
    ? Math.max(trimInMs + HOME_TIMELINE_MIN_CLIP_MS, Math.min(sourceDurationMs, rawTrimOutMs))
    : 0;
  return {
    libraryId: String(track.libraryId || "").trim(),
    slotLabel: String(track.slotLabel || "").trim(),
    enabledInSession: track.enabledInSession !== false,
    loopEnabled: track.loopEnabled !== false,
    name: String(track.name || "Audio").trim() || "Audio",
    mimeType: String(track.mimeType || "audio/mpeg").trim() || "audio/mpeg",
    size: Math.max(0, Number(track.size || 0) || 0),
    durationSec: Math.max(0, Number(track.durationSec || 0) || 0),
    startOffsetMs,
    trimInMs,
    trimOutMs,
    localDataUrl: String(track.localDataUrl || "").trim(),
    localMediaCacheKey: String(track.localMediaCacheKey || "").trim(),
    dataUrl: String(track.dataUrl || track.localDataUrl || "").trim(),
    downloadUrl: String(track.downloadUrl || "").trim(),
    storagePath: String(track.storagePath || "").trim(),
    updatedAt: String(track.updatedAt || "").trim(),
    model: String(track.model || "").trim(),
    prompt: String(track.prompt || "").trim(),
    durationMeasuredWith: String(track.durationMeasuredWith || "").trim().toLowerCase(),
    montageVolume: normalizeHomePanelMusicVolume(
      track.montageVolume !== undefined ? track.montageVolume : 100,
      100
    ),
    duckingWhenGeminiPct: normalizeHomePanelMusicDuckingWhenGeminiPct(track.duckingWhenGeminiPct, 60),
    stabilize: track.stabilize === true,
    loopSettings: normalizeHomePanelMusicLoopSettings(track.loopSettings || [], sourceDurationMs),
    mutedLoopIndexes: normalizeHomePanelMusicMutedLoopIndexes(track.mutedLoopIndexes || []),
    segmentStartOverrides: Array.isArray(track.segmentStartOverrides)
      ? track.segmentStartOverrides
        .map((item) => ({
          loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
          startMs: Math.max(0, Math.round(Number(item?.startMs || 0) || 0))
        }))
        .filter((item) => Number.isFinite(item.loopIndex) && item.loopIndex <= 999 && Number.isFinite(item.startMs))
      : []
  };
}

function normalizeHomePanelMusicTrackList(value = []) {
  const list = Array.isArray(value) ? value.map((item) => normalizeHomePanelMusicTrack(item)).filter(Boolean) : [];
  return list.map((track, index) => ({
    ...track,
    slotLabel: String(track.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
    enabledInSession: track.enabledInSession !== false
  }));
}

function resolveHomePanelMusicTrackKind(value = "") {
  return String(value || "").trim() === "ai" ? "ai" : "uploaded";
}

function getHomePanelMusicUploadedTracks(cfg = null) {
  const uploadedTracks = normalizeHomePanelMusicTrackList(cfg?.trackLibrary?.uploadedTracks || []);
  if (uploadedTracks.length) return uploadedTracks;
  const uploaded = normalizeHomePanelMusicTrack(cfg?.trackLibrary?.uploaded || null);
  if (uploaded) {
    return [{ ...uploaded, slotLabel: String(uploaded.slotLabel || "Audio 1").trim() || "Audio 1" }];
  }
  const track = normalizeHomePanelMusicTrack(cfg?.track || null);
  if (track && !track.model) {
    return [{ ...track, slotLabel: String(track.slotLabel || "Audio 1").trim() || "Audio 1" }];
  }
  return [];
}

function getHomePanelMusicTrackDurationSec(track = null) {
  const normalized = normalizeHomePanelMusicTrack(track);
  const directDurationSec = Math.max(0, Number(normalized?.durationSec || 0) || 0);
  if (directDurationSec > 0.05) return directDurationSec;
  const sizeBytes = Math.max(0, Number(normalized?.size || 0) || 0);
  if (sizeBytes <= 0) return 0;
  const mimeType = String(normalized?.mimeType || "").trim().toLowerCase();
  if (!mimeType.includes("wav") && !mimeType.includes("wave")) {
    return 0;
  }
  const bitsPerSecond = 1411200;
  return Math.max(0, Number(((sizeBytes * 8) / bitsPerSecond).toFixed(2)) || 0);
}

function resolveHomePanelMusicTrackByKind(cfg = null, kind = "") {
  const trackKind = resolveHomePanelMusicTrackKind(kind || cfg?.selectedTrackKind || "uploaded");
  const selectedTrack = normalizeHomePanelMusicTrack(cfg?.track || null);
  if (trackKind === "uploaded") {
    const uploadedTracks = getHomePanelMusicUploadedTracks(cfg).filter((track) => track?.enabledInSession !== false);
    if (selectedTrack && !selectedTrack.model) {
      const selectedSlotLabel = String(selectedTrack.slotLabel || "").trim();
      const match = uploadedTracks.find((item) => String(item?.slotLabel || "").trim() === selectedSlotLabel);
      if (match) return normalizeHomePanelMusicTrack(match);
      return selectedTrack;
    }
    return normalizeHomePanelMusicTrack(uploadedTracks[0] || null);
  }
  if (cfg?.trackLibrary?.ai) return normalizeHomePanelMusicTrack(cfg.trackLibrary.ai);
  if (selectedTrack?.model) return selectedTrack;
  return null;
}

function normalizeHomePanelMusicSourceItems(sourceItems = [], cfg = null, options = {}) {
  if (!Array.isArray(sourceItems)) return [];
  const resolveAudio = typeof options.resolveStorageAudioUrl === "function" ? options.resolveStorageAudioUrl : resolveStorageAudioUrl;
  const uploadedTracks = getHomePanelMusicUploadedTracks(cfg);
  const panelVolume = normalizeHomePanelMusicVolume(cfg?.montageVolume, 100);
  const panelDucking = normalizeHomePanelMusicDuckingWhenGeminiPct(cfg?.duckingWhenGeminiPct, 60);
  return sourceItems.map((item) => {
    const trackIndex = Math.max(0, Math.floor(Number(item?.trackIndex || 0) || 0));
    const loopIndex = Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0));
    const track = uploadedTracks[trackIndex] || null;
    const normalizedLoopSettings = Array.isArray(track?.loopSettings)
      ? track.loopSettings.map((loopSetting) => ({
        loopIndex: Math.max(0, Math.floor(Number(loopSetting?.loopIndex || 0) || 0)),
        trimInMs: Math.max(0, Math.round(Number(loopSetting?.trimInMs || 0) || 0)),
        trimOutMs: Math.max(0, Math.round(Number(loopSetting?.trimOutMs || 0) || 0)),
        fadeInMs: Math.max(0, Math.round(Number(loopSetting?.fadeInMs || 0) || 0)),
        fadeOutMs: Math.max(0, Math.round(Number(loopSetting?.fadeOutMs || 0) || 0))
      }))
      : [];
    const loopSetting = normalizedLoopSettings.find((entry) => entry.loopIndex === loopIndex);
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
    const sourceUrl = String(resolveAudio(item?.sourceUrl || item?.downloadUrl || "", item?.storagePath || "") || "").trim();
    const localDataUrl = String(item?.localDataUrl || track?.localDataUrl || "").trim();
    const localMediaCacheKey = String(item?.localMediaCacheKey || track?.localMediaCacheKey || "").trim();
    const effectiveSourceUrl = sourceUrl
      || (localDataUrl.startsWith("podcaster-local-media:") ? localDataUrl : "")
      || (localMediaCacheKey ? `podcaster-local-media:${localMediaCacheKey}` : "")
      || localDataUrl;
    if (!effectiveSourceUrl && !localMediaCacheKey) return null;
    const startOffsetMs = Math.max(0, Math.round(Number(item?.startOffsetMs ?? item?.startMs ?? 0) || 0));
    const rawEndOffsetMs = Math.round(Number(item?.endOffsetMs ?? item?.endMs ?? 0) || 0);
    const rawDurationMs = Math.round(Number(item?.durationMs || 0) || 0);
    const durationMs = Math.max(0, rawDurationMs || rawEndOffsetMs - startOffsetMs);
    const endOffsetMs = Math.max(startOffsetMs, rawEndOffsetMs || (startOffsetMs + durationMs));
    const loopTrimInMs = loopSetting ? loopSetting.trimInMs : 0;
    const loopTrimOutMs = loopSetting ? loopSetting.trimOutMs : 0;
    const loopFadeInMs = loopSetting ? loopSetting.fadeInMs : 0;
    const loopFadeOutMs = loopSetting ? loopSetting.fadeOutMs : 0;
    const mutedLoopIndexes = new Set(normalizeHomePanelMusicMutedLoopIndexes(track?.mutedLoopIndexes || []));
    return {
      ...item,
      sourceUrl,
      startOffsetMs,
      endOffsetMs,
      durationSec: Math.max(0, Number(item?.durationSec || durationMs / 1000) || 0),
      trimInMs: Math.max(0, Math.round(hasOwn(item, "trimInMs")
        ? Number(item?.trimInMs || 0)
        : loopTrimInMs)),
      trimOutMs: Math.max(0, Math.round(hasOwn(item, "trimOutMs")
        ? Number(item?.trimOutMs || 0)
        : loopTrimOutMs)),
      fadeInMs: Math.max(0, Math.round(hasOwn(item, "fadeInMs")
        ? Number(item?.fadeInMs || 0)
        : loopFadeInMs)),
      fadeOutMs: Math.max(0, Math.round(hasOwn(item, "fadeOutMs")
        ? Number(item?.fadeOutMs || 0)
        : loopFadeOutMs)),
      trackIndex,
      loopIndex,
      muted: item?.muted === true || mutedLoopIndexes.has(loopIndex),
      sourceUrl: effectiveSourceUrl,
      localDataUrl,
      localMediaCacheKey,
      volume: item?.volume !== undefined
        ? normalizeHomePanelMusicVolume(item.volume, panelVolume)
        : (track?.montageVolume !== undefined ? normalizeHomePanelMusicVolume(track.montageVolume, panelVolume) : panelVolume),
      duckingWhenGeminiPct: normalizeHomePanelMusicDuckingWhenGeminiPct(
        item?.duckingWhenGeminiPct ?? item?.duckingPct ?? track?.duckingWhenGeminiPct,
        panelDucking
      ),
      stabilize: item?.stabilize !== undefined
        ? item.stabilize === true
        : (track?.stabilize !== undefined ? track.stabilize : cfg?.stabilize === true)
    };
  }).filter(Boolean);
}

function buildHomeUploadedPanelMusicSegments(session = null, options = {}) {
  const cfg = options.config || null;
  const buildTimelineRuntimeEntries = typeof options.buildTimelineRuntimeEntries === "function"
    ? options.buildTimelineRuntimeEntries
    : (() => []);
  const getTimelineTotalDurationMs = typeof options.getTimelineTotalDurationMs === "function"
    ? options.getTimelineTotalDurationMs
    : ((s) => {
      const entries = buildTimelineRuntimeEntries(s);
      if (!entries.length) return HOME_TIMELINE_MIN_CLIP_MS;
      return Math.max(HOME_TIMELINE_MIN_CLIP_MS, ...entries.map((entry) => Math.max(0, Number(entry?.endMs || 0) || 0)));
    });
  const allTracks = getHomePanelMusicUploadedTracks(cfg);
  const uploadedTracks = allTracks.filter((track) => track?.enabledInSession !== false && getHomePanelMusicTrackDurationSec(track) > 0.05);
  const entries = buildTimelineRuntimeEntries(session);
  const totalDurationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, getTimelineTotalDurationMs(session));
  const sceneEntries = entries.length ? entries : [{ startMs: 0, endMs: totalDurationMs }];
  if (!uploadedTracks.length) return [];
  const resolveFullTrackIndex = (track = null, fallbackIndex = 0) => {
    const normalized = normalizeHomePanelMusicTrack(track);
    if (!normalized) return Math.max(0, Math.floor(Number(fallbackIndex) || 0));
    const slotLabel = String(normalized.slotLabel || "").trim();
    if (slotLabel) {
      const byLabel = allTracks.findIndex((item) => String(item?.slotLabel || "").trim() === slotLabel);
      if (byLabel >= 0) return byLabel;
    }
    const byIdentity = allTracks.findIndex((item) => item === track);
    if (byIdentity >= 0) return byIdentity;
    return Math.max(0, Math.floor(Number(fallbackIndex) || 0));
  };
  const applyOverrides = (segmentList = []) => segmentList.map((segment) => {
    const trackIndex = Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0));
    const loopIndex = Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0));
    const track = allTracks[trackIndex] || null;
    const overrides = Array.isArray(track?.segmentStartOverrides) ? track.segmentStartOverrides : [];
    const override = overrides.find((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) === loopIndex);
    if (!override) return segment;
    const durationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, Math.round(Number(segment?.endMs || 0) - Number(segment?.startMs || 0) || 0));
    const nextStart = Math.max(0, Math.min(totalDurationMs - durationMs, Math.round(Number(override.startMs || 0) || 0)));
    return {
      ...segment,
      startMs: nextStart,
      endMs: nextStart + durationMs
    };
  });
  if (uploadedTracks.length === 1) {
    const single = uploadedTracks[0];
    const fullTrackIndex = resolveFullTrackIndex(single, 0);
    const durationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, Math.round(getHomePanelMusicTrackDurationSec(single) * 1000));
    const segments = [];
    let sceneCursor = 0;
    let loopIndex = 0;
    const maxLoopCount = single.loopEnabled === false ? 1 : 120;
    while (sceneCursor < sceneEntries.length && loopIndex < maxLoopCount) {
      const startMs = Math.max(0, Number(sceneEntries[sceneCursor]?.startMs || 0) || 0);
      let endSceneCursor = sceneCursor;
      let segmentEndMs = Math.max(startMs, Number(sceneEntries[sceneCursor]?.endMs || startMs) || startMs);
      while (endSceneCursor + 1 < sceneEntries.length) {
        const candidateEndMs = Math.max(
          segmentEndMs,
          Number(sceneEntries[endSceneCursor + 1]?.endMs || segmentEndMs) || segmentEndMs
        );
        if ((candidateEndMs - startMs) > durationMs + 1) break;
        endSceneCursor += 1;
        segmentEndMs = candidateEndMs;
      }
      const sceneBatchDurationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, segmentEndMs - startMs);
      const loopSettings = normalizeHomePanelMusicLoopSettings(single?.loopSettings || [], sceneBatchDurationMs);
      const loopSetting = loopSettings.find((item) => item.loopIndex === loopIndex) || {
        loopIndex,
        trimInMs: 0,
        trimOutMs: sceneBatchDurationMs
      };
      const trimInMs = Math.max(
        0,
        Math.min(
          sceneBatchDurationMs - HOME_TIMELINE_MIN_CLIP_MS,
          Number(loopSetting?.trimInMs || 0) || 0
        )
      );
      const trimOutMs = Math.max(
        trimInMs + HOME_TIMELINE_MIN_CLIP_MS,
        Math.min(sceneBatchDurationMs, Number(loopSetting?.trimOutMs || sceneBatchDurationMs) || sceneBatchDurationMs)
      );
      segments.push({
        ...single,
        slotLabel: String(single.slotLabel || "Audio 1").trim() || "Audio 1",
        trackIndex: fullTrackIndex,
        startMs,
        endMs: startMs + trimOutMs,
        durationSec: getHomePanelMusicTrackDurationSec(single),
        trimInMs,
        trimOutMs,
        fadeInMs: Math.max(0, Math.min(trimOutMs - trimInMs, Number(loopSetting?.fadeInMs || 0) || 0)),
        fadeOutMs: Math.max(0, Math.min(trimOutMs - trimInMs, Number(loopSetting?.fadeOutMs || 0) || 0)),
        loop: false,
        loopIndex
      });
      sceneCursor = endSceneCursor + 1;
      loopIndex += 1;
    }
    return applyOverrides(segments);
  }
  const segments = [];
  let sceneCursor = 0;
  uploadedTracks.forEach((track, index) => {
    if (sceneCursor >= sceneEntries.length) return;
    const fullTrackIndex = resolveFullTrackIndex(track, index);
    const trackDurationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, Math.round(getHomePanelMusicTrackDurationSec(track) * 1000));
    const remainingTracksAfterCurrent = Math.max(0, uploadedTracks.length - index - 1);
    const startMs = Math.max(0, Number(sceneEntries[sceneCursor]?.startMs || 0) || 0);
    let endSceneCursor = sceneCursor;
    let segmentEndMs = Math.max(startMs, Number(sceneEntries[sceneCursor]?.endMs || startMs) || startMs);
    while (endSceneCursor + 1 < sceneEntries.length) {
      const remainingScenesAfterCandidate = Math.max(0, sceneEntries.length - (endSceneCursor + 2));
      if (remainingScenesAfterCandidate < remainingTracksAfterCurrent) break;
      const candidateEndMs = Math.max(segmentEndMs, Number(sceneEntries[endSceneCursor + 1]?.endMs || segmentEndMs) || segmentEndMs);
      if ((candidateEndMs - startMs) > trackDurationMs + 1) break;
      endSceneCursor += 1;
      segmentEndMs = candidateEndMs;
    }
    const availableDurationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, totalDurationMs - startMs);
    const visibleDurationMs = Math.max(HOME_TIMELINE_MIN_CLIP_MS, Math.min(trackDurationMs, availableDurationMs));
    segments.push({
      ...track,
      slotLabel: String(track.slotLabel || `Audio ${index + 1}`).trim() || `Audio ${index + 1}`,
      trackIndex: fullTrackIndex,
      startMs,
      endMs: startMs + visibleDurationMs,
      durationSec: getHomePanelMusicTrackDurationSec(track),
      trimInMs: 0,
      trimOutMs: visibleDurationMs,
      fadeInMs: Math.max(0, Math.min(visibleDurationMs, Number(track?.loopSettings?.find?.((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) === 0)?.fadeInMs || 0) || 0)),
      fadeOutMs: Math.max(0, Math.min(visibleDurationMs, Number(track?.loopSettings?.find?.((item) => Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)) === 0)?.fadeOutMs || 0) || 0)),
      loop: false,
      loopIndex: 0
    });
    sceneCursor = endSceneCursor + 1;
  });
  return applyOverrides(segments);
}

function buildHomePanelMontageMusicConfig(session = null, options = {}) {
  const rawCfg = session?.podcastVideoConfig?.panelMusicConfig
    || session?.script?.podcastVideoConfig?.panelMusicConfig
    || session?.panelMusicConfig
    || session?.session?.panelMusicConfig
    || session?.panelMusicState || session?.session?.panelMusicState ||
    session?.podcastStudioUiState?.panelMusicState ||
    session?.podcastStudioUiState?.panelMusicConfig;
  const cfg = rawCfg ? JSON.parse(JSON.stringify(rawCfg)) : { sourceType: "none" };
  const normalized = {
    preset: ["ambient", "focus", "pulse"].includes(String(cfg?.preset || "").trim()) ? String(cfg.preset).trim() : "ambient",
    volume: normalizeHomePanelMusicVolume(cfg?.volume, 22),
    montageVolume: normalizeHomePanelMusicVolume(cfg?.montageVolume, 100),
    duckingWhenGeminiPct: normalizeHomePanelMusicDuckingWhenGeminiPct(cfg?.duckingWhenGeminiPct ?? cfg?.duckingPct, 60),
    stabilize: cfg?.stabilize === true || String(cfg?.stabilize || "").trim().toLowerCase() === "true",
    limiterEnabled: cfg?.limiterEnabled === true || String(cfg?.limiterEnabled || "").trim().toLowerCase() === "true",
    sourceType: String(cfg?.sourceType || "").trim() === "track" ? "track" : "preset",
    selectedTrackKind: resolveHomePanelMusicTrackKind(cfg?.selectedTrackKind || "uploaded"),
    trackLibrary: {
      uploaded: normalizeHomePanelMusicTrack(cfg?.trackLibrary?.uploaded || null),
      uploadedTracks: normalizeHomePanelMusicTrackList(cfg?.trackLibrary?.uploadedTracks || []),
      ai: normalizeHomePanelMusicTrack(cfg?.trackLibrary?.ai || null)
    },
    track: normalizeHomePanelMusicTrack(cfg?.track || null),
    sourceItems: Array.isArray(cfg?.sourceItems) ? cfg.sourceItems : []
  };
  if (!normalized.trackLibrary.uploaded && normalized.track && !normalized.track.model) {
    normalized.trackLibrary.uploaded = normalized.track;
  }
  if (!normalized.trackLibrary.uploadedTracks.length && normalized.trackLibrary.uploaded) {
    normalized.trackLibrary.uploadedTracks = [{
      ...normalized.trackLibrary.uploaded,
      slotLabel: String(normalized.trackLibrary.uploaded.slotLabel || "Audio 1").trim() || "Audio 1"
    }];
  }
  if (!normalized.trackLibrary.ai && normalized.track && normalized.track.model) {
    normalized.trackLibrary.ai = normalized.track;
  }
  const resolveAudio = typeof options.resolveStorageAudioUrl === "function" ? options.resolveStorageAudioUrl : resolveStorageAudioUrl;
  const uploadedMode = normalized.selectedTrackKind === "uploaded";
  const activeTrack = resolveHomePanelMusicTrackByKind(normalized, normalized.selectedTrackKind) || normalized.track;
  const persistedSourceItems = normalizeHomePanelMusicSourceItems(normalized.sourceItems, normalized, { resolveStorageAudioUrl: resolveAudio });
  const uploadedSegments = uploadedMode && !persistedSourceItems.length
    ? buildHomeUploadedPanelMusicSegments(session, {
      config: normalized,
      buildTimelineRuntimeEntries: options.buildTimelineRuntimeEntries,
      getTimelineTotalDurationMs: options.getTimelineTotalDurationMs
    })
    : [];
  const uploadedTracks = getHomePanelMusicUploadedTracks(normalized);
  const sourceItems = persistedSourceItems.length
    ? persistedSourceItems
    : uploadedSegments.map((segment) => {
      const trackIndex = Math.max(0, Math.floor(Number(segment?.trackIndex || 0) || 0));
      const loopIndex = Math.max(0, Math.floor(Number(segment?.loopIndex || 0) || 0));
      const track = uploadedTracks[trackIndex] || null;
      const mutedLoopIndexes = new Set(normalizeHomePanelMusicMutedLoopIndexes(track?.mutedLoopIndexes || []));
      const sourceUrl = String(resolveAudio(segment?.sourceUrl || segment?.downloadUrl || segment?.localDataUrl || segment?.dataUrl || "", segment?.storagePath || "") || "").trim();
      const localDataUrl = String(segment?.localDataUrl || "").trim();
      const localMediaCacheKey = String(segment?.localMediaCacheKey || track?.localMediaCacheKey || "").trim();
      const effectiveSourceUrl = sourceUrl
        || (localDataUrl.startsWith("podcaster-local-media:") ? localDataUrl : "")
        || (localMediaCacheKey ? `podcaster-local-media:${localMediaCacheKey}` : "")
        || localDataUrl;
      return {
        slotLabel: String(segment?.slotLabel || "").trim(),
        sourceUrl: effectiveSourceUrl,
        localDataUrl,
        localMediaCacheKey,
        startOffsetMs: Math.max(0, Number(segment?.startMs || 0) || 0),
        endOffsetMs: Math.max(0, Number(segment?.endMs || 0) || 0),
        loop: segment?.loop === true,
        durationSec: Math.max(0, Number(segment?.durationSec || 0) || 0),
        trimInMs: Math.max(0, Number(segment?.trimInMs || 0) || 0),
        trimOutMs: Math.max(0, Number(segment?.trimOutMs || 0) || 0),
        fadeInMs: Math.max(0, Number(segment?.fadeInMs || 0) || 0),
        fadeOutMs: Math.max(0, Number(segment?.fadeOutMs || 0) || 0),
        trackIndex,
        loopIndex,
        muted: mutedLoopIndexes.has(loopIndex),
        volume: track?.montageVolume !== undefined ? track.montageVolume : normalized.montageVolume,
        duckingWhenGeminiPct: track?.duckingWhenGeminiPct !== undefined ? track.duckingWhenGeminiPct : normalized.duckingWhenGeminiPct,
        stabilize: track?.stabilize !== undefined ? track.stabilize : normalized.stabilize
      };
    }).filter((segment) => segment.sourceUrl || segment.localDataUrl || segment.localMediaCacheKey);
  const sourceUrl = (!uploadedMode && normalized.sourceType === "track")
    ? (() => {
      const trackSourceUrl = String(resolveAudio(activeTrack?.sourceUrl || activeTrack?.downloadUrl || "", activeTrack?.storagePath || "") || "").trim();
      if (trackSourceUrl) return trackSourceUrl;
      if (String(activeTrack?.localDataUrl || "").trim()) return String(activeTrack?.localDataUrl || "").trim();
      const trackLocalMediaCacheKey = String(activeTrack?.localMediaCacheKey || "").trim();
      if (trackLocalMediaCacheKey) return `podcaster-local-media:${trackLocalMediaCacheKey}`;
      return "";
    })()
    : "";
  const localDataUrl = String(activeTrack?.localDataUrl || "").trim();
  const localMediaCacheKey = String(activeTrack?.localMediaCacheKey || "").trim();
  const hasActiveTrackSource = Boolean(sourceUrl || localDataUrl || localMediaCacheKey);
  const sourceType = uploadedMode
    ? (sourceItems.length ? "track" : "none")
    : (normalized.sourceType === "track" || hasActiveTrackSource ? "track" : "none");
  return {
    sourceType,
    preset: normalized.preset,
    sourceUrl,
    sourceItems,
    volume: normalized.montageVolume,
    duckingWhenGeminiPct: normalized.duckingWhenGeminiPct,
    stabilize: normalized.stabilize,
    limiterEnabled: normalized.limiterEnabled,
    durationSec: Math.max(0, Number(activeTrack?.durationSec || 0) || 0),
    startOffsetMs: Math.max(0, Number(activeTrack?.startOffsetMs || 0) || 0),
    trimInMs: Math.max(0, Number(activeTrack?.trimInMs || 0) || 0),
    trimOutMs: Math.max(0, Number(activeTrack?.trimOutMs || 0) || 0),
    loopEnabled: activeTrack?.loopEnabled !== false,
    loopSettings: Array.isArray(activeTrack?.loopSettings)
      ? activeTrack.loopSettings.map((item) => ({
        loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
        trimInMs: Math.max(0, Number(item?.trimInMs || 0) || 0),
        trimOutMs: Math.max(0, Number(item?.trimOutMs || 0) || 0),
        fadeInMs: Math.max(0, Number(item?.fadeInMs || 0) || 0),
        fadeOutMs: Math.max(0, Number(item?.fadeOutMs || 0) || 0)
      }))
      : [],
    mutedLoopIndexes: normalizeHomePanelMusicMutedLoopIndexes(activeTrack?.mutedLoopIndexes || []),
    localDataUrl,
    localMediaCacheKey,
    enabled: sourceType !== "none" && (!!sourceUrl || sourceItems.length > 0)
  };
}

function hasHomeTimelineVisualEntry(entry = null) {
  const videoSrc = String(entry?.videoSrc || entry?.imageSrc || "").trim();
  const backgroundColor = String(entry?.clip?.backgroundColor || entry?.backgroundColor || "").trim();
  return Boolean(videoSrc || backgroundColor);
}

function hasHomeTimelineEntry(entry = null) {
  const videoSrc = String(entry?.videoSrc || entry?.imageSrc || "").trim();
  const audioSrc = String(entry?.audioSrc || "").trim();
  const backgroundColor = String(entry?.clip?.backgroundColor || entry?.backgroundColor || "").trim();
  return Boolean(videoSrc || backgroundColor || audioSrc);
}

function resolveHomeTimelineRuntimeOverlapPairAtMs(session = null, currentMs = 0, runtimeEntries = null) {
  const entries = Array.isArray(runtimeEntries) ? runtimeEntries : [];
  const targetMs = Math.max(0, Number(currentMs || 0) || 0);
  const toleranceMs = 12;
  const activeEntries = entries
    .filter((entry) => {
      const startMs = Math.max(0, Number(entry?.startMs || 0));
      const endMs = Math.max(startMs, Number(entry?.endMs || 0));
      return targetMs >= (startMs - toleranceMs) && targetMs <= (endMs + toleranceMs);
    })
    .filter((entry) => hasHomeTimelineVisualEntry(entry))
    .sort((a, b) =>
      Number(a?.startMs || 0) - Number(b?.startMs || 0)
      || Number(a?.zIndex || 0) - Number(b?.zIndex || 0)
      || Number(a?.index || 0) - Number(b?.index || 0)
    );
  if (activeEntries.length < 2) {
    return {
      activeEntries,
      backEntry: null,
      frontEntry: null,
      overlapStartMs: 0,
      overlapEndMs: 0,
      overlapDurationMs: 0,
      progress: 1,
      isOverlapActive: false
    };
  }
  const backEntry = activeEntries[activeEntries.length - 2] || null;
  const frontEntry = activeEntries[activeEntries.length - 1] || null;
  const overlapStartMs = Math.max(
    0,
    Number(backEntry?.startMs || 0),
    Number(frontEntry?.startMs || 0)
  );
  const overlapEndMs = Math.min(
    Math.max(overlapStartMs, Number(backEntry?.endMs || overlapStartMs)),
    Math.max(overlapStartMs, Number(frontEntry?.endMs || overlapStartMs))
  );
  const overlapDurationMs = Math.max(0, overlapEndMs - overlapStartMs);
  const progress = overlapDurationMs > 0
    ? Math.max(0, Math.min(1, (Math.max(0, Number(currentMs || 0)) - overlapStartMs) / overlapDurationMs))
    : 1;
  return {
    activeEntries,
    backEntry,
    frontEntry,
    overlapStartMs,
    overlapEndMs,
    overlapDurationMs,
    progress,
    isOverlapActive: overlapDurationMs >= 20
  };
}

function normalizeDialogueAudioPlaybackRate(value = 1) {
  return Math.max(0.5, Math.min(2.25, Number(value || 1) || 1));
}

function resolveDialogueAudioPlaybackRate(session = null, rowId = "") {
  const s = session || (typeof currentMultimediaSession !== "undefined" ? currentMultimediaSession : null);
  const key = String(rowId || "").trim();
  if (!key || !s) return 1;
  
  // Combinar todas las fuentes posibles de configuración de audio para no perder nada
  const audioMap = {
    ...(s.script?.dialogueAudioMap || {}),
    ...(s.podcastStudioUiState?.dialogueAudiosByRowId || {}),
    ...(s.dialogueAudioMap || {})
  };
    
  let clip = audioMap[key] || null;
  let rate = 1;

  if (clip && clip.playbackRate) {
    rate = clip.playbackRate;
  }
  
  // Buscar siempre en la fila como fallback definitivo o override
  if (s.script?.rows) {
    const row = s.script.rows.find(r => String(r.id || "").trim() === key);
    if (row && row.playbackRate) {
      // Si la fila tiene un rate explícito, lo preferimos si es distinto de 1
      if (rate === 1 || row.playbackRate !== 1) {
        rate = row.playbackRate;
      }
    }
  }

  const finalRate = normalizeDialogueAudioPlaybackRate(rate);
  
  if (clip || rate !== 1) {
  }
  
  return finalRate;
}

function resolveTimelineClipMix(session = null, rowId = "") {
  if (typeof window.resolveTimelineClipMix === "function") {
    try {
      return window.resolveTimelineClipMix(session, rowId);
    } catch (error) {
      console.warn("[Home] Fallback a mezcla de clips local: resolveTimelineClipMix global falló", error);
    }
  }

  if (!session) return { videoVolume: 1, voiceVolume: 1, backgroundVolume: 1, masterPct: 100, veoPct: 100, geminiPct: 100, backgroundPct: 100 };
  const key = String(rowId || "").trim();
  const videoConfig = session.podcastVideoConfig || session.script?.podcastVideoConfig || {};
  const fallbackVeoPct = Math.max(0, Math.min(100, Number(videoConfig.montageDefaultVeoVolumePct || 100)));
  const fallbackGeminiPct = Math.max(0, Math.min(100, Number(videoConfig.montageDefaultGeminiVolumePct || 100)));
  const masterPct = Math.max(0, Math.min(100, Number(videoConfig.masterVolume || 100)));
  const clipMap = session.timelineClipMap
    || videoConfig.timelineClipsByRowId
    || session.podcastStudioUiState?.timelineClipsByRowId
    || {};
  const clip = clipMap[key] || null;
  const veoOverride = clip?.veoVolumeOverridePct;
  const geminiOverride = clip?.geminiVolumeOverridePct;
  const veoPct = Number.isFinite(veoOverride) ? Math.max(0, Math.min(100, Math.round(veoOverride))) : fallbackVeoPct;
  const geminiPct = Number.isFinite(geminiOverride) ? Math.max(0, Math.min(100, Math.round(geminiOverride))) : fallbackGeminiPct;
  const backgroundOverride = videoConfig.timelineSceneAudioMixByRowId?.[key]?.backgroundMusicVolumePct;
  const backgroundPct = Number.isFinite(backgroundOverride) ? Math.max(0, Math.min(200, Math.round(backgroundOverride))) : 100;

  return {
    masterPct,
    veoPct,
    geminiPct,
    backgroundPct,
    videoVolume: Math.max(0, Math.min(1, veoPct / 100)),
    voiceVolume: Math.max(0, Math.min(1, geminiPct / 100)),
    backgroundVolume: Math.max(0, Math.min(2, backgroundPct / 100))
  };
}

function resolveHomeStageSurface(stage = null) {
  if (!stage) return null;
  const visibleSurface = stage.querySelector(".player-video:not(.player-video-backdrop):not([hidden]), .podcast-active-speaker-image:not([hidden])");
  if (visibleSurface) return visibleSurface;
  return stage.querySelector(".player-video:not(.player-video-backdrop), .podcast-active-speaker-image") || null;
}

function applyHomeSceneMediaScaleToStage({
  rowId = "",
  mediaScale = 1,
  mediaOffsetXPct = 0,
  mediaOffsetYPct = 0,
  mediaMotionPreset = "none",
  visualLayoutMode = "default",
  container = null,
  durationSec = 12,
  motionOffsetSec = 0,
  motionSyncRevision = 0
} = {}) {
  const stage = container || document.getElementById("playerStage");
  if (!stage) return;
  const surfaceEl = resolveHomeStageSurface(stage);
  if (!surfaceEl) return;

  const resolver = window.resolveSceneMediaRenderSpec
    || globalThis.PodcasterSceneMediaRenderSpec?.resolveSceneMediaRenderSpec
    || globalThis.resolveSceneMediaRenderSpec;
  const nextScale = Math.max(1, Math.min(2.5, Number(mediaScale) || 1));
  const nextX = Math.max(-0.5, Math.min(0.5, Number(mediaOffsetXPct) || 0));
  const nextY = Math.max(-0.5, Math.min(0.5, Number(mediaOffsetYPct) || 0));
  const nextMotion = String(mediaMotionPreset || "none").trim() || "none";
  const safeMotionDurationSec = Math.max(0.2, Number(durationSec || 12) || 12);
  const safeMotionOffsetSec = Math.max(0, Math.min(safeMotionDurationSec, Number(motionOffsetSec || 0) || 0));

  stage.style.setProperty("--pod-scene-media-scale", String(nextScale));
  stage.style.setProperty("--pod-scene-media-x", `${(nextX * 100).toFixed(3)}%`);
  stage.style.setProperty("--pod-scene-media-y", `${(nextY * 100).toFixed(3)}%`);
  stage.dataset.sceneMediaRowId = String(rowId || "").trim();
  stage.dataset.sceneMediaScale = String(nextScale);
  stage.dataset.sceneMediaOffsetX = String(nextX);
  stage.dataset.sceneMediaOffsetY = String(nextY);
  stage.dataset.sceneMediaMotionPreset = nextMotion;
  stage.dataset.sceneMediaLayout = String(visualLayoutMode || "default");
  stage.style.setProperty("--pod-scene-media-motion-duration", `${safeMotionDurationSec.toFixed(3)}s`);

  const motionSyncKey = `${String(rowId || "").trim()}:${Math.max(0, Number(motionSyncRevision || 0) || 0)}`;
  if (surfaceEl.dataset.sceneMediaMotionSyncKey !== motionSyncKey) {
    surfaceEl.dataset.sceneMediaMotionSyncKey = motionSyncKey;
    surfaceEl.style.animationDelay = safeMotionOffsetSec > 0 ? `-${safeMotionOffsetSec.toFixed(3)}s` : "0s";
    surfaceEl.style.animationName = "none";
    void surfaceEl.offsetWidth;
    surfaceEl.style.removeProperty("animation-name");
  }

  if (typeof resolver !== "function") return;

  const isImage = surfaceEl.tagName === "IMG";
  const sourceWidth = Math.max(2, Number(isImage ? surfaceEl.naturalWidth : surfaceEl.videoWidth) || 0);
  const sourceHeight = Math.max(2, Number(isImage ? surfaceEl.naturalHeight : surfaceEl.videoHeight) || 0);
  if (!(sourceWidth > 1 && sourceHeight > 1)) return;

  const spec = resolver({
    canvasWidth: Math.max(2, Number(stage.clientWidth || 0) || 1280),
    canvasHeight: Math.max(2, Number(stage.clientHeight || 0) || 720),
    sourceWidth,
    sourceHeight,
    reelMode: stage.classList.contains("is-reel-mode"),
    visualLayoutMode,
    mediaScale: nextScale,
    mediaOffsetXPct: nextX,
    mediaOffsetYPct: nextY,
    mediaMotionPreset: nextMotion,
    mediaKind: isImage ? "image" : "video",
    durationSec: safeMotionDurationSec
  });

  if (!spec) return;

  surfaceEl.style.setProperty("--pod-scene-media-left", `${Number(spec.leftPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-top", `${Number(spec.topPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-width", `${Number(spec.scaledRect?.width || stage.clientWidth || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-height", `${Number(spec.scaledRect?.height || stage.clientHeight || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-translate-x", "0px");
  surfaceEl.style.setProperty("--pod-scene-media-translate-y", "0px");
  surfaceEl.style.setProperty("--pod-scene-media-pan-x-amplitude", `${Number(spec.motion?.amplitudeXPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-pan-y-amplitude", `${Number(spec.motion?.amplitudeYPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-motion-start-x", `${Number(spec.motion?.startOffsetXPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-motion-end-x", `${Number(spec.motion?.endOffsetXPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-motion-start-y", `${Number(spec.motion?.startOffsetYPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-motion-end-y", `${Number(spec.motion?.endOffsetYPx || 0).toFixed(3)}px`);
  surfaceEl.style.setProperty("--pod-scene-media-motion-duration", `${Number(spec.motion?.durationSec || safeMotionDurationSec).toFixed(3)}s`);
  surfaceEl.style.left = "var(--pod-scene-media-left, 0px)";
  surfaceEl.style.top = "var(--pod-scene-media-top, 0px)";
  surfaceEl.style.right = "auto";
  surfaceEl.style.bottom = "auto";
  surfaceEl.style.width = "var(--pod-scene-media-width, 100%)";
  surfaceEl.style.height = "var(--pod-scene-media-height, 100%)";
  surfaceEl.style.objectFit = "cover";
  surfaceEl.style.objectPosition = "center center";
  surfaceEl.style.transform = "";
}

let cachedRuntimeEntries = null;
let cachedRuntimeEntriesKey = null;
let cachedVideoConfig = null;
let cachedVideoConfigSessionId = null;
let cachedVideoConfigCacheKey = null;

function mergeHomePodcastVideoConfig(base = {}, incoming = {}) {
  const currentBase = base && typeof base === "object" ? base : {};
  const nextIncoming = incoming && typeof incoming === "object" ? incoming : {};
  return {
    ...currentBase,
    ...nextIncoming,
    geminiDialogueTrack: {
      ...(currentBase?.geminiDialogueTrack || {}),
      ...(nextIncoming?.geminiDialogueTrack || {})
    },
    onScreenTextTrack: {
      ...(currentBase?.onScreenTextTrack || {}),
      ...(nextIncoming?.onScreenTextTrack || {})
    },
    panelMusicConfig: {
      ...(currentBase?.panelMusicConfig || {}),
      ...(nextIncoming?.panelMusicConfig || {})
    },
    timelineOnScreenTextClipsByRowId: {
      ...(currentBase?.timelineOnScreenTextClipsByRowId || {}),
      ...(nextIncoming?.timelineOnScreenTextClipsByRowId || {})
    },
    timelineOnScreenTextLayoutByRowId: {
      ...(currentBase?.timelineOnScreenTextLayoutByRowId || {}),
      ...(nextIncoming?.timelineOnScreenTextLayoutByRowId || {})
    },
    timelineClipsByRowId: {
      ...(currentBase?.timelineClipsByRowId || {}),
      ...(nextIncoming?.timelineClipsByRowId || {})
    },
    timelineSceneAudioMixByRowId: {
      ...(currentBase?.timelineSceneAudioMixByRowId || {}),
      ...(nextIncoming?.timelineSceneAudioMixByRowId || {})
    }
  };
}

const multimediaPlaybackDeps = {
  getTimelineTotalDurationMs: (s) => {
    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(s);
    if (!entries.length) return 0;
    return Math.max(...entries.map(e => e.endMs));
  },
  buildApiUrlPreferRemote: (path) => buildApiUrlPreferRemote(path),
  buildTimelineRuntimeEntries: (s) => {
    if (!s) return [];
    const currentUpdateAt = s.updatedAt || s.payload?.updatedAt || 0;
    const cacheKey = `${s.id}_${currentUpdateAt}`;

    if (cachedRuntimeEntries && cachedRuntimeEntriesKey === cacheKey) {
      return cachedRuntimeEntries;
    }

    const rows = extractDashboardSessionRows(s);
    const videoConfig = s?.podcastVideoConfig || s?.script?.podcastVideoConfig || {};
    const ui = s?.podcastStudioUiState || {};
    const clipMap = s?.timelineClipMap || videoConfig.timelineClipsByRowId || ui.timelineClipsByRowId || {};
    const videoMap = s?.dialogueVideoMap || ui.dialogueVideosByRowId || {};
    const audioMap = s?.dialogueAudioMap || ui.dialogueAudiosByRowId || {};
    const baseEntries = buildAugmentedTimelineRuntimeEntries({
      ...s,
      script: {
        ...(s?.script || {}),
        rows
      },
      podcastVideoConfig: {
        ...videoConfig,
        timelineClipsByRowId: clipMap
      }
    }, {
      clipMap
    });
    const entries = baseEntries.map((baseEntry, index) => {
    const rowId = String(baseEntry?.rowId || rows[index]?.id || `row_${index}`).trim();
      const sceneClip = videoMap[rowId];
      const audioClip = audioMap[rowId];
      const clipPlaybackRate = resolveDialogueAudioPlaybackRate(s, rowId);
      const videoSrc = resolveStorageVideoUrl(sceneClip?.downloadUrl, sceneClip?.storagePath);
      const audioSrc = resolveStorageAudioUrl(audioClip?.downloadUrl, audioClip?.storagePath);
      return {
        ...baseEntry,
        rowId,
        index: Number(baseEntry?.index ?? index),
        videoSrc,
        audioSrc,
        durationMs: Number(baseEntry?.effectiveDurationMs || 0),
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
        audioDurationMs: Math.round((Number(audioClip?.durationSec || 0) * 1000) / clipPlaybackRate),
        zIndex: Number(baseEntry?.clip?.zIndex || index + 1)
      };
    }).filter((entry) => hasHomeTimelineEntry(entry) && Boolean(String(entry?.rowId || "").trim()));

    const finalEntries = entries.sort((a, b) => a.startMs - b.startMs);
    cachedRuntimeEntries = finalEntries;
    cachedRuntimeEntriesKey = cacheKey;
    return finalEntries;
  },
  resolveFirebaseStorageUrl: async (gsPath) => {
    if (!gsPath) return "";
    const storagePath = String(gsPath || "")
      .replace(/^gs:\/\/[^/]+\//i, "")
      .replace(/^\/+/, "")
      .trim();
    if (!storagePath) return "";
    try {
      return await getDownloadURL(ref(storage, storagePath));
    } catch (_) {
      return buildApiUrlPreferRemote(
        `/api/assets/proxy-media?storagePath=${encodeURIComponent(storagePath)}`
      );
    }
  },
  setPodcastStageVideoSourceForElement: (video, url, options = {}) => (
    multimediaPlaybackController.setStageVideoSourceForElement(video, url, options)
  ),
  setActiveStageVideoSlot: (slot) => { homePlaybackState.stageVideoSlot = slot; },
  podcastVideoState: homePlaybackState,
  isDashboard: true,
  getTransitionForEdge: (session, fromRowId, toRowId) => getTransitionForEdge(session, fromRowId, toRowId),
  resolveTimelineRuntimeOverlapPairAtMs: (session, currentMs, runtimeEntries) => {
    return resolveHomeTimelineRuntimeOverlapPairAtMs(session, currentMs, runtimeEntries);
  },
  resolveSceneSourceStateAtTimelineMs: (entry, currentMs) => {
    if (typeof window.resolveSceneSourceStateAtTimelineMs === "function") {
      return window.resolveSceneSourceStateAtTimelineMs(entry, currentMs);
    }
    return { sourceMs: Math.max(0, Number(entry?.clip?.trimInMs || 0)), isHoldActive: false, playbackRate: 1 };
  },
  getPlaybackSpeed: () => Number(currentMultimediaSession?.podcastVideoConfig?.playbackSpeed || 1),
  getPodcastVideoConfig: (s) => {
    if (!s) return {};
    const sessionCfg = s?.podcastVideoConfig && typeof s.podcastVideoConfig === "object" ? s.podcastVideoConfig : {};
    const scriptCfg = s?.script?.podcastVideoConfig && typeof s.script.podcastVideoConfig === "object" ? s.script.podcastVideoConfig : {};
    const uiCfg = s?.podcastStudioUiState?.podcastVideoConfig && typeof s.podcastStudioUiState.podcastVideoConfig === "object"
      ? s.podcastStudioUiState.podcastVideoConfig
      : {};
    const baseCfg = mergeHomePodcastVideoConfig(
      mergeHomePodcastVideoConfig(scriptCfg, uiCfg),
      sessionCfg
    );
    const panelCfg = baseCfg?.panelMusicConfig
      || s?.panelMusicConfig
      || s?.session?.panelMusicConfig
      || s?.panelMusicState
      || s?.session?.panelMusicState
      || s?.podcastStudioUiState?.panelMusicState
      || s?.podcastStudioUiState?.panelMusicConfig
      || {};
    const videoConfigFingerprint = `${String(s?.updatedAt || s?.payload?.updatedAt || "").trim()}|${String(sessionCfg?.updatedAt || "").trim()}|${String(scriptCfg?.updatedAt || "").trim()}|${String(uiCfg?.updatedAt || "").trim()}|${String(baseCfg?.updatedAt || "").trim()}|${panelCfg?.updatedAt || ""}|${JSON.stringify(baseCfg?.onScreenTextTrack || {})}|${Object.keys(baseCfg?.timelineOnScreenTextClipsByRowId || {}).length}|${Object.keys(baseCfg?.timelineOnScreenTextLayoutByRowId || {}).length}|${Array.isArray(panelCfg?.sourceItems)
      ? panelCfg.sourceItems.length
      : 0}|${String(baseCfg?.geminiDialogueTrack?.enabled || "")}|${String(s?.id || "")}`;

    if (cachedVideoConfig && cachedVideoConfigSessionId === s.id && cachedVideoConfigCacheKey === videoConfigFingerprint) {
      return cachedVideoConfig;
    }

    const cfg = JSON.parse(JSON.stringify(baseCfg));
    const normalizeSharedClipItem = window.normalizeOnScreenTextClipItem || ((value, rowId) => ({ ...(value || {}), rowId }));
    const normalizeSharedClipMap = window.normalizeOnScreenTextClipsByRowId || ((value) => value || {});
    const normalizeSharedLayoutMap = window.normalizeOnScreenTextLayoutByRowId || ((value) => value || {});

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
      cfg.geminiDialogueTrack = { enabled: true, volumePct: 100, segments };
    } else if (!Number.isFinite(Number(cfg.geminiDialogueTrack?.volumePct))) {
      cfg.geminiDialogueTrack = {
        ...cfg.geminiDialogueTrack,
        volumePct: 100
      };
    }

    const onScreenTextTrackSource = cfg.onScreenTextTrack && typeof cfg.onScreenTextTrack === "object"
      ? cfg.onScreenTextTrack
      : {};
    cfg.onScreenTextTrack = normalizeHomeOnScreenTextTrackSettings(onScreenTextTrackSource);
    if (onScreenTextTrackSource?.enabled === false) {
      cfg.onScreenTextTrack.enabled = false;
    } else {
      cfg.onScreenTextTrack.enabled = true;
    }
    if (onScreenTextTrackSource?.showTrack === false) {
      cfg.onScreenTextTrack.showTrack = false;
    } else {
      cfg.onScreenTextTrack.showTrack = true;
    }

    const existingOnScreenTextClips = normalizeSharedClipMap(s?.timelineOnScreenTextClipsByRowId
      || s?.podcastVideoConfig?.timelineOnScreenTextClipsByRowId
      || s?.script?.podcastVideoConfig?.timelineOnScreenTextClipsByRowId
      || s?.podcastStudioUiState?.podcastVideoConfig?.timelineOnScreenTextClipsByRowId
      || s?.podcastStudioUiState?.timelineOnScreenTextClipsByRowId
      || {});
    const existingOnScreenTextLayouts = normalizeSharedLayoutMap(s?.podcastVideoConfig?.timelineOnScreenTextLayoutByRowId
      || s?.timelineOnScreenTextLayoutByRowId
      || s?.script?.podcastVideoConfig?.timelineOnScreenTextLayoutByRowId
      || s?.podcastStudioUiState?.podcastVideoConfig?.timelineOnScreenTextLayoutByRowId
      || s?.podcastStudioUiState?.timelineOnScreenTextLayoutByRowId
      || {});

    // Construir clips para cada entrada que tenga texto de diálogo usando el extractor unificado
    const textClips = {};
    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(s);
    entries.forEach(entry => {
      const allRows = extractDashboardSessionRows(s);
      const row = allRows.find(r => r.id === entry.rowId);
      const dialogueText = resolveDashboardRowOnScreenText(row);
      const savedClip = existingOnScreenTextClips?.[entry.rowId] 
        || cfg.timelineOnScreenTextClipsByRowId?.[entry.rowId] 
        || null;

      if (dialogueText) {
        const audioDur = Math.max(500, Number(entry.audioDurationMs || entry.effectiveDurationMs || entry.durationMs || 0) || 1000);
        const baseClip = savedClip ? { ...savedClip } : {};
        
        // Preservar trimInMs y trimOutMs personalizados de la base de datos si existen
        const trimIn = Math.max(0, Number(savedClip?.trimInMs ?? 0));
        const trimOut = Math.max(trimIn + 500, Number(savedClip?.trimOutMs ?? audioDur));
        const duration = Math.max(500, trimOut - trimIn);
        const startMs = entry.startMs + trimIn;

        const clip = normalizeSharedClipItem({
          ...baseClip,
          rowId: entry.rowId,
          startMs: startMs,
          sourceDurationMs: audioDur,
          trimInMs: trimIn,
          trimOutMs: trimOut,
          durationMs: duration,
          effectiveDurationMs: duration,
          hidden: savedClip?.hidden === true,
          autoHidden: savedClip?.autoHidden === true,
          zIndex: Math.max(1, Number(savedClip?.zIndex || entry.zIndex || entry.index || 1) || 1)
        }, entry.rowId);
        if (clip) textClips[entry.rowId] = clip;
      }
    });

    cfg.timelineOnScreenTextClipsByRowId = normalizeSharedClipMap(textClips);
    if (!cfg.timelineOnScreenTextLayoutByRowId && existingOnScreenTextLayouts && Object.keys(existingOnScreenTextLayouts).length) {
      cfg.timelineOnScreenTextLayoutByRowId = JSON.parse(JSON.stringify(existingOnScreenTextLayouts));
    } else {
      cfg.timelineOnScreenTextLayoutByRowId = normalizeSharedLayoutMap(cfg.timelineOnScreenTextLayoutByRowId || {});
    }

    cachedVideoConfig = cfg;
    cachedVideoConfigSessionId = s.id;
    cachedVideoConfigCacheKey = videoConfigFingerprint;
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
          const rows = extractDashboardSessionRows(currentMultimediaSession);
          const row = resolveDashboardActiveRow(rows, activeEntry);
          const activeSceneIndex = Math.max(0, entries.findIndex((entry) => entry === activeEntry));

          const sceneNumberEl = document.getElementById("infoSceneNumber");
          const scriptEl = document.getElementById("infoSceneScript");
          const descEl = document.getElementById("infoSceneDesc");
          const ostEl = document.getElementById("infoSceneOST");
          const visualEl = document.getElementById("infoSceneVisual");
          const timeEl = document.getElementById("infoSceneTime");
          const proposalTextarea = document.getElementById("infoSceneProposalText");
          getVideoPlayerReviewManager().syncSceneApprovalUi(row);

          // Guardar el ID actual para el guardado
          window._currentActiveRowId = activeEntry.rowId;

          if (sceneNumberEl) sceneNumberEl.textContent = `Escena ${activeSceneIndex + 1}`;
          if (scriptEl) scriptEl.textContent = resolveDashboardRowScript(row) || "--";
          if (descEl) descEl.textContent = resolveDashboardRowSceneDescription(row) || "--";
          if (ostEl) ostEl.textContent = resolveDashboardRowOnScreenText(row) || "--";

          if (visualEl) {
            const visualNotes = resolveDashboardRowVisualNotes(row);
            const activeProposal = resolveDashboardDisplayedVisualProposal(row);
            const isResolved = isDashboardProposalResolved(row, activeProposal);

            if (row?.visualNotesOriginalStored === true && row?.visualNotesOriginalText !== visualNotes) {
              visualEl.innerHTML = `<span class="proposal-badge is-realized" style="margin-bottom: 4px;">PROPUESTA APLICADA</span><br>${visualNotes}<br><small style="color: #64748b; font-size: 9px; display: block; margin-top: 4px;">Original: ${row.visualNotesOriginalText}</small>`;
            } else if (activeProposal && !isResolved) {
              visualEl.innerHTML = `<span class="proposal-badge is-pending" style="margin-bottom: 4px;">PROPUESTA ACTIVA</span><br>${activeProposal}<br><small style="color: #64748b; font-size: 9px; display: block; margin-top: 4px;">Original: ${visualNotes || "--"}</small>`;
            } else {
              visualEl.textContent = visualNotes || "--";
            }
          }

          // Referencia Visual
          const refEl = document.getElementById("infoSceneReference");
          if (refEl) {
            const rowId = activeEntry.rowId;
            const activeSession = currentMultimediaSession || {};
            const activeSessionInner = activeSession.session || activeSession;
            const refMap = activeSessionInner.rowReferenceImageMap || {};
            const refImg = refMap[rowId];
            if (refImg && refImg.dataUrl) {
              refEl.innerHTML = `
                <div class="inspector-row-reference" style="border-radius: 6px; overflow: hidden; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); padding: 8px;">
                  <div class="inspector-row-reference-head" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; color: #94a3b8;">
                    <span class="inspector-row-reference-name" style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80%;">${escapeHtml(refImg.name || "Referencia")}</span>
                    <button type="button" id="btnDeleteSceneReference" class="btn-clear-reference" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px;" title="Quitar referencia">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <div class="inspector-row-reference-preview" style="border-radius: 4px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; max-height: 120px;">
                    <img src="${escapeHtml(refImg.dataUrl)}" style="max-width: 100%; max-height: 120px; object-fit: contain;">
                  </div>
                </div>
              `;

              // Bind delete event
              const delBtn = document.getElementById("btnDeleteSceneReference");
              if (delBtn) {
                delBtn.addEventListener("click", async () => {
                  if (confirm("¿Estás seguro de que quieres quitar la imagen de referencia de esta escena?")) {
                    try {
                      const delResult = await mutateDashboardProposalSession(rowId, (rCopy, rIndex, sSession) => {
                        if (!sSession.rowReferenceImageMap) sSession.rowReferenceImageMap = {};
                        if (!sSession.rowReferenceImageListMap) sSession.rowReferenceImageListMap = {};
                        if (!sSession.rowReferenceModeByRowId) sSession.rowReferenceModeByRowId = {};

                        delete sSession.rowReferenceImageMap[rowId];
                        delete sSession.rowReferenceImageListMap[rowId];
                        delete sSession.rowReferenceModeByRowId[rowId];
                        return true;
                      });
                      if (delResult.ok) {
                        const activeSessionInner = currentMultimediaSession.session || currentMultimediaSession;
                        if (activeSessionInner.rowReferenceImageMap) delete activeSessionInner.rowReferenceImageMap[rowId];
                        if (activeSessionInner.rowReferenceImageListMap) delete activeSessionInner.rowReferenceImageListMap[rowId];
                        if (activeSessionInner.rowReferenceModeByRowId) delete activeSessionInner.rowReferenceModeByRowId[rowId];
                        multimediaPlaybackController.sync(currentMultimediaSession);
                      }
                    } catch (err) {
                      console.error("Error clearing reference image:", err);
                    }
                  }
                });
              }
            } else {
              refEl.innerHTML = `
                <div class="inspector-row-reference-empty" style="color: #64748b; font-size: 11px; font-style: italic; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 6px; padding: 12px; text-align: center;">
                  Sin imagen de referencia
                </div>
              `;
            }
          }

          // Propuesta Pendiente (Aparte)
          const activeProposalGroup = document.getElementById("infoSceneActiveProposalGroup");
          const activeProposalEl = document.getElementById("infoSceneActiveProposal");
          const displayedProposal = resolveDashboardDisplayedVisualProposal(row);
          if (activeProposalGroup && activeProposalEl) {
            const activeProposalBadge = activeProposalGroup.querySelector(".info-label");
            if (displayedProposal) {
              setScenePanelSectionVisibility(activeProposalGroup, false);
              activeProposalEl.textContent = displayedProposal;
              const isResolved = isDashboardProposalResolved(row, displayedProposal);
              activeProposalEl.classList.toggle("is-resolved", isResolved);
              activeProposalEl.style.textDecoration = isResolved ? "line-through" : "none";
              activeProposalEl.style.color = isResolved ? "#10b981" : "inherit";

              if (activeProposalBadge) {
                activeProposalBadge.style.backgroundColor = isResolved ? "#10b981" : "#fbbf24";
                activeProposalBadge.textContent = isResolved ? "PROPUESTA REALIZADA" : "PROPUESTA ACTIVA";
              }

              const btnApply = document.getElementById("btnApplyActiveProposal");
              const btnDelete = document.getElementById("btnDeleteActiveProposal");

              if (btnApply) {
                btnApply.onclick = async () => {
                  await aplicarPropuestaDesdeDashboard(displayedProposal);
                };
              }
              if (btnDelete) {
                btnDelete.onclick = async () => {
                  await eliminarPropuestaDesdeDashboard(displayedProposal);
                };
              }
            } else {
              setScenePanelSectionVisibility(activeProposalGroup, true);
              activeProposalEl.classList.remove("is-resolved");
            }
          }

          if (timeEl) timeEl.textContent = `${(current / 1000).toFixed(1)}s`;

          // Sincronizar el historial de propuestas
          const proposalsGroup = document.getElementById("infoSceneProposalsGroup");
          const proposalsList = document.getElementById("infoSceneProposalsList");
          if (proposalsList) {
            const history = Array.isArray(row?.visualNotesProposals) ? row.visualNotesProposals : [];
            const active = row?.visualNotesProposal ? [row.visualNotesProposal] : [];
            const resolved = Array.isArray(row?.visualNotesResolvedProposals) ? row.visualNotesResolvedProposals : [];

            // Mezclar todo y quitar duplicados manteniendo orden
            const allUnique = Array.from(new Set([...history, ...active, ...resolved])).map(p => String(p || "").trim()).filter(Boolean);



            if (allUnique.length > 0) {
              setScenePanelSectionVisibility(proposalsGroup, false);
              const resolvedSet = new Set(normalizeDashboardProposalState(resolved));

              const html = allUnique.map((p) => {
                const text = String(p || "").trim();
                const isDone = resolvedSet.has(text);
                const escaped = text.replace(/"/g, '&quot;');
                return `
                       <div class="proposal-item-dashboard${isDone ? " is-resolved" : " is-pending"}" style="padding: 10px 14px; position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                          <div style="color: ${isDone ? "#10b981" : "#fcd34d"}; text-decoration: ${isDone ? "line-through" : "none"}; line-height: 1.5; font-weight: 500; font-size: 11px; flex: 1;">${text}</div>
                          <div style="display: flex; gap: 8px; flex: 0 0 auto;">
                             ${isDone ? `
                                <button class="btn-unresolve-proposal-dashboard" data-proposal-text="${escaped}" style="background: rgba(251, 191, 36, 0.1); border: none; color: #fbbf24; cursor: pointer; padding: 4px; border-radius: 4px;" title="Restaurar a pendientes">
                                   <i class="fas fa-undo"></i>
                                </button>
                             ` : `
                                <button class="btn-apply-proposal-dashboard" data-proposal-text="${escaped}" style="background: rgba(59, 130, 246, 0.1); border: none; color: #3b82f6; cursor: pointer; padding: 4px; border-radius: 4px;" title="Seleccionar oficial">
                                   <i class="fas fa-thumbtack"></i>
                                </button>
                                <button class="btn-delete-proposal-dashboard" data-proposal-text="${escaped}" style="background: rgba(16, 185, 129, 0.1); border: none; color: #10b981; cursor: pointer; padding: 4px; border-radius: 4px;" title="Marcar realizada">
                                   <i class="fas fa-check-circle"></i>
                                </button>
                             `}
                          </div>
                       </div>
                    `;
              }).join("");

              proposalsList.innerHTML = html;
              proposalsList.querySelectorAll(".btn-apply-proposal-dashboard").forEach(b => b.onclick = (e) => aplicarPropuestaDesdeDashboard(e.currentTarget.dataset.proposalText));
              proposalsList.querySelectorAll(".btn-delete-proposal-dashboard").forEach(b => b.onclick = (e) => eliminarPropuestaDesdeDashboard(e.currentTarget.dataset.proposalText));
              proposalsList.querySelectorAll(".btn-unresolve-proposal-dashboard").forEach(b => b.onclick = (e) => unresolvePropuestaDesdeDashboard(e.currentTarget.dataset.proposalText));
            } else {
              setScenePanelSectionVisibility(proposalsGroup, true);
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
    return buildHomePanelMontageMusicConfig(s, {
      buildTimelineRuntimeEntries: multimediaPlaybackDeps.buildTimelineRuntimeEntries,
      getTimelineTotalDurationMs: multimediaPlaybackDeps.getTimelineTotalDurationMs,
      resolveStorageAudioUrl
    });
  },
  ensureOnScreenTextClipsByRowId: (s) => {
    const cfg = multimediaPlaybackDeps.getPodcastVideoConfig(s);
    return (window.normalizeOnScreenTextClipsByRowId
      ? window.normalizeOnScreenTextClipsByRowId(cfg.timelineOnScreenTextClipsByRowId || {})
      : (cfg.timelineOnScreenTextClipsByRowId || {}));
  },
  getActiveSession: () => currentMultimediaSession,
  getAuthHeaders: async () => {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },
  resolveDialogueAudioForRow: (s, rowId) => {
    const key = String(rowId || "").trim();
    const map = s?.dialogueAudioMap 
      || s?.podcastStudioUiState?.dialogueAudiosByRowId 
      || s?.script?.dialogueAudioMap 
      || {};
    return map[key] || null;
  },
  resolveDialogueAudioPlaybackRate: (s, rowId) => resolveDialogueAudioPlaybackRate(s, rowId),
  resolveStorageAudioUrl: (url, path) => resolveStorageAudioUrl(url, path),
  resolveAuthorizedAssetUrl,
  markStaleProxyMediaUrl,
  ensureTimelineClipsByRowId: (s) => s?.timelineClipMap || s?.podcastStudioUiState?.timelineClipsByRowId || {},
  resolveTimelineClipMix: (s, rowId) => resolveTimelineClipMix(s, rowId),
  getOnScreenTextClipEffectiveDurationMs: (c) => window.getOnScreenTextClipEffectiveDurationMs
    ? window.getOnScreenTextClipEffectiveDurationMs(c)
    : (c?.durationMs || 0),
  normalizeOnScreenTextTrackSettings: (s) => window.normalizeOnScreenTextTrackSettings ? window.normalizeOnScreenTextTrackSettings(s) : { enabled: true, showTrack: true },
  getOnScreenTextClipText: (row) => window.getOnScreenTextClipText
    ? window.getOnScreenTextClipText(row)
    : resolveDashboardRowOnScreenText(row),
  resolveOnScreenTextRenderMetrics: (s, o) => window.resolveOnScreenTextRenderMetrics ? window.resolveOnScreenTextRenderMetrics(s, o) : {},
  resolveOnScreenTextPreviewLayoutSpec: (cfg) => window.resolveOnScreenTextPreviewLayoutSpec ? window.resolveOnScreenTextPreviewLayoutSpec(cfg) : null,
  getOnScreenTextStylePresetClass: (p) => window.getOnScreenTextStylePresetClass ? window.getOnScreenTextStylePresetClass(p) : "",
  getOnScreenTextBgPresetClass: (p) => window.getOnScreenTextBgPresetClass ? window.getOnScreenTextBgPresetClass(p) : "",
  getOnScreenTextLayoutForRow: (s, rowId) => {
    const key = String(rowId || "").trim();
    if (!key) return null;
    const cfg = multimediaPlaybackDeps.getPodcastVideoConfig(s);
    const existingOnScreenTextLayouts = window.normalizeOnScreenTextLayoutByRowId
      ? window.normalizeOnScreenTextLayoutByRowId(s?.podcastVideoConfig?.timelineOnScreenTextLayoutByRowId || cfg?.timelineOnScreenTextLayoutByRowId || {})
      : (s?.podcastVideoConfig?.timelineOnScreenTextLayoutByRowId || cfg?.timelineOnScreenTextLayoutByRowId || {});
    return existingOnScreenTextLayouts?.[key] || null;
  },
  buildOnScreenTextBubbleInlineStyle: (s, o) => window.buildOnScreenTextBubbleInlineStyle ? window.buildOnScreenTextBubbleInlineStyle(s, o) : "",
  escapeHtml: (t) => {
    const div = document.createElement('div');
    div.textContent = t;
    return div.innerHTML;
  },
  syncPodcastTimelinePlayhead: (ms, total, s) => {
    // Already handled by updatePodcastVideoTransportUi
  },
  setPodcastVideoStatus: () => { },
  getPlaybackSpeed: () => {
    const s = currentMultimediaSession;
    const cfg = s?.podcastVideoConfig || s?.session?.podcastVideoConfig || {};
    return Math.max(0.5, Math.min(2.0, Number(cfg.playbackSpeed || 1.0)));
  },
  resolveSceneMediaRenderSpec: (input = {}) => (
    window.resolveSceneMediaRenderSpec
    || globalThis.PodcasterSceneMediaRenderSpec?.resolveSceneMediaRenderSpec
    || globalThis.resolveSceneMediaRenderSpec
  )?.(input),
  applySceneMediaScaleToStage: (params = {}) => applyHomeSceneMediaScaleToStage(params)
};

function initMultimediaPlayer() {


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
    podcastActiveSpeakerBackdropVideo: document.getElementById("podcastActiveSpeakerBackdropVideo"),
    podcastActiveSpeakerBackdropVideoAlt: document.getElementById("podcastActiveSpeakerBackdropVideoAlt"),
    podcastActiveSpeakerImage: document.getElementById("podcastActiveSpeakerImage"),
    podcastActiveSpeakerImageAlt: document.getElementById("podcastActiveSpeakerImageAlt"),
    podcastStylizedTextOverlay: document.getElementById("podcastStylizedTextOverlay"),
    podcastOnScreenTextOverlay: overlay,
    podcastVideoStage: stage
  };

  multimediaPlaybackController.init(els, multimediaPlaybackDeps);

  const playBtn = document.getElementById("playerPlayBtn");
  const pauseBtn = document.getElementById("playerPauseBtn");
  const stopBtn = document.getElementById("playerStopBtn");
  const prevBtn = document.getElementById("playerPrevBtn");
  const nextBtn = document.getElementById("playerNextBtn");
  const scenePanel = document.getElementById("playerSidePanel");
  const scenePanelResizeHandle = document.getElementById("playerSidePanelResizeHandle");

  if (playBtn) playBtn.onclick = () => multimediaPlaybackController.play();
  if (pauseBtn) pauseBtn.onclick = () => multimediaPlaybackController.pause();
  if (stopBtn) stopBtn.onclick = () => multimediaPlaybackController.stop();
  if (prevBtn) prevBtn.onclick = () => multimediaPlaybackController.prev();
  if (nextBtn) nextBtn.onclick = () => multimediaPlaybackController.next();
  getVideoPlayerReviewManager().bindToolbarButtons();

  if (scenePanel && scenePanelResizeHandle) {
    const playerShell = scenePanel.closest(".video-player-shell");
    scenePanelResizeHandle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = scenePanel.getBoundingClientRect().width;
      const minWidth = 280;
      const maxWidth = Math.max(minWidth, Math.min(720, window.innerWidth - 420));
      document.body.classList.add("is-resizing-scene-panel");
      scenePanelResizeHandle.setPointerCapture?.(event.pointerId);

      const onPointerMove = (moveEvent) => {
        const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + startX - moveEvent.clientX));
        const widthValue = `${Math.round(nextWidth)}px`;
        scenePanel.style.setProperty("--player-side-panel-width", widthValue);
        playerShell?.style.setProperty("--player-side-panel-width", widthValue);
      };
      const onPointerEnd = () => {
        document.body.classList.remove("is-resizing-scene-panel");
        scenePanelResizeHandle.removeEventListener("pointermove", onPointerMove);
        scenePanelResizeHandle.removeEventListener("pointerup", onPointerEnd);
        scenePanelResizeHandle.removeEventListener("pointercancel", onPointerEnd);
      };

      scenePanelResizeHandle.addEventListener("pointermove", onPointerMove);
      scenePanelResizeHandle.addEventListener("pointerup", onPointerEnd);
      scenePanelResizeHandle.addEventListener("pointercancel", onPointerEnd);
    };
  }

  const timeline = document.getElementById("playerTimeline");
  if (timeline) {
    timeline.oninput = (e) => {
      const pct = parseFloat(e.target.value) / 100;
      const total = multimediaPlaybackController.state.totalDurationMs || 0;
      multimediaPlaybackController.seek(pct * total);
    };
  }

  createPodcasterStageFullscreenController({
    targetEl: stage,
    controlsEl: document.getElementById("playerControls"),
    buttonEl: document.getElementById("playerStageFullscreenBtn")
  });

  document.getElementById("cerrarMultimediaPlayer")?.addEventListener("click", () => {
    multimediaPlaybackController.stop();
    if (multimediaPlayerUnsubscribe) {
      multimediaPlayerUnsubscribe();
      multimediaPlayerUnsubscribe = null;
    }
    document.getElementById("videoPlayerPage")?.classList.add("hidden");
  });

  document.getElementById("renderizarMultimedia")?.addEventListener("click", async () => {
    const session = currentMultimediaSession;
    if (!session) return;

    const btn = document.getElementById("renderizarMultimedia");
    const originalIcon = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(session) || [];
      if (!entries.length) {
        alert("No hay escenas con video/audio para exportar.");
        btn.disabled = false;
        btn.innerHTML = originalIcon;
        return;
      }
      const effectivePanelMusicConfig = multimediaPlaybackDeps.getPanelMontageMusicConfig(session);
      const rows = extractDashboardSessionRows(session) || [];
      const onScreenTextTimeline = buildDashboardMontageOnScreenTextSegments(session, entries);

      const mappedEntries = entries.map((entry, index) => {
        const rowId = String(entry?.rowId || "").trim();
        const row = rows.find((item) => String(item?.id || "").trim() === rowId) || null;
        const video = entry.video || null;
        const videoStoragePath = String(video?.storagePath || "").trim();
        const videoDownloadUrl = String(video?.url || "").trim();
        const videoMimeType = String(video?.mimeType || "video/mp4").trim();
        const isImageAsset = String(video?.mediaKind || video?.type || "").trim().toLowerCase() === "image"
          || videoMimeType.startsWith("image/");
        const durationMs = Math.max(500, Number(entry?.effectiveDurationMs || entry?.durationMs || 0) || 1000);
        const trimInMs = Math.max(0, Number(entry?.clip?.trimInMs || entry?.trimInMs || 0) || 0);

        const audio = entry.audio || entry.dialogueAudio || null;
        const audioStoragePath = String(audio?.storagePath || "").trim();
        const audioDownloadUrl = String(audio?.url || "").trim();
        const audioMimeType = String(audio?.mimeType || "audio/ogg").trim();

        return {
          rowId,
          sceneIndex: index + 1,
          speaker: String(row?.speaker || "").trim(),
          sceneLabel: `Escena ${index + 1}`,
          zIndex: Math.max(1, Number(entry?.zIndex || index + 1) || (index + 1)),
          timelineStartMs: Math.max(0, Number(entry?.startMs || 0) || 0),
          timelineEndMs: Math.max(0, Number(entry?.endMs || 0) || 0),
          trimInMs,
          durationMs,
          voiceOverText: String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim(),
          sceneDescription: String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim(),
          onScreenText: resolveDashboardRowOnScreenText(row),
          visualNotes: String(row?.visualNotes || "").replace(/\s+/g, " ").trim(),
          videoDirective: String(row?.videoDirective || "").replace(/\s+/g, " ").trim(),
          video: {
            storagePath: videoStoragePath || "",
            url: videoDownloadUrl || "",
            mimeType: videoMimeType,
            type: isImageAsset ? "image" : "video",
            mediaKind: isImageAsset ? "image" : "video"
          },
          audio: (audioStoragePath || audioDownloadUrl) ? {
            storagePath: audioStoragePath || "",
            url: audioDownloadUrl || "",
            mimeType: audioMimeType
          } : null,
          useNativeVideoAudio: false
        };
      });

      const payload = {
        sessionId: session.id,
        title: session.title || "Export Dashboard",
        resolution: resolveEffectiveExportResolution("source", session.podcastVideoConfig?.reelModeEnabled),
        bitrateSettings: {
          mode: "custom",
          maxBitrateMbps: 5,
          minBitrateCrf: 23
        },
        format: "mp4_h264",
        qualityPreset: "balanced",
        includeBackgroundMusic: true,
        entries: mappedEntries,
        backgroundMusic: effectivePanelMusicConfig || null,
        audioTimeline: {
          enabled: true,
          backgroundSegments: effectivePanelMusicConfig?.sourceItems || []
        },
        onScreenTextTimeline: (onScreenTextTimeline.segments.length || onScreenTextTimeline.suppressFallbackFromEntries === true) ? {
          enabled: onScreenTextTimeline.segments.length > 0,
          settings: onScreenTextTimeline.settings,
          segments: onScreenTextTimeline.segments,
          suppressFallbackFromEntries: onScreenTextTimeline.suppressFallbackFromEntries === true
        } : null,
        brandOverlay: buildDashboardBrandOverlay()
      };

      const result = await authFetchJson(buildExportApiUrl("/api/podcaster/montage/export"), {
        method: "POST",
        body: payload
      });

      alert("Exportación iniciada con éxito. El video estará listo en unos minutos y aparecerá en tu galería.");


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
  const sessionId = String(session?.id || "").trim();
  syncReelModeUi(session);

  if (multimediaPlayerUnsubscribe) {
    multimediaPlayerUnsubscribe();
    multimediaPlayerUnsubscribe = null;
  }

  const modal = document.getElementById("videoPlayerPage");
  const title = document.getElementById("playerTitle");
  const btnToggle = document.getElementById("btnToggleSceneInfo");
  const sidePanel = document.getElementById("playerSidePanel");

  if (modal) {
    modal.classList.remove("hidden");

    // Iniciar listener en tiempo real para propuestas y cambios del documento principal
    if (sessionId) {
      const sessionRef = doc(db, "podcaster_sessions", sessionId);

      let hasPendingChanges = false;
      const updateFn = (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        const incomingSession = buildDashboardSessionFromPodcasterDoc(data, sessionId, currentMultimediaSession);
        if (!incomingSession) return;
        
        // Aviso de cambios si detectamos versión nueva
        const getMs = (val) => {
          if (!val) return 0;
          if (typeof val === 'number') return val;
          if (val.toMillis) return val.toMillis();
          if (val.seconds) return val.seconds * 1000;
          return new Date(val).getTime() || 0;
        };

        const incomingUpdateAt = getMs(incomingSession?.updatedAt || data?.sessionUpdatedAt || data?.updatedAt);
        const currentUpdateAt = getMs(currentMultimediaSession?.updatedAt || currentMultimediaSession?.cloudMeta?.savedAt);

        if (currentMultimediaSession && incomingUpdateAt > currentUpdateAt && !hasPendingChanges) {
           hasPendingChanges = true;
           showPlaybackUpdateBadge();
           return;
        }

        const incomingRows = extractDashboardSessionRows(incomingSession);

        if (currentMultimediaSession && incomingRows.length > 0) {
          const currentRows = extractDashboardSessionRows(currentMultimediaSession);
          const updatedRows = mergeDashboardRows(incomingRows, currentRows);

          // Mezcla no destructiva: preservar mapas de audio/clips del objeto actual si el entrante no los tiene
          currentMultimediaSession = {
            ...currentMultimediaSession,
            ...incomingSession,
            dialogueAudioMap: incomingSession?.dialogueAudioMap || currentMultimediaSession.dialogueAudioMap,
            timelineClipMap: incomingSession?.timelineClipMap || currentMultimediaSession.timelineClipMap,
            podcastVideoConfig: mergeHomePodcastVideoConfig(
              currentMultimediaSession?.podcastVideoConfig || {},
              incomingSession?.podcastVideoConfig || {}
            ),
            script: {
              ...(currentMultimediaSession.script || {}),
              ...(incomingSession?.script || {}),
              podcastVideoConfig: mergeHomePodcastVideoConfig(
                currentMultimediaSession?.script?.podcastVideoConfig || {},
                incomingSession?.script?.podcastVideoConfig || {}
              ),
              rows: updatedRows
            }
          };

          if (!modal.classList.contains("hidden")) {
            syncReelModeUi(currentMultimediaSession);
            multimediaPlaybackDeps.updatePodcastVideoTransportUi();
          }
        }
      };

      const hidePlaybackUpdateBadge = () => {
        const badge = document.getElementById("playerUpdateBadge");
        if (badge) badge.classList.add("hidden");
        hasPendingChanges = false;
      };

      const showPlaybackUpdateBadge = () => {
        const badge = document.getElementById("playerUpdateBadge");
        if (!badge) return;
        badge.classList.remove("hidden");
        badge.onclick = async () => {
          hidePlaybackUpdateBadge();
          
          try {
            // Forzar recarga completa de la sesión actual desde Firebase
            const freshSession = await loadFullDashboardPodcasterSession(sessionId, currentMultimediaSession);
            if (freshSession) {
              currentMultimediaSession = freshSession;
              
              // Importante: invalidar caches de filas que pudieran haber cambiado su audio
              const rows = extractDashboardSessionRows(freshSession);
              rows.forEach(r => multimediaPlaybackController.invalidateRowAudioCache(r.id));
              
              multimediaPlaybackController.sync(currentMultimediaSession);
              multimediaPlaybackDeps.updatePodcastVideoTransportUi();
            } else {
              console.warn("[Dashboard] No se pudo obtener una sesión fresca.");
            }
          } catch (err) {
            console.error("[Dashboard] Error al actualizar sesión manual:", err);
          }
        };
      };

      multimediaPlayerUnsubscribe = onSnapshot(sessionRef, updateFn);
    }

    if (title) title.textContent = session.title || "Sin título";
    if (sidePanel) sidePanel.classList.add("is-open");
    if (btnToggle) btnToggle.classList.add("active");

    // Forzar un primer renderizado de la UI de transporte (que incluye el monitor de escena)
    multimediaPlaybackDeps.updatePodcastVideoTransportUi();

    multimediaPlaybackController.sync(session);
    multimediaPlaybackController.stop();

    // Hydrate the voices for the opening window before the first user gesture.
    // Safari/iOS and some Chromium privacy modes only allow audio elements that
    // already exist when Play is pressed; creating them after an awaited media
    // fetch can leave the timeline running silently.
    try {
      const initialDialogueRowIds = multimediaPlaybackDeps.buildTimelineRuntimeEntries(session)
        .filter((entry) => Math.max(0, Number(entry?.startMs || 0) || 0) < 15000)
        .map((entry) => String(entry?.rowId || "").trim())
        .filter(Boolean);
      multimediaPlaybackController.prewarmDialogueAudioRows(session, initialDialogueRowIds).catch((error) => {
        console.warn("[Dashboard] No se pudieron precargar todas las voces iniciales:", error);
      });
    } catch (error) {
      console.warn("[Dashboard] No se pudo iniciar la precarga de voces:", error);
    }

    // Asegurar cableado de guardar propuesta (por si se perdió el evento original)
    const btnSave = document.getElementById("btnSaveVisualProposal");
    if (btnSave) {
      // Limpiar listeners previos para evitar duplicados
      const newBtn = btnSave.cloneNode(true);
      btnSave.parentNode.replaceChild(newBtn, btnSave);

      newBtn.addEventListener("click", async (e) => {

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
          const result = await mutateDashboardProposalSession(window._currentActiveRowId, (rows, rowIndex, sessionData) => {
            rows[rowIndex].visualNotesProposal = proposalText;
            if (!Array.isArray(rows[rowIndex].visualNotesProposals)) {
              rows[rowIndex].visualNotesProposals = [];
            }
            if (!rows[rowIndex].visualNotesProposals.includes(proposalText)) {
              rows[rowIndex].visualNotesProposals.push(proposalText);
            }

            // Si hay una imagen temporal adjunta, guardarla en el mapa de la sesión
            if (window._tempProposalReferenceImage) {
              if (!sessionData.rowReferenceImageMap) sessionData.rowReferenceImageMap = {};
              if (!sessionData.rowReferenceImageListMap) sessionData.rowReferenceImageListMap = {};
              if (!sessionData.rowReferenceModeByRowId) sessionData.rowReferenceModeByRowId = {};

              const rowId = window._currentActiveRowId;
              const imgRecord = {
                name: window._tempProposalReferenceImage.name,
                dataUrl: window._tempProposalReferenceImage.dataUrl,
                mimeType: window._tempProposalReferenceImage.mimeType,
                updatedAt: new Date().toISOString()
              };

              sessionData.rowReferenceImageMap[rowId] = imgRecord;
              sessionData.rowReferenceImageListMap[rowId] = [imgRecord];
              sessionData.rowReferenceModeByRowId[rowId] = "image";
            }
            return true;
          });
          if (!result.ok) {
            console.warn("[Dashboard] Fallo al localizar fila. Buscábamos:", window._currentActiveRowId);
            alert("No se encontró la escena actual en el documento original. Por favor, asegúrate de que el ID coincide.");
            return;
          }
          // Limpiar el preview temporal después del guardado
          window._tempProposalReferenceImage = null;
          if (proposalPreviewContainer) proposalPreviewContainer.style.display = "none";
          if (proposalFileInput) proposalFileInput.value = "";

          await notifyActivity("está añadiendo una propuesta nueva", result.rowIndex);
          multimediaPlaybackController.sync(currentMultimediaSession);
          multimediaPlaybackDeps.updatePodcastVideoTransportUi();
          alert("✅ Propuesta guardada correctamente.");
        } catch (err) {
          console.error("[Dashboard] Error fatal al guardar:", err);
          alert("Error de Firebase: " + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    }

    // Resetear variables temporales de propuesta
    window._tempProposalReferenceImage = null;
    const proposalPreviewContainer = document.getElementById("proposalReferencePreviewContainer");
    if (proposalPreviewContainer) proposalPreviewContainer.style.display = "none";
    const proposalFileInput = document.getElementById("proposalReferenceFileInput");
    if (proposalFileInput) proposalFileInput.value = "";

    // Adjuntar imagen de referencia
    const btnAttachRef = document.getElementById("btnAttachProposalReference");
    if (btnAttachRef && proposalFileInput) {
      btnAttachRef.onclick = () => {
        proposalFileInput.click();
      };

      proposalFileInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          // Leer y comprimir imagen a max 800x800, JPEG 0.7
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                  if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                  }
                } else {
                  if (height > MAX_HEIGHT) {
                    width = Math.round((width * MAX_HEIGHT) / height);
                    height = MAX_HEIGHT;
                  }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.7));
              };
              img.onerror = () => reject(new Error("Error al cargar imagen."));
              img.src = event.target.result;
            };
            reader.onerror = () => reject(new Error("Error al leer archivo."));
            reader.readAsDataURL(file);
          });

          window._tempProposalReferenceImage = {
            name: file.name,
            dataUrl,
            mimeType: "image/jpeg"
          };

          const previewImg = document.getElementById("proposalReferencePreviewImg");
          if (previewImg && proposalPreviewContainer) {
            previewImg.src = dataUrl;
            proposalPreviewContainer.style.display = "block";
          }
        } catch (err) {
          console.error("Error compressing image:", err);
          alert("Error al cargar la imagen: " + err.message);
        }
      };
    }

    const btnRemoveRef = document.getElementById("btnRemoveProposalReference");
    if (btnRemoveRef) {
      btnRemoveRef.onclick = () => {
        window._tempProposalReferenceImage = null;
        if (proposalPreviewContainer) proposalPreviewContainer.style.display = "none";
        if (proposalFileInput) proposalFileInput.value = "";
      };
    }

    // Resetear botón de play
    const playBtn = document.getElementById("playerPlayBtn");
    if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';

    // Nueva lógica del botón de propuesta (+)
    bindNewProposalToggleButtons({
      buttonId: "btnShowNewProposal",
      containerId: "newProposalContainer",
      proposalTextAreaId: "infoSceneProposalText",
      notifyActivity: (action) => {
        notifyActivity(action, window._currentActiveRowId?.replace("row_", "") || -1);
      }
    });

    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(session);
    if (entries.length > 0) {
      await multimediaPlaybackController.tick(0);
    }
  }
}

// Cableado de controles del reproductor (Eliminado - movido a initMultimediaPlayer)

function normalizeDashboardProposalState(list = []) {
  return Array.from(new Set(
    (Array.isArray(list) ? list : [])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
  ));
}

function resolveDashboardActiveVisualProposal(row = null) {
  if (!row || typeof row !== "object") return "";
  const resolved = new Set(normalizeDashboardProposalState(row?.visualNotesResolvedProposals));
  const explicit = String(row?.visualNotesProposal || "").trim();

  // Si hay una propuesta explícita y NO está resuelta, es la activa
  if (explicit && !resolved.has(explicit)) return explicit;

  const proposals = Array.isArray(row?.visualNotesProposals)
    ? row.visualNotesProposals.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  for (let index = proposals.length - 1; index >= 0; index -= 1) {
    const candidate = String(proposals[index] || "").trim();
    if (candidate && !resolved.has(candidate)) return candidate;
  }
  return "";
}

function resolveDashboardDisplayedVisualProposal(row = null) {
  if (!row || typeof row !== "object") return "";
  const explicit = String(row?.visualNotesProposal || "").trim();
  if (explicit) return explicit;
  const active = resolveDashboardActiveVisualProposal(row);
  if (active) {

  }
  return active;
}

function isDashboardProposalResolved(row = null, proposalText = "") {
  const proposal = String(proposalText || "").trim();
  if (!proposal || !row || typeof row !== "object") return false;
  return normalizeDashboardProposalState(row.visualNotesResolvedProposals).includes(proposal);
}

async function eliminarPropuestaDesdeDashboard(proposalText) {
  if (!currentMultimediaSession || !window._currentActiveRowId) return;



  try {
    const result = await mutateDashboardProposalSession(window._currentActiveRowId, (rows, rowIndex) => {
      const targetRow = rows[rowIndex];

      // Asegurar que esté en el historial antes de marcarla como realizada
      if (!Array.isArray(targetRow.visualNotesProposals)) {
        targetRow.visualNotesProposals = [];
      }
      if (!targetRow.visualNotesProposals.includes(proposalText)) {
        targetRow.visualNotesProposals.push(proposalText);
      }

      const resolved = normalizeDashboardProposalState(targetRow.visualNotesResolvedProposals);
      if (!resolved.includes(proposalText)) {
        resolved.push(proposalText);
      }
      targetRow.visualNotesResolvedProposals = resolved;
      // Si la propuesta que marcamos como realizada era la "activa", la limpiamos
      if (String(targetRow.visualNotesProposal || "").trim() === proposalText) {
        targetRow.visualNotesProposal = "";
      }
      return true;
    });
    if (!result.ok) return;
    await notifyActivity("ha marcado una propuesta como realizada", result.rowIndex);
    multimediaPlaybackController.sync(currentMultimediaSession);
    multimediaPlaybackDeps.updatePodcastVideoTransportUi();

  } catch (error) {
    console.error("[Dashboard] Error al marcar propuesta como realizada:", error);
    alert("No se pudo actualizar la propuesta. Intenta de nuevo.");
  }
}

async function unresolvePropuestaDesdeDashboard(proposalText) {
  if (!currentMultimediaSession || !window._currentActiveRowId) return;



  try {
    const result = await mutateDashboardProposalSession(window._currentActiveRowId, (rows, rowIndex) => {
      const targetRow = rows[rowIndex];
      const resolved = normalizeDashboardProposalState(targetRow.visualNotesResolvedProposals);
      targetRow.visualNotesResolvedProposals = resolved.filter(p => p !== proposalText);
      // Al restaurarla, la volvemos a poner como la propuesta activa
      targetRow.visualNotesProposal = proposalText;
      return true;
    });
    if (!result.ok) return;
    await notifyActivity("ha restaurado una propuesta a pendientes", result.rowIndex);
    multimediaPlaybackController.sync(currentMultimediaSession);
    multimediaPlaybackDeps.updatePodcastVideoTransportUi();
  } catch (error) {
    console.error("[Dashboard] Error al restaurar propuesta:", error);
  }
}

async function aplicarPropuestaDesdeDashboard(proposalText) {
  if (!currentMultimediaSession || !window._currentActiveRowId) return;



  try {
    const result = await mutateDashboardProposalSession(window._currentActiveRowId, (rows, rowIndex) => {
      const targetRow = rows[rowIndex];
      targetRow.visualNotesProposal = proposalText;
      if (!Array.isArray(targetRow.visualNotesProposals)) {
        targetRow.visualNotesProposals = [];
      }
      if (!targetRow.visualNotesProposals.includes(proposalText)) {
        targetRow.visualNotesProposals.push(proposalText);
      }
      // Al aplicar, quitamos de resueltas si estaba ahí
      targetRow.visualNotesResolvedProposals = normalizeDashboardProposalState(targetRow.visualNotesResolvedProposals).filter(p => p !== proposalText);
      return true;
    });
    if (!result.ok) return;

    await notifyActivity("ha seleccionado una propuesta como activa", result.rowIndex);
    multimediaPlaybackController.sync(currentMultimediaSession);
    multimediaPlaybackDeps.updatePodcastVideoTransportUi();
    alert("✅ Propuesta aplicada como elemento visual oficial.");
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

function setViewerMontageExportStatus(text = "", hint = "", tone = "neutral", progress = null) {
  const modal = document.getElementById("montageExportModal");
  const statusBox = document.getElementById("montageExportStatusBox");
  const status = document.getElementById("montageExportStatus");
  const hintEl = document.getElementById("montageExportHint");
  const progressBar = document.getElementById("montageExportProgressBar");
  if (status) status.textContent = String(text || "").trim();
  if (hintEl) hintEl.textContent = String(hint || "").trim();
  if (statusBox) statusBox.dataset.tone = String(tone || "neutral");
  const normalizedProgress = Number(progress);
  const hasProgress = Number.isFinite(normalizedProgress);
  modal?.classList.toggle("is-progress", hasProgress);
  if (progressBar && hasProgress) {
    progressBar.style.setProperty("--montage-export-progress", `${Math.round(Math.max(0, Math.min(1, normalizedProgress)) * 1000) / 10}%`);
  }
}

async function cancelViewerMontageExport() {
  const jobId = String(exportJobState.jobId || "").trim();
  if (exportJobState.pollTimer) clearTimeout(exportJobState.pollTimer);
  exportJobState.pollTimer = null;
  if (jobId) {
    try {
      await authFetchJson(buildExportApiUrl("/api/podcaster/montage/export-cancel"), {
        method: "POST",
        body: { jobId }
      });
    } catch (_) { }
  }
  exportJobState.jobId = null;
  exportJobState.isBusy = false;
  document.getElementById("montageExportModal")?.classList.remove("is-busy", "is-progress");
  const confirmButton = document.getElementById("confirmMontageExportBtn");
  if (confirmButton) confirmButton.disabled = false;
  setViewerMontageExportStatus("Exportación cancelada.", "Puedes ajustar la configuración e intentarlo nuevamente.", "warning");
}

function buildDashboardBrandOverlay() {
  return {
    enabled: true,
    assetPath: "public/podcaster/logo.png",
    position: "top-right",
    marginPct: 0.025,
    widthPct: 0.05,
    opacity: 1
  };
}

function initExportUiEvents() {
  const btnOpen = document.getElementById("btnOpenExportModal");
  const modal = document.getElementById("montageExportModal");
  const btnConfirm = document.getElementById("confirmMontageExportBtn");
  const bitrateMode = document.getElementById("montageExportBitrateMode");
  const customBitrateBox = document.getElementById("montageExportCustomBitrateBox");
  const filenameInput = document.getElementById("montageExportFilename");
  const sessionTitle = modal?.querySelector(".floating-panel-session-title");

  btnOpen?.addEventListener("click", () => {
    const sessionId = String(currentMultimediaSession?.id || "").trim();
    if (!sessionId) return;
    const title = String(currentMultimediaSession?.title || "montage").trim() || "montage";
    if (filenameInput && !filenameInput.dataset.userEdited) filenameInput.value = title;
    if (sessionTitle) sessionTitle.textContent = title;
    modal.hidden = false;
    setViewerMontageExportStatus("Listo para exportar.", "Configura el montaje y revisa las opciones antes de iniciar.", "neutral");
  });

  filenameInput?.addEventListener("input", () => {
    filenameInput.dataset.userEdited = "true";
  });

  bitrateMode?.addEventListener("change", () => {
    if (customBitrateBox) customBitrateBox.hidden = bitrateMode.value !== "custom";
  });

  modal?.querySelectorAll("[data-quality]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.querySelectorAll("[data-quality]").forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });

  modal?.querySelector("[data-action='close-montage-export-modal']")?.addEventListener("click", () => {
    if (!exportJobState.isBusy) modal.hidden = true;
  });
  document.getElementById("closeMontageExportBtn")?.addEventListener("click", () => {
    if (!exportJobState.isBusy) modal.hidden = true;
  });
  document.getElementById("cancelMontageExportBtn")?.addEventListener("click", async () => {
    if (exportJobState.isBusy || exportJobState.jobId) await cancelViewerMontageExport();
    else modal.hidden = true;
  });
  document.getElementById("montageExportPreviewPlayBtn")?.addEventListener("click", () => multimediaPlaybackController.play());
  document.getElementById("montageExportPreviewPauseBtn")?.addEventListener("click", () => multimediaPlaybackController.pause());
  document.getElementById("montageExportPreviewStopBtn")?.addEventListener("click", () => multimediaPlaybackController.stop());
  document.getElementById("montageExportRefreshPreviewBtn")?.addEventListener("click", () => multimediaPlaybackController.seek(0));

  btnConfirm?.addEventListener("click", () => startMontageExport());
}

async function startMontageExport() {
  if (exportJobState.isBusy) return;
  if (!currentMultimediaSession) return;

  const btnConfirm = document.getElementById("confirmMontageExportBtn");
  const modal = document.getElementById("montageExportModal");

  // Recoger opciones
  const resolution = document.getElementById("montageExportResolution")?.value || "source";
  const bitrateMode = document.getElementById("montageExportBitrateMode")?.value || "vbr";
  const maxBitrateMbps = parseFloat(document.getElementById("montageExportMaxBitrate")?.value || "5");
  const minBitrateCrf = parseInt(document.getElementById("montageExportMinBitrate")?.value || "20");
  const qualityPreset = String(modal?.querySelector("[data-quality].is-active")?.dataset?.quality || "balanced");
  const format = document.getElementById("montageExportFormat")?.value || "mp4_h264";
  const exportMode = document.getElementById("montageExportMode")?.value || "normal";
  const renderMode = document.getElementById("montageExportRenderMode")?.value || "browser";
  const onlyAudio = document.getElementById("montageExportOnlyAudio")?.checked === true;
  const filename = String(document.getElementById("montageExportFilename")?.value || "montage").trim() || "montage";
  const includeLogo = document.getElementById("montageExportIncludeLogo")?.checked !== false;
  const partyKaraoke = document.getElementById("montageExportPartyKaraoke")?.checked !== false;

  const bitrateSettings = {
    mode: bitrateMode,
    maxBitrateMbps: maxBitrateMbps,
    minBitrateCrf: minBitrateCrf
  };

  try {
    exportJobState.isBusy = true;
    modal?.classList.add("is-busy");
    setViewerMontageExportStatus("Preparando exportación…", "Construyendo escenas, audio, textos y configuración del montaje.", "neutral", 0.04);
    btnConfirm?.classList.add("btn-export-loading");
    btnConfirm.disabled = true;

    // Construir payload completo basado en lo que el backend espera
    // Reusamos la lógica de persistencia para obtener los sourceItems correctos
    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(currentMultimediaSession) || [];
    const effectivePanelMusicConfig = multimediaPlaybackDeps.getPanelMontageMusicConfig(currentMultimediaSession);
    const rows = extractDashboardSessionRows(currentMultimediaSession) || [];
    const onScreenTextTimeline = buildDashboardMontageOnScreenTextSegments(currentMultimediaSession, entries);

    const mappedEntries = entries.map((entry, index) => {
      const rowId = String(entry?.rowId || "").trim();
      const row = rows.find((item) => String(item?.id || "").trim() === rowId) || null;
      const video = entry.video || null;
      const videoStoragePath = String(video?.storagePath || "").trim();
      const videoDownloadUrl = String(video?.url || "").trim();
      const videoMimeType = String(video?.mimeType || "video/mp4").trim();
      const isImageAsset = String(video?.mediaKind || video?.type || "").trim().toLowerCase() === "image"
        || videoMimeType.startsWith("image/");
      const durationMs = Math.max(500, Number(entry?.effectiveDurationMs || entry?.durationMs || 0) || 1000);
      const trimInMs = Math.max(0, Number(entry?.clip?.trimInMs || entry?.trimInMs || 0) || 0);

      const audio = entry.audio || entry.dialogueAudio || null;
      const audioStoragePath = String(audio?.storagePath || "").trim();
      const audioDownloadUrl = String(audio?.url || "").trim();
      const audioMimeType = String(audio?.mimeType || "audio/ogg").trim();

      return {
        rowId,
        sceneIndex: index + 1,
        speaker: String(row?.speaker || "").trim(),
        sceneLabel: `Escena ${index + 1}`,
        zIndex: Math.max(1, Number(entry?.zIndex || index + 1) || (index + 1)),
        timelineStartMs: Math.max(0, Number(entry?.startMs || 0) || 0),
        timelineEndMs: Math.max(0, Number(entry?.endMs || 0) || 0),
        trimInMs,
        durationMs,
        voiceOverText: String(row?.voiceOverText || row?.text || "").replace(/\s+/g, " ").trim(),
        sceneDescription: String(row?.sceneDescription || row?.scenePrompt || "").replace(/\s+/g, " ").trim(),
        onScreenText: resolveDashboardRowOnScreenText(row),
        visualNotes: String(row?.visualNotes || "").replace(/\s+/g, " ").trim(),
        videoDirective: String(row?.videoDirective || "").replace(/\s+/g, " ").trim(),
        video: {
          storagePath: videoStoragePath || "",
          url: videoDownloadUrl || "",
          mimeType: videoMimeType,
          type: isImageAsset ? "image" : "video",
          mediaKind: isImageAsset ? "image" : "video"
        },
        audio: (audioStoragePath || audioDownloadUrl) ? {
          storagePath: audioStoragePath || "",
          url: audioDownloadUrl || "",
          mimeType: audioMimeType
        } : null,
        useNativeVideoAudio: false
      };
    });

    const payload = {
      sessionId: currentMultimediaSession.id,
      title: currentMultimediaSession.title || "Export Dashboard",
      filename,
      exportMode,
      renderMode,
      renderPipeline: "ffmpeg-preview-runtime-v2",
      clientBuild: {
        module: "home-video-player-export",
        route: "/api/podcaster/montage/export-v2"
      },
      onlyAudio,
      resolution: resolution,
      bitrateSettings: bitrateSettings,
      format,
      qualityPreset,
      partyKaraoke,
      includeBackgroundMusic: true,
      entries: mappedEntries,
      backgroundMusic: effectivePanelMusicConfig || null,
      audioTimeline: {
        enabled: true,
        backgroundSegments: effectivePanelMusicConfig?.sourceItems || []
      },
      onScreenTextTimeline: (onScreenTextTimeline.segments.length || onScreenTextTimeline.suppressFallbackFromEntries === true) ? {
        enabled: onScreenTextTimeline.segments.length > 0,
        settings: onScreenTextTimeline.settings,
        segments: onScreenTextTimeline.segments,
        suppressFallbackFromEntries: onScreenTextTimeline.suppressFallbackFromEntries === true
      } : null,
      brandOverlay: includeLogo ? buildDashboardBrandOverlay() : { enabled: false }
    };

    payload.previewRuntime = {
      version: 2,
      totalDurationMs: mappedEntries.reduce((max, entry) => Math.max(max, Number(entry.timelineEndMs || 0)), 0),
      entries: mappedEntries.map((entry) => ({
        rowId: entry.rowId,
        startMs: entry.timelineStartMs,
        endMs: entry.timelineEndMs,
        durationMs: entry.durationMs,
        trimInMs: entry.trimInMs,
        timingSegments: []
      }))
    };

    const response = await authFetchJson(buildExportApiUrl("/api/podcaster/montage/export-v2"), {
      method: "POST",
      body: payload
    });

    if (response.jobId) {
      exportJobState.jobId = response.jobId;
      setViewerMontageExportStatus("Exportación iniciada…", "El backend está preparando los recursos del montaje.", "neutral", 0.08);
      pollExportStatus();
    } else {
      throw new Error("No se recibió jobId del servidor");
    }

  } catch (err) {
    console.error("[Dashboard] Error al iniciar exportación:", err);
    setViewerMontageExportStatus("No se pudo iniciar la exportación.", err.message, "error");
    showNotification("❌ Error al iniciar exportación: " + err.message, "error");
  } finally {
    if (!exportJobState.jobId) {
      exportJobState.isBusy = false;
      modal?.classList.remove("is-busy");
      btnConfirm?.classList.remove("btn-export-loading");
      if (btnConfirm) btnConfirm.disabled = false;
    }
  }
}

async function pollExportStatus() {
  if (!exportJobState.jobId) return;

  try {
    const exportStatusUrl = buildExportApiUrl(`/api/podcaster/montage/export-status?jobId=${encodeURIComponent(exportJobState.jobId)}`);
    const data = await authFetchJson(exportStatusUrl, {
      auth: false
    });

    if (data.status === "ready") {
      const url = data.downloadUrl || data.export?.downloadUrl;
      if (url) {
        setViewerMontageExportStatus("Exportación lista.", "El archivo se descargará automáticamente.", "success", 1);
        showNotification("✅ ¡Video listo! Iniciando descarga...", "success");
        const a = document.createElement("a");
        a.href = url;
        a.download = data.export?.filename || "video-exportado.mp4";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      exportJobState.jobId = null;
      exportJobState.isBusy = false;
      document.getElementById("montageExportModal")?.classList.remove("is-busy");
      const confirmButton = document.getElementById("confirmMontageExportBtn");
      if (confirmButton) confirmButton.disabled = false;
    } else if (data.status === "error") {
      setViewerMontageExportStatus("La exportación falló.", data.error?.message || "Error desconocido", "error");
      showNotification("❌ Error en la exportación: " + (data.error?.message || "Error desconocido"), "error");
      exportJobState.jobId = null;
      exportJobState.isBusy = false;
      document.getElementById("montageExportModal")?.classList.remove("is-busy");
      const confirmButton = document.getElementById("confirmMontageExportBtn");
      if (confirmButton) confirmButton.disabled = false;
    } else {
      // Seguimos polleando
      const progress = Math.round((data.progress || 0) * 100);
      setViewerMontageExportStatus(
        data.stage ? `Exportando: ${String(data.stage).replace(/[_-]+/g, " ")}…` : "Exportando montaje…",
        data.hint || `Progreso ${progress}%`,
        "neutral",
        Number(data.progress || 0)
      );

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


  items.forEach(item => {
    const card = document.createElement("div");
    // Clase base según el tipo
    let accentClass = "workbench-item-lectura";
    if (type === "unidad") accentClass = "workbench-item-unidad";
    if (type === "download") accentClass = "workbench-item-download";
    if (type === "aprende") accentClass = "workbench-item-aprende";
    if (type === "escapeRoom") accentClass = "workbench-item-unidad";
    if (type === "multimedia" || type === "podcast") accentClass = "workbench-item-multimedia";

    card.className = `workbench-item ${accentClass}`;

    // Inyectar metadatos para filtrado (Primaria, Grado, etc.)
    card.dataset.nivel = String(item.nivel || "").toLowerCase();
    card.dataset.grado = String(item.grado || "").toLowerCase();
    card.dataset.trimestre = String(item.trimestre || "").toLowerCase();
    card.dataset.unidad = String(item.unidad || "").toLowerCase();

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
      } else if (type === 'escapeRoom') {
        displayTitle = item.title || item.project?.titulo || item.formState?.temaInput || "Escape Room";
        metaLabel = "ESCAPE ROOM";
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
      const now = new Date();
      const isToday = dateObj.toDateString() === now.toDateString();
      if (isToday) {
        date = `Hoy, ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        date = dateObj.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
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
    const statusLabel = item.status === "published" || item.publicar === true || item.published === true ? 'Publicada' : 'Borrador';

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
            const firstName = cached.firstName || "";
            const lastName = cached.lastName || "";
            const fullName = `${firstName} ${lastName}`.trim();
            authorName = fullName || cached.userName || cached.displayName || cached.nombre || cached.email || authorName;
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

    if (type === 'escapeRoom') {
      const project = item.project && typeof item.project === "object" ? item.project : {};
      const formState = item.formState && typeof item.formState === "object" ? item.formState : {};
      const nivel = project.nivel || formState.nivelSelect || "—";
      const grado = project.grado || formState.gradoSelect || "—";
      const trimestre = project.trimestre || item.trimestre || formState.trimestreSelect || "—";
      const materia = project.materia || item.materia || formState.materiaSelect || "—";
      const unidadTemaLabel = String(nivel).toLowerCase() === "primaria" ? "Unidad" : "Tema";
      const unidadTemaValue = project.unidad || item.unidad || project.tema || item.tema || formState.unidadTemaSelect || "—";
      const estacion = project.estacion || item.estacion || formState.estacionSelect || "";
      const modoPresentacion = project.modo_presentacion || formState.modoPresentacionSelect || "salas";
      const formatoLabel = modoPresentacion === "menu_secciones" ? "Menú por secciones" : "Por salas";
      const previewProject = project && Object.keys(project).length ? project : null;
      const topicSummaries = Array.isArray(item.topicSummaries) ? item.topicSummaries : [];

      if (previewProject) {
        escapeRoomPreviewCache.set(item.id, previewProject);
      }

      card.className = `workbench-item ${accentClass} accordion-item`;
      card.dataset.id = item.id;
      card.dataset.coleccion = item.coleccion || "";
      card.innerHTML = `
        <div class="workbench-accordion-header">
          <div class="workbench-item-icon" aria-hidden="true">
            <img src="pigpen.png" alt="PigPen" class="flow-status-img" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">
          </div>
          <div class="workbench-item-copy">
            <div class="workbench-item-meta">
              <span>${escapeHtml(metaLabel)}</span>
            </div>
            <h2 class="workbench-item-title">${escapeHtml(displayTitle)}</h2>
            <div class="workbench-tags">
              <span class="workbench-tag"><i class="fas fa-table-cells-large" aria-hidden="true"></i> ${escapeHtml(formatoLabel)}</span>
              <span class="workbench-tag"><i class="fas fa-layer-group" aria-hidden="true"></i> ${topicSummaries.length || (previewProject ? 1 : 0)} temas</span>
            </div>
          </div>
          <i class="fas fa-chevron-down workbench-accordion-icon"></i>
        </div>

        <div class="workbench-accordion-body">
          <div class="workbench-details-grid">
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Nivel</span>
              <span class="workbench-detail-value">${escapeHtml(String(nivel))}</span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Grado</span>
              <span class="workbench-detail-value">${escapeHtml(String(grado))}</span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Trimestre</span>
              <span class="workbench-detail-value">${escapeHtml(String(trimestre))}</span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Materia</span>
              <span class="workbench-detail-value">${escapeHtml(String(materia))}</span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">${escapeHtml(unidadTemaLabel)}</span>
              <span class="workbench-detail-value">${escapeHtml(String(unidadTemaValue))}</span>
            </div>
            ${String(nivel).toLowerCase() === "secundaria" ? `
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Estación</span>
              <span class="workbench-detail-value">${escapeHtml(String(estacion || "—"))}</span>
            </div>
            ` : ""}
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Autor</span>
              <span class="workbench-detail-value">${escapeHtml(authorName)}</span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Estado</span>
              <span class="workbench-detail-value"><span class="workbench-tag is-status">${statusLabel}</span></span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Formato</span>
              <span class="workbench-detail-value">${escapeHtml(formatoLabel)}</span>
            </div>
            <div class="workbench-detail-item">
              <span class="workbench-detail-label">Fecha</span>
              <span class="workbench-detail-value">${escapeHtml(date)}</span>
            </div>
            <div class="workbench-action-area">
              <div class="workbench-item-actions" style="flex-direction: row; gap: 0.75rem; justify-content: flex-end; width: 100%;">
                ${topicSummaries.length ? topicSummaries.map((topic) => `
                  <a href="#" class="btn-workbench-action" data-id="${item.id}" data-topic-id="${escapeHtml(String(topic.id || ""))}" data-type="escapeRoom_preview" title="Ver Tema ${escapeHtml(String(topic.academicNumber || ""))}" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; background: #ec4899 !important; box-shadow: 0 4px 15px rgba(236, 72, 153, 0.3) !important;">
                    <i class="fas fa-eye"></i><span>Tema ${escapeHtml(String(topic.academicNumber || ""))} · ${escapeHtml(String(topic.title || "Escape Room"))}</span>
                  </a>
                `).join("") : `
                  <a href="#" class="btn-workbench-action" data-id="${item.id}" data-type="escapeRoom_preview" title="Ver preview" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; background: #ec4899 !important; box-shadow: 0 4px 15px rgba(236, 72, 153, 0.3) !important;">
                    <i class="fas fa-eye"></i><span>Ver preview</span>
                  </a>
                `}
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'multimedia' || type === 'podcast') {
      const session = item.session || item;
      const ui = session?.podcastStudioUiState || {};
      const clipMap = session?.timelineClipMap || ui.timelineClipsByRowId || {};
      const nivel = String(session?.nivel || item?.nivel || "").trim();
      const grado = String(session?.grado || item?.grado || "").trim();
      const trimestre = String(session?.trimestre || item?.trimestre || "").trim();
      const unidad = String(session?.unidad || item?.unidad || "").trim();
      const academicDetailItems = [
        nivel ? `
            <div class="multimedia-detail-item">
              <span class="multimedia-detail-label">Nivel</span>
              <span class="multimedia-detail-value">${escapeHtml(nivel)}</span>
            </div>
        ` : "",
        grado ? `
            <div class="multimedia-detail-item">
              <span class="multimedia-detail-label">Grado</span>
              <span class="multimedia-detail-value">${escapeHtml(grado)}</span>
            </div>
        ` : "",
        trimestre ? `
            <div class="multimedia-detail-item">
              <span class="multimedia-detail-label">Trimestre</span>
              <span class="multimedia-detail-value">${escapeHtml(trimestre)}</span>
            </div>
        ` : "",
        unidad ? `
            <div class="multimedia-detail-item">
              <span class="multimedia-detail-label">Unidad</span>
              <span class="multimedia-detail-value">${escapeHtml(unidad)}</span>
            </div>
        ` : ""
      ].join("");

      let previewUrl = "";
      const firstVideoClip = Object.values(clipMap).find(c => c.videoSrc);
      if (firstVideoClip) {
        const rawSrc = firstVideoClip.videoSrc;
        previewUrl = rawSrc.startsWith('gs://')
          ? resolveStorageVideoUrl("", rawSrc)
          : rawSrc;
      }

      const rows = extractDashboardSessionRows(session);
      const hasAnyProposal = rows.some(r => (r.visualNotesProposals?.length > 0 || !!r.visualNotesProposal));
      const hasPending = hasAnyProposal && rows.some(r => {
        const proposals = Array.isArray(r.visualNotesProposals) ? r.visualNotesProposals : [];
        const resolved = Array.isArray(r.visualNotesResolvedProposals) ? r.visualNotesResolvedProposals : [];
        const pending = proposals.some(p => !resolved.includes(p));
        return pending || !!r.visualNotesProposal;
      });
      const hasRealized = hasAnyProposal && rows.some((row) => {
        const visualNotes = resolveDashboardRowVisualNotes(row);
        if (row?.visualNotesOriginalStored === true && row?.visualNotesOriginalText !== visualNotes) {
          return true;
        }
        const resolved = Array.isArray(row?.visualNotesResolvedProposals) ? row.visualNotesResolvedProposals : [];
        return resolved.length > 0;
      });

      card.className = `workbench-item workbench-item-multimedia accordion-item`;
      card.innerHTML = `
        <div class="multimedia-accordion-header">
          <div class="workbench-item-preview">
            ${previewUrl ? `<video src="${previewUrl}" muted playsinline></video>` : `<i class="fas fa-video" style="color: #475569; font-size: 16px;"></i>`}
          </div>
          <div class="workbench-item-title">
            ${escapeHtml(displayTitle)}
            ${hasPending ? `<span class="proposal-badge is-pending" style="margin-left: 10px; vertical-align: middle;">PROPUESTA</span>` : ""}
            ${hasRealized ? `<span class="proposal-badge is-realized" style="margin-left: 10px; vertical-align: middle;">REALIZADA</span>` : ""}
          </div>
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
            ${academicDetailItems}
            ${hasAnyProposal ? `
                <div class="multimedia-detail-item">
                  <span class="multimedia-detail-label">Propuestas</span>
                  <span class="multimedia-detail-value">
                    ${hasPending
            ? `<span class="proposal-badge is-pending">Pendientes</span>`
            : `<span class="proposal-badge is-realized">Realizadas</span>`}
                  </span>
                </div>
            ` : ""}
            <div class="multimedia-action-area">
              <button class="btn-multimedia-play-large btn-multimedia-play" data-id="${item.id}">
                <i class="fas fa-play-circle"></i> Ver Video
              </button>
            </div>
          </div>
        </div>
      `;

      const video = card.querySelector('video');
      if (video) {
        card.addEventListener('mouseenter', () => video.play().catch(() => { }));
        card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
      }
    } else {
      card.className = `workbench-item ${accentClass} accordion-item`;
      card.dataset.id = item.id; // Asegurar ID para el toggle
      card.dataset.coleccion = item.coleccion || ""; // Guardar colección para acciones (Like, Archive)
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
                  <a href="#" class="btn-workbench-action btn-item-edit" data-id="${item.id}" data-type="${type}" data-coleccion="${item.coleccion || ''}" title="Editar" style="padding: 0.6rem 1.2rem; font-size: 0.85rem;">
                    <i class="fas fa-edit"></i>
                    <span>Editar</span>
                  </a>
                  ${type === 'lectura' ? `
                  <a href="#" class="btn-workbench-action ver-lectura" data-id="${item.id}" data-coleccion="${item.coleccion || ''}" title="Ver lectura" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; background: #6366f1 !important; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3) !important;">
                    <i class="fas fa-eye"></i>
                    <span>Ver Lectura</span>
                  </a>
                  ` : ''}
                  ${type === 'aprende' ? `
                  <a href="#" class="btn-workbench-action" data-id="${item.id}" data-type="aprende_ver" title="Ver Contenido" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; background: #f59e0b !important; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3) !important;">
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
    }
    container.appendChild(card);
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

async function abrirLecturaDashboard(id, col) {
  const actualColInput = col || "lecturas";
  if (!id) return;
  if (window.unsubscribeComentarios) window.unsubscribeComentarios();

  lecturaIdActual = id;
  coleccionLecturaActual = actualColInput;

  try {
    let snap = null;
    let actualCol = actualColInput;

    if (actualCol) {
      snap = await getDoc(doc(db, actualCol, id));
    }

    if (!snap || !snap.exists()) {
      // Búsqueda exhaustiva
      const fallbackCols = ["lecturas", "lecturasNuevas"];
      for (const fcol of fallbackCols) {
        if (fcol === actualCol) continue;
        const fsnap = await getDoc(doc(db, fcol, id));
        if (fsnap.exists()) {
          snap = fsnap;
          actualCol = fcol;
          break;
        }
      }
    }

    if (!snap || !snap.exists()) {
      alert("❌ La lectura no se encontró en Firestore.");
      return;
    }

    const lecturaDoc = snap.data();
    const textoGuardado = lecturaDoc.texto || lecturaDoc.contenidoHTML || "";
    localStorage.setItem(`lectura_${id}`, textoGuardado);

    const unidadRaw = lecturaDoc.unidadData ?? {
      nivel: lecturaDoc.nivel, grado: lecturaDoc.grado,
      trimestre: lecturaDoc.trimestre, unidad: lecturaDoc.unidad
    };
    const gradoTexto = mapaGradoTexto[String(unidadRaw.grado)] || unidadRaw.grado || "-";
    const clave = `${unidadRaw.nivel}_${gradoTexto}_${unidadRaw.trimestre}_${unidadRaw.unidad}`.toLowerCase();
    const urlImagen = window.imagenesRelacionadasPorClave?.[clave];

    const contenedor = document.getElementById("modalTextoLectura");
    renderLecturaModalContent(contenedor, textoGuardado, urlImagen, actualCol);

    agregarMarcadoresDePosicion(contenedor);

    const modal = document.getElementById("modalLectura");
    modal.classList.remove("hidden");

    window.unsubscribeComentarios = await renderComentarios(id);

  } catch (err) {
    console.error("Error al abrir lectura en dashboard:", err);
    alert("❌ Error al cargar los detalles de la lectura.");
  }
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

  } catch (err) {
    console.error("Error al registrar descarga de Word:", err);
  }
});


// Inicializar el reproductor multimedia del dashboard
if (document.getElementById("videoPlayerPage")) initMultimediaPlayer();

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
      window.open(`moodleCourse.html?cursoId=${cursoId}`, '_blank');
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
