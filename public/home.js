import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  initializeFirestore, collection, query, where, getDocs, doc,
  updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, deleteDoc, onSnapshot,
  orderBy, limit, persistentLocalCache, persistentMultipleTabManager
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
import { authFetchJson, buildApiUrl, hasAvailableApiBase } from "./api-client.js";
import { PodcasterPlaybackController } from "./podcaster-playback-controller.js?v=2026-1.0.1.34";

const app = initializeApp(assertFirebaseWebConfig(firebaseWebConfig));
void bootstrapFirebaseAppCheck(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
const auth = getAuth(app);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await verificarRolUsuario(user);

    // Obtener nombre real del usuario
    obtenerNombreUsuarioActual(user).then(name => {
      currentUserName = name;

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
      }
      return;
    }

    // 6. PLAY MULTIMEDIA
    const btnPlay = e.target.closest('.btn-multimedia-play');
    if (btnPlay) {
      try {
        const docRefPlay = doc(db, "podcaster_sessions", id);
        const snapPlay = await getDoc(docRefPlay);
        if (snapPlay.exists()) {
          const dataPlay = snapPlay.data();
          const shallowSession = createDashboardSessionFallback(dataPlay, id);
          const sessionPlay = await loadFullDashboardPodcasterSession(id, shallowSession);
          abrirReproductorMultimedia(sessionPlay);
        }
      } catch (err) {
        console.error("Error al cargar sesión:", err);
      }
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
    document.getElementById("contenedorImagenesCompartidas"),
    document.getElementById("contenedorUnidadesUser"),
    document.getElementById("contenedorMultimediaUser"),
    document.getElementById("contenedorPodcastsUser"),
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




/**
 * REPRODUCTOR MULTIMEDIA (DASHBOARD)
 */
let currentMultimediaSession = null;
let multimediaPlayerUnsubscribe = null;
let homePlaybackState = {
  stageVideoSlot: 0,
  montageCursorMs: 0,
  montageAudioPlayers: {}
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
    const sessionData = data?.session && typeof data.session === "object" ? data.session : data;
    const base = cloneDashboardSessionPayload(sessionData) || cloneDashboardSessionPayload(fallbackSession) || {};
    const fallbackClone = cloneDashboardSessionPayload(fallbackSession) || {};
    if (!base || typeof base !== "object") return fallbackSession || null;
    base.id = cleanId;
    if (data.publicar === true) base.publicar = true;
    if (data.archived === true) base.archived = true;
    if (data.ownerId || data.updatedAt?.toDate) {
      base.cloudMeta = {
        ownerId: String(data.ownerId || "").trim() || null,
        savedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
      };
    }
    const mergedRows = mergeDashboardRows(
      extractDashboardSessionRows(base),
      extractDashboardSessionRows(fallbackClone)
    );
    if (mergedRows.length) {
      base.script = { ...(base.script || {}), rows: mergedRows };
      base.rows = mergedRows;
    }
    return base;
  } catch (error) {
    console.warn("[Dashboard] No se pudo cargar la sesión completa desde podcaster_sessions:", error);
    return fallbackSession || null;
  }
}

function createDashboardSessionFallback(data = null, sessionId = "") {
  const source = data && typeof data === "object" ? data : {};
  const nested = source?.session && typeof source.session === "object" ? source.session : {};
  const base = cloneDashboardSessionPayload(nested) || cloneDashboardSessionPayload(source) || {};
  if (!base || typeof base !== "object") {
    return { id: String(sessionId || "").trim() };
  }
  const mergedRows = mergeDashboardRows(
    extractDashboardSessionRows(nested),
    extractDashboardSessionRows(source)
  );
  if (mergedRows.length) {
    if (!base.script || typeof base.script !== "object") {
      base.script = {};
    }
    base.script.rows = mergedRows;
    base.rows = mergedRows;
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
            writeOps.push(updateDoc(sessionRef, {
              [sRowsPath]: proposalRows,
              "session.updatedAt": now,
              sessionUpdatedAt: now,
              updatedAt: now
            }));
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

const storage = getStorage(app);
const multimediaPlaybackController = new PodcasterPlaybackController();
const staleProxyMediaUrls = new Set();
let homeStageVideoLoadTokenSeq = 0;
const homeStageVideoLoadTokensByEl = new WeakMap();

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function markStaleProxyMediaUrl(url = "", reason = "proxy-media-404", payload = {}) {
  const clean = String(url || "").trim();
  if (!clean) return;
  staleProxyMediaUrls.add(clean);
}

function isMarkedStaleProxyMediaUrl(url = "") {
  const clean = String(url || "").trim();
  return clean ? staleProxyMediaUrls.has(clean) : false;
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
  const clean = String(rawUrl || "").trim();
  const cleanStoragePath = String(storagePath || "").trim();
  const proxyPath = kind === "image" ? "/api/assets/proxy-image" : "/api/assets/proxy-media";
  if (cleanStoragePath) {
    const storageProxyUrl = buildApiUrl(`${proxyPath}?storagePath=${encodeURIComponent(cleanStoragePath)}`);
    if (!isMarkedStaleProxyMediaUrl(storageProxyUrl)) {
      return storageProxyUrl;
    }
  }
  if (!clean) return "";
  try {
    const parsed = new URL(clean, window.location.origin);
    return buildApiUrl(`${proxyPath}?url=${encodeURIComponent(parsed.toString())}`);
  } catch (_) {
    return clean;
  }
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
    if (clean.startsWith("/api/assets/proxy-media?")) return buildApiUrl(clean);
    if (clean.startsWith("/api/assets/proxy-image?")) {
      const parsedProxy = new URL(buildApiUrl(clean), window.location.origin);
      const nested = String(parsedProxy.searchParams.get("url") || "").trim();
      return nested ? buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(nested)}`) : buildApiUrl(clean);
    }
    const parsed = new URL(clean, window.location.origin);
    const pathname = String(parsed.pathname || "").toLowerCase();
    const hasVideoExt = /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(pathname);
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(String(parsed.hostname || ""));
    if (isStorageUrl || hasVideoExt) {
      return buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
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
    if (cleanStoragePath) {
      const staleStorageProxyUrl = buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(cleanStoragePath)}`);
      if (isMarkedStaleProxyMediaUrl(staleStorageProxyUrl) && clean) {
        const parsed = new URL(clean, window.location.origin);
        return buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
      }
      return resolveStaleAwareProxyMediaUrl(clean, cleanStoragePath, "media");
    }
    if (clean.startsWith("/api/assets/proxy-media?")) return buildApiUrl(clean);
    if (clean.startsWith("/api/assets/proxy-image?")) {
      const parsedProxy = new URL(buildApiUrl(clean), window.location.origin);
      const nested = String(parsedProxy.searchParams.get("url") || "").trim();
      return nested ? buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(nested)}`) : buildApiUrl(clean);
    }
    const parsed = new URL(clean, window.location.origin);
    const pathname = String(parsed.pathname || "").toLowerCase();
    const hasAudioExt = /\.(wav|mp3|ogg|m4a|flac)(?:$|\?)/i.test(pathname);
    const isStorageUrl = /googleapis\.com|firebasestorage\.app/i.test(String(parsed.hostname || ""));
    if (isStorageUrl || hasAudioExt) {
      return buildApiUrl(`/api/assets/proxy-media?url=${encodeURIComponent(parsed.toString())}`);
    }
    return clean;
  } catch (_) {
    return clean;
  }
}

const HOME_TIMELINE_MIN_CLIP_MS = 500;

function normalizeHomePanelMusicDuckingWhenGeminiPct(value, fallback = 60) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  if (raw >= 40 && raw <= 100) return raw;
  if (raw >= 0 && raw < 40) return Math.max(40, 100 - raw);
  return fallback;
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
    map.set(loopIndex, { loopIndex, trimInMs, trimOutMs });
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
    name: String(track.name || "Audio").trim() || "Audio",
    mimeType: String(track.mimeType || "audio/mpeg").trim() || "audio/mpeg",
    size: Math.max(0, Number(track.size || 0) || 0),
    durationSec: Math.max(0, Number(track.durationSec || 0) || 0),
    startOffsetMs,
    trimInMs,
    trimOutMs,
    localDataUrl: String(track.localDataUrl || "").trim(),
    downloadUrl: String(track.downloadUrl || "").trim(),
    storagePath: String(track.storagePath || "").trim(),
    updatedAt: String(track.updatedAt || "").trim(),
    model: String(track.model || "").trim(),
    prompt: String(track.prompt || "").trim(),
    durationMeasuredWith: String(track.durationMeasuredWith || "").trim().toLowerCase(),
    montageVolume: track.montageVolume !== undefined ? Math.max(0, Math.min(100, Number(track.montageVolume) || 0)) : 100,
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
  const panelVolume = Math.max(0, Math.min(100, Number(cfg?.montageVolume ?? 100) || 0));
  const panelDucking = normalizeHomePanelMusicDuckingWhenGeminiPct(cfg?.duckingWhenGeminiPct, 60);
  return sourceItems.map((item) => {
    const trackIndex = Math.max(0, Math.floor(Number(item?.trackIndex || 0) || 0));
    const loopIndex = Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0));
    const track = uploadedTracks[trackIndex] || null;
    const sourceUrl = String(resolveAudio(item?.sourceUrl || item?.downloadUrl || "", item?.storagePath || "") || "").trim();
    if (!sourceUrl) return null;
    const startOffsetMs = Math.max(0, Math.round(Number(item?.startOffsetMs ?? item?.startMs ?? 0) || 0));
    const rawEndOffsetMs = Math.round(Number(item?.endOffsetMs ?? item?.endMs ?? 0) || 0);
    const rawDurationMs = Math.round(Number(item?.durationMs || 0) || 0);
    const durationMs = Math.max(0, rawDurationMs || rawEndOffsetMs - startOffsetMs);
    const endOffsetMs = Math.max(startOffsetMs, rawEndOffsetMs || (startOffsetMs + durationMs));
    const mutedLoopIndexes = new Set(normalizeHomePanelMusicMutedLoopIndexes(track?.mutedLoopIndexes || []));
    return {
      ...item,
      sourceUrl,
      startOffsetMs,
      endOffsetMs,
      durationSec: Math.max(0, Number(item?.durationSec || durationMs / 1000) || 0),
      trimInMs: Math.max(0, Math.round(Number(item?.trimInMs || 0) || 0)),
      trimOutMs: Math.max(0, Math.round(Number(item?.trimOutMs || 0) || 0)),
      trackIndex,
      loopIndex,
      muted: item?.muted === true || mutedLoopIndexes.has(loopIndex),
      volume: item?.volume !== undefined
        ? Math.max(0, Math.min(100, Number(item.volume) || 0))
        : (track?.montageVolume !== undefined ? track.montageVolume : panelVolume),
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
    while (sceneCursor < sceneEntries.length && loopIndex < 120) {
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
      loop: false,
      loopIndex: 0
    });
    sceneCursor = endSceneCursor + 1;
  });
  return applyOverrides(segments);
}

function buildHomePanelMontageMusicConfig(session = null, options = {}) {
  const rawCfg = session?.panelMusicConfig || session?.session?.panelMusicConfig ||
    session?.panelMusicState || session?.session?.panelMusicState ||
    session?.podcastStudioUiState?.panelMusicState ||
    session?.podcastStudioUiState?.panelMusicConfig;
  const cfg = rawCfg ? JSON.parse(JSON.stringify(rawCfg)) : { sourceType: "none" };
  const normalized = {
    preset: ["ambient", "focus", "pulse"].includes(String(cfg?.preset || "").trim()) ? String(cfg.preset).trim() : "ambient",
    volume: Math.max(0, Math.min(100, Number(cfg?.volume ?? 22) || 22)),
    montageVolume: Math.max(0, Math.min(100, Number(cfg?.montageVolume ?? 100) || 0)),
    duckingWhenGeminiPct: normalizeHomePanelMusicDuckingWhenGeminiPct(cfg?.duckingWhenGeminiPct ?? cfg?.duckingPct, 60),
    stabilize: cfg?.stabilize === true || String(cfg?.stabilize || "").trim().toLowerCase() === "true",
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
      return {
        slotLabel: String(segment?.slotLabel || "").trim(),
        sourceUrl: String(resolveAudio(segment?.downloadUrl || "", segment?.storagePath || "") || "").trim(),
        startOffsetMs: Math.max(0, Number(segment?.startMs || 0) || 0),
        endOffsetMs: Math.max(0, Number(segment?.endMs || 0) || 0),
        loop: segment?.loop === true,
        durationSec: Math.max(0, Number(segment?.durationSec || 0) || 0),
        trimInMs: Math.max(0, Number(segment?.trimInMs || 0) || 0),
        trimOutMs: Math.max(0, Number(segment?.trimOutMs || 0) || 0),
        trackIndex,
        loopIndex,
        muted: mutedLoopIndexes.has(loopIndex),
        volume: track?.montageVolume !== undefined ? track.montageVolume : normalized.montageVolume,
        duckingWhenGeminiPct: track?.duckingWhenGeminiPct !== undefined ? track.duckingWhenGeminiPct : normalized.duckingWhenGeminiPct,
        stabilize: track?.stabilize !== undefined ? track.stabilize : normalized.stabilize
      };
    }).filter((segment) => segment.sourceUrl);
  const sourceUrl = (!uploadedMode && normalized.sourceType === "track")
    ? String(resolveAudio(activeTrack?.downloadUrl || activeTrack?.localDataUrl || "", activeTrack?.storagePath || "") || "").trim()
    : "";
  const sourceType = uploadedMode
    ? (sourceItems.length ? "track" : "none")
    : (normalized.sourceType === "track" && sourceUrl ? "track" : "none");
  return {
    sourceType,
    preset: normalized.preset,
    sourceUrl,
    sourceItems,
    volume: normalized.montageVolume,
    duckingWhenGeminiPct: normalized.duckingWhenGeminiPct,
    stabilize: normalized.stabilize,
    durationSec: Math.max(0, Number(activeTrack?.durationSec || 0) || 0),
    startOffsetMs: Math.max(0, Number(activeTrack?.startOffsetMs || 0) || 0),
    trimInMs: Math.max(0, Number(activeTrack?.trimInMs || 0) || 0),
    trimOutMs: Math.max(0, Number(activeTrack?.trimOutMs || 0) || 0),
    loopSettings: Array.isArray(activeTrack?.loopSettings)
      ? activeTrack.loopSettings.map((item) => ({
        loopIndex: Math.max(0, Math.floor(Number(item?.loopIndex || 0) || 0)),
        trimInMs: Math.max(0, Number(item?.trimInMs || 0) || 0),
        trimOutMs: Math.max(0, Number(item?.trimOutMs || 0) || 0)
      }))
      : [],
    mutedLoopIndexes: normalizeHomePanelMusicMutedLoopIndexes(activeTrack?.mutedLoopIndexes || []),
    enabled: sourceType !== "none" && (!!sourceUrl || sourceItems.length > 0)
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
    console.log(`[Playback:Resolution] ${key} -> Rate: ${finalRate.toFixed(2)} (Clip: ${clip ? 'Encontrado' : 'No encontrado'}, MapKeys: ${Object.keys(audioMap).length})`);
  }
  
  return finalRate;
}

function resolveTimelineClipMix(session = null, rowId = "") {
  if (!session) return { videoVolume: 1, voiceVolume: 1, backgroundVolume: 1 };
  const key = String(rowId || "").trim();
  const videoConfig = session.podcastVideoConfig || session.script?.podcastVideoConfig || {};
  
  // Obtener clips (pueden estar en varias rutas según el origen de la sesión)
  const clipMap = session.timelineClipMap 
    || videoConfig.timelineClipsByRowId 
    || session.podcastStudioUiState?.timelineClipsByRowId 
    || {};
    
  const clip = clipMap[key] || null;
  
  // Valores base por defecto
  const fallbackVeoPct = Math.max(0, Math.min(100, Number(videoConfig.montageDefaultVeoVolumePct ?? 100)));
  const fallbackGeminiPct = Math.max(0, Math.min(100, Number(videoConfig.montageDefaultGeminiVolumePct ?? 100)));
  
  // Overrides específicos del clip (seteados en el modal de duración/volumen del Studio)
  const veoOverride = clip?.veoVolumeOverridePct;
  const geminiOverride = clip?.geminiVolumeOverridePct;
  
  const veoPct = Number.isFinite(veoOverride) ? Math.max(0, Math.min(100, Math.round(veoOverride))) : fallbackVeoPct;
  const geminiPct = Number.isFinite(geminiOverride) ? Math.max(0, Math.min(100, Math.round(geminiOverride))) : fallbackGeminiPct;
  
  // Override de música de fondo (timelineSceneAudioMixByRowId)
  const backgroundOverride = videoConfig.timelineSceneAudioMixByRowId?.[key]?.backgroundMusicVolumePct;
  const backgroundPct = Number.isFinite(backgroundOverride) ? Math.max(0, Math.min(200, Math.round(backgroundOverride))) : 100;
  
  return {
    videoVolume: Math.max(0, Math.min(1, veoPct / 100)),
    voiceVolume: Math.max(0, Math.min(1, geminiPct / 100)),
    backgroundVolume: Math.max(0, Math.min(2, backgroundPct / 100))
  };
}

let cachedRuntimeEntries = null;
let cachedRuntimeEntriesKey = null;
let cachedVideoConfig = null;
let cachedVideoConfigSessionId = null;

const multimediaPlaybackDeps = {
  getTimelineTotalDurationMs: (s) => {
    const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(s);
    if (!entries.length) return 0;
    return Math.max(...entries.map(e => e.endMs));
  },
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

    let currentMs = 0;
    const entries = rows.map((row, index) => {
      const rowId = row.id || `row_${index}`;
      if (!row.id) row.id = rowId;
      let clip = clipMap[rowId];

      const sceneClip = videoMap[rowId];
      const audioClip = audioMap[rowId];
      const clipPlaybackRate = resolveDialogueAudioPlaybackRate(s, rowId);
      const effectiveAudioDurationMs = Math.round((Number(audioClip?.durationSec || 0) * 1000) / clipPlaybackRate);

      if (!sceneClip && !audioClip) return null;

      if (!clip) {
        const durationSec = Math.max(0.5, effectiveAudioDurationMs > 0 ? (effectiveAudioDurationMs / 1000) : Number(audioClip?.durationSec || 8));
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
        audioDurationMs: Math.round((Number(audioClip?.durationSec || 0) * 1000) / clipPlaybackRate),
        zIndex: Number(clip.zIndex || index + 1)
      };

      let rawDur = Number(clip.durationMs || clip.sourceDurationMs || 0);
      if (rawDur > 0 && rawDur < 100) rawDur *= 1000;

      if (rawDur <= 0) {
        rawDur = effectiveAudioDurationMs;
      }

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
      return entry;
    }).filter(Boolean);

    const finalEntries = entries.sort((a, b) => a.startMs - b.startMs);
    cachedRuntimeEntries = finalEntries;
    cachedRuntimeEntriesKey = cacheKey;
    return finalEntries;
  },
  resolveFirebaseStorageUrl: async (gsPath) => {
    if (!gsPath) return "";
    try {
      const proxyUrl = buildApiUrl(`/api/assets/proxy-media?storagePath=${encodeURIComponent(gsPath)}`);
      if (proxyUrl) {
        return proxyUrl;
      }
      return gsPath;
    } catch (e) {
      return gsPath;
    }
  },
  setPodcastStageVideoSourceForElement: async (el, url, options = {}) => {
    if (!el || !url) return false;
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return false;
    const loadToken = ++homeStageVideoLoadTokenSeq;
    homeStageVideoLoadTokensByEl.set(el, loadToken);

    if (String(el.dataset.src || "").trim() === cleanUrl && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      el.hidden = options.keepHidden === true;
      return true;
    }

    let preferredSource = "";
    try {
      preferredSource = multimediaPlaybackController.getBlobUrlSync(cleanUrl) || "";
      if (!preferredSource) {
        preferredSource = await multimediaPlaybackController.getBlobUrl(cleanUrl);
      }
    } catch (_) {
      preferredSource = "";
    }
    preferredSource = String(preferredSource || cleanUrl).trim();

    try {
      const sourceUrl = new URL(preferredSource, window.location.origin);
      if (sourceUrl.origin === window.location.origin) {
        el.removeAttribute("crossorigin");
      } else {
        el.crossOrigin = "anonymous";
      }
    } catch (_) {
      el.removeAttribute("crossorigin");
    }

    return new Promise((resolve) => {
      el.dataset.src = cleanUrl;
      el.src = preferredSource;
      el.hidden = options.keepHidden === true;
      el.preload = "auto";
      try { el.load(); } catch (_) { }

      let hasResolved = false;
      const cleanup = () => {
        el.onloadeddata = null;
        el.oncanplay = null;
        el.onerror = null;
      };
      const onDone = (ready = true) => {
        if (hasResolved) return;
        hasResolved = true;
        cleanup();
        const stillExpected = (
          homeStageVideoLoadTokensByEl.get(el) === loadToken
          && String(el.dataset.src || "").trim() === cleanUrl
        );
        const hasData = el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        resolve(Boolean(ready) && stillExpected && hasData);
      };

      el.onloadeddata = () => onDone(true);
      el.oncanplay = () => onDone(true);
      el.onerror = () => onDone(false);

      setTimeout(() => onDone(true), 3500);
    });
  },
  setActiveStageVideoSlot: (slot) => { homePlaybackState.stageVideoSlot = slot; },
  podcastVideoState: homePlaybackState,
  isDashboard: true,
  getPlaybackSpeed: () => Number(currentMultimediaSession?.podcastVideoConfig?.playbackSpeed || 1),
  getPodcastVideoConfig: (s) => {
    if (!s) return {};
    if (cachedVideoConfig && cachedVideoConfigSessionId === s.id) {
      return cachedVideoConfig;
    }

    if (!s.podcastVideoConfig) {
      s.podcastVideoConfig = s.podcastStudioUiState?.podcastVideoConfig || {};
    }
    const cfg = JSON.parse(JSON.stringify(s.podcastVideoConfig));
    const normalizeSharedTrack = window.normalizeOnScreenTextTrackSettings || ((value) => value || {});
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
      cfg.geminiDialogueTrack = { enabled: true, segments };
    }

    if (!cfg.onScreenTextTrack) {
      cfg.onScreenTextTrack = { enabled: true, showTrack: true, stylePreset: 'glow' };
    }
    cfg.onScreenTextTrack = normalizeSharedTrack(cfg.onScreenTextTrack);

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

    if (!cfg.timelineOnScreenTextClipsByRowId) {
      const textClips = {};
      const entries = multimediaPlaybackDeps.buildTimelineRuntimeEntries(s);
      entries.forEach(entry => {
        const allRows = extractDashboardSessionRows(s);
        const row = allRows.find(r => r.id === entry.rowId);
        const dialogueText = row?.onScreenText || row?.text || "";
        const savedClip = existingOnScreenTextClips?.[entry.rowId] || null;
        if (dialogueText) {
          const clip = normalizeSharedClipItem({
            rowId: entry.rowId,
            startMs: entry.startMs,
            sourceDurationMs: entry.durationMs,
            trimInMs: 0,
            trimOutMs: entry.durationMs,
            hidden: savedClip?.hidden === true,
            autoHidden: savedClip?.autoHidden === true,
            zIndex: Math.max(1, Number(entry.zIndex || entry.index || 1) || 1)
          }, entry.rowId);
          if (clip) textClips[entry.rowId] = clip;
        }
      });
      cfg.timelineOnScreenTextClipsByRowId = normalizeSharedClipMap(textClips);
    } else if (existingOnScreenTextClips && Object.keys(existingOnScreenTextClips).length) {
      cfg.timelineOnScreenTextClipsByRowId = normalizeSharedClipMap(Object.fromEntries(
        Object.entries(cfg.timelineOnScreenTextClipsByRowId || {}).map(([rowId, clip]) => {
          const savedClip = existingOnScreenTextClips?.[rowId] || null;
          const normalized = normalizeSharedClipItem(savedClip ? {
            ...clip,
            hidden: savedClip?.hidden === true,
            autoHidden: savedClip?.autoHidden === true
          } : clip, rowId);
          return [rowId, normalized];
        })
      ));
    } else {
      cfg.timelineOnScreenTextClipsByRowId = normalizeSharedClipMap(cfg.timelineOnScreenTextClipsByRowId || {});
    }
    if (!cfg.timelineOnScreenTextLayoutByRowId && existingOnScreenTextLayouts && Object.keys(existingOnScreenTextLayouts).length) {
      cfg.timelineOnScreenTextLayoutByRowId = JSON.parse(JSON.stringify(existingOnScreenTextLayouts));
    } else {
      cfg.timelineOnScreenTextLayoutByRowId = normalizeSharedLayoutMap(cfg.timelineOnScreenTextLayoutByRowId || {});
    }

    cachedVideoConfig = cfg;
    cachedVideoConfigSessionId = s.id;
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

          const scriptEl = document.getElementById("infoSceneScript");
          const descEl = document.getElementById("infoSceneDesc");
          const ostEl = document.getElementById("infoSceneOST");
          const visualEl = document.getElementById("infoSceneVisual");
          const timeEl = document.getElementById("infoSceneTime");
          const proposalTextarea = document.getElementById("infoSceneProposalText");

          // Guardar el ID actual para el guardado
          window._currentActiveRowId = activeEntry.rowId;

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

          // Propuesta Pendiente (Aparte)
          const activeProposalGroup = document.getElementById("infoSceneActiveProposalGroup");
          const activeProposalEl = document.getElementById("infoSceneActiveProposal");
          const displayedProposal = resolveDashboardDisplayedVisualProposal(row);
          if (activeProposalGroup && activeProposalEl) {
            const activeProposalBadge = activeProposalGroup.querySelector(".info-label");
            if (displayedProposal) {
              activeProposalGroup.style.display = "block";
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
              activeProposalGroup.style.display = "none";
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
              if (proposalsGroup) proposalsGroup.style.display = "block";
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
  markStaleProxyMediaUrl,
  ensureTimelineClipsByRowId: (s) => s?.timelineClipMap || s?.podcastStudioUiState?.timelineClipsByRowId || {},
  resolveTimelineClipMix: (s, rowId) => resolveTimelineClipMix(s, rowId),
  getOnScreenTextClipEffectiveDurationMs: (c) => window.getOnScreenTextClipEffectiveDurationMs
    ? window.getOnScreenTextClipEffectiveDurationMs(c)
    : (c?.durationMs || 0),
  normalizeOnScreenTextTrackSettings: (s) => window.normalizeOnScreenTextTrackSettings ? window.normalizeOnScreenTextTrackSettings(s) : { enabled: true, showTrack: true },
  getOnScreenTextClipText: (row) => window.getOnScreenTextClipText
    ? window.getOnScreenTextClipText(row)
    : (row.onScreenText || row.text || ""),
  resolveOnScreenTextRenderMetrics: (s, o) => window.resolveOnScreenTextRenderMetrics ? window.resolveOnScreenTextRenderMetrics(s, o) : {},
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
  setPodcastVideoStatus: (status) => {
    console.log(`[Player] Status: ${status}`);
  },
  getPlaybackSpeed: () => {
    const s = currentMultimediaSession;
    const cfg = s?.podcastVideoConfig || s?.session?.podcastVideoConfig || {};
    return Math.max(0.5, Math.min(2.0, Number(cfg.playbackSpeed || 1.0)));
  }
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
    if (multimediaPlayerUnsubscribe) {
      multimediaPlayerUnsubscribe();
      multimediaPlayerUnsubscribe = null;
    }
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
      const effectivePanelMusicConfig = multimediaPlaybackDeps.getPanelMontageMusicConfig(session);

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
        panelMusicConfig: {
          ...(session.panelMusicConfig || session.podcastStudioUiState?.panelMusicConfig || {}),
          ...effectivePanelMusicConfig
        }
      };



      const result = await authFetchJson("/podcaster/montage/export", {
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

  if (multimediaPlayerUnsubscribe) {
    multimediaPlayerUnsubscribe();
    multimediaPlayerUnsubscribe = null;
  }

  const modal = document.getElementById("modalMultimediaPlayer");
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
        const sessionData = data?.session && typeof data.session === "object" ? data.session : data;
        const incomingSession = sessionData && typeof sessionData === "object" ? sessionData : null;
        if (!incomingSession) return;
        incomingSession.id = String(incomingSession.id || sessionId).trim() || sessionId;
        if (data.publicar === true) incomingSession.publicar = true;
        if (data.archived === true) incomingSession.archived = true;
        
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
           console.log("[Dashboard] Cambio detectado remoto:", { incomingUpdateAt, currentUpdateAt });
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
            podcastVideoConfig: {
              ...(currentMultimediaSession.podcastVideoConfig || {}),
              ...(incomingSession?.podcastVideoConfig || {})
            },
            script: {
              ...(currentMultimediaSession.script || {}),
              ...(incomingSession?.script || {}),
              rows: updatedRows
            }
          };

          if (!modal.classList.contains("hidden")) {
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
          console.log("[Dashboard] Iniciando descarga de actualización manual para sesión:", sessionId);
          hidePlaybackUpdateBadge();
          
          try {
            // Forzar recarga completa de la sesión actual desde Firebase
            const freshSession = await loadFullDashboardPodcasterSession(sessionId, currentMultimediaSession);
            if (freshSession) {
              console.log("[Dashboard] Sesión fresca cargada con éxito. Sincronizando controlador...");
              currentMultimediaSession = freshSession;
              
              // Importante: invalidar caches de filas que pudieran haber cambiado su audio
              const rows = extractDashboardSessionRows(freshSession);
              rows.forEach(r => multimediaPlaybackController.invalidateRowAudioCache(r.id));
              
              multimediaPlaybackController.sync(currentMultimediaSession);
              multimediaPlaybackDeps.updatePodcastVideoTransportUi();
              console.log("[Dashboard] Sincronización completada.");
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
    if (sidePanel) sidePanel.classList.remove("is-open");
    if (btnToggle) btnToggle.classList.remove("active");

    // Forzar un primer renderizado de la UI de transporte (que incluye el monitor de escena)
    multimediaPlaybackDeps.updatePodcastVideoTransportUi();

    multimediaPlaybackController.sync(session);
    multimediaPlaybackController.stop();

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
          const result = await mutateDashboardProposalSession(window._currentActiveRowId, (rows, rowIndex) => {
            rows[rowIndex].visualNotesProposal = proposalText;
            if (!Array.isArray(rows[rowIndex].visualNotesProposals)) {
              rows[rowIndex].visualNotesProposals = [];
            }
            if (!rows[rowIndex].visualNotesProposals.includes(proposalText)) {
              rows[rowIndex].visualNotesProposals.push(proposalText);
            }
            return true;
          });
          if (!result.ok) {
            console.warn("[Dashboard] Fallo al localizar fila. Buscábamos:", window._currentActiveRowId);
            alert("No se encontró la escena actual en el documento original. Por favor, asegúrate de que el ID coincide.");
            return;
          }
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
    const effectivePanelMusicConfig = multimediaPlaybackDeps.getPanelMontageMusicConfig(currentMultimediaSession);

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
      backgroundMusic: effectivePanelMusicConfig || null,
      audioTimeline: {
        enabled: true,
        backgroundSegments: effectivePanelMusicConfig?.sourceItems || []
      }
    };



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


  items.forEach(item => {
    const card = document.createElement("div");
    // Clase base según el tipo
    let accentClass = "workbench-item-lectura";
    if (type === "unidad") accentClass = "workbench-item-unidad";
    if (type === "download") accentClass = "workbench-item-download";
    if (type === "aprende") accentClass = "workbench-item-aprende";
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

    if (type === 'multimedia' || type === 'podcast') {
      const session = item.session || item;
      const ui = session?.podcastStudioUiState || {};
      const clipMap = session?.timelineClipMap || ui.timelineClipsByRowId || {};

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

      card.className = `workbench-item workbench-item-multimedia accordion-item`;
      card.innerHTML = `
        <div class="multimedia-accordion-header">
          <div class="workbench-item-preview">
            ${previewUrl ? `<video src="${previewUrl}" muted playsinline></video>` : `<i class="fas fa-video" style="color: #475569; font-size: 16px;"></i>`}
          </div>
          <div class="workbench-item-title">
            ${escapeHtml(displayTitle)}
            ${hasPending ? `<span class="proposal-badge is-pending" style="margin-left: 10px; vertical-align: middle;">PROPUESTA</span>` : ""}
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
